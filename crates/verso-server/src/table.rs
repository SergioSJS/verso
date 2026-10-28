// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The table (ADR 0107, decided 2026-10-21): one channel per table,
//! beside the rooms of its notes. A table is a server folder and the
//! table's root inside it (`""` for the folder itself; a folder with no
//! campaign table has just that one, the folder-wide table of 0107's
//! first form), decided 2026-10-23: "o chat deve ser 1 por mesa". Every
//! window that has the folder open joins the table it works in; a roll or
//! an oracle draw made in a note's room is relayed to that room as before
//! **and** appended to the table that holds the note, rolled once, by the
//! server. Typed messages and images join the rolls in the
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
//! [`PAGE_MOST`]; a table's log keeps [`crate::db::ROWS_MOST`] entries.
//! Text is never written to the server's log.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use verso_contract::{
    ContractError, DiceRoll, DiceStyles, ErrorKind, OracleDraw, TableCleared, TableEntry,
    TableImages, TableJoin, TableMember, TablePage, TablePinned, TableRemoved, TableRoster,
};
use verso_service::lock;

use crate::access::{Action, Kind};
use crate::auth::Who;
use crate::db::{Role, TableRow};
use crate::rpc::{arg, blocking, to_value};
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
pub const COMMANDS: [&str; 10] = [
    "table_join",
    "table_leave",
    "table_look",
    "table_say",
    "table_send_image",
    "table_attach",
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

/// A table: the folder's id and the table's root in it (`""`: the folder).
type Key = (String, String);

/// The windows at each table, by folder id and table root. A window may be
/// at several tables of a folder (the sync's connection of a desktop is one
/// window for all the windows of that app).
#[derive(Default)]
pub struct Tables {
    map: Mutex<HashMap<Key, HashMap<String, Member>>>,
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
    view_in(row, viewer, role, None)
}

/// [`view`] in a folder with a table (ADR 0110 item 4): a reader is not
/// told the note a roll was made from when the table has not released it.
fn view_in(
    row: &TableRow,
    viewer: &str,
    role: Role,
    veil: Option<&crate::campaign::Veil>,
) -> Option<TableEntry> {
    let mut entry = view_masked(row, viewer, role)?;
    if let (Some(veil), Role::Reader) = (veil, role)
        && entry
            .path
            .as_deref()
            .is_some_and(|p| veil.hides_note_from(p, viewer))
    {
        entry.path = None;
        if let Some(roll) = entry.roll.as_mut() {
            roll.source = None;
        }
    }
    Some(entry)
}

fn view_masked(row: &TableRow, viewer: &str, role: Role) -> Option<TableEntry> {
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
        table: row.table.clone(),
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
pub(crate) fn seen(
    row: &TableRow,
    account: &str,
    role: Role,
    root: Option<&str>,
) -> Option<TableEntry> {
    scoped(view(row, account, role), root)
}

/// A new `image` entry (a `file` entry when the file is no image, K.4) for
/// the file at `path`, kept and told.
pub(crate) fn image_entry(
    server: &Server,
    (folder, table): (&str, &str),
    (account, name): (&str, &str),
    path: &str,
) -> Result<TableRow, ContractError> {
    // The image is a file the table shows: its veil is made again.
    let made = append(
        server,
        (folder, table),
        New {
            kind: if is_image_path(path) { "image" } else { "file" },
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
    );
    crate::campaign::forget(server, folder);
    made
}

/// Whether the stored file at `path` is an image, by the extension the
/// server itself gave it.
fn is_image_path(path: &str) -> bool {
    matches!(
        path.rsplit('.').next(),
        Some("png" | "jpg" | "webp" | "gif")
    )
}

/// The entry as a window on a share of the table's folder knows it: the
/// note's path written from the share's root (none when it is outside).
fn scoped(entry: Option<TableEntry>, root: Option<&str>) -> Option<TableEntry> {
    let mut e = entry?;
    let Some(root) = root else {
        return Some(e);
    };
    e.table = String::new();
    e.path = e.path.and_then(|p| {
        crate::db::covers(root, &p).then(|| p[root.len()..].trim_start_matches('/').to_owned())
    });
    // An image is a file of the table's folder: written from the share's
    // root too (none when it is outside).
    e.image = e.image.and_then(|p| {
        crate::db::covers(root, &p).then(|| p[root.len()..].trim_start_matches('/').to_owned())
    });
    if let Some(roll) = e.roll.as_mut()
        && e.path.is_none()
    {
        roll.source = None;
    }
    Some(e)
}

/// The account and role (in the table's log, [`crate::access::log_role`])
/// of window `client` in `folder` now.
fn viewer_of(
    server: &Server,
    client: &str,
    folder: &str,
) -> Option<(String, Role, Option<String>)> {
    let (account, asker, root) = {
        let clients = lock(&server.clients);
        let c = clients.get(client)?;
        let (f, _) = c.folder.as_ref()?;
        if f != folder {
            return None;
        }
        (
            c.account.clone(),
            crate::access::asker_of(c),
            c.scope.as_ref().map(|s| s.root.clone()),
        )
    };
    let role = crate::access::log_role(&asker, crate::access::has_table(server, folder));
    Some((account, role, root))
}

fn key_of(folder: &str, table: &str) -> Key {
    (folder.to_owned(), table.to_owned())
}

fn member_clients(server: &Server, folder: &str, table: &str) -> Vec<String> {
    lock(&server.tables.map)
        .get(&key_of(folder, table))
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default()
}

fn is_member(server: &Server, folder: &str, table: &str, client: &str) -> bool {
    lock(&server.tables.map)
        .get(&key_of(folder, table))
        .is_some_and(|m| m.contains_key(client))
}

/// `row`, told to each window at its table as it may see it.
fn tell_row(server: &Server, folder: &str, row: &TableRow) {
    for client in member_clients(server, folder, &row.table) {
        let Some((account, role, root)) = viewer_of(server, &client, folder) else {
            continue;
        };
        let veil = crate::campaign::veil_of(server, folder);
        let seen = scoped(
            view_in(row, &account, role, veil.as_deref()),
            root.as_deref(),
        );
        if let Some(entry) = seen {
            server.push(
                &[client],
                &json!({ "event": "table-entry", "payload": entry }),
            );
        }
    }
}

/// `message` told to each window at the table.
fn tell_all(server: &Server, (folder, table): (&str, &str), event: &str, payload: &impl Serialize) {
    let base = serde_json::to_value(payload).unwrap_or(Value::Null);
    for client in member_clients(server, folder, table) {
        // A window on a share knows its table as the share's own root, `""`.
        let on_share = viewer_of(server, &client, folder).is_some_and(|v| v.2.is_some());
        let mut p = base.clone();
        if on_share && p.get("table").is_some() {
            p["table"] = json!("");
        }
        server.push(&[client], &json!({ "event": event, "payload": p }));
    }
}

/// Who is at the table: one per account, in the order they came.
fn roster(server: &Server, folder: &str, table: &str) -> Vec<TableMember> {
    let map = lock(&server.tables.map);
    let Some(members) = map.get(&key_of(folder, table)) else {
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

fn tell_roster(server: &Server, folder: &str, table: &str) {
    let members = roster(server, folder, table);
    let payload = TableRoster {
        table: table.to_owned(),
        members,
    };
    tell_all(server, (folder, table), "table-roster", &payload);
}

/// The window `client` left: out of every table it was at, or of the
/// tables of `folder` only when one is named.
pub fn gone(server: &Server, client: &str) {
    leave(server, client, None);
}

/// The window `client` left `table` of `folder`, or every table it was at
/// when none is named.
fn leave(server: &Server, client: &str, only: Option<(&str, &str)>) {
    let mut left = Vec::new();
    {
        let mut map = lock(&server.tables.map);
        map.retain(|key, members| {
            let named = only.is_none_or(|(f, t)| key.0 == f && key.1 == t);
            if named && members.remove(client).is_some() {
                left.push(key.clone());
            }
            !members.is_empty()
        });
    }
    for (folder, table) in left {
        tell_roster(server, &folder, &table);
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

/// Keep `n` in the log of `table` of `folder` and tell the table: the row
/// as kept.
fn append(
    server: &Server,
    (folder, table): (&str, &str),
    n: New<'_>,
) -> Result<TableRow, ContractError> {
    let mut row = TableRow {
        id: 0,
        table: table.to_owned(),
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

/// The root of the table a folder's calls with no table named (an old
/// peer's) go to: the folder's shortest-rooted table, else the folder.
fn default_root(server: &Server, folder: &str) -> String {
    crate::campaign::veil_of(server, folder)
        .and_then(|v| v.tables.first().map(|t| t.root.clone()))
        .unwrap_or_default()
}

/// The table `requested` names in `folder`, as the server keeps its root:
/// none named is the default table; a name must be a path inside the
/// folder (relative, no `..`, ADR 0026 rule 4) that is a table of it, or
/// `""` in a folder with no table.
pub(crate) fn table_named(
    server: &Server,
    folder: &str,
    requested: Option<&str>,
) -> Result<String, ContractError> {
    let Some(asked) = requested else {
        return Ok(default_root(server, folder));
    };
    let ok = asked.chars().count() <= 512
        && !asked.starts_with('/')
        && !asked.contains('\\')
        && !asked.chars().any(char::is_control)
        && asked.split('/').all(|p| p != ".." && p != ".");
    if !ok {
        return Err(refused("a table's folder within the folder"));
    }
    let asked = asked.trim_end_matches('/');
    match crate::campaign::veil_of(server, folder) {
        None if asked.is_empty() => Ok(String::new()),
        Some(veil) => veil
            .tables
            .iter()
            .find(|t| crate::campaign::key(&t.root) == crate::campaign::key(asked))
            .map(|t| t.root.clone())
            .ok_or_else(|| refused("no such table")),
        None => Err(refused("no such table")),
    }
}

/// The table of a window on a share: the table the share is rooted at, and
/// no other. A share whose root is no table has none.
fn share_table(
    server: &Server,
    folder: &str,
    root: &str,
    named: Option<&str>,
) -> Result<String, ContractError> {
    let own =
        table_named(server, folder, Some(root)).map_err(|_| refused("a share has no table"))?;
    // The window names its table as it knows it: the share's own root, `""`.
    if named.is_some_and(|n| !n.is_empty()) {
        return Err(refused("a share reaches its own table only"));
    }
    Ok(own)
}

/// The table a note at `path` belongs to: the deepest table that holds it,
/// else the folder's default.
fn table_of_path(server: &Server, folder: &str, path: &str) -> String {
    crate::campaign::veil_of(server, folder)
        .and_then(|v| v.table(path).map(|t| t.root.clone()))
        .unwrap_or_else(|| default_root(server, folder))
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
        path,
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
        path,
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

fn note(server: &Server, who: &crate::presence::Sender, key: &str, path: &str, n: New<'_>) {
    // A window on a share is not at the folder's table (ADR 0081): its
    // rolls stay in the share's rooms.
    let Some(folder) = folder_of_key(server, key) else {
        return;
    };
    let table = table_of_path(server, &folder, path);
    // A window on a share: its rolls reach the table the share is rooted at
    // (and only when the note is in it); a share that is no table keeps them
    // in the share's rooms.
    if let Some(scope) = crate::shares::scope_here(server, who.client)
        && table_named(server, &folder, Some(&scope.root)).as_ref() != Ok(&table)
    {
        return;
    }
    if let Err(e) = append(server, (&folder, &table), n) {
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

/// Whether `bytes` start with an MPEG audio frame header: the 11-bit sync,
/// a version other than the reserved one, a layer other than the reserved
/// one, Layer II or III only (so `FF FE` of a UTF-16 text is none).
fn mpeg_frame(bytes: &[u8]) -> bool {
    bytes.len() >= 4
        && bytes[0] == 0xff
        && bytes[1] & 0xe0 == 0xe0
        && bytes[1] & 0x18 != 0x08
        && matches!(bytes[1] & 0x06, 0x02 | 0x04)
        && bytes[2] >> 4 != 0x0f
}

/// The kind of file `bytes` are for *Send files* (ADR 0113 K.4), by their
/// first bytes and never by a name: an image (see [`image_ext`]), a PDF, or
/// audio (MP3, Ogg, WAV, M4A). An SVG, a page, a script or anything else
/// is none.
#[must_use]
pub fn file_ext(bytes: &[u8]) -> Option<&'static str> {
    if let Some(ext) = image_ext(bytes) {
        return Some(ext);
    }
    if bytes.starts_with(b"%PDF-") {
        Some("pdf")
    } else if bytes.starts_with(b"ID3") || mpeg_frame(bytes) {
        Some("mp3")
    } else if bytes.starts_with(b"OggS") {
        Some("ogg")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        Some("wav")
    } else if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" && &bytes[8..12] == b"M4A " {
        Some("m4a")
    } else {
        None
    }
}

/// The commands of the table (ADR 0107).
pub async fn command(
    server: &Arc<Server>,
    who: &Arc<Who>,
    client: &str,
    cmd: &str,
    args: Value,
) -> Result<Value, ContractError> {
    // A window on a share reaches the table the share is rooted at, and
    // only that one (ADR 0110 item 8 as amended 2026-10-23); a share that
    // is no table has none.
    let scope = crate::shares::scope_here(server, client).map(|s| s.root);
    let door = crate::access::Door::of(server, who, client)?;
    let folder = door.folder.clone();
    // The role the log speaks of: by the seat (ADR 0113 item 3), never by
    // the credential.
    let role = crate::access::log_role(&door.asker, door.has_table());
    let account = who.account.id.clone();
    let name = who.account.name.clone();
    let s = Arc::clone(server);
    // A file put into a note or board the person edits: the table is the
    // note's, and the person need not be at the table's panel (ADR 0113 D).
    if cmd == "table_attach" {
        let data: String = arg(&args, "base64")?;
        let into: String = arg(&args, "into")?;
        let sub: Option<String> = arg(&args, "sub")?;
        pace(&s, client)?;
        return crate::table_image::attach(server, who, client, (&data, &into, sub.as_deref()))
            .await;
    }
    // The table the call is for: the one it names (a real table of the
    // folder, ADR 0107 as amended 2026-10-23), the folder's default for an
    // old peer that names none.
    let named: Option<String> = arg(&args, "table")?;
    let table = {
        let (s, f, sc) = (Arc::clone(&s), folder.clone(), scope.clone());
        blocking(move || match sc {
            Some(root) => share_table(&s, &f, &root, named.as_deref()),
            None => table_named(&s, &f, named.as_deref()),
        })
        .await?
    };
    // Only a window at the table speaks at it.
    if !matches!(cmd, "table_join" | "table_leave" | "table_history")
        && !is_member(&s, &folder, &table, client)
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
                let members = map.entry(key_of(&folder, &table)).or_default();
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
            tell_roster(&s, &folder, &table);
            let (f, t) = (folder.clone(), table.clone());
            let sc = scope.clone();
            let mut joined =
                blocking(move || join(&s, (&f, &t), &account, role, sc.as_deref())).await?;
            joined.images = door
                .may(Action::SendFile { image: true }, &table, Kind::Table)
                .allowed();
            joined.files = door
                .may(Action::SendFile { image: false }, &table, Kind::Table)
                .allowed();
            to_value(joined)
        }
        "table_leave" => {
            // A table named leaves that one; none named, every table of
            // the window's (an old peer's leave, or a closing window).
            let only: Option<String> = arg(&args, "table")?;
            if only.is_some() {
                leave(&s, client, Some((&folder, &table)));
            } else {
                gone(&s, client);
            }
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
                if let Some(m) = map
                    .get_mut(&key_of(&folder, &table))
                    .and_then(|m| m.get_mut(client))
                {
                    if let Some(c) = color {
                        m.color = c;
                    }
                    m.styles = styles;
                }
            }
            tell_roster(&s, &folder, &table);
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
            let veil = crate::campaign::veil_of(&s, &folder);
            let (rows, more) = blocking(move || {
                s.db.table_page(&folder, &table, before, limit, role == Role::Reader)
                    .map_err(failed)
            })
            .await?;
            let mut entries: Vec<TableEntry> = rows
                .iter()
                .filter_map(|r| {
                    scoped(
                        view_in(r, &account, role, veil.as_deref()),
                        scope.as_deref(),
                    )
                })
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
                    (&folder, &table),
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
            to_value(scoped(view(&row, &who_id, role), scope.as_deref()))
        }
        "table_send_image" => {
            // As a member: the share only bounds what is seen. The file is
            // kept inside the table's own folder, whoever sends it.
            // ADR 0107 item 3 as amended 2026-10-24 (`may_send_images`). Which
            // right it takes — *Images* or *Files* — depends on the bytes, and
            // is judged again once they are known (`table_image::send`).
            let (image, other) = (
                door.may(Action::SendFile { image: true }, &table, Kind::Table),
                door.may(Action::SendFile { image: false }, &table, Kind::Table),
            );
            if !image.allowed() && !other.allowed() {
                return Err(refused("you may only read this folder"));
            }
            let data: String = arg(&args, "base64")?;
            pace(&s, client)?;
            crate::table_image::send(
                server,
                who,
                client,
                (&folder, &table, role),
                (&data, scope.as_deref()),
            )
            .await
        }
        "table_roll" => {
            let notation: String = arg(&args, "notation")?;
            let source: Option<String> = arg(&args, "source")?;
            let path: Option<String> = arg(&args, "path")?;
            let secret: Option<bool> = arg(&args, "secret")?;
            let styles: Option<DiceStyles> = arg(&args, "styles")?;
            let occurrence: Option<u32> = arg(&args, "occurrence")?;
            let occurrence = crate::dice::occurrence(occurrence);
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
                rolled.occurrence = occurrence;
                append(
                    &s,
                    (&folder, &table),
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
            to_value(scoped(view(&row, &who_id, role), scope.as_deref()))
        }
        "table_pin" => {
            let id = entry_id(&args)?;
            let pinned: bool = arg(&args, "pinned")?;
            let (f, t) = (folder.clone(), table.clone());
            let found = blocking(move || {
                let Some(row) = s.db.table_get(&f, &t, id).map_err(failed)? else {
                    return Ok(false);
                };
                if row.readers_hidden && role == Role::Reader {
                    return Ok(false);
                }
                s.db.table_set_pinned(&f, &t, id, pinned).map_err(failed)
            })
            .await?;
            if !found {
                return Err(not_found());
            }
            let payload = TablePinned {
                table: table.clone(),
                id: id.to_string(),
                pinned,
            };
            tell_all(server, (&folder, &table), "table-pinned", &payload);
            Ok(Value::Null)
        }
        "table_delete" => {
            let id = entry_id(&args)?;
            let (f, t) = (folder.clone(), table.clone());
            blocking(move || {
                let Some(row) = s.db.table_get(&f, &t, id).map_err(failed)? else {
                    return Err(not_found());
                };
                if row.readers_hidden && role == Role::Reader {
                    return Err(not_found());
                }
                // A player does not delete a roll: nobody re-rolls and
                // hides the first (item 6). The game master may
                // (ADR 0107, 2026-10-23).
                let roll = !matches!(row.kind.as_str(), "say" | "image" | "file");
                let own = row.account == account;
                if !door
                    .may(Action::DeleteEntry { own, roll }, &t, Kind::Table)
                    .allowed()
                {
                    return Err(refused(if roll {
                        "only an owner deletes a roll"
                    } else {
                        "only its author or an owner deletes an entry"
                    }));
                }
                s.db.table_delete(&f, &t, id).map_err(failed)?;
                Ok(())
            })
            .await?;
            tell_all(
                server,
                (&folder, &table),
                "table-removed",
                &TableRemoved {
                    table: table.clone(),
                    id: id.to_string(),
                },
            );
            Ok(Value::Null)
        }
        "table_clear" => {
            if !door.may(Action::Clear, &table, Kind::Table).allowed() {
                return Err(refused("only an owner clears the table"));
            }
            let keep: Option<bool> = arg(&args, "keepPinned")?;
            let keep_pinned = keep.unwrap_or(true);
            let (f, t) = (folder.clone(), table.clone());
            blocking(move || s.db.table_clear(&f, &t, keep_pinned).map_err(failed)).await?;
            tell_all(
                server,
                (&folder, &table),
                "table-cleared",
                &TableCleared {
                    table: table.clone(),
                    keep_pinned,
                },
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

/// The latest entries of the table and every pinned one, and the roster.
fn join(
    server: &Server,
    (folder, table): (&str, &str),
    account: &str,
    role: Role,
    scope: Option<&str>,
) -> Result<TableJoin, ContractError> {
    let readers = role == Role::Reader;
    let veil = crate::campaign::veil_of(server, folder);
    let (latest, more) = server
        .db
        .table_page(folder, table, None, JOIN_ENTRIES, readers)
        .map_err(failed)?;
    let mut rows = server
        .db
        .table_pinned(folder, table, readers)
        .map_err(failed)?;
    rows.extend(latest);
    rows.sort_by_key(|r| r.id);
    rows.dedup_by_key(|r| r.id);
    Ok(TableJoin {
        table: if scope.is_some() {
            String::new()
        } else {
            table.to_owned()
        },
        you: account.to_owned(),
        role: role.as_str().to_owned(),
        entries: rows
            .iter()
            .filter_map(|r| scoped(view_in(r, account, role, veil.as_deref()), scope))
            .collect(),
        more,
        roster: roster(server, folder, table),
        images: false,
        files: false,
    })
}

/// Whether this window may send a file to `table` (ADR 0107 item 3 as
/// amended 2026-10-24, ADR 0113 K.6): an image by *Images*, any other file
/// by *Files* — the one rule the send, the join and the status share: the
/// rules' `SendFile`. The table is the one the window is at: a share only
/// bounds what is seen.
pub(crate) fn may_send_images(
    server: &Server,
    who: &Who,
    client: &str,
    table: &str,
    image: bool,
) -> bool {
    crate::access::Door::of(server, who, client).is_ok_and(|door| {
        door.may(Action::SendFile { image }, table, Kind::Table)
            .allowed()
    })
}

/// The permission to send images changed for `accounts` at `table`: their
/// windows at the table are told at once, so the attach button, the paste
/// and the drop appear or go away as they are.
pub(crate) fn tell_images(server: &Server, (folder, table): (&str, &str), accounts: &[String]) {
    let clients: Vec<String> = {
        let map = lock(&server.tables.map);
        map.get(&key_of(folder, table))
            .map(|m| {
                m.iter()
                    .filter(|(_, m)| accounts.contains(&m.account))
                    .map(|(c, _)| c.clone())
                    .collect()
            })
            .unwrap_or_default()
    };
    for client in clients {
        let on_share = viewer_of(server, &client, folder).is_some_and(|v| v.2.is_some());
        // One lock for both answers: a second `lock` in the same statement
        // would wait for the first.
        let (images, files) = lock(&server.clients)
            .get(&client)
            .map_or((false, false), |c| {
                let ask = |image| {
                    crate::access::may_client(
                        server,
                        c,
                        Action::SendFile { image },
                        table,
                        Kind::Table,
                    )
                };
                (ask(true), ask(false))
            });
        let payload = TableImages {
            table: if on_share {
                String::new()
            } else {
                table.to_owned()
            },
            images,
            files,
        };
        server.push(
            std::slice::from_ref(&client),
            &json!({ "event": "table-images", "payload": payload }),
        );
        // The right is access too: the window asks again what it shows.
        server.push(
            &[client],
            &json!({ "event": "access-changed", "payload": { "paths": [] } }),
        );
    }
}
