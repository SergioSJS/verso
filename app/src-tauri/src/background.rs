// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Background sync on a phone (ADR 0118 item 6.3, in v1 since 2026-11-12):
//! an option the person turns on, off by default. While it is on and a
//! folder syncs, the foreground service of serving (item 3.2, its
//! persistent notification) keeps the app alive with Verso off screen, so
//! a folder's sync goes on; with the conditions the person picked — Wi-Fi
//! only, charging only — not met, the sync is held until they are or Verso
//! is on screen again. On screen nothing is ever held. Android tells the
//! conditions (gen/android …/Conditions.kt); the window tells the option
//! at each start and when the person changes it (it keeps it with its
//! settings).

use std::sync::atomic::{AtomicBool, Ordering};

use verso_contract::ContractError;

/// The person's option and its two conditions.
static WANTED: AtomicBool = AtomicBool::new(false);
static WIFI_ONLY: AtomicBool = AtomicBool::new(false);
static CHARGING_ONLY: AtomicBool = AtomicBool::new(false);
/// What Android says: on Wi-Fi, charging, Verso on screen.
static ON_WIFI: AtomicBool = AtomicBool::new(true);
static CHARGING: AtomicBool = AtomicBool::new(true);
static SHOWN: AtomicBool = AtomicBool::new(true);

/// Whether the person turned background sync on.
pub(crate) fn wanted() -> bool {
    WANTED.load(Ordering::Relaxed)
}

/// What holds a sync now, if anything: `None` on screen, with the option
/// off, or with every condition met.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Held {
    /// Waiting for Wi-Fi.
    Wifi,
    /// Waiting for the charger.
    Charger,
}

/// [`Held`] from the values, for the tests.
fn held_by(shown: bool, wanted: bool, wifi: (bool, bool), charging: (bool, bool)) -> Option<Held> {
    // Off, Android itself stops the app off screen, as before the option
    // (item 6.1): nothing is held here.
    if shown || !wanted {
        return None;
    }
    if wifi.0 && !wifi.1 {
        return Some(Held::Wifi);
    }
    if charging.0 && !charging.1 {
        return Some(Held::Charger);
    }
    None
}

/// What holds a folder's sync now. Only a phone tells it: on a desktop
/// nothing ever does.
pub(crate) fn held() -> Option<Held> {
    held_by(
        SHOWN.load(Ordering::Relaxed),
        wanted(),
        (
            WIFI_ONLY.load(Ordering::Relaxed),
            ON_WIFI.load(Ordering::Relaxed),
        ),
        (
            CHARGING_ONLY.load(Ordering::Relaxed),
            CHARGING.load(Ordering::Relaxed),
        ),
    )
}

/// Background sync on or off, with its conditions (the window keeps them
/// and tells them at each start). A no-op on a desktop.
#[tauri::command]
#[specta::specta]
pub(crate) fn set_background_sync<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    on: bool,
    wifi_only: bool,
    charging_only: bool,
) -> Result<(), ContractError> {
    let was = (
        wanted(),
        WIFI_ONLY.load(Ordering::Relaxed),
        CHARGING_ONLY.load(Ordering::Relaxed),
    );
    WANTED.store(on, Ordering::Relaxed);
    WIFI_ONLY.store(wifi_only, Ordering::Relaxed);
    CHARGING_ONLY.store(charging_only, Ordering::Relaxed);
    if was != (on, wifi_only, charging_only) {
        crate::log::write(
            "INFO",
            "sync",
            &format!(
                "background sync: {on} (Wi-Fi only: {wifi_only}, charging only: {charging_only})"
            ),
        );
        changed(&app);
    }
    Ok(())
}

/// The option or a condition changed: each folder's sync looks again, and
/// the service follows.
fn changed<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    let syncs: Vec<_> = verso_service::lock(&app.state::<crate::App>().syncs)
        .values()
        .cloned()
        .collect();
    for s in syncs {
        s.poke();
    }
    #[cfg(target_os = "android")]
    crate::phone::follow(app);
}

/// The app, for what Android tells from its own threads.
#[cfg(target_os = "android")]
static APP: std::sync::OnceLock<tauri::AppHandle<tauri::Wry>> = std::sync::OnceLock::new();

/// Kept at the start, before Android tells anything that matters.
#[cfg(target_os = "android")]
pub(crate) fn keep(app: &tauri::AppHandle<tauri::Wry>) {
    let _ = APP.set(app.clone());
}

/// Told on Android's main thread: the work goes elsewhere (the plugin the
/// service follows through answers on that thread).
#[cfg(target_os = "android")]
fn tell() {
    if let Some(app) = APP.get() {
        let app = app.clone();
        tauri::async_runtime::spawn(async move { changed(&app) });
    }
}

/// `Conditions.told(wifi, charging)`: the phone's network and charger.
/// The JNI name comes from `jni_mangle`; nothing of JNI is used.
#[cfg(target_os = "android")]
#[jni::jni_mangle("com.versomd.app.Conditions")]
pub fn told<'local>(
    _env: jni::EnvUnowned<'local>,
    _class: jni::objects::JClass<'local>,
    wifi: jni::sys::jboolean,
    charging: jni::sys::jboolean,
) {
    let was = (
        ON_WIFI.swap(wifi, Ordering::Relaxed),
        CHARGING.swap(charging, Ordering::Relaxed),
    );
    if was != (wifi, charging) {
        tell();
    }
}

/// `Conditions.shown(on)`: Verso on screen or not.
#[cfg(target_os = "android")]
#[jni::jni_mangle("com.versomd.app.Conditions")]
pub fn shown<'local>(
    _env: jni::EnvUnowned<'local>,
    _class: jni::objects::JClass<'local>,
    on: jni::sys::jboolean,
) {
    if SHOWN.swap(on, Ordering::Relaxed) != on {
        tell();
    }
}

#[cfg(test)]
mod tests {
    use super::{Held, held_by};

    #[test]
    fn on_screen_nothing_is_held_and_off_screen_the_conditions_hold() {
        // On screen: never held, whatever the option and the conditions.
        assert_eq!(held_by(true, false, (true, false), (true, false)), None);
        // Off screen, the option off: Android's to stop, not held here.
        assert_eq!(held_by(false, false, (true, false), (true, false)), None);
        // Off screen, the option on, no condition: syncs.
        assert_eq!(held_by(false, true, (false, false), (false, false)), None);
        // Wi-Fi only, on the carrier's network: waits for Wi-Fi.
        assert_eq!(
            held_by(false, true, (true, false), (false, false)),
            Some(Held::Wifi)
        );
        // Charging only, off the charger: waits for it.
        assert_eq!(
            held_by(false, true, (true, true), (true, false)),
            Some(Held::Charger)
        );
        assert_eq!(held_by(false, true, (true, true), (true, true)), None);
    }
}
