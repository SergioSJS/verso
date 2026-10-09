// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The server driven as a browser drives it: over HTTP and the contract's
//! WebSocket, on a port of its own, with a folder on a temporary disk.

use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use super::*;

/// The test's runtime, built by hand: `#[tokio::test]` expands to an
/// `expect` the workspace forbids (`CLAUDE.md` §3).
fn block_on<F: std::future::Future>(f: F) -> F::Output {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(f)
}

struct Running {
    server: Arc<state::Server>,
    addr: SocketAddr,
    _dirs: (tempfile::TempDir, tempfile::TempDir),
    _stop: tokio::sync::oneshot::Sender<()>,
}

impl Running {
    fn url(&self, path: &str) -> String {
        format!("http://localhost:{}{path}", self.addr.port())
    }

    fn origin(&self) -> String {
        format!("http://localhost:{}", self.addr.port())
    }
}

fn config(data: &std::path::Path, folders: &std::path::Path) -> Config {
    struct Loopback;
    impl config::Env for Loopback {
        fn var(&self, name: &str) -> Option<String> {
            (name == "VERSO_LISTEN").then(|| "127.0.0.1:0".to_owned())
        }
    }
    Config::from_env(
        &Loopback,
        &config::Defaults {
            data_dir: data.to_owned(),
            folders_dir: folders.to_owned(),
            ui_dir: data.join("ui"),
        },
    )
    .unwrap()
}

/// A server with an admin and one folder, "Campanha", owned by the admin.
async fn start() -> Running {
    let data = tempfile::tempdir().unwrap();
    let folders = tempfile::tempdir().unwrap();
    verso_fs::server::make_folder(folders.path(), "Campanha").unwrap();
    let note = folders.path().join("Campanha").join("Sessao.md");
    {
        use std::io::Write;
        let mut f = tempfile::NamedTempFile::new_in(folders.path().join("Campanha")).unwrap();
        f.write_all(b"# Sessao\n").unwrap();
        f.persist(&note).unwrap();
        let mut f = tempfile::NamedTempFile::new_in(folders.path().join("Campanha")).unwrap();
        f.write_all(b"<svg xmlns='http://www.w3.org/2000/svg'/>")
            .unwrap();
        f.persist(folders.path().join("Campanha").join("mapa.svg"))
            .unwrap();
    }
    let config = config(data.path(), folders.path());
    let db = prepare(&config).unwrap();
    let admin = db
        .create_account(
            "admin@casa.lan",
            "Admin",
            "pt",
            Some("senha muito longa"),
            true,
        )
        .unwrap();
    db.create_folder("Campanha", &admin.id).unwrap();
    let server = state::Server::new(config, db, contract_version(), "test".into());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    let s = Arc::clone(&server);
    tokio::spawn(async move {
        let _ = run(s, listener, async {
            let _ = rx.await;
        })
        .await;
    });
    Running {
        server,
        addr,
        _dirs: (data, folders),
        _stop: tx,
    }
}

/// A browser signed in: its cookie and its CSRF token.
struct Browser {
    cookie: String,
    csrf: String,
}

async fn post(r: &Running, path: &str, body: Value, b: Option<&Browser>) -> (u16, Value) {
    let client = reqwest::Client::new();
    let mut req = client
        .post(r.url(path))
        .header("origin", r.origin())
        .json(&body);
    if let Some(b) = b {
        req = req
            .header("cookie", &b.cookie)
            .header("x-verso-csrf", &b.csrf);
    }
    let res = req.send().await.unwrap();
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

async fn get(r: &Running, path: &str, b: Option<&Browser>) -> (u16, Value) {
    let mut req = reqwest::Client::new().get(r.url(path));
    if let Some(b) = b {
        req = req.header("cookie", &b.cookie);
    }
    let res = req.send().await.unwrap();
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

async fn sign_in(r: &Running, email: &str, password: &str) -> Browser {
    let res = reqwest::Client::new()
        .post(r.url("/api/signin"))
        .header("origin", r.origin())
        .json(&json!({ "email": email, "password": password }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status().as_u16(), 200);
    let cookie = res
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let body: Value = res.json().await.unwrap();
    Browser {
        cookie,
        csrf: body["csrf"].as_str().unwrap().to_owned(),
    }
}

type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn connect(
    r: &Running,
    cookie: Option<&str>,
    origin: Option<&str>,
    bearer: Option<&str>,
) -> Result<Socket, u16> {
    let mut req = format!("ws://localhost:{}/api/ws", r.addr.port())
        .into_client_request()
        .unwrap();
    if let Some(c) = cookie {
        req.headers_mut().insert("cookie", c.parse().unwrap());
    }
    if let Some(o) = origin {
        req.headers_mut().insert("origin", o.parse().unwrap());
    }
    if let Some(t) = bearer {
        req.headers_mut()
            .insert("authorization", format!("Bearer {t}").parse().unwrap());
    }
    match tokio_tungstenite::connect_async(req).await {
        Ok((ws, _)) => Ok(ws),
        Err(tokio_tungstenite::tungstenite::Error::Http(res)) => Err(res.status().as_u16()),
        Err(e) => panic!("{e}"),
    }
}

/// The next message that is not an event.
async fn next(ws: &mut Socket) -> Value {
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(10), ws.next())
            .await
            .expect("an answer in time")
            .unwrap()
            .unwrap();
        if let Message::Text(t) = m {
            let v: Value = serde_json::from_str(&t).unwrap();
            if v.get("event").is_none() {
                return v;
            }
        }
    }
}

async fn call(ws: &mut Socket, id: u64, cmd: &str, args: Value) -> Value {
    ws.send(Message::Text(
        json!({ "id": id, "cmd": cmd, "args": args })
            .to_string()
            .into(),
    ))
    .await
    .unwrap();
    loop {
        let v = next(ws).await;
        if v.get("id").and_then(Value::as_u64) == Some(id) {
            return v;
        }
    }
}

async fn folder_id(r: &Running, b: &Browser) -> String {
    let (_, me) = get(r, "/api/folders", Some(b)).await;
    me["folders"][0]["id"].as_str().unwrap().to_owned()
}

#[test]
fn a_member_works_on_a_folder_over_the_websocket() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        let hello = next(&mut ws).await;
        assert_eq!(hello["hello"]["contract"], contract_version());
        // Before a folder: no folder.
        let none = call(&mut ws, 1, "list_notes", json!({})).await;
        assert_eq!(none["err"]["kind"], "no_folder", "{none}");
        let info = call(&mut ws, 2, "open_server_folder", json!({ "id": id })).await;
        assert_eq!(info["ok"]["name"], "Campanha", "{info}");
        let notes = call(&mut ws, 3, "list_notes", json!({})).await;
        assert_eq!(notes["ok"], json!(["Sessao.md"]));
        let note = call(&mut ws, 4, "read_note", json!({ "path": "Sessao.md" })).await;
        let revision = note["ok"]["revision"].as_str().unwrap().to_owned();
        let written = call(
        &mut ws,
        5,
        "write_note",
        json!({ "path": "Sessao.md", "text": "# Sessao\n\nNova linha\n", "revision": revision }),
    )
    .await;
        assert!(
            written["ok"]["note"]["text"]
                .as_str()
                .unwrap()
                .contains("Nova linha"),
            "{written}"
        );
        // The revision read before is stale now: refused (invariant 11).
        let stale = call(
            &mut ws,
            6,
            "write_note",
            json!({ "path": "Sessao.md", "text": "x", "revision": revision }),
        )
        .await;
        assert_eq!(stale["err"]["kind"], "changed", "{stale}");
        let caps = call(&mut ws, 7, "capabilities", json!({})).await;
        assert_eq!(caps["ok"]["host"], "server");
        assert!(
            caps["ok"]["can"]
                .as_array()
                .unwrap()
                .contains(&json!("write"))
        );
        assert!(
            caps["ok"]["can"]
                .as_array()
                .unwrap()
                .contains(&json!("admin"))
        );
        let host_only = call(&mut ws, 8, "reveal", json!({ "path": "Sessao.md" })).await;
        assert_eq!(host_only["err"]["kind"], "refused");
        // The key the window keeps opens the folder again.
        let key = info["ok"]["key"].as_str().unwrap();
        let again = call(&mut ws, 9, "reopen_folder", json!({ "key": key })).await;
        assert_eq!(again["ok"]["key"], key);
        // A file of the folder, with the sandbox policy; a note is not a file.
        let res = reqwest::Client::new()
            .get(r.url(&format!("/f/{id}/mapa.svg")))
            .header("cookie", &b.cookie)
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        assert!(
            res.headers()["content-security-policy"]
                .to_str()
                .unwrap()
                .starts_with("sandbox")
        );
        let (md, _) = get(&r, &format!("/f/{id}/Sessao.md"), Some(&b)).await;
        assert_eq!(md, 403);
        let (anon, _) = get(&r, &format!("/f/{id}/mapa.svg"), None).await;
        assert_eq!(anon, 401);
        // The space was counted when the folder opened.
        let (_, mine) = get(&r, "/api/folders", Some(&b)).await;
        assert!(
            mine["folders"][0]["space"]["total"].as_f64().unwrap() > 0.0,
            "{mine}"
        );
    });
}

#[test]
fn the_websocket_wants_a_session_and_this_servers_origin() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        assert_eq!(
            connect(&r, None, Some(&r.origin()), None).await.err(),
            Some(401)
        );
        assert_eq!(
            connect(&r, Some(&b.cookie), Some("http://evil.example"), None)
                .await
                .err(),
            Some(403)
        );
        assert_eq!(
            connect(&r, Some(&b.cookie), None, None).await.err(),
            Some(403)
        );
        // A session ended elsewhere: the next command is refused and the
        // connection told.
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        let (status, _) = post(&r, "/api/signout", json!({}), Some(&b)).await;
        assert_eq!(status, 200);
        let after = call(&mut ws, 1, "list_notes", json!({})).await;
        assert_eq!(after["err"]["message"], "signed out", "{after}");
    });
}

#[test]
fn an_invited_reader_reads_and_cannot_write() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (status, inv) = post(
            &r,
            "/api/admin/invitations",
            json!({ "email": "leitor@casa.lan", "folder": id, "role": "reader" }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 200, "{inv}");
        let link = inv["link"].as_str().unwrap();
        let token = link.rsplit('/').next().unwrap();
        let (_, offer) = get(&r, &format!("/api/invite/{token}"), None).await;
        assert_eq!(offer["folder"], "Campanha");
        let (status, accepted) = post(
        &r,
        &format!("/api/invite/{token}"),
        json!({ "email": "ignorado@x.y", "name": "Leitor", "password": "outra senha longa", "lang": "en" }),
        None,
    )
    .await;
        assert_eq!(status, 200, "{accepted}");
        assert_eq!(accepted["account"]["email"], "leitor@casa.lan");
        assert_eq!(accepted["account"]["mayCreate"], false);
        // Used once.
        let (again, _) = post(
            &r,
            &format!("/api/invite/{token}"),
            json!({ "email": "x@y.z", "name": "X", "password": "outra senha longa", "lang": "en" }),
            None,
        )
        .await;
        assert_eq!(again, 404);
        let (_, list) = get(&r, "/api/admin/invitations", Some(&admin)).await;
        assert_eq!(list[0]["state"], "used");
        assert_eq!(list[0]["usedBy"], "leitor@casa.lan");
        let reader = sign_in(&r, "leitor@casa.lan", "outra senha longa").await;
        let mut ws = connect(&r, Some(&reader.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let notes = call(&mut ws, 2, "list_notes", json!({})).await;
        assert_eq!(notes["ok"], json!(["Sessao.md"]));
        let write = call(
            &mut ws,
            3,
            "create_note",
            json!({ "name": "Minha", "text": "x" }),
        )
        .await;
        assert_eq!(write["err"]["kind"], "refused", "{write}");
        let caps = call(&mut ws, 4, "capabilities", json!({})).await;
        assert!(
            !caps["ok"]["can"]
                .as_array()
                .unwrap()
                .contains(&json!("write"))
        );
        assert!(
            !caps["ok"]["can"]
                .as_array()
                .unwrap()
                .contains(&json!("admin"))
        );
        // Not an admin, and no folder made without the admin's leave.
        assert_eq!(get(&r, "/api/admin/accounts", Some(&reader)).await.0, 403);
        assert_eq!(
            post(
                &r,
                "/api/folders",
                json!({ "name": "Minha" }),
                Some(&reader)
            )
            .await
            .0,
            403
        );
        // The owner promotes them: the open window learns it.
        let reader_id = accepted["account"]["id"].as_str().unwrap();
        let (status, _) = put(
            &r,
            &format!("/api/folders/{id}/members/{reader_id}"),
            json!({ "role": "editor" }),
            &admin,
        )
        .await;
        assert_eq!(status, 200);
        let made = call(
            &mut ws,
            5,
            "create_note",
            json!({ "name": "Minha", "text": "x" }),
        )
        .await;
        assert_eq!(made["ok"]["path"], "Minha.md", "{made}");
        // The audit log has the invitation and the grant, for the owner.
        let (_, log) = get(&r, &format!("/api/folders/{id}/audit"), Some(&admin)).await;
        let actions: Vec<&str> = log
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["action"].as_str().unwrap())
            .collect();
        assert!(
            actions.contains(&"grant_editor") && actions.contains(&"invitation_used"),
            "{actions:?}"
        );
    });
}

async fn put(r: &Running, path: &str, body: Value, b: &Browser) -> (u16, Value) {
    let res = reqwest::Client::new()
        .put(r.url(path))
        .header("origin", r.origin())
        .header("cookie", &b.cookie)
        .header("x-verso-csrf", &b.csrf)
        .json(&body)
        .send()
        .await
        .unwrap();
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

#[test]
fn a_stranger_sees_no_folder_and_wrong_passwords_slow_down() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (_, made) = post(
            &r,
            "/api/admin/accounts",
            json!({ "email": "outro@casa.lan", "name": "Outro", "lang": "pt" }),
            Some(&admin),
        )
        .await;
        let link = made["link"].as_str().unwrap();
        let token = link.rsplit('/').next().unwrap();
        let (status, _) = post(
            &r,
            &format!("/api/reset/{token}"),
            json!({ "password": "a senha do outro" }),
            None,
        )
        .await;
        assert_eq!(status, 200);
        let other = sign_in(&r, "outro@casa.lan", "a senha do outro").await;
        let mut ws = connect(&r, Some(&other.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        let open = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        assert_eq!(open["err"]["kind"], "not_found", "{open}");
        assert_eq!(
            get(&r, &format!("/f/{id}/mapa.svg"), Some(&other)).await.0,
            404
        );
        // The admin, too, has no folder they were not given: entering is a
        // grant to themselves, in the log.
        for n in 0..4 {
            let (status, body) = post(
                &r,
                "/api/signin",
                json!({ "email": "outro@casa.lan", "password": "errada" }),
                None,
            )
            .await;
            assert_eq!(status, if n < 3 { 401 } else { 429 }, "{body}");
        }
    });
}

#[test]
fn the_desktop_signs_in_through_the_browser() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (status, started) = post(
            &r,
            "/api/device/start",
            json!({ "device": "Verso · MacBook" }),
            None,
        )
        .await;
        assert_eq!(status, 200, "{started}");
        let code = started["code"].as_str().unwrap();
        let poll = started["poll"].as_str().unwrap();
        let (_, waiting) = post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
        assert_eq!(waiting["pending"], true);
        let (_, what) = get(&r, &format!("/api/device/{code}"), Some(&admin)).await;
        assert_eq!(what["device"], "Verso · MacBook");
        let (status, _) = post(&r, &format!("/api/device/{code}"), json!({}), Some(&admin)).await;
        assert_eq!(status, 200);
        let (_, done) = post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
        let token = done["token"].as_str().unwrap();
        // The device's token opens the WebSocket without a browser's origin.
        let mut ws = connect(&r, None, None, Some(token)).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        // Given once.
        let (gone, _) = post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
        assert_eq!(gone, 410);
        // Listed among the sessions, and revocable there.
        let (_, sessions) = get(&r, "/api/me/sessions", Some(&admin)).await;
        assert!(
            sessions
                .as_array()
                .unwrap()
                .iter()
                .any(|s| s["session"]["kind"] == "device")
        );
    });
}

#[test]
fn the_lost_admin_comes_back_from_the_machine() {
    block_on(async {
        let r = start().await;
        let old = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let link = admin_reset(&r.server.config, "Admin@Casa.lan").unwrap();
        assert!(link.contains("/reset/"));
        assert_eq!(get(&r, "/api/me", Some(&old)).await.0, 401);
        let token = link.rsplit('/').next().unwrap();
        let (status, _) = post(
            &r,
            &format!("/api/reset/{token}"),
            json!({ "password": "uma senha nova longa" }),
            None,
        )
        .await;
        assert_eq!(status, 200);
        sign_in(&r, "admin@casa.lan", "uma senha nova longa").await;
        assert!(admin_reset(&r.server.config, "ninguem@casa.lan").is_err());
    });
}

#[test]
fn a_token_reaches_its_folders_only() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (status, made) = post(
            &r,
            "/api/me/tokens",
            json!({ "name": "script", "write": false, "days": 30, "folders": [id] }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 200, "{made}");
        let secret = made["secret"].as_str().unwrap();
        let mut ws = connect(&r, None, None, Some(secret)).await.unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        assert_eq!(
            call(&mut ws, 2, "list_notes", json!({})).await["ok"],
            json!(["Sessao.md"])
        );
        let write = call(
            &mut ws,
            3,
            "create_note",
            json!({ "name": "X", "text": "x" }),
        )
        .await;
        assert_eq!(write["err"]["kind"], "refused");
        // A token is no admin, even an admin's.
        let res = reqwest::Client::new()
            .get(r.url("/api/admin/accounts"))
            .header("authorization", format!("Bearer {secret}"))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 403);
    });
}

#[test]
fn the_server_serves_its_own_tls() {
    block_on(async {
        use std::io::Write;
        let dir = tempfile::tempdir().unwrap();
        let cert = rcgen::generate_simple_self_signed(vec!["localhost".to_owned()]).unwrap();
        let write = |name: &str, text: &str| {
            let mut f = tempfile::NamedTempFile::new_in(dir.path()).unwrap();
            f.write_all(text.as_bytes()).unwrap();
            f.persist(dir.path().join(name)).unwrap();
        };
        write("cert.pem", &cert.cert.pem());
        write("key.pem", &cert.signing_key.serialize_pem());
        let acceptor =
            tls::acceptor(&dir.path().join("cert.pem"), &dir.path().join("key.pem")).unwrap();
        assert!(tls::acceptor(&dir.path().join("key.pem"), &dir.path().join("key.pem")).is_err());
        let r = start().await;
        let tcp = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = tcp.local_addr().unwrap().port();
        let listener = tls::TlsListener::new(tcp, acceptor).unwrap();
        let server = Arc::clone(&r.server);
        tokio::spawn(async move {
            let _ = run_on(server, listener, std::future::pending()).await;
        });
        let client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap();
        let state: Value = client
            .get(format!("https://localhost:{port}/api/state"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(state["contract"], contract_version());
        // Plain HTTP to the TLS port gets nothing.
        assert!(
            reqwest::get(format!("http://localhost:{port}/api/state"))
                .await
                .is_err()
        );
    });
}

/// The next event of `name` the socket hears.
async fn event_named(ws: &mut Socket, name: &str) -> Value {
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(10), ws.next())
            .await
            .expect("an event in time")
            .unwrap()
            .unwrap();
        if let Message::Text(t) = m {
            let v: Value = serde_json::from_str(&t).unwrap();
            if v["event"] == name {
                return v["payload"].clone();
            }
        }
    }
}

#[test]
fn two_windows_edit_one_note_and_the_file_follows() {
    use base64::Engine;
    use yrs::updates::decoder::Decode;
    use yrs::{GetString, ReadTxn, Text, Transact};
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut one = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        let mut two = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        for ws in [&mut one, &mut two] {
            next(ws).await;
            call(ws, 1, "open_server_folder", json!({ "id": id })).await;
        }
        let joined = call(&mut one, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        assert_eq!(joined["ok"]["read_only"], false, "{joined}");
        call(&mut two, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        // Window one's document, from the state it was given; it types.
        let doc = yrs::Doc::with_options(yrs::Options {
            offset_kind: yrs::OffsetKind::Utf16,
            ..Default::default()
        });
        let state = base64::engine::general_purpose::STANDARD
            .decode(joined["ok"]["update"].as_str().unwrap())
            .unwrap();
        doc.transact_mut()
            .apply_update(yrs::Update::decode_v1(&state).unwrap())
            .unwrap();
        let text = doc.get_or_insert_text(collab::TEXT);
        let typed = {
            let mut txn = doc.transact_mut();
            let len = text.get_string(&txn).encode_utf16().count() as u32;
            text.insert(&mut txn, len, "\nescrito junto\n");
            txn.encode_update_v1()
        };
        let update = base64::engine::general_purpose::STANDARD.encode(typed);
        let sent = call(
            &mut one,
            3,
            "collab_update",
            json!({ "path": "Sessao.md", "update": update }),
        )
        .await;
        assert!(sent.get("ok").is_some(), "{sent}");
        // Window two hears the edit, then the write.
        let heard = event_named(&mut two, "collab-update").await;
        assert_eq!(heard["update"], update);
        let saved = event_named(&mut two, "collab-saved").await;
        let revision = saved["revision"].as_str().unwrap().to_owned();
        let note = call(&mut two, 4, "read_note", json!({ "path": "Sessao.md" })).await;
        assert_eq!(note["ok"]["text"], "# Sessao\n\nescrito junto\n");
        assert_eq!(note["ok"]["revision"], revision.as_str());
        // A write from elsewhere (a property) is merged into the room.
        let written = call(
            &mut two,
            5,
            "write_note",
            json!({ "path": "Sessao.md", "text": "---\ntag: x\n---\n# Sessao\n\nescrito junto\n", "revision": revision }),
        )
        .await;
        assert!(written.get("ok").is_some(), "{written}");
        let merged = event_named(&mut one, "collab-update").await;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(merged["update"].as_str().unwrap())
            .unwrap();
        doc.transact_mut()
            .apply_update(yrs::Update::decode_v1(&bytes).unwrap())
            .unwrap();
        assert_eq!(
            text.get_string(&doc.transact()),
            "---\ntag: x\n---\n# Sessao\n\nescrito junto\n"
        );
        // A stale revision is refused (invariant 11).
        let stale = call(
            &mut two,
            6,
            "write_note",
            json!({ "path": "Sessao.md", "text": "x", "revision": revision }),
        )
        .await;
        assert_eq!(stale["err"]["kind"], "changed", "{stale}");
        let _ = doc.transact().state_vector();
    });
}
