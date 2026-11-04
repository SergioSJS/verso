// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The internet link's `cloudflared` (ADR 0117 D3 items 5 and 6, D4 Q6 and
//! Q7, D10): the desktop host fetches the pinned binary ([`fetch`]), runs
//! it to the local server's loopback listener ([`run`]), tells the server
//! the link's origin once a connection is registered, and stops it — on
//! *Stop*, at the twelve-hour ceiling of a quick link (*Extend* pushes it
//! back), when serving stops, at the app's end, and when the [`Manager`]
//! is dropped. When `cloudflared` ends by itself the link is "offline", and
//! nothing restarts it silently. One tunnel at a time.
//!
//! `verso-server` and `verso-service` spawn nothing (D3 item 5): the door
//! the tunnel goes through is `verso_server::local::LocalServer`'s
//! `link_open` / `set_link_origin` / `link_close` (S2), behind [`Door`].
//! The log holds no link (D3 item 8): neither the quick link's URL nor an
//! own hostname is written in it.
//!
//! The window's commands over these functions are `local_server`'s (the
//! contract's `LocalLink`, `build.rs`, the capability). What the window
//! hears: the event [`EVENT`] with a `LocalLink` ([`contract`] of a
//! [`LinkView`]) at each change.

pub(crate) mod fetch;
mod files;
pub(crate) mod named;
pub(crate) mod run;

#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{Emitter, Manager as _};

use self::run::{Seen, Timing, Tunnel};

/// The quick link's ceiling (D4 Q6): twelve hours, *Extend* re-arms it.
pub const CEILING: Duration = Duration::from_secs(12 * 60 * 60);

/// The longest the ceiling's watch sleeps before it reads the clock
/// again: a wait stops while the machine sleeps, the wall clock does not.
pub const NAP: Duration = Duration::from_secs(30);

/// The clock the ceiling is measured on: the wall clock, which goes on
/// while the machine sleeps (a monotonic clock stops there, and a laptop
/// shut for the night would wake to a link with hours left), read at
/// least once every `nap`.
#[derive(Clone)]
pub struct Clock {
    pub now: Arc<dyn Fn() -> SystemTime + Send + Sync>,
    pub nap: Duration,
}

impl Clock {
    /// The system's wall clock, read every [`NAP`].
    #[must_use]
    pub fn system() -> Self {
        Self {
            now: Arc::new(SystemTime::now),
            nap: NAP,
        }
    }
}

/// The event the window hears at each change of the link.
pub const EVENT: &str = "local-server-link";

/// The local server's door for the link, as the tunnel needs it.
pub trait Door: Send + Sync {
    /// Open the loopback listener; its port.
    fn open(&self) -> Result<u16, String>;
    /// Say (or forget) the link's public origin.
    fn set_origin(&self, origin: Option<&str>) -> Result<(), String>;
    /// Close the listener (the origin is forgotten with it).
    fn close(&self);
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

/// Which link.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Mode {
    /// A quick link: a random `*.trycloudflare.com`, new at each run, with
    /// the ceiling.
    Quick,
    /// The person's own address (D10): the tunnel `uuid`, its credentials,
    /// the hostname routed to it. No ceiling.
    Own {
        uuid: String,
        credentials: PathBuf,
        hostname: String,
    },
}

/// Where the link stands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkState {
    Off,
    /// Fetching the binary or waiting for a registered connection.
    Starting,
    On,
    /// `cloudflared` ended by itself: no link until the person turns it on
    /// again (a new link, for a quick one).
    Offline,
}

/// Why the link last ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkEnd {
    /// The person stopped it, or serving stopped.
    Stopped,
    /// The quick link's twelve hours ran out.
    Ceiling,
    /// `cloudflared` ended by itself.
    Exited,
    /// It never came up (the words were the start's error).
    Failed,
    /// The app is ending.
    Quit,
}

/// What the window shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LinkView {
    pub state: LinkState,
    /// The link's origin while on (`https://…`): the window shows it with
    /// *Copy* and a QR. Never logged.
    pub origin: Option<String>,
    /// A quick link's ceiling, in milliseconds since 1970.
    pub until_ms: Option<u64>,
    /// The link is the person's own address.
    pub own: bool,
    /// Why it last ended.
    pub ended: Option<LinkEnd>,
    /// How `cloudflared` reached Cloudflare while on: `quic`, or `http2`
    /// after QUIC found no way out (`run::up`).
    pub protocol: Option<String>,
    /// While starting, the download of `cloudflared` under way: the bytes
    /// so far and in all.
    pub download: Option<(u64, Option<u64>)>,
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

struct Running {
    generation: u64,
    tunnel: Tunnel,
    door: Box<dyn Door>,
    origin: String,
    own: bool,
    protocol: String,
    /// The ceiling (quick links only), on the wall clock.
    deadline: Option<SystemTime>,
}

enum Phase {
    Off(Option<LinkEnd>),
    Starting {
        generation: u64,
        cancel: Arc<AtomicBool>,
        own: bool,
        /// The download of `cloudflared` under way, how far it got.
        download: Option<(u64, Option<u64>)>,
    },
    On(Running),
    Offline,
}

type Events = Box<dyn Fn(&LinkView) + Send + Sync>;

struct Shared {
    phase: Mutex<Phase>,
    wake: Condvar,
    events: Events,
    timing: Timing,
    ceiling: Duration,
    clock: Clock,
    generation: AtomicU64,
    /// Held while the door is opened, and while a stop takes the link
    /// down: a stop and an immediate start again never interleave (the
    /// stop's close would end the new start's listener).
    door_ops: Mutex<()>,
}

/// The link's one tunnel. Dropping it stops the tunnel.
pub struct Manager {
    shared: Arc<Shared>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn epoch_ms(at: SystemTime) -> u64 {
    at.duration_since(UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

impl Manager {
    /// A manager whose changes go to `events`, with these waits and this
    /// ceiling ([`CEILING`] in the app).
    pub fn new(
        events: impl Fn(&LinkView) + Send + Sync + 'static,
        timing: Timing,
        ceiling: Duration,
    ) -> Self {
        Self::with_clock(events, timing, ceiling, Clock::system())
    }

    /// The same, the ceiling measured on `clock`.
    pub fn with_clock(
        events: impl Fn(&LinkView) + Send + Sync + 'static,
        timing: Timing,
        ceiling: Duration,
        clock: Clock,
    ) -> Self {
        Self {
            shared: Arc::new(Shared {
                phase: Mutex::new(Phase::Off(None)),
                wake: Condvar::new(),
                events: Box::new(events),
                timing,
                ceiling,
                clock,
                generation: AtomicU64::new(0),
                door_ops: Mutex::new(()),
            }),
        }
    }

    /// Where it stands now.
    #[must_use]
    pub fn view(&self) -> LinkView {
        view_of(&lock(&self.shared.phase))
    }

    /// The running child's process id (the tests).
    #[cfg(test)]
    #[cfg(unix)]
    #[must_use]
    pub fn pid(&self) -> Option<u32> {
        match &*lock(&self.shared.phase) {
            Phase::On(r) => Some(r.tunnel.pid()),
            _ => None,
        }
    }

    /// Start the link through `door` with `program` (the checked binary)
    /// and return once a connection is registered and the server knows the
    /// origin. One at a time: refused while one is starting or on. (The
    /// app goes through [`Self::start_after`].)
    #[cfg(test)]
    #[cfg(unix)]
    pub fn start(
        &self,
        door: Box<dyn Door>,
        program: &Path,
        mode: Mode,
    ) -> Result<LinkView, String> {
        let program = program.to_path_buf();
        self.start_after(mode, move |_| Ok((door, program)))
    }

    /// [`Self::start`] once `prepare` said the door and the program — the
    /// download of `cloudflared` on first use. The link is starting from
    /// before `prepare`: a stop while it runs is heard — `prepare` reads it
    /// in [`Preparing::downloaded`], which ends the download — and nothing
    /// opens after it.
    pub fn start_after(
        &self,
        mode: Mode,
        prepare: impl FnOnce(&Preparing) -> Result<(Box<dyn Door>, PathBuf), String>,
    ) -> Result<LinkView, String> {
        let shared = &self.shared;
        let own = matches!(mode, Mode::Own { .. });
        let cancel = Arc::new(AtomicBool::new(false));
        let generation = {
            let mut phase = lock(&shared.phase);
            if matches!(*phase, Phase::Starting { .. } | Phase::On(_)) {
                return Err("the internet link is already on".to_owned());
            }
            let generation = shared.generation.fetch_add(1, Ordering::SeqCst) + 1;
            *phase = Phase::Starting {
                generation,
                cancel: Arc::clone(&cancel),
                own,
                download: None,
            };
            generation
        };
        shared.emit();
        let preparing = Preparing {
            shared: Arc::clone(shared),
            generation,
            cancel: Arc::clone(&cancel),
            told: Mutex::new(None),
        };
        let up = prepare(&preparing).and_then(|(door, program)| {
            preparing.downloaded_all();
            self.bring_up(door, &program, &mode, generation, &cancel)
        });
        match up {
            Ok(view) => Ok(view),
            Err(why) => {
                {
                    let mut phase = lock(&shared.phase);
                    if matches!(&*phase, Phase::Starting { generation: g, .. } if *g == generation)
                    {
                        *phase = Phase::Off(Some(LinkEnd::Failed));
                    }
                }
                crate::log::write(
                    "WARN",
                    "host",
                    &format!("the internet link did not start: {}", run::redact(&why)),
                );
                shared.emit();
                Err(why)
            }
        }
    }

    fn bring_up(
        &self,
        door: Box<dyn Door>,
        program: &Path,
        mode: &Mode,
        generation: u64,
        cancel: &AtomicBool,
    ) -> Result<LinkView, String> {
        let shared = &self.shared;
        let port = {
            // A stop sets `cancel` holding this lock: stopped before here,
            // the door is never opened.
            let _ops = lock(&shared.door_ops);
            if cancel.load(Ordering::SeqCst) {
                return Err("the link was stopped".to_owned());
            }
            door.open()?
        };
        // The door is this start's to touch only while no newer start
        // began (a stop and a start again while this one came up).
        let mine = || shared.generation.load(Ordering::SeqCst) == generation;
        let close = |door: &dyn Door| {
            let _ops = lock(&shared.door_ops);
            if mine() {
                let _ = door.set_origin(None);
                door.close();
            }
        };
        let up = match mode {
            Mode::Quick => run::up(
                program,
                &|h2| run::quick_args(port, h2),
                true,
                &shared.timing,
                cancel,
            ),
            Mode::Own {
                uuid, credentials, ..
            } => run::up(
                program,
                &|h2| named::run_args(port, credentials, uuid, h2),
                false,
                &shared.timing,
                cancel,
            ),
        };
        let up = match up {
            Ok(up) => up,
            Err(why) => {
                close(door.as_ref());
                return Err(why);
            }
        };
        let (origin, hostname) = match mode {
            Mode::Quick => (up.url.clone().unwrap_or_default(), None),
            Mode::Own { hostname, .. } => (format!("https://{hostname}"), Some(hostname.clone())),
        };
        let mut tunnel = up.tunnel;
        let said = {
            let _ops = lock(&shared.door_ops);
            if mine() {
                door.set_origin(Some(&origin))
            } else {
                Err("the link was stopped".to_owned())
            }
        };
        if let Err(why) = said {
            tunnel.stop();
            close(door.as_ref());
            return Err(why);
        }
        let pid = tunnel.pid();
        let deadline = matches!(mode, Mode::Quick).then(|| shared.deadline());
        let view = {
            let mut phase = lock(&shared.phase);
            if !matches!(&*phase, Phase::Starting { generation: g, .. } if *g == generation) {
                // Stopped while it came up.
                drop(phase);
                tunnel.stop();
                close(door.as_ref());
                return Err("the link was stopped".to_owned());
            }
            *phase = Phase::On(Running {
                generation,
                tunnel,
                door,
                origin,
                own: hostname.is_some(),
                protocol: up.protocol.clone(),
                deadline,
            });
            view_of(&phase)
        };
        crate::log::write(
            "INFO",
            "host",
            &format!(
                "the internet link is on ({}, cloudflared pid {pid}, protocol {})",
                if hostname.is_some() {
                    "own address"
                } else {
                    "quick link"
                },
                up.protocol
            ),
        );
        shared.emit();
        Shared::watch_end(Arc::clone(shared), generation, up.rest);
        if deadline.is_some() {
            Shared::watch_ceiling(Arc::clone(shared), generation);
        }
        Ok(view)
    }

    /// Stop the link, or the start under way: the origin is forgotten, the
    /// child stopped, the listener closed.
    pub fn stop(&self, why: LinkEnd) -> LinkView {
        self.shared.stop_if(None, why);
        self.view()
    }

    /// *Extend*: a quick link's ceiling is [`CEILING`] from now again, the
    /// same link. Refused with no quick link on.
    pub fn extend(&self) -> Result<LinkView, String> {
        let view = {
            let mut phase = lock(&self.shared.phase);
            let Phase::On(r) = &mut *phase else {
                return Err("the internet link is off".to_owned());
            };
            if r.deadline.is_none() {
                return Err("an own address has no ceiling".to_owned());
            }
            r.deadline = Some(self.shared.deadline());
            view_of(&phase)
        };
        self.shared.wake.notify_all();
        crate::log::write("INFO", "host", "the internet link was extended");
        self.shared.emit();
        Ok(view)
    }
}

/// A start's preparation (the download of `cloudflared`): what it hears
/// of a stop, and what it says of the download, which the window shows.
pub struct Preparing {
    shared: Arc<Shared>,
    generation: u64,
    cancel: Arc<AtomicBool>,
    /// When the window was last told how far the download got.
    told: Mutex<Option<std::time::Instant>>,
}

/// How often the window is told how far the download got, at most.
const TELL_EVERY: Duration = Duration::from_millis(250);

impl Preparing {
    /// `done` bytes of `total` downloaded: the window is told, a few times
    /// a second at most. Says whether to go on — false once the link was
    /// stopped (*Cancel*, *Stop serving*, the app's end).
    pub fn downloaded(&self, done: u64, total: Option<u64>) -> bool {
        if self.cancel.load(Ordering::SeqCst) {
            return false;
        }
        {
            let mut phase = lock(&self.shared.phase);
            match &mut *phase {
                Phase::Starting {
                    generation,
                    download,
                    ..
                } if *generation == self.generation => *download = Some((done, total)),
                _ => return false,
            }
        }
        let mut told = lock(&self.told);
        let last = total.is_some_and(|t| done >= t);
        if last || told.is_none_or(|at| at.elapsed() >= TELL_EVERY) {
            *told = Some(std::time::Instant::now());
            drop(told);
            self.shared.emit();
        }
        true
    }

    /// The download is over: the window says the link is starting again.
    fn downloaded_all(&self) {
        let was = {
            let mut phase = lock(&self.shared.phase);
            match &mut *phase {
                Phase::Starting {
                    generation,
                    download,
                    ..
                } if *generation == self.generation => download.take(),
                _ => None,
            }
        };
        if was.is_some() {
            self.shared.emit();
        }
    }
}

impl Drop for Manager {
    fn drop(&mut self) {
        self.shared.stop_if(None, LinkEnd::Quit);
    }
}

impl Shared {
    /// The ceiling from now.
    fn deadline(&self) -> SystemTime {
        (self.clock.now)() + self.ceiling
    }

    fn emit(&self) {
        let view = view_of(&lock(&self.phase));
        (self.events)(&view);
    }

    /// Stop what runs (only generation `only`, when given).
    fn stop_if(&self, only: Option<u64>, why: LinkEnd) {
        // Before the phase changes: no start can open the door until this
        // stop has closed it.
        let ops = lock(&self.door_ops);
        let running = {
            let mut phase = lock(&self.phase);
            let matches = |g: u64| only.is_none_or(|o| o == g);
            match &*phase {
                Phase::On(r) if matches(r.generation) => {
                    let Phase::On(r) = std::mem::replace(&mut *phase, Phase::Off(Some(why))) else {
                        return;
                    };
                    Some(r)
                }
                Phase::Starting {
                    generation, cancel, ..
                } if matches(*generation) => {
                    cancel.store(true, Ordering::SeqCst);
                    *phase = Phase::Off(Some(why));
                    None
                }
                Phase::Offline if only.is_none() => {
                    *phase = Phase::Off(Some(why));
                    None
                }
                _ => return,
            }
        };
        self.wake.notify_all();
        if let Some(mut r) = running {
            // No request through the link is answered from here on.
            let _ = r.door.set_origin(None);
            let status = r.tunnel.stop();
            r.door.close();
            crate::log::write(
                "INFO",
                "host",
                &format!(
                    "the internet link is off ({why:?}; cloudflared {})",
                    describe(status)
                ),
            );
        }
        drop(ops);
        self.emit();
    }

    /// The rest of `stderr`: its `ERR` lines (redacted) to the log, and its
    /// end, when not ours, is the link going offline.
    fn watch_end(shared: Arc<Self>, generation: u64, rest: std::sync::mpsc::Receiver<Seen>) {
        let spawned = std::thread::Builder::new()
            .name("cloudflared-end".to_owned())
            .spawn(move || {
                for seen in rest {
                    match seen {
                        Seen::Error(line) => {
                            crate::log::write("WARN", "host", &format!("cloudflared: {line}"))
                        }
                        Seen::Ended => break,
                        _ => {}
                    }
                }
                shared.ended(generation);
            });
        if spawned.is_err() {
            crate::log::write(
                "WARN",
                "host",
                "the internet link: cannot watch cloudflared's end",
            );
        }
    }

    fn ended(&self, generation: u64) {
        let ops = lock(&self.door_ops);
        let running = {
            let mut phase = lock(&self.phase);
            match &*phase {
                Phase::On(r) if r.generation == generation => {
                    let Phase::On(r) = std::mem::replace(&mut *phase, Phase::Offline) else {
                        return;
                    };
                    r
                }
                _ => return,
            }
        };
        self.wake.notify_all();
        let mut r = running;
        let _ = r.door.set_origin(None);
        let status = r.tunnel.reap();
        r.door.close();
        crate::log::write(
            "WARN",
            "host",
            &format!(
                "the internet link is offline: cloudflared ended by itself ({})",
                describe(status)
            ),
        );
        drop(ops);
        self.emit();
    }

    /// The quick link's ceiling: wait until it, as *Extend* moves it, then
    /// stop. The wait is a nap at most, the wall clock read after each: a
    /// machine that slept past the ceiling stops the link once it wakes.
    fn watch_ceiling(shared: Arc<Self>, generation: u64) {
        let spawned = std::thread::Builder::new()
            .name("link-ceiling".to_owned())
            .spawn(move || {
                let mut phase = lock(&shared.phase);
                loop {
                    let Phase::On(r) = &*phase else { return };
                    if r.generation != generation {
                        return;
                    }
                    let Some(at) = r.deadline else { return };
                    let left = match at.duration_since((shared.clock.now)()) {
                        Ok(left) if !left.is_zero() => left,
                        _ => {
                            drop(phase);
                            shared.stop_if(Some(generation), LinkEnd::Ceiling);
                            return;
                        }
                    };
                    phase = shared
                        .wake
                        .wait_timeout(phase, left.min(shared.clock.nap))
                        .map_or_else(|e| e.into_inner().0, |(g, _)| g);
                }
            });
        if spawned.is_err() {
            crate::log::write(
                "WARN",
                "host",
                "the internet link: no ceiling could be armed",
            );
        }
    }
}

fn describe(status: Option<std::process::ExitStatus>) -> String {
    status.map_or_else(|| "status unknown".to_owned(), |s| s.to_string())
}

fn view_of(phase: &Phase) -> LinkView {
    match phase {
        Phase::Off(ended) => LinkView {
            state: LinkState::Off,
            origin: None,
            until_ms: None,
            own: false,
            ended: *ended,
            protocol: None,
            download: None,
        },
        Phase::Starting { own, download, .. } => LinkView {
            state: LinkState::Starting,
            origin: None,
            until_ms: None,
            own: *own,
            ended: None,
            protocol: None,
            download: *download,
        },
        Phase::On(r) => LinkView {
            state: LinkState::On,
            origin: Some(r.origin.clone()),
            until_ms: r.deadline.map(epoch_ms),
            own: r.own,
            ended: None,
            protocol: Some(r.protocol.clone()).filter(|p| !p.is_empty()),
            download: None,
        },
        Phase::Offline => LinkView {
            state: LinkState::Offline,
            origin: None,
            until_ms: None,
            own: false,
            ended: Some(LinkEnd::Exited),
            protocol: None,
            download: None,
        },
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
            },
            Timing::default(),
            CEILING,
        )
    })
}

/// `<config>/tunnel/`: the binary and an own address's credentials, never
/// a folder's.
#[must_use]
pub fn tunnel_dir(config: &Path) -> PathBuf {
    config.join("tunnel")
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
    let pin = fetch::pin_here()
        .ok_or_else(|| "no cloudflared is published for this system".to_owned())?;
    let (path, fresh) = fetch::ensure_going(&dir(app)?, pin, &mut fetch::download_sized, going)?;
    if fresh {
        run::version_check(&path, fetch::VERSION)?;
    }
    Ok(path)
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
#[cfg(any(target_os = "macos", windows))]
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
