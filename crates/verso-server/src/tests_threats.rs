// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Gaps of the threat model closed (threat-model.md, gaps 11 and 12): a
//! presence wears its sender's name, whatever it says; the page that
//! approves a device says who asked, and can refuse.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};

use crate::db::Role;
use crate::tests::{
    block_on, call, connect, event_named, folder_id, get, next, post, sign_in, start,
};

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

/// The page that approves a device says where and when it was asked
/// from (gap 12): the pending code keeps the address and the time, the
/// page's data gives them, and the person can refuse — the app then
/// hears the code gone.
#[test]
fn a_device_code_says_who_asked_and_can_be_refused() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let before = crate::log::stamp();
        let (_, started) = post(
            &r,
            "/api/device/start",
            json!({ "device": "Verso · MacBook" }),
            None,
        )
        .await;
        let code = started["code"].as_str().unwrap().to_owned();
        let poll = started["poll"].as_str().unwrap().to_owned();
        {
            let devices = verso_service::lock(&r.server.devices);
            let pending = devices.get(&code).unwrap();
            assert_eq!(pending.address, "127.0.0.1");
            assert!(pending.asked >= before, "{}", pending.asked);
            assert_eq!(pending.asked.len(), "2026-10-12T21:30:00Z".len());
        }
        let (_, what) = get(&r, &format!("/api/device/{code}"), Some(&admin)).await;
        assert_eq!(what["device"], "Verso · MacBook");
        assert_eq!(what["address"], "127.0.0.1");
        assert!(what["asked"].as_str().unwrap() >= before.as_str(), "{what}");
        // Not from a page of this server: refused.
        let status = reqwest::Client::new()
            .delete(r.url(&format!("/api/device/{code}")))
            .header("cookie", &admin.cookie)
            .send()
            .await
            .unwrap()
            .status()
            .as_u16();
        assert_eq!(status, 403);
        let status = reqwest::Client::new()
            .delete(r.url(&format!("/api/device/{code}")))
            .header("origin", r.origin())
            .header("cookie", &admin.cookie)
            .header("x-verso-csrf", &admin.csrf)
            .send()
            .await
            .unwrap()
            .status()
            .as_u16();
        assert_eq!(status, 200);
        let (gone, _) = post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
        assert_eq!(gone, 410);
        let (status, _) = get(&r, &format!("/api/device/{code}"), Some(&admin)).await;
        assert_eq!(status, 404);
    });
}
