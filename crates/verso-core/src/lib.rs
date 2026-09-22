// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The orchestrator (ADR 0028): opens a folder through `verso-fs`, parses
//! notes with `verso-dialect`, keeps `verso-index` current, and answers
//! the questions the CLI and, later, the contract ask. Phase 1, feature 4.
//!
//! This crate never touches the folder itself and needs no `std::fs` call:
//! the folder is `verso-fs`'s, the index file is `verso-index`'s, and the
//! configuration directory (ADR 0011) is only computed here — its
//! creation belongs to the index that lives in it.
//!
//! Provisional (`docs/reference/cli-decision.md`, the maintainer decides):
//! where the configuration directory is ([`config_dir`]); that a second
//! `index` run re-reads every note and skips the ones whose stamp the
//! index already has; that a note the walk reported a problem for, or a
//! placeholder (ADR 0043), is never removed from the index.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use verso_fs::{EntryKind, Root};
use verso_index::{Backlink, Hit, Index, NoteStamp, Unresolved};

/// Why the workspace could not be opened or refreshed.
#[derive(Debug)]
pub enum CoreError {
    Folder(std::io::Error),
    Index(verso_index::IndexError),
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Folder(e) => write!(f, "folder: {e}"),
            Self::Index(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for CoreError {}

/// The configuration directory (ADR 0011): `$VERSO_CONFIG_DIR` if set (tests,
/// sensitive setups), else `$XDG_CONFIG_HOME/verso` if set, else
/// `~/Library/Application Support/verso` on macOS and `~/.config/verso`
/// elsewhere. Provisional.
#[must_use]
pub fn config_dir() -> PathBuf {
    let get = |name: &str| std::env::var_os(name).filter(|v| !v.is_empty());
    config_dir_from(
        get("VERSO_CONFIG_DIR").as_deref(),
        get("XDG_CONFIG_HOME").as_deref(),
        &get("HOME").map(PathBuf::from).unwrap_or_default(),
        cfg!(target_os = "macos"),
    )
}

/// [`config_dir`] as a pure function of its inputs, for tests.
#[must_use]
pub fn config_dir_from(
    verso: Option<&std::ffi::OsStr>,
    xdg: Option<&std::ffi::OsStr>,
    home: &Path,
    macos: bool,
) -> PathBuf {
    if let Some(dir) = verso {
        return PathBuf::from(dir);
    }
    if let Some(xdg) = xdg {
        return PathBuf::from(xdg).join("verso");
    }
    if macos {
        home.join("Library")
            .join("Application Support")
            .join("verso")
    } else {
        home.join(".config").join("verso")
    }
}

/// What an `index` run did.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct IndexReport {
    /// Notes read and stored (new or changed).
    pub indexed: usize,
    /// Notes whose stamp the index already had.
    pub unchanged: usize,
    /// Notes the index had and the walk no longer lists.
    pub removed: usize,
    /// Placeholders met: present, content unavailable, never removed.
    pub placeholders: usize,
    /// Notes the walk listed but that could not be read, with the error.
    pub unreadable: Vec<(String, String)>,
    /// Problems the walk reported, as text.
    pub problems: Vec<String>,
}

/// An open folder with its index.
pub struct Workspace {
    folder: PathBuf,
    root: Root,
    index: Index,
}

impl std::fmt::Debug for Workspace {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Workspace")
            .field("folder", &self.folder)
            .finish()
    }
}

impl Workspace {
    /// Open `folder` with its index under `config_dir()` (or the given
    /// directory). Nothing is read yet.
    pub fn open(folder: &Path, config: Option<&Path>) -> Result<Self, CoreError> {
        let root = Root::open(folder, Vec::new()).map_err(CoreError::Folder)?;
        let folder = std::path::absolute(folder).map_err(CoreError::Folder)?;
        let config = config.map_or_else(config_dir, Path::to_path_buf);
        let file = config.join("index").join(Index::file_name_for(&folder));
        let index = Index::open(file).map_err(CoreError::Index)?;
        Ok(Self {
            folder,
            root,
            index,
        })
    }

    /// The folder, absolute.
    #[must_use]
    pub fn folder(&self) -> &Path {
        &self.folder
    }

    /// Walk the folder and bring the index up to date.
    pub fn index(&mut self) -> Result<IndexReport, CoreError> {
        let walk = self.root.walk();
        let mut report = IndexReport::default();
        let mut present: Vec<String> = Vec::new();
        for entry in &walk.entries {
            let relative = entry.relative.to_string_lossy().into_owned();
            match &entry.kind {
                EntryKind::Note => {
                    present.push(relative.clone());
                    match self.root.read(entry.handle) {
                        Ok((bytes, stamp)) => {
                            let stamp = NoteStamp {
                                modified: stamp
                                    .modified
                                    .duration_since(UNIX_EPOCH)
                                    .map(|d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
                                    .unwrap_or(0),
                                len: stamp.len,
                                hash: stamp.hash,
                            };
                            if self.index.stamp_of(&relative).map_err(CoreError::Index)?
                                == Some(stamp)
                            {
                                report.unchanged += 1;
                                continue;
                            }
                            let content = String::from_utf8_lossy(&bytes);
                            let parsed = verso_dialect::parse(&content);
                            self.index
                                .upsert(&relative, stamp, &content, &parsed)
                                .map_err(CoreError::Index)?;
                            report.indexed += 1;
                        }
                        Err(verso_fs::ReadError::Unavailable) => report.placeholders += 1,
                        Err(e) => report.unreadable.push((relative, e.to_string())),
                    }
                }
                EntryKind::Placeholder { of } => {
                    // Present, content unavailable: the index keeps what it
                    // had for the real file (ADR 0043).
                    present.push(of.to_string_lossy().into_owned());
                    report.placeholders += 1;
                }
                EntryKind::File | EntryKind::Directory => {}
            }
        }
        for problem in &walk.problems {
            report.problems.push(format!("{problem:?}"));
            if let verso_fs::Problem::Io { relative, .. } = problem {
                // Not walked because of an error: do not treat as gone.
                present.push(relative.to_string_lossy().into_owned());
            }
        }
        for known in self.index.notes().map_err(CoreError::Index)? {
            if !present.contains(&known) && self.index.remove(&known).map_err(CoreError::Index)? {
                report.removed += 1;
            }
        }
        Ok(report)
    }

    pub fn search(&self, words: &str, limit: usize) -> Result<Vec<Hit>, CoreError> {
        self.index.search(words, limit).map_err(CoreError::Index)
    }

    /// Backlinks of a note given by its path relative to the folder, with
    /// or without `.md`.
    pub fn backlinks(&self, note: &str) -> Result<Vec<Backlink>, CoreError> {
        let path = if note.ends_with(".md") {
            note.to_owned()
        } else {
            format!("{note}.md")
        };
        self.index.backlinks(&path).map_err(CoreError::Index)
    }

    pub fn unresolved(&self) -> Result<Vec<Unresolved>, CoreError> {
        self.index.unresolved().map_err(CoreError::Index)
    }

    pub fn notes(&self) -> Result<Vec<String>, CoreError> {
        self.index.notes().map_err(CoreError::Index)
    }
}
