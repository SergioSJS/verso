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

/// A window's collab room joined on `path`: the socket, and a function
/// that types `words` at the end of the note and gives the update.
async fn joined(
    r: &crate::tests::Running,
    paths: &[&str],
) -> (crate::tests::Socket, yrs::Doc, serde_json::Value) {
    use base64::Engine;
    use yrs::Transact;
    use yrs::updates::decoder::Decode;
    let b = sign_in(r, "admin@casa.lan", "senha muito longa").await;
    let id = crate::tests::folder_id(r, &b).await;
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    let mut last = serde_json::Value::Null;
    for (i, path) in paths.iter().enumerate() {
        last = call(
            &mut ws,
            10 + i as u64,
            "collab_join",
            json!({ "path": path }),
        )
        .await;
    }
    let doc = yrs::Doc::with_options(yrs::Options {
        offset_kind: yrs::OffsetKind::Utf16,
        ..Default::default()
    });
    if let Some(state) = last["ok"]["update"].as_str() {
        let state = base64::engine::general_purpose::STANDARD
            .decode(state)
            .unwrap();
        doc.transact_mut()
            .apply_update(yrs::Update::decode_v1(&state).unwrap())
            .unwrap();
    }
    (ws, doc, last)
}

/// `words` typed at the end of `doc`'s text, as the update a window sends.
fn typed(doc: &yrs::Doc, words: &str) -> String {
    use base64::Engine;
    use yrs::{GetString, ReadTxn, Text, Transact};
    let text = doc.get_or_insert_text(crate::collab::TEXT);
    let mut txn = doc.transact_mut();
    let len = text.get_string(&txn).encode_utf16().count() as u32;
    let before = txn.state_vector();
    text.insert(&mut txn, len, words);
    drop(txn);
    let txn = doc.transact();
    base64::engine::general_purpose::STANDARD.encode(txn.encode_state_as_update_v1(&before))
}

/// A note room has a size, as a board room has (`ROOM_MOST`): an update
/// that would take it past is refused, and the room keeps what it had.
#[test]
fn a_note_room_past_its_size_refuses_the_update() {
    block_on(async {
        let r = start().await;
        let (mut ws, doc, _) = joined(&r, &["Sessao.md"]).await;
        let small = typed(&doc, " um");
        let taken = call(
            &mut ws,
            2,
            "collab_update",
            json!({ "path": "Sessao.md", "update": small }),
        )
        .await;
        assert!(taken.get("ok").is_some(), "{taken}");
        crate::collab::fill(&r.server, "Sessao.md", crate::collab_board::ROOM_MOST);
        let past = typed(&doc, " dois");
        let refused = call(
            &mut ws,
            3,
            "collab_update",
            json!({ "path": "Sessao.md", "update": past }),
        )
        .await;
        assert!(
            refused["err"]["message"]
                .as_str()
                .is_some_and(|m| m.contains("64 MB")),
            "a note room past its size took the update: {refused}"
        );
    });
}

/// One window is in a bounded number of rooms at once: past it, the next
/// join is refused; leaving one makes room.
#[test]
fn a_window_joins_a_bounded_number_of_rooms() {
    block_on(async {
        let r = start().await;
        let most = crate::collab::JOINED_MOST;
        let names: Vec<String> = (0..=most).map(|i| format!("Nota {i}.md")).collect();
        for name in &names {
            put_file(&r, name, b"# nota\n");
        }
        let first: Vec<&str> = names[..most].iter().map(String::as_str).collect();
        let (mut ws, _, last) = joined(&r, &first).await;
        assert!(last.get("ok").is_some(), "{last}");
        let past = call(&mut ws, 2, "collab_join", json!({ "path": names[most] })).await;
        assert!(
            past["err"]["message"]
                .as_str()
                .is_some_and(|m| m.contains(&most.to_string())),
            "a window joined room {} : {past}",
            most + 1
        );
        // Joining a room it is in again is no new room.
        let again = call(&mut ws, 3, "collab_join", json!({ "path": names[0] })).await;
        assert!(again.get("ok").is_some(), "{again}");
        call(&mut ws, 4, "collab_leave", json!({ "path": names[0] })).await;
        let after = call(&mut ws, 5, "collab_join", json!({ "path": names[most] })).await;
        assert!(after.get("ok").is_some(), "{after}");
    });
}
