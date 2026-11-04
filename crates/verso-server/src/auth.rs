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

use crate::db::{Account, Role, SESSION_MAX};
use crate::proxy::Proxies;
use crate::state::Server;

/// Where a request came from.
#[derive(Debug, Clone)]
pub struct Peer {
    /// The client's address: the connection's, or the one a trusted proxy
    /// forwarded.
    pub addr: IpAddr,
    /// Whether the request reached the server over TLS — its own, or a
    /// trusted proxy's, as its `X-Forwarded-Proto` alone says. Only this
    /// makes the session cookie `Secure`; over plain HTTP the server works
    /// all the same, without what a browser keeps for secure contexts
    /// (ADR 0073 item 6, amended 2026-10-16).
    pub https: bool,
    /// Whether a trusted proxy forwarded the request, `X-Forwarded-For`
    /// and all: the `Host` it carries is then the name the person typed.
    pub forwarded: bool,
    /// A connection from this machine that named no one else: the program
    /// on it speaks for itself, and is not counted by the per-address caps.
    /// Never true for a forwarded address, however loopback it reads (ADR
    /// 0083 item 7).
    pub local: bool,
    /// The request came in by the loopback listener of "this app is a
    /// server" that the internet link reaches (ADR 0117 D3 items 3 and 4):
    /// its proxies are that listener's, its `Host` and `Origin` the link's.
    pub link: bool,
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
    /// The role a phone was paired with, when this is "this app is a
    /// server" (ADR 0096 item 12): the most the credential may do, whatever
    /// the owner's role in the folder — a reader's, or an editor's, never
    /// more. None on a server.
    pub phone: Option<Role>,
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
        // A phone paired as a reader reaches its folders and writes in none.
        if let Some(role) = self.phone {
            return (true, role.writes());
        }
        match &self.via {
            Via::Token { write, folders, .. } => (folders.iter().any(|f| f == folder), *write),
            _ => (true, true),
        }
    }
}

/// Whether the server serves its own TLS.
fn own_tls(server: &Server) -> bool {
    // "This app is a server" always speaks TLS, with its own certificate.
    server.config.tls.is_some() || server.local.is_some()
}

/// Whether the connection is this machine speaking for itself: the socket
/// peer is loopback and nothing was forwarded in its name. A believed peer
/// that writes `X-Forwarded-For: 127.0.0.1` is not this machine — with the
/// default list every private address is believed, and in Docker every
/// published-port visitor arrives from the bridge gateway, so the header is
/// the visitor's to write. A proxy the host named, though, that forwards a
/// loopback address or none is counted under it, as before.
pub fn is_local(proxies: &Proxies, remote: IpAddr, client: &crate::proxy::Client) -> bool {
    remote.to_canonical().is_loopback()
        && (!client.from_proxy || (proxies.is_implicit() && client.unforwarded))
}

/// The proxies believed for a request: the server's (`VERSO_TRUSTED_PROXY`;
/// none for "this app is a server" on the network), or, for one that came
/// in by the internet link's loopback listener, that listener's named
/// `127.0.0.1` and `::1` alone (ADR 0117 D3 item 4).
fn proxies(server: &Server, link: bool) -> &Proxies {
    match (&server.local, link) {
        (Some(local), true) => local.link_proxies(),
        _ => &server.config.trusted_proxy,
    }
}

/// The client as `proxies` walk the request's `X-Forwarded-For`.
fn client_of(proxies: &Proxies, headers: &HeaderMap, remote: IpAddr) -> crate::proxy::Client {
    proxies.client(
        remote,
        headers
            .get_all("x-forwarded-for")
            .iter()
            .filter_map(|v| v.to_str().ok()),
    )
}

/// The key a request is counted under — the client's address as the
/// trusted proxies walk it, an IPv6 /64 as one — or `None` for a direct
/// connection from this machine, which speaks for everyone and is not
/// counted; a forwarded address is, even a loopback one (ADR 0083 item 7).
pub fn client_key(
    server: &Server,
    headers: &HeaderMap,
    remote: SocketAddr,
    link: bool,
) -> Option<String> {
    let link = link && server.local.is_some();
    let proxies = proxies(server, link);
    let client = client_of(proxies, headers, remote.ip());
    (!is_local(proxies, remote.ip(), &client)).then(|| crate::limit::address_key(client.addr))
}

/// Where a request came from: the connection's address, or, from a
/// trusted proxy, the client `X-Forwarded-For` names, read from the right
/// past every trusted proxy (ADR 0083 item 5, [`crate::proxy`]); the
/// header of any other peer is ignored. A trusted proxy that forwards none
/// is served as itself and said in the log once a minute. `link`: the
/// request came in by the internet link's loopback listener
/// ([`Peer::link`]).
pub fn peer(server: &Server, headers: &HeaderMap, remote: SocketAddr, link: bool) -> Peer {
    let link = link && server.local.is_some();
    let proxies = proxies(server, link);
    let client = client_of(proxies, headers, remote.ip());
    // A proxy on this machine that is not in the list makes every visitor
    // this machine's address, and lifts them past the pace: said once a
    // minute, with what to set (ADR 0083 item 5).
    if !client.from_proxy && remote.ip().is_loopback() && headers.contains_key("x-forwarded-for") {
        server.untrusted_forward.warn(&format!(
            "a request from {} carried X-Forwarded-For, but that address is not in VERSO_TRUSTED_PROXY: every visitor through a proxy on this machine counts as this machine; set VERSO_TRUSTED_PROXY={} if one forwards to UniVerso",
            remote.ip(),
            remote.ip()
        ));
    }
    // Said only of a proxy the person named: with the default list, a
    // direct connection from the home network is a "proxy" too.
    if client.unforwarded && !proxies.is_implicit() {
        server.unforwarded.warn(
            "a request from the trusted proxy carried no X-Forwarded-For: is the proxy configured to forward it?",
        );
    }
    let (addr, from_proxy) = (client.addr, client.from_proxy);
    // Through a trusted proxy, its `X-Forwarded-Proto` alone says how the
    // visitor came; a direct connection is HTTPS only on the server's own
    // TLS. Nothing is refused over HTTP: it decides the cookie's `Secure`
    // and what the window turns off. The internet link's listener speaks
    // plain HTTP: there only the tunnel's `X-Forwarded-Proto` says HTTPS
    // (ADR 0117 D3 item 4).
    let https = (own_tls(server) && !link)
        || (from_proxy
            && headers
                .get("x-forwarded-proto")
                .and_then(|v| v.to_str().ok())
                .is_some_and(|p| p.eq_ignore_ascii_case("https")));
    Peer {
        addr,
        https,
        forwarded: from_proxy && !client.unforwarded,
        local: is_local(proxies, remote.ip(), &client),
        link,
    }
}

/// The host part (with its port) of the address people use.
fn public_authority(server: &Server) -> Option<&str> {
    let url = server.config.public_url.as_deref()?;
    let rest = url.split_once("://")?.1;
    Some(rest.split('/').next().unwrap_or(rest))
}

fn loopback_host(host: &str) -> bool {
    // The name without a port of digits after its last colon: `[::1]`
    // keeps its brackets, and nothing but that port may follow them.
    let name = match host.rsplit_once(':') {
        Some((name, port)) if port.bytes().all(|b| b.is_ascii_digit()) => name,
        _ => host,
    };
    matches!(name, "localhost" | "127.0.0.1" | "[::1]")
}

/// Whether `host` (with its port) is a name a page on the public internet
/// cannot make resolve to this machine by DNS rebinding: an IP literal
/// (the page would have to be served from that address itself), a name of
/// one label (no public registry sells one), `.local` and `.home.arpa`
/// (names of the local network), and `localhost`.
fn rebind_proof(host: &str) -> bool {
    let name = if let Some(rest) = host.strip_prefix('[') {
        // `[::1]:7340`: the address in brackets, a port after them.
        match rest.split_once(']') {
            // Nothing after the bracket but a port of digits (the same
            // whole-name rule as [`loopback_host`]).
            Some((ip, after))
                if after.is_empty()
                    || after.strip_prefix(':').is_some_and(|p| {
                        !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit())
                    }) =>
            {
                return ip.parse::<std::net::Ipv6Addr>().is_ok();
            }
            _ => return false,
        }
    } else {
        match host.rsplit_once(':') {
            Some((name, port)) if !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()) => {
                name
            }
            _ => host,
        }
    };
    let name = name.to_ascii_lowercase();
    let name = name.trim_end_matches('.');
    if name.is_empty() || name.len() > 253 {
        return false;
    }
    if name.parse::<std::net::Ipv4Addr>().is_ok() {
        return true;
    }
    let label = |l: &str| {
        !l.is_empty()
            && l.len() <= 63
            && l.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            && !l.starts_with('-')
            && !l.ends_with('-')
    };
    let single = !name.contains('.');
    (single || name.ends_with(".local") || name.ends_with(".home.arpa"))
        && name.split('.').all(label)
}

/// Whether the `Host` typed is answered with no public address given. The
/// `Host` check is there for DNS rebinding: a page of another site that
/// resolves its own name to this machine, and drives the visitor's browser
/// into it. With no `VERSO_PUBLIC_URL` the names a public page cannot
/// rebind are answered ([`rebind_proof`]: an IP, a one-label name,
/// `.local`, `.home.arpa`), so `http://<ip>:7340` works with no variable;
/// any other name needs `VERSO_PUBLIC_URL`, or a proxy the host *named* in
/// `VERSO_TRUSTED_PROXY` having forwarded the request. The default list
/// widens nothing: a page rebound onto this machine can add an
/// `X-Forwarded-For` itself, and loopback is on that list (ADR 0045, ADR
/// 0073 item 6, amended 2026-10-16).
fn any_host(server: &Server, peer: &Peer, host: &str) -> bool {
    server.config.public_url.is_none()
        && server.local.is_none()
        && (rebind_proof(host) || (peer.forwarded && !server.config.trusted_proxy.is_implicit()))
}

/// The `Host` header names this server: the public address's authority,
/// a loopback name, or, with no public address and the server reached from
/// the network, any name (see [`any_host`]).
pub fn host_ok(server: &Server, headers: &HeaderMap, peer: &Peer) -> bool {
    let Some(host) = headers.get(HOST).and_then(|v| v.to_str().ok()) else {
        return false;
    };
    // The internet link's listener answers to the link's name and to no
    // other — not a loopback name, not the network's addresses — and to
    // none while the link has no address (ADR 0117 D3 item 4).
    if peer.link {
        return server.local.as_ref().is_some_and(|l| l.link_knows(host));
    }
    public_authority(server).is_some_and(|a| a.eq_ignore_ascii_case(host))
        || loopback_host(host)
        || server.local.as_ref().is_some_and(|l| l.knows_host(host))
        || any_host(server, peer, host)
}

/// The origin pages of this server have.
pub fn expected_origin(server: &Server, headers: &HeaderMap, peer: &Peer) -> Option<String> {
    if peer.link {
        return server.local.as_ref().and_then(|l| l.link_origin());
    }
    if let Some(url) = server.config.public_url.as_deref() {
        let (scheme, rest) = url.split_once("://")?;
        let authority = rest.split('/').next().unwrap_or(rest);
        return Some(format!("{scheme}://{}", authority.to_ascii_lowercase()));
    }
    let host = headers.get(HOST).and_then(|v| v.to_str().ok())?;
    let scheme = if peer.https { "https" } else { "http" };
    (any_host(server, peer, host)
        || loopback_host(host)
        || server.local.as_ref().is_some_and(|l| l.knows_host(host)))
    .then(|| format!("{scheme}://{}", host.to_ascii_lowercase()))
}

/// A request that changes something, or a WebSocket that will, came from a
/// page of this server: `Origin` checked against the public address
/// (ADR 0074 item 7). A request with no `Origin` is no browser's and needs
/// a bearer token.
pub fn origin_ok(server: &Server, headers: &HeaderMap, peer: &Peer) -> bool {
    let Some(origin) = headers.get(ORIGIN).and_then(|v| v.to_str().ok()) else {
        return false;
    };
    expected_origin(server, headers, peer).is_some_and(|o| o.eq_ignore_ascii_case(origin))
}

/// The session cookie's name: `__Host-` over HTTPS, which binds it to this
/// host and path `/`; plain over HTTP, where `Secure` would keep the
/// browser from storing it.
pub fn cookie_name(https: bool) -> &'static str {
    if https {
        "__Host-verso-session"
    } else {
        "verso-session"
    }
}

/// `Set-Cookie` for a new session: `Secure` only on a request that came
/// over HTTPS (ADR 0073 item 6, amended 2026-10-16).
pub fn session_cookie(peer: &Peer, token: &str) -> String {
    let secure = if peer.https { "; Secure" } else { "" };
    format!(
        "{}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_MAX}{secure}",
        cookie_name(peer.https)
    )
}

/// `Set-Cookie` that removes the session's cookie.
pub fn clear_cookie(peer: &Peer) -> String {
    let secure = if peer.https { "; Secure" } else { "" };
    format!(
        "{}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}",
        cookie_name(peer.https)
    )
}

pub(crate) fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v.to_owned())
}

/// Whether a request carries anything that may open an account — a bearer
/// credential or a cookie — and is worth asking [`who`] about.
#[must_use]
pub fn carries_credential(headers: &HeaderMap) -> bool {
    headers.contains_key(AUTHORIZATION) || headers.contains_key(COOKIE)
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
/// `by_seat`: the request came in by the door of the owner's own window
/// ([`crate::local::seat`]), which nothing a client sends can say.
pub fn who(
    server: &Server,
    headers: &HeaderMap,
    https: bool,
    by_seat: bool,
) -> Result<Option<Who>, String> {
    // "This app is a server" judges a bearer credential its own way: the
    // owner's window's seat through its door alone (ADR 0117 D4 Q3), an
    // invited account's devices elsewhere (D9, S11), never a phone or this
    // computer's own accounts (`crate::local::Policy::bearer_who`).
    if let Some(secret) = bearer(headers) {
        if let Some(local) = &server.local {
            return local.bearer_who(server, &secret, by_seat);
        }
        return bearer_who(server, &secret);
    }
    let Some(token) = cookie(headers, cookie_name(https)) else {
        return Ok(None);
    };
    let Some(s) = server.db.session(&token)? else {
        return Ok(None);
    };
    if s.kind != "browser" {
        return Ok(None);
    }
    let Some(mut account) = server.db.account(&s.account)? else {
        return Ok(None);
    };
    // "This app is a server": a phone is a session of the owner with its
    // row, a reader or an editor and never the admin the owner is (ADR 0096
    // item 12); an account of a person signs in as on a UniVerso (ADR 0117
    // D3 item 2); a session of this computer's own accounts that is no
    // phone's opens nothing — fail closed.
    let phone = if server.local.is_some() {
        let phone = server.db.phone_role(&s.id)?;
        if phone.is_some() {
            account.admin = false;
            account.may_create = false;
        } else if crate::db::is_this_computer(&account.email) {
            return Ok(None);
        }
        phone
    } else {
        None
    };
    Ok(Some(Who {
        account,
        via: Via::Browser {
            session: s.id,
            csrf: s.csrf,
        },
        phone,
    }))
}

/// Who a bearer `secret` is on a UniVerso: a personal access token
/// (`verso_pat_`) or a device's session (ADR 0074 item 8); `None` for
/// anything else, a browser's session included.
pub(crate) fn bearer_who(server: &Server, secret: &str) -> Result<Option<Who>, String> {
    if secret.starts_with("verso_pat_") {
        let Some(grant) = server.db.token(secret)? else {
            return Ok(None);
        };
        return Ok(server.db.account(&grant.account)?.map(|account| Who {
            account,
            via: Via::Token {
                id: grant.id,
                write: grant.write,
                folders: grant.folders,
            },
            phone: None,
        }));
    }
    let Some(s) = server.db.session(secret)? else {
        return Ok(None);
    };
    if s.kind != "device" {
        return Ok(None);
    }
    Ok(server.db.account(&s.account)?.map(|account| Who {
        account,
        via: Via::Device { session: s.id },
        phone: None,
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

    fn someone(phone: Option<Role>) -> Who {
        Who {
            account: Account {
                id: "a".into(),
                email: "a@b.c".into(),
                name: "A".into(),
                lang: "pt".into(),
                admin: false,
                may_create: false,
                created: 0,
                password: None,
            },
            via: Via::Browser {
                session: "s".into(),
                csrf: "c".into(),
            },
            phone,
        }
    }

    /// A phone paired as a reader reaches its folders and writes in none; an
    /// editor writes; a session that is no phone's is a server's own.
    #[test]
    fn a_phone_reader_writes_nowhere() {
        assert_eq!(someone(Some(Role::Reader)).reaches("f"), (true, false));
        assert_eq!(someone(Some(Role::Editor)).reaches("f"), (true, true));
        assert_eq!(someone(None).reaches("f"), (true, true));
    }

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

    /// Found by the fuzz target `host` (ADR 0083 item 14; its input is
    /// `fuzz/seeds-host/bracket-then-anything.txt`): a name in brackets was
    /// taken for `[::1]` whatever followed the bracket, so such a `Host`
    /// passed, and with no public address it became the origin the server
    /// expects — the base of the links it mails (a password reset's) and a
    /// source in the page's policy. `[::1]@evil.example` makes a link a
    /// browser opens at evil.example.
    #[test]
    fn only_the_loopback_in_brackets_is_one() {
        for h in [
            "[::1]@evil.example",
            "[::1]:7340@evil.example",
            "[::1]x",
            "[::1]:igin: https",
            "[::1];script-src *",
            "[::1]evil.example:80",
        ] {
            assert!(!loopback_host(h), "{h}");
        }
    }
}
