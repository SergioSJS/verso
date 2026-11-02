// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Windows: the few Win32 and WebView2 calls Share audio makes itself (ADR
//! 0116 item 17), the third place of the repository allowed `unsafe` (ADR
//! 0029 revision of 2026-10-15; ADR 0116, Q9 decided (a) on 2026-10-31;
//! `CLAUDE.md` §3; `scripts/check-unsafe.mjs`).
//!
//! The capture itself needs none: the `wasapi` crate is a safe API over
//! WASAPI, process loopback included (the evaluation is in ADR 0116, "As
//! built (S8)"). What no safe crate in the tree serves is, in this file:
//! - the build number of Windows, which decides whether process loopback
//!   exists (`RtlGetVersion`, which does not lie about the version the way
//!   `GetVersionEx` does for a program without a manifest);
//! - what WebView2 says of a page: the process id of the browser process of
//!   its environment (the root of the tree process loopback captures) and
//!   whether its document is playing audio now.
//!
//! Each `unsafe` block does one thing and says why it is sound. Which
//! sources to list and the capture are safe code in `windows_source.rs`.

#![allow(unsafe_code)]

use std::mem::size_of;

use tauri::webview::PlatformWebview;
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_8;
use windows::Wdk::System::SystemServices::RtlGetVersion;
use windows::Win32::System::SystemInformation::OSVERSIONINFOW;
use windows::core::{BOOL, Interface};

/// The build number of Windows (19045 for Windows 10 22H2, 22631 for
/// Windows 11 23H2), or 0 if the system does not say.
#[must_use]
pub fn os_build() -> u32 {
    let mut info = OSVERSIONINFOW {
        dwOSVersionInfoSize: size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    // SAFETY: `info` is a live, writable OSVERSIONINFOW whose size field is
    // set, which is all `RtlGetVersion` reads and writes; it keeps no pointer.
    let status = unsafe { RtlGetVersion(&mut info) };
    if status.is_ok() {
        info.dwBuildNumber
    } else {
        0
    }
}

/// What WebView2 says of one page's view: the browser process of its
/// environment and whether the document plays audio. Runs on the main
/// thread, inside `with_webview`.
pub fn page_facts(pw: &PlatformWebview) -> Result<(u32, bool), String> {
    let controller = pw.controller();
    // SAFETY: the controller is a live COM reference Tauri hands out on the
    // main thread; `CoreWebView2` returns a new reference to its view.
    let view = unsafe { controller.CoreWebView2() }.map_err(|e| e.to_string())?;
    let mut pid = 0_u32;
    // SAFETY: `BrowserProcessId` writes one u32 into `pid`, a local that
    // outlives the call; `view` is live.
    unsafe { view.BrowserProcessId(&raw mut pid) }.map_err(|e| e.to_string())?;
    // Playing is a courtesy of the list: a WebView2 runtime without the
    // property (before ICoreWebView2_8) says "not playing".
    let playing = view.cast::<ICoreWebView2_8>().is_ok_and(|v| {
        let mut on = BOOL(0);
        // SAFETY: `IsDocumentPlayingAudio` writes one BOOL into `on`, a
        // local that outlives the call; `v` is live.
        unsafe { v.IsDocumentPlayingAudio(&raw mut on) }.is_ok() && on.as_bool()
    });
    Ok((pid, playing))
}
