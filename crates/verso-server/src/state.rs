// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the server holds while it runs: its configuration, its database,
//! the open folders (the same `verso-service` the desktop host holds), the
//! connected windows and where each one's events go.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use axum::body::Bytes;
use axum::extract::ws::Utf8Bytes;
use tokio::sync::mpsc::error::TrySendError;
use tokio::sync::{Notify, OwnedSemaphorePermit, mpsc};
use verso_contract::{FolderChanged, IndexProgress};
use verso_service::{Service, lock};

use crate::config::Config;
use crate::db::{Db, Role};
use crate::limit::Limiter;

/// A message pushed to one connected window: an event, or what the server
/// says about the connection itself.
pub type Push = serde_json::Value;

/// The messages a connection's queue holds, at most, besides the answers
/// to its requests (those wait for room, and are bounded by the requests
/// it may have under way, `crate::rpc`). A window that reads as the server
/// writes never has more than a few waiting: the connection's loop writes
/// each one as it comes. Events are small (a folder changed, a shared
/// note's update, an index's progress at most every so often), so a full
/// queue is at most a few megabytes, and means the client stopped reading:
/// it is closed rather than the queue grown without end.
pub const QUEUE: usize = 1024;

/// The bytes of pushed messages a connection's queue holds, at most, beside
/// [`QUEUE`] (threat-model.md, gap 3): a shared note's update and a
/// presence are relayed as their sender wrote them, up to the message
/// limit (`crate::rpc::MAX_MESSAGE`, 48 MB), so 1024 of them could be
/// gigabytes. 64 MiB holds one message at the limit with room for the
/// small ones; past it the client is too slow and is closed, as a full
/// queue's is. Answers are not counted here: the requests a connection
/// may have under way bound them (`crate::rpc`), and one above 1 MB takes
/// its bytes from the server's budget while it waits (`crate::inflight`).
pub const QUEUE_BYTES: usize = 64 * 1024 * 1024;

/// A message on its way to one connection, already in its frame's text —
/// a message pushed to many is written once and shared — with whether the
/// connection closes after it, and, for an answer, the permit of the
/// request it answers, given back once it is written.
pub struct Out {
    pub text: Utf8Bytes,
    /// An answer that carries a piece of a file to a device that speaks
    /// sync 2 (ADR 0079 item 12): written as a binary message, its header
    /// and its bytes (`verso_core::sync::frame`), instead of `text`.
    pub binary: Option<Bytes>,
    pub close: bool,
    pub permit: Option<OwnedSemaphorePermit>,
    /// A pushed message's bytes, given back to the queue's budget when it
    /// is written or dropped.
    _charge: Option<Charge>,
    /// A large answer's bytes, given back to the server's budget
    /// (`crate::inflight`) when it is written or dropped.
    _bytes: Option<OwnedSemaphorePermit>,
}

/// Bytes held of a queue's budget while a message waits in it.
struct Charge {
    queued: Arc<AtomicUsize>,
    bytes: usize,
}

impl Drop for Charge {
    fn drop(&mut self) {
        self.queued.fetch_sub(self.bytes, Ordering::Relaxed);
    }
}

/// A message in its frame's text, to send to one connection or more.
#[derive(Clone)]
pub struct Frame {
    text: Utf8Bytes,
    close: bool,
}

impl Frame {
    #[must_use]
    pub fn of(message: &Push) -> Self {
        Self {
            text: message.to_string().into(),
            // A session ended: the connection is told, then closed.
            close: message
                .get("gone")
                .is_some_and(|g| g == "session" || g == "link"),
        }
    }
}

/// Where a connection's messages go: a bounded queue, read by the
/// connection's loop.
#[derive(Clone)]
pub struct Outbox {
    tx: mpsc::Sender<Out>,
    /// Told when the queue was found full: the loop closes the connection.
    slow: Arc<Notify>,
    /// The bytes of pushed messages waiting, and the most it may hold.
    queued: Arc<AtomicUsize>,
    budget: usize,
    /// The server's budget of large messages and answers, which this
    /// queue's answers above `crate::inflight::SMALL` take from while they
    /// wait (`crate::inflight`); none for a queue that counts no answer.
    server_bytes: Option<Arc<tokio::sync::Semaphore>>,
}

impl Outbox {
    /// A queue of `capacity` messages and [`QUEUE_BYTES`] of pushes, its
    /// reading end, and what tells its loop that the client is too slow.
    #[must_use]
    pub fn new(capacity: usize) -> (Self, mpsc::Receiver<Out>, Arc<Notify>) {
        Self::with_budget(capacity, QUEUE_BYTES)
    }

    /// The same, with a budget of `budget` bytes of pushes.
    #[must_use]
    pub fn with_budget(capacity: usize, budget: usize) -> (Self, mpsc::Receiver<Out>, Arc<Notify>) {
        let (tx, rx) = mpsc::channel(capacity);
        let slow = Arc::new(Notify::new());
        (
            Self {
                tx,
                slow: Arc::clone(&slow),
                queued: Arc::new(AtomicUsize::new(0)),
                budget,
                server_bytes: None,
            },
            rx,
            slow,
        )
    }

    /// The same queue, its large answers counted in the server's budget.
    #[must_use]
    pub fn counted_by(mut self, budget: Arc<tokio::sync::Semaphore>) -> Self {
        self.server_bytes = Some(budget);
        self
    }

    /// `bytes` of the server's budget for an answer, when it is large and
    /// this queue counts answers: `Err` when the budget has not that much
    /// free — the answer is then said busy instead of held.
    fn answer_bytes(&self, bytes: usize) -> Result<Option<OwnedSemaphorePermit>, ()> {
        match &self.server_bytes {
            Some(budget) if bytes > crate::inflight::SMALL => {
                let n = u32::try_from(bytes).map_err(|_| ())?;
                Arc::clone(budget)
                    .try_acquire_many_owned(n)
                    .map(Some)
                    .map_err(|_| ())
            }
            _ => Ok(None),
        }
    }

    /// Queue `message` without waiting. Returns whether it was queued: a
    /// connection gone takes nothing, and one whose queue is full is too
    /// slow — its loop is told to close it.
    pub fn send(&self, message: &Push) -> bool {
        self.send_frame(&Frame::of(message))
    }

    /// [`Outbox::send`], for a message already in its frame.
    pub fn send_frame(&self, frame: &Frame) -> bool {
        let bytes = frame.text.len();
        let before = self.queued.fetch_add(bytes, Ordering::Relaxed);
        let charge = Charge {
            queued: Arc::clone(&self.queued),
            bytes,
        };
        if before.saturating_add(bytes) > self.budget {
            drop(charge);
            self.slow.notify_one();
            return false;
        }
        let out = Out {
            text: frame.text.clone(),
            binary: None,
            close: frame.close,
            permit: None,
            _charge: Some(charge),
            _bytes: None,
        };
        match self.tx.try_send(out) {
            Ok(()) => true,
            Err(TrySendError::Full(_)) => {
                self.slow.notify_one();
                false
            }
            Err(TrySendError::Closed(_)) => false,
        }
    }

    /// Queue the answer to a request, waiting for room: the request's
    /// permit goes with it and is given back once the answer is written,
    /// so the answers waiting are bounded by the requests a connection may
    /// have under way.
    pub async fn answer(&self, message: Push, permit: OwnedSemaphorePermit) {
        let id = message.get("id").cloned();
        let mut frame = Frame::of(&message);
        // Only the frame waits for room: one copy of the answer, not two.
        drop(message);
        let bytes = match self.answer_bytes(frame.text.len()) {
            Ok(bytes) => bytes,
            Err(()) => {
                frame = Frame::of(&serde_json::json!({ "id": id, "err": crate::inflight::busy() }));
                None
            }
        };
        let _ = self
            .tx
            .send(Out {
                text: frame.text,
                binary: None,
                close: frame.close,
                permit: Some(permit),
                _charge: None,
                _bytes: bytes,
            })
            .await;
    }

    /// [`Outbox::answer`] for an answer in a binary message to request
    /// `id`: a piece of a file and its header, framed
    /// (`verso_core::sync::frame`).
    pub async fn answer_binary(&self, id: u64, message: Vec<u8>, permit: OwnedSemaphorePermit) {
        let Ok(bytes) = self.answer_bytes(message.len()) else {
            drop(message);
            self.answer(
                serde_json::json!({ "id": id, "err": crate::inflight::busy() }),
                permit,
            )
            .await;
            return;
        };
        let _ = self
            .tx
            .send(Out {
                text: Utf8Bytes::default(),
                binary: Some(Bytes::from(message)),
                close: false,
                permit: Some(permit),
                _charge: None,
                _bytes: bytes,
            })
            .await;
    }
}

/// A connected window: whose it is, which folder it shows and in which
/// role, and where its pushes go.
pub struct Client {
    pub account: String,
    /// The session the connection was opened with; none for a token's.
    pub session: Option<String>,
    /// The folder it shows — the owner's, when it opened a share — and its
    /// role there.
    pub folder: Option<(String, Role)>,
    /// The share it opened (ADR 0081 item 2): every path it sends and
    /// hears goes through it.
    pub scope: Option<crate::scope::Scope>,
    /// Whether its credential may write at all: a token that only reads
    /// may not, whatever the role.
    pub token_write: bool,
    /// Whether the account is the folder's owner, on the folder itself and
    /// not through a share: the game master of its table (ADR 0113 item
    /// 6), whatever the credential. The role above is the window's
    /// ceiling; this is who it is.
    pub owner: bool,
    /// Whether the account is the folder's owner, through a share too (a
    /// phone served a part of the folder): who deletes outside a table (ADR
    /// 0113 B8, amended 2026-11-01). Never a game master's seat by itself.
    pub owns: bool,
    /// Whether the window is a paired phone's.
    pub phone: bool,
    pub tx: Outbox,
}

impl Client {
    /// `message` as this window may hear it: re-rooted when it opened a
    /// share, and nothing of an event that is not the share's (ADR 0081
    /// item 2). A window that may no longer see its folder has left its
    /// rooms and the folder itself (`Server::left`).
    fn send_frame(&self, frame: &Frame, message: &Push) {
        match &self.scope {
            None => {
                self.tx.send_frame(frame);
            }
            Some(scope) => {
                if let Some(m) = scope.push(message) {
                    self.tx.send(&m);
                }
            }
        }
    }
}

pub struct Server {
    pub config: Config,
    /// The directories the server could not write at start, for the admin
    /// console (`crate::storage`); set once by `serve`.
    pub unwritable: std::sync::OnceLock<Vec<crate::storage::Unwritable>>,
    pub db: Db,
    pub service: Arc<Service>,
    pub clients: Mutex<HashMap<String, Client>>,
    pub limiter: Limiter,
    /// What one member may hold of the server: connections, the pace of
    /// commands (threat-model.md, gap 4).
    pub fair: crate::fair::Fair,
    /// Refused sign-ins, said for the host's tools (ADR 0083 item 1).
    pub signins: crate::signin::Watch,
    /// The Argon2id hashes run at once, and the sign-in attempts in flight
    /// per key (`crate::hashes`).
    pub hashes: crate::hashes::Hashes,
    /// The connections the listener holds, on the server and by address
    /// (threat-model.md, gap 8).
    pub slots: Arc<crate::listen::Slots>,
    /// A trusted proxy that forwarded no `X-Forwarded-For`, said once a
    /// minute (ADR 0083 item 5).
    pub unforwarded: crate::log::OnceAMinute,
    /// A peer on this machine, not a trusted proxy, that sent
    /// `X-Forwarded-For`, said once a minute (ADR 0083 item 5).
    pub untrusted_forward: crate::log::OnceAMinute,
    /// The REST routes' pace per address (ADR 0083 item 7).
    pub pace: crate::pace::Pace,
    /// The pace of each read link's requests (ADR 0105 item 6), per link,
    /// beside the address's.
    pub link_pace: crate::pace::Pace,
    /// The read links open now, and the browsers that proved a passphrase.
    pub links: crate::readlinks::Open,
    /// The requests in flight per client address (`crate::http`).
    pub requests: crate::listen::Requests,
    /// The bytes of the WebSocket's large messages and answers under way
    /// (`crate::inflight`).
    pub inflight: crate::inflight::Inflight,
    /// The contract's hash: of the generated bindings (the maintainer's
    /// answer D of 2026-10-09), sent in the handshake beside the
    /// contract's version (ADR 0073 item 2, revised 2026-11-02).
    pub contract: String,
    next: AtomicU64,
    /// Device sign-ins waiting for the person's approval in the browser
    /// (ADR 0074 item 8): user code → the request.
    pub devices: Mutex<HashMap<String, crate::device::Pending>>,
    /// A newer version, when the check found one (answer E).
    pub newer: Mutex<Option<String>>,
    /// The commit the server was built from (ADR 0051).
    pub commit: String,
    /// The notes being edited by several windows at once (ADR 0073 item 7).
    /// The folder's id behind each folder key the server opened: the
    /// quotas are the folder's, the writes know its key (ADR 0077).
    pub keys: Mutex<HashMap<String, String>>,
    /// One opening at a time per folder key: clients that open a folder
    /// nobody has open yet, at once, wait for the first and join it,
    /// instead of each walking the folder and opening its index.
    pub opening: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    /// Files on their way in pieces, for sync (ADR 0079 item 12).
    pub transfers: crate::sync::Transfers,
    /// The room writes under way hold in their folders' quotas
    /// (`crate::quota`).
    pub reserved: crate::quota::Reserved,
    pub rooms: crate::collab::Rooms,
    /// The tables of the folders, as players are served them (ADR 0110).
    pub campaigns: crate::campaign::Cache,
    /// The windows at each folder's table (ADR 0107).
    pub tables: crate::table::Tables,
    /// The tables' music, in memory only (ADR 0116 section A).
    pub sounds: crate::table_sound::Sounds,
    /// The tables' live shares and their frames, in memory only (ADR 0116
    /// section B).
    pub relay: crate::audio_relay::Relay,
    /// The pace of a connection's table messages, images and rolls (ADR
    /// 0107 item 12).
    pub table_pace: crate::pace::Pace,
    /// The pace of a connection's rolls and draws, those of a note's room
    /// too, which the table keeps: the REST routes' (ADR 0107 item 12).
    pub roll_pace: crate::pace::Pace,
    /// The host's mail server, when it has one (ADR 0074 item 2).
    pub mail: std::sync::OnceLock<crate::mail::Mail>,
    /// Sign-in links sent by e-mail and not used: their hash → the account
    /// and when it was made (fifteen minutes, ADR 0074 item 3).
    /// With the key of the address that asked (`crate::limit::room_for`).
    pub signin_links: Mutex<HashMap<Vec<u8>, (String, std::time::Instant, String)>>,
    /// The passkey ceremonies under way (ADR 0074 item 3).
    pub ceremonies: crate::passkeys::Ceremonies,
    /// The runtime, for what the watcher's thread hands over.
    pub runtime: std::sync::OnceLock<tokio::runtime::Handle>,
    /// The folders' version histories (ADR 0091), in the data directory.
    pub history: crate::history::Book,
    /// The server itself, for what a write starts later (`crate::history`).
    this: std::sync::OnceLock<std::sync::Weak<Server>>,
    /// The sync this server speaks (ADR 0079 item 5): its own,
    /// `verso_core::sync::PROTOCOL`, unless [`Server::speak_sync`] set an
    /// older one.
    sync: std::sync::atomic::AtomicU32,
    /// Set when this is "this app is a server" (ADR 0096) and not a
    /// dedicated server: the one local owner, the phones paired to it, the
    /// folders ticked, the addresses served.
    pub local: Option<Arc<crate::local::Policy>>,
}

impl Server {
    /// The sync this server speaks: what its hello says, and whether a
    /// piece of a file crosses as a binary message.
    #[must_use]
    pub fn sync(&self) -> u32 {
        self.sync.load(Ordering::Relaxed)
    }

    /// Speak an older sync than this build's, as a server of the version
    /// before would: a device of a newer sync is tested against it (ADR
    /// 0079 item 5: the newer side follows the version before). Nothing
    /// else changes: what the version before lacks, a device of it never
    /// asks for.
    pub fn speak_sync(&self, version: u32) {
        self.sync
            .store(version.min(verso_core::sync::PROTOCOL), Ordering::Relaxed);
    }

    pub fn new(config: Config, db: Db, contract: String, commit: String) -> Arc<Self> {
        let slots = crate::listen::Slots::new(config.trusted_proxy.named());
        Self::build(config, db, contract, commit, slots, None)
    }

    /// The server of "this app is a server" (ADR 0096): the same service
    /// and the same code, with the laptop's bounds and its policy.
    pub fn new_local(
        config: Config,
        db: Db,
        contract: String,
        commit: String,
        policy: Arc<crate::local::Policy>,
    ) -> Arc<Self> {
        let slots = crate::listen::Slots::for_local(policy.admit_fn());
        Self::build(config, db, contract, commit, slots, Some(policy))
    }

    fn build(
        config: Config,
        db: Db,
        contract: String,
        commit: String,
        slots: Arc<crate::listen::Slots>,
        local: Option<Arc<crate::local::Policy>>,
    ) -> Arc<Self> {
        let service = Service::new(Some(config.data_dir.join("indexes")));
        let history = crate::history::Book::open(&config.data_dir);
        let server = Arc::new(Self {
            config,
            unwritable: std::sync::OnceLock::new(),
            db,
            service: Arc::clone(&service),
            clients: Mutex::new(HashMap::new()),
            limiter: Limiter::default(),
            fair: crate::fair::Fair::default(),
            signins: crate::signin::Watch::default(),
            hashes: crate::hashes::Hashes::default(),
            slots,
            unforwarded: crate::log::OnceAMinute::default(),
            untrusted_forward: crate::log::OnceAMinute::default(),
            pace: crate::pace::Pace::default(),
            link_pace: crate::pace::Pace::default(),
            table_pace: crate::pace::Pace::with(crate::table::RATE, crate::table::BURST),
            roll_pace: crate::pace::Pace::default(),
            links: crate::readlinks::Open::default(),
            requests: crate::listen::Requests::default(),
            inflight: crate::inflight::Inflight::default(),
            contract,
            next: AtomicU64::new(1),
            devices: Mutex::new(HashMap::new()),
            newer: Mutex::new(None),
            commit,
            keys: Mutex::new(HashMap::new()),
            opening: Mutex::new(HashMap::new()),
            transfers: crate::sync::Transfers::default(),
            reserved: crate::quota::Reserved::default(),
            rooms: crate::collab::Rooms::default(),
            campaigns: crate::campaign::Cache::default(),
            tables: crate::table::Tables::default(),
            sounds: crate::table_sound::Sounds::default(),
            relay: crate::audio_relay::Relay::default(),
            ceremonies: crate::passkeys::Ceremonies::default(),
            mail: std::sync::OnceLock::new(),
            signin_links: Mutex::new(HashMap::new()),
            runtime: std::sync::OnceLock::new(),
            sync: std::sync::atomic::AtomicU32::new(verso_core::sync::PROTOCOL),
            history,
            this: std::sync::OnceLock::new(),
            local,
        });
        let _ = server.this.set(Arc::downgrade(&server));
        service.set_events(Arc::new(ServerEvents {
            server: Arc::downgrade(&server),
        }));
        server
    }

    /// The server, owned: what a write hands a later task.
    pub fn me(&self) -> Option<Arc<Self>> {
        self.this.get().and_then(std::sync::Weak::upgrade)
    }

    /// A name for a new connection, never reused while the server runs.
    pub fn client_id(&self) -> String {
        format!("ws-{}", self.next.fetch_add(1, Ordering::Relaxed))
    }

    /// The directory of a registered folder; the path is formed here and
    /// never crosses (ADR 0026 rule 4).
    pub fn folder_path(&self, dir: &str) -> Option<PathBuf> {
        // "This app is a server": the folders the person ticked, wherever
        // they are, named here by the name they were given — never a path
        // a phone sent (ADR 0096 item 2).
        if let Some(local) = &self.local {
            return local.folder_path(dir);
        }
        verso_fs::server::folder_path(&self.config.folders_dir, dir)
    }

    /// Push `message` to each of `clients` still connected.
    pub fn push(&self, clients: &[String], message: &Push) {
        let frame = Frame::of(message);
        let table = lock(&self.clients);
        for id in clients {
            if let Some(c) = table.get(id) {
                c.send_frame(&frame, message);
            }
        }
    }

    /// Push to every window that shows folder `folder` (by its id).
    pub fn push_folder(&self, folder: &str, message: &Push) {
        let frame = Frame::of(message);
        let table = lock(&self.clients);
        for c in table.values() {
            if c.folder.as_ref().is_some_and(|(f, _)| f == folder) {
                c.send_frame(&frame, message);
            }
        }
    }

    /// The folder's log moved on to `head` with changes at `paths`: every
    /// window that shows the folder hears it. One that opened a share
    /// hears it only when a change is the share's, and without the head —
    /// the folder's number counts its changes outside the share too, which
    /// are not the receiver's to know (3.18); a device asks the share for
    /// its own.
    /// Only the windows of `to` hear it: who may write, and who may only
    /// read, hear their own heads (`crate::readers::push_sync_changed`).
    ///
    /// A `head` below zero is none: each window then asks for itself (a
    /// player of a table with notes released to some players has a log
    /// numbered in its own count).
    pub fn push_sync_changed(&self, folder: &str, head: i64, paths: &[&str], to: &[String]) {
        let bare = serde_json::json!({ "event": "sync-changed", "payload": {} });
        let whole = if head < 0 {
            bare.clone()
        } else {
            serde_json::json!({ "event": "sync-changed", "payload": { "head": head } })
        };
        let frame = Frame::of(&whole);
        let table = lock(&self.clients);
        for (id, c) in table.iter() {
            if !c.folder.as_ref().is_some_and(|(f, _)| f == folder) || !to.contains(id) {
                continue;
            }
            match &c.scope {
                None => {
                    c.tx.send_frame(&frame);
                }
                Some(scope) => {
                    if paths.iter().any(|p| scope.to_rel(p).is_some()) {
                        c.tx.send(&bare);
                    }
                }
            }
        }
    }

    /// Every window of `account`: told to go when its sessions end.
    pub fn push_account(&self, account: &str, message: &Push) {
        let frame = Frame::of(message);
        let table = lock(&self.clients);
        for c in table.values().filter(|c| c.account == account) {
            c.send_frame(&frame, message);
        }
    }

    /// Every window and device of `account` signed in as the person — not
    /// a token's connection, whose folders were named when it was made:
    /// what is the person's to know (a folder given, ADR 0084 item 7).
    pub fn push_sessions(&self, account: &str, message: &Push) {
        let frame = Frame::of(message);
        let table = lock(&self.clients);
        for c in table
            .values()
            .filter(|c| c.account == account && c.session.is_some())
        {
            c.send_frame(&frame, message);
        }
    }

    /// Sessions of `account` ended: the connections opened with them are
    /// told and closed at once (the WebSocket's loop closes on `gone`), so
    /// that a device hears it then, not at its next exchange (the live
    /// campaign, 2026-10-10). `only` names the one session ended; without
    /// it, every one of the account's but `keep`. A token's connection is
    /// no session's and stays.
    pub fn sessions_ended(&self, account: &str, only: Option<&str>, keep: Option<&str>) {
        let table = lock(&self.clients);
        for c in table.values().filter(|c| c.account == account) {
            let Some(session) = c.session.as_deref() else {
                continue;
            };
            if keep == Some(session) || only.is_some_and(|o| o != session) {
                continue;
            }
            c.tx.send(&serde_json::json!({ "gone": "session" }));
        }
    }

    /// A paired phone's role was changed from the computer (ADR 0096): its
    /// open windows learn it at once, and one that may now only read leaves
    /// the rooms it wrote in, as a member demoted in a share does.
    pub fn phone_role_changed(&self, session: &str, role: Role) {
        let mut demoted = Vec::new();
        {
            let mut table = lock(&self.clients);
            for (id, c) in table.iter_mut() {
                if c.session.as_deref() != Some(session) {
                    continue;
                }
                if let Some((folder, _)) = c.folder.take() {
                    c.folder = Some((folder, role));
                }
                // The credential's ceiling follows the pairing's: one source
                // (ADR 0113), not a flag kept from the connection's start.
                c.token_write = role.writes();
                c.tx.send(&serde_json::json!({ "role": role }));
                if !role.writes() {
                    demoted.push(id.clone());
                }
            }
        }
        for client in demoted {
            crate::collab::readers::demoted(self, &client);
        }
    }

    /// A member's role in a folder changed or ended: the windows of theirs
    /// that show it learn it, and one that may no longer see it is told to
    /// leave, and `why` (`revoked` by an owner, `left` by the member).
    pub fn role_changed(&self, folder: &str, account: &str, role: Option<Role>, why: &str) {
        let mut gone = Vec::new();
        let mut demoted = Vec::new();
        {
            let mut table = lock(&self.clients);
            for (id, c) in table.iter_mut() {
                if c.account == account
                    && c.scope.is_none()
                    && c.folder.as_ref().is_some_and(|(f, _)| f == folder)
                {
                    match role {
                        Some(r) => {
                            c.folder = Some((folder.to_owned(), r));
                            c.owner = r == Role::Owner;
                            c.owns = c.owner;
                            c.tx.send(&serde_json::json!({ "role": r }));
                            if !r.writes() {
                                demoted.push(id.clone());
                            }
                        }
                        None => {
                            c.folder = None;
                            c.tx.send(&serde_json::json!({ "gone": "folder", "reason": why }));
                            gone.push(id.clone());
                        }
                    }
                }
            }
        }
        self.left(&gone);
        // One who may now only read leaves the rooms it wrote in, and joins
        // again as a reader (ADR 0087 item 4).
        for client in demoted {
            crate::collab::readers::demoted(self, &client);
        }
        // A role of the whole folder counts in its shares too (ADR 0081
        // item 14).
        crate::shares::refresh(self, folder, why);
    }

    /// Windows that may no longer see their folder leave it: out of its
    /// rooms, its transfers dropped, the folder no longer held for them —
    /// nothing more of it reaches them.
    pub fn left(&self, clients: &[String]) {
        for client in clients {
            self.transfers.forget(client);
            crate::collab::gone_now(self, client);
            crate::table::gone(self, client);
            self.service.release(client);
        }
    }
}

/// The service's events, to the windows that show the folder.
struct ServerEvents {
    server: std::sync::Weak<Server>,
}

impl verso_service::Events for ServerEvents {
    fn progress(&self, clients: &[String], progress: &IndexProgress) {
        if let Some(s) = self.server.upgrade() {
            s.push(
                clients,
                &serde_json::json!({ "event": "index-progress", "payload": progress }),
            );
        }
    }

    fn folder_changed(&self, clients: &[String], changed: &FolderChanged) {
        if let Some(s) = self.server.upgrade() {
            // Who may only read hears it once the folder's log says which
            // notes changed for a reader (ADR 0087): after the
            // reconciliation, below. The others now.
            let (readers, writers) = crate::readers::split(&s, clients);
            // A shared note changed outside: its room hears it first, off
            // the watcher's thread.
            if let Some(rt) = s.runtime.get() {
                let server = Arc::clone(&s);
                let c = changed.clone();
                rt.spawn_blocking(move || {
                    crate::collab::changed_outside(&server, &c.key, &c.changed, &c.removed);
                    // And the folder's log for sync (ADR 0079 item 4).
                    let paths: Vec<String> = c.changed.iter().chain(&c.removed).cloned().collect();
                    crate::sync::reconcile_key(&server, &c.key, None, &paths);
                    if let Ok(payload) = serde_json::to_value(&c) {
                        crate::readers::push_folder_changed(&server, &c.key, &readers, &payload);
                    }
                });
            }
            s.push(
                &writers,
                &serde_json::json!({ "event": "folder-changed", "payload": changed }),
            );
        }
    }

    fn log(&self, level: &str, message: &str) {
        crate::log::line(level, message);
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::json;

    use super::Outbox;

    /// A connection's queue is bounded (R5 of 2026-10-11): a message that
    /// finds it full is not queued, and the connection's loop is told the
    /// client reads too slowly; a session's end closes after it is written.
    #[test]
    fn a_full_queue_says_the_client_reads_too_slowly() {
        crate::tests::block_on(async {
            let (out, mut rx, slow) = Outbox::new(2);
            assert!(out.send(&json!({ "event": "um" })));
            assert!(out.send(&json!({ "gone": "session" })));
            assert!(!out.send(&json!({ "event": "três" })));
            tokio::time::timeout(Duration::from_secs(5), slow.notified())
                .await
                .unwrap();
            let first = rx.recv().await.unwrap();
            assert_eq!(first.text.as_str(), r#"{"event":"um"}"#);
            assert!(!first.close);
            assert!(rx.recv().await.unwrap().close);
            // Room again: queued.
            assert!(out.send(&json!({ "event": "quatro" })));
            // The connection gone: nothing queued, nothing said.
            drop(rx);
            assert!(!out.send(&json!({ "event": "cinco" })));
        });
    }

    /// The queue is bounded in bytes too (gap 3 of 2026-10-11): pushes
    /// past the budget are not queued and the client is said too slow;
    /// a message written gives its bytes back. Answers are not counted.
    #[test]
    fn a_queue_full_of_bytes_says_the_client_reads_too_slowly() {
        crate::tests::block_on(async {
            // {"event":"um"} is 14 bytes: two fit in 40, a third does not.
            let (out, mut rx, slow) = Outbox::with_budget(1024, 40);
            assert!(out.send(&json!({ "event": "um" })));
            assert!(out.send(&json!({ "event": "um" })));
            assert!(!out.send(&json!({ "event": "um" })));
            tokio::time::timeout(Duration::from_secs(5), slow.notified())
                .await
                .unwrap();
            drop(rx.recv().await.unwrap());
            assert!(out.send(&json!({ "event": "um" })));
            // An answer waits for room in messages, never for bytes.
            let permits = std::sync::Arc::new(tokio::sync::Semaphore::new(1));
            let permit = permits.try_acquire_owned().unwrap();
            out.answer(json!({ "id": 1, "ok": "x".repeat(100) }), permit)
                .await;
        });
    }
}
