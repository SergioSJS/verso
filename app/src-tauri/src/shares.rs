// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The owner shares a folder of theirs (ADR 0081 item 7) from the desktop
//! app: in a window on a server's folder online, or in a window on a folder
//! of this computer that syncs with one — the share is made on that
//! server's folder, by the path of the folder inside it. The server checks
//! that the account owns the folder; this side only says where.

use serde_json::{Value, json};
use verso_contract::{FolderShare, RecentFolder, SharePerson};
use verso_core::servers::ServerLogin;

use super::*;

/// The server and its folder behind this window: the one it shows
/// online, or the one its folder of this computer syncs with.
fn server_folder<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
) -> Result<(ServerLogin, String), ContractError> {
    let state = app.state::<App>();
    let (url, folder) = if let Some(r) = remote::of(app, window.label()) {
        (r.url.clone(), r.folder.clone())
    } else {
        let key = state
            .service
            .folder_of(window.label())
            .ok_or_else(no_folder)?;
        let synced = sync::synced(state.service.config(), &key)
            .ok_or_else(|| refused("this folder is not on a server: sync it with one first"))?;
        (synced.server, synced.folder)
    };
    let login = remote::login_for(&state, &url)?;
    Ok((login, folder))
}

/// One request to the server with the device's token, its answer as JSON.
async fn ask(
    login: ServerLogin,
    method: &'static str,
    path: String,
    body: Option<Value>,
) -> Result<Value, ContractError> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = remote::http()?;
        let url = format!("{}{path}", login.url);
        let server = login.url;
        let request = match method {
            "PUT" => client.put(url),
            "POST" => client.post(url),
            _ => client.get(url),
        }
        .bearer_auth(login.token);
        let request = match body {
            Some(b) => request.json(&b),
            None => request,
        };
        remote::answer(request.send().map_err(|e| reach::unsent(&server, &e))?)
    })
    .await
    .map_err(|e| verso_service::failed(e.to_string()))?
}

/// A share as the server says it.
pub(crate) fn share_of(v: &Value) -> FolderShare {
    FolderShare {
        id: v["id"].as_str().map(str::to_owned),
        path: v["path"].as_str().unwrap_or_default().to_owned(),
        people: v["people"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|p| SharePerson {
                id: p["id"].as_str().unwrap_or_default().to_owned(),
                name: p["name"].as_str().unwrap_or_default().to_owned(),
                email: p["email"].as_str().unwrap_or_default().to_owned(),
                role: p["role"].as_str().unwrap_or_default().to_owned(),
            })
            .collect(),
        attachments: v["attachments"].as_str().map(str::to_owned),
        missing: v["missing"] == true,
    }
}

fn path_of(id: &str) -> String {
    let id: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        .collect();
    format!("/api/folders/{id}/shares")
}

/// The shares of the window's folder: the whole folder's people first,
/// then each folder inside it shared, by path (ADR 0081 item 7).
#[tauri::command]
#[specta::specta]
pub(crate) async fn share_list<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<Vec<FolderShare>, ContractError> {
    let (login, folder) = server_folder(&app, &window)?;
    let v = ask(login, "GET", path_of(&folder), None).await?;
    let mut out = vec![share_of(&v["root"])];
    out.extend(v["shares"].as_array().into_iter().flatten().map(share_of));
    Ok(out)
}

/// Share the folder at `path` (`""` the whole folder) with the account of
/// `email`, reading or writing, or change their role.
#[tauri::command]
#[specta::specta]
pub(crate) async fn share_grant<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
    email: String,
    role: String,
) -> Result<FolderShare, ContractError> {
    let (login, folder) = server_folder(&app, &window)?;
    let body = json!({ "path": path, "email": email, "role": role });
    Ok(share_of(
        &ask(login, "PUT", path_of(&folder), Some(body)).await?,
    ))
}

/// Take a person out of the share at `path`, or remove the share when no
/// person is named (item 8).
#[tauri::command]
#[specta::specta]
pub(crate) async fn share_revoke<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
    account: Option<String>,
) -> Result<FolderShare, ContractError> {
    let (login, folder) = server_folder(&app, &window)?;
    let body = json!({ "path": path, "account": account });
    let at = format!("{}/revoke", path_of(&folder));
    Ok(share_of(&ask(login, "POST", at, Some(body)).await?))
}

/// Show the attachments folder with the share at `path`, read-only, or
/// stop showing it (item 11).
#[tauri::command]
#[specta::specta]
pub(crate) async fn share_attachments<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
    attachments: Option<String>,
) -> Result<FolderShare, ContractError> {
    let (login, folder) = server_folder(&app, &window)?;
    let body = json!({ "path": path, "attachments": attachments });
    let at = format!("{}/attachments", path_of(&folder));
    Ok(share_of(&ask(login, "PUT", at, Some(body)).await?))
}

/// Prove to the server behind this window that it is the person (ADR 0083
/// item 6): the device's session sends the account's password to
/// `/api/me/prove`, which stamps that session's own mark — a browser's
/// session is not touched. Asked when a sensitive action answered
/// `prove_first`; the window sends the action once more after. The
/// password is not kept. A passkey cannot be offered here: the window's
/// origin is the app's own, never the server's, which a passkey is bound
/// to.
#[tauri::command]
#[specta::specta]
pub(crate) async fn server_prove<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    password: String,
) -> Result<(), ContractError> {
    let (login, _) = server_folder(&app, &window)?;
    let body = json!({ "password": password });
    ask(login, "POST", "/api/me/prove".to_owned(), Some(body)).await?;
    Ok(())
}

/// The folders of this computer opened before, freshest first, for the
/// folder switcher's "On this computer" (ADR 0081 item 5): names and keys,
/// no path.
#[tauri::command]
#[specta::specta]
pub(crate) fn recent_folders(state: State<'_, App>) -> Vec<RecentFolder> {
    verso_core::recent_folders(state.service.config())
        .into_iter()
        .take(12)
        .map(|path| RecentFolder {
            key: verso_core::folder_key(&path),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
        })
        .collect()
}
