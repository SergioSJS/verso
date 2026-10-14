// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A file's version history in a window of this computer (ADR 0091). A
//! folder of the computer keeps its own history in the configuration
//! directory (item 8; `verso_service::history`), its retention the
//! person's setting (`set_history_days`, the person's layer of ADR 0070).
//! A synced folder shows the server's history, which holds every device's
//! writes, and this computer's versions only for what has not crossed yet
//! — by their bytes' hash; with the server out of reach, this computer's
//! alone, said so. A window on a server's folder sends these commands to
//! the server (`remote.rs`).
//!
//! Ids say whose a version is: `c:` this computer's, `s:` the server's.

use super::*;
use serde_json::{Value, json};
use verso_contract::{HistoryListing, VersionRestored, VersionText};
use verso_service::history::{self, Policy};

/// This computer's versions.
const HERE: &str = "c:";
/// The server's, in a synced folder.
const THERE: &str = "s:";

/// The days the computer keeps versions: the person's setting.
fn days(service: &Service) -> u32 {
    service
        .history_days()
        .unwrap_or(verso_core::history::DEFAULT_DAYS)
}

/// The server of the synced folder `window` shows: none when the folder
/// does not sync; the reason when it syncs and the server is out of reach.
fn link<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
) -> Option<(String, Result<Arc<remote::Remote>, String>)> {
    let key = app.state::<App>().service.folder_of(window.label())?;
    let syncer = lock(&app.state::<App>().syncs).get(&key).map(Arc::clone)?;
    let remote = syncer
        .live
        .remote()
        .ok_or_else(|| "the server is out of reach".to_owned());
    Some((key, remote))
}

/// The server's error as the contract says it.
fn from_server(e: Value) -> ContractError {
    serde_json::from_value(e.clone()).unwrap_or_else(|_| verso_service::failed(e.to_string()))
}

async fn call(remote: &remote::Remote, cmd: &str, args: Value) -> Result<Value, ContractError> {
    remote.call(cmd, args).await.map_err(from_server)
}

fn parsed<T: serde::de::DeserializeOwned>(v: Value) -> Result<T, ContractError> {
    serde_json::from_value(v).map_err(|e| failed(e.to_string()))
}

/// The server's id of a version this window holds as `s:<id>`.
fn server_id(id: &str) -> Option<&str> {
    id.strip_prefix(THERE)
}

/// The history of `path`: this computer's, and in a synced folder the
/// server's with this computer's versions that have not crossed (item 8).
async fn listed<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
    path: &str,
) -> Result<HistoryListing, ContractError> {
    let service = Arc::clone(&app.state::<App>().service);
    let policy = Policy::local(days(&service));
    let mut here = service.with(window.label(), |ws| {
        history::list_local(ws, path, policy, HERE)
    })?;
    let Some((_, remote)) = link(app, window) else {
        return Ok(here);
    };
    let there = match remote {
        Ok(remote) => call(&remote, "history_list", json!({ "path": path })).await,
        Err(why) => {
            here.partial = Some(why);
            return Ok(here);
        }
    };
    let mut there: HistoryListing = match there.and_then(parsed) {
        Ok(t) => t,
        Err(e) => {
            log::write(
                "WARN",
                "history",
                &format!("the server's history of {path}: {}", e.message),
            );
            here.partial = Some(e.message);
            return Ok(here);
        }
    };
    let crossed: std::collections::HashSet<String> =
        there.versions.iter().map(|v| v.hash.clone()).collect();
    for v in &mut there.versions {
        v.id = format!("{THERE}{}", v.id);
    }
    there.versions.extend(
        here.versions
            .into_iter()
            .filter(|v| !crossed.contains(&v.hash))
            .map(|mut v| {
                v.here_only = true;
                v
            }),
    );
    there.versions.sort_by(|a, b| b.at.total_cmp(&a.at));
    there.path = path.to_owned();
    Ok(there)
}

/// A file's versions, newest first (item 5).
#[tauri::command]
#[specta::specta]
pub(crate) async fn history_list<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
) -> Result<HistoryListing, ContractError> {
    listed(&app, &window, &path).await
}

/// A version's text, for its diff against the current text and the one
/// before it.
#[tauri::command]
#[specta::specta]
pub(crate) async fn history_read<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
    id: String,
) -> Result<VersionText, ContractError> {
    if let Some(n) = server_id(&id) {
        let remote = server_link(&app, &window)?;
        let mut t: VersionText =
            parsed(call(&remote, "history_read", json!({ "path": path, "id": n })).await?)?;
        t.id = id;
        return Ok(t);
    }
    let n = history::id_of(&id, HERE).map_err(OpError::into_contract)?;
    let bytes = with(&app.state::<App>(), &window, |ws| {
        history::bytes_local(ws, &path, n)
    })?;
    Ok(history::text(&id, bytes))
}

/// The server's link, or why there is none now.
fn server_link<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
) -> Result<Arc<remote::Remote>, ContractError> {
    match link(app, window) {
        Some((_, Ok(remote))) => Ok(remote),
        Some((_, Err(why))) => Err(ContractError {
            kind: ErrorKind::Unavailable,
            message: why,
        }),
        None => Err(refused("this folder does not sync with a server")),
    }
}

/// Bring a version back (item 5): a new write over the revision the
/// window read — refused, nothing written, when the file changed since
/// (invariant 11) — or a new file when the file is gone. A version of the
/// server is brought back on the server, through the note's room when it
/// is live, once this computer's copy is the server's; sync brings it
/// here.
#[tauri::command]
#[specta::specta]
pub(crate) async fn history_restore<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
    id: String,
    revision: Option<String>,
) -> Result<VersionRestored, ContractError> {
    let service = Arc::clone(&app.state::<App>().service);
    if let Some(n) = server_id(&id) {
        let remote = server_link(&app, &window)?;
        // What the window read is what is here now…
        let p = path.clone();
        let here = service.with(window.label(), move |ws| Ok(ws.read_with_revision(&p).ok()))?;
        if here.as_ref().map(|(_, r)| r) != revision.as_ref() {
            return Err(ContractError {
                kind: ErrorKind::Changed,
                message: "the file changed since it was read".to_owned(),
            });
        }
        // …and what is here is the server's: else sync has not finished.
        let read = if path.to_lowercase().ends_with(".md") {
            "read_note"
        } else {
            "read_text"
        };
        let there = match &here {
            Some(_) => Some(call(&remote, read, json!({ "path": path })).await?),
            None => None,
        };
        if let (Some((bytes, _)), Some(t)) = (&here, &there)
            && t["text"].as_str().map(str::as_bytes) != Some(bytes.as_slice())
        {
            return Err(ContractError {
                kind: ErrorKind::Changed,
                message:
                    "this computer's copy is not yet the server's: let sync finish, then restore"
                        .to_owned(),
            });
        }
        let at = there.as_ref().map(|t| t["revision"].clone());
        let done: VersionRestored = parsed(
            call(
                &remote,
                "history_restore",
                json!({ "path": path, "id": n, "revision": at }),
            )
            .await?,
        )?;
        if let Some((key, _)) = link(&app, &window) {
            touched(&app, &key, [path.clone()]);
        }
        log::write(
            "INFO",
            "history",
            &format!("restored {id} of {path} on the server"),
        );
        return Ok(done);
    }
    let n = history::id_of(&id, HERE).map_err(OpError::into_contract)?;
    let p = path.clone();
    let done = service.with(window.label(), move |ws| {
        let bytes = history::bytes_local(ws, &p, n)?;
        history::restore(ws, &p, &bytes, revision.as_deref())
    })?;
    if let Some(key) = service.folder_of(window.label()) {
        touched(&app, &key, [done.path.clone()]);
    }
    log::write("INFO", "history", &format!("restored {id} of {path}"));
    Ok(done)
}

/// A version put beside its file, as a new file (item 5, "Copy as a new
/// note"): `stamp` the version's time as the window shows it, `lang` the
/// person's language.
#[tauri::command]
#[specta::specta]
pub(crate) async fn history_copy<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
    id: String,
    stamp: String,
    lang: String,
) -> Result<VersionRestored, ContractError> {
    if let Some(n) = server_id(&id) {
        let remote = server_link(&app, &window)?;
        let done: VersionRestored = parsed(
            call(
                &remote,
                "history_copy",
                json!({ "path": path, "id": n, "stamp": stamp, "lang": lang }),
            )
            .await?,
        )?;
        if let Some((key, _)) = link(&app, &window) {
            touched(&app, &key, [done.path.clone()]);
        }
        return Ok(done);
    }
    let n = history::id_of(&id, HERE).map_err(OpError::into_contract)?;
    let service = Arc::clone(&app.state::<App>().service);
    let done = service.with(window.label(), move |ws| {
        let bytes = history::bytes_local(ws, &path, n)?;
        history::copy_beside(ws, &path, &bytes, &stamp, lang.starts_with("pt"))
    })?;
    if let Some(key) = service.folder_of(window.label()) {
        touched(&app, &key, [done.path.clone()]);
    }
    Ok(done)
}

/// Delete a version (item 6: on the computer the person is the owner; a
/// server's version as the server allows).
#[tauri::command]
#[specta::specta]
pub(crate) async fn history_delete<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
    id: String,
) -> Result<HistoryListing, ContractError> {
    if let Some(n) = server_id(&id) {
        let remote = server_link(&app, &window)?;
        call(&remote, "history_delete", json!({ "path": path, "id": n })).await?;
    } else {
        let n = history::id_of(&id, HERE).map_err(OpError::into_contract)?;
        let service = Arc::clone(&app.state::<App>().service);
        let policy = Policy::local(days(&service));
        let p = path.clone();
        service.with(window.label(), move |ws| {
            history::delete_local(ws, &p, n, policy)
        })?;
    }
    log::write(
        "INFO",
        "history",
        &format!("deleted version {id} of {path}"),
    );
    listed(&app, &window, &path).await
}

/// How many days this computer keeps versions, 0 for no limit: the
/// person's setting (item 8), pushed by the window; every open folder
/// thinned at once.
#[tauri::command]
#[specta::specta]
pub(crate) fn set_history_days(state: State<'_, App>, days: u32) -> Result<(), ContractError> {
    if days > 36_500 {
        return Err(refused("days: 0 (no limit) to 36500"));
    }
    let service = Arc::clone(&state.service);
    tauri::async_runtime::spawn_blocking(move || service.set_history_days(days));
    Ok(())
}
