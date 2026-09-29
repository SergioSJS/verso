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
    /// Length in bytes as the file system reports it (0 for a directory
    /// or a placeholder whose metadata could not be read): what a folder
    /// listing shows, never what a write trusts (that is the `Stamp`).
    pub len: u64,
    /// Last modification as the file system reports it; `None` where it
    /// gave none.
    pub modified: Option<std::time::SystemTime>,
    /// Creation as the file system reports it; `None` where it keeps none
    /// (some Linux file systems) or gave none.
    pub created: Option<std::time::SystemTime>,
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

pub(crate) fn is_default_ignored_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | "target"
            | "vendor"
            | "dist"
            | "build"
            | "out"
            | ".next"
            | ".nuxt"
            | ".turbo"
            | ".output"
            | "__pycache__"
            | ".venv"
            | "venv"
            | "env"
            | ".pytest_cache"
            | ".mypy_cache"
            | ".ruff_cache"
            | ".terraform"
            | "test-results"
            | "coverage"
            | "bower_components"
            | ".cache"
            | ".parcel-cache"
    )
}

#[derive(Debug, Clone)]
struct GitIgnorePattern {
    pattern: String,
    prefix: PathBuf,
}

impl GitIgnorePattern {
    fn matches(&self, relative_path: &Path, file_name: &str, is_dir: bool) -> bool {
        let pattern = self.pattern.as_str();
        let is_dir_only = pattern.ends_with('/');
        if is_dir_only && !is_dir {
            return false;
        }
        let clean_pat = pattern.trim_end_matches('/');
        if let Some(ext) = clean_pat.strip_prefix("*.") {
            return file_name.ends_with(&format!(".{ext}"));
        }
        if let Some(prefix) = clean_pat.strip_suffix('*') {
            if file_name.starts_with(prefix) {
                return true;
            }
        }
        if !clean_pat.contains('/') {
            return file_name == clean_pat;
        }
        if let Ok(rel) = relative_path.strip_prefix(&self.prefix) {
            let rel_str = rel.to_string_lossy();
            if rel_str == clean_pat || rel_str.starts_with(&format!("{clean_pat}/")) {
                return true;
            }
        }
        false
    }
}

struct Walker<'a> {
    root: &'a mut Root,
    out: Walk,
    /// Directories on the current path, root first: a loop is one of these.
    ancestors: Vec<(DirId, PathBuf)>,
    /// Every directory walked so far, with the path it was walked under.
    visited: Vec<(DirId, PathBuf)>,
    visited_ids: HashSet<DirId>,
    git_ignores: Vec<GitIgnorePattern>,
}

pub(crate) fn walk(root: &mut Root) -> Walk {
    let root_path = root.root_path().to_path_buf();
    let mut walker = Walker {
        root,
        out: Walk::default(),
        ancestors: Vec::new(),
        visited: Vec::new(),
        visited_ids: HashSet::new(),
        git_ignores: Vec::new(),
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
        let gitignore_path = absolute.join(".gitignore");
        let initial_patterns_len = self.git_ignores.len();
        if let Ok(content) = std::fs::read_to_string(&gitignore_path) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('!') {
                    continue;
                }
                self.git_ignores.push(GitIgnorePattern {
                    pattern: trimmed.to_string(),
                    prefix: relative.to_path_buf(),
                });
            }
        }

        let iter = match std::fs::read_dir(absolute) {
            Ok(iter) => iter,
            Err(error) => {
                self.out.problems.push(Problem::Io {
                    relative: relative.to_path_buf(),
                    error,
                });
                self.git_ignores.truncate(initial_patterns_len);
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
            let name_str = name.to_string_lossy();
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
                            len: 0,
                            modified: None,
                            created: None,
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
            let is_dir = meta.is_dir();
            if is_dir && is_default_ignored_dir(&name_str) {
                continue;
            }
            if self
                .git_ignores
                .iter()
                .any(|rule| rule.matches(&rel, &name_str, is_dir))
            {
                continue;
            }
            if is_dir {
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
                    len: meta.len(),
                    modified: meta.modified().ok(),
                    created: meta.created().ok(),
                });
            }
        }
        self.git_ignores.truncate(initial_patterns_len);
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
            len: 0,
            modified: meta.modified().ok(),
            created: meta.created().ok(),
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
