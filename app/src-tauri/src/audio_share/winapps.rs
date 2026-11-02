// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Which applications make the sound Windows reports (ADR 0116 item 17), the
//! pure half of the Windows source list: the audio service tells the
//! processes that hold an audio session, the process table tells who started
//! whom, and this decides which application each session belongs to, which
//! process to capture (the root of its tree, because a browser's sound comes
//! from a helper process and process loopback takes the target's tree) and
//! what to call it. No system call here, so it is tested on every system;
//! `windows_source.rs` feeds it.

use verso_contract::{SOURCE_NAME_MOST, name_ok};

/// The id of "everything this PC plays", where the system can leave Verso's
/// own sounds out (Windows 11, build 20348 and later).
pub const SYSTEM_ID: &str = "system";

/// The id of "everything this PC plays" where it cannot: Windows 10 captures
/// the default output as it is, Verso's own sounds included, so Verso mutes
/// them while it shares and the window says so. The window knows this exact
/// id (`SYSTEM_ALL_ID` in `shareWords.ts`).
pub const SYSTEM_ALL_ID: &str = "system-all";

/// The prefix of an application's id; the rest is its program's file name,
/// in lower case (`app:spotify.exe`).
pub const APP_PREFIX: &str = "app:";

/// The first Windows build with process loopback (Windows 11 and Server
/// 2022; the API is documented from build 20348).
pub const PER_APP_BUILD: u32 = 20_348;

/// Whether this build of Windows can capture one application's process
/// tree, or everything but one.
#[must_use]
pub const fn per_app(build: u32) -> bool {
    build >= PER_APP_BUILD
}

/// A process of the system's table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Proc {
    pub pid: u32,
    pub parent: u32,
    /// The program's file name (`Spotify.exe`).
    pub exe: String,
}

/// An application with sound: the process to capture the tree of, and the
/// program it runs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct App {
    /// The program's file name in lower case: what the id carries.
    pub key: String,
    /// The root of the application's tree: the oldest ancestor running the
    /// same program.
    pub root: u32,
    /// The file name as the table has it.
    pub exe: String,
}

fn find(procs: &[Proc], pid: u32) -> Option<&Proc> {
    procs.iter().find(|p| p.pid == pid)
}

/// Whether `pid` is `ancestor` or descends from it. A bounded climb: a loop
/// in the table (a pid reused) cannot hold us.
#[must_use]
pub fn inside(pid: u32, ancestor: u32, procs: &[Proc]) -> bool {
    let mut at = pid;
    for _ in 0..64 {
        if at == ancestor {
            return true;
        }
        match find(procs, at) {
            Some(p) if p.parent != 0 && p.parent != at => at = p.parent,
            _ => return false,
        }
    }
    false
}

/// The root of `pid`'s application: the farthest ancestor that runs the same
/// program (`chrome.exe` helpers go up to the `chrome.exe` that started
/// them, and stop there, below the shell that started the browser).
#[must_use]
pub fn root_of(pid: u32, procs: &[Proc]) -> u32 {
    let Some(me) = find(procs, pid) else {
        return pid;
    };
    let mut root = me;
    for _ in 0..64 {
        match find(procs, root.parent) {
            Some(up) if up.pid != root.pid && up.exe.eq_ignore_ascii_case(&me.exe) => root = up,
            _ => break,
        }
    }
    root.pid
}

/// The applications that hold audio sessions, one per program, without
/// Verso and what it started (the person shares other things; its web view's
/// processes are in its tree) and without the system's own session (pid 0).
/// Sorted by file name; the display names come from [`App`]s later.
#[must_use]
pub fn apps(session_pids: &[u32], procs: &[Proc], own: u32) -> Vec<App> {
    let mut out: Vec<App> = Vec::new();
    for &pid in session_pids {
        if pid == 0 || inside(pid, own, procs) {
            continue;
        }
        let Some(p) = find(procs, pid) else { continue };
        let key = p.exe.to_lowercase();
        if key.is_empty() || out.iter().any(|a| a.key == key) {
            continue;
        }
        out.push(App {
            key,
            root: root_of(pid, procs),
            exe: p.exe.clone(),
        });
    }
    out.sort_by(|a, b| a.key.cmp(&b.key));
    out
}

/// A name for a program with no file description: its file name without the
/// extension, the first letter in capitals (`spotify.exe` is `Spotify`).
#[must_use]
pub fn pretty(exe: &str) -> String {
    let stem = exe
        .strip_suffix(".exe")
        .or_else(|| exe.strip_suffix(".EXE"))
        .unwrap_or(exe);
    let mut chars = stem.chars();
    chars
        .next()
        .map(|c| c.to_uppercase().chain(chars).collect())
        .unwrap_or_default()
}

/// A name the contract accepts: control characters out, cut to length, and
/// when nothing is left, the file name's.
#[must_use]
pub fn clean(name: &str, exe: &str) -> String {
    let said: String = name
        .chars()
        .filter(|c| !c.is_control())
        .take(SOURCE_NAME_MOST)
        .collect::<String>()
        .trim()
        .to_owned();
    if name_ok(&said) {
        said
    } else {
        pretty(exe).chars().take(SOURCE_NAME_MOST).collect()
    }
}

/// The program file name an application id names, or `None`.
#[must_use]
pub fn exe_of(id: &str) -> Option<&str> {
    id.strip_prefix(APP_PREFIX).filter(|e| !e.is_empty())
}

/// The id of an application.
#[must_use]
pub fn id_of(app: &App) -> String {
    format!("{APP_PREFIX}{}", app.key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proc(pid: u32, parent: u32, exe: &str) -> Proc {
        Proc {
            pid,
            parent,
            exe: exe.to_owned(),
        }
    }

    #[test]
    fn process_loopback_starts_at_build_20348() {
        assert!(!per_app(19_045));
        assert!(!per_app(20_347));
        assert!(per_app(20_348));
        assert!(per_app(22_631));
    }

    #[test]
    fn a_helper_goes_up_to_the_root_of_its_program_and_no_further() {
        let procs = [
            proc(1, 0, "explorer.exe"),
            proc(10, 1, "chrome.exe"),
            proc(11, 10, "chrome.exe"),
            proc(12, 11, "chrome.exe"),
            proc(20, 1, "Spotify.exe"),
        ];
        assert_eq!(root_of(12, &procs), 10);
        assert_eq!(root_of(10, &procs), 10);
        assert_eq!(root_of(20, &procs), 20);
        // Unknown to the table: itself.
        assert_eq!(root_of(99, &procs), 99);
    }

    #[test]
    fn programs_are_listed_once_by_file_name_without_verso_or_the_system() {
        let procs = [
            proc(1, 0, "explorer.exe"),
            proc(10, 1, "chrome.exe"),
            proc(11, 10, "chrome.exe"),
            proc(20, 1, "Spotify.exe"),
            proc(30, 1, "Verso.exe"),
            proc(31, 30, "msedgewebview2.exe"),
            proc(32, 31, "msedgewebview2.exe"),
        ];
        // Two chrome sessions, spotify, verso's own and its web view, the system (0).
        let list = apps(&[11, 10, 20, 30, 32, 0, 77], &procs, 30);
        let keys: Vec<_> = list.iter().map(|a| a.key.as_str()).collect();
        assert_eq!(keys, ["chrome.exe", "spotify.exe"]);
        assert_eq!(list[0].root, 10);
        assert_eq!(list[1].root, 20);
        assert_eq!(id_of(&list[1]), "app:spotify.exe");
    }

    #[test]
    fn what_verso_started_is_found_down_the_parents_and_a_loop_ends() {
        let procs = [proc(30, 1, "Verso.exe"), proc(31, 30, "a.exe")];
        assert!(inside(31, 30, &procs));
        assert!(inside(30, 30, &procs));
        assert!(!inside(1, 30, &procs));
        let looped = [proc(5, 6, "a.exe"), proc(6, 5, "b.exe")];
        assert!(!inside(5, 99, &looped));
        assert_eq!(root_of(5, &looped), 5);
    }

    #[test]
    fn names_are_made_fit_for_the_contract() {
        assert_eq!(pretty("spotify.exe"), "Spotify");
        assert_eq!(pretty("VLC.EXE"), "VLC");
        assert_eq!(clean("Google Chrome", "chrome.exe"), "Google Chrome");
        // Nothing usable: the file name's.
        assert_eq!(clean("\u{7}\u{8}", "chrome.exe"), "Chrome");
        assert_eq!(clean("", "foo.exe"), "Foo");
        let long = "b".repeat(300);
        assert!(name_ok(&clean(&long, "x.exe")));
        assert!(!clean("A\u{7}B", "x.exe").contains('\u{7}'));
    }

    #[test]
    fn ids_name_programs() {
        assert_eq!(exe_of("app:spotify.exe"), Some("spotify.exe"));
        assert_eq!(exe_of("app:"), None);
        assert_eq!(exe_of("system"), None);
        assert_eq!(exe_of(SYSTEM_ALL_ID), None);
    }
}
