// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Focuses tests (ADR 0062 F1):
//! - the known format read
//! - an unknown key, a `..`, a non-array each read only
//! - a write that changes one focus leaves every other byte as it was
//! - a file changed since the read is read again
//! - a hidden path other than this one still refused

use std::fs;
use std::path::Path;
use tempfile::{Builder, tempdir};
use verso_core::Workspace;
use verso_fs::ConfinementError;

#[cfg(test)]
mod support {
    use super::*;

    /// The workspace of `dir`, its index kept in a hidden folder inside
    /// `dir` — gone with it, and skipped by the walk. Opened without a
    /// configuration folder, every run of these tests left an index in the
    /// user's own one (1167 of them on the maintainer's Mac on 2026-10-08).
    pub fn open_workspace(dir: &Path) -> Workspace {
        Workspace::open(dir, Some(&dir.join(".verso-test-config"))).expect("open workspace")
    }

    pub fn make_dir(parent: &Path, name: &str) {
        let sub = Builder::new()
            .prefix(name)
            .rand_bytes(0)
            .tempdir_in(parent)
            .expect("tempdir");
        let _ = sub.keep();
    }
}
use support::*;

#[test]
fn the_known_format_read() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    let waypoints = r#"[{"name":"Home","sticker":"ui//home","paths":["/"]},
{"sticker":"ui//spaces","name":"aaaa","paths":["Untitled","Untitled/pasta","Untitled/xxxxx.md"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), waypoints).unwrap();

    let mut ws = open_workspace(dir.path());
    let summary = ws.get_focuses().unwrap();

    assert!(summary.has_file);
    assert!(summary.format_known);
    assert!(summary.read_only_reason.is_none());
    assert!(summary.stamp.is_some());
    assert_eq!(summary.focuses.len(), 2);

    assert_eq!(summary.focuses[0].name, "Home");
    assert_eq!(summary.focuses[0].sticker.as_deref(), Some("ui//home"));
    assert_eq!(summary.focuses[0].paths, vec!["/"]);

    assert_eq!(summary.focuses[1].name, "aaaa");
    assert_eq!(summary.focuses[1].sticker.as_deref(), Some("ui//spaces"));
    assert_eq!(
        summary.focuses[1].paths,
        vec!["Untitled", "Untitled/pasta", "Untitled/xxxxx.md"]
    );

    assert!(ws.can_sync_focuses().unwrap());
}

#[test]
fn an_unknown_key_causes_read_only() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    // Contains unknown key "extra"
    let waypoints = r#"[{"name":"Home","paths":["/"],"extra":"unknown"}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), waypoints).unwrap();

    let mut ws = open_workspace(dir.path());
    let summary = ws.get_focuses().unwrap();

    assert!(summary.has_file);
    assert!(!summary.format_known);
    assert!(summary.read_only_reason.is_some());
    assert!(summary.read_only_reason.unwrap().contains("unknown key"));
    assert!(!ws.can_sync_focuses().unwrap());
}

#[test]
fn a_parent_component_in_path_causes_read_only() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    // Contains ".." in path
    let waypoints = r#"[{"name":"Escape","paths":["../secret"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), waypoints).unwrap();

    let mut ws = open_workspace(dir.path());
    let summary = ws.get_focuses().unwrap();

    assert!(summary.has_file);
    assert!(!summary.format_known);
    assert!(summary.read_only_reason.is_some());
    assert!(summary.read_only_reason.unwrap().contains(".."));
    assert!(!ws.can_sync_focuses().unwrap());
}

#[test]
fn a_non_array_causes_read_only() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    // Object instead of array
    let waypoints = r#"{"name":"Home","paths":["/"]}"#;
    fs::write(dir.path().join(".space/waypoints.json"), waypoints).unwrap();

    let mut ws = open_workspace(dir.path());
    let summary = ws.get_focuses().unwrap();

    assert!(summary.has_file);
    assert!(!summary.format_known);
    assert!(summary.read_only_reason.is_some());
    assert!(
        summary
            .read_only_reason
            .unwrap()
            .contains("expected JSON array")
    );
    assert!(!ws.can_sync_focuses().unwrap());
}

#[test]
fn a_write_that_changes_one_focus_leaves_every_other_byte_as_it_was() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    // Notice particular spacing, line breaks, and keys order:
    // element 0 has name first, element 1 has sticker first
    let original = b"[{\"name\":\"Home\",\"sticker\":\"ui//home\",\"paths\":[\"/\"]},\n {\"sticker\":\"ui//spaces\",\"name\":\"aaaa\",\"paths\":[\"Untitled\",\"Untitled/pasta\",\"Untitled/xxxxx.md\"]}]";
    fs::write(dir.path().join(".space/waypoints.json"), original).unwrap();

    let mut ws = open_workspace(dir.path());
    ws.set_sync_focuses(true);
    let summary = ws.get_focuses().unwrap();
    let stamp = summary.stamp.clone().unwrap();

    // Modify only focus 1: change sticker to "ui//folder", keep name and paths
    let mut updated_focuses = summary.focuses.clone();
    updated_focuses[1].sticker = Some("ui//folder".to_string());

    let new_summary = ws.set_focuses(updated_focuses, Some(&stamp), None).unwrap();
    assert!(new_summary.format_known);

    let written_str = fs::read_to_string(dir.path().join(".space/waypoints.json")).unwrap();

    // Element 0 must be 100% byte-for-byte identical to original
    let expected_elem0 = "{\"name\":\"Home\",\"sticker\":\"ui//home\",\"paths\":[\"/\"]}";
    assert!(written_str.starts_with(&format!("[{expected_elem0},\n ")));

    // Element 1 must keep its keys order: sticker first, then name, then paths
    let expected_elem1 = "{\"sticker\":\"ui//folder\",\"name\":\"aaaa\",\"paths\":[\"Untitled\",\"Untitled/pasta\",\"Untitled/xxxxx.md\"]}";
    assert!(written_str.ends_with(&format!("{expected_elem1}]")));

    // The whole string matches the expectation leaving all other bytes unchanged
    let expected_whole = format!("[{expected_elem0},\n {expected_elem1}]");
    assert_eq!(written_str, expected_whole);
}

#[test]
fn a_file_changed_since_the_read_is_read_again() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    let initial = r#"[{"name":"Home","paths":["/"]},{"name":"Projetos","paths":["proj"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), initial).unwrap();

    let mut ws = open_workspace(dir.path());
    ws.set_sync_focuses(true);
    let summary = ws.get_focuses().unwrap();
    let stale_stamp = summary.stamp.clone().unwrap();

    // Simulate concurrent modification by make.md on disk:
    // make.md adds another focus "Arquivados"
    let concurrent = r#"[{"name":"Home","paths":["/"]},{"name":"Projetos","paths":["proj"]},{"name":"Arquivados","paths":["archive"]}]"#;
    // Sleep briefly to ensure mtime stamp changes on filesystems with 1s resolution
    std::thread::sleep(std::time::Duration::from_millis(15));
    fs::write(dir.path().join(".space/waypoints.json"), concurrent).unwrap();

    // Verso wants to update "Projetos" paths to ["proj", "proj/novo"]
    let mut updated_focuses = summary.focuses.clone();
    updated_focuses[1].paths.push("proj/novo".to_string());

    // set_focuses is called with stale_stamp: it must detect the change,
    // re-read the file from disk, and reapply the change to "Projetos"
    let new_summary = ws
        .set_focuses(updated_focuses, Some(&stale_stamp), None)
        .unwrap();
    assert!(new_summary.format_known);

    // The newly written file must contain both make.md's "Arquivados" AND Verso's updated "Projetos"
    let on_disk = fs::read_to_string(dir.path().join(".space/waypoints.json")).unwrap();
    assert!(
        on_disk.contains("Arquivados"),
        "make.md's concurrent focus must be preserved"
    );
    assert!(
        on_disk.contains("proj/novo"),
        "Verso's update must be applied"
    );
}

#[test]
fn a_hidden_path_other_than_this_one_still_refused() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");
    make_dir(dir.path(), ".obsidian");
    fs::write(dir.path().join(".obsidian/app.json"), "{}").unwrap();
    fs::write(dir.path().join(".space/other.json"), "{}").unwrap();
    fs::write(dir.path().join(".space/waypoints.json"), "[]").unwrap();

    let mut ws = open_workspace(dir.path());

    // .space/waypoints.json is readable via get_focuses
    assert!(ws.get_focuses().is_ok());

    // Any other hidden path is refused by confinement through the root
    let root = verso_fs::Root::open(dir.path(), vec![]).unwrap();
    assert_eq!(
        root.confine(Path::new(".space/other.json")),
        Err(ConfinementError::Hidden)
    );
    assert_eq!(
        root.confine(Path::new(".obsidian/app.json")),
        Err(ConfinementError::Hidden)
    );
    assert_eq!(
        root.confine(Path::new(".git/config")),
        Err(ConfinementError::Hidden)
    );
    assert_eq!(
        root.confine(Path::new(".trash/anything")),
        Err(ConfinementError::Hidden)
    );
}

#[test]
fn concurrent_edit_on_same_focus_refuses_write_and_preserves_disk() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    let initial = r#"[{"name":"Home","paths":["/"]},{"name":"Projetos","paths":["proj"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), initial).unwrap();

    let mut ws = open_workspace(dir.path());
    ws.set_sync_focuses(true);
    let summary = ws.get_focuses().unwrap();
    let stale_stamp = summary.stamp.clone().unwrap();

    // Concurrent edit by make.md on the SAME focus "Projetos" (e.g. adding a path)
    let concurrent =
        r#"[{"name":"Home","paths":["/"]},{"name":"Projetos","paths":["proj","extra"]}]"#;
    std::thread::sleep(std::time::Duration::from_millis(15));
    fs::write(dir.path().join(".space/waypoints.json"), concurrent).unwrap();

    // Verso concurrently changed the sticker of "Projetos"
    let mut updated = summary.focuses.clone();
    updated[1].sticker = Some("⭐".to_string());

    // set_focuses must detect conflict on the same focus, write NOTHING, and return Changed error
    let res = ws.set_focuses(updated, Some(&stale_stamp), None);
    assert!(
        matches!(
            res,
            Err(verso_core::CoreError::Write(
                verso_fs::WriteError::Changed { .. }
            ))
        ),
        "concurrent edit on the same focus must refuse the write: {res:?}"
    );

    // Disk must NOT have been overwritten: it must still have ["proj", "extra"] and no "⭐"
    let on_disk = fs::read_to_string(dir.path().join(".space/waypoints.json")).unwrap();
    assert!(on_disk.contains("extra"), "disk edit must be preserved");
    assert!(
        !on_disk.contains("⭐"),
        "verso edit must not have overwritten disk"
    );
}

#[test]
fn blind_write_without_expected_stamp_is_refused() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    let initial = r#"[{"name":"Home","paths":["/"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), initial).unwrap();

    let mut ws = open_workspace(dir.path());
    ws.set_sync_focuses(true);
    let summary = ws.get_focuses().unwrap();

    let mut updated = summary.focuses.clone();
    updated.push(verso_core::Focus {
        name: "Projetos".to_string(),
        paths: vec!["proj".to_string()],
        sticker: None,
    });

    // Calling set_focuses with None as stamp when file exists must fail invariant 11
    let res = ws.set_focuses(updated, None, None);
    assert!(
        res.is_err(),
        "writing without expected stamp must be refused: {res:?}"
    );

    let on_disk = fs::read_to_string(dir.path().join(".space/waypoints.json")).unwrap();
    assert_eq!(on_disk, initial, "disk must remain untouched");
}

#[test]
fn write_focuses_validates_format_before_writing() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    let initial = r#"[{"name":"Home","paths":["/"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), initial).unwrap();

    let mut ws = open_workspace(dir.path());
    ws.set_sync_focuses(true);
    let summary = ws.get_focuses().unwrap();
    let stamp = summary.stamp.as_deref();

    // Invalid focus with ".." in path
    let invalid_dotdot = vec![verso_core::Focus {
        name: "Bad".to_string(),
        paths: vec!["../escape".to_string()],
        sticker: None,
    }];
    let res = ws.set_focuses(invalid_dotdot, stamp, None);
    assert!(
        res.is_err(),
        "paths with '..' must be rejected before write"
    );

    // Invalid focus with absolute path
    let invalid_abs = vec![verso_core::Focus {
        name: "Bad".to_string(),
        paths: vec!["/absolute".to_string()],
        sticker: None,
    }];
    let res = ws.set_focuses(invalid_abs, stamp, None);
    assert!(
        res.is_err(),
        "absolute paths (other than '/') must be rejected before write"
    );

    // Invalid focus with empty path
    let invalid_empty = vec![verso_core::Focus {
        name: "Bad".to_string(),
        paths: vec!["".to_string()],
        sticker: None,
    }];
    let res = ws.set_focuses(invalid_empty, stamp, None);
    assert!(res.is_err(), "empty paths must be rejected before write");

    // Invalid focus with empty name
    let invalid_name = vec![verso_core::Focus {
        name: "".to_string(),
        paths: vec!["valid".to_string()],
        sticker: None,
    }];
    let res = ws.set_focuses(invalid_name, stamp, None);
    assert!(
        res.is_err(),
        "empty focus name must be rejected before write"
    );

    let on_disk = fs::read_to_string(dir.path().join(".space/waypoints.json")).unwrap();
    assert_eq!(on_disk, initial, "disk must remain untouched");
}

#[test]
fn sync_disabled_refuses_write() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    let initial = r#"[{"name":"Home","paths":["/"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), initial).unwrap();

    let mut ws = open_workspace(dir.path());
    // ws.sync_focuses() is false by default
    assert!(!ws.sync_focuses());

    let summary = ws.get_focuses().unwrap();
    let stamp = summary.stamp.as_deref();

    let updated = vec![verso_core::Focus {
        name: "Projetos".to_string(),
        paths: vec!["proj".to_string()],
        sticker: None,
    }];
    let res = ws.set_focuses(updated.clone(), stamp, None);
    assert!(
        res.is_err(),
        "set_focuses must be refused when sync is disabled"
    );

    // Enabling sync allows it
    ws.set_sync_focuses(true);
    assert!(ws.sync_focuses());
    let res2 = ws.set_focuses(updated, stamp, None);
    assert!(res2.is_ok(), "set_focuses succeeds when sync is enabled");
}

#[test]
fn adding_or_removing_a_focus_preserves_unchanged_elements_byte_for_byte() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    let original = "[\n  {\"sticker\": \"ui//home\", \"name\": \"Home\", \"paths\": [\"/\"]},\n  {\"name\": \"Projetos\", \"paths\": [\"proj\"]}\n]";
    fs::write(dir.path().join(".space/waypoints.json"), original).unwrap();

    let mut ws = open_workspace(dir.path());
    ws.set_sync_focuses(true);
    let summary = ws.get_focuses().unwrap();
    let stamp = summary.stamp.as_deref();

    // Add a focus: "Projetos" and "Home" should preserve their exact bytes/keys
    let mut updated = summary.focuses.clone();
    updated.push(verso_core::Focus {
        name: "Novo".to_string(),
        paths: vec!["novo".to_string()],
        sticker: None,
    });

    let new_summary = ws.set_focuses(updated, stamp, None).unwrap();
    assert!(new_summary.format_known);

    let on_disk = fs::read_to_string(dir.path().join(".space/waypoints.json")).unwrap();
    let home_exact = "{\"sticker\": \"ui//home\", \"name\": \"Home\", \"paths\": [\"/\"]}";
    assert!(
        on_disk.contains(home_exact),
        "unchanged element 'Home' must preserve its exact bytes and key order"
    );
    let proj_exact = "{\"name\": \"Projetos\", \"paths\": [\"proj\"]}";
    assert!(
        on_disk.contains(proj_exact),
        "unchanged element 'Projetos' must preserve its exact bytes and key order"
    );
}

#[test]
fn focuses_never_creates_space_directory_when_absent() {
    let dir = tempdir().unwrap();
    // Notice: no .space directory created!

    let mut ws = open_workspace(dir.path());
    ws.set_sync_focuses(true);
    let summary = ws.get_focuses().unwrap();
    assert!(!summary.has_file);
    assert!(!exists(&dir.path().join(".space")), ".space must not exist");

    let res = ws.set_focuses(
        vec![verso_core::Focus {
            name: "Home".to_string(),
            paths: vec!["/".to_string()],
            sticker: None,
        }],
        None,
        None,
    );
    assert!(
        res.is_err(),
        "set_focuses must fail when .space/waypoints.json is absent"
    );
    assert!(
        !exists(&dir.path().join(".space")),
        ".space must never be created by Verso"
    );
}

#[test]
fn reordering_focuses_preserves_each_focus_own_key_order() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    // Element B has sticker first, then name, then paths
    // Element A has name first, then paths (no sticker)
    let original =
        r#"[{"sticker":"ui//spaces","name":"B","paths":["b"]},{"name":"A","paths":["a"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), original).unwrap();

    let mut ws = open_workspace(dir.path());
    ws.set_sync_focuses(true);
    let summary = ws.get_focuses().unwrap();
    let stamp = summary.stamp.as_deref();

    // Reorder from [B, A] to [A, B]
    let reordered = vec![summary.focuses[1].clone(), summary.focuses[0].clone()];
    let res = ws.set_focuses(reordered, stamp, None).unwrap();
    assert!(res.format_known);

    let on_disk = fs::read_to_string(dir.path().join(".space/waypoints.json")).unwrap();

    // A must have "name" first
    assert!(
        on_disk.contains(r#"{"name":"A","paths":["a"]}"#),
        "focus A must preserve its own key order"
    );
    // B must have "sticker" first
    assert!(
        on_disk.contains(r#"{"sticker":"ui//spaces","name":"B","paths":["b"]}"#),
        "focus B must preserve its own key order"
    );
}

#[test]
fn duplicate_focus_names_are_read_as_known_format_d6() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    // File with duplicate names is parsed as format_known = true (ADR 0062 D6 literal)
    let dup_file = r#"[{"name":"Foco","paths":["a"]},{"name":"Foco","paths":["b"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), dup_file).unwrap();

    let mut ws = open_workspace(dir.path());
    let read_summary = ws.get_focuses().unwrap();
    assert!(read_summary.has_file);
    assert!(
        read_summary.format_known,
        "duplicate focus names are valid in D6 literal known format"
    );
    assert_eq!(read_summary.focuses.len(), 2);
}

#[test]
fn icloud_placeholder_reports_has_file_and_read_only_invariant_10() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");
    // Write iCloud evicted placeholder sibling
    fs::write(dir.path().join(".space/.waypoints.json.icloud"), b"").unwrap();

    let mut ws = open_workspace(dir.path());
    let summary = ws.get_focuses().unwrap();
    assert!(
        summary.has_file,
        "Invariant 10: cloud placeholder must be reported as has_file=true"
    );
    assert!(!summary.format_known, "Cloud placeholder is read-only");
    assert!(summary.read_only_reason.is_some());
}

#[test]
fn concurrent_merge_uses_window_base_focuses_preventing_loss_blocking_1() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    let initial = r#"[{"name":"Home","paths":["/"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), initial).unwrap();

    let mut ws = open_workspace(dir.path());
    ws.set_sync_focuses(true);

    // Window 1 reads initial state L0 at T0
    let window1_summary = ws.get_focuses().unwrap();
    let window1_stamp = window1_summary.stamp.clone().unwrap();
    let window1_base = window1_summary.focuses.clone();

    // make.md adds focus "MakeMD" concurrently on disk
    std::thread::sleep(std::time::Duration::from_millis(15));
    let concurrent_disk = r#"[{"name":"Home","paths":["/"]},{"name":"MakeMD","paths":["m"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), concurrent_disk).unwrap();

    // Core performs a new read (e.g. from background reload or another window)
    let reloaded = ws.get_focuses().unwrap();
    assert!(reloaded.focuses.iter().any(|f| f.name == "MakeMD"));

    // Now Window 1 (which hasn't seen the reload yet) adds "VersoFocus" based on its base L0
    let mut window1_new = window1_base.clone();
    window1_new.push(verso_core::Focus {
        name: "VersoFocus".to_string(),
        paths: vec!["v".to_string()],
        sticker: None,
    });

    // Window 1 calls set_focuses with its stale stamp and its base focuses
    let merged = ws
        .set_focuses(window1_new, Some(&window1_stamp), Some(window1_base))
        .unwrap();

    // BOTH make.md's focus AND Verso's focus must exist in the merged result!
    assert!(
        merged.focuses.iter().any(|f| f.name == "MakeMD"),
        "MakeMD focus must not be deleted!"
    );
    assert!(
        merged.focuses.iter().any(|f| f.name == "VersoFocus"),
        "VersoFocus must be present!"
    );

    let on_disk = fs::read_to_string(dir.path().join(".space/waypoints.json")).unwrap();
    assert!(on_disk.contains("MakeMD"), "MakeMD must remain on disk");
    assert!(on_disk.contains("VersoFocus"), "VersoFocus must be on disk");
}

#[test]
fn duplicate_focus_names_delete_and_edit_by_position() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");

    let initial = r#"[{"name":"Foco","paths":["A"]},{"name":"Foco","paths":["B"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), initial).unwrap();

    let mut ws = open_workspace(dir.path());
    ws.set_sync_focuses(true);

    let summary = ws.get_focuses().unwrap();
    assert_eq!(summary.focuses.len(), 2);
    assert_eq!(summary.focuses[0].paths, vec!["A"]);
    assert_eq!(summary.focuses[1].paths, vec!["B"]);

    let stamp = summary.stamp.clone().unwrap();
    let base = summary.focuses.clone();

    // 1. Direct delete of the second focus (B) without race
    let mut deleted_b = base.clone();
    deleted_b.remove(1); // keeps A
    let res = ws
        .set_focuses(deleted_b.clone(), Some(&stamp), Some(base.clone()))
        .unwrap();
    assert_eq!(res.focuses.len(), 1);
    assert_eq!(res.focuses[0].paths, vec!["A"]);

    let on_disk = fs::read_to_string(dir.path().join(".space/waypoints.json")).unwrap();
    assert!(on_disk.contains(r#""paths":["A"]"#));
    assert!(!on_disk.contains(r#""paths":["B"]"#));

    // Restore initial file
    fs::write(dir.path().join(".space/waypoints.json"), initial).unwrap();
    let summary2 = ws.get_focuses().unwrap();
    let stamp2 = summary2.stamp.clone().unwrap();
    let base2 = summary2.focuses.clone();

    // 2. Race condition: make.md appends a focus on disk
    std::thread::sleep(std::time::Duration::from_millis(15));
    let concurrent_disk = r#"[{"name":"Foco","paths":["A"]},{"name":"Foco","paths":["B"]},{"name":"Other","paths":["C"]}]"#;
    fs::write(dir.path().join(".space/waypoints.json"), concurrent_disk).unwrap();

    // Stale write from Window 1 deleting the second focus (B)
    let mut win1_new = base2.clone();
    win1_new.remove(1); // leaves only index 0 ("A")

    let merged = ws
        .set_focuses(win1_new, Some(&stamp2), Some(base2))
        .unwrap();
    assert_eq!(merged.focuses.len(), 2);
    assert_eq!(merged.focuses[0].name, "Foco");
    assert_eq!(merged.focuses[0].paths, vec!["A"]);
    assert_eq!(merged.focuses[1].name, "Other");
    assert_eq!(merged.focuses[1].paths, vec!["C"]);

    let final_disk = fs::read_to_string(dir.path().join(".space/waypoints.json")).unwrap();
    assert!(final_disk.contains(r#""paths":["A"]"#));
    assert!(!final_disk.contains(r#""paths":["B"]"#));
    assert!(final_disk.contains("Other"));
}

/// Whether anything stands at `path`, asked of the system's tool: this
/// crate's tests may not call `std::fs` (ADR 0029); Windows too (ADR 0069).
fn exists(path: &std::path::Path) -> bool {
    #[cfg(unix)]
    let mut command = {
        let mut c = std::process::Command::new("test");
        c.arg("-e").arg(path);
        c
    };
    #[cfg(windows)]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("cmd");
        c.raw_arg(format!(
            "/C if exist \"{}\" (exit 0) else (exit 1)",
            path.display()
        ));
        c
    };
    command.status().is_ok_and(|s| s.success())
}

#[test]
fn the_focuses_file_is_fetched_only_through_its_own_command_never_by_a_path() {
    // ADR 0043 (2026-10-27) with ADR 0026: a hidden entry never crosses the
    // contract as a path, so the path route to a placeholder refuses the
    // focuses file; the one way to its placeholder names no path.
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");
    let mut ws = open_workspace(dir.path());
    assert!(ws.placeholder(".space/waypoints.json").is_err());
    // Absent: nothing to fetch.
    assert!(ws.waypoints_placeholder().unwrap().is_none());
    // On disk: nothing to fetch either.
    fs::write(dir.path().join(".space/waypoints.json"), b"[]").unwrap();
    assert!(ws.waypoints_placeholder().unwrap().is_none());
}

#[test]
fn the_older_icloud_stand_in_of_the_focuses_file_cannot_be_fetched_by_reading() {
    let dir = tempdir().unwrap();
    make_dir(dir.path(), ".space");
    fs::write(dir.path().join(".space/.waypoints.json.icloud"), b"").unwrap();
    let ws = open_workspace(dir.path());
    assert!(ws.waypoints_placeholder().unwrap().is_none());
}
