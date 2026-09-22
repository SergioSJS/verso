// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! End to end: a folder is built with `tempfile` (the `std::fs` guardrail
//! holds for this crate's tests too), edited through `verso-fs`, and
//! indexed and queried through the workspace.

use std::ffi::OsStr;
use std::io::Write;
use std::path::Path;

use tempfile::{Builder, NamedTempFile, TempDir};
use verso_core::Workspace;

#[cfg(test)]
mod support {
    use super::*;

    /// A note with exactly this name (no random part), kept until dropped.
    pub fn note(dir: &Path, name: &str, content: &str) -> NamedTempFile {
        let mut file = Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempfile_in(dir)
            .unwrap();
        file.write_all(content.as_bytes()).unwrap();
        file.flush().unwrap();
        file
    }

    pub fn subdir(dir: &Path, name: &str) -> TempDir {
        Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempdir_in(dir)
            .unwrap()
    }
}
use support::*;

#[test]
fn index_search_backlinks_and_incremental_runs() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _taverna = note(
        vault.path(),
        "Taverna.md",
        "# Taverna\n\n## Porão\n\nO [[Barão Vermelho]] bebe aqui.\n",
    );
    let barao = note(
        vault.path(),
        "Barão Vermelho.md",
        "---\ntags: [npc]\n---\nGoverna o distrito. ^governo\n",
    );
    let obsidian = subdir(vault.path(), ".obsidian");
    let _app = note(obsidian.path(), "app.json", "{}");
    let _placeholder = note(vault.path(), ".Mapa.png.icloud", "<plist/>");

    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    let r = ws.index().unwrap();
    assert_eq!(
        (r.indexed, r.unchanged, r.removed, r.placeholders),
        (2, 0, 0, 1),
        "{r:?}"
    );
    assert!(r.problems.is_empty() && r.unreadable.is_empty(), "{r:?}");

    let back = ws.backlinks("Barão Vermelho").unwrap();
    assert_eq!(back.len(), 1);
    assert_eq!(back[0].from, "Taverna.md");
    assert_eq!((back[0].line, back[0].col), (5, 3));
    assert_eq!(
        ws.search("distrito", 10).unwrap()[0].path,
        "Barão Vermelho.md"
    );

    // Second run: nothing changed.
    let r = ws.index().unwrap();
    assert_eq!((r.indexed, r.unchanged, r.removed), (0, 2, 0));

    // A note edited through verso-fs, one removed, one added.
    {
        let mut root = verso_fs::Root::open(vault.path(), vec![]).unwrap();
        let h = root.handle(Path::new("Taverna.md")).unwrap();
        let (_, stamp) = root.read(h).unwrap();
        let _ = root.write(h, b"# Taverna\n\nSem link.\n", &stamp).unwrap();
    }
    drop(barao);
    let _nova = note(vault.path(), "Nova.md", "[[Taverna#Porão]]\n");
    let r = ws.index().unwrap();
    assert_eq!((r.indexed, r.unchanged, r.removed), (2, 0, 1), "{r:?}");
    assert!(ws.backlinks("Barão Vermelho").unwrap().is_empty());
    assert_eq!(ws.backlinks("Taverna").unwrap().len(), 1);
    assert_eq!(ws.unresolved().unwrap().len(), 0);
    assert_eq!(ws.notes().unwrap(), vec!["Nova.md", "Taverna.md"]);
}

#[test]
fn config_dir_precedence() {
    let home = Path::new("/Users/x");
    assert_eq!(
        verso_core::config_dir_from(
            Some(OsStr::new("/cfg")),
            Some(OsStr::new("/xdg")),
            home,
            true
        ),
        Path::new("/cfg")
    );
    assert_eq!(
        verso_core::config_dir_from(None, Some(OsStr::new("/xdg")), home, true),
        Path::new("/xdg/verso")
    );
    assert_eq!(
        verso_core::config_dir_from(None, None, home, true),
        Path::new("/Users/x/Library/Application Support/verso")
    );
    assert_eq!(
        verso_core::config_dir_from(None, None, home, false),
        Path::new("/Users/x/.config/verso")
    );
}
