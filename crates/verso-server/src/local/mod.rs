// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! "This app is a server" (ADR 0096; ADR 0073 item 2): the desktop app
//! serves the folders its owner ticked on the local network, to the phone's
//! browser, with the same service and the same code as `verso serve` — a
//! change of address, not of protocol.
//!
//! What is different is the posture. It is **off** until the person turns
//! it on, and off again at every start unless they asked it to keep on. It
//! listens only on the private addresses of the machine's interfaces and
//! stops when that set changes. It speaks TLS with a certificate of its
//! own. A phone gets in only by **pairing**: a QR (or a code) on the
//! laptop, valid two minutes, once, and the laptop asks "Was it you?". It
//! runs only the commands on an allowlist. Everything it keeps is in the
//! app's configuration directory, never in a served folder.
//!
//! The pieces are small and each one is tested alone: [`net`] (which
//! addresses), [`cert`] (the identity), [`pairing`] (the state machine),
//! [`allow`] (the commands), [`qr`] (what the QR carries), [`announce`]
//! (mDNS) and [`routes`] (the table of routes). This file joins them.

pub mod allow;
pub mod announce;
mod bind;
pub mod cert;
pub mod net;
pub mod pairing;
mod parts;
pub mod qr;
mod routes;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_parts;
#[cfg(test)]
mod tests_parts_bin;
#[cfg(test)]
mod tests_serving;

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use verso_service::lock;

use self::bind::bind_all;
pub use self::bind::reachable;
use self::net::{IfNet, Interfaces};
use self::pairing::{Ended, Pairing, PendingView, Polled, Ready, Redeemed};
use crate::config::Config;
use crate::db::{Audit, Db, Phone, Role};
use crate::state::Server;

/// Phones paired at once, at most (ADR 0096 item 13).
pub const PAIRED: usize = 4;

/// Phones connected at once: the default of the setting, as many as may be
/// paired, and its bounds (ADR 0096 item 13, amended 2026-10-16: the
/// ceiling became a setting).
pub const CONNECTED: u32 = 4;
pub const CONNECTED_LEAST: u32 = 1;
pub const CONNECTED_MOST: u32 = 16;

/// How often the watcher looks at the network and the clock.
const TICK: Duration = Duration::from_secs(2);

/// A tick later than this after the last one is a computer that slept.
const SLEPT: Duration = Duration::from_secs(20);

/// What the host hears, to show the person.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Event {
    /// Something Settings shows changed: serving, a phone, a list.
    Changed,
    /// A phone presented the token and waits for Allow or Refuse.
    Asked,
    /// A paired phone connected for the first time (the notification of
    /// item 14).
    PhoneConnected { name: String },
    /// Serving stopped by itself.
    Stopped { why: String },
    /// A start left out chosen folders no longer on the disk (`folder/chosen`
    /// each): said as a notice, on a start the person made or one the app did.
    Dropped { what: Vec<String> },
    /// The app could not reach its own address on the network: the system
    /// (a firewall) is probably refusing connections in (item 9).
    Unreachable,
    /// The pairing window ended without an answer.
    PairingEnded { why: String },
}

type Sink = Arc<dyn Fn(Event) + Send + Sync>;

/// Phones connected, counted by session, for the limit of item 13.
pub struct PhoneGuard {
    map: Arc<Mutex<HashMap<String, u32>>>,
    session: String,
    /// The phone's name, for the log's line when its last connection ends.
    name: String,
}

impl Drop for PhoneGuard {
    fn drop(&mut self) {
        let mut held = lock(&self.map);
        if let Some(n) = held.get_mut(&self.session) {
            *n = n.saturating_sub(1);
            if *n == 0 {
                held.remove(&self.session);
                drop(held);
                crate::log::info(&format!("a paired phone disconnected: {}", self.name));
            }
        }
    }
}

/// What the server consults while it runs "this app is a server": the
/// addresses it answers to, the folders and their names, the pairing
/// window, the phones connected.
pub struct Policy {
    hosts: RwLock<Vec<String>>,
    folders: RwLock<HashMap<String, PathBuf>>,
    served: RwLock<Vec<IfNet>>,
    pairing: Mutex<Pairing>,
    connected: Arc<Mutex<HashMap<String, u32>>>,
    events: Sink,
    announcer: Mutex<Option<announce::Announcer>>,
    listening: RwLock<(u16, Vec<IpAddr>)>,
    refused_said: crate::log::OnceAMinute,
    /// The setting `max_connected`, read at every new connection.
    connected_most: std::sync::atomic::AtomicU32,
    /// When each phone's refusal by that ceiling was last logged and
    /// audited: once a minute per phone, whatever the pace it retries at.
    full_said: Mutex<HashMap<String, Instant>>,
    /// The folders served in part (item 2, amended 2026-10-16).
    parts: parts::Parts,
    /// Loopback let in as a peer, for the tests only.
    #[cfg(test)]
    test_loopback: std::sync::atomic::AtomicBool,
}

impl Policy {
    #[must_use]
    pub fn new(events: Sink) -> Arc<Self> {
        Arc::new(Self {
            hosts: RwLock::new(Vec::new()),
            folders: RwLock::new(HashMap::new()),
            served: RwLock::new(Vec::new()),
            pairing: Mutex::new(Pairing::default()),
            connected: Arc::new(Mutex::new(HashMap::new())),
            events,
            announcer: Mutex::new(None),
            listening: RwLock::new((0, Vec::new())),
            refused_said: crate::log::OnceAMinute::default(),
            connected_most: std::sync::atomic::AtomicU32::new(CONNECTED),
            full_said: Mutex::new(HashMap::new()),
            parts: parts::Parts::default(),
            #[cfg(test)]
            test_loopback: std::sync::atomic::AtomicBool::new(false),
        })
    }

    fn emit(&self, e: Event) {
        (self.events)(e);
    }

    /// The addresses served and the names the `Host` header may carry.
    fn set_network(&self, served: &[IfNet], port: u16, extra_hosts: &[String]) {
        let mut hosts: Vec<String> = served
            .iter()
            .map(|n| net::authority(n.ip, port).to_lowercase())
            .collect();
        hosts.extend(extra_hosts.iter().map(|h| h.to_lowercase()));
        *self
            .hosts
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = hosts;
        *self
            .served
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = served.to_vec();
        *self
            .listening
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) =
            (port, served.iter().map(|n| n.ip).collect());
    }

    fn set_folders(&self, folders: HashMap<String, PathBuf>) {
        *self
            .folders
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = folders;
    }

    /// Whether `host` (a `Host` header) is one of the addresses this server
    /// answers to.
    #[must_use]
    pub fn knows_host(&self, host: &str) -> bool {
        let host = host.to_lowercase();
        self.hosts
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .contains(&host)
    }

    /// The test of a peer's address for the listener (item 3): private, and
    /// on a subnet of the machine.
    #[must_use]
    pub fn admit_fn(self: &Arc<Self>) -> crate::listen::Admit {
        let policy = Arc::clone(self);
        Arc::new(move |ip| {
            let served = policy
                .served
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            #[cfg(test)]
            if ip.is_loopback() && policy.test_loopback.load(Ordering::Relaxed) {
                return true;
            }
            net::admits(&served, ip)
        })
    }

    /// The directory behind the name a folder was given.
    #[must_use]
    pub fn folder_path(&self, name: &str) -> Option<PathBuf> {
        self.folders
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(name)
            .cloned()
    }

    /// A place for session `session` among the phones connected (item 13):
    /// a phone connected already takes another connection without taking
    /// another place.
    #[must_use]
    pub fn enter(&self, session: &str, name: &str) -> Option<PhoneGuard> {
        let mut held = lock(&self.connected);
        if !held.contains_key(session)
            && held.len() >= self.connected_most.load(Ordering::Relaxed) as usize
        {
            return None;
        }
        let first = !held.contains_key(session);
        *held.entry(session.to_owned()).or_insert(0) += 1;
        drop(held);
        if first {
            crate::log::info(&format!("a paired phone connected: {name}"));
        }
        Some(PhoneGuard {
            map: Arc::clone(&self.connected),
            session: session.to_owned(),
            name: name.to_owned(),
        })
    }

    /// The ceiling of phones connected, from the setting: new connections
    /// only; nobody connected is disconnected by a lower number.
    pub fn set_connected_most(&self, most: u32) {
        self.connected_most.store(
            most.clamp(CONNECTED_LEAST, CONNECTED_MOST),
            Ordering::Relaxed,
        );
    }

    /// The ceiling of phones connected now.
    #[must_use]
    pub fn connected_most(&self) -> u32 {
        self.connected_most.load(Ordering::Relaxed)
    }

    /// A phone refused because the most phones are connected already
    /// (item 13): the log has it once a minute per phone (item 14, 0083
    /// item 1), and so does the audit log Settings shows, naming it.
    pub fn refused_full(&self, server: &Server, session: &str, name: &str) {
        {
            let mut said = lock(&self.full_said);
            let minute = Duration::from_secs(60);
            if said.get(session).is_some_and(|at| at.elapsed() < minute) {
                return;
            }
            said.retain(|_, at| at.elapsed() < minute);
            said.insert(session.to_owned(), Instant::now());
        }
        crate::log::warn(&format!(
            "a connection refused: the phones connected holds {} already ({name} waits)",
            self.connected_most.load(Ordering::Relaxed)
        ));
        self.audit(server, "phone_connection_refused", Some(name), None);
    }

    /// A phone's name, for the log; empty when it is not found.
    #[must_use]
    pub fn name_of(&self, server: &Server, session: &str) -> String {
        server
            .db
            .phones()
            .ok()
            .and_then(|p| p.into_iter().find(|p| p.id == session))
            .map(|p| p.name)
            .unwrap_or_default()
    }

    /// How many phones are connected now.
    #[must_use]
    pub fn connected(&self) -> usize {
        lock(&self.connected).len()
    }

    /// A phone connecting: the first time after it was paired, the person
    /// is told (item 14), and the audit log says so.
    pub fn first_seen(&self, server: &Server, session: &str) {
        match server.db.first_seen(session) {
            Ok(true) => {
                let name = server
                    .db
                    .phones()
                    .ok()
                    .and_then(|p| p.into_iter().find(|p| p.id == session))
                    .map(|p| p.name)
                    .unwrap_or_default();
                crate::log::info("a paired phone connected for the first time");
                self.audit(server, "phone_first_connection", Some(&name), None);
                self.emit(Event::PhoneConnected { name });
            }
            Ok(false) => {}
            Err(e) => crate::log::error(&format!("a phone's first connection: {e}")),
        }
    }

    fn audit(&self, server: &Server, action: &str, subject: Option<&str>, address: Option<&str>) {
        if let Err(e) = server.db.audit(&Audit {
            actor: None,
            action,
            subject,
            folder: None,
            address,
            ok: true,
        }) {
            crate::log::error(&format!("audit log: {e}"));
        }
    }

    fn pairing(&self) -> std::sync::MutexGuard<'_, Pairing> {
        lock(&self.pairing)
    }

    /// Whether a pairing window is open now.
    pub fn pairing_open(&self, now: Instant) -> bool {
        self.pairing().is_open(now)
    }

    /// A phone presented `presented`; see [`Pairing::redeem`]. What the
    /// laptop must know is logged and audited here — never the token, the
    /// QR's contents or the fragment.
    pub fn redeem(
        &self,
        server: &Server,
        presented: &str,
        device: &str,
        address: &str,
        now: Instant,
    ) -> Result<Redeemed, String> {
        let result =
            self.pairing()
                .redeem(presented, device, address, &crate::log::stamp(), now)?;
        match &result {
            Redeemed::Asked { .. } => {
                crate::log::info(&format!(
                    "a token was redeemed by {address}; the computer is asked"
                ));
                self.audit(server, "pair_asked", Some(device), Some(address));
                self.emit(Event::Asked);
            }
            Redeemed::Refused { ended } => {
                crate::log::warn(&format!("a wrong or reused pairing token from {address}"));
                self.audit(server, "pair_refused_attempt", None, Some(address));
                if let Some(why) = ended {
                    self.ended(server, *why);
                }
            }
            Redeemed::Closed => {}
        }
        Ok(result)
    }

    /// The phone asks for the answer; `None` when there is no pairing at
    /// all.
    pub fn poll(&self, secret: &str, now: Instant) -> Option<Polled> {
        let mut p = self.pairing();
        if p.idle() {
            return None;
        }
        Some(p.poll(secret, now))
    }

    /// The window ended: logged, audited, announced no more, told.
    fn ended(&self, server: &Server, why: Ended) {
        self.stop_announcing();
        let (action, said) = match why {
            Ended::Closed => ("pair_closed", "closed"),
            Ended::Expired => ("pair_expired", "expired"),
            Ended::TooManyFailures => ("pair_failures", "failures"),
            Ended::Answered => ("pair_answered", "answered"),
        };
        crate::log::info(&format!("the pairing window ended: {said}"));
        self.audit(server, action, None, None);
        self.emit(Event::PairingEnded {
            why: said.to_owned(),
        });
    }

    /// Stop announcing on the network; the goodbye is sent as it drops.
    fn stop_announcing(&self) {
        let announcer = lock(&self.announcer).take();
        if let Some(a) = announcer {
            a.stop();
        }
    }

    fn start_announcing(&self) {
        let (port, ips) = self
            .listening
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        match announce::Announcer::start(port, &ips) {
            Ok(a) => {
                *lock(&self.announcer) = Some(a);
            }
            // Announcing is for a second desktop; a phone does not need it.
            Err(e) => crate::log::warn(&format!("announcing on the local network: {e}")),
        }
    }
}

/// A command a phone ran and was refused: said in the log at most once a
/// minute, by name (a name of the contract, never an argument).
pub fn refused_command(server: &Server, cmd: &str) {
    if let Some(local) = &server.local {
        let name: String = cmd
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
            .take(48)
            .collect();
        local.refused_said.warn(&format!(
            "a paired phone ran a command that is not its to run: {name}"
        ));
    }
}

/// The settings of the mode that outlast a start.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LocalSettings {
    /// Keep serving on at the next start (item 1's separate switch; off by
    /// default).
    pub keep_on: bool,
    /// The folders ticked, as the host knows them (paths, at this edge
    /// only).
    pub folders: Vec<String>,
    /// For a folder served in part (item 2, amended 2026-10-16), the folders
    /// chosen inside it, relative to it: keyed by the folder's path as in
    /// `folders`. A folder with none here is served whole.
    pub parts: std::collections::BTreeMap<String, Vec<String>>,
    /// The host's own certificate and key, when the person gave them
    /// (item 5 (d)), and the name that certificate is for.
    pub cert_file: Option<String>,
    pub key_file: Option<String>,
    pub host_name: Option<String>,
    /// Phones connected at once, at most, `CONNECTED_LEAST..=CONNECTED_MOST`
    /// (item 13, amended 2026-10-16).
    pub max_connected: u32,
}

impl Default for LocalSettings {
    fn default() -> Self {
        Self {
            keep_on: false,
            folders: Vec::new(),
            parts: std::collections::BTreeMap::new(),
            cert_file: None,
            key_file: None,
            host_name: None,
            max_connected: CONNECTED,
        }
    }
}

const SETTINGS: &str = "local.settings";
const PORT: &str = "local.port";

/// The state of the mode for Settings.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub serving: bool,
    pub port: Option<u16>,
    pub addresses: Vec<String>,
    pub phones_paired: usize,
    pub phones_connected: usize,
    pub pairing_open: bool,
    /// The fingerprint the phone is shown, in the form a person compares.
    pub fingerprint: Option<String>,
    /// `own` (self-signed, trust on first use) or `files` (the host's).
    pub certificate: String,
    /// Tailscale seems to be running on this computer (item 5 (d)).
    pub tailscale: bool,
    /// Why serving last stopped by itself, for the person to read.
    pub stopped_because: Option<String>,
    /// A connection from this computer to its own address failed: the
    /// system's firewall is refusing what comes in (item 9).
    pub unreachable: bool,
    /// The setting: phones connected at once, at most.
    pub max_connected: u32,
    /// The folders chosen inside a served folder that this start left out
    /// for not being on the disk: (the folder's path, the chosen folder).
    pub dropped: Vec<(String, String)>,
}

/// What the pairing dialog shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairView {
    pub url: String,
    pub address: String,
    /// Every address that can be shown, best first, with what each is.
    /// Empty when the host's own certificate and name are used: then the
    /// name is the only address.
    pub choices: Vec<AddressChoice>,
    /// The address (no port) the QR and the link are for.
    pub chosen: String,
    pub code: String,
    pub qr: Vec<String>,
    pub expires_in: u64,
    pub fingerprint: String,
    pub certificate: String,
}

/// One address the pairing dialog may show (ADR 0096 item 3, as built).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressChoice {
    pub address: String,
    pub interface: String,
    /// `lan` (Wi-Fi, Ethernet) or `virtual` (a VPN, ZeroTier, a bridge...).
    pub kind: String,
    /// What a virtual interface probably is, a guess (`ZeroTier`, `VPN`).
    pub hint: Option<String>,
    /// The address of the system's default route.
    pub default_route: bool,
}

/// The dialog's state, polled while it is open.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairState {
    pub open: bool,
    pub remaining: u64,
    pub asked: Option<PendingView>,
}

/// One running instance of the mode.
struct Running {
    id: u64,
    /// Taken (and shut down without waiting) when this is dropped: a
    /// runtime cannot be dropped in an asynchronous context, which the
    /// host and the tests both may be in.
    runtime: Option<tokio::runtime::Runtime>,
    server: Arc<Server>,
    policy: Arc<Policy>,
    stop: tokio::sync::watch::Sender<bool>,
    nets: Vec<IfNet>,
    port: u16,
    fingerprint: String,
    certificate: &'static str,
    tailscale: bool,
    /// The result of the app's try at its own address (item 9): 0 not
    /// tried yet, 1 reached, 2 not reached.
    reach: Arc<std::sync::atomic::AtomicU8>,
}

impl Drop for Running {
    fn drop(&mut self) {
        // The listeners end on the signal, the goodbye is sent, and the
        // runtime's tasks go with it; none of it is waited for.
        let _ = self.stop.send(true);
        self.policy.stop_announcing();
        if let Some(runtime) = self.runtime.take() {
            runtime.shutdown_background();
        }
    }
}

struct Shared {
    dir: PathBuf,
    /// Where the window's files for a browser may be, in order: the app's
    /// resources, and in a development build the build beside the source.
    ui_dirs: Vec<PathBuf>,
    commit: String,
    events: Sink,
    ifaces: Arc<dyn Interfaces>,
    inner: Mutex<Option<Running>>,
    last_stop: Mutex<Option<String>>,
    next: AtomicU64,
    /// Loopback let in as a private address: for the tests only, which
    /// cannot count on a private address on the machine they run on.
    #[cfg(test)]
    loopback: bool,
}

/// "This app is a server", for the host to turn on and off.
#[derive(Clone)]
pub struct LocalServer {
    shared: Arc<Shared>,
}

impl LocalServer {
    /// With the system's interfaces. `dir` is the app's configuration
    /// directory for this mode (the database and the indexes), `ui_dir` the
    /// window's files for a browser.
    #[must_use]
    pub fn new(dir: PathBuf, ui_dirs: Vec<PathBuf>, commit: &str, events: Sink) -> Self {
        Self::with_interfaces(dir, ui_dirs, commit, events, Arc::new(net::System))
    }

    #[must_use]
    pub fn with_interfaces(
        dir: PathBuf,
        ui_dirs: Vec<PathBuf>,
        commit: &str,
        events: Sink,
        ifaces: Arc<dyn Interfaces>,
    ) -> Self {
        Self {
            shared: Arc::new(Shared {
                dir,
                ui_dirs,
                commit: commit.to_owned(),
                events,
                ifaces,
                inner: Mutex::new(None),
                last_stop: Mutex::new(None),
                next: AtomicU64::new(1),
                #[cfg(test)]
                loopback: false,
            }),
        }
    }

    /// The addresses to serve out of the machine's: the private ones.
    /// Under test, loopback may stand in (a test cannot count on a private
    /// address on the machine it runs on).
    fn addresses(&self, all: &[IfNet]) -> Vec<IfNet> {
        #[cfg(test)]
        if self.shared.loopback {
            return all.to_vec();
        }
        net::servable(all)
    }

    /// For the tests: the given interfaces, and loopback standing in for a
    /// private address when `loopback` is set.
    #[cfg(test)]
    fn for_tests(
        dir: PathBuf,
        ui_dirs: Vec<PathBuf>,
        events: Sink,
        ifaces: Arc<dyn Interfaces>,
        loopback: bool,
    ) -> Self {
        Self {
            shared: Arc::new(Shared {
                dir,
                ui_dirs,
                commit: "test".to_owned(),
                events,
                ifaces,
                inner: Mutex::new(None),
                last_stop: Mutex::new(None),
                next: AtomicU64::new(1),
                loopback,
            }),
        }
    }

    fn open_db(&self) -> Result<Db, String> {
        crate::data::ensure_dir(&self.shared.dir.join("indexes"))
            .map_err(|e| format!("{}: {e}", self.shared.dir.display()))?;
        Db::open(&self.shared.dir)
    }

    /// `f` over the database: the running server's, or one opened for the
    /// moment while it is off (Settings lists phones and the audit log
    /// either way).
    fn with_db<T>(&self, f: impl FnOnce(&Db) -> Result<T, String>) -> Result<T, String> {
        let running = lock(&self.shared.inner);
        match running.as_ref() {
            Some(r) => f(&r.server.db),
            None => {
                drop(running);
                f(&self.open_db()?)
            }
        }
    }

    /// The settings kept across starts.
    pub fn settings(&self) -> Result<LocalSettings, String> {
        self.with_db(|db| Ok(read_settings(db)))
    }

    pub fn set_settings(&self, settings: &LocalSettings) -> Result<(), String> {
        if !(CONNECTED_LEAST..=CONNECTED_MOST).contains(&settings.max_connected) {
            return Err(format!(
                "phones connected at once: between {CONNECTED_LEAST} and {CONNECTED_MOST}"
            ));
        }
        // What is chosen inside a folder is valid before it is kept.
        for chosen in settings.parts.values() {
            parts::clean(chosen)?;
        }
        let text = serde_json::to_string(settings).map_err(|e| e.to_string())?;
        self.with_db(|db| db.set_setting(SETTINGS, &text))?;
        // At once, for new connections; no one connected is cut off.
        if let Some(r) = lock(&self.shared.inner).as_ref() {
            r.policy.set_connected_most(settings.max_connected);
        }
        Ok(())
    }

    /// The state for Settings.
    pub fn status(&self) -> Result<Status, String> {
        let stopped_because = lock(&self.shared.last_stop).clone();
        let tailscale = net::tailscale_seen(&self.shared.ifaces.list());
        let running = lock(&self.shared.inner);
        let Some(r) = running.as_ref() else {
            drop(running);
            let paired = self.with_db(|db| db.phone_count())?;
            let dropped = self.with_db(|db| Ok(parts::read_dropped(db)))?;
            return Ok(Status {
                dropped,
                phones_paired: paired,
                max_connected: self.settings()?.max_connected,
                certificate: "own".to_owned(),
                tailscale,
                stopped_because,
                ..Status::default()
            });
        };
        Ok(Status {
            serving: true,
            port: Some(r.port),
            addresses: r.nets.iter().map(|n| n.ip.to_string()).collect(),
            phones_paired: r.server.db.phone_count()?,
            phones_connected: r.policy.connected(),
            pairing_open: r.policy.pairing_open(Instant::now()),
            fingerprint: Some(cert::spaced(&r.fingerprint)),
            certificate: r.certificate.to_owned(),
            tailscale: r.tailscale,
            stopped_because: None,
            unreachable: r.reach.load(Ordering::Relaxed) == 2,
            max_connected: read_settings(&r.server.db).max_connected,
            dropped: parts::read_dropped(&r.server.db),
        })
    }

    /// Turn serving on, over the folders ticked. `Err` says why it did not
    /// start, in words the person reads.
    pub fn start(&self) -> Result<Status, String> {
        if lock(&self.shared.inner).is_some() {
            return self.status();
        }
        let settings = self.settings()?;
        if settings.folders.is_empty() {
            return Err("tick at least one folder to serve".to_owned());
        }
        // The window the phone's browser is served: without its files a
        // phone would get a blank page, so it is said here instead.
        let ui_dir = self
            .shared
            .ui_dirs
            .iter()
            .find(|d| crate::data::readable(&d.join("web.html")))
            .cloned()
            .ok_or_else(|| {
                "this build of the app has no web files for the phone (web.html): reinstall the app, or build the window first (npm run build in app/ui)".to_owned()
            })?;
        let all = self.shared.ifaces.list();
        // Best first: the default route's address, then real networks, then
        // virtual ones (a VPN's, ZeroTier's): `nets[0]` is what is shown.
        let nets = net::rank(&self.addresses(&all), self.shared.ifaces.default_route());
        if nets.is_empty() {
            return Err(
                "this computer has no private network address: join a Wi-Fi or Ethernet network, then turn it on again"
                    .to_owned(),
            );
        }
        let db = self.open_db()?;
        let owner = db.local_owner()?;
        db.purge_phones()?;
        // The folders ticked, by the name each is given; the registry in the
        // database follows them.
        let folders = names_for(&settings.folders);
        let served = parts::plan(&folders, &settings.parts)?;
        let reconciled = parts::reconcile(&db, &owner.id, &served)?;
        let ips: Vec<IpAddr> = nets.iter().map(|n| n.ip).collect();
        // The certificate: the host's own files when given, else ours.
        let (fingerprint, certificate, acceptor) = match (&settings.cert_file, &settings.key_file) {
            (Some(c), Some(k)) if !c.is_empty() && !k.is_empty() => {
                let (c, k) = (PathBuf::from(c), PathBuf::from(k));
                (
                    cert::from_files(&c, &k)?,
                    "files",
                    crate::tls::acceptor(&c, &k)?,
                )
            }
            _ => {
                let id = cert::load_or_make(&db, &ips, crate::db::now())?;
                let (chain, key) = id.der();
                (
                    id.fingerprint.clone(),
                    "own",
                    crate::tls::acceptor_from(chain, key)?,
                )
            }
        };
        let _ = tokio_rustls::rustls::crypto::ring::default_provider().install_default();
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;
        // One port for every address, kept once chosen (item 4).
        let (listeners, port) = bind_all(&db, &nets)?;
        let policy = Policy::new(Arc::clone(&self.shared.events));
        policy.set_connected_most(settings.max_connected);
        let extra: Vec<String> = settings
            .host_name
            .iter()
            .filter(|h| !h.is_empty())
            .map(|h| format!("{h}:{port}"))
            .collect();
        #[cfg(test)]
        policy
            .test_loopback
            .store(self.shared.loopback, Ordering::Relaxed);
        policy.set_network(&nets, port, &extra);
        policy.set_folders(folders);
        for (folder, part) in &reconciled.dropped {
            crate::log::warn(&format!(
                "a chosen folder is not there any more and is left out: {part} (in {folder})"
            ));
        }
        parts::write_dropped(&db, &reconciled.dropped)?;
        if !reconciled.dropped.is_empty() {
            let what = reconciled
                .dropped
                .iter()
                .map(|(folder, part)| {
                    let name = std::path::Path::new(folder)
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    format!("{name}/{part}")
                })
                .collect();
            (self.shared.events)(Event::Dropped { what });
        }
        policy.parts.set(reconciled);
        let config = Config::for_local(
            self.shared.dir.clone(),
            ui_dir,
            SocketAddr::new(nets[0].ip, port),
        );
        let server = Server::new_local(
            config,
            db,
            crate::contract_version(),
            self.shared.commit.clone(),
            Arc::clone(&policy),
        );
        let (stop, stopped) = tokio::sync::watch::channel(false);
        let _ = server.runtime.set(runtime.handle().clone());
        {
            let _enter = runtime.enter();
            for std_listener in listeners {
                let tcp =
                    tokio::net::TcpListener::from_std(std_listener).map_err(|e| e.to_string())?;
                let tls =
                    crate::tls::TlsListener::new(tcp, acceptor.clone(), Arc::clone(&server.slots))
                        .map_err(|e| e.to_string())?;
                let app = routes::router(Arc::clone(&server));
                let mut stopped = stopped.clone();
                runtime.spawn(async move {
                    crate::listen::serve(tls, app, async move {
                        let _ = stopped.wait_for(|s| *s).await;
                    })
                    .await;
                });
            }
            runtime.spawn(crate::audit::daily(Arc::clone(&server)));
            runtime.spawn(crate::trash::daily(Arc::clone(&server)));
            runtime.spawn(crate::history::daily(Arc::clone(&server)));
        }
        let id = self.shared.next.fetch_add(1, Ordering::Relaxed);
        let tailscale = net::tailscale_seen(&all_for_hint(&self.shared));
        let on: Vec<String> = nets
            .iter()
            .map(|n| format!("{} ({})", n.ip, n.name))
            .collect();
        crate::log::info(&format!(
            "local server on: {}; port {port}; certificate: {certificate}; {} folder(s)",
            on.join(", "),
            settings.folders.len()
        ));
        policy.audit(
            &server,
            "local_on",
            Some(&format!("{} address(es), port {port}", nets.len())),
            None,
        );
        *lock(&self.shared.inner) = Some(Running {
            id,
            runtime: Some(runtime),
            server,
            policy,
            stop,
            nets,
            port,
            fingerprint,
            certificate,
            tailscale,
            reach: Arc::new(std::sync::atomic::AtomicU8::new(0)),
        });
        *lock(&self.shared.last_stop) = None;
        self.spawn_watcher(id);
        (self.shared.events)(Event::Changed);
        self.status()
    }

    /// The thread that looks at the network and the clock while serving. A
    /// thread and not a task: stopping drops the runtime, which a task of
    /// that runtime cannot do.
    fn spawn_watcher(&self, id: u64) {
        let weak = Arc::downgrade(&self.shared);
        std::thread::spawn(move || {
            let mut last = std::time::SystemTime::now();
            // Once, as it starts: can this computer reach its own address?
            if let Some(shared) = weak.upgrade() {
                LocalServer { shared }.self_test(id);
            }
            loop {
                std::thread::sleep(TICK);
                let Some(shared) = weak.upgrade() else { return };
                let me = LocalServer { shared };
                let now = std::time::SystemTime::now();
                let slept = now.duration_since(last).unwrap_or_default() > SLEPT;
                last = now;
                if !me.watch_once(id, slept) {
                    return;
                }
            }
        });
    }

    /// The app connects to its own address on the network once (item 9): a
    /// firewall that refuses what comes in refuses this too, and the person
    /// is told with the steps to allow it, instead of a phone that cannot
    /// reach and says nothing. It adds no rule and asks no elevation.
    fn self_test(&self, id: u64) {
        let (addr, reach, policy) = {
            let running = lock(&self.shared.inner);
            let Some(r) = running.as_ref().filter(|r| r.id == id) else {
                return;
            };
            (
                SocketAddr::new(r.nets[0].ip, r.port),
                Arc::clone(&r.reach),
                Arc::clone(&r.policy),
            )
        };
        let ok = reachable(addr);
        reach.store(if ok { 1 } else { 2 }, Ordering::Relaxed);
        if !ok {
            crate::log::warn(&format!(
                "this computer could not connect to its own address {addr}: a firewall is probably refusing connections in"
            ));
            policy.emit(Event::Unreachable);
            policy.emit(Event::Changed);
        }
    }

    /// One look: false when this instance is over (stopped, or another
    /// one runs).
    fn watch_once(&self, id: u64, slept: bool) -> bool {
        let (changed, expired) = {
            let running = lock(&self.shared.inner);
            let Some(r) = running.as_ref().filter(|r| r.id == id) else {
                return false;
            };
            let now_nets = self.addresses(&self.shared.ifaces.list());
            let changed = !net::same_set(&now_nets, &r.nets);
            if slept && !changed {
                crate::log::info("the computer woke; the addresses are the same, serving goes on");
                if r.policy.pairing_open(Instant::now()) {
                    // The goodbye was lost with the sleep: announce again.
                    r.policy.stop_announcing();
                    r.policy.start_announcing();
                }
            }
            let mut expired = None;
            if !changed {
                let mut p = r.policy.pairing();
                expired = p.expire(Instant::now());
                for session in p.sweep(Instant::now()) {
                    let _ = r.server.db.end_session(&owner_of(&r.server), &session);
                }
            }
            if let Some(why) = expired {
                r.policy.ended(&r.server, why);
            }
            (changed, expired)
        };
        let _ = expired;
        if changed {
            crate::log::warn("the network's addresses changed: serving stops");
            self.stop_because("the network changed: turn serving on again to serve on this one");
            return false;
        }
        true
    }

    fn stop_because(&self, why: &str) {
        self.stop_inner();
        *lock(&self.shared.last_stop) = Some(why.to_owned());
        (self.shared.events)(Event::Stopped {
            why: why.to_owned(),
        });
        (self.shared.events)(Event::Changed);
    }

    /// Turn serving off: the port closes, every connection with it, the
    /// goodbye is sent, the pairing window ends.
    pub fn stop(&self) {
        let was = self.stop_inner();
        *lock(&self.shared.last_stop) = None;
        if was {
            (self.shared.events)(Event::Changed);
        }
    }

    fn stop_inner(&self) -> bool {
        let running = lock(&self.shared.inner).take();
        let Some(r) = running else { return false };
        r.policy.pairing().close();
        r.policy.stop_announcing();
        r.policy.audit(&r.server, "local_off", None, None);
        crate::log::info("local server stopped");
        // Dropping it ends the listeners and the runtime ([`Running`]).
        drop(r);
        true
    }

    /// Open the pairing window and say what the dialog shows. Needs serving
    /// to be on.
    pub fn pair_open(&self) -> Result<PairView, String> {
        self.pair_open_on(None)
    }

    /// As [`Self::pair_open`], for the address the person picked (`None`:
    /// the best one). The certificate names every address served, so any
    /// of them is valid; a new window (a new one-time token and code)
    /// replaces the one that was open.
    pub fn pair_open_on(&self, address: Option<&str>) -> Result<PairView, String> {
        let running = lock(&self.shared.inner);
        let r = running
            .as_ref()
            .ok_or_else(|| "turn serving on first".to_owned())?;
        if r.server.db.phone_count()? >= PAIRED {
            return Err(format!(
                "{PAIRED} phones are paired already: revoke one before pairing another"
            ));
        }
        let chosen_net = match address.filter(|a| !a.is_empty()) {
            None => &r.nets[0],
            Some(a) => r
                .nets
                .iter()
                .find(|n| n.ip.to_string() == a)
                .ok_or_else(|| format!("{a} is not an address this computer serves now"))?,
        };
        let default = self.shared.ifaces.default_route();
        let opened = r.policy.pairing().open(Instant::now())?;
        let settings_name = read_settings(&r.server.db)
            .host_name
            .filter(|h| !h.is_empty());
        let authority = match settings_name {
            Some(h) if r.certificate == "files" => format!("{h}:{}", r.port),
            _ => net::authority(chosen_net.ip, r.port),
        };
        let named = r.certificate == "files"
            && authority
                .rsplit_once(':')
                .is_some_and(|(h, _)| h.parse::<IpAddr>().is_err());
        let choices: Vec<AddressChoice> = if named {
            Vec::new()
        } else {
            r.nets
                .iter()
                .map(|n| AddressChoice {
                    address: n.ip.to_string(),
                    interface: n.name.clone(),
                    kind: match net::kind_of(&n.name) {
                        net::Kind::Lan => "lan",
                        net::Kind::Virtual => "virtual",
                    }
                    .to_owned(),
                    hint: net::hint_of(&n.name).map(str::to_owned),
                    default_route: Some(n.ip) == default,
                })
                .collect()
        };
        let payload = qr::Payload {
            authority: authority.clone(),
            token: opened.token,
            fingerprint: r.fingerprint.clone(),
            contract: r.server.contract.clone(),
        };
        let url = qr::url(&payload);
        let matrix = qr::matrix(&url)?;
        r.policy.start_announcing();
        r.policy.audit(&r.server, "pair_open", None, None);
        crate::log::info(&format!("the pairing window opened, for {}", chosen_net.ip));
        (self.shared.events)(Event::Changed);
        Ok(PairView {
            url,
            address: authority,
            choices,
            chosen: chosen_net.ip.to_string(),
            code: opened.code,
            qr: matrix,
            expires_in: opened.expires_in.as_secs(),
            fingerprint: cert::spaced(&r.fingerprint),
            certificate: r.certificate.to_owned(),
        })
    }

    /// Close the pairing window (the dialog was closed).
    pub fn pair_close(&self) {
        let running = lock(&self.shared.inner);
        if let Some(r) = running.as_ref() {
            let was_open = r.policy.pairing_open(Instant::now());
            r.policy.pairing().close();
            if was_open {
                r.policy.ended(&r.server, Ended::Closed);
            }
        }
        drop(running);
        (self.shared.events)(Event::Changed);
    }

    /// The dialog's state: how long is left, and who is asking.
    pub fn pair_state(&self) -> PairState {
        let running = lock(&self.shared.inner);
        let Some(r) = running.as_ref() else {
            return PairState {
                open: false,
                remaining: 0,
                asked: None,
            };
        };
        let now = Instant::now();
        let mut p = r.policy.pairing();
        if let Some(why) = p.expire(now) {
            drop(p);
            r.policy.ended(&r.server, why);
            return PairState {
                open: false,
                remaining: 0,
                asked: None,
            };
        }
        PairState {
            open: p.is_open(now),
            remaining: p.remaining(now).map_or(0, |d| d.as_secs()),
            asked: p.pending(),
        }
    }

    /// The laptop's answer to "Was it you?": Allow, at a role, or Refuse.
    pub fn answer(&self, allow: bool, role: Role) -> Result<(), String> {
        let running = lock(&self.shared.inner);
        let r = running
            .as_ref()
            .ok_or_else(|| "serving is off".to_owned())?;
        let asked = r
            .policy
            .pairing()
            .pending()
            .ok_or_else(|| "no phone is waiting".to_owned())?;
        if !allow {
            r.policy.pairing().answer(None);
            r.policy.audit(
                &r.server,
                "pair_refused",
                Some(&asked.device),
                Some(&asked.address),
            );
            crate::log::info(&format!(
                "a pairing was refused at the computer: {} ({})",
                asked.device, asked.address
            ));
            drop(running);
            (self.shared.events)(Event::Changed);
            return Ok(());
        }
        let owner = owner_of(&r.server);
        // Never an owner: a phone reads or edits (item 12).
        let role = if role.writes() {
            Role::Editor
        } else {
            Role::Reader
        };
        let (token, csrf, session) = r
            .server
            .db
            .pair_phone(&owner, &asked.device, &asked.address, role, PAIRED)
            .map_err(|e| {
                if e == "full" {
                    format!("{PAIRED} phones are paired already: revoke one first")
                } else {
                    e
                }
            })?;
        r.policy.pairing().answer(Some(Ready {
            token,
            csrf,
            session,
        }));
        r.policy.stop_announcing();
        r.policy.audit(
            &r.server,
            &format!("pair_allowed_{}", role.as_str()),
            Some(&asked.device),
            Some(&asked.address),
        );
        crate::log::info(&format!(
            "a pairing was approved at the computer: {} ({}) as {}",
            asked.device,
            asked.address,
            role.as_str()
        ));
        drop(running);
        (self.shared.events)(Event::Changed);
        Ok(())
    }

    /// The phones paired.
    pub fn phones(&self) -> Result<Vec<Phone>, String> {
        self.with_db(|db| {
            db.purge_phones()?;
            db.phones()
        })
    }

    /// Let a paired phone edit, or only read, without pairing it again. A
    /// phone is a reader or an editor, never above; the change holds from
    /// its next command, its open windows are told, and an editor made a
    /// reader leaves the live rooms it wrote in. Logged and in the audit.
    pub fn set_phone_role(&self, id: &str, editor: bool) -> Result<(), String> {
        let running = lock(&self.shared.inner);
        let r = running
            .as_ref()
            .ok_or_else(|| "serving is off".to_owned())?;
        let role = if editor { Role::Editor } else { Role::Reader };
        let name = r
            .server
            .db
            .phones()?
            .into_iter()
            .find(|p| p.id == id)
            .map(|p| p.name)
            .ok_or_else(|| "that phone is not paired".to_owned())?;
        if !r.server.db.set_phone_role(id, role.as_str())? {
            return Err("that phone is not paired".to_owned());
        }
        r.server.phone_role_changed(id, role);
        r.policy.audit(
            &r.server,
            &format!("phone_role_{}", role.as_str()),
            Some(&name),
            None,
        );
        crate::log::info(&format!(
            "a paired phone's role is now {}: {name}",
            role.as_str()
        ));
        drop(running);
        (self.shared.events)(Event::Changed);
        Ok(())
    }

    /// Revoke one phone: its session ends and its open connection closes at
    /// once (item 15).
    pub fn revoke(&self, id: &str) -> Result<(), String> {
        let running = lock(&self.shared.inner);
        let (ended, name) = if let Some(r) = running.as_ref() {
            let owner = owner_of(&r.server);
            let name = r
                .server
                .db
                .phones()?
                .into_iter()
                .find(|p| p.id == id)
                .map(|p| p.name);
            let ended = r.server.db.end_session(&owner, id)?;
            r.server.sessions_ended(&owner, Some(id), None);
            r.policy
                .audit(&r.server, "phone_revoked", name.as_deref(), None);
            (ended, name)
        } else {
            drop(running);
            let db = self.open_db()?;
            let owner = db.local_owner()?;
            let name = db
                .phones()?
                .into_iter()
                .find(|p| p.id == id)
                .map(|p| p.name);
            let ended = db.end_session(&owner.id, id)?;
            db.audit(&Audit {
                actor: None,
                action: "phone_revoked",
                subject: name.as_deref(),
                folder: None,
                address: None,
                ok: true,
            })?;
            (ended, name)
        };
        crate::log::info(&format!(
            "a paired phone was revoked: {}",
            name.as_deref().unwrap_or("unknown")
        ));
        (self.shared.events)(Event::Changed);
        if ended {
            Ok(())
        } else {
            Err("that phone is not paired".to_owned())
        }
    }

    /// Forget every device (item 15): every session ends.
    pub fn forget_all(&self) -> Result<usize, String> {
        let running = lock(&self.shared.inner);
        let n = if let Some(r) = running.as_ref() {
            let owner = owner_of(&r.server);
            let ids = r.server.db.forget_phones()?;
            r.server.sessions_ended(&owner, None, None);
            r.policy.audit(
                &r.server,
                "phones_forgotten",
                Some(&ids.len().to_string()),
                None,
            );
            ids.len()
        } else {
            drop(running);
            let db = self.open_db()?;
            let ids = db.forget_phones()?;
            db.audit(&Audit {
                actor: None,
                action: "phones_forgotten",
                subject: Some(&ids.len().to_string()),
                folder: None,
                address: None,
                ok: true,
            })?;
            ids.len()
        };
        crate::log::info("every paired phone was forgotten");
        (self.shared.events)(Event::Changed);
        Ok(n)
    }

    /// "Replace this computer's identity" (item 15): serving stops, the
    /// key and certificate are forgotten, every pairing ends. The next
    /// start makes a new key.
    pub fn replace_identity(&self) -> Result<(), String> {
        self.stop();
        let db = self.open_db()?;
        db.forget_phones()?;
        cert::forget(&db)?;
        db.audit(&Audit {
            actor: None,
            action: "identity_replaced",
            subject: None,
            folder: None,
            address: None,
            ok: true,
        })?;
        crate::log::info("this computer's identity was replaced; every pairing ended");
        (self.shared.events)(Event::Changed);
        Ok(())
    }

    /// The audit log, freshest first, for Settings (kept 365 days).
    pub fn audit(&self) -> Result<Vec<crate::db::AuditEntry>, String> {
        self.with_db(|db| db.audit_log(None, 200))
    }
}

/// The settings kept in `db`; the defaults when none, or when unreadable.
fn read_settings(db: &Db) -> LocalSettings {
    db.setting(SETTINGS)
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str::<LocalSettings>(&s).ok())
        .map(|s| LocalSettings {
            max_connected: s.max_connected.clamp(CONNECTED_LEAST, CONNECTED_MOST),
            ..s
        })
        .unwrap_or_default()
}

fn all_for_hint(shared: &Shared) -> Vec<IfNet> {
    shared.ifaces.list()
}

/// The account every phone is a session of.
fn owner_of(server: &Server) -> String {
    server.db.local_owner().map(|a| a.id).unwrap_or_default()
}

/// Each ticked folder's name: its directory's own, made unique (`Notes`,
/// `Notes (2)`), and what a phone is shown — never a path. The key is that
/// name; the value the directory.
fn names_for(paths: &[String]) -> HashMap<String, PathBuf> {
    let mut out = HashMap::new();
    for p in paths {
        let path = PathBuf::from(p);
        let base = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .filter(|n| !n.is_empty() && !n.contains(['/', '\\']))
            .unwrap_or_else(|| "Folder".to_owned());
        let mut name = base.clone();
        let mut n = 2;
        while out.contains_key(&name) {
            name = format!("{base} ({n})");
            n += 1;
        }
        out.insert(name, path);
    }
    out
}
