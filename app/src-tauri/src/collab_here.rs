// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Simultaneous editing is a server's (ADR 0073 item 7): a window on this
//! computer's own folder answers the room's commands with a refusal (moved
//! out of `lib.rs`, ADR 0067). A window on a server's folder, or a synced
//! folder's link, sends them on (`remote.rs`, `sync/live.rs`).

use verso_contract::{CollabJoin, ContractError, DiceRoll, OracleAsk, OracleDraw};

use crate::refused;

fn not_here() -> ContractError {
    refused("simultaneous editing is a server's; this app writes its notes itself")
}

/// Join a note for editing with others: on a server only.
#[tauri::command]
#[specta::specta]
pub(crate) fn collab_join(path: String) -> Result<CollabJoin, ContractError> {
    let _ = path;
    Err(not_here())
}

/// An edit made in this window, for the others.
#[tauri::command]
#[specta::specta]
pub(crate) fn collab_update(path: String, update: String) -> Result<(), ContractError> {
    let _ = (path, update);
    Err(not_here())
}

/// Where this window's cursor is, for the others.
#[tauri::command]
#[specta::specta]
pub(crate) fn collab_awareness(path: String, update: String) -> Result<(), ContractError> {
    let _ = (path, update);
    Err(not_here())
}

/// This window leaves the note.
#[tauri::command]
#[specta::specta]
pub(crate) fn collab_leave(path: String) -> Result<(), ContractError> {
    let _ = path;
    Err(not_here())
}

/// Write the shared note now (⌘S): its revision on disk.
#[tauri::command]
#[specta::specta]
pub(crate) fn collab_save(path: String) -> Result<String, ContractError> {
    let _ = path;
    Err(not_here())
}

/// Whether someone is in the note's room now (ADR 0082): a write that is
/// not a keystroke — a base's cell, a PDF's quote, the tree's label —
/// joins the room to be made there. On a server, or a synced folder's
/// link, only.
#[tauri::command]
#[specta::specta]
pub(crate) fn collab_present(path: String) -> Result<bool, ContractError> {
    let _ = path;
    Err(not_here())
}

/// A board's file, as this window's converter makes it of the room's state
/// `at` (a Yjs state vector, base64): the room writes the one made of the
/// state it holds (ADR 0082 item 12). On a server, or a synced folder's
/// link, only.
#[tauri::command]
#[specta::specta]
pub(crate) fn collab_canvas(path: String, at: String, json: String) -> Result<(), ContractError> {
    let _ = (path, at, json);
    Err(not_here())
}

/// A shared note that changed on disk while edits waited: keep the disk's
/// text (`disk`) or write the shared one over it (`mine`).
#[tauri::command]
#[specta::specta]
pub(crate) fn collab_resolve(path: String, keep: String) -> Result<String, ContractError> {
    let _ = (path, keep);
    Err(not_here())
}

/// Dice rolled in the note's room by the server, heard by the others in
/// it (ADR 0088 item 4): on a server, or a synced folder's link, only;
/// here the window rolls itself.
#[tauri::command]
#[specta::specta]
pub(crate) fn collab_roll(
    path: String,
    notation: String,
    source: Option<String>,
    styles: Option<verso_contract::DiceStyles>,
    secret: Option<bool>,
    occurrence: Option<u32>,
) -> Result<DiceRoll, ContractError> {
    let _ = (path, notation, source, styles, secret, occurrence);
    Err(not_here())
}

/// An oracle question, spark or table drawn in the note's room by the
/// server, heard by the others in it (ADR 0102 item 5): on a server, or a
/// synced folder's link, only; here the window draws itself.
#[tauri::command]
#[specta::specta]
pub(crate) fn collab_oracle(path: String, ask: OracleAsk) -> Result<OracleDraw, ContractError> {
    let _ = (path, ask);
    Err(not_here())
}
