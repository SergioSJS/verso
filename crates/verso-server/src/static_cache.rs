// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! How the window's own files are kept by a browser. The files are served
//! from disk (`ServeDir`), which sends `Last-Modified` and nothing else; a
//! browser then keeps `/web.js` for a fraction of its age without asking,
//! and an upgraded server is met by the previous window (seen 2026-10-21,
//! after an upgrade from the 2026-10-16 build).
//!
//! - A file with a content hash in its name (`/chunks/name-HASH.js`, built
//!   by esbuild) never changes under that name: kept for a year.
//! - Any other file (`/web.js`, `/style.css`, fonts, workers) must be
//!   asked about each time (`no-cache`) and is answered `304` when it is
//!   the same: a weak `ETag` of the server's version, the file's size and
//!   its `Last-Modified`. Nothing is hashed per request.
//! - A page (`text/html`) is left to the guard, which sends `no-store`.

use std::hash::{Hash, Hasher};

use axum::extract::Request;
use axum::http::{HeaderValue, StatusCode, header};
use axum::middleware::Next;
use axum::response::Response;

const IMMUTABLE: &str = "public, max-age=31536000, immutable";

/// A file under `/chunks/` whose name ends in esbuild's hash:
/// `name-HASH.js` (or `.js.map`), eight letters and digits.
fn is_hashed(path: &str) -> bool {
    let Some(name) = path.strip_prefix("/chunks/") else {
        return false;
    };
    let stem = name.split('.').next().unwrap_or_default();
    stem.rsplit_once('-').is_some_and(|(before, hash)| {
        !before.is_empty() && hash.len() == 8 && hash.bytes().all(|b| b.is_ascii_alphanumeric())
    })
}

/// The weak validator of an answer, from what the response already says.
fn etag(res: &Response) -> Option<String> {
    let h = res.headers();
    let modified = h.get(header::LAST_MODIFIED)?.to_str().ok()?;
    let len = h.get(header::CONTENT_LENGTH)?.to_str().ok()?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    modified.hash(&mut hasher);
    Some(format!(
        "W/\"{}-{len}-{:x}\"",
        env!("CARGO_PKG_VERSION"),
        hasher.finish()
    ))
}

/// Whether an `If-None-Match` names this validator (weak comparison).
fn matches(asked: &str, etag: &str) -> bool {
    let bare = |s: &str| s.trim().trim_start_matches("W/").to_owned();
    let ours = bare(etag);
    asked.trim() == "*" || asked.split(',').any(|one| bare(one) == ours)
}

/// The layer of the static files.
pub async fn keep(mut req: Request, next: Next) -> Response {
    let path = req.uri().path().to_owned();
    let asked = req
        .headers()
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    // One validator, ours: `If-Modified-Since` would be answered `304` by
    // the file service with none of the headers below.
    req.headers_mut().remove(header::IF_MODIFIED_SINCE);
    let mut res = next.run(req).await;
    let html = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("text/html"));
    if res.status() != StatusCode::OK || html {
        return res;
    }
    if is_hashed(&path) {
        res.headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static(IMMUTABLE));
        return res;
    }
    res.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    let Some(tag) = etag(&res) else {
        return res;
    };
    let Ok(value) = HeaderValue::from_str(&tag) else {
        return res;
    };
    res.headers_mut().insert(header::ETAG, value);
    if asked.is_some_and(|a| matches(&a, &tag)) {
        *res.status_mut() = StatusCode::NOT_MODIFIED;
        *res.body_mut() = axum::body::Body::empty();
        let h = res.headers_mut();
        h.remove(header::CONTENT_LENGTH);
        h.remove(header::CONTENT_TYPE);
        h.remove(header::ACCEPT_RANGES);
    }
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_chunk_with_a_hash_is_immutable() {
        assert!(is_hashed("/chunks/chunk-3QX7ABCD.js"));
        assert!(is_hashed("/chunks/excalidraw-A1B2C3D4.js.map"));
        assert!(!is_hashed("/web.js"));
        assert!(!is_hashed("/chunks/short-AB.js"));
        assert!(!is_hashed("/chunks/nohash.js"));
        assert!(!is_hashed("/fonts/inter-A1B2C3D4.woff2"));
    }

    #[test]
    fn a_validator_is_compared_weakly_and_in_a_list() {
        assert!(matches("W/\"1\"", "W/\"1\""));
        assert!(matches("\"0\", \"1\"", "W/\"1\""));
        assert!(matches("*", "W/\"1\""));
        assert!(!matches("W/\"2\"", "W/\"1\""));
    }
}
