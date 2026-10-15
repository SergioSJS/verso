// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "This app is a server", the host's side (ADR 0096 item 11): a folder
//! that also syncs with a UniVerso is never served by the app. The serving
//! itself is tested in `verso_server::local`.

// The local mode is not built for Windows yet (ADR 0096 item 17).
#![cfg(not(windows))]

use serde_json::json;
use verso_core::sync as engine;

use super::tests::{app_with, call, note};
use super::*;

/// The folder opened, known to the computer, and its key.
fn known(webview: &tauri::WebviewWindow<tauri::test::MockRuntime>) -> String {
    let opened = call(webview, "open_initial", json!({})).unwrap();
    assert!(opened.is_object(), "{opened}");
    call(webview, "local_server_folders", json!({})).unwrap()[0]["key"]
        .as_str()
        .unwrap()
        .to_owned()
}

/// Mark the folder as syncing with a server, as a sync's state does.
fn syncs_with_a_server(app: &tauri::App<tauri::test::MockRuntime>, key: &str) {
    let state = app.state::<App>();
    let state_of_sync = engine::State {
        server: "https://uni.casa.lan".to_owned(),
        folder: "fldr".to_owned(),
        ..engine::State::default()
    };
    engine::save(state.service.config(), key, &state_of_sync).unwrap();
}

#[test]
fn a_folder_that_syncs_with_a_server_cannot_be_ticked_or_served() {
    let vault = tempfile::tempdir().unwrap();
    let _nota = note(vault.path(), "Nota.md", "# Nota\n");
    let (app, webview) = app_with(Some(vault.path().to_path_buf()));
    let key = known(&webview);

    // Free to tick while it syncs with nothing.
    let rows = call(
        &webview,
        "local_server_tick",
        json!({ "key": key, "ticked": true }),
    )
    .unwrap();
    assert_eq!(rows[0]["ticked"], true, "{rows}");
    assert!(rows[0]["syncs_with"].is_null(), "{rows}");
    call(
        &webview,
        "local_server_tick",
        json!({ "key": key, "ticked": false }),
    )
    .unwrap();

    // Once it syncs, ticking is refused, and says where to go instead.
    syncs_with_a_server(&app, &key);
    let rows = call(&webview, "local_server_folders", json!({})).unwrap();
    assert_eq!(rows[0]["syncs_with"], "uni.casa.lan", "{rows}");
    let refused = call(
        &webview,
        "local_server_tick",
        json!({ "key": key, "ticked": true }),
    )
    .unwrap_err();
    assert_eq!(refused["kind"], "refused", "{refused}");
    assert!(
        refused.to_string().contains("uni.casa.lan"),
        "names the server: {refused}"
    );
}

#[test]
fn a_folder_ticked_and_synced_later_stops_serving_and_pairing() {
    let vault = tempfile::tempdir().unwrap();
    let _nota = note(vault.path(), "Nota.md", "# Nota\n");
    let (app, webview) = app_with(Some(vault.path().to_path_buf()));
    let key = known(&webview);
    call(
        &webview,
        "local_server_tick",
        json!({ "key": key, "ticked": true }),
    )
    .unwrap();
    syncs_with_a_server(&app, &key);

    for command in ["local_server_start", "local_server_pair_open"] {
        let refused = call(&webview, command, json!({})).unwrap_err();
        assert_eq!(refused["kind"], "refused", "{command}: {refused}");
        assert!(refused.to_string().contains("uni.casa.lan"), "{refused}");
    }
    let status = call(&webview, "local_server_status", json!({})).unwrap();
    assert_eq!(status["serving"], false, "{status}");
}
