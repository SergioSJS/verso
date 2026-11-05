// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A player's window loading cold through the internet link (ADR 0117 D3
//! item 3; the test of 2026-11-04): `cloudflared` opens a connection to
//! the link's listener per request in flight and keeps it alive, some 50
//! at once for one window's 74 files. Every one is served — a refused one
//! is a 502 at Cloudflare and a window that does not open — and the idle
//! ones are given back in seconds, while the network and the owner's
//! window are served beside them. See `tests.rs` for the lab.

use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Semaphore;

use super::tests::{lab, run};

const NAME: &str = "abstract-simpson-player.trycloudflare.com";
const ORIGIN: &str = "https://abstract-simpson-player.trycloudflare.com";

/// A cold load's connections, as `cloudflared` opened them in the test.
const BURST: usize = 80;

/// A file of the window as the tunnel asks it, for the player at `client`.
fn chunk_request(n: usize, client: &str) -> String {
    format!(
        "GET /assets/chunk-{n}.js HTTP/1.1\r\nHost: {NAME}\r\nX-Forwarded-For: {client}\r\nX-Forwarded-Proto: https\r\n\r\n"
    )
}

/// One player's cold load: [`BURST`] connections opened together, each
/// sent its file's request the moment it is open, as `cloudflared` sends
/// a request on the connection it dialled for it. The statuses, each
/// answer read whole, and the connections, kept alive.
///
/// Not all of them opened first and asked after: a connection that says
/// nothing for [`crate::listen::LINK_IDLE`] is closed by design, and on a
/// loaded machine 80 connections opened one after another took longer than
/// the tests' half second (Windows, 2026-11-04: every connection the server
/// closed was hyper's header timeout, before a byte of its request came).
async fn cold_load(port: u16, client: String) -> (Vec<u16>, Vec<TcpStream>) {
    let mut asked = Vec::new();
    for n in 0..BURST {
        let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        let sent = s.write_all(chunk_request(n, &client).as_bytes()).await;
        asked.push(tokio::spawn(async move {
            let status = match sent {
                Ok(()) => status_of(&mut s).await,
                Err(_) => 0,
            };
            (status, s)
        }));
    }
    let mut statuses = Vec::new();
    let mut kept = Vec::new();
    for done in asked {
        let (status, s) = done.await.unwrap();
        statuses.push(status);
        kept.push(s);
    }
    (statuses, kept)
}

/// One window's cold load is served whole through the link, its 80
/// connections held at once; five at once too, from five players; and
/// the connections they leave open are closed once idle.
#[test]
fn players_loading_cold_through_the_link_are_served_every_file() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let (one, mut kept) = cold_load(port, "203.0.113.9".to_owned()).await;
        assert_eq!(one, vec![200; BURST], "one window's cold load");
        // Idle past the link's wait, every connection is given back.
        tokio::time::sleep(crate::listen::LINK_IDLE + Duration::from_millis(500)).await;
        for s in &mut kept {
            let mut byte = [0u8; 1];
            let read = tokio::time::timeout(Duration::from_secs(2), s.read(&mut byte)).await;
            assert!(matches!(read, Ok(Ok(0)) | Ok(Err(_))), "closed once idle");
        }
        drop(kept);
        let five = (1..=5).map(|p| tokio::spawn(cold_load(port, format!("203.0.113.{p}"))));
        let mut held = Vec::new();
        for (p, load) in five.enumerate() {
            let (statuses, kept) = tokio::time::timeout(Duration::from_secs(30), load)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(statuses, vec![200; BURST], "player {p} of five at once");
            held.push(kept);
        }
        drop(held);
    });
}

/// Past its places, a connection to the link waits in the system's queue
/// as long as the listener asked for, and is not refused: on Windows too,
/// where a plain `listen(1024)` queued 200 and reset the next. Not on
/// macOS, which queues its `kern.ipc.somaxconn` (128) whatever is asked.
#[cfg(not(target_os = "macos"))]
#[test]
fn past_its_places_the_link_queues_what_it_asked_for() {
    // More than Windows' 200 for a plain `listen`, fewer than the 1 024
    // asked.
    const QUEUED: usize = 600;
    run(async {
        let tcp = super::link::bind().unwrap();
        let port = tcp.local_addr().unwrap().port();
        let mut queued = Vec::new();
        for n in 0..QUEUED {
            match TcpStream::connect(("127.0.0.1", port)).await {
                Ok(s) => queued.push(s),
                Err(e) => panic!("connection {n} refused, none accepted yet: {e}"),
            }
        }
        drop(tcp);
        drop(queued);
    });
}

/// Off is off: once `link_close` returns, a connection the link kept alive
/// is closed — the next request on it fails, never answered, not even
/// refused with a 421 — and the link's port refuses a new one, while the
/// network's listener serves on. Deterministic on a machine of any speed:
/// the server's two workers are held busy across the close, as a loaded
/// machine holds them, so a close that did not wait for the connections
/// would return with this one still open (the race seen on the Mac,
/// 2026-11-05, in `the_link_answers_its_own_name_alone`).
#[test]
fn closing_the_link_ends_its_kept_alive_connections() {
    use std::io::Read;
    /// How long the server's workers are held.
    const HELD: Duration = Duration::from_millis(300);
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let player = "203.0.113.9";
        let mut kept = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        for n in 0..2 {
            let status = read_answer(&mut kept, chunk_request(n, player)).await;
            assert_eq!(status, 200, "request {n} on the kept connection");
        }
        let runtime = super::lock(&lab.local.shared.inner)
            .as_ref()
            .unwrap()
            .runtime
            .as_ref()
            .unwrap()
            .handle()
            .clone();
        let both = Arc::new(std::sync::Barrier::new(3));
        for _ in 0..2 {
            let both = Arc::clone(&both);
            runtime.spawn(async move {
                both.wait();
                std::thread::sleep(HELD);
            });
        }
        both.wait();
        lab.local.link_close();
        // Closed by the time the close returned: its end is here already,
        // or very nearly, well before the workers are let go.
        let kept = kept.into_std().unwrap();
        let mut byte = [0u8; 1];
        let mut closed = false;
        for _ in 0..10 {
            match (&kept).read(&mut byte) {
                Ok(0) => closed = true,
                Ok(_) => panic!("the link sent on a kept connection after it closed"),
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(5));
                    continue;
                }
                Err(_) => closed = true,
            }
            break;
        }
        assert!(closed, "the kept connection is still open after link_close");
        let mut kept = TcpStream::from_std(kept).unwrap();
        assert_eq!(
            read_answer(&mut kept, chunk_request(2, player)).await,
            0,
            "a request on the kept connection after the link closed"
        );
        assert!(
            TcpStream::connect(("127.0.0.1", port)).await.is_err(),
            "the link's port refuses"
        );
        let (status, _) = lab.get("/api/state", None).await;
        assert_eq!(status, 200, "the network serves on");
    });
}

/// With every place of the link's listener held, a phone on the network
/// and the owner's window at the table are still answered.
#[test]
fn a_busy_link_leaves_the_network_and_the_seat_served() {
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let mut held = Vec::new();
        for _ in 0..crate::listen::LOCAL_LINK + 16 {
            held.push(TcpStream::connect(("127.0.0.1", port)).await.unwrap());
        }
        let (status, _) = lab.get("/api/state", None).await;
        assert_eq!(status, 200, "the network, the link full");
        let seat = lab.local.sit(&lab.notes.path().join("Campanha")).unwrap();
        let state = seat.request("GET", "/api/state", None).unwrap();
        assert_eq!(state.status, 200, "the seat, the link full");
        drop(held);
    });
}

/// One address behind which a table plays (the re-test of 2026-11-04 on VM
/// 104: every player through the link from one NAT address).
const TABLE: &str = "203.0.113.50";

/// The players of that table.
const PLAYERS: usize = 10;

/// A request on `stream` for one player at [`TABLE`], as the tunnel
/// forwards it: the window's file `path`, or a route of the API with the
/// player's cookie. The answer's status, its body read whole.
async fn ask_as(stream: &mut TcpStream, path: &str, cookie: Option<&str>) -> u16 {
    let cookie = cookie
        .map(|c| format!("Cookie: {c}\r\n"))
        .unwrap_or_default();
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {NAME}\r\nX-Forwarded-For: {TABLE}\r\nX-Forwarded-Proto: https\r\n{cookie}\r\n"
    );
    read_answer(stream, request).await
}

/// `request` sent on `stream`; the answer's status once its body is read.
async fn read_answer(stream: &mut TcpStream, request: String) -> u16 {
    if stream.write_all(request.as_bytes()).await.is_err() {
        return 0;
    }
    status_of(stream).await
}

/// The status of the answer that comes on `stream`, once its body is read
/// whole; 0 when the connection closes or fails first.
async fn status_of(stream: &mut TcpStream) -> u16 {
    let mut got = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        let Ok(n) = stream.read(&mut buf).await else {
            return 0;
        };
        if n == 0 {
            return 0;
        }
        got.extend_from_slice(&buf[..n]);
        let text = String::from_utf8_lossy(&got);
        if let Some(end) = text.find("\r\n\r\n") {
            let head = &text[..end];
            let length: usize = head
                .lines()
                .find_map(|l| {
                    let (k, v) = l.split_once(':')?;
                    k.eq_ignore_ascii_case("content-length")
                        .then(|| v.trim().parse().ok())?
                })
                .unwrap_or(0);
            if got.len() >= end + 4 + length {
                return head
                    .split(' ')
                    .nth(1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            }
        }
    }
}

/// The routes of the API a window asks while it opens, signed in.
const OPENING: [&str; 5] = [
    "/api/state",
    "/api/me",
    "/api/me/settings",
    "/api/folders",
    "/api/state",
];

/// The requests a quick link carries in flight at once (Cloudflare's
/// testing mode, ADR 0117 D11 item 7).
const IN_FLIGHT_BY_CLOUDFLARE: usize = 200;

/// `cloudflared` as it speaks to the link's listener: at most
/// [`IN_FLIGHT_BY_CLOUDFLARE`] requests at once, each on a connection of
/// its own, kept alive and used again; a request on a kept connection the
/// listener closed meanwhile is sent again on a new one, as Go's client
/// does for a `GET`.
#[derive(Clone)]
struct Tunnel {
    port: u16,
    carried: Arc<Semaphore>,
    idle: Arc<std::sync::Mutex<Vec<TcpStream>>>,
}

impl Tunnel {
    fn new(port: u16) -> Self {
        Self {
            port,
            carried: Arc::new(Semaphore::new(IN_FLIGHT_BY_CLOUDFLARE)),
            idle: Arc::default(),
        }
    }

    async fn get(&self, path: &str, cookie: Option<&str>) -> u16 {
        let _carried = self.carried.acquire().await.unwrap();
        for _ in 0..10 {
            let kept = self.idle.lock().unwrap().pop();
            let stream = match kept {
                Some(s) => Some(s),
                None => TcpStream::connect(("127.0.0.1", self.port)).await.ok(),
            };
            if let Some(mut s) = stream {
                let status = ask_as(&mut s, path, cookie).await;
                if status != 0 {
                    self.idle.lock().unwrap().push(s);
                    return status;
                }
            }
            // A kept connection the listener closed (sent again, as Go's
            // client does for a `GET`), or a connection the system's
            // queue did not take: on macOS it holds 128 however long the
            // listener asks for, and here 200 come in the same instant,
            // which no browser's requests through Cloudflare do. What this
            // test reads is the server's answers, not the system's queue.
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        0
    }
}

/// A window's cold load as the browser made it on VM 104: 77 requests,
/// 52 of them at once — the window's files and the API's opening routes —
/// then the other 25. Every status.
async fn table_load(tunnel: Tunnel, cookie: String) -> Vec<u16> {
    let ask = |n: usize| {
        let cookie = cookie.clone();
        let tunnel = tunnel.clone();
        tokio::spawn(async move {
            match OPENING.get(n) {
                Some(route) => tunnel.get(route, Some(&cookie)).await,
                None => tunnel.get(&format!("/chunks/chunk-{n}.js"), None).await,
            }
        })
    };
    let mut statuses = Vec::new();
    for wave in [0..52, 52..77] {
        let asked: Vec<_> = wave.map(ask).collect();
        for done in asked {
            statuses.push(done.await.unwrap());
        }
    }
    statuses
}

/// Ten players invited and signed in: their cookies.
async fn ten_players(lab: &super::tests::Lab) -> Vec<String> {
    let mut cookies = Vec::new();
    for p in 0..PLAYERS {
        let made = lab
            .local
            .invite_for_tests(Some("Campanha"), Some(crate::db::Role::Reader))
            .unwrap();
        cookies.push(
            super::tests_accounts::accept(
                lab,
                &made.link,
                &format!("p{p}@mesa.example"),
                &format!("P{p}"),
            )
            .await,
        );
    }
    cookies
}

/// The window's own files, as the build names them, in the lab's `ui`.
fn chunks(lab: &super::tests::Lab) {
    let dir = lab.dir.path().join("ui").join("chunks");
    crate::data::ensure_dir(&dir).unwrap();
    for n in 0..80 {
        crate::data::write_for_tests(
            &dir.join(format!("chunk-{n}.js")),
            &"// a chunk\n".repeat(400),
        );
    }
}

/// Ten players behind one address open the table cold, all at once,
/// through the link: every request of every window is answered — none
/// 429 — while one address that asks the API with no account is still
/// held to its few requests in flight (`tests_resources.rs`).
#[test]
fn a_table_of_ten_behind_one_address_loads_cold_through_the_link() {
    run(async {
        let mut lab = lab();
        chunks(&lab);
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let cookies = ten_players(&lab).await;
        let tunnel = Tunnel::new(port);
        let loads: Vec<_> = cookies
            .into_iter()
            .map(|c| tokio::spawn(table_load(tunnel.clone(), c)))
            .collect();
        for (p, load) in loads.into_iter().enumerate() {
            let statuses = tokio::time::timeout(Duration::from_secs(60), load)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(statuses.len(), 77);
            assert!(
                statuses.iter().all(|s| *s == 200),
                "player {p} of {PLAYERS}: {statuses:?}"
            );
        }
    });
}

/// A player's window at the table holds two WebSockets — its own and the
/// copy kept on the device — so a table of ten behind one address holds
/// twenty through the link, every one accepted; one account is still held
/// to its own few, and the address to its own bound.
#[test]
fn a_table_of_ten_behind_one_address_holds_its_websockets() {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    run(async {
        let mut lab = lab();
        lab.serve();
        let port = lab.local.link_open().unwrap();
        lab.local.set_link_origin(Some(ORIGIN)).unwrap();
        let cookies = ten_players(&lab).await;
        let socket = |cookie: String| async move {
            let mut req = format!("ws://127.0.0.1:{port}/api/ws")
                .into_client_request()
                .unwrap();
            let h = req.headers_mut();
            h.insert("host", NAME.parse().unwrap());
            h.insert("origin", ORIGIN.parse().unwrap());
            h.insert("x-forwarded-for", TABLE.parse().unwrap());
            h.insert("x-forwarded-proto", "https".parse().unwrap());
            h.insert("cookie", cookie.parse().unwrap());
            match tokio_tungstenite::connect_async(req).await {
                Ok((ws, _)) => Ok(ws),
                Err(tokio_tungstenite::tungstenite::Error::Http(res)) => Err(res.status().as_u16()),
                Err(e) => panic!("{e}"),
            }
        };
        let mut held = Vec::new();
        for (p, cookie) in cookies.iter().enumerate() {
            for w in 0..2 {
                let ws = socket(cookie.clone()).await;
                assert!(ws.is_ok(), "player {p}'s socket {w}: {:?}", ws.err());
                held.push(ws);
            }
        }
        // One account past its own few is still refused.
        let first = &cookies[0];
        for _ in 2..crate::fair::LOCAL_PER_ACCOUNT {
            held.push(socket(first.clone()).await);
        }
        assert_eq!(
            socket(first.clone()).await.err(),
            Some(429),
            "one account's own bound"
        );
        // The address is still bounded: filled by the others, the next is
        // refused whoever asks.
        let mut open = held.iter().filter(|w| w.is_ok()).count();
        'fill: for cookie in &cookies[1..] {
            for _ in 2..crate::fair::LOCAL_PER_ACCOUNT {
                if open == crate::fair::LOCAL_PER_ADDRESS as usize {
                    break 'fill;
                }
                held.push(Ok(socket(cookie.clone()).await.unwrap()));
                open += 1;
            }
        }
        assert_eq!(open, crate::fair::LOCAL_PER_ADDRESS as usize);
        assert_eq!(
            socket(cookies[9].clone()).await.err(),
            Some(429),
            "the address's bound"
        );
        drop(held);
    });
}
