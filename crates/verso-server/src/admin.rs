// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The admin page's API (ADR 0074 items 4, 5, 6 and 9; ADR 0075 items 3, 4
//! and 7): accounts with what each takes, invitations with their state,
//! reset links, the folders under the root and who owns each, the audit
//! log, and the server's own state. The admin has no implicit access to a
//! folder: entering one is a grant to themselves, in the log.

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
    let base = crate::auth::expected_origin(&ctx.server, &ctx.headers).unwrap_or_default();
    format!("{base}/{path}/{token}")
}

fn space_bytes(space: &serde_json::Value) -> f64 {
    space
        .get("total")
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(0.0)
}

pub async fn accounts(ctx: Ctx) -> ApiResult<Response> {
    ctx.admin()?;
    let mut list = Vec::new();
    for a in ctx.server.db.accounts()? {
        let owned: Vec<_> = ctx
            .server
            .db
            .folders_of(&a.id)?
            .into_iter()
            .filter(|(_, r)| *r == Role::Owner)
            .collect();
        let total: f64 = owned
            .iter()
            .map(|(f, _)| space_bytes(&crate::folders::space(&ctx, &f.id)))
            .sum();
        list.push(json!({
            "account": crate::api::account_json(&a),
            "created": a.created,
            "folders": owned.len(),
            "space": total,
            "password": a.password.is_some(),
        }));
    }
    Ok(ok(list))
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
    ctx.server
        .db
        .set_powers(&id, body.admin, body.may_create || body.admin)?;
    ctx.audit(
        &format!(
            "powers_admin_{}_create_{}",
            body.admin,
            body.may_create || body.admin
        ),
        Some(&id),
        None,
        true,
    );
    Ok(ok(json!(null)))
}

pub async fn delete_account(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let me = ctx.admin()?.account.id.clone();
    if id == me {
        return Err(ApiError::bad("last_admin", "another admin removes you"));
    }
    let target = ctx
        .server
        .db
        .account(&id)?
        .ok_or_else(ApiError::not_found)?;
    // A folder whose only owner goes would be left with no one to share
    // it: the admin gives it another owner first.
    for (f, role) in ctx.server.db.folders_of(&id)? {
        if role == Role::Owner
            && !ctx
                .server
                .db
                .members(&f.id)?
                .iter()
                .any(|(a, r)| *r == Role::Owner && a.id != id)
        {
            return Err(ApiError::bad(
                "last_owner",
                format!("{} keeps an owner: give it another first", f.dir),
            ));
        }
    }
    ctx.server.push_account(&id, &json!({ "gone": "session" }));
    ctx.server.db.delete_account(&id)?;
    ctx.audit("account_deleted", Some(&target.email), None, true);
    Ok(ok(json!(null)))
}

/// A reset link for a member who lost their password (ADR 0074 item 5): it
/// replaces any earlier one; the admin sends it however they like.
pub async fn reset_link(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let admin = ctx.admin()?.account.id.clone();
    ctx.server
        .db
        .account(&id)?
        .ok_or_else(ApiError::not_found)?;
    ctx.server.db.end_links_of(&id, "reset")?;
    let (token, _) = ctx.server.db.create_invitation(&NewLink {
        kind: "reset",
        account: Some(&id),
        created_by: Some(&admin),
        life: db::RESET_LIFE,
        ..NewLink::default()
    })?;
    ctx.audit("reset_link", Some(&id), None, true);
    Ok(ok(json!({ "link": link(&ctx, "reset", &token) })))
}

pub async fn invitations(ctx: Ctx) -> ApiResult<Response> {
    ctx.admin()?;
    let now = db::now();
    let mut list = Vec::new();
    for i in ctx.server.db.invitations()? {
        let used_by = match &i.used_by {
            Some(id) => ctx.server.db.account(id)?.map(|a| a.email),
            None => None,
        };
        let folder = match &i.folder {
            Some(id) => ctx.server.db.folder(id)?.map(|f| f.dir),
            None => None,
        };
        list.push(json!({
            "id": i.id,
            "state": i.state(now),
            "email": i.email,
            "folder": folder,
            "role": i.role,
            "created": i.created,
            "expires": i.expires,
            "used": i.used,
            "usedBy": used_by,
        }));
    }
    Ok(ok(list))
}

#[derive(Deserialize)]
pub struct Invite {
    email: Option<String>,
    folder: Option<String>,
    role: Option<Role>,
}

/// An invitation: a single-use link for seven days, which may already
/// carry a folder and a role (ADR 0074 item 4).
pub async fn invite(ctx: Ctx, Json(body): Json<Invite>) -> ApiResult<Response> {
    ctx.changes()?;
    let admin = ctx.admin()?.account.id.clone();
    let email = body
        .email
        .as_deref()
        .map(str::trim)
        .filter(|e| !e.is_empty());
    if let Some(e) = email {
        if !db::is_email(e) {
            return Err(ApiError::bad("not_email", "not an e-mail address"));
        }
        if ctx.server.db.account_by_email(e)?.is_some() {
            return Err(ApiError::new(
                StatusCode::CONFLICT,
                "exists",
                "an account has this e-mail",
            ));
        }
    }
    if let Some(f) = &body.folder {
        ctx.server.db.folder(f)?.ok_or_else(ApiError::not_found)?;
    }
    let role = body
        .folder
        .as_ref()
        .map(|_| body.role.unwrap_or(Role::Reader));
    let (token, inv) = ctx.server.db.create_invitation(&NewLink {
        kind: "invite",
        email,
        folder: body.folder.as_deref(),
        role,
        created_by: Some(&admin),
        life: db::INVITE_LIFE,
        ..NewLink::default()
    })?;
    ctx.audit(
        "invitation_created",
        Some(&inv.id),
        body.folder.as_deref(),
        true,
    );
    Ok(ok(
        json!({ "id": inv.id, "link": link(&ctx, "invite", &token), "expires": inv.expires }),
    ))
}

pub async fn end_invitation(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    ctx.admin()?;
    if !ctx.server.db.end_invitation(&id)? {
        return Err(ApiError::not_found());
    }
    ctx.audit("invitation_ended", Some(&id), None, true);
    Ok(ok(json!(null)))
}

/// The folders registered and the directories under the root not yet
/// registered, which the admin may adopt (an existing folder on a NAS,
/// the maintainer's answer J).
pub async fn folders(ctx: Ctx) -> ApiResult<Response> {
    ctx.admin()?;
    let mut registered = Vec::new();
    for f in ctx.server.db.folders()? {
        let owners: Vec<_> = ctx
            .server
            .db
            .members(&f.id)?
            .into_iter()
            .filter(|(_, r)| *r == Role::Owner)
            .map(|(a, _)| a.email)
            .collect();
        let members = ctx.server.db.members(&f.id)?.len();
        registered.push(json!({
            "id": f.id,
            "name": f.dir,
            "owners": owners,
            "members": members,
            "space": crate::folders::space(&ctx, &f.id),
        }));
    }
    let root = ctx.server.config.folders_dir.clone();
    let dirs = tokio::task::spawn_blocking(move || verso_fs::server::folders_under(&root))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("listing VERSO_FOLDERS_DIR: {e}"))?;
    let known: std::collections::HashSet<String> = ctx
        .server
        .db
        .folders()?
        .into_iter()
        .map(|f| f.dir)
        .collect();
    let loose: Vec<_> = dirs.into_iter().filter(|d| !known.contains(d)).collect();
    Ok(ok(json!({ "folders": registered, "unregistered": loose })))
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
    if ctx.server.db.folder_by_dir(&body.name)?.is_some() {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "exists",
            "already registered",
        ));
    }
    let folder = ctx.server.db.create_folder(&body.name, &owner.id)?;
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

pub async fn audit(ctx: Ctx) -> ApiResult<Response> {
    ctx.admin()?;
    Ok(ok(ctx.server.db.audit_log(None, 500)?))
}

/// The server's own state for its admin: version, a newer one if the check
/// found it (answer E), where the data and the folders live and whether
/// either is on a network file system (ADR 0075 item 3).
pub async fn server_info(ctx: Ctx) -> ApiResult<Response> {
    ctx.admin()?;
    let data = ctx.server.config.data_dir.clone();
    let folders = ctx.server.config.folders_dir.clone();
    let (data_net, folders_net) = tokio::task::spawn_blocking(move || {
        (
            verso_fs::server::network_file_system(&data),
            verso_fs::server::network_file_system(&folders),
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    let newer = verso_service::lock(&ctx.server.newer).clone();
    Ok(ok(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "newer": newer,
        "updateCheck": ctx.server.config.update_check,
        "dataOnNetwork": data_net,
        "foldersOnNetwork": folders_net,
        "publicUrl": ctx.server.config.public_url,
        "tls": ctx.server.config.tls.is_some(),
        "proxy": ctx.server.config.trusted_proxy.map(|a| a.to_string()),
    })))
}
