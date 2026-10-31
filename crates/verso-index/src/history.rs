// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The version history of a folder's text files (ADR 0091): the bytes of a
//! file at a write, kept outside the folder (item 1; ADR 0011) — on a
//! server in a database of its data directory, on the computer in one per
//! folder under the configuration directory (item 8). The file stays the
//! truth (ADR 0012); nothing here is ever written into the folder, and
//! this module has no way to reach it: the caller reads the folder through
//! `verso-fs` and hands the bytes in.
//!
//! A *line* is one file's versions: it follows the file across renames
//! (item 9), and a deleted file's line is kept, marked gone, so that its
//! history is reached from its entry in the trash. Bytes are kept once per
//! folder by their SHA-256, compressed: equal bytes are one blob (item 1).
//!
//! Unlike the index this store is not a cache: deleting it loses the
//! history. Its file is restricted to its owner as the index's is, and it
//! is left to the backups.

use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::Path;

use flate2::Compression;
use flate2::read::DeflateDecoder;
use flate2::write::DeflateEncoder;
use rusqlite::{Connection, OptionalExtension, params};
use sha2::{Digest, Sha256};

use crate::IndexError;

#[path = "history_thin.rs"]
mod thin;
pub use thin::{COALESCE, DAY, HOUR, HOURLY_UNTIL, thinning};

/// How many days versions are kept when nothing else is set (item 3).
pub const DEFAULT_DAYS: u32 = 365;

/// How soon after the watcher's "made outside" guess a known author of the
/// same bytes takes the version over: Verso's own write, recorded a moment
/// after the watcher saw it.
const OUTSIDE_GUESS_MS: i64 = 10_000;

const TABLES: &str = "
CREATE TABLE IF NOT EXISTS lines (
    id     INTEGER PRIMARY KEY,
    folder TEXT NOT NULL,
    path   TEXT NOT NULL,    -- where the file is now, or was when it went
    gone   INTEGER           -- milliseconds; NULL while the file is there
);
CREATE INDEX IF NOT EXISTS lines_path ON lines(folder, path);
CREATE TABLE IF NOT EXISTS blobs (
    folder TEXT NOT NULL,
    hash   TEXT NOT NULL,    -- SHA-256 of the bytes, lowercase hex
    size   INTEGER NOT NULL, -- the bytes' length
    bytes  BLOB NOT NULL,    -- deflated
    PRIMARY KEY (folder, hash)
);
CREATE TABLE IF NOT EXISTS versions (
    id      INTEGER PRIMARY KEY,
    line    INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    path    TEXT NOT NULL,   -- the file's path when this version was written
    hash    TEXT NOT NULL,
    size    INTEGER NOT NULL,
    at      INTEGER NOT NULL, -- milliseconds since the epoch
    until   INTEGER,          -- writes coalesce into this one until then
    kind    TEXT NOT NULL,
    authors TEXT NOT NULL,
    added   INTEGER NOT NULL, -- lines added against the version before
    removed INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS versions_line ON versions(line, at);
CREATE INDEX IF NOT EXISTS versions_hash ON versions(hash);
";

/// What made a version.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// A write through Verso that is not an edit coalesced: a device's
    /// sync, a token, the properties panel.
    Write,
    /// The editor's saves on the computer, coalesced as a room's are.
    Edit,
    /// A room's saves on a server, coalesced (item 3).
    Room,
    /// A version brought back (item 5): itself a version.
    Restore,
    /// A change the watcher found, made outside Verso (item 4).
    Outside,
    /// The file as it was when its history began.
    Found,
}

impl Kind {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Write => "write",
            Self::Edit => "edit",
            Self::Room => "room",
            Self::Restore => "restore",
            Self::Outside => "outside",
            Self::Found => "found",
        }
    }

    #[must_use]
    pub fn parse(s: &str) -> Self {
        match s {
            "edit" => Self::Edit,
            "room" => Self::Room,
            "restore" => Self::Restore,
            "outside" => Self::Outside,
            "found" => Self::Found,
            _ => Self::Write,
        }
    }

    /// Whether writes of this kind coalesce into one version per
    /// [`COALESCE`] of editing.
    #[must_use]
    pub fn coalesces(self) -> bool {
        matches!(self, Self::Edit | Self::Room)
    }
}

/// Who a version names (item 4): an account, a device by its name, an
/// agent's token, this computer, or nobody Verso knows ("outside").
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Author {
    pub kind: String,
    pub name: String,
}

impl Author {
    #[must_use]
    pub fn new(kind: &str, name: &str) -> Self {
        Self {
            kind: kind.to_owned(),
            name: name.to_owned(),
        }
    }
}

/// One version as kept.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Version {
    pub id: i64,
    pub path: String,
    pub hash: String,
    pub size: u64,
    pub at: i64,
    pub kind: Kind,
    pub authors: Vec<Author>,
    pub added: u32,
    pub removed: u32,
}

/// What a record did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Recorded {
    /// The bytes are the newest version's already.
    Same,
    /// A new version.
    New(i64),
    /// Coalesced into the newest version.
    Merged(i64),
}

/// A file's versions, newest first, and when the file went, if it did.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Listing {
    pub versions: Vec<Version>,
    pub gone: Option<i64>,
}

/// What a thinning removed, and what the folder's history holds after.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Thinned {
    /// Versions past their time (item 3).
    pub removed: usize,
    /// Versions removed early: the history alone passed the quota (item 7).
    pub early: usize,
    pub count: u64,
    /// The bytes the folder's history takes on disk.
    pub size: u64,
}

/// The history of one host's folders.
pub struct Store {
    conn: Connection,
}

impl std::fmt::Debug for Store {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("history::Store").finish_non_exhaustive()
    }
}

/// SHA-256 as the change log writes it: lowercase hex.
#[must_use]
pub fn sha256(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut out = String::with_capacity(64);
    for b in Sha256::digest(bytes) {
        let _ = write!(out, "{b:02x}");
    }
    out
}

fn pack(bytes: &[u8]) -> Result<Vec<u8>, IndexError> {
    let mut e = DeflateEncoder::new(Vec::new(), Compression::default());
    e.write_all(bytes).map_err(IndexError::Io)?;
    e.finish().map_err(IndexError::Io)
}

fn unpack(packed: &[u8], size: u64) -> Result<Vec<u8>, IndexError> {
    let mut out = Vec::with_capacity(usize::try_from(size).unwrap_or(0));
    DeflateDecoder::new(packed)
        .read_to_end(&mut out)
        .map_err(IndexError::Io)?;
    Ok(out)
}

/// One field of the authors' column: no separator of the column inside.
fn clean(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect()
}

fn authors_text(authors: &[Author]) -> String {
    authors
        .iter()
        .map(|a| format!("{}\u{1f}{}", clean(&a.kind), clean(&a.name)))
        .collect::<Vec<_>>()
        .join("\n")
}

fn authors_of(text: &str) -> Vec<Author> {
    text.lines()
        .filter_map(|l| l.split_once('\u{1f}'))
        .map(|(k, n)| Author::new(k, n))
        .collect()
}

fn merged(mut a: Vec<Author>, b: &[Author]) -> Vec<Author> {
    for x in b {
        if !a.contains(x) {
            a.push(x.clone());
        }
    }
    a
}

/// The size of a change, in lines: those of `new` that `old` lacks, and
/// those of `old` that `new` lacks, counted as a multiset — what a line
/// diff counts when lines move as a block, and cheap whatever the length.
#[must_use]
pub fn line_change(old: &[u8], new: &[u8]) -> (u32, u32) {
    let old = String::from_utf8_lossy(old);
    let new = String::from_utf8_lossy(new);
    let mut count: HashMap<&str, i64> = HashMap::new();
    for l in old.lines() {
        *count.entry(l).or_default() += 1;
    }
    let mut added = 0u32;
    for l in new.lines() {
        let n = count.entry(l).or_default();
        if *n > 0 {
            *n -= 1;
        } else {
            added = added.saturating_add(1);
        }
    }
    let removed: i64 = count.values().filter(|n| **n > 0).sum();
    (added, u32::try_from(removed).unwrap_or(u32::MAX))
}

const VERSION_COLUMNS: &str =
    "v.id, v.path, v.hash, v.size, v.at, v.kind, v.authors, v.added, v.removed";

fn version_of(r: &rusqlite::Row<'_>) -> rusqlite::Result<Version> {
    Ok(Version {
        id: r.get(0)?,
        path: r.get(1)?,
        hash: r.get(2)?,
        size: u64::try_from(r.get::<_, i64>(3)?).unwrap_or(0),
        at: r.get(4)?,
        kind: Kind::parse(&r.get::<_, String>(5)?),
        authors: authors_of(&r.get::<_, String>(6)?),
        added: u32::try_from(r.get::<_, i64>(7)?).unwrap_or(0),
        removed: u32::try_from(r.get::<_, i64>(8)?).unwrap_or(0),
    })
}

/// The live line of `path`, if the file has one.
fn live_line(tx: &Connection, folder: &str, path: &str) -> rusqlite::Result<Option<i64>> {
    tx.query_row(
        "SELECT id FROM lines WHERE folder = ?1 AND path = ?2 AND gone IS NULL
         ORDER BY id DESC LIMIT 1",
        params![folder, path],
        |r| r.get(0),
    )
    .optional()
}

/// Make the line of the file that went from `path` live again when its
/// newest version holds `hash`: the file came back.
fn revived(tx: &Connection, folder: &str, path: &str, hash: &str) -> rusqlite::Result<bool> {
    let line: Option<i64> = tx
        .query_row(
            "SELECT l.id FROM lines l WHERE l.folder = ?1 AND l.path = ?2 AND l.gone IS NOT NULL
             AND (SELECT v.hash FROM versions v WHERE v.line = l.id ORDER BY v.at DESC, v.id DESC LIMIT 1) = ?3
             ORDER BY l.gone DESC LIMIT 1",
            params![folder, path, hash],
            |r| r.get(0),
        )
        .optional()?;
    match line {
        Some(id) => {
            tx.execute("UPDATE lines SET gone = NULL WHERE id = ?1", [id])?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// The newest two versions of `line`, newest first, with when the newest
/// stops taking writes.
fn newest_two(tx: &Connection, line: i64) -> rusqlite::Result<Vec<(Version, Option<i64>)>> {
    let mut st = tx.prepare_cached(&format!(
        "SELECT {VERSION_COLUMNS}, v.until FROM versions v WHERE v.line = ?1
         ORDER BY v.at DESC, v.id DESC LIMIT 2"
    ))?;
    st.query_map([line], |r| Ok((version_of(r)?, r.get(9)?)))?
        .collect()
}

fn blob(tx: &Connection, folder: &str, hash: &str) -> Result<Option<Vec<u8>>, IndexError> {
    let row: Option<(Vec<u8>, i64)> = tx
        .query_row(
            "SELECT bytes, size FROM blobs WHERE folder = ?1 AND hash = ?2",
            params![folder, hash],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    row.map(|(b, size)| unpack(&b, u64::try_from(size).unwrap_or(0)))
        .transpose()
}

/// Remove the blob of `hash` when no version of the folder names it any
/// more; the bytes it took on disk.
fn drop_unused(tx: &Connection, folder: &str, hash: &str) -> rusqlite::Result<u64> {
    let used: bool = tx.query_row(
        "SELECT EXISTS (SELECT 1 FROM versions v JOIN lines l ON l.id = v.line
                        WHERE l.folder = ?1 AND v.hash = ?2)",
        params![folder, hash],
        |r| r.get(0),
    )?;
    if used {
        return Ok(0);
    }
    let size: Option<i64> = tx
        .query_row(
            "SELECT length(bytes) FROM blobs WHERE folder = ?1 AND hash = ?2",
            params![folder, hash],
            |r| r.get(0),
        )
        .optional()?;
    tx.execute(
        "DELETE FROM blobs WHERE folder = ?1 AND hash = ?2",
        params![folder, hash],
    )?;
    Ok(size.and_then(|s| u64::try_from(s).ok()).unwrap_or(0))
}

/// Remove version `id` and, when nothing else names them, its bytes and
/// its line.
fn remove_version(tx: &Connection, folder: &str, id: i64) -> rusqlite::Result<u64> {
    let row: Option<(String, i64)> = tx
        .query_row(
            "SELECT v.hash, v.line FROM versions v JOIN lines l ON l.id = v.line
             WHERE v.id = ?1 AND l.folder = ?2",
            params![id, folder],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let Some((hash, line)) = row else {
        return Ok(0);
    };
    tx.execute("DELETE FROM versions WHERE id = ?1", [id])?;
    tx.execute(
        "DELETE FROM lines WHERE id = ?1 AND gone IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM versions WHERE line = ?1)",
        [line],
    )?;
    drop_unused(tx, folder, &hash)
}

/// `path` under `prefix` (itself, or inside it as a folder): its rest.
fn under<'a>(path: &'a str, prefix: &str) -> Option<&'a str> {
    if path == prefix {
        return Some("");
    }
    path.strip_prefix(prefix).and_then(|r| r.strip_prefix('/'))
}

impl Store {
    /// Open (or make) the store at `path`, outside any folder of notes:
    /// its directory made and restricted to its owner as the index's is.
    pub fn open(path: &Path) -> Result<Self, IndexError> {
        if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
            std::fs::create_dir_all(dir)?;
            crate::restrict(dir, 0o700)?;
        }
        let conn = Connection::open(path)?;
        crate::restrict(path, 0o600)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(crate::BUSY_TIMEOUT)?;
        conn.execute_batch(TABLES)?;
        Ok(Self { conn })
    }

    /// A store in memory, for tests.
    pub fn memory() -> Result<Self, IndexError> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.execute_batch(TABLES)?;
        Ok(Self { conn })
    }

    /// Keep `bytes` as the newest version of `path` in `folder`, written
    /// at `at` (milliseconds) by `authors`. Bytes equal to the newest
    /// version's make none; a write of a coalescing kind within
    /// [`COALESCE`] of the newest version's first is folded into it, its
    /// authors added (item 3).
    pub fn record(
        &mut self,
        folder: &str,
        path: &str,
        bytes: &[u8],
        at: i64,
        authors: &[Author],
        kind: Kind,
    ) -> Result<Recorded, IndexError> {
        let hash = sha256(bytes);
        let tx = self.conn.transaction()?;
        let line = match live_line(&tx, folder, path)? {
            Some(l) => l,
            // The same bytes back where a file went — a restore from the
            // trash: its line again, gone no more.
            None if revived(&tx, folder, path, &hash)? => {
                tx.commit()?;
                return Ok(Recorded::Same);
            }
            None => {
                tx.execute(
                    "INSERT INTO lines (folder, path) VALUES (?1, ?2)",
                    params![folder, path],
                )?;
                tx.last_insert_rowid()
            }
        };
        let two = newest_two(&tx, line)?;
        let newest = two.first();
        let coalesce = newest.filter(|(v, until)| {
            kind.coalesces() && v.kind == kind && until.is_some_and(|u| at < u)
        });
        if let Some((v, _)) = newest
            && v.hash == hash
        {
            // The watcher can see Verso's own write before the write is
            // recorded (seen on Windows, 2026-10-31): it records the bytes as
            // made outside, and the write, arriving a moment later with the
            // same bytes, would be dropped as the same. A known author of the
            // same bytes, that soon after, is what the version was.
            if v.kind == Kind::Outside && kind != Kind::Outside && at - v.at <= OUTSIDE_GUESS_MS {
                tx.execute(
                    "UPDATE versions SET kind = ?1, authors = ?2 WHERE id = ?3",
                    params![kind.as_str(), authors_text(authors), v.id],
                )?;
                tx.commit()?;
                return Ok(Recorded::Same);
            }
            if coalesce.is_some() {
                let all = merged(v.authors.clone(), authors);
                tx.execute(
                    "UPDATE versions SET authors = ?1 WHERE id = ?2",
                    params![authors_text(&all), v.id],
                )?;
            }
            tx.commit()?;
            return Ok(Recorded::Same);
        }
        // What the change is measured against: the version before the one
        // a coalesced write folds into, or the newest.
        let before = match coalesce {
            Some(_) => two.get(1).map(|(v, _)| v),
            None => newest.map(|(v, _)| v),
        };
        let (added, removed) = match before {
            Some(b) => {
                let old = blob(&tx, folder, &b.hash)?.unwrap_or_default();
                line_change(&old, bytes)
            }
            None => (0, 0),
        };
        let size = i64::try_from(bytes.len()).unwrap_or(i64::MAX);
        let exists: bool = tx.query_row(
            "SELECT EXISTS (SELECT 1 FROM blobs WHERE folder = ?1 AND hash = ?2)",
            params![folder, hash],
            |r| r.get(0),
        )?;
        if !exists {
            tx.execute(
                "INSERT INTO blobs (folder, hash, size, bytes) VALUES (?1, ?2, ?3, ?4)",
                params![folder, hash, size, pack(bytes)?],
            )?;
        }
        let done = match coalesce {
            // Folded back to what it was before: the coalesced version
            // goes, and the one before stays the newest.
            Some((v, _)) if before.is_some_and(|b| b.hash == hash) => {
                let old = v.hash.clone();
                tx.execute("DELETE FROM versions WHERE id = ?1", [v.id])?;
                drop_unused(&tx, folder, &old)?;
                Recorded::Same
            }
            Some((v, _)) => {
                let old = v.hash.clone();
                let all = merged(v.authors.clone(), authors);
                tx.execute(
                    "UPDATE versions SET hash = ?1, size = ?2, at = ?3, authors = ?4,
                     added = ?5, removed = ?6, path = ?7 WHERE id = ?8",
                    params![
                        hash,
                        size,
                        at,
                        authors_text(&all),
                        added,
                        removed,
                        path,
                        v.id
                    ],
                )?;
                drop_unused(&tx, folder, &old)?;
                Recorded::Merged(v.id)
            }
            None => {
                let until = kind.coalesces().then_some(at.saturating_add(COALESCE));
                tx.execute(
                    "INSERT INTO versions (line, path, hash, size, at, until, kind, authors, added, removed)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        line,
                        path,
                        hash,
                        size,
                        at,
                        until,
                        kind.as_str(),
                        authors_text(authors),
                        added,
                        removed
                    ],
                )?;
                Recorded::New(tx.last_insert_rowid())
            }
        };
        tx.commit()?;
        Ok(done)
    }

    /// Whether `path` has a version already.
    pub fn has(&self, folder: &str, path: &str) -> Result<bool, IndexError> {
        let Some(line) = live_line(&self.conn, folder, path)? else {
            return Ok(false);
        };
        Ok(self.conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM versions WHERE line = ?1)",
            [line],
            |r| r.get(0),
        )?)
    }

    /// The file at `from` (or every file under it, a folder) is at `to`
    /// now: its versions follow it (item 9). A file `to` replaced is gone.
    pub fn moved(&mut self, folder: &str, from: &str, to: &str, at: i64) -> Result<(), IndexError> {
        if from == to {
            return Ok(());
        }
        let tx = self.conn.transaction()?;
        let lines: Vec<(i64, String)> = {
            let mut st =
                tx.prepare_cached("SELECT id, path FROM lines WHERE folder = ?1 AND gone IS NULL")?;
            st.query_map([folder], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<Result<_, _>>()?
        };
        let moving: Vec<(i64, String)> = lines
            .iter()
            .filter_map(|(id, p)| {
                under(p, from).map(|rest| {
                    let new = if rest.is_empty() {
                        to.to_owned()
                    } else {
                        format!("{to}/{rest}")
                    };
                    (*id, new)
                })
            })
            .collect();
        for (id, new) in &moving {
            tx.execute(
                "UPDATE lines SET gone = ?1 WHERE folder = ?2 AND path = ?3 AND gone IS NULL AND id <> ?4",
                params![at, folder, new, id],
            )?;
            tx.execute("UPDATE lines SET path = ?1 WHERE id = ?2", params![new, id])?;
        }
        tx.commit()?;
        Ok(())
    }

    /// The file at `path` (or every file under it) went at `at`: its
    /// versions stay, reached from the trash (item 9).
    pub fn gone(&mut self, folder: &str, path: &str, at: i64) -> Result<(), IndexError> {
        let tx = self.conn.transaction()?;
        let lines: Vec<(i64, String)> = {
            let mut st =
                tx.prepare_cached("SELECT id, path FROM lines WHERE folder = ?1 AND gone IS NULL")?;
            st.query_map([folder], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<Result<_, _>>()?
        };
        for (id, p) in lines {
            if under(&p, path).is_some() {
                tx.execute("UPDATE lines SET gone = ?1 WHERE id = ?2", params![at, id])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// The versions of the file at `path`, newest first; a file no longer
    /// there answers with the line of the last one that was (item 9).
    pub fn versions(&self, folder: &str, path: &str) -> Result<Listing, IndexError> {
        let line: Option<(i64, Option<i64>)> = self
            .conn
            .query_row(
                "SELECT id, gone FROM lines WHERE folder = ?1 AND path = ?2
                 ORDER BY gone IS NOT NULL, gone DESC, id DESC LIMIT 1",
                params![folder, path],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let Some((line, gone)) = line else {
            return Ok(Listing::default());
        };
        let mut st = self.conn.prepare_cached(&format!(
            "SELECT {VERSION_COLUMNS} FROM versions v WHERE v.line = ?1 ORDER BY v.at DESC, v.id DESC"
        ))?;
        let versions = st
            .query_map([line], version_of)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Listing { versions, gone })
    }

    /// Version `id` of `folder` and its bytes.
    pub fn read(&self, folder: &str, id: i64) -> Result<Option<(Version, Vec<u8>)>, IndexError> {
        let v: Option<Version> = self
            .conn
            .query_row(
                &format!(
                    "SELECT {VERSION_COLUMNS} FROM versions v JOIN lines l ON l.id = v.line
                     WHERE v.id = ?1 AND l.folder = ?2"
                ),
                params![id, folder],
                version_of,
            )
            .optional()?;
        let Some(v) = v else {
            return Ok(None);
        };
        let bytes = blob(&self.conn, folder, &v.hash)?
            .ok_or_else(|| IndexError::Corrupt(format!("version {id} has no bytes")))?;
        Ok(Some((v, bytes)))
    }

    /// Remove version `id` of `folder` (item 6: the owner's and the
    /// admin's). Whether it was there.
    pub fn delete(&mut self, folder: &str, id: i64) -> Result<bool, IndexError> {
        let tx = self.conn.transaction()?;
        let there: bool = tx.query_row(
            "SELECT EXISTS (SELECT 1 FROM versions v JOIN lines l ON l.id = v.line
                            WHERE v.id = ?1 AND l.folder = ?2)",
            params![id, folder],
            |r| r.get(0),
        )?;
        remove_version(&tx, folder, id)?;
        tx.commit()?;
        Ok(there)
    }

    /// Every version of `folder` and the bytes its history takes on disk.
    pub fn size(&self, folder: &str) -> Result<(u64, u64), IndexError> {
        let count: i64 = self.conn.query_row(
            "SELECT count(*) FROM versions v JOIN lines l ON l.id = v.line WHERE l.folder = ?1",
            [folder],
            |r| r.get(0),
        )?;
        let size: i64 = self.conn.query_row(
            "SELECT coalesce(sum(length(bytes)), 0) FROM blobs WHERE folder = ?1",
            [folder],
            |r| r.get(0),
        )?;
        Ok((
            u64::try_from(count).unwrap_or(0),
            u64::try_from(size).unwrap_or(0),
        ))
    }

    /// Thin `folder`'s history at `now` (item 3): every version for a day,
    /// one an hour for 30 days, one a day up to `days` (0: no limit); the
    /// newest version of a file there is never thinned away. Then, while
    /// the history alone passes `quota`, its oldest versions go early, the
    /// newest of each file still kept (item 7).
    pub fn thin(
        &mut self,
        folder: &str,
        now: i64,
        days: u32,
        quota: Option<u64>,
    ) -> Result<Thinned, IndexError> {
        let tx = self.conn.transaction()?;
        let lines: Vec<(i64, Option<i64>)> = {
            let mut st = tx.prepare_cached("SELECT id, gone FROM lines WHERE folder = ?1")?;
            st.query_map([folder], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<Result<_, _>>()?
        };
        let mut removed = 0usize;
        // Candidates for the quota's guard: every version but the newest
        // of a file that is there, oldest first.
        let mut spare: Vec<(i64, i64)> = Vec::new();
        for (line, gone) in &lines {
            let ats: Vec<(i64, i64)> = {
                let mut st = tx.prepare_cached(
                    "SELECT id, at FROM versions WHERE line = ?1 ORDER BY at DESC, id DESC",
                )?;
                st.query_map([line], |r| Ok((r.get(0)?, r.get(1)?)))?
                    .collect::<Result<_, _>>()?
            };
            let out: HashSet<i64> = thinning(&ats, now, days, *gone).into_iter().collect();
            for (i, (id, at)) in ats.iter().enumerate() {
                if out.contains(id) {
                    remove_version(&tx, folder, *id)?;
                    removed += 1;
                } else if i > 0 || gone.is_some() {
                    spare.push((*at, *id));
                }
            }
        }
        let mut early = 0usize;
        if let Some(quota) = quota {
            let mut size: i64 = tx.query_row(
                "SELECT coalesce(sum(length(bytes)), 0) FROM blobs WHERE folder = ?1",
                [folder],
                |r| r.get(0),
            )?;
            let quota = i64::try_from(quota).unwrap_or(i64::MAX);
            spare.sort_unstable();
            for (_, id) in spare {
                if size <= quota {
                    break;
                }
                let freed = remove_version(&tx, folder, id)?;
                size -= i64::try_from(freed).unwrap_or(0);
                early += 1;
            }
        }
        tx.commit()?;
        let (count, size) = self.size(folder)?;
        Ok(Thinned {
            removed,
            early,
            count,
            size,
        })
    }

    /// Forget everything of `folder` (the folder itself is gone from the
    /// host).
    pub fn forget(&mut self, folder: &str) -> Result<(), IndexError> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM lines WHERE folder = ?1", [folder])?;
        tx.execute("DELETE FROM blobs WHERE folder = ?1", [folder])?;
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
#[path = "history_tests.rs"]
mod tests;
