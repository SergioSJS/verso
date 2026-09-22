// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A note as HTML, for a preview (Phase 2). The same base parser and the
//! same options as [`crate::parse`], so what is a link there is a link
//! here: a wikilink becomes `<a class="wikilink" data-target="…">` with
//! the target as written (fragment included) and the alias or the target
//! as its text; an embed becomes `<span class="embed" data-target="…">`.
//! Resolving the target is the index's job, not the renderer's; the UI
//! asks. The frontmatter is not rendered. Raw HTML in the note passes
//! through, as in the base parser: the preview shows the user their own
//! file, inside a webview whose policy runs no script.

use pulldown_cmark::{Event, LinkType, Options, Parser, Tag, TagEnd, html};

fn attr(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

/// `source` as HTML. No IO, no panic: the parser has none.
#[must_use]
pub fn to_html(source: &str) -> String {
    let options = Options::ENABLE_WIKILINKS
        | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS
        | Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES;
    let mut in_metadata = false;
    let events = Parser::new_ext(source, options).filter_map(|event| match event {
        Event::Start(Tag::MetadataBlock(_)) => {
            in_metadata = true;
            None
        }
        Event::End(TagEnd::MetadataBlock(_)) => {
            in_metadata = false;
            None
        }
        _ if in_metadata => None,
        Event::Start(Tag::Link {
            link_type: LinkType::WikiLink { .. },
            dest_url,
            ..
        }) => Some(Event::Html(
            format!("<a class=\"wikilink\" data-target=\"{}\">", attr(&dest_url)).into(),
        )),
        Event::End(TagEnd::Link) => Some(Event::Html("</a>".into())),
        Event::Start(Tag::Image {
            link_type: LinkType::WikiLink { .. },
            dest_url,
            ..
        }) => Some(Event::Html(
            format!("<span class=\"embed\" data-target=\"{}\">", attr(&dest_url)).into(),
        )),
        Event::End(TagEnd::Image) => Some(Event::Html("</span>".into())),
        other => Some(other),
    });
    let mut out = String::with_capacity(source.len() * 2);
    html::push_html(&mut out, events);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wikilinks_become_anchors_with_the_target_as_written() {
        let html = to_html("Ver [[Taverna#Porão|a taverna]] e [[Nada]].");
        assert!(
            html.contains(r#"<a class="wikilink" data-target="Taverna#Porão">a taverna</a>"#),
            "{html}"
        );
        assert!(
            html.contains(r#"<a class="wikilink" data-target="Nada">Nada</a>"#),
            "{html}"
        );
    }

    #[test]
    fn embeds_become_spans_and_code_is_left_alone() {
        let html = to_html("![[Mapa.png]] e `[[não]]`\n\n```\n[[nem]]\n```\n");
        assert!(
            html.contains(r#"<span class="embed" data-target="Mapa.png">"#),
            "{html}"
        );
        assert!(html.contains("<code>[[não]]</code>"), "{html}");
        assert!(!html.contains("wikilink"), "{html}");
    }

    #[test]
    fn frontmatter_is_not_rendered_and_tables_are() {
        let html = to_html("---\ntags: [a]\n---\n# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
        assert!(!html.contains("tags"), "{html}");
        assert!(html.contains("<h1>T</h1>"), "{html}");
        assert!(html.contains("<table>"), "{html}");
    }

    #[test]
    fn a_quote_in_a_target_is_escaped() {
        let html = to_html(r#"[[a"b]]"#);
        assert!(html.contains(r#"data-target="a&quot;b""#), "{html}");
    }
}
