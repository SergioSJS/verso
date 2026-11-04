// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The owner manages the people invited (ADR 0117 D9, the row of "forgot
//! the password"; `players.rs`): a new password by a single-use link the
//! owner hands over, the old one refused once it is set; every session
//! ended at once; an account removed with everything it held; never this
//! computer's own accounts; the audit log says each act and holds no link.
//! Through the real server; see `tests.rs` for the lab.

use futures_util::StreamExt;
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use super::tests::{Lab, Ws, lab, next, run};
use super::tests_accounts::{PASSWORD, accept, cookie_of};
use super::tests_devices::{as_page, bearer_get, bearer_ws, device_token, server_of};
use crate::db::Role;

const ANA: &str = "ana@example.org";
const NEW: &str = "outra senha longa da mesa 2027";

/// Ana, invited to `Campanha` as an editor: her browser's cookie and her
/// account's id.
async fn ana(lab: &Lab) -> (String, String) {
    let made = lab
        .local
        .invite(Some("Campanha"), Some(Role::Editor))
        .unwrap();
    let cookie = accept(lab, &made.link, ANA, "Ana").await;
    let id = lab.local.accounts().unwrap()[0].id.clone();
    (cookie, id)
}

/// A sign-in with `password`: its status, and the cookie when it opened.
async fn sign_in(lab: &Lab, password: &str) -> (u16, Option<String>) {
    let res = lab
        .client
        .post(lab.url("/api/signin"))
        .header("origin", lab.origin())
        .json(&json!({ "email": ANA, "password": password }))
        .send()
        .await
        .unwrap();
    (res.status().as_u16(), cookie_of(&res))
}

/// A reading token Ana makes in her browser.
async fn pat(lab: &Lab, cookie: &str) -> String {
    let (_, folders) = lab.get("/api/folders", Some(cookie)).await;
    let id = folders["folders"][0]["id"].as_str().unwrap().to_owned();
    let (status, made) = as_page(
        lab,
        "/api/me/tokens",
        json!({ "name": "script", "write": false, "days": 30, "folders": [id] }),
        cookie,
    )
    .await;
    assert_eq!(status, 200, "{made}");
    made["secret"].as_str().unwrap().to_owned()
}

/// The token of a reset link.
fn token_of(link: &str) -> String {
    link.rsplit_once("/reset/").unwrap().1.to_owned()
}

/// The socket is told its session is gone, or closed, within a few seconds
/// — not at its next exchange.
async fn told_gone(ws: &mut Ws) -> bool {
    let wait = std::time::Duration::from_secs(5);
    loop {
        match tokio::time::timeout(wait, ws.next()).await {
            Err(_) => return false,
            Ok(None | Some(Err(_) | Ok(Message::Close(_)))) => return true,
            Ok(Some(Ok(Message::Text(t)))) => {
                let v: Value = serde_json::from_str(&t).unwrap_or(Value::Null);
                if v["gone"] == "session" {
                    return true;
                }
            }
            Ok(Some(Ok(_))) => {}
        }
    }
}

/// What the audit log holds, as one string.
fn audit_text(lab: &Lab) -> String {
    serde_json::to_string(&lab.local.audit().unwrap()).unwrap()
}

/// The owner makes a new password's link: Ana's sessions and token end at
/// once; the link opens once, for a day, and sets the password — the old
/// one refused, the new one taken; a second link ends the first; serving
/// off, no link (no address). The audit says it, never the link.
#[test]
fn a_new_password_by_the_owners_link_once_and_the_old_one_refused() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let (cookie, id) = ana(&lab).await;
        let secret = pat(&lab, &cookie).await;
        let listed = lab.local.accounts().unwrap();
        assert_eq!(listed.len(), 1, "{listed:?}");
        assert_eq!(
            (listed[0].name.as_str(), listed[0].email.as_str()),
            ("Ana", ANA)
        );
        assert_eq!(
            listed[0].reaches,
            vec![("Campanha".to_owned(), Role::Editor)]
        );
        assert!(listed[0].last_seen.is_some(), "{listed:?}");
        let first = lab.local.reset_password(&id).unwrap();
        let reset = lab.local.reset_password(&id).unwrap();
        assert!(
            reset
                .link
                .starts_with(&format!("https://127.0.0.1:{}/reset/", lab.port)),
            "{}",
            reset.link
        );
        assert!(reset.expires - crate::db::now() <= crate::db::RESET_LIFE);
        // Whoever held the account is out at once, the token too.
        assert_eq!(lab.get("/api/me", Some(&cookie)).await.0, 401);
        assert_eq!(bearer_get(&lab, "/api/folders", &secret).await.0, 401);
        // The earlier link was ended by the later one.
        let (status, _) = lab
            .get(&format!("/api/reset/{}", token_of(&first.link)), None)
            .await;
        assert_eq!(status, 404, "an ended link");
        let token = token_of(&reset.link);
        let (status, said) = lab.get(&format!("/api/reset/{token}"), None).await;
        assert_eq!(status, 200, "{said}");
        assert_eq!(said["email"], ANA);
        // A password the rules refuse leaves the link to try again.
        let (status, _) = lab
            .post(
                &format!("/api/reset/{token}"),
                json!({ "password": "curta" }),
                None,
            )
            .await;
        assert_eq!(status, 400);
        let (status, set) = lab
            .post(
                &format!("/api/reset/{token}"),
                json!({ "password": NEW }),
                None,
            )
            .await;
        assert_eq!(status, 200, "{set}");
        let (again, _) = lab
            .post(
                &format!("/api/reset/{token}"),
                json!({ "password": "uma terceira senha bem longa" }),
                None,
            )
            .await;
        assert_eq!(again, 404, "the link opened twice");
        assert_eq!(sign_in(&lab, PASSWORD).await.0, 401, "the old password");
        let (status, fresh) = sign_in(&lab, NEW).await;
        assert_eq!(status, 200, "the new password");
        assert_eq!(lab.get("/api/me", fresh.as_deref()).await.0, 200);
        let audit = audit_text(&lab);
        for action in ["reset_link", "token_revoked", "password_reset"] {
            assert!(audit.contains(action), "{action}: {audit}");
        }
        let first_token = token_of(&first.link);
        for secret_word in [
            token.as_str(),
            first_token.as_str(),
            secret.as_str(),
            NEW,
            PASSWORD,
        ] {
            assert!(!audit.contains(secret_word), "a secret in the audit");
            assert!(
                crate::log::said(secret_word).is_empty(),
                "a secret in the log"
            );
        }
        // Serving off: the link would have no address.
        lab.local.stop();
        let off = lab.local.reset_password(&id).unwrap_err();
        assert!(off.contains("turn serving on first"), "{off}");
    });
}

/// *End sessions*: Ana's browser, her desktop app and her token are out at
/// once — her open window told now, not at its next exchange — and she
/// signs in again with her password, which did not change.
#[test]
fn ending_the_sessions_signs_the_player_out_at_once() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let (cookie, id) = ana(&lab).await;
        let secret = pat(&lab, &cookie).await;
        let device = device_token(&lab, &cookie, "Verso · Mac da Ana").await;
        let mut ws = lab.connect(&cookie).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        let mut app = bearer_ws(&lab, &device).await.unwrap();
        assert!(next(&mut app).await.get("hello").is_some());
        let (sessions, tokens) = lab.local.end_sessions(&id).unwrap();
        assert_eq!((sessions, tokens), (2, 1));
        assert!(told_gone(&mut ws).await, "the browser's window stayed open");
        assert!(
            told_gone(&mut app).await,
            "the desktop app stayed connected"
        );
        assert_eq!(lab.get("/api/me", Some(&cookie)).await.0, 401);
        assert_eq!(bearer_get(&lab, "/api/folders", &device).await.0, 401);
        assert_eq!(bearer_get(&lab, "/api/folders", &secret).await.0, 401);
        assert!(lab.local.devices().unwrap().is_empty());
        assert_eq!(sign_in(&lab, PASSWORD).await.0, 200, "the password stays");
        assert!(audit_text(&lab).contains("account_sessions_ended"));
        // Kept by the account's id, as on a UniVerso; shown by its e-mail.
        let server = server_of(&lab);
        let kept = server.db.audit_log(None, 50).unwrap();
        let line = kept
            .iter()
            .find(|l| l.action == "account_sessions_ended")
            .unwrap();
        assert_eq!(line.subject.as_deref(), Some(id.as_str()));
        let shown = lab.local.audit().unwrap();
        let line = shown
            .iter()
            .find(|l| l.action == "account_sessions_ended")
            .unwrap();
        assert_eq!(line.subject.as_deref(), Some(ANA));
    });
}

/// *Remove*: Ana's browser, desktop app, token, folder and share open
/// nothing, her window is closed at once, she signs in no more, and a link
/// made for her before opens nothing; removed twice, said. Her address may
/// be invited again, as a new account that has nothing of the old one.
#[test]
fn removing_an_account_takes_everything_it_held() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let (cookie, id) = ana(&lab).await;
        let secret = pat(&lab, &cookie).await;
        let device = device_token(&lab, &cookie, "Verso · Mac da Ana").await;
        let server = server_of(&lab);
        let folder = server.db.folder_by_dir("Campanha").unwrap().unwrap();
        let share = server.db.make_share(&folder.id, "Mapas").unwrap();
        server.db.grant_share(&share.id, &id, Role::Reader).unwrap();
        let reaches = lab.local.accounts().unwrap()[0].reaches.clone();
        assert!(
            reaches.contains(&("Campanha/Mapas".to_owned(), Role::Reader)),
            "{reaches:?}"
        );
        let reset = lab.local.reset_password(&id).unwrap();
        let fresh = sign_in(&lab, PASSWORD).await.1.unwrap();
        let mut ws = lab.connect(&fresh).await.unwrap();
        assert!(next(&mut ws).await.get("hello").is_some());
        lab.local.remove_account(&id).unwrap();
        assert!(told_gone(&mut ws).await, "the window stayed open");
        assert!(lab.local.accounts().unwrap().is_empty());
        assert_eq!(lab.get("/api/me", Some(&fresh)).await.0, 401);
        assert_eq!(bearer_get(&lab, "/api/folders", &device).await.0, 401);
        assert_eq!(bearer_get(&lab, "/api/folders", &secret).await.0, 401);
        assert_eq!(sign_in(&lab, PASSWORD).await.0, 401);
        let (gone, _) = lab
            .get(&format!("/api/reset/{}", token_of(&reset.link)), None)
            .await;
        assert_eq!(gone, 404, "a link of a removed account");
        assert!(server.db.share_people(&share.id).unwrap().is_empty());
        assert!(
            server
                .db
                .members(&folder.id)
                .unwrap()
                .iter()
                .all(|(a, _)| a.id != id)
        );
        let again = lab.local.remove_account(&id).unwrap_err();
        assert!(again.contains("no account here"), "{again}");
        // Invited again: a new account, with nothing of the old one's.
        let made = lab.local.invite(None, None).unwrap();
        let back = accept(&lab, &made.link, ANA, "Ana").await;
        let (_, folders) = lab.get("/api/folders", Some(&back)).await;
        assert_eq!(folders["folders"], json!([]), "{folders}");
        let audit = audit_text(&lab);
        assert!(audit.contains("account_deleted"), "{audit}");
        assert!(
            !audit.contains(&token_of(&reset.link)),
            "a link in the audit"
        );
    });
}

/// This computer's own accounts are no player's: the owner — whose
/// sessions are its phones and its window's seat — and the holder of the
/// folders served in part are listed nowhere and refused by every act, and
/// a phone and the seat keep working; an id that is no one's is said.
#[test]
fn this_computers_accounts_are_never_acted_on() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let phone = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let seat = lab.local.sit(&lab.notes.path().join("Campanha")).unwrap();
        let server = server_of(&lab);
        let owner = server.db.local_owner().unwrap();
        let holder = server.db.vault_holder().unwrap();
        assert!(lab.local.accounts().unwrap().is_empty());
        for account in [&owner.id, &holder.id] {
            for refused in [
                lab.local.reset_password(account).map(|_| ()),
                lab.local.end_sessions(account).map(|_| ()),
                lab.local.remove_account(account),
            ] {
                let words = refused.unwrap_err();
                assert!(words.contains("no player's"), "{words}");
            }
        }
        assert!(server.db.account(&owner.id).unwrap().is_some());
        assert!(server.db.account(&holder.id).unwrap().is_some());
        assert_eq!(
            lab.get("/api/folders", Some(&phone)).await.0,
            200,
            "the phone"
        );
        let answer = seat.request("GET", "/api/folders", None).unwrap();
        assert_eq!(answer.status, 200, "the seat");
        for id in ["", "nobody"] {
            let words = lab.local.end_sessions(id).unwrap_err();
            assert!(words.contains("no account here"), "{words}");
        }
        assert!(
            !audit_text(&lab).contains("account_"),
            "an act refused is no act"
        );
    });
}

/// Removing a person refuses while a folder would be left with no owner,
/// as the console's removal does (decided 2026-11-04: one act for both):
/// the folder keeps an owner, given another first. Nothing goes, and
/// nothing is in the audit.
#[test]
fn removing_the_only_owner_of_a_folder_is_refused() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let (_, id) = ana(&lab).await;
        let server = server_of(&lab);
        server.db.create_folder("Diário da Ana", &id).unwrap();
        let words = lab.local.remove_account(&id).unwrap_err();
        assert!(words.contains("Diário da Ana keeps an owner"), "{words}");
        assert!(server.db.account(&id).unwrap().is_some());
        assert!(server.db.folder_by_dir("Diário da Ana").unwrap().is_some());
        assert!(!audit_text(&lab).contains("account_deleted"));
    });
}
