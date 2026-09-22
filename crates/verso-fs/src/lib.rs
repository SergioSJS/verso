// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The one crate that touches the files of the open folder (ADR 0026 rule 5,
//! ADR 0028): walking it, confining every path to it, reading, and writing
//! atomically. Phase 1, feature 2. The watcher comes later (ADR 0044).
//!
//! A path as a string exists at the entry edge — [`Root::open`] takes one —
//! and inside this crate. Everything that crosses out is a [`Handle`]
//! (ADR 0026 rule 4); what a handle identifies beyond this process is
//! decided before feature 6 (ADR 0044), so a handle is valid for the
//! [`Root`] that produced it and nothing else is promised.
//!
//! Decisions carried out here, all recorded in ADR 0044 and ADR 0043 on
//! 2026-09-22 (`docs/reference/fs-decision.md`):
//! - symlinks are the user's and are **followed**, files and directories
//!   alike, wherever they point; a loop is detected by the identity of the
//!   directories already entered, and the walk stops at depth
//!   [`MAX_DEPTH`] with an error, never silently;
//! - hidden entries (name starting with `.`) are not walked at any depth,
//!   nor are the relative paths the caller lists as ignored; an iCloud
//!   Drive placeholder `.Name.ext.icloud` is recognized before the hidden
//!   rule and reported as a placeholder for `Name.ext`;
//! - a placeholder — that sibling name, or a file whose `st_flags` carry
//!   `SF_DATALESS` on macOS — is "present, content unavailable", never
//!   absent, and is never opened: opening it makes the OS download it.

mod confine;
mod placeholder;
mod walk;
mod write;

use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub use confine::ConfinementError;
pub use walk::{Entry, EntryKind, Problem, Walk};
pub use write::{WriteError, WriteReport};

/// Deepest directory nesting the walk enters, counted from the root at 0.
/// Beyond it the walk reports [`Problem::DepthExceeded`] and does not
/// descend. Symlinks are followed (ADR 0044), so a tree can be deeper than
/// it looks; the cap is what turns a pathological one into an error.
pub const MAX_DEPTH: usize = 64;

/// An opaque reference to an entry of the open folder, valid for the
/// [`Root`] that handed it out. It carries no path (ADR 0026 rule 4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Handle(u32);

/// What was on disk when a file was read: the two things a later write
/// compares before touching it (invariant 11, ADR 0012).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Stamp {
    pub modified: SystemTime,
    pub len: u64,
}

/// Why a read did not return content.
#[derive(Debug)]
pub enum ReadError {
    /// The handle does not belong to this root.
    UnknownHandle(Handle),
    /// The file is an on-demand storage placeholder: present, content not
    /// downloaded (ADR 0043). Never a deletion.
    Unavailable,
    Io(std::io::Error),
}

impl std::fmt::Display for ReadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownHandle(h) => write!(f, "unknown handle {h:?}"),
            Self::Unavailable => write!(f, "placeholder: content not available"),
            Self::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ReadError {}

/// An open folder: the entry edge where a path string is accepted, and the
/// owner of every [`Handle`].
#[derive(Debug)]
pub struct Root {
    path: PathBuf,
    /// Relative paths the caller asked to ignore, on top of the hidden rule
    /// (ADR 0044; the list itself lives in the config outside the tree,
    /// ADR 0011, and is handed in here).
    ignored: Vec<PathBuf>,
    /// Handle → path relative to the root. A handle is an index here.
    table: Vec<PathBuf>,
}

impl Root {
    /// Open a folder. `path` is the one place a path string enters; it must
    /// be a directory. Nothing is read yet.
    pub fn open(path: impl Into<PathBuf>, ignored: Vec<PathBuf>) -> Result<Self, std::io::Error> {
        let path = path.into();
        let meta = std::fs::metadata(&path)?;
        if !meta.is_dir() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotADirectory,
                "the root must be a directory",
            ));
        }
        Ok(Self {
            path,
            ignored,
            table: Vec::new(),
        })
    }

    /// The handle for a path relative to the root, confined first: an
    /// absolute path, a `..` component or a NUL byte is refused. Nothing on
    /// disk is checked here; a handle to a file that does not exist is
    /// legal and its read fails later with `NotFound`.
    pub fn handle(&mut self, relative: &Path) -> Result<Handle, ConfinementError> {
        let relative = confine::confine(relative)?;
        Ok(self.intern(relative))
    }

    /// Walk the folder: every entry that is not ignored, in a deterministic
    /// order (sorted by name at each level), with the problems met on the
    /// way. Symlinks are followed (ADR 0044).
    pub fn walk(&mut self) -> Walk {
        walk::walk(self)
    }

    /// Read a file's content and its [`Stamp`]. A placeholder is reported as
    /// [`ReadError::Unavailable`] without being opened (ADR 0043).
    pub fn read(&self, handle: Handle) -> Result<(Vec<u8>, Stamp), ReadError> {
        let path = self
            .path_of(handle)
            .ok_or(ReadError::UnknownHandle(handle))?;
        let meta = std::fs::symlink_metadata(&path).map_err(ReadError::Io)?;
        let meta = if meta.is_symlink() {
            std::fs::metadata(&path).map_err(ReadError::Io)?
        } else {
            meta
        };
        if placeholder::is_dataless(&meta) {
            return Err(ReadError::Unavailable);
        }
        let stamp = Stamp {
            modified: meta.modified().map_err(ReadError::Io)?,
            len: meta.len(),
        };
        let bytes = std::fs::read(&path).map_err(ReadError::Io)?;
        Ok((bytes, stamp))
    }

    /// Replace a file's content atomically (ADR 0029): temporary file in the
    /// same directory, `fsync` of the file, `rename`, `fsync` of the
    /// directory. Refuses to write if the file on disk is not the one that
    /// was read (`expected`, invariant 11). Returns what could and could not
    /// be preserved.
    pub fn write(
        &self,
        handle: Handle,
        content: &[u8],
        expected: &Stamp,
    ) -> Result<WriteReport, WriteError> {
        let path = self
            .path_of(handle)
            .ok_or(WriteError::UnknownHandle(handle))?;
        write::write_atomically(&path, content, expected)
    }

    fn intern(&mut self, relative: PathBuf) -> Handle {
        if let Some(i) = self.table.iter().position(|p| *p == relative) {
            return Handle(u32::try_from(i).unwrap_or(u32::MAX));
        }
        self.table.push(relative);
        Handle(u32::try_from(self.table.len() - 1).unwrap_or(u32::MAX))
    }

    fn path_of(&self, handle: Handle) -> Option<PathBuf> {
        self.table
            .get(handle.0 as usize)
            .map(|rel| self.path.join(rel))
    }

    pub(crate) fn root_path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn ignored(&self) -> &[PathBuf] {
        &self.ignored
    }
}
