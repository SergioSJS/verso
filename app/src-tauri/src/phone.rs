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
    /// The top of the shared storage (`/storage/emulated/0`).
    #[serde(default)]
    pub(crate) shared_storage: String,
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

static KEPT: OnceLock<Facts> = OnceLock::new();

/// The phone's facts if they were asked already; never asks (a caller on
/// the main thread, which the plugin answers on, must not wait for it).
pub(crate) fn facts_kept() -> Option<Facts> {
    KEPT.get().cloned()
}

/// The phone's facts: asked of Android the first time, kept after. Before
/// the plugin is ready (or if Android does not answer) the defaults, said
/// in the log, and asked again next time.
pub(crate) fn facts() -> Facts {
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

/// The window's files a phone serves to its devices, out of the APK's
/// assets (where `resource_dir()` points, not a directory): copied into
/// `<config>/ui-web` once per installed version by the plugin.
pub(crate) fn ui_dir(config: &std::path::Path) -> Option<std::path::PathBuf> {
    #[derive(serde::Serialize)]
    struct To {
        to: String,
    }
    #[derive(serde::Deserialize)]
    struct Copied {
        path: String,
    }
    let to = config.join("ui-web").to_string_lossy().into_owned();
    match call::<Copied>("copyUi", To { to }) {
        Ok(copied) => Some(copied.path.into()),
        Err(e) => {
            log::write(
                "ERROR",
                "host",
                &format!("Android: the window's files for the devices were not copied: {e}"),
            );
            None
        }
    }
}

/// Multicast lock `name` held (`on`) or let go: mDNS reaches the app only
/// while one is held (ADR 0118 item 3.1).
pub(crate) fn multicast(name: &str, on: bool) {
    #[derive(serde::Serialize)]
    struct Lock<'a> {
        name: &'a str,
        on: bool,
    }
    if let Err(e) = call::<serde_json::Value>("multicast", Lock { name, on }) {
        log::write("WARN", "host", &format!("Android: multicast {name}: {e}"));
    }
}

/// The serving notification's words, in the window's language: what is
/// served, to how many devices, that it drains the battery (ADR 0118 item
/// 3.5); and the channel's name.
pub(crate) fn serving_words(
    lang: &str,
    folders: usize,
    devices: u32,
    link: bool,
) -> (String, String, &'static str) {
    if lang == "en" {
        let what = match folders {
            1 => "1 folder".to_owned(),
            n => format!("{n} folders"),
        };
        let who = match devices {
            0 => "No device connected".to_owned(),
            1 => "1 device connected".to_owned(),
            n => format!("{n} devices connected"),
        };
        let how = if link {
            ", on the network and by the internet link"
        } else {
            " on the network"
        };
        (
            format!("Verso is serving {what}"),
            format!(
                "{who}{how}. Serving keeps the phone awake: it drains the battery and warms the phone; keep it charging."
            ),
            "Serving",
        )
    } else {
        let what = match folders {
            1 => "1 pasta".to_owned(),
            n => format!("{n} pastas"),
        };
        let who = match devices {
            0 => "Nenhum aparelho conectado".to_owned(),
            1 => "1 aparelho conectado".to_owned(),
            n => format!("{n} aparelhos conectados"),
        };
        let how = if link {
            ", na rede e pelo link da internet"
        } else {
            " na rede"
        };
        (
            format!("O Verso está servindo {what}"),
            format!(
                "{who}{how}. Servir mantém o celular acordado: gasta bateria e esquenta; deixe-o carregando."
            ),
            "Servindo",
        )
    }
}

/// The foreground service follows serving (ADR 0118 item 3.2): on, with
/// its words, while the server serves on the network or the link is up;
/// off when neither. Off the thread that said it (it may hold the server's
/// locks).
pub(crate) fn follow<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (on, folders, devices) = crate::local_server::serving_now(&app).unwrap_or_default();
        let link = crate::tunnel::link_up(&app);
        let lang = verso_service::lock(&app.state::<crate::App>().menu_language).clone();
        let (title, text, channel) = serving_words(&lang, folders, devices, link);
        #[derive(serde::Serialize)]
        struct Serve {
            on: bool,
            title: String,
            text: String,
            channel: &'static str,
        }
        let serve = Serve {
            on: on || link,
            title,
            text,
            channel,
        };
        if let Err(e) = call::<serde_json::Value>("serve", serve) {
            log::write(
                "ERROR",
                "host",
                &format!("Android: the serving service: {e}"),
            );
        }
    });
}

/// A downloaded, checked APK handed to Android's own install prompt
/// (ADR 0118 item 5): the person confirms there; the first time, Android
/// asks to allow installs from Verso.
pub(crate) fn install_apk(path: &std::path::Path) -> Result<(), String> {
    #[derive(serde::Serialize)]
    struct Apk {
        path: String,
    }
    call::<serde_json::Value>(
        "installApk",
        Apk {
            path: path.to_string_lossy().into_owned(),
        },
    )
    .map(|_| ())
}
