// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Full-text search: accents and case folded by the tokenizer (ADR 0046,
//! provisional), and the FTS5 grammar never reached by the user's words
//! (feature 3 guardrail, ADR 0029).

use verso_index::{Index, NoteStamp};

#[cfg(test)]
mod support {
    use super::*;
    pub fn put(index: &mut Index, path: &str, content: &str) {
        let report = verso_dialect::parse(content);
        index
            .upsert(
                path,
                NoteStamp {
                    modified: 1,
                    len: 1,
                    hash: 1,
                },
                content,
                &report,
            )
            .unwrap();
    }
}
use support::*;

#[test]
fn accents_and_case_do_not_matter() {
    let mut index = Index::in_memory().unwrap();
    put(
        &mut index,
        "a.md",
        "O Café São João fica na Ilha da Preguiça.\n",
    );
    put(&mut index, "b.md", "Nada aqui.\n");
    for q in ["cafe", "CAFÉ", "café são", "preguica ilha"] {
        let hits = index.search(q, 10).unwrap();
        assert_eq!(hits.len(), 1, "{q}: {hits:?}");
        assert_eq!(hits[0].path, "a.md");
    }
    assert!(index.search("taverna", 10).unwrap().is_empty());
    assert!(index.search("   ", 10).unwrap().is_empty());
}

#[test]
fn the_fts5_grammar_is_never_reached_by_a_query() {
    let mut index = Index::in_memory().unwrap();
    put(
        &mut index,
        "a.md",
        "texto com aspas \" e NOT e col: e (parenteses) e asterisco* e -menos e ^circunflexo e NEAR(x y)\n",
    );
    put(&mut index, "b.md", "outro texto\n");
    let paths = |hits: Vec<verso_index::Hit>| {
        let mut p: Vec<String> = hits.into_iter().map(|h| h.path).collect();
        p.sort();
        p
    };
    // Every operator of the FTS5 grammar (memo §6.3.4), as a word: no
    // error, and it matches the note that contains it as text — or nothing,
    // never "everything except" or a prefix.
    for (q, expected) in [
        ("NOT", vec!["a.md"]),
        ("col:", vec!["a.md"]),
        ("col:texto", vec![]),
        ("(parenteses)", vec!["a.md"]),
        ("(", vec![]),
        ("asterisco*", vec!["a.md"]),
        ("*", vec![]),
        ("aster*", vec![]),
        ("-menos", vec!["a.md"]),
        ("-texto", vec!["a.md", "b.md"]),
        ("^circunflexo", vec!["a.md"]),
        ("^", vec![]),
        ("NEAR(x y)", vec!["a.md"]),
        ("\"", vec![]),
        ("a\"b", vec![]),
        ("texto OR", vec![]),
        ("texto AND outro", vec![]),
        ("ca\u{0}fe", vec![]),
        ("tex\u{0}to", vec!["a.md", "b.md"]),
    ] {
        let r = index.search(q, 10);
        assert!(r.is_ok(), "{q}: {r:?}");
        assert_eq!(paths(r.unwrap()), expected, "{q}");
    }
    // `texto OR` requires both words; `OR` is a word here and no note
    // contains the token `or` (`outro` is one token), so nothing matches.
    // A snippet marks the match.
    let hits = index.search("aspas", 10).unwrap();
    assert!(hits[0].snippet.contains("[aspas]"), "{hits:?}");
}

#[test]
fn an_index_file_is_private_and_survives_reopening() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir
        .path()
        .join("sub")
        .join(Index::file_name_for(std::path::Path::new("/Users/x/Vault")));
    {
        let mut index = Index::open(&file).unwrap();
        put(&mut index, "a.md", "persistente");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            std::fs::metadata(dir.path().join("sub"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
    }
    let index = Index::open(&file).unwrap();
    assert_eq!(index.notes().unwrap(), vec!["a.md"]);
    assert_eq!(index.search("persistente", 10).unwrap().len(), 1);
    assert!(
        file.file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("Vault-")
    );
}

#[test]
fn a_note_is_found_by_its_name_even_when_the_body_never_says_it() {
    // Seen in the window on 2026-09-22: "Coroa Afogada" gave no hit for the
    // note of that name, whose body lists characters. The title — first
    // heading, or the file name — is indexed too, as in Obsidian.
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "RPG/A Coroa Afogada.md", "- Vax\n- Vincent\n");
    put(&mut index, "Outra.md", "# Título próprio\n\nsem nome\n");
    let hits = index.search("coroa afogada", 10).unwrap();
    assert_eq!(hits.len(), 1, "{hits:?}");
    assert_eq!(hits[0].path, "RPG/A Coroa Afogada.md");
    assert!(hits[0].snippet.contains("[Coroa]"), "{}", hits[0].snippet);
    assert_eq!(index.search("título próprio", 10).unwrap().len(), 1);
    // Replacing and removing keep the FTS in step with the title column;
    // a first heading that names the note otherwise does not hide its file
    // name (the maintainer, 2026-10-09: the file name first).
    put(
        &mut index,
        "RPG/A Coroa Afogada.md",
        "# Renomeada\n\ncorpo\n",
    );
    let hits = index.search("coroa", 10).unwrap();
    assert_eq!(hits.len(), 1, "{hits:?}");
    assert_eq!(hits[0].snippet, "", "found by its name alone");
    assert_eq!(index.search("renomeada", 10).unwrap().len(), 1);
    assert!(index.remove("RPG/A Coroa Afogada.md").unwrap());
    index.check().unwrap();
}

#[test]
fn the_file_name_comes_first_then_the_content() {
    // The maintainer, 2026-10-09: a note was found by its exact name only
    // when another note linked to it; the name comes first, the content
    // after.
    let mut index = Index::in_memory().unwrap();
    put(
        &mut index,
        "Sessões/Mapa do Porto.md",
        "# Porto de Vex\n\nruas e docas\n",
    );
    put(
        &mut index,
        "Diário.md",
        "Vimos o mapa do porto ontem, e de novo o mapa do porto.\n",
    );
    put(&mut index, "Mapa.md", "nada a ver\n");
    put(&mut index, "Porto.md", "um mapa antigo\n");
    put(&mut index, "Velho Mapa do Porto Sul.md", "rascunho\n");
    let paths: Vec<String> = index
        .search("mapa do porto", 10)
        .unwrap()
        .into_iter()
        .map(|h| h.path)
        .collect();
    assert_eq!(
        paths,
        [
            "Sessões/Mapa do Porto.md",
            "Velho Mapa do Porto Sul.md",
            "Diário.md"
        ]
    );
    // Accents and case, as in the content; a canvas by its name too.
    put(&mut index, "Tour do Verso.canvas", "");
    let hits = index.search("TOUR", 10).unwrap();
    assert_eq!(hits[0].path, "Tour do Verso.canvas", "{hits:?}");
    assert_eq!(index.search("diario", 10).unwrap()[0].path, "Diário.md");
    // The limit counts both kinds.
    assert_eq!(index.search("mapa", 2).unwrap().len(), 2);
}

#[test]
fn tags_come_from_the_frontmatter_and_the_body_outside_code() {
    let mut index = Index::in_memory().unwrap();
    put(
        &mut index,
        "a.md",
        "---\ntags: [Campanha, npc]\n---\nTexto #sessão e #npc, não #123 nem x#y.\n```\n#codigo\n```\n",
    );
    put(&mut index, "b.md", "#campanha (#npc)\n");
    let tags = index.tags().unwrap();
    let names: Vec<(&str, usize)> = tags.iter().map(|(n, ps)| (n.as_str(), ps.len())).collect();
    assert_eq!(
        names,
        [("campanha", 2), ("npc", 2), ("sessão", 1)],
        "{tags:?}"
    );
    assert_eq!(tags[0].1, ["a.md", "b.md"]);
}

/// Opus reading of Phase 2, finding 14: the index scanned raw lines, so a
/// link destination, a code span, a YAML comment in the frontmatter and an
/// indented code line produced tags the reader never showed. One rule now,
/// `verso_dialect::body_tags`, for both.
#[test]
fn tags_ignore_links_code_and_frontmatter_comments() {
    let mut index = Index::in_memory().unwrap();
    put(
        &mut index,
        "a.md",
        "---\n#naotag\ntags: [Real]\n---\n[a seção](#Minha-Secao) e ` #codigo` e #Corpo\n\n    #indentado\n",
    );
    let tags = index.tags().unwrap();
    let names: Vec<&str> = tags.iter().map(|(n, _)| n.as_str()).collect();
    assert_eq!(names, ["corpo", "real"], "{tags:?}");
}

#[test]
fn a_name_is_found_by_any_part_and_stays_in_step_with_moves_and_removals() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "Capitão Ruy.md", "# Outro\n");
    put(&mut index, "a.md", "x\n");
    let paths = |index: &Index, q: &str| -> Vec<String> {
        index
            .search(q, 10)
            .unwrap()
            .into_iter()
            .map(|h| h.path)
            .collect()
    };
    // Through the trigrams (three letters or more), and through the scan
    // (shorter words only), the same answer.
    assert_eq!(paths(&index, "pitã"), ["Capitão Ruy.md"]);
    assert_eq!(paths(&index, "ru"), ["Capitão Ruy.md"]);
    assert_eq!(paths(&index, "ca ruy"), ["Capitão Ruy.md"]);
    assert_eq!(paths(&index, "\"pit"), Vec::<String>::new());
    assert!(index.rekey("Capitão Ruy.md", "npcs/Barão Vex.md").unwrap());
    assert!(paths(&index, "capitao").is_empty());
    assert_eq!(paths(&index, "barao"), ["npcs/Barão Vex.md"]);
    assert!(index.remove("npcs/Barão Vex.md").unwrap());
    assert!(paths(&index, "barao").is_empty());
    index.check().unwrap();
}

#[test]
fn a_word_most_names_hold_gives_the_same_order_as_a_rare_one() {
    // Past 512 names the trigrams give way to a scan: the answer is the same.
    let mut index = Index::in_memory().unwrap();
    for i in 0..600 {
        put(&mut index, &format!("Sessões/Sessão {i:03}.md"), "x\n");
    }
    put(&mut index, "Sessão.md", "x\n");
    let paths = |q: &str, limit: usize| -> Vec<String> {
        index
            .search(q, limit)
            .unwrap()
            .into_iter()
            .map(|h| h.path)
            .collect()
    };
    assert_eq!(
        paths("sessao", 3),
        [
            "Sessão.md",
            "Sessões/Sessão 000.md",
            "Sessões/Sessão 001.md"
        ]
    );
    assert_eq!(paths("sessão 599", 3), ["Sessões/Sessão 599.md"]);
    assert_eq!(paths("sessao", 1000).len(), 601);
}

#[test]
fn the_notes_holding_a_phrase_are_the_candidates_of_a_mention() {
    // ADR 0089 item 1: the index's candidates, by the name as a phrase,
    // accents and case folded as the search folds them; the scan that
    // follows keeps the accents.
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "a.md", "Fomos ao Porto Alegre ontem.\n");
    put(&mut index, "b.md", "Alegre, voltamos do porto.\n");
    put(&mut index, "c.md", "O PÔRTO ALEGRE de antes.\n");
    put(&mut index, "d.md", "Nada aqui.\n");
    let mut found = index.notes_holding("Porto Alegre", 10).unwrap();
    found.sort();
    assert_eq!(found, ["a.md", "c.md"]);
    // The words are a phrase, never the grammar.
    assert!(index.notes_holding("\" OR nada", 10).unwrap().is_empty());
    assert!(index.notes_holding("!!!", 10).unwrap().is_empty());
    assert!(index.notes_holding("", 10).unwrap().is_empty());
    assert_eq!(index.notes_holding("porto", 1).unwrap().len(), 1);
}

/// Spec Q22 b, decided 2026-10-21: a nested tag also counts for the tags
/// above it, as Obsidian 1.13.7's tag pane does (`#a` 2, `#a/b` 1 for one
/// note of `#a` and one of `#a/b`).
#[test]
fn a_nested_tag_counts_for_the_tags_above_it() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "n.md", "Corpo #a/b/c e #alpha\n");
    put(&mut index, "f.md", "Corpo #a\n");
    let tags = index.tags().unwrap();
    let count = |name: &str| tags.iter().find(|(n, _)| n == name).map(|(_, p)| p.clone());
    assert_eq!(count("a"), Some(vec!["f.md".to_owned(), "n.md".to_owned()]));
    assert_eq!(count("a/b"), Some(vec!["n.md".to_owned()]));
    assert_eq!(count("a/b/c"), Some(vec!["n.md".to_owned()]));
    assert_eq!(count("alpha"), Some(vec!["n.md".to_owned()]));
}

/// Spec Q22 c and Q24 b, decided 2026-10-21 and observed on Obsidian
/// 1.13.7: a `#` in a frontmatter tag is no part of its name, and only a
/// string is a tag. DL.2 = B (maintainer, 2026-10-21), knowingly unlike
/// Obsidian: an integer or a string of digits is the tag of its text
/// (`tags: 2024`, `[2025, yes]`); a boolean or a float is none.
#[test]
fn frontmatter_tags_drop_the_hash_and_a_number_is_its_text() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "h.md", "---\ntags: [\"#ideia\"]\n---\n");
    put(&mut index, "p.md", "---\ntags: [ideia]\n---\n");
    put(&mut index, "n.md", "---\ntags: 2024\n---\n");
    put(
        &mut index,
        "m.md",
        "---\ntags: [2025, yes, true, 1.5, \"7\", x/y]\n---\n",
    );
    let tags = index.tags().unwrap();
    let mut names: Vec<&str> = tags.iter().map(|(n, _)| n.as_str()).collect();
    names.sort_unstable();
    assert_eq!(
        names,
        ["2024", "2025", "7", "ideia", "x", "x/y", "yes"],
        "{tags:?}"
    );
    let ideia = tags.iter().find(|(n, _)| n == "ideia").unwrap();
    assert_eq!(ideia.1, ["h.md", "p.md"]);
}
