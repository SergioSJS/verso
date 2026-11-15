// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder of a UniVerso picked in the app, on every app (the maintainer,
//! 2026-11-15, after a folder opened from the server on his phone would not
//! open again in airplane mode): the whole folder is downloaded into a new
//! folder of this device, bound to the server's by the sync of ADR 0079,
//! and that copy is what opens — offline too; the sync goes on when the
//! network is back. Where the copy goes is asked as it is made
//! ([`CopyPlace`]): the window names a place, the host knows its path (ADR
//! 0026 rule 4). Once a copy is here, picking that folder again opens it
//! with nothing asked. The window on the server alone (`server_open`,
//! online only) stays the other way.
//!
//! The first sync into the empty folder only downloads (ADR 0079 item 11:
//! no deletion, no conflict), and the server sends a reader only what it
//! may read (ADR 0113 S8): the copy holds what the server gives, nothing
//! else.

use serde_json::{Value, json};
use verso_contract::{CopyPlace, ServerCopyPlan};
use verso_core::servers::ServerLogin;
use verso_core::sync as engine;

use super::*;

/// Where this device keeps a copy, the first offered first.
#[cfg(target_os = "android")]
pub(crate) const PLACES: &[CopyPlace] = &[CopyPlace::InApp, CopyPlace::Phone];
#[cfg(target_os = "ios")]
pub(crate) const PLACES: &[CopyPlace] = &[CopyPlace::Documents];
#[cfg(desktop)]
pub(crate) const PLACES: &[CopyPlace] = &[CopyPlace::Choose];

/// The same server, however its address was written.
fn same_server(a: &str, b: &str) -> bool {
    a.trim_end_matches('/') == b.trim_end_matches('/')
}

/// The folder of this device that syncs with `folder` of the server at
/// `url` and is still there: a copy made here, or the person's own folder
/// synced with it (ADR 0079 item 1) — the freshest, when there are two. A
/// sync turned off is not one: what it shows may be behind the server.
pub(crate) fn copy_of(config: Option<&Path>, url: &str, folder: &str) -> Option<PathBuf> {
    verso_core::recent_folders(config).into_iter().find(|path| {
        let key = verso_core::folder_key(path);
        sync::synced(config, &key)
            .is_some_and(|s| s.cloud.is_none() && same_server(&s.server, url) && s.folder == folder)
            && verso_core::session::folder_for_key(&key, config).is_some()
    })
}

/// A new folder for the copy under `parent`, named as the server's: never
/// one that stands there already — it may be another vault of the same
/// name, and a first sync into it would send its notes up — but `name (2)`,
/// `name (3)`… A name no folder may have is made one that can.
pub(crate) fn new_folder(parent: &Path, name: &str) -> Result<PathBuf, ContractError> {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned
        .trim()
        .trim_start_matches('.')
        .trim_end_matches('.')
        .trim();
    let base = if cleaned.is_empty() { "Verso" } else { cleaned };
    for n in 1..=99 {
        let wanted = if n == 1 {
            base.to_owned()
        } else {
            format!("{base} ({n})")
        };
        match verso_fs::server::make_folder(parent, &wanted) {
            Ok(made) => return Ok(made),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
                return Err(refused(
                    "Verso may not make a folder there: choose another place",
                ));
            }
            Err(e) => return Err(failed(e.to_string())),
        }
    }
    Err(refused(
        "every name of that kind is taken there: choose another place",
    ))
}

/// The folder `key` bound to `folder` of the server at `url`, saved: its
/// first sync, into a folder that is empty, downloads everything (ADR 0079
/// item 11).
pub(crate) fn bind(
    config: Option<&Path>,
    key: &str,
    url: &str,
    folder: &str,
) -> Result<engine::State, ContractError> {
    let state = engine::State {
        server: url.to_owned(),
        folder: folder.to_owned(),
        ..engine::State::default()
    };
    engine::save(config, key, &state).map_err(verso_service::convert)?;
    log::write(
        "INFO",
        "sync",
        &format!("a copy of {url} {folder} made here: folder {key}, turned on"),
    );
    Ok(state)
}

/// The server's folder as this account would receive it: its name, and
/// the files the server's sync lists for it (`sync_state`, a reader's only
/// what it may read) with their sizes added.
pub(crate) async fn plan_of(
    login: &ServerLogin,
    folder: &str,
) -> Result<(String, u32, u64), ContractError> {
    let said = |e: Value| {
        serde_json::from_value::<ContractError>(e).unwrap_or_else(|_| failed("the server refused"))
    };
    let (remote, _heard, hello) = remote::dial_hello(login, folder.to_owned()).await?;
    // A sync the two sides cannot share would leave the copy empty.
    if let Some(why) = crate::compat::sync_refused(&hello) {
        return Err(refused(why));
    }
    let opened = remote
        .call("open_server_folder", json!({ "id": folder }))
        .await
        .map_err(said)?;
    let state = remote.call("sync_state", json!({})).await.map_err(said)?;
    let name = opened["name"].as_str().unwrap_or_default().to_owned();
    let files = state["files"].as_array().map_or(&[][..], Vec::as_slice);
    let bytes = files.iter().filter_map(|f| f["size"].as_u64()).sum();
    Ok((name, u32::try_from(files.len()).unwrap_or(u32::MAX), bytes))
}

/// Open this device's copy of `folder` of the server at `url` in this
/// window, with nothing asked of the server (offline too): `None` when
/// there is none here yet.
#[tauri::command]
#[specta::specta]
pub(crate) async fn server_copy_open<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    url: String,
    folder: String,
) -> Result<Option<FolderInfo>, ContractError> {
    may_switch(&app, &window)?;
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    let Some(path) = copy_of(config.as_deref(), &url, &folder) else {
        return Ok(None);
    };
    install(&app, &window, move |config| Workspace::open(&path, config))
        .await
        .map(Some)
}

/// What a copy of `folder` of the server at `url` would take, and where
/// this device can keep it: asked before the question is put.
#[tauri::command]
#[specta::specta]
pub(crate) async fn server_copy_plan<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
    folder: String,
) -> Result<ServerCopyPlan, ContractError> {
    let login = remote::login_for(&app.state::<App>(), &url)?;
    let (name, files, bytes) = plan_of(&login, &folder).await?;
    Ok(ServerCopyPlan {
        name,
        files,
        // Exact below 2^53 bytes, which no folder reaches.
        bytes: bytes as f64,
        places: PLACES.to_vec(),
    })
}

/// Where `place` is on this device: `None` when the person cancelled the
/// desktop's dialog.
async fn parent_of<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
    place: CopyPlace,
) -> Result<Option<PathBuf>, ContractError> {
    if !PLACES.contains(&place) {
        return Err(refused("this device keeps no copy there"));
    }
    let path = app.path();
    match place {
        CopyPlace::Choose => mobile::pick_folder(app, window).await,
        CopyPlace::InApp => path
            .app_data_dir()
            .map(Some)
            .map_err(|e| failed(e.to_string())),
        CopyPlace::Documents => path
            .document_dir()
            .map(Some)
            .map_err(|e| failed(e.to_string())),
        CopyPlace::Phone => storage::phone_documents().await.map(Some),
    }
}

/// Make the copy of `folder` of the server at `url` in `place`, open it in
/// this window, and bind it to the server's folder: its sync starts at
/// once and downloads everything, the window hearing `sync-status` as it
/// goes. A copy already here is opened instead, never a second one. `None`
/// when the person cancelled the desktop's dialog.
#[tauri::command]
#[specta::specta]
pub(crate) async fn server_copy_make<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    url: String,
    folder: String,
    place: CopyPlace,
) -> Result<Option<FolderInfo>, ContractError> {
    may_switch(&app, &window)?;
    let login = remote::login_for(&app.state::<App>(), &url)?;
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    if let Some(path) = copy_of(config.as_deref(), &login.url, &folder) {
        return install(&app, &window, move |config| Workspace::open(&path, config))
            .await
            .map(Some);
    }
    // The name the server gives it, and that the folder is still reached.
    let (name, _, _) = plan_of(&login, &folder).await?;
    let Some(parent) = parent_of(&app, &window, place).await? else {
        return Ok(None);
    };
    let dir = tauri::async_runtime::spawn_blocking(move || new_folder(&parent, &name))
        .await
        .map_err(|e| failed(e.to_string()))??;
    let info = install(&app, &window, move |config| Workspace::open(&dir, config)).await?;
    let state = bind(config.as_deref(), &info.key, &login.url, &folder)?;
    if running(&app, &info.key).is_none() {
        start(&app, &info.key, &state);
    }
    Ok(Some(info))
}

#[cfg(test)]
mod tests;
