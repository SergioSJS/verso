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
            crate::campaign_sync::viewer_page(&s, (&f, &k), (&a, true), (0, 1000))
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

#[test]
fn a_new_player_begins_at_the_head_with_the_last_change_of_what_it_sees() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        release_to(&mut m, BARAO, &[&ana_id]).await;
        // Drafts, while the note is Ana's alone.
        for i in 0..3 {
            edit(&mut m, BARAO, &format!("zqbody {i}\n")).await;
        }
        // Caio's account is made after them, and the note becomes his too.
        let caio =
            m.r.server
                .db
                .create_account(
                    "caio@casa.lan",
                    "Caio",
                    "pt",
                    Some("a senha do caio"),
                    false,
                )
                .unwrap();
        m.r.server.db.grant(&m.id, &caio.id, Role::Reader).unwrap();
        let b = sign_in(&m.r, "caio@casa.lan", "a senha do caio").await;
        let (mut cw, o) = Win::open(&m.r, &b, &m.id).await;
        assert!(o.get("ok").is_some(), "{o}");
        release_to(&mut m, BARAO, &[&ana_id, &caio.id]).await;
        let log = cw.call("sync_changes", json!({ "since": 0 })).await;
        let barao = told(&log).into_iter().filter(|(p, _)| p == BARAO).count();
        // The note's row from before the table (everyone's), and its last
        // change; not the drafts between.
        assert!(
            barao <= 2,
            "a player first asking is told every draft made before it saw the note: {log}"
        );
    });
}

#[test]
fn a_player_let_in_again_does_not_count_what_happened_while_it_was_out() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        release_to(&mut m, BARAO, &[&ana_id]).await;
        let before = m.bia.call("sync_changes", json!({ "since": 0 })).await["ok"]["head"]
            .as_i64()
            .unwrap();
        // Bia is taken out of the table.
        m.r.server.db.revoke(&m.id, &bia_id).unwrap();
        for i in 0..3 {
            edit(&mut m, BARAO, &format!("zqbody {i}\n")).await;
            edit(&mut m, "Aberta.md", &format!("Aberta {i}\n")).await;
        }
        // And let in again.
        m.r.server.db.grant(&m.id, &bia_id, Role::Reader).unwrap();
        let log = m.bia.call("sync_changes", json!({ "since": 0 })).await;
        let after = log["ok"]["head"].as_i64().unwrap();
        assert!(
            after <= before + 1,
            "her count learns {} changes made while she was out: {log}",
            after - before
        );
        assert!(!log.to_string().contains("Bar"), "{log}");
    });
}

#[test]
fn a_change_that_lands_while_a_players_files_are_made_is_not_skipped_by_its_device() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        release_to(&mut m, "Mapa Zq.md", &[&ana_id]).await;
        // Her log is begun.
        since(&mut m.ana, 0).await;
        let (server, folder) = (std::sync::Arc::clone(&m.r.server), m.id.clone());
        // A change is recorded the moment her files have been made.
        let f = folder.clone();
        verso_service::lock(&crate::campaign_sync::BETWEEN).push((
            folder.clone(),
            Box::new(move || {
                server
                    .db
                    .record(
                        &f,
                        (None, None),
                        &[(
                            "Livre.md".to_owned(),
                            Some(("ffff".to_owned(), 3, "3:99".to_owned())),
                            None,
                        )],
                        &[],
                        (&crate::db::ReaderOf::new(), &[]),
                    )
                    .unwrap();
            }),
        ));
        // `viewer_files` caches by head, so make the head move first.
        edit(&mut m, "Livre.md", "uma edicao\n").await;
        let state = m.ana.call("sync_state", json!({})).await;
        let head = state["ok"]["head"].as_i64().unwrap();
        let log = m.ana.call("sync_changes", json!({ "since": head })).await;
        assert!(
            told(&log).contains(&("Livre.md".to_owned(), false)),
            "the change recorded while the files were made is counted in the head and skipped: {state} {log}"
        );
    });
}

async fn since(w: &mut Win, head: i64) -> serde_json::Value {
    w.call("sync_changes", json!({ "since": head })).await
}

#[test]
fn making_the_first_table_over_existing_files_tells_the_readers_there_were_they_went_and_takes_no_row_back()
 {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (mut owner, _) = Win::open(&r, &admin, &id).await;
        let a = r
            .server
            .db
            .create_account("ana@casa.lan", "Ana", "pt", Some("a senha da ana"), false)
            .unwrap();
        r.server.db.grant(&id, &a.id, Role::Reader).unwrap();
        let b = sign_in(&r, "ana@casa.lan", "a senha da ana").await;
        let (mut ana, _) = Win::open(&r, &b, &id).await;
        // Her device has synced the folder as it is.
        let first = ana.call("sync_changes", json!({ "since": 0 })).await;
        let head = first["ok"]["head"].as_i64().unwrap();
        assert!(head > 0, "{first}");
        let made = owner.call("campaign_make", json!({ "root": "" })).await;
        assert!(made.get("ok").is_some(), "{made}");
        // Nothing left her count, and she is told the notes the table hides
        // are gone: a hidden note does not exist for a player.
        let again = ana.call("sync_changes", json!({ "since": 0 })).await;
        assert!(
            again["ok"]["head"].as_i64().unwrap() >= head,
            "a row left the readers' count: {first} then {again}"
        );
        let after = ana.call("sync_changes", json!({ "since": head })).await;
        assert!(
            told(&after).contains(&("Sessao.md".to_owned(), true)),
            "a reader who had the file is not told it went: {after}"
        );
        // A reader who comes after is told nothing of what was never hers.
        let c = r
            .server
            .db
            .create_account(
                "cleo@casa.lan",
                "Cleo",
                "pt",
                Some("a senha da cleo"),
                false,
            )
            .unwrap();
        r.server.db.grant(&id, &c.id, Role::Reader).unwrap();
        let b = sign_in(&r, "cleo@casa.lan", "a senha da cleo").await;
        let (mut cleo, _) = Win::open(&r, &b, &id).await;
        let log = cleo.call("sync_changes", json!({ "since": 0 })).await;
        assert!(!log.to_string().contains("Sessao"), "{log}");
    });
}

#[test]
fn an_audience_changed_while_the_table_cannot_be_read_closes_the_rooms_and_is_told_once_it_can() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        let _doc = crate::tests_audience_review::room_with_a_writer(&mut m).await;
        let ana_head = since(&mut m.ana, 0).await["ok"]["head"].as_i64().unwrap();
        let (server, folder) = (std::sync::Arc::clone(&m.r.server), m.id.clone());
        let (_, key) = key_of(&m, &ana_id);
        let before = crate::campaign::veil_of(&server, &folder);
        let head = server.db.head(&folder).unwrap();
        m.ana.hear(200).await;
        // The game master's write is committed; then the table cannot be read.
        let set: std::collections::BTreeSet<String> = [bia_id.clone()].into_iter().collect();
        server
            .db
            .campaign_audience(
                &folder,
                &[BARAO.to_owned()],
                &crate::db::Audience::Players(set),
            )
            .unwrap();
        let ev = crate::campaign_cmds::Event {
            path: BARAO.to_owned(),
            lost: vec![ana_id.clone()],
            gained: vec![bia_id.clone()],
            restricted: true,
        };
        fail_reads(&folder, true);
        crate::campaign::forget(&server, &folder);
        let (s, f, k, b) = (std::sync::Arc::clone(&server), folder.clone(), key, before);
        tokio::task::spawn_blocking(move || {
            crate::campaign_cmds::refresh(&s, &f, &k, &[BARAO.to_owned()], b.clone());
            crate::campaign_sync::audience_events(&s, &f, &k, &[ev], b);
        })
        .await
        .unwrap();
        let heard = m.ana.hear(400).await;
        assert!(
            heard.iter().any(|e| e["event"] == "collab-closed"),
            "a writer by a grant that is gone stays in the room: {heard:?}"
        );
        assert_eq!(
            server.db.head(&folder).unwrap(),
            head,
            "recorded from a table it could not read"
        );
        // Readable again: the audience's log entries are made.
        fail_reads(&folder, false);
        crate::campaign::forget(&server, &folder);
        let s = std::sync::Arc::clone(&server);
        let f = folder.clone();
        tokio::task::spawn_blocking(move || crate::campaign_sync::replay_pending(&s, &f))
            .await
            .unwrap();
        assert!(
            server.db.head(&folder).unwrap() > head,
            "the audience change was dropped"
        );
        let log = since(&mut m.ana, ana_head).await;
        assert!(
            told(&log).contains(&(BARAO.to_owned(), true)),
            "the player who lost the note is not told it went: {log}"
        );
    });
}

#[test]
fn a_change_whose_skip_rows_cannot_be_made_is_not_recorded() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        release_to(&mut m, "Mapa Zq.md", &[&ana_id]).await;
        let (server, folder) = (std::sync::Arc::clone(&m.r.server), m.id.clone());
        let (_, key) = key_of(&m, &ana_id);
        fail_reads(&folder, true);
        crate::campaign::forget(&server, &folder);
        let (s, f) = (std::sync::Arc::clone(&server), folder.clone());
        let changes = vec![(
            "Aberta.md".to_owned(),
            Some(("aa".to_owned(), 1, "1:1".to_owned())),
            None,
        )];
        let mut notices = crate::db::Notices::new();
        let r = tokio::task::spawn_blocking(move || {
            crate::campaign_sync::unseen_notices(&s, (&f, &key), &changes, &mut notices)
        })
        .await
        .unwrap();
        fail_reads(&folder, false);
        assert!(
            r.is_err(),
            "no skip rows were made and the change would be recorded"
        );
    });
}

#[test]
fn a_room_saving_while_something_waits_for_the_table_does_not_hang() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        let mine = m.owner.call("collab_join", json!({ "path": BARAO })).await;
        let doc = crate::tests_audience_review::doc_of(&mine["ok"]);
        let update = crate::tests_audience_review::typed(&doc, "mais\n");
        m.owner
            .call("collab_update", json!({ "path": BARAO, "update": update }))
            .await;
        let (server, folder) = (std::sync::Arc::clone(&m.r.server), m.id.clone());
        let (_, key) = key_of(&m, &ana_id);
        // A refresh waits for the table.
        fail_reads(&folder, true);
        crate::campaign::forget(&server, &folder);
        let (s, f, k) = (std::sync::Arc::clone(&server), folder.clone(), key.clone());
        tokio::task::spawn_blocking(move || {
            crate::campaign_cmds::refresh(&s, &f, &k, &[BARAO.to_owned()], None);
        })
        .await
        .unwrap();
        fail_reads(&folder, false);
        crate::campaign::forget(&server, &folder);
        // The room saves, holding its lock: recording the change must not
        // take the rooms' locks.
        let (s, k) = (std::sync::Arc::clone(&server), key);
        let (tx, rx) = std::sync::mpsc::channel();
        // A thread of its own: a save that hangs fails the test, it does not
        // hold the runtime.
        std::thread::spawn(move || {
            let _ = tx.send(crate::collab::save(&s, &k, BARAO).is_ok());
        });
        let saved = rx.recv_timeout(std::time::Duration::from_secs(20));
        assert_eq!(
            saved,
            Ok(true),
            "the room's save hangs on what waits for the table"
        );
    });
}

#[test]
fn an_audience_that_waited_while_the_table_moved_on_is_told_as_it_is_now() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        release_to(&mut m, BARAO, &[&ana_id]).await;
        let ana_head = since(&mut m.ana, 0).await["ok"]["head"].as_i64().unwrap();
        let (server, folder) = (std::sync::Arc::clone(&m.r.server), m.id.clone());
        let (_, key) = key_of(&m, &ana_id);
        let before = crate::campaign::veil_of(&server, &folder);
        let players = |who: &str| -> crate::db::Audience {
            crate::db::Audience::Players([who.to_owned()].into_iter().collect())
        };
        // Ana loses the note to Bia, and the telling waits for the table.
        server
            .db
            .campaign_audience(&folder, &[BARAO.to_owned()], &players(&bia_id))
            .unwrap();
        let ev = crate::campaign_cmds::Event {
            path: BARAO.to_owned(),
            lost: vec![ana_id.clone()],
            gained: vec![bia_id.clone()],
            restricted: true,
        };
        fail_reads(&folder, true);
        crate::campaign::forget(&server, &folder);
        let (s, f, k) = (std::sync::Arc::clone(&server), folder.clone(), key.clone());
        tokio::task::spawn_blocking(move || {
            crate::campaign_sync::audience_events(&s, &f, &k, &[ev], before);
        })
        .await
        .unwrap();
        // Meanwhile it is Ana's again.
        server
            .db
            .campaign_audience(&folder, &[BARAO.to_owned()], &players(&ana_id))
            .unwrap();
        fail_reads(&folder, false);
        crate::campaign::forget(&server, &folder);
        let (s, f) = (std::sync::Arc::clone(&server), folder.clone());
        tokio::task::spawn_blocking(move || crate::campaign_sync::replay_pending(&s, &f))
            .await
            .unwrap();
        let log = since(&mut m.ana, ana_head).await;
        assert!(
            !told(&log).contains(&(BARAO.to_owned(), true)),
            "Ana, who has the note, is told it went: {log}"
        );
        let bia = since(&mut m.bia, 0).await;
        assert!(
            !bia.to_string().contains("Bar"),
            "Bia, who never had it: {bia}"
        );
    });
}

#[test]
fn what_waited_for_a_table_that_was_undone_is_dropped() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        release_to(&mut m, BARAO, &[&ana_id]).await;
        let (server, folder) = (std::sync::Arc::clone(&m.r.server), m.id.clone());
        let (_, key) = key_of(&m, &ana_id);
        let ev = crate::campaign_cmds::Event {
            path: BARAO.to_owned(),
            lost: vec![ana_id],
            gained: vec![bia_id],
            restricted: true,
        };
        fail_reads(&folder, true);
        crate::campaign::forget(&server, &folder);
        let (s, f, k) = (std::sync::Arc::clone(&server), folder.clone(), key);
        tokio::task::spawn_blocking(move || {
            crate::campaign_sync::audience_events(&s, &f, &k, &[ev], None);
        })
        .await
        .unwrap();
        fail_reads(&folder, false);
        server.db.campaign_drop(&folder, "").unwrap();
        crate::campaign::forget(&server, &folder);
        let head = server.db.head(&folder).unwrap();
        let (s, f) = (std::sync::Arc::clone(&server), folder.clone());
        tokio::task::spawn_blocking(move || crate::campaign_sync::replay_pending(&s, &f))
            .await
            .unwrap();
        assert_eq!(
            server.db.head(&folder).unwrap(),
            head,
            "recorded in a folder with no table"
        );
        assert_eq!(server.campaigns.pending_len(&folder), 0);
    });
}

#[test]
fn a_share_taken_away_forgets_its_people_who_read_the_folder_by_no_other_way() {
    block_on(async {
        let m = mesa().await;
        let dora =
            m.r.server
                .db
                .create_account(
                    "dora@casa.lan",
                    "Dora",
                    "pt",
                    Some("a senha da dora"),
                    false,
                )
                .unwrap();
        let share = m.r.server.db.make_share(&m.id, "Mundo Zq").unwrap();
        m.r.server
            .db
            .grant_share(&share.id, &dora.id, Role::Reader)
            .unwrap();
        m.r.server
            .db
            .campaign_settle(&m.id, &dora.id, 5, &[])
            .unwrap();
        // Ana reads the folder by its grant and keeps hers.
        m.r.server
            .db
            .campaign_settle(&m.id, &m.ana_id, 5, &[])
            .unwrap();
        m.r.server.db.delete_share(&share.id).unwrap();
        assert_eq!(
            m.r.server.db.campaign_viewer(&m.id, &dora.id).unwrap(),
            None
        );
        assert_eq!(
            m.r.server.db.campaign_viewer(&m.id, &m.ana_id).unwrap(),
            Some(5)
        );
    });
}

#[test]
fn what_waits_past_the_bound_is_made_one_not_let_go() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        release_to(&mut m, BARAO, &[&ana_id]).await;
        let ana_head = since(&mut m.ana, 0).await["ok"]["head"].as_i64().unwrap();
        let (server, folder) = (std::sync::Arc::clone(&m.r.server), m.id.clone());
        let (_, key) = key_of(&m, &ana_id);
        // Ana loses the note; the telling is the oldest of many that wait.
        let set: std::collections::BTreeSet<String> = [bia_id.clone()].into_iter().collect();
        server
            .db
            .campaign_audience(
                &folder,
                &[BARAO.to_owned()],
                &crate::db::Audience::Players(set),
            )
            .unwrap();
        crate::campaign::forget(&server, &folder);
        let entry = |path: &str, lost: Vec<String>| crate::campaign::Pending::Audience {
            key: key.clone(),
            events: vec![crate::campaign_cmds::Event {
                path: path.to_owned(),
                lost,
                gained: Vec::new(),
                restricted: true,
            }],
            before: None,
            at: 0,
        };
        server
            .campaigns
            .defer(&folder, entry(BARAO, vec![ana_id.clone()]));
        for i in 0..70 {
            server
                .campaigns
                .defer(&folder, entry(&format!("x{i}.md"), Vec::new()));
        }
        assert!(server.campaigns.pending_len(&folder) <= 64);
        let (s, f) = (std::sync::Arc::clone(&server), folder.clone());
        tokio::task::spawn_blocking(move || crate::campaign_sync::replay_pending(&s, &f))
            .await
            .unwrap();
        let log = since(&mut m.ana, ana_head).await;
        assert!(
            told(&log).contains(&(BARAO.to_owned(), true)),
            "the oldest waiting change was let go and Ana keeps the note: {log}"
        );
    });
}

#[test]
fn an_audience_derived_again_still_tells_the_notes_that_link_it() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        let ana_head = since(&mut m.ana, 0).await["ok"]["head"].as_i64().unwrap();
        let bia_head = since(&mut m.bia, 0).await["ok"]["head"].as_i64().unwrap();
        let (server, folder) = (std::sync::Arc::clone(&m.r.server), m.id.clone());
        let (_, key) = key_of(&m, &ana_id);
        let before = crate::campaign::veil_of(&server, &folder);
        // The note becomes Ana's; the telling waits and is stale when it comes.
        let set: std::collections::BTreeSet<String> = [ana_id.clone()].into_iter().collect();
        server
            .db
            .campaign_audience(
                &folder,
                &[BARAO.to_owned()],
                &crate::db::Audience::Players(set),
            )
            .unwrap();
        crate::campaign::forget(&server, &folder);
        server.campaigns.defer(
            &folder,
            crate::campaign::Pending::Audience {
                key,
                events: vec![crate::campaign_cmds::Event {
                    path: BARAO.to_owned(),
                    lost: Vec::new(),
                    gained: vec![ana_id],
                    restricted: true,
                }],
                before,
                at: 0,
            },
        );
        let (s, f) = (std::sync::Arc::clone(&server), folder.clone());
        tokio::task::spawn_blocking(move || crate::campaign_sync::replay_pending(&s, &f))
            .await
            .unwrap();
        let _ = bia_id;
        // Aberta links the note: its link is open for Ana now.
        let ana = since(&mut m.ana, ana_head).await;
        assert!(
            told(&ana).contains(&("Aberta.md".to_owned(), false)),
            "the note that links it is not told to Ana: {ana}"
        );
        let bia = since(&mut m.bia, bia_head).await;
        assert!(!bia.to_string().contains("Aberta"), "{bia}");
    });
}

#[test]
fn players_synced_before_the_table_are_told_what_it_hides_and_a_later_release_tells_the_others_nothing()
 {
    block_on(async {
        let r = start().await;
        let admin = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &admin).await;
        let (mut owner, _) = Win::open(&r, &admin, &id).await;
        for (name, text) in [("Livre", "livre\n"), ("Barão Zq", "zqbody\n")] {
            let made = owner
                .call("create_note", json!({ "name": name, "text": text }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        owner.call("reindex", json!({})).await;
        // Two readers, who have synced the folder as it is.
        let mut players = Vec::new();
        for (email, name) in [("ana@casa.lan", "Ana"), ("bia@casa.lan", "Bia")] {
            let a = r
                .server
                .db
                .create_account(email, name, "pt", Some("uma senha longa"), false)
                .unwrap();
            r.server.db.grant(&id, &a.id, Role::Reader).unwrap();
            let b = sign_in(&r, email, "uma senha longa").await;
            let (mut w, o) = Win::open(&r, &b, &id).await;
            assert!(o.get("ok").is_some(), "{o}");
            let head = since(&mut w, 0).await["ok"]["head"].as_i64().unwrap();
            players.push((a.id, w, head));
        }
        // The folder becomes a table: Livre is released, the rest is hidden.
        let made = owner.call("campaign_make", json!({ "root": "" })).await;
        assert!(made.get("ok").is_some(), "{made}");
        let rel = owner
            .call(
                "campaign_release",
                json!({ "paths": ["Livre.md"], "released": true }),
            )
            .await;
        assert!(rel.get("ok").is_some(), "{rel}");
        for (_, w, head) in players.iter_mut() {
            let log = since(w, *head).await;
            for gone in ["Barão Zq.md", "Sessao.md"] {
                assert!(
                    told(&log).contains(&(gone.to_owned(), true)),
                    "a reader who had {gone} is not told it went: {log}"
                );
            }
            *head = log["ok"]["head"].as_i64().unwrap();
        }
        // A note is released to Ana alone: Bia is told nothing, and her count stays.
        let ana_id = players[0].0.clone();
        let rel = owner
            .call(
                "campaign_audience",
                json!({ "paths": ["Barão Zq.md"], "audience": { "kind": "players", "accounts": [ana_id] } }),
            )
            .await;
        assert!(rel.get("ok").is_some(), "{rel}");
        let (_, bia, bia_head) = &mut players[1];
        let heard = bia.hear(500).await;
        assert!(
            !heard.iter().any(|e| e["event"] == "sync-changed"),
            "Bia is pinged by a release she is not in: {heard:?}"
        );
        assert!(!format!("{heard:?}").contains("Bar"), "{heard:?}");
        let log = since(bia, *bia_head).await;
        assert_eq!(log["ok"]["head"], *bia_head, "Bia's count moved: {log}");
        assert!(!log.to_string().contains("Bar"), "{log}");
        let (_, ana, ana_head) = &mut players[0];
        let log = since(ana, *ana_head).await;
        assert!(
            told(&log).contains(&("Barão Zq.md".to_owned(), false)),
            "Ana is not told the note is hers: {log}"
        );
    });
}
