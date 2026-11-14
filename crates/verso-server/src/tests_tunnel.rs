// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A UniVerso's own Cloudflare link (ADR 0117 D4 item 2, R5), through the
//! real server and a stand-in `cloudflared` — a script that prints what the
//! spikes saw and sleeps; no test reaches the network or runs the real
//! one. What it holds: the link's `Host` and `Origin` follow the origin the
//! tunnel says at runtime, a new link's at once and the old one's no more;
//! the address the tunnel forwards keys the limits and a client-written
//! `X-Forwarded-For` moves none; the console's routes are an admin's, the
//! ones that turn it on with a fresh proof.

#![cfg(unix)]

use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use crate::tests::{Browser, Running, block_on, get, post, sign_in, start, start_with};
use crate::tests_prove::{prove, prove_first, send, stale};
use crate::tunnel::{Ask, Link, Program};

const FIRST: &str = "abstract-simpson-player-passes.trycloudflare.com";
const SECOND: &str = "second-quick-link-here.trycloudflare.com";

/// The waits, short: the stand-in registers at once.
const TIMING: verso_tunnel::run::Timing = verso_tunnel::run::Timing {
    url: Duration::from_secs(5),
    quic: Duration::from_secs(3),
    http2: Duration::from_secs(3),
    grace: Duration::from_secs(1),
    watch_every: Duration::from_millis(200),
};

/// A stand-in `cloudflared` in `dir` giving the quick link written in
/// `dir/url` at each run (so that a second run is a new link), then
/// registering and sleeping.
fn stand_in(dir: &Path, name: &str) -> std::path::PathBuf {
    crate::data::write_for_tests(&dir.join("url"), &format!("https://{name}"));
    let program = dir.join("cloudflared");
    crate::data::write_script_for_tests(
        &program,
        "#!/bin/sh\n\
         here=$(dirname \"$0\")\n\
         url=$(cat \"$here/url\")\n\
         echo '2026-11-14T03:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...' >&2\n\
         echo '2026-11-14T03:00:01Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |' >&2\n\
         echo \"2026-11-14T03:00:01Z INF |  $url   |\" >&2\n\
         echo '2026-11-14T03:00:02Z INF Registered tunnel connection connIndex=0 location=gru20 protocol=quic' >&2\n\
         exec sleep 600\n",
    );
    program
}

/// The server's link with the stand-in.
fn link_of(r: &Running, program: &Path) -> Arc<Link> {
    // The runtime the listener is opened on, before the server's own task
    // may have said it.
    let _ = r.server.runtime.set(tokio::runtime::Handle::current());
    let link = Arc::new(Link::with_timing(
        &r.server,
        Program::Given(program.to_path_buf()),
        TIMING,
    ));
    assert!(r.server.tunnel.set(Arc::clone(&link)).is_ok());
    link
}

/// A request as the tunnel makes it to the link's listener: the `Host` it
/// was asked by, the client's address appended to what the client wrote in
/// `X-Forwarded-For`, HTTPS said.
fn through(
    port: u16,
    method: reqwest::Method,
    path: &str,
    host: &str,
    forwarded: &str,
) -> reqwest::RequestBuilder {
    reqwest::Client::builder()
        .pool_max_idle_per_host(0)
        .build()
        .unwrap()
        .request(method, format!("http://127.0.0.1:{port}{path}"))
        .header("host", host)
        .header("x-forwarded-for", forwarded)
        .header("x-forwarded-proto", "https")
}

async fn status(r: reqwest::RequestBuilder) -> u16 {
    r.send().await.unwrap().status().as_u16()
}

/// Turn the link on off the runtime, as the console does.
async fn on(link: &Arc<Link>) -> verso_tunnel::LinkView {
    let link = Arc::clone(link);
    tokio::task::spawn_blocking(move || link.turn_on(&Ask::Quick))
        .await
        .unwrap()
        .unwrap()
}

async fn off(link: &Arc<Link>) {
    let link = Arc::clone(link);
    tokio::task::spawn_blocking(move || link.turn_off(verso_tunnel::LinkEnd::Stopped))
        .await
        .unwrap();
}

/// The link's listener answers the name the tunnel said and no other —
/// not the server's own address, not a loopback name — and the `Origin` a
/// change needs is the link's; turned off, nothing listens; turned on
/// again, the new link's name is answered at once and the old one's no
/// more, with no restart. The links the server hands out name the link
/// while it is on, and the server's own listener is as before throughout.
#[test]
fn host_and_origin_follow_the_links_origin_as_it_starts_and_changes() {
    block_on(async {
        let r = start().await;
        let bin = tempfile::tempdir().unwrap();
        let link = link_of(&r, &stand_in(bin.path(), FIRST));
        assert_eq!(r.server.public_origin(), None, "no address before the link");
        let view = on(&link).await;
        assert_eq!(view.state, verso_tunnel::LinkState::On);
        assert_eq!(view.origin.as_deref(), Some(&*format!("https://{FIRST}")));
        let port = link.port().unwrap();
        let state = |host: &str| {
            through(
                port,
                reqwest::Method::GET,
                "/api/state",
                host,
                "203.0.113.9",
            )
        };
        let res = state(FIRST).send().await.unwrap();
        assert_eq!(res.status().as_u16(), 200);
        let body: Value = res.json().await.unwrap();
        assert_eq!(body["secure"], true, "the tunnel's https: {body}");
        for host in [
            format!("127.0.0.1:{port}"),
            format!("localhost:{}", r.addr.port()),
            "localhost".to_owned(),
            SECOND.to_owned(),
            format!("{FIRST}.evil.example"),
        ] {
            assert_eq!(status(state(&host)).await, 421, "{host} on the link");
        }
        let sign_out = |host: &str, origin: &str| {
            through(
                port,
                reqwest::Method::POST,
                "/api/signout",
                host,
                "203.0.113.9",
            )
            .header("origin", origin)
            .json(&json!({}))
        };
        assert_eq!(
            status(sign_out(FIRST, &format!("https://{FIRST}"))).await,
            200
        );
        for wrong in [
            r.origin(),
            format!("http://{FIRST}"),
            format!("https://{SECOND}"),
        ] {
            assert_eq!(status(sign_out(FIRST, &wrong)).await, 403, "{wrong}");
        }
        // The links handed out name the link (no `VERSO_PUBLIC_URL` here).
        assert_eq!(
            r.server.public_origin().as_deref(),
            Some(&*format!("https://{FIRST}"))
        );
        assert_eq!(
            crate::window_link(&r.server, "/invite/x"),
            format!("https://{FIRST}/invite/x")
        );
        // The server's own listener: its own name as before, never the link's.
        let own = reqwest::Client::new().get(r.url("/api/state"));
        assert_eq!(status(own).await, 200);
        let named = reqwest::Client::new()
            .get(r.url("/api/state"))
            .header("host", FIRST);
        assert_eq!(
            status(named).await,
            421,
            "the link's name on the server's own"
        );

        // Off: nothing listens, and no address is named.
        off(&link).await;
        assert!(
            state(FIRST).send().await.is_err(),
            "the link's port is closed"
        );
        assert_eq!(link.port(), None);
        assert_eq!(r.server.public_origin(), None);
        assert_eq!(crate::window_link(&r.server, "/invite/x"), "/invite/x");

        // A new link: its name at once, the old one's no more.
        crate::data::write_for_tests(&bin.path().join("url"), &format!("https://{SECOND}"));
        on(&link).await;
        let port = link.port().unwrap();
        let state = |host: &str| {
            through(
                port,
                reqwest::Method::GET,
                "/api/state",
                host,
                "203.0.113.9",
            )
        };
        assert_eq!(status(state(SECOND)).await, 200);
        assert_eq!(status(state(FIRST)).await, 421, "the old link's name");
        let sign_out = |origin: &str| {
            through(
                port,
                reqwest::Method::POST,
                "/api/signout",
                SECOND,
                "203.0.113.9",
            )
            .header("origin", origin)
            .json(&json!({}))
        };
        assert_eq!(status(sign_out(&format!("https://{SECOND}"))).await, 200);
        assert_eq!(status(sign_out(&format!("https://{FIRST}"))).await, 403);
        assert_eq!(
            r.server.public_origin().as_deref(),
            Some(&*format!("https://{SECOND}"))
        );
        off(&link).await;
    });
}

/// `VERSO_PUBLIC_URL`, when set, still names the links that leave, link
/// or no link; the link's listener answers the link's name all the same.
#[test]
fn the_public_url_set_keeps_naming_the_links() {
    block_on(async {
        let r = start_with(|c| c.public_url = Some("https://notas.casa".to_owned())).await;
        let bin = tempfile::tempdir().unwrap();
        let link = link_of(&r, &stand_in(bin.path(), FIRST));
        on(&link).await;
        assert_eq!(
            r.server.public_origin().as_deref(),
            Some("https://notas.casa")
        );
        let port = link.port().unwrap();
        let state = through(
            port,
            reqwest::Method::GET,
            "/api/state",
            FIRST,
            "203.0.113.9",
        );
        assert_eq!(status(state).await, 200);
        off(&link).await;
    });
}

/// Wrong passwords through the link are counted under the address the
/// tunnel forwarded — the rightmost of `X-Forwarded-For` — and what a
/// client wrote before it moves nothing: a new forged address finds the
/// same delay, and another real client has its own count. On the server's
/// own listener, the header is not believed at all (no proxy named).
#[test]
fn a_forged_forwarded_address_moves_no_limit() {
    block_on(async {
        let r = start().await;
        let bin = tempfile::tempdir().unwrap();
        let link = link_of(&r, &stand_in(bin.path(), FIRST));
        on(&link).await;
        let port = link.port().unwrap();
        let origin = format!("https://{FIRST}");
        let wrong = |forwarded: &str, email: &str| {
            through(port, reqwest::Method::POST, "/api/signin", FIRST, forwarded)
                .header("origin", &origin)
                .json(&json!({ "email": email, "password": "errada" }))
        };
        for n in 0..3 {
            let forged = format!("10.0.{n}.1, 203.0.113.9");
            assert_eq!(status(wrong(&forged, "admin@casa.lan")).await, 401, "{n}");
        }
        // A new forged address before the tunnel's, another e-mail: the
        // same address, the same delay.
        assert_eq!(
            status(wrong("1.2.3.4, 127.0.0.1, 203.0.113.9", "ninguem@casa.lan")).await,
            429
        );
        // Another client, another count.
        assert_eq!(status(wrong("198.51.100.7", "outro@casa.lan")).await, 401);
        // As `crate::auth` reads them.
        let remote: std::net::SocketAddr = "127.0.0.1:50000".parse().unwrap();
        let mut h = axum::http::HeaderMap::new();
        h.insert("x-forwarded-for", "1.2.3.4, 203.0.113.9".parse().unwrap());
        assert_eq!(
            crate::auth::client_key(&r.server, &h, remote, true).as_deref(),
            Some("203.0.113.9")
        );
        let peer = crate::auth::peer(&r.server, &h, remote, false);
        assert_eq!(peer.addr, remote.ip(), "not believed on the server's own");
        assert!(!peer.link && !peer.forwarded);
        off(&link).await;
    });
}

fn id_of(r: &Running, email: &str) -> String {
    r.server.db.account_by_email(email).unwrap().unwrap().id
}

/// A member who is not an admin, signed in.
async fn member(r: &Running, admin: &Browser) -> Browser {
    let (_, made) = post(
        r,
        "/api/admin/accounts",
        json!({ "email": "outro@casa.lan", "name": "Outro", "lang": "pt" }),
        Some(admin),
    )
    .await;
    let token = made["link"].as_str().unwrap().rsplit('/').next().unwrap();
    let (status, _) = post(
        r,
        &format!("/api/reset/{token}"),
        json!({ "password": "a senha do outro" }),
        None,
    )
    .await;
    assert_eq!(status, 200);
    sign_in(r, "outro@casa.lan", "a senha do outro").await
}

/// Wait until the link is `state` (the console's start runs on a thread).
async fn until_state(r: &Running, admin: &Browser, state: &str) -> Value {
    let until = Instant::now() + Duration::from_secs(10);
    loop {
        let (_, view) = get(r, "/api/admin/link", Some(admin)).await;
        if view["state"] == state || Instant::now() >= until {
            return view;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

/// The console's link: read by an admin alone; turned on and extended by
/// an admin with a fresh proof, turned off by an admin; each act in the
/// audit log; a stranger and a member are refused; the token is never
/// shown, only whether the environment set one.
#[test]
fn the_consoles_link_is_an_admins_with_a_fresh_proof_to_turn_it_on() {
    block_on(async {
        let r = start().await;
        let bin = tempfile::tempdir().unwrap();
        link_of(&r, &stand_in(bin.path(), FIRST));
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let other = member(&r, &admin).await;
        assert_eq!(get(&r, "/api/admin/link", None).await.0, 401);
        assert_eq!(get(&r, "/api/admin/link", Some(&other)).await.0, 403);
        let quick = json!({ "mode": "quick" });
        for (method, path, body) in [
            (
                reqwest::Method::POST,
                "/api/admin/link",
                Some(quick.clone()),
            ),
            (reqwest::Method::POST, "/api/admin/link/extend", None),
            (reqwest::Method::DELETE, "/api/admin/link", None),
        ] {
            assert_eq!(send(&r, method, path, body, &other).await.0, 403, "{path}");
        }
        let (code, view) = get(&r, "/api/admin/link", Some(&admin)).await;
        assert_eq!(code, 200);
        assert_eq!(view["state"], "off");
        assert_eq!(view["atStart"], "off");
        assert_eq!(view["tokenSet"], false);
        // Stale: turning it on and extending it want a proof first.
        let me = id_of(&r, "admin@casa.lan");
        stale(&r, &me);
        assert_eq!(
            send(
                &r,
                reqwest::Method::POST,
                "/api/admin/link",
                Some(quick.clone()),
                &admin
            )
            .await,
            prove_first()
        );
        assert_eq!(
            send(
                &r,
                reqwest::Method::POST,
                "/api/admin/link/extend",
                None,
                &admin
            )
            .await,
            prove_first()
        );
        assert_eq!(until_state(&r, &admin, "off").await["state"], "off");
        let (status, _) = prove(&r, &admin, "senha muito longa").await;
        assert_eq!(status, 200);
        let bad = json!({ "mode": "everything" });
        assert_eq!(
            send(
                &r,
                reqwest::Method::POST,
                "/api/admin/link",
                Some(bad),
                &admin
            )
            .await
            .0,
            400
        );
        let own = json!({ "mode": "own", "hostname": "mesa.example.com", "token": "curto" });
        let (code, said) = send(
            &r,
            reqwest::Method::POST,
            "/api/admin/link",
            Some(own),
            &admin,
        )
        .await;
        assert_eq!(code, 400, "{said}");
        assert!(
            !said.to_string().contains("curto"),
            "the token is not repeated"
        );
        let (code, started) = send(
            &r,
            reqwest::Method::POST,
            "/api/admin/link",
            Some(quick.clone()),
            &admin,
        )
        .await;
        assert_eq!(code, 200, "{started}");
        let view = until_state(&r, &admin, "on").await;
        assert_eq!(view["origin"], format!("https://{FIRST}"));
        assert!(
            view["until"].as_u64().is_some(),
            "a quick link's twelve hours"
        );
        let (code, again) = send(
            &r,
            reqwest::Method::POST,
            "/api/admin/link",
            Some(quick),
            &admin,
        )
        .await;
        assert_eq!(code, 400, "one link at a time: {again}");
        let (code, extended) = send(
            &r,
            reqwest::Method::POST,
            "/api/admin/link/extend",
            None,
            &admin,
        )
        .await;
        assert_eq!(code, 200, "{extended}");
        // Off needs no fresh proof: taking the server off the internet is
        // never harder than being its admin.
        stale(&r, &me);
        let (code, view) = send(&r, reqwest::Method::DELETE, "/api/admin/link", None, &admin).await;
        assert_eq!(code, 200, "{view}");
        assert_eq!(view["state"], "off");
        assert_eq!(view["origin"], Value::Null);
        let actions: Vec<String> = r.server.db.audit_actions().unwrap().into_iter().collect();
        for action in ["link_on", "link_extend", "link_off"] {
            assert!(actions.iter().any(|a| a == action), "{action}: {actions:?}");
        }
    });
}

/// The environment's link and the console: the configuration rows name the
/// variables, the token as set and never its value.
#[test]
fn the_configuration_shows_the_link_and_never_the_token() {
    block_on(async {
        let token = "eyJhIjoiMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYiLCJ0IjoiNmZmNDJhZTIifQ==";
        let r = start_with(|c| {
            c.tunnel.hostname = Some("mesa.example.com".to_owned());
            c.tunnel.token = Some(token.to_owned());
        })
        .await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (_, rows) = get(&r, "/api/admin/config", Some(&admin)).await;
        let text = rows.to_string();
        assert!(!text.contains(token), "{text}");
        let row = |name: &str| {
            rows.as_array()
                .unwrap()
                .iter()
                .find(|r| r["name"] == name)
                .cloned()
                .unwrap()
        };
        assert_eq!(row("VERSO_TUNNEL")["value"], "off");
        assert_eq!(row("VERSO_TUNNEL_HOSTNAME")["value"], "mesa.example.com");
        assert_eq!(row("VERSO_TUNNEL_TOKEN")["set"], true);
        assert_eq!(row("VERSO_TUNNEL_TOKEN")["value"], Value::Null);
        assert_eq!(row("VERSO_TUNNEL_PORT")["value"], "7341");
        let (_, view) = get(&r, "/api/admin/link", Some(&admin)).await;
        assert_eq!(view["tokenSet"], true);
        assert_eq!(view["hostname"], "mesa.example.com");
        assert!(!view.to_string().contains(token));
    });
}
