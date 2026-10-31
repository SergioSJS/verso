// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! ADR 0113 S3, against a running server: every door asks the same rules.
//! What the exhaustive matrix proves of `may` (`access/vectors.rs`) and the
//! equivalence test of the migration (`db/tests_access.rs`), these prove of
//! the doors that call it: the seat from the role, the folder's editor as a
//! player who edits what they see, create and rename inside a folder one
//! edits and never delete nor move (K.5), the game master's read-only
//! credential, a file moved keeping its access (K.2).

use serde_json::{Value, json};

use crate::access::{Level, NodeSet};
use crate::db::Role;
use crate::tests::{block_on, call, connect, next, sign_in};
use crate::tests_campaign::{Win, mesa, strings};

fn edit_set() -> NodeSet {
    NodeSet {
        whole: Level::Edit,
        rows: std::collections::BTreeMap::new(),
    }
}

async fn editor_cid(m: &crate::tests_campaign::Mesa) -> Win {
    let c =
        m.r.server
            .db
            .create_account("cid@casa.lan", "Cid", "pt", Some("a senha do cid"), false)
            .unwrap();
    m.r.server.db.grant(&m.id, &c.id, Role::Editor).unwrap();
    let b = sign_in(&m.r, "cid@casa.lan", "a senha do cid").await;
    let (w, o) = Win::open(&m.r, &b, &m.id).await;
    assert!(o.get("ok").is_some(), "{o}");
    w
}

fn refused(v: &Value) -> bool {
    v["err"]["kind"] == "refused"
}

/// A folder's editor at a table is a player (item 3) who edits every file
/// they see (K.1): the hidden is not there, the released is theirs to
/// write; with *Edits* on a folder they make and rename inside it (K.5),
/// never delete nor move, and a move by the game master keeps what a file
/// had (K.2).
#[test]
fn an_editor_at_a_table_is_a_player_who_edits_what_they_see() {
    block_on(async {
        let mut m = mesa().await;
        let mut cid = editor_cid(&m).await;
        // Sees what the table released, as a player does; the hidden is not
        // there to them, as it is not to a reader.
        assert_eq!(
            strings(&cid.call("list_notes", json!({})).await["ok"]),
            ["Aberta.md", "Livre.md"]
        );
        let hidden = cid
            .call("read_note", json!({ "path": "Barão Zq.md" }))
            .await;
        assert_eq!(hidden["err"]["kind"], "not_found", "{hidden}");
        // A file they see, they edit: read whole, written.
        let read = cid.call("read_note", json!({ "path": "Livre.md" })).await;
        let revision = read["ok"]["revision"].as_str().unwrap().to_owned();
        let wrote = cid
            .call(
                "write_note",
                json!({ "path": "Livre.md", "text": "do Cid\n", "revision": revision }),
            )
            .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        // One they do not see, they do not write — the name of a hidden file
        // is not theirs to learn by a write that works.
        let no = cid
            .call(
                "write_note",
                json!({ "path": "Barão Zq.md", "text": "x\n", "revision": "x" }),
            )
            .await;
        assert!(refused(&no), "{no}");
        // Never delete, never move (K.5).
        let del = cid
            .call("delete_entry", json!({ "path": "Livre.md" }))
            .await;
        assert!(refused(&del), "{del}");
        let mv = cid
            .call(
                "move_entries",
                json!({ "paths": ["Livre.md"], "folder": "Mundo Zq" }),
            )
            .await;
        assert!(refused(&mv), "{mv}");
        // No folder is theirs to make files in until the game master gives
        // *Edits* on it.
        let made = cid
            .call(
                "create_note",
                json!({ "name": "Mundo Zq/Cid", "text": "meu\n" }),
            )
            .await;
        assert!(refused(&made), "{made}");
        m.r.server
            .db
            .access_put(&m.id, "Mundo Zq", edit_set())
            .unwrap();
        crate::campaign::forget(&m.r.server, &m.id);
        // *Edits* on the folder alone adds nothing to it: creating is a right
        // of its own (K.6).
        let made = cid
            .call(
                "create_note",
                json!({ "name": "Mundo Zq/Cid", "text": "meu\n" }),
            )
            .await;
        assert!(refused(&made), "{made}");
        let id =
            m.r.server
                .db
                .account_by_email("cid@casa.lan")
                .unwrap()
                .unwrap()
                .id;
        m.r.server
            .db
            .campaign_right_set(&m.id, "", &[id], crate::access::Right::CreatesNotes, true)
            .unwrap();
        let made = cid
            .call(
                "create_note",
                json!({ "name": "Mundo Zq/Cid", "text": "meu\n" }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        // The new file takes the folder's access: she sees and edits it.
        let own = cid
            .call("read_note", json!({ "path": "Mundo Zq/Cid.md" }))
            .await;
        assert!(own.get("ok").is_some(), "{own}");
        let renamed = cid
            .call(
                "rename_entry",
                json!({ "from": "Mundo Zq/Cid.md", "to": "Mundo Zq/Cid2.md" }),
            )
            .await;
        assert!(renamed.get("ok").is_some(), "{renamed}");
        // Inside the folder only: out of it is a move.
        let out = cid
            .call(
                "rename_entry",
                json!({ "from": "Mundo Zq/Cid2.md", "to": "Cid2.md" }),
            )
            .await;
        assert!(refused(&out), "{out}");
        let del = cid
            .call("delete_entry", json!({ "path": "Mundo Zq/Cid2.md" }))
            .await;
        assert!(refused(&del), "{del}");
        // The game master moves a file out of that folder: it keeps the
        // access it had (K.2), it does not take the new folder's.
        let moved = m
            .owner
            .call(
                "rename_entry",
                json!({ "from": "Mundo Zq/Cid2.md", "to": "Cid2.md" }),
            )
            .await;
        assert!(moved.get("ok").is_some(), "{moved}");
        crate::campaign::forget(&m.r.server, &m.id);
        let veil = crate::campaign::veil_of(&m.r.server, &m.id).unwrap();
        assert_eq!(
            veil.effective_set("Cid2.md"),
            edit_set().normalized(),
            "a moved file keeps the access it had"
        );
    });
}

/// The secret rolls and the images of a table: an editor is a player there
/// too (item 3, K.4).
#[test]
fn an_editor_at_a_table_has_no_master_controls_and_sends_no_file_unasked() {
    block_on(async {
        let m = mesa().await;
        let mut cid = editor_cid(&m).await;
        let joined = call(
            &mut cid.ws,
            2,
            "table_join",
            json!({ "color": null, "styles": null }),
        )
        .await;
        assert_eq!(joined["ok"]["role"], "reader", "{joined}");
        assert_eq!(joined["ok"]["images"], false, "{joined}");
        let clear = call(&mut cid.ws, 3, "table_clear", json!({})).await;
        assert!(refused(&clear), "{clear}");
        // The table's controls are the game master's.
        let settings = cid
            .call("campaign_settings", json!({ "root": "", "open": false }))
            .await;
        assert!(refused(&settings), "{settings}");
    });
}

/// The game master's own read-only credential stays the game master (item
/// 6): it sees the whole folder, a closed table does not shut it out, and it
/// writes nothing; the same credential on a player is a player's.
#[test]
fn the_game_masters_read_only_token_still_sees_everything_and_writes_nothing() {
    block_on(async {
        let mut m = mesa().await;
        let admin =
            m.r.server
                .db
                .account_by_email("admin@casa.lan")
                .unwrap()
                .unwrap();
        let (secret, _) =
            m.r.server
                .db
                .create_token(&admin.id, "so le", false, None, std::slice::from_ref(&m.id))
                .unwrap();
        // A table closed to its players.
        let closed = m
            .owner
            .call("campaign_settings", json!({ "root": "", "open": false }))
            .await;
        assert!(closed.get("ok").is_some(), "{closed}");
        let mut ws = connect(&m.r, None, None, Some(&secret)).await.unwrap();
        next(&mut ws).await;
        let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": m.id })).await;
        assert!(opened.get("ok").is_some(), "{opened}");
        let all = strings(&call(&mut ws, 2, "list_notes", json!({})).await["ok"]);
        assert!(
            all.contains(&"Barão Zq.md".to_owned()) && all.len() >= 5,
            "{all:?}"
        );
        let read = call(&mut ws, 3, "read_note", json!({ "path": "Barão Zq.md" })).await;
        assert!(read.get("ok").is_some(), "{read}");
        let no = call(
            &mut ws,
            4,
            "write_note",
            json!({ "path": "Livre.md", "text": "x\n", "revision": "x" }),
        )
        .await;
        assert!(refused(&no), "{no}");
        let no = call(
            &mut ws,
            5,
            "campaign_settings",
            json!({ "root": "", "open": true }),
        )
        .await;
        assert!(refused(&no), "{no}");
        // A player, closed out of the closed table, is told so.
        let b = sign_in(&m.r, "ana@casa.lan", "a senha da ana").await;
        let (_, o) = Win::open(&m.r, &b, &m.id).await;
        assert!(o.get("err").is_some(), "{o}");
    });
}
