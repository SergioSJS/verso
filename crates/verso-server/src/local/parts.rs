// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder served **in part** (ADR 0096 item 3, amended 2026-10-16): the
//! person ticks a folder and chooses only some of the folders inside it.
//! Each chosen folder reaches the phone as a folder of its own, by the
//! confinement of a share (ADR 0081 items 1, 2 and 11): the folder is
//! registered, because a share needs a folder to belong to, but it is
//! held by an account that is not the phones' ([`crate::db::VAULT_HOLDER`]),
//! so its own id opens nothing for a phone; the phone's owner account is
//! given one share per chosen folder, and a phone opens those ids. The
//! attachments the chosen folder's notes embed from outside it go along as
//! the share's attachments folder, read-only (item 11), found when the
//! folder is first opened ([`outside_attachments`]).

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

use verso_service::lock;

use crate::db::{Db, Role};

/// What the policy keeps of the folders served in part.
#[derive(Default)]
pub struct Parts {
    /// The ids of the registered folders no phone may reach: those served
    /// in part. A second lock on the door beside the holder's ownership.
    hidden: RwLock<HashSet<String>>,
    /// Each share's name as a phone lists it: the folder's own, made unique
    /// against the other folders served (`Projetos`, `Projetos (2)`).
    names: RwLock<HashMap<String, String>>,
    /// The shares whose attachments folder was looked for in this run.
    looked: Mutex<HashSet<String>>,
}

impl Parts {
    pub fn set(&self, hidden: HashSet<String>, names: HashMap<String, String>) {
        *self
            .hidden
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = hidden;
        *self
            .names
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = names;
        lock(&self.looked).clear();
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

    /// Whether `share` is one of this run's parts whose attachments folder
    /// has not been looked for yet.
    #[must_use]
    pub fn needs_look(&self, share: &str) -> bool {
        self.part_name(share).is_some() && !lock(&self.parts.looked).contains(share)
    }
}

/// The chosen sub-folders of a folder, as they are kept: each a folder
/// inside it by the rules of a share's path (relative, no `..`, no hidden
/// part), none inside another, sorted. An empty list is the whole folder.
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

/// What the registry holds after a start: the ids no phone reaches, and
/// the names of the shares.
pub struct Reconciled {
    pub hidden: HashSet<String>,
    pub names: HashMap<String, String>,
}

/// One served folder: the name a phone gives it, where it is, and the
/// folders chosen inside it (none: all of it).
pub struct Served {
    pub parts: Vec<String>,
    /// The chosen folders that exist now.
    pub present: Vec<String>,
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
        let present = if parts.is_empty() {
            Vec::new()
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
            present
        };
        out.insert(
            name.clone(),
            Served {
                parts,
                present,
            },
        );
    }
    Ok(out)
}

/// The database's folders and shares follow what is ticked and chosen: a
/// folder no longer served is forgotten (its shares and grants go with it),
/// a whole one is the owner's, one in part is the holder's with a share per
/// chosen folder given to the owner at the most a phone may have, and a
/// share no longer chosen is deleted.
pub fn reconcile(
    db: &Db,
    owner: &str,
    served: &BTreeMap<String, Served>,
) -> Result<Reconciled, String> {
    let holder = db.vault_holder()?.id;
    for f in db.folders()? {
        if !served.contains_key(&f.dir) {
            db.forget_folder(&f.id)?;
        }
    }
    let mut hidden = HashSet::new();
    let mut names = HashMap::new();
    // The names on the phone's list are one set: the whole folders' and
    // the parts'.
    let mut taken: HashSet<String> = served
        .iter()
        .filter(|(_, s)| s.parts.is_empty())
        .map(|(n, _)| n.clone())
        .collect();
    for (name, s) in served {
        let want = if s.parts.is_empty() { owner } else { &holder };
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
            None => db.create_folder(name, want)?,
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
        for part in &s.present {
            let share = db.make_share(&folder.id, part)?;
            db.grant_share(&share.id, owner, Role::Editor)?;
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
    Ok(Reconciled { hidden, names })
}

/// The first time a folder chosen inside a served one is opened in a run,
/// its attachments folder is looked for and, if the notes embed from one
/// outside it, shown with the folder read-only (ADR 0081 item 11, as the
/// share dialog offers it): what the notes show of a picture kept in the
/// vault's own attachments folder would otherwise be "not in what was
/// shared with you". Nothing is looked for in an index that knows none of
/// the folder's notes yet (a first run still indexing): the next open
/// looks again.
pub async fn find_attachments(
    server: &std::sync::Arc<crate::state::Server>,
    client: &str,
    scope: &mut crate::scope::Scope,
) {
    let Some(policy) = server.local.clone() else {
        return;
    };
    if !policy.needs_look(&scope.share) {
        return;
    }
    let Ok(Some(share)) = server.db.share(&scope.share) else {
        return;
    };
    if share.attachments.is_some() {
        lock(&policy.parts.looked).insert(scope.share.clone());
        return;
    }
    let (s, c, part) = (std::sync::Arc::clone(server), client.to_owned(), share.path);
    let part_for = part.clone();
    let found = tokio::task::spawn_blocking(move || {
        s.service.with(&c, |ws| {
            let inside = format!("{part_for}/");
            if !ws.notes()?.iter().any(|n| n.starts_with(&inside)) {
                return Ok(None);
            }
            let found = outside_attachments(ws, &part_for)?;
            // Shown at the folder's root under its name: not over a folder
            // of the part that has it (item 11).
            let clash = |a: &str| {
                ws.folders()
                    .contains(&format!("{part_for}/{}", crate::scope::last(a)))
            };
            Ok(Some(found.filter(|a| !clash(a))))
        })
    })
    .await;
    let Ok(Ok(Some(found))) = found else {
        return;
    };
    lock(&policy.parts.looked).insert(scope.share.clone());
    if let Some(a) = found {
        if let Err(e) = server.db.set_share_attachments(&scope.share, Some(&a)) {
            crate::log::error(&format!("keeping a share's attachments folder: {e}"));
            return;
        }
        scope.mount = Some((crate::scope::last(&a).to_owned(), a));
        crate::log::info(&format!(
            "a served folder shows its attachments folder, read-only: {}",
            scope.name
        ));
    }
}

/// The attachments folder the notes under `part` embed from outside it:
/// the folder most of those embeds are in, as the share dialog offers it
/// (ADR 0081 item 11) — none when they are at the folder's root, where
/// there is no folder to add, or when nothing is embedded from outside, or
/// when it would cover or lie inside the part.
pub fn outside_attachments(
    ws: &mut verso_core::Workspace,
    part: &str,
) -> Result<Option<String>, verso_service::OpError> {
    let inside = format!("{part}/");
    let notes: Vec<String> = ws
        .notes()?
        .into_iter()
        .filter(|n| n.starts_with(&inside))
        .take(300)
        .collect();
    let mut dirs: BTreeMap<String, usize> = BTreeMap::new();
    for note in notes {
        for l in verso_service::ops::links(ws, note.clone())? {
            if !l.embed {
                continue;
            }
            // A note's embed is resolved by the index; a picture's is left
            // to the rule for files (spec Q12).
            let to = match l.resolved {
                Some(to) => to,
                None => match ws.resolve_file(&note, &l.target) {
                    Some(to) => to,
                    None => continue,
                },
            };
            if to.to_lowercase().ends_with(".md") || to.starts_with(&inside) {
                continue;
            }
            let dir = to.rsplit_once('/').map_or("", |(d, _)| d);
            *dirs.entry(dir.to_owned()).or_default() += 1;
        }
    }
    let best = dirs.into_iter().max_by_key(|(_, n)| *n).map(|(d, _)| d);
    Ok(best.filter(|a| {
        !a.is_empty()
            && crate::shares::share_path(a).is_ok()
            && !crate::db::covers(a, part)
            && !crate::db::covers(part, a)
    }))
}

impl super::LocalServer {
    /// Choose which folders inside the served folder at `folder` (its path,
    /// as the host knows it) are served; none chosen serves all of it. Only
    /// while serving is off, like ticking: what a phone may reach does not
    /// change under it (item 1).
    pub fn set_parts(&self, folder: &str, chosen: &[String]) -> Result<Vec<String>, String> {
        if lock(&self.shared.inner).is_some() {
            return Err("turn serving off to change which folders are served".to_owned());
        }
        let chosen = clean(chosen)?;
        let mut settings = self.settings()?;
        if !settings.folders.iter().any(|f| f == folder) {
            return Err("tick the folder first".to_owned());
        }
        if chosen.is_empty() {
            settings.parts.remove(folder);
        } else {
            settings.parts.insert(folder.to_owned(), chosen.clone());
        }
        self.set_settings(&settings)?;
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
        for bad in ["", "..", "../x", "/abs", "a/../b", ".obsidian", "a/.git", "C:x", "a\\b", "a//b"] {
            assert!(clean(&v(&[bad])).is_err(), "{bad:?} was accepted");
        }
        assert!(clean(&[]).unwrap().is_empty());
    }
}
