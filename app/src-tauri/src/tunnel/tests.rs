// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The link's tunnel with a fake `cloudflared`: a shell script that prints
//! the lines the spike saw (`tunnel-spike/RESULTS.md` S0.3) and sleeps. No
//! test reaches the network or runs the real binary.

use std::ffi::OsString;
use std::io::{Cursor, Read};
use std::path::Path;
#[cfg(unix)]
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
#[cfg(unix)]
use std::time::{Duration, Instant};

use sha2::Digest;

use super::fetch::{self, Pin};
use super::named::{self, Login, Route};
#[cfg(unix)]
use super::run::Timing;
use super::run::{self, Seen, Step};
use super::*;

/* ---------- The lines ---------- */

const REQUESTING: &str =
    "2026-11-04T00:57:40Z INF Requesting new quick Tunnel on trycloudflare.com...";
const CREATED: &str = "2026-11-04T00:57:45Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |";
const URL_LINE: &str = "2026-11-04T00:57:45Z INF |  https://abstract-simpson-player-passes.trycloudflare.com                                  |";
const REGISTERED: &str = "2026-11-04T00:57:46Z INF Registered tunnel connection connIndex=0 connection=bfeae2be-0000 event=0 ip=2606:4700:a0::5 location=gru20 protocol=quic";

#[test]
fn the_url_is_the_link_after_the_created_line_and_not_the_request() {
    assert_eq!(run::parse_line(REQUESTING, false), None);
    assert_eq!(run::parse_line(REQUESTING, true), None);
    assert_eq!(run::parse_line(CREATED, false), Some(Seen::Created));
    // Before the "created" line a URL is not believed.
    assert_eq!(run::parse_line(URL_LINE, false), None);
    assert_eq!(
        run::parse_line(URL_LINE, true),
        Some(Seen::Url(
            "https://abstract-simpson-player-passes.trycloudflare.com".to_owned()
        ))
    );
    assert_eq!(
        run::parse_line(REGISTERED, false),
        Some(Seen::Registered("quic".to_owned()))
    );
}

#[test]
fn only_a_quick_tunnel_name_is_a_url() {
    for (line, want) in [
        (
            "x https://a-b-1.trycloudflare.com y",
            Some("https://a-b-1.trycloudflare.com"),
        ),
        (
            "|https://a.trycloudflare.com|",
            Some("https://a.trycloudflare.com"),
        ),
        (
            "https://a.trycloudflare.com/path",
            Some("https://a.trycloudflare.com"),
        ),
        ("Post \"https://api.trycloudflare.com/tunnel\"", None),
        ("https://a.trycloudflare.com.example.org", None),
        ("https://a.b.trycloudflare.com", None),
        ("https://UPPER.trycloudflare.com", None),
        ("http://a.trycloudflare.com", None),
        ("trycloudflare.com", None),
        ("https://.trycloudflare.com", None),
    ] {
        assert_eq!(run::quick_url(line).as_deref(), want, "{line}");
    }
}

#[test]
fn an_error_line_reaches_the_log_with_no_address() {
    let line = "2026-11-04T01:00:00Z ERR failed to request quick Tunnel: Post \"https://api.trycloudflare.com/tunnel\": dial tcp";
    let Some(Seen::Error(text)) = run::parse_line(line, true) else {
        panic!("an error line")
    };
    assert!(!text.contains("trycloudflare"), "{text}");
    assert!(!text.contains("https://"), "{text}");
    assert!(text.contains("failed to request quick Tunnel"));
    let own = run::redact("ERR origin https://mesa.example.com x uuid.cfargotunnel.com");
    assert!(
        !own.contains("mesa.example.com") && !own.contains("cfargotunnel"),
        "{own}"
    );
}

#[test]
fn the_quick_command_line() {
    let line: Vec<OsString> = run::quick_args(4242, false);
    assert_eq!(
        line,
        [
            "tunnel",
            "--no-autoupdate",
            "--url",
            "http://127.0.0.1:4242"
        ]
        .map(OsString::from)
        .to_vec()
    );
    let line = run::quick_args(4242, true);
    assert_eq!(
        line,
        [
            "tunnel",
            "--no-autoupdate",
            "--protocol",
            "http2",
            "--url",
            "http://127.0.0.1:4242"
        ]
        .map(OsString::from)
        .to_vec()
    );
}

/* ---------- The pin and the download ---------- */

fn hex64(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[test]
fn one_pinned_row_per_system_all_from_cloudflares_github_releases() {
    let systems = [
        ("macos", "aarch64"),
        ("macos", "x86_64"),
        ("linux", "x86_64"),
        ("linux", "aarch64"),
        ("windows", "x86_64"),
    ];
    assert_eq!(fetch::PINNED.len(), systems.len());
    for (os, arch) in systems {
        let pin = fetch::pin_for(os, arch).unwrap_or_else(|| panic!("{os} {arch}"));
        assert!(
            pin.url().starts_with(&format!(
                "https://github.com/cloudflare/cloudflared/releases/download/{}/",
                fetch::VERSION
            )),
            "{}",
            pin.url()
        );
        assert!(hex64(pin.sha256) && hex64(pin.binary_sha256), "{os} {arch}");
        // A .tgz has two pins (the spike's finding S0.1); a bare binary one.
        assert_eq!(pin.is_tgz(), os == "macos");
        assert_eq!(
            pin.sha256 == pin.binary_sha256,
            !pin.is_tgz(),
            "{os} {arch}"
        );
    }
    let mac = fetch::pin_for("macos", "aarch64").unwrap();
    assert!(mac.sha256.starts_with("1165d14b"));
    assert!(mac.binary_sha256.starts_with("f249139e"));
    assert!(fetch::pin_for("windows", "aarch64").is_none());
}

#[test]
fn the_binary_lives_in_the_apps_configuration_directory() {
    let config = Path::new("/conf/verso");
    let dir = tunnel_dir(config);
    assert!(dir.starts_with(config));
    let binary = fetch::binary_path(&dir);
    assert_eq!(binary.parent(), Some(dir.as_path()));
    assert!(binary.to_string_lossy().contains(fetch::VERSION));
}

fn sha(bytes: &[u8]) -> String {
    format!("{:x}", sha2::Sha256::digest(bytes))
}

fn leak(s: String) -> &'static str {
    Box::leak(s.into_boxed_str())
}

fn bare_pin(bytes: &[u8]) -> Pin<'static> {
    let sum = leak(sha(bytes));
    Pin {
        os: "linux",
        arch: "x86_64",
        asset: "cloudflared-linux-amd64",
        sha256: sum,
        binary_sha256: sum,
    }
}

fn tgz(name: &str, bytes: &[u8]) -> Vec<u8> {
    let gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    let mut builder = tar::Builder::new(gz);
    let mut header = tar::Header::new_gnu();
    header.set_size(bytes.len() as u64);
    header.set_mode(0o755);
    header.set_cksum();
    builder.append_data(&mut header, name, bytes).unwrap();
    builder.into_inner().unwrap().finish().unwrap()
}

fn bytes_source(
    bytes: Vec<u8>,
    asked: Arc<Mutex<Vec<String>>>,
) -> impl FnMut(&str) -> Result<Box<dyn Read + Send>, String> {
    move |url: &str| {
        asked.lock().unwrap().push(url.to_owned());
        Ok(Box::new(Cursor::new(bytes.clone())) as Box<dyn Read + Send>)
    }
}

#[test]
fn a_download_with_the_pinned_sum_is_kept_runnable_and_not_fetched_again() {
    let dir = tempfile::tempdir().unwrap();
    let body = b"#!/bin/sh\necho fake\n".to_vec();
    let pin = bare_pin(&body);
    let asked = Arc::new(Mutex::new(Vec::new()));
    let mut source = bytes_source(body.clone(), Arc::clone(&asked));
    let (path, fresh) = fetch::ensure(dir.path(), &pin, &mut source).unwrap();
    assert!(fresh);
    assert_eq!(files::read(&path), body);
    #[cfg(unix)]
    assert_eq!(files::mode_of(&path), 0o755);
    assert_eq!(
        files::names_in(dir.path()),
        [format!("cloudflared-{}", fetch::VERSION)]
    );
    let (again, fresh) = fetch::ensure(dir.path(), &pin, &mut source).unwrap();
    assert_eq!((again, fresh), (path, false));
    assert_eq!(asked.lock().unwrap().len(), 1, "checked, not fetched again");
}

#[test]
fn a_download_whose_sum_is_not_the_pin_is_refused_and_leaves_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let pin = bare_pin(b"the real one");
    let asked = Arc::new(Mutex::new(Vec::new()));
    let mut source = bytes_source(b"something else".to_vec(), asked);
    let err = fetch::ensure(dir.path(), &pin, &mut source).unwrap_err();
    assert!(err.contains("not the one Verso pins"), "{err}");
    assert!(
        err.contains(&format!("expected sha256:{}", pin.sha256)),
        "{err}"
    );
    assert!(err.contains("refused"), "{err}");
    assert!(
        files::names_in(dir.path()).is_empty(),
        "{:?}",
        files::names_in(dir.path())
    );
}

#[test]
fn a_kept_binary_that_is_not_the_pin_is_fetched_again() {
    let dir = tempfile::tempdir().unwrap();
    let body = b"pinned".to_vec();
    let pin = bare_pin(&body);
    files::make_dir(dir.path()).unwrap();
    files::write(&fetch::binary_path(dir.path()), b"tampered");
    let asked = Arc::new(Mutex::new(Vec::new()));
    let mut source = bytes_source(body.clone(), Arc::clone(&asked));
    let (path, fresh) = fetch::ensure(dir.path(), &pin, &mut source).unwrap();
    assert!(fresh);
    assert_eq!(files::read(&path), body);
}

#[test]
fn a_tgz_is_checked_then_its_binary_is_checked() {
    let inner = b"the binary inside".to_vec();
    let archive = tgz("cloudflared", &inner);
    let pin = Pin {
        os: "macos",
        arch: "aarch64",
        asset: "cloudflared-darwin-arm64.tgz",
        sha256: leak(sha(&archive)),
        binary_sha256: leak(sha(&inner)),
    };
    let dir = tempfile::tempdir().unwrap();
    let mut source = bytes_source(archive.clone(), Arc::default());
    let (path, _) = fetch::ensure(dir.path(), &pin, &mut source).unwrap();
    assert_eq!(files::read(&path), inner);
    assert_eq!(files::names_in(dir.path()).len(), 1);

    // The archive matches, the binary inside does not: refused.
    let wrong = Pin {
        binary_sha256: leak(sha(b"another")),
        ..pin
    };
    let dir = tempfile::tempdir().unwrap();
    let mut source = bytes_source(archive, Arc::default());
    let err = fetch::ensure(dir.path(), &wrong, &mut source).unwrap_err();
    assert!(err.contains("the cloudflared inside it"), "{err}");
    assert!(files::names_in(dir.path()).is_empty());

    // An archive without the file, `./` taken as the top.
    let other = tgz("./cloudflared", b"x");
    let named = tgz("bin/cloudflared", b"x");
    for (archive, ok) in [(other, true), (named, false)] {
        let pin = Pin {
            sha256: leak(sha(&archive)),
            binary_sha256: leak(sha(b"x")),
            ..pin
        };
        let dir = tempfile::tempdir().unwrap();
        let mut source = bytes_source(archive, Arc::default());
        assert_eq!(fetch::ensure(dir.path(), &pin, &mut source).is_ok(), ok);
    }
}

/* ---------- The fake cloudflared ---------- */

#[cfg(unix)]
mod unix {
    use super::*;

    pub(super) const TIMING: Timing = Timing {
        url: Duration::from_secs(5),
        quic: Duration::from_millis(1500),
        http2: Duration::from_millis(1500),
        grace: Duration::from_secs(1),
        watch_every: Duration::from_millis(200),
    };

    fn box_lines(url: &str) -> String {
        format!(
            "echo '{REQUESTING}' >&2\n\
             echo '2026-11-04T00:57:45Z INF +----+' >&2\n\
             echo '{CREATED}' >&2\n\
             echo '2026-11-04T00:57:45Z INF |  {url}   |' >&2\n\
             echo '2026-11-04T00:57:45Z INF +----+' >&2\n"
        )
    }

    /// A fake that gives `url`, waits `delay`, registers, then sleeps (or
    /// ends with `end`).
    pub(super) fn fake(dir: &Path, url: &str, delay: &str, end: &str) -> PathBuf {
        let text = format!(
            "#!/bin/sh\n{}sleep {delay}\necho '{REGISTERED}' >&2\n{end}\n",
            box_lines(url)
        );
        files::write_script(dir, "cloudflared", &text)
    }

    pub(super) fn sleeping(dir: &Path, url: &str, delay: &str) -> PathBuf {
        fake(dir, url, delay, "exec sleep 600")
    }

    /// QUIC never registers (a network that drops UDP); http2 does, with
    /// another link.
    pub(super) fn quic_blocked(dir: &Path, http2_too: bool) -> PathBuf {
        let h2 = if http2_too {
            format!(
                "{}echo '2026-11-04T00:58:00Z INF Registered tunnel connection connIndex=0 location=gru20 protocol=http2' >&2\n",
                box_lines("https://second-try-h2.trycloudflare.com")
            )
        } else {
            box_lines("https://second-try-h2.trycloudflare.com")
        };
        let text = format!(
            "#!/bin/sh\ncase \"$*\" in\n*\"--protocol http2\"*)\n{h2};;\n*)\n{}echo '2026-11-04T00:57:50Z ERR Failed to dial a quic connection error=\"timeout: no recent network activity\" connIndex=0 event=0 ip=198.41.192.7' >&2\n;;\nesac\nexec sleep 600\n",
            box_lines("https://first-try-quic.trycloudflare.com")
        );
        files::write_script(dir, "cloudflared", &text)
    }

    pub(super) fn alive(pid: u32) -> bool {
        nix::sys::signal::kill(
            nix::unistd::Pid::from_raw(i32::try_from(pid).unwrap()),
            None,
        )
        .is_ok()
    }

    pub(super) fn gone_within(pid: u32, within: Duration) -> bool {
        let until = Instant::now() + within;
        while Instant::now() < until {
            if !alive(pid) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        !alive(pid)
    }
}

#[cfg(unix)]
#[derive(Clone, Default)]
struct FakeDoor {
    calls: Arc<Mutex<Vec<String>>>,
}

#[cfg(unix)]
impl FakeDoor {
    fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }
}

#[cfg(unix)]
impl Door for FakeDoor {
    fn open(&self) -> Result<u16, String> {
        self.calls.lock().unwrap().push("open".to_owned());
        Ok(4242)
    }
    fn set_origin(&self, origin: Option<&str>) -> Result<(), String> {
        self.calls
            .lock()
            .unwrap()
            .push(format!("origin {}", origin.unwrap_or("-")));
        Ok(())
    }
    fn close(&self) {
        self.calls.lock().unwrap().push("close".to_owned());
    }
}

#[cfg(unix)]
/// Wait until the door was closed (the stop's last step).
fn closed(door: &FakeDoor) -> Vec<String> {
    let until = Instant::now() + Duration::from_secs(3);
    while Instant::now() < until && door.calls().last().map(String::as_str) != Some("close") {
        std::thread::sleep(Duration::from_millis(20));
    }
    door.calls()
}

#[cfg(unix)]
fn manager_with(ceiling: Duration) -> (Manager, Arc<Mutex<Vec<LinkView>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&seen);
    let m = Manager::new(
        move |v: &LinkView| sink.lock().unwrap().push(v.clone()),
        unix::TIMING,
        ceiling,
    );
    (m, seen)
}

#[cfg(unix)]
fn wait_for(m: &Manager, within: Duration, ok: impl Fn(&LinkView) -> bool) -> LinkView {
    let until = Instant::now() + within;
    loop {
        let v = m.view();
        if ok(&v) || Instant::now() >= until {
            return v;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(unix)]
#[test]
fn the_link_is_on_at_the_registered_connection_not_at_the_url() {
    let dir = tempfile::tempdir().unwrap();
    let program = unix::sleeping(
        dir.path(),
        "https://abstract-simpson-player-passes.trycloudflare.com",
        "1",
    );
    let (m, seen) = manager_with(CEILING);
    let door = FakeDoor::default();
    let started = Instant::now();
    let view = m
        .start(Box::new(door.clone()), &program, Mode::Quick)
        .unwrap();
    assert!(
        started.elapsed() >= Duration::from_millis(900),
        "waited for the registration"
    );
    assert_eq!(view.state, LinkState::On);
    assert_eq!(
        view.origin.as_deref(),
        Some("https://abstract-simpson-player-passes.trycloudflare.com")
    );
    assert!(view.until_ms.is_some() && !view.own);
    assert_eq!(
        door.calls(),
        [
            "open",
            "origin https://abstract-simpson-player-passes.trycloudflare.com"
        ]
    );
    let states: Vec<LinkState> = seen.lock().unwrap().iter().map(|v| v.state).collect();
    assert_eq!(states, [LinkState::Starting, LinkState::On]);
    // One tunnel at a time.
    let again = m.start(Box::new(door.clone()), &program, Mode::Quick);
    assert!(again.is_err());
    m.stop(LinkEnd::Stopped);
}

#[cfg(unix)]
#[test]
fn quic_that_never_registers_falls_back_to_http2() {
    let dir = tempfile::tempdir().unwrap();
    let program = unix::quic_blocked(dir.path(), true);
    let (m, _) = manager_with(CEILING);
    let door = FakeDoor::default();
    let started = Instant::now();
    let view = m
        .start(Box::new(door.clone()), &program, Mode::Quick)
        .unwrap();
    assert!(
        started.elapsed() >= unix::TIMING.quic,
        "QUIC was given its time"
    );
    assert_eq!(
        view.origin.as_deref(),
        Some("https://second-try-h2.trycloudflare.com")
    );
    assert_eq!(
        door.calls(),
        ["open", "origin https://second-try-h2.trycloudflare.com"]
    );
    m.stop(LinkEnd::Stopped);
}

#[cfg(unix)]
#[test]
fn no_registration_either_way_fails_and_closes_the_door() {
    let dir = tempfile::tempdir().unwrap();
    let program = unix::quic_blocked(dir.path(), false);
    let (m, _) = manager_with(CEILING);
    let door = FakeDoor::default();
    let err = m
        .start(Box::new(door.clone()), &program, Mode::Quick)
        .unwrap_err();
    assert!(err.contains("QUIC or HTTP/2"), "{err}");
    assert_eq!(door.calls(), ["open", "origin -", "close"]);
    let view = m.view();
    assert_eq!(
        (view.state, view.ended),
        (LinkState::Off, Some(LinkEnd::Failed))
    );
}

#[cfg(unix)]
#[test]
fn stop_kills_cloudflared_and_forgets_the_origin_before_closing() {
    let dir = tempfile::tempdir().unwrap();
    let program = unix::sleeping(dir.path(), "https://a.trycloudflare.com", "0");
    let (m, _) = manager_with(CEILING);
    let door = FakeDoor::default();
    m.start(Box::new(door.clone()), &program, Mode::Quick)
        .unwrap();
    let pid = m.pid().unwrap();
    assert!(unix::alive(pid));
    let view = m.stop(LinkEnd::Stopped);
    assert_eq!(
        (view.state, view.ended),
        (LinkState::Off, Some(LinkEnd::Stopped))
    );
    assert!(
        unix::gone_within(pid, Duration::from_secs(2)),
        "cloudflared {pid} still runs"
    );
    assert_eq!(
        door.calls(),
        [
            "open",
            "origin https://a.trycloudflare.com",
            "origin -",
            "close"
        ]
    );
}

/// *Stop* while `cloudflared` is still downloading the first time: the
/// link is starting from the click, so the stop is heard; when the slow
/// download ends, the door is never opened — nothing serves, no link.
#[cfg(unix)]
#[test]
fn stop_during_the_first_download_opens_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let program = unix::sleeping(dir.path(), "https://a.trycloudflare.com", "0");
    let (m, _) = manager_with(CEILING);
    let door = FakeDoor::default();
    let (downloading, heard) = std::sync::mpsc::channel();
    let (done, finish) = std::sync::mpsc::channel::<()>();
    let started = std::thread::scope(|s| {
        let (m, door, program) = (&m, &door, &program);
        let start = s.spawn(move || {
            m.start_after(Mode::Quick, move || {
                // A slow download: it ends when the test says.
                downloading.send(()).unwrap();
                finish.recv().unwrap();
                Ok((Box::new(door.clone()) as Box<dyn Door>, program.clone()))
            })
        });
        heard.recv().unwrap();
        let during = m.view().state;
        let stopped = m.stop(LinkEnd::Stopped);
        done.send(()).unwrap();
        (during, stopped, start.join().unwrap())
    });
    let (during, stopped, started) = started;
    assert_eq!(during, LinkState::Starting, "the download is a start");
    assert_eq!(
        (stopped.state, stopped.ended),
        (LinkState::Off, Some(LinkEnd::Stopped))
    );
    assert!(started.is_err(), "{started:?}");
    assert!(
        door.calls().is_empty(),
        "the door was touched: {:?}",
        door.calls()
    );
    let view = m.view();
    assert_eq!(
        (view.state, view.origin, view.ended),
        (LinkState::Off, None, Some(LinkEnd::Stopped))
    );
    assert_eq!(m.pid(), None);
}

#[cfg(unix)]
#[test]
fn dropping_the_manager_kills_cloudflared() {
    let dir = tempfile::tempdir().unwrap();
    let program = unix::sleeping(dir.path(), "https://a.trycloudflare.com", "0");
    let (m, _) = manager_with(CEILING);
    let door = FakeDoor::default();
    m.start(Box::new(door.clone()), &program, Mode::Quick)
        .unwrap();
    let pid = m.pid().unwrap();
    drop(m);
    assert!(
        unix::gone_within(pid, Duration::from_secs(2)),
        "cloudflared {pid} still runs"
    );
    assert_eq!(door.calls().last().map(String::as_str), Some("close"));
}

#[cfg(unix)]
#[test]
fn dropping_a_tunnel_kills_its_child() {
    let dir = tempfile::tempdir().unwrap();
    let program = unix::sleeping(dir.path(), "https://a.trycloudflare.com", "0");
    let (tunnel, _rx) = run::spawn(&program, &run::quick_args(1, false), &unix::TIMING).unwrap();
    let pid = tunnel.pid();
    assert!(unix::alive(pid));
    drop(tunnel);
    assert!(unix::gone_within(pid, Duration::from_secs(2)));
}

#[cfg(unix)]
#[test]
fn the_watcher_ends_cloudflared_when_the_apps_process_is_gone() {
    // The "app" is a process that has already ended (as after a crash).
    let mut app = std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg("exit 0")
        .spawn()
        .unwrap();
    let app_pid = app.id();
    app.wait().unwrap();
    let mut child = std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg("exec sleep 600")
        .spawn()
        .unwrap();
    let mut watch = run::watcher(app_pid, child.id(), Duration::from_millis(100)).unwrap();
    let until = Instant::now() + Duration::from_secs(3);
    let mut ended = None;
    while Instant::now() < until {
        if let Some(status) = child.try_wait().unwrap() {
            ended = Some(status);
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let _ = child.kill();
    let _ = child.wait();
    let _ = watch.wait();
    assert!(ended.is_some(), "the child outlived the app");
}

#[cfg(unix)]
#[test]
fn the_watcher_leaves_cloudflared_while_the_app_lives() {
    let mut child = std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg("exec sleep 600")
        .spawn()
        .unwrap();
    let mut watch =
        run::watcher(std::process::id(), child.id(), Duration::from_millis(100)).unwrap();
    std::thread::sleep(Duration::from_millis(500));
    assert!(child.try_wait().unwrap().is_none());
    child.kill().unwrap();
    child.wait().unwrap();
    // The watcher ends with the child.
    let until = Instant::now() + Duration::from_secs(3);
    while Instant::now() < until && watch.try_wait().unwrap().is_none() {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(
        watch.try_wait().unwrap().is_some(),
        "the watcher outlived the child"
    );
}

#[cfg(unix)]
#[test]
fn the_ceiling_stops_a_quick_link() {
    let dir = tempfile::tempdir().unwrap();
    let program = unix::sleeping(dir.path(), "https://a.trycloudflare.com", "0");
    let (m, _) = manager_with(Duration::from_millis(800));
    let door = FakeDoor::default();
    m.start(Box::new(door.clone()), &program, Mode::Quick)
        .unwrap();
    let pid = m.pid().unwrap();
    let view = wait_for(&m, Duration::from_secs(4), |v| v.state == LinkState::Off);
    assert_eq!(
        (view.state, view.ended),
        (LinkState::Off, Some(LinkEnd::Ceiling))
    );
    assert!(unix::gone_within(pid, Duration::from_secs(2)));
    assert_eq!(closed(&door).last().map(String::as_str), Some("close"));
}

#[cfg(unix)]
#[test]
fn extend_pushes_the_ceiling_back_on_the_same_link() {
    let dir = tempfile::tempdir().unwrap();
    let program = unix::sleeping(dir.path(), "https://a.trycloudflare.com", "0");
    let ceiling = Duration::from_millis(1500);
    let (m, _) = manager_with(ceiling);
    let door = FakeDoor::default();
    let first = m
        .start(Box::new(door.clone()), &program, Mode::Quick)
        .unwrap();
    let pid = m.pid().unwrap();
    std::thread::sleep(Duration::from_millis(1000));
    let extended = m.extend().unwrap();
    assert!(extended.until_ms > first.until_ms);
    assert_eq!(extended.origin, first.origin, "the same link");
    // Past the first ceiling, still on.
    std::thread::sleep(Duration::from_millis(1000));
    assert_eq!(m.view().state, LinkState::On);
    assert_eq!(m.pid(), Some(pid));
    let view = wait_for(&m, Duration::from_secs(3), |v| v.state == LinkState::Off);
    assert_eq!(view.ended, Some(LinkEnd::Ceiling));
}

#[cfg(unix)]
#[test]
fn cloudflared_ending_by_itself_leaves_the_link_offline() {
    let dir = tempfile::tempdir().unwrap();
    let program = unix::fake(
        dir.path(),
        "https://a.trycloudflare.com",
        "0",
        "sleep 0.5; exit 3",
    );
    let (m, _) = manager_with(CEILING);
    let door = FakeDoor::default();
    m.start(Box::new(door.clone()), &program, Mode::Quick)
        .unwrap();
    let view = wait_for(&m, Duration::from_secs(4), |v| v.state != LinkState::On);
    assert_eq!(
        (view.state, view.ended),
        (LinkState::Offline, Some(LinkEnd::Exited))
    );
    assert_eq!(
        closed(&door)[2..],
        ["origin -".to_owned(), "close".to_owned()]
    );
    // No silent restart; the person starts it again.
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(m.view().state, LinkState::Offline);
    assert!(m.extend().is_err());
}

#[cfg(unix)]
#[test]
fn an_own_address_has_its_hostname_and_no_ceiling() {
    let dir = tempfile::tempdir().unwrap();
    // A named tunnel prints no quick URL; it registers.
    let program = files::write_script(
        dir.path(),
        "cloudflared",
        &format!("#!/bin/sh\necho '{REGISTERED}' >&2\nexec sleep 600\n"),
    );
    let (m, _) = manager_with(Duration::from_millis(300));
    let door = FakeDoor::default();
    let view = m
        .start(
            Box::new(door.clone()),
            &program,
            Mode::Own {
                uuid: "6ff42ae2-765d-4adf-8112-31c55c1551ef".to_owned(),
                credentials: dir.path().join("6ff42ae2-765d-4adf-8112-31c55c1551ef.json"),
                hostname: "mesa.example.com".to_owned(),
            },
        )
        .unwrap();
    assert_eq!(view.origin.as_deref(), Some("https://mesa.example.com"));
    assert!(view.own && view.until_ms.is_none());
    assert!(m.extend().is_err());
    std::thread::sleep(Duration::from_millis(600));
    assert_eq!(m.view().state, LinkState::On, "no twelve-hour stop (D10)");
    m.stop(LinkEnd::Stopped);
}

#[cfg(unix)]
#[test]
fn a_short_run_says_its_words_and_is_stopped_at_its_timeout() {
    let dir = tempfile::tempdir().unwrap();
    let program = files::write_script(
        dir.path(),
        "cloudflared",
        "#!/bin/sh\ncase \"$1\" in\n--version) echo 'cloudflared version 2026.10.3 (built 2026-10-21-13:12 UTC)';;\n*) sleep 600;;\nesac\n",
    );
    assert!(run::version_check(&program, fetch::VERSION).is_ok());
    assert!(run::version_check(&program, "2099.1.1").is_err());
    let started = Instant::now();
    let err = run::run_step(&program, &["wait".into()], Duration::from_millis(300)).unwrap_err();
    assert!(err.contains("did not finish"), "{err}");
    assert!(started.elapsed() < Duration::from_secs(5));
}

/* ---------- My own address: the steps (D10) ---------- */

const UUID: &str = "6ff42ae2-765d-4adf-8112-31c55c1551ef";

#[test]
fn the_own_address_command_lines() {
    let home = Path::new("/home/p");
    let dir = Path::new("/conf/verso/tunnel");
    let cert = named::cert_path(home);
    assert_eq!(cert, Path::new("/home/p/.cloudflared/cert.pem"));
    let cred = named::credentials_path(dir, UUID);
    let s = |v: Vec<OsString>| {
        v.into_iter()
            .map(|a| a.to_string_lossy().into_owned())
            .collect::<Vec<_>>()
    };
    assert_eq!(s(named::login_args()), ["tunnel", "login"]);
    assert_eq!(
        s(named::create_args(
            &cert,
            &named::staging_path(dir, "verso-mesa"),
            "verso-mesa"
        )),
        [
            "tunnel",
            "--origincert",
            "/home/p/.cloudflared/cert.pem",
            "create",
            "--credentials-file",
            "/conf/verso/tunnel/.new-verso-mesa.json",
            "verso-mesa"
        ]
    );
    assert_eq!(
        s(named::route_dns_args(&cert, UUID, "mesa.example.com")),
        [
            "tunnel",
            "--origincert",
            "/home/p/.cloudflared/cert.pem",
            "route",
            "dns",
            UUID,
            "mesa.example.com"
        ]
    );
    assert_eq!(
        s(named::run_args(4242, &cred, UUID, false)),
        [
            "tunnel",
            "--no-autoupdate",
            "run",
            "--url",
            "http://127.0.0.1:4242",
            "--credentials-file",
            &format!("/conf/verso/tunnel/{UUID}.json"),
            UUID
        ]
    );
    assert_eq!(
        s(named::run_args(4242, &cred, UUID, true))[..4],
        ["tunnel", "--no-autoupdate", "--protocol", "http2"]
    );
    assert_eq!(
        s(named::delete_args(&cert, UUID)),
        [
            "tunnel",
            "--origincert",
            "/home/p/.cloudflared/cert.pem",
            "delete",
            UUID
        ]
    );
}

#[test]
fn the_own_address_touches_only_cert_pem_and_the_apps_directory() {
    let home = Path::new("/home/p");
    let dir = Path::new("/conf/verso/tunnel");
    let cert = named::cert_path(home);
    let cred = named::credentials_path(dir, UUID);
    for line in [
        named::login_args(),
        named::create_args(&cert, &named::staging_path(dir, "verso-mesa"), "verso-mesa"),
        named::route_dns_args(&cert, UUID, "mesa.example.com"),
        named::run_args(4242, &cred, UUID, true),
        named::delete_args(&cert, UUID),
    ] {
        for path in named::paths_of(&line) {
            assert!(
                path == cert || path.starts_with(dir),
                "{} in {line:?}",
                path.display()
            );
        }
    }
}

fn step(ok: bool, text: &str) -> Step {
    Step {
        ok,
        text: text.to_owned(),
    }
}

#[test]
fn the_own_address_outputs_are_read() {
    // As cloudflared's source words them (D10 read it); not yet observed.
    let login = "Please open the following URL and log in with your Cloudflare account:\n\nhttps://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2Fabc\n\nLeave cloudflared running to download the cert automatically.\nYou have successfully logged in.\nIf you wish to copy your credentials to a server, they have been saved to:\n/home/p/.cloudflared/cert.pem\n";
    assert_eq!(named::parse_login(&step(true, login)), Login::Done);
    assert!(
        named::login_url(login)
            .unwrap()
            .starts_with("https://dash.cloudflare.com/argotunnel?")
    );
    assert_eq!(
        named::parse_login(&step(
            false,
            "You have an existing certificate at /home/p/.cloudflared/cert.pem which login would overwrite.\nIf this is intentional, please move or delete that file then run this command again.\n"
        )),
        Login::AlreadyThere
    );
    assert!(matches!(
        named::parse_login(&step(false, "failed: context canceled")),
        Login::Failed(_)
    ));

    let created = format!(
        "Tunnel credentials written to /conf/verso/tunnel/.new-verso-mesa.json. cloudflared chose this file based on where your origin certificate was found. Keep this file secret. To revoke these credentials, delete the tunnel.\n\nCreated tunnel verso-mesa with id {UUID}\n"
    );
    assert_eq!(named::parse_create(&step(true, &created)).unwrap(), UUID);
    assert!(named::parse_create(&step(true, "Created tunnel x with id not-a-uuid\n")).is_err());
    let exists = named::parse_create(&step(
        false,
        "failed to create tunnel: Create Tunnel API call failed: tunnel with name already exists",
    ))
    .unwrap_err();
    assert!(exists.contains("already exists"), "{exists}");

    assert_eq!(
        named::parse_route(&step(
            true,
            &format!(
                "2026-11-04T01:00:00Z INF Added CNAME mesa.example.com which will route to this tunnel tunnelID={UUID}"
            )
        )),
        Route::Added
    );
    assert_eq!(
        named::parse_route(&step(
            true,
            &format!(
                "2026-11-04T01:00:00Z INF mesa.example.com is already configured to route to your tunnel tunnelID={UUID}"
            )
        )),
        Route::AlreadyOurs
    );
    assert_eq!(
        named::parse_route(&step(
            false,
            "Failed to add route: code: 1003, reason: Failed to create record mesa.example.com with err An A, AAAA, or CNAME record with that host already exists. For more details, refer to <https://developers.cloudflare.com/dns/manage-dns-records/troubleshooting/records-with-same-name/>."
        )),
        Route::Taken
    );
    let Route::Failed(words) =
        named::parse_route(&step(false, "error at https://mesa.example.com"))
    else {
        panic!("a failure")
    };
    assert!(!words.contains("mesa.example.com"), "{words}");
    assert!(named::parse_delete(&step(true, "")).is_ok());
    assert!(
        named::parse_delete(&step(
            false,
            "Cannot delete tunnel because it has active connections"
        ))
        .is_err()
    );
}

#[test]
fn hostnames_names_and_ids() {
    for good in ["mesa.example.com", "a.b", "x-1.example.co.uk"] {
        assert!(named::valid_hostname(good), "{good}");
    }
    for bad in [
        "example",
        "Mesa.example.com",
        "-a.example.com",
        "a..b",
        "a.b/c",
        "a.b:443",
        "",
    ] {
        assert!(!named::valid_hostname(bad), "{bad}");
    }
    assert!(named::valid_name("verso-mesa_1"));
    assert!(
        !named::valid_name("no spaces") && !named::valid_name("") && !named::valid_name("../x")
    );
    assert!(named::valid_uuid(UUID));
    assert!(!named::valid_uuid("6FF42AE2-765D-4ADF-8112-31C55C1551EF") && !named::valid_uuid("x"));
}

#[cfg(unix)]
#[test]
fn create_keeps_the_credentials_as_uuid_json_0600() {
    let dir = tempfile::tempdir().unwrap();
    let bin = tempfile::tempdir().unwrap();
    let data = dir.path().join("tunnel");
    // Writes the file --credentials-file names, then says what it made.
    let program = files::write_script(
        bin.path(),
        "cloudflared",
        &format!(
            "#!/bin/sh\nwhile [ $# -gt 0 ]; do\n  if [ \"$1\" = --credentials-file ]; then shift; echo '{{\"TunnelID\":\"{UUID}\"}}' > \"$1\"; fi\n  shift\ndone\necho 'Created tunnel verso-mesa with id {UUID}'\n"
        ),
    );
    let uuid = named::create(&program, Path::new("/home/p"), &data, "verso-mesa").unwrap();
    assert_eq!(uuid, UUID);
    let kept = named::credentials_path(&data, UUID);
    assert_eq!(files::names_in(&data), [format!("{UUID}.json")]);
    assert_eq!(files::mode_of(&kept), 0o600);
    assert_eq!(files::mode_of(&data), 0o700);
    assert!(named::create(&program, Path::new("/home/p"), &data, "bad name").is_err());
}
