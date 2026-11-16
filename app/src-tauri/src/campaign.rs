// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A table is a campaign folder (ADR 0110). The tables are a server's:
//! their state — open or closed, which notes are released, who may edit
//! which — lives in the server's database. A window on a server's folder
//! sends these to it (`remote.rs`); a folder of this computer alone has no
//! table, and the status says so.

use super::*;
use verso_contract::{
    AccessChange, AccessInfo, AccessSetResult, CampaignAccess, CampaignAudience, CampaignGrant,
    CampaignInvite, CampaignStatus,
};

fn no_table() -> ContractError {
    refused("a table is a server's; a folder of this computer alone has none")
}

/// What the folder's tables are, to this window: a folder of this computer
/// alone has none.
#[tauri::command]
#[specta::specta]
pub fn campaign_status() -> Result<CampaignStatus, ContractError> {
    Ok(CampaignStatus {
        viewer: "none".to_owned(),
        tables: Vec::new(),
        notes: Vec::new(),
        players: Vec::new(),
        can_invite: false,
        rejoined: 0,
    })
}

/// Make `root`, a folder of this one (`""` is the whole), a table. The
/// folder's owner only.
#[tauri::command]
#[specta::specta]
pub fn campaign_make(root: String) -> Result<CampaignStatus, ContractError> {
    let _ = root;
    Err(no_table())
}

/// Turn the table at `root` back into a folder.
#[tauri::command]
#[specta::specta]
pub fn campaign_unmake(root: String) -> Result<CampaignStatus, ContractError> {
    let _ = root;
    Err(no_table())
}

/// A table's settings: open or closed, and its limits (the log's entries
/// and an image's bytes); a value left out stays.
#[tauri::command]
#[specta::specta]
pub fn campaign_settings(
    root: String,
    open: Option<bool>,
    log_max: Option<u32>,
    image_max: Option<u32>,
) -> Result<CampaignStatus, ContractError> {
    let _ = (root, open, log_max, image_max);
    Err(no_table())
}

/// Release notes to the table, or hide them again: a folder stands for the
/// notes under it.
#[tauri::command]
#[specta::specta]
pub fn campaign_release(
    paths: Vec<String>,
    released: bool,
) -> Result<CampaignStatus, ContractError> {
    let _ = (paths, released);
    Err(no_table())
}

/// Release every note of the table at `root`.
#[tauri::command]
#[specta::specta]
pub fn campaign_release_all(root: String) -> Result<CampaignStatus, ContractError> {
    let _ = root;
    Err(no_table())
}

/// Release notes to some players, to the whole table or to nobody: a folder
/// stands for the notes under it.
#[tauri::command]
#[specta::specta]
pub fn campaign_audience(
    paths: Vec<String>,
    audience: CampaignAudience,
) -> Result<CampaignStatus, ContractError> {
    let _ = (paths, audience);
    Err(no_table())
}

/// Who has access to a note of the table, and what each person can do.
#[tauri::command]
#[specta::specta]
pub fn campaign_access(path: String) -> Result<CampaignAccess, ContractError> {
    let _ = path;
    Err(no_table())
}

/// Mark a note's name a secret: every link to it is drawn as blocks.
#[tauri::command]
#[specta::specta]
pub fn campaign_secret_name(path: String, on: bool) -> Result<CampaignStatus, ContractError> {
    let _ = (path, on);
    Err(no_table())
}

/// Who may edit a note: nobody, the group, or one player.
#[tauri::command]
#[specta::specta]
pub fn campaign_grant(path: String, grant: CampaignGrant) -> Result<CampaignStatus, ContractError> {
    let _ = (path, grant);
    Err(no_table())
}

/// The access of each path named: its own set, what applies, where it comes
/// from and, for a folder, how many files lie under it and which have a set
/// of their own (ADR 0113 section C).
#[tauri::command]
#[specta::specta]
pub fn access_get(paths: Vec<String>) -> Result<Vec<AccessInfo>, ContractError> {
    let _ = paths;
    Err(no_table())
}

/// Write the whole access of each path named, or delete it (*Follow the
/// folder*); on a folder it replaces everything inside (ADR 0113 item 2).
#[tauri::command]
#[specta::specta]
pub fn access_set(
    paths: Vec<String>,
    change: AccessChange,
) -> Result<AccessSetResult, ContractError> {
    let _ = (paths, change);
    Err(no_table())
}

/// Give players, or take from them, a right at a table: today `files`,
/// *Send files* (ADR 0113 K.4).
#[tauri::command]
#[specta::specta]
pub fn table_rights_set(
    root: String,
    accounts: Vec<String>,
    right: String,
    on: bool,
) -> Result<CampaignStatus, ContractError> {
    let _ = (root, accounts, right, on);
    Err(no_table())
}

/// An invitation link to the table, for a reader.
#[tauri::command]
#[specta::specta]
pub fn campaign_invite(root: String) -> Result<CampaignInvite, ContractError> {
    let _ = root;
    Err(no_table())
}
