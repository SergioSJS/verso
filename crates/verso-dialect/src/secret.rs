// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The game master's secret (spec Q9, decided 2026-10-14; ADR 0087): a
//! callout of kind `secret` stays in the note, a callout like any other in
//! the file, in Obsidian and in a folder of the computer. What this module
//! adds is the **projection** a UniVerso serves an account that may only
//! read the note: the note's text with the lines of every secret callout
//! taken out, and nothing else touched — no line ending, spacing or
//! frontmatter changed (ADR 0087 item 3).
//!
//! A secret callout is found at any depth: at the top level, inside
//! another callout or a list item, in a footnote — wherever a quote is,
//! deeper than the reading view draws callouts too
//! ([`crate::callouts`]'s bound is for drawing, not for hiding) — and what
//! it holds goes with it, a callout inside it included. Its extent is the
//! base parser's quote, its lazy lines with it, widened to whole lines.
//!
//! It **fails closed**: a quote is taken as secret when either of the two
//! parsers of this crate would read it so — the index's (`parse`) and the
//! reading view's (`events`), whose options differ — and when its header
//! is on its first line (the index's rule) or opens its first paragraph
//! (the reading view's). The removal is repeated on its own result until
//! no secret callout is left, so the projection of a projection is itself;
//! if that does not settle within [`ROUNDS`], everything from the first
//! block still found to the end of the note is hidden.
//!
//! Pure: no IO (ADR 0028). One function for every exit a reader has
//! (`verso-core`, `verso-index`, `verso-server`).

use std::borrow::Cow;
use std::ops::Range;

use pulldown_cmark::{Event, Options, Parser, Tag};

use crate::position::LineIndex;

/// How many times the removal is repeated on its own result before the
/// rest of the note is hidden: a removal that makes a new secret callout
/// out of the lines around it is rare, and two of them in a row rarer.
const ROUNDS: usize = 8;

/// Whether a callout's kind is the secret one: `secret`, compared as the
/// reading view compares kinds (spaces at its ends dropped, lower-cased;
/// spec Q5). No other keyword (ADR 0087 item 1).
#[must_use]
pub fn is_secret_kind(kind: &str) -> bool {
    kind.trim().to_lowercase() == "secret"
}

/// The secret blocks of a note: the byte ranges of their whole lines, line
/// endings included, sorted and apart.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Secrets {
    ranges: Vec<Range<usize>>,
    /// The first and last line (1-based) of each range.
    lines: Vec<(u32, u32)>,
}

/// The note's text as an account that may only read it receives it: every
/// secret callout's lines removed (ADR 0087 item 3). Borrowed, untouched,
/// when the note has none.
#[must_use]
pub fn project(source: &str) -> Cow<'_, str> {
    Secrets::of(source).project(source)
}

impl Secrets {
    /// The secret blocks of `source`.
    #[must_use]
    pub fn of(source: &str) -> Self {
        if !may_hold(source) {
            return Self::default();
        }
        let mut ranges = found(source);
        let mut rounds = 0;
        loop {
            if ranges.is_empty() {
                break;
            }
            let rest = remove(source, &ranges);
            if !may_hold(&rest) {
                break;
            }
            let more = found(&rest);
            if more.is_empty() {
                break;
            }
            rounds += 1;
            let back: Vec<Range<usize>> = more.iter().map(|r| unmap(&ranges, r)).collect();
            if rounds >= ROUNDS {
                // Fails closed: from the first block still found to the end.
                let from = back.iter().map(|r| r.start).min().unwrap_or(0);
                ranges.push(from..source.len());
                ranges = merged(ranges);
                break;
            }
            ranges.extend(back);
            ranges = merged(ranges);
        }
        let index = LineIndex::new(source);
        let lines = ranges
            .iter()
            .map(|r| {
                let first = index.pos(source, r.start).line;
                let last = index.pos(source, r.end.saturating_sub(1).max(r.start)).line;
                (first, last)
            })
            .collect();
        Self { ranges, lines }
    }

    /// No secret block.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.ranges.is_empty()
    }

    /// The byte ranges of the secret blocks' whole lines.
    #[must_use]
    pub fn ranges(&self) -> &[Range<usize>] {
        &self.ranges
    }

    /// The first and the last line (1-based) of each secret block.
    #[must_use]
    pub fn lines(&self) -> Vec<(u32, u32)> {
        self.lines.clone()
    }

    /// Whether the byte at `offset` is inside a secret block.
    #[must_use]
    pub fn hides(&self, offset: usize) -> bool {
        self.ranges
            .iter()
            .any(|r| r.start <= offset && offset < r.end)
    }

    /// Whether any byte of `span` is inside a secret block.
    #[must_use]
    pub fn touches(&self, span: Range<usize>) -> bool {
        self.ranges
            .iter()
            .any(|r| r.start < span.end.max(span.start + 1) && span.start < r.end)
    }

    /// Line `line` of the note as the projection numbers it; `None` for a
    /// line that is hidden.
    #[must_use]
    pub fn line(&self, line: u32) -> Option<u32> {
        project_line(&self.lines, line)
    }

    /// Byte `offset` of the note in the projection; `None` when hidden.
    #[must_use]
    pub fn offset(&self, offset: usize) -> Option<usize> {
        let mut before = 0usize;
        for r in &self.ranges {
            if offset < r.start {
                break;
            }
            if offset < r.end {
                return None;
            }
            before += r.end - r.start;
        }
        Some(offset - before)
    }

    /// The projection of `source`, which these are the secrets of.
    #[must_use]
    pub fn project<'a>(&self, source: &'a str) -> Cow<'a, str> {
        if self.ranges.is_empty() {
            Cow::Borrowed(source)
        } else {
            Cow::Owned(remove(source, &self.ranges))
        }
    }

    /// The text of the secret blocks, one after the other: what the index
    /// searches apart for those who may write the note (ADR 0087 item 6).
    #[must_use]
    pub fn secret_text(&self, source: &str) -> String {
        self.ranges
            .iter()
            .filter_map(|r| source.get(r.clone()))
            .collect()
    }
}

/// Line `line` of a note as its projection numbers it, from the secret
/// blocks' lines `hidden` (sorted, apart, as [`Secrets::lines`] gives
/// them); `None` for a line that is hidden.
#[must_use]
pub fn project_line(hidden: &[(u32, u32)], line: u32) -> Option<u32> {
    let mut before = 0u32;
    for &(first, last) in hidden {
        if line < first {
            break;
        }
        if line <= last {
            return None;
        }
        before = before.saturating_add(last - first + 1);
    }
    Some(line - before)
}

/// Whether `source` could hold a secret callout at all: the cheap test
/// before a parse, for the notes — nearly all — that hold none.
fn may_hold(source: &str) -> bool {
    source.contains("[!")
        && source
            .as_bytes()
            .windows(6)
            .any(|w| w.eq_ignore_ascii_case(b"secret"))
}

/// The secret quotes of `source` by both parsers, widened to whole lines,
/// sorted and merged.
fn found(source: &str) -> Vec<Range<usize>> {
    let index = Options::ENABLE_WIKILINKS | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS;
    let reader = index
        | Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_MATH;
    let mut ranges = Vec::new();
    for options in [index, reader] {
        let events: Vec<(Event<'_>, Range<usize>)> = Parser::new_ext(source, options)
            .into_offset_iter()
            .collect();
        for (i, (event, range)) in events.iter().enumerate() {
            if !matches!(event, Event::Start(Tag::BlockQuote(_))) {
                continue;
            }
            let first_line = header_on_first_line(source, range);
            let first_paragraph = match events.get(i + 1) {
                Some((Event::Start(Tag::Paragraph), p)) => header_at(source, p.start),
                _ => false,
            };
            if first_line || first_paragraph {
                ranges.push(whole_lines(source, range.clone()));
            }
        }
    }
    merged(ranges)
}

/// The index's rule: the quote's first line, after its `>` and spaces,
/// opens with `[!secret]`.
fn header_on_first_line(source: &str, range: &Range<usize>) -> bool {
    let Some(text) = source.get(range.clone()) else {
        return false;
    };
    let line = text.lines().next().unwrap_or("");
    let line = line.trim_start_matches([' ', '\t']);
    let Some(after) = line.strip_prefix('>') else {
        return false;
    };
    kind_secret(after.trim_start_matches([' ', '\t']))
}

/// The reading view's rule: the quote's first paragraph opens with
/// `[!secret]` at `at`.
fn header_at(source: &str, at: usize) -> bool {
    source.get(at..).is_some_and(kind_secret)
}

/// `text` opens with a callout header whose kind is `secret`.
fn kind_secret(text: &str) -> bool {
    let Some(after) = text.strip_prefix("[!") else {
        return false;
    };
    let line = after.lines().next().unwrap_or("");
    line.find(']')
        .and_then(|close| line.get(..close))
        .is_some_and(is_secret_kind)
}

/// `range` widened to the start of its first line and past the line break
/// of its last.
fn whole_lines(source: &str, range: Range<usize>) -> Range<usize> {
    let start = source
        .get(..range.start)
        .and_then(|before| before.rfind('\n'))
        .map_or(0, |i| i + 1);
    let last = range.end.max(range.start + 1) - 1;
    let end = source
        .get(last..)
        .and_then(|after| after.find('\n'))
        .map_or(source.len(), |i| last + i + 1);
    start..end.min(source.len()).max(start)
}

/// Sorted, overlapping or touching ranges joined.
fn merged(mut ranges: Vec<Range<usize>>) -> Vec<Range<usize>> {
    ranges.sort_by_key(|r| (r.start, r.end));
    let mut out: Vec<Range<usize>> = Vec::with_capacity(ranges.len());
    for r in ranges {
        match out.last_mut() {
            Some(last) if r.start <= last.end => last.end = last.end.max(r.end),
            _ => out.push(r),
        }
    }
    out
}

/// `source` without `ranges` (sorted, apart).
fn remove(source: &str, ranges: &[Range<usize>]) -> String {
    let mut out = String::with_capacity(source.len());
    let mut at = 0;
    for r in ranges {
        if let Some(kept) = source.get(at..r.start) {
            out.push_str(kept);
        }
        at = r.end;
    }
    if let Some(kept) = source.get(at..) {
        out.push_str(kept);
    }
    out
}

/// A range of the text left once `removed` was taken out, as a range of the
/// text before: its ends moved past what was removed before them.
fn unmap(removed: &[Range<usize>], range: &Range<usize>) -> Range<usize> {
    let back = |offset: usize, end: bool| {
        let mut o = offset;
        for r in removed {
            // An end that falls on a removed range's place stays before it;
            // a start moves past it.
            if r.start < o || (!end && r.start == o) {
                o += r.end - r.start;
            } else {
                break;
            }
        }
        o
    };
    back(range.start, false)..back(range.end, true).max(back(range.start, false))
}
