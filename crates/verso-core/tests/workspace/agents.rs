// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folders agents may reach (ADR 0054, revised 2026-10-08): hidden
//! until marked, known by their indexes, and every call logged.

use super::*;
use verso_core::agents;

#[test]
fn a_folder_is_hidden_from_agents_until_marked() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = note(vault.path(), "Nota.md", "# Nota\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let key = ws.key();

    let known = agents::known(Some(config.path())).unwrap();
    assert_eq!(known.len(), 1);
    assert_eq!(known[0].key, key);
    assert!(!known[0].visible, "hidden until marked");
    assert!(!agents::is_visible(Some(config.path()), &key).unwrap());

    agents::set_visible(Some(config.path()), &key, true).unwrap();
    assert!(agents::is_visible(Some(config.path()), &key).unwrap());
    assert!(agents::known(Some(config.path())).unwrap()[0].visible);

    agents::set_visible(Some(config.path()), &key, false).unwrap();
    assert!(!agents::is_visible(Some(config.path()), &key).unwrap());

    // Only a key this core issues is marked.
    assert!(agents::set_visible(Some(config.path()), "../x", true).is_err());
}

#[test]
fn every_call_of_an_agent_is_logged() {
    let config = tempfile::tempdir().unwrap();
    agents::log_call(
        Some(config.path()),
        "search",
        "Cofre-0123456789abcdef",
        "reunião",
    );
    agents::log_call(
        Some(config.path()),
        "read_note",
        "Cofre-0123456789abcdef",
        "Pessoal/Diário.md",
    );
    let log = agents::calls(Some(config.path())).unwrap();
    let lines: Vec<&str> = log.lines().collect();
    assert_eq!(lines.len(), 2, "{log}");
    assert!(
        lines[0].ends_with("search on Cofre-0123456789abcdef: reunião"),
        "{log}"
    );
    assert!(
        lines[1].contains("read_note on Cofre-0123456789abcdef: Pessoal/Diário.md"),
        "{log}"
    );
}

#[test]
fn a_huge_argument_is_cut_in_the_log() {
    let config = tempfile::tempdir().unwrap();
    let words = "dragão ".repeat(10_000);
    agents::log_call(Some(config.path()), "search", "k", &words);
    let log = agents::calls(Some(config.path())).unwrap();
    assert!(
        log.chars().count() < 400,
        "{} characters",
        log.chars().count()
    );
    assert!(log.trim_end().ends_with('…'), "{log}");
}

#[test]
fn marks_that_do_not_read_are_not_written_over() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = note(vault.path(), "Nota.md", "# Nota\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    std::fs::write(config.path().join("agents.json"), "{ not json").unwrap();
    // Read as no folder at all (fail closed), and left as it is.
    assert!(!agents::is_visible(Some(config.path()), &ws.key()).unwrap());
    assert!(agents::set_visible(Some(config.path()), &ws.key(), true).is_err());
    assert_eq!(
        std::fs::read_to_string(config.path().join("agents.json")).unwrap(),
        "{ not json"
    );
}

/// Two servers logging at once both keep every line: each call appends in
/// one write (allowed 2026-10-09).
#[test]
fn calls_logged_at_once_are_all_kept() {
    let config = tempfile::tempdir().unwrap();
    let dir = config.path().to_path_buf();
    let threads: Vec<_> = (0..2)
        .map(|t| {
            let dir = dir.clone();
            std::thread::spawn(move || {
                for i in 0..200 {
                    agents::log_call(Some(&dir), "search", "k", &format!("t{t} {i}"));
                }
            })
        })
        .collect();
    for t in threads {
        t.join().unwrap();
    }
    let log = agents::calls(Some(&dir)).unwrap();
    assert_eq!(log.lines().count(), 400, "{log}");
}

/// Past 1 MiB the log is cut back to its last 2,000 calls, newest kept.
#[test]
fn a_long_log_is_cut_to_its_last_calls() {
    let config = tempfile::tempdir().unwrap();
    let words = "x".repeat(290);
    for i in 0..4000 {
        agents::log_call(Some(config.path()), "search", "k", &format!("{i} {words}"));
    }
    let log = agents::calls(Some(config.path())).unwrap();
    let lines: Vec<&str> = log.lines().collect();
    assert!(
        lines.len() <= 4000 && lines.len() >= 2000,
        "{}",
        lines.len()
    );
    assert!(log.len() <= 1024 * 1024 + 400, "{}", log.len());
    assert!(
        lines.last().unwrap().contains("3999 "),
        "the newest call is kept"
    );
}
