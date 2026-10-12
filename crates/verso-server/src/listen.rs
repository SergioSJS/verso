// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The listener (threat-model.md, gap 8): connections are counted — on
//! the server and by the address they come from — before a TLS handshake
//! or a byte of HTTP is read, and each request's headers have a deadline.
//! `axum::serve` sets neither: hyper's deadline on headers needs a timer
//! it does not give, so each connection is served here by hyper's own
//! HTTP/1 builder, as `axum::serve` does, with one.

use std::collections::HashMap;
use std::future::Future;
use std::net::{IpAddr, SocketAddr};
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use std::time::Duration;

use axum::extract::ConnectInfo;
use hyper_util::rt::{TokioIo, TokioTimer};
use hyper_util::service::TowerToHyperService;
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::TcpListener;
use tokio::sync::{OwnedSemaphorePermit, Semaphore, watch};
use verso_service::lock;

/// The connections the server holds at once. Each costs a task and its
/// buffers, tens of kilobytes; and each is a file descriptor, of the 1 024
/// a service gets by default on Linux (systemd's soft `LimitNOFILE`),
/// which the databases, the indexes and the watchers share. Half of them.
pub const CONNECTIONS: usize = 512;

/// The connections one address may hold at once (an IPv6 /64 as one):
/// its WebSockets (`crate::fair::PER_ADDRESS`, 64) and a browser's few
/// for each page, for a household behind one address. This machine and
/// the trusted proxy are not counted: they speak for everyone.
pub const PER_ADDRESS: u32 = 128;

/// How long a request's headers may take to arrive, the wait for the next
/// request on a kept-alive connection included: hyper's own default, which
/// it applies only with a timer. A client that sends a byte at a time
/// (slowloris) is let go then.
#[cfg(not(test))]
pub const HEADERS_WITHIN: Duration = Duration::from_secs(30);
#[cfg(test)]
pub const HEADERS_WITHIN: Duration = Duration::from_secs(2);

/// The connections held, on the server and by address.
pub struct Slots {
    all: Arc<Semaphore>,
    most: usize,
    by_address: Mutex<HashMap<String, u32>>,
    per_address: u32,
    trusted: Option<IpAddr>,
    /// When a refusal was last said in the log.
    said: Mutex<Option<std::time::Instant>>,
}

/// A connection's place, given back when its socket closes — after a
/// WebSocket's end, since it travels with the socket ([`Counted`]).
pub struct Slot {
    _all: OwnedSemaphorePermit,
    address: Option<(Arc<Slots>, String)>,
}

impl Drop for Slot {
    fn drop(&mut self) {
        if let Some((slots, key)) = &self.address {
            let mut by = lock(&slots.by_address);
            if let Some(n) = by.get_mut(key) {
                *n = n.saturating_sub(1);
                if *n == 0 {
                    by.remove(key);
                }
            }
        }
    }
}

impl Slots {
    #[must_use]
    pub fn new(trusted: Option<IpAddr>) -> Arc<Self> {
        Self::bounded(trusted, CONNECTIONS, PER_ADDRESS)
    }

    /// With bounds of its own, for the tests.
    #[must_use]
    pub fn bounded(trusted: Option<IpAddr>, most: usize, per_address: u32) -> Arc<Self> {
        Arc::new(Self {
            all: Arc::new(Semaphore::new(most)),
            most,
            by_address: Mutex::new(HashMap::new()),
            per_address,
            trusted,
            said: Mutex::new(None),
        })
    }

    /// A place for a connection from `ip`, or none — the connection is
    /// then closed before anything is read from it.
    pub fn take(self: &Arc<Self>, ip: IpAddr) -> Option<Slot> {
        let Ok(all) = Arc::clone(&self.all).try_acquire_owned() else {
            self.refused(&format!("the server holds {} connections", self.most));
            return None;
        };
        if ip.is_loopback() || Some(ip) == self.trusted {
            return Some(Slot {
                _all: all,
                address: None,
            });
        }
        let most = self.per_address;
        let key = crate::limit::address_key(ip);
        let mut by = lock(&self.by_address);
        let n = by.entry(key.clone()).or_insert(0);
        if *n >= most {
            drop(by);
            self.refused(&format!("{key} holds {most} connections"));
            return None;
        }
        *n += 1;
        Some(Slot {
            _all: all,
            address: Some((Arc::clone(self), key)),
        })
    }

    /// Said in the log once a minute at most: a flood is one line.
    fn refused(&self, why: &str) {
        let mut said = lock(&self.said);
        if said.is_none_or(|at| at.elapsed() >= Duration::from_secs(60)) {
            *said = Some(std::time::Instant::now());
            crate::log::warn(&format!("connections refused: {why}"));
        }
    }
}

/// A socket with its [`Slot`]: the place is held as long as the socket.
pub struct Counted<T> {
    io: T,
    _slot: Slot,
}

impl<T: AsyncRead + Unpin> AsyncRead for Counted<T> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.get_mut().io).poll_read(cx, buf)
    }
}

impl<T: AsyncWrite + Unpin> AsyncWrite for Counted<T> {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.get_mut().io).poll_write(cx, buf)
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.get_mut().io).poll_flush(cx)
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.get_mut().io).poll_shutdown(cx)
    }

    fn poll_write_vectored(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bufs: &[std::io::IoSlice<'_>],
    ) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.get_mut().io).poll_write_vectored(cx, bufs)
    }

    fn is_write_vectored(&self) -> bool {
        self.io.is_write_vectored()
    }
}

/// Where connections come from: plain TCP ([`Plain`]) or TLS
/// ([`crate::tls::TlsListener`]), each with its place taken.
pub trait Incoming: Send + 'static {
    type Io: AsyncRead + AsyncWrite + Unpin + Send + 'static;
    fn accept(&mut self) -> impl Future<Output = (Counted<Self::Io>, SocketAddr)> + Send;
    fn local_addr(&self) -> std::io::Result<SocketAddr>;
}

/// Plain TCP: a connection without a place is closed at once.
pub struct Plain {
    tcp: TcpListener,
    slots: Arc<Slots>,
}

impl Plain {
    #[must_use]
    pub fn new(tcp: TcpListener, slots: Arc<Slots>) -> Self {
        Self { tcp, slots }
    }
}

impl Incoming for Plain {
    type Io = tokio::net::TcpStream;

    async fn accept(&mut self) -> (Counted<Self::Io>, SocketAddr) {
        loop {
            match self.tcp.accept().await {
                Ok((io, addr)) => {
                    if let Some(slot) = self.slots.take(addr.ip()) {
                        return (Counted { io, _slot: slot }, addr);
                    }
                }
                Err(e) => {
                    crate::log::warn(&format!("accepting a connection: {e}"));
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
    }

    fn local_addr(&self) -> std::io::Result<SocketAddr> {
        self.tcp.local_addr()
    }
}

impl<T> Counted<T> {
    /// `io` holding `slot`.
    pub fn new(io: T, slot: Slot) -> Self {
        Self { io, _slot: slot }
    }
}

/// Serve `app` on `listener` until `stop` resolves; then the connections
/// under way finish their requests and close.
pub async fn serve<L: Incoming>(
    mut listener: L,
    app: axum::Router,
    stop: impl Future<Output = ()> + Send + 'static,
) {
    let (stopping, stopped) = watch::channel(false);
    let (open, all_closed) = watch::channel(());
    tokio::pin!(stop);
    loop {
        let (io, addr) = tokio::select! {
            c = listener.accept() => c,
            () = &mut stop => break,
        };
        let tower = TowerToHyperService::new(app.clone());
        let service = hyper::service::service_fn(
            move |mut request: hyper::Request<hyper::body::Incoming>| {
                request
                    .extensions_mut()
                    .insert(ConnectInfo(crate::http::Remote(addr)));
                hyper::service::Service::call(&tower, request)
            },
        );
        let mut stopped = stopped.clone();
        let closed = all_closed.clone();
        tokio::spawn(async move {
            let mut builder = hyper::server::conn::http1::Builder::new();
            builder
                .timer(TokioTimer::new())
                .header_read_timeout(HEADERS_WITHIN);
            let conn = builder
                .serve_connection(TokioIo::new(io), service)
                .with_upgrades();
            tokio::pin!(conn);
            tokio::select! {
                _ = conn.as_mut() => {}
                _ = stopped.changed() => {
                    conn.as_mut().graceful_shutdown();
                    let _ = conn.as_mut().await;
                }
            }
            drop(closed);
        });
    }
    let _ = stopping.send(true);
    drop(all_closed);
    open.closed().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn places_are_counted_on_the_server_and_by_address() {
        let slots = Slots::bounded(None, 3, 1);
        let a: IpAddr = "203.0.113.1".parse().unwrap();
        let b: IpAddr = "203.0.113.2".parse().unwrap();
        let one = slots.take(a).unwrap();
        assert!(slots.take(a).is_none(), "one per address");
        // An IPv6 host is its /64.
        let v6 = slots.take("2001:db8::1".parse().unwrap()).unwrap();
        assert!(slots.take("2001:db8::2".parse().unwrap()).is_none());
        let two = slots.take(b).unwrap();
        // This machine is not counted by address, but by the server.
        assert!(
            slots.take(IpAddr::from([127, 0, 0, 1])).is_none(),
            "three in all"
        );
        drop(one);
        assert!(slots.take(a).is_some());
        drop((two, v6));
        let trusted = Slots::bounded(Some(a), 4, 1);
        let held: Vec<_> = (0..4).filter_map(|_| trusted.take(a)).collect();
        assert_eq!(held.len(), 4, "the trusted proxy speaks for everyone");
    }
}
