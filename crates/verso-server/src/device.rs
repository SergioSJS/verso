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
    /// Who asked, for the page that approves it (threat-model.md, gap
    /// 12): the address the code was asked from, and when
    /// (`YYYY-MM-DDTHH:MM:SSZ`). A person sent someone else's link sees a
    /// request that is not theirs.
    pub address: String,
    pub asked: String,
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

/// A device's name as a session keeps it: on one line, trimmed, at most
/// 80 characters; none when nothing is left.
fn kept_name(name: &str) -> Option<String> {
    let one_line: String = name
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let kept: String = one_line.trim().chars().take(80).collect();
    let kept = kept.trim_end().to_owned();
    (!kept.is_empty()).then_some(kept)
}

#[derive(Deserialize)]
pub struct Start {
    device: String,
}

/// The app asks for a code.
pub async fn start(ctx: Ctx, Json(body): Json<Start>) -> ApiResult<Response> {
    ctx.secure()?;
    let key = format!("device:{}", ctx.peer.key());
    let wait = ctx.server.limiter.wait(&key);
    if !wait.is_zero() {
        return Err(ApiError::wait(wait.as_secs() + 1));
    }
    // Each start counts: a flood of codes is slowed like a flood of
    // sign-ins.
    ctx.server.limiter.failed(&key);
    let device = kept_name(&body.device);
    let code = code()?;
    let poll = crate::crypto::token()?;
    let mut devices = lock(&ctx.server.devices);
    devices.retain(|_, p| p.made.elapsed() < LIFE);
    crate::limit::make_room(&mut devices, crate::limit::PENDING, |p| p.made);
    devices.insert(
        code.clone(),
        Pending {
            device: device.unwrap_or_else(|| "Verso".to_owned()),
            poll: crate::crypto::hash(&poll),
            made: Instant::now(),
            approved: None,
            address: ctx.address(),
            asked: crate::log::stamp(),
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

fn link_gone() -> ApiError {
    ApiError::new(
        StatusCode::NOT_FOUND,
        "link_gone",
        "this code is used or expired",
    )
}

/// What is asking, for the page that approves it: the device's name as
/// it gave it, and the address and time it asked from (gap 12).
pub async fn describe(ctx: Ctx, Path(code): Path<String>) -> ApiResult<Response> {
    ctx.who()?;
    let devices = lock(&ctx.server.devices);
    let p = devices
        .get(&code.to_ascii_uppercase())
        .filter(|p| p.made.elapsed() < LIFE && p.approved.is_none())
        .ok_or_else(link_gone)?;
    Ok(ok(json!({
        "device": p.device,
        "address": p.address,
        "asked": p.asked,
    })))
}

/// The person says it was not them: the code is gone, and the app that
/// asked hears `link_gone` (gap 12).
pub async fn refuse(ctx: Ctx, Path(code): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.who()?;
    if !matches!(who.via, crate::auth::Via::Browser { .. }) {
        return Err(ApiError::forbidden("refused in the browser"));
    }
    let code = code.to_ascii_uppercase();
    let refused = {
        let mut devices = lock(&ctx.server.devices);
        let open = devices
            .get(&code)
            .is_some_and(|p| p.made.elapsed() < LIFE && p.approved.is_none());
        if open { devices.remove(&code) } else { None }
    }
    .ok_or_else(link_gone)?;
    crate::log::info(&format!(
        "a device's sign-in refused: {} asked from {} at {}",
        refused.device, refused.address, refused.asked
    ));
    ctx.audit("device_refused", Some(&refused.device), None, true);
    Ok(ok(json!(null)))
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
            .ok_or_else(link_gone)?
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
/// device's token once, `link_gone` after. A code unknown or a wrong poll
/// secret counts against the `device:` key of the address, as a start does
/// (ADR 0083 item 8, F17): past the free failures the next wrong one waits
/// its delay. The app that holds the right secret is answered whatever the
/// address's delay — a stranger sharing it, behind the same NAT, cannot
/// keep it from signing in (ADR 0074 item 9: never a lock a stranger can
/// use); the secret is 256 bits, not a thing a delay protects.
pub async fn poll(ctx: Ctx, Json(body): Json<Poll>) -> ApiResult<Response> {
    ctx.secure()?;
    let code = body.code.to_ascii_uppercase();
    let mut devices = lock(&ctx.server.devices);
    let right = devices
        .get(&code)
        .is_some_and(|p| crate::crypto::same(&p.poll, &crate::crypto::hash(&body.poll)));
    if !right {
        drop(devices);
        let key = format!("device:{}", ctx.peer.key());
        let wait = ctx.server.limiter.wait(&key);
        if !wait.is_zero() {
            return Err(ApiError::wait(wait.as_secs() + 1));
        }
        ctx.server.limiter.failed(&key);
        return Err(ApiError::new(
            StatusCode::GONE,
            "link_gone",
            "this code is used or expired",
        ));
    }
    let Some(p) = devices.get(&code) else {
        return Err(ApiError::new(
            StatusCode::GONE,
            "link_gone",
            "this code is used or expired",
        ));
    };
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

#[derive(Deserialize)]
pub struct Rename {
    device: String,
}

/// The device names itself again (ADR 0079 item 8, ADR 0074 item 8;
/// decided 2026-10-11): the person set this computer's name in the app's
/// Settings › Servers, and the session the device signed in with takes it
/// — the list of sessions and the folders' change log say it from now on.
/// Only a device's own session, with its own token.
pub async fn rename(ctx: Ctx, Json(body): Json<Rename>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.who()?;
    let crate::auth::Via::Device { session } = &who.via else {
        return Err(ApiError::forbidden(
            "a device names itself, with its own session",
        ));
    };
    let Some(device) = kept_name(&body.device) else {
        return Err(ApiError::bad("bad_request", "a name"));
    };
    if !ctx.server.db.rename_device(session, &device)? {
        return Err(ApiError::not_found());
    }
    ctx.audit("device_renamed", Some(&device), None, true);
    Ok(ok(json!({ "device": device })))
}
