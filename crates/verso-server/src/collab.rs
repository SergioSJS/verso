// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Simultaneous editing of notes (ADR 0073 item 7; the maintainer's answer
//! L of 2026-10-09). A note open in the windows of several people is a
//! *room*: a Yjs document in the server's memory, kept by `yrs`, whose
//! edits every window applies and the server relays. The file stays the
//! truth (ADR 0012): the room is written to it with the atomic write once
//! the edits settle — the bytes read plus the edits, the file's own line
//! ends kept — over the revision last written, so a file changed outside
//! is never written over (invariant 11). A change made outside enters the
//! room as one edit when nothing waits to be written; otherwise the room
//! stops writing and the people in it see the difference and choose.
//!
//! A write that reaches a shared note from elsewhere — the properties
//! panel, a task checked in the reading view, a quote from a PDF — is
//! merged into the room line by line over the edits not yet written, or
//! refused as `changed` when the two touch the same lines.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::json;
use verso_contract::{CollabJoin, ContractError, ErrorKind, NoteText};
use verso_service::{lock, ops};
use yrs::updates::decoder::Decode;
use yrs::{Doc, GetString, OffsetKind, Options, ReadTxn, StateVector, Text, Transact, Update};

use crate::state::Server;

/// How long a room waits after the last edit before it writes.
const QUIET: Duration = Duration::from_millis(900);
/// How long a room outlives a connection that dropped, so that a window
/// coming back finds it and sends what it typed meanwhile.
const GRACE: Duration = Duration::from_secs(120);
/// The text's name inside the document, as the window's binding names it.
pub const TEXT: &str = "verso";

pub struct Room {
    key: String,
    path: String,
    doc: Doc,
    crlf: bool,
    /// The revision on disk of what was last written or read.
    revision: String,
    /// That text, with `\n` line ends.
    saved: String,
    dirty: bool,
    /// The file changed on disk while edits waited: nothing is written
    /// until the people in the note choose.
    conflict: bool,
    edited: Instant,
    scheduled: bool,
    /// The windows in the room.
    clients: HashSet<String>,
    /// Which room this is (made again from the disk, it is another).
    epoch: String,
}

/// A room's place: (folder key, note path).
type Place = (String, String);

/// The rooms of the server, by place.
#[derive(Default)]
pub struct Rooms {
    map: Mutex<HashMap<Place, Arc<Mutex<Room>>>>,
}

fn refused(message: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message: message.to_owned(),
    }
}

fn changed(message: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::Changed,
        message: message.to_owned(),
    }
}

/// The file's text with `\n` line ends, the form the editor and the room
/// hold, and whether it had CRLF; `None` when it mixes them (shown
/// read-only, never shared).
fn normalized(text: &str) -> Option<(String, bool)> {
    let crlf = text.contains("\r\n");
    let rest = text.replace("\r\n", "");
    if rest.contains('\r') || (crlf && rest.contains('\n')) {
        return None;
    }
    Some((text.replace("\r\n", "\n"), crlf))
}

fn on_disk(text: &str, crlf: bool) -> String {
    if crlf {
        text.replace('\n', "\r\n")
    } else {
        text.to_owned()
    }
}

fn new_doc() -> Doc {
    // UTF-16 offsets, as the window's Yjs counts them.
    Doc::with_options(Options {
        offset_kind: OffsetKind::Utf16,
        ..Options::default()
    })
}

fn text_of(doc: &Doc) -> String {
    let text = doc.get_or_insert_text(TEXT);
    let txn = doc.transact();
    text.get_string(&txn)
}

/// The one edit that turns `from` into `to`: the unchanged start and end
/// kept, in UTF-16 units — (start, removed, inserted).
fn minimal_edit(from: &str, to: &str) -> Option<(u32, u32, String)> {
    if from == to {
        return None;
    }
    let a: Vec<u16> = from.encode_utf16().collect();
    let b: Vec<u16> = to.encode_utf16().collect();
    let mut start = 0;
    while start < a.len() && start < b.len() && a[start] == b[start] {
        start += 1;
    }
    // Never split a surrogate pair at the start.
    while start > 0 && (0xDC00..0xE000).contains(&a.get(start).copied().unwrap_or(0)) {
        start -= 1;
    }
    let mut end = 0;
    while end < a.len() - start
        && end < b.len() - start
        && a[a.len() - 1 - end] == b[b.len() - 1 - end]
    {
        end += 1;
    }
    // Nor at the end.
    while end > 0 && (0xDC00..0xE000).contains(&a[a.len() - end]) {
        end -= 1;
    }
    let inserted = String::from_utf16_lossy(&b[start..b.len() - end]);
    Some((
        u32::try_from(start).unwrap_or(u32::MAX),
        u32::try_from(a.len() - end - start).unwrap_or(u32::MAX),
        inserted,
    ))
}

/// Make the room's text `to` by one edit of the server's own; the update
/// to relay, if anything changed.
fn apply_text(doc: &Doc, to: &str) -> Option<Vec<u8>> {
    let from = text_of(doc);
    let (start, removed, inserted) = minimal_edit(&from, to)?;
    let text = doc.get_or_insert_text(TEXT);
    let mut txn = doc.transact_mut();
    if removed > 0 {
        text.remove_range(&mut txn, start, removed);
    }
    if !inserted.is_empty() {
        text.insert(&mut txn, start, &inserted);
    }
    Some(txn.encode_update_v1())
}

fn b64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

fn unb64(s: &str) -> Result<Vec<u8>, ContractError> {
    STANDARD.decode(s).map_err(|_| refused("not base64"))
}

impl Rooms {
    fn get(&self, key: &str, path: &str) -> Option<Arc<Mutex<Room>>> {
        lock(&self.map)
            .get(&(key.to_owned(), path.to_owned()))
            .map(Arc::clone)
    }

    /// Whether a note is shared now.
    pub fn has(&self, key: &str, path: &str) -> bool {
        self.get(key, path).is_some()
    }

    /// Every room of a folder.
    fn of_folder(&self, key: &str) -> Vec<Arc<Mutex<Room>>> {
        lock(&self.map)
            .iter()
            .filter(|((k, _), _)| k == key)
            .map(|(_, r)| Arc::clone(r))
            .collect()
    }
}

/// Push `message` to the room's windows but `except`.
fn tell(server: &Server, room: &Room, except: Option<&str>, message: &serde_json::Value) {
    let to: Vec<String> = room
        .clients
        .iter()
        .filter(|c| Some(c.as_str()) != except)
        .cloned()
        .collect();
    server.push(&to, message);
}

fn event(name: &str, path: &str, field: &str, value: &serde_json::Value) -> serde_json::Value {
    let mut payload = json!({ "path": path });
    payload[field] = value.clone();
    json!({ "event": name, "payload": payload })
}

fn read(server: &Server, key: &str, path: &str) -> Result<NoteText, ContractError> {
    let p = path.to_owned();
    server
        .service
        .with_key(key, move |ws| ops::read_note(ws, p))
}

/// Join `client` to the room of `path` in folder `key`, made from the disk
/// when it is the first.
pub fn join(
    server: &Arc<Server>,
    client: &str,
    key: &str,
    path: &str,
    user: &str,
) -> Result<CollabJoin, ContractError> {
    let room = match server.rooms.get(key, path) {
        Some(room) => room,
        None => {
            let note = read(server, key, path)?;
            let Some((text, crlf)) = normalized(&note.text) else {
                return Ok(CollabJoin {
                    update: String::new(),
                    revision: note.revision,
                    read_only: true,
                    crlf: false,
                    user: user.to_owned(),
                    epoch: String::new(),
                });
            };
            let doc = new_doc();
            {
                let t = doc.get_or_insert_text(TEXT);
                let mut txn = doc.transact_mut();
                t.insert(&mut txn, 0, &text);
            }
            let room = Arc::new(Mutex::new(Room {
                key: key.to_owned(),
                path: path.to_owned(),
                doc,
                crlf,
                revision: note.revision,
                saved: text,
                dirty: false,
                conflict: false,
                edited: Instant::now(),
                scheduled: false,
                clients: HashSet::new(),
                epoch: crate::crypto::id().map_err(verso_service::failed)?,
            }));
            let mut map = lock(&server.rooms.map);
            // Two windows joining at once: the first room made stays.
            Arc::clone(map.entry((key.to_owned(), path.to_owned())).or_insert(room))
        }
    };
    let mut r = lock(&room);
    r.clients.insert(client.to_owned());
    let state = r
        .doc
        .transact()
        .encode_state_as_update_v1(&StateVector::default());
    Ok(CollabJoin {
        update: b64(&state),
        revision: r.revision.clone(),
        read_only: false,
        crlf: r.crlf,
        user: user.to_owned(),
        epoch: r.epoch.clone(),
    })
}

/// An edit from `client`: applied, relayed, written once it settles.
pub fn update(
    server: &Arc<Server>,
    client: &str,
    key: &str,
    path: &str,
    update: &str,
) -> Result<(), ContractError> {
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("join the note first"))?;
    let bytes = unb64(update)?;
    let decoded =
        Update::decode_v1(&bytes).map_err(|e| refused(&format!("not a Yjs update: {e}")))?;
    let mut r = lock(&room);
    if !r.clients.contains(client) {
        return Err(refused("join the note first"));
    }
    r.doc
        .transact_mut()
        .apply_update(decoded)
        .map_err(|e| refused(&format!("the update does not apply: {e}")))?;
    tell(
        server,
        &r,
        Some(client),
        &event("collab-update", path, "update", &json!(update)),
    );
    r.dirty = true;
    r.edited = Instant::now();
    if !r.scheduled && !r.conflict {
        r.scheduled = true;
        schedule(server, Arc::clone(&room));
    }
    Ok(())
}

/// A presence from `client` (its cursor, its name), relayed as is: the
/// server keeps none.
pub fn awareness(
    server: &Server,
    client: &str,
    key: &str,
    path: &str,
    update: &str,
) -> Result<(), ContractError> {
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("join the note first"))?;
    let r = lock(&room);
    tell(
        server,
        &r,
        Some(client),
        &event("collab-awareness", path, "update", &json!(update)),
    );
    Ok(())
}

fn schedule(server: &Arc<Server>, room: Arc<Mutex<Room>>) {
    let server = Arc::clone(server);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(QUIET).await;
            let wait = QUIET.saturating_sub(lock(&room).edited.elapsed());
            if wait.is_zero() {
                break;
            }
        }
        let _ = tokio::task::spawn_blocking(move || {
            lock(&room).scheduled = false;
            if let Err(e) = write(&server, &room) {
                crate::log::warn(&format!("a shared note was not written: {}", e.message));
            }
        })
        .await;
    });
}

/// Write the room to its file now, if it has anything unwritten; its
/// revision after.
pub fn write(server: &Server, room: &Arc<Mutex<Room>>) -> Result<String, ContractError> {
    let mut r = lock(room);
    if r.conflict {
        return Err(changed("the file changed on disk: choose first"));
    }
    let text = text_of(&r.doc);
    if text == r.saved {
        r.dirty = false;
        return Ok(r.revision.clone());
    }
    let bytes = on_disk(&text, r.crlf);
    // The room's text passes the folder's quota like any write (ADR 0077):
    // refused, the room keeps it (as a failed write always does).
    crate::quota::check(
        server,
        &r.key,
        &r.path,
        u64::try_from(bytes.len()).unwrap_or(u64::MAX),
    )?;
    let (path, revision) = (r.path.clone(), r.revision.clone());
    let written = server
        .service
        .with_key(&r.key, move |ws| ops::write_note(ws, path, bytes, revision));
    match written {
        Ok(w) => {
            r.revision = w.note.revision.clone();
            r.saved = text;
            r.dirty = false;
            let path = r.path.clone();
            tell(
                server,
                &r,
                None,
                &event("collab-saved", &path, "revision", &json!(r.revision)),
            );
            // The folder's log for sync follows the save (ADR 0079 item 4).
            crate::sync::reconcile_key(server, &r.key, None, &[path]);
            Ok(r.revision.clone())
        }
        Err(e) if e.kind == ErrorKind::Changed => {
            r.conflict = true;
            let path = r.path.clone();
            tell(
                server,
                &r,
                None,
                &event("collab-conflict", &path, "revision", &json!(null)),
            );
            Err(e)
        }
        Err(e) => Err(e),
    }
}

/// `client` leaves; the last one out writes what is left and closes the
/// room. A room whose write fails — the file changed on disk, the disk
/// refused — is kept, with what was typed, for whoever opens the note
/// next to see the difference and choose (ADR 0073 item 7): never dropped.
pub fn leave(server: &Server, client: &str, key: &str, path: &str) {
    let Some(room) = server.rooms.get(key, path) else {
        return;
    };
    let empty = {
        let mut r = lock(&room);
        r.clients.remove(client);
        r.clients.is_empty()
    };
    if empty && settled(server, &room) {
        lock(&server.rooms.map).remove(&(key.to_owned(), path.to_owned()));
    }
}

/// The room written, or kept: false, said in the log, when what was typed
/// could not reach the file.
fn settled(server: &Server, room: &Arc<Mutex<Room>>) -> bool {
    match write(server, room) {
        Ok(_) => true,
        Err(e) => {
            let path = lock(room).path.clone();
            crate::log::warn(&format!(
                "a shared note keeps edits it could not write ({}): {path} stays open on the server until someone opens it and chooses",
                e.message
            ));
            false
        }
    }
}

/// A window's connection dropped: out of every room. A room left empty is
/// written now and kept a while for the window to come back (GRACE).
pub fn gone(server: &Arc<Server>, client: &str) {
    let rooms: Vec<Arc<Mutex<Room>>> = lock(&server.rooms.map)
        .values()
        .filter(|r| lock(r).clients.contains(client))
        .map(Arc::clone)
        .collect();
    for room in rooms {
        let empty = {
            let mut r = lock(&room);
            r.clients.remove(client);
            r.clients.is_empty()
        };
        if !empty {
            continue;
        }
        // Written now, while the folder is still open; a room that could
        // not be is kept past the grace, for the next window on the note.
        if !settled(server, &room) {
            continue;
        }
        let (key, path, epoch) = {
            let r = lock(&room);
            (r.key.clone(), r.path.clone(), r.epoch.clone())
        };
        let server = Arc::clone(server);
        if let Some(rt) = server.runtime.get().cloned() {
            rt.spawn(async move {
                tokio::time::sleep(GRACE).await;
                let mut map = lock(&server.rooms.map);
                let place = (key, path);
                let still_empty = map.get(&place).is_some_and(|r| {
                    let r = lock(r);
                    r.clients.is_empty() && r.epoch == epoch
                });
                // Nothing was typed since it was written: no window was in
                // it. Closed only when that write held.
                let clean = map.get(&place).is_some_and(|r| {
                    let r = lock(r);
                    !r.conflict && text_of(&r.doc) == r.saved
                });
                if still_empty && clean {
                    map.remove(&place);
                }
            });
        }
    }
}

/// ⌘S in a shared note: written now.
pub fn save(server: &Server, key: &str, path: &str) -> Result<String, ContractError> {
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("join the note first"))?;
    write(server, &room)
}

/// The people in a note that changed on disk while edits waited chose:
/// the disk's text (`disk`), or the room's written over it (`mine`).
pub fn resolve(
    server: &Server,
    key: &str,
    path: &str,
    keep: &str,
) -> Result<String, ContractError> {
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("join the note first"))?;
    let note = read(server, key, path)?;
    let mut r = lock(&room);
    match keep {
        "disk" => {
            let Some((text, crlf)) = normalized(&note.text) else {
                drop(r);
                close(server, key, path);
                return Ok(note.revision);
            };
            if let Some(update) = apply_text(&r.doc, &text) {
                tell(
                    server,
                    &r,
                    None,
                    &event("collab-update", path, "update", &json!(b64(&update))),
                );
            }
            r.crlf = crlf;
            r.saved = text;
            r.revision = note.revision;
            r.dirty = false;
            r.conflict = false;
            tell(
                server,
                &r,
                None,
                &event("collab-saved", path, "revision", &json!(r.revision)),
            );
            Ok(r.revision.clone())
        }
        "mine" => {
            r.revision = note.revision;
            r.conflict = false;
            // Whatever the room holds is written, even if it equals what
            // was last written: the disk has something else.
            r.saved.clear();
            r.saved.push('\u{0}');
            drop(r);
            write(server, &room)
        }
        _ => Err(refused("keep `disk` or `mine`")),
    }
}

/// The room of a note that is no longer there — renamed, moved, deleted,
/// its line ends mixed: the windows read it again.
pub fn close(server: &Server, key: &str, path: &str) {
    let room = lock(&server.rooms.map).remove(&(key.to_owned(), path.to_owned()));
    if let Some(room) = room {
        let r = lock(&room);
        tell(
            server,
            &r,
            None,
            &event("collab-closed", path, "revision", &json!(null)),
        );
    }
}

/// Before a command that moves or removes files of the folder: every room
/// of it written, so nothing typed is left behind a rename.
/// Before a rename, a move or a bin: every room of the folder written.
/// One that cannot be stops the command — its typed text would follow
/// nothing, or be closed with the note.
pub fn write_all(server: &Server, key: &str) -> Result<(), ContractError> {
    for room in server.rooms.of_folder(key) {
        if let Err(e) = write(server, &room) {
            let path = lock(&room).path.clone();
            return Err(changed(&format!(
                "{path} has edits not written yet ({}): open it and choose first",
                e.message
            )));
        }
    }
    Ok(())
}

/// After such a command: the rooms whose note is gone are closed.
pub fn close_missing(server: &Server, key: &str, notes: &[String]) {
    let paths: Vec<String> = server
        .rooms
        .of_folder(key)
        .iter()
        .map(|r| lock(r).path.clone())
        .collect();
    for path in paths {
        if !notes.contains(&path) {
            close(server, key, &path);
        }
    }
}

/// The folder changed outside: a shared note that changed enters its room
/// as one edit when nothing waits to be written, or stops the room for the
/// people in it to choose (ADR 0073 item 7).
pub fn changed_outside(server: &Server, key: &str, changed: &[String], removed: &[String]) {
    for path in removed {
        close(server, key, path);
    }
    for path in changed {
        let Some(room) = server.rooms.get(key, path) else {
            continue;
        };
        let Ok(note) = read(server, key, path) else {
            continue;
        };
        let mut r = lock(&room);
        if note.revision == r.revision {
            continue;
        }
        let Some((text, crlf)) = normalized(&note.text) else {
            drop(r);
            close(server, key, path);
            continue;
        };
        if r.dirty || text_of(&r.doc) != r.saved {
            r.conflict = true;
            tell(
                server,
                &r,
                None,
                &event("collab-conflict", path, "revision", &json!(null)),
            );
            continue;
        }
        if let Some(update) = apply_text(&r.doc, &text) {
            tell(
                server,
                &r,
                None,
                &event("collab-update", path, "update", &json!(b64(&update))),
            );
        }
        r.crlf = crlf;
        r.saved = text;
        r.revision = note.revision;
        tell(
            server,
            &r,
            None,
            &event("collab-saved", path, "revision", &json!(r.revision)),
        );
    }
}

/// A `write_note` that reaches a shared note from elsewhere: over the
/// revision the room last wrote, merged line by line into the edits not
/// yet written, then written at once; `changed` when the writer read an
/// older revision or the two touch the same lines.
pub fn write_through(
    server: &Server,
    key: &str,
    path: &str,
    text: &str,
    revision: &str,
) -> Result<String, ContractError> {
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("not shared"))?;
    {
        let r = lock(&room);
        if r.conflict {
            return Err(changed("the file changed on disk: choose first"));
        }
        if revision != r.revision {
            return Err(changed("the note changed since it was read"));
        }
        let Some((mine, _)) = normalized(text) else {
            return Err(refused("a text that mixes line ends"));
        };
        let theirs = text_of(&r.doc);
        let merged = diffy::merge(&r.saved, &theirs, &mine)
            .map_err(|_| changed("the same lines changed in the note meanwhile"))?;
        if let Some(update) = apply_text(&r.doc, &merged) {
            tell(
                server,
                &r,
                None,
                &event("collab-update", path, "update", &json!(b64(&update))),
            );
        }
    }
    write(server, &room)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_minimal_edit_keeps_the_ends_and_counts_utf16() {
        assert_eq!(minimal_edit("abc", "abc"), None);
        assert_eq!(minimal_edit("abc", "aXc"), Some((1, 1, "X".to_owned())));
        assert_eq!(minimal_edit("a😀c", "a😀dc"), Some((3, 0, "d".to_owned())));
        assert_eq!(minimal_edit("😀", "😁"), Some((0, 2, "😁".to_owned())));
        let doc = new_doc();
        apply_text(&doc, "olá 😀 mundo");
        apply_text(&doc, "olá 😀 grande mundo");
        assert_eq!(text_of(&doc), "olá 😀 grande mundo");
    }

    #[test]
    fn line_ends_are_kept_and_mixed_ones_refused() {
        assert_eq!(normalized("a\r\nb\r\n"), Some(("a\nb\n".to_owned(), true)));
        assert_eq!(normalized("a\nb"), Some(("a\nb".to_owned(), false)));
        assert_eq!(normalized("a\r\nb\n"), None);
        assert_eq!(normalized("a\rb"), None);
        assert_eq!(on_disk("a\nb\n", true), "a\r\nb\r\n");
    }

    #[test]
    fn a_window_and_the_server_converge() {
        let server = new_doc();
        apply_text(&server, "# Nota\n\num\n");
        let window = new_doc();
        let state = server
            .transact()
            .encode_state_as_update_v1(&StateVector::default());
        window
            .transact_mut()
            .apply_update(Update::decode_v1(&state).unwrap())
            .unwrap();
        assert_eq!(text_of(&window), "# Nota\n\num\n");
        // The window types; meanwhile the server merges a write from the
        // properties panel; each applies the other's update.
        let typed = {
            let t = window.get_or_insert_text(TEXT);
            let mut txn = window.transact_mut();
            t.insert(&mut txn, 11, "dois\n");
            txn.encode_update_v1()
        };
        let merged = diffy::merge(
            "# Nota\n\num\n",
            &text_of(&server),
            "---\ntag: x\n---\n# Nota\n\num\n",
        )
        .unwrap();
        let from_server = apply_text(&server, &merged).unwrap();
        server
            .transact_mut()
            .apply_update(Update::decode_v1(&typed).unwrap())
            .unwrap();
        window
            .transact_mut()
            .apply_update(Update::decode_v1(&from_server).unwrap())
            .unwrap();
        assert_eq!(text_of(&server), text_of(&window));
        assert_eq!(text_of(&server), "---\ntag: x\n---\n# Nota\n\num\ndois\n");
    }
}
