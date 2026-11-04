// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The internet link's door (ADR 0117 D3 items 3 and 4) through the real
//! server: a plain-HTTP listener on loopback, beside the network's or
//! alone, that answers the link's name and no other, believes the address
//! the tunnel forwards and no client-written one, and leaves the network's
//! listener as ADR 0096 built it. See `tests.rs` for the lab.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::http::HeaderMap;
use serde_json::{Value, json};

use super::tests::{Lab, lab, run};
use super::{LocalSettings, lock};
use crate::db::Role;
use crate::state::Server;

const NAME: &str = "abstract-simpson-player.trycloudflare.com";
const ORIGIN: &str = "https://abstract-simpson-player.trycloudflare.com";

/// A request as the tunnel makes it to the link's listener: the link's
/// `Host`, the client's address appended to `X-Forwarded-For`, HTTPS said.
fn through(
    client: &reqwest::Client,
    method: reqwest::Method,
    port: u16,
    path: &str,
    host: &str,
) -> reqwest::RequestBuilder {
    client
        .request(method, format!("http://127.0.0.1:{port}{path}"))
        .header("host", host)
        .header("x-forwarded-for", "203.0.113.9")
        .header("x-forwarded-proto", "https")
}

async fn status_of(r: reqwest::RequestBuilder) -> u16 {
    r.send().await.unwrap().status().as_u16()
}

fn running_server(lab: &Lab) -> Arc<Server> {
    Arc::clone(&lock(&lab.local.shared.inner).as_ref().unwrap().server)
}

/// The link's listener answers its name and no other: not a loopback name,
/// not the network's address, nothing while the link has no address, and
/// nothing again once it is forgotten; the network's listener does not
/// answer the link's name. The window's state through it says HTTPS.
#[test]
fn the_link_answers_its_own_name_alone() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        assert_eq!(lab.local.link_open().unwrap(), port, "open is said once");
        let plain = reqwest::Client::new();
        let get = |host: &str| through(&plain, reqwest::Method::GET, port, "/api/state", host);
        // No address yet: nothing is answered, whatever the name.
        for host in [NAME, &format!("127.0.0.1:{port}"), "localhost"] {
            assert_eq!(status_of(get(host)).await, 421, "{host} before an address");
        }
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let res = get(&NAME.to_uppercase()).send().await.unwrap();
        assert_eq!(res.status().as_u16(), 200);
        let state: Value = res.json().await.unwrap();
        assert_eq!(state["secure"], true, "the tunnel's https: {state}");
        assert_eq!(state["local"], true);
        for host in [
            format!("127.0.0.1:{port}"),
            format!("127.0.0.1:{}", lab.port),
            "localhost".to_owned(),
            format!("localhost:{port}"),
            "[::1]".to_owned(),
            "evil.example".to_owned(),
            format!("{NAME}.evil.example"),
        ] {
            assert_eq!(status_of(get(&host)).await, 421, "{host} on the link");
        }
        // The network's listener: its own address as before, never the link's.
        let lan = |host: &str| lab.client.get(lab.url("/api/state")).header("host", host);
        assert_eq!(status_of(lab.client.get(lab.url("/api/state"))).await, 200);
        assert_eq!(
            status_of(lan(NAME)).await,
            421,
            "the link's name on the network"
        );
        // Forgotten: refused at once.
        lab.local.set_link_origin(None).unwrap();
        assert_eq!(
            status_of(get(NAME)).await,
            421,
            "after the address is forgotten"
        );
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        assert_eq!(status_of(get(NAME)).await, 200);
        // Closed: nothing listens there, and the network serves on.
        lab.local.link_close();
        assert!(get(NAME).send().await.is_err(), "the link's port is closed");
        assert_eq!(status_of(lab.client.get(lab.url("/api/state"))).await, 200);
        assert!(lab.local.set_link_origin(Some(ORIGIN)).is_err());
        assert_eq!(lab.local.status().unwrap().link_port, None);
    });
}

/// The `Origin` a change needs follows the listener: the link's origin on
/// the link, the network's on the network, never the one for the other.
#[test]
fn the_origin_checked_is_the_links_on_the_link_alone() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let plain = reqwest::Client::new();
        let sign_out = |origin: &str| {
            through(&plain, reqwest::Method::POST, port, "/api/signout", NAME)
                .header("origin", origin)
                .json(&json!({}))
        };
        assert_eq!(status_of(sign_out(ORIGIN)).await, 200);
        for wrong in [
            format!("http://127.0.0.1:{port}"),
            lab.origin(),
            format!("http://{NAME}"),
            "https://evil.example".to_owned(),
        ] {
            assert_eq!(status_of(sign_out(&wrong)).await, 403, "{wrong}");
        }
        let on_lan = |origin: &str| {
            lab.client
                .post(lab.url("/api/signout"))
                .header("origin", origin)
                .json(&json!({}))
        };
        assert_eq!(status_of(on_lan(&lab.origin())).await, 200);
        assert_eq!(
            status_of(on_lan(ORIGIN)).await,
            403,
            "the link's origin on the network"
        );
    });
}

/// The address the tunnel forwards — the rightmost of `X-Forwarded-For`,
/// which a client cannot forge (the spike of 2026-11-03) — is the client's
/// on the link, and what a client wrote before it is not; a forwarded
/// loopback is counted, never "this machine". On the network's listener
/// the same header is ignored: the socket's address is the client's.
#[test]
fn the_tunnels_address_is_believed_on_the_link_and_nowhere_else() {
    run(async {
        let mut lab = lab();
        lab.serve();
        lab.local.link_open().unwrap();
        let server = running_server(&lab);
        let remote: SocketAddr = "127.0.0.1:50000".parse().unwrap();
        let headers = |xff: &str, proto: Option<&str>| {
            let mut h = HeaderMap::new();
            h.insert("x-forwarded-for", xff.parse().unwrap());
            if let Some(p) = proto {
                h.insert("x-forwarded-proto", p.parse().unwrap());
            }
            h
        };
        let forged = headers("1.2.3.4, 10.0.0.1,203.0.113.9", Some("https"));
        let link = crate::auth::peer(&server, &forged, remote, true);
        assert_eq!(link.addr.to_string(), "203.0.113.9");
        assert!(link.link && link.https && link.forwarded && !link.local);
        assert_eq!(
            crate::auth::client_key(&server, &forged, remote, true).as_deref(),
            Some("203.0.113.9")
        );
        let looped = headers("127.0.0.1", None);
        let peer = crate::auth::peer(&server, &looped, remote, true);
        assert!(
            !peer.local && !peer.https,
            "a forwarded loopback is counted"
        );
        assert_eq!(
            crate::auth::client_key(&server, &looped, remote, true).as_deref(),
            Some("127.0.0.1")
        );
        // The network's listener: no proxy is believed, as before.
        let lan = crate::auth::peer(&server, &forged, remote, false);
        assert_eq!(lan.addr, remote.ip());
        assert!(!lan.link && !lan.forwarded && lan.https, "own TLS: {lan:?}");
    });
}

/// With *On my network* unticked the link serves alone: no address of the
/// network, no certificate, no pairing, and a change of network does not
/// stop it; closing the link stops serving. Neither box is no start.
#[test]
fn the_link_serves_alone_when_the_network_box_is_unticked() {
    run(async {
        let lab = lab();
        let settings = lab.local.settings().unwrap();
        lab.local
            .set_settings(&LocalSettings {
                network: false,
                ..settings
            })
            .unwrap();
        let refused = lab.local.start().unwrap_err();
        assert!(refused.contains("On my network"), "{refused}");
        assert!(!lab.local.status().unwrap().serving);
        let port = lab.local.link_open().unwrap();
        let status = lab.local.status().unwrap();
        assert!(status.serving);
        assert_eq!(
            (status.port, status.addresses.len(), status.link_port),
            (None, 0, Some(port))
        );
        assert_eq!(status.fingerprint, None);
        assert!(lab.local.pair_open().is_err(), "pairing is on the network");
        // The network changes: the link alone does not care.
        *lab.table.0.lock().unwrap() = vec![super::tests::net("127.0.0.2")];
        let id = lock(&lab.local.shared.inner).as_ref().unwrap().id;
        assert!(lab.local.watch_once(id, true));
        assert!(lab.local.status().unwrap().serving);
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let plain = reqwest::Client::new();
        let state = through(&plain, reqwest::Method::GET, port, "/api/state", NAME);
        assert_eq!(status_of(state).await, 200);
        lab.local.link_close();
        assert!(!lab.local.status().unwrap().serving);
    });
}

/// The link opened beside the network takes nothing from it: a phone
/// paired before reads on, and pairing is never answered through the link.
#[test]
fn the_link_beside_the_network_leaves_phones_and_pairing_as_they_were() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Reader).await.unwrap();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let (status, _) = lab.get("/api/folders", Some(&cookie)).await;
        assert_eq!(status, 200);
        let view = lab.local.pair_open().unwrap();
        let plain = reqwest::Client::new();
        for path in ["/api/pair", "/api/pair/poll"] {
            let res = through(&plain, reqwest::Method::POST, port, path, NAME)
                .header("origin", ORIGIN)
                .json(&json!({ "token": Lab::token(&view), "poll": "p" }));
            assert_eq!(status_of(res).await, 404, "{path} through the link");
        }
        assert!(lab.local.pair_state().asked.is_none());
        assert!(
            lab.local.pair_state().open,
            "the window is the network's still"
        );
    });
}

/// The links the server hands out are built from the link's origin while
/// it has one, and are a path otherwise (the window adds its address).
#[test]
fn links_handed_out_carry_the_links_origin() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let server = running_server(&lab);
        assert_eq!(crate::window_link(&server, "/invite/abc"), "/invite/abc");
        lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        assert_eq!(
            crate::window_link(&server, "/invite/abc"),
            format!("{ORIGIN}/invite/abc")
        );
        lab.local.link_close();
        assert_eq!(crate::window_link(&server, "/invite/abc"), "/invite/abc");
    });
}
