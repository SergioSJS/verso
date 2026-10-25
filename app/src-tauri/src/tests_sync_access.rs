// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The synced desktop at a table (ADR 0113 S8) against a real `verso
//! serve`: the device asks the server what it may change, keeps the last
//! answer, sends the notes the player edits and keeps the others here said,
//! is never told a hidden file, and loses a file that became hidden without
//! the server's copy going with it.

use serde_json::{Value, json};

use super::tests_live_table::{Browser, browser};
use super::tests_sync::{Device, Running, changed, device, files, serve, sync, write};
use super::*;
use verso_core::sync as engine;

fn set(whole: &str, rows: &[(&str, &str)]) -> Value {
    let rows: Vec<Value> = rows
        .iter()
        .map(|(a, l)| json!({ "account": a, "level": l }))
        .collect();
    json!({ "kind": "set", "secret_name": null, "set": { "whole": whole, "rows": rows } })
}

fn give(owner: &Browser, path: &str, change: &Value) {
    owner
        .call("access_set", json!({ "paths": [path], "change": change }))
        .unwrap();
}

fn on_server(owner: &Browser, path: &str) -> Option<String> {
    owner
        .call("read_note", json!({ "path": path }))
        .ok()
        .and_then(|n| n["text"].as_str().map(str::to_owned))
}

/// The server's folder, a table: Bia (a reader of the folder) edits
/// `Edita.md`, only sees `Le.md`, and does not see `Oculta.md`.
fn table() -> (Running, Browser, String) {
    let r = serve(&[
        ("Edita.md", "# Edita\n"),
        ("Le.md", "# Le\n"),
        ("Oculta.md", "# Oculta\n"),
    ]);
    let owner = browser(&r, &r.owner);
    owner.call("reindex", json!({})).unwrap();
    owner.call("campaign_make", json!({ "root": "" })).unwrap();
    owner
        .call("campaign_settings", json!({ "root": "", "open": true }))
        .unwrap();
    let bia = r
        .server
        .upgrade()
        .unwrap()
        .db
        .account_by_email("bia@casa.lan")
        .unwrap()
        .unwrap()
        .id;
    give(&owner, "Edita.md", &set("see", &[(&bia, "edit")]));
    give(&owner, "Le.md", &set("see", &[]));
    (r, owner, bia)
}

/// The files the device holds, the folder walked again first.
fn here(d: &Device) -> Vec<String> {
    changed(d, &[]);
    files(d)
}

fn refused(d: &Device) -> Vec<(String, String)> {
    lock(&d.shown)
        .last()
        .map(|s| {
            s.refused
                .iter()
                .map(|f| (f.path.clone(), f.reason.clone()))
                .collect()
        })
        .unwrap_or_default()
}

#[test]
fn a_players_device_sends_the_notes_it_edits_keeps_the_others_here_and_is_told_no_hidden_file() {
    let (r, owner, bia) = table();
    let d = device(&r, &r.reader, &[]);
    sync(&d);
    // Told what it sees: never the hidden file, nor its name.
    assert_eq!(here(&d), ["Edita.md", "Le.md"]);
    write(&d, "Edita.md", b"# Edita\n\nda Bia\n");
    write(&d, "Le.md", b"# Le\n\nda Bia\n");
    sync(&d);
    assert_eq!(
        on_server(&owner, "Edita.md").as_deref(),
        Some("# Edita\n\nda Bia\n")
    );
    assert_eq!(on_server(&owner, "Le.md").as_deref(), Some("# Le\n"));
    assert_eq!(
        refused(&d),
        [("Le.md".to_owned(), "reader".to_owned())],
        "said once, and only for the note it only reads"
    );
    // Passes after it do not send it again, nor make a conflict.
    sync(&d);
    sync(&d);
    assert_eq!(on_server(&owner, "Le.md").as_deref(), Some("# Le\n"));
    assert_eq!(here(&d), ["Edita.md", "Le.md"]);
    // The last answer is kept with the sync's state, and holds offline.
    let kept = engine::load(d.ctx.config.as_deref(), &d.key)
        .unwrap()
        .unwrap();
    assert!(kept.access["Edita.md"].put, "{:?}", kept.access);
    assert!(!kept.access.contains_key("Le.md"));
    assert!(d.s.may_send(d.ctx.config.as_deref(), "Edita.md"));
    assert!(!d.s.may_send(d.ctx.config.as_deref(), "Le.md"));
    let _ = bia;
}

#[test]
fn a_change_of_access_reaches_the_device_before_it_sends_anything_more() {
    let (r, owner, bia) = table();
    let d = device(&r, &r.reader, &[]);
    sync(&d);
    write(&d, "Le.md", b"# Le\n\nda Bia\n");
    sync(&d);
    assert_eq!(on_server(&owner, "Le.md").as_deref(), Some("# Le\n"));
    // The game master lets her edit it: told as `access-changed`, the
    // device asks again, and the note it has changed goes.
    give(&owner, "Le.md", &set("see", &[(&bia, "edit")]));
    d.s.rights_stale();
    sync(&d);
    assert_eq!(
        on_server(&owner, "Le.md").as_deref(),
        Some("# Le\n\nda Bia\n")
    );
    // And takes it back: what she changes next stays here.
    give(&owner, "Edita.md", &set("see", &[]));
    d.s.rights_stale();
    sync(&d);
    write(&d, "Edita.md", b"# Edita\n\noutra\n");
    sync(&d);
    assert_eq!(on_server(&owner, "Edita.md").as_deref(), Some("# Edita\n"));
    assert!(
        refused(&d)
            .iter()
            .any(|(p, why)| p == "Edita.md" && why == "reader")
    );
}

#[test]
fn a_file_that_becomes_hidden_leaves_the_device_and_the_servers_copy_stays() {
    let (r, owner, _bia) = table();
    let d = device(&r, &r.reader, &[]);
    sync(&d);
    assert_eq!(here(&d), ["Edita.md", "Le.md"]);
    // Hidden from everyone: the device is told it is gone from its view.
    give(&owner, "Le.md", &set("none", &[]));
    d.s.rights_stale();
    sync(&d);
    sync(&d);
    assert_eq!(here(&d), ["Edita.md"]);
    // Not a deletion by the device: the game master still has it, and the
    // next passes do not bring it back nor take it away.
    assert_eq!(on_server(&owner, "Le.md").as_deref(), Some("# Le\n"));
    sync(&d);
    assert_eq!(on_server(&owner, "Le.md").as_deref(), Some("# Le\n"));
    assert_eq!(here(&d), ["Edita.md"]);
}
