// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A board edited hard by several people at once, against a real server
//! (ADR 0082 item 12; the maintainer, 2026-10-12: "tenho receio de quebrar
//! algo em edições conjuntas"). Five clients play the window's board
//! (`app/ui/src/boardRoom.ts`): each makes Excalidraw's kind of change —
//! shapes, texts, cards, pictures, groups, arrows bound to cards, labels;
//! moves, resizes, text, colour, grouping, reconnecting, deleting,
//! undoing a deletion — on the elements as it sees them, so that two
//! change one element at once whenever their views lag. What each sends
//! goes in a shuffled order, what each hears is taken in a shuffled order
//! and late, one drops its connection in the middle of a burst and comes
//! back, and the room is asked to write the board as it goes. A reader
//! reads the file from the disk the whole time.
//!
//! After each seed: (a) every client holds the same elements, which are
//! the ones Excalidraw's rule picks among every version anyone made; (b)
//! the file parses, is a JSON Canvas — ids unique, every node's fields,
//! every edge's ends among the nodes — and is the board of exactly those
//! elements (a card per card, an edge per arrow bound at both ends to live
//! cards, the rest the drawing); (c) nothing vanished, nothing deleted came
//! back unless undone after its deletion, no id twice; (d) every binding
//! names an element of the board (one deleted included: an arrow whose
//! card is gone stays a drawn arrow, its binding dropped when the board is
//! read, as `restoreElements` repairs it); (e) no conflict, no copy; (f)
//! every read of the file parsed.
//!
//! The file a client hands the room is made here the way the window's
//! converter (`fromElements`, `board/model.ts`) divides the elements; the
//! window's own converter is put to the same seeds in
//! `app/ui/test/boardStress.test.mjs`.
//!
//! `cargo test` runs a few short seeds; the long run is ignored:
//! `cargo test -p verso-server --all-features --locked board_stress_long
//! -- --ignored --nocapture` (`VERSO_STRESS_SEEDS`, `VERSO_STRESS_OPS`).

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use yrs::updates::decoder::Decode;
use yrs::{Doc, Map, ReadTxn, StateVector, Transact, Update};

use crate::collab_board::{self, ELEMENTS, META};
use crate::tests::{Socket, block_on, connect, folder_id, next, sign_in, start};

const BOARD: &str = "Mesa.canvas";
const CLIENTS: usize = 5;
/// A deletion's jump ahead (the window's `DELETE_JUMP`).
const DELETE_JUMP: i64 = 1_000_000;
const BASE: &str = "{\n\t\"nodes\":[],\n\t\"edges\":[],\n\t\"x-kept\":\"by every write\"\n}";

/// A small seeded generator: the seed says the whole run.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % (n.max(1) as u64)).unwrap_or(0)
    }
    fn chance(&mut self, percent: u64) -> bool {
        self.next() % 100 < percent
    }
    fn nonce(&mut self) -> i64 {
        i64::try_from(self.next() % (1 << 31)).unwrap_or(0)
    }
    fn shuffle<T>(&mut self, v: &mut [T]) {
        for i in (1..v.len()).rev() {
            let j = self.below(i + 1);
            v.swap(i, j);
        }
    }
}

/// A window on the board: its document, what it has not sent yet, what it
/// heard and has not taken in yet.
struct Client {
    ws: Option<Socket>,
    doc: Doc,
    out: Vec<Vec<u8>>,
    inbox: Vec<Vec<u8>>,
    id: u64,
    edits: i64,
    made: u64,
    epoch: String,
    /// Changes made while out of the room: the whole state goes on return.
    offline: bool,
    conflicts: usize,
    /// Every update this client heard or joined with, for a failure's
    /// account.
    log: Vec<Vec<u8>>,
}

fn rank(e: &Value) -> (i64, i64) {
    (
        e["version"].as_i64().unwrap_or(0),
        -e["versionNonce"].as_i64().unwrap_or(0),
    )
}

/// Every version anyone made, and the one Excalidraw's rule keeps.
#[derive(Default)]
struct Oracle {
    best: BTreeMap<String, ((i64, i64), String)>,
    /// Per element: its highest deletion and its highest restore.
    deleted: BTreeMap<String, i64>,
    restored: BTreeMap<String, i64>,
}

impl Oracle {
    fn saw(&mut self, e: &Value, restore: bool) {
        let id = e["id"].as_str().unwrap().to_owned();
        let json = e.to_string();
        let r = rank(e);
        let better = self
            .best
            .get(&id)
            .is_none_or(|(b, j)| r > *b || (r == *b && json < *j));
        if better {
            self.best.insert(id.clone(), (r, json));
        }
        let v = r.0;
        if e["isDeleted"] == true {
            let d = self.deleted.entry(id).or_insert(v);
            *d = (*d).max(v);
        } else if restore {
            let d = self.restored.entry(id).or_insert(v);
            *d = (*d).max(v);
        }
    }
}

async fn send_raw(ws: &mut Socket, id: u64, cmd: &str, args: Value) {
    ws.send(Message::Text(
        json!({ "id": id, "cmd": cmd, "args": args })
            .to_string()
            .into(),
    ))
    .await
    .unwrap();
}

impl Client {
    /// A command's answer; the room's events heard meanwhile kept.
    async fn call(&mut self, cmd: &str, args: Value) -> Value {
        self.id += 1;
        let id = self.id;
        let ws = self.ws.as_mut().expect("connected");
        send_raw(ws, id, cmd, args).await;
        loop {
            let m = tokio::time::timeout(Duration::from_secs(30), ws.next())
                .await
                .expect("an answer in time")
                .unwrap()
                .unwrap();
            let Message::Text(t) = m else { continue };
            let v: Value = serde_json::from_str(&t).unwrap();
            if v.get("event").is_some() {
                hear(&mut self.inbox, &mut self.conflicts, &v);
                continue;
            }
            if v["id"].as_u64() == Some(id) {
                return v;
            }
        }
    }

    /// What arrived within `wait`, kept in the inbox.
    async fn listen(&mut self, wait: Duration) {
        let Some(ws) = self.ws.as_mut() else { return };
        let deadline = tokio::time::Instant::now() + wait;
        while let Ok(Some(Ok(m))) = tokio::time::timeout_at(deadline, ws.next()).await {
            if let Message::Text(t) = m {
                let v: Value = serde_json::from_str(&t).unwrap();
                hear(&mut self.inbox, &mut self.conflicts, &v);
            }
        }
    }

    /// Into the room: its state applied; back after a drop, the whole of
    /// this document sent, as the window's rejoin does.
    async fn join(&mut self) {
        let joined = self.call("collab_join", json!({ "path": BOARD })).await;
        assert_eq!(joined["ok"]["kind"], "board", "{joined}");
        let state = STANDARD
            .decode(joined["ok"]["update"].as_str().unwrap())
            .unwrap();
        apply(&self.doc, &state);
        let epoch = joined["ok"]["epoch"].as_str().unwrap().to_owned();
        assert!(
            self.epoch.is_empty() || self.epoch == epoch,
            "the room was made again while a client was in it"
        );
        self.epoch = epoch;
        if self.offline {
            let whole = self
                .doc
                .transact()
                .encode_state_as_update_v1(&StateVector::default());
            self.out.clear();
            self.out.push(whole);
            self.offline = false;
        }
    }

    /// What waits to go out, in a shuffled order.
    async fn flush(&mut self, rng: &mut Rng) {
        if self.ws.is_none() {
            return;
        }
        let mut out = std::mem::take(&mut self.out);
        rng.shuffle(&mut out);
        for u in out {
            let sent = self
                .call(
                    "collab_update",
                    json!({ "path": BOARD, "update": STANDARD.encode(&u) }),
                )
                .await;
            assert!(sent.get("ok").is_some(), "{sent}");
        }
    }

    /// What was heard, taken in in a shuffled order: some of it, or all.
    fn take_in(&mut self, rng: &mut Rng, all: bool) {
        let mut heard = std::mem::take(&mut self.inbox);
        rng.shuffle(&mut heard);
        let keep = if all { 0 } else { rng.below(heard.len() + 1) };
        let later: Vec<Vec<u8>> = heard.drain(..keep).collect();
        for u in heard {
            apply(&self.doc, &u);
            self.log.push(u);
        }
        self.inbox = later;
    }

    /// The room has edits waiting: the file of this client's state, handed
    /// over, and sometimes ⌘S.
    async fn hand_file(&mut self, save: bool) {
        if self.ws.is_none() || !waiting(&self.doc) {
            return;
        }
        let at = STANDARD.encode(collab_board::state_vector(&self.doc));
        let json = canvas_of(&collab_board::elements(&self.doc)).to_string();
        let given = self
            .call(
                "collab_canvas",
                json!({ "path": BOARD, "at": at, "json": json }),
            )
            .await;
        assert!(given.get("ok").is_some(), "{given}");
        if save {
            let saved = self.call("collab_save", json!({ "path": BOARD })).await;
            // Not of the room's newest state yet: written when one comes.
            if saved.get("err").is_some() {
                assert_eq!(saved["err"]["kind"], "unavailable", "{saved}");
            }
        }
    }
}

fn hear(inbox: &mut Vec<Vec<u8>>, conflicts: &mut usize, v: &Value) {
    match v["event"].as_str() {
        Some("collab-update") if v["payload"]["path"] == BOARD => {
            inbox.push(
                STANDARD
                    .decode(v["payload"]["update"].as_str().unwrap())
                    .unwrap(),
            );
        }
        Some("collab-conflict" | "collab-closed") => *conflicts += 1,
        _ => {}
    }
}

/// A client takes an update in as the window's Yjs does — which places
/// updates heard in any order — through the server's own `integrate`
/// (yrs alone leaves some aside).
fn apply(doc: &Doc, update: &[u8]) {
    crate::collab::integrate(doc, Update::decode_v1(update).unwrap()).unwrap();
}

fn waiting(doc: &Doc) -> bool {
    let saved = {
        let meta = doc.get_or_insert_map(META);
        let txn = doc.transact();
        meta.get(&txn, "saved")
            .map(|v| v.to_string(&txn))
            .unwrap_or_default()
    };
    collab_board::edits(doc) != saved
}

/// `e` written as the window writes a version of an element: the entries
/// of it that it outranks gone, a person's edit counted.
fn write(c: &mut Client, oracle: &mut Oracle, e: &Value, restore: bool) {
    oracle.saw(e, restore);
    c.edits += 1;
    let id = e["id"].as_str().unwrap();
    let (version, nonce) = (
        e["version"].as_i64().unwrap(),
        e["versionNonce"].as_i64().unwrap(),
    );
    let map = c.doc.get_or_insert_map(ELEMENTS);
    let meta = c.doc.get_or_insert_map(META);
    let update = {
        let mut txn = c.doc.transact_mut();
        let lower: Vec<String> = map
            .keys(&txn)
            .filter(|k| {
                let mut parts = k.rsplitn(3, '\n');
                let n: i64 = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
                let v: i64 = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
                parts.next() == Some(id) && (v, -n) < (version, -nonce)
            })
            .map(str::to_owned)
            .collect();
        for k in lower {
            map.remove(&mut txn, &k);
        }
        map.insert(&mut txn, format!("{id}\n{version}\n{nonce}"), e.to_string());
        meta.insert(&mut txn, format!("edit:{}", c.doc.client_id()), c.edits);
        txn.encode_update_v1()
    };
    c.out.push(update);
}

/// The board as the window's converter divides it: a card per element
/// that carries one, an edge per arrow bound at both ends to live cards
/// (its label a text in it), the rest drawn — laid over the file the room
/// was made from.
fn canvas_of(elements: &BTreeMap<String, Value>) -> Value {
    let mut live: Vec<&Value> = elements
        .values()
        .filter(|e| e["isDeleted"] != true)
        .collect();
    live.sort_by(|a, b| {
        let ia = a["index"].as_str().unwrap_or("");
        let ib = b["index"].as_str().unwrap_or("");
        ia.cmp(ib).then(a["id"].as_str().cmp(&b["id"].as_str()))
    });
    let nodes: BTreeSet<&str> = live
        .iter()
        .filter(|e| e["customData"]["canvas"].is_object())
        .map(|e| e["id"].as_str().unwrap())
        .collect();
    let mut out_nodes = Vec::new();
    let mut out_edges = Vec::new();
    let mut edge_ids = BTreeSet::new();
    for e in &live {
        let id = e["id"].as_str().unwrap();
        if nodes.contains(id) {
            let mut n = e["customData"]["canvas"].clone();
            n["id"] = json!(id);
            for k in ["x", "y", "width", "height"] {
                n[k] = json!(e[k].as_f64().unwrap_or(0.0).round() as i64);
            }
            out_nodes.push(n);
        } else if e["type"] == "arrow"
            && let (Some(f), Some(t)) = (
                e["startBinding"]["elementId"].as_str(),
                e["endBinding"]["elementId"].as_str(),
            )
            && nodes.contains(f)
            && nodes.contains(t)
        {
            out_edges.push(json!({ "id": id, "fromNode": f, "toNode": t }));
            edge_ids.insert(id.to_owned());
        }
    }
    let mut drawing = Vec::new();
    for e in &live {
        let id = e["id"].as_str().unwrap();
        let label = e["containerId"]
            .as_str()
            .is_some_and(|c| edge_ids.contains(c));
        if nodes.contains(id) || edge_ids.contains(id) || label {
            continue;
        }
        drawing.push((*e).clone());
    }
    for edge in &mut out_edges {
        let id = edge["id"].as_str().unwrap().to_owned();
        if let Some(l) = live
            .iter()
            .find(|e| e["containerId"] == id.as_str() && e["type"] == "text")
        {
            edge["label"] = l["text"].clone();
        }
    }
    json!({
        "nodes": out_nodes,
        "edges": out_edges,
        "x-kept": "by every write",
        "verso": { "version": 1, "drawing": drawing },
    })
}

/// One random change, as a person makes it on the board.
fn act(c: &mut Client, n: usize, rng: &mut Rng, oracle: &mut Oracle) {
    let all = collab_board::elements(&c.doc);
    let live: Vec<&Value> = all.values().filter(|e| e["isDeleted"] != true).collect();
    let cards: Vec<&Value> = live
        .iter()
        .copied()
        .filter(|e| e["customData"]["canvas"].is_object())
        .collect();
    let arrows: Vec<&Value> = live
        .iter()
        .copied()
        .filter(|e| e["type"] == "arrow")
        .collect();
    let frames: Vec<&Value> = live
        .iter()
        .copied()
        .filter(|e| e["type"] == "frame")
        .collect();
    let gone: Vec<&Value> = all.values().filter(|e| e["isDeleted"] == true).collect();
    c.made += 1;
    let fresh = format!("c{n}e{}", c.made);
    let index = format!("a{:06}{n}", c.made * 7 + rng.below(5) as u64);
    let nonce = rng.nonce();
    let x = rng.below(2000) as f64 - 1000.0;
    let y = rng.below(2000) as f64 - 1000.0;
    // A new version of `e`, `k` versions on (a drag counts one per frame).
    let bump = |e: &Value, k: i64, nonce: i64| -> Value {
        let mut v = e.clone();
        v["version"] = json!(e["version"].as_i64().unwrap_or(1) + k);
        v["versionNonce"] = json!(nonce);
        v
    };
    let pick = |v: &Vec<&Value>, rng: &mut Rng| -> Option<Value> {
        (!v.is_empty()).then(|| v[rng.below(v.len())].clone())
    };
    let what = rng.below(100);
    let base = |kind: &str| -> Value {
        json!({ "id": fresh, "type": kind, "x": x, "y": y, "width": 120, "height": 60, "version": 1,
                "versionNonce": nonce, "index": index, "isDeleted": false, "frameId": null,
                "groupIds": [], "boundElements": null, "strokeColor": "#1e1e1e" })
    };
    match what {
        // New things: a shape, a text, a card, a picture, a group.
        0..=7 => write(
            c,
            oracle,
            &base(if rng.chance(50) {
                "rectangle"
            } else {
                "ellipse"
            }),
            false,
        ),
        8..=12 => {
            let mut t = base("text");
            t["text"] = json!(format!("texto {fresh}"));
            t["originalText"] = t["text"].clone();
            write(c, oracle, &t, false);
        }
        13..=19 => {
            let mut card = base("embeddable");
            card["link"] = json!("https://verso.invalid/board-node");
            card["customData"] = json!({ "canvas": { "id": fresh, "type": "text", "text": format!("cartão {fresh}") } });
            write(c, oracle, &card, false);
        }
        20..=22 => {
            let mut pic = base("embeddable");
            pic["customData"] =
                json!({ "canvas": { "id": fresh, "type": "file", "file": "assets/foto.png" } });
            write(c, oracle, &pic, false);
        }
        23..=24 => {
            let mut frame = base("frame");
            frame["name"] = json!("Grupo");
            frame["customData"] =
                json!({ "canvas": { "id": fresh, "type": "group", "label": "Grupo" } });
            write(c, oracle, &frame, false);
        }
        // An arrow from a card to a card, sometimes with a label.
        25..=31 if cards.len() >= 2 => {
            let a = cards[rng.below(cards.len())]["id"].clone();
            let b = cards[rng.below(cards.len())]["id"].clone();
            let mut arrow = base("arrow");
            arrow["startBinding"] =
                json!({ "elementId": a, "fixedPoint": [1, 0.5], "mode": "orbit" });
            arrow["endBinding"] =
                json!({ "elementId": b, "fixedPoint": [0, 0.5], "mode": "orbit" });
            arrow["points"] = json!([[0, 0], [100, 0]]);
            write(c, oracle, &arrow, false);
            if rng.chance(40) {
                let mut label = base("text");
                label["id"] = json!(format!("{fresh}-label"));
                label["text"] = json!("liga");
                label["containerId"] = json!(fresh);
                write(c, oracle, &label, false);
            }
        }
        // Moved — dragged a few frames —, resized, its text, its colour.
        32..=49 => {
            if let Some(e) = pick(&live, rng) {
                let mut v = bump(&e, 1 + rng.below(40) as i64, nonce);
                v["x"] = json!(e["x"].as_f64().unwrap_or(0.0) + rng.below(300) as f64 - 150.0);
                v["y"] = json!(e["y"].as_f64().unwrap_or(0.0) + rng.below(300) as f64 - 150.0);
                write(c, oracle, &v, false);
            }
        }
        50..=55 => {
            if let Some(e) = pick(&live, rng) {
                let mut v = bump(&e, 1 + rng.below(10) as i64, nonce);
                v["width"] = json!(20 + rng.below(400));
                v["height"] = json!(20 + rng.below(300));
                write(c, oracle, &v, false);
            }
        }
        56..=60 => {
            let texts: Vec<&Value> = live
                .iter()
                .copied()
                .filter(|e| e["type"] == "text")
                .collect();
            if let Some(e) = pick(&texts, rng) {
                let mut v = bump(&e, 1, nonce);
                v["text"] = json!(format!("{} +{n}", e["text"].as_str().unwrap_or("")));
                v["originalText"] = v["text"].clone();
                write(c, oracle, &v, false);
            }
        }
        61..=64 => {
            if let Some(e) = pick(&live, rng) {
                let mut v = bump(&e, 1, nonce);
                v["strokeColor"] =
                    json!(["#e03131", "#2f9e44", "#1971c2", "#f08c00"][rng.below(4)]);
                write(c, oracle, &v, false);
            }
        }
        // Grouped into a frame, or out of it; grouped with another.
        65..=69 => {
            if let (Some(e), Some(f)) = (pick(&live, rng), pick(&frames, rng))
                && e["id"] != f["id"]
            {
                let mut v = bump(&e, 1, nonce);
                v["frameId"] = if e["frameId"].is_null() {
                    f["id"].clone()
                } else {
                    json!(null)
                };
                v["groupIds"] = if rng.chance(50) {
                    json!([format!("g{n}")])
                } else {
                    json!([])
                };
                write(c, oracle, &v, false);
            }
        }
        // An arrow reconnected to another card.
        70..=74 => {
            if let (Some(a), Some(card)) = (pick(&arrows, rng), pick(&cards, rng)) {
                let mut v = bump(&a, 1 + rng.below(5) as i64, nonce);
                v["endBinding"] =
                    json!({ "elementId": card["id"], "fixedPoint": [0.5, 0], "mode": "orbit" });
                write(c, oracle, &v, false);
            }
        }
        // Deleted — a card with arrows on it as readily as anything.
        75..=86 => {
            let target = if rng.chance(50) {
                pick(&cards, rng)
            } else {
                pick(&live, rng)
            };
            if let Some(e) = target {
                let mut v = bump(&e, 1 + DELETE_JUMP, nonce);
                v["isDeleted"] = json!(true);
                write(c, oracle, &v, false);
            }
        }
        // A deletion undone: ⌘Z, from the deletion this window saw.
        87..=92 => {
            if let Some(e) = pick(&gone, rng) {
                let mut v = bump(&e, 1, nonce);
                v["isDeleted"] = json!(false);
                write(c, oracle, &v, true);
            }
        }
        _ => {
            if let Some(e) = pick(&live, rng) {
                let v = bump(&e, 1, nonce);
                write(c, oracle, &v, false);
            }
        }
    }
}

/// A window's connection on the folder.
async fn open(mut ws: Socket, folder: &str) -> Socket {
    next(&mut ws).await;
    send_raw(&mut ws, 1, "open_server_folder", json!({ "id": folder })).await;
    loop {
        let o = next(&mut ws).await;
        if o["id"].as_u64() == Some(1) {
            assert!(o.get("ok").is_some(), "{o}");
            return ws;
        }
    }
}

/// The file must parse as a JSON Canvas, every time it is read.
fn checked(text: &str) -> Result<Value, String> {
    let v: Value = serde_json::from_str(text).map_err(|e| format!("not JSON: {e}"))?;
    let nodes = v["nodes"].as_array().ok_or("no nodes")?;
    let edges = v["edges"].as_array().ok_or("no edges")?;
    let mut ids = BTreeSet::new();
    for n in nodes {
        for k in ["id", "type"] {
            n[k].as_str().ok_or(format!("a node without {k}: {n}"))?;
        }
        for k in ["x", "y", "width", "height"] {
            n[k].as_f64().ok_or(format!("a node without {k}: {n}"))?;
        }
        if !ids.insert(n["id"].as_str().unwrap().to_owned()) {
            return Err(format!("a node id twice: {n}"));
        }
    }
    let node_ids = ids.clone();
    for e in edges {
        let (id, f, t) = (
            e["id"].as_str(),
            e["fromNode"].as_str(),
            e["toNode"].as_str(),
        );
        let (Some(id), Some(f), Some(t)) = (id, f, t) else {
            return Err(format!("an edge without its fields: {e}"));
        };
        if !node_ids.contains(f) || !node_ids.contains(t) {
            return Err(format!("an edge to no node: {e}"));
        }
        if !ids.insert(id.to_owned()) {
            return Err(format!("an edge id twice: {e}"));
        }
    }
    for d in v["verso"]["drawing"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
    {
        let id = d["id"]
            .as_str()
            .ok_or(format!("a drawn element without id: {d}"))?;
        d["type"]
            .as_str()
            .ok_or(format!("a drawn element without type: {d}"))?;
        if !ids.insert(id.to_owned()) {
            return Err(format!("an id twice: {d}"));
        }
    }
    Ok(v)
}

/// One seed: `ops` changes by five clients; the checks of the module's doc.
async fn run(seed: u64, ops: usize) -> (usize, usize) {
    let mut rng = Rng(seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1);
    let r = start().await;
    let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let folder = folder_id(&r, &b).await;
    let mut clients: Vec<Client> = Vec::new();
    for _ in 0..CLIENTS {
        let ws = open(
            connect(&r, Some(&b.cookie), Some(&r.origin()), None)
                .await
                .unwrap(),
            &folder,
        )
        .await;
        clients.push(Client {
            ws: Some(ws),
            doc: Doc::new(),
            out: Vec::new(),
            inbox: Vec::new(),
            id: 10,
            edits: 0,
            made: 0,
            epoch: String::new(),
            offline: false,
            conflicts: 0,
            log: Vec::new(),
        });
    }
    let made = clients[0]
        .call(
            "create_file",
            json!({ "path": BOARD, "base64": STANDARD.encode(BASE) }),
        )
        .await;
    assert!(made.get("ok").is_some(), "{made}");
    // A reader of the file on the disk, the whole time.
    let stop = Arc::new(AtomicBool::new(false));
    let reads = Arc::new(AtomicUsize::new(0));
    let reader = {
        let (stop, reads, dir) = (Arc::clone(&stop), Arc::clone(&reads), r.campanha());
        std::thread::spawn(move || -> Vec<String> {
            let root = verso_fs::Root::open(dir, Vec::new()).unwrap();
            let mut root = root;
            let mut bad = Vec::new();
            while !stop.load(Ordering::Relaxed) {
                if let Ok(h) = root.handle(Path::new(BOARD))
                    && let Ok((bytes, _)) = root.read(h)
                {
                    reads.fetch_add(1, Ordering::Relaxed);
                    if let Err(e) = checked(&String::from_utf8_lossy(&bytes)) {
                        bad.push(e);
                    }
                }
                std::thread::sleep(Duration::from_millis(2));
            }
            bad
        })
    };
    // The first window draws the file in: no one's edit.
    for c in &mut clients {
        c.join().await;
    }
    {
        let c = &mut clients[0];
        let meta = c.doc.get_or_insert_map(META);
        let u = {
            let mut txn = c.doc.transact_mut();
            meta.insert(&mut txn, "seeded", true);
            meta.insert(&mut txn, "background", "");
            txn.encode_update_v1()
        };
        c.out.push(u);
    }
    let mut oracle = Oracle::default();
    for op in 0..ops {
        let n = rng.below(CLIENTS);
        for _ in 0..=rng.below(3) {
            act(&mut clients[n], n, &mut rng, &mut oracle);
        }
        let c = &mut clients[n];
        if rng.chance(60) {
            c.flush(&mut rng).await;
        }
        if rng.chance(50) {
            c.listen(Duration::from_millis(rng.below(15) as u64)).await;
            c.take_in(&mut rng, false);
        }
        if rng.chance(15) {
            c.hand_file(rng.chance(50)).await;
        }
        // A connection dropped in the middle of a burst (never the first
        // client's: the room keeps someone in it), and back a while later.
        if n != 0 && c.ws.is_some() && rng.chance(4) {
            c.flush(&mut rng).await;
            c.ws = None;
            c.offline = true;
            c.inbox.clear();
        } else if c.ws.is_none() && rng.chance(30) {
            let ws = open(
                connect(&r, Some(&b.cookie), Some(&r.origin()), None)
                    .await
                    .unwrap(),
                &folder,
            )
            .await;
            c.ws = Some(ws);
            c.join().await;
        }
        if op % 50 == 49 {
            tokio::time::sleep(Duration::from_millis(rng.below(30) as u64)).await;
        }
    }
    // Everyone back, everything sent and heard.
    for c in &mut clients {
        if c.ws.is_none() {
            let ws = open(
                connect(&r, Some(&b.cookie), Some(&r.origin()), None)
                    .await
                    .unwrap(),
                &folder,
            )
            .await;
            c.ws = Some(ws);
            c.join().await;
        }
    }
    for _ in 0..4 {
        for c in &mut clients {
            c.flush(&mut rng).await;
        }
        for c in &mut clients {
            c.listen(Duration::from_millis(150)).await;
            c.take_in(&mut rng, true);
        }
    }
    if std::env::var("STRESS_DEBUG").is_ok() {
        let ws = open(
            connect(&r, Some(&b.cookie), Some(&r.origin()), None)
                .await
                .unwrap(),
            &folder,
        )
        .await;
        let mut o = Client {
            ws: Some(ws),
            doc: Doc::new(),
            out: Vec::new(),
            inbox: Vec::new(),
            id: 10,
            edits: 0,
            made: 0,
            epoch: String::new(),
            offline: false,
            conflicts: 0,
            log: Vec::new(),
        };
        o.join().await;
        eprintln!("server: {:?}", o.doc.transact().state_vector());
        for (i, c) in clients.iter().enumerate() {
            eprintln!(
                "client {i} is {} has {:?} pending {:?}",
                c.doc.client_id(),
                c.doc.transact().state_vector(),
                c.doc
                    .transact()
                    .store()
                    .pending_update()
                    .map(|p| p.missing.clone())
            );
        }
    }
    // (a) one board everywhere, and the one Excalidraw's rule picks.
    let first = collab_board::elements(&clients[0].doc);
    for (i, c) in clients.iter().enumerate() {
        let theirs = collab_board::elements(&c.doc);
        assert_eq!(
            serde_json::to_string(&theirs).unwrap(),
            serde_json::to_string(&first).unwrap(),
            "seed {seed}: client {i} holds another board"
        );
        let missing = c
            .doc
            .transact()
            .store()
            .pending_update()
            .map(|p| format!("{:?}", p.missing));
        if let Some(p) = c.doc.transact().store().pending_update() {
            for (who, clock) in p.missing.iter() {
                let id = yrs::ID::new(*who, *clock);
                let had = c
                    .log
                    .iter()
                    .filter(|u| Update::decode_v1(u).unwrap().insertions(true).contains(&id))
                    .count();
                eprintln!(
                    "client {i}: {} updates heard hold {:?}; inbox {} left",
                    had,
                    id,
                    c.inbox.len()
                );
            }
        }
        assert!(
            missing.is_none(),
            "seed {seed}: client {i} holds updates it cannot place, missing {missing:?}; has {:?}",
            c.doc.transact().state_vector()
        );
    }
    let expected: BTreeMap<String, Value> = oracle
        .best
        .iter()
        .map(|(id, (_, j))| (id.clone(), serde_json::from_str(j).unwrap()))
        .collect();
    assert_eq!(
        serde_json::to_string(&first).unwrap(),
        serde_json::to_string(&expected).unwrap(),
        "seed {seed}: the board is not the versions the rule picks"
    );
    // (c) an element deleted that no one undid stays deleted, whatever was
    // done to it meanwhile; once someone undid a deletion of it, its
    // versions decide, by the rule above. Nothing else vanished: every
    // element ever made is in the board, once.
    for id in oracle.deleted.keys() {
        if !oracle.restored.contains_key(id) {
            assert_eq!(first[id]["isDeleted"], true, "seed {seed}: {id} came back");
        }
    }
    for (id, e) in &first {
        if e["isDeleted"] == true {
            assert!(
                oracle.deleted.contains_key(id),
                "seed {seed}: {id} vanished"
            );
        }
    }
    // (d) every binding names an element of the board.
    for e in first.values() {
        for b in [&e["startBinding"], &e["endBinding"]] {
            if let Some(to) = b["elementId"].as_str() {
                assert!(
                    first.contains_key(to),
                    "seed {seed}: {} bound to nothing",
                    e["id"]
                );
            }
        }
        if let Some(to) = e["containerId"].as_str() {
            assert!(first.contains_key(to), "seed {seed}: a label of nothing");
        }
    }
    // The room writes the file of exactly this state.
    let json = canvas_of(&first);
    let c = &mut clients[0];
    let expected_file = c
        .call(
            "board_preview",
            json!({ "path": BOARD, "json": json.to_string() }),
        )
        .await;
    c.hand_file(true).await;
    let mut written = String::new();
    for _ in 0..50 {
        let read = c.call("read_text", json!({ "path": BOARD })).await;
        written = read["ok"]["text"].as_str().unwrap().to_owned();
        if written == expected_file["ok"].as_str().unwrap() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert_eq!(
        written,
        expected_file["ok"].as_str().unwrap(),
        "seed {seed}: the file is not the board of the room's state"
    );
    // (b) a JSON Canvas, and the board of these elements again.
    let file = checked(&written).unwrap_or_else(|e| panic!("seed {seed}: {e}"));
    assert_eq!(
        file, json,
        "seed {seed}: the file does not read back as the board"
    );
    assert_eq!(file["x-kept"], "by every write");
    // (e) no conflict, no copy.
    let files = c.call("list_files", json!({})).await;
    let copies: Vec<&Value> = files["ok"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|f| f.as_str().is_some_and(|f| f.contains("Mesa") && f != BOARD))
        .collect();
    assert!(copies.is_empty(), "seed {seed}: copies {copies:?}");
    for (i, c) in clients.iter().enumerate() {
        assert_eq!(c.conflicts, 0, "seed {seed}: client {i} heard a conflict");
    }
    // (f) every read of the file parsed.
    stop.store(true, Ordering::Relaxed);
    let bad = reader.join().unwrap();
    assert!(
        bad.is_empty(),
        "seed {seed}: a read that did not parse: {bad:?}"
    );
    (reads.load(Ordering::Relaxed), first.len())
}

#[test]
fn a_board_edited_hard_by_five_clients_converges_and_its_file_holds() {
    block_on(async {
        for seed in 1..=3 {
            run(seed, 120).await;
        }
    });
}

/// The long run: `VERSO_STRESS_SEEDS` seeds of `VERSO_STRESS_OPS` changes
/// (200 × 200 by default), timed.
#[test]
#[ignore = "long: run with --ignored"]
fn board_stress_long() {
    let seeds: u64 = std::env::var("VERSO_STRESS_SEEDS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(200);
    let ops: usize = std::env::var("VERSO_STRESS_OPS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(200);
    let started = Instant::now();
    let (mut reads, mut elements) = (0, 0);
    block_on(async {
        for seed in 1..=seeds {
            let (r, e) = run(seed, ops).await;
            reads += r;
            elements += e;
        }
    });
    println!(
        "board stress: {seeds} seeds × {ops} ops, 5 clients, in {:.1} s; {reads} reads of the file, all parsed; {elements} elements in the boards",
        started.elapsed().as_secs_f64()
    );
}
