// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A window that starts joins the rooms of all its tabs at once, and reads
//! beside them (measured live on the 1-core host, 2026-10-26: every
//! `collab_join` took over a second and a `read_note` beside them waited
//! as long). Here the same, on one thread for the server and the windows
//! together, against a table with a score of notes and boards: the joins
//! and the read are sent together and each answer is timed.

use std::time::{Duration, Instant};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use crate::tests_campaign::{Win, mesa};

/// One thread for everything: what the 1-core host has.
pub(crate) fn one_thread<F: std::future::Future>(f: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(f)
}

/// Send every `(id, cmd, args)` at once; the time each answer took.
async fn together(win: &mut Win, calls: &[(u64, &str, Value)]) -> Vec<(String, Duration, bool)> {
    let start = Instant::now();
    for (id, cmd, args) in calls {
        win.ws
            .send(Message::Text(
                json!({ "id": id, "cmd": cmd, "args": args })
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
    }
    let mut left = calls.len();
    let mut out = Vec::new();
    while left > 0 {
        let m = tokio::time::timeout(Duration::from_secs(60), win.ws.next())
            .await
            .expect("an answer in time")
            .unwrap()
            .unwrap();
        let Message::Text(t) = m else { continue };
        let v: Value = serde_json::from_str(&t).unwrap_or(Value::Null);
        let Some(id) = v.get("id").and_then(Value::as_u64) else {
            continue;
        };
        if let Some((_, cmd, args)) = calls.iter().find(|(i, _, _)| *i == id) {
            let what = format!("{cmd} {}", args["path"].as_str().unwrap_or(""));
            out.push((what, start.elapsed(), v.get("ok").is_some()));
            left -= 1;
        }
    }
    out
}

#[test]
fn joins_and_a_read_together_do_not_wait_for_each_other() {
    one_thread(async {
        let mut m = mesa().await;
        let mut names = Vec::new();
        for i in 0..20 {
            let name = format!("Nota {i}");
            let text = format!(
                "# {name}\n\n{}\n\n> [!secret] zqsecret{i}\n> do mestre\n\n[[Livre]]\n",
                "Um parágrafo de texto da mesa. ".repeat(40)
            );
            let made = m
                .owner
                .call("create_note", json!({ "name": name, "text": text }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
            names.push(format!("{name}.md"));
        }
        // Boards the window restores in its tabs: JSON Canvases of a few
        // hundred cards, one the player edits and one she only sees.
        for board in ["Quadro A.canvas", "Quadro B.canvas"] {
            let nodes: Vec<Value> = (0..300)
                .map(|i| json!({ "id": format!("n{i}"), "type": if i % 3 == 0 { "file" } else { "text" },
                    "file": match i % 4 { 0 => "Livre.md".to_owned(), 1 => "Anexos/aberto.png".to_owned(), 2 => format!("Nota {}.md", i % 20), _ => "Barão Zq.md".to_owned() }, "text": format!("cartão {i} com algum texto"),
                    "x": (i % 20) * 120, "y": (i / 20) * 80, "width": 100, "height": 60 }))
                .collect();
            let edges: Vec<Value> = (1..150)
                .map(|i| json!({ "id": format!("e{i}"), "fromNode": format!("n{}", i - 1), "toNode": format!("n{i}") }))
                .collect();
            let file = json!({ "nodes": nodes, "edges": edges }).to_string();
            let made = m
                .owner
                .call(
                    "create_file",
                    json!({ "path": board,
                "base64": base64::engine::general_purpose::STANDARD.encode(file) }),
                )
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let walked = m.owner.call("reindex", json!({})).await;
        assert!(walked.get("ok").is_some(), "{walked}");
        let released = m
            .owner
            .call(
                "campaign_release",
                json!({ "paths": names, "released": true }),
            )
            .await;
        assert!(released.get("ok").is_some(), "{released}");
        let set = crate::access::NodeSet {
            whole: crate::access::Level::See,
            rows: [(m.ana_id.clone(), crate::access::Level::Edit)].into(),
        };
        m.r.server
            .db
            .access_put(&m.id, "Quadro A.canvas", set)
            .unwrap();
        crate::campaign::forget(&m.r.server, &m.id);
        // A round to warm what a first ask makes once.
        let _ = together(
            &mut m.ana,
            &[(100, "read_note", json!({ "path": "Livre.md" }))],
        )
        .await;

        for (who, win) in [("owner", &mut m.owner), ("player", &mut m.ana)] {
            let calls: Vec<(u64, &str, Value)> = vec![
                (201, "collab_join", json!({ "path": "Nota 0.md" })),
                (202, "collab_join", json!({ "path": "Nota 1.md" })),
                (203, "collab_join", json!({ "path": "Nota 2.md" })),
                (204, "collab_join", json!({ "path": "Nota 3.md" })),
                (205, "read_note", json!({ "path": "Nota 10.md" })),
                (206, "collab_join", json!({ "path": "Quadro A.canvas" })),
            ];
            let t = Instant::now();
            let done = together(win, &calls).await;
            let all = t.elapsed();
            for (what, took, ok) in &done {
                eprintln!(
                    "join-speed {who}: {what:<24} {:>5} ms ok={ok}",
                    took.as_millis()
                );
                assert!(ok, "{what}");
            }
            eprintln!("join-speed {who}: all {} ms", all.as_millis());
            assert!(all < Duration::from_millis(500), "{who}: {all:?}");
            // A board's shadow is made without the folder's lock: the notes
            // joined beside it are not held until it is done.
            for (what, took, _) in done
                .iter()
                .filter(|(w, _, _)| w.starts_with("collab_join Nota"))
            {
                assert!(
                    *took < Duration::from_millis(300),
                    "{who}: {what} waited {took:?}"
                );
            }
            let read = done
                .iter()
                .find(|(w, _, _)| w.starts_with("read_note"))
                .unwrap();
            assert!(
                read.1 < Duration::from_millis(300),
                "{who}: the read waited {:?}",
                read.1
            );
        }
    });
}
