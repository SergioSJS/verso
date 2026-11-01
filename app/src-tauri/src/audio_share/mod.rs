// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Share audio, the desktop host's side (ADR 0116 section B, items 17 and
//! 27): the three host commands. Capture lives only here, one file per
//! system (`macos.rs`, `windows.rs`, `linux.rs`, later tasks). This step is
//! the contract: the commands are registered, granted to the app's own
//! views, list nothing and refuse to start, since nothing captures yet.

use super::*;
use verso_contract::{AudioCaptureStarted, AudioSource};

/// Listening: the frames the server sends a window, handed to it.
pub(crate) mod hear;
#[cfg(test)]
mod tests_hear;

/// What this computer can capture: applications by their display name,
/// pages open in Verso, the system (never a window title).
#[tauri::command]
#[specta::specta]
pub fn audio_sources_list() -> Result<Vec<AudioSource>, ContractError> {
    Ok(Vec::new())
}

/// Capture the source `id` and encode it with Opus at `bitrate_kbps`
/// (64 to 128), handing the frames to the window.
#[tauri::command]
#[specta::specta]
pub fn audio_share_start(
    id: String,
    bitrate_kbps: u16,
) -> Result<AudioCaptureStarted, ContractError> {
    let _ = (id, bitrate_kbps);
    Err(refused("sharing audio is not built yet"))
}

/// Stop capturing.
#[tauri::command]
#[specta::specta]
pub fn audio_share_stop() -> Result<(), ContractError> {
    Ok(())
}
