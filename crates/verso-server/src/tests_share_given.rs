// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder given to a person is told at once to the windows and devices
//! they have open (ADR 0084 item 7, the Sharing row: "a share was given to
//! me"), so their window can say it; never to another account, and not
//! again when only the role changes.

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use crate::tests::{
    Browser, Running, Socket, block_on, call, connect, event_named, folder_id, next, put, sign_in,
    start,
};

/// The next `share-given` `ws` hears, within 30 s in all: a window that
/// never hears one fails here rather than waiting on the server's pings
/// (each of which `event_named`'s own wait starts over).
async fn given_to(ws: &mut Socket) -> Value {
    tokio::time::timeout(
        std::time::Duration::from_secs(30),
        event_named(ws, "share-given"),
    )
    .await
    .expect("a share given, in time")
}

async fn person(r: &Running, email: &str, name: &str) -> Browser {
    r.server
        .db
        .create_account(email, name, "pt", Some("uma senha comprida"), false)
        .unwrap();
    sign_in(r, email, "uma senha comprida").await
}

/// A window signed in as `b`, its hello read.
async fn window(r: &Running, b: &Browser) -> Socket {
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    ws
}

/// The events `ws` heard before the answer to a question asked now: what
/// the server pushed before it answered is all there.
async fn heard_before_answer(ws: &mut Socket, id: u64) -> Vec<Value> {
    ws.send(Message::Text(
        json!({ "id": id, "cmd": "capabilities", "args": {} })
            .to_string()
            .into(),
    ))
    .await
    .unwrap();
    let mut events = Vec::new();
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(30), ws.next())
            .await
            .expect("an answer in time")
            .unwrap()
            .unwrap();
        let Message::Text(t) = m else { continue };
        let v: Value = serde_json::from_str(&t).unwrap();
        if v.get("event").is_some() {
            events.push(v);
        } else if v["id"] == id {
            return events;
        }
    }
}

fn given(events: &[Value]) -> Vec<&Value> {
    events
        .iter()
        .filter(|e| e["event"] == "share-given")
        .collect()
}

#[test]
fn a_share_given_is_told_to_the_grantee_and_to_no_one_else() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let mut owner = window(&r, &admin).await;
        call(&mut owner, 1, "open_server_folder", json!({ "id": id })).await;
        for (n, name) in [(2, "Mesa/Notas"), (3, "Outra/Nota")] {
            let made = call(
                &mut owner,
                n,
                "create_note",
                json!({ "name": name, "text": "# Nota\n" }),
            )
            .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let ana = person(&r, "ana@casa.lan", "Ana").await;
        let bia = person(&r, "bia@casa.lan", "Bia").await;
        let mut ana_ws = window(&r, &ana).await;
        let mut bia_ws = window(&r, &bia).await;

        // A share given: Ana's window hears who gave it, what and how.
        let (status, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "reader" }),
            &admin,
        )
        .await;
        assert_eq!(status, 200, "{shared}");
        let told = given_to(&mut ana_ws).await;
        assert_eq!(
            told,
            json!({
                "id": shared["id"], "name": "Mesa", "role": "reader", "by": "Admin",
                "share": true, "server": null,
            })
        );
        // Bia, another account, hears nothing of it; nor the owner.
        assert!(given(&heard_before_answer(&mut bia_ws, 10).await).is_empty());
        assert!(given(&heard_before_answer(&mut owner, 10).await).is_empty());

        // Given again in another role: a change, not a share given.
        let (status, _) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        assert_eq!(status, 200);
        assert!(given(&heard_before_answer(&mut ana_ws, 11).await).is_empty());

        // A window of Ana's on the share hears the next one too: the
        // share's own window lets the event through (scope.rs).
        let mut on_share = window(&r, &ana).await;
        let opened = call(
            &mut on_share,
            1,
            "open_server_folder",
            json!({ "id": shared["id"] }),
        )
        .await;
        assert!(opened.get("ok").is_some(), "{opened}");
        let (status, other) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Outra", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        assert_eq!(status, 200, "{other}");
        let told = given_to(&mut on_share).await;
        assert_eq!(told["id"], other["id"]);
        assert_eq!(told["name"], "Outra");
        // Every window of hers hears it, the first one too.
        let told = given_to(&mut ana_ws).await;
        assert_eq!(told["id"], other["id"]);

        // The whole folder given to Bia: said too, as a whole folder.
        let (status, _) = put(
            &r,
            &format!("/api/folders/{id}/members/bia@casa.lan"),
            json!({ "role": "editor" }),
            &admin,
        )
        .await;
        assert_eq!(status, 200);
        let told = given_to(&mut bia_ws).await;
        assert_eq!(
            told,
            json!({
                "id": id, "name": "Campanha", "role": "editor", "by": "Admin",
                "share": false, "server": null,
            })
        );
        assert!(given(&heard_before_answer(&mut ana_ws, 12).await).is_empty());
    });
}
