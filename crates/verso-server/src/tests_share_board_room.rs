// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A board's room through a share at no table (ADR 0081 item 11, roadmap
//! V.49): the share's window edits the board in a shadow of the room cut to
//! the share (`collab_players.rs`, as a table player's is) — every card in
//! the share's paths, a card beside the share locked — while the owner's
//! window is in the room itself; the file the room writes keeps the owner's
//! paths and every card the share does not see.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};
use yrs::Doc;

use crate::access::{Level, NodeSet};
use crate::collab_board::tests::put;
use crate::collab_board::{self};
use crate::tests_board_players::{
    Copy, apply, bytes, canvas_of, edited, exchange, hear, join, node, seeded, send, sv,
};
use crate::tests_board_shares::{BOARD, Cast, REL, card, cast_with, master_seeds};

/// What the share's window must never hear: the folder beside the share,
/// and the owner's path of the shared folder.
const LEAKS: &[&str] = &["Fora", "zy.md", "Y.md", "Sub/"];

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

/// The owner's file, as it is on the server.
async fn disk(c: &mut Cast) -> Value {
    let read = c.owner.call("read_text", json!({ "path": BOARD })).await;
    serde_json::from_str(read["ok"]["text"].as_str().unwrap()).unwrap()
}

/// `update` sent by the owner's window into the room.
async fn owner_sends(c: &mut Cast, update: &[u8]) {
    let (sent, _) = exchange(
        &mut c.owner,
        "collab_update",
        json!({ "path": BOARD, "update": STANDARD.encode(update) }),
        &[],
    )
    .await;
    assert!(sent.get("ok").is_some(), "{sent}");
}

#[test]
fn two_windows_edit_a_shared_board_together_and_the_share_hears_only_its_own() {
    crate::tests::block_on(async {
        let mut c = cast_with(false).await;
        let gm = master_seeds(&mut c).await;
        let (joined, ana, _) = join(&mut c.ana, LEAKS).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        assert_eq!(file_of(&ana.doc, "c-open").as_deref(), Some("Livre.md"));
        assert!(locked(&ana.doc, "c-out"));
        assert!(file_of(&ana.doc, "c-out").is_none());

        // She puts a note of the share on the board by the share's path: the
        // owner's window hears the owner's.
        let new = put(
            &ana.doc,
            "c-new",
            1,
            31,
            &card("c-new", "Lugares/Ponte.md", "a2"),
        );
        let both = yrs::merge_updates_v1([new.as_slice(), edited(&ana.doc, 1).as_slice()]).unwrap();
        let (sent, _) = send(&mut c.ana, &both, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let told = hear(&mut c.owner, 400, &[]).await;
        Copy::take_into(&gm, &told);
        for e in told.iter().filter(|e| e["event"] == "collab-update") {
            apply(&gm, &bytes(e["payload"]["update"].as_str().unwrap()));
        }
        assert_eq!(
            file_of(&gm, "c-new").as_deref(),
            Some("Sub/Lugares/Ponte.md")
        );

        // The owner moves her card and puts one beside the share: she hears
        // hers moved, the other locked, nothing of where.
        let mut open = collab_board::elements(&gm).remove("c-open").unwrap();
        open["x"] = json!(33);
        let moved = put(&gm, "c-open", 2, 61, &open);
        let beside = put(&gm, "g-out", 1, 62, &card("g-out", "Fora/Y.md", "a5"));
        owner_sends(
            &mut c,
            &yrs::merge_updates_v1([moved.as_slice(), beside.as_slice()]).unwrap(),
        )
        .await;
        let heard = hear(&mut c.ana, 500, LEAKS).await;
        ana.take(&heard);
        assert_eq!(ana.element("c-open").unwrap()["x"], 33);
        assert!(
            locked(&ana.doc, "g-out"),
            "{:?}",
            collab_board::elements(&ana.doc)
        );
        assert!(file_of(&ana.doc, "g-out").is_none());
        let text = serde_json::to_string(&collab_board::elements(&ana.doc)).unwrap();
        for leak in LEAKS {
            assert!(!text.contains(leak), "{leak} in {text}");
        }

        // A card beside the share is not hers to name, nor a locked one to
        // change: refused whole, nothing reaches the room.
        let bad = put(
            &ana.doc,
            "c-bad",
            1,
            41,
            &card("c-bad", "../Fora/Y.md", "a3"),
        );
        let (sent, _) = send(&mut c.ana, &bad, LEAKS).await;
        assert_eq!(sent["err"]["kind"], "refused", "{sent}");
        let mut lock = ana.element("c-out").unwrap();
        lock["x"] = json!(999);
        let touch = put(&ana.doc, "c-out", 9, 42, &lock);
        let (sent, _) = send(&mut c.ana, &touch, LEAKS).await;
        assert_eq!(sent["err"]["kind"], "refused", "{sent}");
        let room = collab_board::elements(&gm);
        assert!(!room.contains_key("c-bad"));
        // Her presence and the owner's cross; hers names nothing beside.
        let id = c.share.clone();
        crate::tests_board_leaks::sweep(&mut c.ana, &id, REL, LEAKS).await;
    });
}

#[test]
fn the_file_a_share_window_makes_alone_keeps_the_owners_paths_and_what_it_does_not_see() {
    crate::tests::block_on(async {
        let mut c = cast_with(false).await;
        let original = disk(&mut c).await;
        // Alone in the room: she draws her shadow from what she was made of.
        let (joined, ana, _) = join(&mut c.ana, LEAKS).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let base: Value = serde_json::from_str(&ana.base()).unwrap();
        assert_eq!(node(&base, "c-open").unwrap()["file"], "Livre.md", "{base}");
        assert_eq!(node(&base, "c-out").unwrap()["type"], "text", "{base}");
        let mut drew: Vec<Vec<u8>> = Vec::new();
        for (i, n) in base["nodes"].as_array().unwrap().iter().enumerate() {
            let id = n["id"].as_str().unwrap();
            let e = json!({ "type": "embeddable", "x": n["x"], "y": n["y"], "width": n["width"], "height": n["height"],
                "index": format!("a{i}"), "customData": { "canvas": n }, "locked": id == "c-out" });
            drew.push(put(&ana.doc, id, 1, 5, &e));
        }
        drew.push(seeded(&ana.doc));
        let seed = yrs::merge_updates_v1(drew.iter().map(Vec::as_slice)).unwrap();
        let (sent, _) = send(&mut c.ana, &seed, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        assert_eq!(disk(&mut c).await, original);

        // She moves her card and adds one of the share.
        let mut open = ana.element("c-open").unwrap();
        open["x"] = json!(77);
        open["customData"]["canvas"]["x"] = json!(77);
        let edit = yrs::merge_updates_v1([
            put(&ana.doc, "c-open", 2, 21, &open).as_slice(),
            put(
                &ana.doc,
                "mine",
                1,
                23,
                &card("mine", "Lugares/Ponte.md", "c1"),
            )
            .as_slice(),
            edited(&ana.doc, 1).as_slice(),
        ])
        .unwrap();
        let (sent, _) = send(&mut c.ana, &edit, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let made = canvas_of(&ana.doc);
        let (given, _) = exchange(
            &mut c.ana,
            "collab_canvas",
            json!({ "path": REL, "at": sv(&ana.doc), "json": made.to_string() }),
            LEAKS,
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        let (saved, _) = exchange(&mut c.ana, "collab_save", json!({ "path": REL }), LEAKS).await;
        assert!(saved.get("ok").is_some(), "{saved}");
        let now = disk(&mut c).await;
        // Hers, in the owner's paths; the card beside the share, the disk's.
        assert_eq!(node(&now, "c-open").unwrap()["x"], 77, "{now}");
        assert_eq!(node(&now, "c-open").unwrap()["file"], "Sub/Livre.md");
        assert_eq!(node(&now, "mine").unwrap()["file"], "Sub/Lugares/Ponte.md");
        assert_eq!(node(&now, "c-out"), node(&original, "c-out"));
    });
}

/// A table made while a share's window is in its shadow: the shadow, cut by
/// the share alone, is closed and refuses what it is sent; the window joins
/// again as a player (the table's making closes the room's windows already;
/// `collab_players::veil_for` refuses a share's shadow under a table too).
#[test]
fn a_table_made_while_a_share_window_is_in_the_room_closes_its_shadow() {
    crate::tests::block_on(async {
        let mut c = cast_with(false).await;
        let gm = master_seeds(&mut c).await;
        let (joined, ana, _) = join(&mut c.ana, LEAKS).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let made = c.owner.call("campaign_make", json!({ "root": "" })).await;
        assert!(made.get("ok").is_some(), "{made}");
        // She may edit the board at the table, as a player.
        let folder = crate::campaign::folder_of_key(&c.r.server, &c.key).unwrap();
        let set = NodeSet {
            whole: Level::See,
            rows: [(c.account.clone(), Level::Edit)].into_iter().collect(),
        };
        c.r.server.db.access_put(&folder, BOARD, set).unwrap();
        crate::campaign::forget(&c.r.server, &folder);
        let mut open = collab_board::elements(&gm).remove("c-open").unwrap();
        open["x"] = json!(12);
        owner_sends(&mut c, &put(&gm, "c-open", 3, 71, &open)).await;
        let heard = hear(&mut c.ana, 500, LEAKS).await;
        let closed = heard.iter().any(|e| e["event"] == "collab-closed");
        let mine = put(
            &ana.doc,
            "c-new",
            1,
            81,
            &card("c-new", "Lugares/Ponte.md", "a9"),
        );
        let (sent, _) = send(&mut c.ana, &mine, LEAKS).await;
        assert!(closed, "{heard:?}");
        assert!(sent.get("err").is_some(), "{sent}");
    });
}
