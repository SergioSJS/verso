// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The port the laptop serves on (ADR 0096 item 4): kept from the first
//! time, waited for while an old listener closes, a new one when taken.

use std::net::SocketAddr;
use std::time::Duration;

use super::PORT;
use super::net::IfNet;
use crate::db::Db;

/// Whether a connection to `addr` is accepted within two seconds.
#[must_use]
pub fn reachable(addr: SocketAddr) -> bool {
    std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(2)).is_ok()
}

/// A port from the dynamic range (49152–65535).
fn random_port() -> Result<u16, String> {
    let mut b = [0_u8; 2];
    getrandom::fill(&mut b).map_err(|e| e.to_string())?;
    Ok(49_152 + u16::from_le_bytes(b) % (65_536 - 49_152) as u16)
}

/// One listener. The port kept from the first time is tried for a while:
/// turning serving off does not wait for the listeners to close (see
/// [`Running`]'s drop), and a socket that is still closing refuses a bind
/// on Windows, and on a slow machine elsewhere — a person who turns serving
/// off and on again would be handed another port, and every phone's saved
/// address would be wrong (item 4). Another program holding it still ends
/// in a new port, after the wait.
fn bind_one(addr: SocketAddr, kept: bool) -> Option<std::net::TcpListener> {
    let tries = if kept { KEPT_PORT_TRIES } else { 1 };
    for i in 0..tries {
        if let Ok(l) = std::net::TcpListener::bind(addr) {
            return Some(l);
        }
        if i + 1 < tries {
            std::thread::sleep(KEPT_PORT_WAIT);
        }
    }
    None
}

/// How long the kept port is waited for: 100 times 50 ms.
const KEPT_PORT_TRIES: u32 = 100;
const KEPT_PORT_WAIT: Duration = Duration::from_millis(50);

/// A listener on every address at one port: the port kept from the first
/// time, a new one chosen when it is taken (item 4).
pub(super) fn bind_all(
    db: &Db,
    nets: &[IfNet],
) -> Result<(Vec<std::net::TcpListener>, u16), String> {
    let kept: Option<u16> = db.setting(PORT)?.and_then(|s| s.parse().ok());
    let mut candidates: Vec<u16> = kept.into_iter().collect();
    for _ in 0..20 {
        candidates.push(random_port()?);
    }
    'ports: for port in candidates {
        let mut listeners = Vec::new();
        for n in nets {
            let Some(l) = bind_one(SocketAddr::new(n.ip, port), kept == Some(port)) else {
                continue 'ports;
            };
            l.set_nonblocking(true).map_err(|e| e.to_string())?;
            listeners.push(l);
        }
        if kept != Some(port) {
            db.set_setting(PORT, &port.to_string())?;
        }
        return Ok((listeners, port));
    }
    Err("no free port on this computer's addresses".to_owned())
}
