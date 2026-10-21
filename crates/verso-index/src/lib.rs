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

mod block_list;
pub mod history;
mod keys;
mod moves;
mod schema;
mod search;
mod secret;
mod store;
pub mod tiles;
mod trash;

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension};

pub use block_list::{BLOCKS_MOST, BlockKind, BlockList, BlockRef};
pub use keys::{file_key, note_keys, target_key, type_key};
pub use search::Hit;
pub use store::{
    Backlink, Block, BoardSplit, EntryLabel, Heading, Link, NoteStamp, SchemaRow, SourceLink,
    Unresolved, VaultLink,
};
pub use trash::TrashRow;

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
    /// Changes made since the open run's transaction last committed;
    /// `None` outside a run ([`Index::begin`]).
    run: Option<u32>,
    /// When the open run began, in seconds since the Unix epoch: what a
    /// row written in it records as `indexed_at`, and what the run records
    /// as `verified_from` when it completes ([`Index::complete`]).
    run_started: Option<i64>,
    /// In the open run, the modified time (seconds) a note must be older
    /// than to be trusted by its stat: two seconds before the last
    /// complete run began. `None` outside a run, where nothing is.
    trusted_before: Option<i64>,
}

/// Changes of an index run between two commits: the write lock is let go
/// that often, so another process writing the index (the CLI, the MCP
/// server, a second window) waits a fraction of a second, not the run.
const RUN_CHUNK: u32 = 200;

/// How long a write waits for another process's lock before failing.
const BUSY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

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
        // The index is a cache rebuilt from the notes (ADR 0011): in WAL,
        // NORMAL keeps the file consistent through a crash and gives up
        // only the last commits on a power loss, which the next index
        // redoes. FULL syncs the disk on every commit — one per note —
        // which Windows does for real (`FlushFileBuffers`): a first index
        // of 5,000 notes took 228 s there against 3 s on macOS (ADR 0069).
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        // Another process may be writing (the CLI, the MCP server): wait
        // for its lock rather than fail at once.
        conn.busy_timeout(BUSY_TIMEOUT)?;
        schema::ensure(&conn)?;
        trash::ensure(&conn)?;
        Ok(Self {
            conn,
            path,
            run: None,
            run_started: None,
            trusted_before: None,
        })
    }

    /// Opens a transaction around many changes — an index run — so that
    /// each note's change is a savepoint inside it rather than a commit of
    /// its own; [`Index::step`] commits every [`RUN_CHUNK`] changes and
    /// [`Index::commit`] ends the run. `IMMEDIATE`: the write lock is
    /// taken now, waiting for another process's, rather than at the first
    /// change, where a reader turned writer could fail. A transaction left
    /// open by a run that never ended (a panic the caller caught) is
    /// committed first: each change in it is whole.
    pub fn begin(&mut self) -> Result<(), IndexError> {
        if !self.conn.is_autocommit() {
            self.conn.execute_batch("COMMIT")?;
        }
        // Taken before any note of the run is read: what the run records
        // must never be later than the reads it vouches for.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX));
        self.conn.execute_batch("BEGIN IMMEDIATE")?;
        // The last complete run read every note or trusted it by this same
        // rule, so a note modified at least 2 s before that run began, and
        // whose time and length the index holds, is the one the index
        // holds (git's racy rule, one date for the whole index rather than
        // one written per note: writing each row again cost a reopen of
        // 10,000 notes 4 times its time on a disk that syncs for real,
        // 2026-10-08). A date in the future — a clock set back — trusts
        // nothing.
        let verified_from = self
            .conn
            .query_row(
                "SELECT value FROM meta WHERE key = 'verified_from'",
                [],
                |r| r.get::<_, String>(0),
            )
            .optional()?
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|&v| v <= now)
            .unwrap_or(0);
        self.run = Some(0);
        self.run_started = Some(now);
        self.trusted_before = Some(verified_from - 1);
        Ok(())
    }

    /// The open run read or trusted every note of the folder: from the
    /// next run on, a note modified at least 2 s before this run began is
    /// trusted by its stat. A run that skipped any note (a folder it could
    /// not list, a file it could not read) must not call this.
    pub fn complete(&mut self) -> Result<(), IndexError> {
        if let Some(started) = self.run_started {
            self.conn.execute(
                "INSERT INTO meta (key, value) VALUES ('verified_from', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [started.to_string()],
            )?;
        }
        Ok(())
    }

    /// One change of the open run done: every [`RUN_CHUNK`] changes the
    /// run commits and opens a new transaction, letting other writers in.
    /// Nothing outside a run.
    pub fn step(&mut self) -> Result<(), IndexError> {
        let Some(done) = self.run.as_mut() else {
            return Ok(());
        };
        *done += 1;
        if *done >= RUN_CHUNK {
            *done = 0;
            self.conn.execute_batch("COMMIT; BEGIN IMMEDIATE")?;
        }
        Ok(())
    }

    /// Commits what [`Index::begin`] opened and ends the run; nothing to
    /// commit when no transaction is open.
    pub fn commit(&mut self) -> Result<(), IndexError> {
        self.run = None;
        self.run_started = None;
        self.trusted_before = None;
        if !self.conn.is_autocommit() {
            self.conn.execute_batch("COMMIT")?;
        }
        Ok(())
    }

    /// An index that lives only in memory: for tests and for a folder the
    /// user does not want indexed on disk (later option, ADR 0046).
    pub fn in_memory() -> Result<Self, IndexError> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        schema::ensure(&conn)?;
        trash::ensure(&conn)?;
        Ok(Self {
            conn,
            path: PathBuf::from(":memory:"),
            run: None,
            run_started: None,
            trusted_before: None,
        })
    }

    /// Where the file is.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The index's size in bytes, as SQLite counts its pages: the space a
    /// folder's index takes (ADR 0075 item 4), without asking the file
    /// system.
    pub fn bytes(&self) -> Result<u64, IndexError> {
        let pages: i64 = self.conn.query_row("PRAGMA page_count", [], |r| r.get(0))?;
        let size: i64 = self.conn.query_row("PRAGMA page_size", [], |r| r.get(0))?;
        Ok(u64::try_from(pages.saturating_mul(size)).unwrap_or(0))
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
