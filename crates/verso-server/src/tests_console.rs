// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The administration console's API and the quotas per folder (ADR 0077),
//! against a running server, as tests.rs drives it.

use serde_json::{Value, json};

use crate::tests::{block_on, call, connect, folder_id, get, next, post, put, sign_in, start};

#[test]
fn a_folder_past_its_quota_refuses_what_grows_it_and_keeps_what_shrinks_it() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        // A quota just above what the folder takes (one short note).
        let (status, set) = put(
            &r,
            &format!("/api/admin/folders/{id}/quota"),
            json!({ "quota": 200 }),
            &admin,
        )
        .await;
        assert_eq!(status, 200, "{set}");
        assert_eq!(set["quota"], 200);
        let mut ws = connect(&r, Some(&admin.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        // A note of 100 bytes fits; another of 300 does not.
        let small = call(
            &mut ws,
            2,
            "create_note",
            json!({ "name": "Cabe", "text": "a".repeat(100) }),
        )
        .await;
        assert!(small.get("ok").is_some(), "{small}");
        let big = call(
            &mut ws,
            3,
            "create_note",
            json!({ "name": "Grande", "text": "b".repeat(300) }),
        )
        .await;
        assert_eq!(big["err"]["kind"], "quota", "{big}");
        let listed = call(&mut ws, 4, "list_notes", json!({})).await;
        assert!(!listed["ok"].to_string().contains("Grande"), "{listed}");
        // Shrinking a note always goes, even past the quota.
        let read = call(&mut ws, 5, "read_note", json!({ "path": "Cabe.md" })).await;
        let revision = read["ok"]["revision"].as_str().unwrap().to_owned();
        let shrunk = call(
            &mut ws,
            6,
            "write_note",
            json!({ "path": "Cabe.md", "text": "a", "revision": revision }),
        )
        .await;
        assert!(shrunk.get("ok").is_some(), "{shrunk}");
        // A size as a person writes it, and none.
        let (status, set) = put(
            &r,
            &format!("/api/admin/folders/{id}/quota"),
            json!({ "quota": "1GB" }),
            &admin,
        )
        .await;
        assert_eq!((status, set["quota"].as_i64()), (200, Some(1 << 30)));
        let (status, _) = put(
            &r,
            &format!("/api/admin/folders/{id}/quota"),
            json!({ "quota": "um monte" }),
            &admin,
        )
        .await;
        assert_eq!(status, 400);
        let (_, set) = put(
            &r,
            &format!("/api/admin/folders/{id}/quota"),
            json!({ "quota": null }),
            &admin,
        )
        .await;
        assert_eq!(set["quota"], Value::Null);
        // The change is in the log.
        let (_, log) = get(&r, "/api/admin/audit?action=folder_quota", Some(&admin)).await;
        // Three changes; the size refused is not one.
        assert_eq!(log["total"], 3, "{log}");
    });
}

#[test]
fn the_console_pages_searches_and_filters_on_the_server() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        for n in 0..7 {
            let (status, made) = post(
                &r,
                "/api/admin/accounts",
                json!({ "email": format!("pessoa{n}@casa.lan"), "name": format!("Pessoa {n}"), "lang": "pt" }),
                Some(&admin),
            )
            .await;
            assert_eq!(status, 200, "{made}");
        }
        // Eight accounts, three to a page, sorted by e-mail.
        let (_, first) = get(&r, "/api/admin/accounts?limit=3&sort=email", Some(&admin)).await;
        assert_eq!(first["total"], 8);
        assert_eq!(first["rows"].as_array().unwrap().len(), 3);
        assert_eq!(first["next"], 3);
        assert_eq!(first["rows"][0]["email"], "admin@casa.lan");
        let (_, last) = get(
            &r,
            "/api/admin/accounts?limit=3&sort=email&offset=6",
            Some(&admin),
        )
        .await;
        assert_eq!(last["rows"].as_array().unwrap().len(), 2);
        assert_eq!(last["next"], Value::Null);
        // A search, its total, and a % that is a character, not a wildcard.
        let (_, found) = get(&r, "/api/admin/accounts?q=pessoa3", Some(&admin)).await;
        assert_eq!(found["total"], 1, "{found}");
        let (_, none) = get(&r, "/api/admin/accounts?q=%25", Some(&admin)).await;
        assert_eq!(none["total"], 0, "{none}");
        // An unknown sort falls back to the name; nothing reaches the SQL.
        let (status, _) = get(
            &r,
            "/api/admin/accounts?sort=name;DROP%20TABLE%20accounts",
            Some(&admin),
        )
        .await;
        assert_eq!(status, 200);
        // An account's page, a folder's page.
        let me = first["rows"][0]["id"].as_str().unwrap().to_owned();
        let (_, mine) = get(&r, &format!("/api/admin/accounts/{me}"), Some(&admin)).await;
        assert_eq!(mine["account"]["email"], "admin@casa.lan");
        assert_eq!(mine["folders"][0]["role"], "owner", "{mine}");
        let id = folder_id(&r, &admin).await;
        let (_, folder) = get(&r, &format!("/api/admin/folders/{id}"), Some(&admin)).await;
        assert_eq!(folder["members"][0]["email"], "admin@casa.lan", "{folder}");
        let (_, folders) = get(&r, "/api/admin/folders?q=Camp", Some(&admin)).await;
        assert_eq!(
            folders["rows"][0]["owners"][0], "admin@casa.lan",
            "{folders}"
        );
        // The audit log by action, and as a file whose cells are text.
        let (_, made) = get(&r, "/api/admin/audit?action=account_created", Some(&admin)).await;
        assert_eq!(made["total"], 7, "{made}");
        assert_eq!(made["rows"][0]["who"], "admin@casa.lan");
        // The account it is about, by its name and e-mail, the id kept.
        let about = &made["rows"][0]["about"];
        assert_eq!(about["kind"], "account", "{made}");
        assert!(
            about["email"]
                .as_str()
                .is_some_and(|m| m.ends_with("@casa.lan")),
            "{made}"
        );
        assert!(made["rows"][0]["subject"].is_string());
        let csv = reqwest::Client::new()
            .get(r.url("/api/admin/audit?format=csv"))
            .header("cookie", &admin.cookie)
            .send()
            .await
            .unwrap();
        assert!(
            csv.headers()["content-type"]
                .to_str()
                .unwrap()
                .starts_with("text/csv")
        );
        let text = csv.text().await.unwrap();
        assert!(
            text.starts_with("at,who,action,subject,folder,address,ok,subject_name\n"),
            "{text}"
        );
        assert!(text.lines().count() > 7);
        // The subject's name is the last column: an account as name and
        // e-mail.
        assert!(
            text.lines()
                .any(|l| l.contains(",account_created,") && l.contains("@casa.lan>")),
            "{text}"
        );
        // The configuration in effect: a secret only as set or not.
        let (_, config) = get(&r, "/api/admin/config", Some(&admin)).await;
        let smtp = config
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["name"] == "VERSO_SMTP_URL")
            .unwrap();
        assert_eq!(smtp["value"], Value::Null);
        // The overview's totals.
        let (_, overview) = get(&r, "/api/admin/overview", Some(&admin)).await;
        assert_eq!(overview["accounts"], 8, "{overview}");
        assert_eq!(overview["folders"], 1);
        assert_eq!(overview["auditDays"], 365, "{overview}");
    });
}

/// A name in two files on the server's disk, its accents in two Unicode
/// forms (spec Q7; C8b of the live campaign, 2026-10-11): the folder's page
/// says which one syncs and which is held, and the overview counts it among
/// what needs a look — until a walk finds it gone.
#[test]
fn a_file_held_as_anothers_name_is_said_on_the_console() {
    use crate::twins::Twin;
    const COMPOSED: &str = "Caf\u{e9}.md";
    const DECOMPOSED: &str = "Cafe\u{301}.md";
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let page = format!("/api/admin/folders/{id}");
        let (_, folder) = get(&r, &page, Some(&admin)).await;
        assert_eq!(folder["twins"], json!([]), "{folder}");
        // What a walk of the folder on an ext4 disk finds (the walk itself:
        // tests_sync, on Linux).
        crate::twins::found(
            &r.server,
            &id,
            vec![Twin {
                kept: COMPOSED.to_owned(),
                held: DECOMPOSED.to_owned(),
            }],
        );
        // Said in the server's log, naming the folder and both files.
        assert!(crate::log::said(DECOMPOSED).iter().any(|l| {
            l.starts_with("WARN sync: Campanha: two files hold one name")
                && l.contains(&format!("kept \"{COMPOSED}\""))
        }));
        let (_, folder) = get(&r, &page, Some(&admin)).await;
        assert_eq!(
            folder["twins"],
            json!([{ "kept": COMPOSED, "held": DECOMPOSED }]),
            "{folder}"
        );
        let (_, overview) = get(&r, "/api/admin/overview", Some(&admin)).await;
        assert_eq!(
            overview["twins"],
            json!([{ "id": id, "name": "Campanha", "count": 1 }]),
            "{overview}"
        );
        // Removed on the disk: the next walk finds one file, and nothing is
        // said any more.
        crate::twins::found(&r.server, &id, Vec::new());
        let (_, folder) = get(&r, &page, Some(&admin)).await;
        assert_eq!(folder["twins"], json!([]), "{folder}");
        let (_, overview) = get(&r, "/api/admin/overview", Some(&admin)).await;
        assert_eq!(overview["twins"], json!([]), "{overview}");
    });
}

/// A DELETE as the browser `b` sends it; the status.
async fn delete(r: &crate::tests::Running, path: &str, b: &crate::tests::Browser) -> u16 {
    reqwest::Client::new()
        .delete(r.url(path))
        .header("origin", r.origin())
        .header("cookie", &b.cookie)
        .header("x-verso-csrf", &b.csrf)
        .send()
        .await
        .unwrap()
        .status()
        .as_u16()
}

/// An admin ends another account's sessions and revokes its tokens from
/// the console (ADR 0077 item 3, decided 2026-10-11): the device's open
/// connection is told `gone: session` at once, the browser's session and
/// the token stop opening anything, and the log has it. Anyone else is
/// refused, and the admin's own account ends elsewhere.
#[test]
fn an_admin_ends_another_accounts_sessions_and_tokens() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let me = r
            .server
            .db
            .account_by_email("admin@casa.lan")
            .unwrap()
            .unwrap();
        let bia = r
            .server
            .db
            .create_account("bia@casa.lan", "Bia", "pt", Some("a senha da bia"), false)
            .unwrap();
        let browser = sign_in(&r, "bia@casa.lan", "a senha da bia").await;
        let (device, _) = r
            .server
            .db
            .create_session(&bia.id, "device", "Verso · Celular", "127.0.0.1")
            .unwrap();
        let (secret, _) = r
            .server
            .db
            .create_token(&bia.id, "script", false, None, &[])
            .unwrap();
        // Not an admin: refused, and nothing ends.
        let path = |id: &str| format!("/api/admin/accounts/{id}/sessions");
        assert_eq!(delete(&r, &path(&me.id), &browser).await, 403);
        assert_eq!(r.server.db.sessions_of(&me.id).unwrap().len(), 1);
        // The admin's own: not here.
        assert_eq!(delete(&r, &path(&me.id), &admin).await, 400);
        let mut on_device = connect(&r, None, None, Some(&device)).await.unwrap();
        next(&mut on_device).await;
        let mut on_token = connect(&r, None, None, Some(&secret)).await.unwrap();
        next(&mut on_token).await;
        let res = reqwest::Client::new()
            .delete(r.url(&path(&bia.id)))
            .header("origin", r.origin())
            .header("cookie", &admin.cookie)
            .header("x-verso-csrf", &admin.csrf)
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 200);
        let ended: Value = res.json().await.unwrap();
        assert_eq!(ended, json!({ "sessions": 2, "tokens": 1 }));
        // Told at once, the token's connection too.
        assert_eq!(next(&mut on_device).await["gone"], "session");
        assert_eq!(next(&mut on_token).await["gone"], "session");
        // Nothing of Bia's opens anything now.
        assert!(r.server.db.sessions_of(&bia.id).unwrap().is_empty());
        assert!(r.server.db.tokens_of(&bia.id).unwrap().is_empty());
        assert_eq!(get(&r, "/api/me", Some(&browser)).await.0, 401);
        assert_eq!(
            connect(&r, None, None, Some(&device)).await.err(),
            Some(401)
        );
        assert_eq!(
            connect(&r, None, None, Some(&secret)).await.err(),
            Some(401)
        );
        // The admin's session stays, and the log has it, about Bia.
        assert_eq!(get(&r, "/api/me", Some(&admin)).await.0, 200);
        let (_, log) = get(
            &r,
            "/api/admin/audit?action=account_sessions_ended",
            Some(&admin),
        )
        .await;
        assert_eq!(log["total"], 1, "{log}");
        assert_eq!(log["rows"][0]["subject"], bia.id, "{log}");
        assert_eq!(log["rows"][0]["about"]["email"], "bia@casa.lan", "{log}");
    });
}

/// A new password's link ends the account's sessions and revokes its
/// tokens when it is made, as `verso serve admin reset` does on the
/// machine and the app's section does (decided 2026-11-04): a lost or
/// taken password is cut off at once, not when the link is used. The
/// device's open connection is told `gone: session`; the old password
/// still signs in until the new one is set; an earlier link opens nothing.
#[test]
fn a_new_password_link_ends_the_accounts_sessions_and_tokens_at_once() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let bia = r
            .server
            .db
            .create_account("bia@casa.lan", "Bia", "pt", Some("a senha da bia"), false)
            .unwrap();
        let browser = sign_in(&r, "bia@casa.lan", "a senha da bia").await;
        let (device, _) = r
            .server
            .db
            .create_session(&bia.id, "device", "Verso · Celular", "127.0.0.1")
            .unwrap();
        let (secret, token) = r
            .server
            .db
            .create_token(&bia.id, "script", false, None, &[])
            .unwrap();
        let mut on_device = connect(&r, None, None, Some(&device)).await.unwrap();
        next(&mut on_device).await;
        let reset = format!("/api/admin/accounts/{}/reset", bia.id);
        let (status, first) = post(&r, &reset, json!({}), Some(&admin)).await;
        assert_eq!(status, 200, "{first}");
        let (status, made) = post(&r, &reset, json!({}), Some(&admin)).await;
        assert_eq!(status, 200, "{made}");
        // Told at once; nothing of Bia's opens anything now.
        assert_eq!(next(&mut on_device).await["gone"], "session");
        assert!(r.server.db.sessions_of(&bia.id).unwrap().is_empty());
        assert!(r.server.db.tokens_of(&bia.id).unwrap().is_empty());
        assert_eq!(get(&r, "/api/me", Some(&browser)).await.0, 401);
        assert_eq!(
            connect(&r, None, None, Some(&secret)).await.err(),
            Some(401)
        );
        // Each revoked token is in the log, and the link about Bia.
        let (_, log) = get(&r, "/api/admin/audit?action=token_revoked", Some(&admin)).await;
        assert_eq!(log["rows"][0]["subject"], token.id, "{log}");
        let (_, log) = get(&r, "/api/admin/audit?action=reset_link", Some(&admin)).await;
        assert_eq!(log["rows"][0]["subject"], bia.id, "{log}");
        // The earlier link opens nothing; the old password still signs in
        // until the new one is set.
        let token_of = |v: &Value| {
            v["link"]
                .as_str()
                .unwrap()
                .rsplit('/')
                .next()
                .unwrap()
                .to_owned()
        };
        assert_eq!(
            get(&r, &format!("/api/reset/{}", token_of(&first)), None)
                .await
                .0,
            404
        );
        sign_in(&r, "bia@casa.lan", "a senha da bia").await;
        let (status, _) = post(
            &r,
            &format!("/api/reset/{}", token_of(&made)),
            json!({ "password": "uma senha nova da bia" }),
            None,
        )
        .await;
        assert_eq!(status, 200);
        sign_in(&r, "bia@casa.lan", "uma senha nova da bia").await;
        // The admin's own session stays.
        assert_eq!(get(&r, "/api/me", Some(&admin)).await.0, 200);
    });
}
