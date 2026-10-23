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

/// Which of the note's dice with the same code was clicked (ADR 0107)
/// travels with the roll: relayed to the room, kept for whoever joins,
/// answered back; an absurd place is dropped, none is none, and a roll
/// written without the field (an older server or log) still reads.
#[test]
fn the_clicked_dies_place_travels_with_the_roll_and_a_hostile_one_is_dropped() {
    block_on(async {
        let r = start().await;
        let (mut seen, mut roller) = two_in_the_room(&r).await;
        let second = call(
            &mut roller,
            3,
            "collab_roll",
            json!({ "path": NOTE, "notation": "1d20", "source": null, "occurrence": 1 }),
        )
        .await;
        assert_eq!(second["ok"]["occurrence"], 1, "{second}");
        let heard = event_named(&mut seen, "collab-roll").await;
        assert_eq!(heard["roll"]["occurrence"], 1, "{heard}");
        for (id, bad) in [(4, json!(5000)), (5, json!(u32::MAX)), (6, Value::Null)] {
            let answer = call(
                &mut roller,
                id,
                "collab_roll",
                json!({ "path": NOTE, "notation": "1d20", "source": null, "occurrence": bad }),
            )
            .await;
            assert!(answer["ok"]["occurrence"].is_null(), "{bad}: {answer}");
            event_named(&mut seen, "collab-roll").await;
        }
        // Not a number a place can be: refused, nothing relayed.
        for (id, bad) in [
            (7, json!(-1)),
            (8, json!("1")),
            (9, json!(1.5)),
            (10, json!(1u64 << 40)),
        ] {
            let answer = call(
                &mut roller,
                id,
                "collab_roll",
                json!({ "path": NOTE, "notation": "1d20", "source": null, "occurrence": bad }),
            )
            .await;
            assert_eq!(answer["err"]["kind"], "refused", "{bad}: {answer}");
        }
        let rejoined = call(&mut seen, 11, "collab_join", json!({ "path": NOTE })).await;
        let rolls = rejoined["ok"]["rolls"].as_array().unwrap();
        assert_eq!(rolls.len(), 4, "{rejoined}");
        assert_eq!(rolls[0]["occurrence"], 1);
        assert!(rolls[1]["occurrence"].is_null());
        // A roll without the field reads.
        let old = json!({
            "notation": "1d20", "source": null, "terms": [], "modifier": 0,
            "total": 5, "by": "Ana", "at": "2026-10-14T21:30:00Z"
        });
        let roll: verso_contract::DiceRoll = serde_json::from_value(old).unwrap();
        assert_eq!(roll.occurrence, None);
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
            // Read since D1 (2026-10-14): `2d6!` and `d%`; still not these.
            "2d6!!",
            "4dF!",
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

/// An oracle draw in a room (ADR 0102 item 5): the server draws a
/// question, a spark and a table, names the account, the other window
/// hears each; the question's text is not in the request, and nothing is
/// written.
#[test]
fn an_oracle_draw_in_a_room_is_the_servers_and_the_room_hears_it() {
    block_on(async {
        let r = start().await;
        let (mut seen, mut asker) = two_in_the_room(&r).await;
        let before = call(&mut seen, 50, "read_note", json!({ "path": NOTE })).await;
        let q = call(
            &mut asker,
            3,
            "collab_oracle",
            json!({ "path": NOTE, "ask": { "kind": "question", "odds": [10, 30, 10, 10, 30, 10] } }),
        )
        .await;
        let draw = q["ok"].clone();
        assert_eq!(
            (draw["kind"].as_str(), draw["by"].as_str()),
            (Some("question"), Some("Ana")),
            "{q}"
        );
        let face = draw["roll"].as_u64().unwrap();
        assert!((1..=100).contains(&face), "{draw}");
        let col = draw["answer"].as_u64().unwrap();
        let expected = [10_u64, 40, 50, 60, 90, 100]
            .iter()
            .position(|up| face <= *up)
            .unwrap() as u64;
        assert_eq!(col, expected, "{draw}");
        let heard = event_named(&mut seen, "collab-oracle").await;
        assert_eq!(heard["path"], NOTE);
        assert_eq!(heard["draw"], draw);

        let lists =
            json!({ "action": ["a"], "theme": ["t1", "t2"], "descriptor": ["d"], "focus": ["f"] });
        let s = call(
            &mut asker,
            4,
            "collab_oracle",
            json!({ "path": NOTE, "ask": { "kind": "spark", "lists": lists } }),
        )
        .await;
        let words = s["ok"]["words"].as_array().unwrap().clone();
        assert_eq!(words.len(), 4, "{s}");
        assert_eq!(
            (words[0].as_str(), words[2].as_str(), words[3].as_str()),
            (Some("a"), Some("d"), Some("f"))
        );
        assert_eq!(
            event_named(&mut seen, "collab-oracle").await["draw"],
            s["ok"]
        );

        let t = call(
            &mut asker,
            5,
            "collab_oracle",
            json!({ "path": NOTE, "ask": { "kind": "table", "entries": ["só uma"] } }),
        )
        .await;
        assert_eq!(
            (t["ok"]["roll"].as_u64(), t["ok"]["words"][0].as_str()),
            (Some(1), Some("só uma")),
            "{t}"
        );
        assert_eq!(
            event_named(&mut seen, "collab-oracle").await["draw"],
            t["ok"]
        );

        // Nothing was written.
        tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
        let after = call(&mut seen, 51, "read_note", json!({ "path": NOTE })).await;
        assert_eq!(after["ok"]["revision"], before["ok"]["revision"]);
    });
}

/// A draw the server cannot make, or from a window not in the room:
/// refused, nothing relayed.
#[test]
fn an_oracle_draw_the_server_cannot_make_is_refused() {
    block_on(async {
        let r = start().await;
        let (_seen, mut asker) = two_in_the_room(&r).await;
        let mut id = 10;
        for (path, ask) in [
            (NOTE, json!({ "kind": "question", "odds": [50, 50] })),
            (
                NOTE,
                json!({ "kind": "question", "odds": [10, 30, 10, 10, 30, 11] }),
            ),
            (NOTE, json!({ "kind": "table", "entries": [] })),
            (
                NOTE,
                json!({ "kind": "spark", "lists": { "action": [], "theme": ["t"], "descriptor": ["d"], "focus": ["f"] } }),
            ),
            (NOTE, json!({ "kind": "dice" })),
            (
                "Outra.md",
                json!({ "kind": "table", "entries": ["a", "b"] }),
            ),
        ] {
            id += 1;
            let answer = call(
                &mut asker,
                id,
                "collab_oracle",
                json!({ "path": path, "ask": ask }),
            )
            .await;
            assert_eq!(answer["err"]["kind"], "refused", "{ask}: {answer}");
        }
    });
}
