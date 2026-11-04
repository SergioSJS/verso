// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The routes: the window's page and files, the folders' files under
//! `/f/`, the API of accounts and access, the contract's WebSocket. Every
//! response carries the server's headers (ADR 0073 item 6); every request
//! is checked for its `Host` first.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::extract::{ConnectInfo, FromRequestParts, Path, Request, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use serde::Serialize;

use crate::auth::{self, Peer, Who};
use crate::state::Server;

/// An API error: the status, a code the window says in the person's
/// language, and a message for the log and for a program.
#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
    pub retry: Option<u64>,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            retry: None,
        }
    }

    pub fn bad(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, code, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "forbidden", message)
    }

    pub fn not_found() -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", "not found")
    }

    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "signed_out", "sign in first")
    }

    pub fn wait(seconds: u64) -> Self {
        Self {
            retry: Some(seconds.max(1)),
            ..Self::new(
                StatusCode::TOO_MANY_REQUESTS,
                "too_many",
                "too many attempts",
            )
        }
    }
}

impl From<String> for ApiError {
    fn from(message: String) -> Self {
        crate::log::error(&message);
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "failed", message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut response = (
            self.status,
            axum::Json(serde_json::json!({ "error": self.code, "message": self.message, "retry": self.retry })),
        )
            .into_response();
        if let Some(s) = self.retry
            && let Ok(v) = HeaderValue::from_str(&s.to_string())
        {
            response.headers_mut().insert(header::RETRY_AFTER, v);
        }
        // Every refusal says whose it is, in the header the sync already
        // speaks: the desktop app tells this server's 401 from a router's
        // login page by it, not by guessing at a body that may arrive late
        // (ADR 0097).
        response.headers_mut().insert(
            verso_core::sync::PROTOCOL_HEADER,
            HeaderValue::from(verso_core::sync::PROTOCOL),
        );
        response
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

/// The address a connection came from, over TCP or TLS alike, set on each
/// request by the listener (`crate::listen`).
#[derive(Debug, Clone, Copy)]
pub struct Remote(pub SocketAddr);

/// What every handler of the API knows of its request.
pub struct Ctx {
    pub server: Arc<Server>,
    pub peer: Peer,
    pub who: Option<Who>,
    pub headers: HeaderMap,
    pub method: Method,
}

impl FromRequestParts<Arc<Server>> for Ctx {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        server: &Arc<Server>,
    ) -> Result<Self, Self::Rejection> {
        let remote = parts
            .extensions
            .get::<ConnectInfo<Remote>>()
            .map_or_else(|| SocketAddr::from(([127, 0, 0, 1], 0)), |c| c.0.0);
        let link = crate::local::link::by_link(&parts.extensions);
        let peer = auth::peer(server, &parts.headers, remote, link);
        // Over plain HTTP the session cookie is the plain-named one
        // (ADR 0073 item 6, amended 2026-10-16).
        let who = auth::who(server, &parts.headers, peer.https)?;
        Ok(Self {
            server: Arc::clone(server),
            peer,
            who,
            headers: parts.headers.clone(),
            method: parts.method.clone(),
        })
    }
}

impl Ctx {
    /// The address, as the audit log keeps it.
    pub fn address(&self) -> String {
        self.peer.addr.to_string()
    }

    /// Whoever is signed in, or 401.
    pub fn who(&self) -> ApiResult<&Who> {
        self.who.as_ref().ok_or_else(ApiError::unauthorized)
    }

    /// The person themselves — a browser or the desktop app signed in as
    /// them — or 403: an access token reaches its folders' notes and
    /// files, never the account, its sessions, keys, settings or the
    /// folders' members (ADR 0074 item 8; threat-model.md).
    pub fn person(&self) -> ApiResult<&Who> {
        let who = self.who()?;
        if matches!(who.via, auth::Via::Token { .. }) {
            return Err(ApiError::forbidden("not with an access token"));
        }
        Ok(who)
    }

    /// An admin, or 403 (ADR 0074 item 6).
    pub fn admin(&self) -> ApiResult<&Who> {
        let who = self.who()?;
        if !who.account.admin || matches!(who.via, auth::Via::Token { .. }) {
            return Err(ApiError::forbidden("admins only"));
        }
        Ok(who)
    }

    /// A request that changes something: from a page of this server
    /// (`Origin`) with the session's CSRF token, or from a program with a
    /// bearer token (ADR 0074 item 7).
    pub fn changes(&self) -> ApiResult<()> {
        match self.who.as_ref().map(|w| &w.via) {
            Some(auth::Via::Token { .. } | auth::Via::Device { .. }) => Ok(()),
            Some(auth::Via::Browser { csrf, .. }) => {
                if !auth::origin_ok(&self.server, &self.headers, &self.peer) {
                    return Err(ApiError::forbidden("not from a page of this server"));
                }
                let sent = self
                    .headers
                    .get("x-verso-csrf")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("");
                if crate::crypto::same(sent.as_bytes(), csrf.as_bytes()) {
                    Ok(())
                } else {
                    Err(ApiError::new(
                        StatusCode::FORBIDDEN,
                        "csrf",
                        "stale page: reload",
                    ))
                }
            }
            // Signing in, accepting an invitation: no session yet, so the
            // origin is what is checked.
            None => {
                if auth::origin_ok(&self.server, &self.headers, &self.peer) {
                    Ok(())
                } else {
                    Err(ApiError::forbidden("not from a page of this server"))
                }
            }
        }
    }

    /// One line of the audit log; a failure to write it is logged, never
    /// lost silently.
    pub fn audit(&self, action: &str, subject: Option<&str>, folder: Option<&str>, ok: bool) {
        let actor = self.who.as_ref().map(|w| w.account.id.clone());
        self.audit_as(actor.as_deref(), action, subject, folder, ok);
    }

    /// The same, on behalf of `actor` — an account the request just made
    /// or signed in.
    pub fn audit_as(
        &self,
        actor: Option<&str>,
        action: &str,
        subject: Option<&str>,
        folder: Option<&str>,
        ok: bool,
    ) {
        let address = self.address();
        if let Err(e) = self.server.db.audit(&crate::db::Audit {
            actor,
            action,
            subject,
            folder,
            address: Some(&address),
            ok,
        }) {
            crate::log::error(&format!("audit log: {e}"));
        }
    }
}

/// JSON with `200`.
pub fn ok<T: Serialize>(value: T) -> Response {
    axum::Json(value).into_response()
}

/// The window's page: the app's own page with the browser's entry
/// (`web.js`) in place of the desktop's.
const PAGE: &str = "web.html";

/// The window's page for the routes that name it: read at each request
/// (a new build is a new window), and, when the file cannot be read at that
/// instant (a build replacing `dist/`, a volume that blinked), the last copy
/// that was; with none, a small page that asks again in two seconds, never an
/// empty `404` that leaves a visitor on a blank screen (seen in the server
/// e2e of 2026-10-26: `/` answered `404` with no body).
fn page_route(path: std::path::PathBuf) -> axum::routing::MethodRouter<Arc<Server>> {
    let last: Arc<std::sync::Mutex<Option<Arc<str>>>> = Arc::default();
    get(move || {
        let (path, last) = (path.clone(), Arc::clone(&last));
        async move {
            let read = tokio::task::spawn_blocking({
                let path = path.clone();
                move || crate::data::read_page(&path)
            })
            .await;
            let html = match read {
                Ok(Ok(text)) => {
                    let text: Arc<str> = text.into();
                    if let Ok(mut kept) = last.lock() {
                        *kept = Some(Arc::clone(&text));
                    }
                    Some(text)
                }
                _ => last.lock().ok().and_then(|kept| kept.clone()),
            };
            match html {
                Some(text) => (
                    [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
                    text.to_string(),
                )
                    .into_response(),
                None => {
                    crate::log::error(&format!(
                        "the window's page {} cannot be read",
                        path.display()
                    ));
                    (
                        StatusCode::SERVICE_UNAVAILABLE,
                        [
                            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                            (header::RETRY_AFTER, "2"),
                        ],
                        RETRY_PAGE,
                    )
                        .into_response()
                }
            }
        }
    })
}

/// What a visitor sees while the page cannot be read.
const RETRY_PAGE: &str = "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"2\"><title>Verso</title><p style=\"font:16px system-ui;margin:2em\">Verso is starting. Trying again in a moment&hellip; / O Verso est&aacute; iniciando. Tentando de novo j&aacute;&hellip;</p>";

/// Every route of the server.
pub fn router(server: Arc<Server>) -> Router {
    let ui = server.config.ui_dir.clone();
    let static_files = tower_http::services::ServeDir::new(&ui)
        .append_index_html_on_directories(false)
        .fallback(tower_http::services::ServeFile::new(ui.join(PAGE)));
    // Revalidated each time, or kept for good when the name has a hash
    // (static_cache.rs): an upgraded server is met by its own window.
    let static_files = Router::new()
        .fallback_service(static_files)
        .layer(middleware::from_fn(crate::static_cache::keep));
    let router: Router<Arc<Server>> = Router::new()
        .route("/f/{folder}/{*path}", get(crate::files::file))
        .route("/api/ws", get(crate::rpc::upgrade))
        .route("/api/state", get(crate::api::state))
        .route("/api/signin", post(crate::api::sign_in))
        .route("/api/signout", post(crate::api::sign_out))
        .route("/api/signin/link", post(crate::api::signin_link))
        .route(
            "/api/signin/link/{token}",
            get(crate::api::signin_link_offer).post(crate::api::signin_by_link),
        )
        .route("/api/forgot", post(crate::api::forgot))
        .route("/api/setup", post(crate::api::setup))
        .route(
            "/api/invite/{token}",
            get(crate::api::invitation).post(crate::api::accept),
        )
        .route("/api/invite/{token}/join", post(crate::invite_join::join))
        .route(
            "/api/reset/{token}",
            get(crate::api::reset_link).post(crate::api::reset),
        )
        .route("/api/me", get(crate::api::me).patch(crate::api::profile))
        .route("/api/me/password", post(crate::api::password))
        .route("/api/me/prove", post(crate::proof::prove))
        .route("/api/me/prove/passkey", post(crate::passkeys::prove_start))
        .route("/api/me/sessions", get(crate::api::sessions))
        .route("/api/me/device", axum::routing::put(crate::device::rename))
        .route("/api/me/sessions/others", delete(crate::api::end_others))
        .route("/api/me/sessions/{id}", delete(crate::api::end_session))
        .route(
            "/api/me/tokens",
            get(crate::api::tokens).post(crate::api::create_token),
        )
        .route("/api/me/tokens/{id}", delete(crate::api::revoke_token))
        .route(
            "/api/me/settings",
            get(crate::api::settings).put(crate::api::set_settings),
        )
        .route(
            "/api/me/passkeys",
            get(crate::passkeys::list).post(crate::passkeys::register_start),
        )
        .route(
            "/api/me/passkeys/finish",
            post(crate::passkeys::register_finish),
        )
        .route("/api/me/passkeys/{id}", delete(crate::passkeys::remove))
        .route("/api/passkey/start", post(crate::passkeys::sign_in_start))
        .route("/api/passkey/finish", post(crate::passkeys::sign_in_finish))
        .route(
            "/api/folders",
            get(crate::folders::mine).post(crate::folders::create),
        )
        .route("/api/folders/{id}/members", get(crate::folders::members))
        .route(
            "/api/folders/{id}/members/{account}",
            axum::routing::put(crate::folders::set_member).delete(crate::folders::remove_member),
        )
        .route("/api/folders/{id}/audit", get(crate::folders::audit))
        .route(
            "/api/folders/{id}/shares",
            get(crate::shares::list).put(crate::shares::grant),
        )
        .route(
            "/api/folders/{id}/shares/revoke",
            post(crate::shares::revoke),
        )
        .route(
            "/api/folders/{id}/shares/attachments",
            axum::routing::put(crate::shares::attachments),
        )
        .route(
            "/api/admin/accounts",
            get(crate::console::accounts).post(crate::admin::create_account),
        )
        .route(
            "/api/admin/accounts/{id}",
            get(crate::console::account)
                .patch(crate::admin::set_powers)
                .delete(crate::admin::delete_account),
        )
        .route(
            "/api/admin/accounts/{id}/reset",
            post(crate::admin::reset_link),
        )
        .route(
            "/api/admin/accounts/{id}/sessions",
            delete(crate::admin::end_sessions),
        )
        .route(
            "/api/admin/invitations",
            get(crate::console::invitations).post(crate::admin::invite),
        )
        .route(
            "/api/admin/invitations/{id}",
            delete(crate::admin::end_invitation),
        )
        .route("/api/admin/folders", get(crate::console::folders))
        .route(
            "/api/admin/folders/unregistered",
            get(crate::console::unregistered),
        )
        .route("/api/admin/folders/adopt", post(crate::admin::adopt))
        .route("/api/admin/folders/{id}", get(crate::console::folder))
        .route(
            "/api/admin/folders/{id}/quota",
            axum::routing::put(crate::console::set_quota),
        )
        .route("/api/admin/folders/{id}/enter", post(crate::admin::enter))
        .route(
            "/api/admin/folders/{id}/trash",
            axum::routing::put(crate::console::set_trash),
        )
        .route(
            "/api/admin/folders/{id}/trash/empty",
            axum::routing::post(crate::console::empty_trash),
        )
        .route(
            "/api/admin/folders/{id}/history",
            axum::routing::put(crate::console::set_history),
        )
        .route("/api/admin/audit", get(crate::console::audit))
        .route("/api/admin/audit/actions", get(crate::console::actions))
        .route("/api/admin/overview", get(crate::console::overview))
        .route("/api/admin/config", get(crate::console::config))
        .route("/api/device/start", post(crate::device::start))
        .route("/api/device/poll", post(crate::device::poll))
        .route("/api/device/describe", post(crate::device::describe_typed))
        .route("/api/device/approve", post(crate::device::approve_typed))
        .route("/api/device/refuse", post(crate::device::refuse_typed))
        // No route takes a device's code from the address: a link sent by
        // someone else would carry it (decided 2026-10-14, ADR 0083 As
        // built). An address under /api/ no route names is answered 404,
        // never the page.
        .route("/api/{*rest}", axum::routing::any(no_route))
        // Read links (ADR 0105): the routes of the owner and of the
        // administrator are under /api/; what a visitor with no account
        // may reach is /r/<token>/ alone (`crate::visit`).
        .route(
            "/api/folders/{id}/readlinks",
            get(crate::readlinks::list).post(crate::readlinks::make),
        )
        .route(
            "/api/folders/{id}/readlinks/secrets",
            get(crate::readlinks::secrets),
        )
        .route(
            "/api/folders/{id}/readlinks/{link}",
            delete(crate::readlinks::revoke),
        )
        .route(
            "/api/admin/read-links",
            get(crate::readlinks::switch).put(crate::readlinks::set_switch),
        )
        .route("/r/{token}/state", get(crate::visit::state))
        .route("/r/{token}/unlock", post(crate::visit::unlock))
        .route("/r/{token}/ws", get(crate::visit::ws))
        .route("/r/{token}/f/{*path}", get(crate::visit::file));
    // The pages — signing in, approving the desktop app, the account — are
    // served always; the notes' window in a browser only with `--web`
    // (ADR 0073 item 2), which the WebSocket enforces (rpc.rs).
    let page = || page_route(ui.join(PAGE));
    let router = router
        .route("/", page())
        .route("/signin", page())
        .route("/setup", page())
        .route("/account", page())
        .route("/admin", page())
        .route("/admin/{*rest}", page())
        .route("/device", page())
        .route("/invite/{token}", page())
        .route("/reset/{token}", page())
        .route("/signin-link/{token}", page())
        .route("/r/{token}", page())
        // Where to report a vulnerability (RFC 9116; ADR 0083 item 15).
        .route("/.well-known/security.txt", get(crate::security_txt::serve))
        .fallback_service(static_files);
    guarded(router, server)
}

/// The layers every route of every server has, from the outside in: the
/// body's limit, the deadline, the guard (`Host`, head, places, headers),
/// the pace. "This app is a server" (`crate::local`) wraps its own, smaller
/// table of routes in the same.
pub(crate) fn guarded(router: Router<Arc<Server>>, server: Arc<Server>) -> Router {
    router
        .layer(middleware::from_fn_with_state(Arc::clone(&server), pace))
        .layer(middleware::from_fn_with_state(Arc::clone(&server), guard))
        .layer(middleware::from_fn(deadline))
        // A request's body: a form, a setting, a passkey — never a file,
        // which goes over the WebSocket under its own limit
        // (rpc::MAX_MESSAGE).
        .layer(axum::extract::DefaultBodyLimit::max(API_BODY))
        .with_state(server)
}

/// An address under `/api/` that no route names.
pub(crate) async fn no_route() -> ApiError {
    ApiError::not_found()
}

/// The most a request's body takes: settings are 256 KB at most.
const API_BODY: usize = 1024 * 1024;

/// How long a request may take, its body's arrival included
/// (threat-model.md, gap 8): a body of [`API_BODY`] at 32 KiB/s is half
/// a minute; a client that trickles one in holds its connection no longer.
/// A WebSocket's answer is its upgrade, at once; what it carries after is
/// bounded by its own loop (`crate::rpc`).
const REQUEST_WITHIN: std::time::Duration = std::time::Duration::from_secs(60);

/// The requests one client address may have in flight at once (an IPv6
/// /64 as one), directly or through a trusted proxy: a browser's six
/// connections for each of a household's few devices, with room. Through
/// a proxy, a connection counts only against the server's
/// `crate::listen::CONNECTIONS`, and a client that trickled its bodies
/// could hold them all from one address; past this it is answered 429.
pub const IN_FLIGHT: usize = 32;

/// How long a request's body may take to arrive (the review of
/// 2026-10-13): a body here is a form, a setting, a passkey — [`API_BODY`]
/// at most, never a file, which goes over the WebSocket — so a few
/// seconds on a slow link; a client that trickles one in holds its place
/// no longer. [`REQUEST_WITHIN`] still bounds the answer.
#[cfg(not(test))]
pub const BODY_WITHIN: std::time::Duration = std::time::Duration::from_secs(10);
#[cfg(test)]
pub const BODY_WITHIN: std::time::Duration = std::time::Duration::from_secs(2);

async fn deadline(request: Request, next: Next) -> Response {
    match tokio::time::timeout(REQUEST_WITHIN, next.run(request)).await {
        Ok(response) => response,
        Err(_) => ApiError::new(
            StatusCode::REQUEST_TIMEOUT,
            "timeout",
            "the request took too long",
        )
        .into_response(),
    }
}

/// The pace of the REST routes, per address (ADR 0083 item 7): every
/// route under `/api/` but the WebSocket's upgrade, which `crate::fair`
/// counts once it is accepted. A direct connection from this machine is not
/// paced; everything that comes through a trusted proxy is, under the
/// address the proxy forwarded — a forwarded `127.0.0.1` is the client's
/// word, never this machine — or, when it forwarded none, under the
/// proxy's own: every visitor as one key, which the once-a-minute warning
/// of `crate::auth::peer` explains. The window's files and the page are
/// left to the connection limits (a page load is a burst of files).
/// A refused upgrade is not counted by `crate::fair`: it takes a request
/// from the pace like any other, and is refused 429 when the address is
/// past it, so that a flood of upgrades with no credential is no way
/// around the pace.
async fn pace(State(server): State<Arc<Server>>, request: Request, next: Next) -> Response {
    let path = request.uri().path();
    // A read link's routes are paced like the API's, per address (ADR 0105
    // item 6; the link's own pace is `crate::visit`'s); its page, a
    // static file like the window's, is not.
    let link = is_link_route(path);
    if !path.starts_with("/api/") && !link {
        return next.run(request).await;
    }
    let Some(key) = client_key(&server, &request) else {
        return next.run(request).await;
    };
    let too_many = |wait: u64| {
        ApiError {
            retry: Some(wait),
            ..ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "too_many",
                "too many requests",
            )
        }
        .into_response()
    };
    let upgrade = (path == "/api/ws" || (link && path.ends_with("/ws")))
        && request
            .headers()
            .get(header::UPGRADE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.eq_ignore_ascii_case("websocket"));
    if upgrade {
        if let Some(wait) = server.pace.waiting(&key) {
            return too_many(wait);
        }
        let response = next.run(request).await;
        if response.status() != StatusCode::SWITCHING_PROTOCOLS {
            let _ = server.pace.take(&key);
        }
        return response;
    }
    if let Some(wait) = server.pace.take(&key) {
        return too_many(wait);
    }
    next.run(request).await
}

/// Whether `path` is under a read link — `/r/<token>/…`, not the page at
/// `/r/<token>` itself.
pub(crate) fn is_link_route(path: &str) -> bool {
    path.strip_prefix("/r/")
        .is_some_and(|rest| rest.split_once('/').is_some())
}

/// Whether `path` is a folder's file served to a read link.
pub(crate) fn is_link_file(path: &str) -> bool {
    path.strip_prefix("/r/")
        .and_then(|rest| rest.split_once('/'))
        .is_some_and(|(_, after)| after.starts_with("f/"))
}

/// The window's own policy, sent as a header and narrower than the
/// desktop's (ADR 0073 item 6): scripts, styles and connections from this
/// server only; pictures, sound and embedded pages from the web as the
/// reader allows them (the maintainer's answer I of 2026-10-09).
/// `'wasm-unsafe-eval'` lets the window compile WebAssembly — the live
/// share's Opus decoder (ADR 0116 item 18) — and nothing else: no `eval`,
/// no script from elsewhere.
fn page_policy(ws_origin: &str, tiles: &[String]) -> String {
    // The origins the person approved for a map's tiles (ADR 0094 item
    // 10): the window fetches them itself — the page's script and the map's
    // worker, whose own answer carries this policy — and reaches no other.
    let tiles: String = tiles.iter().map(|o| format!(" {o}")).collect();
    format!(
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; \
         img-src 'self' data: blob: https:; media-src 'self' blob: https:; \
         frame-src 'self' https:; object-src 'none'; connect-src 'self' {ws_origin}{tiles}; \
         worker-src 'self' blob:; font-src 'self' data:; base-uri 'none'; \
         form-action 'self'; frame-ancestors 'self'"
    )
}

/// The most tile origins a page's policy names.
const TILE_ORIGINS_MOST: usize = 32;

/// The map worker the window loads from this server: its policy is its
/// own answer's, so it names the approved tile origins as the page does.
const MAP_WORKER: &str = "/maplibre-worker.mjs";

/// The service worker that keeps the window and the folders made available
/// offline (ADR 0092 item 2): the server's own file, at the root so that its
/// scope is the whole window. Never kept by the browser's HTTP cache: a new
/// build of the window is a new worker, and the browser must see it.
const SERVICE_WORKER: &str = "/sw.js";

/// The origins the person signed in has approved for maps' tiles, from
/// their settings (`mapTileOrigins`), each written back only as
/// `scheme://host[:port]` of http(s), letters, digits, dots and hyphens:
/// anything else — a space, a quote, a semicolon, a wildcard, a path —
/// would change the policy it is written into, and is left out.
fn tile_origins(server: &Server, headers: &HeaderMap, https: bool) -> Vec<String> {
    let Ok(Some(who)) = auth::who(server, headers, https) else {
        return Vec::new();
    };
    if matches!(who.via, auth::Via::Token { .. }) {
        return Vec::new();
    }
    let Ok(Some(text)) = server.db.person_settings(&who.account.id) else {
        return Vec::new();
    };
    let Ok(settings) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Vec::new();
    };
    let mut out: Vec<String> = Vec::new();
    for o in settings
        .get("mapTileOrigins")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .filter_map(policy_origin)
    {
        if !out.contains(&o) && out.len() < TILE_ORIGINS_MOST {
            out.push(o);
        }
    }
    out
}

/// `o` as a source of a content security policy, or `None`.
fn policy_origin(o: &str) -> Option<String> {
    let (scheme, rest) = o.split_once("://")?;
    if scheme != "https" && scheme != "http" {
        return None;
    }
    let (host, port) = match rest.rsplit_once(':') {
        Some((h, p)) if !p.is_empty() && p.len() <= 5 && p.bytes().all(|b| b.is_ascii_digit()) => {
            (h, Some(p))
        }
        _ => (rest, None),
    };
    let fine = |b: u8| b.is_ascii_alphanumeric() || b == b'.' || b == b'-';
    if host.is_empty()
        || host.len() > 253
        || !host.bytes().all(fine)
        || host.starts_with(['.', '-'])
        || host.ends_with(['.', '-'])
    {
        return None;
    }
    let host = host.to_ascii_lowercase();
    Some(match port {
        Some(p) => format!("{scheme}://{host}:{p}"),
        None => format!("{scheme}://{host}"),
    })
}

/// The key a request is counted under: the client's address as the
/// trusted proxies walk it, an IPv6 /64 as one — the pace's key — or
/// `None` for a direct connection from this machine, which speaks for
/// everyone and is not counted.
fn client_key(server: &Server, request: &Request) -> Option<String> {
    let remote = request
        .extensions()
        .get::<ConnectInfo<Remote>>()
        .map_or_else(|| SocketAddr::from(([127, 0, 0, 1], 0)), |c| c.0.0);
    // This machine speaking for itself is not counted; a forwarded
    // address is, even a loopback one (ADR 0083 item 7) — through the
    // internet link's listener, by that listener's proxies (ADR 0117).
    auth::client_key(
        server,
        request.headers(),
        remote,
        crate::local::link::by_link(request.extensions()),
    )
}

/// The request's body read whole within [`BODY_WITHIN`] and [`API_BODY`],
/// or the answer that refuses it: 408 past the time, 413 past the size.
async fn with_body(request: Request) -> Result<Request, ApiError> {
    let (parts, body) = request.into_parts();
    match tokio::time::timeout(BODY_WITHIN, axum::body::to_bytes(body, API_BODY)).await {
        Ok(Ok(bytes)) => Ok(Request::from_parts(parts, axum::body::Body::from(bytes))),
        Ok(Err(_)) => Err(ApiError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "too_large",
            "a request's body is 1 MB at most",
        )),
        Err(_) => Err(ApiError::new(
            StatusCode::REQUEST_TIMEOUT,
            "timeout",
            "the request's body took too long",
        )),
    }
}

/// The size of a request's head as it came: its line, and each header as
/// `name: value` and a line end.
fn head_size(request: &Request) -> usize {
    let line = request.method().as_str().len() + request.uri().to_string().len() + 12;
    request
        .headers()
        .iter()
        .map(|(name, value)| name.as_str().len() + value.len() + 4)
        .sum::<usize>()
        + line
}

/// Before every route: the head within 64 KiB, or 431 (ADR 0083 item 8);
/// the `Host` named this server, or 421; a place among its address's
/// requests in flight, or 429; its body within [`BODY_WITHIN`], or 408;
/// after it, the server's headers on every answer.
async fn guard(State(server): State<Arc<Server>>, request: Request, next: Next) -> Response {
    if head_size(&request) > crate::listen::HEAD_MOST {
        return ApiError::new(
            StatusCode::REQUEST_HEADER_FIELDS_TOO_LARGE,
            "head_too_large",
            "a request's headers are 64 KiB at most",
        )
        .into_response();
    }
    let remote = request
        .extensions()
        .get::<ConnectInfo<Remote>>()
        .map_or_else(|| SocketAddr::from(([127, 0, 0, 1], 0)), |c| c.0.0);
    let peer = auth::peer(
        &server,
        request.headers(),
        remote,
        crate::local::link::by_link(request.extensions()),
    );
    if !auth::host_ok(&server, request.headers(), &peer) {
        // A browser at the server's old address is shown a page naming the
        // right one (ADR 0073, 2026-10-31); every other client gets the
        // JSON refusal, the same 421.
        if let Some(page) = crate::wrong_host::answer(
            server.config.public_url.as_deref(),
            request.method(),
            request.uri().path(),
            request.headers(),
        ) {
            return page;
        }
        return ApiError::new(
            StatusCode::MISDIRECTED_REQUEST,
            "host",
            "this server does not answer to that name; set VERSO_PUBLIC_URL to the address people use",
        )
        .into_response();
    }
    // Its place among its address's requests, held until it is answered.
    let _place = match client_key(&server, &request) {
        Some(key) => match server.requests.take(&key, IN_FLIGHT) {
            Some(place) => Some(place),
            None => {
                server.requests.said.warn(&format!(
                    "requests refused: {key} has {IN_FLIGHT} in flight"
                ));
                return ApiError {
                    retry: Some(1),
                    ..ApiError::new(
                        StatusCode::TOO_MANY_REQUESTS,
                        "too_many",
                        "too many requests at once",
                    )
                }
                .into_response();
            }
        },
        None => None,
    };
    let request = match with_body(request).await {
        Ok(request) => request,
        Err(refused) => return refused.into_response(),
    };
    let ws_origin = auth::expected_origin(&server, request.headers(), &peer)
        .map(|o| o.replacen("http", "ws", 1))
        .unwrap_or_default();
    let is_file = request.uri().path().starts_with("/f/") || is_link_file(request.uri().path());
    let is_link = request.uri().path().starts_with("/r/");
    let is_worker = request.uri().path() == MAP_WORKER;
    let is_service_worker = request.uri().path() == SERVICE_WORKER;
    let asked_by = request.headers().clone();
    let mut response = next.run(request).await;
    let h = response.headers_mut();
    let set = |h: &mut HeaderMap, name: &'static str, value: &str| {
        if let Ok(v) = HeaderValue::from_str(value) {
            h.entry(name).or_insert(v);
        }
    };
    set(h, "x-content-type-options", "nosniff");
    set(h, "referrer-policy", "no-referrer");
    set(h, "x-frame-options", "SAMEORIGIN");
    set(h, "cross-origin-opener-policy", "same-origin");
    set(
        h,
        "permissions-policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), \
         interest-cohort=()",
    );
    if is_link {
        // A read link's page and answers are for no search engine and no
        // archive (ADR 0105 item 5); the referrer is already none.
        set(h, "x-robots-tag", "noindex, nofollow");
    }
    if is_file {
        // A folder's file is for this server's pages alone: another
        // site's page may not embed or fetch it with the reader's cookie
        // (threat-model.md, gap 14; SameSite=Lax already keeps the cookie
        // off such a request — said twice).
        set(h, "cross-origin-resource-policy", "same-origin");
    }
    // The page is never cached: a new version of the server is a new
    // window. The rest carries `?v=<version>` (build-index.mjs). The map's
    // worker is not cached either: its policy names the person's approved
    // tile origins as they are when it loads (ADR 0094 item 10).
    let html = h
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("text/html"));
    if !is_file {
        // The settings are read only where the policy is a document's or a
        // worker's: the page and the map's worker.
        let tiles = if html || is_worker {
            tile_origins(&server, &asked_by, peer.https)
        } else {
            Vec::new()
        };
        set(
            h,
            "content-security-policy",
            &page_policy(&ws_origin, &tiles),
        );
    }
    if (html || is_worker || is_service_worker) && !is_file {
        h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    }
    // Only for the server's own TLS or a public HTTPS address, as before:
    // `includeSubDomains` remembered for a name that is also reached over
    // plain HTTP (`http://name:7340`, behind a proxy that said https once)
    // would lock that name out of HTTP. A browser ignores the header over
    // plain HTTP, so the HTTP answers of such a name carry it harmlessly.
    if server.config.tls.is_some()
        || server
            .config
            .public_url
            .as_deref()
            .is_some_and(|u| u.starts_with("https://"))
    {
        // A subdomain of the server's name could otherwise set a cookie
        // for it over plain HTTP; `preload` is the host's own choice for
        // their domain, never sent by default (ADR 0083 item 9).
        set(
            h,
            "strict-transport-security",
            "max-age=31536000; includeSubDomains",
        );
    }
    response
}

/// A path parameter, for the handlers that take one.
pub type Id = Path<String>;
