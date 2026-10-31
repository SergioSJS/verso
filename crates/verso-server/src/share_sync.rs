// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A share synced to a folder of the receiver's computer (ADR 0081 item 6;
//! ADR 0079 item 1: one local folder, one share). The device names files
//! by their paths in the shared folder; the server joins them to the
//! shared folder's path before it reads or writes, confines every name it
//! settles on to the share, and answers with the share's files and the
//! changes of its log only — the owner's other files never cross, not
//! even as a deletion or a rename's source.

use std::sync::Arc;

use axum::body::Bytes;
use serde_json::{Value, json};
use verso_contract::ContractError;

use crate::auth::Who;
use crate::db::covers;
use crate::rpc::arg;
use crate::scope::Scope;
use crate::state::Server;
use crate::sync::{Reply, command_in};

/// Changes a device gets at once, as the whole folder's log gives them.
const PAGE: usize = 1000;

/// A device's sync command on a share.
pub async fn command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    (args, data): (Value, Option<Bytes>),
    scope: Scope,
) -> Result<Reply, ContractError> {
    let root = scope.root.clone();
    let writes: Reach = Arc::new(move |p: &str| covers(&root, p));
    let reads: Reach = {
        let scope = scope.clone();
        Arc::new(move |p: &str| scope.to_rel(p).is_some())
    };
    let (mut answer, piece) = run(
        server,
        who,
        client,
        cmd,
        (args, data),
        &scope,
        (reads, writes),
    )
    .await
    .map_err(|e| scope.error(e))?;
    if answer["path"].is_string() {
        rel(&scope, &mut answer["path"]);
    }
    Ok((answer, piece))
}

type Reach = Arc<dyn Fn(&str) -> bool + Send + Sync>;

async fn run(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    (mut args, data): (Value, Option<Bytes>),
    scope: &Scope,
    (reads, writes): (Reach, Reach),
) -> Result<Reply, ContractError> {
    Ok(match cmd {
        "sync_state" => {
            let reader = crate::readers::reads_only(server, who, client)?;
            let key = server
                .service
                .folder_of(client)
                .ok_or_else(verso_service::no_folder)?;
            // A table with notes released to some players: the player's own
            // log, which the share's cut of it is the head of — counted
            // first, so that a change landing while the files are made is in
            // them and not in the head: the device reads it again, never
            // skips it.
            let own_head = if reader && own_log(server, &key).await? {
                let (s, k, f, a, rs) = (
                    Arc::clone(server),
                    key,
                    crate::rpc::role_here(server, client)?.0,
                    who.account.id.clone(),
                    roots(scope),
                );
                Some(
                    crate::rpc::blocking(move || {
                        let rs: Vec<&str> = rs.iter().map(String::as_str).collect();
                        crate::campaign_sync::viewer_share_head(&s, (&f, &k), &a, &rs)
                    })
                    .await?,
                )
            } else {
                None
            };
            let (mut v, _) =
                command_in(server, who, client, cmd, (args, None), Arc::clone(&reads)).await?;
            if let Some(files) = v["files"].as_array_mut() {
                files.retain_mut(|f| rel(scope, &mut f["path"]));
            }
            // The share's own head: how many of the folder's changes up to
            // the folder's head are the share's (3.18).
            let upto = v["head"].as_i64().unwrap_or(0);
            v["head"] = match own_head {
                Some(h) => json!(h),
                None => json!(share_count(server, client, scope, (upto, reader)).await?),
            };
            (v, None)
        }
        "sync_changes" => return Ok((changes(server, who, client, &args, scope).await?, None)),
        "sync_read" => {
            let p: String = arg(&args, "path")?;
            args["path"] = json!(scope.to_full(&p)?);
            command_in(server, who, client, cmd, (args, None), reads).await?
        }
        "sync_put" | "sync_delete" => {
            let p: String = arg(&args, "path")?;
            settings_stay(&p)?;
            args["path"] = json!(scope.to_full_write(&p)?);
            command_in(server, who, client, cmd, (args, data), writes).await?
        }
        "sync_rename" => {
            let from: String = arg(&args, "from")?;
            let to: String = arg(&args, "to")?;
            settings_stay(&from)?;
            settings_stay(&to)?;
            args["from"] = json!(scope.to_full_write(&from)?);
            args["to"] = json!(scope.to_full_write(&to)?);
            command_in(server, who, client, cmd, (args, None), writes).await?
        }
        _ => return Err(verso_service::refused("no such command")),
    })
}

/// A receiver's own folder settings, `.verso/` at the root of the folder
/// of their computer, stay there: a share carries the shared folder's
/// notes and files, and the settings of the owner's folder are the whole
/// folder's (ADR 0070). Refused with the reason, which the device lists.
fn settings_stay(path: &str) -> Result<(), ContractError> {
    if verso_fs::is_settings_path(path) {
        return Err(verso_service::refused(
            "a share carries the shared folder's notes and files: this folder's own settings stay on this computer",
        ));
    }
    Ok(())
}

/// `v`, a path of the owner's folder, as the share names it; false when
/// it is not in the share.
fn rel(scope: &Scope, v: &mut Value) -> bool {
    match v.as_str().and_then(|p| scope.to_rel(p)) {
        Some(r) => {
            *v = Value::String(r);
            true
        }
        None => false,
    }
}

/// The roots a share sees changes under: the shared folder's path, and
/// the attachments folder it shows.
fn roots(scope: &Scope) -> Vec<String> {
    let mut out = vec![scope.root.clone()];
    out.extend(scope.mount.as_ref().map(|(_, path)| path.clone()));
    out
}

/// Whether the folder has notes released to some players, so that the
/// player's log is its own and the share's is a cut of it
/// (`campaign_sync`).
async fn own_log(server: &Arc<Server>, key: &str) -> Result<bool, ContractError> {
    let (s, k) = (Arc::clone(server), key.to_owned());
    crate::rpc::blocking(move || Ok(crate::campaign_sync::restricted(&s, &k))).await
}

/// How many of the folder's changes up to its number `upto` the share sees
/// ([`crate::db::Db::share_seq`]): the share's own head.
async fn share_count(
    server: &Arc<Server>,
    client: &str,
    scope: &Scope,
    (upto, reader): (i64, bool),
) -> Result<i64, ContractError> {
    let (folder, _) = crate::rpc::role_here(server, client)?;
    let (s, roots) = (Arc::clone(server), roots(scope));
    crate::rpc::blocking(move || {
        let roots: Vec<&str> = roots.iter().map(String::as_str).collect();
        s.db.share_seq(&folder, &roots, upto, reader)
            .map_err(verso_service::failed)
    })
    .await
}

/// Where in the folder's log the share's cursor `asked` is: the folder's
/// number of the share's `asked`-th change, and the share's count there.
/// A cursor past what the share sees (the share's path moved, so other
/// changes are its own) stands at the last change it sees: nothing is
/// missed, and what comes after is numbered on from there.
async fn cursor_at(
    server: &Arc<Server>,
    client: &str,
    scope: &Scope,
    (asked, reader): (i64, bool),
) -> Result<(i64, i64), ContractError> {
    if asked < 1 {
        return Ok((0, 0));
    }
    let (folder, _) = crate::rpc::role_here(server, client)?;
    let (s, roots) = (Arc::clone(server), roots(scope));
    crate::rpc::blocking(move || {
        let roots: Vec<&str> = roots.iter().map(String::as_str).collect();
        let fail = verso_service::failed;
        let seen =
            s.db.share_seq(&folder, &roots, i64::MAX, reader)
                .map_err(fail)?;
        let n = asked.min(seen);
        let at =
            s.db.share_change(&folder, &roots, n, reader)
                .map_err(fail)?;
        Ok((at.unwrap_or(0), n))
    })
    .await
}

/// The changes of the share after the device's cursor: the folder's log
/// read in its pages and filtered — a change outside the share is not
/// said, a file moved out of it is a deletion, one moved in is new. Each
/// is numbered in the share's own count (3.18): the folder's numbers would
/// tell the receiver how much happens outside the share, so the device's
/// cursor and the head it hears count the share's changes only, and the
/// cursor is opaque to it. The head said is where the reading stopped, so
/// that the device's next question starts there.
async fn changes(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    args: &Value,
    scope: &Scope,
) -> Result<Value, ContractError> {
    let asked: i64 = arg(args, "since")?;
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    if crate::readers::reads_only(server, who, client)? && own_log(server, &key).await? {
        let writes = crate::access::Door::of(server, who, client)?.sends_whole_cap();
        let (s, f, a, rs, sc, c) = (
            Arc::clone(server),
            crate::rpc::role_here(server, client)?.0,
            who.account.id.clone(),
            roots(scope),
            scope.clone(),
            client.to_owned(),
        );
        return crate::rpc::blocking(move || {
            crate::sync::head_for_question(&s, &f, &key, &c)?;
            let rs: Vec<&str> = rs.iter().map(String::as_str).collect();
            let shape = |v: Value| change(&sc, v);
            let size = i64::try_from(PAGE).unwrap_or(1000);
            crate::campaign_sync::viewer_share_page(
                &s,
                (&f, &key),
                (&a, writes),
                &rs,
                (asked, size),
                &shape,
            )
        })
        .await;
    }
    // A reader's count of the share's changes leaves out those only inside
    // secret blocks, as its pages of the log do (ADR 0087).
    let reader = crate::readers::reads_only(server, who, client)?;
    let (mut since, mut n) = cursor_at(server, client, scope, (asked, reader)).await?;
    let mut out: Vec<Value> = Vec::new();
    let all: Arc<dyn Fn(&str) -> bool + Send + Sync> = Arc::new(|_: &str| true);
    loop {
        let (page, _) = command_in(
            server,
            who,
            client,
            "sync_changes",
            (json!({ "since": since }), None),
            Arc::clone(&all),
        )
        .await
        .map_err(|e| scope.error(e))?;
        let head = page["head"].as_i64().unwrap_or(since);
        let list = page["changes"].as_array().cloned().unwrap_or_default();
        let more = page["more"] == true;
        for c in list {
            since = since.max(c["seq"].as_i64().unwrap_or(since));
            if let Some(mut seen) = change(scope, c) {
                n += 1;
                seen["seq"] = json!(n);
                out.push(seen);
            }
            if out.len() >= PAGE {
                return Ok(json!({ "head": n, "changes": out, "more": since < head }));
            }
        }
        if !more {
            // Every change up to the folder's head read: `n` is the
            // share's head.
            return Ok(json!({ "head": n, "changes": out, "more": false }));
        }
    }
}

/// One change of the folder's log as the share sees it, if it sees it.
fn change(scope: &Scope, mut c: Value) -> Option<Value> {
    // Which device of the owner's, or of another person's, made it is
    // theirs: not the receiver's to know; nor who, among the folder's
    // people (the folder's change log says it to its own members).
    if let Some(o) = c.as_object_mut() {
        o.remove("device");
        o.remove("by");
    }
    let path = c["path"].as_str().and_then(|p| scope.to_rel(p));
    let from = c["renamedFrom"].as_str().and_then(|p| scope.to_rel(p));
    match (path, from) {
        (Some(p), from) => {
            c["path"] = json!(p);
            c["renamedFrom"] = json!(from);
            Some(c)
        }
        // Moved out of the share: to the device, it is gone.
        (None, Some(f)) => Some(json!({
            "seq": c["seq"], "path": f, "hash": null, "size": 0, "deleted": true, "renamedFrom": null,
        })),
        (None, None) => None,
    }
}

/// The bin seen through a share (ADR 0081 item 16): a writer of the share
/// sees and restores the entries whose original path is inside it, in the
/// share's paths; the rest of the folder's bin is not theirs, and nobody
/// of a share deletes for good or changes the bin's days — the owner's.
pub async fn trash(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    mut args: Value,
    scope: &Scope,
) -> Result<Value, ContractError> {
    let inside = |listing: &mut Value| {
        let mut size = 0.0;
        if let Some(entries) = listing["entries"].as_array_mut() {
            entries.retain_mut(|e| {
                // Only what was the share's own, never the attachments
                // folder shown with it.
                if !e["original"].as_str().is_some_and(|o| scope.in_root(o)) {
                    return false;
                }
                if !rel(scope, &mut e["original"]) {
                    return false;
                }
                e["path"] = json!(scope.said(e["path"].as_str().unwrap_or_default()));
                size += e["size"].as_f64().unwrap_or(0.0);
                true
            });
        }
        listing["size"] = json!(size);
        listing["can_set"] = json!(false);
        listing["can_purge"] = json!(false);
    };
    let list = || crate::trash::command(server, who, client, "trash_list", json!({}));
    match cmd {
        "trash_list" => {
            let mut listing = list().await.map_err(|e| scope.error(e))?;
            inside(&mut listing);
            Ok(listing)
        }
        "trash_restore" => {
            let asked: String = arg(&args, "path")?;
            let all = list().await.map_err(|e| scope.error(e))?;
            let real = all["entries"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|e| {
                    e["original"].as_str().is_some_and(|o| scope.in_root(o))
                        && scope.said(e["path"].as_str().unwrap_or_default()) == asked
                })
                .and_then(|e| e["path"].as_str().map(str::to_owned))
                .ok_or_else(|| ContractError {
                    kind: verso_contract::ErrorKind::NotFound,
                    message: format!("nothing in the bin at {asked}"),
                })?;
            args["path"] = json!(real);
            let mut done = crate::trash::command(server, who, client, cmd, args)
                .await
                .map_err(|e| scope.error(e))?;
            if !rel(scope, &mut done["path"]) {
                done["path"] = json!("");
            }
            done["warnings"] = json!([]);
            Ok(done)
        }
        _ => Err(verso_service::refused(
            "only the folder's owner deletes for good or changes how long the trash keeps files",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_change_outside_the_share_is_not_said() {
        let scope = Scope {
            share: "s".into(),
            key: "share-s".into(),
            name: "C (O)".into(),
            root: "C".into(),
            mount: None,
            guard: None,
        };
        let c = |path: &str, from: Option<&str>| json!({ "seq": 1, "path": path, "hash": "h", "size": 1, "deleted": false, "renamedFrom": from, "device": "MacBook de Sérgio", "by": "Sérgio" });
        assert_eq!(change(&scope, c("D/x.md", None)), None);
        assert_eq!(change(&scope, c("D/x.md", Some("D/y.md"))), None);
        let inside = change(&scope, c("C/x.md", Some("D/y.md"))).unwrap();
        assert_eq!(inside["path"], "x.md");
        assert_eq!(inside["renamedFrom"], Value::Null);
        assert!(inside.get("device").is_none(), "{inside}");
        assert!(inside.get("by").is_none(), "{inside}");
        let out = change(&scope, c("D/x.md", Some("C/y.md"))).unwrap();
        assert_eq!(out["path"], "y.md");
        assert_eq!(out["deleted"], true);
        assert_eq!(out["hash"], Value::Null);
    }
}
