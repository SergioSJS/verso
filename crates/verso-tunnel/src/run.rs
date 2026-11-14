// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Running `cloudflared`: the command line, reading its `stderr`, and a
//! child that never outlives the app (ADR 0117 D3 item 6).
//!
//! What the spike found and this follows (`tunnel-spike/RESULTS.md`):
//! - The quick link's URL is printed **before** the tunnel is connected; it
//!   is up at `Registered tunnel connection` (verdict 1). On a network that
//!   drops UDP, QUIC never connects though `cloudflared` says it will fall
//!   back; so a first try with its default and, without a registered
//!   connection [`Timing::quic`] after the URL, a second with
//!   `--protocol http2` (which connected in 7 s where QUIC never did).
//! - The URL is `https://[a-z0-9-]+\.trycloudflare\.com` on a line after
//!   "Your quick Tunnel has been created" (S0.3): the earlier "Requesting
//!   new quick Tunnel on trycloudflare.com..." must not match.
//! - The child outlives a killed parent on macOS and Linux (S0.8): it is
//!   stopped by hand on every way out ([`Tunnel`]'s `Drop` too), and on
//!   Unix a watcher process ends it when the app's process is gone (a
//!   crash, a `kill -9`), the `prctl`-free fallback; on Windows a Job
//!   Object kills it when the app's handle closes, a crash included.

use std::ffi::OsString;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

/// How long each wait lasts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Timing {
    /// From the start to the quick link's URL.
    pub url: Duration,
    /// From the URL (or, for an own address, the start) to a registered
    /// connection with `cloudflared`'s default protocol (QUIC).
    pub quic: Duration,
    /// The same, with `--protocol http2`.
    pub http2: Duration,
    /// From a polite stop (`SIGTERM`) to a forced one.
    pub grace: Duration,
    /// How often the Unix watcher looks for the app's process.
    pub watch_every: Duration,
}

impl Default for Timing {
    fn default() -> Self {
        Self {
            url: Duration::from_secs(30),
            quic: Duration::from_secs(10),
            http2: Duration::from_secs(30),
            grace: Duration::from_secs(2),
            watch_every: Duration::from_secs(2),
        }
    }
}

/// The quick link's command line (ADR 0117 D3 items 3 and 5): the loopback
/// listener, no self-update (the version is Verso's pin).
#[must_use]
pub fn quick_args(port: u16, http2: bool) -> Vec<OsString> {
    let mut args: Vec<OsString> = vec!["tunnel".into(), "--no-autoupdate".into()];
    if http2 {
        args.push("--protocol".into());
        args.push("http2".into());
    }
    args.push("--url".into());
    args.push(format!("http://127.0.0.1:{port}").into());
    args
}

/// What a line of `cloudflared`'s `stderr` says that matters here.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Seen {
    /// "Your quick Tunnel has been created!": the URL is on a line after it.
    Created,
    /// The quick link's URL (`https://<name>.trycloudflare.com`).
    Url(String),
    /// "Registered tunnel connection", with its `protocol=`.
    Registered(String),
    /// "Register tunnel error from server side": Cloudflare refused the
    /// tunnel itself (a token for no tunnel of the account, a tunnel
    /// deleted — the spike of 2026-11-13, `RESULTS-R5.md`), with its
    /// `error=` words.
    Refused(String),
    /// An `ERR` line, with every address in it taken out.
    Error(String),
    /// `stderr` closed: the process ended.
    Ended,
}

/// Read one line; `created` says whether the "created" line was seen (the
/// URL is believed only after it).
#[must_use]
pub fn parse_line(line: &str, created: bool) -> Option<Seen> {
    if line.contains("Your quick Tunnel has been created") {
        return Some(Seen::Created);
    }
    if line.contains("Registered tunnel connection") {
        let protocol = line
            .split_whitespace()
            .find_map(|w| w.strip_prefix("protocol="))
            .unwrap_or("")
            .to_owned();
        return Some(Seen::Registered(protocol));
    }
    if created && let Some(url) = quick_url(line) {
        return Some(Seen::Url(url));
    }
    if line.contains("Register tunnel error from server side") {
        let words = line
            .split_once("error=\"")
            .and_then(|(_, rest)| rest.split_once('"'))
            .map_or("", |(words, _)| words);
        return Some(Seen::Refused(redact(words)));
    }
    if line.contains(" ERR ") {
        return Some(Seen::Error(redact(line)));
    }
    None
}

/// The first `https://[a-z0-9-]+\.trycloudflare\.com` in `line`, the name
/// ending there (not `….trycloudflare.com.example`), never Cloudflare's
/// own `api.`.
#[must_use]
pub fn quick_url(line: &str) -> Option<String> {
    const SUFFIX: &str = ".trycloudflare.com";
    let mut rest = line;
    while let Some(at) = rest.find("https://") {
        let after = &rest[at + "https://".len()..];
        let name_len = after
            .bytes()
            .take_while(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
            .count();
        let name = &after[..name_len];
        let tail = &after[name_len..];
        if name_len > 0 && name != "api" && tail.starts_with(SUFFIX) {
            let next = tail[SUFFIX.len()..].bytes().next();
            let ends = !next.is_some_and(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-');
            if ends {
                return Some(format!("https://{name}{SUFFIX}"));
            }
        }
        rest = after;
    }
    None
}

/// A line with every web address and every `trycloudflare.com` name taken
/// out: what may reach the app's log (ADR 0117 D3 item 8, "the logs hold no
/// link").
#[must_use]
pub fn redact(line: &str) -> String {
    let words: Vec<&str> = line
        .split(' ')
        .map(|w| {
            if w.contains("://")
                || w.contains("trycloudflare.com")
                || w.contains("cfargotunnel.com")
            {
                "<address>"
            } else {
                w
            }
        })
        .collect();
    words.join(" ")
}

/// A running `cloudflared`, stopped when this is dropped.
pub struct Tunnel {
    child: Child,
    pid: u32,
    grace: Duration,
    done: Option<ExitStatus>,
    /// Unix: the watcher that ends the child once the app's process is gone.
    #[cfg(unix)]
    watch: Option<Child>,
    /// Windows: the child's job, which kills it when its last handle — the
    /// app's — closes (ADR 0117 D3 item 6).
    #[cfg(windows)]
    _job: Option<win32job::Job>,
}

impl Tunnel {
    /// The child's process id (for the log).
    #[must_use]
    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// Stop it: `SIGTERM` on Unix (it closes its connections in 0.3 s,
    /// S0.8), a kill after the grace; Windows kills at once. Waits for it,
    /// and says how it ended. Again: what it said the first time.
    pub fn stop(&mut self) -> Option<ExitStatus> {
        if self.done.is_none() {
            self.done = self.end();
        }
        #[cfg(unix)]
        if let Some(mut w) = self.watch.take() {
            let _ = w.kill();
            let _ = w.wait();
        }
        self.done
    }

    /// How it ended, once it ended by itself (its `stderr` closed).
    pub fn reap(&mut self) -> Option<ExitStatus> {
        let until = Instant::now() + self.grace;
        while Instant::now() < until {
            if let Ok(Some(status)) = self.child.try_wait() {
                self.done = Some(status);
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        self.stop()
    }

    fn end(&mut self) -> Option<ExitStatus> {
        if let Ok(Some(status)) = self.child.try_wait() {
            return Some(status);
        }
        #[cfg(unix)]
        if let Ok(pid) = i32::try_from(self.pid) {
            let _ = nix::sys::signal::kill(
                nix::unistd::Pid::from_raw(pid),
                nix::sys::signal::Signal::SIGTERM,
            );
            let until = Instant::now() + self.grace;
            while Instant::now() < until {
                if let Ok(Some(status)) = self.child.try_wait() {
                    return Some(status);
                }
                std::thread::sleep(Duration::from_millis(20));
            }
        }
        let _ = self.child.kill();
        self.child.wait().ok()
    }
}

impl Drop for Tunnel {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Start `program` with `args`, its `stderr` read line by line into the
/// receiver (ending with [`Seen::Ended`]).
pub fn spawn(
    program: &Path,
    args: &[OsString],
    timing: &Timing,
) -> Result<(Tunnel, Receiver<Seen>), String> {
    spawn_with(program, args, timing, None)
}

/// The variables `cloudflared` reads a tunnel's token from: never passed
/// on from the host's own environment, so that a quick link or an own
/// address by its credentials is never another tunnel's run.
pub const TOKEN_VARIABLES: [&str; 2] = ["TUNNEL_TOKEN", "TUNNEL_TOKEN_FILE"];

/// [`spawn`], with a tunnel's `token` in the child's environment
/// (`TUNNEL_TOKEN`): out of the command line, which any user of the
/// machine may read, and out of every file.
pub fn spawn_with(
    program: &Path,
    args: &[OsString],
    timing: &Timing,
    token: Option<&str>,
) -> Result<(Tunnel, Receiver<Seen>), String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    for name in TOKEN_VARIABLES {
        command.env_remove(name);
    }
    if let Some(token) = token {
        command.env("TUNNEL_TOKEN", token);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window beside the app.
        command.creation_flags(0x0800_0000);
    }
    let mut child = start(&mut command).map_err(|e| format!("cloudflared did not start: {e}"))?;
    let pid = child.id();
    let stderr = child.stderr.take();
    #[cfg(windows)]
    let job = job_for(&child);
    #[cfg(unix)]
    let watch = match watcher(std::process::id(), pid, timing.watch_every) {
        Ok(w) => Some(w),
        Err(e) => {
            crate::log::write(
                "WARN",
                "host",
                &format!("the internet link: no watcher for cloudflared: {e}"),
            );
            None
        }
    };
    let tunnel = Tunnel {
        child,
        pid,
        grace: timing.grace,
        done: None,
        #[cfg(unix)]
        watch,
        #[cfg(windows)]
        _job: job,
    };
    let (tx, rx) = mpsc::channel();
    if let Some(stderr) = stderr {
        std::thread::Builder::new()
            .name("cloudflared-stderr".to_owned())
            .spawn(move || read_lines(stderr, &tx))
            .map_err(|e| format!("cloudflared: {e}"))?;
    }
    Ok((tunnel, rx))
}

fn read_lines(stderr: impl Read, tx: &mpsc::Sender<Seen>) {
    let mut reader = BufReader::new(stderr);
    let mut created = false;
    let mut line = Vec::new();
    loop {
        line.clear();
        match reader.read_until(b'\n', &mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let text = String::from_utf8_lossy(&line);
        let text = text.trim_end_matches(['\r', '\n']);
        if let Some(seen) = parse_line(text, created) {
            if seen == Seen::Created {
                created = true;
            }
            // No one listening is no reason to stop: the pipe is drained
            // to the end, so the child never blocks on a write.
            let _ = tx.send(seen);
        }
    }
    let _ = tx.send(Seen::Ended);
}

/// Spawn, again a few times while Linux says the file is still being
/// written ("text file busy": a test's script, just made).
fn start(command: &mut Command) -> std::io::Result<Child> {
    #[cfg(unix)]
    for _ in 0..10 {
        match command.spawn() {
            Err(e) if e.raw_os_error() == Some(26) => {
                std::thread::sleep(Duration::from_millis(50));
            }
            other => return other,
        }
    }
    command.spawn()
}

/// Unix: a small `sh` that waits while both the app (`app`) and the child
/// (`child`) live, and ends the child with `SIGTERM` if the app went first.
/// It stops by itself when the child ends; [`Tunnel::stop`] ends it too.
#[cfg(unix)]
pub fn watcher(app: u32, child: u32, every: Duration) -> std::io::Result<Child> {
    let script = "while kill -0 \"$1\" 2>/dev/null && kill -0 \"$2\" 2>/dev/null; do sleep \"$3\"; done; \
                  kill -0 \"$1\" 2>/dev/null || kill -TERM \"$2\" 2>/dev/null";
    let seconds = format!("{:.1}", every.as_secs_f64().max(0.1));
    // Android's shell is not at /bin/sh.
    let shell = if cfg!(target_os = "android") {
        "/system/bin/sh"
    } else {
        "/bin/sh"
    };
    start(
        Command::new(shell)
            .arg("-c")
            .arg(script)
            .arg("verso-link-watch")
            .arg(app.to_string())
            .arg(child.to_string())
            .arg(seconds)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null()),
    )
}

/// Windows: the child in a job that kills it when the job's last handle
/// closes — [`Tunnel`]'s drop, or the app's end, a crash included. The safe
/// wrapper the terminal already uses (`win32job`, `pty.rs`); no `unsafe`.
#[cfg(windows)]
fn job_for(child: &Child) -> Option<win32job::Job> {
    use std::os::windows::io::AsRawHandle;
    let mut limits = win32job::ExtendedLimitInfo::new();
    limits.limit_kill_on_job_close();
    let job = win32job::Job::create_with_limit_info(&limits).ok()?;
    job.assign_process(child.as_raw_handle() as isize).ok()?;
    Some(job)
}

/// A tunnel that is up.
pub struct Up {
    pub tunnel: Tunnel,
    /// The quick link's URL; `None` for an own address (its origin is the
    /// person's hostname).
    pub url: Option<String>,
    /// The protocol of the registered connection (`quic`, `http2`).
    pub protocol: String,
    /// The rest of `stderr`, until [`Seen::Ended`].
    pub rest: Receiver<Seen>,
}

enum Miss {
    /// Up to the wait, no registered connection: try the other protocol.
    NotRegistered,
    Failed(String),
}

/// What a run by a tunnel's token adds ([`up_with`]).
#[derive(Debug, Clone, Copy, Default)]
pub struct Extra<'a> {
    /// The tunnel's token, for the child's environment ([`spawn_with`]).
    pub token: Option<&'a str>,
    /// Cloudflare refusing the tunnel ([`Seen::Refused`]) ends the start
    /// at once, in its words, instead of waiting for both protocols:
    /// `cloudflared` itself retries a refused token for ever.
    pub refusal_ends: bool,
}

/// Start the tunnel and return once it has a registered connection: with
/// QUIC first and, failing that, `--protocol http2`. `args(http2)` builds
/// the command line; `quick` waits for a quick link's URL first. `cancel`
/// stops the wait (the child is stopped).
pub fn up(
    program: &Path,
    args: &dyn Fn(bool) -> Vec<OsString>,
    quick: bool,
    timing: &Timing,
    cancel: &AtomicBool,
) -> Result<Up, String> {
    run_up(program, args, quick, &Extra::default(), timing, cancel)
}

/// [`up`] for an own address by a tunnel's token (never a quick link).
pub fn up_with(
    program: &Path,
    args: &dyn Fn(bool) -> Vec<OsString>,
    extra: &Extra<'_>,
    timing: &Timing,
    cancel: &AtomicBool,
) -> Result<Up, String> {
    run_up(program, args, false, extra, timing, cancel)
}

fn run_up(
    program: &Path,
    args: &dyn Fn(bool) -> Vec<OsString>,
    quick: bool,
    extra: &Extra<'_>,
    timing: &Timing,
    cancel: &AtomicBool,
) -> Result<Up, String> {
    let attempt = |args: &[OsString], wait: Duration| {
        attempt(program, args, quick, wait, extra, timing, cancel)
    };
    match attempt(&args(false), timing.quic) {
        Ok(up) => return Ok(up),
        Err(Miss::Failed(why)) => return Err(why),
        Err(Miss::NotRegistered) => crate::log::write(
            "INFO",
            "host",
            &format!(
                "the internet link: no connection over QUIC in {} s, trying HTTP/2",
                timing.quic.as_secs()
            ),
        ),
    }
    match attempt(&args(true), timing.http2) {
        Ok(up) => Ok(up),
        Err(Miss::Failed(why)) => Err(why),
        Err(Miss::NotRegistered) => Err(
            "cloudflared reached no Cloudflare server, over QUIC or HTTP/2: \
             this network may block it"
                .to_owned(),
        ),
    }
}

fn attempt(
    program: &Path,
    args: &[OsString],
    quick: bool,
    register_wait: Duration,
    extra: &Extra<'_>,
    timing: &Timing,
    cancel: &AtomicBool,
) -> Result<Up, Miss> {
    let (tunnel, rx) = spawn_with(program, args, timing, extra.token).map_err(Miss::Failed)?;
    let started = Instant::now();
    let mut url: Option<String> = None;
    let mut url_at: Option<Instant> = None;
    let mut protocol: Option<String> = None;
    let mut last_error: Option<String> = None;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(Miss::Failed("the link was stopped".to_owned()));
        }
        if let Some(p) = &protocol
            && (!quick || url.is_some())
        {
            return Ok(Up {
                tunnel,
                url,
                protocol: p.clone(),
                rest: rx,
            });
        }
        let now = Instant::now();
        if quick && url.is_none() && now >= started + timing.url {
            return Err(Miss::Failed(
                "cloudflared gave no quick link in time: Cloudflare may be unreachable".to_owned(),
            ));
        }
        let from = if quick { url_at } else { Some(started) };
        if from.is_some_and(|t| now >= t + register_wait) {
            return Err(Miss::NotRegistered);
        }
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(Seen::Url(u)) if url.is_none() => {
                url = Some(u);
                url_at = Some(Instant::now());
            }
            Ok(Seen::Registered(p)) => protocol = Some(p),
            Ok(Seen::Refused(words)) if extra.refusal_ends => {
                return Err(Miss::Failed(format!(
                    "Cloudflare refused the tunnel: {words} (is the token the one of a tunnel of your account, made in Cloudflare's dashboard?)"
                )));
            }
            Ok(Seen::Refused(e) | Seen::Error(e)) => last_error = Some(e),
            Ok(Seen::Ended) | Err(RecvTimeoutError::Disconnected) => {
                let why = last_error.map_or_else(String::new, |e| format!(": {e}"));
                return Err(Miss::Failed(format!(
                    "cloudflared ended before the link was up{why}"
                )));
            }
            Ok(_) | Err(RecvTimeoutError::Timeout) => {}
        }
    }
}

/// The words of a short run (`--version`, an own address's steps).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Step {
    /// The exit status said success.
    pub ok: bool,
    /// `stdout` then `stderr`, as text.
    pub text: String,
}

/// Run `program` with `args` to its end, both outputs read; stopped and
/// refused after `timeout`.
pub fn run_step(program: &Path, args: &[OsString], timeout: Duration) -> Result<Step, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = start(&mut command).map_err(|e| format!("cloudflared did not start: {e}"))?;
    let out = child.stdout.take().map(drain);
    let err = child.stderr.take().map(drain);
    let until = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < until => std::thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "cloudflared did not finish in {} s",
                    timeout.as_secs()
                ));
            }
            Err(e) => return Err(format!("cloudflared: {e}")),
        }
    };
    let mut text = out.and_then(|h| h.join().ok()).unwrap_or_default();
    text.push_str(&err.and_then(|h| h.join().ok()).unwrap_or_default());
    Ok(Step {
        ok: status.success(),
        text,
    })
}

fn drain(mut from: impl Read + Send + 'static) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = from.read_to_end(&mut bytes);
        String::from_utf8_lossy(&bytes).into_owned()
    })
}

/// The binary runs and is the pinned version (before its first use): what
/// a Gatekeeper or SmartScreen refusal would show first.
pub fn version_check(program: &Path, version: &str) -> Result<(), String> {
    let step = run_step(program, &["--version".into()], Duration::from_secs(30))?;
    if step.ok && step.text.contains(version) {
        Ok(())
    } else {
        Err(format!(
            "the downloaded cloudflared does not run as version {version}"
        ))
    }
}
