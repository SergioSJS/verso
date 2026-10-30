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
