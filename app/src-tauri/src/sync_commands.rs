// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The window's commands for its folder's sync (ADR 0079 items 1, 9 and
//! 13), and the sync's tasks started and ended with the folder's windows;
//! the room commands of a synced folder's live notes (ADR 0082).

use serde_json::Value;
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
    let (language, shown, told, all) = (app.clone(), app.clone(), app.clone(), app.clone());
    let secrets = Arc::clone(&state.secrets);
    let config = state.service.config().map(Path::to_path_buf);
    let named = config.clone();
    Arc::new(Ctx {
        service: Arc::clone(&state.service),
        secrets,
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
        // Every window: each says it, whatever folder it shows.
        all: Box::new(move |event, payload| {
            let _ = all.emit(event, payload);
        }),
    })
}

pub(crate) fn running<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    key: &str,
) -> Option<Arc<Syncer>> {
    lock(&app.state::<App>().syncs).get(key).map(Arc::clone)
}

pub(crate) fn start<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    key: &str,
    state: &engine::State,
) -> Arc<Syncer> {
    let s = Syncer::new(key, state);
    lock(&app.state::<App>().syncs).insert(key.to_owned(), Arc::clone(&s));
    let (ctx, app, task) = (context(app), app.clone(), Arc::clone(&s));
    tauri::async_runtime::spawn(async move {
        // A window seated at the table served from this folder holds it
        // first, so that the sync goes on while it sits (ADR 0117 D13 Q3).
        // A hold that cannot open the folder is the sync's error, said in
        // every window of the folder until it is tried again.
        while let Err(why) = crate::local_server::seat::follow(&app, &task.key).await {
            task.hold_failed(&ctx, &why);
            if !task.woken().await {
                break;
            }
        }
        sync::run(ctx, Arc::clone(&task)).await;
        {
            let state = app.state::<App>();
            let mut syncs = lock(&state.syncs);
            if syncs.get(&task.key).is_some_and(|t| Arc::ptr_eq(t, &task)) {
                syncs.remove(&task.key);
            }
        }
        // Turned off, by the person or a revoked share: a seat lets go.
        // Still on (no window shows the folder), a hold that cannot open
        // it has no sync left to say it in: the log does.
        if let Err(why) = crate::local_server::seat::follow(&app, &task.key).await {
            log::write(
                "ERROR",
                "host",
                &format!("the seat could not hold its folder for its sync: {why}"),
            );
        }
    });
    s
}

/// A folder just shown in a window: its sync starts if it syncs.
pub(crate) fn resume<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &str) {
    if let Some(s) = running(app, key) {
        // Waiting for a seat's hold that could not open the folder: shown
        // here, the folder is open again, and it is tried at once.
        if s.holding() {
            s.poke();
        }
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
        // A window seated at the table served from the folder counts, its
        // hold perhaps still opening (ADR 0117 D13 Q3).
        let shown = !state.service.clients_of(key).is_empty()
            || crate::local_server::seat::seated_at(&state, key);
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

/// The folder of this window, which syncs only if it is this computer's:
/// for a window seated at the table served from this computer's folder,
/// that folder (ADR 0117 D13 Q3, 2026-11-06) — its sync is shown and acted
/// on there as in a window on the folder itself.
pub(crate) fn key_of<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
) -> Result<String, ContractError> {
    match remote::of(app, window.label()) {
        Some(r) => r.seat.as_ref().map(|(_, key)| key.clone()).ok_or_else(|| {
            refused("a folder of a server is already there: only a folder of this computer syncs")
        }),
        None => own_key_of(app, window),
    }
}

/// The folder of this computer the window shows itself, never a seat's.
fn own_key_of<R: tauri::Runtime>(
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
    let Ok(key) = key_of(&app, &window) else {
        if remote::of(&app, window.label()).is_some() {
            return Ok(off(""));
        }
        return Err(no_folder());
    };
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    Ok(running(&app, &key)
        .map_or_else(|| sync::off_status(config.as_deref(), &key), |s| s.status()))
}

/// What the person may do with each of `paths` of the window's synced
/// folder, as the server last said (ADR 0113 S8): the answer the window
/// asks of its own folder without the server, so that what it locks and
/// unlocks is what the server will accept, online or off.
#[tauri::command]
#[specta::specta]
pub(crate) fn sync_rights<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    paths: Vec<String>,
) -> Result<verso_contract::SyncRights, ContractError> {
    // A seated window's rights are its table's, which its server says: not
    // the UniVerso's.
    let key = own_key_of(&app, &window)?;
    let s = running(&app, &key).ok_or_else(|| refused("this folder does not sync"))?;
    let config = app.state::<App>().service.config().map(Path::to_path_buf);
    Ok(s.rights_told(config.as_deref(), &paths))
}

/// Sync the window's folder with a folder of a server the app is signed
/// in to: `folder`, one there by id, or a new one named `name` (item 1; a
/// name the server has already becomes `name (2)`, never a merge).
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
            // A name the server has is never merged into: `name (2)`.
            let made = tauri::async_runtime::spawn_blocking(move || {
                remote::make_folder(&url, &token, &name, true)
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
            revoked: None,
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
    let cloud = removed.as_ref().is_some_and(|s| s.cloud.is_some())
        || sync::cloud_of(config.as_deref(), &key);
    match removed {
        Some(s) => s.turn_off(config.as_deref())?,
        None => sync::off(config.as_deref(), &key)?,
    }
    // Turning a cloud folder's sync off disconnects it: the secret leaves
    // the keychain (ADR 0104 item 14); the base stays, for connecting the
    // same cloud again.
    if cloud {
        crate::cloud::forget(&*app.state::<App>().secrets, &key);
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
    syncer(&app, &window)?.retry();
    Ok(())
}

/// A note the window just made from its template, and the text it was
/// made with (ADR 0093 item 12): when the folder syncs and the server
/// holds a note of the same name another device made apart from the same
/// template, the two are joined instead of a conflict's copy. Nothing for
/// a folder that does not sync, nor for a server's folder.
#[tauri::command]
#[specta::specta]
pub(crate) fn note_made_from_template<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
    text: String,
) -> Result<(), ContractError> {
    if path.is_empty()
        || path.starts_with('/')
        || path.contains('\0')
        || path.split('/').any(|p| p == ".." || p.is_empty())
    {
        return Err(refused("not a path of the folder"));
    }
    if let Some(s) = synced_of(&app, window.label()) {
        s.made_from_template(&path, &text);
    }
    Ok(())
}

/* ---------- A synced folder's live notes (ADR 0082) ---------- */

/// The running sync of the folder a window of this computer shows.
pub(crate) fn synced_of<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) -> Option<Arc<Syncer>> {
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

/// The commands a window on a synced folder sends over the sync's link:
/// the rooms', the table's, the campaign's and the access model's (ADR
/// 0113: the Access dialog and the seat are the server's answers too).
pub(crate) fn over_the_link(cmd: &str) -> bool {
    ["collab_", "table_", "campaign_", "access_"]
        .iter()
        .any(|p| cmd.starts_with(p))
}

/// Before the app's own handler, after `remote::forward`: a window on a
/// folder of this computer that syncs sends its room commands over the
/// sync's link (items 2 and 3); every other is the app's, which answers
/// that simultaneous editing is a server's.
pub(crate) fn live_forward<R: tauri::Runtime>(
    invoke: tauri::ipc::Invoke<R>,
) -> Option<tauri::ipc::Invoke<R>> {
    let cmd = invoke.message.command().to_owned();
    if !over_the_link(&cmd) {
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
