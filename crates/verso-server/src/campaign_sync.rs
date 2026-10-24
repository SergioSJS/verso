// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync to a player's device follows the table's releases (ADR 0110
//! items 4 and 18). What a reader is told of a file is kept beside the
//! file's own hash in the folder's log (`reader_hash`, `reader_size`,
//! ADR 0087): a hidden note is a size below zero, which the reader's
//! manifest leaves out and its log tells as a deletion; a note released
//! later is a new change the reader sees, and the device fetches it.
//!
//! The files did not change when a note is released, so no walk finds
//! it: [`refresh_readers`] asks again, for every file of the folder, what
//! a reader is told of it now, and records a change for each one whose
//! answer moved. The owner's devices see the same entry with the hash
//! they already have.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{Value, json};
use verso_contract::ContractError;
use verso_service::lock;

use crate::campaign::Veil;
use crate::campaign_cmds::Event;
use crate::db::{Notice, Notices, ReaderOf};
use crate::state::Server;

/// How many files of each folder were told to a player from scratch:
/// counted by the tests, to see that an ask does not do again the work of
/// an earlier one.
#[cfg(test)]
pub(crate) static PROJECTIONS: std::sync::Mutex<Option<HashMap<String, usize>>> =
    std::sync::Mutex::new(None);

/// The count so far for `folder`, and back to zero.
#[cfg(test)]
pub(crate) fn projections_taken(folder: &str) -> usize {
    lock(&PROJECTIONS)
        .get_or_insert_with(HashMap::new)
        .remove(folder)
        .unwrap_or(0)
}

/// Whether the players of `folder` each have a sync log of their own: a
/// note is released to some of them (ADR 0110 item 4, amended
/// 2026-10-23). The stored log is told for the players together
/// ([`crate::campaign::Veil::union`]); what a player is told is cut from
/// it ([`viewer_changes`], [`viewer_files`]).
#[must_use]
pub fn restricted(server: &Server, key: &str) -> bool {
    crate::campaign::veil_for_key(server, key).is_some_and(|v| v.restricted())
}

/// What a reader is told of every file of `folder` now, against what its
/// log holds: a change recorded for each that differs, and the devices
/// told. `attachments_only`: after an edit of a note, which can only have
/// opened or closed the attachments it links.
pub fn refresh_readers(server: &Server, folder: &str, key: &str, attachments_only: bool) {
    let stored = match server.db.manifest_readers(folder) {
        Ok(s) => s,
        Err(e) => {
            crate::log::warn(&format!("a table's files for sync: {e}"));
            return;
        }
    };
    let mut readers: ReaderOf = HashMap::new();
    let mut changes: Vec<crate::db::Recorded> = Vec::new();
    let mut silent: Vec<String> = Vec::new();
    let mut explicit: Vec<String> = Vec::new();
    for (path, (hash, size, rhash, rsize, quick)) in &stored {
        // After an edit, only the attachments can have moved (the notes
        // changed are recorded with their own hash).
        if attachments_only && crate::campaign::note_like(path) {
            continue;
        }
        let now = match crate::readers::reader_of(server, key, path) {
            Ok(r) => r,
            // The folder cannot be asked now: leave the file as it is.
            Err(_) => continue,
        };
        let told = (
            rhash.clone().unwrap_or_else(|| hash.clone()),
            rsize.unwrap_or(*size),
        );
        // A file of a table a reader is told of is explicit in the log
        // (its own hash when it is served as it is): "never told" and
        // "told whole" are then two different things.
        let in_table = crate::campaign::veil_for_key(server, key).is_some_and(|v| v.in_table(path));
        let now = match now {
            None if in_table => Some((hash.clone(), *size)),
            other => other,
        };
        let will = now.clone().unwrap_or_else(|| (hash.clone(), *size));
        if told == will {
            // Told whole before, now said so in the log: no change.
            if rsize.is_none() && in_table && will.1 >= 0 {
                readers.insert(path.clone(), will);
                explicit.push(path.clone());
            }
            continue;
        }
        // Hidden and never told to a reader of this table: silent, not a
        // deletion (its name is not in the reader's log).
        if rsize.is_none() && will.1 < 0 {
            silent.push(path.clone());
            continue;
        }
        if let Some(r) = now {
            readers.insert(path.clone(), r);
        }
        changes.push((
            path.clone(),
            Some((hash.clone(), *size, quick.clone())),
            None,
        ));
    }
    if !silent.is_empty()
        && let Err(e) = server.db.reader_silence(folder, &silent)
    {
        crate::log::warn(&format!("hiding a table's notes from sync: {e}"));
    }
    if changes.is_empty() && explicit.is_empty() {
        return;
    }
    match server
        .db
        .record(folder, (None, None), &changes, &[], (&readers, &explicit))
    {
        Ok((head, same)) => {
            let paths: Vec<&str> = changes.iter().map(|(p, _, _)| p.as_str()).collect();
            let seen: Vec<&str> = changes
                .iter()
                .zip(&same)
                .filter(|(_, same)| !**same)
                .map(|((p, _, _), _)| p.as_str())
                .collect();
            crate::readers::push_sync_changed(server, (folder, key), (head, &paths), &seen, &[]);
        }
        Err(e) => crate::log::warn(&format!("recording a table's release for sync: {e}")),
    }
}

/// The audience of notes changed: the players who gained or lost a note
/// are told by the sync log, each in its own count. For every note whose
/// audience involves a set of players, or that a player lost once the
/// folder has such a note, a change is recorded that every reader's log
/// holds, with the players who lost it kept beside and those who have
/// nothing to learn from it left out; so are the notes that link it, whose
/// text a player sees with the link drawn open or locked (ADR 0110 item 7),
/// left out of the log of every player whose own text of it did not change.
/// `before` is the table as it was before the change.
pub fn audience_events(
    server: &Server,
    folder: &str,
    key: &str,
    events: &[Event],
    before: Option<Arc<Veil>>,
) {
    // A folder whose epoch cannot be read is taken to have one: a player
    // who lost a note is told, never left holding it.
    let from_here = server
        .db
        .campaign_epoch(folder)
        .map(|e| e.is_some())
        .unwrap_or(true);
    let relevant: Vec<&Event> = events
        .iter()
        .filter(|e| e.restricted || (from_here && !e.lost.is_empty()))
        .collect();
    if relevant.is_empty() {
        return;
    }
    crate::campaign::forget(server, folder);
    let stored = match server.db.manifest_readers(folder) {
        Ok(s) => s,
        Err(e) => {
            crate::log::warn(&format!("a table's files for sync: {e}"));
            return;
        }
    };
    // The note, then the notes that link it.
    let mut paths: Vec<String> = Vec::new();
    for ev in &relevant {
        if !paths.contains(&ev.path) {
            paths.push(ev.path.clone());
        }
    }
    let mut linking: Vec<String> = Vec::new();
    for ev in &relevant {
        let p = ev.path.clone();
        let found: Vec<String> = server
            .service
            .with_key(key, move |ws| {
                Ok(ws
                    .reader_backlinks(&p)
                    .ok()
                    .flatten()
                    .unwrap_or_default()
                    .into_iter()
                    .map(|b| b.from)
                    .collect())
            })
            .unwrap_or_default();
        for from in found {
            if crate::campaign::note_like(&from)
                && !paths.contains(&from)
                && !linking.contains(&from)
            {
                linking.push(from);
            }
        }
    }
    let after = crate::campaign::veil_of(server, folder);
    let mut notices = Notices::new();
    let mut changes: Vec<crate::db::Recorded> = Vec::new();
    let mut told: ReaderOf = HashMap::new();
    let mut lost: Vec<String> = Vec::new();
    for path in paths.iter().chain(&linking) {
        let Some((hash, size, _, _, quick)) = stored.get(path) else {
            continue;
        };
        if let Ok(Some(r)) = crate::readers::reader_of(server, key, path) {
            told.insert(path.clone(), r);
        } else if after.as_ref().is_some_and(|v| v.in_table(path)) {
            told.insert(path.clone(), (hash.clone(), *size));
        }
        let everyone: Vec<String> = crate::campaign_cmds::players_of(server, folder, path)
            .map(|p| p.into_iter().map(|p| p.id).collect())
            .unwrap_or_default();
        let notice = if let Some(ev) = relevant.iter().find(|e| e.path == *path) {
            // Who gained it learns it; who lost it is told it went; the
            // others, who saw it and see it, or never will, have nothing
            // to learn.
            lost.extend(ev.lost.iter().cloned());
            Notice {
                force: true,
                lost: ev.lost.clone(),
                skip: everyone
                    .into_iter()
                    .filter(|a| !ev.gained.contains(a))
                    .collect(),
            }
        } else {
            // A note that links it: told to the players whose own text of
            // it changed.
            let moved = text_changed(
                server,
                key,
                path,
                (before.clone(), after.clone()),
                &everyone,
            );
            Notice {
                force: true,
                lost: Vec::new(),
                skip: everyone
                    .into_iter()
                    .filter(|a| !moved.contains(a))
                    .collect(),
            }
        };
        notices.insert(path.clone(), notice);
        changes.push((
            path.clone(),
            Some((hash.clone(), *size, quick.clone())),
            None,
        ));
    }
    if changes.is_empty() {
        return;
    }
    match server
        .db
        .record_with(folder, (None, None), &changes, &[], (&told, &[]), &notices)
    {
        Ok((head, _)) => {
            crate::campaign::forget(server, folder);
            let at: Vec<&str> = changes.iter().map(|(p, _, _)| p.as_str()).collect();
            crate::readers::push_sync_changed(server, (folder, key), (head, &at), &at, &lost);
        }
        Err(e) => crate::log::warn(&format!("recording a table's audience for sync: {e}")),
    }
}

/// The accounts of `players` that see the note at `path` and whose own text
/// of it, through the table as it was and as it is, differs.
fn text_changed(
    server: &Server,
    key: &str,
    path: &str,
    (before, after): (Option<Arc<Veil>>, Option<Arc<Veil>>),
    players: &[String],
) -> Vec<String> {
    let (Some(before), Some(after)) = (before, after) else {
        return players.to_vec();
    };
    let p = path.to_owned();
    let accounts = players.to_vec();
    server
        .service
        .with_key(key, move |ws| {
            let mut out = Vec::new();
            for a in &accounts {
                let (b, n) = (
                    told_to(ws, &before.view(a), &p, ("", 0)),
                    told_to(ws, &after.view(a), &p, ("", 0)),
                );
                if n.is_some() && b != n {
                    out.push(a.clone());
                }
            }
            Ok(out)
        })
        .unwrap_or_else(|_| players.to_vec())
}

/// What `account`, a player, is told of `path` as a file: its hash and
/// size as the player's own text of it (a link to a note it cannot see is
/// drawn as text for it only); `None` when the player is kept from it.
fn told_to(
    ws: &mut verso_core::Workspace,
    veil: &Veil,
    path: &str,
    own: (&str, i64),
) -> Option<(String, i64)> {
    #[cfg(test)]
    {
        *lock(&PROJECTIONS)
            .get_or_insert_with(HashMap::new)
            .entry(veil.folder.clone())
            .or_insert(0) += 1;
    }
    if !veil.in_table(path) {
        return Some((own.0.to_owned(), own.1));
    }
    match crate::readers::reader_view_in(ws, Some(veil), path) {
        Ok(Some((_, size))) if size < 0 => None,
        Ok(Some(told)) => Some(told),
        // Served as it is: its own bytes' hash.
        Ok(None) => {
            if crate::campaign::note_like(path) {
                let bytes = ws.read_file(path).ok()?;
                Some((
                    crate::sync::sha256(&bytes),
                    i64::try_from(bytes.len()).unwrap_or(i64::MAX),
                ))
            } else {
                Some((own.0.to_owned(), own.1))
            }
        }
        Err(_) => None,
    }
}

/// One change of a player's own sync log: the change as the player is told
/// it, and whether it is told at all — a change the player counted when it
/// could see the note, and cannot now, still takes its number, so that the
/// numbers of the changes after it never move under a device's cursor.
#[derive(Debug, Clone)]
pub struct Told {
    pub seq: i64,
    pub change: Value,
    pub tell: bool,
}

/// How many changes of the readers' log are decided at a time.
const BATCH: i64 = 500;

/// Whether the change `c` is in the log of the player behind `veil`: it
/// lost the path with it (`lost`, written when the change was recorded);
/// the path is outside the tables; or it is a change of a path it sees. A
/// deletion inside a table is told only to those who lost the path with
/// it — the state of the table at that moment, not the one at the ask.
fn member(ws: &mut verso_core::Workspace, veil: &Veil, c: &crate::db::Change, lost: bool) -> bool {
    if lost || !veil.in_table(&c.path) {
        return true;
    }
    !c.deleted && !crate::campaign_serve::is_hidden_in(ws, veil, &c.path)
}

/// `account`'s log of `folder` decided up to the readers' head: the
/// changes after the point it was settled to, each in the log or out of it
/// for good (`campaign_viewer`, `campaign_skip`), so that what a device has
/// counted never moves. Returns where it is settled. One at a time for a
/// player (the caller holds the player's lock).
fn settle(server: &Server, folder: &str, key: &str, account: &str) -> Result<i64, ContractError> {
    let fail = verso_service::failed;
    let epoch = server.db.campaign_epoch(folder).map_err(fail)?.unwrap_or(0);
    let mut settled = server
        .db
        .campaign_viewer(folder, account)
        .map_err(fail)?
        .unwrap_or(epoch);
    let Some(veil) = crate::campaign::veil_for_key(server, key).map(|v| v.view(account)) else {
        return Ok(settled);
    };
    loop {
        let batch = server
            .db
            .reader_changes_since(folder, settled, BATCH)
            .map_err(fail)?;
        let Some(top) = batch.last().map(|c| c.seq) else {
            break;
        };
        let lost = server
            .db
            .campaign_lost_of(folder, account, (settled, top))
            .map_err(fail)?;
        let before = server
            .db
            .campaign_skips_after(folder, account, settled)
            .map_err(fail)?;
        let v = Arc::clone(&veil);
        let skips: Vec<i64> = server.service.with_key(key, move |ws| {
            Ok(batch
                .iter()
                .filter(|c| !before.contains(&c.seq) && !member(ws, &v, c, lost.contains(&c.seq)))
                .map(|c| c.seq)
                .collect())
        })?;
        server
            .db
            .campaign_settle(folder, account, top, &skips)
            .map_err(fail)?;
        settled = top;
    }
    Ok(settled)
}

/// The change `c` as the player behind `veil` is told it; `None` when it
/// is not told now.
fn tell_change(
    ws: &mut verso_core::Workspace,
    veil: &Veil,
    c: &crate::db::Change,
    (lost, knew_from): (bool, bool),
    told: &mut HashMap<String, Option<(String, i64)>>,
) -> Option<Value> {
    if lost {
        return Some(json!({
            "seq": c.seq, "path": c.path, "hash": null, "size": 0, "deleted": true,
            "renamedFrom": null,
        }));
    }
    if c.deleted {
        // Outside the tables, to everyone; inside, only to those who lost
        // the path with it (`lost`).
        return if veil.in_table(&c.path) {
            None
        } else {
            serde_json::to_value(c).ok()
        };
    }
    let (hash, size) = told
        .entry(c.path.clone())
        .or_insert_with(|| {
            if crate::campaign_serve::is_hidden_in(ws, veil, &c.path) {
                None
            } else {
                told_to(ws, veil, &c.path, (c.hash.as_deref().unwrap_or(""), c.size))
            }
        })
        .clone()?;
    let mut v = serde_json::to_value(c).ok()?;
    v["hash"] = json!(hash);
    v["size"] = json!(size);
    // The name a note had is its player's to know when the player saw the
    // note under it.
    if let Some(from) = &c.renamed_from
        && veil.in_table(from)
        && !knew_from
    {
        v["renamedFrom"] = Value::Null;
    }
    Some(v)
}

/// The rows of a player's log as the player is told them now: in the
/// order of the log, with the ones it is not told (a note it can no longer
/// see) marked, still numbered.
fn told_rows(
    server: &Server,
    (folder, key): (&str, &str),
    account: &str,
    rows: Vec<crate::db::Change>,
) -> Result<Vec<Told>, ContractError> {
    let fail = verso_service::failed;
    let (Some(first), Some(last)) = (rows.first().map(|c| c.seq), rows.last().map(|c| c.seq))
    else {
        return Ok(Vec::new());
    };
    let Some(veil) = crate::campaign::veil_for_key(server, key).map(|v| v.view(account)) else {
        return Ok(rows
            .into_iter()
            .filter_map(|c| {
                serde_json::to_value(&c).ok().map(|change| Told {
                    seq: c.seq,
                    change,
                    tell: true,
                })
            })
            .collect());
    };
    let lost = server
        .db
        .campaign_lost_of(folder, account, (first - 1, last))
        .map_err(fail)?;
    // A rename's old name is the player's to know when the player was told
    // the old path went.
    let mut knew: std::collections::HashSet<i64> = std::collections::HashSet::new();
    for c in &rows {
        if let Some(from) = &c.renamed_from
            && server
                .db
                .campaign_lost_path(folder, account, from, c.seq)
                .map_err(fail)?
        {
            knew.insert(c.seq);
        }
    }
    server.service.with_key(key, move |ws| {
        let mut told: HashMap<String, Option<(String, i64)>> = HashMap::new();
        Ok(rows
            .into_iter()
            .map(|c| {
                let flags = (lost.contains(&c.seq), knew.contains(&c.seq));
                match tell_change(ws, &veil, &c, flags, &mut told) {
                    Some(change) => Told {
                        seq: c.seq,
                        change,
                        tell: true,
                    },
                    None => Told {
                        seq: c.seq,
                        change: serde_json::to_value(&c).unwrap_or(Value::Null),
                        tell: false,
                    },
                }
            })
            .collect())
    })
}

/// `account`'s own sync log of `folder`, whole: the changes of the players'
/// together that are in its log, the ones it lost told as a deletion and
/// its notes' hashes the ones of its own text. For a share, which filters
/// the log to its path; a device on the folder asks for a page
/// ([`viewer_page`]).
pub fn viewer_changes(
    server: &Server,
    folder: &str,
    key: &str,
    account: &str,
) -> Result<Vec<Told>, ContractError> {
    let one = server.campaigns.viewer_lock(folder, account);
    let _only = lock(&one);
    let settled = settle(server, folder, key, account)?;
    let rows = server
        .db
        .campaign_member_changes((folder, account), settled, (0, i64::MAX))
        .map_err(verso_service::failed)?;
    told_rows(server, (folder, key), account, rows)
}

/// A page of `account`'s own log: after its cursor `asked`, at most `size`
/// changes, numbered in the player's own count. The head is where the
/// reading stopped, so a change that lands meanwhile is the next
/// question's. Only the page is told from scratch: what was decided before
/// is not decided again.
pub fn viewer_page(
    server: &Server,
    (folder, key): (&str, &str),
    account: &str,
    (asked, size): (i64, i64),
) -> Result<Value, ContractError> {
    let one = server.campaigns.viewer_lock(folder, account);
    let _only = lock(&one);
    let settled = settle(server, folder, key, account)?;
    let fail = verso_service::failed;
    let count = server
        .db
        .campaign_member_count(folder, account, settled)
        .map_err(fail)?;
    let start = asked.clamp(0, count);
    let rows = server
        .db
        .campaign_member_changes((folder, account), settled, (start, size))
        .map_err(fail)?;
    let end = start + i64::try_from(rows.len()).unwrap_or(0);
    let changes: Vec<Value> = told_rows(server, (folder, key), account, rows)?
        .into_iter()
        .enumerate()
        .filter(|(_, t)| t.tell)
        .map(|(i, t)| {
            let mut c = t.change;
            c["seq"] = json!(start + i64::try_from(i).unwrap_or(0) + 1);
            c
        })
        .collect();
    Ok(json!({ "head": end, "changes": changes, "more": end < count }))
}

/// How many changes `account`'s own log holds: its head.
pub fn viewer_head(
    server: &Server,
    folder: &str,
    key: &str,
    account: &str,
) -> Result<i64, ContractError> {
    let one = server.campaigns.viewer_lock(folder, account);
    let _only = lock(&one);
    let settled = settle(server, folder, key, account)?;
    server
        .db
        .campaign_member_count(folder, account, settled)
        .map_err(verso_service::failed)
}

/// The files `account` is told of in `folder`: the players' together, less
/// those it cannot see, a note's hash its player's own. Kept for as long
/// as the folder's log and the table stay as they were.
pub fn viewer_files(
    server: &Server,
    folder: &str,
    key: &str,
    account: &str,
) -> Result<Arc<Vec<Value>>, ContractError> {
    let fail = verso_service::failed;
    let head = server.db.head(folder).map_err(fail)?;
    let generation = server.campaigns.generation();
    let place = (folder.to_owned(), account.to_owned());
    if let Some((h, g, files)) = lock(&server.campaigns.told_files).get(&place)
        && *h == head
        && *g == generation
    {
        return Ok(Arc::clone(files));
    }
    let rows = server.db.reader_manifest(folder).map_err(fail)?;
    let Some(veil) = crate::campaign::veil_for_key(server, key).map(|v| v.view(account)) else {
        return Ok(Arc::new(
            rows.into_iter()
                .map(|(path, hash, size)| json!({ "path": path, "hash": hash, "size": size }))
                .collect(),
        ));
    };
    let files = Arc::new(server.service.with_key(key, move |ws| {
        let mut out = Vec::new();
        for (path, hash, size) in rows {
            if crate::campaign_serve::is_hidden_in(ws, &veil, &path) {
                continue;
            }
            if let Some((hash, size)) = told_to(ws, &veil, &path, (&hash, size)) {
                out.push(json!({ "path": path, "hash": hash, "size": size }));
            }
        }
        Ok(out)
    })?);
    lock(&server.campaigns.told_files).insert(place, (head, generation, Arc::clone(&files)));
    Ok(files)
}

/// A page of a player's own log: `items` (see [`viewer_changes`]) after
/// the player's cursor `asked`, numbered in the player's own count. The
/// head is where the reading stopped, so a change that lands meanwhile is
/// the next question's.
#[must_use]
pub fn page(items: &[Told], asked: i64, size: usize) -> Value {
    let start = usize::try_from(asked.max(0))
        .unwrap_or(usize::MAX)
        .min(items.len());
    let end = start.saturating_add(size).min(items.len());
    let changes: Vec<Value> = items[start..end]
        .iter()
        .enumerate()
        .filter(|(_, t)| t.tell)
        .map(|(i, t)| {
            let mut c = t.change.clone();
            c["seq"] = json!(start + i + 1);
            c
        })
        .collect();
    json!({ "head": end, "changes": changes, "more": end < items.len() })
}

/// The players of the table who see the files and folders `roots` name —
/// the notes of a table, and the attachments their notes open —, by the
/// path of each file, under the table as it is now. Asked before a deletion
/// or a rename runs, while the files and the state are still there
/// (`campaign_cmds::before_write`).
pub fn seers_under(
    server: &Server,
    folder: &str,
    key: &str,
    roots: &[String],
) -> HashMap<String, Vec<String>> {
    let Some(veil) = crate::campaign::veil_of(server, folder) else {
        return HashMap::new();
    };
    let roots: Vec<String> = roots.iter().map(|r| crate::campaign::key(r)).collect();
    let found = server.service.with_key(key, |ws| {
        Ok(crate::campaign_serve::all_files(ws)
            .into_iter()
            .filter(|f| {
                let k = crate::campaign::key(f);
                veil.in_table(f)
                    && roots
                        .iter()
                        .any(|r| r.is_empty() || k == *r || k.starts_with(&format!("{r}/")))
            })
            .collect::<Vec<_>>())
    });
    let Ok(files) = found else {
        return HashMap::new();
    };
    seers_of(server, folder, key, &files)
}

/// The players who see each of `files` under the table as it is now.
pub fn seers_of(
    server: &Server,
    folder: &str,
    key: &str,
    files: &[String],
) -> HashMap<String, Vec<String>> {
    let Some(veil) = crate::campaign::veil_of(server, folder) else {
        return HashMap::new();
    };
    // The players of each table, asked once.
    let mut tables: HashMap<String, Vec<String>> = HashMap::new();
    let mut by_table: Vec<(String, String)> = Vec::new();
    for path in files.iter().filter(|f| veil.in_table(f)) {
        let root = veil.table(path).map(|t| t.root.clone()).unwrap_or_default();
        if !tables.contains_key(&root)
            && let Ok(players) = crate::campaign_cmds::players_of(server, folder, path)
        {
            tables.insert(root.clone(), players.into_iter().map(|p| p.id).collect());
        }
        by_table.push((root, path.clone()));
    }
    let v = Arc::clone(&veil);
    let seen = server.service.with_key(key, move |ws| {
        let mut out: HashMap<String, Vec<String>> = HashMap::new();
        for (root, path) in by_table {
            let accounts: Vec<String> = tables
                .get(&root)
                .into_iter()
                .flatten()
                .filter(|a| !crate::campaign_serve::is_hidden_in(ws, &v.view(a), &path))
                .cloned()
                .collect();
            if !accounts.is_empty() {
                out.insert(path, accounts);
            }
        }
        Ok(out)
    });
    seen.unwrap_or_default()
}

/// What the table's audience says of the deletions among `changes`, about
/// to be recorded: the players who saw each path (remembered before the
/// deletion ran, else asked of the table as it is) lose it with the change.
/// Empty for a folder whose players share one log. Also the accounts to be
/// told at once.
pub fn deletion_notices(
    server: &Server,
    (folder, key): (&str, &str),
    changes: &[crate::db::Recorded],
) -> (Notices, Vec<String>) {
    let mut notices = Notices::new();
    let mut lost: Vec<String> = Vec::new();
    let deleted: Vec<&String> = changes
        .iter()
        .filter(|(_, now, _)| now.is_none())
        .map(|(p, _, _)| p)
        .collect();
    // Remembered, taken: asked once, whether or not the folder needs it.
    let mut remembered: HashMap<&String, Vec<String>> = HashMap::new();
    for path in &deleted {
        let taken = server
            .db
            .campaign_gone_take(folder, path)
            .unwrap_or_default();
        remembered.insert(path, taken);
    }
    if !crate::campaign::veil_of(server, folder).is_some_and(|v| v.restricted()) {
        return (notices, lost);
    }
    let unremembered: Vec<String> = deleted
        .iter()
        .filter(|p| remembered.get(**p).is_none_or(Vec::is_empty))
        .map(|p| (*p).clone())
        .collect();
    // A deletion the server did not make: the table's state is still there.
    let asked = seers_of(server, folder, key, &unremembered);
    for path in deleted {
        let mut accounts = remembered.remove(path).unwrap_or_default();
        for a in asked.get(path).into_iter().flatten() {
            if !accounts.contains(a) {
                accounts.push(a.clone());
            }
        }
        if accounts.is_empty() {
            continue;
        }
        lost.extend(accounts.iter().cloned());
        notices.insert(
            path.clone(),
            Notice {
                force: true,
                lost: accounts,
                skip: Vec::new(),
            },
        );
    }
    (notices, lost)
}
