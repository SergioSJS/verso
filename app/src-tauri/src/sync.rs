// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder of this computer kept in step with a folder on a server
//! (ADR 0079). Per synced folder, while a window shows it, a task with a
//! connection of its own over the device's session: at start and on
//! reconnecting, on the watcher's batches, on the server's pushes and every
//! five minutes, it compares the files here and there with the base
//! (`verso_core::sync`), and carries out the plan — files read and written
//! here through `verso-fs`, there through the server's sync commands, in
//! pieces. The window hears `sync-status`.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering};
use std::time::Duration;

use serde_json::{Value, json};
use verso_contract::{FolderQuota, SyncLogEntry, SyncRefused, SyncStatus, SyncVersions};
use verso_core::servers;
use verso_core::sync::{self as engine, Action, FileState, Files, Seen, remote as rem};

use super::*;
use crate::{cloud, dns::SendRetrying};

mod cloud_only;
mod hold;
pub(crate) mod live;
mod seat;
mod transfer;
pub(crate) mod universo;
pub(crate) use transfer::contract_of;
use transfer::{Gate, Refusal, Side};

/// A piece of a file on the wire, read from the disk as it is sent (ADR
/// 0079 item 12, revised 2026-10-12): the server's.
const PIECE: usize = 1 << 20;
/// The largest file sync carries, as the server.
const LARGEST: u64 = 1 << 30;
/// Why a file above [`LARGEST`] is held apart, in the window's list.
const TOO_LARGE: &str = "a file of more than 1 GiB is not synced";
/// How often a folder is compared with nothing else asking (item 6).
const SCAN: Duration = Duration::from_secs(300);
/// How many lines of what crossed the window is shown.
const LOG_LINES: usize = 200;

/// What a sync needs of the app, apart from Tauri: the tests run it
/// against a real server with no window.
pub(crate) struct Ctx {
    pub(crate) service: Arc<Service>,
    /// Where the secrets of a cloud are kept (ADR 0104 item 14).
    pub(crate) secrets: Arc<dyn crate::secrets::Secrets>,
    pub(crate) config: Option<PathBuf>,
    /// This computer's name, for a conflict's copy: asked at each pass,
    /// so that a name the person sets meanwhile is the next copy's.
    pub(crate) device: Box<dyn Fn() -> String + Send + Sync>,
    /// Whether the person reads Portuguese, for a conflict's copy.
    pub(crate) pt: Box<dyn Fn() -> bool + Send + Sync>,
    /// The status changed: the windows of the folder `key` hear it.
    pub(crate) shown: Shown,
    /// A room's event, for the windows that hold its note (ADR 0082); and
    /// the folder near its quota, for the folder's windows (ADR 0084 item
    /// 7).
    pub(crate) told: live::Told,
    /// An event for every window of the app, whatever folder it shows: a
    /// folder given to the account on the server (ADR 0084 item 7).
    pub(crate) all: All,
}

/// Where a folder's status goes: its key and the status.
pub(crate) type Shown = Box<dyn Fn(&str, &SyncStatus) + Send + Sync>;

/// An event and its payload, for every window.
pub(crate) type All = Box<dyn Fn(&str, &Value) + Send + Sync>;

/// One synced folder's task.
pub(crate) struct Syncer {
    pub(crate) key: String,
    url: String,
    folder: String,
    /// The cloud this folder syncs with, when it is not a UniVerso (ADR
    /// 0104).
    pub(crate) cloud: Option<engine::Cloud>,
    wake: tokio::sync::Notify,
    /// The person asked for a pass (Sync now): a server out of reach is
    /// tried at once, and its wait starts over.
    asked: AtomicBool,
    stopped: AtomicBool,
    paused: AtomicBool,
    /// How many deletions the person said yes to, as the pause showed them
    /// (item 9): a later plan that deletes more asks again.
    confirmed: AtomicUsize,
    /// Paths refused as changed meanwhile, and how many passes in a row:
    /// tried again once, then listed instead of retried forever.
    again: Mutex<HashMap<String, u32>>,
    status: Mutex<SyncStatus>,
    /// Paths the watcher saw change since the last pass: read again
    /// whatever their size and time say.
    dirty: Mutex<HashSet<String>>,
    /// The state file is written by one at a time: a pass, or a stop.
    disk: Mutex<()>,
    /// What each side ran when the server's contract was not this app's:
    /// the window names both builds (`SyncStatus::versions`).
    versions: Mutex<Option<SyncVersions>>,
    /// The folder's notes live in the server's rooms (ADR 0082).
    pub(crate) live: Arc<live::Live>,
    /// Said once in the log: this folder, a share's, keeps its own
    /// settings (`.verso/`) out of the sync.
    pub(crate) settings_said: AtomicBool,
    /// Who made the last change the server's log says of each path — the
    /// person and the device (sync 2) — for the recent activity of what
    /// came from there.
    authors: Mutex<HashMap<String, Author>>,
    /// Notes this window made from a template since the last pass, and
    /// the hash of the text they were made with (ADR 0093 item 12): moved
    /// into the state by the pass, kept here until the base has the path.
    made: Mutex<BTreeMap<String, String>>,
    /// What the server says this device may change is asked again: a
    /// connection was made, access changed, the role changed (ADR 0113 S8).
    rights_stale: AtomicBool,
    /// How the server answers: `RIGHTS_UNKNOWN` until asked on this
    /// connection, `RIGHTS_PER_FILE`, or `RIGHTS_BY_ROLE` for a server (or
    /// cloud) with no per-file answer.
    rights_mode: AtomicU8,
    /// The paths the server answered for since the last full question,
    /// those it said nothing may be changed in included: not asked twice.
    rights_asked: Mutex<HashSet<String>>,
    /// Who the server says this device is here, and whether to ask again.
    seat: Mutex<Option<Value>>,
    seat_stale: AtomicBool,
}

const RIGHTS_UNKNOWN: u8 = 0;
const RIGHTS_PER_FILE: u8 = 1;
const RIGHTS_BY_ROLE: u8 = 2;

/// Who made a change on the server: the person, the device.
type Author = (Option<String>, Option<String>);

impl Syncer {
    pub(crate) fn new(key: &str, state: &engine::State) -> Arc<Self> {
        Arc::new(Self {
            key: key.to_owned(),
            url: state.server.clone(),
            folder: state.folder.clone(),
            cloud: state.cloud.clone(),
            wake: tokio::sync::Notify::new(),
            asked: AtomicBool::new(false),
            stopped: AtomicBool::new(false),
            paused: AtomicBool::new(state.paused),
            confirmed: AtomicUsize::new(0),
            again: Mutex::new(HashMap::new()),
            status: Mutex::new(SyncStatus {
                key: key.to_owned(),
                on: true,
                server: state.server.clone(),
                folder: state.folder.clone(),
                cloud: state.cloud.as_ref().map(crate::cloud::status_of),
                state: "starting".to_owned(),
                ..SyncStatus::default()
            }),
            dirty: Mutex::new(HashSet::new()),
            disk: Mutex::new(()),
            versions: Mutex::new(None),
            live: Arc::default(),
            settings_said: AtomicBool::new(false),
            authors: Mutex::new(HashMap::new()),
            made: Mutex::new(BTreeMap::new()),
            rights_stale: AtomicBool::new(true),
            rights_mode: AtomicU8::new(RIGHTS_UNKNOWN),
            rights_asked: Mutex::new(HashSet::new()),
            seat: Mutex::new(state.seat.clone()),
            seat_stale: AtomicBool::new(true),
        })
    }

    /// What the server says is asked again at the next pass (access or
    /// the role changed, or the connection was remade). The last answer
    /// holds until then, and while the server is out of reach.
    pub(crate) fn rights_stale(&self) {
        self.rights_stale.store(true, Ordering::Relaxed);
        self.seat_stale.store(true, Ordering::Relaxed);
    }

    /// What the person may do with each of `paths`, as the server last
    /// said (ADR 0113 S8): the files it said may be changed are *edit*, the
    /// others it was asked about *see*; a path it was not asked about is
    /// left out. `fresh` is false while the question is being asked again.
    pub(crate) fn rights_told(
        &self,
        config: Option<&Path>,
        paths: &[String],
    ) -> verso_contract::SyncRights {
        use verso_contract::{AccessLevel, AccessWhy, FileAccess, SyncRight};
        let role = lock(&self.status).role.clone();
        let writes = synced(config, &self.key)
            .map(|st| st.access)
            .unwrap_or_default();
        let asked = lock(&self.rights_asked);
        let files = paths
            .iter()
            .filter(|p| {
                writes.contains_key(&engine::folded(p)) || asked.contains(&engine::folded(p))
            })
            .map(|p| SyncRight {
                path: p.clone(),
                access: FileAccess {
                    level: if writes.get(&engine::folded(p)).is_some_and(|r| r.put) {
                        AccessLevel::Edit
                    } else {
                        AccessLevel::See
                    },
                    attach: false,
                    attach_image: false,
                    create_note: false,
                    create_board: false,
                    why: if role == "owner" {
                        AccessWhy::Master
                    } else {
                        AccessWhy::Own
                    },
                },
            })
            .collect();
        verso_contract::SyncRights {
            fresh: !self.rights_stale.load(Ordering::Relaxed),
            files,
        }
    }

    /// Whether this device's change to `path` goes to the server, by the
    /// last answer kept: the owner's always; otherwise what the server
    /// said, or, where it gives no answer per file, the role.
    pub(crate) fn may_send(&self, config: Option<&Path>, path: &str) -> bool {
        let role = lock(&self.status).role.clone();
        if role == "owner" {
            return true;
        }
        if self.rights_mode.load(Ordering::Relaxed) == RIGHTS_BY_ROLE {
            return role != "reader";
        }
        synced(config, &self.key)
            .is_some_and(|st| st.access.get(&engine::folded(path)).is_some_and(|r| r.put))
    }

    /// A note made here from its template, with the text it was made with
    /// (ADR 0093 item 12): if the server holds one of the same name another
    /// device made apart from the same template, the two are joined
    /// instead of a conflict's copy.
    pub(crate) fn made_from_template(&self, path: &str, text: &str) {
        lock(&self.made).insert(path.to_owned(), sha256(text.as_bytes()));
    }

    pub(crate) fn status(&self) -> SyncStatus {
        lock(&self.status).clone()
    }

    fn stopped(&self) -> bool {
        self.stopped.load(Ordering::Relaxed)
    }

    pub(crate) fn poke(&self) {
        self.wake.notify_one();
    }

    /// A pass the person asked for (Sync now).
    pub(crate) fn retry(&self) {
        self.asked.store(true, Ordering::Relaxed);
        self.wake.notify_one();
    }

    pub(crate) fn stop(&self) {
        self.stopped.store(true, Ordering::Relaxed);
        self.wake.notify_one();
    }

    /// Sync turned off (item 1): the task ends, the state is forgotten,
    /// both sides stay as they are.
    pub(crate) fn turn_off(&self, config: Option<&Path>) -> Result<(), ContractError> {
        self.turned_off(config, None)
    }

    fn turned_off(
        &self,
        config: Option<&Path>,
        revoked: Option<engine::Revoked>,
    ) -> Result<(), ContractError> {
        let _one = lock(&self.disk);
        // The live notes leave their rooms (ADR 0082 item 10).
        live::out(self);
        self.stop();
        marked_off(config, &self.key, revoked)
    }

    /// The folder's owner revoked the share this folder syncs (ADR 0081
    /// item 8; the maintainer, 2026-10-12: "aviso importante"): sync turns
    /// off as the person's own turning off does — the files here stay —
    /// and the folder's state says so, and when, until sync is turned on
    /// again. A log line says it too.
    pub(crate) fn revoked(&self, ctx: &Ctx) {
        let revoked = engine::Revoked {
            at: log::now(),
            name: lock(&self.status).folder_name.clone(),
        };
        log::write(
            "WARN",
            "sync",
            &format!(
                "turned off: folder {}: its owner revoked the share of {} on {} ({}); the files here are kept",
                self.key, revoked.name, self.url, self.folder
            ),
        );
        if let Err(e) = self.turned_off(ctx.config.as_deref(), Some(revoked)) {
            log::write(
                "ERROR",
                "sync",
                &format!("turning off a revoked share's sync: {}", e.message),
            );
        }
        (ctx.shown)(&self.key, &off_status(ctx.config.as_deref(), &self.key));
    }

    pub(crate) fn pause(&self, paused: bool) {
        self.paused.store(paused, Ordering::Relaxed);
        // Paused, the live notes leave their rooms (ADR 0082 item 10).
        if paused {
            live::out(self);
        }
        self.wake.notify_one();
    }

    /// The deletions a pass paused for may go ahead (item 9).
    pub(crate) fn confirm(&self) {
        let shown = lock(&self.status).deletions.unwrap_or(0);
        self.confirmed
            .store(usize::try_from(shown).unwrap_or(0), Ordering::Relaxed);
        self.wake.notify_one();
    }

    /// The watcher saw these paths change: read again, then a pass.
    pub(crate) fn touched(&self, paths: impl IntoIterator<Item = String>) {
        lock(&self.dirty).extend(paths);
        self.wake.notify_one();
    }

    fn set(&self, ctx: &Ctx, f: impl FnOnce(&mut SyncStatus)) {
        let status = {
            let mut s = lock(&self.status);
            f(&mut s);
            s.clone()
        };
        (ctx.shown)(&self.key, &status);
    }

    fn crossed(&self, ctx: &Ctx, what: &str, path: &str, other: Option<&str>) {
        log::write(
            "INFO",
            "sync",
            &format!(
                "{what}: {path}{}",
                other.map(|o| format!(" ({o})")).unwrap_or_default()
            ),
        );
        // What came from the server says who made it there.
        let (by, device) = if from_there(what) {
            lock(&self.authors).get(path).cloned().unwrap_or_default()
        } else {
            (None, None)
        };
        self.set(ctx, |s| {
            s.log.insert(
                0,
                SyncLogEntry {
                    at: log::now(),
                    what: what.to_owned(),
                    path: path.to_owned(),
                    other: other.map(str::to_owned),
                    by,
                    device,
                },
            );
            s.log.truncate(LOG_LINES);
        });
    }
}

/// Whether a line of the recent activity is of a change that came from
/// the server: received, deleted or renamed here, a conflict, a merge.
fn from_there(what: &str) -> bool {
    matches!(
        what,
        "received" | "deleted_here" | "renamed_here" | "conflict" | "merged"
    )
}

/// The state, as last saved, of a folder that syncs.
pub(crate) fn synced(config: Option<&Path>, key: &str) -> Option<engine::State> {
    engine::load(config, key)
        .ok()
        .flatten()
        .filter(|s| !s.server.is_empty() && !s.off)
}

/// Whether the folder's saved sync is with a cloud (on or off).
pub(crate) fn cloud_of(config: Option<&Path>, key: &str) -> bool {
    engine::load(config, key)
        .ok()
        .flatten()
        .is_some_and(|s| s.cloud.is_some())
}

/// The folder's sync marked off, its base kept for turning it on again.
pub(crate) fn off(config: Option<&Path>, key: &str) -> Result<(), ContractError> {
    marked_off(config, key, None)
}

/// [`off`], and why when it is a share revoked by its owner — otherwise
/// a revocation said before is forgotten: the person turned it off.
fn marked_off(
    config: Option<&Path>,
    key: &str,
    revoked: Option<engine::Revoked>,
) -> Result<(), ContractError> {
    let mut state = engine::load(config, key)
        .map_err(verso_service::convert)?
        .unwrap_or_default();
    state.off = true;
    state.paused = false;
    state.revoked = revoked;
    engine::save(config, key, &state).map_err(verso_service::convert)
}

/// A folder whose sync is off, as the window shows it: with the share's
/// revocation when that is why it is off (ADR 0081 item 8).
pub(crate) fn off_status(config: Option<&Path>, key: &str) -> SyncStatus {
    let mut status = SyncStatus {
        key: key.to_owned(),
        state: "off".to_owned(),
        ..SyncStatus::default()
    };
    let kept = engine::load(config, key).ok().flatten().filter(|s| s.off);
    if let Some(state) = kept
        && let Some(revoked) = state.revoked
    {
        status.server = state.server;
        status.folder = state.folder;
        status.folder_name = revoked.name;
        status.problem = Some("revoked".to_owned());
        status.message = Some("the folder's owner revoked the share: sync is off".to_owned());
        status.revoked = Some(revoked.at);
    }
    status
}

/// What a sync error is, for the window to say in its language
/// (`SyncStatus::problem`); the message stays for the log.
pub(crate) fn problem_of(e: &ContractError, cloud: bool) -> &'static str {
    match e.kind {
        ErrorKind::NotFound => "folder_gone",
        // Offline, because the server did not answer: the window names it.
        ErrorKind::Unreachable => "unreachable",
        ErrorKind::Refused if e.message.starts_with("not signed in") => "not_signed_in",
        // The game master closed the table, or moved it (ADR 0117 R9): sync waits.
        ErrorKind::Refused if e.message.contains(verso_contract::TABLE_MOVED) => "table_moved",
        ErrorKind::Refused if e.message.contains(verso_contract::TABLE_CLOSED) => "table_closed",
        // A cloud (ADR 0104): the sign-in, the keyring, the service that
        // cannot keep a write safe.
        ErrorKind::Refused if e.message.starts_with("cloud sign-in refused") => "cloud_auth",
        ErrorKind::Refused if e.message.starts_with("no keyring") => "no_keyring",
        ErrorKind::Refused if cloud => "cloud_refused",
        ErrorKind::Refused if e.message.contains("update the one that is behind") => "version",
        ErrorKind::Refused => "signed_out",
        _ => "failed",
    }
}

/// The sync-related outcome of a command, as the contract's error.
fn said(e: &Value) -> ContractError {
    serde_json::from_value::<ContractError>(e.clone())
        .unwrap_or_else(|_| verso_service::failed("the server refused"))
}

/// The files here as a pass compares them, and those held apart.
type Here = (Files, BTreeMap<String, SyncRefused>);

/// The folder's files here: the listing's, each with its hash — read
/// again only when its size or time moved, or the watcher named it. A
/// placeholder of on-demand storage (ADR 0043) and a file that cannot be
/// read are held at the base's hash, so they are never deletions, and
/// returned apart: nothing is done to them.
///
/// A listed file that is not on the disk any more is gone since the
/// listing, and the watcher may never say so — on macOS FSEvents does not
/// report the removal of a file whose name `link` gave, as `verso-fs`
/// gives every file it creates (C13 of the live campaign, 2026-10-11):
/// the folder is walked at once and listed again, so this pass compares
/// it as it is — the deletion, or the server's newer version, carried out
/// now — and the file is never held as changed.
///
/// In a share's folder (`share`), the folder's own settings, `.verso/`,
/// are this machine's business: never listed, never sent, said once in
/// the log (ADR 0070, ADR 0081 item 6).
fn here(
    ctx: &Ctx,
    s: &Syncer,
    state: &mut engine::State,
    share: bool,
) -> Result<Here, ContractError> {
    let dirty: HashSet<String> = std::mem::take(&mut *lock(&s.dirty));
    if let Some(found) = listed_here(ctx, s, state, &dirty, (false, share))? {
        return Ok(found);
    }
    ctx.service.walk_quietly(&s.key);
    listed_here(ctx, s, state, &dirty, (true, share))?
        .ok_or_else(|| verso_service::failed("the folder's listing did not settle"))
}

/// [`here`] on the listing as it stands: `None` when a listed file is gone
/// from the disk, unless the folder was `walked` just now — then a listed
/// file the disk lacks is held apart as failed, never a deletion.
fn listed_here(
    ctx: &Ctx,
    s: &Syncer,
    state: &mut engine::State,
    dirty: &HashSet<String>,
    (walked, share): (bool, bool),
) -> Result<Option<Here>, ContractError> {
    // The walk's entries and the folder's settings directory, which the
    // walk never lists and sync carries like any file (ADR 0070, ADR 0079
    // item 2) — but not in a share's folder, where they stay here.
    let listed: Vec<(String, u64, i64, bool)> = ctx.service.with_key(&s.key, |ws| {
        let settings = ws.settings_entries();
        if share && !settings.is_empty() && !s.settings_said.swap(true, Ordering::Relaxed) {
            log::write(
                "INFO",
                "sync",
                "this folder syncs a share: its own settings (.verso/) stay on this computer and are not synced",
            );
        }
        let settings = if share { &[][..] } else { settings };
        Ok(ws
            .entries()
            .iter()
            .chain(settings)
            .filter(|e| e.kind != verso_core::FileKind::Folder)
            .map(|e| {
                (
                    e.path.clone(),
                    e.len,
                    e.modified,
                    e.kind == verso_core::FileKind::Placeholder,
                )
            })
            .collect())
    })?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX));
    let mut files = Files::new();
    let mut apart = BTreeMap::new();
    let base = state.base.clone();
    let held = |path: &str,
                reason: &str,
                message: String,
                files: &mut Files,
                apart: &mut BTreeMap<String, SyncRefused>| {
        cloud_only::hold(&base, (path, reason, message), files, apart);
    };
    for (path, size, modified, placeholder) in listed {
        // A name the server would refuse is said here, not sent (F19).
        if !engine::portable(&path) {
            held(
                &path,
                "name_invalid",
                "a name not every system can keep: a trailing dot or space, one of < > : \" | ? * \\, or a device name such as CON".to_owned(),
                &mut files,
                &mut apart,
            );
            continue;
        }
        if placeholder {
            // The older form's stub of a file synced before is that file.
            held(
                &cloud_only::standing(&path, |p| base.contains_key(p)),
                "placeholder",
                "not on this computer: on-demand storage".to_owned(),
                &mut files,
                &mut apart,
            );
            continue;
        }
        // Larger than sync carries, by the listing's size: never read — a
        // file of gigabytes read and hashed at every pass takes the
        // computer's memory — held at its base, never a deletion, and
        // listed (said in the log once, as any file held apart).
        if size > LARGEST {
            held(
                &path,
                "too_large",
                TOO_LARGE.to_owned(),
                &mut files,
                &mut apart,
            );
            continue;
        }
        if let Some(seen) = state.seen.get(&path)
            && seen.size == size
            && seen.modified == modified
            && !dirty.contains(&path)
        {
            files.insert(
                path,
                FileState {
                    hash: seen.hash.clone(),
                    size,
                },
            );
            continue;
        }
        let p = path.clone();
        // Hashed a piece at a time: a large file is never whole in memory.
        match ctx
            .service
            .with_key(&s.key, move |ws| Ok(ws.hash_with_revision(&p)?))
        {
            Ok(read) => {
                let hash = read.hash;
                // A file changed in the second it was read could change
                // again with the same size and time: not remembered.
                if modified < now - 2 {
                    state.seen.insert(
                        path.clone(),
                        Seen {
                            size,
                            modified,
                            hash: hash.clone(),
                        },
                    );
                } else {
                    state.seen.remove(&path);
                }
                files.insert(
                    path,
                    FileState {
                        hash,
                        size: read.len,
                    },
                );
            }
            Err(e) if e.kind == ErrorKind::Unavailable => held(
                &path,
                "placeholder",
                "not on this computer: on-demand storage".to_owned(),
                &mut files,
                &mut apart,
            ),
            // Gone since the listing (F22, C13): the folder is walked and
            // listed again; held at its base meanwhile, never a deletion
            // on a listing that is out of date.
            Err(e) if e.kind == ErrorKind::NotFound => {
                if !walked {
                    gone_line(&path, "this pass, once listed again");
                    return Ok(None);
                }
                held(&path, "failed", e.message, &mut files, &mut apart);
            }
            Err(e) => held(&path, "failed", e.message, &mut files, &mut apart),
        }
    }
    // The listing is as of the watcher's last batch: a file of the base it
    // lacks — written by this sync a moment ago, or gone — is read; only a
    // file that is not there is a deletion.
    // A base path whose name the file system folds onto a listed one is
    // that file renamed (only its case or its accents' form changed): it
    // is not there any more, whatever a read through the folding says.
    let listed_folded: HashSet<String> = files.keys().map(|p| engine::folded(p)).collect();
    let unlisted: Vec<String> = state
        .base
        .keys()
        .filter(|p| !files.contains_key(*p) && !apart.contains_key(*p))
        .filter(|p| !(engine::FOLDS_NAMES && listed_folded.contains(&engine::folded(p))))
        .cloned()
        .collect();
    // A folder where a file of the base was is not that file: the unit of
    // sync is a file (ADR 0079 item 2), so it is gone, never read as one.
    for path in unlisted {
        let p = path.clone();
        match ctx.service.with_key(&s.key, move |ws| {
            if ws.is_folder(&p) {
                return Ok(None);
            }
            // Larger than sync carries, by its size on the disk: not read.
            if ws.file_len(&p).is_some_and(|len| len > LARGEST) {
                return Ok(Some(None));
            }
            Ok(Some(Some(ws.hash_with_revision(&p)?)))
        }) {
            Ok(Some(None)) => held(
                &path,
                "too_large",
                TOO_LARGE.to_owned(),
                &mut files,
                &mut apart,
            ),
            Ok(Some(Some(read))) => {
                files.insert(
                    path,
                    FileState {
                        hash: read.hash,
                        size: read.len,
                    },
                );
            }
            Ok(None) => {}
            Err(e) if e.kind == ErrorKind::NotFound => {}
            Err(e) if e.kind == ErrorKind::Unavailable => held(
                &path,
                "placeholder",
                "not on this computer: on-demand storage".to_owned(),
                &mut files,
                &mut apart,
            ),
            Err(e) => held(&path, "failed", e.message, &mut files, &mut apart),
        }
    }
    state.seen.retain(|p, _| files.contains_key(p));
    Ok(Some((files, apart)))
}

#[must_use]
fn sha256(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A connection to the server on the folder, and the role in it.
pub(crate) struct Link {
    /// The other side of the sync, whatever it is (ADR 0104 item 3).
    pub(crate) remote: Arc<dyn rem::Remote>,
    /// A UniVerso's connection, which the tests close and read; a cloud
    /// has none.
    #[cfg(test)]
    pub(crate) socket: Option<Arc<remote::Remote>>,
    pub(crate) heard: tokio::sync::mpsc::UnboundedReceiver<remote::Heard>,
    /// What a cloud's link holds so that its `heard` stays open and quiet.
    pub(crate) _quiet: Option<tokio::sync::mpsc::UnboundedSender<remote::Heard>>,
    pub(crate) role: String,
    pub(crate) name: String,
    /// The remote's files, each with its version, and the feed's cursor.
    pub(crate) known: Option<rem::Known>,
    /// The next pass walks the folder first: the connection's first (a
    /// reconnection), and the scan's. The listing a pass compares is as of
    /// the watcher's last batch, and a file whose size and time are as the
    /// last pass saw them is not read again: a change no batch brought — a
    /// deletion while the server was out of reach (C15 of the live
    /// campaign, 2026-10-11) — would be skipped by every pass until a
    /// later walk.
    pub(crate) walk: bool,
    /// The server's folder is a share of another person's (ADR 0081 item
    /// 6): this folder's own settings stay here.
    pub(crate) share: bool,
}

impl Link {
    /// The head of the server's log the device's files are known at.
    #[cfg(test)]
    pub(crate) fn cursor(&self) -> Option<i64> {
        self.known
            .as_ref()
            .and_then(|k| k.cursor.as_ref())
            .and_then(|c| c.parse().ok())
    }
}

/// Connect for `s`: the device's session, the folder opened, its role.
pub(crate) async fn link(ctx: &Ctx, s: &Syncer) -> Result<Link, ContractError> {
    let login = servers::find(ctx.config.as_deref(), &s.url)
        .map_err(verso_service::convert)?
        .ok_or_else(|| {
            refused("not signed in to the server: sign in again in Settings › Servers")
        })?;
    let (url, token, folder) = (login.url.clone(), login.token.clone(), s.folder.clone());
    let listed = tauri::async_runtime::spawn_blocking(move || {
        remote::answer(
            remote::http()?
                .get(format!("{url}/api/folders"))
                .bearer_auth(token)
                .send_retrying()
                .map_err(|e| reach::unsent(&url, &e))?,
        )
    })
    .await
    .map_err(|e| verso_service::failed(e.to_string()))??;
    let mine = listed["folders"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|f| f["id"] == folder.as_str())
        .ok_or_else(|| ContractError {
            kind: ErrorKind::NotFound,
            message: "the server's folder is gone, or this account no longer reaches it".to_owned(),
        })?;
    let role = mine["role"].as_str().unwrap_or("reader").to_owned();
    let name = mine["name"].as_str().unwrap_or_default().to_owned();
    // A share of another person's folder (ADR 0081 item 6).
    let share = mine["share"] == true;
    let (remote, heard, hello) = remote::dial_hello(&login, s.folder.clone()).await?;
    // A room's events go to the windows as they come, never behind a pass
    // (ADR 0082 item 2).
    let heard = live::relay(Arc::clone(&s.live), Arc::clone(&ctx.told), heard);
    // Only the sync's version decides (ADR 0079 item 5, revised
    // 2026-11-02): the contract's never refuses a synced folder. A sync
    // one side cannot follow is said as a version problem, naming both
    // versions when they differ.
    if let Some(why) = remote::sync_refused(&hello) {
        let v = remote::versions(&hello);
        *lock(&s.versions) = (v.server_version != v.app_version).then_some(v);
        return Err(refused(why));
    }
    remote
        .call("open_server_folder", json!({ "id": s.folder }))
        .await
        .map_err(|e| said(&e))?;
    // The rooms of the folder's live notes go over this link (ADR 0082
    // item 2).
    s.live.connected(Arc::clone(&remote));
    Ok(Link {
        remote: Arc::new(universo::Universo::new(Arc::clone(&remote))),
        #[cfg(test)]
        socket: Some(remote),
        heard,
        _quiet: None,
        role,
        name,
        known: None,
        walk: true,
        share,
    })
}

/// Asks the server what this device may change, for the paths a pass is
/// about to change (all the files, when the answer is stale), and keeps the
/// answers in the state. True when the server's judgement of each change is
/// the only one: the folder's owner, or a server that gives no per-file
/// answer to an editor (ADR 0113 S8).
fn judged(
    s: &Syncer,
    remote: &dyn rem::Remote,
    role: &str,
    (plan, theirs, ours): (&engine::Plan, &Files, &Files),
    state: &mut engine::State,
) -> Result<bool, rem::RemoteError> {
    if role == "owner" {
        return Ok(true);
    }
    if s.rights_mode.load(Ordering::Relaxed) == RIGHTS_BY_ROLE {
        return Ok(role != "reader");
    }
    let stale = s.rights_stale.load(Ordering::Relaxed);
    let mut want: BTreeSet<String> = BTreeSet::new();
    for a in &plan.actions {
        match a {
            Action::Upload { path, .. } | Action::DeleteRemote { path, .. } => {
                want.insert(path.clone());
            }
            Action::RenameRemote { from, to, .. } => {
                want.insert(from.clone());
                want.insert(to.clone());
            }
            Action::Conflict { path, copy, .. } => {
                want.insert(path.clone());
                want.insert(copy.clone());
            }
            _ => {}
        }
    }
    if stale {
        want.extend(theirs.keys().cloned());
        want.extend(ours.keys().cloned());
    } else {
        let asked = lock(&s.rights_asked);
        want.retain(|p| !asked.contains(&engine::folded(p)));
    }
    if want.is_empty() {
        return Ok(false);
    }
    let list: Vec<String> = want.into_iter().collect();
    let Some(answers) = remote.rights(&list)? else {
        s.rights_mode.store(RIGHTS_BY_ROLE, Ordering::Relaxed);
        return Ok(role != "reader");
    };
    s.rights_mode.store(RIGHTS_PER_FILE, Ordering::Relaxed);
    let mut asked = lock(&s.rights_asked);
    if stale {
        state.access.clear();
        asked.clear();
        s.rights_stale.store(false, Ordering::Relaxed);
    }
    for p in &list {
        state.access.remove(&engine::folded(p));
        asked.insert(engine::folded(p));
    }
    for (p, r) in answers {
        if r.writes() {
            state.access.insert(engine::folded(&p), r);
        }
    }
    Ok(false)
}

/// What a pass carried out, said for the tests.
#[derive(Debug, Default)]
pub(crate) struct Passed {
    pub(crate) actions: usize,
    pub(crate) paused: Option<usize>,
}

/// One comparison and its plan carried out. An error of the connection
/// ends the pass; one of a file is listed and the rest goes on.
pub(crate) async fn pass(ctx: &Ctx, s: &Syncer, l: &mut Link) -> Result<Passed, ContractError> {
    // Held too while a phone's background sync waits for its conditions.
    if s.paused.load(Ordering::Relaxed) || crate::background::held().is_some() {
        s.set(ctx, |st| {
            st.state = "paused".to_owned();
            st.deletions = None;
        });
        return Ok(Passed::default());
    }
    s.set(ctx, |st| {
        st.state = "syncing".to_owned();
        st.role.clone_from(&l.role);
        st.folder_name.clone_from(&l.name);
        st.message = None;
        st.problem = None;
        st.versions = None;
    });
    // The status just said the link is up: the tabs whose notes were in
    // rooms come back into them before anything is compared (ADR 0082
    // item 9).
    live::rejoined(s).await;
    seat::refresh(ctx, s).await;
    let remote = Arc::clone(&l.remote);
    let mut state = synced(ctx.config.as_deref(), &s.key).unwrap_or_default();
    state.server.clone_from(&s.url);
    state.folder.clone_from(&s.folder);
    // The remote's files: all of them on the connection's first pass, then
    // the changes after the last cursor; a cloud's versions already seen
    // are not read again.
    let named = tokio::task::block_in_place(|| rem::refresh(&*remote, &mut l.known, &state.tokens))
        .map_err(transfer::contract_of)?;
    for who in named {
        lock(&s.authors).insert(who.path, (who.by, who.device));
    }
    let Some(known) = l.known.as_mut() else {
        return Ok(Passed::default());
    };
    if l.walk {
        tokio::task::block_in_place(|| ctx.service.walk_quietly(&s.key));
        l.walk = false;
    }
    // The notes made from a template since: the base of a join should the
    // server hold one of the same name (ADR 0093 item 12).
    for (path, hash) in lock(&s.made).iter() {
        if !state.base.contains_key(path) {
            state
                .made
                .entry(path.clone())
                .or_insert_with(|| hash.clone());
        }
    }
    // A share carries no settings of the folder's: none of the server's
    // is fetched over this computer's own (ADR 0070).
    if l.share {
        known.files.retain(|p, _| !engine::settings_path(p));
        known.versions.retain(|p, _| !engine::settings_path(p));
    }
    let share = l.share;
    let (mut local, mut apart) = tokio::task::block_in_place(|| here(ctx, s, &mut state, share))?;
    let pt = (ctx.pt)();
    let device = (ctx.device)();
    let when = chrono::Local::now().format("%Y-%m-%d %H.%M").to_string();
    let copy_name =
        |p: &str, taken: &BTreeSet<String>| engine::conflict_name(p, &device, &when, pt, taken);
    // A live note's own text, already in its room, is not a change to
    // send nor a conflict (ADR 0082 items 6 and 9).
    let planned_on = live::masked(s, &local, &known.files, &state.base);
    // A live note whose server file is its own room's save, not fetched
    // before the link went: planned from that save, so that the tab's text
    // is sent over it, not set aside beside it (ADR 0082 item 9).
    let planned_from = live::over_saves(s, &local, &known.files, &state.base).map(|base| {
        let mut st = state.clone();
        st.base = base;
        st
    });
    // A yes counts for the deletions the person saw, no more, and once;
    // the log's renames are renames here, whatever the bytes did (B12).
    let mut plan = engine::plan_moved(
        planned_on.as_ref().unwrap_or(&local),
        &known.files,
        planned_from.as_ref().unwrap_or(&state),
        false,
        engine::FOLDS_NAMES,
        &known.moved,
        &copy_name,
    );
    // A name's other Unicode form held by another file (spec Q7), or a
    // name on the server another file there holds in another case (spec
    // Q8): listed, the same one on every pass, never sent or fetched to be
    // refused again.
    for h in &plan.held {
        apart
            .entry(h.path.clone())
            .or_insert_with(|| transfer::held_refused(h));
    }
    let yes = s.confirmed.swap(0, Ordering::Relaxed);
    if plan.pause.is_some_and(|n| n <= yes) {
        plan.pause = None;
    }
    if let Some(n) = plan.pause {
        let shown = u32::try_from(n).unwrap_or(u32::MAX);
        // Said once, not on every pass that finds the same deletions.
        if lock(&s.status).deletions != Some(shown) {
            log::write(
                "WARN",
                "sync",
                &format!("paused: the pass would delete {n} files; the person is asked"),
            );
        }
        s.set(ctx, |st| {
            st.state = "paused".to_owned();
            st.deletions = Some(u32::try_from(n).unwrap_or(u32::MAX));
        });
        return Ok(Passed {
            actions: 0,
            paused: Some(n),
        });
    }
    let open = tokio::task::block_in_place(|| {
        judged(
            s,
            &*remote,
            &l.role,
            (&plan, &known.files, &local),
            &mut state,
        )
    })
    .map_err(transfer::contract_of)?;
    // The answers as they stand for this pass; the state keeps them.
    let rights = state.access.clone();
    let on = Side {
        ctx,
        s,
        remote: &*remote,
        gate: Gate {
            open,
            rights: &rights,
        },
    };
    let (mut sending, mut receiving) = (0_u32, 0_u32);
    for a in &plan.actions {
        match a {
            Action::Upload { .. } | Action::DeleteRemote { .. } | Action::RenameRemote { .. } => {
                sending += 1;
            }
            Action::Download { .. } | Action::DeleteLocal { .. } | Action::RenameLocal { .. } => {
                receiving += 1;
            }
            Action::Conflict { .. } => {
                sending += 1;
                receiving += 1;
            }
            Action::Agree { .. } => {}
        }
    }
    s.set(ctx, |st| {
        st.sending = sending;
        st.receiving = receiving;
        st.deletions = None;
    });
    let mut done = 0;
    // Paths a step of this pass could not carry out: a later step on the
    // same file — a fetch after the respelling it needed — waits for the
    // next pass.
    let mut stuck: HashSet<String> = HashSet::new();
    for action in plan.actions {
        if s.stopped() || s.paused.load(Ordering::Relaxed) {
            break;
        }
        let touches: Vec<&str> = match &action {
            Action::Upload { path, .. }
            | Action::Download { path, .. }
            | Action::DeleteRemote { path, .. }
            | Action::DeleteLocal { path }
            | Action::Agree { path, .. } => vec![path],
            Action::RenameRemote { from, to, .. } | Action::RenameLocal { from, to } => {
                vec![from, to]
            }
            Action::Conflict { path, copy, .. } => vec![path, copy],
        };
        // Nothing is done to a file held apart (a placeholder, unreadable).
        if touches
            .iter()
            .any(|p| apart.contains_key(*p) || stuck.contains(*p))
        {
            continue;
        }
        let result = on.carry_out(known, &mut local, &mut state, &action);
        if result.is_err() {
            stuck.extend(touches.iter().map(|p| (*p).to_owned()));
        }
        match result {
            Ok(()) => {
                done += 1;
                let mut again = lock(&s.again);
                for p in &touches {
                    again.remove(*p);
                }
            }
            Err(Refusal::Connection(e)) => {
                save(ctx, s, &mut state, known);
                return Err(e);
            }
            Err(Refusal::File(path, reason, message)) => {
                apart.insert(
                    path.clone(),
                    SyncRefused {
                        path,
                        reason,
                        message,
                    },
                );
            }
            // Gone here: the folder was walked; the pass right after
            // reads it again and carries out what the folder now says. A
            // step that finds it gone on that pass too is listed, not
            // retried forever: what is missing is not the file.
            Err(Refusal::Gone(path)) => {
                if again(s, &path) {
                    apart.insert(
                        path.clone(),
                        SyncRefused {
                            path,
                            reason: "failed".to_owned(),
                            message: "not found here, though the folder lists it".to_owned(),
                        },
                    );
                }
            }
            // Changed meanwhile: the next pass sees it as it is now —
            // once; a refusal that comes back is listed, not retried
            // forever.
            Err(Refusal::Again(path, message)) => {
                if again(s, &path) {
                    apart.insert(
                        path.clone(),
                        SyncRefused {
                            path,
                            reason: "changed".to_owned(),
                            message,
                        },
                    );
                }
            }
        }
        match &action {
            Action::Upload { .. } | Action::DeleteRemote { .. } | Action::RenameRemote { .. } => {
                sending = sending.saturating_sub(1);
            }
            Action::Download { .. } | Action::DeleteLocal { .. } | Action::RenameLocal { .. } => {
                receiving = receiving.saturating_sub(1);
            }
            Action::Conflict { .. } => {
                sending = sending.saturating_sub(1);
                receiving = receiving.saturating_sub(1);
            }
            Action::Agree { .. } => {}
        }
        s.set(ctx, |st| {
            st.sending = sending;
            st.receiving = receiving;
        });
    }
    save(ctx, s, &mut state, known);
    known.settle(&state.base); // the log's renames done, or moot
    let (apart, cloud_only) = cloud_only::split(apart, &known.files);
    let conflicts: Vec<String> = ctx
        .service
        .with_key(&s.key, |ws| {
            Ok(ws
                .entries()
                .iter()
                .filter(|e| is_conflict_copy(&e.path))
                .map(|e| e.path.clone())
                .collect())
        })
        .unwrap_or_default();
    s.set(ctx, |st| {
        st.state = "synced".to_owned();
        st.sending = 0;
        st.receiving = 0;
        st.conflicts = conflicts;
        // Each file left out goes to the log once, when it first is.
        let before: HashSet<(String, String)> = st
            .refused
            .iter()
            .map(|f| (f.path.clone(), f.reason.clone()))
            .collect();
        for f in &apart {
            if !before.contains(&(f.path.clone(), f.reason.clone())) {
                log::write(
                    "WARN",
                    "sync",
                    &format!("not synced: {} ({}: {})", f.path, f.reason, f.message),
                );
            }
        }
        st.refused = apart;
        // One line for the count, when it changes: not a line per path.
        if !cloud_only.is_empty() && cloud_only.len() != st.cloud_only.len() {
            log::write(
                "INFO",
                "sync",
                &format!(
                    "{} files are only in the cloud on this computer; the server has them",
                    cloud_only.len()
                ),
            );
        }
        st.cloud_only = cloud_only;
        st.last = Some(log::now());
    });
    Ok(Passed {
        actions: done,
        paused: None,
    })
}

/// A file that changed or went while a pass ran: the first time, read
/// again on a pass right after (`false`); when it comes back on the next
/// pass too, `true` — listed instead of retried forever.
fn again(s: &Syncer, path: &str) -> bool {
    let times = {
        let mut again = lock(&s.again);
        let n = again.entry(path.to_owned()).or_insert(0);
        *n += 1;
        *n
    };
    if times < 2 {
        lock(&s.dirty).insert(path.to_owned());
        s.poke();
        false
    } else {
        true
    }
}

/// A conflict's copy, by its name (item 8), in either language.
pub(crate) fn is_conflict_copy(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.contains(" (conflict, ") || name.contains(" (conflito, ")
}

/// The state written, unless the sync was turned off meanwhile.
fn save(ctx: &Ctx, s: &Syncer, state: &mut engine::State, known: &rem::Known) {
    let _one = lock(&s.disk);
    if s.stopped() && synced(ctx.config.as_deref(), &s.key).is_none() {
        return;
    }
    // A UniVerso's cursor is its log's head; a cloud has no feed, and keeps
    // the versions it learned instead (ADR 0104 item 8).
    state.cursor = known
        .cursor
        .as_deref()
        .and_then(|c| c.parse().ok())
        .unwrap_or(0);
    state.tokens = if state.cloud.is_some() {
        known.tokens()
    } else {
        std::collections::BTreeMap::new()
    };
    state.paused = s.paused.load(Ordering::Relaxed);
    state.seat = s.seat();
    // A note made from a template both sides agree on needs no base.
    let base = &state.base;
    state.made.retain(|p, _| !base.contains_key(p));
    lock(&s.made).retain(|p, _| !base.contains_key(p));
    if let Err(e) = engine::save(ctx.config.as_deref(), &s.key, state) {
        log::write("ERROR", "sync", &format!("keeping the sync's state: {e}"));
    }
}

/// The log's line for a file found gone here since the listing: its
/// deletion, or the server's newer version, is carried out `on` that pass.
fn gone_line(path: &str, on: &str) {
    log::write(
        "INFO",
        "sync",
        &format!(
            "gone here since the folder was listed: {path} (the folder is walked again; its deletion, or the server's newer version, is carried out on {on})"
        ),
    );
}

/// What the server pushed on the device's connection that a window says
/// (ADR 0084 item 7): the folder near its quota, to this folder's windows
/// (pushed only to connections on the server's folder, so it is this
/// one's); a folder given to the account, to every window, naming the
/// server. A pass needs neither. One that does not read as its type is
/// not said.
pub(crate) fn tell(ctx: &Ctx, s: &Syncer, event: &str, payload: Value) {
    match event {
        "folder-quota" => {
            let windows = ctx.service.clients_of(&s.key);
            let quota = serde_json::from_value::<FolderQuota>(payload)
                .ok()
                .and_then(|q| serde_json::to_value(q).ok());
            if let (false, Some(quota)) = (windows.is_empty(), quota) {
                (ctx.told)(&windows, event, &quota);
            }
        }
        "share-given" => {
            if let Some(given) = remote::with_server(event, payload, &s.url) {
                (ctx.all)(event, &given);
            }
        }
        _ => {}
    }
}

/// Run a folder's sync until it is turned off or no window shows the
/// folder: connected, a pass, then waiting for a reason — the watcher, the
/// server's push, the person, the scan's five minutes — for the next;
/// offline, trying again with a growing wait (`reach::Backoff`: 5 s to 5
/// min), from the start again once connected or when the person asks.
pub(crate) async fn run(ctx: Arc<Ctx>, s: Arc<Syncer>) {
    let mut wait = reach::Backoff::new();
    let gone = |s: &Syncer| s.stopped() || ctx.service.clients_of(&s.key).is_empty();
    while !gone(&s) {
        if s.asked.swap(false, Ordering::Relaxed) {
            wait.reset();
        }
        let linked = if s.cloud.is_some() {
            cloud::link(&ctx, &s).await
        } else {
            link(&ctx, &s).await
        };
        let mut l = match linked {
            Ok(l) => {
                wait.reset();
                l
            }
            Err(e) => {
                // The network is down, or the server: offline either way.
                let offline = matches!(e.kind, ErrorKind::Unavailable | ErrorKind::Unreachable);
                // Said once per state, not on every try.
                let was = lock(&s.status).state.clone();
                let now = if offline { "offline" } else { "error" };
                if was != now {
                    log::write(
                        if offline { "WARN" } else { "ERROR" },
                        "sync",
                        &format!("{now}: folder {}: {}", s.key, e.message),
                    );
                }
                s.set(&ctx, |st| {
                    st.state = if offline { "offline" } else { "error" }.to_owned();
                    st.message = Some(e.message.clone());
                    let problem = problem_of(&e, s.cloud.is_some());
                    st.versions = if problem == "version" {
                        lock(&s.versions).clone()
                    } else {
                        None
                    };
                    st.problem = Some(problem.to_owned());
                });
                // A closed table is tried again gently (15 s), not every five minutes.
                let closed = e.message.contains(verso_contract::TABLE_CLOSED);
                let pause = if offline {
                    wait.next()
                } else if closed {
                    Duration::from_secs(15)
                } else {
                    SCAN
                };
                tokio::select! {
                    () = s.wake.notified() => {}
                    () = tokio::time::sleep(pause) => {}
                }
                continue;
            }
        };
        log::write("INFO", "sync", &format!("connected: folder {}", s.key));
        // The server ended this device's session: said now, as it closes
        // the connection, not as a connection lost.
        let mut ended = false;
        // The folder's owner revoked the share: sync turns off.
        let mut revoked = false;
        while !gone(&s) {
            match pass(&ctx, &s, &mut l).await {
                // Waiting for the person; the pass said so.
                Ok(Passed {
                    paused: Some(_), ..
                }) => {}
                Ok(p) if p.actions > 0 => log::write(
                    "INFO",
                    "sync",
                    &format!("a pass carried out {} changes", p.actions),
                ),
                Ok(_) => {}
                Err(e) if matches!(e.kind, ErrorKind::Unavailable | ErrorKind::Unreachable) => {
                    break;
                }
                Err(e) => {
                    log::write("ERROR", "sync", &e.message);
                    s.set(&ctx, |st| {
                        st.state = "error".to_owned();
                        st.message = Some(e.message.clone());
                        st.problem = Some(problem_of(&e, s.cloud.is_some()).to_owned());
                    });
                }
            }
            let deadline = tokio::time::Instant::now() + SCAN;
            let lost = loop {
                // What the connection heard first: a connection closed
                // while a change arrived here is seen closed, not used for
                // a pass (the live campaign, 2026-10-11). A wake waits as
                // a stored permit.
                tokio::select! {
                    biased;
                    h = l.heard.recv() => match h {
                        Some(remote::Heard::Event(e, _)) if e == "sync-changed" => break false,
                        // Promoted or made a reader: what may cross changes now.
                        Some(remote::Heard::Role(role)) => {
                            log::write("INFO", "sync", &format!("role in the server's folder: {role}"));
                            s.set(&ctx, |st| st.role.clone_from(&role));
                            l.role = role;
                            s.rights_stale();
                            break false;
                        }
                        // Access changed (ADR 0113 S8): what this device may
                        // change is asked again before the next pass sends
                        // anything; the windows hear it as they did.
                        Some(remote::Heard::Event(e, payload)) if e == "access-changed" => {
                            s.rights_stale();
                            tell(&ctx, &s, &e, payload);
                            break false;
                        }
                        Some(remote::Heard::Event(e, payload)) => tell(&ctx, &s, &e, payload),
                        Some(remote::Heard::Gone(what, _)) if what == "session" => {
                            log::write("INFO", "sync", "signed out: the server ended this device's session");
                            ended = true;
                            break true;
                        }
                        Some(remote::Heard::Gone(what, why))
                            if what == "folder" && why.as_deref() == Some("revoked") =>
                        {
                            revoked = true;
                            break true;
                        }
                        _ => break true,
                    },
                    () = s.wake.notified() => break false,
                    // The scan: the folder walked, as on reconnecting.
                    () = tokio::time::sleep_until(deadline) => {
                        l.walk = true;
                        break false;
                    }
                }
            };
            if revoked {
                s.live.lost();
                s.revoked(&ctx);
                return;
            }
            if lost {
                break;
            }
            // A burst of changes settles before the next pass; a cloud's
            // calls are dearer than a server's, so it settles longer (ADR
            // 0104 item 8: each local change, debounced).
            let settle = Duration::from_millis(if s.cloud.is_some() { 2000 } else { 500 });
            s.live.settle(settle).await;
        }
        // The live notes go local (ADR 0082 item 8).
        s.live.lost();
        if !gone(&s) && !ended {
            log::write(
                "WARN",
                "sync",
                &format!("offline: folder {}: the connection closed", s.key),
            );
            s.set(&ctx, |st| st.state = "offline".to_owned());
        }
    }
}
