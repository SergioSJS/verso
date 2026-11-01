// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The desktop app as a client of a server (ADR 0073 item 2; the
//! maintainer's answer K of 2026-10-09): a window may show a folder of a
//! server instead of one of this computer. The app signs in through the
//! browser — the server's page approves this device and the app receives a
//! token for it (ADR 0074 item 8), kept in the configuration directory —
//! and a window on a server's folder sends the folder's commands to the
//! server over its WebSocket, hears the server's events, and reads the
//! folder's files from `/f/`. The window above does not know which side of
//! the wire the core is on (ADR 0026 rule 2): what it may do it learns from
//! `capabilities`, which the server answers.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU8, AtomicU64, Ordering};

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use verso_contract::{
    ServerAccount, ServerBack, ServerFolder, ServerFolders, ServerGone, ServerSignIn, ShareGiven,
    SyncVersions,
};
use verso_core::servers::{self, ServerLogin};
use verso_service::files::Served;

pub(crate) use crate::remote_abilities::with_app_abilities;

use super::*;
use crate::dns::SendRetrying;

/// The generated bindings this app was built with: their hash is the
/// contract's version, which the server's must equal (answer D).
const BINDINGS: &str = include_str!("../../ui/src/bindings.ts");

pub(crate) fn contract_version() -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(BINDINGS.as_bytes())
        .iter()
        .take(8)
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// The commands a window on a server's folder sends to the server; every
/// other one is this app's (its windows, its menus, its updates).
pub(crate) fn forwards(cmd: &str) -> bool {
    verso_service::ops::access(cmd).is_some()
        || verso_service::trash::COMMANDS.contains(&cmd)
        || verso_service::history::COMMANDS.contains(&cmd)
        || matches!(
            cmd,
            "current_folder"
                | "reindex"
                | "capabilities"
                | "render_markdown"
                | "board_text"
                | "set_walk_rules"
                | "set_folder_note_name"
                | "fetch_file"
                | "fetch_focuses_file"
                | "collab_join"
                | "collab_update"
                | "collab_awareness"
                | "collab_leave"
                | "collab_save"
                | "collab_resolve"
                | "collab_present"
                | "collab_canvas"
                | "collab_roll"
                | "collab_oracle"
                | "table_join"
                | "table_leave"
                | "table_look"
                | "table_history"
                | "table_say"
                | "table_send_image"
                | "table_attach"
                | "table_roll"
                | "table_pin"
                | "table_delete"
                | "table_clear"
                | "table_play"
                | "table_sound"
                | "table_time"
                | "table_cannot_play"
                | "table_share_start"
                | "table_share_stop"
                | "table_share_listen"
                | "campaign_status"
                | "campaign_make"
                | "campaign_unmake"
                | "campaign_settings"
                | "campaign_release"
                | "campaign_release_all"
                | "campaign_audience"
                | "campaign_access"
                | "campaign_secret_name"
                | "campaign_grant"
                | "campaign_invite"
                | "access_get"
                | "access_set"
                | "table_rights_set"
        )
}

/// The questions sent and not yet answered, and whether the connection is
/// known closed: one lock for both, so a question is never registered
/// after the last one was answered unavailable.
#[derive(Default)]
struct Questions {
    waiting: HashMap<u64, oneshot::Sender<Result<Answer, Value>>>,
    closed: bool,
}

/// An answer, and the piece of a file it carried in a binary message
/// (sync 2, ADR 0079 item 12).
type Answer = (Value, Option<Vec<u8>>);
/// A question on the connection: its id, where its answer comes, when it
/// was put.
pub(crate) type Asked = (
    u64,
    oneshot::Receiver<Result<Answer, Value>>,
    std::time::Instant,
);

type Pending = Arc<Mutex<Questions>>;

/// The connection closed, seen by the task that reads or the one that
/// writes: no question is registered from now on, and every one waiting is
/// answered unavailable. True for the first to see it. Either task may end
/// first — the live campaign (2026-10-11) had the reader end while idle,
/// then a question sent through a writer that failed on it, left waiting
/// forever with no one to answer it.
fn close(pending: &Pending) -> bool {
    let (first, waiting) = {
        let mut q = lock(pending);
        let first = !q.closed;
        q.closed = true;
        (first, std::mem::take(&mut q.waiting))
    };
    for (_, p) in waiting {
        let _ = p.send(Err(unavailable("the server's connection closed")));
    }
    first
}

/// How long a question waits for its answer: a net under [`close`], for a
/// connection dead without either task seeing it. One question carries at
/// most one piece of a file — 1 MiB, 1.4 MB as base64 to a server of sync
/// 1 — so the bound is one a slow link (150 kbit/s) does not reach for
/// one piece.
const ANSWER_WITHIN: std::time::Duration = std::time::Duration::from_secs(300);

/// How often a connection pings the server, as the server pings it (R5
/// of 2026-10-11): a server gone without closing the connection — its
/// machine off, a network dropped — is noticed by the pings it leaves
/// unanswered, not at the next question. The server's WebSocket answers
/// on its own. A second in the tests, so that one sees it in a few.
#[cfg(not(test))]
const PING_EVERY: std::time::Duration = std::time::Duration::from_secs(30);
#[cfg(test)]
const PING_EVERY: std::time::Duration = std::time::Duration::from_secs(1);

/// Pings in a row left unanswered before the connection is taken as
/// closed: within a minute and a half of the server going silent.
const MISSED: u8 = 2;

/// How long one message may take to be written before the server is
/// taken as no longer reading (threat-model.md, gap 2): a floor, plus the
/// message's size at 32 KiB/s (256 kbit/s, under a weak mobile link's) —
/// the server's bound for its own writes (crates/verso-server, rpc.rs).
/// A piece of a file (1 MiB) gets about a minute. A
/// write that does not end in time closes the connection as a failed one
/// does, instead of holding every question behind it until the system
/// gives up on the socket.
fn send_within(bytes: usize) -> std::time::Duration {
    const FLOOR: u64 = 30;
    const RATE: u64 = 32 * 1024;
    let bytes = u64::try_from(bytes).unwrap_or(u64::MAX);
    std::time::Duration::from_secs(FLOOR.saturating_add(bytes / RATE))
}

/// Messages a connection holds unwritten. A sync sends one piece of a
/// file and waits for its answer before the next; a window asks a few
/// questions at once, a few dozen while it opens a folder, each written
/// in a moment. So many waiting means the connection no longer writes: a
/// question past them fails as the connection's own failure, as a write
/// that failed does, instead of the queue growing with pieces of files.
const QUEUE: usize = 64;

/// A window's connection to a server, on one of its folders.
pub(crate) struct Remote {
    pub(crate) url: String,
    pub(crate) folder: String,
    token: String,
    next: AtomicU64,
    /// The last command's round trip, in milliseconds.
    latency: std::sync::atomic::AtomicU32,
    pending: Pending,
    tx: mpsc::Sender<Message>,
    /// Told when the connection is taken as closed without either task
    /// seeing it close: the reader ends, as on a close.
    dead: Arc<tokio::sync::Notify>,
    /// Whether a piece of a file crosses as a binary message: the server's
    /// hello said a sync that takes them (ADR 0079 item 12, sync 2); with
    /// one of sync 1, as base64 inside the JSON.
    binary: bool,
}

impl Remote {
    /// Whether pieces cross this connection as binary messages.
    #[cfg(test)]
    pub(crate) fn binary(&self) -> bool {
        self.binary
    }
}

/// The connection's own failure, told from a server's answer of the same
/// kind by `transport`: sync reconnects on the first, and lists the file on
/// the second.
fn unavailable(message: &str) -> Value {
    json!({ "kind": "unavailable", "message": message, "transport": true })
}

impl Remote {
    /// The last command's round trip, in milliseconds: how far the server
    /// is (ADR 0073 item 2).
    pub(crate) fn latency_ms(&self) -> u32 {
        self.latency.load(Ordering::Relaxed)
    }

    /// The connection let go at once, as a network that drops it: the
    /// server sees it closed once the last holder lets the `Remote` go.
    #[cfg(test)]
    pub(crate) fn hang_up(&self) {
        close(&self.pending);
        self.dead.notify_one();
    }

    /// A command of the contract, answered by the server.
    pub(crate) async fn call(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        self.call_with(cmd, args, None)
            .await
            .map(|(answer, _)| answer)
    }

    /// A command of sync that carries a piece of a file, either way: `piece`
    /// sent with it, and the piece its answer carries — in binary messages
    /// with a server of sync 2, as base64 in the JSON with one of sync 1
    /// (ADR 0079 items 5 and 12).
    pub(crate) async fn call_with(
        &self,
        cmd: &str,
        args: Value,
        piece: Option<Vec<u8>>,
    ) -> Result<Answer, Value> {
        let asked = self.ask(cmd, args, piece)?;
        self.answer(cmd, asked).await
    }

    /// The question put on the connection now, in the order of the calls
    /// (the server takes a window's room updates in the order they reach
    /// it, ADR 0083 item 14); its answer is waited for with [`Self::answer`].
    pub(crate) fn ask(
        &self,
        cmd: &str,
        mut args: Value,
        piece: Option<Vec<u8>>,
    ) -> Result<Asked, Value> {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        {
            let mut q = lock(&self.pending);
            if q.closed {
                return Err(unavailable("the server's connection is closed"));
            }
            q.waiting.insert(id, tx);
        }
        let message = match piece {
            Some(piece) if self.binary => {
                let header = json!({ "id": id, "cmd": cmd, "args": args }).to_string();
                Message::Binary(verso_core::sync::frame(header.as_bytes(), &piece).into())
            }
            Some(piece) => {
                args["data"] = json!(base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    &piece
                ));
                Message::Text(
                    json!({ "id": id, "cmd": cmd, "args": args })
                        .to_string()
                        .into(),
                )
            }
            None => Message::Text(
                json!({ "id": id, "cmd": cmd, "args": args })
                    .to_string()
                    .into(),
            ),
        };
        match self.tx.try_send(message) {
            Ok(()) => {}
            Err(mpsc::error::TrySendError::Full(_)) => {
                lock(&self.pending).waiting.remove(&id);
                log::write(
                    "WARN",
                    "host",
                    &format!(
                        "the connection to {} is taken as closed: {QUEUE} messages wait unwritten",
                        self.url
                    ),
                );
                // Every question waiting is answered, the reader ends and
                // says the connection closed: sync connects again.
                close(&self.pending);
                self.dead.notify_one();
                return Err(unavailable("the server's connection does not write"));
            }
            Err(mpsc::error::TrySendError::Closed(_)) => {
                lock(&self.pending).waiting.remove(&id);
                return Err(unavailable("the server's connection is closed"));
            }
        }
        Ok((id, rx, std::time::Instant::now()))
    }

    /// The answer to a question [`Self::ask`] put.
    pub(crate) async fn answer(&self, cmd: &str, (id, rx, sent): Asked) -> Result<Answer, Value> {
        let answer = match tokio::time::timeout(ANSWER_WITHIN, rx).await {
            Ok(Ok(answer)) => answer,
            Ok(Err(_)) => Err(unavailable("the server's connection closed")),
            Err(_) => {
                lock(&self.pending).waiting.remove(&id);
                Err(unavailable("the server did not answer"))
            }
        };
        let ms = u32::try_from(sent.elapsed().as_millis()).unwrap_or(u32::MAX);
        self.latency.store(ms, Ordering::Relaxed);
        // What the window learns of the side includes how far it is
        // (ADR 0073 item 2).
        match (cmd, answer) {
            ("capabilities", Ok((mut caps, piece))) => {
                caps["latency_ms"] = json!(ms);
                with_app_abilities(&mut caps);
                Ok((caps, piece))
            }
            // A piece from a server of sync 1: base64 in the answer.
            ("sync_read", Ok((mut answer, None))) if answer.get("data").is_some() => {
                let data = take(&mut answer, "data");
                let piece = base64::Engine::decode(
                    &base64::engine::general_purpose::STANDARD,
                    data.as_str().unwrap_or_default(),
                )
                .map_err(
                    |_| json!({ "kind": "failed", "message": "a piece that is not base64" }),
                )?;
                Ok((answer, Some(piece)))
            }
            (_, answer) => answer,
        }
    }

    /// A file of the folder, from the server's `/f/`.
    fn file(&self, relative: &str) -> Served {
        let path: String = relative
            .split('/')
            .map(|p| {
                p.bytes()
                    .map(|b| {
                        if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
                            char::from(b).to_string()
                        } else {
                            format!("%{b:02X}")
                        }
                    })
                    .collect::<String>()
            })
            .collect::<Vec<_>>()
            .join("/");
        let url = format!("{}/f/{}/{path}", self.url, self.folder);
        let refuse = |status: u16, why: String| Served {
            status,
            headers: vec![("Content-Type", "text/plain; charset=utf-8".to_owned())],
            body: why.into_bytes(),
        };
        // The same total time as before the resolver (30 s), not the 20 s
        // of a JSON answer.
        let client = match http_within(std::time::Duration::from_secs(30)) {
            Ok(c) => c,
            Err(e) => return refuse(502, e.message),
        };
        let response = match client.get(url).bearer_auth(&self.token).send_retrying() {
            Ok(r) => r,
            Err(e) => return refuse(502, e.to_string()),
        };
        let status = response.status().as_u16();
        let mut headers = Vec::new();
        for name in [
            "Content-Type",
            "Content-Security-Policy",
            "X-Content-Type-Options",
        ] {
            if let Some(v) = response.headers().get(name).and_then(|v| v.to_str().ok()) {
                headers.push((name, v.to_owned()));
            }
        }
        headers.push(("Cache-Control", "no-store".to_owned()));
        match response.bytes() {
            Ok(body) => Served {
                status,
                headers,
                body: body.to_vec(),
            },
            Err(e) => refuse(502, e.to_string()),
        }
    }
}

/// The server's address as given: `https://host[:port]` or `http://host
/// [:port]`; no path, no trailing slash. Plain HTTP works from any
/// machine: the server serves it all, and what a secure context is for
/// (offline, notifications) is said off in the window (ADR 0073 item 6,
/// amended 2026-10-16).
fn server_url(url: &str) -> Result<String, ContractError> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|_| refused("not an address"))?;
    let host = parsed.host_str().ok_or_else(|| refused("not an address"))?;
    match parsed.scheme() {
        "https" | "http" => {}
        _ => return Err(refused("a server is reached over http or https")),
    }
    let port = parsed.port().map(|p| format!(":{p}")).unwrap_or_default();
    Ok(format!("{}://{host}{port}", parsed.scheme()))
}

pub(crate) fn http() -> Result<reqwest::blocking::Client, ContractError> {
    http_within(std::time::Duration::from_secs(20))
}

/// [`http`] with its own total time for a request: a file of an
/// attachment takes longer than a JSON answer.
pub(crate) fn http_within(
    total: std::time::Duration,
) -> Result<reqwest::blocking::Client, ContractError> {
    let builder = reqwest::blocking::Client::builder()
        .user_agent(concat!("Verso/", env!("CARGO_PKG_VERSION")))
        .timeout(total)
        // Several addresses may be tried (dns.rs): the time to connect is
        // shared among them, and the whole request ends within `total`.
        .connect_timeout(total.mul_f32(0.75))
        .dns_resolver(Arc::new(dns::Resolver));
    #[cfg(test)]
    let builder = lock(&TEST_ROOT).iter().try_fold(builder, |b, pem| {
        reqwest::Certificate::from_pem(pem)
            .map(|c| b.add_root_certificate(c))
            .map_err(|e| failed(e.to_string()))
    })?;
    builder.build().map_err(|e| failed(e.to_string()))
}

/// A certificate the tests' clients trust besides the system's.
#[cfg(test)]
pub(crate) static TEST_ROOT: Mutex<Vec<Vec<u8>>> = Mutex::new(Vec::new());

/// The server's answer as JSON, or its error said.
pub(crate) fn answer(response: reqwest::blocking::Response) -> Result<Value, ContractError> {
    let status = response.status();
    // The address that answered goes first next time (dns.rs) — once the
    // handshake is done and the answer is a success, not at a TCP accept.
    if status.is_success()
        && let (Some(host), Some(from)) = (response.url().host_str(), response.remote_addr())
    {
        dns::worked(host, from.ip());
    }
    let body: Value = response.json().unwrap_or(Value::Null);
    if status.is_success() {
        return Ok(body);
    }
    Err(error_of(status.as_u16(), &body))
}

/// A server's refusal as the contract says it: by its status, and, for a
/// sensitive action past the session's ten minutes (ADR 0083 item 6), by
/// its code — the window asks for the password and sends it once more.
pub(crate) fn error_of(status: u16, body: &Value) -> ContractError {
    let message = body["message"]
        .as_str()
        .unwrap_or("the server refused")
        .to_owned();
    match status {
        403 if body["error"] == "prove_first" => ContractError {
            kind: ErrorKind::ProveFirst,
            message,
        },
        401 | 403 => refused(message),
        404 | 410 => ContractError {
            kind: ErrorKind::NotFound,
            message,
        },
        _ => failed(message),
    }
}

fn open_in_browser(page: &str) -> Result<(), ContractError> {
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(windows)]
    let mut command = std::process::Command::new("explorer");
    #[cfg(not(any(target_os = "macos", windows)))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(page)
        .spawn()
        .map(|_| ())
        .map_err(|e| failed(e.to_string()))
}

/// The server's page the last sign-in was handed, waiting for the window
/// to open it (`server_sign_in_page`) once it has copied the code.
static SIGN_IN_PAGE: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// The page a sign-in waits on, taken: opened once, and only one a server
/// named under its own address.
fn sign_in_page() -> Result<String, ContractError> {
    lock(&SIGN_IN_PAGE)
        .take()
        .ok_or_else(|| refused("no server's page waits to be opened"))
}

/// Open in the browser the server's page the last `server_sign_in` was
/// handed, once (decided 2026-10-14, ADR 0083 As built): the window calls
/// it after copying the code, before the browser takes the focus a
/// clipboard write asks for. The window names no address: it can open
/// nothing a server did not name.
#[tauri::command]
#[specta::specta]
pub(crate) fn server_sign_in_page() -> Result<(), ContractError> {
    open_in_browser(&sign_in_page()?)
}

/// Sign in to a server through the browser (`gh auth login`'s way): the
/// server gives a code, which the window copies to the clipboard before it
/// opens the server's page (`server_sign_in_page`), where the person
/// pastes it to approve this device — the page takes no code from its
/// link (decided 2026-10-14, ADR 0083 As built). The app asks meanwhile,
/// keeps the token when it comes, and says so (`server-signed-in`).
#[tauri::command]
#[specta::specta]
pub(crate) async fn server_sign_in<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
) -> Result<ServerSignIn, ContractError> {
    let url = server_url(&url)?;
    let start_url = url.clone();
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    // The name the session keeps: the person's, when set (device.rs).
    let session = device::session_name(config.as_deref());
    let started = tauri::async_runtime::spawn_blocking(move || {
        answer(
            http()?
                .post(format!("{start_url}/api/device/start"))
                .json(&json!({ "device": session }))
                .send_retrying()
                .map_err(|e| reach::unsent(&start_url, &e))?,
        )
    })
    .await
    .map_err(|e| failed(e.to_string()))??;
    let code = started["code"].as_str().unwrap_or_default().to_owned();
    let poll = started["poll"].as_str().unwrap_or_default().to_owned();
    let page = started["url"].as_str().unwrap_or_default().to_owned();
    let interval = started["interval"].as_u64().unwrap_or(2).max(1);
    if !page.starts_with(&url) {
        return Err(refused("the server named a page elsewhere"));
    }
    *lock(&SIGN_IN_PAGE) = Some(page.clone());
    let (poll_code, poll_url) = (code.clone(), url.clone());
    tauri::async_runtime::spawn(async move {
        for _ in 0..(600 / interval) {
            tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
            let (c, p, u) = (poll_code.clone(), poll.clone(), poll_url.clone());
            let r =
                tauri::async_runtime::spawn_blocking(move || -> Result<Value, ContractError> {
                    answer(
                        http()?
                            .post(format!("{u}/api/device/poll"))
                            .json(&json!({ "code": c, "poll": p }))
                            .send_retrying()
                            .map_err(|e| reach::unsent(&u, &e))?,
                    )
                })
                .await;
            let Ok(Ok(body)) = r else { break };
            if body["pending"] == true {
                continue;
            }
            let (Some(token), Some(account)) = (body["token"].as_str(), body.get("account")) else {
                break;
            };
            let login = ServerLogin {
                url: poll_url.clone(),
                token: token.to_owned(),
                email: account["email"].as_str().unwrap_or_default().to_owned(),
                name: account["name"].as_str().unwrap_or_default().to_owned(),
            };
            let shown = ServerAccount {
                url: login.url.clone(),
                email: login.email.clone(),
                name: login.name.clone(),
            };
            match servers::keep(config.as_deref(), login) {
                Ok(()) => {
                    log::write("INFO", "host", &format!("signed in to {}", shown.url));
                    let _ = app.emit("server-signed-in", shown);
                }
                Err(e) => log::write(
                    "ERROR",
                    "host",
                    &format!("keeping the server's sign-in: {e}"),
                ),
            }
            return;
        }
    });
    Ok(ServerSignIn { code, page })
}

/// The servers this app is signed in to.
#[tauri::command]
#[specta::specta]
pub(crate) fn server_accounts(state: State<'_, App>) -> Result<Vec<ServerAccount>, ContractError> {
    Ok(servers::list(state.service.config())
        .map_err(verso_service::convert)?
        .into_iter()
        .map(|s| ServerAccount {
            url: s.url,
            email: s.email,
            name: s.name,
        })
        .collect())
}

pub(crate) fn login_for(state: &State<'_, App>, url: &str) -> Result<ServerLogin, ContractError> {
    servers::find(state.service.config(), url)
        .map_err(verso_service::convert)?
        .ok_or_else(|| refused("not signed in to that server"))
}

/// Sign out of a server: the device's session ends there when the server
/// can be reached, and the token is forgotten here either way.
#[tauri::command]
#[specta::specta]
pub(crate) async fn server_sign_out<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
) -> Result<(), ContractError> {
    let state = app.state::<App>();
    let login = login_for(&state, &url)?;
    let token = login.token.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        http().and_then(|c| {
            c.post(format!("{}/api/signout", login.url))
                .bearer_auth(token)
                .json(&json!({}))
                .send_retrying()
                .map_err(|e| reach::unsent(&login.url, &e))
        })
    })
    .await;
    servers::forget(state.service.config(), &url).map_err(verso_service::convert)?;
    Ok(())
}

/// The folders of a server the account may open.
#[tauri::command]
#[specta::specta]
pub(crate) async fn server_folders<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
) -> Result<ServerFolders, ContractError> {
    let login = login_for(&app.state::<App>(), &url)?;
    let body = tauri::async_runtime::spawn_blocking(move || {
        answer(
            http()?
                .get(format!("{}/api/folders", login.url))
                .bearer_auth(login.token)
                .send_retrying()
                .map_err(|e| reach::unsent(&login.url, &e))?,
        )
    })
    .await
    .map_err(|e| failed(e.to_string()))??;
    Ok(ServerFolders {
        folders: body["folders"]
            .as_array()
            .map(|list| {
                list.iter()
                    .map(|f| ServerFolder {
                        id: f["id"].as_str().unwrap_or_default().to_owned(),
                        name: f["name"].as_str().unwrap_or_default().to_owned(),
                        role: f["role"].as_str().unwrap_or_default().to_owned(),
                        owner: f["owner"]["name"].as_str().map(str::to_owned),
                        share: f["share"] == true,
                        missing: f["missing"] == true,
                    })
                    .collect()
            })
            .unwrap_or_default(),
        may_create: body["mayCreate"] == true,
    })
}

/// Ask a server for a new folder named `name` (blocking). With `unique`, a
/// name a folder has already is never reused or merged into: `name (2)`,
/// `name (3)`… is asked instead (the maintainer, 2026-10-16); without it,
/// the server's refusal is said as it is.
pub(crate) fn make_folder(
    url: &str,
    token: &str,
    name: &str,
    unique: bool,
) -> Result<Value, ContractError> {
    let client = http()?;
    for n in 1..=99 {
        let wanted = if n == 1 {
            name.to_owned()
        } else {
            format!("{name} ({n})")
        };
        let response = client
            .post(format!("{url}/api/folders"))
            .bearer_auth(token)
            .json(&json!({ "name": wanted }))
            .send_retrying()
            .map_err(|e| reach::unsent(url, &e))?;
        if unique && response.status().as_u16() == 409 {
            continue;
        }
        return answer(response);
    }
    Err(failed("every name of that kind is taken on the server"))
}

/// Make a new, empty folder on a server, owned by the account signed in
/// there (the maintainer, 2026-10-16): the server decides whether the
/// account may and whether the name is free, and says so.
#[tauri::command]
#[specta::specta]
pub(crate) async fn server_create_folder<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
    name: String,
) -> Result<ServerFolder, ContractError> {
    let login = login_for(&app.state::<App>(), &url)?;
    let made = tauri::async_runtime::spawn_blocking(move || {
        make_folder(&login.url, &login.token, &name, false)
    })
    .await
    .map_err(|e| failed(e.to_string()))??;
    Ok(ServerFolder {
        id: made["id"]
            .as_str()
            .ok_or_else(|| failed("the server made no folder"))?
            .to_owned(),
        name: made["name"].as_str().unwrap_or_default().to_owned(),
        role: made["role"].as_str().unwrap_or("owner").to_owned(),
        owner: None,
        share: false,
        missing: false,
    })
}

/// Open a folder of a server in this window: the window leaves its own
/// folder, connects, and from now on sends the folder's commands there.
#[tauri::command]
#[specta::specta]
pub(crate) async fn server_open<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    url: String,
    folder: String,
) -> Result<FolderInfo, ContractError> {
    may_switch(&app, &window)?;
    let login = login_for(&app.state::<App>(), &url)?;
    let label = window.label().to_owned();
    // The same folder opened again while its connection is being tried
    // again: the person acted — that try is now, its waits start over.
    if of(&app, &label).is_some_and(|r| r.url == login.url && r.folder == folder) {
        reach::try_now(&label);
    }
    let remote = connect(&app, &label, login, folder.clone()).await?;
    let opened = remote
        .call("open_server_folder", json!({ "id": folder }))
        .await
        .map_err(|e| {
            serde_json::from_value::<ContractError>(e)
                .unwrap_or_else(|_| failed("the server refused"))
        })?;
    let info: FolderInfo = serde_json::from_value(opened).map_err(|e| failed(e.to_string()))?;
    // The window's own folder closes when no other window shows it, and a
    // connection it had is dropped.
    app.state::<App>().service.release(&label);
    lock(&app.state::<App>().remotes).insert(label, remote);
    let _ = window.set_title(&format!("{} — Verso", info.name));
    // The next start brings this window back (ADR 0065).
    crate::session::remember(&app);
    Ok(info)
}

/// The window's connection to a server, if it shows a server's folder.
pub(crate) fn of<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) -> Option<Arc<Remote>> {
    lock(&app.state::<App>().remotes).get(label).map(Arc::clone)
}

/// The window shows a folder of this computer again, or is gone.
pub(crate) fn release<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    lock(&app.state::<App>().remotes).remove(label);
}

/// What a connection hears besides the answers to its questions.
pub(crate) enum Heard {
    /// An event the server pushed: its name and payload.
    Event(String, Value),
    /// The server ended something (`gone`): the session, the folder; and
    /// why, when it says (`reason`: a folder's share `revoked` by its
    /// owner, `deleted`, or `left` by the person).
    Gone(Value, Option<String>),
    /// The account's role in the folder changed: `owner`, `editor`, `reader`.
    Role(String),
    /// The connection closed.
    Closed,
}

/// A connection to a server with the device's token, its contract checked:
/// the connection, and what it hears besides answers.
pub(crate) async fn dial(
    login: &ServerLogin,
    folder: String,
) -> Result<(Arc<Remote>, mpsc::UnboundedReceiver<Heard>), ContractError> {
    let (remote, heard, hello) = dial_hello(login, folder).await?;
    if let Some(v) = mismatch(&hello) {
        return Err(mismatch_refused(&v));
    }
    Ok((remote, heard))
}

/// What each side runs, when the server's contract is not this app's.
pub(crate) fn mismatch(hello: &Value) -> Option<SyncVersions> {
    if hello["contract"].as_str() == Some(contract_version().as_str()) {
        return None;
    }
    Some(versions(hello))
}

/// What each side runs, as the server's hello says it and this app knows.
pub(crate) fn versions(hello: &Value) -> SyncVersions {
    let said = |field: &str| hello[field].as_str().unwrap_or("?").to_owned();
    SyncVersions {
        server_version: said("version"),
        server_build: said("commit"),
        server_contract: said("contract"),
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        app_build: env!("VERSO_COMMIT").to_owned(),
        app_contract: contract_version(),
    }
}

/// Why this app's sync and the server's do not follow each other, in
/// English for the log (ADR 0079 item 5): the server said this app's is
/// older than it takes, or the server's is older than the version before
/// this app's. A server that says no version speaks the one before the
/// first.
pub(crate) fn sync_refused(hello: &Value) -> Option<String> {
    use verso_core::sync::{PROTOCOL, follows};
    let theirs = hello["sync"]
        .as_u64()
        .map_or(0, |v| u32::try_from(v).unwrap_or(u32::MAX));
    (hello.get("syncRefused").is_some() || !follows(PROTOCOL, theirs)).then(|| {
        format!(
            "the server speaks sync {theirs}, this app sync {PROTOCOL}: update the one that is behind"
        )
    })
}

/// The refusal of a server whose contract is not this app's, in English
/// for the log: with one version on both sides — two builds of it — the
/// build and the contract of each (the live campaign, 2026-10-11, read "the
/// server runs Verso 0.7.0-beta.1, another version than this app's
/// 0.7.0-beta.1").
pub(crate) fn mismatch_refused(v: &SyncVersions) -> ContractError {
    refused(if v.server_version == v.app_version {
        format!(
            "the server runs Verso {} (build {}, contract {}), this app {} (build {}, contract {}): their contracts differ — update the one that is behind",
            v.server_version,
            v.server_build,
            v.server_contract,
            v.app_version,
            v.app_build,
            v.app_contract
        )
    } else {
        format!(
            "the server runs Verso {}, this app {}: update the one that is behind",
            v.server_version, v.app_version
        )
    })
}

/// A field of a message, taken out of it rather than copied: an answer may
/// be a piece of a file, megabytes.
fn take(m: &mut Value, field: &str) -> Value {
    m.get_mut(field).map(Value::take).unwrap_or_default()
}

/// The server's own 401 (a session it ended), told from any other device's:
/// over `wss://` the certificate was checked for the name, so any 401 is the
/// server's; over `ws://` a router's basic-auth page can answer 401 too, so
/// it counts only with the header every refusal of the server carries — the
/// sync protocol's, which no router writes. The header, not the body: the
/// body may arrive after the headers have been read.
pub(crate) fn is_servers_401(
    response: &tokio_tungstenite::tungstenite::http::Response<Option<Vec<u8>>>,
    tls: bool,
) -> bool {
    response.status().as_u16() == 401
        && (tls
            || response
                .headers()
                .get(verso_core::sync::PROTOCOL_HEADER)
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.trim().parse::<u32>().is_ok()))
}

/// Open the WebSocket of `request` at `host:port`: per address, the TCP
/// connection and the TLS and WebSocket handshakes, so that an address that
/// accepts the connection and cannot complete them (a router's own page on
/// 443) is passed over for the next (dns.rs, ADR 0097). The name resolved is
/// the URL's and the certificate is verified for it; `connector` is the
/// tests' way to trust a certificate of their own. The server's own 401 ends
/// the dial as "sign in again".
pub(crate) async fn ws_open(
    server_url: &str,
    host: &str,
    port: u16,
    request: tokio_tungstenite::tungstenite::handshake::client::Request,
    connector: Option<tokio_tungstenite::Connector>,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    ContractError,
> {
    use tokio_tungstenite::tungstenite::Error as Wire;
    let tls = request.uri().scheme_str() == Some("wss");
    dns::declare(host, tls);
    let shaken = dns::dial_with(host, port, |stream| {
        let (request, connector) = (request.clone(), connector.clone());
        async move {
            tokio_tungstenite::client_async_tls_with_config(request, stream, None, connector)
                .await
                .map_err(|e| {
                    let answered = matches!(&e, Wire::Http(r) if is_servers_401(r, tls));
                    (e, answered)
                })
        }
    })
    .await;
    let mapped = |e: Wire| match e {
        Wire::Http(r) if is_servers_401(&r, tls) => {
            refused("the server ended this device's session: sign in again")
        }
        other => reach::not_dialed(server_url, &other),
    };
    shaken.map(|(socket, _)| socket).map_err(|d| match d {
        dns::Dial::Io(e) => mapped(Wire::Io(e)),
        dns::Dial::Shake(e) => mapped(e),
    })
}

/// [`dial`] without the contract's check: the connection, what it hears,
/// and the server's hello.
pub(crate) async fn dial_hello(
    login: &ServerLogin,
    folder: String,
) -> Result<(Arc<Remote>, mpsc::UnboundedReceiver<Heard>, Value), ContractError> {
    let ws_url = format!(
        "{}/api/ws",
        login
            .url
            .replacen("https://", "wss://", 1)
            .replacen("http://", "ws://", 1)
    );
    let mut request = ws_url
        .into_client_request()
        .map_err(|e| failed(e.to_string()))?;
    let bearer = format!("Bearer {}", login.token)
        .parse()
        .map_err(|_| failed("a token that is no header"))?;
    request.headers_mut().insert("authorization", bearer);
    // The sync this app speaks (ADR 0079 item 5): the server answers its
    // own in the hello, and whether it follows this one.
    let sync = verso_core::sync::PROTOCOL
        .to_string()
        .parse()
        .map_err(|_| failed("a sync version that is no header"))?;
    request
        .headers_mut()
        .insert(verso_core::sync::PROTOCOL_HEADER, sync);
    // The connection is made here, not by the library, so the name is
    // resolved by the same rule as every other request (dns.rs, ADR 0097):
    // the TLS handshake still verifies the certificate for the URL's name.
    let uri = request.uri().clone();
    let host = uri
        .host()
        .ok_or_else(|| failed("not an address"))?
        .to_owned();
    let port = uri
        .port_u16()
        .unwrap_or(if uri.scheme_str() == Some("wss") {
            443
        } else {
            80
        });
    let socket = ws_open(&login.url, &host, port, request, None).await?;
    let (mut write, mut read) = socket.split();
    let (tx, mut rx) = mpsc::channel::<Message>(QUEUE);
    let (heard_tx, heard_rx) = mpsc::unbounded_channel::<Heard>();
    let pending: Pending = Arc::default();
    let (hello_tx, hello_rx) = oneshot::channel::<Value>();
    let dead = Arc::new(tokio::sync::Notify::new());
    // Pings sent since the server was last heard.
    let unanswered = Arc::new(AtomicU8::new(0));
    let writing = Arc::clone(&pending);
    let heard_w = heard_tx.clone();
    let (dead_w, unanswered_w) = (Arc::clone(&dead), Arc::clone(&unanswered));
    let url = login.url.clone();
    tauri::async_runtime::spawn(async move {
        let mut ping =
            tokio::time::interval_at(tokio::time::Instant::now() + PING_EVERY, PING_EVERY);
        ping.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            let sent = tokio::select! {
                message = rx.recv() => {
                    // The connection was let go: nothing can be asked on
                    // it any more.
                    let Some(message) = message else {
                        close(&writing);
                        return;
                    };
                    let within = send_within(message.len());
                    let sent = tokio::time::timeout(within, write.send(message)).await;
                    if sent.is_err() {
                        log::write(
                            "WARN",
                            "host",
                            &format!("the server at {url} took no message in {} s: its connection is taken as closed", within.as_secs()),
                        );
                    }
                    sent.map_err(|_| ()).and_then(|s| s.map_err(|_| ()))
                }
                _ = ping.tick() => {
                    // A question waiting: its answer may be a piece of a
                    // file still on its way over a slow link, and nothing
                    // is heard until it is whole — `ANSWER_WITHIN` is the
                    // net then.
                    if !lock(&writing).waiting.is_empty() {
                        unanswered_w.store(0, Ordering::Relaxed);
                        continue;
                    }
                    if unanswered_w.load(Ordering::Relaxed) >= MISSED {
                        log::write(
                            "WARN",
                            "host",
                            &format!("the server at {url} answered none of {MISSED} pings: its connection is taken as closed"),
                        );
                        dead_w.notify_one();
                        return;
                    }
                    // Counted before it is written: its pong may be heard
                    // before this task runs again.
                    unanswered_w.fetch_add(1, Ordering::Relaxed);
                    tokio::time::timeout(send_within(0), write.send(Message::Ping(Default::default())))
                        .await
                        .map_err(|_| ())
                        .and_then(|s| s.map_err(|_| ()))
                }
            };
            if sent.is_err() {
                // The question just sent, and any after it, is answered
                // here: the reader may have ended already.
                if close(&writing) {
                    let _ = heard_w.send(Heard::Closed);
                }
                return;
            }
        }
    });
    let reading = Arc::clone(&pending);
    let dead_r = Arc::clone(&dead);
    tauri::async_runtime::spawn(async move {
        let mut hello = Some(hello_tx);
        loop {
            let message = tokio::select! {
                message = read.next() => message,
                () = dead_r.notified() => break,
            };
            let Some(Ok(message)) = message else {
                break;
            };
            // Anything heard, a pong or any other message, says the server
            // is there.
            unanswered.store(0, Ordering::Relaxed);
            // A binary message is an answer carrying a piece of a file
            // (sync 2): its header, then the piece as it is.
            let (parsed, piece) = match message {
                Message::Text(text) => (serde_json::from_str::<Value>(&text).ok(), None),
                Message::Binary(bytes) => match verso_core::sync::unframe(&bytes) {
                    Some((header, piece)) => (
                        serde_json::from_slice::<Value>(header).ok(),
                        Some(piece.to_vec()),
                    ),
                    None => (None, None),
                },
                _ => continue,
            };
            let Some(mut m) = parsed else {
                continue;
            };
            if let Some(id) = m["id"].as_u64() {
                if let Some(p) = lock(&reading).waiting.remove(&id) {
                    let _ = p.send(if m.get("err").is_some() {
                        Err(take(&mut m, "err"))
                    } else {
                        Ok((take(&mut m, "ok"), piece))
                    });
                }
            } else if let Some(event) = m["event"].as_str().map(str::to_owned) {
                let _ = heard_tx.send(Heard::Event(event, take(&mut m, "payload")));
            } else if m.get("hello").is_some() {
                if let Some(h) = hello.take() {
                    let _ = h.send(take(&mut m, "hello"));
                }
            } else if m.get("gone").is_some() {
                let reason = m["reason"].as_str().map(str::to_owned);
                let _ = heard_tx.send(Heard::Gone(take(&mut m, "gone"), reason));
            } else if let Some(role) = m["role"].as_str() {
                let _ = heard_tx.send(Heard::Role(role.to_owned()));
            }
        }
        // The connection closed: every question waiting is unanswered.
        close(&reading);
        let _ = heard_tx.send(Heard::Closed);
    });
    let hello = tokio::time::timeout(std::time::Duration::from_secs(10), hello_rx)
        .await
        .map_err(|_| failed("the server did not answer"))?
        .map_err(|_| failed("the server closed the connection"))?;
    // Pieces as binary messages when both sides speak a sync that takes
    // them; a server that says no sync speaks the one before the first.
    let theirs = hello["sync"]
        .as_u64()
        .map_or(0, |v| u32::try_from(v).unwrap_or(u32::MAX));
    let binary = verso_core::sync::binary_pieces(theirs.min(verso_core::sync::PROTOCOL));
    let remote = Arc::new(Remote {
        url: login.url.clone(),
        folder,
        token: login.token.clone(),
        next: AtomicU64::new(1),
        latency: std::sync::atomic::AtomicU32::new(0),
        pending,
        tx,
        dead,
        binary,
    });
    Ok((remote, heard_rx, hello))
}

/// A window's connection: what it hears goes to the window, and a closed
/// connection is tried again while the window still shows the folder.
async fn connect<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    login: ServerLogin,
    folder: String,
) -> Result<Arc<Remote>, ContractError> {
    let (remote, mut heard) = dial(&login, folder).await?;
    // This connection, to tell it from the one that may replace it.
    let this = Arc::downgrade(&remote);
    let app_r = app.clone();
    let label_r = label.to_owned();
    let url_r = login.url;
    tauri::async_runtime::spawn(async move {
        while let Some(h) = heard.recv().await {
            match h {
                Heard::Event(event, payload) => {
                    if let Some(payload) = with_server(&event, payload, &url_r) {
                        let _ = app_r.emit_to(label_r.as_str(), &event, payload);
                    }
                }
                Heard::Gone(what, reason) => {
                    let _ = app_r.emit_to(
                        label_r.as_str(),
                        "server-gone",
                        gone(&url_r, what.as_str().unwrap_or_default(), reason, None),
                    );
                }
                // A window on a server's folder asks its capabilities
                // again when it reconnects; the role is the server's to
                // enforce meanwhile.
                Heard::Role(_) => {}
                Heard::Closed => break,
            }
        }
        // Still the window's connection: not one the person opened since,
        // nor one a reconnection made since.
        let still = lock(&app_r.state::<App>().remotes)
            .get(&label_r)
            .filter(|r| std::ptr::eq(Arc::as_ptr(r), this.as_ptr()))
            .map(|r| r.folder.clone());
        if let Some(folder) = still {
            let _ = app_r.emit_to(
                label_r.as_str(),
                "server-gone",
                gone(&url_r, "connection", None, None),
            );
            // The window keeps the server's folder and tries again: a laptop
            // that slept, a server that restarted (ADR 0073 item 2).
            tauri::async_runtime::spawn(reconnect(
                app_r.clone(),
                label_r.clone(),
                url_r.clone(),
                folder,
                this,
            ));
        }
    });
    Ok(remote)
}

/// What a window on a server's folder hears when the server, or what it
/// held there, is gone (ADR 0084 item 10).
fn gone(url: &str, what: &str, reason: Option<String>, address: Option<String>) -> ServerGone {
    // The game master closed the table: said as that, not as a share revoked.
    let shut = what == "folder" && reason.as_deref() == Some("closed");
    ServerGone {
        url: url.to_owned(),
        what: if shut { "closed" } else { what }.to_owned(),
        reason: reason.filter(|_| !shut),
        address,
    }
}

/// A server's event as the window hears it: a share given names the
/// server it was given on, which only this side knows (ADR 0084 item 7);
/// every other goes as it came. A share given that does not read as its
/// type is not said at all, never half.
pub(crate) fn with_server(event: &str, payload: Value, url: &str) -> Option<Value> {
    if event != "share-given" {
        return Some(payload);
    }
    let given = serde_json::from_value::<ShareGiven>(payload).ok()?;
    serde_json::to_value(ShareGiven {
        server: Some(url.to_owned()),
        ..given
    })
    .ok()
}

/// Connect again after the connection dropped, for as long as the window
/// still shows the server's folder on the connection that dropped
/// (`dead`): a wait of 5 s doubling to 5 min (`reach::redial`), cut short
/// when the person asks ("Tentar de novo", `server_retry`, or opening the
/// same folder again), the waits then starting over. Each try that finds
/// the server out of reach says so to the window (`server-gone`, `what`
/// "unreachable", with its address); the log says it once a minute
/// (reach.rs). Connected, the folder is opened again, the window told the
/// folder may have changed meanwhile, and that the server is back. A
/// session the server ended stops it. Boxed: it and `connect` start each
/// other.
fn reconnect<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    label: String,
    url: String,
    folder: String,
    dead: std::sync::Weak<Remote>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>> {
    Box::pin(async move {
        let asked = reach::waiting(&label);
        let attempt = || {
            let (app, label, url, folder, dead) = (
                app.clone(),
                label.clone(),
                url.clone(),
                folder.clone(),
                dead.clone(),
            );
            async move { redial_once(&app, &label, &url, &folder, &dead).await }
        };
        let wait = |d| reach::wait_or_asked(d, Arc::clone(&asked));
        reach::redial(reach::Backoff::new(), attempt, wait).await;
        reach::done_waiting(&label, &asked);
    })
}

/// One try of [`reconnect`].
async fn redial_once<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    url: &str,
    folder: &str,
    dead: &std::sync::Weak<Remote>,
) -> reach::Step<()> {
    use reach::Step;
    // The window moved on: another folder, this one opened again, or gone.
    let mine = lock(&app.state::<App>().remotes)
        .get(label)
        .is_some_and(|r| std::ptr::eq(Arc::as_ptr(r), dead.as_ptr()));
    if !mine {
        return Step::Stop;
    }
    let Ok(Some(login)) = servers::find(app.state::<App>().service.config(), url) else {
        return Step::Stop;
    };
    let remote = match connect(app, label, login, folder.to_owned()).await {
        Ok(r) => r,
        Err(e) if e.kind == ErrorKind::Refused => {
            release(app, label);
            let _ = app.emit_to(label, "server-gone", gone(url, "session", None, None));
            return Step::Stop;
        }
        Err(e) => {
            if e.kind == ErrorKind::Unreachable {
                let _ = app.emit_to(
                    label,
                    "server-gone",
                    gone(url, "unreachable", None, Some(e.message)),
                );
            }
            return Step::Again;
        }
    };
    // The folder's key, from the answer: the window hears a change of its
    // own folder only.
    let opened = remote
        .call("open_server_folder", json!({ "id": folder }))
        .await;
    let Ok(info) = opened else {
        // A closed table: said, and tried again until the game master opens it.
        if opened.is_err_and(|e| e.to_string().contains(verso_contract::TABLE_CLOSED)) {
            let _ = app.emit_to(label, "server-gone", gone(url, "closed", None, None));
        }
        return Step::Again;
    };
    let key = info.get("key").cloned().unwrap_or(json!(""));
    lock(&app.state::<App>().remotes).insert(label.to_owned(), Arc::clone(&remote));
    if let Ok(index) = remote.call("reindex", json!({})).await {
        let _ = app.emit_to(
            label,
            "folder-changed",
            json!({ "key": key, "changed": [], "removed": [], "listing": true, "index": index }),
        );
    }
    let _ = app.emit_to(
        label,
        "server-back",
        ServerBack {
            url: url.to_owned(),
        },
    );
    Step::Done(())
}

/// The window's reconnection tries now, its waits starting over: the
/// person's "Tentar de novo" while the window's server is out of reach.
/// Nothing when the window is not reconnecting.
#[tauri::command]
#[specta::specta]
pub(crate) fn server_retry<R: tauri::Runtime>(
    window: tauri::Window<R>,
) -> Result<(), ContractError> {
    reach::try_now(window.label());
    Ok(())
}

/// A connection's server, as a window is told it.
pub(crate) fn server_window(r: &Remote) -> verso_contract::ServerWindow {
    verso_contract::ServerWindow {
        url: r.url.trim_end_matches('/').to_owned(),
        folder: r.folder.clone(),
    }
}

/// Where this window reaches its server: the address the app is signed in
/// to and the folder's id there, or nothing for a folder of this computer
/// that is not synced (or whose sync link is down).
/// A link the server hands over without its public name is a path, and the
/// window puts this before it; its own origin (`tauri://localhost`) is the
/// app's, never the server's.
#[tauri::command]
#[specta::specta]
pub(crate) fn window_server<R: tauri::Runtime>(
    window: tauri::Window<R>,
) -> Result<Option<verso_contract::ServerWindow>, ContractError> {
    // A server's folder, or a folder of this computer synced with one over
    // its live link (ADR 0082, ADR 0110 as built): a table's links go to the
    // server of that link.
    let app = window.app_handle();
    let remote = of(app, window.label())
        .or_else(|| synced_of(app, window.label()).and_then(|s| s.live.remote()));
    Ok(remote.map(|r| server_window(&r)))
}

/// Before the app's own handler: a window on a server's folder sends the
/// folder's commands there, and its answer — or its error, a
/// `ContractError` — goes back as the app's own would.
pub(crate) fn forward<R: tauri::Runtime>(
    invoke: tauri::ipc::Invoke<R>,
) -> Option<tauri::ipc::Invoke<R>> {
    let cmd = invoke.message.command().to_owned();
    let webview = invoke.message.webview();
    let label = webview.label().to_owned();
    if !is_app_view(&label) || !forwards(&cmd) {
        return Some(invoke);
    }
    let Some(remote) = of(webview.app_handle(), &label) else {
        return Some(invoke);
    };
    let args = match invoke.message.payload() {
        tauri::ipc::InvokeBody::Json(v) => v.clone(),
        tauri::ipc::InvokeBody::Raw(_) => Value::Null,
    };
    let resolver = invoke.resolver;
    // Put on the connection here, in the order the window asked: a task's
    // first turn comes in any order, and the server takes a window's room
    // updates in the order they reach it (ADR 0083 item 14).
    let asked = remote.ask(&cmd, args, None);
    tauri::async_runtime::spawn(async move {
        let answer = match asked {
            Ok(asked) => remote.answer(&cmd, asked).await.map(|(v, _)| v),
            Err(e) => Err(e),
        };
        match answer {
            Ok(v) => resolver.resolve(v),
            Err(e) => resolver.reject(e),
        }
    });
    None
}

/// A file a window on a server's folder shows, from the server.
pub(crate) fn file<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    relative: &str,
) -> Option<Served> {
    of(app, label).map(|r| r.file(relative))
}

#[cfg(test)]
mod tests_server_url {
    use super::server_url;

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
            assert_eq!(server_url(given).unwrap(), kept, "{given}");
        }
        assert!(server_url("ftp://notas.casa").is_err());
        assert!(server_url("notas.casa").is_err());
    }
}
