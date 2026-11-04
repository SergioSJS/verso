// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sharing a folder inside a folder (ADR 0081), against a running server:
//! the share's confinement is a boundary between two people's notes, and
//! is tried here the way someone on the other side would try it — `..`,
//! a sibling whose name begins like the share's, the parent, renames
//! across the boundary, sync's listing, reads, writes, deletions and
//! renames through the share, the files under `/f/`, the events pushed to
//! the window — besides what the owner and the admin see.

use serde_json::{Value, json};

use crate::tests::{
    Browser, Running, Socket, block_on, call, connect, event_named, folder_id, get, next, post,
    put, sign_in, start,
};
use crate::tests_sync::{fetch, send};

/// A socket and the ids of its requests.
struct Win {
    ws: Socket,
    n: u64,
}

impl Win {
    async fn open(r: &Running, b: &Browser, id: &str) -> (Self, Value) {
        let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        let info = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        (Self { ws, n: 10 }, info)
    }

    async fn call(&mut self, cmd: &str, args: Value) -> Value {
        self.n += 1;
        call(&mut self.ws, self.n, cmd, args).await
    }
}

/// The owner's folder "Campanha": a shared folder "Mesa" with notes that
/// link out, a sibling "Mesa2" whose name begins as the share's, notes at
/// the root, and the attachments at "Anexos".
async fn furnished(r: &Running, admin: &Browser) -> (String, Win) {
    let id = folder_id(r, admin).await;
    let (mut w, _) = Win::open(r, admin, &id).await;
    for (name, text) in [
        (
            "Mesa/Notas",
            "# Notas\n\nVer [[Segredo]] e [[Outra]] e [[Fora]].\n\n![[p.png]]\n\n#mesa\n",
        ),
        ("Mesa/Outra", "Outra nota palavrachave\n"),
        ("Mesa/Sub/Funda", "Funda\n\n- a\n- b ^dentro\n"),
        (
            "Segredo",
            "# Segredo\n\npalavrachave segredissima [[Notas]]\n\n#mesa\n\n- x ^fora\n",
        ),
        ("Mesa2/Fora", "Fora da mesa palavrachave, Notas\n"),
    ] {
        let made = w
            .call("create_note", json!({ "name": name, "text": text }))
            .await;
        assert!(made.get("ok").is_some(), "{made}");
    }
    let file = w
        .call(
            "create_file",
            json!({ "path": "Anexos/p.png", "base64": "iVBORw0KGgo=" }),
        )
        .await;
    assert_eq!(file["ok"], "Anexos/p.png", "{file}");
    (id, w)
}

async fn ana(r: &Running) -> (Browser, String) {
    let a = r
        .server
        .db
        .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
        .unwrap();
    (sign_in(r, "ana@casa.lan", "a senha da ana").await, a.id)
}

fn strings(v: &Value) -> Vec<String> {
    let mut out: Vec<String> = v
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x.as_str().unwrap().to_owned())
        .collect();
    out.sort();
    out
}

/// Every path an answer names, wherever it is in it.
fn every_string(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(s) => out.push(s.clone()),
        Value::Array(a) => a.iter().for_each(|x| every_string(x, out)),
        Value::Object(o) => o.values().for_each(|x| every_string(x, out)),
        _ => {}
    }
}

/// Nothing of the owner's folder outside the share in `v`: no name of a
/// note above or beside it, no path with the share's own name in front.
fn says_nothing_outside(v: &Value) {
    let mut all = Vec::new();
    every_string(v, &mut all);
    for s in all {
        for leak in ["Segredo.md", "segredissima", "Mesa2", "Fora.md", "Mesa/"] {
            assert!(!s.contains(leak), "{leak} crossed in {v}");
        }
    }
}

#[test]
fn a_reader_sees_the_shared_folder_and_nothing_above_or_beside_it() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, mut owner) = furnished(&r, &admin).await;
        let (ana, _) = ana(&r).await;
        // Nothing yet.
        let (_, mine) = get(&r, "/api/folders", Some(&ana)).await;
        assert_eq!(mine["folders"], json!([]), "{mine}");
        let (status, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "reader" }),
            &admin,
        )
        .await;
        assert_eq!(status, 200, "{shared}");
        let share = shared["id"].as_str().unwrap().to_owned();
        // Ana lists it as hers to open, named after the folder and its
        // owner; the owner lists it as shared by them.
        let (_, mine) = get(&r, "/api/folders", Some(&ana)).await;
        assert_eq!(mine["folders"][0]["id"], share);
        assert_eq!(mine["folders"][0]["name"], "Mesa (Admin)");
        assert_eq!(mine["folders"][0]["share"], true);
        assert_eq!(mine["folders"][0]["role"], "reader");
        assert_eq!(mine["folders"][0]["owner"]["name"], "Admin");
        assert_eq!(mine["folders"].as_array().unwrap().len(), 1);
        let (_, theirs) = get(&r, "/api/folders", Some(&admin)).await;
        assert_eq!(theirs["byMe"][0]["path"], "Mesa");
        assert_eq!(theirs["byMe"][0]["people"][0]["email"], "ana@casa.lan");
        // The owner's folder itself is not hers.
        let (mut w, refused) = Win::open(&r, &ana, &id).await;
        assert_eq!(refused["err"]["kind"], "not_found", "{refused}");
        let info = w.call("open_server_folder", json!({ "id": share })).await;
        assert_eq!(info["ok"]["name"], "Mesa (Admin)", "{info}");
        let key = info["ok"]["key"].as_str().unwrap().to_owned();
        assert!(key.starts_with("share-"), "{key}");
        says_nothing_outside(&info);
        // What is listed is the share, re-rooted.
        let notes = w.call("list_notes", json!({})).await;
        assert_eq!(
            strings(&notes["ok"]),
            ["Notas.md", "Outra.md", "Sub/Funda.md"]
        );
        let folders = w.call("list_folders", json!({})).await;
        assert_eq!(strings(&folders["ok"]), ["Sub"]);
        for cmd in [
            "list_entries",
            "list_files",
            "list_tags",
            "graph",
            "list_web_notes",
            "current_folder",
            "reindex",
            "get_focuses",
            "folder_space",
        ] {
            let answer = w.call(cmd, json!({})).await;
            assert!(answer.get("ok").is_some(), "{cmd}: {answer}");
            says_nothing_outside(&answer);
        }
        let tags = w.call("list_tags", json!({})).await;
        assert_eq!(tags["ok"][0]["notes"], json!(["Notas.md"]), "{tags}");
        // The blocks of the share only, in its paths (the oracle's tables).
        let blocks = w
            .call("list_block_ids", json!({ "kinds": ["table", "list"] }))
            .await;
        assert_eq!(
            blocks["ok"]["blocks"],
            json!([{ "path": "Sub/Funda.md", "id": "dentro", "kind": "list", "label": "b", "under_heading": false, "rows": 1, "tasks": false }]),
            "{blocks}"
        );
        says_nothing_outside(&blocks);
        let found = w
            .call("search", json!({ "words": "palavrachave", "limit": 20 }))
            .await;
        assert_eq!(found["ok"].as_array().unwrap().len(), 1, "{found}");
        assert_eq!(found["ok"][0]["path"], "Outra.md");
        says_nothing_outside(&found);
        let backlinks = w.call("backlinks", json!({ "path": "Notas.md" })).await;
        assert_eq!(backlinks["ok"], json!([]), "{backlinks}");
        // A mention in a note outside the share is not said (ADR 0089).
        let mentions = w
            .call("unlinked_mentions", json!({ "path": "Notas.md" }))
            .await;
        assert_eq!(mentions["ok"]["mentions"], json!([]), "{mentions}");
        says_nothing_outside(&mentions);
        // A link out of the share: the name written, nothing else — not
        // whether it exists, not where.
        let links = w.call("links", json!({ "path": "Notas.md" })).await;
        let by_target = |t: &str| {
            links["ok"]
                .as_array()
                .unwrap()
                .iter()
                .find(|l| l["target"] == t)
                .cloned()
                .unwrap()
        };
        assert_eq!(by_target("Segredo")["resolved"], Value::Null);
        assert_eq!(by_target("Segredo")["outside"], true);
        assert_eq!(by_target("Outra")["resolved"], "Outra.md");
        assert_eq!(by_target("Outra")["outside"], false);
        assert_eq!(by_target("Fora")["outside"], true);
        assert_eq!(by_target("p.png")["resolved"], Value::Null);
        says_nothing_outside(&links);
        let attachment = w
            .call(
                "resolve_attachment",
                json!({ "source": "Notas.md", "target": "p.png" }),
            )
            .await;
        assert_eq!(attachment["ok"], Value::Null, "{attachment}");
        // Every way out is closed: `..`, absolute, backslashes, the parent,
        // the sibling, an empty part.
        for path in [
            "../Segredo.md",
            "Sub/../../Segredo.md",
            "/Segredo.md",
            "..\\Segredo.md",
            "./Notas.md",
            "Sub//Funda.md",
            "..",
            "../Mesa2/Fora.md",
        ] {
            for cmd in ["read_note", "read_text", "read_file_text", "links"] {
                let a = w.call(cmd, json!({ "path": path })).await;
                assert_eq!(a["err"]["kind"], "refused", "{cmd} {path}: {a}");
                says_nothing_outside(&a);
            }
        }
        // A name that exists above is not found inside.
        let above = w.call("read_note", json!({ "path": "Segredo.md" })).await;
        assert_eq!(above["err"]["kind"], "not_found", "{above}");
        says_nothing_outside(&above);
        // A base asked over the whole folder answers with the share only.
        let base = w
            .call(
                "query_base",
                json!({ "query": { "path": null, "text": "views:\n  - type: table\n    name: T\n",
                    "this": "Notas.md", "view": null, "extra": [], "now": 0, "offset": 0, "lang": "pt" } }),
            )
            .await;
        assert!(base.get("ok").is_some(), "{base}");
        says_nothing_outside(&base);
        // A reader writes nothing.
        let write = w
            .call("create_note", json!({ "name": "Minha", "text": "x" }))
            .await;
        assert_eq!(write["err"]["kind"], "refused", "{write}");
        let caps = w.call("capabilities", json!({})).await;
        assert!(
            !caps["ok"]["can"]
                .as_array()
                .unwrap()
                .contains(&json!("write"))
        );
        // Commands the share does not answer are refused, never passed on.
        for cmd in ["set_focuses", "set_sync_focuses"] {
            let a = w.call(cmd, json!({ "enabled": true, "focuses": [] })).await;
            assert_eq!(a["err"]["kind"], "refused", "{cmd}: {a}");
        }
        // The files under /f/: the share's, by its paths; nothing above.
        let file = |p: &str| {
            let cookie = ana.cookie.clone();
            let url = r.url(&format!("/f/{share}/{p}"));
            async move {
                reqwest::Client::new()
                    .get(url)
                    .header("cookie", cookie)
                    .send()
                    .await
                    .unwrap()
                    .status()
                    .as_u16()
            }
        };
        assert_eq!(file("Anexos/p.png").await, 404);
        assert_eq!(file("..%2FAnexos%2Fp.png").await, 404);
        assert_eq!(file("%2E%2E/Anexos/p.png").await, 404);
        let (direct, _) = get(&r, &format!("/f/{id}/Anexos/p.png"), Some(&ana)).await;
        assert_eq!(direct, 404);
        // Sync through the share: the share's files only.
        let state = w.call("sync_state", json!({})).await;
        let paths: Vec<String> = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["path"].as_str().unwrap().to_owned())
            .collect();
        assert!(paths.contains(&"Notas.md".to_owned()), "{state}");
        says_nothing_outside(&state);
        let changes = w.call("sync_changes", json!({ "since": 0 })).await;
        assert!(!changes["ok"]["changes"].as_array().unwrap().is_empty());
        says_nothing_outside(&changes);
        let (bytes, _) = fetch(&mut w.ws, 500, "Outra.md").await;
        assert_eq!(bytes, b"Outra nota palavrachave\n");
        let outside = w
            .call("sync_read", json!({ "path": "../Segredo.md", "offset": 0 }))
            .await;
        assert_eq!(outside["err"]["kind"], "refused", "{outside}");
        // What the owner changes outside the share is never pushed to the
        // window; what they change inside is, in the share's paths.
        let put_root = send(&mut owner.ws, 600, "Fora2.md", b"fora\n", None).await;
        assert_eq!(put_root["ok"]["done"], true, "{put_root}");
        let put_in = send(&mut owner.ws, 700, "Mesa/Nova2.md", b"dentro\n", None).await;
        assert_eq!(put_in["ok"]["done"], true, "{put_in}");
        loop {
            let heard = event_named(&mut w.ws, "folder-changed").await;
            says_nothing_outside(&heard);
            assert_eq!(heard["key"], key);
            if heard["changed"]
                .as_array()
                .unwrap()
                .contains(&json!("Nova2.md"))
            {
                break;
            }
        }
        // The audit log has the share with its path, for the owner.
        let (_, log) = get(&r, &format!("/api/folders/{id}/audit"), Some(&admin)).await;
        assert!(
            log.as_array()
                .unwrap()
                .iter()
                .any(|e| e["action"] == "share_reader" && e["path"] == "Mesa"),
            "{log}"
        );
        // And the console's folder page lists it.
        let (_, page) = get(&r, &format!("/api/admin/folders/{id}"), Some(&admin)).await;
        assert_eq!(page["shares"][0]["path"], "Mesa", "{page}");
        assert_eq!(page["shares"][0]["people"][0]["email"], "ana@casa.lan");
    });
}

#[test]
fn a_writer_writes_inside_the_share_and_never_above_it() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, mut owner) = furnished(&r, &admin).await;
        let (ana, _) = ana(&r).await;
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        let (mut w, info) = Win::open(&r, &ana, &share).await;
        assert!(info.get("ok").is_some(), "{info}");
        let made = w
            .call("create_note", json!({ "name": "Nova", "text": "nova\n" }))
            .await;
        assert_eq!(made["ok"]["path"], "Nova.md", "{made}");
        let theirs = owner
            .call("read_note", json!({ "path": "Mesa/Nova.md" }))
            .await;
        assert!(theirs.get("ok").is_some(), "{theirs}");
        // Out of the share by any write: refused before the core acts.
        let tries = [
            ("create_note", json!({ "name": "../Fora", "text": "x" })),
            ("create_note", json!({ "name": "/Fora", "text": "x" })),
            ("create_folder", json!({ "path": "../X" })),
            (
                "create_file",
                json!({ "path": "../x.png", "base64": "AA==" }),
            ),
            (
                "write_text",
                json!({ "path": "../Segredo.md", "text": "x", "revision": "r" }),
            ),
            (
                "write_note",
                json!({ "path": "../Segredo.md", "text": "x", "revision": "r" }),
            ),
            (
                "rename_entry",
                json!({ "from": "Nova.md", "to": "../Nova.md" }),
            ),
            (
                "rename_entry",
                json!({ "from": "Nova.md", "to": "../Mesa2/Nova.md" }),
            ),
            (
                "rename_note",
                json!({ "from": "../Segredo.md", "to": "Segredo.md" }),
            ),
            ("rename_entry", json!({ "from": "", "to": "Outro" })),
            (
                "move_entries",
                json!({ "paths": ["Nova.md"], "folder": ".." }),
            ),
            (
                "move_entries",
                json!({ "paths": ["../Segredo.md"], "folder": "" }),
            ),
            ("move_entries", json!({ "paths": [""], "folder": "Sub" })),
            ("delete_entry", json!({ "path": "" })),
            ("delete_entry", json!({ "path": "../Segredo.md" })),
            ("delete_note", json!({ "path": "../Segredo.md" })),
            (
                "write_board",
                json!({ "path": "../b.canvas", "json": "{}", "revision": "r" }),
            ),
        ];
        for (cmd, args) in tries {
            let a = w.call(cmd, args.clone()).await;
            assert_eq!(a["err"]["kind"], "refused", "{cmd} {args}: {a}");
        }
        // The owner's notes above are as they were.
        let above = owner
            .call("read_note", json!({ "path": "Segredo.md" }))
            .await;
        assert!(
            above["ok"]["text"]
                .as_str()
                .unwrap()
                .contains("segredissima"),
            "{above}"
        );
        let sibling = owner.call("list_notes", json!({})).await;
        assert!(strings(&sibling["ok"]).contains(&"Mesa2/Fora.md".to_owned()));
        // Inside, a rename and a move work and answer in the share's paths.
        let moved = w
            .call(
                "rename_entry",
                json!({ "from": "Nova.md", "to": "Sub/Nova.md" }),
            )
            .await;
        assert_eq!(moved["ok"]["path"], "Sub/Nova.md", "{moved}");
        says_nothing_outside(&moved);
        // Sync's log through the share, before a note of the same name as
        // one above is made inside it.
        let changes = w.call("sync_changes", json!({ "since": 0 })).await;
        says_nothing_outside(&changes);
        // Sync through the share: in, never out.
        let put_out = send(&mut w.ws, 100, "../Segredo.md", b"x", None).await;
        assert_eq!(put_out["err"]["kind"], "refused", "{put_out}");
        let put_in = send(&mut w.ws, 200, "Segredo.md", b"o meu\n", None).await;
        assert_eq!(put_in["ok"]["path"], "Segredo.md", "{put_in}");
        let mine = owner
            .call("read_note", json!({ "path": "Mesa/Segredo.md" }))
            .await;
        assert_eq!(mine["ok"]["text"], "o meu\n");
        let root = owner
            .call("read_note", json!({ "path": "Segredo.md" }))
            .await;
        assert!(
            root["ok"]["text"]
                .as_str()
                .unwrap()
                .contains("segredissima")
        );
        for (cmd, args) in [
            (
                "sync_delete",
                json!({ "path": "../Segredo.md", "base": "x" }),
            ),
            ("sync_delete", json!({ "path": "", "base": "x" })),
            (
                "sync_rename",
                json!({ "from": "Notas.md", "to": "../Notas.md", "base": "x" }),
            ),
            (
                "sync_rename",
                json!({ "from": "../Segredo.md", "to": "Roubado.md", "base": "x" }),
            ),
        ] {
            let a = w.call(cmd, args.clone()).await;
            assert_eq!(a["err"]["kind"], "refused", "{cmd} {args}: {a}");
        }
        // The owner renames the shared folder through the server: the share
        // follows, its id and the window's paths unchanged (item 13).
        let renamed = owner
            .call("rename_entry", json!({ "from": "Mesa", "to": "Mesa Nova" }))
            .await;
        assert!(renamed.get("ok").is_some(), "{renamed}");
        assert_eq!(
            r.server.db.share(&share).unwrap().unwrap().path,
            "Mesa Nova"
        );
        let after = w.call("list_notes", json!({})).await;
        assert!(
            strings(&after["ok"]).contains(&"Notas.md".to_owned()),
            "{after}"
        );
        let (_, listed) = get(&r, "/api/folders", Some(&ana)).await;
        assert_eq!(listed["folders"][0]["name"], "Mesa Nova (Admin)");
        // A rename made outside the server orphans it: the owner and Ana
        // see it as missing (item 13).
        r.server.db.move_shares(&id, "Mesa Nova", "Sumiu").unwrap();
        let (_, listed) = get(&r, "/api/folders", Some(&ana)).await;
        assert_eq!(listed["folders"][0]["missing"], true, "{listed}");
        r.server.db.move_shares(&id, "Sumiu", "Mesa Nova").unwrap();
        // The owner deletes it: the share goes, Ana's window is told.
        let gone = owner
            .call("delete_entry", json!({ "path": "Mesa Nova" }))
            .await;
        assert!(gone.get("ok").is_some(), "{gone}");
        assert!(r.server.db.share(&share).unwrap().is_none());
        let none = w.call("list_notes", json!({})).await;
        assert_eq!(none["err"]["kind"], "no_folder", "{none}");
    });
}

#[test]
fn revoking_a_share_closes_it_and_attachments_are_read_only() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, _owner) = furnished(&r, &admin).await;
        let (ana, ana_id) = ana(&r).await;
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        // Only the owner shares: Ana, an editor of the share, may not.
        let (status, _) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "admin@casa.lan", "role": "editor" }),
            &ana,
        )
        .await;
        assert_eq!(status, 404);
        // A path that is no folder, or a hidden one, or one going up.
        for path in ["Nada", "../x", ".trash", "Mesa/../Segredo.md", "Segredo.md"] {
            let (status, said) = put(
                &r,
                &format!("/api/folders/{id}/shares"),
                json!({ "path": path, "email": "ana@casa.lan", "role": "reader" }),
                &admin,
            )
            .await;
            assert!(status == 400 || status == 404, "{path}: {status} {said}");
        }
        // The attachments folder, read only, under its own name.
        let (status, att) = put(
            &r,
            &format!("/api/folders/{id}/shares/attachments"),
            json!({ "path": "Mesa", "attachments": "Anexos" }),
            &admin,
        )
        .await;
        assert_eq!(status, 200, "{att}");
        assert_eq!(att["attachments"], "Anexos");
        let (mut w, _) = Win::open(&r, &ana, &share).await;
        let files = w.call("list_files", json!({})).await;
        assert!(
            strings(&files["ok"]).contains(&"Anexos/p.png".to_owned()),
            "{files}"
        );
        let resolved = w
            .call(
                "resolve_attachment",
                json!({ "source": "Notas.md", "target": "p.png" }),
            )
            .await;
        assert_eq!(resolved["ok"], "Anexos/p.png", "{resolved}");
        let (img, _) = get(&r, &format!("/f/{share}/Anexos/p.png"), Some(&ana)).await;
        assert_eq!(img, 200);
        for (cmd, args) in [
            (
                "create_file",
                json!({ "path": "Anexos/q.png", "base64": "AA==" }),
            ),
            ("delete_entry", json!({ "path": "Anexos/p.png" })),
            (
                "rename_entry",
                json!({ "from": "Anexos/p.png", "to": "p.png" }),
            ),
            (
                "rename_entry",
                json!({ "from": "Notas.md", "to": "Anexos/Notas.md" }),
            ),
        ] {
            let a = w.call(cmd, args.clone()).await;
            assert_eq!(a["err"]["kind"], "refused", "{cmd} {args}: {a}");
        }
        let put_att = send(&mut w.ws, 300, "Anexos/r.png", b"r", None).await;
        assert_eq!(put_att["err"]["kind"], "refused", "{put_att}");
        // Revoked: the window hears it at once and the share is closed to
        // every way in.
        let (status, _) = post(
            &r,
            &format!("/api/folders/{id}/shares/revoke"),
            json!({ "path": "Mesa", "account": ana_id }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 200);
        let gone = loop {
            let m = next(&mut w.ws).await;
            if m.get("gone").is_some() {
                break m;
            }
        };
        assert_eq!(gone["gone"], "folder");
        // Said as revoked, so that a device syncing it turns off with a
        // notice (ADR 0081 item 8).
        assert_eq!(gone["reason"], "revoked", "{gone}");
        let none = w.call("list_notes", json!({})).await;
        assert_eq!(none["err"]["kind"], "no_folder", "{none}");
        let again = w.call("open_server_folder", json!({ "id": share })).await;
        assert_eq!(again["err"]["kind"], "not_found", "{again}");
        let (img, _) = get(&r, &format!("/f/{share}/Anexos/p.png"), Some(&ana)).await;
        assert_eq!(img, 404);
        let (_, mine) = get(&r, "/api/folders", Some(&ana)).await;
        assert_eq!(mine["folders"], json!([]));
        // The last person gone, the share goes too.
        assert!(r.server.db.share(&share).unwrap().is_none());
    });
}

#[test]
fn a_token_reaches_the_share_it_names_and_no_more() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, _owner) = furnished(&r, &admin).await;
        let (ana, _) = ana(&r).await;
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        let (status, token) = post(
            &r,
            "/api/me/tokens",
            json!({ "name": "leitura", "write": false, "days": 30, "folders": [share] }),
            Some(&ana),
        )
        .await;
        assert_eq!(status, 200, "{token}");
        let secret = token["secret"].as_str().unwrap();
        let mut ws = connect(&r, None, None, Some(secret)).await.unwrap();
        next(&mut ws).await;
        let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": share })).await;
        assert!(opened.get("ok").is_some(), "{opened}");
        let notes = call(&mut ws, 2, "list_notes", json!({})).await;
        assert!(strings(&notes["ok"]).contains(&"Notas.md".to_owned()));
        // The token reads only: the editor's role is narrowed.
        let write = call(
            &mut ws,
            3,
            "create_note",
            json!({ "name": "X", "text": "x" }),
        )
        .await;
        assert_eq!(write["err"]["kind"], "refused", "{write}");
        let folder = call(&mut ws, 4, "open_server_folder", json!({ "id": id })).await;
        assert_eq!(folder["err"]["kind"], "not_found", "{folder}");
    });
}

#[test]
fn a_writer_of_a_share_sees_and_restores_only_its_part_of_the_bin() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, mut owner) = furnished(&r, &admin).await;
        let (ana, _) = ana(&r).await;
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        // The owner bins a note above the share and one inside it: Ana, an
        // editor, deletes nothing (ADR 0113 section B, amended 2026-10-31).
        let above = owner
            .call("delete_entry", json!({ "path": "Segredo.md" }))
            .await;
        assert!(above.get("ok").is_some(), "{above}");
        let (mut w, _) = Win::open(&r, &ana, &share).await;
        let refused = w.call("delete_entry", json!({ "path": "Outra.md" })).await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
        let gone = owner
            .call("delete_entry", json!({ "path": "Mesa/Outra.md" }))
            .await;
        assert!(gone.get("ok").is_some(), "{gone}");
        let bin = w.call("trash_list", json!({})).await;
        let entries = bin["ok"]["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 1, "{bin}");
        assert_eq!(entries[0]["original"], "Outra.md");
        assert_eq!(bin["ok"]["can_purge"], false);
        says_nothing_outside(&bin);
        // The owner's entry above is not hers to restore, by any name.
        let theirs = owner.call("trash_list", json!({})).await;
        let above_path = theirs["ok"]["entries"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["original"] == "Segredo.md")
            .unwrap()["path"]
            .as_str()
            .unwrap()
            .to_owned();
        let stolen = w
            .call(
                "trash_restore",
                json!({ "path": above_path, "today": "2026-10-11", "lang": "pt" }),
            )
            .await;
        assert_eq!(stolen["err"]["kind"], "not_found", "{stolen}");
        for cmd in ["trash_empty", "trash_delete", "trash_set_days"] {
            let a = w
                .call(cmd, json!({ "paths": [above_path.clone()], "days": 1 }))
                .await;
            assert_eq!(a["err"]["kind"], "refused", "{cmd}: {a}");
        }
        let back = w
            .call(
                "trash_restore",
                json!({ "path": entries[0]["path"], "today": "2026-10-11", "lang": "pt" }),
            )
            .await;
        assert_eq!(back["ok"]["path"], "Outra.md", "{back}");
        let mine = owner
            .call("read_note", json!({ "path": "Mesa/Outra.md" }))
            .await;
        assert!(mine.get("ok").is_some(), "{mine}");
    });
}

/// Ana's rename inside the share keeps the owner's links outside it (ADR
/// 0081 item 11, decided 2026-10-12): the server rewrites them, by the
/// rules of the window's own rewrite, and Ana hears only of the notes
/// inside. A note open in a room keeps its links, as a window's plan
/// would leave it.
#[test]
fn a_receivers_rename_rewrites_the_owners_links_outside_the_share() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, mut owner) = furnished(&r, &admin).await;
        let (ana, ana_id) = ana(&r).await;
        for (name, text) in [
            ("Mesa/Ref", "Ver [[Notas]].\n"),
            ("Diario/Hoje", "Hoje: [[Notas]].\n"),
        ] {
            let made = owner
                .call("create_note", json!({ "name": name, "text": text }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        // The owner is editing "Hoje" in a room.
        let mut room = connect(&r, Some(&admin.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut room).await;
        call(&mut room, 1, "open_server_folder", json!({ "id": id })).await;
        let joined = call(
            &mut room,
            2,
            "collab_join",
            json!({ "path": "Diario/Hoje.md" }),
        )
        .await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let (mut w, _) = Win::open(&r, &ana, &share).await;
        let renamed = w
            .call(
                "rename_entry",
                json!({ "from": "Notas.md", "to": "Notas2.md" }),
            )
            .await;
        assert_eq!(renamed["ok"]["path"], "Notas2.md", "{renamed}");
        // Ana's answer: the note inside, for her window to write; nothing
        // of the owner's notes outside — not a path, not a count.
        let rewrites = renamed["ok"]["rewrites"].as_array().unwrap();
        assert_eq!(rewrites.len(), 1, "{renamed}");
        assert_eq!(rewrites[0]["path"], "Ref.md");
        assert_eq!(renamed["ok"]["skipped"], json!([]), "{renamed}");
        says_nothing_outside(&renamed);
        for leak in ["Hoje", "Diario"] {
            assert!(!renamed.to_string().contains(leak), "{leak}: {renamed}");
        }
        // The owner's windows hear of the note the server rewrote.
        loop {
            let heard = event_named(&mut owner.ws, "folder-changed").await;
            if heard["changed"]
                .as_array()
                .unwrap()
                .contains(&json!("Segredo.md"))
            {
                break;
            }
        }
        let above = owner
            .call("read_note", json!({ "path": "Segredo.md" }))
            .await;
        let text = above["ok"]["text"].as_str().unwrap();
        assert!(text.contains("[[Notas2]]"), "{above}");
        assert!(text.contains("segredissima"), "{above}");
        // Open in a room: kept as it was.
        let hoje = owner
            .call("read_note", json!({ "path": "Diario/Hoje.md" }))
            .await;
        assert_eq!(hoje["ok"]["text"], "Hoje: [[Notas]].\n", "{hoje}");
        // The note inside is Ana's window's to write: untouched here.
        let inside = owner
            .call("read_note", json!({ "path": "Mesa/Ref.md" }))
            .await;
        assert_eq!(inside["ok"]["text"], "Ver [[Notas]].\n", "{inside}");
        // The folder's change log keeps the rewrite with its author.
        let made = r.server.db.latest_changes(&id, 50).unwrap();
        assert!(
            made.iter()
                .any(|c| c.path == "Segredo.md" && c.actor.as_deref() == Some(ana_id.as_str())),
            "{made:?}"
        );
        // A device's rename through the share does the same.
        let state = w.call("sync_state", json!({})).await;
        let base = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["path"] == "Notas2.md")
            .unwrap()["hash"]
            .clone();
        let moved = w
            .call(
                "sync_rename",
                json!({ "from": "Notas2.md", "to": "Sub/Notas3.md", "base": base }),
            )
            .await;
        assert_eq!(moved["ok"]["path"], "Sub/Notas3.md", "{moved}");
        says_nothing_outside(&moved);
        let above = owner
            .call("read_note", json!({ "path": "Segredo.md" }))
            .await;
        assert!(
            above["ok"]["text"].as_str().unwrap().contains("Notas3"),
            "{above}"
        );
        let hoje = owner
            .call("read_note", json!({ "path": "Diario/Hoje.md" }))
            .await;
        assert_eq!(hoje["ok"]["text"], "Hoje: [[Notas]].\n", "{hoje}");
    });
}

/// What a receiver's window counts is the share's (ADR 0081 item 11,
/// decided 2026-10-12): the status bar's notes, and a base's rows,
/// formulas, summaries and property names — a backlink from a note
/// outside counted by no formula, a value outside summed by no summary.
#[test]
fn a_receivers_counts_are_the_shares() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, mut owner) = furnished(&r, &admin).await;
        let (ana, _) = ana(&r).await;
        for (name, text) in [
            ("Mesa/Pontuada", "---\npontos: 5\n---\nDentro.\n"),
            ("Placar", "---\npontos: 100\nsegredo_campo: x\n---\nFora.\n"),
        ] {
            let made = owner
                .call("create_note", json!({ "name": name, "text": text }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "reader" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        let (mut w, info) = Win::open(&r, &ana, &share).await;
        // The status bar's notes: the share's four, never the folder's.
        let index = &info["ok"]["index"];
        assert_eq!(index["unchanged"], 4, "{info}");
        assert_eq!(index["indexed"], 0, "{info}");
        assert_eq!(index["removed"], 0, "{info}");
        let current = w.call("current_folder", json!({})).await;
        assert_eq!(current["ok"]["index"]["unchanged"], 4, "{current}");
        let again = w.call("reindex", json!({})).await;
        assert_eq!(again["ok"]["unchanged"], 4, "{again}");
        assert_eq!(again["ok"]["indexed"], 0, "{again}");
        let owners = owner.call("current_folder", json!({})).await;
        let all = &owners["ok"]["index"];
        let folder_notes = all["unchanged"].as_u64().unwrap() + all["indexed"].as_u64().unwrap();
        assert!(folder_notes > 4, "{owners}");
        // A base over everything: the share's rows, the share's sums.
        let text = "formulas:\n  entram: file.backlinks.length\nviews:\n  - type: table\n    name: T\n    order: [file.name, formula.entram, pontos]\n    summaries:\n      pontos: Sum\n";
        let query = json!({ "query": { "path": null, "text": text, "this": null, "view": null,
            "extra": [], "now": 0, "offset": 0, "lang": "pt" } });
        let base = w.call("query_base", query.clone()).await;
        let result = &base["ok"];
        assert_eq!(result["total"], 4, "{base}");
        let group = &result["groups"][0];
        let row = |name: &str| {
            group["rows"]
                .as_array()
                .unwrap()
                .iter()
                .find(|r| r["path"] == name)
                .cloned()
                .unwrap_or_else(|| panic!("{name} in {base}"))
        };
        // "Segredo", outside, links to "Notas": no backlink here.
        assert_eq!(
            row("Notas.md")["cells"][1],
            json!({ "kind": "number", "value": 0.0 }),
            "{base}"
        );
        assert_eq!(
            group["summaries"][2],
            json!({ "kind": "number", "value": 5.0 }),
            "{base}"
        );
        let names = result["properties"].as_array().unwrap();
        assert!(names.contains(&json!("pontos")), "{base}");
        assert!(!names.contains(&json!("segredo_campo")), "{base}");
        says_nothing_outside(&base);
        // The owner's own window counts the whole folder.
        let theirs = owner.call("query_base", query).await;
        let total = theirs["ok"]["total"].as_u64().unwrap();
        assert!(total > 4, "{theirs}");
        let sum = &theirs["ok"]["groups"][0]["summaries"][2];
        assert_eq!(
            sum,
            &json!({ "kind": "number", "value": 105.0 }),
            "{theirs}"
        );
    });
}

/// The receiver's sync counts the share's changes, never the folder's
/// (3.18): the head and the numbers of `sync_changes` through a share are
/// the share's own, so what the owner does outside it moves nothing the
/// receiver sees — not the head, not a push, not a gap in the numbers.
#[test]
fn changes_outside_the_share_do_not_move_the_receivers_head() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, mut owner) = furnished(&r, &admin).await;
        let (ana, _) = ana(&r).await;
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "reader" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        let (mut w, info) = Win::open(&r, &ana, &share).await;
        assert!(info.get("ok").is_some(), "{info}");
        // The share's changes from the start: numbered 1, 2, 3… with no
        // gap, and the head is the last of them.
        let all = w.call("sync_changes", json!({ "since": 0 })).await;
        let seqs: Vec<i64> = all["ok"]["changes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["seq"].as_i64().unwrap())
            .collect();
        assert!(!seqs.is_empty(), "{all}");
        assert_eq!(seqs, (1..=seqs.len() as i64).collect::<Vec<_>>(), "{all}");
        let head = all["ok"]["head"].as_i64().unwrap();
        assert_eq!(head, seqs.len() as i64, "{all}");
        let state = w.call("sync_state", json!({})).await;
        assert_eq!(state["ok"]["head"], head, "{state}");
        let folder_head = owner.call("sync_state", json!({})).await["ok"]["head"]
            .as_i64()
            .unwrap();
        assert!(
            folder_head > head,
            "the folder has changes outside the share"
        );
        // The owner works outside the share: the receiver's head stays.
        for (n, name) in ["Fora3.md", "Fora4.md", "Mesa2/Fora5.md"]
            .iter()
            .enumerate()
        {
            let put = send(&mut owner.ws, 300 + n as u64, name, b"fora\n", None).await;
            assert_eq!(put["ok"]["done"], true, "{put}");
        }
        let state = w.call("sync_state", json!({})).await;
        assert_eq!(state["ok"]["head"], head, "{state}");
        let none = w.call("sync_changes", json!({ "since": head })).await;
        assert_eq!(none["ok"]["changes"], json!([]), "{none}");
        assert_eq!(none["ok"]["head"], head, "{none}");
        // Then inside: the receiver hears it, with no head of the folder's
        // in the push, and the change is the share's next number.
        let put = send(&mut owner.ws, 400, "Mesa/Dentro.md", b"dentro\n", None).await;
        assert_eq!(put["ok"]["done"], true, "{put}");
        let heard = event_named(&mut w.ws, "sync-changed").await;
        assert!(heard.get("head").is_none(), "{heard}");
        let one = w.call("sync_changes", json!({ "since": head })).await;
        let changes = one["ok"]["changes"].as_array().unwrap();
        assert_eq!(changes.len(), 1, "{one}");
        assert_eq!(changes[0]["path"], "Dentro.md", "{one}");
        assert_eq!(changes[0]["seq"], head + 1, "{one}");
        assert_eq!(one["ok"]["head"], head + 1, "{one}");
        says_nothing_outside(&one);
        // A cursor past what the share sees stands at its last change:
        // nothing is missed, nothing is said twice.
        let past = w.call("sync_changes", json!({ "since": head + 50 })).await;
        assert_eq!(past["ok"]["changes"], json!([]), "{past}");
        assert_eq!(past["ok"]["head"], head + 1, "{past}");
        // The owner's own window still hears the folder's head.
        let theirs = owner.call("sync_state", json!({})).await;
        assert!(theirs["ok"]["head"].as_i64().unwrap() > folder_head + 3);
    });
}

/// An invitation to a share, accepted after the share is gone — its last
/// person revoked, or its folder deleted: nothing of the folder is given
/// in its place (ADR 0081 items 4 and 8), and the link answers as one
/// that expired.
#[test]
fn an_invitation_to_a_share_that_is_gone_gives_nothing() {
    block_on(async {
        for how in ["revoked", "deleted"] {
            let r = start().await;
            let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
            let (id, mut owner) = furnished(&r, &admin).await;
            let (_, ana_id) = ana(&r).await;
            let (_, shared) = put(
                &r,
                &format!("/api/folders/{id}/shares"),
                json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "reader" }),
                &admin,
            )
            .await;
            let share = shared["id"].as_str().unwrap().to_owned();
            let (status, inv) = post(
                &r,
                "/api/admin/invitations",
                json!({ "email": "novo@casa.lan", "share": share, "role": "editor" }),
                Some(&admin),
            )
            .await;
            assert_eq!(status, 200, "{inv}");
            let token = inv["link"].as_str().unwrap().rsplit('/').next().unwrap();
            if how == "revoked" {
                let (status, _) = post(
                    &r,
                    &format!("/api/folders/{id}/shares/revoke"),
                    json!({ "path": "Mesa", "account": ana_id }),
                    Some(&admin),
                )
                .await;
                assert_eq!(status, 200);
            } else {
                let gone = owner.call("delete_entry", json!({ "path": "Mesa" })).await;
                assert!(gone.get("ok").is_some(), "{gone}");
            }
            assert!(r.server.db.share(&share).unwrap().is_none(), "{how}");
            let (status, said) = post(
                &r,
                &format!("/api/invite/{token}"),
                json!({ "email": "x@y.z", "name": "Novo", "password": "outra senha longa", "lang": "pt" }),
                None,
            )
            .await;
            // Whatever the answer, nothing of the folder was given…
            let members = r.server.db.members(&id).unwrap();
            assert!(
                !members.iter().any(|(a, _)| a.email == "novo@casa.lan"),
                "{how}: the invitation to a share gave the whole folder: {:?}",
                members
                    .iter()
                    .map(|(a, role)| (a.email.clone(), *role))
                    .collect::<Vec<_>>()
            );
            if status == 200 {
                let novo = sign_in(&r, "novo@casa.lan", "outra senha longa").await;
                let (_, me) = get(&r, "/api/me", Some(&novo)).await;
                assert_eq!(me["folders"], json!([]), "{how}: {me}");
            }
            // …and the link is gone, as an expired one is.
            assert_eq!(status, 404, "{how}: {said}");
            assert_eq!(said["error"], "link_gone", "{how}: {said}");
            let (status, _) = get(&r, &format!("/api/invite/{token}"), None).await;
            assert_eq!(status, 404, "{how}");
            let (_, list) = get(&r, "/api/admin/invitations", Some(&admin)).await;
            assert_eq!(list["rows"][0]["state"], "ended", "{how}: {list}");
        }
    });
}

/// A note's type through a share is resolved over the share's schemas
/// only (ADR 0081 item 11, ADR 0052): a schema the owner keeps outside
/// types nothing there and is never named — not its path, not that it
/// exists — and one inside is named as the receiver knows it.
#[test]
fn a_notes_type_through_a_share_names_no_schema_outside_it() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, mut owner) = furnished(&r, &admin).await;
        let schema = |name: &str| {
            format!(
                "```verso-schema\ntype: {name}\nproperties:\n  - key: idade\n    kind: number\n```\n"
            )
        };
        for (name, text) in [
            ("Schemas/pessoa", schema("pessoa")),
            ("Schemas/lugar", schema("lugar")),
            ("Mesa/Tipos/lugar", schema("lugar")),
            (
                "Mesa/x",
                "---\ntype: pessoa\nidade: 3\n---\n# X\n".to_owned(),
            ),
            ("Mesa/y", "---\ntype: lugar\n---\n# Y\n".to_owned()),
        ] {
            let made = owner
                .call("create_note", json!({ "name": name, "text": text }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        // The owner sees the schema outside, and the two of one name.
        let theirs = owner
            .call("read_note", json!({ "path": "Mesa/x.md" }))
            .await;
        assert_eq!(
            theirs["ok"]["note_type"]["state"]["schema"], "Schemas/pessoa.md",
            "{theirs}"
        );
        let (ana, _) = ana(&r).await;
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        let (mut w, _) = Win::open(&r, &ana, &share).await;
        let x = w.call("read_note", json!({ "path": "x.md" })).await;
        let mut all = Vec::new();
        every_string(&x, &mut all);
        for s in &all {
            assert!(
                !s.contains("Schemas"),
                "a schema outside the share crossed: {x}"
            );
        }
        says_nothing_outside(&x);
        assert_eq!(x["ok"]["note_type"], Value::Null, "{x}");
        // A schema inside types the note, named as the receiver knows it,
        // and the one of the same name outside makes no conflict.
        let y = w.call("read_note", json!({ "path": "y.md" })).await;
        assert_eq!(y["ok"]["note_type"]["state"]["kind"], "typed", "{y}");
        assert_eq!(
            y["ok"]["note_type"]["state"]["schema"], "Tipos/lugar.md",
            "{y}"
        );
        says_nothing_outside(&y);
        // Writing and creating answer the same.
        let revision = x["ok"]["revision"].as_str().unwrap();
        let written = w
            .call(
                "write_note",
                json!({ "path": "x.md", "text": "---\ntype: pessoa\n---\n# X2\n", "revision": revision }),
            )
            .await;
        assert!(written.get("ok").is_some(), "{written}");
        assert_eq!(written["ok"]["note"]["note_type"], Value::Null, "{written}");
        says_nothing_outside(&written);
        let made = w
            .call(
                "create_note",
                json!({ "name": "z", "text": "---\ntype: pessoa\n---\n" }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        assert_eq!(made["ok"]["note_type"], Value::Null, "{made}");
        says_nothing_outside(&made);
    });
}

/// A link through a share to a note outside it and a link to no note at
/// all cross alike (ADR 0081 item 11): a receiver who writes links learns
/// nothing of whether a note of that name exists outside.
#[test]
fn a_link_outside_the_share_and_an_unresolved_one_cross_alike() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, mut owner) = furnished(&r, &admin).await;
        for (name, text) in [
            ("Existe", "fora\n"),
            (
                "Mesa/L",
                "[[Existe]]\n[[NaoExiste]]\n![[Existe]]\n![[NaoExiste]]\n![[p.png]]\n![[nada.png]]\n",
            ),
        ] {
            let made = owner
                .call("create_note", json!({ "name": name, "text": text }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let (ana, _) = ana(&r).await;
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        let (mut w, _) = Win::open(&r, &ana, &share).await;
        let links = w.call("links", json!({ "path": "L.md" })).await;
        let list = links["ok"].as_array().unwrap();
        assert_eq!(list.len(), 6, "{links}");
        // Each entry without its target and its place in the note.
        let bare = |l: &Value| {
            let mut l = l.clone();
            for k in ["target", "line", "col"] {
                l.as_object_mut().unwrap().remove(k);
            }
            l
        };
        assert_eq!(list[0]["target"], "Existe");
        assert_eq!(list[1]["target"], "NaoExiste");
        assert_eq!(
            bare(&list[0]),
            bare(&list[1]),
            "a link outside is told apart: {links}"
        );
        assert_eq!(
            bare(&list[2]),
            bare(&list[3]),
            "an embed outside is told apart: {links}"
        );
        assert_eq!(list[0]["resolved"], Value::Null);
        assert_eq!(list[0]["outside"], true, "{links}");
        // A file outside and no file: alike too, and left to
        // `resolve_attachment`, which answers both with nothing.
        assert_eq!(
            bare(&list[4]),
            bare(&list[5]),
            "a file outside is told apart: {links}"
        );
        assert_eq!(list[4]["outside"], false, "{links}");
        for target in ["p.png", "nada.png"] {
            let a = w
                .call(
                    "resolve_attachment",
                    json!({ "source": "L.md", "target": target }),
                )
                .await;
            assert_eq!(a["ok"], Value::Null, "{target}: {a}");
        }
        says_nothing_outside(&links);
    });
}

/// `collab_join` tells the truth about who may type (night device test,
/// 2026-10-30): the reader of a share is answered `read_only: true` — its
/// window opens read-only — though it is in the room, with the note's
/// text; the editor of the same note is answered `false`.
#[test]
fn a_join_tells_a_reader_it_is_read_only_and_an_editor_it_is_not() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, _owner) = furnished(&r, &admin).await;
        let (ana, _) = ana(&r).await;
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "reader" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        let (mut w, _) = Win::open(&r, &ana, &share).await;
        let joined = w.call("collab_join", json!({ "path": "Outra.md" })).await;
        assert_eq!(joined["ok"]["read_only"], true, "{joined}");
        // Still in the room, to follow it: the note's text and a room.
        assert_ne!(joined["ok"]["update"], "", "{joined}");
        assert_ne!(joined["ok"]["epoch"], "", "{joined}");
        // The editor of the same share is told it may type.
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let editor = shared["id"].as_str().unwrap().to_owned();
        let (mut e, _) = Win::open(&r, &ana, &editor).await;
        let joined = e.call("collab_join", json!({ "path": "Outra.md" })).await;
        assert_eq!(joined["ok"]["read_only"], false, "{joined}");
    });
}

/// An e-mail no account has, given in the owner's share dialog (decided
/// 2026-11-04: a folder with no table is invited to from its page, as a
/// table is): the server's admin is told they may make an invitation link,
/// and makes one carrying the share at the role given — the console's act
/// (`admin::acts::make_invitation`). Whoever accepts reaches the share and
/// nothing above it. A folder's owner who is not the admin is refused
/// (ADR 0081 item 4), and so is an e-mail an account has.
#[test]
fn an_admin_invites_a_person_with_no_account_to_a_share() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let (id, _w) = furnished(&r, &admin).await;
        let at = format!("/api/folders/{id}/shares");
        let to_caio = json!({ "path": "Mesa", "email": "caio@casa.lan", "role": "editor" });
        let (status, refused) = put(&r, &at, to_caio.clone(), &admin).await;
        assert_eq!(status, 400, "{refused}");
        assert!(
            refused["message"]
                .as_str()
                .unwrap()
                .contains("make an invitation link"),
            "{refused}"
        );
        let (status, made) = post(&r, &format!("{at}/invite"), to_caio, Some(&admin)).await;
        assert_eq!(status, 200, "{made}");
        let token = made["link"]
            .as_str()
            .unwrap()
            .rsplit_once("/invite/")
            .unwrap()
            .1
            .to_owned();
        let (_, log) = get(
            &r,
            "/api/admin/audit?action=invitation_created",
            Some(&admin),
        )
        .await;
        assert_eq!(log["total"], 1, "{log}");
        // An e-mail an account has: refused, nothing made.
        ana(&r).await;
        let (status, exists) = post(
            &r,
            &format!("{at}/invite"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "reader" }),
            Some(&admin),
        )
        .await;
        assert_eq!(status, 409, "{exists}");
        // Caio accepts: the share, at editing, and nothing above it.
        let (status, joined) = post(
            &r,
            &format!("/api/invite/{token}"),
            json!({ "email": "caio@casa.lan", "name": "Caio", "password": "a senha do caio aqui", "lang": "pt" }),
            None,
        )
        .await;
        assert_eq!(status, 200, "{joined}");
        let caio = r
            .server
            .db
            .account_by_email("caio@casa.lan")
            .unwrap()
            .unwrap();
        assert_eq!(r.server.db.role(&id, &caio.id).unwrap(), None);
        let share = r.server.db.share_at(&id, "Mesa").unwrap().unwrap();
        assert_eq!(
            r.server.db.share_role(&share.id, &caio.id).unwrap(),
            Some(crate::db::Role::Editor)
        );
        // An owner who is not the server's admin invites no one.
        let caio_b = sign_in(&r, "caio@casa.lan", "a senha do caio aqui").await;
        let mine = r
            .server
            .db
            .create_folder("Caderno do Caio", &caio.id)
            .unwrap();
        let (status, said) = post(
            &r,
            &format!("/api/folders/{}/shares/invite", mine.id),
            json!({ "path": "", "email": "duda@casa.lan", "role": "reader" }),
            Some(&caio_b),
        )
        .await;
        assert_eq!(status, 403, "{said}");
    });
}
