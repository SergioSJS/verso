// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Another person's desktop app at this computer's server (ADR 0117 D9,
//! build step S11): an account invited here signs its Verso in through the
//! browser as on a UniVerso (ADR 0074 item 8, `crate::device`), and the
//! device's session syncs a folder shared with that account (ADR 0079) and
//! edits it live (ADR 0082) — through the same server code.
//!
//! What a bearer credential is here ([`Policy::bearer_who`]):
//! - through the owner's window's door, the seat's token and nothing else
//!   (D4 Q3, `seat.rs`);
//! - elsewhere, a device's session of an invited account; never a session
//!   with a phone's row, never one of this computer's own accounts (the
//!   owner, the holder of the folders served in part) — so the seat's
//!   token opens nothing outside its door, and a phone, which is a browser
//!   session of the owner, never becomes a device;
//! - a personal access token: not yet (S13).
//!
//! A phone has none of the device routes (`routes.rs`, as an unknown route)
//! and still runs no `sync_*` (the allowlist, `allow.rs`). The hide lock of
//! a folder served in part holds for a device as for everyone
//! (`crate::access::role`).
//!
//! The owner sees the desktop apps signed in to this server and ends one
//! ([`LocalServer::devices`], [`LocalServer::end_device`]); the seat is
//! never among them.

use serde::Serialize;

use super::{LocalServer, Policy, lock};
use crate::auth::{Via, Who};
use crate::db::{Audit, Db, is_this_computer};
use crate::state::Server;

/// A desktop app signed in to this server by an invited account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// The session's id, to end it.
    pub id: String,
    /// The device's own name (Settings › Servers on that computer).
    pub device: String,
    /// The account's name and e-mail-shaped identifier.
    pub account: String,
    pub email: String,
    pub created: i64,
    pub last_used: i64,
}

impl Policy {
    /// Who a bearer `secret` is in "this app is a server"; see the module.
    pub fn bearer_who(
        &self,
        server: &Server,
        secret: &str,
        by_seat: bool,
    ) -> Result<Option<Who>, String> {
        if by_seat {
            return self.seat_who(server, secret, true);
        }
        let Some(who) = crate::auth::bearer_who(server, secret)? else {
            return Ok(None);
        };
        // Personal access tokens are not taken here yet (ADR 0117 D9: S13).
        if matches!(who.via, Via::Token { .. }) {
            return Ok(None);
        }
        // A phone is a browser's session of the owner, which a bearer never
        // opens; the owner's devices — the seat's token outside its door —
        // and the holder's are this computer's.
        if is_this_computer(&who.account.email) {
            return Ok(None);
        }
        Ok(Some(who))
    }

    /// Whether session `id` is the owner's window's seat: listed nowhere.
    #[must_use]
    pub fn is_seat(&self, id: &str) -> bool {
        self.seat_session().is_some_and(|s| s == id)
    }
}

/// The device sessions of the invited accounts, the newest use first.
fn devices_of(db: &Db) -> Result<Vec<Device>, String> {
    let mut out = Vec::new();
    for account in db.accounts()? {
        if is_this_computer(&account.email) {
            continue;
        }
        for s in db.sessions_of(&account.id)? {
            if s.kind != "device" {
                continue;
            }
            out.push(Device {
                id: s.id,
                device: s.device,
                account: account.name.clone(),
                email: account.email.clone(),
                created: s.created,
                last_used: s.last_used,
            });
        }
    }
    out.sort_by_key(|d| std::cmp::Reverse(d.last_used));
    Ok(out)
}

impl LocalServer {
    /// The desktop apps signed in to this server by invited accounts (ADR
    /// 0117 D9), for Settings; never the owner's window's seat, never a
    /// phone (those are [`LocalServer::phones`]).
    pub fn devices(&self) -> Result<Vec<Device>, String> {
        self.with_db(devices_of)
    }

    /// End a desktop app's session: its connections close at once, and it
    /// signs in again to sync. Logged and in the audit.
    pub fn end_device(&self, id: &str) -> Result<(), String> {
        let running = lock(&self.shared.inner);
        let ended = match running.as_ref() {
            Some(r) => end_in(&r.server.db, id, |account| {
                r.server.sessions_ended(account, Some(id), None);
            })?,
            None => {
                drop(running);
                end_in(&self.open_db()?, id, |_| {})?
            }
        };
        let Some(device) = ended else {
            return Err("that app is not signed in here".to_owned());
        };
        crate::log::info(&format!("a desktop app's session was ended: {device}"));
        (self.shared.events)(super::Event::Changed);
        Ok(())
    }
}

/// End device `id` of an invited account in `db`; its name, when it was
/// one.
fn end_in(db: &Db, id: &str, told: impl FnOnce(&str)) -> Result<Option<String>, String> {
    let Some(found) = devices_of(db)?.into_iter().find(|d| d.id == id) else {
        return Ok(None);
    };
    let Some(account) = db.account_by_email(&found.email)?.map(|a| a.id) else {
        return Ok(None);
    };
    let device = found.device;
    if !db.end_session(&account, id)? {
        return Ok(None);
    }
    told(&account);
    db.audit(&Audit {
        actor: None,
        action: "device_ended",
        subject: Some(&device),
        folder: None,
        address: None,
        ok: true,
    })?;
    Ok(Some(device))
}
