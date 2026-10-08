// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Creating, renaming and trashing (ADR 0048): one test per
//! refusal and per promise a test can observe. The directory `fsync`
//! calls are not observable without a power loss; they are in `ops.rs`
//! for the reviewer, as the atomic write's are.

use std::fs;
use std::path::{Path, PathBuf};

use verso_fs::{ConfinementError, ReadError, Root, Stamp, WriteError};

#[cfg(test)]
mod support {
    use super::*;

    pub fn touch(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    pub fn names(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    /// The paths every write door must refuse: absolute, `..`, hidden,
    /// empty, a NUL byte.
    pub fn refused() -> Vec<PathBuf> {
        vec![
            PathBuf::from("/etc/passwd"),
            PathBuf::from("../fora.md"),
            PathBuf::from("a/../../x.md"),
            PathBuf::from(".obsidian/x.md"),
            PathBuf::from("a/.hidden.md"),
            PathBuf::from(""),
            PathBuf::from(std::ffi::OsStr::new("a\0b.md")),
        ]
    }
}
use support::*;

#[test]
fn create_writes_the_content_makes_the_folders_and_leaves_no_temporary_file() {
    let dir = tempfile::tempdir().unwrap();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let (h, report) = root.create(Path::new("a/b/nova.md"), b"# Nova\n").unwrap();
    assert_eq!(
        fs::read(dir.path().join("a/b/nova.md")).unwrap(),
        b"# Nova\n"
    );
    assert!(report.warnings().is_empty(), "{report:?}");
    // The report's stamp is the file's: a first write over it is accepted.
    let (_, read) = root.read(h).unwrap();
    assert_eq!(report.stamp, Some(read));
    let _ = root.write(h, b"editada\n", &read).unwrap();
    assert_eq!(names(&dir.path().join("a/b")), vec!["nova.md"]);
}

#[test]
fn create_refuses_an_occupied_destination_whatever_stands_there() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("nota.md"), "antes");
    fs::create_dir(dir.path().join("pasta")).unwrap();
    touch(&dir.path().join("img/.mapa.png.icloud"), "<plist/>");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    for taken in ["nota.md", "pasta", "img/mapa.png"] {
        let r = root.create(Path::new(taken), b"x");
        assert!(matches!(r, Err(WriteError::Exists)), "{taken}: {r:?}");
    }
    // Nothing was replaced and nothing was left behind.
    assert_eq!(fs::read(dir.path().join("nota.md")).unwrap(), b"antes");
    assert_eq!(names(dir.path()), vec!["img", "nota.md", "pasta"]);
    assert_eq!(names(&dir.path().join("img")), vec![".mapa.png.icloud"]);
}

#[test]
fn every_write_door_refuses_a_path_that_leaves_or_hides() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("nota.md"), "x");
    let mut root = Root::open(dir.path(), vec![PathBuf::from("ignorada")]).unwrap();
    let mut bad = refused();
    bad.push(PathBuf::from("ignorada/x.md"));
    for p in &bad {
        assert!(
            matches!(root.create(p, b"x"), Err(WriteError::Confined(_))),
            "create {p:?}"
        );
        assert!(
            matches!(root.create_dir(p), Err(WriteError::Confined(_))),
            "create_dir {p:?}"
        );
        assert!(
            matches!(
                root.rename(Path::new("nota.md"), p),
                Err(WriteError::Confined(_))
            ),
            "rename to {p:?}"
        );
        assert!(
            matches!(
                root.rename(p, Path::new("outra.md")),
                Err(WriteError::Confined(_))
            ),
            "rename from {p:?}"
        );
        assert!(
            matches!(root.trash(p), Err(WriteError::Confined(_))),
            "trash {p:?}"
        );
    }
    // The one reason each is refused is the confinement's own.
    assert!(matches!(
        root.create(Path::new("../fora.md"), b"x"),
        Err(WriteError::Confined(ConfinementError::ParentComponent))
    ));
    assert!(matches!(
        root.trash(Path::new(".obsidian/app.json")),
        Err(WriteError::Confined(ConfinementError::Hidden))
    ));
    assert_eq!(names(dir.path()), vec!["nota.md"]);
    assert_eq!(fs::read(dir.path().join("nota.md")).unwrap(), b"x");
}

#[test]
fn create_dir_makes_the_folder_and_its_parents_once() {
    let dir = tempfile::tempdir().unwrap();
    let root = Root::open(dir.path(), vec![]).unwrap();
    let (made, report) = root.create_dir(Path::new("./a/b//c")).unwrap();
    assert_eq!(made, PathBuf::from("a/b/c"));
    assert!(report.warnings().is_empty(), "{report:?}");
    assert!(dir.path().join("a/b/c").is_dir());
    // Already there: not an error, nothing replaced.
    touch(&dir.path().join("a/b/c/nota.md"), "fica");
    let _ = root.create_dir(Path::new("a/b/c")).unwrap();
    assert_eq!(fs::read(dir.path().join("a/b/c/nota.md")).unwrap(), b"fica");
}

#[test]
fn rename_moves_a_file_with_its_content_and_makes_the_destination_folders() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("a.md"), "conteudo");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let (h, report) = root
        .rename(Path::new("a.md"), Path::new("sub/deep/b.md"))
        .unwrap();
    assert!(report.warnings().is_empty(), "{report:?}");
    assert_eq!(names(dir.path()), vec!["sub"]);
    assert_eq!(
        fs::read(dir.path().join("sub/deep/b.md")).unwrap(),
        b"conteudo"
    );
    let (bytes, _) = root.read(h).unwrap();
    assert_eq!(bytes, b"conteudo");
}

#[cfg(unix)]
#[test]
fn rename_keeps_the_mode_and_the_attributes_of_a_file() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("a.md"), "x");
    fs::set_permissions(dir.path().join("a.md"), fs::Permissions::from_mode(0o640)).unwrap();
    let tagged = xattr::set(dir.path().join("a.md"), "user.verso.test", b"tag").is_ok();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let _ = root.rename(Path::new("a.md"), Path::new("b.md")).unwrap();
    let meta = fs::metadata(dir.path().join("b.md")).unwrap();
    assert_eq!(meta.permissions().mode() & 0o777, 0o640);
    if tagged {
        assert_eq!(
            xattr::get(dir.path().join("b.md"), "user.verso.test")
                .unwrap()
                .as_deref(),
            Some(&b"tag"[..])
        );
    }
}

#[test]
fn rename_refuses_an_occupied_destination_and_a_placeholder_source() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("a.md"), "A");
    touch(&dir.path().join("b.md"), "B");
    fs::create_dir(dir.path().join("pasta")).unwrap();
    touch(&dir.path().join("img/.mapa.png.icloud"), "<plist/>");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    for taken in ["b.md", "pasta", "img/mapa.png", "img/.mapa.png.icloud"] {
        let r = root.rename(Path::new("a.md"), Path::new(taken));
        assert!(matches!(r, Err(WriteError::Exists)), "{taken}: {r:?}");
    }
    assert_eq!(fs::read(dir.path().join("a.md")).unwrap(), b"A");
    assert_eq!(fs::read(dir.path().join("b.md")).unwrap(), b"B");
    // A placeholder is never moved: moving the marker would not move the
    // content, and the sync client would lose track of it (ADR 0043).
    for evicted in ["img/mapa.png", "img/.mapa.png.icloud"] {
        let r = root.rename(Path::new(evicted), Path::new("img/outro.png"));
        assert!(
            matches!(r, Err(WriteError::Placeholder)),
            "{evicted}: {r:?}"
        );
    }
    assert_eq!(names(&dir.path().join("img")), vec![".mapa.png.icloud"]);
    // A source that is not there is an error, not a silent success.
    assert!(matches!(
        root.rename(Path::new("nada.md"), Path::new("x.md")),
        Err(WriteError::Io(e)) if e.kind() == std::io::ErrorKind::NotFound
    ));
}

#[test]
fn a_rename_that_changes_only_the_case_of_the_name_is_not_refused() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("Alvo.md"), "x");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    // On a case-insensitive volume (APFS by default) the destination is
    // the source itself; on a case-sensitive one it is free. Either way
    // the file ends up under the new spelling only.
    let (h, _) = root
        .rename(Path::new("Alvo.md"), Path::new("alvo.md"))
        .unwrap();
    assert_eq!(names(dir.path()), vec!["alvo.md"]);
    let (bytes, _) = root.read(h).unwrap();
    assert_eq!(bytes, b"x");
}

#[cfg(unix)]
#[test]
fn two_names_of_one_file_in_one_folder_are_not_a_case_only_rename() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("nota.md"), "x");
    fs::hard_link(dir.path().join("nota.md"), dir.path().join("mesma.md")).unwrap();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    // `rename` of one hard link over another is a no-op for POSIX: it
    // must not be reported as a move that happened.
    let r = root.rename(Path::new("nota.md"), Path::new("mesma.md"));
    assert!(matches!(r, Err(WriteError::Exists)), "{r:?}");
    assert_eq!(names(dir.path()), vec!["mesma.md", "nota.md"]);
}

#[cfg(unix)]
#[test]
fn rename_moves_a_symlink_as_a_symlink_and_a_folder_with_its_content() {
    use std::os::unix::fs::symlink;
    let outside = tempfile::tempdir().unwrap();
    touch(&outside.path().join("real.md"), "real");
    let dir = tempfile::tempdir().unwrap();
    symlink(outside.path().join("real.md"), dir.path().join("link.md")).unwrap();
    touch(&dir.path().join("pasta/nota.md"), "n");
    touch(&dir.path().join("pasta/sub/fundo.md"), "f");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let _ = root
        .rename(Path::new("link.md"), Path::new("moved.md"))
        .unwrap();
    assert!(
        fs::symlink_metadata(dir.path().join("moved.md"))
            .unwrap()
            .is_symlink()
    );
    assert_eq!(fs::read(outside.path().join("real.md")).unwrap(), b"real");
    let _ = root
        .rename(Path::new("pasta"), Path::new("nova/pasta"))
        .unwrap();
    assert_eq!(
        fs::read(dir.path().join("nova/pasta/sub/fundo.md")).unwrap(),
        b"f"
    );
    assert_eq!(names(dir.path()), vec!["moved.md", "nova"]);
}

#[test]
fn trash_moves_into_the_bin_keeping_the_path_and_numbers_collisions() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("a/x.md"), "1");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let (gone, report) = root.trash(Path::new("a/x.md")).unwrap();
    assert_eq!(gone, PathBuf::from(".trash/a/x.md"));
    assert!(report.warnings().is_empty(), "{report:?}");
    assert_eq!(fs::read(dir.path().join(".trash/a/x.md")).unwrap(), b"1");
    assert!(fs::symlink_metadata(dir.path().join("a/x.md")).is_err());
    // The same name again: the first one in the bin is kept.
    touch(&dir.path().join("a/x.md"), "2");
    let (gone, _) = root.trash(Path::new("a/x.md")).unwrap();
    assert_eq!(gone, PathBuf::from(".trash/a/x (2).md"));
    touch(&dir.path().join("a/x.md"), "3");
    let (gone, _) = root.trash(Path::new("a/x.md")).unwrap();
    assert_eq!(gone, PathBuf::from(".trash/a/x (3).md"));
    assert_eq!(fs::read(dir.path().join(".trash/a/x.md")).unwrap(), b"1");
    // A folder goes whole.
    touch(&dir.path().join("pasta/nota.md"), "n");
    let (gone, _) = root.trash(Path::new("pasta")).unwrap();
    assert_eq!(gone, PathBuf::from(".trash/pasta"));
    assert_eq!(
        fs::read(dir.path().join(".trash/pasta/nota.md")).unwrap(),
        b"n"
    );
}

#[test]
fn trash_refuses_a_placeholder_and_what_is_not_there() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join(".Nota.md.icloud"), "<plist/>");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    for evicted in ["Nota.md", ".Nota.md.icloud"] {
        let r = root.trash(Path::new(evicted));
        assert!(
            matches!(r, Err(WriteError::Placeholder)),
            "{evicted}: {r:?}"
        );
    }
    assert!(matches!(
        root.trash(Path::new("nada.md")),
        Err(WriteError::Io(e)) if e.kind() == std::io::ErrorKind::NotFound
    ));
    assert_eq!(names(dir.path()), vec![".Nota.md.icloud"]);
    // And the marker itself is still unavailable through its real name.
    let h = root.handle(Path::new("Nota.md")).unwrap();
    assert!(matches!(root.read(h), Err(ReadError::Unavailable)));
}

#[test]
fn waypoints_absent_never_creates_space_directory() {
    let dir = tempfile::tempdir().unwrap();
    let root = Root::open(dir.path(), vec![]).unwrap();

    // Absent waypoints answers NotFound and does not create .space/
    assert!(matches!(
        root.read_waypoints(),
        Err(ReadError::Io(e)) if e.kind() == std::io::ErrorKind::NotFound
    ));
    assert!(!dir.path().join(".space").exists());

    // write_waypoints when .space/ does not exist fails and never creates .space/
    let dummy_stamp = Stamp {
        modified: std::time::UNIX_EPOCH,
        len: 0,
        hash: 0,
    };
    assert!(root.write_waypoints(b"[]", &dummy_stamp).is_err());
    assert!(!dir.path().join(".space").exists());
}

#[test]
fn waypoints_read_and_write_atomically_while_other_hidden_paths_are_refused() {
    let dir = tempfile::tempdir().unwrap();
    let root = Root::open(dir.path(), vec![]).unwrap();

    // Other hidden paths remain strictly refused by confinement (ADR 0044, ADR 0062 D7).
    assert!(matches!(
        root.confine(Path::new(".space/other.json")),
        Err(ConfinementError::Hidden)
    ));
    assert!(matches!(
        root.confine(Path::new(".obsidian/app.json")),
        Err(ConfinementError::Hidden)
    ));
    assert!(matches!(
        root.confine(Path::new(".trash/x.md")),
        Err(ConfinementError::Hidden)
    ));

    // When make.md's .space/waypoints.json is placed on disk:
    fs::create_dir(dir.path().join(".space")).unwrap();
    let original = b"[{\"name\":\"Home\",\"paths\":[\"/\"]}]";
    fs::write(dir.path().join(".space/waypoints.json"), original).unwrap();

    // read_waypoints reads it and yields its Stamp.
    let (bytes, stamp) = root.read_waypoints().unwrap();
    assert_eq!(bytes, original);

    // write_waypoints updates it atomically checking the stamp.
    let updated =
        b"[{\"name\":\"Home\",\"paths\":[\"/\"]},{\"name\":\"Projetos\",\"paths\":[\"p\"]}]";
    let report = root.write_waypoints(updated, &stamp).unwrap();
    assert!(report.warnings().is_empty());
    assert_eq!(
        fs::read(dir.path().join(".space/waypoints.json")).unwrap(),
        updated
    );

    // A stale stamp is refused with WriteError::Changed.
    assert!(matches!(
        root.write_waypoints(b"[]", &stamp),
        Err(WriteError::Changed { .. })
    ));

    // An iCloud placeholder sibling (.space/.waypoints.json.icloud) is treated as Unavailable (Invariant 10).
    fs::remove_file(dir.path().join(".space/waypoints.json")).unwrap();
    fs::write(dir.path().join(".space/.waypoints.json.icloud"), b"").unwrap();
    assert!(matches!(root.read_waypoints(), Err(ReadError::Unavailable)));
    assert!(matches!(
        root.write_waypoints(b"[]", &stamp),
        Err(WriteError::Placeholder)
    ));
}

/// A name every OS can keep (ADR 0070): what is made or renamed must be one
/// Windows keeps as written, on every OS, since the folder may be synced to
/// Windows. Refused: a device name, a trailing dot or space, `:` and
/// `* " < > ? |`. Nothing is written for a refused name.
#[test]
fn a_new_name_must_be_one_every_os_can_keep() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("nota.md"), "x");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    for name in [
        "CON.md",
        "nul.md",
        "COM1.md",
        "a:b.md",
        "a?b.md",
        "a*b.md",
        "a|b.md",
        "a<b.md",
        "nota.",
        "pasta/aux.md",
    ] {
        assert!(
            matches!(
                root.create(Path::new(name), b"x"),
                Err(WriteError::Confined(
                    ConfinementError::UnportableName | ConfinementError::Absolute
                ))
            ),
            "create {name}"
        );
        assert!(
            matches!(
                root.create_dir(Path::new(name)),
                Err(WriteError::Confined(
                    ConfinementError::UnportableName | ConfinementError::Absolute
                ))
            ),
            "create_dir {name}"
        );
        assert!(
            matches!(
                root.rename(Path::new("nota.md"), Path::new(name)),
                Err(WriteError::Confined(
                    ConfinementError::UnportableName | ConfinementError::Absolute
                ))
            ),
            "rename to {name}"
        );
    }
    // (On Windows `a:b.md` is read as drive A: and refused as absolute
    // before its name is looked at.)
    assert_eq!(names(dir.path()), vec!["nota.md"]);
    // Names every OS keeps are made as before.
    let _ = root
        .create(Path::new("Reunião, pauta (2).md"), b"x")
        .unwrap();
    let _ = root.create_dir(Path::new("console")).unwrap();
}

/// An entry that already exists is the user's: one whose name Windows
/// could not keep, made by another app on a Unix system, still opens, is
/// written, holds new notes and is renamed to a name every OS keeps
/// (ADR 0070). Windows cannot hold such a name at all.
#[cfg(unix)]
#[test]
fn an_existing_name_no_os_check_refuses_it() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("Reunião: pauta.md"), "x");
    fs::create_dir(dir.path().join("Ideias?")).unwrap();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let h = root.handle(Path::new("Reunião: pauta.md")).unwrap();
    let (bytes, stamp) = root.read(h).unwrap();
    assert_eq!(bytes, b"x");
    let _ = root.write(h, b"y", &stamp).unwrap();
    // Inside an existing folder with such a name, a new portable note.
    let _ = root.create(Path::new("Ideias?/nova.md"), b"z").unwrap();
    // Renamed away to a portable name; not to another unportable one.
    let _ = root
        .rename(
            Path::new("Reunião: pauta.md"),
            Path::new("Reunião - pauta.md"),
        )
        .unwrap();
    assert!(matches!(
        root.rename(
            Path::new("Reunião - pauta.md"),
            Path::new("Reunião: de novo.md")
        ),
        Err(WriteError::Confined(ConfinementError::UnportableName))
    ));
    assert_eq!(
        names(dir.path()),
        vec!["Ideias?".to_owned(), "Reunião - pauta.md".to_owned()]
    );
}
