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
    ("app_info", "the server's version"),
    ("render_markdown", "the window's own text"),
    ("project_secrets", "the window's own text, projected"),
    ("board_text", "the window's own board"),
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
    ("sync_state", "the projections' hashes and sizes"),
    (
        "sync_changes",
        "the changes a reader sees, with the projections' hashes",
    ),
    ("sync_read", "a note's projection"),
];

/// Whether the window `client` of `who` may only read its folder.
pub fn reads_only(server: &Server, who: &Who, client: &str) -> Result<bool, ContractError> {
    let (folder, role) = crate::rpc::role_here(server, client)?;
    let visible = crate::shares::scope_here(server, client).map_or(folder, |s| s.share);
    Ok(!(role.writes() && who.reaches(&visible).1))
}

/// Whether a window, as the server keeps it, may only read its folder.
fn window_reads_only(c: &crate::state::Client) -> bool {
    !(c.token_write && c.folder.as_ref().is_some_and(|(_, r)| r.writes()))
}

/// `clients` as (those who may only read, the others).
pub fn split(server: &Server, clients: &[String]) -> (Vec<String>, Vec<String>) {
    let table = lock(&server.clients);
    clients
        .iter()
        .cloned()
        .partition(|c| table.get(c).is_some_and(window_reads_only))
}

/// Whether `path` names a note, the only file with secret blocks here:
/// case ignored, and trailing dots and spaces, which a file system may
/// drop from a name (fails closed).
pub fn is_note(path: &str) -> bool {
    path.trim_end_matches(['.', ' '])
        .to_lowercase()
        .ends_with(".md")
}

/// What a reader is told of a note it is not served at all (past
/// [`crate::texts::TEXT_MOST`]): a size below zero, which its manifest and
/// its log leave out. The file's own size and hash would tell it how much a
/// secret block holds.
pub const HIDDEN: i64 = -1;

/// What a reader is told of the note at `path`: its projection's hash and
/// size when it holds a secret block, [`HIDDEN`] for a note too large to be
/// served; `None` when it holds none (or is no note), and a reader is told
/// the file as it is.
pub fn reader_of(
    server: &Server,
    key: &str,
    path: &str,
) -> Result<Option<(String, i64)>, ContractError> {
    let p = path.to_owned();
    server.service.with_key(key, move |ws| {
        // A note by its name, or the file it really is (a link to one).
        if !ws.reader_names_note(&p) {
            return Ok(None);
        }
        if ws
            .file_len(&p)
            .is_some_and(|len| len > crate::texts::TEXT_MOST)
        {
            return Ok(Some((String::new(), HIDDEN)));
        }
        let bytes = ws.read_file(&p)?;
        let text = String::from_utf8_lossy(&bytes);
        let secrets = verso_core::secret::Secrets::of(&text);
        if secrets.is_empty() {
            return Ok(None);
        }
        let shown = secrets.project(&text);
        Ok(Some((
            crate::sync::sha256(shown.as_bytes()),
            i64::try_from(shown.len()).unwrap_or(i64::MAX),
        )))
    })
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
        Ok(ws.reader_read_file(&p)?)
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
/// head of what it sees.
pub fn push_sync_changed(
    server: &Server,
    folder: &str,
    (head, paths): (i64, &[&str]),
    seen: &[&str],
) {
    let writers: Vec<String>;
    let readers: Vec<String>;
    {
        let table = lock(&server.clients);
        let on = |c: &&crate::state::Client| c.folder.as_ref().is_some_and(|(f, _)| f == folder);
        writers = table
            .iter()
            .filter(|(_, c)| on(c) && !window_reads_only(c))
            .map(|(id, _)| id.clone())
            .collect();
        readers = table
            .iter()
            .filter(|(_, c)| on(c) && window_reads_only(c))
            .map(|(id, _)| id.clone())
            .collect();
    }
    server.push_sync_changed(folder, head, paths, &writers);
    if !seen.is_empty() && !readers.is_empty() {
        match server.db.reader_count(folder, i64::MAX) {
            Ok(reader_head) => server.push_sync_changed(folder, reader_head, seen, &readers),
            Err(e) => crate::log::warn(&format!("a reader's head: {e}")),
        }
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
    let mut seen = changed.clone();
    if let Some(folder) = lock(&server.keys).get(key).cloned()
        && let Some(list) = seen["changed"].as_array()
    {
        let paths: Vec<String> = list
            .iter()
            .filter_map(Value::as_str)
            .filter(|p| is_note(p))
            .map(str::to_owned)
            .collect();
        let quiet = server
            .db
            .reader_unchanged(&folder, &paths)
            .unwrap_or_default();
        let kept: Vec<Value> = list
            .iter()
            .filter(|p| !p.as_str().is_some_and(|p| quiet.iter().any(|q| q == p)))
            .cloned()
            .collect();
        seen["changed"] = json!(kept);
    }
    let empty = |field: &str| seen[field].as_array().is_none_or(Vec::is_empty);
    if empty("changed") && empty("removed") && empty("moved") {
        return;
    }
    server.push(&readers, &event(&seen));
}
