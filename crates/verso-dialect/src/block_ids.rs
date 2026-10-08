// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `^id`: the reading view does not show a block's id, as Obsidian does not
//! (observed on Obsidian 1.14.4 on 2026-10-07: the id goes from a
//! paragraph, a heading and a list item, and a `^id` alone on its line,
//! naming the block before it, goes with its paragraph). The ids are the
//! ones [`crate::parse`] finds (spec §5.7), handed in by the caller, never
//! a scan of the HTML, so a `^word` that names no block — inside code, or
//! not the last word — stays visible.

use std::ops::Range;

use pulldown_cmark::{Event, Tag, TagEnd};

use crate::BlockId;
use crate::events::{self, Context, Offset};

/// `events` with every block id of `blocks` taken out of the text; a line
/// break the cut leaves at the end of a paragraph goes with it, and a
/// paragraph left with nothing but blanks and breaks goes whole.
pub(crate) fn hide<'a>(
    source: &str,
    events: Vec<Offset<'a>>,
    blocks: &[BlockId],
) -> Vec<Offset<'a>> {
    if blocks.is_empty() {
        return events;
    }
    let mut ids: Vec<Range<usize>> = blocks.iter().map(|b| b.span.start..b.span.end).collect();
    ids.sort_by_key(|i| i.start);
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
                if let Some((at, true)) = paragraph.take() {
                    // `Texto  ⏎ ^id`: the break before the cut id would show
                    // as an empty line; it goes, and so does any blank left.
                    while out.len() > at + 1 && out.last().is_some_and(|(e, _)| trailing(e)) {
                        out.pop();
                    }
                    if out.len() == at + 1 {
                        out.truncate(at);
                        continue;
                    }
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

/// An event that shows nothing at the end of a paragraph: blank text, or a
/// line break.
fn trailing(event: &Event<'_>) -> bool {
    match event {
        Event::Text(t) => t.trim().is_empty(),
        Event::SoftBreak | Event::HardBreak => true,
        _ => false,
    }
}
