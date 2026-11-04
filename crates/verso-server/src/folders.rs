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

/// The folders the person may enter — their own, the ones others own and
/// the shares given to them, each with its owner (ADR 0081 item 5) — and,
/// for an owner, the shares of their folders ("Shared by me").
pub async fn mine(ctx: Ctx) -> ApiResult<Response> {
    let who = ctx.who()?;
    let (folders, by_me) = crate::shares::listing(&ctx, who)?;
    Ok(ok(
        json!({ "folders": folders, "mayCreate": who.account.may_create, "byMe": by_me }),
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
    let root_for_error = root.clone();
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
            // A directory the server cannot write is said in words, to an
            // admin with the way to mend it (ADR 0075 item 3, amended
            // 2026-10-16); decided on the error's kind, here, where it is made.
            _ if crate::storage::is_refusal(&e) => {
                crate::storage::api_error(&root_for_error, who.account.admin)
            }
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
    // A fresh proof first (ADR 0083 item 6): a role given is a power given.
    ctx.proved()?;
    crate::access::at_least(&ctx.server, who, &id, Role::Owner)?;
    grant_whole(&ctx, &id, &account, body.role)?;
    Ok(ok(json!(null)))
}

/// An account named by id or by e-mail. None: the server's admin is told
/// they may make an invitation link for it (`shares::invite`; ADR 0081
/// item 4: only the admin invites a person who has no account).
pub(crate) fn named(ctx: &Ctx, account: &str) -> ApiResult<crate::db::Account> {
    match ctx.server.db.account(account)? {
        Some(a) => Ok(a),
        None => ctx.server.db.account_by_email(account)?.ok_or_else(|| {
            if ctx.admin().is_ok() {
                ApiError::bad(
                    "no_account",
                    "no account has that e-mail: make an invitation link for them",
                )
            } else {
                ApiError::bad("no_account", "no account has that e-mail: invite them")
            }
        }),
    }
}

/// The whole folder granted to `account` in `role`, the owner already
/// checked: the share of the root (ADR 0081 item 1).
pub(crate) fn grant_whole(ctx: &Ctx, id: &str, account: &str, role: Role) -> ApiResult<()> {
    let target = named(ctx, account)?;
    if role != Role::Owner && last_owner(ctx, id, &target.id)? {
        return Err(ApiError::bad("last_owner", "a folder keeps an owner"));
    }
    let new = ctx.server.db.role(id, &target.id)?.is_none();
    ctx.server.db.grant(id, &target.id, role)?;
    ctx.server
        .role_changed(id, &target.id, Some(role), "revoked");
    if new && let Some(folder) = ctx.server.db.folder(id)? {
        crate::shares::given(
            ctx,
            &target.id,
            verso_contract::ShareGiven {
                id: folder.id,
                name: folder.dir,
                role: role.as_str().to_owned(),
                by: String::new(),
                share: false,
                server: None,
            },
        );
    }
    ctx.audit(
        &format!("grant_{}", role.as_str()),
        Some(&target.id),
        Some(id),
        true,
    );
    Ok(())
}

pub async fn remove_member(
    ctx: Ctx,
    Path((id, account)): Path<(String, String)>,
) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?;
    // Named by id or by e-mail, as granting is.
    let named = match ctx.server.db.account(&account)? {
        Some(a) => Some(a.id),
        None => ctx.server.db.account_by_email(&account)?.map(|a| a.id),
    };
    // An owner removes anyone; a member may leave.
    if named.as_deref() != Some(who.account.id.as_str()) {
        crate::access::at_least(&ctx.server, who, &id, Role::Owner)?;
    } else {
        crate::access::role(&ctx.server, who, &id)?;
    }
    revoke_whole(&ctx, &id, named)?;
    Ok(ok(json!(null)))
}

/// `account` out of the whole folder, who may do it already checked.
pub(crate) fn revoke_whole(ctx: &Ctx, id: &str, account: Option<String>) -> ApiResult<()> {
    // One that is not a member is said, never answered as done.
    let account = match account {
        Some(a) if ctx.server.db.role(id, &a)?.is_some() => a,
        _ => {
            return Err(ApiError::new(
                axum::http::StatusCode::NOT_FOUND,
                "not_member",
                "that account is not a member of this folder",
            ));
        }
    };
    if last_owner(ctx, id, &account)? {
        return Err(ApiError::bad("last_owner", "a folder keeps an owner"));
    }
    ctx.server.db.revoke(id, &account)?;
    // A member who left is told so, not that an owner took them out.
    let left = ctx.who.as_ref().is_some_and(|w| w.account.id == account);
    let why = if left { "left" } else { "revoked" };
    ctx.server.role_changed(id, &account, None, why);
    ctx.audit("revoke", Some(&account), Some(id), true);
    Ok(())
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
