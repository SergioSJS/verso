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

use serde_json::{Value, json};
use verso_contract::ContractError;

use crate::campaign_cmds::Event;
use crate::db::ReaderOf;
use crate::state::Server;

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
            crate::readers::push_sync_changed(server, folder, (head, &paths), &seen);
        }
        Err(e) => crate::log::warn(&format!("recording a table's release for sync: {e}")),
    }
}

/// The audience of notes changed: the players who gained or lost a note
/// are told by the sync log, each in its own count. For every note whose
/// audience involves a set of players, or that a player lost, a change is
/// recorded that every reader's log holds (a player who cannot see the
/// note drops it), with the players who lost it kept beside; so are the
/// notes that link it, whose text a player sees with the link drawn open
/// or locked (ADR 0110 item 7).
pub fn audience_events(server: &Server, folder: &str, key: &str, events: &[Event]) {
    let relevant: Vec<&Event> = events
        .iter()
        .filter(|e| e.restricted || !e.lost.is_empty())
        .collect();
    if relevant.is_empty() {
        return;
    }
    // From here the players' logs are each its own.
    if let Ok(head) = server.db.head(folder) {
        let _ = server.db.campaign_epoch_set(folder, head);
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
    for ev in &relevant {
        let p = ev.path.clone();
        let linking: Vec<String> = server
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
        for from in linking {
            if crate::campaign::note_like(&from) && !paths.contains(&from) {
                paths.push(from);
            }
        }
    }
    let veil = crate::campaign::veil_for_key(server, key);
    let mut changes: Vec<crate::db::Recorded> = Vec::new();
    let mut told: ReaderOf = HashMap::new();
    let mut at: Vec<&str> = Vec::new();
    for path in &paths {
        let Some((hash, size, _, _, quick)) = stored.get(path) else {
            continue;
        };
        if let Ok(Some(r)) = crate::readers::reader_of(server, key, path) {
            told.insert(path.clone(), r);
        } else if veil.as_ref().is_some_and(|v| v.in_table(path)) {
            told.insert(path.clone(), (hash.clone(), *size));
        }
        changes.push((
            path.clone(),
            Some((hash.clone(), *size, quick.clone())),
            None,
        ));
        at.push(path);
    }
    if changes.is_empty() {
        return;
    }
    match server
        .db
        .record(folder, (None, None), &changes, &[], (&told, &[]))
    {
        Ok((head, _)) => {
            let first = head - i64::try_from(changes.len()).unwrap_or(0) + 1;
            let seqs: Vec<i64> = (0..changes.len())
                .map(|i| first + i64::try_from(i).unwrap_or(0))
                .collect();
            let _ = server.db.reader_force(folder, &seqs);
            for (i, (path, _, _)) in changes.iter().enumerate() {
                if let Some(ev) = relevant.iter().find(|e| e.path == *path)
                    && !ev.lost.is_empty()
                {
                    let _ = server.db.campaign_lost_add(folder, seqs[i], &ev.lost);
                }
            }
            crate::campaign::forget(server, folder);
            let paths: Vec<&str> = at.clone();
            crate::readers::push_sync_changed(server, folder, (head, &paths), &paths);
        }
        Err(e) => crate::log::warn(&format!("recording a table's audience for sync: {e}")),
    }
}

/// What `account`, a player, is told of `path` as a file: its hash and
/// size as the player's own text of it (a link to a note it cannot see is
/// drawn as text for it only); `None` when the player is kept from it.
fn told_to(
    ws: &mut verso_core::Workspace,
    veil: &crate::campaign::Veil,
    path: &str,
    own: (&str, i64),
) -> Option<(String, i64)> {
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

/// `account`'s own sync log of `folder`: the stored log for the players
/// together, less the changes of a note the player did not see when the
/// change came, a note it lost told as a deletion, and its notes' hashes
/// the ones of its own text.
///
/// Which changes are the player's is decided the first time the log is
/// asked for them and kept (`campaign_viewer`, `campaign_skip`): what a
/// device has counted never changes. The changes up to the folder's epoch
/// are everybody's.
pub fn viewer_changes(
    server: &Server,
    folder: &str,
    key: &str,
    account: &str,
) -> Result<Vec<Told>, ContractError> {
    let fail = verso_service::failed;
    let all = server
        .db
        .reader_changes_since(folder, 0, i64::MAX)
        .map_err(fail)?;
    let lost = server.db.campaign_lost_of(folder, account).map_err(fail)?;
    let epoch = server.db.campaign_epoch(folder).map_err(fail)?.unwrap_or(0);
    let (settled, skips) = server.db.campaign_viewer(folder, account).map_err(fail)?;
    let settled = settled.unwrap_or(epoch);
    let Some(veil) = crate::campaign::veil_for_key(server, key).map(|v| v.view(account)) else {
        return Ok(all
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
    let (out, top, new_skips) = server.service.with_key(key, move |ws| {
        let mut told: HashMap<String, Option<(String, i64)>> = HashMap::new();
        let mut out: Vec<Told> = Vec::new();
        let (mut top, mut new_skips) = (settled, Vec::new());
        for c in all {
            top = top.max(c.seq);
            let value = tell_change(ws, &veil, &c, lost.contains(&c.seq), &mut told);
            let member = if c.seq <= settled {
                !skips.contains(&c.seq)
            } else {
                value.is_some()
            };
            if !member {
                if c.seq > settled {
                    new_skips.push(c.seq);
                }
                continue;
            }
            let (change, tell) = match value {
                Some(v) => (v, true),
                None => (serde_json::to_value(&c).unwrap_or(Value::Null), false),
            };
            out.push(Told {
                seq: c.seq,
                change,
                tell,
            });
        }
        Ok((out, top, new_skips))
    })?;
    if top > settled || !new_skips.is_empty() {
        let _ = server.db.campaign_settle(folder, account, top, &new_skips);
    }
    Ok(out)
}

/// The change `c` as the player behind `veil` is told it; `None` when it
/// is not told now.
fn tell_change(
    ws: &mut verso_core::Workspace,
    veil: &crate::campaign::Veil,
    c: &crate::db::Change,
    lost: bool,
    told: &mut HashMap<String, Option<(String, i64)>>,
) -> Option<Value> {
    let gone = |path: &str| {
        json!({
            "seq": c.seq, "path": path, "hash": null, "size": 0, "deleted": true,
            "renamedFrom": null,
        })
    };
    if lost {
        return Some(gone(&c.path));
    }
    let in_table = veil.in_table(&c.path);
    if c.deleted {
        // A deletion: told to a player who can see the note still;
        // outside the tables, to everyone; an attachment of a table, to
        // no one (its name is not the player's to know).
        let tell = if !in_table {
            true
        } else if crate::campaign::note_like(&c.path) {
            !veil.hides_note(&c.path)
        } else {
            false
        };
        return if tell {
            serde_json::to_value(c).ok()
        } else {
            None
        };
    }
    let shown = told
        .entry(c.path.clone())
        .or_insert_with(|| {
            if crate::campaign_serve::is_hidden_in(ws, veil, &c.path) {
                None
            } else {
                told_to(ws, veil, &c.path, (c.hash.as_deref().unwrap_or(""), c.size))
            }
        })
        .clone();
    let Some((hash, size)) = shown else {
        // A rename out of what the player sees is a deletion of the old
        // name, when it saw that.
        return c
            .renamed_from
            .as_ref()
            .filter(|from| !veil.in_table(from) || !veil.hides_note(from))
            .map(|from| gone(from));
    };
    let mut v = serde_json::to_value(c).ok()?;
    v["hash"] = json!(hash);
    v["size"] = json!(size);
    // A name the player cannot see is not told as the source.
    if let Some(from) = &c.renamed_from
        && veil.in_table(from)
        && crate::campaign::note_like(from)
        && veil.hides_note(from)
    {
        v["renamedFrom"] = Value::Null;
    }
    Some(v)
}

/// The files `account` is told of in `folder`: the players' together, less
/// those it cannot see, a note's hash its player's own.
pub fn viewer_files(
    server: &Server,
    folder: &str,
    key: &str,
    account: &str,
) -> Result<Vec<Value>, ContractError> {
    let rows = server
        .db
        .reader_manifest(folder)
        .map_err(verso_service::failed)?;
    let Some(veil) = crate::campaign::veil_for_key(server, key).map(|v| v.view(account)) else {
        return Ok(rows
            .into_iter()
            .map(|(path, hash, size)| json!({ "path": path, "hash": hash, "size": size }))
            .collect());
    };
    server.service.with_key(key, move |ws| {
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
    })
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
