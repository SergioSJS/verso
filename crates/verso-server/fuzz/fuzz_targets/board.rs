// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: a Yjs update integrated into a board's room, and the
//! board's merge (ADR 0083 item 14, F6). A window on a shared board sends
//! its edits as Yjs updates over a map of elements keyed `id\nversion\n
//! nonce`; the server takes each within the board's limits
//! (`collab_board::Board::admits`) and integrates it (`collab::take`), and
//! reads the elements as Excalidraw's reconciliation would
//! (`collab_board::elements`: the higher version, on a tie the lower
//! nonce). A window also hands the room the file its converter made, with
//! the state vector it made it at (`collab_canvas`, `Board::keep`), and
//! the room says what it wrote (`Board::written`).
//!
//! The input is records (`records.rs`): 0, the board's file the room is
//! made of; 1, a window's file; 2, the state vector it was made at; 3 on,
//! the windows' updates. A crash means a window's bytes panic or hang the
//! room, or that a window that joins, or one that got the same edits in
//! the other order, reads other elements than the room — the merge's one
//! promise — or that a file made of the room's own state is not the one it
//! writes. Seeds in `../seeds-board/`: `two-windows.bin`, written by
//! `examples/seeds.rs` from two windows' real edits; and two inputs this
//! target found on 2026-10-13, open until the maintainer decides:
//! `client-of-no-runs.bin`, the note's finding in a board's room
//! (`collab.rs`'s test `a_client_of_no_runs_does_not_break_a_board_room`
//! fails on it); `divide-by-zero.bin`, updates on which `yrs` divides by
//! zero as it integrates them (`block_store.rs:60`, a release build too;
//! test `updates_that_divide_by_zero_do_not_break_a_board_room`);
//! `state-that-does-not-apply.bin`, updates after which the room's state,
//! as `join` sends it, does not apply in a window (`transaction.rs:390`;
//! test `a_board_rooms_state_applies_in_a_window`); and
//! `state-vector-count-bomb.bin`, a window's state
//! vector (`collab_canvas`) that declares 243 million entries in four
//! bytes, for which `StateVector::decode_v1` asks the allocator for 9 GB.
//! Run:
//! `cargo +nightly fuzz run board fuzz/corpus/board fuzz/seeds-board`.

#![no_main]

#[path = "records.rs"]
mod records;

use libfuzzer_sys::fuzz_target;
use records::{record, records};
use verso_server::collab_board::{edits, elements, state_vector};
use verso_server::fuzz_api::BoardRoom;
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};

/// The room's Yjs client and a window's: fixed, so that a run replays.
const ROOM: u64 = 1;
const WINDOW: u64 = 2;

fn joined(room: &Doc) -> Doc {
    let state = room
        .transact()
        .encode_state_as_update_v1(&StateVector::default());
    let doc = Doc::with_client_id(WINDOW);
    let update = Update::decode_v1(&state).expect("the room's state decodes");
    doc.transact_mut()
        .apply_update(update)
        .expect("the room's state applies");
    doc
}

fuzz_target!(|data: &[u8]| {
    let records = records(data);
    let base = String::from_utf8_lossy(record(&records, 0));
    let mut room = BoardRoom::open(&base, ROOM);
    let mut taken = Vec::new();
    for update in records.iter().skip(3) {
        if room.update(update).is_ok() {
            taken.push(*update);
        }
    }
    let merged = elements(&room.doc);
    let _ = edits(&room.doc);
    let _ = room.board.waiting(&room.doc);
    assert_eq!(
        elements(&joined(&room.doc)),
        merged,
        "a window joins the room's board"
    );
    // The same edits in the other order: the same board.
    let mut other = BoardRoom::open(&base, ROOM);
    if taken.iter().rev().all(|u| other.update(u).is_ok()) {
        assert_eq!(
            elements(&other.doc),
            merged,
            "the order of the edits does not matter"
        );
    }
    // A window's file: kept at the state it says; one of the room's own
    // state is the one it writes.
    let json = String::from_utf8_lossy(record(&records, 1)).into_owned();
    let _ = room.board.keep(record(&records, 2), json.clone());
    let _ = room.board.canvas_now(&room.doc);
    if room
        .board
        .keep(&state_vector(&room.doc), json.clone())
        .is_ok()
    {
        assert_eq!(room.board.canvas_now(&room.doc), Some(json));
    }
    let window = joined(&room.doc);
    let written = room.board.written(&room.doc);
    assert!(!room.board.waiting(&room.doc), "written, nothing waits");
    window
        .transact_mut()
        .apply_update(Update::decode_v1(&written).expect("what is written decodes"))
        .expect("what is written applies");
    assert_eq!(elements(&window), merged);
});
