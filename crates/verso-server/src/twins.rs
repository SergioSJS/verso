// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! One name in two files on the server's disk: its accents in the two
//! Unicode forms (NFC, NFD), as a file system that tells them apart (ext4,
//! NTFS) keeps them — left there from before one name was one file (spec
//! Q7, decided 2026-10-10; C8b of the live campaign, 2026-10-11). Sync
//! keeps one and holds the other: the folder's log knows only the one kept,
//! a device's path in either form addresses it, and the one held is said —
//! in the server's log at each walk, and on the folder's page of the
//! console — until someone removes or renames it on the server's disk.
//! Two names that differ only in case are two files on such a disk, and
//! stay so when they exist; a new one is refused where it is made (spec
//! Q8, decided 2026-10-12; `verso_fs::ConfinementError::CaseTwin`).

use std::collections::{BTreeMap, HashMap, HashSet};
use std::time::Instant;

use serde::Serialize;
use verso_core::sync::folded_form;
use verso_service::lock;

use crate::db::Known;
use crate::state::Server;

/// Two files of one name: the one that syncs and the one held.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Twin {
    pub kept: String,
    pub held: String,
}

/// The twins among the folder's files `listed`: per name, the spelling the
/// folder's log already knows is kept (the composed one if it knows both),
/// else the composed spelling, else the first in byte order — the same one
/// on every walk.
#[must_use]
pub fn twins(listed: &[String], known: &HashMap<String, Known>) -> Vec<Twin> {
    let mut by_name: BTreeMap<String, Vec<&String>> = BTreeMap::new();
    for p in listed {
        // An ASCII path is its own composed form: no other spelling.
        if !p.is_ascii() {
            by_name.entry(folded_form(p)).or_default().push(p);
        }
    }
    let mut out = Vec::new();
    for (name, mut paths) in by_name {
        if paths.len() < 2 {
            continue;
        }
        paths.sort();
        let composed = |p: &&String| **p == name;
        let kept = paths
            .iter()
            .find(|p| known.contains_key(p.as_str()) && composed(p))
            .or_else(|| paths.iter().find(|p| known.contains_key(p.as_str())))
            .or_else(|| paths.iter().find(|p| composed(p)))
            .or_else(|| paths.first())
            .map(|p| (*p).clone());
        let Some(kept) = kept else {
            continue;
        };
        for p in paths.iter().filter(|p| ***p != kept) {
            out.push(Twin {
                kept: kept.clone(),
                held: (*p).clone(),
            });
        }
    }
    out
}

/// What a walk of folder `folder` found: kept for the console, and said in
/// the log — once per walk the devices ask for (at most once a minute),
/// not on every batch of the watcher; at once when it changed.
pub fn found(server: &Server, folder: &str, twins: Vec<Twin>) {
    let say = {
        let mut all = lock(&server.transfers.twins);
        if twins.is_empty() {
            all.remove(folder);
            return;
        }
        let due = all
            .get(folder)
            .is_none_or(|(before, at)| *before != twins || at.elapsed() >= crate::sync::WALK_EVERY);
        if due {
            all.insert(folder.to_owned(), (twins.clone(), Instant::now()));
        }
        due
    };
    if !say {
        return;
    }
    let name = server
        .db
        .folder(folder)
        .ok()
        .flatten()
        .map_or_else(|| folder.to_owned(), |f| f.dir);
    for t in &twins {
        crate::log::warn(&format!(
            "sync: {name}: two files hold one name, its accents in two Unicode forms: kept \"{}\", held \"{}\" — only the kept one syncs; remove or rename the other on the server's disk",
            t.kept, t.held
        ));
    }
}

/// The twins of folder `folder` as its last walk found them.
#[must_use]
pub fn of_folder(server: &Server, folder: &str) -> Vec<Twin> {
    lock(&server.transfers.twins)
        .get(folder)
        .map(|(t, _)| t.clone())
        .unwrap_or_default()
}

/// The paths held in folder `folder`: never entered in its log by a write
/// that names them (a window's in a browser), as the walk leaves them out.
#[must_use]
pub fn held(server: &Server, folder: &str) -> HashSet<String> {
    of_folder(server, folder)
        .into_iter()
        .map(|t| t.held)
        .collect()
}

/// Every folder with twins, and how many files are held in it.
#[must_use]
pub fn counts(server: &Server) -> Vec<(String, usize)> {
    let mut out: Vec<(String, usize)> = lock(&server.transfers.twins)
        .iter()
        .map(|(f, (t, _))| (f.clone(), t.len()))
        .collect();
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const COMPOSED: &str = "Caf\u{e9}.md";
    const DECOMPOSED: &str = "Cafe\u{301}.md";

    fn known(paths: &[&str]) -> HashMap<String, Known> {
        paths
            .iter()
            .map(|p| {
                (
                    (*p).to_owned(),
                    Known {
                        hash: String::new(),
                        size: 0,
                        quick: String::new(),
                        seq: 1,
                    },
                )
            })
            .collect()
    }

    fn twin(kept: &str, held: &str) -> Twin {
        Twin {
            kept: kept.to_owned(),
            held: held.to_owned(),
        }
    }

    #[test]
    fn the_spelling_the_log_knows_is_kept_else_the_composed_one() {
        let listed = vec![
            DECOMPOSED.to_owned(),
            COMPOSED.to_owned(),
            "Outra.md".to_owned(),
            "outra.md".to_owned(),
        ];
        // Case alone is two files on such a disk (spec Q8: kept when they exist).
        assert_eq!(
            twins(&listed, &known(&[])),
            vec![twin(COMPOSED, DECOMPOSED)]
        );
        assert_eq!(
            twins(&listed, &known(&[DECOMPOSED])),
            vec![twin(DECOMPOSED, COMPOSED)]
        );
        assert_eq!(
            twins(&listed, &known(&[DECOMPOSED, COMPOSED])),
            vec![twin(COMPOSED, DECOMPOSED)]
        );
        assert_eq!(twins(&[COMPOSED.to_owned()], &known(&[])), vec![]);
    }
}
