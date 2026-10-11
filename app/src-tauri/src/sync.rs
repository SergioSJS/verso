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

use std::collections::HashMap;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Duration;

use serde_json::{Value, json};
use verso_contract::{SyncLogEntry, SyncRefused, SyncStatus};
use verso_core::servers;
use verso_core::sync::{self as engine, Action, FileState, Files, Seen};

use super::*;

/// A piece of a file on the wire: the server's (ADR 0079 item 12).
const PIECE: usize = 4 << 20;
/// The largest file sync carries, as the server.
const LARGEST: u64 = 1 << 30;
/// How often a folder is compared with nothing else asking (item 6).
const SCAN: Duration = Duration::from_secs(300);
/// How many lines of what crossed the window is shown.
const LOG_LINES: usize = 200;

/// What a sync needs of the app, apart from Tauri: the tests run it
/// against a real server with no window.
pub(crate) struct Ctx {
    pub(crate) service: Arc<Service>,
    pub(crate) config: Option<PathBuf>,
    /// This computer's name, for a conflict's copy.
    pub(crate) device: String,
    /// Whether the person reads Portuguese, for a conflict's copy.
    pub(crate) pt: Box<dyn Fn() -> bool + Send + Sync>,
    /// The status changed: the windows of the folder `key` hear it.
    pub(crate) shown: Shown,
}

/// Where a folder's status goes: its key and the status.
pub(crate) type Shown = Box<dyn Fn(&str, &SyncStatus) + Send + Sync>;

/// One synced folder's task.
pub(crate) struct Syncer {
    pub(crate) key: String,
    url: String,
    folder: String,
    wake: tokio::sync::Notify,
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
}

impl Syncer {
    pub(crate) fn new(key: &str, state: &engine::State) -> Arc<Self> {
        Arc::new(Self {
            key: key.to_owned(),
            url: state.server.clone(),
            folder: state.folder.clone(),
            wake: tokio::sync::Notify::new(),
            stopped: AtomicBool::new(false),
            paused: AtomicBool::new(state.paused),
            confirmed: AtomicUsize::new(0),
            again: Mutex::new(HashMap::new()),
            status: Mutex::new(SyncStatus {
                key: key.to_owned(),
                on: true,
                server: state.server.clone(),
                folder: state.folder.clone(),
                state: "starting".to_owned(),
                ..SyncStatus::default()
            }),
            dirty: Mutex::new(HashSet::new()),
            disk: Mutex::new(()),
        })
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

    pub(crate) fn stop(&self) {
        self.stopped.store(true, Ordering::Relaxed);
        self.wake.notify_one();
    }

    /// Sync turned off (item 1): the task ends, the state is forgotten,
    /// both sides stay as they are.
    pub(crate) fn turn_off(&self, config: Option<&Path>) -> Result<(), ContractError> {
        let _one = lock(&self.disk);
        self.stop();
        off(config, &self.key)
    }

    pub(crate) fn pause(&self, paused: bool) {
        self.paused.store(paused, Ordering::Relaxed);
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
        self.set(ctx, |s| {
            s.log.insert(
                0,
                SyncLogEntry {
                    at: log::now(),
                    what: what.to_owned(),
                    path: path.to_owned(),
                    other: other.map(str::to_owned),
                },
            );
            s.log.truncate(LOG_LINES);
        });
    }
}

/// The state, as last saved, of a folder that syncs.
pub(crate) fn synced(config: Option<&Path>, key: &str) -> Option<engine::State> {
    engine::load(config, key)
        .ok()
        .flatten()
        .filter(|s| !s.server.is_empty() && !s.off)
}

/// The folder's sync marked off, its base kept for turning it on again.
pub(crate) fn off(config: Option<&Path>, key: &str) -> Result<(), ContractError> {
    let mut state = engine::load(config, key)
        .map_err(verso_service::convert)?
        .unwrap_or_default();
    state.off = true;
    state.paused = false;
    engine::save(config, key, &state).map_err(verso_service::convert)
}

/// What a sync error is, for the window to say in its language
/// (`SyncStatus::problem`); the message stays for the log.
fn problem_of(e: &ContractError) -> &'static str {
    match e.kind {
        ErrorKind::NotFound => "folder_gone",
        ErrorKind::Refused if e.message.starts_with("not signed in") => "not_signed_in",
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

/// This computer's name, asked of the system once: what a conflict's
/// copy carries, made by sync or by the editor's "keep both".
pub(crate) fn device() -> &'static str {
    static DEVICE: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    DEVICE.get_or_init(host_name)
}

/// This computer's name as a person knows it.
pub(crate) fn host_name() -> String {
    for var in ["COMPUTERNAME", "HOSTNAME"] {
        if let Ok(v) = std::env::var(var)
            && !v.trim().is_empty()
        {
            return v.trim().to_owned();
        }
    }
    #[cfg(target_os = "macos")]
    let asked = std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output();
    #[cfg(not(target_os = "macos"))]
    let asked = std::process::Command::new("hostname").output();
    asked
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| std::env::consts::OS.to_owned())
}

/// The folder's files here: the listing's, each with its hash — read
/// again only when its size or time moved, or the watcher named it. A
/// placeholder of on-demand storage (ADR 0043) and a file that cannot be
/// read are held at the base's hash, so they are never deletions, and
/// returned apart: nothing is done to them.
fn here(
    ctx: &Ctx,
    s: &Syncer,
    state: &mut engine::State,
) -> Result<(Files, BTreeMap<String, SyncRefused>), ContractError> {
    let listed: Vec<(String, u64, i64, bool)> = ctx.service.with_key(&s.key, |ws| {
        Ok(ws
            .entries()
            .iter()
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
    let dirty: HashSet<String> = std::mem::take(&mut *lock(&s.dirty));
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
        if let Some(b) = base.get(path) {
            files.insert(
                path.to_owned(),
                FileState {
                    hash: b.clone(),
                    size: 0,
                },
            );
        }
        apart.insert(
            path.to_owned(),
            SyncRefused {
                path: path.to_owned(),
                reason: reason.to_owned(),
                message,
            },
        );
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
            held(
                &path,
                "placeholder",
                "not on this computer: on-demand storage".to_owned(),
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
        match ctx
            .service
            .with_key(&s.key, move |ws| Ok(ws.read_with_revision(&p)?.0))
        {
            Ok(bytes) => {
                let hash = sha256(&bytes);
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
                        size: bytes.len() as u64,
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
            // Gone since the listing (F22): as a change refused meanwhile,
            // read again on the next pass — held at its base, so no
            // deletion on this one; listed as changed only if it comes
            // back, never as failed.
            Err(e) if e.kind == ErrorKind::NotFound => {
                if again(s, &path) {
                    held(&path, "changed", e.message, &mut files, &mut apart);
                } else if let Some(b) = base.get(&path) {
                    files.insert(
                        path,
                        FileState {
                            hash: b.clone(),
                            size: 0,
                        },
                    );
                }
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
            Ok(Some(ws.read_with_revision(&p)?.0))
        }) {
            Ok(Some(bytes)) => {
                files.insert(
                    path,
                    FileState {
                        hash: sha256(&bytes),
                        size: bytes.len() as u64,
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
    Ok((files, apart))
}

#[must_use]
fn sha256(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// The server's files: all of them on the connection's first pass, then
/// the changes after the last head.
async fn there(remote: &remote::Remote, known: &mut Option<(Files, i64)>) -> Result<(), Value> {
    let Some((files, head)) = known else {
        let answer = remote.call("sync_state", json!({})).await?;
        let mut files = Files::new();
        for f in answer["files"].as_array().into_iter().flatten() {
            if let (Some(path), Some(hash)) = (f["path"].as_str(), f["hash"].as_str()) {
                files.insert(
                    path.to_owned(),
                    FileState {
                        hash: hash.to_owned(),
                        size: f["size"].as_u64().unwrap_or(0),
                    },
                );
            }
        }
        *known = Some((files, answer["head"].as_i64().unwrap_or(0)));
        return Ok(());
    };
    loop {
        let answer = remote
            .call("sync_changes", json!({ "since": *head }))
            .await?;
        for c in answer["changes"].as_array().into_iter().flatten() {
            let Some(path) = c["path"].as_str() else {
                continue;
            };
            if let Some(from) = c["renamedFrom"].as_str() {
                files.remove(from);
            }
            match c["hash"].as_str() {
                Some(hash) if c["deleted"] != true => {
                    files.insert(
                        path.to_owned(),
                        FileState {
                            hash: hash.to_owned(),
                            size: c["size"].as_u64().unwrap_or(0),
                        },
                    );
                }
                _ => {
                    files.remove(path);
                }
            }
            *head = (*head).max(c["seq"].as_i64().unwrap_or(0));
        }
        let more = answer["more"] == true;
        *head = (*head).max(answer["head"].as_i64().unwrap_or(0));
        if !more {
            return Ok(());
        }
    }
}

/// A connection to the server on the folder, and the role in it.
pub(crate) struct Link {
    pub(crate) remote: Arc<remote::Remote>,
    pub(crate) heard: tokio::sync::mpsc::UnboundedReceiver<remote::Heard>,
    pub(crate) role: String,
    pub(crate) name: String,
    /// The server's files and the head they are at.
    known: Option<(Files, i64)>,
    /// The next pass walks the folder first: the connection's first (a
    /// reconnection), and the scan's. The listing a pass compares is as of
    /// the watcher's last batch, and a file whose size and time are as the
    /// last pass saw them is not read again: a change no batch brought — a
    /// deletion while the server was out of reach (C15 of the live
    /// campaign, 2026-10-11) — would be skipped by every pass until a
    /// later walk.
    pub(crate) walk: bool,
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
                .send()
                .map_err(|e| ContractError {
                    kind: ErrorKind::Unavailable,
                    message: e.to_string(),
                })?,
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
    let (remote, heard) = remote::dial(&login, s.folder.clone()).await?;
    remote
        .call("open_server_folder", json!({ "id": s.folder }))
        .await
        .map_err(|e| said(&e))?;
    Ok(Link {
        remote,
        heard,
        role,
        name,
        known: None,
        walk: true,
    })
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
    if s.paused.load(Ordering::Relaxed) {
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
    });
    let remote = Arc::clone(&l.remote);
    there(&remote, &mut l.known).await.map_err(|e| said(&e))?;
    let Some((remote_files, head)) = l.known.as_mut() else {
        return Ok(Passed::default());
    };
    if l.walk {
        tokio::task::block_in_place(|| ctx.service.walk_quietly(&s.key));
        l.walk = false;
    }
    let mut state = synced(ctx.config.as_deref(), &s.key).unwrap_or_default();
    state.server.clone_from(&s.url);
    state.folder.clone_from(&s.folder);
    let (mut local, mut apart) = tokio::task::block_in_place(|| here(ctx, s, &mut state))?;
    let pt = (ctx.pt)();
    let when = chrono::Local::now().format("%Y-%m-%d %H.%M").to_string();
    let copy_name =
        |p: &str, taken: &BTreeSet<String>| engine::conflict_name(p, &ctx.device, &when, pt, taken);
    // A yes counts for the deletions the person saw, no more, and once.
    let mut plan = engine::plan(
        &local,
        remote_files,
        &state,
        false,
        engine::FOLDS_NAMES,
        &copy_name,
    );
    // A name's other Unicode form held by another file (spec Q7): listed,
    // the same one on every pass, never sent to be refused again.
    for h in &plan.held {
        let message = if h.here {
            "another file here has this name, its accents in another Unicode form: one name is one file everywhere"
        } else {
            "another file on the server has this name, its accents in another Unicode form"
        };
        apart.entry(h.path.clone()).or_insert_with(|| SyncRefused {
            path: h.path.clone(),
            reason: "name_taken".to_owned(),
            message: message.to_owned(),
        });
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
    let reader = l.role == "reader";
    let on = Side {
        ctx,
        s,
        remote: &remote,
        reader,
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
        let result = on
            .carry_out(remote_files, &mut local, &mut state, &action)
            .await;
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
                save(ctx, s, &mut state, *head);
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
    save(ctx, s, &mut state, *head);
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
        for f in apart.values() {
            if !before.contains(&(f.path.clone(), f.reason.clone())) {
                log::write(
                    "WARN",
                    "sync",
                    &format!("not synced: {} ({}: {})", f.path, f.reason, f.message),
                );
            }
        }
        st.refused = apart.into_values().collect();
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
fn save(ctx: &Ctx, s: &Syncer, state: &mut engine::State, head: i64) {
    let _one = lock(&s.disk);
    if s.stopped() && synced(ctx.config.as_deref(), &s.key).is_none() {
        return;
    }
    state.cursor = head;
    state.paused = s.paused.load(Ordering::Relaxed);
    if let Err(e) = engine::save(ctx.config.as_deref(), &s.key, state) {
        log::write("ERROR", "sync", &format!("keeping the sync's state: {e}"));
    }
}

/// Why an action was not carried out.
enum Refusal {
    /// The connection failed: the pass ends.
    Connection(ContractError),
    /// This file: listed with its reason, the rest goes on.
    File(String, String, String),
    /// The file changed while the pass ran: the next one sees it.
    Again(String, String),
}

fn of_server(path: &str, e: &Value) -> Refusal {
    let transport = e["transport"] == true;
    let e = said(e);
    match e.kind {
        ErrorKind::Unavailable if transport => Refusal::Connection(e),
        // The server answered: that file is not readable there now.
        ErrorKind::Unavailable => Refusal::File(path.to_owned(), "failed".to_owned(), e.message),
        ErrorKind::Changed => Refusal::Again(path.to_owned(), e.message),
        ErrorKind::Exists => Refusal::File(path.to_owned(), "name_taken".to_owned(), e.message),
        ErrorKind::Quota => Refusal::File(path.to_owned(), "quota".to_owned(), e.message),
        _ => Refusal::File(path.to_owned(), "failed".to_owned(), e.message),
    }
}

fn of_here(path: &str, e: ContractError) -> Refusal {
    match e.kind {
        // Changed, or gone (moved or deleted) since the pass listed it:
        // the next pass sees it as it is now.
        ErrorKind::Changed | ErrorKind::NotFound => Refusal::Again(path.to_owned(), e.message),
        // Another file here has this name, as this file system compares
        // names (case, accents): listed, never written over.
        ErrorKind::Exists => Refusal::File(
            path.to_owned(),
            "name_taken".to_owned(),
            "another file here has this name, differing only in case or accents".to_owned(),
        ),
        ErrorKind::Unavailable => Refusal::File(
            path.to_owned(),
            "placeholder".to_owned(),
            "not on this computer: on-demand storage".to_owned(),
        ),
        _ => Refusal::File(path.to_owned(), "failed".to_owned(), e.message),
    }
}

/// A step here whose entry is gone since the listing — moved or deleted
/// on this computer while the pass ran, before the watcher's batch (C17):
/// the listing is brought up to date now, as that batch would, so the pass
/// [`again`] asks for at once sees the folder as it is, not the file once
/// more (F22). Anything else is [`of_here`]'s.
fn gone_here(ctx: &Ctx, s: &Syncer, path: &str, e: ContractError) -> Refusal {
    if e.kind == ErrorKind::NotFound {
        tokio::task::block_in_place(|| {
            ctx.service.changed_outside(&s.key, &AtomicBool::new(false));
        });
    }
    of_here(path, e)
}

fn reader_refusal(path: &str) -> Refusal {
    Refusal::File(
        path.to_owned(),
        "reader".to_owned(),
        "you may only read the server's folder: this change stays here".to_owned(),
    )
}

/// Send this computer's file at `path`, in pieces; the hash sent, its
/// size, and the path it landed at — the spelling the server keeps for
/// the name, which may be this computer's in another Unicode form (spec
/// Q7).
async fn upload(
    ctx: &Ctx,
    s: &Syncer,
    remote: &remote::Remote,
    path: &str,
    base: Option<&str>,
) -> Result<(String, u64, String), Refusal> {
    let p = path.to_owned();
    let bytes = tokio::task::block_in_place(|| {
        ctx.service
            .with_key(&s.key, move |ws| Ok(ws.read_with_revision(&p)?.0))
    })
    .map_err(|e| of_here(path, e))?;
    let size = bytes.len() as u64;
    if size > LARGEST {
        return Err(Refusal::File(
            path.to_owned(),
            "too_large".to_owned(),
            "a file of more than 1 GiB is not synced".to_owned(),
        ));
    }
    let hash = sha256(&bytes);
    let mut offset = 0_usize;
    loop {
        let end = offset.saturating_add(PIECE).min(bytes.len());
        let answer = remote
            .call(
                "sync_put",
                json!({
                    "path": path,
                    "offset": offset,
                    "size": size,
                    "hash": hash,
                    "base": base,
                    "data": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes[offset..end]),
                }),
            )
            .await
            .map_err(|e| of_server(path, &e))?;
        if answer["done"] == true {
            let landed = answer["path"].as_str().unwrap_or(path).to_owned();
            return Ok((hash, size, landed));
        }
        if end >= bytes.len() {
            return Err(Refusal::Again(
                path.to_owned(),
                "changed while it crossed".to_owned(),
            ));
        }
        offset = end;
    }
}

/// The server's file at `path`, in pieces, its hash checked.
async fn download(remote: &remote::Remote, path: &str) -> Result<(Vec<u8>, String), Refusal> {
    let mut out = Vec::new();
    let mut hash = String::new();
    loop {
        let a = remote
            .call("sync_read", json!({ "path": path, "offset": out.len() }))
            .await
            .map_err(|e| of_server(path, &e))?;
        if let Some(h) = a["hash"].as_str() {
            h.clone_into(&mut hash);
        }
        let piece = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            a["data"].as_str().unwrap_or_default(),
        )
        .map_err(|_| Refusal::Again(path.to_owned(), "changed while it crossed".to_owned()))?;
        out.extend_from_slice(&piece);
        if a["done"] == true {
            break;
        }
        if piece.is_empty() {
            return Err(Refusal::Again(
                path.to_owned(),
                "changed while it crossed".to_owned(),
            ));
        }
    }
    // A broken transfer leaves nothing half-written (item 12).
    if sha256(&out) != hash {
        return Err(Refusal::Again(
            path.to_owned(),
            "changed while it crossed".to_owned(),
        ));
    }
    Ok((out, hash))
}

/// Write the server's bytes here: over the file the pass hashed — refused
/// when it changed since (invariant 11) — or as a new one.
fn write_here(
    ctx: &Ctx,
    s: &Syncer,
    path: &str,
    bytes: Vec<u8>,
    planned: Option<&str>,
) -> Result<(), Refusal> {
    let p = path.to_owned();
    let planned = planned.map(str::to_owned);
    tokio::task::block_in_place(|| {
        ctx.service.with_key(&s.key, move |ws| {
            let revision = match &planned {
                Some(hash) => {
                    let (now, revision) = ws.read_with_revision(&p)?;
                    if &sha256(&now) != hash {
                        return Err(OpError::from(ContractError {
                            kind: ErrorKind::Changed,
                            message: "changed since it was read".to_owned(),
                        }));
                    }
                    Some(revision)
                }
                None => None,
            };
            ws.write_bytes(&p, &bytes, revision.as_deref())?;
            Ok(())
        })
    })
    .map_err(|e| of_here(path, e))
}

/// What a pass carries its plan out with.
struct Side<'a> {
    ctx: &'a Ctx,
    s: &'a Syncer,
    remote: &'a remote::Remote,
    reader: bool,
}

impl Side<'_> {
    /// One step carried out. `local` is the files here as the pass hashed
    /// them, kept in step with the pass's own renames: a step after a
    /// respelling finds the file under its new name.
    async fn carry_out(
        &self,
        remote_files: &mut Files,
        local: &mut Files,
        state: &mut engine::State,
        action: &Action,
    ) -> Result<(), Refusal> {
        let Self {
            ctx,
            s,
            remote,
            reader,
        } = *self;
        let hash_here = |local: &Files, p: &str| local.get(p).map(|f| f.hash.clone());
        match action {
            Action::Agree { path, hash } => {
                match hash {
                    Some(h) => state.base.insert(path.clone(), h.clone()),
                    None => state.base.remove(path),
                };
            }
            Action::Upload { path, base } => {
                if reader {
                    return Err(reader_refusal(path));
                }
                let (hash, size, landed) = upload(ctx, s, remote, path, base.as_deref()).await?;
                // Under the spelling the server keeps for the name (spec
                // Q7), which may be this computer's in another form.
                remote_files.remove(&engine::spelled_there(remote_files, path));
                remote_files.insert(
                    landed,
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                );
                state.base.insert(path.clone(), hash);
                s.crossed(ctx, "sent", path, None);
            }
            Action::Download { path, .. } => {
                let (bytes, hash) = download(remote, path).await?;
                let size = bytes.len() as u64;
                write_here(ctx, s, path, bytes, hash_here(local, path).as_deref())?;
                remote_files.insert(
                    engine::spelled_there(remote_files, path),
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                );
                state.base.insert(path.clone(), hash);
                s.crossed(ctx, "received", path, None);
            }
            Action::DeleteRemote { path, base } => {
                if reader {
                    return Err(reader_refusal(path));
                }
                remote
                    .call("sync_delete", json!({ "path": path, "base": base }))
                    .await
                    .map_err(|e| of_server(path, &e))?;
                remote_files.remove(&engine::spelled_there(remote_files, path));
                state.base.remove(path);
                s.crossed(ctx, "deleted_there", path, None);
            }
            Action::DeleteLocal { path } => {
                let p = path.clone();
                let planned = hash_here(local, path);
                tokio::task::block_in_place(|| {
                    ctx.service.with_key(&s.key, move |ws| {
                        // Only the file the pass saw goes to the bin.
                        let (now, _) = ws.read_with_revision(&p)?;
                        if Some(sha256(&now)) != planned {
                            return Err(OpError::from(ContractError {
                                kind: ErrorKind::Changed,
                                message: "changed since it was read".to_owned(),
                            }));
                        }
                        ws.delete_entry(&p)?;
                        ws.prune_empty_parents(&p);
                        Ok(())
                    })
                })
                .map_err(|e| gone_here(ctx, s, path, e))?;
                state.base.remove(path);
                state.seen.remove(path);
                s.crossed(ctx, "deleted_here", path, None);
            }
            Action::RenameRemote { from, to, base } => {
                if reader {
                    return Err(reader_refusal(to));
                }
                let answer = remote
                    .call(
                        "sync_rename",
                        json!({ "from": from, "to": to, "base": base }),
                    )
                    .await
                    .map_err(|e| of_server(from, &e))?;
                if let Some(f) = remote_files.remove(&engine::spelled_there(remote_files, from)) {
                    let landed = answer["path"].as_str().unwrap_or(to).to_owned();
                    remote_files.insert(landed, f);
                }
                state.base.remove(from);
                state.base.insert(to.clone(), base.clone());
                s.crossed(ctx, "renamed_there", to, Some(from));
            }
            Action::RenameLocal { from, to } => {
                let (f, t) = (from.clone(), to.clone());
                tokio::task::block_in_place(|| {
                    ctx.service.with_key(&s.key, move |ws| {
                        ws.rename_entry(&f, &t)?;
                        ws.prune_empty_parents(&f);
                        Ok(())
                    })
                })
                .map_err(|e| gone_here(ctx, s, from, e))?;
                if let Some(b) = state.base.remove(from) {
                    state.base.insert(to.clone(), b);
                }
                if let Some(f) = local.remove(from) {
                    local.insert(to.clone(), f);
                }
                state.seen.remove(from);
                s.crossed(ctx, "renamed_here", to, Some(from));
            }
            Action::Conflict { path, copy, .. } => {
                // This computer's version steps aside under the copy's name…
                let (f, t) = (path.clone(), copy.clone());
                tokio::task::block_in_place(|| {
                    ctx.service
                        .with_key(&s.key, move |ws| Ok(ws.rename_entry(&f, &t).map(|_| ())?))
                })
                .map_err(|e| gone_here(ctx, s, path, e))?;
                state.base.remove(path);
                state.seen.remove(path);
                if let Some(f) = local.remove(path) {
                    local.insert(copy.clone(), f);
                }
                // …the server's takes the name…
                let (bytes, hash) = download(remote, path).await?;
                let size = bytes.len() as u64;
                write_here(ctx, s, path, bytes, None)?;
                remote_files.insert(
                    engine::spelled_there(remote_files, path),
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                );
                state.base.insert(path.clone(), hash);
                s.crossed(ctx, "conflict", path, Some(copy));
                // …and the copy goes to the others (a reader keeps it here).
                if reader {
                    return Err(reader_refusal(copy));
                }
                let (hash, size, landed) = upload(ctx, s, remote, copy, None).await?;
                remote_files.insert(
                    landed,
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                );
                state.base.insert(copy.clone(), hash);
            }
        }
        Ok(())
    }
}

/// Run a folder's sync until it is turned off or no window shows the
/// folder: connected, a pass, then waiting for a reason — the watcher, the
/// server's push, the person, the scan's five minutes — for the next;
/// offline, trying again with a growing wait.
pub(crate) async fn run(ctx: Arc<Ctx>, s: Arc<Syncer>) {
    let mut wait = 1_u64;
    let gone = |s: &Syncer| s.stopped() || ctx.service.clients_of(&s.key).is_empty();
    while !gone(&s) {
        let mut l = match link(&ctx, &s).await {
            Ok(l) => {
                wait = 1;
                l
            }
            Err(e) => {
                let offline = e.kind == ErrorKind::Unavailable;
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
                    st.problem = Some(problem_of(&e).to_owned());
                });
                let pause = if offline {
                    Duration::from_secs(wait)
                } else {
                    SCAN
                };
                wait = (wait * 2).min(60);
                tokio::select! {
                    () = s.wake.notified() => {}
                    () = tokio::time::sleep(pause) => {}
                }
                continue;
            }
        };
        log::write("INFO", "sync", &format!("connected: folder {}", s.key));
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
                Err(e) if e.kind == ErrorKind::Unavailable => break,
                Err(e) => {
                    log::write("ERROR", "sync", &e.message);
                    s.set(&ctx, |st| {
                        st.state = "error".to_owned();
                        st.message = Some(e.message.clone());
                        st.problem = Some(problem_of(&e).to_owned());
                    });
                }
            }
            let deadline = tokio::time::Instant::now() + SCAN;
            let lost = loop {
                tokio::select! {
                    () = s.wake.notified() => break false,
                    // The scan: the folder walked, as on reconnecting.
                    () = tokio::time::sleep_until(deadline) => {
                        l.walk = true;
                        break false;
                    }
                    h = l.heard.recv() => match h {
                        Some(remote::Heard::Event(e, _)) if e == "sync-changed" => break false,
                        // Promoted or made a reader: what may cross changes now.
                        Some(remote::Heard::Role(role)) => {
                            log::write("INFO", "sync", &format!("role in the server's folder: {role}"));
                            s.set(&ctx, |st| st.role.clone_from(&role));
                            l.role = role;
                            break false;
                        }
                        Some(remote::Heard::Event(..)) => {}
                        _ => break true,
                    },
                }
            };
            if lost {
                break;
            }
            // A burst of changes settles before the next pass.
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        if !gone(&s) {
            log::write(
                "WARN",
                "sync",
                &format!("offline: folder {}: the connection closed", s.key),
            );
            s.set(&ctx, |st| st.state = "offline".to_owned());
        }
    }
}
