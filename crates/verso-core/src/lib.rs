// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The orchestrator (ADR 0028): opens a folder through `verso-fs`, parses
//! notes with `verso-dialect`, keeps `verso-index` current, and answers
//! the questions the CLI and, later, the contract ask. Phase 1, feature 4.
//!
//! This crate never touches the folder itself: the folder is `verso-fs`'s,
//! the index file is `verso-index`'s, and the configuration directory
//! (ADR 0011) is only computed here — its creation belongs to the index
//! that lives in it. Its one `std::fs` exception is the index's sidecar
//! ([`Sidecar`], `sidecar.rs`, `clippy.toml`), a file of that directory.
//!
//! Provisional (`docs/reference/cli-decision.md`, the maintainer decides):
//! where the configuration directory is ([`config_dir`]); that a second
//! `index` run re-reads every note and skips the ones whose stamp the
//! index already has; that a note under a path the walk reported a
//! problem for, or a placeholder (ADR 0043), is never removed from the
//! index.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use verso_fs::{ConfinementError, EntryKind, Problem, ReadError, Root};
use verso_index::{Backlink, Block, Heading, Hit, Index, Link, NoteStamp, Unresolved};

mod sidecar;
pub use sidecar::Sidecar;

/// Why the workspace could not be opened or refreshed.
#[derive(Debug)]
pub enum CoreError {
    Folder(std::io::Error),
    Index(verso_index::IndexError),
    /// No configuration directory can be named: neither `VERSO_CONFIG_DIR`
    /// nor `XDG_CONFIG_HOME` nor `HOME` is set. Never a relative fallback.
    NoConfigDir,
    /// A path a caller sent cannot name a note of the folder (ADR 0044:
    /// absolute, `..`, NUL, hidden, ignored). Checked on every path that
    /// crosses the edge, whether the call reads the disk or the index.
    Confined(ConfinementError),
    /// The note could not be read from the folder.
    Read(ReadError),
    /// The index was refreshed but its sidecar could not be written.
    Sidecar(std::io::Error),
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Folder(e) => write!(f, "folder: {e}"),
            Self::Index(e) => write!(f, "{e}"),
            Self::NoConfigDir => write!(
                f,
                "no configuration directory: HOME, XDG_CONFIG_HOME and VERSO_CONFIG_DIR are all unset"
            ),
            Self::Confined(e) => write!(f, "{e}"),
            Self::Read(e) => write!(f, "read: {e}"),
            Self::Sidecar(e) => write!(f, "index sidecar: {e}"),
        }
    }
}

impl std::error::Error for CoreError {}

/// The configuration directory (ADR 0011): `$VERSO_CONFIG_DIR` if set (tests,
/// sensitive setups), else `$XDG_CONFIG_HOME/verso` if set, else
/// `~/Library/Application Support/verso` on macOS and `~/.config/verso`
/// elsewhere. Without any of the three it is an error, never a path
/// relative to the current directory. Provisional.
pub fn config_dir() -> Result<PathBuf, CoreError> {
    let get = |name: &str| std::env::var_os(name).filter(|v| !v.is_empty());
    config_dir_from(
        get("VERSO_CONFIG_DIR").as_deref(),
        get("XDG_CONFIG_HOME").as_deref(),
        get("HOME").map(PathBuf::from).as_deref(),
        cfg!(target_os = "macos"),
    )
    .ok_or(CoreError::NoConfigDir)
}

/// [`config_dir`] as a pure function of its inputs, for tests. `None`
/// when nothing names a directory.
#[must_use]
pub fn config_dir_from(
    verso: Option<&std::ffi::OsStr>,
    xdg: Option<&std::ffi::OsStr>,
    home: Option<&Path>,
    macos: bool,
) -> Option<PathBuf> {
    if let Some(dir) = verso {
        return Some(PathBuf::from(dir));
    }
    if let Some(xdg) = xdg {
        return Some(PathBuf::from(xdg).join("verso"));
    }
    let home = home?;
    Some(if macos {
        home.join("Library")
            .join("Application Support")
            .join("verso")
    } else {
        home.join(".config").join("verso")
    })
}

/// A problem the walk reported, in the shape the CLI and the contract
/// print: the path is relative to the folder; the `Io` text is the
/// operating system's and is not translated.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WalkProblem {
    /// A symlink loop: `path` leads back to `first_seen`, higher up.
    Loop { path: String, first_seen: String },
    /// A directory already walked as `first_seen`; walked once.
    Duplicate { path: String, first_seen: String },
    /// Nesting deeper than `verso-fs` descends.
    TooDeep { path: String },
    /// The entry could not be examined.
    Io {
        path: String,
        kind: String,
        error: String,
    },
}

impl WalkProblem {
    /// The path the problem is about; everything under it is protected
    /// from removal on that run.
    #[must_use]
    pub fn path(&self) -> &str {
        match self {
            Self::Loop { path, .. }
            | Self::Duplicate { path, .. }
            | Self::TooDeep { path }
            | Self::Io { path, .. } => path,
        }
    }
}

impl From<&Problem> for WalkProblem {
    fn from(problem: &Problem) -> Self {
        let text = |p: &Path| p.to_string_lossy().into_owned();
        match problem {
            Problem::Loop {
                relative,
                first_seen,
            } => Self::Loop {
                path: text(relative),
                first_seen: text(first_seen),
            },
            Problem::Duplicate {
                relative,
                first_seen,
            } => Self::Duplicate {
                path: text(relative),
                first_seen: text(first_seen),
            },
            Problem::DepthExceeded { relative } => Self::TooDeep {
                path: text(relative),
            },
            Problem::Io { relative, error } => Self::Io {
                path: text(relative),
                kind: error.kind().to_string(),
                error: error.to_string(),
            },
        }
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
    /// Problems the walk reported.
    pub problems: Vec<WalkProblem>,
}

/// A note's text as read from the folder now, with what the index knows
/// about its positions (feature 6: `read_note`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteText {
    /// The path relative to the folder, with `.md`.
    pub path: String,
    /// The lines of the file, without their line endings; line `n` of the
    /// citation is `lines[n - 1]` (spec §4.4).
    pub lines: Vec<String>,
    /// The file differs from the version the index holds (or the index
    /// does not hold it): graph answers may predate this text.
    pub stale: bool,
    /// The index holds this note only as an unverified last version
    /// (ADR 0043): a placeholder stood where it was.
    pub unverified: bool,
    pub headings: Vec<Heading>,
    pub blocks: Vec<Block>,
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

/// `folder` absolute and normalized: `.` and a trailing separator
/// dropped, so `vault`, `vault/` and `vault/.` key one index. `..` is
/// kept: resolving it would mean following symlinks, which is `verso-fs`'s
/// business (ADR 0044).
fn normalized(folder: &Path) -> Result<PathBuf, std::io::Error> {
    let absolute = std::path::absolute(folder)?;
    Ok(absolute
        .components()
        .filter(|c| !matches!(c, Component::CurDir))
        .collect())
}

fn seconds_since_epoch(t: std::time::SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

fn note_stamp(stamp: &verso_fs::Stamp) -> NoteStamp {
    NoteStamp {
        modified: seconds_since_epoch(stamp.modified),
        len: stamp.len,
        hash: stamp.hash,
    }
}

impl Workspace {
    /// Open `folder` with its index under [`config_dir`] (or the given
    /// directory). Nothing is read yet.
    pub fn open(folder: &Path, config: Option<&Path>) -> Result<Self, CoreError> {
        let root = Root::open(folder, Vec::new()).map_err(CoreError::Folder)?;
        let folder = normalized(folder).map_err(CoreError::Folder)?;
        let config = match config {
            Some(dir) => dir.to_path_buf(),
            None => config_dir()?,
        };
        let file = config.join("index").join(Index::file_name_for(&folder));
        let index = Index::open(file).map_err(CoreError::Index)?;
        Ok(Self {
            folder,
            root,
            index,
        })
    }

    /// The folder, absolute and normalized.
    #[must_use]
    pub fn folder(&self) -> &Path {
        &self.folder
    }

    /// Where the index file is.
    #[must_use]
    pub fn index_path(&self) -> &Path {
        self.index.path()
    }

    /// Walk the folder and bring the index up to date. A note the walk no
    /// longer lists is removed, unless it lies under a path the walk
    /// reported a problem for: an unreadable directory does not empty the
    /// graph beneath it.
    pub fn index(&mut self) -> Result<IndexReport, CoreError> {
        let walk = self.root.walk();
        let mut report = IndexReport::default();
        let mut present: HashSet<String> = HashSet::new();
        for entry in &walk.entries {
            let relative = entry.relative.to_string_lossy().into_owned();
            match &entry.kind {
                EntryKind::Note => {
                    present.insert(relative.clone());
                    match self.root.read(entry.handle) {
                        Ok((bytes, stamp)) => {
                            let stamp = note_stamp(&stamp);
                            let same = self.index.stamp_of(&relative).map_err(CoreError::Index)?
                                == Some(stamp);
                            // A row left unverified by a placeholder is
                            // re-read even when its stamp matches: reading
                            // the note is what verifies it (ADR 0043).
                            let unverified = self
                                .index
                                .is_unverified(&relative)
                                .map_err(CoreError::Index)?
                                .unwrap_or(false);
                            if same && !unverified {
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
                        Err(verso_fs::ReadError::Unavailable) => {
                            // Present, content unavailable (ADR 0043): the
                            // last known version stays, marked unverified.
                            self.index
                                .mark_placeholder(&relative)
                                .map_err(CoreError::Index)?;
                            report.placeholders += 1;
                        }
                        Err(e) => report.unreadable.push((relative, e.to_string())),
                    }
                }
                EntryKind::Placeholder { of } => {
                    // Present, content unavailable: the last known version
                    // of the real file stays, marked unverified (ADR 0043).
                    let real = of.to_string_lossy().into_owned();
                    if real.ends_with(".md") {
                        self.index
                            .mark_placeholder(&real)
                            .map_err(CoreError::Index)?;
                    }
                    present.insert(real);
                    report.placeholders += 1;
                }
                EntryKind::File | EntryKind::Directory => {}
            }
        }
        report.problems = walk.problems.iter().map(WalkProblem::from).collect();
        // Not walked because of a problem: nothing under it is gone. The
        // root itself (an empty path) protects every note.
        let protected: Vec<&str> = report.problems.iter().map(WalkProblem::path).collect();
        let under_problem = |note: &str| {
            protected.iter().any(|p| {
                p.is_empty()
                    || note == *p
                    || note
                        .strip_prefix(p)
                        .is_some_and(|rest| rest.starts_with('/'))
            })
        };
        for known in self.index.notes().map_err(CoreError::Index)? {
            if !present.contains(&known)
                && !under_problem(&known)
                && self.index.remove(&known).map_err(CoreError::Index)?
            {
                report.removed += 1;
            }
        }
        let now = seconds_since_epoch(std::time::SystemTime::now());
        self.index
            .set_root(&self.folder.to_string_lossy(), now)
            .map_err(CoreError::Index)?;
        // Beside the index, so that the directory can say which folder
        // each index belongs to; written from the first run, since a
        // sidecar that starts later cannot describe what already exists.
        Sidecar {
            folder: self.folder.clone(),
            indexed_at: now,
            schema: verso_index::SCHEMA_VERSION,
        }
        .write(self.index.path())
        .map_err(CoreError::Sidecar)?;
        Ok(report)
    }

    pub fn search(&self, words: &str, limit: usize) -> Result<Vec<Hit>, CoreError> {
        self.index.search(words, limit).map_err(CoreError::Index)
    }

    /// The path of a note as the index keys it — relative, with `.md` —
    /// after confinement: a path that cannot name a file of the folder is
    /// refused here, whether the caller goes on to the disk or only to the
    /// index (ADR 0044; `docs/reference/mcp-decision.md` §4.3).
    fn note_path(&mut self, note: &str) -> Result<(String, verso_fs::Handle), CoreError> {
        let path = if note.ends_with(".md") {
            note.to_owned()
        } else {
            format!("{note}.md")
        };
        let handle = self
            .root
            .handle(Path::new(&path))
            .map_err(CoreError::Confined)?;
        Ok((path, handle))
    }

    fn known(&self, path: &str) -> Result<bool, CoreError> {
        Ok(self
            .index
            .stamp_of(path)
            .map_err(CoreError::Index)?
            .is_some())
    }

    /// Backlinks of a note given by its path relative to the folder, with
    /// or without `.md`; `None` when the index does not know the note.
    pub fn backlinks(&mut self, note: &str) -> Result<Option<Vec<Backlink>>, CoreError> {
        let (path, _) = self.note_path(note)?;
        if !self.known(&path)? {
            return Ok(None);
        }
        self.index
            .backlinks(&path)
            .map(Some)
            .map_err(CoreError::Index)
    }

    /// The links a note makes, with what each resolves to; `None` when the
    /// index does not know the note.
    pub fn links(&mut self, note: &str) -> Result<Option<Vec<Link>>, CoreError> {
        let (path, _) = self.note_path(note)?;
        if !self.known(&path)? {
            return Ok(None);
        }
        self.index
            .links_of(&path)
            .map(Some)
            .map_err(CoreError::Index)
    }

    /// Whether the index holds the note only as an unverified last version
    /// (ADR 0043); `None` when it does not know the note.
    pub fn is_unverified(&mut self, note: &str) -> Result<Option<bool>, CoreError> {
        let (path, _) = self.note_path(note)?;
        self.index.is_unverified(&path).map_err(CoreError::Index)
    }

    /// The note's text as it is on disk now, through `verso-fs` (a
    /// placeholder answers `Read(Unavailable)`, never empty text — ADR
    /// 0043), with the positions the index has for it and whether the
    /// index is behind the file.
    pub fn read_note(&mut self, note: &str) -> Result<NoteText, CoreError> {
        let (path, handle) = self.note_path(note)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let known = self.index.stamp_of(&path).map_err(CoreError::Index)?;
        let stale = known != Some(note_stamp(&stamp));
        let unverified = self
            .index
            .is_unverified(&path)
            .map_err(CoreError::Index)?
            .unwrap_or(false);
        let content = String::from_utf8_lossy(&bytes);
        Ok(NoteText {
            lines: content.lines().map(str::to_owned).collect(),
            stale,
            unverified,
            headings: self.index.headings_of(&path).map_err(CoreError::Index)?,
            blocks: self.index.blocks_of(&path).map_err(CoreError::Index)?,
            path,
        })
    }

    pub fn unresolved(&self) -> Result<Vec<Unresolved>, CoreError> {
        self.index.unresolved().map_err(CoreError::Index)
    }

    pub fn notes(&self) -> Result<Vec<String>, CoreError> {
        self.index.notes().map_err(CoreError::Index)
    }
}
