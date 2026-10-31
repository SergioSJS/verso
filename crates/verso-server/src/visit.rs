// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What whoever holds a read link may do (ADR 0105): open the page at
//! `/r/<token>`, prove the passphrase when the link has one, and read —
//! over a WebSocket of its own that speaks the contract's read commands,
//! and the files under `/r/<token>/f/`. Nothing else of the server
//! answers a visitor, and nothing here writes: a command is on the list
//! below or it is refused before the core acts, whatever it asks.
//!
//! The visitor is a reader without an account (ADR 0087): the same
//! [`Scope`] that confines a share confines the link, and the reader's
//! projection serves it, so no secret block crosses — not in a note, a
//! search, the backlinks, the graph or the counts. Every request is judged
//! against the link again (switch on, not revoked, not expired), so that
//! revoking ends an open page at once (item 5), and is paced per link and
//! per address (item 6). Every refusal of a link that does not open is the
//! same 404: it says nothing of why.

use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::Path;
use axum::extract::WebSocketUpgrade;
use axum::extract::ws::{Message, WebSocket};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::Response;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::Semaphore;
use verso_contract::{ContractError, ErrorKind};
use verso_service::{Access, lock, ops};

use crate::auth::{Via, Who};
use crate::db::{Account, ReadLink, Role};
use crate::http::{ApiError, ApiResult, Ctx, ok};
use crate::readlinks::{self, Live};
use crate::rpc::{Request, blocking, to_value};
use crate::scope::Scope;
use crate::state::{Client, Outbox, QUEUE, Server};

/// The cookie a browser that proved a link's passphrase keeps, for that
/// link's path alone.
const COOKIE: &str = "verso-link";

/// Requests a visitor's connection may have under way at once.
const REQUESTS: usize = 8;

/// How often the connection is pinged, and judged against the link again.
const PING_EVERY: Duration = Duration::from_secs(30);
const MISSED: u8 = 2;

/// Commands of the contract that answer a visitor, besides the folder's
/// read commands that a reader may call (`verso_service::reader`): the
/// window's own, which say nothing of any note.
const OWN: &[&str] = &[
    "current_folder",
    "reindex",
    "render_markdown",
    "app_info",
    "project_secrets",
    "project_board",
    "board_text",
    "pick_folder",
    "open_initial",
];

/// Commands the window sends that mean nothing to a visitor: heard, and
/// answered with nothing. A visitor writes nothing, not even a line of
/// the server's log, and the server fetches nothing in its name.
const QUIET: &[&str] = &[
    "log_write",
    "set_embed_origins",
    "set_menu_language",
    "set_history_days",
    "note_made_from_template",
    "set_walk_rules",
    "set_folder_note_name",
];

fn refused(message: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message: message.to_owned(),
    }
}

/// Whether a command is one a visitor may call at all.
#[must_use]
pub fn allowed(cmd: &str) -> bool {
    matches!(
        cmd,
        "open_server_folder"
            | "reopen_folder"
            | "capabilities"
            | "fetch_file"
            | "fetch_focuses_file"
            | "embed_frameable"
    ) || OWN.contains(&cmd)
        || QUIET.contains(&cmd)
        || (ops::access(cmd) == Some(Access::Read)
            && verso_service::reader::for_reader(cmd).is_some())
}

/// The link of the request, or the one 404 every link that does not open
/// answers; paced per link.
fn link_of(ctx: &Ctx, token: &str) -> ApiResult<Live> {
    let Some(live) = readlinks::live(&ctx.server, token)? else {
        return Err(ApiError::not_found());
    };
    if let Some(wait) = ctx.server.link_pace.take(&format!("link:{}", live.link.id)) {
        return Err(ApiError::wait(wait));
    }
    Ok(live)
}

/// Whether the browser may read: the link has no passphrase, or it proved
/// it.
fn unlocked(ctx: &Ctx, live: &Live) -> bool {
    live.link.password.is_none()
        || crate::auth::cookie(&ctx.headers, COOKIE)
            .is_some_and(|secret| ctx.server.links.unlocked(&live.link.id, &secret))
}

fn locked() -> ApiError {
    ApiError::new(
        StatusCode::UNAUTHORIZED,
        "locked",
        "this link wants its passphrase",
    )
}

/// What a page learns of a link before it opens a socket: what it is, and
/// whether it wants a passphrase. Its name only once it is unlocked.
pub async fn state(ctx: Ctx, Path(token): Path<String>) -> ApiResult<Response> {
    let live = link_of(&ctx, &token)?;
    let open = unlocked(&ctx, &live);
    let scope = readlinks::scope_of(&ctx.server, &live)?;
    // A link to one note opens that note, since there is nothing else to
    // choose: its path is told once the page may read.
    let note = (open && live.link.kind == "note").then(|| live.link.path.clone());
    Ok(ok(json!({
        "kind": live.link.kind,
        "password": live.link.password.is_some(),
        "locked": !open,
        "name": open.then_some(scope.name),
        "open": note,
    })))
}

#[derive(Deserialize)]
pub struct Unlock {
    password: String,
}

/// A passphrase tried. A wrong one is a refused sign-in: the line the
/// host's tools read, the pace of refusals, and the owner told by mail
/// past twenty an hour (ADR 0083 items 1 and 2); the delays of a sign-in
/// apply, by address and by link.
pub async fn unlock(
    ctx: Ctx,
    Path(token): Path<String>,
    Json(body): Json<Unlock>,
) -> ApiResult<Response> {
    if !crate::auth::origin_ok(&ctx.server, &ctx.headers, &ctx.peer) {
        return Err(ApiError::forbidden("not from a page of this server"));
    }
    let live = link_of(&ctx, &token)?;
    let Some(hash) = live.link.password.clone() else {
        return Err(ApiError::bad(
            "no_passphrase",
            "this link has no passphrase",
        ));
    };
    let by_address = format!("link-in:{}", ctx.peer.key());
    let by_link = format!("link-in:{}", live.link.id);
    crate::api::limited(&ctx, &[&by_address, &by_link])?;
    let turn = ctx.server.signins.turn();
    if !turn.is_zero() {
        tokio::time::sleep(turn).await;
    }
    let _turn = ctx.server.hashes.turn(&[&by_address, &by_link]).await?;
    crate::api::limited(&ctx, &[&by_address, &by_link])?;
    let typed = body.password;
    let right = ctx
        .server
        .hashes
        .run(move || crate::crypto::verify_password(&typed, &hash))
        .await?;
    let owner = ctx.server.db.account(&live.link.made_by)?;
    if !right {
        ctx.server.limiter.failed(&by_address);
        ctx.server.limiter.failed(&by_link);
        // The owner's account is what a wrong passphrase is counted
        // against, by its address.
        crate::signin::refused(
            &ctx.server,
            &ctx.peer.key(),
            owner.as_ref().map(|a| a.email.as_str()),
            owner.as_ref(),
        );
        ctx.audit_as(
            None,
            "read_link_passphrase",
            Some(&live.link.id),
            Some(&live.link.folder),
            false,
        );
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "wrong_passphrase",
            "wrong passphrase",
        ));
    }
    ctx.server.limiter.succeeded(&by_address);
    ctx.server.limiter.succeeded(&by_link);
    if let Some(a) = &owner {
        ctx.server
            .signins
            .succeeded(&ctx.peer.key(), Some(&a.email));
    }
    let secret = ctx.server.links.unlock(&live.link.id)?;
    let secure = if ctx.peer.https { "; Secure" } else { "" };
    let mut response = ok(json!({ "unlocked": true }));
    if let Ok(v) = HeaderValue::from_str(&format!(
        "{COOKIE}={secret}; Path=/r/{token}; HttpOnly; SameSite=Strict; Max-Age={}{secure}",
        readlinks::UNLOCK_LIFE.as_secs()
    )) {
        response.headers_mut().append(header::SET_COOKIE, v);
    }
    Ok(response)
}

/// A file under the link, as a reader is sent it (item 4): the path is the
/// link's own, confined to what it reaches before the file is opened.
pub async fn file(ctx: Ctx, Path((token, path)): Path<(String, String)>) -> ApiResult<Response> {
    let live = link_of(&ctx, &token)?;
    if !unlocked(&ctx, &live) {
        return Err(locked());
    }
    let scope = readlinks::scope_of(&ctx.server, &live)?;
    let server = Arc::clone(&ctx.server);
    let (l, s) = (live.link.clone(), scope.clone());
    let folder = live.folder.clone();
    // A link to one note reaches what the note embeds now.
    let sv = Arc::clone(&server);
    let refreshed = tokio::task::spawn_blocking(move || {
        readlinks::refresh(&sv, &Live { link: l, folder }, &s);
    })
    .await;
    refreshed.map_err(|e| e.to_string())?;
    let full = scope.to_full(&path).map_err(|_| ApiError::not_found())?;
    crate::files::send(&server, &ctx.headers, live.folder, full, true).await
}

/// The WebSocket a visitor's window speaks the contract's read commands
/// over.
pub async fn ws(
    ctx: Ctx,
    Path(token): Path<String>,
    upgrade: WebSocketUpgrade,
) -> ApiResult<Response> {
    // A page of another site cannot open it with the passphrase's cookie.
    if !crate::auth::origin_ok(&ctx.server, &ctx.headers, &ctx.peer) {
        return Err(ApiError::forbidden("not from a page of this server"));
    }
    if !ctx.server.config.web {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "no_web",
            "this server serves no window in a browser (verso serve --web)",
        ));
    }
    let live = link_of(&ctx, &token)?;
    if !unlocked(&ctx, &live) {
        return Err(locked());
    }
    let counts = &ctx.server.fair.connections;
    let too_many = || ApiError {
        retry: Some(30),
        ..ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "too_many",
            "too many connections at once",
        )
    };
    let mut held = vec![
        counts
            .take(&format!("link:{}", live.link.id), crate::fair::PER_ACCOUNT)
            .ok_or_else(too_many)?,
    ];
    if !ctx.peer.local {
        held.push(
            counts
                .take(
                    &format!("address:{}", ctx.peer.key()),
                    crate::fair::PER_ADDRESS,
                )
                .ok_or_else(too_many)?,
        );
    }
    let scope = readlinks::scope_of(&ctx.server, &live)?;
    if let Err(e) = ctx.server.db.touch_read_link(&live.link.id) {
        crate::log::warn(&format!("a read link's last opening: {e}"));
    }
    let server = Arc::clone(&ctx.server);
    Ok(upgrade
        .max_message_size(crate::inflight::TEXT)
        .max_frame_size(crate::inflight::TEXT)
        .on_upgrade(move |socket| async move {
            let _held = held;
            run(server, token, live, scope, socket).await;
        }))
}

/// A visitor as the commands of the folder see it: no account, a
/// credential that only reads and reaches the link's scope alone.
fn visitor(link: &ReadLink, scope: &Scope) -> Who {
    Who {
        account: Account {
            id: format!("link:{}", link.id),
            email: String::new(),
            name: String::new(),
            lang: "pt".to_owned(),
            admin: false,
            may_create: false,
            created: link.made_at,
            password: None,
        },
        via: Via::Token {
            id: link.id.clone(),
            write: false,
            folders: vec![scope.share.clone()],
        },
        phone: None,
    }
}

async fn run(server: Arc<Server>, token: String, live: Live, scope: Scope, mut socket: WebSocket) {
    let client = server.client_id();
    let link = live.link.clone();
    let pace = format!("link:{}", link.id);
    let (tx, mut rx, slow) = Outbox::new(QUEUE);
    let tx = tx.counted_by(server.inflight.budget());
    tx.send(&json!({ "hello": {
        "version": env!("CARGO_PKG_VERSION"),
        "commit": server.commit,
        "contract": server.contract,
        "sync": server.sync(),
        "account": Value::Null,
        "link": true,
    }}));
    lock(&server.clients).insert(
        client.clone(),
        Client {
            account: format!("link:{}", link.id),
            session: None,
            folder: None,
            scope: None,
            token_write: false,
            owner: false,
            phone: false,
            tx: tx.clone(),
        },
    );
    server.links.add(&link.id, &client, &tx);
    let who = Arc::new(visitor(&link, &scope));
    let live = Arc::new(live);
    let requests = Arc::new(Semaphore::new(REQUESTS));
    let mut ping = tokio::time::interval_at(tokio::time::Instant::now() + PING_EVERY, PING_EVERY);
    ping.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut unanswered: u8 = 0;
    // The expiry ends an open page when it comes, not at the next ping.
    let until = link
        .expires
        .map(|x| Duration::from_secs(u64::try_from(x - crate::db::now()).unwrap_or(0)));
    let expiry = async {
        match until {
            Some(d) => tokio::time::sleep(d).await,
            None => std::future::pending::<()>().await,
        }
    };
    tokio::pin!(expiry);
    let mut expired = false;
    let write = |bytes: usize| crate::rpc::send_within(bytes);
    loop {
        tokio::select! {
            pushed = rx.recv() => {
                let Some(out) = pushed else { break };
                let message = match out.binary {
                    Some(bytes) => Message::Binary(bytes),
                    None => Message::Text(out.text),
                };
                let bytes = match &message {
                    Message::Text(t) => t.len(),
                    Message::Binary(b) => b.len(),
                    _ => 0,
                };
                if !matches!(tokio::time::timeout(write(bytes), socket.send(message)).await, Ok(Ok(()))) {
                    break;
                }
                drop(out.permit);
                if out.close {
                    let _ = socket.send(Message::Close(None)).await;
                    break;
                }
            }
            () = slow.notified() => break,
            () = &mut expiry, if !expired => {
                expired = true;
                tx.send(&json!({ "gone": "link" }));
            }
            _ = ping.tick() => {
                if requests.available_permits() == 0 {
                    unanswered = 0;
                    continue;
                }
                if unanswered >= MISSED {
                    break;
                }
                // The link judged again: turned off or expired while the
                // page was idle.
                if !matches!(readlinks::live(&server, &token), Ok(Some(l)) if l.link.id == link.id) {
                    tx.send(&json!({ "gone": "link" }));
                    continue;
                }
                if !matches!(tokio::time::timeout(write(0), socket.send(Message::Ping(Default::default()))).await, Ok(Ok(()))) {
                    break;
                }
                unanswered += 1;
            }
            incoming = socket.recv(), if requests.available_permits() > 0 => {
                let Some(Ok(message)) = incoming else { break };
                unanswered = 0;
                let Message::Text(text) = message else {
                    if matches!(message, Message::Close(_)) { break }
                    continue;
                };
                let bytes = match crate::inflight::admit_text(&server, &client, text.as_str()) {
                    Ok(bytes) => bytes,
                    Err(refusal) => {
                        tx.send(&match refusal.id {
                            Some(id) => json!({ "id": id, "err": refusal.error }),
                            None => json!({ "err": refusal.error }),
                        });
                        continue;
                    }
                };
                let Some(request) = crate::rpc::text_request(text.as_str()) else {
                    tx.send(&json!({ "err": refused("not a request") }));
                    continue;
                };
                drop(text);
                let Ok(permit) = Arc::clone(&requests).try_acquire_owned() else {
                    tx.send(&json!({ "id": request.id, "err": refused("too many requests at once") }));
                    continue;
                };
                let turn = server.fair.command(&pace, &request.cmd);
                let (server, who, live, scope, client, tx, token) = (
                    Arc::clone(&server),
                    Arc::clone(&who),
                    Arc::clone(&live),
                    scope.clone(),
                    client.clone(),
                    tx.clone(),
                    token.clone(),
                );
                tokio::spawn(async move {
                    if !turn.is_zero() {
                        tokio::time::sleep(turn).await;
                    }
                    let id = request.id;
                    let answer = handle(&server, &who, (&token, &live, &scope), &client, request).await;
                    drop(bytes);
                    match answer {
                        Ok(value) => tx.answer(json!({ "id": id, "ok": value }), permit).await,
                        Err(e) => {
                            let gone = e.message == ENDED;
                            tx.answer(json!({ "id": id, "err": e }), permit).await;
                            if gone {
                                tx.send(&json!({ "gone": "link" }));
                            }
                        }
                    }
                });
            }
        }
    }
    lock(&server.clients).remove(&client);
    server.links.remove(&link.id, &client);
    server.transfers.forget(&client);
    let s = Arc::clone(&server);
    let _ = tokio::task::spawn_blocking(move || s.service.release(&client)).await;
}

/// What a command is answered when the link no longer opens.
const ENDED: &str = "this link no longer opens";

async fn handle(
    server: &Arc<Server>,
    who: &Arc<Who>,
    (token, live, scope): (&str, &Arc<Live>, &Scope),
    client: &str,
    r: Request,
) -> Result<Value, ContractError> {
    // The link, judged for this command: revoked, expired, or turned off
    // since the last one, and nothing is answered (item 5).
    let now = blocking({
        let (s, t) = (Arc::clone(server), token.to_owned());
        move || readlinks::live(&s, &t).map_err(verso_service::failed)
    })
    .await?;
    if !now.is_some_and(|l| l.link.id == live.link.id) {
        return Err(refused(ENDED));
    }
    if !allowed(&r.cmd) {
        return Err(refused("not through a read link"));
    }
    match r.cmd.as_str() {
        "open_server_folder" | "reopen_folder" => {
            // A link opens its own folder, whatever id the window names.
            let (s, l, sc) = (Arc::clone(server), Arc::clone(live), scope.clone());
            blocking(move || {
                readlinks::refresh(&s, &l, &sc);
                Ok(())
            })
            .await?;
            crate::rpc::open(
                server,
                client,
                live.folder.clone(),
                Role::Reader,
                Some(scope.clone()),
            )
            .await
        }
        // A reader on a server that only reads: no account, no room, no
        // writing, no sync (item 4).
        "capabilities" => to_value(verso_contract::Capabilities {
            host: verso_contract::Host::Server,
            can: Vec::new(),
            latency_ms: None,
            access: Some(verso_contract::FolderAccess {
                seat: verso_contract::AccessSeat::Visitor,
                role: String::new(),
                cap: verso_contract::AccessCap::Read,
                table: false,
            }),
        }),
        // A visitor walks nothing: a run takes the session's lock and
        // tells every window on the folder, the owner's too. It is
        // answered with the summary the folder has (review I1).
        "reindex" => {
            let ask = Request {
                id: r.id,
                cmd: "current_folder".to_owned(),
                args: Value::Null,
            };
            let info = crate::rpc::command(server, who, client, ask).await?;
            Ok(info.get("index").cloned().unwrap_or(Value::Null))
        }
        c if QUIET.contains(&c) => Ok(Value::Null),
        "fetch_file" | "fetch_focuses_file" | "embed_frameable" => Ok(Value::Bool(false)),
        _ => {
            // A link to one note follows the note as it is now.
            if scope.guard.as_ref().is_some_and(|g| g.only.is_some()) {
                let (s, l, sc) = (Arc::clone(server), Arc::clone(live), scope.clone());
                blocking(move || {
                    readlinks::refresh(&s, &l, &sc);
                    Ok(())
                })
                .await?;
            }
            crate::rpc::command(server, who, client, r).await
        }
    }
}
