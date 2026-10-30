// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The open folders, and the contract's commands over them, apart from
//! any transport (ADR 0073 item 2, decided 2026-10-09). The desktop host
//! (`app/src-tauri`) and the server (`verso serve`) hold one [`Service`]
//! each and call the same code: what a window asks of a folder is
//! answered the same way whichever side of the wire the core is on
//! (ADR 0026, rule 2).
//!
//! A *client* is whatever asks: a window of the desktop app (its label)
//! or a connection to the server. Each client shows at most one folder;
//! two clients on one folder share its session — one workspace, one
//! index, one watch — and a folder no client shows is closed (ADR 0065).
//! Each folder has its own lock: two commands never interleave on an
//! index, and a long run on one folder holds no other.
//!
//! Nothing here touches a file: the folder is verso-core's, through
//! verso-fs (ADR 0026, rule 5).

use std::collections::HashMap;
use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, RwLock, Weak};

use verso_contract::{
    ContractError, ErrorKind, FolderChanged, FolderInfo, IndexProgress, IndexSummary,
};
use verso_core::{ConfinementError, CoreError, ReadError, Workspace, WriteError};

pub mod convert;
pub mod files;
pub mod history;
pub mod loose;
pub mod ops;
pub mod reader;
pub mod trash;

pub use loose::not_available;
pub use ops::{Access, OpError};

/// What the service tells the clients, through whatever carries it: Tauri's
/// events on the desktop, the WebSocket on the server.
pub trait Events: Send + Sync {
    /// An index run's progress, for the clients that show its folder.
    fn progress(&self, clients: &[String], progress: &IndexProgress);
    /// The folder changed outside the clients and its index is current
    /// again: for the clients that show it.
    fn folder_changed(&self, clients: &[String], changed: &FolderChanged);
    /// A line for the host's log: a failure the client is about to show
    /// for a moment.
    fn log(&self, level: &str, message: &str);
}

/// Events nobody hears: the service before its host has given it a sink.
struct Silent;

impl Events for Silent {
    fn progress(&self, _: &[String], _: &IndexProgress) {}
    fn folder_changed(&self, _: &[String], _: &FolderChanged) {}
    fn log(&self, _: &str, _: &str) {}
}

/// An open folder: its workspace, what the clients were told about it,
/// and the watch that keeps both current while the folder changes outside
/// — dropped, and so stopped, with the session.
pub struct Session {
    pub workspace: Workspace,
    pub info: FolderInfo,
    /// Why the folder is not watched, when it is not: said with every
    /// summary of the session, since each index run replaces the problems.
    unwatched: Option<String>,
    _watch: Option<verso_core::Watch>,
}

/// A folder opened and indexed, not yet shown by any client: what
/// [`Service::open`] hands back for [`Service::attach`].
pub struct Opened {
    session: Session,
    missed: Arc<AtomicBool>,
}

impl Opened {
    #[must_use]
    pub fn info(&self) -> &FolderInfo {
        &self.session.info
    }
}

#[derive(Default)]
pub(crate) struct Sessions {
    /// Folder key → its session.
    by_key: HashMap<String, Arc<Mutex<Session>>>,
    /// Client → the key of the folder it shows.
    clients: HashMap<String, String>,
}

impl Sessions {
    fn clients_of(&self, key: &str) -> Vec<String> {
        self.clients
            .iter()
            .filter(|(_, k)| k.as_str() == key)
            .map(|(client, _)| client.clone())
            .collect()
    }
}

/// The open folders of one host.
pub struct Service {
    /// Where the indexes of the folders it opens go: `None` for the
    /// configuration directory (`verso_core::config_dir`).
    config: Option<PathBuf>,
    sessions: Mutex<Sessions>,
    /// The walk's rules and the folder note's name — the person's
    /// settings, pushed by the window and applied to every open folder.
    walk_rules: Mutex<verso_core::WalkRules>,
    folder_note_name: Mutex<String>,
    events: RwLock<Arc<dyn Events>>,
    /// The computer's history of its folders (ADR 0091 item 8): this
    /// computer's name for its versions and the days they are kept; `None`
    /// on a server, which keeps its own.
    history: Mutex<Option<(String, u32)>>,
    /// The files shown without a folder, by the client that shows them
    /// (ADR 0114 item 19; `loose.rs`).
    loose: Mutex<loose::LooseWindows>,
}

/// Lock a mutex, poisoned or not: a panic in an earlier command must not
/// make every later one fail until restart. What the panicking command
/// left half done is the same either way; refusing to look at it helps
/// nobody.
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

/// A core error as the contract says it.
#[must_use]
pub fn convert(e: CoreError) -> ContractError {
    let kind = match &e {
        // A new name beside its case twin (spec Q8): an answer of its own
        // kind, which the window and sync tell apart without its text.
        CoreError::Confined(ConfinementError::CaseTwin)
        | CoreError::Write(WriteError::Confined(ConfinementError::CaseTwin)) => ErrorKind::CaseTwin,
        CoreError::Confined(_) | CoreError::InvalidKey => ErrorKind::Refused,
        CoreError::Write(WriteError::Confined(_)) => ErrorKind::Refused,
        CoreError::Read(ReadError::Unavailable) => ErrorKind::Unavailable,
        // A file gone, read or written to: a rename or a deletion whose
        // entry (or its folder) is not there any more is not found, as a
        // read of it is — never a failure of the disk.
        CoreError::Read(ReadError::Io(io)) | CoreError::Write(WriteError::Io(io))
            if io.kind() == std::io::ErrorKind::NotFound =>
        {
            ErrorKind::NotFound
        }
        CoreError::Folder(io) if io.kind() == std::io::ErrorKind::NotFound => ErrorKind::NotFound,
        CoreError::UnknownFolder => ErrorKind::NotFound,
        CoreError::NotText => ErrorKind::NotText,
        CoreError::NotCanvas => ErrorKind::NotCanvas,
        CoreError::Write(WriteError::Changed { .. }) => ErrorKind::Changed,
        CoreError::Write(WriteError::Exists) => ErrorKind::Exists,
        CoreError::Write(WriteError::Placeholder) => ErrorKind::Unavailable,
        CoreError::FolderSettings(_) | CoreError::FolderData(_) | CoreError::Loose(_) => {
            ErrorKind::Refused
        }
        _ => ErrorKind::Failed,
    };
    ContractError {
        kind,
        message: e.to_string(),
    }
}

#[must_use]
pub fn failed(message: impl Into<String>) -> ContractError {
    ContractError {
        kind: ErrorKind::Failed,
        message: message.into(),
    }
}

#[must_use]
pub fn refused(message: impl Into<String>) -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message: message.into(),
    }
}

/// The folder's quota on its server would be passed (ADR 0077 item 5):
/// nothing was written.
#[must_use]
pub fn over_quota(used: u64, quota: u64) -> ContractError {
    ContractError {
        kind: ErrorKind::Quota,
        message: format!("the folder takes {used} bytes of its quota of {quota}"),
    }
}

/// The bytes the folder's files take now, and how much writing `len`
/// bytes at `path` would change that (negative when the file shrinks).
/// A note may be named without its `.md`.
#[must_use]
pub fn growth(ws: &Workspace, path: &str, len: u64) -> (u64, i64) {
    let mut total = 0u64;
    let mut old = 0u64;
    let as_note = format!("{path}.md");
    for e in ws.entries() {
        if matches!(e.kind, verso_core::FileKind::Folder) {
            continue;
        }
        total = total.saturating_add(e.len);
        if e.path == path || e.path == as_note {
            old = e.len;
        }
    }
    let delta = i64::try_from(len).unwrap_or(i64::MAX) - i64::try_from(old).unwrap_or(i64::MAX);
    (total, delta)
}

#[must_use]
pub fn no_folder() -> ContractError {
    ContractError {
        kind: ErrorKind::NoFolder,
        message: "no folder is open".to_owned(),
    }
}

/// What a panic inside the core said, for the message the client shows.
#[must_use]
pub fn panic_text(payload: &(dyn std::any::Any + Send)) -> String {
    payload
        .downcast_ref::<String>()
        .cloned()
        .or_else(|| payload.downcast_ref::<&str>().map(|s| (*s).to_owned()))
        .unwrap_or_else(|| "unknown panic".to_owned())
}

fn session_summary(session: &Session, report: &verso_core::IndexReport) -> IndexSummary {
    IndexSummary {
        unwatched: session.unwatched.clone(),
        ..convert::summary(report)
    }
}

/// The least time between two progress events of one index run.
const PROGRESS_EVERY: std::time::Duration = std::time::Duration::from_millis(100);

impl Service {
    /// The service before any folder is open; `config` is where the
    /// indexes go (`None`: the configuration directory).
    #[must_use]
    pub fn new(config: Option<PathBuf>) -> Arc<Self> {
        Arc::new(Self {
            config,
            sessions: Mutex::new(Sessions::default()),
            walk_rules: Mutex::new(verso_core::WalkRules::default()),
            folder_note_name: Mutex::new(String::new()),
            events: RwLock::new(Arc::new(Silent)),
            history: Mutex::new(None),
            loose: Mutex::new(loose::LooseWindows::default()),
        })
    }

    /// Where the service's events go from now on.
    pub fn set_events(&self, events: Arc<dyn Events>) {
        *self.events.write().unwrap_or_else(PoisonError::into_inner) = events;
    }

    fn events(&self) -> Arc<dyn Events> {
        Arc::clone(&self.events.read().unwrap_or_else(PoisonError::into_inner))
    }

    /// Where the indexes go.
    #[must_use]
    pub fn config(&self) -> Option<&Path> {
        self.config.as_deref()
    }

    /// An index run's progress for `clients`, at most one event every
    /// [`PROGRESS_EVERY`] — and always a phase's first and the run's last.
    /// One event per note, unchanged notes included, cost the window more
    /// CPU than the index itself on 5,000 notes (measured on Windows,
    /// 2026-10-08).
    fn progress_to(&self, clients: Vec<String>) -> impl FnMut(verso_core::IndexProgress) {
        let events = self.events();
        let mut last: Option<(std::time::Instant, String)> = None;
        move |p| {
            let now = std::time::Instant::now();
            let due = p.current >= p.total
                || last.as_ref().is_none_or(|(at, phase)| {
                    *phase != p.phase || now.duration_since(*at) >= PROGRESS_EVERY
                });
            if due {
                last = Some((now, p.phase.clone()));
                events.progress(&clients, &convert::progress(p));
            }
        }
    }

    /// Remove the temporary files a stopped process left in the folder,
    /// with one line in the log when any went; a failure to look is a
    /// warning, and the folder opens all the same.
    fn sweep_temporaries(&self, workspace: &Workspace) {
        match workspace.sweep_temporaries() {
            Ok(0) => {}
            Ok(n) => self.events().log(
                "INFO",
                &format!(
                    "folder {}: {n} temporary file(s) of an interrupted write removed",
                    workspace.name()
                ),
            ),
            Err(e) => self.events().log(
                "WARN",
                &format!(
                    "folder {}: its temporary files were not swept: {e}",
                    workspace.name()
                ),
            ),
        }
    }

    /// Open a folder and index it, blocking — seconds on a large vault, so
    /// a host calls it off its event loop. Watched before the first index
    /// run, so that a change made while it runs is not missed; a folder that
    /// cannot be watched opens all the same, and the reason goes with every
    /// summary. Progress goes to `opener` only: another client shows
    /// another folder (ADR 0065).
    pub fn open(
        self: &Arc<Self>,
        opener: &str,
        open: impl FnOnce(Option<&Path>) -> Result<Workspace, CoreError>,
    ) -> Result<Opened, ContractError> {
        let mut workspace = open(self.config()).map_err(convert)?;
        workspace.set_walk_rules(*lock(&self.walk_rules));
        workspace.set_folder_note_name(&lock(&self.folder_note_name));
        self.keep_history(&mut workspace);
        // What a write or a transfer cut short by a crash left behind: no
        // write of this opening is in flight yet, and those of this
        // process under another opening are spared by verso-fs.
        self.sweep_temporaries(&workspace);
        let missed = Arc::new(AtomicBool::new(false));
        let (watch, unwatched) = self.watch(&workspace, Arc::clone(&missed));
        let report = workspace
            .index_with_progress(self.progress_to(vec![opener.to_owned()]))
            .map_err(convert)?;
        // Asked once, at the opening: said to the client with the folder,
        // and one line in the log (ADR 0048, revised 2026-10-12).
        let late_outside_changes = workspace.names_by_link();
        if let Some(fs) = &late_outside_changes {
            self.events().log(
                "WARN",
                &format!(
                    "folder {}: its volume ({fs}) has no exclusive rename, so a file Verso creates or moves there is named by a link; its later removal by another program may show only at a reindex or at sync's scan",
                    workspace.name()
                ),
            );
        }
        let mut info = FolderInfo {
            name: workspace.name(),
            key: workspace.key(),
            index: convert::summary(&report),
            late_outside_changes,
        };
        info.index.unwatched.clone_from(&unwatched);
        Ok(Opened {
            session: Session {
                workspace,
                info,
                unwatched,
                _watch: watch,
            },
            missed,
        })
    }

    fn watch(
        self: &Arc<Self>,
        workspace: &Workspace,
        missed: Arc<AtomicBool>,
    ) -> (Option<verso_core::Watch>, Option<String>) {
        let service: Weak<Self> = Arc::downgrade(self);
        let key = workspace.key();
        let watched = workspace.watch(move |changes| {
            if let Some(service) = service.upgrade() {
                service.changed(&key, &missed, Some(&changes));
            }
        });
        match watched {
            // A folder on a network file system is scanned every 30 seconds
            // instead (ADR 0075 item 3): said with every summary, as an
            // unwatched folder's reason is.
            Ok(watch) => {
                let said = watch.scanned.as_ref().map(|fs| {
                    format!("on a network file system ({fs}): changes made elsewhere are found by a scan every 30 seconds")
                });
                (Some(watch), said)
            }
            Err(CoreError::Watch(os)) => (None, Some(os.to_string())),
            Err(e) => (None, Some(e.to_string())),
        }
    }

    /// `client` shows the folder just opened: it leaves its own (closed if
    /// no other client shows it); a folder another client has open already
    /// keeps its session, and this one joins it. True when a batch came
    /// while the folder was being opened: the host then runs
    /// [`Service::catch_up`] off its event loop.
    pub fn attach(&self, client: &str, opened: Opened) -> (FolderInfo, Option<CatchUp>) {
        let info = opened.session.info.clone();
        let missed = opened.missed;
        // A window that showed loose files shows a folder now (ADR 0114).
        self.release_loose(client);
        {
            let mut sessions = lock(&self.sessions);
            release(&mut sessions, client);
            sessions
                .by_key
                .entry(info.key.clone())
                .or_insert_with(|| Arc::new(Mutex::new(opened.session)));
            sessions.clients.insert(client.to_owned(), info.key.clone());
        }
        let catch_up = missed.swap(false, Ordering::SeqCst).then(|| CatchUp {
            key: info.key.clone(),
            missed,
        });
        (info, catch_up)
    }

    /// A batch that came while its folder was being opened, run now.
    pub fn catch_up(&self, c: &CatchUp) {
        self.changed_outside(&c.key, &c.missed);
    }

    /// A batch from the watch, on its thread: index the folder again and
    /// tell the clients that show it, once. The payload names what this
    /// run found changed (a note just written by a client is current
    /// already and is not named), and the clients check their open notes
    /// against the disk anyway. A batch that finds no session for its
    /// folder does nothing and sets `missed`: the folder is still being
    /// opened.
    pub fn changed_outside(&self, key: &str, missed: &AtomicBool) {
        self.changed(key, missed, None);
    }

    /// The folder walked again as [`Service::changed_outside`] walks it,
    /// without the progress the windows show for a walk: what a folder's
    /// sync asks for itself — on reconnecting and on its five-minute scan
    /// — so that a change the watcher's batches never brought (a deletion
    /// while the server was out of reach, C15 of the live campaign) is in
    /// the listing it compares (ADR 0079 item 6).
    pub fn walk_quietly(&self, key: &str) {
        self.changed_as(key, &AtomicBool::new(false), None, false);
    }

    /// The same, with the batch's paths when the watch gave them: only
    /// those are read again when they can be (ADR 0073 item 12).
    fn changed(&self, key: &str, missed: &AtomicBool, changes: Option<&verso_core::Changes>) {
        self.changed_as(key, missed, changes, true);
    }

    /// [`Service::changed`], its progress shown to the windows or not.
    fn changed_as(
        &self,
        key: &str,
        missed: &AtomicBool,
        changes: Option<&verso_core::Changes>,
        shown: bool,
    ) {
        let (clients, session) = {
            let sessions = lock(&self.sessions);
            let Some(session) = sessions.by_key.get(key).map(Arc::clone) else {
                missed.store(true, Ordering::SeqCst);
                return;
            };
            (sessions.clients_of(key), session)
        };
        let mut session = lock(&session);
        let mut said = self.progress_to(clients.clone());
        let progress = move |p| {
            if shown {
                said(p);
            }
        };
        let outcome = std::panic::catch_unwind(AssertUnwindSafe(|| match changes {
            Some(changes) => session.workspace.index_changes(changes, progress),
            None => session.workspace.index_with_progress(progress),
        }));
        let report = match outcome {
            Ok(Ok(report)) => Ok(report),
            Ok(Err(e)) => Err(e.to_string()),
            Err(payload) => Err(format!("the core failed: {}", panic_text(payload.as_ref()))),
        };
        let payload = match report {
            Ok(report) => {
                // What the watcher found changed was made outside Verso:
                // a version of nobody's (ADR 0091 item 4).
                for problem in session
                    .workspace
                    .history_outside(&report.changed, &report.gone)
                {
                    self.events().log("WARN", &problem);
                }
                // A narrowed run read a few paths: the counts and problems
                // of the last walk still describe the folder.
                if !report.narrowed {
                    session.info.index = session_summary(&session, &report);
                }
                FolderChanged {
                    key: key.to_owned(),
                    changed: report.changed,
                    removed: report.gone,
                    moved: Vec::new(),
                    listing: report.listing_changed,
                    index: session.info.index.clone(),
                }
            }
            // The index could not be brought up to date: the clients are
            // told, with the reason among the problems, and keep what they
            // show.
            Err(reason) => {
                let mut index = session.info.index.clone();
                index.unindexed = Some(reason);
                FolderChanged {
                    key: key.to_owned(),
                    changed: Vec::new(),
                    removed: Vec::new(),
                    moved: Vec::new(),
                    listing: false,
                    index,
                }
            }
        };
        drop(session);
        self.events().folder_changed(&clients, &payload);
    }

    /// The session of the folder `client` shows.
    fn session_of(&self, client: &str) -> Option<Arc<Mutex<Session>>> {
        let sessions = lock(&self.sessions);
        let key = sessions.clients.get(client)?;
        sessions.by_key.get(key).map(Arc::clone)
    }

    /// Run `f` on the workspace `client` shows. A panic inside the core is
    /// answered as `failed`, not propagated: propagated, it would poison
    /// the lock and every later command would fail until restart, with the
    /// user's notes open.
    pub fn with<T, F: FnOnce(&mut Workspace) -> Result<T, OpError>>(
        &self,
        client: &str,
        f: F,
    ) -> Result<T, ContractError> {
        // A window of files without a folder has no folder to ask (ADR
        // 0114 item 19): refused, not "no folder is open".
        if self.is_loose(client) {
            return Err(not_available());
        }
        let session = self.session_of(client).ok_or_else(no_folder)?;
        let asked = std::time::Instant::now();
        let mut session = lock(&session);
        let (got, label) = (std::time::Instant::now(), std::any::type_name::<F>());
        let done = std::panic::catch_unwind(AssertUnwindSafe(|| f(&mut session.workspace)));
        self.history_flush(&mut session.workspace);
        self.slow_lock(label, got - asked, got.elapsed());
        match done {
            Ok(result) => result.map_err(OpError::into_contract),
            Err(payload) => {
                let message = format!("the core failed: {}", panic_text(payload.as_ref()));
                self.events().log("ERROR", &message);
                Err(failed(message))
            }
        }
    }

    /// Run `f` on folder `key` if it is open, whichever client shows it: a
    /// file of the folder a page asks for outside its connection (the
    /// server's `/f/`). `no_folder` when no client shows it.
    pub fn with_key<T, F: FnOnce(&mut Workspace) -> Result<T, OpError>>(
        &self,
        key: &str,
        f: F,
    ) -> Result<T, ContractError> {
        let session = lock(&self.sessions)
            .by_key
            .get(key)
            .map(Arc::clone)
            .ok_or_else(no_folder)?;
        let asked = std::time::Instant::now();
        let mut session = lock(&session);
        let (got, label) = (std::time::Instant::now(), std::any::type_name::<F>());
        let done = std::panic::catch_unwind(AssertUnwindSafe(|| f(&mut session.workspace)));
        self.history_flush(&mut session.workspace);
        self.slow_lock(label, got - asked, got.elapsed());
        match done {
            Ok(result) => result.map_err(OpError::into_contract),
            Err(payload) => {
                let message = format!("the core failed: {}", panic_text(payload.as_ref()));
                self.events().log("ERROR", &message);
                Err(failed(message))
            }
        }
    }

    /// A command of the folder by name, its arguments as JSON (what the
    /// server receives): `None` when `name` is not one of
    /// [`ops::FOLDER_COMMANDS`].
    pub fn dispatch(
        &self,
        client: &str,
        name: &str,
        args: serde_json::Value,
    ) -> Option<Result<serde_json::Value, ContractError>> {
        ops::access(name)?;
        if self.is_loose(client) {
            return Some(
                self.loose_dispatch(client, name, &args)
                    .unwrap_or_else(|| Err(not_available())),
            );
        }
        Some(self.with(client, |ws| {
            ops::dispatch(ws, name, args).unwrap_or_else(|| Err(OpError::unknown(name)))
        }))
    }

    /// [`Self::dispatch`] for an account that may only read the folder
    /// (ADR 0087): answered from the notes' projections, by
    /// [`reader::READER_COMMANDS`]; `None` when a reader may not call
    /// `name`.
    pub fn dispatch_reader(
        &self,
        client: &str,
        name: &str,
        args: serde_json::Value,
    ) -> Option<Result<serde_json::Value, ContractError>> {
        reader::for_reader(name)?;
        Some(self.with(client, |ws| {
            reader::dispatch_reader(ws, name, args).unwrap_or_else(|| Err(OpError::unknown(name)))
        }))
    }

    /// How many folders are open.
    #[must_use]
    pub fn open_folders(&self) -> usize {
        lock(&self.sessions).by_key.len()
    }

    /// The open folder `path` (absolute, at the host's edge) lies in, when
    /// one does: its key and the path relative to it, `/`-joined (ADR 0114
    /// item 7 i). The deepest folder when one is open inside another.
    #[must_use]
    pub fn folder_containing(&self, path: &Path) -> Option<(String, String)> {
        let sessions = self.all_sessions();
        let mut best: Option<(usize, String, String)> = None;
        for session in sessions {
            let session = lock(&session);
            let folder = session.workspace.folder();
            if let Ok(rel) = path.strip_prefix(folder) {
                let relative = rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/");
                let depth = folder.components().count();
                if relative.is_empty() || best.as_ref().is_some_and(|(d, _, _)| *d >= depth) {
                    continue;
                }
                best = Some((depth, session.workspace.key(), relative));
            }
        }
        best.map(|(_, key, relative)| (key, relative))
    }

    /// The key of the folder `client` shows.
    #[must_use]
    pub fn folder_of(&self, client: &str) -> Option<String> {
        lock(&self.sessions).clients.get(client).cloned()
    }

    /// Every client and the folder it shows.
    #[must_use]
    pub fn clients(&self) -> Vec<(String, String)> {
        lock(&self.sessions)
            .clients
            .iter()
            .map(|(c, k)| (c.clone(), k.clone()))
            .collect()
    }

    /// The clients that show folder `key`.
    #[must_use]
    pub fn clients_of(&self, key: &str) -> Vec<String> {
        lock(&self.sessions).clients_of(key)
    }

    /// `client` shows folder `key`, already open for another client (a note
    /// in a window of its own, a second window on the folder): `false`
    /// when no session has that key.
    pub fn join(&self, client: &str, key: &str) -> bool {
        let mut sessions = lock(&self.sessions);
        if !sessions.by_key.contains_key(key) {
            return false;
        }
        if sessions.clients.get(client).is_some_and(|k| k == key) {
            return true;
        }
        release(&mut sessions, client);
        sessions.clients.insert(client.to_owned(), key.to_owned());
        true
    }

    /// `client` will show folder `key` once it is open — a window made for
    /// a folder before it asks which one it shows.
    pub fn bind(&self, client: &str, key: &str) {
        lock(&self.sessions)
            .clients
            .insert(client.to_owned(), key.to_owned());
    }

    /// `client` shows no folder any more; its folder closes when no other
    /// client shows it.
    pub fn release(&self, client: &str) {
        release(&mut lock(&self.sessions), client);
        self.release_loose(client);
    }

    /// The folder `client` shows, for a client that joins a session and
    /// for a reload: `None` when it shows none.
    #[must_use]
    pub fn current_folder(&self, client: &str) -> Option<FolderInfo> {
        let session = self.session_of(client)?;
        let info = lock(&session).info.clone();
        Some(info)
    }

    /// Refresh the index of the folder `client` shows: only what changed
    /// is re-read.
    pub fn reindex(&self, client: &str) -> Result<IndexSummary, ContractError> {
        if self.is_loose(client) {
            return Err(not_available());
        }
        let (clients, session) = {
            let sessions = lock(&self.sessions);
            let key = sessions.clients.get(client).ok_or_else(no_folder)?;
            let session = sessions
                .by_key
                .get(key)
                .map(Arc::clone)
                .ok_or_else(no_folder)?;
            (sessions.clients_of(key), session)
        };
        let mut session = lock(&session);
        let progress = self.progress_to(clients);
        let report = match std::panic::catch_unwind(AssertUnwindSafe(|| {
            session.workspace.index_with_progress(progress)
        })) {
            Ok(result) => result.map_err(convert)?,
            Err(payload) => {
                let message = format!("the core failed: {}", panic_text(payload.as_ref()));
                self.events().log("ERROR", &message);
                return Err(failed(message));
            }
        };
        session.info.index = session_summary(&session, &report);
        Ok(session.info.index.clone())
    }

    /// The walk's rules, from the settings (ADR 0044, revised 2026-09-29),
    /// applied to every open folder at once.
    pub fn set_walk_rules(&self, rules: verso_core::WalkRules) {
        *lock(&self.walk_rules) = rules;
        for session in self.all_sessions() {
            lock(&session).workspace.set_walk_rules(rules);
        }
    }

    /// The folder note name setting (ADR 0060 D12), applied to every open
    /// folder at once.
    pub fn set_folder_note_name(&self, name: &str) {
        lock(&self.folder_note_name).clear();
        lock(&self.folder_note_name).push_str(name);
        for session in self.all_sessions() {
            lock(&session).workspace.set_folder_note_name(name);
        }
    }

    /// The walk's rules and the folder note's name for the folder `client`
    /// shows only — on a server they are the folder's, set by its owner
    /// (ADR 0070, the folder's layer).
    pub fn set_folder_settings(
        &self,
        client: &str,
        rules: Option<verso_core::WalkRules>,
        folder_note_name: Option<&str>,
    ) {
        if let Some(session) = self.session_of(client) {
            let mut session = lock(&session);
            if let Some(rules) = rules {
                session.workspace.set_walk_rules(rules);
            }
            if let Some(name) = folder_note_name {
                session.workspace.set_folder_note_name(name);
            }
        }
    }

    /// Keep the computer's history of every folder opened from now on,
    /// this computer's writes named `name`, versions kept `days` (ADR 0091
    /// item 8; the person's setting, 0: no limit). The desktop's; a server
    /// never calls it.
    pub fn keep_local_history(&self, name: &str, days: u32) {
        *lock(&self.history) = Some((name.to_owned(), days));
        for session in self.all_sessions() {
            let mut session = lock(&session);
            if session.workspace.keeps_history() {
                session.workspace.set_history_name(name);
            } else {
                self.keep_history(&mut session.workspace);
            }
        }
    }

    /// How many days the computer's versions are kept; `None` when it
    /// keeps none.
    #[must_use]
    pub fn history_days(&self) -> Option<u32> {
        lock(&self.history).as_ref().map(|(_, d)| *d)
    }

    /// The days the computer's versions are kept, the person's setting:
    /// each open folder thinned at once.
    pub fn set_history_days(&self, days: u32) {
        if let Some((_, d)) = lock(&self.history).as_mut() {
            *d = days;
        }
        for session in self.all_sessions() {
            let mut session = lock(&session);
            self.thin_history(&mut session.workspace, days);
        }
    }

    /// Thin every open folder's history (the host's daily round).
    pub fn thin_histories(&self) {
        let Some(days) = self.history_days() else {
            return;
        };
        for session in self.all_sessions() {
            let mut session = lock(&session);
            self.thin_history(&mut session.workspace, days);
        }
    }

    fn thin_history(&self, ws: &mut Workspace, days: u32) {
        if !ws.keeps_history() {
            return;
        }
        match history::thin_local(ws, days) {
            Ok(t) if t.removed > 0 => self.events().log(
                "INFO",
                &format!(
                    "folder {}: {} version(s) of the history thinned; {} kept, {} bytes",
                    ws.name(),
                    t.removed,
                    t.count,
                    t.size
                ),
            ),
            Ok(_) => {}
            Err(e) => self.events().log(
                "WARN",
                &format!(
                    "folder {}: the history was not thinned: {}",
                    ws.name(),
                    e.into_contract().message
                ),
            ),
        }
    }

    /// Open the computer's store of `ws`'s history, when it keeps one:
    /// under the configuration directory, one file per folder; thinned at
    /// the opening. A store that cannot be opened is said, and the folder
    /// opens all the same.
    fn keep_history(&self, ws: &mut Workspace) {
        let Some((name, days)) = lock(&self.history).clone() else {
            return;
        };
        let dir = match self.config() {
            Some(d) => d.to_path_buf(),
            None => match verso_core::config_dir() {
                Ok(d) => d,
                Err(e) => {
                    self.events()
                        .log("WARN", &format!("the history has no place: {e}"));
                    return;
                }
            },
        };
        let file = dir.join("history").join(format!("{}.sqlite", ws.key()));
        match ws.keep_history(&file, &name) {
            Ok(()) => self.thin_history(ws, days),
            Err(e) => self.events().log(
                "WARN",
                &format!("folder {}: its history could not be opened: {e}", ws.name()),
            ),
        }
    }

    /// Record what the last command wrote in the computer's history.
    /// A folder's lock waited for or held a long time is said in the log,
    /// with the work that held it: every command of the folder (a read, a
    /// join) goes through this one lock, so one slow holder is every
    /// command's wait (measured live, 2026-10-26).
    fn slow_lock(&self, label: &str, waited: std::time::Duration, held: std::time::Duration) {
        const SLOW: std::time::Duration = std::time::Duration::from_millis(250);
        if waited >= SLOW || held >= SLOW {
            self.events().log(
                "WARN",
                &format!(
                    "the folder's lock: waited {} ms, held {} ms by {label}",
                    waited.as_millis(),
                    held.as_millis()
                ),
            );
        }
    }

    fn history_flush(&self, ws: &mut Workspace) {
        for problem in ws.history_flush() {
            self.events().log("WARN", &problem);
        }
    }

    fn all_sessions(&self) -> Vec<Arc<Mutex<Session>>> {
        lock(&self.sessions)
            .by_key
            .values()
            .map(Arc::clone)
            .collect()
    }
}

/// A batch to run again once its folder is installed: see
/// [`Service::attach`].
pub struct CatchUp {
    key: String,
    missed: Arc<AtomicBool>,
}

pub(crate) fn release(sessions: &mut Sessions, client: &str) {
    if let Some(key) = sessions.clients.remove(client)
        && !sessions.clients.values().any(|k| *k == key)
    {
        sessions.by_key.remove(&key);
    }
}

#[cfg(test)]
mod tests;
