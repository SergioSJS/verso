// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the accounts of this computer's server have, as the section shows
//! it (ADR 0117 D9, S11 and S12): the desktop apps of the people invited,
//! signed in through the browser, with *End*; and the switch of read
//! links, off at first (ADR 0105 item 3; the owner is the administrator,
//! the section the console); and the people invited, with a new password's
//! link, *End sessions* and *Remove* (D9, the row of "forgot the
//! password"). A phone never reaches these: the allowlist refuses the
//! `local_server_` prefix whole. The click in the window is the owner's
//! fresh proof (D4 Q4).

use verso_contract::{LocalDevice, LocalPlayer, LocalPlayerReach, LocalReset, LocalServerStatus};

use super::platform::{blocking, server, status_of};
use super::*;

fn seconds(at: i64) -> u32 {
    u32::try_from(at).unwrap_or(0)
}

/// The desktop apps signed in to this server by invited accounts, the
/// newest use first; never the owner's window at the table, never a phone.
pub(super) async fn devices<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalDevice>, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        Ok(local
            .devices()?
            .into_iter()
            .map(|d| LocalDevice {
                id: d.id,
                device: d.device,
                account: d.account,
                email: d.email,
                created: seconds(d.created),
                last_used: seconds(d.last_used),
            })
            .collect())
    })
    .await
}

/// End a desktop app's session: its connections close at once, and it
/// signs in again to sync.
pub(super) async fn end_device<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    let local = server(&app)?;
    blocking(move || local.end_device(&id)).await
}

/// Read links on or off: off ends every link at once, open pages
/// included; on, the links kept open again.
pub(super) async fn read_links<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    on: bool,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        local.set_read_links(on)?;
        status_of(&app, &local)
    })
    .await
}

/// The people invited to this server, by e-mail; never this computer's own
/// accounts.
pub(super) async fn players<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalPlayer>, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        Ok(local
            .accounts()?
            .into_iter()
            .map(|p| LocalPlayer {
                id: p.id,
                name: p.name,
                email: p.email,
                created: seconds(p.created),
                last_seen: p.last_seen.map(seconds),
                reaches: p
                    .reaches
                    .into_iter()
                    .map(|(name, role)| LocalPlayerReach {
                        name,
                        role: role.as_str().to_owned(),
                    })
                    .collect(),
            })
            .collect())
    })
    .await
}

/// A new password's link for a person, said this once; their sessions end
/// and their tokens are revoked now.
pub(super) async fn reset<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<LocalReset, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        let r = local.reset_password(&id)?;
        Ok(LocalReset {
            link: r.link,
            expires: seconds(r.expires),
        })
    })
    .await
}

/// End every session of a person — browsers and desktop apps — and revoke
/// their tokens.
pub(super) async fn end_sessions<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    let local = server(&app)?;
    blocking(move || local.end_sessions(&id).map(|_| ())).await
}

/// Remove a person's account and everything it held.
pub(super) async fn remove<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    let local = server(&app)?;
    blocking(move || local.remove_account(&id)).await
}
