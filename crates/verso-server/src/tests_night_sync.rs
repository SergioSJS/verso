// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Seeded stress of the server's write paths under concurrency (the night
//! round of 2026-10-29): devices syncing one note against the base they
//! read, windows typing into one room, a device writing under a room. Every
//! check is the same promise: no byte the server accepted is lost, no byte
//! it refused lands, and everyone ends with what is on the disk.
//!
//! `cargo test` runs a few short seeds; the long run is ignored:
//! `cargo test -p verso-server night_ -- --ignored --nocapture`.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use futures_util::future::join_all;
use serde_json::{Value, json};
use yrs::updates::decoder::Decode;
use yrs::{Doc, GetString, ReadTxn, StateVector, Text, Transact, Update};

use crate::collab;
use crate::sync::sha256;
use crate::tests::{
    Browser, Running, Socket, block_on, call, connect, folder_id, next, sign_in, start,
};
use crate::tests_sync::send;

struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Self(seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1)
    }
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
}

pub(crate) async fn window(r: &Running, b: &Browser, id: &str) -> Socket {
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let o = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(o.get("ok").is_some(), "{o}");
    ws
}

fn seeds() -> (u64, usize) {
    let n = |name: &str, default: u64| {
        std::env::var(name)
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(default)
    };
    (
        n("VERSO_NIGHT_SEEDS", 200),
        usize::try_from(n("VERSO_NIGHT_OPS", 30)).unwrap_or(30),
    )
}

// ---------------------------------------------------------------- sync

/// A file read in pieces, as `tests_sync::fetch`, but an error answer is
/// shown instead of unwrapped.
async fn fetch(ws: &mut Socket, id: u64, path: &str) -> (Vec<u8>, String) {
    let mut out = Vec::new();
    let mut hash = String::new();
    let mut n = id;
    loop {
        let a = call(
            ws,
            n,
            "sync_read",
            json!({ "path": path, "offset": out.len() }),
        )
        .await;
        n += 1;
        // A file that changed between two pieces is read again (the
        // device's own loop): a refusal, never torn bytes.
        if a["err"]["message"] == "changed while it crossed" {
            out.clear();
            continue;
        }
        assert!(
            a.get("ok").is_some(),
            "sync_read {path} at {}: {a}",
            out.len()
        );
        if out.is_empty() {
            hash = a["ok"]["hash"].as_str().unwrap().to_owned();
        }
        out.extend(STANDARD.decode(a["ok"]["data"].as_str().unwrap()).unwrap());
        if a["ok"]["done"] == true {
            break;
        }
    }
    (out, hash)
}

struct Device {
    accepted: Vec<String>,
    refused: Vec<(String, String)>,
}

/// One device: read the note with its hash, add a line of its own, send it
/// against that hash. A refusal makes the conflict copy a device makes (its
/// version beside the file), which the server must take as a new file.
async fn device(mut ws: Socket, idx: usize, seed: u64, rounds: usize, path: &str) -> Device {
    let mut rng = Rng::new(seed * 100 + idx as u64);
    let mut out = Device {
        accepted: Vec::new(),
        refused: Vec::new(),
    };
    let mut n = 1000_u64;
    for round in 0..rounds {
        let (bytes, hash) = fetch(&mut ws, n, path).await;
        n += 100;
        if rng.chance(40) {
            tokio::time::sleep(std::time::Duration::from_millis(rng.below(6) as u64)).await;
        }
        let line = format!("d{idx}r{round} ç{}\n", "x".repeat(rng.below(40)));
        let mut new = bytes.clone();
        new.extend_from_slice(line.as_bytes());
        let answer = send(&mut ws, n, path, &new, Some(&hash)).await;
        n += 100;
        if answer.get("ok").is_some() {
            out.accepted.push(line);
        } else {
            assert_eq!(answer["err"]["kind"], "changed", "{answer}");
            let copy = format!(
                "{} (conflito d{idx}r{round}).md",
                path.trim_end_matches(".md")
            );
            let made = send(&mut ws, n, &copy, &new, None).await;
            n += 100;
            assert_eq!(made["ok"]["done"], true, "{made}");
            out.refused.push((line, copy));
        }
    }
    out
}

async fn run_sync(seed: u64, devices: usize, rounds: usize) -> (usize, usize) {
    let r = start().await;
    let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(&r, &b).await;
    let first = "# Mesa\n";
    let mut setup = window(&r, &b, &id).await;
    let made = send(&mut setup, 10, "Mesa.md", first.as_bytes(), None).await;
    assert_eq!(made["ok"]["done"], true, "{made}");
    let mut sockets = Vec::new();
    for _ in 0..devices {
        sockets.push(window(&r, &b, &id).await);
    }
    let results = join_all(
        sockets
            .into_iter()
            .enumerate()
            .map(|(i, ws)| device(ws, i, seed, rounds, "Mesa.md")),
    )
    .await;
    let disk = r.campanha_text("Mesa.md");
    let mut accepted = 0;
    let mut refused = 0;
    for d in &results {
        for line in &d.accepted {
            accepted += 1;
            assert_eq!(
                disk.matches(line.as_str()).count(),
                1,
                "seed {seed}: accepted {line:?} lost or doubled\n{disk}"
            );
        }
        for (line, copy) in &d.refused {
            refused += 1;
            assert!(
                !disk.contains(line.as_str()),
                "seed {seed}: refused {line:?} landed"
            );
            let kept = r.campanha_text(copy);
            assert!(
                kept.contains(line.as_str()),
                "seed {seed}: conflict copy {copy} lost its line"
            );
        }
    }
    // Nothing but the first line and the accepted ones.
    assert_eq!(disk.lines().count(), 1 + accepted, "seed {seed}\n{disk}");
    assert!(disk.starts_with(first), "seed {seed}");
    // The server's own account of the file is the disk's.
    let state = call(&mut setup, 20, "sync_state", json!({})).await;
    let listed = state["ok"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["path"] == "Mesa.md")
        .cloned()
        .unwrap();
    assert_eq!(listed["hash"], sha256(disk.as_bytes()), "seed {seed}");
    let (bytes, hash) = fetch(&mut setup, 30, "Mesa.md").await;
    assert_eq!(bytes, disk.as_bytes());
    assert_eq!(hash, sha256(disk.as_bytes()));
    (accepted, refused)
}

#[test]
fn night_devices_syncing_one_note_lose_no_accepted_line_and_land_no_refused_one() {
    block_on(async {
        for seed in 1..=3 {
            let (a, _) = run_sync(seed, 6, 12).await;
            assert!(a >= 12, "at least one device always wins a round: {a}");
        }
    });
}

#[test]
#[ignore = "long: run with --ignored"]
fn night_sync_long() {
    let (seeds, ops) = seeds();
    let (mut a, mut f) = (0, 0);
    block_on(async {
        for seed in 1..=seeds.min(60) {
            let (x, y) = run_sync(seed, 8, ops).await;
            a += x;
            f += y;
        }
    });
    println!("night sync: accepted {a}, refused {f}");
}

// ---------------------------------------------------------------- rooms

pub(crate) struct Win {
    pub(crate) ws: Socket,
    pub(crate) doc: Doc,
    pub(crate) n: u64,
    pub(crate) mine: Vec<String>,
    pub(crate) deleted: Vec<String>,
    pub(crate) pending: Vec<Vec<u8>>,
    pub(crate) online: bool,
}

pub(crate) fn new_doc() -> Doc {
    Doc::with_options(yrs::Options {
        offset_kind: yrs::OffsetKind::Utf16,
        ..Default::default()
    })
}

impl Win {
    pub(crate) async fn call(&mut self, cmd: &str, args: Value) -> Value {
        self.n += 1;
        call(&mut self.ws, self.n, cmd, args).await
    }
    pub(crate) async fn join(&mut self, path: &str) -> String {
        let j = self.call("collab_join", json!({ "path": path })).await;
        let update = STANDARD
            .decode(j["ok"]["update"].as_str().unwrap())
            .unwrap();
        self.doc
            .transact_mut()
            .apply_update(Update::decode_v1(&update).unwrap())
            .unwrap();
        j["ok"]["epoch"].as_str().unwrap().to_owned()
    }
    pub(crate) async fn push(&mut self, path: &str, update: &[u8]) {
        let a = self
            .call(
                "collab_update",
                json!({ "path": path, "update": STANDARD.encode(update) }),
            )
            .await;
        assert!(a.get("ok").is_some(), "{a}");
    }
    pub(crate) fn text(&self) -> String {
        self.doc
            .get_or_insert_text(collab::TEXT)
            .get_string(&self.doc.transact())
    }
    /// One edit at a line start: a token of its own, or the removal of one
    /// it made before.
    fn edit(&mut self, id: usize, k: usize, rng: &mut Rng) -> Vec<u8> {
        let text = self.doc.get_or_insert_text(collab::TEXT);
        let now = text.get_string(&self.doc.transact());
        let mut starts = vec![0_u32];
        let mut at = 0_u32;
        for ch in now.chars() {
            at += ch.len_utf16() as u32;
            if ch == '\n' {
                starts.push(at);
            }
        }
        let mut txn = self.doc.transact_mut();
        if !self.mine.is_empty() && rng.chance(25) {
            let token = self.mine.remove(rng.below(self.mine.len()));
            if let Some(b) = now.find(&token) {
                let from = now[..b].encode_utf16().count() as u32;
                text.remove_range(&mut txn, from, token.encode_utf16().count() as u32);
                self.deleted.push(token);
                return txn.encode_update_v1();
            }
            self.mine.push(token);
        }
        let token = format!("w{id}k{k} ⟦é{}⟧\n", rng.below(1000));
        let pos = starts[rng.below(starts.len())];
        text.insert(&mut txn, pos, &token);
        self.mine.push(token);
        txn.encode_update_v1()
    }
}

async fn run_room(seed: u64, wins: usize, ops: usize, leave_all: bool) {
    let r = start().await;
    let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(&r, &b).await;
    let path = "Sessao.md";
    let mut rng = Rng::new(seed);
    // The keeper holds the room (one epoch) unless the run lets it die.
    let mut keeper = Win {
        ws: window(&r, &b, &id).await,
        doc: new_doc(),
        n: 1,
        mine: vec![],
        deleted: vec![],
        pending: vec![],
        online: true,
    };
    let epoch = keeper.join(path).await;
    let mut all = vec![];
    for _ in 0..wins {
        let mut w = Win {
            ws: window(&r, &b, &id).await,
            doc: new_doc(),
            n: 1,
            mine: vec![],
            deleted: vec![],
            pending: vec![],
            online: true,
        };
        assert_eq!(w.join(path).await, epoch);
        all.push(w);
    }
    for k in 0..ops {
        for (i, w) in all.iter_mut().enumerate() {
            let roll = rng.below(100);
            if roll < 8 && w.online {
                // Gone: what it types now waits.
                w.call("collab_leave", json!({ "path": path })).await;
                w.online = false;
            } else if roll < 20 && !w.online {
                // Back: join, then its whole state (what it typed offline).
                assert_eq!(
                    w.join(path).await,
                    epoch,
                    "seed {seed}: the room was made again"
                );
                let whole = w
                    .doc
                    .transact()
                    .encode_state_as_update_v1(&StateVector::default());
                w.push(path, &whole).await;
                w.pending.clear();
                w.online = true;
            } else {
                let u = w.edit(i, k, &mut rng);
                if w.online {
                    w.push(path, &u).await;
                } else {
                    w.pending.push(u);
                }
            }
        }
    }
    // Everyone ends joined, sends its whole state, takes the room's.
    for w in &mut all {
        if !w.online {
            w.join(path).await;
        } else {
            w.call("collab_leave", json!({ "path": path })).await;
            w.join(path).await;
        }
        let whole = w
            .doc
            .transact()
            .encode_state_as_update_v1(&StateVector::default());
        w.push(path, &whole).await;
    }
    for w in &mut all {
        w.join(path).await;
    }
    keeper.call("collab_leave", json!({ "path": path })).await;
    keeper.join(path).await;
    let saved = keeper.call("collab_save", json!({ "path": path })).await;
    assert!(
        saved["ok"].is_string() || saved.get("ok").is_some(),
        "{saved}"
    );
    let truth = keeper.text();
    for (i, w) in all.iter().enumerate() {
        assert_eq!(w.text(), truth, "seed {seed}: window {i} diverged");
    }
    for (i, w) in all.iter().enumerate() {
        for t in &w.mine {
            assert_eq!(
                truth.matches(t.as_str()).count(),
                1,
                "seed {seed}: w{i} {t:?} lost or doubled\n{truth}"
            );
        }
        for t in &w.deleted {
            assert!(
                !truth.contains(t.as_str()),
                "seed {seed}: w{i} {t:?} came back"
            );
        }
    }
    assert_eq!(truth.matches("# Sessao").count(), 1, "seed {seed}\n{truth}");
    assert_eq!(
        r.campanha_text(path),
        truth,
        "seed {seed}: the file is not the room"
    );
    if leave_all {
        // The room dies and is made from the file: the text survives it.
        for w in &mut all {
            w.call("collab_leave", json!({ "path": path })).await;
        }
        keeper.call("collab_leave", json!({ "path": path })).await;
        let mut again = Win {
            ws: window(&r, &b, &id).await,
            doc: new_doc(),
            n: 1,
            mine: vec![],
            deleted: vec![],
            pending: vec![],
            online: true,
        };
        again.join(path).await;
        assert_eq!(
            again.text(),
            truth,
            "seed {seed}: the remade room differs from the file"
        );
    }
}

#[test]
fn night_windows_typing_in_one_room_converge_and_the_file_is_the_room() {
    block_on(async {
        for seed in 1..=3 {
            run_room(seed, 4, 25, seed == 3).await;
        }
    });
}

#[test]
#[ignore = "long: run with --ignored"]
fn night_rooms_long() {
    let (seeds, ops) = seeds();
    block_on(async {
        for seed in 1..=seeds.min(60) {
            run_room(seed, 5, ops, seed % 2 == 0).await;
        }
    });
    println!("night rooms: done");
}

/// Night round 2026-10-30: five people typing in turn never left a pause of
/// 900 ms, so the room never wrote the file (4 minutes on disk at 5 bytes).
/// A room writes at least every few seconds while edits keep coming.
#[test]
fn a_note_edited_without_a_pause_is_still_written() {
    use base64::Engine;
    use yrs::updates::decoder::Decode;
    use yrs::{GetString, Text, Transact};
    crate::tests::block_on(async {
        let r = crate::tests::start().await;
        let b = crate::tests::sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let id = crate::tests::folder_id(&r, &b).await;
        let mut one = crate::tests::connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        let mut two = crate::tests::connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        for ws in [&mut one, &mut two] {
            crate::tests::next(ws).await;
            crate::tests::call(ws, 1, "open_server_folder", json!({ "id": id })).await;
        }
        let joined =
            crate::tests::call(&mut one, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
        crate::tests::call(&mut two, 2, "collab_join", json!({ "path": "Sessao.md" })).await;
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
        let text = doc.get_or_insert_text(crate::collab::TEXT);
        // An edit every 300 ms for ten seconds: never a pause of 900 ms.
        let mut saved = false;
        for n in 0..34 {
            let typed = {
                let mut txn = doc.transact_mut();
                let len = text.get_string(&txn).encode_utf16().count() as u32;
                text.insert(&mut txn, len, &format!("linha {n}\n"));
                txn.encode_update_v1()
            };
            let update = base64::engine::general_purpose::STANDARD.encode(typed);
            let sent = crate::tests::call(
                &mut one,
                10 + n,
                "collab_update",
                json!({ "path": "Sessao.md", "update": update }),
            )
            .await;
            assert!(sent.get("ok").is_some(), "{sent}");
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            // Window two's events: a save tells the file was written.
            while let Ok(Some(Ok(tokio_tungstenite::tungstenite::Message::Text(t)))) =
                tokio::time::timeout(
                    std::time::Duration::from_millis(1),
                    futures_util::StreamExt::next(&mut two),
                )
                .await
            {
                let v: Value = serde_json::from_str(&t).unwrap();
                saved |= v["event"] == "collab-saved";
            }
        }
        assert!(saved, "ten seconds of steady typing and no write");
    });
}
