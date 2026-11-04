// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Passkeys (ADR 0074 item 3): added from the account's page once signed
//! in, and then a way to sign in without the password — the e-mail first,
//! then the device's own check (a fingerprint, a face, a PIN), which is two
//! factors by itself. WebAuthn needs HTTPS and a stable address
//! (`VERSO_PUBLIC_URL`), or this machine's `localhost`. The ceremonies'
//! state lives a few minutes in the server's memory, never on disk.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::Path;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::Response;
use serde::Deserialize;
use serde_json::json;
use verso_service::lock;
use webauthn_rs::prelude::{
    Passkey, PasskeyAuthentication, PasskeyRegistration, PublicKeyCredential,
    RegisterPublicKeyCredential, Url, Uuid, Webauthn, WebauthnBuilder,
};

use crate::db;
use crate::http::{ApiError, ApiResult, Ctx, ok};

/// How long a ceremony waits for the device.
const LIFE: Duration = Duration::from_secs(300);

/// The ceremonies under way.
#[derive(Default)]
pub struct Ceremonies {
    /// Each with when it began, its account, and the key of the address
    /// that began it (`crate::limit::room_for`).
    registering: Mutex<HashMap<String, (Instant, String, String, PasskeyRegistration)>>,
    signing_in: Mutex<HashMap<String, (Instant, String, String, PasskeyAuthentication)>>,
}

/// A passkey's ceremony needs a secure context and a name for the relying
/// party. "This app is a server" has them through its internet link alone
/// — a quick link or the person's own address, HTTPS by Cloudflare (ADR
/// 0117 D9, S13) — never on the network, whose own certificate is no
/// secure context to a browser and whose address is no name: there it is
/// refused in words, before anything is counted.
pub(crate) fn on_a_secure_origin(ctx: &Ctx) -> ApiResult<()> {
    if ctx.server.local.is_some() && !ctx.peer.link {
        return Err(ApiError::bad(
            "passkey_needs_link",
            "a passkey is added and used through this server's internet link; on the network, sign in with the password",
        ));
    }
    Ok(())
}

/// The relying party: this server, by the address people use.
fn webauthn(ctx: &Ctx) -> ApiResult<Webauthn> {
    on_a_secure_origin(ctx)?;
    let origin = crate::auth::expected_origin(&ctx.server, &ctx.headers, &ctx.peer)
        .ok_or_else(|| ApiError::bad("no_address", "set VERSO_PUBLIC_URL for passkeys"))?;
    let url = Url::parse(&origin).map_err(|e| ApiError::bad("no_address", e.to_string()))?;
    let id = url
        .host_str()
        .ok_or_else(|| ApiError::bad("no_address", "no host"))?
        .to_owned();
    WebauthnBuilder::new(&id, &url)
        .and_then(|b| b.rp_name("Verso").build())
        .map_err(|e| ApiError::bad("no_address", e.to_string()))
}

/// An account's WebAuthn user handle: stable, opaque, of the account id.
fn handle(account: &str) -> Uuid {
    let digest = crate::crypto::hash(account);
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    Uuid::from_bytes(bytes)
}

fn credentials(rows: &[db::PasskeyRow]) -> Vec<(String, Passkey)> {
    rows.iter()
        .filter_map(|r| {
            serde_json::from_str::<Passkey>(&r.credential)
                .ok()
                .map(|p| (r.id.clone(), p))
        })
        .collect()
}

pub async fn list(ctx: Ctx) -> ApiResult<Response> {
    let who = ctx.person()?;
    Ok(ok(ctx.server.db.passkeys(&who.account.id)?))
}

/// Start adding a passkey: the options for `navigator.credentials.create`.
pub async fn register_start(ctx: Ctx) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?.clone();
    if !matches!(who.via, crate::auth::Via::Browser { .. }) {
        return Err(ApiError::forbidden("passkeys are added in the browser"));
    }
    // A fresh proof first (ADR 0083 item 6).
    ctx.proved()?;
    let w = webauthn(&ctx)?;
    let existing = credentials(&ctx.server.db.passkeys(&who.account.id)?);
    let exclude = existing.iter().map(|(_, p)| p.cred_id().clone()).collect();
    let (options, state) = w
        .start_passkey_registration(
            handle(&who.account.id),
            &who.account.email,
            &who.account.name,
            Some(exclude),
        )
        .map_err(|e| ApiError::bad("passkey", e.to_string()))?;
    let id = crate::crypto::id()?;
    let mut map = lock(&ctx.server.ceremonies.registering);
    map.retain(|_, (at, _, _, _)| at.elapsed() < LIFE);
    let by = ctx.peer.key();
    if !crate::limit::room_for(&map, &by, |(_, _, k, _)| k) {
        return Err(ApiError::wait(LIFE.as_secs() / 10));
    }
    crate::limit::make_room(&mut map, crate::limit::PENDING, |(at, _, _, _)| *at);
    map.insert(
        id.clone(),
        (Instant::now(), who.account.id.clone(), by, state),
    );
    Ok(ok(json!({ "ceremony": id, "options": options })))
}

#[derive(Deserialize)]
pub struct Registered {
    ceremony: String,
    name: String,
    credential: RegisterPublicKeyCredential,
}

/// The device answered: the passkey kept.
pub async fn register_finish(ctx: Ctx, Json(body): Json<Registered>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?.clone();
    // Before the ceremony is used: a proof asked for leaves it to finish.
    ctx.proved()?;
    let (_, account, _, state) = lock(&ctx.server.ceremonies.registering)
        .remove(&body.ceremony)
        .filter(|(at, account, _, _)| at.elapsed() < LIFE && *account == who.account.id)
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "link_gone", "start again"))?;
    let w = webauthn(&ctx)?;
    let passkey = w
        .finish_passkey_registration(&body.credential, &state)
        .map_err(|e| ApiError::bad("passkey", e.to_string()))?;
    let stored = serde_json::to_string(&passkey).map_err(|e| e.to_string())?;
    let name = if body.name.trim().is_empty() {
        crate::auth::device_name(&ctx.headers)
    } else {
        body.name
    };
    let id = ctx.server.db.add_passkey(&account, &name, &stored)?;
    ctx.audit("passkey_added", Some(&id), None, true);
    Ok(ok(json!({ "id": id })))
}

pub async fn remove(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?;
    ctx.proved()?;
    if !ctx.server.db.remove_passkey(&who.account.id, &id)? {
        return Err(ApiError::not_found());
    }
    ctx.audit("passkey_removed", Some(&id), None, true);
    Ok(ok(json!(null)))
}

#[derive(Deserialize)]
pub struct SignInStart {
    email: String,
}

/// The per-address delay of a passkey's start: each start counts, so that
/// asking which addresses have passkeys is slowed as guessing is.
fn start_paced(ctx: &Ctx) -> ApiResult<()> {
    let key = format!("pk:{}", ctx.peer.key());
    let wait = ctx.server.limiter.wait(&key);
    if !wait.is_zero() {
        ctx.server.signins.limited(&key, &ctx.peer.key());
        return Err(ApiError::wait(wait.as_secs() + 1));
    }
    ctx.server.limiter.failed(&key);
    Ok(())
}

fn no_passkey() -> ApiError {
    ApiError::new(
        StatusCode::UNAUTHORIZED,
        "no_passkey",
        "no passkey for that e-mail: use the password",
    )
}

/// A ceremony for `account`'s passkeys `keys`: the options for
/// `navigator.credentials.get`, its state kept a few minutes.
fn assertion(ctx: &Ctx, account: String, keys: Vec<(String, Passkey)>) -> ApiResult<Response> {
    let w = webauthn(ctx)?;
    let passkeys: Vec<Passkey> = keys.into_iter().map(|(_, p)| p).collect();
    let (options, state) = w
        .start_passkey_authentication(&passkeys)
        .map_err(|e| ApiError::bad("passkey", e.to_string()))?;
    let id = crate::crypto::id()?;
    let mut map = lock(&ctx.server.ceremonies.signing_in);
    map.retain(|_, (at, _, _, _)| at.elapsed() < LIFE);
    let by = ctx.peer.key();
    if !crate::limit::room_for(&map, &by, |(_, _, k, _)| k) {
        return Err(ApiError::wait(LIFE.as_secs() / 10));
    }
    crate::limit::make_room(&mut map, crate::limit::PENDING, |(at, _, _, _)| *at);
    map.insert(id.clone(), (Instant::now(), account, by, state));
    Ok(ok(json!({ "ceremony": id, "options": options })))
}

/// Sign in with a passkey: the account's passkeys, as options for
/// `navigator.credentials.get`. An unknown address and an account with
/// no passkey are answered the same way, after the same checks: the
/// answer says that an address has passkeys, never who has an account
/// (threat-model.md).
pub async fn sign_in_start(ctx: Ctx, Json(body): Json<SignInStart>) -> ApiResult<Response> {
    ctx.changes()?;
    on_a_secure_origin(&ctx)?;
    start_paced(&ctx)?;
    let account = ctx.server.db.account_by_email(&body.email)?;
    let keys = match &account {
        Some(a) => credentials(&ctx.server.db.passkeys(&a.id)?),
        None => Vec::new(),
    };
    let Some(account) = account.filter(|_| !keys.is_empty()) else {
        return Err(no_passkey());
    };
    assertion(&ctx, account.id, keys)
}

/// The person signed in proves who they are with a passkey (ADR 0083 item
/// 6): their own passkeys as options, paced as a sign-in's start is.
pub async fn prove_start(ctx: Ctx) -> ApiResult<Response> {
    ctx.changes()?;
    on_a_secure_origin(&ctx)?;
    let who = ctx.person()?.clone();
    start_paced(&ctx)?;
    let keys = credentials(&ctx.server.db.passkeys(&who.account.id)?);
    if keys.is_empty() {
        return Err(no_passkey());
    }
    assertion(&ctx, who.account.id, keys)
}

#[derive(Deserialize)]
pub struct SignInFinish {
    ceremony: String,
    credential: PublicKeyCredential,
}

/// The device's answer to ceremony `ceremony`, checked; the ceremony is
/// used either way. The account it was started for, and whether the answer
/// holds — the stored credential's counter kept when it does. A ceremony
/// gone, or started for an account other than `of`, is `link_gone`.
fn answered(
    ctx: &Ctx,
    ceremony: &str,
    credential: &PublicKeyCredential,
    of: Option<&str>,
) -> ApiResult<(String, Result<(), String>)> {
    let (_, account, _, state) = lock(&ctx.server.ceremonies.signing_in)
        .remove(ceremony)
        .filter(|(at, account, _, _)| at.elapsed() < LIFE && of.is_none_or(|a| a == account))
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "link_gone", "start again"))?;
    let w = webauthn(ctx)?;
    let result = match w.finish_passkey_authentication(credential, &state) {
        Ok(r) => r,
        Err(e) => return Ok((account, Err(e.to_string()))),
    };
    // The counter the device keeps moves: the stored credential follows.
    for (id, mut passkey) in credentials(&ctx.server.db.passkeys(&account)?) {
        if passkey.cred_id() == result.cred_id() {
            passkey.update_credential(&result);
            if let Ok(text) = serde_json::to_string(&passkey) {
                ctx.server.db.used_passkey(&id, &text)?;
            }
        }
    }
    Ok((account, Ok(())))
}

/// A passkey's answer refused, said as a password's refusal is, under the
/// account's e-mail (ADR 0083 item 1): the ceremony was started for it.
fn refused(ctx: &Ctx, account: &str, action: &str) -> ApiResult<()> {
    let found = ctx.server.db.account(account)?;
    crate::signin::refused(
        &ctx.server,
        &ctx.peer.key(),
        Some(found.as_ref().map_or("", |a| a.email.as_str())),
        found.as_ref(),
    );
    ctx.audit_as(Some(account), action, None, None, false);
    Ok(())
}

/// Past the server's pace of refusals, every sign-in waits its turn (ADR
/// 0083 item 2).
async fn turn(ctx: &Ctx) {
    let turn = ctx.server.signins.turn();
    if !turn.is_zero() {
        tokio::time::sleep(turn).await;
    }
}

/// The device answered: a session, as a password's sign-in makes.
pub async fn sign_in_finish(ctx: Ctx, Json(body): Json<SignInFinish>) -> ApiResult<Response> {
    ctx.changes()?;
    turn(&ctx).await;
    let (account_id, held) = answered(&ctx, &body.ceremony, &body.credential, None)?;
    if let Err(why) = held {
        refused(&ctx, &account_id, "sign_in_passkey")?;
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "signin_failed",
            why,
        ));
    }
    let account = ctx
        .server
        .db
        .account(&account_id)?
        .ok_or_else(ApiError::not_found)?;
    ctx.server
        .limiter
        .succeeded(&format!("pk:{}", ctx.peer.key()));
    ctx.server
        .signins
        .succeeded(&ctx.peer.key(), Some(&account.email));
    ctx.audit_as(Some(&account.id), "sign_in_passkey", None, None, true);
    let (token, csrf) = ctx.server.db.create_session(
        &account.id,
        "browser",
        &crate::auth::device_name(&ctx.headers),
        &ctx.address(),
    )?;
    let mut response = ok(json!({ "account": crate::api::account_json(&account), "csrf": csrf }));
    if let Ok(v) = HeaderValue::from_str(&crate::auth::session_cookie(&ctx.peer, &token)) {
        response.headers_mut().append(header::SET_COOKIE, v);
    }
    Ok(response)
}

/// The person's passkey answered a proof's ceremony (ADR 0083 item 6),
/// checked as a sign-in's answer is; refused, it is said and counted as a
/// refused sign-in.
pub(crate) async fn prove_finish(
    ctx: &Ctx,
    who: &crate::auth::Who,
    ceremony: &str,
    credential: &PublicKeyCredential,
) -> ApiResult<()> {
    turn(ctx).await;
    let (account, held) = answered(ctx, ceremony, credential, Some(&who.account.id))?;
    if let Err(why) = held {
        refused(ctx, &account, "proved")?;
        return Err(ApiError::new(StatusCode::FORBIDDEN, "signin_failed", why));
    }
    ctx.server
        .limiter
        .succeeded(&format!("pk:{}", ctx.peer.key()));
    ctx.server
        .signins
        .succeeded(&ctx.peer.key(), Some(&who.account.email));
    Ok(())
}
