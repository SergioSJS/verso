// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: `parse` must return for any input (Q18, property 1), and the
//! spans it reports must slice the input (property 3). A malformed file must
//! never hang or crash the app (ADR 0029).

#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // The parser takes text; bytes that are not UTF-8 are the caller's
    // problem (spec Q25), so the fuzzer explores the valid ones.
    let Ok(source) = std::str::from_utf8(data) else {
        return;
    };
    let document = verso_dialect::parse(source);
    for link in &document.links {
        assert!(link.span.slice(source).is_some());
    }
    for embed in &document.embeds {
        assert!(embed.span.slice(source).is_some());
    }
    for heading in &document.headings {
        assert!(heading.span.slice(source).is_some());
    }
    for block in &document.blocks {
        assert!(block.span.slice(source).is_some());
    }
    for callout in &document.callouts {
        assert!(callout.span.slice(source).is_some());
    }
});
