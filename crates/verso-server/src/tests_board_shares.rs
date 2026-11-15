// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A board edited through a share of a sub-folder (ADR 0081 item 11, ADR
//! 0113 section H): the cards of a board name their notes by a path from the
//! owner's folder, and the window of a share knows the share as its folder.
//! The paths inside a board cross the boundary as every other path does
//! (`share_board.rs`): the room and the file hold the owner's, the player's
//! window the share's, and a card of a file outside the share is a locked
//! card that says nothing of where.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};
use yrs::Doc;

use crate::access::{Level, NodeSet};
use crate::collab_board::tests::put;
use crate::collab_board::{self};
use crate::tests::{Running, block_on, folder_id, put as http_put, sign_in, start};
use crate::tests_board_players::{apply, bytes, edited, exchange, hear, seeded};
use crate::tests_campaign::Win;

/// The board's path in the owner's folder, and in the share.
pub(crate) const BOARD: &str = "Sub/Quadro.canvas";
pub(crate) const REL: &str = "Quadro.canvas";

/// What a player of the share must never hear of: the folder beside it.
pub(crate) const OUTSIDE: &[&str] = &["Fora", "zy.md", "Y.md"];

pub(crate) struct Cast {
    pub(crate) r: Running,
    /// The key the owner's folder is open under.
    pub(crate) key: String,
    /// The share's id.
    pub(crate) share: String,
    /// Ana's account.
    pub(crate) account: String,
    pub(crate) owner: Win,
    pub(crate) ana: Win,
}

pub(crate) fn card(id: &str, file: &str, index: &str) -> Value {
    let n = json!({ "id": id, "type": "file", "file": file, "x": 0, "y": 0, "width": 100, "height": 50 });
    json!({ "type": "embeddable", "x": 0, "y": 0, "width": 100, "height": 50, "index": index,
        "link": "https://verso.invalid/board-node", "customData": { "canvas": n } })
}

fn disk_board() -> String {
    json!({ "nodes": [
        { "id": "c-open", "type": "file", "file": "Sub/Livre.md", "x": 0, "y": 0, "width": 100, "height": 50 },
        { "id": "c-out", "type": "file", "file": "Fora/Y.md", "x": 200, "y": 0, "width": 100, "height": 50 },
    ], "edges": [] })
    .to_string()
}

/// A folder with a table; a share of "Sub" to Ana, who edits its board.
async fn cast() -> Cast {
    cast_with(true).await
}

pub(crate) async fn cast_with(table: bool) -> Cast {
    cast_as(table, "editor").await
}

/// [`cast_with`], Ana given the share as `role`.
pub(crate) async fn cast_as(table: bool, role: &str) -> Cast {
    let r = start().await;
    let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(&r, &admin).await;
    let (mut owner, info) = Win::open(&r, &admin, &id).await;
    let key = info["ok"]["key"].as_str().unwrap().to_owned();
    for (name, text) in [
        ("Sub/Livre", "livre\n"),
        ("Sub/Lugares/Taverna do Corvo", "taverna\n"),
        ("Sub/Lugares/Ponte", "ponte\n"),
        ("Sub/Oculta", "oculta zq\n"),
        ("Fora/Y", "zy\n"),
    ] {
        let made = owner
            .call("create_note", json!({ "name": name, "text": text }))
            .await;
        assert!(made.get("ok").is_some(), "{made}");
    }
    let made = owner
        .call(
            "create_file",
            json!({ "path": BOARD, "base64": STANDARD.encode(disk_board()) }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    let walked = owner.call("reindex", json!({})).await;
    assert!(walked.get("ok").is_some(), "{walked}");
    if table {
        let made = owner.call("campaign_make", json!({ "root": "" })).await;
        assert_eq!(made["ok"]["viewer"], "owner", "{made}");
        let released = owner
            .call(
                "campaign_release",
                json!({ "paths": ["Sub/Livre.md", "Sub/Lugares/Taverna do Corvo.md", "Sub/Lugares/Ponte.md", "Fora/Y.md"], "released": true }),
            )
            .await;
        assert!(released.get("ok").is_some(), "{released}");
    }
    let a = r
        .server
        .db
        .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
        .unwrap();
    let (status, shared) = http_put(
        &r,
        &format!("/api/folders/{id}/shares"),
        json!({ "path": "Sub", "email": "ana@casa.lan", "role": role }),
        &admin,
    )
    .await;
    assert_eq!(status, 200, "{shared}");
    let share = shared["id"].as_str().unwrap().to_owned();
    let set = NodeSet {
        whole: Level::See,
        rows: [(a.id.clone(), Level::Edit)].into_iter().collect(),
    };
    if table {
        r.server.db.access_put(&id, BOARD, set).unwrap();
        crate::campaign::forget(&r.server, &id);
    }
    let b = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
    let (ana, opened) = Win::open(&r, &b, &share).await;
    assert!(opened.get("ok").is_some(), "{opened}");
    Cast {
        r,
        key,
        share,
        account: a.id.clone(),
        owner,
        ana,
    }
}

/// The game master's window draws the board into the room; returns its copy.
pub(crate) async fn master_seeds(c: &mut Cast) -> Doc {
    let (joined, _) = exchange(&mut c.owner, "collab_join", json!({ "path": BOARD }), &[]).await;
    let doc = Doc::new();
    apply(&doc, &bytes(joined["ok"]["update"].as_str().unwrap()));
    let mut updates = vec![
        put(&doc, "c-open", 1, 5, &card("c-open", "Sub/Livre.md", "a0")),
        put(&doc, "c-out", 1, 6, &card("c-out", "Fora/Y.md", "a1")),
    ];
    updates.push(seeded(&doc));
    let seed = yrs::merge_updates_v1(updates.iter().map(Vec::as_slice)).unwrap();
    let (sent, _) = exchange(
        &mut c.owner,
        "collab_update",
        json!({ "path": BOARD, "update": STANDARD.encode(seed) }),
        &[],
    )
    .await;
    assert!(sent.get("ok").is_some(), "{sent}");
    doc
}

pub(crate) async fn ana_joins(c: &mut Cast) -> (Value, Doc) {
    let (joined, _) = exchange(&mut c.ana, "collab_join", json!({ "path": REL }), OUTSIDE).await;
    let doc = Doc::new();
    if let Some(u) = joined["ok"]["update"].as_str() {
        apply(&doc, &bytes(u));
    }
    (joined, doc)
}

fn file_of(doc: &Doc, id: &str) -> Option<String> {
    collab_board::elements(doc).get(id).and_then(|e| {
        e["customData"]["canvas"]["file"]
            .as_str()
            .map(str::to_owned)
    })
}

fn locked(doc: &Doc, id: &str) -> bool {
    collab_board::elements(doc)
        .get(id)
        .is_some_and(|e| e["locked"] == true)
}

/// The file in the owner's folder the room's `card` reaches, as the server
/// resolves it for the board's sight.
fn reached(c: &Cast, file: &str) -> Option<String> {
    c.r.server
        .service
        .with_key(&c.key, |ws| Ok(ws.reached_exact(file)))
        .unwrap()
}

#[test]
fn a_card_a_player_puts_through_a_share_is_the_owners_path_in_the_room() {
    block_on(async {
        let mut c = cast().await;
        let gm = master_seeds(&mut c).await;
        let (joined, ana) = ana_joins(&mut c).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        // She is told the share's paths; the card of a file beside the share
        // is a locked card, with no trace of where.
        assert_eq!(file_of(&ana, "c-open").as_deref(), Some("Livre.md"));
        assert!(locked(&ana, "c-out"), "{:?}", collab_board::elements(&ana));
        assert!(file_of(&ana, "c-out").is_none());

        // She puts a note of the share on the board, by the share's path.
        // Written as a browser writes it: keys in no sorted order.
        let new = {
            use yrs::{Map, Transact};
            let text = r#"{"version":1,"versionNonce":31,"type":"embeddable","index":"a2","link":"https://verso.invalid/board-node","id":"c-new","x":0,"y":0,"width":100,"height":50,"customData":{"canvas":{"width":100,"file":"Lugares/Taverna do Corvo.md","type":"file","id":"c-new","x":0,"y":0,"height":50}}}"#;
            let map = ana.get_or_insert_map(collab_board::ELEMENTS);
            let mut txn = ana.transact_mut();
            map.insert(&mut txn, "c-new\n1\n31", text);
            txn.encode_update_v1()
        };
        let mark = edited(&ana, 1);
        let both = yrs::merge_updates_v1([new.as_slice(), mark.as_slice()]).unwrap();
        let (sent, mut echoed) = exchange(
            &mut c.ana,
            "collab_update",
            json!({ "path": REL, "update": STANDARD.encode(both) }),
            OUTSIDE,
        )
        .await;
        assert!(sent.get("ok").is_some(), "{sent}");

        // Her own edit is not sent back to her.
        echoed.extend(hear(&mut c.ana, 300, OUTSIDE).await);
        assert!(
            echoed.iter().all(|e| e["event"] != "collab-update"),
            "her edit came back: {echoed:?}"
        );
        // The game master's window hears the owner's path, which resolves.
        let told = hear(&mut c.owner, 400, &[]).await;
        for e in told.iter().filter(|e| e["event"] == "collab-update") {
            apply(&gm, &bytes(e["payload"]["update"].as_str().unwrap()));
        }
        let held = file_of(&gm, "c-new").expect("the card reached the room");
        assert_eq!(held, "Sub/Lugares/Taverna do Corvo.md");
        assert!(reached(&c, &held).is_some());

        // Joined again, her window is shown the card open, not locked.
        exchange(&mut c.ana, "collab_leave", json!({ "path": REL }), OUTSIDE).await;
        let (_, again) = ana_joins(&mut c).await;
        assert_eq!(
            file_of(&again, "c-new").as_deref(),
            Some("Lugares/Taverna do Corvo.md")
        );
        assert!(!locked(&again, "c-new"));
    });
}

#[test]
fn a_player_cannot_name_a_file_outside_the_share_on_a_board() {
    block_on(async {
        let mut c = cast().await;
        master_seeds(&mut c).await;
        let (_, ana) = ana_joins(&mut c).await;
        for file in ["../Fora/Y.md", "/Fora/Y.md", "Lugares/../../Fora/Y.md"] {
            let new = put(&ana, "c-bad", 1, 41, &card("c-bad", file, "a3"));
            let mark = edited(&ana, 1);
            let both = yrs::merge_updates_v1([new.as_slice(), mark.as_slice()]).unwrap();
            let (sent, _) = exchange(
                &mut c.ana,
                "collab_update",
                json!({ "path": REL, "update": STANDARD.encode(both) }),
                OUTSIDE,
            )
            .await;
            assert_eq!(sent["err"]["kind"], "refused", "{file}: {sent}");
        }
    });
}

#[test]
fn the_game_masters_cards_reach_a_player_through_the_share_as_hers_or_locked() {
    block_on(async {
        let mut c = cast().await;
        let gm = master_seeds(&mut c).await;
        let (_, ana) = ana_joins(&mut c).await;
        // A card of the share, and one beside it, put by the game master.
        let inside = put(
            &gm,
            "g-in",
            1,
            51,
            &card("g-in", "Sub/Lugares/Ponte.md", "a4"),
        );
        let beside = put(&gm, "g-out", 1, 52, &card("g-out", "Fora/Y.md", "a5"));
        let both = yrs::merge_updates_v1([inside.as_slice(), beside.as_slice()]).unwrap();
        let (sent, _) = exchange(
            &mut c.owner,
            "collab_update",
            json!({ "path": BOARD, "update": STANDARD.encode(both) }),
            &[],
        )
        .await;
        assert!(sent.get("ok").is_some(), "{sent}");
        // Every frame she hears is checked for the folder beside the share.
        let told = hear(&mut c.ana, 500, OUTSIDE).await;
        for e in told.iter().filter(|e| e["event"] == "collab-update") {
            apply(&ana, &bytes(e["payload"]["update"].as_str().unwrap()));
        }
        assert_eq!(file_of(&ana, "g-in").as_deref(), Some("Lugares/Ponte.md"));
        assert!(!locked(&ana, "g-in"));
        assert!(locked(&ana, "g-out"), "{:?}", collab_board::elements(&ana));
        assert!(file_of(&ana, "g-out").is_none());
        let text = serde_json::to_string(&collab_board::elements(&ana)).unwrap();
        assert!(!text.contains("Fora") && !text.contains("Y.md"), "{text}");
        assert!(!text.contains("Sub/"), "{text}");
    });
}

#[test]
fn a_board_read_and_written_through_a_share_keeps_the_files_paths_and_revision() {
    block_on(async {
        let mut c = cast_with(false).await;
        let disk = c.owner.call("read_text", json!({ "path": BOARD })).await;
        let rev = disk["ok"]["revision"].as_str().unwrap().to_owned();
        let read = c.ana.call("read_text", json!({ "path": REL })).await;
        assert!(read.get("ok").is_some(), "{read}");
        // The revision is the file's own, whatever text the window is shown.
        assert_eq!(read["ok"]["revision"], disk["ok"]["revision"], "{read}");
        let shown = read["ok"]["text"].as_str().unwrap().to_owned();
        assert!(shown.contains("\"Livre.md\""), "{shown}");
        for leak in OUTSIDE.iter().chain(&["Sub/"]) {
            assert!(!shown.contains(leak), "{leak} in {shown}");
        }
        // She adds a card by the share's path and saves over that revision.
        let mut v: Value = serde_json::from_str(&shown).unwrap();
        v["nodes"]
            .as_array_mut()
            .unwrap()
            .push(json!({ "id": "n", "type": "file",
            "file": "Lugares/Ponte.md", "x": 1, "y": 1, "width": 10, "height": 10 }));
        let wrote = c
            .ana
            .call(
                "write_text",
                json!({ "path": REL, "text": v.to_string(), "revision": rev }),
            )
            .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        assert!(
            wrote["ok"]["text"]
                .as_str()
                .unwrap()
                .contains("\"Lugares/Ponte.md\""),
            "{wrote}"
        );
        // The file holds the owner's path, and the card she was not shown.
        let now = c.owner.call("read_text", json!({ "path": BOARD })).await;
        let on_disk = now["ok"]["text"].as_str().unwrap();
        assert!(on_disk.contains("\"Sub/Lugares/Ponte.md\""), "{on_disk}");
        assert!(on_disk.contains("\"Fora/Y.md\""), "{on_disk}");
        assert!(on_disk.contains("\"Sub/Livre.md\""), "{on_disk}");
        // A save over the revision it read before is refused: the file moved.
        let stale = c
            .ana
            .call(
                "write_text",
                json!({ "path": REL, "text": v.to_string(), "revision": rev }),
            )
            .await;
        assert!(stale.get("err").is_some(), "{stale}");
        assert_eq!(
            c.owner.call("read_text", json!({ "path": BOARD })).await["ok"]["text"],
            now["ok"]["text"]
        );
        // The board's own save, laid over the file, the same way.
        let fresh = wrote["ok"]["revision"].as_str().unwrap().to_owned();
        v["nodes"][0]["x"] = json!(77);
        let saved = c
            .ana
            .call(
                "write_board",
                json!({ "path": REL, "json": v.to_string(), "revision": fresh }),
            )
            .await;
        assert!(saved.get("ok").is_some(), "{saved}");
        let on_disk = c.owner.call("read_text", json!({ "path": BOARD })).await;
        let on_disk = on_disk["ok"]["text"].as_str().unwrap();
        assert!(on_disk.contains("\"Sub/Lugares/Ponte.md\"") && on_disk.contains("\"Fora/Y.md\""));
        assert!(on_disk.contains("77"), "{on_disk}");
        // The links of the board name its cards by the share's paths.
        let links = c.ana.call("links", json!({ "path": REL })).await;
        let links = links["ok"].to_string();
        assert!(links.contains("Lugares/Ponte.md"), "{links}");
        for leak in OUTSIDE.iter().chain(&["Sub/"]) {
            assert!(!links.contains(leak), "{leak} in {links}");
        }
        let preview = c
            .ana
            .call(
                "board_preview",
                json!({ "path": REL, "json": v.to_string() }),
            )
            .await;
        let text = preview["ok"].as_str().unwrap();
        assert!(text.contains("\"Lugares/Ponte.md\""), "{preview}");
        for leak in OUTSIDE.iter().chain(&["Sub/"]) {
            assert!(!text.contains(leak), "{leak} in {text}");
        }
    });
}

#[test]
fn the_links_of_a_board_through_a_share_say_nothing_of_a_card_that_is_missing_or_outside() {
    block_on(async {
        let mut c = cast_with(false).await;
        let disk = c.owner.call("read_text", json!({ "path": BOARD })).await;
        let rev = disk["ok"]["revision"].as_str().unwrap().to_owned();
        let board = json!({ "nodes": [
            { "id": "a", "type": "file", "file": "Fora/Segredo.md", "x": 0, "y": 0, "width": 1, "height": 1 },
            { "id": "b", "type": "file", "file": "Sub/Faltando.md", "x": 0, "y": 0, "width": 1, "height": 1 },
            { "id": "c", "type": "file", "file": "SUB/LIVRE.md", "x": 0, "y": 0, "width": 1, "height": 1 },
            { "id": "d", "type": "file", "file": "Sub/Livre.md", "x": 0, "y": 0, "width": 1, "height": 1 },
        ], "edges": [] });
        let wrote = c
            .owner
            .call(
                "write_text",
                json!({ "path": BOARD, "text": board.to_string(), "revision": rev }),
            )
            .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        let walked = c.owner.call("reindex", json!({})).await;
        assert!(walked.get("ok").is_some(), "{walked}");
        let links = c.ana.call("links", json!({ "path": REL })).await;
        let raw = links.to_string();
        for leak in ["Fora", "Segredo", "Sub/", "SUB/", "Faltando\"", "LIVRE"] {
            assert!(!raw.contains(leak), "{leak} in {raw}");
        }
        assert!(raw.contains("Livre.md"), "{raw}");
    });
}

#[test]
fn a_share_window_cannot_save_a_card_that_names_its_file_twice() {
    block_on(async {
        let mut c = cast_with(false).await;
        let disk = c.owner.call("read_text", json!({ "path": BOARD })).await;
        let rev = disk["ok"]["revision"].as_str().unwrap().to_owned();
        let text = r#"{"nodes":[{"id":"a","type":"file","file":"../Fora/Y.md","file":"Livre.md","x":0,"y":0,"width":1,"height":1}],"edges":[]}"#;
        let wrote = c
            .ana
            .call(
                "write_text",
                json!({ "path": REL, "text": text, "revision": rev }),
            )
            .await;
        assert_eq!(wrote["err"]["kind"], "refused", "{wrote}");
    });
}

#[test]
fn a_shadow_made_with_an_old_share_is_closed_when_the_share_changes() {
    block_on(async {
        let mut c = cast().await;
        master_seeds(&mut c).await;
        let (joined, _) = ana_joins(&mut c).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let now = crate::scope::Scope {
            share: c.share.clone(),
            key: crate::scope::share_key(&c.share),
            name: "x".into(),
            root: "Sub".into(),
            mount: None,
            guard: None,
        };
        // The share now at another root: the shadow of the old one goes.
        let moved = crate::scope::Scope {
            root: "Sub2".into(),
            ..now
        };
        let account = c.account.clone();
        let now = move |a: &str| (a == account).then(|| moved.clone());
        crate::collab::players::share_moved(&c.r.server, &c.share, &now);
        let told = hear(&mut c.ana, 600, &[]).await;
        assert!(
            told.iter().any(|e| e["event"] == "collab-closed"),
            "her shadow of the old root stayed: {told:?}"
        );
    });
}

/// The game master changes what a share's window was not shown, after the
/// window read the board; the window's save over its old read is refused and
/// the file stays the game master's, byte for byte.
async fn a_change_of_the_game_master_survives(table: bool) {
    let mut c = cast_with(table).await;
    let first = c.owner.call("read_text", json!({ "path": BOARD })).await;
    let read = c.ana.call("read_text", json!({ "path": REL })).await;
    assert!(read.get("ok").is_some(), "{read}");
    let rev = read["ok"]["revision"].as_str().unwrap().to_owned();
    let shown = read["ok"]["text"].as_str().unwrap().to_owned();
    // The game master moves the card beside the share and adds one.
    let mut gm: Value = serde_json::from_str(first["ok"]["text"].as_str().unwrap()).unwrap();
    gm["nodes"][1]["x"] = json!(999);
    gm["nodes"]
        .as_array_mut()
        .unwrap()
        .push(json!({ "id": "g", "type": "text",
        "text": "do mestre", "x": 5, "y": 5, "width": 9, "height": 9 }));
    let made = c
        .owner
        .call(
            "write_text",
            json!({ "path": BOARD, "text": gm.to_string(), "revision": first["ok"]["revision"] }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    let before = c.owner.call("read_text", json!({ "path": BOARD })).await;
    let mut v: Value = serde_json::from_str(&shown).unwrap();
    v["nodes"][0]["x"] = json!(5);
    for (cmd, field, body) in [
        ("write_text", "text", v.to_string()),
        ("write_board", "json", v.to_string()),
    ] {
        let wrote = c
            .ana
            .call(cmd, json!({ "path": REL, field: body, "revision": rev }))
            .await;
        assert!(wrote.get("err").is_some(), "{cmd}: {wrote}");
    }
    let after = c.owner.call("read_text", json!({ "path": BOARD })).await;
    assert_eq!(after["ok"]["text"], before["ok"]["text"]);
    assert_eq!(after["ok"]["revision"], before["ok"]["revision"]);
}

#[test]
fn a_game_masters_change_after_a_share_windows_read_is_never_overwritten() {
    block_on(async {
        a_change_of_the_game_master_survives(false).await;
    });
}

#[test]
fn a_player_of_a_table_cannot_overwrite_a_game_masters_change_either() {
    block_on(async {
        a_change_of_the_game_master_survives(true).await;
    });
}

#[test]
fn a_board_whose_hidden_cards_cannot_be_told_apart_is_never_written_through_a_share() {
    block_on(async {
        let mut c = cast_with(false).await;
        let first = c.owner.call("read_text", json!({ "path": BOARD })).await;
        let board = json!({ "nodes": [
            { "id": "x", "type": "file", "file": "Fora/A.md", "x": 0, "y": 0, "width": 1, "height": 1 },
            { "id": "x", "type": "file", "file": "Fora/B.md", "x": 5, "y": 0, "width": 1, "height": 1 },
            { "type": "file", "file": "Fora/C.md", "x": 9, "y": 0, "width": 1, "height": 1 },
            { "id": "d", "type": "file", "file": "Sub/Livre.md", "x": 0, "y": 0, "width": 1, "height": 1 },
        ], "edges": [] });
        let wrote = c
            .owner
            .call(
                "write_text",
                json!({ "path": BOARD, "text": board.to_string(), "revision": first["ok"]["revision"] }),
            )
            .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        let before = c.owner.call("read_text", json!({ "path": BOARD })).await;
        let rev = before["ok"]["revision"].clone();
        let read = c.ana.call("read_text", json!({ "path": REL })).await;
        let mut v: Value = serde_json::from_str(read["ok"]["text"].as_str().unwrap()).unwrap();
        v["nodes"][3]["x"] = json!(77);
        for (cmd, field) in [("write_text", "text"), ("write_board", "json")] {
            let w = c
                .ana
                .call(
                    cmd,
                    json!({ "path": REL, field: v.to_string(), "revision": rev }),
                )
                .await;
            assert_eq!(w["err"]["kind"], "refused", "{cmd}: {w}");
        }
        let after = c.owner.call("read_text", json!({ "path": BOARD })).await;
        assert_eq!(after["ok"]["text"], before["ok"]["text"]);
    });
}

#[test]
fn backlinks_and_links_of_a_board_cross_only_in_the_shares_words() {
    block_on(async {
        let mut c = cast_with(false).await;
        let first = c.owner.call("read_text", json!({ "path": BOARD })).await;
        let board = json!({ "nodes": [
            { "id": "a", "type": "file", "file": "Fora/Segredo.md", "subpath": "#Cripta Secreta", "x": 0, "y": 0, "width": 1, "height": 1 },
            { "id": "d", "type": "file", "file": "Sub/Livre.md", "x": 0, "y": 0, "width": 1, "height": 1 },
        ], "edges": [] });
        let wrote = c
            .owner
            .call(
                "write_text",
                json!({ "path": BOARD, "text": board.to_string(), "revision": first["ok"]["revision"] }),
            )
            .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        let walked = c.owner.call("reindex", json!({})).await;
        assert!(walked.get("ok").is_some(), "{walked}");
        let back = c.ana.call("backlinks", json!({ "path": "Livre.md" })).await;
        let raw = back.to_string();
        assert!(raw.contains("Quadro.canvas"), "{raw}");
        assert!(!raw.contains("Sub/"), "{raw}");
        let links = c.ana.call("links", json!({ "path": REL })).await;
        let raw = links.to_string();
        for leak in ["Fora", "Segredo", "Cripta", "Sub/"] {
            assert!(!raw.contains(leak), "{leak} in {raw}");
        }
    });
}

#[test]
fn a_backlink_from_a_board_never_carries_the_cards_text() {
    block_on(async {
        let mut c = cast_with(false).await;
        let made = c
            .owner
            .call(
                "create_note",
                json!({ "name": "Sub/Poção", "text": "poção\n" }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let first = c.owner.call("read_text", json!({ "path": BOARD })).await;
        // The card names the note as the index matches it, not as a path
        // can be taken back from: decomposed accents, and a space around.
        let board = json!({ "nodes": [
            { "id": "a", "type": "file", "file": "Sub/Poc\u{327}a\u{303}o.md", "x": 0, "y": 0, "width": 1, "height": 1 },
            { "id": "b", "type": "file", "file": " Sub/Poção.md ", "x": 0, "y": 0, "width": 1, "height": 1 },
        ], "edges": [] });
        let wrote = c
            .owner
            .call(
                "write_text",
                json!({ "path": BOARD, "text": board.to_string(), "revision": first["ok"]["revision"] }),
            )
            .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        let walked = c.owner.call("reindex", json!({})).await;
        assert!(walked.get("ok").is_some(), "{walked}");
        let back = c.ana.call("backlinks", json!({ "path": "Poção.md" })).await;
        let rows = back["ok"].as_array().unwrap();
        assert!(!rows.is_empty(), "the index matched no card: {back}");
        let raw = back.to_string();
        assert!(!raw.contains("Sub"), "{raw}");
        assert!(rows.iter().all(|r| r["target"] == "Poção.md"), "{raw}");
    });
}

#[test]
fn a_card_of_a_hidden_file_leaves_no_trace_in_the_links_of_a_players_board() {
    block_on(async {
        let mut c = cast().await;
        let first = c.owner.call("read_text", json!({ "path": BOARD })).await;
        // "Sub/Oculta.md" is not released: hidden from Ana.
        let board = json!({ "nodes": [
            { "id": "a", "type": "file", "file": "Sub/Oculta.md", "subpath": "#Cripta", "x": 0, "y": 0, "width": 1, "height": 1 },
            { "id": "d", "type": "file", "file": "Sub/Livre.md", "x": 0, "y": 0, "width": 1, "height": 1 },
        ], "edges": [] });
        let wrote = c
            .owner
            .call(
                "write_text",
                json!({ "path": BOARD, "text": board.to_string(), "revision": first["ok"]["revision"] }),
            )
            .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        let walked = c.owner.call("reindex", json!({})).await;
        assert!(walked.get("ok").is_some(), "{walked}");
        let links = c.ana.call("links", json!({ "path": REL })).await;
        let raw = links.to_string();
        assert!(
            raw.contains("Livre.md"),
            "the visible card is listed: {raw}"
        );
        for leak in ["Oculta", "Cripta"] {
            assert!(!raw.contains(leak), "{leak} in {raw}");
        }
        let back = c.ana.call("backlinks", json!({ "path": "Livre.md" })).await;
        assert!(!back.to_string().contains("Oculta"), "{back}");
    });
}

/// D of the audit of 2026-11-15: a window of a share that is no player of a
/// table was let into the board's room, which holds every card by the
/// owner's paths — a card of a file beside the share too. Refused the room
/// that day, it joins a shadow of it cut to the share since V.49: the cards
/// in the share's paths, the one beside it locked. A reader of the share
/// follows the board by its file, re-rooted.
#[test]
fn a_share_window_with_no_table_joins_the_boards_room_only_cut_to_the_share() {
    block_on(async {
        let mut c = cast_with(false).await;
        master_seeds(&mut c).await;
        let (joined, ana) = ana_joins(&mut c).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        assert_eq!(file_of(&ana, "c-open").as_deref(), Some("Livre.md"));
        assert!(locked(&ana, "c-out"), "{:?}", collab_board::elements(&ana));
        assert!(file_of(&ana, "c-out").is_none());
        // What she has beside it: the file, re-rooted, the card beside the
        // share locked.
        let (read, _) = exchange(&mut c.ana, "read_text", json!({ "path": REL }), OUTSIDE).await;
        let text = read["ok"]["text"].as_str().unwrap_or_default();
        assert!(text.contains("\"Livre.md\""), "{read}");
        let id = c.share.clone();
        crate::tests_board_leaks::sweep(&mut c.ana, &id, REL, OUTSIDE).await;
        // A reader of the share: no room, the file.
        let mut r = cast_as(false, "reader").await;
        master_seeds(&mut r).await;
        let (joined, doc) = ana_joins(&mut r).await;
        assert!(joined.get("ok").is_none(), "{joined}");
        assert!(collab_board::elements(&doc).is_empty());
        for cmd in [
            "collab_update",
            "collab_canvas",
            "collab_save",
            "collab_awareness",
        ] {
            let (got, _) = exchange(
                &mut r.ana,
                cmd,
                json!({ "path": REL, "update": "", "at": "", "json": "{}" }),
                OUTSIDE,
            )
            .await;
            assert!(got.get("ok").is_none(), "{cmd}: {got}");
        }
        let id = r.share.clone();
        crate::tests_board_leaks::sweep(&mut r.ana, &id, REL, OUTSIDE).await;
    });
}

/// E of the audit of 2026-11-15: a past version of a board through a share
/// was served as it was written, the owner's paths and the cards beside
/// the share in it. It crosses as the board does live.
#[test]
fn a_past_version_of_a_board_through_a_share_crosses_as_the_board_does() {
    block_on(async {
        let mut c = cast_with(false).await;
        for x in [5, 7] {
            let first = c.owner.call("read_text", json!({ "path": BOARD })).await;
            let mut v: Value = serde_json::from_str(first["ok"]["text"].as_str().unwrap()).unwrap();
            v["nodes"][1]["x"] = json!(x);
            let wrote = c
                .owner
                .call(
                    "write_text",
                    json!({ "path": BOARD, "text": v.to_string(), "revision": first["ok"]["revision"] }),
                )
                .await;
            assert!(wrote.get("ok").is_some(), "{wrote}");
        }
        let (list, _) = exchange(&mut c.ana, "history_list", json!({ "path": REL }), OUTSIDE).await;
        let versions = list["ok"]["versions"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        assert!(versions.len() >= 2, "{list}");
        for v in versions {
            let (read, _) = exchange(
                &mut c.ana,
                "history_read",
                json!({ "path": REL, "id": v["id"] }),
                OUTSIDE,
            )
            .await;
            let text = read["ok"]["text"].as_str().unwrap_or_default();
            assert!(text.contains("\"Livre.md\""), "{read}");
            assert!(!text.contains("Sub/"), "{read}");
        }
        // The game master's own window reads the version whole.
        let mine = c.owner.call("history_list", json!({ "path": BOARD })).await;
        let first = mine["ok"]["versions"][0]["id"].clone();
        let read = c
            .owner
            .call("history_read", json!({ "path": BOARD, "id": first }))
            .await;
        assert!(read.to_string().contains("Fora/Y.md"), "{read}");
    });
}

/// Found beside E: a board whose file writes `nodes` twice crossed a share
/// spliced by its last list, and its first list — a card of a file beside
/// the share — crossed as it was written.
#[test]
fn a_board_that_writes_its_nodes_twice_crosses_a_share_as_the_window_reads_it() {
    block_on(async {
        let mut c = cast_with(false).await;
        let first = c.owner.call("read_text", json!({ "path": BOARD })).await;
        let twice = r#"{"nodes":[{"id":"c-out","type":"file","file":"Fora/Y.md","x":0,"y":0,"width":1,"height":1}],
"nodes":[{"id":"c-open","type":"file","file":"Sub/Livre.md","x":0,"y":0,"width":1,"height":1}],"edges":[]}"#;
        let wrote = c
            .owner
            .call(
                "write_text",
                json!({ "path": BOARD, "text": twice, "revision": first["ok"]["revision"] }),
            )
            .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        for cmd in ["read_text", "read_file_text"] {
            let (read, _) = exchange(&mut c.ana, cmd, json!({ "path": REL }), OUTSIDE).await;
            let text = read["ok"]["text"]
                .as_str()
                .or_else(|| read["ok"].as_str())
                .unwrap_or_default();
            assert!(text.contains("\"Livre.md\""), "{cmd}: {read}");
        }
    });
}
