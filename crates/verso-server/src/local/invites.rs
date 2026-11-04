// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Invitations of "this app is a server" (ADR 0117 D3 item 2, D4 Q5 and
//! Q8): a single-use link for seven days (ADR 0074 item 4) — through the
//! internet link's origin while it has one, else the network's address,
//! with the own certificate — that may carry a served folder and a role; a
//! person accepts it with an e-mail-shaped name, a name and a password,
//! and nothing is mailed. They are made at the folder's page, as on a
//! UniVerso (decided 2026-11-04): a table's `campaign_invite`, a folder's
//! `shares::invite` from the share dialog, both through the window at the
//! table. Settings lists them, every one of this server, and ends one not
//! used yet. Every act is the console's (`crate::admin::acts`). None is
//! made at the computer; the tests make a player with
//! `LocalServer::invite_for_tests` (`test_support.rs`).
//!
//! A folder served in part is no player's (D3 item 1): no invitation names
//! it. An invitation gives reading or editing, never the owner's role
//! (`[OPEN]` for the maintainer: the smallest choice; ADR 0117 does not
//! say). The link is said once, to the caller; never in the log.

use super::{LocalServer, Running};
use crate::admin::acts;
pub use crate::admin::acts::InvitationRow;

/// Where an invitation is opened: the link's origin while it has one, else
/// the network's address this server is reached at — the host's own name
/// with its own certificate files, or the best address (D4 Q8). The same
/// as the table's invitation (`crate::window_link`): `Policy::links_base`.
pub(super) fn base(r: &Running) -> Option<String> {
    r.policy.links_base()
}

impl LocalServer {
    /// Every invitation of this server, freshest first (on or off): the
    /// owner's from here and the table's alike, as the console lists them.
    pub fn invitations(&self) -> Result<Vec<InvitationRow>, String> {
        self.with_db(|db| acts::invitation_rows(db, &db.invitations()?, crate::db::now()))
    }

    /// End an invitation not used yet: its link opens nothing from now.
    pub fn end_invitation(&self, id: &str) -> Result<(), String> {
        let ended = self.with_db(|db| acts::end_invitation(db, &acts::By::default(), id))?;
        if !ended {
            return Err("that invitation is used, ended or not there".to_owned());
        }
        crate::log::info("an invitation was ended at the computer");
        (self.shared.events)(super::Event::Changed);
        Ok(())
    }
}
