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
use std::time::{Duration, Instant};

use base64::Engine;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use verso_contract::{ContractError, ErrorKind};
use verso_core::{CoreError, FileKind, Workspace};
use verso_fs::ReadError;
use verso_service::OpError;
use verso_service::lock;

use crate::auth::Who;
use crate::rpc::{arg, blocking, role_here};
use crate::state::Server;

/// A piece of a file, read or sent: well under the WebSocket's limit
/// once in base64 (ADR 0079 item 12).
pub const PIECE: usize = 4 << 20;
/// The largest file sync carries: its pieces are gathered in memory, and
/// the atomic write takes the whole file.
pub const LARGEST: u64 = 1 << 30;
/// A transfer nobody continued for this long is dropped.
const IDLE: Duration = Duration::from_secs(120);
/// Transfers a client holds at once, each way: a device sends and fetches
/// one file at a time, so a third drops its oldest — what one session can
/// keep in the server's memory is bounded (two files of `LARGEST`).
const PER_CLIENT: usize = 2;

/// Make room for one more transfer of `client`: its oldest go.
fn room<T>(map: &mut HashMap<(String, String), T>, client: &str, at: impl Fn(&T) -> Instant) {
    loop {
        let mine: Vec<(&(String, String), Instant)> = map
            .iter()
            .filter(|((c, _), _)| c == client)
            .map(|(k, v)| (k, at(v)))
            .collect();
        if mine.len() < PER_CLIENT {
            return;
        }
        let Some(oldest) = mine
            .iter()
            .min_by_key(|(_, t)| *t)
            .map(|(k, _)| (*k).clone())
        else {
            return;
        };
        map.remove(&oldest);
    }
}

/// Files on their way, in pieces: those sent by a device and those read
/// by one, per client and path.
#[derive(Default)]
pub struct Transfers {
    up: Mutex<HashMap<(String, String), Upload>>,
    down: Mutex<HashMap<(String, String), Reading>>,
    /// One reconciliation at a time per folder: two from the same state
    /// would log the same change twice.
    folders: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    /// When each folder was last walked for a device.
    walked: Mutex<HashMap<String, Instant>>,
}

/// How often a device's question walks the folder again.
const WALK_EVERY: Duration = Duration::from_secs(60);

/// The folder walked again, at most once a minute, before a device reads
/// its files or changes: what the watcher missed — a file the server
/// wrote, then deleted on its disk, has been seen to go unreported on
/// macOS — is found by the device's next question, its five-minute scan
/// at the latest (ADR 0079 item 6).
fn walk_if_due(server: &Server, folder: &str, client: &str) {
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
}

/// A file being read in pieces, kept between them.
type Reading = (Arc<Vec<u8>>, Instant);

struct Upload {
    bytes: Vec<u8>,
    size: u64,
    hash: String,
    base: Option<String>,
    at: Instant,
}

#[must_use]
pub fn sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
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

/// The folder's files as the index lists them: path, length, time.
fn listed(server: &Server, key: &str) -> Result<Vec<(String, u64, i64)>, ContractError> {
    server.service.with_key(key, |ws| {
        Ok(ws
            .entries()
            .iter()
            .filter(|e| !matches!(e.kind, FileKind::Folder | FileKind::Placeholder))
            .map(|e| (e.path.clone(), e.len, e.modified))
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
    let fail = |e: String| verso_service::failed(e);
    let one = Arc::clone(
        lock(&server.transfers.folders)
            .entry(folder.to_owned())
            .or_default(),
    );
    let _only = lock(&one);
    let known = server.db.manifest(folder).map_err(fail)?;
    let files = listed(server, key)?;
    let forced: HashSet<&str> = paths.iter().map(String::as_str).collect();
    // The index's listing is as of its last walk: a path just written is
    // read whatever the listing says, and a listed path that can no longer
    // be read is gone.
    let mut candidates: Vec<(String, Option<String>)> = files
        .iter()
        .map(|(p, len, modified)| (p.clone(), Some(format!("{len}:{modified}"))))
        .collect();
    let listed_paths: HashSet<String> = files.iter().map(|(p, _, _)| p.clone()).collect();
    // Read whatever the listing does not vouch for: a path just written,
    // and a known file the listing lacks — written since its last walk, or
    // gone; only a read tells which.
    // A path whose name folds onto a listed one (only its case or its
    // accents' form differ) is that file renamed on a file system that
    // folds names: gone, whatever a read through the folding says.
    let listed_folded: HashSet<String> = listed_paths
        .iter()
        .map(|p| verso_core::sync::folded(p))
        .collect();
    let unlisted = paths
        .iter()
        .chain(known.keys())
        .filter(|p| !listed_paths.contains(*p))
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
    for (path, quick) in candidates {
        let old = known.get(&path);
        if let Some(q) = &quick
            && old.is_some_and(|k| &k.quick == q)
            && !forced.contains(path.as_str())
        {
            present.insert(path);
            continue;
        }
        let p = path.clone();
        let read = server
            .service
            .with_key(key, move |ws| Ok(ws.read_with_revision(&p)?));
        let bytes = match read {
            Ok((bytes, _)) => bytes,
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
        let hash = sha256(&bytes);
        let size = i64::try_from(bytes.len()).unwrap_or(i64::MAX);
        let quick = quick.unwrap_or_else(|| format!("{}:0", bytes.len()));
        if old.is_some_and(|k| k.hash == hash) {
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
    // A file gone and one new of the same bytes: a rename, kept as the
    // deletion then the new file naming the old path.
    let mut changes: Vec<crate::db::Recorded> = Vec::new();
    let mut taken: HashSet<String> = HashSet::new();
    for (path, _) in &gone {
        changes.push((path.clone(), None, None));
    }
    for (path, hash, size, quick) in created {
        let from = if known.contains_key(&path) {
            None
        } else {
            gone.iter()
                .find(|(p, h)| *h == hash && !taken.contains(p))
                .map(|(p, _)| p.clone())
        };
        if let Some(f) = &from {
            taken.insert(f.clone());
        }
        changes.push((path, Some((hash, size, quick)), from));
    }
    let head = server
        .db
        .record(folder, actor, &changes, &quick_only)
        .map_err(fail)?;
    if !changes.is_empty() {
        server.push_folder(
            folder,
            &json!({ "event": "sync-changed", "payload": { "head": head } }),
        );
    }
    Ok(head)
}

/// The same, for the folder behind a key the server opened.
pub fn reconcile_key(server: &Server, key: &str, actor: Option<&str>, paths: &[String]) {
    let folder = lock(&server.keys).get(key).cloned();
    if let Some(folder) = folder
        && let Err(e) = reconcile(server, &folder, key, actor, paths)
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

/// A device's sync commands on the folder its session shows.
pub async fn command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    args: &Value,
) -> Result<Value, ContractError> {
    let (folder, role) = role_here(server, client)?;
    let writes = role.writes() && who.reaches(&folder).1;
    if matches!(cmd, "sync_put" | "sync_delete" | "sync_rename") && !writes {
        return Err(refused("you may only read this folder"));
    }
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    let s = Arc::clone(server);
    let c = client.to_owned();
    let actor = who.account.id.clone();
    let cmd = cmd.to_owned();
    let args = args.clone();
    blocking(move || match cmd.as_str() {
        "sync_state" => {
            walk_if_due(&s, &folder, &c);
            let head = reconcile(&s, &folder, &key, None, &[])?;
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
            walk_if_due(&s, &folder, &c);
            let head = reconcile(&s, &folder, &key, None, &[])?;
            let changes =
                s.db.changes_since(&folder, since, 1000)
                    .map_err(verso_service::failed)?;
            let more = changes.last().is_some_and(|last| last.seq < head);
            Ok(json!({ "head": head, "changes": changes, "more": more }))
        }
        "sync_read" => read(&s, &c, &key, &args),
        "sync_put" => put(&s, &c, &folder, &key, &actor, &args),
        "sync_delete" => {
            let path: String = arg(&args, "path")?;
            let base: String = arg(&args, "base")?;
            let p = path.clone();
            s.service.with_key(&key, move |ws| {
                is_now(ws, &p, Some(&base))?;
                ws.delete_entry(&p)?;
                // No empty folder left behind on the server either.
                ws.prune_empty_parents(&p);
                Ok(())
            })?;
            told(&s, &key, &[], std::slice::from_ref(&path));
            let head = reconcile(&s, &folder, &key, Some(&actor), &[path])?;
            Ok(json!({ "head": head }))
        }
        "sync_rename" => {
            let from: String = arg(&args, "from")?;
            let to: String = arg(&args, "to")?;
            let base: String = arg(&args, "base")?;
            let (f, t) = (from.clone(), to.clone());
            s.service.with_key(&key, move |ws| {
                is_now(ws, &f, Some(&base))?;
                // Only the case or the accents' form changing: the target
                // is the file itself on a file system that folds names.
                if !verso_core::sync::FOLDS_NAMES
                    || verso_core::sync::folded(&f) != verso_core::sync::folded(&t)
                {
                    is_now(ws, &t, None)?;
                }
                ws.rename_entry(&f, &t)?;
                ws.prune_empty_parents(&f);
                Ok(())
            })?;
            told(
                &s,
                &key,
                std::slice::from_ref(&to),
                std::slice::from_ref(&from),
            );
            let head = reconcile(&s, &folder, &key, Some(&actor), &[from, to])?;
            Ok(json!({ "head": head }))
        }
        _ => Err(refused("no such command")),
    })
    .await
}

/// A device's change, told to whoever has the folder open as a change from
/// outside: a shared note open in a room takes it (or stops for the people
/// in it to choose, ADR 0073 item 7), and the windows hear the folder
/// changed. The watcher does not report what the server wrote itself.
fn told(server: &Server, key: &str, changed: &[String], removed: &[String]) {
    crate::collab::changed_outside(server, key, changed, removed);
    let clients = server.service.clients_of(key);
    let index = clients
        .first()
        .and_then(|c| server.service.current_folder(c))
        .map(|f| f.index);
    server.push(
        &clients,
        &json!({ "event": "folder-changed", "payload": {
            "key": key,
            "changed": changed,
            "removed": removed,
            "listing": true,
            "index": index,
        } }),
    );
}

/// The file at `path` on the disk now: its hash and the revision it was
/// read at; `None` when there is none.
fn now(ws: &mut Workspace, path: &str) -> Result<Option<(String, String)>, OpError> {
    match ws.read_with_revision(path) {
        Ok((bytes, revision)) => Ok(Some((sha256(&bytes), revision))),
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
    } else {
        Err(changed(&found.map(|(h, _)| h).unwrap_or_default()).into())
    }
}

fn read(server: &Server, client: &str, key: &str, args: &Value) -> Result<Value, ContractError> {
    let path: String = arg(args, "path")?;
    let offset: u64 = arg(args, "offset")?;
    let place = (client.to_owned(), path.clone());
    let bytes = {
        let mut down = lock(&server.transfers.down);
        down.retain(|_, (_, at)| at.elapsed() < IDLE);
        if offset == 0 {
            down.remove(&place);
        }
        down.get(&place).map(|(b, _)| Arc::clone(b))
    };
    let bytes = match bytes {
        Some(b) => b,
        None => {
            let p = path.clone();
            let (b, _) = server
                .service
                .with_key(key, move |ws| Ok(ws.read_with_revision(&p)?))?;
            if b.len() as u64 > LARGEST {
                return Err(refused("a file of more than 1 GiB is not synced"));
            }
            Arc::new(b)
        }
    };
    let size = bytes.len() as u64;
    let start = usize::try_from(offset.min(size)).unwrap_or(usize::MAX);
    let end = start.saturating_add(PIECE).min(bytes.len());
    let piece = base64::engine::general_purpose::STANDARD.encode(&bytes[start..end]);
    let done = end >= bytes.len();
    let hash = (offset == 0).then(|| sha256(&bytes));
    let mut down = lock(&server.transfers.down);
    if done {
        down.remove(&place);
    } else {
        if !down.contains_key(&place) {
            room(&mut down, client, |(_, at)| *at);
        }
        down.insert(place, (bytes, Instant::now()));
    }
    Ok(json!({ "data": piece, "size": size, "done": done, "hash": hash }))
}

fn put(
    server: &Server,
    client: &str,
    folder: &str,
    key: &str,
    actor: &str,
    args: &Value,
) -> Result<Value, ContractError> {
    let path: String = arg(args, "path")?;
    let offset: u64 = arg(args, "offset")?;
    let size: u64 = arg(args, "size")?;
    let hash: String = arg(args, "hash")?;
    let base: Option<String> = arg(args, "base")?;
    let data: String = arg(args, "data")?;
    if size > LARGEST {
        return Err(refused("a file of more than 1 GiB is not synced"));
    }
    let piece = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|_| refused("data: not base64"))?;
    let place = (client.to_owned(), path.clone());
    let complete = {
        let mut up = lock(&server.transfers.up);
        up.retain(|_, u| u.at.elapsed() < IDLE);
        if offset == 0 {
            up.remove(&place);
            room(&mut up, client, |u| u.at);
            // Grown as the pieces come, never reserved up front: a size
            // claimed is not memory taken.
            up.insert(
                place.clone(),
                Upload {
                    bytes: Vec::new(),
                    size,
                    hash: hash.clone(),
                    base: base.clone(),
                    at: Instant::now(),
                },
            );
        }
        let u = up
            .get_mut(&place)
            .ok_or_else(|| refused("no transfer of this file: start again"))?;
        if u.bytes.len() as u64 != offset
            || u.hash != hash
            || u.size != size
            || u.base != base
            || offset + piece.len() as u64 > size
        {
            up.remove(&place);
            return Err(refused("a piece out of order: start again"));
        }
        u.bytes.extend_from_slice(&piece);
        u.at = Instant::now();
        if (u.bytes.len() as u64) < size {
            None
        } else {
            up.remove(&place).map(|u| u.bytes)
        }
    };
    let Some(bytes) = complete else {
        return Ok(json!({ "done": false }));
    };
    if bytes.len() as u64 != size || sha256(&bytes) != hash {
        return Err(refused("the file arrived damaged: its hash does not match"));
    }
    crate::quota::check(server, key, &path, size)?;
    let p = path.clone();
    server.service.with_key(key, move |ws| {
        let revision = is_now(ws, &p, base.as_deref())?;
        Ok(ws
            .write_bytes(&p, &bytes, revision.as_deref())
            .map(|_| ())?)
    })?;
    told(server, key, std::slice::from_ref(&path), &[]);
    let head = reconcile(server, folder, key, Some(actor), &[path])?;
    Ok(json!({ "done": true, "head": head }))
}
