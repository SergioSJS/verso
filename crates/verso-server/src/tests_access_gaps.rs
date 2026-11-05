// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a player is shown in the moment between a write landing on disk
//! and the table's access following it (the audit of 2026-11-05): a file
//! seen outside its audience is BLOCKING. Each test stops the step at that
//! moment (`crate::pause`) and asks as the player then, every time.
//!
//! The cast is the table of `tests_campaign::mesa`; "Praça" is a folder
//! every player sees, and "Barão Zq.md" a note at the root, which no
//! player sees. A move keeps the access a file had (ADR 0113 K.2).

use serde_json::{Value, json};

use crate::pause::{arrived, hold};
use crate::tests::block_on;
use crate::tests_campaign::{Mesa, mesa, strings};

fn set(whole: &str) -> Value {
    json!({ "kind": "set", "set": { "whole": whole, "rows": [] }, "secret_name": null })
}

/// "Praça", seen by every player, with a note in it.
async fn praca(m: &mut Mesa) {
    let made = m
        .owner
        .call(
            "create_note",
            json!({ "name": "Praça/Fonte", "text": "água\n" }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    let open = m
        .owner
        .call(
            "access_set",
            json!({ "paths": ["Praça"], "change": set("see") }),
        )
        .await;
    assert!(open.get("ok").is_some(), "{open}");
    let listed = m.ana.call("list_notes", json!({})).await;
    assert!(
        strings(&listed["ok"]).contains(&"Praça/Fonte.md".to_owned()),
        "{listed}"
    );
}

/// What a player is shown of the hidden note: by its name in the listing,
/// and its text by the path it now has.
fn shown(listed: &Value, read: &Value) -> Vec<String> {
    let mut out: Vec<String> = strings(&listed["ok"])
        .into_iter()
        .filter(|p| p.contains("Zq"))
        .collect();
    if read.get("ok").is_some() {
        out.push(format!("read: {read}"));
    }
    out
}

/// After the move, as it settled: the note keeps the access it had.
async fn still_hidden(m: &mut Mesa, path: &str) {
    for w in [&mut m.ana, &mut m.bia] {
        let listed = w.call("list_notes", json!({})).await;
        let read = w.call("read_note", json!({ "path": path })).await;
        assert_eq!(shown(&listed, &read), Vec::<String>::new());
    }
}

/// A window's move of a hidden note into a folder the players see: the
/// note is on disk under "Praça" before the table carries its access
/// along. A player asking then is not shown it.
#[test]
fn a_window_move_shows_no_player_the_file_before_its_access_follows() {
    block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        let (heard, go) = hold("window-moved", &m.id);
        let Mesa { owner, ana, .. } = &mut m;
        let mover = owner.call(
            "move_entries",
            json!({ "paths": ["Barão Zq.md"], "folder": "Praça" }),
        );
        let player = async {
            arrived(heard).await;
            let listed = ana.call("list_notes", json!({})).await;
            let read = ana
                .call("read_note", json!({ "path": "Praça/Barão Zq.md" }))
                .await;
            let _ = go.send(());
            (listed, read)
        };
        let (moved, (listed, read)) = tokio::join!(mover, player);
        assert!(moved.get("ok").is_some(), "{moved}");
        assert_eq!(shown(&listed, &read), Vec::<String>::new());
        still_hidden(&mut m, "Praça/Barão Zq.md").await;
    });
}

/// A player's answer begun before a move and read after it: what it
/// lists is judged by the access as it is once the move is done, not by
/// the table as it was when the answer began.
#[test]
fn a_players_answer_that_straddles_a_move_is_judged_by_the_access_after_it() {
    block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        let (heard, go) = hold("player-veiled", &m.id);
        let Mesa { owner, ana, .. } = &mut m;
        let player = ana.call("list_notes", json!({}));
        let mover = async {
            arrived(heard).await;
            let moved = owner
                .call(
                    "move_entries",
                    json!({ "paths": ["Barão Zq.md"], "folder": "Praça" }),
                )
                .await;
            let _ = go.send(());
            moved
        };
        let (listed, moved) = tokio::join!(player, mover);
        assert!(moved.get("ok").is_some(), "{moved}");
        assert_eq!(shown(&listed, &json!({})), Vec::<String>::new());
        still_hidden(&mut m, "Praça/Barão Zq.md").await;
    });
}
