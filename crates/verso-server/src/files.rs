// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `/f/<folder>/<path>`: a file of a folder that is not a note — a picture,
//! a PDF, an HTML page shown without scripts — for a member who may read
//! the folder (the maintainer's answer G of 2026-10-09: the session and its
//! role are the capability, checked on every request). Read through the
//! core, served with the policy `verso://` has on the desktop: whatever
//! the file is, a document made of it runs no script (an HTML or SVG file
//! another member shares is otherwise a stored XSS on the server's
//! origin, ADR 0073 item 6).

use axum::body::Body;
use axum::extract::Path;
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use verso_service::OpError;
use verso_service::files::{Policy, serve};

use crate::http::{ApiError, ApiResult, Ctx};

const FILE_CSP: &str = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:";

pub async fn file(ctx: Ctx, Path((folder, path)): Path<(String, String)>) -> ApiResult<Response> {
    ctx.secure()?;
    let who = ctx.who()?;
    // A share's file, by its path in the shared folder, behind the same
    // check (ADR 0081 item 2).
    let (found, path) = match crate::shares::opening(&ctx.server, who, &folder)? {
        crate::shares::Opening::Folder(found, _) => (found, path),
        crate::shares::Opening::Share(found, scope, _) => {
            let full = scope.to_full(&path).map_err(|_| ApiError::not_found())?;
            (found, full)
        }
    };
    let key = crate::access::key(&ctx.server, &found)?;
    let server = std::sync::Arc::clone(&ctx.server);
    let served = tokio::task::spawn_blocking(move || {
        let policy = Policy {
            csp: FILE_CSP,
            cors_origin: None,
        };
        server
            .service
            .with_key(&key, |ws| -> Result<_, OpError> {
                Ok(serve(Some(ws), true, &path, &policy))
            })
            .unwrap_or_else(|_| serve(None, true, &path, &policy))
    })
    .await
    .map_err(|e| e.to_string())?;
    let mut response = Response::new(Body::from(served.body));
    *response.status_mut() = StatusCode::from_u16(served.status).unwrap_or(StatusCode::OK);
    for (name, value) in served.headers {
        if let Ok(v) = HeaderValue::from_str(&value) {
            response.headers_mut().insert(name, v);
        }
    }
    Ok(response.into_response())
}
