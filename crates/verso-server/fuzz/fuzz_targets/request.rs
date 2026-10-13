// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: the WebSocket's request (ADR 0083 item 14, F6). Every
//! message a window or a device sends the contract's WebSocket is read by
//! the connection's loop (`rpc.rs`) before anything else looks at it: a
//! text message as the JSON `{id, cmd, args}` through `serde_json`, a
//! binary one (sync 2) as a frame whose header is that JSON and whose piece
//! the loop takes as a slice of the message (`Bytes::slice_ref`). The input
//! is fed both ways, through the loop's own functions
//! (`fuzz_api::text_request`, `fuzz_api::binary_request`).
//!
//! A crash means a peer's message panics the loop that holds a member's
//! connection — a stack overflow on deep JSON, a piece that is not a slice
//! of the message — or that a binary message reaches a command other than
//! `sync_put`, the one that carries a piece. Seeds in `../seeds-request/`:
//! a window's request as text, a device's piece as a frame. Run:
//! `cargo +nightly fuzz run request fuzz/corpus/request fuzz/seeds-request`.

#![no_main]

use libfuzzer_sys::fuzz_target;
use serde_json::json;
use verso_server::fuzz_api;

fuzz_target!(|data: &[u8]| {
    // A text message: tungstenite hands the loop text that is UTF-8.
    if let Ok(text) = std::str::from_utf8(data)
        && let Some((id, cmd, args)) = fuzz_api::text_request(text)
    {
        // What was read is what was sent: written again, it reads the same
        // id and command (the arguments' floats are read at best effort by
        // `serde_json`, so they are only read again).
        let again = json!({ "id": id, "cmd": cmd, "args": args }).to_string();
        let read = fuzz_api::text_request(&again).expect("a request written again reads");
        assert_eq!((read.0, read.1), (id, cmd));
    }
    // A binary message.
    if let Some((request, piece)) = fuzz_api::binary_request(data) {
        let start = data.as_ptr() as usize;
        let at = piece.as_ptr() as usize;
        assert!(
            at >= start && at + piece.len() == start + data.len(),
            "the piece is the end of the message"
        );
        if let Some((_, cmd, _)) = request {
            assert_eq!(cmd, "sync_put", "only a piece's command comes in a frame");
        }
    }
});
