// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "This app is a server" driven as a phone drives it: over HTTPS with the
//! app's own certificate as the only trust, and the contract's WebSocket,
//! against a real `LocalServer` on loopback standing in for a private
//! address. Every refusal of ADR 0096 is here as a request that is refused.

use std::sync::{Arc, Mutex};

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use super::net::{IfNet, Interfaces};
use super::{Event, LocalServer, LocalSettings};
use crate::db::Role;
use crate::tests::block_on;

/// The machine's interfaces, as a test table the test can change.
pub(super) struct Table(pub Mutex<Vec<IfNet>>, pub Mutex<Option<std::net::IpAddr>>);

impl Interfaces for Table {
    fn list(&self) -> Vec<IfNet> {
        self.0.lock().unwrap().clone()
    }

    fn default_route(&self) -> Option<std::net::IpAddr> {
        *self.1.lock().unwrap()
    }
}

pub(super) fn net(ip: &str) -> IfNet {
    IfNet {
        ip: ip.parse().unwrap(),
        prefix: 8,
        name: "en0".to_owned(),
    }
}

pub(super) struct Lab {
    pub local: LocalServer,
    pub table: Arc<Table>,
    pub events: Arc<Mutex<Vec<Event>>>,
    pub dir: tempfile::TempDir,
    pub notes: tempfile::TempDir,
    pub port: u16,
    pub client: reqwest::Client,
    pub roots: Arc<tokio_rustls::rustls::RootCertStore>,
}

/// Serving, over one folder called `Campanha` holding `Sessao.md`, on
/// loopback.
pub(super) fn lab() -> Lab {
    lab_with(&["127.0.0.1"], true)
}

pub(super) fn lab_with(addresses: &[&str], loopback: bool) -> Lab {
    let dir = tempfile::tempdir().unwrap();
    let ui = dir.path().join("ui");
    crate::data::ensure_dir(&ui).unwrap();
    crate::data::write_for_tests(&ui.join("web.html"), "<!doctype html><title>Verso</title>");
    let notes = tempfile::tempdir().unwrap();
    let folder = notes.path().join("Campanha");
    crate::data::ensure_dir(&folder).unwrap();
    crate::data::write_for_tests(&folder.join("Sessao.md"), "# Sessao\n");
    let table = Arc::new(Table(
        Mutex::new(addresses.iter().map(|a| net(a)).collect()),
        Mutex::new(None),
    ));
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&events);
    let local = LocalServer::for_tests(
        dir.path().join("local"),
        vec![dir.path().join("missing"), ui],
        Arc::new(move |e| sink.lock().unwrap().push(e)),
        table.clone(),
        loopback,
    );
    local
        .set_settings(&LocalSettings {
            folders: vec![folder.to_string_lossy().into_owned()],
            ..LocalSettings::default()
        })
        .unwrap();
    Lab {
        local,
        table,
        events,
        dir,
        notes,
        port: 0,
        client: reqwest::Client::new(),
        roots: Arc::new(tokio_rustls::rustls::RootCertStore::empty()),
    }
}

/// On Windows the folder served is left in the temporary directory, not
/// deleted. notify 8.2's Windows watcher closes the folder's handle before
/// its read is cancelled: a change that completes in that moment re-arms
/// the read on the closed handle's number, which Windows hands to the next
/// opener — here `remove_dir_all`'s own handle on that folder — and both
/// then wait on each other for ever (seen on GitHub's runner, 2026-11-02,
/// every thread's stack). Fixed upstream by notify-rs/notify#1052, not in a
/// release yet: drop this once notify is upgraded past it.
impl Drop for Lab {
    fn drop(&mut self) {
        #[cfg(windows)]
        self.notes.disable_cleanup(true);
    }
}

impl Lab {
    /// Serving on, and the app's own certificate trusted: the only trust a
    /// phone that accepted the warning has.
    pub fn serve(&mut self) {
        let status = self.local.start().unwrap();
        self.port = status.port.unwrap();
        let der = {
            let db = crate::db::Db::open(&self.dir.path().join("local")).unwrap();
            let ips: Vec<std::net::IpAddr> = self.table.list().iter().map(|n| n.ip).collect();
            super::cert::load_or_make(&db, &ips, crate::db::now())
                .unwrap()
                .cert
        };
        let mut roots = tokio_rustls::rustls::RootCertStore::empty();
        roots
            .add(rustls_pki_types::CertificateDer::from(der.clone()))
            .unwrap();
        self.roots = Arc::new(roots);
        self.client = reqwest::Client::builder()
            .add_root_certificate(reqwest::Certificate::from_der(&der).unwrap())
            .build()
            .unwrap();
    }

    pub fn origin(&self) -> String {
        format!("https://127.0.0.1:{}", self.port)
    }

    pub fn url(&self, path: &str) -> String {
        format!("{}{path}", self.origin())
    }

    pub async fn post(&self, path: &str, body: Value, cookie: Option<&str>) -> (u16, Value) {
        let mut req = self
            .client
            .post(self.url(path))
            .header("origin", self.origin())
            .json(&body);
        if let Some(c) = cookie {
            req = req.header("cookie", c);
        }
        let res = req.send().await.unwrap();
        let status = res.status().as_u16();
        (status, res.json().await.unwrap_or(Value::Null))
    }

    pub async fn get(&self, path: &str, cookie: Option<&str>) -> (u16, Value) {
        let mut req = self.client.get(self.url(path));
        if let Some(c) = cookie {
            req = req.header("cookie", c);
        }
        let res = req.send().await.unwrap();
        let status = res.status().as_u16();
        (status, res.json().await.unwrap_or(Value::Null))
    }

    /// The token of the window just opened, as the QR carries it.
    pub fn token(view: &super::PairView) -> String {
        super::qr::parse(&view.url).unwrap().token
    }

    /// A phone presents the token and is asked about; the laptop answers.
    /// Returns the phone's cookie.
    pub async fn pair(&self, device: &str, allow: bool, role: Role) -> Option<String> {
        let view = self.local.pair_open().unwrap();
        let token = Self::token(&view);
        let (status, asked) = self
            .post(
                "/api/pair",
                json!({ "token": token, "device": device }),
                None,
            )
            .await;
        assert_eq!(status, 200, "{asked}");
        let poll = asked["poll"].as_str().unwrap().to_owned();
        let (_, waiting) = self
            .post("/api/pair/poll", json!({ "poll": poll }), None)
            .await;
        assert_eq!(waiting["state"], "waiting");
        let pending = self.local.pair_state().asked.unwrap();
        assert_eq!(pending.device, device);
        self.local.answer(allow, role).unwrap();
        let res = self
            .client
            .post(self.url("/api/pair/poll"))
            .header("origin", self.origin())
            .json(&json!({ "poll": poll }))
            .send()
            .await
            .unwrap();
        if res.status().as_u16() != 200 {
            return None;
        }
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
        Some(cookie)
    }

    pub async fn connect(&self, cookie: &str) -> Result<Ws, u16> {
        let mut req = format!("wss://127.0.0.1:{}/api/ws", self.port)
            .into_client_request()
            .unwrap();
        req.headers_mut().insert("cookie", cookie.parse().unwrap());
        req.headers_mut()
            .insert("origin", self.origin().parse().unwrap());
        let provider = Arc::new(tokio_rustls::rustls::crypto::ring::default_provider());
        let config = tokio_rustls::rustls::ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_root_certificates(Arc::clone(&self.roots))
            .with_no_client_auth();
        let connector = tokio_tungstenite::Connector::Rustls(Arc::new(config));
        match tokio_tungstenite::connect_async_tls_with_config(req, None, false, Some(connector))
            .await
        {
            Ok((ws, _)) => Ok(ws),
            Err(tokio_tungstenite::tungstenite::Error::Http(res)) => Err(res.status().as_u16()),
            Err(e) => panic!("{e}"),
        }
    }
}

pub(super) type Ws =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// The next message that is not an event.
pub(super) async fn next(ws: &mut Ws) -> Value {
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(30), ws.next())
            .await
            .expect("a message in time")
            .expect("the socket is open")
            .unwrap();
        if let Message::Text(t) = m {
            let v: Value = serde_json::from_str(&t).unwrap();
            if v.get("event").is_none() {
                return v;
            }
        }
    }
}

pub(super) async fn call(ws: &mut Ws, id: u64, cmd: &str, args: Value) -> Value {
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

pub(super) async fn folder_id(lab: &Lab, cookie: &str) -> String {
    let (_, me) = lab.get("/api/folders", Some(cookie)).await;
    me["folders"][0]["id"].as_str().unwrap().to_owned()
}

/// A phone connected and its folder open.
pub(super) async fn open(lab: &Lab, cookie: &str) -> Ws {
    let id = folder_id(lab, cookie).await;
    let mut ws = lab.connect(cookie).await.unwrap();
    let hello = next(&mut ws).await;
    assert!(hello.get("hello").is_some(), "{hello}");
    let info = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert_eq!(info["ok"]["name"], "Campanha", "{info}");
    ws
}

pub(super) fn run<F: std::future::Future>(f: F) -> F::Output {
    block_on(f)
}

pub(super) fn said(lab: &Lab) -> Vec<Event> {
    lab.events.lock().unwrap().clone()
}
