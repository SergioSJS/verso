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
//! [`Root`] that produced it and nothing else is promised. [`Entry::relative`]
//! is handed to the index next to the handle because the index is keyed by
//! path; it is not an identifier for anything across the contract.
//!
//! Decisions carried out here, all recorded in ADR 0044 and ADR 0043 on
//! 2026-09-22 (`docs/reference/fs-decision.md`):
//! - symlinks are the user's and are **followed**, files and directories
//!   alike, wherever they point — reading and writing go to the target; a
//!   loop is detected by the identity of the directories already entered,
//!   and the walk stops at depth [`MAX_DEPTH`] with an error, never
//!   silently;
//! - hidden entries (name starting with `.`) are not walked at any depth,
//!   nor are the relative paths the caller lists as ignored; an iCloud
//!   Drive placeholder `.Name.ext.icloud` is recognized before the hidden
//!   rule and reported as a placeholder for `Name.ext`;
//! - a placeholder — that sibling name, or a file whose `st_flags` carry
//!   `SF_DATALESS` on macOS — is "present, content unavailable", never
//!   absent, and is never opened or written: opening it makes the OS
//!   download it.

mod confine;
mod placeholder;
mod walk;
mod write;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::SystemTime;

pub use confine::ConfinementError;
pub use walk::{Entry, EntryKind, Problem, Walk};
pub use write::{WriteError, WriteReport};

/// Deepest directory nesting the walk enters. The root's children are at
/// depth 0; a directory at depth [`MAX_DEPTH`] is listed but not entered,
/// with [`Problem::DepthExceeded`]. Symlinks are followed (ADR 0044), so a
/// tree can be deeper than it looks; the cap is what turns a pathological
/// one into an error.
pub const MAX_DEPTH: usize = 64;

/// An opaque reference to an entry of the open folder, valid only for the
/// [`Root`] that handed it out: a handle from another root is refused, not
/// resolved. It carries no path (ADR 0026 rule 4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Handle {
    root: u32,
    index: u32,
}

/// What was on disk when a file was read: what a later write compares
/// before touching it (invariant 11, ADR 0012). Modified time and length
/// alone miss a rewrite that keeps both — `cp -p`, `rsync`, a restore, a
/// sync client — so the content's hash is part of it too, and the write
/// re-reads the file to compare it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Stamp {
    pub modified: SystemTime,
    pub len: u64,
    /// FNV-1a of the content, 64 bits. Not cryptographic: it tells "same
    /// bytes as read" from "rewritten", which is all invariant 11 asks.
    pub hash: u64,
}

impl Stamp {
    fn of(meta: &std::fs::Metadata, content: &[u8]) -> Result<Self, std::io::Error> {
        Ok(Self {
            modified: meta.modified()?,
            len: meta.len(),
            hash: fnv1a(content),
        })
    }
}

/// FNV-1a, 64-bit: a few lines, no dependency, good enough to tell two
/// contents apart for invariant 11.
pub(crate) fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
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

static ROOTS: AtomicU32 = AtomicU32::new(1);

/// An open folder: the entry edge where a path string is accepted, and the
/// owner of every [`Handle`].
#[derive(Debug)]
pub struct Root {
    id: u32,
    path: PathBuf,
    /// Relative paths the caller asked to ignore, confined and normalized,
    /// on top of the hidden rule (ADR 0044; the list itself lives in the
    /// config outside the tree, ADR 0011, and is handed in here).
    ignored: Vec<PathBuf>,
    /// Handle index → path relative to the root, and the reverse.
    table: Vec<PathBuf>,
    by_path: HashMap<PathBuf, u32>,
}

impl Root {
    /// Open a folder. `path` is the one place a path string enters; it must
    /// be a directory. Every ignored path is confined like a request: an
    /// absolute path or a `..` in the list is an error here, not a silent
    /// no-op. Nothing is read yet.
    pub fn open(path: impl Into<PathBuf>, ignored: Vec<PathBuf>) -> Result<Self, std::io::Error> {
        let path = path.into();
        let meta = std::fs::metadata(&path)?;
        if !meta.is_dir() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotADirectory,
                "the root must be a directory",
            ));
        }
        let ignored = ignored
            .iter()
            .map(|p| {
                confine::confine(p).map_err(|e| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        format!("ignored path {}: {e}", p.display()),
                    )
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            id: ROOTS.fetch_add(1, Ordering::Relaxed),
            path,
            ignored,
            table: Vec::new(),
            by_path: HashMap::new(),
        })
    }

    /// The handle for a path relative to the root, confined first: an
    /// absolute path, a `..` component or a NUL byte is refused; so is a
    /// path the walk would not list — a hidden entry or an ignored path —
    /// because the only door plugins and agents have is this one
    /// (provisional: ADR 0044). Nothing on disk is checked here; a handle
    /// to a file that does not exist is legal and its read fails later with
    /// `NotFound`.
    pub fn handle(&mut self, relative: &Path) -> Result<Handle, ConfinementError> {
        let relative = confine::confine(relative)?;
        if relative
            .components()
            .any(|c| c.as_os_str().as_encoded_bytes().starts_with(b"."))
        {
            return Err(ConfinementError::Hidden);
        }
        if self.is_ignored(&relative) {
            return Err(ConfinementError::Ignored);
        }
        Ok(self.intern(relative))
    }

    /// Walk the folder: every entry that is not ignored, in a deterministic
    /// order (sorted by name at each level), with the problems met on the
    /// way. Symlinks are followed (ADR 0044).
    pub fn walk(&mut self) -> Walk {
        walk::walk(self)
    }

    /// Read a file's content and its [`Stamp`]. A placeholder — a dataless
    /// file, a `.Name.ext.icloud` entry, or `Name.ext` whose `.icloud`
    /// sibling stands in for it — is [`ReadError::Unavailable`] and is never
    /// opened (ADR 0043).
    pub fn read(&self, handle: Handle) -> Result<(Vec<u8>, Stamp), ReadError> {
        let path = self
            .path_of(handle)
            .ok_or(ReadError::UnknownHandle(handle))?;
        if placeholder::stands_in(&path).map_err(ReadError::Io)? {
            return Err(ReadError::Unavailable);
        }
        let bytes = std::fs::read(&path).map_err(ReadError::Io)?;
        let meta = std::fs::metadata(&path).map_err(ReadError::Io)?;
        let stamp = Stamp::of(&meta, &bytes).map_err(ReadError::Io)?;
        Ok((bytes, stamp))
    }

    /// Replace a file's content atomically (ADR 0029): temporary file in the
    /// same directory as the target, `fsync` of the file, `rename`, `fsync`
    /// of the directory. A symlink is followed: the write lands on what it
    /// points to and the link stays (ADR 0044). Refuses to write if the file
    /// on disk is not the one that was read (`expected`, invariant 11) or
    /// is a placeholder (ADR 0043). Returns what could and could not be
    /// preserved.
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
        if let Some(&index) = self.by_path.get(&relative) {
            return Handle {
                root: self.id,
                index,
            };
        }
        let index = u32::try_from(self.table.len()).unwrap_or(u32::MAX);
        self.table.push(relative.clone());
        self.by_path.insert(relative, index);
        Handle {
            root: self.id,
            index,
        }
    }

    fn path_of(&self, handle: Handle) -> Option<PathBuf> {
        if handle.root != self.id {
            return None;
        }
        self.table
            .get(handle.index as usize)
            .map(|rel| self.path.join(rel))
    }

    pub(crate) fn root_path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn is_ignored(&self, rel: &Path) -> bool {
        self.ignored.iter().any(|i| rel == i || rel.starts_with(i))
    }
}
