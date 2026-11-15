// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The guardrail of ADR 0090 item 5, end to end, beside `tests_secret.rs`
//! (ADR 0087 item 9): a board's secret pins never reach an account that
//! may only read the board. A reader's window calls every command of the
//! contract with arguments that reach the board; no answer, no event and
//! no piece of a file it receives holds a word only a secret pin holds —
//! its id, its text, its file, its address, its label, its coordinates, a
//! drawing that belongs to it. Then the paths where a reader follows a
//! board: sync (the bytes, the hashes, a change only inside a secret pin
//! that is none), the index (search, backlinks), the room (a reader is
//! not in it) and `/f/`. A `> [!secret]` callout inside a text card is
//! hidden the way a note's is (ADR 0087, decided 2026-10-15): the card
//! stays, its text projected.

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use crate::tests::{Socket, block_on, call};
use crate::tests_secret::{every_command, folder_with_a_reader, heard, reaching};

/// Words only the secret pins of [`BOARD`] hold.
const SECRET: &[&str] = &[
    "zqpinid",
    "zqpintext",
    "zqpinfile",
    "zqpinurl",
    "zqpinlabel",
    "zqdrawn",
    "9000011",
    "9100022",
    "zqcripta",
    "zqcallout",
    // What no reader is served of any board (fix of 2026-11-15): the walls an
    // imported map keeps, a key Verso does not know, the secret door the
    // import drew unmarked.
    "zqwallkey",
    "zqtopkey",
    "zqdoor",
    // A pin whose `verso` is written twice, secret in the first (the audit of
    // 2026-11-15, B): a reader's projection counts both.
    "zqtwice",
];

/// A map, an open pin to a note, and secret pins of three kinds: a file,
/// a text and a link; an edge and a drawn text that belong to the first.
const BOARD: &str = r#"{
	"nodes":[
		{"id":"mapa","type":"file","file":"Mapa.png","x":0,"y":0,"width":1000,"height":800,"verso":{"map":true,"locked":true,"groups":["gmapa"]}},
		{"id":"aberto","type":"file","file":"Taverna.md","x":100,"y":120,"width":24,"height":24,"verso":{"pin":true,"groups":["gmapa"]}},
		{"id":"praca","type":"text","text":"praca aberta ao povo","x":300,"y":300,"width":200,"height":60},
		{"id":"cartao","type":"text","text":"cartao aberto\n\n> [!secret]\n> zqcallout vive [[Cripta]]\n\nfim do cartao","x":400,"y":400,"width":200,"height":80},
		{"id":"zqpinid","type":"file","file":"Cripta.md","x":9000011,"y":9100022,"width":24,"height":24,"verso":{"pin":true,"secret":true,"groups":["gmapa","gzq"]}},
		{"id":"txt","type":"text","text":"zqpintext","x":9000012,"y":9100023,"width":24,"height":24,"verso":{"secret":true}},
		{"id":"zqpinfile","type":"link","url":"https://zqpinurl.example","x":9000013,"y":9100024,"width":24,"height":24,"verso":{"secret":true}},
		{"id":"zqtwice","type":"text","text":"zqtwice","x":9000015,"y":9100026,"width":24,"height":24,"verso":{"secret":true},"verso":{}}
	],
	"edges":[
		{"id":"e1","fromNode":"aberto","toNode":"mapa"},
		{"id":"e2","fromNode":"zqpinid","toNode":"aberto","label":"zqpinlabel"}
	],
	"verso":{"version":1,"drawing":[
		{"id":"d1","type":"text","x":10,"y":10,"text":"rota publica","groupIds":["gmapa"]},
		{"id":"d2","type":"text","x":9000014,"y":9100025,"text":"zqdrawn","groupIds":["gzq"]},
		{"id":"zqdoor","type":"line","x":30,"y":30,"width":0,"height":40,"groupIds":["gmapa"],"strokeStyle":"dashed","strokeWidth":3,"points":[[0,0],[0,40]]}
	],"walls":{"version":1,"doors":[{"kind":"secret","zqwallkey":true}]}},
	"zqtopkey":{"plan":1}
}
"#;

fn clean(what: &str, text: &str) {
    let all = heard(text);
    for s in SECRET {
        assert!(!all.contains(s), "{what}: {s:?} reached a reader: {text}");
    }
}

async fn ask(ws: &mut Socket, id: u64, cmd: &str, args: Value) -> Value {
    ws.send(Message::Text(
        json!({ "id": id, "cmd": cmd, "args": args })
            .to_string()
            .into(),
    ))
    .await
    .unwrap();
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(30), ws.next())
            .await
            .expect("an answer in time")
            .unwrap()
            .unwrap();
        let text = match m {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
            _ => continue,
        };
        clean(&format!("{cmd} (or an event before its answer)"), &text);
        let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        if v.get("id").and_then(Value::as_u64) == Some(id) {
            return v;
        }
    }
}

async fn listen(ws: &mut Socket, ms: u64) -> Vec<Value> {
    let mut out = Vec::new();
    let until = tokio::time::Instant::now() + std::time::Duration::from_millis(ms);
    while let Ok(Some(Ok(m))) = tokio::time::timeout_at(until, ws.next()).await {
        if let Message::Text(t) = m {
            clean("an event", &t);
            out.push(serde_json::from_str(&t).unwrap_or(Value::Null));
        }
    }
    out
}

/// The board and the note it pins secretly, made by the owner.
async fn with_the_board() -> (crate::tests::Running, Socket, Socket, String) {
    let (r, mut owner, reader, id) = folder_with_a_reader().await;
    let made = call(
        &mut owner,
        40,
        "create_note",
        json!({ "name": "Cripta", "text": "# Cripta\n\nzqcripta\n" }),
    )
    .await;
    assert!(made.get("ok").is_some(), "{made}");
    let made = call(
        &mut owner,
        41,
        "create_file",
        json!({ "path": "Mapa.canvas", "base64": base64::engine::general_purpose::STANDARD.encode(BOARD) }),
    )
    .await;
    assert!(made.get("ok").is_some(), "{made}");
    (r, owner, reader, id)
}

#[test]
fn no_command_of_the_contract_hands_a_reader_a_secret_pin() {
    block_on(async {
        let (_r, mut owner, mut reader, id) = with_the_board().await;
        // The owner sees the board whole: the test's board holds what it says.
        let whole = call(
            &mut owner,
            42,
            "read_text",
            json!({ "path": "Mapa.canvas" }),
        )
        .await;
        assert!(whole["ok"]["text"].as_str().unwrap().contains("zqpinid"));
        let listed = |cmd: &str| {
            verso_service::reader::READER_COMMANDS
                .iter()
                .any(|(c, _)| *c == cmd)
                || crate::readers::SERVER_READS.iter().any(|(c, _)| *c == cmd)
        };
        let mut args = reaching(&id);
        for key in ["path", "source", "from"] {
            args[key] = json!("Mapa.canvas");
        }
        args["json"] = json!("{\"nodes\":[],\"edges\":[]}");
        args["words"] = json!("zqpintext");
        let mut n = 100;
        for cmd in every_command() {
            n += 1;
            let answer = ask(&mut reader, n, &cmd, args.clone()).await;
            if answer.get("ok").is_some() {
                assert!(
                    listed(&cmd),
                    "a reader may call {cmd}: say how it answers a reader (READER_COMMANDS or SERVER_READS, ADR 0087)"
                );
            }
        }
        // The board as a reader reads it: the projection, however it asks.
        let shown = verso_core::canvas_secret::project(BOARD).into_owned();
        for cmd in ["read_text", "read_file_text"] {
            n += 1;
            let got = ask(&mut reader, n, cmd, json!({ "path": "Mapa.canvas" })).await;
            let text = got["ok"]["text"].as_str().or(got["ok"].as_str());
            assert_eq!(text, Some(shown.as_str()), "{cmd}: {got}");
        }
        n += 1;
        let preview = ask(
            &mut reader,
            n,
            "board_preview",
            json!({ "path": "Mapa.canvas", "json": "{\"nodes\":[],\"edges\":[]}" }),
        )
        .await;
        assert!(preview.get("ok").is_some(), "{preview}");
        // The index: the words of a secret pin are not found, a public
        // node's are; the link of a secret pin is no backlink.
        for word in [
            "zqpintext",
            "zqpinurl",
            "zqpinlabel",
            "zqdrawn",
            "zqcallout",
        ] {
            n += 1;
            let found = ask(
                &mut reader,
                n,
                "search",
                json!({ "words": word, "limit": 50 }),
            )
            .await;
            assert_eq!(found["ok"], json!([]), "{word}: {found}");
        }
        n += 1;
        let found = ask(
            &mut reader,
            n,
            "search",
            json!({ "words": "praca", "limit": 50 }),
        )
        .await;
        assert!(
            found["ok"]
                .as_array()
                .is_some_and(|a| a.iter().any(|h| h["path"] == "Mapa.canvas")),
            "{found}"
        );
        n += 1;
        let found = ask(
            &mut reader,
            n,
            "search",
            json!({ "words": "cartao", "limit": 50 }),
        )
        .await;
        assert!(
            found["ok"]
                .as_array()
                .is_some_and(|a| a.iter().any(|h| h["path"] == "Mapa.canvas")),
            "{found}"
        );
        n += 1;
        let cripta = ask(&mut reader, n, "backlinks", json!({ "path": "Cripta.md" })).await;
        assert_eq!(cripta["ok"], json!([]), "{cripta}");
        let mine = call(&mut owner, 43, "backlinks", json!({ "path": "Cripta.md" })).await;
        assert_eq!(mine["ok"].as_array().map(Vec::len), Some(2), "{mine}");
        n += 1;
        let taverna = ask(&mut reader, n, "backlinks", json!({ "path": "Taverna.md" })).await;
        assert!(
            taverna["ok"]
                .as_array()
                .is_some_and(|a| a.iter().any(|b| b["from"] == "Mapa.canvas")),
            "{taverna}"
        );
        // Its size in a listing is the projection's.
        n += 1;
        let entries = ask(&mut reader, n, "list_entries", json!({})).await;
        let len = entries["ok"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["path"] == "Mapa.canvas")
            .map(|e| e["size"].as_f64().unwrap() as u64);
        assert_eq!(len, Some(shown.len() as u64), "{entries}");
        // What the reader's device syncs: the projection's bytes and hash.
        n += 1;
        let state = ask(&mut reader, n, "sync_state", json!({})).await;
        let listed_hash = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["path"] == "Mapa.canvas")
            .map(|f| (f["hash"].clone(), f["size"].clone()))
            .unwrap();
        assert_eq!(listed_hash.0, crate::sync::sha256(shown.as_bytes()));
        assert_eq!(listed_hash.1, shown.len());
        n += 1;
        let piece = ask(
            &mut reader,
            n,
            "sync_read",
            json!({ "path": "Mapa.canvas", "offset": 0 }),
        )
        .await;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(piece["ok"]["data"].as_str().unwrap())
            .unwrap();
        assert_eq!(bytes, shown.as_bytes());
        listen(&mut reader, 300).await;
    });
}

#[test]
fn a_reader_does_not_join_a_boards_room_and_the_file_route_refuses_the_board() {
    block_on(async {
        let (r, mut owner, mut reader, id) = with_the_board().await;
        let joined = ask(
            &mut reader,
            2,
            "collab_join",
            json!({ "path": "Mapa.canvas" }),
        )
        .await;
        assert!(joined.get("ok").is_none(), "{joined}");
        // The owner's room holds the whole board, and works.
        let mine = call(
            &mut owner,
            50,
            "collab_join",
            json!({ "path": "Mapa.canvas" }),
        )
        .await;
        assert_eq!(mine["ok"]["kind"], "board", "{mine}");
        let le = crate::tests::sign_in(&r, "le@casa.lan", "senha muito longa").await;
        let res = reqwest::Client::new()
            .get(r.url(&format!("/f/{id}/Mapa.canvas")))
            .header("cookie", &le.cookie)
            .send()
            .await
            .unwrap();
        assert!(!res.status().is_success(), "{}", res.status());
        let body = res.text().await.unwrap();
        for word in SECRET {
            assert!(
                !body.contains(word),
                "{word:?} reached a reader through /f/: {body}"
            );
        }
    });
}

#[test]
fn a_change_only_inside_a_secret_pin_is_none_for_a_reader() {
    block_on(async {
        let (_r, mut owner, mut reader, _id) = with_the_board().await;
        let before = ask(&mut reader, 2, "sync_changes", json!({ "since": 0 })).await;
        let head = before["ok"]["head"].as_i64().unwrap();
        let text = ask(
            &mut reader,
            3,
            "read_text",
            json!({ "path": "Mapa.canvas" }),
        )
        .await;
        let w = call(
            &mut owner,
            60,
            "read_text",
            json!({ "path": "Mapa.canvas" }),
        )
        .await;
        let moved = BOARD
            .replace("9000011", "9000099")
            .replace("zqcallout", "zqcalloux");
        let written = call(
            &mut owner,
            61,
            "write_text",
            json!({ "path": "Mapa.canvas", "text": moved, "revision": w["ok"]["revision"] }),
        )
        .await;
        assert!(written.get("ok").is_some(), "{written}");
        let events = listen(&mut reader, 600).await;
        assert!(
            !events
                .iter()
                .any(|e| e["event"] == "sync-changed" || e["event"] == "folder-changed"),
            "{events:?}"
        );
        let after = ask(&mut reader, 4, "sync_changes", json!({ "since": head })).await;
        assert_eq!(after["ok"]["head"], head, "{after}");
        assert_eq!(after["ok"]["changes"], json!([]));
        let again = ask(
            &mut reader,
            5,
            "read_text",
            json!({ "path": "Mapa.canvas" }),
        )
        .await;
        assert_eq!(again["ok"]["revision"], text["ok"]["revision"]);
        // A change a reader sees is one.
        let w = call(
            &mut owner,
            62,
            "read_text",
            json!({ "path": "Mapa.canvas" }),
        )
        .await;
        let public = moved.replace("praca aberta ao povo", "praca fechada");
        call(
            &mut owner,
            63,
            "write_text",
            json!({ "path": "Mapa.canvas", "text": public, "revision": w["ok"]["revision"] }),
        )
        .await;
        let later = ask(&mut reader, 6, "sync_changes", json!({ "since": head })).await;
        assert_eq!(
            later["ok"]["changes"].as_array().map(Vec::len),
            Some(1),
            "{later}"
        );
    });
}
