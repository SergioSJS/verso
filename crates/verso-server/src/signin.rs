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

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use verso_service::lock;

/// The words that begin a refused sign-in's line, after the level.
pub const FAILED: &str = "sign-in failed from";

/// The keys kept at most, of the counts in a row and of the lines said:
/// filled by strangers (every e-mail typed), bounded as the delays are.
const KEYS: usize = 100_000;

/// How often a refusal of the per-key delay is said, per key.
const SAY_EVERY: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct Watch {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// Refusals in a row, by folded e-mail (or `device:<address>`), with
    /// the time of the last.
    in_a_row: HashMap<String, (u32, Instant)>,
    /// When each key's refusal by the delay was last said.
    said: HashMap<String, Instant>,
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
        {
            let mut inner = lock(&self.inner);
            if inner
                .said
                .get(key)
                .is_some_and(|at| at.elapsed() < SAY_EVERY)
            {
                return;
            }
            if !inner.said.contains_key(key) {
                crate::limit::make_room(&mut inner.said, KEYS, |at| *at);
            }
            inner.said.insert(key.to_owned(), Instant::now());
        }
        crate::log::warn(&format!("sign-in limited from {address}"));
    }
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
