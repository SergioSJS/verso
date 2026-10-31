// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The index and the listing brought up to date with one batch of the
//! watch by its paths alone, not a walk of the whole folder (ADR 0073 item
//! 12): a note or a board whose content changed is read again, a file
//! created — every file a sync's download brings — enters the listing
//! where the walk would put it, and a file removed leaves it. What each
//! path is now comes from `verso-fs` under the walk's own rules
//! ([`verso_fs::Single`]); a path only a walk can answer for makes the
//! whole batch a walk, so the listing and what is gone stay exactly what a
//! walk finds, and a placeholder is never a deletion (ADR 0043).

use std::cmp::Ordering;

use verso_fs::Single;

use super::*;

/// What the batch did to one path, decided before anything changes.
enum Step {
    /// There, as the walk would list it: read again when a note or a
    /// board, and its length and time taken; entered in the listing when
    /// it was not in it.
    Here(verso_fs::Entry),
    /// Gone from a listed path.
    Gone,
}

impl Workspace {
    /// The narrowed run itself; `None` when a path is one only a walk
    /// answers for — a folder, a placeholder, a `.gitignore`, a name in
    /// another spelling, a new file in a folder the last walk did not
    /// enter — and the caller walks instead.
    pub(crate) fn narrow_run(
        &mut self,
        paths: &[String],
    ) -> Result<Option<IndexReport>, CoreError> {
        let mut report = IndexReport {
            narrowed: true,
            ..IndexReport::default()
        };
        // The folder's settings directory is never listed nor indexed: its
        // file read again, what changed reported (ADR 0070). A change of
        // the walk's rules makes the batch a walk.
        let (layer, paths): (Vec<String>, Vec<String>) = paths
            .iter()
            .cloned()
            .partition(|p| verso_fs::is_settings_path(p));
        if !layer.is_empty() && !self.narrow_layer(&mut report) {
            return Ok(None);
        }
        let paths = paths.as_slice();
        let asked: Vec<&Path> = paths.iter().map(Path::new).collect();
        let found = self.root.single(&asked);
        let mut steps: Vec<(&String, Step)> = Vec::new();
        {
            let listed: HashSet<&str> = self.entries.iter().map(|e| e.path.as_str()).collect();
            // The folders the last walk entered: the root, and every one
            // holding a listed entry. A folder listed but not entered — a
            // loop, too deep — lists nothing in it, and an empty one is
            // left to a walk.
            let entered: HashSet<&str> = std::iter::once("")
                .chain(self.entries.iter().map(|e| parent_of(&e.path)))
                .collect();
            for (relative, single) in paths.iter().zip(found) {
                let known = listed.contains(relative.as_str());
                match single {
                    Single::File(entry) if known || entered.contains(parent_of(relative)) => {
                        steps.push((relative, Step::Here(entry)));
                    }
                    Single::Absent if known => steps.push((relative, Step::Gone)),
                    // Not there and never listed (a temporary file come and
                    // gone), or a name the walk passes over: nothing to do.
                    Single::Absent => {}
                    Single::Skipped if !known => {}
                    _ => return Ok(None),
                }
            }
        }
        for (relative, step) in steps {
            match step {
                Step::Here(entry) => {
                    if !self.narrow_here(relative, &entry, &mut report)? {
                        return Ok(None);
                    }
                }
                Step::Gone => self.narrow_gone(relative, &mut report)?,
            }
        }
        Ok(Some(report))
    }

    /// A path that is there: a note or a board read again when its
    /// content changed, its length and time taken, and entered in the
    /// listing in the walk's order when it was not in it. `false` when it
    /// turned out a placeholder as it was read: the caller walks.
    fn narrow_here(
        &mut self,
        relative: &str,
        entry: &verso_fs::Entry,
        report: &mut IndexReport,
    ) -> Result<bool, CoreError> {
        let is_note = entry.kind == EntryKind::Note;
        if is_note && entry.len > crate::indexing::INDEX_MOST {
            // Past the cap: not read, not indexed; a row of a smaller
            // version goes (`INDEX_MOST`).
            if self.index.remove(relative).map_err(CoreError::Index)? {
                report.removed += 1;
            }
        } else if is_note || is_canvas(relative) {
            match self.root.read(entry.handle) {
                Ok((bytes, stamp)) => {
                    let stamp = note_stamp(&stamp);
                    if self.index.stamp_of(relative).map_err(CoreError::Index)? == Some(stamp) {
                        report.unchanged += 1;
                    } else if is_note {
                        let content = String::from_utf8_lossy(&bytes);
                        let parsed = verso_dialect::parse(&content);
                        self.index
                            .upsert(relative, stamp, &content, &parsed)
                            .map_err(CoreError::Index)?;
                        report.indexed += 1;
                        report.changed.push(relative.to_owned());
                    } else {
                        self.index_canvas(relative, &bytes, stamp)?;
                        report.changed.push(relative.to_owned());
                    }
                }
                Err(verso_fs::ReadError::Unavailable) => return Ok(false),
                Err(e) => report.unreadable.push((relative.to_owned(), e.to_string())),
            }
        }
        let modified = entry.modified.map_or(0, seconds_since_epoch);
        if let Some(known) = self.entries.iter_mut().find(|e| e.path == relative) {
            known.len = entry.len;
            known.modified = modified;
            return Ok(true);
        }
        let at = self
            .entries
            .partition_point(|e| walk_order(&e.path, relative) == Ordering::Less);
        self.entries.insert(
            at,
            FileEntry {
                path: relative.to_owned(),
                kind: if is_note {
                    FileKind::Note
                } else {
                    FileKind::File
                },
                len: entry.len,
                modified,
                created: entry.created.map_or(0, seconds_since_epoch),
            },
        );
        if !is_note {
            // A write of this app's own put it there already.
            let named = self
                .files
                .entry(verso_index::file_key(name_of(relative)))
                .or_default();
            if !named.iter().any(|p| p == relative) {
                named.push(relative.to_owned());
            }
        }
        report.listing_changed = true;
        Ok(true)
    }

    /// A listed path gone from the disk: out of the listing, and out of
    /// the index when a note or a board, as a walk leaves it.
    fn narrow_gone(&mut self, relative: &str, report: &mut IndexReport) -> Result<(), CoreError> {
        let Some(at) = self.entries.iter().position(|e| e.path == relative) else {
            return Ok(());
        };
        let gone = self.entries.remove(at);
        if gone.kind == FileKind::File {
            let key = verso_index::file_key(name_of(relative));
            if let Some(named) = self.files.get_mut(&key) {
                named.retain(|p| p != relative);
                if named.is_empty() {
                    self.files.remove(&key);
                }
            }
        }
        if (gone.kind == FileKind::Note || is_canvas(relative))
            && self.index.remove(relative).map_err(CoreError::Index)?
        {
            report.removed += 1;
            report.gone.push(relative.to_owned());
        }
        report.listing_changed = true;
        Ok(())
    }
}

/// The order the walk lists in: depth first, the names of each folder
/// sorted — which is the paths' names compared one by one, a folder's
/// own path before everything in it.
fn walk_order(a: &str, b: &str) -> Ordering {
    a.split('/').cmp(b.split('/'))
}

#[cfg(test)]
mod tests {
    use super::walk_order;

    #[test]
    fn the_walks_order_is_a_folder_then_what_it_holds_then_the_next_name() {
        let mut paths = vec!["b.md", "a b.md", "a/z.md", "a", "a/b/c.md", "a/b", "A.md"];
        paths.sort_by(|a, b| walk_order(a, b));
        assert_eq!(
            paths,
            ["A.md", "a", "a/b", "a/b/c.md", "a/z.md", "a b.md", "b.md"]
        );
    }
}
