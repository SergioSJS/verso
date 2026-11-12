// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A window of the desktop app on a server's folder (ADR 0073 item 2; the
//! maintainer's answer K): a real `verso serve` on this machine, a device
//! signed in to it, and the window's commands answered by the server.

use std::io::Write;

use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder};
use tauri::webview::InvokeRequest;

use super::*;

const ORIGIN: &str = if cfg!(windows) {
    "http://tauri.localhost"
} else {
    "tauri://localhost"
};

fn call(
    webview: &tauri::WebviewWindow<MockRuntime>,
    cmd: &str,
    body: Value,
) -> Result<Value, Value> {
    get_ipc_response(
        webview,
        InvokeRequest {
            cmd: cmd.to_owned(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: ORIGIN.parse().unwrap(),
            body: InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_owned(),
        },
    )
    .map(|b| b.deserialize::<Value>().unwrap())
}

struct Loopback;

/// A test server listens on the loopback and never runs the update check:
/// `VERSO_UPDATE_CHECK=off` through this table, not the process's
/// environment, so no test reaches GitHub's release feed.
impl verso_server::config::Env for Loopback {
    fn var(&self, name: &str) -> Option<String> {
        match name {
            "VERSO_LISTEN" => Some("127.0.0.1:0".to_owned()),
            "VERSO_UPDATE_CHECK" => Some("off".to_owned()),
            _ => None,
        }
    }
}

#[test]
fn a_window_on_a_servers_folder_is_answered_by_the_server() {
    // The server: a folder "Campanha" with a note, an account, a device.
    let data = tempfile::tempdir().unwrap();
    let folders = tempfile::tempdir().unwrap();
    let campanha = tempfile::Builder::new()
        .prefix("Campanha")
        .rand_bytes(0)
        .tempdir_in(folders.path())
        .unwrap();
    let mut file = tempfile::Builder::new()
        .prefix("Sessao.md")
        .rand_bytes(0)
        .tempfile_in(campanha.path())
        .unwrap();
    file.write_all(b"# Sessao\n").unwrap();
    let config = verso_server::config::Config::from_env(
        &Loopback,
        &verso_server::config::Defaults {
            data_dir: data.path().to_owned(),
            folders_dir: folders.path().to_owned(),
            ui_dir: data.path().join("ui"),
        },
    )
    .unwrap();
    assert!(
        !config.update_check,
        "a test server never asks the release feed"
    );
    let db = verso_server::db::Db::open(data.path()).unwrap();
    let account = db
        .create_account("ana@casa.lan", "Ana", "pt", Some("uma senha longa"), true)
        .unwrap();
    let folder = db.create_folder("Campanha", &account.id).unwrap();
    let (token, _) = db
        .create_session(&account.id, "device", "Verso · teste", "127.0.0.1")
        .unwrap();
    let server = verso_server::state::Server::new(
        config,
        db,
        verso_server::contract_version(),
        "test".into(),
    );
    let kept = std::sync::Arc::clone(&server);
    let (addr_tx, addr_rx) = std::sync::mpsc::channel();
    // Stopped when the test ends is let go (tests_sync::Running): a server left
    // running holds its descriptors until the test process ends.
    let (_stop, stopped) = tokio::sync::oneshot::channel::<()>();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            addr_tx.send(listener.local_addr().unwrap()).unwrap();
            tokio::select! {
                _ = verso_server::run(server, listener, std::future::pending()) => {}
                _ = stopped => {}
            }
        });
        rt.shutdown_background();
    });
    let addr = addr_rx.recv().unwrap();
    let url = format!("http://localhost:{}", addr.port());

    // The app, signed in to it.
    let app_config = tempfile::tempdir().unwrap();
    verso_core::servers::keep(
        Some(app_config.path()),
        verso_core::servers::ServerLogin {
            url: url.clone(),
            token,
            email: "ana@casa.lan".into(),
            name: "Ana".into(),
        },
    )
    .unwrap();
    let app = mock_builder()
        .manage(App {
            service: Service::new(Some(app_config.path().to_path_buf())),
            ..App::new(None)
        })
        .invoke_handler({
            let handler = commands_for!(MockRuntime).invoke_handler();
            move |invoke| match remote::forward(invoke) {
                None => true,
                Some(invoke) => handler(invoke),
            }
        })
        .build(context())
        .unwrap();
    hear(app.handle());
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();

    let accounts = call(&main, "server_accounts", json!({})).unwrap();
    assert_eq!(accounts[0]["email"], "ana@casa.lan");
    let folders = call(&main, "server_folders", json!({ "url": url })).unwrap();
    assert_eq!(folders["folders"][0]["name"], "Campanha");
    // The account may make folders (the maintainer, 2026-10-16): it is told
    // with the list, and the app makes one through the server.
    assert_eq!(folders["may_create"], true, "{folders}");
    let made = call(
        &main,
        "server_create_folder",
        json!({ "url": url, "name": "Nova" }),
    )
    .unwrap();
    assert_eq!(made["name"], "Nova");
    assert_eq!(made["role"], "owner");
    assert!(made["id"].as_str().is_some_and(|id| !id.is_empty()));
    // A name a folder has is refused, said by the server, never merged.
    let taken = call(
        &main,
        "server_create_folder",
        json!({ "url": url, "name": "Nova" }),
    )
    .unwrap_err();
    assert_eq!(taken["kind"], "failed", "{taken}");
    let after = call(&main, "server_folders", json!({ "url": url })).unwrap();
    assert_eq!(after["folders"].as_array().unwrap().len(), 2, "{after}");
    let info = call(
        &main,
        "server_open",
        json!({ "url": url, "folder": folder.id }),
    )
    .unwrap();
    assert_eq!(info["name"], "Campanha");
    // The folder's commands go to the server.
    assert_eq!(
        call(&main, "list_notes", json!({})).unwrap(),
        json!(["Sessao.md"])
    );
    let caps = call(&main, "capabilities", json!({})).unwrap();
    assert_eq!(caps["host"], "server");
    // The server's folder, with this app's own abilities beside it.
    let has = |what: &str| caps["can"].as_array().unwrap().iter().any(|c| c == what);
    assert!(
        has("write") && has("windows") && has("updates") && has("local_folders"),
        "{caps}"
    );
    assert!(
        !has("reveal") && !has("copy_path") && !has("agents"),
        "{caps}"
    );
    // The desktop host captures audio for the table, whatever the folder's
    // side (ADR 0116 item 27).
    assert!(has("audio_share"), "{caps}");
    // How far the server is, measured on this side.
    assert!(caps["latency_ms"].is_u64(), "{caps}");
    let note = call(&main, "read_note", json!({ "path": "Sessao.md" })).unwrap();
    let written = call(
        &main,
        "write_note",
        json!({ "path": "Sessao.md", "text": "# Sessao\n\npelo app\n", "revision": note["revision"] }),
    )
    .unwrap();
    assert!(
        written["note"]["text"]
            .as_str()
            .unwrap()
            .contains("pelo app")
    );
    // A refusal of the server comes back as the app's own would.
    let refused = call(&main, "read_note", json!({ "path": "../fora.md" })).unwrap_err();
    assert_eq!(refused["kind"], "refused", "{refused}");
    // The app's own commands stay the app's.
    assert!(call(&main, "app_info", json!({})).is_ok());
    // The person names this computer (ADR 0079 item 8, ADR 0074 item 8):
    // the name wins over the system's here, and the server's session of
    // this device takes it at once.
    let named = call(
        &main,
        "set_device_name",
        json!({ "name": " Estúdio da Ana " }),
    )
    .unwrap();
    assert_eq!(named["device"]["name"], "Estúdio da Ana", "{named}");
    assert_eq!(named["device"]["custom"], true);
    assert_eq!(named["unreached"], json!([]), "{named}");
    assert_eq!(
        call(&main, "app_info", json!({})).unwrap()["device"],
        "Estúdio da Ana"
    );
    assert_eq!(device::name(Some(app_config.path())), "Estúdio da Ana");
    assert_eq!(
        device::session_name(Some(app_config.path())),
        "Verso · Estúdio da Ana"
    );
    let sessions = kept.db.sessions_of(&account.id).unwrap();
    assert_eq!(sessions[0].device, "Verso · Estúdio da Ana");
    // Nothing in it: the system's name again, told to the server too.
    let back = call(&main, "set_device_name", json!({ "name": "" })).unwrap();
    assert_eq!(back["device"]["custom"], false);
    assert_eq!(back["device"]["name"], back["device"]["system"]);
    assert_eq!(
        call(&main, "device_name", json!({})).unwrap(),
        back["device"]
    );
    assert_eq!(
        kept.db.sessions_of(&account.id).unwrap()[0].device,
        format!("Verso · {}", device::system())
    );
    // A folder of this computer again: the window leaves the server.
    remote::release(app.handle(), "main");
    assert_eq!(
        call(&main, "list_notes", json!({})).unwrap_err()["kind"],
        "no_folder"
    );
}

/// A question asked on a connection that closed between two questions —
/// the reader ended, the writer still waiting for something to send —
/// fails at once as unavailable, so sync says offline and connects again.
/// Before, it was sent through the writer and waited for an answer no one
/// would give: the live campaign's Linux device stayed "syncing" for 40
/// minutes (2026-10-11).
#[test]
fn a_question_on_a_connection_closed_between_questions_fails_at_once() {
    use std::time::Duration;

    let data = tempfile::tempdir().unwrap();
    let folders = tempfile::tempdir().unwrap();
    let _campanha = tempfile::Builder::new()
        .prefix("Campanha")
        .rand_bytes(0)
        .tempdir_in(folders.path())
        .unwrap();
    let config = verso_server::config::Config::from_env(
        &Loopback,
        &verso_server::config::Defaults {
            data_dir: data.path().to_owned(),
            folders_dir: folders.path().to_owned(),
            ui_dir: data.path().join("ui"),
        },
    )
    .unwrap();
    let db = verso_server::db::Db::open(data.path()).unwrap();
    let account = db
        .create_account("ana@casa.lan", "Ana", "pt", Some("uma senha longa"), true)
        .unwrap();
    let folder = db.create_folder("Campanha", &account.id).unwrap();
    let (token, _) = db
        .create_session(&account.id, "device", "Verso · teste", "127.0.0.1")
        .unwrap();
    let server = verso_server::state::Server::new(
        config,
        db,
        verso_server::contract_version(),
        "test".into(),
    );
    // A server that can be stopped: its runtime dropped, every connection
    // with it.
    let (addr_tx, addr_rx) = std::sync::mpsc::channel();
    let (stop_tx, stop_rx) = tokio::sync::oneshot::channel::<()>();
    let stopped = std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            addr_tx.send(listener.local_addr().unwrap()).unwrap();
            tokio::select! {
                _ = verso_server::run(server, listener, std::future::pending()) => {}
                _ = stop_rx => {}
            }
        });
        rt.shutdown_timeout(Duration::from_secs(2));
    });
    let addr = addr_rx.recv().unwrap();
    let login = verso_core::servers::ServerLogin {
        url: format!("http://localhost:{}", addr.port()),
        token,
        email: "ana@casa.lan".into(),
        name: "Ana".into(),
    };

    tauri::async_runtime::block_on(async move {
        let (remote, mut heard, _) = remote::dial_hello(&login, folder.id.clone()).await.unwrap();
        remote
            .call("open_server_folder", json!({ "id": folder.id }))
            .await
            .unwrap();
        // The server goes away while nothing is asked: the reader ends.
        stop_tx.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(10), async {
            while let Some(h) = heard.recv().await {
                if matches!(h, remote::Heard::Closed) {
                    return;
                }
            }
        })
        .await
        .expect("the closed connection is heard");
        // The next pass's first question.
        let answer = tokio::time::timeout(
            Duration::from_secs(10),
            remote.call("sync_state", json!({})),
        )
        .await
        .expect("a question on a closed connection does not wait forever");
        let e = answer.unwrap_err();
        assert_eq!(e["kind"], "unavailable", "{e}");
        assert_eq!(e["transport"], true, "{e}");
    });
    stopped.join().unwrap();
}

/// A WebSocket server on the loopback that says a hello and then either
/// answers pings — it reads, and its WebSocket answers on its own — or
/// reads nothing more, as a server whose machine went away without
/// closing the connection.
fn a_server_that(answers: bool) -> verso_core::servers::ServerLogin {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    let listener =
        tauri::async_runtime::block_on(tokio::net::TcpListener::bind("127.0.0.1:0")).unwrap();
    let port = listener.local_addr().unwrap().port();
    tauri::async_runtime::spawn(async move {
        let (stream, _) = listener.accept().await.unwrap();
        let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
        ws.send(Message::Text(json!({ "hello": {} }).to_string().into()))
            .await
            .unwrap();
        if answers {
            while let Some(Ok(_)) = ws.next().await {}
        } else {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
        drop(ws);
    });
    verso_core::servers::ServerLogin {
        url: format!("http://127.0.0.1:{port}"),
        token: "um token".into(),
        email: "ana@casa.lan".into(),
        name: "Ana".into(),
    }
}

/// A server gone silent without closing the connection is noticed by the
/// pings it leaves unanswered (R5 of 2026-10-11, the device's side): the
/// connection is heard closed — sync says offline and connects again —
/// and a question on it fails at once. One that answers its pings stays.
/// Pings go every second in the tests, every 30 in the app.
#[test]
fn a_server_that_answers_no_ping_is_heard_closed_and_one_that_does_stays() {
    use std::time::Duration;

    let silent = a_server_that(false);
    let alive = a_server_that(true);
    tauri::async_runtime::block_on(async move {
        let (remote, mut heard, _) = remote::dial_hello(&silent, "f".into()).await.unwrap();
        let (_kept, mut heard_alive, _) = remote::dial_hello(&alive, "f".into()).await.unwrap();
        tokio::time::timeout(Duration::from_secs(10), async {
            while let Some(h) = heard.recv().await {
                if matches!(h, remote::Heard::Closed) {
                    return;
                }
            }
        })
        .await
        .expect("a server that answers no ping is heard closed");
        let e = remote.call("sync_state", json!({})).await.unwrap_err();
        assert_eq!(e["kind"], "unavailable", "{e}");
        assert_eq!(e["transport"], true, "{e}");
        // Past the same pings, the one that answers them is still there.
        assert!(
            !matches!(heard_alive.try_recv(), Ok(remote::Heard::Closed)),
            "a server that answers its pings is kept"
        );
    });
}

/// "Sincronizar" with nothing asked first (the maintainer, 2026-10-16): a
/// folder named like one the server has gets a folder of its own, `(2)`;
/// and the first sync into that empty folder sends the local notes up and
/// leaves every local file as it was.
#[test]
fn a_new_server_folder_takes_a_free_name_and_the_first_sync_into_it_only_uploads() {
    use super::tests_sync::{device_at, files, serve, sync, text};

    let r = serve(&[]);
    // The server has "Campanha"; the local folder is named alike.
    let first = remote::make_folder(&r.url, &r.owner, "Campanha", false).unwrap_err();
    assert_eq!(first.kind, ErrorKind::Failed, "{first:?}");
    let made = remote::make_folder(&r.url, &r.owner, "Campanha", true).unwrap();
    assert_eq!(made["name"], "Campanha (2)", "{made}");
    let again = remote::make_folder(&r.url, &r.owner, "Campanha", true).unwrap();
    assert_eq!(again["name"], "Campanha (3)", "{again}");
    // Nothing the server had was touched: its folder is not the new one.
    assert_ne!(made["id"], json!(r.folder));

    let id = made["id"].as_str().unwrap();
    let a = device_at(
        &r.url,
        id,
        &r.owner,
        &[("Sessao.md", "# Sessao\n"), ("Notas/Ideia.md", "# Ideia\n")],
    );
    let passed = sync(&a);
    assert!(passed.actions >= 2, "{passed:?}");
    // Every local file as it was; none made, none removed.
    assert_eq!(files(&a), vec!["Notas/Ideia.md", "Sessao.md"]);
    assert_eq!(text(&a, "Sessao.md").as_deref(), Some("# Sessao\n"));
    assert_eq!(text(&a, "Notas/Ideia.md").as_deref(), Some("# Ideia\n"));
    // Another computer finds them on the server.
    let b = device_at(&r.url, id, &r.owner, &[]);
    sync(&b);
    assert_eq!(text(&b, "Notas/Ideia.md").as_deref(), Some("# Ideia\n"));
}

/// A reader of a server's folder, in a window of the desktop app: no
/// `write` (the server's word), and the app's own abilities kept.
#[test]
fn a_readers_capabilities_keep_the_apps_abilities_and_no_write() {
    let mut caps = json!({ "host": "server", "can": ["account", "collab"], "latency_ms": null });
    remote::with_app_abilities(&mut caps);
    let can: Vec<&str> = caps["can"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c.as_str().unwrap())
        .collect();
    assert_eq!(caps["host"], "server");
    for kept in [
        "account",
        "collab",
        "windows",
        "web_views",
        "updates",
        "devtools",
        "local_folders",
        // This computer's shell, in the home directory (ADR 0115 Q4).
        "terminal",
        "audio_share",
        // This app as a server (ADR 0119 A13): the desktop has all three.
        "link",
        "discover",
        "serve_away",
        // An old server never says it: a folder window by default.
        "index",
        "search",
        "backlinks",
        "create",
        "rename",
        "delete",
        "trash",
        "history",
        "sync",
        "table",
        "board",
    ] {
        assert!(can.contains(&kept), "{kept} in {can:?}");
    }
    for gone in ["write", "reveal", "copy_path", "agents"] {
        assert!(!can.contains(&gone), "{gone} in {can:?}");
    }
    // Asked twice, nothing is added twice.
    remote::with_app_abilities(&mut caps);
    assert_eq!(caps["can"].as_array().unwrap().len(), 9 + 3 + 11);
}

/// The words of a server folder's window, as the app of a platform with
/// `here` completes them.
fn completed_for(here: &[verso_contract::Can]) -> Vec<String> {
    let mut caps = json!({ "host": "server", "can": ["account", "collab"], "latency_ms": null });
    crate::remote_abilities::with_abilities_of(&mut caps, here);
    caps["can"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c.as_str().unwrap().to_owned())
        .collect()
}

/// The desktop's window on a server's folder is as before: every ability
/// of the app, the app server's three included (ADR 0119 A13).
#[test]
fn the_desktops_server_folder_window_keeps_every_ability_of_the_app() {
    let desk = completed_for(&crate::mobile::can_without(false, &[]));
    for kept in [
        "windows",
        "web_views",
        "updates",
        "devtools",
        "local_folders",
        "terminal",
        "audio_share",
        "link",
        "discover",
        "serve_away",
    ] {
        assert!(desk.iter().any(|c| c == kept), "{kept} in {desk:?}");
    }
    assert_eq!(desk, completed_for(&crate::mobile::local_can(false)));
}

/// A phone's window on a server's folder offers only what the phone has:
/// no terminal, second window or page inside a note on Android (ADR 0118
/// item 5), and on iOS no updater, capture, link, mDNS or serving off the
/// screen either (ADR 0119 B14, A13). The folder's abilities stay.
#[test]
fn a_phones_server_folder_window_offers_only_what_the_phone_has() {
    let android = completed_for(&crate::mobile::can_without(
        false,
        crate::mobile::OFF_ON_ANDROID,
    ));
    for gone in ["terminal", "windows", "web_views"] {
        assert!(!android.iter().any(|c| c == gone), "{gone} in {android:?}");
    }
    for kept in [
        "updates",
        "audio_share",
        "devtools",
        "local_folders",
        "link",
        "discover",
        "serve_away",
        "index",
    ] {
        assert!(android.iter().any(|c| c == kept), "{kept} in {android:?}");
    }
    let ios = completed_for(&crate::mobile::can_without(
        false,
        crate::mobile::OFF_ON_IOS,
    ));
    for gone in [
        "terminal",
        "windows",
        "web_views",
        "updates",
        "audio_share",
        "link",
        "discover",
        "serve_away",
    ] {
        assert!(!ios.iter().any(|c| c == gone), "{gone} in {ios:?}");
    }
    for kept in [
        "devtools",
        "local_folders",
        "account",
        "collab",
        "index",
        "board",
    ] {
        assert!(ios.iter().any(|c| c == kept), "{kept} in {ios:?}");
    }
}

/// Plain HTTP is a server's address from any machine, not only this
/// one (ADR 0073 item 6, amended 2026-10-16); other schemes are not.
#[test]
fn http_is_a_servers_address_from_any_machine() {
    for (given, kept) in [
        ("http://192.168.1.20:7340/", "http://192.168.1.20:7340"),
        ("http://zima.local:7340", "http://zima.local:7340"),
        ("https://notas.casa/x", "https://notas.casa"),
        ("http://localhost:7340", "http://localhost:7340"),
    ] {
        assert_eq!(crate::remote::server_url(given).unwrap(), kept, "{given}");
    }
    assert!(crate::remote::server_url("ftp://notas.casa").is_err());
    assert!(crate::remote::server_url("notas.casa").is_err());
}

/// A server's answer that refuses what was asked (a 4xx: "no account has
/// that e-mail: make an invitation link for them", which the share dialog
/// turns into its invitation) is an answer, said in the log at INFO as the
/// window says its answers; a server's own fault (5xx) stays an ERROR (the
/// re-test of 2026-11-04). The window still gets the same refusal.
#[test]
fn a_servers_answer_is_no_error_in_the_log() {
    assert_eq!(crate::reach::level_of_answer(400), "INFO");
    assert_eq!(crate::reach::level_of_answer(409), "INFO");
    assert_eq!(crate::reach::level_of_answer(429), "INFO");
    assert_eq!(crate::reach::level_of_answer(500), "ERROR");
    assert_eq!(crate::reach::level_of_answer(503), "ERROR");
    let said = crate::remote::error_of(
        400,
        &serde_json::json!({ "error": "no_account", "message": "no account has that e-mail: make an invitation link for them" }),
    );
    assert_eq!(said.kind, verso_contract::ErrorKind::Failed);
    assert_eq!(
        said.message,
        "no account has that e-mail: make an invitation link for them"
    );
}
