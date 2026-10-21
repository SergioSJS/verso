// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The requests both adapters make: one client that follows no redirect
//! (credentials must not go where the person did not send them), a wait
//! that honours `Retry-After` on 429 and 503 and otherwise backs off with
//! jitter (ADR 0104 item 15), errors that never carry an address's
//! credentials, and a body streamed from the host's `Source` — never the
//! file whole in memory.

use std::io::{self, Read};
use std::sync::mpsc;
use std::time::Duration;

use reqwest::blocking::{Body, Client, RequestBuilder, Response};
use verso_core::sync::remote::{RemoteError, RemoteErrorKind, Result, Source};

const QUICK: Duration = Duration::from_secs(60);
const BULK: Duration = Duration::from_secs(6 * 3600);

/// How long to wait between tries when the service says nothing: the first
/// wait, the longest, and how many tries in all.
#[derive(Debug, Clone, Copy)]
pub struct Backoff {
    pub base: Duration,
    pub cap: Duration,
    pub tries: u32,
}

impl Default for Backoff {
    fn default() -> Self {
        Self {
            base: Duration::from_millis(500),
            cap: Duration::from_secs(60),
            tries: 6,
        }
    }
}

impl Backoff {
    /// The wait before try `n` (from 1) when the service gave none:
    /// exponential, with up to a full wait added as jitter, never past the
    /// cap.
    #[must_use]
    pub fn wait(&self, n: u32) -> Duration {
        let exp = self
            .base
            .saturating_mul(1_u32 << n.min(16).saturating_sub(1));
        let jitter =
            Duration::from_nanos(u64::from(clock_nanos()) % (exp.as_nanos().max(1) as u64));
        exp.saturating_add(jitter).min(self.cap)
    }
}

fn clock_nanos() -> u32 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.subsec_nanos())
}

/// One client and its manners.
pub struct Http {
    client: Option<Client>,
    pub backoff: Backoff,
}

impl Drop for Http {
    /// A blocking client panics when it is dropped inside a runtime's
    /// task; the host drops a link there. It is dropped on a thread of its
    /// own instead.
    fn drop(&mut self) {
        if let Some(client) = self.client.take() {
            std::thread::spawn(move || drop(client));
        }
    }
}

impl Http {
    /// A client with no redirects, a connect timeout and a read timeout
    /// (a transfer has none overall: a gigabyte takes as long as it takes).
    ///
    /// # Errors
    /// [`RemoteErrorKind::Failed`] when the client cannot be built.
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            // A transfer takes as long as it takes (a gigabyte over a slow
            // line is hours); every request that is not one carries a
            // minute's limit of its own (`request`).
            .timeout(BULK)
            .user_agent(concat!("Verso/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| RemoteError::new(RemoteErrorKind::Failed, e.without_url().to_string()))?;
        Ok(Self {
            client: Some(client),
            backoff: Backoff::default(),
        })
    }

    fn client(&self) -> Client {
        // Taken only by `drop`, after which nothing is asked of it.
        self.client.clone().unwrap_or_default()
    }

    /// A request that answers in a minute or fails: a listing, a check, a
    /// delete.
    pub fn request(&self, method: &str, url: &str) -> RequestBuilder {
        let method = reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET);
        self.client().request(method, url).timeout(QUICK)
    }

    /// A request that carries a file, either way.
    pub fn bulk(request: RequestBuilder) -> RequestBuilder {
        request.timeout(BULK)
    }

    /// One try of `request`, no more: a redirect is not followed, it is
    /// an error that says where the service wants to be asked.
    ///
    /// # Errors
    /// [`RemoteErrorKind::Unreachable`] when nothing answered.
    pub fn once(&self, request: RequestBuilder) -> Result<Response> {
        let response = request.send().map_err(unreachable)?;
        let status = response.status().as_u16();
        if (300..400).contains(&status) {
            let to = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("another address");
            return Err(RemoteError::new(
                RemoteErrorKind::Refused,
                format!(
                    "the service moved this address (to {}): use the address it moved to",
                    host_of(to)
                ),
            ));
        }
        Ok(response)
    }

    /// Whether the service said to slow down (429, 503).
    #[must_use]
    pub fn throttled(response: &Response) -> bool {
        matches!(response.status().as_u16(), 429 | 503)
    }

    /// Wait before try `n + 1`, as long as the service asked or the
    /// backoff says.
    ///
    /// # Errors
    /// [`RemoteErrorKind::RateLimited`] when `n` was the last try.
    pub fn pause(&self, response: &Response, n: u32) -> Result<()> {
        let asked = retry_after(response);
        if n >= self.backoff.tries {
            return Err(RemoteError::new(
                RemoteErrorKind::RateLimited(asked),
                "the service asked to slow down",
            ));
        }
        let wait = asked.map_or_else(
            || self.backoff.wait(n),
            |s| Duration::from_secs(s).min(self.backoff.cap),
        );
        std::thread::sleep(wait);
        Ok(())
    }

    /// Send the request `build` makes, again — a fresh one each time —
    /// when the service says 429 or 503, after the wait it asks for or the
    /// backoff's.
    ///
    /// # Errors
    /// As [`Http::once`] and [`Http::pause`].
    pub fn send(&self, build: &mut dyn FnMut() -> Result<RequestBuilder>) -> Result<Response> {
        let mut n = 0;
        loop {
            n += 1;
            let response = self.once(build()?)?;
            if Self::throttled(&response) {
                self.pause(&response, n)?;
                continue;
            }
            return Ok(response);
        }
    }

    /// Send a request whose body is `size` bytes streamed from `source`,
    /// again — the source rewound — when the service says to slow down.
    ///
    /// # Errors
    /// As [`Http::send`], and the source's own failure.
    pub fn upload(
        &self,
        source: &mut dyn Source,
        size: u64,
        build: &mut dyn FnMut(Body) -> Result<RequestBuilder>,
    ) -> Result<Response> {
        let mut n = 0;
        loop {
            n += 1;
            source.rewind()?;
            let (response, failed) = streamed(source, size, |body| {
                build(body).and_then(|request| self.once(request))
            });
            if let Some(e) = failed {
                return Err(e);
            }
            let response = response?;
            if Self::throttled(&response) {
                self.pause(&response, n)?;
                continue;
            }
            return Ok(response);
        }
    }
}

/// `Retry-After` in seconds, when it is a number of them.
fn retry_after(response: &Response) -> Option<u64> {
    response
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse().ok())
}

/// A transport failure, said without the address's credentials or query.
#[must_use]
pub fn unreachable(e: reqwest::Error) -> RemoteError {
    let e = e.without_url();
    let mut why = e.to_string();
    let mut source = std::error::Error::source(&e);
    while let Some(s) = source {
        why.push_str(": ");
        why.push_str(&s.to_string());
        source = s.source();
    }
    RemoteError::new(RemoteErrorKind::Unreachable, why)
}

/// The host (and port) of an address, to say where without the rest.
#[must_use]
pub fn host_of(address: &str) -> String {
    reqwest::Url::parse(address)
        .ok()
        .and_then(|u| {
            u.host_str()
                .map(|h| u.port().map_or(h.to_owned(), |p| format!("{h}:{p}")))
        })
        .unwrap_or_else(|| "another address".to_owned())
}

/// Whether `url` is an address on this computer or the local network: the
/// only place plain HTTP may go, and only when the person confirmed it
/// (ADR 0104 item 6).
#[must_use]
pub fn is_local(url: &reqwest::Url) -> bool {
    use std::net::IpAddr;
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = host.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(a) => a.is_loopback() || a.is_private() || a.is_link_local(),
            IpAddr::V6(a) => {
                let first = a.segments()[0];
                a.is_loopback() || (first & 0xfe00) == 0xfc00 || (first & 0xffc0) == 0xfe80
            }
        };
    }
    let lower = host.to_lowercase();
    lower == "localhost"
        || lower.ends_with(".localhost")
        || lower.ends_with(".local")
        || lower.ends_with(".lan")
        || lower.ends_with(".home.arpa")
        || !lower.contains('.')
}

/// Whether the person may be sent to `url` with a password: HTTPS always;
/// plain HTTP only to a local address they confirmed.
///
/// # Errors
/// [`RemoteErrorKind::Refused`] with the reason, when not.
pub fn check_transport(url: &reqwest::Url, plain_http_confirmed: bool) -> Result<()> {
    match url.scheme() {
        "https" => Ok(()),
        "http" if is_local(url) && plain_http_confirmed => Ok(()),
        "http" if is_local(url) => Err(RemoteError::new(
            RemoteErrorKind::Refused,
            "plain HTTP on the local network needs the person's confirmation",
        )
        .detailed("plain_http_unconfirmed")),
        "http" => Err(RemoteError::new(
            RemoteErrorKind::Refused,
            "a password does not go over plain HTTP outside the local network: use an https:// address",
        )
        .detailed("plain_http_refused")),
        _ => Err(RemoteError::new(
            RemoteErrorKind::Refused,
            "the address must start with https://",
        )),
    }
}

/// The bytes of a request body, handed over by the thread that reads the
/// host's [`Source`].
struct Pipe {
    rx: mpsc::Receiver<io::Result<Vec<u8>>>,
    piece: Vec<u8>,
    at: usize,
}

impl Read for Pipe {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        while self.at >= self.piece.len() {
            match self.rx.recv() {
                Ok(Ok(next)) => {
                    self.piece = next;
                    self.at = 0;
                }
                Ok(Err(e)) => return Err(e),
                Err(_) => return Ok(0),
            }
        }
        let n = buf.len().min(self.piece.len() - self.at);
        buf[..n].copy_from_slice(&self.piece[self.at..self.at + n]);
        self.at += n;
        Ok(n)
    }
}

/// Run `run` with a request body of `size` bytes streamed from `source`,
/// a piece at a time. Returns what `run` returned and, if the source
/// failed meanwhile, that failure — the request, too, fails then.
pub fn streamed<T>(
    source: &mut dyn Source,
    size: u64,
    run: impl FnOnce(Body) -> T,
) -> (T, Option<RemoteError>) {
    let (tx, rx) = mpsc::sync_channel::<io::Result<Vec<u8>>>(2);
    std::thread::scope(|scope| {
        let feeder = scope.spawn(move || {
            loop {
                match source.next() {
                    Ok(Some(piece)) => {
                        if tx.send(Ok(piece)).is_err() {
                            return None;
                        }
                    }
                    Ok(None) => return None,
                    Err(e) => {
                        let _ = tx.send(Err(io::Error::other("this computer's file failed")));
                        return Some(e);
                    }
                }
            }
        });
        let body = Body::sized(
            Pipe {
                rx,
                piece: Vec::new(),
                at: 0,
            },
            size,
        );
        let out = run(body);
        let failed = feeder.join().ok().flatten();
        (out, failed)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local(url: &str) -> bool {
        is_local(&reqwest::Url::parse(url).unwrap())
    }

    #[test]
    fn local_addresses_are_told_from_the_internet() {
        assert!(local("http://localhost:8080/dav"));
        assert!(local("http://127.0.0.1/"));
        assert!(local("http://192.168.0.20/"));
        assert!(local("http://10.0.0.5/"));
        assert!(local("http://172.16.4.1/"));
        assert!(local("http://[::1]:9000/"));
        assert!(local("http://nas.local/dav"));
        assert!(local("http://nas/dav"));
        assert!(!local("http://example.com/"));
        assert!(!local("http://8.8.8.8/"));
        assert!(!local("http://172.32.0.1/"));
    }

    #[test]
    fn a_password_goes_over_https_or_a_confirmed_local_address() {
        let ok = |u: &str, c| check_transport(&reqwest::Url::parse(u).unwrap(), c);
        assert!(ok("https://cloud.example.com/dav", false).is_ok());
        assert!(ok("http://192.168.0.2/dav", true).is_ok());
        assert_eq!(
            ok("http://192.168.0.2/dav", false)
                .unwrap_err()
                .detail
                .as_deref(),
            Some("plain_http_unconfirmed")
        );
        assert_eq!(
            ok("http://cloud.example.com/dav", true)
                .unwrap_err()
                .detail
                .as_deref(),
            Some("plain_http_refused")
        );
        assert!(ok("ftp://x/", true).is_err());
    }

    #[test]
    fn the_wait_grows_and_stops_at_the_cap() {
        let b = Backoff {
            base: Duration::from_millis(100),
            cap: Duration::from_secs(1),
            tries: 6,
        };
        assert!(b.wait(1) >= Duration::from_millis(100));
        assert!(b.wait(1) < Duration::from_millis(250));
        assert!(b.wait(3) >= Duration::from_millis(400));
        assert_eq!(b.wait(10), Duration::from_secs(1));
    }

    #[test]
    fn a_body_reads_the_pieces_in_order_and_ends_when_they_do() {
        let (tx, rx) = mpsc::sync_channel(4);
        for p in [&b"ab"[..], b"", b"cde"] {
            tx.send(Ok(p.to_vec())).unwrap();
        }
        drop(tx);
        let mut pipe = Pipe {
            rx,
            piece: Vec::new(),
            at: 0,
        };
        let mut all = Vec::new();
        let mut buf = [0_u8; 2];
        loop {
            let n = pipe.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            all.extend_from_slice(&buf[..n]);
        }
        assert_eq!(all, b"abcde");
    }

    #[test]
    fn a_failed_piece_fails_the_body() {
        let (tx, rx) = mpsc::sync_channel(4);
        tx.send(Err(io::Error::other("no"))).unwrap();
        let mut pipe = Pipe {
            rx,
            piece: Vec::new(),
            at: 0,
        };
        assert!(pipe.read(&mut [0_u8; 4]).is_err());
    }
}
