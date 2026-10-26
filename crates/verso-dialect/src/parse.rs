// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The dialect pass: one loop over the base parser's events with byte ranges
//! (ADR 0037), recognizing the constructs of spec §5 and recording where each
//! one is.

use std::ops::Range;

use pulldown_cmark::{CodeBlockKind, Event, LinkType, MetadataBlockKind, Options, Tag, TagEnd};

use crate::frontmatter::{Frontmatter, parse_yaml};
use crate::position::{LineIndex, Span};
use crate::wikilink;
use crate::{
    BlockId, Callout, Document, Embed, Fold, Heading, Link, MAX_CALLOUT_DEPTH, SchemaBlock,
};

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
/// `source` is text, already decoded: bytes and encoding are the caller's
/// concern (spec Q25); a byte order mark at the start is skipped over, and
/// every span still slices `source` (spec Q24). Code spans and code blocks are never scanned,
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
    // The containers open around the event — list items and quotes —
    // outermost first, each with its whole range: what a
    // `^id` inside one names (spec Q3, observed in Obsidian 1.14.4 on
    // 2026-10-07 through its CLI): a quote at the top level, whole, with
    // everything in it; otherwise the innermost list item, whole, its
    // nested items with it (Q21).
    let mut containers: Vec<(Container, Range<usize>)> = Vec::new();
    // The last block closed at the top level: what a `^id` alone on a
    // line after it names (Q3). With nothing before it, the `^id` names no
    // block at all, as observed.
    let mut last_top: Option<Range<usize>> = None;
    // The block the previous `^id` alone named, while nothing else came
    // between: a second one naming the same block replaces it — only the
    // last counts, as in Obsidian (decided 2026-10-09).
    let mut alone_named: Option<Range<usize>> = None;
    // For each open blockquote, whether it is a recognized callout; the
    // number of those is the depth of the next one (spec Q5). A stack and a
    // counter, not recursion: a note that nests quotes without end costs
    // memory in proportion to its size and nothing more.
    let mut quotes: Vec<bool> = Vec::new();
    let mut open_callouts: u32 = 0;

    let bom = crate::events::bom_len(source);
    for (event, range) in crate::events::offsets(source, options) {
        // The own text of a list item closes when its first block child
        // starts, or when the item ends; either way before anything inside
        // that child is reported, so blocks stay in document order.
        if let Some(own_text) = track_item(&mut items, &event, &range) {
            let named = named_container(&containers).unwrap_or(own_text.clone());
            push_block(&mut document, block_id(source, &lines, own_text, named));
        }
        match &event {
            // A footnote definition would be a container too, but footnotes
            // are not enabled here (the reader enables them in `events.rs`),
            // so that arm is dormant until they are.
            Event::Start(tag @ (Tag::Item | Tag::BlockQuote(_) | Tag::FootnoteDefinition(_))) => {
                depth += 1;
                if matches!(tag, Tag::BlockQuote(_)) {
                    // Past the limit a quote stays a quote (spec Q5).
                    let found = if open_callouts < MAX_CALLOUT_DEPTH {
                        callout(source, &lines, range.clone(), open_callouts + 1)
                    } else {
                        None
                    };
                    quotes.push(found.is_some());
                    if let Some(callout) = found {
                        open_callouts += 1;
                        document.callouts.push(callout);
                    }
                }
                let kind = match tag {
                    Tag::Item => Container::Item,
                    _ => Container::Quote,
                };
                containers.push((kind, range.clone()));
            }
            Event::End(TagEnd::Item | TagEnd::BlockQuote(_) | TagEnd::FootnoteDefinition) => {
                if matches!(event, Event::End(TagEnd::BlockQuote(_))) && quotes.pop() == Some(true)
                {
                    open_callouts = open_callouts.saturating_sub(1);
                }
                depth = depth.saturating_sub(1);
                containers.pop();
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
                // Inside a container, the container. At the top level: the
                // paragraph itself, or, for a `^id` alone on its line, the
                // block before it; nothing before it, no block (Q3). A
                // `^word` that is no id (a dot in it, say) is a paragraph
                // like any other, which the next `^id` alone names.
                let alone = source.get(range.clone()).is_some_and(|t| {
                    t.trim().starts_with('^') && !t.trim().contains(char::is_whitespace)
                });
                let named = match (named_container(&containers), alone, &last_top) {
                    (Some(container), _, _) => Some(container),
                    (None, true, Some(before)) => Some(before.clone()),
                    (None, true, None) => None,
                    (None, false, _) => Some(range.clone()),
                };
                // Whether the line is an id at all: `^foo.bar` is not, and
                // is a block the next `^id` alone names; `^solto` with
                // nothing before it is an id that names nothing, and is
                // nothing for the next one either (as observed: the line is
                // no section).
                let is_id =
                    alone && block_id(source, &lines, range.clone(), range.clone()).is_some();
                let block = named
                    .clone()
                    .and_then(|named| block_id(source, &lines, range.clone(), named));
                let alone_top = alone && containers.is_empty() && block.is_some();
                if alone_top && alone_named.is_some() && alone_named == named {
                    document.blocks.pop();
                }
                push_block(&mut document, block);
                alone_named = if alone_top { named } else { None };
                if containers.is_empty() && !is_id {
                    last_top = Some(range.clone());
                }
            }
            // A `^id` at the end of a heading names the heading (spec Q3,
            // as Obsidian does; observed 2026-10-07), or the container the
            // heading is in.
            Event::End(TagEnd::Heading(_)) => {
                let named = named_container(&containers).unwrap_or(range.clone());
                push_block(
                    &mut document,
                    block_id(source, &lines, range.clone(), named),
                );
                if containers.is_empty() {
                    last_top = Some(range.clone());
                }
            }
            // A block closed at the top level: the quote's own end lands
            // there, its entry already popped above.
            Event::End(
                TagEnd::CodeBlock
                | TagEnd::Table
                | TagEnd::List(_)
                | TagEnd::HtmlBlock
                | TagEnd::BlockQuote(_),
            )
            | Event::Rule
                if containers.is_empty() =>
            {
                last_top = Some(range.clone());
            }
            // The base also reports `---` blocks later in the file and
            // unclosed ones inside a blockquote; the frontmatter is only the
            // block on the first line (spec §5.1), so the range must start
            // the file.
            Event::Start(Tag::MetadataBlock(MetadataBlockKind::YamlStyle))
                if range.start == bom && document.frontmatter.is_none() =>
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

/// A container a block can sit in, for what a `^id` inside it names.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Container {
    Item,
    /// A blockquote (a footnote definition would be one, were footnotes
    /// enabled in this parser).
    Quote,
}

/// The block a `^id` inside `containers` names, as Obsidian's cache has it
/// (observed 2026-10-07): a quote at the top level is one block, whole,
/// whatever is in it — a list, a nested quote, a callout's body; in a list
/// otherwise, the innermost item, whole, its nested items with it (Q21).
/// `None` at the top level.
fn named_container(containers: &[(Container, Range<usize>)]) -> Option<Range<usize>> {
    match containers.first() {
        None => None,
        Some((Container::Quote, range)) => Some(range.clone()),
        Some((Container::Item, _)) => containers
            .iter()
            .rev()
            .find(|(kind, _)| *kind == Container::Item)
            .map(|(_, range)| range.clone()),
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

/// The `^id` that ends `range` — a paragraph, a heading, a list item's own
/// text — as a block id naming `named` (spec §5.7, Q3, Q21): the block
/// itself, the container it is in (a quote at the top level, whole; else
/// the innermost list item, whole), or, alone on its line at the top
/// level, the block before it. `None` when the last word is no id: letters,
/// digits and hyphens only; a code span's closing backtick, say,
/// disqualifies it. A code block, an HTML block or a nested list is never
/// looked at: the base reports those as their own events, not as text of
/// the paragraph or the item.
fn block_id(
    source: &str,
    lines: &LineIndex,
    range: Range<usize>,
    named: Range<usize>,
) -> Option<BlockId> {
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
        block: block_span(source, &named),
        lines: lines_of(source, lines, named.start, named.end),
    })
}

/// The span of a block, from its first byte on its first line to its last
/// byte of text: the base starts a nested list — and the item in it — at
/// the line break before it, which is the line above, and ends it after
/// the indentation of the line that follows.
fn block_span(source: &str, range: &Range<usize>) -> Span {
    let start = first_byte(source, range);
    let text = source.get(start..range.end).unwrap_or("");
    // Blanks as the base counts them, not every Unicode space: a line of
    // U+3000 inside a code block is code.
    Span {
        start,
        end: start + text.trim_end_matches([' ', '\t', '\n', '\r']).len(),
    }
}

/// `range.start`, past any line break the base put in front of it.
fn first_byte(source: &str, range: &Range<usize>) -> usize {
    let text = source.get(range.clone()).unwrap_or("");
    range.start + (text.len() - text.trim_start_matches(['\n', '\r']).len())
}

/// The first and last line (1-based) of the bytes `start..end`, a line
/// break before the first byte, or blanks and breaks after the last,
/// not counting as a line of their own.
fn lines_of(source: &str, lines: &LineIndex, start: usize, end: usize) -> (u32, u32) {
    let span = block_span(source, &(start..end));
    (
        lines.pos(source, span.start).line,
        lines.pos(source, span.end.max(span.start)).line,
    )
}

/// A callout is a blockquote whose first line, after `>` and spaces, starts
/// with `[!kind]` (spec §5.8). Any kind is accepted as written; the recognized
/// set and folding are Q5. A nested blockquote is its own event, so a nested
/// callout is reported on its own, with `depth` callouts enclosing it
/// (itself included); the caller stops at [`MAX_CALLOUT_DEPTH`].
fn callout(source: &str, lines: &LineIndex, range: Range<usize>, depth: u32) -> Option<Callout> {
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
        depth,
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

    fn lines(source: &str) -> Vec<(String, (u32, u32))> {
        super::parse(source)
            .blocks
            .iter()
            .map(|b| (b.id.clone(), b.lines))
            .collect()
    }

    #[test]
    fn a_block_id_names_its_block_with_its_lines() {
        // A list item with its nested items (spec Q21); a `^id` alone after
        // a blank line, the block before it (Q3); not the next item.
        assert_eq!(
            lines("- um ^item\n  - filho\n- dois\n\nTexto.\n\n^solto\n"),
            [("item".into(), (1, 2)), ("solto".into(), (5, 5))]
        );
    }

    #[test]
    fn a_block_id_in_a_list_names_the_innermost_item_whole() {
        // Observed in Obsidian 1.14.4 on 2026-10-07 (its cache: the list
        // item's own content; Q21 adds the nested items). Loose or tight,
        // the id at the end of the first line, of a later paragraph, alone
        // under a nested list, or after a code block or a quote first in
        // the item: the item.
        assert_eq!(
            lines("- um ^item\n\n  - filho\n- dois\n"),
            [("item".into(), (1, 3))]
        );
        assert_eq!(
            lines("- a\n\t- b ^b\n\t\t- c\n- d\n"),
            [("b".into(), (2, 3))]
        );
        assert_eq!(
            lines("- um\n\n  segundo ^p\n\n  - filho\n"),
            [("p".into(), (1, 5))]
        );
        assert_eq!(lines("- um\n\n  ^x\n\n  - filho\n"), [("x".into(), (1, 5))]);
        assert_eq!(
            lines("- a\n\n  - b\n  - c\n\n  ^l\n"),
            [("l".into(), (1, 6))]
        );
        assert_eq!(
            lines("- ```\n  code\n  ```\n\n  ^c\n\n  - child\n- next\n"),
            [("c".into(), (1, 7))]
        );
        assert_eq!(lines("- > q ^x\n- dois\n"), [("x".into(), (1, 1))]);
        assert_eq!(
            lines("- ## H ^h\n  - child\n- next\n"),
            [("h".into(), (1, 2))]
        );
        assert_eq!(
            lines("- um ^u\n- dois\n\n  ^v\n"),
            [("u".into(), (1, 1)), ("v".into(), (2, 4))]
        );
        assert_eq!(
            lines("- um\n\n  - filho ^f\n\n  texto ^t\n- dois\n"),
            [("f".into(), (3, 3)), ("t".into(), (1, 5))]
        );
    }

    #[test]
    fn a_block_id_in_a_quote_names_the_quote_whole() {
        // Observed the same day: the top-level quote, whole, whatever
        // holds the id — a nested quote, a list in it, a callout.
        assert_eq!(lines("> a ^q\n"), [("q".into(), (1, 1))]);
        assert_eq!(lines("> a\n>\n> b ^q\n>\n> c\n"), [("q".into(), (1, 5))]);
        assert_eq!(lines("> a\n>\n> ^q\n"), [("q".into(), (1, 3))]);
        assert_eq!(lines("> > a ^q\n"), [("q".into(), (1, 1))]);
        assert_eq!(lines("> - um ^i\n> - dois\n"), [("i".into(), (1, 2))]);
        assert_eq!(lines("> [!note] T\n> texto ^c\n"), [("c".into(), (1, 2))]);
        assert_eq!(lines("> - a\n> - b\n\n^q\n"), [("q".into(), (1, 2))]);
    }

    #[test]
    fn a_block_id_alone_at_the_top_level_names_the_block_before_it_or_nothing() {
        // Observed the same day: the section before it — a list, a heading,
        // a thematic break, a paragraph that is no id; nothing before it,
        // no block.
        assert_eq!(lines("- a\n- b\n\n^lst\n"), [("lst".into(), (1, 2))]);
        assert_eq!(lines("# T\n\n^h\n"), [("h".into(), (1, 1))]);
        assert_eq!(lines("Texto.\n\n---\n\n^r\n"), [("r".into(), (3, 3))]);
        assert_eq!(
            lines("Texto.\n\n^foo.bar\n\n^ok\n"),
            [("ok".into(), (3, 3))]
        );
        assert_eq!(lines("^solto\n\nTexto.\n"), []);
        // Nothing before it names nothing, and is nothing for the next one.
        assert_eq!(lines("^solto\n\n^x\n"), []);
        // Two alone in a row: only the last names the block before them,
        // as in Obsidian (decided 2026-10-09).
        assert_eq!(lines("Texto.\n\n^a\n\n^b\n"), [("b".into(), (1, 1))]);
        // With a paragraph between, each names its own.
        assert_eq!(
            lines("Um.\n\n^a\n\nDois.\n\n^b\n"),
            [("a".into(), (1, 1)), ("b".into(), (5, 5))]
        );
        // A code block whose last line is a wide space keeps that line.
        assert_eq!(
            lines("    code\n    \u{3000}\n\n^c\n"),
            [("c".into(), (1, 2))]
        );
        let doc = super::parse("- a\n\n  - b\n  - c\n\n  ^l\n");
        assert_eq!(
            &"- a\n\n  - b\n  - c\n\n  ^l\n"[doc.blocks[0].block.start..doc.blocks[0].block.end],
            "- a\n\n  - b\n  - c\n\n  ^l"
        );
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

    #[test]
    fn nested_callouts_carry_their_depth_up_to_the_limit() {
        let doc = parse("> [!note] a\n> > [!tip]- b\n> > > [!secret]+ c\n> > > x\n");
        let got: Vec<(&str, u32)> = doc
            .callouts
            .iter()
            .map(|c| (c.kind.as_str(), c.depth))
            .collect();
        assert_eq!(got, [("note", 1), ("tip", 2), ("secret", 3)]);
        // A plain quote in a callout counts as none, a sibling callout after
        // the nest starts again at 1.
        let doc = parse("> [!a]\n> > plain\n\n> [!b]\n");
        assert_eq!(
            doc.callouts.iter().map(|c| c.depth).collect::<Vec<_>>(),
            [1, 1]
        );
        let deep: String = (1..=40)
            .map(|d| format!("{}[!note] n{d}\n", "> ".repeat(d)))
            .collect();
        let doc = parse(&deep);
        assert_eq!(doc.callouts.len(), 32);
        assert_eq!(doc.callouts.last().map(|c| c.depth), Some(32));
    }

    #[test]
    fn hostile_nesting_neither_recurses_nor_lists_past_the_limit() {
        // Thousands of levels: the walk is iterative, the list stops at 32.
        let deep: String = (1..=3000)
            .map(|d| format!("{}[!note] n{d}\n", "> ".repeat(d)))
            .collect();
        assert_eq!(parse(&deep).callouts.len(), 32);
        let bare = format!("{}[!note] x\n", "> ".repeat(20_000));
        assert!(parse(&bare).callouts.len() <= 1);
    }
}
