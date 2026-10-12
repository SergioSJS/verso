// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's settings directory, `.verso/` (ADR 0070 items 1–2): the
//! one hidden directory a path may name, never listed by the walk, listed
//! apart for sync, and created only by a write.

use std::fs;
use std::path::Path;

use verso_fs::{ConfinementError, EntryKind, Root, SETTINGS_FILE, WriteError};

#[cfg(test)]
mod support {
    use super::*;

    pub fn touch(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }
}
use support::touch;

#[test]
fn the_walk_does_not_list_it_and_the_settings_walk_does() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("Nota.md"), "# Nota\n");
    touch(&dir.path().join(".verso/settings.json"), "{}\n");
    touch(&dir.path().join(".verso/.verso-tmp-1-2"), "meio");
    touch(&dir.path().join(".verso/sub/fundo.json"), "{}");
    touch(&dir.path().join(".obsidian/app.json"), "{}");
    let mut root = Root::open(dir.path(), Vec::new()).unwrap();
    let walked: Vec<String> = root
        .walk()
        .entries
        .iter()
        .map(|e| e.relative.to_string_lossy().into_owned())
        .collect();
    assert_eq!(walked, ["Nota.md"]);
    let settings = root.settings_walk().unwrap();
    let listed: Vec<String> = settings
        .iter()
        .map(|e| e.relative.to_string_lossy().into_owned())
        .collect();
    assert_eq!(listed, [SETTINGS_FILE]);
    assert_eq!(settings[0].kind, EntryKind::File);
    assert_eq!(settings[0].len, 3);
    // Its handle reads the file, as any file's does.
    let (bytes, _) = root.read(settings[0].handle).unwrap();
    assert_eq!(bytes, b"{}\n");
}

#[test]
fn a_settings_walk_of_a_folder_without_it_creates_nothing() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("Nota.md"), "# Nota\n");
    let mut root = Root::open(dir.path(), Vec::new()).unwrap();
    assert!(root.settings_walk().unwrap().is_empty());
    let _ = root.walk();
    assert!(!dir.path().join(".verso").exists());
}

#[test]
fn only_the_directory_and_its_plain_entries_are_confined_like_files() {
    let dir = tempfile::tempdir().unwrap();
    let root = Root::open(dir.path(), Vec::new()).unwrap();
    assert_eq!(
        root.confine(Path::new(".verso/settings.json")).unwrap(),
        Path::new(SETTINGS_FILE)
    );
    assert!(root.confine(Path::new(".verso")).is_ok());
    for refused in [
        ".verso/.verso-tmp-1-2",
        ".verso/sub/fundo.json",
        ".obsidian/app.json",
        "pasta/.verso/settings.json",
    ] {
        assert_eq!(
            root.confine(Path::new(refused)),
            Err(ConfinementError::Hidden),
            "{refused}"
        );
    }
    assert_eq!(
        root.confine(Path::new(".verso/../../fora.json")),
        Err(ConfinementError::ParentComponent)
    );
}

#[test]
fn the_first_write_makes_the_directory_and_a_second_create_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let mut root = Root::open(dir.path(), Vec::new()).unwrap();
    assert!(!dir.path().join(".verso").exists());
    let _ = root
        .create(Path::new(SETTINGS_FILE), b"{\"a\": 1}\n")
        .unwrap();
    assert_eq!(
        fs::read(dir.path().join(".verso/settings.json")).unwrap(),
        b"{\"a\": 1}\n"
    );
    // Created once: what stands there is never replaced by a create.
    assert!(matches!(
        root.create(Path::new(SETTINGS_FILE), b"{\"b\": 2}\n"),
        Err(WriteError::Exists)
    ));
    assert_eq!(
        fs::read(dir.path().join(".verso/settings.json")).unwrap(),
        b"{\"a\": 1}\n"
    );
}

#[test]
fn an_icloud_placeholder_of_the_file_is_listed_as_one_and_never_created_over() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join(".verso/.settings.json.icloud"), "");
    let mut root = Root::open(dir.path(), Vec::new()).unwrap();
    let settings = root.settings_walk().unwrap();
    assert_eq!(settings.len(), 1);
    assert_eq!(settings[0].relative, Path::new(SETTINGS_FILE));
    assert!(matches!(settings[0].kind, EntryKind::Placeholder { .. }));
    // The placeholder is the file, not in this computer: never a free name.
    assert!(matches!(
        root.create(Path::new(SETTINGS_FILE), b"{}\n"),
        Err(WriteError::Exists)
    ));
    assert!(!dir.path().join(".verso/settings.json").exists());
}
