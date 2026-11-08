// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! An embedded page drawn as an `<iframe>` would draw it, though it is a
//! native child web view (ADR 0056, revised 2026-10-15).
//!
//! A site that refuses to be framed (`X-Frame-Options`, `frame-ancestors`)
//! is shown in a child web view: a native view of its own, floating over
//! the window's page, which CSS cannot clip. Shrinking that view to the
//! visible part of its box showed the top of the page in a shorter view.
//! Here each child web view sits in a native **container** whose frame is
//! the visible part (`visible`), and the page's view inside it keeps the
//! box's whole size at the box's true place (`slot`): the page is laid out
//! for the whole box (its `100vh` is the box's height), moves up with the
//! note as the note scrolls, and only what lies inside the container is
//! drawn. The note's scrolling never scrolls the page; the page's own
//! scroll and clicks work in the part that shows.
//!
//! The containers are platform views reached through Tauri's
//! `Webview::with_webview`, on the main thread: an `NSView` on macOS, a
//! child window on Windows — both need `unsafe`, the one exception to the
//! workspace's `unsafe_code = "forbid"`, confined to `macos.rs` and
//! `windows.rs` beside this file (ADR 0029, revision of 2026-10-15; held
//! there by `scripts/check-unsafe.mjs`). Linux uses GTK's own safe API
//! (`linux.rs`, no `unsafe`). This file has none.
//!
//! Nothing is stored between calls: each call finds the container from
//! the page's view (its parent, recognised by a name), so a raw handle
//! never outlives the call that read it. If a platform cannot build the
//! container, that view falls back to what came before — cut to the
//! visible part, the page's top shown — with one WARN in the log.

pub(crate) mod geometry;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

#[cfg(windows)]
use self::windows as platform;
#[cfg(target_os = "linux")]
use linux as platform;
#[cfg(target_os = "macos")]
use macos as platform;

/// Any other platform: no container, so every view falls back.
#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
mod platform {
    use super::geometry::Frames;
    pub(super) const FROM_WINDOW_TOP: bool = true;
    pub(super) fn device_scale(scale: f64) -> f64 {
        scale
    }
    pub(super) fn place(
        _: &tauri::webview::PlatformWebview,
        _: Frames,
        _: f64,
    ) -> Result<(), String> {
        Err("no clipping container on this platform".to_owned())
    }
    pub(super) fn show(_: &tauri::webview::PlatformWebview, _: bool) {}
    pub(super) fn release(_: &tauri::webview::PlatformWebview) {}
}

use std::collections::BTreeSet;
use std::sync::Mutex;

use geometry::{Rect, frames};
use verso_service::lock;

/// The web views whose container could not be built: they are cut to
/// their visible part, as before, and warned about once.
static FELL_BACK: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());

fn fell_back(label: &str) -> bool {
    lock(&FELL_BACK).contains(label)
}

/// Where the window's page starts below the window's frame: the
/// containers of macOS and Windows are placed from the window (as Tauri
/// places a child view), those of Linux from the window's own page.
fn shift(chrome: f64) -> f64 {
    if platform::FROM_WINDOW_TOP {
        chrome
    } else {
        0.0
    }
}

/// The view cut to the visible part, its page not moved: the place
/// before the containers, and the fallback when one cannot be built.
fn clamp<R: tauri::Runtime>(wv: &tauri::Webview<R>, visible: Rect) -> tauri::Result<()> {
    crate::mobile::place_view(
        wv,
        tauri::LogicalPosition::new(visible.x, visible.y),
        tauri::LogicalSize::new(visible.w.max(1.0), visible.h.max(1.0)),
    )
}

/// Put a web view's page at `slot`, drawn only inside `visible` (logical
/// pixels from the top of the window's page; `chrome` is how far that
/// page starts below the window's frame, `scale` the window's device
/// pixels per logical pixel). The work happens on the main thread, after
/// this returns.
pub(crate) fn place<R: tauri::Runtime>(
    wv: &tauri::Webview<R>,
    slot: Rect,
    visible: Rect,
    chrome: f64,
    scale: f64,
) -> Result<(), String> {
    let label = wv.label().to_owned();
    // Tauri's coordinates, from the window's frame, as before the containers.
    let cut = visible.lower(chrome);
    if fell_back(&label) {
        return clamp(wv, cut).map_err(|e| e.to_string());
    }
    let from = shift(chrome);
    let device = platform::device_scale(scale);
    let f = frames(slot.lower(from), visible.lower(from), device)
        .ok_or_else(|| format!("{label}: not a place for a page"))?;
    let later = wv.clone();
    wv.with_webview(move |pw| {
        if let Err(why) = platform::place(&pw, f, device) {
            platform::release(&pw);
            give_up(later, &why, cut);
        }
    })
    .map_err(|e| e.to_string())
}

/// The container could not be built: this view falls back to being cut
/// to `visible`, from now on, with one line in the log.
fn give_up<R: tauri::Runtime>(wv: tauri::Webview<R>, why: &str, visible: Rect) {
    let label = wv.label().to_owned();
    if lock(&FELL_BACK).insert(label.clone()) {
        crate::log::write(
            "WARN",
            "web",
            &format!(
                "{label}: the page cannot be clipped like a frame here ({why}); its view is cut to the part that shows, the page's top first"
            ),
        );
    }
    // From another thread: inside `with_webview` the main thread is busy
    // with this very view, and the move is queued behind it.
    tauri::async_runtime::spawn(async move {
        if let Err(e) = clamp(&wv, visible) {
            crate::log::write("WARN", "web", &format!("{label}: not moved: {e}"));
        }
    });
}

/// Show or hide the container with its page (the page's view itself is
/// shown and hidden by Tauri).
pub(crate) fn show<R: tauri::Runtime>(wv: &tauri::Webview<R>, visible: bool) {
    if fell_back(wv.label()) {
        return;
    }
    let _ = wv.with_webview(move |pw| platform::show(&pw, visible));
}

/// Take the page's view out of its container and remove the container,
/// before the view is closed.
pub(crate) fn release<R: tauri::Runtime>(wv: &tauri::Webview<R>) {
    lock(&FELL_BACK).remove(wv.label());
    let _ = wv.with_webview(|pw| platform::release(&pw));
}
