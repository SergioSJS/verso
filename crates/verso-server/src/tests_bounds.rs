// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The bounds of one connection and of the server (threat-model.md, gaps
//! of 2026-10-11): what a peer that stops reading, a flood of messages or
//! of connections, or a slow request can hold.

use std::time::{Duration, Instant};

use serde_json::json;

use crate::tests::{block_on, connect, next, sign_in, start};

/// The connections of `account` the server still holds.
fn connections_of(r: &crate::tests::Running, account: &str) -> Vec<String> {
    verso_service::lock(&r.server.clients)
        .iter()
        .filter(|(_, c)| c.account == account)
        .map(|(id, _)| id.clone())
        .collect()
}

/// A peer that stops reading at the TCP level is let go once a message
/// waits past its time (gap 2): the connection's loop is not held in the
/// write until the system gives up on the socket.
#[test]
fn a_peer_that_stops_reading_is_let_go() {
    block_on(async {
        let r = start().await;
        let b = sign_in(&r, "admin@casa.lan", "senha muito longa").await;
        let mut ws = connect(&r, Some(&b.cookie), Some(&r.origin()), None)
            .await
            .unwrap();
        let hello = next(&mut ws).await;
        let account = hello["hello"]["account"]["id"].as_str().unwrap().to_owned();
        let ids = connections_of(&r, &account);
        assert_eq!(ids.len(), 1);
        // The socket is kept and never read again: the system's buffers
        // fill, then the server's write waits.
        let big = "x".repeat(1024 * 1024);
        for _ in 0..48 {
            r.server
                .push(&ids, &json!({ "event": "big", "payload": big }));
        }
        let started = Instant::now();
        while !connections_of(&r, &account).is_empty() {
            assert!(
                started.elapsed() < Duration::from_secs(30),
                "the connection is still held"
            );
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        drop(ws);
    });
}

#[test]
fn the_time_a_message_may_take_grows_with_its_size() {
    let small = crate::rpc::send_within(100);
    let piece = crate::rpc::send_within(6 * 1024 * 1024);
    assert!(small >= Duration::from_secs(1));
    assert!(piece > small);
    assert!(crate::rpc::send_within(usize::MAX) > piece);
}
