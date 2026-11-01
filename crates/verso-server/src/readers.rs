// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What a UniVerso serves an account that may only read a note, beyond the
//! folder's commands (ADR 0087 items 2 and 4; those are `verso-service`'s
//! `reader.rs`, a room's are `collab_readers.rs`): sync and what the
//! server pushes. The bytes a reader's device receives are the note's
//! projection, and the hash its manifest and its change log name is the
//! projection's, so a change made only inside a secret block is no change
//! for a reader — no new version, no notice, no new time.
//!
//! "Reads only" is the session's: a role that does not write, or a
//! credential that may not (a read-only token), as every other command
//! judges it (`rpc::folder_command`).

use serde_json::{Value, json};
use verso_contract::{ContractError, ErrorKind};
use verso_service::lock;

use crate::auth::Who;
use crate::state::Server;

/// The server's own commands a reader may call, and why each gives no
/// byte of a secret block (ADR 0087 item 9). The folder's are
/// `verso_service::reader::READER_COMMANDS`; a command a reader may call
/// that is on neither list fails `tests_secret.rs`.
pub const SERVER_READS: &[(&str, &str)] = &[
    (
        "open_server_folder",
        "the folder's name, role and index counts",
    ),
    ("reopen_folder", "the same, by the folder's key"),
    ("current_folder", "the same"),
    ("reindex", "the index's counts"),
    ("capabilities", "what the session may do"),
    (
        "campaign_status",
        "the tables a reader can open, and only the notes it may edit (ADR 0110)",
    ),
    (
        "campaign_access",
        "who has access to a note the reader sees: names of the table's players, never a note's text (ADR 0110)",
    ),
    ("app_info", "the server's version"),
    ("render_markdown", "the window's own text"),
    ("project_secrets", "the window's own text, projected"),
    ("board_text", "the window's own board"),
    ("project_board", "the window's own board, projected"),
    ("log_write", "nothing: a line of the window's"),
    ("pick_folder", "nothing"),
    ("open_initial", "nothing"),
    ("set_walk_rules", "nothing: the owner's alone"),
    ("set_folder_note_name", "nothing: the owner's alone"),
    ("set_embed_origins", "nothing"),
    ("set_menu_language", "nothing"),
    (
        "set_history_days",
        "nothing: the computer's own retention (ADR 0091 item 8), a no-op here",
    ),
    (
        "note_made_from_template",
        "nothing: the desktop sync's (ADR 0093 item 12), a no-op here",
    ),
    ("fetch_file", "nothing"),
    ("fetch_focuses_file", "nothing"),
    (
        "collab_join",
        "a note with a secret block: its projection's own document",
    ),
    ("collab_awareness", "who is in the note, never where"),
    ("collab_leave", "nothing"),
    ("collab_present", "whether someone is in the note"),
    (
        "collab_roll",
        "a roll whose dice and table the projection shows",
    ),
    (
        "collab_oracle",
        "a draw whose words the asker sent; a reader hears a question only, never a word",
    ),
    (
        "table_join",
        "the table's entries a reader is told: a roll made inside a secret block is left out",
    ),
    ("table_leave", "nothing"),
    ("table_look", "the window's own colour and dice"),
    (
        "table_history",
        "the same entries, a page at a time, a hidden roll left out",
    ),
    ("table_say", "the window's own message"),
    (
        "table_roll",
        "a roll the server makes at the table, from no note",
    ),
    ("table_pin", "an entry the reader is told, pinned"),
    ("table_delete", "the reader's own message, deleted"),
    ("table_time", "the server's clock"),
    (
        "table_cannot_play",
        "nothing: a mark that this window cannot play the track, told to the game master",
    ),
    ("sync_state", "the projections' hashes and sizes"),
    (
        "sync_changes",
        "the changes a reader sees, with the projections' hashes",
    ),
    ("sync_read", "a note's projection"),
];

/// Whether what the window `client` of `who` is told of its folder is cut
/// for it: it is told the notes' projections, the secret blocks left out
/// (ADR 0087), or it is a player of a table and the veil cuts what it sees
/// (ADR 0110). The game master of a table is neither, whatever the
/// ceiling of its credential (ADR 0113 item 6); an editor outside a table
/// is neither.
pub fn reads_only(server: &Server, who: &Who, client: &str) -> Result<bool, ContractError> {
    let door = crate::access::Door::of(server, who, client)?;
    Ok(door.projects() || door.veiled())
}

/// `clients` as (those told through the log and the veil, the others),
/// judged as [`reads_only`]. A window that is not known is one of the
/// others.
pub fn split(server: &Server, clients: &[String]) -> (Vec<String>, Vec<String>) {
    let seen: Vec<(String, Option<(crate::access::Asker, String)>)> = {
        let table = lock(&server.clients);
        clients
            .iter()
            .map(|id| {
                let c = table.get(id).and_then(|c| {
                    c.folder
                        .as_ref()
                        .map(|(f, _)| (crate::access::asker_of(c), f.clone()))
                });
                (id.clone(), c)
            })
            .collect()
    };
    let mut tables: std::collections::HashMap<String, bool> = std::collections::HashMap::new();
    let (mut cut, mut whole) = (Vec::new(), Vec::new());
    for (id, c) in seen {
        let is_cut = match c {
            Some((asker, folder)) => {
                let table = *tables
                    .entry(folder.clone())
                    .or_insert_with(|| crate::access::has_table(server, &folder));
                crate::access::filtered(&asker, table)
            }
            None => false,
        };
        if is_cut { &mut cut } else { &mut whole }.push(id);
    }
    (cut, whole)
}

/// Whether `path` names a note, a file with secret blocks: case ignored,
/// and trailing dots and spaces, which a file system may drop from a name
/// (fails closed).
pub fn is_note(path: &str) -> bool {
    path.trim_end_matches(['.', ' '])
        .to_lowercase()
        .ends_with(".md")
}

/// Whether `path` names a board, the other file with something hidden
/// from readers: its secret pins (ADR 0090 item 5). Judged as [`is_note`].
pub fn is_board(path: &str) -> bool {
    path.trim_end_matches(['.', ' '])
        .to_lowercase()
        .ends_with(".canvas")
}

/// Whether a reader is served `path` as a projection of it: a note or a
/// board by its name.
pub fn is_served(path: &str) -> bool {
    is_note(path) || is_board(path)
}

/// What a reader is told of a note it is not served at all (past
/// [`crate::texts::TEXT_MOST`]): a size below zero, which its manifest and
/// its log leave out. The file's own size and hash would tell it how much a
/// secret block holds.
pub const HIDDEN: i64 = -1;

/// What a reader is told of the note or board at `path`: its projection's
/// hash and size when it holds a secret block or a secret pin, [`HIDDEN`]
/// for a file too large to be served; `None` when it holds none (or is
/// neither), and a reader is told the file as it is.
pub fn reader_of(
    server: &Server,
    key: &str,
    path: &str,
) -> Result<Option<(String, i64)>, ContractError> {
    // What the log keeps is told for the players together: a note is
    // served when any player sees it. Each player's own answer is cut from
    // it (`campaign_sync::viewer_*`).
    let veil = crate::campaign::veil_for_key(server, key).map(|v| v.union());
    reader_of_as(server, key, path, veil)
}

/// [`reader_of`] as the folder looks through `veil`.
pub fn reader_of_as(
    server: &Server,
    key: &str,
    path: &str,
    veil: Option<std::sync::Arc<crate::campaign::Veil>>,
) -> Result<Option<(String, i64)>, ContractError> {
    let p = path.to_owned();
    server
        .service
        .with_key(key, move |ws| reader_view_in(ws, veil.as_deref(), &p))
}

/// [`reader_of`] with the folder open, through `veil`.
pub fn reader_view_in(
    ws: &mut verso_core::Workspace,
    veil: Option<&crate::campaign::Veil>,
    p: &str,
) -> Result<Option<(String, i64)>, verso_service::OpError> {
    // A table's hidden file is not served to a reader at all (ADR 0110
    // item 4); the note a group edits is served whole.
    if let Some(veil) = veil {
        if crate::campaign_serve::is_hidden_in(ws, veil, p) {
            return Ok(Some((String::new(), HIDDEN)));
        }
        if veil.serves_whole(p) {
            return Ok(None);
        }
    }
    // A note by its name, or the file it really is (a link to one).
    if !ws.reader_names_note(p) {
        return Ok(None);
    }
    if ws
        .file_len(p)
        .is_some_and(|len| len > crate::texts::TEXT_MOST)
    {
        return Ok(Some((String::new(), HIDDEN)));
    }
    let bytes = ws.read_file(p)?;
    let text = String::from_utf8_lossy(&bytes);
    let projected = ws.reader_view(p, &text);
    let shown = match veil {
        Some(v) => {
            crate::campaign_serve::device_text(ws, v, p, projected.as_deref().unwrap_or(&text))
                .or(projected)
        }
        None => projected,
    };
    let Some(shown) = shown else {
        return Ok(None);
    };
    Ok(Some((
        crate::sync::sha256(shown.as_bytes()),
        i64::try_from(shown.len()).unwrap_or(i64::MAX),
    )))
}

/// A piece of the note at `path` as a reader's device reads it: of its
/// projection, never of the file (ADR 0087 item 4). The note is read and
/// projected whole for each piece — a note is 16 MB at most to a reader
/// — and a note that changed for a reader since its first piece is
/// refused as changed, as a file that changes while it crosses is.
pub fn read(
    server: &Server,
    client: &str,
    key: &str,
    path: &str,
    offset: u64,
) -> Result<(Value, Vec<u8>), ContractError> {
    let p = path.to_owned();
    // The note as this window's account sees it.
    let veil = crate::campaign::veil_for_client(server, key, client);
    let shown = server.service.with_key(key, move |ws| {
        if ws
            .file_len(&p)
            .is_some_and(|len| len > crate::texts::TEXT_MOST)
        {
            return Err(verso_service::refused(
                "a note past 16 MB is not served to one who may only read it",
            )
            .into());
        }
        let bytes = ws.reader_read_file(&p)?;
        match &veil {
            Some(v) => crate::campaign_serve::device_bytes(ws, v, &p, bytes),
            None => Ok(bytes),
        }
    })?;
    let hash = crate::sync::sha256(&shown);
    let place = (client.to_owned(), path.to_owned());
    {
        let mut began = lock(&server.transfers.reader_reads);
        if offset == 0 {
            began.insert(place.clone(), hash.clone());
        } else if began.get(&place) != Some(&hash) {
            began.remove(&place);
            return Err(ContractError {
                kind: ErrorKind::Changed,
                message: "changed while it crossed".to_owned(),
            });
        }
    }
    let size = shown.len() as u64;
    let start = usize::try_from(offset.min(size)).unwrap_or(usize::MAX);
    let end = start.saturating_add(crate::sync::PIECE).min(shown.len());
    let piece = shown.get(start..end).unwrap_or_default().to_vec();
    let done = end as u64 >= size;
    if done {
        lock(&server.transfers.reader_reads).remove(&place);
    }
    Ok((
        json!({ "size": size, "done": done, "hash": (offset == 0).then_some(hash) }),
        piece,
    ))
}

/// The folder's log moved on: every window on the folder hears it — a
/// reader only when a change of `paths` is one it sees (`seen`), with the
/// head of what it sees. Where the players each have a log of their own
/// (a table with notes released to some of them) a player is told only
/// when a path it sees is among `seen`, or it is one of `also` (the
/// accounts that lose a path with the change): a player outside a note's
/// audience is told neither the note, nor its changes, nor that any came.
pub fn push_sync_changed(
    server: &Server,
    (folder, key): (&str, &str),
    (head, paths): (i64, &[&str]),
    seen: &[&str],
    also: &[String],
) {
    let on_folder: Vec<String> = {
        let table = lock(&server.clients);
        table
            .iter()
            .filter(|(_, c)| c.folder.as_ref().is_some_and(|(f, _)| f == folder))
            .map(|(id, _)| id.clone())
            .collect()
    };
    let (readers, writers) = split(server, &on_folder);
    server.push_sync_changed(folder, head, paths, &writers);
    if (seen.is_empty() && also.is_empty()) || readers.is_empty() {
        return;
    }
    // Players of a table with notes released to some players each have
    // a log of their own: no head is told, each asks.
    if crate::campaign::veil_of(server, folder).is_some_and(|v| v.restricted()) {
        let heard = who_sees(server, key, &readers, seen, also);
        server.push_sync_changed(folder, -1, paths, &heard);
        return;
    }
    match server.db.reader_count(folder, i64::MAX) {
        Ok(reader_head) => server.push_sync_changed(folder, reader_head, seen, &readers),
        Err(e) => crate::log::warn(&format!("a reader's head: {e}")),
    }
}

/// Of the reader windows `readers`, those whose account sees a file among
/// `seen` or is one of `also`.
fn who_sees(
    server: &Server,
    key: &str,
    readers: &[String],
    seen: &[&str],
    also: &[String],
) -> Vec<String> {
    let accounts: Vec<(String, String)> = {
        let table = lock(&server.clients);
        readers
            .iter()
            .filter_map(|id| table.get(id).map(|c| (id.clone(), c.account.clone())))
            .collect()
    };
    let Some(veil) = crate::campaign::veil_for_key(server, key) else {
        return Vec::new();
    };
    let paths: Vec<String> = seen.iter().map(|p| (*p).to_owned()).collect();
    server
        .service
        .with_key(key, move |ws| {
            let mut by_account: std::collections::HashMap<String, bool> =
                std::collections::HashMap::new();
            Ok(accounts
                .into_iter()
                .filter(|(_, a)| {
                    *by_account.entry(a.clone()).or_insert_with(|| {
                        also.contains(a)
                            || paths
                                .iter()
                                .any(|p| !crate::campaign_serve::is_hidden_in(ws, &veil.view(a), p))
                    })
                })
                .map(|(id, _)| id)
                .collect())
        })
        .unwrap_or_default()
}

/// A board's room wrote its file: the readers of the folder, who are never
/// in a board's room (ADR 0090 item 5), hear the board changed as they hear
/// any change from outside — the watcher does not report what the server
/// wrote itself — and read it again, as the server serves it them. Told
/// like any change: not at all when only a secret pin changed.
pub fn board_saved(server: &Server, key: &str, path: &str) {
    let clients = server.service.clients_of(key);
    let (readers, _) = split(server, &clients);
    if readers.is_empty() {
        return;
    }
    let Some(index) = clients
        .first()
        .and_then(|c| server.service.current_folder(c))
        .map(|f| f.index)
    else {
        return;
    };
    let changed = verso_contract::FolderChanged {
        key: key.to_owned(),
        changed: vec![path.to_owned()],
        removed: Vec::new(),
        moved: Vec::new(),
        listing: false,
        index,
    };
    if let Ok(payload) = serde_json::to_value(&changed) {
        push_folder_changed(server, key, &readers, &payload);
    }
}

/// `changed`, the folder's change as the windows hear it, pushed to the
/// windows of `clients` on the folder of `key`: whole to those who may
/// write; to readers, without the notes whose last change only touched a
/// secret block — and not at all when nothing is left.
pub fn push_folder_changed(server: &Server, key: &str, clients: &[String], changed: &Value) {
    let (readers, writers) = split(server, clients);
    let event = |payload: &Value| json!({ "event": "folder-changed", "payload": payload });
    server.push(&writers, &event(changed));
    if readers.is_empty() {
        return;
    }
    // What the reader's log tells as unchanged for a reader (a change only
    // inside a secret block): the same for every reader.
    let quiet: Vec<String> = match lock(&server.keys).get(key).cloned() {
        Some(folder) => {
            let paths: Vec<String> = changed["changed"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .filter(|p| is_served(p))
                .map(str::to_owned)
                .collect();
            server
                .db
                .reader_unchanged(&folder, &paths)
                .unwrap_or_default()
        }
        None => Vec::new(),
    };
    // Each reader is told what it may know: a table's hidden notes are not
    // told to its players (ADR 0110), and a note released to some players
    // is hidden from the others (amended 2026-10-23).
    for client in &readers {
        let mut seen = changed.clone();
        if let Some(veil) = crate::campaign::veil_for_client(server, key, client) {
            crate::campaign_serve::event_paths(&veil, &mut seen);
        }
        if let Some(list) = seen["changed"].as_array() {
            let kept: Vec<Value> = list
                .iter()
                .filter(|p| !p.as_str().is_some_and(|p| quiet.iter().any(|q| q == p)))
                .cloned()
                .collect();
            seen["changed"] = json!(kept);
        }
        let empty = |field: &str| seen[field].as_array().is_none_or(Vec::is_empty);
        if empty("changed") && empty("removed") && empty("moved") {
            continue;
        }
        server.push(std::slice::from_ref(client), &event(&seen));
    }
}
