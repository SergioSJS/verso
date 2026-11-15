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
        // A phone: the foreground service and its notification; the
        // pairing's multicast let go when the pairing ends.
        #[cfg(target_os = "android")]
        {
            if matches!(event, Event::PairingEnded { .. }) {
                crate::phone::multicast("pairing", false);
            }
            crate::phone::follow(&events);
        }
    });
    #[cfg(not(test))]
    let made = LocalServer::new(config.join("local-server"), ui, env!("VERSO_COMMIT"), sink);
    // Under test the network box listens on 127.0.0.1 alone, never on the
    // machine's private addresses: each new test binary listening there was
    // asked about by the macOS firewall (2026-11-04).
    #[cfg(test)]
    let made = LocalServer::on_loopback_for_tests(config.join("local-server"), ui, sink);
    // A phone serves the window's files it carries inside itself, the ones
    // its own window loads: the APK holds them once (ADR 0118 item 7,
    // decided 2026-11-12).
    // Only a file the app carries by that very name: the resolver answers an
    // unknown path with the app's index page, where the server answers its
    // own page (`web.html`).
    #[cfg(target_os = "android")]
    {
        let assets = app.clone();
        let names: std::collections::HashSet<String> = app
            .asset_resolver()
            .iter()
            .map(|(name, _)| name.trim_start_matches('/').to_owned())
            .collect();
        made.serve_ui_from(verso_server::ui_files::UiFiles(Arc::new(
            move |path: &str| {
                names
                    .contains(path)
                    .then(|| assets.asset_resolver().get(path.to_owned()))
                    .flatten()
                    .map(|a| a.bytes)
            },
        )));
    }
    // The players see a person, not "This computer" (the test of
    // 2026-11-04): the system's user until the person names themselves.
    if let Some(name) = super::owner::system_person()
        && let Err(e) = made.name_owner_if_unnamed(&name)
    {
        log::write("WARN", "host", &format!("the owner's name: {e}"));
    }
    Ok(state.local_server.server.get_or_init(|| made).clone())
}

/// `f` off the async threads (it opens a database and may start a
/// runtime), its words of failure as the contract's.
pub(super) async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, ContractError> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| failed(e.to_string()))?
        .map_err(|words| {
            let (level, line) = said_of(&words);
            log::write(level, "host", &line);
            refused(&words)
        })
}

/// A refusal as the log says it: the link stopped by the person while it
/// started (their Stop, or Cancel during the download) is their own act,
/// said as that; anything else is a warning of serving.
fn said_of(words: &str) -> (&'static str, String) {
    if words == crate::tunnel::STOPPED {
        return (
            "INFO",
            "the internet link was stopped while it started".to_owned(),
        );
    }
    ("WARN", format!("serving to a phone: {words}"))
}

/// The UniVerso a folder of this computer was shared from, when it syncs a
/// folder another account owns there — a share received, or a folder
/// whose owner gave this person a role — as the server last said this
/// person's role (the sync's `seat`, ADR 0113 S8). Such a folder is not
/// served from here (ADR 0081 item 4, decided 2026-10-10: a receiver does
/// not share it again; ADR 0117 D4). A folder of one's own that syncs, or
/// one whose role the server has not said yet, is served like any other
/// (the maintainer, 2026-11-04): the sync carries what is edited here to
/// the server, as any edit on this computer.
pub(super) fn received_from(config: Option<&Path>, key: &str) -> Option<String> {
    let state = sync::synced(config, key)?;
    let role = state.seat.as_ref()?.get("role")?.as_str()?;
    (!role.is_empty() && role != "owner").then(|| host_of(&state.server))
}

pub(super) fn host_of(url: &str) -> String {
    url.split_once("://")
        .map_or(url, |(_, rest)| rest)
        .trim_end_matches('/')
        .to_owned()
}

pub(super) fn status_of<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    local: &LocalServer,
) -> Result<LocalServerStatus, String> {
    let s = local.status()?;
    let set = local.settings()?;
    Ok(LocalServerStatus {
        network: set.network,
        link: crate::tunnel::contract(&crate::tunnel::link_view(app)),
        link_own: set.link_own,
        own_address: set
            .own_address
            .as_ref()
            .map(|o| verso_contract::LocalOwnAddress {
                hostname: o.hostname.clone(),
            }),
        cloudflare_signed_in: crate::tunnel::signed_in(),
        read_links: local.read_links_on()?,
        owner_name: local.owner_name()?,
        listened_again: s.listened_again,
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
        app_idle_days: local.app_idle_days()?,
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
    blocking(move || status_of(&app, &local)).await
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
                received_from: received_from(config, &key),
                tables: local.tables_in(&path),
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
        // While serving too, at once (ADR 0117 R4, 2026-11-13): a folder
        // served from its page must not stop the server.
        let state = app.state::<App>();
        let config = state.service.config();
        let path = verso_core::recent_folders(config)
            .into_iter()
            .find(|p| verso_core::folder_key(p) == key)
            .ok_or_else(|| "this computer does not know that folder".to_owned())?;
        if ticked && let Some(host) = received_from(config, &key) {
            return Err(format!(
                "this folder was shared with you on {host}: only its owner serves it"
            ));
        }
        let text = path.to_string_lossy().into_owned();
        local.change_served(|settings| {
            // Ticking it again while it is ticked changes nothing.
            if ticked && settings.folders.contains(&text) {
                return Ok(());
            }
            settings.folders.retain(|f| *f != text);
            // What was chosen inside a folder is forgotten with its untick.
            if ticked {
                settings.folders.push(text);
            } else {
                settings.parts.remove(&text);
            }
            Ok(())
        })?;
        rows(&app, &local)
    })
    .await
}

/// The directory of the folder this computer knows by `key`.
pub(super) fn known_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    key: &str,
) -> Result<PathBuf, String> {
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
        status_of(&app, &local)
    })
    .await
}

/// How many days a paired Verso app lasts without speaking to this
/// computer (`0`: never).
pub(super) async fn app_idle<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    days: u32,
) -> Result<LocalServerStatus, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        local.set_app_idle_days(days)?;
        status_of(&app, &local)
    })
    .await
}

/// Every ticked folder still free to serve: one this person received from
/// another account since it was ticked ([`received_from`]) is named and
/// stops the start, the pairing and the link.
pub(super) fn check_not_received<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    local: &LocalServer,
) -> Result<(), String> {
    let state = app.state::<App>();
    let config = state.service.config();
    for path in local.settings()?.folders {
        let key = verso_core::folder_key(Path::new(&path));
        if let Some(host) = received_from(config, &key) {
            let name = Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            return Err(format!(
                "{name} was shared with you on {host}: only its owner serves it; untick it"
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
        check_not_received(&app, &local)?;
        local.start()?;
        // iOS may end the app off the screen: its next start says serving
        // ended so (ADR 0119 B12/A2).
        #[cfg(target_os = "ios")]
        let _ = local.set_wanted(true);
        status_of(&app, &local)
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
        #[cfg(target_os = "ios")]
        let _ = local.set_wanted(false);
        status_of(&app, &local)
    })
    .await
}

pub(super) async fn pair_open<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    address: Option<String>,
) -> Result<LocalPairing, ContractError> {
    let local = server(&app)?;
    blocking(move || {
        check_not_received(&app, &local)?;
        let v = local.pair_open_on(address.as_deref())?;
        #[cfg(target_os = "android")]
        crate::phone::multicast("pairing", true);
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
            link: v.link.map(|l| LocalPairLink {
                url: l.url,
                qr: l.qr,
            }),
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
        #[cfg(target_os = "android")]
        crate::phone::multicast("pairing", false);
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
                link: a.link,
                app: a.app,
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
        status_of(&app, &local)
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
        #[cfg(target_os = "ios")]
        follow_the_container(&app, &local);
        // The system ended the app while it served (iOS, a locked device:
        // seen on the maintainer's iPad, 2026-11-12): within ten minutes
        // serving resumes once the app is on the screen, later the window
        // says it stopped (ADR 0119 B12/A2; ADR 0096 item 1 amended for
        // iOS, the maintainer on 2026-11-12: "bora").
        #[cfg(target_os = "ios")]
        match local.ended_while_serving(RESUME_WITHIN) {
            Some(true) => log::write(
                "INFO",
                "host",
                "iOS: the app was ended while it served; serving resumes on the screen",
            ),
            Some(false) => log::write(
                "WARN",
                "host",
                "iOS: the app was ended while it served, too long ago; serving is off",
            ),
            None => {}
        }
        let Ok(set) = local.settings() else { return };
        // The own address follows *Keep on at start*; a quick link never
        // does (ADR 0117 D10, D3 item 6).
        let own = set
            .own_address
            .clone()
            .filter(|_| set.link_own && crate::tunnel::signed_in());
        if !set.keep_on || set.folders.is_empty() || (!set.network && own.is_none()) {
            return;
        }
        let mut started = check_not_received(&app, &local);
        if set.network {
            started = started.and_then(|()| local.start().map(|_| ()));
        }
        if let Some(o) = own {
            started = started
                .and_then(|()| crate::tunnel::own_on(&app, &o.tunnel, &o.hostname).map(|_| ()));
        }
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

/// The folders ticked to serve at an earlier install's container path,
/// followed into this one's (iOS moves the container at each install, the
/// data with it); one that is not there any more is unticked.
#[cfg(target_os = "ios")]
fn follow_the_container<R: tauri::Runtime>(app: &tauri::AppHandle<R>, local: &LocalServer) {
    let Some((container, under)) = app
        .path()
        .app_data_dir()
        .ok()
        .and_then(|d| crate::ios::containers(&d))
    else {
        return;
    };
    let Ok(mut set) = local.settings() else {
        return;
    };
    let moved = |p: &str| -> Option<Option<String>> {
        let path = Path::new(p);
        if path.starts_with(&container) || !path.starts_with(&under) {
            return None;
        }
        Some(
            crate::ios::in_this_container(path, &container, &under)
                .map(|h| h.to_string_lossy().into_owned()),
        )
    };
    let mut changed = false;
    let mut folders = Vec::new();
    for f in &set.folders {
        match moved(f) {
            None => folders.push(f.clone()),
            Some(here) => {
                changed = true;
                folders.extend(here);
            }
        }
    }
    let mut parts = std::collections::BTreeMap::new();
    for (k, v) in &set.parts {
        match moved(k) {
            None => {
                parts.insert(k.clone(), v.clone());
            }
            Some(here) => {
                changed = true;
                if let Some(h) = here {
                    parts.insert(h, v.clone());
                }
            }
        }
    }
    // A folder's registered name goes with it (review of 2026-11-14, I2):
    // else the moved path gets a new name, and its table rests for nobody.
    let names: Vec<(String, String)> = set
        .names
        .iter()
        .filter_map(|(k, v)| Some((moved(k)??, v.clone())))
        .collect();
    for (here, name) in names {
        changed = true;
        set.names.insert(here, name);
    }
    if changed {
        folders.dedup();
        set.folders = folders;
        set.parts = parts;
        match local.set_settings(&set) {
            Ok(()) => log::write(
                "INFO",
                "host",
                "iOS: the folders served followed the app's container",
            ),
            Err(e) => log::write("WARN", "host", &format!("iOS: the folders served: {e}")),
        }
    }
}

/// How long after the system ended the app while it served a start
/// serves again by itself (iOS; ADR 0096 item 1 amended for iOS, decided
/// 2026-11-12: "within a few minutes", the window chosen here).
#[cfg(target_os = "ios")]
const RESUME_WITHIN: std::time::Duration = std::time::Duration::from_secs(10 * 60);

/// The app leaves the screen (iOS, the window's scene resigning): when, kept, for
/// a start after the system ended it while it served.
#[cfg(target_os = "ios")]
pub(super) fn before_suspend<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(local) = app.state::<App>().local_server.server.get() {
        local.mark_away();
    }
}

/// The app back on the screen (iOS, the window's scene active again): iOS takes an
/// app's listening socket while the device is locked, and the port then
/// refused every connection while the section still said it served (seen
/// on the maintainer's iPad on 2026-11-12). Serving on the network that no
/// longer listens listens again, on the same port (ADR 0119 B12/A2: it
/// serves while the app is on the screen, and says so).
#[cfg(target_os = "ios")]
pub(super) fn after_resume<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Some(local) = app.state::<App>().local_server.server.get().cloned() else {
        return;
    };
    tauri::async_runtime::spawn_blocking(move || {
        // The Wi-Fi comes back with the screen: a moment before asking.
        std::thread::sleep(std::time::Duration::from_millis(800));
        // A start after the system ended the app while it served, due now
        // (`auto_start`), or a port iOS closed while the app lived.
        if !local.take_resume() && local.listening() != Some(false) {
            return;
        }
        match local.listen_again() {
            Ok(_) => log::write(
                "INFO",
                "host",
                "iOS: the server's port was closed while off the screen; it listens again",
            ),
            Err(why) => log::write(
                "WARN",
                "host",
                &format!("iOS: the server could not listen again: {why}"),
            ),
        }
    });
}

/// What the tray follows; `None` while the server was never made.
#[cfg(any(target_os = "macos", windows, target_os = "android"))]
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

#[cfg(test)]
mod tests {
    use super::said_of;

    /// The person's own Stop or Cancel while the link starts is no warning,
    /// and is not "serving to a phone" (the re-test of 2026-11-04: only
    /// the link was ticked); any other refusal still is a warning.
    #[test]
    fn a_link_stopped_by_the_person_is_said_as_that() {
        let (level, line) = said_of(crate::tunnel::STOPPED);
        assert_eq!(level, "INFO");
        assert!(
            line.contains("internet link") && !line.contains("phone"),
            "{line}"
        );
        let (level, line) = said_of("turn serving on first");
        assert_eq!(level, "WARN");
        assert_eq!(line, "serving to a phone: turn serving on first");
    }
}
