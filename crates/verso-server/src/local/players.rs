// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The people invited to this computer's server, as its owner manages them
//! from the app (ADR 0117 D9, the row of "forgot the password": no mail on
//! a laptop, "a player's password is reset by the owner, as 0074 item 5's
//! admin does"). The owner is this server's admin (D3 item 2) and the
//! section of Settings its console, so the admin's acts on an account are
//! here, as on a UniVerso: the same acts (`crate::admin::acts`), with
//! this computer's rules on top:
//!
//! - the list: each person's name, e-mail-shaped identifier (D4 Q5), the
//!   folders and shares they reach with their role, and when they were last
//!   seen;
//! - a new password: a single-use link for a day, the reset link of ADR
//!   0074 item 5, shown once to the owner, who hands it over (nothing is
//!   mailed). As on a UniVerso's console and its machine (`verso serve
//!   admin reset`), the account's sessions end and its tokens are revoked
//!   at once, and an earlier link stops working; the old password opens
//!   nothing once the new one is set from the link;
//! - ending every session — browsers and desktop apps — and revoking the
//!   tokens (ADR 0077 item 3), the connections closed at once;
//! - removing the account: its sessions, devices, tokens, passkeys, grants
//!   and shares go with it (the database's cascade), its connections closed
//!   first; refused while a folder would be left with no owner.
//!
//! Never this computer's own accounts — the owner, whose sessions are its
//! phones and its window's seat, and the holder of the folders served in
//! part: they are listed nowhere and refused by every act. The click in the
//! app is the owner's fresh proof (D4 Q4); each act is in the audit log,
//! never a link or a password; the log of the app says what was done, never
//! to whom.

use serde::Serialize;

use super::{LocalServer, invites, lock};
use crate::admin::acts;
use crate::db::{Account, Db, PageQuery, Role, is_this_computer};
use crate::state::Server;

/// A person invited to this server, as the section lists them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub id: String,
    pub name: String,
    /// The e-mail-shaped identifier they accepted with (nothing is mailed).
    pub email: String,
    pub created: i64,
    /// The latest use of any of their sessions; none when they have none.
    pub last_seen: Option<i64>,
    /// The folders and shares they reach, by the names a person is shown
    /// (`Campanha`, `Campanha/Mapas`), with their role in each.
    pub reaches: Vec<(String, Role)>,
}

/// A new password's link, said this once.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reset {
    pub link: String,
    pub expires: i64,
}

const NO_ONE: &str = "that person has no account here";
const THIS_COMPUTER: &str = "this computer's own accounts are no player's";

/// The player `id` in `db`: refused when it is none, or this computer's.
fn player(db: &Db, id: &str) -> Result<Account, String> {
    let account = db.account(id)?.ok_or_else(|| NO_ONE.to_owned())?;
    if is_this_computer(&account.email) {
        return Err(THIS_COMPUTER.to_owned());
    }
    Ok(account)
}

/// The accounts, as the console's list finds them (`Db::page_accounts`),
/// with what each reaches; never this computer's own.
fn players_of(db: &Db) -> Result<Vec<Player>, String> {
    let mut out = Vec::new();
    let mut at = Some(0);
    while let Some(offset) = at {
        let page = db.page_accounts(&PageQuery {
            sort: "email".to_owned(),
            offset,
            limit: 200,
            ..PageQuery::default()
        })?;
        at = page.next;
        for account in page.rows {
            if is_this_computer(&account.email) {
                continue;
            }
            let mut reaches: Vec<(String, Role)> = db
                .folders_of(&account.id)?
                .into_iter()
                .map(|(f, role)| (f.dir, role))
                .collect();
            for (share, folder, role) in db.shares_with(&account.id)? {
                reaches.push((format!("{}/{}", folder.dir, share.path), role));
            }
            out.push(Player {
                id: account.id,
                name: account.name,
                email: account.email,
                created: account.created,
                last_seen: account.last_seen,
                reaches,
            });
        }
    }
    Ok(out)
}

impl LocalServer {
    /// `f` over the database and, while serving, the running server (to
    /// close the connections of whoever is acted on).
    fn acting<T>(
        &self,
        f: impl FnOnce(&Db, Option<&Server>) -> Result<T, String>,
    ) -> Result<T, String> {
        let running = lock(&self.shared.inner);
        let out = match running.as_ref() {
            Some(r) => f(&r.server.db, Some(&r.server)),
            None => {
                drop(running);
                f(&self.open_db()?, None)
            }
        }?;
        (self.shared.events)(super::Event::Changed);
        Ok(out)
    }

    /// The people invited to this server, by e-mail; never this computer's
    /// own accounts.
    pub fn accounts(&self) -> Result<Vec<Player>, String> {
        self.with_db(players_of)
    }

    /// A new password for player `id`: a single-use link for a day, which
    /// replaces an earlier one; the account's sessions end and its tokens
    /// are revoked now. Needs serving on, for the address the link opens
    /// at (the internet link's while it has one, else the network's).
    pub fn reset_password(&self, id: &str) -> Result<Reset, String> {
        let running = lock(&self.shared.inner);
        let r = running
            .as_ref()
            .ok_or_else(|| "turn serving on first".to_owned())?;
        let base = invites::base(r)
            .ok_or_else(|| "this server has no address to send a link to".to_owned())?;
        let db = &r.server.db;
        let account = player(db, id)?;
        let owner = db.local_owner()?;
        let (token, link) = acts::reset_link(
            db,
            Some(&r.server),
            &acts::By::default(),
            Some(&owner.id),
            &account.id,
            None,
            acts::RESET_LINK,
        )
        .map_err(|e| e.to_string())?;
        crate::log::info("a new password's link was made at the computer");
        drop(running);
        (self.shared.events)(super::Event::Changed);
        Ok(Reset {
            link: format!("{base}/reset/{token}"),
            expires: link.expires,
        })
    }

    /// End every session of player `id` — browsers and desktop apps — and
    /// revoke their tokens: their open connections close at once. How many
    /// of each.
    pub fn end_sessions(&self, id: &str) -> Result<(usize, usize), String> {
        let ended = self.acting(|db, server| {
            let account = player(db, id)?;
            acts::end_sessions(db, server, &acts::By::default(), &account.id)
                .map_err(|e| e.to_string())
        })?;
        crate::log::info("a person's sessions were ended at the computer");
        Ok(ended)
    }

    /// Remove player `id`: their sessions, devices, tokens, passkeys,
    /// grants and shares go with the account, their connections closed
    /// first. Their e-mail may be invited again, as a new account.
    pub fn remove_account(&self, id: &str) -> Result<(), String> {
        self.acting(|db, server| {
            let account = player(db, id)?;
            acts::remove_account(db, server, &acts::By::default(), &account.id)
                .map_err(|e| e.to_string())
        })?;
        crate::log::info("a person's account was removed at the computer");
        Ok(())
    }
}
