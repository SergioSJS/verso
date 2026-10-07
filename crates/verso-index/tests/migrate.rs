// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! An index of version 6, the one before the board, is carried over in
//! place (decided on 2026-10-01, review `board.md` §6 item 7): a note iCloud
//! has evicted keeps its last known text and links (ADR 0043), and every
//! note read from disk is read again on the next walk.

use verso_index::{Index, NoteStamp};

#[cfg(test)]
mod support {
    use super::*;

    pub fn stamp() -> NoteStamp {
        NoteStamp {
            modified: 1,
            len: 1,
            hash: 7,
        }
    }

    /// An index file as version 6 left it: no `kind` on notes, no `relation`
    /// on links.
    pub fn as_version_6(path: &std::path::Path) {
        let conn = rusqlite::Connection::open(path).unwrap();
        conn.execute_batch(
            "ALTER TABLE notes DROP COLUMN kind;
             ALTER TABLE links DROP COLUMN relation;
             UPDATE meta SET value = '6' WHERE key = 'schema';",
        )
        .unwrap();
    }
}
use support::*;

#[test]
fn version_6_keeps_an_evicted_note_and_reads_the_others_again() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("index.sqlite");
    {
        let mut index = Index::open(&file).unwrap();
        let segredo = "O [[Mapa]] do tesouro.\n";
        index
            .upsert(
                "Segredo.md",
                stamp(),
                segredo,
                &verso_dialect::parse(segredo),
            )
            .unwrap();
        let mapa = "# Mapa\n";
        index
            .upsert("Mapa.md", stamp(), mapa, &verso_dialect::parse(mapa))
            .unwrap();
        assert!(index.mark_placeholder("Segredo.md").unwrap());
    }
    as_version_6(&file);

    let index = Index::open(&file).unwrap();
    // The evicted note: its last known text, its links, still searchable.
    assert_eq!(
        index.content_of("Segredo.md").unwrap().as_deref(),
        Some("O [[Mapa]] do tesouro.\n")
    );
    assert_eq!(index.search("tesouro", 10).unwrap().len(), 1);
    let back = index.backlinks("Mapa.md").unwrap();
    assert_eq!(back.len(), 1);
    assert_eq!(back[0].from, "Segredo.md");
    // The note read from disk is read again: its stamp no longer matches.
    assert_ne!(index.stamp_of("Mapa.md").unwrap(), Some(stamp()));
    // The placeholder's stamp is what it was.
    assert_eq!(index.stamp_of("Segredo.md").unwrap(), Some(stamp()));
}

#[test]
fn version_7_migrates_to_version_9_and_marks_notes_to_read_again() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("index.sqlite");
    {
        let mut index = Index::open(&file).unwrap();
        let nota = "---\nsticker: 🎯\n---\n# Nota\n";
        index
            .upsert("Nota.md", stamp(), nota, &verso_dialect::parse(nota))
            .unwrap();
    }
    // Downgrade to version 7
    {
        let conn = rusqlite::Connection::open(&file).unwrap();
        conn.execute_batch(
            "ALTER TABLE notes DROP COLUMN sticker;
             ALTER TABLE notes DROP COLUMN color;
             ALTER TABLE notes DROP COLUMN banner;
             ALTER TABLE notes DROP COLUMN banner_y;
             ALTER TABLE notes DROP COLUMN order_items;
             ALTER TABLE notes DROP COLUMN pinned_items;
             UPDATE meta SET value = '7' WHERE key = 'schema';",
        )
        .unwrap();
    }

    let index = Index::open(&file).unwrap();
    // Notes must be marked to re-read so that labels in frontmatter are populated
    assert_ne!(index.stamp_of("Nota.md").unwrap(), Some(stamp()));
}

#[test]
fn version_9_is_carried_to_version_10_with_the_types_and_schemas_empty_until_read_again() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("index.sqlite");
    {
        let mut index = Index::open(&file).unwrap();
        let barao = "---\ntype: npc\n---\n# Barão\n";
        index
            .upsert("Barão.md", stamp(), barao, &verso_dialect::parse(barao))
            .unwrap();
    }
    {
        let conn = rusqlite::Connection::open(&file).unwrap();
        conn.execute_batch(
            "DROP TABLE schemas;
             ALTER TABLE notes DROP COLUMN type;
             ALTER TABLE notes DROP COLUMN type_key;
             UPDATE meta SET value = '9' WHERE key = 'schema';",
        )
        .unwrap();
    }
    let index = Index::open(&file).unwrap();
    assert!(index.schema_blocks().unwrap().is_empty());
    assert_eq!(index.note_type("Barão.md").unwrap(), None);
    // Read again on the next walk, which fills the new columns.
    assert_ne!(index.stamp_of("Barão.md").unwrap(), Some(stamp()));
}

#[test]
fn version_10_is_carried_to_version_11_and_a_block_falls_back_to_its_own_line_until_read_again() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("index.sqlite");
    let text = "| a | b |\n| --- | --- |\n| 1 | 2 |\n\n^tab\n";
    {
        let mut index = Index::open(&file).unwrap();
        index
            .upsert("Tabela.md", stamp(), text, &verso_dialect::parse(text))
            .unwrap();
        // Version 11 keeps the lines of the block the id names (spec Q3).
        let block = &index.blocks_of("Tabela.md").unwrap()[0];
        assert_eq!((block.line, block.first_line, block.last_line), (5, 1, 3));
    }
    {
        let conn = rusqlite::Connection::open(&file).unwrap();
        conn.execute_batch(
            "ALTER TABLE blocks DROP COLUMN first_line;
             ALTER TABLE blocks DROP COLUMN last_line;
             UPDATE meta SET value = '10' WHERE key = 'schema';",
        )
        .unwrap();
    }
    let index = Index::open(&file).unwrap();
    // Carried over, not rebuilt: the id is there, its block its own line
    // until the next walk reads the note again.
    let block = &index.blocks_of("Tabela.md").unwrap()[0];
    assert_eq!(
        (block.id.as_str(), block.first_line, block.last_line),
        ("tab", 5, 5)
    );
    assert_ne!(index.stamp_of("Tabela.md").unwrap(), Some(stamp()));
}
