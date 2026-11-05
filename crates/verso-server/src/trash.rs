// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folders' bins on the server (ADR 0080). Who sees and does what
//! (item 7): those who may write in a folder see its bin and restore
//! anything; deleting an entry now, emptying the bin and shortening how
//! long it keeps deleted files are the owner's — and the admin's, from the
//! console, who alone lengthens it or turns expiry off (item 3). Every
//! deletion is recorded with who made it, and a version a device's write
//! replaced with the device (item 12), in the server's database (item 2).
//!
//! The sweep (item 3): every folder at start and once a day, and a folder
//! a few seconds after a deletion in it — what keeps its bin under its
//! quota (item 8) and its size current for the console. Each removal is a
//! line of the log and of the audit log.

use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde_json::{Value, json};
use verso_contract::{ContractError, ErrorKind};
use verso_core::trash::{self as bin, Swept, TrashBook, TrashRecord};
use verso_service::trash::{self, Policy};
use verso_service::{OpError, lock};

use crate::auth::Who;
use crate::db::{Audit, FolderBook, Role};
use crate::rpc::{arg, blocking, to_value};
use crate::state::Server;

/// How long after a deletion its folder's bin is swept: deletions in a
/// burst (a device deleting a folder's files) make one sweep.
const AFTER_DELETION: Duration = Duration::from_secs(5);

/// How often every folder is swept.
const DAILY: Duration = Duration::from_secs(24 * 60 * 60);

fn refused(message: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message: message.to_owned(),
    }
}

/// The days in effect: the owner's when shorter than the admin's (0 is
/// for ever).
#[must_use]
pub fn effective(admin: u32, owner: Option<u32>) -> u32 {
    match owner {
        Some(o) if o > 0 && (admin == 0 || o < admin) => o,
        _ => admin,
    }
}

/// The admin's days for `folder` (the server's default when not set) and
/// the days in effect.
pub fn days(server: &Server, folder: &str) -> Result<(u32, u32), String> {
    let (admin, owner) = server.db.trash_days(folder)?;
    let admin = admin.unwrap_or(server.config.trash_days);
    Ok((admin, effective(admin, owner)))
}

fn quota(server: &Server, folder: &str) -> Result<Option<u64>, String> {
    Ok(server.db.quota(folder)?.and_then(|q| u64::try_from(q).ok()))
}

/// What `role` may do with `folder`'s bin.
pub fn policy(server: &Server, folder: &str, role: Role) -> Result<Policy, String> {
    let (admin, days) = days(server, folder)?;
    Ok(Policy {
        days,
        most: (admin > 0).then_some(admin),
        can_set: role == Role::Owner,
        can_purge: role == Role::Owner,
        quota: quota(server, folder)?,
    })
}

/// A line of the audit log about `folder`'s bin.
fn audit(server: &Server, actor: Option<&str>, action: &str, subject: &str, folder: &str) {
    if let Err(e) = server.db.audit(&Audit {
        actor,
        action,
        subject: Some(subject),
        folder: Some(folder),
        address: None,
        ok: true,
    }) {
        crate::log::error(&format!("the audit log: {e}"));
    }
}

/// Who a deletion names: the account, and the device it came from.
#[must_use]
pub fn by_name(who: &Who, device: Option<&str>) -> String {
    match device {
        Some(d) => format!("{} ({d})", who.account.name),
        None => who.account.name.clone(),
    }
}

/// Whether `path` is in the folder's bin (`.trash/` at its root).
#[must_use]
pub fn in_bin(path: &str) -> bool {
    path == ".trash" || path.starts_with(".trash/")
}

/// Record what a deletion in `folder` put in the bin, and sweep the folder
/// soon (item 8).
pub fn deleted(server: &Arc<Server>, folder: &str, gone: &verso_core::Trashed, by: &str) {
    let r = bin::record(&gone.path, &gone.original, bin::now(), Some(by), false);
    if let Err(e) = server.db.put_trash_record(folder, &r) {
        crate::log::warn(&format!("the bin's record of {}: {e}", gone.path));
    }
    soon(server, folder);
}

/// The removal `name` asks for, into the bin: a note, an entry, or a data
/// file of `.verso/` named by its kind and id (ADR 0099 item 2, ADR 0098
/// item 2).
pub fn removal(
    service: &verso_service::Service,
    client: &str,
    name: &str,
    args: &Value,
) -> Result<verso_core::Trashed, ContractError> {
    if name == "remove_folder_data" {
        let kind: verso_contract::FolderDataKind = arg(args, "kind")?;
        let (id, revision): (String, String) = (arg(args, "id")?, arg(args, "revision")?);
        let kind = verso_service::ops::data_kind(kind);
        return service.with(
            client,
            |ws| Ok(ws.remove_folder_data(kind, &id, &revision)?),
        );
    }
    let path: String = arg(args, "path")?;
    service.with(client, |ws| {
        Ok(if name == "delete_note" {
            ws.delete_note(&path)?
        } else {
            ws.delete_entry(&path)?
        })
    })
}

/// Record a version a device's write replaced, kept at `kept` (item 12).
pub fn replaced(server: &Arc<Server>, folder: &str, kept: &str, original: &str, device: &str) {
    let r: TrashRecord = bin::record(kept, original, bin::now(), Some(device), true);
    if let Err(e) = server.db.put_trash_record(folder, &r) {
        crate::log::warn(&format!("the bin's record of {kept}: {e}"));
    }
    crate::campaign_cmds::version_kept(server, folder, original, kept);
    soon(server, folder);
}

/// The folders whose sweep is waiting.
fn waiting() -> &'static Mutex<HashSet<String>> {
    static WAITING: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    WAITING.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Sweep `folder` in [`AFTER_DELETION`], once for a burst.
fn soon(server: &Arc<Server>, folder: &str) {
    let Some(runtime) = server.runtime.get() else {
        return;
    };
    if !lock(waiting()).insert(folder.to_owned()) {
        return;
    }
    let s = Arc::clone(server);
    let f = folder.to_owned();
    runtime.spawn(async move {
        tokio::time::sleep(AFTER_DELETION).await;
        lock(waiting()).remove(&f);
        let _ = tokio::task::spawn_blocking(move || sweep(&s, &f)).await;
    });
}

/// Keep what the bin of `folder` holds, for the console's pages.
fn keep_size(server: &Server, folder: &str, count: usize, size: u64) {
    let value = json!({ "count": count, "size": size, "at": crate::db::now() });
    if let Err(e) = server
        .db
        .set_setting(&format!("trash:{folder}"), &value.to_string())
    {
        crate::log::error(&format!("keeping a bin's size: {e}"));
    }
}

/// What the bin of `folder` held when last seen: entries and bytes.
#[must_use]
pub fn kept_size(server: &Server, folder: &str) -> (u64, u64) {
    server
        .db
        .setting(&format!("trash:{folder}"))
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_str::<Value>(&v).ok())
        .map_or((0, 0), |v| {
            (
                v["count"].as_u64().unwrap_or(0),
                v["size"].as_u64().unwrap_or(0),
            )
        })
}

/// Sweep the bin of `folder` now (item 3): what is past its time goes,
/// then the oldest while the bin alone passes the quota (item 8).
///
/// Under the folder's window lock when a window has it open: a deletion,
/// a version a write replaced and a restore change the bin under that lock,
/// so none lands between the sweep's walk and what it removes or forgets
/// (a record written after the walk, of a file the walk did not see, was
/// forgotten; the night stress, 2026-11-04). With no window open, nothing
/// of the window's changes the bin, and what the sweep removes is only
/// what its walk found (`verso_core::trash::sweep`).
pub fn sweep(server: &Server, folder: &str) -> Option<Swept> {
    let key = lock(&server.keys)
        .iter()
        .find(|(_, f)| f.as_str() == folder)
        .map(|(k, _)| k.clone());
    if let Some(key) = key {
        let mut swept = None;
        // The window closed meanwhile: swept without its lock, below.
        if server
            .service
            .with_key(&key, |_| {
                swept = Some(sweep_now(server, folder));
                Ok(())
            })
            .is_ok()
            && let Some(swept) = swept
        {
            return swept;
        }
    }
    sweep_now(server, folder)
}

/// [`sweep`], whatever lock its caller holds.
fn sweep_now(server: &Server, folder: &str) -> Option<Swept> {
    let f = server.db.folder(folder).ok().flatten()?;
    // A folder whose directory is gone has no bin: the walk finds none.
    let path = server.folder_path(&f.dir)?;
    let (_, days) = days(server, folder).ok()?;
    let quota = quota(server, folder).ok()?;
    let mut book = FolderBook {
        db: &server.db,
        folder,
    };
    let cap = server.config.trash_max;
    match bin::sweep(&path, &mut book, bin::now(), days, quota, cap) {
        Ok(swept) => {
            for (item, why) in &swept.removed {
                let reason = match why {
                    bin::Why::Expired => "trash_expired",
                    bin::Why::OverQuota => "trash_over_quota",
                    bin::Why::OverCap => "trash_over_cap",
                };
                crate::log::info(&format!("folder {}: {reason}: {}", f.dir, item.record.path));
                audit(server, None, reason, &item.record.original, folder);
            }
            for (p, e) in &swept.failed {
                crate::log::warn(&format!(
                    "folder {}: not removed from the bin: {p}: {e}",
                    f.dir
                ));
            }
            keep_size(server, folder, swept.count, swept.size);
            Some(swept)
        }
        Err(e) => {
            crate::log::warn(&format!("folder {}: the bin's sweep: {e}", f.dir));
            None
        }
    }
}

/// Every folder's bin, at start and once a day.
pub async fn daily(server: Arc<Server>) {
    loop {
        let s = Arc::clone(&server);
        let _ = tokio::task::spawn_blocking(move || {
            for f in s.db.folders().unwrap_or_default() {
                sweep(&s, &f.id);
            }
        })
        .await;
        tokio::time::sleep(DAILY).await;
    }
}

/// Empty `folder`'s bin from the console (item 4): what went.
pub fn empty_from_console(server: &Server, folder: &str, actor: &str) -> Result<usize, String> {
    let f = server.db.folder(folder)?.ok_or("no such folder")?;
    let path = server.folder_path(&f.dir).ok_or("not a folder name")?;
    let mut book = FolderBook {
        db: &server.db,
        folder,
    };
    let swept = bin::empty_at(&path, &mut book, bin::now())?;
    for (p, e) in &swept.failed {
        crate::log::warn(&format!(
            "folder {}: not removed from the bin: {p}: {e}",
            f.dir
        ));
    }
    audit(
        server,
        Some(actor),
        "trash_emptied",
        &swept.removed.len().to_string(),
        folder,
    );
    crate::log::info(&format!(
        "folder {}: the bin emptied from the console ({} entries)",
        f.dir,
        swept.removed.len()
    ));
    keep_size(server, folder, swept.failed.len(), 0);
    Ok(swept.removed.len())
}

/// What the console's folder page shows of the bin: entries, bytes, the
/// days in effect and how they were set, whether its oldest go early.
pub fn console_view(server: &Server, folder: &str) -> Result<Value, String> {
    let f = server.db.folder(folder)?.ok_or("no such folder")?;
    let (admin, owner) = server.db.trash_days(folder)?;
    let (admin_days, days) = days(server, folder)?;
    let items = match server.folder_path(&f.dir) {
        Some(path) => {
            let mut book = FolderBook {
                db: &server.db,
                folder,
            };
            bin::items_at(&path, &mut book, bin::now())?
        }
        None => Vec::new(),
    };
    let size: u64 = items.iter().map(|i| i.size).sum();
    let quota = quota(server, folder)?;
    keep_size(server, folder, items.len(), size);
    Ok(json!({
        "count": items.len(),
        "size": size,
        "days": days,
        "adminDays": admin,
        "ownerDays": owner,
        "defaultDays": server.config.trash_days,
        "ceiling": admin_days,
        "early": bin::over_quota(&items, quota)
            || bin::over_quota(&items, server.config.trash_max),
    }))
}

/// The bin's commands of a window (`trash_*`), its role checked first.
pub async fn command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    args: Value,
) -> Result<Value, ContractError> {
    let door = crate::access::Door::of(server, who, client)?;
    let folder = door.folder.clone();
    // A reader deletes nothing and sees no bin (item 7); nor does a player
    // of a table, who never deletes (ADR 0113 K.5) and would be shown the
    // names of files they do not see.
    // And a window that is a player at some table of the folder has none:
    // the bin would name what the table hides from it, and give it back.
    // Asked as a change of the folder, not as a delete: outside a table only
    // the owner deletes (ADR 0113 section B, amended 2026-10-31), and the
    // bin stays any writer's to see and restore from (item 7, unchanged).
    if door.veiled()
        || !door
            .may(crate::access::Action::Edit, "", crate::access::Kind::Folder)
            .allowed()
    {
        return Err(refused("the trash is for those who may change this folder"));
    }
    let role = if door.asker.role == Some(Role::Owner) && !door.asker.phone {
        Role::Owner
    } else {
        Role::Editor
    };
    let purges = matches!(cmd, "trash_delete" | "trash_empty" | "trash_set_days");
    if purges && role != Role::Owner {
        return Err(refused(
            "only the folder's owner deletes for good or changes how long the trash keeps files",
        ));
    }
    let s = Arc::clone(server);
    let c = client.to_owned();
    let cmd = cmd.to_owned();
    let actor = who.account.id.clone();
    let lang = who.account.lang.clone();
    blocking(move || {
        let failed = |e: String| verso_service::failed(e);
        let policy = |s: &Server| policy(s, &folder, role).map_err(failed);
        let with = |s: &Server,
                    f: &mut dyn FnMut(
            &mut verso_core::Workspace,
            &mut FolderBook<'_>,
        ) -> Result<Value, OpError>| {
            s.service.with(&c, |ws| {
                let mut book = FolderBook {
                    db: &s.db,
                    folder: &folder,
                };
                f(ws, &mut book)
            })
        };
        match cmd.as_str() {
            "trash_list" => {
                let p = policy(&s)?;
                with(&s, &mut |ws, book| {
                    to_value(trash::list(ws, Some(book), p)?).map_err(OpError::Contract)
                })
            }
            "trash_restore" => {
                let path: String = arg(&args, "path")?;
                let today: String = arg(&args, "today")?;
                let asked: Option<String> = arg(&args, "lang").ok();
                let lang = asked
                    .filter(|l| !l.is_empty())
                    .unwrap_or_else(|| lang.clone());
                // What comes back counts against the quota as any write
                // (ADR 0077 item 5): checked before it moves.
                let key = s
                    .service
                    .folder_of(&c)
                    .ok_or_else(verso_service::no_folder)?;
                let size_of = with(&s, &mut |ws, book| {
                    let items = trash::items(ws, Some(book))?;
                    let item = items
                        .iter()
                        .find(|i| i.record.path == path)
                        .ok_or_else(|| {
                            OpError::Contract(ContractError {
                                kind: ErrorKind::NotFound,
                                message: format!("nothing in the bin at {path}"),
                            })
                        })?;
                    Ok(json!([item.record.original, item.size]))
                })?;
                let original = size_of[0].as_str().unwrap_or_default().to_owned();
                crate::quota::check(&s, &key, &original, size_of[1].as_u64().unwrap_or(0))?;
                // What the entry kept of a table comes back with it, before
                // the folder's session is free: a restore is a move (item
                // 5), and a move keeps a file's access (ADR 0113 K.2).
                let done = s.service.with(&c, |ws| {
                    let mut book = crate::db::Restoring(FolderBook {
                        db: &s.db,
                        folder: &folder,
                    });
                    let (done, _) = trash::restore(ws, Some(&mut book), &path, &today, &lang)?;
                    match s.db.campaign_restored(&folder, &path, &done.path) {
                        Ok(n) if n > 0 => crate::campaign::forget(&s, &folder),
                        Ok(_) => {}
                        Err(e) => crate::log::warn(&format!("restoring a table's access: {e}")),
                    }
                    to_value(done).map_err(OpError::Contract)
                })?;
                let landed = done["path"].as_str().unwrap_or_default().to_owned();
                // To sync, a file that came back: a write by the restorer
                // (item 6).
                crate::sync::reconcile_key(&s, &key, Some(&actor), std::slice::from_ref(&landed));
                crate::sync::told(&s, &key, std::slice::from_ref(&landed), &[], &[]);
                audit(&s, Some(&actor), "trash_restored", &landed, &folder);
                crate::log::info(&format!("restored {path} to {landed} ({actor})"));
                Ok(done)
            }
            "trash_delete" => {
                let paths: Vec<String> = arg(&args, "paths")?;
                let p = policy(&s)?;
                with(&s, &mut |ws, book| {
                    for gone in trash::delete(ws, Some(&mut *book as &mut dyn TrashBook), &paths)? {
                        audit(
                            &s,
                            Some(&actor),
                            "trash_deleted",
                            &gone.record.original,
                            &folder,
                        );
                    }
                    to_value(trash::list(ws, Some(book), p)?).map_err(OpError::Contract)
                })
            }
            "trash_empty" => {
                let p = policy(&s)?;
                with(&s, &mut |ws, book| {
                    let gone = trash::empty(ws, Some(&mut *book as &mut dyn TrashBook))?;
                    audit(
                        &s,
                        Some(&actor),
                        "trash_emptied",
                        &gone.len().to_string(),
                        &folder,
                    );
                    to_value(trash::list(ws, Some(book), p)?).map_err(OpError::Contract)
                })
            }
            "trash_set_days" => {
                let wanted: u32 = arg(&args, "days")?;
                let (admin, _) = days(&s, &folder).map_err(failed)?;
                // The owner shortens; the admin's days are the ceiling,
                // and only the admin turns expiry off (item 3).
                if admin != 0 && !(1..=admin).contains(&wanted) {
                    return Err(refused(
                        "only the server's admin lengthens how long the trash keeps files",
                    ));
                }
                let owner = (wanted != admin).then_some(wanted);
                s.db.set_trash_owner_days(&folder, owner).map_err(failed)?;
                audit(&s, Some(&actor), "trash_days", &wanted.to_string(), &folder);
                sweep(&s, &folder);
                let p = policy(&s)?;
                with(&s, &mut |ws, book| {
                    to_value(trash::list(ws, Some(book), p)?).map_err(OpError::Contract)
                })
            }
            _ => Err(refused("no such command")),
        }
    })
    .await
}
