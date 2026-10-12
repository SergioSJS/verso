// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Gaps of the threat model closed (threat-model.md, gap 11): a
//! presence wears its sender's name, whatever it says.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};

use crate::db::Role;
use crate::tests::{block_on, call, connect, event_named, folder_id, next, sign_in, start};

/// A Yjs awareness update of one client: count, id, clock, the state as
/// a string — each number a variable-length integer.
fn presence(id: u8, state: &str) -> String {
    let mut bytes = vec![1, id, 1];
    let mut len = state.len();
    while len >= 0x80 {
        bytes.push(u8::try_from(len & 0x7f).unwrap() | 0x80);
        len >>= 7;
    }
    bytes.push(u8::try_from(len).unwrap());
    bytes.extend_from_slice(state.as_bytes());
    STANDARD.encode(bytes)
}

/// The states of a relayed update, read back as JSON.
fn states(update: &str) -> Vec<Value> {
    let bytes = STANDARD.decode(update).unwrap();
    let text = String::from_utf8_lossy(&bytes);
    // One client: the state is the bytes from its first brace.
    let start = text.find('{').unwrap();
    vec![serde_json::from_str(&text[start..]).unwrap()]
}

/// A member who sends a presence under another member's name is relayed
/// under their own (gap 11): the server stamps the name from the session.
#[test]
fn a_presence_is_relayed_under_its_senders_own_name() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let ana = r
            .server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        r.server.db.grant(&id, &ana.id, Role::Editor).unwrap();
        let ana_b = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let mut seen = connect(&r, Some(&admin.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        let mut forger = connect(&r, Some(&ana_b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        for ws in [&mut seen, &mut forger] {
            next(ws).await;
            call(ws, 1, "open_server_folder", json!({ "id": id })).await;
            call(ws, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        }
        let forged = presence(
            9,
            r##"{"user":{"name":"Admin","color":"#1565c0"},"cursor":{"anchor":1,"head":1}}"##,
        );
        let sent = call(
            &mut forger,
            3,
            "collab_awareness",
            json!({ "path": "Sessao.md", "update": forged }),
        )
        .await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let heard = event_named(&mut seen, "collab-awareness").await;
        let got = states(heard["update"].as_str().unwrap());
        assert_eq!(got[0]["user"]["name"], "Ana", "{got:?}");
        assert_eq!(got[0]["user"]["color"], "#1565c0");
        assert_eq!(got[0]["cursor"]["anchor"], 1);
        // Bytes that are not a presence are refused, not relayed.
        let junk = call(
            &mut forger,
            4,
            "collab_awareness",
            json!({ "path": "Sessao.md", "update": "AQ==" }),
        )
        .await;
        assert_eq!(junk["err"]["kind"], "refused", "{junk}");
    });
}
