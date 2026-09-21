// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: `parse` must return for any input (Q18, property 1), every
//! span it reports must slice the input, and every `pos` must be what
//! counting lines and characters gives (property 3). A malformed file must
//! never hang or crash the app (ADR 0029).

#![no_main]

use libfuzzer_sys::fuzz_target;
use verso_dialect::{Pos, Span};

/// Line and column by spec §4.4, computed independently of the parser.
fn expected_pos(source: &str, offset: usize) -> Pos {
    let before = &source[..offset];
    let line = before.matches('\n').count() + 1;
    let line_start = before.rfind('\n').map_or(0, |i| i + 1);
    let col = before[line_start..].chars().count() + 1;
    Pos {
        line: u32::try_from(line).unwrap_or(u32::MAX),
        col: u32::try_from(col).unwrap_or(u32::MAX),
    }
}

fn check(source: &str, span: Span, pos: Pos) {
    assert!(span.slice(source).is_some(), "span {span:?} off a boundary");
    assert_eq!(pos, expected_pos(source, span.start), "pos of span {span:?}");
}

fuzz_target!(|data: &[u8]| {
    // The parser takes text; bytes that are not UTF-8 are the caller's
    // problem (spec Q25), so the fuzzer explores the valid ones.
    let Ok(source) = std::str::from_utf8(data) else {
        return;
    };
    let document = verso_dialect::parse(source);
    for link in &document.links {
        check(source, link.span, link.pos);
    }
    for embed in &document.embeds {
        check(source, embed.span, embed.pos);
    }
    for heading in &document.headings {
        check(source, heading.span, heading.pos);
    }
    for block in &document.blocks {
        check(source, block.span, block.pos);
    }
    for callout in &document.callouts {
        check(source, callout.span, callout.pos);
    }
    if let Some(frontmatter) = &document.frontmatter {
        assert!(frontmatter.span.slice(source).is_some());
        assert_eq!(frontmatter.span.start, 0);
    }
});
