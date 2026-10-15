// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The editor's "insert image" (feat/insert-image): the window copies the
//! chosen picture into the folder with `create_file`, as base64, and
//! writes its embed. What the server owes that path: a picture at the
//! window's bound (32 MiB, 42.7 MiB as base64, under the 48 MiB message of
//! `rpc::MAX_MESSAGE`) is taken with its bytes as they came; a name that is
//! taken is refused as `exists` and the file there is not touched (the
//! window then tries `name (2).png`); a path out of the folder is refused;
//! and a reader's upload is refused before the file is made.

use base64::Engine;
use serde_json::json;

use crate::db::Role;
use crate::tests::{block_on, call, connect, folder_id, next, sign_in, start};

/// Bytes that are not all the same, so that a byte out of place shows.
fn picture(len: usize) -> Vec<u8> {
    (0..len)
        .map(|i| (i.wrapping_mul(2_654_435_761) >> 11) as u8)
        .collect()
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

#[test]
fn a_picture_at_the_bound_is_copied_as_it_came_and_a_taken_name_is_not_overwritten() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let mut ws = connect(&r, Some(&admin.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let big = picture(32 * 1024 * 1024);
        let made = call(
            &mut ws,
            2,
            "create_file",
            json!({ "path": "assets/capa.png", "base64": b64(&big) }),
        )
        .await;
        assert_eq!(made["ok"], "assets/capa.png", "{}", short(&made));
        assert_eq!(
            fetch(&r, &admin, &id, "assets/capa.png").await,
            (200, big.clone())
        );
        // The same name again: refused, the first untouched.
        let again = call(
            &mut ws,
            3,
            "create_file",
            json!({ "path": "assets/capa.png", "base64": b64(b"outra") }),
        )
        .await;
        assert_eq!(again["err"]["kind"], "exists", "{again}");
        assert_eq!(fetch(&r, &admin, &id, "assets/capa.png").await, (200, big));
        // The next free name, as the window asks it.
        let second = call(
            &mut ws,
            4,
            "create_file",
            json!({ "path": "assets/capa (2).png", "base64": b64(b"outra") }),
        )
        .await;
        assert_eq!(second["ok"], "assets/capa (2).png", "{second}");
        // Out of the folder: refused, nothing made.
        for bad in ["../fora.png", "assets/../../fora.png", "/etc/fora.png"] {
            let out = call(
                &mut ws,
                5,
                "create_file",
                json!({ "path": bad, "base64": b64(b"x") }),
            )
            .await;
            assert!(out.get("err").is_some(), "{bad}: {out}");
        }
        assert_eq!(fetch(&r, &admin, &id, "fora.png").await.0, 404);
    });
}

#[test]
fn a_reader_cannot_copy_a_picture_into_the_folder() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let ana = r
            .server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        r.server.db.grant(&id, &ana.id, Role::Reader).unwrap();
        let b = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        // Small, and one past the small bound: both are refused as a
        // reader's, the large one before it is parsed (inflight.rs).
        for (n, bytes) in [(2, picture(1000)), (3, picture(2 * 1024 * 1024))] {
            let made = call(
                &mut ws,
                n,
                "create_file",
                json!({ "path": "assets/capa.png", "base64": b64(&bytes) }),
            )
            .await;
            assert!(made.get("err").is_some(), "{}", short(&made));
        }
        assert_eq!(fetch(&r, &admin, &id, "assets/capa.png").await.0, 404);
    });
}

/// The file at `path` of the folder as the server serves it: status, bytes.
async fn fetch(
    r: &crate::tests::Running,
    b: &crate::tests::Browser,
    id: &str,
    path: &str,
) -> (u16, Vec<u8>) {
    let res = reqwest::Client::new()
        .get(r.url(&format!("/f/{id}/{path}")))
        .header("cookie", &b.cookie)
        .send()
        .await
        .unwrap();
    let status = res.status().as_u16();
    (status, res.bytes().await.unwrap().to_vec())
}

fn short(v: &serde_json::Value) -> String {
    v.to_string().chars().take(200).collect()
}
