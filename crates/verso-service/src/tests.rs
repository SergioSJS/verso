// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use super::*;

#[test]
fn every_command_of_the_folder_is_dispatched_by_name() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    for (name, _) in ops::FOLDER_COMMANDS {
        // Every name is known to dispatch: bad arguments are refused, an
        // unknown command is `None`.
        assert!(
            service
                .dispatch("a", name, serde_json::json!({"x": 1}))
                .is_some(),
            "{name}"
        );
    }
    assert!(
        service
            .dispatch("a", "pick_folder", serde_json::Value::Null)
            .is_none()
    );
    let notes = service
        .dispatch("a", "list_notes", serde_json::Value::Null)
        .unwrap()
        .unwrap();
    assert_eq!(notes, serde_json::json!([]));
    let made = service
        .dispatch(
            "a",
            "create_note",
            serde_json::json!({"name": "Nota", "text": "# Nota\n"}),
        )
        .unwrap()
        .unwrap();
    assert_eq!(made["path"], "Nota.md");
    let read = service
        .dispatch("a", "read_note", serde_json::json!({"path": "Nota.md"}))
        .unwrap()
        .unwrap();
    assert_eq!(read["text"], "# Nota\n");
    // A client that shows no folder is told so.
    let none = service
        .dispatch("b", "list_notes", serde_json::Value::Null)
        .unwrap();
    assert_eq!(none.unwrap_err().kind, ErrorKind::NoFolder);
}

#[test]
fn a_folder_closes_with_its_last_client() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    let (info, _) = service.attach("a", opened);
    assert!(service.join("b", &info.key));
    service.release("a");
    assert!(service.current_folder("b").is_some());
    service.release("b");
    assert!(!service.join("c", &info.key));
}

/// A panic while holding the lock of the table or of a folder poisons it,
/// and it still answers: a panic in one command must not make every later
/// one fail until restart.
#[test]
fn a_poisoned_lock_still_answers() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    let boom = service.with("a", |_| -> Result<(), OpError> {
        panic!("boom in the core")
    });
    assert_eq!(boom.unwrap_err().kind, ErrorKind::Failed);
    let poisoned = std::thread::scope(|s| {
        s.spawn(|| {
            let _guard = service.sessions.lock().unwrap();
            panic!("poison");
        })
        .join()
    });
    assert!(poisoned.is_err());
    assert!(service.sessions.is_poisoned());
    assert!(
        service
            .dispatch("a", "list_notes", serde_json::Value::Null)
            .unwrap()
            .is_ok()
    );
}

/// The bin of a folder of this computer, its records in the folder's index
/// (ADR 0080 items 2, 4, 5 and 7): listed with who and when, restored,
/// deleted for good, emptied.
#[test]
fn the_bin_of_a_local_folder_is_listed_restored_and_emptied() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    service
        .with("a", |ws| {
            for name in ["Uma", "Duas", "Tres"] {
                ws.create_note(name, "texto")?;
                let gone = ws.delete_note(name)?;
                trash::deleted(ws, None, &gone, None)?;
            }
            let policy = trash::Policy::local(ws);
            assert_eq!(policy.days, verso_core::trash::DEFAULT_DAYS);
            let list = trash::list(ws, None, policy)?;
            assert_eq!(list.entries.len(), 3);
            assert!(list.entries.iter().all(|e| e.known && e.by.is_none()));
            assert!(list.can_purge && list.can_set && list.quota.is_none());
            let first = list.entries[0].expires.unwrap() - list.entries[0].deleted;
            assert!((first - 30.0 * 86_400.0).abs() < 1.0);
            let (back, _) = trash::restore(ws, None, ".trash/Uma.md", "2026-10-11", "en")?;
            assert_eq!(back.path, "Uma.md");
            assert!(!back.beside);
            assert!(ws.notes()?.contains(&"Uma.md".to_owned()));
            let gone = trash::delete(ws, None, &[".trash/Duas.md".to_owned()])?;
            assert_eq!(gone.len(), 1);
            ws.set_trash_days(0)?;
            let list = trash::list(ws, None, trash::Policy::local(ws))?;
            assert_eq!(list.entries.len(), 1);
            assert_eq!(list.days, 0);
            assert!(list.entries[0].expires.is_none());
            trash::empty(ws, None)?;
            assert!(
                trash::list(ws, None, trash::Policy::local(ws))?
                    .entries
                    .is_empty()
            );
            // Nothing in the bin at a path: not found.
            let missing = trash::restore(ws, None, ".trash/Uma.md", "2026-10-11", "en");
            assert!(missing.is_err());
            Ok(())
        })
        .unwrap();
}

/// A new name beside an entry that differs from it only in case crosses
/// the contract as its own kind (spec Q8, decided 2026-10-12), which the
/// window and sync match — never its English text; any other refusal of
/// a name stays `refused`.
#[test]
fn a_case_twin_crosses_as_its_own_kind() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    let create = |name: &str| {
        service
            .dispatch(
                "a",
                "create_note",
                serde_json::json!({"name": name, "text": "x"}),
            )
            .unwrap()
    };
    create("Nota").unwrap();
    assert_eq!(create("nota").unwrap_err().kind, ErrorKind::CaseTwin);
    assert_eq!(create("../fora").unwrap_err().kind, ErrorKind::Refused);
    let folder = service
        .dispatch("a", "create_folder", serde_json::json!({"path": "Pasta"}))
        .unwrap();
    assert!(folder.is_ok(), "{folder:?}");
    let twin = service
        .dispatch("a", "create_folder", serde_json::json!({"path": "pasta"}))
        .unwrap();
    assert_eq!(twin.unwrap_err().kind, ErrorKind::CaseTwin);
    create("Outra").unwrap();
    let renamed = service
        .dispatch(
            "a",
            "rename_note",
            serde_json::json!({"from": "Outra.md", "to": "NOTA.md"}),
        )
        .unwrap();
    assert_eq!(renamed.unwrap_err().kind, ErrorKind::CaseTwin);
}

/// The lines the service gives its host's log.
#[derive(Default)]
struct Lines(Mutex<Vec<(String, String)>>);

impl Events for Lines {
    fn progress(&self, _: &[String], _: &IndexProgress) {}
    fn folder_changed(&self, _: &[String], _: &FolderChanged) {}
    fn log(&self, level: &str, message: &str) {
        lock(&self.0).push((level.to_owned(), message.to_owned()));
    }
}

/// A temporary file a crash left in the folder is removed when the folder
/// opens, with one INFO line saying how many went; an opening that finds
/// none says nothing.
#[test]
fn the_temporary_files_of_a_crash_go_when_the_folder_opens() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let other = std::process::id().wrapping_add(1).max(2);
    let _left = tempfile::Builder::new()
        .prefix(&format!(".verso-tmp-{other}-1"))
        .rand_bytes(0)
        .tempfile_in(dir.path())
        .unwrap()
        .keep()
        .unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let lines = Arc::new(Lines::default());
    service.set_events(Arc::clone(&lines) as Arc<dyn Events>);
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    let swept: Vec<_> = lock(&lines.0)
        .iter()
        .filter(|(_, m)| m.contains("temporary file"))
        .cloned()
        .collect();
    assert_eq!(swept.len(), 1, "{swept:?}");
    assert_eq!(swept[0].0, "INFO");
    assert!(swept[0].1.contains(": 1 temporary file"), "{swept:?}");
    let left = service
        .with_key(&service.current_folder("a").unwrap().key, |ws| {
            Ok(ws.sweep_temporaries()?)
        })
        .unwrap();
    assert_eq!(left, 0);
    service.release("a");
    lock(&lines.0).clear();
    let path = dir.path().to_owned();
    let opened = service
        .open("b", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("b", opened);
    assert!(
        lock(&lines.0)
            .iter()
            .all(|(_, m)| !m.contains("temporary file")),
        "{:?}",
        lock(&lines.0)
    );
}

/// The 16 MB bound on a file's text is UniVerso's (ADR 0083; the server's
/// `texts.rs`), never the desktop's: the commands called directly — as
/// the app calls them on the person's own folder — read and write a 20 MB
/// note and a 20 MB text file whole.
#[test]
fn the_desktop_path_reads_and_writes_a_20_mb_text_whole() {
    use std::io::Write;
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let big = "a".repeat(20 * 1024 * 1024);
    for name in ["grande.txt", "Grande.md"] {
        let mut f = tempfile::NamedTempFile::new_in(dir.path()).unwrap();
        f.write_all(big.as_bytes()).unwrap();
        f.persist(dir.path().join(name)).unwrap();
    }
    let service = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    for (cmd, path, field) in [
        ("read_file_text", "grande.txt", None),
        ("read_text", "grande.txt", Some("text")),
        ("read_note", "Grande.md", Some("text")),
    ] {
        let read = service
            .dispatch("a", cmd, serde_json::json!({ "path": path }))
            .unwrap()
            .unwrap_or_else(|e| panic!("{cmd} of a 20 MB file on the desktop: {e:?}"));
        let text = field.map_or(&read, |f| &read[f]);
        assert_eq!(text.as_str().map(str::len), Some(big.len()), "{cmd}");
    }
    let made = service
        .dispatch(
            "a",
            "create_note",
            serde_json::json!({"name": "Outra", "text": big.as_str()}),
        )
        .unwrap();
    assert!(made.is_ok(), "{:?}", made.err());
}

/// The computer's history through the service (ADR 0091 item 8): every
/// command's write is a version, restored over the revision read, and a
/// server's service, which never asks, keeps none.
#[test]
fn the_computers_history_records_each_commands_writes_and_restores() {
    let dir = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    service.keep_local_history("Mac de Ana", 365);
    let path = dir.path().to_owned();
    let opened = service
        .open("a", move |c| Workspace::open(&path, c))
        .unwrap();
    service.attach("a", opened);
    service
        .dispatch(
            "a",
            "create_note",
            serde_json::json!({"name": "Nota", "text": "um\n"}),
        )
        .unwrap()
        .unwrap();
    let policy = history::Policy::local(365);
    let first = service
        .with("a", |ws| history::list_local(ws, "Nota.md", policy, ""))
        .unwrap();
    assert_eq!(first.versions.len(), 1);
    assert_eq!(first.versions[0].authors[0].name, "Mac de Ana");
    let id = history::id_of(&first.versions[0].id, "").unwrap();
    // Changed outside (the editor's next save is then a version of its
    // own, not folded into the first), then by the editor, then the first
    // version brought back.
    {
        let mut other = verso_fs::Root::open(dir.path(), vec![]).unwrap();
        let h = other.handle(std::path::Path::new("Nota.md")).unwrap();
        let (_, stamp) = other.read(h).unwrap();
        let _ = other.write(h, b"fora\n", &stamp).unwrap();
    }
    service
        .with("a", |ws| {
            Ok(ws.history_outside(&["Nota.md".to_owned()], &[]))
        })
        .unwrap();
    let read = service
        .dispatch("a", "read_note", serde_json::json!({"path": "Nota.md"}))
        .unwrap()
        .unwrap();
    let revision = read["revision"].as_str().unwrap().to_owned();
    service
        .with("a", |ws| {
            ops::write_note(ws, "Nota.md".into(), "dois\n".into(), revision)
        })
        .unwrap();
    let stale = service
        .with("a", |ws| {
            let bytes = history::bytes_local(ws, "Nota.md", id)?;
            history::restore(
                ws,
                "Nota.md",
                &bytes,
                Some(read["revision"].as_str().unwrap_or("")),
            )
        })
        .unwrap_err();
    assert_eq!(stale.kind, ErrorKind::Changed, "invariant 11");
    let now = service
        .dispatch("a", "read_note", serde_json::json!({"path": "Nota.md"}))
        .unwrap()
        .unwrap();
    let back = service
        .with("a", |ws| {
            let bytes = history::bytes_local(ws, "Nota.md", id)?;
            history::restore(ws, "Nota.md", &bytes, now["revision"].as_str())
        })
        .unwrap();
    let after = service
        .dispatch("a", "read_note", serde_json::json!({"path": "Nota.md"}))
        .unwrap()
        .unwrap();
    assert_eq!(after["text"], "um\n");
    assert_eq!(after["revision"], back.revision.as_str());
    let l = service
        .with("a", |ws| history::list_local(ws, "Nota.md", policy, ""))
        .unwrap();
    assert_eq!(l.versions[0].kind, verso_contract::VersionKind::Restore);
    // A server's service keeps none.
    let plain = Service::new(Some(config.path().to_owned()));
    let path = dir.path().to_owned();
    let opened = plain.open("s", move |c| Workspace::open(&path, c)).unwrap();
    plain.attach("s", opened);
    let none = plain
        .with("s", |ws| history::list_local(ws, "Nota.md", policy, ""))
        .unwrap_err();
    assert_eq!(none.kind, ErrorKind::Refused);
}

/// A folder written by "another program": a workspace of its own on the
/// same directory, with its index in a temporary place of its own.
fn outsider(dir: &std::path::Path) -> (tempfile::TempDir, Workspace) {
    let config = tempfile::tempdir().unwrap();
    let mut ws = Workspace::open(dir, Some(config.path())).unwrap();
    ws.index().unwrap();
    (config, ws)
}

/// One file opened without a folder (ADR 0114 items 18, 19, 22, 29): the
/// window reads and writes it, nothing of the folder is reachable, and
/// what crosses carries no path.
#[test]
fn a_loose_file_answers_its_own_commands_and_refuses_the_folders() {
    let dir = tempfile::tempdir().unwrap();
    let (_c, mut other) = outsider(dir.path());
    other.create_folder("Pasta com espaço/sub").unwrap();
    other
        .create_note(
            "Pasta com espaço/sub/Nota avulsa",
            "# Avulsa\n\n[[Vizinha]] e [[Longe]]\n",
        )
        .unwrap();
    other
        .create_note("Pasta com espaço/sub/Vizinha", "# Vizinha\n")
        .unwrap();
    let nested = dir.path().join("Pasta com espaço").join("sub");
    let config = tempfile::tempdir().unwrap();
    let service = Service::new(Some(config.path().to_owned()));
    let info = service
        .open_loose(
            "w",
            &nested.join("Nota avulsa.md"),
            Some("Conhecida".to_owned()),
        )
        .unwrap();
    assert_eq!(info.name, "Nota avulsa.md");
    assert_eq!(info.place, "sub");
    assert_eq!(info.known_folder.as_deref(), Some("Conhecida"));
    assert!(info.read_only.is_none());
    // No absolute path, no `..`, no separator crosses (rule 4).
    for field in [&info.name, &info.key, &info.place] {
        assert!(
            !field.contains('/') && !field.contains('\\') && !field.contains(".."),
            "{field}"
        );
    }
    assert!(info.key.chars().all(|c| c.is_alphanumeric() || c == '-'));
    assert!(service.is_loose("w"));
    assert_eq!(service.loose_window().as_deref(), Some("w"));
    assert!(service.folder_of("w").is_none());
    // The same file again is the same tab.
    let again = service
        .open_loose("w", &nested.join("Nota avulsa.md"), None)
        .unwrap();
    assert_eq!(again.name, info.name);
    assert_eq!(service.loose_files("w").len(), 1);
    // Its own commands, by name as the window sends them.
    let read = service
        .dispatch(
            "w",
            "read_note",
            serde_json::json!({"path": "Nota avulsa.md"}),
        )
        .unwrap()
        .unwrap();
    assert_eq!(read["path"], "Nota avulsa.md");
    assert_eq!(read["headings"][0]["text"], "Avulsa");
    let revision = read["revision"].as_str().unwrap().to_owned();
    let written = service
        .dispatch(
            "w",
            "write_note",
            serde_json::json!({"path": "Nota avulsa.md", "text": "# Mudou\n", "revision": revision}),
        )
        .unwrap()
        .unwrap();
    assert_eq!(written["note"]["text"], "# Mudou\n");
    assert_eq!(
        other
            .read_note("Pasta com espaço/sub/Nota avulsa.md")
            .unwrap()
            .text,
        "# Mudou\n"
    );
    // Links resolve to a sibling by one stat, or stay unresolved.
    let links = service
        .dispatch("w", "links", serde_json::json!({"path": "Nota avulsa.md"}))
        .unwrap()
        .unwrap();
    assert!(links.as_array().unwrap().is_empty());
    let fresh = other
        .read_note("Pasta com espaço/sub/Nota avulsa.md")
        .unwrap();
    other
        .write_note(
            "Pasta com espaço/sub/Nota avulsa.md",
            "[[Vizinha]] e [[Longe]]\n",
            &fresh.revision,
        )
        .unwrap();
    let links = service
        .dispatch("w", "links", serde_json::json!({"path": "Nota avulsa.md"}))
        .unwrap()
        .unwrap();
    assert_eq!(links[0]["resolved"], "Vizinha.md");
    assert!(links[1]["resolved"].is_null());
    // Every folder command is refused — not "no folder", a refusal.
    for name in [
        "list_notes",
        "search",
        "list_entries",
        "create_note",
        "rename_entry",
        "delete_entry",
        "backlinks",
        "graph",
        "list_tags",
    ] {
        let r = service
            .dispatch("w", name, serde_json::json!({"path": "x", "name": "x", "text": "", "words": "a", "limit": 1, "kinds": []}))
            .unwrap();
        let e = r.unwrap_err();
        assert_eq!(e.kind, ErrorKind::Refused, "{name}: {e:?}");
        assert!(
            e.message.contains("without its folder"),
            "{name}: {}",
            e.message
        );
    }
    assert_eq!(service.reindex("w").unwrap_err().kind, ErrorKind::Refused);
    assert_eq!(
        service.with("w", |_| Ok(())).unwrap_err().kind,
        ErrorKind::Refused
    );
    // A sibling opens as a file of its own in the same window.
    let sibling = service
        .open_sibling("w", "Nota avulsa.md", "Vizinha")
        .unwrap();
    assert_eq!(sibling.name, "Vizinha.md");
    assert_eq!(service.loose_files("w").len(), 2);
    assert!(
        service
            .open_sibling("w", "Nota avulsa.md", "Longe")
            .is_err()
    );
    assert!(service.open_sibling("w", "Nota avulsa.md", "../x").is_err());
    // Nothing was written beside the files (the outsider lists the folder),
    // and nothing in the service's configuration directory.
    other.index().unwrap();
    let mut names: Vec<String> = other
        .entries()
        .iter()
        .map(|e| e.path.clone())
        .filter(|p| p.starts_with("Pasta com espaço/sub/"))
        .collect();
    names.sort();
    assert_eq!(
        names,
        [
            "Pasta com espaço/sub/Nota avulsa.md",
            "Pasta com espaço/sub/Vizinha.md"
        ]
    );
    assert!(verso_core::recent_folders(Some(config.path())).is_empty());
    // Closing a tab lets the file go; the last one makes the client plain.
    service.close_loose("w", "Vizinha.md");
    assert_eq!(service.loose_files("w").len(), 1);
    service.close_loose("w", "Nota avulsa.md");
    assert!(!service.is_loose("w"));
    assert_eq!(
        service
            .dispatch("w", "list_notes", serde_json::Value::Null)
            .unwrap()
            .unwrap_err()
            .kind,
        ErrorKind::NoFolder
    );
}

/// A change made outside reaches the client as a `folder-changed` of the
/// file's key (ADR 0114 item 11), the file among `removed` when it went.
#[test]
fn a_loose_file_changed_outside_is_told_to_its_window() {
    struct Heard(Mutex<Vec<FolderChanged>>);
    impl Events for Heard {
        fn progress(&self, _: &[String], _: &IndexProgress) {}
        fn folder_changed(&self, clients: &[String], c: &FolderChanged) {
            assert_eq!(clients, ["w"]);
            lock(&self.0).push(c.clone());
        }
        fn log(&self, _: &str, _: &str) {}
    }
    let dir = tempfile::tempdir().unwrap();
    let (_c, mut other) = outsider(dir.path());
    let a = other.create_note("a", "a").unwrap();
    let b = other.create_note("b", "b").unwrap();
    let service = Service::new(Some(tempfile::tempdir().unwrap().path().to_owned()));
    let heard = Arc::new(Heard(Mutex::new(Vec::new())));
    service.set_events(heard.clone());
    let info = service
        .open_loose("w", &dir.path().join("a.md"), None)
        .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(800));
    other.write_note("b.md", "b mudou", &b.revision).unwrap();
    other.write_note("a.md", "a mudou", &a.revision).unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while std::time::Instant::now() < deadline && lock(&heard.0).is_empty() {
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    let first = lock(&heard.0).first().cloned().expect("a batch");
    assert_eq!(first.key, info.key);
    assert_eq!(first.changed, ["a.md"]);
    assert!(first.removed.is_empty());
    other.rename_entry("a.md", "c.md").unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while std::time::Instant::now() < deadline
        && !lock(&heard.0).iter().any(|c| !c.removed.is_empty())
    {
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    assert!(
        lock(&heard.0).iter().any(|c| c.removed == ["a.md"]),
        "{:?}",
        lock(&heard.0)
    );
}

/// A picture of another note's folder is never served to a note that does
/// not cite it (ADR 0114 Q5): each session serves only what its own text
/// cites, from its own parent.
#[test]
fn a_loose_note_never_reads_the_pictures_of_another_notes_folder() {
    let one = tempfile::tempdir().unwrap();
    let two = tempfile::tempdir().unwrap();
    std::fs::write(one.path().join("a.md"), "sem imagem\n").unwrap();
    std::fs::write(one.path().join("so-de-a.png"), b"A").unwrap();
    std::fs::write(two.path().join("b.md"), "![[b.png]]\n").unwrap();
    std::fs::write(two.path().join("b.png"), b"B").unwrap();
    let service = Service::new(Some(tempfile::tempdir().unwrap().path().to_owned()));
    service
        .open_loose("w", &one.path().join("a.md"), None)
        .unwrap();
    service
        .open_loose("w", &two.path().join("b.md"), None)
        .unwrap();
    for (note, expected) in [("a.md", None), ("b.md", Some("b.png"))] {
        let r = service
            .dispatch("w", "read_note", serde_json::json!({"path": note}))
            .unwrap();
        r.unwrap();
        let r = service
            .dispatch(
                "w",
                "resolve_attachment",
                serde_json::json!({"source": note, "target": expected.unwrap_or("so-de-a.png")}),
            )
            .unwrap()
            .unwrap();
        assert_eq!(r.as_str(), expected, "{note}");
    }
    assert_eq!(service.loose_attachment("w", "b.png").unwrap(), b"B");
    assert!(service.loose_attachment("w", "so-de-a.png").is_err());
}
