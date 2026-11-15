// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The leaks the audit of 2026-11-15 found after the walls (ADR 0120 "As
//! built", ADR 0113 H), closed against a real server, each with its canary
//! swept over every command of the contract (`tests_secret_pins.rs` style):
//!
//! - **B**: a board file that writes a key twice — a secret pin to a
//!   reader's projection (both counted), an open card to serde (the last
//!   kept) — reaches no player who edits it: served as an empty board, its
//!   room refused (`board_sight::player_reads`);
//! - **C**: a board serde cannot read (a number too large for a float)
//!   reaches no player as it is: the veil fails closed
//!   (`campaign_serve::veil_board`);
//! - **F**: an attachment only a secret pin or a secret callout names is
//!   not released with its note or board (`opens_of_file` reads the
//!   projection).
//!
//! D and E (a share's window and its board's room, its history) are in
//! `tests_board_shares.rs`, beside the share they need.

use std::sync::atomic::{AtomicU64, Ordering};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use crate::access::Level;
use crate::tests_board_players::{PATH, access, exchange};
use crate::tests_campaign::{Mesa, PNG, Win, mesa};
use crate::tests_secret::{every_command, reaching};

static IDS: AtomicU64 = AtomicU64::new(50_000);

/// `cmd` asked by `win`: every frame heard until its answer checked for the
/// canaries, a binary one (a piece of a file) too.
async fn ask(win: &mut Win, cmd: &str, args: Value, canaries: &[&str]) {
    let id = IDS.fetch_add(1, Ordering::SeqCst);
    win.ws
        .send(Message::Text(
            json!({ "id": id, "cmd": cmd, "args": args })
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(30), win.ws.next())
            .await
            .expect("an answer in time")
            .unwrap()
            .unwrap();
        let text = match m {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
            _ => continue,
        };
        crate::tests_board_players::clean(cmd, &text, canaries);
        let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        if v.get("id").and_then(Value::as_u64) == Some(id) {
            return;
        }
    }
}

/// Every command of the contract, asked by `win` with arguments that reach
/// `path`; no frame it hears holds a canary.
pub(crate) async fn sweep(win: &mut Win, id: &str, path: &str, canaries: &[&str]) {
    let mut args = reaching(id);
    for key in ["path", "source", "from"] {
        args[key] = json!(path);
    }
    args["json"] = json!("{\"nodes\":[],\"edges\":[]}");
    for cmd in every_command() {
        ask(win, &cmd, args.clone(), canaries).await;
    }
}

async fn board_made(m: &mut Mesa, path: &str, text: &str) {
    let made = m
        .owner
        .call(
            "create_file",
            json!({ "path": path, "base64": STANDARD.encode(text) }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
}

fn text_of(read: &Value) -> String {
    read["ok"]["text"]
        .as_str()
        .or_else(|| read["ok"].as_str())
        .unwrap_or_default()
        .to_owned()
}

/// What only the secret pin of [`TWICE`] holds.
const TWICE_LEAKS: &[&str] = &["zqtwice"];

/// A board with an open card and a secret pin whose `verso` is written
/// twice: the first marks it secret, the second (serde's) does not.
const TWICE: &str = r#"{"nodes":[
{"id":"c-open","type":"file","file":"Livre.md","x":0,"y":0,"width":200,"height":100},
{"id":"zqtwice","type":"text","text":"zqtwicetext","x":600,"y":0,"width":40,"height":40,"verso":{"secret":true},"verso":{}}
],"edges":[]}
"#;

#[test]
fn b_a_board_that_writes_a_key_twice_reaches_no_player_who_edits_it() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        board_made(&mut m, PATH, TWICE).await;
        // The game master is served it whole; a reader's projection has no pin.
        let whole = m.owner.call("read_text", json!({ "path": PATH })).await;
        assert!(text_of(&whole).contains("zqtwice"), "{whole}");
        assert!(!verso_core::canvas_secret::project(TWICE).contains("zqtwice"));
        // Ana, who edits it: the file as she reads it, and the room.
        for cmd in ["read_text", "read_file_text"] {
            let (read, _) = exchange(&mut m.ana, cmd, json!({ "path": PATH }), TWICE_LEAKS).await;
            assert!(read.get("ok").is_some(), "{cmd}: {read}");
        }
        let (joined, _) = exchange(
            &mut m.ana,
            "collab_join",
            json!({ "path": PATH }),
            TWICE_LEAKS,
        )
        .await;
        assert!(joined.get("ok").is_none(), "{joined}");
        // Bia, who only sees it.
        let (read, _) = exchange(
            &mut m.bia,
            "read_text",
            json!({ "path": PATH }),
            TWICE_LEAKS,
        )
        .await;
        assert!(read.get("ok").is_some(), "{read}");
        let id = m.id.clone();
        sweep(&mut m.bia, &id, PATH, TWICE_LEAKS).await;
        sweep(&mut m.ana, &id, PATH, TWICE_LEAKS).await;
    });
}

/// A board serde cannot read and the canvas parser can: a card of a hidden
/// note, a text card that links another by its path, a number out of a
/// float's range.
const HUGE: &str = r#"{"nodes":[
{"id":"c-hid","type":"file","file":"Barão Zq.md","x":0,"y":0,"width":200,"height":100},
{"id":"t","type":"text","text":"ver [[Mundo Zq/Cripta Zq|um lugar]]","x":0,"y":200,"width":200,"height":100,"zqhuge":1e400}
],"edges":[]}
"#;

/// What [`HUGE`] holds that a player is not served: the hidden note's path,
/// the linked note's folder, and (the board being no board to the veil) the
/// key the number is under.
const HUGE_LEAKS: &[&str] = &["Barão Zq.md", "Mundo Zq", "zqhuge"];

#[test]
fn c_a_board_serde_cannot_read_is_veiled_shut_for_a_player() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        access(&m, &[]);
        board_made(&mut m, PATH, HUGE).await;
        assert!(serde_json::from_str::<Value>(HUGE).is_err());
        assert!(verso_core::canvas::Canvas::parse(HUGE).is_ok());
        let whole = m.owner.call("read_text", json!({ "path": PATH })).await;
        assert!(text_of(&whole).contains("Barão Zq.md"), "{whole}");
        for cmd in ["read_text", "read_file_text"] {
            let (read, _) = exchange(&mut m.bia, cmd, json!({ "path": PATH }), HUGE_LEAKS).await;
            assert!(read.get("ok").is_some(), "{cmd}: {read}");
        }
        let id = m.id.clone();
        sweep(&mut m.bia, &id, PATH, HUGE_LEAKS).await;
    });
}

/// What only the secret parts name: an attachment a secret callout embeds,
/// one a secret pin shows.
const SECRET_FILES: &[&str] = &["zqcallout", "zqpinado"];

#[test]
fn f_an_attachment_only_a_secret_part_names_is_not_released() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        for path in ["Anexos/zqcallout.png", "Anexos/zqpinado.png"] {
            let made = m
                .owner
                .call("create_file", json!({ "path": path, "base64": PNG }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let made = m
            .owner
            .call(
                "create_note",
                json!({ "name": "Rumor", "text": "# Rumor\n\naberto\n\n> [!secret]\n> ![[zqcallout.png]]\n" }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        board_made(
            &mut m,
            "Segredos.canvas",
            r#"{"nodes":[
{"id":"t","type":"text","text":"praca","x":0,"y":0,"width":9,"height":9},
{"id":"p","type":"file","file":"Anexos/zqpinado.png","x":50,"y":50,"width":9,"height":9,"verso":{"pin":true,"secret":true}}
],"edges":[]}"#,
        )
        .await;
        let walked = m.owner.call("reindex", json!({})).await;
        assert!(walked.get("ok").is_some(), "{walked}");
        let released = m
            .owner
            .call(
                "campaign_release",
                json!({ "paths": ["Rumor.md", "Segredos.canvas"], "released": true }),
            )
            .await;
        assert!(released.get("ok").is_some(), "{released}");
        // What her device syncs: neither attachment.
        let (state, _) = exchange(&mut m.bia, "sync_state", json!({}), SECRET_FILES).await;
        let listed: Vec<&str> = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|f| f["path"].as_str())
            .collect();
        assert!(listed.contains(&"Rumor.md"), "{listed:?}");
        assert!(listed.contains(&"Anexos/aberto.png"), "{listed:?}");
        // The file route: the released note's open attachment is served,
        // the secret parts' are not.
        let bia = crate::tests::sign_in(&m.r, "bia@casa.lan", "a senha da bia").await;
        for (path, served) in [
            ("Anexos/aberto.png", true),
            ("Anexos/zqcallout.png", false),
            ("Anexos/zqpinado.png", false),
        ] {
            let res = reqwest::Client::new()
                .get(m.r.url(&format!("/f/{}/{path}", m.id)))
                .header("cookie", &bia.cookie)
                .send()
                .await
                .unwrap();
            assert_eq!(res.status().is_success(), served, "{path}");
        }
        let id = m.id.clone();
        sweep(&mut m.bia, &id, "Rumor.md", SECRET_FILES).await;
        sweep(&mut m.bia, &id, "Segredos.canvas", SECRET_FILES).await;
    });
}
