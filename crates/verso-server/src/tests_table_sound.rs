// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Music at the table (ADR 0116 section A), against a running server: the
//! game master alone controls it; the state is stamped by the server's
//! clock, its revision grows, an older one is refused; a joiner starts from
//! it; it goes on when the game master leaves and is dropped when the table
//! empties; and — the visibility rule, BLOCKING by the reviews' rule — a
//! player who does not see the file is told that a track plays and nothing
//! of it: not its path, not its name, and `/f/` still answers not found.

use base64::Engine;
use serde_json::{Value, json};

use crate::tests::{block_on, get, sign_in};
use crate::tests_campaign::{Mesa, Win, mesa};

/// A few bytes an MP3 starts with: the server keeps the name, a window
/// decodes the rest.
fn mp3() -> String {
    base64::engine::general_purpose::STANDARD.encode(b"ID3\x04\x00\x00\x00\x00\x00\x00 a song")
}

/// The words only the hidden track's path holds.
const SECRET: &str = "zqsegredo";
const HIDDEN: &str = "Segredo Zq/zqsegredo.mp3";
const OPEN: &str = "Musica/taverna.mp3";

/// A table with two tracks: the tavern's released to the table, the other
/// hidden; everyone at the table.
async fn with_tracks() -> Mesa {
    let mut m = mesa().await;
    for path in [OPEN, HIDDEN] {
        let made = m
            .owner
            .call("create_file", json!({ "path": path, "base64": mp3() }))
            .await;
        assert!(made.get("ok").is_some(), "{made}");
    }
    let walked = m.owner.call("reindex", json!({})).await;
    assert!(walked.get("ok").is_some(), "{walked}");
    let released = m
        .owner
        .call(
            "access_set",
            json!({ "paths": [OPEN], "change": seen_by_all() }),
        )
        .await;
    assert!(released.get("ok").is_some(), "{released}");
    for w in [&mut m.owner, &mut m.ana, &mut m.bia] {
        let joined = w
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert!(joined.get("ok").is_some(), "{joined}");
    }
    m
}

/// The access of a file seen by the whole table: what the release question
/// sets (ADR 0113's Access dialog, *Whole table: sees*).
fn seen_by_all() -> Value {
    json!({ "kind": "set", "set": { "whole": "see", "rows": [] }, "secret_name": null })
}

fn refused(v: &Value) -> bool {
    v["err"]["kind"] == "refused"
}

/// The `table-playback` events among what a window heard.
fn playbacks(heard: &[Value]) -> Vec<Value> {
    heard
        .iter()
        .filter(|e| e["event"] == "table-playback")
        .map(|e| e["payload"].clone())
        .collect()
}

async fn play(w: &mut Win, path: &str, ask: bool) -> Value {
    w.call(
        "table_play",
        json!({ "channel": "music", "path": path, "positionMs": 0, "looping": false, "durationMs": 60000, "ask": ask }),
    )
    .await
}

#[test]
fn only_the_game_master_controls_the_music_and_the_server_keeps_the_clock() {
    block_on(async {
        let mut m = with_tracks().await;
        // A player controls nothing, whatever the window showed.
        for w in [&mut m.ana, &mut m.bia] {
            let no = play(w, OPEN, false).await;
            assert!(refused(&no), "{no}");
        }
        // The join says who controls.
        let joined = m
            .ana
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert_eq!(joined["ok"]["play"], false, "{joined}");
        let joined = m
            .owner
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert_eq!(joined["ok"]["play"], true, "{joined}");
        let before = crate::table_sound::now_ms();
        let played = play(&mut m.owner, OPEN, false).await;
        let pb = played["ok"]["playback"].clone();
        assert_eq!(pb["state"], "playing", "{played}");
        assert_eq!(pb["source"]["path"], OPEN);
        assert_eq!(pb["source"]["kind"], "file");
        assert_eq!(pb["revision"], 1.0);
        let anchor = pb["anchor_ms"].as_f64().unwrap();
        assert!(anchor >= before - 1.0, "stamped by the server's clock");
        // Ana hears it, the file's path included: she sees it.
        let heard = playbacks(&m.ana.hear(400).await);
        assert_eq!(heard.last().unwrap()["source"]["path"], OPEN, "{heard:?}");
        assert_eq!(heard.last().unwrap()["unseen"], false);
        // A player's pause is refused; the master's grows the revision.
        let no = m
            .ana
            .call(
                "table_sound",
                json!({ "channel": "music", "revision": 1, "wish": "pause" }),
            )
            .await;
        assert!(refused(&no), "{no}");
        let paused = m
            .owner
            .call(
                "table_sound",
                json!({ "channel": "music", "revision": 1, "wish": "pause" }),
            )
            .await;
        assert_eq!(paused["ok"]["state"], "paused", "{paused}");
        assert_eq!(paused["ok"]["revision"], 2.0);
        // A wish on an older state is refused.
        let stale = m
            .owner
            .call(
                "table_sound",
                json!({ "channel": "music", "revision": 1, "wish": "resume" }),
            )
            .await;
        assert!(refused(&stale), "{stale}");
        let seek = m
            .owner
            .call(
                "table_sound",
                json!({ "channel": "music", "revision": 2, "wish": "seek", "value": 30000 }),
            )
            .await;
        assert_eq!(seek["ok"]["position_ms"], 30000.0, "{seek}");
        let vol = m
            .owner
            .call(
                "table_sound",
                json!({ "channel": "music", "revision": 3, "wish": "master", "value": 40 }),
            )
            .await;
        assert_eq!(vol["ok"]["master"], 40, "{vol}");
        let lp = m
            .owner
            .call(
                "table_sound",
                json!({ "channel": "music", "revision": 4, "wish": "loop", "looping": true }),
            )
            .await;
        assert_eq!(lp["ok"]["looping"], true, "{lp}");
        // The clock: the server's own.
        let t = m.ana.call("table_time", json!({})).await;
        assert!(t["ok"]["now_ms"].as_f64().unwrap() >= anchor, "{t}");
        // What is not a sound file of the folder, or not the music channel,
        // is refused.
        for (path, channel) in [
            ("../fora.mp3", "music"),
            ("/abs.mp3", "music"),
            ("https://x.example/a.mp3", "music"),
            ("Aberta.md", "music"),
            (OPEN, "ambience"),
        ] {
            let no = m
                .owner
                .call("table_play", json!({ "channel": channel, "path": path }))
                .await;
            assert!(refused(&no), "{path} {channel}: {no}");
        }
    });
}

#[test]
fn a_late_joiner_starts_from_the_state_and_the_music_outlives_the_master_but_not_the_table() {
    block_on(async {
        let mut m = with_tracks().await;
        let played = play(&mut m.owner, OPEN, false).await;
        assert!(played["ok"]["playback"].is_object(), "{played}");
        // Bia leaves and comes back: the join answers what plays.
        m.bia.call("table_leave", json!({})).await;
        let joined = m
            .bia
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        let pb = &joined["ok"]["playback"][0];
        assert_eq!(pb["source"]["path"], OPEN, "{joined}");
        assert_eq!(pb["state"], "playing");
        // The game master leaves: the music goes on (Q8 a).
        m.owner.call("table_leave", json!({})).await;
        assert!(crate::table_sound::plays(&m.r.server, (&m.id, "")));
        let joined = m
            .ana
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert_eq!(joined["ok"]["playback"][0]["state"], "playing");
        // The last window leaves: it goes with the table.
        m.ana.call("table_leave", json!({})).await;
        m.bia.call("table_leave", json!({})).await;
        assert!(!crate::table_sound::plays(&m.r.server, (&m.id, "")));
    });
}

/// The visibility rule: nothing of a hidden track — not its bytes, not its
/// path, not its name — reaches a player outside its audience, by the
/// state, the join, an event or `/f/`; the game master is told who does
/// not hear, and a release lets them hear it.
#[test]
fn a_hidden_track_reaches_no_player_who_does_not_see_it() {
    block_on(async {
        let mut m = with_tracks().await;
        // Asked first: the two players do not see it, and nothing plays.
        let asked = play(&mut m.owner, HIDDEN, true).await;
        assert!(asked["ok"]["playback"].is_null(), "{asked}");
        let mut names: Vec<String> = asked["ok"]["unheard"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_owned())
            .collect();
        names.sort();
        assert_eq!(names, ["Ana", "Bia"], "{asked}");
        assert!(!crate::table_sound::plays(&m.r.server, (&m.id, "")));
        // Played without them: they are told a track plays, and nothing of
        // it.
        let played = play(&mut m.owner, HIDDEN, false).await;
        assert_eq!(
            played["ok"]["playback"]["source"]["path"], HIDDEN,
            "the master is told the track: {played}"
        );
        assert_eq!(
            played["ok"]["playback"]["unheard"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        for w in [&mut m.ana, &mut m.bia] {
            let heard = w.hear(400).await;
            for e in &heard {
                let text = e.to_string();
                assert!(!text.contains(SECRET), "a player heard {SECRET}: {text}");
                assert!(
                    !text.contains("Segredo"),
                    "a player heard the folder: {text}"
                );
            }
            let pb = playbacks(&heard);
            let last = pb.last().expect("told that something plays");
            assert!(last["source"].is_null(), "{last}");
            assert_eq!(last["unseen"], true);
            assert_eq!(last["unheard"], json!([]), "only the master is told who");
            // A join tells the same.
            let joined = w
                .call("table_join", json!({ "color": null, "styles": null }))
                .await;
            let text = joined.to_string();
            assert!(!text.contains(SECRET), "{text}");
            assert_eq!(joined["ok"]["playback"][0]["unseen"], true, "{joined}");
            // A mark from a window that does not see it changes nothing.
            w.call(
                "table_cannot_play",
                json!({ "channel": "music", "revision": 1 }),
            )
            .await;
        }
        let state = m
            .owner
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert_eq!(state["ok"]["playback"][0]["cannot"], json!([]), "{state}");
        // No second door: the file route still says not found.
        let b = sign_in(&m.r, "ana@casa.lan", "a senha da ana").await;
        let (status, _) = get(&m.r, &format!("/f/{}/{HIDDEN}", m.id), Some(&b)).await;
        assert_eq!(status, 404);
        // Released: the players are told the track, and the file is theirs.
        let released = m
            .owner
            .call(
                "access_set",
                json!({ "paths": [HIDDEN], "change": seen_by_all() }),
            )
            .await;
        assert!(released.get("ok").is_some(), "{released}");
        let pb = playbacks(&m.ana.hear(600).await);
        assert_eq!(
            pb.last().expect("told again")["source"]["path"],
            HIDDEN,
            "{pb:?}"
        );
        let (status, _) = get(&m.r, &format!("/f/{}/{HIDDEN}", m.id), Some(&b)).await;
        assert_eq!(status, 200);
        // A window that cannot play it says so; the master is told who.
        m.ana
            .call(
                "table_cannot_play",
                json!({ "channel": "music", "revision": 1 }),
            )
            .await;
        let told = playbacks(&m.owner.hear(400).await);
        assert_eq!(told.last().unwrap()["cannot"], json!(["Ana"]), "{told:?}");
    });
}
