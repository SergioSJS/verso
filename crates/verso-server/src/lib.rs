// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `verso serve` (ADR 0073, 0074, 0075): the core without a window. It
//! serves the contract over a WebSocket, the window itself to a browser,
//! the folders' files under `/f/`, and the pages of accounts and access.
//! The folders are reached only through `verso-service`, the same code the
//! desktop host calls (ADR 0026 rules 1 and 5).

pub mod access;
pub mod admin;
pub mod api;
pub mod auth;
pub mod config;
pub mod crypto;
pub mod data;
pub mod db;
pub mod device;
pub mod files;
pub mod folders;
pub mod http;
pub mod limit;
pub mod log;
pub mod rpc;
pub mod state;

use std::net::SocketAddr;
use std::sync::Arc;

use config::Config;
use db::{Db, NewLink};

/// The generated bindings the window was built with: their hash is the
/// contract's version, which client and server agree on before anything
/// else (the maintainer's answer D of 2026-10-09).
const BINDINGS: &str = include_str!("../../../app/ui/src/bindings.ts");

/// The contract's version: the first 16 hex digits of the SHA-256 of the
/// generated bindings. The window's build computes the same
/// (`app/ui/build-web.mjs`).
#[must_use]
pub fn contract_version() -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(BINDINGS.as_bytes())
        .iter()
        .take(8)
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// The data directory ready and its database open.
fn prepare(config: &Config) -> Result<Db, String> {
    data::ensure_dir(&config.data_dir.join("indexes"))
        .map_err(|e| format!("VERSO_DATA_DIR ({}): {e}", config.data_dir.display()))?;
    if let Some(fs) = verso_fs::server::network_file_system(&config.data_dir) {
        log::warn(&format!(
            "VERSO_DATA_DIR is on a network file system ({fs}): SQLite's locks are not reliable there and the databases may be corrupted; give it a local disk (ADR 0075 item 3)"
        ));
    }
    Db::open(&config.data_dir)
}

/// The address the server's links are opened at.
fn base_url(config: &Config) -> String {
    config.public_url.clone().unwrap_or_else(|| {
        let scheme = if config.tls.is_some() {
            "https"
        } else {
            "http"
        };
        let host = if config.listen.ip().is_loopback() || config.listen.ip().is_unspecified() {
            format!("localhost:{}", config.listen.port())
        } else {
            config.listen.to_string()
        };
        format!("{scheme}://{host}")
    })
}

/// The first admin (ADR 0074 item 1): from the environment when the server
/// has no account yet — the variables ignored, said once in the log, when
/// it has; without them, a setup link valid for an hour, printed once.
fn first_admin(config: &Config, db: &Db) -> Result<(), String> {
    let accounts = db.account_count()?;
    match (&config.admin, accounts) {
        (Some((email, password)), 0) => {
            if !db::is_email(email) {
                return Err(format!("VERSO_ADMIN_EMAIL: not an e-mail address: {email}"));
            }
            let name = email.split('@').next().unwrap_or(email);
            let account = db.create_account(email, name, "pt", Some(password), true)?;
            db.audit(&db::Audit {
                actor: None,
                action: "admin_from_environment",
                subject: Some(&account.id),
                folder: None,
                address: Some("environment"),
                ok: true,
            })?;
            log::info(
                "the first admin was made from VERSO_ADMIN_EMAIL; the variables are not read again",
            );
        }
        (Some(_), _) => {
            log::info(
                "VERSO_ADMIN_EMAIL and VERSO_ADMIN_PASSWORD are ignored: the server has accounts (a lost password: `verso serve admin reset <e-mail>`)",
            );
        }
        (None, 0) => {
            db.end_setup_links()?;
            let (token, _) = db.create_invitation(&NewLink {
                kind: "setup",
                life: db::SETUP_LIFE,
                ..NewLink::default()
            })?;
            log::info(&format!(
                "no account yet: make the first admin at {}/setup?token={token} (valid for one hour, once; or set VERSO_ADMIN_EMAIL and VERSO_ADMIN_PASSWORD)",
                base_url(config)
            ));
        }
        (None, _) => {}
    }
    Ok(())
}

/// Serve until the process is asked to stop.
pub fn serve(config: Config, commit: &str) -> Result<(), String> {
    if !config.loopback_only() && config.public_url.is_none() {
        return Err(
            "VERSO_PUBLIC_URL is needed when the server listens beyond this machine (VERSO_LISTEN)"
                .to_owned(),
        );
    }
    if config.tls.is_some() {
        return Err("VERSO_TLS_CERT_FILE: not built yet in this version; serve behind a proxy or `tailscale serve`".to_owned());
    }
    let db = prepare(&config)?;
    data::ensure_dir(&config.folders_dir)
        .map_err(|e| format!("VERSO_FOLDERS_DIR ({}): {e}", config.folders_dir.display()))?;
    if let Some(fs) = verso_fs::server::network_file_system(&config.folders_dir) {
        log::info(&format!(
            "VERSO_FOLDERS_DIR is on a network file system ({fs}): changes made elsewhere are found by a scan"
        ));
    }
    first_admin(&config, &db)?;
    let listen = config.listen;
    let server = state::Server::new(config, db, contract_version(), commit.to_owned());
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    runtime.block_on(async move {
        let listener = tokio::net::TcpListener::bind(listen)
            .await
            .map_err(|e| format!("listening on {listen}: {e}"))?;
        run(server, listener, stopped()).await
    })
}

/// Serve on `listener` until `stop` resolves.
pub async fn run(
    server: Arc<state::Server>,
    listener: tokio::net::TcpListener,
    stop: impl std::future::Future<Output = ()> + Send + 'static,
) -> Result<(), String> {
    let listen = listener.local_addr().map_err(|e| e.to_string())?;
    log::info(&format!(
        "verso serve {} (contract {}) on {listen}, folders in {}",
        env!("CARGO_PKG_VERSION"),
        server.contract,
        server.config.folders_dir.display()
    ));
    let app = http::router(server);
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(stop)
    .await
    .map_err(|e| e.to_string())?;
    log::info("stopped");
    Ok(())
}

/// Ctrl-C, or the SIGTERM Docker and systemd send.
async fn stopped() {
    let interrupt = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = interrupt => {},
        () = terminate => {},
    }
}

/// `verso serve admin reset <e-mail>` (ADR 0074 item 5): run on the
/// machine or inside the container by whoever runs the server, it ends the
/// account's sessions and prints a reset link to use once, and the reset
/// goes into the audit log. Access to the machine is the last factor.
pub fn admin_reset(config: &Config, email: &str) -> Result<String, String> {
    let db = prepare(config)?;
    let account = db
        .account_by_email(email)?
        .ok_or_else(|| format!("no account has the e-mail {email}"))?;
    db.end_sessions(&account.id, None)?;
    db.end_links_of(&account.id, "reset")?;
    let (token, _) = db.create_invitation(&NewLink {
        kind: "reset",
        account: Some(&account.id),
        life: db::RESET_LIFE,
        ..NewLink::default()
    })?;
    db.audit(&db::Audit {
        actor: None,
        action: "reset_on_machine",
        subject: Some(&account.id),
        folder: None,
        address: Some("machine"),
        ok: true,
    })?;
    Ok(format!("{}/reset/{token}", base_url(config)))
}

#[cfg(test)]
mod tests;
