// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's layer of settings (ADR 0070 items 1–2) through the
//! contract: `.verso/settings.json`, read and changed through the core.

use super::*;

/// The folder's layer of settings: whether `.verso/settings.json` exists,
/// what it sets and its revision. Reading never creates it.
#[tauri::command]
#[specta::specta]
pub(crate) fn get_folder_settings<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<FolderLayer, ContractError> {
    with(&state, &window, ops::get_folder_settings)
}

/// Change the folder's settings; with no `revision` the file must not
/// exist yet — the first change, or this machine's copy moving in.
#[tauri::command]
#[specta::specta]
pub(crate) fn set_folder_settings<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    change: FolderSettings,
    revision: Option<String>,
) -> Result<FolderLayer, ContractError> {
    with(&state, &window, |ws| {
        ops::set_folder_settings(ws, change, revision)
    })
}

/// Obsidian's settings for daily and periodic notes (ADR 0093 item 11),
/// read once and never written, for Settings to offer.
#[tauri::command]
#[specta::specta]
pub(crate) fn get_obsidian_periodic<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<ObsidianPeriodic, ContractError> {
    with(&state, &window, ops::get_obsidian_periodic)
}
