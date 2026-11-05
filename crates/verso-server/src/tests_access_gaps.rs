// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a player is shown in the moment between a write landing on disk
//! and the table's access following it (the audit of 2026-11-05): a file
//! seen outside its audience is BLOCKING. Each test stops the step at that
//! moment (`crate::pause`) and asks as the player then, every time.
//!
//! The cast is the table of `tests_campaign::mesa`; "Praça" is a folder
//! every player sees, and "Barão Zq.md" a note at the root, which no
//! player sees. A move keeps the access a file had (ADR 0113 K.2).

use base64::Engine;
use serde_json::{Value, json};

use crate::pause::{arrived, hold};
use crate::tests::block_on;
use crate::tests_campaign::{Mesa, mesa, strings};

fn set(whole: &str) -> Value {
    json!({ "kind": "set", "set": { "whole": whole, "rows": [] }, "secret_name": null })
}

/// "Praça", seen by every player, with a note in it.
async fn praca(m: &mut Mesa) {
    let made = m
        .owner
        .call(
            "create_note",
            json!({ "name": "Praça/Fonte", "text": "água\n" }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    let open = m
        .owner
        .call(
            "access_set",
            json!({ "paths": ["Praça"], "change": set("see") }),
        )
        .await;
    assert!(open.get("ok").is_some(), "{open}");
    let listed = m.ana.call("list_notes", json!({})).await;
    assert!(
        strings(&listed["ok"]).contains(&"Praça/Fonte.md".to_owned()),
        "{listed}"
    );
}

/// What a player is shown of the hidden note: by its name in the listing,
/// and its text by the path it now has.
fn shown(listed: &Value, read: &Value) -> Vec<String> {
    let mut out: Vec<String> = strings(&listed["ok"])
        .into_iter()
        .filter(|p| p.contains("Zq"))
        .collect();
    if read.get("ok").is_some() {
        out.push(format!("read: {read}"));
    }
    out
}

/// After the move, as it settled: the note keeps the access it had.
async fn still_hidden(m: &mut Mesa, path: &str) {
    for w in [&mut m.ana, &mut m.bia] {
        let listed = w.call("list_notes", json!({})).await;
        let read = w.call("read_note", json!({ "path": path })).await;
        assert_eq!(shown(&listed, &read), Vec::<String>::new());
    }
}

/// A window's move of a hidden note into a folder the players see: the
/// note is on disk under "Praça" before the table carries its access
/// along. A player asking then is not shown it.
#[test]
fn a_window_move_shows_no_player_the_file_before_its_access_follows() {
    block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        let (heard, go) = hold("window-moved", &m.id);
        let Mesa { owner, ana, .. } = &mut m;
        let mover = owner.call(
            "move_entries",
            json!({ "paths": ["Barão Zq.md"], "folder": "Praça" }),
        );
        let player = async {
            arrived(heard).await;
            let listed = ana.call("list_notes", json!({})).await;
            let read = ana
                .call("read_note", json!({ "path": "Praça/Barão Zq.md" }))
                .await;
            let _ = go.send(());
            (listed, read)
        };
        let (moved, (listed, read)) = tokio::join!(mover, player);
        assert!(moved.get("ok").is_some(), "{moved}");
        assert_eq!(shown(&listed, &read), Vec::<String>::new());
        still_hidden(&mut m, "Praça/Barão Zq.md").await;
    });
}

/// A player's answer begun before a move and read after it: what it
/// lists is judged by the access as it is once the move is done, not by
/// the table as it was when the answer began.
#[test]
fn a_players_answer_that_straddles_a_move_is_judged_by_the_access_after_it() {
    block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        let (heard, go) = hold("player-veiled", &m.id);
        let Mesa { owner, ana, .. } = &mut m;
        let player = ana.call("list_notes", json!({}));
        let mover = async {
            arrived(heard).await;
            let moved = owner
                .call(
                    "move_entries",
                    json!({ "paths": ["Barão Zq.md"], "folder": "Praça" }),
                )
                .await;
            let _ = go.send(());
            moved
        };
        let (listed, moved) = tokio::join!(player, mover);
        assert!(moved.get("ok").is_some(), "{moved}");
        assert_eq!(shown(&listed, &json!({})), Vec::<String>::new());
        still_hidden(&mut m, "Praça/Barão Zq.md").await;
    });
}

/// A device's rename of the hidden note into "Praça": the same moment,
/// between the file landing and the table following it.
#[test]
fn a_devices_rename_shows_no_player_the_file_before_its_access_follows() {
    block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        let state = m.owner.call("sync_state", json!({})).await;
        let base = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["path"] == "Barão Zq.md")
            .map(|f| f["hash"].clone())
            .unwrap();
        let (heard, go) = hold("device-renamed", &m.id);
        let Mesa { owner, ana, .. } = &mut m;
        let mover = owner.call(
            "sync_rename",
            json!({ "from": "Barão Zq.md", "to": "Praça/Barão Zq.md", "base": base }),
        );
        let player = async {
            arrived(heard).await;
            let listed = ana.call("list_notes", json!({})).await;
            let read = ana
                .call("read_note", json!({ "path": "Praça/Barão Zq.md" }))
                .await;
            let _ = go.send(());
            (listed, read)
        };
        let (moved, (listed, read)) = tokio::join!(mover, player);
        assert!(moved.get("ok").is_some(), "{moved}");
        assert_eq!(shown(&listed, &read), Vec::<String>::new());
        still_hidden(&mut m, "Praça/Barão Zq.md").await;
    });
}

/// A note with access of its own, hidden inside "Praça", deleted and then
/// restored from the bin: it comes back to the players as it was.
#[test]
fn a_restored_note_is_shown_to_no_player_it_was_hidden_from() {
    block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        let made = m
            .owner
            .call(
                "create_note",
                json!({ "name": "Praça/Segredo Zq", "text": "zq\n" }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let hide = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Praça/Segredo Zq.md"], "change": set("none") }),
            )
            .await;
        assert!(hide.get("ok").is_some(), "{hide}");
        still_hidden(&mut m, "Praça/Segredo Zq.md").await;
        let gone = m
            .owner
            .call("delete_entry", json!({ "path": "Praça/Segredo Zq.md" }))
            .await;
        assert!(gone.get("ok").is_some(), "{gone}");
        let bin = gone["ok"]["path"].as_str().unwrap().to_owned();
        let back = m
            .owner
            .call(
                "trash_restore",
                json!({ "path": bin, "today": "2026-11-05", "lang": "pt" }),
            )
            .await;
        assert_eq!(back["ok"]["path"], "Praça/Segredo Zq.md", "{back}");
        still_hidden(&mut m, "Praça/Segredo Zq.md").await;
    });
}

/// A hidden note made in "Praça", by its own access.
async fn hidden_note(m: &mut Mesa, name: &str) -> String {
    let made = m
        .owner
        .call("create_note", json!({ "name": name, "text": "zq\n" }))
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    let path = format!("{name}.md");
    let hide = m
        .owner
        .call(
            "access_set",
            json!({ "paths": [path], "change": set("none") }),
        )
        .await;
    assert!(hide.get("ok").is_some(), "{hide}");
    still_hidden(m, &path).await;
    path
}

/// Back from the bin as it went in: a folder with access of its own, a
/// note a device deleted; and an entry gone from the bin for good takes
/// what it kept with it.
#[test]
fn what_the_bin_gives_back_keeps_the_access_it_had() {
    block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        let restore = |bin: &str| json!({ "path": bin, "today": "2026-11-05", "lang": "pt" });
        // A folder hidden by its own access, deleted whole.
        let made = m
            .owner
            .call(
                "create_note",
                json!({ "name": "Praça/Cofre Zq/Ouro Zq", "text": "zq\n" }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let hide = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Praça/Cofre Zq"], "change": set("none") }),
            )
            .await;
        assert!(hide.get("ok").is_some(), "{hide}");
        still_hidden(&mut m, "Praça/Cofre Zq/Ouro Zq.md").await;
        let gone = m
            .owner
            .call("delete_entry", json!({ "path": "Praça/Cofre Zq" }))
            .await;
        let bin = gone["ok"]["path"].as_str().unwrap().to_owned();
        let back = m.owner.call("trash_restore", restore(&bin)).await;
        assert_eq!(back["ok"]["path"], "Praça/Cofre Zq", "{back}");
        still_hidden(&mut m, "Praça/Cofre Zq/Ouro Zq.md").await;
        // A note a device deleted goes to the server's bin as well.
        let path = hidden_note(&mut m, "Praça/Diário Zq").await;
        let state = m.owner.call("sync_state", json!({})).await;
        let base = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["path"] == path.as_str())
            .map(|f| f["hash"].clone())
            .unwrap();
        let gone = m
            .owner
            .call("sync_delete", json!({ "path": path, "base": base }))
            .await;
        assert!(gone.get("ok").is_some(), "{gone}");
        let list = m.owner.call("trash_list", json!({})).await;
        let bin = list["ok"]["entries"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["original"] == path.as_str())
            .map(|i| i["path"].as_str().unwrap().to_owned())
            .unwrap();
        let back = m.owner.call("trash_restore", restore(&bin)).await;
        assert_eq!(back["ok"]["path"], path.as_str(), "{back}");
        still_hidden(&mut m, &path).await;
        // Gone for good: nothing of it is kept.
        let path = hidden_note(&mut m, "Praça/Velho Zq").await;
        let gone = m.owner.call("delete_entry", json!({ "path": path })).await;
        let bin = gone["ok"]["path"].as_str().unwrap().to_owned();
        let purged = m
            .owner
            .call("trash_delete", json!({ "paths": [bin] }))
            .await;
        assert!(purged.get("ok").is_some(), "{purged}");
        assert_eq!(m.r.server.db.campaign_unbinned(&m.id, ".trash").unwrap(), 0);
    });
}

/// A note that followed its hidden folder, deleted before the folder was,
/// and restored alone: its folder is made again, with nothing of its own,
/// and the note comes back as hidden as it went (K.2: a file that followed
/// its folder takes along what it followed).
#[test]
fn a_note_restored_without_its_folder_keeps_the_access_it_followed() {
    block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        for name in ["Praça/Cofre Zq/Ouro Zq", "Praça/Cofre Zq/Prata Zq"] {
            let made = m
                .owner
                .call("create_note", json!({ "name": name, "text": "zq\n" }))
                .await;
            assert!(made.get("ok").is_some(), "{made}");
        }
        let hide = m
            .owner
            .call(
                "access_set",
                json!({ "paths": ["Praça/Cofre Zq"], "change": set("none") }),
            )
            .await;
        assert!(hide.get("ok").is_some(), "{hide}");
        let path = "Praça/Cofre Zq/Ouro Zq.md";
        still_hidden(&mut m, path).await;
        let gone = m.owner.call("delete_entry", json!({ "path": path })).await;
        let bin = gone["ok"]["path"].as_str().unwrap().to_owned();
        let folder = m
            .owner
            .call("delete_entry", json!({ "path": "Praça/Cofre Zq" }))
            .await;
        assert!(folder.get("ok").is_some(), "{folder}");
        let back = m
            .owner
            .call(
                "trash_restore",
                json!({ "path": bin, "today": "2026-11-05", "lang": "pt" }),
            )
            .await;
        assert_eq!(back["ok"]["path"], path, "{back}");
        still_hidden(&mut m, path).await;
    });
}

/// The version of a hidden note a device's write replaced, restored from
/// the bin beside the note: as hidden as the note it was.
#[test]
fn a_replaced_version_restored_beside_its_note_is_as_hidden_as_the_note() {
    block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        let path = hidden_note(&mut m, "Praça/Carta Zq").await;
        let base = crate::sync::sha256(b"zq\n");
        let bytes: &[u8] = b"zq, outra vez\n";
        let put = m
            .owner
            .call(
                "sync_put",
                json!({
                    "path": path, "offset": 0, "size": bytes.len(), "hash": crate::sync::sha256(bytes),
                    "base": base, "data": base64::engine::general_purpose::STANDARD.encode(bytes),
                }),
            )
            .await;
        assert_eq!(put["ok"]["done"], true, "{put}");
        let list = m.owner.call("trash_list", json!({})).await;
        let kept = list["ok"]["entries"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["original"] == path.as_str() && i["replaced"] == true)
            .map(|i| i["path"].as_str().unwrap().to_owned())
            .unwrap_or_else(|| panic!("a replaced version in {list}"));
        let back = m
            .owner
            .call(
                "trash_restore",
                json!({ "path": kept, "today": "2026-11-05", "lang": "pt" }),
            )
            .await;
        let beside = back["ok"]["path"].as_str().unwrap().to_owned();
        assert_ne!(beside, path, "{back}");
        still_hidden(&mut m, &beside).await;
        still_hidden(&mut m, &path).await;
    });
}

/// A note hidden inside a folder the players see, made again at the name
/// of one just deleted that every player saw: the deleted one's access is
/// not the new one's, not even in the moment of the deletion.
async fn made_where_one_went(m: &mut Mesa, device: bool) {
    praca(m).await;
    let hide = m
        .owner
        .call(
            "access_set",
            json!({ "paths": ["Praça"], "change": set("none") }),
        )
        .await;
    assert!(hide.get("ok").is_some(), "{hide}");
    let path = "Praça/Placa.md";
    let made = m
        .owner
        .call(
            "create_note",
            json!({ "name": "Praça/Placa", "text": "aberta\n" }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    let open = m
        .owner
        .call(
            "access_set",
            json!({ "paths": [path], "change": set("see") }),
        )
        .await;
    assert!(open.get("ok").is_some(), "{open}");
    let read = m.ana.call("read_note", json!({ "path": path })).await;
    assert!(read.get("ok").is_some(), "{read}");
    let args = if device {
        let state = m.owner.call("sync_state", json!({})).await;
        let base = state["ok"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["path"] == path)
            .map(|f| f["hash"].clone())
            .unwrap();
        json!({ "path": path, "base": base })
    } else {
        json!({ "path": path })
    };
    let (point, cmd) = if device {
        ("device-deleted", "sync_delete")
    } else {
        ("window-deleted", "delete_entry")
    };
    let (heard, go) = hold(point, &m.id);
    let server = std::sync::Arc::clone(&m.r.server);
    let id = m.id.clone();
    let Mesa { owner, ana, .. } = m;
    let deleter = owner.call(cmd, args);
    let player = async {
        arrived(heard).await;
        // Another window's note lands on disk at that name now (its own
        // bookkeeping would wait for the folder's lock a device's deletion
        // holds).
        let key = verso_service::lock(&server.keys)
            .iter()
            .find(|(_, f)| **f == id)
            .map(|(k, _)| k.clone())
            .unwrap();
        let made = server.service.with_key(&key, |ws| {
            verso_service::ops::dispatch(
                ws,
                "create_note",
                json!({ "name": "Praça/Placa", "text": "zq nova\n" }),
            )
            .unwrap()
        });
        assert!(made.is_ok(), "{made:?}");
        let read = ana.call("read_note", json!({ "path": path })).await;
        let _ = go.send(());
        read
    };
    let (gone, read) = tokio::join!(deleter, player);
    assert!(gone.get("ok").is_some(), "{gone}");
    assert!(read.get("ok").is_none(), "the new note reached Ana: {read}");
    still_hidden(m, path).await;
}

#[test]
fn a_window_deletion_leaves_its_access_to_no_file_made_at_its_name() {
    block_on(async {
        let mut m = mesa().await;
        made_where_one_went(&mut m, false).await;
    });
}

#[test]
fn a_devices_deletion_leaves_its_access_to_no_file_made_at_its_name() {
    block_on(async {
        let mut m = mesa().await;
        made_where_one_went(&mut m, true).await;
    });
}

/// A copy of a past version of a note with access of its own, made beside
/// it: as hidden as the note (the maintainer, 2026-11-05), not under the
/// folder's access a new file takes.
#[test]
fn a_copy_of_a_hidden_notes_version_is_as_hidden_as_the_note() {
    block_on(async {
        let mut m = mesa().await;
        praca(&mut m).await;
        let path = hidden_note(&mut m, "Praça/Diário Zq").await;
        let list = m.owner.call("history_list", json!({ "path": path })).await;
        let id = list["ok"]["versions"][0]["id"].clone();
        assert!(!id.is_null(), "{list}");
        let copy = m
            .owner
            .call(
                "history_copy",
                json!({ "path": path, "id": id, "stamp": "2026-11-05 11h40", "lang": "pt" }),
            )
            .await;
        let copied = copy["ok"]["path"]
            .as_str()
            .unwrap_or_else(|| panic!("{copy}"))
            .to_owned();
        still_hidden(&mut m, &copied).await;
    });
}

/// A folder that holds a table, deleted and restored: the table comes back
/// with it as it was — its state, its rights, its log — so its players see
/// what they saw (the maintainer, 2026-11-05); emptied from the bin, the
/// table goes for good.
#[test]
fn a_tables_folder_restored_from_the_bin_is_the_table_it_was() {
    block_on(async {
        let mut m = mesa().await;
        let db = &m.r.server.db;
        db.campaign_drop(&m.id, "").unwrap();
        db.campaign_make(&m.id, "Mundo Zq").unwrap();
        db.campaign_right_set(
            &m.id,
            "Mundo Zq",
            std::slice::from_ref(&m.ana_id),
            crate::access::Right::CreatesNotes,
            true,
        )
        .unwrap();
        db.table_add(
            &m.id,
            &crate::db::TableRow {
                id: 0,
                table: "Mundo Zq".to_owned(),
                kind: "chat".to_owned(),
                account: m.ana_id.clone(),
                by_name: "Ana".to_owned(),
                at: "2026-11-05T12:00:00Z".to_owned(),
                path: None,
                pinned: false,
                secret: false,
                readers_hidden: false,
                body: "{}".to_owned(),
            },
        )
        .unwrap();
        crate::campaign::forget(&m.r.server, &m.id);
        let cripta = json!({ "path": "Mundo Zq/Cripta Zq.md" });
        let read = m.ana.call("read_note", cripta.clone()).await;
        assert_eq!(read["err"]["kind"], "not_found", "{read}");
        let gone = m
            .owner
            .call("delete_entry", json!({ "path": "Mundo Zq" }))
            .await;
        let bin = gone["ok"]["path"].as_str().unwrap().to_owned();
        let back = m
            .owner
            .call(
                "trash_restore",
                json!({ "path": bin, "today": "2026-11-05", "lang": "pt" }),
            )
            .await;
        assert_eq!(back["ok"]["path"], "Mundo Zq", "{back}");
        let db = &m.r.server.db;
        let roots: Vec<String> = db
            .campaigns_of(&m.id)
            .unwrap()
            .into_iter()
            .map(|c| c.root)
            .collect();
        assert_eq!(roots, ["Mundo Zq"]);
        let rights = db
            .campaign_right_players(&m.id, "Mundo Zq", crate::access::Right::CreatesNotes)
            .unwrap();
        assert_eq!(rights, [m.ana_id.clone()]);
        assert_eq!(db.table_count(&m.id, "Mundo Zq").unwrap(), 1);
        let read = m.ana.call("read_note", cripta).await;
        assert_eq!(read["err"]["kind"], "not_found", "{read}");
        // Emptied from the bin: gone for good.
        let gone = m
            .owner
            .call("delete_entry", json!({ "path": "Mundo Zq" }))
            .await;
        let bin = gone["ok"]["path"].as_str().unwrap().to_owned();
        let purged = m
            .owner
            .call("trash_delete", json!({ "paths": [bin] }))
            .await;
        assert!(purged.get("ok").is_some(), "{purged}");
        let db = &m.r.server.db;
        assert!(db.campaigns_of(&m.id).unwrap().is_empty());
        assert_eq!(db.campaign_unbinned(&m.id, ".trash").unwrap(), 0);
        assert_eq!(db.table_count(&m.id, &bin).unwrap(), 0);
    });
}
