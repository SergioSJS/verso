// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The version history of the server's folders (ADR 0091). Every write to
//! a folder ends in one reconciliation that appends to its change log
//! (`sync.rs`); each text file's new bytes there are a version, kept in
//! `history.sqlite` of the data directory (item 1) — never in the folder,
//! never synced — named by who made the change (item 4): the account of a
//! window, a device by its name, an agent's token, the accounts whose
//! edits a room's save holds, or nobody, a change from outside Verso. A
//! room's saves fold into one version per ten minutes (item 3).
//!
//! Who sees and does what (item 6): whoever may write the file lists its
//! versions and restores; the folder's owner and the admin delete one; a
//! reader sees no history. A share sees the history of its files. The
//! history is shown in the folder's page, not counted against its quota,
//! its oldest versions thinned early when it alone passes it (item 7).
//! Thinned at start, once a day, and a minute after a write.
//!
//! The store's IO is SQLite's, through `verso-index`, at a path of the
//! data directory: the same exception as the server's own database.

use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde_json::{Value, json};
use verso_contract::{ContractError, ErrorKind, VersionRestored};
use verso_core::history::{self as core_history, Author, Kind, Recorded, Store, StoreError};
use verso_service::history::{self, Policy};
use verso_service::{OpError, lock};

use crate::auth::{Via, Who};
use crate::db::{Audit, Role};
use crate::rpc::{arg, blocking, to_value};
use crate::state::Server;
use crate::sync::Author as By;

/// How long after a write its folder's history is thinned: a burst of
/// writes makes one thinning.
const AFTER_WRITE: Duration = Duration::from_secs(60);

/// How often every folder's history is thinned.
const DAILY: Duration = Duration::from_secs(24 * 60 * 60);

/// The folders' histories, in the data directory.
pub struct Book {
    store: Option<Mutex<Store>>,
}

impl Book {
    /// The store at `<data>/history.sqlite`; one that cannot be opened is
    /// said in the log and kept in memory meanwhile, so that the writes go
    /// on and the history holds what this run saw.
    #[must_use]
    pub fn open(data: &std::path::Path) -> Self {
        let store = Store::open(&data.join("history.sqlite")).or_else(|e| {
            crate::log::error(&format!(
                "the version history could not be opened ({e}): kept in memory until the server restarts"
            ));
            Store::memory()
        });
        match store {
            Ok(s) => Self {
                store: Some(Mutex::new(s)),
            },
            Err(e) => {
                crate::log::error(&format!("the version history is off: {e}"));
                Self { store: None }
            }
        }
    }

    /// Run `f` on the store.
    pub fn with<T>(
        &self,
        f: impl FnOnce(&mut Store) -> Result<T, StoreError>,
    ) -> Result<T, String> {
        let store = self
            .store
            .as_ref()
            .ok_or_else(|| "the version history is off: see the server's log".to_owned())?;
        f(&mut lock(store)).map_err(|e| e.to_string())
    }
}

fn refused(message: &str) -> ContractError {
    verso_service::refused(message)
}

fn not_found(message: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::NotFound,
        message: message.to_owned(),
    }
}

fn failed(e: impl std::fmt::Display) -> ContractError {
    verso_service::failed(e.to_string())
}

/// The name of account `id`, as a version names it.
fn account_name(server: &Server, id: &str) -> String {
    server
        .db
        .account(id)
        .ok()
        .flatten()
        .map_or_else(|| id.to_owned(), |a| a.name)
}

/// Who a change names, and what kind of version it is (item 4).
fn authors(server: &Server, by: By<'_>) -> (Vec<Author>, Kind) {
    if let Some(ids) = by.room {
        let names = ids
            .iter()
            .map(|id| Author::new("account", &account_name(server, id)))
            .collect();
        return (names, Kind::Room);
    }
    if let Some(d) = by.device {
        return (vec![Author::new("device", d)], Kind::Write);
    }
    if let Some(t) = by.token {
        return (vec![Author::new("agent", t)], Kind::Write);
    }
    match by.account {
        Some(id) => (
            vec![Author::new("account", &account_name(server, id))],
            Kind::Write,
        ),
        None => (vec![Author::new("outside", "")], Kind::Outside),
    }
}

/// What a reconciliation recorded in the change log, in the history: each
/// text file's new bytes a version (items 1 and 2), a rename followed, a
/// deletion kept reachable (item 9). What fails is said in the log, and
/// never fails the write. `first`: the log's first look at the folder,
/// whose files are found as they are, written by nobody it knows.
pub fn recorded(
    server: &Server,
    (folder, key): (&str, &str),
    by: By<'_>,
    changes: &[crate::db::Recorded],
    first: bool,
) {
    if changes.is_empty() {
        return;
    }
    let at = core_history::now_ms();
    let froms: HashSet<&str> = changes
        .iter()
        .filter_map(|(_, _, from)| from.as_deref())
        .collect();
    let (names, kind) = if first {
        (Vec::new(), Kind::Found)
    } else {
        authors(server, by)
    };
    let mut wrote = false;
    for (path, now, from) in changes {
        let done = match (now, from) {
            (None, _) if froms.contains(path.as_str()) => Ok(()),
            (None, _) => server.history.with(|s| s.gone(folder, path, at)),
            (Some((hash, size, _)), from) => {
                if let Some(from) = from
                    && let Err(e) = server.history.with(|s| s.moved(folder, from, path, at))
                {
                    crate::log::warn(&format!("the history of {path}: {e}"));
                }
                let small = u64::try_from(*size).is_ok_and(|n| n <= core_history::LARGEST);
                if !core_history::kept(path) || !small {
                    continue;
                }
                let p = path.clone();
                match server
                    .service
                    .with_key(key, move |ws| Ok(ws.read_file(&p)?))
                {
                    // The file is not what the change was hashed from: it
                    // changed again since, and that change is a version of
                    // its own, with its own author. These bytes under this
                    // change would name the wrong one (and the later
                    // change, equal to them, would make none).
                    Ok(bytes) if crate::sync::sha256(&bytes) != *hash => Ok(()),
                    Ok(bytes) => server
                        .history
                        .with(|s| s.record(folder, path, &bytes, at, &names, kind))
                        .map(|_| wrote = true),
                    // Gone again since, or not readable now: the next
                    // change of it is a version.
                    Err(_) => Ok(()),
                }
            }
        };
        if let Err(e) = done {
            crate::log::warn(&format!("the history of {path}: {e}"));
        }
    }
    if wrote && let Some(server) = server.me() {
        soon(&server, folder);
    }
}

/// A file a room was made from, with no history yet: its text as it was
/// found, so that the first edit leaves something to go back to.
pub fn seen(server: &Server, key: &str, path: &str, text: &str) {
    let Some(folder) = lock(&server.keys).get(key).cloned() else {
        return;
    };
    if !core_history::kept(path) {
        return;
    }
    let at = core_history::now_ms();
    let done = server.history.with(|s| {
        if s.has(&folder, path)? {
            return Ok(());
        }
        s.record(&folder, path, text.as_bytes(), at, &[], Kind::Found)
            .map(|_| ())
    });
    if let Err(e) = done {
        crate::log::warn(&format!("the history of {path}: {e}"));
    }
}

/// The admin's days for `folder`, if set from the console.
fn set_days(server: &Server, folder: &str) -> Option<u32> {
    server
        .db
        .setting(&format!("history_days:{folder}"))
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
}

/// The days versions of `folder` are kept: the console's, else
/// `VERSO_HISTORY_DAYS` (item 3; 0: no limit).
#[must_use]
pub fn days(server: &Server, folder: &str) -> u32 {
    set_days(server, folder).unwrap_or(server.config.history_days)
}

fn quota(server: &Server, folder: &str) -> Option<u64> {
    server
        .db
        .quota(folder)
        .ok()
        .flatten()
        .and_then(|q| u64::try_from(q).ok())
}

/// Thin `folder`'s history now (items 3 and 7), each removal early a line
/// of the log; what it holds after kept for the console's overview.
pub fn thin(server: &Server, folder: &str) -> Option<core_history::Thinned> {
    let days = days(server, folder);
    let quota = quota(server, folder);
    let now = core_history::now_ms();
    match server.history.with(|s| s.thin(folder, now, days, quota)) {
        Ok(t) => {
            if t.removed > 0 || t.early > 0 {
                crate::log::info(&format!(
                    "folder {folder}: the history thinned {} version(s), {} early for the quota; {} kept, {} bytes",
                    t.removed, t.early, t.count, t.size
                ));
            }
            let value = json!({ "count": t.count, "size": t.size, "early": t.early > 0 });
            if let Err(e) = server
                .db
                .set_setting(&format!("history:{folder}"), &value.to_string())
            {
                crate::log::error(&format!("keeping a history's size: {e}"));
            }
            Some(t)
        }
        Err(e) => {
            crate::log::warn(&format!("folder {folder}: the history's thinning: {e}"));
            None
        }
    }
}

/// What the history of `folder` held when last thinned: versions, bytes.
#[must_use]
pub fn kept_size(server: &Server, folder: &str) -> (u64, u64) {
    server.history.with(|s| s.size(folder)).unwrap_or((0, 0))
}

/// The folders whose thinning is waiting.
fn waiting() -> &'static Mutex<HashSet<String>> {
    static WAITING: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    WAITING.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Thin `folder` in [`AFTER_WRITE`], once for a burst.
fn soon(server: &Arc<Server>, folder: &str) {
    let Some(runtime) = server.runtime.get() else {
        return;
    };
    if !lock(waiting()).insert(folder.to_owned()) {
        return;
    }
    let s = Arc::clone(server);
    let f = folder.to_owned();
    runtime.spawn(async move {
        tokio::time::sleep(AFTER_WRITE).await;
        lock(waiting()).remove(&f);
        let _ = tokio::task::spawn_blocking(move || thin(&s, &f)).await;
    });
}

/// Every folder's history, at start and once a day.
pub async fn daily(server: Arc<Server>) {
    loop {
        let s = Arc::clone(&server);
        let _ = tokio::task::spawn_blocking(move || {
            for f in s.db.folders().unwrap_or_default() {
                thin(&s, &f.id);
            }
        })
        .await;
        tokio::time::sleep(DAILY).await;
    }
}

/// What the console's folder page shows of the history (item 7): versions,
/// bytes, the days in effect and how they were set, whether its oldest go
/// early.
pub fn console_view(server: &Server, folder: &str) -> Result<Value, String> {
    let (count, size) = server.history.with(|s| s.size(folder))?;
    let quota = quota(server, folder);
    Ok(json!({
        "count": count,
        "size": size,
        "days": days(server, folder),
        "adminDays": set_days(server, folder),
        "defaultDays": server.config.history_days,
        "early": quota.is_some_and(|q| size > q),
    }))
}

/// Set from the console how long `folder` keeps versions (item 3): none
/// for `VERSO_HISTORY_DAYS`. What is past the new time goes now.
pub fn set_from_console(server: &Server, folder: &str, days: Option<u32>) -> Result<Value, String> {
    let value = days.map_or_else(String::new, |d| d.to_string());
    server
        .db
        .set_setting(&format!("history_days:{folder}"), &value)?;
    thin(server, folder);
    console_view(server, folder)
}

/// Who a window's restore names: its token when it came through one, else
/// its account.
fn token_name(server: &Server, who: &Who) -> Option<String> {
    let Via::Token { id, .. } = &who.via else {
        return None;
    };
    server
        .db
        .tokens_of(&who.account.id)
        .ok()?
        .into_iter()
        .find(|t| &t.id == id)
        .map(|t| t.name)
}

/// A line of the audit log about `folder`'s history.
fn audit(server: &Server, actor: &str, action: &str, subject: &str, folder: &str) {
    if let Err(e) = server.db.audit(&Audit {
        actor: Some(actor),
        action,
        subject: Some(subject),
        folder: Some(folder),
        address: None,
        ok: true,
    }) {
        crate::log::error(&format!("the audit log: {e}"));
    }
}

/// The history's commands of a window (`history_*`), its role checked
/// first (item 6).
pub async fn command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    args: Value,
) -> Result<Value, ContractError> {
    let door = crate::access::Door::of(server, who, client)?;
    let scope = door.scope.clone();
    // A reader sees no history (item 6): a past version would need the
    // projection of ADR 0087 applied to each.
    if !door.writes_here() {
        return Err(refused(
            "the history is for those who may change this folder",
        ));
    }
    let folder = door.folder.clone();
    let owner = door.asker.role == Some(Role::Owner) && !door.asker.phone;
    let asked: String = arg(&args, "path")?;
    let writes = matches!(cmd, "history_restore" | "history_copy");
    let full = match &scope {
        Some(s) if writes => s.to_full_write(&asked)?,
        Some(s) => s.to_full(&asked)?,
        None => asked.clone(),
    };
    let path = {
        let (s, c) = (Arc::clone(server), client.to_owned());
        let confined = blocking(move || s.service.with(&c, |ws| Ok(ws.confined(&full)?))).await;
        match &scope {
            Some(s) => confined.map_err(|e| s.error(e))?,
            None => confined?,
        }
    };
    // A player of a table has the history of the files they edit, and no
    // other: the past of a file they do not see is not theirs to read.
    if door.veiled() && !door.may_path(crate::access::Action::Edit, &path).allowed() {
        return Err(not_found("no such version of this file"));
    }
    // A past version of a board holds what the player is not shown of it: a
    // card of a hidden file, a secret pin (ADR 0113 H). The history of a
    // board is the game master's.
    if door.veiled() && crate::access::Kind::of_path(&path) == crate::access::Kind::Board {
        return Err(not_found("no such version of this file"));
    }
    // A copy of a version is a new file beside the file: the folder is one
    // the person makes files in.
    if cmd == "history_copy" {
        let beside = path.rsplit_once('/').map_or("", |(d, _)| d);
        if !door
            .may(
                crate::access::Action::Create(crate::access::Made::of_path(&path, false)),
                beside,
                crate::access::Kind::Folder,
            )
            .allowed()
        {
            return Err(refused(
                "the history is for those who may change this folder",
            ));
        }
    }
    let policy = Policy {
        days: days(server, &folder),
        can_delete: (owner && scope.is_none()) || who.account.admin,
        quota: quota(server, &folder),
    };
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    let s = Arc::clone(server);
    let c = client.to_owned();
    let cmd = cmd.to_owned();
    let actor = who.account.id.clone();
    let token = token_name(server, who);
    let shown = scope.clone();
    let out = move |p: &str| match &shown {
        Some(sc) => sc.to_rel(p).unwrap_or_default(),
        None => p.to_owned(),
    };
    blocking(move || {
        let list = |s: &Server| -> Result<verso_contract::HistoryListing, ContractError> {
            let l = s
                .history
                .with(|st| st.versions(&folder, &path))
                .map_err(failed)?;
            let (_, size) = s.history.with(|st| st.size(&folder)).map_err(failed)?;
            let mut listing = history::listing(&asked, &l, policy, size, "");
            for v in &mut listing.versions {
                v.path = out(&v.path);
            }
            Ok(listing)
        };
        // A version of this file, and its bytes.
        let version = |s: &Server| -> Result<(String, Vec<u8>), ContractError> {
            let id: String = arg(&args, "id")?;
            let n = history::id_of(&id, "").map_err(OpError::into_contract)?;
            let l = s
                .history
                .with(|st| st.versions(&folder, &path))
                .map_err(failed)?;
            if !l.versions.iter().any(|v| v.id == n) {
                return Err(not_found("no such version of this file"));
            }
            let (_, bytes) = s
                .history
                .with(|st| st.read(&folder, n))
                .map_err(failed)?
                .ok_or_else(|| not_found("no such version of this file"))?;
            Ok((id, bytes))
        };
        let author = match &token {
            Some(t) => Author::new("agent", t),
            None => Author::new("account", &account_name(&s, &actor)),
        };
        let by = By {
            account: Some(&actor),
            token: token.as_deref(),
            ..By::default()
        };
        match cmd.as_str() {
            "history_list" => to_value(list(&s)?),
            "history_read" => {
                let (id, bytes) = version(&s)?;
                to_value(history::text(&id, bytes))
            }
            "history_restore" => {
                let (id, bytes) = version(&s)?;
                let revision: Option<String> = arg(&args, "revision")?;
                let len = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
                crate::quota::check(&s, &key, &path, len)?;
                // Itself a version (item 5), recorded before the write so
                // that the room's save of it does not fold it into the
                // room's own; taken back when the write fails.
                let at = core_history::now_ms();
                let made = s
                    .history
                    .with(|st| st.record(&folder, &path, &bytes, at, &[author], Kind::Restore))
                    .map_err(failed)?;
                let written =
                    crate::collab::restore_through(&s, &key, &path, &bytes, revision.as_deref())
                        .and_then(|through| match through {
                            Some(rev) => Ok(rev),
                            None => s.service.with(&c, |ws| {
                                Ok(history::restore(ws, &path, &bytes, revision.as_deref())?
                                    .revision)
                            }),
                        });
                let revision = match written {
                    Ok(r) => r,
                    Err(e) => {
                        if let Recorded::New(n) = made {
                            let _ = s.history.with(|st| st.delete(&folder, n).map(|_| ()));
                        }
                        return Err(match &scope {
                            Some(sc) => sc.error(e),
                            None => e,
                        });
                    }
                };
                crate::sync::reconcile_key_by(&s, &key, by, std::slice::from_ref(&path));
                crate::sync::told(&s, &key, std::slice::from_ref(&path), &[], &[]);
                audit(
                    &s,
                    &actor,
                    "history_restored",
                    &format!("{path} ({id})"),
                    &folder,
                );
                crate::log::info(&format!("restored version {id} of {path} ({actor})"));
                to_value(VersionRestored {
                    path: asked.clone(),
                    revision,
                })
            }
            "history_copy" => {
                let (id, bytes) = version(&s)?;
                let stamp: String = arg(&args, "stamp")?;
                let lang: String = arg(&args, "lang").unwrap_or_default();
                let len = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
                // A new file: the whole of it against the quota.
                let new = history::copy_name(&path, &stamp, lang.starts_with("pt"), 1)
                    .map_err(OpError::into_contract)?;
                crate::quota::check(&s, &key, &new, len)?;
                // The copy keeps the note's own access before anyone reads
                // the folder again.
                let done = s.service.with(&c, |ws| {
                    let done =
                        history::copy_beside(ws, &path, &bytes, &stamp, lang.starts_with("pt"))?;
                    crate::campaign_cmds::copy_kept(&s, &folder, &path, &done.path);
                    Ok(done)
                })?;
                crate::sync::reconcile_key_by(&s, &key, by, std::slice::from_ref(&done.path));
                crate::sync::told(&s, &key, std::slice::from_ref(&done.path), &[], &[]);
                audit(
                    &s,
                    &actor,
                    "history_copied",
                    &format!("{path} ({id}) → {}", done.path),
                    &folder,
                );
                to_value(VersionRestored {
                    path: out(&done.path),
                    revision: done.revision,
                })
            }
            "history_delete" => {
                if !policy.can_delete {
                    return Err(refused(
                        "only the folder's owner or the server's admin deletes a version",
                    ));
                }
                let (id, _) = version(&s)?;
                let n = history::id_of(&id, "").map_err(OpError::into_contract)?;
                s.history.with(|st| st.delete(&folder, n)).map_err(failed)?;
                audit(
                    &s,
                    &actor,
                    "history_deleted",
                    &format!("{path} ({id})"),
                    &folder,
                );
                to_value(list(&s)?)
            }
            _ => Err(refused("no such command")),
        }
    })
    .await
}
