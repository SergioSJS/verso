// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! An account that already exists accepts an invitation (ADR 0074 item 4,
//! the 2026-10-23 addition): signed in, it takes the folder, the share or
//! the table the link carries; no account is made.

use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::Response;
use serde_json::json;

use crate::api::limited;
use crate::db::{self, Role};
use crate::http::{ApiError, ApiResult, Ctx, ok};

/// The signed-in account joins through the link: the same grant a new
/// account would get, the link used by it. What it already has is never
/// lowered; an invitation made for an e-mail is for that account only.
pub async fn join(ctx: Ctx, Path(token): Path<String>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?;
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
    if let Some(email) = &link.email
        && db::fold_email(email) != db::fold_email(&who.account.email)
    {
        ctx.server.limiter.failed(&key);
        ctx.audit(
            "invitation_refused",
            Some(&link.id),
            link.folder.as_deref(),
            false,
        );
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "wrong_account",
            "this invitation is for another e-mail: sign out and sign in with it",
        ));
    }
    let account = who.account.id.clone();
    if !ctx.server.db.use_invitation(&link.id, &account)? {
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
                // Someone who holds the whole folder already sees the table
                // in it; the share is not listed beside it, so the window
                // opens the folder.
                opens = Some(if ctx.server.db.role(folder, &account)?.is_some() {
                    folder.clone()
                } else {
                    share.clone()
                });
                let now = ctx.server.db.share_role(share, &account)?;
                ctx.server
                    .db
                    .grant_share(share, &account, now.map_or(role, |n| n.max(role)))?;
            }
            Some(_) => {}
            None if link.for_share => {}
            None => {
                let now = ctx.server.db.role(folder, &account)?;
                let kept = now.map_or(role, |n| n.max(role));
                opens = Some(folder.clone());
                ctx.server.db.grant(folder, &account, kept)?;
                ctx.server
                    .role_changed(folder, &account, Some(kept), "revoked");
            }
        }
    }
    ctx.audit(
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
    // `open`: what the window shows next, the folder or share just joined
    // (a folder's id, or a share's), so the person lands at the table.
    Ok(ok(json!({ "folder": link.folder, "open": opens })))
}
