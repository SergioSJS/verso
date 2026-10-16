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
//! 1. The name is resolved by the system, as always.
//! 2. It is also asked of **each of the system's DNS servers one by one**
//!    (a plain UDP query to port 53, A and AAAA), once in five minutes per
//!    name, and the answers that differ are added after the system's.
//! 3. The connection tries the addresses in that order — an address
//!    remembered as having worked comes first — and the first that answers
//!    wins. It is remembered for ten minutes, and forgotten at once when a
//!    connection fails.
//! 4. The name is never replaced: the URL keeps it, so the TLS certificate
//!    is verified for the name the person typed, not for an IP; and the
//!    scheme is never touched — `https` never falls back to `http`.
//!
//! When nothing answers, the error names what was tried
//! (`universo.casa.meioorc.com → 10.0.0.1`), so a DNS problem reads as one.
//! The pure parts — the order, the query and the answer on the wire, the
//! lists of DNS servers — are tested without a network.
//!
//! `std::fs` is used here to read the Linux resolver files, an exception
//! to the confinement of `std::fs` in this crate declared in ADR 0097
//! (and in `scripts/check.sh`): it is the system's configuration, not a
//! file of any folder.

use std::collections::BTreeMap;
use std::io;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs, UdpSocket};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use reqwest::dns::{Addrs, Name, Resolve, Resolving};

use verso_service::lock;

/// How long an address that worked goes first.
const GOOD_FOR: Duration = Duration::from_secs(600);
/// How long the other servers' answers for a name are kept.
const OTHERS_FOR: Duration = Duration::from_secs(300);
/// How long one DNS server is given to answer.
const ASK_FOR: Duration = Duration::from_millis(1200);
/// How long one address is given to connect, in a WebSocket.
const DIAL_FOR: Duration = Duration::from_secs(6);

/// How an address came to be tried.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Via {
    /// It worked before, not long ago.
    Remembered,
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

/// The addresses to try, in order: the one that worked, the system's, then
/// what each other DNS server gave — each address once, the first reason
/// kept.
pub(crate) fn order(good: Option<IpAddr>, system: &[IpAddr], others: &Others) -> Vec<Candidate> {
    let mut out: Vec<Candidate> = Vec::new();
    let mut add = |ip: IpAddr, via: Via| {
        if plausible(&ip) && !out.iter().any(|c| c.ip == ip) {
            out.push(Candidate { ip, via });
        }
    };
    if let Some(ip) = good {
        add(ip, Via::Remembered);
    }
    for ip in system {
        add(*ip, Via::System);
    }
    for (server, ips) in others {
        for ip in ips {
            add(*ip, Via::Server(*server));
        }
    }
    out
}

/// What is known of one name.
#[derive(Default)]
struct Known {
    good: Option<(IpAddr, Instant)>,
    others: Option<(Instant, Others)>,
    offered: Vec<Candidate>,
}

static KNOWN: Mutex<BTreeMap<String, Known>> = Mutex::new(BTreeMap::new());

impl Known {
    fn good_at(&self, now: Instant) -> Option<IpAddr> {
        self.good
            .filter(|(_, at)| now.duration_since(*at) < GOOD_FOR)
            .map(|(ip, _)| ip)
    }

    fn others_at(&self, now: Instant) -> Option<&Others> {
        self.others
            .as_ref()
            .filter(|(at, _)| now.duration_since(*at) < OTHERS_FOR)
            .map(|(_, o)| o)
    }

    /// Whether the other servers must be asked: not when an address that
    /// worked is among the system's own answers (nothing is wrong), and
    /// not when they were asked a moment ago.
    fn must_ask(&self, system: &[IpAddr], now: Instant) -> bool {
        if self.others_at(now).is_some() {
            return false;
        }
        !self.good_at(now).is_some_and(|g| system.contains(&g))
    }
}

/// An address worked for `host`: it goes first for a while.
pub(crate) fn worked(host: &str, ip: IpAddr) {
    lock(&KNOWN).entry(host.to_owned()).or_default().good = Some((ip, Instant::now()));
}

/// A connection to `host` failed: forget what worked, and say what was
/// tried the last time the name was resolved.
pub(crate) fn failed(host: &str) -> Vec<Candidate> {
    let mut all = lock(&KNOWN);
    match all.get_mut(host) {
        Some(k) => {
            k.good = None;
            k.offered.clone()
        }
        None => Vec::new(),
    }
}

/// What a name was last resolved to, as the tests of other modules need
/// it said.
#[cfg(test)]
pub(crate) fn pretend_offered(host: &str, tried: Vec<Candidate>) {
    lock(&KNOWN).entry(host.to_owned()).or_default().offered = tried;
}

/// The tried addresses as a log line: `name → ip (system), ip (dns x)`.
pub(crate) fn describe(host: &str, tried: &[Candidate]) -> String {
    let list: Vec<String> = tried
        .iter()
        .map(|c| match &c.via {
            Via::Remembered => format!("{} (worked before)", c.ip),
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

/// Resolve `host`: the system, and the other servers when it matters.
fn lookup(host: &str) -> io::Result<Vec<IpAddr>> {
    let system: io::Result<Vec<IpAddr>> = (host, 0)
        .to_socket_addrs()
        .map(|a| a.map(|s| s.ip()).collect());
    let sys = system.as_ref().map(Clone::clone).unwrap_or_default();
    let now = Instant::now();
    let ask = !local_name(host)
        && lock(&KNOWN)
            .entry(host.to_owned())
            .or_default()
            .must_ask(&sys, now);
    let fresh = ask.then(|| ask_all(host, &system_servers()));
    let mut all = lock(&KNOWN);
    let known = all.entry(host.to_owned()).or_default();
    if let Some(o) = fresh {
        known.others = Some((now, o));
    }
    let others = known.others_at(now).cloned().unwrap_or_default();
    let candidates = order(known.good_at(now), &sys, &others);
    known.offered.clone_from(&candidates);
    if candidates.is_empty() {
        return system.and(Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("no address for {host}"),
        )));
    }
    Ok(candidates.into_iter().map(|c| c.ip).collect())
}

/// reqwest's resolver: the rule above, the name kept.
pub(crate) struct Resolver;

impl Resolve for Resolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let found = tauri::async_runtime::spawn_blocking(move || lookup(&host))
                .await
                .map_err(|e| io::Error::other(e.to_string()))??;
            Ok(Box::new(found.into_iter().map(|ip| SocketAddr::new(ip, 0))) as Addrs)
        })
    }
}

/// A TCP connection to `host:port` by the same rule, for the WebSocket:
/// each address in turn, the first that answers wins and is remembered.
pub(crate) async fn dial(host: &str, port: u16) -> io::Result<tokio::net::TcpStream> {
    let name = host.to_owned();
    let ips = match name.trim_matches(['[', ']']).parse::<IpAddr>() {
        Ok(ip) => vec![ip],
        Err(_) => tauri::async_runtime::spawn_blocking(move || lookup(&name))
            .await
            .map_err(|e| io::Error::other(e.to_string()))??,
    };
    let mut last = io::Error::from(io::ErrorKind::NotFound);
    for ip in ips {
        let tried =
            tokio::time::timeout(DIAL_FOR, tokio::net::TcpStream::connect((ip, port))).await;
        match tried {
            Ok(Ok(stream)) => {
                worked(host, ip);
                return Ok(stream);
            }
            Ok(Err(e)) => last = e,
            Err(_) => last = io::Error::new(io::ErrorKind::TimedOut, "operation timed out"),
        }
    }
    Err(last)
}

// The query and the answer on the wire (RFC 1035), only as far as an
// address is wanted. What comes back is untrusted: every length is
// checked, every loop bounded.

const TYPE_A: u16 = 1;
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

/// Where the name at `at` ends.
fn skip_name(b: &[u8], mut at: usize) -> Option<usize> {
    for _ in 0..128 {
        let len = *b.get(at)?;
        match len & 0xC0 {
            0 if len == 0 => return Some(at + 1),
            0 => at += 1 + usize::from(len),
            0xC0 => {
                b.get(at + 1)?;
                return Some(at + 2);
            }
            _ => return None,
        }
    }
    None
}

/// The addresses a response with `id` carries, in order; nothing when it is
/// not a successful answer to that query.
pub(crate) fn answers(b: &[u8], id: u16) -> Vec<IpAddr> {
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
    let mut at = 12;
    for _ in 0..qd.min(8) {
        let Some(end) = skip_name(b, at) else {
            return found;
        };
        at = end + 4;
    }
    for _ in 0..an.min(64) {
        let Some(end) = skip_name(b, at) else {
            return found;
        };
        let (Some(kind), Some(class), Some(len)) =
            (be16(b, end), be16(b, end + 2), be16(b, end + 8))
        else {
            return found;
        };
        let data = end + 10;
        let len = usize::from(len);
        let Some(rdata) = b.get(data..data + len) else {
            return found;
        };
        if class == 1 {
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
        at = data + len;
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
    let mut sent = Vec::new();
    for qtype in [TYPE_A, TYPE_AAAA] {
        let id = fresh_id();
        if let Some(q) = query(id, host, qtype)
            && socket.send(&q).is_ok()
        {
            sent.push(id);
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
        for id in &sent {
            if got.contains_key(id) {
                continue;
            }
            let ips = answers(&buf[..n], *id);
            if be16(&buf[..n], 0) == Some(*id) {
                got.insert(*id, ips);
            }
        }
    }
    sent.iter()
        .flat_map(|id| got.remove(id).unwrap_or_default())
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

// The system's DNS servers, one by one.

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

/// `nameserver[N] : <ip>` lines of macOS's `scutil --dns`.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn from_scutil(text: &str) -> Vec<IpAddr> {
    text.lines()
        .filter_map(|l| {
            let l = l.trim();
            l.starts_with("nameserver[")
                .then(|| l.split_once(':')?.1.trim().parse().ok())?
        })
        .collect()
}

/// One address per line, as PowerShell prints `ServerAddresses`.
#[cfg(any(windows, test))]
pub(crate) fn from_lines(text: &str) -> Vec<IpAddr> {
    text.lines().filter_map(|l| l.trim().parse().ok()).collect()
}

/// Each address once, in order, the unusable left out.
fn tidy(all: Vec<IpAddr>) -> Vec<IpAddr> {
    let mut out: Vec<IpAddr> = Vec::new();
    for ip in all {
        if plausible(&ip) && !out.contains(&ip) {
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
    // With systemd-resolved, /etc/resolv.conf names only its stub; the
    // real upstreams are in the second file.
    let mut all = Vec::new();
    for file in ["/etc/resolv.conf", "/run/systemd/resolve/resolv.conf"] {
        if let Ok(text) = std::fs::read_to_string(file) {
            all.extend(from_resolv_conf(&text));
        }
    }
    tidy(all)
}

#[cfg(windows)]
fn system_servers() -> Vec<IpAddr> {
    use std::os::windows::process::CommandExt;
    // No console window flashes (CREATE_NO_WINDOW).
    std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-DnsClientServerAddress | ForEach-Object { $_.ServerAddresses }",
        ])
        .creation_flags(0x0800_0000)
        .output()
        .map(|o| tidy(from_lines(&String::from_utf8_lossy(&o.stdout))))
        .unwrap_or_default()
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn system_servers() -> Vec<IpAddr> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    /// The maintainer's case: the system's resolver gave 10.0.0.1, another
    /// DNS server of the list the right address. The right one is tried
    /// after the wrong one, each once; the name stays out of it.
    #[test]
    fn the_other_servers_answers_follow_the_systems() {
        let others = vec![
            (ip("fd00::1"), vec![ip("10.0.0.1")]),
            (ip("192.168.0.2"), vec![ip("192.168.0.5"), ip("10.0.0.1")]),
        ];
        let got = order(None, &[ip("10.0.0.1")], &others);
        let ips: Vec<IpAddr> = got.iter().map(|c| c.ip).collect();
        assert_eq!(ips, [ip("10.0.0.1"), ip("192.168.0.5")]);
        assert_eq!(got[0].via, Via::System);
        assert_eq!(got[1].via, Via::Server(ip("192.168.0.2")));
    }

    #[test]
    fn what_worked_goes_first_and_nothing_unusable_is_tried() {
        let others = vec![(ip("192.168.0.2"), vec![ip("192.168.0.5"), ip("0.0.0.0")])];
        let got = order(Some(ip("192.168.0.5")), &[ip("10.0.0.1")], &others);
        let ips: Vec<IpAddr> = got.iter().map(|c| c.ip).collect();
        assert_eq!(ips, [ip("192.168.0.5"), ip("10.0.0.1")]);
        assert_eq!(got[0].via, Via::Remembered);
        assert!(order(None, &[], &Vec::new()).is_empty());
    }

    #[test]
    fn the_other_servers_are_asked_only_when_something_may_be_wrong() {
        let now = Instant::now();
        let mut k = Known::default();
        // Never asked, nothing worked: ask.
        assert!(k.must_ask(&[ip("10.0.0.1")], now));
        // It worked, and the system still gives that address: all is well.
        k.good = Some((ip("10.0.0.1"), now));
        assert!(!k.must_ask(&[ip("10.0.0.1")], now));
        // It worked elsewhere and the system now gives another: ask.
        assert!(k.must_ask(&[ip("10.0.0.9")], now));
        // Asked a moment ago: not again.
        k.others = Some((now, Vec::new()));
        assert!(!k.must_ask(&[ip("10.0.0.9")], now));
        // A memory that is old is no memory.
        let later = now + GOOD_FOR + Duration::from_secs(1);
        assert_eq!(k.good_at(later), None);
        assert!(k.must_ask(&[ip("10.0.0.9")], later));
    }

    #[test]
    fn a_failure_forgets_what_worked_and_names_what_was_tried() {
        let host = "falha.exemplo.invalid";
        worked(host, ip("192.168.0.5"));
        lock(&KNOWN).get_mut(host).unwrap().offered = order(
            Some(ip("192.168.0.5")),
            &[ip("10.0.0.1")],
            &vec![(ip("192.168.0.2"), vec![ip("192.168.0.7")])],
        );
        let tried = failed(host);
        assert_eq!(tried.len(), 3);
        assert_eq!(lock(&KNOWN).get(host).unwrap().good, None);
        assert_eq!(
            describe(host, &tried),
            "falha.exemplo.invalid → 192.168.0.5 (worked before), 10.0.0.1 (system), 192.168.0.7 (dns 192.168.0.2)"
        );
        assert!(failed("nunca.visto.invalid").is_empty());
    }

    #[test]
    fn a_query_is_the_name_in_labels() {
        let q = query(0xABCD, "universo.casa.exemplo.com", TYPE_A).unwrap();
        assert_eq!(&q[..4], [0xAB, 0xCD, 0x01, 0x00]);
        assert_eq!(&q[12..21], b"\x08universo");
        assert_eq!(&q[q.len() - 4..], [0, 1, 0, 1]);
        assert!(query(1, "", TYPE_A).is_none());
        assert!(query(1, &"a".repeat(64), TYPE_A).is_none());
        assert!(query(1, "a..b", TYPE_A).is_none());
    }

    /// A response as a server sends it: the question, a CNAME by pointer,
    /// then the address.
    fn response(id: u16, rcode: u8, rdata: &[u8], kind: u16) -> Vec<u8> {
        let mut b = query(id, "a.b", kind).unwrap();
        b[2] = 0x81;
        b[3] = 0x80 | rcode;
        b[7] = 2;
        // CNAME to "x" via a pointer to the question's name.
        b.extend_from_slice(&[0xC0, 12, 0, 5, 0, 1, 0, 0, 0, 60, 0, 3, 1, b'x', 0]);
        b.extend_from_slice(&[0xC0, 12]);
        b.extend_from_slice(&kind.to_be_bytes());
        b.extend_from_slice(&[0, 1, 0, 0, 0, 60]);
        b.extend_from_slice(&u16::try_from(rdata.len()).unwrap().to_be_bytes());
        b.extend_from_slice(rdata);
        b
    }

    #[test]
    fn an_answer_is_read_and_a_wrong_one_is_not() {
        let r = response(7, 0, &[192, 168, 0, 5], TYPE_A);
        assert_eq!(answers(&r, 7), [ip("192.168.0.5")]);
        let mut v6 = [0_u8; 16];
        v6[0] = 0xfd;
        v6[15] = 1;
        assert_eq!(answers(&response(7, 0, &v6, TYPE_AAAA), 7), [ip("fd00::1")]);
        // Another query's id, a refusal (SERVFAIL), a query and not an
        // answer: nothing.
        assert!(answers(&r, 8).is_empty());
        assert!(answers(&response(7, 2, &[1, 2, 3, 4], TYPE_A), 7).is_empty());
        let mut asked = r.clone();
        asked[2] = 0x01;
        assert!(answers(&asked, 7).is_empty());
    }

    /// Whatever bytes arrive, nothing panics and nothing runs on.
    #[test]
    fn a_hostile_answer_is_bounded() {
        let r = response(7, 0, &[1, 2, 3, 4], TYPE_A);
        for cut in 0..r.len() {
            let _ = answers(&r[..cut], 7);
        }
        let mut loopy = r.clone();
        loopy[12] = 0xC0;
        loopy[13] = 12;
        let _ = answers(&loopy, 7);
        let mut many = r;
        many[6] = 0xFF;
        many[7] = 0xFF;
        let _ = answers(&many, 7);
        for seed in 0_u8..=255 {
            let junk: Vec<u8> = (0..64_u8)
                .map(|i| i.wrapping_mul(seed).wrapping_add(seed))
                .collect();
            let _ = answers(&junk, 7);
        }
    }

    /// A DNS server on this machine answers; the query goes to it by UDP.
    #[test]
    fn a_dns_server_is_asked_by_udp() {
        let server = UdpSocket::bind("127.0.0.1:0").unwrap();
        let addr = server.local_addr().unwrap();
        let thread = std::thread::spawn(move || {
            let mut buf = [0_u8; 512];
            for _ in 0..2 {
                let (n, from) = server.recv_from(&mut buf).unwrap();
                let id = u16::from_be_bytes([buf[0], buf[1]]);
                let kind = u16::from_be_bytes([buf[n - 4], buf[n - 3]]);
                let reply = if kind == TYPE_A {
                    response(id, 0, &[192, 168, 0, 5], TYPE_A)
                } else {
                    // No AAAA: an answer with no records.
                    let mut r = query(id, "a.b", kind).unwrap();
                    r[2] = 0x81;
                    r[3] = 0x80;
                    r
                };
                server.send_to(&reply, from).unwrap();
            }
        });
        let got = ask(addr, "a.b", Duration::from_secs(3));
        thread.join().unwrap();
        assert_eq!(got, [ip("192.168.0.5")]);
        // Nobody listening: nothing, within the time given.
        let dead = UdpSocket::bind("127.0.0.1:0").unwrap();
        let t = Instant::now();
        assert!(
            ask(
                dead.local_addr().unwrap(),
                "a.b",
                Duration::from_millis(200)
            )
            .is_empty()
        );
        assert!(t.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn the_lists_of_servers_are_read_as_each_system_writes_them() {
        let conf = "# generated\nnameserver 192.168.0.2\nnameserver fd00::1 # router\nnameserver fe80::1%en0\nsearch lan\n";
        assert_eq!(from_resolv_conf(conf), [ip("192.168.0.2"), ip("fd00::1")]);
        let scutil = "DNS configuration\n\nresolver #1\n  search domain[0] : lan\n  nameserver[0] : fd00::1\n  nameserver[1] : 192.168.0.2\n  nameserver[2] : 100.100.100.100\n  if_index : 15 (en0)\n";
        assert_eq!(
            from_scutil(scutil),
            [ip("fd00::1"), ip("192.168.0.2"), ip("100.100.100.100")]
        );
        assert_eq!(
            from_lines("192.168.0.2\r\n\r\nfd00::1\n"),
            [ip("192.168.0.2"), ip("fd00::1")]
        );
        assert_eq!(
            tidy(vec![ip("1.1.1.1"), ip("0.0.0.0"), ip("1.1.1.1")]),
            [ip("1.1.1.1")]
        );
    }

    /// A name `.local` or `localhost` is the system's alone.
    #[test]
    fn local_names_are_left_to_the_system() {
        assert!(local_name("localhost"));
        assert!(local_name("zima.local"));
        assert!(!local_name("universo.casa.exemplo.com"));
    }

    /// A name the system cannot resolve, with an address that worked
    /// before: the request goes there, still addressed to the name (the
    /// `Host` header, and for https the certificate, are the name's).
    #[test]
    fn a_remembered_address_is_used_and_the_name_is_kept() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let host = "lembrado.exemplo.invalid";
        worked(host, ip("127.0.0.1"));
        // Asked a moment ago: no real DNS query in a test.
        lock(&KNOWN).get_mut(host).unwrap().others = Some((Instant::now(), Vec::new()));
        let server = std::thread::spawn(move || {
            let (mut c, _) = listener.accept().unwrap();
            let mut seen = [0_u8; 1024];
            let n = c.read(&mut seen).unwrap();
            c.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .unwrap();
            String::from_utf8_lossy(&seen[..n]).into_owned()
        });
        let client = reqwest::blocking::Client::builder()
            .dns_resolver(std::sync::Arc::new(Resolver))
            .build()
            .unwrap();
        let response = client.get(format!("http://{host}:{port}/")).send().unwrap();
        assert_eq!(
            response.remote_addr().map(|a| a.ip()),
            Some(ip("127.0.0.1"))
        );
        assert_eq!(response.text().unwrap(), "ok");
        let request = server.join().unwrap().to_ascii_lowercase();
        assert!(
            request.contains(&format!("host: {host}:{port}")),
            "{request}"
        );
    }
}
