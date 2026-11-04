// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the running server consults while "this app is a server" is on
//! (ADR 0096; moved out of `mod.rs`, ADR 0067): the addresses it answers
//! to, the folders and their names, the pairing window, the phones
//! connected.

use std::collections::HashMap;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use verso_service::lock;

use super::net::{self, IfNet};
use super::pairing::{Ended, Pairing, Polled, Redeemed};
use super::{CONNECTED, CONNECTED_LEAST, CONNECTED_MOST, Event, Sink, announce, parts};
use crate::db::Audit;
use crate::state::Server;

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
    pub(super) hosts: RwLock<Vec<String>>,
    pub(super) folders: RwLock<HashMap<String, PathBuf>>,
    pub(super) served: RwLock<Vec<IfNet>>,
    pub(super) pairing: Mutex<Pairing>,
    pub(super) connected: Arc<Mutex<HashMap<String, u32>>>,
    pub(super) events: Sink,
    pub(super) announcer: Mutex<Option<announce::Announcer>>,
    pub(super) listening: RwLock<(u16, Vec<IpAddr>)>,
    pub(super) refused_said: crate::log::OnceAMinute,
    /// The setting `max_connected`, read at every new connection.
    pub(super) connected_most: std::sync::atomic::AtomicU32,
    /// When each phone's refusal by that ceiling was last logged and
    /// audited: once a minute per phone, whatever the pace it retries at.
    pub(super) full_said: Mutex<HashMap<String, Instant>>,
    /// The folders served in part (item 2, amended 2026-10-16).
    pub(super) parts: parts::Parts,
    /// The internet link's public origin and the `Host` it carries, while
    /// it has one (ADR 0117 D3 item 4): set at runtime, gone the moment
    /// the link is off.
    pub(super) link: RwLock<Option<super::link::Origin>>,
    /// Where the network's listeners are reached, while there are any:
    /// the host's own name with its own certificate files, or the best
    /// address (ADR 0117 D13 Q8). Set at each start.
    pub(super) net_base: RwLock<Option<String>>,
    /// The named proxies of the link's loopback listener.
    pub(super) link_proxies: crate::proxy::Proxies,
    /// The session of the owner's window's seat, while there is one (ADR
    /// 0117 D4 Q3): the one bearer credential this server takes, and only
    /// through the seat's door (`seat.rs`).
    pub(super) seat: RwLock<Option<String>>,
    /// Loopback let in as a peer, for the tests only.
    #[cfg(test)]
    pub(super) test_loopback: std::sync::atomic::AtomicBool,
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
            link: RwLock::new(None),
            net_base: RwLock::new(None),
            link_proxies: crate::proxy::Proxies::loopback(),
            seat: RwLock::new(None),
            #[cfg(test)]
            test_loopback: std::sync::atomic::AtomicBool::new(false),
        })
    }

    pub(super) fn emit(&self, e: Event) {
        (self.events)(e);
    }

    /// The addresses served and the names the `Host` header may carry.
    pub(super) fn set_network(&self, served: &[IfNet], port: u16, extra_hosts: &[String]) {
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

    /// Where the network's listeners are reached (see `net_base`).
    pub(super) fn set_net_base(&self, base: Option<String>) {
        *self
            .net_base
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = base;
    }

    /// Where the links this server hands out open now — an invitation's
    /// from Settings or from the table, a new password's, a read link's:
    /// the internet link's origin while it has one, else the network's
    /// address; none while neither is there.
    #[must_use]
    pub fn links_base(&self) -> Option<String> {
        self.link_origin().or_else(|| {
            self.net_base
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .clone()
        })
    }

    pub(super) fn set_folders(&self, folders: HashMap<String, PathBuf>) {
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

    pub(super) fn audit(
        &self,
        server: &Server,
        action: &str,
        subject: Option<&str>,
        address: Option<&str>,
    ) {
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

    pub(super) fn pairing(&self) -> std::sync::MutexGuard<'_, Pairing> {
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
    pub(super) fn ended(&self, server: &Server, why: Ended) {
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
    pub(super) fn stop_announcing(&self) {
        let announcer = lock(&self.announcer).take();
        if let Some(a) = announcer {
            a.stop();
        }
    }

    pub(super) fn start_announcing(&self) {
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
