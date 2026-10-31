// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The atomic write, one test per requirement of ADR 0029 that a test can
//! observe, plus invariant 11. The `fsync` calls are not observable
//! without a power loss; they are in `write.rs` for the reviewer.

use std::fs;
use std::path::Path;

use verso_fs::{ReadError, Root, WriteError};

#[cfg(test)]
mod support {
    use super::*;

    pub fn root_with(name: &str, content: &str) -> (tempfile::TempDir, Root) {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(name), content).unwrap();
        let root = Root::open(dir.path(), vec![]).unwrap();
        (dir, root)
    }
}
use support::*;

#[test]
fn replaces_the_content_and_leaves_no_temporary_file() {
    let (dir, mut root) = root_with("nota.md", "antes");
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (bytes, stamp) = root.read(h).unwrap();
    assert_eq!(bytes, b"antes");
    let report = root.write(h, b"depois", &stamp).unwrap();
    assert_eq!(fs::read(dir.path().join("nota.md")).unwrap(), b"depois");
    let leftovers: Vec<_> = fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .filter(|n| n.to_string_lossy().contains("verso-tmp"))
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
    // The report's stamp is the file's new stamp: the next read agrees.
    let (_, next) = root.read(h).unwrap();
    assert_eq!(report.stamp, Some(next));
}

#[test]
fn refuses_to_write_over_a_file_that_changed_since_it_was_read() {
    let (dir, mut root) = root_with("nota.md", "antes");
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    // Someone else (Obsidian, sync) writes in between.
    fs::write(dir.path().join("nota.md"), "outra coisa, outro tamanho").unwrap();
    let err = root.write(h, b"depois", &stamp).unwrap_err();
    assert!(matches!(err, WriteError::Changed { .. }), "{err:?}");
    assert_eq!(
        fs::read(dir.path().join("nota.md")).unwrap(),
        b"outra coisa, outro tamanho"
    );
}

#[test]
fn refuses_a_write_to_a_file_that_does_not_exist() {
    let (_dir, mut root) = root_with("nota.md", "x");
    let h = root.handle(Path::new("nova.md")).unwrap();
    let (_, stamp) = {
        let h0 = root.handle(Path::new("nota.md")).unwrap();
        root.read(h0).unwrap()
    };
    assert!(matches!(
        root.write(h, b"x", &stamp),
        Err(WriteError::Io(_))
    ));
    assert!(matches!(root.read(h), Err(ReadError::Io(_))));
}

#[cfg(unix)]
#[test]
fn preserves_the_mode() {
    use std::os::unix::fs::PermissionsExt;
    let (dir, mut root) = root_with("nota.md", "antes");
    fs::set_permissions(
        dir.path().join("nota.md"),
        fs::Permissions::from_mode(0o640),
    )
    .unwrap();
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    let report = root.write(h, b"depois", &stamp).unwrap();
    assert!(report.mode_preserved);
    let mode = fs::metadata(dir.path().join("nota.md"))
        .unwrap()
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(mode, 0o640);
}

// Extended attributes are a Unix notion; on Windows nothing is carried (ADR 0069).
#[cfg(unix)]
#[test]
fn preserves_extended_attributes() {
    let (dir, mut root) = root_with("nota.md", "antes");
    let path = dir.path().join("nota.md");
    if xattr::set(&path, "user.verso.test", b"tag").is_err() {
        // The temporary directory's file system has no xattrs: nothing to test.
        return;
    }
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    let report = root.write(h, b"depois", &stamp).unwrap();
    assert!(
        report.xattrs_not_preserved.is_empty(),
        "{:?}",
        report.xattrs_not_preserved
    );
    assert_eq!(
        xattr::get(&path, "user.verso.test").unwrap().as_deref(),
        Some(&b"tag"[..])
    );
}

#[cfg(unix)]
#[test]
fn warns_when_the_original_has_another_hard_link() {
    let (dir, mut root) = root_with("nota.md", "antes");
    fs::hard_link(dir.path().join("nota.md"), dir.path().join("mesma.md")).unwrap();
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    let report = root.write(h, b"depois", &stamp).unwrap();
    assert!(report.hard_link_shared);
    // The rename swapped the inode: the other link keeps the old content.
    assert_eq!(fs::read(dir.path().join("mesma.md")).unwrap(), b"antes");
    assert_eq!(fs::read(dir.path().join("nota.md")).unwrap(), b"depois");
}

#[test]
fn a_local_folder_is_not_a_network_file_system() {
    let (_dir, mut root) = root_with("nota.md", "antes");
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    let report = root.write(h, b"depois", &stamp).unwrap();
    assert_eq!(report.network_fs, None);
}

#[cfg(unix)]
#[test]
fn a_write_through_a_symlink_lands_on_the_target_and_keeps_the_link() {
    use std::os::unix::fs::symlink;
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("real.md"), "conteudo real").unwrap();
    let dir = tempfile::tempdir().unwrap();
    symlink(outside.path().join("real.md"), dir.path().join("nota.md")).unwrap();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (bytes, stamp) = root.read(h).unwrap();
    assert_eq!(bytes, b"conteudo real");
    let report = root.write(h, b"editado", &stamp).unwrap();
    assert_eq!(
        fs::read(outside.path().join("real.md")).unwrap(),
        b"editado"
    );
    assert!(
        fs::symlink_metadata(dir.path().join("nota.md"))
            .unwrap()
            .is_symlink()
    );
    assert!(report.wrote_through_symlink_to.is_some());
}

/// The report names where the write landed as the disk spells it, not as
/// the link wrote it (review M5). Only Windows respells; a symlink there
/// may need a privilege the machine does not give, and then it is skipped.
#[cfg(windows)]
#[test]
fn the_report_of_a_write_through_a_symlink_names_the_target_as_the_disk_spells_it() {
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("real.md"), "conteudo real").unwrap();
    let dir = tempfile::tempdir().unwrap();
    if std::os::windows::fs::symlink_file(
        outside.path().join("REAL.md"),
        dir.path().join("nota.md"),
    )
    .is_err()
    {
        return;
    }
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    let report = root.write(h, b"editado", &stamp).unwrap();
    let landed = report.wrote_through_symlink_to.unwrap();
    assert_eq!(landed.file_name().unwrap(), "real.md");
}

#[test]
fn refuses_to_write_over_a_placeholder_and_read_reports_it_unavailable() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join(".Nota.md.icloud"), "<plist>junk</plist>").unwrap();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    // Through the name of the real file: present, unavailable — not absent.
    let h = root.handle(Path::new("Nota.md")).unwrap();
    assert!(matches!(root.read(h), Err(ReadError::Unavailable)));
    let fake = verso_fs::Stamp {
        modified: std::time::SystemTime::UNIX_EPOCH,
        len: 0,
        hash: 0,
    };
    assert!(matches!(
        root.write(h, b"x", &fake),
        Err(WriteError::Placeholder)
    ));
    // The placeholder entry the walk lists is not readable as content either.
    let walk = root.walk();
    let entry = walk
        .entries
        .iter()
        .find(|e| matches!(e.kind, verso_fs::EntryKind::Placeholder { .. }))
        .unwrap();
    assert!(matches!(
        root.read(entry.handle),
        Err(ReadError::Unavailable)
    ));
    assert!(matches!(
        root.write(entry.handle, b"x", &fake),
        Err(WriteError::Placeholder)
    ));
    assert_eq!(
        fs::read(dir.path().join(".Nota.md.icloud")).unwrap(),
        b"<plist>junk</plist>"
    );
}

#[test]
fn a_long_file_name_is_still_writable() {
    let name = format!("{}.md", "n".repeat(247)); // 250 bytes, under NAME_MAX
    let (dir, mut root) = root_with(&name, "antes");
    let h = root.handle(Path::new(&name)).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    assert!(
        root.write(h, b"depois", &stamp)
            .unwrap()
            .warnings()
            .is_empty()
    );
    assert_eq!(fs::read(dir.path().join(&name)).unwrap(), b"depois");
}

#[test]
fn a_same_length_rewrite_with_the_time_restored_is_still_refused() {
    let (dir, mut root) = root_with("nota.md", "aaaaa");
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    let path = dir.path().join("nota.md");
    fs::write(&path, "ccccc").unwrap();
    // Restore the modified time, as cp -p, rsync or a restore would.
    fs::File::options()
        .write(true)
        .open(&path)
        .unwrap()
        .set_modified(stamp.modified)
        .unwrap();
    let err = root.write(h, b"depois", &stamp).unwrap_err();
    assert!(matches!(err, WriteError::Changed { .. }), "{err:?}");
    assert_eq!(fs::read(&path).unwrap(), b"ccccc");
}

#[test]
fn a_handle_from_another_root_is_refused() {
    let (_a, mut root_a) = root_with("nota.md", "vault A");
    let (_b, mut root_b) = root_with("nota.md", "vault B");
    let ha = root_a.handle(Path::new("nota.md")).unwrap();
    let _hb = root_b.handle(Path::new("nota.md")).unwrap();
    assert!(matches!(root_b.read(ha), Err(ReadError::UnknownHandle(_))));
}

#[test]
fn owner_is_reported_preserved_when_the_writer_owns_the_file() {
    let (_dir, mut root) = root_with("nota.md", "antes");
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    let report = root.write(h, b"depois", &stamp).unwrap();
    assert!(report.owner_preserved);
    assert_eq!(report.durability_not_confirmed, None);
}

#[cfg(unix)]
#[test]
fn a_failure_before_the_rename_leaves_the_original_untouched() {
    use std::os::unix::fs::PermissionsExt;
    let (dir, mut root) = root_with("nota.md", "antes");
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    // A read-only directory: the temporary file cannot be created.
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o500)).unwrap();
    let probe = fs::write(dir.path().join("probe"), "");
    let result = root.write(h, b"depois", &stamp);
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();
    if probe.is_ok() {
        // Running as a user the mode does not restrict (root): nothing to prove.
        let _ = fs::remove_file(dir.path().join("probe"));
        return;
    }
    assert!(matches!(result, Err(WriteError::Io(_))), "{result:?}");
    assert_eq!(fs::read(dir.path().join("nota.md")).unwrap(), b"antes");
    let leftovers: Vec<_> = fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(leftovers.len(), 1, "{leftovers:?}");
}

#[cfg(unix)]
#[test]
fn a_symlink_to_an_evicted_file_is_a_placeholder_not_a_broken_link() {
    use std::os::unix::fs::symlink;
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join(".Real.md.icloud"), "<plist/>").unwrap();
    let dir = tempfile::tempdir().unwrap();
    symlink(outside.path().join("Real.md"), dir.path().join("nota.md")).unwrap();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let walk = root.walk();
    assert!(walk.problems.is_empty(), "{:?}", walk.problems);
    assert!(
        matches!(walk.entries.as_slice(), [e] if matches!(e.kind, verso_fs::EntryKind::Placeholder { .. }))
    );
    let h = root.handle(Path::new("nota.md")).unwrap();
    assert!(matches!(root.read(h), Err(ReadError::Unavailable)));
    // A symlink straight at a `.icloud` file: unavailable through the target too.
    symlink(
        outside.path().join(".Real.md.icloud"),
        dir.path().join("direto.md"),
    )
    .unwrap();
    let h2 = root.handle(Path::new("direto.md")).unwrap();
    assert!(matches!(root.read(h2), Err(ReadError::Unavailable)));
}

#[test]
fn a_real_file_wins_over_a_stale_placeholder_sibling() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("Nota.md"), "real").unwrap();
    fs::write(dir.path().join(".Nota.md.icloud"), "<plist/>").unwrap();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let walk = root.walk();
    let kinds: Vec<_> = walk
        .entries
        .iter()
        .map(|e| (e.relative.clone(), e.kind.clone()))
        .collect();
    assert!(
        kinds
            .iter()
            .any(|(p, k)| p == Path::new("Nota.md") && *k == verso_fs::EntryKind::Note)
    );
    let h = root.handle(Path::new("Nota.md")).unwrap();
    let (bytes, stamp) = root.read(h).unwrap();
    assert_eq!(bytes, b"real");
    let _ = root.write(h, b"editado", &stamp).unwrap();
    assert_eq!(fs::read(dir.path().join("Nota.md")).unwrap(), b"editado");
    // And the placeholder entry itself stays unavailable and is addressable.
    let hp = root.handle(Path::new(".Nota.md.icloud")).unwrap();
    assert!(matches!(root.read(hp), Err(ReadError::Unavailable)));
}

#[test]
fn a_directory_named_like_a_placeholder_is_a_directory() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir(dir.path().join(".Pasta.md.icloud")).unwrap();
    fs::write(dir.path().join(".Pasta.md.icloud/dentro.md"), "x").unwrap();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let walk = root.walk();
    assert!(
        walk.entries
            .iter()
            .any(|e| e.relative == Path::new(".Pasta.md.icloud/dentro.md"))
    );
}

#[test]
fn a_foreign_handle_is_refused_for_writing_too() {
    let (_a, mut root_a) = root_with("nota.md", "vault A");
    let (_b, mut root_b) = root_with("nota.md", "vault B");
    let ha = root_a.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root_a.read(ha).unwrap();
    let _ = root_b.handle(Path::new("nota.md")).unwrap();
    assert!(matches!(
        root_b.write(ha, b"x", &stamp),
        Err(WriteError::UnknownHandle(_))
    ));
}

#[cfg(unix)]
#[test]
fn the_temporary_file_of_a_symlinked_write_is_made_next_to_the_target() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("real.md"), "antes").unwrap();
    let dir = tempfile::tempdir().unwrap();
    symlink(outside.path().join("real.md"), dir.path().join("nota.md")).unwrap();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let h = root.handle(Path::new("nota.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    // The link's own directory cannot be written: a temporary file there
    // would fail; next to the target it succeeds.
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o500)).unwrap();
    let result = root.write(h, b"depois", &stamp);
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();
    if fs::write(dir.path().join("probe"), "").is_ok() && result.is_err() {
        // Running as a user the mode does not restrict (root): nothing to prove here.
        return;
    }
    let _ = result.unwrap();
    assert_eq!(fs::read(outside.path().join("real.md")).unwrap(), b"depois");
}

#[test]
fn a_relative_root_survives_a_change_of_working_directory() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir(dir.path().join("a")).unwrap();
    fs::create_dir(dir.path().join("b")).unwrap();
    fs::write(dir.path().join("a/nota.md"), "A").unwrap();
    fs::write(dir.path().join("b/nota.md"), "B").unwrap();
    let previous = std::env::current_dir().unwrap();
    std::env::set_current_dir(dir.path().join("a")).unwrap();
    let mut root = Root::open(".", vec![]).unwrap();
    let h = root.handle(Path::new("nota.md")).unwrap();
    std::env::set_current_dir(dir.path().join("b")).unwrap();
    let (bytes, _) = root.read(h).unwrap();
    std::env::set_current_dir(previous).unwrap();
    assert_eq!(bytes, b"A");
}

/// A device's edit names the file in its own case (`Receita.md`) while the
/// disk holds `receita.md`. Where the file system folds case the two are
/// one file, and the write replaces it: the name the disk holds stays. On
/// NTFS a rename over a file gives it the case of the new name, so the
/// write puts the temporary file over the name as the disk spells it
/// (`os::kept_spelling`; found by the server's sync test on a loaded
/// Windows machine, 2026-10-21). Nothing to check on a file system that
/// tells the two apart: they are two files there.
#[test]
fn a_write_through_another_case_keeps_the_name_the_disk_holds() {
    let (dir, mut root) = root_with("receita.md", "antes");
    if fs::metadata(dir.path().join("RECEITA.MD")).is_err() {
        return;
    }
    let h = root.handle(Path::new("Receita.md")).unwrap();
    let (_, stamp) = root.read(h).unwrap();
    let _report = root.write(h, b"depois", &stamp).unwrap();
    let names: Vec<String> = fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, vec!["receita.md".to_owned()]);
    assert_eq!(fs::read(dir.path().join("receita.md")).unwrap(), b"depois");
}
