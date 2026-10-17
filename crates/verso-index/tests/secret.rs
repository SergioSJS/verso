// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Secret blocks in the one index (ADR 0087 item 6): the secret text is
//! searched apart and a reader's questions never reach it — search and
//! its excerpts, links, backlinks, the graph, tags, headings, ids, the
//! text — and a reader's lines are the projection's. Those who may write
//! still find everything.

use verso_index::{Index, NoteStamp};

#[cfg(test)]
fn stamp(modified: i64) -> NoteStamp {
    NoteStamp {
        modified,
        len: 1,
        hash: 7,
    }
}

#[cfg(test)]
fn put(index: &mut Index, path: &str, content: &str, modified: i64) {
    index
        .upsert(
            path,
            stamp(modified),
            content,
            &verso_dialect::parse(content),
        )
        .unwrap();
}

const TAVERNA: &str = "# Taverna\n\nO barão governa. [[Barão]] #publico\n\n> [!secret] Segredo\n> # Cripta\n> Ele está morto: [[Vampiro]] ![[Mapa]] #morto zumbificado\n> ^cripta\n\nFim: [[Porto]] ^fim\n";

#[cfg(test)]
fn folder() -> Index {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "Taverna.md", TAVERNA, 1);
    for name in ["Barão", "Vampiro", "Mapa", "Porto"] {
        put(&mut index, &format!("{name}.md"), &format!("# {name}\n"), 1);
    }
    index
}

#[test]
fn a_reader_s_search_finds_nothing_only_a_secret_block_holds() {
    let index = folder();
    assert_eq!(index.search("zumbificado", 10).unwrap().len(), 1);
    assert!(index.reader_search("zumbificado", 10).unwrap().is_empty());
    // A word on both sides: found, its excerpt from the public text.
    let hits = index.reader_search("barão", 10).unwrap();
    assert!(!hits.is_empty());
    for h in &hits {
        assert!(!h.snippet.contains("morto"), "{h:?}");
        assert!(!h.snippet.contains("Cripta"), "{h:?}");
    }
    let hits = index.reader_search("fim", 10).unwrap();
    assert_eq!(hits[0].path, "Taverna.md");
    assert!(!hits[0].snippet.contains("zumbificado"));
    // A heading inside a secret block never titles the note.
    assert!(index.reader_search("cripta", 10).unwrap().is_empty());
    index.check().unwrap();
}

#[test]
fn a_reader_s_links_and_backlinks_leave_out_the_secret_ones() {
    let index = folder();
    let targets = |links: Vec<verso_index::Link>| -> Vec<(String, u32)> {
        links.into_iter().map(|l| (l.target, l.line)).collect()
    };
    assert_eq!(
        targets(index.links_of("Taverna.md").unwrap()),
        vec![
            ("Barão".to_owned(), 3),
            ("Vampiro".to_owned(), 7),
            ("Mapa".to_owned(), 7),
            ("Porto".to_owned(), 10)
        ]
    );
    // Lines 5 to 8 are hidden: `[[Porto]]` is on the projection's line 6.
    assert_eq!(
        targets(index.reader_links_of("Taverna.md").unwrap()),
        vec![("Barão".to_owned(), 3), ("Porto".to_owned(), 6)]
    );
    assert_eq!(index.backlinks("Vampiro.md").unwrap().len(), 1);
    assert!(index.reader_backlinks("Vampiro.md").unwrap().is_empty());
    assert!(index.reader_backlinks("Mapa.md").unwrap().is_empty());
    let porto = index.reader_backlinks("Porto.md").unwrap();
    assert_eq!(porto.len(), 1);
    assert_eq!(porto[0].line, 6);
    let edges = index.reader_graph().unwrap();
    assert!(
        edges
            .iter()
            .all(|(_, to)| to != "Vampiro.md" && to != "Mapa.md")
    );
    assert!(edges.iter().any(|(_, to)| to == "Porto.md"));
    assert_eq!(index.graph().unwrap().len(), edges.len() + 2);
    let all = index.reader_all_links().unwrap();
    assert!(
        all.iter()
            .all(|l| l.target != "Vampiro" && l.target != "Mapa")
    );
}

#[test]
fn a_reader_s_tags_headings_and_ids_leave_out_the_secret_ones() {
    let index = folder();
    let names = |tags: Vec<(String, Vec<String>)>| -> Vec<String> {
        tags.into_iter().map(|(t, _)| t).collect()
    };
    assert!(names(index.tags().unwrap()).contains(&"morto".to_owned()));
    let reader = names(index.reader_tags().unwrap());
    assert!(reader.contains(&"publico".to_owned()));
    assert!(!reader.contains(&"morto".to_owned()));
    let headings: Vec<(String, u32)> = index
        .reader_headings_of("Taverna.md")
        .unwrap()
        .into_iter()
        .map(|h| (h.text, h.line))
        .collect();
    assert_eq!(headings, vec![("Taverna".to_owned(), 1)]);
    assert_eq!(index.headings_of("Taverna.md").unwrap().len(), 2);
    let ids: Vec<(String, u32)> = index
        .reader_blocks_of("Taverna.md")
        .unwrap()
        .into_iter()
        .map(|b| (b.id, b.line))
        .collect();
    assert_eq!(ids, vec![("fim".to_owned(), 6)]);
    assert_eq!(index.blocks_of("Taverna.md").unwrap().len(), 2);
    assert_eq!(
        index.reader_content_of("Taverna.md").unwrap().as_deref(),
        Some(verso_dialect::project(TAVERNA).as_ref())
    );
    assert_eq!(index.hidden_of("Taverna.md").unwrap(), vec![(5, 8)]);
}

#[test]
fn a_change_only_inside_a_secret_block_is_none_for_a_reader() {
    let mut index = folder();
    assert_eq!(
        index.reader_stats().unwrap().get("Taverna.md").map(|s| s.1),
        Some(1)
    );
    let changed = TAVERNA.replace("zumbificado", "enterrado");
    put(&mut index, "Taverna.md", &changed, 50);
    let stats = index.reader_stats().unwrap();
    let (len, modified) = stats.get("Taverna.md").copied().unwrap();
    assert_eq!(modified, 1, "a secret-only change moved a reader's time");
    assert_eq!(len, verso_dialect::project(&changed).len() as u64);
    // A change a reader can see moves it.
    let public = changed.replace("Fim:", "Fim, enfim:");
    put(&mut index, "Taverna.md", &public, 90);
    assert_eq!(index.reader_stats().unwrap()["Taverna.md"].1, 90);
    assert!(index.search("enterrado", 5).unwrap().len() == 1);
    assert!(index.reader_search("enterrado", 5).unwrap().is_empty());
    index.check().unwrap();
}

#[test]
fn a_renamed_note_keeps_its_secret_apart() {
    let mut index = folder();
    assert!(index.rekey("Taverna.md", "Velha Taverna.md").unwrap());
    assert!(index.reader_search("zumbificado", 5).unwrap().is_empty());
    assert_eq!(index.search("zumbificado", 5).unwrap().len(), 1);
    assert!(index.reader_backlinks("Vampiro.md").unwrap().is_empty());
    index.check().unwrap();
    assert!(index.remove("Velha Taverna.md").unwrap());
    index.check().unwrap();
}

#[test]
fn an_index_of_version_14_is_carried_over_with_its_secrets_found() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("i.sqlite");
    {
        let mut index = Index::open(&file).unwrap();
        put(&mut index, "Taverna.md", TAVERNA, 1);
        put(&mut index, "Vampiro.md", "# Vampiro\n", 1);
        // An evicted note: its row is the only copy of its text (ADR 0043).
        put(
            &mut index,
            "Cofre.md",
            "> [!secret]\n> # Ouro escondido\n> [[Vampiro]]\n",
            1,
        );
        assert!(index.mark_placeholder("Cofre.md").unwrap());
    }
    {
        // Version 14 as it was: no secret columns, the full-text index over
        // `notes` itself, and a title taken from any heading.
        let conn = rusqlite::Connection::open(&file).unwrap();
        conn.execute_batch(
            "DROP TABLE notes_fts;
             DROP VIEW notes_text;
             ALTER TABLE notes DROP COLUMN public;
             ALTER TABLE notes DROP COLUMN secret;
             ALTER TABLE notes DROP COLUMN hidden;
             ALTER TABLE notes DROP COLUMN public_hash;
             ALTER TABLE notes DROP COLUMN public_len;
             ALTER TABLE notes DROP COLUMN public_modified;
             ALTER TABLE headings DROP COLUMN secret;
             ALTER TABLE blocks DROP COLUMN secret;
             ALTER TABLE links DROP COLUMN secret;
             UPDATE notes SET title = 'Ouro escondido' WHERE path = 'Cofre.md';
             CREATE VIRTUAL TABLE notes_fts USING fts5(path UNINDEXED, title, content,
                 content = 'notes', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2');
             INSERT INTO notes_fts (notes_fts) VALUES ('rebuild');
             UPDATE meta SET value = '14' WHERE key = 'schema';",
        )
        .unwrap();
    }
    let index = Index::open(&file).unwrap();
    assert!(index.reader_search("zumbificado", 5).unwrap().is_empty());
    assert_eq!(index.search("zumbificado", 5).unwrap().len(), 1);
    assert!(index.reader_backlinks("Vampiro.md").unwrap().is_empty());
    assert_eq!(index.backlinks("Vampiro.md").unwrap().len(), 2);
    assert!(index.reader_search("ouro", 5).unwrap().is_empty());
    assert_eq!(index.is_unverified("Cofre.md").unwrap(), Some(true));
    index.check().unwrap();
}

#[test]
fn the_order_of_a_reader_s_hits_does_not_move_with_the_length_of_a_secret_block() {
    // Review of ADR 0087 (M3): the rank of a hit weighs the length of the
    // note, so a rank over the secret column would tell a reader how long
    // a secret block grew.
    let filler = "um dois três quatro cinco seis sete oito nove dez ".repeat(3);
    let a = format!("# A\n\nbarão porto {filler}\n");
    let small = "# B\n\nbarão porto\n\n> [!secret]\n> zqx\n";
    let big = format!("{small}> {}\n", "zqx ".repeat(50_000));
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "A.md", &a, 1);
    put(&mut index, "B.md", small, 1);
    let order = |index: &Index| -> Vec<String> {
        let mut hits = index.reader_search("barão porto", 10).unwrap();
        // Name ranks are no matter here: neither name holds the words.
        hits.iter_mut()
            .map(|h| std::mem::take(&mut h.path))
            .collect()
    };
    let before = order(&index);
    assert_eq!(before.len(), 2);
    put(&mut index, "B.md", &big, 2);
    assert_eq!(order(&index), before);
    index.check().unwrap();
}
