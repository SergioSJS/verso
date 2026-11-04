// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What one member may hold of the server (threat-model.md, gap 4): its
//! connections, by account and by address, and the pace of its commands,
//! with the server's own pace above them all. Each connection already
//! has its own bounds (`crate::rpc`); these keep one member's program from
//! opening connections, or sending commands, until every other member
//! waits behind it. Past a pace a command waits for its turn, holding its
//! connection's place — none is refused; past a count of connections the
//! next is refused with 429.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use verso_service::lock;

/// The WebSocket connections one account may hold at once. A person's
/// windows in browsers (one per tab), the desktop's windows on the
/// server's folders and one sync per synced folder, on a few devices:
/// rarely above a dozen. 32 leaves room; past it is a program's loop.
pub const PER_ACCOUNT: u32 = 32;

/// The WebSocket connections one address may hold at once — an IPv4
/// address, or an IPv6 /64 ([`crate::limit::address_key`]): a household
/// or an office behind one address, several people each within
/// [`PER_ACCOUNT`]. An address of this machine is not counted: it is the
/// proxy in front (`tailscale serve`, Caddy) speaking for everyone.
pub const PER_ADDRESS: u32 = 64;

/// "This app is a server" holds 64 connections in all (ADR 0096 item 13,
/// `crate::listen::LOCAL_CONNECTIONS`), shared by the network and the
/// owner's window, and the internet link's listener holds its own
/// (`crate::listen::LOCAL_LINK`), all from `cloudflared`: the fairness
/// among the players is here, not in the listener. The WebSockets of one player's
/// account, of one phone and of one read link are bounded to a few. A
/// player's window in a browser holds one or two (its window's and the
/// copy kept on the device), so a few tabs and a board fit. `[OPEN]` for
/// the maintainer: 8.
pub const LOCAL_PER_ACCOUNT: u32 = 8;

/// …and one address's, an address behind which a household may play: the
/// connections the listener lets one address hold
/// (`crate::listen::LOCAL_PER_ADDRESS`). `[OPEN]` for the maintainer: 16.
pub const LOCAL_PER_ADDRESS: u32 = 16;

/// The bounds of WebSockets for this server: per account (a read link's
/// and a phone's too), per address.
#[must_use]
pub fn connections_most(server: &crate::state::Server) -> (u32, u32) {
    if server.local.is_some() {
        (LOCAL_PER_ACCOUNT, LOCAL_PER_ADDRESS)
    } else {
        (PER_ACCOUNT, PER_ADDRESS)
    }
}

/// The commands one account may send a second, sustained, and at once.
/// A window opening a folder asks a few dozen things together; a device
/// catching up sends one command per file or piece. 100 a second is a
/// catch-up of 6 000 files a minute; 400 at once covers any opening.
pub const ACCOUNT_RATE: f64 = 100.0;
pub const ACCOUNT_BURST: f64 = 400.0;

/// The `sync_read`s one account may send a second, sustained, and at once
/// (ADR 0083 item 18, decided 2026-10-15): a fresh device's first sync of
/// a folder asks for every file in turn, and measured on the 1-core host
/// 3 000 reads under [`ACCOUNT_RATE`] took 26 s. The reads have an
/// allowance of their own, so they neither wait behind nor spend the
/// account's pace for its other commands; the server's pace still counts
/// every one, and a flood of reads past this allowance waits like any
/// other command.
pub const READ_RATE: f64 = 1000.0;
pub const READ_BURST: f64 = 4000.0;

/// The commands the whole server takes a second, sustained, and at once:
/// ten accounts at their full pace. On the 1-core, 1 GB host of the
/// installation notes a command is a few milliseconds of the blocking
/// pool, so 1 000 a second is already more than it serves: the bound is
/// there so that the queue behind it stays a wait of seconds, not
/// minutes. Not measured on that host yet (threat-model.md).
pub const SERVER_RATE: f64 = 1000.0;
pub const SERVER_BURST: f64 = 2000.0;

/// How often a pace that was passed is said in the log, per account and
/// for the server.
const SAY_EVERY: Duration = Duration::from_secs(60);

/// Connections counted by a key; each [`Held`] gives its place back when
/// dropped, with the connection.
#[derive(Default, Clone)]
pub struct Counts(Arc<Mutex<HashMap<String, u32>>>);

pub struct Held {
    counts: Counts,
    key: String,
}

impl Counts {
    /// A place for `key`, or none when it holds `most` already.
    pub fn take(&self, key: &str, most: u32) -> Option<Held> {
        let mut held = lock(&self.0);
        let n = held.entry(key.to_owned()).or_insert(0);
        if *n >= most {
            return None;
        }
        *n += 1;
        Some(Held {
            counts: self.clone(),
            key: key.to_owned(),
        })
    }

    /// The places `key` holds.
    pub fn count(&self, key: &str) -> u32 {
        lock(&self.0).get(key).copied().unwrap_or(0)
    }
}

impl Drop for Held {
    fn drop(&mut self) {
        let mut held = lock(&self.counts.0);
        if let Some(n) = held.get_mut(&self.key) {
            *n = n.saturating_sub(1);
            if *n == 0 {
                held.remove(&self.key);
            }
        }
    }
}

/// A token bucket: `rate` a second, `burst` at once. A command takes a
/// token, in debt if need be, and waits as long as the debt takes to
/// repay: commands past the pace are served in turn, none refused. The
/// server's refused sign-ins keep one too (`crate::signin`); the REST
/// routes' pace (`crate::pace`) takes one only when it is there.
#[derive(Clone, Copy)]
pub(crate) struct Bucket {
    tokens: f64,
    /// When it was last taken from, or made.
    pub(crate) at: Instant,
}

impl Bucket {
    pub(crate) fn full(burst: f64) -> Self {
        Self::full_at(burst, Instant::now())
    }

    pub(crate) fn full_at(burst: f64, now: Instant) -> Self {
        Self {
            tokens: burst,
            at: now,
        }
    }

    /// A token if one is there now, never in debt: what can be dropped
    /// instead of waiting (presence) takes one only when it costs no other
    /// command its turn.
    fn take_free(&mut self, rate: f64, burst: f64) -> bool {
        self.take_free_at(Instant::now(), rate, burst)
    }

    /// The same at `now`, a clock the caller holds (a test's own).
    pub(crate) fn take_free_at(&mut self, now: Instant, rate: f64, burst: f64) -> bool {
        let earned = now.saturating_duration_since(self.at).as_secs_f64() * rate;
        let tokens = (self.tokens + earned).min(burst);
        self.at = now.max(self.at);
        if tokens >= 1.0 {
            self.tokens = tokens - 1.0;
            true
        } else {
            self.tokens = tokens;
            false
        }
    }

    /// A token taken in debt, the debt never deeper than `most` of the
    /// pace: what is past it waits its turn, never longer than `most` —
    /// a flood past the pace slows everyone by that much and no more.
    pub(crate) fn take_within(&mut self, rate: f64, burst: f64, most: Duration) -> Duration {
        let floor = -most.as_secs_f64() * rate;
        self.take(rate, burst);
        self.tokens = self.tokens.max(floor);
        self.owed(rate)
    }

    /// How long the debt takes to repay now, no token taken.
    pub(crate) fn due(&mut self, rate: f64, burst: f64) -> Duration {
        let now = Instant::now();
        let earned = now.duration_since(self.at).as_secs_f64() * rate;
        self.tokens = (self.tokens + earned).min(burst);
        self.at = now;
        self.owed(rate)
    }

    fn owed(&self, rate: f64) -> Duration {
        if self.tokens >= 0.0 {
            Duration::ZERO
        } else {
            Duration::from_secs_f64(-self.tokens / rate)
        }
    }

    /// How long until a token is there, after a [`Bucket::take_free_at`]
    /// that found none.
    pub(crate) fn until_one(&self, rate: f64) -> Duration {
        Duration::from_secs_f64(((1.0 - self.tokens) / rate).max(0.0))
    }

    /// Whether, at `now`, the bucket has filled again: it then says no
    /// more than a new one would, and may be forgotten.
    pub(crate) fn refilled(&self, now: Instant, rate: f64, burst: f64) -> bool {
        self.tokens + now.saturating_duration_since(self.at).as_secs_f64() * rate >= burst
    }

    fn take(&mut self, rate: f64, burst: f64) -> Duration {
        let now = Instant::now();
        let earned = now.duration_since(self.at).as_secs_f64() * rate;
        self.tokens = (self.tokens + earned).min(burst) - 1.0;
        self.at = now;
        if self.tokens >= 0.0 {
            Duration::ZERO
        } else {
            Duration::from_secs_f64(-self.tokens / rate)
        }
    }
}

pub struct Fair {
    /// WebSocket connections, by `account:` and by `address:`.
    pub connections: Counts,
    server: Mutex<Bucket>,
    accounts: Mutex<HashMap<String, Bucket>>,
    reads: Mutex<HashMap<String, Bucket>>,
    said: Mutex<HashMap<String, Instant>>,
}

impl Default for Fair {
    fn default() -> Self {
        Self {
            connections: Counts::default(),
            server: Mutex::new(Bucket::full(SERVER_BURST)),
            accounts: Mutex::new(HashMap::new()),
            reads: Mutex::new(HashMap::new()),
            said: Mutex::new(HashMap::new()),
        }
    }
}

impl Fair {
    /// How long a command of `account` waits for its turn: the longer of
    /// the account's pace and the server's. A pace passed is said in the
    /// log, once a minute each.
    pub fn command(&self, account: &str, cmd: &str) -> Duration {
        let (mine, rate) = if cmd == "sync_read" {
            let wait = lock(&self.reads)
                .entry(account.to_owned())
                .or_insert_with(|| Bucket::full(READ_BURST))
                .take(READ_RATE, READ_BURST);
            (wait, READ_RATE)
        } else {
            let wait = lock(&self.accounts)
                .entry(account.to_owned())
                .or_insert_with(|| Bucket::full(ACCOUNT_BURST))
                .take(ACCOUNT_RATE, ACCOUNT_BURST);
            (wait, ACCOUNT_RATE)
        };
        let all = lock(&self.server).take(SERVER_RATE, SERVER_BURST);
        if !mine.is_zero() {
            self.say(
                account,
                &format!(
                    "account {account} sends {cmd} past {rate} a second: they wait their turn"
                ),
            );
        }
        if !all.is_zero() {
            self.say(
                "",
                &format!(
                    "the server takes commands past {SERVER_RATE} a second: they wait their turn"
                ),
            );
        }
        mine.max(all)
    }

    /// Whether a command that may be dropped — a window's presence, which
    /// the next one replaces — goes now: only with a token free in the
    /// account's pace and the server's. Past the pace it is dropped, never
    /// queued: presence must not hold back an edit (seen on macOS,
    /// 2026-10-13: three windows of one account sent ~45 presences a
    /// second each, and the edits behind them took 30 s to arrive).
    pub fn droppable(&self, account: &str) -> bool {
        let mine = lock(&self.accounts)
            .entry(account.to_owned())
            .or_insert_with(|| Bucket::full(ACCOUNT_BURST))
            .take_free(ACCOUNT_RATE, ACCOUNT_BURST);
        mine && lock(&self.server).take_free(SERVER_RATE, SERVER_BURST)
    }

    fn say(&self, key: &str, line: &str) {
        let mut said = lock(&self.said);
        if said.get(key).is_none_or(|at| at.elapsed() >= SAY_EVERY) {
            said.insert(key.to_owned(), Instant::now());
            crate::log::warn(line);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_place_is_given_back_with_its_connection() {
        let counts = Counts::default();
        let a = counts.take("k", 2).unwrap();
        let b = counts.take("k", 2).unwrap();
        assert!(counts.take("k", 2).is_none());
        assert!(counts.take("other", 2).is_some());
        drop(a);
        assert_eq!(counts.count("k"), 1);
        assert!(counts.take("k", 2).is_some());
        drop(b);
    }

    #[test]
    fn a_presence_past_the_pace_is_dropped_and_never_puts_the_pace_in_debt() {
        let mut bucket = Bucket::full(2.0);
        assert!(bucket.take_free(10.0, 2.0));
        assert!(bucket.take_free(10.0, 2.0));
        // No token: dropped, and the bucket is not in debt for it — the
        // next real command still waits only its own turn.
        assert!(!bucket.take_free(10.0, 2.0));
        assert!(!bucket.take_free(10.0, 2.0));
        let wait = bucket.take(10.0, 2.0);
        assert!(wait <= Duration::from_millis(100), "{wait:?}");
        // An account past its pace: presences dropped, commands still served.
        let fair = Fair::default();
        for _ in 0..(ACCOUNT_BURST as usize) {
            let _ = fair.command("a", "list");
        }
        assert!(!fair.droppable("a"));
        assert!(fair.droppable("b"));
    }

    #[test]
    fn a_debt_kept_within_its_floor_waits_at_most_that_long() {
        let mut bucket = Bucket::full(5.0);
        for _ in 0..5 {
            assert_eq!(
                bucket.take_within(10.0, 5.0, Duration::from_secs(2)),
                Duration::ZERO
            );
        }
        assert_eq!(bucket.due(10.0, 5.0), Duration::ZERO);
        // In debt: the next waits a tenth of a second, and so does anyone
        // who only asks for a turn.
        let sixth = bucket.take_within(10.0, 5.0, Duration::from_secs(2));
        assert!(
            sixth > Duration::from_millis(50) && sixth <= Duration::from_millis(100),
            "{sixth:?}"
        );
        assert!(bucket.due(10.0, 5.0) > Duration::from_millis(50));
        // A flood: the debt stops at its floor, 2 s of the pace.
        for _ in 0..1000 {
            bucket.take_within(10.0, 5.0, Duration::from_secs(2));
        }
        let due = bucket.due(10.0, 5.0);
        assert!(
            due > Duration::from_millis(1900) && due <= Duration::from_secs(2),
            "{due:?}"
        );
    }

    #[test]
    fn past_the_pace_a_command_waits_its_turn() {
        let mut bucket = Bucket::full(3.0);
        for _ in 0..3 {
            assert_eq!(bucket.take(10.0, 3.0), Duration::ZERO);
        }
        // In debt: the fourth waits a tenth of a second, the fifth two.
        let fourth = bucket.take(10.0, 3.0);
        let fifth = bucket.take(10.0, 3.0);
        assert!(fourth > Duration::from_millis(50) && fourth <= Duration::from_millis(100));
        assert!(fifth > fourth);
        let fair = Fair::default();
        let waits: Vec<Duration> = (0..(ACCOUNT_BURST as usize + 2))
            .map(|_| fair.command("a", "list"))
            .collect();
        assert!(waits[0].is_zero());
        assert!(!waits[waits.len() - 1].is_zero());
        // Another account is not behind the first.
        assert!(fair.command("b", "list").is_zero());
    }

    #[test]
    fn a_first_sync_of_three_thousand_files_is_not_paced_and_a_flood_still_is() {
        let fair = Fair::default();
        // 3 000 reads of a fresh device: the last waits for the server's
        // own pace only (about a second past its burst of 2 000), not the
        // 26 s the account's pace made it wait.
        let slowest = (0..3000)
            .map(|_| fair.command("a", "sync_read"))
            .max()
            .unwrap_or_default();
        assert!(slowest < Duration::from_secs(2), "{slowest:?}");
        // The reads spent none of the account's own pace for its other
        // commands: what one waits now is the server's debt, a second at
        // most, not the account's.
        assert!(fair.command("a", "list") < Duration::from_secs(2));
        // A flood of single commands is still paced...
        let waits: Vec<Duration> = (0..1000).map(|_| fair.command("b", "list")).collect();
        assert!(waits[waits.len() - 1] > Duration::from_secs(4));
        // ...and so is a flood of reads, past its own allowance.
        let reads: Vec<Duration> = (0..6000).map(|_| fair.command("c", "sync_read")).collect();
        assert!(reads[reads.len() - 1] > Duration::from_secs(1));
    }
}
