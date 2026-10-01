// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The board end to end (ADR 0057): a canvas is indexed as a link source,
//! saved over the file it was read from keeping what the window does not
//! know, and followed by a rename like a note's links are. Typed relations
//! in the frontmatter are followed too.

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

    pub fn on_disk(vault: &Path, relative: &str) -> String {
        let mut root = verso_fs::Root::open(vault, vec![]).unwrap();
        let h = root.handle(Path::new(relative)).unwrap();
        String::from_utf8(root.read(h).unwrap().0).unwrap()
    }
}
use support::*;

/// As Obsidian 1.13.7 writes a canvas: tabs, one node per line, no final
/// newline.
const BOARD: &str = "{\n\t\"nodes\":[\n\t\t{\"id\":\"a\",\"x\":0,\"y\":0,\"width\":400,\"height\":400,\"type\":\"file\",\"file\":\"Barão.md\",\"verso-extra\":1},\n\t\t{\"id\":\"b\",\"x\":500,\"y\":0,\"width\":250,\"height\":60,\"type\":\"text\",\"text\":\"ver [[Barão]] no porão\"}\n\t],\n\t\"edges\":[\n\t\t{\"id\":\"e\",\"fromNode\":\"a\",\"toNode\":\"b\"}\n\t],\n\t\"verso\":{\n\t\t\"version\":1,\n\t\t\"drawing\":[]\n\t}\n}";

#[test]
fn a_canvas_is_indexed_and_opening_it_writes_nothing() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = file(vault.path(), "Barão.md", "# Barão\n");
    let _b = file(vault.path(), "Quadro.canvas", BOARD);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let back = ws.backlinks("Barão").unwrap().unwrap();
    assert_eq!(back.len(), 2);
    assert!(back.iter().all(|b| b.from == "Quadro.canvas"));
    assert_eq!(ws.notes().unwrap(), vec!["Barão.md"]);
    assert_eq!(ws.search("porão", 10).unwrap().len(), 1);
    let read = ws.read_text("Quadro.canvas").unwrap();
    assert_eq!(read.text, BOARD);
    assert_eq!(on_disk(vault.path(), "Quadro.canvas"), BOARD);
    // A second run finds the canvas unchanged.
    let again = ws.index().unwrap();
    assert!(again.changed.is_empty());
}

#[test]
fn a_save_changes_only_what_changed() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = file(vault.path(), "Barão.md", "# Barão\n");
    let _b = file(vault.path(), "Quadro.canvas", BOARD);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let read = ws.read_text("Quadro.canvas").unwrap();
    // What the window sends: node b moved (and not rounded), keys in its
    // own order, the unknown field carried over, a stroke drawn.
    let json = r#"{"nodes":[{"id":"a","type":"file","file":"Barão.md","verso-extra":1,"x":0,"y":0,"width":400,"height":400},{"id":"b","type":"text","text":"ver [[Barão]] no porão","x":520.6,"y":0,"width":250,"height":60}],"edges":[{"id":"e","fromNode":"a","toNode":"b"}],"verso":{"version":1,"drawing":[{"id":"s","type":"freedraw","points":[[0,0],[3,4]]}]}}"#;
    let saved = ws
        .write_board("Quadro.canvas", json, &read.revision)
        .unwrap();
    let expected = BOARD
        .replace("\"x\":500", "\"x\":521")
        .replace(
            "\"drawing\":[]",
            "\"drawing\":[\n\t\t\t{\n\t\t\t\t\"id\":\"s\",\n\t\t\t\t\"type\":\"freedraw\",\n\t\t\t\t\"points\":[\n\t\t\t\t\t[0,0],\n\t\t\t\t\t[3,4]\n\t\t\t\t]\n\t\t\t}\n\t\t]",
        );
    assert_eq!(saved.text, expected);
    assert_eq!(on_disk(vault.path(), "Quadro.canvas"), expected);
    // The revision read before the save is spent: invariant 11.
    let stale = ws.write_board("Quadro.canvas", json, &read.revision);
    assert!(matches!(stale, Err(CoreError::Write(_))));
    let edited = json.replace("520.6", "900");
    assert!(matches!(
        ws.write_board("Quadro.canvas", &edited, &read.revision),
        Err(CoreError::Write(_))
    ));
    // Not JSON: refused, the text view is where it gets fixed.
    assert!(matches!(
        ws.write_board("Quadro.canvas", "{", &saved.revision),
        Err(CoreError::NotCanvas)
    ));
}

#[test]
fn a_rename_points_the_canvas_at_the_new_path() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = file(vault.path(), "Barão.md", "# Barão\n");
    let _b = file(vault.path(), "Quadro.canvas", BOARD);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let renamed = ws.rename_note("Barão", "npcs/Barão Vermelho").unwrap();
    assert_eq!(renamed.rewrites.len(), 1);
    let w = &renamed.rewrites[0];
    assert_eq!(w.path, "Quadro.canvas");
    assert_eq!(
        w.after,
        BOARD
            .replace(
                "\"file\":\"Barão.md\"",
                "\"file\":\"npcs/Barão Vermelho.md\""
            )
            .replace("[[Barão]]", "[[Barão Vermelho]]")
    );
    ws.write_text(&w.path, &w.after, &w.revision).unwrap();
    let back = ws.backlinks("npcs/Barão Vermelho").unwrap().unwrap();
    assert_eq!(back.len(), 2);
    // By its name too, as a link names it: the command line's `backlinks`.
    assert_eq!(ws.backlinks("Barão Vermelho").unwrap().unwrap().len(), 2);
    assert_eq!(ws.backlinks("barão vermelho.md").unwrap().unwrap().len(), 2);
    assert_eq!(ws.backlinks("Ninguém").unwrap(), None);
}

#[test]
fn moving_the_canvas_keeps_links_to_it() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = file(vault.path(), "Liga.md", "Ver ![[Quadro.canvas]]\n");
    let _b = file(vault.path(), "Quadro.canvas", BOARD);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let renamed = ws.rename_entry("Quadro.canvas", "Mesa.canvas").unwrap();
    assert_eq!(renamed.rewrites.len(), 1);
    assert_eq!(renamed.rewrites[0].after, "Ver ![[Mesa.canvas]]\n");
}

#[test]
fn a_typed_relation_follows_a_rename() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = file(vault.path(), "Barão.md", "# Barão\n");
    let _a = file(
        vault.path(),
        "Aliada.md",
        "---\naliado: \"[[Barão]]\"\ninimigos:\n  - \"[[Barão]]\"\n---\n# Aliada\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(ws.backlinks("Barão").unwrap().unwrap().len(), 2);
    let renamed = ws.rename_note("Barão", "Conde").unwrap();
    assert_eq!(
        renamed.rewrites[0].after,
        "---\naliado: \"[[Conde]]\"\ninimigos:\n  - \"[[Conde]]\"\n---\n# Aliada\n"
    );
}

#[test]
fn a_new_board_is_indexed_when_created() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = file(vault.path(), "Barão.md", "# Barão\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    ws.create_file("Novo.canvas", BOARD.as_bytes()).unwrap();
    assert_eq!(ws.backlinks("Barão").unwrap().unwrap().len(), 2);
}
