// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The whole path of a live share with the test tone (ADR 0116, S5), in the
//! host, against a real `verso serve` on this machine: the master's window
//! starts the share on the server and the host's `Shares` sends the tone's
//! Opus frames on that same connection (`Remote::send_audio`, as
//! `audio_share_start` does); a listener's connection receives them through
//! the host's receive half (`Heard::Audio`, what `audio_share_hear` hands
//! the window) and an Opus decoder finds the 440 Hz tone; a late joiner gets
//! the ring then live frames; the sharer's connection closing ends the share
//! for the listener; the server's bounds hold.

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tokio::sync::mpsc::UnboundedReceiver;
use tokio_tungstenite::tungstenite::Message;
use verso_contract::{FRAME_MOST, FrameHeader, SAMPLE_RATE};

use super::Shares;
use super::tone::{HZ, TestTone};
use crate::remote::{self, Heard, Remote};
use crate::tests_sync::{Running, serve};

type Listening = UnboundedReceiver<Heard>;

fn dial(r: &Running, token: &str) -> (Arc<Remote>, Listening) {
    let login = verso_core::servers::ServerLogin {
        url: r.url.clone(),
        token: token.to_owned(),
        email: "x@casa.lan".into(),
        name: "X".into(),
    };
    tauri::async_runtime::block_on(async {
        let (remote, heard) = remote::dial(&login, r.folder.clone()).await.unwrap();
        remote
            .call("open_server_folder", json!({ "id": r.folder }))
            .await
            .unwrap();
        (remote, heard)
    })
}

fn call(r: &Remote, cmd: &str, args: Value) -> Value {
    tauri::async_runtime::block_on(r.call(cmd, args)).unwrap()
}

fn join(r: &Remote) {
    call(r, "table_join", json!({ "color": null, "styles": null }));
}

/// The master at the table with a share started on the server, and the
/// host's share sending the tone on its connection, as `audio_share_start`.
fn master_sharing(r: &Running) -> (Arc<Remote>, Shares, u32) {
    let (master, _events) = dial(r, &r.owner);
    join(&master);
    let started = call(
        &master,
        "table_share_start",
        json!({ "share": { "name": "Test tone", "kind": "system", "bitrate_kbps": 96 } }),
    );
    let id = u32::try_from(started["id"].as_u64().unwrap()).unwrap();
    let shares = Shares::default();
    let link = Arc::clone(&master);
    shares
        .start(
            "master-window",
            Box::new(TestTone),
            96,
            id,
            Box::new(move |f| link.send_audio(f)),
        )
        .unwrap();
    (master, shares, id)
}

fn listener(r: &Running) -> (Arc<Remote>, Listening) {
    let (l, heard) = dial(r, &r.reader);
    join(&l);
    call(&l, "table_share_listen", json!({ "listen": true }));
    (l, heard)
}

/// What the listener hears for `ms`: the audio frames and the events.
fn hear_for(heard: &mut Listening, ms: u64) -> (Vec<Vec<u8>>, Vec<(String, Value)>) {
    let (mut frames, mut events) = (Vec::new(), Vec::new());
    let until = Instant::now() + Duration::from_millis(ms);
    while Instant::now() < until {
        match heard.try_recv() {
            Ok(Heard::Audio(b)) => frames.push(b),
            Ok(Heard::Event(n, p)) => events.push((n, p)),
            Ok(_) => {}
            Err(_) => std::thread::sleep(Duration::from_millis(10)),
        }
    }
    (frames, events)
}

fn sequences(frames: &[Vec<u8>]) -> Vec<u32> {
    frames
        .iter()
        .map(|f| FrameHeader::decode(f).unwrap().0.sequence)
        .collect()
}

/// Decode `frames` in order into the left channel.
fn decode(frames: &[Vec<u8>]) -> Vec<f32> {
    let mut dec = opus::Decoder::new(SAMPLE_RATE, opus::Channels::Stereo).unwrap();
    let mut out = Vec::new();
    for f in frames {
        let (_, packet) = FrameHeader::decode(f).unwrap();
        let mut pcm = vec![0.0_f32; 960 * 2];
        let n = dec.decode_float(packet, &mut pcm, false).unwrap();
        out.extend(pcm[..n * 2].chunks(2).map(|c| c[0]));
    }
    out
}

/// The signal's power at `hz` over its power overall (Goertzel): near 1 for
/// a pure sine, near 0 for anything else.
fn share_at(pcm: &[f32], hz: f64) -> f64 {
    let w = 2.0 * std::f64::consts::PI * hz / f64::from(SAMPLE_RATE);
    let (mut s1, mut s2) = (0.0_f64, 0.0_f64);
    for &x in pcm {
        let s = f64::from(x) + 2.0 * w.cos() * s1 - s2;
        s2 = s1;
        s1 = s;
    }
    let at = s1 * s1 + s2 * s2 - 2.0 * w.cos() * s1 * s2;
    let total: f64 = pcm.iter().map(|&x| f64::from(x).powi(2)).sum();
    at / (total * pcm.len() as f64 / 4.0).max(1e-12)
}

#[test]
fn a_listener_hears_the_tone_and_a_late_joiner_gets_the_ring_then_live_frames() {
    let r = serve(&[]);
    let (_master, shares, _id) = master_sharing(&r);
    let (_l1, mut first) = listener(&r);
    let (frames, _) = hear_for(&mut first, 1000);
    assert!(
        (35..=70).contains(&frames.len()),
        "about 50 frames in a second, got {}",
        frames.len()
    );
    let seq = sequences(&frames);
    assert!(
        seq.windows(2).all(|w| w[1] == w[0] + 1),
        "in order: {seq:?}"
    );
    let pcm = decode(&frames);
    let tone = share_at(&pcm[pcm.len() / 4..], HZ as f64);
    let off = share_at(&pcm[pcm.len() / 4..], 1000.0);
    assert!(tone > 0.5, "440 Hz carries the signal: {tone}");
    assert!(off < 0.05, "1000 Hz does not: {off}");
    let level = pcm.iter().fold(0.0_f32, |m, x| m.max(x.abs()));
    assert!((0.15..=0.3).contains(&level), "the tone's level: {level}");

    // A late joiner: the ring (frames from before it listened) first, then
    // the live ones, one unbroken sequence.
    let (_l2, mut late) = listener(&r);
    let (late_frames, _) = hear_for(&mut late, 600);
    let late_seq = sequences(&late_frames);
    assert!(!late_seq.is_empty());
    assert!(
        late_seq[0] < *seq.last().unwrap(),
        "starts inside the ring: {} vs {}",
        late_seq[0],
        seq.last().unwrap()
    );
    assert!(
        late_seq.windows(2).all(|w| w[1] == w[0] + 1),
        "{late_seq:?}"
    );
    assert!(
        late_seq.len() > 30,
        "ring then live: {} frames",
        late_seq.len()
    );
    let late_pcm = decode(&late_frames);
    assert!(share_at(&late_pcm[late_pcm.len() / 4..], HZ as f64) > 0.5);
    shares.end_all();
}

#[test]
fn the_sharers_window_going_away_ends_the_share_for_the_listener() {
    let r = serve(&[]);
    let (master, shares, _id) = master_sharing(&r);
    let (_l, mut heard) = listener(&r);
    let (frames, _) = hear_for(&mut heard, 300);
    assert!(!frames.is_empty());
    // The host stops its source with the window, then the connection goes.
    shares.end_all();
    master.hang_up();
    drop(master);
    let (_, events) = hear_for(&mut heard, 3000);
    let ended: Vec<_> = events
        .iter()
        .filter(|(n, _)| n == "table-share-stopped")
        .collect();
    assert_eq!(ended.len(), 1, "{events:?}");
    assert_eq!(ended[0].1["reason"], "sharer_left");
}

#[test]
fn the_bounds_hold_on_the_wire_a_flood_and_a_big_frame_never_reach_a_listener() {
    let r = serve(&[]);
    let (master, shares, id) = master_sharing(&r);
    shares.end_all();
    let (_l, mut heard) = listener(&r);
    // Drain what the tone left in the ring before it ended.
    let _ = hear_for(&mut heard, 300);
    let flood: Vec<Vec<u8>> = (10_000..10_300)
        .map(|s| {
            FrameHeader {
                share: id,
                sequence: s,
                timestamp_ms: 0,
            }
            .frame(&[0xFC, 0xFF, 0xFE])
            .unwrap()
        })
        .collect();
    let mut big = FrameHeader {
        share: id,
        sequence: 20_000,
        timestamp_ms: 0,
    }
    .frame(&[0xFC])
    .unwrap();
    big.resize(FRAME_MOST + 1, 0);
    tauri::async_runtime::block_on(async {
        for f in flood.iter().chain(std::iter::once(&big)) {
            master
                .tx
                .send(Message::Binary(f.clone().into()))
                .await
                .unwrap();
        }
    });
    let (frames, _) = hear_for(&mut heard, 1500);
    let seq = sequences(&frames);
    let flooded = seq.iter().filter(|s| (10_000..10_300).contains(*s)).count();
    assert!(
        flooded <= 70,
        "300 frames in a burst, at most about a second's worth got through: {flooded}"
    );
    assert!(!seq.contains(&20_000), "an oversize frame is dropped");
}
