// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's layer of settings, `.verso/settings.json` (ADR 0070
//! items 1–2):
//! - opening and indexing a folder never create it
//! - the first change creates it; a later one goes over the version read
//! - the machine's copy moves in once: a second create never replaces it
//! - the folder's values apply over the machine's, the walk's rules too
//! - the index, the listing and the notes never see it; sync's listing does
//! - a change made elsewhere is reported by the watch's batch
//! - a file that is not JSON is kept as it is

use std::fs;
use std::path::Path;

use tempfile::{Builder, tempdir};
use verso_core::{
    Changes, CoreError, FolderLayer, FolderSettings, LayerProblem, WalkRules, Workspace, WriteError,
};

const FILE: &str = ".verso/settings.json";

#[cfg(test)]
mod support {
    use super::*;

    pub fn open(dir: &Path, config: &Path) -> Workspace {
        Workspace::open(dir, Some(config)).expect("open workspace")
    }

    /// A folder named exactly `name` inside `parent`, kept.
    pub fn folder(parent: &Path, name: &str) {
        let _ = Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempdir_in(parent)
            .unwrap()
            .keep();
    }

    /// Whether `dir` holds an entry named `name`: what a test may ask of a
    /// folder here, listing it (`Path::exists` is denied outside verso-fs).
    pub fn has(dir: &Path, name: &str) -> bool {
        fs::read_dir(dir)
            .unwrap()
            .any(|e| e.unwrap().file_name() == name)
    }

    pub fn bookmarks(list: &[&str]) -> FolderSettings {
        FolderSettings {
            bookmarks: Some(list.iter().map(|s| (*s).to_owned()).collect()),
            ..FolderSettings::default()
        }
    }
}
use support::*;

#[test]
fn opening_and_indexing_a_folder_never_create_it() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    fs::write(dir.path().join("Nota.md"), "# Nota\n").unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    ws.set_walk_rules(WalkRules {
        builtin_ignores: false,
        gitignore: false,
    });
    ws.set_folder_note_name("README");
    ws.index().unwrap();
    let layer = ws.folder_settings();
    assert!(!layer.exists);
    assert_eq!(layer.revision, None);
    assert!(!has(dir.path(), ".verso"));
    assert!(ws.settings_entries().is_empty());
}

#[test]
fn the_first_change_creates_it_and_a_later_one_goes_over_the_version_read() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    let first = ws
        .set_folder_settings(&bookmarks(&["Nota.md"]), None)
        .unwrap();
    assert!(first.exists);
    assert_eq!(
        fs::read_to_string(dir.path().join(FILE)).unwrap(),
        "{\n  \"bookmarks\": [\n    \"Nota.md\"\n  ]\n}\n"
    );
    // Over the version read: every other key kept, this one replaced.
    let change = FolderSettings {
        respect_gitignore: Some(false),
        ..bookmarks(&["Nota.md", "pasta/Outra.md"])
    };
    let second = ws
        .set_folder_settings(&change, first.revision.as_deref())
        .unwrap();
    assert_eq!(
        second.settings.bookmarks,
        Some(vec!["Nota.md".to_owned(), "pasta/Outra.md".to_owned()])
    );
    assert_eq!(second.settings.respect_gitignore, Some(false));
    // A read answers what the write did, without the write's warnings.
    assert_eq!(
        ws.folder_settings(),
        FolderLayer {
            warnings: Vec::new(),
            ..second
        }
    );
    // Over a version that is no longer there: nothing written.
    let before = fs::read_to_string(dir.path().join(FILE)).unwrap();
    let stale = ws.set_folder_settings(&bookmarks(&[]), first.revision.as_deref());
    assert!(matches!(
        stale,
        Err(CoreError::Write(WriteError::Changed { .. }))
    ));
    assert_eq!(fs::read_to_string(dir.path().join(FILE)).unwrap(), before);
}

#[test]
fn the_machines_copy_moves_in_once_and_never_over_another_machines() {
    let dir = tempdir().unwrap();
    let a = tempdir().unwrap();
    let b = tempdir().unwrap();
    // This machine opens the folder first: its bookmarks move in.
    let mut here = open(dir.path(), a.path());
    here.set_folder_settings(&bookmarks(&["Daqui.md"]), None)
        .unwrap();
    // Another machine, which synced the folder, has its own copy: the
    // folder's wins, and nothing of it is replaced.
    let mut there = open(dir.path(), b.path());
    assert!(there.folder_settings().exists);
    let moved = there.set_folder_settings(&bookmarks(&["Dali.md"]), None);
    assert!(matches!(moved, Err(CoreError::Write(WriteError::Exists))));
    assert_eq!(
        there.folder_settings().settings.bookmarks,
        Some(vec!["Daqui.md".to_owned()])
    );
}

#[test]
fn a_bookmark_outside_the_folder_refuses_the_change() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    for bad in ["/etc/passwd", "../fora.md", "a/../../b.md"] {
        assert!(
            matches!(
                ws.set_folder_settings(&bookmarks(&[bad]), None),
                Err(CoreError::Confined(_))
            ),
            "{bad}"
        );
    }
    assert!(!has(dir.path(), ".verso"));
}

#[test]
fn the_folders_values_apply_over_the_machines_the_walks_rules_too() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    folder(dir.path(), "node_modules");
    fs::write(dir.path().join("node_modules/Pacote.md"), "# Pacote\n").unwrap();
    fs::write(dir.path().join("Nota.md"), "# Nota\n").unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.set_folder_note_name("README");
    ws.index().unwrap();
    // No file: this machine's rules (build folders left out) and name.
    assert!(ws.search("Pacote", 10).unwrap().is_empty());
    assert_eq!(ws.folder_note_name(), "README");
    let layer = ws
        .set_folder_settings(
            &FolderSettings {
                ignore_build_dirs: Some(false),
                ..FolderSettings::default()
            },
            None,
        )
        .unwrap();
    // The file exists: its values, and the default for what it does not
    // set — the folder's note named after the folder.
    assert_eq!(ws.folder_note_name(), "");
    ws.index().unwrap();
    assert_eq!(ws.search("Pacote", 10).unwrap().len(), 1);
    // The machine's setting changes nothing while the folder has its own.
    ws.set_walk_rules(WalkRules::default());
    ws.index().unwrap();
    assert_eq!(ws.search("Pacote", 10).unwrap().len(), 1);
    let layer = ws
        .set_folder_settings(
            &FolderSettings {
                folder_note_name: Some("Índice.md".to_owned()),
                ..FolderSettings::default()
            },
            layer.revision.as_deref(),
        )
        .unwrap();
    assert_eq!(layer.settings.folder_note_name.as_deref(), Some("Índice"));
    assert_eq!(ws.folder_note_name(), "Índice");
    // A second opening reads the folder's rules before its first walk.
    let elsewhere = tempdir().unwrap();
    let mut again = open(dir.path(), elsewhere.path());
    again.index().unwrap();
    assert_eq!(again.search("Pacote", 10).unwrap().len(), 1);
}

#[test]
fn the_index_and_the_listing_never_see_it_and_syncs_listing_does() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    fs::write(dir.path().join("Nota.md"), "# Nota\n").unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.set_folder_settings(&bookmarks(&["Nota.md"]), None)
        .unwrap();
    fs::write(
        dir.path().join(".verso/Escondida.md"),
        "# Escondida dragão\n",
    )
    .unwrap();
    ws.index().unwrap();
    assert!(ws.search("dragão", 10).unwrap().is_empty());
    assert!(ws.entries().iter().all(|e| !e.path.starts_with(".verso")));
    let synced: Vec<&str> = ws
        .settings_entries()
        .iter()
        .map(|e| e.path.as_str())
        .collect();
    assert_eq!(synced, [".verso/Escondida.md", FILE]);
    // No note lives there: refused as a note, read and written as a file.
    assert!(matches!(
        ws.note_key(".verso/Escondida"),
        Err(CoreError::Confined(_))
    ));
    let (bytes, revision) = ws.read_with_revision(FILE).unwrap();
    let mut text = String::from_utf8(bytes).unwrap();
    text = text.replace("Nota.md", "Outra.md");
    ws.write_bytes(FILE, text.as_bytes(), Some(&revision))
        .unwrap();
    assert_eq!(
        ws.folder_settings().settings.bookmarks,
        Some(vec!["Outra.md".to_owned()])
    );
    assert!(ws.entries().iter().all(|e| !e.path.starts_with(".verso")));
}

#[test]
fn a_change_made_elsewhere_is_reported_by_the_watchs_batch() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    fs::write(dir.path().join("Nota.md"), "# Nota\n").unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.set_folder_settings(&bookmarks(&["Nota.md"]), None)
        .unwrap();
    ws.index().unwrap();
    // Another machine's version, brought by a sync tool.
    fs::write(
        dir.path().join(FILE),
        "{\n  \"bookmarks\": [\n    \"Dali.md\"\n  ]\n}\n",
    )
    .unwrap();
    let report = ws
        .index_changes(
            &Changes {
                paths: vec![FILE.into()],
                rescan: false,
            },
            |_| {},
        )
        .unwrap();
    assert!(report.narrowed);
    assert_eq!(report.changed, vec![FILE.to_owned()]);
    assert_eq!(
        ws.folder_settings().settings.bookmarks,
        Some(vec!["Dali.md".to_owned()])
    );
    // One that changes the walk's rules makes the batch a walk, which
    // reports it.
    fs::write(dir.path().join(FILE), "{\"respectGitignore\": false}\n").unwrap();
    let report = ws
        .index_changes(
            &Changes {
                paths: vec![FILE.into()],
                rescan: false,
            },
            |_| {},
        )
        .unwrap();
    assert!(!report.narrowed);
    assert!(report.changed.contains(&FILE.to_owned()));
}

#[test]
fn a_write_of_the_file_that_changes_the_rules_makes_the_next_batch_a_walk() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    folder(dir.path(), "node_modules");
    fs::write(dir.path().join("node_modules/Pacote.md"), "# Pacote\n").unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    assert!(ws.search("Pacote", 10).unwrap().is_empty());
    // Another device's version, written here by sync (ADR 0079 item 7).
    ws.write_bytes(FILE, b"{\"ignoreBuildDirs\": false}\n", None)
        .unwrap();
    let report = ws
        .index_changes(
            &Changes {
                paths: vec![FILE.into()],
                rescan: false,
            },
            |_| {},
        )
        .unwrap();
    assert!(!report.narrowed);
    assert!(report.changed.contains(&FILE.to_owned()));
    assert_eq!(ws.search("Pacote", 10).unwrap().len(), 1);
}

#[test]
fn a_file_that_is_not_json_is_kept_as_it_is() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    folder(dir.path(), ".verso");
    fs::write(dir.path().join(FILE), "não é json").unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.set_folder_note_name("README");
    let layer = ws.folder_settings();
    assert!(layer.exists);
    assert_eq!(layer.problem, Some(LayerProblem::Invalid));
    // The machine's values apply meanwhile.
    assert_eq!(ws.folder_note_name(), "README");
    assert!(matches!(
        ws.set_folder_settings(&bookmarks(&[]), layer.revision.as_deref()),
        Err(CoreError::FolderSettings(_))
    ));
    assert!(matches!(
        ws.set_folder_settings(&bookmarks(&[]), None),
        Err(CoreError::Write(WriteError::Exists))
    ));
    assert_eq!(
        fs::read_to_string(dir.path().join(FILE)).unwrap(),
        "não é json"
    );
}

#[test]
fn a_suggested_theme_is_kept_as_an_object_and_refused_when_it_is_not_one() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    let theme = |text: &str| FolderSettings {
        recommended_theme: Some(text.to_owned()),
        ..FolderSettings::default()
    };
    for bad in [
        "[1]",
        "\"x\"",
        "not json",
        &format!("{{\"a\":\"{}\"}}", "x".repeat(17 * 1024)),
    ] {
        assert!(matches!(
            ws.set_folder_settings(&theme(bad), None),
            Err(CoreError::FolderSettings(_))
        ));
    }
    assert!(!has(dir.path(), ".verso"));
    let first = ws
        .set_folder_settings(&theme("{\"verso-theme\":1,\"name\":\"Pergaminho\"}"), None)
        .unwrap();
    let text = fs::read_to_string(dir.path().join(FILE)).unwrap();
    assert!(text.contains("\"recommendedTheme\": {"), "{text}");
    let read = ws.folder_settings();
    let kept: serde_json::Value =
        serde_json::from_str(read.settings.recommended_theme.as_deref().unwrap()).unwrap();
    assert_eq!(kept["name"], "Pergaminho");
    // An empty text takes the suggestion away, every other key kept.
    let gone = ws
        .set_folder_settings(&theme(""), first.revision.as_deref())
        .unwrap();
    assert_eq!(gone.settings.recommended_theme, None);
}
