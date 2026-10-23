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
use crate::table::image_ext;

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
    (folder, role): (&str, Role),
    data: &str,
) -> Result<Value, ContractError> {
    // The table's own limit (ADR 0110, MS.1), its default when the folder
    // is no table. Base64 takes four characters for three bytes: judged
    // before decoding.
    let limit = crate::campaign::image_limit(server, folder);
    if data.len() > limit / 3 * 4 + 8 {
        return Err(refused(&format!(
            "an image is at most {} MB",
            limit / (1024 * 1024)
        )));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|_| refused("the bytes are not base64"))?;
    if bytes.len() > limit {
        return Err(refused(&format!(
            "an image is at most {} MB",
            limit / (1024 * 1024)
        )));
    }
    let ext = image_ext(&bytes).ok_or_else(|| refused("a PNG, JPEG, WebP or GIF image"))?;
    let key = server
        .service
        .folder_of(client)
        .ok_or_else(verso_service::no_folder)?;
    let s = Arc::clone(server);
    let f = folder.to_owned();
    let place = blocking(move || Ok(place_of(&s, &f))).await?;
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
    let made = crate::rpc::folder_run(
        server,
        who,
        client,
        ("create_file", Access::Write, false),
        (folder, &key),
        json!({ "path": path, "base64": data }),
    )
    .await?;
    let path = made.as_str().map_or(path, str::to_owned);
    let s = Arc::clone(server);
    let (f, account, name) = (
        folder.to_owned(),
        who.account.id.clone(),
        who.account.name.clone(),
    );
    let p = path.clone();
    let row = blocking(move || crate::table::image_entry(&s, &f, (&account, &name), &p)).await?;
    to_value(crate::table::seen(&row, &who.account.id, role))
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
