// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `body_tags`: the one rule for `#tag` in a note's body, shared by the
//! reader and the index (Opus reading of Phase 2, finding 14). Provisional:
//! what a tag is stays Q13 and Q22.

use verso_dialect::body_tags;

#[test]
fn tags_are_found_in_prose_only() {
    let source = "---\ntags: [x]\n# naotag\n---\n# Título #cabecalho\n\nTexto #sessão e (#npc) e #123 e x#y e [a seção](#Minha-Secao) e ` #codigo` e [[#Porão]] e [#label](u) e ![#alt](a.png) e $#mat$ e <span>#html</span> #depois %%#oculto%%\n\n```\n#fence\n```\n\n    #indentado\n\n- #item\n\n> #citado\n\n| #cel |\n|---|\n\n<div>\n#bloco\n</div>\n";
    let tags = body_tags(source);
    let names: Vec<&str> = tags.iter().map(|t| t.name.as_str()).collect();
    assert_eq!(
        names,
        [
            "cabecalho",
            "sessão",
            "npc",
            "depois",
            "item",
            "citado",
            "cel"
        ],
        "{tags:?}"
    );
    for tag in &tags {
        assert_eq!(
            tag.span.slice(source),
            Some(format!("#{}", tag.name).as_str()),
            "{tag:?}"
        );
    }
}

#[test]
fn the_syntax_is_the_one_the_index_accepted() {
    // At the start, after a space or `(`; letters, digits, `_`, `-`, `/`;
    // not digits only; case as written.
    let names = |s: &str| -> Vec<String> { body_tags(s).into_iter().map(|t| t.name).collect() };
    assert_eq!(
        names("#rpg/solo #Um_dois-3 #2026 a#b\n"),
        ["rpg/solo", "Um_dois-3"]
    );
    assert_eq!(names("#\n# \n#-\n"), ["-"]);
    assert!(names("\\#nao e &amp;#nem\n").is_empty());
}

#[test]
fn a_frontmatter_tag_is_a_string_or_an_integer_without_its_hash() {
    use verso_dialect::{Value, frontmatter_tag};
    let s = |t: &str| Value::String(t.to_owned());
    assert_eq!(frontmatter_tag(&s("#ideia")), Some("ideia".to_owned()));
    assert_eq!(frontmatter_tag(&s("ideia")), Some("ideia".to_owned()));
    assert_eq!(frontmatter_tag(&s("Rpg/Solo")), Some("Rpg/Solo".to_owned()));
    // DL.2 = B (maintainer, 2026-10-21): a number is the tag of its text,
    // knowingly unlike Obsidian.
    assert_eq!(frontmatter_tag(&s("2024")), Some("2024".to_owned()));
    assert_eq!(frontmatter_tag(&s("#")), None);
    assert_eq!(
        frontmatter_tag(&Value::Integer(2024)),
        Some("2024".to_owned())
    );
    assert_eq!(frontmatter_tag(&Value::Integer(-3)), None);
    assert_eq!(frontmatter_tag(&Value::Float(1.5)), None);
    assert_eq!(frontmatter_tag(&Value::Bool(true)), None);
    assert_eq!(frontmatter_tag(&Value::Null), None);
}

/// Spec Q24 a: a byte order mark before the `---` does not hide the
/// frontmatter from the reader, the tags or the properties; the spans still
/// slice the source.
#[test]
fn a_byte_order_mark_before_the_frontmatter_is_skipped() {
    let source = "\u{feff}---\ntags: [x]\n---\n\nTexto #um [[alvo]]\n";
    let document = verso_dialect::parse(source);
    let frontmatter = document.frontmatter.as_ref().unwrap();
    assert_eq!(frontmatter.span.start, 3);
    assert_eq!(frontmatter.span.slice(source), Some("---\ntags: [x]\n---"));
    let names: Vec<String> = body_tags(source).into_iter().map(|t| t.name).collect();
    assert_eq!(names, ["um"]);
    assert_eq!(document.links[0].span.slice(source), Some("[[alvo]]"));
    let html = verso_dialect::to_html(source);
    assert!(!html.contains("tags: [x]"), "{html}");
    assert!(!html.contains("<hr"), "{html}");
}
