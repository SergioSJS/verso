// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's bin as the contract shows it (ADR 0080): listed, an entry
//! restored, removed now, the bin emptied. Written once for both hosts:
//! the desktop keeps the bin's records in the folder's index, the server
//! in its database — a host passes its book, or none for the index's —
//! and says what the person may do ([`Policy`]); who may do what is the
//! host's to check before it calls (item 7).

use verso_contract::{ContractError, ErrorKind, Restored, TrashEntry, TrashListing};
use verso_core::Workspace;
use verso_core::trash::{self, BY_SYNC, TrashBook, TrashItem, TrashRecord};

use crate::OpError;

/// The bin's commands, by name: a window on a server's folder sends them
/// to the server, which checks the role for each.
pub const COMMANDS: &[&str] = &[
    "trash_list",
    "trash_restore",
    "trash_delete",
    "trash_empty",
    "trash_set_days",
];

/// What the person may do with the bin, and the folder's limits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Policy {
    /// Days deleted files are kept; 0: for ever.
    pub days: u32,
    /// The most days the person may choose; none: anything.
    pub most: Option<u32>,
    pub can_set: bool,
    pub can_purge: bool,
    /// The folder's quota, in bytes.
    pub quota: Option<u64>,
}

impl Policy {
    /// A local folder: its own retention, everything allowed (item 7: on
    /// the computer the person is the owner).
    #[must_use]
    pub fn local(ws: &Workspace) -> Self {
        Self {
            days: ws.trash_days(),
            most: None,
            can_set: true,
            can_purge: true,
            quota: None,
        }
    }
}

/// The bin's records: the host's book, or the folder's index.
fn book<'a>(
    ws: &'a mut Workspace,
    own: &'a mut Option<&mut dyn TrashBook>,
) -> &'a mut dyn TrashBook {
    match own {
        Some(b) => &mut **b,
        None => ws.trash_book(),
    }
}

fn failed(e: String) -> OpError {
    OpError::Contract(crate::failed(e))
}

/// The entries of the bin, from a walk and the records.
pub fn items(
    ws: &mut Workspace,
    mut own: Option<&mut dyn TrashBook>,
) -> Result<Vec<TrashItem>, OpError> {
    let found = ws.trash_found()?;
    trash::reconcile(&found, book(ws, &mut own), trash::now()).map_err(failed)
}

fn entry(item: &TrashItem, days: u32) -> TrashEntry {
    let r = &item.record;
    let (by, sync) = match r.by.as_deref() {
        Some(b) if b.starts_with(BY_SYNC) => (Some(b[BY_SYNC.len()..].to_owned()), true),
        other => (other.map(str::to_owned), false),
    };
    TrashEntry {
        path: r.path.clone(),
        original: r.original.clone(),
        folder: item.dir,
        size: item.size as f64,
        deleted: item.since() as f64,
        known: r.deleted.is_some(),
        by,
        sync,
        replaced: r.replaced,
        expires: item.expires(days).map(|at| at as f64),
    }
}

/// The bin as its page shows it.
#[must_use]
pub fn listing(items: &[TrashItem], policy: Policy) -> TrashListing {
    TrashListing {
        entries: items.iter().map(|i| entry(i, policy.days)).collect(),
        size: items.iter().map(|i| i.size as f64).sum(),
        days: policy.days,
        most: policy.most,
        can_set: policy.can_set,
        can_purge: policy.can_purge,
        quota: policy.quota.map(|q| q as f64),
        early: trash::over_quota(items, policy.quota),
    }
}

/// List the bin.
pub fn list(
    ws: &mut Workspace,
    own: Option<&mut dyn TrashBook>,
    policy: Policy,
) -> Result<TrashListing, OpError> {
    Ok(listing(&items(ws, own)?, policy))
}

fn not_in_bin(path: &str) -> OpError {
    OpError::Contract(ContractError {
        kind: ErrorKind::NotFound,
        message: format!("nothing in the bin at {path}"),
    })
}

/// Put an entry of the bin back where it was, or beside it (item 5); its
/// record goes. Answers where it went and the entry restored.
pub fn restore(
    ws: &mut Workspace,
    mut own: Option<&mut dyn TrashBook>,
    path: &str,
    today: &str,
    lang: &str,
) -> Result<(Restored, TrashItem), OpError> {
    let found = ws.trash_found()?;
    let all = trash::reconcile(&found, book(ws, &mut own), trash::now()).map_err(failed)?;
    let item = all
        .into_iter()
        .find(|i| i.record.path == path)
        .ok_or_else(|| not_in_bin(path))?;
    let done = ws.restore_from_trash(
        path,
        &item.record.original,
        item.dir,
        today,
        lang.starts_with("pt"),
    )?;
    book(ws, &mut own).forget(path).map_err(failed)?;
    Ok((
        Restored {
            path: done.path,
            beside: done.beside,
            warnings: done.warnings,
        },
        item,
    ))
}

/// Remove entries of the bin for good (item 7: the owner's). Answers what
/// went.
pub fn delete(
    ws: &mut Workspace,
    mut own: Option<&mut dyn TrashBook>,
    paths: &[String],
) -> Result<Vec<TrashItem>, OpError> {
    let found = ws.trash_found()?;
    let all = trash::reconcile(&found, book(ws, &mut own), trash::now()).map_err(failed)?;
    let mut gone = Vec::new();
    for path in paths {
        let item = all
            .iter()
            .find(|i| i.record.path == *path)
            .ok_or_else(|| not_in_bin(path))?;
        ws.purge_trash(path)?;
        book(ws, &mut own).forget(path).map_err(failed)?;
        gone.push(item.clone());
    }
    Ok(gone)
}

/// Empty the bin (item 7: the owner's). Answers what went.
pub fn empty(
    ws: &mut Workspace,
    mut own: Option<&mut dyn TrashBook>,
) -> Result<Vec<TrashItem>, OpError> {
    let found = ws.trash_found()?;
    let all = trash::reconcile(&found, book(ws, &mut own), trash::now()).map_err(failed)?;
    for item in &all {
        ws.purge_trash(&item.record.path)?;
        book(ws, &mut own)
            .forget(&item.record.path)
            .map_err(failed)?;
    }
    Ok(all)
}

/// Record what a deletion just put in the bin (item 2): `by` none for
/// this computer.
pub fn deleted(
    ws: &mut Workspace,
    mut own: Option<&mut dyn TrashBook>,
    gone: &verso_core::Trashed,
    by: Option<&str>,
) -> Result<(), OpError> {
    let r: TrashRecord = trash::record(&gone.path, &gone.original, trash::now(), by, false);
    book(ws, &mut own).put(&r).map_err(failed)
}
