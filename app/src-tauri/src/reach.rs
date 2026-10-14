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
//! WARN, once a minute per server, not at ERROR on every try. And a sync
//! that tries again waits longer each time (`Backoff`).

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
/// at WARN once a minute, and as the contract's `unreachable`.
pub(crate) fn unreachable(url: &str, cause: &str) -> ContractError {
    if due(&mut lock(&SAID), url, Instant::now()) {
        log::write(
            "WARN",
            "host",
            &format!("unreachable: the server at {url}: {cause}"),
        );
    }
    ContractError {
        kind: ErrorKind::Unreachable,
        message: address(url),
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
