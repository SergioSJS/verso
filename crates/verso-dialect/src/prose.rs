// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The prose of a note: the runs of text a person reads as words, where a
//! note's name written plainly is an unlinked mention of it (ADR 0089
//! item 1). One rule, from the same passes as the reader and the tags, so
//! that a mention is never found where the reading view shows no words —
//! in the frontmatter, in code, in a `%%comment%%`, inside a link or an
//! embed, in math or raw HTML — nor inside a `#tag`. Part of the fixture
//! contract since 2026-10-14 (spec §4.9, the maintainer's answer M6): it
//! reports where, and changes nothing about what any construct is.

use pulldown_cmark::{Event, Tag, TagEnd};

use crate::Span;
use crate::events::{self, Context};

/// A run of prose: its bytes in the source, and whether it sits in a
/// table's cell, where a `|` written into it would end the cell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Prose {
    pub span: Span,
    pub table: bool,
}

/// The prose of `source`, in document order. Text the base splits into
/// pieces (`a_b`, `a[b`) is joined again when the pieces touch; a `#tag`
/// is cut out, so the words around it stay prose. A text event whose bytes
/// are not the source's own (an entity, `&amp;`) is left out whole: no
/// offset inside it can be trusted.
#[must_use]
pub fn prose(source: &str) -> Vec<Prose> {
    let events = crate::comments::strip(source, events::events(source));
    let tags = crate::tags::scan(source, &events);
    let mut context = Context::default();
    let mut table = 0usize;
    let mut out: Vec<Prose> = Vec::new();
    for (event, range) in &events {
        context.enter(event);
        match event {
            Event::Start(Tag::Table(_)) => table += 1,
            Event::End(TagEnd::Table) => table = table.saturating_sub(1),
            _ => {}
        }
        let Event::Text(text) = event else {
            continue;
        };
        if !context.prose() || !events::literal(source, text, range) {
            continue;
        }
        let run = Prose {
            span: Span {
                start: range.start,
                end: range.end,
            },
            table: table > 0,
        };
        match out.last_mut() {
            Some(last) if last.span.end == run.span.start && last.table == run.table => {
                last.span.end = run.span.end;
            }
            _ => out.push(run),
        }
    }
    cut(out, &tags)
}

/// `runs` with every tag's bytes taken out.
fn cut(runs: Vec<Prose>, tags: &[crate::BodyTag]) -> Vec<Prose> {
    if tags.is_empty() {
        return runs;
    }
    let mut out = Vec::with_capacity(runs.len());
    for run in runs {
        let mut start = run.span.start;
        for tag in tags
            .iter()
            .filter(|t| t.span.start >= run.span.start && t.span.end <= run.span.end)
        {
            if tag.span.start > start {
                out.push(Prose {
                    span: Span {
                        start,
                        end: tag.span.start,
                    },
                    table: run.table,
                });
            }
            start = tag.span.end;
        }
        if start < run.span.end {
            out.push(Prose {
                span: Span {
                    start,
                    end: run.span.end,
                },
                table: run.table,
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(source: &str) -> Vec<&str> {
        prose(source)
            .iter()
            .filter_map(|p| p.span.slice(source))
            .collect()
    }

    #[test]
    fn prose_leaves_out_what_the_reader_shows_as_no_words() {
        let source = "---\ntitle: Porto\n---\nVi o Porto `Porto` e [[Porto]] e ![[Porto]].\n\n```\nPorto\n```\n%%Porto%% fim [Porto](Porto.md) #Porto $Porto$ <b>x</b>\n";
        let all = texts(source).join("|");
        assert_eq!(all.matches("Porto").count(), 1, "{all}");
        assert!(all.contains("Vi o Porto "), "{all}");
        assert!(all.contains(" fim "), "{all}");
    }

    #[test]
    fn pieces_the_base_split_are_joined_and_tables_marked() {
        let source = "a_b c\n\n| Porto | x |\n|---|---|\n| y | Porto |\n";
        let runs = prose(source);
        assert_eq!(runs[0].span.slice(source), Some("a_b c"));
        assert!(!runs[0].table);
        assert!(runs[1..].iter().all(|r| r.table));
        assert!(
            runs[1..]
                .iter()
                .any(|r| r.span.slice(source) == Some("Porto"))
        );
    }

    #[test]
    fn an_entity_is_left_out_whole() {
        let source = "Porto &amp; Lisboa\n";
        let all = texts(source).join("|");
        assert!(!all.contains('&'), "{all}");
        assert!(all.contains("Porto"), "{all}");
    }
}
