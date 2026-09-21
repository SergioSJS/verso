// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The dialect pass: one loop over the base parser's events with byte ranges
//! (ADR 0037), recognizing the constructs of spec §5 and recording where each
//! one is.

use std::ops::Range;

use pulldown_cmark::{Event, LinkType, MetadataBlockKind, Options, Parser, Tag, TagEnd};

use crate::frontmatter::{Frontmatter, parse_yaml};
use crate::position::{LineIndex, Span};
use crate::wikilink;
use crate::{BlockId, Callout, Document, Embed, Fold, Heading, Link};

/// Parse the text of one note into its [`Document`] report.
///
/// Never panics on any input (Q18, property 1; the fuzz target of ADR 0029 is
/// what proves it), returns the same report for the same input (property 2),
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

    for (event, range) in Parser::new_ext(source, options).into_offset_iter() {
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
            Event::End(TagEnd::Paragraph) => {
                if let Some(block) = block_id(source, &lines, range) {
                    document.blocks.push(block);
                }
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

    document
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

/// ATX heading. The base's range covers the whole line with its line break
/// and any indentation; the span reported starts at the first `#` and stops
/// before the line break. A setext heading (`Title\n=====`) has no `#` and
/// waits for Q19: it is not reported.
fn heading(source: &str, lines: &LineIndex, range: Range<usize>, level: u8) -> Option<Heading> {
    let text = source.get(range.clone())?;
    let line = text.lines().next()?;
    let indent = line.len() - line.trim_start_matches([' ', '\t']).len();
    let line = &line[indent..];
    if !line.starts_with('#') {
        return None;
    }
    let start = range.start + indent;
    let end = start + line.len();
    let marks = line.len() - line.trim_start_matches('#').len();
    let content = &line[marks..];
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

/// A `^id` as the last word of a paragraph (spec §5.7). The id is letters,
/// digits and hyphen, Obsidian's documented charset; the other admissible
/// positions and charsets are Q3 and Q22. Two consequences of "paragraph",
/// both undecided and recorded, not chosen: a `^id` alone on a line after a
/// blank line is a paragraph of its own and is reported; a `^id` at the end
/// of a tight list item is not, because the base emits no paragraph inside a
/// tight item. The paragraph's own text is checked, not the base's text
/// events, so a `^id` at the end of a code span, which is followed by a
/// backtick, does not qualify.
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
    let end = range.start + text.trim_end_matches(['\n', '\r']).len();
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
