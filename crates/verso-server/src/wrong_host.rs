// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The page a browser gets in place of the technical 421 when
//! `VERSO_PUBLIC_URL` is set and the request came by another name — the
//! server's old address (ADR 0073, decided 2026-10-31, B13).
//!
//! The refusal is the DNS-rebinding rule of ADR 0045 and stays: the status
//! is still 421 and nothing of the server is served. What changes is the
//! body, for a person at a browser: a short page in Portuguese and English
//! saying the address is now the public one, with a link to it. The address
//! named is the configured public one, never the `Host` that was sent, and
//! nothing the request carried is written into the page. A request that is
//! not a browser's page load — an API call, a WebSocket, a sync from the
//! desktop app, anything not asking for HTML — keeps the machine-readable
//! JSON answer.

use axum::http::header::{ACCEPT, ACCEPT_LANGUAGE, UPGRADE};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};

/// Whether the request is a browser loading a page: a GET (or HEAD) that
/// asks for HTML, is no upgrade and is not on the API.
#[must_use]
pub fn wants_a_page(method: &Method, path: &str, headers: &HeaderMap) -> bool {
    (method == Method::GET || method == Method::HEAD)
        && !headers.contains_key(UPGRADE)
        && path != "/api"
        && !path.starts_with("/api/")
        && headers
            .get(ACCEPT)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|a| {
                a.split(',')
                    .any(|t| t.split(';').next().unwrap_or("").trim() == "text/html")
            })
}

/// Whether the person's first language is Portuguese.
fn portuguese_first(headers: &HeaderMap) -> bool {
    headers
        .get(ACCEPT_LANGUAGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|l| l.split(',').next())
        .is_some_and(|l| l.trim().to_ascii_lowercase().starts_with("pt"))
}

/// `text` with the characters HTML gives a meaning to written as text.
fn escaped(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            c => out.push(c),
        }
    }
    out
}

/// The address to name: the public URL's scheme and authority, when it is
/// an `http(s)` one.
fn address(public_url: &str) -> Option<String> {
    let (scheme, rest) = public_url.split_once("://")?;
    if !matches!(scheme, "http" | "https") {
        return None;
    }
    let authority = rest.split('/').next().unwrap_or(rest);
    (!authority.is_empty()).then(|| format!("{scheme}://{authority}"))
}

/// The page, as text: both languages, the person's first.
#[must_use]
pub fn page(address: &str, portuguese_first: bool) -> String {
    let a = escaped(address);
    let pt = format!(
        "<section lang=\"pt-BR\"><h1>Este endereço mudou</h1>\
         <p>O UniVerso agora fica em <a href=\"{a}\">{a}</a>. \
         Abra esse endereço, e guarde-o nos favoritos no lugar deste.</p></section>"
    );
    let en = format!(
        "<section lang=\"en\"><h1>This address has changed</h1>\
         <p>The UniVerso is now at <a href=\"{a}\">{a}</a>. \
         Open that address, and bookmark it in place of this one.</p></section>"
    );
    let (first, second, lang, title) = if portuguese_first {
        (pt, en, "pt-BR", "Este endereço mudou")
    } else {
        (en, pt, "en", "This address has changed")
    };
    format!(
        "<!doctype html><html lang=\"{lang}\"><head><meta charset=\"utf-8\">\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\
         <meta name=\"color-scheme\" content=\"light dark\">\
         <title>{title}</title>\
         <style>body{{font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem 1rem;\
         display:grid;justify-content:center}}main{{max-width:34rem}}\
         h1{{font-size:1.4rem}}section+section{{margin-top:2rem;opacity:.85}}\
         a{{overflow-wrap:anywhere}}</style></head>\
         <body><main>{first}{second}</main></body></html>"
    )
}

/// The 421 a browser's page load gets, when the server has a public address
/// to name; `None` for any other request, which gets the JSON refusal.
#[must_use]
pub fn answer(
    public_url: Option<&str>,
    method: &Method,
    path: &str,
    headers: &HeaderMap,
) -> Option<Response> {
    let address = address(public_url?)?;
    if !wants_a_page(method, path, headers) {
        return None;
    }
    let body = if method == Method::HEAD {
        String::new()
    } else {
        page(&address, portuguese_first(headers))
    };
    let mut response = (StatusCode::MISDIRECTED_REQUEST, body).into_response();
    let h = response.headers_mut();
    h.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; \
             form-action 'none'; frame-ancestors 'none'",
        ),
    );
    h.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    h.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    h.insert("x-frame-options", HeaderValue::from_static("DENY"));
    h.insert(
        verso_core::sync::PROTOCOL_HEADER,
        HeaderValue::from(verso_core::sync::PROTOCOL),
    );
    Some(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.insert(*k, HeaderValue::from_static(v));
        }
        h
    }

    #[test]
    fn only_a_browsers_page_load_gets_the_page() {
        let html = headers(&[("accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")]);
        assert!(wants_a_page(&Method::GET, "/", &html));
        assert!(wants_a_page(&Method::HEAD, "/n/a", &html));
        // Not a page load: another method, the API, an upgrade, JSON, no
        // Accept at all, `*/*` alone.
        assert!(!wants_a_page(&Method::POST, "/", &html));
        assert!(!wants_a_page(&Method::GET, "/api/signin", &html));
        assert!(!wants_a_page(&Method::GET, "/api", &html));
        assert!(wants_a_page(&Method::GET, "/apiary", &html));
        let up = headers(&[("accept", "text/html"), ("upgrade", "websocket")]);
        assert!(!wants_a_page(&Method::GET, "/ws", &up));
        assert!(!wants_a_page(
            &Method::GET,
            "/",
            &headers(&[("accept", "application/json")])
        ));
        assert!(!wants_a_page(&Method::GET, "/", &HeaderMap::new()));
        assert!(!wants_a_page(
            &Method::GET,
            "/",
            &headers(&[("accept", "*/*")])
        ));
    }

    #[test]
    fn the_address_named_is_the_public_origin_and_is_written_as_text() {
        assert_eq!(
            address("https://universo.casa.lan/ignored?x=1").as_deref(),
            Some("https://universo.casa.lan")
        );
        assert_eq!(address("javascript://x/%0aalert(1)"), None);
        assert_eq!(address("universo.casa.lan"), None);
        let p = page("https://a.example/\"><script>x</script>", false);
        assert!(!p.contains("<script>"), "{p}");
        assert!(p.contains("&lt;script&gt;"));
    }

    #[test]
    fn the_page_has_both_languages_the_persons_first_and_a_link() {
        let en = page("https://u.example", false);
        let pt = page("https://u.example", true);
        for p in [&en, &pt] {
            assert!(p.contains("<a href=\"https://u.example\">https://u.example</a>"));
            assert!(p.contains("This address has changed"));
            assert!(p.contains("Este endereço mudou"));
        }
        assert!(en.find("This address").unwrap() < en.find("Este endere").unwrap());
        assert!(pt.find("Este endere").unwrap() < pt.find("This address").unwrap());
        assert!(en.starts_with("<!doctype html><html lang=\"en\">"));
        assert!(pt.contains("<html lang=\"pt-BR\">"));
        let both = headers(&[("accept-language", "pt-BR,pt;q=0.9,en;q=0.8")]);
        assert!(portuguese_first(&both));
        assert!(!portuguese_first(&headers(&[(
            "accept-language",
            "en-US,pt;q=0.5"
        )])));
    }
}
