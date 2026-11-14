// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The internet link on this computer (ADR 0117 D11, D10): the desktop
//! host's side of `verso-tunnel`, the crate both hosts use (R5, moved there
//! from this module). Here: the app's state and data directory, the door
//! (`verso_server::local::LocalServer`'s `link_open` / `set_link_origin` /
//! `link_close`, behind [`Door`]), the phone's bundled `cloudflared`, and
//! what the window hears — the event [`EVENT`] with a `LocalLink`
//! ([`contract`] of a [`LinkView`]) at each change.
//!
//! `verso-server` and `verso-service` spawn nothing on this computer
//! (D11 item 5): the app runs `cloudflared`.
//!
//! The window's commands over these functions are `local_server`'s (the
//! contract's `LocalLink`, `build.rs`, the capability).

#[cfg(test)]
mod tests;

use std::path::PathBuf;
use std::sync::OnceLock;

use tauri::{Emitter, Manager as _};
pub use verso_tunnel::{
    CEILING, Door, LinkEnd, LinkState, LinkView, Manager, Mode, STOPPED, fetch, files, named, run,
    tunnel_dir,
};

/// The event the window hears at each change of the link.
pub const EVENT: &str = "local-server-link";

/// Where the link's lines go: the app's log, as when this was the app's
/// own module.
pub fn log_to_the_app() {
    verso_tunnel::log::set(Box::new(|level, source, text| {
        crate::log::write(level, source, text);
    }));
}

/// The local server's door for a link asked for when its stops were
/// `asked`: a stop of serving since then opens nothing
/// (`LocalServer::link_open_after`).
pub struct Serving {
    pub local: verso_server::local::LocalServer,
    pub asked: u64,
}

impl Door for Serving {
    fn open(&self) -> Result<u16, String> {
        self.local.link_open_after(self.asked)
    }
    fn set_origin(&self, origin: Option<&str>) -> Result<(), String> {
        self.local.set_link_origin(origin)
    }
    fn close(&self) {
        self.local.link_close();
    }
}

/// What the window is told: the contract's form of a [`LinkView`].
#[must_use]
pub fn contract(view: &LinkView) -> verso_contract::LocalLink {
    use verso_contract::{LocalLinkEnd as E, LocalLinkState as S};
    verso_contract::LocalLink {
        state: match view.state {
            LinkState::Off => S::Off,
            LinkState::Starting => S::Starting,
            LinkState::On => S::On,
            LinkState::Offline => S::Offline,
        },
        origin: view.origin.clone(),
        until: view
            .until_ms
            .map(|ms| u32::try_from(ms / 1000).unwrap_or(u32::MAX)),
        own: view.own,
        ended: view.ended.map(|e| match e {
            LinkEnd::Stopped => E::Stopped,
            LinkEnd::Ceiling => E::Ceiling,
            LinkEnd::Exited => E::Exited,
            LinkEnd::Failed => E::Failed,
            LinkEnd::Quit => E::Quit,
        }),
        protocol: view.protocol.clone(),
        qr: view
            .origin
            .as_deref()
            .and_then(|o| verso_server::local::qr::matrix(o).ok())
            .unwrap_or_default(),
        download: view
            .download
            .map(|(done, total)| verso_contract::LocalLinkDownload {
                done: u32::try_from(done).unwrap_or(u32::MAX),
                total: total.map(|t| u32::try_from(t).unwrap_or(u32::MAX)),
            }),
    }
}

/* ---------- The host's side: the app's state, its data directory ---------- */

/// The link's manager in the app's state (beside the local server's).
#[derive(Default)]
pub struct Slot {
    manager: OnceLock<Manager>,
}

fn manager<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> &Manager {
    let slot = &app.state::<crate::App>().inner().local_server.link;
    slot.manager.get_or_init(|| {
        let events = app.clone();
        Manager::new(
            move |view| {
                let _ = events.emit(EVENT, contract(view));
                // The mark in the menu bar or the tray says the link too.
                #[cfg(any(target_os = "macos", windows))]
                crate::tray::follow(&events);
                #[cfg(target_os = "android")]
                crate::phone::follow(&events);
            },
            run::Timing::default(),
            CEILING,
        )
    })
}

fn dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let config = match app.state::<crate::App>().service.config() {
        Some(dir) => dir.to_path_buf(),
        None => verso_core::config_dir().map_err(|e| e.to_string())?,
    };
    Ok(tunnel_dir(&config))
}

/// The pinned `cloudflared`, fetched and checked if needed (blocking: a
/// download). Its first run is `--version`.
pub fn binary<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    binary_going(app, &|_, _| true)
}

/// [`binary`], telling `going` how far a download got (it ends the
/// download when it answers false).
fn binary_going<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    going: &fetch::Going<'_>,
) -> Result<PathBuf, String> {
    // No `cloudflared` is fetched on a phone: the APK carries its own.
    #[cfg(target_os = "android")]
    {
        let _ = (app, going);
        bundled()
    }
    #[cfg(not(target_os = "android"))]
    {
        let pin = fetch::pin_here()
            .ok_or_else(|| "no cloudflared is published for this system".to_owned())?;
        let (path, fresh) =
            fetch::ensure_going(&dir(app)?, pin, &mut fetch::download_sized, going)?;
        if fresh {
            run::version_check(&path, fetch::VERSION)?;
        }
        Ok(path)
    }
}

/// The phone's `cloudflared` (ADR 0118 item 3.3): shipped in the APK as a
/// native library, `libcloudflared.so`, which Android puts on disk in the
/// app's native library directory — the only place an app targeting API
/// 29+ may run a file from. Built for Android from the pinned source
/// (scripts/android/cloudflared.sh, decided 2026-11-12), so no sum of
/// Cloudflare's binaries is its own: what the build pins is the source and
/// the toolchain, and the APK's signature covers the file on the phone.
/// Here it must be there and say the pinned version.
#[cfg(target_os = "android")]
fn bundled() -> Result<PathBuf, String> {
    let dir = crate::phone::facts().native_library_dir;
    if dir.is_empty() {
        return Err("the app's native library directory is unknown".to_owned());
    }
    let path = std::path::Path::new(&dir).join("libcloudflared.so");
    match files::sha256_of(&path)? {
        Some(_) => {
            // That it runs on this phone, once per start of the app.
            static RAN: OnceLock<Result<(), String>> = OnceLock::new();
            RAN.get_or_init(|| run::version_check(&path, fetch::VERSION))
                .clone()
                .map(|()| path)
        }
        None => Err("this build of the app carries no cloudflared".to_owned()),
    }
}

/// The link is starting from the person's click: a *Stop* during the
/// first download is heard, and a stop of serving since the click starts
/// nothing ([`Serving`]).
fn start<R: tauri::Runtime>(app: &tauri::AppHandle<R>, mode: Mode) -> Result<LinkView, String> {
    let local = crate::local_server::server_for_link(app)?;
    let asked = local.stops();
    manager(app).start_after(mode, |preparing| {
        let program = binary_going(app, &|done, total| preparing.downloaded(done, total))?;
        Ok((Box::new(Serving { local, asked }) as Box<dyn Door>, program))
    })
}

/// Turn the quick link on (blocking, up to the download and the waits).
pub fn link_on<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<LinkView, String> {
    start(app, Mode::Quick)
}

/// Turn the own address on: the tunnel `uuid` made by [`named::create`],
/// routed to `hostname` by [`named::route_dns`].
pub fn own_on<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    uuid: &str,
    hostname: &str,
) -> Result<LinkView, String> {
    if !named::valid_uuid(uuid) || !named::valid_hostname(hostname) {
        return Err("not a tunnel's id and a hostname".to_owned());
    }
    let credentials = named::credentials_path(&dir(app)?, uuid);
    start(
        app,
        Mode::Own {
            uuid: uuid.to_owned(),
            credentials,
            hostname: hostname.to_owned(),
        },
    )
}

/// *Stop the link*.
pub fn link_off<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> LinkView {
    manager(app).stop(LinkEnd::Stopped)
}

/// *Extend*.
pub fn link_extend<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<LinkView, String> {
    manager(app).extend()
}

/// Where the link stands.
pub fn link_view<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> LinkView {
    manager(app).view()
}

/* ---------- The own address's steps (D10 (a)), for the window ---------- */

fn home_dir() -> Result<PathBuf, String> {
    named::home().ok_or_else(|| {
        "this computer's home folder is unknown, where cloudflared keeps its login".to_owned()
    })
}

/// `cloudflared tunnel login` was done: the person's Cloudflare credential
/// is where `cloudflared` keeps it (only whether it is there is asked).
#[must_use]
pub fn signed_in() -> bool {
    named::home().is_some_and(|h| files::is_there(&named::cert_path(&h)))
}

/// Log in to Cloudflare (blocking, up to [`named::LOGIN_WAIT`]: the person
/// in the browser).
pub fn own_login<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(named::Login, Option<String>), String> {
    named::login(&binary(app)?)
}

/// Make the named tunnel for `hostname` and route the hostname to it; says
/// the tunnel's id. A route refused leaves no tunnel behind.
pub fn own_set_up<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    hostname: &str,
) -> Result<String, String> {
    if !named::valid_hostname(hostname) {
        return Err(
            "an address in lower case, of at least two parts, like mesa.example.com".to_owned(),
        );
    }
    if !signed_in() {
        return Err("sign in to Cloudflare first".to_owned());
    }
    let program = binary(app)?;
    let (home, dir) = (home_dir()?, dir(app)?);
    let uuid = named::create(&program, &home, &dir, &named::tunnel_name(hostname))?;
    let why = match named::route_dns(&program, &home, &uuid, hostname) {
        Ok(named::Route::Added | named::Route::AlreadyOurs) => return Ok(uuid),
        Ok(named::Route::Taken) => format!(
            "{hostname} already has another DNS record at Cloudflare: choose another address, or remove that record in Cloudflare's dashboard"
        ),
        Ok(named::Route::Failed(words)) => format!("the address was not routed: {words}"),
        Err(e) => e,
    };
    if let Err(left) = named::delete(&program, &home, &dir, &uuid) {
        crate::log::write("WARN", "host", &format!("the own address: {left}"));
    }
    Err(why)
}

/// Delete the named tunnel `uuid` and its credentials.
pub fn own_delete<R: tauri::Runtime>(app: &tauri::AppHandle<R>, uuid: &str) -> Result<(), String> {
    let program = binary(app)?;
    named::delete(&program, &home_dir()?, &dir(app)?, uuid)
}

/// Forget the named tunnel `uuid`'s credentials on this computer
/// (`<config>/tunnel/<uuid>.json`): left behind, they could still run a
/// connector for the person's hostname. Its absence is the success.
pub fn own_forget<R: tauri::Runtime>(app: &tauri::AppHandle<R>, uuid: &str) -> Result<(), String> {
    if !named::valid_uuid(uuid) {
        return Err("not a tunnel's id".to_owned());
    }
    let credentials = named::credentials_path(&dir(app)?, uuid);
    files::remove(&credentials);
    if files::is_there(&credentials) {
        return Err("the tunnel's credentials could not be removed from this computer".to_owned());
    }
    Ok(())
}

/// The link is on or starting (the tray says so); `false` before the
/// manager was ever made.
#[cfg(any(target_os = "macos", windows, target_os = "android"))]
pub fn link_up<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    let slot = &app.state::<crate::App>().inner().local_server.link;
    slot.manager
        .get()
        .is_some_and(|m| matches!(m.view().state, LinkState::On | LinkState::Starting))
}

/// Serving stopped, or the app ends: no tunnel stays.
pub(crate) fn stop_with<R: tauri::Runtime>(app: &tauri::AppHandle<R>, why: LinkEnd) {
    let slot = &app.state::<crate::App>().inner().local_server.link;
    if let Some(m) = slot.manager.get() {
        m.stop(why);
    }
    // The app ends before a download cut short hears the stop: nothing of
    // it stays behind.
    if why == LinkEnd::Quit
        && let Ok(dir) = dir(app)
    {
        fetch::forget_partial(&dir);
    }
}
