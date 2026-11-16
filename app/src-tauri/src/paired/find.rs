// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A computer at home found again at an address this app never saw (ADR
//! 0117 D19 item 5, the maintainer's decision of 2026-11-15, *decisões 4.2
//! "B"*): a new DHCP lease, the laptop on its other network. While it
//! serves on the network the computer announces itself with its key's pin
//! (`verso_server::local::announce`); when **none of the addresses known
//! answers**, this app looks for that pin on the network and tries what it
//! finds.
//!
//! **Found is not trusted.** Anyone on the network can announce any pin.
//! An address found is kept only after a TLS handshake **there** showed the
//! pinned key (`Pinned::probe`: the same check as every connection's, the
//! handshake's signature by that key included); an impostor announcing the
//! pin fails it, is kept nowhere, sees nothing but a TLS hello, and is not
//! said as "this computer's identity changed" — the computer itself may be
//! somewhere else, still unfound.
//!
//! How it looks, by platform: the desktop and Android browse
//! `_verso-local._tcp` (Android holds a multicast lock meanwhile, ADR 0118
//! item 3.1); iOS sends no raw multicast without an entitlement (ADR 0119
//! A4), so it asks the system's resolver — Apple's mDNS, under the
//! *local network* permission — for the host the record names
//! (`verso-<20 digits>.local`). At most once every 30 seconds per computer:
//! away from home, every retry of the sync would otherwise look.

use std::collections::BTreeMap;
use std::net::{IpAddr, SocketAddr, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use verso_service::lock;

use super::{Entry, Pinned, TABLE, config, remember};

/// How long one look on the network lasts.
#[cfg(not(test))]
const LOOK: Duration = Duration::from_secs(4);

/// One look per computer at most this often.
const EVERY: Duration = Duration::from_secs(30);

/// One probe: the TCP connection and the TLS handshake.
const PROBE: Duration = Duration::from_secs(3);

/// When each computer was last looked for, by name.
static LOOKED: Mutex<BTreeMap<String, Instant>> = Mutex::new(BTreeMap::new());

/// What a look found, for the tests: no network is ever asked in them.
#[cfg(test)]
static PRETEND: Mutex<BTreeMap<String, Vec<SocketAddr>>> = Mutex::new(BTreeMap::new());

/// The network's answer for `pin`, in a test.
#[cfg(test)]
pub(super) fn pretend_found(pin: &str, at: Vec<SocketAddr>) {
    lock(&PRETEND).insert(pin.to_owned(), at);
}

/// Where the network says a computer of `pin`, reached on `port`, is.
#[cfg(test)]
fn look(pin: &str, _port: u16) -> Vec<SocketAddr> {
    lock(&PRETEND).get(pin).cloned().unwrap_or_default()
}

/// Where the network says a computer of `pin`, reached on `port`, is: the
/// browse on the desktop and Android, the system's resolver on iOS.
#[cfg(not(test))]
fn look(pin: &str, port: u16) -> Vec<SocketAddr> {
    use verso_server::local::announce;
    if cfg!(target_os = "ios") {
        use std::net::ToSocketAddrs as _;
        let host = announce::host_of(pin);
        let host = host.trim_end_matches('.');
        return (host, port)
            .to_socket_addrs()
            .map(|all| all.collect())
            .unwrap_or_default();
    }
    #[cfg(target_os = "android")]
    crate::phone::multicast("paired", true);
    let seen = announce::find(pin, LOOK);
    #[cfg(target_os = "android")]
    crate::phone::multicast("paired", false);
    match seen {
        Ok(Some(seen)) => seen
            .addresses
            .into_iter()
            .map(|ip| SocketAddr::new(ip, seen.port))
            .collect(),
        Ok(None) => Vec::new(),
        Err(e) => {
            crate::log::write(
                "WARN",
                "host",
                &format!("looking for the computer at home on the network: {e}"),
            );
            Vec::new()
        }
    }
}

/// Whether the computer of `host`, pinned to `pin`, answers at `at` with
/// that key: a TLS handshake and nothing sent over it.
pub(super) fn holds_key(host: &str, pin: &str, at: SocketAddr) -> bool {
    let Ok(tls) = config(Arc::new(Pinned::probe(host, pin))) else {
        return false;
    };
    let Ok(name) = rustls::pki_types::ServerName::try_from(host.to_owned()) else {
        return false;
    };
    let Ok(mut conn) = rustls::ClientConnection::new(Arc::new(tls), name) else {
        return false;
    };
    let Ok(mut tcp) = TcpStream::connect_timeout(&at, PROBE) else {
        return false;
    };
    if tcp.set_read_timeout(Some(PROBE)).is_err() || tcp.set_write_timeout(Some(PROBE)).is_err() {
        return false;
    }
    let until = Instant::now() + PROBE;
    while conn.is_handshaking() {
        if Instant::now() > until || conn.complete_io(&mut tcp).is_err() {
            return false;
        }
    }
    true
}

/// `host` is a paired computer none of whose known addresses answered:
/// look for it on the network by its pin, and keep the first address found
/// where it holds its key, first among its addresses (in memory and in the
/// configuration). `true` when one was kept — the request may be sent
/// again. `false` at once for any other name, or within [`EVERY`] of the
/// last look.
pub(crate) fn find_again(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    let Some(entry) = lock(&TABLE).get(&host).cloned() else {
        return false;
    };
    {
        let mut looked = lock(&LOOKED);
        let now = Instant::now();
        if looked
            .get(&host)
            .is_some_and(|at| now.duration_since(*at) < EVERY)
        {
            return false;
        }
        looked.insert(host.clone(), now);
    }
    let Some(port) = reqwest::Url::parse(&entry.url)
        .ok()
        .and_then(|u| u.port_or_known_default())
    else {
        return false;
    };
    let found = look(&entry.pin, port);
    // The URL keeps its port (ADR 0096 item 4): another port is no address
    // of it; one it was already tried at is no news.
    let fresh = found
        .into_iter()
        .filter(|a| a.port() == port && !entry.addresses.contains(&a.ip()));
    for at in fresh {
        if holds_key(&host, &entry.pin, at) {
            keep_found(&host, &entry, at.ip());
            crate::log::write(
                "INFO",
                "host",
                &format!(
                    "the computer at home was found on the network at a new address: {}",
                    at.ip()
                ),
            );
            return true;
        }
        crate::log::write(
            "WARN",
            "host",
            &format!(
                "an announcement of the computer at home at {} did not hold its key: ignored",
                at.ip()
            ),
        );
    }
    false
}

/// `ip`, where `host`'s key answered, first among its addresses.
fn keep_found(host: &str, entry: &Entry, ip: IpAddr) {
    if let Some(e) = lock(&TABLE).get_mut(host) {
        e.addresses.retain(|a| *a != ip);
        e.addresses.insert(0, ip);
    }
    remember(entry.config.as_deref(), &entry.url, &[ip.to_string()]);
}
