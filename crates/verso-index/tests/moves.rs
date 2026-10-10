// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A note's row following a move, and what a plan to follow it asks:
//! resolution from a given source, the notes naming a key (ADR 0048,
//! provisional; ADR 0043 decision 2 for the placeholder's last version).

use verso_index::{Index, NoteStamp};

#[cfg(test)]
mod support {
    use super::*;

    pub fn stamp(n: i64) -> NoteStamp {
        NoteStamp {
            modified: n,
            len: 1,
            hash: 7,
        }
    }

    pub fn put(index: &mut Index, path: &str, content: &str) {
        let report = verso_dialect::parse(content);
        index.upsert(path, stamp(1), content, &report).unwrap();
    }
}
use support::*;

#[test]
fn rekey_moves_the_row_with_everything_it_knows() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "Alvo.md", "# Alvo\n");
    put(
        &mut index,
        "pasta/X.md",
        "## Secção\n\npalavraunica [[Alvo]] ^b1\n",
    );
    // Evicted after it was indexed: the last known version, unverified.
    index.mark_placeholder("pasta/X.md").unwrap();
    assert!(index.rekey("pasta/X.md", "nova/X.md").unwrap());
    assert_eq!(index.notes().unwrap(), vec!["Alvo.md", "nova/X.md"]);
    // Search, links, backlinks, headings, blocks, the stamp and the mark
    // all travelled with the row.
    assert_eq!(
        index.search("palavraunica", 10).unwrap()[0].path,
        "nova/X.md"
    );
    assert_eq!(
        index.links_of("nova/X.md").unwrap()[0].resolved.as_deref(),
        Some("Alvo.md")
    );
    assert_eq!(index.backlinks("Alvo.md").unwrap()[0].from, "nova/X.md");
    assert_eq!(index.headings_of("nova/X.md").unwrap()[0].text, "Secção");
    assert_eq!(index.blocks_of("nova/X.md").unwrap()[0].id, "b1");
    assert_eq!(index.stamp_of("nova/X.md").unwrap(), Some(stamp(1)));
    assert_eq!(index.is_unverified("nova/X.md").unwrap(), Some(true));
    assert_eq!(index.stamp_of("pasta/X.md").unwrap(), None);
    index.check().unwrap();
    // Unknown source: nothing to move.
    assert!(!index.rekey("pasta/X.md", "outra.md").unwrap());
}

#[test]
fn rekey_renames_a_title_that_was_the_file_name_and_replaces_a_stale_row() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "Velha.md", "sem heading\n");
    put(&mut index, "Com Heading.md", "# Título escrito\n");
    // A row left behind at the destination (deleted outside, not yet
    // re-indexed) gives way to the moved note.
    put(&mut index, "Nova.md", "restos\n");
    assert!(index.rekey("Velha.md", "Nova.md").unwrap());
    assert_eq!(index.notes().unwrap(), vec!["Com Heading.md", "Nova.md"]);
    assert_eq!(index.search("nova", 10).unwrap()[0].path, "Nova.md");
    assert!(index.search("velha", 10).unwrap().is_empty());
    assert!(index.search("restos", 10).unwrap().is_empty());
    // A title written in the note is kept whatever the file is called.
    assert!(index.rekey("Com Heading.md", "Outro Nome.md").unwrap());
    assert_eq!(
        index.search("escrito", 10).unwrap()[0].path,
        "Outro Nome.md"
    );
    // Found by its new file name, with no excerpt: the content's title is
    // still the heading (the file name first, the maintainer, 2026-10-09).
    let hits = index.search("outro", 10).unwrap();
    assert_eq!(hits.len(), 1, "{hits:?}");
    assert_eq!(hits[0].snippet, "");
    index.check().unwrap();
}

#[test]
fn rekey_reads_the_relative_links_of_the_moved_note_from_its_new_folder() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "a/sub/nota.md", "A.\n");
    put(&mut index, "b/sub/nota.md", "B.\n");
    put(&mut index, "a/src.md", "[[sub/nota]]\n");
    assert_eq!(
        index.links_of("a/src.md").unwrap()[0].resolved.as_deref(),
        Some("a/sub/nota.md")
    );
    assert!(index.rekey("a/src.md", "b/src.md").unwrap());
    // The same text, another folder: the path is read from there now.
    assert_eq!(
        index.links_of("b/src.md").unwrap()[0].resolved.as_deref(),
        Some("b/sub/nota.md")
    );
    assert_eq!(index.backlinks("a/sub/nota.md").unwrap().len(), 0);
}

#[test]
fn resolve_from_applies_the_rule_of_the_queries() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "a/Alvo.md", "a\n");
    put(&mut index, "b/Alvo.md", "b\n");
    put(&mut index, "c/d/Alvo.md", "fundo\n");
    put(&mut index, "a/X.md", "[[Alvo]]\n");
    fn resolved(index: &Index, source: &str, target: &str) -> Option<String> {
        index.resolve_from(source, target).unwrap()
    }
    let from = |source: &str, target: &str| resolved(&index, source, target);
    // A bare name: the source's own folder first, then the fewest
    // segments, then byte order; a path from the source's folder.
    assert_eq!(from("a/X.md", "Alvo").as_deref(), Some("a/Alvo.md"));
    assert_eq!(from("z/Y.md", "Alvo").as_deref(), Some("a/Alvo.md"));
    assert_eq!(from("c/Y.md", "d/Alvo").as_deref(), Some("c/d/Alvo.md"));
    assert_eq!(from("a/X.md", "../b/Alvo.md").as_deref(), Some("b/Alvo.md"));
    assert_eq!(from("Y.md", "B/ALVO").as_deref(), Some("b/Alvo.md"));
    // The source need not be indexed; its folder is what the rule reads.
    assert_eq!(from("b/Novo.md", "Alvo").as_deref(), Some("b/Alvo.md"));
    // The note itself, not a name, nothing.
    assert_eq!(from("a/X.md", "").as_deref(), Some("a/X.md"));
    assert_eq!(from("a/X.md", "nota/"), None);
    assert_eq!(from("a/X.md", "Nada"), None);
    // The answer is the one `links_of` gives for the same link.
    assert_eq!(
        index.links_of("a/X.md").unwrap()[0].resolved,
        from("a/X.md", "Alvo")
    );
    // A path from the root comes before a bare name: a root `Alvo.md`
    // takes `[[Alvo]]` from every folder, its own sibling included.
    put(&mut index, "Alvo.md", "raiz\n");
    assert_eq!(
        resolved(&index, "a/X.md", "Alvo").as_deref(),
        Some("Alvo.md")
    );
    assert_eq!(
        index.links_of("a/X.md").unwrap()[0].resolved,
        resolved(&index, "a/X.md", "Alvo")
    );
}

#[test]
fn links_naming_lists_the_notes_whose_links_name_a_key_by_any_reading() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "a/Alvo.md", "x\n");
    put(&mut index, "Um.md", "[[Alvo]] [[Outra]]\n");
    put(&mut index, "a/Dois.md", "[[Alvo]]\n");
    put(&mut index, "Tres.md", "[[a/Alvo|apelido]]\n");
    put(&mut index, "Quatro.md", "![[Mapa.PNG]] ![[img/mapa.png]]\n");
    put(&mut index, "Cinco.md", "nada\n");
    let naming = |keys: &[&str]| {
        index
            .links_naming(&keys.iter().map(|k| (*k).to_owned()).collect::<Vec<_>>())
            .unwrap()
    };
    // By bare name, as written, and by the path read from the source's
    // folder (`[[Alvo]]` in `a/` is also `a/alvo`).
    assert_eq!(naming(&["alvo"]), vec!["Um.md", "a/Dois.md"]);
    assert_eq!(naming(&["a/alvo"]), vec!["Tres.md", "a/Dois.md"]);
    assert_eq!(
        naming(&["alvo", "a/alvo"]),
        vec!["Tres.md", "Um.md", "a/Dois.md"]
    );
    // A file's name, folded, extension kept.
    assert_eq!(naming(&["mapa.png"]), vec!["Quatro.md"]);
    assert_eq!(naming(&["img/mapa.png"]), vec!["Quatro.md"]);
    assert!(naming(&["ninguém"]).is_empty());
    assert!(naming(&[]).is_empty());
}
