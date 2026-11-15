// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The Verso app paired (ADR 0117, "The Verso app paired"), through the
//! real server, as the app's client drives it (`pin.rs`, `pair_app.rs`):
//! proofs instead of the code, a bearer token instead of a cookie, a
//! phone's role and limits, the sync's commands at that role — and a
//! person in the middle, who shows the app another key, refused.

use futures_util::SinkExt;
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use super::pin::{self, Side};
use super::tests::{Lab, Ws, call, lab, next, run};
use crate::db::Role;

/// The pin of the certificate the lab serves.
fn served_pin(lab: &Lab) -> String {
    let db = crate::db::Db::open(&lab.dir.path().join("local")).unwrap();
    let ips: Vec<std::net::IpAddr> = vec!["127.0.0.1".parse().unwrap()];
    let id = super::cert::load_or_make(&db, &ips, crate::db::now()).unwrap();
    pin::of_cert(&id.cert).unwrap()
}

const NONCE: &str = "the-apps-own-fresh-nonce-0123";

/// The app presents its proof over the key `seen`, as it computes it.
async fn present(lab: &Lab, code: &str, seen: &str) -> (u16, Value) {
    let key = pin::key(code, NONCE).unwrap();
    let proof = pin::proof(&key, Side::Phone, NONCE, seen);
    lab.post(
        "/api/pair",
        json!({ "app": { "nonce": NONCE, "proof": proof }, "device": "Pixel da Ana" }),
        None,
    )
    .await
}

/// The app pairs at `role`: the bearer token and this computer's proof.
async fn pair_app(lab: &Lab, role: Role) -> (String, String) {
    let view = lab.local.pair_open().unwrap();
    let (status, asked) = present(lab, &view.code, &served_pin(lab)).await;
    assert_eq!(status, 200, "{asked}");
    let poll = asked["poll"].as_str().unwrap().to_owned();
    let pending = lab.local.pair_state().asked.unwrap();
    assert!(pending.app, "the laptop is told it is the app");
    assert_eq!(pending.device, "Pixel da Ana");
    lab.local.answer(true, role).unwrap();
    let res = lab
        .client
        .post(lab.url("/api/pair/poll"))
        .header("origin", lab.origin())
        .json(&json!({ "poll": poll }))
        .send()
        .await
        .unwrap();
    assert!(
        res.headers().get("set-cookie").is_none(),
        "no cookie for the app"
    );
    let body: Value = res.json().await.unwrap();
    assert_eq!(body["state"], "allowed", "{body}");
    (
        body["token"].as_str().unwrap().to_owned(),
        body["proof"].as_str().unwrap().to_owned(),
    )
}

async fn bearer_get(lab: &Lab, path: &str, token: &str) -> (u16, Value) {
    let res = lab
        .client
        .get(lab.url(path))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

async fn bearer_ws(lab: &Lab, token: &str) -> Ws {
    let mut req = format!("wss://127.0.0.1:{}/api/ws", lab.port)
        .into_client_request()
        .unwrap();
    req.headers_mut()
        .insert("authorization", format!("Bearer {token}").parse().unwrap());
    let provider = std::sync::Arc::new(tokio_rustls::rustls::crypto::ring::default_provider());
    let config = tokio_rustls::rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_root_certificates(std::sync::Arc::clone(&lab.roots))
        .with_no_client_auth();
    let connector = tokio_tungstenite::Connector::Rustls(std::sync::Arc::new(config));
    let (ws, _) =
        tokio_tungstenite::connect_async_tls_with_config(req, None, false, Some(connector))
            .await
            .unwrap();
    ws
}

/// The app's folder opened over its WebSocket.
async fn opened(lab: &Lab, token: &str) -> Ws {
    let (_, folders) = bearer_get(lab, "/api/folders", token).await;
    let id = folders["folders"][0]["id"].as_str().unwrap().to_owned();
    let mut ws = bearer_ws(lab, token).await;
    let hello = next(&mut ws).await;
    assert!(hello.get("hello").is_some(), "{hello}");
    let info = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert_eq!(info["ok"]["name"], "Campanha", "{info}");
    ws
}

/// The way in, end to end: the proof over the key the app saw holds, the
/// laptop is asked and says it is the app, the answer is a bearer token
/// with this computer's proof — which the app can check over the same key
/// — and the token reads the folder and syncs it as a reader.
#[test]
fn the_app_pairs_by_its_proof_and_syncs_its_folder_as_a_reader() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let (token, proof) = pair_app(&lab, Role::Reader).await;
        let phones = lab.local.phones().unwrap();
        assert_eq!(phones.len(), 1, "one of the owner's phones");
        assert_eq!(phones[0].role, Role::Reader);
        assert!(
            lab.local.devices().unwrap().is_empty(),
            "never a person's desktop app"
        );
        assert_eq!(proof.len(), 64);
        let mut ws = opened(&lab, &token).await;
        let state = call(&mut ws, 2, "sync_state", json!({})).await;
        let files: Vec<&str> = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|f| f["path"].as_str())
            .collect();
        assert_eq!(files, vec!["Sessao.md"], "{state}");
        let put = call(
            &mut ws,
            3,
            "sync_put",
            json!({ "path": "Nova.md", "base": null, "size": 3 }),
        )
        .await;
        assert_eq!(put["err"]["kind"], "phone_reads", "{put}");
        let (status, me) = bearer_get(&lab, "/api/state", &token).await;
        assert_eq!(status, 200);
        assert_eq!(me["account"]["admin"], false, "never the admin: {me}");
    });
}

/// The proof the computer hands back is the one the app expects over the
/// key it saw, and not over any other.
#[test]
fn the_computers_proof_is_over_its_own_key() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let view = lab.local.pair_open().unwrap();
        let code = view.code.clone();
        let own = served_pin(&lab);
        let (_, asked) = present(&lab, &code, &own).await;
        let poll = asked["poll"].as_str().unwrap().to_owned();
        lab.local.answer(true, Role::Editor).unwrap();
        let (_, body) = lab
            .post("/api/pair/poll", json!({ "poll": poll }), None)
            .await;
        let back = body["proof"].as_str().unwrap();
        let key = pin::key(&code, NONCE).unwrap();
        assert!(pin::same(
            back,
            &pin::proof(&key, Side::Computer, NONCE, &own)
        ));
        assert!(!pin::same(
            back,
            &pin::proof(&key, Side::Computer, NONCE, &"0".repeat(64))
        ));
        assert!(!pin::same(
            back,
            &pin::proof(&key, Side::Phone, NONCE, &own)
        ));
    });
}

/// A person in the middle shows the app their own key: the app's proof
/// names it, the computer refuses it and counts it, asks the laptop
/// nothing, and three such close the window. A wrong code is the same.
#[test]
fn a_proof_over_another_key_or_with_another_code_is_refused_and_counted() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let view = lab.local.pair_open().unwrap();
        let (status, _) = present(&lab, &view.code, &"ab".repeat(32)).await;
        assert_eq!(status, 410, "another key");
        let (status, _) = present(&lab, "BCDF-GHJK", &served_pin(&lab)).await;
        assert_eq!(status, 410, "another code");
        assert!(
            lab.local.pair_state().asked.is_none(),
            "the laptop is asked nothing"
        );
        let (status, _) = present(&lab, &view.code, &"cd".repeat(32)).await;
        assert_eq!(status, 410);
        assert!(!lab.local.pair_state().open, "three attempts closed it");
        let (status, _) = present(&lab, &view.code, &served_pin(&lab)).await;
        assert_eq!(status, 404, "the right proof after them: nothing there");
        // A proof sent with no dialog open is never tried.
        let (status, _) = present(&lab, &view.code, &served_pin(&lab)).await;
        assert_eq!(status, 404);
    });
}

/// The app's token is the app's: a browser's phone cookie opens nothing as
/// a bearer, and the app's token is no cookie; the paired address route
/// answers the app alone; the app may edit only when paired an editor.
#[test]
fn the_apps_token_is_a_phones_and_a_browsers_phone_is_no_app() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let browser = cookie.split_once('=').unwrap().1.to_owned();
        let (status, _) = bearer_get(&lab, "/api/folders", &browser).await;
        assert_eq!(status, 401, "a browser's session is no bearer");
        let (status, _) = lab.get("/api/paired", Some(&cookie)).await;
        assert_eq!(status, 404, "the browser's phone has no paired route");
        let mut ws = super::tests::open(&lab, &cookie).await;
        let state = call(&mut ws, 9, "sync_state", json!({})).await;
        assert_eq!(state["err"]["kind"], "not_on_phone", "{state}");
        drop(ws);

        let (token, _) = pair_app(&lab, Role::Editor).await;
        let (status, _) = lab
            .get(
                "/api/folders",
                Some(&format!("__Host-verso-session={token}")),
            )
            .await;
        assert_eq!(status, 401, "the app's token is no cookie");
        let (status, place) = bearer_get(&lab, "/api/paired", &token).await;
        assert_eq!(status, 200, "{place}");
        assert_eq!(place["addresses"], json!(["127.0.0.1"]));
        assert_eq!(place["port"], lab.port);
        let mut ws = opened(&lab, &token).await;
        let state = call(&mut ws, 2, "sync_state", json!({})).await;
        assert!(state.get("ok").is_some(), "{state}");
        // Account routes are a person's: the app is the owner's phone.
        let (status, _) = bearer_get(&lab, "/api/me/sessions", &token).await;
        assert_eq!(status, 404);
        ws.send(Message::Close(None)).await.ok();
    });
}

/// The app counts among the four phones, is revoked as one, and ends with
/// "Replace this computer's identity", whose new key no pin matches and
/// whose name the server no longer answers to.
#[test]
fn the_app_is_one_of_the_four_and_ends_with_the_identity() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let old = served_pin(&lab);
        let (token, _) = pair_app(&lab, Role::Reader).await;
        for name in ["a", "b", "c"] {
            lab.pair(name, true, Role::Reader).await.unwrap();
        }
        assert!(
            lab.local.pair_open().is_err(),
            "four phones, the app among them"
        );
        let app = lab
            .local
            .phones()
            .unwrap()
            .into_iter()
            .find(|p| p.name == "Pixel da Ana")
            .unwrap();
        lab.local.revoke(&app.id).unwrap();
        let (status, _) = bearer_get(&lab, "/api/folders", &token).await;
        assert_eq!(status, 401, "revoked");

        let (token, _) = pair_app(&lab, Role::Reader).await;
        let name = format!("{}:{}", pin::name(&old), lab.port);
        let res = lab
            .client
            .get(lab.url("/api/folders"))
            .header("host", &name)
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(
            res.status().as_u16(),
            200,
            "the paired name is this computer's"
        );
        lab.local.replace_identity().unwrap();
        lab.serve();
        assert_ne!(served_pin(&lab), old, "a new key");
        let (status, _) = bearer_get(&lab, "/api/folders", &token).await;
        assert_eq!(status, 401, "every pairing ended");
        let res = lab
            .client
            .get(lab.url("/api/state"))
            .header("host", &name)
            .send()
            .await
            .unwrap();
        assert_eq!(
            res.status().as_u16(),
            421,
            "the old name is no host here now"
        );
    });
}
