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
use verso_core::{Sidecar, Workspace};

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
    let _evicted = note(vault.path(), ".Segredo.md.icloud", "<plist/>");

    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    let r = ws.index().unwrap();
    assert_eq!(
        (r.indexed, r.unchanged, r.removed, r.placeholders),
        (2, 0, 0, 2),
        "{r:?}"
    );
    // The evicted note is known, unverified, and a link target (ADR 0043).
    assert!(ws.notes().unwrap().contains(&"Segredo.md".to_owned()));
    assert!(r.problems.is_empty() && r.unreadable.is_empty(), "{r:?}");

    let back = ws.backlinks("Barão Vermelho").unwrap().unwrap();
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
    // Removed from disk: no longer a known note.
    assert_eq!(ws.backlinks("Barão Vermelho").unwrap(), None);
    assert_eq!(ws.backlinks("Taverna").unwrap().unwrap().len(), 1);
    assert_eq!(ws.unresolved().unwrap().len(), 0);
    assert_eq!(
        ws.notes().unwrap(),
        vec!["Nova.md", "Segredo.md", "Taverna.md"]
    );
}

#[test]
fn config_dir_precedence_and_no_relative_fallback() {
    let home = Some(Path::new("/Users/x"));
    assert_eq!(
        verso_core::config_dir_from(
            Some(OsStr::new("/cfg")),
            Some(OsStr::new("/xdg")),
            home,
            true
        )
        .as_deref(),
        Some(Path::new("/cfg"))
    );
    assert_eq!(
        verso_core::config_dir_from(None, Some(OsStr::new("/xdg")), home, true).as_deref(),
        Some(Path::new("/xdg/verso"))
    );
    assert_eq!(
        verso_core::config_dir_from(None, None, home, true).as_deref(),
        Some(Path::new("/Users/x/Library/Application Support/verso"))
    );
    assert_eq!(
        verso_core::config_dir_from(None, None, home, false).as_deref(),
        Some(Path::new("/Users/x/.config/verso"))
    );
    // No HOME and no override: an error, never a relative directory.
    assert_eq!(verso_core::config_dir_from(None, None, None, true), None);
}

#[test]
fn a_trailing_slash_or_a_dot_names_the_same_index() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let plain = Workspace::open(vault.path(), Some(config.path())).unwrap();
    let mut slashed = vault.path().as_os_str().to_owned();
    slashed.push("/");
    let slashed = Workspace::open(Path::new(&slashed), Some(config.path())).unwrap();
    let dotted = Workspace::open(&vault.path().join("."), Some(config.path())).unwrap();
    assert_eq!(plain.index_path(), slashed.index_path());
    assert_eq!(plain.index_path(), dotted.index_path());
    assert_eq!(plain.folder(), slashed.folder());
}

#[test]
fn a_note_under_an_unreadable_directory_is_not_removed() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _root = note(vault.path(), "root.md", "[[a]]\n");
    let sub = subdir(vault.path(), "sub");
    let _a = note(sub.path(), "a.md", "a\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    let r = ws.index().unwrap();
    assert_eq!((r.indexed, r.removed), (2, 0), "{r:?}");
    assert_eq!(ws.backlinks("sub/a").unwrap().unwrap().len(), 1);

    // The directory becomes unreadable (through the shell: the test may
    // not call std::fs). The walk reports a problem for `sub`; nothing
    // under it is gone.
    let chmod = |mode: &str| {
        assert!(
            std::process::Command::new("chmod")
                .arg(mode)
                .arg(sub.path())
                .status()
                .unwrap()
                .success()
        );
    };
    chmod("000");
    let r = ws.index().unwrap();
    chmod("755");
    assert_eq!(r.removed, 0, "{r:?}");
    assert_eq!(r.problems.len(), 1, "{r:?}");
    assert_eq!(r.problems[0].path(), "sub");
    assert!(matches!(r.problems[0], verso_core::WalkProblem::Io { .. }));
    assert_eq!(ws.backlinks("sub/a").unwrap().unwrap().len(), 1);
    assert!(ws.unresolved().unwrap().is_empty());

    // Readable again: unchanged, still no removal.
    let r = ws.index().unwrap();
    assert_eq!((r.unchanged, r.removed), (2, 0), "{r:?}");
}

#[test]
fn a_placeholder_that_comes_back_unchanged_is_verified_again() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    // A fixed modification time, so the note that comes back has the very
    // same stamp (time, length, hash) as the one that was evicted.
    let touch = |path: &Path| {
        assert!(
            std::process::Command::new("touch")
                .args(["-t", "202601010000"])
                .arg(path)
                .status()
                .unwrap()
                .success()
        );
    };
    let segredo = note(vault.path(), "Segredo.md", "# Segredo\n");
    touch(segredo.path());
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    let r = ws.index().unwrap();
    assert_eq!(r.indexed, 1);
    assert_eq!(ws.is_unverified("Segredo").unwrap(), Some(false));

    // Evicted: the placeholder stands where the note was (ADR 0043).
    drop(segredo);
    let evicted = note(vault.path(), ".Segredo.md.icloud", "<plist/>");
    let r = ws.index().unwrap();
    assert_eq!((r.placeholders, r.removed), (1, 0), "{r:?}");
    assert_eq!(ws.is_unverified("Segredo").unwrap(), Some(true));
    drop(evicted);

    // Downloaded again, same content and same time: reading it is what
    // verifies it, so the stamp match must not skip the note.
    let back = note(vault.path(), "Segredo.md", "# Segredo\n");
    touch(back.path());
    let r = ws.index().unwrap();
    assert_eq!((r.indexed, r.unchanged, r.placeholders), (1, 0, 0), "{r:?}");
    assert_eq!(ws.is_unverified("Segredo").unwrap(), Some(false));
}

#[test]
fn read_note_gives_lines_positions_and_staleness_and_every_path_is_confined() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = note(
        vault.path(),
        "Nota.md",
        "# Título\n\nUm parágrafo. ^p1\n\n## Sub\n\n[[Outra]]\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    // Before any index run: readable, stale, nothing known.
    let t = ws.read_note("Nota").unwrap();
    assert_eq!(t.path, "Nota.md");
    assert_eq!(t.lines.len(), 7);
    assert_eq!(t.lines[2], "Um parágrafo. ^p1");
    assert!(t.stale && !t.unverified);
    assert!(t.headings.is_empty() && t.blocks.is_empty());

    ws.index().unwrap();
    let t = ws.read_note("Nota.md").unwrap();
    assert!(!t.stale);
    assert_eq!(t.headings.len(), 2);
    assert_eq!(
        (t.headings[1].text.as_str(), t.headings[1].line),
        ("Sub", 5)
    );
    assert_eq!(
        (t.blocks[0].id.as_str(), t.blocks[0].line, t.blocks[0].col),
        ("p1", 3, 15)
    );
    let links = ws.links("Nota").unwrap().unwrap();
    assert_eq!(
        (links[0].target.as_str(), links[0].resolved.as_deref()),
        ("Outra", None)
    );
    assert_eq!(ws.links("Outra").unwrap(), None);

    // Edited on disk after the run: the text is fresh and says the graph is not.
    {
        let mut root = verso_fs::Root::open(vault.path(), vec![]).unwrap();
        let h = root.handle(Path::new("Nota.md")).unwrap();
        let (_, stamp) = root.read(h).unwrap();
        let _ = root.write(h, b"# Novo\n", &stamp).unwrap();
    }
    let t = ws.read_note("Nota").unwrap();
    assert_eq!(t.lines, vec!["# Novo"]);
    assert!(t.stale);

    // Confinement on every path, disk or index (ADR 0044).
    for bad in ["../fora", "/etc/passwd", ".obsidian/app", "a\u{0}b", ""] {
        assert!(
            matches!(ws.read_note(bad), Err(verso_core::CoreError::Confined(_))),
            "{bad:?}"
        );
        assert!(
            matches!(ws.backlinks(bad), Err(verso_core::CoreError::Confined(_))),
            "{bad:?}"
        );
        assert!(
            matches!(ws.links(bad), Err(verso_core::CoreError::Confined(_))),
            "{bad:?}"
        );
    }
    // A note that is not there is a read error, not a confinement one.
    assert!(matches!(
        ws.read_note("Inexistente"),
        Err(verso_core::CoreError::Read(_))
    ));
    // A placeholder answers unavailable, never empty text (ADR 0043).
    let _ph = note(vault.path(), ".Evicted.md.icloud", "<plist/>");
    assert!(matches!(
        ws.read_note("Evicted"),
        Err(verso_core::CoreError::Read(
            verso_fs::ReadError::Unavailable
        ))
    ));
}

#[test]
fn indexing_writes_a_sidecar_naming_the_folder_beside_the_index() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _note = note(vault.path(), "Uma.md", "# Uma\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    // Opening writes nothing; the first `index` does.
    assert!(Sidecar::read(ws.index_path()).is_err());
    ws.index().unwrap();
    let first = Sidecar::read(ws.index_path()).unwrap();
    assert_eq!(first.folder, ws.folder());
    assert!(first.indexed_at > 0);
    assert_eq!(first.schema, verso_index::SCHEMA_VERSION);
    assert_eq!(
        Sidecar::path_for(ws.index_path()),
        ws.index_path().with_extension("json")
    );
    // Every run rewrites it; time does not go backwards.
    ws.index().unwrap();
    let second = Sidecar::read(ws.index_path()).unwrap();
    assert!(second.indexed_at >= first.indexed_at);
    assert_eq!(second.folder, first.folder);
}
