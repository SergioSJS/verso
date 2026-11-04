// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The routes of "this app is a server" (ADR 0096): a smaller table than
//! `verso serve`'s, in the same layers (`Host` check, head and body bounds,
//! pace, headers). There is no sign-in, no invitation, no password, no
//! account page, no admin console, no token, no passkey and no device
//! flow: a phone gets in by pairing and nothing else. What it has is the
//! window's files, the contract's WebSocket, its folders' files, its own
//! state and sign-out, and the two routes of pairing.

use std::sync::Arc;
use std::time::Instant;

use axum::Json;
use axum::Router;
use axum::http::{HeaderValue, header};
use axum::response::Response;
use axum::routing::{any, get, get_service, post};
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
    let table: Router<Arc<Server>> = Router::new()
        .route("/f/{folder}/{*path}", get(crate::files::file))
        .route("/api/ws", get(crate::rpc::upgrade))
        .route("/api/state", get(crate::api::state))
        .route("/api/signout", post(crate::api::sign_out))
        .route("/api/me", get(crate::api::me))
        .route(
            "/api/me/settings",
            get(crate::api::settings).put(crate::api::set_settings),
        )
        .route("/api/folders", get(crate::folders::mine))
        .route("/api/pair", post(pair))
        .route("/api/pair/poll", post(poll))
        // Everything else under /api/ is what an unknown route answers.
        .route("/api/{*rest}", any(crate::http::no_route))
        .route("/", page())
        .fallback_service(static_files);
    crate::http::guarded(table, server)
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
