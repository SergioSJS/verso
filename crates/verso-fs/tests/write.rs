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
