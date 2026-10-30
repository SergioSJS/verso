// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Seeded stress of who may write, under concurrency (night round of
//! 2026-10-29, ADR 0113): at a table the game master, an editing player and
//! a reading player act at once on the same notes. A reader never writes; an
//! editor never deletes nor moves (K.5); the editor revoked mid-session
//! stops writing at once; and through all of it the game master's last
//! accepted text is the file's.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use serde_json::{Value, json};

use crate::db::Role;
use crate::tests::{block_on, sign_in};
use crate::tests_campaign::{Win, mesa};

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

/// Whether the folder holds `path` (read through `verso-fs`).
fn there(r: &crate::tests::Running, path: &str) -> bool {
    verso_fs::Root::open(r.campanha(), Vec::new()).is_ok_and(|mut root| {
        root.handle(std::path::Path::new(path))
            .is_ok_and(|h| root.read(h).is_ok())
    })
}

fn ok(v: &Value) -> bool {
    v.get("ok").is_some()
}

fn put(path: &str, text: &str, base: Option<&str>) -> Value {
    use base64::Engine as _;
    let bytes = text.as_bytes();
    json!({
        "path": path, "offset": 0, "size": bytes.len(),
        "hash": crate::sync::sha256(bytes), "base": base,
        "data": base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

/// The game master: replaces the note's text, over and over, taking the
/// revision it read; a stale revision is read again, never dropped. Returns
/// the last text it had accepted.
async fn game_master(w: &mut Win, seed: u64, rounds: usize, path: &str) -> String {
    let mut rng = Rng(seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1);
    let mut last = String::new();
    for round in 0..rounds {
        for _ in 0..30 {
            let read = w.call("read_note", json!({ "path": path })).await;
            assert!(
                ok(&read),
                "seed {seed}: the game master cannot read {path}: {read}"
            );
            let text = format!(
                "Livre palavrachave\n\nmesa r{round} {}\n",
                "g".repeat(rng.below(30))
            );
            let wrote = w
                .call(
                    "write_note",
                    json!({ "path": path, "text": text, "revision": read["ok"]["revision"] }),
                )
                .await;
            if ok(&wrote) {
                last = text;
                break;
            }
            assert!(
                matches!(wrote["err"]["kind"].as_str(), Some("changed" | "conflict")),
                "seed {seed}: the game master's write failed oddly: {wrote}"
            );
        }
        tokio::time::sleep(std::time::Duration::from_millis(rng.below(4) as u64)).await;
    }
    last
}

/// The editing player: writes the note it sees (both ways a window writes
/// it), tries to delete and move it, and rename Aberta. `gone` says whether its place
/// at the table is already taken away when it sends.
async fn editor(w: &mut Win, seed: u64, rounds: usize, gone: &AtomicBool, slipped: &AtomicUsize) {
    let mut rng = Rng(seed.wrapping_mul(0x2545_f491_4f6c_dd1d) | 1);
    for round in 0..rounds {
        let was_gone = gone.load(Ordering::SeqCst);
        let path = ["Livre.md", "Aberta.md"][rng.below(2)];
        let kind = rng.below(6);
        let answer = match kind {
            0 => w.call("delete_entry", json!({ "path": path })).await,
            1 => {
                w.call(
                    "move_entries",
                    json!({ "paths": [path], "folder": "Mundo Zq" }),
                )
                .await
            }
            2 => {
                // Same-folder rename of what one edits is the table's rule
                // (ADR 0113 matrix); only Aberta, never the master's note.
                let (from, to) = if round % 2 == 0 {
                    ("Aberta.md", "Aberta2.md")
                } else {
                    ("Aberta2.md", "Aberta.md")
                };
                w.call("rename_entry", json!({ "from": from, "to": to }))
                    .await
            }
            3 => {
                let state = w.call("sync_state", json!({})).await;
                let hash = state["ok"]["files"]
                    .as_array()
                    .and_then(|f| f.iter().find(|f| f["path"] == path))
                    .and_then(|f| f["hash"].as_str().map(str::to_owned));
                w.call(
                    "sync_put",
                    put(path, &format!("do Cid r{round}\n"), hash.as_deref()),
                )
                .await
            }
            4 => {
                w.call("sync_delete", json!({ "path": path, "base": "x" }))
                    .await
            }
            _ => {
                let read = w.call("read_note", json!({ "path": path })).await;
                let rev = read["ok"]["revision"].clone();
                w.call(
                    "write_note",
                    json!({ "path": path, "text": format!("do Cid r{round}\n"), "revision": rev }),
                )
                .await
            }
        };
        // Never a delete, a move or a rename: whatever the moment.
        assert!(
            !(matches!(kind, 0 | 1 | 4) && ok(&answer)),
            "seed {seed}: an editor's delete, move or rename (op {kind}) of {path} was accepted: {answer}"
        );
        if was_gone && ok(&answer) {
            slipped.fetch_add(1, Ordering::SeqCst);
        }
        tokio::time::sleep(std::time::Duration::from_millis(rng.below(4) as u64)).await;
    }
}

async fn reader(w: &mut Win, seed: u64, rounds: usize) -> usize {
    let mut rng = Rng(seed.wrapping_mul(0x1234_5678_9abc_def1) | 1);
    let mut wrote = 0;
    for round in 0..rounds {
        let path = ["Livre.md", "Aberta.md", "Nova.md"][rng.below(3)];
        let answers = [
            w.call(
                "create_note",
                json!({ "name": format!("Leitora{round}"), "text": "x\n" }),
            )
            .await,
            w.call(
                "write_note",
                json!({ "path": path, "text": "x\n", "revision": "x" }),
            )
            .await,
            w.call("delete_entry", json!({ "path": path })).await,
            w.call("rename_entry", json!({ "from": path, "to": "Y.md" }))
                .await,
            w.call("sync_put", put(path, "da leitora\n", None)).await,
            w.call("sync_delete", json!({ "path": path, "base": "x" }))
                .await,
            w.call(
                "create_file",
                json!({ "path": "Anexos/l.png", "base64": "AA==" }),
            )
            .await,
        ];
        wrote += answers.iter().filter(|a| ok(a)).count();
    }
    wrote
}

async fn run(seed: u64, rounds: usize) {
    let mut m = mesa().await;
    let c =
        m.r.server
            .db
            .create_account("cid@casa.lan", "Cid", "pt", Some("a senha do cid"), false)
            .unwrap();
    m.r.server.db.grant(&m.id, &c.id, Role::Editor).unwrap();
    let b = sign_in(&m.r, "cid@casa.lan", "a senha do cid").await;
    let (mut cid, o) = Win::open(&m.r, &b, &m.id).await;
    assert!(ok(&o), "{o}");
    let before: Vec<String> = ["Aberta.md", "Livre.md", "Barão Zq.md"]
        .iter()
        .map(|p| m.r.campanha_text(p))
        .collect();
    let gone = AtomicBool::new(false);
    let slipped = AtomicUsize::new(0);
    let (server, folder, cid_id) = (m.r.server.clone(), m.id.clone(), c.id.clone());
    let revoker = async {
        tokio::time::sleep(std::time::Duration::from_millis(40 + seed % 30)).await;
        server.db.revoke(&folder, &cid_id).unwrap();
        server.role_changed(&folder, &cid_id, None, "revoked");
        gone.store(true, Ordering::SeqCst);
    };
    let (last, wrote, ..) = tokio::join!(
        game_master(&mut m.owner, seed, rounds, "Livre.md"),
        reader(&mut m.bia, seed, rounds),
        editor(&mut cid, seed, rounds, &gone, &slipped),
        revoker,
    );
    assert_eq!(wrote, 0, "seed {seed}: a reader's write was accepted");
    assert_eq!(
        slipped.load(Ordering::SeqCst),
        0,
        "seed {seed}: a write of the revoked editor was accepted"
    );
    // The game master's last accepted text is the file.
    assert_eq!(
        m.r.campanha_text("Livre.md"),
        last,
        "seed {seed}: the game master's text was lost"
    );
    // Nothing was deleted, moved or taken: the notes are there, the intruder's names are not.
    let aberta = ["Aberta.md", "Aberta2.md"]
        .iter()
        .filter(|p| there(&m.r, p))
        .count();
    assert_eq!(aberta, 1, "seed {seed}: Aberta is gone or doubled");
    for p in ["Livre.md", "Barão Zq.md", "Mundo Zq/Cripta Zq.md"] {
        assert!(there(&m.r, p), "seed {seed}: {p} is gone from the folder");
    }
    let listed = m.owner.call("list_notes", json!({})).await;
    let all = listed.to_string();
    assert!(
        !all.contains("Leitora") && !all.contains("Y.md"),
        "seed {seed}: {all}"
    );
    // Only the links to the renamed note are corrected there (ADR 0113).
    assert_eq!(
        m.r.campanha_text("Barão Zq.md")
            .replace("Aberta2", "Aberta"),
        before[2],
        "seed {seed}: a hidden note changed"
    );
}

#[test]
fn night_readers_never_write_editors_never_delete_and_a_revoked_editor_stops() {
    block_on(async {
        for seed in 1..=3 {
            run(seed, 20).await;
        }
    });
}

#[test]
#[ignore = "long: run with --ignored"]
fn night_access_long() {
    block_on(async {
        for seed in 1..=40 {
            run(seed, 40).await;
        }
    });
    println!("night access: done");
}
