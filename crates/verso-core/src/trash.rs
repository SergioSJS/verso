// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's bin, seen, restored and expiring (ADR 0080). The bytes
//! stay in `.trash/` at the root (item 1, `verso-fs`); what is known of
//! each entry — where it was, when and by whom it was deleted — is a
//! record kept outside the folder (item 2): the index's tables on the
//! computer ([`TrashBook`] for [`Index`]), the server's database on a
//! server. The record is a cache rebuilt from a walk of `.trash/`: an
//! entry nobody recorded is listed with its date unknown, and its clock
//! starts when it was first seen — nothing already in a bin is deleted
//! when this ships.
//!
//! An entry is the unit a deletion made: a file, or a folder trashed whole
//! (a subtree). [`reconcile`] groups the walk into entries by the records;
//! what no record covers is grouped by the shallowest name under `.trash/`
//! that holds no recorded entry. [`due`] says which entries go — past the
//! retention, then the oldest while the bin alone is larger than the
//! folder's quota (item 8) — and [`sweep`] removes them, only under
//! `.trash/`, a symlink removed and never followed (item 3).

use std::collections::{BTreeMap, HashSet};
use std::path::Path;

use verso_fs::trashbin::{self, Binned};
pub use verso_index::TrashRow as TrashRecord;

use super::*;

/// How long a deleted file is kept when nothing else is said (item 3,
/// decided 2026-10-10).
pub const DEFAULT_DAYS: u32 = 30;

/// A day, in seconds.
pub const DAY: i64 = 86_400;

/// The prefix of a record's `by` for a deletion sync carried out on this
/// computer (item 9): `sync:` and the server's name.
pub const BY_SYNC: &str = "sync:";

/// Now, in seconds since the Unix epoch: the bin's clock.
#[must_use]
pub fn now() -> i64 {
    seconds_since_epoch(std::time::SystemTime::now())
}

/// Where the records of a folder's bin are kept.
pub trait TrashBook {
    fn records(&mut self) -> Result<Vec<TrashRecord>, String>;
    fn put(&mut self, record: &TrashRecord) -> Result<(), String>;
    fn forget(&mut self, path: &str) -> Result<(), String>;
}

impl TrashBook for Index {
    fn records(&mut self) -> Result<Vec<TrashRecord>, String> {
        self.trash_rows().map_err(|e| e.to_string())
    }
    fn put(&mut self, record: &TrashRecord) -> Result<(), String> {
        self.put_trash_row(record).map_err(|e| e.to_string())
    }
    fn forget(&mut self, path: &str) -> Result<(), String> {
        self.forget_trash_row(path).map_err(|e| e.to_string())
    }
}

/// One entry of the bin: its record, whether it is a folder, and the bytes
/// it holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrashItem {
    pub record: TrashRecord,
    pub dir: bool,
    pub size: u64,
}

impl TrashItem {
    /// When its clock started: the deletion, or when it was first seen.
    #[must_use]
    pub fn since(&self) -> i64 {
        self.record.deleted.unwrap_or(self.record.seen)
    }

    /// When it expires with `days` of retention; `None` for 0 (forever).
    #[must_use]
    pub fn expires(&self, days: u32) -> Option<i64> {
        (days > 0).then(|| self.since().saturating_add(i64::from(days) * DAY))
    }
}

/// A new record for something just put in the bin at `path`, from
/// `original`, now.
#[must_use]
pub fn record(
    path: &str,
    original: &str,
    now: i64,
    by: Option<&str>,
    replaced: bool,
) -> TrashRecord {
    TrashRecord {
        path: path.to_owned(),
        original: original.to_owned(),
        deleted: Some(now),
        seen: now,
        by: by.map(str::to_owned),
        replaced,
    }
}

/// Every proper ancestor of `path` inside the bin (`.trash/a/b/c` gives
/// `.trash/a` and `.trash/a/b`).
fn ancestors(path: &str) -> impl Iterator<Item = &str> {
    path.match_indices('/')
        .map(move |(at, _)| &path[..at])
        .filter(|p| p.len() > trashbin::BIN.len())
}

/// The entries of the bin from its walk and its records: a record whose
/// path is gone is forgotten, and what no record covers is recorded now,
/// its date unknown (item 2). Newest first.
pub fn reconcile(
    found: &[Binned],
    book: &mut dyn TrashBook,
    now: i64,
) -> Result<Vec<TrashItem>, String> {
    let on_disk: BTreeMap<&str, &Binned> = found.iter().map(|b| (b.path.as_str(), b)).collect();
    let mut records: BTreeMap<String, TrashRecord> = BTreeMap::new();
    for r in book.records()? {
        if on_disk.contains_key(r.path.as_str()) {
            records.insert(r.path.clone(), r);
        } else {
            book.forget(&r.path)?;
        }
    }
    // The folders that hold a recorded entry: entered, never an entry.
    let holding: HashSet<&str> = records.keys().flat_map(|p| ancestors(p)).collect();
    // Each walked path to the entry it belongs to.
    let mut owner: BTreeMap<String, (bool, u64)> = BTreeMap::new();
    for b in found {
        let mut entry = None;
        for at in ancestors(&b.path).chain(std::iter::once(b.path.as_str())) {
            if records.contains_key(at) {
                entry = Some(at);
                break;
            }
            if !holding.contains(at) {
                entry = Some(at);
                break;
            }
        }
        let Some(entry) = entry else { continue };
        let is_dir = on_disk.get(entry).is_some_and(|e| e.dir);
        let slot = owner.entry(entry.to_owned()).or_insert((is_dir, 0));
        slot.1 = slot.1.saturating_add(b.len);
    }
    let mut items = Vec::new();
    for (path, (dir, size)) in owner {
        let record = match records.remove(&path) {
            Some(r) => r,
            None => {
                // A folder with no file in it that no deletion recorded:
                // left to the sweep, which prunes it.
                let prefix = format!("{path}/");
                if dir && !found.iter().any(|b| !b.dir && b.path.starts_with(&prefix)) {
                    continue;
                }
                let r = TrashRecord {
                    original: path
                        .strip_prefix(&format!("{}/", trashbin::BIN))
                        .unwrap_or(&path)
                        .to_owned(),
                    path: path.clone(),
                    deleted: None,
                    seen: now,
                    by: None,
                    replaced: false,
                };
                book.put(&r)?;
                r
            }
        };
        items.push(TrashItem { record, dir, size });
    }
    items.sort_by(|a, b| {
        b.since()
            .cmp(&a.since())
            .then(a.record.path.cmp(&b.record.path))
    });
    Ok(items)
}

/// Why an entry goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Why {
    /// Past the retention.
    Expired,
    /// Early: the bin alone was larger than the folder's quota (item 8).
    OverQuota,
    /// Early: the bin alone was larger than the server's size cap for a bin
    /// (ADR 0080, decided 2026-10-31).
    OverCap,
}

/// The entries that go now: each past `days` (0 keeps them forever), then,
/// with a quota or a size `cap`, the oldest of the rest while the bin alone
/// is larger than the smaller of the two (the quota wins a tie). The size
/// cap never removes an entry younger than a day: it counts, and waits.
#[must_use]
pub fn due(
    items: &[TrashItem],
    now: i64,
    days: u32,
    quota: Option<u64>,
    cap: Option<u64>,
) -> Vec<(String, Why)> {
    let mut out = Vec::new();
    let mut kept: Vec<&TrashItem> = Vec::new();
    for item in items {
        match item.expires(days) {
            Some(at) if at <= now => out.push((item.record.path.clone(), Why::Expired)),
            _ => kept.push(item),
        }
    }
    let bound = match (quota, cap) {
        (Some(q), Some(c)) if c < q => Some((c, Why::OverCap)),
        (Some(q), _) => Some((q, Why::OverQuota)),
        (None, Some(c)) => Some((c, Why::OverCap)),
        (None, None) => None,
    };
    if let Some((limit, why)) = bound {
        kept.sort_by(|a, b| {
            a.since()
                .cmp(&b.since())
                .then(a.record.path.cmp(&b.record.path))
        });
        let mut total: u64 = kept.iter().map(|i| i.size).sum();
        for item in kept {
            if total <= limit {
                break;
            }
            // The server's size cap counts an entry younger than a day but
            // never removes it (ADR 0080, decided 2026-11-01): it waits.
            if why == Why::OverCap && now - item.since() < DAY {
                continue;
            }
            total = total.saturating_sub(item.size);
            out.push((item.record.path.clone(), why));
        }
    }
    out
}

/// Whether the bin alone is larger than `quota`: its oldest entries
/// expire early (item 8, said on the page).
#[must_use]
pub fn over_quota(items: &[TrashItem], quota: Option<u64>) -> bool {
    quota.is_some_and(|q| items.iter().map(|i| i.size).sum::<u64>() > q)
}

/// What a sweep did.
#[derive(Debug, Default)]
pub struct Swept {
    pub removed: Vec<(TrashItem, Why)>,
    /// An entry that could not be removed, with why.
    pub failed: Vec<(String, String)>,
    /// What the bin holds after the sweep: entries and bytes.
    pub count: usize,
    pub size: u64,
}

/// Sweep the bin of the folder at `folder`: what [`due`] names is removed
/// for good and its record forgotten; the empty folders left in the bin
/// go too. What fails is reported, not raised: the next sweep tries again.
pub fn sweep(
    folder: &Path,
    book: &mut dyn TrashBook,
    now: i64,
    days: u32,
    quota: Option<u64>,
    cap: Option<u64>,
) -> Result<Swept, String> {
    let found = trashbin::walk(folder).map_err(|e| e.to_string())?;
    let items = reconcile(&found, book, now)?;
    let mut swept = Swept::default();
    let mut gone: HashSet<String> = HashSet::new();
    for (path, why) in due(&items, now, days, quota, cap) {
        match purge_found(folder, &path, &found) {
            Ok(()) => {
                book.forget(&path)?;
                if let Some(item) = items.iter().find(|i| i.record.path == path) {
                    swept.removed.push((item.clone(), why));
                }
                gone.insert(path);
            }
            Err(e) => swept.failed.push((path, e.to_string())),
        }
    }
    for item in items.iter().filter(|i| !gone.contains(&i.record.path)) {
        swept.count += 1;
        swept.size = swept.size.saturating_add(item.size);
    }
    // Folders in the bin with nothing in them, deepest first: what a
    // restore or another program left. Removed only if still empty: a file
    // may have landed in one since the walk (`trashbin::remove_empty`).
    let mut empty: Vec<&Binned> = found
        .iter()
        .filter(|b| {
            b.dir
                && !found
                    .iter()
                    .any(|o| o.path.starts_with(&format!("{}/", b.path)))
        })
        .collect();
    empty.sort_by_key(|b| std::cmp::Reverse(b.path.len()));
    for dir in empty {
        if !items.iter().any(|i| i.record.path == dir.path) {
            let _ = trashbin::remove_empty(folder, Path::new(&dir.path));
        }
    }
    Ok(swept)
}

/// Remove the entry of the bin at `path` with what the sweep's walk found
/// in it, never more: each file and link the walk listed under it, then its
/// folders while they are empty, deepest first. A file put in it since the
/// walk — a deletion or a version a write replaced, landing under the path
/// of a folder deleted long ago — stays, in the bin, an entry of its own at
/// the next sweep (`remove_dir_all` took it with the folder).
fn purge_found(folder: &Path, path: &str, found: &[Binned]) -> Result<(), WriteError> {
    let under = format!("{path}/");
    let mut mine: Vec<&Binned> = found
        .iter()
        .filter(|b| b.path == path || b.path.starts_with(&under))
        .collect();
    mine.sort_by_key(|b| std::cmp::Reverse(b.path.len()));
    for b in mine {
        if b.dir {
            trashbin::remove_empty(folder, Path::new(&b.path))?;
        } else {
            trashbin::purge(folder, Path::new(&b.path))?;
        }
    }
    Ok(())
}

/// Every entry of the bin of the folder at `folder`, from a walk and the
/// records (a folder no window has open: the console's page).
pub fn items_at(
    folder: &Path,
    book: &mut dyn TrashBook,
    now: i64,
) -> Result<Vec<TrashItem>, String> {
    let found = trashbin::walk(folder).map_err(|e| e.to_string())?;
    reconcile(&found, book, now)
}

/// Empty the bin of the folder at `folder` (the console's "Empty the
/// trash", item 4): every entry removed for good, its record forgotten.
/// What went, and what could not.
pub fn empty_at(folder: &Path, book: &mut dyn TrashBook, now: i64) -> Result<Swept, String> {
    let items = items_at(folder, book, now)?;
    let mut swept = Swept::default();
    for item in items {
        match trashbin::purge(folder, Path::new(&item.record.path)) {
            Ok(()) => {
                book.forget(&item.record.path)?;
                swept.removed.push((item, Why::Expired));
            }
            Err(e) => swept.failed.push((item.record.path.clone(), e.to_string())),
        }
    }
    Ok(swept)
}

/// The name a restored entry takes beside its original path when that is
/// taken (item 5): `<stem> (restored <date>).<ext>`, in the person's
/// language; a folder has no extension; `n` past 1 is added before the
/// parenthesis closes.
#[must_use]
pub fn beside_name(original: &str, dir: bool, today: &str, pt: bool, n: usize) -> String {
    let (parent, name) = original
        .rsplit_once('/')
        .map_or(("", original), |(p, n)| (p, n));
    let (stem, ext) = match name.rfind('.') {
        Some(at) if at > 0 && !dir => (&name[..at], &name[at..]),
        _ => (name, ""),
    };
    let word = if pt { "restaurado" } else { "restored" };
    let more = if n > 1 {
        format!(" {n}")
    } else {
        String::new()
    };
    let file = format!("{stem} ({word} {today}{more}){ext}");
    if parent.is_empty() {
        file
    } else {
        format!("{parent}/{file}")
    }
}

/// A date as `yyyy-mm-dd`, digits and dashes only: what a caller may pass
/// as today's.
fn is_date(s: &str) -> bool {
    s.len() == 10
        && s.bytes().enumerate().all(|(i, b)| {
            if i == 4 || i == 7 {
                b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
}

/// Where a restore put an entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Restored {
    pub path: String,
    /// The original path was taken: the entry went beside it.
    pub beside: bool,
    pub warnings: Vec<String>,
}

impl Workspace {
    /// What `.trash/` holds now, not following a symlink.
    pub fn trash_found(&self) -> Result<Vec<Binned>, CoreError> {
        self.root.trash_walk().map_err(CoreError::Folder)
    }

    /// The records of this folder's bin, in its index (the computer's
    /// side of item 2).
    pub fn trash_book(&mut self) -> &mut dyn TrashBook {
        &mut self.index
    }

    /// The days this local folder keeps deleted files: its own setting, or
    /// [`DEFAULT_DAYS`]; 0 is forever (item 3).
    pub fn trash_days(&self) -> u32 {
        self.index
            .trash_days()
            .ok()
            .flatten()
            .unwrap_or(DEFAULT_DAYS)
    }

    pub fn set_trash_days(&mut self, days: u32) -> Result<(), CoreError> {
        self.index.set_trash_days(days).map_err(CoreError::Index)
    }

    /// Put the entry `path` of `.trash/` back at `original`, or beside it
    /// as [`beside_name`] names it when something stands there; `today` is
    /// the person's date (`yyyy-mm-dd`), `pt` their language. The index
    /// learns what came back. Nothing is rewritten: a move inside the
    /// folder (item 5).
    pub fn restore_from_trash(
        &mut self,
        path: &str,
        original: &str,
        dir: bool,
        today: &str,
        pt: bool,
    ) -> Result<Restored, CoreError> {
        if !is_date(today) {
            return Err(CoreError::Confined(ConfinementError::Empty));
        }
        let wanted = self.entry_key(original)?;
        // The folders it goes back into, as a create would make them: a
        // parent refused (a name not every OS keeps, or the case twin of a
        // folder there) is refused with its reason — a name beside it would
        // be under the same parent.
        if let Some((parent, _)) = wanted.rsplit_once('/') {
            self.root
                .check_new_folder(Path::new(parent))
                .map_err(CoreError::Write)?;
        }
        let mut target = wanted.clone();
        let mut n = 1;
        let report = loop {
            match self
                .root
                .restore_from_trash(Path::new(path), Path::new(&target))
            {
                Ok(report) => break report,
                // Taken, or taken on a Mac or Windows by a name that differs
                // only in case (spec Q8): beside it (item 5).
                Err(WriteError::Exists | WriteError::Confined(ConfinementError::CaseTwin))
                    if n < 100 =>
                {
                    target = self.entry_key(&beside_name(&wanted, dir, today, pt, n))?;
                    n += 1;
                }
                Err(e) => return Err(CoreError::Write(e)),
            }
        };
        let mut warnings = report.warnings();
        if dir {
            self.dirs.insert(target.clone());
            self.refresh(&mut warnings);
        } else {
            let changes = Changes {
                paths: vec![std::path::PathBuf::from(&target)],
                rescan: false,
            };
            if let Err(e) = self.index_changes(&changes, |_| {}) {
                warnings.push(format!("the index could not read {target}: {e}"));
            }
        }
        Ok(Restored {
            beside: target != wanted,
            path: target,
            warnings,
        })
    }

    /// Remove the entry `path` of `.trash/` for good (item 7).
    pub fn purge_trash(&mut self, path: &str) -> Result<(), CoreError> {
        self.root
            .purge_trash(Path::new(path))
            .map_err(CoreError::Write)
    }

    /// Copy the file at `path` into `.trash/` before a write replaces it
    /// (item 12); where the copy went.
    pub fn keep_replaced(&mut self, path: &str) -> Result<String, CoreError> {
        let key = self.entry_key(path)?;
        let kept = self
            .root
            .keep_in_trash(Path::new(&key))
            .map_err(CoreError::Write)?;
        Ok(kept.to_string_lossy().into_owned())
    }

    /// Sweep this local folder's bin with its own retention and records
    /// (item 3, on the computer), and note when.
    pub fn sweep_trash(&mut self, now: i64) -> Result<Swept, CoreError> {
        let days = self.trash_days();
        let folder = self.folder.clone();
        let swept = sweep(&folder, &mut self.index, now, days, None, None)
            .map_err(|e| CoreError::Folder(std::io::Error::other(e)))?;
        let _ = self.index.set_trash_swept(now);
        Ok(swept)
    }

    /// When this folder's bin was last swept here.
    #[must_use]
    pub fn trash_swept(&self) -> Option<i64> {
        self.index.trash_swept().ok().flatten()
    }
}
