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
//!
//! Both sides of a rename are judged in one step when they can be: a
//! reconciliation that finds one side alone of a file with access of its
//! own walks the folder again first (`look_again`). When they still come
//! in two steps — on Windows a file is renamed by `link` then `unlink`, and
//! the old name can be read gone after the listing was taken, before the
//! new name was in it (2026-11-06) — the walk is not sure, and the new file
//! is born hidden: one no one wrote through Verso, of the bytes of a file
//! kept from someone that went outside a while ago (`Remembered`) or that
//! is still there (the rename's middle, two names for one file).

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use verso_service::lock;

use crate::access::NodeSet;
use crate::campaign;
use crate::db::{Known, Recorded};
use crate::state::Server;

/// Whether a reconciliation walks the folder again before it records what
/// it found (`gone`, `created`: path, hash, …), against what the log knew:
/// the listing it compared is as of the index's last walk, and a watcher's
/// batch may name one side of a rename outside Verso alone (seen on
/// Windows, 2026-11-06) — the old name of a file with access of its own,
/// read again once it was gone, while the new name is not listed yet; or
/// the new name, of the bytes of such a file the listing still names and
/// the log's quick key vouched for unread. Recorded so, the one is a
/// deletion that drops the access and the other a new file of its
/// folder's: shown to whom the old file was kept from. Walked again, both
/// sides are found in one step and `followed` carries the access or keeps
/// the file hidden. A window's own moves (`moved`) carried it already.
pub fn look_again(
    server: &Server,
    folder: &str,
    (known, gone): (&HashMap<String, Known>, &[(String, String)]),
    created: &[(String, String, i64, String)],
    moved: &HashMap<String, String>,
) -> bool {
    if gone.is_empty() && created.is_empty() {
        return false;
    }
    let Some(veil) = campaign::veil_of(server, folder) else {
        return false;
    };
    let window = |p: &str| moved.contains_key(p) || moved.values().any(|f| f == p);
    let kept = |p: &str| !window(p) && veil.own_set(p).is_some();
    if gone.iter().any(|(p, _)| kept(p)) {
        return true;
    }
    let new: HashSet<&str> = created
        .iter()
        .filter(|(p, _, _, _)| !known.contains_key(p) && !window(p) && veil.in_table(p))
        .map(|(_, hash, _, _)| hash.as_str())
        .collect();
    !new.is_empty()
        && known
            .iter()
            .any(|(p, k)| new.contains(k.hash.as_str()) && kept(p))
}

/// How long the bytes of a file kept from someone that went outside Verso
/// are remembered: past a rename's two steps — the watcher's next batch,
/// a device's next question, its five-minute scan.
const REMEMBERED: Duration = Duration::from_secs(10 * 60);

/// The most remembered per folder: the oldest go first.
const REMEMBERED_MOST: usize = 1024;

/// The files kept from someone that went outside Verso and whose access
/// went with them, by folder: their bytes (hash), the set they had of
/// their own, and when. Only in memory: the two sides of a rename come
/// seconds apart, not across a restart.
///
/// And the new files kept hidden so, by folder, for a short while: on
/// Windows the watcher may record a window's write before the write's own
/// step does (C3), and a note written through Verso is then found, by
/// nobody — its writer's step gives it back its folder's access.
#[derive(Default)]
pub struct Remembered {
    gone: Mutex<HashMap<String, Vec<Kept>>>,
    hid: Mutex<HashMap<String, Vec<(String, Instant)>>>,
}

/// How long a new file kept hidden waits for its writer's own step.
const WRITER_WITHIN: Duration = Duration::from_secs(30);

/// A file's bytes (hash), the set it had of its own, and when it went.
type Kept = (String, NodeSet, Instant);

impl Remembered {
    /// What `folder` remembers, the expired let go.
    fn of(&self, folder: &str) -> Vec<(String, NodeSet)> {
        let mut all = lock(&self.gone);
        let Some(list) = all.get_mut(folder) else {
            return Vec::new();
        };
        list.retain(|(_, _, at)| at.elapsed() < REMEMBERED);
        let out = list
            .iter()
            .map(|(h, s, _)| (h.clone(), s.clone()))
            .collect();
        if list.is_empty() {
            all.remove(folder);
        }
        out
    }

    fn keep(&self, folder: &str, hash: &str, set: NodeSet) {
        let mut all = lock(&self.gone);
        let list = all.entry(folder.to_owned()).or_default();
        list.push((hash.to_owned(), set, Instant::now()));
        if list.len() > REMEMBERED_MOST {
            let extra = list.len() - REMEMBERED_MOST;
            list.drain(..extra);
        }
    }

    fn hidden(&self, folder: &str, path: &str) {
        let mut all = lock(&self.hid);
        let list = all.entry(folder.to_owned()).or_default();
        list.retain(|(_, at)| at.elapsed() < WRITER_WITHIN);
        list.push((path.to_owned(), Instant::now()));
        if list.len() > REMEMBERED_MOST {
            let extra = list.len() - REMEMBERED_MOST;
            list.drain(..extra);
        }
    }

    /// Those of `written` kept hidden a moment ago, let go.
    fn written<'a>(&self, folder: &str, written: &HashSet<&'a str>) -> Vec<&'a str> {
        let mut all = lock(&self.hid);
        let Some(list) = all.get_mut(folder) else {
            return Vec::new();
        };
        list.retain(|(_, at)| at.elapsed() < WRITER_WITHIN);
        let out: Vec<&str> = written
            .iter()
            .filter(|w| list.iter().any(|(p, _)| p == *w))
            .copied()
            .collect();
        list.retain(|(p, _)| !out.contains(&p.as_str()));
        if list.is_empty() {
            all.remove(folder);
        }
        out
    }
}

/// `changes` (as `sync::record_changes` is about to record them), what
/// went (`gone`, path and hash), the paths the caller wrote through Verso
/// (`written`, carried in its own session), what the log knew, and the
/// window's own moves (`moved`, new path → old, carried already).
pub fn followed(
    server: &Server,
    folder: &str,
    (changes, gone, written): (&[Recorded], &[(String, String)], &HashSet<&str>),
    (known, moved): (&HashMap<String, Known>, &HashMap<String, String>),
) {
    let Some(veil) = campaign::veil_of(server, folder) else {
        return;
    };
    let mut changed = false;
    // A file kept hidden here a moment ago that its writer's step names:
    // written through Verso, it follows its folder as every new note does.
    if !written.is_empty() {
        for path in server.campaigns.gone_outside.written(folder, written) {
            if veil
                .own_set(path)
                .is_some_and(|s| s.normalized() == NodeSet::default().normalized())
            {
                match server.db.access_follow(folder, path) {
                    Ok(()) => changed = true,
                    Err(e) => crate::log::warn(&format!("a written file follows its folder: {e}")),
                }
            }
        }
    }
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
    // A new file found, not written: it may be the other side of a rename
    // whose first was recorded already, or is not yet.
    let found: Vec<&str> = new
        .iter()
        .filter(|(path, _, _)| !written.contains(path) && veil.in_table(path))
        .map(|(_, hash, _)| *hash)
        .collect();
    let remembered = if found.is_empty() {
        Vec::new()
    } else {
        server.campaigns.gone_outside.of(folder)
    };
    let mut still_of: HashMap<&str, Vec<&str>> = HashMap::new();
    if !found.is_empty() {
        let went: HashSet<&str> = gone.iter().map(|(p, _)| p.as_str()).collect();
        for (path, k) in known {
            if found.contains(&k.hash.as_str()) && !went.contains(path.as_str()) {
                still_of.entry(&k.hash).or_default().push(path);
            }
        }
    }
    let mut carried: Vec<&str> = Vec::new();
    for (path, hash, from) in &new {
        if !veil.in_table(path) {
            continue;
        }
        let olds = gone_of.get(hash).map_or(&[][..], Vec::as_slice);
        let sure = olds.len() == 1 && new_of.get(hash) == Some(&1);
        if let (true, Some(from)) = (sure, from) {
            carried.push(from);
            changed |= carry(server, folder, &veil, (from, path));
            continue;
        }
        if veil.own_set(path).is_some() {
            continue;
        }
        // Not sure which: hidden, when it may be a file kept from someone —
        // one gone in this step, or (found, not written) gone a while ago
        // or still there under its old name.
        let would = veil.effective_set(path);
        let kept = |o: &&str| veil.own_set(o).is_some_and(|s| narrower(&s, &would));
        let mut may_be = olds.iter().any(kept);
        if !may_be && !written.contains(path) {
            may_be = remembered
                .iter()
                .any(|(h, s)| h == hash && narrower(s, &would))
                || still_of.get(hash).is_some_and(|ps| ps.iter().any(kept));
        }
        if may_be {
            match server.db.access_put(folder, path, NodeSet::default()) {
                Ok(()) => {
                    changed = true;
                    if !written.contains(path) {
                        server.campaigns.gone_outside.hidden(folder, path);
                    }
                }
                Err(e) => crate::log::warn(&format!("keeping a file hidden: {e}")),
            }
        }
    }
    // What went and was not carried takes its access with it; its bytes
    // are remembered, for a new file of them a later step finds.
    for (path, hash) in gone {
        if carried.contains(&path.as_str()) {
            continue;
        }
        let Some(own) = veil.own_set(path) else {
            continue;
        };
        server.campaigns.gone_outside.keep(folder, hash, own);
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
