// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The game master's own window at the table (ADR 0117 D4 Q3 and Q4): the
//! desktop window on a folder this computer serves becomes **a client of
//! its own server**, signed in as the owner — the server's admin — with a
//! device session the host is handed in process, through no route, and
//! keeps in memory. The window then has the table, the campaign and the
//! invitation exactly as the desktop connected to a UniVerso has them;
//! nothing of the table's or the campaign's code changes.
//!
//! The way in is a **door in memory**, not a socket: a connection is a pair
//! of in-memory streams, the server's half served by the same router and
//! the same HTTP stack as every listener's, the host's half spoken over by
//! the window's WebSocket client. So the window sits at the table with the
//! network box ticked, the link's box, or both, and no listener's rule is
//! widened for it: the network's still refuses loopback, the link's still
//! answers the link's name alone. A request through the door carries
//! [`BySeat`], which that door's router alone sets; the seat's token opens
//! nothing anywhere else — a bearer credential of this computer's own
//! accounts that did not come in by it is refused (`devices.rs`,
//! `Policy::bearer_who`).
//!
//! The session lives as long as serving: a stop ends it, a start sweeps
//! one a crash left. It is no phone (it has no row in `phones`), so the
//! allowlist does not judge it and it counts against no phone's ceiling;
//! the hide lock of a folder served in part holds for it as for everyone
//! (`crate::access::role`).
//!
//! The owner's fresh proof (ADR 0083 item 6), which inviting a person to
//! the table needs, is the owner's click in the app (Q4, as ADR 0096 item 6
//! decided for pairing): the host says the window acted ([`Seat::acted`])
//! and the session's mark is stamped then. No owner password.

use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::sync::{Arc, Weak};
use std::time::Duration;

use axum::extract::ConnectInfo;
use tokio::io::DuplexStream;
use tokio::sync::mpsc;

use super::{LocalServer, Policy, Running, lock};
use crate::auth::{Via, Who};
use crate::listen::{Counted, Incoming, Slots};
use crate::state::Server;

/// The mark of a request that came in by the owner's window's door.
#[derive(Debug, Clone, Copy)]
pub struct BySeat;

/// Whether the request whose extensions are `ext` came in by the owner's
/// window's door.
#[must_use]
pub fn by_seat(ext: &axum::http::Extensions) -> bool {
    ext.get::<BySeat>().is_some()
}

/// The device the seat's session names: in the audit log, and what a
/// start sweeps away (no seat outlives serving).
pub const SEAT_DEVICE: &str = "This computer's window";

/// The commands whose fresh proof is the owner's click in the app (ADR
/// 0117 D4 Q4): those of the contract that ask for one — inviting a
/// person to the table (`campaign_cmds.rs`), making a read link
/// (`readlinks::make`, ADR 0117 D9, S12). A command of an account's
/// own routes (the password, passkeys, tokens) is not the window's.
pub const PROVED_BY_THE_CLICK: &[&str] = &["campaign_invite", "read_link_create"];

/// The buffer of one in-memory connection, each way.
const BUFFER: usize = 256 * 1024;

/// How long a file asked in process may take, as the host's request to a
/// server's `/f/` does.
const FILE_WITHIN: Duration = Duration::from_secs(30);

/// Connections waiting for the server to take them.
const WAITING: usize = 16;

/// The door while serving: the seat's session, its token (in memory
/// only) and the way connections are handed in.
pub(super) struct Door {
    session: String,
    token: String,
    tx: mpsc::Sender<DuplexStream>,
}

/// Connections handed in by the host, each with its place among the
/// server's (the 64 of ADR 0096 item 13 are the one server's): from this
/// machine, so counted by no address.
struct InProcess {
    rx: mpsc::Receiver<DuplexStream>,
    slots: Arc<Slots>,
}

/// Where a connection through the door comes from: this machine, speaking
/// for itself — never forwarded, so never a player's address.
const HERE: SocketAddr = SocketAddr::new(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST), 0);

impl Incoming for InProcess {
    type Io = DuplexStream;

    async fn accept(&mut self) -> (Counted<Self::Io>, SocketAddr) {
        loop {
            let Some(io) = self.rx.recv().await else {
                // Every seat let go: nothing comes in again until serving
                // stops and ends the loop.
                std::future::pending::<()>().await;
                continue;
            };
            if let Some(slot) = self.slots.take(HERE.ip()) {
                return (Counted::new(io, slot), HERE);
            }
        }
    }

    fn local_addr(&self) -> std::io::Result<SocketAddr> {
        Ok(HERE)
    }
}

/// A file's answer, asked in process.
#[derive(Debug, Clone)]
pub struct Answer {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

/// The owner's window's seat at a folder this computer serves whole,
/// handed to the host. Its token is the seat's session's; it opens nothing
/// but through [`Seat::connect`] and [`Seat::get`].
pub struct Seat {
    folder: String,
    origin: Option<String>,
    session: String,
    token: String,
    tx: mpsc::Sender<DuplexStream>,
    server: Weak<Server>,
    runtime: tokio::runtime::Handle,
}

impl std::fmt::Debug for Seat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Never the token.
        f.debug_struct("Seat")
            .field("folder", &self.folder)
            .finish()
    }
}

impl Seat {
    /// The served folder's id on this server, which the window opens.
    #[must_use]
    pub fn folder(&self) -> &str {
        &self.folder
    }

    /// Where this server's links are opened when it sat: the internet
    /// link's origin while it has one, else the network's address (the
    /// invitations' base, `invites.rs`); `None` with neither.
    #[must_use]
    pub fn origin(&self) -> Option<&str> {
        self.origin.as_deref()
    }

    /// The seat's bearer token, for the requests through its door.
    #[must_use]
    pub fn token(&self) -> &str {
        &self.token
    }

    /// A new connection to the server, in memory: the host speaks HTTP and
    /// the contract's WebSocket over it as over a socket. `Err` once
    /// serving stopped.
    pub fn connect(&self) -> Result<DuplexStream, String> {
        // The seat of this run of serving, and no other.
        let live = self
            .server
            .upgrade()
            .and_then(|s| s.local.as_ref().and_then(|p| p.seat_session()))
            .is_some_and(|s| s == self.session);
        if !live {
            return Err("serving stopped: sit at the table again".to_owned());
        }
        let (here, there) = tokio::io::duplex(BUFFER);
        self.tx
            .try_send(there)
            .map_err(|_| "serving stopped: sit at the table again".to_owned())?;
        Ok(here)
    }

    /// A GET of this server's — a folder's file, `/f/<folder>/<path>` —
    /// answered in process, through the same router as the door's. It
    /// waits, so it is not called on an asynchronous thread.
    pub fn get(&self, path: &str) -> Result<Answer, String> {
        self.request("GET", path, None)
    }

    /// A request of this server's REST routes — the folder's read links
    /// (ADR 0117 D9, S12), its shares — answered in process as [`Seat::get`]
    /// is, with a JSON body when there is one. It waits, so it is not
    /// called on an asynchronous thread. A route that asks a fresh proof
    /// takes the owner's click ([`Seat::acted`]) first.
    pub fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<Answer, String> {
        let server = self
            .server
            .upgrade()
            .ok_or_else(|| "serving stopped".to_owned())?;
        let app = super::routes::router(server).layer(axum::Extension(BySeat));
        let method =
            axum::http::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
        let mut request = axum::http::Request::builder()
            .method(method)
            .uri(path)
            .header(axum::http::header::HOST, "127.0.0.1")
            .header(
                axum::http::header::AUTHORIZATION,
                format!("Bearer {}", self.token),
            );
        let body = match body {
            Some(json) => {
                request = request.header(axum::http::header::CONTENT_TYPE, "application/json");
                axum::body::Body::from(json.to_string())
            }
            None => axum::body::Body::empty(),
        };
        let mut request = request.body(body).map_err(|e| e.to_string())?;
        request
            .extensions_mut()
            .insert(ConnectInfo(crate::http::Remote(HERE)));
        let (tx, rx) = std::sync::mpsc::channel();
        self.runtime.spawn(async move {
            let service = hyper_util::service::TowerToHyperService::new(app);
            let answered = match hyper::service::Service::call(&service, request).await {
                Ok(response) => {
                    let (parts, body) = response.into_parts();
                    axum::body::to_bytes(body, usize::MAX)
                        .await
                        .map(|body| Answer {
                            status: parts.status.as_u16(),
                            headers: parts
                                .headers
                                .iter()
                                .filter_map(|(k, v)| {
                                    Some((k.as_str().to_owned(), v.to_str().ok()?.to_owned()))
                                })
                                .collect(),
                            body: body.to_vec(),
                        })
                        .map_err(|e| e.to_string())
                }
                Err(never) => match never {},
            };
            let _ = tx.send(answered);
        });
        rx.recv_timeout(FILE_WITHIN)
            .map_err(|_| "the server did not answer".to_owned())?
    }

    /// The owner acted in the app, from the window at the table: for a
    /// command that needs a fresh proof, that click is the proof (ADR 0117
    /// D4 Q4), and the session's mark is stamped now.
    pub fn acted(&self, cmd: &str) -> Result<(), String> {
        if !PROVED_BY_THE_CLICK.contains(&cmd) {
            return Ok(());
        }
        let server = self
            .server
            .upgrade()
            .ok_or_else(|| "serving stopped".to_owned())?;
        server.db.prove(&self.session)?;
        Ok(())
    }
}

impl Policy {
    /// The seat's session, while there is one.
    pub(super) fn seat_session(&self) -> Option<String> {
        self.seat
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub(super) fn set_seat(&self, session: Option<String>) {
        *self
            .seat
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = session;
    }

    /// Who a bearer `secret` is, in "this app is a server": the owner, when
    /// it is the seat's token and the request came in by the seat's door
    /// (`by_seat`); no one otherwise. Through the door nothing else is
    /// heard; elsewhere, see `Policy::bearer_who`.
    pub fn seat_who(
        &self,
        server: &Server,
        secret: &str,
        by_seat: bool,
    ) -> Result<Option<Who>, String> {
        let Some(seat) = self.seat_session().filter(|_| by_seat) else {
            return Ok(None);
        };
        let Some(s) = server.db.session(secret)? else {
            return Ok(None);
        };
        if s.kind != "device" || s.id != seat {
            return Ok(None);
        }
        let owner = server.db.local_owner()?;
        if s.account != owner.id {
            return Ok(None);
        }
        Ok(Some(Who {
            account: owner,
            via: Via::Device { session: s.id },
            phone: None,
        }))
    }
}

/// The door opened on `r`'s runtime: the seat's session made, the
/// connections it is handed served by the server's own router.
fn open(r: &Running) -> Result<Door, String> {
    let runtime = r
        .runtime
        .as_ref()
        .ok_or_else(|| "serving is stopping".to_owned())?
        .handle()
        .clone();
    let owner = r.server.db.local_owner()?;
    let (token, _) = r
        .server
        .db
        .create_session(&owner.id, "device", SEAT_DEVICE, "127.0.0.1")?;
    let session = r
        .server
        .db
        .session(&token)?
        .ok_or_else(|| "the seat's session was not made".to_owned())?
        .id;
    let (tx, rx) = mpsc::channel(WAITING);
    let slots = r
        .server
        .slots
        .beside(Arc::new(|ip: IpAddr| ip.is_loopback()));
    let app = super::routes::router(Arc::clone(&r.server)).layer(axum::Extension(BySeat));
    let mut stopped = r.stop.subscribe();
    runtime.spawn(crate::listen::serve(
        InProcess { rx, slots },
        app,
        async move {
            let _ = stopped.wait_for(|s| *s).await;
        },
    ));
    r.policy.set_seat(Some(session.clone()));
    Ok(Door { session, token, tx })
}

impl LocalServer {
    /// The owner's window sits at the table of `folder`, a folder this
    /// computer serves whole (ADR 0117 D4 Q3): the seat the host connects
    /// through. The seat's session is made at the first sitting of a run
    /// and serves every window that sits until serving stops. `Err` says
    /// why not, in words the person reads.
    pub fn sit(&self, folder: &Path) -> Result<Seat, String> {
        let mut running = lock(&self.shared.inner);
        let r = running
            .as_mut()
            .ok_or_else(|| "turn serving on first, with this folder ticked".to_owned())?;
        let key = verso_core::folder_key(folder);
        let name = r
            .policy
            .folders
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .iter()
            .find(|(_, p)| verso_core::folder_key(p) == key)
            .map(|(n, _)| n.clone())
            .ok_or_else(|| "this folder is not served: tick it to serve it".to_owned())?;
        let id = r
            .server
            .db
            .folder_by_dir(&name)?
            .ok_or_else(|| "this folder is not served: tick it to serve it".to_owned())?
            .id;
        // A folder served in part is no one's by its own id, the owner's
        // window's included (the hide lock); its parts are shares of it, and
        // a table in one is not offered here — [OPEN] for the maintainer:
        // ADR 0117 does not say whether the window sits at a part's table.
        if r.policy.hides(&id) {
            return Err(
                "this folder is served in part: serve all of it to sit at its table".to_owned(),
            );
        }
        if r.seat.as_ref().is_none_or(|d| d.tx.is_closed()) {
            r.seat = Some(open(r)?);
            r.policy.audit(&r.server, "seat_opened", Some(&name), None);
            crate::log::info("the owner's window sat at the table of a served folder");
        }
        let door = r
            .seat
            .as_ref()
            .ok_or_else(|| "the seat did not open".to_owned())?;
        Ok(Seat {
            folder: id,
            origin: super::invites::base(r),
            session: door.session.clone(),
            token: door.token.clone(),
            tx: door.tx.clone(),
            server: Arc::downgrade(&r.server),
            runtime: r
                .runtime
                .as_ref()
                .ok_or_else(|| "serving is stopping".to_owned())?
                .handle()
                .clone(),
        })
    }
}

/// Serving stops: the seat's session ends with it (the door closes with
/// the runtime).
pub(super) fn close(r: &Running) {
    r.policy.set_seat(None);
    if let Some(door) = &r.seat
        && let Ok(owner) = r.server.db.local_owner()
    {
        let _ = r.server.db.end_session(&owner.id, &door.session);
    }
}

/// The seat's session, to keep when every other session of the owner is
/// told it ended (*Forget all devices*).
pub(super) fn session_of(r: &Running) -> Option<&str> {
    r.seat.as_ref().map(|d| d.session.as_str())
}
