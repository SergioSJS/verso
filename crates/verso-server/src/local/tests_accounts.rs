// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Accounts in "this app is a server" (ADR 0117 D3 item 2): the owner is
//! the server's admin, a player is invited by a single-use link — on the
//! network as through the internet link (D4 Q8) — and signs in under ADR
//! 0083's limits, keyed on the address the tunnel forwards; a folder
//! served in part is no player's, whatever grant was made; a paired phone
//! is what it was. Through the real server; see `tests.rs` for the lab.

use std::sync::Arc;

use serde_json::{Value, json};

use super::lock;
use super::tests::{Lab, call, lab, next, run};
use super::tests_parts::lab_in_part;
use crate::db::Role;

pub(super) const NAME: &str = "tidy-otter-quiet-lamp.trycloudflare.com";
pub(super) const ORIGIN: &str = "https://tidy-otter-quiet-lamp.trycloudflare.com";
pub(super) const PASSWORD: &str = "uma senha longa da mesa 2026";

/// The cookie a response set, as a browser sends it back.
pub(super) fn cookie_of(res: &reqwest::Response) -> Option<String> {
    res.headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .map(str::to_owned)
}

/// The token of an invitation's link.
pub(super) fn token_of(link: &str) -> String {
    link.rsplit_once("/invite/").unwrap().1.to_owned()
}

/// A player accepts `link` on the network: their cookie.
pub(super) async fn accept(lab: &Lab, link: &str, email: &str, name: &str) -> String {
    let token = token_of(link);
    let res = lab
        .client
        .post(lab.url(&format!("/api/invite/{token}")))
        .header("origin", lab.origin())
        .json(&json!({ "email": email, "name": name, "password": PASSWORD, "lang": "pt" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status().as_u16(), 200, "accepting {email}");
    cookie_of(&res).unwrap()
}

/// Through the internet link's listener, as the tunnel forwards a client
/// at `from` that wrote `forged` in its own `X-Forwarded-For`.
pub(super) fn through(port: u16, path: &str, forged: &str, from: &str) -> reqwest::RequestBuilder {
    reqwest::Client::new()
        .post(format!("http://127.0.0.1:{port}{path}"))
        .header("host", NAME)
        .header("origin", ORIGIN)
        .header("x-forwarded-for", format!("{forged},{from}"))
        .header("x-forwarded-proto", "https")
}

/// The owner is this server's admin — an owner of before is made one at the
/// next start — and its phones are not: a phone is a device of the owner,
/// a reader or an editor, never above (ADR 0096 item 12).
#[test]
fn the_owner_is_admin_and_its_phones_are_not() {
    run(async {
        let mut lab = lab();
        {
            // The owner as a build of before made it: not an admin.
            let db = crate::db::Db::open(&lab.dir.path().join("local")).unwrap();
            let owner = db.local_owner().unwrap();
            db.set_powers(&owner.id, false, false).unwrap();
        }
        lab.serve();
        let server = Arc::clone(&lock(&lab.local.shared.inner).as_ref().unwrap().server);
        let owner = server.db.local_owner().unwrap();
        assert!(owner.admin && !owner.may_create, "{owner:?}");
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let (_, me) = lab.get("/api/me", Some(&cookie)).await;
        assert_eq!(me["account"]["email"], crate::db::LOCAL_OWNER);
        assert_eq!(me["account"]["admin"], false, "{me}");
        let mut ws = super::tests::open(&lab, &cookie).await;
        let refused = call(&mut ws, 50, "campaign_invite", json!({ "root": "" })).await;
        assert_eq!(refused["err"]["kind"], "not_on_phone", "{refused}");
    });
}

/// The way in for a player, on the network (D4 Q8): an invitation for a
/// folder at a role, accepted with an e-mail-shaped name, a name and a
/// password (nothing is mailed, Q5); single use; the player reaches that
/// folder at that role and nothing else; the list says it was used, and by
/// whom; an ended invitation opens nothing.
#[test]
fn a_player_is_invited_once_and_reaches_what_was_given() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let made = lab
            .local
            .invite(Some("Campanha"), Some(Role::Reader))
            .unwrap();
        assert_eq!(
            made.link,
            format!(
                "https://127.0.0.1:{}/invite/{}",
                lab.port,
                token_of(&made.link)
            )
        );
        let (status, offer) = lab
            .get(&format!("/api/invite/{}", token_of(&made.link)), None)
            .await;
        assert_eq!(status, 200, "{offer}");
        assert_eq!(offer["folder"], "Campanha");
        let cookie = accept(&lab, &made.link, "ana@example.org", "Ana").await;
        let (_, me) = lab.get("/api/me", Some(&cookie)).await;
        assert_eq!(me["account"]["email"], "ana@example.org");
        assert_eq!(me["account"]["admin"], false);
        let (_, folders) = lab.get("/api/folders", Some(&cookie)).await;
        let list = folders["folders"].as_array().unwrap();
        assert_eq!(list.len(), 1, "{folders}");
        assert_eq!(list[0]["role"], "reader");
        let mut ws = super::tests::open(&lab, &cookie).await;
        let notes = call(&mut ws, 2, "list_notes", json!({})).await;
        assert_eq!(notes["ok"], json!(["Sessao.md"]));
        let wrote = call(
            &mut ws,
            3,
            "write_note",
            json!({ "path": "Sessao.md", "text": "# outra\n" }),
        )
        .await;
        assert!(wrote.get("err").is_some(), "a reader wrote: {wrote}");
        // The computer's own commands are no player's.
        for (n, cmd) in [
            "reveal",
            "open_url",
            "local_server_start",
            "local_server_pair_open",
            "install_cli",
            "log_read",
            "trash_empty",
        ]
        .into_iter()
        .enumerate()
        {
            let answer = call(&mut ws, 10 + n as u64, cmd, json!({})).await;
            assert!(answer.get("ok").is_none(), "{cmd} was run: {answer}");
        }
        // Once: the same link again opens nothing.
        let token = token_of(&made.link);
        let (again, _) = lab
            .post(
                &format!("/api/invite/{token}"),
                json!({ "email": "bia@example.org", "name": "Bia", "password": PASSWORD, "lang": "pt" }),
                None,
            )
            .await;
        assert_eq!(again, 404, "a used invitation");
        let rows = lab.local.invitations().unwrap();
        let row = rows.iter().find(|r| r.id == made.id).unwrap();
        assert_eq!(
            (
                row.state.as_str(),
                row.used_by.as_deref(),
                row.folder.as_deref()
            ),
            ("used", Some("Ana"), Some("Campanha"))
        );
        // Ended before use: gone.
        let other = lab.local.invite(None, None).unwrap();
        lab.local.end_invitation(&other.id).unwrap();
        let (gone, _) = lab
            .get(&format!("/api/invite/{}", token_of(&other.link)), None)
            .await;
        assert_eq!(gone, 404);
        assert!(lab.local.end_invitation(&other.id).is_err(), "ended once");
        // No owner's role is handed out by an invitation.
        assert!(
            lab.local
                .invite(Some("Campanha"), Some(Role::Owner))
                .is_err()
        );
        assert!(lab.local.invite(Some("Nowhere"), None).is_err());
        // The audit log has it; the log has no link.
        let actions: Vec<String> = lab
            .local
            .audit()
            .unwrap()
            .into_iter()
            .map(|a| a.action)
            .collect();
        for action in ["invitation_created", "invitation_used", "invitation_ended"] {
            assert!(actions.iter().any(|a| a == action), "{action}: {actions:?}");
        }
        assert!(crate::log::said(&token).is_empty(), "a link in the log");
    });
}

/// Through the internet link a sign-in is limited by the address the
/// tunnel forwarded — the rightmost of `X-Forwarded-For` — and what the
/// client wrote before it moves no limit; by account as well; the refused
/// line names that address and never the forged one; a right sign-in
/// through the link gets a `Secure` `__Host-` cookie; and the invitation's
/// link is built from the link's origin.
#[test]
fn sign_in_through_the_link_is_limited_by_the_forwarded_address() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let made = lab.local.invite(None, None).unwrap();
        assert!(
            made.link.starts_with(&format!("{ORIGIN}/invite/")),
            "{}",
            made.link
        );
        accept(&lab, &made.link, "cris-link@example.org", "Cris").await;
        let sign_in = |email: &str, password: &str, forged: &str, from: &str| {
            through(port, "/api/signin", forged, from)
                .json(&json!({ "email": email, "password": password }))
        };
        // Three wrong, each a different e-mail and a different forged
        // address, all from one client: the fourth is limited.
        for n in 0..3 {
            let res = sign_in(
                &format!("nobody{n}@example.org"),
                "wrong",
                &format!("198.51.100.{n}"),
                "203.0.113.71",
            )
            .send()
            .await
            .unwrap();
            assert_eq!(res.status().as_u16(), 401, "attempt {n}");
        }
        let fourth = sign_in(
            "nobody9@example.org",
            "wrong",
            "198.51.100.9",
            "203.0.113.71",
        );
        assert_eq!(fourth.send().await.unwrap().status().as_u16(), 429);
        // Another client is heard: the limit is that address's.
        let other = sign_in(
            "nobody8@example.org",
            "wrong",
            "203.0.113.71",
            "203.0.113.72",
        );
        assert_eq!(other.send().await.unwrap().status().as_u16(), 401);
        assert!(!crate::log::said("sign-in failed from 203.0.113.71").is_empty());
        assert!(
            crate::log::said("198.51.100.").is_empty(),
            "a forged address was written: {:?}",
            crate::log::said("198.51.100.")
        );
        // By account: one e-mail from four addresses.
        for n in 0..3 {
            let res = sign_in(
                "cris-link@example.org",
                "wrong",
                "x",
                &format!("203.0.113.8{n}"),
            );
            assert_eq!(res.send().await.unwrap().status().as_u16(), 401);
        }
        let res = sign_in("cris-link@example.org", PASSWORD, "x", "203.0.113.89");
        assert_eq!(
            res.send().await.unwrap().status().as_u16(),
            429,
            "by account"
        );
        // An invitation accepted through the link, then a right sign-in
        // from a fresh address: a `Secure` `__Host-` cookie each time, and
        // the folders through the link with it.
        let made = lab
            .local
            .invite(Some("Campanha"), Some(Role::Editor))
            .unwrap();
        let path = format!("/api/invite/{}", token_of(&made.link));
        let res = through(port, &path, "x", "203.0.113.91")
            .json(&json!({ "email": "davi-link@example.org", "name": "Davi", "password": PASSWORD, "lang": "en" }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        let res = sign_in("davi-link@example.org", PASSWORD, "x", "203.0.113.90")
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        let set = res.headers()["set-cookie"].to_str().unwrap().to_owned();
        assert!(
            set.starts_with("__Host-verso-session=") && set.contains("; Secure"),
            "{set}"
        );
        let folders: Value = reqwest::Client::new()
            .get(format!("http://127.0.0.1:{port}/api/folders"))
            .header("host", NAME)
            .header("x-forwarded-for", "203.0.113.90")
            .header("x-forwarded-proto", "https")
            .header("cookie", cookie_of(&res).unwrap())
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(folders["folders"][0]["role"], "editor", "{folders}");
        // Neither the link nor an invitation is written in the log.
        assert!(crate::log::said("tidy-otter-quiet-lamp").is_empty());
        assert!(crate::log::said(&token_of(&made.link)).is_empty());
    });
}

/// A folder served in part is no player's (ADR 0117 D3 item 1): not by its
/// own id, not by a share of a part, not in a list, not as a file — even
/// with a grant made by mistake — and no invitation names it. The owner's
/// phone opens its parts as before.
#[test]
fn a_player_never_reaches_a_folder_served_in_part() {
    run(async {
        let mut lab = lab_in_part(&["Projetos"]);
        lab.serve();
        let server = Arc::clone(&lock(&lab.local.shared.inner).as_ref().unwrap().server);
        let vault = server.db.folder_by_dir("Campanha").unwrap().unwrap();
        let share = server.db.shares_of(&vault.id).unwrap().remove(0);
        assert!(lab.local.invite(Some("Campanha"), None).is_err());
        let made = lab.local.invite(None, None).unwrap();
        let cookie = accept(&lab, &made.link, "eva@example.org", "Eva").await;
        let eva = server
            .db
            .account_by_email("eva@example.org")
            .unwrap()
            .unwrap();
        // Grants made by mistake: the lock holds anyway.
        server.db.grant(&vault.id, &eva.id, Role::Editor).unwrap();
        server
            .db
            .grant_share(&share.id, &eva.id, Role::Editor)
            .unwrap();
        let (_, folders) = lab.get("/api/folders", Some(&cookie)).await;
        let listed = folders.to_string();
        assert!(
            !listed.contains(&vault.id) && !listed.contains(&share.id),
            "{folders}"
        );
        let mut ws = lab.connect(&cookie).await.unwrap();
        let _hello = next(&mut ws).await;
        for (n, id) in [(1, &vault.id), (2, &share.id)] {
            let opened = call(&mut ws, n, "open_server_folder", json!({ "id": id })).await;
            assert!(opened.get("ok").is_none(), "{id} opened: {opened}");
        }
        for path in [
            format!("/f/{}/Raiz.md", vault.id),
            format!("/f/{}/Segredo/c.md", vault.id),
            format!("/f/{}/a.md", share.id),
        ] {
            let res = lab
                .client
                .get(lab.url(&path))
                .header("cookie", &cookie)
                .send()
                .await
                .unwrap();
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            assert!(status >= 400, "{path}: {status}");
            assert!(!body.contains(super::tests_parts::NEEDLE), "{path}");
        }
        // The owner's phone: the part as before.
        let phone = lab.pair("iPad", true, Role::Reader).await.unwrap();
        let (_, mine) = lab.get("/api/folders", Some(&phone)).await;
        assert!(mine.to_string().contains(&share.id), "{mine}");
    });
}

/// A paired phone is answered as before on the routes of an account: as an
/// unknown route; it signs nobody in, joins nothing, lists no session.
#[test]
fn a_phone_has_none_of_the_routes_of_an_account() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let cookie = lab.pair("iPhone", true, Role::Editor).await.unwrap();
        let made = lab
            .local
            .invite(Some("Campanha"), Some(Role::Reader))
            .unwrap();
        for (method, path) in [
            ("GET", "/api/me/sessions".to_owned()),
            ("DELETE", "/api/me/sessions/others".to_owned()),
            ("DELETE", "/api/me/sessions/x".to_owned()),
            ("POST", "/api/me/password".to_owned()),
            ("POST", "/api/me/prove".to_owned()),
            ("POST", format!("/api/invite/{}/join", token_of(&made.link))),
        ] {
            let req = match method {
                "POST" => lab.client.post(lab.url(&path)).json(&json!({})),
                "DELETE" => lab.client.delete(lab.url(&path)),
                _ => lab.client.get(lab.url(&path)),
            };
            let res = req
                .header("origin", lab.origin())
                .header("cookie", &cookie)
                .send()
                .await
                .unwrap();
            assert_eq!(res.status().as_u16(), 404, "{method} {path}");
        }
        let row = lab.local.invitations().unwrap();
        assert_eq!(row[0].state, "pending", "the phone did not join");
    });
}

/// This computer's own accounts are nobody's: the owner and the holder of
/// the folders served in part have no password and no session but phones'
/// — an invitation cannot take their addresses, a sign-in as them fails,
/// and a browser session of the owner that is no phone opens nothing.
#[test]
fn this_computers_accounts_are_no_ones() {
    run(async {
        let mut lab = lab();
        lab.serve();
        for email in [
            crate::db::LOCAL_OWNER,
            crate::db::VAULT_HOLDER,
            "x@this-computer.verso",
        ] {
            let made = lab.local.invite(None, None).unwrap();
            let (status, body) = lab
                .post(
                    &format!("/api/invite/{}", token_of(&made.link)),
                    json!({ "email": email, "name": "X", "password": PASSWORD, "lang": "pt" }),
                    None,
                )
                .await;
            assert_eq!(status, 400, "{email}: {body}");
        }
        let (status, _) = lab
            .post(
                "/api/signin",
                json!({ "email": crate::db::LOCAL_OWNER, "password": PASSWORD }),
                None,
            )
            .await;
        assert_eq!(status, 401);
        let server = Arc::clone(&lock(&lab.local.shared.inner).as_ref().unwrap().server);
        let owner = server.db.local_owner().unwrap();
        let (token, _) = server
            .db
            .create_session(&owner.id, "browser", "?", "127.0.0.1")
            .unwrap();
        let cookie = format!("__Host-verso-session={token}");
        let (status, _) = lab.get("/api/folders", Some(&cookie)).await;
        assert_eq!(status, 401, "an owner's session that is no phone");
    });
}

/// The players see the owner by a person's name, never "This computer"
/// nor this computer's inner e-mail (the test of 2026-11-04): the host
/// names the owner from the system's user at first, a name the person gave
/// is kept, and the person changes it in Settings.
#[test]
fn players_see_the_owner_by_name_and_never_its_inner_address() {
    run(async {
        let mut lab = lab();
        assert_eq!(
            lab.local.owner_name().unwrap(),
            crate::db::LOCAL_OWNER_UNNAMED
        );
        lab.local.name_owner_if_unnamed("Sérgio Sousa").unwrap();
        assert_eq!(lab.local.owner_name().unwrap(), "Sérgio Sousa");
        lab.local.name_owner_if_unnamed("sergio").unwrap();
        assert_eq!(
            lab.local.owner_name().unwrap(),
            "Sérgio Sousa",
            "a name given is kept"
        );
        lab.serve();
        let made = lab
            .local
            .invite(Some("Campanha"), Some(Role::Reader))
            .unwrap();
        let cookie = accept(&lab, &made.link, "ana@example.org", "Ana").await;
        let (_, folders) = lab.get("/api/folders", Some(&cookie)).await;
        let owner = &folders["folders"][0]["owner"];
        assert_eq!(owner["name"], "Sérgio Sousa", "{folders}");
        assert!(owner["email"].is_null(), "{folders}");
        assert!(!folders.to_string().contains("this-computer"), "{folders}");
        assert_eq!(
            lab.local.set_owner_name("  Mestre Sérgio \n").unwrap(),
            "Mestre Sérgio"
        );
        let (_, folders) = lab.get("/api/folders", Some(&cookie)).await;
        assert_eq!(folders["folders"][0]["owner"]["name"], "Mestre Sérgio");
        assert!(lab.local.set_owner_name("  ").is_err());
    });
}
