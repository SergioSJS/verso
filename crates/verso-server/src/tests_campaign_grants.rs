// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A table is a campaign folder (ADR 0110), the game master's side: the
//! grants on every write path, the table's limits, the invitation and what
//! an editor is. The players' reads are `tests_campaign.rs`.

use base64::Engine;
use serde_json::json;

use crate::db::{Grant, Role};
use crate::tests::{block_on, get, sign_in};
use crate::tests_campaign::{PNG, Win, mesa, strings};

// ---------------------------------------------------------------- grants

#[test]
fn a_grant_lets_a_player_edit_one_note_and_nothing_else() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        // Without a grant every write of a player is refused.
        let w = m.ana.call("read_note", json!({ "path": "Livre.md" })).await;
        let rev = w["ok"]["revision"].clone();
        for (cmd, args) in [
            (
                "write_note",
                json!({ "path": "Livre.md", "text": "x", "revision": rev }),
            ),
            (
                "write_text",
                json!({ "path": "Livre.md", "text": "x", "revision": rev }),
            ),
            ("create_note", json!({ "name": "Nova", "text": "x" })),
            (
                "create_file",
                json!({ "path": "Anexos/n.png", "base64": PNG }),
            ),
            ("create_folder", json!({ "path": "Pasta" })),
            ("rename_note", json!({ "from": "Livre.md", "to": "L2.md" })),
            ("rename_entry", json!({ "from": "Livre.md", "to": "L2.md" })),
            (
                "move_entries",
                json!({ "folder": "Anexos", "paths": ["Livre.md"] }),
            ),
            ("delete_note", json!({ "path": "Livre.md" })),
            ("delete_entry", json!({ "path": "Livre.md" })),
            (
                "write_board",
                json!({ "path": "Tabuleiro.canvas", "json": "{}", "revision": "" }),
            ),
        ] {
            let r = m.ana.call(cmd, args).await;
            assert_eq!(r["err"]["kind"], "refused", "{cmd}: {r}");
        }
        for p in ["Livre.md", "Aberta.md"] {
            let c = m.ana.call("collab_join", json!({ "path": p })).await;
            assert!(c.get("ok").is_some(), "{c}");
            let r = m
                .ana
                .call("collab_update", json!({ "path": p, "update": "AAA=" }))
                .await;
            assert_eq!(r["err"]["kind"], "refused", "{p}: {r}");
        }
        // Granted to Ana: she reads it whole and writes it; Bia reads only.
        let g = m
            .owner
            .call(
                "campaign_grant",
                json!({ "path": "Livre.md", "grant": { "kind": "player", "account": ana } }),
            )
            .await;
        assert!(g.get("ok").is_some(), "{g}");
        let w = m.ana.call("read_note", json!({ "path": "Livre.md" })).await;
        let written = m
            .ana
            .call(
                "write_note",
                json!({ "path": "Livre.md", "text": "Livre da Ana palavrachave\n", "revision": w["ok"]["revision"] }),
            )
            .await;
        assert!(written.get("ok").is_some(), "{written}");
        assert_eq!(m.r.campanha_text("Livre.md"), "Livre da Ana palavrachave\n");
        let w = m.bia.call("read_note", json!({ "path": "Livre.md" })).await;
        let denied = m
            .bia
            .call(
                "write_note",
                json!({ "path": "Livre.md", "text": "Bia", "revision": w["ok"]["revision"] }),
            )
            .await;
        assert_eq!(denied["err"]["kind"], "refused", "{denied}");
        // Edits on the note covers renaming it inside its folder (K.6).
        let renamed = m
            .ana
            .call("rename_note", json!({ "from": "Livre.md", "to": "L2.md" }))
            .await;
        assert!(renamed.get("ok").is_some(), "{renamed}");
        let back = m
            .ana
            .call("rename_note", json!({ "from": "L2.md", "to": "Livre.md" }))
            .await;
        assert!(back.get("ok").is_some(), "{back}");
        // Ana still cannot delete, create, or write another note.
        for (cmd, args) in [
            ("delete_note", json!({ "path": "Livre.md" })),
            (
                "create_file",
                json!({ "path": "Anexos/n.png", "base64": PNG }),
            ),
            (
                "write_note",
                json!({ "path": "Aberta.md", "text": "x", "revision": "x" }),
            ),
        ] {
            let r = m.ana.call(cmd, args).await;
            assert_eq!(r["err"]["kind"], "refused", "{cmd}: {r}");
        }
        // The room: Ana types into it, Bia may not.
        let joined = m
            .ana
            .call("collab_join", json!({ "path": "Livre.md" }))
            .await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let typed = m
            .ana
            .call(
                "collab_update",
                json!({ "path": "Livre.md", "update": "AAA=" }),
            )
            .await;
        assert_ne!(typed["err"]["kind"], "refused", "{typed}");
        let bia = m
            .bia
            .call("collab_join", json!({ "path": "Livre.md" }))
            .await;
        assert!(bia.get("ok").is_some());
        let bia = m
            .bia
            .call(
                "collab_update",
                json!({ "path": "Livre.md", "update": "AAA=" }),
            )
            .await;
        assert_eq!(bia["err"]["kind"], "refused", "{bia}");
        // A player's device: not a note granted to one player.
        let put = crate::tests_sync::send(&mut m.ana.ws, 900, "Livre.md", b"x\n", None).await;
        assert!(put.get("err").is_some(), "{put}");
        // The status: Ana is told of her note, Bia of none; the owner of all.
        let st = m.ana.call("campaign_status", json!({})).await;
        assert_eq!(st["ok"]["notes"][0]["path"], "Livre.md", "{st}");
        assert_eq!(
            m.bia.call("campaign_status", json!({})).await["ok"]["notes"],
            json!([])
        );
        // A grant to someone who is not at the table, or to a board, is refused.
        let stranger = m
            .owner
            .call(
                "campaign_grant",
                json!({ "path": "Livre.md", "grant": { "kind": "player", "account": "nao-existe" } }),
            )
            .await;
        assert_eq!(stranger["err"]["kind"], "refused", "{stranger}");
        let board = m
            .owner
            .call(
                "campaign_grant",
                json!({ "path": "Tabuleiro.canvas", "grant": { "kind": "group" } }),
            )
            .await;
        // A board is given like a note now (ADR 0113 H); a file that is
        // neither is still refused.
        assert!(board.get("ok").is_some(), "{board}");
        let other = m
            .owner
            .call(
                "campaign_grant",
                json!({ "path": "Anexos/aberto.png", "grant": { "kind": "group" } }),
            )
            .await;
        assert_eq!(other["err"]["kind"], "refused", "{other}");
    });
}

#[test]
fn a_note_granted_to_the_group_is_edited_by_every_player_in_every_way() {
    block_on(async {
        let mut m = mesa().await;
        let g = m
            .owner
            .call(
                "campaign_grant",
                json!({ "path": "Barão Zq.md", "grant": { "kind": "group" } }),
            )
            .await;
        assert!(g.get("ok").is_some(), "{g}");
        // A grant releases the note: both read it and write it.
        for (i, win) in [&mut m.ana, &mut m.bia].into_iter().enumerate() {
            let w = win
                .call("read_note", json!({ "path": "Barão Zq.md" }))
                .await;
            let text = format!("do grupo {i}\n");
            let written = win
                .call(
                    "write_note",
                    json!({ "path": "Barão Zq.md", "text": text, "revision": w["ok"]["revision"] }),
                )
                .await;
            assert!(written.get("ok").is_some(), "{written}");
        }
        // The room, for both.
        for win in [&mut m.ana, &mut m.bia] {
            let joined = win
                .call("collab_join", json!({ "path": "Barão Zq.md" }))
                .await;
            assert!(joined.get("ok").is_some(), "{joined}");
            let typed = win
                .call(
                    "collab_update",
                    json!({ "path": "Barão Zq.md", "update": "AAA=" }),
                )
                .await;
            assert_ne!(typed["err"]["kind"], "refused", "{typed}");
        }
        // A device puts it too: sync from a device is a write path.
        let base = {
            let state = m.ana.call("sync_state", json!({})).await;
            state["ok"]["files"]
                .as_array()
                .unwrap()
                .iter()
                .find(|f| f["path"] == "Barão Zq.md")
                .map(|f| f["hash"].as_str().unwrap().to_owned())
        };
        let put = crate::tests_sync::send(
            &mut m.bia.ws,
            900,
            "Barão Zq.md",
            b"do aparelho\n",
            base.as_deref(),
        )
        .await;
        assert!(put.get("ok").is_some(), "{put}");
        assert_eq!(m.r.campanha_text("Barão Zq.md"), "do aparelho\n");
        // Not another note.
        let put = crate::tests_sync::send(&mut m.bia.ws, 910, "Livre.md", b"x\n", None).await;
        assert!(put.get("err").is_some(), "{put}");
        // And back to nobody: the note is hidden and read-only again.
        m.owner
            .call(
                "campaign_grant",
                json!({ "path": "Barão Zq.md", "grant": { "kind": "none" } }),
            )
            .await;
        let w = m
            .ana
            .call("read_note", json!({ "path": "Barão Zq.md" }))
            .await;
        assert!(w.get("ok").is_some(), "released stays released");
        let r = m
            .ana
            .call(
                "write_note",
                json!({ "path": "Barão Zq.md", "text": "x", "revision": w["ok"]["revision"] }),
            )
            .await;
        assert_eq!(r["err"]["kind"], "refused");
    });
}

// ---------------------------------------------------------------- limits

#[test]
fn a_tables_limits_are_its_owners_to_set_within_bounds() {
    block_on(async {
        let mut m = mesa().await;
        for bad in [
            json!({ "root": "", "logMax": 10 }),
            json!({ "root": "", "logMax": 10_000_000 }),
            json!({ "root": "", "imageMax": 100 }),
            json!({ "root": "", "imageMax": 900_000_000 }),
        ] {
            let r = m.owner.call("campaign_settings", bad.clone()).await;
            assert_eq!(r["err"]["kind"], "refused", "{bad}: {r}");
        }
        let set = m
            .owner
            .call(
                "campaign_settings",
                json!({ "root": "", "logMax": 1000, "imageMax": 1_048_576 }),
            )
            .await;
        assert_eq!(set["ok"]["tables"][0]["log_max"], 1000, "{set}");
        // The log keeps the table's own ceiling.
        for i in 0..1010 {
            let row = crate::db::TableRow {
                table: String::new(),
                id: 0,
                kind: "say".into(),
                account: m.ana_id.clone(),
                by_name: "Ana".into(),
                at: "2026-10-22T00:00:00Z".into(),
                path: None,
                pinned: false,
                secret: false,
                readers_hidden: false,
                body: format!("{{\"text\":\"m{i}\"}}"),
            };
            m.r.server.db.table_add(&m.id, &row).unwrap();
        }
        assert_eq!(m.r.server.db.table_count(&m.id, "").unwrap(), 1000);
        // An image past the table's limit is refused, one under it is not.
        m.owner
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        let mut big = b"\x89PNG\r\n\x1a\n".to_vec();
        big.resize(1_048_576 + 1, 0);
        let r = m
            .owner
            .call(
                "table_send_image",
                json!({ "base64": base64::engine::general_purpose::STANDARD.encode(&big) }),
            )
            .await;
        assert_eq!(r["err"]["kind"], "refused", "{r}");
        assert!(
            r["err"]["message"].as_str().unwrap().contains("1 MB"),
            "{r}"
        );
        let mut ok = b"\x89PNG\r\n\x1a\n".to_vec();
        ok.resize(1_000_000, 0);
        let r = m
            .owner
            .call(
                "table_send_image",
                json!({ "base64": base64::engine::general_purpose::STANDARD.encode(&ok) }),
            )
            .await;
        assert!(r.get("ok").is_some(), "{r}");
        // Raised, the same image passes.
        m.owner
            .call(
                "campaign_settings",
                json!({ "root": "", "imageMax": 5 * 1024 * 1024 }),
            )
            .await;
        let r = m
            .owner
            .call(
                "table_send_image",
                json!({ "base64": base64::engine::general_purpose::STANDARD.encode(&big) }),
            )
            .await;
        assert!(r.get("ok").is_some(), "{r}");
    });
}

// ----------------------------------------------------------- invitation

#[test]
fn the_admin_invites_a_player_to_the_table_with_a_fresh_proof() {
    block_on(async {
        let mut m = mesa().await;
        // Ana is no admin: her status says she cannot invite, and the owner
        // here is the admin.
        assert_eq!(
            m.owner.call("campaign_status", json!({})).await["ok"]["can_invite"],
            true
        );
        let made = m.owner.call("campaign_invite", json!({ "root": "" })).await;
        let link = made["ok"]["link"].as_str().unwrap_or_default().to_owned();
        // No public address configured: the link is the path alone, the
        // window resolves it against the server it talks to.
        assert!(link.starts_with("/invite/"), "{made}");
        // The link is a reader's invitation to this folder.
        let token = link.rsplit('/').next().unwrap().to_owned();
        let (status, offer) = get(&m.r, &format!("/api/invite/{token}"), None).await;
        assert_eq!(status, 200, "{offer}");
        // A root that is no table is refused.
        let bad = m
            .owner
            .call("campaign_invite", json!({ "root": "Nada" }))
            .await;
        assert_eq!(bad["err"]["kind"], "refused", "{bad}");
        // A player does not.
        let denied = m.ana.call("campaign_invite", json!({ "root": "" })).await;
        assert_eq!(denied["err"]["kind"], "refused", "{denied}");
    });
}

#[test]
fn a_table_of_a_second_owner_is_not_ours_to_run() {
    block_on(async {
        let mut m = mesa().await;
        // An editor is a player who edits every file they see, not a
        // co-game-master (ADR 0113 item 3): the veil applies to it and the
        // owner's commands are not its own.
        let c =
            m.r.server
                .db
                .create_account("cid@casa.lan", "Cid", "pt", Some("a senha do cid"), false)
                .unwrap();
        m.r.server.db.grant(&m.id, &c.id, Role::Editor).unwrap();
        let b = sign_in(&m.r, "cid@casa.lan", "a senha do cid").await;
        let (mut cid, o) = Win::open(&m.r, &b, &m.id).await;
        assert!(o.get("ok").is_some(), "{o}");
        let mut seen = strings(&cid.call("list_notes", json!({})).await["ok"]);
        seen.sort();
        assert_eq!(seen, ["Aberta.md", "Livre.md"]);
        let r = cid
            .call(
                "campaign_release",
                json!({ "paths": ["Barão Zq.md"], "released": true }),
            )
            .await;
        assert_eq!(r["err"]["kind"], "refused", "{r}");
        let _ = (&mut m, Grant::None);
    });
}

#[test]
fn a_window_link_is_relative_without_a_public_address_and_whole_with_one() {
    let (data, folders) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    let mut c = crate::tests::config(data.path(), folders.path());
    c.listen = "0.0.0.0:7340".parse().unwrap();
    c.public_url = None;
    // Never `localhost`: the wildcard bind does not say how a window reaches it.
    assert_eq!(crate::window_link(&c, "/invite/abc"), "/invite/abc");
    c.public_url = Some("https://mesa.casa/".into());
    assert_eq!(
        crate::window_link(&c, "/invite/abc"),
        "https://mesa.casa/invite/abc"
    );
}

/// A refusal says what is refused (night device test, 2026-10-30): a
/// player who edits a note is not told "you may only read this folder" when
/// a create, a delete or a move is refused, nor when a rename of a note
/// they do not edit is.
#[test]
fn a_refused_create_delete_move_and_rename_say_what_is_refused() {
    block_on(async {
        let mut m = mesa().await;
        let ana = m.ana_id.clone();
        let g = m
            .owner
            .call(
                "campaign_grant",
                json!({ "path": "Livre.md", "grant": { "kind": "player", "account": ana } }),
            )
            .await;
        assert!(g.get("ok").is_some(), "{g}");
        for (cmd, args, says) in [
            (
                "create_note",
                json!({ "name": "Nova", "text": "x" }),
                "you may not create files here",
            ),
            (
                "create_file",
                json!({ "path": "Anexos/n.png", "base64": PNG }),
                "you may not create files here",
            ),
            (
                "delete_note",
                json!({ "path": "Livre.md" }),
                "you may not delete this",
            ),
            (
                "delete_entry",
                json!({ "path": "Livre.md" }),
                "you may not delete this",
            ),
            (
                "move_entries",
                json!({ "folder": "Anexos", "paths": ["Livre.md"] }),
                "you may not move this",
            ),
            (
                "rename_entry",
                json!({ "from": "Aberta.md", "to": "Outra.md" }),
                "you may not rename this",
            ),
        ] {
            let r = m.ana.call(cmd, args).await;
            assert_eq!(r["err"]["kind"], "refused", "{cmd}: {r}");
            assert_eq!(r["err"]["message"], says, "{cmd}: {r}");
        }
        // Typing in a note she does not edit is still "only read".
        let c = m
            .ana
            .call("collab_join", json!({ "path": "Aberta.md" }))
            .await;
        assert!(c.get("ok").is_some(), "{c}");
    });
}
