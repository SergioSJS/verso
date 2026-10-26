// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A reader's `sync_state` and `sync_changes`, in the reader's own count
//! (ADR 0087 item 4; a table's players, ADR 0110).

use std::sync::Arc;

use serde_json::{Value, json};
use verso_contract::ContractError;

use super::{Reply, command_in, head_for_question};
use crate::auth::Who;
use crate::rpc::{arg, blocking, role_here};
use crate::state::Server;

/// A reader's `sync_state` and `sync_changes` on a plain folder, numbered
/// in the reader's own count: the folder's numbers would tell it how many
/// changes only touched a secret block (ADR 0087 item 4). Its cursor is
/// that count, turned into the folder's number to ask the log, and the
/// changes and the head it is told are renumbered the same way.
pub(super) async fn command(
    server: &Arc<Server>,
    who: &Who,
    client: &str,
    cmd: &str,
    mut args: Value,
) -> Result<Reply, ContractError> {
    let (folder, _) = role_here(server, client)?;
    let cmd_is_changes = cmd == "sync_changes";
    let asked: i64 = if cmd == "sync_changes" {
        arg(&args, "since")?
    } else {
        0
    };
    // A table with notes released to some players: this player's own log,
    // in its own count. Decided once for the whole question: the folder is
    // not asked again between the log and the files.
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    if crate::campaign_sync::restricted(server, &key) {
        let writes = crate::access::Door::of(server, who, client)?.sends_whole_cap();
        let (s, f, k, a, c) = (
            Arc::clone(server),
            folder.clone(),
            key.clone(),
            who.account.id.clone(),
            client.to_owned(),
        );
        return blocking(move || {
            head_for_question(&s, &f, &k, &c)?;
            if cmd_is_changes {
                let page =
                    crate::campaign_sync::viewer_page(&s, (&f, &k), (&a, writes), (asked, 1000))?;
                return Ok((page, None));
            }
            // The head first, then the files: a change that lands between
            // is in the files and not in the head, so the device reads it
            // again from its cursor; the other way round it would be counted
            // in the head and missing from the files, and skipped.
            let head = crate::campaign_sync::viewer_head(&s, &f, &k, &a)?;
            let files = crate::campaign_sync::viewer_files(&s, &f, &k, (&a, writes))?;
            Ok((json!({ "head": head, "files": files }), None))
        })
        .await;
    }
    let at = {
        let (s, f) = (Arc::clone(server), folder.clone());
        blocking(move || {
            if asked < 1 {
                return Ok(0);
            }
            let seen =
                s.db.reader_count(&f, i64::MAX)
                    .map_err(verso_service::failed)?;
            // A cursor past what the reader sees stands at its last change.
            Ok(s.db
                .reader_nth(&f, asked.min(seen))
                .map_err(verso_service::failed)?
                .unwrap_or(0))
        })
        .await?
    };
    if cmd == "sync_changes" {
        args["since"] = json!(at);
    }
    let (mut answer, piece) = command_in(
        server,
        who,
        client,
        cmd,
        (args, None),
        Arc::new(|_: &str| true),
    )
    .await?;
    let (s, f) = (Arc::clone(server), folder);
    let counted = if cmd == "sync_changes" { at } else { i64::MAX };
    let n = blocking(move || {
        s.db.reader_count(&f, counted)
            .map_err(verso_service::failed)
    })
    .await?;
    if let Some(list) = answer["changes"].as_array_mut() {
        // The head is where the reading stopped, so a change that lands
        // meanwhile is the next question's, never skipped.
        for (i, c) in list.iter_mut().enumerate() {
            c["seq"] = json!(n + 1 + i64::try_from(i).unwrap_or(0));
        }
        answer["head"] = json!(n + i64::try_from(list.len()).unwrap_or(0));
    } else {
        answer["head"] = json!(n);
    }
    Ok((answer, piece))
}
