// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The commands of the two boxes, the internet link, the own address and
//! the invitations (ADR 0117 D1, D3, D4 Q2 and Q8, D10), the host's side,
//! over a real `LocalServer` in this process serving by its loopback door
//! alone (no network address in a test). Nothing here runs `cloudflared`
//! or downloads it: every path tried stops before the binary is asked for
//! (`tunnel/tests.rs` drives a fake one).

use serde_json::{Value, json};
use tauri::test::MockRuntime;
use verso_server::local::{LocalServer, LocalSettings, OwnAddress};

use super::tests::{call, note};
use super::*;

const ORIGIN: &str = "https://tidy-otter-quiet-lamp.trycloudflare.com";

/// Every command this step added: each is in the window's capability, in
/// `build.rs` and in the generated bindings, and a phone is refused it.
const ADDED: &[&str] = &[
    "local_server_network",
    "local_server_link_on",
    "local_server_link_off",
    "local_server_link_extend",
    "local_server_link_mode",
    "local_server_own_address_login",
    "local_server_own_address_set_up",
    "local_server_own_address_remove",
    "local_server_invite",
    "local_server_invitations",
    "local_server_invitation_revoke",
];

struct Served {
    _app: tauri::App<MockRuntime>,
    webview: tauri::WebviewWindow<MockRuntime>,
    local: LocalServer,
    key: String,
    _dirs: Vec<tempfile::TempDir>,
    _files: Vec<tempfile::NamedTempFile>,
}

/// The app with a folder open, the mode's server made and the folder
/// ticked, the network's box unticked; serving by the link's door once
/// `serve`.
fn served(serve: bool) -> Served {
    let vault = tempfile::tempdir().unwrap();
    let ui = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let files = vec![
        note(vault.path(), "Sessao.md", "# Sessao\n"),
        note(ui.path(), "web.html", "<!doctype html><title>Verso</title>"),
    ];
    let app = tauri::test::mock_builder()
        .manage(App {
            service: Service::new(Some(config.path().to_path_buf())),
            ..App::new(Some(vault.path().to_path_buf()))
        })
        .invoke_handler(commands_for!(MockRuntime).invoke_handler())
        .build(context())
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = call(&webview, "open_initial", json!({})).unwrap();
    assert!(opened.is_object(), "{opened}");
    let key = verso_core::folder_key(vault.path());
    let local = LocalServer::new(
        data.path().join("local-server"),
        vec![ui.path().to_path_buf()],
        "test",
        Arc::new(|_| {}),
    );
    local
        .set_settings(&LocalSettings {
            folders: vec![vault.path().to_string_lossy().into_owned()],
            network: false,
            ..LocalSettings::default()
        })
        .unwrap();
    app.state::<App>().local_server.set_for_tests(local.clone());
    if serve {
        local.link_open().unwrap();
        local.set_link_origin(Some(ORIGIN)).unwrap();
    }
    Served {
        _app: app,
        webview,
        local,
        key,
        _dirs: vec![vault, ui, data, config],
        _files: files,
    }
}

fn message(e: &Value) -> String {
    e["message"].as_str().unwrap_or_default().to_owned()
}

#[test]
fn every_added_command_is_permitted_to_the_window_and_refused_to_a_phone() {
    let bindings = include_str!("../../ui/src/bindings.ts");
    let capability = include_str!("../capabilities/default.json");
    let build = include_str!("../build.rs");
    for name in ADDED {
        assert!(
            bindings.contains(&format!("__TAURI_INVOKE(\"{name}\"")),
            "{name}: not in the bindings"
        );
        let allow = format!("\"allow-{}\"", name.replace('_', "-"));
        assert!(capability.contains(&allow), "{name}: not in the capability");
        assert!(
            build.contains(&format!("\"{name}\"")),
            "{name}: not in build.rs"
        );
        assert_eq!(
            verso_server::local::allow::verdict(name),
            verso_server::local::allow::Verdict::Refuse,
            "{name}: a phone may run it"
        );
    }
}

#[test]
fn the_network_box_is_kept_and_changes_only_while_serving_is_off() {
    let s = served(false);
    let off = call(&s.webview, "local_server_network", json!({ "on": false })).unwrap();
    assert_eq!(off["network"], json!(false));
    assert!(!s.local.settings().unwrap().network);
    let on = call(&s.webview, "local_server_status", json!({})).unwrap();
    assert_eq!(on["network"], json!(false));
    assert_eq!(on["link"]["state"], json!("off"));
    // Serving by the link alone: where it serves is not changed under it.
    s.local.link_open().unwrap();
    let refused = call(&s.webview, "local_server_network", json!({ "on": true })).unwrap_err();
    assert!(message(&refused).contains("turn serving off"), "{refused}");
    assert!(!s.local.settings().unwrap().network);
}

#[test]
fn an_invitation_carries_the_links_origin_is_listed_and_can_be_ended_once() {
    let s = served(true);
    let made = call(
        &s.webview,
        "local_server_invite",
        json!({ "key": s.key, "editor": true }),
    )
    .unwrap();
    let link = made["link"].as_str().unwrap();
    assert!(link.starts_with(&format!("{ORIGIN}/invite/")), "{link}");
    let id = made["id"].as_str().unwrap().to_owned();
    let rows = call(&s.webview, "local_server_invitations", json!({})).unwrap();
    let row = rows
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == json!(id))
        .unwrap()
        .clone();
    assert_eq!(row["state"], json!("pending"));
    assert_eq!(row["role"], json!("editor"));
    assert!(row["folder"].as_str().is_some_and(|f| !f.is_empty()));
    // The list never says the link again.
    assert!(!rows.to_string().contains("/invite/"), "{rows}");
    call(
        &s.webview,
        "local_server_invitation_revoke",
        json!({ "id": id }),
    )
    .unwrap();
    let rows = call(&s.webview, "local_server_invitations", json!({})).unwrap();
    assert_eq!(rows[0]["state"], json!("ended"));
    let again = call(
        &s.webview,
        "local_server_invitation_revoke",
        json!({ "id": id }),
    )
    .unwrap_err();
    assert!(
        message(&again).contains("used, ended or not there"),
        "{again}"
    );
    // To no folder: an account and nothing more; to a folder not known, no.
    let bare = call(
        &s.webview,
        "local_server_invite",
        json!({ "key": null, "editor": false }),
    )
    .unwrap();
    assert!(bare["link"].as_str().unwrap().starts_with(ORIGIN));
    let unknown = call(
        &s.webview,
        "local_server_invite",
        json!({ "key": "no-such-folder", "editor": false }),
    )
    .unwrap_err();
    assert!(message(&unknown).contains("does not know"), "{unknown}");
}

#[test]
fn an_invitation_needs_serving_on() {
    let s = served(false);
    let refused = call(
        &s.webview,
        "local_server_invite",
        json!({ "key": s.key, "editor": false }),
    )
    .unwrap_err();
    assert!(message(&refused).contains("not served now"), "{refused}");
}

#[test]
fn the_own_address_is_a_mode_only_once_set_up_and_is_forgotten_here() {
    let s = served(false);
    let refused = call(&s.webview, "local_server_link_mode", json!({ "own": true })).unwrap_err();
    assert!(message(&refused).contains("set up your own address first"));
    // A hostname no DNS takes is refused before cloudflared is asked for.
    let bad = call(
        &s.webview,
        "local_server_own_address_set_up",
        json!({ "hostname": "Mesa_Grande" }),
    )
    .unwrap_err();
    assert!(message(&bad).contains("like mesa.example.com"), "{bad}");
    // As the host keeps one once `cloudflared` made it.
    let set = s.local.settings().unwrap();
    s.local
        .set_settings(&LocalSettings {
            own_address: Some(OwnAddress {
                hostname: "mesa.example.com".to_owned(),
                tunnel: "6ff42ae2-765d-4adf-8112-31c55c1551ef".to_owned(),
            }),
            ..set
        })
        .unwrap();
    let mode = call(&s.webview, "local_server_link_mode", json!({ "own": true })).unwrap();
    assert_eq!(mode["link_own"], json!(true));
    assert_eq!(mode["own_address"]["hostname"], json!("mesa.example.com"));
    // The tunnel's id never crosses to the window.
    assert!(!mode.to_string().contains("6ff42ae2"), "{mode}");
    let twice = call(
        &s.webview,
        "local_server_own_address_set_up",
        json!({ "hostname": "outra.example.com" }),
    )
    .unwrap_err();
    assert!(message(&twice).contains("remove the address set up before"));
    // The tunnel's credentials, as `cloudflared tunnel create` left them
    // (made through tempfile: std::fs stays out of the app's crate).
    let config = s._dirs[3].path();
    let tunnel = crate::tunnel::tunnel_dir(config);
    let _tunnel_dir = tempfile::Builder::new()
        .prefix("tunnel")
        .rand_bytes(0)
        .tempdir_in(config)
        .unwrap();
    let uuid = "6ff42ae2-765d-4adf-8112-31c55c1551ef";
    let _file = note(&tunnel, &format!("{uuid}.json"), r#"{"TunnelSecret":"y"}"#);
    let credentials = tunnel.join(format!("{uuid}.json"));
    assert!(credentials.exists());
    // Forgotten on this computer alone: nothing asks Cloudflare, and the
    // credentials that could run a connector for the hostname are gone.
    let gone = call(
        &s.webview,
        "local_server_own_address_remove",
        json!({ "hereOnly": true }),
    )
    .unwrap();
    assert_eq!(gone["own_address"], Value::Null);
    assert_eq!(gone["link_own"], json!(false));
    assert!(s.local.settings().unwrap().own_address.is_none());
    assert!(!credentials.exists(), "the tunnel's credentials were left");
}

#[test]
fn the_link_in_own_mode_with_no_address_is_refused_before_any_download() {
    let s = served(false);
    let set = s.local.settings().unwrap();
    s.local
        .set_settings(&LocalSettings {
            link_own: true,
            ..set
        })
        .unwrap();
    let refused = call(&s.webview, "local_server_link_on", json!({})).unwrap_err();
    assert!(message(&refused).contains("set up your own address first"));
    // Off, it is off: nothing to stop, nothing to extend.
    let off = call(&s.webview, "local_server_link_off", json!({})).unwrap();
    assert_eq!(off["state"], json!("off"));
    let none = call(&s.webview, "local_server_link_extend", json!({})).unwrap_err();
    assert!(message(&none).contains("the internet link is off"));
}

#[test]
fn a_typed_address_is_read_as_a_hostname() {
    use crate::local_server::hostname_of;
    assert_eq!(
        hostname_of(" https://Mesa.Example.com/ "),
        "mesa.example.com"
    );
    assert_eq!(hostname_of("mesa.example.com."), "mesa.example.com");
    assert_eq!(hostname_of("http://mesa.example.com/x"), "mesa.example.com");
}

#[test]
fn the_window_is_told_the_link_in_seconds_and_with_how_it_reached_cloudflare() {
    use crate::tunnel::{LinkEnd, LinkState, LinkView, contract};
    let on = contract(&LinkView {
        state: LinkState::On,
        origin: Some(ORIGIN.to_owned()),
        until_ms: Some(1_800_000_000_123),
        own: false,
        ended: None,
        protocol: Some("http2".to_owned()),
    });
    assert_eq!(on.until, Some(1_800_000_000));
    assert_eq!(on.protocol.as_deref(), Some("http2"));
    // The QR is the origin's, square, drawn by the window; none while off.
    assert!(on.qr.len() > 20 && on.qr.iter().all(|r| r.len() == on.qr.len()));
    let v = serde_json::to_value(&on).unwrap();
    assert_eq!(v["state"], json!("on"));
    let ended = contract(&LinkView {
        state: LinkState::Off,
        origin: None,
        until_ms: None,
        own: false,
        ended: Some(LinkEnd::Ceiling),
        protocol: None,
    });
    assert_eq!(
        serde_json::to_value(&ended).unwrap()["ended"],
        json!("ceiling")
    );
    assert!(ended.qr.is_empty());
}
