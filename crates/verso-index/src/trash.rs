// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What is known of the folder's bin on this computer (ADR 0080 item 2):
//! each entry of `.trash/` with its original path, when it was deleted and
//! by whom — a cache the core rebuilds from a walk of `.trash/` — and how
//! long deleted files are kept (item 3, a setting of the local folder kept
//! here, beside the folder's index, never in the folder). Its tables are
//! not the index's: a rebuild of the index for a new schema leaves them
//! alone, and they are made on every open when missing.

use rusqlite::{Connection, OptionalExtension, params};

use crate::{Index, IndexError};

const TABLES: &str = "
CREATE TABLE IF NOT EXISTS trash (
    path     TEXT PRIMARY KEY,   -- under `.trash/`, as the walk names it
    original TEXT NOT NULL,      -- where it was in the folder
    deleted  INTEGER,            -- seconds; NULL: not known (found by a walk)
    seen     INTEGER NOT NULL,   -- when it was first known: the clock of an unknown date
    by_whom  TEXT,               -- who or what deleted it; NULL: this computer
    replaced INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS trash_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
";

pub(crate) fn ensure(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(TABLES)
}

/// One entry of the bin as recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrashRow {
    pub path: String,
    pub original: String,
    pub deleted: Option<i64>,
    pub seen: i64,
    pub by: Option<String>,
    pub replaced: bool,
}

impl Index {
    /// Every entry of the bin recorded here.
    pub fn trash_rows(&self) -> Result<Vec<TrashRow>, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT path, original, deleted, seen, by_whom, replaced FROM trash ORDER BY path",
        )?;
        let rows = st
            .query_map([], |r| {
                Ok(TrashRow {
                    path: r.get(0)?,
                    original: r.get(1)?,
                    deleted: r.get(2)?,
                    seen: r.get(3)?,
                    by: r.get(4)?,
                    replaced: r.get::<_, i64>(5)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Record an entry of the bin, replacing what was known of its path.
    pub fn put_trash_row(&mut self, row: &TrashRow) -> Result<(), IndexError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO trash (path, original, deleted, seen, by_whom, replaced)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                row.path,
                row.original,
                row.deleted,
                row.seen,
                row.by,
                i64::from(row.replaced)
            ],
        )?;
        Ok(())
    }

    /// Forget an entry of the bin (restored, removed, or gone by hand).
    pub fn forget_trash_row(&mut self, path: &str) -> Result<(), IndexError> {
        self.conn
            .execute("DELETE FROM trash WHERE path = ?1", [path])?;
        Ok(())
    }

    /// How many days deleted files are kept in this folder's bin; `None`
    /// when never set (the default applies), `Some(0)` for forever.
    pub fn trash_days(&self) -> Result<Option<u32>, IndexError> {
        let v: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM trash_settings WHERE key = 'days'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        Ok(v.and_then(|v| v.parse().ok()))
    }

    pub fn set_trash_days(&mut self, days: u32) -> Result<(), IndexError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO trash_settings (key, value) VALUES ('days', ?1)",
            [days.to_string()],
        )?;
        Ok(())
    }

    /// When the bin was last swept, in seconds; `None` before the first.
    pub fn trash_swept(&self) -> Result<Option<i64>, IndexError> {
        let v: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM trash_settings WHERE key = 'swept'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        Ok(v.and_then(|v| v.parse().ok()))
    }

    pub fn set_trash_swept(&mut self, at: i64) -> Result<(), IndexError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO trash_settings (key, value) VALUES ('swept', ?1)",
            [at.to_string()],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bin_is_recorded_and_survives_a_rebuild() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("i.sqlite");
        let mut index = Index::open(&file).unwrap();
        let row = TrashRow {
            path: ".trash/a.md".into(),
            original: "a.md".into(),
            deleted: Some(10),
            seen: 10,
            by: Some("Mac".into()),
            replaced: true,
        };
        index.put_trash_row(&row).unwrap();
        index.set_trash_days(7).unwrap();
        assert_eq!(index.trash_rows().unwrap(), vec![row.clone()]);
        // A schema the build does not know: the index is rebuilt, the
        // bin's record is kept.
        index
            .conn
            .execute("UPDATE meta SET value = '1' WHERE key = 'schema'", [])
            .unwrap();
        drop(index);
        let mut index = Index::open(&file).unwrap();
        assert_eq!(index.trash_rows().unwrap(), vec![row]);
        assert_eq!(index.trash_days().unwrap(), Some(7));
        index.forget_trash_row(".trash/a.md").unwrap();
        assert!(index.trash_rows().unwrap().is_empty());
    }
}
