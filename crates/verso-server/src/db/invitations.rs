// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Single-use links made: an invitation, a password reset, the first
//! admin's setup (ADR 0074 items 4 and 5) — and what a game master who is
//! not the admin may keep of them (ADR 0117 D7 (e)): its maker still holds
//! the power it was made with and owns the folder, and has fewer than a
//! number pending, all read under the lock the row is written under; its
//! pending invitations end when the power, the folder's ownership or the
//! folder goes.

use rusqlite::{Connection, OptionalExtension, params};

use super::{Audit, Db, Invitation, NewLink, R, e, now};
use crate::crypto;

/// What the maker of an invitation must still be when its row is written:
/// read under the same lock, so a power or an ownership taken away before
/// refuses it, and two at once never pass the number together.
#[derive(Debug, Clone, Copy, Default)]
pub struct Still<'a> {
    /// The server's admin.
    pub admin: bool,
    /// The admin, or an account the admin lets make folders.
    pub may_create: bool,
    /// An owner of this folder.
    pub owner_of: Option<&'a str>,
    /// Fewer than this many invitations pending.
    pub most: Option<usize>,
}

/// Why the row was not written.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lost {
    /// The maker no longer holds the power it acted with.
    Power,
    /// The maker no longer owns the folder.
    Owner,
    /// The maker has the most pending already.
    TooMany(usize),
}

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

/// Whether `by` is still what `still` asks, on `conn`.
fn holds(conn: &Connection, by: &str, still: &Still<'_>, at: i64) -> R<Result<(), Lost>> {
    if still.admin || still.may_create {
        let powers: Option<(bool, bool)> = conn
            .query_row(
                "SELECT admin, may_create FROM accounts WHERE id = ?1",
                [by],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(e)?;
        let (admin, may_create) = powers.unwrap_or((false, false));
        if (still.admin && !admin) || (still.may_create && !admin && !may_create) {
            return Ok(Err(Lost::Power));
        }
    }
    if let Some(folder) = still.owner_of {
        let owns: bool = conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM grants WHERE folder = ?1 AND account = ?2 AND role = 'owner')",
                params![folder, by],
                |r| r.get(0),
            )
            .map_err(e)?;
        if !owns {
            return Ok(Err(Lost::Owner));
        }
    }
    if let Some(most) = still.most
        && pending_by(conn, by, at)? >= most
    {
        return Ok(Err(Lost::TooMany(most)));
    }
    Ok(Ok(()))
}

/// End every pending invitation `which` names (with `?1` = `first` and the
/// time as `?2`); their ids.
fn end_where(conn: &Connection, which: &str, first: &str) -> R<Vec<String>> {
    let mut st = conn
        .prepare(&format!(
            "UPDATE invitations SET ended = ?2
             WHERE kind = 'invite' AND used IS NULL AND ended IS NULL AND expires > ?2 AND {which}
             RETURNING id"
        ))
        .map_err(e)?;
    st.query_map(params![first, now()], |r| r.get(0))
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
}

impl Db {
    /// A single-use link's token, made now; its row says what it does.
    pub fn create_invitation(&self, link: &NewLink<'_>) -> R<(String, Invitation)> {
        self.create_invitation_within(link, &Still::default())?
            .map_err(|_| "invitation refused".to_owned())
    }

    /// [`Db::create_invitation`], when its maker (`created_by`) is still
    /// what `still` asks: read and written under one lock.
    pub fn create_invitation_within(
        &self,
        link: &NewLink<'_>,
        still: &Still<'_>,
    ) -> R<Result<(String, Invitation), Lost>> {
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
            if let Some(by) = created_by
                && let Err(lost) = holds(&conn, by, still, at)?
            {
                return Ok(Err(lost));
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
        Ok(Ok((token, invitation)))
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
    /// yet ended now; their ids. One already used stays used: whoever
    /// accepted keeps what it gave.
    pub fn end_invitations_by(&self, account: &str) -> R<Vec<String>> {
        end_where(&self.conn(), "created_by = ?1", account)
    }

    /// `account` stopped being an owner of `folder`: the invitations it made
    /// into the folder that wait end now (ADR 0117 D7 (e): never into
    /// another's folder), each in the audit, by the server.
    pub(super) fn ownership_ended(&self, folder: &str, account: &str) -> R<()> {
        let ended = {
            let conn = self.conn();
            let mut st = conn
                .prepare(
                    "UPDATE invitations SET ended = ?3
                     WHERE kind = 'invite' AND used IS NULL AND ended IS NULL AND expires > ?3
                       AND created_by = ?1 AND folder = ?2
                     RETURNING id",
                )
                .map_err(e)?;
            st.query_map(params![account, folder, now()], |r| r.get::<_, String>(0))
                .map_err(e)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(e)?
        };
        self.audit_ended(&ended, Some(folder))
    }

    /// A folder about to go, on its connection: the invitations into it
    /// that wait end, or the folder's going would leave them carrying
    /// nothing — an account on the server with no place, which a game
    /// master may not invite to (ADR 0117 D7 (e)). Their ids.
    pub(super) fn folder_ending(conn: &Connection, folder: &str) -> R<Vec<String>> {
        end_where(conn, "folder = ?1", folder)
    }

    /// Each of `ended` in the audit, as ended by the server.
    pub(super) fn audit_ended(&self, ended: &[String], folder: Option<&str>) -> R<()> {
        for id in ended {
            self.audit(&Audit {
                actor: None,
                action: "invitation_ended",
                subject: Some(id),
                folder,
                address: None,
                ok: true,
            })?;
        }
        Ok(())
    }
}
