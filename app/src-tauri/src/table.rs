// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The table's commands (ADR 0107). The table is a server's: one log of
//! the folder, kept in the server's database. A window on a server's
//! folder sends these to it (`remote.rs`); a folder of this computer alone
//! has no table, and the window shows the rolls of this run itself.

use super::*;
use verso_contract::{DiceStyles, TableEntry, TableJoin, TablePage};

fn no_table() -> ContractError {
    refused("the table is a server's; a folder of this computer alone has none")
}

/// Join the folder's table.
#[tauri::command]
#[specta::specta]
pub fn table_join(
    color: Option<String>,
    styles: Option<DiceStyles>,
) -> Result<TableJoin, ContractError> {
    let _ = (color, styles);
    Err(no_table())
}

/// Leave the folder's table.
#[tauri::command]
#[specta::specta]
pub fn table_leave() -> Result<(), ContractError> {
    Err(no_table())
}

/// Change the colour and the dice looks shown in the roster.
#[tauri::command]
#[specta::specta]
pub fn table_look(color: Option<String>, styles: Option<DiceStyles>) -> Result<(), ContractError> {
    let _ = (color, styles);
    Err(no_table())
}

/// A page of older entries, before the entry numbered `before`.
#[tauri::command]
#[specta::specta]
pub fn table_history(
    before: Option<String>,
    limit: Option<u32>,
) -> Result<TablePage, ContractError> {
    let _ = (before, limit);
    Err(no_table())
}

/// A plain-text message, at most 500 characters.
#[tauri::command]
#[specta::specta]
pub fn table_say(text: String) -> Result<TableEntry, ContractError> {
    let _ = text;
    Err(no_table())
}

/// An image (base64) written into the folder's attachments place and
/// shown at the table: not for a reader of the folder.
#[tauri::command]
#[specta::specta]
pub fn table_send_image(base64: String) -> Result<TableEntry, ContractError> {
    let _ = base64;
    Err(no_table())
}

/// Dice rolled by the server at the table, from no note's room.
#[tauri::command]
#[specta::specta]
pub fn table_roll(
    notation: String,
    source: Option<String>,
    path: Option<String>,
    secret: Option<bool>,
    styles: Option<DiceStyles>,
) -> Result<TableEntry, ContractError> {
    let _ = (notation, source, path, secret, styles);
    Err(no_table())
}

/// Pin or unpin an entry, for everyone at the table.
#[tauri::command]
#[specta::specta]
pub fn table_pin(id: String, pinned: bool) -> Result<(), ContractError> {
    let _ = (id, pinned);
    Err(no_table())
}

/// Delete a message or an image: its author, or an owner.
#[tauri::command]
#[specta::specta]
pub fn table_delete(id: String) -> Result<(), ContractError> {
    let _ = id;
    Err(no_table())
}

/// Clear the table: an owner only; `keep_pinned` (default true) keeps the
/// pinned entries.
#[tauri::command]
#[specta::specta]
pub fn table_clear(keep_pinned: Option<bool>) -> Result<(), ContractError> {
    let _ = keep_pinned;
    Err(no_table())
}
