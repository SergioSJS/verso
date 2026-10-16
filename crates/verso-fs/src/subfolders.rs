// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folders inside a folder that is not open, for choosing which of them
//! to serve to a phone (ADR 0096, amended 2026-10-16). It is the walk's own
//! answer — the same hidden and ignored entries the file tree leaves out —
//! kept to the directories, as paths relative to the folder joined by `/`
//! (ADR 0026 rule 4: nothing absolute crosses).

use std::path::Path;

use crate::{EntryKind, Root};

/// Every folder under `path`, relative, `/`-joined, in byte order. Hidden
/// directories (`.obsidian`, `.git`) and the default-ignored ones are not
/// there, as in the tree; `path` itself is not listed.
pub fn subfolders(path: &Path) -> std::io::Result<Vec<String>> {
    let mut root = Root::open(path, Vec::new())?;
    // As the folder is opened to serve: a link that leaves it is not a folder.
    root.set_links_inside(true);
    let walk = root.walk();
    let mut out: Vec<String> = walk
        .entries
        .iter()
        .filter(|e| matches!(e.kind, EntryKind::Directory))
        .map(|e| {
            e.relative
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/")
        })
        .filter(|p| !p.is_empty())
        .collect();
    out.sort();
    out.dedup();
    Ok(out)
}

/// Whether `relative` (a `/`-joined folder of `path`, none of its parts `..`
/// or empty) is a folder there now.
#[must_use]
pub fn is_folder(path: &Path, relative: &str) -> bool {
    !relative
        .split('/')
        .any(|p| p.is_empty() || p == "." || p == "..")
        && std::fs::metadata(path.join(relative)).is_ok_and(|m| m.is_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_the_visible_folders_and_not_the_hidden_ones() {
        let dir = tempfile::tempdir().unwrap();
        for d in [
            "Projetos/A",
            "Diario",
            ".obsidian/plugins",
            "node_modules/x",
        ] {
            std::fs::create_dir_all(dir.path().join(d)).unwrap();
        }
        std::fs::write(dir.path().join("Projetos/nota.md"), "# n\n").unwrap();
        let found = subfolders(dir.path()).unwrap();
        assert_eq!(found, ["Diario", "Projetos", "Projetos/A"]);
    }

    #[test]
    fn a_folder_is_one_only_when_it_is_there_and_inside() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("A/B")).unwrap();
        std::fs::write(dir.path().join("A/f.md"), "x").unwrap();
        assert!(is_folder(dir.path(), "A/B"));
        for no in ["A/f.md", "A/C", "../x", "A/../A", "", "/A"] {
            assert!(!is_folder(dir.path(), no), "{no:?}");
        }
    }

    #[test]
    fn a_path_that_is_no_folder_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("f.md"), "x").unwrap();
        assert!(subfolders(&dir.path().join("f.md")).is_err());
        assert!(subfolders(&dir.path().join("nope")).is_err());
    }
}
