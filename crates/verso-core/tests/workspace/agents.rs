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
