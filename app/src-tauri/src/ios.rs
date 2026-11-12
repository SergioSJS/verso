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

use tauri::Manager;

use crate::log;

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
