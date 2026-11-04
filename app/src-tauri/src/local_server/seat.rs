// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The game master's own window at the table of a folder this app serves
//! (ADR 0117 D4 Q3; *Sentar à mesa* / *Sit at the table*): the window
//! leaves this computer's folder and becomes a client of its own server,
//! as the owner, through the server's door in memory
//! (`verso_server::local::seat`) — so with the network's box ticked, the
//! link's, or both, and no listener widened. From then on it is a window
//! on a server's folder like any other (`remote.rs`): the table, the
//! campaign and the invitation are the server's, answered as on a
//! UniVerso. When serving stops the window is let go and told its session
//! ended; opening this computer's folder again (its key, which a start
//! also brings back) is leaving the table.
//!
//! A folder of this computer the app does not serve has no table, as
//! before (`table.rs`).

use serde_json::json;
use verso_server::local::Seat;
use verso_server::local::seat::Answer;
use verso_service::files::Served;

use super::platform::{blocking, known_path, server};
use super::*;

/// Where the window's links are opened when the server has no address to
/// give yet — the internet link alone, its tunnel not up: a name that is
/// no one's (RFC 2606). `[OPEN]` for the maintainer: ADR 0117 does not
/// say what the window's links are then; S6/S7 may refresh the address.
const NOWHERE: &str = "https://this-computer.invalid";

/// Sit this window at the table of its folder, which this app serves.
pub(super) async fn sit<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<FolderInfo, ContractError> {
    crate::may_switch(&app, &window)?;
    let label = window.label().to_owned();
    let state = app.state::<App>();
    // This window's own folder, of this computer: a window on a server's
    // folder, its own table's included, has none to sit from.
    let key = state
        .service
        .folder_of(&label)
        .filter(|_| remote::of(&app, &label).is_none())
        .ok_or_else(|| refused("open this computer's folder first: its table is the one served"))?;
    let path = known_path(&app, &key).map_err(|e| refused(&e))?;
    let local = server(&app)?;
    let seat = Arc::new(blocking(move || local.sit(&path)).await?);
    let (remote, heard) = dial(Arc::clone(&seat), key).await?;
    remote::hear(&app, &label, &remote, heard);
    let opened = remote
        .call("open_server_folder", json!({ "id": seat.folder() }))
        .await
        .map_err(|e| {
            serde_json::from_value::<ContractError>(e)
                .unwrap_or_else(|_| failed("the server refused"))
        })?;
    let info: FolderInfo = serde_json::from_value(opened).map_err(|e| failed(e.to_string()))?;
    // This computer's folder closes when no other window shows it.
    state.service.release(&label);
    lock(&state.remotes).insert(label, remote);
    let _ = window.set_title(&format!("{} — Verso", info.name));
    log::write(
        "INFO",
        "host",
        "a window sat at the table of a folder this app serves",
    );
    crate::session::remember(&app);
    Ok(info)
}

/// The window's connection through the seat's door, in memory, its
/// contract checked as any server's is.
pub(crate) async fn dial(
    seat: Arc<Seat>,
    key: String,
) -> Result<
    (
        Arc<remote::Remote>,
        tokio::sync::mpsc::UnboundedReceiver<remote::Heard>,
    ),
    ContractError,
> {
    let request = remote::ws_request("http://127.0.0.1", seat.token())?;
    let stream = seat.connect().map_err(|e| refused(&e))?;
    let (socket, _) = tokio_tungstenite::client_async(request, stream)
        .await
        .map_err(|e| failed(e.to_string()))?;
    let url = seat.origin().unwrap_or(NOWHERE).to_owned();
    let token = seat.token().to_owned();
    let folder = seat.folder().to_owned();
    let (remote, heard, hello) =
        remote::attach(socket, &url, &token, folder, Some((seat, key))).await?;
    if let Some(refused) = crate::compat::contract_refused(&hello) {
        return Err(refused);
    }
    Ok((remote, heard))
}

/// A file the server answered in process, as the window is served it: the
/// headers a server's file carries, never kept.
pub(crate) fn served(a: Answer) -> Served {
    let mut headers = Vec::new();
    for name in [
        "Content-Type",
        "Content-Security-Policy",
        "X-Content-Type-Options",
    ] {
        if let Some((_, v)) = a.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)) {
            headers.push((name, v.clone()));
        }
    }
    headers.push(("Cache-Control", "no-store".to_owned()));
    Served {
        status: a.status,
        headers,
        body: a.body,
    }
}
