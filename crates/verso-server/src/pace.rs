// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A pace on the REST routes, per address (ADR 0083 item 7; F14 of the
//! review of 2026-10-13): a token bucket per address key — an IPv4
//! address, an IPv6 /64, as the delays key it ([`crate::limit::address_key`])
//! — of [`RATE`] a second sustained and [`BURST`] at once, `fair.rs`'s
//! bucket. Past it a request is answered 429 with `Retry-After`, never
//! queued. A window's REST use is a few requests a minute: sync and its
//! commands go over the WebSocket, under `crate::fair`.
//!
//! The address is the one the connection came from, or the one a trusted
//! proxy forwarded ([`crate::proxy`]): a header of any other peer is
//! ignored, so a client cannot pick its own key. The map of buckets is
//! bounded: a bucket that has filled again says no more than a new one and
//! is forgotten once a minute; past [`KEYS`] keys the least recently used
//! tenth goes, which an address under way keeps young.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use verso_service::lock;

use crate::fair::Bucket;

/// The requests one address may make a second, sustained.
pub const RATE: f64 = 20.0;
/// The requests one address may make at once.
pub const BURST: f64 = 100.0;

/// The keys kept at most: a bucket and its key are some 100 bytes, so
/// 10 MB in all. Past it the least recently used tenth goes
/// ([`crate::limit::make_room`]); a key pushed out comes back with a full
/// bucket, which costs the server [`BURST`] requests, never a person a
/// refusal.
pub const KEYS: usize = 100_000;

/// How often the buckets that filled again are forgotten: a walk of every
/// key on each request would cost a flood its size each time.
const PRUNE_EVERY: Duration = Duration::from_secs(60);

/// How often a key past its pace is said in the log.
const SAY_EVERY: Duration = Duration::from_secs(60);

/// The lines past the pace said in a minute, for the whole server: past
/// them, one line a minute counts the addresses not said, so that many
/// addresses (a /48 holds 65 536 /64s) are a few lines, not a log filled.
pub const LINES_A_MINUTE: u32 = 10;

/// What the log has said of the pace this minute.
#[derive(Default)]
struct Said {
    since: Option<Instant>,
    lines: u32,
    more: u32,
}

impl Said {
    /// What to say of `key`, past its pace at `now` and not said in the
    /// last minute: its line, while fewer than [`LINES_A_MINUTE`] were said
    /// this minute; past them nothing, counted. The count is said with the
    /// first line of the next minute — a flood that stopped is not said
    /// again, its last minute being in the lines already there.
    fn lines(&mut self, key: &str, now: Instant, rate: f64) -> Vec<String> {
        let mut out = Vec::new();
        if self
            .since
            .is_none_or(|s| now.saturating_duration_since(s) >= SAY_EVERY)
        {
            if self.more > 0 {
                out.push(format!(
                    "… and {} more addresses past the pace in the last minute: answered 429",
                    self.more
                ));
            }
            *self = Self {
                since: Some(now),
                lines: 0,
                more: 0,
            };
        }
        if self.lines < LINES_A_MINUTE {
            self.lines += 1;
            out.push(format!(
                "requests from {key} past {rate} a second: answered 429"
            ));
        } else {
            self.more += 1;
        }
        out
    }
}

struct Entry {
    bucket: Bucket,
    /// When this key's refusal was last said in the log.
    said: Option<Instant>,
}

#[derive(Default)]
struct Keys {
    map: HashMap<String, Entry>,
    pruned: Option<Instant>,
}

pub struct Pace {
    /// The requests a key may make a second, sustained, and at once.
    rate: f64,
    burst: f64,
    keys: Mutex<Keys>,
    said: Mutex<Said>,
    /// A test's clock: when set, the time stands there until moved.
    #[cfg(test)]
    clock: Mutex<Option<Instant>>,
}

impl Default for Pace {
    fn default() -> Self {
        Self::with(RATE, BURST)
    }
}

impl Pace {
    /// A pace of `rate` a second, sustained, and `burst` at once: the REST
    /// routes' is [`RATE`] and [`BURST`]; the table's messages keep a
    /// pace of their own (ADR 0107 item 12).
    #[must_use]
    pub fn with(rate: f64, burst: f64) -> Self {
        Self {
            rate,
            burst,
            keys: Mutex::default(),
            said: Mutex::default(),
            #[cfg(test)]
            clock: Mutex::default(),
        }
    }

    fn now(&self) -> Instant {
        #[cfg(test)]
        if let Some(at) = *lock(&self.clock) {
            return at;
        }
        Instant::now()
    }

    /// Stop the clock, for a test: a burst then takes no time.
    #[cfg(test)]
    pub(crate) fn freeze(&self) {
        *lock(&self.clock) = Some(Instant::now());
    }

    /// Move the stopped clock on by `by`.
    #[cfg(test)]
    pub(crate) fn advance(&self, by: Duration) {
        let mut clock = lock(&self.clock);
        *clock = Some(clock.unwrap_or_else(Instant::now) + by);
    }

    /// A request of `key`: `None` when it goes on, or the seconds to wait
    /// before the next one is heard.
    pub fn take(&self, key: &str) -> Option<u64> {
        let now = self.now();
        let mut keys = lock(&self.keys);
        if keys
            .pruned
            .is_none_or(|p| now.saturating_duration_since(p) >= PRUNE_EVERY)
        {
            keys.map.retain(|_, e| {
                !e.bucket.refilled(now, self.rate, self.burst)
                    || e.said
                        .is_some_and(|s| now.saturating_duration_since(s) < SAY_EVERY)
            });
            keys.pruned = Some(now);
        }
        if !keys.map.contains_key(key) {
            crate::limit::make_room(&mut keys.map, KEYS, |e| e.bucket.at);
        }
        let entry = keys.map.entry(key.to_owned()).or_insert_with(|| Entry {
            bucket: Bucket::full_at(self.burst, now),
            said: None,
        });
        if entry.bucket.take_free_at(now, self.rate, self.burst) {
            return None;
        }
        let wait = entry
            .bucket
            .until_one(self.rate)
            .as_secs_f64()
            .ceil()
            .max(1.0) as u64;
        let say = entry
            .said
            .is_none_or(|s| now.saturating_duration_since(s) >= SAY_EVERY);
        if say {
            entry.said = Some(now);
        }
        drop(keys);
        if say {
            let lines = lock(&self.said).lines(key, now, self.rate);
            for line in lines {
                crate::log::warn(&line);
            }
        }
        Some(wait)
    }

    /// Whether `key` is past its pace now, without taking a request from
    /// it: the seconds to wait, or `None`.
    pub fn waiting(&self, key: &str) -> Option<u64> {
        let now = self.now();
        let keys = lock(&self.keys);
        let mut bucket = keys.map.get(key)?.bucket;
        drop(keys);
        (!bucket.take_free_at(now, self.rate, self.burst))
            .then(|| bucket.until_one(self.rate).as_secs_f64().ceil().max(1.0) as u64)
    }

    /// How many keys the pace holds.
    #[cfg(test)]
    pub(crate) fn held(&self) -> usize {
        lock(&self.keys).map.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_burst_then_the_sustained_pace() {
        let pace = Pace::default();
        pace.freeze();
        for i in 0..(BURST as usize) {
            assert_eq!(pace.take("203.0.113.1"), None, "request {i}");
        }
        let wait = pace.take("203.0.113.1");
        assert_eq!(wait, Some(1));
        // Another address has its own bucket.
        assert_eq!(pace.take("203.0.113.2"), None);
        // A twentieth of a second earns one request.
        pace.advance(Duration::from_millis(50));
        assert_eq!(pace.take("203.0.113.1"), None);
        assert!(pace.take("203.0.113.1").is_some());
        // Said once a minute, not once a request.
        let said = crate::log::said("requests from 203.0.113.1 past");
        assert_eq!(said.len(), 1, "{said:?}");
    }

    #[test]
    fn the_lines_past_the_pace_are_capped_for_the_whole_server() {
        let mut said = Said::default();
        let at = Instant::now();
        let mut lines = Vec::new();
        for i in 0..25 {
            lines.extend(said.lines(&format!("198.51.100.{i}"), at, RATE));
        }
        assert_eq!(lines.len(), LINES_A_MINUTE as usize, "{lines:?}");
        // A minute on: the count of the addresses not said, then the line.
        let later = said.lines("198.51.100.99", at + Duration::from_secs(61), RATE);
        assert_eq!(
            later,
            [
                "… and 15 more addresses past the pace in the last minute: answered 429",
                "requests from 198.51.100.99 past 20 a second: answered 429",
            ]
        );
        // Through the pace: twelve addresses past it, ten said.
        let pace = Pace::default();
        pace.freeze();
        for i in 0..12 {
            for _ in 0..=(BURST as usize) {
                pace.take(&format!("cap-{i}"));
            }
        }
        let said = crate::log::said("requests from cap-");
        assert_eq!(said.len(), LINES_A_MINUTE as usize, "{said:?}");
    }

    #[test]
    fn the_map_of_buckets_keeps_its_bound() {
        let pace = Pace::default();
        pace.freeze();
        for i in 0..(KEYS + 10) {
            pace.take(&format!("k{i}"));
        }
        assert!(pace.held() <= KEYS, "{}", pace.held());
        // A minute later the buckets that filled again are forgotten.
        pace.advance(Duration::from_secs(61));
        pace.take("new");
        assert_eq!(pace.held(), 1);
    }
}
