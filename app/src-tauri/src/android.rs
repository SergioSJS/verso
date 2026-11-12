// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The Android app (Phase 0): where its configuration lives, the folder it
//! opens, and the system's certificate check for TLS.
//!
//! An Android app has no `HOME`, no XDG directory and no folder picker that
//! answers with a path: its own storage is what the system's API names
//! (`Context.getDataDir()`, Tauri's `app_data_dir`). The configuration —
//! index sidecars, the log, the session — goes in `<data>/config`, and the
//! notes in the folder `<data>/Verso`, made at the first start and opened
//! by the first window (the window then offers the tutorial, `demo.ts`).

use tauri::Manager;

use crate::log;

/// Before any window: the configuration directory named, the log begun, the
/// app's own folder made if absent and handed to the first window.
pub(crate) fn setup(app: &tauri::App) {
    let data = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => {
            log::write("ERROR", "host", &format!("Android: no data directory: {e}"));
            return;
        }
    };
    verso_core::set_host_config_dir(data.join("config"));
    log::open();
    crate::phone::warm();
    keep_secrets();
    log::write(
        "INFO",
        "host",
        &format!(
            "started {} ({}) on android, data in {}",
            env!("CARGO_PKG_VERSION"),
            env!("VERSO_COMMIT"),
            data.display()
        ),
    );
    if let Some(folder) = crate::mobile::own_folder(&data) {
        crate::lock(&app.state::<crate::App>().initial_folder).push_back(folder);
    }
}

/// A cloud's secrets in Android's store (SharedPreferences sealed by a
/// key of the Android Keystore): its context was handed over by the
/// activity (`Keyring.initializeNdkContext`, MainActivity.kt).
fn keep_secrets() {
    match android_native_keyring_store::Store::new() {
        Ok(store) => keyring_core::set_default_store(store),
        Err(e) => log::write(
            "ERROR",
            "host",
            &format!("Android: no store for a cloud's secrets: {e}"),
        ),
    }
}

/// `MainActivity.initTls(context)`, called by the activity as it is
/// created: every TLS connection of the process checked by the system's
/// own verifier (`rustls-platform-verifier`, which reqwest uses — the
/// updater, the clouds, a server's calls), which needs the app's context
/// once. Without it the first HTTPS request panics in the verifier. The
/// JNI name comes from `jni_mangle`; the JVM is the only caller (an
/// `EnvUnowned` cannot be made in safe Rust).
#[jni::jni_mangle("com.versomd.app.MainActivity")]
pub fn init_tls<'local>(
    mut env: jni::EnvUnowned<'local>,
    _activity: jni::objects::JObject<'local>,
    context: jni::objects::JObject<'local>,
) {
    let outcome = env
        .with_env(|env| rustls_platform_verifier::android::init_with_env(env, context))
        .into_outcome();
    let said = match outcome {
        jni::Outcome::Ok(()) => "INFO Android: the system's certificate check is ready".to_owned(),
        jni::Outcome::Err(e) => format!("ERROR Android: the certificate check failed: {e}"),
        jni::Outcome::Panic(_) => "ERROR Android: the certificate check panicked".to_owned(),
    };
    // The log may not be open yet (the activity comes before Tauri's
    // setup): standard error reaches logcat in a debug build.
    eprintln!("verso-app: {said}");
}
