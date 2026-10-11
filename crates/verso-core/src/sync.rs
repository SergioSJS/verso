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
//!   more than 50, pauses and asks — never for fewer than 3 (item 9);
//! - a file gone here and a new one of the same bytes since the base, on
//!   one side, is a rename (item 10);
//! - where this computer's file system folds names (APFS, NTFS), a path
//!   here and a path there that differ only in case or in their accents'
//!   form are one file: a respelling here crosses as a rename when the
//!   server's file is as the base left it; otherwise the server's spelling
//!   is taken here first and the file is planned as one — its edit wins
//!   over a respelling, two edits are a conflict.

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
    /// Turned off by the person (item 1): kept with its base, so that
    /// turning it on again with the same folder of the server goes on
    /// from where it stopped instead of a first sync.
    #[serde(default)]
    pub off: bool,
    /// Path → the size and time a file of this computer had when its hash
    /// was read, and that hash: a file unchanged since is not read again.
    /// Kept only for files older than the moment they were read by a
    /// margin, so an edit in the same second is never taken for the same
    /// file.
    #[serde(default)]
    pub seen: BTreeMap<String, Seen>,
}

/// A file of this computer as last hashed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Seen {
    pub size: u64,
    pub modified: i64,
    pub hash: String,
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

/// The fewest deletions in one pass that pause it (item 9, revised
/// 2026-10-10).
pub const PAUSE_FLOOR: usize = 3;

/// Whether a path can cross to every system (ADR 0070 item 3): one that
/// cannot is listed by sync instead of sent, since the server would refuse
/// it.
#[must_use]
pub fn portable(path: &str) -> bool {
    verso_fs::is_portable(std::path::Path::new(path))
}

/// Whether this system's file systems fold names by default (APFS, NTFS):
/// where they do not (Linux), two names differing in case are two files.
pub const FOLDS_NAMES: bool = cfg!(any(target_os = "macos", windows));

/// A path as a file system that ignores case and Unicode normalization
/// compares it — APFS, NTFS: `Nota.md`, `nota.md` and `Nota.md` written in
/// decomposed form are one file there. A path the listing lacks whose
/// folded form is a listed path's is that file renamed, not a second one.
#[must_use]
pub fn folded(path: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    path.nfc().collect::<String>().to_lowercase()
}

/// The name a conflict's copy takes (item 8): `<stem> (conflict, <device>,
/// <when>).<ext>`, in the person's language, with characters every system
/// keeps (ADR 0070 item 3), not one of `taken` — compared as a file system
/// that folds names compares them, so that every device can hold it.
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
    let taken: BTreeSet<String> = taken.iter().map(|t| folded(t)).collect();
    let mut n = 1;
    while taken.contains(&folded(&at(n))) {
        n += 1;
    }
    at(n)
}

/// What the files and the base say to do. `folds`: whether this
/// computer's file system takes two names differing only in case or in
/// their accents' form for one ([`FOLDS_NAMES`]).
#[must_use]
pub fn plan(
    local: &Files,
    remote: &Files,
    state: &State,
    confirmed: bool,
    folds: bool,
    copy_name: &dyn Fn(&str, &BTreeSet<String>) -> String,
) -> Plan {
    let base = &state.base;
    let first = base.is_empty();
    let mut actions = Vec::new();
    let mut done: BTreeSet<String> = BTreeSet::new();
    let hash = |files: &Files, p: &str| files.get(p).map(|f| f.hash.clone());
    let mut taken: BTreeSet<String> = local.keys().chain(remote.keys()).cloned().collect();

    if folds {
        respelled(
            local,
            remote,
            state,
            &mut done,
            &mut taken,
            copy_name,
            &mut actions,
        );
    }

    // Renames first: a base path gone on one side, a new path there with
    // its bytes, the other side unchanged at the old path.
    if !first {
        for (old, b) in base {
            if done.contains(old) {
                continue;
            }
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
    for path in paths {
        if done.contains(path) {
            continue;
        }
        let hashes = (
            hash(local, path),
            hash(remote, path),
            base.get(path).cloned(),
        );
        decide(path, hashes, first, &mut taken, copy_name, &mut actions);
    }

    let deletions = actions
        .iter()
        .filter(|a| matches!(a, Action::DeleteLocal { .. } | Action::DeleteRemote { .. }))
        .count();
    let size = local.len().max(remote.len()).max(base.len());
    // At least 3 (item 9, revised 2026-10-10): in a small folder a fifth
    // is one or two files, and one or two deletions are no folder gone.
    let many = deletions >= PAUSE_FLOOR && (deletions > 50 || deletions * 5 > size);
    Plan {
        pause: (many && !confirmed).then_some(deletions),
        actions,
    }
}

/// One path's hashes here, there and in the base.
type Hashes = (Option<String>, Option<String>, Option<String>);

/// What one path's hashes — here, there, in the base — say to do, renames
/// set aside.
fn decide(
    path: &str,
    (l, r, b): Hashes,
    first: bool,
    taken: &mut BTreeSet<String>,
    copy_name: &dyn Fn(&str, &BTreeSet<String>) -> String,
    actions: &mut Vec<Action>,
) {
    let path = path.to_owned();
    let mut conflict = |path: String, hash: String, actions: &mut Vec<Action>| {
        let copy = copy_name(&path, taken);
        taken.insert(copy.clone());
        actions.push(Action::Conflict { path, copy, hash });
    };
    if l == r {
        if b != l {
            actions.push(Action::Agree { path, hash: l });
        }
        return;
    }
    if first {
        // No base: copy what one side alone has, conflict on both.
        match (l, r) {
            (Some(_), None) => actions.push(Action::Upload { path, base: None }),
            (None, Some(hash)) => actions.push(Action::Download { path, hash }),
            (Some(_), Some(hash)) => conflict(path, hash, actions),
            (None, None) => {}
        }
        return;
    }
    let local_changed = l != b;
    let remote_changed = r != b;
    match (local_changed, remote_changed) {
        (false, true) => match r {
            Some(hash) => actions.push(Action::Download { path, hash }),
            None => {
                if l.is_some() {
                    actions.push(Action::DeleteLocal { path });
                }
            }
        },
        (true, false) => match (l, r) {
            (Some(_), base) => actions.push(Action::Upload { path, base }),
            (None, Some(base)) => actions.push(Action::DeleteRemote { path, base }),
            (None, None) => {}
        },
        _ => match (l, r) {
            // Deleted here, edited there: the edit wins.
            (None, Some(hash)) => actions.push(Action::Download { path, hash }),
            // Edited here, deleted there: the file comes back.
            (Some(_), None) => actions.push(Action::Upload { path, base: None }),
            (Some(_), Some(hash)) => conflict(path, hash, actions),
            (None, None) => actions.push(Action::Agree { path, hash: None }),
        },
    }
}

/// Where this computer's file system folds names: a path here and a path
/// there that differ only in case or in their accents' form are one file
/// (this computer cannot hold both), whichever side spelled it anew.
/// - Respelled here, the server's file as the base left it: the new
///   spelling crosses as a rename, then this computer's edit if any.
/// - Otherwise — respelled there, made on both sides apart, or respelled
///   here while the server's file changed — the server's spelling is taken
///   here first, and the file is planned as one under it: an edit wins
///   over a respelling (item 9), two edits are a conflict (item 8).
///
/// Without this, the two spellings would each be a file of one side only:
/// fetching the server's would find this computer's in its place, sending
/// this computer's would find the server's — refused on every pass, the
/// server's edit never arriving.
fn respelled(
    local: &Files,
    remote: &Files,
    state: &State,
    done: &mut BTreeSet<String>,
    taken: &mut BTreeSet<String>,
    copy_name: &dyn Fn(&str, &BTreeSet<String>) -> String,
    actions: &mut Vec<Action>,
) {
    let base = &state.base;
    for (here, mine) in local {
        if remote.contains_key(here) || done.contains(here) {
            continue;
        }
        let key = folded(here);
        let Some((there, theirs)) = remote
            .iter()
            .find(|(p, _)| !local.contains_key(*p) && !done.contains(*p) && folded(p) == key)
        else {
            continue;
        };
        match (base.get(here), base.get(there)) {
            // Both spellings in the base: not one respelling; left to the
            // rules by path.
            (Some(_), Some(_)) => continue,
            (None, Some(b)) if &theirs.hash == b => {
                actions.push(Action::RenameRemote {
                    from: there.clone(),
                    to: here.clone(),
                    base: b.clone(),
                });
                if &mine.hash != b {
                    actions.push(Action::Upload {
                        path: here.clone(),
                        base: Some(b.clone()),
                    });
                }
            }
            (b_here, b_there) => {
                actions.push(Action::RenameLocal {
                    from: here.clone(),
                    to: there.clone(),
                });
                let hashes = (
                    Some(mine.hash.clone()),
                    Some(theirs.hash.clone()),
                    b_there.or(b_here).cloned(),
                );
                decide(there, hashes, base.is_empty(), taken, copy_name, actions);
            }
        }
        done.insert(here.clone());
        done.insert(there.clone());
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
