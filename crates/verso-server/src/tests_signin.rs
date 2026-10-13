// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Signing in made harder to abuse (ADR 0083 items 2 to 4): an account
//! told of the guesses against it, a password from the attackers' lists
//! refused, and a recovery that takes the account's tokens with it.

use std::time::Duration;

use serde_json::{Value, json};

use crate::tests::{Running, block_on, get, post, sign_in, start};

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
        let r = start().await;
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
