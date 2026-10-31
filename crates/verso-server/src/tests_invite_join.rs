// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! An account that already exists accepts an invitation (ADR 0074 item 4,
//! 2026-10-23): the same grant as a new account's, the link used by it,
//! an e-mail-bound link only for that account, and what the account
//! already has never lowered.

use serde_json::{Value, json};

use crate::db::Role;
use crate::tests::{Browser, Running, block_on, folder_id, get, post, sign_in, start};

async fn link(r: &Running, admin: &Browser, body: Value) -> String {
    let (status, inv) = post(r, "/api/admin/invitations", body, Some(admin)).await;
    assert_eq!(status, 200, "{inv}");
    inv["link"]
        .as_str()
        .unwrap()
        .rsplit('/')
        .next()
        .unwrap()
        .to_owned()
}

async fn ana(r: &Running) -> (Browser, String) {
    let a = r
        .server
        .db
        .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
        .unwrap();
    (sign_in(r, "ana@casa.lan", "a senha da ana").await, a.id)
}

fn join_path(token: &str) -> String {
    format!("/api/invite/{token}/join")
}

#[test]
fn an_existing_account_joins_a_folder_through_the_link_once() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (a, ana_id) = ana(&r).await;
        let token = link(&r, &admin, json!({ "folder": id, "role": "reader" })).await;
        // The old path still says no, and where to go.
        let (status, said) = post(
            &r,
            &format!("/api/invite/{token}"),
            json!({ "email": "ana@casa.lan", "name": "Ana", "password": "outra senha longa", "lang": "pt" }),
            None,
        )
        .await;
        assert_eq!(status, 409, "{said}");
        assert!(
            said["message"].as_str().unwrap().contains("accept"),
            "{said}"
        );
        // Nobody signed in: 401.
        let (status, _) = post(&r, &join_path(&token), json!({}), None).await;
        assert_eq!(status, 401);
        // A page that is not this server's session (no CSRF): refused.
        let nocsrf = Browser {
            cookie: a.cookie.clone(),
            csrf: "wrong".into(),
        };
        let (status, _) = post(&r, &join_path(&token), json!({}), Some(&nocsrf)).await;
        assert_eq!(status, 403);
        assert_eq!(r.server.db.role(&id, &ana_id).unwrap(), None);
        let (status, joined) = post(&r, &join_path(&token), json!({}), Some(&a)).await;
        assert_eq!(status, 200, "{joined}");
        assert_eq!(r.server.db.role(&id, &ana_id).unwrap(), Some(Role::Reader));
        let (_, me) = get(&r, "/api/me", Some(&a)).await;
        assert_eq!(me["folders"].as_array().unwrap().len(), 1, "{me}");
        // Used once; the admin's list says by whom.
        let (status, _) = post(&r, &join_path(&token), json!({}), Some(&a)).await;
        assert_eq!(status, 404);
        let (_, list) = get(&r, "/api/admin/invitations", Some(&admin)).await;
        assert_eq!(list["rows"][0]["state"], "used", "{list}");
        assert_eq!(list["rows"][0]["usedBy"], "ana@casa.lan", "{list}");
        // One line of the audit log, as hers.
        let (_, log) = get(&r, "/api/admin/audit?action=invitation_used", Some(&admin)).await;
        assert_eq!(log["total"], 1, "{log}");
    });
}

#[test]
fn a_link_made_for_an_e_mail_is_for_that_account_only() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (a, ana_id) = ana(&r).await;
        let token = link(
            &r,
            &admin,
            json!({ "email": "bia@casa.lan", "folder": id, "role": "editor" }),
        )
        .await;
        let (status, said) = post(&r, &join_path(&token), json!({}), Some(&a)).await;
        assert_eq!(status, 403, "{said}");
        assert_eq!(said["error"], "wrong_account", "{said}");
        assert_eq!(r.server.db.role(&id, &ana_id).unwrap(), None);
        // The link is still pending for whom it was made.
        let (status, _) = get(&r, &format!("/api/invite/{token}"), None).await;
        assert_eq!(status, 200);
        let (_, log) = get(
            &r,
            "/api/admin/audit?action=invitation_refused",
            Some(&admin),
        )
        .await;
        assert_eq!(log["total"], 1, "{log}");
        let bia = r
            .server
            .db
            .create_account("Bia@Casa.lan", "Bia", "pt", Some("a senha da bia"), false)
            .unwrap();
        let b = sign_in(&r, "bia@casa.lan", "a senha da bia").await;
        let (status, joined) = post(&r, &join_path(&token), json!({}), Some(&b)).await;
        assert_eq!(status, 200, "{joined}");
        assert_eq!(r.server.db.role(&id, &bia.id).unwrap(), Some(Role::Editor));
    });
}

#[test]
fn joining_never_lowers_what_the_account_has() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (a, ana_id) = ana(&r).await;
        r.server.db.grant(&id, &ana_id, Role::Editor).unwrap();
        let token = link(&r, &admin, json!({ "folder": id, "role": "reader" })).await;
        let (status, joined) = post(&r, &join_path(&token), json!({}), Some(&a)).await;
        assert_eq!(status, 200, "{joined}");
        assert_eq!(r.server.db.role(&id, &ana_id).unwrap(), Some(Role::Editor));
        // …and raises it when the link is higher.
        let up = link(&r, &admin, json!({ "folder": id, "role": "owner" })).await;
        let (status, _) = post(&r, &join_path(&up), json!({}), Some(&a)).await;
        assert_eq!(status, 200);
        assert_eq!(r.server.db.role(&id, &ana_id).unwrap(), Some(Role::Owner));
    });
}

#[test]
fn an_existing_account_joins_a_share_and_keeps_the_higher_role() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (a, ana_id) = ana(&r).await;
        r.server
            .db
            .create_account("bia@casa.lan", "Bia", "pt", Some("a senha da bia"), false)
            .unwrap();
        let share = r.server.db.make_share(&id, "Mesa").unwrap().id;
        let bia = r
            .server
            .db
            .account_by_email("bia@casa.lan")
            .unwrap()
            .unwrap();
        r.server
            .db
            .grant_share(&share, &bia.id, Role::Reader)
            .unwrap();
        let token = link(&r, &admin, json!({ "share": share, "role": "editor" })).await;
        let (status, joined) = post(&r, &join_path(&token), json!({}), Some(&a)).await;
        assert_eq!(status, 200, "{joined}");
        // The window is told what to open: the share just joined.
        assert_eq!(joined["open"], share.as_str(), "{joined}");
        assert_eq!(
            r.server.db.share_role(&share, &ana_id).unwrap(),
            Some(Role::Editor)
        );
        // The whole folder is not given by a share's link.
        assert_eq!(r.server.db.role(&id, &ana_id).unwrap(), None);
        let low = link(&r, &admin, json!({ "share": share, "role": "reader" })).await;
        let (status, _) = post(&r, &join_path(&low), json!({}), Some(&a)).await;
        assert_eq!(status, 200);
        assert_eq!(
            r.server.db.share_role(&share, &ana_id).unwrap(),
            Some(Role::Editor)
        );
        // Someone who holds the whole folder lands on the folder, where the
        // share is not listed beside it.
        r.server.db.grant(&id, &bia.id, Role::Reader).unwrap();
        let bia_browser = sign_in(&r, "bia@casa.lan", "a senha da bia").await;
        let again = link(&r, &admin, json!({ "share": share, "role": "editor" })).await;
        let (status, joined) = post(&r, &join_path(&again), json!({}), Some(&bia_browser)).await;
        assert_eq!(status, 200, "{joined}");
        assert_eq!(joined["open"], id.as_str(), "{joined}");
    });
}

#[test]
fn guessing_links_while_signed_in_is_paced_like_the_other_link_routes() {
    block_on(async {
        let r = start().await;
        let (a, _) = ana(&r).await;
        let mut last = 0;
        for n in 0..8 {
            let (status, _) = post(
                &r,
                &join_path(&format!("nao-existe-{n}")),
                json!({}),
                Some(&a),
            )
            .await;
            last = status;
            if status == 429 {
                break;
            }
            assert_eq!(status, 404);
        }
        assert_eq!(last, 429);
    });
}
