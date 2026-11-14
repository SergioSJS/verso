// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The internet link's `cloudflared` (ADR 0117 D11 items 5 and 6, D10,
//! D4 item 2): the pinned binary fetched and checked ([`fetch`]), run to a
//! server's loopback listener ([`run`]), the server told the link's origin
//! once a connection is registered, and stopped — on *Stop*, at the
//! twelve-hour ceiling of a quick link (*Extend* pushes it back), when
//! serving stops, at the host's end, and when the [`Manager`] is dropped.
//! When `cloudflared` ends by itself the link is "offline", and nothing
//! restarts it silently. One tunnel at a time.
//!
//! Moved here from the desktop app's `src/tunnel/` (R5, ADR 0117 D4 item
//! 2), not written again, so that both hosts run the same code: the
//! desktop app (`app/src-tauri/src/tunnel/`, its door the local server's
//! `link_open` / `set_link_origin` / `link_close`) and a UniVerso
//! (`verso_server::tunnel`, its door the server's own link listener). The
//! door is a [`Door`]; what a host hears of a change, a closure given to
//! the [`Manager`]; where its log goes, [`log::set`].
//!
//! The log holds no link (D11 item 8): neither the quick link's URL nor an
//! own hostname is written in it, nor a tunnel's token.

pub mod fetch;
pub mod files;
pub use files::STOPPED;
pub mod log;
pub mod named;
pub mod run;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_token;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;

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

/// The local server's door for the link, as the tunnel needs it.
pub trait Door: Send + Sync {
    /// Open the loopback listener; its port.
    fn open(&self) -> Result<u16, String>;
    /// Say (or forget) the link's public origin.
    fn set_origin(&self, origin: Option<&str>) -> Result<(), String>;
    /// Close the listener (the origin is forgotten with it).
    fn close(&self);
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
    /// An own address by a tunnel's token (a UniVerso with no browser, ADR
    /// 0117 D4 item 2, decided 2026-11-13): the tunnel made in Cloudflare's
    /// dashboard, its token handed to `cloudflared` in its environment
    /// (`TUNNEL_TOKEN`, never on the command line nor in a file of ours),
    /// the hostname the dashboard routes to it. No ceiling.
    Token { token: String, hostname: String },
}

impl Mode {
    /// The link is an own address (no ceiling).
    #[must_use]
    pub fn own(&self) -> bool {
        !matches!(self, Self::Quick)
    }
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
        let own = mode.own();
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
                // Still this start's: it failed. Otherwise a stop ended it
                // while it started — the person's Stop or Cancel, serving
                // stopped, the app's end.
                let failed = {
                    let mut phase = lock(&shared.phase);
                    let ours = matches!(&*phase, Phase::Starting { generation: g, .. } if *g == generation);
                    if ours {
                        *phase = Phase::Off(Some(LinkEnd::Failed));
                    }
                    ours
                };
                if !failed {
                    // Said once, at INFO, by the command that started it
                    // (`local_server::platform`), as the person's own act,
                    // whatever the start was doing when it heard the stop:
                    // never a warning (the re-test of 2026-11-04).
                    shared.emit();
                    return Err(STOPPED.to_owned());
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
                return Err(STOPPED.to_owned());
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
            Mode::Token { token, .. } => run::up_with(
                program,
                &|h2| named::token_run_args(port, h2),
                &run::Extra {
                    token: Some(token),
                    refusal_ends: true,
                },
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
            Mode::Own { hostname, .. } | Mode::Token { hostname, .. } => {
                (format!("https://{hostname}"), Some(hostname.clone()))
            }
        };
        let mut tunnel = up.tunnel;
        let said = {
            let _ops = lock(&shared.door_ops);
            if mine() {
                door.set_origin(Some(&origin))
            } else {
                Err(STOPPED.to_owned())
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
                return Err(STOPPED.to_owned());
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
                        Seen::Refused(words) => crate::log::write(
                            "WARN",
                            "host",
                            &format!("cloudflared: Cloudflare refused the tunnel: {words}"),
                        ),
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

/// `<config>/tunnel/`: the binary and an own address's credentials, never
/// a folder's. A UniVerso's is `<VERSO_DATA_DIR>/tunnel/`.
#[must_use]
pub fn tunnel_dir(config: &Path) -> PathBuf {
    config.join("tunnel")
}
