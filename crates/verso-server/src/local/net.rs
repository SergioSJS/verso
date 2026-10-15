// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Which addresses "this app is a server" listens on (ADR 0096 item 3):
//! only the private ones of the machine's interfaces — RFC 1918, IPv4
//! link-local and IPv6 unique local — never a public address and never the
//! wildcard. The set is recomputed while serving; when it changes (another
//! Wi-Fi, a VPN turning on) serving stops and asks again. A peer is let in
//! only from a private address of a subnet this machine is on.
//!
//! IPv6 link-local (`fe80::/10`) is not bound: a browser needs a zone id
//! in the address (`fe80::1%en0`) that no phone's address bar takes from a
//! QR code, so such an address could not be used (a decision of this
//! build, not of the ADR; reported).

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// One address of an interface and the length of its subnet's prefix.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct IfNet {
    pub ip: IpAddr,
    pub prefix: u8,
    pub name: String,
}

/// Whether `ip` is a private address this mode may listen on or admit:
/// RFC 1918 (`10/8`, `172.16/12`, `192.168/16`), IPv4 link-local
/// (`169.254/16`), IPv6 unique local (`fc00::/7`). Loopback, the
/// unspecified address, CGNAT (`100.64/10`, which Tailscale uses),
/// multicast, documentation ranges and everything public are not.
#[must_use]
pub fn private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => private_v4(v4),
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => private_v4(v4),
            None => private_v6(v6),
        },
    }
}

fn private_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    match o {
        [10, ..] | [192, 168, ..] | [169, 254, ..] => true,
        [172, b, ..] => (16..=31).contains(&b),
        _ => false,
    }
}

fn private_v6(ip: Ipv6Addr) -> bool {
    // fc00::/7
    ip.segments()[0] & 0xfe00 == 0xfc00
}

/// The machine's addresses it may listen on: private, one per address,
/// sorted so that two looks at the same network compare equal.
#[must_use]
pub fn servable(all: &[IfNet]) -> Vec<IfNet> {
    let mut out: Vec<IfNet> = all.iter().filter(|n| private_ip(n.ip)).cloned().collect();
    out.sort();
    out.dedup_by(|a, b| a.ip == b.ip);
    out
}

/// Whether `ip` is inside `net`'s subnet.
#[must_use]
pub fn same_subnet(net: &IfNet, ip: IpAddr) -> bool {
    match (net.ip, ip) {
        (IpAddr::V4(a), IpAddr::V4(b)) => {
            let bits = u32::from(net.prefix.min(32));
            let mask = if bits == 0 {
                0
            } else {
                u32::MAX << (32 - bits)
            };
            u32::from(a) & mask == u32::from(b) & mask
        }
        (IpAddr::V6(a), IpAddr::V6(b)) => {
            let bits = u32::from(net.prefix.min(128));
            let mask = if bits == 0 {
                0
            } else {
                u128::MAX << (128 - bits)
            };
            u128::from(a) & mask == u128::from(b) & mask
        }
        _ => false,
    }
}

/// Whether a peer at `peer` is let in: itself a private address, and in a
/// subnet of one of the addresses served (ADR 0096 item 3). The machine's
/// own loopback is not a peer of the network.
#[must_use]
pub fn admits(served: &[IfNet], peer: IpAddr) -> bool {
    let peer = match peer {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map_or(peer, IpAddr::V4),
        v4 => v4,
    };
    private_ip(peer) && served.iter().any(|n| same_subnet(n, peer))
}

/// Whether the addresses served are the same as before: the set, not the
/// order, and the interface's name does not count.
#[must_use]
pub fn same_set(a: &[IfNet], b: &[IfNet]) -> bool {
    let key = |l: &[IfNet]| {
        let mut ips: Vec<IpAddr> = l.iter().map(|n| n.ip).collect();
        ips.sort();
        ips
    };
    key(a) == key(b)
}

/// Whether an address in `100.64.0.0/10` is on this machine: Tailscale's
/// (ADR 0096 item 5 (d)), for the hint that its own `tailscale serve` is
/// the path that gives a certificate a phone trusts.
#[must_use]
pub fn tailscale_seen(all: &[IfNet]) -> bool {
    all.iter().any(|n| match n.ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            o[0] == 100 && (64..=127).contains(&o[1])
        }
        IpAddr::V6(_) => false,
    })
}

/// Where the machine's interfaces come from: the system's, or a table in a
/// test.
pub trait Interfaces: Send + Sync {
    fn list(&self) -> Vec<IfNet>;
}

/// The system's interfaces.
pub struct System;

impl Interfaces for System {
    fn list(&self) -> Vec<IfNet> {
        let Ok(found) = if_addrs::get_if_addrs() else {
            return Vec::new();
        };
        found
            .into_iter()
            .filter(|i| !i.is_loopback() && i.is_oper_up())
            .map(|i| match i.addr {
                if_addrs::IfAddr::V4(a) => IfNet {
                    ip: IpAddr::V4(a.ip),
                    prefix: a.prefixlen,
                    name: i.name,
                },
                if_addrs::IfAddr::V6(a) => IfNet {
                    ip: IpAddr::V6(a.ip),
                    prefix: a.prefixlen,
                    name: i.name,
                },
            })
            .collect()
    }
}

/// `ip:port` as a `Host` header and a URL write it: an IPv6 address in
/// brackets.
#[must_use]
pub fn authority(ip: IpAddr, port: u16) -> String {
    match ip {
        IpAddr::V4(v4) => format!("{v4}:{port}"),
        IpAddr::V6(v6) => format!("[{v6}]:{port}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn net(ip: &str, prefix: u8) -> IfNet {
        IfNet {
            ip: ip.parse().unwrap(),
            prefix,
            name: "en0".to_owned(),
        }
    }

    /// Item 3: only private ranges are ever bound. Every public, loopback,
    /// unspecified, CGNAT, multicast and link-local-v6 address is refused;
    /// the three RFC 1918 blocks, IPv4 link-local and unique local pass.
    #[test]
    fn only_private_ranges_are_servable() {
        for yes in [
            "10.0.0.1",
            "10.255.255.255",
            "172.16.0.1",
            "172.31.255.254",
            "192.168.1.20",
            "169.254.10.10",
            "fd12:3456:789a::1",
            "fc00::1",
            "::ffff:192.168.1.20",
        ] {
            assert!(private_ip(yes.parse().unwrap()), "{yes}");
        }
        for no in [
            "8.8.8.8",
            "172.15.255.255",
            "172.32.0.1",
            "192.169.0.1",
            "100.64.0.1",
            "100.127.255.255",
            "127.0.0.1",
            "0.0.0.0",
            "255.255.255.255",
            "224.0.0.251",
            "203.0.113.5",
            "::",
            "::1",
            "fe80::1",
            "2001:db8::1",
            "2606:4700::1111",
            "ff02::fb",
            "::ffff:8.8.8.8",
        ] {
            assert!(!private_ip(no.parse().unwrap()), "{no}");
        }
    }

    #[test]
    fn the_servable_set_is_private_sorted_and_without_repeats() {
        let all = [
            net("8.8.8.8", 24),
            net("192.168.1.20", 24),
            net("10.0.0.5", 8),
            net("192.168.1.20", 24),
            net("fe80::1", 64),
            net("100.100.1.1", 10),
        ];
        let set = servable(&all);
        assert_eq!(
            set.iter().map(|n| n.ip.to_string()).collect::<Vec<_>>(),
            ["10.0.0.5", "192.168.1.20"]
        );
        assert!(tailscale_seen(&all));
        assert!(!tailscale_seen(&set));
    }

    /// A peer is let in only from a private address on a subnet this
    /// machine is on: a private address of another network, and the
    /// machine's own loopback, are not.
    #[test]
    fn a_peer_must_be_private_and_on_a_subnet_of_the_machine() {
        let served = [net("192.168.1.20", 24), net("fd00:1::5", 64)];
        for yes in [
            "192.168.1.77",
            "192.168.1.1",
            "fd00:1::abcd",
            "::ffff:192.168.1.9",
        ] {
            assert!(admits(&served, yes.parse().unwrap()), "{yes}");
        }
        for no in [
            "192.168.2.5",
            "10.0.0.5",
            "127.0.0.1",
            "::1",
            "8.8.8.8",
            "fd00:2::1",
            "::ffff:8.8.8.8",
        ] {
            assert!(!admits(&served, no.parse().unwrap()), "{no}");
        }
        // A /8 holds the whole 10.x network.
        assert!(admits(&[net("10.1.2.3", 8)], "10.200.0.1".parse().unwrap()));
    }

    #[test]
    fn a_changed_set_is_told_from_an_unchanged_one() {
        let a = [net("192.168.1.20", 24), net("10.0.0.5", 8)];
        let same = [net("10.0.0.5", 8), net("192.168.1.20", 24)];
        let other = [net("192.168.1.21", 24), net("10.0.0.5", 8)];
        assert!(same_set(&a, &same));
        assert!(!same_set(&a, &other));
        assert!(!same_set(&a, &a[..1]));
        assert!(!same_set(&a, &[]));
    }

    #[test]
    fn an_authority_brackets_ipv6() {
        assert_eq!(
            authority("192.168.1.2".parse().unwrap(), 51234),
            "192.168.1.2:51234"
        );
        assert_eq!(
            authority("fd00::1".parse().unwrap(), 51234),
            "[fd00::1]:51234"
        );
    }
}
