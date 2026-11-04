// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The two boxes of *Turn into a server* (ADR 0117 D1, D4 Q2) and its
//! invitations (D3 item 2, D4 Q8): the box *On my network* is a setting,
//! kept, changed while serving is off; the box *By an internet link* is
//! the link itself, turned on and off while serving or to start it, never
//! kept (D3 item 6). The link's `cloudflared` is `crate::tunnel`'s; the
//! server's door, accounts and invitations are `verso_server::local`'s.
//!
//! What crosses: the contract's `LocalLink`, `LocalInvite` and
//! `LocalInvitation`. An invitation's link is said once, to the window;
//! it is never in the log (the words of a failure carry none).

use verso_contract::{LocalInvitation, LocalInvite, LocalLink};
use verso_server::db::Role;
use verso_server::local::LocalSettings;

use super::platform::{blocking, check_not_synced, known_path, server, status_of};
use super::*;

/// Seconds since 1970 as the contract's `u32` (until 2106).
fn seconds(at: i64) -> u32 {
    u32::try_from(at).unwrap_or(0)
}

/// Tick or untick *On my network*. Not while serving: the listeners are
/// made at a start, as the folders are.
pub(super) async fn network<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    on: bool,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        if local.status()?.serving {
            return Err("turn serving off to change where it serves".to_owned());
        }
        let set = local.settings()?;
        local.set_settings(&LocalSettings { network: on, ..set })?;
        status_of(&app, &local)
    })
    .await
}

/// Turn the internet link on: a quick link, or the own address when that
/// is the mode (D10). Serving starts with it when it was off — on the
/// network too when that box is ticked. Blocking up to the download of
/// `cloudflared` on first use and its first connection.
pub(super) async fn link_on<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalLink, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        check_not_synced(&app, &local)?;
        let set = local.settings()?;
        let view = match (set.link_own, set.own_address) {
            (true, Some(own)) => crate::tunnel::own_on(&app, &own.tunnel, &own.hostname)?,
            (true, None) => {
                return Err("set up your own address first, or use a quick link".to_owned());
            }
            (false, _) => crate::tunnel::link_on(&app)?,
        };
        Ok(crate::tunnel::contract(&view))
    })
    .await
}

/// Turn the link off (or stop it while it starts). With *On my network*
/// unticked nothing is left to serve, and serving stops with it.
pub(super) async fn link_off<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalLink, ContractError> {
    blocking(move || Ok(crate::tunnel::contract(&crate::tunnel::link_off(&app)))).await
}

/// *Extend*: a quick link's twelve hours from now again, the same link.
pub(super) async fn link_extend<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalLink, ContractError> {
    blocking(move || crate::tunnel::link_extend(&app).map(|v| crate::tunnel::contract(&v))).await
}

/// A quick link or the own address, for the next time the link is turned
/// on (D10). The own address needs one set up.
pub(super) async fn link_mode<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    own: bool,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        let set = local.settings()?;
        if own && set.own_address.is_none() {
            return Err("set up your own address first".to_owned());
        }
        local.set_settings(&LocalSettings {
            link_own: own,
            ..set
        })?;
        status_of(&app, &local)
    })
    .await
}

/// A new invitation (D3 item 2, D4 Q8): to the served folder this computer
/// knows by `key`, reading or editing, or to no folder; its single-use
/// link is built from the link's origin while it has one, else the
/// network's address. Needs serving on.
pub(super) async fn invite<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: Option<String>,
    editor: bool,
) -> Result<LocalInvite, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        let name = match key {
            Some(key) => {
                let path = known_path(&app, &key)?;
                Some(local.served_name(&path).ok_or_else(|| {
                    "this folder is not served now: tick it and turn serving on".to_owned()
                })?)
            }
            None => None,
        };
        let role = if editor { Role::Editor } else { Role::Reader };
        let made = local.invite(name.as_deref(), Some(role))?;
        Ok(LocalInvite {
            id: made.id,
            link: made.link,
            expires: seconds(made.expires),
        })
    })
    .await
}

/// Every invitation of this computer's server, freshest first.
pub(super) async fn invitations<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalInvitation>, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        Ok(local
            .invitations()?
            .into_iter()
            .map(|i| LocalInvitation {
                id: i.id,
                folder: i.folder,
                role: i.role,
                created: seconds(i.created),
                expires: seconds(i.expires),
                state: i.state,
                used_by: i.used_by_name,
            })
            .collect())
    })
    .await
}

/// End an invitation not used yet: its link opens nothing from now.
pub(super) async fn invitation_revoke<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    let local = server(&app)?;
    blocking(move || local.end_invitation(&id)).await
}
