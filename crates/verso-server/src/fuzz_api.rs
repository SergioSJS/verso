// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The server's inputs, opened to its fuzz harness (`fuzz/`, ADR 0083 item
//! 14) and to nothing else: compiled with the `fuzzing` feature only, which
//! nothing that ships turns on. Each function calls the server's own code
//! at the point a peer's bytes enter it — none is a copy of it — and is
//! here only because that code is the crate's own (`pub(crate)`): the
//! request a WebSocket message carries (`rpc.rs`), and a window's update
//! taken into a note's or a board's room (`collab.rs`) without the room's
//! place, its people and its file. What is public already — the board's
//! merge, the presence reader, `host_ok`, `config::size` — the targets call
//! directly.

use serde_json::Value;
use yrs::ClientID;
use yrs::updates::decoder::Decode;
use yrs::{Doc, Options, ReadTxn, StateVector, Transact, Update};

use crate::collab::{self, Kind};
use crate::collab_board::{self, Board};

/// A request as the connection's loop reads it: its id, its command and
/// its arguments.
pub type Request = (u64, String, Value);

fn plain(r: crate::rpc::Request) -> Request {
    (r.id, r.cmd, r.args)
}

/// A text message's request (`rpc::text_request`).
#[must_use]
pub fn text_request(text: &str) -> Option<Request> {
    crate::rpc::text_request(text).map(plain)
}

/// A binary message's request and piece (`rpc::binary_request`): the
/// piece is a slice of `message`, which the loop then takes as one.
#[must_use]
pub fn binary_request(message: &[u8]) -> Option<(Option<Request>, &[u8])> {
    crate::rpc::binary_request(message).map(|(r, piece)| (r.map(plain), piece))
}

/// A window's update, as `collab::update` takes it once the room is found
/// and the window is in it: decoded, then [`collab::take`].
fn update(kind: Kind, doc: &Doc, board: &mut Board, bytes: &[u8]) -> Result<(), String> {
    let decoded = Update::decode_v1(bytes).map_err(|e| format!("not a Yjs update: {e}"))?;
    collab::take(kind, doc, board, bytes, decoded).map_err(|e| e.message)
}

/// A note's room (or any other text file's), as `collab::join` makes it
/// of the file's text, with its document's Yjs client fixed: the server's
/// is random, and a run must replay.
pub struct NoteRoom {
    doc: Doc,
    saved: String,
    crlf: bool,
    board: Board,
}

impl NoteRoom {
    /// The room of a file whose text is `text`; `None` when the file mixes
    /// line ends (shown read-only, never shared).
    #[must_use]
    pub fn open(text: &str, client: u64) -> Option<Self> {
        let (text, crlf) = collab::normalized(text)?;
        let options = collab::utf16(Options::with_client_id(ClientID::new(client)));
        let doc = collab::holding(Doc::with_options(options), &text);
        Some(Self {
            doc,
            saved: text,
            crlf,
            board: Board::default(),
        })
    }

    /// What a window that joins is sent: the room's whole state.
    #[must_use]
    pub fn state(&self) -> Vec<u8> {
        self.doc
            .transact()
            .encode_state_as_update_v1(&StateVector::default())
    }

    /// A window's update, taken in as `collab::update` takes it.
    pub fn update(&mut self, bytes: &[u8]) -> Result<(), String> {
        update(Kind::Note, &self.doc, &mut self.board, bytes)
    }

    /// The room's text, as it is written and as every window shows it.
    #[must_use]
    pub fn text(&self) -> String {
        collab::text_of(&self.doc)
    }

    /// Whether the room holds edits not yet written.
    #[must_use]
    pub fn waiting(&self) -> bool {
        self.text() != self.saved
    }

    /// The bytes the room writes: its text, with the file's line ends.
    #[must_use]
    pub fn on_disk(&self) -> String {
        collab::on_disk(&self.text(), self.crlf)
    }

    /// The file changed outside with nothing waiting
    /// (`collab::changed_outside`): the disk's `text` enters the room as
    /// one edit of the server's, the update relayed returned. `None` when
    /// the new text mixes line ends (the room is then closed).
    pub fn outside(&mut self, text: &str) -> Option<Option<Vec<u8>>> {
        let (text, crlf) = collab::normalized(text)?;
        let update = collab::apply_text(&self.doc, &text);
        self.crlf = crlf;
        self.saved = text;
        Some(update)
    }

    /// A write that reaches the shared note from elsewhere
    /// (`collab::write_through`), merged into the room's edits: the update
    /// relayed, or why it was refused.
    pub fn write_through(&self, text: &str) -> Result<Option<Vec<u8>>, String> {
        collab::merge_into(&self.doc, &self.saved, text).map_err(|e| e.message)
    }
}

/// A board's room, as `collab::join` makes it of the file `base`, with its
/// document's Yjs client fixed. Its document and its own state are the
/// server's types, open to the board's public functions (`collab_board`).
pub struct BoardRoom {
    pub doc: Doc,
    pub board: Board,
}

impl BoardRoom {
    #[must_use]
    pub fn open(base: &str, client: u64) -> Self {
        let doc = collab_board::based(Doc::with_client_id(client), base);
        let board = Board::of(&doc);
        Self { doc, board }
    }

    /// A window's update, taken in as `collab::update` takes it: within
    /// the board's limits, then integrated.
    pub fn update(&mut self, bytes: &[u8]) -> Result<(), String> {
        update(Kind::Board, &self.doc, &mut self.board, bytes)
    }
}
