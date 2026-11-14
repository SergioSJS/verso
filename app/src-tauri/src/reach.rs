// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A server that cannot be reached, told apart from one that answered
//! with a refusal (the maintainer, 2026-10-14, with the server down: the
//! window said nothing, and the log had two ERROR lines per click — "por
//! que não tem uma mensagem dizendo que o servidor não foi encontrado?").
//! A request that made no connection — refused, no such name, a TLS
//! handshake that failed — or got no answer in time is the contract's
//! `unreachable`, carrying the server's address; the log says why, at
//! WARN, once a minute per server, not at ERROR on every try. And a sync,
//! or a window on a server's folder, that tries again waits longer each
//! time (`Backoff`, `redial`), and tries at once when the person asks.

use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use super::*;

/// How often one server out of reach is written to the log.
const SAY_EVERY: Duration = Duration::from_secs(60);

/// When each server out of reach was last written to the log.
static SAID: Mutex<BTreeMap<String, Instant>> = Mutex::new(BTreeMap::new());

/// The server's address as the window names it: `host[:port]`, without
/// the scheme or a path.
pub(crate) fn address(url: &str) -> String {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    rest.split('/').next().unwrap_or(rest).to_owned()
}

/// Whether `last`, when the server was last said, leaves it to be said
/// again `now`; recorded when it does.
fn due(said: &mut BTreeMap<String, Instant>, url: &str, now: Instant) -> bool {
    match said.get(url) {
        Some(at) if now.duration_since(*at) < SAY_EVERY => false,
        _ => {
            said.insert(url.to_owned(), now);
            true
        }
    }
}

/// The server at `url` could not be reached, for `cause`: said in the log
/// at WARN once a minute, and as the contract's `unreachable`. When the
/// name was resolved to addresses (dns.rs, ADR 0097) the message names
/// them, so a bad DNS reads as one: the first line is the address, each
/// line after it an IP that was tried.
pub(crate) fn unreachable(url: &str, cause: &str) -> ContractError {
    let host = reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned));
    let mut tried = host.as_deref().map(dns::failed).unwrap_or_default();
    // `localhost` that does not answer is a server that is down, not a DNS
    // that is wrong: nothing to name.
    if tried.iter().all(|c| c.ip.is_loopback()) {
        tried.clear();
    }
    if due(&mut lock(&SAID), url, Instant::now()) {
        let said = match &host {
            Some(h) if !tried.is_empty() => format!(" [{}: no answer]", dns::describe(h, &tried)),
            _ => String::new(),
        };
        log::write(
            "WARN",
            "host",
            &format!("unreachable: the server at {url}: {cause}{said}"),
        );
    }
    let mut message = address(url);
    for t in &tried {
        message.push('\n');
        message.push_str(&t.ip.to_string());
    }
    ContractError {
        kind: ErrorKind::Unreachable,
        message,
    }
}

/// The error and every cause under it, as one line: reqwest's own text
/// names only the address ("error sending request for url (…)"); the
/// cause under it says what happened ("Connection refused").
fn chain(e: &dyn std::error::Error) -> String {
    let mut line = e.to_string();
    let mut under = e.source();
    while let Some(c) = under {
        line.push_str(": ");
        line.push_str(&c.to_string());
        under = c.source();
    }
    line
}

/// A request to the server at `url` that got no answer: unreachable when
/// no connection was made or none came in time, failed otherwise.
pub(crate) fn unsent(url: &str, e: &reqwest::Error) -> ContractError {
    if e.is_connect() || e.is_timeout() {
        unreachable(url, &chain(e))
    } else {
        failed(chain(e))
    }
}

/// A WebSocket to the server at `url` that did not open: unreachable when
/// no connection was made, failed otherwise.
pub(crate) fn not_dialed(url: &str, e: &tokio_tungstenite::tungstenite::Error) -> ContractError {
    use tokio_tungstenite::tungstenite::Error as W;
    use tokio_tungstenite::tungstenite::error::UrlError;
    match e {
        W::Io(_) | W::Tls(_) | W::Url(UrlError::UnableToConnect(_)) => unreachable(url, &chain(e)),
        other => ContractError {
            kind: ErrorKind::Unavailable,
            message: other.to_string(),
        },
    }
}

/// How long a sync waits before it tries a server out of reach again: 5 s,
/// doubling to 5 min; back to the first after a success or when the
/// person asks (Sync now).
pub(crate) struct Backoff {
    first: Duration,
    longest: Duration,
    now: Duration,
}

/// The first wait and the longest. Shorter in the tests, which take a
/// server down and up again within seconds.
#[cfg(not(test))]
const WAITS: (Duration, Duration) = (Duration::from_secs(5), Duration::from_secs(300));
#[cfg(test)]
const WAITS: (Duration, Duration) = (Duration::from_millis(200), Duration::from_secs(5));

impl Backoff {
    pub(crate) fn new() -> Self {
        Self::within(WAITS.0, WAITS.1)
    }

    fn within(first: Duration, longest: Duration) -> Self {
        Self {
            first,
            longest,
            now: first,
        }
    }

    /// The wait before the next try; the one after it is twice as long.
    pub(crate) fn next(&mut self) -> Duration {
        let wait = self.now;
        self.now = (self.now * 2).min(self.longest);
        wait
    }

    pub(crate) fn reset(&mut self) {
        self.now = self.first;
    }
}

/// What ended a wait: its time, or the person asking to try now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Woken {
    Elapsed,
    Asked,
}

/// One try at a server: done, to be tried again, or no longer wanted.
pub(crate) enum Step<T> {
    Done(T),
    Again,
    Stop,
}

/// Try until done or no longer wanted: a wait, then a try, the waits
/// growing as `backoff` says; a wait the person ends (`Woken::Asked`) is
/// tried at once, and the waits start over. `wait` is the clock — the
/// tests give a fake one.
pub(crate) async fn redial<T, A, AF, W, WF>(
    mut backoff: Backoff,
    mut attempt: A,
    mut wait: W,
) -> Option<T>
where
    A: FnMut() -> AF,
    AF: std::future::Future<Output = Step<T>>,
    W: FnMut(Duration) -> WF,
    WF: std::future::Future<Output = Woken>,
{
    loop {
        if wait(backoff.next()).await == Woken::Asked {
            backoff.reset();
        }
        match attempt().await {
            Step::Done(t) => return Some(t),
            Step::Stop => return None,
            Step::Again => {}
        }
    }
}

/// Each window's reconnection waiting, by the window's label: the person's
/// "Tentar de novo", or their opening the same folder again, ends its wait.
static ASKED: Mutex<BTreeMap<String, Arc<tokio::sync::Notify>>> = Mutex::new(BTreeMap::new());

/// The window's reconnection is waiting: what ends its wait.
pub(crate) fn waiting(label: &str) -> Arc<tokio::sync::Notify> {
    Arc::clone(lock(&ASKED).entry(label.to_owned()).or_default())
}

/// The window's reconnection is over.
pub(crate) fn done_waiting(label: &str, asked: &Arc<tokio::sync::Notify>) {
    let mut all = lock(&ASKED);
    if all.get(label).is_some_and(|n| Arc::ptr_eq(n, asked)) {
        all.remove(label);
    }
}

/// The person asks the window's reconnection to try now; nothing when the
/// window is not reconnecting.
pub(crate) fn try_now(label: &str) {
    if let Some(n) = lock(&ASKED).get(label) {
        n.notify_one();
    }
}

/// The real clock: `d`, or less when the person asks.
pub(crate) async fn wait_or_asked(d: Duration, asked: Arc<tokio::sync::Notify>) -> Woken {
    tokio::select! {
        () = tokio::time::sleep(d) => Woken::Elapsed,
        () = asked.notified() => Woken::Asked,
    }
}

/// The log's level for a server's answer that is not a success: what it
/// refused of what was asked (a 4xx) is an answer, said at INFO; its own
/// fault (a 5xx, or anything else) an ERROR.
pub(crate) fn level_of_answer(status: u16) -> &'static str {
    if (400..500).contains(&status) {
        "INFO"
    } else {
        "ERROR"
    }
}

/// A server's answer that is not a success, the contract's `failed`,
/// said in the log at its level ([`level_of_answer`]).
pub(crate) fn answered(status: u16, message: String) -> verso_contract::ContractError {
    crate::log::write(
        level_of_answer(status),
        "host",
        &format!("the server answered {status}: {message}"),
    );
    verso_service::failed(message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_refused_connection_is_unreachable_with_the_servers_address() {
        // A port nobody listens on: bound, then let go.
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let url = format!("http://127.0.0.1:{port}");
        let e = remote::http()
            .unwrap()
            .get(format!("{url}/api/folders"))
            .send()
            .unwrap_err();
        let said = unsent(&url, &e);
        assert_eq!(said.kind, ErrorKind::Unreachable);
        assert_eq!(said.message, format!("127.0.0.1:{port}"));
        // The kind crosses as the window reads it.
        assert_eq!(
            serde_json::to_value(&said).unwrap()["kind"],
            serde_json::json!("unreachable")
        );
    }

    /// The maintainer's case: the name resolved to 10.0.0.1 and nothing
    /// answered; the message names the address and every IP tried, so the
    /// window can say `universo.casa.exemplo → 10.0.0.1: sem resposta`.
    #[test]
    fn a_name_that_did_not_answer_says_which_addresses_were_tried() {
        let url = "https://universo.casa.exemplo.invalid";
        dns::pretend_offered(
            "universo.casa.exemplo.invalid",
            vec![
                dns::Candidate {
                    ip: "10.0.0.1".parse().unwrap(),
                    via: dns::Via::System,
                },
                dns::Candidate {
                    ip: "192.168.0.5".parse().unwrap(),
                    via: dns::Via::Server("192.168.0.2".parse().unwrap()),
                },
            ],
        );
        let said = unreachable(url, "operation timed out");
        assert_eq!(said.kind, ErrorKind::Unreachable);
        assert_eq!(
            said.message,
            "universo.casa.exemplo.invalid\n10.0.0.1\n192.168.0.5"
        );
        // A name never resolved here says the address alone.
        assert_eq!(
            unreachable("http://nunca.visto.invalid:7340", "x").message,
            "nunca.visto.invalid:7340"
        );
    }

    #[test]
    fn a_websocket_refused_is_unreachable_too() {
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let url = format!("http://127.0.0.1:{port}");
        let e = tauri::async_runtime::block_on(tokio_tungstenite::connect_async(format!(
            "ws://127.0.0.1:{port}/api/ws"
        )))
        .unwrap_err();
        let said = not_dialed(&url, &e);
        assert_eq!(said.kind, ErrorKind::Unreachable);
        assert_eq!(said.message, format!("127.0.0.1:{port}"));
    }

    #[test]
    fn the_address_is_host_and_port() {
        assert_eq!(address("http://localhost:7351"), "localhost:7351");
        assert_eq!(address("https://notas.casa"), "notas.casa");
        assert_eq!(address("https://notas.casa/api/folders"), "notas.casa");
    }

    #[test]
    fn a_server_out_of_reach_is_said_once_a_minute() {
        let mut said = BTreeMap::new();
        let t0 = Instant::now();
        assert!(due(&mut said, "http://a", t0));
        assert!(!due(&mut said, "http://a", t0 + Duration::from_secs(30)));
        // Another server is its own.
        assert!(due(&mut said, "http://b", t0 + Duration::from_secs(30)));
        assert!(due(&mut said, "http://a", t0 + Duration::from_secs(61)));
    }

    /// A window's reconnection, on a fake clock: the waits it asked for,
    /// and what each wait answered, scripted.
    fn schedule(fails: usize, woken: &[(usize, Woken)]) -> (Vec<u64>, Option<&'static str>) {
        let waits = std::cell::RefCell::new(Vec::new());
        let tries = std::cell::Cell::new(0_usize);
        let done = tauri::async_runtime::block_on(redial(
            Backoff::within(Duration::from_secs(5), Duration::from_secs(300)),
            || {
                tries.set(tries.get() + 1);
                let step = if tries.get() > fails {
                    Step::Done("back")
                } else {
                    Step::Again
                };
                async move { step }
            },
            |d| {
                let n = waits.borrow().len();
                waits.borrow_mut().push(d.as_secs());
                let w = woken
                    .iter()
                    .find(|(at, _)| *at == n)
                    .map_or(Woken::Elapsed, |(_, w)| *w);
                async move { w }
            },
        ));
        (waits.into_inner(), done)
    }

    #[test]
    fn a_window_tries_its_server_again_at_5_s_doubling_to_5_min() {
        let (waits, done) = schedule(9, &[]);
        assert_eq!(waits, [5, 10, 20, 40, 80, 160, 300, 300, 300, 300]);
        assert_eq!(done, Some("back"));
    }

    #[test]
    fn the_person_asking_tries_at_once_and_the_waits_start_over() {
        // The fifth wait (80 s) ended by "Tentar de novo": that try fails,
        // and the next wait is 5 s again.
        let (waits, done) = schedule(6, &[(4, Woken::Asked)]);
        assert_eq!(waits, [5, 10, 20, 40, 80, 5, 10]);
        assert_eq!(done, Some("back"));
    }

    #[test]
    fn a_window_that_moved_on_stops_trying() {
        let tries = std::cell::Cell::new(0);
        let done: Option<()> = tauri::async_runtime::block_on(redial(
            Backoff::within(Duration::from_secs(5), Duration::from_secs(300)),
            || {
                tries.set(tries.get() + 1);
                let step = if tries.get() == 3 {
                    Step::Stop
                } else {
                    Step::Again
                };
                async move { step }
            },
            |_| async { Woken::Elapsed },
        ));
        assert_eq!((done, tries.get()), (None, 3));
    }

    #[test]
    fn the_wait_doubles_to_five_minutes_and_starts_over() {
        // The app's own waits.
        let mut b = Backoff::within(Duration::from_secs(5), Duration::from_secs(300));
        let waits: Vec<u64> = (0..9).map(|_| b.next().as_secs()).collect();
        assert_eq!(waits, [5, 10, 20, 40, 80, 160, 300, 300, 300]);
        b.reset();
        assert_eq!(b.next(), Duration::from_secs(5));
    }
}
