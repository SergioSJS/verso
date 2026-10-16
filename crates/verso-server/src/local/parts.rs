// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder served **in part** (ADR 0096 item 2, amended 2026-10-16): the
//! person ticks a folder and chooses only some of the folders inside it.
//! Each chosen folder reaches the phone as a folder of its own, by the
//! confinement of a share (ADR 0081 items 1, 2 and 11): the folder is
//! registered, because a share needs a folder to belong to, but it is
//! held by an account that is not the phones' ([`crate::db::VAULT_HOLDER`]),
//! so its own id opens nothing for a phone; the phone's owner account is
//! given one share per chosen folder, and a phone opens those ids.
//!
//! The attachments go along as the share's attachments folder, read-only
//! and **files only, never a note**: the one folder Obsidian's settings name
//! for the vault ([`verso_core::served_attachments`]), fixed at each start —
//! never found from text a phone can write. A symbolic link under a chosen
//! folder that leads out of it is left out whole ([`escapes`]).

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use verso_service::lock;

use crate::db::{Db, Role, Share};
use crate::scope::Guard;

/// How long the links found under a chosen folder are trusted before the
/// folder is looked at again: a command does not walk the folder.
const LINKS_FRESH: Duration = Duration::from_secs(3);

/// What the policy keeps of the folders served in part.
#[derive(Default)]
pub struct Parts {
    /// The ids of the registered folders no phone may reach: those served
    /// in part. A second lock on the door beside the holder's ownership.
    hidden: RwLock<HashSet<String>>,
    /// Each share's name as a phone lists it: the folder's own, made unique
    /// against the other folders served (`Projetos`, `Projetos (2)`).
    names: RwLock<HashMap<String, String>>,
    /// The links that leave each chosen folder, by share, and when they
    /// were looked for.
    guards: Mutex<HashMap<String, (Instant, Arc<Guard>)>>,
    /// The chosen folders this start left out for not being on the disk:
    /// the folder's path as the host knows it, and the chosen folder.
    dropped: Mutex<Vec<(String, String)>>,
}

impl Parts {
    pub fn set(&self, r: Reconciled) {
        *self
            .hidden
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = r.hidden;
        *self
            .names
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = r.names;
        lock(&self.guards).clear();
        *lock(&self.dropped) = r.dropped;
    }
}

impl super::Policy {
    /// Whether registered folder `id` is served in part: no phone reaches
    /// it by its own id.
    #[must_use]
    pub fn hides(&self, id: &str) -> bool {
        self.parts
            .hidden
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .contains(id)
    }

    /// A share of a folder served in part, by its name on the phone.
    #[must_use]
    pub fn part_name(&self, share: &str) -> Option<String> {
        self.parts
            .names
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(share)
            .cloned()
    }

    /// The chosen folders the last start left out (folder, chosen).
    #[must_use]
    pub fn dropped_parts(&self) -> Vec<(String, String)> {
        lock(&self.parts.dropped).clone()
    }

    /// What a phone is kept from under `share`, a chosen folder of the
    /// folder at `vault`: the links in it, or in its attachments folder,
    /// that lead out of it. Looked for again after a few seconds; a folder
    /// that cannot be looked at is shut whole (fail closed).
    #[must_use]
    pub fn guard_for(&self, vault: &std::path::Path, share: &Share) -> Arc<Guard> {
        let mut guards = lock(&self.parts.guards);
        if let Some((at, g)) = guards.get(&share.id)
            && at.elapsed() < LINKS_FRESH
        {
            return Arc::clone(g);
        }
        let guard = Arc::new(Guard {
            escapes: escapes(vault, share),
        });
        guards.insert(share.id.clone(), (Instant::now(), Arc::clone(&guard)));
        guard
    }
}

/// The paths under the chosen folder, and under its attachments folder,
/// that are symbolic links to somewhere outside the folder they are in.
fn escapes(vault: &std::path::Path, share: &Share) -> Vec<String> {
    let mut out = Vec::new();
    for within in std::iter::once(&share.path).chain(share.attachments.as_ref()) {
        match verso_fs::escaping_links(vault, within) {
            Ok(found) => out.extend(found),
            // Not looked at, so not trusted: all of it is left out.
            Err(_) => out.push(within.clone()),
        }
    }
    out
}

/// The chosen sub-folders of a folder, as they are kept: each a folder
/// inside it by the rules of a share's path, none inside another, sorted.
/// An empty list is the whole folder.
pub fn clean(parts: &[String]) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::new();
    for p in parts {
        let p = p.trim_end_matches('/');
        if p.contains(':') || crate::shares::share_path(p).is_err() {
            return Err(format!("not a folder inside the served folder: {p}"));
        }
        out.push(p.to_owned());
    }
    out.sort();
    out.dedup();
    // A folder covers what is inside it: the child of a chosen folder is
    // already served with it.
    let all = out.clone();
    out.retain(|p| !all.iter().any(|q| q != p && crate::db::covers(q, p)));
    Ok(out)
}

/// What the registry holds after a start: the ids no phone reaches, the
/// names of the shares and the chosen folders left out.
pub struct Reconciled {
    pub hidden: HashSet<String>,
    pub names: HashMap<String, String>,
    pub dropped: Vec<(String, String)>,
}

/// One served folder: the folders chosen inside it (none: all of it).
pub struct Served {
    pub path: PathBuf,
    pub parts: Vec<String>,
    /// The chosen folders that exist now.
    pub present: Vec<String>,
    /// The vault's attachments folder that goes with them, read-only.
    pub attachments: Option<String>,
}

/// The folders served, by the name each is given, with what is chosen
/// inside each and which of those chosen folders are on the disk now. `Err`
/// when a folder served in part has none of its chosen folders left: it is
/// never served whole in their place.
pub fn plan(
    folders: &HashMap<String, PathBuf>,
    chosen: &BTreeMap<String, Vec<String>>,
) -> Result<BTreeMap<String, Served>, String> {
    let mut out = BTreeMap::new();
    for (name, path) in folders {
        let parts = clean(
            chosen
                .get(path.to_string_lossy().as_ref())
                .map_or(&[][..], Vec::as_slice),
        )?;
        let (present, attachments) = if parts.is_empty() {
            (Vec::new(), None)
        } else {
            let there = verso_core::subfolders_of(path).map_err(|e| e.to_string())?;
            let present: Vec<String> = parts
                .iter()
                .filter(|p| there.contains(p))
                .cloned()
                .collect();
            if present.is_empty() {
                return Err(format!(
                    "{name}: none of the folders chosen inside it is there any more: choose again, or serve all of it"
                ));
            }
            // The vault's own setting, read now, and only if the folder is there.
            let attachments =
                verso_core::served_attachments(path, &parts).filter(|a| there.contains(a));
            (present, attachments)
        };
        out.insert(
            name.clone(),
            Served {
                path: path.clone(),
                parts,
                present,
                attachments,
            },
        );
    }
    Ok(out)
}

/// The database's folders and shares follow what is ticked and chosen: a
/// folder no longer served is forgotten (its shares and grants go with it),
/// a whole one is the owner's, one in part is the holder's with a share per
/// chosen folder given to the owner at the most a phone may have, a share
/// no longer chosen is deleted, and every share's attachments folder is set
/// again from the vault's settings — or cleared.
pub fn reconcile(
    db: &Db,
    owner: &str,
    served: &BTreeMap<String, Served>,
) -> Result<Reconciled, String> {
    for f in db.folders()? {
        if !served.contains_key(&f.dir) {
            db.forget_folder(&f.id)?;
        }
    }
    // The holder is made only when a folder is served in part.
    let mut holder: Option<String> = None;
    let mut hidden = HashSet::new();
    let mut names = HashMap::new();
    let mut dropped = Vec::new();
    // The names on the phone's list are one set: the whole folders' and
    // the parts'.
    let mut taken: HashSet<String> = served
        .iter()
        .filter(|(_, s)| s.parts.is_empty())
        .map(|(n, _)| n.clone())
        .collect();
    for (name, s) in served {
        let want = if s.parts.is_empty() {
            owner.to_owned()
        } else {
            match &holder {
                Some(h) => h.clone(),
                None => {
                    let h = db.vault_holder()?.id;
                    holder = Some(h.clone());
                    h
                }
            }
        };
        let mut folder = db.folder_by_dir(name)?;
        // A folder that changed between whole and in part is registered
        // again, under the owner it should have.
        if let Some(f) = &folder
            && !db
                .members(&f.id)?
                .iter()
                .any(|(a, r)| a.id == want && *r == Role::Owner)
        {
            db.forget_folder(&f.id)?;
            folder = None;
        }
        let folder = match folder {
            Some(f) => f,
            None => db.create_folder(name, &want)?,
        };
        if s.parts.is_empty() {
            for share in db.shares_of(&folder.id)? {
                db.delete_share(&share.id)?;
            }
            continue;
        }
        hidden.insert(folder.id.clone());
        for share in db.shares_of(&folder.id)? {
            if !s.present.contains(&share.path) {
                db.delete_share(&share.id)?;
            }
        }
        for part in &s.parts {
            if !s.present.contains(part) {
                dropped.push((s.path.to_string_lossy().into_owned(), part.clone()));
            }
        }
        for part in &s.present {
            let share = db.make_share(&folder.id, part)?;
            db.grant_share(&share.id, owner, Role::Editor)?;
            // Replaced at every start: never a value kept from before.
            db.set_share_attachments(&share.id, s.attachments.as_deref())?;
            let base = crate::scope::last(part).to_owned();
            let mut shown = base.clone();
            let mut n = 2;
            while taken.contains(&shown) {
                shown = format!("{base} ({n})");
                n += 1;
            }
            taken.insert(shown.clone());
            names.insert(share.id, shown);
        }
    }
    Ok(Reconciled {
        hidden,
        names,
        dropped,
    })
}

impl super::LocalServer {
    /// Choose which folders inside the served folder at `folder` (its path,
    /// as the host knows it) are served; none chosen serves all of it. Only
    /// while serving is off, like ticking: what a phone may reach does not
    /// change under it (item 1). The check and the write are made holding
    /// the same lock.
    pub fn set_parts(&self, folder: &str, chosen: &[String]) -> Result<Vec<String>, String> {
        let running = lock(&self.shared.inner);
        if running.is_some() {
            return Err("turn serving off to change which folders are served".to_owned());
        }
        let chosen = clean(chosen)?;
        let db = self.open_db()?;
        let mut settings = super::read_settings(&db);
        if !settings.folders.iter().any(|f| f == folder) {
            return Err("tick the folder first".to_owned());
        }
        if chosen.is_empty() {
            settings.parts.remove(folder);
        } else {
            settings.parts.insert(folder.to_owned(), chosen.clone());
        }
        let text = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
        db.set_setting(super::SETTINGS, &text)?;
        drop(running);
        Ok(chosen)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| (*s).to_owned()).collect()
    }

    /// A chosen folder is a folder inside the served one by the rules of a
    /// share's path, and one inside another chosen folder is served with it.
    #[test]
    fn what_is_chosen_is_kept_clean() {
        assert_eq!(
            clean(&v(&["Projetos/A", "Diario", "Projetos", "Diario/"])).unwrap(),
            ["Diario", "Projetos"]
        );
        // `Proj` is not above `Projetos`: the prefix is of whole parts.
        assert_eq!(
            clean(&v(&["Proj", "Projetos"])).unwrap(),
            ["Proj", "Projetos"]
        );
        for bad in [
            "",
            "..",
            "../x",
            "/abs",
            "a/../b",
            ".obsidian",
            "a/.git",
            "C:x",
            "a\\b",
            "a//b",
        ] {
            assert!(clean(&v(&[bad])).is_err(), "{bad:?} was accepted");
        }
        assert!(clean(&[]).unwrap().is_empty());
    }
}
