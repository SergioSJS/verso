// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A reader in a live note that holds secret blocks (ADR 0087 item 4,
//! decided 2026-10-14): a window that may only read the note does not
//! join the note's Yjs document — every keystroke of it, and its history,
//! would carry the secret — but a document of its own, the room's
//! *shadow*, which holds the note's projection (`verso_core::secret::project`)
//! and follows the room each time the room writes the file (the quiet of
//! 900 ms, ADR 0082). Its presence shows who is in the note, never the
//! writers' cursors, whose places would place the hidden text; its own
//! cursor, in the shadow, is not told to the writers either.
//!
//! A note with no secret block keeps the room as it was for every member.
//! The room *splits* the first time its text holds a secret block while a
//! reader is in it, or when a reader joins a room whose text holds one:
//! readers already in the document are told the room closed
//! (`collab-closed`), read the note again — its projection — and join
//! anew, into the shadow. A split room stays split while it lives: a
//! document that once held a secret may hold it in its history.

use std::collections::HashSet;

use serde_json::json;
use verso_contract::{CollabJoin, CollabKind, CollabOracle, CollabRoll, ContractError};
use verso_service::lock;
use yrs::Doc;

use super::{Kind, Room, apply_text, b64, event, holding, new_doc, state, text_of};
use crate::state::Server;

/// The readers of a room and what they are served.
#[derive(Default)]
pub struct Readers {
    /// The windows in the room that may only read the note: a part of the
    /// room's `clients`.
    clients: HashSet<String>,
    /// The room's text holds, or held, a secret block: its readers hear
    /// nothing of its document, only of `shadow`.
    split: bool,
    /// The projection's own document, made when the room splits.
    shadow: Option<Doc>,
    /// Which shadow this is: a window that joins again compares it.
    epoch: String,
    /// The shadows of a board's room, one per account that edits it from a
    /// table (ADR 0113 section H).
    pub(super) players: super::players::Shadows,
}

impl Readers {
    /// Whether `client` hears nothing of the room's own document.
    pub fn hides(&self, client: &str) -> bool {
        self.split && self.clients.contains(client)
    }

    /// Whether `client` is in a board's shadow: it hears the room's document
    /// only through it.
    pub fn shadowed(&self, client: &str) -> bool {
        self.players.holds(client)
    }

    /// `client` left the room.
    pub fn forget(&mut self, client: &str) {
        self.clients.remove(client);
        self.players.forget(client);
    }

    /// The readers served the shadow.
    fn shown(&self) -> Vec<String> {
        if self.split {
            self.clients.iter().cloned().collect()
        } else {
            Vec::new()
        }
    }
}

/// The text the readers of `r` are served for `text`: its projection
/// (ADR 0087), and, in a table, with the links to notes not released
/// drawn as text (ADR 0110 item 7). Fails closed: a table's text that
/// cannot be veiled is served empty.
fn shown_to_readers(server: &Server, r: &Room, text: &str) -> String {
    let projected = verso_core::secret::project(text).into_owned();
    let Some(veil) = crate::campaign::veil_for_key(server, &r.key) else {
        return projected;
    };
    let path = r.path.clone();
    let basis = projected.clone();
    server
        .service
        .with_key(&r.key, move |ws| {
            Ok(crate::campaign_serve::device_text(ws, &veil, &path, &basis))
        })
        .map_or_else(|_| String::new(), |v| v.unwrap_or(projected))
}

/// Whether the readers of `r` are served something other than `text`: it
/// holds a secret block, or a link a table's veil draws as text.
fn secret_in(server: &Server, r: &Room, text: &str) -> bool {
    !verso_core::secret::Secrets::of(text).is_empty() || shown_to_readers(server, r, text) != text
}

/// Split `r` over `text`, its text now: the shadow made of the projection.
fn split(server: &Server, r: &mut Room, text: &str) -> Result<(), ContractError> {
    r.readers.split = true;
    let shown = shown_to_readers(server, r, text);
    r.readers.shadow = Some(holding(new_doc(), &shown));
    r.readers.epoch = crate::crypto::id().map_err(verso_service::failed)?;
    Ok(())
}

/// The room's text just changed — a window's edit, a write from
/// elsewhere, the disk — and is about to be told: if it now holds a secret
/// block while readers are in its document, the room splits first, and
/// those readers leave it, told to read the note again. Called before
/// every `collab-update` of a note's room.
pub fn guard(server: &Server, r: &mut Room) {
    if r.readers.split || r.kind != Kind::Note || r.readers.clients.is_empty() {
        return;
    }
    let text = text_of(&r.doc);
    if !secret_in(server, r, &text) {
        return;
    }
    if let Err(e) = split(server, r, &text) {
        // No shadow: the readers still leave the document (fails closed).
        crate::log::warn(&format!("a room's readers' document: {}", e.message));
    }
    let out: Vec<String> = r.readers.clients.drain().collect();
    for c in &out {
        r.clients.remove(c);
    }
    let path = r.path.clone();
    server.push(
        &out,
        &event("collab-closed", &path, "revision", &json!(null)),
    );
}

/// `client`, a reader, joins `r`: into the shadow when the room's text
/// holds a secret block (or held one); `None` when the room is the same
/// for everyone, and the reader joins its document.
pub fn join(
    server: &Server,
    r: &mut Room,
    client: &str,
    user: &str,
) -> Result<Option<CollabJoin>, ContractError> {
    r.readers.clients.insert(client.to_owned());
    if r.kind != Kind::Note {
        return Ok(None);
    }
    if !r.readers.split {
        let text = text_of(&r.doc);
        if !secret_in(server, r, &text) {
            return Ok(None);
        }
        split(server, r, &text)?;
    }
    let Some(shadow) = r.readers.shadow.as_ref() else {
        return Err(verso_service::failed(
            "the note's readers' document is missing",
        ));
    };
    let update = b64(&state(shadow, Kind::Text)?);
    // What a reader is told of the file: its projection's revision, never
    // the file's (its length would count the hidden bytes).
    let path = r.path.clone();
    let revision = server
        .service
        .with_key(&r.key, move |ws| Ok(ws.reader_read_text(&path)?.revision))?;
    let shown = text_of(shadow);
    let whole = text_of(&r.doc);
    let rolls = r
        .rolls
        .iter()
        .filter(|roll| visible(&whole, &shown, roll))
        .cloned()
        .collect();
    r.clients.insert(client.to_owned());
    Ok(Some(CollabJoin {
        kind: CollabKind::Text,
        update,
        revision,
        read_only: false,
        crlf: r.crlf,
        user: user.to_owned(),
        epoch: r.readers.epoch.clone(),
        rolls,
    }))
}

/// The room wrote its file, or took the disk's text (`r.saved` is it
/// now): the shadow follows, and its readers hear the edit.
pub fn written(server: &Server, r: &mut Room) {
    let to = r.readers.shown();
    if to.is_empty() {
        return;
    }
    let shown = shown_to_readers(server, r, &r.saved);
    let Some(shadow) = r.readers.shadow.as_ref() else {
        return;
    };
    if let Some(update) = apply_text(shadow, &shown) {
        server.push(
            &to,
            &event("collab-update", &r.path, "update", &json!(b64(&update))),
        );
    }
}

/// A presence `stamped` from `sender`, as the room's document's windows
/// hear it: whole, or — from a reader in the shadow — its name only. The
/// readers in the shadow hear every other presence by its name only.
pub fn presence(server: &Server, r: &Room, sender: &str, stamped: Vec<u8>) -> Vec<u8> {
    let to: Vec<String> = r
        .readers
        .shown()
        .into_iter()
        .filter(|c| c != sender)
        .collect();
    if to.is_empty() && !r.readers.hides(sender) {
        return stamped;
    }
    let named = crate::presence::named_only(&stamped).unwrap_or_default();
    if !to.is_empty() && !named.is_empty() {
        server.push(
            &to,
            &event("collab-awareness", &r.path, "update", &json!(b64(&named))),
        );
    }
    if r.readers.hides(sender) {
        named
    } else {
        stamped
    }
}

/// Whether a roll may be told to the readers in the shadow, whose text is
/// `shown` (the room's own, `whole`): a roll from a random table only when
/// the link to the table is in the projection, and any roll only when its
/// dice are written there — a roll made from inside a secret block is the
/// block's. And only when no die with its code is hidden: a code written
/// both in a secret block and in the open names its die only by its place
/// among them (`occurrence`, counted by the window), and the roll may be
/// the hidden one's, so it is not told (ADR 0087 item 4 fails closed).
fn visible(whole: &str, shown: &str, roll: &verso_contract::DiceRoll) -> bool {
    let compact = |t: &str| -> String { t.chars().filter(|c| !c.is_whitespace()).collect() };
    let (whole_c, shown_c) = (compact(whole), compact(shown));
    let dice = shown_c.contains(&roll.notation);
    let open = match &roll.source {
        Some(source) => dice && shown.contains(source.as_str()),
        None => dice,
    };
    let key = compact(roll.source.as_deref().unwrap_or(&roll.notation));
    if key.is_empty() {
        return open;
    }
    open && whole_c.matches(key.as_str()).count() <= shown_c.matches(key.as_str()).count()
}

/// Whether the folder's readers may be told of `roll` made in `r`: always,
/// unless the note holds secret blocks and the roll is not one the
/// projection shows (`visible`). The table asks it (ADR 0107).
pub fn roll_is_open(r: &Room, roll: &verso_contract::DiceRoll) -> bool {
    r.readers
        .shadow
        .as_ref()
        .is_none_or(|shadow| visible(&text_of(&r.doc), &text_of(shadow), roll))
}

/// Whether `r` has no secret blocks to keep from its readers.
pub fn no_shadow(r: &Room) -> bool {
    r.readers.shadow.is_none()
}

/// A roll told to the room: also to the readers in the shadow, when it
/// is not a secret block's (the others heard it already).
pub fn roll(server: &Server, r: &Room, sender: &str, heard: &CollabRoll) {
    let to: Vec<String> = r
        .readers
        .shown()
        .into_iter()
        .filter(|c| c != sender)
        .collect();
    if to.is_empty() {
        return;
    }
    let Some(shadow) = r.readers.shadow.as_ref() else {
        return;
    };
    if visible(&text_of(&r.doc), &text_of(shadow), &heard.roll) {
        server.push(&to, &json!({ "event": "collab-roll", "payload": heard }));
    }
}

/// A question drawn in the room, told also to the readers in the shadow:
/// it carries no text of the note (a spark's or a table's words may come
/// from a secret block, and are not told to them).
pub fn oracle(server: &Server, r: &Room, sender: &str, heard: &CollabOracle) {
    let to: Vec<String> = r
        .readers
        .shown()
        .into_iter()
        .filter(|c| c != sender)
        .collect();
    if !to.is_empty() {
        server.push(&to, &json!({ "event": "collab-oracle", "payload": heard }));
    }
}

/// `client` may no longer write the folder (its role became reader): out
/// of every room, told each closed, so that it reads each note again and
/// joins as a reader — never left in a document that may hold a secret.
pub fn demoted(server: &Server, client: &str) {
    let paths: Vec<String> = lock(&server.rooms.map)
        .values()
        .filter_map(|room| {
            let r = lock(room);
            r.clients.contains(client).then(|| r.path.clone())
        })
        .collect();
    if paths.is_empty() {
        return;
    }
    super::gone_now(server, client);
    let to = [client.to_owned()];
    for path in paths {
        server.push(
            &to,
            &event("collab-closed", &path, "revision", &json!(null)),
        );
    }
}

/// A table's state changed (a release, a hide, a grant, a table made or
/// undone): the readers of every room of `key` leave the document they
/// hold, told each closed, so that they read the note again and join anew
/// over the text the veil now leaves (ADR 0110 item 4). A room that was
/// split stays split (a document that once held a secret may hold it in
/// its history), its shadow made again from the text now.
///
/// A player who edits the note by a grant is in the room's document, not
/// among its readers: it is asked again too, and leaves when the note is
/// no longer one it sees, or one it may edit — told the room closed, it
/// reads the note again and joins as what it now is.
pub fn veil_changed(server: &Server, key: &str) {
    let rooms: Vec<_> = lock(&server.rooms.map)
        .iter()
        .filter(|((k, _), _)| k == key)
        .map(|(_, room)| std::sync::Arc::clone(room))
        .collect();
    for room in rooms {
        let mut r = lock(&room);
        // What an account sees of a board may have changed: its shadows go.
        super::players::veil_changed(server, &mut r);
        if r.kind == Kind::Note && r.readers.split {
            let text = text_of(&r.doc);
            if let Err(e) = split(server, &mut r, &text) {
                crate::log::warn(&format!("a room's readers' document: {}", e.message));
            }
        }
        let mut out: Vec<String> = if r.kind == Kind::Note {
            r.readers.clients.drain().collect()
        } else {
            Vec::new()
        };
        let rest: Vec<String> = r
            .clients
            .iter()
            .filter(|c| !out.contains(c) && !still_admitted(server, c, &r.key, &r.path, true))
            .cloned()
            .collect();
        out.extend(rest);
        if out.is_empty() {
            continue;
        }
        for c in &out {
            r.clients.remove(c);
            r.readers.forget(c);
        }
        let path = r.path.clone();
        server.push(
            &out,
            &event("collab-closed", &path, "revision", &json!(null)),
        );
    }
}

/// Whether the window `client` may be in the document of the room of
/// `path`: a game master always; a player when the note is one it sees and
/// it may edit (`edits`) — a player who may only read has no place in the
/// document of a note with a grant, it reads the note as every reader does.
fn still_admitted(server: &Server, client: &str, key: &str, path: &str, edits: bool) -> bool {
    let (account, asker, folder) = {
        let table = lock(&server.clients);
        match table.get(client) {
            // A window that is not known any more is not in a room.
            None => return false,
            Some(c) => (
                c.account.clone(),
                crate::access::asker_of(c),
                c.folder.as_ref().map(|(f, _)| f.clone()),
            ),
        }
    };
    // The game master, and whoever no veil cuts, is in any room.
    let table = folder
        .as_deref()
        .is_some_and(|f| crate::access::has_table(server, f));
    if !crate::access::veiled(&asker, table) {
        return true;
    }
    let Some(veil) = crate::campaign::veil_for_key(server, key) else {
        return true;
    };
    let veil = veil.view(&account);
    let editor = asker.role == Some(crate::db::Role::Editor);
    !veil.hides_note(path) && (!edits || veil.may_edit(path, &account) || editor)
}

/// `client` joins the room of `path` of folder `key`: a player must still
/// see the note, asked under the room's lock — the check of the command
/// ran before it, and the table may have changed between the two. Returns
/// whether the window joins as a reader: one that asked to edit by a grant
/// the table has since taken back joins as a reader, as it would have been
/// told to.
pub fn admitted(
    server: &Server,
    (client, reader): (&str, bool),
    key: &str,
    path: &str,
) -> Result<bool, ContractError> {
    // Not there for it, as a hidden note is for every door.
    if !still_admitted(server, client, key, path, false) {
        return Err(ContractError {
            kind: verso_contract::ErrorKind::NotFound,
            message: "not found".to_owned(),
        });
    }
    Ok(reader || !still_admitted(server, client, key, path, true))
}
