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
//!
//! Every file a window edits has its room (ADR 0082 item 12, decided by
//! the maintainer on 2026-10-12): a note as before; any other text file of
//! the folder — `.txt`, `.json`, `.csv`, a base's `.base` — the same way,
//! read and written as text; and a board, whose room holds its elements
//! (`collab_board.rs`).

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::json;
use verso_contract::{CollabJoin, CollabKind, ContractError, ErrorKind};
use verso_service::{lock, ops};
use yrs::updates::decoder::Decode;
use yrs::{
    Doc, GetString, OffsetKind, Options, ReadTxn, StateVector, Text, Transact, Update, WriteTxn,
};

use crate::state::Server;

/// How long a room waits after the last edit before it writes.
const QUIET: Duration = Duration::from_millis(900);
/// How long a room outlives a connection that dropped, so that a window
/// coming back finds it and sends what it typed meanwhile.
const GRACE: Duration = Duration::from_secs(120);
/// The text's name inside the document, as the window's binding names it.
pub const TEXT: &str = "verso";

/// What a room is of: a note (read and written as a note, indexed), any
/// other text file, or a board.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Note,
    Text,
    Board,
}

/// The kind of the room of `path`, by its name: the window's tab for it
/// is the same (a note's, a board's, a text's).
pub fn kind_of(path: &str) -> Kind {
    let lower = path.to_lowercase();
    if lower.ends_with(".md") {
        Kind::Note
    } else if lower.ends_with(".canvas") {
        Kind::Board
    } else {
        Kind::Text
    }
}

pub struct Room {
    key: String,
    path: String,
    kind: Kind,
    doc: Doc,
    crlf: bool,
    /// The revision on disk of what was last written or read.
    revision: String,
    /// That text, with `\n` line ends. The room holds edits not yet
    /// written exactly when its text differs from this one: an edit that
    /// changed nothing, as a window's whole state sent back on its return,
    /// leaves nothing waiting.
    saved: String,
    /// The file changed on disk while edits waited: nothing is written
    /// until the people in the note choose.
    conflict: bool,
    edited: Instant,
    scheduled: bool,
    /// The windows in the room.
    clients: HashSet<String>,
    /// Which room this is (made again from the disk, it is another).
    epoch: String,
    /// The Yjs clients each connection speaks for in presence (gap 11).
    claims: crate::presence::Claims,
    /// A board's own state: what was written, the files windows made.
    board: crate::collab_board::Board,
}

impl Room {
    /// Whether the room holds edits not yet written: a text that differs
    /// from the one last written or read — an edit that changed nothing,
    /// as a window's whole state sent back on its return, leaves nothing
    /// waiting — or a board whose count of people's edits moved.
    fn waiting(&self) -> bool {
        match self.kind {
            Kind::Board => self.board.waiting(&self.doc),
            Kind::Note | Kind::Text => text_of(&self.doc) != self.saved,
        }
    }
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
pub(crate) fn normalized(text: &str) -> Option<(String, bool)> {
    let crlf = text.contains("\r\n");
    let rest = text.replace("\r\n", "");
    if rest.contains('\r') || (crlf && rest.contains('\n')) {
        return None;
    }
    Some((text.replace("\r\n", "\n"), crlf))
}

pub(crate) fn on_disk(text: &str, crlf: bool) -> String {
    if crlf {
        text.replace('\n', "\r\n")
    } else {
        text.to_owned()
    }
}

pub(crate) fn new_doc() -> Doc {
    Doc::with_options(utf16(Options::default()))
}

/// UTF-16 offsets, as the window's Yjs counts them.
pub(crate) fn utf16(options: Options) -> Options {
    Options {
        offset_kind: OffsetKind::Utf16,
        ..options
    }
}

/// `doc` holding the file's `text`: a room's document as [`join`] makes it.
pub(crate) fn holding(doc: Doc, text: &str) -> Doc {
    {
        let t = doc.get_or_insert_text(TEXT);
        let mut txn = doc.transact_mut();
        t.insert(&mut txn, 0, text);
    }
    doc
}

pub(crate) fn text_of(doc: &Doc) -> String {
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
pub(crate) fn apply_text(doc: &Doc, to: &str) -> Option<Vec<u8>> {
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

/// Apply `update` to `doc`, and with it whatever earlier updates were
/// waiting for it. A connection's requests run side by side, so two of a
/// window's updates can reach the room in the other order; Yjs keeps the
/// later one aside until the earlier arrives — but `yrs` 0.28 leaves some
/// of what it kept aside unplaced once several wait (seen by
/// `tests_board_stress.rs`, seed 1: an item heard and never placed, the
/// room's state then short of what the windows hold). What waits is taken
/// out and applied again until nothing more is placed.
pub fn integrate(doc: &Doc, update: Update) -> Result<(), yrs::error::UpdateError> {
    let mut txn = doc.transact_mut();
    txn.apply_update(update)?;
    for _ in 0..64 {
        if !txn.has_missing_updates() {
            break;
        }
        let before = txn.state_vector();
        let Some(waiting) = txn.prune_pending() else {
            break;
        };
        txn.apply_update(waiting)?;
        if txn.state_vector() == before {
            break;
        }
    }
    Ok(())
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

    /// Whether someone is in the note's room now: a window, a person, a
    /// synced device's link. A room kept for the grace after its last
    /// window dropped has no one in it — a write there goes by the file,
    /// as `write_note`'s through the room (ADR 0082, the writes that are
    /// not keystrokes).
    pub fn occupied(&self, key: &str, path: &str) -> bool {
        self.get(key, path)
            .is_some_and(|room| !lock(&room).clients.is_empty())
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

/// A file's text and its revision on disk: a note as a note, anything
/// else as text.
struct Read {
    text: String,
    revision: String,
}

fn read(server: &Server, key: &str, path: &str) -> Result<Read, ContractError> {
    let p = path.to_owned();
    if kind_of(path) == Kind::Note {
        let n = server
            .service
            .with_key(key, move |ws| ops::read_note(ws, p))?;
        return Ok(Read {
            text: n.text,
            revision: n.revision,
        });
    }
    let t = server
        .service
        .with_key(key, move |ws| ops::read_text(ws, p))?;
    Ok(Read {
        text: t.text,
        revision: t.revision,
    })
}

/// Write `bytes` over `revision` as the room's kind is written: its new
/// revision.
fn write_file(
    server: &Server,
    room: &Room,
    bytes: String,
    revision: String,
) -> Result<String, ContractError> {
    let path = room.path.clone();
    match room.kind {
        Kind::Note => server
            .service
            .with_key(&room.key, move |ws| {
                ops::write_note(ws, path, bytes, revision)
            })
            .map(|w| w.note.revision),
        Kind::Text => server
            .service
            .with_key(&room.key, move |ws| {
                ops::write_text(ws, path, bytes, revision)
            })
            .map(|t| t.revision),
        Kind::Board => server
            .service
            .with_key(&room.key, move |ws| {
                ops::write_board(ws, path, bytes, revision)
            })
            .map(|t| t.revision),
    }
}

/// Join `client` to the room of `path` in folder `key`, made from the disk
/// when it is the first. A room whose state `yrs` cannot make any more is
/// made again from the file ([`reload`]) and joined.
pub fn join(
    server: &Arc<Server>,
    client: &str,
    key: &str,
    path: &str,
    user: &str,
) -> Result<CollabJoin, ContractError> {
    match join_room(server, client, key, path, user) {
        Err(e) if e.message == BROKEN => {
            reload(server, key, path, "its state could not be made");
            join_room(server, client, key, path, user)
        }
        joined => joined,
    }
}

fn join_room(
    server: &Arc<Server>,
    client: &str,
    key: &str,
    path: &str,
    user: &str,
) -> Result<CollabJoin, ContractError> {
    let kind = kind_of(path);
    let wire = if kind == Kind::Board {
        CollabKind::Board
    } else {
        CollabKind::Text
    };
    let room = match server.rooms.get(key, path) {
        Some(room) => room,
        None => {
            let note = read(server, key, path)?;
            let (doc, crlf, saved, board) = if kind == Kind::Board {
                // Drawn in by the first window to join (collab_board.rs).
                let doc = crate::collab_board::new_doc(&note.text);
                let board = crate::collab_board::Board::of(&doc);
                (doc, false, String::new(), board)
            } else {
                let Some((text, crlf)) = normalized(&note.text) else {
                    return Ok(CollabJoin {
                        kind: wire,
                        update: String::new(),
                        revision: note.revision,
                        read_only: true,
                        crlf: false,
                        user: user.to_owned(),
                        epoch: String::new(),
                    });
                };
                let doc = holding(new_doc(), &text);
                (doc, crlf, text, crate::collab_board::Board::default())
            };
            let room = Arc::new(Mutex::new(Room {
                key: key.to_owned(),
                path: path.to_owned(),
                kind,
                doc,
                crlf,
                revision: note.revision,
                saved,
                conflict: false,
                edited: Instant::now(),
                scheduled: false,
                clients: HashSet::new(),
                epoch: crate::crypto::id().map_err(verso_service::failed)?,
                claims: crate::presence::Claims::new(),
                board,
            }));
            let mut map = lock(&server.rooms.map);
            // Two windows joining at once: the first room made stays.
            Arc::clone(map.entry((key.to_owned(), path.to_owned())).or_insert(room))
        }
    };
    let mut r = lock(&room);
    let state = state(&r.doc)?;
    r.clients.insert(client.to_owned());
    Ok(CollabJoin {
        kind: wire,
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
    (client, account): (&str, &str),
    key: &str,
    path: &str,
    update: &str,
) -> Result<(), ContractError> {
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("join the note first"))?;
    let bytes = unb64(update)?;
    let decoded = decode(&bytes)?;
    let mut r = lock(&room);
    if !r.clients.contains(client) {
        return Err(refused("join the note first"));
    }
    let taken = {
        let Room {
            kind, doc, board, ..
        } = &mut *r;
        take(*kind, doc, board, &bytes, decoded)
    };
    if let Err(e) = taken {
        if e.message == BROKEN {
            drop(r);
            reload(
                server,
                key,
                path,
                &format!("an update from account {account} the room could not integrate"),
            );
        }
        return Err(e);
    }
    tell(
        server,
        &r,
        Some(client),
        &event("collab-update", path, "update", &json!(update)),
    );
    r.edited = Instant::now();
    // A board's change that is no one's edit — drawn in, measured again —
    // leaves nothing to write (invariant 7).
    if !r.scheduled && !r.conflict && (r.kind != Kind::Board || r.waiting()) {
        r.scheduled = true;
        schedule(server, Arc::clone(&room));
    }
    Ok(())
}

/// A window's update `bytes`, refused before `yrs` reads it when one of
/// its counts declares more than the bytes left, or a value nests past
/// the bound (`yjs_bounds.rs`): `yrs` reserves room for every element
/// declared before it reads the first, and reads nested values by
/// recursion (ADR 0083 item 14; the fuzz targets `note` and `board` saw
/// 22 GB asked for four bytes, and a 200 KB update overflowed the stack).
/// No real update does either.
pub(crate) fn readable(bytes: &[u8]) -> Result<(), ContractError> {
    match crate::yjs_bounds::update(bytes) {
        Err(crate::yjs_bounds::Stop::Bomb) => Err(refused("an update the room cannot read")),
        _ => Ok(()),
    }
}

/// A window's state vector, refused the same way.
pub(crate) fn readable_vector(bytes: &[u8]) -> Result<(), ContractError> {
    match crate::yjs_bounds::state_vector(bytes) {
        Err(crate::yjs_bounds::Stop::Bomb) => Err(refused("an update the room cannot read")),
        _ => Ok(()),
    }
}

/// A window's update, decoded once it is [`readable`].
pub(crate) fn decode(bytes: &[u8]) -> Result<Update, ContractError> {
    readable(bytes)?;
    Update::decode_v1(bytes).map_err(|e| refused(&format!("not a Yjs update: {e}")))
}

/// A window's update `bytes`, decoded, taken into a room's document: a
/// board's within its limits first (`collab_board.rs`), then integrated.
pub(crate) fn take(
    kind: Kind,
    doc: &Doc,
    board: &mut crate::collab_board::Board,
    bytes: &[u8],
    decoded: Update,
) -> Result<(), ContractError> {
    caught(|| {
        if deletes_ahead(doc, &decoded) {
            return Err(refused("an update the room cannot read"));
        }
        if kind == Kind::Board {
            board.admits(doc, bytes, &decoded)?;
            board.bytes = board.bytes.saturating_add(bytes.len());
        }
        integrate(doc, decoded).map_err(|e| refused(&format!("the update does not apply: {e}")))
    })?
}

/// Whether `update` deletes items of the room's own Yjs client the room
/// has not made, nor the update itself (finding 5 of the fuzzing, ADR
/// 0083 item 14): `yrs` keeps such a deletion and applies it to the
/// room's next items — a change from outside cut in every window. Only
/// the room makes its own items and every window learns them from it, so
/// no window can have seen one ahead. Another window's items are not
/// judged: a connection's updates can reach the room in the other order,
/// a deletion before the insert it deletes.
fn deletes_ahead(doc: &Doc, update: &Update) -> bool {
    let own = doc.client_id();
    let Some((_, deleted)) = update.delete_set().iter().find(|(c, _)| **c == own) else {
        return false;
    };
    let mut known = doc.transact().state_vector().get(&own);
    if let Some((_, made)) = update.insertions(true).iter().find(|(c, _)| **c == own) {
        known = made.iter().map(|r| r.end).fold(known, u32::max);
    }
    deleted.iter().any(|r| r.end > known)
}

/// What a room answers when `yrs` panicked on what a window sent (ADR
/// 0083 item 14, finding 2 of the fuzzing, option (a) accepted by the
/// maintainer on 2026-10-13): the document may be half changed, so the
/// room is made again from its file ([`reload`]).
pub(crate) const BROKEN: &str = "an update the room could not integrate";

/// `f`, a call into `yrs` over what a window sent or what it left in a
/// room, with a panic of `yrs` caught as [`BROKEN`]. `yrs` 0.28 unwraps,
/// divides by zero and reads past an end on some updates, in a release
/// build too (the fuzz targets `note` and `board`).
pub(crate) fn caught<T>(f: impl FnOnce() -> T) -> Result<T, ContractError> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).map_err(|_| refused(BROKEN))
}

/// A room's whole state, as `join` sends it: checked first to apply in a
/// window, since `yrs` 0.28 can make a state it cannot read back (the fuzz
/// target `board`: `EndOfBuffer`).
pub(crate) fn state(doc: &Doc) -> Result<Vec<u8>, ContractError> {
    let state = caught(|| {
        doc.transact()
            .encode_state_as_update_v1(&StateVector::default())
    })?;
    applies(&Doc::new(), &state)?;
    Ok(state)
}

/// Whether `update` decodes and applies in `window`, as a window takes it.
fn applies(window: &Doc, update: &[u8]) -> Result<(), ContractError> {
    let applied = caught(|| {
        Update::decode_v1(update)
            .ok()
            .and_then(|u| window.transact_mut().apply_update(u).ok())
    })?;
    applied.ok_or_else(|| refused(BROKEN))
}

/// What a board room says it wrote (`Board::written`), checked first to
/// apply in a window that holds the room's state (the fuzz target
/// `board`: `InvalidParent`).
pub(crate) fn written(
    doc: &Doc,
    board: &mut crate::collab_board::Board,
) -> Result<Vec<u8>, ContractError> {
    let window = Doc::new();
    applies(&window, &state(doc)?)?;
    let update = caught(|| board.written(doc))?;
    applies(&window, &update)?;
    Ok(update)
}

/// A room `yrs` could not go on with: said in the log, and closed — what a
/// change from outside does to a room it cannot take in
/// ([`changed_outside`]): the windows read the file again, and the next to
/// join makes the room anew from it. What was typed in the room since it
/// last wrote is lost.
fn reload(server: &Server, key: &str, path: &str, why: &str) {
    let folder = lock(&server.keys)
        .get(key)
        .cloned()
        .unwrap_or_else(|| key.to_owned());
    crate::log::warn(&format!("room {folder}/{path}: {why}"));
    close(server, key, path);
}

/// The largest presence relayed (threat-model.md, gap 3): a window's is
/// its name, its colour and its cursor, a few hundred bytes as base64. A
/// reader may send presence, so without this bound a reader could have
/// messages of up to the message limit relayed to every member's window.
pub const PRESENCE_MOST: usize = 16 * 1024;

/// A presence from `who` (its cursor, its name), relayed stamped by the
/// server (threat-model.md, gap 11): the name the sender's account's, the
/// clients another account speaks for dropped (`presence.rs`). The server
/// keeps none. One past [`PRESENCE_MOST`], one that is not a presence, and
/// one from a window not in the room are refused.
pub fn awareness(
    server: &Server,
    who: &crate::presence::Sender,
    key: &str,
    path: &str,
    update: &str,
) -> Result<(), ContractError> {
    if update.len() > PRESENCE_MOST {
        return Err(refused("a presence of 16 KB at most"));
    }
    let bytes = unb64(update)?;
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("join the note first"))?;
    let mut r = lock(&room);
    if !r.clients.contains(who.client) {
        return Err(refused("join the note first"));
    }
    let Room {
        claims, clients, ..
    } = &mut *r;
    let stamped =
        crate::presence::stamped(&bytes, who, claims, clients).map_err(|e| refused(&e))?;
    tell(
        server,
        &r,
        Some(who.client),
        &event("collab-awareness", path, "update", &json!(b64(&stamped))),
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
            // A board no window made into a file yet is written when one
            // comes (`canvas`).
            if let Err(e) = write(&server, &room)
                && e.kind != ErrorKind::Unavailable
            {
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
    if !r.waiting() {
        return Ok(r.revision.clone());
    }
    // A board: the file a window made of exactly the state the room holds
    // (collab_board.rs); none yet, it is written when one comes.
    let (bytes, text) = if r.kind == Kind::Board {
        match r.board.canvas_now(&r.doc) {
            Some(json) => (json, None),
            None => return Err(not_drawn()),
        }
    } else {
        let text = text_of(&r.doc);
        (on_disk(&text, r.crlf), Some(text))
    };
    // The room's text passes the folder's quota like any write (ADR 0077):
    // refused, the room keeps it (as a failed write always does).
    crate::quota::check(
        server,
        &r.key,
        &r.path,
        u64::try_from(bytes.len()).unwrap_or(u64::MAX),
    )?;
    let revision = r.revision.clone();
    let written = write_file(server, &r, bytes, revision);
    match written {
        Ok(revision) => {
            r.revision = revision;
            let path = r.path.clone();
            match text {
                Some(text) => r.saved = text,
                None => {
                    // What was written is said in the document too: the
                    // windows see that nothing waits any more.
                    let Room { board, doc, .. } = &mut *r;
                    let Ok(update) = self::written(doc, board) else {
                        let key = r.key.clone();
                        drop(r);
                        reload(server, &key, &path, "its state could not be made");
                        return Err(refused(BROKEN));
                    };
                    tell(
                        server,
                        &r,
                        None,
                        &event("collab-update", &path, "update", &json!(b64(&update))),
                    );
                }
            }
            // The folder's log for sync follows the save (ADR 0079 item 4),
            // before the windows hear it: a save heard is one a device's
            // next question finds.
            crate::sync::reconcile_saved(server, &r.key, &path);
            tell(
                server,
                &r,
                None,
                &event("collab-saved", &path, "revision", &json!(r.revision)),
            );
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

/// A board whose edits no window has made into a file yet.
fn not_drawn() -> ContractError {
    ContractError {
        kind: ErrorKind::Unavailable,
        message: "the board's edits are still being made into its file: it is written in a moment"
            .to_owned(),
    }
}

/// The room written, or kept: false, said in the log, when what was typed
/// could not reach the file.
fn settled(server: &Server, room: &Arc<Mutex<Room>>) -> bool {
    match write(server, room) {
        Ok(_) => true,
        Err(e) if e.kind == ErrorKind::Unavailable => {
            let path = lock(room).path.clone();
            crate::log::warn(&format!(
                "a shared board keeps edits no window made into its file yet: {path} stays open on the server, and the next window on it writes them"
            ));
            false
        }
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
                    !r.conflict && !r.waiting()
                });
                if still_empty && clean {
                    map.remove(&place);
                }
            });
        }
    }
}

/// A window that may no longer see its folder — its share revoked, its
/// role gone (ADR 0081 item 8): out of every room at once, so that nothing
/// typed there reaches it any more. A room left empty is written and
/// closed.
pub fn gone_now(server: &Server, client: &str) {
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
        if empty && settled(server, &room) {
            let place = {
                let r = lock(&room);
                (r.key.clone(), r.path.clone())
            };
            let mut map = lock(&server.rooms.map);
            if map
                .get(&place)
                .is_some_and(|r| Arc::ptr_eq(r, &room) && lock(r).clients.is_empty())
            {
                map.remove(&place);
            }
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

/// A window's file of a board, as its converter makes it of the room's
/// state `at` (a Yjs state vector, base64): kept, and written at once when
/// it is of the state the room holds, the room has edits waiting, and its
/// quiet wait is over (collab_board.rs).
pub fn canvas(
    server: &Server,
    client: &str,
    key: &str,
    path: &str,
    at: &str,
    json: String,
) -> Result<(), ContractError> {
    let room = server
        .rooms
        .get(key, path)
        .ok_or_else(|| refused("join the board first"))?;
    let at = unb64(at)?;
    let ready = {
        let mut r = lock(&room);
        if !r.clients.contains(client) {
            return Err(refused("join the board first"));
        }
        if r.kind != Kind::Board {
            return Err(refused("not a board"));
        }
        r.board.keep(&at, json)?;
        !r.scheduled && !r.conflict && r.waiting() && r.board.canvas_now(&r.doc).is_some()
    };
    if ready && let Err(e) = write(server, &room) {
        crate::log::warn(&format!("a shared board was not written: {}", e.message));
    }
    Ok(())
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
    if r.kind == Kind::Board {
        return match keep {
            // The disk's board: the room goes, and the windows draw the
            // file again in a room made of it.
            "disk" => {
                let Room { board, doc, .. } = &mut *r;
                board.forget(doc);
                drop(r);
                close(server, key, path);
                Ok(note.revision)
            }
            "mine" => {
                r.revision = note.revision;
                r.conflict = false;
                r.board.force();
                drop(r);
                write(server, &room)
            }
            _ => Err(refused("keep `disk` or `mine`")),
        };
    }
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
        // Read under the room's lock: a read taken before a save of the
        // room that lands meanwhile would be taken for a change from
        // outside, and its older text put back over the save.
        let mut r = lock(&room);
        let Ok(note) = read(server, key, path) else {
            continue;
        };
        if note.revision == r.revision {
            continue;
        }
        // A board the server cannot draw: with nothing waiting, the room
        // goes and the windows draw the file again; with edits waiting, it
        // stops for the people in it to choose, as a note's does.
        if r.kind == Kind::Board {
            if r.waiting() {
                r.conflict = true;
                tell(
                    server,
                    &r,
                    None,
                    &event("collab-conflict", path, "revision", &json!(null)),
                );
            } else {
                drop(r);
                close(server, key, path);
            }
            continue;
        }
        let Some((text, crlf)) = normalized(&note.text) else {
            drop(r);
            close(server, key, path);
            continue;
        };
        // Edits not yet written: the text differs from the one last
        // written or read. One the room took in and that changed nothing —
        // a window's whole state sent back on its return — waits for
        // nothing, and must not stop the room.
        if r.waiting() {
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
        if r.kind == Kind::Board {
            return Err(changed(
                "the board is being edited together: its changes go through its room",
            ));
        }
        if r.conflict {
            return Err(changed("the file changed on disk: choose first"));
        }
        if revision != r.revision {
            return Err(changed("the note changed since it was read"));
        }
        if let Some(update) = merge_into(&r.doc, &r.saved, text)? {
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

/// `text`, a write from elsewhere, merged line by line into the room's
/// edits over `saved`, the text last written: the update to relay, if
/// anything changed; `changed` when the two touch the same lines.
pub(crate) fn merge_into(
    doc: &Doc,
    saved: &str,
    text: &str,
) -> Result<Option<Vec<u8>>, ContractError> {
    let Some((mine, _)) = normalized(text) else {
        return Err(refused("a text that mixes line ends"));
    };
    let theirs = text_of(doc);
    let merged = diffy::merge(saved, &theirs, &mine)
        .map_err(|_| changed("the same lines changed in the note meanwhile"))?;
    Ok(apply_text(doc, &merged))
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

    /// One window's updates reaching the room in a shuffled order are all
    /// placed (the `integrate` above; `yrs` alone left most of these runs
    /// with something unplaced).
    #[test]
    fn a_windows_updates_in_any_order_are_all_placed() {
        for seed in 0..300_u64 {
            let mut s = seed.wrapping_mul(2_654_435_761) | 1;
            let mut rnd = || {
                s ^= s << 13;
                s ^= s >> 7;
                s ^= s << 17;
                s
            };
            let window = new_doc();
            let text = window.get_or_insert_text(TEXT);
            let mut updates = Vec::new();
            for i in 0..12_u32 {
                let mut txn = window.transact_mut();
                let len = text.len(&txn);
                let at = u32::try_from(rnd() % u64::from(len + 1)).unwrap();
                text.insert(&mut txn, at, &format!("<{i}>"));
                if len > 4 && rnd() % 3 == 0 {
                    text.remove_range(&mut txn, 0, 2);
                }
                updates.push(txn.encode_update_v1());
            }
            for i in (1..updates.len()).rev() {
                let j = usize::try_from(rnd() % (i as u64 + 1)).unwrap();
                updates.swap(i, j);
            }
            let room = new_doc();
            for u in &updates {
                integrate(&room, Update::decode_v1(u).unwrap()).unwrap();
            }
            assert!(!room.transact().has_missing_updates(), "seed {seed}");
            assert_eq!(text_of(&room), text_of(&window), "seed {seed}");
        }
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
