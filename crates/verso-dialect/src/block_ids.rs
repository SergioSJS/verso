// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `^id`: the reading view does not show a block's id, as Obsidian does not
//! (observed on Obsidian 1.14.4 on 2026-10-07: the id goes from a
//! paragraph, a heading and a list item, and a `^id` alone on its line,
//! naming the block before it, goes with its paragraph). The ids are the
//! ones [`crate::parse`] finds (spec §5.7), never a scan of the HTML, so
//! a `^word` that names no block — inside code, or not the last word —
//! stays visible.

use std::ops::Range;

use pulldown_cmark::{Event, Tag, TagEnd};

use crate::events::{self, Context, Offset};

/// `events` with every block id taken out of the text, and a paragraph the
/// cut leaves with nothing but blanks and line breaks taken out whole.
pub(crate) fn hide<'a>(source: &str, events: Vec<Offset<'a>>) -> Vec<Offset<'a>> {
    if !source.contains('^') {
        return events;
    }
    let mut ids: Vec<Range<usize>> = crate::parse(source)
        .blocks
        .iter()
        .map(|b| b.span.start..b.span.end)
        .collect();
    ids.sort_by_key(|i| i.start);
    if ids.is_empty() {
        return events;
    }
    let mut out: Vec<Offset<'a>> = Vec::with_capacity(events.len());
    let mut context = Context::default();
    // Where the open paragraph starts in the output, and whether an id was
    // cut from it.
    let mut paragraph: Option<(usize, bool)> = None;
    for (event, range) in events {
        context.enter(&event);
        match &event {
            Event::Start(Tag::Paragraph) => paragraph = Some((out.len(), false)),
            Event::End(TagEnd::Paragraph) => {
                if let Some((at, true)) = paragraph.take()
                    && out.get(at + 1..).is_some_and(blank)
                {
                    out.truncate(at);
                    continue;
                }
            }
            Event::Text(text)
                if context.text()
                    && events::literal(source, text, &range)
                    && ids
                        .iter()
                        .any(|i| i.start < range.end && range.start < i.end) =>
            {
                let mut kept = range.start;
                for id in ids
                    .iter()
                    .filter(|i| i.start < range.end && range.start < i.end)
                {
                    out.extend(events::piece(
                        text,
                        &range,
                        kept.saturating_sub(range.start),
                        id.start.max(range.start) - range.start,
                    ));
                    kept = kept.max(id.end.min(range.end));
                }
                out.extend(events::piece(
                    text,
                    &range,
                    kept - range.start,
                    range.end - range.start,
                ));
                if let Some((_, cut)) = paragraph.as_mut() {
                    *cut = true;
                }
                continue;
            }
            _ => {}
        }
        out.push((event, range));
    }
    out
}

/// Whether what a paragraph holds shows nothing: blank text and breaks.
fn blank(events: &[Offset<'_>]) -> bool {
    events.iter().all(|(event, _)| match event {
        Event::Text(t) => t.trim().is_empty(),
        Event::SoftBreak | Event::HardBreak => true,
        _ => false,
    })
}
