// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The round-trip property test of ADR 0029, under the definition the
//! maintainer chose for Q18 (reading b, `docs/spec/dialect.md` §9): four
//! properties over generated inputs, one test each.
//!
//! 1. `parse` returns for every input.
//! 2. `parse(x) == parse(x)`.
//! 3. Span fidelity: every construct's span slices the input back to the
//!    construct's own text, and `pos` is what counting lines and characters
//!    from the start of the input gives.
//! 4. The read path does not write: the input is the same before and after.
//!    At this crate's level that holds by construction (no IO dependency,
//!    `std::fs` denied by clippy); the test states it in code all the same.
//!    The check on the bytes of a file on disk belongs to `verso-fs`,
//!    feature 2.
//!
//! The generator mixes the dialect's own tokens with free text, so that the
//! inputs are dense in links, embeds, headings, ids, callouts and frontmatter
//! rather than random bytes; the fuzz target covers the random bytes.

use proptest::prelude::*;
use verso_dialect::{Document, Pos, parse};

/// A fragment of note: a dialect token, a piece of prose, or whitespace.
fn fragment() -> impl Strategy<Value = String> {
    prop_oneof![
        4 => Just("[[".to_owned()),
        4 => Just("]]".to_owned()),
        2 => Just("![[".to_owned()),
        2 => Just("|".to_owned()),
        2 => Just("#".to_owned()),
        2 => Just("^".to_owned()),
        2 => Just("\n# ".to_owned()),
        2 => Just("\n## ".to_owned()),
        1 => Just("\n### Título ##\n".to_owned()),
        2 => Just(" ^bloco-1".to_owned()),
        2 => Just("\n> [!warning] ".to_owned()),
        1 => Just("\n> [!note]- ".to_owned()),
        1 => Just("\n> > [!tip]+ ".to_owned()),
        1 => Just("\n> ".to_owned()),
        1 => Just("---\ntitle: x\ntags: [a, b]\n---\n".to_owned()),
        1 => Just("---\n".to_owned()),
        1 => Just("`".to_owned()),
        1 => Just("\n```\n".to_owned()),
        1 => Just("\n- ".to_owned()),
        1 => Just("\\".to_owned()),
        3 => Just("\n".to_owned()),
        1 => Just("\r\n".to_owned()),
        1 => Just("\n\n".to_owned()),
        3 => Just(" ".to_owned()),
        3 => "[a-zA-Z0-9 ]{1,8}",
        2 => "[çãéõÇ🎲日本 ]{1,4}",
        1 => "\\PC{0,6}",
    ]
}

fn note() -> impl Strategy<Value = String> {
    prop::collection::vec(fragment(), 0..48).prop_map(|parts| parts.concat())
}

/// Line and column by the definition of spec §4.4, independent of the
/// parser's own line index: count `\n` before the offset, then characters
/// since the last one.
fn expected_pos(source: &str, offset: usize) -> Pos {
    let before = &source[..offset];
    let line = before.matches('\n').count() + 1;
    let line_start = before.rfind('\n').map_or(0, |i| i + 1);
    let col = before[line_start..].chars().count() + 1;
    // Generated inputs are far below u32::MAX; the fallback only keeps the
    // workspace's unwrap guardrail honest in helper functions.
    Pos {
        line: u32::try_from(line).unwrap_or(u32::MAX),
        col: u32::try_from(col).unwrap_or(u32::MAX),
    }
}

fn check_spans(source: &str, document: &Document) -> Result<(), TestCaseError> {
    for link in &document.links {
        let text = link.span.slice(source).ok_or_else(|| {
            TestCaseError::fail(format!("link span {:?} off a boundary", link.span))
        })?;
        prop_assert!(
            text.starts_with("[[") && text.ends_with("]]"),
            "link {text:?}"
        );
        prop_assert_eq!(link.pos, expected_pos(source, link.span.start));
    }
    for embed in &document.embeds {
        let text = embed.span.slice(source).ok_or_else(|| {
            TestCaseError::fail(format!("embed span {:?} off a boundary", embed.span))
        })?;
        prop_assert!(
            text.starts_with("![[") && text.ends_with("]]"),
            "embed {text:?}"
        );
        prop_assert_eq!(embed.pos, expected_pos(source, embed.span.start));
    }
    for heading in &document.headings {
        let text = heading.span.slice(source).ok_or_else(|| {
            TestCaseError::fail(format!("heading span {:?} off a boundary", heading.span))
        })?;
        if text.starts_with('#') {
            // ATX: one line, `#` first.
            prop_assert!(!text.contains('\n'), "heading spans one line: {text:?}");
        } else {
            // Setext (fixtures/heading/setext, the Q19 draft): the span
            // ends on the underline, a line of `=` or `-` — inside a
            // blockquote, behind its `>` markers.
            let underline = text
                .lines()
                .last()
                .unwrap_or_default()
                .trim()
                .trim_start_matches(['>', ' ', '\t']);
            prop_assert!(
                !underline.is_empty()
                    && (underline.chars().all(|c| c == '=')
                        || underline.chars().all(|c| c == '-')),
                "setext heading ends on its underline: {text:?}"
            );
        }
        prop_assert!(
            text.contains(&heading.text),
            "heading text {:?} in {text:?}",
            heading.text
        );
        prop_assert_eq!(heading.pos, expected_pos(source, heading.span.start));
    }
    for block in &document.blocks {
        let text = block.span.slice(source).ok_or_else(|| {
            TestCaseError::fail(format!("block span {:?} off a boundary", block.span))
        })?;
        prop_assert_eq!(text, format!("^{}", block.id));
        prop_assert_eq!(block.pos, expected_pos(source, block.span.start));
    }
    for callout in &document.callouts {
        let text = callout.span.slice(source).ok_or_else(|| {
            TestCaseError::fail(format!("callout span {:?} off a boundary", callout.span))
        })?;
        prop_assert!(text.starts_with('>'), "callout {text:?}");
        prop_assert!(
            text.contains(&format!("[!{}]", callout.kind)),
            "callout kind in {text:?}"
        );
        prop_assert_eq!(callout.pos, expected_pos(source, callout.span.start));
    }
    if let Some(frontmatter) = &document.frontmatter {
        let text = frontmatter.span.slice(source).ok_or_else(|| {
            TestCaseError::fail(format!(
                "frontmatter span {:?} off a boundary",
                frontmatter.span
            ))
        })?;
        prop_assert!(
            text.starts_with("---") && text.ends_with("---"),
            "frontmatter {text:?}"
        );
        prop_assert_eq!(frontmatter.span.start, 0, "frontmatter starts the file");
    }
    Ok(())
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    #[test]
    fn property_1_parse_returns(source in note()) {
        let _ = parse(&source);
    }

    #[test]
    fn property_2_same_input_same_report(source in note()) {
        prop_assert_eq!(parse(&source), parse(&source));
    }

    #[test]
    fn property_3_spans_slice_back_to_the_source(source in note()) {
        check_spans(&source, &parse(&source))?;
    }

    #[test]
    fn property_4_the_read_path_does_not_write(source in note()) {
        let before = source.clone();
        let _ = parse(&source);
        prop_assert_eq!(source, before);
    }
}
