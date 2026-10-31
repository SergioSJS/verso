// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's data files, `.verso/layouts/<id>.json` and
//! `.verso/bundles/<id>.json` (ADR 0099 item 2, ADR 0098 item 2):
//! - an id out of the rule is refused before any IO, nothing is made
//! - the directory comes with the first write, never with a read or a list
//! - a create never replaces; a write goes over the version read only
//! - a removal goes through the bin, over the version read only
//! - a placeholder is reported, a file past the bound is refused unread
//! - sync lists the files beside the settings file

use std::fs;
use std::path::Path;

use tempfile::{Builder, tempdir};
use verso_core::{
    CoreError, FOLDER_BUNDLE_MOST, FOLDER_LAYOUT_MOST, FolderDataKind, FolderSettings, Oracle,
    OracleSparks, Workspace, WriteError,
};

const KIND: FolderDataKind = FolderDataKind::Layouts;

#[cfg(test)]
mod support {
    use super::*;

    pub fn open(dir: &Path, config: &Path) -> Workspace {
        Workspace::open(dir, Some(config)).expect("open workspace")
    }

    /// Whether `dir` holds an entry named `name` (`Path::exists` is denied
    /// outside verso-fs).
    pub fn has(dir: &Path, name: &str) -> bool {
        fs::read_dir(dir)
            .unwrap()
            .any(|e| e.unwrap().file_name() == name)
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

    /// `.verso/<kind>/` made by hand, as a sync client would.
    pub fn data_dir(root: &Path, kind: &str) {
        if !has(root, ".verso") {
            folder(root, ".verso");
        }
        folder(&root.join(".verso"), kind);
    }
}
use support::*;

#[test]
fn an_id_out_of_the_rule_is_refused_before_any_io() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    let long = "a".repeat(65);
    for bad in [
        "",
        "..",
        "../x",
        "a/b",
        "a\\b",
        "A",
        "mesa.json",
        ".hidden",
        "-a",
        "a b",
        "é",
        "con",
        "nul",
        "com1",
        "lpt3",
        "aux",
        "prn",
        &long,
    ] {
        for result in [
            ws.read_folder_data(KIND, bad).map(|_| ()),
            ws.write_folder_data(KIND, bad, "{}", None).map(|_| ()),
            ws.remove_folder_data(KIND, bad, "1:1:0000000000000001")
                .map(|_| ()),
        ] {
            assert!(
                matches!(result, Err(CoreError::FolderData(_))),
                "{bad:?}: {result:?}"
            );
        }
    }
    // Nothing was made by the refusals.
    assert!(!has(dir.path(), ".verso"));
}

#[test]
fn reading_and_listing_make_no_directory_and_the_first_write_makes_it() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    assert!(ws.list_folder_data(KIND).unwrap().entries.is_empty());
    assert!(ws.read_folder_data(KIND, "mesa").is_err());
    assert!(!has(dir.path(), ".verso"));
    ws.write_folder_data(KIND, "mesa", "{\"a\": 1}", None)
        .unwrap();
    assert!(has(&dir.path().join(".verso"), "layouts"));
    // The other kind's directory is not made by it.
    assert!(!has(&dir.path().join(".verso"), "bundles"));
}

#[test]
fn a_file_is_created_once_and_replaced_over_the_version_read() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    let text = "{\n  \"cards\": [1, 2]\n}";
    let first = ws.write_folder_data(KIND, "mesa", text, None).unwrap();
    // As given, byte for byte (invariant 7: no normalization).
    let path = dir.path().join(".verso/layouts/mesa.json");
    assert_eq!(fs::read_to_string(&path).unwrap(), text);
    let read = ws.read_folder_data(KIND, "mesa").unwrap();
    assert_eq!(
        (read.text.as_str(), read.revision.as_str()),
        (text, first.as_str())
    );
    // A second create never replaces what stands there.
    let again = ws.write_folder_data(KIND, "mesa", "{}", None);
    assert!(matches!(again, Err(CoreError::Write(WriteError::Exists))));
    assert_eq!(fs::read_to_string(&path).unwrap(), text);
    // Over the version read: replaced, a new revision.
    let second = ws
        .write_folder_data(KIND, "mesa", "{\"cards\": []}", Some(&first))
        .unwrap();
    assert_ne!(first, second);
    // Over a version that is no longer there: nothing written.
    let stale = ws.write_folder_data(KIND, "mesa", "{}", Some(&first));
    assert!(matches!(
        stale,
        Err(CoreError::Write(WriteError::Changed { .. }))
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), "{\"cards\": []}");
    // No temporary file is left beside it.
    let names: Vec<_> = fs::read_dir(dir.path().join(".verso/layouts"))
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(names, ["mesa.json"]);
}

#[test]
fn a_file_changed_outside_makes_the_next_write_stale() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    let rev = ws
        .write_folder_data(KIND, "mesa", "{\"a\": 1}", None)
        .unwrap();
    fs::write(dir.path().join(".verso/layouts/mesa.json"), "{\"b\": 2}").unwrap();
    let stale = ws.write_folder_data(KIND, "mesa", "{}", Some(&rev));
    assert!(matches!(
        stale,
        Err(CoreError::Write(WriteError::Changed { .. }))
    ));
    let stale = ws.remove_folder_data(KIND, "mesa", &rev);
    assert!(matches!(
        stale,
        Err(CoreError::Write(WriteError::Changed { .. }))
    ));
    assert!(has(&dir.path().join(".verso/layouts"), "mesa.json"));
}

#[test]
fn a_text_that_is_not_a_json_object_or_is_too_large_is_refused() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    let big = format!("{{\"a\": \"{}\"}}", "x".repeat(FOLDER_LAYOUT_MOST));
    for bad in ["", "[1]", "3", "\"x\"", "null", "{", "not json", &big] {
        let refused = ws.write_folder_data(KIND, "mesa", bad, None);
        assert!(
            matches!(refused, Err(CoreError::FolderData(_))),
            "{:?}",
            bad.len()
        );
    }
    // Exactly at the bound passes.
    let pad = FOLDER_LAYOUT_MOST - "{\"a\":\"\"}".len();
    let at = format!("{{\"a\":\"{}\"}}", "x".repeat(pad));
    assert_eq!(at.len(), FOLDER_LAYOUT_MOST);
    ws.write_folder_data(KIND, "mesa", &at, None).unwrap();
    // Nothing was made by the refusals.
    assert_eq!(ws.list_folder_data(KIND).unwrap().entries.len(), 1);
}

#[test]
fn a_bundle_may_be_larger_than_a_layout_to_four_mib() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    let one = |n: usize| format!("{{\"a\":\"{}\"}}", "x".repeat(n - "{\"a\":\"\"}".len()));
    // 1 MiB: a bundle, not a layout.
    let mib = one(1024 * 1024);
    assert!(matches!(
        ws.write_folder_data(KIND, "mesa", &mib, None),
        Err(CoreError::FolderData(_))
    ));
    let rev = ws
        .write_folder_data(FolderDataKind::Bundles, "mundo", &mib, None)
        .unwrap();
    // Read back whole, listed with its revision.
    let read = ws
        .read_folder_data(FolderDataKind::Bundles, "mundo")
        .unwrap();
    assert_eq!(
        (read.text.len(), read.revision.as_str()),
        (mib.len(), rev.as_str())
    );
    let listed = ws
        .list_folder_data(FolderDataKind::Bundles)
        .unwrap()
        .entries;
    assert_eq!(listed[0].revision, rev);
    // Exactly 4 MiB passes, one byte more does not.
    let at = one(FOLDER_BUNDLE_MOST);
    ws.write_folder_data(FolderDataKind::Bundles, "cheio", &at, None)
        .unwrap();
    let past = one(FOLDER_BUNDLE_MOST + 1);
    assert!(matches!(
        ws.write_folder_data(FolderDataKind::Bundles, "alem", &past, None),
        Err(CoreError::FolderData(_))
    ));
}

#[test]
fn a_file_past_the_bound_on_disk_is_refused_unread_and_listed_without_a_revision() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    data_dir(dir.path(), "layouts");
    let big = format!("{{\"a\": \"{}\"}}", "x".repeat(FOLDER_LAYOUT_MOST));
    fs::write(dir.path().join(".verso/layouts/grande.json"), big).unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    assert!(matches!(
        ws.read_folder_data(KIND, "grande"),
        Err(CoreError::FolderData(_))
    ));
    let listed = ws.list_folder_data(KIND).unwrap().entries;
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "grande");
    assert_eq!(listed[0].revision, "");
}

#[test]
fn a_placeholder_is_reported_never_taken_for_absent() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    data_dir(dir.path(), "bundles");
    fs::write(dir.path().join(".verso/bundles/.mundo.json.icloud"), b"").unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    let kind = FolderDataKind::Bundles;
    let listed = ws.list_folder_data(kind).unwrap().entries;
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "mundo");
    assert_eq!(listed[0].revision, "");
    assert!(matches!(
        ws.read_folder_data(kind, "mundo"),
        Err(CoreError::Read(verso_core::ReadError::Unavailable))
    ));
    // Never written over, never created over, never removed.
    assert!(ws.write_folder_data(kind, "mundo", "{}", None).is_err());
    assert!(
        ws.remove_folder_data(kind, "mundo", "1:1:0000000000000001")
            .is_err()
    );
    assert!(has(
        &dir.path().join(".verso/bundles"),
        ".mundo.json.icloud"
    ));
}

#[test]
fn a_removal_goes_through_the_bin_over_the_version_read() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    let rev = ws
        .write_folder_data(KIND, "mesa", "{\"a\": 1}", None)
        .unwrap();
    let gone = ws.remove_folder_data(KIND, "mesa", &rev).unwrap();
    assert_eq!(gone.original, ".verso/layouts/mesa.json");
    assert!(!has(&dir.path().join(".verso/layouts"), "mesa.json"));
    // Kept in the bin, not unlinked.
    let kept = dir.path().join(&gone.path);
    assert_eq!(fs::read_to_string(kept).unwrap(), "{\"a\": 1}");
    assert!(ws.list_folder_data(KIND).unwrap().entries.is_empty());
    // A second removal finds nothing.
    assert!(ws.remove_folder_data(KIND, "mesa", &rev).is_err());
}

#[test]
fn the_kinds_are_apart_and_the_list_is_in_id_order() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    for id in ["zeta", "alfa", "meio-2"] {
        ws.write_folder_data(KIND, id, "{}", None).unwrap();
    }
    ws.write_folder_data(FolderDataKind::Bundles, "mundo", "{}", None)
        .unwrap();
    // A file the rule does not name stays out of the entries, untouched, and
    // is named among the strays.
    fs::write(dir.path().join(".verso/layouts/Maiuscula.json"), "{}").unwrap();
    fs::write(dir.path().join(".verso/layouts/nota.txt"), "x").unwrap();
    let ids: Vec<String> = ws
        .list_folder_data(KIND)
        .unwrap()
        .entries
        .into_iter()
        .map(|e| e.id)
        .collect();
    assert_eq!(ids, ["alfa", "meio-2", "zeta"]);
    assert_eq!(
        ws.list_folder_data(KIND).unwrap().strays,
        ["Maiuscula.json", "nota.txt"]
    );
    let bundles = ws
        .list_folder_data(FolderDataKind::Bundles)
        .unwrap()
        .entries;
    assert_eq!(bundles.len(), 1);
    assert!(ws.read_folder_data(KIND, "mundo").is_err());
    // The listed revision is the one a read gives.
    let listed = ws.list_folder_data(KIND).unwrap().entries;
    assert_eq!(
        listed[0].revision,
        ws.read_folder_data(KIND, "alfa").unwrap().revision
    );
}

#[test]
fn sync_lists_the_data_files_beside_the_settings_and_the_notes_never_see_them() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    fs::write(dir.path().join("Nota.md"), "# Nota\n").unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    ws.write_folder_data(KIND, "mesa", "{}", None).unwrap();
    ws.write_folder_data(FolderDataKind::Bundles, "mundo", "{}", None)
        .unwrap();
    ws.set_folder_settings(
        &FolderSettings {
            bookmarks: Some(vec!["Nota.md".to_owned()]),
            ..FolderSettings::default()
        },
        None,
    )
    .unwrap();
    let mut paths: Vec<String> = ws
        .settings_entries()
        .iter()
        .map(|e| e.path.clone())
        .collect();
    paths.sort();
    assert_eq!(
        paths,
        [
            ".verso/bundles/mundo.json",
            ".verso/layouts/mesa.json",
            ".verso/settings.json"
        ]
    );
    // Never a note, never in the walk's listing.
    assert!(ws.entries().iter().all(|e| !e.path.starts_with(".verso")));
    assert_eq!(ws.notes().unwrap(), ["Nota.md"]);
    // A file another device wrote there arrives as sync writes any file.
    let rev = ws
        .write_bytes(".verso/layouts/de-fora.json", b"{\"x\": 1}", None)
        .unwrap();
    assert!(!rev.is_empty());
    assert_eq!(ws.list_folder_data(KIND).unwrap().entries.len(), 2);
    // And another device's deletion of it leaves nothing behind.
    assert!(
        ws.list_folder_data(KIND)
            .unwrap()
            .entries
            .iter()
            .any(|e| e.id == "de-fora")
    );
}

#[test]
fn the_oracle_keys_are_checked_kept_and_reported() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    let odds = vec![vec![10, 30, 20, 20, 15, 5]; 5];
    let list = |w: &str| vec![w.to_owned()];
    let sparks = OracleSparks {
        action: list("abandonar"),
        theme: list("honra"),
        descriptor: list("ardente"),
        focus: list("aliado"),
    };
    let change = |oracle: Oracle| FolderSettings {
        oracle: Some(oracle),
        ..FolderSettings::default()
    };
    // Refused: nothing written, nothing created.
    let mut bad = odds.clone();
    bad[2][0] = 11;
    for refused in [
        Oracle {
            odds: Some(bad),
            ..Oracle::default()
        },
        Oracle {
            odds: Some(vec![vec![100, 0, 0, 0, 0, 0]; 4]),
            ..Oracle::default()
        },
        Oracle {
            sparks: Some(OracleSparks {
                focus: Vec::new(),
                ..sparks.clone()
            }),
            ..Oracle::default()
        },
        Oracle {
            sparks: Some(OracleSparks {
                theme: vec!["a".repeat(61)],
                ..sparks.clone()
            }),
            ..Oracle::default()
        },
        Oracle {
            sparks: Some(OracleSparks {
                theme: vec!["a".to_owned(); 201],
                ..sparks.clone()
            }),
            ..Oracle::default()
        },
        Oracle {
            odds: Some(odds.clone()),
            clear_odds: true,
            ..Oracle::default()
        },
    ] {
        let r = ws.set_folder_settings(&change(refused), None);
        assert!(matches!(r, Err(CoreError::FolderSettings(_))), "{r:?}");
    }
    assert!(!has(dir.path(), ".verso"));
    // Accepted: kept, read back.
    let layer = ws
        .set_folder_settings(
            &change(Oracle {
                odds: Some(odds.clone()),
                sparks: Some(sparks.clone()),
                ..Oracle::default()
            }),
            None,
        )
        .unwrap();
    let oracle = layer.settings.oracle.clone().unwrap();
    assert_eq!(oracle.odds, Some(odds));
    assert_eq!(oracle.sparks, Some(sparks));
    // Clearing: one key at a time, the other and the rest kept; a stale
    // revision refuses and writes nothing.
    let path = dir.path().join(".verso/settings.json");
    let mut with_other = fs::read_to_string(&path).unwrap();
    with_other = with_other.replacen('{', "{\"zeta\": true,", 1);
    fs::write(&path, with_other).unwrap();
    let stale = layer.revision.clone().unwrap();
    let rev = ws.folder_settings().revision.unwrap();
    let r = ws.set_folder_settings(
        &change(Oracle {
            clear_odds: true,
            ..Oracle::default()
        }),
        Some(&stale),
    );
    assert!(r.is_err(), "{r:?}");
    assert!(fs::read_to_string(&path).unwrap().contains("\"odds\""));
    let layer = ws
        .set_folder_settings(
            &change(Oracle {
                clear_odds: true,
                ..Oracle::default()
            }),
            Some(&rev),
        )
        .unwrap();
    let left = layer.settings.oracle.unwrap();
    assert_eq!((left.odds, left.sparks.is_some()), (None, true));
    let rev = layer.revision.unwrap();
    let layer = ws
        .set_folder_settings(
            &change(Oracle {
                clear_sparks: true,
                ..Oracle::default()
            }),
            Some(&rev),
        )
        .unwrap();
    assert!(layer.settings.oracle.is_none());
    let text = fs::read_to_string(&path).unwrap();
    assert!(!text.contains("oracle") && text.contains("zeta"), "{text}");
    // A value edited by hand that does not pass is not applied, and the
    // read says so.
    fs::write(
        dir.path().join(".verso/settings.json"),
        "{\"oracle\": {\"odds\": [[1, 2]], \"keep\": true}}\n",
    )
    .unwrap();
    let read = ws.folder_settings();
    assert_eq!(read.settings.oracle.unwrap().odds, None);
    assert_eq!(read.warnings.len(), 1, "{:?}", read.warnings);
    assert!(read.warnings[0].contains("odds"));
}

#[test]
fn a_conflict_copy_is_named_among_the_strays_never_dropped() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    ws.write_folder_data(KIND, "mesa", "{}", None).unwrap();
    // What sync leaves beside a file two devices changed (`conflict_name`).
    let copy = "mesa (conflict, Mac, 2026-10-20).json";
    fs::write(dir.path().join(".verso/layouts").join(copy), "{\"b\": 2}").unwrap();
    let listed = ws.list_folder_data(KIND).unwrap();
    assert_eq!(
        listed
            .entries
            .iter()
            .map(|e| e.id.as_str())
            .collect::<Vec<_>>(),
        ["mesa"]
    );
    assert_eq!(listed.strays, [copy]);
    // The other kind has none, and a stray is left as it is.
    assert!(
        ws.list_folder_data(FolderDataKind::Bundles)
            .unwrap()
            .strays
            .is_empty()
    );
    assert!(has(&dir.path().join(".verso/layouts"), copy));
}

#[test]
fn the_generic_commands_refuse_the_data_directories() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    ws.create_note("Nota", "x").unwrap();
    ws.create_file("anexo.bin", b"x").unwrap();
    let rev = ws.read_text("anexo.bin").unwrap().revision;
    fn refused<T>(r: Result<T, CoreError>) -> bool {
        matches!(r, Err(CoreError::FolderData(_)))
    }
    for target in [
        ".verso/layouts/x.json",
        ".verso/bundles/x.json",
        ".verso/layouts/Maiuscula.json",
        ".verso/bundles/Nota.canvas",
        ".verso/layouts",
        ".verso/bundles/sub",
    ] {
        assert!(
            refused(ws.create_file(target, b"{}")),
            "create_file {target}"
        );
        assert!(refused(ws.create_folder(target)), "create_folder {target}");
        assert!(
            refused(ws.write_text(target, "{}", &rev)),
            "write_text {target}"
        );
        assert!(
            refused(ws.rename_entry("anexo.bin", target)),
            "rename {target}"
        );
    }
    assert!(refused(
        ws.move_entries(&["anexo.bin".to_owned()], ".verso/layouts")
    ));
    // Nothing was made, and the data API is the way in.
    assert!(!has(dir.path(), ".verso"));
    ws.write_folder_data(KIND, "mesa", "{}", None).unwrap();
    // The settings file is not a data directory: the rule is the narrower.
    assert!(!refused(ws.create_file(".verso/settings.json", b"{}")));
}

#[test]
fn a_file_past_the_bound_is_removed_unread_on_the_empty_revision_the_list_gave() {
    let dir = tempdir().unwrap();
    let config = tempdir().unwrap();
    data_dir(dir.path(), "layouts");
    let big = format!("{{\"a\": \"{}\"}}", "x".repeat(FOLDER_LAYOUT_MOST));
    fs::write(dir.path().join(".verso/layouts/grande.json"), &big).unwrap();
    let mut ws = open(dir.path(), config.path());
    ws.index().unwrap();
    let listed = ws.list_folder_data(KIND).unwrap().entries;
    assert_eq!(listed[0].revision, "");
    // A revision the file never had is not "the version listed".
    assert!(matches!(
        ws.remove_folder_data(KIND, "grande", "1-2-3"),
        Err(CoreError::FolderData(_))
    ));
    assert!(has(&dir.path().join(".verso/layouts"), "grande.json"));
    let gone = ws.remove_folder_data(KIND, "grande", "").unwrap();
    assert!(!has(&dir.path().join(".verso/layouts"), "grande.json"));
    assert_eq!(fs::read_to_string(dir.path().join(gone.path)).unwrap(), big);
    // A file within the bound still needs its real revision.
    let rev = ws.write_folder_data(KIND, "mesa", "{}", None).unwrap();
    assert!(ws.remove_folder_data(KIND, "mesa", "").is_err());
    ws.remove_folder_data(KIND, "mesa", &rev).unwrap();
}
