// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the index keeps for the typed note (ADR 0052 point 6): each note's
//! `type`, as written and folded, and the `verso-schema` blocks it found.
//! Typing — which schema a note's type reaches — is the core's, at query
//! time.

use verso_index::{Index, NoteStamp};

#[cfg(test)]
mod support {
    use super::*;

    pub fn put(index: &mut Index, path: &str, text: &str) {
        let stamp = NoteStamp {
            modified: 1,
            len: 1,
            hash: 7,
        };
        index
            .upsert(path, stamp, text, &verso_dialect::parse(text))
            .unwrap();
    }
}
use support::*;

const PDM: &str = "# PdM\n\n```verso-schema\ntype: NPC\nproperties:\n  - key: nível\n    kind: number\n```\n\n- ```verso-schema\n  type: exemplo\n  ```\n\n```verso-schema\ntype: x\nproperties:\n  - key: a\n    kind: link\n```\n";

#[test]
fn a_note_keeps_its_type_and_a_note_its_schema_blocks() {
    let dir = tempfile::tempdir().unwrap();
    let mut index = Index::open(dir.path().join("index.sqlite")).unwrap();
    put(&mut index, "Tipos/PdM.md", PDM);
    put(&mut index, "Barão.md", "---\ntype: npc\n---\n# Barão\n");
    put(&mut index, "Duque.md", "---\ntype: \"Npc\"\n---\n");
    put(&mut index, "Lista.md", "---\ntype: [npc, mercador]\n---\n");
    put(&mut index, "Número.md", "---\ntype: 3\n---\n");

    assert_eq!(
        index.note_type("Barão.md").unwrap(),
        Some(("npc".to_owned(), "npc".to_owned()))
    );
    assert_eq!(
        index.note_type("Duque.md").unwrap(),
        Some(("Npc".to_owned(), "npc".to_owned()))
    );
    // A list or a number is an ordinary property, and no type.
    assert_eq!(index.note_type("Lista.md").unwrap(), None);
    assert_eq!(index.note_type("Número.md").unwrap(), None);
    assert_eq!(
        index.notes_of_type("npc").unwrap(),
        ["Barão.md", "Duque.md"]
    );

    let blocks = index.schema_blocks().unwrap();
    assert_eq!(blocks.len(), 3);
    assert_eq!(blocks[0].path, "Tipos/PdM.md");
    assert_eq!(blocks[0].name.as_deref(), Some("NPC"));
    assert_eq!(blocks[0].name_key.as_deref(), Some("npc"));
    assert!(blocks[1].nested && blocks[1].name.is_none());
    assert_eq!(blocks[2].error.as_deref(), Some("unknown_kind"));

    // The note rewritten without the blocks: they go with it.
    put(&mut index, "Tipos/PdM.md", "# PdM\n");
    assert!(index.schema_blocks().unwrap().is_empty());
}
