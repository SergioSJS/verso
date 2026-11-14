// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Single-use links made: an invitation, a password reset, the first
//! admin's setup (ADR 0074 items 4 and 5) — and what a game master who is
//! not the admin may keep of them (ADR 0117 D7 (e)): a number pending at
//! once, counted and made under one lock, and all of them ended when the
//! admin takes *may create folders* away.

use rusqlite::{Connection, params};

use super::{Db, Invitation, NewLink, R, e, now};
use crate::crypto;

/// How many invitations `account` made that are still pending: not used,
/// not ended, not expired, and a share's with its share still there (as
/// `Invitation::state` says it).
fn pending_by(conn: &Connection, account: &str, at: i64) -> R<usize> {
    conn.query_row(
        "SELECT COUNT(*) FROM invitations
         WHERE kind = 'invite' AND created_by = ?1 AND used IS NULL AND ended IS NULL
           AND expires > ?2 AND NOT (scope = 'share' AND share IS NULL)",
        params![account, at],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| usize::try_from(n).unwrap_or(usize::MAX))
    .map_err(e)
}

impl Db {
    /// A single-use link's token, made now; its row says what it does.
    pub fn create_invitation(&self, link: &NewLink<'_>) -> R<(String, Invitation)> {
        self.create_invitation_within(link, None)?
            .ok_or_else(|| "invitation refused".to_owned())
    }

    /// [`Db::create_invitation`], or none when `most` is given and its
    /// maker (`created_by`) has that many invitations pending already: the
    /// count and the new row under one lock, so two at once never pass the
    /// number together.
    pub fn create_invitation_within(
        &self,
        link: &NewLink<'_>,
        most: Option<usize>,
    ) -> R<Option<(String, Invitation)>> {
        let NewLink {
            kind,
            email,
            account,
            folder,
            role,
            created_by,
            life,
            share,
        } = *link;
        let token = crypto::token()?;
        let id = crypto::id()?;
        let at = now();
        {
            let conn = self.conn();
            if let (Some(most), Some(by)) = (most, created_by)
                && pending_by(&conn, by, at)? >= most
            {
                return Ok(None);
            }
            conn.execute(
                "INSERT INTO invitations (id, hash, kind, email, account, folder, role, created_by, created, expires, share, scope)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    id,
                    crypto::hash(&token),
                    kind,
                    email.map(str::trim),
                    account,
                    folder,
                    role.map(super::Role::as_str),
                    created_by,
                    at,
                    at + life,
                    share,
                    if share.is_some() { "share" } else { "folder" }
                ],
            )
            .map_err(e)?;
        }
        let invitation = self
            .invitation(&id)?
            .ok_or_else(|| "invitation vanished".to_owned())?;
        Ok(Some((token, invitation)))
    }

    /// How many invitations `account` made are pending now.
    pub fn pending_invitations_by(&self, account: &str) -> R<usize> {
        pending_by(&self.conn(), account, now())
    }

    /// Every invitation into `folder` at or inside `root` (`""` the whole
    /// folder) that is not used, ended or expired yet, ended now; their ids:
    /// a moved table's undone (ADR 0117 R9, `campaign_move`). For a
    /// subfolder, an invitation into a share at that folder or inside it.
    pub fn end_invitations_into(&self, folder: &str, root: &str) -> R<Vec<String>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "UPDATE invitations SET ended = ?3
                 WHERE kind = 'invite' AND folder = ?1 AND used IS NULL AND ended IS NULL
                   AND expires > ?3
                   AND (?2 = '' OR share IN (SELECT id FROM shares WHERE folder = ?1
                        AND (path = ?2 OR substr(path, 1, length(?2) + 1) = ?2 || '/')))
                 RETURNING id",
            )
            .map_err(e)?;
        st.query_map(params![folder, root, now()], |r| r.get(0))
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)
    }

    /// Every invitation `account` made that is not used, ended or expired
    /// yet ended now; their ids. One already used stays used: whoever accepted keeps
    /// what it gave.
    pub fn end_invitations_by(&self, account: &str) -> R<Vec<String>> {
        let conn = self.conn();
        let mut st = conn
            .prepare(
                "UPDATE invitations SET ended = ?2
                 WHERE kind = 'invite' AND created_by = ?1 AND used IS NULL AND ended IS NULL
                   AND expires > ?2
                 RETURNING id",
            )
            .map_err(e)?;
        st.query_map(params![account, now()], |r| r.get(0))
            .map_err(e)?
            .collect::<rusqlite::Result<_>>()
            .map_err(e)
    }
}
