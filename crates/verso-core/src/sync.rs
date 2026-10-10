// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync's engine (ADR 0079): what to send, fetch, delete and rename so a
//! folder on this computer and its folder on a server hold the same files,
//! decided from three pictures — the files here, the files there, and the
//! **base**, what both sides last agreed on — per file, by hash. No
//! network and no disk: the host reads the pictures and carries out the
//! plan through `verso-fs` and the device's session.
//!
//! The rules, per path (L here, R there, B the base):
//! - L = R: agreed.
//! - only one side changed since B: that change crosses (an edit, a new
//!   file, a deletion);
//! - both changed: a deletion against an edit keeps the edit (the file
//!   comes back); two edits are a **conflict** — the server's version
//!   keeps the name, this computer's is kept beside it as a copy that
//!   syncs too (item 8);
//! - the first sync of a folder (no base) never deletes (item 11);
//! - a plan that would delete more than a fifth of the folder's files, or
//!   more than 50, pauses and asks (item 9);
//! - a file gone here and a new one of the same bytes since the base, on
//!   one side, is a rename (item 10).

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

/// A file as one side holds it: its bytes' SHA-256 and size.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileState {
    pub hash: String,
    pub size: u64,
}

/// One side's files, by path relative to the folder.
pub type Files = BTreeMap<String, FileState>;

/// What sync keeps of a folder between runs, outside it (ADR 0011): the
/// server and the folder there, the cursor in its log, and the base.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct State {
    pub server: String,
    pub folder: String,
    pub cursor: i64,
    /// Path → the hash both sides last agreed on.
    pub base: BTreeMap<String, String>,
    pub paused: bool,
}

/// One step of a plan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    /// Send this computer's file; `base` is the server's hash it replaces
    /// (none for a new file there).
    Upload { path: String, base: Option<String> },
    /// Fetch the server's file over this computer's (or as new).
    Download { path: String, hash: String },
    /// Delete the server's file, which must still be `base`.
    DeleteRemote { path: String, base: String },
    /// Delete this computer's file (to the system's bin).
    DeleteLocal { path: String },
    /// Rename on the server; the file there must still be `base`.
    RenameRemote {
        from: String,
        to: String,
        base: String,
    },
    /// Rename here.
    RenameLocal { from: String, to: String },
    /// Both changed: this computer's file is renamed to `copy` and sent as
    /// new, then the server's fetched under `path`.
    Conflict {
        path: String,
        copy: String,
        hash: String,
    },
    /// Both hold the same bytes, or neither the file: the base records it.
    Agree { path: String, hash: Option<String> },
}

/// A plan, and whether it waits for the person.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Plan {
    pub actions: Vec<Action>,
    /// How many files the plan would delete, when that is many enough to
    /// ask first (item 9): nothing is carried out until the person says.
    pub pause: Option<usize>,
}

/// The name a conflict's copy takes (item 8): `<stem> (conflict, <device>,
/// <when>).<ext>`, in the person's language, with characters every system
/// keeps (ADR 0070 item 3), not one of `taken`.
#[must_use]
pub fn conflict_name(
    path: &str,
    device: &str,
    when: &str,
    pt: bool,
    taken: &BTreeSet<String>,
) -> String {
    let (dir, file) = path.rsplit_once('/').map_or(("", path), |(d, f)| (d, f));
    let (stem, ext) = match file.rfind('.') {
        Some(at) if at > 0 => (&file[..at], &file[at..]),
        _ => (file, ""),
    };
    let safe: String = device
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim()
        .chars()
        .take(40)
        .collect();
    let word = if pt { "conflito" } else { "conflict" };
    let at = |n: usize| {
        let more = if n > 1 {
            format!(" {n}")
        } else {
            String::new()
        };
        let name = format!("{stem} ({word}, {safe}, {when}{more}){ext}");
        if dir.is_empty() {
            name
        } else {
            format!("{dir}/{name}")
        }
    };
    let mut n = 1;
    while taken.contains(&at(n)) {
        n += 1;
    }
    at(n)
}

/// What the files and the base say to do.
#[must_use]
pub fn plan(
    local: &Files,
    remote: &Files,
    state: &State,
    confirmed: bool,
    copy_name: &dyn Fn(&str, &BTreeSet<String>) -> String,
) -> Plan {
    let base = &state.base;
    let first = base.is_empty();
    let mut actions = Vec::new();
    let mut done: BTreeSet<String> = BTreeSet::new();
    let hash = |files: &Files, p: &str| files.get(p).map(|f| f.hash.clone());

    // Renames first: a base path gone on one side, a new path there with
    // its bytes, the other side unchanged at the old path.
    if !first {
        for (old, b) in base {
            let (l, r) = (hash(local, old), hash(remote, old));
            // Renamed here: gone here, unchanged there.
            if l.is_none()
                && r.as_deref() == Some(b.as_str())
                && let Some((new, _)) = local.iter().find(|(p, f)| {
                    &f.hash == b
                        && !base.contains_key(*p)
                        && !remote.contains_key(*p)
                        && !done.contains(*p)
                })
            {
                actions.push(Action::RenameRemote {
                    from: old.clone(),
                    to: new.clone(),
                    base: b.clone(),
                });
                done.insert(old.clone());
                done.insert(new.clone());
                continue;
            }
            // Renamed there: gone there, unchanged here.
            if r.is_none()
                && l.as_deref() == Some(b.as_str())
                && let Some((new, _)) = remote.iter().find(|(p, f)| {
                    &f.hash == b
                        && !base.contains_key(*p)
                        && !local.contains_key(*p)
                        && !done.contains(*p)
                })
            {
                actions.push(Action::RenameLocal {
                    from: old.clone(),
                    to: new.clone(),
                });
                done.insert(old.clone());
                done.insert(new.clone());
            }
        }
    }

    let paths: BTreeSet<&String> = local
        .keys()
        .chain(remote.keys())
        .chain(base.keys())
        .collect();
    let mut taken: BTreeSet<String> = local.keys().chain(remote.keys()).cloned().collect();
    for path in paths {
        if done.contains(path) {
            continue;
        }
        let (l, r, b) = (
            hash(local, path),
            hash(remote, path),
            base.get(path).cloned(),
        );
        if l == r {
            if b != l {
                actions.push(Action::Agree {
                    path: path.clone(),
                    hash: l,
                });
            }
            continue;
        }
        if first {
            // No base: copy what one side alone has, conflict on both.
            match (l, r) {
                (Some(_), None) => actions.push(Action::Upload {
                    path: path.clone(),
                    base: None,
                }),
                (None, Some(h)) => actions.push(Action::Download {
                    path: path.clone(),
                    hash: h,
                }),
                (Some(_), Some(h)) => {
                    let copy = copy_name(path, &taken);
                    taken.insert(copy.clone());
                    actions.push(Action::Conflict {
                        path: path.clone(),
                        copy,
                        hash: h,
                    });
                }
                (None, None) => {}
            }
            continue;
        }
        let local_changed = l != b;
        let remote_changed = r != b;
        match (local_changed, remote_changed) {
            (false, true) => match r {
                Some(h) => actions.push(Action::Download {
                    path: path.clone(),
                    hash: h,
                }),
                None => {
                    if l.is_some() {
                        actions.push(Action::DeleteLocal { path: path.clone() });
                    }
                }
            },
            (true, false) => match (l, r) {
                (Some(_), r) => actions.push(Action::Upload {
                    path: path.clone(),
                    base: r,
                }),
                (None, Some(h)) => actions.push(Action::DeleteRemote {
                    path: path.clone(),
                    base: h,
                }),
                (None, None) => {}
            },
            _ => match (l, r) {
                // Deleted here, edited there: the edit wins.
                (None, Some(h)) => actions.push(Action::Download {
                    path: path.clone(),
                    hash: h,
                }),
                // Edited here, deleted there: the file comes back.
                (Some(_), None) => actions.push(Action::Upload {
                    path: path.clone(),
                    base: None,
                }),
                (Some(_), Some(h)) => {
                    let copy = copy_name(path, &taken);
                    taken.insert(copy.clone());
                    actions.push(Action::Conflict {
                        path: path.clone(),
                        copy,
                        hash: h,
                    });
                }
                (None, None) => actions.push(Action::Agree {
                    path: path.clone(),
                    hash: None,
                }),
            },
        }
    }

    let deletions = actions
        .iter()
        .filter(|a| matches!(a, Action::DeleteLocal { .. } | Action::DeleteRemote { .. }))
        .count();
    let size = local.len().max(remote.len()).max(base.len());
    let many = deletions > 50 || (deletions > 0 && deletions * 5 > size);
    Plan {
        pause: (many && !confirmed).then_some(deletions),
        actions,
    }
}

/// The folder's sync state, as last saved (none: never synced, or not
/// readable — then a first sync, which deletes nothing).
pub fn load(
    config: Option<&std::path::Path>,
    key: &str,
) -> Result<Option<State>, crate::CoreError> {
    let dir = match config {
        Some(d) => d.to_path_buf(),
        None => crate::config_dir()?,
    };
    Ok(crate::sidecar::read_sync(&dir, key))
}

pub fn save(
    config: Option<&std::path::Path>,
    key: &str,
    state: &State,
) -> Result<(), crate::CoreError> {
    let dir = match config {
        Some(d) => d.to_path_buf(),
        None => crate::config_dir()?,
    };
    crate::sidecar::write_sync(&dir, key, state).map_err(crate::CoreError::Sidecar)
}

#[cfg(test)]
mod tests;
