// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Fuzz target: what anyone with no account may send a read link (ADR 0105,
//! ADR 0083 item 14). Three things come from a stranger as plain text: the
//! token in the address `/r/<token>/…` — shaped before the database is
//! asked —, the name of a command on the link's WebSocket, and the address
//! itself, which the pace and the headers sort into a link's page, a link's
//! route or a link's file. The input is read as each.
//!
//! A crash means a token of any shape panics the check, that a token that
//! passes is longer than a token or holds a character the address could use
//! to leave its segment, that a visitor may call a command that writes, or
//! that an address is taken for a file under a link without being under
//! one. Seeds in `../seeds-link/`.
//! Run: `cargo +nightly fuzz run link fuzz/corpus/link fuzz/seeds-link`.

#![no_main]

use libfuzzer_sys::fuzz_target;
use verso_server::fuzz_api;

fuzz_target!(|data: &[u8]| {
    let text = String::from_utf8_lossy(data);
    if fuzz_api::link_token(&text) {
        assert!(text.len() <= 64, "a token is at most 64 bytes");
        assert!(
            text.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
            "a token holds letters, digits, - and _"
        );
    }
    let (allowed, writes) = fuzz_api::link_command(&text);
    assert!(!(allowed && writes), "a visitor may call a command that writes: {text}");
    let (route, file) = fuzz_api::link_path(&text);
    assert!(!file || route, "a file under a link is under a link: {text}");
    if route {
        assert!(text.starts_with("/r/"), "{text}");
    }
});
