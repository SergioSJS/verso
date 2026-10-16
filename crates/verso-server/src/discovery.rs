// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A UniVerso found on the home network by itself (the maintainer,
//! 2026-10-16, after a long install: *"Era pra simplesmente plugar e
//! funcionar como qualquer outro sincronizador"*; ADR 0097). The server
//! announces itself by mDNS/DNS-SD as `_verso._tcp` when it listens beyond
//! loopback, and the desktop app lists what it finds while the servers
//! section is open.
//!
//! What is announced, and nothing else: an instance name of `UniVerso-` and
//! six random hexadecimal digits, the port (the SRV record), and a TXT
//! record of three keys — `v` (the server's version), `https` (`0` or `1`)
//! and `id` (the same six digits). Never the computer's name, a folder's,
//! an account's. **The announcement is unauthenticated**: anyone on the
//! network can make one. So what is read from it is data to show, never to
//! trust: the app fills an address after the person clicks, shows the
//! address it will connect to, and sends no credential because of it.
//!
//! The same module announces and browses so the record and its reading
//! stay one thing, tested together. Separate from `local::announce`, which
//! is the pairing dialog's (`_verso-local._tcp`, ADR 0096).

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use mdns_sd::{ResolvedService, ServiceDaemon, ServiceEvent, ServiceInfo};

use crate::config::Config;

/// The service type. The name is this project's own; nothing is registered
/// with anyone.
pub const SERVICE: &str = "_verso._tcp.local.";

/// How many announcements a browse keeps: anyone on the network can make
/// one, so the list is bounded.
const KEPT: usize = 50;

/// How many characters of an announced name or version the app keeps: what
/// arrives from the network is bounded before it reaches a screen.
const SHOWN: usize = 40;

/// Whether this server announces itself: listening beyond loopback, and
/// `VERSO_ANNOUNCE` not `off`.
#[must_use]
pub fn announces(config: &Config) -> bool {
    config.announce && !config.listen.ip().is_loopback()
}

/// `UniVerso-` and the id.
fn instance(id: &str) -> String {
    format!("UniVerso-{id}")
}

/// Six random hexadecimal digits: told apart, never identifying.
fn new_id() -> Result<String, String> {
    let mut b = [0_u8; 3];
    getrandom::fill(&mut b).map_err(|e| e.to_string())?;
    Ok(format!("{:02x}{:02x}{:02x}", b[0], b[1], b[2]))
}

/// The record announced: the TXT is the version, whether it is HTTPS, and
/// the id.
pub fn service_info(
    id: &str,
    port: u16,
    https: bool,
    version: &str,
) -> Result<ServiceInfo, String> {
    let name = instance(id);
    let host = format!("{}.local.", name.to_lowercase());
    let txt = [
        ("v".to_owned(), version.to_owned()),
        ("https".to_owned(), if https { "1" } else { "0" }.to_owned()),
        ("id".to_owned(), id.to_owned()),
    ];
    // The addresses are the machine's own, followed as they change.
    Ok(ServiceInfo::new(SERVICE, &name, &host, "", port, &txt[..])
        .map_err(|e| e.to_string())?
        .enable_addr_auto())
}

/// A running announcement; dropping it sends the goodbye.
pub struct Announcer {
    daemon: ServiceDaemon,
    fullname: String,
}

/// Announce this server when it should be (see [`announces`]); `None` when
/// it should not, or when announcing failed — which is logged, never
/// fatal: the server works without being found.
#[must_use]
pub fn announce(config: &Config, https: bool) -> Option<Announcer> {
    if !announces(config) {
        return None;
    }
    let started = new_id().and_then(|id| {
        let info = service_info(&id, config.listen.port(), https, env!("CARGO_PKG_VERSION"))?;
        let fullname = info.get_fullname().to_owned();
        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        daemon.register(info).map_err(|e| e.to_string())?;
        Ok((Announcer { daemon, fullname }, id))
    });
    match started {
        Ok((a, id)) => {
            crate::log::info(&format!(
                "announcing this server on the local network as {} (VERSO_ANNOUNCE=off turns it off)",
                instance(&id)
            ));
            Some(a)
        }
        Err(e) => {
            crate::log::warn(&format!(
                "could not announce this server on the local network: {e}"
            ));
            None
        }
    }
}

impl Drop for Announcer {
    fn drop(&mut self) {
        if let Ok(done) = self.daemon.unregister(&self.fullname) {
            let _ = done.recv_timeout(Duration::from_secs(1));
        }
        let _ = self.daemon.shutdown();
    }
}

/// A server someone announced on the network, as far as it can be read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Found {
    /// The announcement's full name: what a removal names.
    pub fullname: String,
    /// The instance's name, `UniVerso-ab12cd`.
    pub name: String,
    /// The announced host, `universo-ab12cd.local`.
    pub host: String,
    pub port: u16,
    pub https: bool,
    pub version: String,
    pub id: String,
    /// Usable addresses, the likeliest first.
    pub addresses: Vec<IpAddr>,
}

impl Found {
    /// The address to connect to: `http(s)://ip[:port]`, the port left out
    /// when it is the scheme's own.
    #[must_use]
    pub fn url(&self) -> Option<String> {
        let ip = self.addresses.first()?;
        let scheme = if self.https { "https" } else { "http" };
        let host = match ip {
            IpAddr::V4(v) => v.to_string(),
            IpAddr::V6(v) => format!("[{v}]"),
        };
        let default = if self.https { 443 } else { 80 };
        Some(if self.port == default {
            format!("{scheme}://{host}")
        } else {
            format!("{scheme}://{host}:{}", self.port)
        })
    }
}

/// Text from the network, made safe to show: printable characters only,
/// bounded.
fn tame(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control())
        .take(SHOWN)
        .collect::<String>()
        .trim()
        .to_owned()
}

/// An address worth connecting to: not this machine, not nothing, not a
/// multicast, not link-local (which needs an interface to mean anything).
fn usable(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            !(v.is_loopback()
                || v.is_unspecified()
                || v.is_multicast()
                || v.is_link_local()
                || v.is_broadcast())
        }
        IpAddr::V6(v) => {
            !(v.is_loopback()
                || v.is_unspecified()
                || v.is_multicast()
                || (v.segments()[0] & 0xffc0) == 0xfe80)
        }
    }
}

/// The addresses announced, the usable ones, IPv4 private first (what a
/// home network is), then other IPv4, then IPv6; each group in order.
fn rank(mut ips: Vec<IpAddr>) -> Vec<IpAddr> {
    ips.retain(usable);
    ips.sort_by_key(|ip| match ip {
        IpAddr::V4(v) if v.is_private() => (0, *ip),
        IpAddr::V4(_) => (1, *ip),
        IpAddr::V6(_) => (2, *ip),
    });
    ips.dedup();
    ips
}

/// Read one announcement. `None` when it cannot be a UniVerso's: no port,
/// no usable address, no readable name. The fields are untrusted text.
#[must_use]
pub fn read(
    fullname: &str,
    host: &str,
    port: u16,
    addresses: Vec<IpAddr>,
    txt: &BTreeMap<String, String>,
) -> Option<Found> {
    let label = fullname.strip_suffix(&format!(".{SERVICE}"))?;
    let name = tame(label);
    let addresses = rank(addresses);
    if port == 0 || name.is_empty() || addresses.is_empty() {
        return None;
    }
    Some(Found {
        fullname: fullname.to_owned(),
        name,
        host: tame(host.trim_end_matches('.')),
        port,
        https: txt.get("https").is_some_and(|v| v == "1"),
        version: tame(txt.get("v").map_or("", String::as_str)),
        id: tame(txt.get("id").map_or("", String::as_str)),
        addresses,
    })
}

fn found_of(r: &ResolvedService) -> Option<Found> {
    let txt: BTreeMap<String, String> = r
        .get_properties()
        .iter()
        .map(|p| (p.key().to_owned(), p.val_str().to_owned()))
        .collect();
    let ips = r.get_addresses().iter().map(|a| a.to_ip_addr()).collect();
    read(r.get_fullname(), r.get_hostname(), r.get_port(), ips, &txt)
}

/// Remember `f`, unless the list is full of others.
fn keep(all: &mut BTreeMap<String, Found>, f: Found) {
    if all.len() < KEPT || all.contains_key(&f.fullname) {
        all.insert(f.fullname.clone(), f);
    }
}

/// A browse for servers on the network, running until dropped.
pub struct Browser {
    daemon: ServiceDaemon,
    found: Arc<Mutex<BTreeMap<String, Found>>>,
    stop: Arc<AtomicBool>,
}

impl Browser {
    /// Start looking. Fails when the network offers no multicast.
    pub fn start() -> Result<Self, String> {
        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        let events = daemon.browse(SERVICE).map_err(|e| e.to_string())?;
        let found: Arc<Mutex<BTreeMap<String, Found>>> = Arc::default();
        let stop = Arc::new(AtomicBool::new(false));
        let (shared, done) = (Arc::clone(&found), Arc::clone(&stop));
        std::thread::spawn(move || {
            while !done.load(Ordering::Relaxed) {
                match events.recv_timeout(Duration::from_millis(500)) {
                    Ok(ServiceEvent::ServiceResolved(r)) => {
                        if let Some(f) = found_of(&r) {
                            keep(
                                &mut shared.lock().unwrap_or_else(PoisonError::into_inner),
                                f,
                            );
                        }
                    }
                    Ok(ServiceEvent::ServiceRemoved(_, fullname)) => {
                        shared
                            .lock()
                            .unwrap_or_else(PoisonError::into_inner)
                            .remove(&fullname);
                    }
                    Ok(_) | Err(mdns_sd::RecvTimeoutError::Timeout) => {}
                    Err(mdns_sd::RecvTimeoutError::Disconnected) => break,
                }
            }
        });
        Ok(Self {
            daemon,
            found,
            stop,
        })
    }

    /// What has been found so far, by name.
    #[must_use]
    pub fn list(&self) -> Vec<Found> {
        let mut all: Vec<Found> = self
            .found
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .values()
            .cloned()
            .collect();
        all.sort_by(|a, b| a.name.cmp(&b.name));
        all
    }
}

impl Drop for Browser {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = self.daemon.stop_browse(SERVICE);
        let _ = self.daemon.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn txt(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect()
    }

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    /// The record holds the version, https and the id — and not the
    /// computer's name, a folder's or an account's.
    #[test]
    fn the_announcement_says_only_that_a_server_is_here() {
        let id = new_id().unwrap();
        assert_eq!(id.len(), 6);
        assert!(id.bytes().all(|b| b.is_ascii_hexdigit()));
        let info = service_info(&id, 7340, true, "0.8.4").unwrap();
        assert_eq!(info.get_type(), SERVICE);
        assert_eq!(info.get_port(), 7340);
        assert_eq!(info.get_fullname(), format!("UniVerso-{id}.{SERVICE}"));
        let props = info.get_properties();
        let mut keys: Vec<&str> = props.iter().map(mdns_sd::TxtProperty::key).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["https", "id", "v"]);
        assert_eq!(props.get_property_val_str("https"), Some("1"));
        assert_eq!(props.get_property_val_str("v"), Some("0.8.4"));
        assert_eq!(props.get_property_val_str("id"), Some(id.as_str()));
        let all = format!("{info:?}");
        let host = std::env::var("HOSTNAME").unwrap_or_default();
        if !host.is_empty() {
            assert!(!all.contains(&host), "{all}");
        }
        let plain = service_info(&id, 80, false, "0.8.4").unwrap();
        assert_eq!(
            plain.get_properties().get_property_val_str("https"),
            Some("0")
        );
    }

    #[test]
    fn it_is_announced_beyond_loopback_unless_turned_off() {
        let mut c = Config::for_local("/x".into(), "/y".into(), "127.0.0.1:7340".parse().unwrap());
        c.announce = true;
        assert!(!announces(&c), "loopback only: never announced");
        c.listen = "0.0.0.0:7340".parse().unwrap();
        assert!(announces(&c));
        c.listen = "192.168.1.5:7340".parse().unwrap();
        assert!(announces(&c));
        c.announce = false;
        assert!(!announces(&c), "VERSO_ANNOUNCE=off");
        assert!(announce(&c, false).is_none());
    }

    #[test]
    fn a_flood_of_announcements_fills_the_list_only_so_far() {
        let one = |n: usize| {
            read(
                &format!("UniVerso-{n:06x}._verso._tcp.local."),
                "h.local.",
                80,
                vec![ip("192.168.1.9")],
                &BTreeMap::new(),
            )
            .unwrap()
        };
        let mut all = BTreeMap::new();
        for n in 0..500 {
            keep(&mut all, one(n));
        }
        assert_eq!(all.len(), KEPT);
        // One already kept is still updated.
        keep(&mut all, one(3));
        assert_eq!(all.len(), KEPT);
    }

    #[test]
    fn an_announcement_is_read_into_an_address() {
        let f = read(
            "UniVerso-ab12cd._verso._tcp.local.",
            "universo-ab12cd.local.",
            7340,
            vec![
                ip("fe80::1"),
                ip("10.0.0.7"),
                ip("192.168.1.9"),
                ip("127.0.0.1"),
            ],
            &txt(&[("v", "0.8.4"), ("https", "0"), ("id", "ab12cd")]),
        )
        .unwrap();
        assert_eq!(f.name, "UniVerso-ab12cd");
        assert_eq!(f.host, "universo-ab12cd.local");
        assert!(!f.https);
        assert_eq!(f.addresses, [ip("10.0.0.7"), ip("192.168.1.9")]);
        assert_eq!(f.url().as_deref(), Some("http://10.0.0.7:7340"));
        let s = read(
            "UniVerso-ab12cd._verso._tcp.local.",
            "h.local.",
            443,
            vec![ip("192.168.1.9")],
            &txt(&[("https", "1")]),
        )
        .unwrap();
        assert_eq!(s.url().as_deref(), Some("https://192.168.1.9"));
    }

    /// What arrives from the network is bounded and cleaned; an
    /// announcement that cannot be a server is dropped.
    #[test]
    fn what_the_network_says_is_not_trusted() {
        let long = "x".repeat(500);
        let f = read(
            &format!("{long}._verso._tcp.local."),
            "h.local.",
            80,
            vec![ip("192.168.1.9")],
            &txt(&[("v", &format!("1.0\n\u{7}{long}"))]),
        )
        .unwrap();
        assert_eq!(f.name.chars().count(), SHOWN);
        assert!(f.version.chars().count() <= SHOWN);
        assert!(!f.version.chars().any(char::is_control));
        let none = |port, ips: Vec<IpAddr>, name: &str| {
            read(name, "h.local.", port, ips, &BTreeMap::new())
        };
        let ok = "UniVerso-1._verso._tcp.local.";
        assert!(none(0, vec![ip("10.0.0.1")], ok).is_none());
        assert!(none(80, vec![], ok).is_none());
        assert!(none(80, vec![ip("0.0.0.0"), ip("224.0.0.251")], ok).is_none());
        assert!(none(80, vec![ip("10.0.0.1")], "UniVerso-1._other._tcp.local.").is_none());
    }

    /// On a real network: one announces, the other browses, they meet. It
    /// needs multicast on this machine, so it is run by hand
    /// (`cargo test -p verso-server --lib -- --ignored discovery`).
    #[test]
    #[ignore = "needs multicast on this machine"]
    fn an_announcement_is_found_by_a_browse() {
        let mut c = Config::for_local("/x".into(), "/y".into(), "0.0.0.0:47340".parse().unwrap());
        c.announce = true;
        let _announced = announce(&c, false).unwrap();
        let browser = Browser::start().unwrap();
        let mut found = Vec::new();
        for _ in 0..40 {
            std::thread::sleep(Duration::from_millis(250));
            found = browser.list();
            if !found.is_empty() {
                break;
            }
        }
        let f = found
            .first()
            .expect("the announcement was not found in 10 s");
        assert!(f.name.starts_with("UniVerso-"), "{f:?}");
        assert_eq!(f.port, 47340);
        assert!(!f.https);
        assert!(f.url().is_some(), "{f:?}");
    }
}
