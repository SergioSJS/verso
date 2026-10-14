// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A fresh proof before a sensitive action (ADR 0083 item 6): each
//! sensitive route answers `prove_first` once the session's mark is older
//! than ten minutes, and works within them; `/api/me/prove` with a wrong
//! password is a refused sign-in in every way the host and the limiter see.
//! The mark is moved by `Db::age_proofs`, a `#[cfg(test)]` helper of
//! `db/proof.rs`: no route moves it.

use serde_json::{Value, json};

use crate::proof::PROVE_WITHIN;
use crate::tests::{Browser, Running, block_on, post, sign_in, start};

/// A request of any method from the browser `b`, as its page sends it.
pub(crate) async fn send(
    r: &Running,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
    b: &Browser,
) -> (u16, Value) {
    let mut req = reqwest::Client::new()
        .request(method, r.url(path))
        .header("origin", r.origin())
        .header("cookie", &b.cookie)
        .header("x-verso-csrf", &b.csrf);
    if let Some(body) = body {
        req = req.json(&body);
    }
    let res = req.send().await.unwrap();
    let status = res.status().as_u16();
    (status, res.json().await.unwrap_or(Value::Null))
}

/// The whole answer of a route that wants a fresh proof: the code, and
/// nothing beyond it.
pub(crate) fn prove_first() -> (u16, Value) {
    (
        403,
        json!({ "error": "prove_first", "message": "prove it is you first", "retry": null }),
    )
}

/// The browser `b` proves who it is again, with `password`.
pub(crate) async fn prove(r: &Running, b: &Browser, password: &str) -> (u16, Value) {
    post(r, "/api/me/prove", json!({ "password": password }), Some(b)).await
}

/// The account `id`'s sessions proved longer ago than the window allows.
pub(crate) fn stale(r: &Running, id: &str) {
    r.server.db.age_proofs(id, PROVE_WITHIN + 1).unwrap();
}

/// A route that wants a fresh proof: stale, it answers `prove_first` and
/// nothing else; proved again, it is answered — what it answers returned.
async fn gated(
    r: &Running,
    b: &Browser,
    account: &str,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
) -> (u16, Value) {
    stale(r, account);
    let refused = send(r, method.clone(), path, body.clone(), b).await;
    assert_eq!(refused, prove_first(), "{method} {path}");
    let (status, proved) = prove(r, b, "senha muito longa").await;
    assert_eq!(status, 200, "{proved}");
    send(r, method, path, body, b).await
}

fn id_of(r: &Running, email: &str) -> String {
    r.server.db.account_by_email(email).unwrap().unwrap().id
}

/// Every sensitive route of the person and of the admin: `prove_first`
/// past ten minutes, answered within them (ADR 0083 item 6).
#[test]
fn every_sensitive_route_wants_a_proof_of_the_last_ten_minutes() {
    use reqwest::Method;
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let me = id_of(&r, "admin@casa.lan");
        let folder = crate::tests::folder_id(&r, &admin).await;
        // Within the window, a fresh sign-in needs nothing more; just inside
        // its edge, still nothing.
        r.server.db.age_proofs(&me, PROVE_WITHIN - 30).unwrap();
        let token = json!({ "name": "script", "write": false, "days": 30, "folders": [folder] });
        let (status, made) = send(
            &r,
            Method::POST,
            "/api/me/tokens",
            Some(token.clone()),
            &admin,
        )
        .await;
        assert_eq!(status, 200, "{made}");
        // A personal access token.
        let (status, made) =
            gated(&r, &admin, &me, Method::POST, "/api/me/tokens", Some(token)).await;
        assert_eq!(status, 200, "{made}");
        // A passkey added: the start, and the finish (which, with no
        // device behind it, passes the proof and fails the ceremony).
        let (status, started) = gated(
            &r,
            &admin,
            &me,
            Method::POST,
            "/api/me/passkeys",
            Some(json!({})),
        )
        .await;
        assert_eq!(status, 200, "{started}");
        let credential = json!({
            "id": "AAAA", "rawId": "AAAA", "type": "public-key", "extensions": {},
            "response": { "attestationObject": "AAAA", "clientDataJSON": "AAAA" },
        });
        let finish =
            json!({ "ceremony": started["ceremony"], "name": "n", "credential": credential });
        let (status, finished) = gated(
            &r,
            &admin,
            &me,
            Method::POST,
            "/api/me/passkeys/finish",
            Some(finish),
        )
        .await;
        assert_eq!(
            (status, &finished["error"]),
            (400, &json!("passkey")),
            "{finished}"
        );
        // A passkey removed.
        let key = r.server.db.add_passkey(&me, "chave", "{}").unwrap();
        let (status, removed) = gated(
            &r,
            &admin,
            &me,
            Method::DELETE,
            &format!("/api/me/passkeys/{key}"),
            None,
        )
        .await;
        assert_eq!(status, 200, "{removed}");
        // A device approved, by the code entered.
        let (_, device) = post(
            &r,
            "/api/device/start",
            json!({ "device": "Verso · Prova" }),
            None,
        )
        .await;
        let code = device["code"].as_str().unwrap();
        let (status, approved) = gated(
            &r,
            &admin,
            &me,
            Method::POST,
            "/api/device/approve",
            Some(json!({ "code": code })),
        )
        .await;
        assert_eq!(status, 200, "{approved}");
        // The password changed: the current one is still asked as well.
        let change = json!({ "current": "senha muito longa", "new": "senha muito longa de novo" });
        let (status, changed) = gated(
            &r,
            &admin,
            &me,
            Method::POST,
            "/api/me/password",
            Some(change),
        )
        .await;
        assert_eq!(status, 200, "{changed}");
        let change = json!({ "current": "senha muito longa de novo", "new": "senha muito longa" });
        let (status, changed) =
            send(&r, Method::POST, "/api/me/password", Some(change), &admin).await;
        assert_eq!(status, 200, "{changed}");
        // The admin's: powers, another's sessions, entering a folder,
        // deleting an account.
        let other = r
            .server
            .db
            .create_account(
                "outra@prova.example",
                "Outra",
                "pt",
                Some("a senha da outra conta"),
                false,
            )
            .unwrap();
        let theirs = r.server.db.create_folder("Dela", &other.id).unwrap();
        let account = format!("/api/admin/accounts/{}", other.id);
        let powers = json!({ "admin": false, "mayCreate": true });
        let (status, set) = gated(&r, &admin, &me, Method::PATCH, &account, Some(powers)).await;
        assert_eq!(status, 200, "{set}");
        let (status, ended) = gated(
            &r,
            &admin,
            &me,
            Method::DELETE,
            &format!("{account}/sessions"),
            None,
        )
        .await;
        assert_eq!(status, 200, "{ended}");
        let enter = format!("/api/admin/folders/{}/enter", theirs.id);
        let (status, entered) = gated(
            &r,
            &admin,
            &me,
            Method::POST,
            &enter,
            Some(json!({ "role": "reader" })),
        )
        .await;
        assert_eq!(status, 200, "{entered}");
        // The folder keeps an owner once its own goes.
        r.server
            .db
            .grant(&theirs.id, &me, crate::db::Role::Owner)
            .unwrap();
        let (status, deleted) = gated(&r, &admin, &me, Method::DELETE, &account, None).await;
        assert_eq!(status, 200, "{deleted}");
    });
}

/// `prove_first` says nothing of what was asked: a stale session hears the
/// same answer for a code that exists and one that does not, for an
/// account that exists and one that does not.
#[test]
fn prove_first_says_nothing_of_what_was_asked() {
    use reqwest::Method;
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let me = id_of(&r, "admin@casa.lan");
        let (_, device) = post(&r, "/api/device/start", json!({ "device": "Verso" }), None).await;
        let code = device["code"].as_str().unwrap();
        stale(&r, &me);
        for (method, path, body) in [
            (
                Method::POST,
                "/api/device/approve".to_owned(),
                json!({ "code": code }),
            ),
            (
                Method::POST,
                "/api/device/approve".to_owned(),
                json!({ "code": "ZZZZ-ZZZZ" }),
            ),
            (
                Method::DELETE,
                format!("/api/admin/accounts/{me}"),
                json!({}),
            ),
            (
                Method::DELETE,
                "/api/admin/accounts/nobody".to_owned(),
                json!({}),
            ),
            (
                Method::DELETE,
                "/api/me/passkeys/nobody".to_owned(),
                json!({}),
            ),
        ] {
            let said = send(&r, method.clone(), &path, Some(body), &admin).await;
            assert_eq!(said, prove_first(), "{method} {path}");
        }
    });
}

/// A wrong password at `/api/me/prove` is a refused sign-in (ADR 0083
/// items 1, 2 and 6): the log line the host's tools read, the account's
/// count in a row, and the same per-key delays as `/api/signin` — shared
/// with it, so that a stolen cookie guesses no faster here than there.
#[test]
fn a_wrong_password_to_prove_is_a_refused_sign_in() {
    block_on(async {
        let r = start().await;
        r.server
            .db
            .create_account(
                "prova@prove-wrong.example",
                "Prova",
                "pt",
                Some("a senha certa da prova"),
                false,
            )
            .unwrap();
        let b = sign_in(&r, "prova@prove-wrong.example", "a senha certa da prova").await;
        let mut statuses = Vec::new();
        for _ in 0..4 {
            let (status, body) = prove(&r, &b, "uma senha errada qualquer").await;
            statuses.push((status, body["error"].as_str().unwrap_or("").to_owned()));
        }
        assert_eq!(
            statuses,
            [
                (403, "signin_failed".to_owned()),
                (403, "signin_failed".to_owned()),
                (403, "signin_failed".to_owned()),
                (429, "too_many".to_owned()),
            ]
        );
        let lines = crate::log::said("sign-in failed from 127.0.0.1 for p***@prove-wrong.example");
        assert_eq!(
            lines,
            (1..=3)
                .map(|n| format!(
                    "WARN sign-in failed from 127.0.0.1 for p***@prove-wrong.example ({n} in a row)"
                ))
                .collect::<Vec<_>>()
        );
        // The same account's sign-in waits as well: one count, two doors.
        let (status, _) = post(
            &r,
            "/api/signin",
            json!({ "email": "prova@prove-wrong.example", "password": "a senha certa da prova" }),
            None,
        )
        .await;
        assert_eq!(status, 429, "the delay of /prove is the sign-in's");
        // Once the delay is past, the right password proves, and its
        // count in a row starts again.
        r.server.limiter.succeeded("in:127.0.0.1");
        r.server.limiter.succeeded("in:prova@prove-wrong.example");
        let (status, proved) = prove(&r, &b, "a senha certa da prova").await;
        assert_eq!(status, 200, "{proved}");
        let (status, _) = prove(&r, &b, "uma senha errada qualquer").await;
        assert_eq!(status, 403);
        assert_eq!(
            crate::log::said("for p***@prove-wrong.example (1 in a row)").len(),
            2,
            "the count starts again after a proof"
        );
    });
}

/// Only a session proves: a personal access token, and nobody, cannot.
#[test]
fn a_token_and_a_stranger_cannot_prove() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let folder = crate::tests::folder_id(&r, &admin).await;
        let (_, made) = post(
            &r,
            "/api/me/tokens",
            json!({ "name": "script", "write": true, "days": 30, "folders": [folder] }),
            Some(&admin),
        )
        .await;
        let secret = made["secret"].as_str().unwrap();
        let status = reqwest::Client::new()
            .post(r.url("/api/me/prove"))
            .bearer_auth(secret)
            .json(&json!({ "password": "senha muito longa" }))
            .send()
            .await
            .unwrap()
            .status()
            .as_u16();
        assert_eq!(status, 403);
        let (status, _) = post(
            &r,
            "/api/me/prove",
            json!({ "password": "senha muito longa" }),
            None,
        )
        .await;
        assert_eq!(status, 401);
    });
}

/// A passkey's proof: none kept is said as the sign-in says it; an answer
/// to a ceremony nobody started proves nothing; a body with neither, or
/// both, is refused.
#[test]
fn a_passkey_proves_only_through_its_own_ceremony() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let me = id_of(&r, "admin@casa.lan");
        let (status, body) = post(&r, "/api/me/prove/passkey", json!({}), Some(&admin)).await;
        assert_eq!(
            (status, &body["error"]),
            (401, &json!("no_passkey")),
            "{body}"
        );
        stale(&r, &me);
        let credential = json!({
            "id": "AAAA", "rawId": "AAAA", "type": "public-key", "extensions": {},
            "response": { "authenticatorData": "AAAA", "clientDataJSON": "AAAA", "signature": "AAAA", "userHandle": null },
        });
        let (status, body) = post(
            &r,
            "/api/me/prove",
            json!({ "ceremony": "nobody-started-it", "credential": credential }),
            Some(&admin),
        )
        .await;
        assert_eq!(
            (status, &body["error"]),
            (404, &json!("link_gone")),
            "{body}"
        );
        for odd in [
            json!({}),
            json!({ "password": "senha muito longa", "ceremony": "x", "credential": credential }),
        ] {
            let (status, _) = post(&r, "/api/me/prove", odd, Some(&admin)).await;
            assert_eq!(status, 400);
        }
        let said = send(
            &r,
            reqwest::Method::DELETE,
            "/api/me/passkeys/nobody",
            None,
            &admin,
        )
        .await;
        assert_eq!(said, prove_first(), "still not proved");
    });
}

/// A wrong code entered on the device's page (ADR 0083 item 17) counts
/// against the `device:` key of the address, and past the free failures
/// waits — the only door since the code left the address (decided
/// 2026-10-14; `a_code_in_the_address_approves_nothing`).
#[test]
fn a_typed_wrong_code_is_delayed() {
    use reqwest::Method;
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (_, device) = post(&r, "/api/device/start", json!({ "device": "Verso" }), None).await;
        assert!(device["code"].is_string(), "{device}");
        let tries = [
            (
                Method::POST,
                "/api/device/approve",
                json!({ "code": "BCDF-GHJK" }),
            ),
            (
                Method::POST,
                "/api/device/describe",
                json!({ "code": "bcdfghjk" }),
            ),
            (
                Method::POST,
                "/api/device/refuse",
                json!({ "code": "x".repeat(500) }),
            ),
            (
                Method::POST,
                "/api/device/approve",
                json!({ "code": "ZZZZ-ZZZZ" }),
            ),
        ];
        r.server.limiter.succeeded("device:127.0.0.1");
        let mut typed = Vec::new();
        for (method, path, body) in tries {
            typed.push(send(&r, method, path, Some(body), &admin).await.0);
        }
        assert_eq!(typed, [404, 404, 404, 429], "a typed code");
    });
}

/// The right code typed — in any case, with or without its dash — says who
/// asked and, with a fresh proof, approves: the app that asked gets its
/// token.
#[test]
fn a_typed_right_code_approves_the_device() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let me = id_of(&r, "admin@casa.lan");
        let (_, device) = post(
            &r,
            "/api/device/start",
            json!({ "device": "Verso · Digitado" }),
            None,
        )
        .await;
        let code = device["code"].as_str().unwrap().to_owned();
        let poll = device["poll"].as_str().unwrap().to_owned();
        let typed = format!(" {} ", code.replace('-', "").to_lowercase());
        let (status, what) = post(
            &r,
            "/api/device/describe",
            json!({ "code": typed }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 200, "{what}");
        assert_eq!(what["device"], "Verso · Digitado");
        assert_eq!(
            what["code"],
            json!(code),
            "the page shows the code it was given"
        );
        stale(&r, &me);
        let (status, said) = post(
            &r,
            "/api/device/approve",
            json!({ "code": typed }),
            Some(&admin),
        )
        .await;
        assert_eq!((status, said), prove_first());
        assert_eq!(prove(&r, &admin, "senha muito longa").await.0, 200);
        let (status, approved) = post(
            &r,
            "/api/device/approve",
            json!({ "code": typed }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 200, "{approved}");
        let (_, done) = post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
        assert!(
            done["token"].as_str().is_some_and(|t| !t.is_empty()),
            "{done}"
        );
    });
}

/// A device is approved only with the code the person entered (decided
/// 2026-10-14, ADR 0083 As built): the routes that took the code from the
/// address — `GET`, `POST` and `DELETE /api/device/{code}`, which a link
/// sent by someone else filled in — are gone, for a code that exists as
/// for one that does not, with a fresh proof and all; the code stays
/// pending, and the body's routes still describe it.
#[test]
fn a_code_in_the_address_approves_nothing() {
    use reqwest::Method;
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (_, device) = post(
            &r,
            "/api/device/start",
            json!({ "device": "Verso · Link" }),
            None,
        )
        .await;
        let code = device["code"].as_str().unwrap().to_owned();
        let poll = device["poll"].as_str().unwrap().to_owned();
        for path in [
            format!("/api/device/{code}"),
            "/api/device/BCDF-GHJK".to_owned(),
        ] {
            for method in [Method::GET, Method::POST, Method::DELETE] {
                let (status, said) = send(&r, method.clone(), &path, Some(json!({})), &admin).await;
                assert!(
                    status == 404 || status == 405,
                    "{method} {path} answered {status}: {said}"
                );
            }
        }
        let (_, waiting) = post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
        assert_eq!(waiting["pending"], true, "{waiting}");
        let (status, what) = post(
            &r,
            "/api/device/describe",
            json!({ "code": code }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 200, "{what}");
    });
}

/// Two more acts that hand over an account or a folder want a fresh proof
/// (ADR 0083 item 6, as the maintainer's review of 2026-10-13 read it): the
/// admin making a reset link for another account — with a stolen admin
/// cookie, the way to take it over — and an owner giving or changing a
/// member's role, by the members' route or the shares' route alike.
#[test]
fn a_reset_link_and_a_members_role_want_a_fresh_proof() {
    use reqwest::Method;
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let me = id_of(&r, "admin@casa.lan");
        let folder = crate::tests::folder_id(&r, &admin).await;
        let other = r
            .server
            .db
            .create_account(
                "membro@prova.example",
                "Membro",
                "pt",
                Some("a senha do membro aqui"),
                false,
            )
            .unwrap();
        let reset = format!("/api/admin/accounts/{}/reset", other.id);
        let (status, link) = gated(&r, &admin, &me, Method::POST, &reset, Some(json!({}))).await;
        assert_eq!(status, 200, "{link}");
        assert!(
            link["link"].as_str().is_some_and(|l| l.contains("/reset/")),
            "{link}"
        );
        let member = format!("/api/folders/{folder}/members/membro@prova.example");
        for role in ["reader", "editor"] {
            let (status, set) = gated(
                &r,
                &admin,
                &me,
                Method::PUT,
                &member,
                Some(json!({ "role": role })),
            )
            .await;
            assert_eq!(status, 200, "{role}: {set}");
            assert_eq!(
                r.server
                    .db
                    .role(&folder, &other.id)
                    .unwrap()
                    .map(|x| x.as_str()),
                Some(role)
            );
        }
        let shares = format!("/api/folders/{folder}/shares");
        let whole = json!({ "path": "", "email": "membro@prova.example", "role": "reader" });
        let (status, set) = gated(&r, &admin, &me, Method::PUT, &shares, Some(whole)).await;
        assert_eq!(status, 200, "{set}");
        assert_eq!(
            r.server.db.role(&folder, &other.id).unwrap(),
            Some(crate::db::Role::Reader)
        );
        // A share of a path inside: past the proof, the path is looked at.
        let inside =
            json!({ "path": "Nenhuma", "email": "membro@prova.example", "role": "reader" });
        let (status, said) = gated(&r, &admin, &me, Method::PUT, &shares, Some(inside)).await;
        assert_eq!(
            (status, &said["error"]),
            (404, &json!("no_folder")),
            "{said}"
        );
    });
}

/// An invitation that carries a folder or a share hands that folder over,
/// with any role up to owner: the admin's invitation wants a fresh proof
/// then, as entering a folder does; one that carries none is a link to sign
/// up and still goes without.
#[test]
fn an_invitation_to_a_folder_wants_a_fresh_proof() {
    use reqwest::Method;
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let me = id_of(&r, "admin@casa.lan");
        let folder = crate::tests::folder_id(&r, &admin).await;
        stale(&r, &me);
        for body in [
            json!({ "folder": folder, "role": "owner" }),
            json!({ "email": "nova@prova.example", "folder": folder }),
            json!({ "share": "nobody", "role": "editor" }),
        ] {
            let said = send(
                &r,
                Method::POST,
                "/api/admin/invitations",
                Some(body.clone()),
                &admin,
            )
            .await;
            assert_eq!(said, prove_first(), "an aged proof invited with {body}");
        }
        let (status, plain) = send(
            &r,
            Method::POST,
            "/api/admin/invitations",
            Some(json!({ "email": "nova@prova.example" })),
            &admin,
        )
        .await;
        assert_eq!(status, 200, "an invitation with no folder: {plain}");
        let (status, made) = gated(
            &r,
            &admin,
            &me,
            Method::POST,
            "/api/admin/invitations",
            Some(json!({ "folder": folder, "role": "owner" })),
        )
        .await;
        assert_eq!(status, 200, "{made}");
    });
}

/// A device's session is born unproved: the approval proved the browser
/// that approved it, not the app holding the token, which proves itself
/// as any session does before a sensitive action (ADR 0083 item 6).
#[test]
fn a_device_session_is_not_proved_by_its_approval() {
    use reqwest::Method;
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let other = r
            .server
            .db
            .create_account(
                "outra@aparelho.example",
                "Outra",
                "pt",
                Some("a senha da outra conta"),
                false,
            )
            .unwrap();
        let (_, device) = post(
            &r,
            "/api/device/start",
            json!({ "device": "Verso · Aparelho" }),
            None,
        )
        .await;
        let code = device["code"].as_str().unwrap().to_owned();
        let poll = device["poll"].as_str().unwrap().to_owned();
        let (status, approved) = send(
            &r,
            Method::POST,
            "/api/device/approve",
            Some(json!({ "code": code })),
            &admin,
        )
        .await;
        assert_eq!(status, 200, "{approved}");
        let (_, done) = post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
        let token = done["token"].as_str().unwrap().to_owned();
        let res = reqwest::Client::new()
            .delete(r.url(&format!("/api/admin/accounts/{}/sessions", other.id)))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        let said = (
            res.status().as_u16(),
            res.json::<Value>().await.unwrap_or(Value::Null),
        );
        assert_eq!(
            said,
            prove_first(),
            "a device's bearer right after its approval"
        );
    });
}

/// The desktop app proves through its device's session (ADR 0083 item 6):
/// the share grant it sends with its bearer answers `prove_first`, the
/// account's password at `/api/me/prove` with the same bearer stamps that
/// session — and only that one: the browser's session of the same account
/// still wants its own proof — and the grant goes through within the ten
/// minutes.
#[test]
fn a_device_session_proves_with_the_password_and_then_shares() {
    use reqwest::Method;
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let me = id_of(&r, "admin@casa.lan");
        let folder = crate::tests::folder_id(&r, &admin).await;
        r.server
            .db
            .create_account(
                "leitora@aparelho.example",
                "Leitora",
                "pt",
                Some("a senha da leitora aqui"),
                false,
            )
            .unwrap();
        let (device, _) = r
            .server
            .db
            .create_session(&me, "device", "Verso · Mesa", "127.0.0.1")
            .unwrap();
        stale(&r, &me);
        let bearer = |method: Method, path: &str, body: Value| {
            reqwest::Client::new()
                .request(method, r.url(path))
                .bearer_auth(&device)
                .json(&body)
                .send()
        };
        let shares = format!("/api/folders/{folder}/shares");
        let grant = json!({ "path": "", "email": "leitora@aparelho.example", "role": "reader" });
        let res = bearer(Method::PUT, &shares, grant.clone()).await.unwrap();
        let said = (res.status().as_u16(), res.json::<Value>().await.unwrap());
        assert_eq!(said, prove_first(), "the device's grant, unproved");
        let res = bearer(
            Method::POST,
            "/api/me/prove",
            json!({ "password": "senha muito longa" }),
        )
        .await
        .unwrap();
        assert_eq!(res.status().as_u16(), 200, "the device proves itself");
        let res = bearer(Method::PUT, &shares, grant).await.unwrap();
        let status = res.status().as_u16();
        assert_eq!(status, 200, "{}", res.text().await.unwrap_or_default());
        // The browser's session of the same account was not proved by it.
        let said = send(&r, Method::DELETE, "/api/me/passkeys/nobody", None, &admin).await;
        assert_eq!(
            said,
            prove_first(),
            "the browser's session keeps its own mark"
        );
    });
}
