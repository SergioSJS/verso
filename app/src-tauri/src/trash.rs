// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The bin of a folder of this computer (ADR 0080): its page's commands,
//! each deletion recorded in the folder's index (item 2), and the sweep —
//! when the folder opens and, while it stays open, once a day: an hourly
//! look at each open folder's last sweep, which costs a row read (item 3).
//! A window on a server's folder sends these commands to the server
//! (`remote.rs`).

use super::*;
use verso_contract::{Restored, TrashListing};
use verso_service::trash::{self, Policy};

/// How often the open folders are looked at for a sweep due.
const LOOK_EVERY: std::time::Duration = std::time::Duration::from_secs(60 * 60);

/// What the person may choose for how long deleted files are kept: none
/// past the bounds the window offers (a day to ten years), 0 for ever.
fn valid_days(days: u32) -> bool {
    days == 0 || (1..=3650).contains(&days)
}

/// The folder's bin, newest first.
#[tauri::command]
#[specta::specta]
pub(crate) fn trash_list<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<TrashListing, ContractError> {
    with(&state, &window, |ws| {
        let policy = Policy::local(ws);
        trash::list(ws, None, policy)
    })
}

/// Put an entry of the bin back where it was, or beside it under a name
/// that says so when that place is taken (`today` the person's date,
/// `lang` their language).
#[tauri::command]
#[specta::specta]
pub(crate) fn trash_restore<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
    today: String,
    lang: String,
) -> Result<Restored, ContractError> {
    let done = with(&state, &window, |ws| {
        trash::restore(ws, None, &path, &today, &lang)
    })?;
    log::write(
        "INFO",
        "trash",
        &format!("restored {path} to {}", done.0.path),
    );
    Ok(done.0)
}

/// Remove entries of the bin for good.
#[tauri::command]
#[specta::specta]
pub(crate) fn trash_delete<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    paths: Vec<String>,
) -> Result<TrashListing, ContractError> {
    with(&state, &window, |ws| {
        for gone in trash::delete(ws, None, &paths)? {
            log::write(
                "INFO",
                "trash",
                &format!("deleted for good: {}", gone.record.path),
            );
        }
        let policy = Policy::local(ws);
        trash::list(ws, None, policy)
    })
}

/// Empty the bin.
#[tauri::command]
#[specta::specta]
pub(crate) fn trash_empty<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<TrashListing, ContractError> {
    with(&state, &window, |ws| {
        let gone = trash::empty(ws, None)?;
        log::write(
            "INFO",
            "trash",
            &format!("emptied: {} entries deleted for good", gone.len()),
        );
        let policy = Policy::local(ws);
        trash::list(ws, None, policy)
    })
}

/// How long this folder keeps deleted files: days, 0 for ever — the
/// person's setting of the local folder, kept beside its index (item 3).
/// What is past the new time goes at once.
#[tauri::command]
#[specta::specta]
pub(crate) fn trash_set_days<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    days: u32,
) -> Result<TrashListing, ContractError> {
    if !valid_days(days) {
        return Err(refused("days: 0 (for ever) or 1 to 3650"));
    }
    with(&state, &window, |ws| {
        ws.set_trash_days(days)?;
        swept(ws, verso_core::trash::now());
        let policy = Policy::local(ws);
        trash::list(ws, None, policy)
    })
}

/// Record what a deletion just put in the bin: this computer's (`by`
/// none), or sync's carrying out another device's (`sync:<server>`).
pub(crate) fn record(ws: &mut Workspace, gone: &verso_core::Trashed, by: Option<&str>) {
    if let Err(e) = trash::deleted(ws, None, gone, by) {
        log::write(
            "WARN",
            "trash",
            &format!(
                "the bin's record of {} was not kept: {}",
                gone.path,
                e.into_contract().message
            ),
        );
    }
}

/// Sweep the folder's bin now, each removal a line of the log.
fn swept(ws: &mut Workspace, now: i64) {
    match ws.sweep_trash(now) {
        Ok(s) => {
            for (item, why) in &s.removed {
                log::write(
                    "INFO",
                    "trash",
                    &format!("expired ({why:?}): {}", item.record.path),
                );
            }
            for (path, e) in &s.failed {
                log::write("WARN", "trash", &format!("not removed: {path}: {e}"));
            }
        }
        Err(e) => log::write("WARN", "trash", &format!("the sweep failed: {e}")),
    }
}

/// Sweep folder `key` now: as it opens.
pub(crate) fn sweep_now(service: &Service, key: &str) {
    let _ = service.with_key(key, |ws| {
        swept(ws, verso_core::trash::now());
        Ok(())
    });
}

/// Sweep folder `key` when it has not been swept for a day (or ever).
pub(crate) fn sweep_if_due(service: &Service, key: &str) {
    let _ = service.with_key(key, |ws| {
        let now = verso_core::trash::now();
        if ws
            .trash_swept()
            .is_none_or(|at| now - at >= verso_core::trash::DAY)
        {
            swept(ws, now);
        }
        Ok(())
    });
}

/// Once an hour, each open folder of this computer whose sweep is due.
pub(crate) fn start_daily<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let service = Arc::clone(&app.state::<App>().service);
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(LOOK_EVERY).await;
            let service = Arc::clone(&service);
            let _ = tauri::async_runtime::spawn_blocking(move || {
                let mut keys: Vec<String> = service.clients().into_iter().map(|(_, k)| k).collect();
                keys.sort();
                keys.dedup();
                for key in keys {
                    sweep_if_due(&service, &key);
                }
            })
            .await;
        }
    });
}
