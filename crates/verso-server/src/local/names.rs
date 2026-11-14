// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The name each ticked folder is registered under, **given once and kept**
//! (`LocalSettings::names`, by the folder's path). The registration in the
//! database — the table, the players, the shares — is found by that name,
//! so a name is never handed to another folder: until 2026-11-13 it came
//! from the order of the folders ticked (`Campanha`, `Campanha (2)`), and
//! unticking the first gave its name, and its players, to the second.
//! A folder unticked keeps its name, and its registration rests until it
//! is ticked again (`tests_rest`).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use super::LocalSettings;
use crate::db::Db;

/// The directory's own name, as a folder's name is formed.
fn base_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.is_empty() && !n.contains(['/', '\\']))
        .unwrap_or_else(|| "Folder".to_owned())
}

/// A name from `base` that none of `taken` has.
fn unique(base: &str, taken: &HashSet<String>) -> String {
    let mut name = base.to_owned();
    let mut n = 2;
    while taken.contains(&name) {
        name = format!("{base} ({n})");
        n += 1;
    }
    name
}

/// Whether the registration named `dir` holds anything of another person:
/// a member, a share given to someone, a table or a read link. Only one
/// that holds nothing of anyone but the owner (`owner`) may be taken by a
/// folder from settings written before names were kept: there is no tie
/// between a registration and a path to tell whose it was (review of
/// 2026-11-14, B2).
fn holds_others(db: &Db, dir: &str, owner: &str) -> bool {
    let Ok(Some(f)) = db.folder_by_dir(dir) else {
        return false;
    };
    let members = db.members(&f.id).unwrap_or_default();
    if members.iter().any(|(a, _)| a.id != owner) {
        return true;
    }
    let shared = db.shares_of(&f.id).unwrap_or_default().iter().any(|s| {
        db.share_people(&s.id)
            .unwrap_or_default()
            .iter()
            .any(|(a, _)| a.id != owner)
    });
    shared
        || !db.campaigns_of(&f.id).unwrap_or_default().is_empty()
        || !db.read_links_of(&f.id).unwrap_or_default().is_empty()
}

/// Each ticked folder given a name if it has none, never one another
/// folder — ticked, unticked or only registered — has. Settings written
/// before names were kept take the name their order gave only when its
/// registration holds nothing of anyone but the owner (the phones' parts
/// of ADR 0096, the only thing a released version kept there): one with
/// a member, a share given, a table or a read link may have been another
/// folder's, so the folder gets a new name and that registration rests,
/// whole, for nobody. `true` when a name was given.
pub(super) fn assign(db: &Db, settings: &mut LocalSettings) -> Result<bool, String> {
    let registered: HashSet<String> = db.folders()?.into_iter().map(|f| f.dir).collect();
    let mut given = false;
    if settings.names.is_empty() && !settings.folders.is_empty() {
        let owner = db.local_owner()?.id;
        let mut taken = HashSet::new();
        for p in &settings.folders {
            let base = base_of(Path::new(p));
            let ordered = unique(&base, &taken);
            let name = if registered.contains(&ordered) && holds_others(db, &ordered, &owner) {
                let all: HashSet<String> = taken.union(&registered).cloned().collect();
                unique(&base, &all)
            } else {
                ordered
            };
            taken.insert(name.clone());
            settings.names.insert(p.clone(), name);
            given = true;
        }
        return Ok(given);
    }
    for p in &settings.folders {
        if settings.names.contains_key(p) {
            continue;
        }
        let taken: HashSet<String> = settings
            .names
            .values()
            .cloned()
            .chain(registered.iter().cloned())
            .collect();
        let name = unique(&base_of(Path::new(p)), &taken);
        settings.names.insert(p.clone(), name);
        given = true;
    }
    Ok(given)
}

/// The ticked folders by the names [`assign`] gave them.
pub(super) fn served(settings: &LocalSettings) -> HashMap<String, PathBuf> {
    settings
        .folders
        .iter()
        .filter_map(|p| Some((settings.names.get(p)?.clone(), PathBuf::from(p))))
        .collect()
}
