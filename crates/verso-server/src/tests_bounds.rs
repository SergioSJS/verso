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
        let r = start_with(|c| c.public_url = Some("@self".into())).await;
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
pub(crate) async fn behind_proxy() -> crate::tests::Running {
    start_with(|c| c.trusted_proxy = crate::proxy::Proxies::parse("127.0.0.1").unwrap()).await
}

/// The REST routes have a pace per address (ADR 0083 item 7): the 101st
/// request of a burst from one address answers 429 with `Retry-After`,
/// and the next second's is heard; another address, the proxy's own key
/// and the page are not held back by it.
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
        // Another address, the proxy's own key (a request it forwarded
        // nothing for) and the page are not behind it.
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

/// Nothing that comes through a proxy claims this machine's exemption
/// from the pace (ADR 0083 item 7): a forwarded `127.0.0.1` — a proxy
/// that passed the client's own header on — is paced under that address,
/// and a proxy that forwards nothing is paced under its own, every
/// visitor as one key. Only a direct connection from this machine is not.
#[test]
fn a_forwarded_loopback_or_an_unforwarding_proxy_is_paced() {
    block_on(async {
        let r = behind_proxy().await;
        r.server.pace.freeze();
        let client = reqwest::Client::new();
        let state = |forwarded: Option<&str>| {
            let mut req = client.get(r.url("/api/state"));
            if let Some(f) = forwarded {
                req = req.header("x-forwarded-for", f);
            }
            req.send()
        };
        for forwarded in [Some("127.0.0.1"), None] {
            for i in 1..=100 {
                let status = state(forwarded).await.unwrap().status().as_u16();
                assert_eq!(status, 200, "{forwarded:?} request {i}");
            }
            let status = state(forwarded).await.unwrap().status().as_u16();
            assert_eq!(status, 429, "{forwarded:?}: the 101st request");
            r.server.pace.advance(Duration::from_secs(10));
        }
        // A direct connection from this machine, no proxy set, is not paced.
        let direct = start().await;
        for i in 1..=150 {
            let (status, _) = crate::tests::get(&direct, "/api/state", None).await;
            assert_eq!(status, 200, "direct request {i}");
        }
    });
}

/// A proxy on this machine that is not in `VERSO_TRUSTED_PROXY` makes
/// every visitor this machine's address, silently: the first request from
/// an untrusted loopback peer carrying `X-Forwarded-For` is said in the log
/// with what to set, and the next ones within the minute are not (ADR 0083
/// item 5). A peer elsewhere, or a request with no such header, says
/// nothing.
#[test]
fn an_untrusted_local_proxy_is_said_once_a_minute() {
    block_on(async {
        let r = start().await;
        let mut forwarded = axum::http::HeaderMap::new();
        forwarded.insert("x-forwarded-for", "203.0.113.30".parse().unwrap());
        let plain = axum::http::HeaderMap::new();
        let local: std::net::SocketAddr = "127.0.0.77:5000".parse().unwrap();
        let away: std::net::SocketAddr = "198.51.100.77:5000".parse().unwrap();
        crate::auth::peer(&r.server, &plain, local);
        crate::auth::peer(&r.server, &forwarded, away);
        assert!(
            crate::log::said("from 127.0.0.77").is_empty(),
            "nothing forwarded from here"
        );
        for _ in 0..3 {
            let peer = crate::auth::peer(&r.server, &forwarded, local);
            assert_eq!(peer.addr, local.ip(), "the header is still not believed");
        }
        let lines = crate::log::said("from 127.0.0.77");
        assert_eq!(lines.len(), 1, "{lines:?}");
        assert!(lines[0].starts_with("WARN "), "{lines:?}");
        assert!(lines[0].contains("VERSO_TRUSTED_PROXY"), "{lines:?}");
        assert!(crate::log::said("from 198.51.100.77").is_empty());
    });
}

/// A request's headers are 64 KiB at most (ADR 0083 item 8, F12): one
/// past it is refused with 431 before it is read whole, and one well
/// within it is served.
#[test]
fn headers_past_64_kib_are_refused_with_431() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    block_on(async {
        let r = start().await;
        let first_line = |size: usize| {
            let addr = r.addr();
            async move {
                let mut tcp = tokio::net::TcpStream::connect(addr).await.unwrap();
                let request = format!(
                    "GET /api/state HTTP/1.1\r\nHost: localhost\r\nX-Big: {}\r\nConnection: close\r\n\r\n",
                    "x".repeat(size)
                );
                // The server may stop reading before the whole request is
                // in: what it answered is what is looked at.
                let _ = tcp.write_all(request.as_bytes()).await;
                let mut answer = Vec::new();
                let _ = tokio::time::timeout(Duration::from_secs(5), tcp.read_to_end(&mut answer))
                    .await;
                String::from_utf8_lossy(&answer)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_owned()
            }
        };
        assert_eq!(first_line(32 * 1024).await, "HTTP/1.1 200 OK");
        // Just past the bound, which hyper's buffer alone lets through
        // when the head arrives in one read, and far past it.
        for size in [70 * 1024, 300 * 1024] {
            assert_eq!(
                first_line(size).await,
                "HTTP/1.1 431 Request Header Fields Too Large",
                "{size}"
            );
        }
    });
}

/// A note room refuses a Yjs update past 4 MB before decoding it (ADR
/// 0083 item 8, F13), as a board room does: a well-formed update of
/// tens of megabytes would otherwise be taken into the room's memory and
/// relayed to every window in it.
#[test]
fn a_note_room_refuses_an_update_past_4_mb() {
    use base64::Engine;
    use yrs::updates::decoder::Decode;
    use yrs::{GetString, ReadTxn, Text, Transact};
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let joined = call(&mut ws, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        let doc = yrs::Doc::with_options(yrs::Options {
            offset_kind: yrs::OffsetKind::Utf16,
            ..Default::default()
        });
        let state = base64::engine::general_purpose::STANDARD
            .decode(joined["ok"]["update"].as_str().unwrap())
            .unwrap();
        doc.transact_mut()
            .apply_update(yrs::Update::decode_v1(&state).unwrap())
            .unwrap();
        let text = doc.get_or_insert_text(crate::collab::TEXT);
        let typed = |words: &str| {
            let mut txn = doc.transact_mut();
            let len = text.get_string(&txn).encode_utf16().count() as u32;
            let before = txn.state_vector();
            text.insert(&mut txn, len, words);
            drop(txn);
            let txn = doc.transact();
            base64::engine::general_purpose::STANDARD.encode(txn.encode_state_as_update_v1(&before))
        };
        let big = typed(&"x".repeat(crate::collab_board::UPDATE_MOST + 1));
        let refused = call(
            &mut ws,
            3,
            "collab_update",
            json!({ "path": "Sessao.md", "update": big }),
        )
        .await;
        let said: String = refused.to_string().chars().take(200).collect();
        assert_eq!(refused["err"]["kind"], "refused", "{said}");
        assert!(said.contains("4 MB"), "{said}");
    });
}

/// A wrong poll secret counts against the `device:` key of its address
/// (ADR 0083 item 8, F17): past the free failures the next wrong one
/// waits; the app that holds the right secret is still answered.
#[test]
fn a_wrong_poll_secret_is_delayed_like_a_failed_sign_in() {
    block_on(async {
        let r = start().await;
        let (_, started) = crate::tests::post(
            &r,
            "/api/device/start",
            json!({ "device": "Verso · MacBook" }),
            None,
        )
        .await;
        let code = started["code"].as_str().unwrap().to_owned();
        let poll = started["poll"].as_str().unwrap().to_owned();
        let mut statuses = Vec::new();
        for _ in 0..3 {
            let (status, _) = crate::tests::post(
                &r,
                "/api/device/poll",
                json!({ "code": code, "poll": "not the secret" }),
                None,
            )
            .await;
            statuses.push(status);
        }
        // A start counts nothing (ADR 0083 item 18, 2026-10-15): the three
        // free failures are the three wrong secrets, the fourth waits.
        assert_eq!(statuses, [410, 410, 410]);
        let (status, _) = crate::tests::post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": "not the secret" }),
            None,
        )
        .await;
        assert_eq!(status, 429);
        let (status, right) = crate::tests::post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
        assert_eq!((status, &right["pending"]), (200, &json!(true)), "{right}");
    });
}

/// A household pairing its devices in one evening is never delayed: only
/// failed attempts grow the delay of the `device:` key, not the starts and
/// the pairings that succeed (ADR 0083 item 18, decided 2026-10-15).
#[test]
fn pairings_that_succeed_do_not_grow_the_delay() {
    block_on(async {
        let r = start().await;
        for i in 0..6 {
            let (status, started) =
                crate::tests::post(&r, "/api/device/start", json!({ "device": "Mac" }), None).await;
            assert_eq!(status, 200, "start {}", i + 1);
            // The code is answered: its poll, once approved, ends it.
            let code = started["code"].as_str().unwrap().to_owned();
            lock_remove(&r, &code);
            assert!(
                r.server.limiter.wait("device:127.0.0.1").is_zero(),
                "after start {}",
                i + 1
            );
        }
    });
}

fn lock_remove(r: &crate::tests::Running, code: &str) {
    verso_service::lock(&r.server.devices).remove(code);
}

/// The mail routes take a second key, the e-mail mailed to (ADR 0083
/// item 8, F11): a mailbox is not flooded from many addresses, each
/// within its own delay.
#[test]
fn a_mailbox_is_not_flooded_from_many_addresses() {
    block_on(async {
        let r = start_with(|c| {
            c.trusted_proxy = crate::proxy::Proxies::parse("127.0.0.1").unwrap();
            c.public_url = Some("@self-https".into());
        })
        .await;
        let _ = r
            .server
            .mail
            .set(crate::mail::Mail::Memory(std::sync::Mutex::new(Vec::new())));
        let client = reqwest::Client::new();
        let ask = |route: &'static str, email: &'static str, from: String| {
            client
                .post(r.url(route))
                .header("origin", r.origin().replacen("http://", "https://", 1))
                .header("x-forwarded-for", from)
                // As a proxy in front of TLS says it: through a trusted
                // proxy this header alone says the request came over
                // HTTPS (the cookie's `Secure`, the origin's scheme).
                .header("x-forwarded-proto", "https")
                .json(&json!({ "email": email }))
                .send()
        };
        for route in ["/api/forgot", "/api/signin/link"] {
            let mut statuses = Vec::new();
            for i in 1..=4 {
                let res = ask(route, "admin@casa.lan", format!("198.51.100.{i}"))
                    .await
                    .unwrap();
                statuses.push(res.status().as_u16());
            }
            assert_eq!(statuses, [200, 200, 200, 429], "{route}");
            // Another mailbox, from another address, is not behind it.
            let other = ask(route, "ana@casa.lan", "198.51.100.9".to_owned())
                .await
                .unwrap();
            assert_eq!(other.status().as_u16(), 200, "{route}");
            r.server.limiter.succeeded("mail:admin@casa.lan");
        }
    });
}

/// The filter the packages install for fail2ban (ADR 0083 item 1).
const FAIL2BAN_FILTER: &str = include_str!("../../../packaging/server/fail2ban/universo.conf");

/// The filter's `failregex`, as fail2ban reads it — its configuration
/// reader trims the value — with `<HOST>`, `<ADDR>`, `<SUBNET>`, `<IP4>`
/// and `<IP6>` expanded as fail2ban 1.1 expands them
/// (fail2ban/server/failregex.py, `R_HOST` and `RH4TAG`, and ipdns.py,
/// `IP_4_RE` and `IP_6_RE`). The one change: Python's
/// look-behind `(?<=:)` before IPv6's last `:` is dropped, which the
/// `regex` crate has not; it always holds there, since every repetition
/// before it ends in `:`.
fn fail2ban_regex(filter: &str) -> regex::Regex {
    let failregex = filter
        .lines()
        .find_map(|l| l.strip_prefix("failregex"))
        .and_then(|l| l.trim_start().strip_prefix('='))
        .unwrap()
        .trim();
    let ip4 = r"(?:::f{4,6}:)?(?P<ip4>(?:\d{1,3}\.){3}\d{1,3})";
    let ip6 = r"(?P<ip6>(?:[0-9a-fA-F]{1,4}::?|:){1,7}(?:[0-9a-fA-F]{1,4}|:))";
    let dns = r"(?P<dns>[\w\-.^_]*\w)";
    let addr = format!(r"\[?(?:{ip4}|{ip6})\]?");
    let host = format!(r"(?:{addr}|{dns})");
    let subnet = format!(r"\[?(?:{ip4}|{ip6})(?:/(?P<cidr>\d+))?\]?");
    let expanded = failregex
        .replace("<HOST>", &host)
        .replace("<ADDR>", &addr)
        .replace("<SUBNET>", &subnet)
        .replace("<IP4>", ip4)
        .replace("<IP6>", ip6);
    regex::Regex::new(&expanded).unwrap()
}

/// What fail2ban sees of one line the server wrote, in the two ways a host
/// gives it the log (fail2ban/server/filter.py, `processLine`, and
/// filtersystemd.py, `formatJournalEntry`): from a file, the time it finds
/// cut out of the line; from systemd's journal, the host's name and the
/// program's before the message, the journal's own time apart.
fn as_fail2ban_sees(line: &str) -> [String; 2] {
    let stamp = line.split(' ').next().unwrap_or("");
    [
        line[stamp.len()..].to_owned(),
        format!("verso-host universo[4242]: {line}"),
    ]
}

/// The address each of `lines` bans, by the filter, in each way it is read;
/// `None` for a line it lets pass.
pub(crate) fn banned(lines: &[String]) -> Vec<[Option<String>; 2]> {
    let re = fail2ban_regex(FAIL2BAN_FILTER);
    lines
        .iter()
        .map(|line| {
            as_fail2ban_sees(line).map(|seen| {
                re.captures(&seen).map(|c| {
                    let ip = c.name("ip4").or_else(|| c.name("ip6")).unwrap().as_str();
                    match c.name("cidr") {
                        Some(cidr) => format!("{ip}/{}", cidr.as_str()),
                        None => ip.to_owned(),
                    }
                })
            })
        })
        .collect()
}

/// fail2ban's filter catches exactly the refused sign-ins, IPv4 and IPv6
/// (its /64, as the server keys it), in a log file and in the journal; a
/// window's own line saying the same words, and the limiter's line, pass;
/// so does a line naming any other range — `0.0.0.0/0` would ban everyone,
/// a /48 or a /24 more than the server ever counts as one (ADR 0083 item 1).
#[test]
fn the_fail2ban_filter_catches_exactly_the_refused_sign_ins() {
    let lines: Vec<String> = [
        "2026-10-13T12:00:00Z WARN sign-in failed from 203.0.113.9 for a***@example.org (3 in a row)",
        "2026-10-13T12:00:01Z WARN sign-in failed from 2001:db8:1:2::/64 for b***@example.org (1 in a row)",
        "2026-10-13T12:00:02Z WARN sign-in limited from 203.0.113.9",
        "2026-10-13T12:00:03Z WARN window 7 (acc1): sign-in failed from 198.51.100.7 for c***@example.org (1 in a row)",
        "2026-10-13T12:00:04Z INFO window 7 (acc1): WARN sign-in failed from 198.51.100.8 for c***@example.org (1 in a row)",
        "2026-10-13T12:00:05Z INFO the first admin was made from the setup link",
        "2026-10-13T12:00:06Z WARN sign-in failed from 0.0.0.0/0 for d***@example.org (1 in a row)",
        "2026-10-13T12:00:07Z WARN sign-in failed from 2001:db8:1::/48 for e***@example.org (1 in a row)",
        "2026-10-13T12:00:08Z WARN sign-in failed from 203.0.113.0/24 for f***@example.org (1 in a row)",
        "2026-10-13T12:00:09Z WARN sign-in failed from 2001:db8:1:2::1 for g***@example.org (1 in a row)",
    ]
    .map(str::to_owned)
    .to_vec();
    let seen = banned(&lines);
    let both = |a: &str| [Some(a.to_owned()), Some(a.to_owned())];
    assert_eq!(
        seen,
        vec![
            both("203.0.113.9"),
            both("2001:db8:1:2::/64"),
            [None, None],
            [None, None],
            [None, None],
            [None, None],
            [None, None],
            [None, None],
            [None, None],
            [None, None],
        ]
    );
}

/// A refused sign-in is one line of the log, in the fixed format the host's
/// tools read, for an e-mail with an account and for one without, alike;
/// the limiter's refusal is said once; a window cannot write a line the
/// filter takes for a refused sign-in (ADR 0083 item 1).
#[test]
fn a_refused_sign_in_is_one_line_for_the_hosts_tools() {
    block_on(async {
        let r = start().await;
        r.server
            .db
            .create_account(
                "ana@f2b-known.example",
                "Ana",
                "pt",
                Some("a senha certa da ana"),
                false,
            )
            .unwrap();
        let wrong = |email: &'static str| {
            crate::tests::post(
                &r,
                "/api/signin",
                json!({ "email": email, "password": "uma senha errada" }),
                None,
            )
        };
        assert_eq!(wrong("ana@f2b-known.example").await.0, 401);
        assert_eq!(wrong("Ana@F2B-known.example").await.0, 401);
        assert_eq!(wrong("ninguem@f2b-unknown.example").await.0, 401);
        // The fourth from this address waits: refused, and said.
        assert_eq!(wrong("ana@f2b-known.example").await.0, 429);
        let failed: Vec<String> = crate::log::said("f2b-")
            .into_iter()
            .filter(|l| !l.contains("window"))
            .collect();
        assert_eq!(
            failed,
            vec![
                "WARN sign-in failed from 127.0.0.1 for a***@f2b-known.example (1 in a row)",
                "WARN sign-in failed from 127.0.0.1 for a***@f2b-known.example (2 in a row)",
                "WARN sign-in failed from 127.0.0.1 for n***@f2b-unknown.example (1 in a row)",
            ]
        );
        assert!(!crate::log::said("WARN sign-in limited from 127.0.0.1").is_empty());
        // A window's line in the same words: prefixed, never taken for one.
        // (The address's delay is not this part's subject.)
        r.server.limiter.succeeded("in:127.0.0.1");
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        let forged = "sign-in failed from 198.51.100.66 for f***@f2b-forged.example (1 in a row)";
        for level in ["WARN", "INFO"] {
            crate::tests::call(
                &mut ws,
                1,
                "log_write",
                json!({ "level": level, "message": forged }),
            )
            .await;
        }
        let windows = crate::log::said("f2b-forged.example");
        assert_eq!(windows.len(), 2, "{windows:?}");
        assert!(
            windows
                .iter()
                .all(|l| l.contains(" window ") && !l.starts_with("WARN sign-in")),
            "{windows:?}"
        );
        // The filter, over the lines as the log wrote them: the three
        // refusals, and nothing of the window's.
        let stamped = |l: &String| format!("{} {l}", crate::log::stamp());
        let all: Vec<String> = failed.iter().chain(&windows).map(stamped).collect();
        let hits: Vec<_> = banned(&all).into_iter().flatten().flatten().collect();
        assert_eq!(hits, vec!["127.0.0.1"; 6], "{all:?}");
        // A device's poll with a wrong secret: a refusal under no e-mail.
        let (_, started) =
            crate::tests::post(&r, "/api/device/start", json!({ "device": "f2b" }), None).await;
        let code = started["code"].as_str().unwrap();
        let (status, _) = crate::tests::post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": "not-the-secret" }),
            None,
        )
        .await;
        assert_eq!(status, 410);
        let device = crate::log::said("WARN sign-in failed from 127.0.0.1 for - (");
        assert!(!device.is_empty());
        assert_eq!(
            banned(&device.iter().map(stamped).collect::<Vec<_>>())[0],
            [Some("127.0.0.1".to_owned()), Some("127.0.0.1".to_owned())]
        );
    });
}
