// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The table (ADR 0107, decided 2026-10-21): one channel per folder,
//! beside the rooms of its notes. Every window that has the folder open
//! joins it; a roll or an oracle draw made in any note's room is relayed
//! to that room as before **and** appended to the folder's table, rolled
//! once, by the server. Typed messages and images join the rolls in the
//! same log, which is kept in the server's database (`db/table.rs`) with
//! no expiry.
//!
//! The server stamps everything it can: the author's name, the time, the
//! number. A window sends only what it chose — a text, an image, a
//! notation, its dice's appearance (checked against the closed form,
//! `table_look.rs`). Who hears an entry is decided here, from the folder's
//! roles, never by the window: a secret roll reaches its roller and the
//! owners (item 7), a roll made inside a note with secret blocks does not
//! reach the readers (ADR 0087 item 4).
//!
//! Bounds (ADR 0083, item 12 of the ADR): a message is at most
//! [`MESSAGE_CHARS`] characters of plain text and is refused unparsed past
//! [`SAY_MESSAGE`] bytes (`inflight.rs`); an image is checked by its bytes
//! and at most [`IMAGE_BYTES`]; every message, image and roll a connection
//! sends is paced (`Server::table_pace`); a table holds [`MEMBERS_MOST`]
//! windows; a join answers [`JOIN_ENTRIES`] entries and a page at most
//! [`PAGE_MOST`]; a folder's log keeps [`crate::db::ROWS_MOST`] entries.
//! Text is never written to the server's log.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use verso_contract::{
    ContractError, DiceRoll, DiceStyles, ErrorKind, OracleDraw, TableCleared, TableEntry,
    TableJoin, TableMember, TablePage, TablePinned, TableRemoved,
};
use verso_service::lock;

use crate::auth::Who;
use crate::db::{Role, TableRow};
use crate::rpc::{arg, blocking, role_here, to_value};
use crate::state::Server;

/// The most characters of a message.
pub const MESSAGE_CHARS: usize = 500;
/// The most bytes of a `table_say` message before it is parsed: 500
/// characters of four bytes escaped, with room for the rest (`inflight`).
pub const SAY_MESSAGE: usize = 4096;
/// The most bytes of an image, decoded.
pub const IMAGE_BYTES: usize = 10 * 1024 * 1024;
/// The most windows at one table.
pub const MEMBERS_MOST: usize = 64;
/// The entries a join answers, besides the pinned ones.
pub const JOIN_ENTRIES: i64 = 100;
/// The most entries of a page of history.
pub const PAGE_MOST: i64 = 200;
/// The pace of a connection's messages, images and rolls: a second's
/// worth sustained, and a burst.
pub const RATE: f64 = 5.0;
pub const BURST: f64 = 20.0;
/// The colour a roster entry gets when its window sends none.
const COLOUR: &str = "#b5651d";

/// What the commands of the table are.
pub const COMMANDS: [&str; 9] = [
    "table_join",
    "table_leave",
    "table_look",
    "table_say",
    "table_send_image",
    "table_roll",
    "table_pin",
    "table_delete",
    "table_clear",
];

/// The commands of the table, including the page of history.
#[must_use]
pub fn is_command(cmd: &str) -> bool {
    cmd == "table_history" || COMMANDS.contains(&cmd)
}

struct Member {
    account: String,
    name: String,
    color: String,
    styles: Option<DiceStyles>,
}

/// The windows at each folder's table, by folder id.
#[derive(Default)]
pub struct Tables {
    map: Mutex<HashMap<String, HashMap<String, Member>>>,
}

/// What an entry holds besides its columns, as kept.
#[derive(Default, Serialize, Deserialize)]
struct Body {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    roll: Option<DiceRoll>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    draw: Option<OracleDraw>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    image: Option<String>,
}

fn refused(message: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message: message.to_owned(),
    }
}

fn failed(e: impl std::fmt::Display) -> ContractError {
    verso_service::failed(e.to_string())
}

/// The entry `row` as `viewer` (an account in a role) may see it: none for
/// what the viewer is not told, a secret roll without its content for those
/// it was not rolled to.
fn view(row: &TableRow, viewer: &str, role: Role) -> Option<TableEntry> {
    if row.readers_hidden && role == Role::Reader {
        return None;
    }
    let masked = row.secret && row.account != viewer && role != Role::Owner;
    let body: Body = if masked {
        Body::default()
    } else {
        serde_json::from_str(&row.body).unwrap_or_default()
    };
    Some(TableEntry {
        id: row.id.to_string(),
        kind: if masked { "secret" } else { row.kind.as_str() }.to_owned(),
        by: row.by_name.clone(),
        by_id: row.account.clone(),
        at: row.at.clone(),
        path: if masked { None } else { row.path.clone() },
        pinned: row.pinned,
        secret: row.secret,
        roll: body.roll,
        draw: body.draw,
        text: body.text,
        image: body.image,
    })
}

/// The entry `row` as `account` in `role` sees it.
pub(crate) fn seen(row: &TableRow, account: &str, role: Role) -> Option<TableEntry> {
    view(row, account, role)
}

/// A new `image` entry for the file at `path`, kept and told.
pub(crate) fn image_entry(
    server: &Server,
    folder: &str,
    (account, name): (&str, &str),
    path: &str,
) -> Result<TableRow, ContractError> {
    append(
        server,
        folder,
        New {
            kind: "image",
            account,
            name,
            path: None,
            secret: false,
            readers_hidden: false,
            body: Body {
                image: Some(path.to_owned()),
                ..Body::default()
            },
        },
    )
}

/// The account and role of window `client` in `folder` now.
fn viewer_of(server: &Server, client: &str, folder: &str) -> Option<(String, Role)> {
    let clients = lock(&server.clients);
    let c = clients.get(client)?;
    let (f, role) = c.folder.as_ref()?;
    (f == folder).then(|| (c.account.clone(), *role))
}

fn member_clients(server: &Server, folder: &str) -> Vec<String> {
    lock(&server.tables.map)
        .get(folder)
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default()
}

fn is_member(server: &Server, folder: &str, client: &str) -> bool {
    lock(&server.tables.map)
        .get(folder)
        .is_some_and(|m| m.contains_key(client))
}

/// `row`, told to each window at the table as it may see it.
fn tell_row(server: &Server, folder: &str, row: &TableRow) {
    for client in member_clients(server, folder) {
        let Some((account, role)) = viewer_of(server, &client, folder) else {
            continue;
        };
        if let Some(entry) = view(row, &account, role) {
            server.push(
                &[client],
                &json!({ "event": "table-entry", "payload": entry }),
            );
        }
    }
}

/// `message` told to each window at the table.
fn tell_all(server: &Server, folder: &str, event: &str, payload: &impl Serialize) {
    let to = member_clients(server, folder);
    if !to.is_empty() {
        server.push(&to, &json!({ "event": event, "payload": payload }));
    }
}

/// Who is at the table: one per account, in the order they came.
fn roster(server: &Server, folder: &str) -> Vec<TableMember> {
    let map = lock(&server.tables.map);
    let Some(members) = map.get(folder) else {
        return Vec::new();
    };
    let mut all: Vec<(&String, &Member)> = members.iter().collect();
    all.sort_by(|a, b| a.0.cmp(b.0));
    let mut seen = std::collections::HashSet::new();
    all.into_iter()
        .filter(|(_, m)| seen.insert(m.account.clone()))
        .map(|(_, m)| TableMember {
            name: m.name.clone(),
            by_id: m.account.clone(),
            color: m.color.clone(),
            styles: m.styles.clone(),
        })
        .collect()
}

fn tell_roster(server: &Server, folder: &str) {
    let roster = roster(server, folder);
    tell_all(server, folder, "table-roster", &roster);
}

/// The window `client` left: out of every table it was at.
pub fn gone(server: &Server, client: &str) {
    let mut left = Vec::new();
    {
        let mut map = lock(&server.tables.map);
        map.retain(|folder, members| {
            if members.remove(client).is_some() {
                left.push(folder.clone());
            }
            !members.is_empty()
        });
    }
    for folder in left {
        tell_roster(server, &folder);
    }
}

/// Whether the connection `client` may send another message, image or
/// roll now (ADR 0107 item 12).
pub fn pace(server: &Server, client: &str) -> Result<(), ContractError> {
    match server.table_pace.take(&format!("table:{client}")) {
        None => Ok(()),
        Some(wait) => Err(refused(&format!("too fast: wait {wait} s"))),
    }
}

/// Whether the connection `client` may roll or draw another now: the REST
/// routes' pace, per connection, for the rolls of the table and of a note's
/// room alike (a roll in a room is kept by the table).
pub fn pace_roll(server: &Server, client: &str) -> Result<(), ContractError> {
    match server.roll_pace.take(&format!("roll:{client}")) {
        None => Ok(()),
        Some(wait) => Err(refused(&format!("too fast: wait {wait} s"))),
    }
}

/// What is appended to the log.
struct New<'a> {
    kind: &'a str,
    account: &'a str,
    name: &'a str,
    path: Option<String>,
    secret: bool,
    readers_hidden: bool,
    body: Body,
}

/// Keep `n` in `folder`'s log and tell the table: the row as kept.
fn append(server: &Server, folder: &str, n: New<'_>) -> Result<TableRow, ContractError> {
    let mut row = TableRow {
        id: 0,
        kind: n.kind.to_owned(),
        account: n.account.to_owned(),
        by_name: n.name.to_owned(),
        at: crate::log::stamp(),
        path: n.path,
        pinned: false,
        secret: n.secret,
        readers_hidden: n.readers_hidden,
        body: serde_json::to_string(&n.body).map_err(failed)?,
    };
    row.id = server.db.table_add(folder, &row).map_err(failed)?;
    tell_row(server, folder, &row);
    Ok(row)
}

/// The folder id behind folder key `key`.
fn folder_of_key(server: &Server, key: &str) -> Option<String> {
    lock(&server.keys).get(key).cloned()
}

/// A roll made in a note's room (`collab_dice.rs`), told to the folder's
/// table too. `secret`: not told to the room, to its roller and the owners
/// only. `readers_hidden`: made inside a note with secret blocks, which the
/// folder's readers are not told. Not for a window on a share.
pub fn note_roll(
    server: &Server,
    who: &crate::presence::Sender,
    key: &str,
    path: &str,
    roll: &DiceRoll,
    (secret, readers_hidden): (bool, bool),
) {
    note(
        server,
        who,
        key,
        New {
            kind: "roll",
            account: who.account,
            name: who.name,
            path: Some(path.to_owned()),
            secret,
            readers_hidden,
            body: Body {
                roll: Some(roll.clone()),
                ..Body::default()
            },
        },
    );
}

/// An oracle draw made in a note's room, told to the table too.
pub fn note_oracle(
    server: &Server,
    who: &crate::presence::Sender,
    key: &str,
    path: &str,
    draw: &OracleDraw,
    readers_hidden: bool,
) {
    note(
        server,
        who,
        key,
        New {
            kind: "oracle",
            account: who.account,
            name: who.name,
            path: Some(path.to_owned()),
            secret: false,
            readers_hidden,
            body: Body {
                draw: Some(draw.clone()),
                ..Body::default()
            },
        },
    );
}

fn note(server: &Server, who: &crate::presence::Sender, key: &str, n: New<'_>) {
    // A window on a share is not at the folder's table (ADR 0081): its
    // rolls stay in the share's rooms.
    if crate::shares::scope_here(server, who.client).is_some() {
        return;
    }
    let Some(folder) = folder_of_key(server, key) else {
        return;
    };
    if let Err(e) = append(server, &folder, n) {
        crate::log::warn(&format!("keeping a roll for the table: {}", e.message));
    }
}

/// A path the window names as the note it rolled from: relative to the
/// folder, never absolute or with `..` (ADR 0026 rule 4).
fn note_path(path: &str) -> Result<String, ContractError> {
    let ok = !path.is_empty()
        && path.chars().count() <= 512
        && !path.starts_with('/')
        && !path.contains('\\')
        && !path.chars().any(char::is_control)
        && path.split('/').all(|p| p != ".." && p != ".");
    if ok {
        Ok(path.to_owned())
    } else {
        Err(refused("a note's path within the folder"))
    }
}

/// A message as it is kept: plain text of at most [`MESSAGE_CHARS`]
/// characters, no control character but a line break, not empty.
pub fn message(text: &str) -> Result<String, ContractError> {
    if text.chars().count() > MESSAGE_CHARS {
        return Err(refused(&format!(
            "a message is at most {MESSAGE_CHARS} characters"
        )));
    }
    if text.chars().any(|c| c.is_control() && c != '\n') {
        return Err(refused("a message is plain text"));
    }
    let text = text.trim();
    if text.is_empty() {
        return Err(refused("a message has some text"));
    }
    Ok(text.to_owned())
}

/// The kind of image `bytes` are, by their first bytes and never by a
/// name: PNG, JPEG, WebP or GIF; an SVG, or anything else, is none.
#[must_use]
pub fn image_ext(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("jpg")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else {
        None
    }
}

/// The role `who` acts in: the folder's, no more than a paired phone's.
fn acting(who: &Who, role: Role) -> Role {
    who.phone.map_or(role, |p| p.min(role))
}

/// The commands of the table (ADR 0107).
pub async fn command(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    cmd: &str,
    args: Value,
) -> Result<Value, ContractError> {
    if crate::shares::scope_here(server, client).is_some() {
        return Err(refused("a share has no table"));
    }
    let (folder, folder_role) = role_here(server, client)?;
    let role = acting(who, folder_role);
    let account = who.account.id.clone();
    let name = who.account.name.clone();
    let s = Arc::clone(server);
    // Only a window at the table speaks at it.
    if !matches!(cmd, "table_join" | "table_leave" | "table_history")
        && !is_member(&s, &folder, client)
    {
        return Err(refused("join the table first"));
    }
    match cmd {
        "table_join" => {
            let color: Option<String> = arg(&args, "color")?;
            let styles: Option<DiceStyles> = arg(&args, "styles")?;
            let color = color
                .map(|c| crate::table_look::colour(&c).map_err(|e| refused(&e)))
                .transpose()?
                .unwrap_or_else(|| COLOUR.to_owned());
            let styles = styles
                .map(|v| crate::table_look::check(&v).map_err(|e| refused(&e)))
                .transpose()?;
            {
                let mut map = lock(&s.tables.map);
                let members = map.entry(folder.clone()).or_default();
                if members.len() >= MEMBERS_MOST && !members.contains_key(client) {
                    return Err(refused("the table is full"));
                }
                members.insert(
                    client.to_owned(),
                    Member {
                        account: account.clone(),
                        name,
                        color,
                        styles,
                    },
                );
            }
            tell_roster(&s, &folder);
            let f = folder.clone();
            let joined = blocking(move || join(&s, &f, &account, role)).await?;
            to_value(joined)
        }
        "table_leave" => {
            gone(&s, client);
            Ok(Value::Null)
        }
        "table_look" => {
            let color: Option<String> = arg(&args, "color")?;
            let styles: Option<DiceStyles> = arg(&args, "styles")?;
            let color = color
                .map(|c| crate::table_look::colour(&c).map_err(|e| refused(&e)))
                .transpose()?;
            let styles = styles
                .map(|v| crate::table_look::check(&v).map_err(|e| refused(&e)))
                .transpose()?;
            {
                let mut map = lock(&s.tables.map);
                if let Some(m) = map.get_mut(&folder).and_then(|m| m.get_mut(client)) {
                    if let Some(c) = color {
                        m.color = c;
                    }
                    m.styles = styles;
                }
            }
            tell_roster(&s, &folder);
            Ok(Value::Null)
        }
        "table_history" => {
            let before: Option<String> = arg(&args, "before")?;
            let limit: Option<u32> = arg(&args, "limit")?;
            let before = before
                .map(|b| {
                    b.parse::<i64>()
                        .map_err(|_| refused("not an entry's number"))
                })
                .transpose()?;
            let limit = i64::from(limit.unwrap_or(50)).clamp(1, PAGE_MOST);
            let (rows, more) = blocking(move || {
                s.db.table_page(&folder, before, limit, role == Role::Reader)
                    .map_err(failed)
            })
            .await?;
            let mut entries: Vec<TableEntry> = rows
                .iter()
                .filter_map(|r| view(r, &account, role))
                .collect();
            entries.reverse();
            to_value(TablePage { entries, more })
        }
        "table_say" => {
            let text: String = arg(&args, "text")?;
            let text = message(&text)?;
            pace(&s, client)?;
            let row = blocking(move || {
                append(
                    &s,
                    &folder,
                    New {
                        kind: "say",
                        account: &account,
                        name: &name,
                        path: None,
                        secret: false,
                        readers_hidden: false,
                        body: Body {
                            text: Some(text),
                            ..Body::default()
                        },
                    },
                )
            })
            .await?;
            let who_id = who.account.id.clone();
            to_value(view(&row, &who_id, role))
        }
        "table_send_image" => {
            if !(folder_role.writes() && who.reaches(&folder).1 && role.writes()) {
                return Err(refused("you may only read this folder"));
            }
            let data: String = arg(&args, "base64")?;
            pace(&s, client)?;
            crate::table_image::send(server, who, client, (&folder, role), &data).await
        }
        "table_roll" => {
            let notation: String = arg(&args, "notation")?;
            let source: Option<String> = arg(&args, "source")?;
            let path: Option<String> = arg(&args, "path")?;
            let secret: Option<bool> = arg(&args, "secret")?;
            let styles: Option<DiceStyles> = arg(&args, "styles")?;
            let path = path.map(|p| note_path(&p)).transpose()?;
            let styles = styles
                .map(|v| crate::table_look::check(&v).map_err(|e| refused(&e)))
                .transpose()?;
            let read = crate::dice::read(&notation).map_err(|e| refused(&e))?;
            let source = crate::dice::source(source).map_err(|e| refused(&e))?;
            pace_roll(&s, client)?;
            let secret = secret.unwrap_or(false);
            let row = blocking(move || {
                let mut rolled = crate::dice::roll(
                    &read,
                    source,
                    &name,
                    &crate::log::stamp(),
                    &mut crate::dice::system,
                )
                .map_err(failed)?;
                rolled.styles = styles;
                append(
                    &s,
                    &folder,
                    New {
                        kind: "roll",
                        account: &account,
                        name: &name,
                        path,
                        secret,
                        readers_hidden: false,
                        body: Body {
                            roll: Some(rolled),
                            ..Body::default()
                        },
                    },
                )
            })
            .await?;
            let who_id = who.account.id.clone();
            to_value(view(&row, &who_id, role))
        }
        "table_pin" => {
            let id = entry_id(&args)?;
            let pinned: bool = arg(&args, "pinned")?;
            let f = folder.clone();
            let found = blocking(move || {
                let Some(row) = s.db.table_get(&f, id).map_err(failed)? else {
                    return Ok(false);
                };
                if row.readers_hidden && role == Role::Reader {
                    return Ok(false);
                }
                s.db.table_set_pinned(&f, id, pinned).map_err(failed)
            })
            .await?;
            if !found {
                return Err(not_found());
            }
            let payload = TablePinned {
                id: id.to_string(),
                pinned,
            };
            tell_all(server, &folder, "table-pinned", &payload);
            Ok(Value::Null)
        }
        "table_delete" => {
            let id = entry_id(&args)?;
            let f = folder.clone();
            blocking(move || {
                let Some(row) = s.db.table_get(&f, id).map_err(failed)? else {
                    return Err(not_found());
                };
                if row.readers_hidden && role == Role::Reader {
                    return Err(not_found());
                }
                // A roll is not deleted one by one: nobody re-rolls and
                // hides the first (item 6).
                if !matches!(row.kind.as_str(), "say" | "image") {
                    return Err(refused("a roll is not deleted one by one"));
                }
                if row.account != account && role != Role::Owner {
                    return Err(refused("only its author or an owner deletes an entry"));
                }
                s.db.table_delete(&f, id).map_err(failed)?;
                Ok(())
            })
            .await?;
            tell_all(
                server,
                &folder,
                "table-removed",
                &TableRemoved { id: id.to_string() },
            );
            Ok(Value::Null)
        }
        "table_clear" => {
            if role != Role::Owner {
                return Err(refused("only an owner clears the table"));
            }
            let keep: Option<bool> = arg(&args, "keepPinned")?;
            let keep_pinned = keep.unwrap_or(true);
            let f = folder.clone();
            blocking(move || s.db.table_clear(&f, keep_pinned).map_err(failed)).await?;
            tell_all(
                server,
                &folder,
                "table-cleared",
                &TableCleared { keep_pinned },
            );
            Ok(Value::Null)
        }
        _ => Err(refused("no such command")),
    }
}

fn not_found() -> ContractError {
    ContractError {
        kind: ErrorKind::NotFound,
        message: "no such entry".to_owned(),
    }
}

fn entry_id(args: &Value) -> Result<i64, ContractError> {
    let id: String = arg(args, "id")?;
    id.parse::<i64>()
        .map_err(|_| refused("not an entry's number"))
}

/// The latest entries and every pinned one, and the roster.
fn join(
    server: &Server,
    folder: &str,
    account: &str,
    role: Role,
) -> Result<TableJoin, ContractError> {
    let readers = role == Role::Reader;
    let (latest, more) = server
        .db
        .table_page(folder, None, JOIN_ENTRIES, readers)
        .map_err(failed)?;
    let mut rows = server.db.table_pinned(folder, readers).map_err(failed)?;
    rows.extend(latest);
    rows.sort_by_key(|r| r.id);
    rows.dedup_by_key(|r| r.id);
    Ok(TableJoin {
        you: account.to_owned(),
        role: role.as_str().to_owned(),
        entries: rows.iter().filter_map(|r| view(r, account, role)).collect(),
        more,
        roster: roster(server, folder),
    })
}
