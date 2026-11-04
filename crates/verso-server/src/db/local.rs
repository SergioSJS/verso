// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What "this app is a server" keeps in its own database (ADR 0096 items
//! 2, 12, 15 and 16): the one local owner, and the phones paired to it —
//! each a browser session of that owner with the role it was given at
//! pairing (reader or editor, never more), counted against the most a
//! laptop holds. The same database file, in the app's configuration
//! directory and `0600` (`Db::open`); nothing of it is in a served folder.

use rusqlite::{OptionalExtension, params};

use super::{Account, Db, R, Role, SESSION_IDLE, SESSION_MAX, e, now};
use crate::crypto;

/// Schema 12: the phones paired with a computer that serves. A phone is a
/// session; ending the session (revoking it, forgetting all) takes its row
/// with it, and a row of a session that expired is swept
/// ([`Db::purge_phones`]).
pub(super) const PHONES: &str = r"
CREATE TABLE phones (
  session TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('reader', 'editor')),
  noticed INTEGER NOT NULL DEFAULT 0
);
";

/// The local owner's e-mail: no one signs in with it — it has no password,
/// and its sessions are its phones (ADR 0096 item 2) — it only names the
/// account in the audit log and the folders' grants. The owner is this
/// server's admin (ADR 0117 D3 item 2); a phone of it is not
/// (`crate::auth::who`).
pub const LOCAL_OWNER: &str = "owner@this-computer.verso";

/// The local owner's name until it has one (`local::owner`): the host
/// names it from the system's user at the first use.
pub const LOCAL_OWNER_UNNAMED: &str = "This computer";

/// The domain of this computer's own accounts: none is a person's, and an
/// invitation never makes one in it ([`is_this_computer`]).
const THIS_COMPUTER: &str = "@this-computer.verso";

/// Whether `email` is in the domain of this computer's own accounts (the
/// owner, the holder of the folders served in part): no player takes such
/// an address, so none can become the holder of a folder served in part
/// before it is made (ADR 0117 D3 item 1).
#[must_use]
pub fn is_this_computer(email: &str) -> bool {
    super::fold_email(email).ends_with(THIS_COMPUTER)
}

/// The account that holds a folder served in part (ADR 0096 item 2,
/// amended 2026-10-16): the folder is registered because the shares of its
/// chosen sub-folders need a folder to belong to, but it is **not the
/// phones'**: the local owner, whose sessions the phones are, has no grant
/// in it, so the folder's own id opens nothing for a phone and the owner
/// holds only the shares. Like the owner's, nobody signs in with it.
pub const VAULT_HOLDER: &str = "vaults@this-computer.verso";

/// A paired phone, as Settings lists it (ADR 0096 item 15).
#[derive(Debug, Clone, serde::Serialize)]
pub struct Phone {
    /// The session's id, which Revoke names.
    pub id: String,
    pub name: String,
    pub role: Role,
    pub paired: i64,
    pub last_seen: i64,
    pub address: String,
}

impl Db {
    /// The local owner, made at the first use: this server's admin (ADR
    /// 0117 D3 item 2), who makes no folder (the laptop's are ticked, not
    /// made). An owner a build before 0117 made is made admin here.
    pub fn local_owner(&self) -> R<Account> {
        let owner = match self.account_by_email(LOCAL_OWNER)? {
            Some(a) if a.admin && !a.may_create => return Ok(a),
            Some(a) => a,
            None => self.create_account(LOCAL_OWNER, LOCAL_OWNER_UNNAMED, "pt", None, true)?,
        };
        self.set_powers(&owner.id, true, false)?;
        Ok(Account {
            admin: true,
            may_create: false,
            ..owner
        })
    }

    /// The holder of the folders served in part, made at the first use.
    pub fn vault_holder(&self) -> R<Account> {
        if let Some(a) = self.account_by_email(VAULT_HOLDER)? {
            return Ok(a);
        }
        self.create_account(VAULT_HOLDER, "This computer", "pt", None, false)
    }

    /// A phone paired: a browser session of `owner` with `role`, and its
    /// row, in one transaction — or `Err("full")` when `most` phones are
    /// already paired (ADR 0096 item 13). Returns the session's token, its
    /// CSRF token and its id.
    pub fn pair_phone(
        &self,
        owner: &str,
        device: &str,
        address: &str,
        role: Role,
        most: usize,
    ) -> R<(String, String, String)> {
        let role = match role {
            Role::Reader => "reader",
            // Never owner: an owner's role is not a phone's (item 12).
            _ => "editor",
        };
        let token = crypto::token()?;
        let csrf = crypto::token()?;
        let id = crypto::id()?;
        let at = now();
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let live: i64 = tx
            .query_row(
                &live_sql("count(*)"),
                params![at - SESSION_IDLE, at - SESSION_MAX],
                |r| r.get(0),
            )
            .map_err(e)?;
        if usize::try_from(live).unwrap_or(usize::MAX) >= most {
            return Err("full".to_owned());
        }
        tx.execute(
            "INSERT INTO sessions (id, hash, account, kind, device, csrf, created, last_used, address, proved_at)
             VALUES (?1, ?2, ?3, 'browser', ?4, ?5, ?6, ?6, ?7, ?6)",
            params![id, crypto::hash(&token), owner, device, csrf, at, address],
        )
        .map_err(e)?;
        tx.execute(
            "INSERT INTO phones (session, role) VALUES (?1, ?2)",
            params![id, role],
        )
        .map_err(e)?;
        tx.commit().map_err(e)?;
        Ok((token, csrf, id))
    }

    /// End the sessions of the owner's window's seat (`device`, a device
    /// session of `owner`) that a run before left — a crash: no seat
    /// outlives serving (ADR 0117 D4 Q3).
    pub fn end_seats(&self, owner: &str, device: &str) -> R<usize> {
        self.conn()
            .execute(
                "DELETE FROM sessions WHERE account = ?1 AND kind = 'device' AND device = ?2",
                params![owner, device],
            )
            .map_err(e)
    }

    /// The role session `id` was paired with; `None` when it is no
    /// phone's — a session without a row opens nothing in this mode.
    pub fn phone_role(&self, id: &str) -> R<Option<Role>> {
        let role: Option<String> = self
            .reader()
            .query_row("SELECT role FROM phones WHERE session = ?1", [id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(e)?;
        Ok(role.as_deref().and_then(Role::parse))
    }

    /// Phone `id` now has `role` (a reader or an editor, never above):
    /// true when it was a phone.
    pub fn set_phone_role(&self, id: &str, role: &str) -> R<bool> {
        Ok(self
            .conn()
            .execute(
                "UPDATE phones SET role = ?2 WHERE session = ?1",
                params![id, role],
            )
            .map_err(e)?
            > 0)
    }

    /// The phones paired and still standing (not idle for 14 days, not
    /// older than 90), freshest use first.
    pub fn phones(&self) -> R<Vec<Phone>> {
        let at = now();
        let conn = self.reader();
        let mut st = conn
            .prepare(&format!(
                "{} ORDER BY s.last_used DESC",
                live_sql("s.id, s.device, p.role, s.created, s.last_used, s.address")
            ))
            .map_err(e)?;
        st.query_map(params![at - SESSION_IDLE, at - SESSION_MAX], |r| {
            let role: String = r.get(2)?;
            Ok(Phone {
                id: r.get(0)?,
                name: r.get(1)?,
                role: Role::parse(&role).unwrap_or(Role::Reader),
                paired: r.get(3)?,
                last_seen: r.get(4)?,
                address: r.get(5)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)
    }

    /// How many phones are paired and standing.
    pub fn phone_count(&self) -> R<usize> {
        let at = now();
        let n: i64 = self
            .reader()
            .query_row(
                &live_sql("count(*)"),
                params![at - SESSION_IDLE, at - SESSION_MAX],
                |r| r.get(0),
            )
            .map_err(e)?;
        Ok(usize::try_from(n).unwrap_or(0))
    }

    /// Sessions of phones that expired, ended: their rows go with them.
    pub fn purge_phones(&self) -> R<usize> {
        let at = now();
        self.conn()
            .execute(
                "DELETE FROM sessions WHERE id IN (SELECT session FROM phones)
                 AND (last_used < ?1 OR created < ?2)",
                params![at - SESSION_IDLE, at - SESSION_MAX],
            )
            .map_err(e)
    }

    /// Every phone forgotten: their sessions end (ADR 0096 item 15).
    pub fn forget_phones(&self) -> R<Vec<String>> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(e)?;
        let ids: Vec<String> = {
            let mut st = tx.prepare("SELECT session FROM phones").map_err(e)?;
            st.query_map([], |r| r.get(0))
                .map_err(e)?
                .collect::<rusqlite::Result<_>>()
                .map_err(e)?
        };
        tx.execute(
            "DELETE FROM sessions WHERE id IN (SELECT session FROM phones)",
            [],
        )
        .map_err(e)?;
        tx.commit().map_err(e)?;
        Ok(ids)
    }

    /// Session `id` of a phone seen for the first time since it was
    /// paired: true once, then false (the notification of item 14).
    pub fn first_seen(&self, id: &str) -> R<bool> {
        Ok(self
            .conn()
            .execute(
                "UPDATE phones SET noticed = 1 WHERE session = ?1 AND noticed = 0",
                [id],
            )
            .map_err(e)?
            > 0)
    }
}

/// The phones standing: `select` over the join, with `?1` the earliest a
/// session may have been used and `?2` the earliest it may have been made.
fn live_sql(select: &str) -> String {
    format!(
        "SELECT {select} FROM phones p JOIN sessions s ON s.id = p.session
         WHERE s.last_used >= ?1 AND s.created >= ?2"
    )
}
