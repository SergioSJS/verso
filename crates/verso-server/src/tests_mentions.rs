// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A note's unlinked mentions on a server (ADR 0089): a reader reads the
//! list and cannot write a link; a mention inside a secret block (ADR
//! 0087) is never in a reader's answer, and is in a writer's.

use serde_json::json;

use crate::db::Role;
use crate::tests::{Socket, block_on, call, connect, folder_id, next, sign_in, start};

async fn opened(r: &crate::tests::Running, b: &crate::tests::Browser, id: &str) -> Socket {
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let o = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(o.get("ok").is_some(), "{o}");
    ws
}

fn texts(answer: &serde_json::Value) -> Vec<(String, bool)> {
    answer["ok"]["mentions"]
        .as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .map(|m| {
            (
                m["text"].as_str().unwrap_or_default().to_owned(),
                m["secret"].as_bool().unwrap_or_default(),
            )
        })
        .collect()
}

#[test]
fn a_reader_reads_the_mentions_without_the_secret_ones_and_writes_none() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let le = r
            .server
            .db
            .create_account("le@casa.lan", "Le", "en", Some("senha muito longa"), false)
            .unwrap();
        r.server.db.grant(&id, &le.id, Role::Reader).unwrap();
        let mut owner = opened(&r, &admin, &id).await;
        let made = call(
            &mut owner,
            2,
            "create_note",
            json!({ "name": "Taverna", "text": "A sessao foi boa.\n\n> [!secret] Mestra\n> A sessao esconde.\n" }),
        )
        .await;
        assert!(made.get("ok").is_some(), "{made}");
        let all = call(
            &mut owner,
            3,
            "unlinked_mentions",
            json!({ "path": "Sessao.md" }),
        )
        .await;
        assert_eq!(
            texts(&all),
            [("sessao".to_owned(), false), ("sessao".to_owned(), true)],
            "{all}"
        );
        let le = sign_in(&r, "le@casa.lan", "senha muito longa").await;
        let mut reader = opened(&r, &le, &id).await;
        let some = call(
            &mut reader,
            2,
            "unlinked_mentions",
            json!({ "path": "Sessao.md" }),
        )
        .await;
        assert_eq!(texts(&some), [("sessao".to_owned(), false)], "{some}");
        // The link is a write: refused, with the reason.
        let read = call(&mut reader, 3, "read_note", json!({ "path": "Taverna.md" })).await;
        let no = call(
            &mut reader,
            4,
            "write_note",
            json!({ "path": "Taverna.md", "text": "A [[Sessao|sessao]] foi boa.\n", "revision": read["ok"]["revision"] }),
        )
        .await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
    });
}
