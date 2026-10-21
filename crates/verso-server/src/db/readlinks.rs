// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Read links (ADR 0105): an address that lets whoever holds it read a
//! folder, or one note, of a folder on this server, with no account. The
//! record keeps the token as its SHA-256 only (item 5), what it points at,
//! who made it (item 3), its expiry and passphrase (an Argon2id hash),
//! when it was last opened, and when it was revoked. The switch that turns
//! the whole feature on (item 3: off on a new server) is a setting.

use rusqlite::{OptionalExtension, params};

use super::{Db, R, covers, crypto, e, now};

/// Schema 13: the read links.
pub(super) const READ_LINKS: &str = r"
CREATE TABLE read_links (
  id TEXT PRIMARY KEY,
  token_hash BLOB NOT NULL UNIQUE,
  folder TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('folder', 'note')),
  path TEXT NOT NULL,
  made_by TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  made_at INTEGER NOT NULL,
  expires INTEGER,
  password TEXT,
  last_opened INTEGER,
  revoked INTEGER
);
CREATE INDEX read_links_folder ON read_links(folder, revoked);
";

/// The setting that turns read links on for the server.
pub const SWITCH: &str = "read_links";

/// A read link as kept.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadLink {
    pub id: String,
    pub folder: String,
    /// `folder` or `note`.
    pub kind: String,
    /// The folder's or the note's path in the owner's folder; `""` is the
    /// whole folder.
    pub path: String,
    pub made_by: String,
    pub made_at: i64,
    pub expires: Option<i64>,
    /// The Argon2id hash of the passphrase, when it has one.
    pub password: Option<String>,
    pub last_opened: Option<i64>,
    pub revoked: Option<i64>,
}

impl ReadLink {
    /// Whether the link opens anything at `at`: not revoked, not expired.
    #[must_use]
    pub fn live(&self, at: i64) -> bool {
        self.revoked.is_none() && self.expires.is_none_or(|x| x > at)
    }
}

/// What a new link is made of.
pub struct NewReadLink<'a> {
    pub folder: &'a str,
    pub kind: &'a str,
    pub path: &'a str,
    pub made_by: &'a str,
    pub expires: Option<i64>,
    pub password: Option<&'a str>,
}

const COLUMNS: &str = "SELECT id, folder, kind, path, made_by, made_at, expires, password, last_opened, revoked FROM read_links";

fn from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<ReadLink> {
    Ok(ReadLink {
        id: r.get(0)?,
        folder: r.get(1)?,
        kind: r.get(2)?,
        path: r.get(3)?,
        made_by: r.get(4)?,
        made_at: r.get(5)?,
        expires: r.get(6)?,
        password: r.get(7)?,
        last_opened: r.get(8)?,
        revoked: r.get(9)?,
    })
}

impl Db {
    /// Whether read links are on for this server (off until an admin turns
    /// them on, ADR 0105 item 3).
    pub fn read_links_on(&self) -> R<bool> {
        Ok(self.setting(SWITCH)?.as_deref() == Some("on"))
    }

    pub fn set_read_links_on(&self, on: bool) -> R<()> {
        self.set_setting(SWITCH, if on { "on" } else { "off" })
    }

    /// A link made: the token returned once, never kept.
    pub fn make_read_link(&self, new: &NewReadLink<'_>) -> R<(String, ReadLink)> {
        let token = crypto::token()?;
        let id = crypto::id()?;
        let at = now();
        let hashed = new.password.map(crypto::hash_password).transpose()?;
        self.conn()
            .execute(
                "INSERT INTO read_links (id, token_hash, folder, kind, path, made_by, made_at, expires, password)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    id,
                    crypto::hash(&token),
                    new.folder,
                    new.kind,
                    new.path,
                    new.made_by,
                    at,
                    new.expires,
                    hashed
                ],
            )
            .map_err(e)?;
        Ok((
            token,
            ReadLink {
                id,
                folder: new.folder.to_owned(),
                kind: new.kind.to_owned(),
                path: new.path.to_owned(),
                made_by: new.made_by.to_owned(),
                made_at: at,
                expires: new.expires,
                password: hashed,
                last_opened: None,
                revoked: None,
            },
        ))
    }

    /// The link a token names, by its hash; revoked and expired ones too
    /// (the caller judges).
    pub fn read_link_by_token(&self, token: &str) -> R<Option<ReadLink>> {
        self.reader()
            .query_row(
                &format!("{COLUMNS} WHERE token_hash = ?1"),
                [crypto::hash(token)],
                from_row,
            )
            .optional()
            .map_err(e)
    }

    pub fn read_link(&self, id: &str) -> R<Option<ReadLink>> {
        self.conn()
            .query_row(&format!("{COLUMNS} WHERE id = ?1"), [id], from_row)
            .optional()
            .map_err(e)
    }

    /// The live links of a folder, newest first.
    pub fn read_links_of(&self, folder: &str) -> R<Vec<ReadLink>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(&format!(
                "{COLUMNS} WHERE folder = ?1 AND revoked IS NULL AND (expires IS NULL OR expires > ?2)
                 ORDER BY made_at DESC, id"
            ))
            .map_err(e)?;
        st.query_map(params![folder, now()], from_row)
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)
    }

    /// Every live link, for the console's switch to end them at once.
    pub fn live_read_link_ids(&self) -> R<Vec<String>> {
        let conn = self.conn();
        let mut st = conn
            .prepare("SELECT id FROM read_links WHERE revoked IS NULL")
            .map_err(e)?;
        st.query_map([], |r| r.get(0))
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)
    }

    /// Revoke a link; false when it was not live.
    pub fn revoke_read_link(&self, id: &str) -> R<bool> {
        Ok(self
            .conn()
            .execute(
                "UPDATE read_links SET revoked = ?2 WHERE id = ?1 AND revoked IS NULL",
                params![id, now()],
            )
            .map_err(e)?
            > 0)
    }

    /// When the link was last opened.
    pub fn touch_read_link(&self, id: &str) -> R<()> {
        self.conn()
            .execute(
                "UPDATE read_links SET last_opened = ?2 WHERE id = ?1",
                params![id, now()],
            )
            .map_err(e)?;
        Ok(())
    }

    /// The links that pointed at `from`, or inside it, now point at `to`
    /// (a rename or a move); the ids of the links moved.
    pub fn move_read_links(&self, folder: &str, from: &str, to: &str) -> R<Vec<String>> {
        if from.is_empty() {
            return Ok(Vec::new());
        }
        let mut moved = Vec::new();
        for l in self.read_links_of(folder)? {
            if !covers(from, &l.path) {
                continue;
            }
            let path = format!("{to}{}", &l.path[from.len()..]);
            self.conn()
                .execute(
                    "UPDATE read_links SET path = ?2 WHERE id = ?1",
                    params![l.id, path],
                )
                .map_err(e)?;
            moved.push(l.id);
        }
        Ok(moved)
    }

    /// The links that pointed at `path`, or inside it, revoked (a
    /// deletion); the ids.
    pub fn drop_read_links_under(&self, folder: &str, path: &str) -> R<Vec<String>> {
        if path.is_empty() {
            return Ok(Vec::new());
        }
        let mut gone = Vec::new();
        for l in self.read_links_of(folder)? {
            if covers(path, &l.path) && self.revoke_read_link(&l.id)? {
                gone.push(l.id);
            }
        }
        Ok(gone)
    }
}

#[cfg(test)]
impl Db {
    /// A link's expiry set as a test needs it.
    pub(crate) fn set_read_link_expiry(&self, id: &str, expires: Option<i64>) -> R<()> {
        self.conn()
            .execute(
                "UPDATE read_links SET expires = ?2 WHERE id = ?1",
                params![id, expires],
            )
            .map_err(e)?;
        Ok(())
    }

    /// Everything the database keeps of every link, as text, for a test
    /// that looks for a token in it.
    pub(crate) fn read_links_dump(&self) -> R<String> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "SELECT id || '|' || hex(token_hash) || '|' || folder || '|' || kind || '|' || path || '|' || made_by || '|' || COALESCE(password, '') FROM read_links",
            )
            .map_err(e)?;
        let rows: Vec<String> = st
            .query_map([], |r| r.get(0))
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)?;
        Ok(rows.join("\n"))
    }
}
