// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A note as HTML, for a preview (Phase 2). The same base parser as
//! [`crate::parse`], with more of its extensions turned on: tables,
//! strikethrough, task lists, footnotes and math — the reader's provisional
//! choice while spec Q15 is open — where `parse` enables wikilinks and the
//! frontmatter only. So a `[[x]]` is a link in both, except where an
//! extension claims the text first: `$[[x]]$` is a link to `parse` and so
//! to the index, and math here. A wikilink becomes
//! `<a class="wikilink" data-target="…">` with the target as written
//! (fragment included) and the alias or the target as its text; an embed
//! becomes `<span class="embed" data-target="…">`. Resolving the target is
//! the index's job, not the renderer's; the UI asks. The frontmatter is not
//! rendered. Raw HTML in the note passes through, as in the base parser:
//! the preview shows the user their own file, inside a webview whose policy
//! runs no script.
//!
//! Obsidian's constructs the base does not know are found on its events,
//! never by scanning the HTML, so raw HTML in the note cannot confuse them:
//! `%%comments%%` go ([`crate::comments`]), `^[inline footnotes]` become
//! footnotes ([`crate::footnotes`]), callouts become `<div class="callout">`
//! ([`crate::callouts`]), `==highlight==` becomes `<mark>`, and `#tag`
//! becomes `<a class="tag">` by the rule the index lists tags with
//! ([`crate::body_tags`]), and a block's `^id` is not shown
//! ([`crate::block_ids`]). Each acts on prose only: not in code, not in a
//! link's label or an image's alt text, not in math, not in the
//! frontmatter — what is code to the base stays code here (invariant 12).
//! A task-list checkbox carries `data-task-line`, the 1-based line of its
//! `[ ]` in the text given, frontmatter included, so the window toggles the
//! right line; an oracle callout carries `data-oracle-line`, the line of
//! its head, by the same count ([`crate::callouts`]).

use std::ops::Range;

use pulldown_cmark::{CowStr, Event, LinkType, Tag, TagEnd, html};

use crate::Document;
use crate::position::LineIndex;
use crate::tags::BodyTag;
use crate::{block_ids, callouts, comments, events, footnotes, tags};
use events::{Context, Offset};

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

/// `source` as HTML. No IO, and no panic: every cut of the text is made
/// with `get`, and a construct that does not fit is left as written (the
/// fuzz target of ADR 0029 runs this too). Linear in the size of the note:
/// each pass reads the events once. Parses the source for its block ids;
/// a caller that has the [`Document`] already uses [`to_html_with`].
#[must_use]
pub fn to_html(source: &str) -> String {
    to_html_with(source, &crate::parse(source))
}

/// [`to_html`] for a source already parsed: `document` must be
/// [`crate::parse`] of the same `source`, and lends its block ids, which
/// the reader hides ([`crate::block_ids`]).
#[must_use]
pub fn to_html_with(source: &str, document: &Document) -> String {
    let events = comments::strip(source, events::events(source));
    let events = block_ids::hide(source, events, &document.blocks);
    let tags = tags::scan(source, &events);
    let events = footnotes::inline(source, events);
    let lines = LineIndex::new(source);
    let events = callouts::callouts(source, &lines, events);
    let mut context = Context::default();
    // Whether each open link or image is a wikilink: only those get the
    // anchor or the span, and only their ends close it.
    let mut wiki: Vec<bool> = Vec::new();
    let rendered = events.into_iter().flat_map(|(event, range)| {
        context.enter(&event);
        match event {
            Event::Start(Tag::MetadataBlock(_)) | Event::End(TagEnd::MetadataBlock(_)) => vec![],
            _ if context.metadata() => vec![],
            Event::Start(Tag::Link {
                link_type: LinkType::WikiLink { .. },
                dest_url,
                ..
            }) => {
                wiki.push(true);
                vec![Event::Html(
                    format!("<a class=\"wikilink\" data-target=\"{}\">", attr(&dest_url)).into(),
                )]
            }
            link @ Event::Start(Tag::Link { .. }) => {
                wiki.push(false);
                vec![link]
            }
            Event::End(TagEnd::Link) => {
                if wiki.pop().unwrap_or(false) {
                    vec![Event::Html("</a>".into())]
                } else {
                    vec![Event::End(TagEnd::Link)]
                }
            }
            Event::Start(Tag::Image {
                link_type: LinkType::WikiLink { .. },
                dest_url,
                ..
            }) => {
                wiki.push(true);
                vec![Event::Html(
                    format!("<span class=\"embed\" data-target=\"{}\">", attr(&dest_url)).into(),
                )]
            }
            image @ Event::Start(Tag::Image { .. }) => {
                wiki.push(false);
                vec![image]
            }
            Event::End(TagEnd::Image) => {
                if wiki.pop().unwrap_or(false) {
                    vec![Event::Html("</span>".into())]
                } else {
                    vec![Event::End(TagEnd::Image)]
                }
            }
            // A single newline inside a paragraph is a line break, as
            // Obsidian shows it by default ("strict line breaks" off): what
            // is typed on two lines reads on two lines.
            Event::SoftBreak => vec![Event::HardBreak],
            // Math stays as its source in a marked element; the window
            // typesets it (KaTeX), the parser only finds it.
            Event::InlineMath(tex) => vec![Event::Html(
                format!("<span class=\"math\">{}</span>", attr(&tex)).into(),
            )],
            Event::DisplayMath(tex) => vec![Event::Html(
                format!("<div class=\"math math-display\">{}</div>", attr(&tex)).into(),
            )],
            // The base's own checkbox, plus the line of the marker.
            Event::TaskListMarker(checked) => vec![Event::Html(
                format!(
                    "<input disabled=\"\" type=\"checkbox\"{} data-task-line=\"{}\"/>",
                    if checked { " checked=\"\"" } else { "" },
                    lines.pos(source, range.start).line
                )
                .into(),
            )],
            Event::Text(text) if context.prose() && events::literal(source, &text, &range) => {
                prose(&text, &range, &tags)
            }
            other => vec![other],
        }
    });
    let mut out = String::with_capacity(source.len() * 2);
    html::push_html(&mut out, rendered);
    out
}

/// A run of prose: highlights first, then the tags inside each piece of
/// text that is left, as before.
fn prose<'a>(text: &CowStr<'a>, range: &Range<usize>, tags: &[BodyTag]) -> Vec<Event<'a>> {
    let mut out = Vec::new();
    for (event, range) in highlights(text, range) {
        match event {
            Event::Text(text) => out.extend(mark_tags(&text, &range, tags)),
            other => out.push(other),
        }
    }
    out
}

/// `==marked==` inside one text run becomes `<mark>`; an odd `==` is
/// text. Obsidian's highlight, which the base parser does not know.
fn highlights<'a>(text: &CowStr<'a>, range: &Range<usize>) -> Vec<Offset<'a>> {
    let whole = || vec![(Event::Text(text.clone()), range.clone())];
    if !text.contains("==") {
        return whole();
    }
    let mut out = Vec::new();
    let mut kept = 0;
    let mut search = 0;
    while let Some(a) = text
        .get(search..)
        .and_then(|t| t.find("=="))
        .map(|a| a + search)
    {
        let after = a + 2;
        let Some(b) = text
            .get(after..)
            .and_then(|t| t.find("=="))
            .map(|b| b + after)
        else {
            break;
        };
        if b == after {
            // `====`: not a highlight; keep going after it.
            search = b;
            continue;
        }
        out.extend(events::piece(text, range, kept, a));
        out.push((Event::Html("<mark>".into()), a..after));
        out.extend(events::piece(text, range, after, b));
        out.push((Event::Html("</mark>".into()), b..b + 2));
        kept = b + 2;
        search = kept;
    }
    if out.is_empty() {
        return whole();
    }
    out.extend(events::piece(text, range, kept, text.len()));
    out
}

/// The tags of `tags` that fall inside this text become
/// `<a class="tag" data-tag="tag">#tag</a>`, the rest stays text. The tags
/// were found on the same events before anything was cut, so a tag is
/// either whole inside a piece or not in it.
fn mark_tags<'a>(text: &CowStr<'a>, range: &Range<usize>, tags: &[BodyTag]) -> Vec<Event<'a>> {
    let first = tags.partition_point(|t| t.span.start < range.start);
    let mut out = Vec::new();
    let mut kept = 0;
    for tag in tags.get(first..).unwrap_or_default() {
        if tag.span.start >= range.end {
            break;
        }
        if tag.span.end > range.end {
            continue;
        }
        let (lo, hi) = (tag.span.start - range.start, tag.span.end - range.start);
        out.extend(events::piece(text, range, kept, lo).map(|(event, _)| event));
        out.push(Event::Html(
            format!(
                "<a class=\"tag\" data-tag=\"{}\">#{}</a>",
                attr(&tag.name.to_lowercase()),
                attr(&tag.name)
            )
            .into(),
        ));
        kept = hi;
    }
    if out.is_empty() {
        return vec![Event::Text(text.clone())];
    }
    out.extend(events::piece(text, range, kept, text.len()).map(|(event, _)| event));
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
mod footnote_forms {
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

#[cfg(test)]
mod tag_anchors {
    #[test]
    fn hash_tags_become_anchors_outside_code() {
        let html = super::to_html("Ver #rpg/solo e #2026 e `#nao` e a#b.\n");
        assert!(
            html.contains(r##"<a class="tag" data-tag="rpg/solo">#rpg/solo</a>"##),
            "{html}"
        );
        assert!(html.contains("#2026 e"), "{html}");
        assert!(html.contains("<code>#nao</code>"), "{html}");
        assert!(html.contains("a#b"), "{html}");
    }
}

#[cfg(test)]
mod line_breaks {
    #[test]
    fn a_single_newline_inside_a_paragraph_breaks_the_line() {
        let html = super::to_html("Primeira linha.\nSegunda linha.\n\nOutro parágrafo.\n");
        assert!(
            html.contains("Primeira linha.<br />\nSegunda linha."),
            "{html}"
        );
        assert!(html.contains("<p>Outro parágrafo.</p>"), "{html}");
    }
}

#[cfg(test)]
mod callouts_and_raw_html {
    use super::to_html;

    /// Opus reading, finding 1: a raw `</blockquote>` on the title line made
    /// the nesting scan of the HTML stop early and slice backwards.
    #[test]
    fn raw_html_on_the_title_line_never_panics() {
        let html = to_html("> [!note] x </blockquote> y\n");
        assert!(
            html.contains(r#"<div class="callout" data-callout="note">"#),
            "{html}"
        );
        assert!(html.contains("</blockquote> y"), "{html}");
        let html = to_html("> [!note] a <blockquote> b\n\n> [!tip] c\n");
        assert!(html.contains(r#"data-callout="tip""#), "{html}");
    }

    /// Spec Q5, `[OPEN]` for nesting: Obsidian's public documentation shows
    /// a callout inside a callout, and the reading view draws it so,
    /// provisionally; a plain quote inside a callout stays a quote.
    #[test]
    fn a_callout_inside_a_callout_is_drawn_as_one() {
        let html = to_html(
            "> [!question] Pode entrar?\n> Talvez.\n> > [!todo] Antes\n> > Falar com o barão.\n> > > [!example]\n> > > Fundo.\n",
        );
        assert_eq!(html.matches(r#"<div class="callout""#).count(), 3, "{html}");
        for kind in ["question", "todo", "example"] {
            assert!(
                html.contains(&format!(r#"data-callout="{kind}""#)),
                "{html}"
            );
        }
        assert!(
            html.contains(r#"<p class="callout-title">Antes</p>"#),
            "{html}"
        );
        assert!(
            html.contains(r#"<p class="callout-title">Example</p>"#),
            "{html}"
        );
        assert!(
            !html.contains("[!todo]") && !html.contains("<blockquote>"),
            "{html}"
        );
        assert_eq!(html.matches("</div>").count(), 3, "{html}");

        let html = to_html("> [!note] Nota\n> > só uma citação\n");
        assert!(
            html.contains("<blockquote>\n<p>só uma citação</p>"),
            "{html}"
        );
    }

    /// A note that nests callouts without end draws the first
    /// `MAX_NESTING` of them and keeps the rest as quotes.
    #[test]
    fn nesting_stops_at_the_cap() {
        let depth = crate::callouts::MAX_NESTING + 8;
        let source: String = (1..=depth)
            .map(|k| format!("{}[!a]\n", "> ".repeat(k)))
            .collect();
        let html = to_html(&source);
        assert_eq!(
            html.matches(r#"<div class="callout""#).count(),
            crate::callouts::MAX_NESTING,
            "{html}"
        );
        assert_eq!(html.matches("<blockquote>").count(), 8, "{html}");
    }

    /// Finding 13: a `> [!` without `]` and a `^[` without `]` each rescanned
    /// the rest of the document, so many of them took quadratic time — a
    /// malformed note could hang the parser.
    ///
    /// Bounded by how the time grows, not by a time (decided 2026-10-10,
    /// `docs/reference/cross-platform-checklist.md` §5): an absolute limit
    /// of 5 s failed on a loaded Windows machine while the parser was as
    /// linear as ever. Doubling the input doubles a linear render's time
    /// and quadruples a quadratic one's, so `time(2N) / time(N) ≤ 2.5`
    /// tells them apart on any machine, fast or slow, loaded or idle.
    ///
    /// Each size is the least of `ROUNDS` runs, the least disturbed one, and
    /// the runs of the two sizes alternate: a burst of load then falls on
    /// both sizes, not on the larger only. Three runs of N followed by three
    /// of 2N failed once on the Windows machine while another machine on
    /// the same host compiled (2026-10-11: 36 ms against 353 ms, x9.83) and
    /// passed right after. Interleaved runs still failed once on the Linux
    /// machine while the desktop app synced on it (2026-10-11: 204 ms
    /// against 779 ms, x3.82), a sustained, uneven load that no single
    /// minimum escapes. So a unit over the bound is measured again from
    /// scratch, up to `ATTEMPTS` in all, and fails only if every attempt is
    /// over: a quadratic parser is over every time, a loaded machine rarely
    /// three times in a row. A doubled render under `FLOOR` is too short to
    /// measure apart from noise, and passes; above it, the clock's grain
    /// (well under a microsecond on the three systems) does not count.
    /// `VERSO_TIMING_VERBOSE=1` prints every attempt to stderr.
    #[test]
    fn pathological_inputs_stay_linear() {
        use std::time::{Duration, Instant};
        const FLOOR: Duration = Duration::from_millis(20);
        const ROUNDS: usize = 5;
        const ATTEMPTS: usize = 3;
        const BOUND: f64 = 2.5;
        let verbose = std::env::var_os("VERSO_TIMING_VERBOSE").is_some_and(|v| v == "1");
        let time = |source: &str| {
            let started = Instant::now();
            let _ = to_html(source);
            started.elapsed()
        };
        for (unit, n) in [
            ("^[", 30_000),
            ("> [!\n\n", 20_000),
            ("%%", 60_000),
            ("a %%\n\n", 20_000),
        ] {
            let (single, double) = (unit.repeat(n), unit.repeat(2 * n));
            let mut over = Vec::new();
            for attempt in 1..=ATTEMPTS {
                let (mut once, mut twice) = (Duration::MAX, Duration::MAX);
                for _ in 0..ROUNDS {
                    once = once.min(time(&single));
                    twice = twice.min(time(&double));
                }
                let ratio = twice.as_secs_f64() / once.as_secs_f64().max(1e-9);
                if verbose {
                    eprintln!(
                        "{unit:?} attempt {attempt}: {n} in {once:?}, {} in {twice:?} (least of {ROUNDS} each) — x{ratio:.2}",
                        2 * n
                    );
                }
                if twice < FLOOR || ratio <= BOUND {
                    over.clear();
                    break;
                }
                over.push(format!(
                    "attempt {attempt}: {n} in {once:?}, {} in {twice:?} — x{ratio:.2}",
                    2 * n
                ));
            }
            assert!(
                over.is_empty(),
                "{unit:?}: over x{BOUND} in all {ATTEMPTS} attempts (least of {ROUNDS} runs each), not linear; {}",
                over.join("; ")
            );
        }
    }
}

#[cfg(test)]
mod contexts {
    use super::to_html;

    /// Finding 3: `==` and `#` inside a code block, a link label or an image
    /// are code, label and alt text, not highlight and tag (invariant 12).
    #[test]
    fn code_links_and_images_are_not_scanned_for_tags_or_highlights() {
        let html = to_html(
            "```c\nif (a == b || c == d) #include\n```\n\nx `color: #fff` y\n\n[[#Porão]] e [#x](u) e ![#alt](a.png)\n",
        );
        assert!(html.contains("if (a == b || c == d) #include"), "{html}");
        assert!(!html.contains("<mark>"), "{html}");
        assert!(html.contains("<code>color: #fff</code>"), "{html}");
        assert!(!html.contains(r#"class="tag""#), "{html}");
        assert!(
            html.contains(r##"<a class="wikilink" data-target="#Porão">#Porão</a>"##),
            "{html}"
        );
        assert!(html.contains(r##"<a href="u">#x</a>"##), "{html}");
        assert!(
            html.contains(r##"<img src="a.png" alt="#alt" />"##),
            "{html}"
        );
    }

    /// Finding 5: every image's end was mapped to `</span>`, so a Markdown
    /// image swallowed the rest of its paragraph into its alt text.
    #[test]
    fn only_an_embed_ends_in_a_span() {
        let html = to_html("Veja ![foto](a.png) e mais [[Alvo]] texto.\n");
        assert!(html.contains(r#"<img src="a.png" alt="foto" />"#), "{html}");
        assert!(
            html.contains(r#"<a class="wikilink" data-target="Alvo">Alvo</a> texto.</p>"#),
            "{html}"
        );
        assert!(!html.contains("</span>"), "{html}");
    }

    /// Finding 6: the inline-footnote rewrite tracked code by counting
    /// backticks, so a closing fence left it "inside code" and a `~~~`
    /// fence, an indented block or math were not code to it.
    #[test]
    fn inline_footnotes_after_a_fence_and_never_inside_code_or_math() {
        let html = to_html(
            "```\nx\n```\n\nTexto^[a nota] fim\n\n~~~\n^[não]\n~~~\n\n    ^[nem]\n\n`^[código]` e $^[mat]$\n",
        );
        assert!(
            html.contains(
                r##"Texto<sup class="footnote-reference"><a href="#inline-1">1</a></sup> fim"##
            ),
            "{html}"
        );
        assert!(html.contains("<p>a nota</p>"), "{html}");
        assert!(html.contains("^[não]"), "{html}");
        assert!(html.contains("^[nem]"), "{html}");
        assert!(html.contains("<code>^[código]</code>"), "{html}");
        assert!(
            html.contains(r#"<span class="math">^[mat]</span>"#),
            "{html}"
        );
        assert_eq!(html.matches("footnote-definition\"").count(), 1, "{html}");
    }

    /// Finding 7: the reader enables extensions `parse` does not, and the
    /// doc has to say so. `$[[x]]$` is a link to the index and math here.
    #[test]
    fn the_reader_enables_what_parse_does_not() {
        assert_eq!(crate::parse("$[[x]]$\n").links.len(), 1);
        let html = to_html("$[[x]]$\n");
        assert!(
            html.contains(r#"<span class="math">[[x]]</span>"#),
            "{html}"
        );
        assert!(!html.contains("wikilink"), "{html}");
    }
}

#[cfg(test)]
mod hidden_comments {
    use super::to_html;

    /// Finding 16: `%%…%%` is visible only in editing view (Obsidian's
    /// documentation), so the reader drops it — inline, across lines, and
    /// a block on lines of its own — and leaves code alone.
    #[test]
    fn comments_are_hidden_outside_code() {
        let html = to_html(
            "Texto %%oculto%% visível.\n\n%%\nbloco\n%%\n\nDepois %%início\nfim%% aqui.\n\n`%%não%%` e\n\n```\n%%nem%%\n```\n",
        );
        assert!(!html.contains("oculto"), "{html}");
        assert!(html.contains("<p>Texto  visível.</p>"), "{html}");
        assert!(!html.contains("bloco"), "{html}");
        assert!(!html.contains("<p></p>"), "{html}");
        assert!(html.contains("<p>Depois  aqui.</p>"), "{html}");
        assert!(html.contains("<code>%%não%%</code>"), "{html}");
        assert!(html.contains("%%nem%%"), "{html}");
    }

    #[test]
    fn a_comment_across_paragraphs_and_an_unclosed_one() {
        let html = to_html("Antes %%\n\nmeio\n\n%% depois\n\nSó %% aberto\n");
        assert!(!html.contains("meio"), "{html}");
        assert!(html.contains("<p>Antes  depois</p>"), "{html}");
        assert!(html.contains("<p>Só %% aberto</p>"), "{html}");
        let html = to_html("linha\n%%oculto%%\nfim\n");
        assert!(html.contains("<p>linha<br />\nfim</p>"), "{html}");
    }
}

#[cfg(test)]
mod tasks {
    use super::to_html;

    fn task_lines(html: &str) -> Vec<u32> {
        html.match_indices("data-task-line=\"")
            .map(|(i, m)| {
                let rest = &html[i + m.len()..];
                let end = rest.find('"').unwrap();
                rest[..end].parse().unwrap()
            })
            .collect()
    }

    /// Each checkbox carries the 1-based line of its `[ ]` in the text
    /// given to `to_html`, frontmatter included, so the window can toggle
    /// the right line: the n-th checkbox is not the n-th `- [ ]` line once
    /// quotes, callouts and code enter.
    #[test]
    fn task_checkboxes_carry_their_source_line() {
        let source = "---\ntitle: x\n---\n- [ ] um\n\n> - [x] dois\n\n> [!note]\n> - [ ] três\n\n```\n- [ ] não\n```\n\n- [ ] quatro\n  - [x] cinco\n";
        let html = to_html(source);
        assert_eq!(task_lines(&html), [4, 6, 9, 15, 16], "{html}");
        assert_eq!(html.matches("type=\"checkbox\"").count(), 5, "{html}");
        assert!(
            html.contains(r#"<input disabled="" type="checkbox" data-task-line="4"/>"#),
            "{html}"
        );
        assert!(
            html.contains(r#"<input disabled="" type="checkbox" checked="" data-task-line="6"/>"#),
            "{html}"
        );
        assert!(html.contains(r#"data-callout="note""#), "{html}");
        assert_eq!(task_lines(&to_html("a\r\n- [ ] b\r\n")), [2]);
    }

    fn oracle_lines(html: &str) -> Vec<u32> {
        html.match_indices("data-oracle-line=\"")
            .map(|(i, m)| {
                let rest = &html[i + m.len()..];
                let end = rest.find('"').unwrap();
                rest[..end].parse().unwrap()
            })
            .collect()
    }

    /// An oracle callout carries the 1-based line of its `[!oracle]` head
    /// in the text given, frontmatter included (ADR 0102, amendment of
    /// 2026-10-31), so the reading view writes into the callout on that
    /// line and not into the n-th one: nested, after a fence that holds
    /// one, with CRLF. Any other callout carries none.
    #[test]
    fn oracle_callouts_carry_their_head_line() {
        let source = "---\ntitle: x\n---\n> [!oracle] Um?\n> **Sim**\n\n```\n> [!oracle] não\n```\n\n> [!note]\n> > [!ORACLE]- Dois?\n\n> [!oracle]\n";
        let html = to_html(source);
        assert_eq!(oracle_lines(&html), [4, 12, 14], "{html}");
        assert!(
            html.contains(r#"<div class="callout" data-callout="note">"#),
            "{html}"
        );
        assert!(
            html.contains(r#"data-callout="oracle" data-fold="-" data-oracle-line="12">"#),
            "{html}"
        );
        assert_eq!(oracle_lines(&to_html("a\r\n\r\n> [!oracle] b\r\n")), [3]);
    }

    #[test]
    fn setext_headings_are_headings_as_in_obsidian() {
        // Observed 2026-09-29: Obsidian's metadataCache parses
        // `Texto\n---` as a level-2 heading even with no blank line
        // before it, and `Texto\n===` as level 1 (fixture
        // fixtures/heading/setext). Verso never contradicts that
        // (ADR 0030); the look is the view's business, not the parser's.
        let html = to_html("Taverna\n===\n\nPorão\n---\nTexto depois.\n");
        assert!(html.contains("<h1>Taverna</h1>"), "{html}");
        assert!(html.contains("<h2>Porão</h2>"), "{html}");
        let html = to_html("Sem linha em branco\n---\n- item\n");
        assert!(html.contains("<h2>Sem linha em branco</h2>"), "{html}");
        assert!(html.contains("<li>item</li>"), "{html}");
    }

    #[test]
    fn a_block_id_is_not_shown() {
        // Observed on Obsidian 1.14.4 on 2026-10-07: the reading view drops
        // the `^id` of a paragraph, a heading and a list item, and a `^id`
        // alone after a table goes with its paragraph.
        let html = to_html(
            "Um parágrafo. ^par\n\n## Título ^tit\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n^tab\n\n- item ^it\n  - filho\n\n`código ^cod`\n\nnão ^fim é a última\n",
        );
        for id in ["^par", "^tit", "^tab", "^it"] {
            assert!(!html.contains(id), "{id}: {html}");
        }
        assert!(html.contains("<p>Um parágrafo. </p>"), "{html}");
        assert!(html.contains("<h2>Título </h2>"), "{html}");
        assert!(!html.contains("<p></p>"), "{html}");
        assert!(html.contains("<table>"), "{html}");
        assert!(html.contains("filho"), "{html}");
        assert!(html.contains("^cod"), "{html}");
        assert!(html.contains("não ^fim é a última"), "{html}");
    }

    #[test]
    fn a_break_before_a_cut_id_goes_with_it() {
        // A hard break, or a soft one, right before the id would stay as an
        // empty line at the end of the paragraph.
        assert_eq!(to_html("Texto  \n^id\n"), "<p>Texto</p>\n");
        assert_eq!(to_html("Texto\n^id\n"), "<p>Texto</p>\n");
        // One in the middle is the text's own.
        assert_eq!(to_html("Um  \ndois ^id\n"), "<p>Um<br />\ndois </p>\n");
        // A tight list item has no paragraph: the same there.
        assert_eq!(
            to_html("- Texto  \n  ^id\n- dois\n"),
            "<ul>\n<li>Texto</li>\n<li>dois</li>\n</ul>\n"
        );
        assert_eq!(
            to_html("- a\n  - b\n  ^x\n"),
            "<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>\n"
        );
        // The break sits before a nested list: it goes as the list opens.
        assert_eq!(
            to_html("- Texto  \n  ^id\n  - filho\n"),
            "<ul>\n<li>Texto\n<ul>\n<li>filho</li>\n</ul>\n</li>\n</ul>\n"
        );
    }

    #[test]
    fn to_html_with_renders_as_to_html() {
        let source = "Um parágrafo. ^par\n\n## Título ^tit\n\n- item ^it\n";
        assert_eq!(
            super::to_html_with(source, &crate::parse(source)),
            to_html(source)
        );
    }
}
