// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: `verso_core::sync::unframe` (ADR 0083 item 14, F6), the
//! reader of every binary message a device of sync 2 sends the server — a
//! length in four bytes, a JSON header, a piece of a file — and of every
//! answer the desktop app reads back from it. Any input returns; what it
//! reads is exactly the message's bytes, and `frame` of it writes the
//! message again; a message cut short is refused, never read past.
//!
//! A crash means a peer's bytes panic the connection's loop (a slice past
//! the end, an overflow on a length near `u32::MAX`), or that a header and
//! a piece cross differently from how they were framed. Seeds in
//! `../seeds-unframe/`. Run:
//! `cargo +nightly fuzz run unframe fuzz/corpus/unframe fuzz/seeds-unframe`.

#![no_main]

use libfuzzer_sys::fuzz_target;
use verso_core::sync::{frame, unframe};

fuzz_target!(|data: &[u8]| {
    let said = data
        .first_chunk::<4>()
        .map(|len| u32::from_be_bytes(*len) as usize);
    match unframe(data) {
        Some((header, piece)) => {
            let len = said.expect("a frame has its length");
            assert_eq!(header, &data[4..4 + len]);
            assert_eq!(piece, &data[4 + len..]);
            assert_eq!(frame(header, piece), data);
        }
        None => assert!(said.is_none_or(|len| len > data.len() - 4)),
    }
    // Any header and piece, framed, are read back as they were: the input
    // cut where its first byte says.
    let at = data.first().map_or(0, |b| usize::from(*b)).min(data.len());
    let (header, piece) = data.split_at(at);
    assert_eq!(unframe(&frame(header, piece)), Some((header, piece)));
});
