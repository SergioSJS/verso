// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Attempts limited by a growing delay (ADR 0074 item 9): sign-ins by
//! address and by account, and the links of invitations and resets by
//! address. Never a lock a stranger could use to keep the owner out: after
//! the delay the next attempt is heard again, and a success clears it.

use std::collections::HashMap;
use std::hash::Hash;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use verso_service::lock;

/// The part of an address one host holds, as the per-address delays and
/// counts key it (threat-model.md, gap 7): an IPv4 address whole; over
/// IPv6, its /64 — the prefix a network hands one host or one home, whose
/// 2^64 addresses one machine can rotate through to pass every delay. An
/// IPv4 address mapped into IPv6 is that IPv4 address.
#[must_use]
pub fn address_key(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(v4) => v4.to_string(),
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => v4.to_string(),
            None => {
                let s = v6.segments();
                format!("{:x}:{:x}:{:x}:{:x}::/64", s[0], s[1], s[2], s[3])
            }
        },
    }
}

/// Room for one more entry in a map kept in memory and filled by
/// strangers (the delays below, pending device codes, sign-in links,
/// passkey ceremonies): at `most` entries, the oldest tenth by `at` goes.
/// Many addresses — a /48 holds 65 536 /64s — then cost the server a
/// bounded map, not its memory; what they push out is the oldest, which
/// an attack under way keeps young.
pub fn make_room<K: Eq + Hash, V>(
    map: &mut HashMap<K, V>,
    most: usize,
    at: impl Fn(&V) -> Instant,
) {
    if map.len() < most {
        return;
    }
    let mut ages: Vec<Instant> = map.values().map(&at).collect();
    let tenth = ages.len() / 10;
    let (_, cutoff, _) = ages.select_nth_unstable(tenth);
    let cutoff = *cutoff;
    map.retain(|_, v| at(v) > cutoff);
}

/// The keys the delays keep, at most: some 100 bytes each, 10 MB in all.
const KEYS: usize = 100_000;

/// The entries of each other map strangers fill — device codes waiting,
/// sign-in links sent, passkey ceremonies under way — at most. Each lives
/// minutes (10, 15, 5) and is made only past a per-address delay, so a
/// person's own is never among the oldest tenth for long; a passkey's
/// state is a few kilobytes, so 10 000 of them are tens of megabytes.
pub const PENDING: usize = 10_000;

/// The entries one address (an IPv6 /64 as one) may keep at once in each
/// of those maps: a person's own few — a code for each device being
/// connected, a link asked again, a passkey tried twice — with room. Past
/// it the address is refused another, so that it cannot fill a map alone
/// and push out, as the oldest tenth, the ceremony a person has under way
/// (the review of 2026-10-13); many addresses still can, at
/// [`PENDING`] / 8 of them.
pub const PENDING_PER_ADDRESS: usize = 8;

/// Whether `address` may add one more entry to `map`, `of` giving the
/// address key each entry was made from.
pub fn room_for<K, V>(map: &HashMap<K, V>, address: &str, of: impl Fn(&V) -> &str) -> bool {
    map.values().filter(|v| of(v) == address).count() < PENDING_PER_ADDRESS
}

/// Failures heard without delay.
pub(crate) const FREE: u32 = 3;
/// The longest wait between two attempts.
const MOST: Duration = Duration::from_secs(60);
/// A key forgotten this long after its last failure.
const FORGET: Duration = Duration::from_secs(3600);

/// How often the keys past [`FORGET`] are looked for: a walk of every key
/// on each failure would cost a flood its size each time.
const PRUNE_EVERY: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct Limiter {
    keys: Mutex<Keys>,
}

#[derive(Default)]
struct Keys {
    map: HashMap<String, (u32, Instant)>,
    pruned: Option<Instant>,
}

impl Limiter {
    /// How long `key` must wait before its next attempt is heard; zero when
    /// it may try now.
    pub fn wait(&self, key: &str) -> Duration {
        let keys = lock(&self.keys);
        let Some((failures, last)) = keys.map.get(key) else {
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
        if keys.pruned.is_none_or(|p| p.elapsed() >= PRUNE_EVERY) {
            keys.map.retain(|_, (_, last)| last.elapsed() < FORGET);
            keys.pruned = Some(Instant::now());
        }
        if !keys.map.contains_key(key) {
            make_room(&mut keys.map, KEYS, |(_, last)| *last);
        }
        let entry = keys
            .map
            .entry(key.to_owned())
            .or_insert((0, Instant::now()));
        entry.0 = entry.0.saturating_add(1);
        entry.1 = Instant::now();
    }

    pub fn succeeded(&self, key: &str) {
        lock(&self.keys).map.remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The rule every map strangers fill shares — device codes, sign-in
    /// links, both passkey ceremonies: an address past its entries gets
    /// none more; another address still does.
    #[test]
    fn an_address_keeps_a_bounded_number_of_entries() {
        let mut map: HashMap<u32, String> = HashMap::new();
        for i in 0..PENDING_PER_ADDRESS {
            assert!(room_for(&map, "a", String::as_str));
            map.insert(u32::try_from(i).unwrap(), "a".to_owned());
        }
        assert!(!room_for(&map, "a", String::as_str));
        assert!(room_for(&map, "b", String::as_str));
    }

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

    #[test]
    fn an_ipv6_host_is_its_64() {
        let key = |a: &str| address_key(a.parse().unwrap());
        assert_eq!(key("203.0.113.9"), "203.0.113.9");
        assert_eq!(key("::ffff:203.0.113.9"), "203.0.113.9");
        assert_eq!(
            key("2001:db8:1:2:aaaa::1"),
            key("2001:db8:1:2:ffff:ffff:ffff:ffff")
        );
        assert_eq!(key("2001:db8:1:2::1"), "2001:db8:1:2::/64");
        assert_ne!(key("2001:db8:1:2::1"), key("2001:db8:1:3::1"));
    }

    #[test]
    fn a_map_filled_by_strangers_keeps_its_bound() {
        let mut map = HashMap::new();
        let start = Instant::now();
        for i in 0..1000_u64 {
            make_room(&mut map, 100, |at: &Instant| *at);
            map.insert(i, start + Duration::from_millis(i));
        }
        assert!(map.len() <= 100, "{}", map.len());
        // The newest stay.
        assert!(map.contains_key(&999));
        let l = Limiter::default();
        for i in 0..(KEYS + 10) {
            l.failed(&format!("in:{i}"));
        }
        assert!(lock(&l.keys).map.len() <= KEYS);
    }
}
