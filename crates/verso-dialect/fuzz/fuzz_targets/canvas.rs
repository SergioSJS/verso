// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: the canvas reader and writer of `verso-core` (ADR 0057), a
//! hand-written parser of files of the folder, under the guardrail parser
//! fuzzing gives the dialect (ADR 0029; decided on 2026-10-01, review
//! `board.md` §6 item 9). Any input returns; what parses is written, and
//! the written text parses again and writes the same; a canvas laid over
//! itself writes what it reads; every link it reports points inside the
//! file.
//!
//! The module is `verso-core`'s own source file, compiled here on its own:
//! it needs nothing but `std` and `verso-dialect`, so the harness does not
//! build the core (SQLite included) under the sanitizer. Run:
//! `cargo +nightly fuzz run canvas fuzz/corpus/canvas fuzz/seeds-canvas`.

#![no_main]

#[path = "../../../verso-core/src/canvas.rs"]
#[allow(dead_code)]
mod canvas;

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let Ok(source) = std::str::from_utf8(data) else {
        return;
    };
    let Ok(board) = canvas::Canvas::parse(source) else {
        return;
    };
    let written = board.write();
    let again = canvas::Canvas::parse(&written).expect("what is written parses again");
    assert_eq!(again.write(), written, "the layout is stable");
    let over_itself = board.merged(board.root.clone()).write();
    let reread = canvas::Canvas::parse(&over_itself).expect("a merge parses");
    assert_eq!(reread.write(), over_itself);
    for link in board.links() {
        assert!(source.is_char_boundary(link.at.min(source.len())), "{link:?}");
        assert!(link.at <= source.len(), "{link:?}");
    }
    let _ = board.searchable_text();
});
