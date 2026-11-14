// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A table moved to the other host (ADR 0117 D8, R9), the servers' part:
//! two hosts with the same folder, a table with players, chat and rolls on
//! the first; the move is the game master's two acts the desktop makes
//! (`app/src-tauri/src/local_server/moving.rs`): `campaign_make` on the new
//! host, then `campaign_settings` with `moved` on the old. Nothing of the
//! old host's log reaches the new one; the old table keeps its log, its
//! releases and its rights, closed to its players, who are told it moved;
//! undoing it frees it as ADR 0110 item 1 says. The desktop's part, both
//! ways between a UniVerso and this computer, is
//! `app/src-tauri/src/tests_table_move.rs`.

use serde_json::json;

use crate::tests::{block_on, folder_id, get, sign_in, start};
use crate::tests_campaign::{Win, mesa};

const MOVED: &str = verso_contract::TABLE_MOVED;

/// The words of a moved table begin with a closed table's: a window of a
/// release before R9 keeps the player out as from a closed one.
#[test]
fn a_moved_tables_words_are_a_closed_tables_too() {
    assert!(MOVED.starts_with(verso_contract::TABLE_CLOSED));
    assert_ne!(MOVED, verso_contract::TABLE_CLOSED);
}

/// The move, as the desktop makes it: the new host's table first, every
/// note hidden and no one at it; then the old one closed and marked moved.
/// The old host's chat and rolls stay on it, its releases too, and none of
/// it is on the new host.
#[test]
fn nothing_of_the_old_hosts_log_reaches_the_new_one_and_the_old_keeps_it() {
    block_on(async {
        let mut m = mesa().await;
        // At the table on the old host: a message of Ana's, a roll of the
        // owner's.
        for (ws, n) in [(&mut m.ana, 1), (&mut m.owner, 2)] {
            let joined = ws
                .call("table_join", json!({ "color": "#3b82f6", "styles": null }))
                .await;
            assert!(joined.get("ok").is_some(), "{n}: {joined}");
        }
        let said = m
            .ana
            .call("table_say", json!({ "text": "olá da mesa velha" }))
            .await;
        assert!(said.get("ok").is_some(), "{said}");
        let rolled = m
            .owner
            .call(
                "table_roll",
                json!({ "notation": "1d20", "source": null, "path": null, "secret": null, "styles": null }),
            )
            .await;
        assert!(rolled.get("ok").is_some(), "{rolled}");
        let kept = m.r.server.db.table_count(&m.id, "").unwrap();
        assert!(kept >= 2, "{kept}");

        // The new host: the same folder (its files come by the sync), the
        // table made there.
        let n = start().await;
        let admin = sign_in(&n, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&n, &admin).await;
        let (mut there, _) = Win::open(&n, &admin, &id).await;
        for name in ["Aberta", "Livre"] {
            let made = there
                .call("create_note", json!({ "name": name, "text": "# nota\n" }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let made = there.call("campaign_make", json!({ "root": "" })).await;
        assert_eq!(made["ok"]["tables"][0]["open"], true, "{made}");
        assert_eq!(made["ok"]["tables"][0]["moved"], false, "{made}");
        // Every note hidden, nobody at it: no audience carried.
        assert_eq!(made["ok"]["notes"], json!([]), "{made}");
        assert_eq!(made["ok"]["players"], json!([]), "{made}");

        // The old host: closed and marked moved, in one command.
        let shut = m
            .owner
            .call(
                "campaign_settings",
                json!({ "root": "", "open": false, "moved": true }),
            )
            .await;
        assert_eq!(shut["ok"]["tables"][0]["open"], false, "{shut}");
        assert_eq!(shut["ok"]["tables"][0]["moved"], true, "{shut}");

        // Nothing of the old log on the new host, at its table or in its
        // database.
        assert_eq!(n.server.db.table_count(&id, "").unwrap(), 0);
        let joined = there
            .call("table_join", json!({ "color": "#3b82f6", "styles": null }))
            .await;
        assert_eq!(joined["ok"]["entries"], json!([]), "{joined}");
        let history = there
            .call("table_history", json!({ "before": null, "limit": 200 }))
            .await;
        let text = history.to_string();
        assert!(!text.contains("olá da mesa velha"), "{text}");

        // The old host keeps its log, its releases and its notes' state.
        assert_eq!(m.r.server.db.table_count(&m.id, "").unwrap(), kept);
        let (mut again, _) = Win::open(&m.r, &m.admin, &m.id).await;
        let back = again
            .call("table_join", json!({ "color": "#3b82f6", "styles": null }))
            .await;
        assert!(
            back["ok"]["entries"]
                .to_string()
                .contains("olá da mesa velha"),
            "{back}"
        );
        let status = again.call("campaign_status", json!({})).await;
        let released: Vec<&str> = status["ok"]["notes"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|n| n["released"] == true)
            .filter_map(|n| n["path"].as_str())
            .collect();
        assert_eq!(released, ["Aberta.md", "Livre.md"], "{status}");
        assert_eq!(status["ok"]["tables"][0]["moved"], true);
    });
}

/// A player of the moved table is sent out and told it moved, at every
/// door: the window inside, the folder opened again, a command, the files.
/// The owner always enters; the table does not open again here.
#[test]
fn a_player_of_a_moved_table_is_told_it_moved_and_it_stays_shut() {
    block_on(async {
        let mut m = mesa().await;
        let shut = m
            .owner
            .call(
                "campaign_settings",
                json!({ "root": "", "open": false, "moved": true }),
            )
            .await;
        assert_eq!(shut["ok"]["tables"][0]["moved"], true, "{shut}");
        // The player inside is sent out, told why.
        let gone = m.ana.listen(300).await;
        assert!(
            gone.iter()
                .any(|e| e["gone"] == "folder" && e["reason"] == "moved"),
            "{gone:?}"
        );
        let refused = m.ana.call("list_notes", json!({})).await;
        assert!(refused.get("err").is_some(), "{refused}");
        // Opening it again: the table moved.
        let b = sign_in(&m.r, "ana@casa.lan", "a senha da ana").await;
        let (_, opened) = Win::open(&m.r, &b, &m.id).await;
        assert_eq!(opened["err"]["message"], MOVED, "{opened}");
        let (status, _) = get(&m.r, &format!("/f/{}/Aberta.md", m.id), Some(&b)).await;
        assert_eq!(status, 403);
        // The owner enters; the switch does not open it again, and the move
        // is not undone but by undoing the table.
        assert!(
            m.owner
                .call("list_notes", json!({}))
                .await
                .get("ok")
                .is_some()
        );
        let open = m
            .owner
            .call("campaign_settings", json!({ "root": "", "open": true }))
            .await;
        assert_eq!(open["err"]["kind"], "refused", "{open}");
        let back = m
            .owner
            .call("campaign_settings", json!({ "root": "", "moved": false }))
            .await;
        assert_eq!(back["err"]["kind"], "refused", "{back}");
        // A limit still changes, and leaves it moved and closed.
        let limit = m
            .owner
            .call("campaign_settings", json!({ "root": "", "logMax": 5000 }))
            .await;
        assert_eq!(limit["ok"]["tables"][0]["moved"], true, "{limit}");
        assert_eq!(limit["ok"]["tables"][0]["open"], false, "{limit}");
        // Making it again here changes nothing (the desktop's move may run
        // twice): still moved.
        let again = m.owner.call("campaign_make", json!({ "root": "" })).await;
        assert_eq!(again["ok"]["tables"][0]["moved"], true, "{again}");
        // A player runs none of it.
        let (mut ana, _) = Win::open(&m.r, &b, &m.id).await;
        let tried = ana
            .call(
                "campaign_settings",
                json!({ "root": "", "open": false, "moved": true }),
            )
            .await;
        assert!(tried.get("err").is_some(), "{tried}");
    });
}

/// What an old player reaches of `id` on `r` with a fresh sign-in: every
/// door answers nothing.
async fn reaches_nothing(r: &crate::tests::Running, email: &str, password: &str, id: &str) {
    let b = sign_in(r, email, password).await;
    let (mut w, opened) = Win::open(r, &b, id).await;
    assert!(opened.get("err").is_some(), "{email} opened it: {opened}");
    for (cmd, args) in [
        ("list_notes", json!({})),
        ("read_note", json!({ "path": "Aberta.md" })),
        ("read_note", json!({ "path": "Barão Zq.md" })),
        ("list_files", json!({})),
    ] {
        let tried = w.call(cmd, args).await;
        assert!(tried.get("ok").is_none(), "{email}: {cmd}: {tried}");
    }
    for path in ["Aberta.md", "Anexos/aberto.png", "Anexos/zqfechado.png"] {
        let (status, _) = get(r, &format!("/f/{id}/{path}"), Some(&b)).await;
        assert!(
            status == 403 || status == 404,
            "{email}: /f/{path}: {status}"
        );
    }
    let (status, listed) = get(r, "/api/folders", Some(&b)).await;
    assert_eq!(status, 200);
    assert!(
        !listed.to_string().contains(id),
        "{email} still lists it: {listed}"
    );
}

/// Undoing the moved table frees it (ADR 0110 item 1) and, because it
/// moved, takes with it what it gave its players (ADR 0117 R9, the review
/// of 2026-11-14): a table of the whole folder takes the folder's readers'
/// places, so no old player reaches anything of the folder on the old host
/// — not the notes the table hid from them, not those it had released.
/// The owner stays; the log is the folder's own (kept, as any undone
/// table's); a pending invitation into the table ends; a table made there
/// again starts open, not moved, with no players.
#[test]
fn undoing_a_moved_table_takes_its_players_places_with_it() {
    block_on(async {
        let mut m = mesa().await;
        let joined = m
            .ana
            .call("table_join", json!({ "color": "#3b82f6", "styles": null }))
            .await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let said = m.ana.call("table_say", json!({ "text": "antes" })).await;
        assert!(said.get("ok").is_some(), "{said}");
        let kept = m.r.server.db.table_count(&m.id, "").unwrap();
        let admin = m.r.server.db.members(&m.id).unwrap();
        let owner = admin
            .iter()
            .find(|(_, r)| *r == crate::db::Role::Owner)
            .map(|(a, _)| a.id.clone())
            .unwrap();
        let (_, pending) =
            m.r.server
                .db
                .create_invitation(&crate::db::NewLink {
                    kind: "invite",
                    email: None,
                    account: None,
                    folder: Some(&m.id),
                    role: Some(crate::db::Role::Reader),
                    created_by: Some(&owner),
                    life: 3600,
                    share: None,
                })
                .unwrap();
        m.owner
            .call(
                "campaign_settings",
                json!({ "root": "", "open": false, "moved": true }),
            )
            .await;
        let undone = m.owner.call("campaign_unmake", json!({ "root": "" })).await;
        assert_eq!(undone["ok"]["viewer"], "none", "{undone}");
        assert_eq!(undone["ok"]["tables"], json!([]), "{undone}");
        assert!(m.r.server.db.campaigns_of(&m.id).unwrap().is_empty());
        // The old players reach nothing of the folder here.
        reaches_nothing(&m.r, "ana@casa.lan", "a senha da ana", &m.id).await;
        reaches_nothing(&m.r, "bia@casa.lan", "a senha da bia", &m.id).await;
        assert_eq!(m.r.server.db.role(&m.id, &m.ana_id).unwrap(), None);
        // The window Bia had open is told her place went.
        let heard = m.bia.hear(300).await;
        assert!(
            heard
                .iter()
                .any(|e| e.get("gone").is_some() || e.get("role").is_some()),
            "{heard:?}"
        );
        // The owner keeps the folder whole; the log is the folder's own.
        let (mut again, o) = Win::open(&m.r, &m.admin, &m.id).await;
        assert!(o.get("ok").is_some(), "{o}");
        assert!(
            again.call("list_notes", json!({})).await["ok"]
                .to_string()
                .contains("Barão Zq.md")
        );
        assert_eq!(m.r.server.db.table_count(&m.id, "").unwrap(), kept);
        // The pending invitation into the table ended, in the audit.
        let audit = m.r.server.db.audit_log(Some(&m.id), 200).unwrap();
        let text = serde_json::to_string(&audit).unwrap();
        assert!(text.contains("table_moved_revoke"), "{text}");
        assert!(text.contains(&pending.id), "{text}");
        let ended: Option<i64> =
            m.r.server
                .db
                .invitation(&pending.id)
                .unwrap()
                .and_then(|i| i.ended);
        assert!(ended.is_some(), "the pending invitation still stands");
        // Made a table again: open, not moved, nobody at it.
        let made = again.call("campaign_make", json!({ "root": "" })).await;
        assert_eq!(made["ok"]["tables"][0]["open"], true, "{made}");
        assert_eq!(made["ok"]["tables"][0]["moved"], false, "{made}");
        assert_eq!(made["ok"]["players"], json!([]), "{made}");
    });
}

/// A moved table of a subfolder takes the places at it and inside it — the
/// share its invitation made — and leaves the places beside it, and above
/// it, as they are: a share of another folder made outside the table, and
/// the folder's own readers.
#[test]
fn undoing_a_moved_subfolder_table_keeps_the_places_made_outside_it() {
    block_on(async {
        let m = mesa().await;
        let db = &m.r.server.db;
        // The whole-folder table goes; a table of "Mundo Zq" is made.
        let mut owner = m.owner;
        owner.call("campaign_unmake", json!({ "root": "" })).await;
        let made = owner
            .call("campaign_make", json!({ "root": "Mundo Zq" }))
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let person = |email: &str, name: &str, password: &str| {
            db.create_account(email, name, "pt", Some(password), false)
                .unwrap()
                .id
        };
        let cid = person("cid@casa.lan", "Cid", "a senha do cid");
        let dan = person("dan@casa.lan", "Dan", "a senha do dan");
        // Cid plays through the table's own share; Dan has a share of
        // "Anexos", beside the table, made outside it.
        let table_share = db.make_share(&m.id, "Mundo Zq").unwrap();
        db.grant_share(&table_share.id, &cid, crate::db::Role::Reader)
            .unwrap();
        let beside = db.make_share(&m.id, "Anexos").unwrap();
        db.grant_share(&beside.id, &dan, crate::db::Role::Reader)
            .unwrap();
        owner
            .call(
                "campaign_settings",
                json!({ "root": "Mundo Zq", "open": false, "moved": true }),
            )
            .await;
        let undone = owner
            .call("campaign_unmake", json!({ "root": "Mundo Zq" }))
            .await;
        assert!(undone.get("ok").is_some(), "{undone}");
        // Cid's place went with the table: nothing of the share opens.
        assert_eq!(db.share_role(&table_share.id, &cid).unwrap(), None);
        let b = sign_in(&m.r, "cid@casa.lan", "a senha do cid").await;
        let (_, opened) = Win::open(&m.r, &b, &table_share.id).await;
        assert!(opened.get("err").is_some(), "{opened}");
        let (status, _) = get(
            &m.r,
            &format!("/f/{}/Mundo Zq/Cripta Zq.md", m.id),
            Some(&b),
        )
        .await;
        assert!(status == 403 || status == 404, "{status}");
        // Dan keeps the share made beside it.
        assert_eq!(
            db.share_role(&beside.id, &dan).unwrap(),
            Some(crate::db::Role::Reader)
        );
        let b = sign_in(&m.r, "dan@casa.lan", "a senha do dan").await;
        let (_, opened) = Win::open(&m.r, &b, &beside.id).await;
        assert!(opened.get("ok").is_some(), "{opened}");
        // The folder's readers, whose place is above the table, keep it.
        assert_eq!(
            db.role(&m.id, &m.ana_id).unwrap(),
            Some(crate::db::Role::Reader)
        );
    });
}

/// A moved table rooted in a folder that goes into the bin and comes back
/// is still moved (schema 23 keeps it with the binned table).
#[test]
fn a_moved_table_binned_and_restored_is_still_moved() {
    let db = crate::db::Db::memory().unwrap();
    let owner = db
        .create_account("dono@casa.lan", "Dono", "pt", Some("uma senha longa"), true)
        .unwrap();
    let folder = db.create_folder("f", &owner.id).unwrap();
    assert!(db.campaign_make(&folder.id, "Cripta").unwrap());
    assert!(db.campaign_moved(&folder.id, "Cripta").unwrap());
    db.campaign_binned(&folder.id, "Cripta", ".trash/1/Cripta")
        .unwrap();
    assert!(db.campaigns_of(&folder.id).unwrap().is_empty());
    db.campaign_restored(&folder.id, ".trash/1/Cripta", "Cripta")
        .unwrap();
    let tables = db.campaigns_of(&folder.id).unwrap();
    assert_eq!(tables.len(), 1);
    assert!(tables[0].moved && !tables[0].open, "{tables:?}");
}
