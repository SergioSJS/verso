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

/// What an interface looks like by its name: a real network of the room
/// (Wi-Fi, Ethernet) or a virtual one (a VPN, a bridge, a container's).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Lan,
    Virtual,
}

/// Name prefixes (compared in lower case) of virtual interfaces, and the
/// program each usually means, for a hint the person reads with a question
/// mark: a name is a guess, not a fact.
const VIRTUAL: &[(&str, &str)] = &[
    ("feth", "ZeroTier"),
    ("zt", "ZeroTier"),
    ("zerotier", "ZeroTier"),
    ("tailscale", "Tailscale"),
    ("utun", "VPN"),
    ("tun", "VPN"),
    ("tap", "VPN"),
    ("ppp", "VPN"),
    ("wg", "WireGuard"),
    ("docker", "Docker"),
    ("br-", "Docker"),
    ("vethernet", "Hyper-V"),
    ("hyper-v", "Hyper-V"),
    ("veth", "Docker"),
    ("vboxnet", "VirtualBox"),
    ("virtualbox", "VirtualBox"),
    ("vmnet", "VMware"),
    ("vmware", "VMware"),
    ("bridge", "bridge"),
    ("vpn", "VPN"),
    ("virbr", "libvirt"),
    ("lxc", "container"),
    ("cni", "container"),
    ("flannel", "container"),
];

/// The hint of a virtual interface's name: the program it probably is.
fn virtual_hint(name: &str) -> Option<&'static str> {
    let low = name.to_lowercase();
    VIRTUAL
        .iter()
        .find(|(p, _)| low.starts_with(p) || (p.len() > 3 && low.contains(p)))
        .map(|(_, what)| *what)
}

/// Whether an interface of this name is a real network or a virtual one.
#[must_use]
pub fn kind_of(name: &str) -> Kind {
    if virtual_hint(name).is_some() {
        Kind::Virtual
    } else {
        Kind::Lan
    }
}

/// What a virtual interface probably is (`ZeroTier`, `VPN`...), for the
/// hint beside its address; none for a real network.
#[must_use]
pub fn hint_of(name: &str) -> Option<&'static str> {
    virtual_hint(name)
}

/// The addresses ordered for choosing one to show: the one the system
/// would use for its default route first, then the real networks, then the
/// virtual ones; within a group, by address, so the order is stable. A
/// default route that is not among `nets` (public, or not served) counts
/// for nothing.
#[must_use]
pub fn rank(nets: &[IfNet], default_route: Option<IpAddr>) -> Vec<IfNet> {
    let mut out = nets.to_vec();
    out.sort_by_key(|n| {
        (
            Some(n.ip) != default_route,
            kind_of(&n.name) == Kind::Virtual,
            n.ip,
        )
    });
    out
}

/// The address the system would send from towards the internet, found
/// without sending anything: a UDP socket "connected" to an address of the
/// documentation range (RFC 5737) only asks the routing table, and no
/// packet leaves. IPv4 only (IPv6 link-local is not served).
#[must_use]
pub fn default_route_v4() -> Option<IpAddr> {
    let socket = std::net::UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket.connect((Ipv4Addr::new(192, 0, 2, 1), 9)).ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_unspecified()).then_some(ip)
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

    /// The address of the default route, when known (a test's table says
    /// it without asking the system).
    fn default_route(&self) -> Option<IpAddr> {
        None
    }
}

/// The system's interfaces.
pub struct System;

impl Interfaces for System {
    fn default_route(&self) -> Option<IpAddr> {
        default_route_v4()
    }

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

    /// The maintainer's Mac: ZeroTier's `feth237`, a VPN's `utun4` and the
    /// real network `en7`. The real one comes first, with or without the
    /// default-route answer; the default route wins over the names.
    #[test]
    fn the_real_network_comes_before_the_virtual_ones() {
        let nets = |a: &str, b: &str, c: &str| {
            [("feth237", a), ("utun4", b), ("en7", c)]
                .map(|(name, ip)| IfNet {
                    ip: ip.parse().unwrap(),
                    prefix: 24,
                    name: name.to_owned(),
                })
                .to_vec()
        };
        let set = nets("10.147.11.197", "10.217.1.73", "192.168.3.122");
        let order = |l: &[IfNet]| l.iter().map(|n| n.name.clone()).collect::<Vec<_>>();
        assert_eq!(order(&rank(&set, None)), ["en7", "feth237", "utun4"]);
        let default = "192.168.3.122".parse().ok();
        assert_eq!(order(&rank(&set, default)), ["en7", "feth237", "utun4"]);
        // The default route beats the names: here it is the VPN's.
        let vpn = "10.217.1.73".parse().ok();
        assert_eq!(order(&rank(&set, vpn)), ["utun4", "en7", "feth237"]);
        // A default route that is not served counts for nothing.
        let public = "203.0.113.9".parse().ok();
        assert_eq!(order(&rank(&set, public)), ["en7", "feth237", "utun4"]);
    }

    #[test]
    fn interfaces_are_told_real_from_virtual_by_name() {
        for real in [
            "en0", "en7", "eth0", "enp3s0", "wlan0", "wlp2s0", "Ethernet", "Wi-Fi",
        ] {
            assert_eq!(kind_of(real), Kind::Lan, "{real}");
        }
        for (name, hint) in [
            ("feth237", "ZeroTier"),
            ("zt5u4abc", "ZeroTier"),
            ("utun4", "VPN"),
            ("tailscale0", "Tailscale"),
            ("wg0", "WireGuard"),
            ("tun0", "VPN"),
            ("docker0", "Docker"),
            ("br-1a2b3c", "Docker"),
            ("veth12ab", "Docker"),
            ("vboxnet0", "VirtualBox"),
            ("vmnet8", "VMware"),
            ("bridge100", "bridge"),
            ("vEthernet (WSL)", "Hyper-V"),
            ("ZeroTier One [abc]", "ZeroTier"),
            ("Tailscale", "Tailscale"),
            ("VirtualBox Host-Only Network", "VirtualBox"),
        ] {
            assert_eq!(kind_of(name), Kind::Virtual, "{name}");
            assert_eq!(hint_of(name), Some(hint), "{name}");
        }
    }

    /// The routing-table question sends nothing and, on a machine with a
    /// route, answers with one of the machine's own addresses.
    #[test]
    fn the_default_route_is_asked_without_sending() {
        if let Some(ip) = default_route_v4() {
            assert!(ip.is_ipv4() && !ip.is_unspecified());
        }
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
