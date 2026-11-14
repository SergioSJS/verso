// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The admin page's API (ADR 0074 items 4, 5, 6 and 9; ADR 0075 items 3, 4
//! and 7): accounts with what each takes, invitations with their state,
//! reset links, the folders under the root and who owns each, the audit
//! log, and the server's own state. The admin has no implicit access to a
//! folder: entering one is a grant to themselves, in the log.

pub mod acts;

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::Response;
use serde::Deserialize;
use serde_json::json;

use crate::db::{self, NewLink, Role};
use crate::http::{ApiError, ApiResult, Ctx, ok};

/// The address a link is opened at.
pub fn link(ctx: &Ctx, path: &str, token: &str) -> String {
    let base =
        crate::auth::expected_origin(&ctx.server, &ctx.headers, &ctx.peer).unwrap_or_default();
    format!("{base}/{path}/{token}")
}

#[derive(Deserialize)]
pub struct NewAccount {
    email: String,
    name: String,
    lang: String,
}

/// An account made by the admin, with a link for its owner to set a
/// password (ADR 0074 item 4: nobody signs themselves up).
pub async fn create_account(ctx: Ctx, Json(body): Json<NewAccount>) -> ApiResult<Response> {
    ctx.changes()?;
    let admin = ctx.admin()?.account.id.clone();
    if !db::is_email(&body.email) {
        return Err(ApiError::bad("not_email", "not an e-mail address"));
    }
    let lang = if body.lang.starts_with("en") {
        "en"
    } else {
        "pt"
    };
    crate::api::check_name(&body.name)?;
    let account = match ctx
        .server
        .db
        .create_account(&body.email, &body.name, lang, None, false)
    {
        Ok(a) => a,
        Err(e) if e == "exists" => {
            return Err(ApiError::new(
                StatusCode::CONFLICT,
                "exists",
                "an account has this e-mail",
            ));
        }
        Err(e) => return Err(e.into()),
    };
    ctx.server.db.set_powers(&account.id, false, false)?;
    let (token, _) = ctx.server.db.create_invitation(&NewLink {
        kind: "reset",
        account: Some(&account.id),
        created_by: Some(&admin),
        life: db::INVITE_LIFE,
        ..NewLink::default()
    })?;
    ctx.audit("account_created", Some(&account.id), None, true);
    Ok(ok(
        json!({ "account": crate::api::account_json(&account), "link": link(&ctx, "reset", &token) }),
    ))
}

#[derive(Deserialize)]
pub struct Powers {
    admin: bool,
    #[serde(rename = "mayCreate")]
    may_create: bool,
}

pub async fn set_powers(
    ctx: Ctx,
    Path(id): Path<String>,
    Json(body): Json<Powers>,
) -> ApiResult<Response> {
    ctx.changes()?;
    let me = ctx.admin()?.account.id.clone();
    // A fresh proof first (ADR 0083 item 6), as for each of the admin's
    // acts on an account or a folder below.
    ctx.proved()?;
    let target = ctx
        .server
        .db
        .account(&id)?
        .ok_or_else(ApiError::not_found)?;
    if target.admin && !body.admin && ctx.server.db.admin_count()? <= 1 {
        return Err(ApiError::bad("last_admin", "the server keeps an admin"));
    }
    if id == me && !body.admin {
        return Err(ApiError::bad("last_admin", "another admin removes you"));
    }
    let may_create = body.may_create || body.admin;
    ctx.server.db.set_powers(&id, body.admin, may_create)?;
    ctx.audit(
        &format!("powers_admin_{}_create_{may_create}", body.admin),
        Some(&id),
        None,
        true,
    );
    // A game master's invitations waiting end with the power to make
    // folders; whoever accepted one keeps their place (ADR 0117 D7 (e)).
    if target.may_create && !may_create {
        let address = ctx.address();
        let by = acts::By {
            actor: Some(&me),
            address: Some(&address),
        };
        acts::end_invitations_of(&ctx.server.db, &by, &id)?;
    }
    Ok(ok(json!(null)))
}

pub async fn delete_account(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let me = ctx.admin()?.account.id.clone();
    ctx.proved()?;
    if id == me {
        return Err(ApiError::bad("last_admin", "another admin removes you"));
    }
    let address = ctx.address();
    let by = acts::By {
        actor: Some(&me),
        address: Some(&address),
    };
    acts::remove_account(&ctx.server.db, Some(&ctx.server), &by, &id)?;
    Ok(ok(json!(null)))
}

/// End every session of an account — browsers and devices — and revoke
/// its personal access tokens (ADR 0077 item 3, decided 2026-10-11: a lost
/// phone cut off without changing the password). Its open connections are
/// told `gone: session` and closed at once, a token's too. The admin's own
/// account ends from Settings › Account ("sign out everywhere else"), not
/// here: this would end the very session asking.
pub async fn end_sessions(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let me = ctx.admin()?.account.id.clone();
    ctx.proved()?;
    if id == me {
        return Err(ApiError::bad(
            "own_account",
            "your own sessions end in your account's page",
        ));
    }
    let address = ctx.address();
    let by = acts::By {
        actor: Some(&me),
        address: Some(&address),
    };
    let (sessions, tokens) = acts::end_sessions(&ctx.server.db, Some(&ctx.server), &by, &id)?;
    Ok(ok(json!({ "sessions": sessions, "tokens": tokens })))
}

/// A reset link for a member who lost their password (ADR 0074 item 5): it
/// replaces any earlier one; the admin sends it however they like. Making
/// it ends the account's sessions and revokes its tokens, as `verso serve
/// admin reset` does (decided 2026-11-04); an admin resetting their own
/// account keeps the session asking.
pub async fn reset_link(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.admin()?;
    let admin = who.account.id.clone();
    let keep = (id == admin)
        .then(|| who.session().map(str::to_owned))
        .flatten();
    // A fresh proof first (ADR 0083 item 6): a link that sets another
    // account's password is the way to take it over.
    ctx.proved()?;
    let address = ctx.address();
    let by = acts::By {
        actor: Some(&admin),
        address: Some(&address),
    };
    let (token, _) = acts::reset_link(
        &ctx.server.db,
        Some(&ctx.server),
        &by,
        Some(&admin),
        &id,
        keep.as_deref(),
        acts::RESET_LINK,
    )?;
    let address = link(&ctx, "reset", &token);
    let mut mailed = false;
    if let (Some(mail), Some(account)) = (ctx.server.mail.get(), ctx.server.db.account(&id)?) {
        let (subject, text) = crate::mail::words(&account.lang, "reset", &address);
        mail.send(&account.email, &subject, &text).await;
        mailed = true;
    }
    Ok(ok(json!({ "link": address, "mailed": mailed })))
}

#[derive(Deserialize)]
pub struct Invite {
    email: Option<String>,
    folder: Option<String>,
    role: Option<Role>,
    /// A share the invitation carries (ADR 0081 item 4): its folder is the
    /// share's.
    share: Option<String>,
}

/// An invitation: a single-use link for seven days, which may already
/// carry a folder and a role (ADR 0074 item 4).
pub async fn invite(ctx: Ctx, Json(body): Json<Invite>) -> ApiResult<Response> {
    ctx.changes()?;
    let admin = ctx.admin()?.account.id.clone();
    // One that carries a folder or a share hands it over, with any role up
    // to owner: a fresh proof first (ADR 0083 item 6), as entering a folder
    // wants, and before the folder or the share is looked at.
    if body.folder.is_some() || body.share.is_some() {
        ctx.proved()?;
    }
    let address = ctx.address();
    let by = acts::By {
        actor: Some(&admin),
        address: Some(&address),
    };
    let (token, inv) = acts::make_invitation(
        &ctx.server.db,
        &by,
        Some(&admin),
        &acts::Invitee {
            email: body.email.as_deref(),
            folder: body.folder.as_deref(),
            role: body.role,
            share: body.share.as_deref(),
            most_pending: None,
        },
    )?;
    let address = link(&ctx, "invite", &token);
    let mailed = mail_invitation(&ctx, inv.email.as_deref(), &token).await?;
    Ok(ok(
        json!({ "id": inv.id, "link": address, "expires": inv.expires, "mailed": mailed }),
    ))
}

/// With a mail server, an invitation made for an e-mail goes to it too (ADR
/// 0074 item 4), in the admin's language, its link the console's
/// ([`link`]); the admin has the link either way. Whether it was mailed.
/// The console's invitation and the share dialog's (`shares::invite`) alike;
/// "this app is a server" has no mail server, so it never mails.
pub(crate) async fn mail_invitation(
    ctx: &Ctx,
    email: Option<&str>,
    token: &str,
) -> ApiResult<bool> {
    let (Some(mail), Some(to)) = (ctx.server.mail.get(), email) else {
        return Ok(false);
    };
    let lang = ctx.admin()?.account.lang.clone();
    let (subject, text) = crate::mail::words(&lang, "invite", &link(ctx, "invite", token));
    mail.send(to, &subject, &text).await;
    Ok(true)
}

pub async fn end_invitation(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let admin = ctx.admin()?.account.id.clone();
    let address = ctx.address();
    let by = acts::By {
        actor: Some(&admin),
        address: Some(&address),
    };
    if !acts::end_invitation(&ctx.server.db, &by, &id)? {
        return Err(ApiError::not_found());
    }
    Ok(ok(json!(null)))
}

#[derive(Deserialize)]
pub struct Adopt {
    name: String,
    owner: String,
}

/// Register a directory already under the root, with an owner.
pub async fn adopt(ctx: Ctx, Json(body): Json<Adopt>) -> ApiResult<Response> {
    ctx.changes()?;
    ctx.admin()?;
    // It gives a folder on the disk to any owner, as entering one does
    // (ADR 0083 item 6): a fresh proof before the request is read.
    ctx.proved()?;
    let owner = match ctx.server.db.account(&body.owner)? {
        Some(a) => a,
        None => ctx
            .server
            .db
            .account_by_email(&body.owner)?
            .ok_or_else(|| ApiError::bad("no_account", "no account has that e-mail"))?,
    };
    let root = ctx.server.config.folders_dir.clone();
    let dirs = tokio::task::spawn_blocking(move || verso_fs::server::folders_under(&root))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("listing VERSO_FOLDERS_DIR: {e}"))?;
    if !dirs.contains(&body.name) {
        return Err(ApiError::not_found());
    }
    let registered = || ApiError::new(StatusCode::CONFLICT, "folder_exists", "already registered");
    if ctx.server.db.folder_by_dir(&body.name)?.is_some() {
        return Err(registered());
    }
    let folder = match ctx.server.db.create_folder(&body.name, &owner.id) {
        Ok(f) => f,
        // Two admins at once: the second finds it registered, not a 500.
        Err(_) if ctx.server.db.folder_by_dir(&body.name)?.is_some() => return Err(registered()),
        Err(e) => return Err(e.into()),
    };
    crate::quota::set_default(&ctx.server, &folder.id)?;
    ctx.audit("folder_adopted", Some(&owner.id), Some(&folder.id), true);
    Ok(ok(json!({ "id": folder.id, "name": folder.dir })))
}

#[derive(Deserialize)]
pub struct Enter {
    role: Role,
}

/// The admin enters a folder by granting themselves a role — never
/// implicitly — and the grant is in the log, for the owner to see
/// (ADR 0074 item 6, decided 2026-10-09).
pub async fn enter(
    ctx: Ctx,
    Path(id): Path<String>,
    Json(body): Json<Enter>,
) -> ApiResult<Response> {
    ctx.changes()?;
    let me = ctx.admin()?.account.id.clone();
    ctx.proved()?;
    ctx.server.db.folder(&id)?.ok_or_else(ApiError::not_found)?;
    ctx.server.db.grant(&id, &me, body.role)?;
    ctx.audit(
        &format!("admin_self_grant_{}", body.role.as_str()),
        Some(&me),
        Some(&id),
        true,
    );
    Ok(ok(json!(null)))
}
