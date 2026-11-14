// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A table moved to the other host (ADR 0117 D8, R9, decided 2026-11-04,
//! in V1 2026-11-13): a folder of this computer served from here that also
//! syncs with a UniVerso has two hosts and one set of files, and a table
//! lives on one. The game master moves it: on the new host the table is
//! made at the same folder (`campaign_make`, every note hidden as on any
//! new table, nobody invited); on the old one it is closed to its players
//! for good and marked moved (`campaign_settings` with `moved`), so a
//! player who opens it there is told it moved. Its chat, rolls and rights
//! stay in the old host's database, untouched, until the game master
//! undoes that table (ADR 0110 item 1). Nothing crosses from one host's
//! database to the other's.
//!
//! The two hosts, from the window: one at this computer's own table (the
//! seat) whose folder syncs with a UniVerso moves it to that UniVerso; one
//! on a UniVerso's folder that this computer serves too, while it serves,
//! moves it here.

use serde_json::{Value, json};
use verso_contract::TableHost;

use super::platform::{blocking, host_of, known_path, received_from, server};
use super::*;

/// The other host of window `label`'s table, if it has one.
pub(super) fn other<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) -> Option<TableHost> {
    let remote = remote::of(app, label)?;
    let state = app.state::<App>();
    let config = state.service.config();
    if let Some((_, key)) = &remote.seat {
        // At this computer's own table: the UniVerso its folder syncs with,
        // when this person owns the folder there (a received share is not
        // served at all, D4.3).
        let sync = crate::sync::synced(config, key)?;
        if sync.cloud.is_some() || received_from(config, key).is_some() {
            return None;
        }
        return Some(TableHost {
            to: "universo".to_owned(),
            name: host_of(&sync.server),
            url: Some(sync.server),
            folder: Some(sync.folder),
            key: None,
        });
    }
    // On a UniVerso's folder: this computer's folder that syncs with it and
    // is served from here now.
    let local = state.local_server.server.get()?;
    if !local.status().ok()?.serving {
        return None;
    }
    let same = |a: &str, b: &str| a.trim_end_matches('/') == b.trim_end_matches('/');
    local.settings().ok()?.folders.iter().find_map(|path| {
        let key = verso_core::folder_key(Path::new(path));
        let sync = crate::sync::synced(config, &key)?;
        let mine = sync.cloud.is_none()
            && same(&sync.server, &remote.url)
            && sync.folder == remote.folder
            && received_from(config, &key).is_none();
        mine.then(|| TableHost {
            to: "here".to_owned(),
            name: String::new(),
            url: None,
            folder: None,
            key: Some(key),
        })
    })
}

/// A command's answer, or its refusal as the contract's error.
async fn ask(remote: &remote::Remote, cmd: &str, args: Value) -> Result<Value, ContractError> {
    remote.call(cmd, args).await.map_err(|e| {
        serde_json::from_value::<ContractError>(e).unwrap_or_else(|_| failed("the server refused"))
    })
}

/// Move the table at `root` of window `label`'s folder to its other host:
/// made there first, so that a failure leaves the table where it was; then
/// closed and marked moved here. Answers where it went. Doing it again is
/// harmless: making a table that is there already changes nothing.
pub(super) async fn move_table<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    label: String,
    root: String,
) -> Result<TableHost, ContractError> {
    let to =
        other(&app, &label).ok_or_else(|| refused("this table has no other server to move to"))?;
    let old =
        remote::of(&app, &label).ok_or_else(|| refused("this window is at no server's table"))?;
    // A table of this host, not moved yet: nothing is made there otherwise.
    let status = ask(&old, "campaign_status", json!({})).await?;
    let here_now = status["tables"].as_array().is_some_and(|t| {
        t.iter()
            .any(|t| t["root"] == root.as_str() && t["moved"] != true)
    });
    if status["viewer"] != "owner" || !here_now {
        return Err(refused("that folder is not a table of this server to move"));
    }
    let make = json!({ "root": root });
    match (&to.to[..], &old.seat) {
        ("universo", Some((_, key))) => {
            let syncer = sync_commands::running(&app, key);
            let link = syncer
                .as_ref()
                .and_then(|s| sync::live::up(s).and(s.live.remote()))
                .ok_or_else(|| ContractError {
                    kind: ErrorKind::Unavailable,
                    message:
                        "the folder's sync with the UniVerso is not connected: try again when it is"
                            .to_owned(),
                })?;
            ask(&link, "campaign_make", make).await?;
        }
        ("here", None) => {
            let key = to.key.clone().unwrap_or_default();
            let path = known_path(&app, &key).map_err(|e| refused(&e))?;
            let local = server(&app)?;
            // Through the owner's door in memory, as the window sits.
            let door = Arc::new(blocking(move || local.sit(&path)).await?);
            let (here, _heard) = seat::dial(Arc::clone(&door), key).await?;
            ask(&here, "open_server_folder", json!({ "id": door.folder() })).await?;
            ask(&here, "campaign_make", make).await?;
        }
        _ => return Err(refused("this table has no other server to move to")),
    }
    let shut = json!({ "root": root, "open": false, "moved": true });
    ask(&old, "campaign_settings", shut).await?;
    log::write(
        "INFO",
        "host",
        &format!("a table moved to the other server ({})", to.to),
    );
    Ok(to)
}
