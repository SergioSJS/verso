// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Who is asking, and from where (ADR 0074 items 7, 8 and 11; ADR 0073
//! item 6): the session in a cookie, a device's or a personal access token
//! in `Authorization: Bearer`, the address the request came from, whether
//! it came over TLS, and the `Host` and `Origin` checks.

use std::net::{IpAddr, SocketAddr};

use axum::http::HeaderMap;
use axum::http::header::{AUTHORIZATION, COOKIE, HOST, ORIGIN};

use crate::db::{Account, SESSION_MAX};
use crate::state::Server;

/// Where a request came from.
#[derive(Debug, Clone)]
pub struct Peer {
    /// The client's address: the connection's, or the one a trusted proxy
    /// forwarded.
    pub addr: IpAddr,
    /// Whether the request reached the server over TLS — its own, or a
    /// trusted proxy's — or from this machine, where a browser counts
    /// `http://localhost` as a secure context. Nothing that signs in or
    /// carries a secret is served otherwise (ADR 0073 item 6).
    pub secure: bool,
}

impl Peer {
    /// The address as the per-address delays and counts key it: an IPv6
    /// address by its /64 ([`crate::limit::address_key`]).
    #[must_use]
    pub fn key(&self) -> String {
        crate::limit::address_key(self.addr)
    }
}

/// How a request proved who it is.
#[derive(Debug, Clone)]
pub enum Via {
    /// A browser's session cookie: its session id and CSRF token.
    Browser { session: String, csrf: String },
    /// A device's session (the desktop app signed in through the browser).
    Device { session: String },
    /// A personal access token: its id, read or read and write, its
    /// folders.
    Token {
        id: String,
        write: bool,
        folders: Vec<String>,
    },
}

#[derive(Debug, Clone)]
pub struct Who {
    pub account: Account,
    pub via: Via,
}

impl Who {
    /// The session behind the request, when it is one (not a token).
    #[must_use]
    pub fn session(&self) -> Option<&str> {
        match &self.via {
            Via::Browser { session, .. } | Via::Device { session } => Some(session),
            Via::Token { .. } => None,
        }
    }

    /// Whether this credential may reach folder `id` at all, and write.
    #[must_use]
    pub fn reaches(&self, folder: &str) -> (bool, bool) {
        match &self.via {
            Via::Token { write, folders, .. } => (folders.iter().any(|f| f == folder), *write),
            _ => (true, true),
        }
    }
}

/// Whether the server serves its own TLS.
fn own_tls(server: &Server) -> bool {
    server.config.tls.is_some()
}

/// Whether the address people use is HTTPS: then the cookie is
/// `__Host-` and `Secure`.
fn https(server: &Server) -> bool {
    own_tls(server)
        || server
            .config
            .public_url
            .as_deref()
            .is_some_and(|u| u.starts_with("https://"))
}

/// Where a request came from: the connection's address, or, from a
/// trusted proxy, the client `X-Forwarded-For` names, read from the right
/// past every trusted proxy (ADR 0083 item 5, [`crate::proxy`]); the
/// header of any other peer is ignored. A trusted proxy that forwards none
/// is served as itself and said in the log once a minute.
pub fn peer(server: &Server, headers: &HeaderMap, remote: SocketAddr) -> Peer {
    let client = server.config.trusted_proxy.client(
        remote.ip(),
        headers
            .get_all("x-forwarded-for")
            .iter()
            .filter_map(|v| v.to_str().ok()),
    );
    if client.unforwarded {
        server.unforwarded.warn(
            "a request from the trusted proxy carried no X-Forwarded-For: is the proxy configured to forward it?",
        );
    }
    let (addr, from_proxy) = (client.addr, client.from_proxy);
    let secure = own_tls(server)
        || (from_proxy
            && headers
                .get("x-forwarded-proto")
                .and_then(|v| v.to_str().ok())
                .is_some_and(|p| p.eq_ignore_ascii_case("https")))
        || (remote.ip().is_loopback() && server.config.loopback_only());
    Peer { addr, secure }
}

/// The host part (with its port) of the address people use.
fn public_authority(server: &Server) -> Option<&str> {
    let url = server.config.public_url.as_deref()?;
    let rest = url.split_once("://")?.1;
    Some(rest.split('/').next().unwrap_or(rest))
}

fn loopback_host(host: &str) -> bool {
    let name = if let Some(rest) = host.strip_prefix('[') {
        rest.split(']').next().unwrap_or("")
    } else {
        host.rsplit_once(':').map_or(host, |(h, p)| {
            if p.chars().all(|c| c.is_ascii_digit()) {
                h
            } else {
                host
            }
        })
    };
    matches!(name, "localhost" | "127.0.0.1" | "::1")
}

/// The `Host` header names this server: the public address's authority,
/// or a loopback name — a page from another site that resolves its own
/// name to this machine (DNS rebinding) is refused (ADR 0045, ADR 0073
/// item 6).
pub fn host_ok(server: &Server, headers: &HeaderMap) -> bool {
    let Some(host) = headers.get(HOST).and_then(|v| v.to_str().ok()) else {
        return false;
    };
    public_authority(server).is_some_and(|a| a.eq_ignore_ascii_case(host)) || loopback_host(host)
}

/// The origin pages of this server have.
pub fn expected_origin(server: &Server, headers: &HeaderMap) -> Option<String> {
    if let Some(url) = server.config.public_url.as_deref() {
        let (scheme, rest) = url.split_once("://")?;
        let authority = rest.split('/').next().unwrap_or(rest);
        return Some(format!("{scheme}://{}", authority.to_ascii_lowercase()));
    }
    let host = headers.get(HOST).and_then(|v| v.to_str().ok())?;
    let scheme = if own_tls(server) { "https" } else { "http" };
    loopback_host(host).then(|| format!("{scheme}://{}", host.to_ascii_lowercase()))
}

/// A request that changes something, or a WebSocket that will, came from a
/// page of this server: `Origin` checked against the public address
/// (ADR 0074 item 7). A request with no `Origin` is no browser's and needs
/// a bearer token.
pub fn origin_ok(server: &Server, headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(ORIGIN).and_then(|v| v.to_str().ok()) else {
        return false;
    };
    expected_origin(server, headers).is_some_and(|o| o.eq_ignore_ascii_case(origin))
}

/// The session cookie's name: `__Host-` over HTTPS, which binds it to this
/// host and path `/`; plain on `http://localhost`, where `Secure` would
/// keep some browsers from storing it.
pub fn cookie_name(server: &Server) -> &'static str {
    if https(server) {
        "__Host-verso-session"
    } else {
        "verso-session"
    }
}

/// `Set-Cookie` for a new session.
pub fn session_cookie(server: &Server, token: &str) -> String {
    let secure = if https(server) { "; Secure" } else { "" };
    format!(
        "{}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_MAX}{secure}",
        cookie_name(server)
    )
}

/// `Set-Cookie` that removes the session's cookie.
pub fn clear_cookie(server: &Server) -> String {
    let secure = if https(server) { "; Secure" } else { "" };
    format!(
        "{}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}",
        cookie_name(server)
    )
}

fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v.to_owned())
}

fn bearer(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = value.split_once(' ')?;
    scheme
        .eq_ignore_ascii_case("bearer")
        .then(|| token.trim().to_owned())
}

/// Who a request is from: a bearer token first (a program), then the
/// session cookie (a browser); `None` when neither opens anything.
pub fn who(server: &Server, headers: &HeaderMap) -> Result<Option<Who>, String> {
    if let Some(secret) = bearer(headers) {
        if secret.starts_with("verso_pat_") {
            let Some(grant) = server.db.token(&secret)? else {
                return Ok(None);
            };
            return Ok(server.db.account(&grant.account)?.map(|account| Who {
                account,
                via: Via::Token {
                    id: grant.id,
                    write: grant.write,
                    folders: grant.folders,
                },
            }));
        }
        let Some(s) = server.db.session(&secret)? else {
            return Ok(None);
        };
        if s.kind != "device" {
            return Ok(None);
        }
        return Ok(server.db.account(&s.account)?.map(|account| Who {
            account,
            via: Via::Device { session: s.id },
        }));
    }
    let Some(token) = cookie(headers, cookie_name(server)) else {
        return Ok(None);
    };
    let Some(s) = server.db.session(&token)? else {
        return Ok(None);
    };
    if s.kind != "browser" {
        return Ok(None);
    }
    Ok(server.db.account(&s.account)?.map(|account| Who {
        account,
        via: Via::Browser {
            session: s.id,
            csrf: s.csrf,
        },
    }))
}

/// A device's or browser's name, for the list of sessions: the browser and
/// system the `User-Agent` names, never the whole string.
#[must_use]
pub fn device_name(headers: &HeaderMap) -> String {
    let ua = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let browser = ["Edg/", "Firefox/", "Chrome/", "Safari/"]
        .iter()
        .find(|b| ua.contains(**b))
        .map_or("", |b| match *b {
            "Edg/" => "Edge",
            "Firefox/" => "Firefox",
            "Chrome/" => "Chrome",
            _ => "Safari",
        });
    let system = [
        ("iPhone", "iPhone"),
        ("iPad", "iPad"),
        ("Android", "Android"),
        ("Mac OS X", "macOS"),
        ("Windows", "Windows"),
        ("Linux", "Linux"),
    ]
    .iter()
    .find(|(k, _)| ua.contains(k))
    .map_or("", |(_, v)| *v);
    match (browser, system) {
        ("", "") => "?".to_owned(),
        (b, "") => b.to_owned(),
        ("", s) => s.to_owned(),
        (b, s) => format!("{b} · {s}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_names_with_and_without_ports() {
        for h in [
            "localhost",
            "localhost:7340",
            "127.0.0.1:80",
            "[::1]:7340",
            "[::1]",
        ] {
            assert!(loopback_host(h), "{h}");
        }
        for h in [
            "evil.example",
            "localhost.evil.example",
            "10.0.0.2:7340",
            "127.0.0.1.nip.io",
        ] {
            assert!(!loopback_host(h), "{h}");
        }
    }
}
