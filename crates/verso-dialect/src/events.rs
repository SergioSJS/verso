// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the reader's passes share: the base parser's events with the byte
//! range each came from, the contexts in which a text event is prose, and
//! the cuts of a text event that keep its range true. The passes
//! (`comments`, `footnotes`, `callouts`, `tags` and `render` itself) act on
//! a `Vec` of these events one after the other, never on the HTML, so raw
//! HTML in the note cannot confuse any of them.

use std::ops::Range;

use pulldown_cmark::{CowStr, Event, Options, Parser, Tag, TagEnd};

/// One event of the base parser and the bytes of the source it came from.
pub(crate) type Offset<'a> = (Event<'a>, Range<usize>);

/// The reader's options: what [`crate::parse`] enables, plus the
/// extensions the reading view shows (the doc of [`crate::render`] says
/// which and why).
fn options() -> Options {
    Options::ENABLE_WIKILINKS
        | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS
        | Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_MATH
}

/// The events of `source`, each with its byte range.
pub(crate) fn events(source: &str) -> Vec<Offset<'_>> {
    offsets(source, options()).collect()
}

/// The base parser's events over `source` with `options`, each with the
/// range of `source` it came from. A byte order mark at the start is not
/// content (spec Q24, decided 2026-10-21; Obsidian 1.13.7 reads the
/// frontmatter behind one): the parser is fed the text after it, as if the
/// file began there, and the ranges are moved back onto `source`, so that
/// they still slice it. Nothing is written: this only reads.
pub(crate) fn offsets(source: &str, options: Options) -> impl Iterator<Item = Offset<'_>> {
    let bom = bom_len(source);
    Parser::new_ext(source.get(bom..).unwrap_or(source), options)
        .into_offset_iter()
        .map(move |(event, range)| (event, range.start + bom..range.end + bom))
}

/// The length in bytes of a byte order mark at the start of `source`: 3, or 0.
pub(crate) fn bom_len(source: &str) -> usize {
    if source.starts_with('\u{feff}') {
        '\u{feff}'.len_utf8()
    } else {
        0
    }
}

/// Where a text event sits. The passes act on prose and leave the rest as
/// the base gives it: the frontmatter, a code block, a link's label, an
/// image's alt text. Fed every event, in order, before the event is looked
/// at.
#[derive(Default)]
pub(crate) struct Context {
    metadata: bool,
    code: usize,
    label: usize,
}

impl Context {
    pub(crate) fn enter(&mut self, event: &Event<'_>) {
        match event {
            Event::Start(Tag::MetadataBlock(_)) => self.metadata = true,
            Event::End(TagEnd::MetadataBlock(_)) => self.metadata = false,
            Event::Start(Tag::CodeBlock(_)) => self.code += 1,
            Event::End(TagEnd::CodeBlock) => self.code = self.code.saturating_sub(1),
            Event::Start(Tag::Link { .. } | Tag::Image { .. }) => self.label += 1,
            Event::End(TagEnd::Link | TagEnd::Image) => self.label = self.label.saturating_sub(1),
            _ => {}
        }
    }

    /// Inside the frontmatter, which the reader does not show.
    pub(crate) fn metadata(&self) -> bool {
        self.metadata
    }

    /// Text that is neither the frontmatter nor code: what a comment may
    /// hide.
    pub(crate) fn text(&self) -> bool {
        !self.metadata && self.code == 0
    }

    /// Text outside a link's label and an image's alt text as well: where
    /// a tag, a highlight or an inline footnote may be.
    pub(crate) fn prose(&self) -> bool {
        self.text() && self.label == 0
    }
}

/// Whether `text` is the source it came from, byte for byte. An entity
/// breaks that (`&amp;` is the text `&`), and then no offset inside the
/// text can be trusted: such an event is left whole. An escape does not:
/// the base starts the range after the backslash (see [`escaped_start`]).
pub(crate) fn literal(source: &str, text: &str, range: &Range<usize>) -> bool {
    source.get(range.clone()) == Some(text)
}

/// Whether the first character of the text event at `i` was written with
/// a backslash before it. The base leaves the backslash out of the range,
/// so the byte before the range says so — unless that byte belongs to the
/// event before (`\\[` is an escaped backslash, then a real bracket).
pub(crate) fn escaped_start(source: &str, events: &[Offset<'_>], i: usize) -> bool {
    let Some((_, range)) = events.get(i) else {
        return false;
    };
    let Some(before) = range.start.checked_sub(1) else {
        return false;
    };
    if source.as_bytes().get(before) != Some(&b'\\') {
        return false;
    }
    match i.checked_sub(1).and_then(|p| events.get(p)) {
        // A container's range starts at its own delimiter, never at the
        // backslash.
        Some((Event::Start(_), _)) | None => true,
        Some((_, previous)) => previous.end <= before,
    }
}

/// `text[lo..hi]` as a text event of its own, with the range it keeps in
/// the source; only right for a [`literal`] text. `None` when empty or off
/// a character boundary: nothing to emit.
pub(crate) fn piece<'a>(
    text: &CowStr<'a>,
    range: &Range<usize>,
    lo: usize,
    hi: usize,
) -> Option<Offset<'a>> {
    if lo >= hi {
        return None;
    }
    let sub = match text {
        CowStr::Borrowed(s) => CowStr::Borrowed(s.get(lo..hi)?),
        other => CowStr::from(other.get(lo..hi)?.to_owned()),
    };
    Some((Event::Text(sub), range.start + lo..range.start + hi))
}

/// Whether a tag is a span inside a line of text. A construct that lives
/// inside a line may cross one of these; any other tag is a block and ends
/// it.
pub(crate) fn is_inline(end: TagEnd) -> bool {
    matches!(
        end,
        TagEnd::Emphasis
            | TagEnd::Strong
            | TagEnd::Strikethrough
            | TagEnd::Highlight
            | TagEnd::Superscript
            | TagEnd::Subscript
            | TagEnd::Link
            | TagEnd::Image
    )
}
