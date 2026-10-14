// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: a base's regular expressions (ADR 0094, Consequences: "the
//! fuzz target of the expressions covers patterns"). `verso-core`'s
//! `bases/pattern.rs`, compiled here on its own, as the canvas reader is:
//! it needs only `std` and `regex`. The input is a pattern, a NUL, flags,
//! a NUL and a text. Any pattern compiles or is refused — never a panic,
//! never a translation the engine rejects as anything but a refusal — and
//! one that compiles answers `matches`, `replace` (with `g` and `$`
//! replacements) and `split` over the text, within the bounds given.
//! The same input is also read as one expression of a base's language,
//! a regular expression literal included. Run:
//! `cargo +nightly fuzz run pattern fuzz/corpus/pattern fuzz/seeds-pattern`.

#![no_main]

#[path = "../../../verso-core/src/bases/pattern.rs"]
#[allow(dead_code)]
mod pattern;

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let Ok(source) = std::str::from_utf8(data) else {
        return;
    };
    let _ = verso_dialect::bases::parse_expression(source);
    let mut parts = source.splitn(3, '\0');
    let (Some(p), flags, text) = (parts.next(), parts.next().unwrap_or(""), parts.next().unwrap_or(""))
    else {
        return;
    };
    let Ok(re) = pattern::compile(p, flags) else {
        return;
    };
    // A budget, as a query has one: every search is charged.
    let mut left: usize = 1 << 24;
    let mut spend = |bytes: usize| {
        left = left.saturating_sub(bytes / 16 + 1);
        left > 0
    };
    let _ = re.matches(text, &mut spend);
    if let Ok(out) = re.replace(text, "[$&|$1|$<n>|$$|$`]", 1 << 16, &mut spend) {
        assert!(out.len() <= 1 << 16);
    }
    if let Ok(pieces) = re.split(text, Some(64), 1 << 12, &mut spend) {
        assert!(pieces.len() <= 64);
    }
});
