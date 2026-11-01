// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Share audio, the desktop host's side (ADR 0116 section B, items 17 and
//! 27): the three host commands. Capture lives only here, one file per
//! system (`macos.rs`, `windows.rs`, `linux.rs`, later tasks).
//!
//! This step (S4) is the encoder, a test source and the send half:
//! - `encode.rs`: the Opus encoder (pure);
//! - `source.rs`: the `Source` trait the capture back-ends plug into, and
//!   the list of what a build can capture;
//! - `tone.rs`: the test tone, a 440 Hz sine at real time, listed only in
//!   debug builds (or a build with the cargo feature `test-tone`, which no
//!   release workflow sets), so the shipped app never shows it;
//! - `session.rs`: a share at work (source, encoder, the 12-byte header of
//!   ADR 0116 item 19).
//!
//! The frames go **host to server directly**, as binary messages on the
//! window's own connection to the server (`Remote::send_audio`): the host
//! holds that connection for a window on a server's folder and for a folder
//! of this computer synced with one (its live link), so a frame never
//! crosses into the web view and back (fifty IPC calls a second for
//! nothing), and the server's rule that only the connection that started the
//! share may send holds because the window's `table_share_start` and these
//! frames use the same connection. The window therefore starts the share on
//! the server first, and hands the host the number the server stamped.

use super::*;
use tauri::Manager;
use verso_contract::{
    AudioCaptureStarted, AudioSource, SHARE_ID_FIRST, bitrate_ok, is_audio_frame,
};
use verso_service::refused;

mod encode;
mod session;
mod source;
mod tone;

pub(crate) use session::Shares;

/// Refused where the window cannot share audio (`Can::AudioShare`, ADR
/// 0116 item 27): the capabilities answer lists it for every window of a
/// folder and not for a window of files opened without theirs.
fn allowed<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) -> Result<(), ContractError> {
    if app.state::<App>().service.is_loose(label) {
        return Err(refused(
            "a window of files opened without their folder cannot share audio",
        ));
    }
    Ok(())
}

/// The window's connection to its server: its own, for a server's folder,
/// or the live link of a folder of this computer that syncs with one.
fn link<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) -> Option<std::sync::Arc<remote::Remote>> {
    remote::of(app, label)
        .or_else(|| sync_commands::synced_of(app, label).and_then(|s| s.live.remote()))
}

/// Listening: the frames the server sends a window, handed to it.
pub(crate) mod hear;
#[cfg(test)]
mod tests_hear;

/// What this computer can capture: applications by their display name,
/// pages open in Verso, the system (never a window title).
#[tauri::command]
#[specta::specta]
pub fn audio_sources_list<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<Vec<AudioSource>, ContractError> {
    allowed(&app, window.label())?;
    Ok(source::list())
}

/// Capture the source `id` and encode it with Opus at `bitrate_kbps`
/// (64 to 128), sending each frame to the server on the window's own
/// connection under `share`, the number the server gave the share
/// (`table_share_start`'s answer, which the window asks first).
#[tauri::command]
#[specta::specta]
pub fn audio_share_start<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    id: String,
    bitrate_kbps: u16,
    share: u32,
) -> Result<AudioCaptureStarted, ContractError> {
    allowed(&app, window.label())?;
    if !bitrate_ok(bitrate_kbps) {
        return Err(refused("that bitrate is outside 64 to 128 kbit/s"));
    }
    if share < SHARE_ID_FIRST || !is_audio_frame(&share.to_be_bytes()) {
        return Err(refused("that is not a share number the server gives"));
    }
    let Some(chosen) = source::open(&id) else {
        return Err(refused("no such source to share"));
    };
    let Some(connection) = link(&app, window.label()) else {
        return Err(refused(
            "this window has no connection to a server to share on",
        ));
    };
    app.state::<App>()
        .shares
        .start(
            window.label(),
            chosen,
            bitrate_kbps,
            share,
            Box::new(move |frame| connection.send_audio(frame)),
        )
        .map_err(failed)
}

/// Stop capturing.
#[tauri::command]
#[specta::specta]
pub fn audio_share_stop<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<(), ContractError> {
    app.state::<App>().shares.end_of(window.label());
    Ok(())
}
