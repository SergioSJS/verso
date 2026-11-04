// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What one request may hold of a 1-core, 1 GB host (the review of
//! 2026-10-13): the memory a file served or a command's answer takes, the
//! bytes of the requests under way, a note room's size, the requests one
//! address keeps in flight, a folder's quota under concurrent uploads, and
//! the entries one address may keep waiting in the server's maps.

use serde_json::json;

use crate::tests::{block_on, call, connect, next, sign_in, start, start_with};

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

/// A request from `address` through the trusted proxy whose body never
/// comes: its headers, a byte of its body, and nothing more.
async fn slow_body(r: &crate::tests::Running, address: &str) -> tokio::net::TcpStream {
    use tokio::io::AsyncWriteExt;
    let mut tcp = tokio::net::TcpStream::connect(r.addr()).await.unwrap();
    tcp.write_all(
        format!(
            "POST /api/signin HTTP/1.1\r\nHost: localhost\r\nOrigin: {}\r\nX-Forwarded-For: {address}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{{",
            r.origin()
        )
        .as_bytes(),
    )
    .await
    .unwrap();
    tcp
}

/// Requests through a trusted proxy count against the address it
/// forwarded: past 32 in flight from one, the next is answered 429 while
/// another address is served; a body that does not come is let go after
/// the short deadline of a small body.
#[test]
fn one_address_holds_a_bounded_number_of_requests_through_the_proxy() {
    use tokio::io::AsyncReadExt;
    block_on(async {
        let r = crate::tests::start_with(|c| {
            c.trusted_proxy = crate::proxy::Proxies::parse("127.0.0.1").unwrap();
        })
        .await;
        let mut held = Vec::new();
        for _ in 0..crate::http::IN_FLIGHT {
            held.push(slow_body(&r, "198.51.100.7").await);
        }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let client = reqwest::Client::new();
        let from = |address: &str| {
            client
                .get(r.url("/api/state"))
                .header("x-forwarded-for", address)
                .send()
        };
        let next_one = from("198.51.100.7").await.unwrap().status().as_u16();
        assert_eq!(
            next_one,
            429,
            "request {} from one address was served",
            crate::http::IN_FLIGHT + 1
        );
        let other = from("198.51.100.8").await.unwrap().status().as_u16();
        assert_eq!(other, 200);
        // The bodies that never came are let go, answered 408.
        let mut answer = [0_u8; 12];
        tokio::time::timeout(
            crate::http::BODY_WITHIN + std::time::Duration::from_secs(5),
            held[0].read_exact(&mut answer),
        )
        .await
        .expect("a body that never came still held its request")
        .unwrap();
        assert_eq!(&answer, b"HTTP/1.1 408");
    });
}

/// Ten players behind one address open a UniVerso's window cold through
/// its proxy, all at once (the re-test of 2026-11-04 found the same guard
/// refusing them through the app's link): 77 requests each, 52 at once,
/// every one answered — the window's files take no place among the
/// address's requests in flight, and each account's API requests count
/// under the account, the address's signed-in bound above them.
#[test]
fn a_table_of_ten_behind_one_address_loads_cold_through_the_proxy() {
    block_on(async {
        let r = start_with(|c| {
            c.trusted_proxy = crate::proxy::Proxies::parse("127.0.0.1").unwrap();
        })
        .await;
        let ui = r.server.config.ui_dir.join("chunks");
        crate::data::ensure_dir(&ui).unwrap();
        crate::data::write_for_tests(&r.server.config.ui_dir.join("web.html"), "<!doctype html>");
        for n in 0..80 {
            crate::data::write_for_tests(
                &ui.join(format!("chunk-{n}.js")),
                &"// a chunk\n".repeat(400),
            );
        }
        let mut cookies = Vec::new();
        for p in 0..10 {
            let email = format!("p{p}@mesa.example");
            r.server
                .db
                .create_account(
                    &email,
                    &format!("P{p}"),
                    "pt",
                    Some("senha muito longa"),
                    false,
                )
                .unwrap();
            cookies.push(sign_in(&r, &email, "senha muito longa").await.cookie);
        }
        // What a proxy carries at once; its connections are counted only
        // against the server's (`crate::listen::CONNECTIONS`).
        let carried = std::sync::Arc::new(tokio::sync::Semaphore::new(200));
        let client = reqwest::Client::new();
        let opening = [
            "/api/state",
            "/api/me",
            "/api/me/settings",
            "/api/folders",
            "/api/state",
        ];
        let load = |cookie: String| {
            let (client, carried, url) = (client.clone(), carried.clone(), r.url(""));
            async move {
                let ask = |n: usize| {
                    let (client, carried, url, cookie) =
                        (client.clone(), carried.clone(), url.clone(), cookie.clone());
                    tokio::spawn(async move {
                        let _carried = carried.acquire().await.unwrap();
                        let req = match opening.get(n) {
                            Some(route) => {
                                client.get(format!("{url}{route}")).header("cookie", cookie)
                            }
                            None => client.get(format!("{url}/chunks/chunk-{n}.js")),
                        };
                        req.header("x-forwarded-for", "198.51.100.50")
                            .send()
                            .await
                            .map_or(0, |res| res.status().as_u16())
                    })
                };
                let mut statuses = Vec::new();
                for wave in [0..52, 52..77] {
                    let asked: Vec<_> = wave.map(ask).collect();
                    for done in asked {
                        statuses.push(done.await.unwrap());
                    }
                }
                statuses
            }
        };
        let loads: Vec<_> = cookies.into_iter().map(|c| tokio::spawn(load(c))).collect();
        for (p, done) in loads.into_iter().enumerate() {
            let statuses = done.await.unwrap();
            assert_eq!(statuses.len(), 77);
            assert!(
                statuses.iter().all(|s| *s == 200),
                "player {p}: {statuses:?}"
            );
        }
    });
}

/// The first piece of a file of `size` bytes a device sends to `path`.
async fn first_piece(
    ws: &mut crate::tests::Socket,
    id: u64,
    path: &str,
    size: usize,
) -> serde_json::Value {
    use base64::Engine;
    let bytes = content(size);
    let piece = &bytes[..crate::sync::PIECE.min(size)];
    call(
        ws,
        id,
        "sync_put",
        json!({
            "path": path,
            "offset": 0,
            "size": size,
            "hash": crate::sync::sha256(&bytes),
            "base": null,
            "data": base64::engine::general_purpose::STANDARD.encode(piece),
        }),
    )
    .await
}

/// Uploads under way hold the room they declared (ADR 0077 item 5): with
/// a quota of 10 MB, a second upload of 8 MB that starts while the first
/// is still on its way is refused as over the quota, though nothing of
/// either has landed; when the first goes, its room comes back.
#[test]
fn concurrent_uploads_do_not_pass_the_folders_quota() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = crate::tests::folder_id(&r, &b).await;
        r.server.db.set_quota(&id, Some(10 * 1024 * 1024)).unwrap();
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let eight = 8 * 1024 * 1024;
        let first = first_piece(&mut ws, 2, "um.bin", eight).await;
        assert_eq!(first["ok"]["done"], false, "{first}");
        let second = first_piece(&mut ws, 3, "dois.bin", eight).await;
        assert_eq!(
            second["err"]["kind"], "quota",
            "two uploads of 8 MB under way in a folder of 10 MB: {second}"
        );
        // The first gone, its room comes back.
        drop(ws);
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            let again = first_piece(&mut ws, 4, "dois.bin", eight).await;
            if again["ok"]["done"] == false {
                break;
            }
            assert!(std::time::Instant::now() < deadline, "{again}");
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    });
}

/// One address keeps a bounded number of device codes waiting: past it,
/// the next start is answered 429, and the codes of others are not pushed
/// out by it.
#[test]
fn one_address_keeps_a_bounded_number_of_device_codes_waiting() {
    block_on(async {
        let r = start().await;
        let most = crate::limit::PENDING_PER_ADDRESS;
        for i in 0..most {
            // The per-address delay of a start is not this test's subject.
            r.server.limiter.succeeded("device:127.0.0.1");
            let (status, _) =
                crate::tests::post(&r, "/api/device/start", json!({ "device": "Mac" }), None).await;
            assert_eq!(status, 200, "code {}", i + 1);
        }
        r.server.limiter.succeeded("device:127.0.0.1");
        let (status, _) =
            crate::tests::post(&r, "/api/device/start", json!({ "device": "Mac" }), None).await;
        assert_eq!(status, 429, "code {} of one address was kept", most + 1);
        assert_eq!(verso_service::lock(&r.server.devices).len(), most);
    });
}

/// One address keeps a bounded number of sign-in links waiting, however
/// often it asks: the next is not made.
#[test]
fn one_address_keeps_a_bounded_number_of_sign_in_links_waiting() {
    block_on(async {
        let r = start_with(|c| c.public_url = Some("@self".into())).await;
        let _ = r
            .server
            .mail
            .set(crate::mail::Mail::Memory(std::sync::Mutex::new(Vec::new())));
        let most = crate::limit::PENDING_PER_ADDRESS;
        for _ in 0..=most {
            r.server.limiter.succeeded("mail:127.0.0.1");
            r.server.limiter.succeeded("mail:admin@casa.lan");
            let (status, _) = crate::tests::post(
                &r,
                "/api/signin/link",
                json!({ "email": "admin@casa.lan" }),
                None,
            )
            .await;
            assert_eq!(status, 200);
            // The link is made after the answer, on its own.
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        let kept = verso_service::lock(&r.server.signin_links).len();
        assert!(
            kept <= most,
            "{kept} sign-in links of one address were kept; {most} at most"
        );
    });
}

/// A file's text crosses UniVerso 16 MB at most (`crate::texts`): past it,
/// `read_file_text`, `read_text` and `read_note` refuse before the file is
/// read, in words that say why, and a room is not made of it; a smaller
/// note is read as before. (A write past it is refused too: `texts.rs`'s
/// own test, since a message of that size does not fit one WebSocket
/// frame of the server.)
#[test]
fn a_text_past_16_mb_is_refused_on_the_server_before_it_is_read() {
    block_on(async {
        let r = start().await;
        let big = "a".repeat(20 * 1024 * 1024);
        put_file(&r, "grande.txt", big.as_bytes());
        put_file(&r, "Grande.md", big.as_bytes());
        let (mut ws, _, _) = joined(&r, &[]).await;
        for (i, (cmd, path)) in [
            ("read_file_text", "grande.txt"),
            ("read_text", "grande.txt"),
            ("read_note", "Grande.md"),
            ("collab_join", "Grande.md"),
        ]
        .into_iter()
        .enumerate()
        {
            let answer = call(&mut ws, 20 + i as u64, cmd, json!({ "path": path })).await;
            let said: String = answer.to_string().chars().take(200).collect();
            assert_eq!(
                answer["err"]["kind"], "refused",
                "{cmd} of a 20 MB file: {said}"
            );
            assert!(said.contains("16 MB"), "{cmd}: {said}");
        }
        let small = call(&mut ws, 31, "read_note", json!({ "path": "Sessao.md" })).await;
        assert_eq!(small["ok"]["text"], "# Sessao\n", "{small}");
    });
}
