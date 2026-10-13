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

use axum::body::Bytes;
use axum::extract::WebSocketUpgrade;
use axum::extract::ws::{Message, WebSocket};
use axum::response::Response;
use base64::Engine;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::Semaphore;
use verso_contract::{Can, Capabilities, ContractError, ErrorKind, Host};
use verso_service::{Access, lock, ops};

use crate::auth::{Via, Who};
use crate::db::{Folder, Role};
use crate::http::{ApiError, ApiResult, Ctx};
use crate::state::{Client, Outbox, QUEUE, QUEUE_BYTES, Server};

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
/// 256 kbit/s, under a weak mobile link's. A piece of a file — 1 MiB, 1.4
/// MB as base64 to an app of sync 1 — gets about a minute; a message at
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
    let ours = ctx.server.sync();
    let sync_refused = sync_refusal(sync, ours);
    // A device of sync 2 takes a piece of a file as a binary message; one
    // of sync 1, or one that says none, as base64 in the JSON — and so
    // does every device of a server that speaks sync 1.
    let binary =
        verso_core::sync::binary_pieces(ours) && sync.is_some_and(verso_core::sync::binary_pieces);
    let places = places(&ctx, &who)?;
    let server = Arc::clone(&ctx.server);
    Ok(ws
        .max_message_size(MAX_MESSAGE)
        .on_upgrade(move |socket| async move {
            // Held as long as the connection.
            let _places = places;
            run(server, who, socket, (sync_refused, binary)).await;
        }))
}

/// The connection's places among its account's and its address's
/// (threat-model.md, gap 4), or 429.
fn places(ctx: &Ctx, who: &Who) -> ApiResult<Vec<crate::fair::Held>> {
    let counts = &ctx.server.fair.connections;
    let too_many = |what: &str, most: u32| {
        crate::log::warn(&format!(
            "a connection refused: {what} holds {most} already"
        ));
        ApiError {
            retry: Some(30),
            ..ApiError::new(
                axum::http::StatusCode::TOO_MANY_REQUESTS,
                "too_many",
                format!("too many connections at once ({most} at most)"),
            )
        }
    };
    let account = format!("account:{}", who.account.id);
    let mut held = vec![
        counts
            .take(&account, crate::fair::PER_ACCOUNT)
            .ok_or_else(|| {
                too_many(
                    &format!("account {}", who.account.id),
                    crate::fair::PER_ACCOUNT,
                )
            })?,
    ];
    // This machine is the proxy in front, speaking for everyone.
    if !ctx.peer.addr.is_loopback() {
        let address = format!("address:{}", ctx.peer.key());
        held.push(
            counts
                .take(&address, crate::fair::PER_ADDRESS)
                .ok_or_else(|| {
                    too_many(
                        &format!("address {}", ctx.peer.key()),
                        crate::fair::PER_ADDRESS,
                    )
                })?,
        );
    }
    Ok(held)
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
pub(crate) struct Request {
    pub(crate) id: u64,
    pub(crate) cmd: String,
    #[serde(default)]
    pub(crate) args: Value,
}

/// A text message's request, as the connection's loop reads it.
pub(crate) fn text_request(text: &str) -> Option<Request> {
    serde_json::from_str(text).ok()
}

/// A binary message's request and piece (sync 2, [`verso_core::sync::frame`]):
/// the request of its header — a `sync_put`'s only, the one command that
/// carries a piece — and the piece, a slice of `message`; `None` when the
/// message is no frame.
pub(crate) fn binary_request(message: &[u8]) -> Option<(Option<Request>, &[u8])> {
    let (header, piece) = verso_core::sync::unframe(message)?;
    let request = serde_json::from_slice::<Request>(header).ok();
    Some((request.filter(|r| r.cmd == "sync_put"), piece))
}

async fn run(
    server: Arc<Server>,
    who: Who,
    mut socket: WebSocket,
    (sync_refused, binary): (Option<String>, bool),
) {
    let client = server.client_id();
    let (tx, mut rx, slow) = Outbox::new(QUEUE);
    let mut hello = json!({ "hello": {
        "version": env!("CARGO_PKG_VERSION"),
        "commit": server.commit,
        "contract": server.contract,
        "sync": server.sync(),
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
            scope: None,
            token_write: !matches!(who.via, Via::Token { write: false, .. }),
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
                let message = match out.binary {
                    Some(bytes) => Message::Binary(bytes),
                    None => Message::Text(out.text),
                };
                if !write(&mut socket, message, &client, &account).await {
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
                    "connection {client} ({}) closed: its queue filled ({QUEUE} messages or {QUEUE_BYTES} bytes at most), it reads too slowly",
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
                // Parsed where it arrived: a piece of a file is a megabyte.
                // A binary message is a piece a device sends (sync 2): its
                // request's header, then the piece's bytes as they are.
                let (parsed, data) = match message {
                    Message::Text(t) => (text_request(t.as_str()), None),
                    Message::Binary(b) => match binary_request(&b) {
                        Some((request, piece)) => (request, Some(b.slice_ref(piece))),
                        None => (None, None),
                    },
                    Message::Close(_) => break,
                    _ => continue,
                };
                let Some(request) = parsed else {
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
                // The member's pace and the server's (gap 4): past it the
                // command waits its turn here, holding its place.
                // A presence past the pace is dropped, never queued ahead
                // of an edit: the next one replaces it (Fair::droppable).
                if request.cmd == "collab_awareness" && !server.fair.droppable(&who.account.id) {
                    tx.send(&json!({ "id": request.id, "ok": null }));
                    drop(permit);
                    continue;
                }
                let turn = if request.cmd == "collab_awareness" {
                    Duration::ZERO
                } else {
                    server.fair.command(&who.account.id)
                };
                tokio::spawn(async move {
                    if !turn.is_zero() {
                        tokio::time::sleep(turn).await;
                    }
                    let id = request.id;
                    let answer = handle(&server, &who, &client, request, data).await;
                    let signed_out = answer.as_ref().is_err_and(|e| e.message == SIGNED_OUT);
                    match answer {
                        // A piece of a file (ADR 0079 item 12): in a binary
                        // message to a device of sync 2, as base64 to one
                        // of sync 1.
                        Ok((value, Some(piece))) if binary => {
                            let header = json!({ "id": id, "ok": value }).to_string();
                            let message = verso_core::sync::frame(header.as_bytes(), &piece);
                            drop(piece);
                            tx.answer_binary(message, permit).await;
                        }
                        Ok((mut value, Some(piece))) => {
                            value["data"] = json!(base64::engine::general_purpose::STANDARD.encode(&piece));
                            drop(piece);
                            tx.answer(json!({ "id": id, "ok": value }), permit).await;
                        }
                        Ok((value, None)) => tx.answer(json!({ "id": id, "ok": value }), permit).await,
                        Err(e) => tx.answer(json!({ "id": id, "err": e }), permit).await,
                    }
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
    data: Option<Bytes>,
) -> Result<crate::sync::Reply, ContractError> {
    if !still_signed_in(server, who).map_err(verso_service::failed)? {
        return Err(ContractError {
            kind: ErrorKind::Refused,
            message: SIGNED_OUT.to_owned(),
        });
    }
    // A window on a share: the share looked at again first (ADR 0081
    // item 8).
    crate::shares::check(server, who, client)?;
    match r.cmd.as_str() {
        "sync_state" | "sync_changes" | "sync_read" => {
            return crate::sync::command(server, who, client, &r.cmd, r.args, None).await;
        }
        // A device's change: the folder's space follows it (ADR 0077).
        "sync_put" | "sync_delete" | "sync_rename" => {
            let (done, _) = crate::sync::command(server, who, client, &r.cmd, r.args, data).await?;
            if r.cmd != "sync_put" || done["done"] == true {
                record_space(server, client).await;
            }
            return Ok((done, None));
        }
        _ => {}
    }
    command(server, who, client, r)
        .await
        .map(|value| (value, None))
}

/// A command that carries no piece of a file.
async fn command(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    r: Request,
) -> Result<Value, ContractError> {
    let args = r.args;
    if let Some(access) = ops::access(&r.cmd) {
        return folder_command(server, who, client, &r.cmd, access, args).await;
    }
    match r.cmd.as_str() {
        "open_server_folder" => {
            let id: String = arg(&args, "id")?;
            match crate::shares::opening(server, who, &id).map_err(|e| contract(&e))? {
                crate::shares::Opening::Folder(folder, role) => {
                    open(server, client, folder, role, None).await
                }
                crate::shares::Opening::Share(folder, scope, role) => {
                    open(server, client, folder, role, Some(scope)).await
                }
            }
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
            // A share's key names it (ADR 0081 item 2).
            for (share, _, _) in server
                .db
                .shares_with(&who.account.id)
                .map_err(verso_service::failed)?
            {
                if crate::scope::share_key(&share.id) == key {
                    found = Some(share.id);
                }
            }
            let id = found.ok_or_else(|| ContractError {
                kind: ErrorKind::NotFound,
                message: "no folder of yours has that key".to_owned(),
            })?;
            match crate::shares::opening(server, who, &id).map_err(|e| contract(&e))? {
                crate::shares::Opening::Folder(folder, role) => {
                    open(server, client, folder, role, None).await
                }
                crate::shares::Opening::Share(folder, scope, role) => {
                    open(server, client, folder, role, Some(scope)).await
                }
            }
        }
        // The window's own: the browser's shim chooses among the
        // account's folders, and a URL names the folder to open.
        "pick_folder" | "open_initial" => Ok(Value::Null),
        "current_folder" => {
            let info = to_value(server.service.current_folder(client))?;
            Ok(match crate::shares::scope_here(server, client) {
                Some(scope) if !info.is_null() => {
                    let counts = share_counts(server, client, &scope).await;
                    scope.info(info, counts)
                }
                _ => info,
            })
        }
        "reindex" => {
            role_here(server, client)?;
            let service = Arc::clone(&server.service);
            let c = client.to_owned();
            let summary = blocking(move || service.reindex(&c)).await?;
            record_space(server, client).await;
            let mut summary = to_value(summary)?;
            if let Some(scope) = crate::shares::scope_here(server, client) {
                let counts = share_counts(server, client, &scope).await;
                scope.summary(&mut summary, counts);
            }
            Ok(summary)
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
        | "collab_resolve" | "collab_present" | "collab_canvas" => {
            collab_command(server, who, client, &r.cmd, &args).await
        }
        "trash_list" | "trash_restore" | "trash_delete" | "trash_empty" | "trash_set_days" => {
            // Through a share, its part of the bin only (ADR 0081 item 16).
            match crate::shares::scope_here(server, client) {
                Some(scope) => {
                    crate::share_sync::trash(server, who, client, &r.cmd, args, &scope).await
                }
                None => crate::trash::command(server, who, client, &r.cmd, args).await,
            }
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
    let scope = crate::shares::scope_here(server, client);
    let visible = scope.as_ref().map_or(folder, |s| s.share.clone());
    let writes = role.writes() && who.reaches(&visible).1;
    let typing = matches!(
        cmd,
        "collab_update" | "collab_save" | "collab_resolve" | "collab_canvas"
    );
    if typing && !writes {
        return Err(refused("you may only read this folder"));
    }
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    let path: String = arg(args, "path")?;
    // A share's path joined to the shared folder's (ADR 0081 item 12): one
    // room for the note, whoever opens it through what.
    let path = match &scope {
        Some(s) if typing => s.to_full_write(&path)?,
        Some(s) => s.to_full(&path)?,
        None => path,
    };
    let s = Arc::clone(server);
    let c = client.to_owned();
    let cmd = cmd.to_owned();
    let args = args.clone();
    let user = who.account.name.clone();
    let account = who.account.id.clone();
    let answer = blocking(move || match cmd.as_str() {
        // Whether someone is in the note: a write that is not a keystroke
        // joins the room to be made there (ADR 0082).
        "collab_present" => Ok(Value::Bool(s.rooms.occupied(&key, &path))),
        "collab_join" => to_value(crate::collab::join(&s, &c, &key, &path, &user)?),
        "collab_update" => {
            let update: String = arg(&args, "update")?;
            crate::collab::update(&s, &c, &key, &path, &update)?;
            Ok(Value::Null)
        }
        "collab_awareness" => {
            let update: String = arg(&args, "update")?;
            let sender = crate::presence::Sender {
                client: &c,
                account: &account,
                name: &user,
            };
            crate::collab::awareness(&s, &sender, &key, &path, &update)?;
            Ok(Value::Null)
        }
        "collab_leave" => {
            crate::collab::leave(&s, &c, &key, &path);
            Ok(Value::Null)
        }
        "collab_save" => to_value(crate::collab::save(&s, &key, &path)?),
        "collab_canvas" => {
            let at: String = arg(&args, "at")?;
            let json: String = arg(&args, "json")?;
            crate::collab::canvas(&s, &c, &key, &path, &at, json)?;
            Ok(Value::Null)
        }
        _ => {
            let keep: String = arg(&args, "keep")?;
            to_value(crate::collab::resolve(&s, &key, &path, &keep)?)
        }
    })
    .await;
    // A share's error in the share's paths.
    match &scope {
        Some(s) => answer.map_err(|e| s.error(e)),
        None => answer,
    }
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
    let scope = crate::shares::scope_here(server, client);
    let visible = scope
        .as_ref()
        .map_or_else(|| folder.clone(), |s| s.share.clone());
    let (_, token_writes) = who.reaches(&visible);
    if access == Access::Write && !(role.writes() && token_writes) {
        return Err(refused("you may only read this folder"));
    }
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    // A window on a share (ADR 0081 item 2): its paths joined to the
    // shared folder's and confined there before the core acts; the answer
    // filtered to the share and re-rooted at it.
    let Some(scope) = scope else {
        return folder_run(server, who, client, (name, access), (&folder, &key), args).await;
    };
    let limit = args["limit"]
        .as_u64()
        .and_then(|l| usize::try_from(l.clamp(1, 200)).ok())
        .unwrap_or(20);
    let s = Arc::clone(server);
    match name {
        "get_focuses" => {
            return to_value(verso_contract::FocusesSummary {
                focuses: Vec::new(),
                has_file: false,
                format_known: true,
                read_only_reason: None,
                read_only_code: None,
                stamp: None,
            });
        }
        "can_sync_focuses" => return Ok(Value::Bool(false)),
        // A base through the share is evaluated over the shared folder
        // only: its rows, its properties, its formulas and its summaries
        // count nothing outside (ADR 0081 item 11, decided 2026-10-12).
        "query_base" => {
            let args = scope.args_in(name, args)?;
            let query: verso_contract::BaseQuery = arg(&args, "query")?;
            let c = client.to_owned();
            let within = scope.roots();
            let answer = blocking(move || {
                s.service
                    .with(&c, |ws| ops::query_base_within(ws, query, within))
                    .and_then(to_value)
            })
            .await
            .map_err(|e| scope.error(e))?;
            return Ok(scope.answer_out(name, answer, limit));
        }
        // The owner's folder settings are the whole folder's, never a
        // share's (ADR 0070, ADR 0081): the window keeps its own, and a
        // change is refused (`args_in`).
        "get_folder_settings" => {
            return to_value(verso_contract::FolderLayer {
                problem: Some("share".to_owned()),
                ..verso_contract::FolderLayer::default()
            });
        }
        "folder_space" => {
            let k = key.clone();
            let sc = scope.clone();
            let space = blocking(move || s.service.with_key(&k, |ws| Ok(sc.space(ws)))).await?;
            return to_value(space);
        }
        _ => {}
    }
    let args = scope.args_in(name, args)?;
    let mut answer = folder_run(server, who, client, (name, access), (&folder, &key), args)
        .await
        .map_err(|e| scope.error(e))?;
    // A rename through the share keeps the owner's links outside it: the
    // server writes those rewrites itself, and the window hears only of
    // the ones inside (ADR 0081 item 11, decided 2026-10-12).
    if matches!(name, "rename_note" | "rename_entry" | "move_entries") {
        let outside = crate::share_links::take_outside(&scope, &mut answer);
        if !outside.is_empty() {
            let s = Arc::clone(server);
            let k = key.clone();
            let (actor, by, share) = (
                who.account.id.clone(),
                who.account.email.clone(),
                scope.share.clone(),
            );
            let _ = blocking(move || {
                crate::share_links::apply(&s, &k, (&actor, &by), &share, outside);
                Ok(())
            })
            .await;
        }
    }
    Ok(scope.answer_out(name, answer, limit))
}

/// A command of the folder, its paths the folder's own.
async fn folder_run(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    (name, access): (&str, Access),
    (folder, key): (&str, &str),
    args: Value,
) -> Result<Value, ContractError> {
    let key = key.to_owned();
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
    // (ADR 0073 item 7); so does a write to any text file in a room (ADR
    // 0082 item 12). A board's room takes its changes as elements only:
    // a write of its file from outside the room is a change from outside.
    if matches!(name, "write_note" | "write_text") {
        let path: String = arg(&args, "path")?;
        if server.rooms.has(&key, &path)
            && crate::collab::kind_of(&path) != crate::collab::Kind::Board
        {
            let text: String = arg(&args, "text")?;
            let revision: String = arg(&args, "revision")?;
            let s = Arc::clone(server);
            let c = client.to_owned();
            let note = name == "write_note";
            return blocking(move || {
                crate::collab::write_through(&s, &key, &path, &text, &revision)?;
                if note {
                    let note = s.service.with(&c, move |ws| ops::read_note(ws, path))?;
                    return to_value(verso_contract::Written {
                        note,
                        warnings: Vec::new(),
                    });
                }
                to_value(s.service.with(&c, move |ws| ops::read_text(ws, path))?)
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
    let folder_id = folder.to_owned();
    let by = crate::trash::by_name(who, None);
    let answer = blocking(move || {
        // Nothing typed is left behind a rename or a bin.
        if moves {
            crate::collab::write_all(&s, &key)?;
        }
        // A deletion is recorded with who made it (ADR 0080 item 2).
        let answer = if matches!(n.as_str(), "delete_note" | "delete_entry") {
            let path: String = arg(&args, "path")?;
            service
                .with(&c, |ws| {
                    Ok(if n == "delete_note" {
                        ws.delete_note(&path)?
                    } else {
                        ws.delete_entry(&path)?
                    })
                })
                .and_then(|gone| {
                    crate::trash::deleted(&s, &folder_id, &gone, &by);
                    to_value(verso_service::convert::trashed_out(gone))
                })
        } else {
            service
                .dispatch(&c, &n, args)
                .unwrap_or_else(|| Err(refused("no such command")))
        };
        if moves && let Ok(notes) = service.with(&c, ops::list_notes) {
            crate::collab::close_missing(&s, &key, &notes);
        }
        answer
    })
    .await?;
    // A board's file written from outside its room — a window not in it, a
    // rename's rewrite: a change from outside, which the room takes as one
    // (ADR 0082 item 12) — the windows draw it again, or choose.
    if matches!(name, "write_text" | "write_board")
        && let Ok(path) = arg::<String>(&args_for_log, "path")
        && crate::collab::kind_of(&path) == crate::collab::Kind::Board
        && server.rooms.has(&key_for_log, &path)
    {
        let s = Arc::clone(server);
        let k = key_for_log.clone();
        let _ = blocking(move || {
            crate::collab::changed_outside(&s, &k, &[path], &[]);
            Ok(())
        })
        .await;
    }
    if access == Access::Write {
        // A share follows its folder's rename and goes with its deletion
        // (ADR 0081 item 13).
        {
            let s = Arc::clone(server);
            let (f, n, a, ans) = (
                folder.to_owned(),
                name.to_owned(),
                args_for_log.clone(),
                answer.clone(),
            );
            let _ = blocking(move || {
                crate::shares::after_write(&s, &f, &n, &a, &ans);
                Ok(())
            })
            .await;
        }
        record_space(server, client).await;
        // The folder's log for sync follows every write before the answer
        // (ADR 0079 item 4): a device asking next sees it.
        let s = Arc::clone(server);
        let actor = who.account.id.clone();
        let mut paths = crate::sync::paths_of(&args_for_log);
        // The folder's settings name no path in their arguments (ADR 0070).
        if name == "set_folder_settings" {
            paths.push(verso_fs::SETTINGS_FILE.to_owned());
        }
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
    scope: Option<crate::scope::Scope>,
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
    let said = match &scope {
        Some(s) => {
            json!({ "folder": { "id": s.share, "name": s.name, "role": role, "share": true } })
        }
        None => json!({ "folder": { "id": folder.id, "name": folder.dir, "role": role } }),
    };
    if let Some(c) = lock(&server.clients).get_mut(client) {
        c.folder = Some((folder.id.clone(), role));
        c.scope.clone_from(&scope);
        let _ = c.tx.send(&said);
    }
    record_space(server, client).await;
    let info = to_value(info)?;
    Ok(match &scope {
        Some(s) => {
            let counts = share_counts(server, client, s).await;
            s.info(info, counts)
        }
        None => info,
    })
}

/// The share's own counts for the index's summary the window shows (ADR
/// 0081 item 11); none when the folder cannot be read now, and then the
/// summary says zero.
async fn share_counts(
    server: &Arc<Server>,
    client: &str,
    scope: &crate::scope::Scope,
) -> Option<crate::scope::Counts> {
    let s = Arc::clone(server);
    let c = client.to_owned();
    let sc = scope.clone();
    blocking(move || s.service.with(&c, |ws| Ok(sc.counts(ws)?)))
        .await
        .ok()
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
    let visible = crate::shares::scope_here(server, client).map(|s| s.share);
    if let Ok((folder, role)) = role_here(server, client)
        && role.writes()
        && who.reaches(visible.as_deref().unwrap_or(&folder)).1
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
