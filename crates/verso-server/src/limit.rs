// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Attempts limited by a growing delay (ADR 0074 item 9): sign-ins by
//! address and by account, and the links of invitations and resets by
//! address. Never a lock a stranger could use to keep the owner out: after
//! the delay the next attempt is heard again, and a success clears it.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use verso_service::lock;

/// Failures heard without delay.
const FREE: u32 = 3;
/// The longest wait between two attempts.
const MOST: Duration = Duration::from_secs(60);
/// A key forgotten this long after its last failure.
const FORGET: Duration = Duration::from_secs(3600);

#[derive(Default)]
pub struct Limiter {
    keys: Mutex<HashMap<String, (u32, Instant)>>,
}

impl Limiter {
    /// How long `key` must wait before its next attempt is heard; zero when
    /// it may try now.
    pub fn wait(&self, key: &str) -> Duration {
        let keys = lock(&self.keys);
        let Some((failures, last)) = keys.get(key) else {
            return Duration::ZERO;
        };
        if *failures < FREE {
            return Duration::ZERO;
        }
        let delay = Duration::from_secs(1 << (failures - FREE).min(6)).min(MOST);
        delay.saturating_sub(last.elapsed())
    }

    pub fn failed(&self, key: &str) {
        let mut keys = lock(&self.keys);
        keys.retain(|_, (_, last)| last.elapsed() < FORGET);
        let entry = keys.entry(key.to_owned()).or_insert((0, Instant::now()));
        entry.0 = entry.0.saturating_add(1);
        entry.1 = Instant::now();
    }

    pub fn succeeded(&self, key: &str) {
        lock(&self.keys).remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_delay_grows_and_a_success_clears_it() {
        let l = Limiter::default();
        for _ in 0..FREE {
            assert_eq!(l.wait("a"), Duration::ZERO);
            l.failed("a");
        }
        assert!(l.wait("a") > Duration::ZERO);
        assert!(l.wait("a") <= Duration::from_secs(1));
        l.failed("a");
        assert!(l.wait("a") > Duration::from_secs(1));
        assert_eq!(l.wait("b"), Duration::ZERO);
        l.succeeded("a");
        assert_eq!(l.wait("a"), Duration::ZERO);
        for _ in 0..40 {
            l.failed("c");
        }
        assert!(l.wait("c") <= MOST);
    }
}
