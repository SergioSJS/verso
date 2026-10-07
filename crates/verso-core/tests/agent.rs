// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What an agent reads of the folder (ADR 0066): typed relations on links
//! and backlinks, a board's structure, a note's tags, and the notes by tag
//! or property. All of it read-only: the folder is the same after.

use std::io::Write;
use std::path::Path;

use tempfile::{Builder, NamedTempFile};
use verso_core::{CoreError, Workspace};

#[cfg(test)]
mod support {
    use super::*;

    pub fn file(dir: &Path, name: &str, content: &str) -> NamedTempFile {
        let mut f = Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempfile_in(dir)
            .unwrap();
        f.write_all(content.as_bytes()).unwrap();
        f.flush().unwrap();
        f
    }
}
use support::*;

const TAVERNA: &str = "---\naliado: \"[[Barão]]\"\ninimigos:\n  - \"[[Duque]]\"\nstatus: ativo\ntags: [local, projeto/ativo]\n---\n# Taverna\n\nVer [[Barão]] no porão. #segredo\n";

const BOARD: &str = "{\n\t\"nodes\":[\n\t\t{\"id\":\"g\",\"type\":\"group\",\"x\":0,\"y\":0,\"width\":900,\"height\":500,\"label\":\"Mesa\"},\n\t\t{\"id\":\"a\",\"type\":\"file\",\"file\":\"Barão.md\",\"x\":20,\"y\":20,\"width\":300,\"height\":200}\n\t],\n\t\"edges\":[\n\t\t{\"id\":\"e\",\"fromNode\":\"a\",\"toNode\":\"g\",\"verso\":{\"relation\":\"aliado\"}}\n\t]\n}";

#[test]
fn links_and_backlinks_say_the_relation_a_property_holds() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _t = file(vault.path(), "Taverna.md", TAVERNA);
    let _b = file(vault.path(), "Barão.md", "# Barão\n");
    let _d = file(vault.path(), "Duque.md", "# Duque\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let links = ws.links("Taverna.md").unwrap().unwrap();
    let rel: Vec<(&str, Option<&str>)> = links
        .iter()
        .map(|l| (l.target.as_str(), l.relation.as_deref()))
        .collect();
    assert!(rel.contains(&("Barão", Some("aliado"))), "{rel:?}");
    assert!(rel.contains(&("Duque", Some("inimigos"))), "{rel:?}");
    assert!(rel.contains(&("Barão", None)), "the body's link: {rel:?}");
    let back = ws.backlinks("Barão.md").unwrap().unwrap();
    let mut relations: Vec<Option<&str>> = back.iter().map(|b| b.relation.as_deref()).collect();
    relations.sort();
    assert_eq!(relations, [None, Some("aliado")]);
}

#[test]
fn a_note_has_its_tags_and_the_notes_are_found_by_tag_and_property() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _t = file(vault.path(), "Taverna.md", TAVERNA);
    let _b = file(
        vault.path(),
        "Barão.md",
        "---\nstatus: Ativo\nfacções: [Coroa, Guilda]\n---\n# Barão\n",
    );
    let _q = file(vault.path(), "Quadro.canvas", BOARD);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let mut tags = ws.note_tags("Taverna.md").unwrap().unwrap();
    tags.sort();
    assert_eq!(tags, ["local", "projeto/ativo", "segredo"]);
    assert_eq!(ws.note_tags("Nada.md").unwrap(), None);
    // A tag holds its nested tags, case ignored; a board is never a note.
    assert_eq!(
        ws.notes_where(Some("PROJETO"), None, None).unwrap(),
        ["Taverna.md"]
    );
    assert_eq!(
        ws.notes_where(Some("#segredo"), None, None).unwrap(),
        ["Taverna.md"]
    );
    assert!(ws.notes_where(Some("proj"), None, None).unwrap().is_empty());
    // A property, with or without a value; a list holds each item.
    assert_eq!(
        ws.notes_where(None, Some("status"), Some("ativo")).unwrap(),
        ["Barão.md", "Taverna.md"]
    );
    assert_eq!(
        ws.notes_where(None, Some("facções"), Some("guilda"))
            .unwrap(),
        ["Barão.md"]
    );
    assert_eq!(
        ws.notes_where(None, Some("aliado"), None).unwrap(),
        ["Taverna.md"]
    );
    assert_eq!(
        ws.notes_where(Some("local"), Some("status"), Some("ativo"))
            .unwrap(),
        ["Taverna.md"]
    );
    assert_eq!(
        ws.notes_where(None, None, None).unwrap(),
        ["Barão.md", "Taverna.md"]
    );
}

#[test]
fn a_board_is_read_for_an_agent_and_a_note_is_not_a_board() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _b = file(vault.path(), "Barão.md", "# Barão\n");
    let _q = file(vault.path(), "Quadro.canvas", BOARD);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let (path, board) = ws.read_board("Quadro.canvas").unwrap();
    assert_eq!(path, "Quadro.canvas");
    assert_eq!(board.cards.len(), 2);
    assert_eq!(board.cards[1].group.as_deref(), Some("g"));
    assert_eq!(board.edges[0].relation.as_deref(), Some("aliado"));
    assert!(matches!(
        ws.read_board("Barão.md"),
        Err(CoreError::NotCanvas)
    ));
    assert!(matches!(
        ws.read_board("../fora.canvas"),
        Err(CoreError::Confined(_))
    ));
}
