// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The watcher, on a real folder and the operating system's own events
//! (FSEvents on macOS, inotify on Linux): a change made outside is
//! reported by its path relative to the root; what the walk does not list
//! is not; reading is not a change; a dropped watch says nothing more.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};

use verso_fs::{Changes, Root, Watch};

// Helpers live in a `cfg(test)` module so that the workspace's `unwrap`
// guardrail treats them as test code, which they are.
#[cfg(test)]
mod support {
    use super::*;

    /// Short, so that the tests are quick; the app's is longer.
    pub const QUIET: Duration = Duration::from_millis(100);

    /// Long, because a loaded CI machine delivers events late.
    pub const PATIENCE: Duration = Duration::from_secs(10);

    pub fn touch(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    pub fn watch(root: &Root) -> (Watch, Receiver<Changes>) {
        watch_excluding(root, &[])
    }

    pub fn watch_excluding(root: &Root, excluded: &[PathBuf]) -> (Watch, Receiver<Changes>) {
        let (tx, rx) = mpsc::channel();
        let watch = root
            .watch(QUIET, excluded, move |changes| {
                let _ = tx.send(changes);
            })
            .unwrap();
        (watch, rx)
    }

    /// Batches until one names `path`, or `PATIENCE` runs out.
    pub fn reported(rx: &Receiver<Changes>, path: &str) -> bool {
        let deadline = Instant::now() + PATIENCE;
        while let Some(left) = deadline.checked_duration_since(Instant::now()) {
            match rx.recv_timeout(left) {
                Ok(changes) if changes.paths.contains(&PathBuf::from(path)) => return true,
                Ok(_) => {}
                Err(_) => return false,
            }
        }
        false
    }

    /// Every path reported until the folder has been quiet for `quiet`.
    pub fn everything_until_quiet(rx: &Receiver<Changes>, quiet: Duration) -> Vec<PathBuf> {
        let mut paths = Vec::new();
        while let Ok(changes) = rx.recv_timeout(quiet) {
            paths.extend(changes.paths);
        }
        paths
    }

    /// A watch that has settled: whatever the operating system still had
    /// to say about the folder's creation has been said.
    pub fn settled(root: &Root) -> (Watch, Receiver<Changes>) {
        let (watch, rx) = watch(root);
        let _ = everything_until_quiet(&rx, Duration::from_millis(700));
        (watch, rx)
    }
}
use support::*;

#[test]
fn a_change_made_outside_is_reported_by_its_relative_path() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("Lugares/Porto.md"), "# Porto\n");
    let root = Root::open(dir.path(), Vec::new()).unwrap();
    let (_watch, rx) = settled(&root);

    touch(&dir.path().join("Taverna.md"), "# Taverna\n");
    assert!(reported(&rx, "Taverna.md"), "a new note");

    touch(&dir.path().join("Lugares/Porto.md"), "# Porto\n\nNovo.\n");
    assert!(reported(&rx, "Lugares/Porto.md"), "a note written");

    fs::rename(
        dir.path().join("Taverna.md"),
        dir.path().join("Lugares/Taverna.md"),
    )
    .unwrap();
    assert!(reported(&rx, "Lugares/Taverna.md"), "a note moved");

    fs::remove_file(dir.path().join("Lugares/Porto.md")).unwrap();
    assert!(reported(&rx, "Lugares/Porto.md"), "a note removed");
}

#[test]
fn what_the_walk_does_not_list_is_not_reported() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join(".obsidian")).unwrap();
    fs::create_dir_all(dir.path().join("Arquivo")).unwrap();
    let root = Root::open(dir.path(), vec![PathBuf::from("Arquivo")]).unwrap();
    let (_watch, rx) = settled(&root);

    touch(&dir.path().join(".obsidian/workspace.json"), "{}");
    touch(&dir.path().join("Arquivo/Velho.md"), "# Velho\n");
    touch(&dir.path().join(".verso-tmp-1-2"), "temporário");
    touch(&dir.path().join("Nota.md"), "# Nota\n");
    let seen = everything_until_quiet(&rx, Duration::from_secs(2));
    assert!(seen.contains(&PathBuf::from("Nota.md")), "{seen:?}");
    assert!(
        seen.iter().all(|p| p == Path::new("Nota.md")),
        "only the note the walk lists: {seen:?}"
    );
}

#[test]
fn reading_the_folder_is_not_a_change() {
    let dir = tempfile::tempdir().unwrap();
    for name in ["Uma.md", "Duas.md", "Lugares/Três.md"] {
        touch(&dir.path().join(name), "# texto\n");
    }
    let mut root = Root::open(dir.path(), Vec::new()).unwrap();
    let (_watch, rx) = settled(&root);

    // What the index does on every batch: walk and read every note. On
    // Linux each open is an event; none of them may come back as a change,
    // or a caller that indexes on every batch would never stop.
    let walk = root.walk();
    for entry in &walk.entries {
        if entry.relative.extension().is_some_and(|e| e == "md") {
            root.read(entry.handle).unwrap();
        }
    }
    let seen = everything_until_quiet(&rx, Duration::from_secs(2));
    assert!(seen.is_empty(), "reads reported as changes: {seen:?}");
}

#[test]
fn a_dropped_watch_reports_nothing_more() {
    let dir = tempfile::tempdir().unwrap();
    let root = Root::open(dir.path(), Vec::new()).unwrap();
    let (watch, rx) = settled(&root);
    drop(watch);
    touch(&dir.path().join("Depois.md"), "# Depois\n");
    // The batching thread may still hand over what it had; nothing about
    // a change made after the drop reaches the caller.
    let seen = everything_until_quiet(&rx, Duration::from_secs(2));
    assert!(!seen.contains(&PathBuf::from("Depois.md")), "{seen:?}");
}

/// The configuration directory inside the open folder (`~` opened as the
/// folder on macOS holds `~/Library/Application Support/verso`): the index
/// written there must not wake the watch, or a caller that indexes on each
/// batch would index for ever.
#[test]
fn the_callers_own_directory_is_not_reported() {
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("Library/Application Support/verso");
    fs::create_dir_all(config.join("index")).unwrap();
    let root = Root::open(dir.path(), Vec::new()).unwrap();
    let (_watch, rx) = watch_excluding(&root, std::slice::from_ref(&config));
    let _ = everything_until_quiet(&rx, Duration::from_millis(700));

    touch(&config.join("index/pasta-0123.json"), "{}");
    touch(&config.join("index/pasta-0123.sqlite"), "x");
    touch(&dir.path().join("Nota.md"), "# Nota\n");
    let seen = everything_until_quiet(&rx, Duration::from_secs(2));
    assert!(seen.contains(&PathBuf::from("Nota.md")), "{seen:?}");
    assert!(
        seen.iter().all(|p| !p.starts_with("Library")),
        "the index's own writes reported: {seen:?}"
    );
}
