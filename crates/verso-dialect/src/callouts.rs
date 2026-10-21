// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Obsidian's callout in the reading view: a blockquote whose first line
//! is `[!kind]`, `[!kind]+` or `[!kind]-` with an optional title becomes
//! `<div class="callout" data-callout="kind" data-fold="+|-">` with a
//! `<p class="callout-title">`; the rest of the first paragraph, if any,
//! is the body's first paragraph. Found on the base's events, where a
//! blockquote's extent is exact: raw HTML in the note cannot open or close
//! one, and the header is read on the first line of the source only.
//! A callout inside a callout is drawn as one too, [`MAX_NESTING`] deep —
//! nesting is spec Q5, `[OPEN]`: Obsidian's public documentation shows
//! callouts nested inside callouts, and this follows it provisionally; a
//! plain blockquote inside a callout stays a blockquote. The recognized
//! kinds are Q5 too, so any kind is accepted.

use pulldown_cmark::{CowStr, Event, Tag, TagEnd};

use crate::events::{self, Offset};

/// How many callouts deep one is drawn inside another; a deeper one stays
/// a blockquote. Each level is a recursion and a copy of the level's
/// events, so a note that nests without end cannot make drawing it
/// quadratic or deep without end (the fuzzing guardrail, ADR 0029).
pub(crate) const MAX_NESTING: usize = crate::MAX_CALLOUT_DEPTH as usize;

/// `events` with every callout replaced by its `<div>`.
pub(crate) fn callouts<'a>(source: &str, events: Vec<Offset<'a>>) -> Vec<Offset<'a>> {
    if !source.contains("[!") {
        return events;
    }
    within(source, events, 0)
}

/// [`callouts`] at `depth` callouts deep.
fn within<'a>(source: &str, events: Vec<Offset<'a>>, depth: usize) -> Vec<Offset<'a>> {
    let mut out: Vec<Offset<'a>> = Vec::with_capacity(events.len());
    let mut i = 0;
    while let Some(offset) = events.get(i) {
        match callout(source, &events, i, depth, &mut out) {
            Some(end) => i = end + 1,
            None => {
                out.push(offset.clone());
                i += 1;
            }
        }
    }
    out
}

/// The blockquote starting at `i` as a callout, if it is one: its events go
/// on `out`, and the index of its end comes back. Nothing is pushed before
/// the whole quote has been read.
fn callout<'a>(
    source: &str,
    events: &[Offset<'a>],
    i: usize,
    depth: usize,
    out: &mut Vec<Offset<'a>>,
) -> Option<usize> {
    let (Event::Start(Tag::BlockQuote(_)), quote) = events.get(i)? else {
        return None;
    };
    let (Event::Start(Tag::Paragraph), paragraph) = events.get(i + 1)? else {
        return None;
    };
    let (Event::Text(_), first) = events.get(i + 2)? else {
        return None;
    };
    if first.start != paragraph.start {
        return None;
    }
    // The header, on the first line of the paragraph's source.
    let line = source.get(paragraph.start..)?.lines().next()?;
    let header = line.strip_prefix("[!")?;
    let close = header.find(']')?;
    let kind = header.get(..close)?.trim().to_lowercase();
    if kind.is_empty()
        || !kind
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    let fold = header
        .get(close + 1..)?
        .chars()
        .next()
        .filter(|c| matches!(c, '+' | '-'));
    let title_start = paragraph.start + 2 + close + 1 + usize::from(fold.is_some());
    // Where the first line, the paragraph and the quote end.
    let mut line_end = i + 2;
    while !matches!(
        events.get(line_end)?.0,
        Event::SoftBreak | Event::HardBreak | Event::End(TagEnd::Paragraph)
    ) {
        line_end += 1;
    }
    let paragraph_end =
        (line_end..events.len()).find(|&k| matches!(events[k].0, Event::End(TagEnd::Paragraph)))?;
    let mut quotes: usize = 0;
    let mut quote_end = None;
    for (k, (event, _)) in events.iter().enumerate().skip(i) {
        match event {
            Event::Start(Tag::BlockQuote(_)) => quotes += 1,
            Event::End(TagEnd::BlockQuote(_)) => {
                quotes = quotes.checked_sub(1)?;
                if quotes == 0 {
                    quote_end = Some(k);
                    break;
                }
            }
            _ => {}
        }
    }
    let quote_end = quote_end?;
    let body = events.get(line_end + 1..=paragraph_end)?;
    let children = events.get(paragraph_end + 1..quote_end)?;
    // The title: the first line after the header, trimmed.
    let mut title: Vec<Offset<'a>> = Vec::new();
    for (event, range) in events.get(i + 2..line_end)? {
        if range.end <= title_start {
            continue;
        }
        match event {
            Event::Text(text) if range.start < title_start => {
                title.extend(events::piece(
                    text,
                    range,
                    title_start - range.start,
                    text.len(),
                ));
            }
            _ => title.push((event.clone(), range.clone())),
        }
    }
    trim(&mut title);

    let mut open = format!("<div class=\"callout\" data-callout=\"{kind}\"");
    if let Some(fold) = fold {
        open.push_str(&format!(" data-fold=\"{fold}\""));
    }
    open.push_str(">\n<p class=\"callout-title\">");
    out.push((Event::Html(open.into()), quote.clone()));
    if title.is_empty() {
        let mut chars = kind.chars();
        let name: String = chars
            .next()
            .map(|c| c.to_uppercase().chain(chars).collect())
            .unwrap_or_default();
        out.push((Event::Text(CowStr::from(name)), quote.clone()));
    } else {
        out.extend(title);
    }
    out.push((Event::Html("</p>\n".into()), quote.clone()));
    if body.len() > 1 {
        out.push((Event::Start(Tag::Paragraph), paragraph.clone()));
        out.extend(body.iter().cloned());
    }
    if depth + 1 < MAX_NESTING {
        out.extend(within(source, children.to_vec(), depth + 1));
    } else {
        out.extend(children.iter().cloned());
    }
    out.push((Event::Html("</div>\n".into()), quote.clone()));
    Some(quote_end)
}

/// Whitespace at the two ends of the title goes, as `str::trim` took it
/// from the HTML.
fn trim(title: &mut Vec<Offset<'_>>) {
    if let Some((Event::Text(text), range)) = title.first() {
        let lo = text.len() - text.trim_start().len();
        if lo > 0 {
            match events::piece(text, range, lo, text.len()) {
                Some(trimmed) => title[0] = trimmed,
                None => {
                    title.remove(0);
                }
            }
        }
    }
    if let Some((Event::Text(text), range)) = title.last() {
        let hi = text.trim_end().len();
        if hi < text.len() {
            match events::piece(text, range, 0, hi) {
                Some(trimmed) => {
                    if let Some(last) = title.last_mut() {
                        *last = trimmed;
                    }
                }
                None => {
                    title.pop();
                }
            }
        }
    }
}
