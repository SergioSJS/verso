// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Servers found on the home network (ADR 0097): while Settings › Servers
//! is open the window asks the host to browse `_verso._tcp` and lists what
//! is found ("Encontrados nesta rede"). The browse ends when the section
//! closes (`discover_servers_stop`) — nothing listens on the network the
//! rest of the time. What is found is an unauthenticated announcement: the
//! list gives the window an address to show, and a click fills it in;
//! nothing here connects, signs in or sends anything.

use super::*;
use verso_contract::FoundServer;
use verso_server::discovery::{Browser, Found};

/// The running browse, if the section is open.
static BROWSE: Mutex<Option<Browser>> = Mutex::new(None);

/// What the window shows of one announcement: only those with an address.
pub(crate) fn shown(found: &[Found]) -> Vec<FoundServer> {
    found
        .iter()
        .filter_map(|f| {
            Some(FoundServer {
                name: f.name.clone(),
                host: f.host.clone(),
                url: f.url()?,
                https: f.https,
                version: f.version.clone(),
            })
        })
        .collect()
}

/// Begin browsing (once; asking again keeps the browse that runs).
#[tauri::command]
#[specta::specta]
pub(crate) fn discover_servers_start() -> Result<(), ContractError> {
    let mut slot = lock(&BROWSE);
    if slot.is_none() {
        *slot = Some(Browser::start().map_err(|e| {
            log::write(
                "WARN",
                "discover",
                &format!("cannot browse the network: {e}"),
            );
            failed(e)
        })?);
    }
    Ok(())
}

/// What has been found so far; empty when no browse runs.
#[tauri::command]
#[specta::specta]
pub(crate) fn discover_servers_list() -> Result<Vec<FoundServer>, ContractError> {
    Ok(lock(&BROWSE)
        .as_ref()
        .map(|b| shown(&b.list()))
        .unwrap_or_default())
}

/// Stop browsing; the network is left alone.
#[tauri::command]
#[specta::specta]
pub(crate) fn discover_servers_stop() -> Result<(), ContractError> {
    lock(&BROWSE).take();
    Ok(())
}
