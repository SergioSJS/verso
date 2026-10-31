// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The access of a table's files, one model (ADR 0113, schema 20).
//!
//! Three tables replace the five columns and two tables the audience, the
//! edit grants, the secret names and the image permission of ADR 0110 were
//! kept in:
//!
//! - `campaign_access (folder, path, account, level)`: per **path** — a
//!   file or a folder — the *Whole table* row (`account` NULL) and the rows
//!   of the players whose level differs, `none`, `see` or `edit`. The rows
//!   of one path are its **set**; a path with a set has all its access in
//!   it, a path with none follows its folder (ADR 0113 item 2);
//! - `campaign_files (folder, path, secret_name)`: what a file keeps that
//!   is no access (0110 item 7);
//! - `campaign_rights (folder, root, account, right)`: what a player may
//!   do at a table: `images`, `files`, `create_notes`, `create_boards`
//!   (K.6; schema 21 split `files`, *Send files* of K.4, into the four).
//!
//! The old tables (`campaign_notes`, `campaign_audience`,
//! `campaign_images`) stay for one version, as the migration left them and
//! never written again, so that going back is possible; the next version
//! drops them. The commands of ADR 0110 still speak audience and grant;
//! they are adapters over the sets here ([`Db::campaign_audience`],
//! [`Db::campaign_grant`]) until the contract moves (ADR 0113 S4).

use std::collections::{BTreeMap, BTreeSet, HashMap};

use rusqlite::{Connection, params};

use super::campaign::{Audience, Grant, NoteState, players_logs_begin};
use super::{Db, R, e};
use crate::access::{AccessFacts, Level, NodeSet, Right, TableFact};

/// Schema 20: the tables, and the old state carried over (ADR 0113 item I).
///
/// - `released = 1` is the *Whole table* at `see`; a grant to the group is
///   the *Whole table* at `edit` (it implies the note is the table's);
/// - each player of a note's audience, and the one a note is granted to,
///   has a row of their own where their level is above the whole table's;
/// - a note the table kept hidden has an explicit `none` for the whole
///   table, so that it is still a note the table knows;
/// - the secret names and the image permissions move to their tables.
pub(super) const ACCESS: &str = r#"
CREATE TABLE campaign_access (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  account TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('none', 'see', 'edit')),
  migrated INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX campaign_access_row ON campaign_access (folder, path, COALESCE(account, ''));
CREATE TABLE campaign_files (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  secret_name INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (folder, path)
);
CREATE TABLE campaign_rights (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  root TEXT NOT NULL,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  "right" TEXT NOT NULL CHECK ("right" IN ('files')),
  PRIMARY KEY (folder, root, account, "right")
);
INSERT INTO campaign_access (folder, path, account, level)
  SELECT folder, path, NULL, CASE WHEN grant_kind = 'group' THEN 'edit' ELSE 'see' END
  FROM campaign_notes WHERE grant_kind = 'group' OR released = 1;
INSERT INTO campaign_access (folder, path, account, level)
  SELECT c.folder, c.path, c.account, CASE c.rank WHEN 2 THEN 'edit' ELSE 'see' END
  FROM (
    SELECT folder, path, account, MAX(rank) AS rank FROM (
      SELECT folder, path, account, 1 AS rank FROM campaign_audience
      UNION ALL
      SELECT folder, path, grant_account, 2 FROM campaign_notes
        WHERE grant_kind = 'player' AND grant_account IS NOT NULL
    ) GROUP BY folder, path, account
  ) c
  JOIN campaign_notes n ON n.folder = c.folder AND n.path = c.path
  WHERE c.rank > CASE WHEN n.grant_kind = 'group' THEN 2 WHEN n.released = 1 THEN 1 ELSE 0 END;
INSERT INTO campaign_access (folder, path, account, level, migrated)
  SELECT n.folder, n.path, NULL, 'none', 1 FROM campaign_notes n
  WHERE NOT EXISTS (SELECT 1 FROM campaign_access a WHERE a.folder = n.folder AND a.path = n.path);
INSERT INTO campaign_files (folder, path, secret_name)
  SELECT folder, path, 1 FROM campaign_notes WHERE secret_name = 1;
INSERT INTO campaign_rights (folder, root, account, "right")
  SELECT folder, root, account, 'files' FROM campaign_images;
"#;

/// Schema 21: *Send files* split into four rights (ADR 0113 K.6), nothing
/// lost.
///
/// - every `files` row stays and gains an `images` row;
/// - every player of a table who had *Edits* on any **folder** path of it —
///   a row of the whole table (every player of the folder) or of their own —
///   gets `create_notes` and `create_boards`; so does a folder-role editor,
///   who edited every folder they saw. The players are the folder's
///   non-owner grants and the people of the shares that cover the table or
///   lie inside it. A path is a folder when it is the folder itself or a
///   table's root, or its last segment has no dot, or another stored path
///   lies under it (`Mapas.v2`).
///
/// The table is made again for it can not change its `CHECK`.
pub(super) const RIGHTS: &str = r#"
CREATE TABLE campaign_rights_new (
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  root TEXT NOT NULL,
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  "right" TEXT NOT NULL CHECK ("right" IN ('images', 'files', 'create_notes', 'create_boards')),
  PRIMARY KEY (folder, root, account, "right")
);
INSERT INTO campaign_rights_new (folder, root, account, "right")
  SELECT folder, root, account, "right" FROM campaign_rights;
INSERT OR IGNORE INTO campaign_rights_new (folder, root, account, "right")
  SELECT folder, root, account, 'images' FROM campaign_rights WHERE "right" = 'files';
INSERT OR IGNORE INTO campaign_rights_new (folder, root, account, "right")
  WITH people AS (
    SELECT c.folder AS folder, c.root AS root, g.account AS account, g.role AS role
    FROM campaigns c JOIN grants g ON g.folder = c.folder AND g.role <> 'owner'
    UNION
    SELECT c.folder, c.root, sg.account, sg.role
    FROM campaigns c
    JOIN shares s ON s.folder = c.folder
    JOIN share_grants sg ON sg.share = s.id
    WHERE (s.path = '' OR c.root = '' OR lower(s.path) = lower(c.root)
           OR lower(substr(s.path, 1, length(c.root) + 1)) = lower(c.root) || '/'
           OR lower(substr(c.root, 1, length(s.path) + 1)) = lower(s.path) || '/')
      AND NOT EXISTS (SELECT 1 FROM grants o WHERE o.folder = c.folder AND o.account = sg.account AND o.role = 'owner')
  )
  SELECT g.folder, g.root, g.account, r.name
  FROM people g
  JOIN (SELECT 'create_notes' AS name UNION ALL SELECT 'create_boards') r
  WHERE g.role = 'editor' OR EXISTS (
    SELECT 1 FROM campaign_access a
    WHERE a.folder = g.folder AND a.level = 'edit'
      AND (a.account IS NULL OR a.account = g.account)
      AND (g.root = '' OR lower(a.path) = lower(g.root)
           OR lower(substr(a.path, 1, length(g.root) + 1)) = lower(g.root) || '/')
      AND (a.path = '' OR lower(a.path) = lower(g.root)
           OR replace(a.path, rtrim(a.path, replace(a.path, '/', '')), '') NOT GLOB '*.*'
           OR EXISTS (SELECT 1 FROM campaign_access b WHERE b.folder = a.folder
                      AND substr(b.path, 1, length(a.path) + 1) = a.path || '/')
           OR EXISTS (SELECT 1 FROM campaign_files f WHERE f.folder = a.folder
                      AND substr(f.path, 1, length(a.path) + 1) = a.path || '/'))
  );
DROP TABLE campaign_rights;
ALTER TABLE campaign_rights_new RENAME TO campaign_rights;
"#;

fn level_of(word: &str) -> Level {
    // A word that is none of the three fails closed.
    Level::parse(word).unwrap_or(Level::None)
}

/// The rows of `folder`: path (as kept), account (none: the whole table's),
/// level.
type Rows = Vec<(String, Option<String>, Level)>;

fn rows_of(conn: &Connection, folder: &str) -> R<Rows> {
    let mut st = conn
        .prepare(
            "SELECT path, account, level FROM campaign_access WHERE folder = ?1
             ORDER BY path, account",
        )
        .map_err(e)?;
    st.query_map([folder], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, Option<String>>(1)?,
            level_of(&r.get::<_, String>(2)?),
        ))
    })
    .map_err(e)?
    .collect::<rusqlite::Result<Vec<_>>>()
    .map_err(e)
}

/// The sets the rows make, by path as kept.
fn sets_of(rows: &Rows) -> BTreeMap<String, NodeSet> {
    let mut out: BTreeMap<String, NodeSet> = BTreeMap::new();
    for (path, account, level) in rows {
        let set = out.entry(path.clone()).or_default();
        match account {
            None => set.whole = *level,
            Some(a) => {
                set.rows.insert(a.clone(), *level);
            }
        }
    }
    out
}

/// What the rules read: the tables, the sets (by the key a path is looked
/// up by) and the rights.
pub(super) fn facts_in(conn: &Connection, folder: &str) -> R<AccessFacts> {
    let mut facts = AccessFacts::default();
    let mut st = conn
        .prepare("SELECT root, open FROM campaigns WHERE folder = ?1 ORDER BY length(root), root")
        .map_err(e)?;
    facts.tables = st
        .query_map([folder], |r| {
            Ok(TableFact {
                root: r.get(0)?,
                open: r.get::<_, i64>(1)? != 0,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    facts.sets = std::sync::Arc::new(
        sets_of(&rows_of(conn, folder)?)
            .into_iter()
            .map(|(path, set)| (crate::campaign::key(&path), set))
            .collect(),
    );
    // A path whose only rows are the `none` the migration wrote for a note
    // the table had hidden is no exception anyone made.
    let mut st = conn
        .prepare(
            "SELECT path FROM campaign_access WHERE folder = ?1
             GROUP BY path HAVING MIN(migrated) = 1",
        )
        .map_err(e)?;
    facts.migrated = std::sync::Arc::new(
        st.query_map([folder], |r| r.get::<_, String>(0))
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?
            .into_iter()
            .map(|p| crate::campaign::key(&p))
            .collect(),
    );
    let mut st = conn
        .prepare("SELECT root, account, \"right\" FROM campaign_rights WHERE folder = ?1")
        .map_err(e)?;
    let rights = st
        .query_map([folder], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    for (root, account, right) in rights {
        // A word that is none of the four gives nothing.
        if let Some(right) = Right::parse(&right) {
            facts
                .rights
                .insert((crate::campaign::key(&root), account, right));
        }
    }
    Ok(facts)
}

/// The set a path has now: its own, else the nearest above it, else none
/// (hidden). What a change starts from.
fn current(facts: &AccessFacts, path: &str) -> NodeSet {
    if let Some(own) = facts.sets.get(&crate::campaign::key(path)) {
        return own.clone();
    }
    facts
        .table_of(path)
        .and_then(|t| facts.nearest_set(path, &t.root))
        .map(|(_, s)| s.clone())
        .unwrap_or_default()
}

/// Write `set` as `path`'s own: the whole of its access, replacing the
/// rows it had. A set that says nothing (hidden to all) is still a set, an
/// explicit `none`: a note the table has taken a decision about, which a
/// folder above does not decide for.
fn put_set(conn: &Connection, folder: &str, path: &str, set: NodeSet) -> R<()> {
    let set = set.normalized();
    conn.execute(
        "DELETE FROM campaign_access WHERE folder = ?1 AND path = ?2",
        params![folder, path],
    )
    .map_err(e)?;
    let put = |account: Option<&str>, level: Level| -> R<()> {
        conn.execute(
            "INSERT INTO campaign_access (folder, path, account, level) VALUES (?1, ?2, ?3, ?4)",
            params![folder, path, account, level.as_str()],
        )
        .map_err(e)?;
        Ok(())
    };
    // The whole table's row says "none" only when nothing else is said: a
    // row that is absent reads as none.
    if set.whole != Level::None || set.rows.is_empty() {
        put(None, set.whole)?;
    }
    for (account, level) in &set.rows {
        put(Some(account), *level)?;
    }
    Ok(())
}

/// The notes' states a set of rows and the secret names make.
fn notes_of(sets: &BTreeMap<String, NodeSet>, files: &HashMap<String, bool>) -> Vec<NoteState> {
    let mut paths: BTreeSet<&String> = sets.keys().collect();
    paths.extend(files.keys());
    paths
        .into_iter()
        .map(|p| {
            let (audience, grant) = sets
                .get(p)
                .map_or((Audience::Hidden, Grant::None), audience_and_grant);
            NoteState {
                path: p.clone(),
                audience,
                secret_name: files.get(p).copied().unwrap_or(false),
                grant,
            }
        })
        .collect()
}

/// The audience and the grant a set says, in the words of ADR 0110.
fn audience_and_grant(set: &NodeSet) -> (Audience, Grant) {
    let audience = if set.whole >= Level::See {
        Audience::Table
    } else {
        let sees: BTreeSet<String> = set
            .rows
            .iter()
            .filter(|(_, l)| **l >= Level::See)
            .map(|(a, _)| a.clone())
            .collect();
        if sees.is_empty() {
            Audience::Hidden
        } else {
            Audience::Players(sees)
        }
    };
    let grant = if set.whole == Level::Edit {
        Grant::Group
    } else {
        // The adapters write one player's edit at a time; a set with more
        // (the dialog of ADR 0113 S6) names the first, by account.
        set.rows
            .iter()
            .find(|(_, l)| **l == Level::Edit)
            .map_or(Grant::None, |(a, _)| Grant::Player(a.clone()))
    };
    (audience, grant)
}

/// The players who edit a note by a row of their own.
fn editors(set: &NodeSet) -> BTreeSet<String> {
    set.rows
        .iter()
        .filter(|(_, l)| **l == Level::Edit)
        .map(|(a, _)| a.clone())
        .collect()
}

/// `set` released to `audience` (ADR 0110 item 4, amended 2026-10-23): a
/// grant that no longer holds with the new audience goes — the whole group
/// edits only a note the whole table sees, a player edits only one it sees,
/// and a note nobody sees is edited by nobody.
fn with_audience(set: &NodeSet, audience: &Audience) -> NodeSet {
    match audience {
        Audience::Hidden => NodeSet::default(),
        Audience::Table => {
            if set.whole == Level::Edit {
                NodeSet {
                    whole: Level::Edit,
                    rows: BTreeMap::new(),
                }
            } else {
                NodeSet {
                    whole: Level::See,
                    rows: editors(set).into_iter().map(|a| (a, Level::Edit)).collect(),
                }
            }
        }
        Audience::Players(players) => {
            let edits = editors(set);
            NodeSet {
                whole: Level::None,
                rows: players
                    .iter()
                    .map(|a| {
                        (
                            a.clone(),
                            if edits.contains(a) {
                                Level::Edit
                            } else {
                                Level::See
                            },
                        )
                    })
                    .collect(),
            }
        }
    }
}

/// `set` granted to `grant`: one grant at a time, as ADR 0110 item 5 had it.
/// The player who edits a note sees it.
fn with_grant(set: &NodeSet, grant: &Grant) -> NodeSet {
    // Whoever edited by a row of their own keeps seeing the note.
    let seeing = |set: &NodeSet| -> BTreeMap<String, Level> {
        set.rows
            .iter()
            .map(|(a, l)| (a.clone(), if *l == Level::Edit { Level::See } else { *l }))
            .collect()
    };
    match grant {
        Grant::Group => NodeSet {
            whole: Level::Edit,
            rows: BTreeMap::new(),
        },
        Grant::None => NodeSet {
            whole: if set.whole == Level::Edit {
                Level::See
            } else {
                set.whole
            },
            rows: seeing(set),
        },
        Grant::Player(a) => {
            let mut rows = seeing(set);
            rows.insert(a.clone(), Level::Edit);
            NodeSet {
                whole: if set.whole == Level::Edit {
                    Level::See
                } else {
                    set.whole
                },
                rows,
            }
        }
    }
}

/// The words of ADR 0110 for a set: its audience and its grant.
#[must_use]
pub fn words_of(set: &NodeSet) -> (Audience, Grant) {
    audience_and_grant(set)
}

impl Db {
    /// The rules' facts and the notes' states of `folder`, from one read.
    pub fn campaign_snapshot(&self, folder: &str) -> R<(AccessFacts, Vec<NoteState>)> {
        let conn = self.reader();
        let rows = rows_of(&conn, folder)?;
        let mut facts = facts_in(&conn, folder)?;
        let sets = sets_of(&rows);
        facts.sets = std::sync::Arc::new(
            sets.iter()
                .map(|(p, s)| (crate::campaign::key(p), s.clone()))
                .collect(),
        );
        let mut st = conn
            .prepare("SELECT path, secret_name FROM campaign_files WHERE folder = ?1")
            .map_err(e)?;
        let files: HashMap<String, bool> = st
            .query_map([folder], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? != 0))
            })
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)?;
        Ok((facts, notes_of(&sets, &files)))
    }

    /// The tables, the access sets and the rights of `folder`: what
    /// [`crate::access::may`] reads.
    pub fn access_facts(&self, folder: &str) -> R<AccessFacts> {
        facts_in(&self.reader(), folder)
    }

    /// Every note of `folder` the server keeps a state for, in the words
    /// of ADR 0110: the audience and the grant its set says.
    pub fn campaign_notes(&self, folder: &str) -> R<Vec<NoteState>> {
        Ok(self.campaign_snapshot(folder)?.1)
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
    /// new audience goes ([`with_audience`]).
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
            let was = current(&facts_in(&tx, folder)?, p);
            put_set(&tx, folder, p, with_audience(&was, audience))?;
        }
        tx.commit().map_err(e)
    }

    /// A note's name is a secret, or not.
    pub fn campaign_secret_name(&self, folder: &str, path: &str, on: bool) -> R<()> {
        self.conn()
            .execute(
                "INSERT INTO campaign_files (folder, path, secret_name) VALUES (?1, ?2, ?3)
                 ON CONFLICT (folder, path) DO UPDATE SET secret_name = excluded.secret_name",
                params![folder, path, i64::from(on)],
            )
            .map_err(e)?;
        Ok(())
    }

    /// Who may edit a note. A player who edits a note sees it: when the
    /// note is not the table's, the player's row is an edit one. The grant
    /// and the audience are one step.
    pub fn campaign_grant(&self, folder: &str, path: &str, grant: &Grant) -> R<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let was = current(&facts_in(&tx, folder)?, path);
        let set = with_grant(&was, grant);
        if matches!(grant, Grant::Player(_)) && set.whole < Level::See {
            players_logs_begin(&tx, folder)?;
        }
        put_set(&tx, folder, path, set)?;
        tx.commit().map_err(e)
    }

    /// `set` is the whole access of `path` from now on (ADR 0113 item 2): a
    /// file moved into a folder keeps the access it had (K.2).
    pub fn access_put(&self, folder: &str, path: &str, set: NodeSet) -> R<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        // A player's row of their own makes the players' logs their own.
        if !set.rows.is_empty() {
            players_logs_begin(&tx, folder)?;
        }
        put_set(&tx, folder, path, set)?;
        tx.commit().map_err(e)
    }

    /// The accounts the table at `root` gave `right` (K.6).
    pub fn campaign_right_players(&self, folder: &str, root: &str, right: Right) -> R<Vec<String>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT account FROM campaign_rights
                 WHERE folder = ?1 AND root = ?2 AND \"right\" = ?3 ORDER BY account",
            )
            .map_err(e)?;
        st.query_map(params![folder, root, right.as_str()], |r| r.get(0))
            .map_err(e)?
            .collect::<Result<_, _>>()
            .map_err(e)
    }

    /// Whether `account` was given `right` at the table at `root`.
    pub fn campaign_right_has(
        &self,
        folder: &str,
        root: &str,
        account: &str,
        right: Right,
    ) -> R<bool> {
        self.reader()
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM campaign_rights
                 WHERE folder = ?1 AND root = ?2 AND account = ?3 AND \"right\" = ?4)",
                params![folder, root, account, right.as_str()],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// The rights `account` has at the tables of `folder`, as (root, right),
    /// read now: the rules ask it fresh at every door.
    pub fn campaign_rights_of(&self, folder: &str, account: &str) -> R<Vec<(String, Right)>> {
        let conn = self.reader();
        let mut st = conn
            .prepare(
                "SELECT root, \"right\" FROM campaign_rights
                 WHERE folder = ?1 AND account = ?2",
            )
            .map_err(e)?;
        let rows = st
            .query_map(params![folder, account], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(e)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(e)?;
        Ok(rows
            .into_iter()
            .filter_map(|(root, right)| Right::parse(&right).map(|r| (root, r)))
            .collect())
    }

    /// Whether `account` was let send a file to a chat (*Images* or *Files*)
    /// at some table of `folder`, from the set kept in memory beside the
    /// table (no query): what the size check before a message is parsed
    /// asks.
    pub fn image_granted(&self, folder: &str, account: &str) -> bool {
        verso_service::lock(&self.images).contains(&(folder.to_owned(), account.to_owned()))
    }

    /// The set in memory made again from the table, under the writer's own
    /// lock (`conn` is held by the caller), after every change of it —
    /// including the cascades of a deleted table, folder or account. A
    /// failed read empties the set: nobody is admitted on a guess.
    pub(super) fn refresh_images(&self, conn: &Connection) {
        let read = || -> rusqlite::Result<std::collections::HashSet<(String, String)>> {
            conn.prepare(
                "SELECT DISTINCT folder, account FROM campaign_rights
                 WHERE \"right\" IN ('images', 'files')",
            )?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect()
        };
        let set = read().unwrap_or_else(|err| {
            crate::log::warn(&format!("the file permissions could not be read: {err}"));
            std::collections::HashSet::new()
        });
        *verso_service::lock(&self.images) = set;
    }

    /// Give `accounts` `right` at the table at `root`, or take it from them.
    pub fn campaign_right_set(
        &self,
        folder: &str,
        root: &str,
        accounts: &[String],
        right: Right,
        on: bool,
    ) -> R<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        for a in accounts {
            if on {
                tx.execute(
                    "INSERT OR IGNORE INTO campaign_rights (folder, root, account, \"right\")
                     VALUES (?1, ?2, ?3, ?4)",
                    params![folder, root, a, right.as_str()],
                )
            } else {
                tx.execute(
                    "DELETE FROM campaign_rights
                     WHERE folder = ?1 AND root = ?2 AND account = ?3 AND \"right\" = ?4",
                    params![folder, root, a, right.as_str()],
                )
            }
            .map_err(e)?;
        }
        tx.commit().map_err(e)?;
        self.refresh_images(&conn);
        Ok(())
    }

    /// `set` is the whole access of the folder `path` from now on, and of
    /// everything inside it: the rows of what lies below go, earlier
    /// exceptions included (ADR 0113 item 2, *Apply*), unless `keep` is true:
    /// then the rows below stay as they are, and nothing but the folder's
    /// own row changes, in the one transaction.
    pub fn access_replace_under(
        &self,
        folder: &str,
        path: &str,
        set: NodeSet,
        keep: bool,
    ) -> R<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        if !set.rows.is_empty() {
            players_logs_begin(&tx, folder)?;
        }
        if !keep {
            tx.execute(
                "DELETE FROM campaign_access WHERE folder = ?1 AND ?2 <> ''
                   AND substr(path, 1, length(?3)) = ?3",
                params![folder, path, format!("{path}/")],
            )
            .map_err(e)?;
        }
        if path.is_empty() && !keep {
            tx.execute(
                "DELETE FROM campaign_access WHERE folder = ?1 AND path <> ''",
                [folder],
            )
            .map_err(e)?;
        }
        put_set(&tx, folder, path, set)?;
        tx.commit().map_err(e)
    }

    /// *Follow the folder*: the set of `path` is deleted.
    pub fn access_follow(&self, folder: &str, path: &str) -> R<()> {
        self.conn()
            .execute(
                "DELETE FROM campaign_access WHERE folder = ?1 AND path = ?2",
                params![folder, path],
            )
            .map_err(e)?;
        Ok(())
    }

    /// Whether the file at `path` has a set of its own (not one it follows).
    pub fn access_has_own(&self, folder: &str, path: &str) -> R<bool> {
        self.reader()
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM campaign_access WHERE folder = ?1 AND path = ?2)",
                params![folder, path],
                |r| r.get(0),
            )
            .map_err(e)
    }
}
