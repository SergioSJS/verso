// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The desktop app signs in through the browser (ADR 0074 item 8; the
//! maintainer's answer K of 2026-10-09): the app asks for a code, opens
//! the server's page with it, the person — signed in there — approves, and
//! the app, asking meanwhile, receives a token for that device, listed
//! among the sessions and revocable there. Nobody pastes a token. The
//! flow is `gh auth login`'s (OAuth 2.0's device authorization grant).

use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::Response;
use serde::Deserialize;
use serde_json::json;
use verso_service::lock;

use crate::http::{ApiError, ApiResult, Ctx, ok};

/// How long a code waits for the person.
const LIFE: Duration = Duration::from_secs(600);
/// How often the app asks.
const INTERVAL: u64 = 2;
/// Letters a person reads without mistaking one for another.
const ALPHABET: &[u8] = b"BCDFGHJKLMNPQRSTVWXZ";

pub struct Pending {
    device: String,
    poll: Vec<u8>,
    made: Instant,
    approved: Option<(String, String)>,
}

fn code() -> Result<String, String> {
    let mut bytes = [0_u8; 8];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    let letters: String = bytes
        .iter()
        .map(|b| char::from(ALPHABET[usize::from(*b) % ALPHABET.len()]))
        .collect();
    Ok(format!("{}-{}", &letters[..4], &letters[4..]))
}

#[derive(Deserialize)]
pub struct Start {
    device: String,
}

/// The app asks for a code.
pub async fn start(ctx: Ctx, Json(body): Json<Start>) -> ApiResult<Response> {
    ctx.secure()?;
    let key = format!("device:{}", ctx.peer.addr);
    let wait = ctx.server.limiter.wait(&key);
    if !wait.is_zero() {
        return Err(ApiError::wait(wait.as_secs() + 1));
    }
    // Each start counts: a flood of codes is slowed like a flood of
    // sign-ins.
    ctx.server.limiter.failed(&key);
    let device: String = body.device.trim().chars().take(80).collect();
    let code = code()?;
    let poll = crate::crypto::token()?;
    let mut devices = lock(&ctx.server.devices);
    devices.retain(|_, p| p.made.elapsed() < LIFE);
    devices.insert(
        code.clone(),
        Pending {
            device: if device.is_empty() {
                "Verso".to_owned()
            } else {
                device
            },
            poll: crate::crypto::hash(&poll),
            made: Instant::now(),
            approved: None,
        },
    );
    let base = crate::auth::expected_origin(&ctx.server, &ctx.headers).unwrap_or_default();
    Ok(ok(json!({
        "code": code,
        "poll": poll,
        "url": format!("{base}/device?code={code}"),
        "interval": INTERVAL,
        "expires": LIFE.as_secs(),
    })))
}

/// What is asking, for the page that approves it.
pub async fn describe(ctx: Ctx, Path(code): Path<String>) -> ApiResult<Response> {
    ctx.who()?;
    let devices = lock(&ctx.server.devices);
    let p = devices
        .get(&code.to_ascii_uppercase())
        .filter(|p| p.made.elapsed() < LIFE && p.approved.is_none())
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::NOT_FOUND,
                "link_gone",
                "this code is used or expired",
            )
        })?;
    Ok(ok(json!({ "device": p.device })))
}

/// The person approves the code, signed in in the browser.
pub async fn approve(ctx: Ctx, Path(code): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.who()?.clone();
    if !matches!(who.via, crate::auth::Via::Browser { .. }) {
        return Err(ApiError::forbidden("approved in the browser"));
    }
    let code = code.to_ascii_uppercase();
    let device = {
        let devices = lock(&ctx.server.devices);
        devices
            .get(&code)
            .filter(|p| p.made.elapsed() < LIFE && p.approved.is_none())
            .map(|p| p.device.clone())
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::NOT_FOUND,
                    "link_gone",
                    "this code is used or expired",
                )
            })?
    };
    let (token, _) =
        ctx.server
            .db
            .create_session(&who.account.id, "device", &device, &ctx.address())?;
    if let Some(p) = lock(&ctx.server.devices).get_mut(&code) {
        p.approved = Some((token, who.account.id.clone()));
    }
    ctx.audit("device_approved", Some(&device), None, true);
    Ok(ok(json!(null)))
}

#[derive(Deserialize)]
pub struct Poll {
    code: String,
    poll: String,
}

/// The app asks whether the person approved: `pending` until then, the
/// device's token once, `link_gone` after.
pub async fn poll(ctx: Ctx, Json(body): Json<Poll>) -> ApiResult<Response> {
    ctx.secure()?;
    let code = body.code.to_ascii_uppercase();
    let mut devices = lock(&ctx.server.devices);
    let Some(p) = devices.get(&code) else {
        return Err(ApiError::new(
            StatusCode::GONE,
            "link_gone",
            "this code is used or expired",
        ));
    };
    if !crate::crypto::same(&p.poll, &crate::crypto::hash(&body.poll)) {
        return Err(ApiError::new(
            StatusCode::GONE,
            "link_gone",
            "this code is used or expired",
        ));
    }
    if p.made.elapsed() >= LIFE {
        devices.remove(&code);
        return Err(ApiError::new(
            StatusCode::GONE,
            "link_gone",
            "this code expired",
        ));
    }
    let Some((token, account)) = p.approved.clone() else {
        return Ok(ok(json!({ "pending": true, "interval": INTERVAL })));
    };
    devices.remove(&code);
    let account = ctx
        .server
        .db
        .account(&account)?
        .ok_or_else(ApiError::not_found)?;
    Ok(ok(
        json!({ "token": token, "account": crate::api::account_json(&account) }),
    ))
}
