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

use serde_json::{Value, json};
use verso_contract::ContractError;

use crate::auth::Who;
use crate::db::covers;
use crate::rpc::arg;
use crate::scope::Scope;
use crate::state::Server;
use crate::sync::command_in;

/// Changes a device gets at once, as the whole folder's log gives them.
const PAGE: usize = 1000;

/// A device's sync command on a share.
pub async fn command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    args: Value,
    scope: Scope,
) -> Result<Value, ContractError> {
    let root = scope.root.clone();
    let writes: Reach = Arc::new(move |p: &str| covers(&root, p));
    let reads: Reach = {
        let scope = scope.clone();
        Arc::new(move |p: &str| scope.to_rel(p).is_some())
    };
    let mut answer = run(server, who, client, cmd, args, &scope, (reads, writes))
        .await
        .map_err(|e| scope.error(e))?;
    if answer["path"].is_string() {
        rel(&scope, &mut answer["path"]);
    }
    Ok(answer)
}

type Reach = Arc<dyn Fn(&str) -> bool + Send + Sync>;

async fn run(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    mut args: Value,
    scope: &Scope,
    (reads, writes): (Reach, Reach),
) -> Result<Value, ContractError> {
    Ok(match cmd {
        "sync_state" => {
            let mut v = command_in(server, who, client, cmd, args, Arc::clone(&reads)).await?;
            if let Some(files) = v["files"].as_array_mut() {
                files.retain_mut(|f| rel(scope, &mut f["path"]));
            }
            v
        }
        "sync_changes" => return changes(server, who, client, &args, scope).await,
        "sync_read" => {
            let p: String = arg(&args, "path")?;
            args["path"] = json!(scope.to_full(&p)?);
            command_in(server, who, client, cmd, args, reads).await?
        }
        "sync_put" | "sync_delete" => {
            let p: String = arg(&args, "path")?;
            args["path"] = json!(scope.to_full_write(&p)?);
            command_in(server, who, client, cmd, args, writes).await?
        }
        "sync_rename" => {
            let from: String = arg(&args, "from")?;
            let to: String = arg(&args, "to")?;
            args["from"] = json!(scope.to_full_write(&from)?);
            args["to"] = json!(scope.to_full_write(&to)?);
            command_in(server, who, client, cmd, args, writes).await?
        }
        _ => return Err(verso_service::refused("no such command")),
    })
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

/// The changes of the share after the device's cursor: the folder's log
/// read in its pages and filtered — a change outside the share is not
/// said, a file moved out of it is a deletion, one moved in is new. The
/// head said is where the reading stopped, so that the device's next
/// question starts there.
async fn changes(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    args: &Value,
    scope: &Scope,
) -> Result<Value, ContractError> {
    let mut since: i64 = arg(args, "since")?;
    let mut out: Vec<Value> = Vec::new();
    let all: Arc<dyn Fn(&str) -> bool + Send + Sync> = Arc::new(|_: &str| true);
    loop {
        let page = command_in(
            server,
            who,
            client,
            "sync_changes",
            json!({ "since": since }),
            Arc::clone(&all),
        )
        .await
        .map_err(|e| scope.error(e))?;
        let head = page["head"].as_i64().unwrap_or(since);
        let list = page["changes"].as_array().cloned().unwrap_or_default();
        let more = page["more"] == true;
        for c in list {
            since = since.max(c["seq"].as_i64().unwrap_or(since));
            if let Some(seen) = change(scope, c) {
                out.push(seen);
            }
            if out.len() >= PAGE {
                let more = since < head;
                return Ok(
                    json!({ "head": if more { since } else { head }, "changes": out, "more": more }),
                );
            }
        }
        if !more {
            return Ok(json!({ "head": head, "changes": out, "more": false }));
        }
    }
}

/// One change of the folder's log as the share sees it, if it sees it.
fn change(scope: &Scope, mut c: Value) -> Option<Value> {
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
        };
        let c = |path: &str, from: Option<&str>| json!({ "seq": 1, "path": path, "hash": "h", "size": 1, "deleted": false, "renamedFrom": from });
        assert_eq!(change(&scope, c("D/x.md", None)), None);
        assert_eq!(change(&scope, c("D/x.md", Some("D/y.md"))), None);
        let inside = change(&scope, c("C/x.md", Some("D/y.md"))).unwrap();
        assert_eq!(inside["path"], "x.md");
        assert_eq!(inside["renamedFrom"], Value::Null);
        let out = change(&scope, c("D/x.md", Some("C/y.md"))).unwrap();
        assert_eq!(out["path"], "y.md");
        assert_eq!(out["deleted"], true);
        assert_eq!(out["hash"], Value::Null);
    }
}
