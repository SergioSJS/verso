// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The window's commands for its folder's sync (ADR 0079 items 1, 9 and
//! 13), and the sync's tasks started and ended with the folder's windows;
//! the room commands of a synced folder's live notes (ADR 0082).

use serde_json::{Value, json};
use verso_contract::SyncStatus;
use verso_core::sync as engine;

use super::sync::{Ctx, Syncer};
use super::*;

fn off(key: &str) -> SyncStatus {
    SyncStatus {
        key: key.to_owned(),
        state: "off".to_owned(),
        ..SyncStatus::default()
    }
}

fn context<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Arc<Ctx> {
    let state = app.state::<App>();
    let (language, shown, told) = (app.clone(), app.clone(), app.clone());
    let config = state.service.config().map(Path::to_path_buf);
    let named = config.clone();
    Arc::new(Ctx {
        service: Arc::clone(&state.service),
        config,
        device: Box::new(move || device::name(named.as_deref())),
        pt: Box::new(move || lock(&language.state::<App>().menu_language).as_str() != "en"),
        // Once, to every window: each shows its own folder's.
        shown: Box::new(move |_, status| {
            let _ = shown.emit("sync-status", status);
        }),
        // To each window that holds the note: a window listens to its own.
        told: Arc::new(move |windows, event, payload| {
            for label in windows {
                let _ = told.emit_to(label.as_str(), event, payload);
            }
        }),
    })
}

fn running<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &str) -> Option<Arc<Syncer>> {
    lock(&app.state::<App>().syncs).get(key).map(Arc::clone)
}

fn start<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    key: &str,
    state: &engine::State,
) -> Arc<Syncer> {
    let s = Syncer::new(key, state);
    lock(&app.state::<App>().syncs).insert(key.to_owned(), Arc::clone(&s));
    let (ctx, app, task) = (context(app), app.clone(), Arc::clone(&s));
    tauri::async_runtime::spawn(async move {
        sync::run(ctx, Arc::clone(&task)).await;
        let state = app.state::<App>();
        let mut syncs = lock(&state.syncs);
        if syncs.get(&task.key).is_some_and(|t| Arc::ptr_eq(t, &task)) {
            syncs.remove(&task.key);
        }
    });
    s
}

/// A folder just shown in a window: its sync starts if it syncs.
pub(crate) fn resume<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &str) {
    if running(app, key).is_some() {
        return;
    }
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    if let Some(state) = sync::synced(config.as_deref(), key) {
        start(app, key, &state);
    }
}

/// Windows closed or moved to another folder: the syncs of folders no
/// window shows end, and start again when one does.
pub(crate) fn settle<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let state = app.state::<App>();
    let mut syncs = lock(&state.syncs);
    syncs.retain(|key, s| {
        let shown = !state.service.clients_of(key).is_empty();
        if !shown {
            s.stop();
        }
        shown
    });
}

/// The watcher's batch on a folder: its sync reads those files again.
pub(crate) fn touched<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    key: &str,
    paths: impl IntoIterator<Item = String>,
) {
    if let Some(s) = running(app, key) {
        s.touched(paths);
    }
}

/// The folder of this window, which syncs only if it is this computer's.
fn key_of<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
) -> Result<String, ContractError> {
    if remote::of(app, window.label()).is_some() {
        return Err(refused(
            "a folder of a server is already there: only a folder of this computer syncs",
        ));
    }
    app.state::<App>()
        .service
        .folder_of(window.label())
        .ok_or_else(no_folder)
}

fn syncer<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
) -> Result<Arc<Syncer>, ContractError> {
    let key = key_of(app, window)?;
    running(app, &key).ok_or_else(|| refused("this folder does not sync"))
}

/// The window's folder's sync: off, or its state.
#[tauri::command]
#[specta::specta]
pub(crate) fn folder_sync<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<SyncStatus, ContractError> {
    if remote::of(&app, window.label()).is_some() {
        return Ok(off(""));
    }
    let key = key_of(&app, &window)?;
    Ok(running(&app, &key).map_or_else(|| off(&key), |s| s.status()))
}

/// Sync the window's folder with a folder of a server the app is signed
/// in to: `folder`, one there by id, or a new one named `name` (item 1).
/// The first sync deletes nothing (item 11).
#[tauri::command]
#[specta::specta]
pub(crate) async fn folder_sync_start<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    url: String,
    folder: Option<String>,
    name: Option<String>,
) -> Result<SyncStatus, ContractError> {
    let key = key_of(&app, &window)?;
    if running(&app, &key).is_some() {
        return Err(refused("this folder syncs already: turn it off first"));
    }
    let login = remote::login_for(&app.state::<App>(), &url)?;
    let id = match (folder, name) {
        (Some(id), _) => id,
        (None, Some(name)) => {
            let (url, token) = (login.url.clone(), login.token.clone());
            let made = tauri::async_runtime::spawn_blocking(move || {
                remote::answer(
                    remote::http()?
                        .post(format!("{url}/api/folders"))
                        .bearer_auth(token)
                        .json(&json!({ "name": name }))
                        .send()
                        .map_err(|e| failed(e.to_string()))?,
                )
            })
            .await
            .map_err(|e| failed(e.to_string()))??;
            made["id"]
                .as_str()
                .ok_or_else(|| failed("the server made no folder"))?
                .to_owned()
        }
        (None, None) => return Err(refused("name a folder of the server, or a new one")),
    };
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    // The same folder of the same server as before it was turned off: it
    // goes on from its base; anything else is a first sync (item 11).
    let state = match engine::load(config.as_deref(), &key).ok().flatten() {
        Some(kept) if kept.server == login.url && kept.folder == id => engine::State {
            off: false,
            paused: false,
            ..kept
        },
        _ => engine::State {
            server: login.url,
            folder: id,
            ..engine::State::default()
        },
    };
    engine::save(config.as_deref(), &key, &state).map_err(verso_service::convert)?;
    log::write(
        "INFO",
        "sync",
        &format!(
            "turned on: folder {key} with {} {}",
            state.server, state.folder
        ),
    );
    Ok(start(&app, &key, &state).status())
}

/// Turn the window's folder's sync off: both sides stay as they are.
#[tauri::command]
#[specta::specta]
pub(crate) fn folder_sync_stop<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<SyncStatus, ContractError> {
    let key = key_of(&app, &window)?;
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    let removed = lock(&app.state::<App>().syncs).remove(&key);
    match removed {
        Some(s) => s.turn_off(config.as_deref())?,
        None => sync::off(config.as_deref(), &key)?,
    }
    log::write("INFO", "sync", &format!("turned off: folder {key}"));
    // Every window of the folder hears it: a live note goes local (ADR
    // 0082 item 10).
    let _ = app.emit("sync-status", off(&key));
    Ok(off(&key))
}

/// Pause the sync, or resume it.
#[tauri::command]
#[specta::specta]
pub(crate) fn folder_sync_pause<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    paused: bool,
) -> Result<(), ContractError> {
    syncer(&app, &window)?.pause(paused);
    Ok(())
}

/// The deletions a pass paused for go ahead (item 9).
#[tauri::command]
#[specta::specta]
pub(crate) fn folder_sync_confirm<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<(), ContractError> {
    syncer(&app, &window)?.confirm();
    Ok(())
}

/// Compare now, without waiting for a change or the scan.
#[tauri::command]
#[specta::specta]
pub(crate) fn folder_sync_now<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<(), ContractError> {
    syncer(&app, &window)?.poke();
    Ok(())
}

/* ---------- A synced folder's live notes (ADR 0082) ---------- */

/// The running sync of the folder a window of this computer shows.
fn synced_of<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) -> Option<Arc<Syncer>> {
    if remote::of(app, label).is_some() {
        return None;
    }
    let key = app.state::<App>().service.folder_of(label)?;
    running(app, &key)
}

/// How far the server is when the window's folder may have live notes —
/// it syncs, its link is up, it is not paused (item 3) — or `None`.
pub(crate) fn live_latency<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) -> Option<u32> {
    synced_of(app, label).and_then(|s| sync::live::up(&s))
}

/// A tab wrote a note of its folder itself (`write_note`): out of its
/// room, that is its own text (items 6 and 8).
pub(crate) fn wrote<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    path: &str,
    text: &str,
) {
    if let Some(s) = synced_of(app, label) {
        sync::live::wrote(&s, label, path, text.as_bytes());
    }
}

/// Before the app's own handler, after `remote::forward`: a window on a
/// folder of this computer that syncs sends its room commands over the
/// sync's link (items 2 and 3); every other is the app's, which answers
/// that simultaneous editing is a server's.
pub(crate) fn live_forward<R: tauri::Runtime>(
    invoke: tauri::ipc::Invoke<R>,
) -> Option<tauri::ipc::Invoke<R>> {
    let cmd = invoke.message.command().to_owned();
    if !cmd.starts_with("collab_") {
        return Some(invoke);
    }
    let webview = invoke.message.webview();
    let label = webview.label().to_owned();
    if !is_app_view(&label) {
        return Some(invoke);
    }
    let app = webview.app_handle().clone();
    let Some(s) = synced_of(&app, &label) else {
        return Some(invoke);
    };
    let args = match invoke.message.payload() {
        tauri::ipc::InvokeBody::Json(v) => v.clone(),
        tauri::ipc::InvokeBody::Raw(_) => Value::Null,
    };
    let resolver = invoke.resolver;
    tauri::async_runtime::spawn(async move {
        let ctx = context(&app);
        match sync::live::command(&ctx, &s, &label, &cmd, args).await {
            Ok(v) => resolver.resolve(v),
            Err(e) => resolver.reject(e),
        }
    });
    None
}
