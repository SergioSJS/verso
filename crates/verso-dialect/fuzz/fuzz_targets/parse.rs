// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: `parse` must return for any input (Q18, property 1), every
//! span it reports must slice the input, and every `pos` must be what
//! counting lines and characters gives (property 3). `to_html` and
//! `body_tags` run on the same input and must return too: the reading view
//! renders every note under a mutex, and a panic there would poison it. A
//! malformed file must never hang or crash the app (ADR 0029).
//!
//! `../seeds/` holds one input per case that once broke something, run
//! first on every job: `deep-yaml.txt`, 4 000 nested block sequences in the
//! frontmatter, overflowed the YAML loading driver before the depth bound
//! (review of PR #7, finding 1); `list-refdef-tabs.txt` and
//! `pulldown-exponential.txt`, the two inputs on which `pulldown-cmark`
//! 0.13.4 panicked or took exponential time, fixed in the upstream revision
//! the base is built from (ADR 0037); `callout-raw-html.txt`, a raw
//! `</blockquote>` on a callout's title line, on which `to_html` sliced the
//! HTML backwards and panicked (Opus reading of Phase 2, finding 1). The
//! same input is read as a base and as one expression of a base's
//! language, which must return as well (ADR 0053). The projection a
//! UniVerso serves a reader (ADR 0087 item 3) returns too, keeps only
//! whole lines of the input in their order, and settles: the projection
//! of a projection is itself, with no secret callout left in it. Seeds
//! run smallest first, so a seed that fails ends the job before any
//! mutation: a seed is only added once it passes. Run:
//! `cargo +nightly fuzz run parse fuzz/corpus/parse fuzz/seeds`.

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
        // The span must be the `^id` token itself: a block reported from
        // inside a code block would slice fine and still be wrong here.
        assert_eq!(block.span.slice(source), Some(format!("^{}", block.id).as_str()));
    }
    for callout in &document.callouts {
        check(source, callout.span, callout.pos);
    }
    // A link a property holds (spec Q10): its span is the `[[…]]` itself,
    // inside the frontmatter.
    for link in &document.property_links {
        check(source, link.span, link.pos);
        let text = link.span.slice(source).unwrap_or_default();
        assert!(text.starts_with("[[") && text.ends_with("]]"), "{text:?}");
        let fm = document.frontmatter.as_ref().map(|f| f.span);
        assert!(fm.is_some_and(|f| f.start <= link.span.start && link.span.end <= f.end));
    }
    if let Some(frontmatter) = &document.frontmatter {
        assert!(frontmatter.span.slice(source).is_some());
        assert_eq!(frontmatter.span.start, 0);
    }
    // The reader: no panic is the whole claim. The tag rule: each span is
    // its own `#name`.
    let _ = verso_dialect::to_html(source);
    for tag in verso_dialect::body_tags(source) {
        assert_eq!(tag.span.slice(source), Some(format!("#{}", tag.name).as_str()));
    }
    // A base comes from a file of the folder too (ADR 0053): reading it,
    // and every expression it holds, returns for any input.
    let base = verso_dialect::bases::parse_base(source);
    for (_, text) in base.formulas.iter().chain(base.summaries.iter()) {
        let _ = verso_dialect::bases::parse_expression(text);
    }
    let _ = verso_dialect::bases::parse_expression(source);
    // A reader's projection (ADR 0087): whole lines of the input, in order,
    // and nothing left to remove.
    let projected = verso_dialect::project(source);
    let mut kept = source.split_inclusive('\n');
    for line in projected.split_inclusive('\n') {
        assert!(kept.any(|l| l == line), "{line:?} is not a line of the input");
    }
    assert!(verso_dialect::Secrets::of(&projected).is_empty());
    assert_eq!(verso_dialect::project(&projected), projected);
});
