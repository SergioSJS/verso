// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A window of the desktop app on a server's folder (ADR 0073 item 2; the
//! maintainer's answer K): a real `verso serve` on this machine, a device
//! signed in to it, and the window's commands answered by the server.

// The server is not built for Windows (crates/verso-cli/Cargo.toml).
#![cfg(not(windows))]

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
    let (addr_tx, addr_rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            addr_tx.send(listener.local_addr().unwrap()).unwrap();
            let _ = verso_server::run(server, listener, std::future::pending()).await;
        });
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
    assert_eq!(folders[0]["name"], "Campanha");
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
    // A folder of this computer again: the window leaves the server.
    remote::release(app.handle(), "main");
    assert_eq!(
        call(&main, "list_notes", json!({})).unwrap_err()["kind"],
        "no_folder"
    );
}
