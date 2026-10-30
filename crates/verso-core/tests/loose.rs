// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! One file opened without a folder (ADR 0114 item 17): read, written,
//! its pictures beside it read, a sibling note reached only by name; no
//! index, no sidecar, nothing written beside the file.

use std::fs;

use verso_core::{CoreError, Loose, LooseReadOnly};

#[cfg(test)]
mod support {
    use super::*;

    pub fn loose() -> (tempfile::TempDir, Loose) {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("Lista.md"),
            "---\ntags: [compras]\n---\n# Lista\n\n- pão ^pao\n\n## Depois\n\n![[foto.png]] e [[Outra]]\n",
        )
        .unwrap();
        fs::write(dir.path().join("Outra.md"), "# Outra\n").unwrap();
        fs::write(dir.path().join("foto.png"), b"\x89PNG").unwrap();
        let loose = Loose::open(&dir.path().join("Lista.md")).unwrap();
        (dir, loose)
    }

    pub fn names(dir: &std::path::Path) -> Vec<String> {
        let mut out: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        out.sort();
        out
    }
}
use support::*;

#[test]
fn the_note_is_read_with_its_headings_blocks_and_properties_and_written_back() {
    let (dir, mut loose) = loose();
    assert_eq!(loose.name(), "Lista.md");
    assert_eq!(
        loose.place(),
        dir.path().file_name().unwrap().to_string_lossy()
    );
    let key = loose.key();
    assert!(
        key.chars().all(|c| c.is_alphanumeric() || c == '-'),
        "{key}"
    );
    assert!(loose.read_only().is_none());
    let note = loose.read("Lista.md").unwrap();
    assert_eq!(note.path, "Lista.md");
    assert_eq!(
        note.headings
            .iter()
            .map(|h| (h.level, h.text.as_str()))
            .collect::<Vec<_>>(),
        [(1, "Lista"), (2, "Depois")]
    );
    assert_eq!(note.blocks.len(), 1);
    assert_eq!(note.blocks[0].id, "pao");
    assert_eq!(note.properties.len(), 1);
    assert!(!note.stale && !note.unverified);
    assert!(note.html.contains("wikilink"));
    let written = loose
        .write("Lista.md", "# Lista\n\n- leite\n", &note.revision)
        .unwrap();
    assert_eq!(written.note.text, "# Lista\n\n- leite\n");
    assert_eq!(
        fs::read_to_string(dir.path().join("Lista.md")).unwrap(),
        "# Lista\n\n- leite\n"
    );
    // The revision follows: a second write with the new one lands.
    loose
        .write("Lista.md", "# Lista\n", &written.note.revision)
        .unwrap();
    // The stale one is refused.
    let err = loose
        .write("Lista.md", "# tarde\n", &note.revision)
        .unwrap_err();
    assert!(
        matches!(err, CoreError::Write(verso_fs::WriteError::Changed { .. })),
        "{err:?}"
    );
    // Nothing beside the file: no index, no sidecar, no `.verso`.
    assert_eq!(names(dir.path()), ["Lista.md", "Outra.md", "foto.png"]);
}

#[test]
fn attachments_and_sibling_notes_are_reached_by_name_only() {
    let (_dir, mut loose) = loose();
    loose.read("Lista.md").unwrap();
    assert_eq!(
        loose.resolve_attachment("foto.png|200"),
        Some("foto.png".to_owned())
    );
    assert_eq!(loose.resolve_attachment("nao-existe.png"), None);
    assert_eq!(loose.resolve_attachment("Outra.md"), None);
    assert_eq!(loose.resolve_attachment("../foto.png"), None);
    assert_eq!(loose.read_attachment("foto.png").unwrap(), b"\x89PNG");
    assert!(loose.read_attachment("Outra.md").is_err());
    assert_eq!(
        loose.sibling_note("Outra#Título"),
        Some("Outra.md".to_owned())
    );
    assert_eq!(loose.sibling_note("Terceira"), None);
    let mut other = loose.open_sibling("Outra").unwrap();
    assert_eq!(other.name(), "Outra.md");
    assert_eq!(other.read("Outra.md").unwrap().text, "# Outra\n");
    assert!(loose.open_sibling("../x").is_err());
}

#[test]
fn a_file_that_went_away_is_saved_here_again_once() {
    let (dir, mut loose) = loose();
    fs::rename(dir.path().join("Lista.md"), dir.path().join("Movida.md")).unwrap();
    let err = loose.read("Lista.md").unwrap_err();
    assert!(matches!(err, CoreError::Read(_)), "{err:?}");
    let back = loose.save_again("Lista.md", "# de volta\n").unwrap();
    assert_eq!(back.note.text, "# de volta\n");
    let err = loose.save_again("Lista.md", "# outra vez\n").unwrap_err();
    assert!(
        matches!(err, CoreError::Write(verso_fs::WriteError::Exists)),
        "{err:?}"
    );
}

#[cfg(unix)]
#[test]
fn a_file_without_write_permission_opens_read_only() {
    use std::os::unix::fs::PermissionsExt;
    let (dir, loose) = loose();
    fs::set_permissions(
        dir.path().join("Lista.md"),
        fs::Permissions::from_mode(0o444),
    )
    .unwrap();
    assert!(matches!(
        loose.read_only(),
        Some(LooseReadOnly::Permissions(_))
    ));
    fs::set_permissions(
        dir.path().join("Lista.md"),
        fs::Permissions::from_mode(0o644),
    )
    .unwrap();
    // The watch tells the session the file changed.
    loose.refresh();
    assert!(loose.read_only().is_none());
}

#[test]
fn bytes_that_are_not_utf8_are_not_text() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("bin.md"), [0xff, 0xfe, 0x00]).unwrap();
    let mut loose = Loose::open(&dir.path().join("bin.md")).unwrap();
    assert!(matches!(loose.read("bin.md"), Err(CoreError::NotText)));
}

#[test]
fn a_sibling_in_a_subfolder_keeps_its_folder_in_its_path() {
    let (dir, loose) = loose();
    fs::create_dir(dir.path().join("sub")).unwrap();
    fs::write(dir.path().join("sub/Outra.md"), "# fundo\n").unwrap();
    let mut deep = loose.open_sibling("sub/Outra").unwrap();
    // Not the `Outra.md` of the parent (a different file).
    assert_ne!(
        deep.file_path(),
        loose.open_sibling("Outra").unwrap().file_path()
    );
    assert!(
        deep.file_path().ends_with("sub/Outra.md"),
        "{:?}",
        deep.file_path()
    );
    assert!(deep.parent().ends_with("sub"));
    assert_eq!(deep.place(), "sub");
    assert_eq!(deep.read("Outra.md").unwrap().text, "# fundo\n");
    assert_ne!(deep.key(), loose.open_sibling("Outra").unwrap().key());
}

#[test]
fn only_the_attachments_the_note_cites_are_served() {
    let (dir, mut loose) = loose();
    fs::write(dir.path().join("segredo.png"), b"SECRET").unwrap();
    fs::create_dir(dir.path().join("fotos")).unwrap();
    fs::write(dir.path().join("fotos/a b.png"), b"AB").unwrap();
    // Nothing is served before the note was read.
    assert!(loose.read_attachment("foto.png").is_err());
    let note = loose.read("Lista.md").unwrap();
    // Cited (`![[foto.png]]`): admitted and served; not cited: neither.
    assert_eq!(loose.resolve_attachment("segredo.png"), None);
    assert!(loose.read_attachment("segredo.png").is_err());
    assert!(loose.read_attachment("fotos/a b.png").is_err());
    assert_eq!(
        loose.resolve_attachment("foto.png"),
        Some("foto.png".into())
    );
    assert_eq!(loose.read_attachment("foto.png").unwrap(), b"\x89PNG");
    // A text that cites a picture in a subfolder, as the renderer writes it.
    let w = loose
        .write("Lista.md", "![x](fotos/a%20b.png)\n", &note.revision)
        .unwrap();
    assert_eq!(
        loose.resolve_attachment("fotos/a b.png"),
        Some("fotos/a b.png".into())
    );
    assert_eq!(loose.read_attachment("fotos/a b.png").unwrap(), b"AB");
    // The new text no longer cites foto.png: it is not served any more.
    assert!(loose.read_attachment("foto.png").is_err());
    // Rewriting without any citation forgets the rest.
    loose.write("Lista.md", "nada\n", &w.note.revision).unwrap();
    assert!(loose.read_attachment("fotos/a b.png").is_err());
}

#[test]
fn the_core_refuses_what_the_window_should_not_offer() {
    let (dir, mut loose) = loose();
    let note = loose.read("Lista.md").unwrap();
    // A text above the bound is refused, whatever the window did.
    let big = "x".repeat((verso_core::LOOSE_MAX_BYTES + 1) as usize);
    let err = loose.write("Lista.md", &big, &note.revision).unwrap_err();
    assert!(matches!(err, CoreError::Loose(_)), "{err:?}");
    // A file already above the bound is read-only: refused for writing,
    // and above the read cap it is not even read.
    let path = dir.path().join("Grande.md");
    let file = fs::File::create(&path).unwrap();
    file.set_len(verso_core::LOOSE_MAX_BYTES + 1).unwrap();
    let mut grande = Loose::open(&path).unwrap();
    assert_eq!(grande.read_only(), Some(LooseReadOnly::TooLarge));
    let read = grande.read("Grande.md").unwrap();
    let err = grande.write("Grande.md", "x", &read.revision).unwrap_err();
    assert!(matches!(err, CoreError::Loose(_)), "{err:?}");
    file.set_len(verso_core::LOOSE_READ_CAP + 1).unwrap();
    let err = grande.read("Grande.md").unwrap_err();
    assert!(matches!(err, CoreError::Loose(_)), "{err:?}");
    // Nothing was changed by the refused writes.
    assert_eq!(
        fs::read_to_string(dir.path().join("Lista.md"))
            .unwrap()
            .len(),
        note.text.len()
    );
}

#[cfg(unix)]
#[test]
fn a_write_to_a_read_only_file_is_refused_by_the_core() {
    use std::os::unix::fs::PermissionsExt;
    let (dir, mut loose) = loose();
    let note = loose.read("Lista.md").unwrap();
    fs::set_permissions(
        dir.path().join("Lista.md"),
        fs::Permissions::from_mode(0o444),
    )
    .unwrap();
    let err = loose
        .write("Lista.md", "novo\n", &note.revision)
        .unwrap_err();
    assert!(matches!(err, CoreError::Loose(_)), "{err:?}");
    fs::set_permissions(
        dir.path().join("Lista.md"),
        fs::Permissions::from_mode(0o644),
    )
    .unwrap();
}

/// A file the user may write in a directory only a group may write in: the
/// mode bits of the directory are not all zero, yet the save (temporary file
/// + rename) cannot be made. The core asks the directory for real.
#[cfg(unix)]
#[test]
fn a_directory_that_takes_no_new_file_refuses_the_write_before_the_save() {
    use std::os::unix::fs::PermissionsExt;
    let (dir, mut loose) = loose();
    let note = loose.read("Lista.md").unwrap();
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o575)).unwrap();
    let probe = loose.write("Lista.md", "novo\n", &note.revision);
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o755)).unwrap();
    if fs::File::create(dir.path().join("probe")).is_ok() && probe.is_ok() {
        return; // running as root: the mode bits stop nothing.
    }
    let err = probe.unwrap_err();
    assert!(matches!(err, CoreError::Loose(_)), "{err:?}");
    // The probe left nothing behind.
    let _ = fs::remove_file(dir.path().join("probe"));
    assert_eq!(names(dir.path()), ["Lista.md", "Outra.md", "foto.png"]);
}

/// Explorer marks Documents, Pictures and folders with a `desktop.ini` with
/// the READONLY attribute; it stops no write and is not a reason.
#[cfg(windows)]
#[test]
fn the_readonly_attribute_of_a_directory_is_not_a_reason_on_windows() {
    let (dir, mut loose) = loose();
    let mut perms = fs::metadata(dir.path()).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(dir.path(), perms.clone()).unwrap();
    let ro = loose.read_only();
    let note = loose.read("Lista.md").unwrap();
    let wrote = loose.write("Lista.md", "novo\n", &note.revision);
    perms.set_readonly(false);
    fs::set_permissions(dir.path(), perms).unwrap();
    assert_eq!(ro, None);
    wrote.unwrap();
}

#[test]
fn save_here_again_does_not_make_the_folder_again() {
    let (dir, mut loose) = loose();
    let sub = dir.path().join("sub");
    fs::create_dir(&sub).unwrap();
    fs::write(sub.join("Funda.md"), "# f\n").unwrap();
    let mut deep = Loose::open(&sub.join("Funda.md")).unwrap();
    fs::remove_dir_all(&sub).unwrap();
    let err = deep.save_again("Funda.md", "# de volta\n").unwrap_err();
    assert!(
        matches!(err, CoreError::Write(verso_fs::WriteError::Io(_))),
        "{err:?}"
    );
    assert!(!sub.exists());
    let _ = &mut loose;
}

#[cfg(unix)]
#[test]
fn the_permission_probe_is_kept_until_the_file_is_known_to_have_changed() {
    use std::os::unix::fs::PermissionsExt;
    let (dir, loose) = loose();
    assert!(loose.read_only().is_none());
    fs::set_permissions(
        dir.path().join("Lista.md"),
        fs::Permissions::from_mode(0o444),
    )
    .unwrap();
    // Kept: the disk is not asked again by every command.
    assert!(loose.read_only().is_none());
    loose.refresh();
    assert!(loose.read_only().is_some());
    fs::set_permissions(
        dir.path().join("Lista.md"),
        fs::Permissions::from_mode(0o644),
    )
    .unwrap();
}
