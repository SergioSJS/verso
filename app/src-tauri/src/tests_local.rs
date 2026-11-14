// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "This app is a server", the host's side: a folder that also syncs with
//! a UniVerso is served from this computer too (the maintainer, 2026-11-04;
//! ADR 0117 D4: "se eu tenho um servidor sincronizando, não deveria ser
//! motivo para não poder abrir a minha máquina como servidor"); a folder
//! someone else shared with this person is not (ADR 0081 item 4: a
//! receiver does not share it again). The serving itself is tested in
//! `verso_server::local`.

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

/// Mark the folder as syncing with a server, as a sync's state does, this
/// person's role there as the server last said it (`seat`), or none said.
fn syncs_with_a_server(app: &tauri::App<tauri::test::MockRuntime>, key: &str, role: Option<&str>) {
    let state = app.state::<App>();
    let state_of_sync = engine::State {
        server: "https://uni.casa.lan".to_owned(),
        folder: "fldr".to_owned(),
        seat: role.map(|r| json!({ "seat": "master", "role": r, "cap": "owner", "table": false })),
        ..engine::State::default()
    };
    engine::save(state.service.config(), key, &state_of_sync).unwrap();
}

/// A folder of one's own that syncs with a UniVerso is ticked and served
/// like any other — whether the server said the person owns it or has
/// said nothing yet: the row names no server to go to instead.
#[test]
fn a_folder_of_ones_own_that_syncs_with_a_server_is_ticked_and_served() {
    for role in [Some("owner"), None] {
        let vault = tempfile::tempdir().unwrap();
        let _nota = note(vault.path(), "Nota.md", "# Nota\n");
        let (app, webview) = app_with(Some(vault.path().to_path_buf()));
        // The phone's page from a directory of the test's own: the window's
        // build (`app/ui/dist`) is not there on CI (main's run of
        // 2026-11-14 refused to serve, "no web files for the phone").
        let ui = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let _web = note(ui.path(), "web.html", "<!doctype html><title>Verso</title>");
        app.state::<App>().local_server.set_for_tests(
            verso_server::local::LocalServer::on_loopback_for_tests(
                data.path().join("local-server"),
                vec![ui.path().to_path_buf()],
                std::sync::Arc::new(|_| {}),
            ),
        );
        let key = known(&webview);
        syncs_with_a_server(&app, &key, role);
        let rows = call(
            &webview,
            "local_server_tick",
            json!({ "key": key, "ticked": true }),
        )
        .unwrap();
        assert_eq!(rows[0]["ticked"], true, "{role:?}: {rows}");
        assert!(rows[0]["received_from"].is_null(), "{role:?}: {rows}");
        let status = call(&webview, "local_server_start", json!({})).unwrap_or_else(|e| e);
        assert!(
            !status.to_string().contains("uni.casa.lan"),
            "{role:?}: refused for its sync: {status}"
        );
        // Served on loopback alone under test: never a listener on this
        // machine's network (the macOS firewall asked about each new test
        // binary, 2026-11-04).
        let addresses = status["addresses"].as_array().cloned().unwrap_or_default();
        assert!(!addresses.is_empty(), "{role:?}: not serving: {status}");
        assert!(
            addresses
                .iter()
                .all(|a| a.as_str().is_some_and(|a| a.starts_with("127.0.0.1"))),
            "{role:?}: listening on {addresses:?}"
        );
        let _ = call(&webview, "local_server_stop", json!({}));
    }
}

/// A folder another account shared with this person, synced here, is not
/// served from here (ADR 0081 item 4): the row says whose server it came
/// from, ticking it is refused, and one ticked before it was shared stops
/// the start, the pairing and the link with its name.
#[test]
fn a_folder_shared_with_this_person_is_not_served_from_here() {
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
    syncs_with_a_server(&app, &key, Some("reader"));
    let rows = call(&webview, "local_server_folders", json!({})).unwrap();
    assert_eq!(rows[0]["received_from"], "uni.casa.lan", "{rows}");
    for command in ["local_server_start", "local_server_pair_open"] {
        let refused = call(&webview, command, json!({})).unwrap_err();
        assert_eq!(refused["kind"], "refused", "{command}: {refused}");
        assert!(
            refused.to_string().contains("was shared with you"),
            "{refused}"
        );
    }
    call(
        &webview,
        "local_server_tick",
        json!({ "key": key, "ticked": false }),
    )
    .unwrap();
    let refused = call(
        &webview,
        "local_server_tick",
        json!({ "key": key, "ticked": true }),
    )
    .unwrap_err();
    assert!(refused.to_string().contains("uni.casa.lan"), "{refused}");
    let status = call(&webview, "local_server_status", json!({})).unwrap();
    assert_eq!(status["serving"], false, "{status}");
}

#[test]
fn a_folder_row_carries_the_name_of_its_directory_and_no_path() {
    let vault = tempfile::tempdir().unwrap();
    let _nota = note(vault.path(), "Nota.md", "# Nota\n");
    let (_app, webview) = app_with(Some(vault.path().to_path_buf()));
    let _key = known(&webview);
    let rows = call(&webview, "local_server_folders", json!({})).unwrap();
    let place = rows[0]["place"].as_str().unwrap();
    let parent = vault.path().parent().unwrap().file_name().unwrap();
    assert_eq!(place, parent.to_string_lossy(), "{rows}");
    assert!(
        !place.contains('/') && !place.contains('\\'),
        "a name only: {rows}"
    );
}

#[test]
fn only_some_folders_inside_a_ticked_folder_can_be_chosen_to_serve() {
    let vault = tempfile::tempdir().unwrap();
    // Made through tempfile, as the notes are: std::fs stays out of the
    // app's crate (ADR 0029).
    let _dirs: Vec<tempfile::TempDir> = ["Projetos", "Diario", ".obsidian"]
        .iter()
        .map(|d| {
            tempfile::Builder::new()
                .prefix(d)
                .rand_bytes(0)
                .tempdir_in(vault.path())
                .unwrap()
        })
        .collect();
    let _nota = note(&vault.path().join("Projetos"), "Nota.md", "# Nota\n");
    let _dia = note(&vault.path().join("Diario"), "Dia.md", "# Dia\n");
    let (_app, webview) = app_with(Some(vault.path().to_path_buf()));
    let key = known(&webview);
    // The tree of a folder, relative, none hidden.
    let found = call(&webview, "local_server_subfolders", json!({ "key": key })).unwrap();
    assert_eq!(found, json!(["Diario", "Projetos"]));
    let unknown = call(
        &webview,
        "local_server_subfolders",
        json!({ "key": "nope" }),
    )
    .unwrap_err();
    assert_eq!(unknown["kind"], "refused", "{unknown}");
    // Only a ticked folder can be served in part.
    let before_tick = call(
        &webview,
        "local_server_parts",
        json!({ "key": key, "parts": ["Projetos"] }),
    )
    .unwrap_err();
    assert!(
        before_tick.to_string().contains("tick the folder"),
        "{before_tick}"
    );
    call(
        &webview,
        "local_server_tick",
        json!({ "key": key, "ticked": true }),
    )
    .unwrap();
    let rows = call(
        &webview,
        "local_server_parts",
        json!({ "key": key, "parts": ["Projetos", "Projetos/Sub", "Diario/"] }),
    )
    .unwrap();
    assert_eq!(rows[0]["parts"], json!(["Diario", "Projetos"]), "{rows}");
    // Ticking it again while it is ticked changes nothing that is chosen.
    let rows = call(
        &webview,
        "local_server_tick",
        json!({ "key": key, "ticked": true }),
    )
    .unwrap();
    assert_eq!(rows[0]["parts"], json!(["Diario", "Projetos"]), "{rows}");
    // No attachments folder is named by the vault: none goes along.
    assert!(rows[0]["attachments"].is_null(), "{rows}");
    assert_eq!(rows[0]["missing"], json!([]));
    // No way out of the folder, hidden folder or absolute path crosses.
    for bad in ["../x", "/etc", ".obsidian", "a/../../b"] {
        let refused = call(
            &webview,
            "local_server_parts",
            json!({ "key": key, "parts": [bad] }),
        )
        .unwrap_err();
        assert_eq!(refused["kind"], "refused", "{bad}: {refused}");
    }
    let rows = call(&webview, "local_server_folders", json!({})).unwrap();
    assert_eq!(
        rows[0]["parts"],
        json!(["Diario", "Projetos"]),
        "kept: {rows}"
    );
    // Back to all of it is its own act, and the folder stays ticked.
    let rows = call(&webview, "local_server_whole", json!({ "key": key })).unwrap();
    assert_eq!(rows[0]["parts"], json!([]));
    assert_eq!(rows[0]["ticked"], json!(true), "{rows}");
    // Choosing none is not the whole folder: it stops serving it (the
    // maintainer, 2026-10-16: "Para de servir o cofre").
    call(
        &webview,
        "local_server_parts",
        json!({ "key": key, "parts": ["Diario"] }),
    )
    .unwrap();
    let rows = call(
        &webview,
        "local_server_parts",
        json!({ "key": key, "parts": [] }),
    )
    .unwrap();
    assert_eq!(rows[0]["ticked"], json!(false), "{rows}");
    assert_eq!(rows[0]["parts"], json!([]), "{rows}");
    call(
        &webview,
        "local_server_tick",
        json!({ "key": key, "ticked": true }),
    )
    .unwrap();
    // Unticking forgets the choice.
    call(
        &webview,
        "local_server_parts",
        json!({ "key": key, "parts": ["Diario"] }),
    )
    .unwrap();
    call(
        &webview,
        "local_server_tick",
        json!({ "key": key, "ticked": false }),
    )
    .unwrap();
    let rows = call(&webview, "local_server_folders", json!({})).unwrap();
    assert_eq!(rows[0]["parts"], json!([]), "{rows}");
}
