// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! mDNS (ADR 0096 item 8): the laptop is announced **only while the
//! pairing dialog is open**, so that a second Verso desktop can find it at
//! the one moment it may also pair — and the laptop is invisible the rest
//! of the time. Service type `_verso-local._tcp`; the instance name is
//! `Verso-` and four random hexadecimal digits, **never the computer's or
//! the person's name**; the TXT record holds the protocol version and the
//! port and nothing else — no folder name, no account. A goodbye is sent
//! when the announcement ends: the dialog closed, serving stopped, the
//! computer going to sleep or the app quitting. Discovery lists; it never
//! trusts: a desktop that found the laptop pairs by the same QR or code.

use std::net::IpAddr;

use mdns_sd::{IfKind, ServiceDaemon, ServiceInfo};

/// The service type announced. The name is this project's own; nothing is
/// registered with anyone.
pub const SERVICE: &str = "_verso-local._tcp.local.";

/// The protocol the TXT record says: this mode's own, not the contract's
/// (the QR carries that).
pub const PROTOCOL: u32 = 1;

/// `Verso-` and four random hexadecimal digits.
pub fn instance_name() -> Result<String, String> {
    let mut b = [0_u8; 2];
    getrandom::fill(&mut b).map_err(|e| e.to_string())?;
    Ok(format!("Verso-{:02x}{:02x}", b[0], b[1]))
}

/// The record announced for `instance`: its TXT is the version and the
/// port.
pub fn service_info(
    instance: &str,
    port: u16,
    addresses: &[IpAddr],
) -> Result<ServiceInfo, String> {
    let host = format!("{}.local.", instance.to_lowercase());
    let txt = [
        ("v".to_owned(), PROTOCOL.to_string()),
        ("port".to_owned(), port.to_string()),
    ];
    ServiceInfo::new(SERVICE, instance, &host, addresses, port, &txt[..]).map_err(|e| e.to_string())
}

/// A running announcement; dropping it, or [`Announcer::stop`], sends the
/// goodbye.
pub struct Announcer {
    daemon: ServiceDaemon,
    fullname: String,
}

impl Announcer {
    /// Announce `port` on `addresses` — only on the interfaces of those
    /// addresses.
    pub fn start(port: u16, addresses: &[IpAddr]) -> Result<Self, String> {
        let instance = instance_name()?;
        let info = service_info(&instance, port, addresses)?;
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
            "announcing {instance} on the local network (pairing dialog open)"
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
            let _ = done.recv_timeout(std::time::Duration::from_secs(1));
        }
        let _ = self.daemon.shutdown();
        crate::log::info("the local announcement ended");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The instance carries four random hexadecimal digits and no name of
    /// the person or the computer; the TXT holds the version and the port
    /// and nothing else.
    #[test]
    fn the_announcement_names_neither_the_person_nor_the_computer() {
        let name = instance_name().unwrap();
        assert!(name.starts_with("Verso-"), "{name}");
        assert_eq!(name.len(), 10);
        assert!(name[6..].bytes().all(|b| b.is_ascii_hexdigit()), "{name}");
        let ips: Vec<IpAddr> = vec!["192.168.1.20".parse().unwrap()];
        let info = service_info("Verso-ab12", 51234, &ips).unwrap();
        assert_eq!(info.get_type(), SERVICE);
        assert_eq!(info.get_fullname(), "Verso-ab12._verso-local._tcp.local.");
        assert_eq!(info.get_hostname(), "verso-ab12.local.");
        assert_eq!(info.get_port(), 51234);
        let props = info.get_properties();
        let mut keys: Vec<&str> = props.iter().map(mdns_sd::TxtProperty::key).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["port", "v"]);
        assert_eq!(props.get_property_val_str("v"), Some("1"));
        assert_eq!(props.get_property_val_str("port"), Some("51234"));
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
}
