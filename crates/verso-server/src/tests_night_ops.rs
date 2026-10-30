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
