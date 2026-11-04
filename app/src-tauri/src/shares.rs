// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The owner shares a folder of theirs (ADR 0081 item 7) from the desktop
//! app: in a window on a server's folder online, or in a window on a folder
//! of this computer that syncs with one — the share is made on that
//! server's folder, by the path of the folder inside it. The server checks
//! that the account owns the folder; this side only says where.

use serde_json::{Value, json};
use verso_contract::{
    FolderShare, ReadLinkInfo, ReadLinkMade, ReadLinks, RecentFolder, SharePerson,
};
use verso_core::servers::ServerLogin;

use super::*;
use crate::dns::SendRetrying;

/// Where this window's requests to its server go: a server it is signed
/// in to, by the device's token, or this computer's own server through the
/// owner's window's seat (ADR 0117 D4 Q3) — answered in process, through
/// the seat's door alone: its token and an address are refused anywhere
/// else (`verso_server::local::Policy::bearer_who`).
enum Door {
    Login(ServerLogin),
    Seat(Arc<verso_server::local::Seat>),
}

/// The server and its folder behind this window: the one it shows
/// online, or the one its folder of this computer syncs with.
fn server_folder<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
) -> Result<(Door, String), ContractError> {
    let state = app.state::<App>();
    let (url, folder) = if let Some(r) = remote::of(app, window.label()) {
        if let Some((seat, _)) = &r.seat {
            return Ok((Door::Seat(Arc::clone(seat)), r.folder.clone()));
        }
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
    Ok((Door::Login(login), folder))
}

/// One request to the server, its answer as JSON: with the device's
/// token, or through the seat's door.
async fn ask(
    door: Door,
    method: &'static str,
    path: String,
    body: Option<Value>,
) -> Result<Value, ContractError> {
    let login = match door {
        Door::Login(login) => login,
        Door::Seat(seat) => return ask_seat(seat, method, path, body).await,
    };
    tauri::async_runtime::spawn_blocking(move || {
        let client = remote::http()?;
        let url = format!("{}{path}", login.url);
        let server = login.url;
        let request = match method {
            "PUT" => client.put(url),
            "POST" => client.post(url),
            "DELETE" => client.delete(url),
            _ => client.get(url),
        }
        .bearer_auth(login.token);
        let request = match body {
            Some(b) => request.json(&b),
            None => request,
        };
        remote::answer(
            request
                .send_retrying()
                .map_err(|e| reach::unsent(&server, &e))?,
        )
    })
    .await
    .map_err(|e| verso_service::failed(e.to_string()))?
}

/// One request of this computer's own server through the seat's door
/// (`Seat::request` waits, so off the async threads); a refusal as a
/// server's is said.
async fn ask_seat(
    seat: Arc<verso_server::local::Seat>,
    method: &'static str,
    path: String,
    body: Option<Value>,
) -> Result<Value, ContractError> {
    tauri::async_runtime::spawn_blocking(move || {
        let a = seat
            .request(method, &path, body.as_ref())
            .map_err(|e| refused(&e))?;
        let v: Value = serde_json::from_slice(&a.body).unwrap_or(Value::Null);
        if (200..300).contains(&a.status) {
            Ok(v)
        } else {
            Err(remote::error_of(a.status, &v))
        }
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
    let (door, folder) = server_folder(&app, &window)?;
    let v = ask(door, "GET", path_of(&folder), None).await?;
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
    let (door, folder) = server_folder(&app, &window)?;
    let body = json!({ "path": path, "email": email, "role": role });
    Ok(share_of(
        &ask(door, "PUT", path_of(&folder), Some(body)).await?,
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
    let (door, folder) = server_folder(&app, &window)?;
    let body = json!({ "path": path, "account": account });
    let at = format!("{}/revoke", path_of(&folder));
    Ok(share_of(&ask(door, "POST", at, Some(body)).await?))
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
    let (door, folder) = server_folder(&app, &window)?;
    let body = json!({ "path": path, "attachments": attachments });
    let at = format!("{}/attachments", path_of(&folder));
    Ok(share_of(&ask(door, "PUT", at, Some(body)).await?))
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
    let (door, _) = server_folder(&app, &window)?;
    let body = json!({ "password": password });
    ask(door, "POST", "/api/me/prove".to_owned(), Some(body)).await?;
    Ok(())
}

/// Where a folder sits, as a label that tells two folders of one name apart
/// (the folder switcher): its parent, `~/` for the home, at most the last
/// two folders of it (`~/…/Documents/obsidian`), and for a parent outside
/// the home only those two behind an ellipsis (`…/Volumes/Disco`). Never an
/// absolute path and never with `..`: a label to read, not a path to use
/// (ADR 0026 rule 4).
pub(crate) fn place_of(folder: &Path, home: Option<&Path>) -> String {
    use std::path::Component;
    let Some(parent) = folder.parent() else {
        return String::new();
    };
    let inside = home.and_then(|h| parent.strip_prefix(h).ok());
    let parts: Vec<String> = inside
        .unwrap_or(parent)
        .components()
        .filter_map(|c| match c {
            Component::Normal(n) => Some(n.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    let tail = parts[parts.len().saturating_sub(2)..].join("/");
    match (inside.is_some(), parts.len()) {
        (true, 0) => "~".to_owned(),
        (true, 1 | 2) => format!("~/{tail}"),
        (true, _) => format!("~/…/{tail}"),
        (false, 0) => String::new(),
        (false, _) => format!("…/{tail}"),
    }
}

/// The folders of this computer opened before, freshest first, for the
/// folder switcher's "On this computer" (ADR 0081 item 5): names, keys and
/// a short label of where each sits, no path.
#[tauri::command]
#[specta::specta]
pub(crate) fn recent_folders(state: State<'_, App>) -> Vec<RecentFolder> {
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    verso_core::recent_folders(state.service.config())
        .into_iter()
        .take(40)
        .map(|path| RecentFolder {
            key: verso_core::folder_key(&path),
            place: place_of(&path, home.as_deref()),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
        })
        .collect()
}

/// A read link as the server says it (ADR 0105).
fn read_link_of(v: &Value) -> ReadLinkInfo {
    ReadLinkInfo {
        id: v["id"].as_str().unwrap_or_default().to_owned(),
        kind: v["kind"].as_str().unwrap_or_default().to_owned(),
        path: v["path"].as_str().unwrap_or_default().to_owned(),
        made_by: v["madeBy"].as_str().unwrap_or_default().to_owned(),
        made_at: v["madeAt"].as_f64().unwrap_or_default(),
        expires: v["expires"].as_f64(),
        has_password: v["hasPassword"] == true,
        last_opened: v["lastOpened"].as_f64(),
        open: u32::try_from(v["open"].as_u64().unwrap_or_default()).unwrap_or(u32::MAX),
    }
}

fn read_links_path(id: &str) -> String {
    path_of(id).replace("/shares", "/readlinks")
}

/// The read links of the window's folder, and whether the server has them
/// on (ADR 0105 item 5); only the folder's owner is answered.
#[tauri::command]
#[specta::specta]
pub(crate) async fn read_link_list<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<ReadLinks, ContractError> {
    let (door, folder) = server_folder(&app, &window)?;
    let v = ask(door, "GET", read_links_path(&folder), None).await?;
    Ok(ReadLinks {
        enabled: v["enabled"] == true,
        links: v["links"]
            .as_array()
            .into_iter()
            .flatten()
            .map(read_link_of)
            .collect(),
    })
}

/// How many notes under `path` (or the one note) hold secret blocks:
/// readers of a link will not see them (item 7).
#[tauri::command]
#[specta::specta]
pub(crate) async fn read_link_secrets<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    kind: String,
    path: String,
) -> Result<u32, ContractError> {
    let (door, folder) = server_folder(&app, &window)?;
    let encode = |s: &str| {
        s.bytes()
            .map(|b| {
                if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
                    char::from(b).to_string()
                } else {
                    format!("%{b:02X}")
                }
            })
            .collect::<String>()
    };
    let at = format!(
        "{}/secrets?kind={}&path={}",
        read_links_path(&folder),
        encode(&kind),
        encode(&path)
    );
    let v = ask(door, "GET", at, None).await?;
    Ok(u32::try_from(v["notes"].as_u64().unwrap_or_default()).unwrap_or(u32::MAX))
}

/// Make a read link to a folder or a note, with an optional expiry (1, 7
/// or 30 days, or a date) and an optional passphrase (item 5).
#[tauri::command]
#[specta::specta]
pub(crate) async fn read_link_create<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    kind: String,
    path: String,
    expires_days: Option<u32>,
    expires_at: Option<f64>,
    password: Option<String>,
) -> Result<ReadLinkMade, ContractError> {
    let (door, folder) = server_folder(&app, &window)?;
    let base = match &door {
        Door::Login(login) => login.url.trim_end_matches('/').to_owned(),
        // The window at its own server's table: the owner's click is the
        // fresh proof making a link asks (ADR 0117 D4 Q4), and the address
        // is where this server's links open now — the internet link's
        // while it is on, else the network's.
        Door::Seat(seat) => {
            seat.acted("read_link_create").map_err(|e| refused(&e))?;
            crate::local_server::server_for_link(&app)
                .ok()
                .and_then(|l| l.links_base())
                .or_else(|| seat.origin().map(str::to_owned))
                .ok_or_else(|| refused("serving stopped: turn it on to make a read link"))?
        }
    };
    let body = json!({
        "kind": kind, "path": path, "expiresDays": expires_days,
        // Whole seconds: a date has no fraction.
        "expiresAt": expires_at.map(|x| x.round() as i64), "password": password,
    });
    let v = ask(door, "POST", read_links_path(&folder), Some(body)).await?;
    Ok(ReadLinkMade {
        url: format!("{base}{}", v["path"].as_str().unwrap_or_default()),
        link: read_link_of(&v["link"]),
    })
}

/// Revoke a read link: it ends at once, open pages included.
#[tauri::command]
#[specta::specta]
pub(crate) async fn read_link_revoke<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    id: String,
) -> Result<(), ContractError> {
    let (door, folder) = server_folder(&app, &window)?;
    let id: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        .collect();
    ask(
        door,
        "DELETE",
        format!("{}/{id}", read_links_path(&folder)),
        None,
    )
    .await?;
    Ok(())
}
