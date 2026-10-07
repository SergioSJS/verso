// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The dialect pass: one loop over the base parser's events with byte ranges
//! (ADR 0037), recognizing the constructs of spec §5 and recording where each
//! one is.

use std::ops::Range;

use pulldown_cmark::{
    CodeBlockKind, Event, LinkType, MetadataBlockKind, Options, Parser, Tag, TagEnd,
};

use crate::frontmatter::{Frontmatter, parse_yaml};
use crate::position::{LineIndex, Span};
use crate::wikilink;
use crate::{BlockId, Callout, Document, Embed, Fold, Heading, Link, SchemaBlock};

/// Parse the text of one note into its [`Document`] report.
///
/// Never panics on any input (Q18, property 1; the fuzz target of ADR 0029
/// is what proves it — `pulldown-cmark` 0.13.4 did, on one shape of list
/// item, which is why the base is built from a later upstream revision;
/// ADR 0037 and `tests/regressions.rs`). Returns the same report for the
/// same input (property 2),
/// and every span it reports slices back to the construct's own text
/// (property 3). It reads `source` and nothing else (property 4).
///
/// `source` is text, already decoded: bytes, BOM and encoding are the
/// caller's concern (spec Q25). Code spans and code blocks are never scanned,
/// so a `[[link]]` inside them is not a link (spec §5.9): that comes from the
/// base parser, which reports them as code, not as text.
#[must_use]
pub fn parse(source: &str) -> Document {
    let lines = LineIndex::new(source);
    let options = Options::ENABLE_WIKILINKS | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS;
    let mut document = Document::default();
    let mut items: Vec<OpenItem> = Vec::new();
    // How many lists items and quotes enclose the event: a `verso-schema`
    // block counts only at the top level (ADR 0052 point 3).
    let mut depth = 0usize;
    // A `verso-schema` block being read: its start, whether it is nested,
    // and its text as the base hands it over (indentation taken off).
    let mut schema: Option<(usize, bool, String)> = None;

    for (event, range) in Parser::new_ext(source, options).into_offset_iter() {
        // The own text of a list item closes when its first block child
        // starts, or when the item ends; either way before anything inside
        // that child is reported, so blocks stay in document order.
        if let Some(own_text) = track_item(&mut items, &event, &range) {
            push_block(&mut document, block_id(source, &lines, own_text));
        }
        match &event {
            Event::Start(Tag::Item | Tag::BlockQuote(_) | Tag::FootnoteDefinition(_)) => depth += 1,
            Event::End(TagEnd::Item | TagEnd::BlockQuote(_) | TagEnd::FootnoteDefinition) => {
                depth = depth.saturating_sub(1);
            }
            Event::Start(Tag::CodeBlock(CodeBlockKind::Fenced(info)))
                if info.split_whitespace().next() == Some("verso-schema") =>
            {
                schema = Some((range.start, depth > 0, String::new()));
            }
            Event::Text(text) => {
                if let Some((_, _, body)) = schema.as_mut() {
                    body.push_str(text);
                }
            }
            Event::End(TagEnd::CodeBlock) => {
                if let Some((start, nested, body)) = schema.take() {
                    document.schemas.push(SchemaBlock {
                        span: Span {
                            start,
                            end: range.end,
                        },
                        pos: lines.pos(source, start),
                        nested,
                        definition: (!nested).then(|| crate::schema::read(&body)),
                    });
                }
            }
            _ => {}
        }
        match event {
            Event::Start(Tag::Link {
                link_type: LinkType::WikiLink { .. },
                ..
            }) => {
                if let Some(link) = link(source, &lines, range) {
                    document.links.push(link);
                }
            }
            Event::Start(Tag::Image {
                link_type: LinkType::WikiLink { .. },
                ..
            }) => {
                if let Some(embed) = embed(source, &lines, range) {
                    document.embeds.push(embed);
                }
            }
            Event::Start(Tag::Heading { level, .. }) => {
                if let Some(heading) = heading(source, &lines, range, level as u8) {
                    document.headings.push(heading);
                }
            }
            // A `^id` ends a paragraph, or the own text of a list item (spec
            // §5.7; Q3 closed for these two on 2026-09-21). A tight list
            // item has no paragraph event, so its own inline text — up to
            // its first block child — is checked when the item ends.
            Event::End(TagEnd::Paragraph) => {
                push_block(&mut document, block_id(source, &lines, range));
            }
            Event::Start(Tag::BlockQuote(_)) => {
                if let Some(callout) = callout(source, &lines, range) {
                    document.callouts.push(callout);
                }
            }
            // The base also reports `---` blocks later in the file and
            // unclosed ones inside a blockquote; the frontmatter is only the
            // block on the first line (spec §5.1), so the range must start
            // the file.
            Event::Start(Tag::MetadataBlock(MetadataBlockKind::YamlStyle))
                if range.start == 0 && document.frontmatter.is_none() =>
            {
                document.frontmatter = frontmatter(source, range);
            }
            _ => {}
        }
    }

    document.property_links =
        crate::properties::property_links(source, &lines, document.frontmatter.as_ref());
    document
}

/// Report a block id. Each `^id` token is looked at by exactly one closing:
/// a paragraph's end, or the end of a list item's own text — a loose item
/// has no own text (its first block child, the paragraph, closes it empty),
/// so nothing is ever a candidate twice and no deduplication is needed.
fn push_block(document: &mut Document, candidate: Option<BlockId>) {
    if let Some(block) = candidate {
        document.blocks.push(block);
    }
}

/// A list item still open: where it starts and where its own inline text
/// ends, before its first block child. A `^id` is only looked for in that
/// text, so a code block, an HTML block or a nested list that ends the item
/// is never scanned (spec §5.9), and an item whose own line ends with `^id`
/// keeps it even when a nested list follows.
struct OpenItem {
    start: usize,
    inline_end: Option<usize>,
    block_child: bool,
}

impl OpenItem {
    /// The item's own text is complete: a block child starts, or the item
    /// ends. Hand back its range once; afterwards nothing extends it.
    fn close_own_text(&mut self) -> Option<Range<usize>> {
        if self.block_child {
            return None;
        }
        self.block_child = true;
        self.inline_end.map(|end| self.start..end)
    }
}

/// Keep `items` in step with the events, and hand back the range of an
/// item's own inline text at the moment it is complete.
fn track_item(
    items: &mut Vec<OpenItem>,
    event: &Event<'_>,
    range: &Range<usize>,
) -> Option<Range<usize>> {
    match event {
        Event::Start(Tag::Item) => {
            let parent_text = items.last_mut().and_then(OpenItem::close_own_text);
            items.push(OpenItem {
                start: range.start,
                inline_end: None,
                block_child: false,
            });
            parent_text
        }
        Event::End(TagEnd::Item) => items.pop().and_then(|mut item| item.close_own_text()),
        Event::Start(tag) if !is_inline(tag) => items.last_mut().and_then(OpenItem::close_own_text),
        Event::Rule => items.last_mut().and_then(OpenItem::close_own_text),
        _ => {
            if let Some(item) = items.last_mut()
                && !item.block_child
            {
                item.inline_end = Some(range.end);
            }
            None
        }
    }
}

/// The tags that live inside a line of text. Anything else is a block, and
/// a tag added to the base later counts as a block until listed here: that
/// direction only stops an item's own text early, never scans a block. The
/// same is not automatic for a block that the base emits as a standalone
/// event rather than a tag, such as `Rule`: those go into the `Rule` arm of
/// [`track_item`] by hand (a display-math block would be the next one, if
/// math is ever enabled).
fn is_inline(tag: &Tag<'_>) -> bool {
    matches!(
        tag,
        Tag::Emphasis
            | Tag::Strong
            | Tag::Strikethrough
            | Tag::Superscript
            | Tag::Subscript
            | Tag::Highlight
            | Tag::Link { .. }
            | Tag::Image { .. }
    )
}

fn span(range: &Range<usize>) -> Span {
    Span {
        start: range.start,
        end: range.end,
    }
}

/// `[[…]]`: the base reports the range of the whole construct; the parts come
/// from the raw text between the brackets, never from the base's unescaped
/// destination, so that `target` is what the file says (spec §4.2).
fn link(source: &str, lines: &LineIndex, range: Range<usize>) -> Option<Link> {
    let text = source.get(range.clone())?;
    let inner = text.strip_prefix("[[")?.strip_suffix("]]")?;
    let parts = wikilink::split(inner);
    Some(Link {
        target: parts.target,
        heading: parts.heading,
        block: parts.block,
        alias: parts.alias,
        span: span(&range),
        pos: lines.pos(source, range.start),
    })
}

/// `![[…]]`: an image whose link type is wikilink, in the base's terms.
fn embed(source: &str, lines: &LineIndex, range: Range<usize>) -> Option<Embed> {
    let text = source.get(range.clone())?;
    let inner = text.strip_prefix("![[")?.strip_suffix("]]")?;
    let parts = wikilink::split(inner);
    Some(Embed {
        target: parts.target,
        heading: parts.heading,
        block: parts.block,
        alias: parts.alias,
        span: span(&range),
        pos: lines.pos(source, range.start),
    })
}

/// A heading. For ATX the base's range covers the whole line with its line
/// break and any indentation; the span reported starts at the first `#` and
/// stops before the line break. A setext heading (`Título\n===`/`---`) is
/// reported too, as Obsidian's metadataCache reports it — observed on
/// 2026-09-29, `fixtures/heading/setext` (a draft answering the setext part
/// of Q19): the text line's position, the underline's level (1 for `===`,
/// 2 for `---`), even with no blank line before the text.
fn heading(source: &str, lines: &LineIndex, range: Range<usize>, level: u8) -> Option<Heading> {
    let text = source.get(range.clone())?;
    let line = text.lines().next()?;
    let indent = line.len() - line.trim_start_matches([' ', '\t']).len();
    let first = &line[indent..];
    let start = range.start + indent;
    if !first.starts_with('#') {
        // Setext: the range holds the text and, last, the underline. The
        // span runs from the text's first character to the underline's
        // end; the position is the text's, as observed. The text is a
        // slice of the source (line endings included as written), so a
        // span always slices back to it.
        let trimmed = text.trim_end_matches(['\n', '\r']);
        let content = &trimmed[..trimmed.rfind('\n')?];
        return Some(Heading {
            level,
            text: content.trim().to_owned(),
            span: Span {
                start,
                end: range.start + trimmed.len(),
            },
            pos: lines.pos(source, start),
        });
    }
    let end = start + first.len();
    let marks = first.len() - first.trim_start_matches('#').len();
    let content = &first[marks..];
    Some(Heading {
        level,
        text: strip_closing_sequence(content.trim()).to_owned(),
        span: Span { start, end },
        pos: lines.pos(source, start),
    })
}

/// CommonMark's optional closing sequence: trailing `#` marks preceded by a
/// space, or making up the whole content (`# #` is an empty heading).
fn strip_closing_sequence(content: &str) -> &str {
    let without_marks = content.trim_end_matches('#');
    if without_marks.len() == content.len() {
        return content;
    }
    if without_marks.is_empty() {
        return "";
    }
    match without_marks.strip_suffix([' ', '\t']) {
        Some(before) => before.trim_end(),
        None => content,
    }
}

/// A `^id` as the last word of a paragraph or of a list item's own text
/// (spec §5.7; `fixtures/block/definition` and `fixtures/block/list-item`).
/// The id is letters, digits and hyphen, Obsidian's documented charset; the
/// charset is Q22 and the remaining positions of Q3 (its own line after a
/// blank line, which Obsidian attaches to the block before it; the end of
/// a heading) stay open: a `^id` alone on a line after a blank line is a
/// paragraph of its own here and is reported at the `^`, which is what
/// spec §4.3 asks of `pos` whichever block it names. The block's own text
/// is checked, not the base's text events, so a `^id` at the end of a code
/// span, which is followed by a backtick, does not qualify; a code block or
/// a nested list at the end of an item is outside the item's own text
/// ([`OpenItem`]) and is not looked at.
fn block_id(source: &str, lines: &LineIndex, range: Range<usize>) -> Option<BlockId> {
    let text = source.get(range.clone())?;
    let trimmed = text.trim_end();
    let last_word = trimmed.rsplit([' ', '\t', '\n', '\r']).next()?;
    let id = last_word.strip_prefix('^')?;
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return None;
    }
    let start = range.start + trimmed.len() - last_word.len();
    Some(BlockId {
        id: id.to_owned(),
        span: Span {
            start,
            end: start + last_word.len(),
        },
        pos: lines.pos(source, start),
    })
}

/// A callout is a blockquote whose first line, after `>` and spaces, starts
/// with `[!kind]` (spec §5.8). Any kind is accepted as written; the recognized
/// set, folding and nesting are Q5. A nested blockquote is its own event, so a
/// nested callout is reported on its own.
fn callout(source: &str, lines: &LineIndex, range: Range<usize>) -> Option<Callout> {
    let text = source.get(range.clone())?;
    let first_line = text.lines().next()?;
    let indent = first_line.len() - first_line.trim_start_matches([' ', '\t']).len();
    let after_marker = first_line[indent..].strip_prefix('>')?;
    let header = after_marker.trim_start_matches([' ', '\t']);
    let after_open = header.strip_prefix("[!")?;
    let close = after_open.find(']')?;
    let kind = &after_open[..close];
    if kind.is_empty() {
        return None;
    }
    let rest = &after_open[close + 1..];
    let (fold, rest) = match rest.chars().next() {
        Some('-') => (Some(Fold::Collapsed), &rest[1..]),
        Some('+') => (Some(Fold::Expanded), &rest[1..]),
        _ => (None, rest),
    };
    let title = rest.trim();
    let start = range.start + indent;
    // Like a heading, the span stops before the line break that ends the
    // blockquote; the base's range includes it.
    let without_break = text.strip_suffix('\n').unwrap_or(text);
    let without_break = without_break.strip_suffix('\r').unwrap_or(without_break);
    let end = range.start + without_break.len();
    Some(Callout {
        kind: kind.to_owned(),
        title: (!title.is_empty()).then(|| title.to_owned()),
        fold,
        span: Span { start, end },
        pos: lines.pos(source, start),
    })
}

/// The base reports the block from the opening `---` up to and including the
/// closing `---`; a block without the closing line is not a frontmatter. The
/// YAML is the text between the two delimiter lines, taken from the source so
/// that line endings are the file's.
fn frontmatter(source: &str, range: Range<usize>) -> Option<Frontmatter> {
    let text = source.get(range.clone())?;
    let after_open = text.strip_prefix("---")?;
    let (_, body) = after_open.split_once('\n')?;
    let body = body.strip_suffix("---")?;
    Some(Frontmatter {
        span: span(&range),
        values: parse_yaml(body),
    })
}

#[cfg(test)]
mod tests {
    use super::parse;

    fn ids(source: &str) -> Vec<(String, u32, u32)> {
        parse(source)
            .blocks
            .iter()
            .map(|b| (b.id.clone(), b.pos.line, b.pos.col))
            .collect()
    }

    #[test]
    fn block_id_at_the_end_of_a_paragraph_or_a_list_item_once() {
        assert_eq!(ids("Ele jurou. ^a\n"), vec![("a".into(), 1, 12)]);
        // Tight list: no paragraph event, the item end is what reports it.
        assert_eq!(
            ids("- um ^a\n- dois ^b\n"),
            vec![("a".into(), 1, 6), ("b".into(), 2, 8)]
        );
        // Loose list: the paragraph and the item end with the same `^id`;
        // reported once.
        assert_eq!(
            ids("- um ^a\n\n- dois ^b\n"),
            vec![("a".into(), 1, 6), ("b".into(), 3, 8)]
        );
        // Nested list: each item's own text is checked; the outer item's
        // `^id` survives the nested list, and nothing is reported twice.
        assert_eq!(ids("- um\n  - dois ^b\n"), vec![("b".into(), 2, 10)]);
        assert_eq!(ids("- um ^a\n  - dois\n"), vec![("a".into(), 1, 6)]);
        assert_eq!(
            ids("- um ^a\n  - dois ^b\n"),
            vec![("a".into(), 1, 6), ("b".into(), 2, 10)]
        );
        assert_eq!(ids("- a\n  - b\n    - c ^x\n"), vec![("x".into(), 3, 9)]);
        // Two distinct blocks with the same id text: both reported.
        assert_eq!(
            ids("- um ^a\n- dois ^a\n"),
            vec![("a".into(), 1, 6), ("a".into(), 2, 8)]
        );
        // Not a block id: inside a code span, not the last word, or inside
        // a block child that ends the item (code block, HTML block, fence).
        assert_eq!(ids("- um `^a`\n"), vec![]);
        assert_eq!(ids("- ^a um\n"), vec![]);
        assert_eq!(ids("- um\n\n      codigo ^a\n"), vec![]);
        assert_eq!(ids("- um\n  ```\n  texto ^a\n"), vec![]);
        assert_eq!(ids("- um\n  <div>\n  ^a\n"), vec![]);
        // A blockquote inside an item: the quote's paragraph reports it once;
        // with an id on the item too, the item's comes first (document order:
        // the own text closes before anything inside the child is reported).
        assert_eq!(ids("- um\n  > nota ^b\n"), vec![("b".into(), 2, 10)]);
        assert_eq!(
            ids("- um ^a\n  > nota ^b\n"),
            vec![("a".into(), 1, 6), ("b".into(), 2, 10)]
        );
        // Ordered items and CRLF go through the same path.
        assert_eq!(ids("1. um ^a\n"), vec![("a".into(), 1, 7)]);
        assert_eq!(
            ids("- um ^a\r\n  - dois ^b\r\n"),
            vec![("a".into(), 1, 6), ("b".into(), 2, 10)]
        );
    }
}
