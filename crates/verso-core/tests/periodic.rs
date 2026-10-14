// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Periodic notes' settings in the folder's layer (ADR 0093 item 4) and
//! Obsidian's two settings files, read-only (item 11):
//! - a change of the periodic settings is written under `periodic`, key
//!   by key, every other key kept; reading gives it back;
//! - a folder or template out of the folder refuses the whole change;
//! - Obsidian's two files are offered as they are, nothing else under
//!   `.obsidian/` is read, and nothing there is written.

use std::fs;
use std::path::Path;

use tempfile::{Builder, tempdir};
use verso_core::{CoreError, FolderSettings, Period, Periodic, Workspace};

const FILE: &str = ".verso/settings.json";

#[cfg(test)]
mod support {
    use super::*;

    /// The folders of `path`, made under `parent` and kept (`create_dir` is
    /// denied outside verso-fs; a test makes them as the others here do).
    pub fn mkdirs(parent: &Path, path: &str) {
        let mut at = parent.to_path_buf();
        for name in path.split('/') {
            let _ = Builder::new()
                .prefix(name)
                .rand_bytes(0)
                .tempdir_in(&at)
                .unwrap()
                .keep();
            at.push(name);
        }
    }
}
use support::mkdirs;

fn week_on(folder: &str) -> FolderSettings {
    FolderSettings {
        periodic: Some(Periodic {
            week: Some(Period {
                on: Some(true),
                folder: Some(folder.to_owned()),
                ..Period::default()
            }),
            week_start: Some("monday".to_owned()),
            language: Some("pt-BR".to_owned()),
            ..Periodic::default()
        }),
        ..FolderSettings::default()
    }
}

#[test]
fn the_periodic_settings_are_written_key_by_key_and_read_back() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    mkdirs(dir.path(), ".verso");
    fs::write(
        dir.path().join(FILE),
        "{\n  \"bookmarks\": [\"Nota.md\"],\n  \"periodic\": {\n    \"day\": {\"folder\": \"Diário\", \"x\": 1}\n  }\n}\n",
    )
    .unwrap();
    let mut ws = Workspace::open(dir.path(), Some(config.path())).unwrap();
    let read = ws.folder_settings();
    let day = read
        .settings
        .periodic
        .as_ref()
        .unwrap()
        .day
        .as_ref()
        .unwrap();
    assert_eq!(day.folder.as_deref(), Some("Diário"));
    let layer = ws
        .set_folder_settings(&week_on("Diário/Semanas"), read.revision.as_deref())
        .unwrap();
    let p = layer.settings.periodic.unwrap();
    assert_eq!(p.week.unwrap().folder.as_deref(), Some("Diário/Semanas"));
    assert_eq!(p.week_start.as_deref(), Some("monday"));
    assert_eq!(layer.settings.bookmarks, Some(vec!["Nota.md".to_owned()]));
    assert_eq!(
        fs::read_to_string(dir.path().join(FILE)).unwrap(),
        "{\n  \"bookmarks\": [\n    \"Nota.md\"\n  ],\n  \"periodic\": {\n    \"day\": {\n      \"folder\": \"Diário\",\n      \"x\": 1\n    },\n    \"language\": \"pt-BR\",\n    \"week\": {\n      \"folder\": \"Diário/Semanas\",\n      \"on\": true\n    },\n    \"weekStart\": \"monday\"\n  }\n}\n"
    );
}

#[test]
fn a_folder_out_of_the_folder_refuses_the_change_and_writes_nothing() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = Workspace::open(dir.path(), Some(config.path())).unwrap();
    for bad in ["../fora", "/tmp", "a/../../b"] {
        assert!(
            matches!(
                ws.set_folder_settings(&week_on(bad), None),
                Err(CoreError::Confined(_))
            ),
            "{bad}"
        );
    }
    assert!(!ws.folder_settings().exists);
}

#[test]
fn obsidians_two_files_are_offered_and_nothing_under_obsidian_is_written() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = Workspace::open(dir.path(), Some(config.path())).unwrap();
    assert_eq!(
        ws.obsidian_periodic(),
        verso_core::ObsidianPeriodic::default()
    );
    let obsidian = dir.path().join(".obsidian");
    mkdirs(dir.path(), ".obsidian/plugins/periodic-notes");
    fs::write(
        obsidian.join("daily-notes.json"),
        r#"{"folder":"Daily","format":"YYYY-MM-DD"}"#,
    )
    .unwrap();
    fs::write(
        obsidian.join("plugins/periodic-notes/data.json"),
        r#"{"weekly":{"enabled":true,"format":"gggg-[W]ww","folder":"Weekly"}}"#,
    )
    .unwrap();
    fs::write(obsidian.join("app.json"), r#"{"secret":1}"#).unwrap();
    let offered = ws.obsidian_periodic();
    assert_eq!(
        offered.daily_notes.as_deref(),
        Some(r#"{"folder":"Daily","format":"YYYY-MM-DD"}"#)
    );
    assert!(offered.periodic_notes.unwrap().contains("gggg-[W]ww"));
    // The index and the listing never see `.obsidian/`.
    ws.index().unwrap();
    assert!(
        ws.entries()
            .iter()
            .all(|e| !e.path.starts_with(".obsidian"))
    );
    // A note's commands cannot reach it either.
    assert!(ws.read_note(".obsidian/app.json").is_err());
    assert!(ws.read_note(".obsidian/daily-notes.json").is_err());
    let mut names: Vec<_> = fs::read_dir(&obsidian)
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    assert_eq!(names, ["app.json", "daily-notes.json", "plugins"]);
}
