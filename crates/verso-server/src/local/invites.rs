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
//! used yet. Every act is the console's (`crate::admin::acts`).
//!
//! A folder served in part is no player's (D3 item 1): no invitation names
//! it. An invitation gives reading or editing, never the owner's role
//! (`[OPEN]` for the maintainer: the smallest choice; ADR 0117 does not
//! say). The link is said once, to the caller; never in the log.

use serde::Serialize;

use super::{LocalServer, Running, lock};
use crate::admin::acts;
pub use crate::admin::acts::InvitationRow;
use crate::db::Role;

/// An invitation just made: its link is said this once.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Invite {
    pub id: String,
    pub link: String,
    pub expires: i64,
}

/// Where an invitation is opened: the link's origin while it has one, else
/// the network's address this server is reached at — the host's own name
/// with its own certificate files, or the best address (D4 Q8). The same
/// as the table's invitation (`crate::window_link`): `Policy::links_base`.
pub(super) fn base(r: &Running) -> Option<String> {
    r.policy.links_base()
}

impl LocalServer {
    /// A new invitation at the computer: to `folder` (a served folder's
    /// name, as a person is shown it) at `role` (reading when none is
    /// said), or to no folder. Needs serving on, for the address the link
    /// opens at. The app's window invites at the folder's page and calls
    /// none of this; it is how the tests of this crate and the app's host
    /// make a player.
    #[doc(hidden)]
    pub fn invite(&self, folder: Option<&str>, role: Option<Role>) -> Result<Invite, String> {
        let running = lock(&self.shared.inner);
        let r = running
            .as_ref()
            .ok_or_else(|| "turn serving on first".to_owned())?;
        let base = base(r).ok_or_else(|| "this server has no address to invite to".to_owned())?;
        let db = &r.server.db;
        let folder = folder
            .map(|name| {
                let f = db
                    .folder_by_dir(name)?
                    .ok_or_else(|| format!("{name} is not a folder this computer serves"))?;
                if r.policy.hides(&f.id) {
                    return Err(format!(
                        "{name} is served in part: its folders are your phones' alone"
                    ));
                }
                Ok(f)
            })
            .transpose()?;
        let role = match (&folder, role.unwrap_or(Role::Reader)) {
            (None, _) => None,
            (Some(_), Role::Owner) => {
                return Err("an invitation gives reading or editing".to_owned());
            }
            (Some(_), r) => Some(r),
        };
        let owner = db.local_owner()?;
        let (token, inv) = acts::make_invitation(
            db,
            &acts::By::default(),
            Some(&owner.id),
            &acts::Invitee {
                folder: folder.as_ref().map(|f| f.id.as_str()),
                role,
                ..acts::Invitee::default()
            },
        )
        .map_err(|e| e.to_string())?;
        crate::log::info("an invitation was made at the computer");
        drop(running);
        (self.shared.events)(super::Event::Changed);
        Ok(Invite {
            id: inv.id,
            link: format!("{base}/invite/{token}"),
            expires: inv.expires,
        })
    }

    /// The name a served `folder` (a path the host knows) is shown by, the
    /// one [`Self::invite`] takes; none when serving is off or the folder
    /// is not served.
    pub fn served_name(&self, folder: &std::path::Path) -> Option<String> {
        let running = lock(&self.shared.inner);
        let key = verso_core::folder_key(folder);
        running
            .as_ref()?
            .policy
            .folders
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .iter()
            .find(|(_, p)| verso_core::folder_key(p) == key)
            .map(|(n, _)| n.clone())
    }

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
