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
    let state = match collab::state(&doc, kind) {
        Ok(state) => state,
        Err(e) => {
            assert_eq!(e.message, collab::BROKEN);
            collab::state(&fresh(), kind).expect("a room made from its file has a state")
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

/// `fuzz/seeds-note/client-past-53-bits.bin`: an update naming a Yjs client
/// past 53 bits, which a window's JavaScript cannot have made. `yrs`
/// asserts it as it decodes the update (`block.rs:92`, a debug build:
/// the tests, the fuzz targets); the assertion is caught as the decoding
/// is, and the update refused.
#[test]
fn a_client_past_53_bits_is_refused_not_a_panic() {
    assert!(decode(&no_runs_of(1 << 60)).is_err());
    let input = include_bytes!("../fuzz/seeds-note/client-past-53-bits.bin");
    let records = records(input);
    let text = String::from_utf8_lossy(records.first().copied().unwrap_or_default()).into_owned();
    let doc = holding(new_doc(), &text);
    served(Kind::Note, &text, doc, &records[3.min(records.len())..]);
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

/// `fuzz/seeds-board/divide-by-zero.bin`: updates on which `yrs` divided
/// by zero as it integrated them (`block_store.rs:60`). Its run of length
/// 0 is now refused before `yrs` reads it; the room takes the rest.
#[test]
fn updates_that_divide_by_zero_do_not_break_a_board_room() {
    let input = include_bytes!("../fuzz/seeds-board/divide-by-zero.bin");
    let refused = records(input)[3..]
        .iter()
        .any(|u| collab::readable(u).is_err());
    assert!(refused);
    board_replayed(input);
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

/// An update whose kind of value nests `depth` arrays: one client, one
/// run of `Any` content in the root type `x`.
fn nested(depth: usize) -> Vec<u8> {
    let mut u = vec![1, 1, 5, 0, 8, 1, 1, b'x', 1];
    for _ in 0..depth {
        u.extend([117, 1]);
    }
    u.extend([126, 0]);
    u
}

/// Found while fixing the fuzzers' allocations: `yrs` reads a value by
/// recursion with no bound, and a 200 KB update of arrays in arrays
/// overflowed the stack, which ends the whole server, not the request.
#[test]
fn a_value_nested_past_the_bound_is_refused() {
    let e = decode(&nested(100_000)).expect_err("refused");
    assert_eq!(e.message, "an update the room cannot read");
    assert!(decode(&nested(8)).is_ok());
}

/// Counts past the first: a client's runs (the fuzz targets' own inputs,
/// `seeds-note/runs-count-bomb.bin` and `seeds-board/runs-count-bomb.bin`),
/// a run's values, a map's entries, the deletions' clients and ranges.
#[test]
fn every_count_yrs_reserves_from_is_bounded_by_the_bytes_left() {
    let bombs: [&[u8]; 2] = [
        include_bytes!("../fuzz/seeds-note/runs-count-bomb.bin"),
        include_bytes!("../fuzz/seeds-board/runs-count-bomb.bin"),
    ];
    for input in bombs {
        let refused = records(input)
            .iter()
            .skip(3)
            .any(|u| collab::readable(u).is_err());
        assert!(refused, "{input:?}");
    }
    let by_hand: [&[u8]; 5] = [
        // One client declaring 2^28 runs.
        &[1, 0xff, 0xff, 0xff, 0x7f, 5, 0],
        // One run of Any content declaring 2^28 values.
        &[1, 1, 5, 0, 8, 1, 1, b'x', 0xff, 0xff, 0xff, 0x7f],
        // One value, a map declaring 2^28 entries.
        &[1, 1, 5, 0, 8, 1, 1, b'x', 1, 118, 0xff, 0xff, 0xff, 0x7f],
        // No runs; deletions of 2^28 clients.
        &[0, 0xff, 0xff, 0xff, 0x7f],
        // No runs; one client's deletions in 2^28 ranges.
        &[0, 1, 5, 0xff, 0xff, 0xff, 0x7f],
    ];
    for update in by_hand {
        let e = collab::readable(update).expect_err("refused");
        assert_eq!(e.message, "an update the room cannot read", "{update:?}");
    }
}

/// What windows send is walked to its last byte and taken: every kind of
/// content `yrs` makes, and the fuzz targets' real seeds.
#[test]
fn the_walk_reads_real_updates_to_their_end() {
    use yrs::{Any, Array, Map, ReadTxn, Text, WriteTxn, XmlFragment};
    let doc = Doc::new();
    let mut updates = Vec::new();
    {
        let text = doc.get_or_insert_text("verso");
        let rich = doc.get_or_insert_text("rich");
        let mut txn = doc.transact_mut();
        text.insert(&mut txn, 0, "olá 😀 mundo");
        text.remove_range(&mut txn, 2, 3);
        rich.insert(&mut txn, 0, "negrito");
        rich.format(&mut txn, 0, 3, [("bold".into(), Any::Bool(true))].into());
        rich.insert_embed(&mut txn, 7, Any::from(vec![Any::from(1.5), Any::Null]));
        updates.push(txn.encode_update_v1());
    }
    {
        let map = doc.get_or_insert_map("meta");
        let array = doc.get_or_insert_array("list");
        let mut txn = doc.transact_mut();
        map.insert(&mut txn, "n", 7);
        map.insert(&mut txn, "big", i64::MAX);
        map.insert(&mut txn, "s", "texto");
        map.insert(&mut txn, "buf", Any::Buffer(vec![1_u8, 2, 3].into()));
        map.insert(
            &mut txn,
            "nested",
            Any::from(std::collections::HashMap::from([(
                "a".to_owned(),
                Any::from(vec![Any::from(true), Any::from(-3)]),
            )])),
        );
        array.insert(&mut txn, 0, 1.25);
        let sub = yrs::Doc::new();
        map.insert(&mut txn, "doc", sub);
        let frag = txn.get_or_insert_xml_fragment("xml");
        frag.insert(&mut txn, 0, yrs::XmlElementPrelim::empty("p"));
        map.remove(&mut txn, "s");
        updates.push(txn.encode_update_v1());
    }
    updates.push(
        doc.transact()
            .encode_state_as_update_v1(&yrs::StateVector::default()),
    );
    let seeds: [&[u8]; 3] = [
        include_bytes!("../fuzz/seeds-note/two-windows-crlf.bin"),
        include_bytes!("../fuzz/seeds-note/out-of-order.bin"),
        include_bytes!("../fuzz/seeds-board/two-windows.bin"),
    ];
    for input in seeds {
        updates.extend(records(input).iter().skip(3).map(|u| u.to_vec()));
    }
    for update in &updates {
        assert!(Update::decode_v1(update).is_ok());
        assert_eq!(
            crate::yjs_bounds::update(update),
            Ok(update.len()),
            "{update:?}"
        );
    }
    let sv = doc.transact().state_vector();
    let sv = yrs::updates::encoder::Encode::encode_v1(&sv);
    assert_eq!(crate::yjs_bounds::state_vector(&sv), Ok(sv.len()));
}

/// A room of `text` whose Yjs client is 1, as the fuzz target `note`'s.
fn note_room(text: &str) -> Doc {
    let options = collab::utf16(yrs::Options::with_client_id(yrs::ClientID::new(1)));
    holding(Doc::with_options(options), text)
}

/// Taken in as `update` takes it: `Ok` when the room took it.
fn taken(doc: &Doc, update: &[u8]) -> Result<(), String> {
    let decoded = decode(update).map_err(|e| e.message)?;
    let mut board = collab_board::Board::default();
    take(Kind::Note, doc, &mut board, update, decoded).map_err(|e| e.message)
}

/// A window that joined `room`, its Yjs client `client`.
fn window_of(room: &Doc, client: u64) -> Doc {
    let options = collab::utf16(yrs::Options::with_client_id(yrs::ClientID::new(client)));
    let window = Doc::with_options(options);
    window
        .transact_mut()
        .apply_update(Update::decode_v1(&collab::state(room, Kind::Note).unwrap()).unwrap())
        .unwrap();
    window
}

/// Finding 5 of the fuzzing (`seeds-note/outside-after-a-delete-past-the-end.bin`):
/// a window deleted the room's own client past its last clock; `yrs` kept
/// the deletion and cut the room's next text with it. No window can have
/// seen an item of the room's own the room has not made: refused, and a
/// change from outside then reads whole in the room and in a window.
#[test]
fn a_deletion_of_the_rooms_items_ahead_of_it_is_refused() {
    let file = "# Nota\n\nolá 😀 mundo\n";
    let room = note_room(file);
    // Client 1's clocks 3..35; the room has made 21.
    let e = taken(&room, &[0, 1, 1, 1, 3, 0x20]).expect_err("refused");
    assert_eq!(e, "an update the room cannot read");
    let outside = "# Nota\n\nolá 😀 mundo de fora\n";
    collab::apply_text(&room, outside);
    let window = window_of(&room, 2);
    let text = |d: &Doc| {
        use yrs::GetString;
        d.get_or_insert_text(collab::TEXT).get_string(&d.transact())
    };
    assert_eq!(text(&room), outside);
    assert_eq!(text(&window), outside);
    // The seed itself: its deleting update is refused.
    let input = include_bytes!("../fuzz/seeds-note/outside-after-a-delete-past-the-end.bin");
    let records = records(input);
    let room = note_room(&String::from_utf8_lossy(records[0]).replace("\r\n", "\n"));
    let refused: Vec<String> = records[3..]
        .iter()
        .filter_map(|u| taken(&room, u).err())
        .collect();
    assert!(
        refused
            .iter()
            .any(|e| e == "an update the room cannot read"),
        "{refused:?}"
    );
}

/// What windows send stays taken: a deletion of what the same update
/// makes, a deletion of the room's own text, and a window's deletion of
/// another window's item, which it heard from the room, so after the room
/// took it. The same deletion ahead of the insert — which no window sends,
/// since a connection's updates reach the room in order — is refused.
#[test]
fn deletions_a_window_can_make_are_taken() {
    use yrs::{GetString, Text};
    let room = note_room("# Nota\n");
    let one = window_of(&room, 2);
    let text = one.get_or_insert_text(collab::TEXT);
    // Made and deleted in one update.
    let own = {
        let mut txn = one.transact_mut();
        text.insert(&mut txn, 7, "abc");
        text.remove_range(&mut txn, 8, 1);
        txn.encode_update_v1()
    };
    assert_eq!(taken(&room, &own), Ok(()));
    // The room's own text deleted.
    let rooms = {
        let mut txn = one.transact_mut();
        text.remove_range(&mut txn, 0, 2);
        txn.encode_update_v1()
    };
    assert_eq!(taken(&room, &rooms), Ok(()));
    // Window two's insert and window one's deletion of it.
    let two = window_of(&room, 3);
    let text_two = two.get_or_insert_text(collab::TEXT);
    let inserted = {
        let mut txn = two.transact_mut();
        text_two.insert(&mut txn, 0, "xyz");
        txn.encode_update_v1()
    };
    one.transact_mut()
        .apply_update(Update::decode_v1(&inserted).unwrap())
        .unwrap();
    let deleted = {
        let mut txn = one.transact_mut();
        text.remove_range(&mut txn, 0, 3);
        txn.encode_update_v1()
    };
    let ahead = note_room("# Nota\n");
    assert_eq!(taken(&ahead, &own), Ok(()));
    assert_eq!(taken(&ahead, &rooms), Ok(()));
    assert_eq!(
        taken(&ahead, &deleted),
        Err(collab::BROKEN.to_owned()),
        "a deletion ahead of the insert"
    );
    assert_eq!(taken(&room, &inserted), Ok(()));
    assert_eq!(taken(&room, &deleted), Ok(()));
    let room_text = room
        .get_or_insert_text(collab::TEXT)
        .get_string(&room.transact());
    assert_eq!(room_text, text.get_string(&one.transact()));
}

/// A board room through a fuzz input of the target `board` as the server
/// keeps it, its Yjs client 1: the updates taken in, a window joining
/// with the state the room sends, the window's file kept, another window
/// joining, and the room writing — the windows taking what the room says
/// it wrote. When the room says BROKEN it is made again from its file, as
/// `reload` has the windows do, and they join again.
fn board_through(input: &[u8]) {
    let records = records(input);
    let base = String::from_utf8_lossy(records[0]).into_owned();
    let fresh = || collab_board::based(Doc::with_client_id(1), &base);
    let mut doc = fresh();
    let mut board = collab_board::Board::of(&doc);
    for update in records.get(3..).unwrap_or_default() {
        if let Ok(decoded) = decode(update)
            && take(Kind::Board, &doc, &mut board, update, decoded)
                .is_err_and(|e| e.message == collab::BROKEN)
        {
            doc = fresh();
            board = collab_board::Board::of(&doc);
        }
    }
    let join = |doc: &mut Doc, board: &mut collab_board::Board| {
        let state = collab::state(doc, Kind::Board).unwrap_or_else(|_| {
            *doc = fresh();
            *board = collab_board::Board::of(doc);
            collab::state(doc, Kind::Board).expect("a room made of its file has a state")
        });
        let window = Doc::with_client_id(2);
        window
            .transact_mut()
            .apply_update(Update::decode_v1(&state).expect("the room's state decodes"))
            .expect("the room's state applies in a window");
        window
    };
    join(&mut doc, &mut board);
    let json = String::from_utf8_lossy(records.get(1).copied().unwrap_or_default()).into_owned();
    let _ = board.keep(records.get(2).copied().unwrap_or_default(), json.clone());
    let _ = board.keep(&collab_board::state_vector(&doc), json);
    let window = join(&mut doc, &mut board);
    if let Ok(written) = collab::written(&doc, &mut board) {
        window
            .transact_mut()
            .apply_update(Update::decode_v1(&written).expect("what is written decodes"))
            .expect("what is written applies in a window");
    }
}

/// Found by the fuzz target `board` under `-O`: rooms whose state, or
/// whose word of what they wrote, a window could not read or apply
/// (`EndOfBuffer`, `InvalidParent`). The room now checks both before it
/// sends them, and is made again from its file when they fail.
#[test]
fn every_window_gets_a_state_and_a_write_it_can_apply() {
    for input in [
        &include_bytes!("../fuzz/seeds-board/state-that-does-not-decode.bin")[..],
        include_bytes!("../fuzz/seeds-board/written-with-an-invalid-parent-1.bin"),
        include_bytes!("../fuzz/seeds-board/written-with-an-invalid-parent-2.bin"),
    ] {
        board_through(input);
    }
}

/// Found by the fuzz targets under `-O` once the panics were caught: a
/// run of deleted clocks of length 0 left a run whose last clock wrapped
/// to 0, and `yrs` divided by zero — in the update, and again in the
/// transaction's drop as the first panic unwound. Two panics end the
/// process, past any catch: the whole server. Refused before `yrs` reads
/// them, with runs and deletions that pass `u32::MAX`.
#[test]
fn runs_of_no_length_or_past_the_last_clock_are_refused() {
    for input in [
        &include_bytes!("../fuzz/seeds-note/run-wrapping-to-zero.bin")[..],
        include_bytes!("../fuzz/seeds-board/run-wrapping-to-zero.bin"),
    ] {
        let room = note_room("# Nota\n");
        for update in records(input).get(3..).unwrap_or_default() {
            let _ = taken(&room, update);
        }
    }
    let by_hand: [&[u8]; 4] = [
        // A GC run of length 0, and a skipped one.
        &[1, 1, 5, 1, 0, 0, 0],
        &[1, 1, 5, 1, 10, 0, 0],
        // A deletion of length 0.
        &[0, 1, 5, 1, 3, 0],
        // A GC run from clock 2^32 - 2, of length 4.
        &[1, 1, 5, 0xfe, 0xff, 0xff, 0xff, 0x0f, 0, 4, 0],
    ];
    for update in by_hand {
        let e = collab::readable(update).expect_err("refused");
        assert_eq!(e.message, "an update the room cannot read", "{update:?}");
    }
}

/// Found by the fuzz target `board` under `-O` on 2026-10-14
/// (`seeds-board/a-client-named-twice.bin`): an update that names one Yjs
/// client in two of its sections, each from the same clock. `yrs` 0.28
/// reads both into one list out of clock order, frees an item the room's
/// board still points to as it integrates them, and the board read next
/// reads freed memory (AddressSanitizer's heap-use-after-free; a release
/// build reads it silently). Yjs writes each client once, and its own
/// reader keeps only a client's last section, so no window sends one and
/// a window would read it otherwise than the room: refused before `yrs`
/// reads it.
#[test]
fn an_update_that_names_a_client_twice_is_refused() {
    let input = include_bytes!("../fuzz/seeds-board/a-client-named-twice.bin");
    let twice = records(input)[6];
    let e = collab::readable(twice).expect_err("refused");
    assert_eq!(e.message, "an update the room cannot read");
    // By hand: client 5 twice, a GC run of one clock in each, the second
    // after the first.
    let e = collab::readable(&[2, 1, 5, 0, 0, 1, 1, 5, 1, 0, 1, 0]).expect_err("refused");
    assert_eq!(e.message, "an update the room cannot read");
    // Two clients, once each: read.
    assert!(collab::readable(&[2, 1, 5, 0, 0, 1, 1, 6, 0, 0, 1, 0]).is_ok());
    board_elements_through(input);
}

/// Found by the fuzz target `note` under `-O`
/// (`seeds-note/room-client-forged.bin`): a window's update made an item
/// as the room's own Yjs client, ahead of the room; the room's next own
/// edit took the same clock, and a window that joined read another text
/// than the room. No window makes the room's items: refused. A window's
/// whole state sent back on its return holds the room's items the room
/// has made, and is taken.
#[test]
fn an_item_of_the_rooms_own_client_ahead_of_it_is_refused() {
    let input = include_bytes!("../fuzz/seeds-note/room-client-forged.bin");
    let records = records(input);
    let room = note_room(&String::from_utf8_lossy(records[0]));
    let refused: Vec<String> = records[3..]
        .iter()
        .filter_map(|u| taken(&room, u).err())
        .collect();
    assert!(
        refused
            .iter()
            .any(|e| e == "an update the room cannot read"),
        "{refused:?}"
    );
    // The room's text and a window's again the same after its own edit.
    let room = note_room("# Nota\n");
    let window = window_of(&room, 2);
    let whole =
        yrs::ReadTxn::encode_state_as_update_v1(&window.transact(), &yrs::StateVector::default());
    assert_eq!(taken(&room, &whole), Ok(()));
}

/// Found by the fuzz target `note` under `-O` on 2026-10-31
/// (`seeds-note/a-run-past-the-clients-clock.bin`): a window's run of a
/// client the room held nothing of, starting at clock 4; `yrs` 0.28 took it
/// in instead of keeping it aside, and a second update from clock 0 over
/// it made `yrs` splice a run it had freed (AddressSanitizer's
/// heap-use-after-free). A connection's updates reach the room in order,
/// so no window's run starts past what the room holds of its client:
/// refused before `yrs` reads it. The same run from where the room's
/// knowledge ends is taken.
#[test]
fn a_run_past_what_the_room_holds_of_its_client_is_refused() {
    let input = include_bytes!("../fuzz/seeds-note/a-run-past-the-clients-clock.bin");
    let records = records(input);
    let room = note_room(&String::from_utf8_lossy(records[0]));
    assert_eq!(
        taken(&room, records[3]),
        Err("an update the room cannot read".to_owned())
    );
    note_through(input);
    // A window's two edits, the second alone: past the room's clock of
    // that window until the first is in.
    let room = note_room("# Nota\n");
    let window = window_of(&room, 7);
    let text = window.get_or_insert_text(collab::TEXT);
    let first = {
        let mut txn = window.transact_mut();
        yrs::Text::insert(&text, &mut txn, 0, "a");
        txn.encode_update_v1()
    };
    let second = {
        let mut txn = window.transact_mut();
        yrs::Text::insert(&text, &mut txn, 1, "b");
        txn.encode_update_v1()
    };
    assert_eq!(
        taken(&room, &second),
        Err("an update the room cannot read".to_owned())
    );
    assert_eq!(taken(&room, &first), Ok(()));
    assert_eq!(taken(&room, &second), Ok(()));
    assert_eq!(room_text(&room), "ab# Nota\n");
}

fn room_text(room: &Doc) -> String {
    use yrs::GetString;
    room.get_or_insert_text(collab::TEXT)
        .get_string(&room.transact())
}

/// A window that joins `room` as `join` lets it: the room's state, or —
/// when the state would not read in a window as in the room — the room
/// made again from `file` first. Whether the room was made again.
fn join_note(room: &mut Doc, file: &str) -> bool {
    use yrs::GetString;
    let (state, again) = match collab::state(room, Kind::Note) {
        Ok(state) => (state, false),
        Err(e) => {
            assert_eq!(e.message, collab::BROKEN);
            *room = note_room(file);
            (collab::state(room, Kind::Note).unwrap(), true)
        }
    };
    let window = Doc::new();
    window
        .transact_mut()
        .apply_update(Update::decode_v1(&state).unwrap())
        .unwrap();
    let text = window.get_or_insert_text(collab::TEXT);
    assert_eq!(text.get_string(&window.transact()), room_text(room));
    again
}

/// A note room through a fuzz input of the target `note` as the server
/// keeps it: the updates (the room made again from its file when one is
/// BROKEN), a window joining after each, a write from elsewhere merged, a
/// change from outside; every window that joins reads the room's text.
fn note_through(input: &[u8]) {
    let records = records(input);
    let text = |i: usize| {
        String::from_utf8_lossy(records.get(i).copied().unwrap_or_default()).into_owned()
    };
    let Some((file, _)) = collab::normalized(&text(0)) else {
        return;
    };
    let mut room = note_room(&file);
    for update in records.get(3..).unwrap_or_default() {
        if taken(&room, update).is_err_and(|e| e == collab::BROKEN) {
            room = note_room(&file);
        }
        join_note(&mut room, &file);
    }
    if collab::merge_into(&room, &file, &text(2)).is_ok() {
        join_note(&mut room, &file);
    }
    if let Some((outside, _)) = collab::normalized(&text(1)) {
        collab::apply_text(&room, &outside);
        assert_eq!(room_text(&room), outside);
        join_note(&mut room, &file);
    }
}

/// A board room through a fuzz input of the target `board`: a window that
/// joins, and a room that took the same updates in the other order, hold
/// the room's elements.
fn board_elements_through(input: &[u8]) {
    let records = records(input);
    let base = String::from_utf8_lossy(records[0]).into_owned();
    let fresh = || collab_board::based(Doc::with_client_id(1), &base);
    let (mut doc, mut taken_in) = (fresh(), Vec::new());
    let mut board = collab_board::Board::of(&doc);
    for update in records.get(3..).unwrap_or_default() {
        let Ok(decoded) = decode(update) else {
            continue;
        };
        match take(Kind::Board, &doc, &mut board, update, decoded) {
            Ok(()) => taken_in.push(*update),
            Err(e) if e.message == collab::BROKEN => {
                doc = fresh();
                board = collab_board::Board::of(&doc);
                taken_in.clear();
            }
            Err(_) => {}
        }
    }
    let state = collab::state(&doc, Kind::Board).unwrap_or_else(|e| {
        assert_eq!(e.message, collab::BROKEN);
        doc = fresh();
        taken_in.clear();
        collab::state(&doc, Kind::Board).unwrap()
    });
    let elements = collab_board::elements(&doc);
    let window = Doc::with_client_id(2);
    window
        .transact_mut()
        .apply_update(Update::decode_v1(&state).unwrap())
        .unwrap();
    assert_eq!(collab_board::elements(&window), elements);
    let other = fresh();
    let mut other_board = collab_board::Board::of(&other);
    let all = taken_in.iter().rev().all(|u| {
        decode(u).is_ok_and(|d| take(Kind::Board, &other, &mut other_board, u, d).is_ok())
    });
    if all {
        assert_eq!(collab_board::elements(&other), elements);
    }
}

/// What the fuzz targets found once the panics were caught, kept open
/// until the room took a connection's updates in order (ADR 0083 item
/// 14): `yrs` 0.28 read a run it had freed (AddressSanitizer), and rooms
/// and windows read different texts and elements — all on the path where
/// `yrs` keeps an update aside. The room now never keeps one aside: it is
/// refused and the room made again, and every window reads the room.
#[test]
fn what_yrs_kept_aside_no_longer_reaches_a_room() {
    for input in [
        &include_bytes!("../fuzz/seeds-note/use-after-free.bin")[..],
        include_bytes!("../fuzz/seeds-note/window-reads-other-text.bin"),
        include_bytes!("../fuzz/seeds-note/window-reads-other-text-after-a-write.bin"),
    ] {
        note_through(input);
    }
    for input in [
        &include_bytes!("../fuzz/seeds-board/use-after-free.bin")[..],
        include_bytes!("../fuzz/seeds-board/window-reads-other-elements.bin"),
        include_bytes!("../fuzz/seeds-board/order-matters.bin"),
    ] {
        board_elements_through(input);
    }
}

/// Found by the fuzz target `board` once the order held
/// (`seeds-board/half-applied.bin`): `yrs` stopped applying an update
/// halfway ("block parent … must be deleted or shared ref type") and left
/// the room's board without an element a window had made; the same
/// updates taken otherwise kept it. A room `yrs` stopped in is made again.
#[test]
fn a_room_yrs_stopped_halfway_in_is_made_again() {
    board_elements_through(include_bytes!("../fuzz/seeds-board/half-applied.bin"));
}
