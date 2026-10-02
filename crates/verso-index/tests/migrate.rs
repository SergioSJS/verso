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
