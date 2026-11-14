// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A UniVerso's own Cloudflare link (ADR 0117 D4 item 2, R5): the same
//! `cloudflared` the desktop app runs — `verso-tunnel`, its module moved
//! into a crate both hosts use — here run by the server itself, which has
//! no other host. A quick link (a random `*.trycloudflare.com`, twelve
//! hours with *Extend*) or an own address by a tunnel's token made in
//! Cloudflare's dashboard (no browser on the server: no `cloudflared
//! tunnel login`, decided 2026-11-13). Turned on at the start by
//! `VERSO_TUNNEL` (`crate::config::Tunnel`), and on and off from the
//! admin console (`crate::console`'s `link*` routes; revises ADR 0077 item
//! 6, dated there).
//!
//! The door is the desktop's (`crate::local::link`): one more listener of
//! the one server on `127.0.0.1` in plain HTTP, loopback peers alone,
//! `127.0.0.1` and `::1` its named proxies — the rightmost of
//! `X-Forwarded-For`, which a client cannot forge, keys every limit —
//! and the link's name its only `Host`, its origin the only `Origin`
//! (`crate::auth`). The origin is set at runtime, the moment the tunnel
//! has it, and forgotten the moment it ends: no restart
//! (`Server::public_origin`). The server's own listeners keep every rule
//! of before; `VERSO_PUBLIC_URL`, when set, still names the address the
//! links that leave name.
//!
//! The binary is downloaded on first use into `<VERSO_DATA_DIR>/tunnel/`
//! from GitHub's releases, pinned and checked (ADR 0050, as 0117 revised
//! it), never the `PATH`. No log line holds the link, its hostname or the
//! token (D11 item 8).

use std::path::PathBuf;
use std::sync::{Arc, Mutex, Weak};

use verso_tunnel::{Door, LinkEnd, LinkView, Manager, Mode};

use crate::config::TunnelAtStart;
use crate::local::link::Listener;
use crate::state::Server;

/// The `cloudflared` a link runs: the pinned one, downloaded and checked
/// on first use; or, in the tests, a stand-in script.
#[derive(Debug, Clone)]
pub enum Program {
    Pinned,
    Given(PathBuf),
}

/// What the console asks for: a quick link, or the own address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ask {
    Quick,
    /// The hostname and the token; either may be left to the environment
    /// (`VERSO_TUNNEL_HOSTNAME`, `VERSO_TUNNEL_TOKEN`).
    Own {
        hostname: Option<String>,
        token: Option<String>,
    },
}

/// The server's door for its link: its own loopback listener, serving the
/// server's routes, and the origin the auth checks read.
struct ServerDoor {
    server: Weak<Server>,
    port: u16,
    listener: Arc<Mutex<Option<Listener>>>,
}

impl Door for ServerDoor {
    fn open(&self) -> Result<u16, String> {
        let server = self
            .server
            .upgrade()
            .ok_or_else(|| "the server is stopping".to_owned())?;
        let mut held = verso_service::lock(&self.listener);
        if let Some(l) = held.as_ref() {
            return Ok(l.port);
        }
        let runtime = server
            .runtime
            .get()
            .ok_or_else(|| "the server is not serving yet".to_owned())?
            .clone();
        let app = crate::http::router(Arc::clone(&server));
        let listener = crate::local::link::open_serving(&runtime, &server, app, self.port)?;
        let port = listener.port;
        *held = Some(listener);
        crate::log::info(&format!(
            "the internet link's listener is open on 127.0.0.1:{port}"
        ));
        Ok(port)
    }

    fn set_origin(&self, origin: Option<&str>) -> Result<(), String> {
        let server = self
            .server
            .upgrade()
            .ok_or_else(|| "the server is stopping".to_owned())?;
        let origin = origin.map(crate::local::link::origin).transpose()?;
        let said = origin.is_some();
        server.set_own_link(origin);
        crate::log::info(if said {
            "the internet link has its address"
        } else {
            "the internet link's address was forgotten"
        });
        Ok(())
    }

    fn close(&self) {
        if let Some(server) = self.server.upgrade() {
            server.set_own_link(None);
        }
        let listener = verso_service::lock(&self.listener).take();
        if let Some(listener) = listener {
            // Waited for here, off the server's runtime (the tunnel's own
            // threads, or the console's blocking task): off is off.
            listener.close();
            crate::log::info("the internet link's listener is closed");
        }
    }
}

/// A UniVerso's link: its one tunnel and its listener.
pub struct Link {
    manager: Manager,
    server: Weak<Server>,
    program: Program,
    listener: Arc<Mutex<Option<Listener>>>,
    /// The own address's hostname of the run on now or last, for the
    /// console (the token is never kept beyond the run's `Mode`).
    hostname: Mutex<Option<String>>,
}

impl Link {
    /// The link of `server`, running `program`.
    #[must_use]
    pub fn new(server: &Arc<Server>, program: Program) -> Self {
        Self::with_timing(server, program, verso_tunnel::run::Timing::default())
    }

    /// The same, with these waits (the tests').
    #[must_use]
    pub fn with_timing(
        server: &Arc<Server>,
        program: Program,
        timing: verso_tunnel::run::Timing,
    ) -> Self {
        Self {
            manager: Manager::new(|_| {}, timing, verso_tunnel::CEILING),
            server: Arc::downgrade(server),
            program,
            listener: Arc::new(Mutex::new(None)),
            hostname: Mutex::new(None),
        }
    }

    /// Where it stands.
    #[must_use]
    pub fn view(&self) -> LinkView {
        self.manager.view()
    }

    /// The link listener's port while it is open: the address `cloudflared`
    /// was told.
    #[must_use]
    pub fn port(&self) -> Option<u16> {
        verso_service::lock(&self.listener).as_ref().map(|l| l.port)
    }

    /// The own address's hostname of the run on now (or last).
    #[must_use]
    pub fn hostname(&self) -> Option<String> {
        verso_service::lock(&self.hostname).clone()
    }

    /// The mode `ask` comes to, the environment filling what it left out.
    fn mode(&self, ask: &Ask) -> Result<Mode, String> {
        let server = self
            .server
            .upgrade()
            .ok_or_else(|| "the server is stopping".to_owned())?;
        let env = &server.config.tunnel;
        match ask {
            Ask::Quick => Ok(Mode::Quick),
            Ask::Own { hostname, token } => {
                let hostname = hostname
                    .as_deref()
                    .map(|h| h.trim().trim_end_matches('.').to_ascii_lowercase())
                    .filter(|h| !h.is_empty())
                    .or_else(|| env.hostname.clone())
                    .ok_or_else(|| "the own address needs its hostname".to_owned())?;
                if !verso_tunnel::named::valid_hostname(&hostname) {
                    return Err(
                        "an address in lower case, of at least two parts, like mesa.example.com"
                            .to_owned(),
                    );
                }
                let token = token
                    .as_deref()
                    .map(str::trim)
                    .filter(|t| !t.is_empty())
                    .map(str::to_owned)
                    .or_else(|| env.token.clone())
                    .ok_or_else(|| {
                        "the own address needs the tunnel's token from Cloudflare's dashboard"
                            .to_owned()
                    })?;
                if !verso_tunnel::named::valid_token(&token) {
                    return Err(
                        "not a tunnel's token: the long word Cloudflare's dashboard shows after --token"
                            .to_owned(),
                    );
                }
                Ok(Mode::Token { token, hostname })
            }
        }
    }

    /// Turn the link on and return once it is up or failed (blocking: the
    /// first download of `cloudflared`, then up to a minute of waits). One
    /// at a time: refused while one is starting or on.
    pub fn turn_on(&self, ask: &Ask) -> Result<LinkView, String> {
        let mode = self.mode(ask)?;
        self.start(mode)
    }

    fn start(&self, mode: Mode) -> Result<LinkView, String> {
        let port = match &mode {
            Mode::Quick => 0,
            _ => self
                .server
                .upgrade()
                .map_or(crate::config::DEFAULT_TUNNEL_PORT, |s| s.config.tunnel.port),
        };
        let hostname = match &mode {
            Mode::Token { hostname, .. } | Mode::Own { hostname, .. } => Some(hostname.clone()),
            Mode::Quick => None,
        };
        let door = ServerDoor {
            server: Weak::clone(&self.server),
            port,
            listener: Arc::clone(&self.listener),
        };
        // A start that fails is said in the log by the tunnel itself
        // (`verso_tunnel::Manager::start_after`), its words redacted.
        self.manager.start_after(mode, |preparing| {
            let program = self.binary(preparing)?;
            *verso_service::lock(&self.hostname) = hostname;
            Ok((Box::new(door) as Box<dyn Door>, program))
        })
    }

    /// [`Self::turn_on`] on a thread of its own: the console answers at
    /// once with the link starting, and reads it again. Refused at once
    /// when the ask is wrong or a link is already starting or on.
    pub fn turn_on_soon(self: &Arc<Self>, ask: &Ask) -> Result<LinkView, String> {
        let mode = self.mode(ask)?;
        if matches!(
            self.view().state,
            verso_tunnel::LinkState::Starting | verso_tunnel::LinkState::On
        ) {
            return Err("the internet link is already on".to_owned());
        }
        let link = Arc::clone(self);
        std::thread::Builder::new()
            .name("universo-link".to_owned())
            .spawn(move || {
                let _ = link.start(mode);
            })
            .map_err(|e| format!("the internet link: {e}"))?;
        // The start says it is starting before its download; a moment for
        // it, so that the answer says so too.
        for _ in 0..50 {
            if self.view().state != verso_tunnel::LinkState::Off {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        Ok(self.view())
    }

    /// The pinned `cloudflared` in `<VERSO_DATA_DIR>/tunnel/`, fetched and
    /// checked if needed (its first run `--version`); or the given one.
    fn binary(&self, preparing: &verso_tunnel::Preparing) -> Result<PathBuf, String> {
        match &self.program {
            Program::Given(path) => Ok(path.clone()),
            // On Android the app carries its own cloudflared (ADR 0118,
            // scripts/android/cloudflared.sh) and the fetch is not built:
            // the server never downloads one there.
            #[cfg(target_os = "android")]
            Program::Pinned => {
                let _ = preparing;
                Err(
                    "on Android the app carries its own cloudflared; none is downloaded here"
                        .to_owned(),
                )
            }
            #[cfg(not(target_os = "android"))]
            Program::Pinned => {
                let server = self
                    .server
                    .upgrade()
                    .ok_or_else(|| "the server is stopping".to_owned())?;
                let dir = verso_tunnel::tunnel_dir(&server.config.data_dir);
                let pin = verso_tunnel::fetch::pin_here()
                    .ok_or_else(|| "no cloudflared is published for this system".to_owned())?;
                let (path, fresh) = verso_tunnel::fetch::ensure_going(
                    &dir,
                    pin,
                    &mut verso_tunnel::fetch::download_sized,
                    &|done, total| preparing.downloaded(done, total),
                )?;
                if fresh {
                    verso_tunnel::run::version_check(&path, verso_tunnel::fetch::VERSION)?;
                }
                Ok(path)
            }
        }
    }

    /// *Turn off*: the origin forgotten, `cloudflared` stopped, the
    /// listener closed (blocking, up to its grace).
    pub fn turn_off(&self, why: LinkEnd) -> LinkView {
        let view = self.manager.stop(why);
        // A download cut short leaves nothing behind.
        if why == LinkEnd::Quit
            && let Some(server) = self.server.upgrade()
        {
            verso_tunnel::fetch::forget_partial(&verso_tunnel::tunnel_dir(&server.config.data_dir));
        }
        view
    }

    /// *Extend*: a quick link's twelve hours from now again.
    pub fn extend(&self) -> Result<LinkView, String> {
        self.manager.extend()
    }
}

/// The server's link, made on first use. None on "this app is a server",
/// whose host runs its own tunnel (ADR 0117 D11 item 5).
pub fn of(server: &Arc<Server>) -> Option<Arc<Link>> {
    if server.local.is_some() {
        return None;
    }
    Some(Arc::clone(server.tunnel.get_or_init(|| {
        Arc::new(Link::new(server, Program::Pinned))
    })))
}

/// The link's lines in the server's log, said once at the start.
pub fn log_to_the_server() {
    verso_tunnel::log::set(Box::new(|level, _source, text| {
        crate::log::line(level, text);
    }));
}

/// The link the environment asks for at the start (`VERSO_TUNNEL`), on a
/// thread of its own, once the server serves. Said in the audit log as the
/// environment's act.
pub fn at_start(server: &Arc<Server>) {
    let ask = match server.config.tunnel.at_start {
        TunnelAtStart::Off => return,
        TunnelAtStart::Quick => Ask::Quick,
        TunnelAtStart::Own => Ask::Own {
            hostname: None,
            token: None,
        },
    };
    let Some(link) = of(server) else { return };
    let weak = Arc::downgrade(server);
    let spawned = std::thread::Builder::new()
        .name("universo-link-start".to_owned())
        .spawn(move || {
            let ok = link.turn_on(&ask).is_ok();
            if let Some(server) = weak.upgrade() {
                let _ = server.db.audit(&crate::db::Audit {
                    actor: None,
                    action: "link_on",
                    subject: Some(if matches!(ask, Ask::Quick) {
                        "quick"
                    } else {
                        "own"
                    }),
                    folder: None,
                    address: Some("environment"),
                    ok,
                });
            }
        });
    if spawned.is_err() {
        crate::log::warn("the internet link: VERSO_TUNNEL could not be started");
    }
}

/// The server ends: no tunnel stays (the child is stopped, the listener
/// closed). Blocking, off the runtime.
pub fn at_end(server: &Server) {
    if let Some(link) = server.tunnel.get() {
        link.turn_off(LinkEnd::Quit);
    }
}

/// What the console shows of the link: its state, its address while on, a
/// quick link's end, the own address's hostname and the port its tunnel's
/// service names, and what the environment set (the token as set or not).
#[must_use]
pub fn json(server: &Server, view: &LinkView, hostname: Option<String>) -> serde_json::Value {
    let env = &server.config.tunnel;
    serde_json::json!({
        "state": view.state,
        "origin": view.origin,
        "until": view.until_ms,
        "own": view.own,
        "ended": view.ended,
        "protocol": view.protocol,
        "download": view.download.map(|(done, total)| serde_json::json!({ "done": done, "total": total })),
        "hostname": hostname.or_else(|| env.hostname.clone()),
        "port": env.port,
        "atStart": match env.at_start {
            TunnelAtStart::Off => "off",
            TunnelAtStart::Quick => "quick",
            TunnelAtStart::Own => "own",
        },
        "tokenSet": env.token.is_some(),
        // `VERSO_PUBLIC_URL` names the links that leave even with the link
        // on: the console says so.
        "publicUrl": server.config.public_url.is_some(),
    })
}
