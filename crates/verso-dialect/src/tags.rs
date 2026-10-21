// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `#tag` in the body of a note: one rule, used by the reader to mark tags
//! and by the index to list them (Opus reading of Phase 2, finding 14), so
//! that the tags pane never lists a tag the reading view does not show.
//! What a tag is (spec Q13) and its charset and case (Q22) are this rule,
//! as the maintainer decided on 2026-09-23; no fixture asserts it yet.

use pulldown_cmark::Event;

use crate::Span;
use crate::events::{self, Context, Offset};

/// A `#tag` in the body, as written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BodyTag {
    /// The text after `#`, as written. Folding it is the caller's choice:
    /// the index lists tags in lower case.
    pub name: String,
    /// Byte range of `#name` in the source.
    pub span: Span,
}

/// The `#tag`s in the body of `source`, in document order.
///
/// A tag is a `#` at the start of the text, after whitespace or after `(`,
/// followed by letters, digits, `_`, `-` or `/`, and not digits only — the
/// syntax the index accepted since feature 3. What this function settles is
/// where a `#` counts: in prose only. Not in the frontmatter (a YAML
/// comment is not a tag), not in a code span or a code block, not in a
/// link's label or destination or an image's alt text, not in math, not in
/// raw HTML, and not inside a `%%comment%%`, which the reader hides. A
/// heading's own `#` marks are not text to the base, so `# Title #tag` has
/// one tag.
#[must_use]
pub fn body_tags(source: &str) -> Vec<BodyTag> {
    let events = crate::comments::strip(source, events::events(source));
    scan(source, &events)
}

/// The tags in `events`, which came from `source`. The reader calls this
/// on the events it already has, at the same point of the pipeline as
/// [`body_tags`] does: after the comments went, before anything else moved.
pub(crate) fn scan(source: &str, events: &[Offset<'_>]) -> Vec<BodyTag> {
    let mut context = Context::default();
    let mut out = Vec::new();
    for (event, range) in events {
        context.enter(event);
        let Event::Text(text) = event else {
            continue;
        };
        if !context.prose() || !events::literal(source, text, range) {
            continue;
        }
        for (k, c) in text.char_indices() {
            if c != '#' {
                continue;
            }
            // The boundary is read from the source, not from the event, so
            // that `[#x]` — text split at the brackets by the base — and
            // `\#x` are no tags, as they are not to the raw-line rule the
            // index used to apply.
            let at = range.start + k;
            let boundary = source
                .get(..at)
                .and_then(|before| before.chars().next_back())
                .is_none_or(|before| before.is_whitespace() || before == '(');
            if !boundary {
                continue;
            }
            let name: String = text
                .get(k + 1..)
                .unwrap_or_default()
                .chars()
                .take_while(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '/'))
                .collect();
            if name.is_empty() || name.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            let end = at + 1 + name.len();
            out.push(BodyTag {
                name,
                span: Span { start: at, end },
            });
        }
    }
    out
}

/// The tag a frontmatter `tags` item names, or `None` when it names none
/// (spec Q22 c and Q24 b; DL.2 = B, decided by the maintainer on
/// 2026-10-21). A **string** is a tag, and so is a non-negative **integer**,
/// as its text: `tags: 2024` and `tags: [2025, yes]` make the tags `2024`,
/// `2025` and `yes`. This is a knowing difference from Obsidian 1.13.7,
/// which lists no tag for a number. A boolean, a float (`1.5`), a null and
/// a negative integer are none. A leading `#` is not part of the name:
/// `"#ideia"` and `ideia` are one tag. The case is kept; folding is the
/// caller's choice. (A `#2024` in the body stays no tag: that rule is the
/// body's, Q13.)
#[must_use]
pub fn frontmatter_tag(item: &crate::Value) -> Option<String> {
    let text = match item {
        crate::Value::String(text) => text.as_str().to_owned(),
        crate::Value::Integer(n) if *n >= 0 => n.to_string(),
        _ => return None,
    };
    let name = text.trim().trim_start_matches('#');
    (!name.is_empty()).then(|| name.to_owned())
}
