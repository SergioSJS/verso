// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The walls of an imported map never reach a player (fix of 2026-11-15,
//! ADR 0120 "As built"; found by the reading of ADR 0121, B1). A board the
//! dungeon import of 0.9.0-beta.2 wrote keeps `verso.walls` — every wall
//! and door, a secret door named `secret` — and draws a secret door as a
//! dashed line, unmarked. What a player is served of a board is now an
//! allowlist of its keys, and a secret door is not drawn for them. Checked
//! against a real server, on every way a player is handed the board: Ana,
//! who edits it (her room's snapshot, its `base`, what the game master
//! changes after, `read_text`), Bia, who only sees it (`read_text`, the
//! bytes and hash her device syncs), and the history, which is the game
//! master's; the game master is served it all.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};

use crate::access::Level;
use crate::collab_board::{self, tests::put};
use crate::db::Role;
use crate::tests_board_players::{PATH, access, exchange, hear, join, seeded, send};
use crate::tests_campaign::{Mesa, mesa};

/// What only the game master may be served: the walls, a key at the top
/// that Verso does not know, one under `verso`, the secret door the import
/// drew unmarked, a drawn element marked secret.
const WALLS: &[&str] = &["zqwall", "zqtopkey", "zqversokey", "zqdoor", "zqmarked"];

fn door() -> Value {
    json!({ "type": "line", "x": 7001, "y": 7002, "width": 0, "height": 40, "groupIds": ["wb-dungeon"],
        "strokeStyle": "dashed", "strokeWidth": 3, "roughness": 0, "points": [[0, 0], [0, 40]] })
}

fn marked() -> Value {
    json!({ "type": "rectangle", "x": 7101, "y": 7102, "width": 9, "height": 9, "groupIds": ["wb-dungeon"],
        "customData": { "verso": { "secret": true } } })
}

fn floor() -> Value {
    json!({ "type": "rectangle", "x": 0, "y": 0, "width": 200, "height": 120, "groupIds": ["wb-dungeon"],
        "strokeStyle": "solid", "strokeWidth": 1 })
}

fn with_id(id: &str, mut v: Value) -> Value {
    v["id"] = json!(id);
    v
}

fn board() -> String {
    json!({
        "nodes": [ { "id": "c-open", "type": "file", "file": "Livre.md", "x": 300, "y": 0, "width": 200, "height": 100 } ],
        "edges": [],
        "zqtopkey": { "plan": "x" },
        "verso": {
            "version": 1,
            "background": "#fdf6e3",
            "zqversokey": 1,
            "drawing": [ with_id("floor", floor()), with_id("zqdoor", door()), with_id("zqmarked", marked()) ],
            "walls": { "version": 1, "generator": "one-page-dungeon", "cell": 40, "lines": [[0, 0, 200, 0]],
                "doors": [ { "line": [7001, 7002, 7001, 7042], "type": 6, "kind": "secret", "zqwall": true } ] },
        },
    })
    .to_string()
}

/// The game master makes the board and draws it into the room.
async fn master_draws(m: &mut Mesa) -> yrs::Doc {
    let made = m
        .owner
        .call(
            "create_file",
            json!({ "path": PATH, "base64": STANDARD.encode(board()) }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    let (_, copy, _) = join(&mut m.owner, &[]).await;
    let card = json!({ "type": "embeddable", "x": 300, "y": 0, "width": 200, "height": 100, "index": "a0",
        "link": "https://verso.invalid/board-node",
        "customData": { "canvas": { "id": "c-open", "type": "file", "file": "Livre.md", "x": 300, "y": 0, "width": 200, "height": 100 } } });
    let mut updates = vec![
        put(&copy.doc, "c-open", 1, 5, &card),
        put(&copy.doc, "floor", 1, 5, &{
            let mut e = floor();
            e["index"] = json!("a1");
            e
        }),
        put(&copy.doc, "zqdoor", 1, 5, &{
            let mut e = door();
            e["index"] = json!("a2");
            e
        }),
        put(&copy.doc, "zqmarked", 1, 5, &{
            let mut e = marked();
            e["index"] = json!("a3");
            e
        }),
    ];
    updates.push(seeded(&copy.doc));
    let seed = yrs::merge_updates_v1(updates.iter().map(Vec::as_slice)).unwrap();
    let (sent, _) = send(&mut m.owner, &seed, &[]).await;
    assert!(sent.get("ok").is_some(), "{sent}");
    copy.doc
}

fn text_of(read: &Value) -> Value {
    let text = read["ok"]["text"]
        .as_str()
        .or_else(|| read["ok"].as_str())
        .unwrap_or_default();
    serde_json::from_str(text).unwrap_or(Value::Null)
}

/// What a player is served of the board keeps what is theirs: the card, the
/// floor (grouped with the secret door, and not hidden with it), the
/// background, the version.
fn keeps_the_public(seen: &Value, what: &str) {
    assert_eq!(seen["nodes"][0]["id"], "c-open", "{what}: {seen}");
    let drawn: Vec<&str> = seen["verso"]["drawing"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|d| d["id"].as_str())
        .collect();
    assert_eq!(drawn, ["floor"], "{what}: {seen}");
    assert_eq!(seen["verso"]["background"], "#fdf6e3", "{what}");
    assert_eq!(seen["verso"]["version"], 1, "{what}");
    assert!(seen["verso"].get("walls").is_none(), "{what}: {seen}");
}

#[test]
fn a_player_who_edits_the_board_is_never_served_its_walls_nor_its_secret_door() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let gm = master_draws(&mut m).await;
        // The game master is served it all.
        let whole = m.owner.call("read_text", json!({ "path": PATH })).await;
        let whole = whole["ok"]["text"].as_str().unwrap().to_owned();
        for word in WALLS {
            assert!(whole.contains(word), "{word} is the game master's: {whole}");
        }
        assert!(collab_board::elements(&gm).contains_key("zqdoor"));

        // Her room: the snapshot at the join (every frame checked) and its base.
        let (joined, ana, _) = join(&mut m.ana, WALLS).await;
        assert_eq!(joined["ok"]["kind"], "board", "{joined}");
        let ids: Vec<String> = collab_board::elements(&ana.doc).into_keys().collect();
        assert_eq!(ids, ["c-open", "floor"]);
        let base: Value = serde_json::from_str(&ana.base()).unwrap();
        for word in WALLS {
            assert!(!ana.base().contains(word), "{word} in her base: {base}");
        }
        keeps_the_public(&base, "base");
        // What the game master changes of the door after: nothing reaches her.
        let moved = put(&gm, "zqdoor", 2, 9, &{
            let mut e = door();
            e["index"] = json!("a2");
            e["x"] = json!(7050);
            e
        });
        let (sent, _) = send(&mut m.owner, &moved, &[]).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        hear(&mut m.ana, 300, WALLS).await;
        // The file as she reads it.
        for cmd in ["read_text", "read_file_text"] {
            let (read, _) = exchange(&mut m.ana, cmd, json!({ "path": PATH }), WALLS).await;
            keeps_the_public(&text_of(&read), cmd);
        }
        // No history of a board for a player: a past version is the whole file.
        for cmd in ["history_list", "history_read", "history_copy"] {
            let (got, _) = exchange(
                &mut m.ana,
                cmd,
                json!({ "path": PATH, "id": "x", "stamp": "s", "lang": "pt" }),
                WALLS,
            )
            .await;
            assert!(got.get("err").is_some(), "{cmd}: {got}");
        }
    });
}

#[test]
fn a_player_who_only_sees_the_board_reads_and_syncs_it_without_its_walls() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        access(&m, &[]);
        master_draws(&mut m).await;
        for cmd in ["read_text", "read_file_text"] {
            let (read, _) = exchange(&mut m.bia, cmd, json!({ "path": PATH }), WALLS).await;
            keeps_the_public(&text_of(&read), cmd);
        }
        // Her room is the file's: she does not join it.
        let (joined, _) = exchange(&mut m.bia, "collab_join", json!({ "path": PATH }), WALLS).await;
        assert!(joined.get("ok").is_none(), "{joined}");
        // What her device syncs: the bytes and the hash of what she is shown.
        let (state, _) = exchange(&mut m.bia, "sync_state", json!({}), WALLS).await;
        let listed = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["path"] == PATH)
            .cloned()
            .unwrap();
        let (piece, _) = exchange(
            &mut m.bia,
            "sync_read",
            json!({ "path": PATH, "offset": 0 }),
            WALLS,
        )
        .await;
        let bytes = STANDARD
            .decode(piece["ok"]["data"].as_str().unwrap())
            .unwrap();
        let text = String::from_utf8(bytes).unwrap();
        for word in WALLS {
            assert!(!text.contains(word), "{word} reached her device: {text}");
        }
        keeps_the_public(&serde_json::from_str(&text).unwrap(), "sync_read");
        assert_eq!(listed["hash"], crate::sync::sha256(text.as_bytes()));
        // No history of a board for her either.
        let (got, _) = exchange(&mut m.bia, "history_list", json!({ "path": PATH }), WALLS).await;
        assert!(got.get("err").is_some(), "{got}");
    });
}

#[test]
fn the_file_route_sends_a_board_to_no_player_not_even_a_folders_editor() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        access(&m, &[]);
        master_draws(&mut m).await;
        // A folder's editor at the table is a player (ADR 0113 item 3).
        let c =
            m.r.server
                .db
                .create_account("cid@casa.lan", "Cid", "pt", Some("a senha do cid"), false)
                .unwrap();
        m.r.server.db.grant(&m.id, &c.id, Role::Editor).unwrap();
        let cid = crate::tests::sign_in(&m.r, "cid@casa.lan", "a senha do cid").await;
        let ana = crate::tests::sign_in(&m.r, "ana@casa.lan", "a senha da ana").await;
        for who in [&cid, &ana] {
            let res = reqwest::Client::new()
                .get(m.r.url(&format!("/f/{}/{PATH}", m.id)))
                .header("cookie", &who.cookie)
                .send()
                .await
                .unwrap();
            let status = res.status();
            let body = res.text().await.unwrap();
            assert!(!status.is_success(), "{status}: {body}");
            for word in WALLS {
                assert!(
                    !body.contains(word),
                    "{word} reached a player through /f/: {body}"
                );
            }
        }
        // The game master's own window is sent it whole.
        let res = reqwest::Client::new()
            .get(m.r.url(&format!("/f/{}/{PATH}", m.id)))
            .header("cookie", &m.admin.cookie)
            .send()
            .await
            .unwrap();
        assert!(res.status().is_success(), "{}", res.status());
        assert!(res.text().await.unwrap().contains("zqwall"));
    });
}
