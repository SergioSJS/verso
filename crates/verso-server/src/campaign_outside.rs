// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a table keeps of its files when they change outside Verso: renamed
//! or deleted on the server's disk, found by the watcher or the walk (the
//! audit of 2026-11-05; the maintainer, the same day: "pode seguir as
//! recomendações").
//!
//! A change made through the server has carried its access already, in its
//! own session (`shares::followed`): what is said here finds nothing left
//! to do for it. For the others, in the step that records them, before the
//! players are told:
//!
//! - a rename the walk is sure of — the one file gone and the one new file
//!   of the same bytes — carries the file's access along, as a move does
//!   (ADR 0113 K.2);
//! - a new file the walk cannot pair for sure (several gone or new of its
//!   bytes) is born hidden when one of those gone had access of its own
//!   narrower than the new file would take from its folder: it may be that
//!   file. Any other new file follows its folder, as every new file does;
//! - a file gone otherwise takes the access it had of its own with it.

use std::collections::HashMap;

use crate::access::NodeSet;
use crate::campaign;
use crate::db::{Known, Recorded};
use crate::state::Server;

/// `changes` (as `sync::record_changes` is about to record them), what
/// went (`gone`, path and hash), what the log knew, and the window's own
/// moves (`moved`, new path → old, carried already).
pub fn followed(
    server: &Server,
    folder: &str,
    (changes, gone): (&[Recorded], &[(String, String)]),
    (known, moved): (&HashMap<String, Known>, &HashMap<String, String>),
) {
    let Some(veil) = campaign::veil_of(server, folder) else {
        return;
    };
    // The new files, with their bytes and the file gone they were paired
    // with; a file the log knew changed in place.
    let new: Vec<(&str, &str, Option<&str>)> = changes
        .iter()
        .filter(|(path, _, _)| !known.contains_key(path) && !moved.contains_key(path))
        .filter_map(|(path, bytes, from)| {
            bytes
                .as_ref()
                .map(|(hash, _, _)| (path.as_str(), hash.as_str(), from.as_deref()))
        })
        .collect();
    let mut gone_of: HashMap<&str, Vec<&str>> = HashMap::new();
    for (path, hash) in gone {
        gone_of.entry(hash).or_default().push(path);
    }
    let mut new_of: HashMap<&str, usize> = HashMap::new();
    for (_, hash, _) in &new {
        *new_of.entry(hash).or_default() += 1;
    }
    let mut changed = false;
    let mut carried: Vec<&str> = Vec::new();
    for (path, hash, from) in &new {
        if !veil.in_table(path) {
            continue;
        }
        let olds = gone_of.get(hash).map_or(&[][..], Vec::as_slice);
        if olds.is_empty() {
            continue;
        }
        let sure = olds.len() == 1 && new_of.get(hash) == Some(&1);
        if let (true, Some(from)) = (sure, from) {
            carried.push(from);
            changed |= carry(server, folder, &veil, (from, path));
            continue;
        }
        // Not sure which: hidden, when it may be a file kept from someone.
        let would = veil.effective_set(path);
        if veil.own_set(path).is_none()
            && olds
                .iter()
                .any(|o| veil.own_set(o).is_some_and(|s| narrower(&s, &would)))
        {
            match server.db.access_put(folder, path, NodeSet::default()) {
                Ok(()) => changed = true,
                Err(e) => crate::log::warn(&format!("keeping a file hidden: {e}")),
            }
        }
    }
    // What went and was not carried takes its access with it.
    for (path, _) in gone {
        if carried.contains(&path.as_str()) || veil.own_set(path).is_none() {
            continue;
        }
        match server.db.campaign_unbinned(folder, path) {
            Ok(n) => changed |= n > 0,
            Err(e) => crate::log::warn(&format!("dropping a gone file's access: {e}")),
        }
    }
    if changed {
        campaign::forget(server, folder);
    }
}

/// `from` renamed to `to` outside Verso: `to` keeps the access `from` had,
/// its own or the one it followed, unless `to` has a set of its own already
/// (a change through the server carried it). Whether anything was written.
fn carry(server: &Server, folder: &str, veil: &campaign::Veil, (from, to): (&str, &str)) -> bool {
    if veil.own_set(to).is_some() || !veil.in_table(from) {
        return false;
    }
    if veil.own_set(from).is_some() {
        return server
            .db
            .campaign_restored(folder, from, to)
            .is_ok_and(|n| n > 0);
    }
    match veil.inherited_set(from) {
        Some(set) if set != veil.effective_set(to) => server.db.access_put(folder, to, set).is_ok(),
        _ => false,
    }
}

/// Whether `a` keeps someone from more than `b` does: a lower level for the
/// whole table, or for any player either names.
fn narrower(a: &NodeSet, b: &NodeSet) -> bool {
    a.whole < b.whole
        || a.rows
            .keys()
            .chain(b.rows.keys())
            .any(|who| a.of(who) < b.of(who))
}
