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

/// `Campanha (2)` → `Campanha`: the base a name was made unique from.
fn base_of_name(name: &str) -> &str {
    if let Some(open) = name.rfind(" (")
        && name.ends_with(')')
        && name[open + 2..name.len() - 1]
            .chars()
            .all(|c| c.is_ascii_digit())
    {
        return &name[..open];
    }
    name
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

/// Each ticked folder given a name if it has none, never one another
/// folder — ticked, unticked or only registered — has. Settings written
/// before names were kept are given the names their order gave them, the
/// names their registrations have, unless that order can no longer be
/// trusted: more registrations of a base than folders ticked of it (one
/// was unticked while serving was off), when those folders get new names
/// and none of the old registrations. `true` when a name was given.
pub(super) fn assign(db: &Db, settings: &mut LocalSettings) -> Result<bool, String> {
    let registered: HashSet<String> = db.folders()?.into_iter().map(|f| f.dir).collect();
    let mut given = false;
    if settings.names.is_empty() && !settings.folders.is_empty() {
        let mut ticked_of: HashMap<String, usize> = HashMap::new();
        for p in &settings.folders {
            *ticked_of.entry(base_of(Path::new(p))).or_default() += 1;
        }
        let mut rows_of: HashMap<&str, usize> = HashMap::new();
        for d in &registered {
            *rows_of.entry(base_of_name(d)).or_default() += 1;
        }
        let mut taken = HashSet::new();
        for p in &settings.folders {
            let base = base_of(Path::new(p));
            let trusted = rows_of.get(base.as_str()).copied().unwrap_or(0) <= ticked_of[&base];
            let name = if trusted {
                unique(&base, &taken)
            } else {
                let all: HashSet<String> = taken.union(&registered).cloned().collect();
                unique(&base, &all)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_made_unique_has_its_base() {
        assert_eq!(base_of_name("Campanha (2)"), "Campanha");
        assert_eq!(base_of_name("Campanha"), "Campanha");
        assert_eq!(base_of_name("Notas (velhas)"), "Notas (velhas)");
        assert_eq!(base_of_name("(3)"), "(3)");
    }
}
