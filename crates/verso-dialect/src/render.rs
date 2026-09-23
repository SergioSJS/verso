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
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_MATH;
    let source = inline_footnotes(source);
    let source = source.as_ref();
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
        // Math stays as its source in a marked element; the window
        // typesets it (KaTeX), the parser only finds it.
        Event::InlineMath(tex) => Some(Event::Html(
            format!("<span class=\"math\">{}</span>", attr(&tex)).into(),
        )),
        Event::DisplayMath(tex) => Some(Event::Html(
            format!("<div class=\"math math-display\">{}</div>", attr(&tex)).into(),
        )),
        other => Some(other),
    });
    let events = events.flat_map(|event| match event {
        Event::Text(text) if text.contains("==") => highlights(&text),
        other => vec![other],
    });
    let mut out = String::with_capacity(source.len() * 2);
    html::push_html(&mut out, events);
    callouts(&out)
}

/// `==marked==` inside one text run becomes `<mark>`; an odd `==` is
/// text. Obsidian's highlight, which the base parser does not know.
fn highlights(text: &str) -> Vec<Event<'static>> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(a) = rest.find("==") {
        let after = &rest[a + 2..];
        let Some(b) = after.find("==") else { break };
        if b == 0 {
            // `====`: not a highlight; keep going after it.
            out.push(Event::Text(rest[..a + 2].to_owned().into()));
            rest = after;
            continue;
        }
        out.push(Event::Text(rest[..a].to_owned().into()));
        out.push(Event::Html("<mark>".into()));
        out.push(Event::Text(after[..b].to_owned().into()));
        out.push(Event::Html("</mark>".into()));
        rest = &after[b + 2..];
    }
    if !rest.is_empty() {
        out.push(Event::Text(rest.to_owned().into()));
    }
    out
}

/// A blockquote whose first line is `[!type]`, `[!type]+` or `[!type]-`
/// with an optional title becomes an Obsidian callout:
/// `<div class="callout" data-callout="type" data-fold="+|-">` with a
/// `<p class="callout-title">`. Nested blockquotes inside it are kept.
/// Obsidian's inline footnote, `^[text]`, which the parser does not
/// know: each becomes a reference `[^inline-N]` with its definition
/// appended at the end, so both forms render the same way. Code spans
/// and fenced blocks are left alone; nothing changes when there is none.
fn inline_footnotes(source: &str) -> std::borrow::Cow<'_, str> {
    if !source.contains("^[") {
        return std::borrow::Cow::Borrowed(source);
    }
    let mut out = String::with_capacity(source.len() + 64);
    let mut notes: Vec<String> = Vec::new();
    let rest = source;
    let mut in_fence = false;
    let mut in_code = false;
    let mut chars = rest.char_indices().peekable();
    let mut last = 0;
    while let Some((i, c)) = chars.next() {
        let at_line_start = i == 0 || rest.as_bytes()[i - 1] == b'\n';
        if at_line_start && rest[i..].starts_with("```") {
            in_fence = !in_fence;
        }
        if in_fence {
            continue;
        }
        if c == '`' {
            in_code = !in_code;
            continue;
        }
        if in_code || c != '^' || !rest[i..].starts_with("^[") {
            continue;
        }
        // The matching `]`, brackets nested, on this paragraph.
        let body_start = i + 2;
        let mut depth = 1;
        let mut end = None;
        for (j, d) in rest[body_start..].char_indices() {
            match d {
                '[' => depth += 1,
                ']' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(body_start + j);
                        break;
                    }
                }
                '\n' if rest[body_start + j..].starts_with("\n\n") => break,
                _ => {}
            }
        }
        let Some(end) = end else { continue };
        let text = rest[body_start..end].trim();
        if text.is_empty() {
            continue;
        }
        notes.push(text.to_owned());
        out.push_str(&rest[last..i]);
        out.push_str(&format!("[^inline-{}]", notes.len()));
        last = end + 1;
        // Skip the characters of the note in the outer scan.
        while let Some(&(k, _)) = chars.peek() {
            if k > end {
                break;
            }
            chars.next();
        }
    }
    if notes.is_empty() {
        return std::borrow::Cow::Borrowed(source);
    }
    out.push_str(&rest[last..]);
    if !out.ends_with('\n') {
        out.push('\n');
    }
    for (n, text) in notes.iter().enumerate() {
        out.push_str(&format!("\n[^inline-{}]: {text}\n", n + 1));
    }
    std::borrow::Cow::Owned(out)
}

fn callouts(html: &str) -> String {
    const OPEN: &str = "<blockquote>\n<p>[!";
    let mut out = String::with_capacity(html.len());
    let mut rest = html;
    while let Some(i) = rest.find(OPEN) {
        out.push_str(&rest[..i]);
        let body = &rest[i + OPEN.len()..];
        // `type]` then fold then the title up to the end of the line.
        let Some(close) = body.find(']') else {
            out.push_str(OPEN);
            rest = body;
            continue;
        };
        let kind: String = body[..close].trim().to_lowercase();
        if kind.is_empty()
            || !kind
                .chars()
                .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
        {
            out.push_str(OPEN);
            rest = body;
            continue;
        }
        let mut after = &body[close + 1..];
        let fold = match after.chars().next() {
            Some(c @ ('+' | '-')) => {
                after = &after[1..];
                Some(c)
            }
            _ => None,
        };
        let line_end = after.find('\n').unwrap_or(after.len());
        let first_line = &after[..line_end];
        let (title, inline_rest) = match first_line.find("</p>") {
            Some(k) => (&first_line[..k], &first_line[k..]),
            None => (first_line, ""),
        };
        let title = title.trim();
        // The end of this blockquote, nesting counted.
        let mut depth = 1;
        let mut scan = &rest[i + "<blockquote>".len()..];
        let mut consumed = "<blockquote>".len();
        let end = loop {
            let open = scan.find("<blockquote>");
            let close_tag = scan.find("</blockquote>");
            match (open, close_tag) {
                (Some(o), Some(c)) if o < c => {
                    depth += 1;
                    consumed += o + "<blockquote>".len();
                    scan = &scan[o + "<blockquote>".len()..];
                }
                (_, Some(c)) => {
                    depth -= 1;
                    consumed += c;
                    if depth == 0 {
                        break Some(consumed);
                    }
                    consumed += "</blockquote>".len();
                    scan = &scan[c + "</blockquote>".len()..];
                }
                _ => break None,
            }
        };
        let Some(end) = end else {
            out.push_str(OPEN);
            rest = body;
            continue;
        };
        let inner_start = OPEN.len() + close + 1 + usize::from(fold.is_some()) + line_end;
        let inner = &rest[i + inner_start..i + end];
        out.push_str(&format!("<div class=\"callout\" data-callout=\"{kind}\""));
        if let Some(f) = fold {
            out.push_str(&format!(" data-fold=\"{f}\""));
        }
        out.push_str(">\n<p class=\"callout-title\">");
        if title.is_empty() {
            let mut chars = kind.chars();
            if let Some(c) = chars.next() {
                out.push_str(&c.to_uppercase().collect::<String>());
                out.push_str(chars.as_str());
            }
        } else {
            out.push_str(title);
        }
        out.push_str("</p>\n");
        // The paragraph that held the title: closed on that line, closed
        // later (its remaining lines are the body's first paragraph), or
        // only the title.
        let inner = inner.trim_start_matches('\n');
        if !inline_rest.is_empty() {
            out.push_str(inner);
        } else if let Some(after_p) = inner.strip_prefix("</p>") {
            out.push_str(after_p.trim_start_matches('\n'));
        } else {
            out.push_str("<p>");
            out.push_str(inner);
        }
        out.push_str("</div>");
        rest = &rest[i + end + "</blockquote>".len()..];
    }
    out.push_str(rest);
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

    #[test]
    fn a_callout_is_a_div_with_its_kind_title_and_fold() {
        let html = to_html(
            "> [!warning]- Cuidado\n> Texto do aviso.\n\n> [!note]\n> Só corpo.\n\n> citação normal\n",
        );
        assert!(
            html.contains(r#"<div class="callout" data-callout="warning" data-fold="-">"#),
            "{html}"
        );
        assert!(
            html.contains(r#"<p class="callout-title">Cuidado</p>"#),
            "{html}"
        );
        assert!(html.contains("Texto do aviso."), "{html}");
        assert!(
            html.contains(r#"<div class="callout" data-callout="note">"#),
            "{html}"
        );
        assert!(
            html.contains(r#"<p class="callout-title">Note</p>"#),
            "{html}"
        );
        assert!(html.contains("<p>Só corpo.</p>"), "{html}");
        assert!(
            html.contains("<blockquote>\n<p>citação normal</p>"),
            "{html}"
        );
        assert_eq!(html.matches("</div>").count(), 2, "{html}");
    }

    #[test]
    fn highlights_become_mark_and_odd_ones_stay_text() {
        let html = to_html("a ==b== c ==d\n");
        assert!(html.contains("a <mark>b</mark> c ==d"), "{html}");
        let html = to_html("`==x==`\n");
        assert!(html.contains("<code>==x==</code>"), "{html}");
    }
}

#[cfg(test)]
mod footnotes {
    #[test]
    fn referenced_and_inline_footnotes_render_alike() {
        let html = super::to_html(
            "Texto[^1] e outro^[direto na linha].\n\n`^[num código]`\n\n[^1]: A nota.\n",
        );
        assert!(
            html.contains(r##"<sup class="footnote-reference"><a href="#1">1</a></sup>"##),
            "{html}"
        );
        assert!(
            html.contains(r##"<sup class="footnote-reference"><a href="#inline-1">"##),
            "{html}"
        );
        assert!(html.contains("<p>A nota.</p>"), "{html}");
        assert!(html.contains("<p>direto na linha</p>"), "{html}");
        assert!(html.contains("<code>^[num código]</code>"), "{html}");
    }
}

#[cfg(test)]
mod math {
    #[test]
    fn math_is_kept_as_source_in_a_marked_element() {
        let html = super::to_html("Inline $a^2 + b^2$ e bloco:\n\n$$\n\\int_0^1 x\\,dx\n$$\n");
        assert!(
            html.contains(r#"<span class="math">a^2 + b^2</span>"#),
            "{html}"
        );
        assert!(
            html.contains(r#"<div class="math math-display">"#),
            "{html}"
        );
        assert!(html.contains("\\int_0^1"), "{html}");
    }
}
