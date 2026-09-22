// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Links, backlinks and unresolved targets, resolved by the rule observed
//! in Obsidian 1.13.7 on 2026-09-22 (provisional, spec Q12/Q8/Q2/Q14;
//! `docs/reference/index-decision.md`).

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

    /// The sandbox of 2026-09-22, as observed through the Obsidian CLI.
    pub fn sandbox() -> Index {
        let mut index = Index::in_memory().unwrap();
        put(&mut index, "a/dup.md", "Alvo A.\n");
        put(&mut index, "b/dup.md", "Alvo B.\n");
        put(
            &mut index,
            "Alvo.md",
            "---\naliases: [apelido]\n---\nCom alias.\n",
        );
        put(
            &mut index,
            "src.md",
            "Links: [[dup]] [[a/dup]] [[alvo]] [[ALVO]] [[apelido]] [[Alvo.md]] [[nao-existe]] ![[Alvo]] [[Alvo#Heading]] [[b/dup|alias b]].\n",
        );
        index
    }
}
use support::*;

#[test]
fn resolution_matches_what_obsidian_did() {
    let index = sandbox();
    let links = index.links_of("src.md").unwrap();
    let resolved: Vec<(String, Option<String>)> = links
        .iter()
        .map(|l| (l.target.clone(), l.resolved.clone()))
        .collect();
    assert_eq!(
        resolved,
        vec![
            ("dup".into(), Some("a/dup.md".into())), // ambiguous: first by path
            ("a/dup".into(), Some("a/dup.md".into())), // path from the root
            ("alvo".into(), Some("Alvo.md".into())), // case-insensitive
            ("ALVO".into(), Some("Alvo.md".into())),
            ("apelido".into(), None), // an alias does not resolve
            ("Alvo.md".into(), Some("Alvo.md".into())), // explicit extension
            ("nao-existe".into(), None),
            ("Alvo".into(), Some("Alvo.md".into())), // the embed
            ("Alvo".into(), Some("Alvo.md".into())), // heading link counts for the note
            ("b/dup".into(), Some("b/dup.md".into())),
        ]
    );
    assert!(links[7].embed);
    assert_eq!(links[8].heading.as_deref(), Some("Heading"));
    assert_eq!(links[9].alias.as_deref(), Some("alias b"));
}

#[test]
fn backlinks_count_embeds_and_heading_links_and_come_with_positions() {
    let index = sandbox();
    let back = index.backlinks("Alvo.md").unwrap();
    assert_eq!(back.len(), 5, "{back:?}");
    assert!(back.iter().all(|b| b.from == "src.md"));
    assert_eq!(back.iter().filter(|b| b.embed).count(), 1);
    assert_eq!(back[0].line, 1);
    assert_eq!(index.backlinks("a/dup.md").unwrap().len(), 2);
    assert_eq!(index.backlinks("b/dup.md").unwrap().len(), 1);
    assert!(index.backlinks("nao-existe.md").unwrap().is_empty());
}

#[test]
fn unresolved_targets_are_listed_with_counts() {
    let index = sandbox();
    let un = index.unresolved().unwrap();
    let texts: Vec<(String, u64)> = un.iter().map(|u| (u.target.clone(), u.count)).collect();
    assert_eq!(texts, vec![("apelido".into(), 1), ("nao-existe".into(), 1)]);
}

#[test]
fn removing_a_note_makes_links_to_it_unresolved_and_reindexing_replaces() {
    let mut index = sandbox();
    assert!(index.remove("Alvo.md").unwrap());
    assert!(!index.remove("Alvo.md").unwrap());
    assert!(
        index
            .unresolved()
            .unwrap()
            .iter()
            // Five spellings (`alvo`, `ALVO`, `Alvo.md`, `Alvo`, `Alvo`),
            // one row: the smallest in byte order names it.
            .any(|u| u.target == "ALVO" && u.count == 5)
    );
    put(&mut index, "src.md", "Only [[b/dup]] now.\n");
    assert_eq!(index.links_of("src.md").unwrap().len(), 1);
    assert_eq!(
        index.notes().unwrap(),
        vec!["a/dup.md", "b/dup.md", "src.md"]
    );
}

#[test]
fn nfc_and_nfd_names_meet() {
    let mut index = Index::in_memory().unwrap();
    // The file is stored NFD (as HFS+ or some sync clients leave it); the link is typed NFC.
    put(&mut index, "Sessa\u{303}o 3.md", "x");
    put(&mut index, "src.md", "[[Sess\u{e3}o 3#^juramento]]");
    let back = index.backlinks("Sessa\u{303}o 3.md").unwrap();
    assert_eq!(back.len(), 1);
}

#[test]
fn stamp_round_trips_and_title_comes_from_the_first_h1() {
    let mut index = Index::in_memory().unwrap();
    let report = verso_dialect::parse("# Taverna\n\ntexto");
    let stamp = NoteStamp {
        modified: 1_700_000_000,
        len: 17,
        hash: u64::MAX - 5,
    };
    index
        .upsert("t.md", stamp, "# Taverna\n\ntexto", &report)
        .unwrap();
    assert_eq!(index.stamp_of("t.md").unwrap(), Some(stamp));
    assert_eq!(index.stamp_of("nao.md").unwrap(), None);
}

#[test]
fn a_placeholder_keeps_the_last_version_unverified_and_stays_a_link_target() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "Alvo.md", "conteudo real");
    put(&mut index, "src.md", "[[Alvo]] e [[Nunca Baixada]]");
    // Alvo is evicted: its last version stays, marked unverified.
    assert!(index.mark_placeholder("Alvo.md").unwrap());
    assert_eq!(index.is_unverified("Alvo.md").unwrap(), Some(true));
    assert_eq!(index.search("conteudo", 10).unwrap().len(), 1);
    assert_eq!(index.backlinks("Alvo.md").unwrap().len(), 1);
    // A note only ever seen as a placeholder: an empty unverified row, so
    // the link to it resolves and it is not listed as unresolved.
    assert!(!index.mark_placeholder("Nunca Baixada.md").unwrap());
    assert_eq!(index.backlinks("Nunca Baixada.md").unwrap().len(), 1);
    assert!(index.unresolved().unwrap().is_empty());
    // Downloaded and read again: verified.
    put(&mut index, "Alvo.md", "conteudo novo");
    assert_eq!(index.is_unverified("Alvo.md").unwrap(), Some(false));
    assert_eq!(index.is_unverified("x.md").unwrap(), None);
}

#[test]
fn the_index_records_its_folder_and_last_run() {
    let mut index = Index::in_memory().unwrap();
    assert_eq!(index.root().unwrap(), None);
    index.set_root("/Users/x/Vault", 1_700_000_000).unwrap();
    index.set_root("/Users/x/Vault", 1_700_000_001).unwrap();
    assert_eq!(index.root().unwrap().as_deref(), Some("/Users/x/Vault"));
}

#[test]
fn a_target_ending_in_a_multibyte_character_does_not_panic() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "\u{1f37b}.md", "Cerveja.\n");
    put(
        &mut index,
        "src.md",
        "Vamos ao [[Bar \u{1f37b}]] e ao [[\u{1f37b}]] hoje.\n",
    );
    let links = index.links_of("src.md").unwrap();
    assert_eq!(links[0].resolved, None);
    assert_eq!(links[1].resolved.as_deref(), Some("\u{1f37b}.md"));
    assert_eq!(index.backlinks("\u{1f37b}.md").unwrap().len(), 1);
    assert_eq!(index.unresolved().unwrap()[0].target, "Bar \u{1f37b}");
}

#[test]
fn a_link_to_a_heading_of_the_same_note_is_not_a_missing_file() {
    let mut index = Index::in_memory().unwrap();
    put(
        &mut index,
        "t.md",
        "# T\n\n[[#T]] e [[#Outra]] e [[#^id]]\n",
    );
    put(&mut index, "u.md", "[[#T]]\n");
    assert!(index.unresolved().unwrap().is_empty());
    // Resolved to the note itself; not a backlink of itself.
    let links = index.links_of("t.md").unwrap();
    assert!(links.iter().all(|l| l.resolved.as_deref() == Some("t.md")));
    assert!(index.backlinks("t.md").unwrap().is_empty());
}

#[test]
fn a_case_collision_of_two_paths_resolves_to_the_first_in_byte_order() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "x/nota.md", "minúscula\n");
    put(&mut index, "x/Nota.md", "Maiúscula\n");
    put(&mut index, "src.md", "[[x/nota]]\n");
    assert_eq!(
        index.links_of("src.md").unwrap()[0].resolved.as_deref(),
        Some("x/Nota.md")
    );
}

#[test]
fn headings_and_blocks_come_back_with_positions() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "n.md", "# Título\n\ntexto ^abc\n\n## Sub\n");
    let h = index.headings_of("n.md").unwrap();
    assert_eq!(h.len(), 2);
    assert_eq!(
        (h[0].level, h[0].text.as_str(), h[0].line, h[0].col),
        (1, "Título", 1, 1)
    );
    assert_eq!((h[1].level, h[1].line), (2, 5));
    let b = index.blocks_of("n.md").unwrap();
    assert_eq!(b.len(), 1);
    assert_eq!((b[0].id.as_str(), b[0].line), ("abc", 3));
    assert!(index.headings_of("nope.md").unwrap().is_empty());
}
