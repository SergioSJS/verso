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

/// The folder's data files of a kind, `.verso/layouts/` or
/// `.verso/bundles/` (ADR 0099 item 2, ADR 0098 item 2), by id. Nothing is
/// created.
#[tauri::command]
#[specta::specta]
pub(crate) fn list_folder_data<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    kind: FolderDataKind,
) -> Result<FolderDataList, ContractError> {
    with(&state, &window, |ws| ops::list_folder_data(ws, kind))
}

/// One data file's text as it is on disk, with its revision.
#[tauri::command]
#[specta::specta]
pub(crate) fn read_folder_data<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    kind: FolderDataKind,
    id: String,
) -> Result<FolderDataFile, ContractError> {
    with(&state, &window, |ws| ops::read_folder_data(ws, kind, id))
}

/// Write a data file: one JSON object, a layout of at most 256 KiB or a bundle of at most 4 MiB. With no
/// `revision` a new file (`exists` when one stands there), else over the
/// version that revision describes (`changed` otherwise).
#[tauri::command]
#[specta::specta]
pub(crate) fn write_folder_data<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    kind: FolderDataKind,
    id: String,
    text: String,
    revision: Option<String>,
) -> Result<FolderDataWritten, ContractError> {
    with(&state, &window, |ws| {
        ops::write_folder_data(ws, kind, id, text, revision)
    })
}

/// Remove a data file through the bin, when it is still the version
/// `revision` describes.
#[tauri::command]
#[specta::specta]
pub(crate) fn remove_folder_data<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    kind: FolderDataKind,
    id: String,
    revision: String,
) -> Result<Trashed, ContractError> {
    with(&state, &window, |ws| {
        let gone = ws.remove_folder_data(ops::data_kind(kind), &id, &revision)?;
        crate::trash::record(ws, &gone, None);
        Ok(verso_service::convert::trashed_out(gone))
    })
}
