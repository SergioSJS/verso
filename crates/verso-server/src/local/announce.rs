// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! mDNS (ADR 0096 item 8, revised in place by the maintainer's decision of
//! 2026-11-15, *decisões 4.2 "B"*; ADR 0117 D12, D19 item 5): **while this
//! computer serves on the network** it says on that network that a Verso
//! computer is here, with its key's pin — so that a Verso app paired with
//! it finds it again when it got an address the app never saw (a new DHCP
//! lease, another Wi-Fi), and trusts it only by the pinned key. Nothing is
//! announced while only the internet link serves (*On my network*
//! unticked), and the announcement ends with serving.
//!
//! What the record says, and nothing else: the service `_verso-local._tcp`;
//! an instance `Verso-` and four random hexadecimal digits, **never the
//! computer's or the person's name**; the host `verso-<the first 20
//! hexadecimal digits of the pin>.local` (the name a phone's system
//! resolver answers by mDNS too, for an app that cannot browse); the port;
//! a TXT of `v` (this mode's protocol), `port` and `pin` (SHA-256 of the
//! certificate's public key, as `pin.rs` makes it). No folder name, no
//! account. The pin is what anyone who connects to the port sees in the
//! certificate; what an observer learns from the record is that a Verso
//! computer runs here, and a hash of its key that stays the same across its
//! addresses. A goodbye is sent when the announcement ends: serving
//! stopped, the network changed, the computer going to sleep (announced
//! again on waking) or the app quitting.
//!
//! **What is found is never trusted.** Anyone on the network can announce
//! any pin: an address found is only an address to try, and the app keeps
//! it only after a TLS handshake there showed the pinned key
//! (`app/src-tauri/src/paired/find.rs`). Pairing still needs the dialog's
//! code: being found pairs nothing.

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::time::{Duration, Instant};

use mdns_sd::{IfKind, ServiceDaemon, ServiceEvent, ServiceInfo};

use super::{net, pin};

/// The service type announced. The name is this project's own; nothing is
/// registered with anyone.
pub const SERVICE: &str = "_verso-local._tcp.local.";

/// The protocol the TXT record says: this mode's own, not the contract's
/// (the QR carries that). 2 since the record carries the pin (2026-11-15).
pub const PROTOCOL: u32 = 2;

/// The most addresses one finding keeps: anyone can announce, so what is
/// read is bounded.
const MOST_ADDRESSES: usize = 8;

/// `Verso-` and four random hexadecimal digits.
pub fn instance_name() -> Result<String, String> {
    let mut b = [0_u8; 2];
    getrandom::fill(&mut b).map_err(|e| e.to_string())?;
    Ok(format!("Verso-{:02x}{:02x}", b[0], b[1]))
}

/// The host a computer of key `pin` is announced under:
/// `verso-<20 digits>.local.`, the digits of its paired name (`pin::name`).
#[must_use]
pub fn host_of(pin: &str) -> String {
    let paired = pin::name(pin);
    let label = paired.strip_suffix(pin::NAME_END).unwrap_or(&paired);
    format!("{label}.local.")
}

/// The record announced for `instance`, a computer of key `pin`: its TXT is
/// the version, the port and the pin.
pub fn service_info(
    instance: &str,
    port: u16,
    addresses: &[IpAddr],
    pin: &str,
) -> Result<ServiceInfo, String> {
    let txt = [
        ("v".to_owned(), PROTOCOL.to_string()),
        ("port".to_owned(), port.to_string()),
        ("pin".to_owned(), pin.to_owned()),
    ];
    ServiceInfo::new(SERVICE, instance, &host_of(pin), addresses, port, &txt[..])
        .map_err(|e| e.to_string())
}

/// A running announcement; dropping it, or [`Announcer::stop`], sends the
/// goodbye.
pub struct Announcer {
    daemon: ServiceDaemon,
    fullname: String,
}

impl Announcer {
    /// Announce a computer of key `pin` serving `port` on `addresses` —
    /// only on the interfaces of those addresses.
    pub fn start(port: u16, addresses: &[IpAddr], pin: &str) -> Result<Self, String> {
        let instance = instance_name()?;
        let info = service_info(&instance, port, addresses, pin)?;
        let fullname = info.get_fullname().to_owned();
        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        // Only the interfaces we serve on: the multicast does not leave by
        // any other.
        daemon
            .disable_interface(IfKind::All)
            .map_err(|e| e.to_string())?;
        for ip in addresses {
            daemon
                .enable_interface(IfKind::Addr(*ip))
                .map_err(|e| e.to_string())?;
        }
        daemon.register(info).map_err(|e| e.to_string())?;
        crate::log::info(&format!(
            "announcing {instance} on the local network while serving"
        ));
        Ok(Self { daemon, fullname })
    }

    /// The goodbye, then the daemon's end.
    pub fn stop(self) {
        drop(self);
    }
}

impl Drop for Announcer {
    fn drop(&mut self) {
        if let Ok(done) = self.daemon.unregister(&self.fullname) {
            // The goodbye is on the wire when the daemon answers.
            let _ = done.recv_timeout(Duration::from_secs(1));
        }
        let _ = self.daemon.shutdown();
        crate::log::info("the local announcement ended");
    }
}

/// A computer found announcing the pin looked for: where to try it. Only an
/// address to try — the pinned key is checked there before it is kept.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Seen {
    /// The announced addresses that a computer serving may have: private
    /// ones (`net::private_ip`), at most [`MOST_ADDRESSES`].
    pub addresses: Vec<IpAddr>,
    pub port: u16,
}

/// Read one announcement for `pin`: `None` when it is not that pin's, has
/// no port, or no address this mode could serve on. Text from the network,
/// untrusted: compared, never shown.
#[must_use]
pub fn read(
    pin: &str,
    port: u16,
    addresses: &[IpAddr],
    txt: &BTreeMap<String, String>,
) -> Option<Seen> {
    if pin.is_empty() || port == 0 || txt.get("pin").map(String::as_str) != Some(pin) {
        return None;
    }
    let mut kept: Vec<IpAddr> = Vec::new();
    for ip in addresses.iter().map(IpAddr::to_canonical) {
        if net::private_ip(ip) && !kept.contains(&ip) && kept.len() < MOST_ADDRESSES {
            kept.push(ip);
        }
    }
    if kept.is_empty() {
        return None;
    }
    Some(Seen {
        addresses: kept,
        port,
    })
}

/// Look on the network, for at most `within`, for a computer announcing
/// `pin`: the first announcement of it found, or `None`. On a phone the
/// caller holds the multicast lock (Android) around it.
pub fn find(pin: &str, within: Duration) -> Result<Option<Seen>, String> {
    let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
    let events = daemon.browse(SERVICE).map_err(|e| e.to_string())?;
    let until = Instant::now() + within;
    let mut found = None;
    while found.is_none() {
        let left = until.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break;
        }
        match events.recv_timeout(left) {
            Ok(ServiceEvent::ServiceResolved(r)) => {
                let txt: BTreeMap<String, String> = r
                    .get_properties()
                    .iter()
                    .map(|p| (p.key().to_owned(), p.val_str().to_owned()))
                    .collect();
                let ips: Vec<IpAddr> = r.get_addresses().iter().map(|a| a.to_ip_addr()).collect();
                found = read(pin, r.get_port(), &ips, &txt);
            }
            Ok(_) | Err(mdns_sd::RecvTimeoutError::Timeout) => {}
            Err(mdns_sd::RecvTimeoutError::Disconnected) => break,
        }
    }
    let _ = daemon.stop_browse(SERVICE);
    let _ = daemon.shutdown();
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PIN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn txt(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect()
    }

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    /// The instance carries four random hexadecimal digits and no name of
    /// the person or the computer; the host is the pin's; the TXT holds the
    /// version, the port and the pin, and nothing else.
    #[test]
    fn the_announcement_says_only_that_a_verso_computer_is_here_and_its_pin() {
        let name = instance_name().unwrap();
        assert!(name.starts_with("Verso-"), "{name}");
        assert_eq!(name.len(), 10);
        assert!(name[6..].bytes().all(|b| b.is_ascii_hexdigit()), "{name}");
        let ips: Vec<IpAddr> = vec![ip("192.168.1.20")];
        let info = service_info("Verso-ab12", 51234, &ips, PIN).unwrap();
        assert_eq!(info.get_type(), SERVICE);
        assert_eq!(info.get_fullname(), "Verso-ab12._verso-local._tcp.local.");
        assert_eq!(info.get_hostname(), "verso-0123456789abcdef0123.local.");
        assert_eq!(info.get_port(), 51234);
        let props = info.get_properties();
        let mut keys: Vec<&str> = props.iter().map(mdns_sd::TxtProperty::key).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["pin", "port", "v"]);
        assert_eq!(props.get_property_val_str("v"), Some("2"));
        assert_eq!(props.get_property_val_str("port"), Some("51234"));
        assert_eq!(props.get_property_val_str("pin"), Some(PIN));
        // The computer's own name is nowhere in it.
        let host = std::env::var("HOSTNAME").unwrap_or_default();
        if !host.is_empty() {
            assert!(!format!("{info:?}").contains(&host));
        }
    }

    #[test]
    fn two_announcements_get_two_names() {
        let names: std::collections::HashSet<String> =
            (0..20).map(|_| instance_name().unwrap()).collect();
        assert!(names.len() > 1);
    }

    /// Only the pin looked for is read, at private addresses, bounded; a
    /// record of another pin, or with no pin, port or private address, is
    /// nothing to try.
    #[test]
    fn a_finding_is_the_pins_own_at_private_addresses_only() {
        let mine = txt(&[("v", "2"), ("port", "51234"), ("pin", PIN)]);
        let seen = read(
            PIN,
            51234,
            &[
                ip("203.0.113.5"),
                ip("127.0.0.1"),
                ip("192.168.1.30"),
                ip("::ffff:10.0.0.9"),
                ip("192.168.1.30"),
            ],
            &mine,
        )
        .unwrap();
        assert_eq!(seen.port, 51234);
        assert_eq!(seen.addresses, [ip("192.168.1.30"), ip("10.0.0.9")]);
        let other = txt(&[("pin", &"f".repeat(64))]);
        assert!(read(PIN, 51234, &[ip("192.168.1.30")], &other).is_none());
        assert!(read(PIN, 51234, &[ip("192.168.1.30")], &txt(&[])).is_none());
        assert!(read(PIN, 0, &[ip("192.168.1.30")], &mine).is_none());
        assert!(read(PIN, 51234, &[ip("8.8.8.8")], &mine).is_none());
        assert!(read("", 51234, &[ip("192.168.1.30")], &txt(&[("pin", "")])).is_none());
        let many: Vec<IpAddr> = (1..=40).map(|n| ip(&format!("10.0.0.{n}"))).collect();
        assert_eq!(
            read(PIN, 1, &many, &mine).unwrap().addresses.len(),
            MOST_ADDRESSES
        );
    }

    /// On a real network: one announces, the other finds it by its pin. It
    /// needs multicast on this machine, so it is run by hand
    /// (`cargo test -p verso-server --lib -- --ignored announce`).
    #[test]
    #[ignore = "needs multicast on this machine"]
    fn an_announcement_is_found_by_its_pin() {
        use super::net::Interfaces as _;
        let ips: Vec<IpAddr> = net::servable(&net::System.list())
            .into_iter()
            .map(|n| n.ip)
            .collect();
        let _on = Announcer::start(47341, &ips, PIN).unwrap();
        let seen = find(PIN, Duration::from_secs(10))
            .unwrap()
            .expect("the announcement was not found in 10 s");
        assert_eq!(seen.port, 47341);
        assert!(seen.addresses.iter().any(|a| ips.contains(a)), "{seen:?}");
        assert!(
            find(&"e".repeat(64), Duration::from_secs(2))
                .unwrap()
                .is_none()
        );
    }
}
