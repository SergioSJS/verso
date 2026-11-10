// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the Android app asks of Android itself (ADR 0118 item 7): the
//! phone's name, its DNS servers and the directory of its native
//! libraries — facts an Android app gets through the system's API, not
//! from a file or a command (`hostname` answers `localhost`, there is no
//! `/etc/resolv.conf`) — and a page opened in the person's browser (there
//! is no `xdg-open`). The Android side is a plugin of the app's own
//! (gen/android …/PhonePlugin.kt), reached through Tauri's plugin handle.

use std::sync::OnceLock;

use crate::log;

/// The plugin's handle, kept for the whole process once Tauri made it.
static HANDLE: OnceLock<tauri::plugin::PluginHandle<tauri::Wry>> = OnceLock::new();

/// What the phone says of itself, asked once.
#[derive(Debug, Default, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Facts {
    pub(crate) device_name: String,
    pub(crate) dns_servers: Vec<String>,
    pub(crate) native_library_dir: String,
    pub(crate) sdk: u32,
}

/// The plugin, registered with the app's other plugins.
pub(crate) fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("verso-phone")
        .setup(|_app, api| {
            let handle = api.register_android_plugin("com.versomd.app", "PhonePlugin")?;
            let _ = HANDLE.set(handle);
            Ok(())
        })
        .build()
}

/// Run `method` of the Kotlin plugin with `args`.
pub(crate) fn call<T: serde::de::DeserializeOwned>(
    method: &str,
    args: impl serde::Serialize,
) -> Result<T, String> {
    let handle = HANDLE.get().ok_or("the phone's plugin is not ready")?;
    handle
        .run_mobile_plugin::<T>(method, args)
        .map_err(|e| e.to_string())
}

/// The phone's facts: asked of Android the first time, kept after. Before
/// the plugin is ready (or if Android does not answer) the defaults, said
/// in the log, and asked again next time.
pub(crate) fn facts() -> Facts {
    static KEPT: OnceLock<Facts> = OnceLock::new();
    if let Some(kept) = KEPT.get() {
        return kept.clone();
    }
    match call::<Facts>("facts", ()) {
        Ok(facts) => KEPT.get_or_init(|| facts).clone(),
        Err(e) => {
            log::write(
                "WARN",
                "host",
                &format!("Android: no facts of the phone: {e}"),
            );
            Facts::default()
        }
    }
}

/// The phone's name for servers and conflict copies: the one the person
/// gave it, else its model.
pub(crate) fn device_name() -> Option<String> {
    let name = facts().device_name;
    (!name.trim().is_empty()).then(|| name.trim().to_owned())
}

/// The DNS servers of the network the phone is on (ADR 0097's second
/// resolver round).
pub(crate) fn dns_servers() -> Vec<std::net::IpAddr> {
    facts()
        .dns_servers
        .iter()
        .filter_map(|s| s.parse().ok())
        .collect()
}

/// A page in the person's browser.
pub(crate) fn open_page(url: &str) -> Result<(), String> {
    #[derive(serde::Serialize)]
    struct Page<'a> {
        url: &'a str,
    }
    call::<serde_json::Value>("openUrl", Page { url }).map(|_| ())
}

/// The facts asked once the app is up, away from the main thread (the
/// plugin answers on Android's UI thread, which the setup holds).
pub(crate) fn warm() {
    std::thread::spawn(|| {
        let facts = facts();
        log::write(
            "INFO",
            "host",
            &format!(
                "Android {}: {} DNS servers, libraries in {}",
                facts.sdk,
                facts.dns_servers.len(),
                facts.native_library_dir
            ),
        );
    });
}
