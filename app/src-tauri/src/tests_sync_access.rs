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
use super::tests_sync::{Device, Running, changed, device, files, serve, sync, text, write};
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
    assert!(kept.access["edita.md"].put, "{:?}", kept.access);
    assert!(!kept.access.contains_key("le.md"));
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

#[test]
fn the_window_is_told_what_the_server_last_said_and_not_a_word_of_what_it_never_listed() {
    let (r, owner, bia) = table();
    let d = device(&r, &r.reader, &[]);
    sync(&d);
    let ask = |paths: &[&str]| {
        let paths: Vec<String> = paths.iter().map(|p| (*p).to_owned()).collect();
        d.s.rights_told(d.ctx.config.as_deref(), &paths)
    };
    let told = ask(&["Edita.md", "Le.md", "Oculta.md"]);
    assert!(told.fresh);
    let level = |t: &verso_contract::SyncRights, p: &str| {
        t.files.iter().find(|f| f.path == p).map(|f| f.access.level)
    };
    assert_eq!(
        level(&told, "Edita.md"),
        Some(verso_contract::AccessLevel::Edit)
    );
    assert_eq!(
        level(&told, "Le.md"),
        Some(verso_contract::AccessLevel::See)
    );
    // The hidden note was never listed to it: nothing is said of it, not
    // even that it is unknown.
    assert_eq!(level(&told, "Oculta.md"), None);
    // Access changes: not fresh until the next pass asked the server again,
    // and then the new answer.
    give(&owner, "Le.md", &set("see", &[(&bia, "edit")]));
    d.s.rights_stale();
    assert!(!ask(&["Le.md"]).fresh);
    sync(&d);
    let told = ask(&["Le.md"]);
    assert!(told.fresh);
    assert_eq!(
        level(&told, "Le.md"),
        Some(verso_contract::AccessLevel::Edit)
    );
}

#[test]
fn a_players_board_is_never_sent_whole_even_when_they_edit_it() {
    let r = serve(&[("Mapa.canvas", "{\"nodes\":[],\"edges\":[]}")]);
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
    give(&owner, "Mapa.canvas", &set("see", &[(&bia, "edit")]));
    let d = device(&r, &r.reader, &[]);
    sync(&d);
    assert_eq!(here(&d), ["Mapa.canvas"]);
    let drawn = br#"{"nodes":[{"id":"1","type":"text","text":"x","x":0,"y":0,"width":9,"height":9}],"edges":[]}"#;
    write(&d, "Mapa.canvas", drawn);
    sync(&d);
    sync(&d);
    let on_server = owner
        .call("read_text", json!({ "path": "Mapa.canvas" }))
        .unwrap();
    assert_eq!(
        on_server["text"], "{\"nodes\":[],\"edges\":[]}",
        "{on_server}"
    );
    // Said once, kept here, no conflict copy made of it.
    assert_eq!(
        refused(&d),
        [("Mapa.canvas".to_owned(), "reader".to_owned())]
    );
    assert_eq!(here(&d), ["Mapa.canvas"]);
    assert!(!d.s.may_send(d.ctx.config.as_deref(), "Mapa.canvas"));
}

#[test]
fn a_change_held_apart_for_a_file_no_longer_shared_says_so() {
    let (r, owner, _bia) = table();
    let d = device(&r, &r.reader, &[]);
    sync(&d);
    give(&owner, "Le.md", &set("none", &[]));
    d.s.rights_stale();
    // Edited here before the device hears it is gone: the edit stays.
    write(&d, "Le.md", b"# Le\n\nminha\n");
    sync(&d);
    sync(&d);
    assert_eq!(here(&d), ["Edita.md", "Le.md"]);
    assert_eq!(refused(&d), [("Le.md".to_owned(), "unshared".to_owned())]);
    assert_eq!(on_server(&owner, "Le.md").as_deref(), Some("# Le\n"));
}

#[test]
fn a_read_only_files_edit_is_set_aside_once_not_again_for_each_change_of_the_server() {
    let (r, owner, _bia) = table();
    let d = device(&r, &r.reader, &[]);
    sync(&d);
    let mine = b"# Le\n\nminha\n";
    let copies = |d: &Device| {
        here(d)
            .into_iter()
            .filter(|p| p.starts_with("Le (conflict") || p.starts_with("Le (conflito"))
            .count()
    };
    for round in 1..=3 {
        write(&d, "Le.md", mine);
        owner
            .call(
                "write_text",
                json!({ "path": "Le.md", "text": format!("# Le {round}\n"), "revision": null }),
            )
            .ok();
        let read = owner.call("read_note", json!({ "path": "Le.md" })).unwrap();
        owner
            .call(
                "write_note",
                json!({ "path": "Le.md", "text": format!("# Le {round}\n"), "revision": read["revision"] }),
            )
            .unwrap();
        sync(&d);
        sync(&d);
        assert_eq!(copies(&d), 1, "round {round}: {:?}", here(&d));
    }
}

#[test]
fn the_memo_finds_a_file_whatever_the_case_or_unicode_form_of_its_name() {
    let r = serve(&[("Caf\u{e9}.md", "# Cafe\n")]);
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
    give(&owner, "Caf\u{e9}.md", &set("see", &[(&bia, "edit")]));
    let d = device(&r, &r.reader, &[]);
    sync(&d);
    for spelling in ["Cafe\u{301}.md", "caf\u{e9}.md", "CAFE\u{301}.md"] {
        assert!(
            d.s.may_send(d.ctx.config.as_deref(), spelling),
            "{spelling:?}"
        );
    }
}

/// The Access dialog and the seat of a synced folder are the server's: the
/// window's `access_get` and `access_set` go over the sync's link, as the
/// table's and the campaign's commands do, never to this computer's
/// handler, which answers that a folder alone has no table (seen live
/// 2026-10-26: right-click › Acesso… did nothing on the Mac).
#[test]
fn the_access_commands_of_a_synced_folder_go_over_the_link() {
    use crate::sync_commands::over_the_link;
    for cmd in [
        "access_get",
        "access_set",
        "table_rights_set",
        "campaign_status",
        "collab_join",
        "table_say",
    ] {
        assert!(over_the_link(cmd), "{cmd} stays on this computer");
    }
    for cmd in ["read_note", "write_note", "sync_rights", "list_entries"] {
        assert!(!over_the_link(cmd), "{cmd} goes to the server");
    }
}

/// The seat a synced folder's window is given: the server's `FolderAccess`.
fn seat_of(d: &Device) -> (Option<String>, Option<bool>) {
    let seat = d.s.seat();
    (
        seat.as_ref()
            .and_then(|v| v["seat"].as_str().map(str::to_owned)),
        seat.as_ref().and_then(|v| v["table"].as_bool()),
    )
}

fn seat_events(d: &Device) -> usize {
    lock(&d.told)
        .iter()
        .filter(|(_, e, _)| e == "seat-changed")
        .count()
}

#[test]
fn the_synced_folders_windows_get_the_servers_seat_and_it_follows_changes_and_holds_offline() {
    let (r, owner, bia) = table();
    // The game master's device: the seat is "master", the folder has a table.
    let gm = device(&r, &r.owner, &[]);
    assert_eq!(seat_of(&gm), (None, None));
    sync(&gm);
    assert_eq!(seat_of(&gm), (Some("master".to_owned()), Some(true)));
    assert_eq!(seat_events(&gm), 1);
    // A player's device: the seat is "player".
    let d = device(&r, &r.reader, &[]);
    sync(&d);
    assert_eq!(seat_of(&d), (Some("player".to_owned()), Some(true)));
    // Access changes: the device asks again; the window is told only when
    // the answer differs from the one kept.
    give(&owner, "Le.md", &set("see", &[(&bia, "edit")]));
    d.s.rights_stale();
    let before = seat_events(&d);
    sync(&d);
    assert_eq!(seat_events(&d), before, "the same seat is not said again");
    d.s.forget_seat();
    d.s.rights_stale();
    sync(&d);
    assert_eq!(seat_of(&d), (Some("player".to_owned()), Some(true)));
    assert_eq!(seat_events(&d), before + 1);
    // The last answer is kept with the sync's state: a device started again
    // with the server out of reach still knows who it is.
    let after = d.s.seat();
    let state = crate::sync::synced(d.ctx.config.as_deref(), &d.key).unwrap();
    assert_eq!(state.seat, after);
    let again = crate::sync::Syncer::new(&d.key, &state);
    assert_eq!(again.seat(), after);
    assert!(again.seat().is_some());
}

/// Bia, an editor of the folder (no table), on a synced device.
fn editors_folder(files: &[(&str, &str)]) -> (Running, Browser, Device) {
    let r = serve(files);
    let server = r.server.upgrade().unwrap();
    let bia = server
        .db
        .account_by_email("bia@casa.lan")
        .unwrap()
        .unwrap()
        .id;
    server
        .db
        .grant(&r.folder, &bia, verso_server::db::Role::Editor)
        .unwrap();
    drop(server);
    let owner = browser(&r, &r.owner);
    let d = device(&r, &r.reader, &[]);
    (r, owner, d)
}

/// Outside a table only the folder's owner deletes (ADR 0113 section B,
/// amended 2026-10-31). A deletion an editor's device makes is refused by
/// the server and the file comes back to that device, nothing lost
/// (decided 2026-10-31); edits still go.
#[test]
fn an_editors_deletion_is_refused_and_the_file_comes_back() {
    let (r, owner, d) = editors_folder(&[("Nota.md", "# Nota\n"), ("Outra.md", "# Outra\n")]);
    sync(&d);
    assert_eq!(here(&d), ["Nota.md", "Outra.md"]);
    // An edit goes, as an editor's does.
    write(&d, "Outra.md", b"# Outra\n\nda Bia\n");
    sync(&d);
    assert_eq!(
        on_server(&owner, "Outra.md").as_deref(),
        Some("# Outra\n\nda Bia\n")
    );
    // A deletion: refused, and the file is back here, said why.
    d.ctx
        .service
        .with_key(&d.key, |ws| Ok(ws.delete_entry("Nota.md").map(|_| ())?))
        .unwrap();
    changed(&d, &["Nota.md"]);
    sync(&d);
    assert_eq!(on_server(&owner, "Nota.md").as_deref(), Some("# Nota\n"));
    assert_eq!(
        refused(&d),
        [("Nota.md".to_owned(), "owner_deletes".to_owned())]
    );
    assert_eq!(here(&d), ["Nota.md", "Outra.md"]);
    assert_eq!(text(&d, "Nota.md").as_deref(), Some("# Nota\n"));
    // The next pass has nothing to do: neither side changed.
    sync(&d);
    assert!(refused(&d).is_empty(), "{:?}", refused(&d));
    assert_eq!(here(&d), ["Nota.md", "Outra.md"]);
    let _ = r;
}

/// A move that takes a file out of a shared folder counts as deleting it
/// for that share, so only the folder's owner makes it (ADR 0113 section B,
/// amended 2026-10-31). An editor's device that moves one out here is
/// refused, and the file goes back into the shared folder here, nothing
/// lost.
#[test]
fn an_editors_move_out_of_a_share_is_refused_and_the_file_goes_back() {
    let (r, owner, d) = editors_folder(&[("Solta.md", "# Solta\n")]);
    owner
        .call(
            "create_note",
            json!({ "name": "Mesa/Carta", "text": "# Carta\n" }),
        )
        .unwrap();
    let server = r.server.upgrade().unwrap();
    server.db.make_share(&r.folder, "Mesa").unwrap();
    drop(server);
    sync(&d);
    assert_eq!(here(&d), ["Mesa/Carta.md", "Solta.md"]);
    d.ctx
        .service
        .with_key(&d.key, |ws| {
            Ok(ws
                .rename_entry("Mesa/Carta.md", "Fora/Carta.md")
                .map(|_| ())?)
        })
        .unwrap();
    changed(&d, &["Mesa/Carta.md", "Fora/Carta.md"]);
    sync(&d);
    assert_eq!(
        on_server(&owner, "Mesa/Carta.md").as_deref(),
        Some("# Carta\n")
    );
    assert_eq!(on_server(&owner, "Fora/Carta.md"), None);
    assert_eq!(
        refused(&d),
        [("Mesa/Carta.md".to_owned(), "owner_moves_out".to_owned())]
    );
    assert_eq!(here(&d), ["Mesa/Carta.md", "Solta.md"]);
    // A move into it is an editor's.
    d.ctx
        .service
        .with_key(&d.key, |ws| {
            Ok(ws.rename_entry("Solta.md", "Mesa/Solta.md").map(|_| ())?)
        })
        .unwrap();
    changed(&d, &["Solta.md", "Mesa/Solta.md"]);
    sync(&d);
    assert_eq!(
        on_server(&owner, "Mesa/Solta.md").as_deref(),
        Some("# Solta\n")
    );
}
