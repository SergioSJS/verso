// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The table's log (ADR 0107 item 5, decided 2026-10-21): every entry of
//! a folder's table, kept in the server's database with no expiry, its
//! pins beside it. Not a cache: nothing rebuilds it. No file of the
//! folder is written for it. The one bound is [`ROWS_MOST`] per folder,
//! the oldest unpinned going first, so that a member's program cannot fill
//! the host's disk with messages.

use rusqlite::{OptionalExtension, params};

use super::{Db, R, e};

/// Schema 14: the table's log.
pub(super) const TABLE: &str = r"
CREATE TABLE table_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  account TEXT NOT NULL,
  by_name TEXT NOT NULL,
  at TEXT NOT NULL,
  path TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  secret INTEGER NOT NULL DEFAULT 0,
  readers_hidden INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL
);
CREATE INDEX table_log_folder ON table_log(folder, id);
";

/// The entries a folder's log keeps at most; past it the oldest entries
/// that are not pinned go.
pub const ROWS_MOST: i64 = 20_000;

/// An entry as kept: the columns, and the body (the roll, the draw, the
/// text or the image's path, as JSON).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Row {
    pub id: i64,
    pub kind: String,
    pub account: String,
    pub by_name: String,
    pub at: String,
    pub path: Option<String>,
    pub pinned: bool,
    pub secret: bool,
    /// A roll made inside a note with secret blocks, which the readers of
    /// the folder are not told (ADR 0087 item 4).
    pub readers_hidden: bool,
    pub body: String,
}

const COLUMNS: &str = "id, kind, account, by_name, at, path, pinned, secret, readers_hidden, body";

fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Row> {
    Ok(Row {
        id: r.get(0)?,
        kind: r.get(1)?,
        account: r.get(2)?,
        by_name: r.get(3)?,
        at: r.get(4)?,
        path: r.get(5)?,
        pinned: r.get::<_, i64>(6)? != 0,
        secret: r.get::<_, i64>(7)? != 0,
        readers_hidden: r.get::<_, i64>(8)? != 0,
        body: r.get(9)?,
    })
}

impl Db {
    /// Keep `entry` (its `id` ignored) in `folder`'s log: its number.
    pub fn table_add(&self, folder: &str, entry: &Row) -> R<i64> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        tx.execute(
            "INSERT INTO table_log (folder, kind, account, by_name, at, path, pinned, secret, readers_hidden, body)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                folder,
                entry.kind,
                entry.account,
                entry.by_name,
                entry.at,
                entry.path,
                i64::from(entry.pinned),
                i64::from(entry.secret),
                i64::from(entry.readers_hidden),
                entry.body
            ],
        )
        .map_err(e)?;
        let id = tx.last_insert_rowid();
        let held: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM table_log WHERE folder = ?1",
                [folder],
                |r| r.get(0),
            )
            .map_err(e)?;
        if held > ROWS_MOST {
            tx.execute(
                "DELETE FROM table_log WHERE id IN (
                   SELECT id FROM table_log WHERE folder = ?1 AND pinned = 0 ORDER BY id LIMIT ?2)",
                params![folder, held - ROWS_MOST],
            )
            .map_err(e)?;
        }
        tx.commit().map_err(e)?;
        Ok(id)
    }

    /// The entries before `before` (the newest when none), `limit` of
    /// them, newest first, and whether older ones remain. Pinned ones are
    /// not left out. `readers`: without what the folder's readers are not
    /// told.
    pub fn table_page(
        &self,
        folder: &str,
        before: Option<i64>,
        limit: i64,
        readers: bool,
    ) -> R<(Vec<Row>, bool)> {
        let conn = self.reader();
        let mut st = conn
            .prepare(&format!(
                "SELECT {COLUMNS} FROM table_log
                 WHERE folder = ?1 AND id < ?2 AND (?3 = 0 OR readers_hidden = 0)
                 ORDER BY id DESC LIMIT ?4"
            ))
            .map_err(e)?;
        let mut rows = st
            .query_map(
                params![
                    folder,
                    before.unwrap_or(i64::MAX),
                    i64::from(readers),
                    limit + 1
                ],
                row,
            )
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        let more = i64::try_from(rows.len()).unwrap_or(i64::MAX) > limit;
        rows.truncate(usize::try_from(limit).unwrap_or(0));
        Ok((rows, more))
    }

    /// Every pinned entry of the folder, oldest first.
    pub fn table_pinned(&self, folder: &str, readers: bool) -> R<Vec<Row>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(&format!(
                "SELECT {COLUMNS} FROM table_log
                 WHERE folder = ?1 AND pinned = 1 AND (?2 = 0 OR readers_hidden = 0)
                 ORDER BY id"
            ))
            .map_err(e)?;
        st.query_map(params![folder, i64::from(readers)], row)
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)
    }

    pub fn table_get(&self, folder: &str, id: i64) -> R<Option<Row>> {
        self.conn()
            .query_row(
                &format!("SELECT {COLUMNS} FROM table_log WHERE folder = ?1 AND id = ?2"),
                params![folder, id],
                row,
            )
            .optional()
            .map_err(e)
    }

    /// Pin or unpin an entry: whether it exists.
    pub fn table_set_pinned(&self, folder: &str, id: i64, pinned: bool) -> R<bool> {
        let n = self
            .conn()
            .execute(
                "UPDATE table_log SET pinned = ?3 WHERE folder = ?1 AND id = ?2",
                params![folder, id, i64::from(pinned)],
            )
            .map_err(e)?;
        Ok(n > 0)
    }

    pub fn table_delete(&self, folder: &str, id: i64) -> R<bool> {
        let n = self
            .conn()
            .execute(
                "DELETE FROM table_log WHERE folder = ?1 AND id = ?2",
                params![folder, id],
            )
            .map_err(e)?;
        Ok(n > 0)
    }

    /// Empty the folder's log, the pinned entries kept or not: how many
    /// went.
    pub fn table_clear(&self, folder: &str, keep_pinned: bool) -> R<usize> {
        self.conn()
            .execute(
                "DELETE FROM table_log WHERE folder = ?1 AND (?2 = 0 OR pinned = 0)",
                params![folder, i64::from(keep_pinned)],
            )
            .map_err(e)
    }

    /// How many entries the folder's log holds.
    pub fn table_count(&self, folder: &str) -> R<i64> {
        self.conn()
            .query_row(
                "SELECT COUNT(*) FROM table_log WHERE folder = ?1",
                [folder],
                |r| r.get(0),
            )
            .map_err(e)
    }
}
