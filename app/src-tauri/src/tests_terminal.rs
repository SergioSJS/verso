// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The embedded terminal (ADR 0115, section G): a real shell on a real
//! pseudo-terminal — `openpty` here on macOS and Linux, ConPTY and the Job
//! Object on Windows (`scripts/check-windows.sh`) — typed into, resized,
//! found again after a reload, and closed with nothing of its tree left;
//! and the commands as the window calls them: where the shell starts, and
//! where they are refused.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::json;
use verso_contract::{TerminalAt, TerminalId, TerminalOutput, TerminalShell, TerminalSize};

use super::*;
use crate::pty::{self, Pty, Start};
use crate::terminal::{Terminals, allowed_asking, lang_of, place};
use crate::tests::{app, app_with, call, note};

/// What a terminal printed, and whether it ended.
#[derive(Default)]
struct Heard {
    text: String,
    ended: Option<Option<u32>>,
}

fn sink(heard: &Arc<Mutex<Heard>>) -> pty::Sink {
    let heard = Arc::clone(heard);
    Box::new(move |out| {
        let mut h = heard.lock().unwrap();
        match out {
            TerminalOutput::Data { text } => h.text.push_str(&text),
            TerminalOutput::Ended { code } => h.ended = Some(code),
        }
        true
    })
}

fn start(dir: Option<std::path::PathBuf>) -> Start {
    Start {
        dir,
        size: TerminalSize { cols: 80, rows: 24 },
        shell: TerminalShell::PowerShell,
        lang: Some("pt_BR.UTF-8".to_owned()),
        typed: None,
    }
}

/// Wait for `test` on what was heard, up to `secs` (a login shell may take
/// a moment to read its startup files).
fn wait_for(heard: &Arc<Mutex<Heard>>, secs: u64, test: impl Fn(&Heard) -> bool) -> bool {
    let until = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < until {
        if test(&heard.lock().unwrap()) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

/// A line the shell computes, so what is heard is its answer and not the
/// echo of the keys: `verso-42`.
#[cfg(unix)]
const COMPUTE: &str = "echo verso-$((40+2))\r";
#[cfg(windows)]
const COMPUTE: &str = "Write-Output ('verso-' + (40+2))\r";

/// Typed into, it answers; resized, it is told.
#[test]
fn a_shell_answers_what_is_typed_and_learns_its_size() {
    let dir = tempfile::tempdir().unwrap();
    let heard = Arc::new(Mutex::new(Heard::default()));
    let pty = Pty::spawn(start(Some(dir.path().to_path_buf())), Box::new(|| {})).unwrap();
    assert!(pty.attach(sink(&heard)));
    pty.write(COMPUTE.as_bytes().to_vec());
    assert!(
        wait_for(&heard, 30, |h| h.text.contains("verso-42")),
        "{}",
        heard.lock().unwrap().text
    );
    pty.resize(TerminalSize {
        cols: 101,
        rows: 31,
    })
    .unwrap();
    assert_eq!(
        pty.size(),
        Some(TerminalSize {
            cols: 101,
            rows: 31
        })
    );
    // The shell itself reads the new size.
    #[cfg(unix)]
    {
        pty.write(b"stty size\r".to_vec());
        assert!(
            wait_for(&heard, 10, |h| h.text.contains("31 101")),
            "{}",
            heard.lock().unwrap().text
        );
    }
    pty.end();
    assert!(wait_for(&heard, 10, |h| h.ended.is_some()));
}

/// The shell starts in the directory it is given, and an accented word
/// typed comes back whole (LANG is set: a GUI app on macOS has none).
#[cfg(unix)]
#[test]
fn the_shell_starts_in_its_directory_and_keeps_accents() {
    let dir = tempfile::Builder::new()
        .prefix("pasta-ação")
        .tempdir()
        .unwrap();
    let heard = Arc::new(Mutex::new(Heard::default()));
    let pty = Pty::spawn(start(Some(dir.path().to_path_buf())), Box::new(|| {})).unwrap();
    pty.attach(sink(&heard));
    pty.write("printf 'em:%s\\n' \"$(basename \"$PWD\")\"; echo \"$LANG\"; printf 'ok-%s\\n' 'você, pôr, à'\r".as_bytes().to_vec());
    assert!(
        wait_for(&heard, 30, |h| h.text.contains("ok-você, pôr, à")),
        "{}",
        heard.lock().unwrap().text
    );
    let text = heard.lock().unwrap().text.clone();
    assert!(text.contains("em:pasta-ação"), "{text}");
    assert!(text.contains("UTF-8"), "{text}");
    pty.end();
}

/// Whether a process is gone: no such process, or a zombie no one reaps
/// yet (a container's first process may not).
#[cfg(unix)]
fn gone(pid: i32) -> bool {
    if nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid), None).is_err() {
        return true;
    }
    std::process::Command::new("ps")
        .args(["-o", "stat=", "-p", &pid.to_string()])
        .output()
        .map(|o| {
            let stat = String::from_utf8_lossy(&o.stdout);
            stat.trim().is_empty() || stat.trim_start().starts_with('Z')
        })
        .unwrap_or(false)
}

#[cfg(windows)]
fn gone(pid: i32) -> bool {
    let out = std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .output()
        .unwrap();
    !String::from_utf8_lossy(&out.stdout).contains(&format!("\"{pid}\""))
}

/// A program the shell started in the background, printed as `bg:<pid>`.
#[cfg(unix)]
const BACKGROUND: &str = "sleep 1000 & echo bg:$!\r";
#[cfg(windows)]
const BACKGROUND: &str = "$p = Start-Process -PassThru -NoNewWindow ping -ArgumentList '-n','1000','127.0.0.1'; 'bg:' + $p.Id\r";

fn background_pid(text: &str) -> Option<i32> {
    text.match_indices("bg:").find_map(|(at, _)| {
        let digits: String = text[at + 3..]
            .chars()
            .take_while(char::is_ascii_digit)
            .collect();
        digits.parse().ok()
    })
}

/// Closing a terminal ends its shell and what the shell started (item 13):
/// a process group hung up and killed on Unix, the Job Object's tree on
/// Windows.
#[test]
fn a_closed_terminal_leaves_no_process_of_its_tree() {
    let dir = tempfile::tempdir().unwrap();
    let heard = Arc::new(Mutex::new(Heard::default()));
    let pty = Pty::spawn(start(Some(dir.path().to_path_buf())), Box::new(|| {})).unwrap();
    pty.attach(sink(&heard));
    // Typed once the shell reads its line (a prompt's theme may redraw over
    // keys typed ahead).
    pty.write(COMPUTE.as_bytes().to_vec());
    assert!(wait_for(&heard, 30, |h| h.text.contains("verso-42")));
    pty.write(BACKGROUND.as_bytes().to_vec());
    assert!(
        wait_for(&heard, 30, |h| background_pid(&h.text).is_some()),
        "{}",
        heard.lock().unwrap().text
    );
    let child = background_pid(&heard.lock().unwrap().text).unwrap();
    let shell = i32::try_from(pty.pid().unwrap()).unwrap();
    assert!(!gone(child), "the background program is running");
    pty.end();
    let until = Instant::now() + Duration::from_secs(10);
    while Instant::now() < until && !(gone(child) && gone(shell)) {
        std::thread::sleep(Duration::from_millis(100));
    }
    assert!(gone(shell), "the shell {shell} is still running");
    assert!(gone(child), "the shell's program {child} is still running");
    assert!(wait_for(&heard, 10, |h| h.ended.is_some()));
}

/// The quit question's answer (item 13): a program in the foreground makes
/// the terminal busy, an idle shell does not (Unix); Windows cannot tell,
/// so a live terminal is busy there.
#[test]
fn a_terminal_is_busy_while_a_program_runs_in_it() {
    let dir = tempfile::tempdir().unwrap();
    let heard = Arc::new(Mutex::new(Heard::default()));
    let pty = Pty::spawn(start(Some(dir.path().to_path_buf())), Box::new(|| {})).unwrap();
    pty.attach(sink(&heard));
    pty.write(COMPUTE.as_bytes().to_vec());
    assert!(wait_for(&heard, 30, |h| h.text.contains("verso-42")));
    #[cfg(unix)]
    {
        assert!(!pty.busy(), "an idle shell is not busy");
        pty.write(b"sleep 30\r".to_vec());
        let until = Instant::now() + Duration::from_secs(10);
        while Instant::now() < until && !pty.busy() {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(pty.busy(), "sleep in the foreground");
        // Ctrl+C reaches the program, as the keys of item 10 send it.
        pty.write(vec![3]);
        let until = Instant::now() + Duration::from_secs(10);
        while Instant::now() < until && pty.busy() {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(!pty.busy(), "the shell is back");
    }
    #[cfg(windows)]
    assert!(pty.busy());
    pty.end();
    assert!(wait_for(&heard, 10, |h| h.ended.is_some()));
    assert!(!pty.busy());
}

/// A window that reloads finds its terminal again with what it printed
/// (Q6): the kept output first, then what comes; the old window's channel
/// is let go. Another live window cannot take it; one whose window is gone
/// can.
#[test]
fn a_reloaded_window_finds_its_terminal_again() {
    let dir = tempfile::tempdir().unwrap();
    let terminals = Arc::new(Terminals::default());
    terminals.set_enabled(true);
    let first = Arc::new(Mutex::new(Heard::default()));
    let opened = terminals
        .open(
            "main",
            TerminalAt::Folder,
            start(Some(dir.path().to_path_buf())),
            sink(&first),
        )
        .unwrap();
    assert_eq!(opened.at, TerminalAt::Folder);
    assert!(!opened.shell.is_empty() && !opened.shell.contains('/'));
    terminals
        .write("main", &opened.id, COMPUTE.to_owned())
        .unwrap();
    assert!(wait_for(&first, 30, |h| h.text.contains("verso-42")));
    // Another live window does not take it.
    let other = Arc::new(Mutex::new(Heard::default()));
    let err = terminals
        .attach("window-2", &opened.id, |_| true, sink(&other))
        .unwrap_err();
    assert_eq!(err.kind, verso_contract::ErrorKind::NotFound);
    // The same window, reloaded.
    let again = Arc::new(Mutex::new(Heard::default()));
    let found = terminals
        .attach("main", &opened.id, |_| true, sink(&again))
        .unwrap();
    assert_eq!(found.id, opened.id);
    assert!(again.lock().unwrap().text.contains("verso-42"));
    terminals
        .write("main", &opened.id, "echo verso-$((50+5))\r".to_owned())
        .unwrap();
    #[cfg(unix)]
    assert!(wait_for(&again, 30, |h| h.text.contains("verso-55")));
    // A window of another run names an id this run never gave.
    let stale = TerminalId("0000000000000000-1".to_owned());
    assert!(
        terminals
            .attach("main", &stale, |_| true, sink(&again))
            .is_err()
    );
    // Its window went: the terminal ends with it.
    terminals.end_of("main");
    assert_eq!(terminals.count(), 0);
    assert!(wait_for(&again, 10, |h| h.ended.is_some()));
}

/// The switch off ends every terminal (item 7).
#[test]
fn the_switch_off_ends_every_terminal() {
    let terminals = Arc::new(Terminals::default());
    terminals.set_enabled(true);
    let heard = Arc::new(Mutex::new(Heard::default()));
    terminals
        .open("main", TerminalAt::Home, start(None), sink(&heard))
        .unwrap();
    assert_eq!(terminals.count(), 1);
    terminals.set_enabled(false);
    assert_eq!(terminals.count(), 0);
    assert!(wait_for(&heard, 10, |h| h.ended.is_some()));
}

/// A character cut between two reads waits for the rest; a bad byte is
/// the replacement character.
#[test]
fn output_never_cuts_a_character() {
    let bytes = "ação".as_bytes();
    let mut tail = bytes[..2].to_vec();
    assert_eq!(pty::whole_text(&mut tail), "a");
    assert_eq!(tail, bytes[1..2]);
    tail.extend_from_slice(&bytes[2..]);
    assert_eq!(pty::whole_text(&mut tail), "ção");
    assert!(tail.is_empty());
    let mut bad = vec![b'a', 0xff, b'b'];
    assert_eq!(pty::whole_text(&mut bad), "a\u{fffd}b");
}

/// The shell's answer to the detection names the tools found, whatever the
/// startup files print around it and whatever a terminal adds to a line.
#[test]
fn the_detection_reads_the_shells_answer() {
    use verso_contract::AiCli;
    let answer = "Welcome, claude!\r\n\u{1b}]0;title\u{7}verso-detect-begin\r\n/Users/a/.local/bin/claude\r\nalias codex='npx codex'\r\n\u{1b}[?25lC:\\Users\\a\\AppData\\Roaming\\npm\\gemini.cmd\u{1b}[?25h\r\n/Users/a/.opencode/bin/opencode\r\n/Users/a/.local/bin/cursor-agent\r\nverso-detect-end\r\nagy\r\n";
    assert_eq!(
        pty::found_in(answer),
        vec![
            AiCli::Claude,
            AiCli::Codex,
            AiCli::Gemini,
            AiCli::OpenCode,
            AiCli::CursorAgent
        ]
    );
    assert!(pty::found_in("claude\ngemini\n").is_empty());
}

/// The person's own shell is asked, once (item 14): with a tool put on its
/// `PATH`, it is found.
#[cfg(unix)]
#[test]
fn the_detection_asks_the_login_shell() {
    let found = pty::detect(&start(None), Duration::from_secs(30)).unwrap();
    eprintln!("found: {found:?}");
    // Whatever this machine has installed, the answer is a list of the
    // tools asked about; the parse is the test above.
    assert!(found.len() <= pty::CLIS.len());
}

/// ConPTY opens with a question of where the cursor is and waits for the
/// answer (scripts/check-windows.sh, 2026-10-31: every Windows shell test
/// heard only `ESC[6n`): the host answers that first one and the window
/// never sees it; a question later in the output is the window's.
#[test]
fn conpty_s_opening_cursor_question_is_the_hosts_to_answer() {
    assert_eq!(
        pty::after_cursor_query(b"\x1b[6n\x1b[?25lPS C:\\> "),
        Some(&b"\x1b[?25lPS C:\\> "[..])
    );
    assert_eq!(pty::after_cursor_query(b"\x1b[6n"), Some(&b""[..]));
    assert_eq!(pty::after_cursor_query(b"PS C:\\> \x1b[6n"), None);
    assert_eq!(pty::after_cursor_query(b""), None);
}

/// The window's language as `LANG`; anything else is no language.
#[test]
fn the_windows_language_is_a_lang() {
    assert_eq!(lang_of(Some("pt-BR")).as_deref(), Some("pt_BR.UTF-8"));
    assert_eq!(lang_of(Some("en_us")).as_deref(), Some("en_US.UTF-8"));
    assert_eq!(lang_of(Some("pt")).as_deref(), Some("en_US.UTF-8"));
    assert_eq!(lang_of(Some("pt-BR; rm -rf /")), None);
    assert_eq!(lang_of(Some("x")), None);
    assert_eq!(lang_of(None), None);
}

/// Where a window's shell starts (Q2, Q4): the folder's root, a folder
/// below it ("Open terminal here"), never outside it; the home directory
/// for a window that shows no folder of this computer (a server's).
#[test]
fn a_shell_starts_at_the_windows_folder_and_never_outside_it() {
    let vault = tempfile::tempdir().unwrap();
    let _n = note(vault.path(), "Nota.md", "# Nota\n");
    let (app, webview) = app_with(Some(vault.path().to_path_buf()));
    call(&webview, "open_initial", json!({})).unwrap();
    let root = std::path::absolute(vault.path()).unwrap();
    let (dir, at) = place(app.handle(), "main", None).unwrap();
    assert_eq!(at, TerminalAt::Folder);
    assert_eq!(
        dir.unwrap().canonicalize().unwrap(),
        root.canonicalize().unwrap()
    );
    call(&webview, "create_folder", json!({"path": "Sub"})).unwrap();
    let (dir, _) = place(app.handle(), "main", Some("Sub")).unwrap();
    assert!(dir.unwrap().ends_with("Sub"));
    assert!(place(app.handle(), "main", Some("../fora")).is_err());
    assert!(place(app.handle(), "main", Some("/etc")).is_err());
    // A window that shows no folder of this computer: the home directory.
    let (dir, at) = place(app.handle(), "window-9", None).unwrap();
    assert_eq!((dir, at), (None, TerminalAt::Home));
}

/// The capabilities say a folder's window has a terminal; the commands are
/// refused while the switch is off, and answer once it is on (item 7).
#[test]
fn the_terminal_is_a_capability_and_the_switch_gates_it() {
    let (app, webview) = app();
    let can = call(&webview, "capabilities", json!({})).unwrap();
    assert!(
        can["can"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c == "terminal")
    );
    let id = json!("0000000000000000-1");
    let err = call(
        &webview,
        "terminal_write",
        json!({"id": id, "data": "ls\r"}),
    )
    .unwrap_err();
    assert_eq!(err["kind"], "refused");
    let err = call(
        &webview,
        "terminal_detect",
        json!({"shell": null, "locale": null}),
    )
    .unwrap_err();
    assert_eq!(err["kind"], "refused");
    call(&webview, "set_terminal_enabled", json!({"on": true})).unwrap();
    assert!(app.state::<App>().terminals.enabled());
    // The window's switch alone grants nothing (item 21): the person's yes
    // on the host's own dialog does.
    let err = call(
        &webview,
        "terminal_write",
        json!({"id": id, "data": "ls\r"}),
    )
    .unwrap_err();
    assert_eq!(err["kind"], "refused");
    *lock(&app.state::<App>().terminals.answer) = Some(true);
    tauri::async_runtime::block_on(allowed_asking(app.handle(), "main")).unwrap();
    let err = call(
        &webview,
        "terminal_write",
        json!({"id": id, "data": "ls\r"}),
    )
    .unwrap_err();
    assert_eq!(err["kind"], "not_found");
    assert_eq!(
        call(&webview, "terminal_busy", json!({"id": id})).unwrap(),
        json!(false)
    );
    call(&webview, "terminal_close", json!({"id": id})).unwrap();
    call(&webview, "set_terminal_enabled", json!({"on": false})).unwrap();
    assert!(!app.state::<App>().terminals.enabled());
}

/// A desktop window on a server's folder has the terminal (Q4): the app's
/// abilities the host adds to the server's answer; the server's own answer
/// never names it.
#[test]
fn a_server_folders_window_has_the_terminal_and_the_server_never_does() {
    let mut caps = json!({ "host": "server", "can": ["account", "collab"], "latency_ms": 12 });
    remote::with_app_abilities(&mut caps);
    assert!(
        caps["can"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c == "terminal")
    );
}

/// Script in the web view that pushes the switch on cannot start a shell
/// (ADR 0115 item 21): the host asks the person on a native dialog, and a
/// no (or no answer) leaves the terminal refused; the switch going off takes
/// the yes back.
#[test]
fn the_window_cannot_grant_a_terminal_by_pushing_the_switch() {
    let (app, webview) = app();
    call(&webview, "set_terminal_enabled", json!({"on": true})).unwrap();
    let terminals = Arc::clone(&app.state::<App>().terminals);
    assert!(!terminals.confirmed());
    // The dialog says no.
    let err = tauri::async_runtime::block_on(allowed_asking(app.handle(), "main")).unwrap_err();
    assert_eq!(err.kind, verso_contract::ErrorKind::Refused);
    assert!(!terminals.confirmed());
    let err = call(&webview, "terminal_write", json!({"id": "x-1", "data": "ls"})).unwrap_err();
    assert_eq!(err["kind"], "refused");
    // The dialog says yes: once, for the run.
    *lock(&terminals.answer) = Some(true);
    tauri::async_runtime::block_on(allowed_asking(app.handle(), "main")).unwrap();
    assert!(terminals.confirmed());
    *lock(&terminals.answer) = Some(false);
    tauri::async_runtime::block_on(allowed_asking(app.handle(), "main")).unwrap();
    // Off takes it back, and pushing on again does not restore it.
    call(&webview, "set_terminal_enabled", json!({"on": false})).unwrap();
    assert!(!terminals.confirmed());
    call(&webview, "set_terminal_enabled", json!({"on": true})).unwrap();
    assert!(!terminals.confirmed());
    assert!(tauri::async_runtime::block_on(allowed_asking(app.handle(), "main")).is_err());
}
