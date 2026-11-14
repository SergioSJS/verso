// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The window's files served from memory instead of a directory (ADR 0118
//! item 7, decided 2026-11-12: the window's files once in the APK). The
//! Android app carries them inside itself — Tauri's own assets, the ones its
//! window loads —, so a phone serving its devices hands those out, instead
//! of a second copy in the APK copied to its storage. The host gives the
//! bytes of a path; everything else (the routes, the fallback to the page,
//! the cache rules of `static_cache.rs`) is as for a directory.

use std::sync::Arc;

use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};

/// What gives the bytes of a file of the window by its path.
pub type Read = dyn Fn(&str) -> Option<Vec<u8>> + Send + Sync;

/// The bytes of a file of the window by its path (`web.html`,
/// `chunks/chunk-….js`), `None` when there is none.
#[derive(Clone)]
pub struct UiFiles(pub Arc<Read>);

impl std::fmt::Debug for UiFiles {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("UiFiles")
    }
}

impl UiFiles {
    /// The file at `path` of a request, never outside the window's files
    /// (no `..`); `None` when there is none.
    #[must_use]
    pub fn get(&self, path: &str) -> Option<Vec<u8>> {
        let path = path.trim_start_matches('/');
        if path.is_empty() || path.split('/').any(|p| p == ".." || p == ".") {
            return None;
        }
        (self.0)(path)
    }

    /// The window's page, as text.
    ///
    /// # Errors
    /// When the page is not among the files, or is not UTF-8.
    pub fn page(&self, name: &str) -> std::io::Result<String> {
        let bytes = self
            .get(name)
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no page"))?;
        String::from_utf8(bytes)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    /// A request for a file: the file with its type, or the page for a
    /// path that names none (a route of the window), as a directory serves.
    pub(crate) fn serve(&self, uri: &Uri, page: &str) -> Response {
        let path = uri.path();
        match self.get(path) {
            Some(bytes) => ([(header::CONTENT_TYPE, type_of(path))], bytes).into_response(),
            None => match self.get(page) {
                Some(bytes) => ([(header::CONTENT_TYPE, type_of(page))], bytes).into_response(),
                None => StatusCode::NOT_FOUND.into_response(),
            },
        }
    }
}

/// The media type of a file of the window, by its extension: the kinds the
/// window's build holds; anything else as bytes.
#[must_use]
pub fn type_of(path: &str) -> &'static str {
    let ext = path
        .rsplit_once('.')
        .map_or("", |(_, e)| e)
        .to_ascii_lowercase();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json",
        "webmanifest" => "application/manifest+json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "mp3" => "audio/mpeg",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files() -> UiFiles {
        UiFiles(Arc::new(|p: &str| match p {
            "web.html" => Some(b"<!doctype html>page".to_vec()),
            "chunks/a.js" => Some(b"export{}".to_vec()),
            _ => None,
        }))
    }

    #[test]
    fn a_file_is_served_with_its_type_and_a_route_gets_the_page() {
        let f = files();
        assert_eq!(f.get("/chunks/a.js").as_deref(), Some(&b"export{}"[..]));
        assert_eq!(f.get("chunks/../web.html"), None);
        assert_eq!(f.get("/"), None);
        assert_eq!(f.page("web.html").unwrap(), "<!doctype html>page");
        assert_eq!(type_of("chunks/a.js"), "text/javascript; charset=utf-8");
        assert_eq!(type_of("fonts/x.WOFF2"), "font/woff2");
        assert_eq!(type_of("cmaps/x.bcmap"), "application/octet-stream");
        let js = f.serve(&"/chunks/a.js".parse().unwrap(), "web.html");
        assert_eq!(
            js.headers()[header::CONTENT_TYPE],
            "text/javascript; charset=utf-8"
        );
        let route = f.serve(&"/f/abc/note".parse().unwrap(), "web.html");
        assert_eq!(route.status(), StatusCode::OK);
        assert_eq!(
            route.headers()[header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );
    }
}
