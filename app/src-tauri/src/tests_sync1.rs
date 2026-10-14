// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! This app, of sync 2, against a server of sync 1 (ADR 0079 item 5: the
//! newer side follows the version before): a file of several pieces
//! crosses both ways as base64 inside the JSON, the way of sync 1, never
//! as the binary messages of sync 2 (item 12, revised 2026-10-12). And a
//! file of several pieces between two devices of this app's own sync.

// The server is not built for Windows (crates/verso-cli/Cargo.toml).
#![cfg(not(windows))]

use super::tests_sync::{device, kept, on, read, serve, sync, write};

/// A file of 3 MiB and a bit: four pieces of 1 MiB.
fn big() -> Vec<u8> {
    (0..((3_u32 << 20) + 4321))
        .map(|i| u8::try_from(i % 251).unwrap())
        .collect()
}

#[test]
fn a_device_of_sync_2_sends_and_fetches_pieces_from_a_server_of_sync_1() {
    let r = serve(&[]);
    r.server.upgrade().unwrap().speak_sync(1);
    let bytes = big();

    // Sent from this computer to the server, in pieces, as base64.
    let a = device(&r, &r.owner, &[]);
    write(&a, "anexos/mapa.bin", &bytes);
    let mut la = kept(&a);
    assert!(
        !la.remote.binary(),
        "a server of sync 1 takes no binary pieces"
    );
    let passed = on(&a, &mut la);
    assert!(passed.actions >= 1, "{passed:?}");
    let status = a.s.status();
    assert!(status.refused.is_empty(), "{:?}", status.refused);
    assert_eq!(status.state, "synced", "{status:?}");

    // Fetched from the server by another device, in pieces, as base64.
    let b = device(&r, &r.owner, &[]);
    let mut lb = kept(&b);
    assert!(!lb.remote.binary());
    on(&b, &mut lb);
    assert_eq!(
        read(&b, "anexos/mapa.bin").as_deref(),
        Some(bytes.as_slice())
    );

    // Changed there and fetched back here: both ways on one connection.
    let mut changed = bytes.clone();
    changed.extend_from_slice("mais um pedaço".as_bytes());
    write(&b, "anexos/mapa.bin", &changed);
    on(&b, &mut lb);
    super::tests_sync::changed(&a, &[]);
    on(&a, &mut la);
    assert_eq!(
        read(&a, "anexos/mapa.bin").as_deref(),
        Some(changed.as_slice())
    );
}

/// The same server, speaking its own sync again, takes binary pieces:
/// the knob is what made the difference above.
#[test]
fn the_same_server_of_sync_2_takes_binary_pieces() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[]);
    let la = kept(&a);
    assert!(la.remote.binary());
}

/// A file larger than a message, between two devices of this app's own
/// sync: in pieces both ways (moved here from tests_sync.rs, which is at
/// the size limit of ADR 0067).
#[test]
fn a_file_larger_than_a_message_crosses_in_pieces() {
    let r = serve(&[]);
    let a = device(&r, &r.owner, &[]);
    let big: Vec<u8> = (0..(9_u32 << 20))
        .map(|i| u8::try_from(i % 251).unwrap())
        .collect();
    write(&a, "anexos/mapa.bin", &big);
    sync(&a);
    let b = device(&r, &r.owner, &[]);
    sync(&b);
    assert_eq!(read(&b, "anexos/mapa.bin").as_deref(), Some(big.as_slice()));
}
