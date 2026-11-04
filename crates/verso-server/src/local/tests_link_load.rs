// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A player's window loading cold through the internet link (ADR 0117 D3
//! item 3; the test of 2026-11-04): `cloudflared` opens a connection to
//! the link's listener per request in flight and keeps it alive, some 50
//! at once for one window's 74 files. Every one is served — a refused one
//! is a 502 at Cloudflare and a window that does not open — and the idle
//! ones are given back in seconds, while the network and the owner's
//! window are served beside them. See `tests.rs` for the lab.

use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use super::tests::{lab, run};

const NAME: &str = "abstract-simpson-player.trycloudflare.com";
const ORIGIN: &str = "https://abstract-simpson-player.trycloudflare.com";

/// A cold load's connections, as `cloudflared` opened them in the test.
const BURST: usize = 80;

/// A file of the window asked on `stream` as the tunnel asks it, for the
/// player at `client`, the connection kept alive: the answer's status, its
/// body read whole.
async fn ask_on(stream: &mut TcpStream, n: usize, client: &str) -> u16 {
    let request = format!(
        "GET /assets/chunk-{n}.js HTTP/1.1\r\nHost: {NAME}\r\nX-Forwarded-For: {client}\r\nX-Forwarded-Proto: https\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).await.is_err() {
        return 0;
    }
    let mut got = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        let Ok(n) = stream.read(&mut buf).await else {
            return 0;
        };
        if n == 0 {
            return 0;
        }
        got.extend_from_slice(&buf[..n]);
        let text = String::from_utf8_lossy(&got);
        if let Some(end) = text.find("\r\n\r\n") {
            let head = &text[..end];
            let length: usize = head
                .lines()
                .find_map(|l| {
                    let (k, v) = l.split_once(':')?;
                    k.eq_ignore_ascii_case("content-length")
                        .then(|| v.trim().parse().ok())?
                })
                .unwrap_or(0);
            if got.len() >= end + 4 + length {
                return head
                    .split(' ')
                    .nth(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            }
        }
    }
}

/// One player's cold load: [`BURST`] connections opened together, each
/// asked one file. The statuses, and the connections, kept alive.
async fn cold_load(port: u16, client: String) -> (Vec<u16>, Vec<TcpStream>) {
    let mut streams = Vec::new();
    for _ in 0..BURST {
        streams.push(TcpStream::connect(("127.0.0.1", port)).await.unwrap());
    }
    let asked = streams.into_iter().enumerate().map(|(n, mut s)| {
        let client = client.clone();
        tokio::spawn(async move { (ask_on(&mut s, n, &client).await, s) })
    });
    let mut statuses = Vec::new();
    let mut kept = Vec::new();
    for done in asked {
        let (status, s) = done.await.unwrap();
        statuses.push(status);
        kept.push(s);
    }
    (statuses, kept)
}

/// One window's cold load is served whole through the link, its 80
/// connections held at once; five at once too, from five players; and
/// the connections they leave open are closed once idle.
#[test]
fn players_loading_cold_through_the_link_are_served_every_file() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let (one, mut kept) = cold_load(port, "203.0.113.9".to_owned()).await;
        assert_eq!(one, vec![200; BURST], "one window's cold load");
        // Idle past the link's wait, every connection is given back.
        tokio::time::sleep(crate::listen::LINK_IDLE + Duration::from_millis(500)).await;
        for s in &mut kept {
            let mut byte = [0u8; 1];
            let read = tokio::time::timeout(Duration::from_secs(2), s.read(&mut byte)).await;
            assert!(matches!(read, Ok(Ok(0)) | Ok(Err(_))), "closed once idle");
        }
        drop(kept);
        let five = (1..=5).map(|p| tokio::spawn(cold_load(port, format!("203.0.113.{p}"))));
        let mut held = Vec::new();
        for (p, load) in five.enumerate() {
            let (statuses, kept) = tokio::time::timeout(Duration::from_secs(30), load)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(statuses, vec![200; BURST], "player {p} of five at once");
            held.push(kept);
        }
        drop(held);
    });
}

/// With every place of the link's listener held, a phone on the network
/// and the owner's window at the table are still answered.
#[test]
fn a_busy_link_leaves_the_network_and_the_seat_served() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let mut held = Vec::new();
        for _ in 0..crate::listen::LOCAL_LINK + 16 {
            held.push(TcpStream::connect(("127.0.0.1", port)).await.unwrap());
        }
        let (status, _) = lab.get("/api/state", None).await;
        assert_eq!(status, 200, "the network, the link full");
        let seat = lab.local.sit(&lab.notes.path().join("Campanha")).unwrap();
        let state = seat.request("GET", "/api/state", None).unwrap();
        assert_eq!(state.status, 200, "the seat, the link full");
        drop(held);
    });
}
