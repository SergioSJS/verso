// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The routes of "this app is a server" (ADR 0096): a smaller table than
//! `verso serve`'s, in the same layers (`Host` check, head and body bounds,
//! pace, headers). A phone gets in by pairing: the window's files, the
//! contract's WebSocket, its folders' files, its own state and sign-out,
//! and the two routes of pairing. A person invited gets in by an account
//! (ADR 0117 D3 item 2, on the network and through the link, D4 Q8): the
//! sign-in, an invitation's offer, accepting it, joining it signed in, the
//! password, the proof and the sessions — the routes of an account, which
//! a phone is answered as unknown ones — and the desktop app's sign-in
//! through the browser, by which an invited person's Verso syncs a folder
//! shared with them (ADR 0117 D9, S11; `devices.rs`). A read link's page
//! is served to whoever holds it, and the owner makes links from the
//! window at the table (S12). An account has its tokens and its passkeys,
//! a passkey through the internet link alone (S13). There is no setup, no
//! "forgot the password" or sign-in by mail and no admin console (D9).

use std::sync::Arc;
use std::time::Instant;

use axum::Json;
use axum::Router;
use axum::extract::Request;
use axum::http::{HeaderValue, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, delete, get, get_service, post, put};
use serde::Deserialize;
use serde_json::json;

use super::pairing::{Polled, Redeemed};
use crate::auth;
use crate::http::{ApiError, ApiResult, Ctx, ok};
use crate::state::Server;

/// The page every address that is not a file is answered with: the
/// window's, which reads its path.
const PAGE: &str = "web.html";

pub fn router(server: Arc<Server>) -> Router {
    let ui = server.config.ui_dir.clone();
    let static_files = tower_http::services::ServeDir::new(&ui)
        .append_index_html_on_directories(false)
        .fallback(tower_http::services::ServeFile::new(ui.join(PAGE)));
    let page = || get_service(tower_http::services::ServeFile::new(ui.join(PAGE)));
    // The routes of an account's own (ADR 0117 D3 item 2): a phone is the
    // owner's device and has none of them.
    let accounts: Router<Arc<Server>> = Router::new()
        .route("/api/invite/{token}/join", post(crate::invite_join::join))
        .route("/api/me/password", post(crate::api::password))
        .route("/api/me/prove", post(crate::proof::prove))
        .route("/api/me/sessions", get(crate::api::sessions))
        .route("/api/me/sessions/others", delete(crate::api::end_others))
        .route("/api/me/sessions/{id}", delete(crate::api::end_session))
        // The desktop app's sign-in through the browser (ADR 0074 item 8;
        // ADR 0117 D9, S11): an invited person's Verso connects and syncs
        // a folder shared with them. The page is `/device`, the window's.
        .route("/api/device/start", post(crate::device::start))
        .route("/api/device/poll", post(crate::device::poll))
        .route("/api/device/describe", post(crate::device::describe_typed))
        .route("/api/device/approve", post(crate::device::approve_typed))
        .route("/api/device/refuse", post(crate::device::refuse_typed))
        .route("/api/me/device", put(crate::device::rename))
        // Personal access tokens and passkeys (ADR 0074 items 3 and 8; ADR
        // 0117 D9, S13). A passkey's ceremony only on a secure origin with a
        // name: through the internet link (`passkeys::on_a_secure_origin`).
        .route(
            "/api/me/tokens",
            get(crate::api::tokens).post(crate::api::create_token),
        )
        .route("/api/me/tokens/{id}", delete(crate::api::revoke_token))
        .route(
            "/api/me/passkeys",
            get(crate::passkeys::list).post(crate::passkeys::register_start),
        )
        .route(
            "/api/me/passkeys/finish",
            post(crate::passkeys::register_finish),
        )
        .route("/api/me/passkeys/{id}", delete(crate::passkeys::remove))
        .route("/api/me/prove/passkey", post(crate::passkeys::prove_start))
        .route("/api/passkey/start", post(crate::passkeys::sign_in_start))
        .route("/api/passkey/finish", post(crate::passkeys::sign_in_finish))
        // A folder's read links, its owner's (ADR 0105; ADR 0117 D9, S12):
        // here the owner's window at the table alone (`readlinks::make`).
        .route(
            "/api/folders/{id}/readlinks",
            get(crate::readlinks::list).post(crate::readlinks::make),
        )
        .route(
            "/api/folders/{id}/readlinks/secrets",
            get(crate::readlinks::secrets),
        )
        .route(
            "/api/folders/{id}/readlinks/{link}",
            delete(crate::readlinks::revoke),
        )
        .route_layer(middleware::from_fn_with_state(
            Arc::clone(&server),
            not_a_phone,
        ));
    let table: Router<Arc<Server>> = Router::new()
        .route("/f/{folder}/{*path}", get(crate::files::file))
        .route("/api/ws", get(crate::rpc::upgrade))
        .route("/api/state", get(crate::api::state))
        .route("/api/signin", post(crate::api::sign_in))
        .route(
            "/api/invite/{token}",
            get(crate::api::invitation).post(crate::api::accept),
        )
        .route("/api/signout", post(crate::api::sign_out))
        .route("/api/me", get(crate::api::me))
        .route(
            "/api/me/settings",
            get(crate::api::settings).put(crate::api::set_settings),
        )
        .route("/api/folders", get(crate::folders::mine))
        // What whoever holds a read link may reach (ADR 0105, `crate::visit`),
        // on the network and through the link; the page is the window's.
        .route("/r/{token}/state", get(crate::visit::state))
        .route("/r/{token}/unlock", post(crate::visit::unlock))
        .route("/r/{token}/ws", get(crate::visit::ws))
        .route("/r/{token}/f/{*path}", get(crate::visit::file))
        .route("/api/pair", post(pair))
        .route("/api/pair/poll", post(poll))
        .merge(accounts)
        // Everything else under /api/ is what an unknown route answers.
        .route("/api/{*rest}", any(crate::http::no_route))
        .route("/", page())
        .fallback_service(static_files);
    crate::http::guarded(table, server)
}

/// Before a route of an account: a paired phone is answered as an unknown
/// route is, as before accounts were here (ADR 0096 item 12).
async fn not_a_phone(ctx: Ctx, request: Request, next: Next) -> Response {
    if ctx.who.as_ref().is_some_and(|w| w.phone.is_some()) {
        return ApiError::not_found().into_response();
    }
    next.run(request).await
}

fn local(ctx: &Ctx) -> ApiResult<Arc<super::Policy>> {
    ctx.server.local.clone().ok_or_else(ApiError::not_found)
}

fn gone() -> ApiError {
    ApiError::new(
        axum::http::StatusCode::GONE,
        "link_gone",
        "this pairing is used or expired",
    )
}

#[derive(Deserialize)]
pub struct Presented {
    /// The token of the QR's fragment, or the code typed by hand.
    token: String,
    /// The browser's own name for the phone, when it gives one.
    #[serde(default)]
    device: Option<String>,
}

/// A phone presents the token. Nothing is reachable with no dialog open:
/// the route answers as an unknown one does. With one open, the phone is
/// not let in: the laptop is asked (item 6, point 3).
async fn pair(ctx: Ctx, Json(body): Json<Presented>) -> ApiResult<Response> {
    let policy = local(&ctx)?;
    // A phone pairs on the network, never through the internet link: there
    // the route answers as an unknown one does (ADR 0096 items 3 and 6;
    // ADR 0117 leaves pairing as it was).
    if ctx.peer.link || !policy.pairing_open(Instant::now()) {
        return Err(ApiError::not_found());
    }
    // From a page of this server: a page of another site cannot ask.
    if !auth::origin_ok(&ctx.server, &ctx.headers, &ctx.peer) {
        return Err(ApiError::forbidden("not from a page of this server"));
    }
    let device = crate::device::kept_name(body.device.as_deref().unwrap_or(""))
        .unwrap_or_else(|| auth::device_name(&ctx.headers));
    // What is compared is bounded: a token is 43 characters.
    let presented: String = body.token.chars().take(64).collect();
    match policy.redeem(
        &ctx.server,
        &presented,
        &device,
        &ctx.address(),
        Instant::now(),
    )? {
        Redeemed::Asked { poll } => Ok(ok(json!({ "poll": poll, "interval": 2 }))),
        Redeemed::Closed => Err(ApiError::not_found()),
        Redeemed::Refused { .. } => Err(gone()),
    }
}

#[derive(Deserialize)]
pub struct Poll {
    poll: String,
}

/// The phone asks whether the laptop allowed it. Allowed: the session is
/// handed over once, in its cookie.
async fn poll(ctx: Ctx, Json(body): Json<Poll>) -> ApiResult<Response> {
    let policy = local(&ctx)?;
    if ctx.peer.link {
        return Err(ApiError::not_found());
    }
    if !auth::origin_ok(&ctx.server, &ctx.headers, &ctx.peer) {
        return Err(ApiError::forbidden("not from a page of this server"));
    }
    let secret: String = body.poll.chars().take(64).collect();
    match policy.poll(&secret, Instant::now()) {
        // No pairing at all: as an unknown route.
        None => Err(ApiError::not_found()),
        Some(Polled::Waiting) => Ok(ok(json!({ "state": "waiting", "interval": 2 }))),
        Some(Polled::Allowed(ready)) => {
            let mut response = ok(json!({ "state": "allowed", "csrf": ready.csrf }));
            if let Ok(v) = HeaderValue::from_str(&auth::session_cookie(&ctx.peer, &ready.token)) {
                response.headers_mut().append(header::SET_COOKIE, v);
            }
            Ok(response)
        }
        Some(Polled::Refused | Polled::Gone) => Err(gone()),
    }
}
