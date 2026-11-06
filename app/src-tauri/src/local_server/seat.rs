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
    let (remote, heard) = dial(Arc::clone(&seat), key.clone()).await?;
    remote::hear(&app, &label, &remote, heard);
    let opened = remote
        .call("open_server_folder", json!({ "id": seat.folder() }))
        .await
        .map_err(|e| {
            serde_json::from_value::<ContractError>(e)
                .unwrap_or_else(|_| failed("the server refused"))
        })?;
    let info: FolderInfo = serde_json::from_value(opened).map_err(|e| failed(e.to_string()))?;
    // This computer's folder closes when no other window shows it — unless
    // it syncs with a UniVerso: then the seat holds it open, so that its
    // sync goes on while the window is at the table (decided 2026-11-06,
    // "Não deve parar"). What the players and the window write through
    // this computer's server lands in the same files, and the folder's
    // watcher hands it to the sync as any change made here.
    let config = state.service.config().map(Path::to_path_buf);
    if crate::sync::synced(config.as_deref(), &key).is_some() {
        state.service.join(&held(&label), &key);
    }
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

/// The name the seat of window `label` holds this computer's folder by,
/// in the service, while the folder syncs: a client that is no window.
fn held(label: &str) -> String {
    format!("seat:{label}")
}

/// Window `label` shows a folder again (this computer's, a server's, a
/// file alone) or is gone: what its seat held is let go — after the
/// window took its new folder, so that a folder it comes back to stays
/// open, and its sync running, in between. Serving stopping does not let
/// it go: the window is about to come back to it.
pub(crate) fn stand<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    app.state::<App>().service.release(&held(label));
}

/// The windows seated at the table served from this computer's folder `key`.
fn seated_labels(state: &App, key: &str) -> Vec<String> {
    lock(&state.remotes)
        .iter()
        .filter(|(_, r)| r.seat.as_ref().is_some_and(|(_, k)| k == key))
        .map(|(label, _)| label.clone())
        .collect()
}

/// Whether a window sits at the table served from this computer's folder
/// `key`.
pub(crate) fn seated_at(state: &App, key: &str) -> bool {
    !seated_labels(state, key).is_empty()
}

/// The folder `key`'s sync was turned on or off, or its task ended: each
/// window seated at the table served from that folder holds it while it
/// syncs and lets it go once it does not (2026-11-06: the hold follows the
/// sync from any window, not only as it was when the window sat). A
/// folder no window shows here any more is opened again for the hold.
pub(crate) async fn follow<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &str) {
    let state = app.state::<App>();
    let seated = seated_labels(&state, key);
    let config = state.service.config().map(Path::to_path_buf);
    let syncs = crate::sync::synced(config.as_deref(), key).is_some();
    for label in seated {
        let holder = held(&label);
        if !syncs {
            state.service.release(&holder);
            continue;
        }
        if state.service.join(&holder, key) {
            continue;
        }
        let (service, again, who) = (Arc::clone(&state.service), key.to_owned(), holder.clone());
        let opened = tauri::async_runtime::spawn_blocking(move || {
            service.open(&who, move |c| Workspace::reopen(&again, c))
        })
        .await;
        match opened {
            Ok(Ok(opened)) => {
                let (_, catch_up) = state.service.attach(&holder, opened);
                if let Some(catch_up) = catch_up {
                    let service = Arc::clone(&state.service);
                    tauri::async_runtime::spawn_blocking(move || service.catch_up(&catch_up));
                }
            }
            Ok(Err(e)) => log::write(
                "ERROR",
                "host",
                &format!(
                    "the seat could not hold its folder for its sync: {}",
                    e.message
                ),
            ),
            Err(e) => log::write(
                "ERROR",
                "host",
                &format!("the seat could not hold its folder for its sync: {e}"),
            ),
        }
    }
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
