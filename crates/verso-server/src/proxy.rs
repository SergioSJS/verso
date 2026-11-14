// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The reverse proxies whose forwarded headers are believed
//! (`VERSO_TRUSTED_PROXY`, ADR 0073 item 6; a list since ADR 0083 item 5):
//! addresses and CIDRs, IPv4 and IPv6. Behind Cloudflare, or any proxy
//! with several addresses, one address cannot name them all; and a proxy
//! not named makes every visitor one address, which every per-address
//! delay then keys (F5 of the review of 2026-10-13).
//!
//! The client's address is read from `X-Forwarded-For` as every proxy
//! chain is read: from the right, each proxy having appended the address
//! it was reached from, the first entry that is not a trusted proxy is the
//! client. What is left of it was written by the client and is never
//! believed. A peer that is not a trusted proxy has its header ignored.

use std::fmt;
use std::net::{IpAddr, SocketAddr};

/// One entry of the list: an address with the length of its prefix (32 or
/// 128 for one address).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Net {
    base: IpAddr,
    bits: u8,
}

/// `ip` with every bit past the first `bits` cleared.
fn masked(ip: IpAddr, bits: u8) -> IpAddr {
    match ip {
        IpAddr::V4(v4) => {
            let mask = u32::MAX.checked_shl(32 - u32::from(bits)).unwrap_or(0);
            IpAddr::V4((u32::from(v4) & mask).into())
        }
        IpAddr::V6(v6) => {
            let mask = u128::MAX.checked_shl(128 - u32::from(bits)).unwrap_or(0);
            IpAddr::V6((u128::from(v6) & mask).into())
        }
    }
}

impl Net {
    fn parse(text: &str) -> Result<Self, String> {
        let (address, prefix) = match text.split_once('/') {
            Some((a, p)) => (a.trim(), Some(p.trim())),
            None => (text, None),
        };
        let base = address
            .parse::<IpAddr>()
            .map_err(|_| format!("not an address or a CIDR: {text}"))?
            .to_canonical();
        let most: u8 = if base.is_ipv4() { 32 } else { 128 };
        let bits = match prefix {
            None => most,
            Some(p) => p
                .parse::<u8>()
                .ok()
                .filter(|b| *b <= most)
                .ok_or_else(|| format!("not a prefix length of 0 to {most}: {text}"))?,
        };
        Ok(Self {
            base: masked(base, bits),
            bits,
        })
    }

    fn contains(self, ip: IpAddr) -> bool {
        let ip = ip.to_canonical();
        ip.is_ipv4() == self.base.is_ipv4() && masked(ip, self.bits) == self.base
    }
}

impl fmt::Display for Net {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let whole = if self.base.is_ipv4() { 32 } else { 128 };
        if self.bits == whole {
            write!(f, "{}", self.base)
        } else {
            write!(f, "{}/{}", self.base, self.bits)
        }
    }
}

/// The trusted proxies; empty when `VERSO_TRUSTED_PROXY` is `none`. Left
/// empty in the environment it is [`Proxies::private_networks`]: a person
/// putting a proxy in front of UniVerso should not have to know its address
/// (ADR 0073 item 6, amended 2026-10-16).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Proxies {
    nets: Vec<Net>,
    /// Believed because nothing was set, not because the person named it:
    /// the connection limit and the warnings of a named proxy do not apply.
    implicit: bool,
}

/// The default of an empty `VERSO_TRUSTED_PROXY`: this machine and the
/// private networks (RFC 1918, loopback, unique-local IPv6).
const PRIVATE: [&str; 6] = [
    "127.0.0.0/8",
    "::1",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "fc00::/7",
];

/// Where a request came from, as the proxies say it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Client {
    /// The client's address: the connection's, or the one read from
    /// `X-Forwarded-For`.
    pub addr: IpAddr,
    /// Whether the connection came from a trusted proxy.
    pub from_proxy: bool,
    /// A trusted proxy forwarded no `X-Forwarded-For`: the request is
    /// served with the proxy's own address.
    pub unforwarded: bool,
}

impl Proxies {
    /// `127.0.0.1, 10.0.0.0/8, 2001:db8::/32`: addresses and CIDRs,
    /// separated by commas; one address alone is the form before the list.
    /// `none` trusts no proxy at all.
    pub fn parse(text: &str) -> Result<Self, String> {
        if text.trim().eq_ignore_ascii_case("none") {
            return Ok(Self::default());
        }
        text.split(',')
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .map(Net::parse)
            .collect::<Result<Vec<_>, _>>()
            .map(|nets| Self {
                nets,
                implicit: false,
            })
    }

    /// Loopback and the private networks: what an empty
    /// `VERSO_TRUSTED_PROXY` believes.
    #[must_use]
    pub fn private_networks() -> Self {
        Self {
            nets: PRIVATE.iter().filter_map(|n| Net::parse(n).ok()).collect(),
            implicit: true,
        }
    }

    /// `127.0.0.1` and `::1`, **named**: the proxies of the loopback
    /// listener of "this app is a server" that the internet link reaches
    /// (ADR 0117 D3 item 4). Named and not implicit, so that the address a
    /// tunnel forwards keys every delay, pace and count, and a forwarded
    /// loopback is never "this machine" (ADR 0083 items 5 and 7).
    #[must_use]
    pub fn loopback() -> Self {
        Self {
            nets: ["127.0.0.1", "::1"]
                .iter()
                .filter_map(|n| Net::parse(n).ok())
                .collect(),
            implicit: false,
        }
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.nets.is_empty()
    }

    /// Whether the list is the default, not something the person wrote.
    #[must_use]
    pub fn is_implicit(&self) -> bool {
        self.implicit
    }

    /// The proxies the person named, none when the list is the default.
    #[must_use]
    pub fn named(&self) -> Self {
        if self.implicit {
            Self::default()
        } else {
            self.clone()
        }
    }

    /// Whether `ip` is one of the trusted proxies.
    #[must_use]
    pub fn trusts(&self, ip: IpAddr) -> bool {
        self.nets.iter().any(|n| n.contains(ip))
    }

    /// The client of a request that reached the server from `remote`
    /// carrying the `X-Forwarded-For` lines `forwarded`, in their order.
    pub fn client<'a>(
        &self,
        remote: IpAddr,
        forwarded: impl IntoIterator<Item = &'a str>,
    ) -> Client {
        if !self.trusts(remote) {
            return Client {
                addr: remote,
                from_proxy: false,
                unforwarded: false,
            };
        }
        let entries: Vec<&str> = forwarded
            .into_iter()
            .flat_map(|line| line.split(','))
            .map(str::trim)
            .filter(|e| !e.is_empty())
            .collect();
        let mut addr = remote;
        for entry in entries.iter().rev() {
            // An entry that is no address ends the walk: the client is the
            // last hop that was read, never a guess.
            let Some(ip) = address(entry) else { break };
            addr = ip;
            if !self.trusts(ip) {
                break;
            }
        }
        Client {
            addr,
            from_proxy: true,
            unforwarded: entries.is_empty(),
        }
    }
}

/// An entry of `X-Forwarded-For`: an address, with a port or in brackets
/// as some proxies write it.
fn address(entry: &str) -> Option<IpAddr> {
    let entry = entry.trim_matches('"');
    entry
        .parse::<IpAddr>()
        .ok()
        .or_else(|| entry.parse::<SocketAddr>().ok().map(|s| s.ip()))
        .or_else(|| {
            entry
                .strip_prefix('[')
                .and_then(|e| e.strip_suffix(']'))
                .and_then(|e| e.parse::<IpAddr>().ok())
        })
        .map(|ip| ip.to_canonical())
}

impl fmt::Display for Proxies {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, net) in self.nets.iter().enumerate() {
            if i > 0 {
                f.write_str(", ")?;
            }
            write!(f, "{net}")?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    fn list(s: &str) -> Proxies {
        Proxies::parse(s).unwrap()
    }

    #[test]
    fn one_address_is_still_a_list() {
        let p = list("127.0.0.1");
        assert!(p.trusts(ip("127.0.0.1")));
        assert!(!p.trusts(ip("127.0.0.2")));
        let c = p.client(ip("127.0.0.1"), ["203.0.113.9"]);
        assert_eq!(c.addr, ip("203.0.113.9"));
        assert!(c.from_proxy && !c.unforwarded);
        assert_eq!(p.to_string(), "127.0.0.1");
        assert!(list("").is_empty());
    }

    #[test]
    fn the_default_believes_this_machine_and_the_private_networks() {
        let p = Proxies::private_networks();
        for near in [
            "127.0.0.1",
            "127.3.4.5",
            "::1",
            "10.1.2.3",
            "172.16.0.9",
            "172.31.255.1",
            "192.168.1.40",
            "fd12:3456::1",
        ] {
            assert!(p.trusts(ip(near)), "{near}");
        }
        for far in ["203.0.113.9", "172.32.0.1", "11.0.0.1", "2001:db8::1"] {
            assert!(!p.trusts(ip(far)), "{far}");
        }
        assert!(p.is_implicit() && p.named().is_empty());
    }

    #[test]
    fn none_believes_no_proxy() {
        let p = list("none");
        assert!(p.is_empty() && !p.is_implicit());
        assert!(!p.trusts(ip("127.0.0.1")));
        assert!(list(" None ").is_empty());
    }

    #[test]
    fn addresses_and_cidrs_of_both_families() {
        let p = list("127.0.0.1, 10.0.0.0/8, 2001:db8::/32");
        assert!(p.trusts(ip("10.200.3.4")));
        assert!(!p.trusts(ip("11.0.0.1")));
        assert!(p.trusts(ip("2001:db8:ffff::1")));
        assert!(!p.trusts(ip("2001:db9::1")));
        // An IPv4 address mapped into IPv6 is that IPv4 address.
        assert!(p.trusts(ip("::ffff:10.1.2.3")));
        assert_eq!(p.to_string(), "127.0.0.1, 10.0.0.0/8, 2001:db8::/32");
        for bad in ["10.0.0.0/33", "2001:db8::/129", "dez", "10.0.0.0/x"] {
            assert!(Proxies::parse(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn two_hops_give_the_client_left_of_the_inner_proxy() {
        // Cloudflare (173.245.48.0/20) → Caddy (127.0.0.1) → Verso: Caddy
        // appended Cloudflare's address, Cloudflare the client's.
        let p = list("127.0.0.1, 173.245.48.0/20");
        let c = p.client(ip("127.0.0.1"), ["198.51.100.7, 173.245.48.11"]);
        assert_eq!(c.addr, ip("198.51.100.7"));
        // The same, as two header lines.
        let c = p.client(ip("127.0.0.1"), ["198.51.100.7", "173.245.48.11"]);
        assert_eq!(c.addr, ip("198.51.100.7"));
    }

    #[test]
    fn a_spoofed_left_entry_is_never_believed() {
        // The client wrote `1.2.3.4, 127.0.0.1` itself; the proxy appended
        // the address it really came from.
        let p = list("127.0.0.1, 10.0.0.0/8");
        let c = p.client(ip("10.0.0.2"), ["1.2.3.4, 127.0.0.1, 198.51.100.7"]);
        assert_eq!(c.addr, ip("198.51.100.7"));
        // Two hops, and a spoof left of them: neither the left-most entry
        // (what the client wrote) nor the right-most (Cloudflare's own
        // address, appended by Caddy) is the client.
        let p = list("127.0.0.1, 173.245.48.0/20");
        let c = p.client(ip("127.0.0.1"), ["1.2.3.4, 198.51.100.7, 173.245.48.11"]);
        assert_eq!(c.addr, ip("198.51.100.7"));
        // Garbage right of the client ends the walk at the last hop read.
        let c = p.client(ip("10.0.0.2"), ["198.51.100.7, nada"]);
        assert_eq!(c.addr, ip("10.0.0.2"));
    }

    #[test]
    fn an_address_in_a_cidr_is_a_proxy() {
        let p = list("10.0.0.0/8, 2001:db8::/32");
        let c = p.client(ip("10.9.8.7"), ["2001:db9::5, 2001:db8::1, 10.1.1.1"]);
        assert_eq!(c.addr, ip("2001:db9::5"));
        // With a port or in brackets, as some proxies write it.
        let c = p.client(ip("10.9.8.7"), ["[2001:db9::5]:443"]);
        assert_eq!(c.addr, ip("2001:db9::5"));
        let c = p.client(ip("10.9.8.7"), ["198.51.100.7:51000"]);
        assert_eq!(c.addr, ip("198.51.100.7"));
    }

    #[test]
    fn a_trusted_proxy_with_no_header_is_served_as_itself() {
        let p = list("10.0.0.0/8");
        let c = p.client(ip("10.0.0.2"), []);
        assert_eq!(c.addr, ip("10.0.0.2"));
        assert!(c.from_proxy && c.unforwarded);
        let c = p.client(ip("10.0.0.2"), ["  "]);
        assert!(c.unforwarded);
    }

    #[test]
    fn an_untrusted_peer_sending_the_header_is_ignored() {
        let p = list("10.0.0.0/8");
        let c = p.client(ip("198.51.100.7"), ["10.0.0.5, 127.0.0.1"]);
        assert_eq!(c.addr, ip("198.51.100.7"));
        assert!(!c.from_proxy && !c.unforwarded);
        // No proxy set: nobody's header is believed.
        let c = Proxies::default().client(ip("127.0.0.1"), ["203.0.113.9"]);
        assert_eq!(c.addr, ip("127.0.0.1"));
    }
}
