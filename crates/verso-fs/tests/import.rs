// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Importing a picked file in pieces (T.12): the bytes are identical at
//! every size around a chunk, a failure leaves nothing, a name taken is
//! refused before a byte is copied.

use std::path::Path;

use verso_fs::{ImportError, PICK_CHUNK, PickedError, Root, WriteError};

fn bytes(len: usize) -> Vec<u8> {
    (0..len).map(|i| (i.wrapping_mul(31) % 251) as u8).collect()
}

fn leftovers(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.starts_with(".verso-tmp-"))
        .collect()
}

#[test]
fn a_streamed_import_is_identical_at_every_size_around_a_chunk() {
    let outside = tempfile::tempdir().unwrap();
    let vault = tempfile::tempdir().unwrap();
    let mut root = Root::open(vault.path(), vec![]).unwrap();
    let sizes = [
        0,
        1,
        PICK_CHUNK - 1,
        PICK_CHUNK,
        PICK_CHUNK + 1,
        2 * PICK_CHUNK,
        5 * PICK_CHUNK + 12_345,
    ];
    for (i, size) in sizes.into_iter().enumerate() {
        let data = bytes(size);
        let source = outside.path().join(format!("src{i}.bin"));
        std::fs::write(&source, &data).unwrap();
        let name = format!("sub/in{i}.bin");
        let (handle, report) = root
            .create_from_picked(Path::new(&name), &source, u64::MAX)
            .unwrap();
        let (read, stamp) = root.read(handle).unwrap();
        assert!(read == data, "size {size}");
        // The stamp of the pieces is the stamp of the whole.
        assert_eq!(report.stamp, Some(stamp));
    }
    assert!(leftovers(&vault.path().join("sub")).is_empty());
}

#[test]
fn a_name_taken_is_refused_before_copying_and_nothing_is_overwritten() {
    let outside = tempfile::tempdir().unwrap();
    let vault = tempfile::tempdir().unwrap();
    std::fs::write(vault.path().join("a.pdf"), b"mine").unwrap();
    let source = outside.path().join("a.pdf");
    std::fs::write(&source, bytes(3 * PICK_CHUNK)).unwrap();
    let mut root = Root::open(vault.path(), vec![]).unwrap();
    let refused = root.create_from_picked(Path::new("a.pdf"), &source, u64::MAX);
    assert!(matches!(
        refused,
        Err(ImportError::Write(WriteError::Exists))
    ));
    assert_eq!(std::fs::read(vault.path().join("a.pdf")).unwrap(), b"mine");
    assert!(leftovers(vault.path()).is_empty());
}

#[test]
fn a_failure_mid_copy_leaves_no_file_and_no_temporary() {
    let outside = tempfile::tempdir().unwrap();
    let vault = tempfile::tempdir().unwrap();
    let source = outside.path().join("big.bin");
    std::fs::write(&source, bytes(3 * PICK_CHUNK)).unwrap();
    let mut root = Root::open(vault.path(), vec![]).unwrap();
    // Over the bound: the copy has begun when it is found out only if the
    // file grew; here the measure catches it, and nothing is left.
    let refused =
        root.create_from_picked(Path::new("novo/big.bin"), &source, 2 * PICK_CHUNK as u64);
    assert!(matches!(
        refused,
        Err(ImportError::Picked(PickedError::TooLarge))
    ));
    assert!(!vault.path().join("novo").exists());
    assert!(!vault.path().join("big.bin").exists());
    assert!(leftovers(vault.path()).is_empty());
    // A source that is not a file, and one that is gone.
    let dir_source = root.create_from_picked(Path::new("d.bin"), outside.path(), 10);
    assert!(matches!(
        dir_source,
        Err(ImportError::Picked(PickedError::NotAFile))
    ));
    let gone = root.create_from_picked(Path::new("g.bin"), &outside.path().join("none"), 10);
    assert!(matches!(gone, Err(ImportError::Picked(PickedError::Io(_)))));
    assert!(leftovers(vault.path()).is_empty());
    assert!(std::fs::read_dir(vault.path()).unwrap().next().is_none());
}

#[test]
fn a_path_outside_the_folder_is_confined() {
    let outside = tempfile::tempdir().unwrap();
    let vault = tempfile::tempdir().unwrap();
    let source = outside.path().join("s.bin");
    std::fs::write(&source, b"x").unwrap();
    let mut root = Root::open(vault.path(), vec![]).unwrap();
    let refused = root.create_from_picked(Path::new("../escape.bin"), &source, 10);
    assert!(matches!(
        refused,
        Err(ImportError::Write(WriteError::Confined(_)))
    ));
    assert!(!vault.path().parent().unwrap().join("escape.bin").exists());
}

#[test]
fn a_sink_failing_after_some_chunks_takes_the_temporary_file_with_it() {
    let outside = tempfile::tempdir().unwrap();
    let vault = tempfile::tempdir().unwrap();
    let source = outside.path().join("big.bin");
    std::fs::write(&source, bytes(4 * PICK_CHUNK)).unwrap();
    let root = Root::open(vault.path(), vec![]).unwrap();
    let mut staged = root.stage(Path::new("meio.bin")).unwrap();
    let mut pieces = 0;
    let failed = verso_fs::copy_picked(&source, u64::MAX, |piece| {
        pieces += 1;
        if pieces == 3 {
            return Err(std::io::Error::other("disk full"));
        }
        staged.append(piece)
    });
    assert!(matches!(failed, Err(PickedError::Io(_))));
    assert_eq!(staged.len(), 2 * PICK_CHUNK as u64);
    assert_eq!(leftovers(vault.path()).len(), 1);
    drop(staged);
    assert!(leftovers(vault.path()).is_empty());
    assert!(!vault.path().join("meio.bin").exists());
}
