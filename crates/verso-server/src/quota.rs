// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Quotas per folder (ADR 0077 item 5): a write that would take a folder
//! past its quota is refused before the core writes, and nothing is
//! touched; a write that does not grow the folder always goes, so a full
//! folder can be made smaller. At 90 % the windows on the folder are told.

use serde_json::{Value, json};
use verso_contract::ContractError;
use verso_service::lock;

use crate::state::Server;

/// The folder's id behind a folder key, as the server opened it.
fn folder_of_key(server: &Server, key: &str) -> Option<String> {
    lock(&server.keys).get(key).cloned()
}

/// Refuse `len` bytes at `path` in the folder of `key` when they would pass
/// its quota.
pub fn check(server: &Server, key: &str, path: &str, len: u64) -> Result<(), ContractError> {
    let Some(folder) = folder_of_key(server, key) else {
        return Ok(());
    };
    let quota = server.db.quota(&folder).map_err(verso_service::failed)?;
    let Some(quota) = quota.and_then(|q| u64::try_from(q).ok()) else {
        return Ok(());
    };
    let path = path.to_owned();
    let (used, delta) = server
        .service
        .with_key(key, move |ws| Ok(verso_service::growth(ws, &path, len)))?;
    if delta <= 0 {
        return Ok(());
    }
    let after = used.saturating_add(u64::try_from(delta).unwrap_or(u64::MAX));
    if after > quota {
        return Err(verso_service::over_quota(used, quota));
    }
    Ok(())
}

/// The bytes a folder command would write at its path, when it is one
/// that writes a file's content: none for the others.
#[must_use]
pub fn written(name: &str, args: &Value) -> Option<(String, u64)> {
    let text = |field: &str| args.get(field).and_then(Value::as_str);
    let len = |s: &str| u64::try_from(s.len()).unwrap_or(u64::MAX);
    match name {
        "write_note" | "write_text" => Some((text("path")?.to_owned(), len(text("text")?))),
        "write_board" => Some((text("path")?.to_owned(), len(text("json")?))),
        "create_note" => Some((text("name")?.to_owned(), len(text("text")?))),
        // Base64 takes four characters for three bytes.
        "create_file" => Some((text("path")?.to_owned(), len(text("base64")?) / 4 * 3)),
        _ => None,
    }
}

/// After a write: the folder's windows are told when it is at 90 % of its
/// quota or more.
pub fn warn(server: &Server, folder: &str, used: u64) {
    let Ok(Some(quota)) = server.db.quota(folder) else {
        return;
    };
    let Ok(quota) = u64::try_from(quota) else {
        return;
    };
    // 90 % or more, in whole numbers.
    let near = quota > 0 && u128::from(used) * 10 >= u128::from(quota) * 9;
    if near {
        server.push_folder(
            folder,
            &json!({ "event": "folder-quota", "payload": { "used": used, "quota": quota } }),
        );
    }
}

/// A new folder gets the server's default quota (`VERSO_FOLDER_QUOTA`),
/// when one is set.
pub fn set_default(server: &Server, folder: &str) -> Result<(), String> {
    match server.config.folder_quota {
        Some(q) => server.db.set_quota(folder, Some(q)),
        None => Ok(()),
    }
}
