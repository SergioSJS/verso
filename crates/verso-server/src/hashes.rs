// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Argon2id within the host's means. Each hash takes some 19 MiB for its
//! time (`crate::crypto`), and the runtime lends up to 512 threads for
//! blocking work: sign-ins that arrive together — the REST pace lets an
//! address send 100 at once (ADR 0083 item 7) — would each hold their
//! 19 MiB on a host of 1 GB. Every hash therefore takes a place among a
//! few ([`Hashes::run`]), and waits a few seconds for one at most before
//! it is answered 503; and an attempt on a sign-in's key waits for the
//! attempt before it on the same key ([`Hashes::turn`]), so that the delay
//! of ADR 0074 item 9 counts every attempt, not only those that arrived
//! after the first had failed. Both are waits, never a lock a stranger can
//! use: a place comes back when a hash ends, a turn when an attempt does.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::http::StatusCode;
use tokio::sync::{OwnedMutexGuard, Semaphore};
use verso_service::lock;

use crate::http::{ApiError, ApiResult};

/// How long a hash waits for a place before it is answered 503: a few
/// hashes' time on the slowest host, so that an honest sign-in in a burst
/// waits, and a flood is turned away instead of queued without end.
const HASH_WAIT: Duration = Duration::from_secs(5);

/// How long an attempt waits for the one before it on the same key: the
/// time of a hash and its place's wait, with room. An honest double click
/// waits for its first click's answer; past it, 429.
const TURN_WAIT: Duration = Duration::from_secs(10);

/// The hashes run at once: two per core the host gives this process,
/// two at least. A hash is all computation, so more than the cores only
/// queue in the system's scheduler; two per core keeps every core busy
/// while a hash waits for its thread, and on the 1-core, 1 GB host is two
/// hashes, 38 MiB.
#[must_use]
pub fn places() -> usize {
    std::thread::available_parallelism()
        .map_or(1, std::num::NonZero::get)
        .saturating_mul(2)
        .max(2)
}

/// The places of the hashes, and the attempts in flight per key.
pub struct Hashes {
    gate: Arc<Semaphore>,
    most: std::sync::atomic::AtomicUsize,
    turns: Arc<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
    /// The hashes run and the most at once, for the tests.
    #[cfg(test)]
    pub(crate) counted: Arc<Counted>,
}

#[cfg(test)]
#[derive(Default)]
pub(crate) struct Counted {
    pub(crate) ran: std::sync::atomic::AtomicUsize,
    now: std::sync::atomic::AtomicUsize,
    pub(crate) peak: std::sync::atomic::AtomicUsize,
    /// Milliseconds each counted hash is held in its place, so a test sees
    /// the places taken whatever the hash costs (a test's own, never a
    /// production parameter).
    pub(crate) hold_ms: std::sync::atomic::AtomicU64,
}

impl Default for Hashes {
    fn default() -> Self {
        Self::new(places())
    }
}

/// The turns of an attempt's keys, given back when it ends.
pub struct Turn {
    held: Vec<(String, OwnedMutexGuard<()>)>,
    turns: Arc<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
}

impl Drop for Turn {
    fn drop(&mut self) {
        let keys: Vec<String> = self.held.drain(..).map(|(k, _)| k).collect();
        // The guards gone first: a key nobody holds or waits for leaves the
        // map, which holds the attempts in flight and nothing more.
        let mut turns = lock(&self.turns);
        for key in keys {
            if turns.get(&key).is_some_and(|m| Arc::strong_count(m) == 1) {
                turns.remove(&key);
            }
        }
    }
}

fn busy() -> ApiError {
    ApiError {
        retry: Some(HASH_WAIT.as_secs()),
        ..ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "busy",
            "the server is busy checking passwords: try again in a moment",
        )
    }
}

impl Hashes {
    #[must_use]
    pub fn new(most: usize) -> Self {
        Self {
            gate: Arc::new(Semaphore::new(most)),
            most: std::sync::atomic::AtomicUsize::new(most),
            turns: Arc::new(Mutex::new(HashMap::new())),
            #[cfg(test)]
            counted: Arc::default(),
        }
    }

    /// The hashes that may run at once.
    #[must_use]
    pub fn most(&self) -> usize {
        self.most.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Fewer places, for a test that must see them all taken on any host.
    #[cfg(test)]
    pub(crate) fn narrow(&self, most: usize) {
        let before = self.most.swap(most, std::sync::atomic::Ordering::Relaxed);
        self.gate.forget_permits(before.saturating_sub(most));
    }

    /// Run `hash` — an Argon2id hash, a verification or a hash thrown away —
    /// on the blocking pool once it has a place, or 503 after
    /// [`HASH_WAIT`].
    pub async fn run<T: Send + 'static>(
        &self,
        hash: impl FnOnce() -> T + Send + 'static,
    ) -> ApiResult<T> {
        let place = tokio::time::timeout(HASH_WAIT, Arc::clone(&self.gate).acquire_owned())
            .await
            .map_err(|_| busy())?
            .map_err(|_| busy())?;
        #[cfg(test)]
        let counted = Arc::clone(&self.counted);
        let done = tokio::task::spawn_blocking(move || {
            #[cfg(test)]
            {
                use std::sync::atomic::Ordering;
                counted.ran.fetch_add(1, Ordering::SeqCst);
                let now = counted.now.fetch_add(1, Ordering::SeqCst) + 1;
                counted.peak.fetch_max(now, Ordering::SeqCst);
                std::thread::sleep(std::time::Duration::from_millis(
                    counted.hold_ms.load(Ordering::SeqCst),
                ));
            }
            let out = hash();
            #[cfg(test)]
            counted
                .now
                .fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
            drop(place);
            out
        })
        .await
        .map_err(|e| e.to_string())?;
        Ok(done)
    }

    /// The turn of each of `keys`, in a fixed order so that two attempts
    /// sharing keys never wait for each other's: one attempt in flight per
    /// key, the next waiting for it up to [`TURN_WAIT`], then 429.
    pub async fn turn(&self, keys: &[&str]) -> ApiResult<Turn> {
        let mut sorted: Vec<&str> = keys.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        let mut turn = Turn {
            held: Vec::with_capacity(sorted.len()),
            turns: Arc::clone(&self.turns),
        };
        let deadline = tokio::time::Instant::now() + TURN_WAIT;
        for key in sorted {
            let mutex = Arc::clone(lock(&self.turns).entry(key.to_owned()).or_default());
            let guard = tokio::time::timeout_at(deadline, mutex.lock_owned())
                .await
                .map_err(|_| ApiError::wait(1))?;
            turn.held.push((key.to_owned(), guard));
        }
        Ok(turn)
    }

    /// The keys with an attempt in flight or waiting, for the tests.
    #[cfg(test)]
    pub(crate) fn keys(&self) -> usize {
        lock(&self.turns).len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// At least two places, whatever the host.
    #[test]
    fn a_host_has_two_places_at_least() {
        assert!(places() >= 2);
    }

    /// A second attempt on a key waits for the first; the key leaves the
    /// map once nobody holds it.
    #[test]
    fn an_attempt_waits_for_the_one_before_on_its_key() {
        crate::tests::block_on(async {
            let h = Hashes::new(2);
            let first = h.turn(&["in:a", "in:b"]).await.unwrap();
            let waiting = tokio::time::timeout(Duration::from_millis(200), h.turn(&["in:b"])).await;
            assert!(waiting.is_err(), "the second attempt did not wait");
            let other = h.turn(&["in:c"]).await.unwrap();
            drop(first);
            let second = h.turn(&["in:b"]).await.unwrap();
            drop((second, other));
            assert_eq!(h.keys(), 0, "the map keeps keys nobody holds");
        });
    }

    /// Past its places a hash waits; after the wait, 503.
    #[test]
    fn a_hash_past_the_places_waits_then_is_answered_503() {
        crate::tests::block_on(async {
            let h = Arc::new(Hashes::new(1));
            let (tx, rx) = std::sync::mpsc::channel::<()>();
            let held = {
                let h = Arc::clone(&h);
                tokio::spawn(async move {
                    h.run(move || {
                        let _ = rx.recv_timeout(Duration::from_secs(20));
                    })
                    .await
                })
            };
            tokio::time::sleep(Duration::from_millis(100)).await;
            let refused = h.run(|| ()).await.err().map(|e| e.status.as_u16());
            assert_eq!(refused, Some(503));
            tx.send(()).unwrap();
            held.await.unwrap().unwrap();
            assert!(h.run(|| ()).await.is_ok());
        });
    }
}
