// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The room's own unit tests, kept beside it (ADR 0067: files stay small).

use super::*;

#[test]
fn a_minimal_edit_keeps_the_ends_and_counts_utf16() {
    assert_eq!(minimal_edit("abc", "abc"), None);
    assert_eq!(minimal_edit("abc", "aXc"), Some((1, 1, "X".to_owned())));
    assert_eq!(minimal_edit("a😀c", "a😀dc"), Some((3, 0, "d".to_owned())));
    assert_eq!(minimal_edit("😀", "😁"), Some((0, 2, "😁".to_owned())));
    let doc = new_doc();
    apply_text(&doc, "olá 😀 mundo");
    apply_text(&doc, "olá 😀 grande mundo");
    assert_eq!(text_of(&doc), "olá 😀 grande mundo");
}

/// One window's updates taken in the order it made them are all placed
/// and leave nothing aside; taken in a shuffled order, `integrate` says
/// when one was held aside (the room then refuses it and is made again;
/// a connection's updates now reach it in order, `rpc.rs`).
#[test]
fn a_windows_updates_in_order_are_placed_and_one_ahead_is_told() {
    let mut told = 0;
    for seed in 0..300_u64 {
        let mut s = seed.wrapping_mul(2_654_435_761) | 1;
        let mut rnd = || {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            s
        };
        let window = new_doc();
        let text = window.get_or_insert_text(TEXT);
        let mut updates = Vec::new();
        for i in 0..12_u32 {
            let mut txn = window.transact_mut();
            let len = text.len(&txn);
            let at = u32::try_from(rnd() % u64::from(len + 1)).unwrap();
            text.insert(&mut txn, at, &format!("<{i}>"));
            if len > 4 && rnd() % 3 == 0 {
                text.remove_range(&mut txn, 0, 2);
            }
            updates.push(txn.encode_update_v1());
        }
        let room = new_doc();
        for u in &updates {
            assert!(integrate(&room, Update::decode_v1(u).unwrap()).unwrap());
        }
        assert_eq!(text_of(&room), text_of(&window), "seed {seed}");
        for i in (1..updates.len()).rev() {
            let j = usize::try_from(rnd() % (i as u64 + 1)).unwrap();
            updates.swap(i, j);
        }
        let room = new_doc();
        let whole = updates
            .iter()
            .all(|u| integrate(&room, Update::decode_v1(u).unwrap()).unwrap());
        if !whole {
            told += 1;
            assert!(room.transact().has_missing_updates(), "seed {seed}");
        }
    }
    assert!(told > 0);
}

#[test]
fn line_ends_are_kept_and_mixed_ones_refused() {
    assert_eq!(normalized("a\r\nb\r\n"), Some(("a\nb\n".to_owned(), true)));
    assert_eq!(normalized("a\nb"), Some(("a\nb".to_owned(), false)));
    assert_eq!(normalized("a\r\nb\n"), None);
    assert_eq!(normalized("a\rb"), None);
    assert_eq!(on_disk("a\nb\n", true), "a\r\nb\r\n");
}

#[test]
fn a_window_and_the_server_converge() {
    let server = new_doc();
    apply_text(&server, "# Nota\n\num\n");
    let window = new_doc();
    let state = server
        .transact()
        .encode_state_as_update_v1(&StateVector::default());
    window
        .transact_mut()
        .apply_update(Update::decode_v1(&state).unwrap())
        .unwrap();
    assert_eq!(text_of(&window), "# Nota\n\num\n");
    // The window types; meanwhile the server merges a write from the
    // properties panel; each applies the other's update.
    let typed = {
        let t = window.get_or_insert_text(TEXT);
        let mut txn = window.transact_mut();
        t.insert(&mut txn, 11, "dois\n");
        txn.encode_update_v1()
    };
    let merged = diffy::merge(
        "# Nota\n\num\n",
        &text_of(&server),
        "---\ntag: x\n---\n# Nota\n\num\n",
    )
    .unwrap();
    let from_server = apply_text(&server, &merged).unwrap();
    server
        .transact_mut()
        .apply_update(Update::decode_v1(&typed).unwrap())
        .unwrap();
    window
        .transact_mut()
        .apply_update(Update::decode_v1(&from_server).unwrap())
        .unwrap();
    assert_eq!(text_of(&server), text_of(&window));
    assert_eq!(text_of(&server), "---\ntag: x\n---\n# Nota\n\num\ndois\n");
}
