// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Obsidian's inline footnote, `^[text]`, which the base does not know:
//! each becomes a reference to `inline-N` with its definition at the end,
//! so both forms render the same way and number in one sequence. Found on
//! the base's events, so a `^[` in a code span, a code block, math or the
//! frontmatter is not one, and the text of the note keeps its inline
//! formatting and its byte ranges. Spec Q15 leaves footnotes open; this is
//! the reader's provisional choice, as the referenced form was.

use std::ops::Range;

use pulldown_cmark::{CowStr, Event, Tag, TagEnd};

use crate::events::{self, Context, Offset};

/// A bracket still open on the current line of text: a plain `[`, or the
/// `^[` of a candidate note, with the event and byte where it starts.
struct Opener {
    candidate: bool,
    event: usize,
    start: usize,
}

/// A `^[…]` whose `]` was found: the events and bytes of its two ends.
struct Candidate {
    open: usize,
    start: usize,
    close: usize,
    end: usize,
}

/// A note taken: the reference replaces the events from `open` to `close`,
/// with the text around the note kept, and the definition goes to the end.
struct Note<'a> {
    candidate: Candidate,
    before: Option<Offset<'a>>,
    after: Option<Offset<'a>>,
    inner: Vec<Offset<'a>>,
}

/// `events` with every `^[text]` replaced by a footnote reference, and the
/// definitions appended.
///
/// Brackets pair as they nest, on one line of text at a time: a `]` closes
/// the nearest open `[`, a block boundary discards what is still open.
/// Of the candidates that close, the outermost wins — the brackets inside
/// it are its text, as the source rewrite this replaces had it — and one
/// whose text is empty, or whose events do not balance (`*a ^[b* c]`), is
/// left as written.
pub(crate) fn inline<'a>(source: &str, events: Vec<Offset<'a>>) -> Vec<Offset<'a>> {
    if !source.contains("^[") {
        return events;
    }
    let mut candidates = candidates(source, &events);
    candidates.sort_by_key(|c| c.start);
    let mut notes: Vec<Note<'a>> = Vec::new();
    let mut taken_end = 0;
    let mut taken_close = None;
    for candidate in candidates {
        if candidate.start < taken_end || taken_close.is_some_and(|c| candidate.open <= c) {
            continue;
        }
        if let Some(note) = note(source, &events, candidate) {
            taken_end = note.candidate.end + 1;
            taken_close = Some(note.candidate.close);
            notes.push(note);
        }
    }
    if notes.is_empty() {
        return events;
    }
    let mut out: Vec<Offset<'a>> = Vec::with_capacity(events.len() + notes.len() * 5);
    let mut definitions = Vec::with_capacity(notes.len());
    let mut cursor = 0;
    for (n, note) in notes.into_iter().enumerate() {
        let name = CowStr::from(format!("inline-{}", n + 1));
        let span = note.candidate.start..note.candidate.end + 1;
        out.extend(
            events
                .get(cursor..note.candidate.open)
                .unwrap_or_default()
                .iter()
                .cloned(),
        );
        out.extend(note.before);
        out.push((Event::FootnoteReference(name.clone()), span.clone()));
        out.extend(note.after);
        cursor = note.candidate.close + 1;
        definitions.push((name, span, note.inner));
    }
    out.extend(events.get(cursor..).unwrap_or_default().iter().cloned());
    for (name, span, inner) in definitions {
        out.push((Event::Start(Tag::FootnoteDefinition(name)), span.clone()));
        out.push((Event::Start(Tag::Paragraph), span.clone()));
        out.extend(inner);
        out.push((Event::End(TagEnd::Paragraph), span.clone()));
        out.push((Event::End(TagEnd::FootnoteDefinition), span));
    }
    out
}

/// Every `^[…]` that closes, in the order the `]` come.
fn candidates(source: &str, events: &[Offset<'_>]) -> Vec<Candidate> {
    let mut context = Context::default();
    let mut stack: Vec<Opener> = Vec::new();
    let mut found = Vec::new();
    // The `[` of a candidate is the next event's first character.
    let mut joined = false;
    for (i, (event, range)) in events.iter().enumerate() {
        context.enter(event);
        match event {
            Event::Start(tag) if !events::is_inline(tag.to_end()) => stack.clear(),
            Event::End(end) if !events::is_inline(*end) => stack.clear(),
            _ => {}
        }
        let Event::Text(text) = event else {
            joined = false;
            continue;
        };
        if !context.prose() || !events::literal(source, text, range) {
            joined = false;
            continue;
        }
        let escaped = events::escaped_start(source, events, i);
        let mut chars = text.char_indices();
        if joined {
            chars.next();
        }
        joined = false;
        while let Some((k, c)) = chars.next() {
            if k == 0 && escaped {
                continue;
            }
            match c {
                '^' => {
                    let at = range.start + k;
                    if text.get(k + 1..).is_some_and(|t| t.starts_with('[')) {
                        chars.next();
                        stack.push(Opener {
                            candidate: true,
                            event: i,
                            start: at,
                        });
                    } else if k + 1 == text.len() && bracket_starts(events, i + 1, range.end) {
                        joined = true;
                        stack.push(Opener {
                            candidate: true,
                            event: i,
                            start: at,
                        });
                    }
                }
                '[' => stack.push(Opener {
                    candidate: false,
                    event: i,
                    start: range.start + k,
                }),
                ']' => {
                    if let Some(opener) = stack.pop()
                        && opener.candidate
                    {
                        found.push(Candidate {
                            open: opener.event,
                            start: opener.start,
                            close: i,
                            end: range.start + k,
                        });
                    }
                }
                _ => {}
            }
        }
    }
    found
}

/// Whether the event at `i` is text starting with `[` at byte `at`: the
/// base splits text at a bracket, so `^[` is often two events.
fn bracket_starts(events: &[Offset<'_>], i: usize, at: usize) -> bool {
    matches!(
        events.get(i),
        Some((Event::Text(text), range)) if range.start == at && text.starts_with('[')
    )
}

/// The note of a candidate: the events between its brackets, cut at both
/// ends and trimmed, if they balance and say something.
fn note<'a>(source: &str, events: &[Offset<'a>], candidate: Candidate) -> Option<Note<'a>> {
    let inner: Range<usize> = candidate.start + 2..candidate.end;
    let mut before = None;
    let mut after = None;
    let mut text_events: Vec<Offset<'a>> = Vec::new();
    let mut depth: usize = 0;
    for (j, (event, range)) in events
        .iter()
        .enumerate()
        .take(candidate.close + 1)
        .skip(candidate.open)
    {
        match event {
            Event::Text(text) => {
                if !events::literal(source, text, range) {
                    if inner.start <= range.start && range.end <= inner.end {
                        text_events.push((event.clone(), range.clone()));
                    }
                    continue;
                }
                if j == candidate.open {
                    before = events::piece(text, range, 0, candidate.start - range.start);
                }
                if j == candidate.close {
                    after = events::piece(text, range, candidate.end + 1 - range.start, text.len());
                }
                let lo = inner.start.max(range.start) - range.start;
                let hi = inner.end.min(range.end).saturating_sub(range.start);
                text_events.extend(events::piece(text, range, lo, hi));
            }
            Event::Start(_) => {
                depth += 1;
                text_events.push((event.clone(), range.clone()));
            }
            Event::End(_) => {
                depth = depth.checked_sub(1)?;
                text_events.push((event.clone(), range.clone()));
            }
            _ => text_events.push((event.clone(), range.clone())),
        }
    }
    if depth != 0 {
        return None;
    }
    trim(&mut text_events);
    if !text_events.iter().any(|(event, _)| {
        !matches!(
            event,
            Event::SoftBreak | Event::HardBreak | Event::Start(_) | Event::End(_)
        )
    }) {
        return None;
    }
    Some(Note {
        candidate,
        before,
        after,
        inner: text_events,
    })
}

/// Whitespace at the two ends of the note goes, as `str::trim` took it
/// from the rewritten source.
fn trim(inner: &mut Vec<Offset<'_>>) {
    if let Some((Event::Text(text), range)) = inner.first() {
        let lo = text.len() - text.trim_start().len();
        if lo > 0 {
            match events::piece(text, range, lo, text.len()) {
                Some(trimmed) => inner[0] = trimmed,
                None => {
                    inner.remove(0);
                }
            }
        }
    }
    if let Some((Event::Text(text), range)) = inner.last() {
        let hi = text.trim_end().len();
        if hi < text.len() {
            match events::piece(text, range, 0, hi) {
                Some(trimmed) => {
                    if let Some(last) = inner.last_mut() {
                        *last = trimmed;
                    }
                }
                None => {
                    inner.pop();
                }
            }
        }
    }
}
