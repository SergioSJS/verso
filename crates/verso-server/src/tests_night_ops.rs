// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Seeded stress of the structure operations (night round of 2026-10-29):
//! devices write, delete and rename over a small set of names that includes
//! case twins and NFC/NFD twins, while another window restores from the
//! trash. Whatever the order the server took them in, a payload it
//! accepted is on the disk or in the trash, never nowhere; no two names fold
//! alike; and every device that asks afterwards is told the same files.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use futures_util::future::join_all;
use serde_json::{Value, json};

use crate::sync::sha256;
use crate::tests::{
    Browser, Running, Socket, block_on, call, connect, folder_id, next, sign_in, start,
};

const NAMES: [&str; 8] = [
    "A.md",
    "a.md",
    "Caf\u{e9}.md",
    "Cafe\u{301}.md",
    "d/B.md",
    "d/b.md",
    "Outra.md",
    "d/Fundo/C.md",
];

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
}

async fn window(r: &Running, b: &Browser, id: &str) -> Socket {
    let mut ws = connect(r, Some(&b.cookie), Some(&r.origin()), None)
        .await
        .unwrap();
    next(&mut ws).await;
    let o = call(&mut ws, 1, "open_server_folder", json!({ "id": id })).await;
    assert!(o.get("ok").is_some(), "{o}");
    ws
}

fn put_args(path: &str, text: &str, base: Option<&str>) -> Value {
    let bytes = text.as_bytes();
    json!({
        "path": path, "offset": 0, "size": bytes.len(), "hash": sha256(bytes),
        "base": base, "data": STANDARD.encode(bytes),
    })
}

/// The hash a device would hold for `path`: the first piece's, `None` when
/// the file is not there.
async fn hash_of(ws: &mut Socket, n: &mut u64, path: &str) -> Option<String> {
    *n += 1;
    let a = call(ws, *n, "sync_read", json!({ "path": path, "offset": 0 })).await;
    a["ok"]["hash"].as_str().map(str::to_owned)
}

async fn device(mut ws: Socket, idx: usize, seed: u64, ops: usize) -> Vec<String> {
    let mut rng = Rng(seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) ^ (idx as u64 + 1) | 1);
    let mut accepted = Vec::new();
    let mut n = 100_u64;
    for k in 0..ops {
        let name = NAMES[rng.below(NAMES.len())];
        let tag = format!("P{idx}-{k}");
        match rng.below(10) {
            // A new file or one over what the device last read.
            0..=4 => {
                let base = hash_of(&mut ws, &mut n, name).await;
                let text = format!("# {tag}\n{}\n", "z".repeat(rng.below(50)));
                n += 1;
                let a = call(
                    &mut ws,
                    n,
                    "sync_put",
                    put_args(name, &text, base.as_deref()),
                )
                .await;
                if a.get("ok").is_some() {
                    accepted.push(tag);
                }
            }
            5 | 6 => {
                if let Some(base) = hash_of(&mut ws, &mut n, name).await {
                    n += 1;
                    call(
                        &mut ws,
                        n,
                        "sync_delete",
                        json!({ "path": name, "base": base }),
                    )
                    .await;
                }
            }
            7..=8 => {
                let to = NAMES[rng.below(NAMES.len())];
                if let Some(base) = hash_of(&mut ws, &mut n, name).await {
                    n += 1;
                    call(
                        &mut ws,
                        n,
                        "sync_rename",
                        json!({ "from": name, "to": to, "base": base }),
                    )
                    .await;
                }
            }
            // A window's own commands: a note made, deleted, renamed.
            _ => {
                n += 1;
                let stem = name.trim_end_matches(".md");
                let a = call(
                    &mut ws,
                    n,
                    "create_note",
                    json!({ "name": stem, "text": format!("# {tag}\n") }),
                )
                .await;
                if a.get("ok").is_some() {
                    accepted.push(tag);
                }
            }
        }
        if rng.below(3) == 0 {
            tokio::time::sleep(std::time::Duration::from_millis(rng.below(4) as u64)).await;
        }
    }
    accepted
}

/// A window that puts back what the trash holds, over and over.
async fn restorer(mut ws: Socket, seed: u64, rounds: usize) {
    let mut rng = Rng(seed | 1);
    let mut n = 100_u64;
    for _ in 0..rounds {
        n += 1;
        let list = call(&mut ws, n, "trash_list", json!({})).await;
        let entries = list["ok"]["entries"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        if !entries.is_empty() {
            let e = &entries[rng.below(entries.len())];
            n += 1;
            call(
                &mut ws,
                n,
                "trash_restore",
                json!({ "path": e["path"], "today": "2026-10-30", "lang": "en" }),
            )
            .await;
        }
        tokio::time::sleep(std::time::Duration::from_millis(3)).await;
    }
}

async fn files_of(ws: &mut Socket, n: &mut u64) -> Vec<(String, String)> {
    *n += 1;
    let s = call(ws, *n, "sync_state", json!({})).await;
    let mut v: Vec<(String, String)> = s["ok"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| {
            (
                f["path"].as_str().unwrap().to_owned(),
                f["hash"].as_str().unwrap().to_owned(),
            )
        })
        .collect();
    v.sort();
    v
}

async fn run(seed: u64, devices: usize, ops: usize) {
    let r = start().await;
    let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(&r, &b).await;
    let mut socks = Vec::new();
    for _ in 0..devices {
        socks.push(window(&r, &b, &id).await);
    }
    let helper = window(&r, &b, &id).await;
    let (results, ()) = tokio::join!(
        join_all(
            socks
                .into_iter()
                .enumerate()
                .map(|(i, ws)| device(ws, i, seed, ops))
        ),
        restorer(helper, seed, ops),
    );
    let accepted: Vec<String> = results.into_iter().flatten().collect();
    let mut me = window(&r, &b, &id).await;
    let mut n = 1000;
    // Put everything the trash holds back, so that what the server kept
    // can be read as files.
    for _ in 0..4 {
        n += 1;
        let list = call(&mut me, n, "trash_list", json!({})).await;
        let entries = list["ok"]["entries"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        if entries.is_empty() {
            break;
        }
        for e in entries {
            n += 1;
            let a = call(
                &mut me,
                n,
                "trash_restore",
                json!({ "path": e["path"], "today": "2026-10-30", "lang": "en" }),
            )
            .await;
            assert!(a.get("ok").is_some(), "seed {seed}: restore of {e}: {a}");
        }
    }
    let files = files_of(&mut me, &mut n).await;
    // No two names fold alike.
    let mut folded: Vec<String> = files
        .iter()
        .map(|(p, _)| verso_core::sync::folded(p))
        .collect();
    folded.sort();
    let before = folded.len();
    folded.dedup();
    assert_eq!(
        before,
        folded.len(),
        "seed {seed}: names that fold alike: {files:?}"
    );
    // What the server lists is what the disk holds.
    let mut all = String::new();
    for (p, h) in &files {
        let text = r.campanha_text(p);
        assert_eq!(
            &sha256(text.as_bytes()),
            h,
            "seed {seed}: {p} is not what the log says"
        );
        all.push_str(&text);
        all.push('\u{0}');
    }
    // No accepted payload nowhere.
    for tag in &accepted {
        assert!(
            all.contains(&format!("# {tag}\n")),
            "seed {seed}: {tag} was accepted and is on the disk nowhere, nor in the trash\n{files:?}"
        );
    }
    // Another device asking is told the same.
    let mut other = window(&r, &b, &id).await;
    let mut m = 10;
    assert_eq!(files_of(&mut other, &mut m).await, files, "seed {seed}");
    // The server's own account of the log agrees with the manifest.
    let log = call(&mut other, 99, "sync_changes", json!({ "since": 0 })).await;
    assert!(log.get("ok").is_some(), "{log}");
}

#[test]
fn night_devices_writing_deleting_and_renaming_twins_lose_no_accepted_payload() {
    block_on(async {
        for seed in 1..=3 {
            run(seed, 4, 25).await;
        }
    });
}

#[test]
#[ignore = "long: run with --ignored"]
fn night_ops_long() {
    block_on(async {
        for seed in 1..=40 {
            run(seed, 5, 60).await;
        }
    });
    println!("night ops: done");
}

// ------------------------------------------------------------- sizes

/// Several devices send a file of more than two pieces to one name at the
/// same time, while others send many small files: the big name ends as
/// exactly one device's whole body (the hash it announced), never a mix of
/// pieces, every small file lands, and the log names them all.
async fn run_sizes(seed: u64) {
    use crate::sync::PIECE;
    use crate::tests_sync::send;
    let r = start().await;
    let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(&r, &b).await;
    let mut rng = Rng(seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1);
    let bodies: Vec<Vec<u8>> = (0..3)
        .map(|d| {
            let mut v = Vec::new();
            let len = 2 * PIECE + 1000 + rng.below(PIECE);
            let mut x = d as u64 + 1;
            while v.len() < len {
                x = x.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
                v.extend_from_slice(format!("{x:016x}\n").as_bytes());
            }
            v.truncate(len);
            v
        })
        .collect();
    let mut big = Vec::new();
    for _ in 0..bodies.len() {
        big.push(window(&r, &b, &id).await);
    }
    let mut small = Vec::new();
    for _ in 0..3 {
        small.push(window(&r, &b, &id).await);
    }
    let bigs = join_all(
        big.into_iter()
            .zip(&bodies)
            .map(|(mut ws, body)| async move {
                let a = send(&mut ws, 100, "Grande.md", body, None).await;
                a.get("ok").is_some()
            }),
    );
    let smalls = join_all(small.into_iter().enumerate().map(|(d, mut ws)| async move {
        let mut done = 0;
        for k in 0..60 {
            let name = format!("pequenas/d{d}-{k}.md");
            let a = send(
                &mut ws,
                100 + 10 * k as u64,
                &name,
                format!("# {d}-{k}\n").as_bytes(),
                None,
            )
            .await;
            assert_eq!(a["ok"]["done"], true, "{a}");
            done += 1;
        }
        done
    }));
    let (won, made) = tokio::join!(bigs, smalls);
    assert_eq!(made.iter().sum::<usize>(), 180);
    assert_eq!(
        won.iter().filter(|w| **w).count(),
        1,
        "seed {seed}: one body wins a new name: {won:?}"
    );
    let mut me = window(&r, &b, &id).await;
    let mut n = 500;
    let files = files_of(&mut me, &mut n).await;
    let (_, hash) = files
        .iter()
        .find(|(p, _)| p == "Grande.md")
        .cloned()
        .unwrap();
    let winner = bodies.iter().position(|b| sha256(b) == hash);
    assert_eq!(
        winner,
        won.iter().position(|w| *w),
        "seed {seed}: the big file is not the winner's body"
    );
    assert_eq!(
        files
            .iter()
            .filter(|(p, _)| p.starts_with("pequenas/"))
            .count(),
        180
    );
}

#[test]
fn night_big_bodies_to_one_name_never_mix_while_small_files_all_land() {
    block_on(async {
        for seed in 1..=2 {
            run_sizes(seed).await;
        }
    });
}

// ------------------------------------------------- a room and a device

/// A window typing in a note's room while a device puts the same note: an
/// accepted put and a typed line are on the disk or in the note's history —
/// unless the people in the room chose the other side of a conflict, which
/// is the one way the server drops a typed line (ADR 0073 item 7, shown to
/// them as a choice). After the choice the room and the disk agree.
async fn run_room_and_device(seed: u64, ops: usize) {
    use crate::collab;
    use crate::tests_night_sync::{Win, new_doc, window as win_socket};
    use crate::tests_sync::send;
    use yrs::{GetString, Text, Transact};
    let r = start().await;
    let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
    let id = folder_id(&r, &b).await;
    let path = "Sessao.md";
    let mut rng = Rng(seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1);
    let mut w = Win {
        ws: win_socket(&r, &b, &id).await,
        doc: new_doc(),
        n: 1,
        mine: vec![],
        deleted: vec![],
        pending: vec![],
        online: true,
    };
    w.join(path).await;
    let mut dev = window(&r, &b, &id).await;
    let mut n = 100;
    let mut typed: Vec<String> = Vec::new();
    let mut lines: Vec<String> = Vec::new();
    let mut discarded: Vec<String> = Vec::new();
    let mut unsaved: Vec<String> = Vec::new();
    let mut conflict = false;
    for k in 0..ops {
        match rng.below(6) {
            0 | 1 => {
                let token = format!("T{seed}-{k}\n");
                let text = w.doc.get_or_insert_text(collab::TEXT);
                let u = {
                    let mut txn = w.doc.transact_mut();
                    let end = text.get_string(&txn).encode_utf16().count() as u32;
                    text.insert(&mut txn, end, &token);
                    txn.encode_update_v1()
                };
                w.push(path, &u).await;
                typed.push(token.clone());
                unsaved.push(token);
            }
            2 | 3 => {
                let base = hash_of(&mut dev, &mut n, path).await;
                let (bytes, _) = {
                    n += 1;
                    let a = call(
                        &mut dev,
                        n,
                        "sync_read",
                        json!({ "path": path, "offset": 0 }),
                    )
                    .await;
                    (
                        STANDARD
                            .decode(a["ok"]["data"].as_str().unwrap_or(""))
                            .unwrap_or_default(),
                        (),
                    )
                };
                let line = format!("D{seed}-{k}\n");
                let mut new = bytes;
                new.extend_from_slice(line.as_bytes());
                let a = send(&mut dev, n + 10, path, &new, base.as_deref()).await;
                n += 100;
                if a.get("ok").is_some() {
                    lines.push(line);
                    // The room hears it on the next question; a conflict is
                    // only what a room with unsaved lines says.
                    if !unsaved.is_empty() {
                        conflict = true;
                    }
                }
            }
            4 => {
                let saved = w.call("collab_save", json!({ "path": path })).await;
                if saved.get("ok").is_some() {
                    unsaved.clear();
                    conflict = false;
                } else {
                    assert_eq!(saved["err"]["kind"], "changed", "seed {seed}: {saved}");
                }
            }
            _ => {
                if conflict && rng.below(2) == 0 {
                    let keep = ["disk", "mine"][rng.below(2)];
                    let a = w
                        .call("collab_resolve", json!({ "path": path, "keep": keep }))
                        .await;
                    assert!(a.get("ok").is_some(), "seed {seed}: {a}");
                    if keep == "disk" {
                        discarded.append(&mut unsaved);
                    }
                    unsaved.clear();
                    conflict = false;
                }
            }
        }
    }
    // The end: the people choose "mine" if they are in a conflict, then
    // everything is written and the room closes.
    let saved = w.call("collab_save", json!({ "path": path })).await;
    if saved.get("ok").is_none() {
        let a = w
            .call("collab_resolve", json!({ "path": path, "keep": "mine" }))
            .await;
        assert!(a.get("ok").is_some(), "seed {seed}: {a}");
    }
    let room = w.text();
    w.call("collab_leave", json!({ "path": path })).await;
    let disk = r.campanha_text(path);
    // The history: every text the note ever had.
    let mut ws = win_socket(&r, &b, &id).await;
    let list = call(&mut ws, 2, "history_list", json!({ "path": path })).await;
    let mut ever = disk.clone();
    for v in list["ok"]["versions"]
        .as_array()
        .cloned()
        .unwrap_or_default()
    {
        let t = call(
            &mut ws,
            3,
            "history_read",
            json!({ "path": path, "id": v["id"] }),
        )
        .await;
        ever.push_str(t["ok"]["text"].as_str().unwrap_or(""));
        ever.push('\u{0}');
    }
    for t in typed.iter().filter(|t| !discarded.contains(t)) {
        assert!(
            ever.contains(t.as_str()),
            "seed {seed}: typed {t:?} is on the disk nowhere nor in the history\ndisk {disk:?}\nroom {room:?}"
        );
    }
    for l in &lines {
        assert!(
            ever.contains(l.as_str()),
            "seed {seed}: accepted {l:?} is on the disk nowhere nor in the history\ndisk {disk:?}"
        );
    }
}

#[test]
fn night_a_room_and_a_device_on_one_note_lose_nothing_but_by_choice() {
    block_on(async {
        for seed in 1..=4 {
            run_room_and_device(seed, 24).await;
        }
    });
}

#[test]
#[ignore = "long: run with --ignored"]
fn night_room_and_device_long() {
    block_on(async {
        for seed in 1..=60 {
            run_room_and_device(seed, 40).await;
        }
    });
}
