//! "This app is a server" from the desktop app's side (ADR 0096): the
//! Settings section, the pairing dialog and the status mark call these
//! commands; the serving itself is `verso_server::local`, the same service
//! and code `verso serve` runs, started in this process.
//!
//! Off at every start unless "keep on at start" was ticked (item 1). The
//! host's own commands are desktop-only: a phone's allowlist refuses the
//! `local_server_` prefix whole (`verso_server::local::allow`).
//!
//! macOS, Linux and Windows serve (ADR 0096 item 17, revised 2026-10-15:
//! `verso-server` builds on Windows with OpenSSL compiled in, as elsewhere).

use verso_contract::{
    LocalAsked, LocalAudit, LocalFolder, LocalPairState, LocalPairing, LocalPhone,
    LocalServerStatus,
};

use super::*;

/// The mode's server, made on first use.
#[derive(Default)]
pub(crate) struct LocalSlot {
    server: std::sync::OnceLock<verso_server::local::LocalServer>,
}

mod platform;

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_status<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    platform::status(app).await
}

/// The folders this computer has opened, to tick the ones to serve.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_folders<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalFolder>, ContractError> {
    platform::folders(app).await
}

/// Tick or untick a folder (by its key). A folder that also syncs with a
/// UniVerso cannot be ticked in V1 (item 11).
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_tick<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
    ticked: bool,
) -> Result<Vec<LocalFolder>, ContractError> {
    platform::tick(app, key, ticked).await
}

/// Keep on at start, and the host's own certificate (item 5 (d)).
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    keep_on: bool,
    cert_file: Option<String>,
    key_file: Option<String>,
    host_name: Option<String>,
) -> Result<LocalServerStatus, ContractError> {
    platform::settings(app, keep_on, cert_file, key_file, host_name).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_start<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    platform::start(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_stop<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    platform::stop(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_pair_open<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalPairing, ContractError> {
    platform::pair_open(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_pair_close<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), ContractError> {
    platform::pair_close(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_pair_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalPairState, ContractError> {
    platform::pair_state(app).await
}

/// The laptop's answer to "Was it you?": allow (as an editor, or as a
/// reader) or refuse.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_answer<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    allow: bool,
    editor: bool,
) -> Result<(), ContractError> {
    platform::answer(app, allow, editor).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_phones<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalPhone>, ContractError> {
    platform::phones(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_revoke<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    platform::revoke(app, id).await
}

/// Forget every device: every phone's session ends.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_forget<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<u32, ContractError> {
    platform::forget(app).await
}

/// "Replace this computer's identity": serving stops, the key is made
/// anew, every pairing ends.
#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_replace_identity<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    platform::replace_identity(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn local_server_audit<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalAudit>, ContractError> {
    platform::audit(app).await
}

/// At the app's start: serve again when the person asked it to keep on
/// (item 1), after the setup, off the main thread.
pub(crate) fn auto_start<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    platform::auto_start(app);
}

/// Whether it serves, how many folders and how many phones are connected
/// now; none before the server was first used.
#[cfg(any(target_os = "macos", windows))]
pub(crate) fn serving_now<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<(bool, usize, u32)> {
    platform::serving_now(app)
}

/// Stop serving now, from the menu-bar mark's *Stop*.
#[cfg(any(target_os = "macos", windows))]
pub(crate) fn stop_now<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    platform::stop_on_exit(app);
}

/// At the app's end: stop, so the port closes and the goodbye is sent.
pub(crate) fn stop_on_exit<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    platform::stop_on_exit(app);
}
