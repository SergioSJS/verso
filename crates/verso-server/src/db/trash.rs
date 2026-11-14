// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the server knows of each folder's bin (ADR 0080 item 2): each
//! entry of `.trash/` with its original path, when it was deleted and by
//! whom — a cache rebuilt from a walk of `.trash/`, unlike the rest of
//! this database — and how long each folder keeps deleted files (item 3):
//! the admin's value (NULL: `VERSO_TRASH_DAYS`), and the owner's, which
//! only shortens it.

use rusqlite::{OptionalExtension, params};
use verso_core::trash::{TrashBook, TrashRecord};

use super::{Db, R, e};

/// Schema 7: the bins' records and each folder's retention.
pub(super) const TRASH: &str = r"
CREATE TABLE trash (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  original TEXT NOT NULL,
  deleted INTEGER,
  seen INTEGER NOT NULL,
  by_whom TEXT,
  replaced INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (folder, path)
);
ALTER TABLE folders ADD COLUMN trash_days INTEGER;
ALTER TABLE folders ADD COLUMN trash_owner_days INTEGER;
";

impl Db {
    pub fn trash_records(&self, folder: &str) -> R<Vec<TrashRecord>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "SELECT path, original, deleted, seen, by_whom, replaced FROM trash
                 WHERE folder = ?1 ORDER BY path",
            )
            .map_err(e)?;
        st.query_map([folder], |r| {
            Ok(TrashRecord {
                path: r.get(0)?,
                original: r.get(1)?,
                deleted: r.get(2)?,
                seen: r.get(3)?,
                by: r.get(4)?,
                replaced: r.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)
    }

    pub fn put_trash_record(&self, folder: &str, r: &TrashRecord) -> R<()> {
        self.conn()
            .execute(
                "INSERT OR REPLACE INTO trash (folder, path, original, deleted, seen, by_whom, replaced)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    folder,
                    r.path,
                    r.original,
                    r.deleted,
                    r.seen,
                    r.by,
                    i64::from(r.replaced)
                ],
            )
            .map_err(e)?;
        Ok(())
    }

    pub fn forget_trash_record(&self, folder: &str, path: &str) -> R<()> {
        self.conn()
            .execute(
                "DELETE FROM trash WHERE folder = ?1 AND path = ?2",
                params![folder, path],
            )
            .map_err(e)?;
        Ok(())
    }

    /// The admin's retention of a folder (none: the server's default) and
    /// the owner's (none: not shortened).
    pub fn trash_days(&self, folder: &str) -> R<(Option<u32>, Option<u32>)> {
        self.conn()
            .query_row(
                "SELECT trash_days, trash_owner_days FROM folders WHERE id = ?1",
                [folder],
                |r| Ok((r.get::<_, Option<u32>>(0)?, r.get::<_, Option<u32>>(1)?)),
            )
            .optional()
            .map_err(e)
            .map(Option::unwrap_or_default)
    }

    /// The admin's retention of a folder; none for the server's default.
    pub fn set_trash_days(&self, folder: &str, days: Option<u32>) -> R<()> {
        self.conn()
            .execute(
                "UPDATE folders SET trash_days = ?2 WHERE id = ?1",
                params![folder, days],
            )
            .map_err(e)?;
        Ok(())
    }

    /// The owner's shortening of a folder's retention; none for none.
    pub fn set_trash_owner_days(&self, folder: &str, days: Option<u32>) -> R<()> {
        self.conn()
            .execute(
                "UPDATE folders SET trash_owner_days = ?2 WHERE id = ?1",
                params![folder, days],
            )
            .map_err(e)?;
        Ok(())
    }
}

/// One folder's bin records, as the core reads and writes them.
pub struct FolderBook<'a> {
    pub db: &'a Db,
    pub folder: &'a str,
}

impl TrashBook for FolderBook<'_> {
    fn records(&mut self) -> Result<Vec<TrashRecord>, String> {
        self.db.trash_records(self.folder)
    }
    fn put(&mut self, record: &TrashRecord) -> Result<(), String> {
        self.db.put_trash_record(self.folder, record)
    }
    /// An entry gone from the bin for good: what it kept of a table goes
    /// too (`Db::campaign_binned`). A restore keeps it ([`Restoring`]).
    fn forget(&mut self, path: &str) -> Result<(), String> {
        self.db.forget_trash_record(self.folder, path)?;
        self.db.campaign_unbinned(self.folder, path).map(|_| ())
    }
}

/// The book of a restore: the entry's record goes, what it kept of a table
/// stays, for the restore to carry to where the entry landed
/// (`Db::campaign_restored`).
pub struct Restoring<'a>(pub FolderBook<'a>);

impl TrashBook for Restoring<'_> {
    fn records(&mut self) -> Result<Vec<TrashRecord>, String> {
        self.0.records()
    }
    fn put(&mut self, record: &TrashRecord) -> Result<(), String> {
        self.0.put(record)
    }
    fn forget(&mut self, path: &str) -> Result<(), String> {
        self.0.db.forget_trash_record(self.0.folder, path)
    }
}
