// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The review of a note's audience (ADR 0110 item 4, amended 2026-10-23):
//! what a player outside a note's audience is told of it, by any channel —
//! the window's events, the rooms it holds, its device's log and what that
//! log counts — and what the players whose audience it is are told of its
//! deletion, its rename and the deletion of its attachments.

use base64::Engine;
use serde_json::{Value, json};

use crate::db::Role;
use crate::tests::{block_on, sign_in};
use crate::tests_audience::{BARAO, release_to, told};
use crate::tests_campaign::{Mesa, Win, mesa};

/// A second game master: an editor of the folder, who sees all.
async fn editor(m: &Mesa) -> Win {
    let a =
        m.r.server
            .db
            .create_account(
                "mestre2@casa.lan",
                "Mestre",
                "pt",
                Some("a senha do mestre"),
                false,
            )
            .unwrap();
    m.r.server.db.grant(&m.id, &a.id, Role::Editor).unwrap();
    let b = sign_in(&m.r, "mestre2@casa.lan", "a senha do mestre").await;
    let (w, o) = Win::open(&m.r, &b, &m.id).await;
    assert!(o.get("ok").is_some(), "{o}");
    w
}

fn names_note(events: &[Value], needle: &str) -> bool {
    events.iter().any(|e| e.to_string().contains(needle))
}

fn folder_changes(events: &[Value]) -> Vec<&Value> {
    events
        .iter()
        .filter(|e| e["event"] == "folder-changed")
        .collect()
}

async fn quiet(m: &mut Mesa) {
    m.owner.hear(150).await;
    m.ana.hear(150).await;
    m.bia.hear(150).await;
}

// ------------------------------------------------------------- events

#[test]
fn a_player_outside_an_audience_is_told_nothing_when_the_note_is_released_to_others() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        quiet(&mut m).await;
        release_to(&mut m, BARAO, &[&ana_id]).await;
        let bia = m.bia.hear(500).await;
        assert!(
            !names_note(&bia, "Bar"),
            "Bia, who never saw the note, is told of it: {bia:?}"
        );
        assert!(
            folder_changes(&bia).is_empty(),
            "Bia hears a change of the folder: {bia:?}"
        );
        // Ana, who gained it, is told.
        let ana = m.ana.hear(500).await;
        assert!(
            ana.iter().any(
                |e| e["event"] == "folder-changed" && e["payload"]["changed"] == json!([BARAO])
            ),
            "{ana:?}"
        );
        // Narrowed to nobody: Ana loses it, Bia is still told nothing.
        quiet(&mut m).await;
        m.owner
            .call(
                "campaign_audience",
                json!({ "paths": [BARAO], "audience": { "kind": "hidden" } }),
            )
            .await;
        let bia = m.bia.hear(500).await;
        assert!(!names_note(&bia, "Bar"), "{bia:?}");
        let ana = m.ana.hear(500).await;
        assert!(
            ana.iter().any(
                |e| e["event"] == "folder-changed" && e["payload"]["removed"] == json!([BARAO])
            ),
            "{ana:?}"
        );
    });
}

#[test]
fn hiding_a_folder_or_naming_a_secret_tells_no_one_who_never_saw_the_notes() {
    block_on(async {
        let mut m = mesa().await;
        quiet(&mut m).await;
        // Hide a folder of notes that were never released.
        let hidden = m
            .owner
            .call(
                "campaign_release",
                json!({ "paths": ["Mundo Zq"], "released": false }),
            )
            .await;
        assert!(hidden.get("ok").is_some(), "{hidden}");
        for (who, w) in [("Ana", &mut m.ana), ("Bia", &mut m.bia)] {
            let heard = w.hear(500).await;
            assert!(!names_note(&heard, "Cripta"), "{who}: {heard:?}");
            assert!(folder_changes(&heard).is_empty(), "{who}: {heard:?}");
        }
        // A secret name on a note nobody sees.
        let secret = m
            .owner
            .call("campaign_secret_name", json!({ "path": BARAO, "on": true }))
            .await;
        assert!(secret.get("ok").is_some(), "{secret}");
        for (who, w) in [("Ana", &mut m.ana), ("Bia", &mut m.bia)] {
            let heard = w.hear(500).await;
            assert!(!names_note(&heard, "Bar"), "{who}: {heard:?}");
            assert!(folder_changes(&heard).is_empty(), "{who}: {heard:?}");
        }
    });
}

#[test]
fn a_game_master_is_never_told_a_note_was_removed_that_it_still_sees() {
    block_on(async {
        let mut m = mesa().await;
        let mut master = editor(&m).await;
        let ana_id = m.ana_id.clone();
        release_to(&mut m, BARAO, &[&ana_id]).await;
        master.hear(300).await;
        m.owner
            .call(
                "campaign_audience",
                json!({ "paths": [BARAO], "audience": { "kind": "hidden" } }),
            )
            .await;
        let heard = master.hear(500).await;
        for e in folder_changes(&heard) {
            assert_eq!(
                e["payload"]["removed"],
                json!([]),
                "an editor, who sees everything, is told a note was removed: {e}"
            );
        }
    });
}

// ------------------------------------------------------------- rooms

pub(crate) fn doc_of(joined: &Value) -> yrs::Doc {
    use yrs::Transact;
    use yrs::updates::decoder::Decode;
    let doc = yrs::Doc::with_options(yrs::Options {
        offset_kind: yrs::OffsetKind::Utf16,
        ..Default::default()
    });
    let state = base64::engine::general_purpose::STANDARD
        .decode(joined["update"].as_str().unwrap())
        .unwrap();
    doc.transact_mut()
        .apply_update(yrs::Update::decode_v1(&state).unwrap())
        .unwrap();
    doc
}

pub(crate) fn typed(doc: &yrs::Doc, what: &str) -> String {
    use yrs::{GetString, Text, Transact};
    let text = doc.get_or_insert_text(crate::collab::TEXT);
    let mut txn = doc.transact_mut();
    let len = text.get_string(&txn).encode_utf16().count() as u32;
    text.insert(&mut txn, len, what);
    base64::engine::general_purpose::STANDARD.encode(txn.encode_update_v1())
}

/// Ana edits the note by a grant; the owner is in its room.
pub(crate) async fn room_with_a_writer(m: &mut Mesa) -> yrs::Doc {
    let ana_id = m.ana_id.clone();
    let granted = m
        .owner
        .call(
            "campaign_grant",
            json!({ "path": BARAO, "grant": { "kind": "player", "account": ana_id } }),
        )
        .await;
    assert!(granted.get("ok").is_some(), "{granted}");
    let theirs = m.ana.call("collab_join", json!({ "path": BARAO })).await;
    assert!(theirs.get("ok").is_some(), "{theirs}");
    let mine = m.owner.call("collab_join", json!({ "path": BARAO })).await;
    assert!(mine.get("ok").is_some(), "{mine}");
    doc_of(&mine["ok"])
}

#[test]
fn a_writer_by_grant_is_sent_out_of_the_room_when_the_audience_no_longer_has_it() {
    block_on(async {
        let mut m = mesa().await;
        let bia_id = m.bia_id.clone();
        let doc = room_with_a_writer(&mut m).await;
        m.ana.hear(200).await;
        let update = typed(&doc, "a\n");
        m.owner
            .call("collab_update", json!({ "path": BARAO, "update": update }))
            .await;
        let heard = m.ana.hear(400).await;
        assert!(
            heard.iter().any(|e| e["event"] == "collab-update"),
            "the writer follows the room: {heard:?}"
        );
        // Narrowed to Bia: Ana neither sees the note nor edits it.
        release_to(&mut m, BARAO, &[&bia_id]).await;
        let heard = m.ana.hear(400).await;
        assert!(
            heard.iter().any(|e| e["event"] == "collab-closed"),
            "Ana is told the room closed: {heard:?}"
        );
        let update = typed(&doc, "b\n");
        m.owner
            .call("collab_update", json!({ "path": BARAO, "update": update }))
            .await;
        let heard = m.ana.hear(400).await;
        assert!(
            !heard.iter().any(|e| e["event"] == "collab-update"),
            "Ana still receives the room's updates: {heard:?}"
        );
        let typed_now = m
            .ana
            .call("collab_update", json!({ "path": BARAO, "update": "AAA=" }))
            .await;
        assert!(typed_now.get("err").is_some(), "{typed_now}");
    });
}

#[test]
fn a_writer_by_grant_who_still_sees_the_note_but_may_not_edit_it_leaves_the_room() {
    block_on(async {
        let mut m = mesa().await;
        let doc = room_with_a_writer(&mut m).await;
        m.ana.hear(200).await;
        let none = m
            .owner
            .call(
                "campaign_grant",
                json!({ "path": BARAO, "grant": { "kind": "none" } }),
            )
            .await;
        assert!(none.get("ok").is_some(), "{none}");
        let heard = m.ana.hear(400).await;
        assert!(
            heard.iter().any(|e| e["event"] == "collab-closed"),
            "{heard:?}"
        );
        let update = typed(&doc, "c\n");
        m.owner
            .call("collab_update", json!({ "path": BARAO, "update": update }))
            .await;
        let heard = m.ana.hear(400).await;
        assert!(
            !heard.iter().any(|e| e["event"] == "collab-update"),
            "{heard:?}"
        );
    });
}

#[test]
fn a_join_that_was_admitted_before_the_veil_changed_is_refused_under_the_rooms_lock() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        release_to(&mut m, BARAO, &[&bia_id]).await;
        // Ana's window, as the server keeps it.
        let (client, key) = {
            let table = verso_service::lock(&m.r.server.clients);
            let client = table
                .iter()
                .find(|(_, c)| c.account == ana_id)
                .map(|(id, _)| id.clone())
                .unwrap();
            drop(table);
            let key = m.r.server.service.folder_of(&client).unwrap();
            (client, key)
        };
        let server = std::sync::Arc::clone(&m.r.server);
        let joined = tokio::task::spawn_blocking(move || {
            crate::collab::join(&server, (&client, true), &key, BARAO, "Ana")
        })
        .await
        .unwrap();
        assert!(
            joined.is_err(),
            "a player outside the audience joined the room: {joined:?}"
        );
    });
}

// ------------------------------------------------------------- the device's log

#[test]
fn a_player_outside_an_audience_does_not_count_the_audience_changes_of_notes_that_link_it() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        let head = |l: &Value| l["ok"]["head"].as_i64().unwrap();
        let before = head(&m.bia.call("sync_changes", json!({ "since": 0 })).await);
        quiet(&mut m).await;
        // Aberta links the note: its text is the same for Bia before and
        // after, so her log holds nothing of it.
        release_to(&mut m, BARAO, &[&ana_id]).await;
        // Heard before anything is asked: a call drains what it was sent.
        let heard = m.bia.hear(500).await;
        assert!(
            !heard.iter().any(|e| e["event"] == "sync-changed"),
            "Bia's device is told the log moved: {heard:?}"
        );
        let log = m.bia.call("sync_changes", json!({ "since": 0 })).await;
        assert_eq!(head(&log), before, "her count moved: {log}");
        // An edit of the note: the same.
        let r = m.owner.call("read_note", json!({ "path": BARAO })).await;
        m.owner
            .call(
                "write_note",
                json!({ "path": BARAO, "text": "zqbody 2\n", "revision": r["ok"]["revision"] }),
            )
            .await;
        let heard = m.bia.hear(500).await;
        assert!(
            !heard.iter().any(|e| e["event"] == "sync-changed"),
            "Bia's device is told of an edit it cannot see: {heard:?}"
        );
        let ana = m.ana.hear(100).await;
        let _ = ana;
    });
}

async fn heads(m: &mut Mesa) -> (i64, i64) {
    let a = m.ana.call("sync_changes", json!({ "since": 0 })).await["ok"]["head"]
        .as_i64()
        .unwrap();
    let b = m.bia.call("sync_changes", json!({ "since": 0 })).await["ok"]["head"]
        .as_i64()
        .unwrap();
    (a, b)
}

/// The folder has a note released to some players: each player's log is its own.
async fn restricted(m: &mut Mesa) {
    let ana_id = m.ana_id.clone();
    release_to(m, "Mapa Zq.md", &[&ana_id]).await;
}

async fn since(w: &mut Win, head: i64) -> Value {
    w.call("sync_changes", json!({ "since": head })).await
}

#[test]
fn a_whole_table_note_deleted_in_a_folder_with_per_player_logs_is_told_to_every_player() {
    block_on(async {
        let mut m = mesa().await;
        restricted(&mut m).await;
        let (ah, bh) = heads(&mut m).await;
        let deleted = m
            .owner
            .call("delete_note", json!({ "path": "Livre.md" }))
            .await;
        assert!(deleted.get("ok").is_some(), "{deleted}");
        for (who, w, h) in [("Ana", &mut m.ana, ah), ("Bia", &mut m.bia, bh)] {
            let log = since(w, h).await;
            assert!(
                told(&log).contains(&("Livre.md".to_owned(), true)),
                "{who}'s device is not told the note went: {log}"
            );
        }
    });
}

#[test]
fn a_whole_table_note_renamed_in_a_folder_with_per_player_logs_is_told_as_a_rename() {
    block_on(async {
        let mut m = mesa().await;
        restricted(&mut m).await;
        let (ah, bh) = heads(&mut m).await;
        let renamed = m
            .owner
            .call(
                "rename_note",
                json!({ "from": "Livre.md", "to": "Livre 2.md" }),
            )
            .await;
        assert!(renamed.get("ok").is_some(), "{renamed}");
        for (who, w, h) in [("Ana", &mut m.ana, ah), ("Bia", &mut m.bia, bh)] {
            let log = since(w, h).await;
            let all = told(&log);
            assert!(
                all.contains(&("Livre.md".to_owned(), true)),
                "{who}: the old name is not told gone: {log}"
            );
            assert!(
                all.contains(&("Livre 2.md".to_owned(), false)),
                "{who}: the new name is not told: {log}"
            );
            let new = log["ok"]["changes"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["path"] == "Livre 2.md")
                .unwrap();
            assert_eq!(
                new["renamedFrom"], "Livre.md",
                "{who}: the rename is told as a new file: {log}"
            );
        }
    });
}

#[test]
fn an_attachment_deleted_is_told_to_the_players_whose_notes_opened_it() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        // A clue only Ana sees opens its picture.
        m.owner
            .call(
                "create_file",
                json!({ "path": "Anexos/zqpista.png", "base64": crate::tests_campaign::PNG }),
            )
            .await;
        m.owner
            .call(
                "create_note",
                json!({ "name": "Pista", "text": "uma pista ![[zqpista.png]]\n" }),
            )
            .await;
        m.owner.call("reindex", json!({})).await;
        release_to(&mut m, "Pista.md", &[&ana_id]).await;
        let (ah, bh) = heads(&mut m).await;
        for path in [
            "Anexos/zqpista.png",
            "Anexos/aberto.png",
            "Anexos/zqfechado.png",
        ] {
            let gone = m.owner.call("delete_entry", json!({ "path": path })).await;
            assert!(gone.get("ok").is_some(), "{gone}");
        }
        let ana = since(&mut m.ana, ah).await;
        let bia = since(&mut m.bia, bh).await;
        // Ana: the picture of her clue, and the open one.
        assert!(
            told(&ana).contains(&("Anexos/zqpista.png".to_owned(), true)),
            "{ana}"
        );
        assert!(
            told(&ana).contains(&("Anexos/aberto.png".to_owned(), true)),
            "{ana}"
        );
        // Bia: the open one; nothing of the clue's picture, nor of the one no note opens.
        assert!(
            told(&bia).contains(&("Anexos/aberto.png".to_owned(), true)),
            "{bia}"
        );
        assert!(!bia.to_string().contains("zqpista"), "{bia}");
        assert!(!bia.to_string().contains("zqfechado"), "{bia}");
        assert!(!ana.to_string().contains("zqfechado"), "{ana}");
    });
}

// ------------------------------------------------------------- state

#[test]
fn a_table_that_cannot_be_read_is_closed_to_players_not_open() {
    block_on(async {
        let m = mesa().await;
        let veil = crate::campaign::unreadable(&m.id);
        assert!(veil.restricted());
        assert!(veil.hides_note("Aberta.md"));
        assert!(veil.hides_note("qualquer.md"));
        assert!(veil.hides_note_from("Aberta.md", &m.ana_id));
    });
}

// ------------------------------------------------------------- players

#[test]
fn the_players_of_a_table_are_the_people_that_reach_it_and_never_a_game_master() {
    block_on(async {
        let mut m = mesa().await;
        // A second account with the editor's role: a player who edits every
        // file they see, not a game master (ADR 0113 item 3).
        let _editor = editor(&m).await;
        let editor_id =
            m.r.server
                .db
                .account_by_email("mestre2@casa.lan")
                .unwrap()
                .unwrap()
                .id;
        let status = m.owner.call("campaign_status", json!({})).await;
        let mut ids: Vec<String> = status["ok"]["players"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p["id"].as_str().unwrap().to_owned())
            .collect();
        ids.sort();
        let mut want = vec![m.ana_id.clone(), m.bia_id.clone(), editor_id];
        want.sort();
        assert_eq!(ids, want, "an editor is a player of the table: {status}");
        // A table in a subfolder: the readers of the whole folder reach it.
        let made = m
            .owner
            .call("campaign_make", json!({ "root": "Mundo Zq" }))
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let access = m
            .owner
            .call(
                "campaign_access",
                json!({ "path": "Mundo Zq/Cripta Zq.md" }),
            )
            .await;
        let mut ids: Vec<String> = access["ok"]["people"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p["id"].as_str().unwrap().to_owned())
            .collect();
        ids.sort();
        assert_eq!(
            ids, want,
            "the readers of the folder are players of the subfolder's table: {access}"
        );
        // And the game master can release the note to them.
        let ana = m.ana_id.clone();
        let r = release_to(&mut m, "Mundo Zq/Cripta Zq.md", &[&ana]).await;
        assert!(r.get("ok").is_some(), "{r}");
    });
}

// ------------------------------------------------------------- the work an ask does

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
fn an_ask_of_a_long_log_does_not_tell_again_what_an_earlier_ask_settled() {
    block_on(async {
        let mut m = mesa().await;
        restricted(&mut m).await;
        // Her log is begun before the edits: a first ask begins at the head.
        since(&mut m.ana, 0).await;
        for i in 0..40 {
            edit(&mut m, "Livre.md", &format!("Livre {i}\n")).await;
        }
        let first = since(&mut m.ana, 0).await;
        let head = first["ok"]["head"].as_i64().unwrap();
        assert!(head > 40, "{first}");
        let state = m.ana.call("sync_state", json!({})).await;
        assert!(state.get("ok").is_some(), "{state}");
        let folder = m.id.clone();
        crate::campaign_sync::projections_taken(&folder);
        // A poll with nothing new: nothing is told from scratch.
        let again = since(&mut m.ana, head).await;
        assert_eq!(again["ok"]["changes"], json!([]), "{again}");
        assert_eq!(again["ok"]["head"], head, "{again}");
        let asked = crate::campaign_sync::projections_taken(&folder);
        assert_eq!(asked, 0, "an ask with nothing new told {asked} files");
        // Its files, asked again with the log where it was: kept.
        let state = m.ana.call("sync_state", json!({})).await;
        assert!(state.get("ok").is_some(), "{state}");
        assert_eq!(
            crate::campaign_sync::projections_taken(&folder),
            0,
            "the files were told again"
        );
        // One more edit: the page holds one change, so one file is told.
        edit(&mut m, "Livre.md", "Livre de novo\n").await;
        let more = since(&mut m.ana, head).await;
        assert_eq!(told(&more), vec![("Livre.md".to_owned(), false)], "{more}");
        let asked = crate::campaign_sync::projections_taken(&folder);
        assert!(asked <= 2, "a page of one change told {asked} files");
        // Her files after a write: the notes whose rows did not move are not
        // told again (a file written is no change of the table).
        let state = m.ana.call("sync_state", json!({})).await;
        assert!(state.get("ok").is_some(), "{state}");
        let asked = crate::campaign_sync::projections_taken(&folder);
        assert!(
            asked <= 4,
            "her files were all told again after one write: {asked}"
        );
    });
}

#[test]
fn asks_at_the_same_time_decide_a_players_log_once() {
    block_on(async {
        let mut m = mesa().await;
        restricted(&mut m).await;
        let ana_id = m.ana_id.clone();
        let (server, folder) = (std::sync::Arc::clone(&m.r.server), m.id.clone());
        let key = {
            let table = verso_service::lock(&server.clients);
            let client = table
                .iter()
                .find(|(_, c)| c.account == ana_id)
                .map(|(id, _)| id.clone())
                .unwrap();
            drop(table);
            server.service.folder_of(&client).unwrap()
        };
        // Four devices of one account ask over and over while the table moves.
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let askers: Vec<_> = (0..4)
            .map(|_| {
                let (s, f, k, a, stop) = (
                    std::sync::Arc::clone(&server),
                    folder.clone(),
                    key.clone(),
                    ana_id.clone(),
                    std::sync::Arc::clone(&stop),
                );
                std::thread::spawn(move || {
                    let mut seen: Vec<Vec<i64>> = Vec::new();
                    while !stop.load(std::sync::atomic::Ordering::SeqCst) {
                        let log =
                            crate::campaign_sync::viewer_changes(&s, &f, &k, (&a, true)).unwrap();
                        seen.push(log.iter().map(|t| t.seq).collect());
                    }
                    seen
                })
            })
            .collect();
        let bia_id = m.bia_id.clone();
        for i in 0..6 {
            edit(&mut m, "Livre.md", &format!("Livre {i}\n")).await;
            release_to(&mut m, BARAO, &[&ana_id]).await;
            release_to(&mut m, BARAO, &[&ana_id, &bia_id]).await;
            release_to(&mut m, BARAO, &[&bia_id]).await;
        }
        stop.store(true, std::sync::atomic::Ordering::SeqCst);
        let seen: Vec<Vec<Vec<i64>>> = askers.into_iter().map(|t| t.join().unwrap()).collect();
        let last =
            crate::campaign_sync::viewer_changes(&server, &folder, &key, (&ana_id, true)).unwrap();
        let last: Vec<i64> = last.iter().map(|t| t.seq).collect();
        // What was handed out never moved: every log any device read is the
        // start of the one it reads last.
        for log in seen.iter().flatten() {
            assert!(
                last.starts_with(log),
                "a log handed out is not the start of the final one: {log:?} / {last:?}"
            );
        }
    });
}

#[test]
fn unmaking_the_last_table_forgets_the_players_logs_so_a_new_one_begins_anew() {
    block_on(async {
        let mut m = mesa().await;
        restricted(&mut m).await;
        since(&mut m.ana, 0).await;
        assert!(m.r.server.db.campaign_epoch(&m.id).unwrap().is_some());
        assert!(
            m.r.server
                .db
                .campaign_viewer(&m.id, &m.ana_id)
                .unwrap()
                .is_some()
        );
        let undone = m.owner.call("campaign_unmake", json!({ "root": "" })).await;
        assert!(undone.get("ok").is_some(), "{undone}");
        assert_eq!(m.r.server.db.campaign_epoch(&m.id).unwrap(), None);
        assert_eq!(
            m.r.server.db.campaign_viewer(&m.id, &m.ana_id).unwrap(),
            None
        );
        // Made again: the players' logs begin anew, from the head it is made at.
        let head = m.r.server.db.head(&m.id).unwrap();
        let made = m.owner.call("campaign_make", json!({ "root": "" })).await;
        assert!(made.get("ok").is_some(), "{made}");
        assert_eq!(m.r.server.db.campaign_epoch(&m.id).unwrap(), Some(head));
        assert_eq!(
            m.r.server.db.campaign_viewer(&m.id, &m.ana_id).unwrap(),
            None
        );
    });
}
