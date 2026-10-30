//! Indexing, reading and writing: the index and its sidecar, a note read and
//! written over its revision, attachments and embeds, text files, the watch.

use super::*;

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
fn the_graph_lists_links_no_note_and_no_file_answers_to() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _a = note(
        vault.path(),
        "A.md",
        "[[Real]] [[Goblin Rei]] [[goblin rei]] [[Goblin Rei]] ![[mapa.png]] [[#Seção]] [[pasta/]]\n",
    );
    let _b = note(
        vault.path(),
        "B.md",
        "[[Real]] [[Goblin Rei|rei]] [[Goblin Rei#Notas]]\n",
    );
    let _real = note(vault.path(), "Real.md", "# Real\n");
    let _map = bytes(vault.path(), "mapa.png", b"png");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    // Once per note and name, one spelling, no file, no self link, no
    // resolved note.
    let want = |from: &str| (from.to_owned(), "Goblin Rei".to_owned());
    assert_eq!(
        ws.graph_unresolved().unwrap(),
        vec![want("A.md"), want("B.md")]
    );
    assert_eq!(
        ws.reader_graph_unresolved().unwrap(),
        ws.graph_unresolved().unwrap()
    );
}

#[test]
fn config_dir_precedence_and_no_relative_fallback() {
    let home = Some(Path::new("/Users/x"));
    assert_eq!(
        verso_core::config_dir_from(
            Some(OsStr::new("/cfg")),
            Some(OsStr::new("/xdg")),
            Some(OsStr::new("C:/Users/x/AppData/Local")),
            home,
            true
        )
        .as_deref(),
        Some(Path::new("/cfg"))
    );
    assert_eq!(
        verso_core::config_dir_from(None, Some(OsStr::new("/xdg")), None, home, true).as_deref(),
        Some(Path::new("/xdg/verso"))
    );
    assert_eq!(
        verso_core::config_dir_from(None, None, None, home, true).as_deref(),
        Some(Path::new("/Users/x/Library/Application Support/verso"))
    );
    assert_eq!(
        verso_core::config_dir_from(None, None, None, home, false).as_deref(),
        Some(Path::new("/Users/x/.config/verso"))
    );
    // On Windows, LOCALAPPDATA names it, ahead of a HOME that Git Bash may set.
    assert_eq!(
        verso_core::config_dir_from(
            None,
            None,
            Some(OsStr::new("C:/Users/x/AppData/Local")),
            home,
            false
        )
        .as_deref(),
        Some(Path::new("C:/Users/x/AppData/Local/verso"))
    );
    // No HOME and no override: an error, never a relative directory.
    assert_eq!(
        verso_core::config_dir_from(None, None, None, None, true),
        None
    );
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
    let a = note(sub.path(), "a.md", "a\n");
    // Never trusted by its stat, so the run below reads it: on a slow
    // machine (Windows under the whole suite) more than two seconds passed
    // between writing it and the first run, the second run trusted it, read
    // nothing and had nothing to report (check-windows.sh, 2026-10-11).
    crate::shell::future_mtime(a.path());
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    let r = ws.index().unwrap();
    assert_eq!((r.indexed, r.removed), (2, 0), "{r:?}");
    assert_eq!(ws.backlinks("sub/a").unwrap().unwrap().len(), 1);

    // The directory becomes unreadable (through the shell: the test may
    // not call std::fs). The walk reports a problem for `sub`; nothing
    // under it is gone.
    crate::shell::unreadable(sub.path(), true);
    let r = ws.index().unwrap();
    crate::shell::unreadable(sub.path(), false);
    assert_eq!(r.removed, 0, "{r:?}");
    if cfg!(windows) && r.problems.is_empty() {
        // Windows may still list the directory and refuse each note in it:
        // the note is then reported unreadable, by its path, and kept
        // (ADR 0069) — the same promise, one level down.
        assert_eq!(r.unreadable.len(), 1, "{r:?}");
        assert_eq!(r.unreadable[0].0, "sub/a.md", "{r:?}");
    } else {
        assert_eq!(r.problems.len(), 1, "{r:?}");
        assert_eq!(r.problems[0].path(), "sub");
        assert!(matches!(r.problems[0], verso_core::WalkProblem::Io { .. }));
        // Shown as one line with the relative path, not a debug dump.
        let line = r.problems[0].to_string();
        assert!(
            line.starts_with("sub: ") && !line.contains("Io {"),
            "{line}"
        );
    }
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
    let touch = crate::shell::old_mtime;
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
            matches!(
                ws.create_file_from_picked(bad, std::path::Path::new("/nonexistent"), 10),
                Err(verso_core::PickedCreateError::Core(
                    CoreError::Confined(_) | CoreError::Write(verso_core::WriteError::Confined(_))
                ))
            ),
            "create_file_from_picked {bad:?}"
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
        assert!(
            listing.starts_with("-rw------- ") || listing.starts_with("-rw-------@ "),
            "{listing}"
        );
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
    assert!(crate::shell::append_line(
        &vault.path().join("Nota.md"),
        "externo"
    ));
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
            let _ = crate::shell::overwrite_line(&target, "EXTERNAL");
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
#[test]
fn a_write_through_a_symlink_names_the_target_without_a_path_outside() {
    // The links are made by the system's tool: this crate's lint keeps disk
    // access in verso-fs (ADR 0026 rule 5), and a fixture is no reason for
    // an `#[allow]`.
    let symlink = |target: &Path, at: &Path| crate::shell::symlink(target, at, false);
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

/// A note modified well before the last complete run is trusted by its
/// stat, without reading it; a run that could not list a folder is not
/// complete, so it trusts nothing new for the next one (schema 13).
#[test]
fn only_a_complete_run_lets_the_next_trust_a_note_by_its_stat() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _root = note(vault.path(), "root.md", "root\n");
    let sub = subdir(vault.path(), "sub");
    let _a = note(sub.path(), "a.md", "a\n");
    crate::shell::old_mtime(&vault.path().join("root.md"));
    crate::shell::old_mtime(&sub.path().join("a.md"));
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();

    // A run that cannot list `sub` reads root.md but does not complete.
    crate::shell::unreadable(sub.path(), true);
    let r = ws.index().unwrap();
    crate::shell::unreadable(sub.path(), false);
    assert!(!r.problems.is_empty() || !r.unreadable.is_empty(), "{r:?}");
    assert_eq!(r.trusted, 0, "{r:?}");

    // So the next run trusts nothing: it reads every note, and completes.
    let r = ws.index().unwrap();
    assert_eq!(r.trusted, 0, "{r:?}");
    assert!(r.problems.is_empty() && r.unreadable.is_empty(), "{r:?}");

    // From then on both are trusted by their stat.
    let r = ws.index().unwrap();
    assert_eq!((r.trusted, r.indexed), (2, 0), "{r:?}");
}

/// A batch of the watch that only changed notes is read path by path, not
/// by a walk (ADR 0073 item 12); one that adds a note is too, since D4 of
/// 2026-10-11.
#[test]
fn a_batch_of_changed_notes_reads_only_its_paths() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _a = note(vault.path(), "Uma.md", "# Uma\n");
    let _b = note(vault.path(), "Duas.md", "# Duas\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    // Rewritten as another program would: a new file renamed over it.
    let mut f = Builder::new().tempfile_in(vault.path()).unwrap();
    f.write_all("# Uma\n\ndragão vermelho\n".as_bytes())
        .unwrap();
    f.persist(vault.path().join("Uma.md")).unwrap();
    let changes = verso_core::Changes {
        paths: vec![std::path::PathBuf::from("Uma.md")],
        rescan: false,
    };
    let report = ws.index_changes(&changes, |_| {}).unwrap();
    assert!(report.narrowed);
    assert_eq!(report.changed, vec!["Uma.md".to_owned()]);
    assert_eq!(report.indexed, 1);
    assert_eq!(ws.search("dragão", 10).unwrap()[0].path, "Uma.md");
    // A new note is a change of the listing, made by its path.
    let _c = note(vault.path(), "Tres.md", "# Três\n");
    let changes = verso_core::Changes {
        paths: vec![std::path::PathBuf::from("Tres.md")],
        rescan: false,
    };
    let report = ws.index_changes(&changes, |_| {}).unwrap();
    assert!(report.narrowed);
    assert!(report.listing_changed);
    // The system asked for a rescan: the walk runs whatever the paths.
    let changes = verso_core::Changes {
        paths: vec![std::path::PathBuf::from("Duas.md")],
        rescan: true,
    };
    assert!(!ws.index_changes(&changes, |_| {}).unwrap().narrowed);
}

fn batch(paths: &[&str]) -> verso_core::Changes {
    verso_core::Changes {
        paths: paths.iter().map(std::path::PathBuf::from).collect(),
        rescan: false,
    }
}

/// A batch that creates and removes files is read by its paths too, not
/// by a walk (D4 of 2026-10-11): every file a sync's download brings is a
/// file created, and each batch of them walked the whole folder. A new
/// note, a new file in a folder and a deletion enter or leave the listing
/// where a walk puts them; a temporary file come and gone, a hidden one
/// and one a `.gitignore` leaves out are passed over, as a walk passes
/// them. What only a walk answers for — a file in a new folder, a
/// `.gitignore`, a placeholder where a note was — still walks, and the
/// placeholder is no deletion (ADR 0043).
#[test]
fn a_batch_of_new_and_removed_files_reads_only_its_paths() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let _a = note(vault.path(), "Uma.md", "# Uma\n");
    let some = note(vault.path(), "Some.md", "# Some\n\n[[Uma]]\n");
    let pasta = subdir(vault.path(), "pasta");
    let _b = note(pasta.path(), "Duas.md", "# Duas\n");
    let _ignore = note(vault.path(), ".gitignore", "*.log\n");
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();

    let tres = note(vault.path(), "Tres.md", "# Três\n\n[[Uma]] e o dragão\n");
    let _map = bytes(pasta.path(), "mapa.png", b"\x89PNG");
    let _hidden = note(vault.path(), ".oculto.md", "# oculto\n");
    let _log = note(vault.path(), "saida.log", "linha\n");
    drop(some);
    let r = ws
        .index_changes(
            &batch(&[
                "Tres.md",
                "pasta/mapa.png",
                "Some.md",
                ".oculto.md",
                "saida.log",
                "Tres.md.tmp",
            ]),
            |_| {},
        )
        .unwrap();
    assert!(r.narrowed, "walked: {r:?}");
    assert!(r.listing_changed, "{r:?}");
    assert_eq!(r.changed, ["Tres.md"]);
    assert_eq!((r.indexed, r.removed), (1, 1), "{r:?}");
    assert_eq!(r.gone, ["Some.md"]);
    assert_eq!(ws.search("dragão", 10).unwrap()[0].path, "Tres.md");
    assert_eq!(ws.files(), ["pasta/mapa.png"]);
    assert_eq!(ws.backlinks("Uma").unwrap().unwrap().len(), 1);
    // The listing is the walk's, entry for entry and in its order.
    let walked = ws.index().unwrap();
    assert!(!walked.listing_changed, "{:?}", ws.entries());
    assert_eq!(walked.indexed, 0, "{walked:?}");

    // A file in a folder the last walk did not enter: walked.
    let nova = subdir(vault.path(), "nova");
    let _d = note(nova.path(), "Quatro.md", "# Quatro\n");
    let r = ws
        .index_changes(&batch(&["nova/Quatro.md"]), |_| {})
        .unwrap();
    assert!(!r.narrowed);
    assert!(ws.notes().unwrap().contains(&"nova/Quatro.md".to_owned()));
    // A `.gitignore` changes what the walk lists: walked.
    let r = ws.index_changes(&batch(&[".gitignore"]), |_| {}).unwrap();
    assert!(!r.narrowed);
    // A note evicted to a placeholder: walked, and still known (ADR 0043).
    drop(tres);
    let _evicted = note(vault.path(), ".Tres.md.icloud", "<plist/>");
    let r = ws.index_changes(&batch(&["Tres.md"]), |_| {}).unwrap();
    assert!(!r.narrowed);
    assert!(r.gone.is_empty(), "{r:?}");
    assert!(ws.notes().unwrap().contains(&"Tres.md".to_owned()));
}

#[test]
fn a_picked_file_is_copied_in_pieces_listed_and_never_overwrites() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let data: Vec<u8> = (0..(2 << 20) + 7).map(|i| (i % 251) as u8).collect();
    let source = outside.path().join("grande.pdf");
    std::fs::write(&source, &data).unwrap();
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    let key = ws
        .create_file_from_picked("anexos/grande.pdf", &source, u64::MAX)
        .unwrap();
    assert_eq!(key, "anexos/grande.pdf");
    assert!(ws.read_file(&key).unwrap() == data);
    // Listed at once, as `create_file` lists.
    assert_eq!(
        ws.resolve_file("x.md", "grande.pdf").as_deref(),
        Some("anexos/grande.pdf")
    );
    // A name taken: refused, the first stays.
    let again = ws.create_file_from_picked("anexos/grande.pdf", &source, u64::MAX);
    assert!(matches!(
        again,
        Err(verso_core::PickedCreateError::Core(CoreError::Write(
            verso_core::WriteError::Exists
        )))
    ));
    // Over the bound: refused as the picked file's, nothing created.
    let big = ws.create_file_from_picked("outro.pdf", &source, 10);
    assert!(matches!(
        big,
        Err(verso_core::PickedCreateError::Picked(
            verso_core::PickedError::TooLarge
        ))
    ));
    assert!(ws.read_file("outro.pdf").is_err());
}

/// A note past the index's cap (16 MB) is never read and parsed by the walk,
/// the narrow run or a sync write: a server of 1 GB was killed by 60 MB
/// "notes" (night round 2026-10-30). It stays a file in the listing, is not
/// searchable, and the row of a smaller version it replaced goes.
#[test]
fn a_note_past_the_index_cap_is_not_indexed() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let mut big = b"palavraenorme ".to_vec();
    big.resize(17 * 1024 * 1024, b'x');
    let _small = note(vault.path(), "pequena.md", "# Pequena\n\npalavrapequena\n");
    let _big = bytes(vault.path(), "grande.md", &big);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(ws.search("palavrapequena", 10).unwrap().len(), 1);
    assert!(ws.search("palavraenorme", 10).unwrap().is_empty());
    assert!(
        ws.entries().iter().any(|e| e.path == "grande.md"),
        "still listed"
    );

    // A small version indexed, then replaced by a huge one on the disk: the
    // walk drops its row.
    std::fs::write(vault.path().join("troca.md"), "# Troca\n\npalavratroca\n").unwrap();
    ws.index().unwrap();
    assert_eq!(ws.search("palavratroca", 10).unwrap().len(), 1);
    let mut huge = b"palavratroca ".to_vec();
    huge.resize(17 * 1024 * 1024, b'y');
    std::fs::write(vault.path().join("troca.md"), &huge).unwrap();
    ws.index().unwrap();
    assert!(ws.search("palavratroca", 10).unwrap().is_empty());
}

/// A note that grows past the cap between two full walks is still on the
/// disk: its row goes, but it is not reported gone (the history would record
/// a deletion of a file that exists, and clients would be told `removed`).
#[test]
fn a_note_growing_past_the_cap_is_dropped_from_the_index_not_reported_gone() {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    std::fs::write(
        vault.path().join("cresce.md"),
        "# Cresce\n\npalavracresce\n",
    )
    .unwrap();
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    assert_eq!(ws.search("palavracresce", 10).unwrap().len(), 1);

    let mut huge = b"palavracresce ".to_vec();
    huge.resize(17 * 1024 * 1024, b'y');
    std::fs::write(vault.path().join("cresce.md"), &huge).unwrap();
    let r = ws.index().unwrap();
    assert!(r.gone.is_empty(), "the file exists: {r:?}");
    assert!(
        ws.search("palavracresce", 10).unwrap().is_empty(),
        "row removed"
    );
    assert!(
        ws.entries().iter().any(|e| e.path == "cresce.md"),
        "still listed"
    );

    // Small again: indexed again, still never gone.
    std::fs::write(
        vault.path().join("cresce.md"),
        "# Cresce\n\npalavracresce\n",
    )
    .unwrap();
    let r = ws.index().unwrap();
    assert!(r.gone.is_empty(), "{r:?}");
    assert_eq!(ws.search("palavracresce", 10).unwrap().len(), 1);
}
