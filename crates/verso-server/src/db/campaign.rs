// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A table is a campaign folder (ADR 0110): which folders of a server
//! folder are tables, open or closed, the table's own limits, and, per
//! note, whether it is released to the players, whether its name is a
//! secret and who may edit it. All of it lives in the server's database,
//! never in a note's file (ADR 0110 item 4): a synced copy, or Obsidian,
//! sees ordinary notes.
//!
//! A note with no row is **hidden**: a note in a table folder starts hidden
//! (MC.2 = A), the ones already there when the folder becomes a table and
//! the ones made later alike. "Release all" writes a row per note.

use rusqlite::{OptionalExtension, params};

use super::{Db, R, e, now};

/// Schema 15: the tables of a folder and the state of their notes.
pub(super) const CAMPAIGN: &str = r"
CREATE TABLE campaigns (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  root TEXT NOT NULL,
  open INTEGER NOT NULL DEFAULT 1,
  log_max INTEGER NOT NULL DEFAULT 20000,
  image_max INTEGER NOT NULL DEFAULT 10485760,
  created INTEGER NOT NULL,
  PRIMARY KEY (folder, root)
);
CREATE TABLE campaign_notes (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  released INTEGER NOT NULL DEFAULT 0,
  secret_name INTEGER NOT NULL DEFAULT 0,
  grant_kind TEXT NOT NULL DEFAULT 'none' CHECK (grant_kind IN ('none', 'group', 'player')),
  grant_account TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  PRIMARY KEY (folder, path)
);
";

/// The table log's ceiling a table gets, and the bounds its owner may set
/// it within (ADR 0110, MS.1).
pub const LOG_DEFAULT: i64 = 20_000;
pub const LOG_LEAST: i64 = 1_000;
pub const LOG_MOST: i64 = 200_000;
/// The image size limit a table gets, and its bounds (bytes).
pub const IMAGE_DEFAULT: i64 = 10 * 1024 * 1024;
pub const IMAGE_LEAST: i64 = 1024 * 1024;
pub const IMAGE_MOST: i64 = 30 * 1024 * 1024;

/// A folder made a table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Campaign {
    pub folder: String,
    /// The table's folder inside the server folder; `""` is the folder.
    pub root: String,
    pub open: bool,
    pub log_max: i64,
    pub image_max: i64,
}

/// Who may edit a note besides the owner.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum Grant {
    #[default]
    None,
    /// Every player at the table.
    Group,
    /// One account.
    Player(String),
}

/// What the server keeps about a note of a table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteState {
    pub path: String,
    pub released: bool,
    pub secret_name: bool,
    pub grant: Grant,
}

fn campaign(r: &rusqlite::Row<'_>) -> rusqlite::Result<Campaign> {
    Ok(Campaign {
        folder: r.get(0)?,
        root: r.get(1)?,
        open: r.get::<_, i64>(2)? != 0,
        log_max: r.get(3)?,
        image_max: r.get(4)?,
    })
}

fn note(r: &rusqlite::Row<'_>) -> rusqlite::Result<NoteState> {
    let kind: String = r.get(3)?;
    let account: Option<String> = r.get(4)?;
    Ok(NoteState {
        path: r.get(0)?,
        released: r.get::<_, i64>(1)? != 0,
        secret_name: r.get::<_, i64>(2)? != 0,
        grant: match (kind.as_str(), account) {
            ("group", _) => Grant::Group,
            ("player", Some(a)) => Grant::Player(a),
            _ => Grant::None,
        },
    })
}

impl Db {
    /// The tables of `folder`, the shortest root first.
    pub fn campaigns_of(&self, folder: &str) -> R<Vec<Campaign>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT folder, root, open, log_max, image_max FROM campaigns
                 WHERE folder = ?1 ORDER BY length(root), root",
            )
            .map_err(e)?;
        st.query_map([folder], campaign)
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)
    }

    /// The folders that are a table at all (the server asks it on every
    /// command of a non-owner; the answer is cached by the caller).
    pub fn campaign_exists(&self, folder: &str) -> R<bool> {
        self.reader()
            .query_row(
                "SELECT 1 FROM campaigns WHERE folder = ?1 LIMIT 1",
                [folder],
                |_| Ok(()),
            )
            .optional()
            .map(|r| r.is_some())
            .map_err(e)
    }

    /// Make `root` of `folder` a table: whether it was not one already.
    pub fn campaign_make(&self, folder: &str, root: &str) -> R<bool> {
        let n = self
            .conn()
            .execute(
                "INSERT OR IGNORE INTO campaigns (folder, root, created) VALUES (?1, ?2, ?3)",
                params![folder, root, now()],
            )
            .map_err(e)?;
        Ok(n > 0)
    }

    /// Turn the table at `root` back into a folder: its notes' state goes
    /// with it (what was released stays in the files, which never changed).
    pub fn campaign_drop(&self, folder: &str, root: &str) -> R<bool> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let n = tx
            .execute(
                "DELETE FROM campaigns WHERE folder = ?1 AND root = ?2",
                params![folder, root],
            )
            .map_err(e)?;
        if n > 0 {
            let under = under_sql(root);
            tx.execute(
                "DELETE FROM campaign_notes WHERE folder = ?1 AND (?2 = '' OR path = ?2 OR substr(path, 1, length(?3)) = ?3)",
                params![folder, root, under],
            )
            .map_err(e)?;
        }
        tx.commit().map_err(e)?;
        Ok(n > 0)
    }

    /// Change a table's settings; a value left `None` stays. The caller
    /// checks the bounds.
    pub fn campaign_set(
        &self,
        folder: &str,
        root: &str,
        open: Option<bool>,
        log_max: Option<i64>,
        image_max: Option<i64>,
    ) -> R<bool> {
        let n = self
            .conn()
            .execute(
                "UPDATE campaigns SET open = COALESCE(?3, open), log_max = COALESCE(?4, log_max),
                   image_max = COALESCE(?5, image_max) WHERE folder = ?1 AND root = ?2",
                params![folder, root, open.map(i64::from), log_max, image_max],
            )
            .map_err(e)?;
        Ok(n > 0)
    }

    /// Every note of `folder` the server keeps a state for.
    pub fn campaign_notes(&self, folder: &str) -> R<Vec<NoteState>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT path, released, secret_name, grant_kind, grant_account
                 FROM campaign_notes WHERE folder = ?1 ORDER BY path",
            )
            .map_err(e)?;
        st.query_map([folder], note)
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)
    }

    /// Release (or hide again) `paths`.
    pub fn campaign_release(&self, folder: &str, paths: &[String], released: bool) -> R<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        for p in paths {
            tx.execute(
                "INSERT INTO campaign_notes (folder, path, released) VALUES (?1, ?2, ?3)
                 ON CONFLICT (folder, path) DO UPDATE SET released = excluded.released",
                params![folder, p, i64::from(released)],
            )
            .map_err(e)?;
        }
        tx.commit().map_err(e)
    }

    /// A note's name is a secret, or not.
    pub fn campaign_secret_name(&self, folder: &str, path: &str, on: bool) -> R<()> {
        self.conn()
            .execute(
                "INSERT INTO campaign_notes (folder, path, secret_name) VALUES (?1, ?2, ?3)
                 ON CONFLICT (folder, path) DO UPDATE SET secret_name = excluded.secret_name",
                params![folder, path, i64::from(on)],
            )
            .map_err(e)?;
        Ok(())
    }

    /// Who may edit a note.
    pub fn campaign_grant(&self, folder: &str, path: &str, grant: &Grant) -> R<()> {
        let (kind, account) = match grant {
            Grant::None => ("none", None),
            Grant::Group => ("group", None),
            Grant::Player(a) => ("player", Some(a.as_str())),
        };
        self.conn()
            .execute(
                "INSERT INTO campaign_notes (folder, path, grant_kind, grant_account)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT (folder, path) DO UPDATE SET
                   grant_kind = excluded.grant_kind, grant_account = excluded.grant_account",
                params![folder, path, kind, account],
            )
            .map_err(e)?;
        Ok(())
    }

    /// `from` (a note or a folder) was renamed or moved to `to`: the state
    /// of what it holds, and the tables rooted in it, follow.
    pub fn campaign_move(&self, folder: &str, from: &str, to: &str) -> R<usize> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let under = under_sql(from);
        let mut touched = 0;
        for (table, column) in [("campaign_notes", "path"), ("campaigns", "root")] {
            touched += tx
                .execute(
                    &format!(
                        "UPDATE {table} SET {column} = CASE WHEN {column} = ?2 THEN ?4
                           ELSE ?4 || substr({column}, length(?2) + 1) END
                         WHERE folder = ?1 AND ?2 <> ''
                           AND ({column} = ?2 OR substr({column}, 1, length(?3)) = ?3)"
                    ),
                    params![folder, from, under, to],
                )
                .map_err(e)?;
        }
        tx.commit().map_err(e)?;
        Ok(touched)
    }

    /// `path` (a note or a folder) was deleted: the state of what it held
    /// goes, and a table rooted in it.
    pub fn campaign_deleted(&self, folder: &str, path: &str) -> R<usize> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let under = under_sql(path);
        let mut touched = 0;
        for (table, column) in [("campaign_notes", "path"), ("campaigns", "root")] {
            touched += tx
                .execute(
                    &format!(
                        "DELETE FROM {table} WHERE folder = ?1 AND ?2 <> ''
                           AND ({column} = ?2 OR substr({column}, 1, length(?3)) = ?3)"
                    ),
                    params![folder, path, under],
                )
                .map_err(e)?;
        }
        tx.commit().map_err(e)?;
        Ok(touched)
    }

    /// An account left the folder (or the share): the notes granted to it
    /// are granted to no one.
    pub fn campaign_ungrant_account(&self, folder: &str, account: &str) -> R<usize> {
        self.conn()
            .execute(
                "UPDATE campaign_notes SET grant_kind = 'none', grant_account = NULL
                 WHERE folder = ?1 AND grant_kind = 'player' AND grant_account = ?2",
                params![folder, account],
            )
            .map_err(e)
    }
}

/// `path` followed by `/`: the prefix of what lies under it.
fn under_sql(path: &str) -> String {
    format!("{path}/")
}
