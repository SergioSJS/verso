// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Shares (ADR 0081): a folder inside a folder given to other accounts, in
//! read or write. A share is a path of one folder with an id of its own —
//! what the receiver lists, opens and syncs — its people and their roles,
//! and the attachments folder it may also show, read-only (item 11). The
//! grants of the whole folder stay in `grants` (path `""`, item 1); a
//! person's role at a path is the highest of the grants that cover it
//! (item 14).

use rusqlite::{OptionalExtension, params};

use super::{Account, Db, Folder, R, Role, e, now};

/// A share as kept: the folder, the path inside it, the attachments folder
/// it also shows read-only.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Share {
    pub id: String,
    pub folder: String,
    pub path: String,
    pub attachments: Option<String>,
    pub created: i64,
}

/// The pending invitations of share `?1` ended at `?2`, before the share
/// goes and its id in them is set to null.
const END_INVITATIONS: &str = "UPDATE invitations SET ended = ?2
     WHERE share = ?1 AND used IS NULL AND ended IS NULL";

/// Whether `path` is `root` or inside it; the root `""` covers everything.
#[must_use]
pub fn covers(root: &str, path: &str) -> bool {
    root.is_empty()
        || path == root
        || (path.len() > root.len()
            && path.starts_with(root)
            && path.as_bytes().get(root.len()) == Some(&b'/'))
}

/// `path` moved from `from` to `to`, when it was `from` or inside it.
fn moved(path: &str, from: &str, to: &str) -> Option<String> {
    if from.is_empty() || !covers(from, path) {
        return None;
    }
    Some(format!("{to}{}", &path[from.len()..]))
}

const SHARE: &str = "SELECT id, folder, path, attachments, created FROM shares";

fn share_from(r: &rusqlite::Row<'_>) -> rusqlite::Result<Share> {
    Ok(Share {
        id: r.get(0)?,
        folder: r.get(1)?,
        path: r.get(2)?,
        attachments: r.get(3)?,
        created: r.get(4)?,
    })
}

impl Db {
    pub fn share(&self, id: &str) -> R<Option<Share>> {
        self.conn()
            .query_row(&format!("{SHARE} WHERE id = ?1"), [id], share_from)
            .optional()
            .map_err(e)
    }

    pub fn share_at(&self, folder: &str, path: &str) -> R<Option<Share>> {
        self.conn()
            .query_row(
                &format!("{SHARE} WHERE folder = ?1 AND path = ?2"),
                params![folder, path],
                share_from,
            )
            .optional()
            .map_err(e)
    }

    /// The share of `path` in `folder`, made when there is none.
    pub fn make_share(&self, folder: &str, path: &str) -> R<Share> {
        if let Some(s) = self.share_at(folder, path)? {
            return Ok(s);
        }
        let id = crate::crypto::id()?;
        let at = now();
        self.conn()
            .execute(
                "INSERT INTO shares (id, folder, path, created) VALUES (?1, ?2, ?3, ?4)",
                params![id, folder, path, at],
            )
            .map_err(e)?;
        Ok(Share {
            id,
            folder: folder.to_owned(),
            path: path.to_owned(),
            attachments: None,
            created: at,
        })
    }

    /// A share removed, with its pending invitations ended: an invitation
    /// made for it gives nothing once it is gone (item 8).
    pub fn delete_share(&self, id: &str) -> R<()> {
        // Who was in it, and whose folder: those who read the folder by no
        // other way are no longer players of its tables.
        let folder = self.share(id)?.map(|s| s.folder);
        let people: Vec<String> = self
            .share_people(id)?
            .into_iter()
            .map(|(a, _)| a.id)
            .collect();
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        tx.execute(END_INVITATIONS, params![id, now()]).map_err(e)?;
        tx.execute("DELETE FROM shares WHERE id = ?1", [id])
            .map_err(e)?;
        tx.commit().map_err(e)?;
        drop(conn);
        if let Some(f) = folder {
            for a in people {
                self.campaign_account_left(&f, &a)?;
            }
        }
        Ok(())
    }

    pub fn set_share_attachments(&self, id: &str, path: Option<&str>) -> R<()> {
        self.conn()
            .execute(
                "UPDATE shares SET attachments = ?2 WHERE id = ?1",
                params![id, path],
            )
            .map_err(e)?;
        Ok(())
    }

    /// Every share of a folder, by path.
    pub fn shares_of(&self, folder: &str) -> R<Vec<Share>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(&format!("{SHARE} WHERE folder = ?1 ORDER BY path"))
            .map_err(e)?;
        st.query_map([folder], share_from)
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)
    }

    /// The people of a share and their roles.
    pub fn share_people(&self, share: &str) -> R<Vec<(Account, Role)>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "SELECT a.id, a.email, a.name, a.lang, a.password, a.admin, a.may_create, a.created, g.role
                 FROM share_grants g JOIN accounts a ON a.id = g.account WHERE g.share = ?1
                 ORDER BY a.email_fold",
            )
            .map_err(e)?;
        st.query_map([share], |r| {
            Ok((Self::account_from(r)?, r.get::<_, String>(8)?))
        })
        .map_err(e)?
        .filter_map(|row| match row {
            Ok((a, role)) => Role::parse(&role).map(|r| Ok((a, r))),
            Err(err) => Some(Err(err)),
        })
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
    }

    /// Give `account` `role` in a share: read or write, never owner.
    pub fn grant_share(&self, share: &str, account: &str, role: Role) -> R<()> {
        let role = role.min(Role::Editor);
        self.conn()
            .execute(
                "INSERT INTO share_grants (share, account, role) VALUES (?1, ?2, ?3)
                 ON CONFLICT (share, account) DO UPDATE SET role = excluded.role",
                params![share, account, role.as_str()],
            )
            .map_err(e)?;
        // A role that writes makes it a game master, not a player.
        if let Some(s) = self.share(share)? {
            self.campaign_account_left(&s.folder, account)?;
        }
        Ok(())
    }

    /// Take `account` out of a share; false when it was not in it. A share
    /// with nobody left goes with its last person.
    pub fn revoke_share(&self, share: &str, account: &str) -> R<bool> {
        let folder = self.share(share)?.map(|s| s.folder);
        let gone = self.revoke_share_row(share, account)?;
        if let Some(f) = folder {
            self.campaign_account_left(&f, account)?;
        }
        Ok(gone)
    }

    fn revoke_share_row(&self, share: &str, account: &str) -> R<bool> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let gone = tx
            .execute(
                "DELETE FROM share_grants WHERE share = ?1 AND account = ?2",
                params![share, account],
            )
            .map_err(e)?
            > 0;
        let last = tx
            .query_row(
                "SELECT NOT EXISTS (SELECT 1 FROM share_grants WHERE share = ?1)",
                [share],
                |r| r.get::<_, bool>(0),
            )
            .map_err(e)?;
        if last {
            tx.execute(END_INVITATIONS, params![share, now()])
                .map_err(e)?;
            tx.execute("DELETE FROM shares WHERE id = ?1", [share])
                .map_err(e)?;
        }
        tx.commit().map_err(e)?;
        Ok(gone)
    }

    pub fn share_role(&self, share: &str, account: &str) -> R<Option<Role>> {
        let role: Option<String> = self
            .conn()
            .query_row(
                "SELECT role FROM share_grants WHERE share = ?1 AND account = ?2",
                params![share, account],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)?;
        Ok(role.as_deref().and_then(Role::parse))
    }

    /// The shares given to `account`, with their folders and its role in
    /// each.
    pub fn shares_with(&self, account: &str) -> R<Vec<(Share, Folder, Role)>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "SELECT s.id, s.folder, s.path, s.attachments, s.created, f.dir, f.created, g.role
                 FROM share_grants g JOIN shares s ON s.id = g.share JOIN folders f ON f.id = s.folder
                 WHERE g.account = ?1 ORDER BY f.dir, s.path",
            )
            .map_err(e)?;
        st.query_map([account], |r| {
            let share = share_from(r)?;
            let folder = Folder {
                id: share.folder.clone(),
                dir: r.get(5)?,
                created: r.get(6)?,
            };
            Ok((share, folder, r.get::<_, String>(7)?))
        })
        .map_err(e)?
        .filter_map(|row| match row {
            Ok((s, f, role)) => Role::parse(&role).map(|r| Ok((s, f, r))),
            Err(err) => Some(Err(err)),
        })
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
    }

    /// The role of `account` at `path` of `folder`: the highest of its
    /// grants that cover the path — the whole folder's, and the shares'
    /// whose path is the path or above it (ADR 0081 item 14). A share's
    /// attachments folder is read only, to the share's people.
    pub fn role_at(&self, folder: &str, account: &str, path: &str) -> R<Option<Role>> {
        let mut best = self.role(folder, account)?;
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "SELECT s.path, s.attachments, g.role FROM share_grants g JOIN shares s ON s.id = g.share
                 WHERE s.folder = ?1 AND g.account = ?2",
            )
            .map_err(e)?;
        let rows: Vec<(String, Option<String>, String)> = st
            .query_map(params![folder, account], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)?;
        for (root, attachments, role) in rows {
            let role = Role::parse(&role);
            let found = if covers(&root, path) {
                role
            } else if attachments.is_some_and(|a| covers(&a, path)) {
                role.map(|_| Role::Reader)
            } else {
                None
            };
            best = best.max(found);
        }
        Ok(best)
    }

    /// The shares of `folder` at `from` or inside it now at `to` — a
    /// rename or a move made through the server carries them (ADR 0081
    /// item 13). Returns the ids of the shares that moved.
    pub fn move_shares(&self, folder: &str, from: &str, to: &str) -> R<Vec<String>> {
        let mut changed = Vec::new();
        for s in self.shares_of(folder)? {
            let path = moved(&s.path, from, to);
            let attachments = s.attachments.as_deref().and_then(|a| moved(a, from, to));
            if path.is_none() && attachments.is_none() {
                continue;
            }
            let conn = self.conn();
            if let Some(p) = &path {
                conn.execute(
                    "UPDATE shares SET path = ?2 WHERE id = ?1",
                    params![s.id, p],
                )
                .map_err(e)?;
            }
            if let Some(a) = &attachments {
                conn.execute(
                    "UPDATE shares SET attachments = ?2 WHERE id = ?1",
                    params![s.id, a],
                )
                .map_err(e)?;
            }
            changed.push(s.id);
        }
        Ok(changed)
    }

    /// The shares of `folder` whose path is `path` or inside it, gone with
    /// it (item 13: deleting a shared folder removes its shares); an
    /// attachments folder deleted is no longer shown. Returns the shares
    /// touched.
    pub fn drop_shares_under(&self, folder: &str, path: &str) -> R<Vec<String>> {
        let mut touched = Vec::new();
        for s in self.shares_of(folder)? {
            if covers(path, &s.path) {
                self.delete_share(&s.id)?;
                touched.push(s.id);
            } else if s.attachments.as_deref().is_some_and(|a| covers(path, a)) {
                self.set_share_attachments(&s.id, None)?;
                touched.push(s.id);
            }
        }
        Ok(touched)
    }

    /// One line of the audit log about a share, with its path (item 9).
    pub fn audit_share(&self, a: &super::Audit<'_>, path: &str) -> R<()> {
        self.conn()
            .execute(
                "INSERT INTO audit (at, actor, action, subject, folder, address, ok, path) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![now(), a.actor, a.action, a.subject, a.folder, a.address, a.ok, path],
            )
            .map_err(e)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_covers_itself_and_what_is_inside_it_only() {
        assert!(covers("", "x"));
        assert!(covers("Campanha", "Campanha"));
        assert!(covers("Campanha", "Campanha/a.md"));
        assert!(!covers("Campanha", "Campanha2/a.md"));
        assert!(!covers("Campanha", "Campanh"));
        assert!(!covers("Campanha/Jogadores", "Campanha"));
        assert!(!covers("Campanha", "campanha/a.md"));
        assert_eq!(moved("A/B/c.md", "A/B", "X").as_deref(), Some("X/c.md"));
        assert_eq!(moved("A/BB", "A/B", "X"), None);
        assert_eq!(moved("A/B", "A/B", "Y/B").as_deref(), Some("Y/B"));
    }

    #[test]
    fn the_highest_grant_that_covers_a_path_is_the_role_there() {
        let db = Db::memory().unwrap();
        let owner = db.create_account("o@x.y", "O", "pt", None, false).unwrap();
        let ana = db
            .create_account("a@x.y", "Ana", "pt", None, false)
            .unwrap();
        let folder = db.create_folder("Vault", &owner.id).unwrap();
        assert_eq!(db.role_at(&folder.id, &ana.id, "Campanha").unwrap(), None);
        let outer = db.make_share(&folder.id, "Campanha").unwrap();
        db.grant_share(&outer.id, &ana.id, Role::Reader).unwrap();
        let inner = db.make_share(&folder.id, "Campanha/Jogadores").unwrap();
        db.grant_share(&inner.id, &ana.id, Role::Owner).unwrap();
        // Never owner inside a share.
        assert_eq!(
            db.share_role(&inner.id, &ana.id).unwrap(),
            Some(Role::Editor)
        );
        let at = |p: &str| db.role_at(&folder.id, &ana.id, p).unwrap();
        assert_eq!(at("Campanha/a.md"), Some(Role::Reader));
        assert_eq!(at("Campanha/Jogadores/b.md"), Some(Role::Editor));
        assert_eq!(at("Diario/x.md"), None);
        assert_eq!(at(""), None);
        assert_eq!(at("Campanha2/x.md"), None);
        // The attachments folder: read only, for the share's people.
        db.set_share_attachments(&inner.id, Some("Anexos")).unwrap();
        assert_eq!(at("Anexos/p.png"), Some(Role::Reader));
        // A rename carries both; a deletion takes the share.
        db.move_shares(&folder.id, "Campanha", "Mesa/Campanha")
            .unwrap();
        assert_eq!(db.share(&outer.id).unwrap().unwrap().path, "Mesa/Campanha");
        assert_eq!(
            db.share(&inner.id).unwrap().unwrap().path,
            "Mesa/Campanha/Jogadores"
        );
        db.drop_shares_under(&folder.id, "Mesa/Campanha/Jogadores")
            .unwrap();
        assert!(db.share(&inner.id).unwrap().is_none());
        // The last person out takes the share with them.
        assert!(db.revoke_share(&outer.id, &ana.id).unwrap());
        assert!(db.share(&outer.id).unwrap().is_none());
        assert!(db.shares_with(&ana.id).unwrap().is_empty());
    }
}
