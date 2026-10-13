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
