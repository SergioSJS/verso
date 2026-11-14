// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What is served changes **while serving** (ADR 0117 R4, 2026-11-13):
//! serving a folder from its page, or stopping, must not stop the server
//! — that would end a quick link's address and every player's connection
//! at every table. ADR 0096 item 2 changed what is served only while
//! serving was off; serving became a property of each folder, set at its
//! page (0117 D2), and the decided one click (*Serve from this computer*,
//! the server turned on in the same step when off) asks for it.
//!
//! The registry follows the settings at once ([`LocalServer::refolder`]):
//! a folder ticked is served under the name it keeps (`names`), a folder
//! unticked rests (`parts::reconcile`) and every connection on it is told
//! the folder is gone and let go of its rooms, as a revoked share's is; a
//! folder whose chosen parts changed has its windows looked at again
//! (`shares::refresh`), and its phones on the whole folder are let go when
//! it is now served in part (the hide lock judges an opening, not an open
//! window).

use std::collections::HashSet;

use serde_json::json;
use verso_service::lock;

use super::{Event, LocalServer, SETTINGS, names, parts, read_settings};
use crate::state::Server;

/// Every connection on folder `id` that `which` picks is told the folder
/// is gone and leaves it.
fn cut(server: &Server, id: &str, which: impl Fn(&crate::state::Client) -> bool) {
    let mut gone = Vec::new();
    {
        let mut clients = lock(&server.clients);
        for (client, c) in clients.iter_mut() {
            if c.folder.as_ref().is_some_and(|(f, _)| f == id) && which(c) {
                c.folder = None;
                c.scope = None;
                c.tx.send(&json!({ "gone": "folder", "reason": "unserved" }));
                gone.push(client.clone());
            }
        }
    }
    server.left(&gone);
}

impl LocalServer {
    /// While serving, the folders served follow the settings now; with
    /// serving off, nothing (the next start reads them). `Err` says why
    /// in words, and then nothing served changed.
    pub(super) fn refolder(&self) -> Result<(), String> {
        let running = lock(&self.shared.inner);
        let Some(r) = running.as_ref() else {
            return Ok(());
        };
        let db = &r.server.db;
        let mut settings = read_settings(db);
        if names::assign(db, &mut settings)? {
            let text = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
            db.set_setting(SETTINGS, &text)?;
        }
        let folders = names::served(&settings);
        let served = parts::plan(&folders, &settings.parts)?;
        let owner = db.local_owner()?;
        let before: HashSet<String> = r
            .policy
            .folders
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .keys()
            .cloned()
            .collect();
        let id_of = |name: &str| db.folder_by_dir(name).ok().flatten().map(|f| f.id);
        let hidden_before: HashSet<String> = before
            .iter()
            .filter_map(|n| id_of(n))
            .filter(|id| r.policy.hides(id))
            .collect();
        // The ids before: a folder registered again under a new id
        // (`reconcile`'s branch for one held by another account) is cut by
        // the id its windows hold.
        let ids_before: Vec<(String, String)> = before
            .iter()
            .filter_map(|n| Some((n.clone(), id_of(n)?)))
            .collect();
        let reconciled = parts::reconcile(db, &owner.id, &served)?;
        let hidden_now = reconciled.hidden.clone();
        let dropped = reconciled.dropped.clone();
        parts::write_dropped(db, &dropped)?;
        // The hide lock first, then the folders: a folder newly served in
        // part is never reachable whole in between.
        r.policy.parts.set(reconciled);
        r.policy.set_folders(folders.clone());
        let server = std::sync::Arc::clone(&r.server);
        drop(running);
        let mut rested = 0;
        for (name, id) in &ids_before {
            let now = id_of_on(&server, name);
            if !folders.contains_key(name) {
                cut(&server, id, |_| true);
                rested += 1;
            } else if now.as_deref() != Some(id.as_str()) {
                cut(&server, id, |_| true);
            }
        }
        for name in folders.keys() {
            let Some(id) = id_of_on(&server, name) else {
                continue;
            };
            if hidden_now.contains(&id) && !hidden_before.contains(&id) {
                cut(&server, &id, |c| c.phone && c.scope.is_none());
            }
            crate::shares::refresh(&server, &id, "revoked");
        }
        crate::log::info(&format!(
            "the folders served changed while serving: {} served, {rested} resting now",
            folders.len()
        ));
        (self.shared.events)(Event::Changed);
        Ok(())
    }
}

fn id_of_on(server: &Server, name: &str) -> Option<String> {
    server.db.folder_by_dir(name).ok().flatten().map(|f| f.id)
}
