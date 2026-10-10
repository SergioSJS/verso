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
    });
}
