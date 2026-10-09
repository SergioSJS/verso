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
