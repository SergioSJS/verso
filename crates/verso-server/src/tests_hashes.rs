// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Argon2id within the host's means (`crate::hashes`): sign-ins that
//! arrive together hash a few at a time, and the attempts on one key are
//! heard one after another, so the delay counts every one.

use std::sync::atomic::Ordering;

use serde_json::json;

use crate::tests::{block_on, start, start_with};

/// Fifty wrong passwords for one account sent at once: only the attempts
/// the delay hears without waiting reach a hash; the others are answered
/// 429 before one (ADR 0074 item 9 holds under concurrency).
#[test]
fn concurrent_wrong_sign_ins_for_one_account_hash_only_the_free_attempts() {
    block_on(async {
        let r = start().await;
        let client = reqwest::Client::new();
        let attempts: Vec<_> = (0..50)
            .map(|_| {
                let request = client
                    .post(r.url("/api/signin"))
                    .header("origin", r.origin())
                    .json(&json!({ "email": "admin@casa.lan", "password": "uma senha errada qualquer" }));
                tokio::spawn(async move { request.send().await.map(|res| res.status().as_u16()) })
            })
            .collect();
        let mut statuses = Vec::new();
        for attempt in attempts {
            statuses.push(attempt.await.unwrap().unwrap());
        }
        assert!(
            statuses.iter().all(|s| *s == 401 || *s == 429),
            "{statuses:?}"
        );
        let ran = r.server.hashes.counted.ran.load(Ordering::SeqCst);
        let free = crate::limit::FREE as usize;
        assert!(
            ran <= free,
            "{ran} concurrent wrong attempts reached the hash; the delay lets {free} through"
        );
        assert_eq!(statuses.iter().filter(|s| **s == 401).count(), ran);
    });
}

/// Fifty sign-ins from fifty addresses at once, each for an address with
/// no account: no more hashes at once than the places, whatever the
/// threads the runtime lends.
#[test]
fn concurrent_sign_ins_hash_no_more_than_the_places_at_once() {
    block_on(async {
        let r = start_with(|c| {
            c.trusted_proxy = crate::proxy::Proxies::parse("127.0.0.1").unwrap();
        })
        .await;
        // Two places, as on the 1-core host, whatever this machine's cores.
        r.server.hashes.narrow(2);
        // A fast hash would end before the next began and prove nothing:
        // each one holds its place for a while, so the places are all taken.
        r.server.hashes.counted.hold_ms.store(40, Ordering::SeqCst);
        let client = reqwest::Client::new();
        let attempts: Vec<_> = (0..50)
            .map(|i| {
                let request = client
                    .post(r.url("/api/signin"))
                    .header("origin", r.origin().replacen("http://", "https://", 1))
                    .header("x-forwarded-for", format!("203.0.113.{}", i + 1))
                    // As a proxy in front of TLS says it: through a trusted
                    // proxy this header alone says the request came over
                    // HTTPS (the cookie's `Secure`, the origin's scheme).
                    .header("x-forwarded-proto", "https")
                    .json(&json!({ "email": format!("ninguem{i}@casa.lan"), "password": "uma senha errada qualquer" }));
                tokio::spawn(async move { request.send().await.map(|res| res.status().as_u16()) })
            })
            .collect();
        let mut statuses = Vec::new();
        for attempt in attempts {
            statuses.push(attempt.await.unwrap().unwrap());
        }
        // Answered as a wrong password, or 503 past the wait for a place.
        assert!(
            statuses.iter().all(|s| *s == 401 || *s == 503),
            "{statuses:?}"
        );
        let peak = r.server.hashes.counted.peak.load(Ordering::SeqCst);
        let most = r.server.hashes.most();
        assert!(
            peak <= most,
            "{peak} hashes ran at once; the places are {most}"
        );
        assert_eq!(
            peak, most,
            "the places were never all taken: the bound is unproven"
        );
        assert!(r.server.hashes.counted.ran.load(Ordering::SeqCst) > 0);
    });
}
