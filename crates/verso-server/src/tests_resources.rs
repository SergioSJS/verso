// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What one request may hold of a 1-core, 1 GB host (the review of
//! 2026-10-13): the memory a file served or a command's answer takes, the
//! bytes of the requests under way, a note room's size, the requests one
//! address keeps in flight, a folder's quota under concurrent uploads, and
//! the entries one address may keep waiting in the server's maps.

use serde_json::json;

use crate::tests::{block_on, call, connect, next, sign_in, start};

/// `bytes` written to `name` in the test folder, as the tests write files.
fn put_file(r: &crate::tests::Running, name: &str, bytes: &[u8]) {
    use std::io::Write;
    let mut f = tempfile::NamedTempFile::new_in(r.campanha()).unwrap();
    f.write_all(bytes).unwrap();
    f.persist(r.campanha().join(name)).unwrap();
}

/// Bytes that are not all the same, so that a piece out of place shows.
fn content(len: usize) -> Vec<u8> {
    (0..len)
        .map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8)
        .collect()
}

/// A large file under `/f/` is sent a piece at a time from the disk: the
/// server never holds more than a few pieces of it, whatever its size.
#[test]
fn a_large_file_is_served_a_piece_at_a_time() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = crate::tests::folder_id(&r, &b).await;
        let bytes = content(20 * 1024 * 1024);
        put_file(&r, "grande.bin", &bytes);
        // The folder open, as the window that shows the file has it.
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let res = reqwest::Client::new()
            .get(r.url(&format!("/f/{id}/grande.bin")))
            .header("cookie", &b.cookie)
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        let body = res.bytes().await.unwrap();
        assert!(
            body.as_ref() == bytes.as_slice(),
            "the file arrived otherwise"
        );
        let peak = crate::files::held_peak();
        assert!(
            peak <= 4 * crate::files::PIECE,
            "{peak} bytes of a 20 MB file were held at once"
        );
        // A range, as a video's player asks it.
        let res = reqwest::Client::new()
            .get(r.url(&format!("/f/{id}/grande.bin")))
            .header("cookie", &b.cookie)
            .header("range", "bytes=1000000-1000009")
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 206);
        assert_eq!(
            res.headers()
                .get("content-range")
                .and_then(|v| v.to_str().ok()),
            Some("bytes 1000000-1000009/20971520")
        );
        assert_eq!(
            res.bytes().await.unwrap().as_ref(),
            &bytes[1_000_000..1_000_010]
        );
    });
}

/// A command that is no upload is 1 MB at most, judged before its
/// arguments are parsed: 2 MB of `list_notes` is refused in words that
/// say the size; an upload of the same size is taken.
#[test]
fn a_large_message_that_is_no_upload_is_refused_before_it_is_parsed() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = crate::tests::folder_id(&r, &b).await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let padding = "x".repeat(2 * 1024 * 1024);
        let listed = call(&mut ws, 2, "list_notes", json!({ "padding": padding })).await;
        assert!(
            listed["err"]["message"]
                .as_str()
                .is_some_and(|m| m.contains("1 MB")),
            "2 MB of list_notes was taken: {}",
            listed.to_string().chars().take(200).collect::<String>()
        );
        let base64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            content(1536 * 1024),
        );
        let made = call(
            &mut ws,
            3,
            "create_file",
            json!({ "path": "anexo.bin", "base64": base64 }),
        )
        .await;
        assert!(made.get("ok").is_some(), "{made}");
    });
}
