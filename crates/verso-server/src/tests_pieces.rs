// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A file in pieces from the disk (ADR 0079 item 12, revised 2026-10-12;
//! the campaign's finding F31): a device of sync 2 sends and fetches a
//! file as binary messages, the server reads each piece from the disk as
//! it is asked for and writes each piece it receives to a temporary file —
//! never the file whole in memory — and whatever goes wrong on the way
//! leaves nothing behind.

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use crate::sync::{PIECE, sha256};
use crate::tests::{Running, Socket, block_on, call, folder_id, sign_in, start};
use crate::tests_sync::{fetch, send};

/// A connection that says sync `version` (none for `None`), its hello, and
/// the folder opened.
async fn device(r: &Running, version: Option<&str>) -> (Socket, Value) {
    let b = sign_in(r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(r, &b).await;
    let mut req = format!("ws://localhost:{}/api/ws", r.addr.port())
        .into_client_request()
        .unwrap();
    let headers = req.headers_mut();
    headers.insert("cookie", b.cookie.parse().unwrap());
    headers.insert("origin", r.origin().parse().unwrap());
    if let Some(v) = version {
        headers.insert(verso_core::sync::PROTOCOL_HEADER, v.parse().unwrap());
    }
    let (mut ws, _) = tokio_tungstenite::connect_async(req).await.unwrap();
    let hello = crate::tests::next(&mut ws).await;
    if hello["hello"].get("syncRefused").is_none() {
        let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        assert!(opened.get("ok").is_some(), "{opened}");
    }
    (ws, hello)
}

/// The answer to request `id`: its JSON, and the piece of a file it
/// carries when it came as a binary message.
async fn answer(ws: &mut Socket, id: u64) -> (Value, Option<Vec<u8>>) {
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(30), ws.next())
            .await
            .expect("an answer in time")
            .unwrap()
            .unwrap();
        let (v, piece) = match m {
            Message::Text(t) => (serde_json::from_str::<Value>(&t).unwrap(), None),
            Message::Binary(b) => {
                let (header, piece) = verso_core::sync::unframe(&b).expect("a frame");
                (
                    serde_json::from_slice(header).unwrap(),
                    Some(piece.to_vec()),
                )
            }
            _ => continue,
        };
        if v["id"].as_u64() == Some(id) {
            return (v, piece);
        }
    }
}

/// Send a file in pieces as binary messages, as a device of sync 2 does,
/// each piece passed through `damage` first.
async fn send_binary(
    ws: &mut Socket,
    id: u64,
    path: &str,
    bytes: &[u8],
    damage: impl Fn(usize, &mut Vec<u8>),
) -> Value {
    let hash = sha256(bytes);
    let mut offset = 0;
    let mut n = id;
    loop {
        let end = (offset + PIECE).min(bytes.len());
        let header = json!({ "id": n, "cmd": "sync_put", "args": { "path": path, "offset": offset, "size": bytes.len(), "hash": hash, "base": null } });
        let mut piece = bytes[offset..end].to_vec();
        damage(offset, &mut piece);
        ws.send(Message::Binary(
            verso_core::sync::frame(header.to_string().as_bytes(), &piece).into(),
        ))
        .await
        .unwrap();
        let (v, _) = answer(ws, n).await;
        n += 1;
        if v.get("err").is_some() || v["ok"]["done"] == true {
            return v;
        }
        offset = end;
    }
}

/// Fetch a file in pieces as a device of sync 2 does: every answer a
/// binary message.
async fn fetch_binary(ws: &mut Socket, id: u64, path: &str) -> (Vec<u8>, String) {
    let mut back = Vec::new();
    let mut hash = String::new();
    let mut n = id;
    loop {
        let read =
            json!({ "id": n, "cmd": "sync_read", "args": { "path": path, "offset": back.len() } });
        ws.send(Message::Text(read.to_string().into()))
            .await
            .unwrap();
        let (v, piece) = answer(ws, n).await;
        n += 1;
        let piece = piece.unwrap_or_else(|| panic!("not a binary message: {v}"));
        assert!(v["ok"].get("data").is_none(), "{v}");
        assert!(piece.len() <= PIECE);
        if back.is_empty() {
            hash = v["ok"]["hash"].as_str().unwrap().to_owned();
        }
        back.extend_from_slice(&piece);
        if v["ok"]["done"] == true {
            return (back, hash);
        }
    }
}

/// The temporary files in the test folder: transfers under way.
fn temporaries(r: &Running) -> Vec<std::path::PathBuf> {
    verso_fs::Root::open(r.server.folder_path("Campanha").unwrap(), vec![])
        .unwrap()
        .temporaries()
        .unwrap()
}

fn content(len: usize) -> Vec<u8> {
    (0..len)
        .map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8)
        .collect()
}

#[test]
fn a_device_of_sync_2_sends_and_fetches_pieces_as_binary_messages() {
    block_on(async {
        let r = start().await;
        let (mut ws, hello) = device(&r, Some("2")).await;
        assert_eq!(hello["hello"]["sync"], verso_core::sync::PROTOCOL);
        // Three pieces and a few bytes, none of them text.
        let bytes = content(3 * PIECE + 5);
        let sent = send_binary(&mut ws, 10, "anexos/binario.bin", &bytes, |_, _| {}).await;
        assert_eq!(sent["ok"]["done"], true, "{sent}");
        // Fetched back: every answer a binary message, its piece as it is.
        let (back, hash) = fetch_binary(&mut ws, 100, "anexos/binario.bin").await;
        assert_eq!(hash, sha256(&bytes));
        assert!(back == bytes);
        // A device of sync 1 is still served base64, the same bytes.
        let (mut old, hello) = device(&r, Some("1")).await;
        assert!(hello["hello"].get("syncRefused").is_none(), "{hello}");
        let (again, hash) = fetch(&mut old, 10, "anexos/binario.bin").await;
        assert_eq!(hash, sha256(&bytes));
        assert!(again == bytes);
        // Nothing kept once both are done.
        assert_eq!(r.server.transfers.kept(), (0, 0));
        assert_eq!(r.server.transfers.copies(), 0);
        assert!(temporaries(&r).is_empty(), "{:?}", temporaries(&r));
    });
}

/// A piece damaged on its way: the whole file's hash does not match, the
/// file is refused, and nothing of it lands — no file, no temporary file.
#[test]
fn a_damaged_piece_is_refused_and_leaves_nothing() {
    block_on(async {
        let r = start().await;
        let (mut ws, _) = device(&r, Some("2")).await;
        let bytes = content(2 * PIECE + 100);
        let sent = send_binary(&mut ws, 10, "anexos/estragado.bin", &bytes, |at, piece| {
            if at == PIECE {
                piece[7] ^= 0xff;
            }
        })
        .await;
        assert_eq!(sent["err"]["kind"], "refused", "{sent}");
        assert!(
            sent["err"]["message"]
                .as_str()
                .is_some_and(|m| m.contains("damaged")),
            "{sent}"
        );
        let state = call(&mut ws, 50, "sync_state", json!({})).await;
        assert!(!state.to_string().contains("estragado"), "{state}");
        assert_eq!(r.server.transfers.kept(), (0, 0));
        assert!(temporaries(&r).is_empty(), "{:?}", temporaries(&r));
        // Sent again whole: it lands.
        let again = send_binary(&mut ws, 60, "anexos/estragado.bin", &bytes, |_, _| {}).await;
        assert_eq!(again["ok"]["done"], true, "{again}");
        let (back, _) = fetch_binary(&mut ws, 80, "anexos/estragado.bin").await;
        assert!(back == bytes);
    });
}

/// A file replaced on the disk while a device reads it: the next piece is
/// refused as changed — the device's next pass reads the new file — and
/// never a piece of the new file after pieces of the old.
#[test]
fn a_file_replaced_while_it_is_read_is_refused_as_changed() {
    block_on(async {
        let r = start().await;
        let (mut reader, _) = device(&r, Some("2")).await;
        let (mut writer, _) = device(&r, Some("2")).await;
        let old = content(2 * PIECE);
        let sent = send(&mut writer, 10, "anexos/mudando.bin", &old, None).await;
        assert_eq!(sent["ok"]["done"], true, "{sent}");
        let first = json!({ "id": 20, "cmd": "sync_read", "args": { "path": "anexos/mudando.bin", "offset": 0 } });
        reader
            .send(Message::Text(first.to_string().into()))
            .await
            .unwrap();
        let (v, piece) = answer(&mut reader, 20).await;
        assert_eq!(v["ok"]["done"], false, "{v}");
        assert_eq!(piece.map(|p| p.len()), Some(PIECE));
        // Another device replaces it meanwhile.
        let mut new = old.clone();
        new.reverse();
        let replaced = send(
            &mut writer,
            30,
            "anexos/mudando.bin",
            &new,
            Some(&sha256(&old)),
        )
        .await;
        assert_eq!(replaced["ok"]["done"], true, "{replaced}");
        let rest = json!({ "id": 21, "cmd": "sync_read", "args": { "path": "anexos/mudando.bin", "offset": PIECE } });
        reader
            .send(Message::Text(rest.to_string().into()))
            .await
            .unwrap();
        let (v, piece) = answer(&mut reader, 21).await;
        assert_eq!(v["err"]["kind"], "changed", "{v}");
        assert!(piece.is_none());
        assert_eq!(r.server.transfers.kept(), (0, 0));
        // Read again from the start: the new file, whole.
        let (back, hash) = fetch_binary(&mut reader, 40, "anexos/mudando.bin").await;
        assert_eq!(hash, sha256(&new));
        assert!(back == new);
    });
}

/// A device that drops in the middle of sending a file: the server forgets
/// the transfer and removes its temporary file.
#[test]
fn a_device_dropping_mid_transfer_leaves_no_temporary_file() {
    block_on(async {
        let r = start().await;
        let (mut ws, _) = device(&r, Some("2")).await;
        let bytes = content(3 * PIECE);
        let hash = sha256(&bytes);
        let header = json!({ "id": 10, "cmd": "sync_put", "args": { "path": "anexos/metade.bin", "offset": 0, "size": bytes.len(), "hash": hash, "base": null } });
        ws.send(Message::Binary(
            verso_core::sync::frame(header.to_string().as_bytes(), &bytes[..PIECE]).into(),
        ))
        .await
        .unwrap();
        let (v, _) = answer(&mut ws, 10).await;
        assert_eq!(v["ok"]["done"], false, "{v}");
        assert_eq!(r.server.transfers.kept(), (1, 0));
        assert_eq!(temporaries(&r).len(), 1, "{:?}", temporaries(&r));
        drop(ws);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while (r.server.transfers.kept() != (0, 0) || !temporaries(&r).is_empty())
            && std::time::Instant::now() < deadline
        {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert_eq!(r.server.transfers.kept(), (0, 0));
        assert!(temporaries(&r).is_empty(), "{:?}", temporaries(&r));
    });
}

/// A device older than the sync before the server's is refused, its
/// sync's commands too, in words that say what to do; the sync before is
/// followed (ADR 0079 item 5).
#[test]
fn a_device_older_than_the_sync_before_is_refused() {
    block_on(async {
        let r = start().await;
        let (mut ws, hello) = device(&r, Some("0")).await;
        let why = hello["hello"]["syncRefused"].as_str().unwrap_or_default();
        assert!(why.contains("sync 0") && why.contains("sync 2"), "{hello}");
        let refused = call(&mut ws, 5, "sync_state", json!({})).await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
        assert_eq!(refused["err"]["message"], why);
        // Sync 1, the one before, is followed.
        let (_, hello) = device(&r, Some("1")).await;
        assert!(hello["hello"].get("syncRefused").is_none(), "{hello}");
    });
}

/// A binary message that is not a piece a device sends — cut short, or a
/// command other than `sync_put` — is refused, never taken for one.
#[test]
fn a_binary_message_is_only_a_piece_sent() {
    block_on(async {
        let r = start().await;
        let (mut ws, _) = device(&r, Some("2")).await;
        let header = json!({ "id": 7, "cmd": "sync_state", "args": {} });
        ws.send(Message::Binary(
            verso_core::sync::frame(header.to_string().as_bytes(), b"x").into(),
        ))
        .await
        .unwrap();
        let said = crate::tests::next(&mut ws).await;
        assert_eq!(said["err"]["message"], "not a request", "{said}");
        ws.send(Message::Binary(vec![0, 0, 9, 9, b'{'].into()))
            .await
            .unwrap();
        let said = crate::tests::next(&mut ws).await;
        assert_eq!(said["err"]["message"], "not a request", "{said}");
        // The connection goes on.
        let state = call(&mut ws, 8, "sync_state", json!({})).await;
        assert!(state.get("ok").is_some(), "{state}");
    });
}
