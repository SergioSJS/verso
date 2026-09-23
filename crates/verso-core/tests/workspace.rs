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
use verso_core::{CoreError, Sidecar, Workspace};

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

#[test]
fn writing_a_note_goes_through_the_atomic_write_and_refuses_a_changed_file() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _file = note(vault.path(), "Nota.md", "# Nota\n\nantiga\r\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let before = ws.read_note("Nota").unwrap();
    assert_eq!(before.text, "# Nota\n\nantiga\r\n");
    assert!(!before.revision.is_empty());

    // Written as given, CRLF included; the index knows the new word.
    let written = ws
        .write_note("Nota", "# Nota\n\nnova palavra\r\n", &before.revision)
        .unwrap();
    assert!(written.warnings.is_empty(), "{:?}", written.warnings);
    let after = written.note;
    assert_eq!(after.text, "# Nota\n\nnova palavra\r\n");
    assert_ne!(after.revision, before.revision);
    assert!(!after.stale);
    assert_eq!(ws.search("palavra", 10).unwrap().len(), 1);

    // The old revision no longer names the file on disk: refused, nothing
    // written (invariant 11).
    let refused = ws.write_note("Nota", "perdido\n", &before.revision);
    assert!(
        matches!(
            refused,
            Err(CoreError::Write(verso_core::WriteError::Changed { .. }))
        ),
        "{refused:?}"
    );
    assert_eq!(
        ws.read_note("Nota").unwrap().text,
        "# Nota\n\nnova palavra\r\n"
    );

    // Changed on disk behind the editor's back: the fresh revision is stale
    // too. Through the shell, as `chmod` is above: the temp handle points
    // at the inode the atomic write replaced, not at the path.
    let status = std::process::Command::new("sh")
        .arg("-c")
        .arg("printf 'externo\\n' >> \"$0\"")
        .arg(vault.path().join("Nota.md"))
        .status()
        .unwrap();
    assert!(status.success());
    let refused = ws.write_note("Nota", "meu\n", &after.revision);
    assert!(matches!(refused, Err(CoreError::Write(_))), "{refused:?}");
    // A token the core did not issue.
    assert!(matches!(
        ws.write_note("Nota", "x", "garbage"),
        Err(CoreError::Write(_))
    ));
}

#[test]
fn an_attachment_resolves_by_name_or_stem_and_reads_through_the_core() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let assets = subdir(vault.path(), "assets");
    let deep = subdir(&assets.path().join(""), "deep");
    let _png = note(assets.path(), "Mapa.png", "PNG?");
    let _dup = note(deep.path(), "mapa.png", "deeper");
    let _md = note(
        vault.path(),
        "Nota.md",
        "---\ntags: [a, b]\nnivel: 3\n---\n![[Mapa]] ![[mapa.png]]\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    // Fewest segments wins; the stem and the case are accepted.
    assert_eq!(ws.resolve_file("Mapa").as_deref(), Some("assets/Mapa.png"));
    assert_eq!(
        ws.resolve_file("MAPA.PNG").as_deref(),
        Some("assets/Mapa.png")
    );
    assert_eq!(
        ws.resolve_file("assets/deep/mapa.png").as_deref(),
        Some("assets/deep/mapa.png")
    );
    assert_eq!(ws.resolve_file("nada"), None);
    assert_eq!(ws.read_file("assets/Mapa.png").unwrap(), b"PNG?");
    assert!(ws.read_file("../fora").is_err());
    // Frontmatter as properties.
    let n = ws.read_note("Nota").unwrap();
    assert_eq!(
        n.properties,
        vec![
            ("tags".to_owned(), "a, b".to_owned()),
            ("nivel".to_owned(), "3".to_owned())
        ]
    );
}

#[test]
fn notes_are_created_renamed_with_a_link_plan_and_trashed() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _src = note(
        vault.path(),
        "Origem.md",
        "Ver [[Alvo]], [[alvo.md|apelido]], [[Alvo#Sec]] e `[[Alvo]]` e [[Outra]].\n",
    );
    let _far = subdir(vault.path(), "pasta");
    let _src2 = note(
        &vault.path().join("pasta"),
        "Longe.md",
        "[[../Alvo]] [[Alvo]]\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    // Create, in a folder that does not exist yet; twice is refused.
    let created = ws.create_note("nova/Alvo", "# Alvo\n").unwrap();
    assert_eq!(created.path, "nova/Alvo.md");
    assert!(matches!(
        ws.create_note("nova/Alvo.md", "x"),
        Err(CoreError::Write(verso_core::WriteError::Exists))
    ));
    assert_eq!(ws.backlinks("nova/Alvo").unwrap().unwrap().len(), 4);

    // Rename: the file moves, the index follows, the plan names the two
    // linking notes with their links pointed at the new name — bare names
    // stay bare, the code span is rewritten too (the diff shows it), the
    // alias and the fragment are kept; the unrelated link is untouched.
    let renamed = ws.rename_note("nova/Alvo", "nova/Meta.md").unwrap();
    assert_eq!(renamed.path, "nova/Meta.md");
    assert!(ws.read_note("nova/Meta").is_ok());
    assert!(ws.read_note("nova/Alvo").is_err());
    let plan: Vec<(&str, &str)> = renamed
        .rewrites
        .iter()
        .map(|r| (r.path.as_str(), r.after.as_str()))
        .collect();
    assert_eq!(
        plan,
        [
            (
                "Origem.md",
                "Ver [[Meta]], [[Meta|apelido]], [[Meta#Sec]] e `[[Meta]]` e [[Outra]].\n"
            ),
            ("pasta/Longe.md", "[[../Alvo]] [[Meta]]\n"),
        ],
        "{plan:?}"
    );
    // Nothing but the renamed file was written: the plan is applied by
    // the caller, one atomic write per note, with the revision it carries.
    assert_eq!(
        ws.read_note("Origem").unwrap().text,
        "Ver [[Alvo]], [[alvo.md|apelido]], [[Alvo#Sec]] e `[[Alvo]]` e [[Outra]].\n"
    );
    for w in &renamed.rewrites {
        ws.write_note(&w.path, &w.after, &w.revision).unwrap();
    }
    assert_eq!(ws.backlinks("nova/Meta").unwrap().unwrap().len(), 4);

    // Delete: into .trash/, keeping the relative path; gone from the index.
    let gone = ws.delete_note("nova/Meta").unwrap();
    assert_eq!(gone, ".trash/nova/Meta.md");
    assert!(ws.read_note("nova/Meta").is_err());
    assert!(ws.notes().unwrap().iter().all(|p| p != "nova/Meta.md"));
    assert_eq!(ws.index().unwrap().removed, 0);
}

#[test]
fn any_entry_is_listed_with_size_and_date_renamed_with_a_plan_and_trashed() {
    use verso_core::FileKind;
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _origem = note(
        vault.path(),
        "Origem.md",
        "[[pasta/Alvo]] [[Alvo]] ![[mapa.png]]\n",
    );
    let _mapa = note(vault.path(), "mapa.png", "png");
    let _pasta = subdir(vault.path(), "pasta");
    let _alvo = note(&vault.path().join("pasta"), "Alvo.md", "# Alvo\n");
    let _irmao = note(
        &vault.path().join("pasta"),
        "Irmão.md",
        "[[Alvo]] [[pasta/Alvo]]\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    // The listing: every kind, with the length and a date the walk read.
    let entries = ws.entries();
    let of = |p: &str| entries.iter().find(|e| e.path == p).unwrap();
    assert_eq!(of("pasta").kind, FileKind::Folder);
    assert_eq!(
        (of("mapa.png").kind, of("mapa.png").len),
        (FileKind::File, 3)
    );
    assert_eq!(of("Origem.md").kind, FileKind::Note);
    assert!(of("Origem.md").len > 0 && of("Origem.md").modified > 0);

    // A folder moves with everything under it; the notes that linked by
    // path to a note inside get a plan, read at their new paths; a bare
    // name is left alone.
    let renamed = ws.rename_entry("pasta", "nova").unwrap();
    assert_eq!(renamed.path, "nova");
    assert!(ws.read_note("nova/Alvo").is_ok());
    assert!(ws.read_note("pasta/Alvo").is_err());
    let plan: Vec<(&str, &str)> = renamed
        .rewrites
        .iter()
        .map(|r| (r.path.as_str(), r.after.as_str()))
        .collect();
    assert_eq!(
        plan,
        [
            ("Origem.md", "[[nova/Alvo]] [[Alvo]] ![[mapa.png]]\n"),
            ("nova/Irmão.md", "[[Alvo]] [[nova/Alvo]]\n"),
        ],
        "{plan:?}"
    );
    assert!(ws.folders().contains(&"nova".to_owned()));
    assert!(!ws.folders().contains(&"pasta".to_owned()));
    for w in &renamed.rewrites {
        ws.write_note(&w.path, &w.after, &w.revision).unwrap();
    }

    // An attachment: the embeds that name it are found and rewritten; a
    // bare name stays bare (the file still resolves by name).
    let renamed = ws.rename_entry("mapa.png", "img/mapa2.png").unwrap();
    assert_eq!(renamed.path, "img/mapa2.png");
    assert_eq!(
        renamed
            .rewrites
            .iter()
            .map(|r| (r.path.as_str(), r.after.as_str()))
            .collect::<Vec<_>>(),
        [("Origem.md", "[[nova/Alvo]] [[Alvo]] ![[mapa2.png]]\n")]
    );
    assert_eq!(
        ws.resolve_file("mapa2.png").as_deref(),
        Some("img/mapa2.png")
    );
    assert!(ws.resolve_file("mapa.png").is_none());

    // A note by the same door, `.md` optional, goes through `rename_note`.
    let renamed = ws.rename_entry("nova/Irmão", "nova/Irmã").unwrap();
    assert_eq!(renamed.path, "nova/Irmã.md");

    // The bin takes a folder whole, and a file; the index forgets them.
    assert_eq!(ws.delete_entry("nova").unwrap(), ".trash/nova");
    assert!(ws.notes().unwrap().iter().all(|p| !p.starts_with("nova/")));
    assert!(!ws.folders().contains(&"nova".to_owned()));
    assert_eq!(
        ws.delete_entry("img/mapa2.png").unwrap(),
        ".trash/img/mapa2.png"
    );
    assert!(ws.files().is_empty());
    assert_eq!(ws.index().unwrap().removed, 0);
}
