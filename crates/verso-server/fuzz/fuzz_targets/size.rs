// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: `config::size` (ADR 0083 item 14, F6), a size as a person
//! writes it — `VERSO_FOLDER_QUOTA` at the start, a folder's quota in the
//! admin's console. Any text returns; a size read is one byte at least,
//! and a number of bytes it gives reads back as itself.
//!
//! A crash means a quota typed in the console panics the request that
//! carries it (a slice off a character's boundary, an overflow), or that a
//! size read differs from the same size written in bytes. Seeds in
//! `../seeds-size/`. Run:
//! `cargo +nightly fuzz run size fuzz/corpus/size fuzz/seeds-size`.

#![no_main]

use libfuzzer_sys::fuzz_target;
use verso_server::config::size;

fuzz_target!(|data: &[u8]| {
    let Ok(text) = std::str::from_utf8(data) else {
        return;
    };
    if let Some(n) = size(text) {
        assert!(n >= 1, "{text:?} read as {n}");
        // Below 2^53 a whole number of bytes is exact as a float.
        if n < 1 << 53 {
            assert_eq!(size(&n.to_string()), Some(n), "{text:?}");
        }
    }
});
