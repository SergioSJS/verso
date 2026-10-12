// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The contract over a WebSocket (ADR 0073 item 2): the window sends
//! `{id, cmd, args}` — the command's name and the arguments the generated
//! bindings send, as Tauri's IPC carries them — and gets `{id, ok}` or
//! `{id, err}` back, a `ContractError` as the desktop's. The server pushes
//! the events the desktop's host emits (`folder-changed`,
//! `index-progress`) to the windows that show the folder, and says what
//! happens to the connection itself (`hello`, `folder`, `role`, `gone`).
//!
//! Every command carries the session the connection was opened with: it
//! is checked again before each one, and the member's role in the folder
//! is checked before the core acts (ADR 0074 item 11). A command the
//! server does not have — the desktop's windows, menus, updates — is
//! refused; the window hides it, told by `capabilities`.

use std::sync::Arc;
use std::time::Duration;

use axum::extract::WebSocketUpgrade;
use axum::extract::ws::{Message, WebSocket};
use axum::response::Response;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::Semaphore;
use verso_contract::{Can, Capabilities, ContractError, ErrorKind, Host};
use verso_service::{Access, lock, ops};

use crate::auth::{Via, Who};
use crate::db::{Folder, Role};
use crate::http::{ApiError, ApiResult, Ctx};
use crate::state::{Client, Outbox, QUEUE, Server};

/// The largest message: a picture pasted into a note crosses as base64 in
/// `create_file` (ADR 0073 item 6: upload limits).
pub const MAX_MESSAGE: usize = 48 * 1024 * 1024;

/// What a command is answered when the connection's session ended.
const SIGNED_OUT: &str = "signed out";

/// Lines a window may write to the server's log a minute.
const LOG_LINES: u32 = 60;

/// Requests a connection may have under way at once. A window asks a few
/// things at a time (more while it opens a folder), a device one piece of
/// a file at a time; past this, the connection's next requests wait to be
/// read — none is refused — so one connection cannot hold the server's
/// threads and memory with requests it sent all at once.
const REQUESTS: usize = 8;

/// How often the server pings a connection: a connection whose other end
/// went away without closing it (a laptop's lid shut, a network dropped)
/// is noticed by the pings it does not answer. The other end's WebSocket
/// answers on its own; nothing of the window or the device takes part.
const PING_EVERY: Duration = Duration::from_secs(30);

/// Pings in a row left unanswered before the connection is closed.
const MISSED: u8 = 2;

/// The least time a message may take to be written (threat-model.md,
/// gap 2): a small message's round on a poor link, with room to spare.
#[cfg(not(test))]
const SEND_FLOOR: Duration = Duration::from_secs(30);
#[cfg(test)]
const SEND_FLOOR: Duration = Duration::from_secs(1);
/// The slowest link a message is waited for, in bytes a second: 32 KiB/s,
/// 256 kbit/s, under a weak mobile link's. A piece of a file — 4 MiB, some
/// 5.6 MB as base64 — gets about three minutes; a message at
/// [`MAX_MESSAGE`], about twenty-five. The desktop's connection waits
/// the same (app/src-tauri/src/remote.rs).
#[cfg(not(test))]
const SEND_RATE: u64 = 32 * 1024;
#[cfg(test)]
const SEND_RATE: u64 = 1024 * 1024;

/// How long a message of `bytes` may take to be written before the other
/// end is taken as no longer reading: a peer that stops reading at the
/// TCP level otherwise holds the connection's loop in the write — the
/// full queue and the pings unheard — until the system gives up on the
/// socket, hours later.
pub(crate) fn send_within(bytes: usize) -> Duration {
    let bytes = u64::try_from(bytes).unwrap_or(u64::MAX);
    SEND_FLOOR.saturating_add(Duration::from_secs(bytes / SEND_RATE))
}

/// Write `message` to the connection within [`send_within`] its size:
/// false when the write failed or did not end in time — the connection is
/// then closed, and the time said in the log.
async fn write(socket: &mut WebSocket, message: Message, client: &str, account: &str) -> bool {
    let bytes = match &message {
        Message::Text(t) => t.len(),
        Message::Binary(b) => b.len(),
        _ => 0,
    };
    let within = send_within(bytes);
    match tokio::time::timeout(within, socket.send(message)).await {
        Ok(sent) => sent.is_ok(),
        Err(_) => {
            crate::log::warn(&format!(
                "connection {client} ({account}) closed: a message of {bytes} bytes was not taken in {} s",
                within.as_secs()
            ));
            false
        }
    }
}

pub async fn upgrade(ctx: Ctx, ws: WebSocketUpgrade) -> ApiResult<Response> {
    ctx.secure()?;
    let who = ctx.who()?.clone();
    // The WebSocket of the contract checks `Origin` before it accepts the
    // cookie (ADR 0073 item 6, ADR 0074 item 7): a page of another site
    // cannot open it with the person's session.
    if matches!(who.via, Via::Browser { .. }) && !crate::auth::origin_ok(&ctx.server, &ctx.headers)
    {
        return Err(ApiError::forbidden("not from a page of this server"));
    }
    // The notes' window in a browser is served only with `--web` (ADR 0073
    // item 2); the desktop app and programs connect with their tokens.
    if matches!(who.via, Via::Browser { .. }) && !ctx.server.config.web {
        return Err(ApiError::new(
            axum::http::StatusCode::FORBIDDEN,
            "no_web",
            "this server serves no window in a browser (verso serve --web)",
        ));
    }
    // The sync a device speaks (ADR 0079 item 5): a window, a program, or
    // an app from before the version says none and is not refused.
    let sync = ctx
        .headers
        .get(verso_core::sync::PROTOCOL_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<u32>().ok());
    let sync_refused = sync_refusal(sync, verso_core::sync::PROTOCOL);
    let server = Arc::clone(&ctx.server);
    Ok(ws
        .max_message_size(MAX_MESSAGE)
        .on_upgrade(move |socket| run(server, who, socket, sync_refused)))
}

/// Why a device that speaks sync `theirs` is refused by a server that
/// speaks `ours`, in English for the log and the device's words: older
/// than the version before `ours` (ADR 0079 item 5). `None` when it
/// follows, and when it said no version.
pub(crate) fn sync_refusal(theirs: Option<u32>, ours: u32) -> Option<String> {
    let theirs = theirs?;
    (!verso_core::sync::follows(ours, theirs)).then(|| {
        format!(
            "this app speaks sync {theirs}, the server sync {ours} and {}: update the one that is behind",
            ours.saturating_sub(1)
        )
    })
}

#[derive(Deserialize)]
struct Request {
    id: u64,
    cmd: String,
    #[serde(default)]
    args: Value,
}

async fn run(server: Arc<Server>, who: Who, mut socket: WebSocket, sync_refused: Option<String>) {
    let client = server.client_id();
    let (tx, mut rx, slow) = Outbox::new(QUEUE);
    let mut hello = json!({ "hello": {
        "version": env!("CARGO_PKG_VERSION"),
        "commit": server.commit,
        "contract": server.contract,
        "sync": verso_core::sync::PROTOCOL,
        "account": crate::api::account_json(&who.account),
    }});
    // A device older than the sync this server follows is told so in the
    // hello, and its sync's commands are refused with the same words.
    if let Some(why) = &sync_refused {
        hello["hello"]["syncRefused"] = json!(why);
        crate::log::info(&format!(
            "connection {client} ({}): sync refused: {why}",
            who.account.id
        ));
    }
    // The hello is the first message the queue holds, written as any
    // other; the connection is pushed to only after it.
    tx.send(&hello);
    lock(&server.clients).insert(
        client.clone(),
        Client {
            account: who.account.id.clone(),
            session: who.session().map(str::to_owned),
            folder: None,
            tx: tx.clone(),
        },
    );
    let account = who.account.id.clone();
    let who = Arc::new(who);
    let mut log_budget = (std::time::Instant::now(), 0_u32);
    let requests = Arc::new(Semaphore::new(REQUESTS));
    let mut ping = tokio::time::interval_at(tokio::time::Instant::now() + PING_EVERY, PING_EVERY);
    ping.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut unanswered: u8 = 0;
    loop {
        tokio::select! {
            pushed = rx.recv() => {
                let Some(out) = pushed else { break };
                if !write(&mut socket, Message::Text(out.text), &client, &account).await {
                    break;
                }
                // Written: the request it answered gives its place back.
                drop(out.permit);
                if out.close {
                    let _ = write(&mut socket, Message::Close(None), &client, &account).await;
                    break;
                }
            }
            () = slow.notified() => {
                crate::log::warn(&format!(
                    "connection {client} ({}) closed: {QUEUE} messages waited for it, it reads too slowly",
                    who.account.id
                ));
                break;
            }
            _ = ping.tick() => {
                // Every request's place taken: the connection is not read
                // until one is answered, so a pong could not be heard.
                if requests.available_permits() == 0 {
                    unanswered = 0;
                    continue;
                }
                if unanswered >= MISSED {
                    crate::log::info(&format!(
                        "connection {client} ({}) closed: {MISSED} pings unanswered",
                        who.account.id
                    ));
                    break;
                }
                if !write(&mut socket, Message::Ping(Default::default()), &client, &account).await {
                    break;
                }
                unanswered += 1;
            }
            // Read only while a request may start: past [`REQUESTS`] under
            // way, the next waits in the connection, not in memory here.
            incoming = socket.recv(), if requests.available_permits() > 0 => {
                let Some(Ok(message)) = incoming else { break };
                // Anything heard, a pong or a request, says the other end
                // is there.
                unanswered = 0;
                // Parsed where it arrived: a piece of a file is megabytes.
                let parsed = match message {
                    Message::Text(t) => serde_json::from_str::<Request>(t.as_str()),
                    Message::Close(_) => break,
                    _ => continue,
                };
                let Ok(request) = parsed else {
                    tx.send(&json!({ "err": refused("not a request") }));
                    continue;
                };
                if let Some(why) = &sync_refused
                    && request.cmd.starts_with("sync_")
                {
                    tx.send(&json!({ "id": request.id, "err": refused(why) }));
                    continue;
                }
                if request.cmd == "log_write" {
                    if log_budget.0.elapsed().as_secs() >= 60 {
                        log_budget = (std::time::Instant::now(), 0);
                    }
                    log_budget.1 += 1;
                    if log_budget.1 > LOG_LINES {
                        tx.send(&json!({ "id": request.id, "ok": null }));
                        continue;
                    }
                }
                // Free: this loop alone takes places, and read only with
                // one free.
                let Ok(permit) = Arc::clone(&requests).try_acquire_owned() else {
                    tx.send(&json!({ "id": request.id, "err": refused("too many requests at once") }));
                    continue;
                };
                let server = Arc::clone(&server);
                let who = Arc::clone(&who);
                let client = client.clone();
                let tx = tx.clone();
                // Each command in a task of its own: an index run of
                // seconds holds no other answer.
                tokio::spawn(async move {
                    let id = request.id;
                    let answer = handle(&server, &who, &client, request).await;
                    let signed_out = answer.as_ref().is_err_and(|e| e.message == SIGNED_OUT);
                    let reply = match answer {
                        Ok(value) => json!({ "id": id, "ok": value }),
                        Err(e) => json!({ "id": id, "err": e }),
                    };
                    tx.answer(reply, permit).await;
                    // The answer first, then the connection told and closed.
                    if signed_out {
                        tx.send(&json!({ "gone": "session" }));
                    }
                });
            }
        }
    }
    lock(&server.clients).remove(&client);
    server.transfers.forget(&client);
    let s = Arc::clone(&server);
    let _ = tokio::task::spawn_blocking(move || {
        crate::collab::gone(&s, &client);
        s.service.release(&client);
    })
    .await;
}

fn refused(message: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message: message.to_owned(),
    }
}

fn contract(e: &ApiError) -> ContractError {
    ContractError {
        kind: match e.status.as_u16() {
            404 => ErrorKind::NotFound,
            401 | 403 => ErrorKind::Refused,
            _ => ErrorKind::Failed,
        },
        message: e.message.clone(),
    }
}

/// The credential the connection was opened with is still good: the
/// session not ended, the token not revoked, the account not removed.
fn still_signed_in(server: &Server, who: &Who) -> Result<bool, String> {
    match &who.via {
        Via::Browser { session, .. } | Via::Device { session } => server.db.session_alive(session),
        Via::Token { id, .. } => server.db.token_alive(id),
    }
}

pub(crate) async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, ContractError> + Send + 'static,
) -> Result<T, ContractError> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| verso_service::failed(e.to_string()))?
}

pub(crate) fn to_value<T: serde::Serialize>(v: T) -> Result<Value, ContractError> {
    serde_json::to_value(v).map_err(|e| verso_service::failed(e.to_string()))
}

pub(crate) fn arg<T: serde::de::DeserializeOwned>(
    args: &Value,
    name: &str,
) -> Result<T, ContractError> {
    serde_json::from_value(args.get(name).cloned().unwrap_or(Value::Null))
        .map_err(|e| refused(&format!("{name}: {e}")))
}

async fn handle(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    r: Request,
) -> Result<Value, ContractError> {
    if !still_signed_in(server, who).map_err(verso_service::failed)? {
        return Err(ContractError {
            kind: ErrorKind::Refused,
            message: SIGNED_OUT.to_owned(),
        });
    }
    let args = r.args;
    if let Some(access) = ops::access(&r.cmd) {
        return folder_command(server, who, client, &r.cmd, access, args).await;
    }
    match r.cmd.as_str() {
        "open_server_folder" => {
            let id: String = arg(&args, "id")?;
            let (folder, role) = crate::access::role(server, who, &id).map_err(|e| contract(&e))?;
            open(server, client, folder, role).await
        }
        "reopen_folder" => {
            let key: String = arg(&args, "key")?;
            let mut found = None;
            for (f, _) in server
                .db
                .folders_of(&who.account.id)
                .map_err(verso_service::failed)?
            {
                if let Some(path) = server.folder_path(&f.dir)
                    && verso_core::folder_key(&path) == key
                {
                    found = Some(f.id);
                }
            }
            let id = found.ok_or_else(|| ContractError {
                kind: ErrorKind::NotFound,
                message: "no folder of yours has that key".to_owned(),
            })?;
            let (folder, role) = crate::access::role(server, who, &id).map_err(|e| contract(&e))?;
            open(server, client, folder, role).await
        }
        // The window's own: the browser's shim chooses among the
        // account's folders, and a URL names the folder to open.
        "pick_folder" | "open_initial" => Ok(Value::Null),
        "current_folder" => to_value(server.service.current_folder(client)),
        "reindex" => {
            role_here(server, client)?;
            let service = Arc::clone(&server.service);
            let c = client.to_owned();
            let summary = blocking(move || service.reindex(&c)).await?;
            record_space(server, client).await;
            to_value(summary)
        }
        "capabilities" => to_value(capabilities(server, who, client)),
        "app_info" => Ok(
            json!({ "version": env!("CARGO_PKG_VERSION"), "commit": server.commit, "device": null }),
        ),
        "render_markdown" => {
            let text: String = arg(&args, "text")?;
            Ok(Value::String(verso_core::render_markdown(&text)))
        }
        "board_text" => {
            let json: String = arg(&args, "json")?;
            to_value(ops::board_text(&json)?)
        }
        "log_write" => {
            let level: String = arg(&args, "level")?;
            let message: String = arg(&args, "message")?;
            let level = match level.as_str() {
                "PANIC" | "ERROR" | "WARN" | "INFO" => level,
                _ => "ERROR".to_owned(),
            };
            // One line of the log per message: a window's newlines and
            // control characters cannot forge another line.
            let message: String = message
                .chars()
                .take(2000)
                .map(|c| if c.is_control() { ' ' } else { c })
                .collect();
            crate::log::line(
                &level,
                &format!("window {client} ({}): {message}", who.account.id),
            );
            Ok(Value::Null)
        }
        // On a server the walk's rules and the folder note's name are the
        // folder's (ADR 0070): its owner's window sets them; another
        // member's is heard and changes nothing.
        "set_walk_rules" | "set_folder_note_name" => {
            if let Ok((_, Role::Owner)) = role_here(server, client) {
                let rules = (r.cmd == "set_walk_rules")
                    .then(|| -> Result<_, ContractError> {
                        Ok(verso_core::WalkRules {
                            builtin_ignores: arg(&args, "builtinIgnores")?,
                            gitignore: arg(&args, "gitignore")?,
                        })
                    })
                    .transpose()?;
                let name: Option<String> = (r.cmd == "set_folder_note_name")
                    .then(|| arg(&args, "name"))
                    .transpose()?;
                let service = Arc::clone(&server.service);
                let c = client.to_owned();
                blocking(move || {
                    service.set_folder_settings(&c, rules, name.as_deref());
                    Ok(())
                })
                .await?;
            }
            Ok(Value::Null)
        }
        // The person's own, kept by the window: the approved embed origins
        // are the reader's (answer I), the menu is the desktop's.
        "set_embed_origins" | "set_menu_language" => Ok(Value::Null),
        "fetch_file" => Ok(Value::Bool(false)),
        "collab_join" | "collab_update" | "collab_awareness" | "collab_leave" | "collab_save"
        | "collab_resolve" => collab_command(server, who, client, &r.cmd, &args).await,
        "sync_state" | "sync_changes" | "sync_read" => {
            crate::sync::command(server, who, client, &r.cmd, args).await
        }
        // A device's change: the folder's space follows it (ADR 0077).
        "sync_put" | "sync_delete" | "sync_rename" => {
            let done = crate::sync::command(server, who, client, &r.cmd, args).await?;
            if r.cmd != "sync_put" || done["done"] == true {
                record_space(server, client).await;
            }
            Ok(done)
        }
        _ => Err(refused("not on a server")),
    }
}

/// The commands of a shared note (ADR 0073 item 7): a reader joins and is
/// seen, and writes nothing.
async fn collab_command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    args: &Value,
) -> Result<Value, ContractError> {
    let (folder, role) = role_here(server, client)?;
    let writes = role.writes() && who.reaches(&folder).1;
    if matches!(cmd, "collab_update" | "collab_save" | "collab_resolve") && !writes {
        return Err(refused("you may only read this folder"));
    }
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    let path: String = arg(args, "path")?;
    let s = Arc::clone(server);
    let c = client.to_owned();
    let cmd = cmd.to_owned();
    let args = args.clone();
    let user = who.account.name.clone();
    blocking(move || match cmd.as_str() {
        "collab_join" => to_value(crate::collab::join(&s, &c, &key, &path, &user)?),
        "collab_update" => {
            let update: String = arg(&args, "update")?;
            crate::collab::update(&s, &c, &key, &path, &update)?;
            Ok(Value::Null)
        }
        "collab_awareness" => {
            let update: String = arg(&args, "update")?;
            crate::collab::awareness(&s, &c, &key, &path, &update)?;
            Ok(Value::Null)
        }
        "collab_leave" => {
            crate::collab::leave(&s, &c, &key, &path);
            Ok(Value::Null)
        }
        "collab_save" => to_value(crate::collab::save(&s, &key, &path)?),
        _ => {
            let keep: String = arg(&args, "keep")?;
            to_value(crate::collab::resolve(&s, &key, &path, &keep)?)
        }
    })
    .await
}

/// The role of the window's folder, or `no_folder`.
pub(crate) fn role_here(server: &Server, client: &str) -> Result<(String, Role), ContractError> {
    lock(&server.clients)
        .get(client)
        .and_then(|c| c.folder.clone())
        .ok_or_else(verso_service::no_folder)
}

async fn folder_command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    name: &str,
    access: Access,
    args: Value,
) -> Result<Value, ContractError> {
    let (folder, role) = role_here(server, client)?;
    let (_, token_writes) = who.reaches(&folder);
    if access == Access::Write && !(role.writes() && token_writes) {
        return Err(refused("you may only read this folder"));
    }
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    let key_for_log = key.clone();
    let args_for_log = args.clone();
    // A write that would pass the folder's quota is refused before
    // anything is written (ADR 0077 item 5).
    if let Some((path, len)) = crate::quota::written(name, &args) {
        let s = Arc::clone(server);
        let k = key.clone();
        blocking(move || crate::quota::check(&s, &k, &path, len)).await?;
    }
    // A write to a note being edited together goes through its room
    // (ADR 0073 item 7).
    if name == "write_note" {
        let path: String = arg(&args, "path")?;
        if server.rooms.has(&key, &path) {
            let text: String = arg(&args, "text")?;
            let revision: String = arg(&args, "revision")?;
            let s = Arc::clone(server);
            let c = client.to_owned();
            return blocking(move || {
                crate::collab::write_through(&s, &key, &path, &text, &revision)?;
                let note = s.service.with(&c, move |ws| ops::read_note(ws, path))?;
                to_value(verso_contract::Written {
                    note,
                    warnings: Vec::new(),
                })
            })
            .await;
        }
    }
    let moves = matches!(
        name,
        "rename_note" | "rename_entry" | "move_entries" | "delete_note" | "delete_entry"
    );
    let service = Arc::clone(&server.service);
    let s = Arc::clone(server);
    let c = client.to_owned();
    let n = name.to_owned();
    let answer = blocking(move || {
        // Nothing typed is left behind a rename or a bin.
        if moves {
            crate::collab::write_all(&s, &key)?;
        }
        let answer = service
            .dispatch(&c, &n, args)
            .unwrap_or_else(|| Err(refused("no such command")));
        if moves && let Ok(notes) = service.with(&c, ops::list_notes) {
            crate::collab::close_missing(&s, &key, &notes);
        }
        answer
    })
    .await?;
    if access == Access::Write {
        record_space(server, client).await;
        // The folder's log for sync follows every write before the answer
        // (ADR 0079 item 4): a device asking next sees it.
        let s = Arc::clone(server);
        let actor = who.account.id.clone();
        let paths = crate::sync::paths_of(&args_for_log);
        let _ = blocking(move || {
            crate::sync::reconcile_key(&s, &key_for_log, Some(&actor), &paths);
            Ok(())
        })
        .await;
    }
    Ok(answer)
}

/// Open the folder for this window, or join its session.
async fn open(
    server: &Arc<Server>,
    client: &str,
    folder: Folder,
    role: Role,
) -> Result<Value, ContractError> {
    let path = server
        .folder_path(&folder.dir)
        .ok_or_else(|| verso_service::failed("not a folder name"))?;
    // A transfer of the folder shown before goes with it.
    server.transfers.forget(client);
    let service = Arc::clone(&server.service);
    let c = client.to_owned();
    let gate = Arc::clone(
        lock(&server.opening)
            .entry(verso_core::folder_key(&path))
            .or_default(),
    );
    let info = blocking(move || {
        let key = verso_core::folder_key(&path);
        let _one = lock(&gate);
        if service.join(&c, &key) {
            return service
                .current_folder(&c)
                .ok_or_else(verso_service::no_folder);
        }
        let opened = service.open(&c, move |config| {
            let mut ws = verso_core::Workspace::open(&path, config)?;
            ws.set_links_inside(true);
            Ok(ws)
        })?;
        let (info, catch_up) = service.attach(&c, opened);
        if let Some(catch_up) = catch_up {
            let service = Arc::clone(&service);
            std::thread::spawn(move || service.catch_up(&catch_up));
        }
        Ok(info)
    })
    .await?;
    lock(&server.keys).insert(info.key.clone(), folder.id.clone());
    // What changed on the disk while nobody had it open joins the folder's
    // log for sync, in the background (ADR 0079 item 4).
    {
        let s = Arc::clone(server);
        let key = info.key.clone();
        tokio::task::spawn_blocking(move || crate::sync::reconcile_key(&s, &key, None, &[]));
    }
    if let Some(c) = lock(&server.clients).get_mut(client) {
        c.folder = Some((folder.id.clone(), role));
        let _ =
            c.tx.send(&json!({ "folder": { "id": folder.id, "name": folder.dir, "role": role } }));
    }
    record_space(server, client).await;
    to_value(info)
}

/// Count the space of the window's folder and keep it for the pages that
/// list folders (ADR 0075 item 4).
async fn record_space(server: &Arc<Server>, client: &str) {
    let Ok((folder, _)) = role_here(server, client) else {
        return;
    };
    let s = Arc::clone(server);
    let c = client.to_owned();
    let _ = tokio::task::spawn_blocking(move || {
        let Ok(space) = s.service.with(&c, ops::folder_space) else {
            return;
        };
        // With when it was counted: the console's "last change" (ADR 0077).
        let mut kept = serde_json::to_value(&space).unwrap_or_else(|_| json!({}));
        // Sync's record of the files follows every write as it happens;
        // the listing the count above walks only the watcher's batches.
        if let Ok(files) = s.db.manifest(&folder)
            && !files.is_empty()
        {
            let (mut notes, mut attachments) = (0_i64, 0_i64);
            for (path, k) in &files {
                if path.ends_with(".md") {
                    notes += k.size;
                } else {
                    attachments += k.size;
                }
            }
            kept["notes"] = json!(notes);
            kept["attachments"] = json!(attachments);
            kept["total"] = json!(notes + attachments);
            kept["files"] = json!(files.len());
        }
        kept["at"] = json!(crate::db::now());
        if let Err(e) =
            s.db.set_setting(&format!("space:{folder}"), &kept.to_string())
        {
            crate::log::error(&format!("keeping a folder's space: {e}"));
        }
        // Whole bytes: the space is counted in f64 by the contract.
        crate::quota::warn(
            &s,
            &folder,
            kept["total"].as_u64().unwrap_or(space.total as u64),
        );
    })
    .await;
}

fn capabilities(server: &Server, who: &Who, client: &str) -> Capabilities {
    let mut can = vec![Can::Account, Can::Collab];
    if let Ok((folder, role)) = role_here(server, client)
        && role.writes()
        && who.reaches(&folder).1
    {
        can.push(Can::Write);
    }
    if who.account.admin && !matches!(who.via, Via::Token { .. }) {
        can.push(Can::Admin);
    }
    Capabilities {
        host: Host::Server,
        can,
        latency_ms: None,
    }
}
