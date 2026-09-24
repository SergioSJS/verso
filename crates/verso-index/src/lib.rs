// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The index of the open folder: SQLite with FTS5 (ADR 0023), a cache that
//! loses no data when deleted (ADR 0011), kept outside the tree (ADR 0011,
//! ADR 0046). Phase 1, feature 3.
//!
//! This crate opens the index file and nothing else (ADR 0026 rule 5,
//! delimited scope): it never sees the folder. Whoever orchestrates reads a
//! note through `verso-fs`, parses it with `verso-dialect`, and hands the
//! report here with the note's relative path and stamp.
//!
//! What is provisional, recorded in `docs/reference/index-decision.md` and
//! marked so in the ADRs, decided by the maintainer on waking:
//! - how `[[target]]` becomes a note ([`keys`]: case-insensitive, NFC, `.md`
//!   dropped; a path from the root first, then a basename; several
//!   candidates → the first by path order; a frontmatter alias does not
//!   resolve; an embed counts as a link) — observed in Obsidian 1.13.7
//!   through its CLI on 2026-09-22;
//! - the FTS5 tokenizer `unicode61 remove_diacritics 2`;
//! - the index file at mode `0600` in a `0700` directory, excluded from
//!   Time Machine.

mod keys;
mod moves;
mod schema;
mod search;
mod store;

use std::path::{Path, PathBuf};

use rusqlite::Connection;

pub use keys::{file_key, note_keys, target_key};
pub use search::Hit;
pub use store::{Backlink, Block, Heading, Link, NoteStamp, Unresolved, VaultLink};

/// The schema version this build writes. The sidecar beside the index
/// records it (`docs/reference/index-decision.md` §2.4); a different
/// version on open means a rebuild (`schema.rs`).
pub const SCHEMA_VERSION: i64 = schema::VERSION;

/// Why the index could not do something.
#[derive(Debug)]
pub enum IndexError {
    Sqlite(rusqlite::Error),
    Io(std::io::Error),
    /// The index disagrees with itself; rebuilding it is the answer (it
    /// is a cache, ADR 0011). The string says what was found.
    Corrupt(String),
}

impl std::fmt::Display for IndexError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Sqlite(e) => write!(f, "index: {e}"),
            Self::Io(e) => write!(f, "index file: {e}"),
            Self::Corrupt(what) => write!(f, "index is corrupt: {what}"),
        }
    }
}

impl std::error::Error for IndexError {}

impl From<rusqlite::Error> for IndexError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Sqlite(e)
    }
}

impl From<std::io::Error> for IndexError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

/// An open index. One per folder; the file is the caller's to place (the
/// configuration directory is `verso-core`'s, ADR 0011).
pub struct Index {
    conn: Connection,
    path: PathBuf,
}

impl std::fmt::Debug for Index {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Index").field("path", &self.path).finish()
    }
}

impl Index {
    /// Open or create the index file at `path`, creating its directory
    /// (mode `0700`) and setting the file to `0600`; the file is excluded
    /// from Time Machine. An index whose schema is not the current one is
    /// rebuilt from scratch: it is a cache (ADR 0011).
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, IndexError> {
        let path = path.into();
        // The caller passes `<config>/index/<file>` (ADR 0011); a bare
        // file name has an empty parent, which is the current directory
        // and nobody's to chmod.
        if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
            std::fs::create_dir_all(dir)?;
            restrict(dir, 0o700)?;
        }
        let conn = Connection::open(&path)?;
        // The chmod comes before WAL is switched on: the `-wal` and `-shm`
        // companions inherit the database file's mode when they are
        // created, so reordering these two lines would widen them.
        restrict(&path, 0o600)?;
        exclude_from_backup(&path);
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        schema::ensure(&conn)?;
        Ok(Self { conn, path })
    }

    /// An index that lives only in memory: for tests and for a folder the
    /// user does not want indexed on disk (later option, ADR 0046).
    pub fn in_memory() -> Result<Self, IndexError> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        schema::ensure(&conn)?;
        Ok(Self {
            conn,
            path: PathBuf::from(":memory:"),
        })
    }

    /// Where the file is.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The file name for a folder's index under the configuration
    /// directory: a readable prefix from the folder's name plus a hash of
    /// its absolute path, so two folders never share a file and the name
    /// says which folder it was.
    #[must_use]
    pub fn file_name_for(folder: &Path) -> String {
        let name = folder
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "root".to_owned());
        let safe: String = name
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .take(32)
            .collect();
        let bytes = folder.as_os_str().as_encoded_bytes();
        format!("{safe}-{:016x}.sqlite", fnv1a(bytes))
    }
}

fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

#[cfg(unix)]
fn restrict(path: &Path, mode: u32) -> Result<(), std::io::Error> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))
}

#[cfg(not(unix))]
fn restrict(_path: &Path, _mode: u32) -> Result<(), std::io::Error> {
    Ok(())
}

/// Time Machine skips a file carrying this attribute. Best effort: a
/// filesystem without extended attributes gets no exclusion and no error —
/// the index is a cache, the attribute is a courtesy to the user's backup.
fn exclude_from_backup(path: &Path) {
    #[cfg(target_os = "macos")]
    {
        let _ = xattr::set(
            path,
            "com.apple.metadata:com_apple_backup_excludeItem",
            b"com.apple.backupd",
        );
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
    }
}
