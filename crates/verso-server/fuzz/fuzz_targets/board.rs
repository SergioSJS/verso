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
//! `examples/seeds.rs` from two windows' real edits; and the inputs this
//! target found on 2026-10-13 (ADR 0083 item 14), on which `yrs` 0.28
//! panics in a release build too and the room now catches
//! (`collab::BROKEN`), made again from its file: `client-of-no-runs.bin`
//! (`update.rs:85`), `divide-by-zero.bin` (`block_store.rs:60`) and
//! `state-that-does-not-apply.bin` (the room's state, `transaction.rs:390`);
//! and `state-vector-count-bomb.bin`, a window's state vector
//! (`collab_canvas`) that declares 243 million entries in four bytes,
//! refused before `yrs` reads it (`Board::keep`). The tests are in
//! `tests_room_inputs.rs`.
//! Run:
//! `cargo +nightly fuzz run board fuzz/corpus/board fuzz/seeds-board`.

#![no_main]

#[path = "records.rs"]
mod records;

use libfuzzer_sys::fuzz_target;
use records::{record, records};
use verso_server::collab_board::{edits, elements, state_vector};
use verso_server::fuzz_api::{BROKEN, BoardRoom};
use yrs::updates::decoder::Decode;
use yrs::{Doc, Transact, Update};

/// The room's Yjs client and a window's: fixed, so that a run replays.
const ROOM: u64 = 1;
const WINDOW: u64 = 2;

/// A window that joins: a document made of the room's state.
fn joined(state: &[u8]) -> Doc {
    let doc = Doc::with_client_id(WINDOW);
    let update = Update::decode_v1(state).expect("the room's state decodes");
    doc.transact_mut()
        .apply_update(update)
        .expect("the room's state applies");
    doc
}

fuzz_target!(|data: &[u8]| {
    // The room catches a panic of `yrs` (`collab::caught`); libFuzzer's
    // hook would end the run on it even so. The default hook again: a
    // panic that escapes the room still ends the run, as a crash.
    static HOOK: std::sync::Once = std::sync::Once::new();
    HOOK.call_once(|| drop(std::panic::take_hook()));
    let records = records(data);
    let base = String::from_utf8_lossy(record(&records, 0));
    let mut room = BoardRoom::open(&base, ROOM);
    let mut taken = Vec::new();
    for update in records.iter().skip(3) {
        match room.update(update) {
            Ok(()) => taken.push(*update),
            // Made again from its file: what it took is gone.
            Err(e) if e == BROKEN => taken.clear(),
            Err(_) => {}
        }
    }
    let state = room.state();
    let merged = elements(&room.doc);
    let _ = edits(&room.doc);
    let _ = room.board.waiting(&room.doc);
    assert_eq!(
        elements(&joined(&state)),
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
    let window = joined(&room.state());
    let merged = elements(&room.doc);
    let Some(written) = room.written() else {
        return;
    };
    assert!(!room.board.waiting(&room.doc), "written, nothing waits");
    window
        .transact_mut()
        .apply_update(Update::decode_v1(&written).expect("what is written decodes"))
        .expect("what is written applies");
    assert_eq!(elements(&window), merged);
});
