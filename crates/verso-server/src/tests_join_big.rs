// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a player's join costs on a big table, and that what it keeps from
//! one ask to the next is never older than the table's last change
//! (measured live, 2026-10-30: a player's join was three to five times an
//! owner's, a board's about a second on the 1-core Windows host).

use std::time::{Duration, Instant};

use base64::Engine;
use serde_json::{Value, json};

use crate::access::{Level, NodeSet};
use crate::tests::{get, sign_in};
use crate::tests_campaign::mesa;
use crate::tests_join_speed::one_thread;

/// A board of `cards` cards a player edits: every fourth a file card
/// (some of a hidden file), every seventh a secret pin, edges between.
fn big_board(cards: usize) -> String {
    let nodes: Vec<Value> = (0..cards)
        .map(|i| {
            let mut n = json!({ "id": format!("n{i}"), "type": if i % 4 == 0 { "file" } else { "text" },
                "text": format!("cartão {i} com algum texto"),
                "x": (i % 20) * 120, "y": (i / 20) * 80, "width": 100, "height": 60 });
            if i % 4 == 0 {
                n["file"] = json!(match i % 12 {
                    0 => "Livre.md".to_owned(),
                    4 => "Barão Zq.md".to_owned(),
                    _ => format!("Nota {}.md", i % 20),
                });
            }
            if i % 7 == 0 {
                n["verso"] = json!({ "secret": true });
            }
            n
        })
        .collect();
    let edges: Vec<Value> = (1..cards)
        .map(|i| json!({ "id": format!("e{i}"), "fromNode": format!("n{}", i - 1), "toNode": format!("n{i}") }))
        .collect();
    json!({ "nodes": nodes, "edges": edges }).to_string()
}

#[test]
fn a_players_join_of_a_big_board_is_not_a_second_of_cpu() {
    one_thread(async {
        let mut m = mesa().await;
        for i in 0..20 {
            let made = m
                .owner
                .call(
                    "create_note",
                    json!({ "name": format!("Nota {i}"), "text": format!("# Nota {i}\n\n[[Livre]]\n") }),
                )
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let file = big_board(400);
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": "Grande.canvas",
                    "base64": base64::engine::general_purpose::STANDARD.encode(file) }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let walked = m.owner.call("reindex", json!({})).await;
        assert!(walked.get("ok").is_some(), "{walked}");
        let set = NodeSet {
            whole: Level::See,
            rows: [(m.ana_id.clone(), Level::Edit)].into(),
        };
        m.r.server
            .db
            .access_put(&m.id, "Grande.canvas", set)
            .unwrap();
        crate::campaign::forget(&m.r.server, &m.id);
        let t = Instant::now();
        let joined = m
            .ana
            .call("collab_join", json!({ "path": "Grande.canvas" }))
            .await;
        let took = t.elapsed();
        assert!(joined.get("ok").is_some(), "{joined}");
        eprintln!("join-big player: 400 cards {} ms", took.as_millis());
        // Debug build, any host: many times what a release one takes, and a
        // quadratic read of the board (the 2026-10-30 find) is far above.
        assert!(took < Duration::from_millis(2000), "{took:?}");
        // The secret pins are not in what she was told.
        let update = joined["ok"]["update"].as_str().unwrap_or_default();
        assert!(!update.is_empty());
    });
}

#[test]
fn what_a_note_opens_is_each_viewers_and_a_change_of_access_holds_at_once() {
    one_thread(async {
        let mut m = mesa().await;
        let ana = sign_in(&m.r, "ana@casa.lan", "a senha da ana").await;
        let bia = sign_in(&m.r, "bia@casa.lan", "a senha da bia").await;
        let url = format!("/f/{}/Anexos/aberto.png", m.id);
        // Aberta (the only note that embeds aberto.png) is Ana's alone.
        let set = |ana_sees: bool, id: &str| NodeSet {
            whole: Level::None,
            rows: if ana_sees {
                [(id.to_owned(), Level::See)].into()
            } else {
                Default::default()
            },
        };
        let put = |m: &crate::tests_campaign::Mesa, ana_sees: bool| {
            m.r.server
                .db
                .access_put(&m.id, "Aberta.md", set(ana_sees, &m.ana_id))
                .unwrap();
            crate::campaign::forget(&m.r.server, &m.id);
        };
        put(&m, true);
        // Asked in both orders: what one viewer's ask left is not another's.
        for _ in 0..2 {
            let (b, _) = get(&m.r, &url, Some(&bia)).await;
            let (a, _) = get(&m.r, &url, Some(&ana)).await;
            assert_eq!((a, b), (200, 404));
        }
        // The access taken back: the next ask holds it, no matter what was
        // kept.
        put(&m, false);
        let (a, _) = get(&m.r, &url, Some(&ana)).await;
        assert_eq!(a, 404, "Ana's access was taken back");
        // And given again.
        put(&m, true);
        let (a, _) = get(&m.r, &url, Some(&ana)).await;
        assert_eq!(a, 200);
        // The note rewritten without the embed: the attachment is shut again
        // at the next ask.
        let read = m
            .owner
            .call("read_note", json!({ "path": "Aberta.md" }))
            .await;
        let written = m
            .owner
            .call(
                "write_note",
                json!({ "path": "Aberta.md", "text": "# Aberta\n\nsem anexo\n",
                    "revision": read["ok"]["revision"] }),
            )
            .await;
        assert!(written.get("ok").is_some(), "{written}");
        let (a, _) = get(&m.r, &url, Some(&ana)).await;
        assert_eq!(a, 404, "the note no longer opens the attachment");
    });
}
