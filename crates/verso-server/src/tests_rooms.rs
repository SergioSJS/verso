// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A write that is not a keystroke — a base's cell, a PDF's quote, the
//! tree's label — to a note someone else has in its room joins the room to
//! be made there (ADR 0082, the writes decided on 2026-10-12): the window
//! asks `collab_present`, joins, sends its one edit, has the room write
//! the file, and leaves; the others stay in.

use base64::Engine;
use serde_json::json;
use yrs::updates::decoder::Decode;
use yrs::{GetString, Text, Transact};

use crate::collab;
use crate::tests::{Socket, block_on, call, connect, folder_id, next, sign_in, start};

async fn window(r: &crate::tests::Running, b: &crate::tests::Browser, id: &str) -> Socket {
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let o = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(o.get("ok").is_some(), "{o}");
    ws
}

#[test]
fn a_window_that_writes_to_a_note_someone_is_in_joins_its_room_and_leaves() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut one = window(&r, &b, &id).await;
        let mut two = window(&r, &b, &id).await;
        let present = |p: serde_json::Value| p["ok"].as_bool();
        // Nobody in the note: the file is written as before.
        let before = call(
            &mut two,
            2,
            "collab_present",
            json!({ "path": "Sessao.md" }),
        )
        .await;
        assert_eq!(present(before), Some(false));

        // Window one has the note in its room.
        call(&mut one, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        let now = call(
            &mut two,
            3,
            "collab_present",
            json!({ "path": "Sessao.md" }),
        )
        .await;
        assert_eq!(present(now), Some(true));
        let other = call(&mut two, 4, "collab_present", json!({ "path": "Outra.md" })).await;
        assert_eq!(present(other), Some(false));

        // Window two joins for its one write: the room's text, an edit at
        // its end, sent, written at once.
        let joined = call(&mut two, 5, "collab_join", json!({ "path": "Sessao.md" })).await;
        let doc = yrs::Doc::with_options(yrs::Options {
            offset_kind: yrs::OffsetKind::Utf16,
            ..Default::default()
        });
        let state = base64::engine::general_purpose::STANDARD
            .decode(joined["ok"]["update"].as_str().unwrap())
            .unwrap();
        doc.transact_mut()
            .apply_update(yrs::Update::decode_v1(&state).unwrap())
            .unwrap();
        let text = doc.get_or_insert_text(collab::TEXT);
        let was = text.get_string(&doc.transact());
        let edit = {
            let mut txn = doc.transact_mut();
            let len = was.encode_utf16().count() as u32;
            text.insert(&mut txn, len, "\n> uma citação\n");
            txn.encode_update_v1()
        };
        let update = base64::engine::general_purpose::STANDARD.encode(edit);
        let sent = call(
            &mut two,
            6,
            "collab_update",
            json!({ "path": "Sessao.md", "update": update }),
        )
        .await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let saved = call(&mut two, 7, "collab_save", json!({ "path": "Sessao.md" })).await;
        assert!(saved["ok"].is_string(), "{saved}");
        call(&mut two, 8, "collab_leave", json!({ "path": "Sessao.md" })).await;

        // The file has it, written by the room; window one is still in.
        let read = call(&mut two, 9, "read_note", json!({ "path": "Sessao.md" })).await;
        assert_eq!(
            read["ok"]["text"].as_str().unwrap(),
            format!("{was}\n> uma citação\n")
        );
        let still = call(
            &mut two,
            10,
            "collab_present",
            json!({ "path": "Sessao.md" }),
        )
        .await;
        assert_eq!(present(still), Some(true));

        // The last one leaves: nobody in the note again.
        call(&mut one, 3, "collab_leave", json!({ "path": "Sessao.md" })).await;
        let after = call(
            &mut two,
            11,
            "collab_present",
            json!({ "path": "Sessao.md" }),
        )
        .await;
        assert_eq!(present(after), Some(false));
    });
}

/// A window back in its room sends its whole state, which the room holds
/// already: an edit that changes nothing. A change from outside right
/// after — before the room's quiet wait ends — finds nothing waiting to
/// be written, so it enters the room as one edit; it does not stop the
/// room for the people in it to choose (ADR 0082, a change from outside).
#[test]
fn an_edit_that_changes_nothing_leaves_nothing_waiting_for_a_change_from_outside() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let key = opened["ok"]["key"].as_str().unwrap().to_owned();
        let joined = call(&mut ws, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        // The room's own state, sent back as a window does on its return.
        let whole = joined["ok"]["update"].as_str().unwrap().to_owned();
        let sent = call(
            &mut ws,
            3,
            "collab_update",
            json!({ "path": "Sessao.md", "update": whole }),
        )
        .await;
        assert!(sent.get("ok").is_some(), "{sent}");
        {
            use std::io::Write;
            let dir = r.campanha();
            let mut f = tempfile::NamedTempFile::new_in(&dir).unwrap();
            f.write_all(b"# Sessao\n\nde fora\n").unwrap();
            f.persist(dir.join("Sessao.md")).unwrap();
        }
        collab::changed_outside(&r.server, &key, &["Sessao.md".to_owned()], &[]);
        // In the room, and the room still writes.
        let again = call(&mut ws, 4, "collab_join", json!({ "path": "Sessao.md" })).await;
        let doc = yrs::Doc::new();
        let state = base64::engine::general_purpose::STANDARD
            .decode(again["ok"]["update"].as_str().unwrap())
            .unwrap();
        doc.transact_mut()
            .apply_update(yrs::Update::decode_v1(&state).unwrap())
            .unwrap();
        let text = doc.get_or_insert_text(collab::TEXT);
        assert_eq!(text.get_string(&doc.transact()), "# Sessao\n\nde fora\n");
        let saved = call(&mut ws, 5, "collab_save", json!({ "path": "Sessao.md" })).await;
        assert!(saved["ok"].is_string(), "{saved}");
    });
}

/// An update `yrs` 0.28 panics on as it applies it — the room's own Yjs
/// client named with no runs (ADR 0083 item 14, the fuzz target `note`'s
/// `client-of-no-runs.bin`) — is refused; the room is closed and made
/// again from its file, which the windows read: what was typed since the
/// room last wrote is lost, nothing else.
#[test]
fn an_update_yrs_panics_on_is_refused_and_the_room_is_made_again() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut one = window(&r, &b, &id).await;
        let mut two = window(&r, &b, &id).await;
        let join = |p: serde_json::Value| {
            let state = base64::engine::general_purpose::STANDARD
                .decode(p["ok"]["update"].as_str().unwrap())
                .unwrap();
            yrs::Update::decode_v1(&state).unwrap()
        };
        let first = join(call(&mut one, 2, "collab_join", json!({ "path": "Sessao.md" })).await);
        call(&mut two, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        // The room's client: the one its state holds.
        let room = first
            .state_vector()
            .iter()
            .next()
            .map(|(c, _)| c.get())
            .unwrap();
        let mut bad = vec![1, 0];
        let mut n = room;
        while n >= 0x80 {
            bad.push(u8::try_from(n & 0x7f).unwrap() | 0x80);
            n >>= 7;
        }
        bad.push(u8::try_from(n).unwrap());
        bad.extend([0, 0]);
        let sent = call(
            &mut two,
            3,
            "collab_update",
            json!({ "path": "Sessao.md",
                "update": base64::engine::general_purpose::STANDARD.encode(&bad) }),
        )
        .await;
        assert_eq!(sent["err"]["message"], collab::BROKEN, "{sent}");
        // Said in the log: the folder, the note, the member's account.
        let said = crate::log::said("the room could not integrate");
        assert!(
            said.iter().any(|l| l.starts_with(&format!(
                "WARN room {id}/Sessao.md: an update from account "
            ))),
            "{said:?}"
        );
        // Every window hears the room closed, and joins one made anew.
        let closed = crate::tests::event_named(&mut one, "collab-closed").await;
        assert_eq!(closed["path"], "Sessao.md");
        let again = call(&mut one, 3, "collab_join", json!({ "path": "Sessao.md" })).await;
        let doc = yrs::Doc::with_options(yrs::Options {
            offset_kind: yrs::OffsetKind::Utf16,
            ..Default::default()
        });
        doc.transact_mut().apply_update(join(again)).unwrap();
        let text = doc.get_or_insert_text(collab::TEXT);
        let read = call(&mut one, 4, "read_note", json!({ "path": "Sessao.md" })).await;
        assert_eq!(
            text.get_string(&doc.transact()),
            read["ok"]["text"].as_str().unwrap()
        );
        // And it still takes an edit.
        let edit = {
            let mut txn = doc.transact_mut();
            text.insert(&mut txn, 0, "> ");
            txn.encode_update_v1()
        };
        let ok = call(
            &mut one,
            5,
            "collab_update",
            json!({ "path": "Sessao.md",
                "update": base64::engine::general_purpose::STANDARD.encode(edit) }),
        )
        .await;
        assert!(ok.get("ok").is_some(), "{ok}");
    });
}

/// A window's updates sent fast, without waiting for the answers, are
/// taken in the order they were sent (ADR 0083 item 14): the room holds
/// none aside, so each is taken and the room's text is the window's. Half
/// of them delete what the one before typed: a deletion that depends on
/// an earlier update of the same connection applies because it comes
/// after it, not because the room kept it aside.
#[test]
fn a_windows_updates_sent_at_once_are_taken_in_order() {
    use futures_util::SinkExt;
    use tokio_tungstenite::tungstenite::Message;
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = window(&r, &b, &id).await;
        let joined = call(&mut ws, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        let doc = yrs::Doc::with_options(yrs::Options {
            offset_kind: yrs::OffsetKind::Utf16,
            ..Default::default()
        });
        let state = base64::engine::general_purpose::STANDARD
            .decode(joined["ok"]["update"].as_str().unwrap())
            .unwrap();
        doc.transact_mut()
            .apply_update(yrs::Update::decode_v1(&state).unwrap())
            .unwrap();
        let text = doc.get_or_insert_text(collab::TEXT);
        let mut updates = Vec::new();
        for i in 0..60_u32 {
            let mut txn = doc.transact_mut();
            if i % 2 == 0 {
                text.insert(&mut txn, 0, &format!("<{i}>"));
            } else {
                // What the update before typed, deleted again but its
                // first character.
                let len = format!("<{}>", i - 1).encode_utf16().count() as u32;
                text.remove_range(&mut txn, 1, len - 1);
            }
            updates.push(txn.encode_update_v1());
        }
        for (n, u) in updates.iter().enumerate() {
            let args = json!({ "path": "Sessao.md",
                "update": base64::engine::general_purpose::STANDARD.encode(u) });
            ws.send(Message::Text(
                json!({ "id": 100 + n, "cmd": "collab_update", "args": args })
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        }
        for _ in &updates {
            let answer = next(&mut ws).await;
            assert!(answer.get("ok").is_some(), "{answer}");
        }
        let saved = call(&mut ws, 3, "collab_save", json!({ "path": "Sessao.md" })).await;
        assert!(saved["ok"].is_string(), "{saved}");
        let read = call(&mut ws, 4, "read_note", json!({ "path": "Sessao.md" })).await;
        assert_eq!(
            read["ok"]["text"].as_str().unwrap(),
            text.get_string(&doc.transact())
        );
    });
}

/// One file, one room: a path written another way — `./Sessao.md` — is
/// the same note, and reaches the same room (ADR 0073 item 7).
#[test]
fn a_path_written_another_way_reaches_the_same_room() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut one = window(&r, &b, &id).await;
        let mut two = window(&r, &b, &id).await;
        let joined = call(&mut one, 2, "collab_join", json!({ "path": "./Sessao.md" })).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let now = call(
            &mut two,
            3,
            "collab_present",
            json!({ "path": "Sessao.md" }),
        )
        .await;
        assert_eq!(
            now["ok"].as_bool(),
            Some(true),
            "`./Sessao.md` and `Sessao.md` are two rooms: {now}"
        );
        let again = call(&mut two, 4, "collab_join", json!({ "path": "Sessao.md" })).await;
        assert!(again.get("ok").is_some(), "{again}");
        let back = call(
            &mut one,
            5,
            "collab_present",
            json!({ "path": "./Sessao.md" }),
        )
        .await;
        assert_eq!(back["ok"].as_bool(), Some(true), "{back}");
    });
}

/// A room whose text could not be written when another program rewrote the
/// note is kept after the last one leaves, and a rename that would leave
/// it behind is refused (moved here from `tests.rs`, ADR 0067).
#[test]
fn a_room_that_could_not_write_is_kept_and_stops_a_rename() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        next(&mut ws).await;
        let opened = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
        let key = opened["ok"]["key"].as_str().unwrap().to_owned();
        let joined = call(&mut ws, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        let doc = yrs::Doc::with_options(yrs::Options {
            offset_kind: yrs::OffsetKind::Utf16,
            ..Default::default()
        });
        let state = base64::engine::general_purpose::STANDARD
            .decode(joined["ok"]["update"].as_str().unwrap())
            .unwrap();
        doc.transact_mut()
            .apply_update(yrs::Update::decode_v1(&state).unwrap())
            .unwrap();
        let text = doc.get_or_insert_text(collab::TEXT);
        let typed = {
            let mut txn = doc.transact_mut();
            let len = text.get_string(&txn).encode_utf16().count() as u32;
            text.insert(&mut txn, len, "\ndigitado e ainda não gravado\n");
            txn.encode_update_v1()
        };
        let update = base64::engine::general_purpose::STANDARD.encode(typed);
        call(
            &mut ws,
            3,
            "collab_update",
            json!({ "path": "Sessao.md", "update": update }),
        )
        .await;
        // Another program rewrites the note before the room writes it.
        {
            use std::io::Write;
            let dir = r.campanha();
            let mut f = tempfile::NamedTempFile::new_in(&dir).unwrap();
            f.write_all(b"# Sessao\n\nde fora\n").unwrap();
            f.persist(dir.join("Sessao.md")).unwrap();
        }
        collab::changed_outside(&r.server, &key, &["Sessao.md".to_owned()], &[]);
        // The last one leaves: the typed text stays in the room.
        call(&mut ws, 4, "collab_leave", json!({ "path": "Sessao.md" })).await;
        assert!(r.server.rooms.has(&key, "Sessao.md"));
        // A rename would leave it behind: refused until someone chooses.
        let renamed = call(
            &mut ws,
            5,
            "rename_note",
            json!({ "from": "Sessao.md", "to": "Outra.md" }),
        )
        .await;
        assert_eq!(renamed["err"]["kind"], "changed", "{renamed}");
        let still = call(&mut ws, 6, "read_note", json!({ "path": "Sessao.md" })).await;
        assert_eq!(still["ok"]["text"], "# Sessao\n\nde fora\n");
    });
}
