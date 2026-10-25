// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The review of ADR 0113 S1–S3 (2026-10-24): what a player is shown or
//! told of a file outside its access — a hidden note's text or name, in an
//! answer, in an error, in a bin — is BLOCKING (the maintainer's rule), and
//! each way the review found is closed here. The maintainer's two decisions
//! are tested: "the server corrects without telling" (a rename's rewrites of
//! hidden notes are written by the server and not answered) and "automatic
//! suffix" (a name taken by something the player cannot see is not refused:
//! the next free one is used).

use serde_json::{Value, json};

use crate::access::{Level, NodeSet};
use crate::db::Role;
use crate::tests::{block_on, sign_in};
use crate::tests_campaign::{Mesa, Win, mesa};

fn refused(v: &Value) -> bool {
    v["err"]["kind"] == "refused"
}

fn set(whole: &str) -> Value {
    json!({ "kind": "set", "set": { "whole": whole, "rows": [] }, "secret_name": null })
}

async fn editor(m: &Mesa) -> Win {
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

/// The whole folder is the editor's to make and rename in, but the Barão
/// stays hidden to everyone, by a set of its own.
async fn open_root_hide_baron(m: &mut Mesa) {
    let a = m
        .owner
        .call(
            "access_set",
            json!({ "paths": [""], "change": set("edit") }),
        )
        .await;
    assert!(a.get("ok").is_some(), "{a}");
    let b = m
        .owner
        .call(
            "access_set",
            json!({ "paths": ["Barão Zq.md"], "change": set("none") }),
        )
        .await;
    assert!(b.get("ok").is_some(), "{b}");
}

/// The table is the subfolder "Mundo Zq" alone; the rest of the folder is
/// every editor's as ever.
fn table_in_the_subfolder(m: &Mesa) {
    m.r.server.db.campaign_drop(&m.id, "").unwrap();
    m.r.server.db.campaign_make(&m.id, "Mundo Zq").unwrap();
    crate::campaign::forget(&m.r.server, &m.id);
}

#[test]
fn a_rename_by_a_player_tells_nothing_of_the_hidden_notes_that_link_it_and_still_corrects_them() {
    block_on(async {
        let mut m = mesa().await;
        open_root_hide_baron(&mut m).await;
        let mut cid = editor(&m).await;
        let done = cid
            .call(
                "rename_entry",
                json!({ "from": "Aberta.md", "to": "Aberta2.md" }),
            )
            .await;
        assert!(done.get("ok").is_some(), "{done}");
        let said = done.to_string();
        for leak in ["Barão", "zqbody", "BARAO", "rewrites\":[{"] {
            assert!(!said.contains(leak), "{leak} in {said}");
        }
        // The server corrected the hidden note's link without telling.
        let baron = m
            .owner
            .call("read_note", json!({ "path": "Barão Zq.md" }))
            .await;
        assert!(
            baron["ok"]["text"]
                .as_str()
                .unwrap_or_default()
                .contains("[[Aberta2]]"),
            "{baron}"
        );
    });
}

#[test]
fn a_file_cannot_be_moved_into_a_table_by_someone_who_is_not_its_game_master() {
    block_on(async {
        let mut m = mesa().await;
        table_in_the_subfolder(&m);
        let mut cid = editor(&m).await;
        let no = cid
            .call(
                "rename_entry",
                json!({ "from": "Livre.md", "to": "Mundo Zq/Livre.md" }),
            )
            .await;
        assert!(refused(&no), "{no}");
        let no = cid
            .call(
                "move_entries",
                json!({ "paths": ["Livre.md"], "folder": "Mundo Zq" }),
            )
            .await;
        assert!(refused(&no), "{no}");
        let ok = m
            .owner
            .call(
                "rename_entry",
                json!({ "from": "Livre.md", "to": "Mundo Zq/Livre.md" }),
            )
            .await;
        assert!(ok.get("ok").is_some(), "{ok}");
    });
}

#[test]
fn the_bin_of_a_folder_with_a_table_shows_a_player_nothing() {
    block_on(async {
        let mut m = mesa().await;
        table_in_the_subfolder(&m);
        let gone = m
            .owner
            .call("delete_entry", json!({ "path": "Mundo Zq/Cripta Zq.md" }))
            .await;
        assert!(gone.get("ok").is_some(), "{gone}");
        let mut cid = editor(&m).await;
        let list = cid.call("trash_list", json!({})).await;
        assert!(!list.to_string().contains("Cripta"), "{list}");
        assert!(list.get("err").is_some(), "{list}");
    });
}

#[test]
fn a_name_taken_by_something_hidden_is_never_answered_as_taken() {
    block_on(async {
        let mut m = mesa().await;
        open_root_hide_baron(&mut m).await;
        let mut cid = editor(&m).await;
        // "Barão Zq" is there, hidden: the player is given the next free name.
        let made = cid
            .call(
                "create_note",
                json!({ "name": "Barão Zq", "text": "meu\n" }),
            )
            .await;
        assert_eq!(made["ok"]["path"], "Barão Zq 2.md", "{made}");
        let file = cid
            .call(
                "create_file",
                json!({ "path": "Mundo Zq/x.png", "base64": crate::tests_campaign::PNG }),
            )
            .await;
        assert!(file.get("ok").is_some() || refused(&file), "{file}");
        assert!(!file.to_string().contains("exists"), "{file}");
        let folder = cid
            .call("create_folder", json!({ "path": "Mundo Zq" }))
            .await;
        assert!(!folder.to_string().contains("exists"), "{folder}");
        let renamed = cid
            .call(
                "rename_entry",
                json!({ "from": "Livre.md", "to": "Barão Zq.md" }),
            )
            .await;
        assert_eq!(renamed["ok"]["path"], "Barão Zq 3.md", "{renamed}");
        // What is theirs to see is still refused as taken.
        let again = cid
            .call("create_note", json!({ "name": "Aberta", "text": "x\n" }))
            .await;
        assert_eq!(again["err"]["kind"], "exists", "{again}");
    });
}

#[test]
fn a_folder_that_holds_what_a_player_does_not_see_is_not_theirs_to_rename() {
    block_on(async {
        let mut m = mesa().await;
        open_root_hide_baron(&mut m).await;
        let mut cid = editor(&m).await;
        // "Mundo Zq" holds the Cripta, which the player's set hides.
        let hide = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq/Cripta Zq.md"], "change": set("none") }),
            )
            .await;
        assert!(hide.get("ok").is_some(), "{hide}");
        let no = cid
            .call("rename_entry", json!({ "from": "Mundo Zq", "to": "Outro" }))
            .await;
        assert!(refused(&no), "{no}");
        assert!(!no.to_string().contains("Cripta"), "{no}");
        // And the root of a table is the game master's to rename.
        table_in_the_subfolder(&m);
        let no = cid
            .call("rename_entry", json!({ "from": "Mundo Zq", "to": "Outro" }))
            .await;
        assert!(refused(&no), "{no}");
    });
}

#[test]
fn a_new_file_that_is_not_a_note_is_a_file_sent_and_needs_the_right() {
    block_on(async {
        let mut m = mesa().await;
        let mut cid = editor(&m).await;
        let given = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq"], "change": set("edit") }),
            )
            .await;
        assert!(given.get("ok").is_some(), "{given}");
        let png = crate::tests_campaign::PNG;
        let path = json!({ "path": "Mundo Zq/x.png", "base64": png });
        let no = cid.call("create_file", path.clone()).await;
        assert!(refused(&no), "no right: {no}");
        let editor_id =
            m.r.server
                .db
                .account_by_email("cid@casa.lan")
                .unwrap()
                .unwrap()
                .id;
        let r = m
            .owner
            .call(
                "table_rights_set",
                json!({ "root": "", "accounts": [editor_id], "right": "files", "on": true }),
            )
            .await;
        assert!(r.get("ok").is_some(), "{r}");
        let ok = cid.call("create_file", path).await;
        assert!(ok.get("ok").is_some(), "{ok}");
        // Never a script or a page, with the right too.
        let svg = base64_of(b"<svg xmlns='x'/>");
        let no = cid
            .call(
                "create_file",
                json!({ "path": "Mundo Zq/y.svg", "base64": svg }),
            )
            .await;
        assert!(refused(&no), "{no}");
        let _ = (Level::None, NodeSet::default());
    });
}

fn base64_of(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

#[test]
fn a_folder_above_a_table_is_not_deleted_moved_nor_renamed_by_an_editor() {
    block_on(async {
        let mut m = mesa().await;
        // "Mundo Zq" holds the table "Mundo Zq/Sub": above it, in no table.
        m.r.server.db.campaign_drop(&m.id, "").unwrap();
        m.r.server.db.campaign_make(&m.id, "Mundo Zq/Sub").unwrap();
        crate::campaign::forget(&m.r.server, &m.id);
        let made = m
            .owner
            .call(
                "create_note",
                json!({ "name": "Mundo Zq/Sub/Oculta Zq", "text": "x\n" }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let mut cid = editor(&m).await;
        for (cmd, args) in [
            ("delete_entry", json!({ "path": "Mundo Zq" })),
            ("delete_note", json!({ "path": "Mundo Zq" })),
            (
                "move_entries",
                json!({ "paths": ["Mundo Zq"], "folder": "Anexos" }),
            ),
            (
                "rename_entry",
                json!({ "from": "Mundo Zq", "to": "Anexos/Mundo Zq" }),
            ),
            ("rename_entry", json!({ "from": "Mundo Zq", "to": "Outro" })),
            (
                "rename_entry",
                json!({ "from": "Mundo Zq/Sub", "to": "Mundo Zq/Sub2" }),
            ),
        ] {
            let no = cid.call(cmd, args).await;
            assert!(refused(&no), "{cmd}: {no}");
        }
        let still = m
            .owner
            .call("read_note", json!({ "path": "Mundo Zq/Sub/Oculta Zq.md" }))
            .await;
        assert!(still.get("ok").is_some(), "{still}");
    });
}

#[test]
fn a_devices_rename_onto_a_hidden_name_gets_the_suffix_and_never_says_taken() {
    block_on(async {
        let mut m = mesa().await;
        open_root_hide_baron(&mut m).await;
        let mut cid = editor(&m).await;
        let state = cid.call("sync_state", json!({})).await;
        let files = state["ok"]["files"].as_array().unwrap().clone();
        let livre = files.iter().find(|f| f["path"] == "Livre.md").unwrap();
        let done = cid
            .call(
                "sync_rename",
                json!({ "from": "Livre.md", "to": "Barão Zq.md", "base": livre["hash"] }),
            )
            .await;
        assert!(done.get("ok").is_some(), "{done}");
        assert_eq!(done["ok"]["path"], "Barão Zq 2.md", "{done}");
        assert!(!done.to_string().contains("exists"), "{done}");
        // The hidden note is untouched, and a folder holding hidden files
        // is not a device's to rename.
        let hide = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq/Cripta Zq.md"], "change": set("none") }),
            )
            .await;
        assert!(hide.get("ok").is_some(), "{hide}");
        let no = cid
            .call(
                "sync_rename",
                json!({ "from": "Mundo Zq", "to": "Outro", "base": "" }),
            )
            .await;
        assert!(refused(&no), "{no}");
        assert!(!no.to_string().contains("Cripta"), "{no}");
    });
}

#[test]
fn a_write_to_a_hidden_name_is_answered_as_a_write_to_a_free_one_and_never_overwrites() {
    block_on(async {
        let mut m = mesa().await;
        open_root_hide_baron(&mut m).await;
        let mut cid = editor(&m).await;
        let hidden = cid
            .call(
                "write_note",
                json!({ "path": "Barão Zq.md", "text": "meu\n", "revision": "x" }),
            )
            .await;
        let free = cid
            .call(
                "write_note",
                json!({ "path": "Livre Novo.md", "text": "meu\n", "revision": "x" }),
            )
            .await;
        assert_eq!(
            hidden["err"]["kind"], free["err"]["kind"],
            "{hidden} / {free}"
        );
        assert_eq!(hidden.get("ok").is_some(), free.get("ok").is_some());
        let text = cid
            .call(
                "write_text",
                json!({ "path": "Barão Zq.md", "text": "meu\n", "revision": "x" }),
            )
            .await;
        assert!(!text.to_string().contains("only read"), "{text}");
        // The hidden note is untouched.
        let baron = m
            .owner
            .call("read_note", json!({ "path": "Barão Zq.md" }))
            .await;
        assert!(
            baron["ok"]["text"].as_str().unwrap().contains("zqbody"),
            "{baron}"
        );
    });
}

#[test]
fn write_text_never_makes_a_file_that_needs_the_right_to_send_files() {
    block_on(async {
        let mut m = mesa().await;
        let given = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Mundo Zq"], "change": set("edit") }),
            )
            .await;
        assert!(given.get("ok").is_some(), "{given}");
        let mut cid = editor(&m).await;
        for path in [
            "Mundo Zq/novo.txt",
            "Mundo Zq/novo.html",
            "Mundo Zq/novo.canvas",
            "Mundo Zq/novo.base",
        ] {
            let made = cid
                .call(
                    "write_text",
                    json!({ "path": path, "text": "x", "revision": "" }),
                )
                .await;
            assert!(made.get("err").is_some(), "{path}: {made}");
            let there = m.owner.call("read_text", json!({ "path": path })).await;
            assert!(
                there.get("err").is_some() || path.ends_with(".base"),
                "{path} was made by write_text: {made} / {there}"
            );
        }
    });
}
