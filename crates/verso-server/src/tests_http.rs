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

/// A refusal carries the sync header, so the desktop app can tell this
/// server's 401 from a router's login page without reading a body.
#[test]
fn a_refusal_says_whose_it_is() {
    block_on(async {
        let r = start_with(listening_on_the_network).await;
        let res = reqwest::Client::new()
            .get(r.url("/api/ws"))
            .header("host", LAN)
            .header("connection", "upgrade")
            .header("upgrade", "websocket")
            .header("sec-websocket-version", "13")
            .header("sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ==")
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 401);
        assert_eq!(
            res.headers()
                .get(verso_core::sync::PROTOCOL_HEADER)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned),
            Some(verso_core::sync::PROTOCOL.to_string())
        );
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
fn a_public_address_keeps_the_host_rule_and_no_address_answers_only_what_cannot_be_rebound() {
    block_on(async {
        let status = |r: &crate::tests::Running,
                      host: &'static str,
                      extra: &'static [(&'static str, &'static str)]| {
            let r_url = r.url("/api/signin");
            async move {
                let mut req = reqwest::Client::new()
                    .post(r_url)
                    .header("host", host)
                    .header("origin", format!("http://{host}"));
                for (k, v) in extra {
                    req = req.header(*k, *v);
                }
                req.json(&json!({ "email": "admin@casa.lan", "password": "senha muito longa" }))
                    .send()
                    .await
                    .unwrap()
                    .status()
                    .as_u16()
            }
        };
        // With VERSO_PUBLIC_URL: that name, and this machine's.
        let r = start_with(|c| {
            listening_on_the_network(c);
            c.public_url = Some("http://notas.casa:7340".to_owned());
        })
        .await;
        assert_eq!(status(&r, LAN, &[]).await, 421);
        assert_eq!(status(&r, "notas.casa:7340", &[]).await, 200);
        // (A test server holds one of a few places: let go of each.)
        drop(r);
        // Without it: the names a public page cannot make resolve here are
        // answered, so http://<ip>:7340 works with no variable...
        let r = start_with(listening_on_the_network).await;
        for host in [
            LAN,
            "zima.local:7340",
            "casa:7340",
            "nas.home.arpa",
            "[fd00::5]:7340",
            "localhost:7340",
        ] {
            assert_eq!(status(&r, host, &[]).await, 200, "{host}");
        }
        // ...and any other name needs VERSO_PUBLIC_URL (DNS rebinding).
        for host in [
            "evil.example:7340",
            "notas.casa",
            "x.local.evil.example",
            "1.2.3.4.evil.example",
            "[::1]:igin: x",
            "[fd00::5]x",
        ] {
            assert_eq!(status(&r, host, &[]).await, 421, "{host}");
        }
        drop(r);
        // The default list widens nothing: a rebound page on this machine
        // writes X-Forwarded-For itself, and loopback is believed.
        let local = start_with(|c| c.trusted_proxy = Proxies::private_networks()).await;
        let forged = &[("x-forwarded-for", "203.0.113.9")];
        assert_eq!(status(&local, "evil.example", forged).await, 421);
        drop(local);
        // A proxy the host named, having forwarded the request, is believed
        // about the name it carries.
        let named = start_with(|c| c.trusted_proxy = Proxies::parse("127.0.0.1").unwrap()).await;
        assert_eq!(status(&named, "notas.casa", forged).await, 200);
        assert_eq!(status(&named, "notas.casa", &[]).await, 421);
    });
}

/// B13 (ADR 0073, decided 2026-10-31): with a public address, a browser that
/// comes by another name is shown a page in both languages naming the right
/// address; the status stays 421, and an API call, a WebSocket and a request
/// that does not ask for HTML keep the JSON refusal.
#[test]
fn a_browser_at_the_old_address_is_shown_the_right_one_and_a_client_keeps_the_json() {
    block_on(async {
        let r = start_with(|c| {
            listening_on_the_network(c);
            c.public_url = Some("https://universo.casa.lan".to_owned());
        })
        .await;
        let get = |path: &'static str, accept: Option<&'static str>, lang: Option<&'static str>| {
            let url = r.url(path);
            async move {
                let mut req = reqwest::Client::new().get(url).header("host", LAN);
                if let Some(a) = accept {
                    req = req.header("accept", a);
                }
                if let Some(l) = lang {
                    req = req.header("accept-language", l);
                }
                req.send().await.unwrap()
            }
        };
        let browser = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";
        let res = get("/", Some(browser), Some("pt-BR,pt;q=0.9")).await;
        assert_eq!(res.status().as_u16(), 421);
        assert!(
            res.headers()["content-type"]
                .to_str()
                .unwrap()
                .starts_with("text/html")
        );
        assert_eq!(res.headers()["cache-control"], "no-store");
        assert!(
            res.headers()["content-security-policy"]
                .to_str()
                .unwrap()
                .starts_with("default-src 'none'")
        );
        let body = res.text().await.unwrap();
        assert!(
            body.contains("<a href=\"https://universo.casa.lan\">"),
            "{body}"
        );
        assert!(body.contains("Este endereço mudou") && body.contains("This address has changed"));
        assert!(body.find("Este endere").unwrap() < body.find("This address").unwrap());
        // Nothing of what was sent is written into the page.
        assert!(!body.contains(LAN), "{body}");
        let en = get("/anything", Some(browser), Some("en-US")).await;
        let body = en.text().await.unwrap();
        assert!(body.find("This address").unwrap() < body.find("Este endere").unwrap());
        // The same 421 for a client: JSON for the API, for no Accept and for
        // a request that asks for JSON.
        for (path, accept) in [
            ("/api/signin", Some(browser)),
            ("/", None),
            ("/", Some("application/json")),
        ] {
            let res = get(path, accept, None).await;
            assert_eq!(res.status().as_u16(), 421, "{path}");
            let body: serde_json::Value = res.json().await.unwrap();
            assert_eq!(body["error"], "host", "{path}");
        }
        drop(r);
        // With no public address there is none to name: the JSON, still.
        let r = start_with(listening_on_the_network).await;
        let res = reqwest::Client::new()
            .get(r.url("/"))
            .header("host", "evil.example:7340")
            .header("accept", browser)
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 421);
        assert!(
            res.headers()["content-type"]
                .to_str()
                .unwrap()
                .starts_with("application/json")
        );
    });
}

#[test]
fn a_believed_proxy_saying_https_gets_the_secure_host_cookie() {
    block_on(async {
        // The proxy is named, so the name it carries is answered; with no
        // public address the default list would answer an IP, not this.
        let r = start_with(|c| c.trusted_proxy = Proxies::parse("127.0.0.1").unwrap()).await;
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
        drop(r);
        // `none`: a header from this machine is not believed either.
        let r = start_with(|c| c.trusted_proxy = Proxies::parse("none").unwrap()).await;
        let p = peer_of(&r.server, "192.168.1.5", Some("203.0.113.9"));
        assert_eq!(p.addr.to_string(), "192.168.1.5");
        assert!(!p.forwarded && !p.https);
        drop(r);
        // An explicit value replaces the default.
        let r = start_with(|c| c.trusted_proxy = Proxies::parse("10.0.0.2").unwrap()).await;
        let p = peer_of(&r.server, "192.168.1.5", Some("203.0.113.9"));
        assert_eq!(p.addr.to_string(), "192.168.1.5");
    });
}

/// A believed peer that writes `X-Forwarded-For: 127.0.0.1` is not this
/// machine: it is counted, paced and capped under that address (with the
/// default list every private address is believed, and in Docker every
/// published-port visitor comes from the bridge gateway). Only a socket
/// from loopback that forwarded nothing is exempt (ADR 0083 item 7).
#[test]
fn a_forwarded_loopback_is_never_this_machine() {
    block_on(async {
        let r = start_with(|c| c.trusted_proxy = Proxies::private_networks()).await;
        let local =
            |remote: &str, forwarded: Option<&str>| peer_of(&r.server, remote, forwarded).local;
        assert!(local("127.0.0.1", None), "this machine, forwarding nothing");
        assert!(
            !local("127.0.0.1", Some("127.0.0.1")),
            "this machine, but forwarding loopback"
        );
        assert!(
            !local("192.168.1.5", Some("127.0.0.1")),
            "a LAN peer forging loopback"
        );
        assert!(
            !local("172.17.0.1", Some("127.0.0.1")),
            "the Docker gateway forging loopback"
        );
        assert!(
            !local("192.168.1.5", None),
            "a LAN peer is not this machine"
        );
        // The REST pace counts it: the 101st request of a burst is 429.
        r.server.pace.freeze();
        let client = reqwest::Client::new();
        for i in 1..=100 {
            let res = client
                .get(r.url("/api/state"))
                .header("x-forwarded-for", "127.0.0.1")
                .send()
                .await
                .unwrap();
            assert_eq!(res.status().as_u16(), 200, "request {i}");
        }
        let res = client
            .get(r.url("/api/state"))
            .header("x-forwarded-for", "127.0.0.1")
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 429, "the 101st, forged as loopback");
        // Forwarding nothing, from this machine: not paced.
        for i in 1..=150 {
            let res = client.get(r.url("/api/state")).send().await.unwrap();
            assert_eq!(res.status().as_u16(), 200, "direct request {i}");
        }
    });
}

fn mails(r: &crate::tests::Running) -> Vec<(String, String, String)> {
    match r.server.mail.get() {
        Some(crate::mail::Mail::Memory(m)) => verso_service::lock(m).clone(),
        _ => Vec::new(),
    }
}

/// A link by e-mail is built from `VERSO_PUBLIC_URL` alone. Anyone may ask
/// for one without signing in, and the `Host` they write must never reach
/// the victim's mail (the reset token would go to the attacker's server):
/// without a public address the routes are refused and `/api/state` says
/// there is no mail (ADR 0073 item 6, amended 2026-10-16).
#[test]
fn links_by_mail_exist_only_with_a_public_address_and_never_carry_the_host() {
    block_on(async {
        let ask = |r: &crate::tests::Running, route: &'static str, host: String| {
            let url = r.url(route);
            async move {
                let res = reqwest::Client::new()
                    .post(url)
                    .header("host", host.clone())
                    .header("origin", format!("http://{host}"))
                    .json(&json!({ "email": "admin@casa.lan" }))
                    .send()
                    .await
                    .unwrap();
                let status = res.status().as_u16();
                (
                    status,
                    res.json::<serde_json::Value>().await.unwrap_or_default(),
                )
            }
        };
        // No public address, an IP-literal Host the asker wrote.
        let r = start_with(listening_on_the_network).await;
        let _ = r
            .server
            .mail
            .set(crate::mail::Mail::Memory(std::sync::Mutex::new(Vec::new())));
        for route in ["/api/forgot", "/api/signin/link"] {
            let (status, body) = ask(&r, route, "6.6.6.6:7340".to_owned()).await;
            assert_eq!(
                (status, body["error"].as_str()),
                (400, Some("no_mail")),
                "{route}"
            );
            assert!(
                body["message"]
                    .as_str()
                    .unwrap()
                    .contains("VERSO_PUBLIC_URL")
            );
        }
        let state: serde_json::Value = reqwest::Client::new()
            .get(r.url("/api/state"))
            .header("host", "6.6.6.6:7340")
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(
            state["mail"], false,
            "the sign-in page must hide the links by mail"
        );
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        assert!(mails(&r).is_empty(), "nothing was mailed");
        drop(r);
        // With one, the mailed link starts with it.
        let r = start_with(|c| c.public_url = Some("@self".into())).await;
        let _ = r
            .server
            .mail
            .set(crate::mail::Mail::Memory(std::sync::Mutex::new(Vec::new())));
        let own = format!("localhost:{}", r.addr().port());
        let (status, _) = ask(&r, "/api/forgot", own.clone()).await;
        assert_eq!(status, 200);
        let mut sent = mails(&r);
        for _ in 0..100 {
            if !sent.is_empty() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            sent = mails(&r);
        }
        assert_eq!(sent.len(), 1);
        assert!(
            sent[0].2.contains(&format!("http://{own}/reset/")),
            "{}",
            sent[0].2
        );
        // A forged Host is a 421 before any mail route: the public address
        // keeps the name.
        let (status, _) = ask(&r, "/api/forgot", "6.6.6.6:7340".to_owned()).await;
        assert_eq!(status, 421);
    });
}

/// The WebSocket cap per address keeps counting a believed peer that forges
/// `X-Forwarded-For: 127.0.0.1`: only a loopback socket that forwarded
/// nothing is "the proxy in front, speaking for everyone" (ADR 0083
/// item 7). Three accounts, each within its own 32, from one forged address:
/// the 65th connection is refused; from this machine itself it is not.
#[test]
fn the_websocket_cap_counts_a_forged_loopback_and_not_this_machine() {
    block_on(async {
        let r = start_with(|c| c.trusted_proxy = Proxies::private_networks()).await;
        let who = |n: usize| {
            let account = r
                .server
                .db
                .create_account(&format!("ws{n}@casa.lan"), "Ws", "pt", None, false)
                .unwrap();
            crate::auth::Who {
                account,
                via: crate::auth::Via::Browser {
                    session: format!("s{n}"),
                    csrf: String::new(),
                },
                phone: None,
            }
        };
        let accounts = [who(1), who(2), who(3)];
        let ctx = |remote: &str, forwarded: Option<&str>| crate::http::Ctx {
            server: std::sync::Arc::clone(&r.server),
            peer: peer_of(&r.server, remote, forwarded),
            who: None,
            headers: HeaderMap::new(),
            method: axum::http::Method::GET,
        };
        // A believed LAN peer writing 127.0.0.1.
        let forged = ctx("192.168.1.5", Some("127.0.0.1"));
        assert!(!forged.peer.local && forged.peer.addr.is_loopback());
        let mut held = Vec::new();
        for n in 0..64 {
            match crate::rpc::places(&forged, &accounts[n / 32]) {
                Ok((places, _)) => held.push(places),
                Err(e) => panic!("connection {n} refused: {}", e.status),
            }
        }
        let refused = crate::rpc::places(&forged, &accounts[2]);
        assert_eq!(
            refused.err().map(|e| e.status.as_u16()),
            Some(429),
            "the 65th"
        );
        drop(held);
        // This machine, forwarding nothing, is not counted per address.
        let here = ctx("127.0.0.1", None);
        assert!(here.peer.local);
        let mut held = Vec::new();
        for n in 0..96 {
            match crate::rpc::places(&here, &accounts[n / 32]) {
                Ok((places, _)) => held.push(places),
                Err(e) => panic!("local connection {n} refused: {}", e.status),
            }
        }
    });
}

/// A folders directory the server cannot write (a bind mount Docker made as
/// root): the start says so, and making a folder answers with the sentence
/// and its own code, not "making the folder: Permission denied (os error
/// 13)" (ADR 0075 item 3, amended 2026-10-16).
#[test]
fn a_folder_cannot_be_made_in_a_directory_the_server_cannot_write_and_it_says_so() {
    block_on(async {
        let r = start_with(|_| {}).await;
        let dir = r.server.config.folders_dir.clone();
        let b = crate::tests::sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        verso_fs::server::set_writable_for_tests(&dir, false).unwrap();
        let found = crate::storage::check(&r.server.config.data_dir, &dir);
        let (status, body) =
            crate::tests::post(&r, "/api/folders", json!({ "name": "Nova" }), Some(&b)).await;
        verso_fs::server::set_writable_for_tests(&dir, true).unwrap();
        if found.is_empty() {
            return; // as root nothing is denied
        }
        assert_eq!(found[0].dir, dir.display().to_string());
        assert_eq!(
            (status, body["error"].as_str()),
            (500, Some("not_writable")),
            "{body}"
        );
        let said = body["message"].as_str().unwrap();
        assert!(
            said.contains("cannot write to") && said.contains("sudo chown -R 1000:1000"),
            "{said}"
        );
        assert!(!said.contains("os error 13"), "{said}");
    });
}

/// A data directory the server cannot write is a server that cannot start,
/// and it says so in words, before SQLite says "unable to open the database"
/// (ADR 0075 item 3, amended 2026-10-16).
#[test]
fn an_unwritable_data_directory_stops_the_start_with_the_sentence() {
    block_on(async {
        let r = start_with(|_| {}).await;
        let data = tempfile::tempdir().unwrap();
        verso_fs::server::set_writable_for_tests(data.path(), false).unwrap();
        let mut config = r.server.config.clone();
        config.data_dir = data.path().to_path_buf();
        let tried = crate::prepare(&config);
        verso_fs::server::set_writable_for_tests(data.path(), true).unwrap();
        // As root nothing is denied.
        if let Err(said) = tried {
            assert!(
                said.contains("cannot write to") && said.contains("sudo chown"),
                "{said}"
            );
            assert!(!said.contains("os error 13"), "{said}");
        }
    });
}
