// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "Import files…" (A11Y.10): what the host hands the window from the
//! files the person chose. The dialog itself cannot be driven in a test;
//! `read_picks` is what runs after it. What crosses is a name and bytes,
//! never the path the file came from (ADR 0026 rule 4).

use super::*;
use base64::Engine;
use std::io::Write;
use verso_contract::PickSkip;

fn picked(dir: &tempfile::TempDir, name: &str, bytes: &[u8]) -> PathBuf {
    let mut f = tempfile::Builder::new()
        .prefix("pick")
        .tempfile_in(dir.path())
        .unwrap();
    f.write_all(bytes).unwrap();
    // Named as the person's file is, in a folder of its own.
    let sub = tempfile::tempdir_in(dir.path()).unwrap();
    let path = sub.keep().join(name);
    f.persist(&path).unwrap();
    path
}

#[test]
fn a_chosen_file_crosses_as_its_name_and_bytes_and_never_its_path() {
    let outside = tempfile::tempdir().unwrap();
    let a = picked(&outside, "Mapa.png", b"\x89PNG-bytes");
    let b = picked(&outside, "Nota solta.txt", b"oi");
    let got = read_picks(&[a.clone(), b]);
    assert!(got.skipped.is_empty(), "{:?}", got.skipped);
    assert_eq!(
        got.files
            .iter()
            .map(|f| f.name.as_str())
            .collect::<Vec<_>>(),
        ["Mapa.png", "Nota solta.txt"]
    );
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&got.files[0].base64)
        .unwrap();
    assert_eq!(bytes, b"\x89PNG-bytes");
    // Nothing of where it came from is in what the window gets.
    let said = serde_json::to_string(&got).unwrap();
    assert!(!said.contains(outside.path().to_str().unwrap()), "{said}");
}

#[test]
fn a_directory_a_missing_file_and_a_too_large_file_are_named_and_the_rest_still_come() {
    let outside = tempfile::tempdir().unwrap();
    let good = picked(&outside, "Boa.md", b"# Boa\n");
    let big = picked(
        &outside,
        "Enorme.bin",
        &vec![0u8; PICK_FILE_MAX as usize + 1],
    );
    let got = read_picks(&[
        outside.path().to_path_buf(),
        outside.path().join("sumiu.txt"),
        big,
        good,
    ]);
    assert_eq!(got.files.len(), 1);
    assert_eq!(got.files[0].name, "Boa.md");
    let reasons: Vec<_> = got.skipped.iter().map(|s| s.reason).collect();
    assert_eq!(
        reasons,
        [PickSkip::NotAFile, PickSkip::Unreadable, PickSkip::TooLarge]
    );
}

#[test]
fn an_icloud_placeholder_is_left_out_not_downloaded() {
    let outside = tempfile::tempdir().unwrap();
    let stub = picked(&outside, ".Foto.png.icloud", b"stub");
    let got = read_picks(&[stub]);
    assert!(got.files.is_empty());
    assert_eq!(got.skipped[0].reason, PickSkip::Placeholder);
}

/// The window may call it; the capability and the manifest list it
/// (`every_command_is_granted`-style guard, tests.rs), and a window on a
/// server's folder is not forwarded it: the picker is this computer's.
#[test]
fn the_picker_is_the_apps_own_even_in_a_window_on_a_servers_folder() {
    assert!(!crate::remote::forwards("pick_files"));
}
