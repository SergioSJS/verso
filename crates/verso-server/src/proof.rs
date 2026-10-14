// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A fresh proof before a sensitive action (ADR 0083 item 6, F15; "sudo
//! mode"). A session keeps when it last proved who it is (`db/proof.rs`):
//! its sign-in, or `POST /api/me/prove` with the password or a passkey's
//! answer. A sensitive route — a token made, a passkey added or removed, a
//! device approved, the password changed, and the admin's deleting an
//! account, changing its powers, ending its sessions or entering a folder —
//! answers 403 `prove_first` when that was more than [`PROVE_WITHIN`] ago,
//! and the window asks on the spot and sends the request again.
//!
//! The source is public, so the proof is no cheaper door than the sign-in:
//! a wrong password here takes the sign-in's own keys of delay (`in:` the
//! address, `in:` the account), waits the server's turn, costs an Argon2id
//! hash, and is said in the log and counted against the account as a
//! refused sign-in is (ADR 0083 items 1 and 2) — a stolen cookie guesses no
//! faster through `/prove` than a stranger through `/signin`, and the two
//! share one count. The mark is the server's alone; `prove_first` says
//! nothing of the request it refused.

use axum::Json;
use axum::http::StatusCode;
use axum::response::Response;
use serde::Deserialize;
use serde_json::json;
use webauthn_rs::prelude::PublicKeyCredential;

use crate::auth::Who;
use crate::db;
use crate::http::{ApiError, ApiResult, Ctx, ok};

/// How recent a session's proof must be for a sensitive action, in
/// seconds: a constant, not a setting (ADR 0083 item 6).
pub const PROVE_WITHIN: i64 = 600;

fn prove_first() -> ApiError {
    ApiError::new(
        StatusCode::FORBIDDEN,
        "prove_first",
        "prove it is you first",
    )
}

impl Ctx {
    /// The session behind the request proved who it is within
    /// [`PROVE_WITHIN`], or 403 `prove_first`. Called by a sensitive route
    /// right after it knows who asks and before it reads anything of what
    /// was asked, so that the answer says nothing of it.
    pub fn proved(&self) -> ApiResult<()> {
        let who = self.who()?;
        let Some(session) = who.session() else {
            return Err(ApiError::forbidden("not with an access token"));
        };
        let at = self.server.db.proved_at(session)?.unwrap_or(0);
        if db::now().saturating_sub(at) <= PROVE_WITHIN {
            Ok(())
        } else {
            Err(prove_first())
        }
    }
}

#[derive(Deserialize)]
pub struct Prove {
    /// The account's password…
    password: Option<String>,
    /// …or the answer to a ceremony of `POST /api/me/prove/passkey`.
    ceremony: Option<String>,
    credential: Option<PublicKeyCredential>,
}

/// The session proves who it is again: the mark is stamped now.
pub async fn prove(ctx: Ctx, Json(body): Json<Prove>) -> ApiResult<Response> {
    ctx.changes()?;
    let who = ctx.person()?.clone();
    let Some(session) = who.session().map(str::to_owned) else {
        return Err(ApiError::forbidden("not with an access token"));
    };
    match (body.password, body.ceremony, body.credential) {
        (Some(password), None, None) => by_password(&ctx, &who, password).await?,
        (None, Some(ceremony), Some(credential)) => {
            crate::passkeys::prove_finish(&ctx, &who, &ceremony, &credential).await?;
        }
        _ => {
            return Err(ApiError::bad(
                "bad_request",
                "a password, or a passkey's answer",
            ));
        }
    }
    if !ctx.server.db.prove(&session)? {
        return Err(ApiError::unauthorized());
    }
    ctx.audit("proved", None, None, true);
    Ok(ok(json!(null)))
}

/// The password, checked as a sign-in checks it — the same keys, the same
/// turn, the same hash, the same refusal.
async fn by_password(ctx: &Ctx, who: &Who, password: String) -> ApiResult<()> {
    let by_address = format!("in:{}", ctx.peer.key());
    let by_account = format!("in:{}", db::fold_email(&who.account.email));
    crate::api::limited(ctx, &[&by_address, &by_account])?;
    let turn = ctx.server.signins.turn();
    if !turn.is_zero() {
        tokio::time::sleep(turn).await;
    }
    let _turn = ctx.server.hashes.turn(&[&by_address, &by_account]).await?;
    crate::api::limited(ctx, &[&by_address, &by_account])?;
    let hash = who.account.password.clone();
    let right = ctx
        .server
        .hashes
        .run(move || match hash {
            Some(h) => crate::crypto::verify_password(&password, &h),
            // An account with no password yet costs a hash too.
            None => {
                crate::crypto::waste_time(&password);
                false
            }
        })
        .await?;
    if !right {
        ctx.server.limiter.failed(&by_address);
        ctx.server.limiter.failed(&by_account);
        crate::signin::refused(
            &ctx.server,
            &ctx.peer.key(),
            Some(&who.account.email),
            Some(&who.account),
        );
        ctx.audit("proved", None, None, false);
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "signin_failed",
            "wrong password",
        ));
    }
    ctx.server.limiter.succeeded(&by_address);
    ctx.server.limiter.succeeded(&by_account);
    ctx.server
        .signins
        .succeeded(&ctx.peer.key(), Some(&who.account.email));
    Ok(())
}
