// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Another person's desktop app at this computer's server (ADR 0117 D9,
//! S11): an invited account signs its Verso in through the browser and
//! syncs the folder shared with it; a phone never becomes a device and
//! never syncs; the owner's window's seat is no device and opens nothing
//! outside its door; the hide lock of a folder served in part holds for a
//! device. See `devices.rs`.

use std::sync::Arc;

use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use super::tests::{Lab, Ws, call, lab, next, run};
use super::tests_accounts::{ORIGIN, accept, through};
use super::tests_parts::{NEEDLE, lab_in_part};
use super::{lock, seat::SEAT_DEVICE};
use crate::db::Role;
use crate::state::Server;

pub(super) fn server_of(lab: &Lab) -> Arc<Server> {
    Arc::clone(&lock(&lab.local.shared.inner).as_ref().unwrap().server)
}

/// The CSRF token of a browser's session, as the page reads it.
pub(super) async fn csrf(lab: &Lab, cookie: &str) -> String {
    let (_, state) = lab.get("/api/state", Some(cookie)).await;
    state["csrf"].as_str().unwrap().to_owned()
}

/// A request of a page signed in with `cookie`.
pub(super) async fn as_page(lab: &Lab, path: &str, body: Value, cookie: &str) -> (u16, Value) {
    let res = lab
        .client
        .post(lab.url(path))
        .header("origin", lab.origin())
        .header("cookie", cookie)
        .header("x-verso-csrf", csrf(lab, cookie).await)
        .json(&body)
        .send()
        .await
        .unwrap();
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

/// The desktop app `device` signs in as the person whose browser holds
/// `cookie`, the way `verso serve`'s device flow goes (ADR 0074 item 8):
/// the device's token.
pub(super) async fn device_token(lab: &Lab, cookie: &str, device: &str) -> String {
    let (status, started) = lab
        .post("/api/device/start", json!({ "device": device }), None)
        .await;
    assert_eq!(status, 200, "{started}");
    assert_eq!(started["url"], format!("{}/device", lab.origin()));
    let (code, poll) = (
        started["code"].as_str().unwrap().to_owned(),
        started["poll"].as_str().unwrap().to_owned(),
    );
    let (_, waiting) = lab
        .post(
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
    assert_eq!(waiting["pending"], true, "{waiting}");
    let (status, described) =
        as_page(lab, "/api/device/describe", json!({ "code": code }), cookie).await;
    assert_eq!(status, 200, "{described}");
    assert_eq!(described["device"], device);
    let (status, approved) =
        as_page(lab, "/api/device/approve", json!({ "code": code }), cookie).await;
    assert_eq!(status, 200, "{approved}");
    let (status, got) = lab
        .post(
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
    assert_eq!(status, 200, "{got}");
    got["token"].as_str().unwrap().to_owned()
}

/// A GET with a bearer credential on the network.
pub(super) async fn bearer_get(lab: &Lab, path: &str, token: &str) -> (u16, Value) {
    let res = lab
        .client
        .get(lab.url(path))
        .header("authorization", format!("Bearer {token}"))
        .send()
        .await
        .unwrap();
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

/// The contract's WebSocket with a bearer credential, as the desktop app
/// opens it: no cookie, no `Origin`.
pub(super) async fn bearer_ws(lab: &Lab, token: &str) -> Result<Ws, u16> {
    let mut req = format!("wss://127.0.0.1:{}/api/ws", lab.port)
        .into_client_request()
        .unwrap();
    req.headers_mut()
        .insert("authorization", format!("Bearer {token}").parse().unwrap());
    let provider = Arc::new(tokio_rustls::rustls::crypto::ring::default_provider());
    let config = tokio_rustls::rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_root_certificates(Arc::clone(&lab.roots))
        .with_no_client_auth();
    let connector = tokio_tungstenite::Connector::Rustls(Arc::new(config));
    match tokio_tungstenite::connect_async_tls_with_config(req, None, false, Some(connector)).await
    {
        Ok((ws, _)) => Ok(ws),
        Err(tokio_tungstenite::tungstenite::Error::Http(res)) => Err(res.status().as_u16()),
        Err(e) => panic!("{e}"),
    }
}

/// An invited account's desktop app signs in through the browser, lists
/// the folder shared with it, and syncs it both ways: what it puts is on
/// this computer's disk, what is there it reads. The owner sees the app
/// in Settings' list and ends it; it opens nothing after. Through the
/// internet link the device's page is the link's.
#[test]
fn an_invited_accounts_desktop_app_syncs_its_folder() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let made = lab
            .local
            .invite_for_tests(Some("Campanha"), Some(Role::Editor))
            .unwrap();
        let cookie = accept(&lab, &made.link, "ana@example.org", "Ana").await;
        let token = device_token(&lab, &cookie, "Verso · Mac da Ana").await;
        let (status, folders) = bearer_get(&lab, "/api/folders", &token).await;
        assert_eq!(status, 200, "{folders}");
        let list = folders["folders"].as_array().unwrap();
        assert_eq!(list.len(), 1, "{folders}");
        assert_eq!(list[0]["role"], "editor");
        let id = list[0]["id"].as_str().unwrap().to_owned();
        let mut ws = bearer_ws(&lab, &token).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        assert_eq!(opened["ok"]["name"], "Campanha", "{opened}");
        let state = call(&mut ws, 2, "sync_state", json!({})).await;
        assert!(
            state["ok"]["files"].to_string().contains("Sessao.md"),
            "{state}"
        );
        let put = crate::tests_sync::send(&mut ws, 3, "Nova.md", b"# Nova da Ana\n", None).await;
        assert_eq!(put["ok"]["done"], true, "{put}");
        // Read back from the folder through verso-fs, as the server serves it
        // (std::fs stays in data.rs, ADR 0029).
        let (on_disk, _) = crate::tests_sync::fetch(&mut ws, 19, "Nova.md").await;
        assert_eq!(on_disk, b"# Nova da Ana\n");
        let (bytes, _) = crate::tests_sync::fetch(&mut ws, 20, "Sessao.md").await;
        assert_eq!(bytes, b"# Sessao\n");
        // Settings lists the app, by its name and its person's.
        let devices = lab.local.devices().unwrap();
        assert_eq!(devices.len(), 1, "{devices:?}");
        assert_eq!(
            (devices[0].device.as_str(), devices[0].account.as_str()),
            ("Verso · Mac da Ana", "Ana")
        );
        // Ended by the owner: nothing opens with it after.
        lab.local.end_device(&devices[0].id).unwrap();
        assert!(lab.local.devices().unwrap().is_empty());
        assert_eq!(bearer_get(&lab, "/api/folders", &token).await.0, 401);
        assert!(lab.local.end_device(&devices[0].id).is_err(), "ended once");
        // Through the internet link: the page the app opens is the link's.
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let res = through(port, "/api/device/start", "x", "203.0.113.40")
            .json(&json!({ "device": "Verso · Linux" }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        let started: Value = res.json().await.unwrap();
        assert_eq!(started["url"], format!("{ORIGIN}/device"));
    });
}

/// A phone is the owner's device of the browser, never a desktop app: it
/// has none of the device routes, it runs no `sync_*`, and its session
/// presented as a bearer opens nothing; a device session of this
/// computer's own accounts — as if a phone had approved one — opens
/// nothing either.
#[test]
fn a_phone_never_syncs_and_never_becomes_a_device() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let mut ws = super::tests::open(&lab, &cookie).await;
        for (n, cmd) in ["sync_state", "sync_changes", "sync_read", "sync_put"]
            .into_iter()
            .enumerate()
        {
            let answer = call(&mut ws, 10 + n as u64, cmd, json!({})).await;
            assert_eq!(answer["err"]["kind"], "not_on_phone", "{cmd}: {answer}");
        }
        for path in [
            "/api/device/start",
            "/api/device/describe",
            "/api/device/approve",
            "/api/device/refuse",
        ] {
            let (status, _) = lab
                .post(
                    path,
                    json!({ "code": "BCDF-GHJK", "device": "x" }),
                    Some(&cookie),
                )
                .await;
            assert_eq!(status, 404, "{path}");
        }
        let value = cookie.split_once('=').unwrap().1;
        assert_eq!(bearer_get(&lab, "/api/folders", value).await.0, 401);
        assert_eq!(bearer_ws(&lab, value).await.err(), Some(401));
        let server = server_of(&lab);
        for account in [
            server.db.local_owner().unwrap().id,
            server
                .db
                .account_by_email(crate::db::VAULT_HOLDER)
                .unwrap()
                .map_or_else(String::new, |a| a.id),
        ] {
            if account.is_empty() {
                continue;
            }
            let (token, _) = server
                .db
                .create_session(&account, "device", "Verso", "127.0.0.1")
                .unwrap();
            assert_eq!(bearer_get(&lab, "/api/folders", &token).await.0, 401);
            assert_eq!(bearer_ws(&lab, &token).await.err(), Some(401));
        }
    });
}

/// The owner's window's seat is no device: Settings' list does not have
/// it, nor the owner's own list of sessions through the door; its token
/// opens nothing on the network or through the link, while a player's
/// device beside it works and is the one listed.
#[test]
fn the_seat_is_no_device_and_its_token_opens_nothing_elsewhere() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let seat = lab.local.sit(&lab.notes.path().join("Campanha")).unwrap();
        let made = lab
            .local
            .invite_for_tests(Some("Campanha"), Some(Role::Reader))
            .unwrap();
        let cookie = accept(&lab, &made.link, "bia@example.org", "Bia").await;
        let token = device_token(&lab, &cookie, "Verso · Windows da Bia").await;
        let devices = lab.local.devices().unwrap();
        assert_eq!(devices.len(), 1, "{devices:?}");
        assert_eq!(devices[0].device, "Verso · Windows da Bia");
        let server = server_of(&lab);
        let owner = server.db.local_owner().unwrap();
        let seat_id = server
            .db
            .sessions_of(&owner.id)
            .unwrap()
            .into_iter()
            .find(|s| s.device == SEAT_DEVICE)
            .unwrap()
            .id;
        assert!(devices.iter().all(|d| d.id != seat_id));
        let answer = seat.get("/api/me/sessions").unwrap();
        assert_eq!(answer.status, 200);
        let listed = String::from_utf8_lossy(&answer.body).into_owned();
        assert!(!listed.contains(&seat_id), "the seat was listed: {listed}");
        // The seat's token, anywhere but its door: nothing.
        let seat_token = seat.token().to_owned();
        assert_eq!(bearer_get(&lab, "/api/folders", &seat_token).await.0, 401);
        assert_eq!(bearer_ws(&lab, &seat_token).await.err(), Some(401));
        let res = reqwest::Client::new()
            .get(format!("http://127.0.0.1:{port}/api/folders"))
            .header("host", super::tests_accounts::NAME)
            .header("x-forwarded-for", "203.0.113.41")
            .header("x-forwarded-proto", "https")
            .header("authorization", format!("Bearer {seat_token}"))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 401, "through the link");
        // The player's device beside it is heard.
        assert_eq!(bearer_get(&lab, "/api/folders", &token).await.0, 200);
    });
}

/// A folder served in part is no device's that was given nothing of it
/// (ADR 0117 R1, 2026-11-05: what a player reaches is what a share or a
/// table gives them, `tests_subfolders`): not by its id, not by the phones'
/// part, not in the list, not as a file, not by sync.
#[test]
fn a_device_reaches_nothing_of_a_folder_served_in_part_it_was_not_given() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let server = server_of(&lab);
        let vault = server.db.folder_by_dir("Campanha").unwrap().unwrap();
        let share = server.db.shares_of(&vault.id).unwrap().remove(0);
        let made = lab.local.invite_for_tests(None, None).unwrap();
        let cookie = accept(&lab, &made.link, "caio@example.org", "Caio").await;
        let token = device_token(&lab, &cookie, "Verso · Mac do Caio").await;
        let (status, folders) = bearer_get(&lab, "/api/folders", &token).await;
        assert_eq!(status, 200);
        let listed = folders.to_string();
        assert!(
            !listed.contains(&vault.id) && !listed.contains(&share.id),
            "{folders}"
        );
        let mut ws = bearer_ws(&lab, &token).await.unwrap();
        let _hello = next(&mut ws).await;
        for (n, id) in [(1, &vault.id), (2, &share.id)] {
            let opened = call(&mut ws, n, "open_server_folder", json!({ "id": id })).await;
            assert!(opened.get("ok").is_none(), "{id} opened: {opened}");
        }
        for (n, cmd) in ["sync_state", "sync_read"].into_iter().enumerate() {
            let answer = call(
                &mut ws,
                10 + n as u64,
                cmd,
                json!({ "path": "Raiz.md", "offset": 0 }),
            )
            .await;
            assert!(answer.get("ok").is_none(), "{cmd}: {answer}");
            assert!(!answer.to_string().contains(NEEDLE), "{cmd}: {answer}");
        }
        for path in [
            format!("/f/{}/Raiz.md", vault.id),
            format!("/f/{}/Segredo/c.md", vault.id),
            format!("/f/{}/a.md", share.id),
        ] {
            let res = lab
                .client
                .get(lab.url(&path))
                .header("authorization", format!("Bearer {token}"))
                .send()
                .await
                .unwrap();
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            assert!(status >= 400, "{path}: {status}");
            assert!(!body.contains(NEEDLE), "{path}");
        }
    });
}
