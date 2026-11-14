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

#[cfg(target_os = "android")]
mod android;
#[cfg(any(target_os = "macos", windows, test))]
mod convert;
mod encode;
#[cfg(target_os = "linux")]
mod linux_play;
#[cfg(target_os = "linux")]
mod linux_source;
#[cfg(target_os = "linux")]
mod linuxpages;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
mod macos_play;
#[cfg(target_os = "macos")]
mod macos_source;
#[cfg(any(target_os = "macos", test))]
mod macpages;
#[cfg(any(target_os = "macos", target_os = "linux", test))]
mod ownqueue;
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod pageplay;
mod session;
mod source;
mod tone;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
mod windows_source;
#[cfg(any(windows, target_os = "macos", target_os = "linux", test))]
mod winpages;

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

/// What this system can capture for this window, and why there is none
/// when the person can fix it. Windows shares only the pages open in Verso
/// (ADR 0116 amendment of 2026-11-01), which are the window's own to name.
#[cfg(windows)]
async fn platform_sources<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) -> (Vec<AudioSource>, Option<&'static str>) {
    let mut list = source::list();
    match windows_source::list(app, label).await {
        Ok(pages) => {
            list.extend(pages);
            (list, None)
        }
        Err(why) => (list, Some(why)),
    }
}

/// The Mac shares only the pages open in Verso too (ADR 0116 amendment of
/// 2026-11-01), once a page has made sound.
#[cfg(target_os = "macos")]
async fn platform_sources<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) -> (Vec<AudioSource>, Option<&'static str>) {
    let mut list = source::list();
    match macos_source::list() {
        Ok(mut pages) => {
            name_playing(app, label, &mut pages, macos::ask_playing).await;
            list.extend(pages);
            (list, None)
        }
        Err(why) => (list, Some(why)),
    }
}

/// Linux shares only the pages open in Verso too (ADR 0116 amendment of
/// 2026-11-01; "As built (S9)"), once a web process of the pages exists.
#[cfg(target_os = "linux")]
async fn platform_sources<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) -> (Vec<AudioSource>, Option<&'static str>) {
    let mut list = source::list();
    match tauri::async_runtime::spawn_blocking(linux_source::list).await {
        Ok(Ok(mut pages)) => {
            name_playing(app, label, &mut pages, linux_source::ask_playing).await;
            list.extend(pages);
            (list, None)
        }
        Ok(Err(why)) => (list, Some(why)),
        Err(_) => (list, None),
    }
}

/// Names the pages source after the sites playing now (S10; Windows does it
/// in `windows_source.rs`). Naming only: it fails closed to the plain name.
#[cfg(any(target_os = "macos", target_os = "linux"))]
async fn name_playing<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    sources: &mut [AudioSource],
    ask: pageplay::Ask,
) {
    for s in sources.iter_mut().filter(|s| s.id == winpages::PAGES_ID) {
        s.name = pageplay::source_name(app, label, ask).await;
    }
}

/// A phone shares the sound of its other apps (ADR 0118 item 5).
#[cfg(target_os = "android")]
async fn platform_sources<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _label: &str,
) -> (Vec<AudioSource>, Option<&'static str>) {
    let mut list = source::list();
    list.extend(android::list());
    (list, None)
}

#[cfg(not(any(
    windows,
    target_os = "macos",
    target_os = "linux",
    target_os = "android"
)))]
async fn platform_sources<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _label: &str,
) -> (Vec<AudioSource>, Option<&'static str>) {
    (source::list(), None)
}

/// The source `id` names for this window.
#[cfg(windows)]
async fn open_source<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    id: &str,
) -> Option<Box<dyn source::Source>> {
    match source::open(id) {
        Some(found) => Some(found),
        None => windows_source::open(app, label, id).await,
    }
}

#[cfg(target_os = "macos")]
async fn open_source<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _label: &str,
    id: &str,
) -> Option<Box<dyn source::Source>> {
    source::open(id).or_else(|| macos_source::open(id))
}

#[cfg(target_os = "linux")]
async fn open_source<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _label: &str,
    id: &str,
) -> Option<Box<dyn source::Source>> {
    source::open(id).or_else(|| linux_source::open(id))
}

#[cfg(target_os = "android")]
async fn open_source<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    _label: &str,
    id: &str,
) -> Option<Box<dyn source::Source>> {
    let lang = verso_service::lock(&app.state::<App>().menu_language).clone();
    source::open(id).or_else(|| android::open(id, &lang))
}

#[cfg(not(any(
    windows,
    target_os = "macos",
    target_os = "linux",
    target_os = "android"
)))]
async fn open_source<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _label: &str,
    id: &str,
) -> Option<Box<dyn source::Source>> {
    source::open(id)
}

/// Listening: the frames the server sends a window, handed to it.
pub(crate) mod hear;
#[cfg(test)]
mod tests_e2e;
#[cfg(test)]
mod tests_hear;
#[cfg(test)]
mod tests_level;

/// What this computer can capture: applications by their display name,
/// pages open in Verso, the system (never a window title).
#[tauri::command]
#[specta::specta]
pub async fn audio_sources_list<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<Vec<AudioSource>, ContractError> {
    allowed(&app, window.label())?;
    let (list, unavailable) = platform_sources(&app, window.label()).await;
    // Nothing to list for a reason the person can fix: said, not silent.
    if list.is_empty()
        && let Some(why) = unavailable
    {
        return Err(refused(why));
    }
    Ok(list)
}

/// Capture the source `id` and encode it with Opus at `bitrate_kbps`
/// (64 to 128), sending each frame to the server on the window's own
/// connection under `share`, the number the server gave the share
/// (`table_share_start`'s answer, which the window asks first).
#[tauri::command]
#[specta::specta]
pub async fn audio_share_start<R: tauri::Runtime>(
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
    let Some(chosen) = open_source(&app, window.label(), &id).await else {
        return Err(refused("no such source to share"));
    };
    let Some(connection) = link(&app, window.label()) else {
        return Err(refused(
            "this window has no connection to a server to share on",
        ));
    };
    let shares = &app.state::<App>().shares;
    let chosen = Box::new(Metered {
        inner: chosen,
        app: app.clone(),
        label: window.label().to_owned(),
    });
    let sender = std::sync::Arc::clone(&connection);
    let started = shares
        .start(
            window.label(),
            chosen,
            bitrate_kbps,
            share,
            Box::new(move |frame| sender.send_audio(frame)),
        )
        .map_err(|why| match why.as_str() {
            // The person's to fix, not a fault of the app: no ERROR in the log.
            source::PERMISSION_DENIED | source::NEEDS_NEWER_MAC => refused(why),
            #[cfg(windows)]
            winpages::NEEDS_WINDOWS_11 | winpages::NO_PAGES => refused(why),
            #[cfg(target_os = "macos")]
            winpages::NO_PAGES => refused(why),
            #[cfg(target_os = "linux")]
            linuxpages::NEEDS_PULSE_TOOLS | winpages::NO_PAGES => refused(why),
            #[cfg(target_os = "android")]
            android::NOT_ALLOWED | android::NO_MIC => refused(why),
            _ => failed(why),
        })?;
    shares.on_window_gone(window.label(), farewell(connection));
    Ok(started)
}

/// A source whose blocks are also measured: the window's level meter (ADR
/// 0116 item 21) hears of the peak, 0.0 to 1.0, ten times a second, in the
/// event `audio-share-level`. Only a number crosses; no sound does.
struct Metered<R: tauri::Runtime> {
    inner: Box<dyn source::Source>,
    app: tauri::AppHandle<R>,
    label: String,
}

impl<R: tauri::Runtime> source::Source for Metered<R> {
    fn describe(&self) -> AudioSource {
        self.inner.describe()
    }

    fn start(self: Box<Self>, mut sink: source::PcmSink) -> Result<source::Running, String> {
        use tauri::Emitter;
        let Self { inner, app, label } = *self;
        let mut peak = 0.0_f32;
        let mut samples = 0_usize;
        // 100 ms of interleaved stereo at 48 kHz.
        let window = 9_600;
        inner.start(Box::new(move |pcm| {
            peak = pcm.iter().fold(peak, |m, x| m.max(x.abs()));
            samples += pcm.len();
            if samples >= window {
                let _ = app.emit_to(label.as_str(), "audio-share-level", peak.min(1.0));
                peak = 0.0;
                samples = 0;
            }
            sink(pcm);
        }))
    }
}

/// The window went with its share running: the server is told on the same
/// connection, so the players see it stop (ADR 0116 item 16). A synced
/// folder's link stays up for other windows, so the connection's closing
/// would never say it.
pub(crate) fn farewell(connection: std::sync::Arc<remote::Remote>) -> session::Farewell {
    Box::new(move || {
        tauri::async_runtime::spawn(async move {
            let _ = connection
                .call("table_share_stop", serde_json::json!({}))
                .await;
        });
    })
}

/// The window is about to share on a Mac or a Linux machine: its own sounds go to the host's
/// output from now on (ADR 0116, the 2026-11-02 note on A2), so the tap that
/// carries the pages never hears them. `true` when the window should send
/// its final output to `audio_share_own_pcm`; `false` anywhere else (nothing
/// changes there). The window asks this before it starts the capture.
#[tauri::command]
#[specta::specta]
pub async fn audio_share_own_begin<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<bool, ContractError> {
    allowed(&app, window.label())?;
    #[cfg(target_os = "macos")]
    {
        let label = window.label().to_owned();
        tauri::async_runtime::spawn_blocking(move || macos_play::begin(&label))
            .await
            .map_err(|e| failed(e.to_string()))?
            .map_err(failed)
    }
    #[cfg(target_os = "linux")]
    {
        let label = window.label().to_owned();
        tauri::async_runtime::spawn_blocking(move || linux_play::begin(&label))
            .await
            .map_err(|e| failed(e.to_string()))?
            .map_err(failed)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    Ok(false)
}

/// The raw bytes of a call, as the window sent them (an `ArrayBuffer`, never
/// a JSON array of numbers).
pub struct RawBody(pub Vec<u8>);

impl<'de, R: tauri::Runtime> tauri::ipc::CommandArg<'de, R> for RawBody {
    fn from_command(
        command: tauri::ipc::CommandItem<'de, R>,
    ) -> Result<Self, tauri::ipc::InvokeError> {
        match command.message.payload() {
            tauri::ipc::InvokeBody::Raw(bytes) => Ok(Self(bytes.clone())),
            tauri::ipc::InvokeBody::Json(_) => Err(tauri::ipc::InvokeError::from(
                "a block of sound is raw bytes",
            )),
        }
    }
}

impl specta::Type for RawBody {
    fn definition(_: &mut specta::Types) -> specta::datatype::DataType {
        specta::datatype::DataType::Reference(specta_typescript::define("ArrayBuffer"))
    }
}

/// One block of the window's own sound (`ownqueue.rs`: the sample rate as an
/// `f32`, then interleaved stereo `f32`, little-endian), raw over the IPC.
/// Dropped when the window is not routing its sound here.
#[tauri::command]
#[specta::specta]
pub fn audio_share_own_pcm<R: tauri::Runtime>(
    window: tauri::Window<R>,
    block: RawBody,
) -> Result<(), ContractError> {
    #[cfg(target_os = "macos")]
    {
        macos_play::push(window.label(), &block.0).map_err(refused)
    }
    #[cfg(target_os = "linux")]
    {
        linux_play::push(window.label(), &block.0).map_err(refused)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        // Here `audio_share_own_begin` answers false: a window never routes
        // its sounds to this host, so a block is a mistake, said as one.
        let _ = window;
        if block.0.is_empty() {
            Ok(())
        } else {
            Err(refused("this system plays the window's own sounds itself"))
        }
    }
}

/// The share is over: the window's sounds go back to the web view's output.
#[tauri::command]
#[specta::specta]
pub fn audio_share_own_end<R: tauri::Runtime>(
    window: tauri::Window<R>,
) -> Result<(), ContractError> {
    own_output_gone(window.label());
    Ok(())
}

/// Silence a page's view before it closes (macOS: WebKit suspends all its
/// media; elsewhere the page's own script does it, `web::SILENCE`).
pub(crate) fn suspend_page_media(pw: &tauri::webview::PlatformWebview) {
    #[cfg(target_os = "macos")]
    macos::suspend_media(pw);
    #[cfg(not(target_os = "macos"))]
    let _ = pw;
}

/// The window's own output, if it had one, ends (the window went, or the share did).
pub(crate) fn own_output_gone(label: &str) {
    #[cfg(target_os = "macos")]
    macos_play::end(label);
    #[cfg(target_os = "linux")]
    linux_play::end(label);
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let _ = label;
}

/// Stop capturing.
#[tauri::command]
#[specta::specta]
pub fn audio_share_stop<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<(), ContractError> {
    app.state::<App>().shares.stop_of(window.label());
    own_output_gone(window.label());
    Ok(())
}
