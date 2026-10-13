// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the fuzz targets `note` and `board` found a window can send a room
//! (ADR 0083 item 14): updates that declare more than they hold, refused
//! before `yrs` reads them; and updates on which `yrs` 0.28 panics — an
//! `unwrap`, a division by zero, a read past an end, in a release build
//! too — which the room catches ([`collab::BROKEN`]) and survives: made
//! again from its file ([`collab::join`] and `reload`), it still serves.

use yrs::updates::decoder::Decode;
use yrs::{Doc, Transact, Update};

use crate::collab::{self, Kind, decode, holding, new_doc, take};
use crate::collab_board;

/// A room's document through windows' `updates`, as the server keeps it:
/// each update taken in ([`take`]), then the room's state made for the
/// next window ([`collab::state`]). When either says [`collab::BROKEN`],
/// the room is made again from its file, as `reload` has the windows do.
/// The state the next window gets — which must apply in a window — and
/// how many updates were refused as BROKEN.
fn served(kind: Kind, file: &str, doc: Doc, updates: &[&[u8]]) -> (Vec<u8>, usize) {
    let fresh = || match kind {
        Kind::Board => collab_board::new_doc(file),
        Kind::Note | Kind::Text => holding(new_doc(), file),
    };
    let mut doc = doc;
    let mut board = collab_board::Board::of(&doc);
    let mut broken = 0;
    for update in updates {
        let Ok(decoded) = decode(update) else {
            continue;
        };
        if let Err(e) = take(kind, &doc, &mut board, update, decoded)
            && e.message == collab::BROKEN
        {
            broken += 1;
            doc = fresh();
            board = collab_board::Board::of(&doc);
        }
    }
    let state = match collab::state(&doc) {
        Ok(state) => state,
        Err(e) => {
            assert_eq!(e.message, collab::BROKEN);
            collab::state(&fresh()).expect("a room made from its file has a state")
        }
    };
    let window = Doc::new();
    window
        .transact_mut()
        .apply_update(Update::decode_v1(&state).expect("the room's state decodes"))
        .expect("the room's state applies in a window");
    (state, broken)
}

/// An update naming `client` with no runs at all: a count of one client,
/// no runs, the client (lib0's variable-length integer), its first clock,
/// no deletions.
fn no_runs_of(client: u64) -> Vec<u8> {
    let mut out = vec![1, 0];
    let mut n = client;
    while n >= 0x80 {
        out.push(u8::try_from(n & 0x7f).unwrap() | 0x80);
        n >>= 7;
    }
    out.push(u8::try_from(n).unwrap());
    out.extend([0, 0]);
    out
}

/// `fuzz/seeds-note/gc-of-no-length.bin`: one client holding one deleted
/// run of length 0. A debug build of `yrs` subtracts past zero making the
/// room's state (`block.rs:252`); caught, the room is made again.
#[test]
fn a_run_of_no_length_does_not_break_a_note_room() {
    let doc = holding(new_doc(), "# Nota\n");
    served(Kind::Note, "# Nota\n", doc, &[&[1, 1, 0, 0, 0, 0, 0]]);
}

/// `fuzz/seeds-board/client-of-no-runs.bin`: the room's own Yjs client —
/// which every window reads in the room's state — with no runs at all.
/// `yrs` unwraps nothing as it applies it (`update.rs:85`); the update is
/// refused and the room made again.
#[test]
fn a_client_of_no_runs_does_not_break_a_board_room() {
    let doc = collab_board::new_doc("{}");
    let update = no_runs_of(doc.client_id().get());
    let (_, broken) = served(Kind::Board, "{}", doc, &[&update]);
    assert_eq!(broken, 1);
}

/// The same update in a note's room.
#[test]
fn a_client_of_no_runs_does_not_break_a_note_room() {
    let doc = holding(new_doc(), "# Nota\n");
    let update = no_runs_of(doc.client_id().get());
    let (_, broken) = served(Kind::Note, "# Nota\n", doc, &[&update]);
    assert_eq!(broken, 1);
}

/// A board room of a fuzz input of the target `board` (records: 0 is the
/// file, 3 on are the windows' updates), its Yjs client 1 as the
/// target's.
fn board_replayed(input: &[u8]) -> usize {
    let records = records(input);
    let base = String::from_utf8_lossy(records.first().copied().unwrap_or_default());
    let doc = collab_board::based(Doc::with_client_id(1), &base);
    served(Kind::Board, &base, doc, &records[3.min(records.len())..]).1
}

/// `fuzz/seeds-board/divide-by-zero.bin`: updates on which `yrs` divides
/// by zero as it integrates them (`block_store.rs:60`).
#[test]
fn updates_that_divide_by_zero_do_not_break_a_board_room() {
    let broken = board_replayed(include_bytes!("../fuzz/seeds-board/divide-by-zero.bin"));
    assert!(broken >= 1);
}

/// `fuzz/seeds-board/state-that-does-not-apply.bin`: updates after which
/// `yrs` reads past the end of what it kept aside as it makes the room's
/// state (`transaction.rs:390`); caught, the room is made again.
#[test]
fn a_board_rooms_state_applies_in_a_window() {
    board_replayed(include_bytes!(
        "../fuzz/seeds-board/state-that-does-not-apply.bin"
    ));
}

/// A fuzz input's records (`fuzz/fuzz_targets/records.rs`): each a
/// two-byte length and its bytes.
fn records(input: &[u8]) -> Vec<&[u8]> {
    let mut records = Vec::new();
    let mut data = input;
    while let Some((len, rest)) = data.split_first_chunk::<2>() {
        let len = usize::from(u16::from_le_bytes(*len)).min(rest.len());
        records.push(&rest[..len]);
        data = &rest[len..];
    }
    records
}

/// Found by the fuzz target `note`: four bytes that declare 2^28
/// clients, for which `yrs` reserved 22 GB before reading one. Refused
/// before `yrs` sees them.
#[test]
fn an_update_that_declares_more_clients_than_bytes_is_refused() {
    let input = include_bytes!("../fuzz/seeds-note/clients-count-bomb.bin");
    let update = records(input)[3];
    let e = decode(update).expect_err("refused");
    assert_eq!(e.message, "an update the room cannot read");
}

/// Found by the fuzz target `board`: a window's state vector that
/// declares 243 million entries in four bytes (9 GB reserved).
#[test]
fn a_state_vector_that_declares_more_entries_than_bytes_is_refused() {
    let input = include_bytes!("../fuzz/seeds-board/state-vector-count-bomb.bin");
    let at = records(input)[2];
    let doc = crate::collab_board::new_doc("{}");
    let mut board = crate::collab_board::Board::of(&doc);
    let e = board.keep(at, String::new()).expect_err("refused");
    assert_eq!(e.message, "an update the room cannot read");
}

/// Seen in the fuzz target `board` once the count was guarded: `yrs`
/// reads the count in up to eleven bytes, its shifts wrapping at 32
/// bits, so a count written long declares as much as a short one.
#[test]
fn a_count_written_in_eleven_bytes_is_read_as_yrs_reads_it() {
    let mut update = vec![0xff; 10];
    update.extend([0x01, 0, 0]);
    let e = decode(&update).expect_err("refused");
    assert_eq!(e.message, "an update the room cannot read");
}
