// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: a presence update through the awareness reader (ADR 0083
//! item 14, F6). Any member in a shared note — a reader too — sends its
//! cursor and its name as a y-protocols awareness update
//! (`collab_awareness`); the server reads it with its own decoder
//! (`presence::stamped`, called by `collab::awareness`), stamps each state
//! with the sender's account name and a colour that is only a colour, and
//! drops the clients another account speaks for (threat-model.md, gap 11).
//!
//! The input is records (`records.rs`), each a presence: its first byte
//! picks who sends it — two connections of Ana's, one of Bia's, all in the
//! room — the rest is the update. A crash means a peer's bytes panic the
//! reader, or that what the server relays is not a presence, wears a name
//! that is not the sender's or a colour that is not one, speaks for a
//! client another account holds, lets a connection speak for more than
//! `CLIENTS_MOST` clients, or drops a client when relayed again. The
//! relayed bytes are read here by a decoder of the target's own, not the
//! server's. Seeds in `../seeds-presence/`. Run:
//! `cargo +nightly fuzz run presence fuzz/corpus/presence fuzz/seeds-presence`.

#![no_main]

#[path = "records.rs"]
#[allow(dead_code)]
mod records;

use std::collections::HashSet;

use libfuzzer_sys::fuzz_target;
use records::records;
use serde_json::Value;
use verso_server::presence::{CLIENTS_MOST, Claims, Sender, stamped};

const SENDERS: [Sender<'static>; 3] = [
    Sender {
        client: "c-ana",
        account: "ana",
        name: "Ana",
    },
    Sender {
        client: "c-ana-2",
        account: "ana",
        name: "Ana",
    },
    Sender {
        client: "c-bia",
        account: "bia",
        name: "Bia \"B\" 😀",
    },
];

/// lib0's variable-length unsigned integer, as y-protocols writes it.
fn var(bytes: &[u8], at: &mut usize) -> u64 {
    let mut n = 0_u64;
    for shift in (0..64).step_by(7) {
        let b = bytes[*at];
        *at += 1;
        n |= u64::from(b & 0x7f) << shift;
        if b & 0x80 == 0 {
            return n;
        }
    }
    panic!("a number past 64 bits in what the server relays");
}

/// The (client, state) entries of a relayed update.
fn entries(bytes: &[u8]) -> Vec<(u64, String)> {
    let mut at = 0;
    let count = var(bytes, &mut at);
    let mut out = Vec::new();
    for _ in 0..count {
        let id = var(bytes, &mut at);
        let _clock = var(bytes, &mut at);
        let len = usize::try_from(var(bytes, &mut at)).expect("a length");
        let state = std::str::from_utf8(&bytes[at..at + len]).expect("a state is text");
        at += len;
        out.push((id, state.to_owned()));
    }
    assert_eq!(at, bytes.len(), "nothing after the entries");
    out
}

fn is_colour(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].bytes().all(|b| b.is_ascii_hexdigit())
}

fuzz_target!(|data: &[u8]| {
    let room: HashSet<String> = SENDERS.iter().map(|s| s.client.to_owned()).collect();
    let mut claims = Claims::new();
    for record in records(data) {
        let Some((pick, bytes)) = record.split_first() else {
            continue;
        };
        let who = &SENDERS[usize::from(*pick) % SENDERS.len()];
        let Ok(out) = stamped(bytes, who, &mut claims, &room) else {
            continue;
        };
        for (id, state) in entries(&out) {
            let (account, _) = claims.get(&id).expect("a client relayed is claimed");
            assert_eq!(account, who.account, "only the sender's own clients");
            if state == "null" {
                continue;
            }
            let v: Value = serde_json::from_str(&state).expect("a state is JSON");
            let user = &v["user"];
            assert_eq!(user["name"], who.name, "the sender's name");
            let colour = user["color"].as_str().expect("a colour");
            assert!(is_colour(colour), "{colour:?}");
            assert_eq!(user["colorLight"], format!("{colour}33"));
        }
        let held = claims.values().filter(|(_, c)| c == who.client).count();
        assert!(held <= CLIENTS_MOST, "{held} clients for one connection");
        // Relayed again by the same sender, it is the same clients (the
        // states' floats are read at best effort by `serde_json`, so the
        // states are not compared byte for byte).
        let mut again = claims.clone();
        let twice = stamped(&out, who, &mut again, &room).expect("a relayed presence reads");
        let ids = |b: &[u8]| entries(b).into_iter().map(|(id, _)| id).collect::<Vec<_>>();
        assert_eq!(ids(&twice), ids(&out));
    }
});
