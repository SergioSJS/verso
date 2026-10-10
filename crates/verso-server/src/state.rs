// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the server holds while it runs: its configuration, its database,
//! the open folders (the same `verso-service` the desktop host holds), the
//! connected windows and where each one's events go.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use verso_contract::{FolderChanged, IndexProgress};
use verso_service::{Service, lock};

use crate::config::Config;
use crate::db::{Db, Role};
use crate::limit::Limiter;

/// A message pushed to one connected window: an event, or what the server
/// says about the connection itself.
pub type Push = serde_json::Value;

/// A connected window: whose it is, which folder it shows and in which
/// role, and where its pushes go.
pub struct Client {
    pub account: String,
    pub folder: Option<(String, Role)>,
    pub tx: mpsc::UnboundedSender<Push>,
}

pub struct Server {
    pub config: Config,
    pub db: Db,
    pub service: Arc<Service>,
    pub clients: Mutex<HashMap<String, Client>>,
    pub limiter: Limiter,
    /// The contract's version: a hash of the generated bindings (the
    /// maintainer's answer D of 2026-10-09), sent in the handshake.
    pub contract: String,
    next: AtomicU64,
    /// Device sign-ins waiting for the person's approval in the browser
    /// (ADR 0074 item 8): user code → the request.
    pub devices: Mutex<HashMap<String, crate::device::Pending>>,
    /// A newer version, when the check found one (answer E).
    pub newer: Mutex<Option<String>>,
    /// The commit the server was built from (ADR 0051).
    pub commit: String,
    /// The notes being edited by several windows at once (ADR 0073 item 7).
    /// The folder's id behind each folder key the server opened: the
    /// quotas are the folder's, the writes know its key (ADR 0077).
    pub keys: Mutex<HashMap<String, String>>,
    /// Files on their way in pieces, for sync (ADR 0079 item 12).
    pub transfers: crate::sync::Transfers,
    pub rooms: crate::collab::Rooms,
    /// The host's mail server, when it has one (ADR 0074 item 2).
    pub mail: std::sync::OnceLock<crate::mail::Mail>,
    /// Sign-in links sent by e-mail and not used: their hash → the account
    /// and when it was made (fifteen minutes, ADR 0074 item 3).
    pub signin_links: Mutex<HashMap<Vec<u8>, (String, std::time::Instant)>>,
    /// The passkey ceremonies under way (ADR 0074 item 3).
    pub ceremonies: crate::passkeys::Ceremonies,
    /// The runtime, for what the watcher's thread hands over.
    pub runtime: std::sync::OnceLock<tokio::runtime::Handle>,
}

impl Server {
    pub fn new(config: Config, db: Db, contract: String, commit: String) -> Arc<Self> {
        let service = Service::new(Some(config.data_dir.join("indexes")));
        let server = Arc::new(Self {
            config,
            db,
            service: Arc::clone(&service),
            clients: Mutex::new(HashMap::new()),
            limiter: Limiter::default(),
            contract,
            next: AtomicU64::new(1),
            devices: Mutex::new(HashMap::new()),
            newer: Mutex::new(None),
            commit,
            keys: Mutex::new(HashMap::new()),
            transfers: crate::sync::Transfers::default(),
            rooms: crate::collab::Rooms::default(),
            ceremonies: crate::passkeys::Ceremonies::default(),
            mail: std::sync::OnceLock::new(),
            signin_links: Mutex::new(HashMap::new()),
            runtime: std::sync::OnceLock::new(),
        });
        service.set_events(Arc::new(ServerEvents {
            server: Arc::downgrade(&server),
        }));
        server
    }

    /// A name for a new connection, never reused while the server runs.
    pub fn client_id(&self) -> String {
        format!("ws-{}", self.next.fetch_add(1, Ordering::Relaxed))
    }

    /// The directory of a registered folder; the path is formed here and
    /// never crosses (ADR 0026 rule 4).
    pub fn folder_path(&self, dir: &str) -> Option<PathBuf> {
        verso_fs::server::folder_path(&self.config.folders_dir, dir)
    }

    /// Push `message` to each of `clients` still connected.
    pub fn push(&self, clients: &[String], message: &Push) {
        let table = lock(&self.clients);
        for id in clients {
            if let Some(c) = table.get(id) {
                let _ = c.tx.send(message.clone());
            }
        }
    }

    /// Push to every window that shows folder `folder` (by its id).
    pub fn push_folder(&self, folder: &str, message: &Push) {
        let table = lock(&self.clients);
        for c in table.values() {
            if c.folder.as_ref().is_some_and(|(f, _)| f == folder) {
                let _ = c.tx.send(message.clone());
            }
        }
    }

    /// Every window of `account`: told to go when its sessions end.
    pub fn push_account(&self, account: &str, message: &Push) {
        let table = lock(&self.clients);
        for c in table.values().filter(|c| c.account == account) {
            let _ = c.tx.send(message.clone());
        }
    }

    /// A member's role in a folder changed or ended: the windows of theirs
    /// that show it learn it, and one that may no longer see it is told to
    /// leave.
    pub fn role_changed(&self, folder: &str, account: &str, role: Option<Role>) {
        let mut table = lock(&self.clients);
        for c in table.values_mut() {
            if c.account == account && c.folder.as_ref().is_some_and(|(f, _)| f == folder) {
                match role {
                    Some(r) => {
                        c.folder = Some((folder.to_owned(), r));
                        let _ = c.tx.send(serde_json::json!({ "role": r }));
                    }
                    None => {
                        c.folder = None;
                        let _ = c.tx.send(serde_json::json!({ "gone": "folder" }));
                    }
                }
            }
        }
    }
}

/// The service's events, to the windows that show the folder.
struct ServerEvents {
    server: std::sync::Weak<Server>,
}

impl verso_service::Events for ServerEvents {
    fn progress(&self, clients: &[String], progress: &IndexProgress) {
        if let Some(s) = self.server.upgrade() {
            s.push(
                clients,
                &serde_json::json!({ "event": "index-progress", "payload": progress }),
            );
        }
    }

    fn folder_changed(&self, clients: &[String], changed: &FolderChanged) {
        if let Some(s) = self.server.upgrade() {
            // A shared note changed outside: its room hears it first, off
            // the watcher's thread.
            if let Some(rt) = s.runtime.get() {
                let server = Arc::clone(&s);
                let c = changed.clone();
                rt.spawn_blocking(move || {
                    crate::collab::changed_outside(&server, &c.key, &c.changed, &c.removed);
                    // And the folder's log for sync (ADR 0079 item 4).
                    let paths: Vec<String> = c.changed.iter().chain(&c.removed).cloned().collect();
                    crate::sync::reconcile_key(&server, &c.key, None, &paths);
                });
            }
            s.push(
                clients,
                &serde_json::json!({ "event": "folder-changed", "payload": changed }),
            );
        }
    }

    fn log(&self, level: &str, message: &str) {
        crate::log::line(level, message);
    }
}
