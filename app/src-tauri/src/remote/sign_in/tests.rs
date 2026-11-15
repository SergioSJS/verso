// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The wait for a device's sign-in against a stand-in server (review I1
//! and M1, 2026-11-15): every end is told to the windows, and a sign-in
//! kept wakes the folders that sync with the server.

use std::time::Duration;

use tauri::Listener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use super::*;

/// A server that answers every `/api/device/poll` with `status` and `body`.
fn polled(status: &'static str, body: Value) -> String {
    let listener =
        tauri::async_runtime::block_on(tokio::net::TcpListener::bind("127.0.0.1:0")).unwrap();
    let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
    tauri::async_runtime::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let body = body.to_string();
            tauri::async_runtime::spawn(async move {
                // The request, its head and its body, read before answering.
                let mut request = Vec::new();
                let mut buf = [0_u8; 4096];
                loop {
                    let Ok(n) = stream.read(&mut buf).await else {
                        return;
                    };
                    if n == 0 {
                        return;
                    }
                    request.extend_from_slice(&buf[..n]);
                    let text = String::from_utf8_lossy(&request).to_string();
                    if let Some((head, rest)) = text.split_once("\r\n\r\n") {
                        let length = head
                            .lines()
                            .find_map(|l| {
                                let (k, v) = l.split_once(':')?;
                                k.eq_ignore_ascii_case("content-length")
                                    .then(|| v.trim().parse::<usize>().ok())
                                    .flatten()
                            })
                            .unwrap_or(0);
                        if rest.len() >= length {
                            break;
                        }
                    }
                }
                let answer = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(answer.as_bytes()).await;
            });
        }
    });
    url
}

/// An app with a folder that syncs with `url`, and what it heard of
/// `event`.
fn app_hearing(
    url: &str,
    event: &str,
) -> (
    tauri::App<tauri::test::MockRuntime>,
    tempfile::TempDir,
    Arc<crate::sync::Syncer>,
    std::sync::mpsc::Receiver<String>,
) {
    let config = tempfile::tempdir().unwrap();
    let app = tauri::test::mock_builder()
        .manage(App {
            service: Service::new(Some(config.path().to_path_buf())),
            ..App::new(None)
        })
        .build(crate::context())
        .unwrap();
    let state = verso_core::sync::State {
        server: url.to_owned(),
        folder: "f".into(),
        ..Default::default()
    };
    let s = crate::sync::Syncer::new("pasta", &state);
    lock(&app.state::<App>().syncs).insert("pasta".into(), Arc::clone(&s));
    let (tx, rx) = std::sync::mpsc::channel();
    app.listen_any(event.to_owned(), move |e| {
        let _ = tx.send(e.payload().to_owned());
    });
    (app, config, s, rx)
}

fn started(url: &str) -> Started {
    Started {
        url: url.to_owned(),
        code: "ABCD-EFGH".into(),
        poll: "segredo".into(),
        interval: 1,
        life: 600,
    }
}

/// The person said it was not them on the server's page: the server
/// forgets the code (`410 link_gone`), and the window hears `refused` —
/// before, the loop ended in silence and the window waited forever.
#[test]
fn a_sign_in_refused_on_the_page_is_told_to_the_window() {
    let url = polled(
        "410 Gone",
        json!({ "error": "link_gone", "message": "this code is used or expired" }),
    );
    let (app, config, s, heard) = app_hearing(&url, "server-sign-in-failed");
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(follow(
        handle,
        Some(config.path().to_path_buf()),
        started(&url),
    ));
    let said: Value =
        serde_json::from_str(&heard.recv_timeout(Duration::from_secs(10)).unwrap()).unwrap();
    assert_eq!(said, json!({ "url": url, "why": "refused" }));
    assert!(!s.was_asked());
    // The server's own word for a code past its minutes: `expired`.
    let late = polled(
        "410 Gone",
        json!({ "error": "link_gone", "message": "this code expired" }),
    );
    let (app, config, _, heard) = app_hearing(&late, "server-sign-in-failed");
    tauri::async_runtime::spawn(follow(
        app.handle().clone(),
        Some(config.path().to_path_buf()),
        started(&late),
    ));
    let said: Value =
        serde_json::from_str(&heard.recv_timeout(Duration::from_secs(10)).unwrap()).unwrap();
    assert_eq!(said["why"], "expired");
}

/// An answer the app cannot read as a sign-in is `failed`, not silence.
#[test]
fn an_answer_with_no_token_fails_in_words() {
    let url = polled("200 OK", json!({ "something": "else" }));
    let (app, config, _, heard) = app_hearing(&url, "server-sign-in-failed");
    tauri::async_runtime::spawn(follow(
        app.handle().clone(),
        Some(config.path().to_path_buf()),
        started(&url),
    ));
    let said: Value =
        serde_json::from_str(&heard.recv_timeout(Duration::from_secs(10)).unwrap()).unwrap();
    assert_eq!(said["why"], "failed");
}

/// Signed in again: the sign-in is kept, the window hears it, and the
/// folder that syncs with that server tries at once (review M1) instead of
/// waiting for its five-minute scan.
#[test]
fn a_sign_in_kept_wakes_the_folders_that_sync_with_the_server() {
    let url = polled(
        "200 OK",
        json!({ "token": "um token", "account": { "email": "ana@casa.lan", "name": "Ana" } }),
    );
    let (app, config, s, heard) = app_hearing(&url, "server-signed-in");
    tauri::async_runtime::spawn(follow(
        app.handle().clone(),
        Some(config.path().to_path_buf()),
        started(&url),
    ));
    let said: Value =
        serde_json::from_str(&heard.recv_timeout(Duration::from_secs(10)).unwrap()).unwrap();
    assert_eq!(said["email"], "ana@casa.lan");
    assert!(s.was_asked(), "the folder's sync was not woken");
    let kept = servers::find(Some(config.path()), &url).unwrap().unwrap();
    assert_eq!(kept.token, "um token");
}
