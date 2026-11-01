// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Gaps of the threat model closed (threat-model.md, gaps 11 and 12): a
//! presence wears its sender's name, whatever it says; the page that
//! approves a device says who asked, and can refuse.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};

use crate::db::Role;
use crate::tests::{block_on, call, connect, event_named, folder_id, next, post, sign_in, start};

/// A Yjs awareness update of one client: count, id, clock, the state as
/// a string — each number a variable-length integer.
fn presence(id: u8, state: &str) -> String {
    let mut bytes = vec![1, id, 1];
    let mut len = state.len();
    while len >= 0x80 {
        bytes.push(u8::try_from(len & 0x7f).unwrap() | 0x80);
        len >>= 7;
    }
    bytes.push(u8::try_from(len).unwrap());
    bytes.extend_from_slice(state.as_bytes());
    STANDARD.encode(bytes)
}

/// The states of a relayed update, read back as JSON.
fn states(update: &str) -> Vec<Value> {
    let bytes = STANDARD.decode(update).unwrap();
    let text = String::from_utf8_lossy(&bytes);
    // One client: the state is the bytes from its first brace.
    let start = text.find('{').unwrap();
    vec![serde_json::from_str(&text[start..]).unwrap()]
}

/// A member who sends a presence under another member's name is relayed
/// under their own (gap 11): the server stamps the name from the session.
#[test]
fn a_presence_is_relayed_under_its_senders_own_name() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let ana = r
            .server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        r.server.db.grant(&id, &ana.id, Role::Editor).unwrap();
        let ana_b = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let mut seen = connect(&r, Some(&admin.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        let mut forger = connect(&r, Some(&ana_b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        for ws in [&mut seen, &mut forger] {
            next(ws).await;
            call(ws, 1, "open_server_folder", json!({ "id": id })).await;
            call(ws, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        }
        let forged = presence(
            9,
            r##"{"user":{"name":"Admin","color":"#1565c0"},"cursor":{"anchor":1,"head":1}}"##,
        );
        let sent = call(
            &mut forger,
            3,
            "collab_awareness",
            json!({ "path": "Sessao.md", "update": forged }),
        )
        .await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let heard = event_named(&mut seen, "collab-awareness").await;
        let got = states(heard["update"].as_str().unwrap());
        assert_eq!(got[0]["user"]["name"], "Ana", "{got:?}");
        assert_eq!(got[0]["user"]["color"], "#1565c0");
        assert_eq!(got[0]["cursor"]["anchor"], 1);
        // Bytes that are not a presence are refused, not relayed.
        let junk = call(
            &mut forger,
            4,
            "collab_awareness",
            json!({ "path": "Sessao.md", "update": "AQ==" }),
        )
        .await;
        assert_eq!(junk["err"]["kind"], "refused", "{junk}");
    });
}

/// The page that approves a device says where and when it was asked
/// from (gap 12): the pending code keeps the address and the time, the
/// page's data gives them, and the person can refuse — the app then
/// hears the code gone.
#[test]
fn a_device_code_says_who_asked_and_can_be_refused() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let before = crate::log::stamp();
        let (_, started) = post(
            &r,
            "/api/device/start",
            json!({ "device": "Verso · MacBook" }),
            None,
        )
        .await;
        let code = started["code"].as_str().unwrap().to_owned();
        let poll = started["poll"].as_str().unwrap().to_owned();
        {
            let devices = verso_service::lock(&r.server.devices);
            let pending = devices.get(&code).unwrap();
            assert_eq!(pending.address, "127.0.0.1");
            assert!(pending.asked >= before, "{}", pending.asked);
            assert_eq!(pending.asked.len(), "2026-10-12T21:30:00Z".len());
        }
        let (_, what) = post(
            &r,
            "/api/device/describe",
            json!({ "code": code }),
            Some(&admin),
        )
        .await;
        assert_eq!(what["device"], "Verso · MacBook");
        assert_eq!(what["address"], "127.0.0.1");
        assert!(what["asked"].as_str().unwrap() >= before.as_str(), "{what}");
        // Not from a page of this server: refused.
        let status = reqwest::Client::new()
            .post(r.url("/api/device/refuse"))
            .header("cookie", &admin.cookie)
            .json(&json!({ "code": code }))
            .send()
            .await
            .unwrap()
            .status()
            .as_u16();
        assert_eq!(status, 403);
        let status = reqwest::Client::new()
            .post(r.url("/api/device/refuse"))
            .header("origin", r.origin())
            .header("cookie", &admin.cookie)
            .header("x-verso-csrf", &admin.csrf)
            .json(&json!({ "code": code }))
            .send()
            .await
            .unwrap()
            .status()
            .as_u16();
        assert_eq!(status, 200);
        let (gone, _) = post(
            &r,
            "/api/device/poll",
            json!({ "code": code, "poll": poll }),
            None,
        )
        .await;
        assert_eq!(gone, 410);
        let (status, _) = post(
            &r,
            "/api/device/describe",
            json!({ "code": code }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 404);
    });
}

/// The server's headers, every one by name and value, on the page, the
/// API and a folder's file (ADR 0083 item 9; the review's section 3.2): a
/// header lost or changed in a refactor is seen here. `None` is a header
/// that must not be there.
#[test]
fn every_answer_carries_the_whole_set_of_headers() {
    const PERMISSIONS: &str = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()";
    const FILE_CSP: &str = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:";
    let page_csp = |ws: &str| {
        format!(
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; \
             img-src 'self' data: blob: https:; media-src 'self' blob: https:; \
             frame-src 'self' https:; object-src 'none'; connect-src 'self' {ws}; \
             worker-src 'self' blob:; font-src 'self' data:; base-uri 'none'; \
             form-action 'self'; frame-ancestors 'self'"
        )
    };
    block_on(async {
        // Over plain HTTP on this machine, and with an HTTPS address.
        for public in [None, Some("https://notas.casa")] {
            let r = crate::tests::start_with(|c| c.public_url = public.map(str::to_owned)).await;
            crate::data::ensure_dir(&r.server.config.ui_dir).unwrap();
            crate::data::write_for_tests(
                &r.server.config.ui_dir.join("web.html"),
                "<!doctype html><title>Verso</title>",
            );
            let admin = r
                .server
                .db
                .account_by_email("admin@casa.lan")
                .unwrap()
                .unwrap();
            let (token, csrf) = r
                .server
                .db
                .create_session(&admin.id, "browser", "test", "127.0.0.1")
                .unwrap();
            let b = crate::tests::Browser {
                cookie: format!("{}={token}", crate::auth::cookie_name(false)),
                csrf,
            };
            let id = folder_id(&r, &b).await;
            // A folder's files are served while a window has it open.
            let origin = public.map_or_else(|| r.origin(), str::to_owned);
            let mut window = connect(&r, Some(&b.cookie), Some(&origin), None)
                .await
                .unwrap();
            next(&mut window).await;
            call(&mut window, 1, "open_server_folder", json!({ "id": id })).await;
            let ws = public.map_or_else(
                || format!("ws://localhost:{}", r.addr().port()),
                |_| "wss://notas.casa".to_owned(),
            );
            let hsts = public.map(|_| "max-age=31536000; includeSubDomains");
            let page = page_csp(&ws);
            let robots = Some("noindex, nofollow");
            let common = |csp: &str, corp: Option<&'static str>, cache: Option<&'static str>| {
                vec![
                    ("x-robots-tag", None),
                    ("x-content-type-options", Some("nosniff".to_owned())),
                    ("referrer-policy", Some("no-referrer".to_owned())),
                    ("x-frame-options", Some("SAMEORIGIN".to_owned())),
                    ("cross-origin-opener-policy", Some("same-origin".to_owned())),
                    ("permissions-policy", Some(PERMISSIONS.to_owned())),
                    ("content-security-policy", Some(csp.to_owned())),
                    ("cross-origin-resource-policy", corp.map(str::to_owned)),
                    ("cache-control", cache.map(str::to_owned)),
                    ("strict-transport-security", hsts.map(str::to_owned)),
                ]
            };
            // A read link's routes (ADR 0105 item 5): the same set, and
            // no search engine.
            r.server.db.set_read_links_on(true).unwrap();
            let (link_token, _) = r
                .server
                .db
                .make_read_link(&crate::db::NewReadLink {
                    folder: &id,
                    kind: "folder",
                    path: "",
                    made_by: &admin.id,
                    expires: None,
                    password: None,
                })
                .unwrap();
            let marked = |mut set: Vec<(&'static str, Option<String>)>| {
                set[0] = ("x-robots-tag", robots.map(str::to_owned));
                set
            };
            let ui = r.server.config.ui_dir.clone();
            crate::data::ensure_dir(&ui.join("chunks")).unwrap();
            crate::data::write_for_tests(&ui.join("web.js"), "export {};");
            crate::data::write_for_tests(&ui.join("chunks/note-A1B2C3D4.js"), "export {};");
            let routes = [
                ("/", common(&page, None, Some("no-store"))),
                // The window's files (static_cache.rs): asked about each
                // time, or kept for good when the name has a hash.
                ("/web.js", common(&page, None, Some("no-cache"))),
                (
                    "/chunks/note-A1B2C3D4.js",
                    common(&page, None, Some("public, max-age=31536000, immutable")),
                ),
                ("/api/state", common(&page, None, None)),
                (
                    &*format!("/f/{id}/mapa.svg"),
                    common(FILE_CSP, Some("same-origin"), Some("no-store")),
                ),
                (
                    &*format!("/r/{link_token}"),
                    marked(common(&page, None, Some("no-store"))),
                ),
                (
                    &*format!("/r/{link_token}/state"),
                    marked(common(&page, None, None)),
                ),
                (
                    &*format!("/r/{link_token}/f/mapa.svg"),
                    marked(common(FILE_CSP, Some("same-origin"), Some("no-store"))),
                ),
            ];
            for (path, expected) in routes {
                let res = reqwest::Client::new()
                    .get(r.url(path))
                    .header("cookie", &b.cookie)
                    .send()
                    .await
                    .unwrap();
                assert_eq!(res.status().as_u16(), 200, "{path}");
                for (name, value) in expected {
                    let got = res
                        .headers()
                        .get(name)
                        .and_then(|v| v.to_str().ok())
                        .map(str::to_owned);
                    assert_eq!(got, value, "{public:?} {path} {name}");
                }
            }
        }
    });
}

/// The walk's rules and the folder note's name are the folder owner's
/// (ADR 0070; ADR 0083, decided 2026-10-14): an editor's change of the
/// folder's settings keeps the rest of it — the bookmarks — and leaves
/// them as they were, as `set_walk_rules` and `set_folder_note_name` do;
/// the owner's change sets them.
#[test]
fn an_editor_changes_the_folders_settings_but_not_its_walk_rules() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let ana = r
            .server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        r.server.db.grant(&id, &ana.id, Role::Editor).unwrap();
        let ana_b = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let mut ed = connect(&r, Some(&ana_b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ed).await;
        call(&mut ed, 1, "open_server_folder", json!({ "id": id })).await;
        let layer = call(&mut ed, 2, "get_folder_settings", json!({})).await;
        assert_eq!(layer["ok"]["exists"], false, "{layer}");
        let change = |gitignore: bool| {
            json!({ "change": { "bookmarks": ["Sessao.md"], "folder_note_name": "Indice",
                "ignore_build_dirs": false, "respect_gitignore": gitignore } })
        };
        let mut args = change(false);
        args["revision"] = Value::Null;
        let set = call(&mut ed, 3, "set_folder_settings", args).await;
        assert_eq!(
            set["ok"]["settings"]["bookmarks"],
            json!(["Sessao.md"]),
            "{set}"
        );
        assert_eq!(
            set["ok"]["settings"]["respect_gitignore"],
            Value::Null,
            "an editor changed the walk's rules: {set}"
        );
        assert_eq!(
            set["ok"]["settings"]["ignore_build_dirs"],
            Value::Null,
            "{set}"
        );
        assert_eq!(
            set["ok"]["settings"]["folder_note_name"],
            Value::Null,
            "an editor changed the folder note's name: {set}"
        );
        // The owner sets them.
        let mut own = connect(&r, Some(&admin.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut own).await;
        call(&mut own, 1, "open_server_folder", json!({ "id": id })).await;
        let mut args = change(false);
        args["revision"] = set["ok"]["revision"].clone();
        let set = call(&mut own, 2, "set_folder_settings", args).await;
        assert_eq!(set["ok"]["settings"]["respect_gitignore"], false, "{set}");
        assert_eq!(set["ok"]["settings"]["ignore_build_dirs"], false, "{set}");
        assert_eq!(set["ok"]["settings"]["folder_note_name"], "Indice", "{set}");
    });
}
