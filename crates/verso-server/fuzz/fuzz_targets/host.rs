// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: `host_ok` and `expected_origin` on arbitrary headers (ADR
//! 0083 item 14, F6), with `origin_ok` and `peer` beside them (`auth.rs`).
//! Before every route the server checks that `Host` names it (DNS
//! rebinding, ADR 0045, ADR 0073 item 6); the origin it expects is what
//! `Origin` is compared with, what the page's policy names for its
//! WebSocket (`http.rs`), and the address of the links it mails and shows
//! — a password reset, an invitation, a device's approval. The headers come
//! from anyone who reaches the port.
//!
//! The input: its first byte picks the server's configuration — loopback;
//! loopback with its own TLS; a public HTTPS address behind a trusted
//! proxy; a public HTTP address on the network —, its second the address
//! the request came from, the rest is header lines `name: value`, as hyper
//! would hand them over (names and values it refuses are skipped). A crash
//! means a header panics the check, or that `Host` passes naming something
//! other than the public address or a loopback name and port, or that the
//! origin expected is not the public address's, or, with none, not the
//! loopback name the request named — a header that could write itself
//! into a link mailed or into the page's policy. Seeds in `../seeds-host/`;
//! `bracket-then-anything.txt` is what this target found on 2026-10-13: a
//! `Host` of `[::1]` followed by anything passed, and became the origin
//! (`auth.rs`, `loopback_host`, fixed with the test
//! `only_the_loopback_in_brackets_is_one`).
//! Run: `cargo +nightly fuzz run host fuzz/corpus/host fuzz/seeds-host`.

#![no_main]

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use http::header::{HOST, ORIGIN};
use http::{HeaderMap, HeaderName, HeaderValue};
use libfuzzer_sys::fuzz_target;
use verso_server::auth::{expected_origin, host_ok, origin_ok, peer};
use verso_server::config::Config;
use verso_server::db::Db;
use verso_server::proxy::Proxies;
use verso_server::state::Server;

/// `proxy`: 0 none, 1 a named proxy (127.0.0.1), 2 the implicit default
/// (loopback and the private networks).
fn server(listen: &str, public_url: Option<&str>, tls: bool, proxy: u8) -> Arc<Server> {
    let config = Config {
        listen: listen.parse().expect("an address"),
        public_url: public_url.map(str::to_owned),
        data_dir: PathBuf::from("/nonexistent/data"),
        folders_dir: PathBuf::from("/nonexistent/folders"),
        ui_dir: PathBuf::from("/nonexistent/ui"),
        web: true,
        announce: false,
        admin: None,
        trusted_proxy: match proxy {
            1 => Proxies::parse("127.0.0.1").expect("a proxy"),
            2 => Proxies::private_networks(),
            _ => Proxies::default(),
        },
        tls: tls.then(|| (PathBuf::from("/c"), PathBuf::from("/k"))),
        update_check: false,
        update_token: None,
        smtp_url: None,
        mail_from: None,
        folder_quota: None,
        trash_days: 30,
        trash_max: None,
        history_days: 90,
        audit_days: 365,
    };
    let db = Db::memory().expect("a database in memory");
    Server::new(config, db, "fuzz".to_owned(), "fuzz".to_owned())
}

fn servers() -> &'static [Arc<Server>] {
    static SERVERS: OnceLock<Vec<Arc<Server>>> = OnceLock::new();
    SERVERS.get_or_init(|| {
        vec![
            server("127.0.0.1:7340", None, false, 0),
            server("127.0.0.1:7340", None, true, 0),
            server("127.0.0.1:7340", None, false, 1),
            server("127.0.0.1:7340", None, false, 2),
            server("0.0.0.0:7340", None, false, 2),
            server("0.0.0.0:7340", None, false, 1),
            server("0.0.0.0:7340", Some("https://Notes.Example.org"), false, 1),
            server("0.0.0.0:7340", Some("http://192.168.1.5:7340"), false, 0),
        ]
    })
}

/// A loopback name with its port, if any: what a browser on this machine
/// sends, read here without the server's code.
fn loopback(host: &str) -> bool {
    let name = match host.rsplit_once(':') {
        Some((name, port)) if port.bytes().all(|b| b.is_ascii_digit()) => name,
        _ => host,
    };
    matches!(name, "localhost" | "127.0.0.1" | "[::1]")
}

/// What the rule answers with no public address, read here without the
/// server's code: an address, one label, `.local` or `.home.arpa`.
fn rebind_proof(host: &str) -> bool {
    let name = match host.rsplit_once(':') {
        Some((name, port)) if !host.ends_with(']') && port.bytes().all(|b| b.is_ascii_digit()) => name,
        _ => host,
    };
    let name = name.trim_end_matches('.').to_ascii_lowercase();
    if let Some(v6) = name.strip_prefix('[').and_then(|n| n.strip_suffix(']')) {
        return v6.parse::<Ipv6Addr>().is_ok();
    }
    !name.is_empty()
        && (name.parse::<Ipv4Addr>().is_ok()
            || !name.contains('.')
            || name.ends_with(".local")
            || name.ends_with(".home.arpa"))
}

fn headers(lines: &[u8]) -> HeaderMap {
    let mut map = HeaderMap::new();
    for line in lines.split(|b| *b == b'\n') {
        let Some(colon) = line.iter().position(|b| *b == b':') else {
            continue;
        };
        let (name, value) = (&line[..colon], line[colon + 1..].trim_ascii());
        if let (Ok(name), Ok(value)) =
            (HeaderName::from_bytes(name), HeaderValue::from_bytes(value))
        {
            map.append(name, value);
        }
    }
    map
}

fuzz_target!(|data: &[u8]| {
    let [pick, from, lines @ ..] = data else {
        return;
    };
    let server = &servers()[usize::from(*pick) % servers().len()];
    let remote = [
        IpAddr::V4(Ipv4Addr::LOCALHOST),
        IpAddr::V4(Ipv4Addr::new(10, 0, 0, 9)),
        IpAddr::V6(Ipv6Addr::LOCALHOST),
    ][usize::from(*from) % 3];
    let headers = headers(lines);
    let host = headers.get(HOST).and_then(|v| v.to_str().ok());
    let public = server.config.public_url.as_deref().map(|u| {
        let (scheme, rest) = u.split_once("://").expect("a scheme");
        let authority = rest.split('/').next().unwrap_or(rest);
        (
            authority,
            format!("{scheme}://{}", authority.to_ascii_lowercase()),
        )
    });

    let p = peer(server, &headers, SocketAddr::new(remote, 50_000));
    // With no public address only a name a public page cannot rebind is
    // answered (an IP, one label, `.local`, `.home.arpa`), or any name when
    // a proxy the host *named* forwarded the request: the default list
    // widens nothing (ADR 0073 item 6, amended 2026-10-16).
    let named_forwarded = p.forwarded && !server.config.trusted_proxy.is_implicit();

    if host_ok(server, &headers, &p) {
        let host = host.expect("a Host that passes is one");
        let named = public
            .as_ref()
            .is_some_and(|(authority, _)| authority.eq_ignore_ascii_case(host));
        assert!(
            named || loopback(host) || (public.is_none() && (rebind_proof(host) || named_forwarded)),
            "Host {host:?} passed"
        );
    }

    let origin = expected_origin(server, &headers, &p);
    match (&public, &origin) {
        (Some((_, configured)), _) => assert_eq!(origin.as_ref(), Some(configured)),
        (None, Some(origin)) => {
            let host = host.expect("an origin from a Host");
            assert!(
                loopback(host) || rebind_proof(host) || named_forwarded,
                "Host {host:?} made the origin {origin:?}"
            );
            let scheme = if p.https { "https" } else { "http" };
            assert_eq!(*origin, format!("{scheme}://{}", host.to_ascii_lowercase()));
        }
        (None, None) => {}
    }

    if origin_ok(server, &headers, &p) {
        let sent = headers.get(ORIGIN).and_then(|v| v.to_str().ok());
        let expected = origin.expect("an origin that passes is expected");
        assert!(sent.is_some_and(|s| s.eq_ignore_ascii_case(&expected)));
    }

    if !server.config.trusted_proxy.trusts(remote) {
        assert_eq!(p.addr, remote, "only a trusted proxy forwards an address");
    }
});
