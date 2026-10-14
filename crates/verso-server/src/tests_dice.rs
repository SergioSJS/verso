// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Dice in a room (ADR 0088 item 4): the window asks, the server rolls
//! with its own generator and relays the roll stamped with the account,
//! so no window shows the others a roll it chose; the room keeps its last
//! rolls in memory for whoever joins, and nothing is written.

use serde_json::{Value, json};

use crate::db::Role;
use crate::tests::{
    Running, block_on, call, connect, event_named, folder_id, next, sign_in, start,
};

const NOTE: &str = "Sessao.md";

/// Admin and Ana, a reader of the folder, both in the note's room.
async fn two_in_the_room(r: &Running) -> (crate::tests::Socket, crate::tests::Socket) {
    let admin = sign_in(r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(r, &admin).await;
    let ana = r
        .server
        .db
        .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
        .unwrap();
    r.server.db.grant(&id, &ana.id, Role::Reader).unwrap();
    let ana_b = sign_in(r, "ana@casa.lan", "a senha da ana").await;
    let mut seen = connect(r, Some(&admin.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    let mut roller = connect(r, Some(&ana_b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    for ws in [&mut seen, &mut roller] {
        next(ws).await;
        call(ws, 1, "open_server_folder", json!({ "id": id })).await;
        let joined = call(ws, 2, "collab_join", json!({ "path": NOTE })).await;
        assert!(joined.get("ok").is_some(), "{joined}");
    }
    (seen, roller)
}

fn faces(roll: &Value) -> Vec<i64> {
    roll["terms"][0]["kept"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_i64().unwrap())
        .collect()
}

/// A reader rolls in the note: the server's roll, named after the
/// account, heard by the other window as it was answered; the file is the
/// same bytes after.
#[test]
fn a_roll_in_a_room_is_the_servers_and_the_room_hears_it() {
    block_on(async {
        let r = start().await;
        let (mut seen, mut roller) = two_in_the_room(&r).await;
        let before = call(&mut seen, 50, "read_note", json!({ "path": NOTE })).await;
        let answer = call(
            &mut roller,
            3,
            "collab_roll",
            json!({ "path": NOTE, "notation": "2d6 + 3", "source": null }),
        )
        .await;
        let roll = answer["ok"].clone();
        assert_eq!(roll["by"], "Ana", "{answer}");
        assert_eq!(roll["notation"], "2d6+3");
        assert_eq!(roll["modifier"], 3);
        let got = faces(&roll);
        assert_eq!(got.len(), 2);
        assert!(got.iter().all(|f| (1..=6).contains(f)), "{got:?}");
        assert_eq!(roll["total"], got.iter().sum::<i64>() + 3);
        assert_eq!(
            roll["at"].as_str().unwrap().len(),
            "2026-10-14T21:30:00Z".len()
        );
        let heard = event_named(&mut seen, "collab-roll").await;
        assert_eq!(heard["path"], NOTE);
        assert_eq!(heard["roll"], roll);
        // A table's roll carries the table, as the note writes it.
        let table = call(
            &mut roller,
            4,
            "collab_roll",
            json!({ "path": NOTE, "notation": "d100", "source": "[[Tabelas#^encontros]]" }),
        )
        .await;
        assert_eq!(table["ok"]["source"], "[[Tabelas#^encontros]]", "{table}");
        let heard = event_named(&mut seen, "collab-roll").await;
        assert_eq!(heard["roll"]["source"], "[[Tabelas#^encontros]]");
        // Whoever joins now hears the room's last rolls, oldest first.
        let rejoined = call(&mut seen, 5, "collab_join", json!({ "path": NOTE })).await;
        let rolls = rejoined["ok"]["rolls"].as_array().unwrap().clone();
        assert_eq!(rolls.len(), 2, "{rejoined}");
        assert_eq!(rolls[0], roll);
        assert_eq!(rolls[1]["source"], "[[Tabelas#^encontros]]");
        // Nothing was written.
        tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
        let after = call(&mut seen, 51, "read_note", json!({ "path": NOTE })).await;
        assert_eq!(after["ok"]["text"], before["ok"]["text"], "{after}");
        assert_eq!(after["ok"]["revision"], before["ok"]["revision"]);
    });
}

/// A notation the server does not read, a table that is not a link, a
/// window not in the room: refused, nothing relayed, nothing kept.
#[test]
fn a_roll_the_server_cannot_make_is_refused() {
    block_on(async {
        let r = start().await;
        let (mut seen, mut roller) = two_in_the_room(&r).await;
        let mut id = 10;
        for notation in [
            "",
            "1d20*2",
            "2d6!",
            "d%",
            "101d6",
            "1d1",
            "1d1001",
            "4d6r1",
            "1d20adv",
            "[2d6]",
            &"1d6+".repeat(60),
        ] {
            id += 1;
            let answer = call(
                &mut roller,
                id,
                "collab_roll",
                json!({ "path": NOTE, "notation": notation, "source": null }),
            )
            .await;
            assert_eq!(answer["err"]["kind"], "refused", "{notation}: {answer}");
        }
        for source in [
            "not a link",
            "[[a\nb]]",
            &format!("[[{}]]", "x".repeat(600)),
        ] {
            id += 1;
            let answer = call(
                &mut roller,
                id,
                "collab_roll",
                json!({ "path": NOTE, "notation": "1d6", "source": source }),
            )
            .await;
            assert_eq!(answer["err"]["kind"], "refused", "{source}: {answer}");
        }
        let elsewhere = call(
            &mut roller,
            99,
            "collab_roll",
            json!({ "path": "Outra.md", "notation": "1d6", "source": null }),
        )
        .await;
        assert_eq!(elsewhere["err"]["kind"], "refused", "{elsewhere}");
        let rejoined = call(&mut seen, 100, "collab_join", json!({ "path": NOTE })).await;
        assert_eq!(rejoined["ok"]["rolls"], json!([]), "{rejoined}");
    });
}

/// The room keeps its last rolls only: the oldest go.
#[test]
fn a_room_keeps_its_last_rolls_only() {
    block_on(async {
        let r = start().await;
        let (mut seen, mut roller) = two_in_the_room(&r).await;
        for i in 0..(crate::collab::ROLLS_KEPT as u64 + 5) {
            let answer = call(
                &mut roller,
                10 + i,
                "collab_roll",
                json!({ "path": NOTE, "notation": format!("1d6+{i}"), "source": null }),
            )
            .await;
            assert!(answer.get("ok").is_some(), "{answer}");
        }
        let rejoined = call(&mut seen, 3, "collab_join", json!({ "path": NOTE })).await;
        let rolls = rejoined["ok"]["rolls"].as_array().unwrap().clone();
        assert_eq!(rolls.len(), crate::collab::ROLLS_KEPT);
        assert_eq!(rolls[0]["notation"], "1d6+5");
    });
}
