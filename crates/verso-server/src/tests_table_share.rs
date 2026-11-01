// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Share audio at the table (ADR 0116 section B), against a running
//! server: only the game master starts and stops a share; everyone at the
//! table hears of it, the sharer alone its count and rate; the sharer's
//! frames, and only the sharer's, reach the windows that listen, a late one
//! the ring first; the bounds; each way a share ends; and nothing of a
//! frame or of the source's name in the server's log. The relay's rules
//! with a clock the tests move (the slow listener): `audio_relay_tests.rs`.

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use verso_contract::{FRAME_MOST, FrameHeader, SHARE_ID_FIRST};

use crate::tests::block_on;
use crate::tests_campaign::{Mesa, Win, mesa};

/// Bytes only this file's frames carry.
const MARK: &[u8] = b"zqaudiozq";
/// A source's name only this file uses.
const SOURCE: &str = "Zqfonte de som";

async fn at_the_table() -> Mesa {
    let mut m = mesa().await;
    for w in [&mut m.owner, &mut m.ana, &mut m.bia] {
        let joined = w
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert!(joined.get("ok").is_some(), "{joined}");
    }
    m
}

fn start_args(name: &str, bitrate: u16, replace: bool) -> Value {
    json!({ "share": { "name": name, "kind": "app", "bitrate_kbps": bitrate, "replace": replace } })
}

async fn start(w: &mut Win, replace: bool) -> Value {
    let started = w
        .call("table_share_start", start_args(SOURCE, 96, replace))
        .await;
    assert!(started.get("ok").is_some(), "{started}");
    started["ok"].clone()
}

fn share_id(share: &Value) -> u32 {
    u32::try_from(share["id"].as_u64().unwrap()).unwrap()
}

fn frame(share: u32, sequence: u32) -> Vec<u8> {
    let mut packet = MARK.to_vec();
    packet.extend_from_slice(&sequence.to_be_bytes());
    FrameHeader {
        share,
        sequence,
        timestamp_ms: sequence.wrapping_mul(20),
    }
    .frame(&packet)
    .unwrap()
}

async fn send(w: &mut Win, bytes: Vec<u8>) {
    w.ws.send(Message::Binary(bytes.into())).await.unwrap();
}

/// What a window hears for `ms`: its binary frames' sequences, and its
/// events.
async fn heard(w: &mut Win, ms: u64) -> (Vec<u32>, Vec<Value>) {
    let (mut frames, mut events) = (Vec::new(), Vec::new());
    let until = tokio::time::Instant::now() + std::time::Duration::from_millis(ms);
    while let Ok(Some(Ok(m))) = tokio::time::timeout_at(until, w.ws.next()).await {
        match m {
            Message::Binary(b) => {
                let (h, packet) = FrameHeader::decode(&b).unwrap();
                assert!(packet.starts_with(MARK), "relayed unchanged");
                frames.push(h.sequence);
            }
            Message::Text(t) => events.push(serde_json::from_str(&t).unwrap_or(Value::Null)),
            _ => {}
        }
    }
    (frames, events)
}

fn events<'a>(heard: &'a [Value], name: &str) -> Vec<&'a Value> {
    heard
        .iter()
        .filter(|e| e["event"] == name)
        .map(|e| &e["payload"])
        .collect()
}

async fn listen(w: &mut Win, on: bool) {
    let listened = w.call("table_share_listen", json!({ "listen": on })).await;
    assert!(listened.get("ok").is_some(), "{listened}");
}

fn key(m: &Mesa) -> crate::audio_relay::Key {
    (m.id.clone(), String::new())
}

#[test]
fn only_the_game_master_shares_and_everyone_at_the_table_hears_of_it() {
    block_on(async {
        let mut m = at_the_table().await;
        // A player may not, whatever the window shows (item 22).
        let refused = m
            .ana
            .call("table_share_start", start_args("Spotify", 96, false))
            .await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
        let refused = m.ana.call("table_share_stop", json!({})).await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
        // The closed form (item 28).
        for args in [
            start_args(&"a".repeat(81), 96, false),
            start_args("", 96, false),
            start_args("Spo\ntify", 96, false),
            start_args("Spotify", 63, false),
            start_args("Spotify", 129, false),
        ] {
            let refused = m.owner.call("table_share_start", args.clone()).await;
            assert_eq!(refused["err"]["kind"], "refused", "{args} {refused}");
        }
        let share = start(&mut m.owner, false).await;
        assert!(share_id(&share) >= SHARE_ID_FIRST, "{share}");
        assert_eq!(share["name"], SOURCE);
        assert!(
            share["by_id"].as_str().is_some_and(|s| !s.is_empty()),
            "{share}"
        );
        assert_eq!(share["listeners"], 0, "the sharer is told its count");
        assert_eq!(share["rate_bps"], 0);
        // Everyone at the table is told; a player not the count or the rate.
        let (_, told) = heard(&mut m.ana, 300).await;
        let started = events(&told, "table-share-started");
        assert_eq!(started.len(), 1, "{told:?}");
        assert_eq!(started[0]["id"], share["id"]);
        assert!(started[0]["listeners"].is_null() && started[0]["rate_bps"].is_null());
        // A joiner starts from the truth.
        let joined = m
            .bia
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert_eq!(joined["ok"]["broadcast"], false, "{joined}");
        assert_eq!(joined["ok"]["share"]["id"], share["id"], "{joined}");
        assert!(joined["ok"]["share"]["listeners"].is_null());
        let joined = m
            .owner
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert_eq!(joined["ok"]["share"]["listeners"], 0, "{joined}");
    });
}

#[test]
fn the_sharers_frames_reach_the_listeners_and_a_players_reach_no_one() {
    block_on(async {
        let mut m = at_the_table().await;
        let id = share_id(&start(&mut m.owner, false).await);
        listen(&mut m.ana, true).await;
        listen(&mut m.bia, true).await;
        // The sharer is told its count as it changes.
        let (_, told) = heard(&mut m.owner, 300).await;
        let states = events(&told, "table-share-state");
        assert_eq!(
            states.last().map(|s| s["listeners"].clone()),
            Some(json!(2)),
            "{told:?}"
        );
        // A player's frame, even one naming the live share, is no one's.
        send(&mut m.ana, frame(id, 900)).await;
        for n in 0..5 {
            send(&mut m.owner, frame(id, n)).await;
        }
        let (frames, _) = heard(&mut m.bia, 500).await;
        assert_eq!(frames, [0, 1, 2, 3, 4]);
        let (frames, _) = heard(&mut m.ana, 300).await;
        assert_eq!(frames, [0, 1, 2, 3, 4]);
        let (frames, _) = heard(&mut m.owner, 300).await;
        assert!(frames.is_empty(), "never played back to the sharer");
        // The player's connection is still served after its refused frame.
        listen(&mut m.ana, false).await;
        send(&mut m.owner, frame(id, 5)).await;
        let (frames, _) = heard(&mut m.ana, 300).await;
        assert!(frames.is_empty(), "no longer listening");
        let (frames, _) = heard(&mut m.bia, 300).await;
        assert_eq!(frames, [5]);
        // The sharer may not listen to itself.
        let refused = m
            .owner
            .call("table_share_listen", json!({ "listen": true }))
            .await;
        assert_eq!(refused["err"]["kind"], "refused", "{refused}");
    });
}

#[test]
fn a_frame_past_the_bounds_is_dropped_and_the_connection_goes_on() {
    block_on(async {
        let mut m = at_the_table().await;
        let id = share_id(&start(&mut m.owner, false).await);
        listen(&mut m.ana, true).await;
        // Too large, then not this share's number.
        let mut large = frame(id, 1);
        large.resize(FRAME_MOST + 1, 0);
        send(&mut m.owner, large).await;
        send(&mut m.owner, frame(id ^ 1, 2)).await;
        // Seventy at once: sixty a second at most.
        for n in 100..170 {
            send(&mut m.owner, frame(id, n)).await;
        }
        let (frames, _) = heard(&mut m.ana, 700).await;
        assert_eq!(frames.len(), 60, "{frames:?}");
        assert!(!frames.contains(&1) && !frames.contains(&2));
        let c = m.r.server.relay.counts(&key(&m)).unwrap();
        assert_eq!((c.relayed, c.refused), (60, 12), "{c:?}");
        // Refused, not answered: the sharer's connection is served as before.
        let asked = m.owner.call("table_time", json!({})).await;
        assert!(asked.get("ok").is_some(), "{asked}");
    });
}

#[test]
fn a_late_listener_gets_the_ring_then_the_live_frames() {
    block_on(async {
        let mut m = at_the_table().await;
        let id = share_id(&start(&mut m.owner, false).await);
        for n in 0..10 {
            send(&mut m.owner, frame(id, n)).await;
        }
        // The frames are in the ring before Bia asks.
        let _ = m.owner.call("table_time", json!({})).await;
        // Asked without waiting for the answer: the ring may come before it.
        m.bia
            .ws
            .send(Message::Text(
                json!({ "id": 9000, "cmd": "table_share_listen", "args": { "listen": true } })
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        let (mut frames, answers) = heard(&mut m.bia, 300).await;
        assert!(
            answers
                .iter()
                .any(|a| a["id"] == 9000 && a.get("ok").is_some()),
            "{answers:?}"
        );
        send(&mut m.owner, frame(id, 10)).await;
        frames.extend(heard(&mut m.bia, 300).await.0);
        assert_eq!(frames, (0..=10).collect::<Vec<_>>());
    });
}

#[test]
fn a_share_ends_with_its_reason() {
    block_on(async {
        let mut m = at_the_table().await;
        // Stop.
        let first = start(&mut m.owner, false).await;
        let _ = heard(&mut m.ana, 200).await;
        let stopped = m.owner.call("table_share_stop", json!({})).await;
        assert!(stopped.get("ok").is_some(), "{stopped}");
        let (_, told) = heard(&mut m.ana, 300).await;
        let ended = events(&told, "table-share-stopped");
        assert_eq!(ended.len(), 1, "{told:?}");
        assert_eq!(ended[0]["id"], first["id"]);
        assert_eq!(ended[0]["reason"], "stopped");
        // A second share asks to replace the first.
        let first = start(&mut m.owner, false).await;
        let again = m
            .owner
            .call("table_share_start", start_args(SOURCE, 96, false))
            .await;
        assert_eq!(again["err"]["kind"], "exists", "{again}");
        let second = start(&mut m.owner, true).await;
        assert_ne!(second["id"], first["id"]);
        let (_, told) = heard(&mut m.ana, 300).await;
        let ended = events(&told, "table-share-stopped");
        assert!(
            ended
                .iter()
                .any(|e| e["id"] == first["id"] && e["reason"] == "replaced"),
            "{told:?}"
        );
        assert!(
            events(&told, "table-share-started")
                .iter()
                .any(|s| s["id"] == second["id"])
        );
        // The sharer's panel closed: the share goes on, and its sharer may
        // still stop it from there.
        let left = m.owner.call("table_leave", json!({ "table": "" })).await;
        assert!(left.get("ok").is_some(), "{left}");
        assert!(m.r.server.relay.current(&key(&m)).is_some());
        let stopped = m.owner.call("table_share_stop", json!({})).await;
        assert!(stopped.get("ok").is_some(), "{stopped}");
        assert!(m.r.server.relay.current(&key(&m)).is_none());
        // The table empties: its sharer, gone from the panel, is told.
        let joined = m
            .owner
            .call("table_join", json!({ "color": null, "styles": null }))
            .await;
        assert!(joined.get("ok").is_some(), "{joined}");
        let third = start(&mut m.owner, false).await;
        let _ = m.owner.call("table_leave", json!({ "table": "" })).await;
        let _ = heard(&mut m.owner, 200).await;
        for w in [&mut m.ana, &mut m.bia] {
            let left = w.call("table_leave", json!({ "table": "" })).await;
            assert!(left.get("ok").is_some(), "{left}");
        }
        let (_, told) = heard(&mut m.owner, 300).await;
        let ended = events(&told, "table-share-stopped");
        assert_eq!(ended.len(), 1, "{told:?}");
        assert_eq!(ended[0]["id"], third["id"]);
        assert_eq!(ended[0]["reason"], "table_empty");
        // The sharer's window goes.
        for w in [&mut m.owner, &mut m.ana] {
            let joined = w
                .call("table_join", json!({ "color": null, "styles": null }))
                .await;
            assert!(joined.get("ok").is_some(), "{joined}");
        }
        let fourth = start(&mut m.owner, false).await;
        let _ = heard(&mut m.ana, 200).await;
        let Mesa { owner, mut ana, .. } = m;
        drop(owner);
        let (_, told) = heard(&mut ana, 1500).await;
        let ended = events(&told, "table-share-stopped");
        assert_eq!(ended.len(), 1, "{told:?}");
        assert_eq!(ended[0]["id"], fourth["id"]);
        assert_eq!(ended[0]["reason"], "sharer_left");
    });
}

#[test]
fn nothing_of_a_frame_or_of_the_sources_name_reaches_the_log() {
    block_on(async {
        let mut m = at_the_table().await;
        let id = share_id(&start(&mut m.owner, false).await);
        listen(&mut m.ana, true).await;
        // Relayed, too large, of another share, from a player.
        send(&mut m.owner, frame(id, 0)).await;
        let mut large = frame(id, 1);
        large.resize(FRAME_MOST + 1, b'z');
        send(&mut m.owner, large).await;
        send(&mut m.owner, frame(id ^ 1, 2)).await;
        send(&mut m.ana, frame(id, 3)).await;
        let (frames, _) = heard(&mut m.ana, 300).await;
        assert_eq!(frames, [0]);
        let stopped = m.owner.call("table_share_stop", json!({})).await;
        assert!(stopped.get("ok").is_some(), "{stopped}");
        let mark = String::from_utf8_lossy(MARK).into_owned();
        assert!(crate::log::said(&mark).is_empty());
        assert!(crate::log::said("zqfonte").is_empty());
        assert!(crate::log::said("Zqfonte").is_empty());
        // The line that is said: counts only.
        assert!(
            crate::log::said("a live share ended (Stopped): 1 frames relayed, 2 refused")
                .iter()
                .any(|l| !l.contains(&mark)),
        );
    });
}
