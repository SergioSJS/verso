// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The bin's guardrail (ADR 0080, Consequences): nothing outside `.trash/`
//! is removed, and no symlink is followed.

use super::*;

fn folder() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".trash/pasta")).unwrap();
    std::fs::write(dir.path().join(".trash/pasta/velha.md"), "velha").unwrap();
    std::fs::write(dir.path().join(".trash/solta.md"), "solta").unwrap();
    std::fs::write(dir.path().join("viva.md"), "viva").unwrap();
    dir
}

#[test]
fn the_bin_is_walked_by_name_and_sorted() {
    let dir = folder();
    let found = walk(dir.path()).unwrap();
    let paths: Vec<&str> = found.iter().map(|b| b.path.as_str()).collect();
    assert_eq!(
        paths,
        vec![".trash/pasta", ".trash/pasta/velha.md", ".trash/solta.md"]
    );
    assert!(found[0].dir);
    assert_eq!(found[2].len, 5);
    let none = tempfile::tempdir().unwrap();
    assert!(walk(none.path()).unwrap().is_empty());
}

#[test]
fn only_a_path_inside_the_bin_is_removed() {
    let dir = folder();
    for outside in ["viva.md", ".trash", ".trash/../viva.md", "/etc/passwd", ""] {
        assert!(purge(dir.path(), Path::new(outside)).is_err(), "{outside}");
    }
    assert!(dir.path().join("viva.md").exists());
    purge(dir.path(), Path::new(".trash/pasta/velha.md")).unwrap();
    // The folder it left empty goes; the bin stays.
    assert!(!dir.path().join(".trash/pasta").exists());
    assert!(dir.path().join(".trash/solta.md").exists());
    purge(dir.path(), Path::new(".trash/solta.md")).unwrap();
    assert!(dir.path().join(".trash").is_dir());
    // Nothing there is not an error.
    purge(dir.path(), Path::new(".trash/solta.md")).unwrap();
}

#[cfg(unix)]
#[test]
fn a_symlink_in_the_bin_is_removed_never_followed() {
    let dir = folder();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("alvo.md"), "fora").unwrap();
    std::os::unix::fs::symlink(outside.path(), dir.path().join(".trash/link-pasta")).unwrap();
    std::os::unix::fs::symlink(
        outside.path().join("alvo.md"),
        dir.path().join(".trash/link.md"),
    )
    .unwrap();
    let found = walk(dir.path()).unwrap();
    // Listed as themselves, not entered.
    assert!(
        found
            .iter()
            .all(|b| !b.path.starts_with(".trash/link-pasta/"))
    );
    assert!(
        found
            .iter()
            .any(|b| b.path == ".trash/link-pasta" && !b.dir)
    );
    // Through the link: refused.
    assert!(purge(dir.path(), Path::new(".trash/link-pasta/alvo.md")).is_err());
    purge(dir.path(), Path::new(".trash/link-pasta")).unwrap();
    purge(dir.path(), Path::new(".trash/link.md")).unwrap();
    assert_eq!(
        std::fs::read_to_string(outside.path().join("alvo.md")).unwrap(),
        "fora"
    );
}

#[cfg(unix)]
#[test]
fn a_bin_that_is_a_link_is_neither_walked_nor_emptied() {
    let dir = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("alvo.md"), "fora").unwrap();
    std::os::unix::fs::symlink(outside.path(), dir.path().join(".trash")).unwrap();
    assert!(walk(dir.path()).unwrap().is_empty());
    assert!(purge(dir.path(), Path::new(".trash/alvo.md")).is_err());
    assert!(outside.path().join("alvo.md").exists());
    std::fs::write(dir.path().join("nota.md"), "x").unwrap();
    assert!(keep_copy(dir.path(), Path::new("nota.md")).is_err());
    assert!(!outside.path().join("nota.md").exists());
}

#[test]
fn a_restore_never_replaces_and_prunes_the_bin() {
    let dir = folder();
    std::fs::create_dir(dir.path().join("pasta")).unwrap();
    std::fs::write(dir.path().join("pasta/velha.md"), "nova").unwrap();
    assert!(matches!(
        restore(
            dir.path(),
            Path::new(".trash/pasta/velha.md"),
            Path::new("pasta/velha.md")
        ),
        Err(WriteError::Exists)
    ));
    assert_eq!(
        std::fs::read_to_string(dir.path().join("pasta/velha.md")).unwrap(),
        "nova"
    );
    let _ = restore(
        dir.path(),
        Path::new(".trash/pasta/velha.md"),
        Path::new("outra/velha.md"),
    )
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.path().join("outra/velha.md")).unwrap(),
        "velha"
    );
    assert!(!dir.path().join(".trash/pasta").exists());
    assert!(restore(dir.path(), Path::new("viva.md"), Path::new("x.md")).is_err());
}

#[test]
fn a_copy_kept_takes_a_free_name_and_leaves_the_file() {
    let dir = folder();
    std::fs::write(dir.path().join("solta.md"), "agora").unwrap();
    let kept = keep_copy(dir.path(), Path::new("solta.md")).unwrap();
    assert_eq!(kept, PathBuf::from(".trash/solta (2).md"));
    assert_eq!(
        std::fs::read_to_string(dir.path().join(".trash/solta (2).md")).unwrap(),
        "agora"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("solta.md")).unwrap(),
        "agora"
    );
    let names: Vec<String> = std::fs::read_dir(dir.path().join(".trash"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert!(
        names.iter().all(|n| !n.starts_with(".verso-tmp")),
        "{names:?}"
    );
}
