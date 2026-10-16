// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Plain HTTP works (ADR 0073 item 6, amended 2026-10-16): a sign-in from
//! another machine by its address, a cookie that is `Secure` only over
//! HTTPS, the `Host` answered as typed when no public address is set, the
//! proxies believed when none is named. This replaces the tests that pinned
//! the refusal ("this server signs in over HTTPS only"): a deliberate change
//! of contract, said in its commit.

use std::net::SocketAddr;

use axum::http::HeaderMap;
use serde_json::json;

use crate::proxy::Proxies;
use crate::tests::{block_on, start_with};

const LAN: &str = "192.168.1.20:7340";

fn listening_on_the_network(c: &mut crate::config::Config) {
    c.listen = "0.0.0.0:7340".parse().unwrap();
}

/// A sign-in as a browser at `http://<host>` makes it: that `Host` and the
/// `Origin` of the page.
async fn sign_in_at(
    r: &crate::tests::Running,
    host: &str,
    scheme: &str,
    extra: &[(&str, &str)],
) -> reqwest::Response {
    let mut req = reqwest::Client::new()
        .post(r.url("/api/signin"))
        .header("host", host)
        .header("origin", format!("{scheme}://{host}"));
    for (k, v) in extra {
        req = req.header(*k, *v);
    }
    req.json(&json!({ "email": "admin@casa.lan", "password": "senha muito longa" }))
        .send()
        .await
        .unwrap()
}

fn set_cookie(res: &reqwest::Response) -> String {
    res.headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_owned()
}

#[test]
fn signing_in_over_plain_http_from_the_network_works_and_the_cookie_is_not_secure() {
    block_on(async {
        let r = start_with(listening_on_the_network).await;
        let res = sign_in_at(&r, LAN, "http", &[]).await;
        assert_eq!(res.status().as_u16(), 200);
        let cookie = set_cookie(&res);
        assert!(cookie.starts_with("verso-session="), "{cookie}");
        assert!(!cookie.contains("Secure"), "{cookie}");
        assert!(
            cookie.contains("HttpOnly") && cookie.contains("SameSite=Lax"),
            "{cookie}"
        );
        // The session is kept: the cookie signs the next request in.
        let pair = cookie.split(';').next().unwrap();
        let state: serde_json::Value = reqwest::Client::new()
            .get(r.url("/api/state"))
            .header("host", LAN)
            .header("cookie", pair)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(state["account"]["email"], "admin@casa.lan");
        assert_eq!(state["secure"], false, "the window is told it is on HTTP");
        // Any name typed is answered, by its address or its name.
        let named = sign_in_at(&r, "zima.local:7340", "http", &[]).await;
        assert_eq!(named.status().as_u16(), 200);
    });
}

#[test]
fn a_page_of_another_site_is_still_not_a_page_of_this_server() {
    block_on(async {
        let r = start_with(listening_on_the_network).await;
        let res = reqwest::Client::new()
            .post(r.url("/api/signin"))
            .header("host", LAN)
            .header("origin", "http://evil.example")
            .json(&json!({ "email": "admin@casa.lan", "password": "senha muito longa" }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 403);
    });
}

#[test]
fn a_public_address_keeps_the_host_rule_and_no_address_answers_any() {
    block_on(async {
        // With VERSO_PUBLIC_URL: that name, and this machine's.
        let r = start_with(|c| {
            listening_on_the_network(c);
            c.public_url = Some("http://notas.casa:7340".to_owned());
        })
        .await;
        assert_eq!(
            sign_in_at(&r, LAN, "http", &[]).await.status().as_u16(),
            421
        );
        assert_eq!(
            sign_in_at(&r, "notas.casa:7340", "http", &[])
                .await
                .status()
                .as_u16(),
            200
        );
        // Without it, listening on this machine only: a name that is not
        // this machine's is a page resolving its own name here (DNS
        // rebinding) and is refused, unless a believed proxy forwarded it.
        let local = start_with(|c| c.trusted_proxy = Proxies::private_networks()).await;
        assert_eq!(
            sign_in_at(&local, LAN, "http", &[]).await.status().as_u16(),
            421
        );
        let forwarded = sign_in_at(
            &local,
            "notas.casa",
            "https",
            &[
                ("x-forwarded-for", "203.0.113.9"),
                ("x-forwarded-proto", "https"),
            ],
        )
        .await;
        assert_eq!(forwarded.status().as_u16(), 200);
    });
}

#[test]
fn a_believed_proxy_saying_https_gets_the_secure_host_cookie() {
    block_on(async {
        // Nothing is set: the proxy on this machine is believed.
        let r = start_with(|c| c.trusted_proxy = Proxies::private_networks()).await;
        let res = sign_in_at(
            &r,
            "notas.casa",
            "https",
            &[
                ("x-forwarded-for", "203.0.113.9"),
                ("x-forwarded-proto", "https"),
            ],
        )
        .await;
        assert_eq!(res.status().as_u16(), 200);
        let cookie = set_cookie(&res);
        assert!(cookie.starts_with("__Host-verso-session="), "{cookie}");
        assert!(cookie.contains("; Secure"), "{cookie}");
        // The same proxy saying http: a plain cookie.
        let plain = sign_in_at(
            &r,
            "notas.casa",
            "http",
            &[
                ("x-forwarded-for", "203.0.113.9"),
                ("x-forwarded-proto", "http"),
            ],
        )
        .await;
        assert_eq!(plain.status().as_u16(), 200);
        assert!(!set_cookie(&plain).contains("Secure"));
    });
}

fn peer_of(
    server: &crate::state::Server,
    remote: &str,
    forwarded: Option<&str>,
) -> crate::auth::Peer {
    let mut headers = HeaderMap::new();
    if let Some(f) = forwarded {
        headers.insert("x-forwarded-for", f.parse().unwrap());
    }
    let ip: std::net::IpAddr = remote.parse().unwrap();
    let remote = SocketAddr::new(ip, 5000);
    crate::auth::peer(server, &headers, remote)
}

#[test]
fn the_default_believes_this_machine_and_the_private_networks_and_none_believes_no_one() {
    block_on(async {
        let r = start_with(|c| c.trusted_proxy = Proxies::private_networks()).await;
        for near in [
            "127.0.0.1",
            "192.168.1.5",
            "172.16.4.4",
            "10.9.9.9",
            "::1",
            "fd00::7",
        ] {
            let p = peer_of(&r.server, near, Some("203.0.113.9"));
            assert_eq!(p.addr.to_string(), "203.0.113.9", "{near}");
            assert!(p.forwarded, "{near}");
        }
        let far = peer_of(&r.server, "198.51.100.8", Some("203.0.113.9"));
        assert_eq!(far.addr.to_string(), "198.51.100.8");
        assert!(!far.forwarded);
        // `none`: a header from this machine is not believed either.
        let r = start_with(|c| c.trusted_proxy = Proxies::parse("none").unwrap()).await;
        let p = peer_of(&r.server, "192.168.1.5", Some("203.0.113.9"));
        assert_eq!(p.addr.to_string(), "192.168.1.5");
        assert!(!p.forwarded && !p.https);
        // An explicit value replaces the default.
        let r = start_with(|c| c.trusted_proxy = Proxies::parse("10.0.0.2").unwrap()).await;
        let p = peer_of(&r.server, "192.168.1.5", Some("203.0.113.9"));
        assert_eq!(p.addr.to_string(), "192.168.1.5");
    });
}
