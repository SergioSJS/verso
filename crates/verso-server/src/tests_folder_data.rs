// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's data files, `.verso/layouts/` and `.verso/bundles/` (ADR
//! 0099 item 2, ADR 0098 item 2), against a running server: a reader lists
//! and reads and writes nothing, an editor writes over the revision it
//! read, the ids and texts the core refuses are refused, and every write
//! ends in the folder's log for sync, like the settings do (ADR 0079).

use serde_json::{Value, json};

use crate::tests::{
    Browser, Running, Socket, block_on, call, connect, folder_id, next, post, sign_in, start,
};

/// A person invited to the folder with `role`.
async fn member(r: &Running, admin: &Browser, id: &str, email: &str, role: &str) -> Browser {
    let (status, inv) = post(
        r,
        "/api/admin/invitations",
        json!({ "email": email, "folder": id, "role": role }),
        Some(admin),
    )
    .await;
    assert_eq!(status, 200, "{inv}");
    let token = inv["link"].as_str().unwrap().rsplit('/').next().unwrap();
    let (status, accepted) = post(
        r,
        &format!("/api/invite/{token}"),
        json!({ "email": email, "name": "Membro", "password": "outra senha longa", "lang": "en" }),
        None,
    )
    .await;
    assert_eq!(status, 200, "{accepted}");
    sign_in(r, email, "outra senha longa").await
}

async fn window(r: &Running, b: &Browser, id: &str) -> Socket {
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let o = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(o.get("ok").is_some(), "{o}");
    ws
}

fn args(kind: &str, id: &str, text: &str, revision: Value) -> Value {
    json!({ "kind": kind, "id": id, "text": text, "revision": revision })
}

#[test]
fn a_reader_lists_and_reads_and_writes_nothing() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let reader = member(&r, &admin, &id, "leitor@casa.lan", "reader").await;
        // The owner makes a file; the reader sees it.
        let mut owner = window(&r, &admin, &id).await;
        let made = call(
            &mut owner,
            2,
            "write_folder_data",
            args("layouts", "mesa", "{\"a\": 1}", Value::Null),
        )
        .await;
        let rev = made["ok"]["revision"].as_str().unwrap().to_owned();
        let mut ws = window(&r, &reader, &id).await;
        let listed = call(&mut ws, 2, "list_folder_data", json!({ "kind": "layouts" })).await;
        assert_eq!(
            listed["ok"],
            json!({ "entries": [{ "id": "mesa", "revision": rev }], "strays": [] }),
            "{listed}"
        );
        let read = call(
            &mut ws,
            3,
            "read_folder_data",
            json!({ "kind": "layouts", "id": "mesa" }),
        )
        .await;
        assert_eq!(read["ok"]["text"], "{\"a\": 1}", "{read}");
        // Nothing to write or to remove.
        for (n, cmd, a) in [
            (
                4,
                "write_folder_data",
                args("layouts", "nova", "{}", Value::Null),
            ),
            (
                5,
                "write_folder_data",
                args("layouts", "mesa", "{}", json!(rev)),
            ),
            (
                6,
                "remove_folder_data",
                json!({ "kind": "layouts", "id": "mesa", "revision": rev }),
            ),
        ] {
            let refused = call(&mut ws, n, cmd, a).await;
            assert_eq!(refused["err"]["kind"], "refused", "{cmd}: {refused}");
            assert!(
                refused["err"]["message"]
                    .as_str()
                    .unwrap()
                    .contains("only read"),
                "{refused}"
            );
        }
        // And the file is as it was.
        let again = call(
            &mut owner,
            3,
            "read_folder_data",
            json!({ "kind": "layouts", "id": "mesa" }),
        )
        .await;
        assert_eq!(again["ok"]["text"], "{\"a\": 1}");
    });
}

#[test]
fn an_editor_writes_over_the_revision_read_and_sync_follows() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let editor = member(&r, &admin, &id, "editor@casa.lan", "editor").await;
        let mut ws = window(&r, &editor, &id).await;
        let state = call(&mut ws, 2, "sync_state", json!({})).await;
        let head = state["ok"]["head"].as_i64().unwrap();
        // Nothing yet.
        let none = call(&mut ws, 3, "list_folder_data", json!({ "kind": "bundles" })).await;
        assert_eq!(none["ok"], json!({ "entries": [], "strays": [] }), "{none}");
        // Created, and in the log for the devices.
        let made = call(
            &mut ws,
            4,
            "write_folder_data",
            args("bundles", "mundo", "{\"notes\": []}", Value::Null),
        )
        .await;
        let rev = made["ok"]["revision"].as_str().unwrap().to_owned();
        let after = call(&mut ws, 5, "sync_changes", json!({ "since": head })).await;
        assert!(
            after["ok"]["changes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|c| c["path"] == ".verso/bundles/mundo.json"),
            "{after}"
        );
        let head = after["ok"]["head"].as_i64().unwrap();
        // A second create never replaces; a stale revision changes nothing.
        let again = call(
            &mut ws,
            6,
            "write_folder_data",
            args("bundles", "mundo", "{}", Value::Null),
        )
        .await;
        assert_eq!(again["err"]["kind"], "exists", "{again}");
        let stale = call(
            &mut ws,
            7,
            "write_folder_data",
            args("bundles", "mundo", "{}", json!("1:1:0000000000000001")),
        )
        .await;
        assert_eq!(stale["err"]["kind"], "changed", "{stale}");
        // Replaced over the revision read.
        let next_rev = call(
            &mut ws,
            8,
            "write_folder_data",
            args("bundles", "mundo", "{\"notes\": [1]}", json!(rev)),
        )
        .await;
        let rev = next_rev["ok"]["revision"].as_str().unwrap().to_owned();
        let read = call(
            &mut ws,
            9,
            "read_folder_data",
            json!({ "kind": "bundles", "id": "mundo" }),
        )
        .await;
        assert_eq!(read["ok"]["text"], "{\"notes\": [1]}", "{read}");
        assert_eq!(read["ok"]["revision"], rev);
        // The core's refusals reach the window as `refused`, before any write.
        let big = format!("{{\"a\": \"{}\"}}", "x".repeat(256 * 1024));
        for (n, id, text) in [
            (10, "../fora", "{}"),
            (11, "Mesa", "{}"),
            (12, "con", "{}"),
            (13, "mesa", "[]"),
            (14, "mesa", "not json"),
            (15, "mesa", big.as_str()),
        ] {
            let bad = call(
                &mut ws,
                n,
                "write_folder_data",
                args("layouts", id, text, Value::Null),
            )
            .await;
            assert_eq!(bad["err"]["kind"], "refused", "{id}: {bad}");
        }
        // The generic commands do not reach the data directories.
        for (n, cmd, a) in [
            (
                40,
                "create_file",
                json!({ "path": ".verso/layouts/solto.json", "base64": "e30=" }),
            ),
            (
                41,
                "write_text",
                json!({ "path": ".verso/bundles/mundo.json", "text": "{}", "revision": rev }),
            ),
            (42, "create_folder", json!({ "path": ".verso/layouts/sub" })),
        ] {
            let bad = call(&mut ws, n, cmd, a).await;
            assert_eq!(bad["err"]["kind"], "refused", "{cmd}: {bad}");
        }
        // Removed over the revision read: through the bin, and in the log.
        let head = call(&mut ws, 16, "sync_changes", json!({ "since": head })).await["ok"]["head"]
            .as_i64()
            .unwrap();
        let removed = call(
            &mut ws,
            17,
            "remove_folder_data",
            json!({ "kind": "bundles", "id": "mundo", "revision": rev }),
        )
        .await;
        assert!(removed.get("err").is_none(), "{removed}");
        assert!(
            removed["ok"]["path"]
                .as_str()
                .unwrap()
                .starts_with(".trash/"),
            "{removed}"
        );
        // The bin knows who removed it, like any other deletion (ADR 0080
        // item 2).
        let bin = call(&mut ws, 30, "trash_list", json!({})).await;
        let entry = bin["ok"]["entries"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["original"] == ".verso/bundles/mundo.json")
            .unwrap_or_else(|| panic!("not in the bin: {bin}"));
        assert_eq!(entry["by"], "Membro", "{bin}");
        assert_eq!(entry["known"], true, "{bin}");
        let after = call(&mut ws, 18, "sync_changes", json!({ "since": head })).await;
        assert!(
            after["ok"]["changes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|c| c["path"] == ".verso/bundles/mundo.json" && c["deleted"] == true),
            "{after}"
        );
        let empty = call(
            &mut ws,
            19,
            "list_folder_data",
            json!({ "kind": "bundles" }),
        )
        .await;
        assert_eq!(
            empty["ok"],
            json!({ "entries": [], "strays": [] }),
            "{empty}"
        );
    });
}
