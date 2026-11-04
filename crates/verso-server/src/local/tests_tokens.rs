// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Personal access tokens and passkeys in "this app is a server" (ADR 0117
//! D9, S13; ADR 0074 items 3 and 8): an invited account makes a token in
//! the browser and a program reads with it, within the token's folders and
//! never writing when it reads only, on the network and through the link;
//! a phone, the owner's window and this computer's accounts have none; a
//! passkey's ceremony runs through the internet link alone, its relying
//! party the link's name, and on the network it is refused in words.

use serde_json::{Value, json};

use super::tests::{Lab, call, lab, next, run};
use super::tests_accounts::{NAME, ORIGIN, PASSWORD, accept, cookie_of, through};
use super::tests_devices::{as_page, bearer_get, bearer_ws, server_of};
use crate::db::Role;

/// A GET through the internet link, as the tunnel forwards a client.
async fn through_get(port: u16, path: &str, token: Option<&str>, cookie: Option<&str>) -> u16 {
    let mut req = reqwest::Client::new()
        .get(format!("http://127.0.0.1:{port}{path}"))
        .header("host", NAME)
        .header("x-forwarded-for", "203.0.113.60")
        .header("x-forwarded-proto", "https");
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    if let Some(c) = cookie {
        req = req.header("cookie", c);
    }
    req.send().await.unwrap().status().as_u16()
}

/// The folder an account reaches first.
async fn first_folder(lab: &Lab, cookie: &str) -> String {
    let (_, folders) = lab.get("/api/folders", Some(cookie)).await;
    folders["folders"][0]["id"].as_str().unwrap().to_owned()
}

/// An invited editor makes a reading token in the browser: a program
/// lists the folder with it and reads, writes nothing, on the network and
/// through the link; revoked, it opens nothing. A phone has none of the
/// routes; the owner's window makes none; a token of this computer's own
/// accounts opens nothing.
#[test]
fn an_invited_account_makes_a_token_a_program_reads_with() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let made = lab
            .local
            .invite_for_tests(Some("Campanha"), Some(Role::Editor))
            .unwrap();
        let cookie = accept(&lab, &made.link, "lia@example.org", "Lia").await;
        let id = first_folder(&lab, &cookie).await;
        let (status, created) = as_page(
            &lab,
            "/api/me/tokens",
            json!({ "name": "script", "write": false, "days": 30, "folders": [id] }),
            &cookie,
        )
        .await;
        assert_eq!(status, 200, "{created}");
        let secret = created["secret"].as_str().unwrap().to_owned();
        assert!(secret.starts_with("verso_pat_"));
        let (status, folders) = bearer_get(&lab, "/api/folders", &secret).await;
        assert_eq!(status, 200, "{folders}");
        assert_eq!(folders["folders"][0]["id"], id.as_str());
        assert_eq!(
            through_get(port, "/api/folders", Some(&secret), None).await,
            200
        );
        let mut ws = bearer_ws(&lab, &secret).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let notes = call(&mut ws, 2, "list_notes", json!({})).await;
        assert_eq!(notes["ok"], json!(["Sessao.md"]), "{notes}");
        let wrote = call(
            &mut ws,
            3,
            "write_note",
            json!({ "path": "Sessao.md", "text": "# outra\n" }),
        )
        .await;
        assert!(wrote.get("ok").is_none(), "a reading token wrote: {wrote}");
        // The account's own routes are no token's.
        assert_eq!(bearer_get(&lab, "/api/me/sessions", &secret).await.0, 403);
        let (_, listed) = lab.get("/api/me/tokens", Some(&cookie)).await;
        let token_id = listed[0]["id"].as_str().unwrap().to_owned();
        let res = lab
            .client
            .delete(lab.url(&format!("/api/me/tokens/{token_id}")))
            .header("origin", lab.origin())
            .header("cookie", &cookie)
            .header(
                "x-verso-csrf",
                super::tests_devices::csrf(&lab, &cookie).await,
            )
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        assert_eq!(bearer_get(&lab, "/api/folders", &secret).await.0, 401);
        // A phone has none of the routes.
        let phone = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        assert_eq!(lab.get("/api/me/tokens", Some(&phone)).await.0, 404);
        let (status, _) = lab
            .post(
                "/api/me/tokens",
                json!({ "name": "x", "write": true, "days": 30, "folders": [id] }),
                Some(&phone),
            )
            .await;
        assert_eq!(status, 404);
        // The owner's window makes none: tokens are made in the browser.
        let seat = lab.local.sit(&lab.notes.path().join("Campanha")).unwrap();
        let answer = seat
            .request(
                "POST",
                "/api/me/tokens",
                Some(
                    &json!({ "name": "x", "write": true, "days": 30, "folders": [seat.folder()] }),
                ),
            )
            .unwrap();
        assert_eq!(answer.status, 403);
        // A token of this computer's own accounts, however made: nothing.
        let server = server_of(&lab);
        let owner = server.db.local_owner().unwrap();
        let (owners, _) = server
            .db
            .create_token(&owner.id, "x", true, None, std::slice::from_ref(&id))
            .unwrap();
        assert_eq!(bearer_get(&lab, "/api/folders", &owners).await.0, 401);
        assert_eq!(
            through_get(port, "/api/folders", Some(&owners), None).await,
            401
        );
        assert!(crate::log::said(&secret).is_empty(), "a token in the log");
    });
}

/// A passkey through the internet link: the ceremony starts, its relying
/// party the link's own name. On the network, whose own certificate is no
/// secure context, every ceremony is refused in words and the page is
/// told not to offer one; the list is still the account's; a phone has
/// none of the routes, and the owner's window adds none.
#[test]
fn a_passkey_through_the_link_alone() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let made = lab.local.invite_for_tests(None, None).unwrap();
        let cookie = accept(&lab, &made.link, "teo@example.org", "Teo").await;
        // On the network: refused in words, before anything is counted.
        let (_, state) = lab.get("/api/state", Some(&cookie)).await;
        assert_eq!(state["passkeys"], false, "{state}");
        for path in ["/api/me/passkeys", "/api/me/prove/passkey"] {
            let (status, body) = as_page(&lab, path, json!({}), &cookie).await;
            assert_eq!(status, 400, "{path}: {body}");
            assert_eq!(body["error"], "passkey_needs_link", "{path}: {body}");
        }
        for _ in 0..5 {
            let (status, body) = lab
                .post(
                    "/api/passkey/start",
                    json!({ "email": "teo@example.org" }),
                    None,
                )
                .await;
            assert_eq!(status, 400, "{body}");
            assert_eq!(body["error"], "passkey_needs_link", "{body}");
        }
        let (status, listed) = lab.get("/api/me/passkeys", Some(&cookie)).await;
        assert_eq!((status, listed), (200, json!([])));
        // Through the link: signed in there, the ceremony starts for the
        // link's name.
        let res = through(port, "/api/signin", "x", "203.0.113.61")
            .json(&json!({ "email": "teo@example.org", "password": PASSWORD }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        let linked = cookie_of(&res).unwrap();
        let signed: Value = res.json().await.unwrap();
        let csrf = signed["csrf"].as_str().unwrap().to_owned();
        assert_eq!(
            through_get(port, "/api/state", None, Some(&linked)).await,
            200
        );
        let state: Value = reqwest::Client::new()
            .get(format!("http://127.0.0.1:{port}/api/state"))
            .header("host", NAME)
            .header("x-forwarded-for", "203.0.113.61")
            .header("x-forwarded-proto", "https")
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(state["passkeys"], true, "{state}");
        let res = through(port, "/api/me/passkeys", "x", "203.0.113.61")
            .header("cookie", &linked)
            .header("x-verso-csrf", &csrf)
            .json(&json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        let started: Value = res.json().await.unwrap();
        assert_eq!(
            started["options"]["publicKey"]["rp"]["id"], NAME,
            "{started}"
        );
        // No passkey yet: the sign-in by one says so, through the link.
        let res = through(port, "/api/passkey/start", "x", "203.0.113.62")
            .json(&json!({ "email": "teo@example.org" }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 401);
        // A phone has none of the routes; the owner's window adds none.
        let phone = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        assert_eq!(lab.get("/api/me/passkeys", Some(&phone)).await.0, 404);
        let (status, _) = lab.post("/api/me/passkeys", json!({}), Some(&phone)).await;
        assert_eq!(status, 404);
        let seat = lab.local.sit(&lab.notes.path().join("Campanha")).unwrap();
        let answer = seat
            .request("POST", "/api/me/passkeys", Some(&json!({})))
            .unwrap();
        assert!(answer.status >= 400, "the seat added a passkey");
    });
}
