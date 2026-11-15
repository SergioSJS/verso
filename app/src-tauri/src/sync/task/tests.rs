// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The sync's task against a stand-in server (review I2, I3, I6 and I5 of
//! 2026-11-15): a connection that fails on its first pass waits its turn,
//! a proxy whose server is down is out of reach and tried on the growing
//! wait, a phone's hold stops a pass between two files, and a state that
//! does not read is said as that.

use std::io::Write;
use std::sync::atomic::AtomicU32;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_tungstenite::tungstenite::Message;

use super::*;
use crate::tests_sync::{device, device_at, read, serve, sync};

/// A server that lists the folder `f` — answering 502 with a proxy's page
/// the first `down` times, as Cloudflare does with its origin gone — and
/// opens it over the WebSocket, then closes the socket at `sync_state`, as
/// an answer over the frame's limit did. Counts the listings: one per link.
fn closing_at_sync_state(down: u32) -> (String, Arc<AtomicU32>) {
    let listener =
        tauri::async_runtime::block_on(tokio::net::TcpListener::bind("127.0.0.1:0")).unwrap();
    let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
    let links = Arc::new(AtomicU32::new(0));
    let counted = Arc::clone(&links);
    tauri::async_runtime::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let counted = Arc::clone(&counted);
            tauri::async_runtime::spawn(async move {
                let mut head = [0_u8; 32];
                let n = stream.peek(&mut head).await.unwrap_or(0);
                if head[..n].starts_with(b"GET /api/folders") {
                    let mut request = Vec::new();
                    let mut buf = [0_u8; 1024];
                    while !request.windows(4).any(|w| w == b"\r\n\r\n") {
                        let n = stream.read(&mut buf).await.unwrap();
                        request.extend_from_slice(&buf[..n]);
                    }
                    let nth = counted.fetch_add(1, Ordering::Relaxed);
                    let (status, kind, body) = if nth < down {
                        (
                            "502 Bad Gateway",
                            "text/html",
                            "<html>Bad gateway</html>".to_owned(),
                        )
                    } else {
                        let folders = json!({ "folders": [{ "id": "f", "name": "Campanha", "role": "owner" }] });
                        ("200 OK", "application/json", folders.to_string())
                    };
                    let answer = format!(
                        "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = stream.write_all(answer.as_bytes()).await;
                    return;
                }
                let Ok(mut ws) = tokio_tungstenite::accept_async(stream).await else {
                    return;
                };
                let hello = json!({ "hello": {
                    "version": env!("CARGO_PKG_VERSION"),
                    "commit": "abc1234",
                    "contract": crate::compat::contract_version(),
                    "contractVersion": verso_contract::compat::VERSION,
                    "sync": engine::PROTOCOL,
                }});
                let _ = ws.send(Message::Text(hello.to_string().into())).await;
                while let Some(Ok(m)) = ws.next().await {
                    let Message::Text(text) = m else { continue };
                    let asked: Value = serde_json::from_str(&text).unwrap_or_default();
                    if asked["cmd"] == "sync_state" {
                        // The socket closes under the answer.
                        return;
                    }
                    let answer = json!({ "id": asked["id"], "ok": {} });
                    let _ = ws.send(Message::Text(answer.to_string().into())).await;
                }
            });
        }
    });
    (url, links)
}

/// A link whose first pass fails on the connection is not a success: the
/// next link waits the growing wait (200 ms, 400, 800… in the tests), not
/// at once in a loop — which, before, connected again hundreds of times a
/// minute.
#[test]
fn a_link_whose_pass_fails_on_the_connection_waits_its_turn() {
    let (url, links) = closing_at_sync_state(0);
    let d = device_at(&url, "f", "um token", &[]);
    tauri::async_runtime::spawn(super::run(Arc::clone(&d.ctx), Arc::clone(&d.s)));
    std::thread::sleep(Duration::from_millis(1700));
    d.s.stop();
    let n = links.load(Ordering::Relaxed);
    // At 0, 0.2, 0.6 and 1.4 s, give or take a link's own time.
    assert!((2..=5).contains(&n), "{n} links in 1.7 s");
    let last = lock(&d.shown).last().cloned().unwrap();
    assert_eq!(last.state, "offline", "{last:?}");
}

/// A proxy's 502 (its server down) is the server out of reach, by its
/// address — said as that, and tried again on the growing wait, not in
/// five minutes: the sync is back on the next try that is answered.
#[test]
fn a_proxys_502_is_out_of_reach_and_tried_again_soon() {
    let (url, links) = closing_at_sync_state(1);
    let d = device_at(&url, "f", "um token", &[]);
    tauri::async_runtime::spawn(super::run(Arc::clone(&d.ctx), Arc::clone(&d.s)));
    // Tried again within the first waits (200 ms, then 400), and connected:
    // the pass began.
    let begun = Instant::now();
    while !lock(&d.shown).iter().any(|s| s.state == "syncing") {
        assert!(begun.elapsed() < Duration::from_secs(10), "not tried again");
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(
        begun.elapsed() < Duration::from_secs(3),
        "{:?}",
        begun.elapsed()
    );
    d.s.stop();
    assert!(links.load(Ordering::Relaxed) >= 2);
    let shown = lock(&d.shown).clone();
    let down = shown
        .iter()
        .find(|s| s.state == "offline")
        .expect("said offline");
    assert_eq!(down.problem.as_deref(), Some("unreachable"), "{down:?}");
    assert_eq!(down.message.as_deref(), Some(reach::address(&url).as_str()));
}

/// A proxy's answers are out of reach; the server's own 503 (`busy`, with
/// its `error`) stays its answer.
#[test]
fn a_proxys_answer_is_unreachable_the_servers_own_is_not() {
    for status in [502, 503, 504, 520, 522, 530] {
        assert_eq!(
            remote::error_of(status, &Value::Null).kind,
            ErrorKind::Unreachable,
            "{status}"
        );
    }
    let busy = json!({ "error": "busy", "message": "the server is busy" });
    assert_eq!(remote::error_of(503, &busy).kind, ErrorKind::Failed);
    assert_eq!(remote::error_of(500, &Value::Null).kind, ErrorKind::Failed);
}

/// A phone's background sync held meanwhile (Wi-Fi lost, the charger
/// unplugged): the pass stops before its next file, says it is paused,
/// and the rest crosses once nothing holds it.
#[test]
fn a_hold_met_during_a_pass_stops_it_before_the_next_file() {
    let r = serve(&[("a.md", "a"), ("b.md", "b"), ("c.md", "c")]);
    let d = device(&r, &r.owner, &[]);
    // The pass's first look, then the first file's: held at the second's.
    d.s.hold_after.store(2, Ordering::Relaxed);
    let first = sync(&d);
    assert_eq!(first.actions, 1, "{first:?}");
    let arrived = |d: &crate::tests_sync::Device| {
        ["a.md", "b.md", "c.md"]
            .into_iter()
            .filter(|p| read(d, p).is_some())
            .count()
    };
    assert_eq!(arrived(&d), 1);
    assert_eq!(lock(&d.shown).last().unwrap().state, "paused");
    d.s.hold_after.store(usize::MAX, Ordering::Relaxed);
    sync(&d);
    assert_eq!(arrived(&d), 3);
}

/// A saved state that does not read is set aside, and the folder's status
/// says so — off, its problem `state_unreadable`, the file named — rather
/// than "never synced".
#[test]
fn an_unreadable_state_is_said_with_the_file_set_aside() {
    let config = tempfile::tempdir().unwrap();
    let mut f = tempfile::Builder::new()
        .prefix("sync-pasta.json")
        .rand_bytes(0)
        .tempfile_in(config.path())
        .unwrap();
    f.write_all(b"{ cut short").unwrap();
    f.keep().unwrap();
    let st = off_status(Some(config.path()), "pasta");
    assert_eq!(st.state, "off");
    assert_eq!(st.problem.as_deref(), Some("state_unreadable"), "{st:?}");
    let message = st.message.unwrap_or_default();
    assert!(
        message.contains("set aside as sync-pasta.json.unreadable-"),
        "{message}"
    );
    // Asked again, the stand-in is read: still said, not forgotten.
    let again = off_status(Some(config.path()), "pasta");
    assert_eq!(again.problem.as_deref(), Some("state_unreadable"));
    // A folder that never synced has no problem.
    assert_eq!(off_status(Some(config.path()), "outra").problem, None);
}

/// On reconnecting, a version this app does not follow is told from a
/// session the server ended (review M1): the window hears `version`, to
/// update one side, not "sign in again".
#[test]
fn a_version_refused_is_not_a_session_ended() {
    let far = json!({ "version": "9.0.0", "commit": "abc1234", "contractVersion": verso_contract::compat::VERSION + 2 });
    let version = crate::compat::contract_refused(&far).unwrap();
    assert!(crate::compat::is_behind(&version), "{version:?}");
    let sync = json!({ "sync": 3, "syncRefused": "this app speaks sync 1" });
    let why = crate::compat::sync_refused(&sync).unwrap();
    assert!(crate::compat::is_behind(&refused(why)));
    let ended = refused("the server ended this device's session: sign in again");
    assert!(!crate::compat::is_behind(&ended));
    assert_eq!(problem_of(&version, false), "version");
}
