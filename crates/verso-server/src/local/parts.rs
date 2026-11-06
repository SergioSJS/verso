// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder served **in part** (ADR 0096 item 2, amended 2026-10-16): the
//! person ticks a folder and chooses only some of the folders inside it.
//! Each chosen folder reaches **the owner's phones** as a folder of its
//! own, by the confinement of a share (ADR 0081 items 1, 2 and 11): the
//! owner account is given one share per chosen folder, and a phone opens
//! those ids; the folder's own id opens nothing for a phone (the hide
//! lock, [`super::Policy::hides`], judged in `crate::access::role`).
//!
//! **R1 (ADR 0117 D1, D2; built 2026-11-05).** The ticked folder itself is
//! registered as **the owner's**, whole or in part, as a UniVerso holds a
//! folder of its owner's: the owner's window sits at it and makes tables
//! and shares in any folder inside it, and a player reaches a subfolder
//! only by a share given to them or a table rooted there — no rule of the
//! app's own. The chosen folders are the phones' alone: a share the owner
//! account is granted in one of the owner's own folders is a phone's part
//! (the owner needs no grant in a folder he owns), and nothing else is.
//! (Until R1 the folder served in part was held by another account,
//! `VAULT_HOLDER`, so its owner's window could not sit at it: the
//! maintainer ticked *Campanha Fractal* inside his vault and got nothing.)
//!
//! The attachments go along as the share's attachments folder, read-only
//! and **files only, never a note**: the one folder Obsidian's settings name
//! for the vault ([`verso_core::served_attachments`]), fixed at each start —
//! never found from text a phone can write. A symbolic link under a chosen
//! folder that leads out of it is left out whole ([`escapes`]).

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;
use std::sync::RwLock;

use verso_service::lock;

use crate::db::{Db, Role};

/// What the policy keeps of the folders served in part.
#[derive(Default)]
pub struct Parts {
    /// The ids of the registered folders no phone may reach by their own
    /// id: those served in part (their chosen folders are the phones').
    hidden: RwLock<HashSet<String>>,
    /// Each share's name as a phone lists it: the folder's own, made unique
    /// against the other folders served (`Projetos`, `Projetos (2)`).
    names: RwLock<HashMap<String, String>>,
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
    }
}

impl super::Policy {
    /// Whether registered folder `id` is served in part: no phone reaches
    /// it by its own id. The owner's window and the players are not judged
    /// by it (R1): the shares and tables say what a player reaches.
    #[must_use]
    pub fn hides(&self, id: &str) -> bool {
        self.parts
            .hidden
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .contains(id)
    }

    /// A phones' part — a share of a folder served in part that the owner
    /// is in — by its name on the phone.
    #[must_use]
    pub fn part_name(&self, share: &str) -> Option<String> {
        self.parts
            .names
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(share)
            .cloned()
    }
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
/// folder no longer served is forgotten (its shares and grants go with it);
/// every ticked folder is the owner's and keeps the shares the owner made
/// (R1); one in part gives the owner a share per chosen folder at the most
/// a phone may have — the phones' parts — and a part no longer chosen loses
/// the owner's grant (the share goes with it when no one else is in it); a
/// whole folder has no part left; every part's attachments folder is set
/// again from the vault's settings, or cleared.
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
        let mut folder = db.folder_by_dir(name)?;
        // A folder registered under another owner — before R1, one served
        // in part was the holder's — is registered again as the owner's.
        if let Some(f) = &folder
            && !db
                .members(&f.id)?
                .iter()
                .any(|(a, r)| a.id == owner && *r == Role::Owner)
        {
            db.forget_folder(&f.id)?;
            folder = None;
        }
        let folder = match folder {
            Some(f) => f,
            None => db.create_folder(name, owner)?,
        };
        // The phones' parts are the shares the owner is in: a part no
        // longer chosen (or every part, for a whole folder) loses the
        // owner's grant, and the share goes when no player is in it either.
        // The shares the owner made for players stay, as a UniVerso keeps
        // them (ADR 0081; ADR 0117 D9).
        for share in db.shares_of(&folder.id)? {
            let part = db.share_role(&share.id, owner)?.is_some();
            if part && !s.present.contains(&share.path) {
                db.revoke_share(&share.id, owner)?;
            }
        }
        if s.parts.is_empty() {
            continue;
        }
        hidden.insert(folder.id.clone());
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

const DROPPED: &str = "local.dropped";

/// The chosen folders the last start left out for not being on the disk:
/// (the folder's path as the host knows it, the chosen folder). Kept until
/// the choice changes, so that Settings can say it while serving is off and
/// the person can act.
pub fn read_dropped(db: &Db) -> Vec<(String, String)> {
    db.setting(DROPPED)
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn write_dropped(db: &Db, dropped: &[(String, String)]) -> Result<(), String> {
    let text = serde_json::to_string(dropped).map_err(|e| e.to_string())?;
    db.set_setting(DROPPED, &text)
}

impl super::LocalServer {
    /// The list of left-out folders is forgotten: the choice changed.
    pub fn forget_dropped(&self) -> Result<(), String> {
        self.with_db(|db| write_dropped(db, &[]))
    }

    /// Serve all of the folder at `folder` again, with nothing chosen inside
    /// it: the explicit way to the whole folder. Only while serving is off.
    pub fn set_whole(&self, folder: &str) -> Result<(), String> {
        let running = lock(&self.shared.inner);
        if running.is_some() {
            return Err("turn serving off to change which folders are served".to_owned());
        }
        let db = self.open_db()?;
        let mut settings = super::read_settings(&db);
        if !settings.folders.iter().any(|f| f == folder) {
            return Err("tick the folder first".to_owned());
        }
        settings.parts.remove(folder);
        let text = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
        db.set_setting(super::SETTINGS, &text)?;
        write_dropped(&db, &[])?;
        drop(running);
        Ok(())
    }

    /// Choose which folders inside the served folder at `folder` (its path,
    /// as the host knows it) are served. **None chosen stops serving the
    /// folder** — it is unticked and its choice forgotten (the maintainer,
    /// 2026-10-16: "Para de servir o cofre"); the whole folder is
    /// [`set_whole`](Self::set_whole)'s. Only
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
        settings.parts.remove(folder);
        if chosen.is_empty() {
            settings.folders.retain(|f| f != folder);
        } else {
            settings.parts.insert(folder.to_owned(), chosen.clone());
        }
        let text = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
        db.set_setting(super::SETTINGS, &text)?;
        write_dropped(&db, &[])?;
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
