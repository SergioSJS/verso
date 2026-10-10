// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A member's folders (ADR 0073 item 5, ADR 0074 item 6): the ones they
//! may enter, a new one when the admin lets them make folders, and — for
//! the owner — who else is in it, in which role, and what the audit log
//! says about it.

use axum::Json;
use axum::extract::Path;
use axum::response::Response;
use serde::Deserialize;
use serde_json::json;

use crate::db::Role;
use crate::http::{ApiError, ApiResult, Ctx, ok};

/// The space a folder takes, as last counted (ADR 0075 item 4).
pub fn space(ctx: &Ctx, id: &str) -> serde_json::Value {
    ctx.server
        .db
        .setting(&format!("space:{id}"))
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::Value::Null)
}

pub async fn mine(ctx: Ctx) -> ApiResult<Response> {
    let who = ctx.who()?;
    let list: Vec<_> = ctx
        .server
        .db
        .folders_of(&who.account.id)?
        .into_iter()
        .filter(|(f, _)| who.reaches(&f.id).0)
        .map(|(f, role)| json!({ "id": f.id, "name": f.dir, "role": role, "space": space(&ctx, &f.id) }))
        .collect();
    Ok(ok(
        json!({ "folders": list, "mayCreate": who.account.may_create }),
    ))
}

#[derive(Deserialize)]
pub struct NewFolder {
    name: String,
}

/// A new folder under the root, owned by whoever makes it — an admin, or a
/// member the admin allowed (ADR 0074 item 6).
pub async fn create(ctx: Ctx, Json(body): Json<NewFolder>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.who()?;
    if !who.account.may_create || matches!(who.via, crate::auth::Via::Token { .. }) {
        return Err(ApiError::forbidden(
            "the admin has not let you make folders",
        ));
    }
    let name = body.name.trim().to_owned();
    if !verso_fs::server::is_folder_name(&name) {
        return Err(ApiError::bad("bad_name", "not a name a folder can have"));
    }
    if ctx.server.db.folder_by_dir(&name)?.is_some() {
        return Err(ApiError::new(
            axum::http::StatusCode::CONFLICT,
            "folder_exists",
            "a folder has that name",
        ));
    }
    let root = ctx.server.config.folders_dir.clone();
    let made = name.clone();
    tokio::task::spawn_blocking(move || verso_fs::server::make_folder(&root, &made))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::AlreadyExists => ApiError::new(
                axum::http::StatusCode::CONFLICT,
                "folder_exists",
                "a folder has that name",
            ),
            _ => ApiError::from(format!("making the folder: {e}")),
        })?;
    let folder = ctx.server.db.create_folder(&name, &who.account.id)?;
    crate::quota::set_default(&ctx.server, &folder.id)?;
    ctx.audit("folder_created", Some(&folder.dir), Some(&folder.id), true);
    Ok(ok(
        json!({ "id": folder.id, "name": folder.dir, "role": Role::Owner }),
    ))
}

pub async fn members(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    let who = ctx.person()?;
    crate::access::at_least(&ctx.server, who, &id, Role::Owner)?;
    let list: Vec<_> = ctx
        .server
        .db
        .members(&id)?
        .into_iter()
        .map(|(a, role)| json!({ "id": a.id, "email": a.email, "name": a.name, "role": role }))
        .collect();
    Ok(ok(list))
}

#[derive(Deserialize)]
pub struct SetRole {
    role: Role,
}

/// The owner grants a member a role, by account id or by e-mail of an
/// existing account. A folder always keeps an owner.
pub async fn set_member(
    ctx: Ctx,
    Path((id, account)): Path<(String, String)>,
    Json(body): Json<SetRole>,
) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?;
    crate::access::at_least(&ctx.server, who, &id, Role::Owner)?;
    let target = match ctx.server.db.account(&account)? {
        Some(a) => a,
        None => ctx.server.db.account_by_email(&account)?.ok_or_else(|| {
            ApiError::bad("no_account", "no account has that e-mail: invite them")
        })?,
    };
    if body.role != Role::Owner && last_owner(&ctx, &id, &target.id)? {
        return Err(ApiError::bad("last_owner", "a folder keeps an owner"));
    }
    ctx.server.db.grant(&id, &target.id, body.role)?;
    ctx.server.role_changed(&id, &target.id, Some(body.role));
    ctx.audit(
        &format!("grant_{}", body.role.as_str()),
        Some(&target.id),
        Some(&id),
        true,
    );
    Ok(ok(json!(null)))
}

pub async fn remove_member(
    ctx: Ctx,
    Path((id, account)): Path<(String, String)>,
) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?;
    // An owner removes anyone; a member may leave.
    if account != who.account.id {
        crate::access::at_least(&ctx.server, who, &id, Role::Owner)?;
    } else {
        crate::access::role(&ctx.server, who, &id)?;
    }
    if last_owner(&ctx, &id, &account)? {
        return Err(ApiError::bad("last_owner", "a folder keeps an owner"));
    }
    ctx.server.db.revoke(&id, &account)?;
    ctx.server.role_changed(&id, &account, None);
    ctx.audit("revoke", Some(&account), Some(&id), true);
    Ok(ok(json!(null)))
}

/// Whether `account` is the folder's only owner.
fn last_owner(ctx: &Ctx, folder: &str, account: &str) -> ApiResult<bool> {
    let owners: Vec<_> = ctx
        .server
        .db
        .members(folder)?
        .into_iter()
        .filter(|(_, r)| *r == Role::Owner)
        .map(|(a, _)| a.id)
        .collect();
    Ok(owners.len() == 1 && owners[0] == account)
}

/// What the audit log says about a folder, for its owner (ADR 0074 item 9).
pub async fn audit(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    let who = ctx.person()?;
    crate::access::at_least(&ctx.server, who, &id, Role::Owner)?;
    Ok(ok(ctx.server.db.audit_log(Some(&id), 200)?))
}
