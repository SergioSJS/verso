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

/// A manifest row with what a reader is told of it: the file's hash and
/// size, the reader's hash and size when kept, and the quick key.
pub type ManifestRow = (String, i64, Option<String>, Option<i64>, String);

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

/// What a reader is told of the notes that hold secret blocks (ADR 0087
/// item 4): by path, the hash and size of the projection. A path not in
/// it is told as the file is.
pub type ReaderOf = HashMap<String, (String, i64)>;

/// What a table's audience says of a change as it is recorded (ADR 0110
/// item 4, amended 2026-10-23), by the path of the change. It is written in
/// the transaction that records the change, so that no reader of the log
/// ever finds the change without it.
#[derive(Debug, Clone, Default)]
pub struct Notice {
    /// Every reader's log holds the change, even if the file is told to a
    /// reader as it was: the change is who sees the note, not what it holds.
    pub force: bool,
    /// The players who lose the note with it (or who saw the path that
    /// was deleted): their log tells them the path is gone.
    pub lost: Vec<String>,
    /// The players whose own log leaves the change out.
    pub skip: Vec<String>,
    /// A deletion: also the players remembered for the path
    /// (`campaign_gone`), taken in the transaction that records it and
    /// kept to `only` — the accounts that are still players.
    pub remember: bool,
    pub only: Option<Vec<String>>,
}

/// The notices of the changes being recorded, by path.
pub type Notices = HashMap<String, Notice>;

/// One who may only read is told the projection's hash and size.
const READER_FILE: &str = "COALESCE(reader_hash, hash), COALESCE(reader_size, size)";

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
    /// Who made it: the account's name, or its e-mail when it has none;
    /// absent for a change found on the server's disk (sync 2, ADR 0079
    /// item 5). A device's recent activity says "by <person> on
    /// <device>".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by: Option<String>,
}

/// A change a share sees: its path, or its path before a rename, is one
/// of two roots or inside it (`?3`, `?4`; the same twice when the share
/// shows no attachments folder) — `covers` in SQL, without `LIKE`, so a
/// `%` or `_` in a folder's name is only itself.
const SEEN: &str = "(path = ?3 OR substr(path, 1, length(?3) + 1) = ?3 || '/' \
     OR path = ?4 OR substr(path, 1, length(?4) + 1) = ?4 || '/' \
     OR renamed_from = ?3 OR substr(renamed_from, 1, length(?3) + 1) = ?3 || '/' \
     OR renamed_from = ?4 OR substr(renamed_from, 1, length(?4) + 1) = ?4 || '/')";

/// A change of the log as a reader is told it (see
/// [`Db::reader_changes_since`]).
const READER_CHANGE: &str = "SELECT c.seq, c.path,
        CASE WHEN c.deleted = 1 OR COALESCE(c.reader_size, 0) < 0 THEN NULL ELSE COALESCE(c.reader_hash, c.hash) END,
        CASE WHEN COALESCE(c.reader_size, 0) < 0 THEN 0 ELSE COALESCE(c.reader_size, c.size) END,
        (c.deleted = 1 OR COALESCE(c.reader_size, 0) < 0), c.renamed_from, c.device,
        COALESCE(NULLIF(a.name, ''), a.email)
 FROM changes c LEFT JOIN accounts a ON a.id = c.actor";

fn change_of(r: &rusqlite::Row<'_>) -> rusqlite::Result<Change> {
    Ok(Change {
        seq: r.get(0)?,
        path: r.get(1)?,
        hash: r.get(2)?,
        size: r.get(3)?,
        deleted: r.get(4)?,
        renamed_from: r.get(5)?,
        device: r.get(6)?,
        by: r.get(7)?,
    })
}

/// Whether a change is one every reader's log holds.
fn forces(n: &Notice) -> bool {
    n.force || !n.lost.is_empty()
}

/// The notice of a deletion with the players remembered for its path.
fn merged_notice(
    tx: &rusqlite::Transaction<'_>,
    folder: &str,
    path: &str,
    notice: Option<&Notice>,
) -> R<Option<Notice>> {
    let Some(n) = notice else {
        return Ok(None);
    };
    let mut out = n.clone();
    if n.remember {
        let taken: Vec<String> = {
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
        for a in taken {
            if n.only.as_ref().is_none_or(|o| o.contains(&a)) && !out.lost.contains(&a) {
                out.lost.push(a);
            }
        }
    }
    Ok(Some(out))
}

/// What the change at `seq` carries of its table's audience: the players
/// who lost the path, and those whose log leaves it out.
fn audience_of_change(
    tx: &rusqlite::Transaction<'_>,
    folder: &str,
    seq: i64,
    notice: Option<&Notice>,
) -> R<()> {
    let Some(n) = notice else {
        return Ok(());
    };
    for a in &n.lost {
        tx.execute(
            "INSERT OR IGNORE INTO campaign_lost (folder, seq, account) VALUES (?1, ?2, ?3)",
            params![folder, seq, a],
        )
        .map_err(e)?;
    }
    for a in n.skip.iter().filter(|a| !n.lost.contains(a)) {
        tx.execute(
            "INSERT OR IGNORE INTO campaign_skip (folder, account, seq) VALUES (?1, ?2, ?3)",
            params![folder, a, seq],
        )
        .map_err(e)?;
    }
    Ok(())
}

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
    /// `readers`: what a reader is told of the notes among `changes` and
    /// `recheck` that hold secret blocks; `recheck`, notes read again whose
    /// bytes did not change, their reader's hash kept up to date. Returns
    /// the head and, per change, whether a reader sees none (ADR 0087).
    pub fn record(
        &self,
        folder: &str,
        who: (Option<&str>, Option<&str>),
        changes: &[Recorded],
        quick: &[(String, String)],
        told: (&ReaderOf, &[String]),
    ) -> R<(i64, Vec<bool>)> {
        self.record_with(folder, who, changes, quick, told, &Notices::new())
    }

    /// [`Db::record`] with what a table's audience says of the changes: a
    /// change a notice forces, or names players who lost its path, is a
    /// change every reader's log holds; the players who lost it and those
    /// whose log leaves it out are kept in the same transaction.
    pub fn record_with(
        &self,
        folder: &str,
        (actor, device): (Option<&str>, Option<&str>),
        changes: &[Recorded],
        quick: &[(String, String)],
        (readers, recheck): (&ReaderOf, &[String]),
        notices: &Notices,
    ) -> R<(i64, Vec<bool>)> {
        let mut same_for_reader = Vec::with_capacity(changes.len());
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
                    let reader = readers.get(path);
                    // What a reader held of the path, and holds now: the
                    // same, and not moved, is no change for a reader.
                    let (before, before_hidden): (Option<String>, bool) = tx
                        .query_row(
                            "SELECT COALESCE(reader_hash, hash), COALESCE(reader_size, size) < 0 FROM manifest WHERE folder = ?1 AND path = ?2",
                            params![folder, path],
                            |r| Ok((Some(r.get(0)?), r.get(1)?)),
                        )
                        .optional()
                        .map_err(e)?
                        .unwrap_or((None, true));
                    let shown = reader.map_or(hash, |(h, _)| h);
                    // A note not served to a reader is none of its changes:
                    // unless it was served before — a note a table hides
                    // again (ADR 0110) — and the device must let it go.
                    let hidden = reader.is_some_and(|(_, s)| *s < 0);
                    let same = if hidden {
                        before_hidden
                    } else {
                        renamed_from.is_none() && before.as_ref() == Some(shown)
                    };
                    let same = same && !notices.get(path).is_some_and(forces);
                    same_for_reader.push(same);
                    let (rh, rs) = (reader.map(|r| &r.0), reader.map(|r| r.1));
                    tx.execute(
                        "INSERT INTO manifest (folder, path, hash, size, quick, seq, reader_hash, reader_size) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                         ON CONFLICT (folder, path) DO UPDATE SET hash = ?3, size = ?4, quick = ?5, seq = ?6, reader_hash = ?7, reader_size = ?8",
                        params![folder, path, hash, size, q, seq, rh, rs],
                    )
                    .map_err(e)?;
                    tx.execute(
                        "INSERT INTO changes (folder, seq, path, hash, size, deleted, renamed_from, actor, at, device, reader_hash, reader_size, reader_same) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                        params![folder, seq, path, hash, size, renamed_from, actor, at, device, rh, rs, same],
                    )
                    .map_err(e)?;
                    audience_of_change(&tx, folder, seq, notices.get(path))?;
                }
                None => {
                    // A file a reader was never told of (a table's hidden
                    // note, ADR 0110) is gone for it without a word: its
                    // name is not in the reader's log.
                    let unseen: bool = tx
                        .query_row(
                            "SELECT COALESCE(reader_size, size) < 0 FROM manifest WHERE folder = ?1 AND path = ?2",
                            params![folder, path],
                            |r| r.get(0),
                        )
                        .optional()
                        .map_err(e)?
                        .unwrap_or(false);
                    // Remembered in the step that records the deletion: no
                    // other step can take them first or leave them behind.
                    let merged = merged_notice(&tx, folder, path, notices.get(path))?;
                    let unseen = unseen && !merged.as_ref().is_some_and(forces);
                    same_for_reader.push(unseen);
                    tx.execute(
                        "DELETE FROM manifest WHERE folder = ?1 AND path = ?2",
                        params![folder, path],
                    )
                    .map_err(e)?;
                    tx.execute(
                        "INSERT INTO changes (folder, seq, path, hash, size, deleted, renamed_from, actor, at, device, reader_same) VALUES (?1, ?2, ?3, NULL, 0, 1, NULL, ?4, ?5, ?6, ?7)",
                        params![folder, seq, path, actor, at, device, unseen],
                    )
                    .map_err(e)?;
                    audience_of_change(&tx, folder, seq, merged.as_ref())?;
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
        for path in recheck {
            let reader = readers.get(path);
            tx.execute(
                "UPDATE manifest SET reader_hash = ?3, reader_size = ?4 WHERE folder = ?1 AND path = ?2",
                params![folder, path, reader.map(|r| &r.0), reader.map(|r| r.1)],
            )
            .map_err(e)?;
        }
        tx.commit().map_err(e)?;
        Ok((seq, same_for_reader))
    }

    /// The folder's files as a reader is told of them (ADR 0087): a note's
    /// hash and size its projection's.
    pub fn reader_manifest(&self, folder: &str) -> R<Vec<(String, String, i64)>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(&format!(
                "SELECT path, {READER_FILE} FROM manifest WHERE folder = ?1
                 AND COALESCE(reader_size, size) >= 0"
            ))
            .map_err(e)?;
        st.query_map([folder], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)
    }

    /// What each path of the folder's manifest holds for a reader besides
    /// the file's own: its hash and size, when they differ (ADR 0087, ADR
    /// 0110).
    pub fn manifest_readers(&self, folder: &str) -> R<HashMap<String, ManifestRow>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT path, hash, size, reader_hash, reader_size, quick FROM manifest WHERE folder = ?1",
            )
            .map_err(e)?;
        let rows = st
            .query_map([folder], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    (r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?),
                ))
            })
            .map_err(e)?
            .collect::<rusqlite::Result<HashMap<_, _>>>()
            .map_err(e)?;
        Ok(rows)
    }

    /// The last change a reader sees: one only inside a secret block is
    /// none (ADR 0087). 0 for none.
    pub fn reader_head(&self, folder: &str) -> R<i64> {
        self.reader()
            .query_row(
                "SELECT COALESCE(MAX(seq), 0) FROM changes WHERE folder = ?1 AND reader_same = 0",
                [folder],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// How many changes of the folder a reader sees up to its number `upto`:
    /// the reader's own count, which numbers its log with no gap for a
    /// change only inside a secret block (ADR 0087 item 4).
    pub fn reader_count(&self, folder: &str, upto: i64) -> R<i64> {
        self.reader()
            .query_row(
                "SELECT COUNT(*) FROM changes WHERE folder = ?1 AND seq <= ?2 AND reader_same = 0",
                params![folder, upto],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// The folder's number of the `n`-th change a reader sees (from 1, as
    /// [`Db::reader_count`] counts them); `None` when it sees fewer.
    pub fn reader_nth(&self, folder: &str, n: i64) -> R<Option<i64>> {
        if n < 1 {
            return Ok(None);
        }
        self.reader()
            .query_row(
                "SELECT seq FROM changes WHERE folder = ?1 AND reader_same = 0
                 ORDER BY seq LIMIT 1 OFFSET ?2",
                params![folder, n - 1],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)
    }

    /// [`Db::changes_since`] as a reader sees them: without the changes
    /// only inside secret blocks, a note's hash and size its projection's.
    pub fn reader_changes_since(&self, folder: &str, since: i64, limit: i64) -> R<Vec<Change>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(&format!(
                "{READER_CHANGE} WHERE c.folder = ?1 AND c.seq > ?2 AND c.reader_same = 0 ORDER BY c.seq LIMIT ?3"
            ))
            .map_err(e)?;
        st.query_map(params![folder, since, limit], change_of)
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)
    }

    /// The changes in `account`'s own log of a table's folder (ADR 0110
    /// item 4): the readers' changes up to `upto` less those its log
    /// leaves out (`campaign_skip`), from the `offset`-th, at most `limit`.
    pub fn campaign_member_changes(
        &self,
        (folder, account): (&str, &str),
        upto: i64,
        (offset, limit): (i64, i64),
    ) -> R<Vec<Change>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(&format!(
                "{READER_CHANGE} WHERE c.folder = ?1 AND c.seq <= ?2 AND c.reader_same = 0
                   AND NOT EXISTS (SELECT 1 FROM campaign_skip s
                                   WHERE s.folder = c.folder AND s.account = ?3 AND s.seq = c.seq)
                 ORDER BY c.seq LIMIT ?4 OFFSET ?5"
            ))
            .map_err(e)?;
        st.query_map(params![folder, upto, account, limit, offset], change_of)
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)
    }

    /// The changes of `account`'s own log that a share sees (its path, or
    /// its path before a rename, is inside one of `roots`): the same rows
    /// [`Db::campaign_member_changes`] holds, cut to the share.
    pub fn campaign_share_changes(
        &self,
        (folder, account): (&str, &str),
        (upto, roots): (i64, &[&str]),
        (offset, limit): (i64, i64),
    ) -> R<Vec<Change>> {
        let (a, b) = two_roots(roots);
        let conn = self.reader();
        let mut st = conn
            .prepare(&format!(
                "{READER_CHANGE} WHERE c.folder = ?1 AND c.seq <= ?2 AND c.reader_same = 0 AND {}
                   AND NOT EXISTS (SELECT 1 FROM campaign_skip s
                                   WHERE s.folder = c.folder AND s.account = ?5 AND s.seq = c.seq)
                 ORDER BY c.seq LIMIT ?6 OFFSET ?7",
                SEEN.replace("path", "c.path")
                    .replace("renamed_from", "c.renamed_from"),
            ))
            .map_err(e)?;
        st.query_map(
            params![folder, upto, a, b, account, limit, offset],
            change_of,
        )
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)
    }

    /// How many changes of `account`'s own log a share sees up to `upto`.
    pub fn campaign_share_count(
        &self,
        (folder, account): (&str, &str),
        (upto, roots): (i64, &[&str]),
    ) -> R<i64> {
        let (a, b) = two_roots(roots);
        self.reader()
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM changes c
                     WHERE c.folder = ?1 AND c.seq <= ?2 AND c.reader_same = 0 AND {}
                       AND NOT EXISTS (SELECT 1 FROM campaign_skip s
                                       WHERE s.folder = c.folder AND s.account = ?5 AND s.seq = c.seq)",
                    SEEN.replace("path", "c.path").replace("renamed_from", "c.renamed_from"),
                ),
                params![folder, upto, a, b, account],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// The last change of each path among the readers' changes after
    /// `after`: where a player's log begins when it is asked for the first
    /// time.
    pub fn reader_last_changes(&self, folder: &str, after: i64) -> R<HashMap<String, i64>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT path, MAX(seq) FROM changes
                 WHERE folder = ?1 AND seq > ?2 AND reader_same = 0 GROUP BY path",
            )
            .map_err(e)?;
        st.query_map(params![folder, after], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(e)?
            .collect::<rusqlite::Result<HashMap<_, _>>>()
            .map_err(e)
    }

    /// How many changes `account`'s own log holds up to `upto`: its head.
    pub fn campaign_member_count(&self, folder: &str, account: &str, upto: i64) -> R<i64> {
        self.reader()
            .query_row(
                "SELECT COUNT(*) FROM changes c
                 WHERE c.folder = ?1 AND c.seq <= ?2 AND c.reader_same = 0
                   AND NOT EXISTS (SELECT 1 FROM campaign_skip s
                                   WHERE s.folder = c.folder AND s.account = ?3 AND s.seq = c.seq)",
                params![folder, upto, account],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// Of `paths`, those whose last change a reader does not see: a change
    /// only inside a secret block (ADR 0087).
    pub fn reader_unchanged(&self, folder: &str, paths: &[String]) -> R<Vec<String>> {
        let conn = self.reader();
        let mut out = Vec::new();
        for path in paths {
            let same: Option<bool> = conn
                .query_row(
                    "SELECT reader_same FROM changes WHERE folder = ?1 AND path = ?2 ORDER BY seq DESC LIMIT 1",
                    params![folder, path],
                    |r| r.get(0),
                )
                .optional()
                .map_err(e)?;
            if same == Some(true) {
                out.push(path.clone());
            }
        }
        Ok(out)
    }

    /// The changes after `since`, oldest first, at most `limit`.
    pub fn changes_since(&self, folder: &str, since: i64, limit: i64) -> R<Vec<Change>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT c.seq, c.path, c.hash, c.size, c.deleted, c.renamed_from, c.device,
                        COALESCE(NULLIF(a.name, ''), a.email)
                 FROM changes c LEFT JOIN accounts a ON a.id = c.actor
                 WHERE c.folder = ?1 AND c.seq > ?2 ORDER BY c.seq LIMIT ?3",
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
                by: r.get(7)?,
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
    pub fn share_seq(&self, folder: &str, roots: &[&str], upto: i64, reader: bool) -> R<i64> {
        let (a, b) = two_roots(roots);
        self.reader()
            .query_row(
                &format!("SELECT COUNT(*) FROM changes WHERE folder = ?1 AND seq <= ?2 AND {SEEN} AND (?5 = 0 OR reader_same = 0)"),
                params![folder, upto, a, b, reader],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// The folder's number of the `n`-th change a share sees (counted
    /// from 1, as [`Db::share_seq`] counts them); `None` when it sees
    /// fewer.
    pub fn share_change(
        &self,
        folder: &str,
        roots: &[&str],
        n: i64,
        reader: bool,
    ) -> R<Option<i64>> {
        if n < 1 {
            return Ok(None);
        }
        let (a, b) = two_roots(roots);
        self.reader()
            .query_row(
                &format!(
                    "SELECT seq FROM changes WHERE folder = ?1 AND {SEEN} AND (?5 = 0 OR reader_same = 0)
                     ORDER BY seq LIMIT 1 OFFSET ?2"
                ),
                params![folder, n - 1, a, b, reader],
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
