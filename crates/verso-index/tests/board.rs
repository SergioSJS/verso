// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Canvases and typed relations in the graph, as Obsidian 1.13.7 was
//! observed to count them on 2026-09-29 and 2026-09-30
//! (`docs/reference/board-decision.md` §3.2 and §10; ADR 0057 points 4 and
//! 6).

use verso_index::{Index, NoteStamp, SourceLink};

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

    pub fn put(index: &mut Index, path: &str, content: &str) {
        index
            .upsert(path, stamp(), content, &verso_dialect::parse(content))
            .unwrap();
    }

    pub fn link(target: &str, embed: bool) -> SourceLink {
        SourceLink {
            embed,
            target: target.to_owned(),
            heading: None,
            block: None,
            alias: None,
            line: 3,
            col: 3,
            start: 10,
            end: 20,
        }
    }
}
use support::*;

#[test]
fn a_property_link_is_a_backlink() {
    // O10: `aliado: "[[B]]"` and `inimigos: ["[[B]]", "[[C]]"]` make A a
    // backlink of B twice and of C once.
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "B.md", "# B\n");
    put(&mut index, "C.md", "# C\n");
    put(
        &mut index,
        "A.md",
        "---\naliado: \"[[B]]\"\ninimigos:\n  - \"[[B]]\"\n  - \"[[C]]\"\nsemaspas: [[C]]\n---\n# A\n",
    );
    assert_eq!(index.backlinks("B.md").unwrap().len(), 2);
    assert_eq!(index.backlinks("C.md").unwrap().len(), 1);
    let first = &index.backlinks("B.md").unwrap()[0];
    assert_eq!((first.from.as_str(), first.line), ("A.md", 2));
}

#[test]
fn a_canvas_is_a_link_source_and_not_a_note() {
    // O7 and O12: a file node and a link inside a text node make the
    // canvas a backlink of the note.
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "N.md", "# N\n");
    put(&mut index, "C.md", "# C\n");
    index
        .upsert_canvas(
            "quadros/Quadro.canvas",
            stamp(),
            "ver [[C]] aqui\n",
            &[link("N.md", true), link("C", false)],
        )
        .unwrap();
    assert_eq!(
        index.backlinks("N.md").unwrap()[0].from,
        "quadros/Quadro.canvas"
    );
    assert_eq!(
        index.backlinks("C.md").unwrap()[0].from,
        "quadros/Quadro.canvas"
    );
    assert_eq!(index.notes().unwrap(), vec!["C.md", "N.md"]);
    assert_eq!(
        index.sources().unwrap(),
        vec!["C.md", "N.md", "quadros/Quadro.canvas"]
    );
    assert!(index.tags().unwrap().is_empty());
    assert_eq!(index.search("aqui", 10).unwrap().len(), 1);
    index.check().unwrap();
}

#[test]
fn a_canvas_is_a_target_by_its_full_name_only() {
    // O8: `![[board.canvas]]` resolves, `[[board]]` does not.
    let mut index = Index::in_memory().unwrap();
    index
        .upsert_canvas("board.canvas", stamp(), "", &[])
        .unwrap();
    put(&mut index, "Liga.md", "Ver [[board]] e ![[board.canvas]]\n");
    let links = index.links_of("Liga.md").unwrap();
    assert_eq!(links[0].resolved, None);
    assert_eq!(links[1].resolved.as_deref(), Some("board.canvas"));
    let backlinks = index.backlinks("board.canvas").unwrap();
    assert_eq!(backlinks.len(), 1);
    assert!(backlinks[0].embed);
}

#[test]
fn a_canvas_row_follows_a_move_and_goes_when_removed() {
    let mut index = Index::in_memory().unwrap();
    put(&mut index, "N.md", "# N\n");
    index
        .upsert_canvas("a.canvas", stamp(), "", &[link("N.md", true)])
        .unwrap();
    assert!(index.rekey("a.canvas", "b/a.canvas").unwrap());
    assert_eq!(index.backlinks("N.md").unwrap()[0].from, "b/a.canvas");
    assert!(index.remove("b/a.canvas").unwrap());
    assert!(index.backlinks("N.md").unwrap().is_empty());
    index.check().unwrap();
}
