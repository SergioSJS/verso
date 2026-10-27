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
const BOARD: &str = "Sub/Quadro.canvas";
const REL: &str = "Quadro.canvas";

/// What a player of the share must never hear of: the folder beside it.
const OUTSIDE: &[&str] = &["Fora", "zy.md", "Y.md"];

struct Cast {
    r: Running,
    /// The key the owner's folder is open under.
    key: String,
    owner: Win,
    ana: Win,
}

fn card(id: &str, file: &str, index: &str) -> Value {
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

async fn cast_with(table: bool) -> Cast {
    let r = start().await;
    let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(&r, &admin).await;
    let (mut owner, info) = Win::open(&r, &admin, &id).await;
    let key = info["ok"]["key"].as_str().unwrap().to_owned();
    for (name, text) in [
        ("Sub/Livre", "livre\n"),
        ("Sub/Lugares/Taverna do Corvo", "taverna\n"),
        ("Sub/Lugares/Ponte", "ponte\n"),
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
        json!({ "path": "Sub", "email": "ana@casa.lan", "role": "editor" }),
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
    Cast { r, key, owner, ana }
}

/// The game master's window draws the board into the room; returns its copy.
async fn master_seeds(c: &mut Cast) -> Doc {
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

async fn ana_joins(c: &mut Cast) -> (Value, Doc) {
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
        let new = put(
            &ana,
            "c-new",
            1,
            31,
            &card("c-new", "Lugares/Taverna do Corvo.md", "a2"),
        );
        let mark = edited(&ana, 1);
        let both = yrs::merge_updates_v1([new.as_slice(), mark.as_slice()]).unwrap();
        let (sent, _) = exchange(
            &mut c.ana,
            "collab_update",
            json!({ "path": REL, "update": STANDARD.encode(both) }),
            OUTSIDE,
        )
        .await;
        assert!(sent.get("ok").is_some(), "{sent}");

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
