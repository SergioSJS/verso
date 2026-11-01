// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Opening a folder for a window, the capabilities it is told, and the
//! places its connection takes (split from `rpc.rs`, ADR 0067).

use std::sync::Arc;

use serde_json::{Value, json};
use verso_contract::{Can, Capabilities, ContractError, Host};
use verso_service::{lock, ops};

use crate::auth::{Via, Who};
use crate::db::{Folder, Role};
use crate::http::{ApiError, ApiResult, Ctx};
use crate::rpc::{blocking, role_here, to_value};
use crate::state::Server;

/// Open the folder for this window, or join its session.
pub(crate) async fn open(
    server: &Arc<Server>,
    client: &str,
    folder: Folder,
    role: Role,
    scope: Option<crate::scope::Scope>,
) -> Result<Value, ContractError> {
    let path = server
        .folder_path(&folder.dir)
        .ok_or_else(|| verso_service::failed("not a folder name"))?;
    // A transfer of the folder shown before goes with it.
    server.transfers.forget(client);
    // A window is at one folder's table (ADR 0107).
    crate::table::gone(server, client);
    let service = Arc::clone(&server.service);
    let c = client.to_owned();
    let gate = Arc::clone(
        lock(&server.opening)
            .entry(verso_core::folder_key(&path))
            .or_default(),
    );
    let info = blocking(move || {
        let key = verso_core::folder_key(&path);
        let _one = lock(&gate);
        if service.join(&c, &key) {
            return service
                .current_folder(&c)
                .ok_or_else(verso_service::no_folder);
        }
        let opened = service.open(&c, move |config| {
            let mut ws = verso_core::Workspace::open(&path, config)?;
            ws.set_links_inside(true);
            Ok(ws)
        })?;
        let (info, catch_up) = service.attach(&c, opened);
        if let Some(catch_up) = catch_up {
            let service = Arc::clone(&service);
            std::thread::spawn(move || service.catch_up(&catch_up));
        }
        Ok(info)
    })
    .await?;
    lock(&server.keys).insert(info.key.clone(), folder.id.clone());
    // What changed on the disk while nobody had it open joins the folder's
    // log for sync, in the background (ADR 0079 item 4).
    {
        let s = Arc::clone(server);
        let key = info.key.clone();
        tokio::task::spawn_blocking(move || crate::sync::reconcile_key(&s, &key, None, &[]));
    }
    let said = match &scope {
        Some(s) => {
            json!({ "folder": { "id": s.share, "name": s.name, "role": role, "share": true } })
        }
        None => json!({ "folder": { "id": folder.id, "name": folder.dir, "role": role } }),
    };
    // The game master of the table: the folder's owner on the folder
    // itself, whatever the credential (ADR 0113 item 6).
    let account = lock(&server.clients)
        .get(client)
        .map(|c| c.account.clone())
        .unwrap_or_default();
    let owner = scope.is_none()
        && server
            .db
            .role(&folder.id, &account)
            .ok()
            .flatten()
            .is_some_and(|r| r == Role::Owner);
    if let Some(c) = lock(&server.clients).get_mut(client) {
        c.folder = Some((folder.id.clone(), role));
        c.owner = owner;
        c.scope.clone_from(&scope);
        let _ = c.tx.send(&said);
    }
    record_space(server, client).await;
    let info = to_value(info)?;
    Ok(match &scope {
        Some(s) => {
            let counts = share_counts(server, client, s).await;
            tabled(server, client, s.info(info, counts)).await?
        }
        None => tabled(server, client, info).await?,
    })
}

/// The folder's summary as a player of a table is told it (ADR 0110).
pub(super) async fn tabled(
    server: &Arc<Server>,
    client: &str,
    mut info: Value,
) -> Result<Value, ContractError> {
    if info.is_null() {
        return Ok(info);
    }
    let (s, c) = (Arc::clone(server), client.to_owned());
    blocking(move || {
        crate::campaign_serve::tell_summary(&s, &c, &mut info);
        Ok(info)
    })
    .await
}

/// The share's own counts for the index's summary the window shows (ADR
/// 0081 item 11); none when the folder cannot be read now, and then the
/// summary says zero.
pub(super) async fn share_counts(
    server: &Arc<Server>,
    client: &str,
    scope: &crate::scope::Scope,
) -> Option<crate::scope::Counts> {
    let s = Arc::clone(server);
    let c = client.to_owned();
    let sc = scope.clone();
    blocking(move || s.service.with(&c, |ws| Ok(sc.counts(ws)?)))
        .await
        .ok()
}

/// Count the space of the window's folder and keep it for the pages that
/// list folders (ADR 0075 item 4).
pub(super) async fn record_space(server: &Arc<Server>, client: &str) {
    let Ok((folder, _)) = role_here(server, client) else {
        return;
    };
    let s = Arc::clone(server);
    let c = client.to_owned();
    let _ = tokio::task::spawn_blocking(move || {
        let Ok(space) = s.service.with(&c, ops::folder_space) else {
            return;
        };
        // With when it was counted: the console's "last change" (ADR 0077).
        let mut kept = serde_json::to_value(&space).unwrap_or_else(|_| json!({}));
        // Sync's record of the files follows every write as it happens;
        // the listing the count above walks only the watcher's batches.
        if let Ok(files) = s.db.manifest(&folder)
            && !files.is_empty()
        {
            let (mut notes, mut attachments) = (0_i64, 0_i64);
            for (path, k) in &files {
                if path.ends_with(".md") {
                    notes += k.size;
                } else {
                    attachments += k.size;
                }
            }
            kept["notes"] = json!(notes);
            kept["attachments"] = json!(attachments);
            kept["total"] = json!(notes + attachments);
            kept["files"] = json!(files.len());
        }
        kept["at"] = json!(crate::db::now());
        if let Err(e) =
            s.db.set_setting(&format!("space:{folder}"), &kept.to_string())
        {
            crate::log::error(&format!("keeping a folder's space: {e}"));
        }
        // Whole bytes: the space is counted in f64 by the contract.
        crate::quota::warn(
            &s,
            &folder,
            kept["total"].as_u64().unwrap_or(space.total as u64),
        );
    })
    .await;
}

pub(super) fn capabilities(server: &Server, who: &Who, client: &str) -> Capabilities {
    let mut can = vec![Can::Account, Can::Collab];
    // A server serves folders, never one file (ADR 0114 item 19).
    can.extend_from_slice(Can::FOLDER);
    // Who the person is here, and what the ceiling of the credential is:
    // the rules' answer (ADR 0113), the window's one source.
    let door = crate::access::Door::of(server, who, client).ok();
    // `Can::Write` is the folder-wide "may change the folder" the hosts
    // without a server also give; the person's place is `access`.
    if door.as_ref().is_some_and(crate::access::Door::writes_here) {
        can.push(Can::Write);
    }
    if who.account.admin && !matches!(who.via, Via::Token { .. }) {
        can.push(Can::Admin);
    }
    Capabilities {
        host: Host::Server,
        can,
        latency_ms: None,
        access: door.map(|d| d.folder_access()),
    }
}

/// What a connection holds while it lasts: its places, and a phone's.
type Held = (Vec<crate::fair::Held>, Option<crate::local::PhoneGuard>);

/// The connection's places among its account's and its address's
/// (threat-model.md, gap 4), or 429; and whether it is a phone refused by
/// the ceiling of phones connected (the number it is), to be closed with
/// `PHONES_FULL`.
pub(crate) fn places(ctx: &Ctx, who: &Who) -> ApiResult<(Held, Option<u32>)> {
    let counts = &ctx.server.fair.connections;
    let too_many = |what: &str, most: u32| {
        crate::log::warn(&format!(
            "a connection refused: {what} holds {most} already"
        ));
        ApiError {
            retry: Some(30),
            ..ApiError::new(
                axum::http::StatusCode::TOO_MANY_REQUESTS,
                "too_many",
                format!("too many connections at once ({most} at most)"),
            )
        }
    };
    let account = format!("account:{}", who.account.id);
    let mut held = vec![
        counts
            .take(&account, crate::fair::PER_ACCOUNT)
            .ok_or_else(|| {
                too_many(
                    &format!("account {}", who.account.id),
                    crate::fair::PER_ACCOUNT,
                )
            })?,
    ];
    // This machine is the proxy in front, speaking for everyone.
    if !ctx.peer.local {
        let address = format!("address:{}", ctx.peer.key());
        held.push(
            counts
                .take(&address, crate::fair::PER_ADDRESS)
                .ok_or_else(|| {
                    too_many(
                        &format!("address {}", ctx.peer.key()),
                        crate::fair::PER_ADDRESS,
                    )
                })?,
        );
    }
    // "This app is a server": at most two phones connected at once (ADR
    // 0096 item 13). A phone already connected opens another connection
    // (a second tab) without taking another place.
    let phone = match (&ctx.server.local, who.phone, who.session()) {
        (Some(local), Some(_), Some(session)) => {
            let name = local.name_of(&ctx.server, session);
            let Some(guard) = local.enter(session, &name) else {
                local.refused_full(&ctx.server, session, &name);
                return Ok(((held, None), Some(local.connected_most())));
            };
            local.first_seen(&ctx.server, session);
            Some(guard)
        }
        _ => None,
    };
    Ok(((held, phone), None))
}
