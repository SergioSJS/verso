// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sharing a folder inside a folder (ADR 0081): what an id opens — a
//! folder, or a share of one — and in which role; the owner's share
//! dialog (who has access, in which role, add, change, remove, the
//! attachments folder); the windows told at once when a share changes; a
//! share carried by a rename made through the server, and gone with its
//! folder (item 13).

use std::sync::Arc;

use axum::Json;
use axum::extract::Path;
use axum::response::Response;
use serde::Deserialize;
use serde_json::{Value, json};
use verso_contract::{ContractError, ShareGiven};
use verso_service::lock;

use crate::auth::Who;
use crate::db::{Folder, Role, Share, covers};
use crate::http::{ApiError, ApiResult, Ctx, ok};
use crate::scope::{Scope, last, share_key};
use crate::state::Server;

/// What an id names to the person who asks.
pub enum Opening {
    Folder(Folder, Role),
    Share(Folder, Scope, Role),
}

/// The name of a folder's owner, as a share is named after it (item 3).
fn owner_of(server: &Server, folder: &str) -> Result<Option<crate::db::Account>, String> {
    Ok(server
        .db
        .members(folder)?
        .into_iter()
        .find(|(_, r)| *r == Role::Owner)
        .map(|(a, _)| a))
}

/// How `account` sees `share`, when it is one of its people: the scope and
/// the role — the highest of its grants covering the shared folder, never
/// owner, and only reading when its credential only reads.
pub fn scope_for(
    server: &Server,
    account: &str,
    share: &Share,
    writes: bool,
) -> Result<Option<(Folder, Scope, Role)>, String> {
    if server.db.share_role(&share.id, account)?.is_none() {
        return Ok(None);
    }
    let Some(folder) = server.db.folder(&share.folder)? else {
        return Ok(None);
    };
    let role = server
        .db
        .role_at(&folder.id, account, &share.path)?
        .unwrap_or(Role::Reader)
        .min(Role::Editor);
    let role = if writes { role } else { role.min(Role::Reader) };
    // A folder chosen inside one served by "this app is a server" is named
    // as it is on the computer, with no owner in brackets: its owner is
    // the phone's own computer (ADR 0096 item 2, amended 2026-10-16).
    let name = match server.local.as_ref().and_then(|p| p.part_name(&share.id)) {
        Some(name) => name,
        None => {
            let owner = owner_of(server, &folder.id)?.map_or_else(|| "?".to_owned(), |a| a.name);
            format!("{} ({owner})", last(&share.path))
        }
    };
    // What a phone is kept from under a folder chosen inside one this
    // computer serves: links that lead out of it.
    let guard = match (&server.local, server.folder_path(&folder.dir)) {
        (Some(p), Some(vault)) if p.part_name(&share.id).is_some() => {
            let _ = p;
            Some(Arc::new(crate::scope::Guard::phone(vault)))
        }
        _ => None,
    };
    let scope = Scope {
        share: share.id.clone(),
        key: share_key(&share.id),
        name,
        root: share.path.clone(),
        mount: share
            .attachments
            .as_ref()
            .map(|a| (last(a).to_owned(), a.clone())),
        guard,
    };
    Ok(Some((folder, scope, role)))
}

/// What `id` opens for `who`: a folder it is a member of, or a share it is
/// one of the people of; 404 otherwise — a share one may not see does not
/// exist, to them.
pub fn opening(server: &Server, who: &Who, id: &str) -> ApiResult<Opening> {
    if server.db.folder(id)?.is_some() {
        let (folder, role) = crate::access::role(server, who, id)?;
        // A closed table keeps its players out (ADR 0110 item 3, MC.1 = A).
        let master = crate::campaign::is_master(server, &folder.id, &who.account.id);
        if crate::campaign::closed_for(server, &folder.id, "", !master) {
            return Err(ApiError::forbidden(crate::campaign::CLOSED));
        }
        return Ok(Opening::Folder(folder, role));
    }
    let (reaches, writes) = who.reaches(id);
    let share = server.db.share(id)?.ok_or_else(ApiError::not_found)?;
    if !reaches {
        return Err(ApiError::not_found());
    }
    let (folder, scope, role) =
        scope_for(server, &who.account.id, &share, writes)?.ok_or_else(ApiError::not_found)?;
    // A share is always a player's place, an editor's as a reader's.
    if crate::campaign::closed_for(server, &folder.id, &scope.root, true) {
        return Err(ApiError::forbidden(crate::campaign::CLOSED));
    }
    Ok(Opening::Share(folder, scope, role))
}

/// The windows on shares of `folder` learn what changed at once: a new
/// role, a share gone (they leave it), a share moved (their paths follow).
/// `why` is said with a share gone (`gone: folder, reason`): `revoked` when
/// its owner took the person out or removed the share, `deleted` when the
/// shared folder went — a device that syncs it turns its sync off on the
/// first, with a notice (ADR 0081 item 8).
pub fn refresh(server: &Server, folder: &str, why: &str) {
    let open: Vec<(String, String, String, bool)> = lock(&server.clients)
        .iter()
        .filter_map(|(id, c)| {
            let scope = c.scope.as_ref()?;
            c.folder.as_ref().filter(|(f, _)| f == folder)?;
            // A read link's page is no share's: its link is looked at
            // again before each of its commands (`visit`).
            if scope.guard.as_ref().is_some_and(|g| g.public) {
                return None;
            }
            Some((
                id.clone(),
                c.account.clone(),
                scope.share.clone(),
                c.token_write,
            ))
        })
        .collect();
    if open.is_empty() {
        return;
    }
    let found: Vec<(String, Option<(Scope, Role)>)> = open
        .into_iter()
        .map(|(client, account, share, writes)| {
            let now = server
                .db
                .share(&share)
                .ok()
                .flatten()
                .and_then(|s| scope_for(server, &account, &s, writes).ok().flatten())
                .map(|(_, scope, role)| (scope, role));
            (client, now)
        })
        .collect();
    let mut gone = Vec::new();
    let mut demoted = Vec::new();
    // The shares the windows were on, for the board shadows made of an
    // older one (`collab_players::share_moved`).
    let mut moved: Vec<String> = Vec::new();
    {
        let mut table = lock(&server.clients);
        for (client, now) in found {
            if let Some(c) = table.get(&client)
                && let Some(old) = &c.scope
                && !moved.contains(&old.share)
            {
                moved.push(old.share.clone());
            }
            let Some(c) = table.get_mut(&client) else {
                continue;
            };
            match now {
                Some((scope, role)) => {
                    let changed = c.folder.as_ref().map(|(_, r)| *r) != Some(role);
                    c.folder = Some((folder.to_owned(), role));
                    c.owner = false;
                    c.scope = Some(scope);
                    if changed {
                        c.tx.send(&json!({ "role": role }));
                        if !role.writes() {
                            demoted.push(client);
                        }
                    }
                }
                None => {
                    c.folder = None;
                    c.scope = None;
                    c.tx.send(&json!({ "gone": "folder", "reason": why }));
                    gone.push(client);
                }
            }
        }
    }
    server.left(&gone);
    for share in &moved {
        let row = server.db.share(share).ok().flatten();
        let now = |account: &str| {
            let row = row.as_ref()?;
            let (_, scope, _) = scope_for(server, account, row, false).ok().flatten()?;
            Some(scope)
        };
        crate::collab::players::share_moved(server, share, &now);
    }
    // One who may now only read leaves the rooms it wrote in (ADR 0087).
    for client in demoted {
        crate::collab::readers::demoted(server, &client);
    }
}

/// Before a command of a window on a share: the share looked at again, so
/// that a revocation or a move holds from the next command whatever the
/// push did (item 8). `Err` when the window may no longer see it.
pub fn check(server: &Server, who: &Who, client: &str) -> Result<(), ContractError> {
    let share = lock(&server.clients)
        .get(client)
        .and_then(|c| c.scope.as_ref().map(|s| s.share.clone()));
    let Some(share) = share else {
        return Ok(());
    };
    let (reaches, writes) = who.reaches(&share);
    let now = if reaches {
        server
            .db
            .share(&share)
            .map_err(verso_service::failed)?
            .map(|s| scope_for(server, &who.account.id, &s, writes))
            .transpose()
            .map_err(verso_service::failed)?
            .flatten()
    } else {
        None
    };
    // Gone: revoked when the share is still there, deleted otherwise.
    let why = if now.is_none() && matches!(server.db.share(&share), Ok(None)) {
        "deleted"
    } else {
        "revoked"
    };
    let mut table = lock(&server.clients);
    let Some(c) = table.get_mut(client) else {
        return Err(verso_service::no_folder());
    };
    match now {
        Some((folder, scope, role)) => {
            c.folder = Some((folder.id, role));
            c.owner = false;
            c.scope = Some(scope);
            Ok(())
        }
        None => {
            c.folder = None;
            c.scope = None;
            c.tx.send(&json!({ "gone": "folder", "reason": why }));
            drop(table);
            server.left(&[client.to_owned()]);
            Err(verso_service::no_folder())
        }
    }
}

/// The share a window opened, if it opened one.
#[must_use]
pub fn scope_here(server: &Server, client: &str) -> Option<Scope> {
    lock(&server.clients)
        .get(client)
        .and_then(|c| c.scope.clone())
}

/// Whether `path` is a folder of `folder` now: the open folder's own
/// listing, else the files sync last saw under it.
fn exists_folder(server: &Server, folder: &Folder, path: &str) -> ApiResult<bool> {
    let key = crate::access::key(server, folder)?;
    let p = path.to_owned();
    if let Ok(found) = server
        .service
        .with_key(&key, move |ws| Ok(ws.is_folder(&p)))
    {
        return Ok(found);
    }
    // Served from this computer, a folder is opened by the first phone
    // that asks: until then the folders chosen inside it are the ones the
    // start found on the disk (ADR 0096 item 2, amended 2026-10-16).
    if server.local.is_some() {
        return Ok(server
            .folder_path(&folder.dir)
            .is_some_and(|vault| verso_fs::is_folder(&vault, path)));
    }
    let inside = format!("{path}/");
    Ok(server
        .db
        .manifest_paths(&folder.id)?
        .iter()
        .any(|f| f.starts_with(&inside)))
}

/// A path the owner names for a share: a folder inside the folder, not
/// hidden (no part starting with `.`), not the root.
pub(crate) fn share_path(path: &str) -> ApiResult<()> {
    if path.is_empty()
        || crate::scope::checked(path).is_err()
        || path.split('/').any(|p| p.starts_with('.'))
    {
        return Err(ApiError::bad("bad_path", "not a folder inside this folder"));
    }
    Ok(())
}

fn person_json(a: &crate::db::Account, role: Role) -> Value {
    json!({ "id": a.id, "name": a.name, "email": a.email, "role": role })
}

/// A share as its owner sees it; the root's is the whole folder's members.
fn share_json(server: &Server, folder: &Folder, path: &str) -> ApiResult<Value> {
    if path.is_empty() {
        let people: Vec<Value> = server
            .db
            .members(&folder.id)?
            .iter()
            .map(|(a, r)| person_json(a, *r))
            .collect();
        return Ok(
            json!({ "id": null, "path": "", "people": people, "attachments": null, "missing": false }),
        );
    }
    let Some(share) = server.db.share_at(&folder.id, path)? else {
        return Ok(
            json!({ "id": null, "path": path, "people": [], "attachments": null, "missing": false }),
        );
    };
    of_share(server, folder, &share)
}

fn of_share(server: &Server, folder: &Folder, share: &Share) -> ApiResult<Value> {
    let people: Vec<Value> = server
        .db
        .share_people(&share.id)?
        .iter()
        .map(|(a, r)| person_json(a, *r))
        .collect();
    Ok(json!({
        "id": share.id,
        "path": share.path,
        "people": people,
        "attachments": share.attachments,
        "missing": !exists_folder(server, folder, &share.path)?,
    }))
}

/// The folders `who` may enter, for the lists of item 5: its own, the
/// whole folders others own ("Shared with me", with the owner), and the
/// shares given to it; and the shares of its own folders ("Shared by me").
pub fn listing(ctx: &Ctx, who: &Who) -> ApiResult<(Vec<Value>, Vec<Value>)> {
    let server = &ctx.server;
    let mut folders = Vec::new();
    let mut by_me = Vec::new();
    let person = !matches!(who.via, crate::auth::Via::Token { .. });
    for (f, role) in server.db.folders_of(&who.account.id)? {
        if !who.reaches(&f.id).0 {
            continue;
        }
        let owner = if role == Role::Owner {
            Value::Null
        } else {
            owner_of(server, &f.id)?
                .map_or(Value::Null, |a| json!({ "name": a.name, "email": a.email }))
        };
        // The folder's bytes count its secret blocks' (ADR 0087): one who
        // only reads it is not told them, as a share's receiver is not.
        let space = if role.writes() && who.reaches(&f.id).1 {
            crate::folders::space(ctx, &f.id)
        } else {
            Value::Null
        };
        folders.push(json!({
            "id": f.id, "name": f.dir, "role": role, "space": space,
            "owner": owner, "share": false,
        }));
        if role == Role::Owner && person {
            for s in server.db.shares_of(&f.id)? {
                let mut row = of_share(server, &f, &s)?;
                row["folder"] = json!(f.id);
                row["folderName"] = json!(f.dir);
                by_me.push(row);
            }
        }
    }
    for (share, _, _) in server.db.shares_with(&who.account.id)? {
        let (reaches, writes) = who.reaches(&share.id);
        if !reaches {
            continue;
        }
        let Some((folder, scope, role)) = scope_for(server, &who.account.id, &share, writes)?
        else {
            continue;
        };
        // A folder chosen inside one this computer serves is the phone's own:
        // it has no owner to name (ADR 0096 item 2, amended 2026-10-16).
        let owner = if server
            .local
            .as_ref()
            .is_some_and(|p| p.part_name(&share.id).is_some())
        {
            Value::Null
        } else {
            owner_of(server, &folder.id)?
                .map_or(Value::Null, |a| json!({ "name": a.name, "email": a.email }))
        };
        folders.push(json!({
            "id": share.id, "name": scope.name, "role": role, "space": null,
            "owner": owner, "share": true,
            "missing": !exists_folder(server, &folder, &share.path)?,
        }));
    }
    Ok((folders, by_me))
}

fn audit(ctx: &Ctx, action: &str, subject: Option<&str>, folder: &str, path: &str) {
    let actor = ctx.who.as_ref().map(|w| w.account.id.clone());
    let address = ctx.address();
    if let Err(e) = ctx.server.db.audit_share(
        &crate::db::Audit {
            actor: actor.as_deref(),
            action,
            subject,
            folder: Some(folder),
            address: Some(&address),
            ok: true,
        },
        path,
    ) {
        crate::log::error(&format!("audit log: {e}"));
    }
}

/// The owner, and the folder.
fn owned(ctx: &Ctx, id: &str) -> ApiResult<Folder> {
    let who = ctx.person()?;
    Ok(crate::access::at_least(&ctx.server, who, id, Role::Owner)?.0)
}

/// Every share of a folder and its members, for its owner (item 7).
pub async fn list(ctx: Ctx, Path(id): Path<String>) -> ApiResult<Response> {
    let folder = owned(&ctx, &id)?;
    let mut shares = Vec::new();
    for s in ctx.server.db.shares_of(&folder.id)? {
        shares.push(of_share(&ctx.server, &folder, &s)?);
    }
    Ok(ok(json!({
        "root": share_json(&ctx.server, &folder, "")?,
        "shares": shares,
    })))
}

#[derive(Deserialize)]
pub struct Grant {
    path: String,
    email: String,
    role: Role,
}

/// The owner shares a folder of theirs with a person, or changes their
/// role: by e-mail of an account of this server (item 4). The root is the
/// whole folder's members.
pub async fn grant(
    ctx: Ctx,
    Path(id): Path<String>,
    Json(body): Json<Grant>,
) -> ApiResult<Response> {
    ctx.changes()?;
    // A fresh proof first (ADR 0083 item 6): the members' route by
    // another door, and a share's role a power given as well.
    ctx.proved()?;
    let folder = owned(&ctx, &id)?;
    if body.path.is_empty() {
        crate::folders::grant_whole(&ctx, &folder.id, &body.email, body.role)?;
        return Ok(ok(share_json(&ctx.server, &folder, "")?));
    }
    share_path(&body.path)?;
    if !exists_folder(&ctx.server, &folder, &body.path)? {
        return Err(ApiError::new(
            axum::http::StatusCode::NOT_FOUND,
            "no_folder",
            "no folder there",
        ));
    }
    let target = crate::folders::named(&ctx, &body.email)?;
    if ctx.server.db.role(&folder.id, &target.id)? == Some(Role::Owner) {
        return Err(ApiError::bad(
            "owner",
            "an owner reaches the whole folder already",
        ));
    }
    let role = body.role.min(Role::Editor);
    let share = ctx.server.db.make_share(&folder.id, &body.path)?;
    let new = ctx.server.db.share_role(&share.id, &target.id)?.is_none();
    ctx.server.db.grant_share(&share.id, &target.id, role)?;
    audit(
        &ctx,
        &format!("share_{}", role.as_str()),
        Some(&target.id),
        &folder.id,
        &share.path,
    );
    refresh(&ctx.server, &folder.id, "revoked");
    if new {
        given(
            &ctx,
            &target.id,
            ShareGiven {
                id: share.id.clone(),
                name: last(&share.path).to_owned(),
                role: role.as_str().to_owned(),
                by: String::new(),
                share: true,
                server: None,
            },
        );
    }
    Ok(ok(of_share(&ctx.server, &folder, &share)?))
}

/// A folder given to `account`, which had no access to it before (ADR 0084
/// item 7): the account's windows and devices hear it at once, with who
/// gave it — the person acting — so that a window can say it. A role
/// changed later is not said here.
pub(crate) fn given(ctx: &Ctx, account: &str, what: ShareGiven) {
    let Some(by) = ctx.who.as_ref().map(|w| w.account.name.clone()) else {
        return;
    };
    let Ok(payload) = serde_json::to_value(ShareGiven { by, ..what }) else {
        return;
    };
    ctx.server.push_sessions(
        account,
        &json!({ "event": "share-given", "payload": payload }),
    );
}

#[derive(Deserialize)]
pub struct Revoke {
    path: String,
    /// The person, by id or e-mail; none for the whole share.
    account: Option<String>,
}

/// The owner takes a person out of a share, or removes the share (item 8):
/// their windows are told at once.
pub async fn revoke(
    ctx: Ctx,
    Path(id): Path<String>,
    Json(body): Json<Revoke>,
) -> ApiResult<Response> {
    ctx.changes()?;
    let folder = owned(&ctx, &id)?;
    if body.path.is_empty() {
        let account = match body.account.as_deref() {
            Some(a) => Some(crate::folders::named(&ctx, a)?.id),
            None => None,
        };
        crate::folders::revoke_whole(&ctx, &folder.id, account)?;
        return Ok(ok(share_json(&ctx.server, &folder, "")?));
    }
    let share = ctx
        .server
        .db
        .share_at(&folder.id, &body.path)?
        .ok_or_else(ApiError::not_found)?;
    match body.account.as_deref() {
        Some(a) => {
            let target = crate::folders::named(&ctx, a)?;
            if !ctx.server.db.revoke_share(&share.id, &target.id)? {
                return Err(ApiError::new(
                    axum::http::StatusCode::NOT_FOUND,
                    "not_member",
                    "that account is not in this share",
                ));
            }
            audit(
                &ctx,
                "share_revoke",
                Some(&target.id),
                &folder.id,
                &share.path,
            );
        }
        None => {
            ctx.server.db.delete_share(&share.id)?;
            audit(
                &ctx,
                "share_removed",
                Some(&share.id),
                &folder.id,
                &share.path,
            );
        }
    }
    refresh(&ctx.server, &folder.id, "revoked");
    Ok(ok(share_json(&ctx.server, &folder, &body.path)?))
}

#[derive(Deserialize)]
pub struct Attachments {
    path: String,
    /// The attachments folder, or none to stop showing it.
    attachments: Option<String>,
}

/// The owner adds the folder of the attachments the shared notes embed to
/// the share, read-only, or takes it away (item 11, decided 2026-10-10).
pub async fn attachments(
    ctx: Ctx,
    Path(id): Path<String>,
    Json(body): Json<Attachments>,
) -> ApiResult<Response> {
    ctx.changes()?;
    let folder = owned(&ctx, &id)?;
    let share = ctx
        .server
        .db
        .share_at(&folder.id, &body.path)?
        .ok_or_else(ApiError::not_found)?;
    if let Some(a) = body.attachments.as_deref() {
        share_path(a)?;
        if covers(a, &share.path) || covers(&share.path, a) {
            return Err(ApiError::bad(
                "bad_path",
                "the attachments folder is outside the shared folder",
            ));
        }
        if !exists_folder(&ctx.server, &folder, a)? {
            return Err(ApiError::new(
                axum::http::StatusCode::NOT_FOUND,
                "no_folder",
                "no folder there",
            ));
        }
        // Shown at the share's root under its name: not over a folder of
        // the share of that name.
        if exists_folder(&ctx.server, &folder, &format!("{}/{}", share.path, last(a)))? {
            return Err(ApiError::bad(
                "name_taken",
                "the shared folder has a folder of that name",
            ));
        }
    }
    ctx.server
        .db
        .set_share_attachments(&share.id, body.attachments.as_deref())?;
    audit(
        &ctx,
        if body.attachments.is_some() {
            "share_attachments"
        } else {
            "share_attachments_removed"
        },
        body.attachments.as_deref(),
        &folder.id,
        &share.path,
    );
    refresh(&ctx.server, &folder.id, "revoked");
    let now = ctx
        .server
        .db
        .share(&share.id)?
        .ok_or_else(ApiError::not_found)?;
    Ok(ok(of_share(&ctx.server, &folder, &now)?))
}

/// What follows a rename, a move or a deletion through the server — a
/// window's or a device's — in the write's own session, before anyone
/// reads the folder again (the audit of 2026-11-05): the state a table
/// keeps of its notes (ADR 0110, 0113 K.2) and the read links of what
/// moved or went (ADR 0105 item 9). Both are the database's alone.
pub fn followed(server: &Server, folder: &str, cmd: &str, args: &Value, answer: &Value) {
    crate::campaign_cmds::after_write(server, folder, cmd, args, answer);
    crate::readlinks::after_write(server, folder, cmd, args, answer);
    carried(server, folder, cmd, args, answer);
}

/// What a write through the server does to the shares of `folder` (item
/// 13): a rename or a move carries the shares of what moved; a deletion
/// removes the shares of what it deleted. `args` and `answer` are in the
/// owner's paths. In the write's session ([`followed`]): a window on a
/// share looks at its share again before each command ([`check`]), so
/// from then on it reaches the shared folder where it is now, never what
/// is made at the old place.
fn carried(server: &Server, folder: &str, cmd: &str, args: &Value, answer: &Value) {
    let mut moves: Vec<(String, String)> = Vec::new();
    match cmd {
        "rename_entry" | "rename_note" => {
            if let (Some(from), Some(to)) = (args["from"].as_str(), answer["path"].as_str()) {
                moves.push((from.to_owned(), to.to_owned()));
            }
        }
        "move_entries" => {
            for m in answer["moved"].as_array().into_iter().flatten() {
                if let (Some(from), Some(to)) = (m["from"].as_str(), m["to"].as_str()) {
                    moves.push((from.to_owned(), to.to_owned()));
                }
            }
        }
        "delete_entry" | "delete_note" => {
            if let Some(path) = args["path"].as_str()
                && let Err(e) = server.db.drop_shares_under(folder, path)
            {
                crate::log::error(&format!("removing a share: {e}"));
            }
            return;
        }
        _ => return,
    }
    for (from, to) in moves {
        match server.db.move_shares(folder, &from, &to) {
            Ok(ids) => {
                for id in ids {
                    let _ = server.db.audit_share(
                        &crate::db::Audit {
                            actor: None,
                            action: "share_moved",
                            subject: Some(&id),
                            folder: Some(folder),
                            address: None,
                            ok: true,
                        },
                        &to,
                    );
                }
            }
            Err(e) => crate::log::error(&format!("carrying a share: {e}")),
        }
    }
}

/// After a rename, a move or a deletion through the server, the session
/// free: the windows on the shares of `folder` learn at once what changed
/// ([`refresh`]) — a share moved, or gone with its folder. What they reach
/// followed already ([`followed`]).
pub fn after_write(server: &Server, folder: &str, cmd: &str) {
    if matches!(
        cmd,
        "rename_entry" | "rename_note" | "move_entries" | "delete_entry" | "delete_note"
    ) {
        refresh(server, folder, "deleted");
    }
}

/// A device deleted `path`, and the server pruned the folders it left
/// empty (`prune_empty_parents`), in the deletion's session: a shared
/// folder gone that way goes with its shares, as a window's deletion of
/// the folder does (item 13). Whether any went: the windows on them are
/// then told ([`refresh`]), the session free.
pub fn device_deleted(
    server: &Server,
    ws: &mut verso_core::Workspace,
    folder: &str,
    path: &str,
) -> bool {
    let Ok(shares) = server.db.shares_of(folder) else {
        return false;
    };
    let mut gone = false;
    for s in shares {
        if !covers(&s.path, path) || ws.is_folder(&s.path) {
            continue;
        }
        match server.db.drop_shares_under(folder, &s.path) {
            Ok(ids) => gone |= !ids.is_empty(),
            Err(e) => crate::log::error(&format!("removing a share: {e}")),
        }
    }
    gone
}

/// A device's sync renamed `from` to `to`: sync moves files, one at a
/// time, so a shared folder moved on a computer arrives as its files, and
/// the share follows once the folder it named is empty and gone — to
/// where its files went.
pub fn synced_rename(server: &Server, folder: &Folder, from: &str, to: &str) {
    let Ok(shares) = server.db.shares_of(&folder.id) else {
        return;
    };
    for s in shares {
        if !covers(&s.path, from) || from == s.path {
            continue;
        }
        let rest = &from[s.path.len()..];
        let Some(new_root) = to.strip_suffix(rest).filter(|r| !r.is_empty()) else {
            continue;
        };
        if new_root == s.path || exists_folder(server, folder, &s.path).unwrap_or(true) {
            continue;
        }
        if let Ok(ids) = server.db.move_shares(&folder.id, &s.path, new_root)
            && !ids.is_empty()
        {
            refresh(server, &folder.id, "deleted");
        }
    }
}
