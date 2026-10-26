// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Players who edit a board with no window of the game master's in its room
//! (ADR 0113 H): what they draw is written over the disk's file by the
//! room's quiet save, and found by the game master later.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};

use crate::access::Level;
use crate::collab_board::tests::put;
use crate::collab_board::{self};
use crate::tests_board_players::*;
use crate::tests_campaign::{Win, mesa};

/// A player's allowed edit is written with no window of the game master's
/// in the room: laid over the disk's file by the quiet save, nothing she does
/// not see touched, and the game master finds it when she opens the board.
#[test]
fn a_players_edit_is_written_with_no_game_masters_window_and_found_later() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": PATH, "base64": STANDARD.encode(file()) }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let original: Value = serde_json::from_str(&file()).unwrap();
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        let base: Value = serde_json::from_str(&ana.base()).unwrap();
        let mut drew: Vec<Vec<u8>> = Vec::new();
        for (i, n) in base["nodes"].as_array().unwrap().iter().enumerate() {
            let id = n["id"].as_str().unwrap();
            let e = json!({ "type": "embeddable", "x": n["x"], "y": n["y"], "width": n["width"], "height": n["height"],
                "index": format!("a{i}"), "customData": { "canvas": n }, "locked": id == "c-hid" });
            drew.push(put(&ana.doc, id, 1, 5, &e));
        }
        drew.push(seeded(&ana.doc));
        let seed = yrs::merge_updates_v1(drew.iter().map(Vec::as_slice)).unwrap();
        let (sent, _) = send(&mut m.ana, &seed, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        // She draws a rectangle, as her window does: the update, then its file.
        let edit = yrs::merge_updates_v1([
            put(
                &ana.doc,
                "hers",
                1,
                22,
                &json!({ "type": "rectangle", "index": "c0", "x": 5 }),
            )
            .as_slice(),
            edited(&ana.doc, 1).as_slice(),
        ])
        .unwrap();
        let (sent, _) = send(&mut m.ana, &edit, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let (given, _) = exchange(
            &mut m.ana,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&ana.doc), "json": canvas_of(&ana.doc).to_string() }),
            LEAKS,
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        // No ⌘S: the room writes when it has been quiet.
        tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
        let now = disk(&mut m).await;
        assert!(
            now["verso"]["drawing"]
                .as_array()
                .unwrap()
                .iter()
                .any(|d| d["id"] == "hers"),
            "{now}"
        );
        for id in ["c-hid", "zqpin"] {
            assert_eq!(node(&now, id), node(&original, id), "{id}");
        }
        assert_eq!(now["edges"], original["edges"]);
    });
}

/// The room outlives its last window for a while (a grace): a player who
/// comes into it then, with the game master's window gone, has her edit
/// written all the same.
#[test]
fn a_players_edit_is_written_in_a_room_the_game_master_left() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let gm = master_seeds(&mut m).await;
        // The game master edits (her window writes the file), then leaves.
        let mut e = collab_board::elements(&gm)["free"].clone();
        e["x"] = json!(11);
        let up = yrs::merge_updates_v1([
            put(&gm, "free", 2, 9, &e).as_slice(),
            edited(&gm, 1).as_slice(),
        ])
        .unwrap();
        let (sent, _) = send(&mut m.owner, &up, &[]).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let (given, _) = exchange(
            &mut m.owner,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&gm), "json": canvas_of(&gm).to_string() }),
            &[],
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        // Its window closes (the connection drops): the room is kept a while.
        m.owner.ws.close(None).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;

        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        let mut open = ana.element("c-open").unwrap();
        open["x"] = json!(321);
        open["customData"]["canvas"]["x"] = json!(321);
        let edit = yrs::merge_updates_v1([
            put(&ana.doc, "c-open", 2, 21, &open).as_slice(),
            edited(&ana.doc, 1).as_slice(),
        ])
        .unwrap();
        let (sent, _) = send(&mut m.ana, &edit, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let (given, _) = exchange(
            &mut m.ana,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&ana.doc), "json": canvas_of(&ana.doc).to_string() }),
            LEAKS,
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
        let b = crate::tests::sign_in(&m.r, "admin@casa.lan", "senha muito longa").await;
        let (mut again, _) = Win::open(&m.r, &b, &m.id).await;
        let read = again.call("read_text", json!({ "path": PATH })).await;
        let now: Value = serde_json::from_str(read["ok"]["text"].as_str().unwrap()).unwrap();
        assert_eq!(node(&now, "c-open").unwrap()["x"], 321, "{now}");
        assert_eq!(node(&now, "c-hid").unwrap()["file"], "Barão Zq.md");
    });
}

/// An Obsidian canvas with only nodes (no edges, no `verso` key at all): a
/// player's drawing is written into it all the same.
#[test]
fn a_players_drawing_is_written_into_a_canvas_with_only_nodes() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let plain = json!({ "nodes": [
            { "id": "p1", "type": "file", "file": "Livre.md", "x": 0, "y": 0, "width": 200, "height": 100 },
            { "id": "p2", "type": "file", "file": "Lugares/Nada.md", "x": 300, "y": 0, "width": 200, "height": 100 },
        ] })
        .to_string();
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": PATH, "base64": STANDARD.encode(&plain) }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        let base: Value = serde_json::from_str(&ana.base()).unwrap();
        let mut drew: Vec<Vec<u8>> = Vec::new();
        for (i, n) in base["nodes"].as_array().unwrap().iter().enumerate() {
            let id = n["id"].as_str().unwrap();
            let e = json!({ "type": "embeddable", "x": n["x"], "y": n["y"], "width": n["width"], "height": n["height"],
                "index": format!("a{i}"), "customData": { "canvas": n }, "locked": id == "p2" });
            drew.push(put(&ana.doc, id, 1, 5, &e));
        }
        drew.push(seeded(&ana.doc));
        let seed = yrs::merge_updates_v1(drew.iter().map(Vec::as_slice)).unwrap();
        let (sent, _) = send(&mut m.ana, &seed, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let edit = yrs::merge_updates_v1([
            put(
                &ana.doc,
                "hers",
                1,
                22,
                &json!({ "type": "rectangle", "index": "c0", "x": 5 }),
            )
            .as_slice(),
            edited(&ana.doc, 1).as_slice(),
        ])
        .unwrap();
        let (sent, _) = send(&mut m.ana, &edit, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let (given, _) = exchange(
            &mut m.ana,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&ana.doc), "json": canvas_of(&ana.doc).to_string() }),
            LEAKS,
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
        let now = disk(&mut m).await;
        assert!(
            now["verso"]["drawing"]
                .as_array()
                .is_some_and(|d| d.iter().any(|d| d["id"] == "hers")),
            "{now}"
        );
        assert_eq!(node(&now, "p2").unwrap()["file"], "Lugares/Nada.md");
    });
}
