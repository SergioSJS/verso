//! Focuses (ADR 0062) through the contract.

use super::*;

/// Read focuses from `.space/waypoints.json` in the open folder (ADR 0062).
#[tauri::command]
#[specta::specta]
pub(crate) fn get_focuses<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<FocusesSummary, ContractError> {
    with(&state, &window, ops::get_focuses)
}

/// Bring `.space/waypoints.json` down from the cloud because the person
/// clicked "Download now" (ADR 0043, amended on 2026-10-27): true when it was
/// fetched, false when there was nothing to fetch. No path crosses the
/// contract (a hidden entry never does, ADR 0026); the file is named here.
/// Off the main thread and outside the folder's lock, like `fetch_file`.
#[tauri::command]
#[specta::specta]
pub(crate) async fn fetch_focuses_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<bool, ContractError> {
    let state = app.state::<App>();
    let Some(placeholder) = with(&state, &window, |ws| Ok(ws.waypoints_placeholder()?))? else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || placeholder.fetch())
        .await
        .map_err(|e| failed(format!("fetching the focuses file: {e}")))?
        .map_err(|e| failed(format!("fetching the focuses file from the cloud: {e}")))?;
    Ok(true)
}

/// Write focuses to `.space/waypoints.json` in the open folder (ADR 0062).
#[tauri::command]
#[specta::specta]
pub(crate) fn set_focuses<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    focuses: Vec<Focus>,
    stamp: Option<String>,
    base_focuses: Option<Vec<Focus>>,
) -> Result<FocusesSummary, ContractError> {
    with(&state, &window, |ws| {
        ops::set_focuses(ws, focuses, stamp, base_focuses)
    })
}

/// Whether focuses can be synced to `.space/waypoints.json` (ADR 0062).
#[tauri::command]
#[specta::specta]
pub(crate) fn can_sync_focuses<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<bool, ContractError> {
    with(&state, &window, ops::can_sync_focuses)
}

/// Set whether focuses sync to `.space/waypoints.json` is enabled (ADR 0062 D5, D9).
#[tauri::command]
#[specta::specta]
pub(crate) fn set_sync_focuses<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    enabled: bool,
) -> Result<(), ContractError> {
    with(&state, &window, |ws| ops::set_sync_focuses(ws, enabled))
}
