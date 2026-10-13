// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: a Yjs update integrated into a note's room (ADR 0083 item
//! 14, F6). A window in a shared note sends its edits as Yjs updates
//! (`collab_update`), which the server decodes and integrates into the
//! room's document (`collab::update`, through `collab::take` and
//! `collab::integrate`) with nothing but the base64 and the message limit
//! before them; the room's text is then what every window shows and what
//! is written to the file. Fed here: the file's text the room is made of
//! (`collab::join`), the updates of windows, a write that reaches the note
//! from elsewhere (`collab::write_through`, merged line by line) and a
//! change of the file outside (`collab::changed_outside`, one edit of the
//! server's).
//!
//! The input is records (`records.rs`): 0, the file's text; 1, the file's
//! text changed outside; 2, the text a write from elsewhere brings; 3 on,
//! the windows' updates. A crash means a window's bytes panic or hang the
//! room — `yrs` or the server's own code — or that the room and a window
//! that joins it read different texts, or that a change from outside does
//! not leave the room holding exactly the file. Seeds in `../seeds-note/`:
//! `two-windows-crlf.bin` and `out-of-order.bin`, written by
//! `examples/seeds.rs` from real edits of windows; and three inputs this
//! target found on 2026-10-13, open until the maintainer decides (the
//! report of ADR 0083 item 14): `client-of-no-runs.bin`, an update naming
//! the room's own Yjs client with no runs, on which `yrs` 0.28 unwraps
//! nothing as it applies it (`update.rs:85`, a release build too);
//! `gc-of-no-length.bin`, a deleted run of length 0, after which `yrs`
//! subtracts past zero making the room's state (`block.rs:252`, a debug
//! build; a release one wraps); `clients-count-bomb.bin`, four bytes that
//! declare 2^28 clients, for which `yrs` asks the allocator for 22 GB
//! before it reads one (`try_reserve`: refused, not a crash, where the
//! allocator refuses; libFuzzer stops at 2 GB). `collab.rs`'s tests
//! `a_client_of_no_runs_does_not_break_a_note_room` and
//! `a_run_of_no_length_does_not_break_a_note_room` fail on the first two.
//! And `outside-after-a-delete-past-the-end.bin`: a window deletes the
//! room's own client past its last clock, and the change from outside the
//! server then puts in loses a run of its text (`"# Nndo de fora\n"` for
//! the file's `"# Nota\n\nolá 😀 mundo de fora\n"`) — in this harness's
//! build only: the same steps in a plain build give the file's text, so no
//! unit test fails on it yet.
//! Run: `cargo +nightly fuzz run note fuzz/corpus/note fuzz/seeds-note`.

#![no_main]

#[path = "records.rs"]
mod records;

use libfuzzer_sys::fuzz_target;
use records::{record, records};
use verso_server::fuzz_api::NoteRoom;
use yrs::updates::decoder::Decode;
use yrs::{ClientID, Doc, GetString, OffsetKind, Options, Transact, Update};

/// The room's Yjs client and a window's: fixed, so that a run replays.
const ROOM: u64 = 1;
const WINDOW: u64 = 2;

/// What a window that joins shows: a document made of the room's state.
fn joined(state: &[u8]) -> String {
    let doc = Doc::with_options(Options {
        offset_kind: OffsetKind::Utf16,
        ..Options::with_client_id(ClientID::new(WINDOW))
    });
    let text = doc.get_or_insert_text(verso_server::collab::TEXT);
    let update = Update::decode_v1(state).expect("the room's state decodes");
    doc.transact_mut()
        .apply_update(update)
        .expect("the room's state applies");
    text.get_string(&doc.transact())
}

fuzz_target!(|data: &[u8]| {
    let records = records(data);
    let text = |i| String::from_utf8_lossy(record(&records, i)).into_owned();
    let Some(mut room) = NoteRoom::open(&text(0), ROOM) else {
        return;
    };
    for update in records.iter().skip(3) {
        let _ = room.update(update);
        let _ = room.waiting();
        let _ = room.on_disk();
    }
    assert_eq!(
        joined(&room.state()),
        room.text(),
        "a window joins the room's text"
    );
    if let Ok(Some(_)) = room.write_through(&text(2)) {
        assert_eq!(joined(&room.state()), room.text());
    }
    let outside = text(1);
    if room.outside(&outside).is_some() {
        assert_eq!(
            room.text(),
            outside.replace("\r\n", "\n"),
            "the room holds the file"
        );
        assert!(!room.waiting());
        assert_eq!(joined(&room.state()), room.text());
    }
});
