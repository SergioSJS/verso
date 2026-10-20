// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's own settings directory, `.verso/` at the root (ADR 0070
//! items 1 and 2, built 2026-10-12): the one hidden directory a path may
//! name and sync may carry. Only its direct entries — and those of its two
//! data directories, `layouts/` and `bundles/` (ADR 0099 item 2, ADR 0098
//! item 2) —, and only those whose names are not hidden themselves — the atomic write's temporary files
//! (`.verso-tmp-…`) stay out —, are confined like any file of the folder;
//! the walk still does not list it, so the tree, the index and the search
//! never see it ([`crate::Root::settings_walk`] lists it apart, for sync).
//! Nothing here creates it: the first write of a setting does, through
//! [`crate::Root::create`], as every new file is created.

use std::path::{Component, Path, PathBuf};

use crate::walk::{Entry, EntryKind};
use crate::{Root, on_disk, placeholder};

/// The settings directory's name at the root, as Obsidian's is
/// `.obsidian/` (decided by the maintainer on 2026-10-09).
pub const SETTINGS_DIR: &str = ".verso";

/// The folder's settings file: bookmarks, the walk's rules, the folder
/// note's name (ADR 0070 item 2).
pub const SETTINGS_FILE: &str = ".verso/settings.json";

/// The two directories of `.verso/` that hold the folder's data files, one
/// level deep (ADR 0099 item 2: layouts; ADR 0098 item 2: bundles). Nothing
/// else under `.verso/` has a directory of its own.
pub const DATA_DIRS: [&str; 2] = ["layouts", "bundles"];

/// Whether `relative` is the settings directory itself, one entry directly
/// inside it, or one entry directly inside `.verso/layouts/` or
/// `.verso/bundles/`, whose name is not hidden: the exception to the hidden
/// rule, and nothing deeper. An iCloud placeholder of such an entry
/// (`.verso/.settings.json.icloud`) counts as the entry it stands for.
#[must_use]
pub fn in_settings_dir(relative: &Path) -> bool {
    let mut parts = relative.components();
    if parts.next() != Some(Component::Normal(SETTINGS_DIR.as_ref())) {
        return false;
    }
    let plain = |name: &std::ffi::OsStr| {
        !name.as_encoded_bytes().starts_with(b".")
            || placeholder::icloud_placeholder_of(name).is_some()
    };
    match (parts.next(), parts.next(), parts.next()) {
        (None, _, _) => true,
        (Some(Component::Normal(name)), None, _) => plain(name),
        (Some(Component::Normal(dir)), Some(Component::Normal(name)), None) => {
            dir.to_str().is_some_and(|d| DATA_DIRS.contains(&d)) && plain(name)
        }
        _ => false,
    }
}

/// [`in_settings_dir`] for a path as the contract writes it, joined by `/`.
#[must_use]
pub fn is_settings_path(relative: &str) -> bool {
    in_settings_dir(Path::new(relative))
}

impl Root {
    /// The files directly inside `.verso/`, as the walk would list them if
    /// it entered it: what sync carries beside the walk's entries (ADR
    /// 0079 item 2 names the folder's settings among the files). A
    /// symlink is not followed and not listed, nor is a directory or a
    /// hidden name; a placeholder is listed as one (ADR 0043). Nothing
    /// when there is no `.verso/`, and nothing is created.
    pub fn settings_walk(&mut self) -> std::io::Result<Vec<Entry>> {
        let mut found = Vec::new();
        // `.verso` must be a real directory: through a symlink nothing under
        // it is looked at, however far down (`lstat` of a deeper path
        // resolves every link in the middle of it).
        match on_disk(self.root_path(), Path::new(SETTINGS_DIR)).symlink_metadata() {
            Ok(m) if m.is_dir() => {}
            Ok(_) => return Ok(Vec::new()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e),
        }
        // `.verso/` itself, then the two data directories one level down
        // (ADR 0099 item 2, ADR 0098 item 2): files only, none followed.
        let mut dirs = vec![(PathBuf::from(SETTINGS_DIR), 1usize)];
        dirs.extend(
            DATA_DIRS
                .iter()
                .map(|d| (crate::rel_join(Path::new(SETTINGS_DIR), d), 2usize)),
        );
        for (rel_dir, depth) in dirs {
            let dir = on_disk(self.root_path(), &rel_dir);
            match dir.symlink_metadata() {
                Ok(m) if m.is_dir() => {}
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
                Err(e) => return Err(e),
            }
            for entry in std::fs::read_dir(&dir)? {
                let entry = entry?;
                let name = entry.file_name();
                let meta = std::fs::symlink_metadata(entry.path())?;
                if !meta.is_file() {
                    continue;
                }
                let (relative, kind) = match placeholder::icloud_placeholder_of(&name) {
                    Some(real) => {
                        let of = crate::rel_join(&rel_dir, &real);
                        (of.clone(), EntryKind::Placeholder { of })
                    }
                    None if name.as_encoded_bytes().starts_with(b".") => continue,
                    None => {
                        let rel = crate::rel_join(&rel_dir, &name);
                        let kind = if placeholder::is_dataless(&meta) {
                            EntryKind::Placeholder { of: rel.clone() }
                        } else {
                            EntryKind::File
                        };
                        (rel, kind)
                    }
                };
                found.push((relative, kind, meta, depth));
            }
        }
        found.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(found
            .into_iter()
            .map(|(relative, kind, meta, depth)| Entry {
                handle: self.intern(relative.clone()),
                relative,
                kind,
                depth,
                len: meta.len(),
                modified: meta.modified().ok(),
                created: meta.created().ok(),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_directory_and_its_plain_entries_are_the_exception() {
        assert!(in_settings_dir(Path::new(".verso")));
        assert!(in_settings_dir(Path::new(".verso/settings.json")));
        assert!(in_settings_dir(Path::new(
            ".verso/settings (conflict, Mac, 2026-10-12 10.00).json"
        )));
        assert!(in_settings_dir(Path::new(".verso/.settings.json.icloud")));
        assert!(!in_settings_dir(Path::new(".verso/.verso-tmp-1-2")));
        assert!(in_settings_dir(Path::new(".verso/layouts")));
        assert!(in_settings_dir(Path::new(".verso/layouts/mesa.json")));
        assert!(in_settings_dir(Path::new(
            ".verso/bundles/.mesa.json.icloud"
        )));
        assert!(!in_settings_dir(Path::new(".verso/layouts/.verso-tmp-1-2")));
        assert!(!in_settings_dir(Path::new(".verso/other/mesa.json")));
        assert!(!in_settings_dir(Path::new(".verso/layouts/a/b.json")));
        assert!(!in_settings_dir(Path::new(".verso/a/b.json")));
        assert!(!in_settings_dir(Path::new(".obsidian/app.json")));
        assert!(!in_settings_dir(Path::new("notas/.verso/settings.json")));
        assert!(!in_settings_dir(Path::new(".versos/settings.json")));
        assert!(!in_settings_dir(Path::new("settings.json")));
    }
}
