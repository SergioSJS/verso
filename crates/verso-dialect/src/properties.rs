// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Wikilinks held by frontmatter properties: typed relations (spec Q10 and
//! the link part of Q24, decided on 2026-09-30, ADR 0057 point 4).
//!
//! A property whose value is a quoted wikilink (`aliado: "[[Barão]]"`), or a
//! list whose items are (`inimigos: ["[[A]]", "[[B]]"]`, or one `- "[[A]]"`
//! per line), holds a link; the key is the relation's type. An unquoted
//! `[[x]]` is YAML — a list inside a list — and holds nothing, as Obsidian
//! 1.13.7 reads it (`docs/reference/board-decision.md` §10, O10 and O11).
//!
//! The YAML tree carries no positions, so the links are found twice: in the
//! tree, which says which values are links and under which key, and in the
//! block's text, which says where each one is. A link counts only when both
//! agree; a `"[[x]]"` inside a comment, or in a value that the tree does not
//! read as that string, is not one.

use crate::PropertyLink;
use crate::frontmatter::{Frontmatter, Value};
use crate::position::{LineIndex, Span};
use crate::wikilink::split;

/// The links of `frontmatter`'s properties, in the order written.
pub(crate) fn property_links(
    source: &str,
    lines: &LineIndex,
    frontmatter: Option<&Frontmatter>,
) -> Vec<PropertyLink> {
    let Some(frontmatter) = frontmatter else {
        return Vec::new();
    };
    let Ok(Value::Mapping(map)) = &frontmatter.values else {
        return Vec::new();
    };
    // What the tree says: each link value, with its key and list position.
    let mut expected: Vec<(&str, Option<usize>, &str)> = Vec::new();
    for (key, value) in map {
        match value {
            Value::String(s) if is_one_link(s) => expected.push((key, None, s)),
            Value::Sequence(items) => {
                for (i, item) in items.iter().enumerate() {
                    if let Value::String(s) = item
                        && is_one_link(s)
                    {
                        expected.push((key, Some(i), s));
                    }
                }
            }
            _ => {}
        }
    }
    if expected.is_empty() {
        return Vec::new();
    }
    let Some(block) = frontmatter.span.slice(source) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut key_now: Option<String> = None;
    let mut line_start = 0;
    for line in block.split_inclusive('\n') {
        let base = frontmatter.span.start + line_start;
        line_start += line.len();
        if let Some(key) = top_level_key(line) {
            key_now = Some(key);
        }
        let Some(key) = key_now.as_deref() else {
            continue;
        };
        for (at, inner) in quoted_links(line) {
            let written = format!("[[{inner}]]");
            let Some(found) = expected
                .iter()
                .position(|(k, _, s)| *k == key && s.trim() == written)
            else {
                continue;
            };
            let (_, item, _) = expected.remove(found);
            let start = base + at;
            let parts = split(inner);
            out.push(PropertyLink {
                key: key.to_owned(),
                item,
                target: parts.target,
                heading: parts.heading,
                block: parts.block,
                alias: parts.alias,
                span: Span {
                    start,
                    end: start + written.len(),
                },
                pos: lines.pos(source, start),
            });
        }
    }
    out
}

/// Whether a string is one wikilink and nothing else, spaces around allowed.
pub(crate) fn is_one_link(s: &str) -> bool {
    let t = s.trim();
    t.len() > 4
        && t.starts_with("[[")
        && t.ends_with("]]")
        && !t[2..t.len() - 2].contains("[[")
        && !t[2..t.len() - 2].contains("]]")
}

/// The key a line opens at the top level of the mapping — `key:` at column
/// zero — or `None` for an indented line, a list item, a comment or the
/// fences.
fn top_level_key(line: &str) -> Option<String> {
    let first = line.chars().next()?;
    if first.is_whitespace() || first == '-' || first == '#' {
        return None;
    }
    // A quoted key may hold a colon (`"a:b": …`): it ends at its quote.
    if first == '"' || first == '\'' {
        let rest = line.get(1..)?;
        let end = rest.find(first)?;
        let after = rest.get(end + 1..)?.trim_start_matches([' ', '\t']);
        return after
            .starts_with(':')
            .then(|| rest.get(..end).map(str::to_owned))
            .flatten();
    }
    let (key, _) = line.split_once(':')?;
    let key = key.trim_end();
    let key = key
        .strip_prefix('"')
        .and_then(|k| k.strip_suffix('"'))
        .or_else(|| key.strip_prefix('\'').and_then(|k| k.strip_suffix('\'')))
        .unwrap_or(key);
    Some(key.to_owned())
}

/// Every `"[[…]]"` or `'[[…]]'` of a line: the byte offset of its `[[` in
/// the line, and the text between the brackets. The quote must close right
/// after `]]`, so a string holding more than the link is not taken.
fn quoted_links(line: &str) -> Vec<(usize, &str)> {
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(rel) = line.get(from..).and_then(|rest| rest.find("[[")) {
        let at = from + rel;
        from = at + 2;
        let Some(quote) = at.checked_sub(1).and_then(|q| line.get(q..at)) else {
            continue;
        };
        if quote != "\"" && quote != "'" {
            continue;
        }
        let Some(close) = line.get(at + 2..).and_then(|rest| rest.find("]]")) else {
            continue;
        };
        let inner_end = at + 2 + close;
        if line.get(inner_end + 2..inner_end + 3) != Some(quote) {
            continue;
        }
        if let Some(inner) = line.get(at + 2..inner_end) {
            out.push((at, inner));
            from = inner_end + 2;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use crate::parse;

    fn keys(src: &str) -> Vec<(String, Option<usize>, String)> {
        parse(src)
            .property_links
            .into_iter()
            .map(|l| (l.key, l.item, l.target))
            .collect()
    }

    #[test]
    fn a_quoted_link_and_a_list_of_them() {
        let src = "---\naliado: \"[[Barão]]\"\ninimigos:\n  - \"[[A]]\"\n  - '[[B#Porão|b]]'\ntexto: nada\n---\n# N\n";
        assert_eq!(
            keys(src),
            vec![
                ("aliado".to_owned(), None, "Barão".to_owned()),
                ("inimigos".to_owned(), Some(0), "A".to_owned()),
                ("inimigos".to_owned(), Some(1), "B".to_owned()),
            ]
        );
        let doc = parse(src);
        let b = &doc.property_links[2];
        assert_eq!(b.heading.as_deref(), Some("Porão"));
        assert_eq!(b.alias.as_deref(), Some("b"));
        assert_eq!(b.span.slice(src), Some("[[B#Porão|b]]"));
        assert_eq!((b.pos.line, b.pos.col), (5, 6));
    }

    #[test]
    fn a_flow_list() {
        let src = "---\ninimigos: [\"[[A]]\", \"[[B]]\"]\n---\n";
        assert_eq!(
            keys(src),
            vec![
                ("inimigos".to_owned(), Some(0), "A".to_owned()),
                ("inimigos".to_owned(), Some(1), "B".to_owned()),
            ]
        );
    }

    #[test]
    fn unquoted_is_yaml_and_not_a_link() {
        assert!(keys("---\nsemaspas: [[C]]\n---\n").is_empty());
    }

    #[test]
    fn a_string_holding_more_than_the_link_is_not_one() {
        assert!(keys("---\nnota: \"ver [[C]] aqui\"\n---\n").is_empty());
    }

    #[test]
    fn a_comment_is_not_a_value() {
        assert!(keys("---\n# \"[[C]]\"\nx: 1\n---\n").is_empty());
    }

    #[test]
    fn invalid_yaml_has_no_links() {
        assert!(keys("---\na: \"[[C]]\n  : :\n---\n").is_empty());
    }

    #[test]
    fn a_quoted_key_may_hold_a_colon() {
        assert_eq!(
            keys("---\n\"a:b\": \"[[X]]\"\n---\n"),
            vec![("a:b".to_owned(), None, "X".to_owned())]
        );
    }

    #[test]
    fn body_links_are_not_property_links() {
        let doc = parse("---\na: \"[[X]]\"\n---\n[[Y]]\n");
        assert_eq!(doc.property_links.len(), 1);
        assert_eq!(doc.links.len(), 1);
        assert_eq!(doc.links[0].target, "Y");
    }
}
