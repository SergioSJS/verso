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
use verso_core::{CoreError, PropertyValue, Sidecar, SkipReason, Workspace};

#[cfg(test)]
mod support {
    use super::*;

    /// A note with exactly this name (no random part), kept until dropped.
    pub fn note(dir: &Path, name: &str, content: &str) -> NamedTempFile {
        bytes(dir, name, content.as_bytes())
    }

    /// A file with exactly this name and these bytes, kept until dropped.
    pub fn bytes(dir: &Path, name: &str, content: &[u8]) -> NamedTempFile {
        let mut file = Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempfile_in(dir)
            .unwrap();
        file.write_all(content).unwrap();
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

    /// The bytes of a file of the folder, read through `verso-fs`, as the
    /// guardrail asks of this crate's tests.
    pub fn on_disk(vault: &Path, relative: &str) -> Vec<u8> {
        let mut root = verso_fs::Root::open(vault, vec![]).unwrap();
        let h = root.handle(Path::new(relative)).unwrap();
        root.read(h).unwrap().0
    }

    /// Whether a file of the folder exists, through `verso-fs`.
    pub fn exists(vault: &Path, relative: &str) -> bool {
        let mut root = verso_fs::Root::open(vault, vec![]).unwrap();
        let h = root.handle(Path::new(relative)).unwrap();
        !matches!(root.read(h), Err(verso_fs::ReadError::Io(_)))
    }

    /// `path` and `after` of each rewrite of a plan.
    pub fn plan_of(r: &verso_core::Renamed) -> Vec<(&str, &str)> {
        r.rewrites
            .iter()
            .map(|w| (w.path.as_str(), w.after.as_str()))
            .collect()
    }

    /// Apply a plan the way the UI does: one write per note, with the
    /// revision the plan carries.
    pub fn apply(ws: &mut Workspace, r: &verso_core::Renamed) {
        for w in &r.rewrites {
            ws.write_note(&w.path, &w.after, &w.revision).unwrap();
        }
    }

    pub fn resolved(ws: &mut Workspace, note: &str) -> Vec<Option<String>> {
        ws.links(note)
            .unwrap()
            .unwrap()
            .into_iter()
            .map(|l| l.resolved)
            .collect()
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
    assert!(r.warnings.is_empty(), "{r:?}");
    // The evicted attachment is present too: listed under its real name.
    assert_eq!(ws.files(), vec!["Mapa.png"]);

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
    assert!(
        r.changed.is_empty() && r.gone.is_empty() && !r.listing_changed,
        "{r:?}"
    );

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
    // By name, for a window showing one of them.
    let mut changed = r.changed.clone();
    changed.sort();
    assert_eq!(changed, vec!["Nova.md", "Taverna.md"]);
    assert_eq!(r.gone, vec!["Barão Vermelho.md"]);
    assert!(r.listing_changed);
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
    assert_eq!(plain.key(), dotted.key());
}

/// The folder crosses the contract as a name and a key, never as a path
/// (ADR 0026 rule 4): the key reopens it, and nothing else does.
#[test]
fn a_folder_is_named_by_its_key_and_reopened_by_it() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = note(vault.path(), "Uma.md", "# Uma\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let key = ws.key();
    let name = ws.name();
    assert_eq!(name, vault.path().file_name().unwrap().to_string_lossy());
    // A key is one file name: letters, digits and `-`, nothing a path is
    // made of; it is the index file's stem, so it is stable.
    assert!(
        !key.is_empty() && key.chars().all(|c| c.is_alphanumeric() || c == '-'),
        "{key}"
    );
    assert_eq!(
        ws.index_path().file_name().unwrap().to_string_lossy(),
        format!("{key}.sqlite")
    );
    let again = Workspace::reopen(&key, Some(config.path())).unwrap();
    assert_eq!(again.folder(), ws.folder());
    assert_eq!(again.index_path(), ws.index_path());
    // A key that is not one this core issued names nothing, and is refused
    // before anything is looked up; an unknown one is not found.
    for bad in [
        "",
        "../x",
        "/etc/passwd",
        "a/b-0123456789abcdef",
        "x-ABCDEF0123456789",
        "só-hash",
    ] {
        assert!(
            matches!(
                Workspace::reopen(bad, Some(config.path())),
                Err(CoreError::InvalidKey)
            ),
            "{bad:?}"
        );
    }
    assert!(matches!(
        Workspace::reopen("nada-0123456789abcdef", Some(config.path())),
        Err(CoreError::UnknownFolder)
    ));
    // The folder is gone: not found, whatever the sidecar still says.
    let name_of_gone = key.clone();
    drop(ws);
    drop(vault);
    assert!(matches!(
        Workspace::reopen(&name_of_gone, Some(config.path())),
        Err(CoreError::UnknownFolder)
    ));
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
    // Shown as one line with the relative path, not a debug dump.
    let line = r.problems[0].to_string();
    assert!(
        line.starts_with("sub: ") && !line.contains("Io {"),
        "{line}"
    );
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

    // Confinement on every path, disk or index (ADR 0044), at every door
    // — the ones that read, the ones that write, the ones that move.
    let revision = t.revision.clone();
    for bad in ["../fora", "/etc/passwd", ".obsidian/app", "a\u{0}b", ""] {
        let confined = |r: Result<(), CoreError>| matches!(r, Err(CoreError::Confined(_)));
        assert!(confined(ws.read_note(bad).map(drop)), "read_note {bad:?}");
        assert!(confined(ws.backlinks(bad).map(drop)), "backlinks {bad:?}");
        assert!(confined(ws.links(bad).map(drop)), "links {bad:?}");
        assert!(
            confined(ws.is_unverified(bad).map(drop)),
            "is_unverified {bad:?}"
        );
        assert!(confined(ws.read_text(bad).map(drop)), "read_text {bad:?}");
        assert!(confined(ws.read_file(bad).map(drop)), "read_file {bad:?}");
        assert!(confined(ws.absolute(bad).map(drop)), "absolute {bad:?}");
        assert!(
            confined(ws.write_note(bad, "x", &revision).map(drop)),
            "write_note {bad:?}"
        );
        assert!(
            confined(ws.write_text(bad, "x", &revision).map(drop)),
            "write_text {bad:?}"
        );
        assert!(
            confined(ws.create_note(bad, "x").map(drop)),
            "create_note {bad:?}"
        );
        assert!(
            confined(ws.create_file(bad, b"x").map(drop)),
            "create_file {bad:?}"
        );
        assert!(
            confined(ws.create_folder(bad).map(drop)),
            "create_folder {bad:?}"
        );
        assert!(
            confined(ws.rename_note(bad, "Nova").map(drop)),
            "rename_note from {bad:?}"
        );
        assert!(
            confined(ws.rename_note("Nota", bad).map(drop)),
            "rename_note to {bad:?}"
        );
        assert!(
            confined(ws.rename_entry(bad, "Nova.md").map(drop)),
            "rename_entry from {bad:?}"
        );
        assert!(
            confined(ws.rename_entry("Nota.md", bad).map(drop)),
            "rename_entry to {bad:?}"
        );
        assert!(
            confined(ws.delete_note(bad).map(drop)),
            "delete_note {bad:?}"
        );
        assert!(
            confined(ws.delete_entry(bad).map(drop)),
            "delete_entry {bad:?}"
        );
        assert_eq!(
            ws.resolve_file("Nota.md", bad),
            None,
            "resolve_file {bad:?}"
        );
    }
    // Nothing moved, nothing was made: the note is still the only entry.
    assert_eq!(ws.read_note("Nota").unwrap().lines, vec!["# Novo"]);
    ws.index().unwrap();
    assert_eq!(ws.notes().unwrap(), vec!["Nota.md"]);
    assert!(ws.files().is_empty() && ws.folders().is_empty());
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
    // `0600`, as the index file (ADR 0046), whatever the umask. Asked of
    // `ls`, since this crate's lint keeps `std::fs::metadata` from it.
    #[cfg(unix)]
    {
        let listing = std::process::Command::new("ls")
            .arg("-ln")
            .arg(Sidecar::path_for(ws.index_path()))
            .output()
            .unwrap();
        let listing = String::from_utf8(listing.stdout).unwrap();
        assert!(listing.starts_with("-rw------- "), "{listing}");
    }
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
    // The revision handed back is the one the file now carries.
    assert_eq!(ws.read_note("Nota").unwrap().revision, after.revision);

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

/// Invariant 11 across a race: what `write_note` hands back describes the
/// bytes it wrote, never a re-read that someone else may have replaced
/// in the meantime. An external save lands shortly after each write; the
/// answer must still be the caller's text, and its revision must never
/// let the next save pass over the external one.
#[test]
fn write_note_answers_the_text_and_revision_of_the_bytes_it_wrote() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _n = note(vault.path(), "N.md", "start\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let file = vault.path().join("N.md");
    for attempt in 0..150u64 {
        let Ok(before) = ws.read_note("N") else {
            continue;
        };
        let target = file.clone();
        // The other app: it saves through the shell, as the tests above do,
        // a moment after this write starts.
        let other = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_micros(100 + (attempt % 30) * 120));
            let _ = std::process::Command::new("sh")
                .arg("-c")
                .arg("printf 'EXTERNAL\\n' > \"$0\"")
                .arg(&target)
                .status();
        });
        let mine = format!("mine {attempt}\n");
        let written = ws.write_note("N", &mine, &before.revision);
        other.join().unwrap();
        let Ok(written) = written else { continue };
        assert_eq!(
            written.note.text, mine,
            "attempt {attempt}: not the bytes written"
        );
        // If the external save came after ours, the disk holds it, and the
        // revision we hold must not open the door to overwriting it.
        let disk = on_disk(vault.path(), "N.md");
        if disk != mine.as_bytes() {
            let next = ws.write_note("N", "mine again\n", &written.note.revision);
            assert!(
                matches!(
                    next,
                    Err(CoreError::Write(verso_core::WriteError::Changed { .. }))
                ),
                "attempt {attempt}: a save over someone else's text was accepted"
            );
        }
    }
}

/// Bytes that are not UTF-8 are not text (spec Q25): no editor
/// receives a lossy copy, and no plan rewrites the file — the file is
/// left alone and said so (invariant 8).
#[test]
fn a_file_that_is_not_utf8_has_no_text_and_is_left_out_of_a_plan() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _alvo = note(vault.path(), "Alvo.md", "# Alvo\n");
    let latin1 = b"caf\xe9 [[Alvo]]\n";
    let _x = bytes(vault.path(), "X.md", latin1);
    let _y = note(vault.path(), "Y.md", "[[Alvo]]\n");
    let _data = bytes(vault.path(), "dados.txt", b"\xff\xfe");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert!(matches!(ws.read_note("X"), Err(CoreError::NotText)));
    assert!(matches!(ws.read_text("X.md"), Err(CoreError::NotText)));
    assert!(matches!(ws.read_text("dados.txt"), Err(CoreError::NotText)));
    // Search still sees it (decoded lossily, written back never).
    assert_eq!(ws.search("caf", 10).unwrap().len(), 1);
    // The rename happens; X is reported, not rewritten.
    let r = ws.rename_note("Alvo", "Meta").unwrap();
    assert_eq!(plan_of(&r), vec![("Y.md", "[[Meta]]\n")]);
    assert_eq!(r.skipped.len(), 1, "{:?}", r.skipped);
    assert_eq!(
        (r.skipped[0].path.as_str(), r.skipped[0].reason),
        ("X.md", SkipReason::NotText)
    );
    apply(&mut ws, &r);
    assert_eq!(on_disk(vault.path(), "X.md"), latin1);
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
        "---\ntags: [a, b]\nnivel: 3\nmeta: {x: 1}\nnums: [1, 2]\n---\n![[Mapa]] ![[mapa.png]]\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    // Fewest segments wins; the stem and the case are accepted.
    assert_eq!(
        ws.resolve_file("Nota.md", "Mapa").as_deref(),
        Some("assets/Mapa.png")
    );
    assert_eq!(
        ws.resolve_file("Nota.md", "MAPA.PNG").as_deref(),
        Some("assets/Mapa.png")
    );
    assert_eq!(
        ws.resolve_file("Nota.md", "assets/deep/mapa.png")
            .as_deref(),
        Some("assets/deep/mapa.png")
    );
    assert_eq!(ws.resolve_file("Nota.md", "nada"), None);
    assert_eq!(ws.read_file("assets/Mapa.png").unwrap(), b"PNG?");
    assert!(ws.read_file("../fora").is_err());
    // Frontmatter as properties: a mapping or a list that is not all
    // strings is one line the panel never edits.
    let n = ws.read_note("Nota").unwrap();
    assert_eq!(
        n.properties,
        vec![
            (
                "tags".to_owned(),
                PropertyValue::List(vec!["a".to_owned(), "b".to_owned()])
            ),
            ("nivel".to_owned(), PropertyValue::Number("3".to_owned())),
            ("meta".to_owned(), PropertyValue::Nested("x: 1".to_owned())),
            ("nums".to_owned(), PropertyValue::Nested("1, 2".to_owned())),
        ]
    );
}

/// Spec Q12 applies to embeds: from under the note's own folder first,
/// `..` honoured, a path from the root before a bare name.
#[test]
fn an_embed_resolves_from_its_note_by_the_rule_of_q12() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let a = subdir(vault.path(), "a");
    let b = subdir(vault.path(), "b");
    let c = subdir(vault.path(), "c");
    let _fa = note(a.path(), "foto.png", "a");
    let _fb = note(b.path(), "foto.png", "b");
    let _fc = note(c.path(), "outra.png", "c");
    let _nb = note(b.path(), "Nota.md", "![[foto.png]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let from = |ws: &Workspace, s: &str, t: &str| ws.resolve_file(s, t);
    // The note's own folder first; elsewhere the fewest segments, then
    // byte order (`a/` before `b/`).
    assert_eq!(
        from(&ws, "b/Nota.md", "foto.png").as_deref(),
        Some("b/foto.png")
    );
    assert_eq!(
        from(&ws, "b/Nota.md", "foto").as_deref(),
        Some("b/foto.png")
    );
    assert_eq!(
        from(&ws, "c/Outra.md", "foto.png").as_deref(),
        Some("a/foto.png")
    );
    assert_eq!(
        from(&ws, "Raiz.md", "FOTO.PNG").as_deref(),
        Some("a/foto.png")
    );
    // A path from the root, and one read from the note's folder.
    assert_eq!(
        from(&ws, "b/Nota.md", "a/foto.png").as_deref(),
        Some("a/foto.png")
    );
    // Q12 point 3, as the maintainer amended it on 2026-09-23: a file
    // anywhere under the note's folder beats a shallower one elsewhere.
    let deep = subdir(c.path(), "mapas");
    let _fd = note(deep.path(), "foto.png", "c/mapas");
    ws.index().unwrap();
    assert_eq!(
        from(&ws, "c/Outra.md", "foto.png").as_deref(),
        Some("c/mapas/foto.png")
    );
    assert_eq!(
        from(&ws, "b/Nota.md", "../a/foto.png").as_deref(),
        Some("a/foto.png")
    );
    assert_eq!(
        from(&ws, "c/x/Deep.md", "../outra.png").as_deref(),
        Some("c/outra.png")
    );
    assert_eq!(
        from(&ws, "b/Nota.md", "foto.png|300").as_deref(),
        Some("b/foto.png")
    );
    assert_eq!(from(&ws, "b/Nota.md", "nada.png"), None);
    // A file at the root is a path from the root, and comes before any
    // bare-name preference — the same order the index applies to notes.
    let _root = note(vault.path(), "foto.png", "r");
    ws.index().unwrap();
    assert_eq!(
        from(&ws, "b/Nota.md", "foto.png").as_deref(),
        Some("foto.png")
    );
    // `./` reads the path from the note's folder only (Q12 point 2, its
    // order stated on 2026-09-23, as Obsidian 1.13.7 reads it).
    assert_eq!(
        from(&ws, "b/Nota.md", "./foto.png").as_deref(),
        Some("b/foto.png")
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
    assert!(!created.stale);
    assert!(matches!(
        ws.create_note("nova/Alvo.md", "x"),
        Err(CoreError::Write(verso_core::WriteError::Exists))
    ));
    assert_eq!(ws.backlinks("nova/Alvo").unwrap().unwrap().len(), 4);

    // Rename: the file moves, the index follows, the plan names the two
    // linking notes with their links pointed at the new name — bare names
    // stay bare, the extension stays when it was written, the alias and
    // the fragment are kept; the code span is text, not a link, and the
    // unrelated link is untouched.
    let renamed = ws.rename_note("nova/Alvo", "nova/Meta.md").unwrap();
    assert_eq!(renamed.path, "nova/Meta.md");
    assert!(
        renamed.skipped.is_empty() && renamed.warnings.is_empty(),
        "{renamed:?}"
    );
    assert!(ws.read_note("nova/Meta").is_ok());
    assert!(ws.read_note("nova/Alvo").is_err());
    assert_eq!(
        plan_of(&renamed),
        [
            (
                "Origem.md",
                "Ver [[Meta]], [[Meta.md|apelido]], [[Meta#Sec]] e `[[Alvo]]` e [[Outra]].\n"
            ),
            ("pasta/Longe.md", "[[../Alvo]] [[Meta]]\n"),
        ]
    );
    // Nothing but the renamed file was written: the plan is applied by
    // the caller, one atomic write per note, with the revision it carries.
    assert_eq!(
        ws.read_note("Origem").unwrap().text,
        "Ver [[Alvo]], [[alvo.md|apelido]], [[Alvo#Sec]] e `[[Alvo]]` e [[Outra]].\n"
    );
    apply(&mut ws, &renamed);
    assert_eq!(ws.backlinks("nova/Meta").unwrap().unwrap().len(), 4);

    // Delete: into .trash/, keeping the relative path; gone from the index.
    let gone = ws.delete_note("nova/Meta").unwrap();
    assert_eq!(gone.path, ".trash/nova/Meta.md");
    assert!(gone.warnings.is_empty(), "{gone:?}");
    assert!(ws.read_note("nova/Meta").is_err());
    assert!(ws.notes().unwrap().iter().all(|p| p != "nova/Meta.md"));
    assert_eq!(ws.index().unwrap().removed, 0);
}

/// A move can change what a link that never named the moved note
/// reaches: a note renamed to `B` at the root comes before `x/B` for
/// every bare `[[B]]` (a path from the root is tried first). Those links
/// get a plan too, pointing them back at what they reached.
#[test]
fn a_note_moved_into_a_bare_links_way_gets_that_link_a_plan() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let x = subdir(vault.path(), "x");
    let _b = note(x.path(), "B.md", "# x/B\n");
    let _c = note(vault.path(), "C.md", "# C\n");
    let _r = note(vault.path(), "R.md", "[[B]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(resolved(&mut ws, "R"), vec![Some("x/B.md".into())]);
    let r = ws.rename_note("C", "B").unwrap();
    assert_eq!(plan_of(&r), [("R.md", "[[x/B]]\n")]);
    apply(&mut ws, &r);
    assert_eq!(resolved(&mut ws, "R"), vec![Some("x/B.md".into())]);
}

/// A new name the parser would read as something else — a `|` starts an
/// alias, a `#` a heading, `]]` ends the link — cannot be written into a
/// link: the plan leaves such a link alone and says so, rather than point
/// it at another note.
#[test]
fn a_new_name_a_link_cannot_hold_is_not_written_into_links() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _alvo = note(vault.path(), "Alvo.md", "# Alvo\n");
    let _a = note(vault.path(), "A.md", "# A\n");
    let _x = note(vault.path(), "X.md", "[[Alvo]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    for to in ["A|B", "A#B", "x]]y"] {
        let r = ws.rename_note("Alvo", to).unwrap();
        assert!(r.rewrites.is_empty(), "{to}: {:?}", r.rewrites);
        assert!(
            r.warnings
                .iter()
                .any(|w| w.contains("could not be pointed at")),
            "{to}: {:?}",
            r.warnings
        );
        // Nothing was written, so X still says `[[Alvo]]`, which now
        // reaches nothing — and never `A.md` or X itself.
        assert_eq!(resolved(&mut ws, "X"), vec![None], "{to}");
        // Back, for the next name: the link reaches it again as written.
        let back = ws.rename_note(to, "Alvo").unwrap();
        assert!(back.rewrites.is_empty(), "{to}: {:?}", back.rewrites);
    }
}

/// The plan follows what each link resolved to (spec Q12), not its text:
/// a link whose text matches but that reached another note is left
/// alone; a bare name that a move would send elsewhere becomes a path.
#[test]
fn the_plan_rewrites_only_the_links_that_reached_the_moved_note() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let a = subdir(vault.path(), "a");
    let b = subdir(vault.path(), "b");
    let z = subdir(vault.path(), "z");
    let _alvo_a = note(a.path(), "Alvo.md", "# A\n");
    let _alvo_b = note(b.path(), "Alvo.md", "# B\n");
    let _x = note(b.path(), "X.md", "[[a/Alvo]] [[Alvo]]\n");
    let _y = note(a.path(), "Y.md", "[[Alvo]] [[Alvo.MD|x]]\n");
    let _q = note(z.path(), "Q.md", "[[Alvo]]\n");
    let _doc = note(
        vault.path(),
        "Doc.md",
        "[[a/Alvo]]\n\n```markdown\n[[a/Alvo]]\n```\n",
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(
        resolved(&mut ws, "b/X"),
        vec![Some("a/Alvo.md".into()), Some("b/Alvo.md".into())]
    );
    assert_eq!(resolved(&mut ws, "z/Q"), vec![Some("a/Alvo.md".into())]);

    // A rename in place: the bare link of `b/X` reached `b/Alvo` and stays;
    // the fenced block is text; `z/Q`'s bare name still reaches by name.
    let r = ws.rename_note("a/Alvo", "a/Meta").unwrap();
    assert_eq!(
        plan_of(&r),
        [
            ("Doc.md", "[[a/Meta]]\n\n```markdown\n[[a/Alvo]]\n```\n"),
            ("a/Y.md", "[[Meta]] [[Meta.MD|x]]\n"),
            ("b/X.md", "[[a/Meta]] [[Alvo]]\n"),
            ("z/Q.md", "[[Meta]]\n"),
        ]
    );
    apply(&mut ws, &r);
    assert_eq!(
        resolved(&mut ws, "b/X"),
        vec![Some("a/Meta.md".into()), Some("b/Alvo.md".into())]
    );

    // A new name taken at the root: a bare `[[Meta]]` would reach the root
    // note (a path from the root comes first), so the plan writes a path.
    let _root_meta = note(vault.path(), "Alvo.md", "# root\n");
    ws.index().unwrap();
    let r = ws.rename_note("a/Meta", "a/Alvo").unwrap();
    assert_eq!(
        plan_of(&r),
        [
            ("Doc.md", "[[a/Alvo]]\n\n```markdown\n[[a/Alvo]]\n```\n"),
            ("a/Y.md", "[[a/Alvo]] [[a/Alvo.MD|x]]\n"),
            ("b/X.md", "[[a/Alvo]] [[Alvo]]\n"),
            ("z/Q.md", "[[a/Alvo]]\n"),
        ]
    );
    apply(&mut ws, &r);
    assert_eq!(resolved(&mut ws, "z/Q"), vec![Some("a/Alvo.md".into())]);
    assert_eq!(resolved(&mut ws, "a/Y"), vec![Some("a/Alvo.md".into()); 2]);
}

/// Moving a note out of its folder can send a bare link of a sibling to
/// another note of the same name (ADR 0048, requirement of 2026-09-22):
/// the plan says so with a path instead of letting it happen in silence.
#[test]
fn a_move_that_would_retarget_a_bare_link_gets_a_plan_not_silence() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let a = subdir(vault.path(), "a");
    let b = subdir(vault.path(), "b");
    let _alvo_a = note(a.path(), "Alvo.md", "# A\n\n[[../b/Alvo|irmão]]\n");
    let _alvo_b = note(b.path(), "Alvo.md", "# B\n");
    let _x = note(a.path(), "X.md", "[[Alvo]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(resolved(&mut ws, "a/X"), vec![Some("a/Alvo.md".into())]);
    let r = ws.rename_note("a/Alvo", "c/d/Alvo").unwrap();
    // The sibling's bare name would now reach `b/Alvo`; the moved note's
    // own relative link would reach nothing from `c/d/`. Both get a path.
    assert_eq!(
        plan_of(&r),
        [
            ("a/X.md", "[[c/d/Alvo]]\n"),
            ("c/d/Alvo.md", "# A\n\n[[b/Alvo|irmão]]\n"),
        ]
    );
    apply(&mut ws, &r);
    assert_eq!(resolved(&mut ws, "a/X"), vec![Some("c/d/Alvo.md".into())]);
    assert_eq!(
        resolved(&mut ws, "c/d/Alvo"),
        vec![Some("b/Alvo.md".into())]
    );
}

/// A rename that happened is reported as such: a linker that cannot be
/// read is skipped and named, and a sidecar that cannot be written is a
/// warning — never a failure that hides the move (ADR 0048).
#[test]
fn a_rename_that_happened_reports_what_it_could_not_plan_or_confirm() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _alvo = note(vault.path(), "Alvo.md", "# Alvo\n");
    let x = note(vault.path(), "X.md", "[[Alvo]]\n");
    let _y = note(vault.path(), "Y.md", "[[Alvo]]\n");
    let _mapa = note(vault.path(), "mapa.png", "png");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    // X is evicted by iCloud (older form) after it was indexed.
    drop(x);
    let _evicted = note(vault.path(), ".X.md.icloud", "<plist/>");
    ws.index().unwrap();
    let r = ws.rename_note("Alvo", "Meta").unwrap();
    assert_eq!(r.path, "Meta.md");
    assert_eq!(plan_of(&r), vec![("Y.md", "[[Meta]]\n")]);
    assert_eq!(
        r.skipped
            .iter()
            .map(|s| (s.path.as_str(), s.reason))
            .collect::<Vec<_>>(),
        vec![("X.md", SkipReason::Unavailable)]
    );
    assert!(exists(vault.path(), "Meta.md") && !exists(vault.path(), "Alvo.md"));
    // The evicted note kept its last known version, whose link now points
    // at the old name like the one the plan could not touch.
    apply(&mut ws, &r);
    assert_eq!(ws.backlinks("Meta").unwrap().unwrap().len(), 1);
    assert_eq!(ws.is_unverified("X").unwrap(), Some(true));
    let unresolved = ws.unresolved().unwrap();
    assert_eq!(
        (unresolved[0].target.as_str(), unresolved[0].count),
        ("Alvo", 1)
    );
    // A retry is what it is: the source is gone.
    assert!(matches!(
        ws.rename_note("Alvo", "Meta"),
        Err(CoreError::Write(_))
    ));

    // The index directory cannot take the sidecar: the move is answered,
    // with the sidecar failure as a warning.
    let index_dir = ws.index_path().parent().unwrap().to_path_buf();
    let chmod = |mode: &str| {
        assert!(
            std::process::Command::new("chmod")
                .arg(mode)
                .arg(&index_dir)
                .status()
                .unwrap()
                .success()
        );
    };
    chmod("500");
    let r = ws.rename_entry("mapa.png", "mapa2.png");
    chmod("700");
    let r = r.unwrap();
    assert_eq!(r.path, "mapa2.png");
    assert!(
        r.warnings.iter().any(|w| w.contains("sidecar")),
        "{:?}",
        r.warnings
    );
    assert!(exists(vault.path(), "mapa2.png"));
}

#[test]
fn any_entry_is_listed_with_size_and_date_renamed_with_a_plan_and_trashed() {
    use verso_core::FileKind;
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _origem = note(
        vault.path(),
        "Origem.md",
        "[[pasta/Alvo]] [[Alvo]] ![[mapa.png]] ![[pasta/planta.png]]\n",
    );
    let _mapa = note(vault.path(), "mapa.png", "png");
    let _pasta = subdir(vault.path(), "pasta");
    let _planta = note(&vault.path().join("pasta"), "planta.png", "png");
    let _alvo = note(&vault.path().join("pasta"), "Alvo.md", "# Alvo\n");
    let _irmao = note(
        &vault.path().join("pasta"),
        "Irmão.md",
        "[[Alvo]] [[pasta/Alvo]] ![[planta.png]]\n",
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
    // path to a note or an attachment inside get a plan, read at their
    // new paths; a bare name that still reaches its target is left alone.
    let renamed = ws.rename_entry("pasta", "nova").unwrap();
    assert_eq!(renamed.path, "nova");
    assert!(
        renamed.skipped.is_empty() && renamed.warnings.is_empty(),
        "{renamed:?}"
    );
    assert!(ws.read_note("nova/Alvo").is_ok());
    assert!(ws.read_note("pasta/Alvo").is_err());
    assert_eq!(
        plan_of(&renamed),
        [
            (
                "Origem.md",
                "[[nova/Alvo]] [[Alvo]] ![[mapa.png]] ![[nova/planta.png]]\n"
            ),
            ("nova/Irmão.md", "[[Alvo]] [[nova/Alvo]] ![[planta.png]]\n"),
        ]
    );
    assert!(ws.folders().contains(&"nova".to_owned()));
    assert!(!ws.folders().contains(&"pasta".to_owned()));
    apply(&mut ws, &renamed);

    // An attachment: the embeds that reached it are rewritten; a bare
    // name stays bare when the file still resolves by name.
    let renamed = ws.rename_entry("mapa.png", "img/mapa2.png").unwrap();
    assert_eq!(renamed.path, "img/mapa2.png");
    assert_eq!(
        plan_of(&renamed),
        [(
            "Origem.md",
            "[[nova/Alvo]] [[Alvo]] ![[mapa2.png]] ![[nova/planta.png]]\n"
        )]
    );
    assert_eq!(
        ws.resolve_file("Origem.md", "mapa2.png").as_deref(),
        Some("img/mapa2.png")
    );
    assert!(ws.resolve_file("Origem.md", "mapa.png").is_none());

    // A note by the same door goes through `rename_note`.
    let renamed = ws.rename_entry("nova/Irmão.md", "nova/Irmã.md").unwrap();
    assert_eq!(renamed.path, "nova/Irmã.md");

    // The bin takes a folder whole, and a file; the index forgets them.
    let gone = ws.delete_entry("nova").unwrap();
    assert_eq!(gone.path, ".trash/nova");
    assert!(gone.warnings.is_empty(), "{gone:?}");
    assert!(ws.notes().unwrap().iter().all(|p| !p.starts_with("nova/")));
    assert!(!ws.folders().contains(&"nova".to_owned()));
    assert_eq!(
        ws.delete_entry("img/mapa2.png").unwrap().path,
        ".trash/img/mapa2.png"
    );
    assert!(ws.files().is_empty());
    assert_eq!(ws.index().unwrap().removed, 0);
}

/// A file beside a note of the same stem is its own entry: a file
/// operation on `README` never reaches `README.md`.
#[test]
fn a_file_beside_a_note_of_the_same_stem_is_its_own_entry() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _readme = note(vault.path(), "README", "plain file\n");
    let _readme_md = note(vault.path(), "README.md", "# the note\n");
    let _todo = note(vault.path(), "TODO", "plain\n");
    let _todo_md = note(vault.path(), "TODO.md", "# todo note\n");
    let _dados = note(vault.path(), "dados", "d\n");
    let _dados_md = note(vault.path(), "dados.md", "# dados\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(ws.delete_entry("README").unwrap().path, ".trash/README");
    assert!(exists(vault.path(), "README.md") && !exists(vault.path(), "README"));
    assert_eq!(ws.rename_entry("TODO", "FEITO").unwrap().path, "FEITO");
    assert!(exists(vault.path(), "TODO.md") && exists(vault.path(), "FEITO"));
    let plain = ws.read_text("dados").unwrap();
    assert_eq!(plain.text, "d\n");
    let written = ws.write_text("dados", "e\n", &plain.revision).unwrap();
    assert_eq!(written.path, "dados");
    assert_eq!(on_disk(vault.path(), "dados.md"), b"# dados\n");
    assert_eq!(
        ws.notes().unwrap(),
        vec!["README.md", "TODO.md", "dados.md"]
    );
}

/// A folder move keeps what the index knew of an evicted note (ADR 0043
/// decision 2), and an evicted attachment is present, not absent.
#[test]
fn a_folder_move_keeps_the_last_known_version_of_an_evicted_note() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let pasta = subdir(vault.path(), "pasta");
    let img = subdir(vault.path(), "img");
    let x = note(pasta.path(), "X.md", "palavraunica [[Alvo]]\n");
    let _alvo = note(vault.path(), "Alvo.md", "# Alvo\n");
    let _n = note(vault.path(), "N.md", "![[mapa.png]]\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    drop(x);
    let _evicted = note(pasta.path(), ".X.md.icloud", "<plist/>");
    let _evicted_png = note(img.path(), ".mapa.png.icloud", "<plist/>");
    let r = ws.index().unwrap();
    assert_eq!((r.placeholders, r.removed), (2, 0), "{r:?}");
    assert_eq!(ws.search("palavraunica", 10).unwrap().len(), 1);

    let r = ws.rename_entry("pasta", "nova").unwrap();
    assert_eq!(r.path, "nova");
    assert_eq!(ws.notes().unwrap(), vec!["Alvo.md", "N.md", "nova/X.md"]);
    assert_eq!(ws.search("palavraunica", 10).unwrap()[0].path, "nova/X.md");
    assert_eq!(ws.is_unverified("nova/X").unwrap(), Some(true));
    assert_eq!(ws.backlinks("Alvo").unwrap().unwrap()[0].from, "nova/X.md");
    // The moved placeholder could not be read for the plan, and says so.
    assert_eq!(
        r.skipped
            .iter()
            .map(|s| (s.path.as_str(), s.reason))
            .collect::<Vec<_>>(),
        vec![("nova/X.md", SkipReason::Unavailable)]
    );

    // The evicted attachment resolves, and reading it says unavailable.
    assert_eq!(
        ws.resolve_file("N.md", "mapa.png").as_deref(),
        Some("img/mapa.png")
    );
    assert!(matches!(
        ws.read_file("img/mapa.png"),
        Err(CoreError::Read(verso_fs::ReadError::Unavailable))
    ));
}

#[test]
fn any_text_file_is_read_and_written_over_its_revision() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _data = note(vault.path(), "dados.json", "{\"a\": 1}\n");
    let _nota = note(vault.path(), "Nota.md", "# Nota\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let read = ws.read_text("dados.json").unwrap();
    assert_eq!(read.text, "{\"a\": 1}\n");
    let written = ws
        .write_text("dados.json", "{\"a\": 2}\n", &read.revision)
        .unwrap();
    assert_eq!(written.text, "{\"a\": 2}\n");
    assert_ne!(written.revision, read.revision);
    assert_eq!(
        ws.read_text("dados.json").unwrap().revision,
        written.revision
    );
    // The old revision no longer describes the file: refused, unchanged.
    assert!(matches!(
        ws.write_text("dados.json", "{}", &read.revision),
        Err(CoreError::Write(verso_core::WriteError::Changed { .. }))
    ));
    assert_eq!(ws.read_text("dados.json").unwrap().text, "{\"a\": 2}\n");
    // A note by this door is indexed like any note.
    let nota = ws.read_text("Nota.md").unwrap();
    ws.write_text("Nota.md", "# Nota\n\n[[Alvo]]\n", &nota.revision)
        .unwrap();
    assert_eq!(ws.links("Nota").unwrap().unwrap().len(), 1);
}

/// A symlink's target is named relative to the folder, or only as
/// outside it: no absolute path crosses (ADR 0026 rule 4).
#[cfg(unix)]
#[test]
fn a_write_through_a_symlink_names_the_target_without_a_path_outside() {
    // The links are made by `ln`: this crate's lint keeps disk access in
    // verso-fs (ADR 0026 rule 5), and a fixture is no reason for an
    // `#[allow]`.
    let symlink = |target: &Path, at: &Path| {
        let made = std::process::Command::new("ln")
            .arg("-s")
            .arg(target)
            .arg(at)
            .status()
            .unwrap()
            .success();
        assert!(made, "ln -s {} {}", target.display(), at.display());
    };
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let _real = note(outside.path(), "Real.md", "# real\n");
    let _inside = note(vault.path(), "Dentro.md", "# dentro\n");
    symlink(
        &outside.path().join("Real.md"),
        &vault.path().join("Fora.md"),
    );
    symlink(
        &vault.path().join("Dentro.md"),
        &vault.path().join("Atalho.md"),
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let n = ws.read_note("Fora").unwrap();
    let w = ws.write_note("Fora", "# changed\n", &n.revision).unwrap();
    let outside_str = outside.path().to_string_lossy().into_owned();
    assert!(
        w.warnings.iter().any(|l| l.contains("outside the folder")),
        "{:?}",
        w.warnings
    );
    assert!(
        w.warnings
            .iter()
            .all(|l| !l.contains(&outside_str) && !l.contains("/")),
        "{:?}",
        w.warnings
    );
    let n = ws.read_note("Atalho").unwrap();
    let w = ws.write_note("Atalho", "# changed\n", &n.revision).unwrap();
    assert!(
        w.warnings
            .iter()
            .any(|l| l == "written through a symlink to Dentro.md"),
        "{:?}",
        w.warnings
    );
}

#[test]
fn web_notes_and_the_whole_graph_come_from_the_index() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _a = note(vault.path(), "A.md", "[[B]] e [[C]]\n");
    let _b = note(vault.path(), "B.md", "[[C]]\n");
    let _c = note(
        vault.path(),
        "C.md",
        "---\nurl: https://example.org/x\n---\n",
    );
    let _d = note(vault.path(), "D.md", "---\nurl: not-a-url\n---\nsolta\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(
        ws.web_notes().unwrap(),
        vec![("C.md".to_owned(), "https://example.org/x".to_owned())]
    );
    let mut edges = ws.graph().unwrap();
    edges.sort();
    assert_eq!(
        edges,
        vec![
            ("A.md".to_owned(), "B.md".to_owned()),
            ("A.md".to_owned(), "C.md".to_owned()),
            ("B.md".to_owned(), "C.md".to_owned()),
        ]
    );
}

/// A note created by another app while the folder is open: the watch says
/// something changed, and the next index run finds what (the watcher,
/// provisional: `docs/reference/watcher-decision.md`).
#[test]
fn a_note_made_outside_reaches_the_index_through_the_watch() {
    use std::time::{Duration, Instant};
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _uma = note(vault.path(), "Uma.md", "# Uma\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let (tx, rx) = std::sync::mpsc::channel();
    let _watch = ws
        .watch(move |changes| {
            let _ = tx.send(changes);
        })
        .unwrap();
    // Whatever the system still had to say about the folder's creation.
    while rx.recv_timeout(Duration::from_millis(700)).is_ok() {}

    let _duas = note(vault.path(), "Duas.md", "O caminho para [[Uma]].\n");
    let deadline = Instant::now() + Duration::from_secs(10);
    let seen = loop {
        let left = deadline.saturating_duration_since(Instant::now());
        match rx.recv_timeout(left) {
            Ok(c) if c.rescan || c.paths.iter().any(|p| p == Path::new("Duas.md")) => break true,
            Ok(_) => {}
            Err(_) => break false,
        }
    };
    assert!(seen, "the watch never reported the new note");
    let r = ws.index().unwrap();
    assert_eq!(r.changed, vec!["Duas.md"], "{r:?}");
    assert!(r.listing_changed);
    assert_eq!(ws.backlinks("Uma").unwrap().unwrap().len(), 1);
}

/// Verso's own save changes the note's length and time, not the listing's
/// shape: a window must not draw its tree again after every save.
#[test]
fn a_save_is_not_a_listing_change() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _uma = note(vault.path(), "Uma.md", "# Uma\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let read = ws.read_note("Uma").unwrap();
    ws.write_note(
        "Uma",
        "# Uma\n\nMais uma linha, mais longa.\n",
        &read.revision,
    )
    .unwrap();
    let r = ws.index().unwrap();
    assert!(
        r.changed.is_empty() && r.gone.is_empty() && !r.listing_changed,
        "{r:?}"
    );
}
