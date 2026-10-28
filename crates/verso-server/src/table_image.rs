// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! An image sent to the table (ADR 0107 item 3, decided 2026-10-21, and
//! its option A): written as a file into the folder's attachments place by
//! the sender's action, through the same path as any file a window creates
//! (`rpc::folder_run` of `create_file`: the folder's quota, the sync log,
//! the confinement of `verso-fs`), and the entry names that file. Someone
//! who may only read the folder writes no file, so sends no image; the
//! message is refused before it is parsed (`inflight.rs`) and again here.
//! The bytes are judged by their first bytes, not a name: PNG, JPEG, WebP
//! or GIF, at most the table's limit ([`IMAGE_BYTES`](crate::table::IMAGE_BYTES) by default), never an
//! SVG. The file is served by the folder's file route with its own type
//! and `nosniff` (ADR 0083 items 8 and 9).

use std::sync::Arc;

use base64::Engine;
use serde_json::{Value, json};
use verso_contract::ContractError;
use verso_service::Access;

use crate::auth::Who;
use crate::db::Role;
use crate::rpc::{blocking, to_value};
use crate::state::Server;
use crate::table::file_ext;

/// The folder's attachments place when the folder names none.
const PLACE: &str = "attachments";

fn refused(message: &str) -> ContractError {
    ContractError {
        kind: verso_contract::ErrorKind::Refused,
        message: message.to_owned(),
    }
}

/// `data` (base64) checked and written into the attachments place of
/// `folder`, as the file of a new `image` entry: the entry as its sender
/// sees it.
pub async fn send(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    (folder, table, role): (&str, &str, Role),
    (data, inside): (&str, Option<&str>),
) -> Result<Value, ContractError> {
    // The permission may have been taken back while the bytes were on their
    // way: judged again right before the file is written.
    let check = |server: &Server, image: bool| {
        crate::table::may_send_images(server, who, client, table, image)
    };
    let path = store(server, who, client, (folder, table), data, &check).await?;
    let s = Arc::clone(server);
    let (f, t, account, name) = (
        folder.to_owned(),
        table.to_owned(),
        who.account.id.clone(),
        who.account.name.clone(),
    );
    let p = path.clone();
    let row =
        blocking(move || crate::table::image_entry(&s, (&f, &t), (&account, &name), &p)).await?;
    to_value(crate::table::seen(&row, &who.account.id, role, inside))
}

/// `data` (base64) written into the table's attachments place for a note or
/// board the person edits (`into`), with no entry in the chat (ADR 0113
/// item 5, D): the rules' `Attach` on the file, and the same checks of the
/// bytes, the limit and the folder's quota as an image sent to the chat.
/// Answers the file's path in the folder.
pub async fn attach(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    (data, into): (&str, &str),
) -> Result<Value, ContractError> {
    let door = crate::access::Door::of(server, who, client)?;
    let full = match &door.scope {
        Some(s) => s.to_full_write(into)?,
        None => into.to_owned(),
    };
    let table = door
        .veil
        .as_ref()
        .and_then(|v| v.table(&full).map(|t| t.root.clone()))
        .unwrap_or_default();
    let folder = door.folder.clone();
    let check = |_: &Server, image: bool| {
        crate::access::Door::of(server, who, client).is_ok_and(|d| {
            d.may_path(crate::access::Action::Attach { image }, &full)
                .allowed()
        })
    };
    let path = store(server, who, client, (&folder, &table), data, &check).await?;
    // A window on a share knows the file by its path from the share's root.
    let shown = match &door.scope {
        Some(s) => s.to_rel(&path).unwrap_or(path),
        None => path,
    };
    to_value(shown)
}

/// The bytes checked and the file made; its path in the folder.
async fn store(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    (folder, table): (&str, &str),
    data: &str,
    allowed: &(dyn Fn(&Server, bool) -> bool + Sync),
) -> Result<String, ContractError> {
    // The table's own limit (ADR 0110, MS.1), its default when the folder
    // is no table. Base64 takes four characters for three bytes: judged
    // before decoding.
    let limit = crate::campaign::image_limit(server, folder, table);
    if data.len() > limit / 3 * 4 + 8 {
        return Err(refused(&format!(
            "a file is at most {} MB",
            limit / (1024 * 1024)
        )));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|_| refused("the bytes are not base64"))?;
    if bytes.len() > limit {
        return Err(refused(&format!(
            "a file is at most {} MB",
            limit / (1024 * 1024)
        )));
    }
    let ext = file_ext(&bytes)
        .ok_or_else(|| refused("an image, a PDF or an audio file (not SVG, a page or a script)"))?;
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    let s = Arc::clone(server);
    let f = folder.to_owned();
    let place = blocking(move || Ok(place_of(&s, &f))).await?;
    // Whoever sends it, a table that is a subfolder keeps its images inside
    // its own folder: where its veil shows them to its players and hides them
    // from everyone outside it, a closed table included (and where a share
    // rooted at the table reads them).
    let place = if table.is_empty() {
        place
    } else {
        format!("{table}/{place}")
    };
    let id: String = crate::crypto::id()
        .map_err(verso_service::failed)?
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .take(8)
        .collect();
    let stamp: String = crate::log::stamp()
        .chars()
        .filter(char::is_ascii_digit)
        .collect();
    let path = format!("{place}/mesa-{stamp}-{id}.{ext}");
    // The right depends on what the bytes are: an image, or another file.
    if !allowed(server, image_kind(ext)) {
        return Err(refused("you may only read this folder"));
    }
    let made = crate::rpc::folder_run(
        server,
        who,
        client,
        ("create_file", Access::Write, false, false),
        (folder, &key),
        json!({ "path": path, "base64": data }),
    )
    .await?;
    Ok(made.as_str().map_or(path, str::to_owned))
}

/// Whether the extension `file_ext` found is an image's.
fn image_kind(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "gif" | "webp")
}

/// The folder's attachments place: Obsidian's setting for it when the
/// folder names one, else `attachments`.
fn place_of(server: &Server, folder: &str) -> String {
    server
        .db
        .folder(folder)
        .ok()
        .flatten()
        .and_then(|f| server.folder_path(&f.dir))
        .and_then(|p| verso_core::attachments_folder(&p))
        .unwrap_or_else(|| PLACE.to_owned())
}
