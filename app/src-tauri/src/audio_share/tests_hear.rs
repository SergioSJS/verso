// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The receive half of a live share in the desktop host (ADR 0116 items 18
//! and 19), against a real `verso serve` on this machine: the game master's
//! connection starts a share and sends frames as binary messages; a player
//! on the server's folder (the host's connection for its window) hears them
//! as audio, not as a broken piece of a file, and so does the window of a
//! folder of this computer synced with that folder, over the sync's link —
//! handed, byte for byte, to the channel the window gave.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use verso_contract::FrameHeader;

use super::hear;
use crate::remote::{self, Heard, Remote};
use crate::sync::live;
use crate::tests_sync::{Running, device, kept, serve};

fn dial(r: &Running, token: &str) -> (Arc<Remote>, tokio::sync::mpsc::UnboundedReceiver<Heard>) {
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

/// The game master at the table, sharing: its connection and the share's number.
fn sharing(r: &Running) -> Arc<Remote> {
    let (master, _heard) = dial(r, &r.owner);
    call(
        &master,
        "table_join",
        json!({ "color": null, "styles": null }),
    );
    master
}

fn start(master: &Remote) -> u32 {
    let share = call(
        master,
        "table_share_start",
        json!({ "share": { "name": "Spotify", "kind": "app", "bitrate_kbps": 96 } }),
    );
    u32::try_from(share["id"].as_u64().unwrap()).unwrap()
}

fn frame(share: u32, sequence: u32) -> Vec<u8> {
    FrameHeader {
        share,
        sequence,
        timestamp_ms: sequence * 20,
    }
    .frame(&[0xFC, 0xFF, 0xFE, u8::try_from(sequence % 256).unwrap()])
    .unwrap()
}

fn send(master: &Remote, frames: &[Vec<u8>]) {
    tauri::async_runtime::block_on(async {
        for f in frames {
            master
                .tx
                .send(Message::Binary(f.clone().into()))
                .await
                .unwrap();
        }
    });
}

#[test]
fn a_player_on_the_servers_folder_hears_the_frames_as_audio() {
    let r = serve(&[]);
    let master = sharing(&r);
    let (player, mut heard) = dial(&r, &r.reader);
    call(
        &player,
        "table_join",
        json!({ "color": null, "styles": null }),
    );
    let id = start(&master);
    call(&player, "table_share_listen", json!({ "listen": true }));
    let sent: Vec<Vec<u8>> = (0..5).map(|s| frame(id, s)).collect();
    send(&master, &sent);
    let mut got = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(20);
    while got.len() < sent.len() {
        assert!(
            Instant::now() < deadline,
            "heard {} of {}",
            got.len(),
            sent.len()
        );
        match heard.try_recv() {
            Ok(Heard::Audio(bytes)) => got.push(bytes),
            Ok(_) => {}
            Err(_) => std::thread::sleep(Duration::from_millis(20)),
        }
    }
    assert_eq!(got, sent, "byte for byte, in order");
}

#[test]
fn a_synced_folders_window_at_the_table_is_handed_the_frames_on_its_channel() {
    const WINDOW: &str = "w-hears-share";
    let r = serve(&[]);
    let master = sharing(&r);
    let d = device(&r, &r.reader, &[]);
    let _link = kept(&d);
    let cmd = |c: &str, a: Value| {
        tauri::async_runtime::block_on(live::command(&d.ctx, &d.s, WINDOW, c, a))
    };
    cmd("table_join", json!({ "color": null, "styles": null })).unwrap();
    let got: Arc<Mutex<Vec<Vec<u8>>>> = Arc::default();
    let into = Arc::clone(&got);
    hear::hear(
        WINDOW,
        Box::new(move |bytes| {
            verso_service::lock(&into).push(bytes);
            true
        }),
    );
    let id = start(&master);
    cmd("table_share_listen", json!({ "listen": true })).unwrap();
    let sent: Vec<Vec<u8>> = (0..5).map(|s| frame(id, s)).collect();
    send(&master, &sent);
    let deadline = Instant::now() + Duration::from_secs(20);
    while verso_service::lock(&got).len() < sent.len() {
        assert!(
            Instant::now() < deadline,
            "handed {} of {}",
            verso_service::lock(&got).len(),
            sent.len()
        );
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(*verso_service::lock(&got), sent);
    hear::forget(WINDOW);
}
