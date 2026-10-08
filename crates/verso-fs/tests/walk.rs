// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The walk, as ADR 0044 decided it on 2026-09-22: symlinks followed,
//! loops and depth reported, hidden and ignored entries skipped,
//! placeholders present.

use std::fs;
use std::path::{Path, PathBuf};

use verso_fs::{EntryKind, MAX_DEPTH, Problem, Root};

// Helpers live in a `cfg(test)` module so that the workspace's `unwrap`
// guardrail treats them as test code, which they are.
#[cfg(test)]
mod support {
    use super::*;

    pub fn touch(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    pub fn relatives(root: &mut Root) -> Vec<(String, EntryKind)> {
        root.walk()
            .entries
            .into_iter()
            .map(|e| (e.relative.to_string_lossy().into_owned(), e.kind))
            .collect()
    }
}
use support::*;

#[test]
fn notes_files_and_directories_in_a_deterministic_order() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("b.md"), "");
    touch(&dir.path().join("a.md"), "");
    touch(&dir.path().join("img/mapa.png"), "");
    touch(&dir.path().join("img/sub/nota.md"), "");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    assert_eq!(
        relatives(&mut root),
        vec![
            ("a.md".into(), EntryKind::Note),
            ("b.md".into(), EntryKind::Note),
            ("img".into(), EntryKind::Directory),
            ("img/mapa.png".into(), EntryKind::File),
            ("img/sub".into(), EntryKind::Directory),
            ("img/sub/nota.md".into(), EntryKind::Note),
        ]
    );
    let walk = root.walk();
    assert!(walk.problems.is_empty(), "{:?}", walk.problems);
    assert_eq!(walk.entries[5].depth, 2);
}

#[test]
fn hidden_entries_and_ignored_paths_are_not_walked() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join(".obsidian/app.json"), "{}");
    touch(&dir.path().join(".trash/velha.md"), "[[x]]");
    touch(&dir.path().join("a/.hidden.md"), "");
    touch(&dir.path().join("a/vis.md"), "");
    touch(&dir.path().join("anexos/x.png"), "");
    touch(&dir.path().join("anexos/y.md"), "");
    let mut root = Root::open(dir.path(), vec![PathBuf::from("anexos")]).unwrap();
    assert_eq!(
        relatives(&mut root),
        vec![
            ("a".into(), EntryKind::Directory),
            ("a/vis.md".into(), EntryKind::Note),
        ]
    );
}

#[test]
fn node_modules_and_gitignore_entries_are_not_walked() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("node_modules/pkg/index.js"), "");
    touch(&dir.path().join("target/debug/app"), "");
    touch(&dir.path().join("dist/bundle.js"), "");
    touch(&dir.path().join("notes/hello.md"), "");
    touch(&dir.path().join(".gitignore"), "custom_ignore\n*.db\n");
    touch(&dir.path().join("custom_ignore/secret.txt"), "");
    touch(&dir.path().join("test.db"), "");
    touch(&dir.path().join("readme.md"), "");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    assert_eq!(
        relatives(&mut root),
        vec![
            ("notes".into(), EntryKind::Directory),
            ("notes/hello.md".into(), EntryKind::Note),
            ("readme.md".into(), EntryKind::Note),
        ]
    );
}

#[test]
fn gitignore_semantics_are_gits_own() {
    let dir = tempfile::tempdir().unwrap();
    // Negation re-includes; `/anchored` binds to this directory only;
    // `logs/` matches directories alone; `**/deep.md` reaches down; a
    // deeper .gitignore overrides the outer one.
    touch(
        &dir.path().join(".gitignore"),
        "*.md\n!keep.md\n/anchored\nlogs/\n**/deep.md\n",
    );
    touch(&dir.path().join("drop.md"), "");
    touch(&dir.path().join("keep.md"), "");
    touch(&dir.path().join("anchored"), "");
    touch(&dir.path().join("sub/anchored"), "");
    touch(&dir.path().join("logs/a.txt"), "");
    touch(&dir.path().join("logs.txt"), "");
    touch(&dir.path().join("sub/deep.md"), "");
    touch(&dir.path().join("inner/.gitignore"), "!*.md\n");
    touch(&dir.path().join("inner/back.md"), "");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    assert_eq!(
        relatives(&mut root),
        vec![
            ("inner".into(), EntryKind::Directory),
            ("inner/back.md".into(), EntryKind::Note),
            ("keep.md".into(), EntryKind::Note),
            ("logs.txt".into(), EntryKind::File),
            ("sub".into(), EntryKind::Directory),
            ("sub/anchored".into(), EntryKind::File),
        ]
    );
}

#[test]
fn walk_rules_turn_both_ignore_kinds_off() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("build/nota.md"), "");
    touch(&dir.path().join(".gitignore"), "*.md\n");
    touch(&dir.path().join("solta.md"), "");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    root.set_rules(verso_fs::WalkRules {
        builtin_ignores: false,
        gitignore: false,
    });
    assert_eq!(
        relatives(&mut root),
        vec![
            ("build".into(), EntryKind::Directory),
            ("build/nota.md".into(), EntryKind::Note),
            ("solta.md".into(), EntryKind::Note),
        ]
    );
}

#[test]
fn icloud_placeholder_is_present_and_names_the_real_file() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("img/.Mapa da Taverna.png.icloud"), "");
    touch(&dir.path().join("img/outro.png"), "");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let entries = relatives(&mut root);
    assert!(entries.contains(&(
        "img/.Mapa da Taverna.png.icloud".into(),
        EntryKind::Placeholder {
            of: PathBuf::from("img/Mapa da Taverna.png")
        }
    )));
}

#[cfg(any(unix, windows))]
mod symlinks {
    use super::*;
    #[cfg(unix)]
    use std::os::unix::fs::symlink;

    /// Windows has one call per kind of target; Developer Mode lets an
    /// ordinary user make either (ADR 0069: the test machine has it on).
    #[cfg(windows)]
    fn symlink(target: impl AsRef<Path>, link: impl AsRef<Path>) -> std::io::Result<()> {
        if target.as_ref().is_dir() {
            std::os::windows::fs::symlink_dir(target, link)
        } else {
            std::os::windows::fs::symlink_file(target, link)
        }
    }

    #[test]
    fn symlinks_to_files_and_directories_are_followed_wherever_they_point() {
        let outside = tempfile::tempdir().unwrap();
        touch(&outside.path().join("fora/anexo.md"), "fora");
        touch(&outside.path().join("solto.md"), "solto");
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("nota.md"), "");
        symlink(outside.path().join("fora"), dir.path().join("anexos")).unwrap();
        symlink(outside.path().join("solto.md"), dir.path().join("solto.md")).unwrap();
        let mut root = Root::open(dir.path(), vec![]).unwrap();
        assert_eq!(
            relatives(&mut root),
            vec![
                ("anexos".into(), EntryKind::Directory),
                ("anexos/anexo.md".into(), EntryKind::Note),
                ("nota.md".into(), EntryKind::Note),
                ("solto.md".into(), EntryKind::Note),
            ]
        );
        // And what a symlink reaches is readable through its handle.
        let handle = root.handle(Path::new("anexos/anexo.md")).unwrap();
        let (bytes, _) = root.read(handle).unwrap();
        assert_eq!(bytes, b"fora");
    }

    #[test]
    fn a_loop_is_reported_once_and_the_walk_finishes() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("a/b/nota.md"), "");
        symlink(dir.path().join("a"), dir.path().join("a/b/volta")).unwrap();
        let mut root = Root::open(dir.path(), vec![]).unwrap();
        let walk = root.walk();
        let names: Vec<_> = walk.entries.iter().map(|e| e.relative.clone()).collect();
        assert_eq!(
            names,
            vec![
                PathBuf::from("a"),
                PathBuf::from("a/b"),
                PathBuf::from("a/b/nota.md"),
                PathBuf::from("a/b/volta"),
            ]
        );
        assert!(matches!(
            walk.problems.as_slice(),
            [Problem::Loop { relative, first_seen }]
                if relative == Path::new("a/b/volta") && first_seen == Path::new("a")
        ));
    }

    #[test]
    fn a_second_link_to_a_walked_directory_is_a_duplicate_not_a_loop() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("a/nota.md"), "");
        symlink(dir.path().join("a"), dir.path().join("b")).unwrap();
        let mut root = Root::open(dir.path(), vec![]).unwrap();
        let walk = root.walk();
        assert_eq!(walk.entries.len(), 3, "{:?}", walk.entries);
        assert!(matches!(
            walk.problems.as_slice(),
            [Problem::Duplicate { relative, first_seen }]
                if relative == Path::new("b") && first_seen == Path::new("a")
        ));
    }

    #[test]
    fn a_broken_symlink_is_a_problem_not_a_panic() {
        let dir = tempfile::tempdir().unwrap();
        symlink("/nowhere/at/all", dir.path().join("quebrado.md")).unwrap();
        let mut root = Root::open(dir.path(), vec![]).unwrap();
        let walk = root.walk();
        assert!(walk.entries.is_empty());
        assert!(
            matches!(walk.problems.as_slice(), [Problem::Io { relative, .. }] if relative == Path::new("quebrado.md"))
        );
    }

    /// On Windows a loop is usually a junction, which any user can make
    /// without Developer Mode: the same loop, the same single report.
    #[cfg(windows)]
    #[test]
    fn a_junction_loop_is_reported_once_and_the_walk_finishes() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("a/b/nota.md"), "");
        let made = std::process::Command::new("cmd")
            .arg("/C")
            .arg("mklink")
            .arg("/J")
            // Backslashes: `cmd` reads `/b` in a path as a switch.
            .arg(dir.path().join("a").join("b").join("volta"))
            .arg(dir.path().join("a"))
            .output()
            .unwrap();
        assert!(made.status.success(), "{made:?}");
        let mut root = Root::open(dir.path(), vec![]).unwrap();
        let walk = root.walk();
        assert!(
            matches!(
                walk.problems.as_slice(),
                [Problem::Loop { relative, first_seen }]
                    if relative == Path::new("a/b/volta") && first_seen == Path::new("a")
            ),
            "{:?}",
            walk.problems
        );
    }
}

#[test]
fn depth_is_capped_with_an_error_not_silence() {
    let dir = tempfile::tempdir().unwrap();
    let mut deep = dir.path().to_path_buf();
    for i in 0..=MAX_DEPTH + 1 {
        deep.push(format!("d{i}"));
    }
    touch(&deep.join("fundo.md"), "");
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    let walk = root.walk();
    assert!(
        matches!(walk.problems.as_slice(), [Problem::DepthExceeded { .. }]),
        "{:?}",
        walk.problems
    );
    assert!(walk.entries.iter().all(|e| e.kind == EntryKind::Directory));
    assert_eq!(walk.entries.last().unwrap().depth, MAX_DEPTH);
}

#[test]
fn confinement_refuses_what_leaves_the_folder() {
    let dir = tempfile::tempdir().unwrap();
    let mut root = Root::open(dir.path(), vec![]).unwrap();
    assert!(root.handle(Path::new("../fora.md")).is_err());
    assert!(root.handle(Path::new("/etc/passwd")).is_err());
    assert!(root.handle(Path::new("a/../../x")).is_err());
    assert!(root.handle(Path::new("")).is_err());
    assert!(root.handle(Path::new("a/./b.md")).is_ok());
    // The same relative path gives the same handle.
    let h1 = root.handle(Path::new("a/b.md")).unwrap();
    let h2 = root.handle(Path::new("./a/b.md")).unwrap();
    assert_eq!(h1, h2);
}

#[test]
fn a_root_must_be_a_directory() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("nota.md"), "");
    assert!(Root::open(dir.path().join("nota.md"), vec![]).is_err());
    assert!(Root::open(dir.path().join("nao-existe"), vec![]).is_err());
}

#[test]
fn hidden_and_ignored_paths_have_no_handle() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join(".obsidian/app.json"), "{}");
    touch(&dir.path().join("anexos/segredo.md"), "segredo");
    let mut root = Root::open(dir.path(), vec![PathBuf::from("./anexos")]).unwrap();
    assert_eq!(
        root.handle(Path::new(".obsidian/app.json")),
        Err(verso_fs::ConfinementError::Hidden)
    );
    assert_eq!(
        root.handle(Path::new("anexos/segredo.md")),
        Err(verso_fs::ConfinementError::Ignored)
    );
    // `./anexos` was normalized: the walk skips it too.
    assert!(relatives(&mut root).is_empty());
    // An ignore entry that leaves the folder is an error at open time.
    assert!(Root::open(dir.path(), vec![PathBuf::from("../x")]).is_err());
}
