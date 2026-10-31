// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Pure parser of the Verso dialect: no IO, no async (ADR 0028).
//!
//! The parser is read-only (spec `docs/spec/dialect.md` §9, Q18, reading b):
//! [`parse`] takes the text of a note and returns a [`Document`], a report of
//! the constructs it found — links, embeds, headings, block IDs, callouts and
//! frontmatter — each with the byte range it came from and its position in
//! line and Unicode-character column (spec §4.4). There is no `serialize`:
//! opening a file never rewrites it (ADR 0012) because this crate has nothing
//! that writes.
//!
//! The base is `pulldown-cmark` (ADR 0037); the dialect pass on top of it lives
//! in [`parse`]. The behavior contract is `fixtures/` (ADR 0031): what a
//! fixture asserts, this crate produces; what no fixture asserts is not
//! promised.
//!
//! What this crate does **not** do, on purpose, because the spec leaves it
//! `[OPEN]`: resolve a link to a file (Q12), match a heading (Q19), count
//! Markdown links `[text](nota.md)` (Q20, `PROPOSED`), or decode bytes into
//! text (Q25). The caller hands over a `&str`; where it came from is
//! `verso-fs`'s concern.
//!
//! Two more things come out of the same base parser and are not part of the
//! fixture contract: the reading view's HTML ([`to_html`], Phase 2) and the
//! `#tag`s of a body ([`body_tags`]), one rule for the reader and the index;
//! and the prose of a note ([`prose`]), where an unlinked mention may stand.

pub mod bases;
mod block_ids;
mod callouts;
mod comments;
mod events;
mod footnotes;
mod frontmatter;
mod parse;
mod position;
mod properties;
mod prose;
mod render;
mod schema;
mod secret;
mod tags;
mod wikilink;

pub use frontmatter::{Frontmatter, Value};
pub use parse::parse;
pub use position::{Pos, Span};
pub use prose::{Prose, prose};
pub use render::{to_html, to_html_with};
pub use schema::{
    Layout, PropertyKind, Schema, SchemaBlock, SchemaError, SchemaErrorKind, SchemaProperty,
};
pub use secret::{Secrets, is_secret_kind, project, project_line};
pub use tags::{BodyTag, body_tags, frontmatter_tag};

/// Everything the parser found in one note, in document order per list.
///
/// A `Document` is a report, not a tree: it does not say what is inside what,
/// only what exists and where. Lists are empty, never absent, when nothing was
/// found.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Document {
    /// The YAML block delimited by `---` on the first line (spec §5.1), if any.
    pub frontmatter: Option<Frontmatter>,
    /// ATX headings (`# Title`), spec §5.12. Setext headings wait for Q19.
    pub headings: Vec<Heading>,
    /// Wikilinks `[[…]]` in the body (spec §5.2–5.5, 5.10).
    pub links: Vec<Link>,
    /// Embeds `![[…]]` (spec §5.6).
    pub embeds: Vec<Embed>,
    /// Block ID definitions `^id` at the end of a paragraph or of a list
    /// item's own text (spec §5.7).
    pub blocks: Vec<BlockId>,
    /// Callouts: blockquotes whose first line starts with `[!kind]` (spec §5.8).
    pub callouts: Vec<Callout>,
    /// Wikilinks held by frontmatter properties — typed relations (spec
    /// Q10, ADR 0057). Kept apart from [`Self::links`], which are the body's
    /// and which the fixtures assert.
    pub property_links: Vec<PropertyLink>,
    /// Fenced `verso-schema` blocks — a type's schema (spec §6, Q11; ADR
    /// 0052) — in document order, nested ones included and marked.
    pub schemas: Vec<SchemaBlock>,
}

/// A frontmatter property whose value is a quoted wikilink, or an item of
/// a list of them: a typed relation named by `key` (spec Q10).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PropertyLink {
    /// The top-level key, as written: the relation's type.
    pub key: String,
    /// The position in the list, when the value is a list.
    pub item: Option<usize>,
    pub target: String,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub alias: Option<String>,
    /// Byte range of the `[[…]]`, quotes excluded.
    pub span: Span,
    /// Position of the first `[`.
    pub pos: Pos,
}

/// A wikilink `[[target#heading|alias]]`, with every part as written.
///
/// Nothing is resolved or normalized: `target` is the text before `#` or `|`
/// exactly as it appears in the file (spec §4.2). `heading` is the text after
/// `#`; `block` the text after `#^`; `alias` the text after the first `|`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Link {
    pub target: String,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub alias: Option<String>,
    /// Byte range of the whole `[[…]]` in the source.
    pub span: Span,
    /// Position of the first `[`.
    pub pos: Pos,
}

/// An embed `![[target#heading|alias]]`; same parts as [`Link`].
///
/// For an image, the text after `|` is a size in Obsidian's documentation, not
/// an alias; it is still recorded in `alias` as written until Q23 decides how
/// the fixtures name it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Embed {
    pub target: String,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub alias: Option<String>,
    /// Byte range of the whole `![[…]]` in the source.
    pub span: Span,
    /// Position of the `!`.
    pub pos: Pos,
}

/// An ATX heading `# Text`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Heading {
    /// 1 to 6.
    pub level: u8,
    /// Raw text of the line, without the `#` marks and without spaces at the
    /// ends (spec §4.3). Inline formatting stays as written: `*Porão*`.
    pub text: String,
    /// Byte range of the heading line, from the first `#` to the end of the
    /// line, without the line break.
    pub span: Span,
    /// Position of the first `#`.
    pub pos: Pos,
}

/// A block ID definition `^id` at the end of a paragraph or of a list item's
/// own text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockId {
    /// The id, without the `^`.
    pub id: String,
    /// Byte range of `^id`.
    pub span: Span,
    /// Position of the `^`.
    pub pos: Pos,
    /// Byte range of the block the id names (spec Q3, Q21; decided
    /// 2026-10-07): the top-level section its line is in — a paragraph, a
    /// heading, a quote whole — or, in a list, the innermost list item with
    /// its nested items; for a `^id` alone on a line at the top level, the
    /// block before it.
    pub block: Span,
    /// The first and the last line of that block, 1-based.
    pub lines: (u32, u32),
}

/// Fold marker of a callout: `-` (collapsed) or `+` (expanded) right after
/// `[!kind]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fold {
    Collapsed,
    Expanded,
}

/// A callout: a blockquote whose first line starts with `[!kind]`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Callout {
    /// Text between `[!` and `]`, as written.
    pub kind: String,
    /// Rest of the first line, without spaces at the ends; `None` if empty.
    pub title: Option<String>,
    pub fold: Option<Fold>,
    /// Byte range of the whole blockquote, without the line break that ends it.
    pub span: Span,
    /// Position of the `>` of the first line.
    pub pos: Pos,
    /// How many callouts enclose it, itself included: 1 for a callout that
    /// is in no other, 2 for one inside that, up to [`MAX_CALLOUT_DEPTH`]
    /// (spec Q5; the reading view's limit).
    pub depth: u32,
}

/// How many callouts deep a callout is recognized, inside other callouts.
/// A blockquote past it stays a blockquote, as the reading view draws it
/// (spec Q5, decided 2026-10-21).
pub const MAX_CALLOUT_DEPTH: u32 = 32;
