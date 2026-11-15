// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A board through a share's sync (ADR 0081 item 11, roadmap V.49): the
//! receiver's device holds the board cut to the share — the share's paths,
//! a card beside it locked — and every hash its engine compares is the
//! cut's (`share_sync_board.rs`). The owner's file keeps the owner's paths
//! and the cards the share does not see.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};

use crate::sync::sha256;
use crate::tests_board_players::exchange;
use crate::tests_board_shares::{BOARD, Cast, OUTSIDE, REL, cast_as, cast_with};
use crate::tests_campaign::Win;

/// What a device of the share must never hear: the folder beside it, and
/// the owner's path of the shared folder.
const LEAKS: &[&str] = &["Fora", "zy.md", "Y.md", "Sub/"];

/// The board read by a device of `win`, in pieces, every frame checked.
pub(crate) async fn fetch(win: &mut Win, path: &str) -> (String, String) {
    let mut out = Vec::new();
    let mut hash = String::new();
    loop {
        let (a, _) = exchange(
            win,
            "sync_read",
            json!({ "path": path, "offset": out.len() }),
            LEAKS,
        )
        .await;
        assert!(a.get("ok").is_some(), "{a}");
        if out.is_empty() {
            hash = a["ok"]["hash"].as_str().unwrap().to_owned();
        }
        out.extend(STANDARD.decode(a["ok"]["data"].as_str().unwrap()).unwrap());
        if a["ok"]["done"] == true {
            break;
        }
    }
    (String::from_utf8(out).unwrap(), hash)
}

/// `text` sent by a device of `win` in one piece, over `base`.
pub(crate) async fn send(win: &mut Win, path: &str, text: &str, base: Option<&str>) -> Value {
    let (a, _) = exchange(
        win,
        "sync_put",
        json!({ "path": path, "offset": 0, "size": text.len(), "hash": sha256(text.as_bytes()),
            "base": base, "data": STANDARD.encode(text) }),
        LEAKS,
    )
    .await;
    a
}

/// The manifest's entry of `path`.
fn listed(state: &Value, path: &str) -> Value {
    state["ok"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["path"] == path)
        .cloned()
        .unwrap_or(Value::Null)
}

/// The changes `win`'s device hears after `since`, and the head.
async fn changes(win: &mut Win, since: i64) -> (Vec<Value>, i64) {
    let (a, _) = exchange(win, "sync_changes", json!({ "since": since }), LEAKS).await;
    assert!(a.get("ok").is_some(), "{a}");
    (
        a["ok"]["changes"].as_array().cloned().unwrap_or_default(),
        a["ok"]["head"].as_i64().unwrap(),
    )
}

async fn head(win: &mut Win) -> i64 {
    let (state, _) = exchange(win, "sync_state", json!({}), LEAKS).await;
    state["ok"]["head"].as_i64().unwrap()
}

/// The owner's file of the board, as it is on the server.
async fn owners(c: &mut Cast, path: &str) -> (String, Value) {
    let read = c.owner.call("read_text", json!({ "path": path })).await;
    let text = read["ok"]["text"].as_str().unwrap().to_owned();
    (text, read["ok"]["revision"].clone())
}

/// The owner moves the card `i` of the board to `x`.
async fn owner_moves(c: &mut Cast, i: usize, x: i64) {
    let (text, rev) = owners(c, BOARD).await;
    let mut v: Value = serde_json::from_str(&text).unwrap();
    v["nodes"][i]["x"] = json!(x);
    let wrote = c
        .owner
        .call(
            "write_text",
            json!({ "path": BOARD, "text": v.to_string(), "revision": rev }),
        )
        .await;
    assert!(wrote.get("ok").is_some(), "{wrote}");
}

#[test]
fn a_share_members_device_holds_the_board_cut_to_the_share() {
    crate::tests::block_on(async {
        let mut c = cast_with(false).await;
        let (state, _) = exchange(&mut c.ana, "sync_state", json!({}), LEAKS).await;
        let entry = listed(&state, REL);
        let (text, hash) = fetch(&mut c.ana, REL).await;
        assert!(text.contains("\"Livre.md\""), "{text}");
        // The manifest, the read and the window name one text.
        assert_eq!(hash, sha256(text.as_bytes()));
        assert_eq!(entry["hash"], hash, "{state}");
        assert_eq!(entry["size"], text.len(), "{state}");
        let window = c.ana.call("read_text", json!({ "path": REL })).await;
        assert_eq!(window["ok"]["text"], text);
        let (all, _) = changes(&mut c.ana, 0).await;
        let seen: Vec<&Value> = all.iter().filter(|c| c["path"] == REL).collect();
        assert!(!seen.is_empty(), "{all:?}");
        assert!(seen.iter().all(|c| c["hash"] == hash), "{all:?}");
        // The owner's own sync holds the file as it is.
        let (raw, _) = owners(&mut c, BOARD).await;
        let theirs = c.owner.call("sync_state", json!({})).await;
        assert_eq!(listed(&theirs, BOARD)["hash"], sha256(raw.as_bytes()));
        assert!(raw.contains("Fora/Y.md"));
    });
}

#[test]
fn a_board_edited_on_a_share_members_device_keeps_the_owners_file() {
    crate::tests::block_on(async {
        let mut c = cast_with(false).await;
        let at = head(&mut c.ana).await;
        let (text, hash) = fetch(&mut c.ana, REL).await;
        let mut v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["nodes"][0]["file"], "Livre.md", "{text}");
        v["nodes"][0]["x"] = json!(77);
        let mine = v.to_string();
        let put = send(&mut c.ana, REL, &mine, Some(&hash)).await;
        assert_eq!(put["ok"]["done"], true, "{put}");
        assert_eq!(put["ok"]["path"], REL, "{put}");
        // The owner's file: the owner's paths, the card beside the share as
        // it was.
        let (raw, _) = owners(&mut c, BOARD).await;
        let disk: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(disk["nodes"][0]["file"], "Sub/Livre.md", "{raw}");
        assert_eq!(disk["nodes"][0]["x"], 77, "{raw}");
        assert_eq!(disk["nodes"][1]["file"], "Fora/Y.md", "{raw}");
        assert_eq!(disk["nodes"][1]["x"], 200, "{raw}");
        // What the device hears of its own write: the text it sent, so
        // nothing to fetch; then nothing at all (no ping-pong).
        let (after, now) = changes(&mut c.ana, at).await;
        let mine_hash = sha256(mine.as_bytes());
        let told: Vec<&Value> = after.iter().filter(|c| c["path"] == REL).collect();
        assert!(!told.is_empty(), "{after:?}");
        assert!(told.iter().all(|c| c["hash"] == mine_hash), "{after:?}");
        let (again, still) = changes(&mut c.ana, now).await;
        assert!(again.is_empty(), "{again:?}");
        assert_eq!(still, now);
        let (state, _) = exchange(&mut c.ana, "sync_state", json!({}), LEAKS).await;
        assert_eq!(listed(&state, REL)["hash"], mine_hash, "{state}");
        // The owner changes only the card beside the share: the device hears
        // a change of the hash it holds — nothing to do.
        let (raw, rev) = owners(&mut c, BOARD).await;
        let changed = raw.replace("Fora/Y.md", "Fora/Outro Y.md");
        let wrote = c
            .owner
            .call(
                "write_text",
                json!({ "path": BOARD, "text": changed, "revision": rev }),
            )
            .await;
        assert!(wrote.get("ok").is_some(), "{wrote}");
        let (beside, now) = changes(&mut c.ana, still).await;
        assert!(
            beside
                .iter()
                .filter(|c| c["path"] == REL)
                .all(|c| c["hash"] == mine_hash),
            "{beside:?}"
        );
        // A change inside is a change.
        owner_moves(&mut c, 0, 5).await;
        let (inside, _) = changes(&mut c.ana, now).await;
        let last = inside.iter().rfind(|c| c["path"] == REL).unwrap();
        assert_ne!(last["hash"], mine_hash, "{inside:?}");
        let (text, hash) = fetch(&mut c.ana, REL).await;
        assert_eq!(last["hash"], hash);
        assert!(text.contains("\"Livre.md\""), "{text}");
    });
}

#[test]
fn a_share_members_stale_board_is_refused_and_its_copy_lands_cut() {
    crate::tests::block_on(async {
        let mut c = cast_with(false).await;
        let (text, hash) = fetch(&mut c.ana, REL).await;
        owner_moves(&mut c, 0, 5).await;
        let (before, _) = owners(&mut c, BOARD).await;
        let mut v: Value = serde_json::from_str(&text).unwrap();
        v["nodes"][0]["x"] = json!(66);
        let stale = send(&mut c.ana, REL, &v.to_string(), Some(&hash)).await;
        assert_eq!(stale["err"]["kind"], "changed", "{stale}");
        assert!(
            !stale.to_string().contains(&sha256(before.as_bytes())),
            "{stale}"
        );
        let (after, _) = owners(&mut c, BOARD).await;
        assert_eq!(after, before);
        // The device's copy beside it (a conflict's): a new board of the
        // share, its card joined to the share's path.
        let copy = "Quadro (conflito).canvas";
        let put = send(&mut c.ana, copy, &v.to_string(), None).await;
        assert_eq!(put["ok"]["done"], true, "{put}");
        let (theirs, _) = owners(&mut c, "Sub/Quadro (conflito).canvas").await;
        assert!(theirs.contains("\"Sub/Livre.md\""), "{theirs}");
        // A new board over one that is there names no base: refused.
        let over = send(&mut c.ana, REL, &v.to_string(), None).await;
        assert_eq!(over["err"]["kind"], "changed", "{over}");
        // The server's version fetched: the device resolves on the cut.
        let (now, hash) = fetch(&mut c.ana, REL).await;
        let mut w: Value = serde_json::from_str(&now).unwrap();
        w["nodes"][0]["y"] = json!(9);
        let put = send(&mut c.ana, REL, &w.to_string(), Some(&hash)).await;
        assert_eq!(put["ok"]["done"], true, "{put}");
        let (raw, _) = owners(&mut c, BOARD).await;
        assert!(raw.contains("Fora/Y.md"), "{raw}");
    });
}

#[test]
fn a_board_is_renamed_through_a_share_by_its_cut_and_stays_a_board() {
    crate::tests::block_on(async {
        let mut c = cast_with(false).await;
        let (_, hash) = fetch(&mut c.ana, REL).await;
        let (raw, _) = owners(&mut c, BOARD).await;
        // Out of being a board: its bytes would cross as they are.
        let (out, _) = exchange(
            &mut c.ana,
            "sync_rename",
            json!({ "from": REL, "to": "Quadro.json", "base": hash }),
            LEAKS,
        )
        .await;
        assert_eq!(out["err"]["kind"], "refused", "{out}");
        // By the file's own hash: not the device's to know.
        let (own, _) = exchange(
            &mut c.ana,
            "sync_rename",
            json!({ "from": REL, "to": "Novo.canvas", "base": sha256(raw.as_bytes()) }),
            LEAKS,
        )
        .await;
        assert_eq!(own["err"]["kind"], "changed", "{own}");
        let (moved, _) = exchange(
            &mut c.ana,
            "sync_rename",
            json!({ "from": REL, "to": "Novo.canvas", "base": hash }),
            LEAKS,
        )
        .await;
        assert_eq!(moved["ok"]["path"], "Novo.canvas", "{moved}");
        let (after, _) = owners(&mut c, "Sub/Novo.canvas").await;
        assert_eq!(after, raw);
        let (text, again) = fetch(&mut c.ana, "Novo.canvas").await;
        assert_eq!(again, hash, "{text}");
    });
}

/// Every sync command of the share's device swept for the canaries, with
/// the board at hand: none crosses (`tests_board_leaks::sweep` style).
#[test]
fn no_sync_command_of_a_share_carries_the_owners_board() {
    crate::tests::block_on(async {
        let mut c = cast_with(false).await;
        for (cmd, args) in [
            ("sync_state", json!({})),
            ("sync_changes", json!({ "since": 0 })),
            ("sync_read", json!({ "path": REL, "offset": 0 })),
            ("sync_read", json!({ "path": "QUADRO.CANVAS", "offset": 0 })),
        ] {
            let (a, _) = exchange(&mut c.ana, cmd, args, LEAKS).await;
            let _ = a;
        }
        let id = c.share.clone();
        crate::tests_board_leaks::sweep(&mut c.ana, &id, REL, LEAKS).await;
        let _ = OUTSIDE;
    });
}

/// A reader of the share, and a player of a table through it: the board
/// their device holds is cut too, its hash the cut's on every path; neither
/// writes a board whole.
#[test]
fn a_reader_and_a_player_of_the_share_hold_the_board_cut_too() {
    crate::tests::block_on(async {
        for (table, role) in [(false, "reader"), (true, "editor")] {
            let mut c = cast_as(table, role).await;
            let (state, _) = exchange(&mut c.ana, "sync_state", json!({}), LEAKS).await;
            let entry = listed(&state, REL);
            let (text, hash) = fetch(&mut c.ana, REL).await;
            assert!(text.contains("\"Livre.md\""), "{role}: {text}");
            assert_eq!(hash, sha256(text.as_bytes()), "{role}");
            assert_eq!(entry["hash"], hash, "{role}: {state}");
            let (all, _) = changes(&mut c.ana, 0).await;
            assert!(
                all.iter()
                    .filter(|c| c["path"] == REL)
                    .all(|c| c["hash"] == hash),
                "{role}: {all:?}"
            );
            let put = send(&mut c.ana, REL, &text, Some(&hash)).await;
            assert!(put.get("err").is_some(), "{role}: {put}");
            let (raw, _) = owners(&mut c, BOARD).await;
            assert!(raw.contains("Fora/Y.md"), "{raw}");
        }
    });
}
