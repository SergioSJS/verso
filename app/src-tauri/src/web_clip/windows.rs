// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Windows: WebView2's host window — the child window wry makes for each
//! child web view (`WRY_WEBVIEW`, the controller's `ParentWindow`) — moved
//! into a child window of ours, `VersoWebClip`
//! (`WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS`), whose frame is the
//! visible part. Windows draws a child window only inside its parent's
//! client area, so the page, placed at the slot's offset inside the
//! container with the slot's size, is clipped there. Coordinates are the
//! window's physical pixels (the window's DPI scale).
//!
//! One of the two files of the workspace allowed `unsafe` (ADR 0029,
//! revision of 2026-10-15; `scripts/check-unsafe.mjs`): every Win32 and
//! WebView2 call is `unsafe` in the `windows` crate. Each is in a block
//! of its own with its reason; all run on the main thread, inside
//! `with_webview`, on windows of that thread, and no handle outlives the
//! call (a later call finds the container again by its class).

#![allow(unsafe_code)]

use std::sync::OnceLock;

use ::windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM};
use ::windows::Win32::System::LibraryLoader::GetModuleHandleW;
use ::windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, GetClassNameW, GetParent, HWND_TOP,
    RegisterClassExW, SW_HIDE, SW_SHOWNA, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    SetParent, SetWindowPos, ShowWindow, WINDOW_EX_STYLE, WNDCLASSEXW, WS_CHILD, WS_CLIPCHILDREN,
    WS_CLIPSIBLINGS, WS_VISIBLE,
};
use ::windows::core::{PCWSTR, w};
use tauri::webview::PlatformWebview;
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller;

use super::geometry::Frames;

/// The container is placed in the window's client area, as Tauri places
/// a child view.
pub(super) const FROM_WINDOW_TOP: bool = true;

/// Physical pixels: the window's DPI scale.
pub(super) fn device_scale(scale: f64) -> f64 {
    scale
}

/// The container's window class, which is how a later call knows it.
const CLASS: PCWSTR = w!("VersoWebClip");
const CLASS_NAME: &str = "VersoWebClip";

/// The container's window procedure: it has no behaviour of its own.
///
/// # Safety
///
/// Called by Windows only, with a window of this class and a message for
/// it.
unsafe extern "system" fn clip_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    // SAFETY: Windows' own arguments, passed on unchanged to the default
    // procedure, which is what a window with no behaviour of its own runs.
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

/// This program's module, for the class and the window.
fn module() -> Option<HINSTANCE> {
    // SAFETY: a null name asks for the executable's own module; nothing is
    // passed by pointer, and the handle is not one to release.
    unsafe { GetModuleHandleW(PCWSTR::null()) }
        .ok()
        .map(Into::into)
}

/// Register the container's class, once for the process.
fn registered() -> bool {
    static DONE: OnceLock<bool> = OnceLock::new();
    *DONE.get_or_init(|| {
        let Some(instance) = module() else {
            return false;
        };
        let class = WNDCLASSEXW {
            cbSize: u32::try_from(std::mem::size_of::<WNDCLASSEXW>()).unwrap_or(0),
            lpfnWndProc: Some(clip_proc),
            hInstance: instance,
            lpszClassName: CLASS,
            ..Default::default()
        };
        // SAFETY: `class` is a whole `WNDCLASSEXW` on this stack frame,
        // alive across the call; its name is a static string and its
        // procedure a function of this program, both alive as long as the
        // process. Windows copies what it keeps.
        unsafe { RegisterClassExW(&raw const class) != 0 }
    })
}

/// WebView2's controller and the window wry hosts it in.
fn page_window(pw: &PlatformWebview) -> Result<(ICoreWebView2Controller, HWND), String> {
    let controller = pw.controller();
    let mut hwnd = HWND::default();
    // SAFETY: `ParentWindow` writes one `HWND` into `hwnd`, a local that
    // outlives the call; the controller is a live COM reference Tauri
    // hands out on the main thread.
    unsafe { controller.ParentWindow(&raw mut hwnd) }.map_err(|e| e.to_string())?;
    if hwnd.is_invalid() {
        return Err("WebView2 has no host window".to_owned());
    }
    Ok((controller, hwnd))
}

fn parent(hwnd: HWND) -> Option<HWND> {
    // SAFETY: reads Windows' tree for a live window of this thread; no
    // memory of ours is passed.
    unsafe { GetParent(hwnd) }.ok()
}

fn is_clip(hwnd: HWND) -> bool {
    let mut name = [0u16; 32];
    // SAFETY: the buffer is a local array and the function writes at most
    // its length, which the `windows` crate passes from the slice.
    let n = unsafe { GetClassNameW(hwnd, &mut name) };
    usize::try_from(n)
        .ok()
        .and_then(|n| name.get(..n))
        .is_some_and(|s| String::from_utf16_lossy(s) == CLASS_NAME)
}

/// Make the container in `window`, on top of its other children, and
/// move the page's host window into it.
fn adopt(page: HWND, window: HWND) -> Result<HWND, String> {
    if !registered() {
        return Err("the container's window class could not be registered".to_owned());
    }
    // SAFETY: a child window of `window`, a live window of this thread
    // (the page's own parent, read just before); the class is registered
    // above, the name and every pointer argument are null, and the module
    // is this program's.
    let clip = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            CLASS,
            PCWSTR::null(),
            WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
            0,
            0,
            0,
            0,
            Some(window),
            None,
            module(),
            None,
        )
    }
    .map_err(|e| e.to_string())?;
    // SAFETY: `clip` is the window made above; only its place in the
    // order of its siblings changes, on top as wry puts a child view.
    let on_top = unsafe {
        SetWindowPos(
            clip,
            Some(HWND_TOP),
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
        )
    };
    // SAFETY: both are live windows of this thread — wry's host window and
    // the container made above; only Windows' tree of windows changes.
    let moved = on_top.and_then(|()| unsafe { SetParent(page, Some(clip)) }.map(|_| ()));
    if let Err(e) = moved {
        // SAFETY: `clip` was made above and holds nothing yet.
        let _ = unsafe { DestroyWindow(clip) };
        return Err(e.to_string());
    }
    Ok(clip)
}

/// `f` is in the window's physical pixels.
pub(super) fn place(pw: &PlatformWebview, f: Frames, _scale: f64) -> Result<(), String> {
    let (controller, page) = page_window(pw)?;
    let up = parent(page).ok_or("the page's window has no parent")?;
    let clip = if is_clip(up) { up } else { adopt(page, up)? };
    // SAFETY: `clip` is the container, a live child window of this
    // thread; moving and sizing it passes no memory of ours.
    unsafe {
        SetWindowPos(
            clip,
            None,
            f.clip.x,
            f.clip.y,
            f.clip.w,
            f.clip.h,
            SWP_NOACTIVATE | SWP_NOZORDER,
        )
    }
    .map_err(|e| e.to_string())?;
    // SAFETY: `page` is wry's host window, live and now inside `clip`;
    // the place is relative to `clip`'s client area.
    unsafe {
        SetWindowPos(
            page,
            None,
            f.page.x,
            f.page.y,
            f.page.w,
            f.page.h,
            SWP_NOACTIVATE | SWP_NOZORDER,
        )
    }
    .map_err(|e| e.to_string())?;
    // SAFETY: a `RECT` by value, relative to the host window, as wry sets
    // it; the controller is a live COM reference.
    unsafe {
        controller.SetBounds(RECT {
            left: 0,
            top: 0,
            right: f.page.w,
            bottom: f.page.h,
        })
    }
    .map_err(|e| e.to_string())?;
    // SAFETY: no argument; WebView2 learns its window moved, so what it
    // draws in windows of its own (a `<select>`'s list) opens in place.
    let _ = unsafe { controller.NotifyParentWindowPositionChanged() };
    Ok(())
}

pub(super) fn show(pw: &PlatformWebview, visible: bool) {
    let Ok((_, page)) = page_window(pw) else {
        return;
    };
    if let Some(clip) = parent(page).filter(|&h| is_clip(h)) {
        // SAFETY: `clip` is the container, a live child window of this
        // thread; showing it without activating passes no memory.
        let _ = unsafe { ShowWindow(clip, if visible { SW_SHOWNA } else { SW_HIDE }) };
    }
}

pub(super) fn release(pw: &PlatformWebview) {
    let Ok((_, page)) = page_window(pw) else {
        return;
    };
    let Some(clip) = parent(page).filter(|&h| is_clip(h)) else {
        return;
    };
    // Back into the window, so that WebView2 closes in the window it was
    // made in and the container goes empty.
    if let Some(window) = parent(clip) {
        // SAFETY: three live windows of this thread; only Windows' tree
        // changes.
        let _ = unsafe { SetParent(page, Some(window)) };
    }
    // SAFETY: `clip` is the container this module made; the page's window
    // left it just above, so destroying it destroys nothing of wry's.
    let _ = unsafe { DestroyWindow(clip) };
}
