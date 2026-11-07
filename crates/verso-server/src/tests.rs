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
pub(crate) fn block_on<F: std::future::Future>(f: F) -> F::Output {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(f)
}

/// How many test servers may be alive at once. Each one's folder, once a
/// test opens it, registers a native watcher, and on macOS that is an
/// FSEvents stream started (and, when the folder closes, stopped) through
/// `fseventsd`, which serves the registrations one after another: with a
/// server per test thread (16 on the maintainer's Mac) the last ones queued
/// past the 10 s wait of [`next`] and the tests failed for no fault of the
/// code under test. Not a number to raise to make the suite faster: it is
/// bounded by `fseventsd`. Measured on 2026-10-10 at the default 16 threads:
/// 6 still left a folder's second open waiting past 10 s in 4 runs of 5; 4
/// passed 6 runs of 6. The tests stay independent and parallel; only the
/// number of them holding a server at once is capped.
static SERVERS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);

pub(crate) struct Running {
    pub(crate) server: Arc<state::Server>,
    pub(crate) addr: SocketAddr,
    _dirs: (tempfile::TempDir, tempfile::TempDir),
    _stop: tokio::sync::oneshot::Sender<()>,
    /// One of [`SERVERS`], given back when the test drops its server; last,
    /// so it is released after the server has been told to stop. `None` only
    /// for a handle a test builds around a second server that opens no
    /// folder, while its own [`start`] already holds a permit: a test that
    /// waited for two could leave every permit held and every test waiting.
    _permit: Option<tokio::sync::SemaphorePermit<'static>>,
    /// The server's port on `::1`, held: see [`loopback`].
    _v6: Option<V6Hold>,
}

/// The two ends of a connection on `::1`, one at a test server's port: no
/// other socket there has the port, and a connection to it is refused at
/// once (macOS leaves one to a socket bound and not listening unanswered).
pub(crate) type V6Hold = (tokio::net::TcpStream, tokio::net::TcpStream);

/// A listener for a test server on 127.0.0.1, its port held on `::1`
/// while the server runs ([`V6Hold`]). The tests ask `localhost`, which a
/// client tries on `::1` first, where nothing listens. But ephemeral ports
/// run through one range for both families, and a port taken on 127.0.0.1
/// is free on `::1`: when the count came round to the server's port as a
/// client connected to it there, the client's socket got that port and
/// connected to itself (TCP's simultaneous open), or two such clients to
/// each other, and read its own request back: hyper's `Parse(Version)`, or
/// `IncompleteMessage` for the one whose peer gave up first (seen in
/// `tests_audience_review` on 2026-11-05, ports 49784 and 49786 at once).
pub(crate) async fn loopback() -> (tokio::net::TcpListener, Option<V6Hold>) {
    loop {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        // No IPv6 loopback here: no client socket can be on it either.
        let Ok(peer) = tokio::net::TcpListener::bind("[::1]:0").await else {
            return (listener, None);
        };
        let end = tokio::net::TcpSocket::new_v6().unwrap();
        match end.bind(SocketAddr::from((std::net::Ipv6Addr::LOCALHOST, port))) {
            Ok(()) => {}
            // Taken on `::1` (or kept by Windows): another port.
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::AddrInUse | std::io::ErrorKind::PermissionDenied
                ) =>
            {
                continue;
            }
            Err(e) => panic!("binding [::1]:{port}: {e}"),
        }
        let (ours, theirs) = tokio::join!(end.connect(peer.local_addr().unwrap()), peer.accept());
        return (listener, Some((ours.unwrap(), theirs.unwrap().0)));
    }
}

impl Running {
    pub(crate) fn url(&self, path: &str) -> String {
        format!("http://localhost:{}{path}", self.addr.port())
    }

    pub(crate) fn addr(&self) -> SocketAddr {
        self.addr
    }

    /// The test folder's directory on the server's disk.
    pub(crate) fn campanha(&self) -> std::path::PathBuf {
        self._dirs.1.path().join("Campanha")
    }

    /// A note's text in the test folder, read through `verso-fs` as the
    /// server reads it (ADR 0029: no `std::fs` outside `data.rs`).
    pub(crate) fn campanha_text(&self, relative: &str) -> String {
        let mut root = verso_fs::Root::open(self.campanha(), Vec::new()).unwrap();
        let handle = root.handle(std::path::Path::new(relative)).unwrap();
        String::from_utf8(root.read(handle).unwrap().0).unwrap()
    }

    pub(crate) fn origin(&self) -> String {
        format!("http://localhost:{}", self.addr.port())
    }
}

/// Every test server's configuration. The update check is off, as
/// `VERSO_UPDATE_CHECK=off` turns it off but through this table rather than
/// the process's environment: a test server never reaches the network
/// (dozens of them asking the release feed at once were limited by GitHub).
pub(crate) fn config(data: &std::path::Path, folders: &std::path::Path) -> Config {
    struct Loopback;
    impl config::Env for Loopback {
        fn var(&self, name: &str) -> Option<String> {
            match name {
                "VERSO_LISTEN" => Some("127.0.0.1:0".to_owned()),
                "VERSO_UPDATE_CHECK" => Some("off".to_owned()),
                // The tests of a proxy name it; the rest are direct
                // connections. An unset variable believes the private
                // networks, which this machine is one of (ADR 0073 item 6,
                // amended 2026-10-16: tests_http.rs).
                "VERSO_TRUSTED_PROXY" => Some("none".to_owned()),
                _ => None,
            }
        }
    }
    let config = Config::from_env(
        &Loopback,
        &config::Defaults {
            data_dir: data.to_owned(),
            folders_dir: folders.to_owned(),
            ui_dir: data.join("ui"),
        },
    )
    .unwrap();
    assert!(
        !config.update_check,
        "a test server never asks the release feed"
    );
    config
}

/// A server with an admin and one folder, "Campanha", owned by the admin.
pub(crate) async fn start() -> Running {
    start_with(|_| {}).await
}

/// The same, its configuration changed by `edit` first (a trusted proxy,
/// a public address).
pub(crate) async fn start_with(edit: impl FnOnce(&mut Config)) -> Running {
    let permit = SERVERS.acquire().await.unwrap();
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
    let mut config = Config {
        web: true,
        ..config(data.path(), folders.path())
    };
    // The port is known before the configuration is final, so a test may
    // ask for a public address that is this server's own: "@self".
    let (listener, v6) = loopback().await;
    edit(&mut config);
    let own = listener.local_addr().unwrap().port();
    match config.public_url.as_deref() {
        Some("@self") => config.public_url = Some(format!("http://localhost:{own}")),
        Some("@self-https") => config.public_url = Some(format!("https://localhost:{own}")),
        _ => {}
    }
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
        _permit: Some(permit),
        _v6: v6,
    }
}

/// A browser signed in: its cookie and its CSRF token.
pub(crate) struct Browser {
    pub(crate) cookie: String,
    pub(crate) csrf: String,
}

pub(crate) async fn post(
    r: &Running,
    path: &str,
    body: Value,
    b: Option<&Browser>,
) -> (u16, Value) {
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

pub(crate) async fn get(r: &Running, path: &str, b: Option<&Browser>) -> (u16, Value) {
    let mut req = reqwest::Client::new().get(r.url(path));
    if let Some(b) = b {
        req = req.header("cookie", &b.cookie);
    }
    let res = req.send().await.unwrap();
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

pub(crate) async fn sign_in(r: &Running, email: &str, password: &str) -> Browser {
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

pub(crate) type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

pub(crate) async fn connect(
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
pub(crate) async fn next(ws: &mut Socket) -> Value {
    loop {
        // 30 s, not a product timeout: opening a folder waits on fseventsd, which queues under machine load.
        let m = tokio::time::timeout(std::time::Duration::from_secs(30), ws.next())
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

pub(crate) async fn call(ws: &mut Socket, id: u64, cmd: &str, args: Value) -> Value {
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

pub(crate) async fn folder_id(r: &Running, b: &Browser) -> String {
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
        assert_eq!(
            hello["hello"]["contractVersion"],
            verso_contract::compat::VERSION
        );
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
        // A server never runs a program (ADR 0115 items 6 and 23): no
        // terminal in its answer, and its commands are not its own.
        assert!(
            !caps["ok"]["can"]
                .as_array()
                .unwrap()
                .contains(&json!("terminal"))
        );
        let shell = call(
            &mut ws,
            80,
            "terminal_write",
            json!({ "id": "x-1", "data": "ls\r" }),
        )
        .await;
        assert_eq!(shell["err"]["kind"], "refused", "{shell}");
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
        // A session gone without a word to its connections (ended on the
        // machine, expired): the next command is refused and the
        // connection told.
        let other = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = connect(&r, Some(&other.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        let token = other.cookie.split_once('=').unwrap().1;
        let session = r.server.db.session(token).unwrap().unwrap();
        r.server
            .db
            .end_session(&session.account, &session.id)
            .unwrap();
        let after = call(&mut ws, 1, "list_notes", json!({})).await;
        assert_eq!(after["err"]["message"], "signed out", "{after}");
        // A session ended through the server (signing out): its connection
        // is told at once, before any command.
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        let (status, _) = post(&r, "/api/signout", json!({}), Some(&b)).await;
        assert_eq!(status, 200);
        let told = next(&mut ws).await;
        assert_eq!(told["gone"], "session", "{told}");
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
        assert_eq!(list["rows"][0]["state"], "used");
        assert_eq!(list["rows"][0]["usedBy"], "leitor@casa.lan");
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
        // In a room a reader is present and sends nothing: no edit, and no
        // board's file to write (ADR 0082 items 4 and 12).
        let canvas = call(
            &mut ws,
            40,
            "collab_canvas",
            json!({ "path": "Mesa.canvas", "at": "AA==", "json": "{}" }),
        )
        .await;
        assert_eq!(canvas["err"]["kind"], "refused", "{canvas}");
        assert!(
            canvas["err"]["message"]
                .as_str()
                .unwrap()
                .contains("only read"),
            "{canvas}"
        );
        // The folder's settings: read, never changed by a reader — whose
        // window keeps its bookmarks on its machine (ADR 0070, decided
        // 2026-10-12).
        let layer = call(&mut ws, 30, "get_folder_settings", json!({})).await;
        assert!(layer["ok"]["problem"].is_null(), "{layer}");
        let star = call(
            &mut ws,
            31,
            "set_folder_settings",
            json!({ "change": { "bookmarks": ["Sessao.md"] }, "revision": null }),
        )
        .await;
        assert_eq!(star["err"]["kind"], "refused", "{star}");
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
        // The same change, now that they write: kept in the folder's file.
        let star = call(
            &mut ws,
            32,
            "set_folder_settings",
            json!({ "change": { "bookmarks": ["Sessao.md"] }, "revision": null }),
        )
        .await;
        assert_eq!(
            star["ok"]["settings"]["bookmarks"],
            json!(["Sessao.md"]),
            "{star}"
        );
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

pub(crate) async fn put(r: &Running, path: &str, body: Value, b: &Browser) -> (u16, Value) {
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
        // An account that owns no folder takes 0 bytes — a whole 0, not
        // the -0.0 a sum of no float is, which a page shows as "-0 B".
        let (_, list) = get(&r, "/api/admin/accounts", Some(&admin)).await;
        let new = list["rows"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["email"] == "outro@casa.lan")
            .unwrap();
        assert_eq!(new["space"].as_u64(), Some(0), "{new}");
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
        let (_, what) = post(
            &r,
            "/api/device/describe",
            json!({ "code": code }),
            Some(&admin),
        )
        .await;
        assert_eq!(what["device"], "Verso · MacBook");
        let (status, _) = post(
            &r,
            "/api/device/approve",
            json!({ "code": code }),
            Some(&admin),
        )
        .await;
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

/// The person names this computer again in the app (ADR 0079 item 8, ADR
/// 0074 item 8; decided 2026-10-11): its session takes the name, said in
/// the list of sessions; only a device's own session names itself.
#[test]
fn a_device_names_its_session_again() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let account = r
            .server
            .db
            .account_by_email("admin@casa.lan")
            .unwrap()
            .unwrap();
        let (token, _) = r
            .server
            .db
            .create_session(&account.id, "device", "Verso · MacBook", "127.0.0.1")
            .unwrap();
        let rename = |bearer: Option<String>, cookie: Option<&Browser>, name: &str| {
            let mut req = reqwest::Client::new()
                .put(r.url("/api/me/device"))
                .header("origin", r.origin())
                .json(&json!({ "device": name }));
            if let Some(t) = bearer {
                req = req.bearer_auth(t);
            }
            if let Some(b) = cookie {
                req = req
                    .header("cookie", &b.cookie)
                    .header("x-verso-csrf", &b.csrf);
            }
            async move { req.send().await.unwrap().status().as_u16() }
        };
        assert_eq!(
            rename(Some(token.clone()), None, "Verso · Estúdio").await,
            200
        );
        let (_, sessions) = get(&r, "/api/me/sessions", Some(&admin)).await;
        let devices: Vec<&Value> = sessions
            .as_array()
            .unwrap()
            .iter()
            .filter(|s| s["session"]["kind"] == "device")
            .collect();
        assert_eq!(devices.len(), 1, "{sessions}");
        assert_eq!(devices[0]["session"]["device"], "Verso · Estúdio");
        // A browser's session has no device to name; nothing is no name.
        assert_eq!(rename(None, Some(&admin), "Outro").await, 403);
        assert_eq!(rename(Some(token), None, "  ").await, 400);
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
fn a_write_token_never_manages_the_account_or_the_members() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (_, made) = post(
            &r,
            "/api/me/tokens",
            json!({ "name": "agente", "write": true, "days": 30, "folders": [id] }),
            Some(&admin),
        )
        .await;
        let secret = made["secret"].as_str().unwrap();
        let client = reqwest::Client::new();
        let bearer = format!("Bearer {secret}");
        // What a leaked token must not do: members, sessions, keys,
        // settings, the profile, the other tokens.
        for (method, path, body) in [
            (
                "PUT",
                format!("/api/folders/{id}/members/admin@casa.lan"),
                json!({ "role": "owner" }),
            ),
            ("GET", format!("/api/folders/{id}/members"), Value::Null),
            ("GET", format!("/api/folders/{id}/audit"), Value::Null),
            ("DELETE", "/api/me/sessions/others".to_owned(), Value::Null),
            ("GET", "/api/me/sessions".to_owned(), Value::Null),
            ("GET", "/api/me/tokens".to_owned(), Value::Null),
            ("GET", "/api/me/passkeys".to_owned(), Value::Null),
            (
                "PUT",
                "/api/me/settings".to_owned(),
                json!({ "settings": "{\"theme\":\"dark\"}" }),
            ),
            (
                "PATCH",
                "/api/me".to_owned(),
                json!({ "name": "Outro", "lang": "en" }),
            ),
        ] {
            let mut req = client
                .request(method.parse().unwrap(), r.url(&path))
                .header("authorization", &bearer);
            if !body.is_null() {
                req = req.json(&body);
            }
            let status = req.send().await.unwrap().status().as_u16();
            assert_eq!(status, 403, "{method} {path}");
        }
        // The browser still does all of it.
        let (status, _) = get(&r, &format!("/api/folders/{id}/members"), Some(&admin)).await;
        assert_eq!(status, 200);
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
        let r = start_with(|c| c.tls = Some(("/c".into(), "/k".into()))).await;
        let (tcp, _v6) = loopback().await;
        let port = tcp.local_addr().unwrap().port();
        let listener = tls::TlsListener::new(tcp, acceptor, Arc::clone(&r.server.slots)).unwrap();
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
        assert_eq!(state["secure"], true);
        // A stranger is not told the version (threat-model.md, gap 15).
        assert!(
            state["version"].is_null()
                && state["contract"].is_null()
                && state["contractVersion"].is_null()
        );
        // Plain HTTP to the TLS port gets nothing.
        assert!(
            reqwest::get(format!("http://localhost:{port}/api/state"))
                .await
                .is_err()
        );
    });
}

/// The next event of `name` the socket hears.
pub(crate) async fn event_named(ws: &mut Socket, name: &str) -> Value {
    loop {
        // 30 s, not a product timeout: opening a folder waits on fseventsd, which queues under machine load.
        let m = tokio::time::timeout(std::time::Duration::from_secs(30), ws.next())
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

#[test]
fn passkeys_start_for_the_signed_in_and_say_nothing_of_strangers() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (status, started) = post(&r, "/api/me/passkeys", json!({}), Some(&b)).await;
        assert_eq!(status, 200, "{started}");
        let pk = &started["options"]["publicKey"];
        assert_eq!(pk["rp"]["id"], "localhost");
        assert_eq!(pk["user"]["name"], "admin@casa.lan");
        assert!(pk["challenge"].as_str().unwrap().len() > 20);
        assert_eq!(get(&r, "/api/me/passkeys", Some(&b)).await.1, json!([]));
        // Signed out, a passkey is not added.
        assert_eq!(post(&r, "/api/me/passkeys", json!({}), None).await.0, 401);
        // No passkey: the same answer for an account and for nobody.
        let (s1, a1) = post(
            &r,
            "/api/passkey/start",
            json!({ "email": "admin@casa.lan" }),
            None,
        )
        .await;
        let (s2, a2) = post(
            &r,
            "/api/passkey/start",
            json!({ "email": "ninguem@casa.lan" }),
            None,
        )
        .await;
        assert_eq!((s1, s2), (401, 401));
        assert_eq!(a1["error"], a2["error"]);
        // A ceremony nobody started is gone.
        let (gone, _) = post(
            &r,
            "/api/me/passkeys/finish",
            json!({ "ceremony": "x", "name": "n", "credential": {} }),
            Some(&b),
        )
        .await;
        assert!(gone == 404 || gone == 422, "{gone}");
    });
}

#[test]
fn a_room_waits_for_a_window_whose_connection_dropped() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let first = call(&mut ws, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        let epoch = first["ok"]["epoch"].as_str().unwrap().to_owned();
        drop(ws);
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        // Back within the grace: the same room.
        let mut back = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut back).await;
        call(&mut back, 1, "open_server_folder", json!({ "id": id })).await;
        let again = call(&mut back, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        assert_eq!(again["ok"]["epoch"], epoch.as_str());
        // Left on purpose and joined again: a room made anew.
        call(&mut back, 3, "collab_leave", json!({ "path": "Sessao.md" })).await;
        let fresh = call(&mut back, 4, "collab_join", json!({ "path": "Sessao.md" })).await;
        assert_ne!(fresh["ok"]["epoch"], epoch.as_str());
    });
}

#[test]
fn without_web_a_browser_gets_no_window_and_the_app_still_connects() {
    block_on(async {
        let r = start().await;
        // The same server, without --web.
        let mut cfg = r.server.config.clone();
        cfg.web = false;
        let off = state::Server::new(cfg, Db::memory().unwrap(), contract_version(), "t".into());
        let admin = off
            .db
            .create_account("a@b.co", "A", "pt", Some("uma senha longa"), true)
            .unwrap();
        let (device, _) = off
            .db
            .create_session(&admin.id, "device", "app", "127.0.0.1")
            .unwrap();
        let (listener, v6) = loopback().await;
        let port = listener.local_addr().unwrap().port();
        let s = Arc::clone(&off);
        tokio::spawn(async move {
            let _ = run(s, listener, std::future::pending()).await;
        });
        let probe = Running {
            server: Arc::clone(&off),
            addr: SocketAddr::from(([127, 0, 0, 1], port)),
            _dirs: (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap()),
            _stop: tokio::sync::oneshot::channel().0,
            _permit: None,
            _v6: v6,
        };
        let (_, st) = get(&probe, "/api/state", None).await;
        assert_eq!(st["web"], false);
        let b = sign_in(&probe, "a@b.co", "uma senha longa").await;
        assert_eq!(
            connect(&probe, Some(&b.cookie), Some(&probe.origin()), None)
                .await
                .err(),
            Some(403)
        );
        assert!(connect(&probe, None, None, Some(&device)).await.is_ok());
        drop(r);
    });
}

#[test]
fn the_persons_settings_follow_the_account() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        assert_eq!(
            get(&r, "/api/me/settings", Some(&b)).await.1["settings"],
            Value::Null
        );
        let res = reqwest::Client::new()
            .put(r.url("/api/me/settings"))
            .header("origin", r.origin())
            .header("cookie", &b.cookie)
            .header("x-verso-csrf", &b.csrf)
            .json(&json!({ "settings": "{\"remoteContent\":false,\"theme\":\"dark\"}" }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        // Another browser of the same person reads them.
        let other = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let kept = get(&r, "/api/me/settings", Some(&other)).await.1;
        assert!(
            kept["settings"]
                .as_str()
                .unwrap()
                .contains("\"theme\":\"dark\"")
        );
        assert_eq!(get(&r, "/api/me/settings", None).await.0, 401);
    });
}

#[test]
fn with_a_mail_server_links_go_by_mail_and_say_nothing_of_strangers() {
    block_on(async {
        let r = start_with(|c| c.public_url = Some("@self".into())).await;
        let _ = r
            .server
            .mail
            .set(mail::Mail::Memory(std::sync::Mutex::new(Vec::new())));
        let sent = || match r.server.mail.get() {
            Some(mail::Mail::Memory(m)) => verso_service::lock(m).clone(),
            _ => Vec::new(),
        };
        let (s1, _) = post(
            &r,
            "/api/signin/link",
            json!({ "email": "admin@casa.lan" }),
            None,
        )
        .await;
        let (s2, _) = post(
            &r,
            "/api/signin/link",
            json!({ "email": "ninguem@casa.lan" }),
            None,
        )
        .await;
        assert_eq!((s1, s2), (200, 200));
        // Sent after the answer (threat-model.md, gap 6): waited for.
        let mut mails = sent();
        for _ in 0..100 {
            if !mails.is_empty() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            mails = sent();
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let mails = sent();
        assert_eq!(mails.len(), 1);
        assert_eq!(mails[0].0, "admin@casa.lan");
        let link = mails[0]
            .2
            .lines()
            .find(|l| l.contains("/signin-link/"))
            .unwrap()
            .trim()
            .to_owned();
        let token = link.rsplit('/').next().unwrap();
        let res = reqwest::Client::new()
            .post(r.url(&format!("/api/signin/link/{token}")))
            .header("origin", r.origin())
            .json(&json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        assert!(res.headers().get("set-cookie").is_some());
        // Used once.
        assert_eq!(
            post(&r, &format!("/api/signin/link/{token}"), json!({}), None)
                .await
                .0,
            404
        );
        // A forgotten password: a reset link by mail.
        assert_eq!(
            post(
                &r,
                "/api/forgot",
                json!({ "email": "admin@casa.lan" }),
                None
            )
            .await
            .0,
            200
        );
        for _ in 0..100 {
            if sent().len() > 1 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert!(sent().last().unwrap().2.contains("/reset/"));
        // An invitation to an address goes there too.
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (_, inv) = post(
            &r,
            "/api/admin/invitations",
            json!({ "email": "novo@casa.lan" }),
            Some(&admin),
        )
        .await;
        assert_eq!(inv["mailed"], true);
        assert_eq!(sent().last().unwrap().0, "novo@casa.lan");
    });
}

#[test]
fn a_folder_name_taken_twice_says_so_in_its_own_words() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (status, _) = post(
            &r,
            "/api/folders",
            json!({ "name": "Diário de bordo" }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 200);
        // Made again: the folder's own code, not the account's "exists".
        let (status, again) = post(
            &r,
            "/api/folders",
            json!({ "name": "Diário de bordo" }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 409);
        assert_eq!(again["error"], "folder_exists", "{again}");
        // Registered again by an admin: the same answer.
        let (status, adopted) = post(
            &r,
            "/api/admin/folders/adopt",
            json!({ "name": "Diário de bordo", "owner": "admin@casa.lan" }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 409);
        assert_eq!(adopted["error"], "folder_exists", "{adopted}");
    });
}

/// Many requests sent at once, more than a connection may have under way
/// (R5 of 2026-10-11): the ones past the bound wait to be read, and every
/// one is answered — none refused, none lost.
#[test]
fn requests_past_the_bound_wait_and_are_all_answered() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        for id in 1..=40_u64 {
            ws.send(Message::Text(
                json!({ "id": id, "cmd": "app_info", "args": {} })
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        }
        let mut answered = std::collections::BTreeSet::new();
        while answered.len() < 40 {
            let v = next(&mut ws).await;
            assert!(v.get("ok").is_some(), "{v}");
            answered.insert(v["id"].as_u64().unwrap());
        }
        assert_eq!(answered, (1..=40).collect());
    });
}

/// The sync protocol's version (ADR 0079 item 5): a device says its own
/// in the WebSocket's request, the hello says the server's, and a device
/// older than the version before the server's is refused, in words that
/// say what to do — its sync's commands too.
#[test]
fn the_hello_says_the_sync_the_server_speaks() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut req = format!("ws://localhost:{}/api/ws", r.addr.port())
            .into_client_request()
            .unwrap();
        let headers = req.headers_mut();
        headers.insert("cookie", b.cookie.parse().unwrap());
        headers.insert("origin", r.origin().parse().unwrap());
        headers.insert(
            verso_core::sync::PROTOCOL_HEADER,
            verso_core::sync::PROTOCOL.to_string().parse().unwrap(),
        );
        let (mut ws, _) = tokio_tungstenite::connect_async(req).await.unwrap();
        let hello = next(&mut ws).await;
        assert_eq!(
            hello["hello"]["sync"],
            verso_core::sync::PROTOCOL,
            "{hello}"
        );
        assert!(hello["hello"].get("syncRefused").is_none(), "{hello}");
    });
    // A server two versions ahead of a device.
    let why = crate::rpc::sync_refusal(Some(1), 3).unwrap();
    assert!(why.contains("sync 1") && why.contains("sync 3"), "{why}");
    assert!(why.ends_with("update the one that is behind"), "{why}");
    assert_eq!(crate::rpc::sync_refusal(Some(2), 3), None);
    assert_eq!(crate::rpc::sync_refusal(None, 3), None);
}
