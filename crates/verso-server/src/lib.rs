// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `verso serve` (ADR 0073, 0074, 0075): the core without a window. It
//! serves the contract over a WebSocket, the window itself to a browser,
//! the folders' files under `/f/`, and the pages of accounts and access.
//! The folders are reached only through `verso-service`, the same code the
//! desktop host calls (ADR 0026 rules 1 and 5).

pub mod access;
pub mod access_cmds;
pub mod admin;
pub mod api;
pub mod audio_relay;
pub mod audit;
pub mod auth;
pub mod board_sight;
pub mod campaign;
pub mod campaign_cmds;
pub mod campaign_move;
pub mod campaign_outside;
pub mod campaign_serve;
pub mod campaign_sync;
pub mod campaign_text;
pub mod collab;
pub mod collab_board;
pub mod config;
pub mod console;
pub mod crypto;
pub mod data;
pub mod db;
pub mod device;
pub mod dice;
pub mod discovery;
pub mod fair;
pub mod files;
pub mod folders;
pub mod framing;
/// The server's inputs, opened to its fuzz harness only (ADR 0083 item 14).
#[cfg(feature = "fuzzing")]
#[doc(hidden)]
pub mod fuzz_api;
pub mod hashes;
pub mod history;
pub mod http;
pub mod inflight;
pub mod invite_join;
pub mod large;
pub mod limit;
pub mod listen;
pub mod local;
pub mod log;
pub mod mail;
pub mod pace;
pub mod passkeys;
pub mod passwords;
pub mod presence;
pub mod proof;
pub mod proxy;
pub mod quota;
pub mod readers;
pub mod readlinks;
pub mod rpc;
mod rpc_collab;
mod rpc_open;
pub mod scope;
pub mod security_txt;
pub mod share_board;
pub mod share_links;
pub mod share_sync;
pub mod shares;
pub mod signin;
pub mod state;
mod static_cache;
pub mod storage;
pub mod sync;
pub mod table;
pub mod table_image;
pub mod table_look;
pub mod table_share;
pub mod table_sound;
pub mod texts;
pub mod tls;
pub mod transfers;
pub mod trash;
pub mod twins;
pub mod ui_files;
pub mod update;
pub mod visit;
pub mod writers;
pub mod wrong_host;
mod yjs_bounds;

use std::sync::Arc;

use config::Config;
use db::{Db, NewLink};

/// The generated bindings the window was built with: their hash names the
/// build of the contract (the maintainer's answer D of 2026-10-09). A page
/// this server served reloads when it differs; a desktop app compares
/// [`verso_contract::compat::VERSION`] instead, and logs the hash (ADR
/// 0073 item 2, revised 2026-11-02).
const BINDINGS: &str = include_str!("../../../app/ui/src/bindings.ts");

/// The contract's hash: the first 16 hex digits of the SHA-256 of the
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
    // A data directory the server cannot write is a server that cannot
    // start: said in words, before SQLite says "unable to open" (ADR 0075
    // item 3, amended 2026-10-16).
    if let Err(e) = data::ensure_dir(&config.data_dir.join("indexes"))
        .and_then(|()| verso_fs::server::can_write(&config.data_dir))
    {
        return Err(if storage::is_refusal(&e) {
            storage::sentence(
                &config.data_dir.display().to_string(),
                &storage::owner_of(&config.data_dir),
            )
        } else {
            format!("VERSO_DATA_DIR ({}): {e}", config.data_dir.display())
        });
    }
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

/// A link the server hands to a window, which opens it where it reaches
/// the server. With the configured public address, the whole link; without
/// one, only the path — the server cannot know the name a window reaches it
/// by (the listening address may be the wildcard, and `Host` is not trusted,
/// ADR 0045), so the window puts its own server's address before it. A link
/// that leaves by mail has no window and uses [`base_url`]. "This app is a
/// server" builds it from where a player reaches it now — the internet
/// link's origin while it has one (ADR 0117 D3 item 4), else the network's
/// address — the same base as the invitations of its Settings
/// (`local::Policy::links_base`), so the two never name two places.
pub(crate) fn window_link(server: &state::Server, path: &str) -> String {
    let link = server.local.as_ref().and_then(|l| l.links_base());
    match server.config.public_url.as_deref().or(link.as_deref()) {
        Some(base) => format!("{}{path}", base.trim_end_matches('/')),
        None => path.to_owned(),
    }
}

/// Said once at start: with no `VERSO_PUBLIC_URL` and the wildcard bind, the
/// links that leave by mail (password reset) name `localhost`, which opens
/// nothing for their reader.
fn warn_public_url(config: &Config) {
    if config.public_url.is_none() && config.listen.ip().is_unspecified() {
        log::warn(
            "VERSO_PUBLIC_URL is not set and the server listens on every address: links sent by mail (password reset) name localhost and open nothing; set VERSO_PUBLIC_URL to the address people reach the server by (ADR 0073 item 6)",
        );
    }
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
                "VERSO_ADMIN_EMAIL and VERSO_ADMIN_PASSWORD are ignored: the server has accounts (a lost password: `universo admin reset <e-mail>`, or `verso serve admin reset`)",
            );
        }
        (None, 0) => {
            db.end_setup_links()?;
            let (token, _) = db.create_invitation(&NewLink {
                kind: "setup",
                life: db::SETUP_LIFE,
                ..NewLink::default()
            })?;
            // With no public address the link is the one the person types:
            // from this machine, and, listening on every address, from
            // another one by the machine's own (ADR 0073 item 6, amended
            // 2026-10-16).
            let from_elsewhere = config.public_url.is_none() && config.listen.ip().is_unspecified();
            log::info(&format!(
                "no account yet: make the first admin at {}/setup?token={token}{} (valid for one hour, once; or set VERSO_ADMIN_EMAIL and VERSO_ADMIN_PASSWORD)",
                base_url(config),
                if from_elsewhere {
                    format!(
                        " — in Docker or from another machine, replace localhost with the machine's address (a container cannot know the host IP): http://<this machine's address>:{}/setup?token={token}",
                        config.listen.port()
                    )
                } else {
                    String::new()
                }
            ));
        }
        (None, _) => {}
    }
    Ok(())
}

/// The process's one TLS crypto provider, `ring`. Two providers are built in
/// (`ring` here, `aws-lc-rs` through reqwest's and tungstenite's TLS), so
/// rustls cannot pick one by itself and panics on the first TLS client it
/// makes without this: the desktop app's sync over `wss://` did, and sat on
/// "Conectando ao servidor…" (the maintainer's UniVerso, 2026-10-16). Every
/// entry point calls it before any TLS; a second call keeps the first.
pub fn install_crypto_provider() {
    let _ = tokio_rustls::rustls::crypto::ring::default_provider().install_default();
}

/// Serve until the process is asked to stop.
pub fn serve(config: Config, commit: &str) -> Result<(), String> {
    // One crypto provider for the server's TLS and the update check's.
    install_crypto_provider();
    let acceptor = match &config.tls {
        Some((cert, key)) => Some(tls::acceptor(cert, key)?),
        None => None,
    };
    let db = prepare(&config)?;
    data::ensure_dir(&config.folders_dir)
        .map_err(|e| format!("VERSO_FOLDERS_DIR ({}): {e}", config.folders_dir.display()))?;
    if let Some(fs) = verso_fs::server::network_file_system(&config.folders_dir) {
        log::info(&format!(
            "VERSO_FOLDERS_DIR is on a network file system ({fs}): changes made elsewhere are found by a scan"
        ));
    }
    // A directory the server cannot write is said now, in words (ADR 0075
    // item 3, amended 2026-10-16), and again in the admin console.
    let unwritable = storage::check(&config.data_dir, &config.folders_dir);
    first_admin(&config, &db)?;
    let listen = config.listen;
    let mail = match &config.smtp_url {
        Some(url) => {
            let host = config
                .public_url
                .as_deref()
                .and_then(|u| u.split("://").nth(1))
                .map(|h| h.split([':', '/']).next().unwrap_or(h).to_owned())
                .unwrap_or_else(|| "localhost".to_owned());
            let from = config
                .mail_from
                .clone()
                .unwrap_or_else(|| format!("Verso <verso@{host}>"));
            Some(mail::from_config(url, &from)?)
        }
        None => None,
    };
    let server = state::Server::new(config, db, contract_version(), commit.to_owned());
    if let Some(mail) = mail {
        let _ = server.mail.set(mail);
    }
    let _ = server.unwritable.set(unwritable);
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    runtime.block_on(async move {
        let listener = tokio::net::TcpListener::bind(listen)
            .await
            .map_err(|e| format!("listening on {listen}: {e}"))?;
        // Found on the home network by itself (ADR 0097); held until the
        // server stops.
        let announced = discovery::announce(&server.config, acceptor.is_some());
        let served = async {
            match acceptor {
                Some(acceptor) => {
                    let slots = Arc::clone(&server.slots);
                    let tls = tls::TlsListener::new(listener, acceptor, slots)
                        .map_err(|e| e.to_string())?;
                    run_on(server, tls, stopped()).await
                }
                None => run(server, listener, stopped()).await,
            }
        }
        .await;
        // The goodbye waits for the network for up to a second: not on a
        // worker of the runtime.
        let _ = tokio::task::spawn_blocking(move || drop(announced)).await;
        served
    })
}

/// Serve on `listener` until `stop` resolves.
pub async fn run(
    server: Arc<state::Server>,
    listener: tokio::net::TcpListener,
    stop: impl std::future::Future<Output = ()> + Send + 'static,
) -> Result<(), String> {
    let slots = Arc::clone(&server.slots);
    run_on(server, listen::Plain::new(listener, slots), stop).await
}

/// Serve on any listener — plain TCP, or TLS ([`tls::TlsListener`]) —
/// each connection counted and its requests' headers given a deadline
/// ([`listen`]).
pub async fn run_on<L: listen::Incoming>(
    server: Arc<state::Server>,
    listener: L,
    stop: impl std::future::Future<Output = ()> + Send + 'static,
) -> Result<(), String> {
    let listen = listener.local_addr().map_err(|e| e.to_string())?;
    let _ = server.runtime.set(tokio::runtime::Handle::current());
    if server.config.update_check {
        tokio::spawn(update::watch(
            Arc::clone(&server),
            server.config.update_token.clone(),
        ));
    }
    // Every folder's bin swept now and once a day (ADR 0080 item 3).
    tokio::spawn(trash::daily(Arc::clone(&server)));
    // Every folder's version history thinned at start and once a day
    // (ADR 0091 item 3).
    tokio::spawn(history::daily(Arc::clone(&server)));
    // The audit log's rows past VERSO_AUDIT_DAYS, now and once a day (ADR
    // 0083 item 10).
    tokio::spawn(audit::daily(Arc::clone(&server)));
    log::info(&format!(
        "UniVerso {} (verso serve; contract {}) on {listen}, folders in {}",
        env!("CARGO_PKG_VERSION"),
        server.contract,
        server.config.folders_dir.display()
    ));
    warn_public_url(&server.config);
    if server.config.tls.is_none() {
        log::info(
            "plain HTTP works; offline, notifications and the like need HTTPS (VERSO_TLS_CERT_FILE, or a proxy in front with VERSO_PUBLIC_URL)",
        );
    }
    let app = http::router(server);
    listen::serve(listener, app, stop).await;
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
/// account's sessions, revokes its personal access tokens (ADR 0083 item
/// 4) and prints a reset link to use once; the reset and each token go
/// into the audit log. Access to the machine is the last factor.
pub fn admin_reset(config: &Config, email: &str) -> Result<String, String> {
    let db = prepare(config)?;
    let account = db
        .account_by_email(email)?
        .ok_or_else(|| format!("no account has the e-mail {email}"))?;
    // The console's and the app's act (`admin::acts::reset_link`), from the
    // machine: no running server to tell (the sessions it ends are refused
    // at their next request), no one signed in to keep.
    let by = admin::acts::By {
        actor: None,
        address: Some("machine"),
    };
    let (token, _) = admin::acts::reset_link(
        &db,
        None,
        &by,
        None,
        &account.id,
        None,
        admin::acts::RESET_ON_MACHINE,
    )
    .map_err(|e| e.to_string())?;
    Ok(format!("{}/reset/{token}", base_url(config)))
}

#[cfg(test)]
mod pause;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_access_cmds;
#[cfg(test)]
mod tests_access_doors;
#[cfg(test)]
mod tests_access_gaps;
#[cfg(test)]
mod tests_access_outside;
#[cfg(test)]
mod tests_access_review;
#[cfg(test)]
mod tests_access_sync;
#[cfg(test)]
mod tests_attach;
#[cfg(test)]
mod tests_attach_beside;
#[cfg(test)]
mod tests_audience;
#[cfg(test)]
mod tests_audience_review;
#[cfg(test)]
mod tests_audience_second;
#[cfg(test)]
mod tests_board_players;
#[cfg(test)]
mod tests_board_rooms;
#[cfg(test)]
mod tests_board_shares;
#[cfg(test)]
mod tests_board_solo;
#[cfg(test)]
mod tests_board_stress;
#[cfg(test)]
mod tests_bounds;
#[cfg(test)]
mod tests_campaign;
#[cfg(test)]
mod tests_campaign_grants;
#[cfg(test)]
mod tests_console;
#[cfg(test)]
mod tests_dice;
#[cfg(test)]
mod tests_folder_data;
#[cfg(test)]
mod tests_gm_invites;
#[cfg(test)]
mod tests_hashes;
#[cfg(test)]
mod tests_history;
#[cfg(test)]
mod tests_http;
#[cfg(test)]
mod tests_invite_join;
#[cfg(test)]
mod tests_join_big;
#[cfg(test)]
mod tests_join_speed;
#[cfg(test)]
mod tests_map_tiles;
#[cfg(test)]
mod tests_mentions;
#[cfg(test)]
mod tests_night_access;
#[cfg(test)]
mod tests_night_ops;
#[cfg(test)]
mod tests_night_sync;
#[cfg(test)]
mod tests_offline;
#[cfg(test)]
mod tests_owner_deletes;
#[cfg(test)]
mod tests_pieces;
#[cfg(test)]
mod tests_prove;
#[cfg(test)]
mod tests_readlinks;
#[cfg(test)]
mod tests_resources;
#[cfg(test)]
mod tests_room_inputs;
#[cfg(test)]
mod tests_rooms;
#[cfg(test)]
mod tests_secret;
#[cfg(test)]
mod tests_secret_pins;
#[cfg(test)]
mod tests_secret_review;
#[cfg(test)]
mod tests_share_gaps;
#[cfg(test)]
mod tests_share_given;
#[cfg(test)]
mod tests_shares;
#[cfg(test)]
mod tests_signin;
#[cfg(test)]
mod tests_sync;
#[cfg(test)]
mod tests_table;
#[cfg(test)]
mod tests_table_images;
#[cfg(test)]
mod tests_table_move;
#[cfg(test)]
mod tests_table_share;
#[cfg(test)]
mod tests_table_sound;
#[cfg(test)]
mod tests_threats;
#[cfg(test)]
mod tests_trash;
#[cfg(test)]
mod tests_writers;
