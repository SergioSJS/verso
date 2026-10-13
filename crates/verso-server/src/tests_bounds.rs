// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The bounds of one connection and of the server (threat-model.md, gaps
//! of 2026-10-11): what a peer that stops reading, a flood of messages or
//! of connections, or a slow request can hold.

use std::time::{Duration, Instant};

use serde_json::json;

use crate::tests::{block_on, call, connect, folder_id, next, sign_in, start, start_with};

/// The connections of `account` the server still holds.
fn connections_of(r: &crate::tests::Running, account: &str) -> Vec<String> {
    verso_service::lock(&r.server.clients)
        .iter()
        .filter(|(_, c)| c.account == account)
        .map(|(id, _)| id.clone())
        .collect()
}

/// A peer that stops reading at the TCP level is let go once a message
/// waits past its time (gap 2): the connection's loop is not held in the
/// write until the system gives up on the socket.
#[test]
fn a_peer_that_stops_reading_is_let_go() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        let hello = next(&mut ws).await;
        let account = hello["hello"]["account"]["id"].as_str().unwrap().to_owned();
        let ids = connections_of(&r, &account);
        assert_eq!(ids.len(), 1);
        // The socket is kept and never read again: the system's buffers
        // fill, then the server's write waits.
        let big = "x".repeat(1024 * 1024);
        for _ in 0..48 {
            r.server
                .push(&ids, &json!({ "event": "big", "payload": big }));
        }
        let started = Instant::now();
        while !connections_of(&r, &account).is_empty() {
            assert!(
                started.elapsed() < Duration::from_secs(30),
                "the connection is still held"
            );
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        drop(ws);
    });
}

#[test]
fn the_time_a_message_may_take_grows_with_its_size() {
    let small = crate::rpc::send_within(100);
    let piece = crate::rpc::send_within(6 * 1024 * 1024);
    assert!(small >= Duration::from_secs(1));
    assert!(piece > small);
    assert!(crate::rpc::send_within(usize::MAX) > piece);
}

/// A presence is small: one past its bound is refused, not relayed to
/// every window of the note (gap 3).
#[test]
fn a_presence_past_its_bound_is_refused() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        call(&mut ws, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        let small = call(
            &mut ws,
            3,
            "collab_awareness",
            json!({ "path": "Sessao.md", "update": "AA==" }),
        )
        .await;
        assert!(small.get("ok").is_some(), "{small}");
        let big = "A".repeat(crate::collab::PRESENCE_MOST + 4);
        let refused = call(
            &mut ws,
            4,
            "collab_awareness",
            json!({ "path": "Sessao.md", "update": big }),
        )
        .await;
        assert!(refused.get("err").is_some(), "{refused}");
    });
}

/// The mail routes answer an address with an account as fast as one
/// without (gap 6): with a mail server that never answers, the answer
/// still leaves at once.
#[test]
fn the_mail_routes_answer_alike_whether_the_address_has_an_account() {
    block_on(async {
        let r = start().await;
        // A mail server that takes the connection and never says a word.
        let silent = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = silent.local_addr().unwrap().port();
        tokio::spawn(async move {
            let mut held = Vec::new();
            while let Ok((stream, _)) = silent.accept().await {
                held.push(stream);
            }
        });
        let mail =
            crate::mail::from_config(&format!("smtp://127.0.0.1:{port}"), "Verso <v@casa.lan>")
                .unwrap();
        let _ = r.server.mail.set(mail);
        for route in ["/api/signin/link", "/api/forgot"] {
            for email in ["admin@casa.lan", "ninguem@casa.lan"] {
                // Each request is counted by address; not this test's subject.
                r.server.limiter.succeeded("mail:127.0.0.1");
                let started = Instant::now();
                let (status, _) = tokio::time::timeout(
                    Duration::from_secs(10),
                    crate::tests::post(&r, route, json!({ "email": email }), None),
                )
                .await
                .unwrap_or((0, json!(null)));
                assert_eq!(status, 200, "{route} {email}");
                assert!(
                    started.elapsed() < Duration::from_secs(2),
                    "{route} {email}: {:?}",
                    started.elapsed()
                );
            }
        }
    });
}

/// One account holds a bounded number of connections (gap 4): past it
/// the next is refused, and a place comes back with its connection.
#[test]
fn an_account_holds_a_bounded_number_of_connections() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut held = Vec::new();
        for _ in 0..crate::fair::PER_ACCOUNT {
            let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
                .await
                .unwrap();
            next(&mut ws).await;
            held.push(ws);
        }
        assert_eq!(
            connect(&r, Some(&b.cookie), Some(&r.origin()), None)
                .await
                .err(),
            Some(429)
        );
        drop(held.pop());
        let started = Instant::now();
        loop {
            match connect(&r, Some(&b.cookie), Some(&r.origin()), None).await {
                Ok(_) => break,
                Err(status) => {
                    assert_eq!(status, 429);
                    assert!(
                        started.elapsed() < Duration::from_secs(10),
                        "no place came back"
                    );
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
    });
}

/// A request's headers have a deadline (gap 8): a client that sends a
/// few bytes and then nothing is let go.
#[test]
fn a_request_whose_headers_never_end_is_let_go() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    block_on(async {
        let r = start().await;
        let mut tcp = tokio::net::TcpStream::connect(r.addr()).await.unwrap();
        tcp.write_all(b"GET /api/state HTTP/1.1\r\nHost: localhost\r\n")
            .await
            .unwrap();
        let mut buf = [0_u8; 256];
        let read = tokio::time::timeout(Duration::from_secs(10), tcp.read(&mut buf)).await;
        assert!(read.is_ok(), "the connection is still open");
    });
}

/// Past the server's connections, the next is closed before it is read,
/// and a place comes back when one closes (gap 8).
#[test]
fn past_the_servers_connections_the_next_is_closed() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    block_on(async {
        let r = start().await;
        let tcp = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = tcp.local_addr().unwrap();
        let listener = crate::listen::Plain::new(
            tcp,
            crate::listen::Slots::bounded(crate::proxy::Proxies::default(), 1, 128),
        );
        let app = crate::http::router(std::sync::Arc::clone(&r.server));
        tokio::spawn(crate::listen::serve(listener, app, std::future::pending()));
        let first = tokio::net::TcpStream::connect(addr).await.unwrap();
        // Accepted, then closed: nothing is read from it.
        let mut second = tokio::net::TcpStream::connect(addr).await.unwrap();
        let mut buf = [0_u8; 64];
        let n = tokio::time::timeout(Duration::from_secs(5), second.read(&mut buf))
            .await
            .unwrap()
            .unwrap_or(0);
        assert_eq!(n, 0, "the second connection was served");
        drop(first);
        tokio::time::sleep(Duration::from_millis(200)).await;
        let mut third = tokio::net::TcpStream::connect(addr).await.unwrap();
        third
            .write_all(b"GET /api/state HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut answer = Vec::new();
        tokio::time::timeout(Duration::from_secs(5), third.read_to_end(&mut answer))
            .await
            .unwrap()
            .unwrap();
        assert!(
            answer.starts_with(b"HTTP/1.1 200"),
            "{}",
            String::from_utf8_lossy(&answer)
        );
    });
}

/// The minor ones of 2026-10-11: a folder's file is for this server's pages (gap 14),
/// and a stranger is not told the version (gap 15).
#[test]
fn the_database_the_files_and_the_version_say_no_more_than_they_must() {
    block_on(async {
        let r = start().await;
        // The database's mode: verso-fs's own test (owner_only), the one
        // crate that reads a file's mode; here, that opening still works.
        assert!(crate::db::Db::open(tempfile::tempdir().unwrap().path()).is_ok());
        let (_, state) = crate::tests::get(&r, "/api/state", None).await;
        assert!(state["version"].is_null(), "{state}");
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (_, state) = crate::tests::get(&r, "/api/state", Some(&b)).await;
        assert_eq!(state["version"], env!("CARGO_PKG_VERSION"));
        let id = folder_id(&r, &b).await;
        let res = reqwest::Client::new()
            .get(r.url(&format!("/f/{id}/mapa.svg")))
            .header("cookie", &b.cookie)
            .send()
            .await
            .unwrap();
        assert_eq!(
            res.headers()
                .get("cross-origin-resource-policy")
                .and_then(|v| v.to_str().ok()),
            Some("same-origin")
        );
    });
}

/// A server behind a trusted proxy on this machine: a test's requests
/// then come from the address their `X-Forwarded-For` names.
async fn behind_proxy() -> crate::tests::Running {
    start_with(|c| c.trusted_proxy = crate::proxy::Proxies::parse("127.0.0.1").unwrap()).await
}

/// The REST routes have a pace per address (ADR 0083 item 7): the 101st
/// request of a burst from one address answers 429 with `Retry-After`,
/// and the next second's is heard; another address, the proxy itself and
/// the page are not held back by it.
#[test]
fn past_a_burst_the_rest_routes_answer_429_until_the_next_second() {
    block_on(async {
        let r = behind_proxy().await;
        r.server.pace.freeze();
        let client = reqwest::Client::new();
        let from = |path: &str, address: &str| {
            client
                .get(r.url(path))
                .header("x-forwarded-for", address)
                .send()
        };
        for i in 1..=100 {
            let status = from("/api/state", "203.0.113.7").await.unwrap().status();
            assert_eq!(status.as_u16(), 200, "request {i}");
        }
        let refused = from("/api/state", "203.0.113.7").await.unwrap();
        assert_eq!(refused.status().as_u16(), 429, "the 101st request");
        assert_eq!(
            refused
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok()),
            Some("1")
        );
        // A WebSocket upgrade with no credential is no way around it.
        let upgrade = client
            .get(r.url("/api/ws"))
            .header("x-forwarded-for", "203.0.113.7")
            .header("connection", "upgrade")
            .header("upgrade", "websocket")
            .header("sec-websocket-version", "13")
            .header("sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ==")
            .send()
            .await
            .unwrap();
        assert_eq!(upgrade.status().as_u16(), 429);
        // Another address, the proxy's own requests and the page are not
        // behind it.
        let other = from("/api/state", "203.0.113.8").await.unwrap().status();
        assert_eq!(other.as_u16(), 200);
        let own = client
            .get(r.url("/api/state"))
            .send()
            .await
            .unwrap()
            .status();
        assert_eq!(own.as_u16(), 200);
        let page = from("/signin", "203.0.113.7").await.unwrap().status();
        assert_ne!(page.as_u16(), 429);
        // The next second's request is heard.
        r.server.pace.advance(Duration::from_secs(1));
        let next_second = from("/api/state", "203.0.113.7").await.unwrap().status();
        assert_eq!(next_second.as_u16(), 200);
        assert!(!crate::log::said("requests from 203.0.113.7 past").is_empty());
        assert!(!crate::log::said("carried no X-Forwarded-For").is_empty());
    });
}
