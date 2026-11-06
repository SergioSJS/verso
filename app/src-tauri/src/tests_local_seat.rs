// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The game master's own window at the table of a folder this app serves
//! (ADR 0117 D4 Q3 and Q4), the host's side: a real `LocalServer` in this
//! process serving by the internet link alone (no address of a network in
//! a test), the window sitting at its table through the door in memory,
//! and a player who came in by the link at the same table. A folder this
//! app does not serve has no table, as before.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tauri::Listener;
use tauri::test::MockRuntime;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use verso_server::local::{LocalServer, LocalSettings};

use super::tests::{call, note};
use super::*;

const NAME: &str = "tidy-otter-quiet-lamp.trycloudflare.com";
const ORIGIN: &str = "https://tidy-otter-quiet-lamp.trycloudflare.com";

/// What the app was told, by event name.
type Told = Arc<Mutex<Vec<(String, Value)>>>;

struct Served {
    app: tauri::App<MockRuntime>,
    webview: tauri::WebviewWindow<MockRuntime>,
    local: LocalServer,
    told: Told,
    _dirs: Vec<tempfile::TempDir>,
    _files: Vec<tempfile::NamedTempFile>,
}

/// The app with a folder open in its window, the mode's server made with
/// the window's files for a browser, the folder ticked, and serving by the
/// internet link alone once `serve` is true.
fn served(serve: bool) -> Served {
    let vault = tempfile::tempdir().unwrap();
    let ui = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    let files = vec![
        note(vault.path(), "Sessao.md", "# Sessao\n"),
        note(ui.path(), "web.html", "<!doctype html><title>Verso</title>"),
    ];
    let config = tempfile::tempdir().unwrap();
    // The app as it runs: a window on a server's folder sends the folder's
    // commands there (`remote::forward`, as in `run`).
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
    hear(app.handle());
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
    let told: Told = Arc::default();
    for event in ["table-entry", "server-gone"] {
        let told = Arc::clone(&told);
        app.listen_any(event, move |e| {
            let payload = serde_json::from_str(e.payload()).unwrap_or(Value::Null);
            lock(&told).push((event.to_owned(), payload));
        });
    }
    if serve {
        local.link_open().unwrap();
        local.set_link_origin(Some(ORIGIN)).unwrap();
    }
    Served {
        app,
        webview,
        local,
        told,
        _dirs: vec![vault, ui, data, config],
        _files: files,
    }
}

impl Served {
    /// The first payload of `event` that `wanted` takes, waited for.
    fn heard(&self, event: &str, wanted: impl Fn(&Value) -> bool) -> Value {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            if let Some((_, p)) = lock(&self.told)
                .iter()
                .find(|(e, p)| e == event && wanted(p))
            {
                return p.clone();
            }
            assert!(Instant::now() < deadline, "{event} was not told");
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    /// A request through the internet link's listener, as the tunnel
    /// forwards a player's.
    fn through(&self, method: reqwest::Method, path: &str) -> reqwest::blocking::RequestBuilder {
        let port = self.local.status().unwrap().link_port.unwrap();
        reqwest::blocking::Client::new()
            .request(method, format!("http://127.0.0.1:{port}{path}"))
            .header("host", NAME)
            .header("origin", ORIGIN)
            .header("x-forwarded-for", "198.51.100.7")
            .header("x-forwarded-proto", "https")
    }
}

type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// The next message of `ws` that `wanted` takes.
fn next_where(ws: &mut Socket, wanted: impl Fn(&Value) -> bool) -> Value {
    tauri::async_runtime::block_on(async {
        loop {
            let m = tokio::time::timeout(Duration::from_secs(20), ws.next())
                .await
                .expect("a message in time")
                .expect("open")
                .unwrap();
            if let Message::Text(t) = m {
                let v: Value = serde_json::from_str(&t).unwrap();
                if wanted(&v) {
                    return v;
                }
            }
        }
    })
}

fn ask(ws: &mut Socket, id: u64, cmd: &str, args: Value) -> Value {
    let text = json!({ "id": id, "cmd": cmd, "args": args }).to_string();
    tauri::async_runtime::block_on(ws.send(Message::Text(text.into()))).unwrap();
    next_where(ws, |v| v["id"].as_u64() == Some(id))
}

/// The window, seated, makes its folder a table and invites — its click
/// the proof — and a player, Ana, accepts through the link and sits.
fn invite_ana(s: &Served) -> Socket {
    call(&s.webview, "campaign_make", json!({ "root": "" })).unwrap();
    // The click is the proof: the window invites as the admin it is.
    let invited = call(&s.webview, "campaign_invite", json!({ "root": "" })).unwrap();
    let link = invited["link"].as_str().unwrap().to_owned();
    assert!(link.starts_with(&format!("{ORIGIN}/invite/")), "{invited}");
    let token = link.rsplit_once("/invite/").unwrap().1;

    // The player accepts through the link and sits.
    let accepted = s
        .through(reqwest::Method::POST, &format!("/api/invite/{token}"))
        .json(&json!({ "email": "ana@example.org", "name": "Ana", "password": "uma senha longa da mesa 2026", "lang": "pt" }))
        .send()
        .unwrap();
    assert_eq!(accepted.status().as_u16(), 200);
    let cookie = accepted
        .headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .unwrap()
        .to_owned();
    let folders: Value = s
        .through(reqwest::Method::GET, "/api/folders")
        .header("cookie", &cookie)
        .send()
        .unwrap()
        .json()
        .unwrap();
    let folder = folders["folders"][0]["id"].as_str().unwrap().to_owned();
    let port = s.local.status().unwrap().link_port.unwrap();
    let mut req = format!("ws://127.0.0.1:{port}/api/ws")
        .into_client_request()
        .unwrap();
    for (k, v) in [
        ("host", NAME),
        ("origin", ORIGIN),
        ("x-forwarded-for", "198.51.100.7"),
        ("x-forwarded-proto", "https"),
        ("cookie", cookie.as_str()),
    ] {
        req.headers_mut().insert(k, v.parse().unwrap());
    }
    let (mut ana, _) =
        tauri::async_runtime::block_on(tokio_tungstenite::connect_async(req)).unwrap();
    next_where(&mut ana, |v| v.get("hello").is_some());
    let opened = ask(&mut ana, 1, "open_server_folder", json!({ "id": folder }));
    assert!(opened.get("ok").is_some(), "{opened}");
    let joined = ask(
        &mut ana,
        2,
        "table_join",
        json!({ "color": null, "styles": null }),
    );
    assert!(joined.get("ok").is_some(), "{joined}");
    ana
}

/// A folder this app does not serve has no table, and no seat: as before.
#[test]
fn a_folder_not_served_has_no_table_and_no_seat() {
    let s = served(false);
    let table = call(
        &s.webview,
        "table_join",
        json!({ "color": null, "styles": null }),
    )
    .unwrap_err();
    assert_eq!(table["kind"], "refused", "{table}");
    assert!(table.to_string().contains("alone has none"), "{table}");
    let seat = call(&s.webview, "local_server_sit_at_table", json!({})).unwrap_err();
    assert_eq!(seat["kind"], "refused", "{seat}");
    assert!(seat.to_string().contains("serving on"), "{seat}");
    // Serving another folder: this one is still not served.
    let other = tempfile::tempdir().unwrap();
    s.local
        .set_settings(&LocalSettings {
            folders: vec![other.path().to_string_lossy().into_owned()],
            network: false,
            ..LocalSettings::default()
        })
        .unwrap();
    s.local.link_open().unwrap();
    let seat = call(&s.webview, "local_server_sit_at_table", json!({})).unwrap_err();
    assert!(seat.to_string().contains("not served"), "{seat}");
    assert!(remote::of(s.app.handle(), "main").is_none());
    let table = call(
        &s.webview,
        "table_join",
        json!({ "color": null, "styles": null }),
    )
    .unwrap_err();
    assert!(table.to_string().contains("alone has none"), "{table}");
}

/// The window sits at the table of the folder it serves: the owner there,
/// it makes the folder a table and invites — its click the proof — and a
/// player who came in by the link sits with it: the player hears the
/// master's message, the window the player's roll. Serving stops: the
/// window is let go and told, and a start brings back this computer's
/// folder, never the seat.
#[test]
fn the_window_sits_at_its_own_table_with_a_player() {
    let s = served(true);
    let key = call(&s.webview, "current_folder", json!({})).unwrap()["key"].clone();
    let sat = call(&s.webview, "local_server_sit_at_table", json!({})).unwrap();
    assert!(sat["name"].is_string(), "{sat}");
    // A start brings back this computer's folder, never the seat.
    let config = s.app.state::<App>().service.config().map(Path::to_path_buf);
    assert_eq!(
        verso_core::session::open_windows(config.as_deref()),
        vec![key.as_str().unwrap().to_owned()]
    );
    let joined = call(
        &s.webview,
        "table_join",
        json!({ "color": "#3b82f6", "styles": null }),
    )
    .unwrap();
    assert_eq!(joined["role"], "owner", "{joined}");
    let mut ana = invite_ana(&s);

    let said = call(
        &s.webview,
        "table_say",
        json!({ "text": "Boa noite, mesa" }),
    )
    .unwrap();
    let entry = next_where(&mut ana, |v| {
        v["event"] == "table-entry" && v["payload"]["text"] == "Boa noite, mesa"
    });
    assert_eq!(entry["payload"]["by"], said["by"]);
    let rolled = ask(
        &mut ana,
        3,
        "table_roll",
        json!({ "notation": "1d20", "source": null, "path": null, "secret": null, "styles": null }),
    );
    let total = rolled["ok"]["roll"]["total"].clone();
    assert!(total.is_number(), "{rolled}");
    let heard = s.heard("table-entry", |p| p["by"] == "Ana");
    assert_eq!(heard["roll"]["total"], total);

    // Serving stops: the window is let go of the seat and told.
    s.local.stop();
    let gone = s.heard("server-gone", |_| true);
    // Said as the seat's, never as a session a server ended.
    assert_eq!(gone["what"], "seat", "{gone}");
    let deadline = Instant::now() + Duration::from_secs(10);
    while remote::of(s.app.handle(), "main").is_some() {
        assert!(Instant::now() < deadline, "the seat was let go");
        std::thread::sleep(Duration::from_millis(50));
    }
    let table = call(
        &s.webview,
        "table_join",
        json!({ "color": null, "styles": null }),
    )
    .unwrap_err();
    assert_eq!(table["kind"], "refused", "{table}");
}

/// `done` waited for, `what` said when it does not come.
fn waited(what: &str, mut done: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(30);
    while !done() {
        assert!(Instant::now() < deadline, "{what}");
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// A served folder that syncs with a UniVerso goes on syncing while its
/// window sits at the table this computer serves from it (decided
/// 2026-11-06, "Não deve parar"): what the window writes at the table
/// reaches the UniVerso, what another computer sends there reaches the
/// table's player, and serving stopping and the window coming back to the
/// folder leave the same sync running, the folder the window's again.
#[test]
fn a_synced_folder_goes_on_syncing_while_its_window_sits_at_its_table() {
    use super::tests_sync::{device, serve, sync, text, write};
    let universo = serve(&[]);
    let s = served(true);
    let config = s.app.state::<App>().service.config().map(Path::to_path_buf);
    verso_core::servers::keep(
        config.as_deref(),
        verso_core::servers::ServerLogin {
            url: universo.url.clone(),
            token: universo.owner.clone(),
            email: "ana@casa.lan".into(),
            name: "Ana".into(),
        },
    )
    .unwrap();
    let key = call(&s.webview, "current_folder", json!({})).unwrap()["key"]
        .as_str()
        .unwrap()
        .to_owned();
    let on = call(
        &s.webview,
        "folder_sync_start",
        json!({ "url": universo.url, "folder": universo.folder, "name": null }),
    )
    .unwrap();
    assert_eq!(on["on"], true, "{on}");
    // Another computer of the same person, on the UniVerso's folder.
    let other = device(&universo, &universo.owner, &[]);
    waited("the folder reached the UniVerso", || {
        sync(&other);
        text(&other, "Sessao.md").is_some()
    });
    let running = sync_commands::running(s.app.handle(), &key).unwrap();

    call(&s.webview, "local_server_sit_at_table", json!({})).unwrap();
    assert!(remote::of(s.app.handle(), "main").is_some());
    // The folder's windows are counted again, as when one closes: the seat
    // keeps the sync.
    sync_commands::settle(s.app.handle());
    let still = sync_commands::running(s.app.handle(), &key);
    assert!(
        still.is_some_and(|t| Arc::ptr_eq(&t, &running)),
        "the sync stopped when the window sat at the table"
    );
    let mut ana = invite_ana(&s);

    // Written at the table: on the UniVerso.
    call(
        &s.webview,
        "create_note",
        json!({ "name": "Da mesa", "text": "# Da mesa\n" }),
    )
    .unwrap();
    waited("the table's note reached the UniVerso", || {
        sync(&other);
        text(&other, "Da mesa.md").is_some()
    });
    // Sent from the other computer into a place every player sees: at the
    // table, the player's too.
    call(
        &s.webview,
        "create_note",
        json!({ "name": "Praça/Fonte", "text": "água\n" }),
    )
    .unwrap();
    let seen = json!({ "kind": "set", "set": { "whole": "see", "rows": [] }, "secret_name": null });
    call(
        &s.webview,
        "access_set",
        json!({ "paths": ["Praça"], "change": seen }),
    )
    .unwrap();
    write(&other, "Praça/De longe.md", b"# De longe\n");
    sync(&other);
    waited("the UniVerso's note reached the table", || {
        call(
            &s.webview,
            "read_note",
            json!({ "path": "Praça/De longe.md" }),
        )
        .is_ok_and(|r| r["text"] == "# De longe\n")
    });
    let mut id = 10;
    waited("the UniVerso's note reached the player", || {
        id += 1;
        let last = ask(
            &mut ana,
            id,
            "read_note",
            json!({ "path": "Praça/De longe.md" }),
        );
        last["ok"]["text"] == "# De longe\n"
    });

    // Serving stops: the window is let go of the seat, and the sync runs on
    // while it comes back to the folder, and after.
    s.local.stop();
    waited("the seat was let go", || {
        remote::of(s.app.handle(), "main").is_none()
    });
    sync_commands::settle(s.app.handle());
    assert!(
        sync_commands::running(s.app.handle(), &key).is_some_and(|t| Arc::ptr_eq(&t, &running))
    );
    call(&s.webview, "reopen_folder", json!({ "key": key })).unwrap();
    sync_commands::settle(s.app.handle());
    assert!(
        sync_commands::running(s.app.handle(), &key).is_some_and(|t| Arc::ptr_eq(&t, &running))
    );
    // The seat held the folder no longer: the window does.
    assert_eq!(
        s.app.state::<App>().service.clients_of(&key),
        vec!["main".to_owned()]
    );
    let status = call(&s.webview, "folder_sync", json!({})).unwrap();
    assert_eq!(status["on"], true, "{status}");
}
