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
use verso_contract::{ContractError, ErrorKind};
use verso_service::{Access, lock, ops};

use crate::auth::{Via, Who};
use crate::db::Role;
use crate::http::{ApiError, ApiResult, Ctx};
use crate::rpc_open::{capabilities, record_space, share_counts, tabled};
use crate::state::{Client, Outbox, QUEUE, QUEUE_BYTES, Server};

pub(crate) use crate::rpc_open::{open, places};

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
pub(crate) async fn write(
    socket: &mut WebSocket,
    message: Message,
    client: &str,
    account: &str,
) -> bool {
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
    let who = ctx.who()?.clone();
    // The WebSocket of the contract checks `Origin` before it accepts the
    // cookie (ADR 0073 item 6, ADR 0074 item 7): a page of another site
    // cannot open it with the person's session.
    if matches!(who.via, Via::Browser { .. })
        && !crate::auth::origin_ok(&ctx.server, &ctx.headers, &ctx.peer)
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
    let (places, phones_full) = places(&ctx, &who)?;
    let server = Arc::clone(&ctx.server);
    Ok(ws
        .max_message_size(MAX_MESSAGE)
        // A browser sends a message as one frame, and a frame is 16 MiB by
        // default: a picture over 12 MiB (16 MiB as base64) was cut off
        // whatever the message limit said (measured 2026-10-15 with a
        // 13 MiB image, `tests_attach.rs`).
        .max_frame_size(MAX_MESSAGE)
        .on_upgrade(move |socket| async move {
            // Held as long as the connection.
            let _places = places;
            if let Some(most) = phones_full {
                // The ceiling of phones connected (ADR 0096 item 13), said
                // to the phone: a browser's WebSocket never sees the status
                // of a refused upgrade, only that it failed, so the upgrade
                // is accepted and closed at once with an application code
                // the window reads (`PHONES_FULL`).
                let mut socket = socket;
                let _ = socket
                    .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                        code: PHONES_FULL,
                        reason: format!("phones_connected:{most}").into(),
                    })))
                    .await;
                return;
            }
            run(server, who, socket, (sync_refused, binary)).await;
        }))
}

/// The close code (the 4000s are the application's) of a connection that
/// "This app is a server" refused because the most phones it allows are
/// connected already (ADR 0096 item 13); the window says so in words and
/// tries again slowly (`app/ui/src/web/bridge.ts`).
pub const PHONES_FULL: u16 = 4290;

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
    let tx = tx.counted_by(server.inflight.budget());
    let mut hello = json!({ "hello": {
        "version": env!("CARGO_PKG_VERSION"),
        "commit": server.commit,
        "contract": server.contract,
        "contractVersion": verso_contract::compat::VERSION,
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
            token_write: !matches!(who.via, Via::Token { write: false, .. })
                && who.phone.is_none_or(Role::writes),
            owner: false,
            owns: false,
            phone: who.phone.is_some(),
            tx: tx.clone(),
        },
    );
    let account = who.account.id.clone();
    let who = Arc::new(who);
    let mut log_budget = (std::time::Instant::now(), 0_u32);
    // The last room update of this connection still being taken: the next
    // waits for it (`collab_update` in order, below).
    let mut last_update: Option<tokio::sync::oneshot::Receiver<()>> = None;
    let requests = Arc::new(Semaphore::new(REQUESTS));
    let mut ping = tokio::time::interval_at(tokio::time::Instant::now() + PING_EVERY, PING_EVERY);
    ping.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut unanswered: u8 = 0;
    // A live share's frames for this connection, bounded (ADR 0116 item 28).
    let audio = server.relay.inbox(&client);
    loop {
        tokio::select! {
            () = audio.ready() => {
                if !crate::audio_relay::deliver(&mut socket, &audio, &client, &account).await {
                    break;
                }
            }
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
                // An audio frame, told by its first byte: the relay's, never a request.
                if let Message::Binary(b) = &message && verso_contract::is_audio_frame(b) {
                    crate::table_share::frame(&server, &client, b.clone());
                    continue;
                }
                // Parsed where it arrived: a piece of a file is a megabyte.
                // A binary message is a piece a device sends (sync 2): its
                // request's header, then the piece's bytes as they are.
                // A large one is judged first by its command's name and its
                // window's role, its bytes taken from the server's budget,
                // before it is made a value (`crate::inflight`).
                let admitted = match &message {
                    Message::Text(t) => crate::inflight::admit_text(&server, &client, t.as_str()),
                    Message::Binary(b) => match binary_request(b) {
                        Some((Some(r), _)) => {
                            crate::inflight::admit(&server, &client, Some(r.id), &r.cmd, b.len())
                        }
                        _ => Ok(None),
                    },
                    _ => Ok(None),
                };
                let bytes = match admitted {
                    Ok(bytes) => bytes,
                    Err(refusal) => {
                        drop(message);
                        tx.send(&match refusal.id {
                            Some(id) => json!({ "id": id, "err": refusal.error }),
                            None => json!({ "err": refusal.error }),
                        });
                        continue;
                    }
                };
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
                    server.fair.command(&who.account.id, &request.cmd)
                };
                // A window's room updates are taken in the order it sent
                // them (ADR 0083 item 14): each waits for the one before
                // to be taken, so the room never holds one aside for an
                // earlier one still on its way. The connection's other
                // commands stay side by side.
                let in_order = (request.cmd == "collab_update").then(|| {
                    let (done, taken) = tokio::sync::oneshot::channel::<()>();
                    (last_update.replace(taken), done)
                });
                tokio::spawn(async move {
                    if !turn.is_zero() {
                        tokio::time::sleep(turn).await;
                    }
                    let done = match in_order {
                        Some((before, done)) => {
                            if let Some(before) = before {
                                let _ = before.await;
                            }
                            Some(done)
                        }
                        None => None,
                    };
                    let id = request.id;
                    let answer = handle(&server, &who, &client, request, data).await;
                    // The request's bytes are given back; a large answer
                    // takes its own (`Outbox::answer`).
                    drop(bytes);
                    drop(done);
                    let signed_out = answer.as_ref().is_err_and(|e| e.message == SIGNED_OUT);
                    match answer {
                        // A piece of a file (ADR 0079 item 12): in a binary
                        // message to a device of sync 2, as base64 to one
                        // of sync 1.
                        Ok((value, Some(piece))) if binary => {
                            let header = json!({ "id": id, "ok": value }).to_string();
                            let message = verso_core::sync::frame(header.as_bytes(), &piece);
                            drop(piece);
                            tx.answer_binary(id, message, permit).await;
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
        crate::table::gone(&s, &client);
        s.service.release(&client);
    })
    .await;
}

pub(crate) fn refused(message: &str) -> ContractError {
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
    // A phone's role as it stands now: the person may have let it edit (or
    // only read) since the connection opened (ADR 0096, as built).
    let refreshed;
    let who = match (who.phone, who.session()) {
        (Some(was), Some(session)) => match server.db.phone_role(session) {
            Ok(Some(now)) if now != was => {
                refreshed = Arc::new(Who {
                    phone: Some(now),
                    ..(**who).clone()
                });
                &refreshed
            }
            _ => who,
        },
        _ => who,
    };
    // A paired phone runs the commands on the allowlist and no other (ADR
    // 0096 item 12): default deny, before anything else looks at the
    // command.
    if let Some(role) = who.phone
        && let Err(refused) = crate::local::allow::check(&r.cmd, role)
    {
        crate::local::refused_command(server, &r.cmd);
        return Err(refused);
    }
    // A window on a share: the share looked at again first (ADR 0081
    // item 8).
    crate::shares::check(server, who, client)?;
    // A closed table keeps its players out (ADR 0110 item 3).
    crate::campaign::guard(server, who, client)?;
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
pub(crate) async fn command(
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
                    tabled(server, client, scope.info(info, counts)).await?
                }
                _ => tabled(server, client, info).await?,
            })
        }
        "reindex" => {
            role_here(server, client)?;
            let service = Arc::clone(&server.service);
            let c = client.to_owned();
            let summary = blocking(move || service.reindex(&c)).await?;
            record_space(server, client).await;
            // What a run indexed would tell a reader a file changed, a
            // secret-only edit among them (ADR 0087 item 4).
            let summary = if crate::readers::reads_only(server, who, client)? {
                verso_contract::IndexSummary {
                    indexed: 0,
                    unchanged: 0,
                    removed: 0,
                    placeholders: 0,
                    problems: Vec::new(),
                    ..summary
                }
            } else {
                summary
            };
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
        // The window's own text as a reader is served it (ADR 0087 item 5):
        // a writer's "view as a reader".
        "project_secrets" => {
            let text: String = arg(&args, "text")?;
            Ok(Value::String(
                verso_core::secret::project(&text).into_owned(),
            ))
        }
        // The window's own board as a reader is served it (ADR 0090 item
        // 5): a writer's "view as a reader".
        "project_board" => {
            let text: String = arg(&args, "text")?;
            Ok(Value::String(
                verso_core::canvas_secret::project(&text).into_owned(),
            ))
        }
        "board_text" => {
            let json: String = arg(&args, "json")?;
            to_value(ops::board_text(&json)?)
        }
        "embed_frameable" => {
            let url: String = arg(&args, "url")?;
            let Ok(parsed) = reqwest::Url::parse(&url) else {
                return Ok(Value::Bool(false));
            };
            if !matches!(parsed.scheme(), "http" | "https") {
                return Ok(Value::Bool(false));
            }
            let verdict =
                crate::framing::check(&parsed, None, crate::framing::WEB_USER_AGENT).await;
            Ok(Value::Bool(verdict.frameable))
        }
        // A phone's window reports nothing into the computer's log (ADR
        // 0096 item 12: heard, dropped).
        "log_write" if who.phone.is_some() => Ok(Value::Null),
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
        // A paired phone's window asks them while it loads and changes
        // nothing here (ADR 0096 item 12).
        "set_walk_rules" | "set_folder_note_name" => {
            if who.phone.is_none()
                && let Ok((_, Role::Owner)) = role_here(server, client)
            {
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
        // A note made from its template: what joins two made apart is the
        // desktop sync's (ADR 0093 item 12); a server's folder is one copy.
        "set_embed_origins" | "set_menu_language" | "note_made_from_template" => Ok(Value::Null),
        // The computer's own history's retention (ADR 0091 item 8): a
        // server keeps its folders' by VERSO_HISTORY_DAYS and the console.
        "set_history_days" => Ok(Value::Null),
        "fetch_file" | "fetch_focuses_file" => Ok(Value::Bool(false)),
        "collab_join" | "collab_update" | "collab_awareness" | "collab_leave" | "collab_save"
        | "collab_resolve" | "collab_present" | "collab_canvas" | "collab_roll"
        | "collab_oracle" => {
            crate::rpc_collab::collab_command(server, who, client, &r.cmd, &args).await
        }
        c if crate::campaign_cmds::is_command(c) => {
            crate::campaign_cmds::command(server, who, client, c, args).await // ADR 0110
        }
        c if crate::table::is_command(c) => {
            crate::table::command(server, who, client, c, args).await // ADR 0107
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
        // A file's version history (ADR 0091): those who may write it.
        "history_list" | "history_read" | "history_restore" | "history_copy" | "history_delete" => {
            crate::history::command(server, who, client, &r.cmd, args).await
        }
        _ => Err(refused("not on a server")),
    }
}

/// A change of the folder's settings without what only its owner sets —
/// the walk's rules and the folder note's name (ADR 0070; ADR 0083,
/// decided 2026-10-14): `null` is "not changed here".
fn without_owners_settings(mut args: Value) -> Value {
    if let Some(change) = args.get_mut("change").and_then(Value::as_object_mut) {
        for rule in ["ignore_build_dirs", "respect_gitignore", "folder_note_name"] {
            change.insert(rule.to_owned(), Value::Null);
        }
    }
    args
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
    // One question, one answer (ADR 0113): the rules say whether this
    // window may run a write, by the file's level and the credential's
    // ceiling, never by a role and a flag read here.
    let door = crate::access::Door::of(server, who, client)?;
    let scope = door.scope.clone();
    if access == Access::Write {
        door.check_write(name, &args)?;
    }
    // The walk's rules and the folder note's name are the owner's, as
    // `set_walk_rules` and `set_folder_note_name` keep them (ADR 0070): an
    // editor's change of the folder's settings keeps the rest and leaves
    // them as they were.
    let args = if name == "set_folder_settings" && role != Role::Owner {
        without_owners_settings(args)
    } else {
        args
    };
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    // What a player is not told of a name (ADR 0113): a name taken by
    // something it cannot see is not answered as taken, a folder holding
    // what it cannot see is not its to rename, and what a new file is made
    // of is judged as a file sent to the chat is.
    let args = if access == Access::Write && door.veiled() {
        if name == "create_file" {
            door.check_bytes(server, &args)?;
        }
        if matches!(
            name,
            "create_note"
                | "create_file"
                | "create_folder"
                | "rename_note"
                | "rename_entry"
                | "write_note"
                | "write_text"
        ) {
            let (s, d, k, n) = (
                Arc::clone(server),
                door.clone(),
                key.clone(),
                name.to_owned(),
            );
            blocking(move || {
                let mut a = args;
                s.service
                    .with_key(&k, |ws| d.guard_names(ws, &n, &mut a).map_err(Into::into))?;
                Ok(a)
            })
            .await?
        } else {
            args
        }
    } else {
        args
    };
    // A window on a share (ADR 0081 item 2): its paths joined to the
    // shared folder's and confined there before the core acts; the answer
    // filtered to the share and re-rooted at it.
    // One who may only read is answered from the notes' projections (ADR
    // 0087): `folder_run` dispatches by the reader's list of commands.
    // A write the rules allowed is a writer's, whoever asks; the projection
    // is for what is read.
    let reads_only = door.projects() && access != Access::Write;
    let veiled = door.veiled();
    let Some(scope) = scope else {
        let mut answer = folder_run(
            server,
            who,
            client,
            (name, access, reads_only, veiled),
            (&folder, &key),
            args,
        )
        .await?;
        tell_less(server, who, &door, &key, name, &mut answer).await;
        door.inject(name, &mut answer);
        return Ok(answer);
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
                    .with(&c, |ws| ops::query_base_as(ws, query, within, reads_only))
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
        // Obsidian's settings are the whole folder's too (ADR 0093 item
        // 11): a share is offered none.
        "get_obsidian_periodic" => {
            return to_value(verso_contract::ObsidianPeriodic::default());
        }
        // The folder's layouts and bundles are the whole folder's too
        // (ADR 0099 item 2, ADR 0098 item 2), as its settings are: a share
        // lists none and finds none; a write is refused by `args_in`.
        "list_folder_data" => return to_value(verso_contract::FolderDataList::default()),
        "read_folder_data" => {
            return Err(ContractError {
                kind: verso_contract::ErrorKind::NotFound,
                message: "not in what was shared with you".to_owned(),
            });
        }
        "folder_space" => {
            let k = key.clone();
            let sc = scope.clone();
            let space = blocking(move || {
                s.service.with_key(&k, |ws| {
                    // A reader's sizes are the projections' (ADR 0087).
                    let entries = if reads_only {
                        ws.reader_entries()?
                    } else {
                        ws.entries().to_vec()
                    };
                    Ok(sc.space(&entries))
                })
            })
            .await?;
            return to_value(space);
        }
        _ => {}
    }
    let args = scope.args_in(name, args)?;
    // A board's cards name files by their paths in the owner's folder: the
    // window's, joined to the share's on the way in and re-rooted on the
    // way out (ADR 0081 item 11, as built 2026-10-27).
    let board = args["path"]
        .as_str()
        .is_some_and(crate::share_board::is_board)
        .then(|| args["path"].as_str().unwrap_or_default().to_owned());
    let args_path = board.clone();
    let args = match &board {
        Some(path) => board_in(server, &key, &scope, name, path, args).await?,
        None => args,
    };
    let asked = args["path"].as_str().map(str::to_owned);
    let mut answer = folder_run(
        server,
        who,
        client,
        (name, access, reads_only, veiled),
        (&folder, &key),
        args,
    )
    .await
    .map_err(|e| scope.error(e))?;
    tell_less(server, who, &door, &key, name, &mut answer).await;
    door.inject(name, &mut answer);
    // A link into a note from a board is a card, whose text is a path in the
    // owner's folder written however the owner wrote it (a space, another
    // normal form): the index matches it, a path cannot be taken back from
    // it. The link is the note's that was asked about, so it is told as
    // that note's path in the share, never as written.
    if name == "backlinks" {
        let here = asked
            .as_deref()
            .and_then(|p| scope.to_rel(p))
            .unwrap_or_default();
        for b in answer.as_array_mut().into_iter().flatten() {
            let from_board = b["from"].as_str().is_some_and(crate::share_board::is_board);
            if from_board {
                b["target"] = Value::String(here.clone());
            }
        }
    }
    if board.is_some() {
        let lang = crate::campaign::player(server, who, client)
            .ok()
            .flatten()
            .map_or_else(|| who.account.lang.clone(), |p| p.veil.lang.clone());
        let cards = match (name, args_path.as_deref()) {
            ("links", Some(p)) => {
                let (s, k, p) = (Arc::clone(server), key.clone(), p.to_owned());
                blocking(move || {
                    s.service.with_key(&k, |ws| {
                        Ok(ws
                            .read_text(&p)
                            .ok()
                            .map(|f| crate::share_board::card_files(&f.text)))
                    })
                })
                .await
                .ok()
                .flatten()
            }
            _ => Some(std::collections::BTreeSet::new()),
        };
        board_out(&scope, name, &mut answer, (&lang, &cards));
    }
    // A note's type through the share names the share's schemas only
    // (ADR 0081 item 11).
    if matches!(name, "read_note" | "create_note" | "write_note") && answer.is_object() {
        let (s, k, sc, cmd) = (
            Arc::clone(server),
            key.clone(),
            scope.clone(),
            name.to_owned(),
        );
        answer = blocking(move || {
            s.service
                .with_key(&k, |ws| Ok(sc.typed_within(ws, &cmd, answer)))
        })
        .await?;
    }
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

/// The text of a board a window of a share sends (`write_text`,
/// `write_board`, `board_preview`), for the owner's folder: its cards' paths
/// joined to the share's, laid over the file as it is on disk so that the
/// cards the window was shown locked stay as they are.
async fn board_in(
    server: &Arc<Server>,
    key: &str,
    scope: &crate::scope::Scope,
    name: &str,
    path: &str,
    mut args: Value,
) -> Result<Value, ContractError> {
    let field = match name {
        "write_text" => "text",
        "write_board" | "board_preview" => "json",
        _ => return Ok(args),
    };
    let Some(theirs) = args[field].as_str().map(str::to_owned) else {
        return Ok(args);
    };
    let (s, k, p) = (Arc::clone(server), key.to_owned(), path.to_owned());
    let read = blocking(move || {
        s.service.with_key(&k, |ws| {
            Ok(ws.read_text(&p).ok().map(|f| (f.text, f.revision)))
        })
    })
    .await?;
    // The cards the window was not shown are put back from the file read
    // here; the write that follows is over the revision the window read,
    // and the core refuses it at the write, under the folder's lock, unless
    // the file is still those bytes. So both must be the file's now: a
    // window whose revision is any other (one made of what it was shown, or
    // one the file has moved on from) is refused with the file untouched —
    // never a write over cards it did not see.
    if matches!(name, "write_text" | "write_board")
        && let Some((_, now)) = &read
        && args["revision"].as_str() != Some(now.as_str())
    {
        return Err(ContractError {
            kind: verso_contract::ErrorKind::Changed,
            message: "the board changed since you read it".to_owned(),
        });
    }
    let disk = read.map(|(text, _)| text);
    args[field] = Value::String(crate::share_board::text_in(
        scope,
        disk.as_deref(),
        &theirs,
    )?);
    Ok(args)
}

/// The answer of a command about a board, to a window of a share: its text
/// re-rooted at the share (`share_board::text_out`); a card of a file
/// outside the share is a locked card. The revision is the file's.
fn board_out(
    scope: &crate::scope::Scope,
    name: &str,
    answer: &mut Value,
    (lang, cards): (&str, &Option<std::collections::BTreeSet<String>>),
) {
    let words = crate::campaign_text::locked_card(lang);
    match name {
        "read_text" | "write_text" | "write_board" => {
            if let Some(text) = answer["text"].as_str() {
                answer["text"] = Value::String(crate::share_board::text_out(scope, text, &words));
            }
        }
        // A card's target is its file's path in the owner's folder: the
        // share's for a file in it, nothing for a file beside it.
        "links" => {
            for l in answer.as_array_mut().into_iter().flatten() {
                let Some(target) = l["target"].as_str() else {
                    continue;
                };
                if let Some(rel) = scope.to_rel(target) {
                    l["target"] = Value::String(rel);
                    continue;
                }
                // A card of a file beside the share, or any target when the
                // board could not be read to tell cards from texts (fails
                // closed): nothing of it crosses, not its subpath either.
                if cards.as_ref().is_none_or(|c| c.contains(target)) {
                    l["target"] = json!("");
                    l["heading"] = Value::Null;
                    l["block"] = Value::Null;
                    l["alias"] = Value::Null;
                }
            }
        }
        "board_preview" | "read_file_text" => {
            if let Some(text) = answer.as_str() {
                *answer = Value::String(crate::share_board::text_out(scope, text, &words));
            }
        }
        _ => {}
    }
}

/// A rename or a move by a player of a table answers it only what it may
/// edit or see; the links of the notes it may not are corrected by the
/// server, without telling (ADR 0113, the maintainer on 2026-10-24,
/// "Servidor corrige sem contar"), as a rename through a share corrects the
/// owner's (`share_links`).
async fn tell_less(
    server: &Arc<Server>,
    who: &Who,
    door: &crate::access::Door,
    key: &str,
    name: &str,
    answer: &mut Value,
) {
    if !matches!(name, "rename_note" | "rename_entry" | "move_entries")
        || !door.veiled()
        || door.seat() == crate::access::Seat::Master
    {
        return;
    }
    let hidden = door.take_unowned(answer);
    if hidden.is_empty() {
        return;
    }
    let (s, k, folder) = (Arc::clone(server), key.to_owned(), door.folder.clone());
    let (actor, by) = (who.account.id.clone(), who.account.email.clone());
    let _ = blocking(move || {
        crate::share_links::apply(&s, &k, (&actor, &by), &folder, hidden);
        Ok(())
    })
    .await;
}

/// A command of the folder, its paths the folder's own.
pub(crate) async fn folder_run(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    (name, access, reader, veiled): (&str, Access, bool, bool),
    (folder, key): (&str, &str),
    args: Value,
) -> Result<Value, ContractError> {
    let key = key.to_owned();
    let key_for_log = key.clone();
    let args_for_log = args.clone();
    // A player of a table is answered through its veil (ADR 0110): what it
    // reads, as the table is once the answer is made. A write the rules
    // allowed it is a writer's.
    if veiled
        && access != Access::Write
        && let Some(answer) =
            crate::campaign_serve::settled(server, who, client, folder, (name, &args)).await
    {
        return answer;
    }
    // A write that would pass the folder's quota is refused before
    // anything is written (ADR 0077 item 5).
    // Its room held until the write is in the folder's record, below.
    let _hold = match crate::quota::written(name, &args) {
        Some((path, len)) => {
            let s = Arc::clone(server);
            let k = key.clone();
            blocking(move || crate::quota::reserve(&s, &k, &path, len)).await?
        }
        None => None,
    };
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
            crate::texts::writable(&text)?;
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
    let moved_args = args.clone();
    let service = Arc::clone(&server.service);
    let s = Arc::clone(server);
    let c = client.to_owned();
    let n = name.to_owned();
    let folder_id = folder.to_owned();
    let by = crate::trash::by_name(who, None);
    // `_moving`: a window's move kept until its reconciliation, below.
    let (answer, _moving) = blocking(move || {
        // Nothing typed is left behind a rename or a bin.
        if moves {
            crate::collab::write_all(&s, &key)?;
            // The players who see what goes, remembered while it is there.
            crate::campaign_cmds::before_write(&s, &folder_id, &key, &n, &args);
        }
        // A window's move, its files kept for its own reconciliation.
        let mut kept: Option<crate::sync::Moving> = None;
        // A deletion is recorded with who made it (ADR 0080 item 2).
        let answer = if matches!(
            n.as_str(),
            "delete_note" | "delete_entry" | "remove_folder_data"
        ) {
            crate::trash::removal(&service, &c, &n, &args).and_then(|gone| {
                crate::trash::deleted(&s, &folder_id, &gone, &by);
                to_value(verso_service::convert::trashed_out(gone))
            })
        } else {
            // A text past the server's bound, read or written: refused
            // before the core reads or writes it (`crate::texts`).
            service.with(&c, |ws| {
                crate::texts::judged(ws, &n, &args).map_err(verso_service::OpError::Contract)
            })?;
            // A reader's answer from the projections; a command a
            // reader may not call, refused (ADR 0087 item 9).
            if reader {
                service
                    .dispatch_reader(&c, &n, args)
                    .unwrap_or_else(|| Err(refused("you may only read this folder")))
            } else {
                // A move carries the table's state in the same session.
                let (answer, moving) = crate::sync::moving(&s, &key, (&n, &moved_args), || {
                    crate::campaign_cmds::carrying(&s, (&service, &c), &folder_id, &n, args)
                });
                kept = moving;
                #[cfg(test)]
                crate::pause::at("window-moved", &folder_id);
                answer
            }
        };
        if moves && let Ok(notes) = service.with(&c, ops::list_notes) {
            crate::collab::close_missing(&s, &key, &notes);
        }
        if moves && answer.is_err() {
            crate::campaign_cmds::write_failed(&s, &folder_id, &n, &moved_args);
        }
        answer.map(|a| (a, kept))
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
        // A data file names its kind and its id, not a path (ADR 0099
        // item 2, ADR 0098 item 2): sync follows it like the settings.
        if matches!(name, "write_folder_data" | "remove_folder_data")
            && let (Some(kind), Some(id)) = (
                args_for_log.get("kind").and_then(Value::as_str),
                args_for_log.get("id").and_then(Value::as_str),
            )
        {
            paths.push(format!("{}/{kind}/{id}.json", verso_fs::SETTINGS_DIR));
        }
        // A window's move names each file's old path (B12).
        let moved = crate::sync::moves_of(name, &args_for_log, &answer);
        let _ = blocking(move || {
            crate::sync::reconcile_moved(&s, &key_for_log, Some(&actor), &paths, &moved);
            Ok(())
        })
        .await;
    }
    Ok(answer)
}
