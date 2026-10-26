// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Every file a person edits in the window co-edits live (ADR 0082 item
//! 12, decided by the maintainer on 2026-10-12): a board's room merges by
//! element with Excalidraw's own rule and writes the file a window's
//! converter made of exactly the state it holds; a text file and a base
//! are rooms as a note is. Against a real server, as `tests_rooms.rs`.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};
use yrs::updates::decoder::Decode;
use yrs::{Doc, GetString, Map, Text, Transact, Update};

use crate::collab_board::tests::put;
use crate::collab_board::{self, ELEMENTS, META};
use crate::tests::{Socket, block_on, call, connect, event_named, folder_id, next, sign_in, start};

async fn window(r: &crate::tests::Running, b: &crate::tests::Browser, id: &str) -> Socket {
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let o = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(o.get("ok").is_some(), "{o}");
    ws
}

/// Into the room of `path`: its kind, and its state in a document.
async fn join(ws: &mut Socket, n: u64, path: &str) -> (String, Doc) {
    let joined = call(ws, n, "collab_join", json!({ "path": path })).await;
    let kind = joined["ok"]["kind"].as_str().unwrap_or_default().to_owned();
    let doc = Doc::with_options(yrs::Options {
        offset_kind: yrs::OffsetKind::Utf16,
        ..Default::default()
    });
    let state = STANDARD
        .decode(joined["ok"]["update"].as_str().unwrap())
        .unwrap();
    doc.transact_mut()
        .apply_update(Update::decode_v1(&state).unwrap())
        .unwrap();
    (kind, doc)
}

fn apply(doc: &Doc, update: &[u8]) {
    doc.transact_mut()
        .apply_update(Update::decode_v1(update).unwrap())
        .unwrap();
}

async fn send(ws: &mut Socket, n: u64, path: &str, update: &[u8]) -> Value {
    call(
        ws,
        n,
        "collab_update",
        json!({ "path": path, "update": STANDARD.encode(update) }),
    )
    .await
}

/// A person's edit counted, as a window counts it.
fn edited(doc: &Doc, count: i64) -> Vec<u8> {
    let meta = doc.get_or_insert_map(META);
    let mut txn = doc.transact_mut();
    meta.insert(&mut txn, format!("edit:{}", doc.client_id()), count);
    txn.encode_update_v1()
}

fn seeded(doc: &Doc) -> Vec<u8> {
    let meta = doc.get_or_insert_map(META);
    let mut txn = doc.transact_mut();
    meta.insert(&mut txn, "seeded", true);
    txn.encode_update_v1()
}

/// The canvas a window's converter makes of a board whose elements are
/// all drawn (no cards): the drawing under `verso`, in the board's order.
fn canvas_of(doc: &Doc) -> String {
    let drawing: Vec<Value> = collab_board::elements(doc)
        .into_values()
        .filter(|e| e["isDeleted"] != true)
        .collect();
    json!({ "nodes": [], "edges": [], "verso": { "version": 1, "drawing": drawing } }).to_string()
}

fn sv(doc: &Doc) -> String {
    STANDARD.encode(collab_board::state_vector(doc))
}

async fn make_board(ws: &mut Socket, n: u64, path: &str) {
    let made = call(
        ws,
        n,
        "create_file",
        json!({ "path": path, "base64": STANDARD.encode("{\n\t\"nodes\":[],\n\t\"edges\":[]\n}") }),
    )
    .await;
    assert!(made.get("ok").is_some(), "{made}");
}

#[test]
fn two_windows_on_one_board_merge_by_element_and_the_file_is_the_converters() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut one = window(&r, &b, &id).await;
        let mut two = window(&r, &b, &id).await;
        make_board(&mut one, 2, "Mesa.canvas").await;
        let before = call(&mut one, 3, "read_text", json!({ "path": "Mesa.canvas" })).await;

        // The first window finds the file the room was made from, nothing
        // drawn, and draws it in: not an edit, so nothing is written.
        let (kind, a) = join(&mut one, 4, "Mesa.canvas").await;
        assert_eq!(kind, "board");
        {
            let meta = a.get_or_insert_map(META);
            let txn = a.transact();
            assert_eq!(
                meta.get(&txn, "base").map(|v| v.to_string(&txn)),
                before["ok"]["text"].as_str().map(str::to_owned)
            );
            assert!(meta.get(&txn, "seeded").is_none());
        }
        let seed = yrs::merge_updates_v1([
            put(
                &a,
                "r1",
                1,
                0,
                &json!({ "type": "rectangle", "x": 0, "index": "a1" }),
            )
            .as_slice(),
            put(
                &a,
                "t1",
                1,
                0,
                &json!({ "type": "text", "x": 0, "index": "a2" }),
            )
            .as_slice(),
            seeded(&a).as_slice(),
        ])
        .unwrap();
        assert!(
            send(&mut one, 5, "Mesa.canvas", &seed)
                .await
                .get("ok")
                .is_some()
        );
        let (_, c) = join(&mut two, 2, "Mesa.canvas").await;
        assert_eq!(collab_board::elements(&c).len(), 2);

        // At once: one moves the shape, the other edits the text — two
        // elements, both land, whatever order the room got them in.
        let moved = put(
            &a,
            "r1",
            2,
            11,
            &json!({ "type": "rectangle", "x": 50, "index": "a1" }),
        );
        let typed = put(
            &c,
            "t1",
            2,
            22,
            &json!({ "type": "text", "x": 0, "text": "olá", "index": "a2" }),
        );
        assert!(
            send(&mut two, 3, "Mesa.canvas", &typed)
                .await
                .get("ok")
                .is_some()
        );
        assert!(
            send(&mut one, 6, "Mesa.canvas", &moved)
                .await
                .get("ok")
                .is_some()
        );
        apply(&a, &typed);
        apply(&c, &moved);
        let mut third = window(&r, &b, &id).await;
        let (_, t) = join(&mut third, 2, "Mesa.canvas").await;
        let all = collab_board::elements(&t);
        assert_eq!(all["r1"]["x"], 50);
        assert_eq!(all["t1"]["text"], "olá");

        // The same element at once: the higher version wins; on a tie, the
        // lower nonce — the same on every side.
        let high = put(
            &a,
            "r1",
            4,
            900,
            &json!({ "type": "rectangle", "x": 400, "index": "a1" }),
        );
        let tie = put(
            &c,
            "r1",
            4,
            3,
            &json!({ "type": "rectangle", "x": 403, "index": "a1" }),
        );
        send(&mut one, 7, "Mesa.canvas", &high).await;
        send(&mut two, 4, "Mesa.canvas", &tie).await;
        apply(&a, &tie);
        apply(&c, &high);
        assert_eq!(collab_board::elements(&a)["r1"]["x"], 403);
        assert_eq!(collab_board::elements(&c)["r1"]["x"], 403);

        // A deletion and a drag at once: the deletion stands.
        let gone = put(
            &a,
            "t1",
            2 + 1_000_000,
            5,
            &json!({ "type": "text", "isDeleted": true, "index": "a2" }),
        );
        let dragged = put(
            &c,
            "t1",
            40,
            1,
            &json!({ "type": "text", "x": 999, "index": "a2" }),
        );
        send(&mut two, 5, "Mesa.canvas", &dragged).await;
        send(&mut one, 8, "Mesa.canvas", &gone).await;
        apply(&a, &dragged);
        apply(&c, &gone);
        let mut fourth = window(&r, &b, &id).await;
        let (_, f) = join(&mut fourth, 2, "Mesa.canvas").await;
        assert_eq!(collab_board::elements(&f)["t1"]["isDeleted"], true);

        // A person's edit leaves something to write: the file one window's
        // converter made of an older state is not written; the one of the
        // state the room holds is, laid as the core lays a board.
        let stale_at = sv(&a);
        let stale = canvas_of(&a);
        let mark = edited(&a, 1);
        send(&mut one, 9, "Mesa.canvas", &mark).await;
        apply(&c, &mark);
        let refused = call(
            &mut one,
            10,
            "collab_canvas",
            json!({ "path": "Mesa.canvas", "at": stale_at, "json": stale }),
        )
        .await;
        assert!(refused.get("ok").is_some(), "{refused}");
        let saved_early = call(
            &mut one,
            11,
            "collab_save",
            json!({ "path": "Mesa.canvas" }),
        )
        .await;
        assert_eq!(saved_early["err"]["kind"], "unavailable", "{saved_early}");
        let json = canvas_of(&a);
        let expected = call(
            &mut one,
            12,
            "board_preview",
            json!({ "path": "Mesa.canvas", "json": json }),
        )
        .await;
        let given = call(
            &mut one,
            13,
            "collab_canvas",
            json!({ "path": "Mesa.canvas", "at": sv(&a), "json": json }),
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        let saved = event_named(&mut two, "collab-saved").await;
        assert!(saved["revision"].is_string());
        let read = call(&mut two, 6, "read_text", json!({ "path": "Mesa.canvas" })).await;
        assert_eq!(read["ok"]["text"], expected["ok"]);
        let file: Value = serde_json::from_str(read["ok"]["text"].as_str().unwrap()).unwrap();
        let drawing = file["verso"]["drawing"].as_array().unwrap();
        assert_eq!(drawing.len(), 1, "{file}");
        assert_eq!(drawing[0]["id"], "r1");
        assert_eq!(drawing[0]["x"], 403);
        // Nothing beside it: an edit made in the room is never a copy.
        let files = call(&mut two, 7, "list_files", json!({})).await;
        let copies: Vec<&Value> = files["ok"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|f| {
                f.as_str()
                    .is_some_and(|f| f.contains("Mesa") && f != "Mesa.canvas")
            })
            .collect();
        assert!(copies.is_empty(), "{files}");
    });
}

/// Opening a board writes nothing (invariant 7): drawn in, measured again,
/// left — the file is as it was.
#[test]
fn a_board_opened_and_drawn_in_writes_nothing() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut one = window(&r, &b, &id).await;
        make_board(&mut one, 2, "Vazio.canvas").await;
        let before = call(&mut one, 3, "read_text", json!({ "path": "Vazio.canvas" })).await;
        let (_, a) = join(&mut one, 4, "Vazio.canvas").await;
        let seed = yrs::merge_updates_v1([
            put(&a, "r1", 1, 0, &json!({ "type": "rectangle" })).as_slice(),
            seeded(&a).as_slice(),
        ])
        .unwrap();
        send(&mut one, 5, "Vazio.canvas", &seed).await;
        // Measured again once its font came in: a version, not an edit.
        let measured = put(&a, "r1", 2, 7, &json!({ "type": "rectangle", "width": 11 }));
        send(&mut one, 6, "Vazio.canvas", &measured).await;
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        call(
            &mut one,
            7,
            "collab_leave",
            json!({ "path": "Vazio.canvas" }),
        )
        .await;
        let after = call(&mut one, 8, "read_text", json!({ "path": "Vazio.canvas" })).await;
        assert_eq!(before["ok"]["revision"], after["ok"]["revision"]);
        assert_eq!(before["ok"]["text"], after["ok"]["text"]);
    });
}

/// A change made outside a board's room: with nothing waiting the room
/// goes and the windows draw the file again; with edits waiting it stops
/// for the people in it to choose, and "mine" writes the room's board over
/// the disk's.
#[test]
fn a_board_changed_outside_closes_its_room_or_stops_it_to_choose() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut one = window(&r, &b, &id).await;
        let mut other = window(&r, &b, &id).await;
        make_board(&mut one, 2, "Fora.canvas").await;
        let (_, a) = join(&mut one, 3, "Fora.canvas").await;
        let seed = yrs::merge_updates_v1([
            put(&a, "r1", 1, 0, &json!({ "type": "rectangle" })).as_slice(),
            seeded(&a).as_slice(),
        ])
        .unwrap();
        send(&mut one, 4, "Fora.canvas", &seed).await;
        // Nothing waits: written from outside, the room closes.
        let now = call(&mut other, 2, "read_text", json!({ "path": "Fora.canvas" })).await;
        let w = call(
            &mut other,
            3,
            "write_text",
            json!({ "path": "Fora.canvas", "text": "{\"nodes\":[],\"edges\":[],\"x\":1}", "revision": now["ok"]["revision"] }),
        )
        .await;
        assert!(w.get("ok").is_some(), "{w}");
        let closed = event_named(&mut one, "collab-closed").await;
        assert_eq!(closed["path"], "Fora.canvas");

        // A room made again from the new file; an edit waits; the file
        // changes outside: stopped, both chosen from.
        let (_, a) = join(&mut one, 5, "Fora.canvas").await;
        {
            let meta = a.get_or_insert_map(META);
            let txn = a.transact();
            assert!(
                meta.get(&txn, "base")
                    .unwrap()
                    .to_string(&txn)
                    .contains("\"x\":1")
            );
        }
        let seed = yrs::merge_updates_v1([
            put(&a, "r1", 1, 0, &json!({ "type": "rectangle" })).as_slice(),
            seeded(&a).as_slice(),
        ])
        .unwrap();
        send(&mut one, 6, "Fora.canvas", &seed).await;
        let mine = yrs::merge_updates_v1([
            put(&a, "r1", 2, 9, &json!({ "type": "rectangle", "x": 77 })).as_slice(),
            edited(&a, 1).as_slice(),
        ])
        .unwrap();
        send(&mut one, 7, "Fora.canvas", &mine).await;
        let now = call(&mut other, 4, "read_text", json!({ "path": "Fora.canvas" })).await;
        call(
            &mut other,
            5,
            "write_text",
            json!({ "path": "Fora.canvas", "text": "{\"nodes\":[],\"edges\":[],\"x\":2}", "revision": now["ok"]["revision"] }),
        )
        .await;
        event_named(&mut one, "collab-conflict").await;
        // "Mine": the room's board over the disk's, once the room has the
        // file of its state.
        call(
            &mut one,
            8,
            "collab_canvas",
            json!({ "path": "Fora.canvas", "at": sv(&a), "json": canvas_of(&a) }),
        )
        .await;
        let kept = call(
            &mut one,
            9,
            "collab_resolve",
            json!({ "path": "Fora.canvas", "keep": "mine" }),
        )
        .await;
        assert!(kept["ok"].is_string(), "{kept}");
        let read = call(&mut other, 6, "read_text", json!({ "path": "Fora.canvas" })).await;
        let file: Value = serde_json::from_str(read["ok"]["text"].as_str().unwrap()).unwrap();
        assert_eq!(file["verso"]["drawing"][0]["x"], 77, "{file}");
    });
}

/// A text file and a base: rooms as a note's — the edits merge letter by
/// letter, the room writes the file as text, and a `write_text` from
/// elsewhere goes through the room.
#[test]
fn a_text_file_and_a_base_are_co_edited_like_a_note() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut one = window(&r, &b, &id).await;
        let mut two = window(&r, &b, &id).await;
        for (n, (path, start_text, mine, theirs)) in [
            ("lista.txt", "um\ndois\n", "zero\n", "três\n"),
            (
                "Tarefas.base",
                "views:\n  - type: table\n",
                "filters:\n  and: []\n",
                "    name: Tudo\n",
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let n = 10 * (n as u64 + 1);
            let made = call(
                &mut one,
                n,
                "create_file",
                json!({ "path": path, "base64": STANDARD.encode(start_text) }),
            )
            .await;
            assert!(made.get("ok").is_some(), "{made}");
            let (kind, a) = join(&mut one, n + 1, path).await;
            assert_eq!(kind, "text");
            let (_, c) = join(&mut two, n + 1, path).await;
            let ta = a.get_or_insert_text(crate::collab::TEXT);
            let tc = c.get_or_insert_text(crate::collab::TEXT);
            assert_eq!(tc.get_string(&c.transact()), start_text);
            // One types at the start, the other at the end, at once.
            let u1 = {
                let mut txn = a.transact_mut();
                ta.insert(&mut txn, 0, mine);
                txn.encode_update_v1()
            };
            let u2 = {
                let mut txn = c.transact_mut();
                let len = start_text.encode_utf16().count() as u32;
                tc.insert(&mut txn, len, theirs);
                txn.encode_update_v1()
            };
            send(&mut one, n + 2, path, &u1).await;
            send(&mut two, n + 2, path, &u2).await;
            apply(&a, &u2);
            apply(&c, &u1);
            let saved = call(&mut one, n + 3, "collab_save", json!({ "path": path })).await;
            assert!(saved["ok"].is_string(), "{saved}");
            let read = call(&mut two, n + 3, "read_text", json!({ "path": path })).await;
            assert_eq!(read["ok"]["text"], format!("{mine}{start_text}{theirs}"));
            // A write from elsewhere, over the revision the room wrote, goes
            // through the room: merged, never a change from outside.
            let w = call(
                &mut two,
                n + 4,
                "write_text",
                json!({ "path": path, "text": format!("{mine}{start_text}{theirs}# fim\n"), "revision": read["ok"]["revision"] }),
            )
            .await;
            assert!(w.get("ok").is_some(), "{w}");
            let update = event_named(&mut one, "collab-update").await;
            apply(
                &a,
                &STANDARD.decode(update["update"].as_str().unwrap()).unwrap(),
            );
            assert_eq!(
                ta.get_string(&a.transact()),
                format!("{mine}{start_text}{theirs}# fim\n")
            );
            call(&mut one, n + 5, "collab_leave", json!({ "path": path })).await;
            call(&mut two, n + 6, "collab_leave", json!({ "path": path })).await;
        }
    });
}

/// The board room's limits (threat-model.md): an update that puts in more
/// elements than one update may is refused, and a file is handed only to a
/// board's room.
#[test]
fn a_board_rooms_limits_are_kept() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = folder_id(&r, &b).await;
        let mut one = window(&r, &b, &id).await;
        make_board(&mut one, 2, "Grande.canvas").await;
        let (_, a) = join(&mut one, 3, "Grande.canvas").await;
        let many = {
            let map = a.get_or_insert_map(ELEMENTS);
            let mut txn = a.transact_mut();
            for i in 0..(collab_board::INSERTS_MOST + 1) {
                map.insert(&mut txn, format!("e{i}\n1\n0"), "{}");
            }
            txn.encode_update_v1()
        };
        let refused = send(&mut one, 4, "Grande.canvas", &many).await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
        assert!(
            refused["err"]["message"]
                .as_str()
                .unwrap()
                .contains("10000")
        );
        // A file past its size: `collab_board::tests`, without sending
        // 16 MB through a test's socket.
        // A file handed for a note's room is refused: a note is text.
        call(&mut one, 6, "collab_join", json!({ "path": "Sessao.md" })).await;
        let refused = call(
            &mut one,
            7,
            "collab_canvas",
            json!({ "path": "Sessao.md", "at": sv(&a), "json": "{}" }),
        )
        .await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
    });
}

/// What `ws` hears in `ms`, as events.
async fn hear(ws: &mut Socket, ms: u64) -> Vec<Value> {
    use futures_util::StreamExt;
    let mut out = Vec::new();
    let until = tokio::time::Instant::now() + std::time::Duration::from_millis(ms);
    while let Ok(Some(Ok(m))) = tokio::time::timeout_at(until, ws.next()).await {
        if let tokio_tungstenite::tungstenite::Message::Text(t) = m {
            out.push(serde_json::from_str(&t).unwrap_or(Value::Null));
        }
    }
    out
}

#[test]
fn a_reader_is_told_when_a_boards_room_writes_its_file() {
    block_on(async {
        // A reader is never in a board's room (ADR 0090 item 5): it follows
        // the board by its file, so it hears of each save the room makes.
        let (_r, mut owner, mut reader, _id) = crate::tests_secret::folder_with_a_reader().await;
        make_board(&mut owner, 40, "Grupo.canvas").await;
        let (_, a) = join(&mut owner, 41, "Grupo.canvas").await;
        let seed = yrs::merge_updates_v1([
            put(
                &a,
                "r1",
                1,
                0,
                &json!({ "type": "rectangle", "x": 0, "index": "a1" }),
            )
            .as_slice(),
            seeded(&a).as_slice(),
        ])
        .unwrap();
        assert!(
            send(&mut owner, 42, "Grupo.canvas", &seed)
                .await
                .get("ok")
                .is_some()
        );
        // What the reader heard of the board being made is not the save's.
        hear(&mut reader, 400).await;
        let mark = edited(&a, 1);
        send(&mut owner, 43, "Grupo.canvas", &mark).await;
        let json = canvas_of(&a);
        let given = call(
            &mut owner,
            44,
            "collab_canvas",
            json!({ "path": "Grupo.canvas", "at": sv(&a), "json": json }),
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        let heard = hear(&mut reader, 1500).await;
        assert!(
            heard.iter().any(|e| e["event"] == "folder-changed"
                && e["payload"]["changed"] == json!(["Grupo.canvas"])),
            "{heard:?}"
        );
        // And it is the file as a reader is served it.
        let read = call(
            &mut reader,
            5,
            "read_text",
            json!({ "path": "Grupo.canvas" }),
        )
        .await;
        assert!(
            read["ok"]["text"]
                .as_str()
                .is_some_and(|t| t.contains("r1")),
            "{read}"
        );
    });
}
