// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Outside a table only the folder's owner deletes (ADR 0113 section B,
//! amended 2026-10-31, B8: *"apenas o dono da pasta pode apagar"*), against
//! a running server: an editor of the folder, and an editor of a share,
//! edit, create, rename and move, and every door that deletes — the
//! window's `delete_note` and `delete_entry`, a device's `sync_delete` —
//! refuses them, saying why, and leaves the file where it was. The bin
//! stays open to them (ADR 0080 item 7: any writer restores).

use serde_json::{Value, json};

use crate::db::Role;
use crate::tests::{
    Browser, Running, Socket, block_on, call, connect, folder_id, next, put, sign_in, start,
};

/// A socket and the ids of its requests.
struct Win {
    ws: Socket,
    n: u64,
}

impl Win {
    async fn open(r: &Running, b: &Browser, id: &str) -> Self {
        let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        let o = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        assert!(o.get("ok").is_some(), "{o}");
        Self { ws, n: 10 }
    }

    async fn call(&mut self, cmd: &str, args: Value) -> Value {
        self.n += 1;
        call(&mut self.ws, self.n, cmd, args).await
    }
}

/// An account with `role` at the folder `id`, signed in.
async fn member(r: &Running, id: &str, email: &str, role: Option<Role>) -> Browser {
    let a = r
        .server
        .db
        .create_account(email, email, "pt", Some("senha muito longa"), false)
        .unwrap();
    if let Some(role) = role {
        r.server.db.grant(id, &a.id, role).unwrap();
    }
    sign_in(r, email, "senha muito longa").await
}

/// The refusal of a delete outside a table: it names the owner, and
/// nothing was deleted.
fn owner_deletes(v: &Value) {
    assert_eq!(v["err"]["kind"], "refused", "{v}");
    assert_eq!(v["err"]["message"], crate::access::NO_DELETE_OWNER, "{v}");
}

async fn there(w: &mut Win, path: &str) -> bool {
    w.call("read_note", json!({ "path": path })).await["ok"]["text"].is_string()
}

#[test]
fn an_editor_of_the_folder_edits_renames_moves_and_never_deletes() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let ed = member(&r, &id, "ed@casa.lan", Some(Role::Editor)).await;
        let mut w = Win::open(&r, &ed, &id).await;
        // Creates, renames, moves: an editor's, as before.
        for (cmd, args) in [
            (
                "create_note",
                json!({ "name": "notas/Nova", "text": "nova\n" }),
            ),
            ("create_folder", json!({ "path": "outra" })),
            (
                "rename_entry",
                json!({ "from": "notas/Nova.md", "to": "notas/Renomeada.md" }),
            ),
            (
                "move_entries",
                json!({ "paths": ["notas/Renomeada.md"], "folder": "outra" }),
            ),
        ] {
            let a = w.call(cmd, args).await;
            assert!(a.get("ok").is_some(), "{cmd}: {a}");
        }
        assert!(there(&mut w, "outra/Renomeada.md").await);
        // Deletes: none, by any door, and the file stays.
        for (cmd, path) in [
            ("delete_note", "Sessao.md"),
            ("delete_entry", "Sessao.md"),
            ("delete_entry", "outra/Renomeada.md"),
            ("delete_entry", "outra"),
            ("delete_entry", "notas"),
        ] {
            owner_deletes(&w.call(cmd, json!({ "path": path })).await);
        }
        assert!(there(&mut w, "Sessao.md").await);
        assert!(there(&mut w, "outra/Renomeada.md").await);
        // A device of the editor: its deletion is refused as the window's
        // is, and what it may do says so before it is sent.
        let rights = w
            .call(
                "access_get",
                json!({ "paths": ["Sessao.md"], "brief": true }),
            )
            .await;
        let row = &rights["ok"][0];
        assert_eq!(row["see"], true, "{rights}");
        assert_eq!(row["put"], true, "{rights}");
        assert_eq!(row["rename"], true, "{rights}");
        assert_eq!(row["delete"], false, "{rights}");
        let read = w
            .call("sync_read", json!({ "path": "Sessao.md", "offset": 0 }))
            .await;
        let hash = read["ok"]["hash"].as_str().unwrap().to_owned();
        owner_deletes(
            &w.call("sync_delete", json!({ "path": "Sessao.md", "base": hash }))
                .await,
        );
        assert!(there(&mut w, "Sessao.md").await);
        // The owner deletes; the bin is the editor's to see and restore
        // from (ADR 0080 item 7, unchanged).
        let mut own = Win::open(&r, &admin, &id).await;
        let gone = own
            .call("delete_entry", json!({ "path": "outra/Renomeada.md" }))
            .await;
        assert!(gone.get("ok").is_some(), "{gone}");
        let bin = w.call("trash_list", json!({})).await;
        assert_eq!(bin["ok"]["can_purge"], false, "{bin}");
        let entry = bin["ok"]["entries"][0]["path"].as_str().unwrap().to_owned();
        let back = w
            .call(
                "trash_restore",
                json!({ "path": entry, "today": "2026-10-31", "lang": "pt" }),
            )
            .await;
        assert_eq!(back["ok"]["path"], "outra/Renomeada.md", "{back}");
        let empty = w.call("trash_empty", json!({})).await;
        assert_eq!(empty["err"]["kind"], "refused", "{empty}");
        // A reader is refused as a reader, not as an editor who may not
        // delete.
        let le = member(&r, &id, "le@casa.lan", Some(Role::Reader)).await;
        let mut lw = Win::open(&r, &le, &id).await;
        let no = lw
            .call("delete_entry", json!({ "path": "Sessao.md" }))
            .await;
        assert_eq!(no["err"]["kind"], "refused", "{no}");
        assert_ne!(no["err"]["message"], crate::access::NO_DELETE_OWNER, "{no}");
    });
}

#[test]
fn an_editor_of_a_share_moves_inside_it_and_never_deletes() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let mut own = Win::open(&r, &admin, &id).await;
        for name in ["Mesa/Outra", "Mesa/Sub/Funda"] {
            let made = own
                .call("create_note", json!({ "name": name, "text": "x\n" }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let ana = member(&r, &id, "ana@casa.lan", None).await;
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        let mut w = Win::open(&r, &ana, &share).await;
        let moved = w
            .call(
                "move_entries",
                json!({ "paths": ["Outra.md"], "folder": "Sub" }),
            )
            .await;
        assert!(moved.get("ok").is_some(), "{moved}");
        for path in ["Sub/Outra.md", "Sub/Funda.md", "Sub"] {
            owner_deletes(&w.call("delete_entry", json!({ "path": path })).await);
        }
        assert!(there(&mut w, "Sub/Outra.md").await);
        // Back to the share's own root: still inside it, an editor's move.
        let back = w
            .call(
                "move_entries",
                json!({ "paths": ["Sub/Funda.md"], "folder": "" }),
            )
            .await;
        assert!(back.get("ok").is_some(), "{back}");
        assert!(there(&mut w, "Funda.md").await);
        // The owner deletes inside the share.
        let gone = own
            .call("delete_entry", json!({ "path": "Mesa/Sub/Outra.md" }))
            .await;
        assert!(gone.get("ok").is_some(), "{gone}");
    });
}

/// A move that takes a file out of a shared folder counts as deleting it
/// for that share, so only the folder's owner makes it (ADR 0113 section B,
/// amendment of 2026-10-31, decided that day). The folder's editor moves
/// inside a share, into one, and the shared folder itself (its share goes
/// with it); a share's editor cannot name a place outside it at all; a
/// device's rename is judged as the window's move.
#[test]
fn a_move_out_of_a_share_is_the_owners_alone() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let mut own = Win::open(&r, &admin, &id).await;
        for (name, text) in [
            ("Mesa/Carta", "carta\n"),
            ("Mesa/Mapa", "mapa\n"),
            ("Mesa/Sub/Funda", "funda\n"),
            ("Solta", "solta\n"),
        ] {
            let made = own
                .call("create_note", json!({ "name": name, "text": text }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let ana = member(&r, &id, "ana@casa.lan", None).await;
        let (_, shared) = put(
            &r,
            &format!("/api/folders/{id}/shares"),
            json!({ "path": "Mesa", "email": "ana@casa.lan", "role": "editor" }),
            &admin,
        )
        .await;
        let share = shared["id"].as_str().unwrap().to_owned();
        let mut w = Win::open(&r, &ana, &share).await;
        // The share's editor: no path leaves the share.
        for (cmd, args) in [
            (
                "rename_entry",
                json!({ "from": "Carta.md", "to": "../Carta.md" }),
            ),
            (
                "move_entries",
                json!({ "paths": ["Carta.md"], "folder": ".." }),
            ),
        ] {
            let a = w.call(cmd, args).await;
            assert!(a.get("err").is_some(), "{cmd}: {a}");
        }
        // The folder's editor: not out of the share, by any door.
        let ed = member(&r, &id, "ed@casa.lan", Some(Role::Editor)).await;
        let mut e = Win::open(&r, &ed, &id).await;
        let read = e
            .call("sync_read", json!({ "path": "Mesa/Mapa.md", "offset": 0 }))
            .await;
        let hash = read["ok"]["hash"].as_str().unwrap().to_owned();
        for (cmd, args) in [
            (
                "move_entries",
                json!({ "paths": ["Mesa/Carta.md"], "folder": "Fora" }),
            ),
            (
                "move_entries",
                json!({ "paths": ["Mesa/Sub"], "folder": "" }),
            ),
            (
                "rename_entry",
                json!({ "from": "Mesa/Carta.md", "to": "Carta.md" }),
            ),
            (
                "sync_rename",
                json!({ "from": "Mesa/Mapa.md", "to": "Fora/Mapa.md", "base": hash }),
            ),
        ] {
            let a = e.call(cmd, args).await;
            assert_eq!(a["err"]["kind"], "refused", "{cmd}: {a}");
            assert_eq!(
                a["err"]["message"],
                crate::access::NO_MOVE_OUT_OF_SHARE,
                "{cmd}: {a}"
            );
        }
        assert!(there(&mut w, "Carta.md").await);
        assert!(there(&mut w, "Mapa.md").await);
        assert!(there(&mut w, "Sub/Funda.md").await);
        // Inside it, into it, and the shared folder itself: an editor's.
        for (cmd, args) in [
            (
                "move_entries",
                json!({ "paths": ["Mesa/Carta.md"], "folder": "Mesa/Sub" }),
            ),
            (
                "move_entries",
                json!({ "paths": ["Solta.md"], "folder": "Mesa" }),
            ),
            ("rename_entry", json!({ "from": "Mesa", "to": "Mesa Nova" })),
        ] {
            let a = e.call(cmd, args).await;
            assert!(a.get("ok").is_some(), "{cmd}: {a}");
        }
        assert!(there(&mut w, "Sub/Carta.md").await);
        assert!(there(&mut w, "Solta.md").await);
        // The owner moves out of it.
        let out = own
            .call(
                "move_entries",
                json!({ "paths": ["Mesa Nova/Sub/Carta.md"], "folder": "Fora" }),
            )
            .await;
        assert!(out.get("ok").is_some(), "{out}");
        assert!(!there(&mut w, "Sub/Carta.md").await);
    });
}
