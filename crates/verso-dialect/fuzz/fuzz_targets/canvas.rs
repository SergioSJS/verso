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
    let whole = source.split_once('\0').map_or(source, |(first, _)| first);
    let Ok(board) = canvas::Canvas::parse(whole) else {
        return;
    };
    let written = board.write();
    let again = canvas::Canvas::parse(&written).expect("what is written parses again");
    assert_eq!(again.write(), written, "the layout is stable");
    let over_itself = board.merged(board.root.clone()).write();
    let reread = canvas::Canvas::parse(&over_itself).expect("a merge parses");
    assert_eq!(reread.write(), over_itself);
    // A second canvas laid over the first, as a save lays the window's over
    // the file: the input split at its first NUL byte. Rounding, matching by
    // `id` and new keys are reached only by a tree that differs (review
    // `board.md`, second reading, finding 7).
    if let Some((first, second)) = source.split_once('\0')
        && let (Ok(old), Ok(new)) = (canvas::Canvas::parse(first), canvas::Canvas::parse(second))
    {
        let merged = old.merged(new.root).write();
        let again = canvas::Canvas::parse(&merged).expect("a merge parses again");
        assert_eq!(again.write(), merged, "a merge's layout is stable");
    }
    for link in board.links() {
        assert!(whole.is_char_boundary(link.at.min(whole.len())), "{link:?}");
        assert!(link.at <= whole.len(), "{link:?}");
    }
    let _ = board.searchable_text();
});
