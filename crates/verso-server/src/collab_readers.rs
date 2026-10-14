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
use verso_contract::{CollabJoin, CollabKind, CollabRoll, ContractError};
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
}

impl Readers {
    /// Whether `client` hears nothing of the room's own document.
    pub fn hides(&self, client: &str) -> bool {
        self.split && self.clients.contains(client)
    }

    /// `client` left the room.
    pub fn forget(&mut self, client: &str) {
        self.clients.remove(client);
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

/// Whether `text` holds a secret block.
fn secret_in(text: &str) -> bool {
    !verso_core::secret::Secrets::of(text).is_empty()
}

/// Split `r` over `text`, its text now: the shadow made of the projection.
fn split(r: &mut Room, text: &str) -> Result<(), ContractError> {
    r.readers.split = true;
    let shown = verso_core::secret::project(text);
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
    if !secret_in(&text) {
        return;
    }
    if let Err(e) = split(r, &text) {
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
        if !secret_in(&text) {
            return Ok(None);
        }
        split(r, &text)?;
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
    let rolls = r
        .rolls
        .iter()
        .filter(|roll| visible(&shown, roll))
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
    let shown = verso_core::secret::project(&r.saved).into_owned();
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
/// `shown`: a roll from a random table only when the link to the table is
/// in the projection, and any roll only when its dice are written there —
/// a roll made from inside a secret block is the block's.
fn visible(shown: &str, roll: &verso_contract::DiceRoll) -> bool {
    let compact: String = shown.chars().filter(|c| !c.is_whitespace()).collect();
    let dice = compact.contains(&roll.notation);
    match &roll.source {
        Some(source) => dice && shown.contains(source.as_str()),
        None => dice,
    }
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
    if visible(&text_of(shadow), &heard.roll) {
        server.push(&to, &json!({ "event": "collab-roll", "payload": heard }));
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
