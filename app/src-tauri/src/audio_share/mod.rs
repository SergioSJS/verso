// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Share audio, the desktop host's side (ADR 0116 section B, items 17 and
//! 27): the three host commands. Capture lives only here, one file per
//! system (`macos.rs`, `windows.rs`, `linux.rs`, later tasks).
//!
//! This step (S4) is the encoder and a test source:
//! - `encode.rs`: the Opus encoder (pure);
//! - `source.rs`: the `Source` trait the capture back-ends plug into, and
//!   the list of what a build can capture;
//! - `tone.rs`: the test tone, a 440 Hz sine at real time, listed only in
//!   debug builds (or a build with the cargo feature `test-tone`, which no
//!   release workflow sets), so the shipped app never shows it;
//! - `session.rs`: a share at work (source, encoder, the 12-byte header of
//!   ADR 0116 item 19) and the frames' delivery to the window.
//!
//! Frames reach the window over a Tauri channel as raw bytes, the way the
//! terminal's output does (ADR 0115 item 5); the window sends each as a
//! binary message on the table's WebSocket
//! (`app/ui/src/table/sound/share.ts`).

use super::*;
use tauri::Manager;
use tauri::ipc::{Channel, InvokeResponseBody, IpcResponse};
use verso_contract::{AudioCaptureStarted, AudioSource, bitrate_ok};
use verso_service::refused;

mod encode;
mod session;
mod source;
mod tone;

pub(crate) use session::Shares;

/// One frame (header and Opus packet) on its way to the window. It goes as
/// raw bytes (an `ArrayBuffer` in the window), not as a JSON array of
/// numbers; the generated bindings type the channel's message as a byte
/// list, which is what the type says and not what arrives, so the window
/// reads it as bytes (`share.ts`).
#[derive(specta::Type)]
#[specta(transparent)]
pub struct Frame(Vec<u8>);

impl IpcResponse for Frame {
    fn body(self) -> tauri::Result<InvokeResponseBody> {
        Ok(InvokeResponseBody::Raw(self.0))
    }
}

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
/// (64 to 128), handing the frames to the window on `frames`.
#[tauri::command]
#[specta::specta]
pub fn audio_share_start<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    id: String,
    bitrate_kbps: u16,
    frames: Channel<Frame>,
) -> Result<AudioCaptureStarted, ContractError> {
    allowed(&app, window.label())?;
    if !bitrate_ok(bitrate_kbps) {
        return Err(refused("that bitrate is outside 64 to 128 kbit/s"));
    }
    let Some(chosen) = source::open(&id) else {
        return Err(refused("no such source to share"));
    };
    app.state::<App>()
        .shares
        .start(
            window.label(),
            chosen,
            bitrate_kbps,
            Box::new(move |frame| frames.send(Frame(frame)).is_ok()),
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
