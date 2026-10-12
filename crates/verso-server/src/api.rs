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
use crate::config::MIN_PASSWORD;
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
        "secure": ctx.peer.secure,
        "web": ctx.server.config.web,
        "mail": ctx.server.mail.get().is_some(),
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

/// A password the server takes: long enough, not all spaces.
fn check_password(password: &str) -> ApiResult<()> {
    if password.chars().count() < MIN_PASSWORD || password.trim().is_empty() {
        return Err(ApiError::bad(
            "weak_password",
            format!("at least {MIN_PASSWORD} characters"),
        ));
    }
    Ok(())
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
    if let Ok(v) = HeaderValue::from_str(&auth::session_cookie(&ctx.server, &token)) {
        response.headers_mut().append(header::SET_COOKIE, v);
    }
    Ok(response)
}

/// Wait out the delay of `keys`, or refuse.
fn limited(ctx: &Ctx, keys: &[&str]) -> ApiResult<()> {
    let wait = keys
        .iter()
        .map(|k| ctx.server.limiter.wait(k))
        .max()
        .unwrap_or_default();
    if wait.is_zero() {
        Ok(())
    } else {
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
    let server = std::sync::Arc::clone(&ctx.server);
    let email = body.email.clone();
    let password = body.password.clone();
    let found = tokio::task::spawn_blocking(move || -> Result<Option<db::Account>, String> {
        let account = server.db.account_by_email(&email)?;
        match account {
            Some(a)
                if a.password
                    .as_deref()
                    .is_some_and(|h| crate::crypto::verify_password(&password, h)) =>
            {
                Ok(Some(a))
            }
            Some(_) => Ok(None),
            None => {
                crate::crypto::waste_time(&password);
                Ok(None)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    let Some(account) = found else {
        ctx.server.limiter.failed(&by_address);
        ctx.server.limiter.failed(&by_account);
        ctx.audit("sign_in", Some(&db::fold_email(&body.email)), None, false);
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "signin_failed",
            "wrong e-mail or password",
        ));
    };
    ctx.server.limiter.succeeded(&by_address);
    ctx.server.limiter.succeeded(&by_account);
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
    if let Ok(v) = HeaderValue::from_str(&auth::clear_cookie(&ctx.server)) {
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
    check_password(&body.password)?;
    check_name(&body.name)?;
    let account = ctx.server.db.create_account(
        &body.email,
        &body.name,
        check_lang(&body.lang),
        Some(&body.password),
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
    check_password(&body.password)?;
    check_name(&body.name)?;
    let account = match ctx.server.db.create_account(
        &email,
        &body.name,
        check_lang(&body.lang),
        Some(&body.password),
        false,
    ) {
        Ok(a) => a,
        Err(e) if e == "exists" => {
            return Err(ApiError::new(
                StatusCode::CONFLICT,
                "exists",
                "an account has this e-mail: sign in",
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
    if let (Some(folder), Some(role)) = (&link.folder, link.role.as_deref().and_then(Role::parse)) {
        match &link.share {
            Some(share) if ctx.server.db.share(share)?.is_some() => {
                ctx.server.db.grant_share(share, &account.id, role)?;
            }
            // The share went before the invitation was used: nothing of
            // the folder is given in its place.
            Some(_) => {}
            None => ctx.server.db.grant(folder, &account.id, role)?,
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
    signed_in(&ctx, &account, json!(null))
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
/// the account ends, and this browser is signed in.
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
    check_password(&body.password)?;
    let account = link
        .account
        .as_deref()
        .map(|id| ctx.server.db.account(id))
        .transpose()?
        .flatten()
        .ok_or_else(ApiError::not_found)?;
    if !ctx.server.db.use_invitation(&link.id, &account.id)? {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "link_gone",
            "this link is used or expired",
        ));
    }
    ctx.server.db.set_password(&account.id, &body.password)?;
    ctx.server.db.end_sessions(&account.id, None)?;
    ctx.server
        .push_account(&account.id, &json!({ "gone": "session" }));
    ctx.audit_as(Some(&account.id), "password_reset", None, None, true);
    signed_in(&ctx, &account, json!(null))
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

#[derive(Deserialize)]
pub struct Password {
    current: String,
    new: String,
}

/// A new password: the current one first; the other sessions end
/// (ADR 0074 item 7).
pub async fn password(ctx: Ctx, Json(body): Json<Password>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?.clone();
    let key = format!("in:{}", db::fold_email(&who.account.email));
    limited(&ctx, &[&key])?;
    // Argon2id on the blocking pool, as a sign-in's (threat-model.md,
    // gap 16): on the runtime's thread it held every other request there.
    let hash = who.account.password.clone();
    let current = body.current.clone();
    let right = tokio::task::spawn_blocking(move || {
        hash.as_deref()
            .is_some_and(|h| crate::crypto::verify_password(&current, h))
    })
    .await
    .map_err(|e| e.to_string())?;
    if !right {
        ctx.server.limiter.failed(&key);
        ctx.audit("password_change", None, None, false);
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "signin_failed",
            "wrong password",
        ));
    }
    check_password(&body.new)?;
    ctx.server.db.set_password(&who.account.id, &body.new)?;
    ctx.server.db.end_sessions(&who.account.id, who.session())?;
    ctx.server
        .sessions_ended(&who.account.id, None, who.session());
    ctx.audit("password_change", None, None, true);
    Ok(ok(json!(null)))
}

pub async fn sessions(ctx: Ctx) -> ApiResult<Response> {
    let who = ctx.person()?;
    let current = who.session().map(str::to_owned);
    let list: Vec<_> = ctx
        .server
        .db
        .sessions_of(&who.account.id)?
        .into_iter()
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
    if ctx.server.mail.get().is_none() {
        return Err(ApiError::bad("no_mail", "this server has no mail server"));
    }
    let key = format!("mail:{}", ctx.peer.key());
    limited(&ctx, &[&key])?;
    ctx.server.limiter.failed(&key);
    mail_later(&ctx, body.email, Mailed::SignIn);
    Ok(ok(json!({ "sent": true })))
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
    let base = auth::expected_origin(&ctx.server, &ctx.headers).unwrap_or_default();
    let address = ctx.address();
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
    address: &str,
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
            links.retain(|_, (_, at)| at.elapsed() < SIGNIN_LINK_LIFE);
            crate::limit::make_room(&mut links, crate::limit::PENDING, |(_, at)| *at);
            links.insert(
                crate::crypto::hash(&token),
                (account.id.clone(), std::time::Instant::now()),
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

/// The link from the e-mail, used once: a session, as a password's.
pub async fn signin_by_link(ctx: Ctx, Path(token): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let key = format!("link:{}", ctx.peer.key());
    limited(&ctx, &[&key])?;
    let found = verso_service::lock(&ctx.server.signin_links)
        .remove(&crate::crypto::hash(&token))
        .filter(|(_, at)| at.elapsed() < SIGNIN_LINK_LIFE);
    let Some((account, _)) = found else {
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
    if ctx.server.mail.get().is_none() {
        return Err(ApiError::bad("no_mail", "this server has no mail server"));
    }
    let key = format!("mail:{}", ctx.peer.key());
    limited(&ctx, &[&key])?;
    ctx.server.limiter.failed(&key);
    mail_later(&ctx, body.email, Mailed::Reset);
    Ok(ok(json!({ "sent": true })))
}
