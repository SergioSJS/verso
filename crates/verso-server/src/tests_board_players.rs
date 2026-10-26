// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A board a player edits (ADR 0113 section H, step S7), against a real
//! server: Ana, who may edit the table's board, joins a shadow of its room
//! — the elements she sees, a locked marker with the same id for the card
//! of a file she does not, no secret pin —, her edits reach the game
//! master's window, and an edit that touches what she does not see is
//! refused whole. Bia only sees the board: she follows its file.
//!
//! The canaries of `tests_board_players::LEAKS` are in everything hidden;
//! every frame Ana hears is checked for them, as ADR 0087's tests do.

use std::sync::atomic::{AtomicU64, Ordering};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use yrs::updates::decoder::Decode;
use yrs::{Doc, Map, Transact, Update};

use crate::access::{Level, NodeSet};
use crate::collab_board::tests::put;
use crate::collab_board::{self, META};
use crate::tests_campaign::{Mesa, Win, mesa};

/// What only the hidden things of the board hold: the pin, what belongs to
/// it, the hidden note's file and words. The marker keeps its id, so `c-hid`
/// is not here.
pub(crate) const LEAKS: &[&str] = &[
    "zqpin",
    "zqedge",
    "zqdraw",
    "zqlabel",
    "Barão Zq",
    "zqbody",
    "zqhidcolor",
];

/// What Ana does see of the board's text: a secret block of a text card is
/// hers, as a note she edits (ADR 0087 item 5).
const HERS: &str = "zqblock";

pub(crate) const PATH: &str = "Quadro.canvas";

static IDS: AtomicU64 = AtomicU64::new(900);

pub(crate) fn file() -> String {
    json!({
        "nodes": [
            { "id": "c-open", "type": "file", "file": "Livre.md", "x": 0, "y": 0, "width": 200, "height": 100 },
            { "id": "c-hid", "type": "file", "file": "Barão Zq.md", "x": 300, "y": 0, "width": 200, "height": 100, "color": "zqhidcolor" },
            { "id": "note", "type": "text", "text": "palavra\n> [!secret] zqblock\n> do mestre", "x": 0, "y": 200, "width": 200, "height": 100 },
            { "id": "zqpin", "type": "text", "text": "zqpinboard", "verso": { "secret": true }, "x": 600, "y": 0, "width": 40, "height": 40 },
        ],
        "edges": [ { "id": "zqedge", "fromNode": "c-open", "toNode": "zqpin" } ],
        "verso": { "version": 1, "drawing": [
            { "id": "zqdraw", "type": "arrow", "startBinding": { "elementId": "zqpin" }, "x": 1, "y": 1 },
            { "id": "zqlabel", "type": "text", "text": "zqlabeltext", "containerId": "zqdraw" },
            { "id": "free", "type": "rectangle", "x": 9, "y": 9 },
        ] },
    })
    .to_string()
}

/// The elements the game master's window draws of that file.
fn elements() -> Vec<(&'static str, Value)> {
    let node = |id: &str, n: Value| {
        json!({ "type": "embeddable", "x": n["x"], "y": n["y"], "width": n["width"], "height": n["height"],
            "link": "https://verso.invalid/board-node", "customData": { "canvas": n }, "id": id })
    };
    let nodes: Vec<Value> = serde_json::from_str::<Value>(&file()).unwrap()["nodes"]
        .as_array()
        .unwrap()
        .clone();
    let mut out = Vec::new();
    for (i, n) in nodes.into_iter().enumerate() {
        let id = n["id"].as_str().unwrap().to_owned();
        let mut e = node(&id, n);
        e["index"] = json!(format!("a{i}"));
        if id == "c-open" {
            e["boundElements"] = json!([{ "id": "zqedge", "type": "arrow" }]);
        }
        out.push((Box::leak(id.into_boxed_str()) as &str, e));
    }
    out.push((
        "zqedge",
        json!({ "type": "arrow", "x": 0, "y": 0, "width": 5, "height": 5, "index": "a8",
            "startBinding": { "elementId": "c-open" }, "endBinding": { "elementId": "zqpin" },
            "customData": { "canvas": { "id": "zqedge", "fromNode": "c-open", "toNode": "zqpin" } } }),
    ));
    out.push((
        "zqdraw",
        json!({ "type": "arrow", "index": "a9", "startBinding": { "elementId": "zqpin" } }),
    ));
    out.push((
        "zqlabel",
        json!({ "type": "text", "index": "aa", "text": "zqlabeltext", "containerId": "zqdraw" }),
    ));
    out.push((
        "free",
        json!({ "type": "rectangle", "index": "ab", "x": 9, "y": 9 }),
    ));
    out
}

pub(crate) fn access(m: &Mesa, rows: &[(&str, Level)]) {
    let set = NodeSet {
        whole: Level::See,
        rows: rows.iter().map(|(a, l)| ((*a).to_owned(), *l)).collect(),
    };
    m.r.server.db.access_put(&m.id, PATH, set).unwrap();
    crate::campaign::forget(&m.r.server, &m.id);
}

pub(crate) fn bytes(b64: &str) -> Vec<u8> {
    STANDARD.decode(b64).unwrap()
}

pub(crate) fn apply(doc: &Doc, update: &[u8]) {
    doc.transact_mut()
        .apply_update(Update::decode_v1(update).unwrap())
        .unwrap();
}

/// Every frame that is not the answer to `id`, and the answer.
pub(crate) async fn exchange(
    win: &mut Win,
    cmd: &str,
    args: Value,
    canaries: &[&str],
) -> (Value, Vec<Value>) {
    let id = IDS.fetch_add(1, Ordering::SeqCst);
    win.ws
        .send(Message::Text(
            json!({ "id": id, "cmd": cmd, "args": args })
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    let mut events = Vec::new();
    loop {
        let m = tokio::time::timeout(std::time::Duration::from_secs(30), win.ws.next())
            .await
            .expect("an answer in time")
            .unwrap()
            .unwrap();
        let Message::Text(t) = m else { continue };
        clean(cmd, &t, canaries);
        let v: Value = serde_json::from_str(&t).unwrap_or(Value::Null);
        if v.get("id").and_then(Value::as_u64) == Some(id) {
            return (v, events);
        }
        events.push(v);
    }
}

pub(crate) fn clean(what: &str, text: &str, canaries: &[&str]) {
    let all = crate::tests_secret::heard(text);
    for s in canaries {
        assert!(!all.contains(s), "{what}: {s:?} reached a player: {text}");
    }
}

/// What `win` hears for `ms`, each frame checked.
pub(crate) async fn hear(win: &mut Win, ms: u64, canaries: &[&str]) -> Vec<Value> {
    let mut out = Vec::new();
    let until = tokio::time::Instant::now() + std::time::Duration::from_millis(ms);
    while let Ok(Some(Ok(m))) = tokio::time::timeout_at(until, win.ws.next()).await {
        if let Message::Text(t) = m {
            clean("an event", &t, canaries);
            out.push(serde_json::from_str(&t).unwrap_or(Value::Null));
        }
    }
    out
}

/// A window's copy of a room: its document, kept up by the events.
pub(crate) struct Copy {
    pub(crate) doc: Doc,
    pub(crate) epoch: String,
}

impl Copy {
    pub(crate) fn take(&self, events: &[Value]) -> usize {
        let mut n = 0;
        for e in events {
            if e["event"] == "collab-update" && e["payload"]["path"] == PATH {
                apply(&self.doc, &bytes(e["payload"]["update"].as_str().unwrap()));
                n += 1;
            }
        }
        n
    }
    pub(crate) fn take_into(doc: &Doc, events: &[Value]) {
        for e in events {
            if e["event"] == "collab-update" && e["payload"]["path"] == PATH {
                apply(doc, &bytes(e["payload"]["update"].as_str().unwrap()));
            }
        }
    }
    pub(crate) fn element(&self, id: &str) -> Option<Value> {
        collab_board::elements(&self.doc).remove(id)
    }
    pub(crate) fn has_text(&self, needle: &str) -> bool {
        collab_board::elements(&self.doc)
            .values()
            .any(|e| e.to_string().contains(needle))
    }
    pub(crate) fn base(&self) -> String {
        let meta = self.doc.get_or_insert_map(META);
        let txn = self.doc.transact();
        meta.get(&txn, "base")
            .map(|v| v.to_string(&txn))
            .unwrap_or_default()
    }
}

pub(crate) async fn join(win: &mut Win, canaries: &[&str]) -> (Value, Copy, Vec<Value>) {
    let (joined, events) = exchange(win, "collab_join", json!({ "path": PATH }), canaries).await;
    let doc = Doc::new();
    if let Some(u) = joined["ok"]["update"].as_str() {
        apply(&doc, &bytes(u));
    }
    let epoch = joined["ok"]["epoch"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    (joined, Copy { doc, epoch }, events)
}

pub(crate) async fn send(win: &mut Win, update: &[u8], canaries: &[&str]) -> (Value, Vec<Value>) {
    exchange(
        win,
        "collab_update",
        json!({ "path": PATH, "update": STANDARD.encode(update) }),
        canaries,
    )
    .await
}

pub(crate) fn edited(doc: &Doc, n: i64) -> Vec<u8> {
    let meta = doc.get_or_insert_map(META);
    let mut txn = doc.transact_mut();
    meta.insert(&mut txn, format!("edit:{}", doc.client_id()), n);
    txn.encode_update_v1()
}

pub(crate) fn seeded(doc: &Doc) -> Vec<u8> {
    let meta = doc.get_or_insert_map(META);
    let mut txn = doc.transact_mut();
    meta.insert(&mut txn, "seeded", true);
    txn.encode_update_v1()
}

pub(crate) fn refused(v: &Value) -> bool {
    v["err"]["kind"] == "refused"
}

/// The game master's window draws the file into the room.
pub(crate) async fn master_seeds(m: &mut Mesa) -> Doc {
    let made = m
        .owner
        .call(
            "create_file",
            json!({ "path": PATH, "base64": STANDARD.encode(file()) }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    let (_, copy, _) = join(&mut m.owner, &[]).await;
    let mut updates: Vec<Vec<u8>> = elements()
        .into_iter()
        .map(|(id, e)| put(&copy.doc, id, 1, 5, &e))
        .collect();
    updates.push(seeded(&copy.doc));
    let seed = yrs::merge_updates_v1(updates.iter().map(Vec::as_slice)).unwrap();
    let (sent, _) = send(&mut m.owner, &seed, &[]).await;
    assert!(sent.get("ok").is_some(), "{sent}");
    copy.doc
}

#[test]
fn a_player_who_edits_a_board_is_shown_what_she_sees_and_nothing_else() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let gm = master_seeds(&mut m).await;

        let (joined, ana, events) = join(&mut m.ana, LEAKS).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        assert_eq!(joined["ok"]["kind"], "board");
        assert_eq!(joined["ok"]["read_only"], false);
        assert!(
            events.iter().all(|e| e["event"] != "collab-update"),
            "{events:?}"
        );
        // Her room is not the game master's: another epoch, and the file she
        // was made from is her projection.
        let all = collab_board::elements(&ana.doc);
        let ids: Vec<&String> = all.keys().collect();
        assert_eq!(ids, ["c-hid", "c-open", "free", "note"], "{all:?}");
        // The card of a file she does not see: the same id, a locked card.
        let hid = &all["c-hid"];
        assert_eq!(hid["locked"], true);
        assert_eq!(hid["customData"]["canvas"]["type"], "text");
        assert!(hid["customData"]["canvas"].get("file").is_none());
        assert!(
            hid["customData"]["canvas"]["text"]
                .as_str()
                .unwrap()
                .contains("🔒")
        );
        // Her own cards are as the game master drew them, the text whole
        // (whoever edits sees the secret blocks).
        assert_eq!(all["c-open"]["customData"]["canvas"]["file"], "Livre.md");
        assert!(ana.has_text(HERS));
        // The card keeps no edge to the pin in its list.
        assert_eq!(all["c-open"]["boundElements"], json!([]));
        // The file she was made from: no pin, no edge, no drawing of it.
        let base = ana.base();
        for leak in LEAKS {
            assert!(!base.contains(leak), "{leak} in the base: {base}");
        }
        assert!(base.contains("free"));
        // The game master's room is whole.
        assert!(collab_board::elements(&gm).contains_key("zqpin"));

        // The game master moves the hidden card, the pin and its edge, adds
        // a pin: nothing of the pin reaches her; the hidden card moves as a
        // marker, still without its file.
        let moves = [
            put(&gm, "c-hid", 2, 8, &{
                let mut e = collab_board::elements(&gm)["c-hid"].clone();
                e["x"] = json!(350);
                e
            }),
            put(&gm, "zqpin", 2, 8, &{
                let mut e = collab_board::elements(&gm)["zqpin"].clone();
                e["x"] = json!(650);
                e
            }),
            put(
                &gm,
                "zqpin2",
                1,
                1,
                &json!({ "type": "embeddable", "index": "b0",
                "customData": { "canvas": { "id": "zqpin2", "type": "text", "text": "zqpin outro", "verso": { "secret": true } } } }),
            ),
            put(&gm, "note", 2, 8, &{
                let mut e = collab_board::elements(&gm)["note"].clone();
                e["x"] = json!(20);
                e
            }),
        ];
        let mut heard = Vec::new();
        for u in &moves {
            let (sent, _) = send(&mut m.owner, u, &[]).await;
            assert!(sent.get("ok").is_some(), "{sent}");
            heard.extend(hear(&mut m.ana, 150, LEAKS).await);
        }
        assert!(ana.take(&heard) >= 2, "{heard:?}");
        let all = collab_board::elements(&ana.doc);
        assert_eq!(all["c-hid"]["x"], 350);
        assert_eq!(all["note"]["x"], 20);
        assert!(!all.contains_key("zqpin") && !all.contains_key("zqpin2"));
        assert!(all["c-hid"]["locked"] == true && !ana.has_text("Barão"));
    });
}

#[test]
fn her_edits_reach_the_game_masters_window_and_what_she_does_not_see_is_refused() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let gm = master_seeds(&mut m).await;
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        // The game master hears of Ana's presence only as a name.
        let before = collab_board::elements(&gm);

        // She moves a card of hers and draws a new shape: accepted, and the
        // game master's window gets both, by element.
        let mut open = ana.element("c-open").unwrap();
        open["x"] = json!(77);
        let moved = put(&ana.doc, "c-open", 2, 21, &open);
        let drawn = put(
            &ana.doc,
            "hers",
            1,
            22,
            &json!({ "type": "rectangle", "index": "c0", "x": 5 }),
        );
        let mark = edited(&ana.doc, 1);
        let both =
            yrs::merge_updates_v1([moved.as_slice(), drawn.as_slice(), mark.as_slice()]).unwrap();
        let (sent, _) = send(&mut m.ana, &both, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let told = hear(&mut m.owner, 400, &[]).await;
        let got = told
            .iter()
            .filter(|e| e["event"] == "collab-update")
            .count();
        assert!(got >= 1, "{told:?}");
        for e in &told {
            if e["event"] == "collab-update" {
                apply(&gm, &bytes(e["payload"]["update"].as_str().unwrap()));
            }
        }
        let after = collab_board::elements(&gm);
        assert_eq!(after["c-open"]["x"], 77);
        assert_eq!(after["hers"]["x"], 5);
        // Everything hidden is the game master's still, untouched.
        for id in ["zqpin", "zqedge", "zqdraw", "zqlabel", "c-hid"] {
            assert_eq!(after[id], before[id], "{id}");
        }

        // What she is refused, each whole: the marker, the pin by its id,
        // a secret pin of her own, a card of a hidden file, an edge to the
        // pin, an element in the secret group, removing any of them.
        let marker = ana.element("c-hid").unwrap();
        let mut moved_marker = marker.clone();
        moved_marker["x"] = json!(0);
        let mut pin = json!({ "type": "embeddable", "index": "d0", "customData": { "canvas": { "id": "n1", "type": "text", "text": "x", "verso": { "secret": true } } } });
        pin["x"] = json!(1);
        let attempts: Vec<(&str, Vec<u8>)> = vec![
            ("the marker", put(&ana.doc, "c-hid", 5, 31, &moved_marker)),
            (
                "the pin by its id",
                put(
                    &ana.doc,
                    "zqpin",
                    5,
                    32,
                    &json!({ "type": "embeddable", "x": 0 }),
                ),
            ),
            ("a pin of her own", put(&ana.doc, "n1", 1, 33, &pin)),
            (
                "a card of the hidden file",
                put(
                    &ana.doc,
                    "n2",
                    1,
                    34,
                    &json!({ "type": "embeddable", "index": "d1",
                "customData": { "canvas": { "id": "n2", "type": "file", "file": "Barão Zq.md" } } }),
                ),
            ),
            (
                "a card of a file that is not there",
                put(
                    &ana.doc,
                    "n3",
                    1,
                    35,
                    &json!({ "type": "embeddable", "index": "d2",
                "customData": { "canvas": { "id": "n3", "type": "file", "file": "Nada.md" } } }),
                ),
            ),
            (
                "an arrow to the pin",
                put(
                    &ana.doc,
                    "n4",
                    1,
                    36,
                    &json!({ "type": "arrow", "index": "d3", "endBinding": { "elementId": "zqpin" } }),
                ),
            ),
        ];
        for (what, u) in &attempts {
            let (sent, _) = send(&mut m.ana, u, LEAKS).await;
            assert!(refused(&sent), "{what}: {sent}");
        }
        // Nothing of any of it reached the game master.
        let told = hear(&mut m.owner, 300, &[]).await;
        assert!(
            told.iter().all(|e| e["event"] != "collab-update"),
            "{told:?}"
        );
        // Her shadow stayed as it was: a second window of hers joins the
        // same one, with none of it.
        let mut second = ana_again(&m).await;
        let (_, other, _) = join(&mut second, LEAKS).await;
        assert_eq!(other.epoch, ana.epoch);
        let all = collab_board::elements(&other.doc);
        for gone in ["n1", "n2", "n3", "n4"] {
            assert!(!all.contains_key(gone), "{gone}");
        }
        assert_eq!(all["c-hid"]["x"], 300);
        assert_eq!(all["c-open"]["x"], 77);
        assert!(all.contains_key("hers"));
    });
}

async fn ana_again(m: &Mesa) -> Win {
    let b = crate::tests::sign_in(&m.r, "ana@casa.lan", "a senha da ana").await;
    let (w, o) = Win::open(&m.r, &b, &m.id).await;
    assert!(o.get("ok").is_some(), "{o}");
    w
}

/// The canvas a window's converter makes of a room's elements: the nodes
/// the cards carry, the edges, the rest as the drawing, in the board's order.
pub(crate) fn canvas_of(doc: &Doc) -> Value {
    let mut all: Vec<Value> = collab_board::elements(doc)
        .into_values()
        .filter(|e| e["isDeleted"] != true)
        .collect();
    all.sort_by(|a, b| a["index"].as_str().cmp(&b["index"].as_str()));
    let (mut nodes, mut edges, mut drawing) = (Vec::new(), Vec::new(), Vec::new());
    for e in all {
        let canvas = e["customData"]["canvas"].clone();
        if canvas.is_object() && canvas.get("fromNode").is_some() {
            edges.push(canvas);
        } else if canvas.is_object() {
            let mut n = canvas;
            for k in ["x", "y", "width", "height"] {
                if !e[k].is_null() {
                    n[k] = e[k].clone();
                }
            }
            nodes.push(n);
        } else {
            drawing.push(e);
        }
    }
    json!({ "nodes": nodes, "edges": edges, "verso": { "version": 1, "drawing": drawing } })
}

pub(crate) fn sv(doc: &Doc) -> String {
    STANDARD.encode(collab_board::state_vector(doc))
}

pub(crate) async fn disk(m: &mut Mesa) -> Value {
    let read = m.owner.call("read_text", json!({ "path": PATH })).await;
    serde_json::from_str(read["ok"]["text"].as_str().unwrap()).unwrap()
}

pub(crate) fn node<'a>(canvas: &'a Value, id: &str) -> Option<&'a Value> {
    canvas["nodes"].as_array()?.iter().find(|n| n["id"] == id)
}

#[test]
fn the_file_the_room_writes_keeps_what_she_does_not_see_whoever_makes_it() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": PATH, "base64": STANDARD.encode(file()) }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let original: Value = serde_json::from_str(&file()).unwrap();

        // Ana alone in the room: the game master's window has not drawn the
        // file, so she draws her own shadow from what she was made of, and
        // none of that goes into the room.
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        let base: Value = serde_json::from_str(&ana.base()).unwrap();
        assert!(node(&base, "zqpin").is_none() && node(&base, "c-hid").unwrap()["type"] == "text");
        let mut drew: Vec<Vec<u8>> = Vec::new();
        for (i, n) in base["nodes"].as_array().unwrap().iter().enumerate() {
            let id = n["id"].as_str().unwrap();
            let e = json!({ "type": "embeddable", "x": n["x"], "y": n["y"], "width": n["width"], "height": n["height"],
                "index": format!("a{i}"), "customData": { "canvas": n }, "locked": id == "c-hid" });
            drew.push(put(&ana.doc, id, 1, 5, &e));
        }
        for d in base["verso"]["drawing"].as_array().unwrap() {
            let mut d = d.clone();
            d["index"] = json!("ab");
            drew.push(put(&ana.doc, d["id"].as_str().unwrap(), 1, 5, &d));
        }
        drew.push(seeded(&ana.doc));
        let seed = yrs::merge_updates_v1(drew.iter().map(Vec::as_slice)).unwrap();
        let (sent, _) = send(&mut m.ana, &seed, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        // Nothing written: drawing a board in is not an edit.
        assert_eq!(disk(&mut m).await, original);

        // She moves her card, adds a shape and a card of her own.
        let mut open = ana.element("c-open").unwrap();
        open["x"] = json!(77);
        open["customData"]["canvas"]["x"] = json!(77);
        let edit = yrs::merge_updates_v1([
            put(&ana.doc, "c-open", 2, 21, &open).as_slice(),
            put(&ana.doc, "hers", 1, 22, &json!({ "type": "rectangle", "index": "c0", "x": 5 })).as_slice(),
            put(&ana.doc, "mine", 1, 23, &json!({ "type": "embeddable", "index": "c1", "x": 9, "y": 9, "width": 10, "height": 10,
                "customData": { "canvas": { "id": "mine", "type": "text", "text": "dela", "x": 9, "y": 9, "width": 10, "height": 10 } } })).as_slice(),
            edited(&ana.doc, 1).as_slice(),
        ])
        .unwrap();
        let (sent, _) = send(&mut m.ana, &edit, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");

        // The file her window made, laid over the disk's.
        let made = canvas_of(&ana.doc);
        let (given, _) = exchange(
            &mut m.ana,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&ana.doc), "json": made.to_string() }),
            LEAKS,
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        let (saved, _) = exchange(&mut m.ana, "collab_save", json!({ "path": PATH }), LEAKS).await;
        assert!(saved.get("ok").is_some(), "{saved}");
        let now = disk(&mut m).await;
        // Hers, written.
        assert_eq!(node(&now, "c-open").unwrap()["x"], 77);
        assert_eq!(node(&now, "mine").unwrap()["text"], "dela");
        assert!(
            now["verso"]["drawing"]
                .as_array()
                .unwrap()
                .iter()
                .any(|d| d["id"] == "hers")
        );
        // Not hers, byte for byte the disk's: the hidden card with its file
        // and colour, the pin, its edge, its drawing.
        for id in ["c-hid", "zqpin"] {
            assert_eq!(node(&now, id), node(&original, id), "{id}");
        }
        assert_eq!(now["edges"], original["edges"]);
        for id in ["zqdraw", "zqlabel"] {
            let was = original["verso"]["drawing"]
                .as_array()
                .unwrap()
                .iter()
                .find(|d| d["id"] == id);
            let is = now["verso"]["drawing"]
                .as_array()
                .unwrap()
                .iter()
                .find(|d| d["id"] == id);
            assert_eq!(is, was, "{id}");
        }

        // A file that would write over what she does not see is not taken:
        // her window's canvas with the hidden card turned into hers.
        let mut forged = made.clone();
        for n in forged["nodes"].as_array_mut().unwrap() {
            if n["id"] == "c-hid" {
                n["text"] = json!("tomei");
                n["x"] = json!(1);
            }
        }
        forged["nodes"].as_array_mut().unwrap().push(json!({ "id": "zq-forged", "type": "file", "file": "Barão Zq.md", "x": 0, "y": 0, "width": 1, "height": 1 }));
        let mark = edited(&ana.doc, 2);
        send(&mut m.ana, &mark, LEAKS).await;
        let (given, _) = exchange(
            &mut m.ana,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&ana.doc), "json": forged.to_string() }),
            LEAKS,
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        exchange(&mut m.ana, "collab_save", json!({ "path": PATH }), LEAKS).await;
        let after = disk(&mut m).await;
        assert_eq!(node(&after, "c-hid"), node(&original, "c-hid"));
        assert!(node(&after, "zq-forged").is_none());
    });
}

#[test]
fn the_game_masters_window_writes_the_file_whole_when_it_is_in_the_room() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let gm = master_seeds(&mut m).await;
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        let mut open = ana.element("c-open").unwrap();
        open["x"] = json!(123);
        open["customData"]["canvas"]["x"] = json!(123);
        let edit = yrs::merge_updates_v1([
            put(&ana.doc, "c-open", 2, 21, &open).as_slice(),
            edited(&ana.doc, 1).as_slice(),
        ])
        .unwrap();
        send(&mut m.ana, &edit, LEAKS).await;
        // Her file is not taken while the game master's window is in the
        // room: it makes the one that holds the whole board.
        let (given, _) = exchange(
            &mut m.ana,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&ana.doc), "json": canvas_of(&ana.doc).to_string() }),
            LEAKS,
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        for e in hear(&mut m.owner, 300, &[]).await {
            if e["event"] == "collab-update" {
                apply(&gm, &bytes(e["payload"]["update"].as_str().unwrap()));
            }
        }
        let whole = canvas_of(&gm);
        let (given, _) = exchange(
            &mut m.owner,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&gm), "json": whole.to_string() }),
            &[],
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        let (saved, _) = exchange(&mut m.owner, "collab_save", json!({ "path": PATH }), &[]).await;
        assert!(saved.get("ok").is_some(), "{saved}");
        let now = disk(&mut m).await;
        assert_eq!(node(&now, "c-open").unwrap()["x"], 123);
        assert!(
            node(&now, "zqpin").is_some() && node(&now, "c-hid").unwrap()["file"] == "Barão Zq.md"
        );
        // Ana is told the file was saved, without the hash of the whole.
        let told = hear(&mut m.ana, 500, LEAKS).await;
        let saved = told
            .iter()
            .find(|e| e["event"] == "collab-saved")
            .expect("saved");
        assert!(saved["payload"].get("hash").is_none(), "{saved}");
    });
}

#[test]
fn a_player_never_writes_the_whole_file_of_a_board_nor_chooses_for_the_room() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        master_seeds(&mut m).await;
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        let read = m.ana.call("read_text", json!({ "path": PATH })).await;
        let revision = read["ok"]["revision"].as_str().unwrap().to_owned();
        for (cmd, args) in [
            (
                "write_text",
                json!({ "path": PATH, "text": "{}", "revision": revision }),
            ),
            (
                "write_board",
                json!({ "path": PATH, "json": canvas_of(&ana.doc).to_string(), "revision": revision }),
            ),
            ("collab_resolve", json!({ "path": PATH, "keep": "disk" })),
            ("sync_put", json!({ "path": PATH, "base": "x", "bytes": 2 })),
        ] {
            let got = m.ana.call(cmd, args).await;
            assert!(got.get("err").is_some(), "{cmd}: {got}");
        }
        // The room is as it was: another window of hers joins the same one.
        let mut second = ana_again(&m).await;
        let (_, other, _) = join(&mut second, LEAKS).await;
        assert_eq!(other.epoch, ana.epoch);
    });
}

#[test]
fn a_player_who_only_sees_a_board_follows_its_file_as_before() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        master_seeds(&mut m).await;
        let (joined, _, _) = join(&mut m.bia, LEAKS).await;
        assert!(refused(&joined), "{joined}");
        // She reads the file with the hidden left out, whole text and all.
        let read = m.bia.call("read_text", json!({ "path": PATH })).await;
        let text = read["ok"]["text"].as_str().unwrap();
        for leak in LEAKS {
            assert!(!text.contains(leak), "{leak} in {text}");
        }
        assert!(text.contains("c-hid") && text.contains("c-open"));
        // And cannot type in the room.
        let (sent, _) = send(&mut m.bia, &seeded(&Doc::new()), LEAKS).await;
        assert!(sent.get("err").is_some(), "{sent}");
    });
}

fn put_var(out: &mut Vec<u8>, mut n: u64) {
    loop {
        let b = (n & 0x7f) as u8;
        n >>= 7;
        if n == 0 {
            out.push(b);
            return;
        }
        out.push(b | 0x80);
    }
}

/// A presence update as y-protocols writes it: one client and its state.
fn awareness(client: u64, state: &Value) -> String {
    let mut out = Vec::new();
    put_var(&mut out, 1);
    put_var(&mut out, client);
    put_var(&mut out, 1);
    let s = state.to_string();
    put_var(&mut out, s.len() as u64);
    out.extend_from_slice(s.as_bytes());
    STANDARD.encode(out)
}

#[test]
fn the_selection_of_the_game_master_never_names_what_she_does_not_see() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let gm = master_seeds(&mut m).await;
        let (_, _ana, _) = join(&mut m.ana, LEAKS).await;
        let state = json!({
            "user": { "name": "x", "color": "#aabbcc" },
            "pointer": { "x": 1, "y": 2, "tool": "pointer" },
            "selected": ["zqpin", "zqedge", "c-open", "c-hid"],
            "editing": "zqpin",
            "zqfield": { "ids": ["zqpin"] },
        });
        let (sent, _) = exchange(
            &mut m.owner,
            "collab_awareness",
            json!({ "path": PATH, "update": awareness(gm.client_id().get(), &state) }),
            &[],
        )
        .await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let told = hear(&mut m.ana, 400, LEAKS).await;
        let text = told
            .iter()
            .filter(|e| e["event"] == "collab-awareness")
            .map(|e| crate::tests_secret::heard(&e.to_string()))
            .collect::<String>();
        // The ones she sees are named, the others are not.
        assert!(text.contains("c-open") && text.contains("c-hid"), "{text}");
        assert!(!text.contains("zqpin") && !text.contains("zqedge"));
    });
}

#[test]
fn what_an_element_becomes_to_her_closes_her_shadow_and_the_next_one_is_made_anew() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let gm = master_seeds(&mut m).await;
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        assert!(ana.element("c-open").is_some());

        // The game master marks her card secret, in the room: it is nothing to
        // her now, so her shadow is closed and the next is made anew without it.
        let mut e = collab_board::elements(&gm)["c-open"].clone();
        e["customData"]["canvas"]["verso"] = json!({ "secret": true });
        let (sent, _) = send(&mut m.owner, &put(&gm, "c-open", 3, 40, &e), &[]).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let told = hear(&mut m.ana, 400, LEAKS).await;
        assert!(
            told.iter().any(|e| e["event"] == "collab-closed"),
            "{told:?}"
        );
        let (_, again, _) = join(&mut m.ana, LEAKS).await;
        assert_ne!(again.epoch, ana.epoch);
        assert!(again.element("c-open").is_none());

        // The file of the hidden card is released to the table: the card is
        // hers, and the shadow is closed once more.
        let released = m
            .owner
            .call(
                "campaign_release",
                json!({ "paths": ["Barão Zq.md"], "released": true }),
            )
            .await;
        assert!(released.get("ok").is_some(), "{released}");
        let told = hear(&mut m.ana, 500, LEAKS_AFTER_RELEASE).await;
        assert!(
            told.iter().any(|e| e["event"] == "collab-closed"),
            "{told:?}"
        );
        let (_, third, _) = join(&mut m.ana, LEAKS_AFTER_RELEASE).await;
        assert_eq!(
            third.element("c-hid").unwrap()["customData"]["canvas"]["file"],
            "Barão Zq.md"
        );
        assert!(third.element("c-hid").unwrap()["locked"].is_null());

        // Her level taken to *sees*: out of the room at once, and the board
        // is followed by its file.
        let ana_id = m.ana_id.clone();
        let set = json!({ "kind": "set", "set": { "whole": "see", "rows": [ { "account": ana_id, "level": "see" } ] }, "secret_name": null });
        let done = m
            .owner
            .call("access_set", json!({ "paths": [PATH], "change": set }))
            .await;
        assert!(done.get("ok").is_some(), "{done}");
        let told = hear(&mut m.ana, 500, LEAKS_AFTER_RELEASE).await;
        assert!(
            told.iter().any(|e| e["event"] == "collab-closed"),
            "{told:?}"
        );
        let (joined, _, _) = join(&mut m.ana, LEAKS_AFTER_RELEASE).await;
        assert!(refused(&joined), "{joined}");
        let (sent, _) = send(&mut m.ana, &seeded(&Doc::new()), LEAKS_AFTER_RELEASE).await;
        assert!(sent.get("err").is_some(), "{sent}");
    });
}

/// The canaries once the hidden note is released.
pub(crate) const LEAKS_AFTER_RELEASE: &[&str] = &["zqpin", "zqedge", "zqdraw", "zqlabel"];

#[test]
fn the_dialog_can_give_edits_on_a_board_and_counts_its_secret_blocks() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": PATH, "base64": STANDARD.encode(file()) }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let ana_id = m.ana_id.clone();
        let got = m.owner.call("access_get", json!({ "paths": [PATH] })).await;
        // One block, in the text card; the pin's words are not hers.
        assert_eq!(got["ok"][0]["secret_blocks"], 1, "{got}");
        let set = json!({ "kind": "set", "set": { "whole": "see", "rows": [ { "account": ana_id, "level": "edit" } ] }, "secret_name": null });
        let done = m
            .owner
            .call("access_set", json!({ "paths": [PATH], "change": set }))
            .await;
        assert_eq!(done["ok"]["changed"], 1, "{done}");
        let read = m.ana.call("read_text", json!({ "path": PATH })).await;
        assert_eq!(read["ok"]["access"]["level"], "edit", "{read}");
        let (joined, ana, _) = join(&mut m.ana, LEAKS).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        assert!(ana.base().contains("c-open") && !ana.base().contains("zqpin"));
    });
}

#[test]
fn a_rule_that_changes_what_her_cards_are_closes_her_shadow_and_one_that_does_not_leaves_it() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": PATH, "base64": STANDARD.encode(file()) }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        // Alone in the room, the board not drawn in yet.
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        assert!(ana.base().contains("c-hid") && !ana.base().contains("Barão"));
        // The game master hides a note no card of the board names: nothing
        // happens to her window.
        let hid = m
            .owner
            .call(
                "campaign_release",
                json!({ "paths": ["Livre.md"], "released": false }),
            )
            .await;
        assert!(hid.get("ok").is_some(), "{hid}");
        let hid = m
            .owner
            .call(
                "campaign_release",
                json!({ "paths": ["Aberta.md"], "released": false }),
            )
            .await;
        assert!(hid.get("ok").is_some(), "{hid}");
        // (Livre.md is the file of a card: that one is hers.)
        let told = hear(&mut m.ana, 400, LEAKS).await;
        assert!(
            told.iter().any(|e| e["event"] == "collab-closed"),
            "{told:?}"
        );
        let (_, again, _) = join(&mut m.ana, LEAKS).await;
        assert!(!again.base().contains("Livre.md"), "{}", again.base());
        // Releasing a note no card names closes nothing.
        let shown = m
            .owner
            .call(
                "campaign_release",
                json!({ "paths": ["Aberta.md"], "released": true }),
            )
            .await;
        assert!(shown.get("ok").is_some(), "{shown}");
        let told = hear(&mut m.ana, 400, LEAKS).await;
        assert!(
            told.iter().all(|e| e["event"] != "collab-closed"),
            "{told:?}"
        );
    });
}

#[test]
fn a_player_who_edits_a_board_reads_it_as_her_room_is_told_and_has_no_history_of_it() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        master_seeds(&mut m).await;
        let whole = disk(&mut m).await;
        for cmd in ["read_text", "read_file_text"] {
            let (read, _) = exchange(&mut m.ana, cmd, json!({ "path": PATH }), LEAKS).await;
            let text = read["ok"]["text"]
                .as_str()
                .or_else(|| read["ok"].as_str())
                .unwrap_or_default();
            let seen: Value = serde_json::from_str(text).unwrap_or(Value::Null);
            let ids: Vec<&str> = seen["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|n| n["id"].as_str())
                .collect();
            assert_eq!(ids, ["c-open", "c-hid", "note"], "{cmd}: {read}");
            // The hidden card is a text card, the text of a text card is whole.
            assert_eq!(node(&seen, "c-hid").unwrap()["type"], "text");
            assert!(
                node(&seen, "note").unwrap()["text"]
                    .as_str()
                    .unwrap()
                    .contains(HERS)
            );
            assert!(seen["edges"].as_array().unwrap().is_empty());
            assert_eq!(whole["nodes"].as_array().unwrap().len(), 4);
        }
        // The same for the game master's board when the whole table edits it.
        let set = NodeSet {
            whole: Level::Edit,
            rows: std::collections::BTreeMap::new(),
        };
        m.r.server.db.access_put(&m.id, PATH, set).unwrap();
        crate::campaign::forget(&m.r.server, &m.id);
        let veil = crate::campaign::veil_of(&m.r.server, &m.id).unwrap();
        assert!(!veil.group_edits(PATH));
        let (read, _) = exchange(&mut m.ana, "read_text", json!({ "path": PATH }), LEAKS).await;
        assert!(read.get("ok").is_some(), "{read}");
        // No history: a past version is a whole board.
        for cmd in ["history_list", "history_read"] {
            let (got, _) =
                exchange(&mut m.ana, cmd, json!({ "path": PATH, "id": "x" }), LEAKS).await;
            assert!(got.get("err").is_some(), "{cmd}: {got}");
        }
    });
}

#[test]
fn what_the_game_master_does_to_what_she_does_not_see_leaves_no_trace_for_her() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let gm = master_seeds(&mut m).await;
        let (joined, ana, _) = join(&mut m.ana, LEAKS).await;
        let raw = m.owner.call("read_text", json!({ "path": PATH })).await;
        // The revision she is told is of the file she is shown, never the file's.
        assert_ne!(joined["ok"]["revision"], raw["ok"]["revision"]);
        let before = ana.base();
        // The game master moves the pin, counts it as an edit, hands the room
        // the file of it, and the room writes it.
        let mut pin = collab_board::elements(&gm)["zqpin"].clone();
        pin["x"] = json!(777);
        let edit = yrs::merge_updates_v1([
            put(&gm, "zqpin", 2, 8, &pin).as_slice(),
            edited(&gm, 1).as_slice(),
        ])
        .unwrap();
        let (sent, _) = send(&mut m.owner, &edit, &[]).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let (given, _) = exchange(
            &mut m.owner,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&gm), "json": canvas_of(&gm).to_string() }),
            &[],
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        let (_, events) = exchange(&mut m.owner, "collab_save", json!({ "path": PATH }), &[]).await;
        Copy::take_into(&gm, &events);
        for e in hear(&mut m.owner, 200, &[]).await {
            Copy::take_into(&gm, &[e]);
        }
        let after = disk(&mut m).await;
        assert_eq!(node(&after, "zqpin").unwrap()["x"], 777);
        // She heard nothing of it: no update (not the count of edits, not the
        // saved), no saved, and the file she is told of is the same.
        let told = hear(&mut m.ana, 600, LEAKS).await;
        let kinds: Vec<&str> = told
            .iter()
            .filter_map(|e| e["event"].as_str())
            .filter(|e| matches!(*e, "collab-update" | "collab-awareness"))
            .collect();
        assert!(kinds.is_empty(), "{kinds:?}");
        // The file's text moved in layout, so she is told it was saved — with
        // the revision of what she is shown, the one she reads.
        let read = m.ana.call("read_text", json!({ "path": PATH })).await;
        let said = told.iter().rfind(|e| e["event"] == "collab-saved");
        if let Some(said) = said {
            assert_eq!(said["payload"]["revision"], read["ok"]["revision"]);
        } else {
            assert_eq!(read["ok"]["revision"], joined["ok"]["revision"]);
        }
        assert_eq!(ana.base(), before);
        // What she does is saved to her: her own edit waits, then is written.
        let mut open = ana.element("c-open").unwrap();
        open["x"] = json!(5);
        let mine = yrs::merge_updates_v1([
            put(&ana.doc, "c-open", 2, 21, &open).as_slice(),
            edited(&ana.doc, 1).as_slice(),
        ])
        .unwrap();
        send(&mut m.ana, &mine, LEAKS).await;
        for e in hear(&mut m.owner, 300, &[]).await {
            if e["event"] == "collab-update" {
                apply(&gm, &bytes(e["payload"]["update"].as_str().unwrap()));
            }
        }
        let (given, _) = exchange(
            &mut m.owner,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&gm), "json": canvas_of(&gm).to_string() }),
            &[],
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        exchange(&mut m.owner, "collab_save", json!({ "path": PATH }), &[]).await;
        assert_eq!(node(&disk(&mut m).await, "c-open").unwrap()["x"], 5);
        let told = hear(&mut m.ana, 600, LEAKS).await;
        assert!(
            told.iter().any(|e| e["event"] == "collab-saved"),
            "{told:?}"
        );
        let meta = |c: &Copy, k: &str| {
            let m = c.doc.get_or_insert_map(META);
            let txn = c.doc.transact();
            m.get(&txn, k).map(|v| v.to_string(&txn))
        };
        for e in &told {
            if e["event"] == "collab-update" {
                apply(&ana.doc, &bytes(e["payload"]["update"].as_str().unwrap()));
            }
        }
        assert_eq!(
            meta(&ana, "saved"),
            Some(format!("edit:{}=1;", ana.doc.client_id()))
        );
        let gm_key = format!("edit:{}", gm.client_id());
        assert!(meta(&ana, &gm_key).is_none());
    });
}

/// Ana moves her card and hands the room the file of her shadow, then asks it
/// to write.
async fn ana_moves_her_card(m: &mut Mesa, ana: &Copy, x: i64, n: i64) {
    let mut open = ana.element("c-open").unwrap();
    open["x"] = json!(x);
    open["customData"]["canvas"]["x"] = json!(x);
    let edit = yrs::merge_updates_v1([
        put(&ana.doc, "c-open", 2, 20 + n, &open).as_slice(),
        edited(&ana.doc, n).as_slice(),
    ])
    .unwrap();
    let (sent, _) = send(&mut m.ana, &edit, LEAKS).await;
    assert!(sent.get("ok").is_some(), "{sent}");
    let (given, _) = exchange(
        &mut m.ana,
        "collab_canvas",
        json!({ "path": PATH, "at": sv(&ana.doc), "json": canvas_of(&ana.doc).to_string() }),
        LEAKS,
    )
    .await;
    assert!(given.get("ok").is_some(), "{given}");
    exchange(&mut m.ana, "collab_save", json!({ "path": PATH }), LEAKS).await;
}

#[test]
fn a_window_that_only_reads_does_not_stop_her_file_from_being_written() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        master_seeds(&mut m).await;
        // The game master's read-only credential is in the room, as a window
        // that sees the whole board and never types; the typing one left.
        let admin =
            m.r.server
                .db
                .account_by_email("admin@casa.lan")
                .unwrap()
                .unwrap();
        let (secret, _) =
            m.r.server
                .db
                .create_token(&admin.id, "so le", false, None, std::slice::from_ref(&m.id))
                .unwrap();
        let mut ws = crate::tests::connect(&m.r, None, None, Some(&secret))
            .await
            .unwrap();
        crate::tests::next(&mut ws).await;
        let opened =
            crate::tests::call(&mut ws, 1, "open_server_folder", json!({ "id": m.id })).await;
        assert!(opened.get("ok").is_some(), "{opened}");
        let joined = crate::tests::call(&mut ws, 2, "collab_join", json!({ "path": PATH })).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        exchange(&mut m.owner, "collab_leave", json!({ "path": PATH }), &[]).await;
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        ana_moves_her_card(&mut m, &ana, 33, 1).await;
        let now = disk(&mut m).await;
        assert_eq!(node(&now, "c-open").unwrap()["x"], 33);
        let original: Value = serde_json::from_str(&file()).unwrap();
        assert_eq!(node(&now, "zqpin"), node(&original, "zqpin"));
        assert_eq!(node(&now, "c-hid"), node(&original, "c-hid"));
    });
}

#[test]
fn what_the_game_master_left_unsaved_is_never_written_over_nor_dropped() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let gm = master_seeds(&mut m).await;
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        // The game master moves the pin, counts it, and leaves before his file
        // of it is kept.
        let mut pin = collab_board::elements(&gm)["zqpin"].clone();
        pin["x"] = json!(777);
        pin["customData"]["canvas"]["x"] = json!(777);
        let edit = yrs::merge_updates_v1([
            put(&gm, "zqpin", 2, 8, &pin).as_slice(),
            edited(&gm, 1).as_slice(),
        ])
        .unwrap();
        let (sent, _) = send(&mut m.owner, &edit, &[]).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        exchange(&mut m.owner, "collab_leave", json!({ "path": PATH }), &[]).await;
        // Ana works and hands her file: the disk lacks the pin's move, so
        // nothing is written — the file would lose it.
        ana_moves_her_card(&mut m, &ana, 33, 1).await;
        let still: Value = serde_json::from_str(&file()).unwrap();
        assert_eq!(disk(&mut m).await, still);
        // The game master is back: the room is as both left it, and his file
        // of it holds the two.
        let (_, back, _) = join(&mut m.owner, &[]).await;
        let whole = canvas_of(&back.doc);
        assert_eq!(node(&whole, "zqpin").unwrap()["x"], 777);
        assert_eq!(node(&whole, "c-open").unwrap()["x"], 33);
        let (given, _) = exchange(
            &mut m.owner,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&back.doc), "json": whole.to_string() }),
            &[],
        )
        .await;
        assert!(given.get("ok").is_some(), "{given}");
        let (_, events) = exchange(&mut m.owner, "collab_save", json!({ "path": PATH }), &[]).await;
        Copy::take_into(&back.doc, &events);
        let now = disk(&mut m).await;
        assert_eq!(node(&now, "zqpin").unwrap()["x"], 777);
        assert_eq!(node(&now, "c-open").unwrap()["x"], 33);

        // The other order: what he left was kept, so Ana alone writes, over it.
        let (_, ana2, _) = join(&mut m.ana, LEAKS).await;
        let mut pin = collab_board::elements(&back.doc)["zqpin"].clone();
        pin["x"] = json!(888);
        pin["customData"]["canvas"]["x"] = json!(888);
        let edit = yrs::merge_updates_v1([
            put(&back.doc, "zqpin", 5, 9, &pin).as_slice(),
            edited(&back.doc, 2).as_slice(),
        ])
        .unwrap();
        let (_, events) = send(&mut m.owner, &edit, &[]).await;
        Copy::take_into(&back.doc, &events);
        let whole = canvas_of(&back.doc);
        exchange(
            &mut m.owner,
            "collab_canvas",
            json!({ "path": PATH, "at": sv(&back.doc), "json": whole.to_string() }),
            &[],
        )
        .await;
        let (_, events) = exchange(&mut m.owner, "collab_save", json!({ "path": PATH }), &[]).await;
        Copy::take_into(&back.doc, &events);
        assert_eq!(node(&disk(&mut m).await, "zqpin").unwrap()["x"], 888);
        exchange(&mut m.owner, "collab_leave", json!({ "path": PATH }), &[]).await;
        let _ = ana2;
        let mut again = ana_again(&m).await;
        let (_, fresh, _) = join(&mut again, LEAKS).await;
        ana_moves_her_card(&mut m, &fresh, 44, 3).await;
        let end = disk(&mut m).await;
        assert_eq!(node(&end, "zqpin").unwrap()["x"], 888);
    });
}

/// One text for every locked card: a card of a file that is hidden, of one
/// hidden with a secret name, and of one that is not there are the same
/// marker for a player, but for the id and the place (no oracle).
#[test]
fn a_locked_card_says_the_same_whether_the_file_is_hidden_secret_named_or_not_there() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let cards = json!({ "nodes": [
            { "id": "k-hid", "type": "file", "file": "Barão Zq.md", "x": 0, "y": 0, "width": 200, "height": 100 },
            { "id": "k-sec", "type": "file", "file": "Mapa Zq.md", "x": 0, "y": 0, "width": 200, "height": 100 },
            { "id": "k-gone", "type": "file", "file": "Nada Zq.md", "x": 0, "y": 0, "width": 200, "height": 100 },
        ], "edges": [] })
        .to_string();
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": PATH, "base64": STANDARD.encode(&cards) }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        let (_, copy, _) = join(&mut m.owner, &[]).await;
        let mut updates: Vec<Vec<u8>> = ["k-hid", "k-sec", "k-gone"]
            .iter()
            .enumerate()
            .map(|(i, id)| {
                let n = serde_json::from_str::<Value>(&cards).unwrap()["nodes"][i].clone();
                put(
                    &copy.doc,
                    id,
                    1,
                    5,
                    &json!({ "type": "embeddable", "x": 0, "y": 0, "width": 200, "height": 100, "index": format!("a{i}"),
                        "link": "https://verso.invalid/board-node", "customData": { "canvas": n } }),
                )
            })
            .collect();
        updates.push(seeded(&copy.doc));
        let seed = yrs::merge_updates_v1(updates.iter().map(Vec::as_slice)).unwrap();
        let (sent, _) = send(&mut m.owner, &seed, &[]).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let (_, ana, _) = join(&mut m.ana, &[]).await;
        let all = collab_board::elements(&ana.doc);
        let strip = |id: &str| {
            let mut e = all[id].clone();
            e["id"] = json!("");
            e["index"] = json!("");
            e["customData"]["canvas"]["id"] = json!("");
            e.to_string()
        };
        assert_eq!(all["k-hid"]["locked"], true);
        assert_eq!(strip("k-hid"), strip("k-sec"), "hidden vs secret name");
        assert_eq!(strip("k-hid"), strip("k-gone"), "hidden vs not there");
    });
}

/// Echoes are judged against what the room told the account (and what her
/// window drew when it seeded), and a shadow that drifted is made anew when
/// she is alone in it and joins again.
#[test]
fn an_echo_is_judged_against_the_latest_the_account_holds_and_a_drifted_shadow_is_made_anew() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let gm = master_seeds(&mut m).await;
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        // She moves a card (accepted), then sends the card back at a newer
        // version with its first content: a real revert, a change — it
        // reaches the game master.
        let first = ana.element("c-open").unwrap();
        let mut moved = first.clone();
        moved["x"] = json!(77);
        let (sent, _) = send(&mut m.ana, &put(&ana.doc, "c-open", 2, 21, &moved), LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let (sent, _) = send(&mut m.ana, &put(&ana.doc, "c-open", 3, 22, &first), LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let told = hear(&mut m.owner, 400, &[]).await;
        Copy::take_into(&gm, &told);
        assert_eq!(
            collab_board::elements(&gm)["c-open"]["x"],
            0,
            "a revert is a change"
        );
        // Sending the latest again with a new version is an echo: nothing
        // reaches the game master.
        let (sent, _) = send(&mut m.ana, &put(&ana.doc, "c-open", 4, 23, &first), LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        let told = hear(&mut m.owner, 300, &[]).await;
        assert!(
            told.iter().all(|e| e["event"] != "collab-update"),
            "{told:?}"
        );
        // Her shadow now holds a version the room never had: joined again,
        // alone, she gets the room's state in a shadow made anew.
        let (joined, again, _) = join(&mut m.ana, LEAKS).await;
        assert!(joined.get("ok").is_some(), "{joined}");
        assert_ne!(again.epoch, ana.epoch, "a shadow made anew");
        assert_eq!(collab_board::elements(&again.doc)["c-open"]["version"], 3);
    });
}

/// What her window drew of the file when it seeded is hers alone: an echo
/// of it is taken, a new card of a hidden file is not, and a rejoin drops it.
#[test]
fn what_a_window_seeded_is_compared_for_echoes_only_and_goes_with_the_shadow() {
    crate::tests::block_on(async {
        let mut m = mesa().await;
        let ana_id = m.ana_id.clone();
        access(&m, &[(&ana_id, Level::Edit)]);
        let made = m
            .owner
            .call(
                "create_file",
                json!({ "path": PATH, "base64": STANDARD.encode(file()) }),
            )
            .await;
        assert!(made.get("ok").is_some(), "{made}");
        // No window of the game master's drew the room: hers does.
        let (_, ana, _) = join(&mut m.ana, LEAKS).await;
        let card = json!({ "type": "embeddable", "x": 1, "y": 1, "width": 10, "height": 10, "index": "a1",
            "customData": { "canvas": { "id": "lost", "type": "file", "file": "Lugares/Nada.md" } } });
        let seed = yrs::merge_updates_v1(
            [put(&ana.doc, "lost", 1, 5, &card), seeded(&ana.doc)]
                .iter()
                .map(Vec::as_slice),
        )
        .unwrap();
        let (sent, _) = send(&mut m.ana, &seed, LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        // The board bumps its version: an echo, taken.
        let (sent, _) = send(&mut m.ana, &put(&ana.doc, "lost", 2, 6, &card), LEAKS).await;
        assert!(sent.get("ok").is_some(), "{sent}");
        // A new card of the hidden file is not.
        let mut hid = card.clone();
        hid["customData"]["canvas"]["id"] = json!("other");
        hid["customData"]["canvas"]["file"] = json!("Barão Zq.md");
        let (sent, _) = send(&mut m.ana, &put(&ana.doc, "other", 1, 7, &hid), LEAKS).await;
        assert!(refused(&sent), "{sent}");
        // Joined again, alone: the shadow is the room's (nothing drawn),
        // the window seeds again.
        let (_, again, _) = join(&mut m.ana, LEAKS).await;
        assert_ne!(again.epoch, ana.epoch);
        assert!(!collab_board::elements(&again.doc).contains_key("lost"));
    });
}
