// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folders' version histories (ADR 0091), against a running server:
//! a write is a version named by its author (items 1 and 4), restored as
//! a new write over the revision read (item 5, invariant 11) — through the
//! room when the note is live —, a room's saves folded and named, who
//! sees and does what (item 6), a rename followed and a deletion reached
//! (item 9), a copy beside the file, and the console's page (items 3, 7).

use base64::Engine;
use serde_json::{Value, json};
use yrs::updates::decoder::Decode;
use yrs::{GetString, Text, Transact};

use crate::collab;
use crate::db::Role;
use crate::tests::{Socket, block_on, call, connect, folder_id, next, sign_in, start};

async fn window(r: &crate::tests::Running, b: &crate::tests::Browser, id: &str) -> Socket {
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let o = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(o.get("ok").is_some(), "{o}");
    // The folder's log looks at it once before anyone writes: the files as
    // they were found are versions, and the writes after are the next. Left
    // to the log's own look, in the background, a write that wins the race
    // finds the file already changed and the found version is lost (the
    // product keeps the bytes it hashed, see
    // `a_change_hashed_from_other_bytes_than_the_file_now_holds_is_no_version`).
    // A share's id names no folder: its folder has been looked at already.
    if let Some(folder) = r.server.db.folder(id).unwrap() {
        let key = crate::access::key(&r.server, &folder).unwrap();
        crate::sync::reconcile(&r.server, id, &key, None, &[]).unwrap();
    }
    ws
}

async fn write(ws: &mut Socket, n: u64, path: &str, text: &str) -> Value {
    let read = call(ws, n, "read_note", json!({ "path": path })).await;
    let revision = read["ok"]["revision"].clone();
    call(
        ws,
        n + 1,
        "write_note",
        json!({ "path": path, "text": text, "revision": revision }),
    )
    .await
}

fn versions(list: &Value) -> Vec<Value> {
    list["ok"]["versions"]
        .as_array()
        .cloned()
        .unwrap_or_default()
}

/// A yrs document holding a room's state, and an edit appended to it.
fn appended(joined: &Value, more: &str) -> String {
    let doc = yrs::Doc::with_options(yrs::Options {
        offset_kind: yrs::OffsetKind::Utf16,
        ..Default::default()
    });
    let state = base64::engine::general_purpose::STANDARD
        .decode(joined["ok"]["update"].as_str().unwrap())
        .unwrap();
    doc.transact_mut()
        .apply_update(yrs::Update::decode_v1(&state).unwrap())
        .unwrap();
    let text = doc.get_or_insert_text(collab::TEXT);
    let was = text.get_string(&doc.transact());
    let edit = {
        let mut txn = doc.transact_mut();
        let len = u32::try_from(was.encode_utf16().count()).unwrap();
        text.insert(&mut txn, len, more);
        txn.encode_update_v1()
    };
    base64::engine::general_purpose::STANDARD.encode(edit)
}

fn room_text(joined: &Value) -> String {
    let doc = yrs::Doc::with_options(yrs::Options {
        offset_kind: yrs::OffsetKind::Utf16,
        ..Default::default()
    });
    let state = base64::engine::general_purpose::STANDARD
        .decode(joined["ok"]["update"].as_str().unwrap())
        .unwrap();
    doc.transact_mut()
        .apply_update(yrs::Update::decode_v1(&state).unwrap())
        .unwrap();
    let text = doc.get_or_insert_text(collab::TEXT);
    text.get_string(&doc.transact())
}

#[test]
fn a_write_is_a_version_named_and_a_restore_is_a_new_write_over_the_revision_read() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = window(&r, &b, &id).await;
        assert!(
            write(&mut ws, 2, "Sessao.md", "um\n")
                .await
                .get("ok")
                .is_some()
        );
        assert!(
            write(&mut ws, 4, "Sessao.md", "dois\n")
                .await
                .get("ok")
                .is_some()
        );
        let list = call(&mut ws, 6, "history_list", json!({ "path": "Sessao.md" })).await;
        let v = versions(&list);
        // The file as the log first found it, then the two writes.
        assert_eq!(v.len(), 3, "{list}");
        assert_eq!(v[2]["kind"], "found");
        assert_eq!(v[2]["authors"], json!([]));
        assert_eq!(v[0]["kind"], "write");
        assert_eq!(
            v[0]["authors"][0],
            json!({ "kind": "account", "name": "Admin" })
        );
        assert_eq!(
            (v[0]["added"].clone(), v[0]["removed"].clone()),
            (json!(1), json!(1))
        );
        assert_eq!(list["ok"]["can_delete"], true);
        assert_eq!(list["ok"]["days"], 365);
        let old = v[1]["id"].clone();
        let text = call(
            &mut ws,
            7,
            "history_read",
            json!({ "path": "Sessao.md", "id": old }),
        )
        .await;
        assert_eq!(text["ok"]["text"], "um\n", "{text}");
        // Read, then changed by someone else: refused, nothing written.
        let read = call(&mut ws, 8, "read_note", json!({ "path": "Sessao.md" })).await;
        let stale = read["ok"]["revision"].clone();
        write(&mut ws, 9, "Sessao.md", "três\n").await;
        let no = call(
            &mut ws,
            11,
            "history_restore",
            json!({ "path": "Sessao.md", "id": old, "revision": stale }),
        )
        .await;
        assert_eq!(no["err"]["kind"], "changed", "{no}");
        let read = call(&mut ws, 12, "read_note", json!({ "path": "Sessao.md" })).await;
        assert_eq!(read["ok"]["text"], "três\n");
        let back = call(
            &mut ws,
            13,
            "history_restore",
            json!({ "path": "Sessao.md", "id": old, "revision": read["ok"]["revision"] }),
        )
        .await;
        assert_eq!(back["ok"]["path"], "Sessao.md", "{back}");
        let read = call(&mut ws, 14, "read_note", json!({ "path": "Sessao.md" })).await;
        assert_eq!(read["ok"]["text"], "um\n");
        assert_eq!(read["ok"]["revision"], back["ok"]["revision"]);
        let list = call(&mut ws, 15, "history_list", json!({ "path": "Sessao.md" })).await;
        let v = versions(&list);
        assert_eq!(v[0]["kind"], "restore", "{list}");
        assert_eq!(v.len(), 5, "history is never rewritten: {list}");
        let actions: Vec<String> = r
            .server
            .db
            .audit_log(Some(&id), 50)
            .unwrap()
            .into_iter()
            .map(|a| a.action)
            .collect();
        assert!(actions.contains(&"history_restored".to_owned()));
        // To sync, a write like any: in the change log.
        let changes = r.server.db.latest_changes(&id, 3).unwrap();
        assert!(changes.iter().any(|c| c.path == "Sessao.md" && !c.deleted));
        // A version of another file is not this one's.
        let made = call(
            &mut ws,
            16,
            "create_note",
            json!({ "name": "Outra", "text": "x\n" }),
        )
        .await;
        assert!(made.get("ok").is_some(), "{made}");
        let other = call(&mut ws, 18, "history_list", json!({ "path": "Outra.md" })).await;
        let foreign = versions(&other)[0]["id"].clone();
        let no = call(
            &mut ws,
            19,
            "history_read",
            json!({ "path": "Sessao.md", "id": foreign }),
        )
        .await;
        assert_eq!(no["err"]["kind"], "not_found", "{no}");
    });
}

#[test]
fn a_rooms_saves_fold_name_their_editors_and_a_restore_goes_through_the_room() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut one = window(&r, &b, &id).await;
        let joined = call(&mut one, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        let first = room_text(&joined);
        for (n, more) in [(3, "linha um\n"), (6, "linha dois\n")] {
            let joined = call(&mut one, n, "collab_join", json!({ "path": "Sessao.md" })).await;
            let update = appended(&joined, more);
            let sent = call(
                &mut one,
                n + 1,
                "collab_update",
                json!({ "path": "Sessao.md", "update": update }),
            )
            .await;
            assert!(sent.get("ok").is_some(), "{sent}");
            let saved = call(
                &mut one,
                n + 2,
                "collab_save",
                json!({ "path": "Sessao.md" }),
            )
            .await;
            assert!(saved["ok"].is_string(), "{saved}");
        }
        let list = call(&mut one, 9, "history_list", json!({ "path": "Sessao.md" })).await;
        let v = versions(&list);
        // The file as the room found it, then ten minutes of the room's
        // saves in one version, named.
        assert_eq!(v.len(), 2, "{list}");
        assert_eq!(v[0]["kind"], "room");
        assert_eq!(
            v[0]["authors"],
            json!([{ "kind": "account", "name": "Admin" }])
        );
        assert_eq!(v[1]["kind"], "found");
        let found = v[1]["id"].clone();
        // An edit waiting in the room, not yet written: the restore goes
        // through the room, which neither stops nor loses it to a change
        // from outside.
        let joined = call(&mut one, 10, "collab_join", json!({ "path": "Sessao.md" })).await;
        let update = appended(&joined, "à espera\n");
        call(
            &mut one,
            11,
            "collab_update",
            json!({ "path": "Sessao.md", "update": update }),
        )
        .await;
        let read = call(&mut one, 12, "read_note", json!({ "path": "Sessao.md" })).await;
        let back = call(
            &mut one,
            13,
            "history_restore",
            json!({ "path": "Sessao.md", "id": found, "revision": read["ok"]["revision"] }),
        )
        .await;
        assert!(back.get("ok").is_some(), "{back}");
        let read = call(&mut one, 14, "read_note", json!({ "path": "Sessao.md" })).await;
        assert_eq!(read["ok"]["text"].as_str().unwrap(), first);
        let saved = call(&mut one, 15, "collab_save", json!({ "path": "Sessao.md" })).await;
        assert!(saved["ok"].is_string(), "the room did not stop: {saved}");
        let mut two = window(&r, &b, &id).await;
        let joined = call(&mut two, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        assert_eq!(room_text(&joined), first, "the room holds the version");
    });
}

#[test]
fn whoever_writes_restores_the_owner_deletes_a_reader_sees_no_history() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        for (email, role) in [("ed@casa.lan", Role::Editor), ("le@casa.lan", Role::Reader)] {
            let a = r
                .server
                .db
                .create_account(email, email, "en", Some("senha muito longa"), false)
                .unwrap();
            r.server.db.grant(&id, &a.id, role).unwrap();
        }
        let ed = sign_in(&r, "ed@casa.lan", "senha muito longa").await;
        let mut ws = window(&r, &ed, &id).await;
        let one = write(&mut ws, 2, "Sessao.md", "um\n").await;
        assert!(one.get("ok").is_some(), "{one}");
        let two = write(&mut ws, 4, "Sessao.md", "dois\n").await;
        assert!(two.get("ok").is_some(), "{two}");
        let list = call(&mut ws, 6, "history_list", json!({ "path": "Sessao.md" })).await;
        assert_eq!(list["ok"]["can_delete"], false, "{list}");
        let v = versions(&list);
        assert_eq!(v[0]["authors"][0]["name"], "ed@casa.lan");
        let no = call(
            &mut ws,
            7,
            "history_delete",
            json!({ "path": "Sessao.md", "id": v[1]["id"] }),
        )
        .await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        let le = sign_in(&r, "le@casa.lan", "senha muito longa").await;
        let mut reader = window(&r, &le, &id).await;
        for (n, cmd, args) in [
            (2, "history_list", json!({ "path": "Sessao.md" })),
            (
                3,
                "history_read",
                json!({ "path": "Sessao.md", "id": v[1]["id"] }),
            ),
            (
                4,
                "history_restore",
                json!({ "path": "Sessao.md", "id": v[1]["id"], "revision": null }),
            ),
        ] {
            let no = call(&mut reader, n, cmd, args).await;
            assert_eq!(no["err"]["kind"], "refused", "{cmd}: {no}");
        }
        let mut own = window(&r, &admin, &id).await;
        let gone = call(
            &mut own,
            2,
            "history_delete",
            json!({ "path": "Sessao.md", "id": v[1]["id"] }),
        )
        .await;
        assert_eq!(versions(&gone).len(), 2, "{gone}");
    });
}

#[test]
fn a_rename_keeps_the_history_a_deletion_leaves_it_and_a_copy_lands_beside() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = window(&r, &b, &id).await;
        write(&mut ws, 2, "Sessao.md", "um\n").await;
        write(&mut ws, 4, "Sessao.md", "dois\n").await;
        let moved = call(
            &mut ws,
            6,
            "rename_entry",
            json!({ "from": "Sessao.md", "to": "Diario.md" }),
        )
        .await;
        assert!(moved.get("ok").is_some(), "{moved}");
        let list = call(&mut ws, 7, "history_list", json!({ "path": "Diario.md" })).await;
        let v = versions(&list);
        assert_eq!(v.len(), 3, "a version follows its file: {list}");
        assert_eq!(v[1]["path"], "Sessao.md", "the path it had then");
        let copy = call(
            &mut ws,
            8,
            "history_copy",
            json!({ "path": "Diario.md", "id": v[1]["id"], "stamp": "2026-10-14 15h04", "lang": "pt" }),
        )
        .await;
        assert_eq!(
            copy["ok"]["path"], "Diario (versão 2026-10-14 15h04).md",
            "{copy}"
        );
        let read = call(
            &mut ws,
            9,
            "read_note",
            json!({ "path": copy["ok"]["path"] }),
        )
        .await;
        assert_eq!(read["ok"]["text"], "um\n");
        call(&mut ws, 10, "delete_entry", json!({ "path": "Diario.md" })).await;
        let list = call(&mut ws, 11, "history_list", json!({ "path": "Diario.md" })).await;
        assert!(
            list["ok"]["gone"].is_number(),
            "reached from the trash: {list}"
        );
        assert_eq!(versions(&list).len(), 3);
        // A version of a file gone comes back as a new file.
        let back = call(
            &mut ws,
            12,
            "history_restore",
            json!({ "path": "Diario.md", "id": versions(&list)[0]["id"], "revision": null }),
        )
        .await;
        assert!(back.get("ok").is_some(), "{back}");
        let read = call(&mut ws, 13, "read_note", json!({ "path": "Diario.md" })).await;
        assert_eq!(read["ok"]["text"], "dois\n");
    });
}

#[test]
fn the_console_shows_the_history_and_sets_its_days() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = window(&r, &b, &id).await;
        write(&mut ws, 2, "Sessao.md", "um\n").await;
        let (status, page) =
            crate::tests::get(&r, &format!("/api/admin/folders/{id}"), Some(&b)).await;
        assert_eq!(status, 200, "{page}");
        assert_eq!(page["history"]["count"], 2, "{page}");
        assert_eq!(page["history"]["days"], 365);
        let (status, set) = crate::tests::put(
            &r,
            &format!("/api/admin/folders/{id}/history"),
            json!({ "days": 30 }),
            &b,
        )
        .await;
        assert_eq!(status, 200, "{set}");
        assert_eq!(set["days"], 30);
        assert_eq!(set["adminDays"], 30);
        let list = call(&mut ws, 3, "history_list", json!({ "path": "Sessao.md" })).await;
        assert_eq!(list["ok"]["days"], 30);
        let (_, set) = crate::tests::put(
            &r,
            &format!("/api/admin/folders/{id}/history"),
            json!({ "days": null }),
            &b,
        )
        .await;
        assert_eq!(set["days"], 365, "{set}");
        // Quota: shown, not counted — the guard thins early (item 7).
        write(&mut ws, 4, "Sessao.md", "dois\n").await;
        r.server.db.set_quota(&id, Some(1)).unwrap();
        let t = crate::history::thin(&r.server, &id).unwrap();
        assert_eq!(t.count, 1, "only the newest of the file stays");
        assert!(t.early > 0);
    });
}

#[test]
fn a_share_sees_the_history_of_its_own_files_only() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let mut owner = window(&r, &admin, &id).await;
        for (n, name, text) in [(2, "Mesa/Notas", "um\n"), (3, "Segredo", "segredo\n")] {
            let made = call(
                &mut owner,
                n,
                "create_note",
                json!({ "name": name, "text": text }),
            )
            .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        write(&mut owner, 4, "Mesa/Notas.md", "dois\n").await;
        r.server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        let ana = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let (_, shared) = crate::tests::put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        let mut w = window(&r, &ana, &share).await;
        let list = call(&mut w, 2, "history_list", json!({ "path": "Notas.md" })).await;
        let v = versions(&list);
        assert_eq!(v.len(), 2, "{list}");
        assert_eq!(v[0]["path"], "Notas.md", "paths as the share names them");
        assert_eq!(list["ok"]["can_delete"], false);
        assert!(!list.to_string().contains("Mesa/"), "{list}");
        // Nothing above the share, by any name.
        for (n, path) in [(3, "../Segredo.md"), (4, "/Segredo.md")] {
            let no = call(&mut w, n, "history_list", json!({ "path": path })).await;
            assert!(no.get("err").is_some(), "{path}: {no}");
        }
        let read = call(&mut w, 5, "read_note", json!({ "path": "Notas.md" })).await;
        let back = call(
            &mut w,
            6,
            "history_restore",
            json!({ "path": "Notas.md", "id": v[1]["id"], "revision": read["ok"]["revision"] }),
        )
        .await;
        assert_eq!(back["ok"]["path"], "Notas.md", "{back}");
        let mine = call(
            &mut owner,
            8,
            "read_note",
            json!({ "path": "Mesa/Notas.md" }),
        )
        .await;
        assert_eq!(mine["ok"]["text"], "um\n");
    });
}

/// ADR 0091 with ADR 0087: a note holding a secret block has a history only
/// for those who may write it, and they see it whole; a reader is refused
/// every history command and no word of the secret is in the refusal.
#[test]
fn the_history_of_a_secret_note_is_the_writers_alone_and_whole() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        for (email, role) in [("ed@casa.lan", Role::Editor), ("le@casa.lan", Role::Reader)] {
            let a = r
                .server
                .db
                .create_account(email, email, "en", Some("senha muito longa"), false)
                .unwrap();
            r.server.db.grant(&id, &a.id, role).unwrap();
        }
        let ed = sign_in(&r, "ed@casa.lan", "senha muito longa").await;
        let mut ws = window(&r, &ed, &id).await;
        let first = "Aberto.\n\n> [!secret]\n> zqsegredo um\n";
        let second = "Aberto.\n\n> [!secret]\n> zqsegredo dois\n";
        assert!(
            write(&mut ws, 2, "Sessao.md", first)
                .await
                .get("ok")
                .is_some()
        );
        assert!(
            write(&mut ws, 4, "Sessao.md", second)
                .await
                .get("ok")
                .is_some()
        );
        let list = call(&mut ws, 6, "history_list", json!({ "path": "Sessao.md" })).await;
        let v = versions(&list);
        assert_eq!(v.len(), 3, "{list}");
        // The writer's diff and restore are whole and unaffected.
        let old = call(
            &mut ws,
            7,
            "history_read",
            json!({ "path": "Sessao.md", "id": v[1]["id"] }),
        )
        .await;
        assert!(old.to_string().contains("zqsegredo"), "{old}");
        let now = call(&mut ws, 10, "read_note", json!({ "path": "Sessao.md" })).await;
        let back = call(
            &mut ws,
            8,
            "history_restore",
            json!({ "path": "Sessao.md", "id": v[1]["id"], "revision": now["ok"]["revision"] }),
        )
        .await;
        assert!(back.get("ok").is_some(), "{back}");
        let read = call(&mut ws, 9, "read_note", json!({ "path": "Sessao.md" })).await;
        assert!(read["ok"]["text"].as_str().unwrap().contains("zqsegredo"));
        // A reader is refused every history command, and told nothing.
        let le = sign_in(&r, "le@casa.lan", "senha muito longa").await;
        let mut reader = window(&r, &le, &id).await;
        for (n, cmd) in [
            "history_list",
            "history_read",
            "history_restore",
            "history_copy",
            "history_delete",
        ]
        .into_iter()
        .enumerate()
        {
            let args = json!({ "path": "Sessao.md", "id": v[0]["id"], "revision": null });
            let no = call(&mut reader, 2 + n as u64, cmd, args).await;
            assert_eq!(no["err"]["kind"], "refused", "{cmd}: {no}");
            assert!(!no.to_string().contains("zqsegredo"), "{cmd}: {no}");
        }
        let shown = call(&mut reader, 9, "read_note", json!({ "path": "Sessao.md" })).await;
        assert!(!shown.to_string().contains("zqsegredo"), "{shown}");
    });
}

#[test]
fn a_change_hashed_from_other_bytes_than_the_file_now_holds_is_no_version() {
    // The log's first look hashes a file; before it records the version,
    // the file is written again. The new bytes are the next change's, with
    // its author — not a version of the first.
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let _ws = window(&r, &b, &id).await;
        let key =
            crate::access::key(&r.server, &r.server.db.folder(&id).unwrap().unwrap()).unwrap();
        let before = r.server.history.with(|s| s.size(&id)).unwrap().0;
        let seen = crate::sync::sha256(b"# Sessao\n");
        let change = vec![(
            "Sessao.md".to_owned(),
            Some((seen, 9, "9:1".to_owned())),
            None,
        )];
        {
            use std::io::Write;
            let mut f = tempfile::NamedTempFile::new_in(r.campanha()).unwrap();
            f.write_all(b"outra coisa\n").unwrap();
            f.persist(r.campanha().join("Sessao.md")).unwrap();
        }
        crate::history::recorded(
            &r.server,
            (&id, &key),
            crate::sync::Author::default(),
            &change,
            true,
        );
        let after = r.server.history.with(|s| s.size(&id)).unwrap().0;
        assert_eq!(
            after, before,
            "a version of bytes the change was not hashed from"
        );
    });
}

/// Seen on Windows (2026-10-31): the walk can take a change written
/// through the server before the write's own reconciliation does, and
/// recorded it made outside, with no author; the write, finding the log
/// already holding its bytes, recorded nothing. Its author takes the
/// version over.
#[test]
fn a_write_the_walk_recorded_first_keeps_its_author() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = window(&r, &b, &id).await;
        let key =
            crate::access::key(&r.server, &r.server.db.folder(&id).unwrap().unwrap()).unwrap();
        let admin = r
            .server
            .db
            .account_by_email("admin@casa.lan")
            .unwrap()
            .unwrap();
        // The write's bytes on the disk, the walk first, then the write's
        // own reconciliation.
        {
            use std::io::Write;
            let mut f = tempfile::NamedTempFile::new_in(r.campanha()).unwrap();
            f.write_all(b"dois\n").unwrap();
            f.persist(r.campanha().join("Sessao.md")).unwrap();
        }
        // The watcher names the path it saw change, with no author.
        crate::sync::reconcile(&r.server, &id, &key, None, &["Sessao.md".to_owned()]).unwrap();
        crate::sync::reconcile_written(
            &r.server,
            &id,
            &key,
            Some(&admin.id),
            &["Sessao.md".to_owned()],
        )
        .unwrap();
        let list = call(&mut ws, 6, "history_list", json!({ "path": "Sessao.md" })).await;
        let v = versions(&list);
        assert_eq!(v[0]["kind"], "write", "{list}");
        assert_eq!(
            v[0]["authors"][0],
            json!({ "kind": "account", "name": "Admin" }),
            "{list}"
        );
    });
}
