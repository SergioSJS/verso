// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Pairing a phone (ADR 0096 item 6), as a state machine with no network
//! and no clock of its own, so that every refusal is a unit test.
//!
//! The laptop opens a *window* — the pairing dialog — which holds one
//! token of 256 bits and a short code that reads it aloud. The token is
//! single use and lives two minutes, while the dialog is open; three wrong
//! or reused attempts close the window; at most one pairing waits for the
//! laptop's answer at a time. A phone that presents the token does not get
//! in: it becomes a *pending* pairing, and the person at the laptop sees
//! its name, address and time and chooses Allow (with a role) or Refuse.
//! Only Allow makes a session.

use std::time::{Duration, Instant};

use crate::crypto;

/// How long a window lives while the dialog is open.
pub const WINDOW: Duration = Duration::from_secs(120);

/// Wrong or reused attempts that close the window.
pub const FAILURES: u32 = 3;

/// How long the answer to an allowed or refused pairing waits for the
/// phone to collect it; after that its session, if any, is ended.
pub const COLLECT: Duration = Duration::from_secs(60);

/// Letters a person reads without mistaking one for another (the device
/// code's alphabet, `crate::device`).
const ALPHABET: &[u8] = b"BCDFGHJKLMNPQRSTVWXZ";

/// A session made when the laptop allowed a pairing, handed once to the
/// phone that asked.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ready {
    pub token: String,
    pub csrf: String,
    pub session: String,
}

/// Why a window ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ended {
    /// The person closed the dialog.
    Closed,
    /// Two minutes passed.
    Expired,
    /// Three wrong or reused attempts.
    TooManyFailures,
    /// The token was used, and the laptop answered.
    Answered,
}

/// The window the dialog holds open.
struct Window {
    token: Vec<u8>,
    code: String,
    opened: Instant,
    failures: u32,
    spent: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Answer {
    Waiting,
    Allowed(Ready),
    Refused,
}

/// A phone's request and what the laptop answered.
struct Request {
    poll: Vec<u8>,
    device: String,
    address: String,
    asked: String,
    /// It came through the internet link (ADR 0117 D5), not the network.
    link: bool,
    at: Instant,
    answer: Answer,
}

/// What the laptop shows when it asks "Was it you?".
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct PendingView {
    pub device: String,
    pub address: String,
    pub asked: String,
    /// It came through the internet link (ADR 0117 D5): the address is the
    /// one the tunnel forwarded, and the question says so.
    pub link: bool,
}

/// The token and the code a new window shows, once.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Opened {
    pub token: String,
    pub code: String,
    pub expires_in: Duration,
}

/// What a phone presenting a token or a code gets.
#[derive(Debug, PartialEq, Eq)]
pub enum Redeemed {
    /// The laptop is asked; the phone polls with this secret.
    Asked { poll: String },
    /// No window is open: the route answers as an unknown route does.
    Closed,
    /// Wrong, reused or too late: one answer for all, so that nothing is
    /// learnt from which. `ended` is set when this attempt closed the
    /// window (the third).
    Refused { ended: Option<Ended> },
}

/// What a phone polling for the answer gets.
#[derive(Debug, PartialEq, Eq)]
pub enum Polled {
    Waiting,
    Allowed(Ready),
    Refused,
    /// Unknown, expired or already collected.
    Gone,
}

#[derive(Default)]
pub struct Pairing {
    window: Option<Window>,
    requests: Vec<Request>,
}

fn new_code() -> Result<String, String> {
    let mut bytes = [0_u8; 8];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    let letters: String = bytes
        .iter()
        .map(|b| char::from(ALPHABET[usize::from(*b) % ALPHABET.len()]))
        .collect();
    Ok(format!("{}-{}", &letters[..4], &letters[4..]))
}

/// A code as a person typed it: spaces and the dash dropped, upper case.
fn read_code(text: &str) -> Option<String> {
    let letters: String = text
        .chars()
        .take(64)
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| c.to_ascii_uppercase())
        .collect();
    (letters.len() == 8 && letters.bytes().all(|b| ALPHABET.contains(&b)))
        .then(|| format!("{}-{}", &letters[..4], &letters[4..]))
}

impl Pairing {
    /// Open a window (replacing one that is open): a token, a code, two
    /// minutes.
    pub fn open(&mut self, now: Instant) -> Result<Opened, String> {
        let token = crypto::token()?;
        let code = new_code()?;
        self.window = Some(Window {
            token: crypto::hash(&token),
            code: code.clone(),
            opened: now,
            failures: 0,
            spent: false,
        });
        Ok(Opened {
            token,
            code,
            expires_in: WINDOW,
        })
    }

    /// Close the window (the dialog was closed): nothing about pairing is
    /// reachable until the next `open`. A request waiting for the laptop is
    /// refused with it.
    pub fn close(&mut self) {
        self.window = None;
        for r in &mut self.requests {
            if r.answer == Answer::Waiting {
                r.answer = Answer::Refused;
            }
        }
    }

    /// Whether a window is open at `now`; one past its two minutes is
    /// ended here, and says so.
    pub fn is_open(&mut self, now: Instant) -> bool {
        self.expire(now).is_none() && self.window.is_some()
    }

    /// A window past its time ended; `Some(Expired)` when this call did it.
    pub fn expire(&mut self, now: Instant) -> Option<Ended> {
        if self
            .window
            .as_ref()
            .is_some_and(|w| now.saturating_duration_since(w.opened) >= WINDOW)
        {
            self.close();
            return Some(Ended::Expired);
        }
        None
    }

    /// Whether there is nothing of pairing at all: no window, no phone
    /// waiting, no answer left to collect. Its routes then answer as
    /// unknown routes do.
    #[must_use]
    pub fn idle(&self) -> bool {
        self.window.is_none() && self.requests.is_empty()
    }

    /// Seconds the window still has; none when it is closed.
    pub fn remaining(&self, now: Instant) -> Option<Duration> {
        self.window
            .as_ref()
            .map(|w| WINDOW.saturating_sub(now.saturating_duration_since(w.opened)))
    }

    /// A phone presents `presented` — the token from the QR's fragment, or
    /// the code typed by hand — on the network, or through the internet
    /// link when `link` (ADR 0117 D5): the same window, the same three
    /// attempts, counted for the window and not per address.
    pub fn redeem(
        &mut self,
        presented: &str,
        device: &str,
        address: &str,
        asked: &str,
        link: bool,
        now: Instant,
    ) -> Result<Redeemed, String> {
        if self.expire(now).is_some() {
            return Ok(Redeemed::Closed);
        }
        let Some(window) = self.window.as_mut() else {
            return Ok(Redeemed::Closed);
        };
        let by_token = crypto::same(&crypto::hash(presented), &window.token);
        let by_code = read_code(presented)
            .is_some_and(|c| crypto::same(c.as_bytes(), window.code.as_bytes()));
        if (by_token || by_code) && !window.spent {
            window.spent = true;
            let poll = crypto::token()?;
            self.requests.push(Request {
                poll: crypto::hash(&poll),
                device: device.to_owned(),
                address: address.to_owned(),
                asked: asked.to_owned(),
                link,
                at: now,
                answer: Answer::Waiting,
            });
            return Ok(Redeemed::Asked { poll });
        }
        // Wrong, or right but used: both count (item 6, point 4).
        window.failures += 1;
        let closing = window.failures >= FAILURES;
        if closing {
            self.close();
        }
        Ok(Redeemed::Refused {
            ended: closing.then_some(Ended::TooManyFailures),
        })
    }

    /// What the laptop is asked, when a phone is waiting for it.
    #[must_use]
    pub fn pending(&self) -> Option<PendingView> {
        self.requests
            .iter()
            .find(|r| r.answer == Answer::Waiting)
            .map(|r| PendingView {
                device: r.device.clone(),
                address: r.address.clone(),
                asked: r.asked.clone(),
                link: r.link,
            })
    }

    /// The laptop's answer: `Some(ready)` allows (the session was made by
    /// the caller), `None` refuses. False when nothing waits. A window whose
    /// token was used is answered and done: it ends.
    pub fn answer(&mut self, ready: Option<Ready>) -> bool {
        let Some(r) = self
            .requests
            .iter_mut()
            .find(|r| r.answer == Answer::Waiting)
        else {
            return false;
        };
        r.answer = ready.map_or(Answer::Refused, Answer::Allowed);
        // The token is spent and the question answered: the window has
        // nothing more to offer.
        self.window = None;
        true
    }

    /// A phone asks whether the laptop answered.
    pub fn poll(&mut self, secret: &str, now: Instant) -> Polled {
        let hash = crypto::hash(secret);
        let Some(at) = self
            .requests
            .iter()
            .position(|r| crypto::same(&r.poll, &hash))
        else {
            return Polled::Gone;
        };
        if self.requests[at].answer == Answer::Waiting {
            // A window gone with no answer is a refusal (`close`); one
            // still open waits.
            if self.window.is_none() {
                self.requests.remove(at);
                return Polled::Refused;
            }
            return Polled::Waiting;
        }
        let r = self.requests.remove(at);
        let _ = now;
        match r.answer {
            Answer::Allowed(ready) => Polled::Allowed(ready),
            _ => Polled::Refused,
        }
    }

    /// Answers the phone never collected, past [`COLLECT`]: removed, and
    /// the sessions they made are returned for the caller to end.
    pub fn sweep(&mut self, now: Instant) -> Vec<String> {
        let mut ended = Vec::new();
        self.requests.retain(|r| {
            let old = now.saturating_duration_since(r.at) >= WINDOW + COLLECT;
            if old && let Answer::Allowed(ready) = &r.answer {
                ended.push(ready.session.clone());
            }
            !old
        });
        ended
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t0() -> Instant {
        Instant::now()
    }

    fn open() -> (Pairing, Opened, Instant) {
        let now = t0();
        let mut p = Pairing::default();
        let o = p.open(now).unwrap();
        (p, o, now)
    }

    fn ask(p: &mut Pairing, presented: &str, now: Instant) -> Redeemed {
        p.redeem(
            presented,
            "iPhone",
            "192.168.1.9",
            "2026-10-15T10:00:00Z",
            false,
            now,
        )
        .unwrap()
    }

    fn ready() -> Ready {
        Ready {
            token: "t".into(),
            csrf: "c".into(),
            session: "s".into(),
        }
    }

    /// The token is 256 bits and the code reads eight letters of the
    /// device alphabet.
    #[test]
    fn a_window_holds_a_long_token_and_a_short_code() {
        let (_, o, _) = open();
        assert_eq!(o.token.len(), 43, "256 bits, base64");
        assert_eq!(o.code.len(), 9);
        assert!(
            o.code
                .chars()
                .all(|c| c == '-' || ALPHABET.contains(&(c as u8)))
        );
        assert_eq!(o.expires_in, Duration::from_secs(120));
    }

    /// The token redeems once: a phone that presents it is asked about, not
    /// let in, and the same token again is refused and counted.
    #[test]
    fn a_token_is_single_use() {
        let (mut p, o, now) = open();
        let Redeemed::Asked { poll } = ask(&mut p, &o.token, now) else {
            panic!("the first use is asked about");
        };
        assert_eq!(p.pending().unwrap().device, "iPhone");
        assert_eq!(
            ask(&mut p, &o.token, now),
            Redeemed::Refused { ended: None },
            "the second use of the same token"
        );
        assert_eq!(
            ask(&mut p, &o.code, now),
            Redeemed::Refused { ended: None },
            "the code is the same secret, used already"
        );
        // The first phone still has its question.
        assert_eq!(p.poll(&poll, now), Polled::Waiting);
    }

    /// The code typed by hand opens the same door, once, in any case and
    /// with or without its dash.
    #[test]
    fn the_typed_code_redeems_like_the_token() {
        let (mut p, o, now) = open();
        let typed = o.code.to_lowercase().replace('-', " ");
        assert!(matches!(ask(&mut p, &typed, now), Redeemed::Asked { .. }));
    }

    /// Two minutes, and not a second more: a token presented at the end of
    /// its time is refused, and the window is gone.
    #[test]
    fn a_token_expires_after_two_minutes() {
        let (mut p, o, now) = open();
        let late = now + WINDOW;
        assert_eq!(ask(&mut p, &o.token, late), Redeemed::Closed);
        assert!(!p.is_open(late));
        // And just before, it was good.
        let (mut p, o, now) = open();
        let almost = now + WINDOW - Duration::from_secs(1);
        assert!(matches!(
            ask(&mut p, &o.token, almost),
            Redeemed::Asked { .. }
        ));
    }

    /// Three wrong attempts close the window, and the right token after
    /// them gets nothing: it answers as an unknown route.
    #[test]
    fn three_wrong_attempts_close_the_window() {
        let (mut p, o, now) = open();
        assert_eq!(
            ask(&mut p, "not-the-token", now),
            Redeemed::Refused { ended: None }
        );
        assert_eq!(
            ask(&mut p, "ABCD-EFGH", now),
            Redeemed::Refused { ended: None }
        );
        assert_eq!(
            ask(&mut p, "", now),
            Redeemed::Refused {
                ended: Some(Ended::TooManyFailures)
            }
        );
        assert!(!p.is_open(now));
        assert_eq!(ask(&mut p, &o.token, now), Redeemed::Closed);
        assert!(p.pending().is_none());
    }

    /// A reused token counts among the three, and so does a right one
    /// presented after another phone was asked.
    #[test]
    fn reuse_counts_toward_the_three() {
        let (mut p, o, now) = open();
        assert!(matches!(ask(&mut p, &o.token, now), Redeemed::Asked { .. }));
        ask(&mut p, &o.token, now);
        ask(&mut p, &o.token, now);
        assert_eq!(
            ask(&mut p, &o.token, now),
            Redeemed::Refused {
                ended: Some(Ended::TooManyFailures)
            }
        );
    }

    /// Nothing is reachable with no dialog open.
    #[test]
    fn with_no_window_nothing_is_reachable() {
        let mut p = Pairing::default();
        assert_eq!(ask(&mut p, "anything", t0()), Redeemed::Closed);
        let (mut p, o, now) = open();
        p.close();
        assert_eq!(ask(&mut p, &o.token, now), Redeemed::Closed);
    }

    /// Only Allow makes the phone ready; Refuse ends the token for good.
    #[test]
    fn only_allow_lets_the_phone_in() {
        let (mut p, o, now) = open();
        let Redeemed::Asked { poll } = ask(&mut p, &o.token, now) else {
            panic!()
        };
        assert_eq!(p.poll(&poll, now), Polled::Waiting);
        assert!(p.answer(Some(ready())));
        assert_eq!(p.poll(&poll, now), Polled::Allowed(ready()));
        assert_eq!(p.poll(&poll, now), Polled::Gone, "collected once");

        let (mut p, o, now) = open();
        let Redeemed::Asked { poll } = ask(&mut p, &o.token, now) else {
            panic!()
        };
        assert!(p.answer(None));
        assert_eq!(p.poll(&poll, now), Polled::Refused);
        assert_eq!(p.poll(&poll, now), Polled::Gone);
        assert_eq!(
            ask(&mut p, &o.token, now),
            Redeemed::Closed,
            "the token is over"
        );
    }

    /// A secret that is not a pending request's finds nothing.
    #[test]
    fn a_wrong_poll_secret_finds_nothing() {
        let (mut p, o, now) = open();
        assert!(matches!(ask(&mut p, &o.token, now), Redeemed::Asked { .. }));
        assert_eq!(p.poll("not-the-secret", now), Polled::Gone);
        assert_eq!(p.poll("", now), Polled::Gone);
    }

    /// Closing the dialog while a phone waits refuses it.
    #[test]
    fn closing_the_dialog_refuses_the_phone_that_waits() {
        let (mut p, o, now) = open();
        let Redeemed::Asked { poll } = ask(&mut p, &o.token, now) else {
            panic!()
        };
        p.close();
        assert!(p.pending().is_none());
        assert!(!p.answer(Some(ready())), "nothing waits any more");
        assert_eq!(p.poll(&poll, now), Polled::Refused);
    }

    /// An answer the phone never collected ends its session.
    #[test]
    fn an_answer_not_collected_is_swept_with_its_session() {
        let (mut p, o, now) = open();
        assert!(matches!(ask(&mut p, &o.token, now), Redeemed::Asked { .. }));
        assert!(p.answer(Some(ready())));
        assert!(p.sweep(now + WINDOW).is_empty(), "still waiting for it");
        assert_eq!(p.sweep(now + WINDOW + COLLECT), vec!["s".to_owned()]);
        assert!(p.sweep(now + WINDOW + COLLECT).is_empty());
    }

    /// Opening again replaces the window: the old token is dead.
    #[test]
    fn a_new_window_kills_the_old_token() {
        let (mut p, old, now) = open();
        let new = p.open(now).unwrap();
        assert_ne!(old.token, new.token);
        assert_eq!(
            ask(&mut p, &old.token, now),
            Redeemed::Refused { ended: None }
        );
        assert!(matches!(
            ask(&mut p, &new.token, now),
            Redeemed::Asked { .. }
        ));
    }
}
