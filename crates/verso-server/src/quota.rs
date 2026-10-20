// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Quotas per folder (ADR 0077 item 5): a write that would take a folder
//! past its quota is refused before the core writes, and nothing is
//! touched; a write that does not grow the folder always goes, so a full
//! folder can be made smaller. At 90 % the windows on the folder are told.
//!
//! A write under way holds the room it declared until it lands or goes
//! ([`reserve`], [`Hold`]): a file a device sends in pieces is judged at
//! its first piece, and two sent at once were each judged against the
//! folder without the other (the review of 2026-10-13), so both could
//! land past the quota.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use verso_contract::{ContractError, FolderQuota};
use verso_service::lock;

use crate::state::Server;

/// The folder's id behind a folder key, as the server opened it.
fn folder_of_key(server: &Server, key: &str) -> Option<String> {
    lock(&server.keys).get(key).cloned()
}

/// The room the writes under way hold, per folder.
#[derive(Default)]
pub struct Reserved {
    by_folder: Arc<Mutex<HashMap<String, u64>>>,
}

/// Room held in a folder by a write under way, given back when it is
/// dropped: when the write landed and the folder's record counts it, or
/// when it went unfinished.
pub struct Hold {
    by_folder: Arc<Mutex<HashMap<String, u64>>>,
    folder: String,
    bytes: u64,
}

impl Drop for Hold {
    fn drop(&mut self) {
        let mut by = lock(&self.by_folder);
        if let Some(held) = by.get_mut(&self.folder) {
            *held = held.saturating_sub(self.bytes);
            if *held == 0 {
                by.remove(&self.folder);
            }
        }
    }
}

/// Refuse `len` bytes at `path` in the folder of `key` when they would pass
/// its quota, the room other writes under way hold counted.
pub fn check(server: &Server, key: &str, path: &str, len: u64) -> Result<(), ContractError> {
    let by = lock(&server.reserved.by_folder);
    judged(server, &by, key, path, len, 0).map(|_| ())
}

/// [`check`] for the write that holds `mine`: its own room not counted
/// twice.
pub fn check_holding(
    server: &Server,
    key: &str,
    path: &str,
    len: u64,
    mine: Option<&Hold>,
) -> Result<(), ContractError> {
    let by = lock(&server.reserved.by_folder);
    judged(server, &by, key, path, len, mine.map_or(0, |h| h.bytes)).map(|_| ())
}

/// [`check`], and the room the write would add held until the [`Hold`]
/// goes: judged and held under one lock, so two writes that start
/// together see each other's. `None` when the folder has no quota or the
/// write does not grow it.
pub fn reserve(
    server: &Server,
    key: &str,
    path: &str,
    len: u64,
) -> Result<Option<Hold>, ContractError> {
    let mut by = lock(&server.reserved.by_folder);
    let Some((folder, delta)) = judged(server, &by, key, path, len, 0)? else {
        return Ok(None);
    };
    *by.entry(folder.clone()).or_insert(0) += delta;
    Ok(Some(Hold {
        by_folder: Arc::clone(&server.reserved.by_folder),
        folder,
        bytes: delta,
    }))
}

/// The folder and the bytes `len` at `path` would add to it, when that is
/// within its quota with what other writes hold (`by`, less `mine`); the
/// refusal when it is not; `None` when the folder has no quota or does not
/// grow.
fn judged(
    server: &Server,
    by: &HashMap<String, u64>,
    key: &str,
    path: &str,
    len: u64,
    mine: u64,
) -> Result<Option<(String, u64)>, ContractError> {
    let Some(folder) = folder_of_key(server, key) else {
        return Ok(None);
    };
    let quota = server.db.quota(&folder).map_err(verso_service::failed)?;
    let Some(quota) = quota.and_then(|q| u64::try_from(q).ok()) else {
        return Ok(None);
    };
    // Sync's record of the folder follows each write as it happens; the
    // index's listing only its walks, so a burst of writes would each see
    // the total before the others (ADR 0077 item 5).
    let (used, delta) = match server
        .db
        .space(&folder, path)
        .map_err(verso_service::failed)?
    {
        Some((total, old)) => (
            u64::try_from(total).unwrap_or(0),
            i64::try_from(len).unwrap_or(i64::MAX).saturating_sub(old),
        ),
        None => {
            let path = path.to_owned();
            server
                .service
                .with_key(key, move |ws| Ok(verso_service::growth(ws, &path, len)))?
        }
    };
    if delta <= 0 {
        return Ok(None);
    }
    let delta = u64::try_from(delta).unwrap_or(u64::MAX);
    let held = by.get(&folder).copied().unwrap_or(0).saturating_sub(mine);
    let after = used.saturating_add(held).saturating_add(delta);
    if after > quota {
        return Err(verso_service::over_quota(used.saturating_add(held), quota));
    }
    Ok(Some((folder, delta)))
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
        // A data file of the folder (ADR 0099 item 2, ADR 0098 item 2)
        // takes the folder's disk like any file.
        "write_folder_data" => Some((
            format!(
                "{}/{}/{}.json",
                verso_fs::SETTINGS_DIR,
                text("kind")?,
                text("id")?
            ),
            len(text("text")?),
        )),
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
        // Typed by the contract (ADR 0084 item 10): bytes as numbers the
        // window shows, whole below 2^53.
        let payload = FolderQuota {
            used: used as f64,
            quota: quota as f64,
        };
        server.push_folder(
            folder,
            &json!({ "event": "folder-quota", "payload": payload }),
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
