// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The table's log (ADR 0107 item 5, decided 2026-10-21): every entry of
//! a table, one log per table (2026-10-23: a table is a server folder and
//! the table's root inside it, `""` for the folder itself), kept in the server's database with no expiry, its
//! pins beside it. Not a cache: nothing rebuilds it. No file of the
//! folder is written for it. The one bound is [`ROWS_MOST`] per table,
//! the oldest unpinned going first, so that a member's program cannot fill
//! the host's disk with messages. A table's owner may set the ceiling
//! (`campaigns.log_max`, ADR 0110); `ROWS_MOST` is the default.

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

/// Schema 16: one log per table. `tbl` is the root of the table the entry
/// belongs to, relative to the folder (`""`: the folder itself, the folder
/// with no table). Entries kept before it belong to the folder's
/// shortest-rooted table when it has tables (the one whose numbers they
/// always took), else to the folder. Nothing is deleted.
pub(super) const TABLE_PER_TABLE: &str = r"
ALTER TABLE table_log ADD COLUMN tbl TEXT NOT NULL DEFAULT '';
UPDATE table_log SET tbl = (
  SELECT root FROM campaigns c WHERE c.folder = table_log.folder
  ORDER BY length(c.root), c.root LIMIT 1)
WHERE EXISTS (SELECT 1 FROM campaigns c WHERE c.folder = table_log.folder);
CREATE INDEX table_log_table ON table_log(folder, tbl, id);
";

/// The entries a folder's log keeps at most; past it the oldest entries
/// that are not pinned go.
pub const ROWS_MOST: i64 = 20_000;

/// An entry as kept: the columns, and the body (the roll, the draw, the
/// text or the image's path, as JSON).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Row {
    pub id: i64,
    /// The root of the table it belongs to (`""`: the folder itself).
    pub table: String,
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

const COLUMNS: &str =
    "id, kind, account, by_name, at, path, pinned, secret, readers_hidden, body, tbl";

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
        table: r.get(10)?,
    })
}

impl Db {
    /// Keep `entry` (its `id` ignored) in the log of its table in
    /// `folder`: its number.
    pub fn table_add(&self, folder: &str, entry: &Row) -> R<i64> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        tx.execute(
            "INSERT INTO table_log (folder, kind, account, by_name, at, path, pinned, secret, readers_hidden, body, tbl)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
                entry.body,
                entry.table
            ],
        )
        .map_err(e)?;
        let id = tx.last_insert_rowid();
        let held: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM table_log WHERE folder = ?1 AND tbl = ?2",
                params![folder, entry.table],
                |r| r.get(0),
            )
            .map_err(e)?;
        // The ceiling is the table's own when its owner set one
        // (ADR 0110, MS.1, per table since 2026-10-23).
        let most: i64 = tx
            .query_row(
                "SELECT log_max FROM campaigns WHERE folder = ?1 AND root = ?2",
                params![folder, entry.table],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)?
            .unwrap_or(ROWS_MOST);
        if held > most {
            tx.execute(
                "DELETE FROM table_log WHERE id IN (
                   SELECT id FROM table_log WHERE folder = ?1 AND tbl = ?3 AND pinned = 0 ORDER BY id LIMIT ?2)",
                params![folder, held - most, entry.table],
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
        table: &str,
        before: Option<i64>,
        limit: i64,
        readers: bool,
    ) -> R<(Vec<Row>, bool)> {
        let conn = self.reader();
        let mut st = conn
            .prepare(&format!(
                "SELECT {COLUMNS} FROM table_log
                 WHERE folder = ?1 AND tbl = ?5 AND id < ?2 AND (?3 = 0 OR readers_hidden = 0)
                 ORDER BY id DESC LIMIT ?4"
            ))
            .map_err(e)?;
        let mut rows = st
            .query_map(
                params![
                    folder,
                    before.unwrap_or(i64::MAX),
                    i64::from(readers),
                    limit + 1,
                    table
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

    /// Every pinned entry of the table, oldest first.
    pub fn table_pinned(&self, folder: &str, table: &str, readers: bool) -> R<Vec<Row>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(&format!(
                "SELECT {COLUMNS} FROM table_log
                 WHERE folder = ?1 AND tbl = ?3 AND pinned = 1 AND (?2 = 0 OR readers_hidden = 0)
                 ORDER BY id"
            ))
            .map_err(e)?;
        st.query_map(params![folder, i64::from(readers), table], row)
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)
    }

    pub fn table_get(&self, folder: &str, table: &str, id: i64) -> R<Option<Row>> {
        self.conn()
            .query_row(
                &format!(
                    "SELECT {COLUMNS} FROM table_log WHERE folder = ?1 AND tbl = ?3 AND id = ?2"
                ),
                params![folder, id, table],
                row,
            )
            .optional()
            .map_err(e)
    }

    /// Pin or unpin an entry: whether it exists.
    pub fn table_set_pinned(&self, folder: &str, table: &str, id: i64, pinned: bool) -> R<bool> {
        let n = self
            .conn()
            .execute(
                "UPDATE table_log SET pinned = ?3 WHERE folder = ?1 AND tbl = ?4 AND id = ?2",
                params![folder, id, i64::from(pinned), table],
            )
            .map_err(e)?;
        Ok(n > 0)
    }

    pub fn table_delete(&self, folder: &str, table: &str, id: i64) -> R<bool> {
        let n = self
            .conn()
            .execute(
                "DELETE FROM table_log WHERE folder = ?1 AND tbl = ?3 AND id = ?2",
                params![folder, id, table],
            )
            .map_err(e)?;
        Ok(n > 0)
    }

    /// Empty the table's log, the pinned entries kept or not: how many
    /// went.
    pub fn table_clear(&self, folder: &str, table: &str, keep_pinned: bool) -> R<usize> {
        self.conn()
            .execute(
                "DELETE FROM table_log WHERE folder = ?1 AND tbl = ?3 AND (?2 = 0 OR pinned = 0)",
                params![folder, i64::from(keep_pinned), table],
            )
            .map_err(e)
    }

    /// The paths of the images the folder's tables hold: files the table
    /// shows to everyone at it (ADR 0110 item 4).
    pub fn table_images(&self, folder: &str) -> R<Vec<String>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT body FROM table_log WHERE folder = ?1 AND kind IN ('image', 'file')
                   AND NOT (tbl = '.trash' OR substr(tbl, 1, 7) = '.trash/')",
            )
            .map_err(e)?;
        let bodies = st
            .query_map([folder], |r| r.get::<_, String>(0))
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        Ok(bodies
            .iter()
            .filter_map(|b| serde_json::from_str::<serde_json::Value>(b).ok())
            .filter_map(|v| v["image"].as_str().map(str::to_owned))
            .collect())
    }

    /// How many entries the table's log holds.
    pub fn table_count(&self, folder: &str, table: &str) -> R<i64> {
        self.conn()
            .query_row(
                "SELECT COUNT(*) FROM table_log WHERE folder = ?1 AND tbl = ?2",
                params![folder, table],
                |r| r.get(0),
            )
            .map_err(e)
    }
}
