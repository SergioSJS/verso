// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Signing in and the person's own account (ADR 0074): the server's state
//! for the page, sign-in and sign-out, the first admin's setup link,
//! accepting an invitation, a password reset, the profile, the sessions
//! and the personal access tokens.

use axum::Json;
use axum::extract::Path;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;

use crate::auth::{self, Via};
use crate::db::{self, Role};
use crate::http::{ApiError, ApiResult, Ctx, ok};

/// What the page asks before anything: whether it may sign in here,
/// whether the first admin is still to be made, and who is signed in;
/// to someone signed in, the server's version and the contract's too. A
/// stranger is not told the exact version (threat-model.md, gap 15): it
/// matches a server to an advisory, and the sign-in page needs none.
pub async fn state(ctx: Ctx) -> ApiResult<Response> {
    let setup = ctx.server.db.account_count()? == 0;
    let known = ctx.who.is_some();
    Ok(ok(json!({
        "version": known.then_some(env!("CARGO_PKG_VERSION")),
        "contract": known.then_some(&ctx.server.contract),
        "contractVersion": known.then_some(verso_contract::compat::VERSION),
        "secure": ctx.peer.https,
        "web": ctx.server.config.web,
        // "This app is a server" (ADR 0096): a phone pairs; since ADR 0117
        // D3 item 2 a person invited signs in there too ("accounts").
        "local": ctx.server.local.is_some(),
        "accounts": true,
        // Whether this door offers pairing: both of "this app is a
        // server" do — the network's (ADR 0096) and, since ADR 0117 D5
        // (R3), the internet link's, whose pairing answers only while the
        // owner's *Pair a phone* is open in the app.
        "pairing": ctx.server.local.is_some(),
        // This page came through the internet link of "this app is a
        // server": its pairing page says no word of the network's own
        // certificate (ADR 0117 D5).
        "link": ctx.server.local.is_some() && ctx.peer.link,
        // Whether a passkey can be added and used from this page: in "this
        // app is a server", through its internet link alone (ADR 0117 D9).
        "passkeys": ctx.server.local.is_none() || ctx.peer.link,
        // Links by e-mail exist only with a public address to build them
        // from (see [`mail_ready`]); the sign-in page hides them otherwise.
        "mail": mail_ready(&ctx.server),
        "setup": setup,
        "account": ctx.who.as_ref().map(|w| account_json(&w.account)),
        "csrf": match ctx.who.as_ref().map(|w| &w.via) {
            Some(Via::Browser { csrf, .. }) => Some(csrf.clone()),
            _ => None,
        },
    })))
}

pub fn account_json(a: &db::Account) -> serde_json::Value {
    json!({
        "id": a.id,
        "email": a.email,
        "name": a.name,
        "lang": a.lang,
        "admin": a.admin,
        "mayCreate": a.may_create,
    })
}

/// A person's or a token's name: something, and not a page of it.
pub fn check_name(name: &str) -> ApiResult<()> {
    if name.chars().count() > NAME_MOST {
        return Err(ApiError::bad(
            "bad_request",
            "a name of 200 characters at most",
        ));
    }
    Ok(())
}

const NAME_MOST: usize = 200;

/// A password the server takes for the account `email`: long enough, not
/// all spaces, not on the lists attackers try first, not the e-mail
/// (ADR 0083 item 3).
fn check_password(password: &str, email: &str) -> ApiResult<()> {
    match crate::passwords::weak(password, email) {
        Some(why) => Err(ApiError::bad(why.code(), why.words())),
        None => Ok(()),
    }
}

/// `password` hashed with Argon2id in one of the hashes' places
/// (`crate::hashes`): a new password, at setup, an invitation, a reset or a
/// change.
async fn hashed(ctx: &Ctx, password: &str) -> ApiResult<String> {
    let password = password.to_owned();
    Ok(ctx
        .server
        .hashes
        .run(move || crate::crypto::hash_password(&password))
        .await??)
}

fn check_lang(lang: &str) -> &'static str {
    if lang.starts_with("en") { "en" } else { "pt" }
}

/// A new browser session for `account`, its cookie set on `response`.
fn signed_in(ctx: &Ctx, account: &db::Account, body: serde_json::Value) -> ApiResult<Response> {
    let (token, csrf) = ctx.server.db.create_session(
        &account.id,
        "browser",
        &auth::device_name(&ctx.headers),
        &ctx.address(),
    )?;
    let mut response = ok(json!({ "account": account_json(account), "csrf": csrf, "done": body }));
    if let Ok(v) = HeaderValue::from_str(&auth::session_cookie(&ctx.peer, &token)) {
        response.headers_mut().append(header::SET_COOKIE, v);
    }
    Ok(response)
}

/// Wait out the delay of `keys`, or refuse — said in the log once a
/// minute per key (ADR 0083 item 1).
pub(crate) fn limited(ctx: &Ctx, keys: &[&str]) -> ApiResult<()> {
    let (wait, key) = keys
        .iter()
        .map(|k| (ctx.server.limiter.wait(k), *k))
        .max()
        .unwrap_or_default();
    if wait.is_zero() {
        Ok(())
    } else {
        ctx.server.signins.limited(key, &ctx.peer.key());
        Err(ApiError::wait(wait.as_secs() + 1))
    }
}

#[derive(Deserialize)]
pub struct SignIn {
    email: String,
    password: String,
}

/// Sign in with the e-mail and the password (ADR 0074 item 3), limited by
/// address and by account (item 9). An unknown e-mail and a wrong password
/// are answered alike, in about the same time.
pub async fn sign_in(ctx: Ctx, Json(body): Json<SignIn>) -> ApiResult<Response> {
    ctx.changes()?;
    let by_address = format!("in:{}", ctx.peer.key());
    let by_account = format!("in:{}", db::fold_email(&body.email));
    limited(&ctx, &[&by_address, &by_account])?;
    // Past the server's pace of refusals, every sign-in waits its turn
    // (ADR 0083 item 2).
    let turn = ctx.server.signins.turn();
    if !turn.is_zero() {
        tokio::time::sleep(turn).await;
    }
    // One attempt in flight per key, the delay asked again once it is
    // this one's turn: attempts sent together are counted one by one.
    let _turn = ctx.server.hashes.turn(&[&by_address, &by_account]).await?;
    limited(&ctx, &[&by_address, &by_account])?;
    let server = std::sync::Arc::clone(&ctx.server);
    let email = body.email.clone();
    let password = body.password.clone();
    // The account, and whether the password is its: an unknown e-mail,
    // and an account with no password yet, cost a hash too.
    let found = ctx
        .server
        .hashes
        .run(move || -> Result<(Option<db::Account>, bool), String> {
            let account = server.db.account_by_email(&email)?;
            let right = match account.as_ref().and_then(|a| a.password.as_deref()) {
                Some(h) => crate::crypto::verify_password(&password, h),
                None => {
                    crate::crypto::waste_time(&password);
                    false
                }
            };
            Ok((account, right))
        })
        .await??;
    let (Some(account), true) = found else {
        ctx.server.limiter.failed(&by_address);
        ctx.server.limiter.failed(&by_account);
        crate::signin::refused(
            &ctx.server,
            &ctx.peer.key(),
            Some(&body.email),
            found.0.as_ref(),
        );
        ctx.audit("sign_in", Some(&db::fold_email(&body.email)), None, false);
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "signin_failed",
            "wrong e-mail or password",
        ));
    };
    ctx.server.limiter.succeeded(&by_address);
    ctx.server.limiter.succeeded(&by_account);
    ctx.server
        .signins
        .succeeded(&ctx.peer.key(), Some(&body.email));
    ctx.audit_as(Some(&account.id), "sign_in", None, None, true);
    signed_in(&ctx, &account, json!(null))
}

pub async fn sign_out(ctx: Ctx) -> ApiResult<Response> {
    ctx.changes()?;
    if let Some(who) = &ctx.who
        && let Some(session) = who.session()
    {
        ctx.server.db.end_session(&who.account.id, session)?;
        ctx.server
            .sessions_ended(&who.account.id, Some(session), None);
        ctx.audit("sign_out", None, None, true);
    }
    let mut response = ok(json!(null));
    if let Ok(v) = HeaderValue::from_str(&auth::clear_cookie(&ctx.peer)) {
        response.headers_mut().append(header::SET_COOKIE, v);
    }
    Ok(response)
}

#[derive(Deserialize)]
pub struct Setup {
    token: String,
    email: String,
    name: String,
    password: String,
    lang: String,
}

/// The first admin, from the setup link the log printed (ADR 0074 item 1):
/// only while the server has no account, only with that link.
pub async fn setup(ctx: Ctx, Json(body): Json<Setup>) -> ApiResult<Response> {
    ctx.changes()?;
    let key = format!("link:{}", ctx.peer.key());
    limited(&ctx, &[&key])?;
    let Some(link) = ctx.server.db.pending(&body.token, "setup")? else {
        ctx.server.limiter.failed(&key);
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "link_gone",
            "this link is used or expired",
        ));
    };
    if ctx.server.db.account_count()? > 0 {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "link_gone",
            "the server has an admin",
        ));
    }
    if !db::is_email(&body.email) {
        return Err(ApiError::bad("not_email", "not an e-mail address"));
    }
    check_password(&body.password, &body.email)?;
    check_name(&body.name)?;
    let hashed = hashed(&ctx, &body.password).await?;
    let account = ctx.server.db.create_account_hashed(
        &body.email,
        &body.name,
        check_lang(&body.lang),
        Some(hashed),
        true,
    )?;
    ctx.server.db.use_invitation(&link.id, &account.id)?;
    ctx.server.db.end_setup_links()?;
    crate::log::info("the first admin was made from the setup link");
    ctx.audit_as(Some(&account.id), "setup", None, None, true);
    signed_in(&ctx, &account, json!(null))
}

/// What an invitation link offers, before it is accepted: the address it
/// was made for, the folder and the role it carries.
pub async fn invitation(ctx: Ctx, Path(token): Path<String>) -> ApiResult<Response> {
    let key = format!("link:{}", ctx.peer.key());
    limited(&ctx, &[&key])?;
    let Some(link) = ctx.server.db.pending(&token, "invite")? else {
        ctx.server.limiter.failed(&key);
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "link_gone",
            "this link is used or expired",
        ));
    };
    let folder = match &link.folder {
        Some(id) => ctx.server.db.folder(id)?.map(|f| f.dir),
        None => None,
    };
    // A share is named as its people see it: its folder's last part (ADR
    // 0081 item 3).
    let folder = match &link.share {
        Some(id) => ctx
            .server
            .db
            .share(id)?
            .map(|s| crate::scope::last(&s.path).to_owned())
            .or(folder),
        None => folder,
    };
    Ok(ok(json!({
        "email": link.email,
        "folder": folder,
        "role": link.role,
        "expires": link.expires,
    })))
}

#[derive(Deserialize)]
pub struct Accept {
    email: String,
    name: String,
    password: String,
    lang: String,
}

/// Accept an invitation: the account is made, the folder it carries is
/// granted, the link is used (ADR 0074 item 4).
pub async fn accept(
    ctx: Ctx,
    Path(token): Path<String>,
    Json(body): Json<Accept>,
) -> ApiResult<Response> {
    ctx.changes()?;
    let key = format!("link:{}", ctx.peer.key());
    limited(&ctx, &[&key])?;
    let Some(link) = ctx.server.db.pending(&token, "invite")? else {
        ctx.server.limiter.failed(&key);
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "link_gone",
            "this link is used or expired",
        ));
    };
    let email = link.email.clone().unwrap_or(body.email);
    if !db::is_email(&email) {
        return Err(ApiError::bad("not_email", "not an e-mail address"));
    }
    // This computer's own accounts' addresses are no person's (ADR 0117
    // D3 item 1): the holder of the folders served in part is found by its
    // address, which no player may take first.
    if ctx.server.local.is_some() && db::is_this_computer(&email) {
        return Err(ApiError::bad(
            "not_email",
            "that address is this computer's own: use one of yours",
        ));
    }
    check_password(&body.password, &email)?;
    check_name(&body.name)?;
    let hashed = hashed(&ctx, &body.password).await?;
    let account = match ctx.server.db.create_account_hashed(
        &email,
        &body.name,
        check_lang(&body.lang),
        Some(hashed),
        false,
    ) {
        Ok(a) => a,
        Err(e) if e == "exists" => {
            return Err(ApiError::new(
                StatusCode::CONFLICT,
                "exists",
                "an account has this e-mail: sign in on this page and accept with it",
            ));
        }
        Err(e) => return Err(e.into()),
    };
    // A new member creates no folders until the admin says so (ADR 0074
    // item 6).
    ctx.server.db.set_powers(&account.id, false, false)?;
    if !ctx.server.db.use_invitation(&link.id, &account.id)? {
        ctx.server.db.delete_account(&account.id)?;
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "link_gone",
            "this link is used or expired",
        ));
    }
    let mut opens: Option<String> = None;
    if let (Some(folder), Some(role)) = (&link.folder, link.role.as_deref().and_then(Role::parse)) {
        match &link.share {
            Some(share) if ctx.server.db.share(share)?.is_some() => {
                opens = Some(share.clone());
                ctx.server.db.grant_share(share, &account.id, role)?;
            }
            // The share went while the invitation was being used: nothing
            // of the folder is given in its place. An invitation made for
            // a share whose share is gone is not pending (`Invitation::
            // state`), so it does not reach here.
            Some(_) => {}
            None if link.for_share => {}
            None => {
                opens = Some(folder.clone());
                ctx.server.db.grant(folder, &account.id, role)?;
            }
        }
    }
    let account = ctx
        .server
        .db
        .account(&account.id)?
        .ok_or_else(ApiError::not_found)?;
    ctx.audit_as(
        Some(&account.id),
        "invitation_used",
        Some(&link.id),
        link.folder.as_deref(),
        true,
    );
    // The folder's windows — the game master's table — learn who came.
    if opens.is_some()
        && let Some(folder) = &link.folder
    {
        crate::campaign_cmds::people_changed(&ctx.server, folder).await;
    }
    // `open`: the folder or share just joined, which the page shows next.
    signed_in(&ctx, &account, json!({ "open": opens }))
}

/// What a reset link is for: the account's e-mail.
pub async fn reset_link(ctx: Ctx, Path(token): Path<String>) -> ApiResult<Response> {
    let key = format!("link:{}", ctx.peer.key());
    limited(&ctx, &[&key])?;
    let Some(link) = ctx.server.db.pending(&token, "reset")? else {
        ctx.server.limiter.failed(&key);
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "link_gone",
            "this link is used or expired",
        ));
    };
    let account = link
        .account
        .as_deref()
        .map(|id| ctx.server.db.account(id))
        .transpose()?
        .flatten()
        .ok_or_else(ApiError::not_found)?;
    Ok(ok(json!({ "email": account.email })))
}

#[derive(Deserialize)]
pub struct Reset {
    password: String,
}

/// A new password from a reset link (ADR 0074 item 5): every session of
/// the account ends, every personal access token is revoked (ADR 0083 item
/// 4: whoever took the password may have made one), and this browser is
/// signed in.
pub async fn reset(
    ctx: Ctx,
    Path(token): Path<String>,
    Json(body): Json<Reset>,
) -> ApiResult<Response> {
    ctx.changes()?;
    let key = format!("link:{}", ctx.peer.key());
    limited(&ctx, &[&key])?;
    let Some(link) = ctx.server.db.pending(&token, "reset")? else {
        ctx.server.limiter.failed(&key);
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "link_gone",
            "this link is used or expired",
        ));
    };
    let account = link
        .account
        .as_deref()
        .map(|id| ctx.server.db.account(id))
        .transpose()?
        .flatten()
        .ok_or_else(ApiError::not_found)?;
    // Before the link is used: a password refused leaves it to try again.
    check_password(&body.password, &account.email)?;
    let hashed = hashed(&ctx, &body.password).await?;
    if !ctx.server.db.use_invitation(&link.id, &account.id)? {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "link_gone",
            "this link is used or expired",
        ));
    }
    ctx.server.db.set_hashed_password(&account.id, &hashed)?;
    ctx.server.db.end_sessions(&account.id, None)?;
    let revoked = revoke_tokens(&ctx, &account.id)?;
    ctx.server
        .push_account(&account.id, &json!({ "gone": "session" }));
    ctx.audit_as(Some(&account.id), "password_reset", None, None, true);
    signed_in(&ctx, &account, json!({ "tokensRevoked": revoked }))
}

/// The person, the folders they may enter and their role in each.
pub async fn me(ctx: Ctx) -> ApiResult<Response> {
    let who = ctx.who()?;
    // The shares given to them too (ADR 0081 item 5).
    let (folders, _) = crate::shares::listing(&ctx, who)?;
    Ok(ok(json!({
        "account": account_json(&who.account),
        "folders": folders,
    })))
}

#[derive(Deserialize)]
pub struct Profile {
    name: String,
    lang: String,
}

pub async fn profile(ctx: Ctx, Json(body): Json<Profile>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?;
    if body.name.trim().is_empty() {
        return Err(ApiError::bad("bad_request", "a name"));
    }
    check_name(&body.name)?;
    ctx.server
        .db
        .set_profile(&who.account.id, &body.name, check_lang(&body.lang))?;
    Ok(ok(json!(null)))
}

/// Every personal access token of `account` revoked, a line of the audit
/// log each, as the account's own (ADR 0083 item 4): how many.
fn revoke_tokens(ctx: &Ctx, account: &str) -> ApiResult<usize> {
    let ids = ctx.server.db.revoke_tokens_of(account)?;
    for id in &ids {
        ctx.audit_as(Some(account), "token_revoked", Some(id), None, true);
    }
    Ok(ids.len())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Password {
    current: String,
    new: String,
    /// The account's personal access tokens revoked too (ADR 0083 item
    /// 4); the window offers it checked.
    #[serde(default)]
    revoke_tokens: bool,
}

/// A new password: the current one first; the other sessions end
/// (ADR 0074 item 7), and the tokens when asked — otherwise the answer
/// says how many stay (ADR 0083 item 4).
pub async fn password(ctx: Ctx, Json(body): Json<Password>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?.clone();
    // A fresh proof first, and the current password still (ADR 0083 item
    // 6): a stale cookie reaches neither the change nor a guess at it.
    ctx.proved()?;
    let key = format!("in:{}", db::fold_email(&who.account.email));
    limited(&ctx, &[&key])?;
    let _turn = ctx.server.hashes.turn(&[&key]).await?;
    limited(&ctx, &[&key])?;
    // Argon2id on the blocking pool, as a sign-in's (threat-model.md,
    // gap 16): on the runtime's thread it held every other request there;
    // and in one of the hashes' places (`crate::hashes`).
    let hash = who.account.password.clone();
    let current = body.current.clone();
    let right = ctx
        .server
        .hashes
        .run(move || {
            hash.as_deref()
                .is_some_and(|h| crate::crypto::verify_password(&current, h))
        })
        .await?;
    if !right {
        ctx.server.limiter.failed(&key);
        crate::signin::refused(
            &ctx.server,
            &ctx.peer.key(),
            Some(&who.account.email),
            Some(&who.account),
        );
        ctx.audit("password_change", None, None, false);
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "signin_failed",
            "wrong password",
        ));
    }
    ctx.server
        .signins
        .succeeded(&ctx.peer.key(), Some(&who.account.email));
    check_password(&body.new, &who.account.email)?;
    let hashed = hashed(&ctx, &body.new).await?;
    ctx.server
        .db
        .set_hashed_password(&who.account.id, &hashed)?;
    ctx.server.db.end_sessions(&who.account.id, who.session())?;
    ctx.server
        .sessions_ended(&who.account.id, None, who.session());
    let revoked = if body.revoke_tokens {
        revoke_tokens(&ctx, &who.account.id)?
    } else {
        0
    };
    let kept = ctx.server.db.token_count(&who.account.id)?;
    ctx.audit("password_change", None, None, true);
    Ok(ok(json!({ "tokensRevoked": revoked, "tokensKept": kept })))
}

pub async fn sessions(ctx: Ctx) -> ApiResult<Response> {
    let who = ctx.person()?;
    let current = who.session().map(str::to_owned);
    let list: Vec<_> = ctx
        .server
        .db
        .sessions_of(&who.account.id)?
        .into_iter()
        // The owner's window's seat is listed nowhere (ADR 0117 D4 Q3).
        .filter(|s| !ctx.server.local.as_ref().is_some_and(|l| l.is_seat(&s.id)))
        .map(|s| {
            let mine = current.as_deref() == Some(s.id.as_str());
            json!({ "session": s, "current": mine })
        })
        .collect();
    Ok(ok(list))
}

pub async fn end_session(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?;
    if !ctx.server.db.end_session(&who.account.id, &id)? {
        return Err(ApiError::not_found());
    }
    // Its connections close now: a device hears it at once.
    ctx.server.sessions_ended(&who.account.id, Some(&id), None);
    ctx.audit("session_ended", Some(&id), None, true);
    Ok(ok(json!(null)))
}

/// "Sign out everywhere else."
pub async fn end_others(ctx: Ctx) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?;
    let n = ctx.server.db.end_sessions(&who.account.id, who.session())?;
    ctx.server
        .sessions_ended(&who.account.id, None, who.session());
    ctx.audit("sessions_ended", Some(&n.to_string()), None, true);
    Ok(ok(json!({ "ended": n })))
}

pub async fn tokens(ctx: Ctx) -> ApiResult<Response> {
    let who = ctx.person()?;
    Ok(ok(ctx.server.db.tokens_of(&who.account.id)?))
}

#[derive(Deserialize)]
pub struct NewToken {
    name: String,
    write: bool,
    /// Days until it expires; `null`, never (ADR 0074 item 8: 30 by
    /// default, a year at most, or none, said in red).
    days: Option<u32>,
    folders: Vec<String>,
}

/// A personal access token, shown once (ADR 0074 item 8): never more than
/// the member's own role in each folder.
pub async fn create_token(ctx: Ctx, Json(body): Json<NewToken>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.who()?;
    if !matches!(who.via, Via::Browser { .. }) {
        return Err(ApiError::forbidden("tokens are made in the browser"));
    }
    // A fresh proof first (ADR 0083 item 6).
    ctx.proved()?;
    check_name(&body.name)?;
    if body.name.trim().is_empty() || body.folders.is_empty() {
        return Err(ApiError::bad(
            "bad_request",
            "a name and at least one folder",
        ));
    }
    if body.days.is_some_and(|d| d == 0 || d > 366) {
        return Err(ApiError::bad("bad_request", "one year at most"));
    }
    for id in &body.folders {
        // A folder, or a share given to the person (ADR 0081 item 15).
        let role = match crate::shares::opening(&ctx.server, who, id)? {
            crate::shares::Opening::Folder(_, role) | crate::shares::Opening::Share(_, _, role) => {
                role
            }
        };
        if body.write && !role.writes() {
            return Err(ApiError::forbidden("you only read that folder"));
        }
    }
    let expires = body.days.map(|d| db::now() + i64::from(d) * 86_400);
    let (secret, info) = ctx.server.db.create_token(
        &who.account.id,
        &body.name,
        body.write,
        expires,
        &body.folders,
    )?;
    ctx.audit("token_created", Some(&info.id), None, true);
    Ok(ok(json!({ "secret": secret, "token": info })))
}

pub async fn revoke_token(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?;
    if !ctx.server.db.revoke_token(&who.account.id, &id)? {
        return Err(ApiError::not_found());
    }
    ctx.audit("token_revoked", Some(&id), None, true);
    Ok(ok(json!(null)).into_response())
}

/// The person's settings as the window keeps them, with the account
/// (ADR 0073 item 5): read before the window starts in another browser.
pub async fn settings(ctx: Ctx) -> ApiResult<Response> {
    let who = ctx.person()?;
    Ok(ok(
        json!({ "settings": ctx.server.db.person_settings(&who.account.id)? }),
    ))
}

#[derive(Deserialize)]
pub struct Settings {
    settings: String,
}

/// The largest settings a person keeps: the window's own fit in a few
/// kilobytes.
const SETTINGS_MOST: usize = 256 * 1024;

pub async fn set_settings(ctx: Ctx, Json(body): Json<Settings>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?;
    if body.settings.len() > SETTINGS_MOST
        || serde_json::from_str::<serde_json::Value>(&body.settings)
            .map_or(true, |v| !v.is_object())
    {
        return Err(ApiError::bad(
            "bad_request",
            "settings are a JSON object of 256 KB at most",
        ));
    }
    ctx.server
        .db
        .set_person_settings(&who.account.id, &body.settings)?;
    Ok(ok(json!(null)))
}

/// How long a sign-in link sent by e-mail works.
const SIGNIN_LINK_LIFE: std::time::Duration = std::time::Duration::from_secs(15 * 60);

#[derive(Deserialize)]
pub struct ByMail {
    email: String,
}

/// A sign-in link by e-mail (ADR 0074 item 3): sent when the address has
/// an account; answered the same either way, and at once — whether the
/// address has an account, the link and the mail server's round happen
/// after the answer has left ([`mail_later`]).
pub async fn signin_link(ctx: Ctx, Json(body): Json<ByMail>) -> ApiResult<Response> {
    ctx.changes()?;
    mail_route_ready(&ctx)?;
    mail_limited(&ctx, &body.email)?;
    mail_later(&ctx, body.email, Mailed::SignIn);
    Ok(ok(json!({ "sent": true })))
}

/// Whether the unauthenticated mail routes work: a mail server, and a
/// `VERSO_PUBLIC_URL` to build their links from. The `Host` of a request
/// that signs nobody in is whatever its sender wrote, and a link mailed to
/// the victim must never carry it (a poisoned `Host` would send the reset
/// token to the attacker; ADR 0073 item 6, amended 2026-10-16).
pub fn mail_ready(server: &crate::state::Server) -> bool {
    server.mail.get().is_some() && server.public_origin().is_some()
}

fn mail_route_ready(ctx: &Ctx) -> ApiResult<()> {
    if ctx.server.mail.get().is_none() {
        return Err(ApiError::bad("no_mail", "this server has no mail server"));
    }
    if ctx.server.public_origin().is_none() {
        return Err(ApiError::bad(
            "no_mail",
            "links by mail need VERSO_PUBLIC_URL: set it to the address people use",
        ));
    }
    Ok(())
}

/// A mail route's delays: the sender's address, and the address mailed
/// to (ADR 0083 item 8, F11), each counted on every request with the same
/// growing delay, so that a mailbox is not flooded from many addresses each
/// within its own. Only a string that looks like an e-mail is keyed: it
/// has an `@`, which no address key has, so a request cannot name another
/// address's key; anything else has no account and is mailed nothing.
fn mail_limited(ctx: &Ctx, email: &str) -> ApiResult<()> {
    let mut keys = vec![format!("mail:{}", ctx.peer.key())];
    if db::is_email(email) {
        keys.push(format!("mail:{}", db::fold_email(email)));
    }
    let named: Vec<&str> = keys.iter().map(String::as_str).collect();
    limited(ctx, &named)?;
    for key in &keys {
        ctx.server.limiter.failed(key);
    }
    Ok(())
}

/// What a mail route sends to an address that has an account.
#[derive(Clone, Copy)]
enum Mailed {
    SignIn,
    Reset,
}

/// The work of a mail route, off its answer (threat-model.md, gap 6 of
/// 2026-10-11): the answer used to wait for the mail server only when the
/// address had an account, and its time told who has one. Now it leaves
/// before the database is asked, the same for every address; the mail,
/// its link and its line in the audit log follow on their own.
fn mail_later(ctx: &Ctx, email: String, what: Mailed) {
    let server = std::sync::Arc::clone(&ctx.server);
    // Only the configured address, or the UniVerso's own link's origin
    // the server set itself (ADR 0117 D4 item 2): never the request's own
    // `Host`.
    let base = ctx.server.public_origin().unwrap_or_default();
    let address = (ctx.address(), ctx.peer.key());
    tokio::spawn(async move {
        if let Err(e) = mailed(&server, &email, &base, &address, what).await {
            crate::log::error(&format!("a mail route: {e}"));
        }
    });
}

async fn mailed(
    server: &crate::state::Server,
    email: &str,
    base: &str,
    (address, by): &(String, String),
    what: Mailed,
) -> Result<(), String> {
    let (Some(mail), Some(account)) = (server.mail.get(), server.db.account_by_email(email)?)
    else {
        return Ok(());
    };
    let (path, token, action, words) = match what {
        Mailed::SignIn => {
            let token = crate::crypto::token()?;
            let mut links = verso_service::lock(&server.signin_links);
            links.retain(|_, (_, at, _)| at.elapsed() < SIGNIN_LINK_LIFE);
            // An address with its links waiting gets none more: the
            // answer already left, the same for every address.
            if !crate::limit::room_for(&links, by, |(_, _, k)| k) {
                drop(links);
                crate::log::info(&format!(
                    "a sign-in link not made: {by} has {} waiting",
                    crate::limit::PENDING_PER_ADDRESS
                ));
                return Ok(());
            }
            crate::limit::make_room(&mut links, crate::limit::PENDING, |(_, at, _)| *at);
            links.insert(
                crate::crypto::hash(&token),
                (account.id.clone(), std::time::Instant::now(), by.clone()),
            );
            ("signin-link", token, "signin_link_sent", "signin")
        }
        Mailed::Reset => {
            server.db.end_links_of(&account.id, "reset")?;
            let (token, _) = server.db.create_invitation(&db::NewLink {
                kind: "reset",
                account: Some(&account.id),
                life: db::RESET_LIFE,
                ..db::NewLink::default()
            })?;
            ("reset", token, "reset_link_mailed", "reset")
        }
    };
    let link = format!("{base}/{path}/{token}");
    let (subject, text) = crate::mail::words(&account.lang, words, &link);
    mail.send(&account.email, &subject, &text).await;
    server.db.audit(&db::Audit {
        actor: Some(&account.id),
        action,
        subject: None,
        folder: None,
        address: Some(address),
        ok: true,
    })
}

/// Whose a sign-in link is, before it is used: the page asks "sign in as
/// …?" and waits for a click, so a link someone else sent — for their own
/// account — is not taken in a load. Looking does not use the link; a
/// wrong one counts against the address as a link's use does.
pub async fn signin_link_offer(ctx: Ctx, Path(token): Path<String>) -> ApiResult<Response> {
    let key = format!("link:{}", ctx.peer.key());
    limited(&ctx, &[&key])?;
    let found = verso_service::lock(&ctx.server.signin_links)
        .get(&crate::crypto::hash(&token))
        .filter(|(_, at, _)| at.elapsed() < SIGNIN_LINK_LIFE)
        .map(|(account, _, _)| account.clone());
    let account = match found {
        Some(id) => ctx.server.db.account(&id)?,
        None => None,
    };
    let Some(account) = account else {
        ctx.server.limiter.failed(&key);
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "link_gone",
            "this link is used or expired",
        ));
    };
    Ok(ok(json!({ "email": account.email })))
}

/// The link from the e-mail, used once: a session, as a password's.
pub async fn signin_by_link(ctx: Ctx, Path(token): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let key = format!("link:{}", ctx.peer.key());
    limited(&ctx, &[&key])?;
    let found = verso_service::lock(&ctx.server.signin_links)
        .remove(&crate::crypto::hash(&token))
        .filter(|(_, at, _)| at.elapsed() < SIGNIN_LINK_LIFE);
    let Some((account, _, _)) = found else {
        ctx.server.limiter.failed(&key);
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "link_gone",
            "this link is used or expired",
        ));
    };
    let account = ctx
        .server
        .db
        .account(&account)?
        .ok_or_else(ApiError::not_found)?;
    ctx.audit_as(Some(&account.id), "sign_in_link", None, None, true);
    signed_in(&ctx, &account, json!(null))
}

/// "Forgot the password": a reset link sent to the account's address, for
/// a server with a mail server (ADR 0074 item 5); answered the same way,
/// and at once, whether the address has an account or not
/// ([`mail_later`]).
pub async fn forgot(ctx: Ctx, Json(body): Json<ByMail>) -> ApiResult<Response> {
    ctx.changes()?;
    mail_route_ready(&ctx)?;
    mail_limited(&ctx, &body.email)?;
    mail_later(&ctx, body.email, Mailed::Reset);
    Ok(ok(json!({ "sent": true })))
}
