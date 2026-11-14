// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The door the internet link comes in by (ADR 0117 D3 items 3 and 4):
//! one more listener of the one server, on `127.0.0.1` at a random port,
//! in **plain HTTP** — the tunnel (`cloudflared`, S5) ends HTTPS and is
//! told this address — admitting loopback alone. The network's listeners
//! keep every rule of ADR 0096; the two boxes are independent: the
//! network, the link, both (D1, D4 Q2).
//!
//! What this listener believes and answers differs from the network's,
//! and only here:
//!
//! - its proxies are `127.0.0.1` and `::1`, **named**
//!   ([`crate::proxy::Proxies::loopback`]): the address the tunnel
//!   forwards, the rightmost of `X-Forwarded-For` that the spike of
//!   2026-11-03 found a client cannot forge, keys every delay, pace and
//!   count, and a forwarded loopback is never "this machine";
//! - its `Host` is the link's name and no other, none while the link has
//!   no address; its `Origin` is the link's; the cookie is `Secure` from
//!   the tunnel's `X-Forwarded-Proto` ([`crate::auth::peer`]);
//! - the links the server hands out (an invitation's) are built from the
//!   link's origin while it has one ([`crate::window_link`]).
//!
//! A request carries [`ByLink`] as an extension, put there by this
//! listener's router alone: nothing a client sends can set it.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use super::{LocalServer, Policy, lock};
use crate::state::Server;

/// The mark of a request that came in by the link's listener.
#[derive(Debug, Clone, Copy)]
pub struct ByLink;

/// Whether the request whose extensions are `ext` came in by the link's
/// listener.
#[must_use]
pub fn by_link(ext: &axum::http::Extensions) -> bool {
    ext.get::<ByLink>().is_some()
}

/// Who may connect to the link's listener: this machine alone — the tunnel
/// runs on it. Never a peer of the network.
#[must_use]
pub fn admits(ip: IpAddr) -> bool {
    ip.to_canonical().is_loopback()
}

/// The link's public origin, as checked: `https://<name>` (a port only
/// when one is written), lower-cased, and the `Host` a request through it
/// carries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Origin {
    pub origin: String,
    pub authority: String,
}

/// `text` as a link's origin: HTTPS (the tunnel ends TLS; a quick link and
/// an own address are both HTTPS), a DNS name of labels, an optional port,
/// nothing after — no path, no user, no query. `Err` says why not.
pub fn origin(text: &str) -> Result<Origin, String> {
    let bad = || format!("not an https origin: {text}");
    let rest = text.trim().strip_prefix("https://").ok_or_else(bad)?;
    let rest = rest.strip_suffix('/').unwrap_or(rest);
    let (name, port) = match rest.rsplit_once(':') {
        Some((n, p)) => (n, Some(p)),
        None => (rest, None),
    };
    if let Some(p) = port
        && (p.is_empty() || p.parse::<u16>().map_or(true, |p| p == 0))
    {
        return Err(bad());
    }
    let name = name.to_ascii_lowercase();
    let label = |l: &str| {
        !l.is_empty()
            && l.len() <= 63
            && l.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            && !l.starts_with('-')
            && !l.ends_with('-')
    };
    // A name with a dot, of labels only: no bracket, no `@`, `/`, `?` or
    // `#` — none of them is a label's — and no IP literal (a last label of
    // digits).
    let numeric = name
        .rsplit('.')
        .next()
        .is_some_and(|l| l.bytes().all(|b| b.is_ascii_digit()));
    if name.len() > 253 || !name.contains('.') || numeric || !name.split('.').all(label) {
        return Err(bad());
    }
    let authority = match port {
        Some(p) => format!("{name}:{p}"),
        None => name,
    };
    Ok(Origin {
        origin: format!("https://{authority}"),
        authority,
    })
}

impl Policy {
    /// The link's origin while it has one: the base of the links handed
    /// out, and the `Origin` its pages carry.
    #[must_use]
    pub fn link_origin(&self) -> Option<String> {
        self.link
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .as_ref()
            .map(|o| o.origin.clone())
    }

    /// Whether `host` (a `Host` header) is the link's name: false whenever
    /// the link has no address.
    #[must_use]
    pub fn link_knows(&self, host: &str) -> bool {
        self.link
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .as_ref()
            .is_some_and(|o| o.authority.eq_ignore_ascii_case(host))
    }

    /// The link's listener's proxies, named: `127.0.0.1` and `::1`.
    #[must_use]
    pub fn link_proxies(&self) -> &crate::proxy::Proxies {
        &self.link_proxies
    }

    fn set_link(&self, origin: Option<Origin>) {
        *self
            .link
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = origin;
    }
}

/// The link's listener while it is open: dropping it closes it without
/// waiting (serving stopping takes the runtime with it); [`Self::close`]
/// waits for every connection to be closed.
pub(super) struct Listener {
    pub port: u16,
    stop: tokio::sync::watch::Sender<bool>,
    /// Hung up when the listener's task ends, every connection closed.
    ended: std::sync::mpsc::Receiver<()>,
}

impl Listener {
    /// Close the listener and return once its port and every connection
    /// it kept are closed (off is off): a request under way has
    /// `listen::LINK_GRACE` to be answered, an idle connection none. Not
    /// to be called on the server's own runtime, which does the closing.
    fn close(self) {
        let _ = self.stop.send(true);
        // A margin past the grace: the connections dropped at its end are
        // closed a moment after it.
        let most = crate::listen::LINK_GRACE + std::time::Duration::from_secs(1);
        if let Err(std::sync::mpsc::RecvTimeoutError::Timeout) = self.ended.recv_timeout(most) {
            crate::log::warn(&format!(
                "the internet link's listener was still closing after {} s",
                most.as_secs()
            ));
        }
    }
}

impl Drop for Listener {
    fn drop(&mut self) {
        let _ = self.stop.send(true);
    }
}

/// The connections the system queues for the link's listener while its
/// places are all held.
const BACKLOG: i32 = 1024;

/// [`BACKLOG`] as `listen` is to be told it. Windows reads a plain number
/// as 200 at most, and refuses the connection past its queue with a reset,
/// which `cloudflared` answers with a 502 (measured on Windows 11,
/// 2026-11-04: `listen(1024)` queued 200 and refused the 201st). Asked
/// `SOMAXCONN_HINT(n)`, written `-n`, it queues `n` itself (1 024
/// measured). Linux queues what is asked, up to `net.core.somaxconn`
/// (4 096), and past it drops the handshake for the client to send again.
#[cfg(windows)]
const LISTEN_BACKLOG: i32 = -BACKLOG;
#[cfg(not(windows))]
const LISTEN_BACKLOG: i32 = BACKLOG;

/// The link's socket on `127.0.0.1`, at a port the system picks, with the
/// long queue it asks for (`LISTEN_BACKLOG`): past its places a connection
/// waits there for one (`listen::Plain::for_link`). macOS keeps the queue
/// to its `kern.ipc.somaxconn`, 128, whatever is asked (only root changes
/// that), and resets past it as Windows does: 158 queued, measured
/// 2026-11-04. Called under a runtime.
///
/// socket2, not tokio's `TcpSocket`, whose `listen` takes no negative
/// number and so cannot ask Windows for its long queue.
pub(super) fn bind() -> std::io::Result<tokio::net::TcpListener> {
    let socket = socket2::Socket::new(
        socket2::Domain::IPV4,
        socket2::Type::STREAM,
        Some(socket2::Protocol::TCP),
    )?;
    socket.set_nonblocking(true)?;
    socket.bind(&SocketAddr::from((Ipv4Addr::LOCALHOST, 0)).into())?;
    socket.listen(LISTEN_BACKLOG)?;
    tokio::net::TcpListener::from_std(socket.into())
}

/// Open the link's listener on `runtime`, for `server`: `127.0.0.1`, a
/// port the system picks, plain HTTP, loopback peers alone, with places of
/// its own (`listen::LOCAL_LINK`).
pub(super) fn open(
    runtime: &tokio::runtime::Handle,
    server: &Arc<Server>,
) -> Result<Listener, String> {
    let _enter = runtime.enter();
    let said = |e: std::io::Error| format!("the internet link's listener: {e}");
    let tcp = bind().map_err(said)?;
    let port = tcp.local_addr().map_err(said)?.port();
    let slots = server
        .slots
        .beside(Arc::new(admits), crate::listen::LOCAL_LINK);
    let plain = crate::listen::Plain::for_link(tcp, slots);
    let app = super::routes::router(Arc::clone(server)).layer(axum::Extension(ByLink));
    let (stop, mut stopped) = tokio::sync::watch::channel(false);
    let (end, ended) = std::sync::mpsc::channel::<()>();
    runtime.spawn(async move {
        crate::listen::serve(plain, app, async move {
            let _ = stopped.wait_for(|s| *s).await;
        })
        .await;
        // Hung up here, or when the runtime drops this task.
        drop(end);
    });
    Ok(Listener { port, stop, ended })
}

impl LocalServer {
    /// Open the internet link's listener (the link box ticked, ADR 0117
    /// D3 item 3) and say its port, the address the tunnel is told. Serving
    /// starts if it was off — with the network's listeners too when the
    /// network box is ticked; already open, the same port is said.
    pub fn link_open(&self) -> Result<u16, String> {
        self.link_open_after(self.stops())
    }

    /// The stops counted so far: what the host reads when the person asks
    /// for the link, before `cloudflared` is downloaded and run.
    #[must_use]
    pub fn stops(&self) -> u64 {
        self.shared.stops.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// [`Self::link_open`] for a link asked for when [`Self::stops`] said
    /// `asked`: after a stop since then nothing opens and serving does not
    /// start — the person turned it off while the link was still coming
    /// (the first download of `cloudflared` can take minutes).
    pub fn link_open_after(&self, asked: u64) -> Result<u16, String> {
        {
            // Under the lock a stop counts under (`stop_inner`).
            let mut running = lock(&self.shared.inner);
            if self.stops() != asked {
                return Err(super::STOPPED_SINCE.to_owned());
            }
            if let Some(r) = running.as_mut() {
                if let Some(l) = &r.link {
                    return Ok(l.port);
                }
                let handle = r
                    .runtime
                    .as_ref()
                    .ok_or_else(|| "serving is stopping".to_owned())?
                    .handle()
                    .clone();
                let listener = open(&handle, &r.server)?;
                let port = listener.port;
                r.link = Some(listener);
                r.policy.audit(&r.server, "link_on", None, None);
                drop(running);
                crate::log::info(&format!(
                    "the internet link's listener is open on 127.0.0.1:{port}"
                ));
                (self.shared.events)(super::Event::Changed);
                return Ok(port);
            }
        }
        self.start_with(true, Some(asked))?;
        lock(&self.shared.inner)
            .as_ref()
            .and_then(|r| r.link.as_ref().map(|l| l.port))
            .ok_or_else(|| "the internet link's listener did not open".to_owned())
    }

    /// The link's public origin, once the tunnel said it (`None`: it has
    /// none — every request through the link is then refused). Needs the
    /// link's listener open. The origin is not written in the log: a link
    /// is for those it is sent to (ADR 0117 D3 item 8).
    pub fn set_link_origin(&self, text: Option<&str>) -> Result<(), String> {
        let origin = text.map(origin).transpose()?;
        let running = lock(&self.shared.inner);
        let r = running
            .as_ref()
            .filter(|r| r.link.is_some())
            .ok_or_else(|| "the internet link is off".to_owned())?;
        let said = origin.is_some();
        let old = r.policy.link_origin();
        let new = origin.as_ref().map(|o| o.origin.clone());
        r.policy.set_link(origin);
        // A quick link's address ended: the phones paired through it end
        // with it (ADR 0117 D5 (3)).
        if super::link_pair::ends(old.as_deref(), new.as_deref()) {
            super::link_pair::end(&r.server, &r.policy);
        }
        drop(running);
        crate::log::info(if said {
            "the internet link has its address"
        } else {
            "the internet link's address was forgotten"
        });
        (self.shared.events)(super::Event::Changed);
        Ok(())
    }

    /// Close the link's listener: its origin is forgotten at once, and this
    /// returns once its port and every connection it kept alive are closed
    /// (a request under way given `listen::LINK_GRACE`), so that a request
    /// on a kept connection fails instead of being answered. With the
    /// network box unticked there is nothing left to serve: serving stops.
    /// (A WebSocket through the link, no longer the listener's once
    /// upgraded, ends when the tunnel does, S5.)
    pub fn link_close(&self) {
        let mut running = lock(&self.shared.inner);
        let Some(r) = running.as_mut() else { return };
        if r.link.is_none() {
            return;
        }
        let old = r.policy.link_origin();
        r.policy.set_link(None);
        if super::link_pair::ends(old.as_deref(), None) {
            super::link_pair::end(&r.server, &r.policy);
        }
        let alone = r.nets.is_empty();
        let listener = r.link.take();
        r.policy.audit(&r.server, "link_off", None, None);
        drop(running);
        // Waited for outside the lock: off is off once this returns.
        if let Some(listener) = listener {
            listener.close();
        }
        crate::log::info("the internet link's listener is closed");
        if alone {
            self.stop();
        } else {
            (self.shared.events)(super::Event::Changed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_loopback_is_let_in() {
        for ip in ["127.0.0.1", "::1", "::ffff:127.0.0.1"] {
            assert!(admits(ip.parse().unwrap()), "{ip}");
        }
        for ip in [
            "192.168.1.20",
            "10.0.0.2",
            "fd00::1",
            "203.0.113.9",
            "0.0.0.0",
        ] {
            assert!(!admits(ip.parse().unwrap()), "{ip}");
        }
    }

    #[test]
    fn an_origin_is_https_and_a_name_alone() {
        let o = origin("https://Abstract-Simpson-Player.trycloudflare.com/").unwrap();
        assert_eq!(
            o.origin,
            "https://abstract-simpson-player.trycloudflare.com"
        );
        assert_eq!(o.authority, "abstract-simpson-player.trycloudflare.com");
        assert_eq!(
            origin("https://mesa.example.com:8443").unwrap().authority,
            "mesa.example.com:8443"
        );
        for bad in [
            "http://a.trycloudflare.com",
            "a.trycloudflare.com",
            "https://",
            "https://localhost",
            "https://127.0.0.1",
            "https://[::1]",
            "https://a.example.com/path",
            "https://user@a.example.com",
            "https://a.example.com?x",
            "https://a.example.com#x",
            "https://a.example.com:0",
            "https://a.example.com:99999",
            "https://a.example.com:",
            "https://-a.example.com",
            "https://a..example.com",
            "https://a.example.com@evil.example",
        ] {
            assert!(origin(bad).is_err(), "{bad} was taken");
        }
    }
}
