// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Files in a server folder above the largest file sync carries
//! ([`crate::sync::LARGEST`]): a walk never reads them — a file of gigabytes
//! read and hashed at every walk would take a small server's memory — so
//! they never enter the folder's log, and one the log knew from when it
//! was smaller stays there as it was, never a deletion every device would
//! carry out. They are said once each in the server's log, and listed on
//! the folder's page of the console, until they are smaller or gone.

use std::collections::{BTreeMap, HashMap};

use serde::Serialize;
use verso_service::lock;

use crate::state::Server;

/// A file sync leaves out for its size.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TooLarge {
    pub path: String,
    pub size: u64,
}

/// The files of folder `folder` too large for sync, by path.
#[derive(Default)]
pub struct Large(std::sync::Mutex<HashMap<String, BTreeMap<String, u64>>>);

impl Large {
    /// What a whole walk of folder `folder` found: the set replaces the one
    /// before, and a file not said before is said now — once per file, not
    /// at every walk.
    pub fn found(&self, server: &Server, folder: &str, files: Vec<(String, u64)>) {
        let new: Vec<(String, u64)> = {
            let mut all = lock(&self.0);
            let before = all.remove(folder).unwrap_or_default();
            let new = files
                .iter()
                .filter(|(p, _)| !before.contains_key(p))
                .cloned()
                .collect();
            if !files.is_empty() {
                all.insert(folder.to_owned(), files.into_iter().collect());
            }
            new
        };
        say(server, folder, &new);
    }

    /// One path a change named, found too large: added, and said when new.
    pub fn add(&self, server: &Server, folder: &str, path: &str, size: u64) {
        let new = lock(&self.0)
            .entry(folder.to_owned())
            .or_default()
            .insert(path.to_owned(), size)
            .is_none();
        if new {
            say(server, folder, &[(path.to_owned(), size)]);
        }
    }

    /// One path a change named, read whole: no longer too large.
    pub fn remove(&self, folder: &str, path: &str) {
        let mut all = lock(&self.0);
        if let Some(files) = all.get_mut(folder) {
            files.remove(path);
            if files.is_empty() {
                all.remove(folder);
            }
        }
    }

    /// The files of folder `folder` too large for sync, as last found.
    #[must_use]
    pub fn of_folder(&self, folder: &str) -> Vec<TooLarge> {
        lock(&self.0)
            .get(folder)
            .map(|files| {
                files
                    .iter()
                    .map(|(path, size)| TooLarge {
                        path: path.clone(),
                        size: *size,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }
}

fn say(server: &Server, folder: &str, files: &[(String, u64)]) {
    if files.is_empty() {
        return;
    }
    let name = server
        .db
        .folder(folder)
        .ok()
        .flatten()
        .map_or_else(|| folder.to_owned(), |f| f.dir);
    for (path, size) in files {
        crate::log::warn(&format!(
            "sync: {name}: \"{path}\" is {size} bytes, more than the 1 GiB sync carries: it is not read and does not sync"
        ));
    }
}
