// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A bad DNS survived the way a browser survives it (ADR 0097; the
//! maintainer, 2026-10-16: the Mac's system resolver answered `10.0.0.1`
//! for a name the browser reached — its own DNS client asked the other
//! servers of the list — and the app said "operation timed out" and
//! nothing more).
//!
//! The rule, for every connection to a UniVerso, HTTP and WebSocket alike:
//!
//! 1. The name is resolved by the system, as always, and nothing else is
//!    asked while connections work.
//! 2. When a connection **fails**, the name is marked suspect for ten
//!    minutes and asked of **each of the system's global DNS servers one by
//!    one** (a UDP query to port 53, A and AAAA; at most six servers; the
//!    scoped and supplemental resolvers of macOS are left out; answers
//!    kept five minutes, fifteen seconds when none came). Their answers
//!    that differ are tried **after** the system's.
//! 3. Those answers are never believed more than the situation allows:
//!    when the system said the name does not exist, they are used only for
//!    an `https` server (the certificate is checked for the name), and for
//!    an `http` one only when they are private, unique-local or loopback
//!    addresses — a token never goes in the clear to whatever an ISP's
//!    resolver invents.
//! 4. The address that failed goes to the end of the order for ten
//!    minutes. An address that worked — a handshake and an answer, not a
//!    TCP accept — goes first, but only among the addresses the current
//!    resolution returned: a café's network cannot be sent to the home
//!    address remembered from another.
//! 5. The name is never replaced: the URL keeps it, so the TLS certificate
//!    is verified for the name the person typed; and the scheme is never
//!    touched — `https` never falls back to `http`.
//!
//! When nothing answers, the error names what was tried
//! (`universo.casa.meioorc.com → 10.0.0.1`), so a DNS problem reads as one.
//! The pure parts — the order, the policy, the query and the answer on the
//! wire, the lists of DNS servers — are tested without a network. The
//! resolver files of Linux are read in `resolv_conf.rs`, the one place
//! `std::fs` is used for this (ADR 0097).

use std::collections::{BTreeMap, BTreeSet};
use std::future::Future;
use std::io;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs, UdpSocket};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use reqwest::dns::{Addrs, Name, Resolve, Resolving};

use verso_service::lock;

/// How long an address that worked goes first.
const GOOD_FOR: Duration = Duration::from_secs(600);
/// How long a name stays suspect after a connection to it failed.
const SUSPECT_FOR: Duration = Duration::from_secs(600);
/// How long an address that failed goes last.
const DEMOTED_FOR: Duration = Duration::from_secs(600);
/// How long the other servers' answers for a name are kept, and, when none
/// of them answered (the network may have been down), how long that is.
const OTHERS_FOR: Duration = Duration::from_secs(300);
const NO_OTHERS_FOR: Duration = Duration::from_secs(15);
/// How long one DNS server is given to answer.
const ASK_FOR: Duration = Duration::from_millis(1200);
/// How many DNS servers are asked at most.
const MOST_SERVERS: usize = 6;
/// How long one address is given to accept a TCP connection, and then to
/// finish the TLS and WebSocket handshakes.
const TCP_FOR: Duration = Duration::from_secs(6);
const SHAKE_FOR: Duration = Duration::from_secs(10);
/// The most a dial of all the addresses takes. The tests' ceiling is shorter
/// than `SHAKE_FOR` (so `a_dial_has_a_ceiling` can tell it from a handshake's
/// own time) but long enough for a loaded machine: at 600 ms a dial to a
/// healthy in-process server timed out when the CPU was busy, and the link
/// said `unreachable`.
#[cfg(not(test))]
const DIAL_TOTAL: Duration = Duration::from_secs(25);
#[cfg(test)]
const DIAL_TOTAL: Duration = Duration::from_secs(5);

/// How an address came to be tried.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Via {
    /// The system's resolver gave it.
    System,
    /// This DNS server of the system's list gave it.
    Server(IpAddr),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Candidate {
    pub(crate) ip: IpAddr,
    pub(crate) via: Via,
}

/// What each DNS server answered for a name.
type Others = Vec<(IpAddr, Vec<IpAddr>)>;

/// An address worth trying: not nothing, not a multicast.
fn plausible(ip: &IpAddr) -> bool {
    !(ip.is_unspecified() || ip.is_multicast())
}

/// The networks this machine is on: an interface address and its prefix
/// length, for each interface that is up and not loopback.
pub(crate) type Nets = Vec<(IpAddr, u8)>;

/// Whether `ip` is in the same network as `net`/`prefix`.
fn same_network(net: &IpAddr, prefix: u8, ip: &IpAddr) -> bool {
    match (net, ip) {
        (IpAddr::V4(a), IpAddr::V4(b)) if (16..=32).contains(&prefix) => {
            let mask = u32::MAX << (32 - u32::from(prefix));
            u32::from(*a) & mask == u32::from(*b) & mask
        }
        (IpAddr::V6(a), IpAddr::V6(b)) if (32..=128).contains(&prefix) => {
            let mask = u128::MAX << (128 - u32::from(prefix));
            u128::from(*a) & mask == u128::from(*b) & mask
        }
        _ => false,
    }
}

/// An address a plain `http` connection may be sent to on another
/// resolver's word: one **on a network this machine is on** — inside the
/// subnet of one of its interfaces, a home's LAN. A wide prefix says nothing
/// about where a host is, so an IPv4 interface shorter than /16 (a VPN's or a
/// TAP adapter's /8 or /10) and an IPv6 one shorter than /32 count for
/// nothing, and carrier-grade NAT's 100.64.0.0/10 is other customers of the
/// ISP, never ours. This machine itself (loopback) is never believed from
/// another resolver. (Tailscale is not covered: its interface is a /32 on
/// macOS and Linux, and a wide prefix is ignored anyway.)
pub(crate) fn on_link(ip: &IpAddr, nets: &[(IpAddr, u8)]) -> bool {
    !ip.is_loopback() && nets.iter().any(|(n, p)| same_network(n, *p, ip))
}

/// The addresses to try, in order: the system's, then what each other DNS
/// server gave, each once; the addresses in `demoted` after the others;
/// and `good` — an address that worked — first, **only when it is among
/// those**.
pub(crate) fn order(
    good: Option<IpAddr>,
    demoted: &[IpAddr],
    system: &[IpAddr],
    others: &Others,
) -> Vec<Candidate> {
    let mut out: Vec<Candidate> = Vec::new();
    let mut add = |ip: IpAddr, via: Via| {
        if plausible(&ip) && !out.iter().any(|c| c.ip == ip) {
            out.push(Candidate { ip, via });
        }
    };
    for ip in system {
        add(*ip, Via::System);
    }
    for (server, ips) in others {
        for ip in ips {
            add(*ip, Via::Server(*server));
        }
    }
    let (kept, last): (Vec<_>, Vec<_>) = out.into_iter().partition(|c| !demoted.contains(&c.ip));
    let mut out: Vec<Candidate> = kept.into_iter().chain(last).collect();
    if let Some(at) = good.and_then(|g| out.iter().position(|c| c.ip == g)) {
        let c = out.remove(at);
        out.insert(0, c);
    }
    out
}

/// What is known of one name.
#[derive(Default)]
struct Known {
    /// The name has been used over https / over plain http. Keyed by the
    /// name, since a resolver is asked for a name alone: a name that was
    /// ever used over plain http is treated as plain (the strict case).
    https: bool,
    http: bool,
    good: Option<(IpAddr, Instant)>,
    /// A connection failed at this moment.
    suspect: Option<Instant>,
    others: Option<(Instant, Others)>,
    demoted: Vec<(IpAddr, Instant)>,
    /// What the system answered the last time, and what was offered.
    last_system: Vec<IpAddr>,
    offered: Vec<Candidate>,
    /// The other servers are being asked now.
    asking: bool,
}

static KNOWN: Mutex<BTreeMap<String, Known>> = Mutex::new(BTreeMap::new());

impl Known {
    /// An https server only: the certificate is checked for the name.
    fn tls(&self) -> bool {
        self.https && !self.http
    }

    fn good_at(&self, now: Instant) -> Option<IpAddr> {
        self.good
            .filter(|(_, at)| now.duration_since(*at) < GOOD_FOR)
            .map(|(ip, _)| ip)
    }

    fn suspect_at(&self, now: Instant) -> bool {
        self.suspect
            .is_some_and(|at| now.duration_since(at) < SUSPECT_FOR)
    }

    fn others_at(&self, now: Instant) -> Option<&Others> {
        self.others
            .as_ref()
            .filter(|(at, o)| {
                let life = if o.iter().all(|(_, ips)| ips.is_empty()) {
                    NO_OTHERS_FOR
                } else {
                    OTHERS_FOR
                };
                now.duration_since(*at) < life
            })
            .map(|(_, o)| o)
    }

    fn demoted_at(&self, now: Instant) -> Vec<IpAddr> {
        self.demoted
            .iter()
            .filter(|(_, at)| now.duration_since(*at) < DEMOTED_FOR)
            .map(|(ip, _)| *ip)
            .collect()
    }

    /// Whether the other servers must be asked now: a connection failed
    /// lately, and they were not asked a moment ago or are not being asked.
    fn wants_others(&self, now: Instant) -> bool {
        self.suspect_at(now) && self.others_at(now).is_none() && !self.asking
    }
}

/// The candidates for a name: `system` is what the system's resolver
/// returned, `None` when it failed (the name does not exist, as far as it
/// says). The policy of the module's header, in one place.
fn plan(
    k: &Known,
    system: Option<&[IpAddr]>,
    nets: &[(IpAddr, u8)],
    now: Instant,
) -> Vec<Candidate> {
    let sys = system.unwrap_or(&[]);
    let mut others: Others = if k.suspect_at(now) {
        k.others_at(now).cloned().unwrap_or_default()
    } else {
        Vec::new()
    };
    if !k.tls() {
        // The system said the name does not exist: nothing another
        // resolver says is believed over plain http; and what it says
        // otherwise must be on a network this machine is on.
        if system.is_none() {
            others.clear();
        }
        for (_, ips) in &mut others {
            ips.retain(|ip| on_link(ip, nets));
        }
    }
    order(k.good_at(now), &k.demoted_at(now), sys, &others)
}

/// This name's server speaks TLS (`true`) or plain HTTP: said where an
/// address enters the app, so the policy knows what a wrong address costs.
pub(crate) fn declare(host: &str, tls: bool) {
    let mut all = lock(&KNOWN);
    let k = all.entry(host.to_owned()).or_default();
    if tls {
        k.https = true;
    } else {
        k.http = true;
    }
}

/// An address worked for `host` — the handshake and an answer, not only a
/// TCP accept: it goes first for a while, among the addresses the next
/// resolution returns.
pub(crate) fn worked(host: &str, ip: IpAddr) {
    let now = Instant::now();
    let mut all = lock(&KNOWN);
    let k = all.entry(host.to_owned()).or_default();
    k.good = Some((ip, now));
    k.demoted.retain(|(d, _)| *d != ip);
    if k.last_system.contains(&ip) {
        // The system's own answer works: nothing is wrong any more.
        k.suspect = None;
    } else if k.suspect.is_some() {
        k.suspect = Some(now);
    }
}

/// `ip` did not complete a handshake for `host`: it goes last for a while.
pub(crate) fn demote(host: &str, ip: IpAddr) {
    let mut all = lock(&KNOWN);
    let k = all.entry(host.to_owned()).or_default();
    k.demoted.retain(|(d, _)| *d != ip);
    k.demoted.push((ip, Instant::now()));
}

/// A connection to `host` failed: forget what worked, put the address that
/// was tried first at the end of the order, ask the other DNS servers from
/// now on, and say what was tried the last time the name was resolved.
pub(crate) fn failed(host: &str) -> Vec<Candidate> {
    let mut all = lock(&KNOWN);
    let Some(k) = all.get_mut(host) else {
        all.insert(
            host.to_owned(),
            Known {
                suspect: Some(Instant::now()),
                ..Known::default()
            },
        );
        return Vec::new();
    };
    k.good = None;
    k.suspect = Some(Instant::now());
    if let Some(first) = k.offered.first() {
        let ip = first.ip;
        k.demoted.retain(|(d, _)| *d != ip);
        k.demoted.push((ip, Instant::now()));
    }
    k.offered.clone()
}

/// What a name was last resolved to, as the tests of other modules need
/// it said.
#[cfg(test)]
pub(crate) fn pretend_offered(host: &str, tried: Vec<Candidate>) {
    lock(&KNOWN).entry(host.to_owned()).or_default().offered = tried;
}

/// The system's answers for names in the tests, so that a name reaches
/// 127.0.0.1 with no DNS.
#[cfg(test)]
static SYSTEM: Mutex<BTreeMap<String, Vec<IpAddr>>> = Mutex::new(BTreeMap::new());

#[cfg(test)]
pub(crate) fn pretend_system(host: &str, ips: Vec<IpAddr>) {
    lock(&SYSTEM).insert(host.to_owned(), ips);
}

/// The tried addresses as a log line: `name → ip (system), ip (dns x)`.
pub(crate) fn describe(host: &str, tried: &[Candidate]) -> String {
    let list: Vec<String> = tried
        .iter()
        .map(|c| match &c.via {
            Via::System => format!("{} (system)", c.ip),
            Via::Server(s) => format!("{} (dns {s})", c.ip),
        })
        .collect();
    format!("{host} → {}", list.join(", "))
}

/// Names the system alone answers for: no other server is asked.
fn local_name(host: &str) -> bool {
    let h = host.to_ascii_lowercase();
    h == "localhost" || h.ends_with(".local") || h.ends_with(".localhost")
}

/// The machine's networks; the tests pretend some.
fn networks() -> Nets {
    #[cfg(test)]
    if let Some(n) = lock(&NETS).as_ref() {
        return n.clone();
    }
    verso_server::discovery::interface_networks()
}

#[cfg(test)]
static NETS: Mutex<Option<Nets>> = Mutex::new(None);

fn system_answer(host: &str) -> io::Result<Vec<IpAddr>> {
    #[cfg(test)]
    if let Some(ips) = lock(&SYSTEM).get(host) {
        return Ok(ips.clone());
    }
    (host, 0)
        .to_socket_addrs()
        .map(|a| a.map(|s| s.ip()).collect())
}

/// The system's addresses for `host`, as it answers now: where a computer
/// paired by its name was (`paired/pair.rs`).
pub(crate) fn system_ips(host: &str) -> Vec<IpAddr> {
    system_answer(host).unwrap_or_default()
}

/// Resolve `host`: the system, and, once a connection to it has failed, the
/// other servers. A paired computer's name (`paired/mod.rs`) is never asked
/// of either: its addresses are the ones it was found at, in the order the
/// rule below gives them.
fn resolve(host: &str) -> io::Result<Vec<IpAddr>> {
    if let Some(found) = crate::paired::addresses(host) {
        let nets = networks();
        let mut all = lock(&KNOWN);
        let k = all.entry(host.to_owned()).or_default();
        let candidates = plan(k, Some(&found), &nets, Instant::now());
        k.offered.clone_from(&candidates);
        if candidates.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("no address is known for {host}"),
            ));
        }
        return Ok(candidates.into_iter().map(|c| c.ip).collect());
    }
    let system = system_answer(host);
    let sys: Option<Vec<IpAddr>> = system.as_ref().ok().cloned();
    let ask = {
        let mut all = lock(&KNOWN);
        let k = all.entry(host.to_owned()).or_default();
        k.last_system = sys.clone().unwrap_or_default();
        let go = !local_name(host) && k.wants_others(Instant::now());
        if go {
            k.asking = true;
        }
        go
    };
    if ask {
        let others = ask_all(host, &servers());
        let mut all = lock(&KNOWN);
        let k = all.entry(host.to_owned()).or_default();
        k.others = Some((Instant::now(), others));
        k.asking = false;
    }
    let nets = networks();
    let mut all = lock(&KNOWN);
    let k = all.entry(host.to_owned()).or_default();
    let candidates = plan(k, sys.as_deref(), &nets, Instant::now());
    k.offered.clone_from(&candidates);
    if candidates.is_empty() {
        return Err(system.err().unwrap_or_else(|| {
            io::Error::new(io::ErrorKind::NotFound, format!("no address for {host}"))
        }));
    }
    Ok(candidates.into_iter().map(|c| c.ip).collect())
}

/// reqwest's resolver: the rule above, the name kept.
pub(crate) struct Resolver;

impl Resolve for Resolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let found = tauri::async_runtime::spawn_blocking(move || resolve(&host))
                .await
                .map_err(|e| io::Error::other(e.to_string()))??;
            Ok(Box::new(found.into_iter().map(|ip| SocketAddr::new(ip, 0))) as Addrs)
        })
    }
}

/// `send`, with the second try of the module's rule: a request that fails
/// to connect has marked the name suspect and put the address tried first
/// at the end of the order, so it is sent once more, now with the other
/// servers' answers and the new order. Only a connect failure is retried
/// (nothing was sent); a request whose body cannot be cloned is sent once.
/// The request's scheme tells the policy whether the name is an https one.
pub(crate) trait SendRetrying {
    fn send_retrying(self) -> reqwest::Result<reqwest::blocking::Response>;
}

impl SendRetrying for reqwest::blocking::RequestBuilder {
    fn send_retrying(self) -> reqwest::Result<reqwest::blocking::Response> {
        let again = self.try_clone();
        if let Some(url) = again
            .as_ref()
            .and_then(|b| b.try_clone()?.build().ok())
            .map(|r| r.url().clone())
            && let Some(host) = url.host_str()
        {
            declare(host, url.scheme() == "https");
        }
        match self.send() {
            Err(e) if e.is_connect() => {
                let host = e.url().and_then(|u| u.host_str()).map(str::to_owned);
                match (again, host) {
                    (Some(again), Some(host)) if host.parse::<IpAddr>().is_err() => {
                        let tried: Vec<IpAddr> = lock(&KNOWN)
                            .get(&host)
                            .map(|k| k.offered.iter().map(|c| c.ip).collect())
                            .unwrap_or_default();
                        failed(&host);
                        // Sent again only if it can end differently (see
                        // `worth_retrying`): the same address again would
                        // fail the same way, and take as long.
                        let retried = match resolve(&host) {
                            Ok(now) if worth_retrying(&tried, tcp_level(&e), &now) => again
                                .try_clone()
                                .map(reqwest::blocking::RequestBuilder::send),
                            _ => None,
                        };
                        let e = match retried {
                            Some(Ok(answer)) => return Ok(answer),
                            Some(Err(e)) => e,
                            None => e,
                        };
                        // A computer at home none of whose addresses
                        // answered: looked for on the network by its pin,
                        // and sent once more if it was found holding its key
                        // (`paired/find.rs`).
                        if e.is_connect() && crate::paired::find_again(&host) {
                            again.send()
                        } else {
                            Err(e)
                        }
                    }
                    _ => Err(e),
                }
            }
            other => other,
        }
    }
}

/// Whether a failed connection was the TCP connection itself — refused,
/// timed out, no route — rather than what comes after it (the TLS
/// handshake). Then the connector has already tried every address it was
/// given, in turn.
pub(crate) fn tcp_level(e: &reqwest::Error) -> bool {
    use std::error::Error as _;
    use std::io::ErrorKind as K;
    let mut under = e.source();
    while let Some(c) = under {
        if let Some(io) = c.downcast_ref::<io::Error>()
            && matches!(
                io.kind(),
                K::ConnectionRefused
                    | K::TimedOut
                    | K::HostUnreachable
                    | K::NetworkUnreachable
                    | K::AddrNotAvailable
            )
        {
            return true;
        }
        under = c.source();
    }
    false
}

/// Whether sending again can end differently. After a failure of the TCP
/// connection itself every address that was offered has been tried, so only
/// an address that was **not** in the answer before can change anything (a
/// dual-stack name whose server is down would otherwise take twice as long
/// to fail). After a failure of the handshake only the first address was
/// tried, so the retry is worth it when the new resolution puts another
/// first.
fn worth_retrying(tried: &[IpAddr], tcp_level: bool, now: &[IpAddr]) -> bool {
    let Some(first) = now.first() else {
        return false;
    };
    if tcp_level {
        !tried.contains(first)
    } else {
        tried.first() != Some(first)
    }
}

/// How a dial ended without a connection to use.
#[derive(Debug)]
pub(crate) enum Dial<E> {
    /// No address accepted a TCP connection in time.
    Io(io::Error),
    /// An address accepted, and the handshake over it failed.
    Shake(E),
}

/// A connection to `host:port` by the same rule, for the WebSocket: each
/// address in turn — the TCP connection **and** `shake`, the TLS and
/// WebSocket handshakes, are made per address, and the first address where
/// they succeed wins and is remembered. `shake` fails with `(error,
/// answered)`: `answered` when the server at that address did answer as a
/// server (a refusal such as 401), which ends the dial; any other failure
/// puts the address last and goes on to the next.
pub(crate) async fn dial_with<T, E, F, Fut>(
    host: &str,
    port: u16,
    mut shake: F,
) -> Result<T, Dial<E>>
where
    F: FnMut(tokio::net::TcpStream) -> Fut,
    Fut: Future<Output = Result<T, (E, bool)>>,
{
    let name = host.to_owned();
    let ips = match name.trim_matches(['[', ']']).parse::<IpAddr>() {
        Ok(ip) => vec![ip],
        Err(_) => tauri::async_runtime::spawn_blocking(move || resolve(&name))
            .await
            .map_err(|e| Dial::Io(io::Error::other(e.to_string())))?
            .map_err(Dial::Io)?,
    };
    let mut last = Dial::Io(io::Error::from(io::ErrorKind::NotFound));
    let all = async {
        for ip in ips {
            let tcp =
                tokio::time::timeout(TCP_FOR, tokio::net::TcpStream::connect((ip, port))).await;
            let stream = match tcp {
                Ok(Ok(s)) => s,
                Ok(Err(e)) => {
                    last = Dial::Io(e);
                    continue;
                }
                Err(_) => {
                    last = Dial::Io(io::Error::new(
                        io::ErrorKind::TimedOut,
                        "operation timed out",
                    ));
                    continue;
                }
            };
            match tokio::time::timeout(SHAKE_FOR, shake(stream)).await {
                Ok(Ok(t)) => {
                    worked(host, ip);
                    return Ok(t);
                }
                Ok(Err((e, true))) => {
                    worked(host, ip);
                    return Err(Dial::Shake(e));
                }
                Ok(Err((e, false))) => {
                    demote(host, ip);
                    last = Dial::Shake(e);
                }
                Err(_) => {
                    demote(host, ip);
                    last = Dial::Io(io::Error::new(
                        io::ErrorKind::TimedOut,
                        "the handshake timed out",
                    ));
                }
            }
        }
        Err(last)
    };
    // Every address has its time, but the dial as a whole has a ceiling too.
    tokio::time::timeout(DIAL_TOTAL, all)
        .await
        .unwrap_or_else(|_| {
            Err(Dial::Io(io::Error::new(
                io::ErrorKind::TimedOut,
                "operation timed out",
            )))
        })
}

// The query and the answer on the wire (RFC 1035), only as far as an
// address is wanted. What comes back is untrusted: every length is
// checked, every loop bounded, and a record counts only when it answers
// the question that was asked.

const TYPE_A: u16 = 1;
const TYPE_CNAME: u16 = 5;
const TYPE_AAAA: u16 = 28;

/// A query for `host`'s `qtype`, recursion desired; `None` for a name that
/// cannot be one.
pub(crate) fn query(id: u16, host: &str, qtype: u16) -> Option<Vec<u8>> {
    let name = host.trim_end_matches('.');
    if name.is_empty() || name.len() > 253 {
        return None;
    }
    let mut out = Vec::with_capacity(18 + name.len());
    out.extend_from_slice(&id.to_be_bytes());
    out.extend_from_slice(&[0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]);
    for label in name.split('.') {
        if label.is_empty() || label.len() > 63 || !label.is_ascii() {
            return None;
        }
        out.push(u8::try_from(label.len()).ok()?);
        out.extend_from_slice(label.as_bytes());
    }
    out.push(0);
    out.extend_from_slice(&qtype.to_be_bytes());
    out.extend_from_slice(&1_u16.to_be_bytes());
    Some(out)
}

fn be16(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes([*b.get(at)?, *b.get(at + 1)?]))
}

/// The name at `at`, lowercase and dotted, following compression pointers
/// (bounded), and where it ends in the stream.
fn name_at(b: &[u8], at: usize) -> Option<(String, usize)> {
    let mut name = String::new();
    let (mut pos, mut end, mut jumps) = (at, None, 0_u8);
    loop {
        let len = *b.get(pos)?;
        match len & 0xC0 {
            0 if len == 0 => return Some((name, end.unwrap_or(pos + 1))),
            0 => {
                let label = b.get(pos + 1..pos + 1 + usize::from(len))?;
                if !name.is_empty() {
                    name.push('.');
                }
                name.push_str(&String::from_utf8_lossy(label).to_ascii_lowercase());
                if name.len() > 255 {
                    return None;
                }
                pos += 1 + usize::from(len);
            }
            0xC0 => {
                let target = usize::from(len & 0x3F) << 8 | usize::from(*b.get(pos + 1)?);
                end.get_or_insert(pos + 2);
                jumps += 1;
                if jumps > 16 {
                    return None;
                }
                pos = target;
            }
            _ => return None,
        }
    }
}

/// The addresses a response with `id` carries for `host`'s `qtype`, in
/// order; nothing when it is not a successful answer to that very
/// question. The question must be echoed (name, type, class), and a record
/// counts only when its owner is the name asked or a name reached by
/// CNAMEs from it — a record owned by another name is somebody else's.
pub(crate) fn answers(b: &[u8], id: u16, host: &str, qtype: u16) -> Vec<IpAddr> {
    let mut found = Vec::new();
    let Some(flags) = be16(b, 2) else {
        return found;
    };
    if be16(b, 0) != Some(id) || flags & 0x8000 == 0 || flags & 0x000F != 0 {
        return found;
    }
    let (Some(qd), Some(an)) = (be16(b, 4), be16(b, 6)) else {
        return found;
    };
    let asked = host.trim_end_matches('.').to_ascii_lowercase();
    let Some((qname, after)) = name_at(b, 12) else {
        return found;
    };
    if qd != 1 || qname != asked || be16(b, after) != Some(qtype) || be16(b, after + 2) != Some(1) {
        return found;
    }
    // (owner, type, class, rdata start, rdata length)
    let mut records = Vec::new();
    let mut at = after + 4;
    for _ in 0..an.min(64) {
        let Some((owner, end)) = name_at(b, at) else {
            break;
        };
        let (Some(kind), Some(class), Some(len)) =
            (be16(b, end), be16(b, end + 2), be16(b, end + 8))
        else {
            break;
        };
        let (start, len) = (end + 10, usize::from(len));
        if b.get(start..start + len).is_none() {
            break;
        }
        records.push((owner, kind, class, start, len));
        at = start + len;
    }
    let mut wanted: BTreeSet<String> = BTreeSet::from([asked]);
    for _ in 0..4 {
        let before = wanted.len();
        for (owner, kind, class, start, _) in &records {
            if *class == 1
                && *kind == TYPE_CNAME
                && wanted.contains(owner)
                && let Some((target, _)) = name_at(b, *start)
            {
                wanted.insert(target);
            }
        }
        if wanted.len() == before {
            break;
        }
    }
    for (owner, kind, class, start, len) in records {
        if class != 1 || !wanted.contains(&owner) || kind != qtype {
            continue;
        }
        let rdata = &b[start..start + len];
        match (kind, len) {
            (TYPE_A, 4) => found.push(IpAddr::from([rdata[0], rdata[1], rdata[2], rdata[3]])),
            (TYPE_AAAA, 16) => {
                let mut o = [0_u8; 16];
                o.copy_from_slice(rdata);
                found.push(IpAddr::from(o));
            }
            _ => {}
        }
    }
    found
}

/// A query id that an off-path forger cannot guess from the last one.
fn fresh_id() -> u16 {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u128(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos()),
    );
    (h.finish() & 0xFFFF) as u16
}

/// What one DNS server answers for `host`, A and AAAA, within `wait`.
pub(crate) fn ask(server: SocketAddr, host: &str, wait: Duration) -> Vec<IpAddr> {
    let bind = if server.is_ipv4() {
        "0.0.0.0:0"
    } else {
        "[::]:0"
    };
    let Ok(socket) = UdpSocket::bind(bind) else {
        return Vec::new();
    };
    if socket.connect(server).is_err() {
        return Vec::new();
    }
    let mut sent: Vec<(u16, u16)> = Vec::new();
    for qtype in [TYPE_A, TYPE_AAAA] {
        let id = fresh_id();
        if let Some(q) = query(id, host, qtype)
            && socket.send(&q).is_ok()
        {
            sent.push((id, qtype));
        }
    }
    let until = Instant::now() + wait;
    let mut got: BTreeMap<u16, Vec<IpAddr>> = BTreeMap::new();
    let mut buf = [0_u8; 1500];
    while got.len() < sent.len() {
        let left = until.saturating_duration_since(Instant::now());
        if left.is_zero() || socket.set_read_timeout(Some(left)).is_err() {
            break;
        }
        let Ok(n) = socket.recv(&mut buf) else {
            break;
        };
        for (id, qtype) in &sent {
            if !got.contains_key(id) && be16(&buf[..n], 0) == Some(*id) {
                got.insert(*id, answers(&buf[..n], *id, host, *qtype));
            }
        }
    }
    sent.iter()
        .flat_map(|(id, _)| got.remove(id).unwrap_or_default())
        .collect()
}

/// Ask every server of the list at once.
fn ask_all(host: &str, servers: &[IpAddr]) -> Others {
    let handles: Vec<_> = servers
        .iter()
        .map(|s| {
            let (server, name) = (SocketAddr::new(*s, 53), host.to_owned());
            (*s, std::thread::spawn(move || ask(server, &name, ASK_FOR)))
        })
        .collect();
    handles
        .into_iter()
        .map(|(s, h)| (s, h.join().unwrap_or_default()))
        .collect()
}

// The system's DNS servers, one by one: the global ones only.

/// `nameserver <ip>` lines of a resolv.conf; a scoped address
/// (`fe80::1%en0`) is left out, as it means nothing without its interface.
#[cfg(any(target_os = "linux", test))]
pub(crate) fn from_resolv_conf(text: &str) -> Vec<IpAddr> {
    text.lines()
        .filter_map(|l| {
            let mut w = l.split('#').next()?.split_whitespace();
            (w.next()? == "nameserver").then(|| w.next()?.parse().ok())?
        })
        .collect()
}

/// The servers on Linux: those of `/etc/resolv.conf`; only when that names
/// nothing but this machine (systemd-resolved's stub, 127.0.0.53) the real
/// upstreams of `/run/systemd/resolve/resolv.conf` — which lists **every
/// link's** servers, a VPN's included. That is accepted: the protection
/// against a wrong answer is the policy of the module's header, not the list.
#[cfg(any(target_os = "linux", test))]
pub(crate) fn linux_servers(etc: &str, run: &str) -> Vec<IpAddr> {
    let here = from_resolv_conf(etc);
    if here.iter().any(|ip| !ip.is_loopback()) {
        return here;
    }
    let upstream = from_resolv_conf(run);
    if upstream.is_empty() { here } else { upstream }
}

/// The nameservers of macOS's `scutil --dns` that answer for every name:
/// the resolvers of the first part, without a `domain` (those answer for
/// one domain, such as `local`) and not marked scoped or supplemental; the
/// part "for scoped queries" is left out whole.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn from_scutil(text: &str) -> Vec<IpAddr> {
    let mut out = Vec::new();
    let mut block: Vec<IpAddr> = Vec::new();
    let mut skip = false;
    for line in text.lines() {
        let t = line.trim();
        if t.contains("for scoped queries") {
            break;
        }
        if t.starts_with("resolver #") {
            if !skip {
                out.append(&mut block);
            }
            block.clear();
            skip = false;
        } else if t.starts_with("nameserver[") {
            if let Some(ip) = t.split_once(':').and_then(|(_, v)| v.trim().parse().ok()) {
                block.push(ip);
            }
        } else if t.starts_with("domain ")
            || t.starts_with("domain:")
            || (t.starts_with("flags") && (t.contains("Supplemental") || t.contains("Scoped")))
        {
            skip = true;
        }
    }
    if !skip {
        out.append(&mut block);
    }
    out
}

/// One address per line, as PowerShell prints `ServerAddresses`.
#[cfg(any(windows, test))]
pub(crate) fn from_lines(text: &str) -> Vec<IpAddr> {
    text.lines().filter_map(|l| l.trim().parse().ok()).collect()
}

/// Each address once, in order, the unusable left out — and Windows' three
/// placeholder site-local resolvers (`fec0:0:0:ffff::1` to `::3`), which
/// stand where no DNS server is set.
#[cfg(any(target_os = "macos", target_os = "linux", windows, test))]
fn tidy(all: Vec<IpAddr>) -> Vec<IpAddr> {
    let mut out: Vec<IpAddr> = Vec::new();
    for ip in all {
        let placeholder = matches!(ip, IpAddr::V6(v) if v.segments()[..7] == [0xfec0, 0, 0, 0xffff, 0, 0, 0] && (1..=3).contains(&v.segments()[7]));
        if plausible(&ip) && !placeholder && !out.contains(&ip) {
            out.push(ip);
        }
    }
    out
}

#[cfg(target_os = "macos")]
fn system_servers() -> Vec<IpAddr> {
    std::process::Command::new("/usr/sbin/scutil")
        .arg("--dns")
        .output()
        .map(|o| tidy(from_scutil(&String::from_utf8_lossy(&o.stdout))))
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn system_servers() -> Vec<IpAddr> {
    let (etc, run) = crate::resolv_conf::read();
    tidy(linux_servers(&etc, &run))
}

#[cfg(windows)]
fn system_servers() -> Vec<IpAddr> {
    use std::os::windows::process::CommandExt;
    // The system's own PowerShell, by its absolute path (a `powershell.exe`
    // earlier on the PATH is not run), no console window (CREATE_NO_WINDOW),
    // and only the physical adapters that are up (a VPN's or a virtual
    // switch's servers are not asked).
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_owned());
    std::process::Command::new(format!(
        "{root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    ))
    .args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$up = (Get-NetAdapter -Physical | Where-Object Status -eq 'Up').InterfaceIndex; Get-DnsClientServerAddress | Where-Object { $up -contains $_.InterfaceIndex } | ForEach-Object { $_.ServerAddresses }",
    ])
    .creation_flags(0x0800_0000)
    .output()
    .map(|o| tidy(from_lines(&String::from_utf8_lossy(&o.stdout))))
    .unwrap_or_default()
}

/// A phone's DNS servers come from Android's own API (no
/// `/etc/resolv.conf` there; ADR 0118 item 7).
#[cfg(target_os = "android")]
fn system_servers() -> Vec<IpAddr> {
    crate::phone::dns_servers()
}

#[cfg(not(any(
    target_os = "macos",
    target_os = "linux",
    windows,
    target_os = "android"
)))]
fn system_servers() -> Vec<IpAddr> {
    Vec::new()
}

/// The servers to ask: the system's global ones, at most six.
fn servers() -> Vec<IpAddr> {
    let mut all = system_servers();
    all.truncate(MOST_SERVERS);
    all
}

#[cfg(test)]
#[path = "tests_dns.rs"]
mod tests;
