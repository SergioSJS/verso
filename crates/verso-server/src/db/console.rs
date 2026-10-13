// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the administration console asks of the database (ADR 0077): every
//! list searched, sorted and paged here, never fetched whole, and a
//! folder's quota. A sort names a column from a closed list; a search is
//! a parameter, never text in the statement.

use rusqlite::{OptionalExtension, params};
use serde::Serialize;

use super::{AuditEntry, Db, Invitation, R, e, now};

/// A page asked for: a search, a sort among the list's own, and where.
#[derive(Debug, Clone, Default)]
pub struct PageQuery {
    pub q: String,
    pub sort: String,
    pub desc: bool,
    pub offset: i64,
    pub limit: i64,
}

impl PageQuery {
    /// 50 rows unless asked otherwise, 200 at most.
    #[must_use]
    pub fn rows(&self) -> i64 {
        if self.limit <= 0 {
            50
        } else {
            self.limit.min(200)
        }
    }

    fn like(&self) -> String {
        let escaped = self
            .q
            .trim()
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        format!("%{escaped}%")
    }

    fn order(&self, allowed: &[(&str, &str)], default: &str) -> String {
        let column = allowed
            .iter()
            .find(|(name, _)| *name == self.sort)
            .map_or(default, |(_, sql)| sql);
        format!("{column} {}", if self.desc { "DESC" } else { "ASC" })
    }
}

/// A page of rows, the total the search finds, and where the next starts.
#[derive(Debug, Clone, Serialize)]
pub struct Page<T> {
    pub rows: Vec<T>,
    pub total: i64,
    pub next: Option<i64>,
}

fn page<T>(rows: Vec<T>, total: i64, q: &PageQuery) -> Page<T> {
    let end = q.offset + rows.len() as i64;
    Page {
        next: (end < total).then_some(end),
        rows,
        total,
    }
}

/// An account as the console lists it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRow {
    pub id: String,
    pub email: String,
    pub name: String,
    pub admin: bool,
    pub may_create: bool,
    pub created: i64,
    pub password: bool,
    /// Folders it owns.
    pub folders: i64,
    /// What those folders take, in bytes.
    pub space: i64,
    pub last_seen: Option<i64>,
}

/// A folder as the console lists it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderRow {
    pub id: String,
    pub name: String,
    pub created: i64,
    pub owners: Vec<String>,
    pub members: i64,
    pub space: i64,
    pub quota: Option<i64>,
    /// When a write last changed it, as the server last counted it.
    pub changed: Option<i64>,
}

/// The total of a folder, from its counted space (`space:<id>`).
const SPACE: &str = "COALESCE(CAST(json_extract((SELECT value FROM settings WHERE key = 'space:' || f.id), '$.total') AS INTEGER), 0)";
const CHANGED: &str = "CAST(json_extract((SELECT value FROM settings WHERE key = 'space:' || f.id), '$.at') AS INTEGER)";

impl Db {
    pub fn page_accounts(&self, q: &PageQuery) -> R<Page<AccountRow>> {
        let conn = self.conn();
        let filter = "WHERE a.name LIKE ?1 ESCAPE '\\' OR a.email LIKE ?1 ESCAPE '\\'";
        let owned = "(SELECT COUNT(*) FROM grants g WHERE g.account = a.id AND g.role = 'owner')";
        let space = format!(
            "(SELECT COALESCE(SUM({}), 0) FROM grants g JOIN folders f ON f.id = g.folder WHERE g.account = a.id AND g.role = 'owner')",
            SPACE
        );
        let seen = "(SELECT MAX(s.last_used) FROM sessions s WHERE s.account = a.id)";
        let order = q.order(
            &[
                ("name", "a.name COLLATE NOCASE"),
                ("email", "a.email_fold"),
                ("created", "a.created"),
                ("folders", "folders"),
                ("space", "space"),
                ("seen", "seen"),
            ],
            "a.name COLLATE NOCASE",
        );
        let total: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM accounts a {filter}"),
                [q.like()],
                |r| r.get(0),
            )
            .map_err(e)?;
        let sql = format!(
            "SELECT a.id, a.email, a.name, a.admin, a.may_create, a.created, a.password IS NOT NULL,
                    {owned} AS folders, {space} AS space, {seen} AS seen
             FROM accounts a {filter} ORDER BY {order}, a.id LIMIT ?2 OFFSET ?3"
        );
        let mut st = conn.prepare(&sql).map_err(e)?;
        let rows = st
            .query_map(params![q.like(), q.rows(), q.offset], |r| {
                Ok(AccountRow {
                    id: r.get(0)?,
                    email: r.get(1)?,
                    name: r.get(2)?,
                    admin: r.get(3)?,
                    may_create: r.get(4)?,
                    created: r.get(5)?,
                    password: r.get(6)?,
                    folders: r.get(7)?,
                    space: r.get(8)?,
                    last_seen: r.get(9)?,
                })
            })
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        Ok(page(rows, total, q))
    }

    pub fn page_folders(&self, q: &PageQuery) -> R<Page<FolderRow>> {
        let conn = self.conn();
        let filter = "WHERE f.dir LIKE ?1 ESCAPE '\\'";
        let members = "(SELECT COUNT(*) FROM grants g WHERE g.folder = f.id)";
        let order = q.order(
            &[
                ("name", "f.dir COLLATE NOCASE"),
                ("created", "f.created"),
                ("members", "members"),
                ("space", "space"),
                ("quota", "f.quota"),
                ("changed", "changed"),
            ],
            "f.dir COLLATE NOCASE",
        );
        let total: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM folders f {filter}"),
                [q.like()],
                |r| r.get(0),
            )
            .map_err(e)?;
        let sql = format!(
            "SELECT f.id, f.dir, f.created, f.quota, {members} AS members, {SPACE} AS space, {CHANGED} AS changed
             FROM folders f {filter} ORDER BY {order}, f.id LIMIT ?2 OFFSET ?3"
        );
        let mut st = conn.prepare(&sql).map_err(e)?;
        let mut rows = st
            .query_map(params![q.like(), q.rows(), q.offset], |r| {
                Ok(FolderRow {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    created: r.get(2)?,
                    quota: r.get(3)?,
                    members: r.get(4)?,
                    space: r.get(5)?,
                    changed: r.get(6)?,
                    owners: Vec::new(),
                })
            })
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        let mut owners = conn
            .prepare("SELECT a.email FROM grants g JOIN accounts a ON a.id = g.account WHERE g.folder = ?1 AND g.role = 'owner' ORDER BY a.email")
            .map_err(e)?;
        for row in &mut rows {
            row.owners = owners
                .query_map([&row.id], |r| r.get(0))
                .map_err(e)?
                .collect::<rusqlite::Result<Vec<String>>>()
                .map_err(e)?;
        }
        Ok(page(rows, total, q))
    }

    /// Invitations, newest first; `state` narrows to pending, used, expired
    /// or ended.
    pub fn page_invitations(&self, q: &PageQuery, state: &str) -> R<Page<Invitation>> {
        let all = self.invitations()?;
        let at = now();
        let needle = q.q.trim().to_lowercase();
        let found: Vec<Invitation> = all
            .into_iter()
            .filter(|i| state.is_empty() || i.state(at) == state)
            .filter(|i| {
                needle.is_empty()
                    || i.email
                        .as_deref()
                        .unwrap_or("")
                        .to_lowercase()
                        .contains(&needle)
            })
            .collect();
        let total = found.len() as i64;
        let rows = found
            .into_iter()
            .skip(usize::try_from(q.offset).unwrap_or(0))
            .take(usize::try_from(q.rows()).unwrap_or(50))
            .collect();
        Ok(page(rows, total, q))
    }

    /// The audit log, newest first, narrowed by who (an account's id or
    /// e-mail), what, which folder and from when to when.
    pub fn page_audit(&self, q: &PageQuery, filter: &AuditFilter) -> R<Page<AuditEntry>> {
        let conn = self.conn();
        let actor: Option<String> = match filter
            .actor
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            None => None,
            Some(who) => conn
                .query_row(
                    "SELECT id FROM accounts WHERE id = ?1 OR email_fold = ?2",
                    params![who, super::fold_email(who)],
                    |r| r.get(0),
                )
                .optional()
                .map_err(e)?
                .or_else(|| Some(who.to_owned())),
        };
        let wh = "WHERE (?1 IS NULL OR actor = ?1) AND (?2 IS NULL OR action = ?2) AND (?3 IS NULL OR folder = ?3)
                  AND (?4 IS NULL OR at >= ?4) AND (?5 IS NULL OR at <= ?5)";
        let args = params![actor, filter.action, filter.folder, filter.from, filter.to];
        let total: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM audit {wh}"), args, |r| {
                r.get(0)
            })
            .map_err(e)?;
        let mut st = conn
            .prepare(&format!(
                "SELECT at, actor, action, subject, folder, address, ok, path FROM audit {wh}
                 ORDER BY at DESC, rowid DESC LIMIT ?6 OFFSET ?7"
            ))
            .map_err(e)?;
        let rows = st
            .query_map(
                params![
                    actor,
                    filter.action,
                    filter.folder,
                    filter.from,
                    filter.to,
                    q.rows(),
                    q.offset
                ],
                |r| {
                    Ok(AuditEntry {
                        at: r.get(0)?,
                        actor: r.get(1)?,
                        action: r.get(2)?,
                        subject: r.get(3)?,
                        folder: r.get(4)?,
                        address: r.get(5)?,
                        ok: r.get(6)?,
                        path: r.get(7)?,
                    })
                },
            )
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        Ok(page(rows, total, q))
    }

    /// The name of what a log line's subject names when it is a token, a
    /// passkey or a session still kept: the name it was given, or the
    /// device's. None once it is gone.
    pub fn subject_name(&self, id: &str) -> R<Option<String>> {
        self.conn()
            .query_row(
                "SELECT name FROM tokens WHERE id = ?1
                 UNION ALL SELECT name FROM passkeys WHERE id = ?1
                 UNION ALL SELECT device FROM sessions WHERE id = ?1
                 LIMIT 1",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)
    }

    /// The actions the log holds, for the console's filter.
    pub fn audit_actions(&self) -> R<Vec<String>> {
        let conn = self.conn();
        let mut st = conn
            .prepare("SELECT DISTINCT action FROM audit ORDER BY action")
            .map_err(e)?;
        st.query_map([], |r| r.get(0))
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<String>>>()
            .map_err(e)
    }

    /// When `actor` last did `action`, by the audit log (ADR 0083 item 2:
    /// a sign-in notice once a day, across restarts).
    pub fn last_action_of(&self, actor: &str, action: &str) -> R<Option<i64>> {
        self.reader()
            .query_row(
                "SELECT MAX(at) FROM audit WHERE actor = ?1 AND action = ?2",
                params![actor, action],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// The accounts that did `action` since `since`, each once: the
    /// console's "accounts under attack today" (ADR 0083 item 2).
    pub fn actors_since(&self, action: &str, since: i64) -> R<i64> {
        self.reader()
            .query_row(
                "SELECT COUNT(DISTINCT actor) FROM audit WHERE action = ?1 AND at >= ?2",
                params![action, since],
                |r| r.get(0),
            )
            .map_err(e)
    }

    /// A folder's quota in bytes, or none.
    pub fn quota(&self, folder: &str) -> R<Option<i64>> {
        self.conn()
            .query_row("SELECT quota FROM folders WHERE id = ?1", [folder], |r| {
                r.get(0)
            })
            .optional()
            .map_err(e)
            .map(Option::flatten)
    }

    pub fn set_quota(&self, folder: &str, bytes: Option<i64>) -> R<()> {
        self.conn()
            .execute(
                "UPDATE folders SET quota = ?2 WHERE id = ?1",
                params![folder, bytes],
            )
            .map_err(e)?;
        Ok(())
    }

    /// Totals for the overview: accounts, folders, the space they take.
    pub fn totals(&self) -> R<(i64, i64, i64)> {
        let conn = self.conn();
        let accounts: i64 = conn
            .query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0))
            .map_err(e)?;
        let folders: i64 = conn
            .query_row("SELECT COUNT(*) FROM folders", [], |r| r.get(0))
            .map_err(e)?;
        let space: i64 = conn
            .query_row(
                &format!("SELECT COALESCE(SUM({SPACE}), 0) FROM folders f"),
                [],
                |r| r.get(0),
            )
            .map_err(e)?;
        Ok((accounts, folders, space))
    }

    /// Folders at 90 % of their quota or more: (id, name, space, quota).
    pub fn folders_near_quota(&self) -> R<Vec<(String, String, i64, i64)>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(&format!(
                "SELECT f.id, f.dir, {SPACE} AS space, f.quota FROM folders f
                 WHERE f.quota IS NOT NULL AND {SPACE} * 10 >= f.quota * 9 ORDER BY f.dir"
            ))
            .map_err(e)?;
        st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)
    }
}

/// The audit log's filters (ADR 0077 item 3).
#[derive(Debug, Clone, Default)]
pub struct AuditFilter {
    pub actor: Option<String>,
    pub action: Option<String>,
    pub folder: Option<String>,
    pub from: Option<i64>,
    pub to: Option<i64>,
}

impl Db {
    /// Every session of `account` ended and every one of its personal
    /// access tokens revoked, in one step — the admin's cut of a lost
    /// phone without changing the password (ADR 0077 item 3, decided
    /// 2026-10-11). How many of each.
    pub fn end_all_of(&self, account: &str) -> R<(usize, usize)> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let sessions = tx
            .execute("DELETE FROM sessions WHERE account = ?1", [account])
            .map_err(e)?;
        let tokens = tx
            .execute("DELETE FROM tokens WHERE account = ?1", [account])
            .map_err(e)?;
        tx.commit().map_err(e)?;
        Ok((sessions, tokens))
    }
}
