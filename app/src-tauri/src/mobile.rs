// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Where the app on a phone parts from the desktop's (the Android app,
//! Phase 0): each seam in one place, the desktop's side unchanged, the
//! phone's a no-op or a refusal in words. Tauri's `desktop` and `mobile`
//! cfgs (set by tauri-build) choose the side. What a phone lacks — a
//! window over another, a sheet on a window, a second instance, a view
//! inside a view, a folder picker — Tauri does not build there at all.

use std::path::PathBuf;

use tauri_plugin_dialog::FileDialogBuilder;
use verso_contract::{Can, ContractError, Host};

/// What this app is, for the window (ADR 0118): the window draws its frame
/// and offers the tutorial from this, never from the user agent.
#[cfg(desktop)]
pub(crate) const HOST: Host = Host::Desktop;
#[cfg(mobile)]
pub(crate) const HOST: Host = Host::Mobile;

/// What the phone does not offer (ADR 0027: the window hides what is
/// absent): no shell, no audio capture, no second window, no page inside
/// a note, no agents' command line, no app updates of its own (the store
/// or the APK updates it), no file manager to show a file in.
#[cfg(mobile)]
const NOT_ON_A_PHONE: [Can; 7] = [
    Can::Terminal,
    Can::AudioShare,
    Can::Windows,
    Can::WebViews,
    Can::Agents,
    Can::Updates,
    Can::Reveal,
];

/// What this app can do in a window of its own (not a server's): every
/// ability of the window on the desktop, the window of loose files without
/// those of a folder (ADR 0114 items 18 and 25); a phone without what it
/// does not have ([`NOT_ON_A_PHONE`]). It stays a server and opens its own
/// folders (decided 2026-11-08).
pub(crate) fn local_can(loose: bool) -> Vec<Can> {
    let mut can = vec![
        Can::Write,
        Can::Reveal,
        Can::CopyPath,
        Can::Windows,
        Can::WebViews,
        Can::Agents,
        Can::Updates,
        Can::Devtools,
        Can::LocalFolders,
    ];
    if loose {
        can.retain(|c| !matches!(c, Can::Reveal | Can::CopyPath));
    } else {
        can.extend_from_slice(Can::FOLDER);
        // A shell of this computer (ADR 0115 item 6): never in a window of
        // files opened without their folder (ADR 0114 item 9).
        can.push(Can::Terminal);
        // Capture is the desktop host's alone (ADR 0116 item 27).
        can.push(Can::AudioShare);
    }
    #[cfg(mobile)]
    can.retain(|c| !NOT_ON_A_PHONE.contains(c));
    can
}

/// A file dialog over its window: a sheet of that window on the desktop.
#[cfg(desktop)]
pub(crate) fn dialog_over<R: tauri::Runtime>(
    dialog: FileDialogBuilder<R>,
    window: &tauri::Window<R>,
) -> FileDialogBuilder<R> {
    dialog.set_parent(window)
}

/// The phone's picker covers the screen: it has no parent.
#[cfg(mobile)]
pub(crate) fn dialog_over<R: tauri::Runtime>(
    dialog: FileDialogBuilder<R>,
    _window: &tauri::Window<R>,
) -> FileDialogBuilder<R> {
    dialog
}

/// Bring a window forward: out of the dock first on the desktop.
pub(crate) fn raise<R: tauri::Runtime>(window: &tauri::Window<R>) {
    #[cfg(desktop)]
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// The system's folder picker, over `window`: the folder chosen, `None`
/// when it was cancelled.
#[cfg(desktop)]
pub(crate) async fn pick_folder<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
) -> Result<Option<PathBuf>, ContractError> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    dialog_over(app.dialog().file(), window).pick_folder(move |picked| {
        let _ = tx.try_send(picked);
    });
    let Some(picked) = rx.recv().await.flatten() else {
        return Ok(None);
    };
    picked
        .into_path()
        .map(Some)
        .map_err(|e| crate::failed(e.to_string()))
}

/// A phone has no folder picker of this kind (Android's folder picker
/// answers with a content address, not a path): the app opens the folder
/// it keeps in its own storage ([`own_folder`]).
#[cfg(mobile)]
pub(crate) async fn pick_folder<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _window: &tauri::Window<R>,
) -> Result<Option<PathBuf>, ContractError> {
    Err(verso_service::refused(
        "on the phone, Verso opens the folder it keeps in its own storage",
    ))
}

/// The app as Tauri builds it: on the desktop, one per user, a second
/// launch handing its folder to the running one (ADR 0042); a phone's
/// system already keeps one.
#[cfg(desktop)]
pub(crate) fn builder() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default().plugin(tauri_plugin_single_instance::init(
        crate::loose::second_launch,
    ))
}

#[cfg(mobile)]
pub(crate) fn builder() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default()
}

/// Before a restart: the single instance let go, or the new process would
/// hand itself to the old one and exit.
pub(crate) fn release_instance<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    #[cfg(desktop)]
    tauri_plugin_single_instance::destroy(app);
    #[cfg(mobile)]
    let _ = app;
}

/* ---------- Pages inside a note: child web views, the desktop's ---------- */

/// A page's view inside `window`, at `position` and `size`.
#[cfg(desktop)]
pub(crate) fn add_view<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    view: tauri::webview::WebviewBuilder<R>,
    position: tauri::LogicalPosition<f64>,
    size: tauri::LogicalSize<f64>,
) -> tauri::Result<tauri::Webview<R>> {
    window.add_child(view, position, size)
}

/// A phone shows one view per window: a page opens outside the app
/// (`Can::WebViews` is absent, the window does not ask).
#[cfg(mobile)]
pub(crate) fn add_view<R: tauri::Runtime>(
    _window: &tauri::Window<R>,
    _view: tauri::webview::WebviewBuilder<R>,
    _position: tauri::LogicalPosition<f64>,
    _size: tauri::LogicalSize<f64>,
) -> tauri::Result<tauri::Webview<R>> {
    Err(tauri::Error::Io(std::io::Error::other(
        "pages inside a note are not shown on the phone",
    )))
}

/// Show or hide a page's view.
#[cfg(desktop)]
pub(crate) fn show_view<R: tauri::Runtime>(
    view: &tauri::Webview<R>,
    visible: bool,
) -> tauri::Result<()> {
    if visible { view.show() } else { view.hide() }
}

#[cfg(mobile)]
pub(crate) fn show_view<R: tauri::Runtime>(
    _view: &tauri::Webview<R>,
    _visible: bool,
) -> tauri::Result<()> {
    Ok(())
}

/// Close a page's view.
#[cfg(desktop)]
pub(crate) fn close_view<R: tauri::Runtime>(view: &tauri::Webview<R>) -> tauri::Result<()> {
    view.close()
}

#[cfg(mobile)]
pub(crate) fn close_view<R: tauri::Runtime>(_view: &tauri::Webview<R>) -> tauri::Result<()> {
    Ok(())
}

/// Put a page's view at `position`, `size` big.
#[cfg(desktop)]
pub(crate) fn place_view<R: tauri::Runtime>(
    view: &tauri::Webview<R>,
    position: tauri::LogicalPosition<f64>,
    size: tauri::LogicalSize<f64>,
) -> tauri::Result<()> {
    view.set_position(position)
        .and_then(|()| view.set_size(size))
}

#[cfg(mobile)]
pub(crate) fn place_view<R: tauri::Runtime>(
    _view: &tauri::Webview<R>,
    _position: tauri::LogicalPosition<f64>,
    _size: tauri::LogicalSize<f64>,
) -> tauri::Result<()> {
    Ok(())
}
