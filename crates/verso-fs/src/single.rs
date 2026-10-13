// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a walk would say of a few paths, asked without walking the folder
//! (ADR 0073 item 12): a batch of the watch that created or removed files
//! is brought into the listing path by path, under the walk's own rules —
//! hidden names, the caller's ignored paths, the built-in rules and
//! `.gitignore` — and a placeholder is never taken for a deletion (ADR
//! 0043). Anything the rules cannot settle for one path alone is
//! [`Single::Other`], and the caller walks.

use std::collections::{HashMap, HashSet};
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::walk::{Entry, EntryKind};
use crate::{ConfinementError, Root, on_disk, placeholder};

/// What the walk would say of one path.
#[derive(Debug)]
pub enum Single {
    /// A note or another file, as the walk would list it.
    File(Entry),
    /// Nothing of that name in its folder, under any spelling, and no
    /// placeholder standing in for it.
    Absent,
    /// A name the walk passes over: a hidden one, under a path the caller
    /// ignores, or one a `.gitignore` leaves out.
    Skipped,
    /// What only a walk answers: a folder, a placeholder, a `.gitignore`
    /// (which changes what the walk lists), a link out of the folder, a
    /// name in another spelling, what could not be examined.
    Other,
}

impl Root {
    /// What a walk would say of each of `relatives`, in order, without
    /// walking: each one's folder is listed once, whatever the number of
    /// paths in it. The caller knows whether that folder itself is one
    /// the walk enters; this answers for the name in it.
    pub fn single(&mut self, relatives: &[&Path]) -> Vec<Single> {
        let mut listed: HashMap<PathBuf, Option<HashSet<OsString>>> = HashMap::new();
        relatives
            .iter()
            .map(|relative| self.one(relative, &mut listed))
            .collect()
    }

    fn one(
        &mut self,
        relative: &Path,
        listed: &mut HashMap<PathBuf, Option<HashSet<OsString>>>,
    ) -> Single {
        let Some(name) = relative.file_name().map(OsString::from) else {
            return Single::Other;
        };
        // A `.gitignore` changes what the walk lists under it.
        if name == ".gitignore" {
            return Single::Other;
        }
        let rel = match self.confine(relative) {
            Ok(rel) if rel == relative => rel,
            Err(ConfinementError::Hidden | ConfinementError::Ignored) => return Single::Skipped,
            _ => return Single::Other,
        };
        if placeholder::icloud_placeholder_of(&name).is_some() {
            return Single::Other;
        }
        let parent = rel.parent().map(Path::to_path_buf).unwrap_or_default();
        let names = listed
            .entry(parent.clone())
            .or_insert_with(|| {
                std::fs::read_dir(on_disk(self.root_path(), &parent))
                    .ok()?
                    .map(|e| e.map(|e| e.file_name()))
                    .collect::<Result<HashSet<_>, _>>()
                    .ok()
            })
            .as_ref();
        let Some(names) = names else {
            return Single::Other;
        };
        let abs = on_disk(self.root_path(), &rel);
        if !names.contains(&name) {
            let mut sibling = OsString::from(".");
            sibling.push(&name);
            sibling.push(".icloud");
            // A placeholder stands in for it, or the file system finds it
            // under another spelling (case, accents): only a walk says.
            if names.contains(&sibling) || std::fs::symlink_metadata(&abs).is_ok() {
                return Single::Other;
            }
            return Single::Absent;
        }
        if self.links_inside()
            && std::fs::symlink_metadata(&abs).is_ok_and(|m| m.file_type().is_symlink())
            && !self.resolves_inside(&rel)
        {
            return Single::Other;
        }
        let Ok(meta) = std::fs::metadata(&abs) else {
            return Single::Other;
        };
        if meta.is_dir() || placeholder::is_dataless(&meta) {
            return Single::Other;
        }
        if self.rules().gitignore {
            match self.gitignored(&rel, &abs) {
                Some(true) => return Single::Skipped,
                Some(false) => {}
                None => return Single::Other,
            }
        }
        let kind = if rel.extension().is_some_and(|e| e == "md") {
            EntryKind::Note
        } else {
            EntryKind::File
        };
        let depth = rel.components().count().saturating_sub(1);
        let handle = self.intern(rel.clone());
        Single::File(Entry {
            handle,
            relative: rel,
            kind,
            depth,
            len: meta.len(),
            modified: meta.modified().ok(),
            created: meta.created().ok(),
        })
    }

    /// Whether the `.gitignore` files from the root down to the file's
    /// folder leave the file out, the innermost with an opinion deciding,
    /// as the walk asks; `None` when one cannot be read whole (the walk
    /// reports it as a problem).
    fn gitignored(&self, rel: &Path, abs: &Path) -> Option<bool> {
        let mut dirs = vec![self.root_path().to_path_buf()];
        let mut dir = self.root_path().to_path_buf();
        if let Some(parent) = rel.parent() {
            for part in parent.components() {
                dir.push(part);
                dirs.push(dir.clone());
            }
        }
        let mut matchers = Vec::new();
        for dir in dirs {
            let file = dir.join(".gitignore");
            if std::fs::symlink_metadata(&file).is_err() {
                continue;
            }
            let mut builder = ignore::gitignore::GitignoreBuilder::new(&dir);
            if builder.add(&file).is_some() {
                return None;
            }
            matchers.push(builder.build().ok()?);
        }
        for gi in matchers.iter().rev() {
            match gi.matched(abs, false) {
                ignore::Match::None => {}
                ignore::Match::Ignore(_) => return Some(true),
                ignore::Match::Whitelist(_) => return Some(false),
            }
        }
        Some(false)
    }
}
