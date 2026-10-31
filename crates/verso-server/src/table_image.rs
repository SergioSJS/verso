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
use unicode_normalization::UnicodeNormalization;
use verso_contract::ContractError;
use verso_service::Access;

use crate::auth::Who;
use crate::db::Role;
use crate::rpc::{blocking, to_value};
use crate::state::Server;
use crate::table::file_ext;

/// What is told of a path or a right the person has none of.
const READS: &str = "you may only read this folder";

/// The folder's attachments place when the folder names none.
const PLACE: &str = "attachments";

/// The subfolder beside a note when a window names none the server accepts.
const DEFAULT_SUB: &str = "assets";
/// A subfolder's most bytes and segments.
const SUB_BYTES: usize = 120;
const SUB_DEPTH: usize = 4;
/// How many `assets`, `assets 2`… a player is tried with.
const SUB_TRIES: u32 = 50;

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
    // Whoever sends it, a table that is a subfolder keeps its images inside
    // its own folder: where its veil shows them to its players and hides them
    // from everyone outside it, a closed table included (and where a share
    // rooted at the table reads them).
    let s = Arc::clone(server);
    let f = folder.to_owned();
    let place = blocking(move || Ok(place_of(&s, &f))).await?;
    let dir = if table.is_empty() {
        place
    } else {
        format!("{table}/{place}")
    };
    let target = Target {
        folder,
        table,
        dir: Dir::Fixed(dir),
        door: None,
    };
    let path = store(server, who, client, &target, data, &check).await?;
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

/// The subfolder a window names for its attachments (its Settings), as the
/// server takes it (ADR 0113 item 5, where the file goes): relative, with no
/// `..` or other hidden segment, no empty one, no backslash or control
/// character, NFC, of a sane length; anything else is `assets`.
#[must_use]
pub fn clean_sub(sub: Option<&str>) -> String {
    let Some(raw) = sub else {
        return DEFAULT_SUB.to_owned();
    };
    let nfc: String = raw.trim().nfc().collect();
    let body = nfc.strip_suffix('/').unwrap_or(&nfc);
    let ok = !body.is_empty()
        && body.len() <= SUB_BYTES
        && body.split('/').count() <= SUB_DEPTH
        && body.split('/').all(|seg| {
            !seg.is_empty()
                && !seg.starts_with('.')
                && !seg.ends_with(' ')
                && !seg
                    .chars()
                    .any(|c| c.is_control() || r#"\<>:"|?*"#.contains(c))
        });
    if ok {
        body.to_owned()
    } else {
        DEFAULT_SUB.to_owned()
    }
}

/// `data` (base64) written beside the note or board the person edits
/// (`into`), in `assets` (`assets 2`… when a name is taken by something the
/// player does not see; the game master's `sub` is honoured), the place the
/// app puts any attachment of that file (ADR 0113 item 5, where the file
/// goes), with no entry in the chat. The rules' `Attach` is judged on `into`, and the same checks of the
/// bytes, the limit and the folder's quota apply as to an image sent to the
/// chat. The file takes, as its own access, that of `into`. Answers the
/// file's path as the window knows it.
pub async fn attach(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    (data, into, sub): (&str, &str, Option<&str>),
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
    // Beside the file. A player never names the folder (a name they choose
    // would be a probe for what they do not see): it is `assets`, else
    // `assets 2`, `assets 3`… the first that shows nothing of what they do not
    // see (`store` judges). Whoever is not a player names it in their
    // Settings, as their own paste does. Confined to the folder (or the
    // share) like any path a window names.
    let parent = into.rsplit_once('/').map(|(d, _)| d);
    let beside = |sub: &str| match parent {
        Some(d) => format!("{d}/{sub}"),
        None => sub.to_owned(),
    };
    let names: Vec<String> = if door.veiled() {
        std::iter::once(DEFAULT_SUB.to_owned())
            .chain((2..=SUB_TRIES).map(|n| format!("{DEFAULT_SUB} {n}")))
            .collect()
    } else {
        vec![clean_sub(sub)]
    };
    let mut tries = Vec::new();
    for name in names {
        let rel = beside(&name);
        let dir = match &door.scope {
            Some(s) => s.to_full_write(&rel),
            None => crate::scope::checked(&rel).map(|()| rel),
        };
        if let Ok(dir) = dir {
            tries.push(dir);
        }
    }
    let check = |_: &Server, image: bool| {
        crate::access::Door::of(server, who, client).is_ok_and(|d| {
            d.may_path(crate::access::Action::Attach { image }, &full)
                .allowed()
        })
    };
    let target = Target {
        folder: &folder,
        table: &table,
        dir: Dir::Tries(tries),
        door: Some((&door, &full)),
    };
    let path = store(server, who, client, &target, data, &check).await?;
    // A window on a share knows the file by its path from the share's root.
    let shown = match &door.scope {
        Some(s) => s.to_rel(&path).unwrap_or(path),
        None => path,
    };
    to_value(shown)
}

/// The folder a file is made in.
enum Dir {
    /// This one, a path of the folder.
    Fixed(String),
    /// The first of these that shows nothing of what the person does not
    /// see; none of them is refused.
    Tries(Vec<String>),
}

/// Where a file is made, and what the made file is kept as.
struct Target<'a> {
    folder: &'a str,
    /// The table's root (`""`: the folder is the table, or none holds it):
    /// whose limit is read.
    table: &'a str,
    /// The folder the file is made in.
    dir: Dir,
    /// A file put into another (`attach`): the person's door, and the path of
    /// the file it is put into, whose access the new file takes. Also the
    /// door that keeps a name taken by something hidden from being told.
    door: Option<(&'a crate::access::Door, &'a str)>,
}

/// The bytes checked and the file made; its path in the folder.
async fn store(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    target: &Target<'_>,
    data: &str,
    allowed: &(dyn Fn(&Server, bool) -> bool + Sync),
) -> Result<String, ContractError> {
    let (folder, table) = (target.folder, target.table);
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
    let file = match named(data) {
        Some(n) => n,
        None => {
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
            format!("mesa-{stamp}-{id}.{ext}")
        }
    };
    // The right depends on what the bytes are: an image, or another file.
    if !allowed(server, image_kind(ext)) {
        return Err(refused(READS));
    }
    let dir = match (&target.dir, target.door) {
        (Dir::Fixed(d), _) => d.clone(),
        (Dir::Tries(tries), Some((door, into))) => {
            let (s, d, k) = (Arc::clone(server), door.clone(), key.clone());
            let (tries, into, table) = (tries.clone(), into.to_owned(), table.to_owned());
            // The file it is put into is a file of the folder (an absent one
            // and a folder are told as a hidden one is).
            blocking(move || {
                s.service.with_key(&k, |ws| {
                    if !crate::access::Door::is_file(ws, &into) {
                        return Err(refused(READS).into());
                    }
                    tries
                        .into_iter()
                        .find(|t| d.dir_clear(ws, t, &table))
                        .ok_or_else(|| refused("the file could not be saved").into())
                })
            })
            .await?
        }
        (Dir::Tries(_), None) => return Err(refused(READS)),
    };
    let mut path = if dir.is_empty() {
        file
    } else {
        format!("{dir}/{file}")
    };
    // A name taken by something the person does not see is never answered as
    // taken: the next free one is used (the S1–S3 review, `guard_names`).
    let mut kept = None;
    if let Some((door, into)) = target.door {
        path = keep_name(server, door, &key, path).await?;
        kept = keep_access(server, (folder, &key), door, (into, &path)).await?;
    }
    let made = crate::rpc::folder_run(
        server,
        who,
        client,
        ("create_file", Access::Write, false, false),
        (folder, &key),
        json!({ "path": path, "base64": data }),
    )
    .await;
    let made = match made {
        Ok(m) => m,
        Err(e) => {
            // The file was not made: nor does its path keep a set of its own.
            if kept.is_some() {
                let (s, f, p) = (Arc::clone(server), folder.to_owned(), path.clone());
                let _ = blocking(move || {
                    s.db.access_follow(&f, &p).map_err(verso_service::failed)?;
                    crate::campaign::forget(&s, &f);
                    Ok(())
                })
                .await;
            }
            // What a create says depends on what the person does not see
            // (a twin, a file where a folder goes): one answer for all.
            return Err(if target.door.is_some() {
                refused("the file could not be saved")
            } else {
                e
            });
        }
    };
    let made = made.as_str().map_or(path, str::to_owned);
    if let Some(before) = kept {
        crate::campaign_cmds::changed(server, folder, &key, vec![made.clone()], Some(before)).await;
    }
    Ok(made)
}

/// `path` (of the folder), or the next free name when something the person
/// does not see holds it; the answer never says which.
async fn keep_name(
    server: &Arc<Server>,
    door: &crate::access::Door,
    key: &str,
    path: String,
) -> Result<String, ContractError> {
    let rel = match &door.scope {
        Some(s) => s
            .to_rel(&path)
            .ok_or_else(|| refused("not a path of this share"))?,
        None => path.clone(),
    };
    let (s, d, k) = (Arc::clone(server), door.clone(), key.to_owned());
    let args = blocking(move || {
        let mut a = json!({ "path": rel });
        s.service.with_key(&k, |ws| {
            d.guard_names(ws, "create_file", &mut a).map_err(Into::into)
        })?;
        Ok(a)
    })
    .await?;
    let given = args["path"].as_str().unwrap_or_default();
    match &door.scope {
        Some(s) => s.to_full_write(given),
        None => Ok(given.to_owned()),
    }
}

/// The access the file put into `into` has, given to `path` as its own set
/// before the file is made (the sync log then says it with the file): so
/// that exactly the players who see `into` see the file — a folder's set
/// over its subfolder neither hides it nor widens it. Only inside a table,
/// and only when `path` would not follow the same set already. The table as
/// it was, when a set was written.
async fn keep_access(
    server: &Arc<Server>,
    (folder, key): (&str, &str),
    door: &crate::access::Door,
    (into, path): (&str, &str),
) -> Result<Option<Arc<crate::campaign::Veil>>, ContractError> {
    let Some(veil) = door.veil.clone() else {
        return Ok(None);
    };
    if !veil.in_table(into) || !veil.in_table(path) {
        return Ok(None);
    }
    let want = veil.effective_set(into);
    if veil.effective_set(path) == want {
        return Ok(None);
    }
    // A path that is a file already keeps what it has: nothing is overwritten
    // here, nor rolled back later.
    let (s, k, p) = (Arc::clone(server), key.to_owned(), path.to_owned());
    if blocking(move || {
        s.service
            .with_key(&k, |ws| Ok(crate::access::Door::is_file(ws, &p)))
    })
    .await?
    {
        return Ok(None);
    }
    let (s, f, p) = (Arc::clone(server), folder.to_owned(), path.to_owned());
    blocking(move || {
        s.db.access_put(&f, &p, want)
            .map_err(verso_service::failed)?;
        crate::campaign::forget(&s, &f);
        Ok(())
    })
    .await?;
    Ok(Some(veil))
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

/// The names the tests give to the files whose bytes they send, so that a
/// name taken by something hidden can be met: by the base64 sent.
#[cfg(test)]
pub(crate) static NAMES: std::sync::Mutex<Vec<(String, String)>> =
    std::sync::Mutex::new(Vec::new());

/// The name the tests chose for `data`.
#[cfg(test)]
fn named(data: &str) -> Option<String> {
    NAMES
        .lock()
        .ok()?
        .iter()
        .find(|(d, _)| d == data)
        .map(|(_, n)| n.clone())
}

/// Outside the tests a file's name is always generated.
#[cfg(not(test))]
fn named(_: &str) -> Option<String> {
    None
}
