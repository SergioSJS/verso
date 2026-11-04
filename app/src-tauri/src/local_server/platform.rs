//! The commands over `verso_server::local::LocalServer`, on every system.

use verso_server::db::Role;
use verso_server::local::{Event, LocalServer, LocalSettings};

use super::*;

/// The server of the mode, made on first use: its database and indexes in
/// the configuration directory (ADR 0096 item 16), the window's files from
/// the app's resources (and, in a debug build, the build next to the
/// source).
pub(super) fn server<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<LocalServer, ContractError> {
    let state = app.state::<App>();
    if let Some(s) = state.local_server.server.get() {
        return Ok(s.clone());
    }
    let config = match state.service.config() {
        Some(dir) => dir.to_path_buf(),
        None => verso_core::config_dir().map_err(verso_service::convert)?,
    };
    let mut ui = Vec::new();
    if let Ok(resources) = app.path().resource_dir() {
        ui.push(resources.join("ui-web"));
    }
    #[cfg(debug_assertions)]
    ui.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui/dist"));
    let events = app.clone();
    let sink = Arc::new(move |event: Event| {
        // Serving stopped by itself (the network changed): the link's
        // tunnel has nothing left to reach (ADR 0117 D3 item 6).
        if matches!(event, Event::Stopped { .. }) {
            crate::tunnel::stop_with(&events, crate::tunnel::LinkEnd::Stopped);
        }
        let _ = events.emit("local-server", &event);
        // The mark in the menu bar or the tray follows (macOS, Windows).
        #[cfg(any(target_os = "macos", windows))]
        crate::tray::follow(&events);
    });
    let made = LocalServer::new(config.join("local-server"), ui, env!("VERSO_COMMIT"), sink);
    Ok(state.local_server.server.get_or_init(|| made).clone())
}

/// `f` off the async threads (it opens a database and may start a
/// runtime), its words of failure as the contract's.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, ContractError> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| failed(e.to_string()))?
        .map_err(|words| {
            log::write("WARN", "host", &format!("serving to a phone: {words}"));
            refused(&words)
        })
}

fn host_of(url: &str) -> String {
    url.split_once("://")
        .map_or(url, |(_, rest)| rest)
        .trim_end_matches('/')
        .to_owned()
}

fn status_of(local: &LocalServer) -> Result<LocalServerStatus, String> {
    let s = local.status()?;
    let set = local.settings()?;
    Ok(LocalServerStatus {
        supported: true,
        serving: s.serving,
        port: s.port.map(u32::from),
        addresses: s.addresses,
        phones_paired: u32::try_from(s.phones_paired).unwrap_or(u32::MAX),
        phones_connected: u32::try_from(s.phones_connected).unwrap_or(u32::MAX),
        pairing_open: s.pairing_open,
        fingerprint: s.fingerprint,
        certificate: s.certificate,
        tailscale: s.tailscale,
        stopped_because: s.stopped_because,
        unreachable: s.unreachable,
        keep_on: set.keep_on,
        cert_file: set.cert_file,
        key_file: set.key_file,
        host_name: set.host_name,
        max_connected: set.max_connected,
        dropped: s
            .dropped
            .iter()
            .map(|(folder, part)| {
                let name = Path::new(folder)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                format!("{name}/{part}")
            })
            .collect(),
    })
}

pub(super) async fn status<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || status_of(&local)).await
}

/// The folders this computer has opened, ticked or not, and which of them
/// also sync with a server (and so cannot be served).
fn rows<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    local: &LocalServer,
) -> Result<Vec<LocalFolder>, String> {
    let state = app.state::<App>();
    let config = state.service.config();
    let settings = local.settings()?;
    let dropped = local.status()?.dropped;
    let ticked = settings.folders;
    Ok(verso_core::recent_folders(config)
        .into_iter()
        .map(|path| {
            let key = verso_core::folder_key(&path);
            let is_ticked = ticked.iter().any(|t| *t == path.to_string_lossy());
            let parts = settings
                .parts
                .get(path.to_string_lossy().as_ref())
                .cloned()
                .unwrap_or_default();
            LocalFolder {
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                place: path
                    .parent()
                    .and_then(|p| p.file_name())
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                ticked: is_ticked,
                parts: parts.clone(),
                missing: dropped
                    .iter()
                    .filter(|(folder, _)| *folder == path.to_string_lossy())
                    .map(|(_, part)| part.clone())
                    .collect(),
                attachments: if parts.is_empty() || !is_ticked {
                    None
                } else {
                    verso_core::served_attachments(&path, &parts)
                },
                syncs_with: sync::synced(config, &key).map(|s| host_of(&s.server)),
                key,
            }
        })
        .collect())
}

pub(super) async fn folders<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalFolder>, ContractError> {
    let local = server(&app)?;
    blocking(move || rows(&app, &local)).await
}

pub(super) async fn tick<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
    ticked: bool,
) -> Result<Vec<LocalFolder>, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        if local.status()?.serving {
            return Err("turn serving off to change which folders are served".to_owned());
        }
        let state = app.state::<App>();
        let config = state.service.config();
        let path = verso_core::recent_folders(config)
            .into_iter()
            .find(|p| verso_core::folder_key(p) == key)
            .ok_or_else(|| "this computer does not know that folder".to_owned())?;
        if ticked && let Some(s) = sync::synced(config, &key) {
            return Err(format!(
                "this folder also syncs with {}: open that address on the phone instead",
                host_of(&s.server)
            ));
        }
        let mut settings = local.settings()?;
        let text = path.to_string_lossy().into_owned();
        settings.folders.retain(|f| *f != text);
        // What was chosen inside a folder is forgotten with its untick;
        // ticking it again while it is ticked changes nothing.
        if !ticked {
            settings.parts.remove(&text);
            local.forget_dropped()?;
        }
        if ticked {
            settings.folders.push(text);
        }
        local.set_settings(&settings)?;
        rows(&app, &local)
    })
    .await
}

/// The directory of the folder this computer knows by `key`.
fn known_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &str) -> Result<PathBuf, String> {
    let state = app.state::<App>();
    verso_core::recent_folders(state.service.config())
        .into_iter()
        .find(|p| verso_core::folder_key(p) == key)
        .ok_or_else(|| "this computer does not know that folder".to_owned())
}

pub(super) async fn subfolders<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
) -> Result<Vec<String>, ContractError> {
    blocking(move || {
        let path = known_path(&app, &key)?;
        verso_core::subfolders_of(&path).map_err(|e| e.to_string())
    })
    .await
}

pub(super) async fn parts<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
    parts: Vec<String>,
) -> Result<Vec<LocalFolder>, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        let path = known_path(&app, &key)?;
        local.set_parts(&path.to_string_lossy(), &parts)?;
        rows(&app, &local)
    })
    .await
}

pub(super) async fn whole<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
) -> Result<Vec<LocalFolder>, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        let path = known_path(&app, &key)?;
        local.set_whole(&path.to_string_lossy())?;
        rows(&app, &local)
    })
    .await
}

pub(super) async fn settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    keep_on: bool,
    cert_file: Option<String>,
    key_file: Option<String>,
    host_name: Option<String>,
    max_connected: u32,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        let was = local.settings()?;
        let some = |o: Option<String>| o.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty());
        local.set_settings(&LocalSettings {
            keep_on,
            cert_file: some(cert_file),
            key_file: some(key_file),
            host_name: some(host_name),
            max_connected,
            ..was
        })?;
        status_of(&local)
    })
    .await
}

/// Every ticked folder still free to serve: one that began to sync with a
/// server since it was ticked is named and stops the start (item 11).
fn check_not_synced<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    local: &LocalServer,
) -> Result<(), String> {
    let state = app.state::<App>();
    let config = state.service.config();
    for path in local.settings()?.folders {
        let key = verso_core::folder_key(Path::new(&path));
        if let Some(s) = sync::synced(config, &key) {
            let name = Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            return Err(format!(
                "{name} also syncs with {}: open that address on the phone instead, or untick it",
                host_of(&s.server)
            ));
        }
    }
    Ok(())
}

pub(super) async fn start<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        check_not_synced(&app, &local)?;
        local.start()?;
        status_of(&local)
    })
    .await
}

pub(super) async fn stop<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        crate::tunnel::stop_with(&app, crate::tunnel::LinkEnd::Stopped);
        local.stop();
        status_of(&local)
    })
    .await
}

pub(super) async fn pair_open<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    address: Option<String>,
) -> Result<LocalPairing, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        check_not_synced(&app, &local)?;
        let v = local.pair_open_on(address.as_deref())?;
        Ok(LocalPairing {
            url: v.url,
            address: v.address,
            choices: v
                .choices
                .into_iter()
                .map(|c| LocalAddressChoice {
                    address: c.address,
                    interface: c.interface,
                    kind: c.kind,
                    hint: c.hint,
                    default_route: c.default_route,
                })
                .collect(),
            chosen: v.chosen,
            code: v.code,
            qr: v.qr,
            expires_in: u32::try_from(v.expires_in).unwrap_or(120),
            fingerprint: v.fingerprint,
            certificate: v.certificate,
        })
    })
    .await
}

pub(super) async fn pair_close<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), ContractError> {
    let local = server(&app)?;
    blocking(move || {
        local.pair_close();
        Ok(())
    })
    .await
}

pub(super) async fn pair_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalPairState, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        let s = local.pair_state();
        Ok(LocalPairState {
            open: s.open,
            remaining: u32::try_from(s.remaining).unwrap_or(0),
            asked: s.asked.map(|a| LocalAsked {
                device: a.device,
                address: a.address,
                asked: a.asked,
            }),
        })
    })
    .await
}

pub(super) async fn answer<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    allow: bool,
    editor: bool,
) -> Result<(), ContractError> {
    let local = server(&app)?;
    blocking(move || local.answer(allow, if editor { Role::Editor } else { Role::Reader })).await
}

fn seconds(at: i64) -> u32 {
    u32::try_from(at).unwrap_or(0)
}

pub(super) async fn phones<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalPhone>, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        Ok(local
            .phones()?
            .into_iter()
            .map(|p| LocalPhone {
                id: p.id,
                name: p.name,
                role: p.role.as_str().to_owned(),
                paired: seconds(p.paired),
                last_seen: seconds(p.last_seen),
                address: p.address,
            })
            .collect())
    })
    .await
}

pub(super) async fn phone_role<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    editor: bool,
) -> Result<(), ContractError> {
    let local = server(&app)?;
    blocking(move || local.set_phone_role(&id, editor)).await
}

pub(super) async fn revoke<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), ContractError> {
    let local = server(&app)?;
    blocking(move || local.revoke(&id)).await
}

pub(super) async fn forget<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<u32, ContractError> {
    let local = server(&app)?;
    blocking(move || Ok(u32::try_from(local.forget_all()?).unwrap_or(u32::MAX))).await
}

pub(super) async fn replace_identity<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        crate::tunnel::stop_with(&app, crate::tunnel::LinkEnd::Stopped);
        local.replace_identity()?;
        status_of(&local)
    })
    .await
}

pub(super) async fn audit<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<LocalAudit>, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        Ok(local
            .audit()?
            .into_iter()
            .map(|e| LocalAudit {
                at: seconds(e.at),
                action: e.action,
                subject: e.subject,
                address: e.address,
            })
            .collect())
    })
    .await
}

pub(super) fn auto_start<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Ok(local) = server(&app) else { return };
        let Ok(set) = local.settings() else { return };
        if !set.keep_on || set.folders.is_empty() {
            return;
        }
        let started = check_not_synced(&app, &local).and_then(|()| local.start().map(|_| ()));
        match started {
            Ok(()) => log::write(
                "INFO",
                "host",
                "serving to a phone: kept on from the last time",
            ),
            Err(why) => log::write(
                "WARN",
                "host",
                &format!("serving to a phone not resumed: {why}"),
            ),
        }
    });
}

/// What the tray follows; `None` while the server was never made.
#[cfg(any(target_os = "macos", windows))]
pub(super) fn serving_now<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<(bool, usize, u32)> {
    let local = app.state::<App>().local_server.server.get()?.clone();
    let status = local.status().ok()?;
    let folders = local.settings().ok()?.folders.len();
    Some((
        status.serving,
        folders,
        u32::try_from(status.phones_connected).unwrap_or(u32::MAX),
    ))
}

pub(super) fn stop_on_exit<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(local) = app.state::<App>().local_server.server.get() {
        local.stop();
    }
}
