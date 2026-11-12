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

/// What the Android app does not offer (ADR 0027: the window hides what
/// is absent): no shell, no second window, no page inside a note, no
/// agents' command line, no file manager to show a file in, no file opened
/// without its folder (Android's picker hands a content:// file the app
/// does not open yet: Phase 2, decided 2026-11-10). A sideloaded APK keeps
/// its updater (item 5, decided 2026-11-10), and shares its other apps'
/// sound at the table (item 5, decided 2026-11-12).
#[cfg(any(test, target_os = "android"))]
const OFF_ON_ANDROID: &[Can] = &[
    Can::LooseFiles,
    Can::Terminal,
    Can::Windows,
    Can::WebViews,
    Can::Agents,
    Can::Reveal,
];

/// What the iOS app does not offer: Android's list (ADR 0119 B14, decided
/// 2026-11-12), the capture of other apps' sound, no updater (AltStore's
/// source, or a store, updates the app), and none of the app server's
/// three abilities (A13, decided 2026-11-12): no internet link (A3), no
/// mDNS (A4), no serving off the screen (A2).
#[cfg(any(test, target_os = "ios"))]
const OFF_ON_IOS: &[Can] = &[
    Can::LooseFiles,
    Can::Terminal,
    Can::AudioShare,
    Can::Windows,
    Can::WebViews,
    Can::Agents,
    Can::Reveal,
    Can::Updates,
    Can::Link,
    Can::Discover,
    Can::ServeAway,
];

/// What this platform's app leaves out of the window's list.
#[cfg(desktop)]
const OFF_HERE: &[Can] = &[];
#[cfg(target_os = "android")]
const OFF_HERE: &[Can] = OFF_ON_ANDROID;
#[cfg(target_os = "ios")]
const OFF_HERE: &[Can] = OFF_ON_IOS;

/// What this app can do in a window of its own (not a server's): every
/// ability of the window on the desktop, the window of loose files without
/// those of a folder (ADR 0114 items 18 and 25); a phone without what it
/// does not have ([`OFF_HERE`]). It stays a server and opens its own
/// folders (decided 2026-11-08).
pub(crate) fn local_can(loose: bool) -> Vec<Can> {
    can_without(loose, OFF_HERE)
}

/// [`local_can`] for a platform that leaves `off` out.
fn can_without(loose: bool, off: &[Can]) -> Vec<Can> {
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
        Can::LooseFiles,
    ];
    // This app as a server, whatever its window shows (ADR 0119 A13).
    can.extend_from_slice(Can::APP_SERVER);
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
    can.retain(|c| !off.contains(c));
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
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(crate::phone::plugin());
    builder
}

/// A page in the person's browser: the system's opener on a desktop, an
/// Android intent on a phone (`xdg-open` is not there). An iOS app starts
/// no program: a refusal in words until the app asks UIKit to open it
/// (ADR 0119, Phase 0 lists it).
pub(crate) fn open_in_browser(page: &str) -> Result<(), ContractError> {
    #[cfg(target_os = "android")]
    return crate::phone::open_page(page).map_err(crate::failed);
    #[cfg(target_os = "ios")]
    {
        let _ = page;
        Err(verso_service::refused(
            "on the iPhone or iPad, Verso does not open a page in the browser yet",
        ))
    }
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(windows)]
    let mut command = std::process::Command::new("explorer");
    #[cfg(not(any(target_os = "macos", windows, mobile)))]
    let mut command = std::process::Command::new("xdg-open");
    #[cfg(not(mobile))]
    command
        .arg(page)
        .spawn()
        .map(|_| ())
        .map_err(|e| crate::failed(e.to_string()))
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

/* ---------- The phone's status bar follows the window's theme ---------- */

/// The status bar's and the navigation bar's icons, dark on a light page
/// and light on a dark one: the window says which (the maintainer,
/// 2026-11-10: in Verso's dark theme on a phone in light mode the bar's
/// dark icons sat on the dark page). The Android side is a plugin of the
/// app's own (gen/android …/StatusBarPlugin.kt), reached through Tauri's
/// plugin handle, not a JavaScript interface.
pub(crate) fn bars_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("verso-bars")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = _api.register_android_plugin("com.versomd.app", "StatusBarPlugin")?;
                _app.manage(Bars(handle));
            }
            Ok(())
        })
        .build()
}

#[cfg(target_os = "android")]
struct Bars<R: tauri::Runtime>(tauri::plugin::PluginHandle<R>);

/// The bars' icons for a page that is `dark`: a no-op where the system
/// draws no bar over the window (the desktop).
#[tauri::command]
#[specta::specta]
pub(crate) fn set_bars_dark<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    dark: bool,
) -> Result<(), ContractError> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        #[derive(serde::Serialize)]
        struct Args {
            dark: bool,
        }
        if let Some(bars) = app.try_state::<Bars<R>>()
            && let Err(e) = bars.0.run_mobile_plugin::<()>("setDark", Args { dark })
        {
            crate::log::write(
                "WARN",
                "bars",
                &format!("the status bar's icons were not set: {e}"),
            );
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = (app, dark);
    Ok(())
}

/* ---------- The app's own folder and the WebSocket's TLS on a phone ---------- */

/// The folder a phone or tablet keeps its notes in, in the app's own
/// storage (Android ADR 0118 item 4.1; iOS ADR 0119 B13).
#[cfg(mobile)]
const OWN_FOLDER: &str = "Verso";

/// `<data>/Verso`, made the first time (verso-fs makes it, as a server
/// makes a folder: ADR 0026 rule 5).
#[cfg(mobile)]
pub(crate) fn own_folder(data: &std::path::Path) -> Option<PathBuf> {
    match verso_fs::server::make_folder(data, OWN_FOLDER) {
        Ok(made) => {
            crate::log::write("INFO", "host", "the app's own folder made");
            Some(made)
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Some(data.join(OWN_FOLDER)),
        Err(e) => {
            crate::log::write(
                "ERROR",
                "host",
                &format!("the app's own folder could not be made: {e}"),
            );
            None
        }
    }
}

/// The WebSocket's TLS on a phone: the system's own certificate check
/// (on Android the verifier `android::init_tls` readied; iOS's needs no
/// setup), on `ring` as every TLS of this app. `tokio-tungstenite` left
/// alone looks for the root certificates in files (`rustls-native-certs`,
/// `openssl-probe`), which neither Android nor iOS has: every `wss://`
/// failed (ADR 0118 item 7, "TLS"; ADR 0119 §9). Made once; `None` (said
/// in the log) when the verifier is not there, and the dial then fails as
/// before, in words.
#[cfg(mobile)]
pub(crate) fn ws_connector() -> Option<tokio_tungstenite::Connector> {
    use std::sync::{Arc, OnceLock};
    static MADE: OnceLock<Option<Arc<rustls::ClientConfig>>> = OnceLock::new();
    MADE.get_or_init(|| {
        use rustls_platform_verifier::BuilderVerifierExt;
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let made = rustls::ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .and_then(|b| b.with_platform_verifier())
            .map(|b| Arc::new(b.with_no_client_auth()));
        match made {
            Ok(config) => Some(config),
            Err(e) => {
                crate::log::write(
                    "ERROR",
                    "host",
                    &format!("no TLS for a server's WebSocket: {e}"),
                );
                None
            }
        }
    })
    .clone()
    .map(tokio_tungstenite::Connector::Rustls)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The desktop lists the app server's three abilities, in a folder's
    /// window and in one of loose files (ADR 0119 A13).
    #[test]
    fn the_desktop_serves_with_the_link_the_network_and_off_screen() {
        for loose in [false, true] {
            let can = can_without(loose, &[]);
            assert!(Can::APP_SERVER.iter().all(|c| can.contains(c)), "{can:?}");
        }
    }

    /// Android keeps them all, its updater and the sound's capture; it
    /// leaves out what it has not (ADR 0118 item 5).
    #[test]
    fn android_keeps_the_app_servers_abilities() {
        let can = can_without(false, OFF_ON_ANDROID);
        assert!(Can::APP_SERVER.iter().all(|c| can.contains(c)), "{can:?}");
        assert!(can.contains(&Can::Updates) && can.contains(&Can::AudioShare));
        assert!(!can.contains(&Can::Terminal) && !can.contains(&Can::Windows));
    }

    /// iOS lists none of them, no updater and no capture, and keeps the
    /// folder's abilities and the server on the network (ADR 0119 A13,
    /// B12, B14).
    #[test]
    fn ios_serves_only_on_the_network_while_on_screen() {
        let can = can_without(false, OFF_ON_IOS);
        assert!(Can::APP_SERVER.iter().all(|c| !can.contains(c)), "{can:?}");
        assert!(!can.contains(&Can::Updates) && !can.contains(&Can::AudioShare));
        assert!(Can::FOLDER.iter().all(|c| can.contains(c)));
        assert!(can.contains(&Can::Write) && can.contains(&Can::LocalFolders));
    }
}
