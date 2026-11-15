// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The owner pairs his browser or phone through the internet link (ADR
//! 0117 D5, decided 2026-11-13; R3), driven as the tunnel drives the link's
//! listener: the link's `Host`, the client's address appended to
//! `X-Forwarded-For`, HTTPS said. The route answers only while *Pair a
//! phone* is open in the app; the app answers *Was it you?*; three wrong
//! attempts end the window whatever address a client writes; the phone is
//! never the owner; a quick link's phone ends with its address, an own
//! address's stays. See `tests_link.rs` for the door itself.

use serde_json::{Value, json};

use super::tests::{Lab, lab, run};
use super::tests_link::{NAME, ORIGIN, status_of, through, tunnel_client};
use crate::db::Role;

/// The forwarded address the tunnel puts last, the one believed.
const CLIENT: &str = "203.0.113.9";

/// A POST through the link, `X-Forwarded-For` as written (the client's
/// own words first, the tunnel's address last).
async fn post(port: u16, host: &str, path: &str, xff: &str, body: Value) -> (u16, Value, String) {
    let res = tunnel_client()
        .post(format!("http://127.0.0.1:{port}{path}"))
        .header("host", host)
        .header("x-forwarded-for", xff)
        .header("x-forwarded-proto", "https")
        .header("origin", format!("https://{host}"))
        .json(&body)
        .send()
        .await
        .unwrap();
    let status = res.status().as_u16();
    let cookie = res
        .headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    (status, res.json().await.unwrap_or(Value::Null), cookie)
}

/// A GET through the link with the phone's cookie.
async fn get(port: u16, host: &str, path: &str, cookie: &str) -> (u16, Value) {
    let res = through(&tunnel_client(), reqwest::Method::GET, port, path, host)
        .header("cookie", cookie)
        .send()
        .await
        .unwrap();
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

/// The token of a dialog's link address.
fn link_token(view: &super::PairView) -> String {
    let link = view.link.clone().unwrap();
    link.url.split_once("#t=").unwrap().1.to_owned()
}

/// Serving on the network and through the link at `origin`.
fn served(origin: &str) -> (Lab, u16) {
    let mut lab = lab();
    lab.serve();
    let port = lab.local.link_open().unwrap();
    lab.local.set_link_origin(Some(origin)).unwrap();
    (lab, port)
}

/// A phone presents `presented` through the link; the app answers `allow`
/// at `role`; the cookie it collects (`None`: refused).
async fn pair_through(
    lab: &Lab,
    port: u16,
    host: &str,
    presented: &str,
    allow: bool,
    role: Role,
) -> Option<String> {
    let (status, asked, _) = post(
        port,
        host,
        "/api/pair",
        CLIENT,
        json!({ "token": presented, "device": "Pixel" }),
    )
    .await;
    assert_eq!(status, 200, "{asked}");
    let poll = asked["poll"].as_str().unwrap().to_owned();
    let (_, waiting, _) = post(
        port,
        host,
        "/api/pair/poll",
        CLIENT,
        json!({ "poll": poll }),
    )
    .await;
    assert_eq!(waiting["state"], "waiting");
    let pending = lab.local.pair_state().asked.unwrap();
    assert!(pending.link, "the question says it came through the link");
    assert_eq!(pending.address, CLIENT, "the tunnel's address");
    lab.local.answer(allow, role).unwrap();
    let (status, done, cookie) = post(
        port,
        host,
        "/api/pair/poll",
        CLIENT,
        json!({ "poll": poll }),
    )
    .await;
    if !allow {
        assert_eq!((status, done["error"].as_str()), (410, Some("link_gone")));
        return None;
    }
    assert_eq!((status, done["state"].as_str()), (200, Some("allowed")));
    assert!(cookie.contains("; Secure"), "{cookie}");
    Some(cookie.split(';').next().unwrap().to_owned())
}

/// With no *Pair a phone* open in the app the link's pairing answers as an
/// unknown route, and no code is tried: nothing is counted, nothing asked.
#[test]
fn through_the_link_pairing_is_refused_until_the_owner_opens_it() {
    run(async {
        let (lab, port) = served(ORIGIN);
        for _ in 0..5 {
            let (status, _, _) = post(
                port,
                NAME,
                "/api/pair",
                CLIENT,
                json!({ "token": "BCDF-GHJK" }),
            )
            .await;
            assert_eq!(status, 404);
        }
        let (status, _, _) =
            post(port, NAME, "/api/pair/poll", CLIENT, json!({ "poll": "p" })).await;
        assert_eq!(status, 404);
        let audit = lab.local.audit().unwrap();
        assert!(
            !audit.iter().any(|e| e.action.starts_with("pair_")),
            "nothing was tried: {:?}",
            audit.iter().map(|e| &e.action).collect::<Vec<_>>()
        );
        // Opened and closed again: refused again.
        let view = lab.local.pair_open().unwrap();
        lab.local.pair_close();
        let (status, _, _) = post(
            port,
            NAME,
            "/api/pair",
            CLIENT,
            json!({ "token": link_token(&view) }),
        )
        .await;
        assert_eq!(status, 404, "after the dialog closed");
        assert!(lab.local.pair_state().asked.is_none());
    });
}

/// Once opened, the code typed at the link's page is asked about in the
/// app, and the app's Allow lets the phone in through the link: its own
/// cookie, its folders, an editor — and never the owner, asked or not.
#[test]
fn through_the_link_pairing_works_once_opened_and_allowed_and_is_never_the_owner() {
    run(async {
        let (lab, port) = served(ORIGIN);
        let view = lab.local.pair_open().unwrap();
        let cookie = pair_through(&lab, port, NAME, &view.code, true, Role::Editor)
            .await
            .unwrap();
        let (status, folders) = get(port, NAME, "/api/folders", &cookie).await;
        assert_eq!(status, 200, "{folders}");
        assert_eq!(folders["folders"][0]["name"], "Campanha");
        let (_, state) = get(port, NAME, "/api/state", &cookie).await;
        assert_eq!(state["account"]["admin"], false, "{state}");
        // An account's own routes are not a phone's.
        let (status, _) = get(port, NAME, "/api/me/sessions", &cookie).await;
        assert_eq!(status, 404);
        let audit = lab.local.audit().unwrap();
        assert!(
            audit
                .iter()
                .any(|e| e.action == "pair_asked_link" && e.address.as_deref() == Some(CLIENT))
        );
        // The owner's role asked for is an editor's, as on the network
        // (ADR 0096 item 12), and the QR's token works as the code does.
        let view = lab.local.pair_open().unwrap();
        let cookie2 = pair_through(&lab, port, NAME, &link_token(&view), true, Role::Owner).await;
        assert!(cookie2.is_some());
        let phones = lab.local.phones().unwrap();
        assert_eq!(phones.len(), 2);
        assert!(phones.iter().all(|p| p.role == Role::Editor), "{phones:?}");
    });
}

/// *Not me: refuse* in the app: no session, no phone.
#[test]
fn through_the_link_a_refusal_in_the_app_lets_nobody_in() {
    run(async {
        let (lab, port) = served(ORIGIN);
        let view = lab.local.pair_open().unwrap();
        assert!(
            pair_through(&lab, port, NAME, &view.code, false, Role::Editor)
                .await
                .is_none()
        );
        assert!(lab.local.phones().unwrap().is_empty());
        // The window is spent: the same code again is answered as closed.
        let (status, _, _) = post(
            port,
            NAME,
            "/api/pair",
            CLIENT,
            json!({ "token": view.code }),
        )
        .await;
        assert_eq!(status, 404);
    });
}

/// Three wrong codes end the window, each sent with another address the
/// client wrote in `X-Forwarded-For` before the tunnel's: what is believed
/// is the tunnel's, the count is the window's, and the right code after
/// them gets nothing. The audit log keeps the tunnel's address, never the
/// forged one.
#[test]
fn through_the_link_three_wrong_codes_end_it_whatever_address_is_forged() {
    run(async {
        let (lab, port) = served(ORIGIN);
        let view = lab.local.pair_open().unwrap();
        for (n, forged) in ["198.51.100.1", "198.51.100.2", "198.51.100.3"]
            .iter()
            .enumerate()
        {
            let (status, said, _) = post(
                port,
                NAME,
                "/api/pair",
                &format!("{forged}, {CLIENT}"),
                json!({ "token": "XXXX-XXXX" }),
            )
            .await;
            assert_eq!(status, 410, "attempt {n}: {said}");
        }
        assert!(
            !lab.local.pair_state().open,
            "three attempts end the window"
        );
        let (status, _, _) = post(
            port,
            NAME,
            "/api/pair",
            CLIENT,
            json!({ "token": view.code }),
        )
        .await;
        assert_eq!(status, 404, "the right code after the three");
        let attempts: Vec<_> = lab
            .local
            .audit()
            .unwrap()
            .into_iter()
            .filter(|e| e.action == "pair_refused_attempt")
            .collect();
        assert_eq!(attempts.len(), 3);
        assert!(
            attempts
                .iter()
                .all(|e| e.address.as_deref() == Some(CLIENT))
        );
    });
}

/// A client that is told apart by another address (another phone, or the
/// tunnel's forwarded one moved) still spends the window's three: the
/// limit is not per address, so no address resets it; and the network's
/// attempts and the link's are the one count.
#[test]
fn a_new_forwarded_address_does_not_reset_the_three() {
    run(async {
        let (lab, port) = served(ORIGIN);
        let view = lab.local.pair_open().unwrap();
        let (status, _, _) = post(
            port,
            NAME,
            "/api/pair",
            "198.51.100.7",
            json!({ "token": "wrong" }),
        )
        .await;
        assert_eq!(status, 410);
        let (status, _) = lab
            .post("/api/pair", json!({ "token": "wrong too" }), None)
            .await;
        assert_eq!(status, 410, "on the network, the same window");
        let (status, _, _) = post(
            port,
            NAME,
            "/api/pair",
            "198.51.100.8",
            json!({ "token": "x" }),
        )
        .await;
        assert_eq!(status, 410);
        assert!(!lab.local.pair_state().open);
        let (status, _, _) = post(
            port,
            NAME,
            "/api/pair",
            "198.51.100.9",
            json!({ "token": view.code }),
        )
        .await;
        assert_eq!(status, 404);
    });
}

/// A phone paired through a quick link ends with that link's address (D5
/// (3)): a new quick link's address takes it out of the phones, and its
/// cookie opens nothing; turning the link off, or stopping serving, does
/// the same. One paired on the network stays.
#[test]
fn a_quick_links_phone_ends_with_its_address() {
    run(async {
        let (lab, port) = served(ORIGIN);
        let lan = lab.pair("iPhone", true, Role::Reader).await.unwrap();
        let view = lab.local.pair_open().unwrap();
        let cookie = pair_through(&lab, port, NAME, &view.code, true, Role::Editor)
            .await
            .unwrap();
        assert_eq!(lab.local.phones().unwrap().len(), 2);
        // The quick link's address replaced (a new link).
        let next = "https://other-quick-name.trycloudflare.com";
        lab.local.set_link_origin(Some(next)).unwrap();
        let phones = lab.local.phones().unwrap();
        assert_eq!(phones.len(), 1, "{phones:?}");
        assert_eq!(phones[0].name, "iPhone");
        let (_, state) = get(
            port,
            "other-quick-name.trycloudflare.com",
            "/api/state",
            &cookie,
        )
        .await;
        assert_eq!(state["account"], Value::Null, "{state}");
        assert!(
            lab.local
                .audit()
                .unwrap()
                .iter()
                .any(|e| e.action == "phone_link_ended")
        );
        // Paired again through the new one, then the link turned off.
        let view = lab.local.pair_open().unwrap();
        pair_through(
            &lab,
            port,
            "other-quick-name.trycloudflare.com",
            &view.code,
            true,
            Role::Reader,
        )
        .await
        .unwrap();
        assert_eq!(lab.local.phones().unwrap().len(), 2);
        lab.local.link_close();
        assert_eq!(lab.local.phones().unwrap().len(), 1);
        // The network's phone reads on.
        let (status, _) = lab.get("/api/folders", Some(&lan)).await;
        assert_eq!(status, 200);
    });
}

/// Serving stopped ends a quick link's phones too, and a start ends those
/// a run before left (a crash): a quick link never outlives a run.
#[test]
fn a_quick_links_phone_does_not_outlive_serving() {
    run(async {
        let (mut lab, port) = served(ORIGIN);
        let view = lab.local.pair_open().unwrap();
        pair_through(&lab, port, NAME, &view.code, true, Role::Editor)
            .await
            .unwrap();
        lab.local.stop();
        assert!(lab.local.phones().unwrap().is_empty());
        // What a crash leaves: a phone kept as a quick link's, serving off.
        {
            let db = crate::db::Db::open(&lab.dir.path().join("local")).unwrap();
            let owner = db.local_owner().unwrap();
            let (_, _, id) = db
                .pair_phone(&owner.id, "Left", CLIENT, Role::Editor, 4, false)
                .unwrap();
            super::link_pair::remember(&db, &id).unwrap();
            assert_eq!(db.phones().unwrap().len(), 1);
        }
        lab.serve();
        assert!(lab.local.phones().unwrap().is_empty());
    });
}

/// Through the person's own address the phone stays: the link off and on
/// again, at the same address, and serving stopped and started.
#[test]
fn an_own_addresss_phone_stays() {
    run(async {
        let own = "https://mesa.example.com";
        let (mut lab, port) = served(own);
        let view = lab.local.pair_open().unwrap();
        let cookie = pair_through(
            &lab,
            port,
            "mesa.example.com",
            &view.code,
            true,
            Role::Editor,
        )
        .await
        .unwrap();
        lab.local.set_link_origin(None).unwrap();
        lab.local.set_link_origin(Some(own)).unwrap();
        lab.local.link_close();
        lab.local.stop();
        lab.serve();
        assert_eq!(lab.local.phones().unwrap().len(), 1);
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(own)).unwrap();
        let (status, _) = get(port, "mesa.example.com", "/api/folders", &cookie).await;
        assert_eq!(status, 200);
        assert_eq!(
            status_of(through(
                &tunnel_client(),
                reqwest::Method::GET,
                port,
                "/api/state",
                NAME
            ))
            .await,
            421,
            "the quick link's name is not this link's"
        );
    });
}

/// A quick link replaced while *Was it you?* waits — by the person's own
/// address, or by another quick link — leaves the phone on a dead address:
/// Allow is judged by the address it asked through, and refuses. No
/// session, no place taken, the phone told; the same address still there
/// is allowed, as before (review M6, 2026-11-14).
#[test]
fn a_quick_link_replaced_while_the_question_waits_is_refused_at_allow() {
    run(async {
        for next in [
            "https://mesa.example.com",
            "https://other-quick-name.trycloudflare.com",
        ] {
            let (lab, port) = served(ORIGIN);
            let view = lab.local.pair_open().unwrap();
            let (status, asked, _) = post(
                port,
                NAME,
                "/api/pair",
                CLIENT,
                json!({ "token": view.code, "device": "Pixel" }),
            )
            .await;
            assert_eq!(status, 200, "{asked}");
            let poll = asked["poll"].as_str().unwrap().to_owned();
            assert!(lab.local.pair_state().asked.unwrap().link);
            lab.local.set_link_origin(Some(next)).unwrap();
            let refused = lab.local.answer(true, Role::Editor).unwrap_err();
            assert!(refused.contains("address changed"), "{next}: {refused}");
            assert!(
                lab.local.phones().unwrap().is_empty(),
                "{next}: no place taken"
            );
            let host = next.strip_prefix("https://").unwrap();
            let (status, said, cookie) = post(
                port,
                host,
                "/api/pair/poll",
                CLIENT,
                json!({ "poll": poll }),
            )
            .await;
            assert_eq!(
                (status, said["error"].as_str()),
                (410, Some("link_gone")),
                "{next}"
            );
            assert!(cookie.is_empty(), "{next}: no session handed over");
        }
    });
}
