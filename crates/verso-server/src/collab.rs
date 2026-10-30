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
use yrs::{Doc, GetString, OffsetKind, Options, ReadTxn, StateVector, Text, Transact, Update};

use crate::state::Server;

/// How long a room waits after the last edit before it writes.
const QUIET: Duration = Duration::from_millis(900);
/// The longest a room keeps edits unwritten while people keep typing: a note
/// edited without a pause of [`QUIET`] (several people in turn) is still
/// written this often, so a server that dies loses seconds, not the session.
const LONGEST: Duration = Duration::from_secs(5);
/// How long a room outlives a connection that dropped, so that a window
/// coming back finds it and sends what it typed meanwhile.
const GRACE: Duration = Duration::from_secs(120);
/// How many rolls of dice a room keeps for whoever joins (ADR 0088 item 4).
pub const ROLLS_KEPT: usize = 20;
#[path = "collab_dice.rs"]
mod rolls;
pub use rolls::{Opts as RollOpts, oracle, roll};
#[path = "collab_players.rs"]
pub(crate) mod players;
#[path = "collab_readers.rs"]
pub(crate) mod readers;
#[path = "collab_restore.rs"]
mod restore;
pub use restore::restore_through;
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
    /// The Yjs clients each account writes as (`writers.rs`).
    writers: crate::writers::Writers,
    /// A board's own state: what was written, the files windows made.
    board: crate::collab_board::Board,
    /// The last rolls of dice in it (ADR 0088 item 4; `collab_dice.rs`).
    rolls: std::collections::VecDeque<verso_contract::DiceRoll>,
    /// Who may only read the note, and what they are served when it holds
    /// secret blocks (ADR 0087 item 4; `collab_readers.rs`).
    readers: readers::Readers,
    /// The accounts whose edits wait to be written: the authors of the
    /// version the next save makes (ADR 0091 item 4).
    authors: Vec<String>,
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

/// Apply `update` to `doc`: whether it left nothing aside. A window's
/// updates reach the room in the order it sent them (`rpc.rs`), and each
/// depends only on what the room sent it and what it sent before, so an
/// update that leaves something aside — an item or a deletion of what the
/// room has not seen — comes from no window the room serves. The room
/// then holds it aside and is made again ([`take`]).
pub fn integrate(doc: &Doc, update: Update) -> Result<bool, yrs::error::UpdateError> {
    let mut txn = doc.transact_mut();
    txn.apply_update(update)?;
    Ok(!txn.has_missing_updates())
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

    /// The rooms `client` is in, but the one of `path` in `key`.
    fn joined_elsewhere(&self, client: &str, key: &str, path: &str) -> usize {
        let rooms: Vec<Arc<Mutex<Room>>> = lock(&self.map)
            .iter()
            .filter(|((k, p), _)| !(k == key && p == path))
            .map(|(_, r)| Arc::clone(r))
            .collect();
        // A room busy at this moment is not waited for: another window's
        // join of a big board holds its room for tens of milliseconds, and
        // every join of every note beside it queued behind that. The limit
        // is a guard against a window that opens a hundred notes, not an
        // exact count: a room busy now is at most missed by this one ask
        // (the next sees it), so the overshoot is bounded by the rooms
        // in the middle of an operation.
        rooms
            .iter()
            .filter(|r| match r.try_lock() {
                Ok(room) => room.clients.contains(client),
                Err(std::sync::TryLockError::Poisoned(p)) => {
                    p.into_inner().clients.contains(client)
                }
                Err(std::sync::TryLockError::WouldBlock) => false,
            })
            .count()
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

/// Push `message` to the room's windows but `except` — and but the
/// readers served its projection (ADR 0087), who hear nothing of its
/// document (`collab_readers.rs`).
fn tell(server: &Server, room: &Room, except: Option<&str>, message: &serde_json::Value) {
    // A window in a board's shadow hears the room's document only through
    // its shadow (`collab_players.rs`); the rest it hears, but for the hash
    // of the file, which is the whole file's.
    let doc = matches!(
        message["event"].as_str(),
        Some("collab-update" | "collab-awareness" | "collab-saved")
    );
    let (shadowed, whole): (Vec<String>, Vec<String>) = room
        .clients
        .iter()
        .filter(|c| Some(c.as_str()) != except && !room.readers.hides(c))
        .cloned()
        .partition(|c| room.readers.shadowed(c));
    server.push(&whole, message);
    if !doc && !shadowed.is_empty() {
        let mut cut = message.clone();
        if let Some(p) = cut["payload"].as_object_mut() {
            p.remove("hash");
        }
        server.push(&shadowed, &cut);
    }
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
    let note = kind_of(path) == Kind::Note;
    // A room holds its text whole: past the server's bound it is not made
    // (`crate::texts`).
    server.service.with_key(key, |ws| {
        crate::texts::readable(ws, note, path).map_err(verso_service::OpError::Contract)
    })?;
    if note {
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
    (client, reader): (&str, bool),
    key: &str,
    path: &str,
    user: &str,
) -> Result<CollabJoin, ContractError> {
    match join_room(server, (client, reader), key, path, user) {
        Err(e) if e.message == BROKEN => {
            reload(server, key, path, "its state could not be made");
            join_room(server, (client, reader), key, path, user)
        }
        joined => joined,
    }
}

/// The room of `path` in folder `key`, made from the disk when it is the
/// first window in it.
fn room_for(
    server: &Arc<Server>,
    key: &str,
    path: &str,
) -> Result<Option<Arc<Mutex<Room>>>, ContractError> {
    let kind = kind_of(path);
    Ok(Some(match server.rooms.get(key, path) {
        Some(room) => room,
        None => {
            let note = read(server, key, path)?;
            // The file as found, when its history has nothing yet: what
            // the room's first save can be undone to (ADR 0091).
            crate::history::seen(server, key, path, &note.text);
            let (doc, crlf, saved, board) = if kind == Kind::Board {
                // Drawn in by the first window to join (collab_board.rs).
                let doc = crate::collab_board::new_doc(&note.text);
                let board = crate::collab_board::Board::of(&doc);
                (doc, false, String::new(), board)
            } else {
                let Some((text, crlf)) = normalized(&note.text) else {
                    return Ok(None);
                };
                let doc = holding(new_doc(), &text);
                let size = crate::collab_board::Board::measured(&doc);
                (doc, crlf, text, size)
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
                writers: crate::writers::Writers::new(),
                board,
                rolls: std::collections::VecDeque::new(),
                readers: readers::Readers::default(),
                authors: Vec::new(),
            }));
            let mut map = lock(&server.rooms.map);
            // Two windows joining at once: the first room made stays.
            Arc::clone(map.entry((key.to_owned(), path.to_owned())).or_insert(room))
        }
    }))
}

/// The rooms one window may be in at once: the notes and boards a window
/// shows side by side, with room. Each room holds a document of up to
/// `collab_board::ROOM_MOST`; a connection that joined every note of a
/// folder would hold them all (the review of 2026-10-13).
pub const JOINED_MOST: usize = 64;

fn join_room(
    server: &Arc<Server>,
    (client, reader): (&str, bool),
    key: &str,
    path: &str,
    user: &str,
) -> Result<CollabJoin, ContractError> {
    if server.rooms.joined_elsewhere(client, key, path) >= JOINED_MOST {
        return Err(refused(&format!(
            "a window is in {JOINED_MOST} shared notes at most at once: close one first"
        )));
    }
    let kind = kind_of(path);
    // A reader never joins a board's room (ADR 0090 item 5): the room holds
    // every element, a secret pin's among them, and a reader would be told
    // them all. It follows the board by its file, as the server serves it
    // the board — without its secret pins — each time the room writes it.
    if reader && kind == Kind::Board {
        return Err(refused(
            "a board is followed live by those who may edit it: you see it as it is saved",
        ));
    }
    let wire = if kind == Kind::Board {
        CollabKind::Board
    } else {
        CollabKind::Text
    };
    let Some(room) = room_for(server, key, path)? else {
        // A text whose line ends are mixed: shown read-only, never shared.
        let note = read(server, key, path)?;
        return Ok(CollabJoin {
            kind: wire,
            update: String::new(),
            // A reader is not told the file's (ADR 0087).
            revision: if reader { String::new() } else { note.revision },
            read_only: true,
            crlf: false,
            user: user.to_owned(),
            epoch: String::new(),
            rolls: Vec::new(),
        });
    };
    let mut r = lock(&room);
    // A player of a table is asked again under the room's lock: what the
    // command saw may have changed, and a release or a hide that closed the
    // room's windows has run or will run after this window is in it.
    let reader = match readers::admitted(server, (client, reader), key, path) {
        Ok(reader) => reader,
        Err(e) => {
            // A room made for a window that is not let in is not kept.
            drop(r);
            leave(server, client, key, path);
            return Err(e);
        }
    };
    // A reader of a note with secret blocks joins its projection's own
    // document (ADR 0087 item 4).
    if reader && let Some(joined) = readers::join(server, &mut r, client, user)? {
        return Ok(joined);
    }
    let state = state(&r.doc, r.kind)?;
    r.clients.insert(client.to_owned());
    Ok(CollabJoin {
        kind: wire,
        update: b64(&state),
        revision: r.revision.clone(),
        read_only: false,
        crlf: r.crlf,
        user: user.to_owned(),
        epoch: r.epoch.clone(),
        rolls: r.rolls.iter().cloned().collect(),
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
    // Every room, a note's as a board's, refuses an update past
    // `UPDATE_MOST` before decoding it (ADR 0083 item 8, F13): its base64
    // first, then its bytes.
    let most = crate::collab_board::UPDATE_MOST;
    if update.len() > most.div_ceil(3) * 4 {
        return Err(refused("an update of 4 MB at most"));
    }
    let bytes = unb64(update)?;
    if bytes.len() > most {
        return Err(refused("an update of 4 MB at most"));
    }
    let decoded = decode(&bytes)?;
    let mut r = lock(&room);
    if !r.clients.contains(client) {
        return Err(refused("join the note first"));
    }
    if r.readers.shadowed(client) {
        // A player in a board's shadow: judged by element.
        if players::update(server, &mut r, (client, account), &bytes)? {
            r.edited = Instant::now();
            if !r.scheduled && !r.conflict && r.waiting() {
                r.scheduled = true;
                schedule(server, Arc::clone(&room));
            }
        }
        return Ok(());
    }
    let who = crate::writers::Writer {
        connection: client,
        account,
    };
    let judged = caught(|| crate::writers::judged(&r.doc, &decoded, who, &r.writers, &r.clients))?;
    let clients = match judged {
        Ok(clients) => clients,
        Err(why) => {
            crate::log::warn(&format!(
                "room {}/{path}: an update from account {account} refused: {why}",
                folder_name(server, key)
            ));
            return Err(refused(&why));
        }
    };
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
    {
        let Room {
            writers,
            clients: present,
            ..
        } = &mut *r;
        crate::writers::claim(who, &clients, writers, present);
    }
    readers::guard(server, &mut r);
    if !r.authors.iter().any(|a| a == account) {
        r.authors.push(account.to_owned());
    }
    tell(
        server,
        &r,
        Some(client),
        &event("collab-update", path, "update", &json!(update)),
    );
    players::sync(server, &mut r);
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

/// A window's update, decoded once it is [`readable`]. `yrs` asserts as it
/// decodes (a client past 53 bits, `block.rs:92`, where debug assertions
/// are on: the tests and the fuzz targets): a panic is a refusal, like any
/// bytes it cannot read, and the room — which holds nothing of it yet —
/// stays as it was.
pub(crate) fn decode(bytes: &[u8]) -> Result<Update, ContractError> {
    readable(bytes)?;
    std::panic::catch_unwind(|| Update::decode_v1(bytes))
        .map_err(|_| refused("an update the room cannot read"))?
        .map_err(|e| refused(&format!("not a Yjs update: {e}")))
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
        if ahead_of_room(doc, &decoded) {
            return Err(refused("an update the room cannot read"));
        }
        if kind == Kind::Board {
            board.admits(doc, bytes, &decoded)?;
        } else if board.bytes.saturating_add(bytes.len()) > crate::collab_board::ROOM_MOST {
            // A note's room has the board's size (the review of
            // 2026-10-13): its updates are 4 MB each, but without end.
            return Err(refused("a note edited together holds 64 MB at most"));
        }
        board.bytes = board.bytes.saturating_add(bytes.len());
        // An update `yrs` stopped applying halfway (the fuzz target
        // `board`: a parent that is no type), or one that left what the
        // room has not seen aside: the document is not what any window
        // holds, and the room is made again.
        match integrate(doc, decoded) {
            Ok(true) => Ok(()),
            Ok(false) | Err(_) => Err(refused(BROKEN)),
        }
    })?
}

/// Whether `update` makes or deletes items of the room's own Yjs client
/// past those the room has made (findings 5 and its sequel, ADR 0083 item
/// 14): `yrs` keeps a deletion of what is not there yet and applies it to
/// the room's next items, and an item made as the room's client takes the
/// clock of the room's next own edit — either way a change from outside
/// or a merged write reads otherwise in the windows than in the room. Only
/// the room makes its own items and every window learns them from it, so
/// no window can have seen one ahead; a window's whole state sent back
/// holds only those the room made. Another window's items are not judged:
/// a connection's updates can reach the room in the other order, a
/// deletion before the insert it deletes.
fn ahead_of_room(doc: &Doc, update: &Update) -> bool {
    let own = doc.client_id();
    let made = doc.transact().state_vector().get(&own);
    let past = |set: &yrs::IdSet| {
        set.iter()
            .find(|(c, _)| **c == own)
            .is_some_and(|(_, ranges)| ranges.iter().any(|r| r.end > made))
    };
    past(update.delete_set()) || past(&update.insertions(true))
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
/// window and to read there as the room reads — its text, or its board's
/// elements. `yrs` 0.28 can make a state it cannot read back (the fuzz
/// target `board`: `EndOfBuffer`), and a hostile window's item whose two
/// neighbours are not neighbours is placed by the room as it came and by a
/// window that joins as the state orders it (the target `note`).
pub(crate) fn state(doc: &Doc, kind: Kind) -> Result<Vec<u8>, ContractError> {
    let state = caught(|| {
        doc.transact()
            .encode_state_as_update_v1(&StateVector::default())
    })?;
    let window = new_doc();
    applies(&window, &state)?;
    let alike = caught(|| match kind {
        Kind::Board => crate::collab_board::elements(doc) == crate::collab_board::elements(&window),
        Kind::Note | Kind::Text => text_of(doc) == text_of(&window),
    })?;
    if !alike {
        return Err(refused(BROKEN));
    }
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
    applies(&window, &state(doc, Kind::Board)?)?;
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
    crate::log::warn(&format!("room {}/{path}: {why}", folder_name(server, key)));
    close(server, key, path);
}

/// The folder of `key`, as the log names it.
fn folder_name(server: &Server, key: &str) -> String {
    lock(&server.keys)
        .get(key)
        .cloned()
        .unwrap_or_else(|| key.to_owned())
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
    let stamped = readers::presence(server, &r, who.client, stamped);
    players::presence(server, &r, who.client, &stamped);
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
        let began = Instant::now();
        loop {
            tokio::time::sleep(QUIET).await;
            let wait = QUIET.saturating_sub(lock(&room).edited.elapsed());
            if wait.is_zero() || began.elapsed() >= LONGEST {
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
    // What the file holds once written, said with the save (below): a
    // synced device knows it for its own room's save (ADR 0082 item 9).
    let hash = {
        let on_disk: &[u8] = bytes.as_ref();
        crate::sync::sha256(on_disk)
    };
    let written = write_file(server, &r, bytes, revision);
    match written {
        Ok(revision) => {
            r.revision = revision;
            let path = r.path.clone();
            match text {
                Some(text) => {
                    r.saved = text;
                    readers::written(server, &mut r);
                    // Measured again once written, as a board's is.
                    let size = crate::collab_board::Board::measured(&r.doc).bytes;
                    r.board.bytes = size;
                }
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
                    r.board.whole_saved = players::whole_edits(&r.doc, &r.writers);
                    players::sync(server, &mut r);
                }
            }
            // The folder's log for sync follows the save (ADR 0079 item 4),
            // before the windows hear it: a save heard is one a device's
            // next question finds.
            let authors = std::mem::take(&mut r.authors);
            crate::sync::reconcile_saved(server, &r.key, &path, &authors);
            if r.kind == Kind::Board {
                crate::readers::board_saved(server, &r.key, &path);
            }
            let mut saved = event("collab-saved", &path, "revision", &json!(r.revision));
            saved["payload"]["hash"] = json!(hash);
            tell(server, &r, None, &saved);
            players::saved(server, &mut r);
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
        r.readers.forget(client);
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
            r.readers.forget(client);
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
            r.readers.forget(client);
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
        if r.readers.shadowed(client) {
            players::canvas(server, &mut r, client, &at, &json)?;
        } else {
            r.board.keep(&at, json)?;
        }
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
                readers::guard(server, &mut r);
                tell(
                    server,
                    &r,
                    None,
                    &event("collab-update", path, "update", &json!(b64(&update))),
                );
            }
            r.crlf = crlf;
            r.saved = text;
            readers::written(server, &mut r);
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
        // Every window, its readers too: each reads the file again.
        let to: Vec<String> = lock(&room).clients.iter().cloned().collect();
        server.push(&to, &event("collab-closed", path, "revision", &json!(null)));
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
            readers::guard(server, &mut r);
            tell(
                server,
                &r,
                None,
                &event("collab-update", path, "update", &json!(b64(&update))),
            );
        }
        r.crlf = crlf;
        r.saved = text;
        readers::written(server, &mut r);
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
        let mut r = lock(&room);
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
            readers::guard(server, &mut r);
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

/// Every room of `path` said to have grown to `bytes`, for the tests of
/// the room's size.
#[cfg(test)]
pub(crate) fn fill(server: &Server, path: &str, bytes: usize) {
    for ((_, p), room) in lock(&server.rooms.map).iter() {
        if p == path {
            lock(room).board.bytes = bytes;
        }
    }
}

#[cfg(test)]
#[path = "collab_tests.rs"]
mod tests;
