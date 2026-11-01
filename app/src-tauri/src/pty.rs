// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A shell of this computer on a pseudo-terminal (ADR 0115 items 2, 3, 8
//! and 13): `portable-pty` — `openpty` on macOS and Linux, ConPTY on
//! Windows — with no Tauri here, so the tests drive it as the commands of
//! `terminal.rs` do.
//!
//! The shell is the person's own program, started as their own terminal
//! starts it, and the one program this module starts (item 19): on macOS
//! and Linux the login shell (`$SHELL`, or the password database's when it
//! is unset) as a login shell on a terminal — `-zsh` as its name, as
//! `login` and Terminal.app start it, which is what `-l` asks for, and
//! interactive because its input is a terminal, so `/etc/zprofile`,
//! `~/.zprofile` and `~/.zshrc` build the `PATH` where `claude`, `gemini`
//! and `codex` live; on Windows PowerShell or the Command Prompt (Q7).
//! Nothing of the folder is read or written here (rule 5): its directory is
//! handed to the operating system as the shell's working directory.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize};
use verso_contract::{AiCli, TerminalOutput, TerminalShell, TerminalSize};
use verso_service::lock;

/// What a terminal keeps of its output, for a window that reloads and
/// finds it again (Q6 decided 2026-10-31): the last 256 KiB.
pub(crate) const KEPT: usize = 256 * 1024;
/// The most one read hands the window at once.
const CHUNK: usize = 64 * 1024;
/// How long a hung-up shell has to go before it is killed.
#[cfg(unix)]
const GRACE: Duration = Duration::from_millis(800);
/// The highest process id the sweep of a closed terminal's session asks
/// about: the system's own bound (`PID_MAX_LIMIT` on 64-bit Linux, macOS's
/// `PID_MAX`).
#[cfg(target_os = "linux")]
const PID_MAX: i32 = 4_194_304;
#[cfg(all(unix, not(target_os = "linux")))]
const PID_MAX: i32 = 99_999;

/// Where a terminal's output goes: false when the window is gone (a
/// reload), and the output is only kept until a window finds it again.
pub(crate) type Sink = Box<dyn FnMut(TerminalOutput) -> bool + Send>;

/// How to start a shell.
pub(crate) struct Start {
    /// The working directory; none is the person's home directory.
    pub dir: Option<PathBuf>,
    pub size: TerminalSize,
    /// Windows only: which shell (Q7).
    pub shell: TerminalShell,
    /// `LANG` when the app was started without one (a GUI app on macOS):
    /// the system's language, as the window has it, `pt_BR.UTF-8`.
    pub lang: Option<String>,
    /// A line typed in once the shell starts: an AI tool's command (item 14).
    pub typed: Option<String>,
}

/// The output side, under one lock: what is kept, the bytes of a character
/// not yet whole, and where it goes.
struct Out {
    kept: VecDeque<u8>,
    tail: Vec<u8>,
    sink: Option<Sink>,
    ended: Option<Option<u32>>,
}

/// One shell on its pseudo-terminal.
pub(crate) struct Pty {
    out: Mutex<Out>,
    /// The window is behind (item 8): the reader waits.
    behind: Mutex<bool>,
    wake: Condvar,
    input: Mutex<Option<mpsc::Sender<Vec<u8>>>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    /// The shell's process id: on Unix its process group and its session.
    #[cfg(any(unix, test))]
    pid: Option<u32>,
    alive: AtomicBool,
    /// Windows: the shell's process tree, killed when the job closes — the
    /// terminal's end, or the host's, a crash included (item 13; ADR 0111
    /// item 6).
    #[cfg(windows)]
    job: Mutex<Option<win32job::Job>>,
    /// The shell's program name, for the tab.
    pub(crate) shell: String,
}

/// The program's name, without its directory or `.exe`.
fn program_name(program: &str) -> String {
    let base = program.rsplit(['/', '\\']).next().unwrap_or(program);
    base.strip_suffix(".exe").unwrap_or(base).to_owned()
}

/// The shell's command, its name, and the environment the ADR names (item
/// 3): `TERM`, `COLORTERM`, and `LANG` where the app has none.
fn command(start: &Start) -> (CommandBuilder, String) {
    #[cfg(unix)]
    let (mut cmd, name) = {
        let cmd = CommandBuilder::new_default_prog();
        let name = program_name(&cmd.get_shell());
        (cmd, name)
    };
    #[cfg(windows)]
    let (mut cmd, name) = windows_shell(start.shell);
    // The person's shell, whatever the Windows choice says.
    #[cfg(unix)]
    let _ = start.shell;
    if let Some(dir) = &start.dir {
        cmd.cwd(dir);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    let has_lang = cmd.get_env("LANG").is_some_and(|v| !v.is_empty());
    if let (false, Some(lang)) = (has_lang, &start.lang) {
        cmd.env("LANG", lang);
    }
    #[cfg(target_os = "linux")]
    strip_appimage(&mut cmd);
    (cmd, name)
}

/// An AppImage's runtime sets variables for the app's own libraries (its
/// directory in `LD_LIBRARY_PATH`, its `APPDIR`): a shell started with
/// them loads the AppImage's libraries into every program (the
/// cross-platform section of ADR 0115). Every variable that names the
/// AppImage's directory goes, with the runtime's own.
#[cfg(target_os = "linux")]
fn strip_appimage(cmd: &mut CommandBuilder) {
    let Some(appdir) = std::env::var_os("APPDIR").filter(|d| !d.is_empty()) else {
        return;
    };
    let appdir = appdir.to_string_lossy().into_owned();
    for (key, value) in std::env::vars_os() {
        if value.to_string_lossy().contains(&appdir) {
            cmd.env_remove(&key);
        }
    }
    for key in ["APPDIR", "APPIMAGE", "ARGV0", "OWD"] {
        cmd.env_remove(key);
    }
}

/// Windows (Q7): PowerShell 7 (`pwsh.exe`) when the `PATH` has it, else
/// Windows PowerShell; or the Command Prompt.
#[cfg(windows)]
fn windows_shell(choice: TerminalShell) -> (CommandBuilder, String) {
    if choice == TerminalShell::Cmd {
        return (CommandBuilder::new("cmd.exe"), "cmd".to_owned());
    }
    let probe = CommandBuilder::new("pwsh.exe");
    let pwsh = probe
        .get_env("PATH")
        .is_some_and(|path| std::env::split_paths(path).any(|dir| dir.join("pwsh.exe").is_file()));
    let program = if pwsh { "pwsh.exe" } else { "powershell.exe" };
    let mut cmd = CommandBuilder::new(program);
    cmd.arg("-NoLogo");
    (cmd, program_name(program))
}

/// The text of `tail` that is whole characters, leaving in it the bytes of
/// one not yet whole (a read may stop inside one); an invalid byte is the
/// replacement character, as a terminal shows it.
pub(crate) fn whole_text(tail: &mut Vec<u8>) -> String {
    let mut text = String::new();
    let mut at = 0;
    while at < tail.len() {
        let rest = tail.get(at..).unwrap_or_default();
        match std::str::from_utf8(rest) {
            Ok(s) => {
                text.push_str(s);
                at = tail.len();
            }
            Err(e) => {
                let good = e.valid_up_to();
                text.push_str(&String::from_utf8_lossy(
                    rest.get(..good).unwrap_or_default(),
                ));
                match e.error_len() {
                    Some(bad) => {
                        text.push(char::REPLACEMENT_CHARACTER);
                        at += good + bad;
                    }
                    None => {
                        at += good;
                        break;
                    }
                }
            }
        }
    }
    tail.drain(..at);
    text
}

impl Pty {
    /// Start a shell; `on_end` runs once it has ended and its last output
    /// was sent.
    pub(crate) fn spawn(
        start: Start,
        on_end: Box<dyn FnOnce() + Send>,
    ) -> Result<Arc<Self>, String> {
        let pair = portable_pty::native_pty_system()
            .openpty(PtySize {
                rows: start.size.rows.max(1),
                cols: start.size.cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("could not open a terminal: {e}"))?;
        let (cmd, shell) = command(&start);
        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("could not start {shell}: {e}"))?;
        // The parent keeps no end of the shell's terminal: the reader sees
        // the end when the shell's side closes (and ConPTY's console is
        // the master's alone).
        drop(pair.slave);
        let master = pair.master;
        let reader = master
            .try_clone_reader()
            .map_err(|e| format!("could not read the terminal: {e}"))?;
        let writer = master
            .take_writer()
            .map_err(|e| format!("could not write to the terminal: {e}"))?;
        #[cfg(any(unix, test))]
        let pid = child.process_id();
        #[cfg(windows)]
        let job = windows_job(child.as_raw_handle());
        let (input, keys) = mpsc::channel::<Vec<u8>>();
        let pty = Arc::new(Self {
            out: Mutex::new(Out {
                kept: VecDeque::new(),
                tail: Vec::new(),
                sink: None,
                ended: None,
            }),
            behind: Mutex::new(false),
            wake: Condvar::new(),
            input: Mutex::new(Some(input)),
            master: Mutex::new(Some(master)),
            killer: Mutex::new(child.clone_killer()),
            #[cfg(any(unix, test))]
            pid,
            alive: AtomicBool::new(true),
            #[cfg(windows)]
            job: Mutex::new(job),
            shell,
        });
        // The keys typed, written in order by a thread of their own: a
        // shell that does not read yet never holds the window.
        std::thread::spawn(move || {
            let mut writer = writer;
            for bytes in keys {
                if writer
                    .write_all(&bytes)
                    .and_then(|()| writer.flush())
                    .is_err()
                {
                    break;
                }
            }
        });
        let (eof, at_eof) = mpsc::channel::<()>();
        {
            let pty = Arc::clone(&pty);
            std::thread::spawn(move || pty.read_all(reader, &eof));
        }
        {
            let pty = Arc::clone(&pty);
            std::thread::spawn(move || {
                let code = child.wait().ok().map(|s| s.exit_code());
                pty.alive.store(false, Ordering::SeqCst);
                pty.wake.notify_all();
                // ConPTY ends the output only when its console closes.
                #[cfg(windows)]
                drop(lock(&pty.master).take());
                // The shell's last words come before its end.
                let _ = at_eof.recv_timeout(Duration::from_secs(1));
                pty.ended(code);
                on_end();
            });
        }
        if let Some(line) = start.typed {
            pty.write(format!("{line}\r").into_bytes());
        }
        Ok(pty)
    }

    /// The reader: every chunk kept and sent, waiting while the window is
    /// behind.
    fn read_all(&self, mut reader: Box<dyn Read + Send>, eof: &mpsc::Sender<()>) {
        let mut buf = vec![0u8; CHUNK];
        loop {
            self.wait_while_behind();
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => self.output(buf.get(..n).unwrap_or_default()),
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
                Err(_) => break,
            }
        }
        let _ = eof.send(());
    }

    fn wait_while_behind(&self) {
        let mut behind = lock(&self.behind);
        while *behind && self.alive.load(Ordering::SeqCst) {
            behind = match self.wake.wait_timeout(behind, Duration::from_millis(250)) {
                Ok((guard, _)) => guard,
                Err(poisoned) => poisoned.into_inner().0,
            };
        }
    }

    fn output(&self, bytes: &[u8]) {
        let mut out = lock(&self.out);
        out.kept.extend(bytes);
        let over = out.kept.len().saturating_sub(KEPT);
        out.kept.drain(..over);
        out.tail.extend_from_slice(bytes);
        let text = whole_text(&mut out.tail);
        if text.is_empty() {
            return;
        }
        let gone = out
            .sink
            .as_mut()
            .is_some_and(|sink| !sink(TerminalOutput::Data { text }));
        if gone {
            out.sink = None;
            drop(out);
            self.set_behind(false);
        }
    }

    fn ended(&self, code: Option<u32>) {
        let mut out = lock(&self.out);
        out.ended = Some(code);
        if let Some(sink) = out.sink.as_mut() {
            let _ = sink(TerminalOutput::Ended { code });
        }
    }

    /// Send the output to `sink` from now on, after what was kept (a
    /// window found the terminal again). False when the sink is gone at
    /// once.
    pub(crate) fn attach(&self, mut sink: Sink) -> bool {
        let mut out = lock(&self.out);
        let whole = out.kept.len().saturating_sub(out.tail.len());
        let bytes: Vec<u8> = out
            .kept
            .iter()
            .take(whole)
            .copied()
            // What was dropped from the front may have cut a character.
            .skip_while(|b| (0x80..0xc0).contains(b))
            .collect();
        let text = String::from_utf8_lossy(&bytes).into_owned();
        if !text.is_empty() && !sink(TerminalOutput::Data { text }) {
            return false;
        }
        if let Some(code) = out.ended {
            let _ = sink(TerminalOutput::Ended { code });
        }
        out.sink = Some(sink);
        drop(out);
        self.set_behind(false);
        true
    }

    /// The window is behind (true) or caught up (item 8).
    pub(crate) fn set_behind(&self, behind: bool) {
        *lock(&self.behind) = behind;
        self.wake.notify_all();
    }

    /// Keys typed, or text pasted, for the shell.
    pub(crate) fn write(&self, bytes: Vec<u8>) {
        if let Some(input) = lock(&self.input).as_ref() {
            let _ = input.send(bytes);
        }
    }

    /// The window's new size: the shell is told (`SIGWINCH`, or ConPTY's).
    pub(crate) fn resize(&self, size: TerminalSize) -> Result<(), String> {
        let master = lock(&self.master);
        let Some(master) = master.as_ref() else {
            return Ok(());
        };
        master
            .resize(PtySize {
                rows: size.rows.max(1),
                cols: size.cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    /// The size the terminal has now (the tests ask it after a resize).
    #[cfg(test)]
    pub(crate) fn size(&self) -> Option<TerminalSize> {
        lock(&self.master)
            .as_ref()
            .and_then(|m| m.get_size().ok())
            .map(|s| TerminalSize {
                cols: s.cols,
                rows: s.rows,
            })
    }

    /// The shell's process id (the tests check it is gone).
    #[cfg(test)]
    pub(crate) fn pid(&self) -> Option<u32> {
        self.pid
    }

    pub(crate) fn alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    /// The terminal's foreground process group (Unix): the shell's own
    /// while it waits for a command, another while one runs.
    #[cfg(unix)]
    fn foreground(&self) -> Option<i32> {
        lock(&self.master)
            .as_ref()
            .and_then(|m| m.process_group_leader())
    }

    /// Whether a program other than the shell runs in the foreground (item
    /// 13): what a close or a quit asks about. Windows cannot tell, so a
    /// live terminal is busy there.
    pub(crate) fn busy(&self) -> bool {
        if !self.alive() {
            return false;
        }
        #[cfg(unix)]
        {
            let shell = self.pid.and_then(|p| i32::try_from(p).ok());
            match (self.foreground(), shell) {
                (Some(group), Some(shell)) => group != shell,
                _ => false,
            }
        }
        #[cfg(windows)]
        {
            true
        }
    }

    /// End the shell and every program it started (item 13): on Unix a
    /// hang-up to its process group and the terminal's foreground group,
    /// then, after a grace, a kill to them and to every process still in
    /// the shell's session — a background job of a shell that does not
    /// hang up its jobs (`sh`/dash, or a job that ignores the hang-up) is
    /// in a group of its own; on Windows the job's whole tree.
    pub(crate) fn end(&self) {
        lock(&self.input).take();
        #[cfg(unix)]
        let shell = self.pid.and_then(|p| i32::try_from(p).ok());
        #[cfg(unix)]
        let groups = {
            let groups: Vec<i32> = shell.into_iter().chain(self.foreground()).collect();
            signal_groups(&groups, nix::sys::signal::Signal::SIGHUP);
            groups
        };
        let _ = lock(&self.killer).kill();
        #[cfg(windows)]
        drop(lock(&self.job).take());
        drop(lock(&self.master).take());
        self.set_behind(false);
        #[cfg(unix)]
        std::thread::spawn(move || {
            std::thread::sleep(GRACE);
            signal_groups(&groups, nix::sys::signal::Signal::SIGKILL);
            if let Some(session) = shell {
                end_session(session);
            }
        });
    }
}

/// A signal to each process group (a group already gone is no error).
#[cfg(unix)]
fn signal_groups(groups: &[i32], signal: nix::sys::signal::Signal) {
    for group in groups {
        if *group > 1 {
            let _ = nix::sys::signal::killpg(nix::unistd::Pid::from_raw(*group), signal);
        }
    }
}

/// Kill every process left in the session the shell led (`setsid` in the
/// child made its id the session's). The id of a session is not given to
/// another process while one of its members lives, so what answers it is
/// the terminal's; a program that started a session of its own (`setsid`)
/// has left on purpose and is not touched. No list of processes is read
/// (no `/proc`): each id up to the system's bound is asked its session,
/// once, on the terminal's own thread after it closed.
#[cfg(unix)]
pub(crate) fn end_session(session: i32) {
    use nix::unistd::{Pid, getsid};
    if session <= 1 {
        return;
    }
    let mine = getsid(None).ok().map(Pid::as_raw);
    if mine == Some(session) {
        return;
    }
    for pid in 2..=PID_MAX {
        let pid = Pid::from_raw(pid);
        if getsid(Some(pid)).is_ok_and(|s| s.as_raw() == session) {
            let _ = nix::sys::signal::kill(pid, nix::sys::signal::Signal::SIGKILL);
        }
    }
}

/// The shell's process in a job that kills its whole tree when the job's
/// last handle closes: the terminal's end, or the app's (a crash too).
#[cfg(windows)]
fn windows_job(process: Option<std::os::windows::io::RawHandle>) -> Option<win32job::Job> {
    let mut limits = win32job::ExtendedLimitInfo::new();
    limits.limit_kill_on_job_close();
    let job = win32job::Job::create_with_limit_info(&limits).ok()?;
    job.assign_process(process? as isize).ok()?;
    Some(job)
}

/* ---------- The AI command-line tools (item 14) ---------- */

/// The command each tool is installed as.
pub(crate) fn cli_word(cli: AiCli) -> &'static str {
    match cli {
        AiCli::Claude => "claude",
        AiCli::Gemini => "gemini",
        AiCli::Codex => "codex",
        AiCli::Antigravity => "agy",
        AiCli::OpenCode => "opencode",
        AiCli::CursorAgent => "cursor-agent",
    }
}

/// Every tool the detection asks about, in the order the window lists them.
pub(crate) const CLIS: [AiCli; 6] = [
    AiCli::Claude,
    AiCli::Gemini,
    AiCli::Codex,
    AiCli::Antigravity,
    AiCli::OpenCode,
    AiCli::CursorAgent,
];

const BEGIN: &str = "verso-detect-begin";
const END: &str = "verso-detect-end";

/// A terminal's line without its control sequences: ConPTY and a
/// prompt's theme put cursor moves and titles among the text.
fn plain(line: &str) -> String {
    let mut out = String::new();
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            if !c.is_control() {
                out.push(c);
            }
            continue;
        }
        match chars.next() {
            // CSI: parameters, then one final byte from @ to ~.
            Some('[') => {
                for c in chars.by_ref() {
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
            }
            // OSC: up to BEL or ST.
            Some(']') => {
                while let Some(c) = chars.next() {
                    if c == '\u{7}' || (c == '\u{1b}' && chars.next_if_eq(&'\\').is_some()) {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out.trim().to_owned()
}

/// Whether the answer has come to its end mark, on a line of its own.
fn answered(answer: &str) -> bool {
    answer.lines().any(|l| plain(l) == END)
}

/// The tools the shell's answer names, between the two marks, each on a
/// line of its own: a path (`/opt/homebrew/bin/gemini`, `C:\…\claude.cmd`),
/// a function's name, or an alias's definition (`alias codex=…`) — whatever
/// the person's startup files print around them is not between the marks.
pub(crate) fn found_in(answer: &str) -> Vec<AiCli> {
    let mut inside = false;
    let mut found = Vec::new();
    for line in answer.lines() {
        let line = plain(line);
        if line == BEGIN {
            inside = true;
            continue;
        }
        if line == END {
            break;
        }
        if !inside || line.is_empty() {
            continue;
        }
        let word = line.strip_prefix("alias ").map_or_else(
            || line.rsplit(['/', '\\']).next().unwrap_or(&line),
            |a| a.split('=').next().unwrap_or(a),
        );
        let word = word.split('.').next().unwrap_or(word).to_ascii_lowercase();
        for cli in CLIS {
            if word == cli_word(cli) && !found.contains(&cli) {
                found.push(cli);
            }
        }
    }
    found
}

/// The question put to the shell: one `command -v` for every tool, between
/// two marks (item 14) — the same shell a terminal starts, run once.
fn detect_command(start: &Start) -> CommandBuilder {
    let words = CLIS.map(cli_word);
    #[cfg(unix)]
    let mut cmd = {
        let shell = CommandBuilder::new_default_prog().get_shell();
        let mut cmd = CommandBuilder::new(shell);
        cmd.args([
            "-l".to_owned(),
            "-i".to_owned(),
            "-c".to_owned(),
            format!("echo {BEGIN}; command -v {}; echo {END}", words.join(" ")),
        ]);
        cmd
    };
    #[cfg(windows)]
    let mut cmd = {
        let (mut cmd, name) = windows_shell(start.shell);
        if name == "cmd" {
            cmd.args([
                "/d".to_owned(),
                "/c".to_owned(),
                format!(
                    "echo {BEGIN} & where {} 2>nul & echo {END}",
                    words.join(" ")
                ),
            ]);
        } else {
            let list = words.map(|w| format!("'{w}'")).join(",");
            cmd.args([
                "-Command".to_owned(),
                format!(
                    "Write-Output {BEGIN}; (Get-Command {list} -ErrorAction SilentlyContinue).Source; Write-Output {END}"
                ),
            ]);
        }
        cmd
    };
    if let Some(dir) = &start.dir {
        cmd.cwd(dir);
    }
    cmd.env("TERM", "xterm-256color");
    #[cfg(target_os = "linux")]
    strip_appimage(&mut cmd);
    cmd
}

/// Which tools the person's shell finds: the shell run once with the
/// question, on a terminal of its own (so its startup files run as in a
/// terminal tab), for at most `within`.
pub(crate) fn detect(start: &Start, within: Duration) -> Result<Vec<AiCli>, String> {
    let pair = portable_pty::native_pty_system()
        .openpty(PtySize::default())
        .map_err(|e| format!("could not open a terminal: {e}"))?;
    let mut child = pair
        .slave
        .spawn_command(detect_command(start))
        .map_err(|e| format!("could not start the shell: {e}"))?;
    drop(pair.slave);
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("could not read the terminal: {e}"))?;
    let heard = Arc::new(Mutex::new(Vec::<u8>::new()));
    let (done, at_done) = mpsc::channel::<()>();
    {
        let heard = Arc::clone(&heard);
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let mut all = lock(&heard);
                all.extend_from_slice(buf.get(..n).unwrap_or_default());
                if answered(&String::from_utf8_lossy(&all)) {
                    break;
                }
            }
            let _ = done.send(());
        });
    }
    let _ = at_done.recv_timeout(within);
    let _ = child.kill();
    drop(pair.master);
    let answer = String::from_utf8_lossy(&lock(&heard)).into_owned();
    Ok(found_in(&answer))
}
