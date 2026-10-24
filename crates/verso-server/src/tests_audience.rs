// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A note released to some players (ADR 0110 item 4, amended 2026-10-23),
//! against a running server: the game master releases "Barão Zq" to Ana
//! alone; Bia, a player of the same table, finds it nowhere — not in a
//! list, a read, a search, a backlink, a tag, a room, her device's sync,
//! the files route, the table's log or what the table tells her of the
//! note — and Ana finds it everywhere. Then Bia is added and the note is
//! hers, live; then Ana is removed and her device is told to let it go.

use serde_json::{Value, json};

use crate::tests::{block_on, get, sign_in};
use crate::tests_campaign::{Mesa, Win, mesa, strings};

pub(crate) const BARAO: &str = "Barão Zq.md";

pub(crate) async fn release_to(m: &mut Mesa, path: &str, accounts: &[&str]) -> Value {
    let r = m
        .owner
        .call(
            "campaign_audience",
            json!({ "paths": [path], "audience": { "kind": "players", "accounts": accounts } }),
        )
        .await;
    assert!(r.get("ok").is_some(), "{r}");
    r
}

pub(crate) fn synced(state: &Value) -> Vec<String> {
    state["ok"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["path"].as_str().unwrap().to_owned())
        .collect()
}

pub(crate) fn told(log: &Value) -> Vec<(String, bool)> {
    log["ok"]["changes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| {
            (
                c["path"].as_str().unwrap().to_owned(),
                c["deleted"].as_bool().unwrap(),
            )
        })
        .collect()
}

/// Everything a window can ask that names the note, answered.
pub(crate) async fn sees(w: &mut Win, path: &str) -> bool {
    let read = w.call("read_note", json!({ "path": path })).await;
    read.get("ok").is_some()
}

#[test]
fn a_note_released_to_one_player_is_found_by_that_player_and_by_no_other() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        let status = release_to(&mut m, BARAO, &[&ana_id]).await;
        let note = status["ok"]["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["path"] == BARAO)
            .unwrap();
        assert_eq!(
            note["audience"],
            json!({ "kind": "players", "accounts": [ana_id] }),
            "{status}"
        );
        assert_eq!(note["released"], true);
        // The lists.
        for (who, win, yes) in [("Ana", &mut m.ana, true), ("Bia", &mut m.bia, false)] {
            let notes = strings(&win.call("list_notes", json!({})).await["ok"]);
            assert_eq!(notes.contains(&BARAO.to_owned()), yes, "{who}: {notes:?}");
            let entries = win.call("list_entries", json!({})).await.to_string();
            assert_eq!(entries.contains("Bar"), yes, "{who}: {entries}");
            assert_eq!(sees(win, BARAO).await, yes, "{who} reads it");
            let found = win
                .call("search", json!({ "words": "zqbody", "limit": 20 }))
                .await;
            assert_eq!(
                found["ok"].as_array().is_some_and(|l| !l.is_empty()),
                yes,
                "{who} searches: {found}"
            );
            let back = win.call("backlinks", json!({ "path": "Aberta.md" })).await;
            assert_eq!(
                back.to_string().contains("Bar"),
                yes,
                "{who} backlinks: {back}"
            );
            let tags = win.call("list_tags", json!({})).await.to_string();
            assert_eq!(tags.contains("zqtag"), yes, "{who} tags: {tags}");
            let graph = win.call("graph", json!({})).await.to_string();
            assert_eq!(graph.contains("Bar"), yes, "{who} graph: {graph}");
        }
        // A link to it, in a note both read: open for Ana, a lock for Bia.
        let ana_text = m
            .ana
            .call("read_note", json!({ "path": "Aberta.md" }))
            .await;
        let bia_text = m
            .bia
            .call("read_note", json!({ "path": "Aberta.md" }))
            .await;
        assert!(
            ana_text["ok"]["text"]
                .as_str()
                .unwrap()
                .contains("[[Barão Zq]]"),
            "{ana_text}"
        );
        assert!(
            bia_text["ok"]["text"]
                .as_str()
                .unwrap()
                .contains("Barão Zq 🔒"),
            "{bia_text}"
        );
        // The room.
        let joined = m.ana.call("collab_join", json!({ "path": BARAO })).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let refused = m.bia.call("collab_join", json!({ "path": BARAO })).await;
        assert_eq!(refused["err"]["kind"], "not_found", "{refused}");
        // Her device.
        let state = m.ana.call("sync_state", json!({})).await;
        assert!(synced(&state).contains(&BARAO.to_owned()), "{state}");
        let state = m.bia.call("sync_state", json!({})).await;
        assert!(!synced(&state).contains(&BARAO.to_owned()), "{state}");
        let log = m.bia.call("sync_changes", json!({ "since": 0 })).await;
        assert!(
            !log.to_string().contains("Bar"),
            "Bia's log names the note: {log}"
        );
        let log = m.ana.call("sync_changes", json!({ "since": 0 })).await;
        assert!(
            told(&log).contains(&(BARAO.to_owned(), false)),
            "Ana's log: {log}"
        );
        let got = m
            .ana
            .call("sync_read", json!({ "path": BARAO, "offset": 0 }))
            .await;
        assert!(got.get("ok").is_some(), "{got}");
        let got = m
            .bia
            .call("sync_read", json!({ "path": BARAO, "offset": 0 }))
            .await;
        assert!(got.get("err").is_some(), "{got}");
        // The table's log: the note a roll was made in.
        for w in [&mut m.owner, &mut m.ana, &mut m.bia] {
            let joined = w
                .call("table_join", json!({ "color": "#3b82f6", "styles": null }))
                .await;
            assert!(joined.get("ok").is_some(), "{joined}");
        }
        let rolled = m
            .owner
            .call(
                "table_roll",
                json!({ "notation": "1d20", "source": null, "path": BARAO, "secret": false, "styles": null }),
            )
            .await;
        assert!(rolled.get("ok").is_some(), "{rolled}");
        for (who, win, yes) in [("Ana", &mut m.ana, true), ("Bia", &mut m.bia, false)] {
            let page = win
                .call("table_history", json!({ "before": null, "limit": 20 }))
                .await;
            assert_eq!(
                page.to_string().contains(BARAO),
                yes,
                "{who}'s table log: {page}"
            );
        }
        // Who has access, as each asks it.
        let mine = m
            .owner
            .call("campaign_access", json!({ "path": BARAO }))
            .await;
        let people = mine["ok"]["people"].as_array().unwrap();
        let access = |id: &str| {
            people
                .iter()
                .find(|p| p["id"] == id)
                .map(|p| p["access"].as_str().unwrap().to_owned())
        };
        assert_eq!(access(&ana_id).as_deref(), Some("sees"), "{mine}");
        assert_eq!(access(&bia_id).as_deref(), Some("none"), "{mine}");
        let hers = m
            .ana
            .call("campaign_access", json!({ "path": BARAO }))
            .await;
        assert_eq!(hers["ok"]["viewer"], "player", "{hers}");
        let ids: Vec<&str> = hers["ok"]["people"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, [ana_id.as_str()], "{hers}");
        let none = m
            .bia
            .call("campaign_access", json!({ "path": BARAO }))
            .await;
        assert_eq!(none["err"]["kind"], "not_found", "{none}");
    });
}

#[test]
fn an_attachment_opens_only_for_the_players_who_see_a_note_that_links_it() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": "Anexos/zqpista.png", "base64": crate::tests_campaign::PNG }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let made = m
            .owner
            .call(
                "create_note",
                json!({ "name": "Pista", "text": "uma pista ![[zqpista.png]]\n" }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        m.owner.call("reindex", json!({})).await;
        release_to(&mut m, "Pista.md", &[&ana_id]).await;
        let (a, b) = (
            sign_in(&m.r, "ana@casa.lan", "a senha da ana").await,
            sign_in(&m.r, "bia@casa.lan", "a senha da bia").await,
        );
        let id = &m.id;
        let (yes, _) = get(&m.r, &format!("/f/{id}/Anexos/zqpista.png"), Some(&a)).await;
        let (no, _) = get(&m.r, &format!("/f/{id}/Anexos/zqpista.png"), Some(&b)).await;
        assert_eq!((yes, no), (200, 404));
        let files = strings(&m.bia.call("list_files", json!({})).await["ok"]);
        assert!(!files.iter().any(|f| f.contains("zqpista")), "{files:?}");
        let files = strings(&m.ana.call("list_files", json!({})).await["ok"]);
        assert!(files.iter().any(|f| f.contains("zqpista")), "{files:?}");
        let state = m.bia.call("sync_state", json!({})).await;
        assert!(!state.to_string().contains("zqpista"), "{state}");
    });
}

#[test]
fn adding_and_removing_a_player_tells_their_window_and_their_device_live() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        release_to(&mut m, BARAO, &[&ana_id]).await;
        // Their devices have synced.
        let log = m.bia.call("sync_changes", json!({ "since": 0 })).await;
        let bia_head = log["ok"]["head"].as_i64().unwrap();
        let log = m.ana.call("sync_changes", json!({ "since": 0 })).await;
        let ana_head = log["ok"]["head"].as_i64().unwrap();
        // What the release said to each window: Bia, who is not in the
        // audience, was told nothing of the note, nor that anything moved.
        m.ana.hear(200).await;
        let first = m.bia.hear(300).await;
        assert!(
            !format!("{first:?}").contains("Bar")
                && !first.iter().any(|e| e["event"] == "folder-changed"),
            "Bia is told of a release she is not in: {first:?}"
        );
        // The owner edits it: Bia hears nothing of it.
        let r = m.owner.call("read_note", json!({ "path": BARAO })).await;
        let w = m
            .owner
            .call(
                "write_note",
                json!({ "path": BARAO, "text": "zqbody outra vez\n", "revision": r["ok"]["revision"] }),
            )
            .await;
        assert!(w.get("ok").is_some(), "{w}");
        let heard = m.bia.hear(500).await;
        assert!(
            !format!("{heard:?}").contains("Bar"),
            "Bia is told of an edit she cannot see: {heard:?}"
        );
        let log = m
            .bia
            .call("sync_changes", json!({ "since": bia_head }))
            .await;
        assert_eq!(told(&log), Vec::<(String, bool)>::new(), "{log}");
        assert_eq!(
            log["ok"]["head"].as_i64().unwrap(),
            bia_head,
            "her count did not move for a note she cannot see: {log}"
        );
        // Added: the note is hers, with no reload.
        release_to(&mut m, BARAO, &[&ana_id, &bia_id]).await;
        let heard = m.bia.hear(500).await;
        assert!(
            heard.iter().any(
                |e| e["event"] == "folder-changed" && e["payload"]["changed"] == json!([BARAO])
            ),
            "{heard:?}"
        );
        assert!(sees(&mut m.bia, BARAO).await);
        let notes = strings(&m.bia.call("list_notes", json!({})).await["ok"]);
        assert!(notes.contains(&BARAO.to_owned()), "{notes:?}");
        let log = m
            .bia
            .call("sync_changes", json!({ "since": bia_head }))
            .await;
        assert!(
            told(&log).contains(&(BARAO.to_owned(), false)),
            "her device is told of the note: {log}"
        );
        let state = m.bia.call("sync_state", json!({})).await;
        assert!(synced(&state).contains(&BARAO.to_owned()));
        // Removed: Ana's window loses it, and her device is told to let go.
        m.ana.hear(200).await;
        release_to(&mut m, BARAO, &[&bia_id]).await;
        let heard = m.ana.hear(500).await;
        assert!(
            heard.iter().any(
                |e| e["event"] == "folder-changed" && e["payload"]["removed"] == json!([BARAO])
            ),
            "{heard:?}"
        );
        assert!(!sees(&mut m.ana, BARAO).await);
        let log = m
            .ana
            .call("sync_changes", json!({ "since": ana_head }))
            .await;
        assert!(
            told(&log).contains(&(BARAO.to_owned(), true)),
            "her device is told to drop it: {log}"
        );
        let state = m.ana.call("sync_state", json!({})).await;
        assert!(!synced(&state).contains(&BARAO.to_owned()));
        // Hidden for everyone: Bia's device drops it too, and a stranger's
        // log stays silent about it.
        let bia_head = m.bia.call("sync_changes", json!({ "since": 0 })).await["ok"]["head"]
            .as_i64()
            .unwrap();
        let hidden = m
            .owner
            .call(
                "campaign_audience",
                json!({ "paths": [BARAO], "audience": { "kind": "hidden" } }),
            )
            .await;
        assert!(hidden.get("ok").is_some(), "{hidden}");
        let log = m
            .bia
            .call("sync_changes", json!({ "since": bia_head }))
            .await;
        assert!(told(&log).contains(&(BARAO.to_owned(), true)), "{log}");
        assert!(!sees(&mut m.bia, BARAO).await);
    });
}

#[test]
fn a_deleted_note_is_told_to_the_players_who_saw_it_and_to_no_one_else() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        release_to(&mut m, BARAO, &[&ana_id]).await;
        let ana_head = m.ana.call("sync_changes", json!({ "since": 0 })).await["ok"]["head"]
            .as_i64()
            .unwrap();
        let bia_head = m.bia.call("sync_changes", json!({ "since": 0 })).await["ok"]["head"]
            .as_i64()
            .unwrap();
        let deleted = m.owner.call("delete_note", json!({ "path": BARAO })).await;
        assert!(deleted.get("ok").is_some(), "{deleted}");
        let log = m
            .ana
            .call("sync_changes", json!({ "since": ana_head }))
            .await;
        assert!(told(&log).contains(&(BARAO.to_owned(), true)), "{log}");
        let log = m
            .bia
            .call("sync_changes", json!({ "since": bia_head }))
            .await;
        assert!(
            !log.to_string().contains("Bar"),
            "Bia is told the name of a note she never saw: {log}"
        );
    });
}

#[test]
fn an_edit_grant_puts_the_player_in_the_audience_and_a_narrower_one_takes_the_grant_back() {
    block_on(async {
        let mut m = mesa().await;
        let (ana_id, bia_id) = (m.ana_id.clone(), m.bia_id.clone());
        // Hidden, then granted to Bia: Bia sees it and edits it, Ana does not.
        let granted = m
            .owner
            .call(
                "campaign_grant",
                json!({ "path": BARAO, "grant": { "kind": "player", "account": bia_id } }),
            )
            .await;
        assert!(granted.get("ok").is_some(), "{granted}");
        let note = granted["ok"]["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["path"] == BARAO)
            .unwrap()
            .clone();
        assert_eq!(
            note["audience"],
            json!({ "kind": "players", "accounts": [bia_id] }),
            "{note}"
        );
        assert!(sees(&mut m.bia, BARAO).await);
        assert!(!sees(&mut m.ana, BARAO).await);
        // Seen by Ana too: the grant stays, the audience grows.
        release_to(&mut m, BARAO, &[&ana_id, &bia_id]).await;
        let status = m.owner.call("campaign_status", json!({})).await;
        let note = status["ok"]["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["path"] == BARAO)
            .unwrap()
            .clone();
        assert_eq!(
            note["grant"],
            json!({ "kind": "player", "account": bia_id })
        );
        // Narrowed to Ana alone: Bia no longer edits it, and no longer sees it.
        release_to(&mut m, BARAO, &[&ana_id]).await;
        let status = m.owner.call("campaign_status", json!({})).await;
        let note = status["ok"]["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["path"] == BARAO)
            .unwrap()
            .clone();
        assert_eq!(note["grant"], json!({ "kind": "none" }), "{note}");
        assert!(!sees(&mut m.bia, BARAO).await);
        // The whole group edits only what the whole table sees.
        let group = m
            .owner
            .call(
                "campaign_grant",
                json!({ "path": BARAO, "grant": { "kind": "group" } }),
            )
            .await;
        let note = group["ok"]["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["path"] == BARAO)
            .unwrap()
            .clone();
        assert_eq!(note["audience"], json!({ "kind": "table" }), "{note}");
    });
}

#[test]
fn only_the_owner_sets_an_audience_and_only_to_players_of_the_table() {
    block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        let refused = m
            .ana
            .call(
                "campaign_audience",
                json!({ "paths": [BARAO], "audience": { "kind": "table" } }),
            )
            .await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
        let stranger = m
            .owner
            .call(
                "campaign_audience",
                json!({ "paths": [BARAO], "audience": { "kind": "players", "accounts": ["nao-e-jogador"] } }),
            )
            .await;
        assert_eq!(stranger["err"]["kind"], "refused", "{stranger}");
        // No one at all is hidden.
        release_to(&mut m, BARAO, &[&ana_id]).await;
        let none = release_to(&mut m, BARAO, &[]).await;
        let note = none["ok"]["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["path"] == BARAO)
            .unwrap()
            .clone();
        assert_eq!(note["audience"], json!({ "kind": "hidden" }), "{note}");
        assert_eq!(note["released"], false);
        assert!(!sees(&mut m.ana, BARAO).await);
    });
}
