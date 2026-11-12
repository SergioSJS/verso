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
