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
/// the trusted proxies are not counted: they speak for everyone.
pub const PER_ADDRESS: u32 = 128;

/// A laptop that serves holds fewer (ADR 0096 item 13): 64 in all…
pub const LOCAL_CONNECTIONS: usize = 64;

/// …and 16 from one address.
pub const LOCAL_PER_ADDRESS: u32 = 16;

/// The connections the internet link's listener holds (ADR 0117 D3 item
/// 3): places of its own, beside the 64 and never among them, so that the
/// link, however busy, takes none of the network's or the seat's. Every one
/// comes from `cloudflared` on this machine, which opens a connection to
/// it per request in flight and keeps them alive: a player's window loading
/// cold asks some 74 files, about 50 of them at once, and Cloudflare holds
/// at most 200 requests in flight through a quick link. 256 is the most
/// Cloudflare sends, with room for the connections `cloudflared` keeps
/// idle. Fairness among the players is not counted here — one peer speaks
/// for all of them — but by the address the tunnel forwards (the requests
/// in flight, `crate::http`'s `guard`; the pace, `pace`) and by account and
/// read link (their WebSockets, `crate::fair`). Past the 256 the next
/// connection waits in the system's queue for one to close, and is never
/// refused: `cloudflared` would answer a refused one with a 502 (the test
/// of 2026-11-04). How long that queue is on each system:
/// `crate::local::link`'s `bind`. `[OPEN]` for the maintainer: 256.
pub const LOCAL_LINK: usize = 256;

// Five players' cold loads at once, some 50 files in flight each.
const _: () = assert!(LOCAL_LINK >= 5 * 50);

/// How long a connection of the link's listener waits, idle, for its next
/// request before it is closed — and how long a request's headers may take
/// on it: `cloudflared` sends them whole at once. Short, so that the
/// connections a page's load left open are given back in seconds, not
/// after the [`HEADERS_WITHIN`] of the network's listener (30 were seen
/// open 18 s after a load). `[OPEN]` for the maintainer: 5 s.
#[cfg(not(test))]
pub const LINK_IDLE: Duration = Duration::from_secs(5);
#[cfg(test)]
pub const LINK_IDLE: Duration = Duration::from_millis(500);

/// Of the 64, the places the network leaves to the owner's window at the
/// table (the seat, ADR 0117 D4 Q3), which counts against the 64 alone:
/// the owner still sits down with every other place taken. `[OPEN]` for
/// the maintainer: 8.
pub const LOCAL_SEAT_KEPT: usize = 8;

/// How long a request's headers may take to arrive, the wait for the next
/// request on a kept-alive connection included: hyper's own default, which
/// it applies only with a timer. A client that sends a byte at a time
/// (slowloris) is let go then.
#[cfg(not(test))]
pub const HEADERS_WITHIN: Duration = Duration::from_secs(30);
#[cfg(test)]
pub const HEADERS_WITHIN: Duration = Duration::from_secs(2);

/// The most a request's head — its line and headers — may take (ADR 0083
/// item 8, F12): hyper's read buffer, whose default is some 400 KiB, so
/// that 512 connections held a fifth of a 1 GB host. 64 KiB is more than
/// any browser sends; past it hyper answers 431 and closes. hyper checks
/// its bound only while a head is incomplete, and a single read may fill
/// the buffer's whole capacity (up to about twice the bound): a head
/// that arrived in one read and is a little past 64 KiB is refused with
/// 431 by the router instead (`crate::http`'s `guard`).
pub const HEAD_MOST: usize = 64 * 1024;

/// The connections held, on the server and by address.
pub struct Slots {
    all: Arc<Semaphore>,
    /// What a refusal for want of one of `all` says in the log.
    full: String,
    /// Further bounds a connection of this listener counts against too,
    /// each with its words for the log: on a laptop, the network's (all but
    /// [`LOCAL_SEAT_KEPT`]). None on a server.
    shares: Vec<Share>,
    by_address: Mutex<HashMap<String, u32>>,
    per_address: u32,
    trusted: crate::proxy::Proxies,
    /// Who may connect at all, asked before a place is counted: "this app
    /// is a server" lets in only peers on a private subnet of the machine
    /// (ADR 0096 item 3). None on a server, where anyone may.
    admit: Option<Admit>,
    /// When a refusal was last said in the log.
    said: Mutex<Option<std::time::Instant>>,
}

/// The test of a peer's address, answered true to let it in.
pub type Admit = Arc<dyn Fn(IpAddr) -> bool + Send + Sync>;

/// A bound beside the server's: its places, and what it is in the log.
#[derive(Clone)]
struct Share {
    places: Arc<Semaphore>,
    what: String,
}

impl Share {
    fn new(most: usize, what: &str) -> Self {
        Self {
            places: Arc::new(Semaphore::new(most)),
            what: format!("{what} hold {most} connections"),
        }
    }
}

/// A connection's place, given back when its socket closes — after a
/// WebSocket's end, since it travels with the socket ([`Counted`]).
pub struct Slot {
    _all: Vec<OwnedSemaphorePermit>,
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
    pub fn new(trusted: crate::proxy::Proxies) -> Arc<Self> {
        Self::bounded(trusted, CONNECTIONS, PER_ADDRESS)
    }

    /// With bounds of its own, for the tests.
    #[must_use]
    pub fn bounded(trusted: crate::proxy::Proxies, most: usize, per_address: u32) -> Arc<Self> {
        Arc::new(Self {
            all: Arc::new(Semaphore::new(most)),
            full: format!("the server holds {most} connections"),
            shares: Vec::new(),
            by_address: Mutex::new(HashMap::new()),
            per_address,
            trusted,
            admit: None,
            said: Mutex::new(None),
        })
    }

    /// The bounds of a laptop that serves, and who may connect (ADR 0096
    /// items 3 and 13): 64 connections in all, 16 per address, and only
    /// the peers `admit` lets in — refused before a place is taken or a
    /// byte is read. The network's listener leaves [`LOCAL_SEAT_KEPT`] to
    /// the seat.
    #[must_use]
    pub fn for_local(admit: Admit) -> Arc<Self> {
        Arc::new(Self {
            all: Arc::new(Semaphore::new(LOCAL_CONNECTIONS)),
            full: format!("the server holds {LOCAL_CONNECTIONS} connections"),
            shares: vec![Share::new(
                LOCAL_CONNECTIONS - LOCAL_SEAT_KEPT,
                "the network's listeners",
            )],
            by_address: Mutex::new(HashMap::new()),
            per_address: LOCAL_PER_ADDRESS,
            trusted: crate::proxy::Proxies::default(),
            admit: Some(admit),
            said: Mutex::new(None),
        })
    }

    /// The internet link's listener beside these (ADR 0117 D3 item 3):
    /// `own` places of its own, none of the 64 — the link, however busy,
    /// leaves the network and the seat theirs — with its own test of who
    /// may connect: loopback alone, where `cloudflared` runs. Its
    /// connections wait for a place ([`Self::place`]) rather than being
    /// refused.
    #[must_use]
    pub fn beside(self: &Arc<Self>, admit: Admit, own: usize) -> Arc<Self> {
        Arc::new(Self {
            all: Arc::new(Semaphore::new(own)),
            full: format!(
                "the internet link's listener holds {own} connections; the next waits for one to close"
            ),
            shares: Vec::new(),
            by_address: Mutex::new(HashMap::new()),
            per_address: self.per_address,
            trusted: self.trusted.clone(),
            admit: Some(admit),
            said: Mutex::new(None),
        })
    }

    /// The owner's window's door beside these (ADR 0117 D4 Q3): the 64
    /// alone, so it has the places the other listeners leave it.
    #[must_use]
    pub fn for_seat(self: &Arc<Self>, admit: Admit) -> Arc<Self> {
        self.with(admit, Vec::new())
    }

    fn with(self: &Arc<Self>, admit: Admit, shares: Vec<Share>) -> Arc<Self> {
        Arc::new(Self {
            all: Arc::clone(&self.all),
            full: self.full.clone(),
            shares,
            by_address: Mutex::new(HashMap::new()),
            per_address: self.per_address,
            trusted: self.trusted.clone(),
            admit: Some(admit),
            said: Mutex::new(None),
        })
    }

    /// A place for a connection from `ip`, or none — the connection is
    /// then closed before anything is read from it.
    pub fn take(self: &Arc<Self>, ip: IpAddr) -> Option<Slot> {
        if !self.admits(ip) {
            return None;
        }
        let Ok(first) = Arc::clone(&self.all).try_acquire_owned() else {
            self.refused(&self.full);
            return None;
        };
        self.take_with(first, ip)
    }

    /// One of this listener's own places, waited for while every one is
    /// held: taken before a connection is accepted, so that the next waits
    /// in the system's queue (the internet link's, [`Self::beside`]).
    pub async fn place(self: &Arc<Self>) -> OwnedSemaphorePermit {
        if let Ok(place) = Arc::clone(&self.all).try_acquire_owned() {
            return place;
        }
        self.refused(&self.full);
        loop {
            if let Ok(place) = Arc::clone(&self.all).acquire_owned().await {
                return place;
            }
            // Never closed; were it, nothing would be accepted again.
            std::future::pending::<()>().await;
        }
    }

    /// A connection from `ip` with its place among all already held
    /// ([`Self::place`]), or none.
    pub fn take_placed(self: &Arc<Self>, first: OwnedSemaphorePermit, ip: IpAddr) -> Option<Slot> {
        if !self.admits(ip) {
            return None;
        }
        self.take_with(first, ip)
    }

    fn admits(&self, ip: IpAddr) -> bool {
        if let Some(admit) = &self.admit
            && !admit(ip)
        {
            self.refused(&format!(
                "{} is not on a network this computer serves",
                crate::limit::address_key(ip)
            ));
            return false;
        }
        true
    }

    fn take_with(self: &Arc<Self>, first: OwnedSemaphorePermit, ip: IpAddr) -> Option<Slot> {
        let mut all = vec![first];
        for share in &self.shares {
            let Ok(place) = Arc::clone(&share.places).try_acquire_owned() else {
                self.refused(&share.what);
                return None;
            };
            all.push(place);
        }
        if ip.is_loopback() || self.trusted.trusts(ip) {
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

/// The requests in flight per client address, as the trusted proxies walk
/// it (`crate::http`'s `guard`): a connection through a proxy counts only
/// against the server's [`CONNECTIONS`], so the address the proxy
/// forwarded is what bounds one client there.
#[derive(Default)]
pub struct Requests {
    by_address: Arc<Mutex<HashMap<String, usize>>>,
    /// Refusals said in the log once a minute.
    pub said: crate::log::OnceAMinute,
}

/// A request's place among its address's, given back when it is answered.
pub struct Request {
    by_address: Arc<Mutex<HashMap<String, usize>>>,
    key: String,
}

impl Drop for Request {
    fn drop(&mut self) {
        let mut by = lock(&self.by_address);
        if let Some(n) = by.get_mut(&self.key) {
            *n = n.saturating_sub(1);
            if *n == 0 {
                by.remove(&self.key);
            }
        }
    }
}

impl Requests {
    /// A place for one more request of `key`, or none past `most`.
    pub fn take(&self, key: &str, most: usize) -> Option<Request> {
        let mut by = lock(&self.by_address);
        let n = by.entry(key.to_owned()).or_insert(0);
        if *n >= most {
            return None;
        }
        *n += 1;
        Some(Request {
            by_address: Arc::clone(&self.by_address),
            key: key.to_owned(),
        })
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
    /// How long a connection waits, idle, for its next request, and a
    /// request's headers may take: [`HEADERS_WITHIN`] but on the link's.
    fn idle(&self) -> Duration {
        HEADERS_WITHIN
    }
}

/// Plain TCP: a connection without a place is closed at once — or, on
/// the internet link's listener ([`Self::for_link`]), waits for one.
pub struct Plain {
    tcp: TcpListener,
    slots: Arc<Slots>,
    idle: Duration,
    waits: bool,
}

impl Plain {
    #[must_use]
    pub fn new(tcp: TcpListener, slots: Arc<Slots>) -> Self {
        Self {
            tcp,
            slots,
            idle: HEADERS_WITHIN,
            waits: false,
        }
    }

    /// The internet link's listener (ADR 0117 D3 item 3): a connection
    /// past its places waits for one, and an idle one is closed after
    /// [`LINK_IDLE`].
    #[must_use]
    pub fn for_link(tcp: TcpListener, slots: Arc<Slots>) -> Self {
        Self {
            tcp,
            slots,
            idle: LINK_IDLE,
            waits: true,
        }
    }
}

impl Incoming for Plain {
    type Io = tokio::net::TcpStream;

    async fn accept(&mut self) -> (Counted<Self::Io>, SocketAddr) {
        loop {
            let placed = if self.waits {
                Some(self.slots.place().await)
            } else {
                None
            };
            match self.tcp.accept().await {
                Ok((io, addr)) => {
                    let slot = match placed {
                        Some(first) => self.slots.take_placed(first, addr.ip()),
                        None => self.slots.take(addr.ip()),
                    };
                    if let Some(slot) = slot {
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

    fn idle(&self) -> Duration {
        self.idle
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
    let idle = listener.idle();
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
                .header_read_timeout(idle)
                .max_buf_size(HEAD_MOST);
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
        let slots = Slots::bounded(crate::proxy::Proxies::default(), 3, 1);
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
        let trusted = Slots::bounded(
            crate::proxy::Proxies::parse("203.0.113.0/24").unwrap(),
            4,
            1,
        );
        let held: Vec<_> = (0..4).filter_map(|_| trusted.take(a)).collect();
        assert_eq!(held.len(), 4, "the trusted proxy speaks for everyone");
    }

    /// On a laptop (ADR 0117 D3 item 3, D4 Q3): the link's listener, whose
    /// connections all come from `cloudflared` on loopback, has places of
    /// its own — a cold load's worth for several players — and with every
    /// one held the network still has all of its, and the seat its own.
    #[test]
    fn the_link_has_its_own_places_and_leaves_the_network_and_the_seat_theirs() {
        let network = Slots::for_local(Arc::new(|ip: IpAddr| !ip.is_loopback()));
        let link = network.beside(Arc::new(|ip: IpAddr| ip.is_loopback()), LOCAL_LINK);
        let seat = network.for_seat(Arc::new(|ip: IpAddr| ip.is_loopback()));
        let here = IpAddr::from([127, 0, 0, 1]);
        let by_link: Vec<_> = (0..LOCAL_LINK + 10)
            .filter_map(|_| link.take(here))
            .collect();
        assert_eq!(by_link.len(), LOCAL_LINK, "the link's places, and no more");
        assert!(
            link.take("192.168.1.77".parse().unwrap()).is_none(),
            "loopback alone"
        );
        // The link full, the network has every place it had…
        let by_network: Vec<_> = (2..=60)
            .flat_map(|n| {
                let ip: IpAddr = format!("192.168.1.{n}").parse().unwrap();
                (0..4).filter_map(|_| network.take(ip)).collect::<Vec<_>>()
            })
            .collect();
        assert_eq!(by_network.len(), LOCAL_CONNECTIONS - LOCAL_SEAT_KEPT);
        // …and the seat still has its places, the last of the 64.
        let sat: Vec<_> = (0..LOCAL_CONNECTIONS)
            .filter_map(|_| seat.take(here))
            .collect();
        assert_eq!(sat.len(), LOCAL_SEAT_KEPT);
        assert!(network.take("192.168.1.99".parse().unwrap()).is_none());
        drop(by_link);
        assert!(
            link.take(here).is_some(),
            "a place given back is taken again"
        );
        drop((by_network, sat));
    }

    /// The link's listener waits for a place rather than refusing: the
    /// next connection is accepted once one closes.
    #[test]
    fn a_link_connection_past_the_places_waits_for_one() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            let network = Slots::for_local(Arc::new(|_: IpAddr| true));
            let link = network.beside(Arc::new(|ip: IpAddr| ip.is_loopback()), 2);
            let here = IpAddr::from([127, 0, 0, 1]);
            let one = link.take_placed(link.place().await, here).unwrap();
            let _two = link.take_placed(link.place().await, here).unwrap();
            let waiting = tokio::spawn({
                let link = Arc::clone(&link);
                async move { link.place().await }
            });
            tokio::time::sleep(Duration::from_millis(50)).await;
            assert!(!waiting.is_finished(), "it waits while both are held");
            drop(one);
            let third = tokio::time::timeout(Duration::from_secs(1), waiting).await;
            assert!(matches!(third, Ok(Ok(_))), "taken once one closes");
        });
    }
}
