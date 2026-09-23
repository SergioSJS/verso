// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `%%comment%%`: text between two `%%` is visible in editing view only
//! (Obsidian's documentation, "Basic formatting syntax", Comments), so the
//! reader drops it before anything else looks at the text — inline, across
//! lines, or a block on lines of its own — and the index lists no tag from
//! inside one. Never inside code and never in the frontmatter: those are
//! not text. Spec Q6 leaves the comment open as a context for links; this
//! pass changes nothing about what a link is.

use pulldown_cmark::{Event, Tag, TagEnd};

use crate::events::{self, Context, Offset};

/// A `%%` waiting for its pair: where the text it starts in went in the
/// output, the part of that text before the marker, and the containers
/// open at the time.
struct Open<'a> {
    at: usize,
    before: Option<Offset<'a>>,
    stack: Vec<TagEnd>,
}

/// `events` with every `%%…%%` taken out.
///
/// A pair may close in a later event, even in a later block, as long as
/// the containers open at the closing `%%` are the same kinds, in the same
/// order, as at the opening one: then what is between the two goes and
/// the two ends join, with every start still matched by an end of its
/// kind. A `%%` that no such pair answers stays visible, and so does what
/// follows it. A paragraph the cut leaves empty goes with it; a line break
/// the cut leaves at an edge of the paragraph, or doubled, goes too.
pub(crate) fn strip<'a>(source: &str, events: Vec<Offset<'a>>) -> Vec<Offset<'a>> {
    if !source.contains("%%") {
        return events;
    }
    let mut out: Vec<Offset<'a>> = Vec::with_capacity(events.len());
    let mut context = Context::default();
    let mut stack: Vec<TagEnd> = Vec::new();
    let mut open: Option<Open<'a>> = None;
    let mut removed = false;
    let mut skip_break = false;
    for (i, (event, range)) in events.iter().enumerate() {
        match event {
            Event::Start(tag) => stack.push(tag.to_end()),
            Event::End(_) => {
                stack.pop();
            }
            _ => {}
        }
        context.enter(event);
        if skip_break && matches!(event, Event::SoftBreak | Event::HardBreak) {
            skip_break = false;
            continue;
        }
        skip_break = false;
        let Event::Text(text) = event else {
            out.push((event.clone(), range.clone()));
            continue;
        };
        if !context.text() || !events::literal(source, text, range) {
            out.push((event.clone(), range.clone()));
            continue;
        }
        // `kept`: the start of what this text still owes the output.
        let mut kept = 0;
        let mut closed_here = false;
        let mut search = usize::from(events::escaped_start(source, &events, i));
        while let Some(k) = text
            .get(search..)
            .and_then(|t| t.find("%%"))
            .map(|k| k + search)
        {
            search = k + 2;
            match open.take() {
                Some(o) if o.stack == stack => {
                    out.truncate(o.at);
                    out.extend(o.before);
                    kept = k + 2;
                    removed = true;
                    closed_here = true;
                }
                Some(o) => open = Some(o),
                None => {
                    // What follows stays, until a closing `%%` proves it a
                    // comment.
                    open = Some(Open {
                        at: out.len(),
                        before: events::piece(text, range, kept, k),
                        stack: stack.clone(),
                    });
                    out.extend(events::piece(text, range, kept, text.len()));
                    kept = text.len();
                    closed_here = false;
                }
            }
        }
        out.extend(events::piece(text, range, kept, text.len()));
        if closed_here && kept >= text.len() {
            // The comment ended this text. A break right after it would
            // start the line, or double the one before; a paragraph end
            // right after it would leave the break before dangling.
            match out.last() {
                Some((Event::SoftBreak | Event::HardBreak, _)) => {
                    if matches!(events.get(i + 1), Some((Event::End(_), _))) {
                        out.pop();
                    } else {
                        skip_break = true;
                    }
                }
                Some((Event::Start(_), _)) => skip_break = true,
                _ => {}
            }
        }
    }
    if !removed {
        return out;
    }
    let mut cleaned = Vec::with_capacity(out.len());
    let mut rest = out.into_iter().peekable();
    while let Some(event) = rest.next() {
        if matches!(event.0, Event::Start(Tag::Paragraph))
            && matches!(rest.peek(), Some((Event::End(TagEnd::Paragraph), _)))
        {
            rest.next();
            continue;
        }
        cleaned.push(event);
    }
    cleaned
}
