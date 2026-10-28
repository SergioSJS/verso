// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The table's commands (ADR 0107). The table is a server's: one log per
//! table (a table of the folder, named by its root; none named is the
//! folder's default), kept in the server's database. A window on a server's
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
    table: Option<String>,
) -> Result<TableJoin, ContractError> {
    let _ = (color, styles, table);
    Err(no_table())
}

/// Leave the folder's table.
#[tauri::command]
#[specta::specta]
pub fn table_leave(table: Option<String>) -> Result<(), ContractError> {
    let _ = table;
    Err(no_table())
}

/// Change the colour and the dice looks shown in the roster.
#[tauri::command]
#[specta::specta]
pub fn table_look(
    color: Option<String>,
    styles: Option<DiceStyles>,
    table: Option<String>,
) -> Result<(), ContractError> {
    let _ = (color, styles, table);
    Err(no_table())
}

/// A page of older entries, before the entry numbered `before`.
#[tauri::command]
#[specta::specta]
pub fn table_history(
    before: Option<String>,
    limit: Option<u32>,
    table: Option<String>,
) -> Result<TablePage, ContractError> {
    let _ = (before, limit, table);
    Err(no_table())
}

/// A plain-text message, at most 500 characters.
#[tauri::command]
#[specta::specta]
pub fn table_say(text: String, table: Option<String>) -> Result<TableEntry, ContractError> {
    let _ = (text, table);
    Err(no_table())
}

/// An image (base64) written into the folder's attachments place and
/// shown at the table: not for a reader of the folder.
#[tauri::command]
#[specta::specta]
pub fn table_send_image(
    base64: String,
    table: Option<String>,
) -> Result<TableEntry, ContractError> {
    let _ = (base64, table);
    Err(no_table())
}

/// A file (base64) written beside the note or board the person edits
/// (`into`), in its `sub` subfolder (the window's attachments setting;
/// `assets` when the server does not accept it), with no entry in the chat
/// (ADR 0113 item 5, D); the file's path.
#[tauri::command]
#[specta::specta]
pub fn table_attach(base64: String, into: String, sub: String) -> Result<String, ContractError> {
    let _ = (base64, into, sub);
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
    occurrence: Option<u32>,
    table: Option<String>,
) -> Result<TableEntry, ContractError> {
    let _ = (notation, source, path, secret, styles, occurrence, table);
    Err(no_table())
}

/// Pin or unpin an entry, for everyone at the table.
#[tauri::command]
#[specta::specta]
pub fn table_pin(id: String, pinned: bool, table: Option<String>) -> Result<(), ContractError> {
    let _ = (id, pinned, table);
    Err(no_table())
}

/// Delete a message or an image: its author, or an owner.
#[tauri::command]
#[specta::specta]
pub fn table_delete(id: String, table: Option<String>) -> Result<(), ContractError> {
    let _ = (id, table);
    Err(no_table())
}

/// Clear the table: an owner only; `keep_pinned` (default true) keeps the
/// pinned entries.
#[tauri::command]
#[specta::specta]
pub fn table_clear(keep_pinned: Option<bool>, table: Option<String>) -> Result<(), ContractError> {
    let _ = (keep_pinned, table);
    Err(no_table())
}
