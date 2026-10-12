// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What sync keeps of a folder (ADR 0079): each file as last seen — its
//! hash, its size, a quick key of size and time to skip the unchanged —
//! and the log of changes, numbered per folder, that a device reads after
//! its cursor.

use std::collections::HashMap;

use rusqlite::{OptionalExtension, params};
use serde::Serialize;

use super::{Db, R, e, now};

/// A file as sync last saw it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Known {
    pub hash: String,
    pub size: i64,
    pub quick: String,
    pub seq: i64,
}

/// One change of a folder's log as the console shows it: who made it.
#[derive(Debug, Clone)]
pub struct Made {
    pub seq: i64,
    pub at: i64,
    pub path: String,
    pub deleted: bool,
    pub renamed_from: Option<String>,
    /// The account; none for a change found on the server's disk.
    pub actor: Option<String>,
    /// The device's name, for a change a device's sync made.
    pub device: Option<String>,
}

/// What a reconciliation records of a path: its bytes now (hash, size,
/// quick key) or none for a deletion, and the path it was renamed from.
pub type Recorded = (String, Option<(String, i64, String)>, Option<String>);

/// One change of a folder's log.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub seq: i64,
    pub path: String,
    /// None for a deletion.
    pub hash: Option<String>,
    pub size: i64,
    pub deleted: bool,
    /// The path this one was, for a rename or a move.
    pub renamed_from: Option<String>,
    /// The device whose sync made it, by the name the person gave it
    /// (Settings › Servers): two devices of one account told apart.
    /// Absent for a change a window, a room or the server's disk made
    /// (sync 2, ADR 0079 item 5).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
}

/// A change a share sees: its path, or its path before a rename, is one
/// of two roots or inside it (`?3`, `?4`; the same twice when the share
/// shows no attachments folder) — `covers` in SQL, without `LIKE`, so a
/// `%` or `_` in a folder's name is only itself.
const SEEN: &str = "(path = ?3 OR substr(path, 1, length(?3) + 1) = ?3 || '/' \
     OR path = ?4 OR substr(path, 1, length(?4) + 1) = ?4 || '/' \
     OR renamed_from = ?3 OR substr(renamed_from, 1, length(?3) + 1) = ?3 || '/' \
     OR renamed_from = ?4 OR substr(renamed_from, 1, length(?4) + 1) = ?4 || '/')";

/// A share's one or two roots as the two parameters of [`SEEN`].
fn two_roots<'a>(roots: &[&'a str]) -> (&'a str, &'a str) {
    let a = roots.first().copied().unwrap_or("");
    (a, roots.get(1).copied().unwrap_or(a))
}

impl Db {
    pub fn manifest(&self, folder: &str) -> R<HashMap<String, Known>> {
        let conn = self.reader();
        let mut st = conn
            .prepare("SELECT path, hash, size, quick, seq FROM manifest WHERE folder = ?1")
            .map_err(e)?;
        let rows = st
            .query_map([folder], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    Known {
                        hash: r.get(1)?,
                        size: r.get(2)?,
                        quick: r.get(3)?,
                        seq: r.get(4)?,
                    },
                ))
            })
            .map_err(e)?
            .collect::<rusqlite::Result<HashMap<_, _>>>()
            .map_err(e)?;
        Ok(rows)
    }

    /// The paths the folder's log keeps, nothing else of them.
    pub fn manifest_paths(&self, folder: &str) -> R<Vec<String>> {
        let conn = self.reader();
        let mut st = conn
            .prepare("SELECT path FROM manifest WHERE folder = ?1")
            .map_err(e)?;
        st.query_map([folder], |r| r.get::<_, String>(0))
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)
    }

    /// The last change's number, 0 for none.
    pub fn head(&self, folder: &str) -> R<i64> {
        self.reader()
            .query_row(
                "SELECT COALESCE(MAX(seq), 0) FROM changes WHERE folder = ?1",
                [folder],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// Record what changed, in one transaction: the manifest follows and
    /// each change gets the next number. `quick` refreshes a file whose
    /// bytes did not change.
    pub fn record(
        &self,
        folder: &str,
        actor: Option<&str>,
        device: Option<&str>,
        changes: &[Recorded],
        quick: &[(String, String)],
    ) -> R<i64> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let mut seq: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(seq), 0) FROM changes WHERE folder = ?1",
                [folder],
                |r| r.get(0),
            )
            .map_err(e)?;
        let at = now();
        for (path, now_is, renamed_from) in changes {
            seq += 1;
            match now_is {
                Some((hash, size, q)) => {
                    tx.execute(
                        "INSERT INTO manifest (folder, path, hash, size, quick, seq) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                         ON CONFLICT (folder, path) DO UPDATE SET hash = ?3, size = ?4, quick = ?5, seq = ?6",
                        params![folder, path, hash, size, q, seq],
                    )
                    .map_err(e)?;
                    tx.execute(
                        "INSERT INTO changes (folder, seq, path, hash, size, deleted, renamed_from, actor, at, device) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?9)",
                        params![folder, seq, path, hash, size, renamed_from, actor, at, device],
                    )
                    .map_err(e)?;
                }
                None => {
                    tx.execute(
                        "DELETE FROM manifest WHERE folder = ?1 AND path = ?2",
                        params![folder, path],
                    )
                    .map_err(e)?;
                    tx.execute(
                        "INSERT INTO changes (folder, seq, path, hash, size, deleted, renamed_from, actor, at, device) VALUES (?1, ?2, ?3, NULL, 0, 1, NULL, ?4, ?5, ?6)",
                        params![folder, seq, path, actor, at, device],
                    )
                    .map_err(e)?;
                }
            }
        }
        for (path, q) in quick {
            tx.execute(
                "UPDATE manifest SET quick = ?3 WHERE folder = ?1 AND path = ?2",
                params![folder, path, q],
            )
            .map_err(e)?;
        }
        tx.commit().map_err(e)?;
        Ok(seq)
    }

    /// The changes after `since`, oldest first, at most `limit`.
    pub fn changes_since(&self, folder: &str, since: i64, limit: i64) -> R<Vec<Change>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT seq, path, hash, size, deleted, renamed_from, device FROM changes
                 WHERE folder = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3",
            )
            .map_err(e)?;
        st.query_map(params![folder, since, limit], |r| {
            Ok(Change {
                seq: r.get(0)?,
                path: r.get(1)?,
                hash: r.get(2)?,
                size: r.get(3)?,
                deleted: r.get(4)?,
                renamed_from: r.get(5)?,
                device: r.get(6)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)
    }

    /// How many changes of the folder's log up to `upto` a share sees: a
    /// change whose path, or whose path before a rename, is inside one of
    /// `roots` — the shared folder's path and the attachments folder it
    /// shows (ADR 0081 items 6 and 11). The share's own count of changes:
    /// its head, never the folder's (3.18).
    pub fn share_seq(&self, folder: &str, roots: &[&str], upto: i64) -> R<i64> {
        let (a, b) = two_roots(roots);
        self.reader()
            .query_row(
                &format!("SELECT COUNT(*) FROM changes WHERE folder = ?1 AND seq <= ?2 AND {SEEN}"),
                params![folder, upto, a, b],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// The folder's number of the `n`-th change a share sees (counted
    /// from 1, as [`Db::share_seq`] counts them); `None` when it sees
    /// fewer.
    pub fn share_change(&self, folder: &str, roots: &[&str], n: i64) -> R<Option<i64>> {
        if n < 1 {
            return Ok(None);
        }
        let (a, b) = two_roots(roots);
        self.reader()
            .query_row(
                &format!(
                    "SELECT seq FROM changes WHERE folder = ?1 AND {SEEN} ORDER BY seq LIMIT 1 OFFSET ?2"
                ),
                params![folder, n - 1, a, b],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)
    }

    /// The folder's last `limit` changes, newest first, with who made each
    /// — the account and the device — for the console's folder page.
    pub fn latest_changes(&self, folder: &str, limit: i64) -> R<Vec<Made>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT seq, at, path, deleted, renamed_from, actor, device FROM changes
                 WHERE folder = ?1 ORDER BY seq DESC LIMIT ?2",
            )
            .map_err(e)?;
        st.query_map(params![folder, limit], |r| {
            Ok(Made {
                seq: r.get(0)?,
                at: r.get(1)?,
                path: r.get(2)?,
                deleted: r.get(3)?,
                renamed_from: r.get(4)?,
                actor: r.get(5)?,
                device: r.get(6)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)
    }

    /// One file as sync last saw it.
    pub fn known(&self, folder: &str, path: &str) -> R<Option<Known>> {
        self.reader()
            .query_row(
                "SELECT hash, size, quick, seq FROM manifest WHERE folder = ?1 AND path = ?2",
                params![folder, path],
                |r| {
                    Ok(Known {
                        hash: r.get(0)?,
                        size: r.get(1)?,
                        quick: r.get(2)?,
                        seq: r.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(e)
    }

    /// The bytes a folder's files take as sync last saw them — kept by
    /// every write and deletion, between the index's walks — and the
    /// size of `path` (or `path.md`) among them; `None` before the folder
    /// was ever reconciled.
    pub fn space(&self, folder: &str, path: &str) -> R<Option<(i64, i64)>> {
        let conn = self.reader();
        let (count, total): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(size), 0) FROM manifest WHERE folder = ?1",
                params![folder],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(e)?;
        if count == 0 {
            return Ok(None);
        }
        let old: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(size), 0) FROM manifest WHERE folder = ?1 AND path IN (?2, ?3)",
                params![folder, path, format!("{path}.md")],
                |r| r.get(0),
            )
            .map_err(e)?;
        Ok(Some((total, old)))
    }
}
