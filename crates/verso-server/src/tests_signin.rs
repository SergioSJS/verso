// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Signing in made harder to abuse (ADR 0083 items 2 to 4): an account
//! told of the guesses against it, a password from the attackers' lists
//! refused, and a recovery that takes the account's tokens with it.

use std::time::Duration;

use serde_json::{Value, json};

use crate::tests::{Running, block_on, get, post, sign_in, start, start_with};

/// The mails the test server sent, kept in memory.
fn sent(r: &Running) -> Vec<(String, String, String)> {
    match r.server.mail.get() {
        Some(crate::mail::Mail::Memory(m)) => verso_service::lock(m).clone(),
        _ => Vec::new(),
    }
}

/// A wrong password for `email`, the per-key delays cleared first: they
/// are not this test's subject.
async fn refused(r: &Running, email: &str) -> u16 {
    r.server.limiter.succeeded("in:127.0.0.1");
    r.server
        .limiter
        .succeeded(&format!("in:{}", crate::db::fold_email(email)));
    post(
        r,
        "/api/signin",
        json!({ "email": email, "password": "uma senha errada qualquer" }),
        None,
    )
    .await
    .0
}

/// Twenty refused sign-ins within an hour tell the account by mail, once;
/// the twenty-first does not tell it again; the admin's log and the
/// console's overview say it (ADR 0083 item 2).
#[test]
fn twenty_refusals_in_an_hour_tell_the_account_once() {
    block_on(async {
        let r = start_with(|c| c.public_url = Some("@self".into())).await;
        let _ = r
            .server
            .mail
            .set(crate::mail::Mail::Memory(std::sync::Mutex::new(Vec::new())));
        let bia = r
            .server
            .db
            .create_account(
                "bia@notice.example",
                "Bia",
                "en",
                Some("a senha certa da bia"),
                false,
            )
            .unwrap();
        let to_bia = |r: &Running| {
            sent(r)
                .into_iter()
                .filter(|m| m.0 == "bia@notice.example")
                .collect::<Vec<_>>()
        };
        for _ in 0..19 {
            assert_eq!(refused(&r, "bia@notice.example").await, 401);
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert!(to_bia(&r).is_empty(), "told before the twentieth");
        assert_eq!(refused(&r, "Bia@Notice.example").await, 401);
        let mut mails = to_bia(&r);
        for _ in 0..100 {
            if !mails.is_empty() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
            mails = to_bia(&r);
        }
        assert_eq!(mails.len(), 1, "{mails:?}");
        assert!(mails[0].2.contains("127.0.0.1"), "{}", mails[0].2);
        assert!(mails[0].2.contains("20 times"), "{}", mails[0].2);
        // The twenty-first: not told again.
        assert_eq!(refused(&r, "bia@notice.example").await, 401);
        tokio::time::sleep(Duration::from_millis(500)).await;
        assert_eq!(to_bia(&r).len(), 1);
        // The admin's line, once.
        let said = crate::log::said(&format!("account {}: 20 sign-ins refused", bia.id));
        assert_eq!(said.len(), 1, "{said:?}");
        assert!(said[0].starts_with("INFO "), "{said:?}");
        // The console counts the account.
        r.server.limiter.succeeded("in:127.0.0.1");
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (_, overview) = get(&r, "/api/admin/overview", Some(&admin)).await;
        assert_eq!(overview["underAttack"], json!(1), "{overview}");
        // An e-mail with no account is told nothing, and costs the same work.
        for _ in 0..21 {
            assert_eq!(refused(&r, "ninguem@notice.example").await, 401);
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert!(
            sent(&r).iter().all(|m| m.0 != "ninguem@notice.example"),
            "{:?}",
            sent(&r)
        );
        let (_, overview) = get(&r, "/api/admin/overview", Some(&admin)).await;
        assert_eq!(overview["underAttack"], Value::from(1), "{overview}");
    });
}

/// A password from the lists attackers try first, or the account's own
/// e-mail, is refused where a password is chosen — an invitation's
/// acceptance, a reset, a change — with its own code (ADR 0083 item 3).
#[test]
fn a_password_from_the_lists_is_refused_where_one_is_chosen() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (_, inv) = post(&r, "/api/admin/invitations", json!({}), Some(&admin)).await;
        let token = inv["link"]
            .as_str()
            .unwrap()
            .rsplit('/')
            .next()
            .unwrap()
            .to_owned();
        let accept = |password: &'static str| {
            let path = format!("/api/invite/{token}");
            let r = &r;
            async move {
                post(
                    r,
                    &path,
                    json!({ "email": "carla.mendes@lists.example", "name": "Carla", "password": password, "lang": "pt" }),
                    None,
                )
                .await
            }
        };
        for common in ["qwertyuiop12", "Carla.Mendes@lists.example", "carla.mendes"] {
            let (status, body) = accept(common).await;
            assert_eq!(
                (status, body["error"].clone()),
                (400, json!("common_password")),
                "{common}: {body}"
            );
            assert_eq!(
                body["message"],
                "this password is on the lists attackers try first"
            );
        }
        let (status, _) = accept("uma frase longa que ninguem tenta").await;
        assert_eq!(status, 200);
        // A change.
        let (status, body) = post(
            &r,
            "/api/me/password",
            json!({ "current": "senha muito longa", "new": "password1234" }),
            Some(&admin),
        )
        .await;
        assert_eq!(
            (status, body["error"].clone()),
            (400, json!("common_password")),
            "{body}"
        );
        // A reset.
        let admin_id = r
            .server
            .db
            .account_by_email("admin@casa.lan")
            .unwrap()
            .unwrap()
            .id;
        let (_, link) = post(
            &r,
            &format!("/api/admin/accounts/{admin_id}/reset"),
            json!({}),
            Some(&admin),
        )
        .await;
        let reset = link["link"]
            .as_str()
            .unwrap()
            .rsplit('/')
            .next()
            .unwrap()
            .to_owned();
        let (status, body) = post(
            &r,
            &format!("/api/reset/{reset}"),
            json!({ "password": "admin@casa.lan" }),
            None,
        )
        .await;
        assert_eq!(
            (status, body["error"].clone()),
            (400, json!("common_password")),
            "{body}"
        );
    });
}

/// What `/api/folders` answers a request with `secret` as its bearer.
async fn with_token(r: &Running, secret: &str) -> u16 {
    reqwest::Client::new()
        .get(r.url("/api/folders"))
        .bearer_auth(secret)
        .send()
        .await
        .unwrap()
        .status()
        .as_u16()
}

/// A new personal access token of the browser `b`, reading `folder`.
async fn new_token(r: &Running, b: &crate::tests::Browser, folder: &str) -> (String, String) {
    let (status, made) = post(
        r,
        "/api/me/tokens",
        json!({ "name": "script", "write": false, "days": 30, "folders": [folder] }),
        Some(b),
    )
    .await;
    assert_eq!(status, 200, "{made}");
    (
        made["secret"].as_str().unwrap().to_owned(),
        made["token"]["id"].as_str().unwrap().to_owned(),
    )
}

/// The audit log's `token_revoked` rows for token `id`.
fn revoked_rows(r: &Running, id: &str) -> usize {
    r.server
        .db
        .audit_log(None, 1000)
        .unwrap()
        .iter()
        .filter(|a| a.action == "token_revoked" && a.subject.as_deref() == Some(id))
        .count()
}

/// A password reset — by a link, or on the server's machine — revokes the
/// account's tokens, each in the audit log: the link's when it is made
/// (decided 2026-11-04, as on the machine); a change does when asked, and
/// otherwise says how many stay (ADR 0083 item 4).
#[test]
fn a_reset_takes_the_accounts_tokens_and_a_change_does_when_asked() {
    block_on(async {
        let r = start().await;
        let mut admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let folder = crate::tests::folder_id(&r, &admin).await;
        let admin_id = r
            .server
            .db
            .account_by_email("admin@casa.lan")
            .unwrap()
            .unwrap()
            .id;
        // A reset by link: the token answers 401 after it.
        let (secret, id) = new_token(&r, &admin, &folder).await;
        assert_eq!(with_token(&r, &secret).await, 200);
        let (_, link) = post(
            &r,
            &format!("/api/admin/accounts/{admin_id}/reset"),
            json!({}),
            Some(&admin),
        )
        .await;
        let reset = link["link"]
            .as_str()
            .unwrap()
            .rsplit('/')
            .next()
            .unwrap()
            .to_owned();
        let (status, done) = post(
            &r,
            &format!("/api/reset/{reset}"),
            json!({ "password": "uma senha nova bem longa" }),
            None,
        )
        .await;
        assert_eq!(status, 200, "{done}");
        assert_eq!(
            with_token(&r, &secret).await,
            401,
            "the token outlived the reset"
        );
        // Revoked when the link was made: none left when it is used.
        assert_eq!(done["done"]["tokensRevoked"], json!(0), "{done}");
        assert_eq!(revoked_rows(&r, &id), 1);
        // A reset on the server's machine (`universo admin reset`).
        admin = sign_in(&r, "admin@casa.lan", "uma senha nova bem longa").await;
        let (secret, id) = new_token(&r, &admin, &folder).await;
        crate::admin_reset(&r.server.config, "admin@casa.lan").unwrap();
        assert_eq!(
            with_token(&r, &secret).await,
            401,
            "the token outlived the reset"
        );
        assert_eq!(revoked_rows(&r, &id), 1);
        // A change with `revokeTokens`: gone.
        r.server.limiter.succeeded("in:127.0.0.1");
        admin = sign_in(&r, "admin@casa.lan", "uma senha nova bem longa").await;
        let (secret, id) = new_token(&r, &admin, &folder).await;
        let (status, changed) = post(
            &r,
            "/api/me/password",
            json!({ "current": "uma senha nova bem longa", "new": "mais uma senha bem longa", "revokeTokens": true }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 200, "{changed}");
        assert_eq!(
            with_token(&r, &secret).await,
            401,
            "the token outlived the change"
        );
        assert_eq!(changed["tokensRevoked"], json!(1), "{changed}");
        assert_eq!(revoked_rows(&r, &id), 1);
        // A change without it: the token stays, and the answer says so.
        let (secret, _) = new_token(&r, &admin, &folder).await;
        let (_, other) = new_token(&r, &admin, &folder).await;
        let _ = other;
        let (status, changed) = post(
            &r,
            "/api/me/password",
            json!({ "current": "mais uma senha bem longa", "new": "a ultima senha bem longa" }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 200, "{changed}");
        assert_eq!(with_token(&r, &secret).await, 200);
        assert_eq!(changed["tokensKept"], json!(2), "{changed}");
    });
}

/// A sign-in to an account with no password yet — made by the admin, its
/// link not used — takes a hash's time, as an unknown e-mail and a wrong
/// password do: the answer's delay does not tell that the account exists
/// and has no password.
#[test]
fn an_account_with_no_password_yet_costs_a_hash_too() {
    block_on(async {
        let r = start().await;
        r.server
            .db
            .create_account("sem-senha@hash.example", "Sem", "pt", None, false)
            .unwrap();
        let tried = "a senha tentada numa conta sem senha";
        let (status, body) = post(
            &r,
            "/api/signin",
            json!({ "email": "sem-senha@hash.example", "password": tried }),
            None,
        )
        .await;
        assert_eq!(status, 401, "{body}");
        assert!(
            crate::crypto::wasted(tried),
            "an account with no password answered without hashing"
        );
    });
}

/// The link from a sign-in mail names its account before it is used: the
/// page asks "sign in as …?" first, so a link someone else sent — for
/// their own account — is not taken without a click that says whose it
/// is. Looking does not use it; using it once ends it.
#[test]
fn a_sign_in_link_names_its_account_before_it_is_used() {
    block_on(async {
        let r = start().await;
        let admin = r
            .server
            .db
            .account_by_email("admin@casa.lan")
            .unwrap()
            .unwrap();
        let token = "um-link-de-entrada-de-teste";
        verso_service::lock(&r.server.signin_links).insert(
            crate::crypto::hash(token),
            (
                admin.id.clone(),
                std::time::Instant::now(),
                "127.0.0.1".to_owned(),
            ),
        );
        let path = format!("/api/signin/link/{token}");
        for _ in 0..2 {
            let (status, offer) = get(&r, &path, None).await;
            assert_eq!(
                (status, offer),
                (200, json!({ "email": "admin@casa.lan" })),
                "a link names its account, and looking does not use it"
            );
        }
        let (status, used) = post(&r, &path, json!({}), None).await;
        assert_eq!(status, 200, "{used}");
        let (status, gone) = get(&r, &path, None).await;
        assert_eq!((status, &gone["error"]), (404, &json!("link_gone")));
        let (status, _) = get(&r, "/api/signin/link/nenhum", None).await;
        assert_eq!(status, 404);
    });
}
