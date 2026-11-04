// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the accounts of this computer's server have, the host's side (ADR
//! 0117 D9, S7c over S11 and S12): the desktop apps of the people invited,
//! listed and ended from the section; the read links' switch; and a read
//! link made, and a folder shared, from the owner's window at the table,
//! through the seat's door — a real `LocalServer` in this process serving by the internet link
//! alone (no address of a network in a test).

use serde_json::{Value, json};
use tauri::test::MockRuntime;
use verso_server::local::{LocalServer, LocalSettings};

use super::tests::{call, note};
use super::*;

const NAME: &str = "tidy-otter-quiet-lamp.trycloudflare.com";
const ORIGIN: &str = "https://tidy-otter-quiet-lamp.trycloudflare.com";

/// Every command S7c added: each is in the window's capability, in
/// `build.rs` and in the generated bindings, and a phone is refused it.
const ADDED: &[&str] = &[
    "local_server_devices",
    "local_server_end_device",
    "local_server_read_links",
];

struct Served {
    app: tauri::App<MockRuntime>,
    webview: tauri::WebviewWindow<MockRuntime>,
    local: LocalServer,
    _dirs: Vec<tempfile::TempDir>,
    _files: Vec<tempfile::NamedTempFile>,
}

/// The app with a folder open in its window, the mode's server made, the
/// folder ticked and served by the internet link alone.
fn served() -> Served {
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
        .invoke_handler({
            let handler = commands_for!(MockRuntime).invoke_handler();
            move |invoke| match remote::forward(invoke) {
                None => true,
                Some(invoke) => handler(invoke),
            }
        })
        .build(context())
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let opened = call(&webview, "open_initial", json!({})).unwrap();
    assert!(opened.is_object(), "{opened}");
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
    local.link_open().unwrap();
    local.set_link_origin(Some(ORIGIN)).unwrap();
    Served {
        app,
        webview,
        local,
        _dirs: vec![vault, ui, data, config],
        _files: files,
    }
}

impl Served {
    /// A request through the internet link's listener, as the tunnel
    /// forwards one.
    fn through(&self, method: reqwest::Method, path: &str) -> reqwest::blocking::RequestBuilder {
        let port = self.local.status().unwrap().link_port.unwrap();
        reqwest::blocking::Client::new()
            .request(method, format!("http://127.0.0.1:{port}{path}"))
            .header("host", NAME)
            .header("x-forwarded-for", "198.51.100.7")
            .header("x-forwarded-proto", "https")
    }

    /// A page of the link's, signed in with `cookie`, posts `body`.
    fn as_page(&self, path: &str, body: &Value, cookie: &str) -> (u16, Value) {
        let state: Value = self
            .through(reqwest::Method::GET, "/api/state")
            .header("cookie", cookie)
            .send()
            .unwrap()
            .json()
            .unwrap();
        let res = self
            .through(reqwest::Method::POST, path)
            .header("origin", ORIGIN)
            .header("cookie", cookie)
            .header("x-verso-csrf", state["csrf"].as_str().unwrap())
            .json(body)
            .send()
            .unwrap();
        (res.status().as_u16(), res.json().unwrap_or(Value::Null))
    }

    /// A person invited by the owner makes an account through the link:
    /// their browser's cookie.
    fn invited(&self, email: &str) -> String {
        let made = self.local.invite(None, None).unwrap();
        let token = made.link.rsplit_once("/invite/").unwrap().1.to_owned();
        let accepted = self
            .through(reqwest::Method::POST, &format!("/api/invite/{token}"))
            .header("origin", ORIGIN)
            .json(&json!({ "email": email, "name": "Ana", "password": "uma senha longa da mesa 2026", "lang": "pt" }))
            .send()
            .unwrap();
        assert_eq!(accepted.status().as_u16(), 200);
        accepted
            .headers()
            .get("set-cookie")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(';').next())
            .unwrap()
            .to_owned()
    }

    /// A person invited by the owner makes an account through the link and
    /// signs their desktop app `device` in through the browser (ADR 0074
    /// item 8): the device's token.
    fn invited_device(&self, email: &str, device: &str) -> String {
        let cookie = self.invited(email);
        let started: Value = self
            .through(reqwest::Method::POST, "/api/device/start")
            .json(&json!({ "device": device }))
            .send()
            .unwrap()
            .json()
            .unwrap();
        let code = started["code"].as_str().unwrap().to_owned();
        let poll = started["poll"].as_str().unwrap().to_owned();
        let (status, approved) =
            self.as_page("/api/device/approve", &json!({ "code": code }), &cookie);
        assert_eq!(status, 200, "{approved}");
        let got: Value = self
            .through(reqwest::Method::POST, "/api/device/poll")
            .json(&json!({ "code": code, "poll": poll }))
            .send()
            .unwrap()
            .json()
            .unwrap();
        got["token"].as_str().unwrap().to_owned()
    }

    /// A program's GET through the link with a bearer credential.
    fn bearer(&self, path: &str, token: &str) -> u16 {
        self.through(reqwest::Method::GET, path)
            .bearer_auth(token)
            .send()
            .unwrap()
            .status()
            .as_u16()
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

/// Another person's desktop app, signed in through the browser, is listed
/// by its name and the person's; *End* ends it, and its token opens
/// nothing after. The window at the table is never listed.
#[test]
fn the_section_lists_the_desktop_apps_signed_in_and_ends_one() {
    let s = served();
    let none = call(&s.webview, "local_server_devices", json!({})).unwrap();
    assert_eq!(none, json!([]));
    // The owner's window sits: its seat is no one's device.
    call(&s.webview, "local_server_sit_at_table", json!({})).unwrap();
    let token = s.invited_device("ana@example.org", "Verso · Mac da Ana");
    assert_eq!(s.bearer("/api/folders", &token), 200);
    let listed = call(&s.webview, "local_server_devices", json!({})).unwrap();
    let list = listed.as_array().unwrap();
    assert_eq!(list.len(), 1, "{listed}");
    assert_eq!(list[0]["device"], "Verso · Mac da Ana", "{listed}");
    assert_eq!(list[0]["account"], "Ana", "{listed}");
    assert_eq!(list[0]["email"], "ana@example.org", "{listed}");
    assert!(list[0]["last_used"].as_u64().unwrap() > 0, "{listed}");
    let id = list[0]["id"].as_str().unwrap().to_owned();
    call(&s.webview, "local_server_end_device", json!({ "id": id })).unwrap();
    assert_eq!(s.bearer("/api/folders", &token), 401);
    assert_eq!(
        call(&s.webview, "local_server_devices", json!({})).unwrap(),
        json!([])
    );
    // Ended twice, or an id that is none: said.
    let again = call(&s.webview, "local_server_end_device", json!({ "id": id })).unwrap_err();
    assert_eq!(again["kind"], "refused", "{again}");
    assert!(message(&again).contains("not signed in here"), "{again}");
}

/// The read links' switch: off at first, in the status; on and off from the
/// section, kept by the server.
#[test]
fn the_read_links_switch_is_off_at_first_and_the_owners() {
    let s = served();
    let status = call(&s.webview, "local_server_status", json!({})).unwrap();
    assert_eq!(status["read_links"], false, "{status}");
    let on = call(&s.webview, "local_server_read_links", json!({ "on": true })).unwrap();
    assert_eq!(on["read_links"], true, "{on}");
    assert!(s.local.read_links_on().unwrap());
    let off = call(
        &s.webview,
        "local_server_read_links",
        json!({ "on": false }),
    )
    .unwrap();
    assert_eq!(off["read_links"], false, "{off}");
    assert!(!s.local.read_links_on().unwrap());
}

/// The window at its own server's table makes a read link as the desktop
/// connected to a UniVerso does — the click its proof, through the seat's
/// door — refused in words while links are off; the address is the
/// internet link's, a visitor opens it there, and revoked it opens nothing.
/// A window on this computer's folder, not seated, still has none.
#[test]
fn the_window_at_the_table_makes_a_read_link_through_its_seat() {
    let s = served();
    let alone = call(&s.webview, "read_link_list", json!({})).unwrap_err();
    assert!(message(&alone).contains("not on a server"), "{alone}");
    call(&s.webview, "local_server_sit_at_table", json!({})).unwrap();
    let make = || {
        call(
            &s.webview,
            "read_link_create",
            json!({ "kind": "note", "path": "Sessao.md", "expiresDays": null, "expiresAt": null, "password": null }),
        )
    };
    let listed = call(&s.webview, "read_link_list", json!({})).unwrap();
    assert_eq!(listed["enabled"], false, "{listed}");
    let off = make().unwrap_err();
    assert!(message(&off).contains("turn them on in Settings"), "{off}");
    call(&s.webview, "local_server_read_links", json!({ "on": true })).unwrap();
    let made = make().unwrap();
    let url = made["url"].as_str().unwrap().to_owned();
    assert!(url.starts_with(&format!("{ORIGIN}/r/")), "{made}");
    let listed = call(&s.webview, "read_link_list", json!({})).unwrap();
    assert_eq!(listed["enabled"], true, "{listed}");
    assert_eq!(listed["links"][0]["path"], "Sessao.md", "{listed}");
    let path = url.strip_prefix(ORIGIN).unwrap();
    let visited = s
        .through(reqwest::Method::GET, &format!("{path}/state"))
        .send()
        .unwrap();
    assert_eq!(visited.status().as_u16(), 200);
    let id = made["link"]["id"].as_str().unwrap().to_owned();
    call(&s.webview, "read_link_revoke", json!({ "id": id })).unwrap();
    let gone = s
        .through(reqwest::Method::GET, &format!("{path}/state"))
        .send()
        .unwrap();
    assert_ne!(gone.status().as_u16(), 200);
    // The seat's token outside its door opens nothing (S4): what the window
    // made is the owner's through the door alone.
    let seat = remote::of(s.app.handle(), "main").unwrap();
    let token = seat.seat.as_ref().unwrap().0.token().to_owned();
    assert_eq!(s.bearer("/api/folders", &token), 401);
}

/// The window at its own server's table shares a folder inside it as the
/// desktop connected to a UniVerso does — the click its proof, through the
/// seat's door (ADR 0117 D4 Q3 and Q4, D9; ADR 0081) — and the person
/// invited, through the internet link, finds it in their list and reaches
/// its files and nothing beside; revoked, they reach nothing. A window not
/// seated shares nothing.
#[test]
fn the_window_at_the_table_shares_a_folder_through_its_seat() {
    let s = served();
    let vault = s._dirs[0].path().to_path_buf();
    let mesa = tempfile::Builder::new()
        .prefix("Mesa")
        .rand_bytes(0)
        .tempdir_in(&vault)
        .unwrap();
    let _files = [
        note(mesa.path(), "pista.png", "png"),
        note(&vault, "fora.png", "png"),
    ];
    let cookie = s.invited("ana@example.org");
    let grant = || {
        call(
            &s.webview,
            "share_grant",
            json!({ "path": "Mesa", "email": "ana@example.org", "role": "reader" }),
        )
    };
    let alone = grant().unwrap_err();
    assert!(message(&alone).contains("not on a server"), "{alone}");
    call(&s.webview, "local_server_sit_at_table", json!({})).unwrap();
    let made = grant().unwrap();
    assert_eq!(made["path"], "Mesa", "{made}");
    assert_eq!(made["people"][0]["email"], "ana@example.org", "{made}");
    let listed = call(&s.webview, "share_list", json!({})).unwrap();
    assert_eq!(listed[1]["path"], "Mesa", "{listed}");
    let get = |path: &str| {
        s.through(reqwest::Method::GET, path)
            .header("cookie", &cookie)
            .send()
            .unwrap()
    };
    let mine: Value = get("/api/folders").json().unwrap();
    let id = mine["folders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["share"] == true)
        .and_then(|f| f["id"].as_str())
        .unwrap_or_else(|| panic!("no share in {mine}"))
        .to_owned();
    assert_eq!(get(&format!("/f/{id}/pista.png")).status().as_u16(), 200);
    for outside in ["fora.png", "..%2Ffora.png"] {
        assert_eq!(
            get(&format!("/f/{id}/{outside}")).status().as_u16(),
            404,
            "{outside}"
        );
    }
    call(
        &s.webview,
        "share_revoke",
        json!({ "path": "Mesa", "account": "ana@example.org" }),
    )
    .unwrap();
    assert_ne!(get(&format!("/f/{id}/pista.png")).status().as_u16(), 200);
    let mine: Value = get("/api/folders").json().unwrap();
    assert!(!mine.to_string().contains(&id), "{mine}");
}
