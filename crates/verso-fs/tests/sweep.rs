// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The temporary files a stopped process left behind are removed when a
//! host opens the folder (`Root::sweep_temporaries`): every
//! `.verso-tmp-<pid>_<nonce>-<n>` of another incarnation (or the old
//! `<pid>-<n>` form), in the folder, in its
//! subfolders, in the settings directory and in the bin; nothing else, and
//! none of this process's own, which may belong to a write in flight under
//! another opening of the same folder.

use std::fs;
use std::path::Path;

use verso_fs::{Root, WalkRules};

#[cfg(test)]
fn touch(root: &Path, rel: &str) {
    let path = root.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, b"x").unwrap();
}

/// A temporary file's name as a process that is not this one wrote it.
#[cfg(test)]
fn stale(n: u32) -> String {
    // Not this process's id: a process that stopped.
    let other = std::process::id().wrapping_add(1).max(2);
    format!(".verso-tmp-{other}-{n}")
}

#[test]
fn a_stale_temporary_file_is_gone_after_the_opening_and_nothing_else_is() {
    let dir = tempfile::tempdir().unwrap();
    let root_path = dir.path();
    let gone = [
        stale(1),
        format!("Pasta/{}", stale(2)),
        format!("Pasta/Funda/{}", stale(3)),
        // The folder's settings directory: the walk leaves its
        // temporaries out, the sweep does not (ADR 0070).
        format!(".verso/{}", stale(4)),
        // The bin keeps a deleted folder whole (ADR 0080).
        format!(".trash/Velha/{}", stale(5)),
        format!(".space/{}", stale(6)),
        // Same pid, another incarnation's nonce (a container restarted
        // with the same pid), and the old pid-only form with this very pid.
        format!(".verso-tmp-{}_0123456789abcdef-1", std::process::id()),
        format!("Pasta/.verso-tmp-{}-2", std::process::id()),
    ];
    let kept = [
        "Nota.md".to_owned(),
        "Pasta/Outra.md".to_owned(),
        ".verso/settings.json".to_owned(),
        // Not the prefix exactly, or not one of our names.
        ".verso-tmp".to_owned(),
        ".verso-tmp-".to_owned(),
        ".verso-tmp-abc-1".to_owned(),
        "verso-tmp-12-1".to_owned(),
        format!("Pasta/x{}", stale(7)),
        // Hidden directories Verso never writes in, and ignored ones.
        format!(".git/{}", stale(10)),
        format!(".obsidian/{}", stale(11)),
        format!("node_modules/{}", stale(12)),
    ];
    for rel in gone.iter().chain(&kept) {
        touch(root_path, rel);
    }
    let root = Root::open(root_path, Vec::new()).unwrap();
    assert_eq!(root.sweep_temporaries().unwrap(), gone.len());
    for rel in &gone {
        assert!(!root_path.join(rel).exists(), "{rel} should be gone");
    }
    for rel in &kept {
        assert!(root_path.join(rel).exists(), "{rel} should stay");
    }
    // A second opening finds nothing more to remove.
    assert_eq!(root.sweep_temporaries().unwrap(), 0);
}

/// An ignored folder is entered when the built-in ignores are off, as the
/// walk then enters it; a folder the caller ignores never is.
#[test]
fn the_sweep_enters_the_folders_the_walk_enters() {
    let dir = tempfile::tempdir().unwrap();
    touch(dir.path(), &format!("node_modules/{}", stale(1)));
    touch(dir.path(), &format!("Arquivo/{}", stale(2)));
    let mut root = Root::open(dir.path(), vec!["Arquivo".into()]).unwrap();
    root.set_rules(WalkRules {
        builtin_ignores: false,
        ..root.rules()
    });
    assert_eq!(root.sweep_temporaries().unwrap(), 1);
    assert!(!dir.path().join("node_modules").join(stale(1)).exists());
    assert!(dir.path().join("Arquivo").join(stale(2)).exists());
}

/// A symlinked folder is not followed: what it leads to is swept where it
/// lives, if that is a folder Verso opens.
#[cfg(unix)]
#[test]
fn a_symlink_is_not_followed() {
    let dir = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    touch(outside.path(), &stale(1));
    std::os::unix::fs::symlink(outside.path(), dir.path().join("Ligada")).unwrap();
    let root = Root::open(dir.path(), Vec::new()).unwrap();
    assert_eq!(root.sweep_temporaries().unwrap(), 0);
    assert!(outside.path().join(stale(1)).exists());
}
