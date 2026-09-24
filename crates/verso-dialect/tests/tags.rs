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
