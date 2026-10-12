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
use axum::routing::{delete, get, get_service, post};
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
        let peer = auth::peer(server, &parts.headers, remote);
        // A secret over plain HTTP outside this machine is never read: no
        // session, no token is opened from it.
        let who = if peer.secure {
            auth::who(server, &parts.headers)?
        } else {
            None
        };
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

    /// The request may sign in or carry a secret: TLS, or this machine
    /// (ADR 0073 item 6).
    pub fn secure(&self) -> ApiResult<()> {
        if self.peer.secure {
            Ok(())
        } else {
            Err(ApiError::new(
                StatusCode::FORBIDDEN,
                "tls_required",
                "this server signs in over HTTPS only",
            ))
        }
    }

    /// A request that changes something: from a page of this server
    /// (`Origin`) with the session's CSRF token, or from a program with a
    /// bearer token (ADR 0074 item 7).
    pub fn changes(&self) -> ApiResult<()> {
        self.secure()?;
        match self.who.as_ref().map(|w| &w.via) {
            Some(auth::Via::Token { .. } | auth::Via::Device { .. }) => Ok(()),
            Some(auth::Via::Browser { csrf, .. }) => {
                if !auth::origin_ok(&self.server, &self.headers) {
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
                if auth::origin_ok(&self.server, &self.headers) {
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

/// Every route of the server.
pub fn router(server: Arc<Server>) -> Router {
    let ui = server.config.ui_dir.clone();
    let static_files = tower_http::services::ServeDir::new(&ui)
        .append_index_html_on_directories(false)
        .fallback(tower_http::services::ServeFile::new(ui.join(PAGE)));
    let router: Router<Arc<Server>> = Router::new()
        .route("/f/{folder}/{*path}", get(crate::files::file))
        .route("/api/ws", get(crate::rpc::upgrade))
        .route("/api/state", get(crate::api::state))
        .route("/api/signin", post(crate::api::sign_in))
        .route("/api/signout", post(crate::api::sign_out))
        .route("/api/signin/link", post(crate::api::signin_link))
        .route("/api/signin/link/{token}", post(crate::api::signin_by_link))
        .route("/api/forgot", post(crate::api::forgot))
        .route("/api/setup", post(crate::api::setup))
        .route(
            "/api/invite/{token}",
            get(crate::api::invitation).post(crate::api::accept),
        )
        .route(
            "/api/reset/{token}",
            get(crate::api::reset_link).post(crate::api::reset),
        )
        .route("/api/me", get(crate::api::me).patch(crate::api::profile))
        .route("/api/me/password", post(crate::api::password))
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
        .route("/api/admin/audit", get(crate::console::audit))
        .route("/api/admin/audit/actions", get(crate::console::actions))
        .route("/api/admin/overview", get(crate::console::overview))
        .route("/api/admin/config", get(crate::console::config))
        .route("/api/device/start", post(crate::device::start))
        .route("/api/device/poll", post(crate::device::poll))
        .route(
            "/api/device/{code}",
            get(crate::device::describe).post(crate::device::approve),
        );
    // The pages — signing in, approving the desktop app, the account — are
    // served always; the notes' window in a browser only with `--web`
    // (ADR 0073 item 2), which the WebSocket enforces (rpc.rs).
    let page = || get_service(tower_http::services::ServeFile::new(ui.join(PAGE)));
    router
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
        .fallback_service(static_files)
        .layer(middleware::from_fn_with_state(Arc::clone(&server), guard))
        .layer(middleware::from_fn(deadline))
        // A request's body: a form, a setting, a passkey — never a file,
        // which goes over the WebSocket under its own limit
        // (rpc::MAX_MESSAGE).
        .layer(axum::extract::DefaultBodyLimit::max(API_BODY))
        .with_state(server)
}

/// The most a request's body takes: settings are 256 KB at most.
const API_BODY: usize = 1024 * 1024;

/// How long a request may take, its body's arrival included
/// (threat-model.md, gap 8): a body of [`API_BODY`] at 32 KiB/s is half
/// a minute; a client that trickles one in holds its connection no longer.
/// A WebSocket's answer is its upgrade, at once; what it carries after is
/// bounded by its own loop (`crate::rpc`).
const REQUEST_WITHIN: std::time::Duration = std::time::Duration::from_secs(60);

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

/// The window's own policy, sent as a header and narrower than the
/// desktop's (ADR 0073 item 6): scripts, styles and connections from this
/// server only; pictures, sound and embedded pages from the web as the
/// reader allows them (the maintainer's answer I of 2026-10-09).
fn page_policy(ws_origin: &str) -> String {
    format!(
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; \
         img-src 'self' data: blob: https:; media-src 'self' blob: https:; \
         frame-src 'self' https:; object-src 'none'; connect-src 'self' {ws_origin}; \
         worker-src 'self' blob:; font-src 'self' data:; base-uri 'none'; \
         form-action 'self'; frame-ancestors 'self'"
    )
}

/// Before every route: the `Host` named this server, or 421; after it, the
/// server's headers on every answer.
async fn guard(State(server): State<Arc<Server>>, request: Request, next: Next) -> Response {
    if !auth::host_ok(&server, request.headers()) {
        return ApiError::new(
            StatusCode::MISDIRECTED_REQUEST,
            "host",
            "this server does not answer to that name",
        )
        .into_response();
    }
    let ws_origin = auth::expected_origin(&server, request.headers())
        .map(|o| o.replacen("http", "ws", 1))
        .unwrap_or_default();
    let is_file = request.uri().path().starts_with("/f/");
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
        "camera=(), microphone=(), geolocation=(), payment=()",
    );
    if !is_file {
        set(h, "content-security-policy", &page_policy(&ws_origin));
    }
    // The page is never cached: a new version of the server is a new
    // window. The rest carries `?v=<version>` (build-index.mjs).
    let html = h
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("text/html"));
    if html && !is_file {
        h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    }
    if server.config.tls.is_some()
        || server
            .config
            .public_url
            .as_deref()
            .is_some_and(|u| u.starts_with("https://"))
    {
        set(h, "strict-transport-security", "max-age=31536000");
    }
    response
}

/// A path parameter, for the handlers that take one.
pub type Id = Path<String>;
