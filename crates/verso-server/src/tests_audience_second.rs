// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The second review of a note's audience (ADR 0110): a table that cannot
//! be read is written from by nothing; what a player is pinged for, and
//! what its log leaves out, is decided when a change is recorded; a
//! player's own ids are the only ones it is told.
//!
//! A window's `call` drains what it was sent meanwhile, so every test that
//! asserts on what a window hears `hear`s before it calls.

use serde_json::json;

use crate::db::Role;
use crate::tests::{block_on, folder_id, sign_in, start};
use crate::tests_audience::{BARAO, release_to, told};
use crate::tests_campaign::{Mesa, Win, mesa};

async fn quiet(m: &mut Mesa) {
    m.owner.hear(150).await;
    m.ana.hear(150).await;
    m.bia.hear(150).await;
}

fn key_of(m: &Mesa, account: &str) -> (String, String) {
    let table = verso_service::lock(&m.r.server.clients);
    let client = table
        .iter()
        .find(|(_, c)| c.account == account)
        .map(|(id, _)| id.clone())
        .unwrap();
    drop(table);
    let key = m.r.server.service.folder_of(&client).unwrap();
    (client, key)
}

fn fail_reads(folder: &str, on: bool) {
    let mut f = verso_service::lock(&crate::campaign::FAIL_READS);
    f.retain(|x| x != folder);
    if on {
        f.push(folder.to_owned());
    }
}

#[test]
fn a_table_that_cannot_be_read_records_nothing_sends_no_one_out_and_settles_nothing() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        release_to(&mut m, "Mapa Zq.md", &[&ana_id]).await;
        let first = m.ana.call("sync_changes", json!({ "since": 0 })).await;
        let before_head = first["ok"]["head"].as_i64().unwrap();
        let (folder, server) = (m.id.clone(), std::sync::Arc::clone(&m.r.server));
        let log_head = server.db.head(&folder).unwrap();
        let settled = server.db.campaign_viewer(&folder, &ana_id).unwrap();
        let skips = server.db.campaign_skips_after(&folder, &ana_id, 0).unwrap();
        let (_, key) = key_of(&m, &ana_id);
        quiet(&mut m).await;
        // The tables cannot be read for a moment, and the owner edits.
        fail_reads(&folder, true);
        crate::campaign::forget(&server, &folder);
        let r = m
            .owner
            .call("read_note", json!({ "path": "Livre.md" }))
            .await;
        let w = m
            .owner
            .call(
                "write_note",
                json!({ "path": "Livre.md", "text": "novo\n", "revision": r["ok"]["revision"] }),
            )
            .await;
        assert!(w.get("ok").is_some(), "{w}");
        let (s, f, k, a) = (
            std::sync::Arc::clone(&server),
            folder.clone(),
            key.clone(),
            ana_id.clone(),
        );
        let asked = tokio::task::spawn_blocking(move || {
            crate::campaign_cmds::refresh(&s, &f, &k, &[], None);
            crate::campaign_sync::refresh_readers(&s, &f, &k, false);
            crate::campaign_sync::viewer_page(&s, (&f, &k), &a, (0, 1000))
        })
        .await
        .unwrap();
        assert!(
            asked.is_err(),
            "a log was settled on a table it could not read"
        );
        assert_eq!(
            server.db.head(&folder).unwrap(),
            log_head,
            "a change was recorded"
        );
        assert_eq!(
            server.db.campaign_viewer(&folder, &m.ana_id).unwrap(),
            settled
        );
        assert_eq!(
            server
                .db
                .campaign_skips_after(&folder, &m.ana_id, 0)
                .unwrap(),
            skips,
            "a skip was written"
        );
        let still: Vec<_> = verso_service::lock(&server.clients)
            .values()
            .filter(|c| c.account == m.ana_id)
            .map(|c| c.folder.is_some())
            .collect();
        assert_eq!(still, vec![true], "a reader was sent out");
        // Read again: the log is right, and the edit the walk finds is told.
        fail_reads(&folder, false);
        crate::campaign::forget(&server, &folder);
        let (s, f, k) = (std::sync::Arc::clone(&server), folder.clone(), key.clone());
        tokio::task::spawn_blocking(move || {
            crate::sync::reconcile(&s, &f, &k, None, &["Livre.md".to_owned()])
        })
        .await
        .unwrap()
        .unwrap();
        let log = m
            .ana
            .call("sync_changes", json!({ "since": before_head }))
            .await;
        assert!(
            told(&log).contains(&("Livre.md".to_owned(), false)),
            "after the recovery the edit is told: {log}"
        );
    });
}

#[test]
fn a_folder_with_no_table_that_cannot_be_read_keeps_its_readers() {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let a = r
            .server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        r.server.db.grant(&id, &a.id, Role::Reader).unwrap();
        let b = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let (mut ana, o) = Win::open(&r, &b, &id).await;
        assert!(o.get("ok").is_some(), "{o}");
        let key = {
            let table = verso_service::lock(&r.server.clients);
            let client = table.keys().next().cloned().unwrap();
            drop(table);
            r.server.service.folder_of(&client).unwrap()
        };
        fail_reads(&id, true);
        crate::campaign::forget(&r.server, &id);
        let (s, f, k) = (std::sync::Arc::clone(&r.server), id.clone(), key);
        tokio::task::spawn_blocking(move || crate::campaign_cmds::refresh(&s, &f, &k, &[], None))
            .await
            .unwrap();
        let heard = ana.hear(300).await;
        assert!(
            !heard.iter().any(|e| e.get("gone").is_some()),
            "a reader of a folder with no table was sent out: {heard:?}"
        );
        fail_reads(&id, false);
        crate::campaign::forget(&r.server, &id);
        let listed = ana.call("list_notes", json!({})).await;
        assert!(listed.get("ok").is_some(), "{listed}");
    });
}

async fn edit(m: &mut Mesa, path: &str, text: &str) {
    let r = m.owner.call("read_note", json!({ "path": path })).await;
    let w = m
        .owner
        .call(
            "write_note",
            json!({ "path": path, "text": text, "revision": r["ok"]["revision"] }),
        )
        .await;
    assert!(w.get("ok").is_some(), "{w}");
}

#[test]
fn what_happened_while_a_player_was_outside_a_note_is_never_counted_when_it_is_let_in() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        release_to(&mut m, BARAO, &[&ana_id]).await;
        // Bia has asked: her log is begun.
        let first = m.bia.call("sync_changes", json!({ "since": 0 })).await;
        let head = first["ok"]["head"].as_i64().unwrap();
        for i in 0..3 {
            edit(&mut m, BARAO, &format!("zqbody {i}\n")).await;
        }
        release_to(&mut m, BARAO, &[&ana_id, &bia_id]).await;
        let log = m.bia.call("sync_changes", json!({ "since": head })).await;
        let mine: Vec<_> = told(&log).into_iter().filter(|(p, _)| p == BARAO).collect();
        assert_eq!(
            mine,
            vec![(BARAO.to_owned(), false)],
            "the edits made while she was out are told or counted: {log}"
        );
        assert!(
            log["ok"]["head"].as_i64().unwrap() <= head + 2,
            "her count learns how many edits there were: {log}"
        );
    });
}

#[test]
fn what_a_failed_write_remembered_is_not_told_later_to_a_player_who_left() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        release_to(&mut m, BARAO, &[&ana_id]).await;
        // A rename onto a name that is taken: it fails, after the table
        // remembered who sees the note.
        let failed = m
            .owner
            .call("rename_note", json!({ "from": BARAO, "to": "Livre.md" }))
            .await;
        assert!(failed.get("err").is_some(), "{failed}");
        assert!(
            m.r.server
                .db
                .campaign_gone_peek(&m.id, BARAO)
                .unwrap()
                .is_empty(),
            "the failed write left who saw the note behind"
        );
        // Ana leaves the audience and is told the note went.
        release_to(&mut m, BARAO, &[&bia_id]).await;
        let head = m.ana.call("sync_changes", json!({ "since": 0 })).await["ok"]["head"]
            .as_i64()
            .unwrap();
        let gone = m.owner.call("delete_note", json!({ "path": BARAO })).await;
        assert!(gone.get("ok").is_some(), "{gone}");
        let log = m.ana.call("sync_changes", json!({ "since": head })).await;
        assert!(
            !log.to_string().contains("Bar"),
            "a player who left is told of a deletion from a time before: {log}"
        );
    });
}

#[test]
fn a_window_that_asks_to_edit_by_a_grant_taken_back_joins_as_a_reader() {
    block_on(async {
        let m = mesa().await;
        let (client, key) = key_of(&m, &m.bia_id);
        let server = std::sync::Arc::clone(&m.r.server);
        let joined = tokio::task::spawn_blocking(move || {
            crate::collab::join(&server, (&client, false), &key, "Aberta.md", "Bia")
        })
        .await
        .unwrap();
        assert!(
            joined.is_ok(),
            "a stale writer's join was refused: {joined:?}"
        );
    });
}

#[test]
fn a_player_is_told_who_else_has_access_by_name_and_never_by_account() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        release_to(&mut m, BARAO, &[&ana_id, &bia_id]).await;
        let hers = m
            .ana
            .call("campaign_access", json!({ "path": BARAO }))
            .await;
        let people = hers["ok"]["people"].as_array().unwrap();
        assert_eq!(people.len(), 2, "{hers}");
        for p in people {
            if p["you"] == true {
                assert_eq!(p["id"], ana_id.as_str());
            } else {
                assert_eq!(
                    p["id"], "",
                    "another player's account reached a player: {hers}"
                );
                assert_eq!(p["name"], "Bia");
            }
        }
        let mine = m
            .owner
            .call("campaign_access", json!({ "path": BARAO }))
            .await;
        assert!(
            mine["ok"]["people"][0]["id"]
                .as_str()
                .is_some_and(|i| !i.is_empty())
        );
    });
}

#[test]
fn a_share_counts_only_its_own_part_of_the_players_log() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        release_to(&mut m, BARAO, &[&ana_id]).await;
        edit(&mut m, "Livre.md", "outra\n").await;
        let (_, key) = key_of(&m, &ana_id);
        let (s, f, a) = (
            std::sync::Arc::clone(&m.r.server),
            m.id.clone(),
            ana_id.clone(),
        );
        let (whole, shared) = tokio::task::spawn_blocking(move || {
            (
                crate::campaign_sync::viewer_head(&s, &f, &key, &a).unwrap(),
                crate::campaign_sync::viewer_share_head(&s, (&f, &key), &a, &["Anexos"]).unwrap(),
            )
        })
        .await
        .unwrap();
        assert!(
            shared > 0 && shared < whole,
            "the share's part is {shared} of {whole}"
        );
    });
}
