// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A table moved to the other host (ADR 0117 D8, R9), the desktop's side:
//! a folder of this computer served from here by the link that also syncs
//! with a UniVerso, both ways. From the window at this computer's own table
//! the table moves to the UniVerso; from a window on the UniVerso's folder
//! it moves here. Each time the new host has the table and nothing of the
//! old host's log, and the old host's table is closed, marked moved, and
//! keeps its log. A child of `tests_local_seat`, whose helpers it shares.

use super::*;

/// The folder's sync with the UniVerso turned on, and its live link up:
/// what the move to the UniVerso goes through.
fn syncing(s: &Served, universo: &super::super::tests_sync::Running, key: &str) {
    let on = call(
        &s.webview,
        "folder_sync_start",
        json!({ "url": universo.url, "folder": universo.folder, "name": null }),
    )
    .unwrap();
    assert_eq!(on["on"], true, "{on}");
    waited("the sync's link came up", || {
        sync_commands::running(s.app.handle(), key)
            .is_some_and(|r| sync::live::up(&r).is_some() && r.live.remote().is_some())
    });
}

/// From the window at this computer's own table, to the UniVerso the folder
/// syncs with: the table is made there with nothing of this computer's log,
/// and this computer's table, closed and moved, keeps its log and sends its
/// player out, told it moved.
#[test]
fn a_table_moves_from_this_computer_to_the_universo() {
    let (universo, s, key) = signed_in();
    syncing(&s, &universo, &key);
    // No other host before the window sits: a folder of this computer alone.
    let none = call(&s.webview, "local_server_table_host", json!({})).unwrap();
    assert!(none.is_null(), "{none}");
    call(&s.webview, "local_server_sit_at_table", json!({})).unwrap();
    let mut ana = invite_ana(&s);
    let said = ask(&mut ana, 3, "table_say", json!({ "text": "da mesa daqui" }));
    assert!(said.get("ok").is_some(), "{said}");

    let other = call(&s.webview, "local_server_table_host", json!({})).unwrap();
    assert_eq!(other["to"], "universo", "{other}");
    assert_eq!(other["url"], universo.url.as_str());
    assert_eq!(other["folder"], universo.folder.as_str());
    let moved = call(&s.webview, "local_server_move_table", json!({ "root": "" })).unwrap();
    assert_eq!(moved, other);

    // The UniVerso: the table, open, with no entry of this computer's.
    let there = universo.server.upgrade().unwrap();
    let tables = there.db.campaigns_of(&universo.folder).unwrap();
    assert_eq!(tables.len(), 1, "{tables:?}");
    assert!(tables[0].open && !tables[0].moved, "{tables:?}");
    assert_eq!(there.db.table_count(&universo.folder, "").unwrap(), 0);

    // This computer's table: closed, moved, its log kept; its player out.
    let status = call(&s.webview, "campaign_status", json!({})).unwrap();
    assert_eq!(status["tables"][0]["moved"], true, "{status}");
    assert_eq!(status["tables"][0]["open"], false, "{status}");
    let gone = next_where(&mut ana, |v| v.get("gone").is_some());
    assert_eq!(gone["reason"], "moved", "{gone}");
    let history = call(
        &s.webview,
        "table_history",
        json!({ "before": null, "limit": 50 }),
    )
    .unwrap();
    assert!(history.to_string().contains("da mesa daqui"), "{history}");
    // The window at this computer's table is still offered the UniVerso:
    // the way to the table there.
    let still = call(&s.webview, "local_server_table_host", json!({})).unwrap();
    assert_eq!(still["to"], "universo", "{still}");
    // A moved table is not moved again, nor a folder that is no table.
    for root in ["", "Nada"] {
        let again = call(
            &s.webview,
            "local_server_move_table",
            json!({ "root": root }),
        );
        assert!(again.is_err(), "{root}: {again:?}");
    }
}

/// From a window on the UniVerso's folder that this computer serves too:
/// the table moves here, made on this computer's server; the UniVerso's is
/// closed and moved, and keeps its log. The window then comes to this
/// computer's folder and sits at the table there.
#[test]
fn a_table_moves_from_the_universo_to_this_computer() {
    let (universo, s, key) = signed_in();
    syncing(&s, &universo, &key);
    let opened = call(
        &s.webview,
        "server_open",
        json!({ "url": universo.url, "folder": universo.folder }),
    )
    .unwrap();
    assert!(opened.is_object(), "{opened}");
    call(&s.webview, "campaign_make", json!({ "root": "" })).unwrap();
    let joined = call(
        &s.webview,
        "table_join",
        json!({ "color": null, "styles": null }),
    )
    .unwrap();
    assert!(joined.is_object(), "{joined}");
    call(&s.webview, "table_say", json!({ "text": "do UniVerso" })).unwrap();

    let other = call(&s.webview, "local_server_table_host", json!({})).unwrap();
    assert_eq!(other["to"], "here", "{other}");
    assert_eq!(other["key"], key.as_str(), "{other}");
    let moved = call(&s.webview, "local_server_move_table", json!({ "root": "" })).unwrap();
    assert_eq!(moved, other);

    // The UniVerso's table: closed, moved, its log kept.
    let there = universo.server.upgrade().unwrap();
    let tables = there.db.campaigns_of(&universo.folder).unwrap();
    assert!(tables[0].moved && !tables[0].open, "{tables:?}");
    assert!(there.db.table_count(&universo.folder, "").unwrap() >= 1);
    let status = call(&s.webview, "campaign_status", json!({})).unwrap();
    assert_eq!(status["tables"][0]["moved"], true, "{status}");

    // This computer's server holds the table now; the window comes to the
    // folder and sits at it, open, with nothing of the UniVerso's log.
    assert_eq!(s.local.tables_in(s._dirs[0].path()), 1);
    call(&s.webview, "reopen_folder", json!({ "key": key })).unwrap();
    call(&s.webview, "local_server_sit_at_table", json!({})).unwrap();
    let here = call(&s.webview, "campaign_status", json!({})).unwrap();
    assert_eq!(here["tables"][0]["open"], true, "{here}");
    assert_eq!(here["tables"][0]["moved"], false, "{here}");
    let joined = call(
        &s.webview,
        "table_join",
        json!({ "color": null, "styles": null }),
    )
    .unwrap();
    assert!(!joined.to_string().contains("do UniVerso"), "{joined}");
}
