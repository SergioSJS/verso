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
//! A note's **audience** (ADR 0110 item 4, amended 2026-10-23) is nobody, the
//! whole table (`released`) or a set of the table's players
//! (`campaign_audience`, schema 17).
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

/// Schema 17: a note released to some players (ADR 0110 item 4, amended
/// 2026-10-23). `released = 1` is the whole table, as it always was; with
/// `released = 0`, the rows of `campaign_audience` are the players who see
/// the note, none is hidden. `campaign_lost` keeps, per change of the sync
/// log, the players who lost a note with it, so that their device is told
/// to let it go while another player's is told nothing; `campaign_gone` holds,
/// until the deletion is recorded, who saw a note that was deleted.
/// `campaign_epoch` is the change of the sync log from which the players
/// of a folder each have a log of their own (the change before it is
/// every player's); `campaign_viewer` and `campaign_skip` keep, per player,
/// up to which change that log was settled and the changes it leaves out:
/// a log whose members never change once a device has counted them.
pub(super) const AUDIENCE: &str = r"
CREATE TABLE campaign_audience (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (folder, path, account)
);
CREATE TABLE campaign_lost (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (folder, seq, account)
);
CREATE TABLE campaign_epoch (
  folder TEXT PRIMARY KEY REFERENCES folders(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL
);
CREATE TABLE campaign_viewer (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  settled INTEGER NOT NULL,
  PRIMARY KEY (folder, account)
);
CREATE TABLE campaign_skip (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  PRIMARY KEY (folder, account, seq)
);
CREATE TABLE campaign_gone (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (folder, path, account)
);
";

/// Schema 18: a table made before the players' logs were their own wherever
/// there is a table has the epoch its folder's log stood at, so that the
/// numbers the readers' devices hold go on from there: nothing is skipped
/// or sent twice at the upgrade.
pub(super) const EPOCHS: &str = r"
INSERT OR IGNORE INTO campaign_epoch (folder, seq)
  SELECT folder, (SELECT COALESCE(MAX(c.seq), 0) FROM changes c WHERE c.folder = campaigns.folder)
  FROM campaigns GROUP BY folder;
";

/// Schema 19: the players of a table the game master let send images to its
/// chat (ADR 0107 item 3 as amended 2026-10-24). A row is a permission
/// given; no row, none (the default). It goes with the table, and with the
/// account when it no longer reads the folder.
pub(super) const IMAGES: &str = r"
CREATE TABLE campaign_images (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  root TEXT NOT NULL,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (folder, root, account)
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

/// Who a note is released to.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum Audience {
    #[default]
    Hidden,
    /// Every player at the table.
    Table,
    /// These players, by account (never empty).
    Players(std::collections::BTreeSet<String>),
}

impl Audience {
    /// Whether `account` is in it.
    #[must_use]
    pub fn includes(&self, account: &str) -> bool {
        match self {
            Self::Hidden => false,
            Self::Table => true,
            Self::Players(set) => set.contains(account),
        }
    }

    /// Whether anyone is.
    #[must_use]
    pub fn any(&self) -> bool {
        !matches!(self, Self::Hidden)
    }

    /// Whether it is some players and not the table.
    #[must_use]
    pub fn is_players(&self) -> bool {
        matches!(self, Self::Players(_))
    }
}

/// What the server keeps about a note of a table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteState {
    pub path: String,
    pub audience: Audience,
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
        audience: if r.get::<_, i64>(1)? != 0 {
            Audience::Table
        } else {
            Audience::Hidden
        },
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

    /// Make `root` of `folder` a table: whether it was not one already. The
    /// table, the log the folder had so far and the epoch of the players'
    /// logs are one step.
    pub fn campaign_make(&self, folder: &str, root: &str) -> R<bool> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let n = tx
            .execute(
                "INSERT OR IGNORE INTO campaigns (folder, root, created) VALUES (?1, ?2, ?3)",
                params![folder, root, now()],
            )
            .map_err(e)?;
        // The folder's first table takes the log the folder had so far
        // (the same rule as schema 16): nothing is left behind.
        if n > 0 {
            tx.execute(
                "UPDATE table_log SET tbl = ?2 WHERE folder = ?1 AND tbl = ''
                   AND (SELECT COUNT(*) FROM campaigns WHERE folder = ?1) = 1",
                params![folder, root],
            )
            .map_err(e)?;
            // The folder's readers have counted its log as one for everyone
            // up to here; from here each player's is its own.
            players_logs_begin(&tx, folder)?;
        }
        tx.commit().map_err(e)?;
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
            for table in ["campaign_notes", "campaign_audience"] {
                tx.execute(
                    &format!("DELETE FROM {table} WHERE folder = ?1 AND (?2 = '' OR path = ?2 OR substr(path, 1, length(?3)) = ?3)"),
                    params![folder, root, under],
                )
                .map_err(e)?;
            }
            tx.execute(
                "DELETE FROM campaign_images WHERE folder = ?1 AND root = ?2",
                params![folder, root],
            )
            .map_err(e)?;
            rehome_log(&tx, folder)?;
            forget_players_logs(&tx, folder)?;
        }
        tx.commit().map_err(e)?;
        Ok(n > 0)
    }

    /// The accounts the table at `root` lets send images.
    pub fn campaign_images_of(&self, folder: &str, root: &str) -> R<Vec<String>> {
        let conn = self.reader();
        let mut st = conn
            .prepare("SELECT account FROM campaign_images WHERE folder = ?1 AND root = ?2 ORDER BY account")
            .map_err(e)?;
        st.query_map(params![folder, root], |r| r.get(0))
            .map_err(e)?
            .collect::<Result<_, _>>()
            .map_err(e)
    }

    /// Whether `account` was let send images at the table at `root`.
    pub fn campaign_images_has(&self, folder: &str, root: &str, account: &str) -> R<bool> {
        self.reader()
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM campaign_images WHERE folder = ?1 AND root = ?2 AND account = ?3)",
                params![folder, root, account],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// Every (folder, account) let send images at some table.
    pub fn campaign_images_all(&self) -> R<Vec<(String, String)>> {
        let conn = self.reader();
        let mut st = conn
            .prepare("SELECT DISTINCT folder, account FROM campaign_images")
            .map_err(e)?;
        st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(e)?
            .collect::<Result<_, _>>()
            .map_err(e)
    }

    /// Whether `account` was let send images at any table of `folder`.
    pub fn campaign_images_any(&self, folder: &str, account: &str) -> R<bool> {
        self.reader()
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM campaign_images WHERE folder = ?1 AND account = ?2)",
                params![folder, account],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// Give `accounts` the permission to send images at the table at
    /// `root`, or take it from them.
    pub fn campaign_images_set(
        &self,
        folder: &str,
        root: &str,
        accounts: &[String],
        on: bool,
    ) -> R<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        for a in accounts {
            if on {
                tx.execute(
                    "INSERT OR IGNORE INTO campaign_images (folder, root, account) VALUES (?1, ?2, ?3)",
                    params![folder, root, a],
                )
            } else {
                tx.execute(
                    "DELETE FROM campaign_images WHERE folder = ?1 AND root = ?2 AND account = ?3",
                    params![folder, root, a],
                )
            }
            .map_err(e)?;
        }
        tx.commit().map_err(e)
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
        let mut notes = st
            .query_map([folder], note)
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        let mut st = conn
            .prepare("SELECT path, account FROM campaign_audience WHERE folder = ?1 ORDER BY path")
            .map_err(e)?;
        let rows = st
            .query_map([folder], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        for n in &mut notes {
            if n.audience == Audience::Table {
                continue;
            }
            let set: std::collections::BTreeSet<String> = rows
                .iter()
                .filter(|(p, _)| *p == n.path)
                .map(|(_, a)| a.clone())
                .collect();
            if !set.is_empty() {
                n.audience = Audience::Players(set);
            }
        }
        Ok(notes)
    }

    /// Release (or hide again) `paths`: to the whole table, or to nobody.
    pub fn campaign_release(&self, folder: &str, paths: &[String], released: bool) -> R<()> {
        let audience = if released {
            Audience::Table
        } else {
            Audience::Hidden
        };
        self.campaign_audience(folder, paths, &audience)
    }

    /// Release `paths` to `audience`. A grant that no longer holds with the
    /// new audience goes: the whole group edits only a note the whole table
    /// sees, and a player edits only one it sees; a note nobody sees is
    /// edited by nobody.
    pub fn campaign_audience(&self, folder: &str, paths: &[String], audience: &Audience) -> R<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        // From the moment a note is released to some players, in the same
        // step: the players' logs are each their own. A failed step leaves
        // neither the audience nor the epoch.
        if audience.is_players() {
            players_logs_begin(&tx, folder)?;
        }
        for p in paths {
            tx.execute(
                "INSERT INTO campaign_notes (folder, path, released) VALUES (?1, ?2, ?3)
                 ON CONFLICT (folder, path) DO UPDATE SET released = excluded.released",
                params![folder, p, i64::from(*audience == Audience::Table)],
            )
            .map_err(e)?;
            tx.execute(
                "DELETE FROM campaign_audience WHERE folder = ?1 AND path = ?2",
                params![folder, p],
            )
            .map_err(e)?;
            if let Audience::Players(set) = audience {
                for a in set {
                    tx.execute(
                        "INSERT INTO campaign_audience (folder, path, account) VALUES (?1, ?2, ?3)",
                        params![folder, p, a],
                    )
                    .map_err(e)?;
                }
            }
            match audience {
                Audience::Table => {}
                Audience::Hidden => {
                    tx.execute(
                        "UPDATE campaign_notes SET grant_kind = 'none', grant_account = NULL
                         WHERE folder = ?1 AND path = ?2",
                        params![folder, p],
                    )
                    .map_err(e)?;
                }
                Audience::Players(set) => {
                    tx.execute(
                        "UPDATE campaign_notes SET grant_kind = 'none', grant_account = NULL
                         WHERE folder = ?1 AND path = ?2
                           AND (grant_kind = 'group'
                                OR (grant_kind = 'player' AND grant_account NOT IN (SELECT value FROM json_each(?3))))",
                        params![
                            folder,
                            p,
                            serde_json::to_string(&set.iter().collect::<Vec<_>>())
                                .map_err(|x| x.to_string())?
                        ],
                    )
                    .map_err(e)?;
                }
            }
        }
        tx.commit().map_err(e)
    }

    /// The note at `path` is about to be deleted or renamed and `accounts`
    /// see it: the deletion the sync log records next tells their devices.
    /// What an earlier, unrecorded step left for the path goes first.
    pub fn campaign_gone_add(&self, folder: &str, path: &str, accounts: &[String]) -> R<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        tx.execute(
            "DELETE FROM campaign_gone WHERE folder = ?1 AND path = ?2",
            params![folder, path],
        )
        .map_err(e)?;
        for a in accounts {
            tx.execute(
                "INSERT OR IGNORE INTO campaign_gone (folder, path, account) VALUES (?1, ?2, ?3)",
                params![folder, path, a],
            )
            .map_err(e)?;
        }
        tx.commit().map_err(e)
    }

    /// What was remembered for `path` and the files under it is dropped: a
    /// deletion, a rename or a move that did not run.
    pub fn campaign_gone_clear(&self, folder: &str, path: &str) -> R<()> {
        self.conn()
            .execute(
                "DELETE FROM campaign_gone WHERE folder = ?1
                   AND (path = ?2 OR substr(path, 1, length(?3)) = ?3)",
                params![folder, path, under_sql(path)],
            )
            .map_err(e)?;
        Ok(())
    }

    /// Who is remembered for the deleted note at `path`, left in place.
    pub fn campaign_gone_peek(&self, folder: &str, path: &str) -> R<Vec<String>> {
        let conn = self.reader();
        let mut st = conn
            .prepare("SELECT account FROM campaign_gone WHERE folder = ?1 AND path = ?2")
            .map_err(e)?;
        st.query_map(params![folder, path], |r| r.get::<_, String>(0))
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)
    }

    /// Who saw the deleted note at `path`, taken: asked once, as the
    /// deletion is recorded.
    pub fn campaign_gone_take(&self, folder: &str, path: &str) -> R<Vec<String>> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let out = {
            let mut st = tx
                .prepare("SELECT account FROM campaign_gone WHERE folder = ?1 AND path = ?2")
                .map_err(e)?;
            st.query_map(params![folder, path], |r| r.get::<_, String>(0))
                .map_err(e)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(e)?
        };
        tx.execute(
            "DELETE FROM campaign_gone WHERE folder = ?1 AND path = ?2",
            params![folder, path],
        )
        .map_err(e)?;
        tx.commit().map_err(e)?;
        Ok(out)
    }

    /// The changes (by number) after `after`, up to `until`, at which
    /// `account` lost a path, or saw it deleted.
    pub fn campaign_lost_of(
        &self,
        folder: &str,
        account: &str,
        (after, until): (i64, i64),
    ) -> R<std::collections::HashSet<i64>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT seq FROM campaign_lost
                 WHERE folder = ?1 AND account = ?2 AND seq > ?3 AND seq <= ?4",
            )
            .map_err(e)?;
        st.query_map(params![folder, account, after, until], |r| {
            r.get::<_, i64>(0)
        })
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
    }

    /// Whether `account` was told `path` deleted before change `before`:
    /// the rename at `before` came from a name it knew.
    pub fn campaign_lost_path(
        &self,
        folder: &str,
        account: &str,
        path: &str,
        before: i64,
    ) -> R<bool> {
        self.reader()
            .query_row(
                "SELECT 1 FROM changes c JOIN campaign_lost l ON l.folder = c.folder AND l.seq = c.seq
                 WHERE c.folder = ?1 AND c.path = ?3 AND c.deleted = 1 AND c.seq < ?4 AND l.account = ?2
                 LIMIT 1",
                params![folder, account, path, before],
                |_| Ok(()),
            )
            .optional()
            .map(|r| r.is_some())
            .map_err(e)
    }

    /// The change from which the players of `folder` each have a sync log
    /// of their own; none while they share one.
    pub fn campaign_epoch(&self, folder: &str) -> R<Option<i64>> {
        self.reader()
            .query_row(
                "SELECT seq FROM campaign_epoch WHERE folder = ?1",
                [folder],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)
    }

    /// Where `account`'s log was settled to: every change up to it is
    /// decided. None before its first ask.
    pub fn campaign_viewer(&self, folder: &str, account: &str) -> R<Option<i64>> {
        self.reader()
            .query_row(
                "SELECT settled FROM campaign_viewer WHERE folder = ?1 AND account = ?2",
                params![folder, account],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)
    }

    /// The changes after `after` that `account`'s log leaves out already:
    /// those its notices said at the change, before any ask.
    pub fn campaign_skips_after(
        &self,
        folder: &str,
        account: &str,
        after: i64,
    ) -> R<std::collections::HashSet<i64>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT seq FROM campaign_skip WHERE folder = ?1 AND account = ?2 AND seq > ?3",
            )
            .map_err(e)?;
        st.query_map(params![folder, account, after], |r| r.get::<_, i64>(0))
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)
    }

    /// `account`'s log is settled up to change `upto`; `skips` are the
    /// changes it leaves out.
    pub fn campaign_settle(&self, folder: &str, account: &str, upto: i64, skips: &[i64]) -> R<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        for q in skips {
            tx.execute(
                "INSERT OR IGNORE INTO campaign_skip (folder, account, seq) VALUES (?1, ?2, ?3)",
                params![folder, account, q],
            )
            .map_err(e)?;
        }
        tx.execute(
            "INSERT INTO campaign_viewer (folder, account, settled) VALUES (?1, ?2, ?3)
             ON CONFLICT (folder, account) DO UPDATE SET settled = MAX(settled, excluded.settled)",
            params![folder, account, upto],
        )
        .map_err(e)?;
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

    /// Who may edit a note. A player who edits a note sees it: when the note
    /// is not the table's, the player joins its audience. The grant and the
    /// audience are one step.
    pub fn campaign_grant(&self, folder: &str, path: &str, grant: &Grant) -> R<()> {
        let (kind, account) = match grant {
            Grant::None => ("none", None),
            Grant::Group => ("group", None),
            Grant::Player(a) => ("player", Some(a.as_str())),
        };
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        tx.execute(
            "INSERT INTO campaign_notes (folder, path, grant_kind, grant_account)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (folder, path) DO UPDATE SET
               grant_kind = excluded.grant_kind, grant_account = excluded.grant_account",
            params![folder, path, kind, account],
        )
        .map_err(e)?;
        if let Grant::Player(a) = grant {
            let whole: bool = tx
                .query_row(
                    "SELECT released FROM campaign_notes WHERE folder = ?1 AND path = ?2",
                    params![folder, path],
                    |r| Ok(r.get::<_, i64>(0)? != 0),
                )
                .map_err(e)?;
            if !whole {
                players_logs_begin(&tx, folder)?;
                tx.execute(
                    "INSERT OR IGNORE INTO campaign_audience (folder, path, account) VALUES (?1, ?2, ?3)",
                    params![folder, path, a],
                )
                .map_err(e)?;
            }
        }
        tx.commit().map_err(e)
    }

    /// `from` (a note or a folder) was renamed or moved to `to`: the state
    /// of what it holds, and the tables rooted in it, follow.
    pub fn campaign_move(&self, folder: &str, from: &str, to: &str) -> R<usize> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let under = under_sql(from);
        let mut touched = 0;
        for (table, column) in [
            ("campaign_notes", "path"),
            ("campaign_audience", "path"),
            ("campaigns", "root"),
            ("table_log", "tbl"),
        ] {
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
        tx.execute(
            "UPDATE campaign_images SET root = CASE WHEN root = ?2 THEN ?4
               ELSE ?4 || substr(root, length(?2) + 1) END
             WHERE folder = ?1 AND ?2 <> '' AND (root = ?2 OR substr(root, 1, length(?3)) = ?3)",
            params![folder, from, under, to],
        )
        .map_err(e)?;
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
        for (table, column) in [
            ("campaign_notes", "path"),
            ("campaign_audience", "path"),
            ("campaigns", "root"),
        ] {
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
        tx.execute(
            "DELETE FROM campaign_images WHERE folder = ?1 AND ?2 <> ''
               AND (root = ?2 OR substr(root, 1, length(?3)) = ?3)",
            params![folder, path, under],
        )
        .map_err(e)?;
        rehome_log(&tx, folder)?;
        forget_players_logs(&tx, folder)?;
        tx.commit().map_err(e)?;
        Ok(touched)
    }

    /// An account may no longer read the folder (it left it or its share, or
    /// its role writes): the notes granted to it are granted to no one, it is
    /// in no audience, and what its log kept goes — so that if it is let in
    /// again it begins anew, and never inherits the audiences it had or counts
    /// what happened while it was out. Nothing, if it still reads the folder
    /// by another way.
    pub fn campaign_account_left(&self, folder: &str, account: &str) -> R<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let reads: bool = tx
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM grants WHERE folder = ?1 AND account = ?2 AND role = 'reader')
                     OR EXISTS (SELECT 1 FROM share_grants g JOIN shares s ON s.id = g.share
                                WHERE s.folder = ?1 AND g.account = ?2 AND g.role = 'reader')",
                params![folder, account],
                |r| r.get(0),
            )
            .map_err(e)?;
        // A permission to send images is a player's at one table: it goes
        // when the account stops being a player of THAT table, so that being
        // seated again never grants it silently.
        tx.execute(
            "DELETE FROM campaign_images WHERE folder = ?1 AND account = ?2 AND NOT (
               EXISTS (SELECT 1 FROM grants WHERE folder = ?1 AND account = ?2 AND role = 'reader')
               OR EXISTS (SELECT 1 FROM share_grants g JOIN shares s ON s.id = g.share
                          WHERE s.folder = ?1 AND g.account = ?2 AND g.role = 'reader'
                            AND (s.path = '' OR root = '' OR root = s.path
                                 OR substr(root, 1, length(s.path) + 1) = s.path || '/'
                                 OR substr(s.path, 1, length(root) + 1) = root || '/')))",
            params![folder, account],
        )
        .map_err(e)?;
        if reads {
            return tx.commit().map_err(e);
        }
        for table in [
            "campaign_audience",
            "campaign_viewer",
            "campaign_skip",
            "campaign_lost",
            "campaign_gone",
            "campaign_images",
        ] {
            tx.execute(
                &format!("DELETE FROM {table} WHERE folder = ?1 AND account = ?2"),
                params![folder, account],
            )
            .map_err(e)?;
        }
        tx.execute(
            "UPDATE campaign_notes SET grant_kind = 'none', grant_account = NULL
             WHERE folder = ?1 AND grant_kind = 'player' AND grant_account = ?2",
            params![folder, account],
        )
        .map_err(e)?;
        tx.commit().map_err(e)
    }
}

/// The players' logs of `folder` begin after its last change, once: from
/// here on a note is released to some players. The change before it is
/// every player's.
fn players_logs_begin(conn: &rusqlite::Connection, folder: &str) -> R<()> {
    conn.execute(
        "INSERT OR IGNORE INTO campaign_epoch (folder, seq)
         SELECT ?1, COALESCE(MAX(seq), 0) FROM changes WHERE folder = ?1",
        [folder],
    )
    .map_err(e)?;
    Ok(())
}

/// A folder with no table left has no player's log of its own: the
/// numbers a device counted in one would run ahead of the shared log's if
/// a table were made again, so what keeps them goes with the last table
/// and the next one begins anew.
fn forget_players_logs(conn: &rusqlite::Connection, folder: &str) -> R<()> {
    let left: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM campaigns WHERE folder = ?1",
            [folder],
            |r| r.get(0),
        )
        .map_err(e)?;
    if left > 0 {
        return Ok(());
    }
    for table in [
        "campaign_epoch",
        "campaign_viewer",
        "campaign_skip",
        "campaign_lost",
        "campaign_gone",
        "campaign_audience",
    ] {
        conn.execute(&format!("DELETE FROM {table} WHERE folder = ?1"), [folder])
            .map_err(e)?;
    }
    Ok(())
}

/// A folder with no table left keeps its log as the folder's own
/// (`tbl = ''`): the entries of a table that went are not lost, and come
/// back to it if it is made again only while another table stays.
fn rehome_log(conn: &rusqlite::Connection, folder: &str) -> R<()> {
    conn.execute(
        "UPDATE table_log SET tbl = '' WHERE folder = ?1
           AND NOT EXISTS (SELECT 1 FROM campaigns WHERE folder = ?1)",
        [folder],
    )
    .map_err(e)?;
    Ok(())
}

/// `path` followed by `/`: the prefix of what lies under it.
fn under_sql(path: &str) -> String {
    format!("{path}/")
}
