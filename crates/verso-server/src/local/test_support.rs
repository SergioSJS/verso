// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! For the tests only — this crate's, and the app's host's through the
//! `test-support` feature (its dev-dependencies): a player made at the
//! computer. The app invites at the folder's page (`campaign_invite`,
//! `shares::invite`); this is the same act (`admin::acts::make_invitation`)
//! with a folder named and no page to make it from.

use super::{LocalServer, lock};
use crate::admin::acts;
use crate::db::Role;

/// An invitation just made, with its link.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invite {
    pub id: String,
    pub link: String,
    pub expires: i64,
}

impl LocalServer {
    /// An invitation to `folder` (a served folder's name) at `role`
    /// (reading when none is said), or to no folder, its link where this
    /// server is reached now (`Policy::links_base`). Serving must be on.
    pub fn invite_for_tests(
        &self,
        folder: Option<&str>,
        role: Option<Role>,
    ) -> Result<Invite, String> {
        let running = lock(&self.shared.inner);
        let r = running
            .as_ref()
            .ok_or_else(|| "turn serving on first".to_owned())?;
        let base = r
            .policy
            .links_base()
            .ok_or_else(|| "this server has no address to invite to".to_owned())?;
        let db = &r.server.db;
        let folder = match folder {
            Some(name) => Some(
                db.folder_by_dir(name)?
                    .ok_or_else(|| format!("{name} is not a folder this computer serves"))?
                    .id,
            ),
            None => None,
        };
        let owner = db.local_owner()?;
        let (token, inv) = acts::make_invitation(
            db,
            &acts::By::default(),
            Some(&owner.id),
            &acts::Invitee {
                folder: folder.as_deref(),
                role: folder.as_ref().map(|_| role.unwrap_or(Role::Reader)),
                ..acts::Invitee::default()
            },
        )
        .map_err(|e| e.to_string())?;
        Ok(Invite {
            id: inv.id,
            link: format!("{base}/invite/{token}"),
            expires: inv.expires,
        })
    }

    /// The name a served `folder` (a path the host knows) is shown by; none
    /// when serving is off or the folder is not served.
    #[must_use]
    pub fn served_name_for_tests(&self, folder: &std::path::Path) -> Option<String> {
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
}

/// This machine's interfaces as a test sees them: loopback alone.
struct LoopbackOnly;

impl super::net::Interfaces for LoopbackOnly {
    fn list(&self) -> Vec<super::net::IfNet> {
        vec![super::net::IfNet {
            ip: std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
            prefix: 8,
            name: "lo0".to_owned(),
        }]
    }
}

impl LocalServer {
    /// A computer that serves whose network box listens on `127.0.0.1`
    /// alone, never on the machine's private addresses: a test of the
    /// app's host turns serving on and off without a listener on the
    /// network (each new test binary was asked about by the macOS
    /// firewall, 2026-11-04). Otherwise [`LocalServer::new`].
    #[must_use]
    pub fn on_loopback_for_tests(
        dir: std::path::PathBuf,
        ui_dirs: Vec<std::path::PathBuf>,
        events: std::sync::Arc<dyn Fn(super::Event) + Send + Sync>,
    ) -> Self {
        Self::for_tests(
            dir,
            ui_dirs,
            events,
            std::sync::Arc::new(LoopbackOnly),
            true,
        )
    }
}
