// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "Import files…" (A11Y.10): what the host hands the window from the
//! files the person chose. The dialog itself cannot be driven in a test;
//! `read_picks` is what runs after it. What crosses is a name and bytes,
//! never the path the file came from (ADR 0026 rule 4). On this
//! computer's own folder the file is not even read: a token stands for it
//! and `create_picked` copies it on the host's side.

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
        .decode(got.files[0].base64.as_deref().unwrap())
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
    assert!(!crate::remote::forwards("create_picked"));
}

#[test]
fn a_file_of_this_computers_folder_is_held_under_a_token_and_read_by_nothing() {
    let outside = tempfile::tempdir().unwrap();
    let a = picked(&outside, "Livro.pdf", &vec![7u8; 3 * 1024 * 1024]);
    let got = hold_picks("main", &[a], 1);
    assert!(got.files.is_empty(), "past 1 MiB: {:?}", got.files);
    assert_eq!(got.skipped[0].reason, PickSkip::TooLarge);
    let a = picked(&outside, "Livro.pdf", &vec![7u8; 3 * 1024 * 1024]);
    let got = hold_picks("main", &[a], 4);
    assert!(got.skipped.is_empty(), "{:?}", got.skipped);
    let f = &got.files[0];
    assert!(f.base64.is_none() && f.token.is_some());
    // Neither the path nor a byte is in what the window gets.
    let said = serde_json::to_string(&got).unwrap();
    assert!(!said.contains(outside.path().to_str().unwrap()), "{said}");
    assert!(said.len() < 200, "{said}");
}

#[test]
fn the_whole_choice_may_be_eight_times_the_limit_and_a_new_choice_drops_the_old_tokens() {
    let outside = tempfile::tempdir().unwrap();
    let files: Vec<PathBuf> = (0..10)
        .map(|i| picked(&outside, &format!("f{i}.bin"), &vec![1u8; 1024 * 1024]))
        .collect();
    let got = hold_picks("w-total", &files, 1);
    assert_eq!(got.files.len(), 8);
    assert_eq!(got.skipped.len(), 2);
    let first = got.files[0].token.clone().unwrap();
    let again = hold_picks("w-total", &files[..1], 1);
    let held = HELD.lock().unwrap();
    assert!(!held.contains_key(&first), "the old token was dropped");
    assert!(held.contains_key(again.files[0].token.as_ref().unwrap()));
}

/// The limit asked is kept between 1 MiB and 1 GiB, whatever the window sends.
#[test]
fn a_limit_of_zero_is_one_megabyte() {
    let outside = tempfile::tempdir().unwrap();
    let a = picked(&outside, "um.bin", &vec![1u8; 2 * 1024 * 1024]);
    assert_eq!(
        hold_picks("w-zero", &[a], 0).skipped[0].reason,
        PickSkip::TooLarge
    );
}

#[test]
fn a_closed_windows_tokens_go_with_it_and_another_windows_stay() {
    let outside = tempfile::tempdir().unwrap();
    let a = picked(&outside, "a.bin", &[1u8; 1024]);
    let b = picked(&outside, "b.bin", &[2u8; 1024]);
    let closed = hold_picks("w-closed", &[a], 1).files[0]
        .token
        .clone()
        .unwrap();
    let open = hold_picks("w-open", &[b], 1).files[0]
        .token
        .clone()
        .unwrap();
    crate::files::drop_picks("w-closed");
    let held = HELD.lock().unwrap();
    assert!(!held.contains_key(&closed));
    assert!(held.contains_key(&open));
}
