// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A refused sign-in, said where the host's tools read it (ADR 0083 item
//! 1): one line of the server's log per refusal, in a fixed format that
//! fail2ban's filter and CrowdSec's parser in `packaging/server/` match —
//!
//! `WARN sign-in failed from <address> for <masked e-mail> (<n> in a row)`
//!
//! — and `WARN sign-in limited from <address>` when the per-key delay
//! refuses, once a minute per key. The address is the one the per-address
//! delays key ([`crate::limit::address_key`]: IPv4 whole, IPv6 by its
//! /64); the e-mail is masked (`a***@example.org`), the same for an
//! address with an account and one without, so that the line says nothing
//! the sign-in's answer does not; the count is of that e-mail's refusals
//! since its last success. The words `sign-in failed from` follow the
//! level only here: a window's own lines (`log_write`) begin with
//! `window <id> (<account>):`, and no other line of the server begins with
//! words a request chose.
//!
//! Above the per-key delay of `crate::limit` (ADR 0083 item 2), never a
//! lock (ADR 0074 item 9): an account refused [`NOTICE_AFTER`] times within
//! an hour, from any address, is told by mail once a day at most, with an
//! `INFO` line for the admin and a row of the audit log the console counts;
//! and the server's refused sign-ins keep a pace — [`FAILED_RATE`] a
//! second, [`FAILED_BURST`] at once — past which every sign-in waits its
//! turn, [`TURN_MOST`] at most, said once a minute.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use verso_service::lock;

use crate::db;
use crate::fair::Bucket;
use crate::state::Server;

/// Refusals of one account within [`NOTICE_WITHIN`] that tell it.
pub const NOTICE_AFTER: usize = 20;
pub const NOTICE_WITHIN: Duration = Duration::from_secs(3600);
/// One notice an account a day at most, in seconds; the audit log keeps
/// the last, so a restart does not send another.
pub const NOTICE_EVERY: i64 = 86_400;
/// The audit log's action for a notice.
pub const NOTICED: &str = "sign_in_noticed";

/// The server's refused sign-ins a second, sustained, and at once (ADR
/// 0083 item 2, decided 2026-10-13; to be measured on the 1 GB host).
pub const FAILED_RATE: f64 = 10.0;
pub const FAILED_BURST: f64 = 50.0;
/// The longest a sign-in waits its turn past that pace.
pub const TURN_MOST: Duration = Duration::from_secs(2);

/// The words that begin a refused sign-in's line, after the level.
pub const FAILED: &str = "sign-in failed from";

/// The keys kept at most, of the counts in a row and of the lines said:
/// filled by strangers (every e-mail typed), bounded as the delays are.
const KEYS: usize = 100_000;

/// How often a refusal of the per-key delay is said, per key.
const SAY_EVERY: Duration = Duration::from_secs(60);

pub struct Watch {
    inner: Mutex<Inner>,
}

impl Default for Watch {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner {
                in_a_row: HashMap::new(),
                said: HashMap::new(),
                hour: HashMap::new(),
                bucket: Bucket::full(FAILED_BURST),
            }),
        }
    }
}

struct Inner {
    /// Refusals in a row, by folded e-mail (or `device:<address>`), with
    /// the time of the last.
    in_a_row: HashMap<String, (u32, Instant)>,
    /// When each key's refusal by the delay was last said, and the pace's
    /// (key `""`).
    said: HashMap<String, Instant>,
    /// Each account's last refusals, with their address keys, and when it
    /// was last told: by account id, so as many as there are accounts.
    hour: HashMap<String, Hour>,
    /// The server's pace of refusals.
    bucket: Bucket,
}

#[derive(Default)]
struct Hour {
    refused: VecDeque<(Instant, String)>,
    told: Option<Instant>,
}

/// What a refusal is counted by: the folded e-mail, or, for a device's
/// poll that names no account, its address.
fn key(address: &str, email: Option<&str>) -> String {
    match email {
        Some(e) => crate::db::fold_email(e),
        None => format!("device:{address}"),
    }
}

/// The e-mail as the log shows it: the first letter of its local part and
/// its domain, `a***@example.org`. Whatever was typed, one word of letters,
/// digits, dots and dashes: a request's text never reaches the line as it
/// was sent (a space, a newline or a parenthesis would let it write another
/// line, or another address, for the filter to read).
#[must_use]
pub fn masked(email: &str) -> String {
    let folded = crate::db::fold_email(email);
    let Some((local, domain)) = folded.rsplit_once('@') else {
        return "***".to_owned();
    };
    let first = local
        .chars()
        .next()
        .filter(char::is_ascii_alphanumeric)
        .unwrap_or('*');
    let domain: String = domain
        .chars()
        .take(64)
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' {
                c
            } else {
                '?'
            }
        })
        .collect();
    if domain.is_empty() {
        return "***".to_owned();
    }
    format!("{first}***@{domain}")
}

/// The line of one refusal, after the level.
#[must_use]
pub fn failed_line(address: &str, shown: &str, in_a_row: u32) -> String {
    format!("{FAILED} {address} for {shown} ({in_a_row} in a row)")
}

impl Watch {
    /// One refused sign-in from `address` (its key, as the delays key it)
    /// for `email` — what was typed, or the account's; `None` for a
    /// device's poll, which names none. Said in the log; the count in a
    /// row returned.
    pub fn failed(&self, address: &str, email: Option<&str>) -> u32 {
        let k = key(address, email);
        let n = {
            let mut inner = lock(&self.inner);
            inner
                .bucket
                .take_within(FAILED_RATE, FAILED_BURST, TURN_MOST);
            if !inner.in_a_row.contains_key(&k) {
                crate::limit::make_room(&mut inner.in_a_row, KEYS, |(_, at)| *at);
            }
            let entry = inner.in_a_row.entry(k).or_insert((0, Instant::now()));
            entry.0 = entry.0.saturating_add(1);
            entry.1 = Instant::now();
            entry.0
        };
        let shown = email.map_or_else(|| "-".to_owned(), masked);
        crate::log::warn(&failed_line(address, &shown, n));
        n
    }

    /// A sign-in that succeeded: its count in a row starts again.
    pub fn succeeded(&self, address: &str, email: Option<&str>) {
        lock(&self.inner).in_a_row.remove(&key(address, email));
    }

    /// The per-key delay refused a request from `address`, for `key`: said
    /// once a minute per key.
    pub fn limited(&self, key: &str, address: &str) {
        if self.first_in_a_minute(key) {
            crate::log::warn(&format!("sign-in limited from {address}"));
        }
    }

    fn first_in_a_minute(&self, key: &str) -> bool {
        let mut inner = lock(&self.inner);
        if inner
            .said
            .get(key)
            .is_some_and(|at| at.elapsed() < SAY_EVERY)
        {
            return false;
        }
        if !inner.said.contains_key(key) {
            crate::limit::make_room(&mut inner.said, KEYS, |at| *at);
        }
        inner.said.insert(key.to_owned(), Instant::now());
        true
    }

    /// How long a sign-in waits its turn before it is heard: the server's
    /// refusals past their pace put every sign-in behind them, the honest
    /// one too — seconds, never a lock. Said once a minute.
    pub fn turn(&self) -> Duration {
        let wait = lock(&self.inner).bucket.due(FAILED_RATE, FAILED_BURST);
        if !wait.is_zero() && self.first_in_a_minute("") {
            crate::log::warn(&format!(
                "sign-ins refused past {FAILED_RATE} a second: every sign-in waits its turn, {} s at most",
                TURN_MOST.as_secs()
            ));
        }
        wait
    }

    /// One refusal against `account` from `address` (its key), at `now`:
    /// the addresses of its last [`NOTICE_AFTER`] refusals when they all
    /// fall within [`NOTICE_WITHIN`] and it was not told in the last day —
    /// it is to be told now.
    pub fn against(&self, account: &str, address: &str, now: Instant) -> Option<Vec<String>> {
        let mut inner = lock(&self.inner);
        let hour = inner.hour.entry(account.to_owned()).or_default();
        hour.refused.push_back((now, address.to_owned()));
        while hour.refused.len() > NOTICE_AFTER
            || hour
                .refused
                .front()
                .is_some_and(|(at, _)| now.saturating_duration_since(*at) >= NOTICE_WITHIN)
        {
            hour.refused.pop_front();
        }
        let day = Duration::from_secs(NOTICE_EVERY.unsigned_abs());
        if hour.refused.len() < NOTICE_AFTER
            || hour
                .told
                .is_some_and(|t| now.saturating_duration_since(t) < day)
        {
            return None;
        }
        hour.told = Some(now);
        let mut from: Vec<String> = Vec::new();
        for (_, a) in &hour.refused {
            if !from.contains(a) {
                from.push(a.clone());
            }
        }
        Some(from)
    }
}

/// One refused sign-in (ADR 0083 items 1 and 2): said in the log, counted
/// in the server's pace and, when the e-mail has an account, against it —
/// the account told by mail past [`NOTICE_AFTER`] an hour. Whatever the
/// account, the work done before the answer is the same: the notice goes
/// on its own, after.
pub fn refused(
    server: &Arc<Server>,
    address: &str,
    email: Option<&str>,
    account: Option<&db::Account>,
) {
    server.signins.failed(address, email);
    let Some(account) = account else {
        return;
    };
    if let Some(addresses) = server.signins.against(&account.id, address, Instant::now()) {
        let server = Arc::clone(server);
        let account = account.clone();
        tokio::spawn(async move {
            if let Err(e) = tell(&server, &account, &addresses).await {
                crate::log::error(&format!("a sign-in notice: {e}"));
            }
        });
    }
}

/// The account is told — once a day at most, the audit log keeping the
/// last — by mail when the server has a mail server, and the admin by a
/// line of the log.
async fn tell(server: &Server, account: &db::Account, addresses: &[String]) -> Result<(), String> {
    let now = db::now();
    if server
        .db
        .last_action_of(&account.id, NOTICED)?
        .is_some_and(|at| now - at < NOTICE_EVERY)
    {
        return Ok(());
    }
    let from = addresses.join(", ");
    server.db.audit(&db::Audit {
        actor: Some(&account.id),
        action: NOTICED,
        subject: None,
        folder: None,
        address: Some(&from),
        ok: true,
    })?;
    let mail = server.mail.get();
    crate::log::info(&format!(
        "account {}: {NOTICE_AFTER} sign-ins refused within an hour, from {from}; {}",
        account.id,
        if mail.is_some() {
            "told by mail"
        } else {
            "not told: no mail server"
        }
    ));
    if let Some(mail) = mail {
        let (subject, text) = crate::mail::notice_words(
            &account.lang,
            &account.email,
            &crate::log::stamp(),
            &from,
            NOTICE_AFTER,
        );
        mail.send(&account.email, &subject, &text).await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_email_is_masked_to_one_word_whatever_was_typed() {
        assert_eq!(masked("Ana@Example.org"), "a***@example.org");
        assert_eq!(masked("  ana@example.org "), "a***@example.org");
        assert_eq!(masked("no-at-all"), "***");
        assert_eq!(masked("ana@"), "***");
        assert_eq!(masked("_x@example.org"), "****@example.org");
        // A request's own words never reach the line as sent.
        let forged =
            masked("a@b (1 in a row)\n2026-10-13T12:00:00Z WARN sign-in failed from 9.9.9.9");
        assert!(!forged.contains([' ', '\n', '(', ')', ':']), "{forged}");
        assert!(masked(&format!("a@{}", "x".repeat(500))).len() < 80);
    }

    #[test]
    fn twenty_refusals_within_the_hour_tell_the_account_once_a_day() {
        let w = Watch::default();
        let start = Instant::now();
        let at = |s: u64| start + Duration::from_secs(s);
        // Nineteen, an hour and more apart from the twentieth: not yet.
        for i in 0..19 {
            assert_eq!(w.against("acc", "203.0.113.9", at(i)), None);
        }
        assert_eq!(w.against("acc", "198.51.100.1", at(3700)), None);
        // Twenty within the hour, from two addresses: told, with both.
        for i in 0..18 {
            assert_eq!(w.against("acc", "203.0.113.9", at(3701 + i)), None);
        }
        assert_eq!(
            w.against("acc", "203.0.113.9", at(3719)),
            Some(vec!["198.51.100.1".to_owned(), "203.0.113.9".to_owned()])
        );
        // The twenty-first, and the rest of the day: not again.
        assert_eq!(w.against("acc", "203.0.113.9", at(3720)), None);
        for i in 0..40 {
            assert_eq!(w.against("acc", "203.0.113.9", at(7200 + i)), None);
        }
        // Another account counts on its own.
        assert_eq!(w.against("other", "203.0.113.9", at(3721)), None);
        // A day later, twenty more tell it again.
        let later = 3719 + 86_400;
        for i in 0..19 {
            assert_eq!(w.against("acc", "203.0.113.9", at(later + i)), None);
        }
        assert!(w.against("acc", "203.0.113.9", at(later + 19)).is_some());
    }

    #[test]
    fn past_the_servers_pace_of_refusals_every_sign_in_waits_its_turn() {
        let w = Watch::default();
        assert_eq!(w.turn(), Duration::ZERO);
        for _ in 0..(FAILED_BURST as usize) {
            w.failed("203.0.113.9", Some("a@pace.example"));
        }
        assert_eq!(
            w.turn(),
            Duration::ZERO,
            "fifty at once are within the pace"
        );
        for _ in 0..1000 {
            w.failed("203.0.113.9", Some("a@pace.example"));
        }
        let turn = w.turn();
        assert!(
            turn > Duration::from_millis(1500) && turn <= TURN_MOST,
            "{turn:?}"
        );
    }

    #[test]
    fn the_count_in_a_row_starts_again_after_a_success() {
        let w = Watch::default();
        assert_eq!(w.failed("203.0.113.9", Some("a@watch.example")), 1);
        assert_eq!(w.failed("198.51.100.1", Some("A@Watch.example")), 2);
        assert_eq!(w.failed("203.0.113.9", None), 1);
        w.succeeded("203.0.113.9", Some("a@watch.example"));
        assert_eq!(w.failed("203.0.113.9", Some("a@watch.example")), 1);
        assert_eq!(w.failed("203.0.113.9", None), 2);
        assert_eq!(
            failed_line("2001:db8:1:2::/64", "a***@example.org", 3),
            "sign-in failed from 2001:db8:1:2::/64 for a***@example.org (3 in a row)"
        );
    }
}
