// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Invitations of "this app is a server" (ADR 0117 D3 item 2, D4 Q5 and
//! Q8): the owner, from the app, makes a single-use link for seven days
//! (ADR 0074 item 4) — through the internet link's origin while it has
//! one, else the network's address, with the own certificate — that may
//! carry a served folder and a role; a person accepts it with an
//! e-mail-shaped name, a name and a password, and nothing is mailed. The
//! section lists them, every one of this server: the owner's from here and
//! the table's (`campaign_invite`) alike, and ends one not used yet.
//!
//! A folder served in part is no player's (D3 item 1): no invitation names
//! it. An invitation gives reading or editing, never the owner's role
//! (`[OPEN]` for the maintainer: the smallest choice; ADR 0117 does not
//! say). The link is said once, to the caller; never in the log.

use serde::Serialize;

use super::{LocalServer, Running, lock, net};
use crate::db::{Audit, Db, INVITE_LIFE, NewLink, Role};

/// An invitation just made: its link is said this once.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Invite {
    pub id: String,
    pub link: String,
    pub expires: i64,
}

/// One invitation as the section lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvitationRow {
    pub id: String,
    /// The served folder it carries, by the name a person is shown.
    pub folder: Option<String>,
    pub role: Option<String>,
    pub created: i64,
    pub expires: i64,
    /// `pending`, `used`, `ended` or `expired`.
    pub state: String,
    /// The name of the account that used it.
    pub used_by: Option<String>,
}

/// Where an invitation is opened: the link's origin while it has one, else
/// the network's address this server is reached at — the host's own name
/// with its own certificate files, or the best address (D4 Q8).
fn base(r: &Running) -> Option<String> {
    if let Some(origin) = r.policy.link_origin() {
        return Some(origin);
    }
    let first = r.nets.first()?;
    let named = super::read_settings(&r.server.db)
        .host_name
        .filter(|h| !h.is_empty() && r.certificate == "files");
    Some(match named {
        Some(h) => format!("https://{h}:{}", r.port),
        None => format!("https://{}", net::authority(first.ip, r.port)),
    })
}

fn audit(db: &Db, action: &str, subject: &str, folder: Option<&str>) {
    if let Err(e) = db.audit(&Audit {
        actor: None,
        action,
        subject: Some(subject),
        folder,
        address: None,
        ok: true,
    }) {
        crate::log::error(&format!("audit log: {e}"));
    }
}

impl LocalServer {
    /// A new invitation, from the owner at the app: to `folder` (a served
    /// folder's name, as a person is shown it) at `role` (reading when
    /// none is said), or to no folder. Needs serving on, for the address
    /// the link opens at.
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
        let (token, inv) = db.create_invitation(&NewLink {
            kind: "invite",
            email: None,
            account: None,
            folder: folder.as_ref().map(|f| f.id.as_str()),
            role,
            created_by: Some(&owner.id),
            life: INVITE_LIFE,
            share: None,
        })?;
        audit(
            db,
            "invitation_created",
            &inv.id,
            folder.as_ref().map(|f| f.id.as_str()),
        );
        crate::log::info("an invitation was made at the computer");
        drop(running);
        (self.shared.events)(super::Event::Changed);
        Ok(Invite {
            id: inv.id,
            link: format!("{base}/invite/{token}"),
            expires: inv.expires,
        })
    }

    /// Every invitation of this server, freshest first (on or off).
    pub fn invitations(&self) -> Result<Vec<InvitationRow>, String> {
        self.with_db(|db| {
            let now = crate::db::now();
            db.invitations()?
                .into_iter()
                .map(|i| {
                    let folder = match &i.folder {
                        Some(id) => db.folder(id)?.map(|f| f.dir),
                        None => None,
                    };
                    let used_by = match &i.used_by {
                        Some(id) => db.account(id)?.map(|a| a.name),
                        None => None,
                    };
                    Ok(InvitationRow {
                        state: i.state(now).to_owned(),
                        id: i.id,
                        folder,
                        role: i.role,
                        created: i.created,
                        expires: i.expires,
                        used_by,
                    })
                })
                .collect()
        })
    }

    /// End an invitation not used yet: its link opens nothing from now.
    pub fn end_invitation(&self, id: &str) -> Result<(), String> {
        let ended = self.with_db(|db| {
            let ended = db.end_invitation(id)?;
            if ended {
                audit(db, "invitation_ended", id, None);
            }
            Ok(ended)
        })?;
        if !ended {
            return Err("that invitation is used, ended or not there".to_owned());
        }
        crate::log::info("an invitation was ended at the computer");
        (self.shared.events)(super::Event::Changed);
        Ok(())
    }
}
