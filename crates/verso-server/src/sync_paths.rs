// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync's reconciliation of the paths a change through the server just
//! touched (ADR 0079; split from `sync.rs` by ADR 0067): the log brought up
//! to date with those paths alone, without walking the folder.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use serde_json::Value;
use verso_contract::{ContractError, ErrorKind};
use verso_service::lock;

use super::{Author, LARGEST, listed_sizes, one_name, quick_of, read_file, record_changes};
use crate::state::Server;

/// Bring the folder's log up to date with `paths` alone — the files a
/// change through the server just wrote, deleted or renamed, which the
/// caller knows — without walking the rest of the folder: a device's
/// write costs the paths it touched, not the folder's size. The folder's
/// lock is held by the caller.
/// What the caller knows of a path it changed: nothing (it is read), the
/// bytes it wrote (their hash, size and quick key), or that it is gone.
#[derive(Clone)]
pub(super) enum Now {
    Read,
    Written(String, i64, String),
    Gone,
}

pub(super) fn reconcile_paths(
    server: &Server,
    folder: &str,
    key: &str,
    by: Author<'_>,
    paths: &[(String, Now)],
) -> Result<i64, ContractError> {
    // Before anything is read (`super::settled`).
    let read_from = std::time::SystemTime::now();
    // A file held as the twin of another (`crate::twins`) never enters the
    // log through a write that names it: the walk keeps it out too.
    let held = crate::twins::held(server, folder);
    let unheld: Vec<(String, Now)>;
    let paths = if held.is_empty() {
        paths
    } else {
        unheld = paths
            .iter()
            .filter(|(p, _)| !held.contains(p))
            .cloned()
            .collect();
        unheld.as_slice()
    };
    let spelled;
    let paths = if verso_core::sync::FOLDS_NAMES {
        spelled = as_spelled(server, key, paths)?;
        spelled.as_slice()
    } else {
        paths
    };
    let mut known: HashMap<String, crate::db::Known> = HashMap::new();
    for (p, _) in paths {
        if let Some(k) = server.db.known(folder, p).map_err(verso_service::failed)? {
            known.insert(p.clone(), k);
        }
    }
    let to_read: Vec<&str> = paths
        .iter()
        .filter(|(_, now)| matches!(now, Now::Read))
        .map(|(p, _)| p.as_str())
        .collect();
    let sizes = listed_sizes(server, key, &to_read)?;
    let mut present: HashSet<String> = HashSet::new();
    let mut created = Vec::new();
    let mut quick_only = Vec::new();
    // Paths whose bytes the log holds already: the walk can take a change
    // made through the server before the change's own reconciliation does.
    let mut same: Vec<crate::db::Recorded> = Vec::new();
    for (path, now) in paths {
        let (hash, size, quick) = match now {
            Now::Gone => continue,
            Now::Written(hash, size, quick) => (hash.clone(), *size, quick.clone()),
            // Larger than sync carries: never read, kept as it was.
            Now::Read if sizes.get(path).is_some_and(|len| *len > LARGEST) => {
                let len = sizes.get(path).copied().unwrap_or_default();
                server.transfers.large.add(server, folder, path, len);
                present.insert(path.clone());
                continue;
            }
            Now::Read => {
                match read_file(server, key, path) {
                    Ok(Some(read)) => {
                        server.transfers.large.remove(folder, path);
                        (
                            read.hash,
                            i64::try_from(read.len).unwrap_or(i64::MAX),
                            quick_of(&read.revision, read.len)
                                .unwrap_or_else(|| format!("{}:0", read.len)),
                        )
                    }
                    // A folder: no entry of the log.
                    Ok(None) => continue,
                    Err(e) if e.kind == ErrorKind::NotFound => continue,
                    // A placeholder or a file not readable now: as it was.
                    Err(_) => {
                        present.insert(path.clone());
                        continue;
                    }
                }
            }
        };
        present.insert(path.clone());
        if known.get(path).is_some_and(|k| k.hash == hash) {
            same.push((path.clone(), Some((hash, size, quick.clone())), None));
            quick_only.push((path.clone(), quick));
        } else {
            created.push((path.clone(), hash, size, quick));
        }
    }
    let gone: Vec<(String, String)> = known
        .iter()
        .filter(|(p, _)| !present.contains(p.as_str()))
        .map(|(p, k)| (p.clone(), k.hash.clone()))
        .collect();
    let written: Vec<String> = paths.iter().map(|(p, _)| p.clone()).collect();
    let head = record_changes(
        server,
        (folder, key),
        (by, &written),
        (&known, &gone),
        (created, &HashMap::new()),
        (&quick_only, read_from),
    )?;
    // Whoever made a change the walk recorded first, with no author (seen
    // on Windows, 2026-10-31): offered to the history with its author, which
    // takes the version over when it is the walk's guess of moments ago
    // (`Store::record`), and makes none otherwise.
    if by.names_someone() {
        crate::history::recorded(server, (folder, key), by, &same, false);
    }
    Ok(head)
}

/// Where the server's file system folds names: a path written or read
/// through another spelling of a listed file's name reached that file,
/// whose name the disk keeps (a write over a file keeps its name) — the log
/// follows the disk's spelling, and the other spelling, if the log knew
/// it, is gone. A device that had not yet heard of a respelling sends its
/// edit under the old one; without this the manifest would hold both.
///
/// The disk says how it spells the name: the walk's listing does not name
/// a file made since (a device's new file, written again through another
/// case before the next walk — the night stress, seed 3, 2026-11-04, left
/// the log holding `a.md` beside `A.md` and, after the walk, `A.md` with
/// bytes the disk no longer held). The listing answers only where the disk
/// cannot.
fn as_spelled(
    server: &Server,
    key: &str,
    paths: &[(String, Now)],
) -> Result<Vec<(String, Now)>, ContractError> {
    let named: Vec<(String, bool)> = paths
        .iter()
        .map(|(p, now)| (p.clone(), matches!(now, Now::Gone)))
        .collect();
    let gone: HashSet<String> = named
        .iter()
        .filter(|(_, g)| *g)
        .map(|(p, _)| p.clone())
        .collect();
    let disk: Vec<Option<String>> = server.service.with_key(key, move |ws| {
        let entries = ws.entries();
        Ok(named
            .iter()
            .map(|(p, is_gone)| {
                if *is_gone {
                    return None;
                }
                if let Some(d) = ws.spelled_on_disk(p) {
                    return (d != *p && !gone.contains(&d)).then_some(d);
                }
                if entries.iter().any(|e| &e.path == p) {
                    return None;
                }
                let k = verso_core::sync::folded(p);
                entries
                    .iter()
                    .find(|e| one_name(p, &k, &e.path) && !gone.contains(&e.path))
                    .map(|e| e.path.clone())
            })
            .collect())
    })?;
    let mut out = Vec::with_capacity(paths.len());
    for ((path, now), on_disk) in paths.iter().zip(disk) {
        match on_disk {
            Some(d) => {
                out.push((d, now.clone()));
                out.push((path.clone(), Now::Gone));
            }
            None => out.push((path.clone(), now.clone())),
        }
    }
    Ok(out)
}

/// The files a window's moves moved, new path → old: each pair itself, and
/// for a folder's, every file the log knows under the old folder, under
/// the new one (ADR 0079, decided 2026-10-31, B12).
pub(crate) fn files_moved(known: &[String], moved: &[(String, String)]) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for (from, to) in moved {
        if from == to {
            continue;
        }
        let under = format!("{from}/");
        for p in known {
            if p == from {
                out.insert(to.clone(), p.clone());
            } else if let Some(rest) = p.strip_prefix(&under) {
                out.insert(format!("{to}/{rest}"), p.clone());
            }
        }
    }
    out
}

/// The moves a window's command made, old path → new, read from its
/// answer: a rename's entry and what moved with it (a folder's note, ADR
/// 0060), the several entries of `move_entries`. None for any other
/// command.
pub(crate) fn moves_of(name: &str, args: &Value, answer: &Value) -> Vec<(String, String)> {
    let pairs = |list: &Value| -> Vec<(String, String)> {
        list.as_array()
            .into_iter()
            .flatten()
            .filter_map(|m| Some((m["from"].as_str()?.to_owned(), m["to"].as_str()?.to_owned())))
            .collect()
    };
    let mut out = match name {
        "rename_note" | "rename_entry" => {
            let (Some(from), Some(to)) = (args["from"].as_str(), answer["path"].as_str()) else {
                return Vec::new();
            };
            // A note named without its `.md`, as `rename_note` takes it.
            let from = if name == "rename_note" && !from.ends_with(".md") {
                format!("{from}.md")
            } else {
                from.to_owned()
            };
            vec![(from, to.to_owned())]
        }
        "move_entries" => pairs(&answer["moved"]),
        _ => return Vec::new(),
    };
    out.extend(pairs(&answer["also"]));
    out
}

/// A window's move in the folder's log's keeping, from the move until it
/// is dropped once its reconciliation ran ([`moving`]).
pub(crate) struct Moving {
    server: Arc<Server>,
    folder: String,
    pairs: Vec<(String, String)>,
}

impl Drop for Moving {
    fn drop(&mut self) {
        let mut all = lock(&self.server.transfers.moving);
        if let Some(kept) = all.get_mut(&self.folder) {
            for pair in &self.pairs {
                if let Some(i) = kept.iter().position(|p| p == pair) {
                    kept.swap_remove(i);
                }
            }
            if kept.is_empty() {
                all.remove(&self.folder);
            }
        }
    }
}

/// Run a window's move (`run`, the command `name` with `args`) under the
/// folder's lock: no reconciliation reads the folder while its files
/// move, and the files it moved, each new path with its own old one, are
/// kept until the move's own reconciliation ([`super::reconcile_moved`])
/// records them — any other before it, the watcher's, leaves them as the
/// log had them ([`held_back`]). Without it the watcher's took the move
/// first and paired files of the same bytes by hash, whichever it met
/// first (seen on Windows, 2026-11-05; ADR 0079 B12). The move is kept
/// while the answer's `Moving` lives.
pub(crate) fn moving(
    server: &Arc<Server>,
    key: &str,
    (name, args): (&str, &Value),
    run: impl FnOnce() -> Result<Value, ContractError>,
) -> (Result<Value, ContractError>, Option<Moving>) {
    // Any other command runs as it did, without the folder's lock.
    if !matches!(name, "rename_note" | "rename_entry" | "move_entries") {
        return (run(), None);
    }
    let folder = lock(&server.keys).get(key).cloned();
    let Some(folder) = folder else {
        return (run(), None);
    };
    let one = super::one_at_a_time(server, &folder);
    let _only = lock(&one);
    let answer = run();
    let Ok(done) = &answer else {
        return (answer, None);
    };
    let moved = moves_of(name, args, done);
    if moved.is_empty() {
        return (answer, None);
    }
    let pairs: Vec<(String, String)> = match server.db.manifest_paths(&folder) {
        Ok(known) => files_moved(&known, &moved).into_iter().collect(),
        Err(e) => {
            crate::log::warn(&format!("keeping a window's move for sync: {e}"));
            return (answer, None);
        }
    };
    if pairs.is_empty() {
        return (answer, None);
    }
    lock(&server.transfers.moving)
        .entry(folder.clone())
        .or_default()
        .extend(pairs.iter().cloned());
    let kept = Moving {
        server: Arc::clone(server),
        folder,
        pairs,
    };
    (answer, Some(kept))
}

/// What a reconciliation leaves as the log has it, the folder's lock
/// held: the files of a window's move not yet recorded ([`moving`]) when
/// it is not the move's own (`moved` names them, new path → old) — their
/// old paths stay, their new ones wait. A move whose old path the log no
/// longer knows is recorded: nothing of it is held.
pub(super) fn held_back(
    server: &Server,
    folder: &str,
    known: &HashMap<String, crate::db::Known>,
    moved: &HashMap<String, String>,
) -> (HashSet<String>, HashSet<String>) {
    let pending: Vec<(String, String)> = lock(&server.transfers.moving)
        .get(folder)
        .map(|kept| {
            kept.iter()
                .filter(|(to, from)| moved.get(to) != Some(from))
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    let mut old = HashSet::new();
    let mut new = HashSet::new();
    for (to, from) in pending {
        let in_log =
            known.contains_key(&from) || server.db.known(folder, &from).ok().flatten().is_some();
        if in_log {
            new.insert(to);
            old.insert(from);
        }
    }
    (old, new)
}
