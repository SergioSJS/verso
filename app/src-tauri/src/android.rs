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

use std::path::PathBuf;

use tauri::Manager;

use crate::log;

/// The folder the phone keeps its notes in, in the app's own storage.
const OWN_FOLDER: &str = "Verso";

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
    if let Some(folder) = own_folder(&data) {
        crate::lock(&app.state::<crate::App>().initial_folder).push_back(folder);
    }
}

/// `<data>/Verso`, made the first time (verso-fs makes it, as a server
/// makes a folder: ADR 0026 rule 5).
fn own_folder(data: &std::path::Path) -> Option<PathBuf> {
    match verso_fs::server::make_folder(data, OWN_FOLDER) {
        Ok(made) => {
            log::write("INFO", "host", "Android: the app's own folder made");
            Some(made)
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Some(data.join(OWN_FOLDER)),
        Err(e) => {
            log::write(
                "ERROR",
                "host",
                &format!("Android: the app's own folder could not be made: {e}"),
            );
            None
        }
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
