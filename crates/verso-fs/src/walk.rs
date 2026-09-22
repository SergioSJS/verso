// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Walking the open folder (ADR 0044, decided 2026-09-22): symlinks
//! followed, loops detected by the identity of the directories already
//! entered, depth capped at [`MAX_DEPTH`], hidden entries and the caller's
//! ignored paths skipped, placeholders reported as present.

use std::collections::HashSet;
use std::fs::Metadata;
use std::path::{Path, PathBuf};

use crate::placeholder;
use crate::{Handle, MAX_DEPTH, Root};

/// What kind of thing an entry is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntryKind {
    /// A regular file whose extension is exactly `md`. Provisional: `.MD`
    /// and `.markdown` are `File` until spec Q12 decides.
    Note,
    /// Any other regular file.
    File,
    Directory,
    /// An on-demand storage placeholder standing for `of` (ADR 0043):
    /// present, content unavailable. `of` is the relative path of the real
    /// file — the entry's own path for a dataless file, the sibling name
    /// for the `.Name.ext.icloud` form.
    Placeholder {
        of: PathBuf,
    },
}

/// One thing found in the folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub handle: Handle,
    /// Path relative to the root, as walked: through the symlink's name,
    /// not its target.
    pub relative: PathBuf,
    pub kind: EntryKind,
    /// 0 for a direct child of the root.
    pub depth: usize,
}

/// Something the walk met and did not silently pass over.
#[derive(Debug)]
pub enum Problem {
    /// A directory already entered higher up the same path: a symlink loop.
    /// Listed as an entry, not entered again.
    Loop {
        relative: PathBuf,
        first_seen: PathBuf,
    },
    /// A directory already walked under another name (a second symlink to
    /// it). Listed as an entry; its content was walked once, under
    /// `first_seen`. Provisional (ADR 0044): the alternative is to walk it
    /// again under the second name, as hard links are two notes.
    Duplicate {
        relative: PathBuf,
        first_seen: PathBuf,
    },
    /// Nesting deeper than [`MAX_DEPTH`]; not descended.
    DepthExceeded { relative: PathBuf },
    /// The entry could not be examined (a broken symlink, a permission).
    Io {
        relative: PathBuf,
        error: std::io::Error,
    },
}

/// The result of a walk: entries in a deterministic order, and problems.
#[derive(Debug, Default)]
pub struct Walk {
    pub entries: Vec<Entry>,
    pub problems: Vec<Problem>,
}

/// Identity of a directory on disk, to tell a loop from a long path.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct DirId {
    dev: u64,
    ino: u64,
}

#[cfg(unix)]
fn dir_id(meta: &Metadata) -> DirId {
    use std::os::unix::fs::MetadataExt;
    DirId {
        dev: meta.dev(),
        ino: meta.ino(),
    }
}

#[cfg(not(unix))]
compile_error!(
    "verso-fs needs a directory identity for loop detection; only Unix (dev, ino) is implemented — ADR 0022: macOS first"
);

struct Walker<'a> {
    root: &'a mut Root,
    out: Walk,
    /// Directories on the current path, root first: a loop is one of these.
    ancestors: Vec<(DirId, PathBuf)>,
    /// Every directory walked so far, with the path it was walked under.
    visited: Vec<(DirId, PathBuf)>,
    visited_ids: HashSet<DirId>,
}

pub(crate) fn walk(root: &mut Root) -> Walk {
    let root_path = root.root_path().to_path_buf();
    let mut walker = Walker {
        root,
        out: Walk::default(),
        ancestors: Vec::new(),
        visited: Vec::new(),
        visited_ids: HashSet::new(),
    };
    match std::fs::metadata(&root_path) {
        Ok(meta) => {
            let id = dir_id(&meta);
            walker.ancestors.push((id, PathBuf::new()));
            walker.visited.push((id, PathBuf::new()));
            walker.visited_ids.insert(id);
            walker.directory(&root_path, &PathBuf::new(), 0);
        }
        Err(error) => walker.out.problems.push(Problem::Io {
            relative: PathBuf::new(),
            error,
        }),
    }
    walker.out
}

impl Walker<'_> {
    fn directory(&mut self, absolute: &Path, relative: &Path, depth: usize) {
        let iter = match std::fs::read_dir(absolute) {
            Ok(iter) => iter,
            Err(error) => {
                self.out.problems.push(Problem::Io {
                    relative: relative.to_path_buf(),
                    error,
                });
                return;
            }
        };
        let mut names = Vec::new();
        for entry in iter {
            match entry {
                Ok(entry) => names.push(entry.file_name()),
                // An entry that cannot be listed is reported, never dropped.
                Err(error) => self.out.problems.push(Problem::Io {
                    relative: relative.to_path_buf(),
                    error,
                }),
            }
        }
        names.sort();
        for name in names {
            let rel = relative.join(&name);
            let abs = absolute.join(&name);
            if self.root.is_ignored(&rel) {
                continue;
            }
            let placeholder_of = placeholder::icloud_placeholder_of(&name);
            // The iCloud sibling form is recognized before the hidden rule
            // (ADR 0043); any other dot entry is not walked (ADR 0044).
            if name.as_encoded_bytes().starts_with(b".") && placeholder_of.is_none() {
                continue;
            }
            // Symlinks are followed: metadata of the target, not of the link.
            let meta = match std::fs::metadata(&abs) {
                Ok(meta) => meta,
                Err(error) => {
                    // A symlink to a name iCloud evicted in the older form:
                    // the sibling stands in for it (ADR 0043, provisional),
                    // not a broken link.
                    if error.kind() == std::io::ErrorKind::NotFound
                        && placeholder::follow(&abs).is_ok_and(|t| placeholder::sibling_exists(&t))
                    {
                        let handle = self.root.intern(rel.clone());
                        self.out.entries.push(Entry {
                            handle,
                            relative: rel.clone(),
                            kind: EntryKind::Placeholder { of: rel },
                            depth,
                        });
                        continue;
                    }
                    self.out.problems.push(Problem::Io {
                        relative: rel,
                        error,
                    });
                    continue;
                }
            };
            if meta.is_dir() {
                // A directory named like a placeholder is a directory.
                self.subdirectory(&abs, rel, depth, &meta);
            } else {
                let kind = if let Some(of) = placeholder_of {
                    EntryKind::Placeholder {
                        of: relative.join(of),
                    }
                } else if placeholder::is_dataless(&meta) {
                    EntryKind::Placeholder { of: rel.clone() }
                } else if rel.extension().is_some_and(|e| e == "md") {
                    EntryKind::Note
                } else {
                    EntryKind::File
                };
                let handle = self.root.intern(rel.clone());
                self.out.entries.push(Entry {
                    handle,
                    relative: rel,
                    kind,
                    depth,
                });
            }
        }
    }

    fn subdirectory(&mut self, abs: &Path, rel: PathBuf, depth: usize, meta: &Metadata) {
        // The directory exists and is listed whatever happens next; only
        // whether it is entered depends on the checks below.
        let handle = self.root.intern(rel.clone());
        self.out.entries.push(Entry {
            handle,
            relative: rel.clone(),
            kind: EntryKind::Directory,
            depth,
        });
        let id = dir_id(meta);
        if let Some((_, first)) = self.ancestors.iter().find(|(a, _)| *a == id) {
            self.out.problems.push(Problem::Loop {
                relative: rel,
                first_seen: first.clone(),
            });
            return;
        }
        if self.visited_ids.contains(&id) {
            let first = self
                .visited
                .iter()
                .find(|(v, _)| *v == id)
                .map(|(_, p)| p.clone())
                .unwrap_or_default();
            self.out.problems.push(Problem::Duplicate {
                relative: rel,
                first_seen: first,
            });
            return;
        }
        if depth + 1 > MAX_DEPTH {
            self.out
                .problems
                .push(Problem::DepthExceeded { relative: rel });
            return;
        }
        self.visited.push((id, rel.clone()));
        self.visited_ids.insert(id);
        self.ancestors.push((id, rel.clone()));
        self.directory(abs, &rel, depth + 1);
        self.ancestors.pop();
    }
}
