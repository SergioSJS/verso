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
    root.write(h, b"depois", &stamp).unwrap();
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
    let result = root.write(h, b"depois", &stamp);
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();
    assert!(matches!(result, Err(WriteError::Io(_))), "{result:?}");
    assert_eq!(fs::read(dir.path().join("nota.md")).unwrap(), b"antes");
    let leftovers: Vec<_> = fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(leftovers.len(), 1, "{leftovers:?}");
}
