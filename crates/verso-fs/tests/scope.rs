// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A root opened for one file (ADR 0114 items 16, 22 and 29): the file is
//! read and written, an image beside it is read and nothing else; the
//! siblings are not listed, not reached, not written beside.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use verso_fs::{ConfinementError, PathKind, Root, WriteError, kind_of};

#[cfg(test)]
mod support {
    use super::*;

    /// A parent with the loose note, a sibling note, an image, a hidden
    /// sibling and a data file; the root opened on the note alone.
    pub fn loose() -> (tempfile::TempDir, Root) {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("nota.md"), "# Nota\n\n![[foto.png]]\n").unwrap();
        fs::write(dir.path().join("outra.md"), "# Outra\n").unwrap();
        fs::write(dir.path().join("foto.png"), b"\x89PNG").unwrap();
        fs::write(dir.path().join(".segredo.md"), "# Escondida\n").unwrap();
        fs::write(dir.path().join("dados.json"), "{}").unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub/imagem.jpg"), b"\xff\xd8").unwrap();
        let root = Root::open_file(dir.path().join("nota.md")).unwrap();
        (dir, root)
    }

    pub fn names(dir: &Path) -> Vec<String> {
        let mut out: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        out.sort();
        out
    }
}
use support::*;

#[test]
fn the_file_itself_is_read_and_written_and_the_write_is_atomic() {
    let (dir, mut root) = loose();
    assert_eq!(root.scope(), Some(Path::new("nota.md")));
    let h = root.scoped_file().unwrap();
    let (bytes, stamp) = root.read(h).unwrap();
    assert!(bytes.starts_with(b"# Nota"));
    let _ = root.write(h, b"# Nota\n\nmudou\n", &stamp).unwrap();
    assert_eq!(
        fs::read_to_string(dir.path().join("nota.md")).unwrap(),
        "# Nota\n\nmudou\n"
    );
    // The same handle by its name.
    let again = root.handle(Path::new("nota.md")).unwrap();
    assert_eq!(again, h);
    // Nothing beside the file: no temporary, no sidecar, no `.verso`.
    assert_eq!(
        names(dir.path()),
        [
            ".segredo.md",
            "dados.json",
            "foto.png",
            "nota.md",
            "outra.md",
            "sub"
        ]
    );
}

#[test]
fn a_write_is_refused_when_the_file_changed_since_it_was_read() {
    let (dir, mut root) = loose();
    let h = root.scoped_file().unwrap();
    let (_, stamp) = root.read(h).unwrap();
    fs::write(dir.path().join("nota.md"), "outro programa escreveu").unwrap();
    let err = root.write(h, b"meu texto", &stamp).unwrap_err();
    assert!(matches!(err, WriteError::Changed { .. }), "{err:?}");
    assert_eq!(
        fs::read_to_string(dir.path().join("nota.md")).unwrap(),
        "outro programa escreveu"
    );
}

#[test]
fn a_sibling_note_a_hidden_sibling_a_data_file_and_a_parent_are_out_of_scope() {
    let (_dir, mut root) = loose();
    assert!(matches!(
        root.handle(Path::new("outra.md")),
        Err(ConfinementError::OutOfScope)
    ));
    assert!(matches!(
        root.handle(Path::new("dados.json")),
        Err(ConfinementError::OutOfScope)
    ));
    assert!(matches!(
        root.handle(Path::new(".segredo.md")),
        Err(ConfinementError::OutOfScope)
    ));
    assert!(matches!(
        root.handle(Path::new("../fora.png")),
        Err(ConfinementError::ParentComponent)
    ));
    assert!(matches!(
        root.handle(Path::new("/etc/passwd")),
        Err(ConfinementError::Absolute)
    ));
    // A hidden attachment name is hidden, not an attachment.
    assert!(matches!(
        root.handle(Path::new(".oculta.png")),
        Err(ConfinementError::Hidden)
    ));
}

#[test]
fn an_attachment_beside_the_file_is_read_and_never_written() {
    let (_dir, mut root) = loose();
    let img = root.handle(Path::new("foto.png")).unwrap();
    let (bytes, stamp) = root.read(img).unwrap();
    assert_eq!(bytes, b"\x89PNG");
    let sub = root.handle(Path::new("sub/imagem.jpg")).unwrap();
    assert_eq!(root.read(sub).unwrap().0, b"\xff\xd8");
    let err = root.write(img, b"x", &stamp).unwrap_err();
    assert!(
        matches!(err, WriteError::Confined(ConfinementError::OutOfScope)),
        "{err:?}"
    );
}

#[cfg(unix)]
#[test]
fn an_attachment_through_a_link_that_leaves_the_parent_is_refused() {
    let (dir, mut root) = loose();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("fora.png"), b"fora").unwrap();
    verso_fs::link_for_tests(
        &outside.path().join("fora.png"),
        &dir.path().join("link.png"),
    )
    .unwrap();
    assert!(matches!(
        root.handle(Path::new("link.png")),
        Err(ConfinementError::LeavesFolder)
    ));
    // A link that stays inside is followed.
    verso_fs::link_for_tests(Path::new("foto.png"), &dir.path().join("dentro.png")).unwrap();
    let h = root.handle(Path::new("dentro.png")).unwrap();
    assert_eq!(root.read(h).unwrap().0, b"\x89PNG");
}

#[test]
fn nothing_is_created_moved_binned_or_listed_beside_the_file() {
    let (dir, mut root) = loose();
    let out = |r: Result<(), WriteError>| {
        assert!(
            matches!(r, Err(WriteError::Confined(ConfinementError::OutOfScope))),
            "{r:?}"
        );
    };
    out(root.create(Path::new("nova.md"), b"x").map(|_| ()));
    out(root.create_dir(Path::new("pasta")).map(|_| ()));
    out(root
        .rename(Path::new("nota.md"), Path::new("renomeada.md"))
        .map(|_| ()));
    out(root.trash(Path::new("nota.md")).map(|_| ()));
    out(root.stage(Path::new("nova.md")).map(|_| ()));
    out(root.keep_in_trash(Path::new("nota.md")).map(|_| ()));
    let walk = root.walk();
    assert!(walk.entries.is_empty() && walk.problems.is_empty());
    assert!(root.temporaries().unwrap().is_empty());
    assert_eq!(root.sweep_temporaries().unwrap(), 0);
    assert_eq!(
        names(dir.path()),
        [
            ".segredo.md",
            "dados.json",
            "foto.png",
            "nota.md",
            "outra.md",
            "sub"
        ]
    );
}

#[test]
fn a_sibling_note_is_found_by_one_stat_and_opened_as_a_scope_of_its_own() {
    let (_dir, root) = loose();
    assert_eq!(
        root.sibling_note(Path::new("outra")),
        Some(PathBuf::from("outra.md"))
    );
    assert_eq!(
        root.sibling_note(Path::new("outra.md")),
        Some(PathBuf::from("outra.md"))
    );
    assert_eq!(root.sibling_note(Path::new("inexistente")), None);
    assert_eq!(root.sibling_note(Path::new("../outra")), None);
    assert_eq!(root.sibling_note(Path::new(".segredo")), None);
    assert_eq!(root.sibling_note(Path::new("dados.json")), None);
    let mut other = root.open_sibling(Path::new("outra")).unwrap();
    assert_eq!(other.scope(), Some(Path::new("outra.md")));
    let h = other.scoped_file().unwrap();
    assert_eq!(other.read(h).unwrap().0, b"# Outra\n");
    // From the sibling's scope, the first note is the one out of scope.
    assert!(matches!(
        other.handle(Path::new("nota.md")),
        Err(ConfinementError::OutOfScope)
    ));
}

#[test]
fn save_here_again_recreates_the_file_and_refuses_what_reappeared() {
    let (dir, mut root) = loose();
    fs::remove_file(dir.path().join("nota.md")).unwrap();
    let (h, _) = root.create_scoped(b"de volta").unwrap();
    assert_eq!(root.read(h).unwrap().0, b"de volta");
    let err = root.create_scoped(b"outra vez").unwrap_err();
    assert!(matches!(err, WriteError::Exists), "{err:?}");
}

#[test]
fn what_the_system_hands_over_is_classified_by_one_look_at_the_disk() {
    let (dir, _root) = loose();
    assert_eq!(kind_of(dir.path()), PathKind::Directory);
    assert_eq!(kind_of(&dir.path().join("nota.md")), PathKind::MarkdownFile);
    fs::write(dir.path().join("MAIUSCULA.MD"), "x").unwrap();
    assert_eq!(
        kind_of(&dir.path().join("MAIUSCULA.MD")),
        PathKind::MarkdownFile
    );
    fs::write(dir.path().join("longa.markdown"), "x").unwrap();
    assert_eq!(
        kind_of(&dir.path().join("longa.markdown")),
        PathKind::MarkdownFile
    );
    assert_eq!(kind_of(&dir.path().join("dados.json")), PathKind::OtherFile);
    assert_eq!(
        kind_of(&dir.path().join("nao-existe.md")),
        PathKind::Missing
    );
    // iCloud's older marker: in the cloud, in the form a read cannot fetch.
    fs::write(dir.path().join(".nuvem.md.icloud"), "x").unwrap();
    assert_eq!(kind_of(&dir.path().join("nuvem.md")), PathKind::Placeholder);
    assert_eq!(
        kind_of(&dir.path().join(".nuvem.md.icloud")),
        PathKind::Placeholder
    );
    // Opening that marker as a file is refused by the open itself.
    assert!(Root::open_file(dir.path().join("nuvem.md")).is_err());
    // A folder is not a file.
    assert!(Root::open_file(dir.path()).is_err());
}

#[test]
fn the_watch_reports_the_file_and_not_its_siblings() {
    let (dir, root) = loose();
    let (tx, rx) = std::sync::mpsc::channel();
    let _watch = root
        .watch(Duration::from_millis(100), &[], move |c| {
            let _ = tx.send(c);
        })
        .unwrap();
    // Let the creation settle.
    while rx.recv_timeout(Duration::from_millis(700)).is_ok() {}
    fs::write(dir.path().join("outra.md"), "# Outra, mudada\n").unwrap();
    fs::write(dir.path().join("sub/nova.md"), "x").unwrap();
    std::thread::sleep(Duration::from_millis(400));
    fs::write(dir.path().join("nota.md"), "# Nota, mudada\n").unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    let mut seen = Vec::new();
    while std::time::Instant::now() < deadline {
        if let Ok(c) = rx.recv_timeout(Duration::from_millis(300)) {
            seen.extend(c.paths);
            if seen.contains(&PathBuf::from("nota.md")) {
                break;
            }
        }
    }
    assert!(seen.contains(&PathBuf::from("nota.md")), "{seen:?}");
    assert!(!seen.contains(&PathBuf::from("outra.md")), "{seen:?}");
    assert!(!seen.contains(&PathBuf::from("sub/nova.md")), "{seen:?}");
}

/// Explorer marks Documents, Pictures and folders with a `desktop.ini` with
/// the READONLY attribute; it stops no write and is not a reason (moved here
/// from verso-core's loose tests: only this crate touches the disk).
#[cfg(windows)]
#[test]
fn the_readonly_attribute_of_a_directory_is_not_a_reason_on_windows() {
    let (dir, mut root) = loose();
    let was = fs::metadata(dir.path()).unwrap().permissions();
    let mut marked = was.clone();
    marked.set_readonly(true);
    fs::set_permissions(dir.path(), marked).unwrap();
    let why = root.scoped_read_only();
    let h = root.scoped_file().unwrap();
    let (_, stamp) = root.read(h).unwrap();
    let wrote = root.write(h, b"# Nota\n\nnovo\n", &stamp);
    // Back as it was (not `set_readonly(false)`, which on Unix would open
    // it to everyone).
    fs::set_permissions(dir.path(), was).unwrap();
    assert!(why.is_none(), "{why:?}");
    let _report = wrote.unwrap();
}
