// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The iOS and iPadOS app (ADR 0119, Phase 0): where its configuration
//! lives, the folder it opens, and the store of a cloud's secrets.
//!
//! As on Android (`android.rs`), the app's storage is what the system
//! names: Tauri's `app_data_dir` (`Library/Application Support/<id>` in
//! the app's container). `HOME` is the container itself, where an app
//! writes only in its `Documents`, `Library` and `tmp`, so the desktop's
//! `~/.config` is not used. The configuration goes in `<data>/config`, the
//! notes in `<data>/Verso` (B13, decided 2026-11-12), made at the first
//! start and opened by the first window.

use std::path::PathBuf;
use std::sync::OnceLock;

use tauri::Manager;

use crate::log;

/// The app, for what is asked of it outside a command: a page opened in
/// the browser (`open_page`).
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

/// The device's name as UIKit says it, read once at the start.
static DEVICE_NAME: OnceLock<String> = OnceLock::new();

/// Before any window: the configuration directory named, the log begun,
/// the secrets' store set, the app's own folder made if absent and handed
/// to the first window.
pub(crate) fn setup(app: &tauri::App) {
    let data = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => {
            log::write("ERROR", "host", &format!("iOS: no data directory: {e}"));
            return;
        }
    };
    verso_core::set_host_config_dir(data.join("config"));
    log::open();
    forget_old_containers(&data);
    keep_secrets();
    let _ = APP.set(app.handle().clone());
    remember_device_name();
    log::write(
        "INFO",
        "host",
        &format!(
            "started {} ({}) on ios, data in {}",
            env!("CARGO_PKG_VERSION"),
            env!("VERSO_COMMIT"),
            data.display()
        ),
    );
    if let Some(folder) = crate::mobile::own_folder(&data) {
        crate::lock(&app.state::<crate::App>().initial_folder).push_back(folder);
    }
}

/// A cloud's secrets in iOS's Protected Data keychain (keyring 4's Apple
/// store): keyring's own `Entry` refuses iOS, so the store is set on
/// keyring-core, as Android's is.
fn keep_secrets() {
    match apple_native_keyring_store::protected::Store::new() {
        Ok(store) => keyring_core::set_default_store(store),
        Err(e) => log::write(
            "ERROR",
            "host",
            &format!("iOS: no store for a cloud's secrets: {e}"),
        ),
    }
}

/// The device's name (`UIDevice.name`), asked of UIKit on the main thread,
/// where Tauri's setup runs. Since iOS 16 an app without Apple's
/// entitlement for it is told the model ("iPad", "iPhone"), not the name
/// the person gave the device; either is better than `hostname`'s.
fn remember_device_name() {
    let Some(main) = objc2::MainThreadMarker::new() else {
        log::write(
            "WARN",
            "host",
            "iOS: the device's name was not asked off the main thread",
        );
        return;
    };
    let name = objc2_ui_kit::UIDevice::currentDevice(main)
        .name()
        .to_string();
    let name = name.trim();
    if !name.is_empty() {
        let _ = DEVICE_NAME.set(name.to_owned());
    }
}

/// The device's name, once the app has started.
pub(crate) fn device_name() -> Option<String> {
    DEVICE_NAME.get().cloned()
}

/// A page in the person's browser, through Tauri's opener plugin (UIKit's
/// `openURL`; ADR 0119 item 10 (c), decided 2026-11-12).
pub(crate) fn open_page(page: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let app = APP.get().ok_or("the app has not started yet")?;
    app.opener()
        .open_url(page, None::<&str>)
        .map_err(|e| e.to_string())
}

/// A scene iPadOS made for a second window ("New window" on the app's
/// icon, or a window dragged out): the app has one window, so the scene's
/// session is destroyed at once, which closes it, and the first window
/// stays. Without it the new scene showed black: the app opened no window
/// in it (ADR 0119 A18, seen on the maintainer's iPad on 2026-11-12).
pub(crate) fn one_window(scene: &objc2_ui_kit::UIScene) {
    let Some(main) = objc2::MainThreadMarker::new() else {
        return;
    };
    log::write(
        "INFO",
        "host",
        "iOS: a second window was asked for and closed",
    );
    objc2_ui_kit::UIApplication::sharedApplication(main)
        .requestSceneSessionDestruction_options_errorHandler(&scene.session(), None, None);
}

/// The app's container and the directory every install's container is
/// made in, from its data directory
/// (`…/Application/<install>/Library/Application Support/<id>`): each
/// install moves the container, the data with it (seen on the maintainer's
/// iPad: four paths in one day).
pub(crate) fn containers(data: &std::path::Path) -> Option<(PathBuf, PathBuf)> {
    let container = data.ancestors().nth(3)?;
    let under = container.parent()?;
    (under.file_name()? == "Application").then(|| (container.to_path_buf(), under.to_path_buf()))
}

/// The folders opened before at an earlier install's container path are
/// not offered (iOS moves the container at each install, the data with
/// it; seen on the maintainer's iPad, five such paths in one day): the
/// core is told where the installs live (ADR 0119 Phase 0). Their indexes
/// stay on the disk, unused; removing them asks for a disk exception.
fn forget_old_containers(data: &std::path::Path) {
    if let Some((container, under)) = containers(data) {
        verso_core::set_installs(under, container);
    }
}

/// `path` at an earlier install's container, followed into this one's:
/// the same place inside the container, when it is there.
pub(crate) fn in_this_container(
    path: &std::path::Path,
    container: &std::path::Path,
    under: &std::path::Path,
) -> Option<PathBuf> {
    if path.starts_with(container) || !path.starts_with(under) {
        return None;
    }
    let inside: PathBuf = path
        .strip_prefix(under)
        .ok()?
        .components()
        .skip(1)
        .collect();
    let here = container.join(inside);
    here.exists().then_some(here)
}

/// The iOS app's part of the run's events (split from `lib.rs`'s
/// `on_event`, ADR 0067):
/// - a second window the person asked iPadOS for (its icon's "New
///   window"): the app shows one window (no `Can::Windows`), so the new
///   scene is closed again (ADR 0119 A18);
/// - the window's scene active again (tao's `sceneDidBecomeActive`): a
///   server whose port iOS closed while the device was locked, or one due
///   to resume, listens again (ADR 0119 B12/A2); leaving it
///   (`sceneWillResignActive`): when, kept (iOS may end the app before it
///   comes back; ADR 0096 item 1 amended for iOS).
pub(crate) fn on_event<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event: &tauri::RunEvent) {
    match event {
        tauri::RunEvent::SceneRequested { scene, .. } => one_window(scene),
        tauri::RunEvent::WindowEvent {
            event: tauri::WindowEvent::Focused(true),
            ..
        } => crate::local_server::after_resume(app),
        tauri::RunEvent::WindowEvent {
            event: tauri::WindowEvent::Focused(false),
            ..
        } => crate::local_server::before_suspend(app),
        _ => {}
    }
}
