// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync's side on the server (ADR 0079 items 4, 5, 7 to 12): each folder's
//! log of changes, kept by one reconciliation every write path ends in —
//! a window's command, a shared note's save, a device's sync, a change the
//! watcher finds on the server's disk — and the commands a device syncs
//! with over its session: the files, the changes after a cursor, a file
//! read and written in pieces, a deletion, a rename. Every change a device
//! sends names the hash it was based on, and is refused when the file is
//! no longer that one (invariant 11).

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use axum::body::Bytes;
use base64::Engine;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use verso_contract::{ContractError, ErrorKind, FolderChanged, Moved};
use verso_core::{CoreError, FileKind, Workspace};
use verso_fs::ReadError;
use verso_service::OpError;
use verso_service::lock;

use crate::auth::{Via, Who};
use crate::campaign_cmds as cc;
use crate::rpc::{arg, blocking, role_here};
use crate::state::Server;

/// A piece of a file, read or sent (ADR 0079 item 12, revised
/// 2026-10-12): read from the disk as it is asked for, or written to the
/// disk as it arrives — a transfer holds one piece in memory, never the
/// file. A device that speaks sync 2 sends and takes it as a binary
/// message; one that speaks 1, as base64 inside the JSON.
pub const PIECE: usize = 1 << 20;
/// The largest file sync carries (item 12): a file of more than 1 GiB is
/// listed, not synced.
pub const LARGEST: u64 = 1 << 30;

#[path = "sync_files.rs"]
mod files;
#[path = "sync_paths.rs"]
mod paths;
#[path = "sync_reader.rs"]
mod reader;
pub use crate::transfers::Transfers;
use crate::transfers::{Being, IDLE, Reading, Upload, room};
pub(crate) use files::piece_of;
use files::{put, read};
pub(crate) use paths::{Moving, moves_of, moving};
use paths::{Now, reconcile_paths};

/// How often a device's question walks the folder again.
pub(crate) const WALK_EVERY: Duration = Duration::from_secs(60);

/// The folder walked again, at most once a minute, before a device reads
/// its files or changes: what the watcher missed — a file the server
/// wrote, then deleted on its disk, has been seen to go unreported on
/// macOS — is found by the device's next question, its five-minute scan
/// at the latest (ADR 0079 item 6).
fn walk_if_due(server: &Server, folder: &str, client: &str) -> bool {
    let due = {
        let mut walked = lock(&server.transfers.walked);
        let due = walked.get(folder).is_none_or(|t| t.elapsed() >= WALK_EVERY);
        if due {
            walked.insert(folder.to_owned(), Instant::now());
        }
        due
    };
    if due && let Err(e) = server.service.reindex(client) {
        crate::log::warn(&format!("sync: walking a folder again: {}", e.message));
    }
    due
}

/// The folder's head for a device's question: reconciled with the whole
/// folder when it was just walked (at most once a minute, and the first
/// question after the server started), else the log as every write path
/// keeps it — each change through the server reconciles its own paths,
/// and the watcher's batches the rest.
pub(crate) fn head_for_question(
    server: &Server,
    folder: &str,
    key: &str,
    client: &str,
) -> Result<i64, ContractError> {
    if walk_if_due(server, folder, client) {
        reconcile(server, folder, key, None, &[])
    } else {
        server.db.head(folder).map_err(verso_service::failed)
    }
}

#[must_use]
pub fn sha256(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

/// A digest as sync writes it: lowercase hex.
fn hex(digest: &[u8]) -> String {
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn changed(message: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::Changed,
        message: message.to_owned(),
    }
}

fn refused(message: &str) -> ContractError {
    verso_service::refused(message)
}

/// Who made a change, as the folder's log keeps it (ADR 0079 item 4): the
/// account, and the device's name when a device's sync made it — two
/// devices of one account told apart.
///
/// The version history (ADR 0091 item 4) names more: an agent's token by
/// its name, and the accounts whose edits a room's save holds.
#[derive(Clone, Copy, Default)]
pub struct Author<'a> {
    pub account: Option<&'a str>,
    pub device: Option<&'a str>,
    pub token: Option<&'a str>,
    pub room: Option<&'a [String]>,
}

impl<'a> Author<'a> {
    #[must_use]
    pub fn of(account: Option<&'a str>) -> Self {
        Self {
            account,
            ..Self::default()
        }
    }

    /// Whether the change names someone: a change of nobody's is the
    /// watcher's, from outside Verso.
    #[must_use]
    pub fn names_someone(&self) -> bool {
        self.account.is_some()
            || self.device.is_some()
            || self.token.is_some()
            || self.room.is_some()
    }
}

/// The folder's files as the index lists them, and the folder's settings
/// directory, which the walk never lists and sync carries (ADR 0070, ADR
/// 0079 item 2): path, length, time in nanoseconds.
fn listed(server: &Server, key: &str) -> Result<Vec<(String, u64, u128)>, ContractError> {
    server.service.with_key(key, |ws| {
        Ok(ws
            .entries()
            .iter()
            .chain(ws.settings_entries())
            .filter(|e| !matches!(e.kind, FileKind::Folder | FileKind::Placeholder))
            .map(|e| (e.path.clone(), e.len, e.modified_nanos))
            .collect())
    })
}

/// Bring the folder's log up to date with its files. A file whose size and
/// time are as last seen is skipped unless named in `paths` (a write the
/// caller knows of, which may have kept both); one whose bytes changed is
/// a change; one gone is a deletion; a deletion and a new file of the same
/// bytes in one run are a rename. The devices showing the folder hear the
/// new head. Returns the head.
pub fn reconcile(
    server: &Server,
    folder: &str,
    key: &str,
    actor: Option<&str>,
    paths: &[String],
) -> Result<i64, ContractError> {
    reconcile_by(server, folder, key, Author::of(actor), paths)
}

/// [`reconcile`], naming who made the change as the history names it.
pub fn reconcile_by(
    server: &Server,
    folder: &str,
    key: &str,
    by: Author<'_>,
    paths: &[String],
) -> Result<i64, ContractError> {
    let one = one_at_a_time(server, folder);
    let _only = lock(&one);
    reconcile_held(server, folder, key, by, paths, &HashMap::new())
}

/// [`reconcile_by`] after a move made in a window (a rename, a folder's,
/// several entries at once): `moved` names each entry's old path and its
/// new one, so that the log's `renamedFrom` is the file's own — never
/// another file of the same bytes a pairing by hash meets first, nor
/// missing because the bytes changed — and a device follows each rename
/// as it was made (ADR 0079, decided 2026-10-31, B12). A folder's pair is
/// every file the log knows under it. The move ran under
/// [`moving`], which keeps any reconciliation before this one from
/// recording it.
pub fn reconcile_moved(
    server: &Server,
    key: &str,
    actor: Option<&str>,
    paths: &[String],
    moved: &[(String, String)],
) {
    let folder = lock(&server.keys).get(key).cloned();
    let Some(folder) = folder else {
        return;
    };
    let one = one_at_a_time(server, &folder);
    let _only = lock(&one);
    let result = server
        .db
        .manifest_paths(&folder)
        .map_err(verso_service::failed)
        .and_then(|known| {
            let pairs = paths::files_moved(&known, moved);
            let mut all: Vec<String> = paths.to_vec();
            for (to, from) in &pairs {
                all.push(from.clone());
                all.push(to.clone());
            }
            reconcile_held(server, &folder, key, Author::of(actor), &all, &pairs)
        });
    if let Err(e) = result {
        crate::log::warn(&format!(
            "keeping a folder's changes for sync: {}",
            e.message
        ));
    }
}

/// The folder's lock: one reconciliation at a time, and a device's change
/// with its own reconciliation as one step, so that another device's
/// question cannot log the change first without its author.
fn one_at_a_time(server: &Server, folder: &str) -> Arc<Mutex<()>> {
    Arc::clone(
        lock(&server.transfers.folders)
            .entry(folder.to_owned())
            .or_default(),
    )
}

/// [`reconcile`], the folder's lock already held; `moved`, a window's moves
/// ([`reconcile_moved`]): new path → old.
fn reconcile_held(
    server: &Server,
    folder: &str,
    key: &str,
    by: Author<'_>,
    paths: &[String],
    moved: &HashMap<String, String>,
) -> Result<i64, ContractError> {
    #[cfg(test)]
    crate::pause::at("reconcile-begun", folder);
    let mut seen = found(server, folder, key, paths)?;
    // One side of a rename outside Verso alone, of a file kept from
    // someone, in a listing as of the index's last walk: the folder is
    // walked again and read again, so that both sides are in this one
    // step (`campaign_outside::look_again`).
    if crate::campaign_outside::look_again(
        server,
        folder,
        (&seen.known, &seen.gone),
        &seen.created,
        moved,
    ) {
        server.service.walk_quietly(key);
        seen = found(server, folder, key, paths)?;
    }
    let Found {
        known,
        gone,
        created,
        quick_only,
        same,
        twins,
        too_large,
        read_from,
    } = seen;
    crate::twins::found(server, folder, twins);
    server.transfers.large.found(server, folder, too_large);
    let head = record_changes(
        server,
        (folder, key),
        (by, paths),
        (&known, &gone),
        (created, moved),
        (&quick_only, read_from),
    )?;
    // A window's write the watcher recorded first (C3, seen on Windows):
    // offered to the history with its author, as `reconcile_paths` does.
    if by.names_someone() {
        crate::history::recorded(server, (folder, key), by, &same, false);
    }
    Ok(head)
}

/// What a reconciliation found, before anything is recorded.
struct Found {
    known: HashMap<String, crate::db::Known>,
    gone: Vec<(String, String)>,
    created: Vec<Created>,
    quick_only: Vec<(String, String)>,
    same: Vec<crate::db::Recorded>,
    twins: Vec<crate::twins::Twin>,
    too_large: Vec<(String, u64)>,
    read_from: SystemTime,
}

/// The folder's files against its log, read where the listing does not
/// vouch for them ([`reconcile_held`]).
fn found(
    server: &Server,
    folder: &str,
    key: &str,
    paths: &[String],
) -> Result<Found, ContractError> {
    let fail = |e: String| verso_service::failed(e);
    // Before anything is read: what the reads find is vouched for as of
    // this moment (`settled`).
    let read_from = SystemTime::now();
    let known = server.db.manifest(folder).map_err(fail)?;
    let files = listed(server, key)?;
    let listed_paths: HashSet<String> = files.iter().map(|(p, _, _)| p.clone()).collect();
    // One name in two files (spec Q7): one is kept, the other held — no
    // entry of the log, said in the server's log and on the console.
    let twins = crate::twins::twins(
        &files.iter().map(|(p, _, _)| p.clone()).collect::<Vec<_>>(),
        &known,
    );
    let held: HashSet<String> = twins.iter().map(|t| t.held.clone()).collect();
    let files: Vec<(String, u64, u128)> = files
        .into_iter()
        .filter(|(p, _, _)| !held.contains(p))
        .collect();
    let forced: HashSet<&str> = paths
        .iter()
        .map(String::as_str)
        .filter(|p| !held.contains(*p))
        .collect();
    // The index's listing is as of its last walk: a path just written is
    // read whatever the listing says, and a listed path that can no longer
    // be read is gone.
    let mut candidates: Vec<(String, Option<(u64, String)>)> = files
        .iter()
        .map(|(p, len, modified)| (p.clone(), Some((*len, quick_key(*len, *modified)))))
        .collect();
    // Read whatever the listing does not vouch for: a path just written,
    // and a known file the listing lacks — written since its last walk, or
    // gone; only a read tells which.
    // A path whose name folds onto a listed one (only its case or its
    // accents' form differ) is that file renamed on a file system that
    // folds names: gone, whatever a read through the folding says.
    let not_listed: Vec<&String> = paths
        .iter()
        .chain(known.keys())
        .filter(|p| !listed_paths.contains(*p))
        .collect();
    // The listing folded only where names fold, and only when some path is
    // not in it as it is: not a string made per file on every walk.
    let listed_folded: HashSet<String> = if verso_core::sync::FOLDS_NAMES && !not_listed.is_empty()
    {
        listed_paths
            .iter()
            .map(|p| verso_core::sync::folded(p))
            .collect()
    } else {
        HashSet::new()
    };
    let unlisted = not_listed
        .into_iter()
        .filter(|p| {
            !(verso_core::sync::FOLDS_NAMES && listed_folded.contains(&verso_core::sync::folded(p)))
        })
        .cloned()
        .collect::<HashSet<String>>();
    for p in unlisted {
        candidates.push((p, None));
    }
    let mut present: HashSet<String> = HashSet::new();
    let mut created: Vec<(String, String, i64, String)> = Vec::new();
    let mut quick_only: Vec<(String, String)> = Vec::new();
    // A path the caller wrote whose bytes the log holds already: the
    // watcher's walk took the change first, with no author.
    let mut same: Vec<crate::db::Recorded> = Vec::new();
    let mut too_large: Vec<(String, u64)> = Vec::new();
    for (path, listed) in candidates {
        let old = known.get(&path);
        if let Some((_, q)) = &listed
            && old.is_some_and(|k| &k.quick == q)
            && !forced.contains(path.as_str())
        {
            present.insert(path);
            continue;
        }
        // Larger than sync carries, by the listing's size: never read
        // (`crate::large`); one the log knew stays as it was, never a
        // deletion.
        if let Some((len, _)) = &listed
            && *len > LARGEST
        {
            too_large.push((path.clone(), *len));
            present.insert(path);
            continue;
        }
        let listed_quick = listed.map(|(_, q)| q);
        let read = match read_file(server, key, &path) {
            Ok(Some(read)) => read,
            // A folder (a write that made or moved one names it): no
            // entry of the log, and no file of that name any more.
            Ok(None) => continue,
            // There but not downloaded (a placeholder, ADR 0043): as it
            // was, never a deletion.
            Err(e) if e.kind == ErrorKind::Unavailable => {
                present.insert(path);
                continue;
            }
            // Not there any more: gone, if it was known.
            Err(e) if e.kind == ErrorKind::NotFound => continue,
            // Not readable now (a network file system's hiccup, a
            // permission): as it was, never a deletion every device
            // would carry out.
            Err(e) => {
                crate::log::warn(&format!(
                    "sync: {path} could not be read, kept as it was: {}",
                    e.message
                ));
                present.insert(path);
                continue;
            }
        };
        present.insert(path.clone());
        let hash = read.hash;
        let size = i64::try_from(read.len).unwrap_or(i64::MAX);
        // The quick key of the bytes read, as the next walk's listing will
        // say it: the file is skipped while it stays as it is.
        let quick = quick_of(&read.revision, read.len)
            .or(listed_quick)
            .unwrap_or_else(|| format!("{}:0", read.len));
        if old.is_some_and(|k| k.hash == hash) {
            if forced.contains(path.as_str()) {
                same.push((path.clone(), Some((hash, size, quick.clone())), None));
            }
            quick_only.push((path, quick));
        } else {
            created.push((path, hash, size, quick));
        }
    }
    let gone: Vec<(String, String)> = known
        .iter()
        .filter(|(p, _)| !present.contains(p.as_str()))
        .map(|(p, k)| (p.clone(), k.hash.clone()))
        .collect();
    Ok(Found {
        known,
        gone,
        created,
        quick_only,
        same,
        twins,
        too_large,
        read_from,
    })
}

/// The hash of the file at `path`, its length and the revision it was read
/// at, for a reconciliation — read a piece at a time, never whole in
/// memory; `None` when `path` is a folder. The unit of sync is a file and
/// a folder is never an entry of the log (ADR 0079 item 2), but a write
/// that makes or moves a folder names it among the paths it changed, and
/// the watcher may too.
fn read_file(
    server: &Server,
    key: &str,
    path: &str,
) -> Result<Option<verso_core::Hashed>, ContractError> {
    let p = path.to_owned();
    server.service.with_key(key, move |ws| {
        if ws.is_folder(&p) {
            return Ok(None);
        }
        Ok(Some(ws.hash_with_revision(&p)?))
    })
}

/// The quick key of `len` bytes read or written at `revision`: their length
/// and time, as a walk's listing says them ([`quick_key`]), so that the
/// next walk skips the file while it stays as it is. A revision is
/// `<nanoseconds since the epoch>:<length>:<hash>` (verso-core's
/// `revision::encode`); `None` when it is not, or names another length (a
/// write whose stamp could not be confirmed) — the next walk then reads the
/// file once more.
fn quick_of(revision: &str, len: u64) -> Option<String> {
    let mut parts = revision.split(':');
    let nanos: u128 = parts.next()?.parse().ok()?;
    let length: u64 = parts.next()?.parse().ok()?;
    (len == length).then(|| quick_key(len, nanos))
}

/// How long a file must have stood unmodified before the reading of it
/// began for its quick key to be kept: git's racy rule, as the index
/// trusts a note by its time and length (ADR 0011, amended 2026-10-08) and
/// as the app's sync remembers a file it read (`app/src-tauri/src/sync.rs`).
pub(crate) const SETTLED: Duration = Duration::from_secs(2);

/// `quick`, kept only when the time it names is at least [`SETTLED`]
/// before `read_from`, the moment the reconciliation began to read; else
/// empty, which no listing gives, so the next walk reads the file again
/// and keeps its key then. A file written again with its length within the
/// time its file system keeps (a second on FAT, HFS+ or some shares, a
/// tick of a coarse clock) has the key of the bytes read: kept, that key
/// would skip the second write for good. A key with no time (`<len>:0`)
/// is kept, and one that cannot be read is not.
pub(crate) fn settled(quick: String, read_from: SystemTime) -> String {
    let Some((_, time)) = quick.split_once(':') else {
        return String::new();
    };
    if time == "0" {
        return quick;
    }
    let (secs, frac) = time.split_once('.').unwrap_or((time, "0"));
    let (Ok(secs), Ok(frac)) = (secs.parse::<u128>(), frac.parse::<u128>()) else {
        return String::new();
    };
    let at = secs.saturating_mul(1_000_000_000).saturating_add(frac);
    let from = read_from
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    if at.saturating_add(SETTLED.as_nanos()) <= from {
        quick
    } else {
        String::new()
    }
}

/// A file's quick key, what a walk skips it by while it is as last seen: its
/// length and its time to the nanosecond as the disk keeps it
/// (`<len>:<seconds>.<nanoseconds>`; `<len>:0` when the disk gave no time).
/// Whole seconds told two writes of one length in one second apart from
/// nothing, and a log entry left behind by one of them was skipped for good
/// (the night stress, seed 3, 2026-11-04). Where the disk keeps whole
/// seconds only (FAT, some network shares) the fraction is zero and the key
/// is as fine as the disk. A key of whole seconds a log kept before
/// (`<len>:<seconds>`, no dot) is never equal to one of these: such a file
/// is read once more by the next walk, never skipped.
pub(crate) fn quick_key(len: u64, nanos: u128) -> String {
    if nanos == 0 {
        return format!("{len}:0");
    }
    format!(
        "{len}:{}.{:09}",
        nanos / 1_000_000_000,
        nanos % 1_000_000_000
    )
}

/// The listing's size of each of `paths` it lists: checked against
/// [`LARGEST`] before a read.
fn listed_sizes(
    server: &Server,
    key: &str,
    paths: &[&str],
) -> Result<HashMap<String, u64>, ContractError> {
    if paths.is_empty() {
        return Ok(HashMap::new());
    }
    let wanted: HashSet<String> = paths.iter().map(|p| (*p).to_owned()).collect();
    server.service.with_key(key, move |ws| {
        Ok(ws
            .entries()
            .iter()
            .filter(|e| wanted.contains(&e.path))
            .map(|e| (e.path.clone(), e.len))
            .collect())
    })
}

/// A file a reconciliation found new or changed: its path, hash, size and
/// quick key.
type Created = (String, String, i64, String);

/// Record what a reconciliation found — the files gone, the files new or
/// changed (a new one of the same bytes as one gone is a rename; one a
/// window's move names, `moved`: new path → old, is that rename whatever
/// its bytes), the quick keys refreshed — and tell the devices on the
/// folder the new head. `written`: the paths the caller wrote.
fn record_changes(
    server: &Server,
    (folder, key): (&str, &str),
    (by, written): (Author<'_>, &[String]),
    (known, gone): (&HashMap<String, crate::db::Known>, &[(String, String)]),
    (created, moved): (Vec<Created>, &HashMap<String, String>),
    (quick_only, read_from): (&[(String, String)], SystemTime),
) -> Result<i64, ContractError> {
    // A window's move not yet recorded by its own reconciliation: as the
    // log has it, its new paths waiting (`paths::moving`).
    let (old, new) = paths::held_back(server, folder, known, moved);
    let gone_now: Vec<(String, String)>;
    let gone = if old.is_empty() {
        gone
    } else {
        gone_now = gone
            .iter()
            .filter(|(p, _)| !old.contains(p))
            .cloned()
            .collect();
        gone_now.as_slice()
    };
    // A key only for a file that has settled (`settled`): one modified in
    // the 2 s before its reading began is read again by the next walk.
    let created: Vec<Created> = created
        .into_iter()
        .filter(|(p, _, _, _)| !new.contains(p))
        .map(|(p, h, s, q)| (p, h, s, settled(q, read_from)))
        .collect();
    let quick_only: Vec<(String, String)> = quick_only
        .iter()
        .map(|(p, q)| (p.clone(), settled(q.clone(), read_from)))
        .collect();
    let quick_only = quick_only.as_slice();
    // What a reader is told of each note read (ADR 0087 item 4): its
    // projection's hash and size, when it holds a secret block — the new
    // and changed ones, and those read again whose bytes did not change.
    let mut readers = crate::db::ReaderOf::new();
    // A table's veil is made again from the folder as it now is (ADR 0110).
    crate::campaign::forget_files(server, folder);
    // A table that cannot be read now: nothing is recorded; the next
    // reconciliation finds the files as they are.
    if crate::campaign::veil_to_write(server, folder, "the folder's log").is_err() {
        // What the write left on the disk is recorded by the next
        // reconciliation, which finds the files as they are; the write
        // itself succeeded, and says so.
        return server.db.head(folder).map_err(verso_service::failed);
    }
    let recheck: Vec<String> = quick_only.iter().map(|(p, _)| p.clone()).collect();
    let table = crate::campaign::veil_for_key(server, key);
    for path in created.iter().map(|(p, _, _, _)| p).chain(&recheck) {
        if let Some(r) = crate::readers::reader_of(server, key, path)? {
            readers.insert(path.clone(), r);
        }
    }
    // A file of a table that a reader is told of is explicit in the log:
    // what was told and what was never are then two different things.
    if let Some(v) = &table {
        for (path, hash, size, _) in &created {
            if v.in_table(path) && !readers.contains_key(path) {
                readers.insert(path.clone(), (hash.clone(), *size));
            }
        }
        // A file read again with the same bytes keeps what it was told.
        for path in &recheck {
            if v.in_table(path)
                && !readers.contains_key(path)
                && let Ok(Some(known)) = server.db.known(folder, path)
            {
                readers.insert(path.clone(), (known.hash, known.size));
            }
        }
    }
    // A file gone and one new of the same bytes: a rename, kept as the
    // deletion then the new file naming the old path.
    let mut changes: Vec<crate::db::Recorded> = Vec::new();
    let mut taken: HashSet<String> = HashSet::new();
    for (path, _) in gone {
        changes.push((path.clone(), None, None));
    }
    for (path, hash, size, quick) in created {
        let named = moved
            .get(&path)
            .filter(|f| !taken.contains(*f) && gone.iter().any(|(p, _)| p == *f));
        let from = if known.contains_key(&path) {
            None
        } else if let Some(f) = named {
            Some(f.clone())
        } else {
            gone.iter()
                .find(|(p, h)| *h == hash && !taken.contains(p) && !moved.values().any(|f| f == p))
                .map(|(p, _)| p.clone())
        };
        if let Some(f) = &from {
            taken.insert(f.clone());
        }
        changes.push((path, Some((hash, size, quick)), from));
    }
    // A file renamed or deleted outside Verso keeps who sees it, before
    // the players are told (`campaign_outside`).
    // What the caller wrote through Verso carried its access already.
    let written: HashSet<&str> = if by.names_someone() {
        written.iter().map(String::as_str).collect()
    } else {
        HashSet::new()
    };
    crate::campaign_outside::followed(server, folder, (&changes, gone, &written), (known, moved));
    // A note a player saw that was deleted, or renamed: the players' devices
    // are told it went — decided in the step that records it, from what was
    // remembered before it ran (ADR 0110 item 4, amended 2026-10-23).
    let (mut notices, lost) =
        crate::campaign_sync::deletion_notices(server, (folder, key), &changes);
    // And who does not see what was written, as it is written.
    if let Err(e) =
        crate::campaign_sync::unseen_notices(server, (folder, key), &changes, &mut notices)
    {
        // Not recorded without them: the write stands, the next walk records it.
        crate::log::warn(&format!("a change waits to be recorded: {}", e.message));
        return server.db.head(folder).map_err(verso_service::failed);
    }
    let (head, same) = server
        .db
        .record_with(
            folder,
            (by.account, by.device),
            &changes,
            quick_only,
            (&readers, &recheck),
            &notices,
        )
        .map_err(verso_service::failed)?;
    // And the paths the log keeps now are the veil's (`Veil::live`).
    if !notices.is_empty() || !changes.is_empty() {
        crate::campaign::forget_files(server, folder);
    }
    // Each text file's new bytes a version, a rename followed, a deletion
    // kept reachable (ADR 0091 items 1, 4 and 9).
    // The log's first look at the folder finds its files as they are: the
    // versions its history begins with.
    crate::history::recorded(server, (folder, key), by, &changes, known.is_empty());
    if !changes.is_empty() {
        let paths: Vec<&str> = changes
            .iter()
            .flat_map(|(path, _, from)| std::iter::once(path.as_str()).chain(from.as_deref()))
            .collect();
        // A reader hears only of the changes it sees.
        let seen: Vec<&str> = changes
            .iter()
            .zip(&same)
            .filter(|(_, same)| !**same)
            .flat_map(|((path, _, from), _)| std::iter::once(path.as_str()).chain(from.as_deref()))
            .collect();
        crate::readers::push_sync_changed(server, (folder, key), (head, &paths), &seen, &lost);
        // A note of a table edited may open or close the attachments it
        // links: a reader is told of those again (ADR 0110 item 4).
        if crate::campaign::veil_of(server, folder).is_some_and(|v| {
            paths
                .iter()
                .any(|p| crate::campaign::note_like(p) && v.in_table(p))
        }) {
            crate::campaign_sync::refresh_readers(server, folder, key, true);
        }
    }
    Ok(head)
}

/// [`reconcile_written`] for the folder behind a key the server opened: a
/// room's save, whose one path is known, and the accounts whose edits it
/// holds (the history's authors, ADR 0091 item 4).
pub fn reconcile_saved(server: &Server, key: &str, path: &str, authors: &[String]) {
    let folder = lock(&server.keys).get(key).cloned();
    if let Some(folder) = folder
        && let Err(e) = {
            let one = one_at_a_time(server, &folder);
            let _only = lock(&one);
            let by = Author {
                room: Some(authors),
                ..Author::default()
            };
            reconcile_paths(server, &folder, key, by, &[(path.to_owned(), Now::Read)])
        }
    {
        crate::log::warn(&format!(
            "keeping a folder's changes for sync: {}",
            e.message
        ));
    }
}

/// The same, for the paths of a change made through the server, under the
/// folder's lock.
pub fn reconcile_written(
    server: &Server,
    folder: &str,
    key: &str,
    actor: Option<&str>,
    paths: &[String],
) -> Result<i64, ContractError> {
    let one = one_at_a_time(server, folder);
    let _only = lock(&one);
    let read: Vec<(String, Now)> = paths.iter().map(|p| (p.clone(), Now::Read)).collect();
    reconcile_paths(server, folder, key, Author::of(actor), &read)
}

/// The same, for the folder behind a key the server opened.
pub fn reconcile_key(server: &Server, key: &str, actor: Option<&str>, paths: &[String]) {
    reconcile_key_by(server, key, Author::of(actor), paths);
}

/// [`reconcile_key`], naming who made the change as the history names it.
pub fn reconcile_key_by(server: &Server, key: &str, by: Author<'_>, paths: &[String]) {
    let folder = lock(&server.keys).get(key).cloned();
    if let Some(folder) = folder
        && let Err(e) = reconcile_by(server, &folder, key, by, paths)
    {
        crate::log::warn(&format!(
            "keeping a folder's changes for sync: {}",
            e.message
        ));
    }
}

/// The paths a window's command names.
#[must_use]
pub fn paths_of(args: &Value) -> Vec<String> {
    let mut out = Vec::new();
    for field in ["path", "from", "to"] {
        if let Some(p) = args.get(field).and_then(Value::as_str) {
            out.push(p.to_owned());
        }
    }
    if let Some(name) = args.get("name").and_then(Value::as_str) {
        out.push(if name.ends_with(".md") {
            name.to_owned()
        } else {
            format!("{name}.md")
        });
    }
    if let Some(list) = args.get("paths").and_then(Value::as_array) {
        out.extend(list.iter().filter_map(Value::as_str).map(str::to_owned));
    }
    out
}

/// A sync command's answer, and the piece of a file it carries — a
/// `sync_read`'s — beside the JSON.
pub type Reply = (Value, Option<Vec<u8>>);

/// A device's sync commands on the folder its session shows. `data`: the
/// piece of a file a `sync_put` carries in a binary message (sync 2).
pub async fn command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    args: Value,
    data: Option<Bytes>,
) -> Result<Reply, ContractError> {
    let door = crate::access::Door::of(server, who, client)?;
    let scope = door.scope.clone();
    // A device's change goes through the same rules as the window's: the
    // file's level and the credential's ceiling (ADR 0113 section A).
    if matches!(cmd, "sync_put" | "sync_delete" | "sync_rename") {
        door.check_sync(cmd, &args)?;
    }
    // A name taken by something the player cannot see is never answered as
    // taken: the next free one is used, and a folder holding what they
    // cannot see is not theirs to rename (ADR 0113), as in the window.
    let mut args = args;
    if matches!(cmd, "sync_rename" | "sync_put") && door.veiled() {
        let key = server
            .service
            .folder_of(client)
            .ok_or_else(verso_service::no_folder)?;
        let name = if cmd == "sync_put" {
            "sync_put"
        } else {
            "rename_entry"
        };
        let (s, d) = (Arc::clone(server), door.clone());
        args = blocking(move || {
            let mut a = args;
            s.service.with_key(&key, |ws| {
                d.guard_names(ws, name, &mut a).map_err(Into::into)
            })?;
            Ok(a)
        })
        .await?;
        // The name the guard chose is judged again, as the one sent was.
        if cmd == "sync_put" {
            door.check_sync(cmd, &args)?;
        }
    }
    // A share synced to a folder of the receiver's computer (ADR 0081
    // item 6): its paths joined to the shared folder's, its answers
    // re-rooted, the log and the files filtered to it.
    if let Some(scope) = scope {
        return crate::share_sync::command(server, who, client, cmd, (args, data), scope).await;
    }
    let reader = matches!(cmd, "sync_state" | "sync_changes")
        && crate::readers::reads_only(server, who, client)?;
    if reader {
        return reader::command(server, who, client, cmd, args).await;
    }
    command_in(
        server,
        who,
        client,
        cmd,
        (args, data),
        Arc::new(|_: &str| true),
    )
    .await
}

/// A device's sync command, what it may reach said by `inside`.
pub(crate) async fn command_in(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    (args, data): (Value, Option<Bytes>),
    inside: Arc<dyn Fn(&str) -> bool + Send + Sync>,
) -> Result<Reply, ContractError> {
    let (folder, _) = role_here(server, client)?;
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    // One who may only read is told of the notes' projections (ADR 0087).
    let reader = crate::readers::reads_only(server, who, client)?;
    let s = Arc::clone(server);
    let c = client.to_owned();
    let actor = who.account.id.clone();
    let door = if cmd == "sync_rename" {
        Some(crate::access::Door::of(server, who, client)?)
    } else {
        None
    };
    // Whose eyes a table's veil is for this command.
    let viewer = who.account.id.clone();
    let writes = crate::access::Door::of(server, who, client)?.sends_whole_cap();
    // The device's name, as its session keeps it: two devices of one
    // account told apart in the log and in the folder's change log.
    let device = match &who.via {
        Via::Device { session } => {
            let server = Arc::clone(server);
            let session = session.clone();
            blocking(move || {
                server
                    .db
                    .session_device(&session)
                    .map_err(verso_service::failed)
            })
            .await?
        }
        _ => None,
    };
    // Who the bin names (ADR 0080): the account and its device for a
    // deletion, the device for a version its write replaced.
    let by = crate::trash::by_name(who, device.as_deref());
    let replacer = device.clone().unwrap_or_else(|| who.account.name.clone());
    // What is said in the server's log when a device's change is refused.
    let said_as = (
        cmd.to_owned(),
        args.get("path")
            .or_else(|| args.get("from"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        match &device {
            Some(d) => format!("{} ({d})", who.account.email),
            None => who.account.email.clone(),
        },
    );
    // Who the server's log says a change is by — the account and the
    // device's name — and the share, when a rename through it rewrites
    // the owner's links outside it (ADR 0081 item 11).
    let said_by = said_as.2.clone();
    let share =
        crate::shares::scope_here(server, client).map_or_else(|| folder.clone(), |s| s.share);
    // A rename's folder and source, for the shares it may carry.
    let renaming = (cmd == "sync_rename").then(|| {
        (
            folder.clone(),
            args.get("from").and_then(Value::as_str).map(str::to_owned),
        )
    });
    let cmd = cmd.to_owned();
    // Moved, never copied: a piece of a file is a megabyte.
    let answer = blocking(move || {
        let mut piece = None;
        let answer = (|| match cmd.as_str() {
            "sync_state" if reader => {
                head_for_question(&s, &folder, &key, &c)?;
                let head = s.db.reader_head(&folder).map_err(verso_service::failed)?;
                // A table with notes released to some players: this
                // player's files, not the players' together.
                if crate::campaign_sync::restricted(&s, &key) {
                    let files =
                        crate::campaign_sync::viewer_files(&s, &folder, &key, (&viewer, writes))?;
                    return Ok(json!({ "head": head, "files": files }));
                }
                let files: Vec<Value> = s
                    .db
                    .reader_manifest(&folder)
                    .map_err(verso_service::failed)?
                    .into_iter()
                    .map(|(path, hash, size)| json!({ "path": path, "hash": hash, "size": size }))
                    .collect();
                Ok(json!({ "head": head, "files": files }))
            }
            "sync_changes" if reader => {
                let since: i64 = arg(&args, "since")?;
                head_for_question(&s, &folder, &key, &c)?;
                let head = s.db.reader_head(&folder).map_err(verso_service::failed)?;
                // The players of a table with logs of their own are asked by
                // their own page (`sync_reader`, `share_sync`); the table
                // changing between that choice and this is the one place the
                // shared log could be told to one of them: refused, asked again.
                if crate::campaign_sync::restricted(&s, &key) {
                    return Err(verso_service::failed(
                        "the table changed: ask again in a moment",
                    ));
                }
                let changes =
                    s.db.reader_changes_since(&folder, since, 1000)
                        .map_err(verso_service::failed)?;
                let more = changes.last().is_some_and(|last| last.seq < head);
                Ok(json!({ "head": head, "changes": changes, "more": more }))
            }
            // A note to a reader: its projection, by the name asked or kept.
            "sync_read" if reader => {
                let named: String = arg(&args, "path")?;
                let (path, _) = as_kept(&s, &folder, &named, &*inside)?;
                // A table's hidden file is not there for a player (ADR 0110).
                if crate::campaign_serve::is_hidden(&s, &key, Some(&viewer), &path)
                    || crate::campaign_serve::is_hidden(&s, &key, Some(&viewer), &named)
                {
                    return Err(refused("not found"));
                }
                let note = crate::readers::is_served(&named)
                    || crate::readers::is_served(&path)
                    || s.service
                        .with_key(&key, |ws| Ok(ws.reader_names_note(&path)))?;
                let (answer, bytes) = if note {
                    crate::readers::read(&s, &c, &key, &path, arg(&args, "offset")?)?
                } else {
                    read(&s, &c, (&folder, &key), &args, &*inside)?
                };
                piece = Some(bytes);
                Ok(answer)
            }
            "sync_state" => {
                let head = head_for_question(&s, &folder, &key, &c)?;
                let files: Vec<Value> =
                    s.db.manifest(&folder)
                        .map_err(verso_service::failed)?
                        .into_iter()
                        .map(|(path, k)| json!({ "path": path, "hash": k.hash, "size": k.size }))
                        .collect();
                Ok(json!({ "head": head, "files": files }))
            }
            "sync_changes" => {
                let since: i64 = arg(&args, "since")?;
                let head = head_for_question(&s, &folder, &key, &c)?;
                let changes =
                    s.db.changes_since(&folder, since, 1000)
                        .map_err(verso_service::failed)?;
                let more = changes.last().is_some_and(|last| last.seq < head);
                Ok(json!({ "head": head, "changes": changes, "more": more }))
            }
            "sync_read" => {
                let (answer, bytes) = read(&s, &c, (&folder, &key), &args, &*inside)?;
                piece = Some(bytes);
                Ok(answer)
            }
            "sync_put" => put(
                &s,
                &c,
                (&folder, &key),
                Author {
                    account: Some(&actor),
                    device: device.as_deref(),
                    ..Author::default()
                },
                (&replacer, &said_by),
                (args, &*inside),
                data,
            ),
            "sync_delete" => {
                let named: String = arg(&args, "path")?;
                let base: String = arg(&args, "base")?;
                let (head, path, unshared) = {
                    let one = one_at_a_time(&s, &folder);
                    let _only = lock(&one);
                    let path = as_kept_file(&s, (&folder, &key), &named, &*inside)?;
                    let p = path.clone();
                    // The players who see it, remembered while it is there.
                    cc::device_will(&s, (&folder, &key), "sync_delete", "path", &path);
                    let (sd, fd) = (Arc::clone(&s), folder.clone());
                    let gone = s.service.with_key(&key, move |ws| {
                        is_now(ws, &p, Some(&base))?;
                        let gone = ws.delete_entry(&p)?;
                        // No empty folder left behind on the server either.
                        ws.prune_empty_parents(&p);
                        // What the table keeps of the note goes with it, into
                        // the bin, before the folder's session is free.
                        cc::device_did(&sd, &fd, ("delete_entry", "path"), (&p, &gone.path));
                        // And a shared folder pruned that way, its shares.
                        let unshared = crate::shares::device_deleted(&sd, ws, &fd, &p);
                        Ok((gone, unshared))
                    });
                    let (gone, unshared) = cc::drop_if_failed(
                        &s,
                        &folder,
                        ("sync_delete", &json!({ "path": path })),
                        gone,
                    )?;
                    #[cfg(test)]
                    crate::pause::at("device-deleted", &folder);
                    crate::trash::deleted(&s, &folder, &gone, &by);
                    let head = reconcile_paths(
                        &s,
                        &folder,
                        &key,
                        Author {
                            account: Some(&actor),
                            device: device.as_deref(),
                            ..Author::default()
                        },
                        &[(path.clone(), Now::Gone)],
                    )?;
                    (head, path, unshared)
                };
                // Outside the folder's lock: a room takes its own lock first.
                told(&s, &key, &[], std::slice::from_ref(&path), &[]);
                if unshared {
                    crate::shares::refresh(&s, &folder, "deleted");
                }
                Ok(json!({ "head": head }))
            }
            "sync_rename" => {
                let from: String = arg(&args, "from")?;
                let to: String = arg(&args, "to")?;
                let base: String = arg(&args, "base")?;
                let one = one_at_a_time(&s, &folder);
                let only = lock(&one);
                let from = as_kept_file(&s, (&folder, &key), &from, &*inside)?;
                // Only the accents' form changing: the same name, the same
                // file (spec Q7) — nothing to move.
                let same =
                    verso_core::sync::folded_form(&from) == verso_core::sync::folded_form(&to);
                let (to, other) = as_kept(&s, &folder, &to, &*inside)?;
                if !same {
                    cc::device_will(&s, (&folder, &key), "sync_rename", "from", &from);
                }
                let (f, t) = (from.clone(), to.clone());
                let (sd, fd) = (Arc::clone(&s), folder.clone());
                // The notes the device may write itself; the links of the
                // others — a player's hidden or read-only ones — are
                // corrected by the server, without telling (ADR 0113).
                let reach: Arc<dyn Fn(&str) -> bool + Send + Sync> =
                    if let Some(d) = door.clone().filter(crate::access::Door::veiled) {
                        let inside = Arc::clone(&inside);
                        Arc::new(move |p: &str| {
                            inside(p) && d.may_path(crate::access::Action::Edit, p).allowed()
                        })
                    } else {
                        Arc::clone(&inside)
                    };
                let landed = s.service.with_key(&key, move |ws| {
                    is_now(ws, &f, Some(&base))?;
                    if same {
                        return Ok(None);
                    }
                    if other {
                        return Err(form_taken());
                    }
                    // Only the case changing: the target is the file itself on
                    // a file system that folds names.
                    if !verso_core::sync::FOLDS_NAMES
                        || verso_core::sync::folded(&f) != verso_core::sync::folded(&t)
                    {
                        is_now(ws, &t, None)?;
                    }
                    let done = ws.rename_entry(&f, &t)?;
                    ws.prune_empty_parents(&f);
                    // What the table keeps of the note follows it before the
                    // folder's session is free: no read, a player's
                    // included, finds it under its new folder's access first
                    // (ADR 0113 K.2; the audit of 2026-11-05).
                    cc::device_did(&sd, &fd, ("rename_entry", "from"), (&f, &done.path));
                    // Through a share, the owner's notes outside it that link
                    // to what moved: the server rewrites them (ADR 0081 item
                    // 11); the device rewrites the ones it has itself.
                    let outside: Vec<crate::share_links::Outside> = done
                        .rewrites
                        .into_iter()
                        .filter(|w| !reach(&w.path))
                        .map(|w| crate::share_links::Outside {
                            path: w.path,
                            revision: w.revision,
                            after: w.after,
                        })
                        .collect();
                    Ok(Some((done.path, outside)))
                });
                let landed = cc::drop_if_failed(
                    &s,
                    &folder,
                    ("sync_rename", &json!({ "from": from })),
                    landed,
                )?;
                let Some((landed, outside)) = landed else {
                    drop(only);
                    let head = s.db.head(&folder).map_err(verso_service::failed)?;
                    return Ok(json!({ "head": head, "path": from }));
                };
                #[cfg(test)]
                crate::pause::at("device-renamed", &folder);
                let head = reconcile_paths(
                    &s,
                    &folder,
                    &key,
                    Author {
                        account: Some(&actor),
                        device: device.as_deref(),
                        ..Author::default()
                    },
                    &[(from.clone(), Now::Gone), (to.clone(), Now::Read)],
                )?;
                drop(only);
                told(
                    &s,
                    &key,
                    std::slice::from_ref(&landed),
                    std::slice::from_ref(&from),
                    &[Moved {
                        from: from.clone(),
                        to: landed.clone(),
                    }],
                );
                if !outside.is_empty() {
                    crate::share_links::apply(&s, &key, (&actor, &said_by), &share, outside);
                }
                Ok(json!({ "head": head, "path": landed }))
            }
            _ => Err(refused("no such command")),
        })()?;
        Ok((answer, piece))
    })
    .await;
    // Nothing a device was refused goes unsaid on the server: an admin asked
    // why a file does not arrive finds it here. Another device having
    // changed the file first is sync's ordinary contention, not said.
    if let Err(e) = &answer
        && e.kind != ErrorKind::Changed
    {
        let (cmd, path, email) = said_as;
        crate::log::warn(&format!(
            "sync: {cmd} of \"{path}\" by {email} refused ({:?}): {}",
            e.kind, e.message
        ));
    }
    // A shared folder moved on a computer follows to where its files went
    // (ADR 0081 item 13).
    if let (Ok((done, _)), Some((folder, Some(from)))) = (&answer, &renaming)
        && let Some(to) = done["path"].as_str()
        && let Ok(Some(f)) = server.db.folder(folder)
    {
        crate::shares::synced_rename(server, &f, from, to);
    }
    answer
}

/// A device's change, told to whoever has the folder open as a change from
/// outside: the windows hear the folder changed — what was written, what
/// is gone, and what was renamed, so that a tab follows its note to the
/// new name as after a rename made in the window — and then a shared note
/// open in a room takes the change (or stops for the people in it to
/// choose, ADR 0073 item 7), or its room closes when the note is gone.
/// The windows first: a tab that hears its room close knows by then
/// where its note went. The watcher does not report what the server
/// wrote itself.
pub(crate) fn told(
    server: &Server,
    key: &str,
    changed: &[String],
    removed: &[String],
    moved: &[Moved],
) {
    let clients = server.service.clients_of(key);
    if let Some(index) = clients
        .first()
        .and_then(|c| server.service.current_folder(c))
        .map(|f| f.index)
    {
        let payload = FolderChanged {
            key: key.to_owned(),
            changed: changed.to_vec(),
            removed: removed.to_vec(),
            moved: moved.to_vec(),
            listing: true,
            index,
        };
        // A reader hears of a note only when it changed for a reader (ADR
        // 0087): the folder's log, reconciled before this, says so.
        if let Ok(payload) = serde_json::to_value(&payload) {
            crate::readers::push_folder_changed(server, key, &clients, &payload);
        }
    }
    crate::collab::changed_outside(server, key, changed, removed);
}

/// The file at `path` on the disk now: its hash and the revision it was
/// read at, read a piece at a time; `None` when there is none.
fn now(ws: &mut Workspace, path: &str) -> Result<Option<(String, String)>, OpError> {
    match ws.hash_with_revision(path) {
        Ok(read) => Ok(Some((read.hash, read.revision))),
        Err(CoreError::Read(ReadError::Io(e))) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(None)
        }
        Err(e) => Err(e.into()),
    }
}

/// Refused with `changed` (and the file's hash now) unless the file at
/// `path` is the one `base` names — `None` names no file at all — read in
/// the same step as what the caller then does to it (invariant 11): no
/// write can land between the check and the change. Returns the revision
/// read.
fn is_now(ws: &mut Workspace, path: &str, base: Option<&str>) -> Result<Option<String>, OpError> {
    let found = now(ws, path)?;
    if found.as_ref().map(|(h, _)| h.as_str()) == base {
        Ok(found.map(|(_, r)| r))
    } else if base.is_none()
        && found.is_some()
        && verso_core::sync::FOLDS_NAMES
        && name_taken(ws, path)
    {
        // A new file whose name another one holds as this file system
        // compares names: said as such, not as a change of that file.
        Err(ContractError {
            kind: ErrorKind::Exists,
            message: "another file on the server has this name, differing only in case or accents"
                .to_owned(),
        }
        .into())
    } else {
        Err(changed(&found.map(|(h, _)| h).unwrap_or_default()).into())
    }
}

/// Whether a listed file other than `path` has its name as the file system
/// folds it (case, Unicode normalization).
fn name_taken(ws: &Workspace, path: &str) -> bool {
    let folded = verso_core::sync::folded(path);
    ws.entries()
        .iter()
        .any(|e| e.path != path && one_name(path, &folded, &e.path))
}

/// Whether `other` is `path`'s name as a file system that folds names
/// compares them, `folded` being `path` folded: two ASCII paths compared
/// without folding either. A new file's write looks through the whole
/// listing for another spelling of its name ([`as_spelled`], [`on_disk`]):
/// folding each listed path made a string per file, twice per new file.
pub(crate) fn one_name(path: &str, folded: &str, other: &str) -> bool {
    if path.is_ascii() && other.is_ascii() {
        return path.eq_ignore_ascii_case(other);
    }
    verso_core::sync::folded(other) == folded
}

/// The file a path a device names addresses (spec Q7, decided
/// 2026-10-10): one name is one file on the server, whatever its file
/// system — ext4 would keep `Café.md` composed and decomposed as two. A
/// path whose accents are in the other Unicode form than a file the
/// folder's log keeps names that file, spelled as the log (and the disk)
/// keeps it; a new file in a folder the log knows under the other form
/// goes into that folder. Returns the spelling, and whether it is another
/// file's that the path named under the other form.
fn as_kept(
    server: &Server,
    folder: &str,
    path: &str,
    inside: Inside<'_>,
) -> Result<(String, bool), ContractError> {
    let (kept, other) = as_kept_anywhere(server, folder, path)?;
    // Through a share, the other form of a name may be a folder beside the
    // shared one: never reached (ADR 0081 item 2).
    if !inside(&kept) {
        return Err(refused("not in the shared folder"));
    }
    Ok((kept, other))
}

/// [`as_kept`] for a file that is there, which a deletion or a rename's
/// source names: where the disk folds names, a path in another case than
/// the file the log keeps (`d/b.md` for `d/B.md`) reaches that file, and
/// the change is the log's entry's — spelled as the disk keeps the name
/// when the log has that spelling, else as the log does. Without this the
/// file went from the disk while the log kept its entry until the next
/// walk, a minute later at most, and a rename named no source.
fn as_kept_file(
    server: &Server,
    (folder, key): (&str, &str),
    path: &str,
    inside: Inside<'_>,
) -> Result<String, ContractError> {
    let (kept, _) = as_kept(server, folder, path, inside)?;
    let fail = verso_service::failed;
    if !verso_core::sync::FOLDS_NAMES || server.db.known(folder, &kept).map_err(fail)?.is_some() {
        return Ok(kept);
    }
    let p = kept.clone();
    let disk = server
        .service
        .with_key(key, move |ws| Ok(ws.spelled_on_disk(&p)))?;
    let name = verso_core::sync::folded(&kept);
    let logged: Vec<String> = server
        .db
        .manifest_paths(folder)
        .map_err(fail)?
        .into_iter()
        .filter(|p| verso_core::sync::folded(p) == name)
        .collect();
    let spelled = disk
        .filter(|d| logged.contains(d))
        .or_else(|| logged.into_iter().next());
    match spelled {
        Some(s) if inside(&s) => Ok(s),
        _ => Ok(kept),
    }
}

/// What a device's change may reach: everything for a whole folder's
/// window, the shared folder for a share's.
pub(crate) type Inside<'a> = &'a (dyn Fn(&str) -> bool + Send + Sync);

fn as_kept_anywhere(
    server: &Server,
    folder: &str,
    path: &str,
) -> Result<(String, bool), ContractError> {
    let fail = verso_service::failed;
    if server.db.known(folder, path).map_err(fail)?.is_some() {
        return Ok((path.to_owned(), false));
    }
    let name = verso_core::sync::folded_form(path);
    // An ASCII path is its own composed form: compared as it is.
    let same = |p: &str| {
        if p.is_ascii() {
            p == name
        } else {
            verso_core::sync::folded_form(p) == name
        }
    };
    let kept = server.db.manifest_paths(folder).map_err(fail)?;
    if let Some(p) = kept.iter().find(|p| same(p)) {
        return Ok((p.clone(), true));
    }
    // The folders above the log's files, by their composed name.
    let mut folders: HashMap<String, &str> = HashMap::new();
    for p in &kept {
        let mut at = p.as_str();
        while let Some((parent, _)) = at.rsplit_once('/') {
            folders
                .entry(verso_core::sync::folded_form(parent))
                .or_insert(parent);
            at = parent;
        }
    }
    let mut at = path;
    while let Some((parent, _)) = at.rsplit_once('/') {
        if let Some(spelled) = folders.get(&verso_core::sync::folded_form(parent)) {
            return Ok((format!("{spelled}{}", &path[parent.len()..]), false));
        }
        at = parent;
    }
    Ok((path.to_owned(), false))
}

/// A new file whose name another one holds in the other Unicode form.
fn form_taken() -> OpError {
    ContractError {
        kind: ErrorKind::Exists,
        message: "another file on the server has this name, its accents in another Unicode form"
            .to_owned(),
    }
    .into()
}

fn too_large() -> ContractError {
    refused("a file of more than 1 GiB is not synced")
}
