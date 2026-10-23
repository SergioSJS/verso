// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Sync to a player's device follows the table's releases (ADR 0110
//! items 4 and 18). What a reader is told of a file is kept beside the
//! file's own hash in the folder's log (`reader_hash`, `reader_size`,
//! ADR 0087): a hidden note is a size below zero, which the reader's
//! manifest leaves out and its log tells as a deletion; a note released
//! later is a new change the reader sees, and the device fetches it.
//!
//! The files did not change when a note is released, so no walk finds
//! it: [`refresh_readers`] asks again, for every file of the folder, what
//! a reader is told of it now, and records a change for each one whose
//! answer moved. The owner's devices see the same entry with the hash
//! they already have.

use std::collections::HashMap;

use crate::db::ReaderOf;
use crate::state::Server;

/// What a reader is told of every file of `folder` now, against what its
/// log holds: a change recorded for each that differs, and the devices
/// told. `attachments_only`: after an edit of a note, which can only have
/// opened or closed the attachments it links.
pub fn refresh_readers(server: &Server, folder: &str, key: &str, attachments_only: bool) {
    let stored = match server.db.manifest_readers(folder) {
        Ok(s) => s,
        Err(e) => {
            crate::log::warn(&format!("a table's files for sync: {e}"));
            return;
        }
    };
    let mut readers: ReaderOf = HashMap::new();
    let mut changes: Vec<crate::db::Recorded> = Vec::new();
    let mut silent: Vec<String> = Vec::new();
    let mut explicit: Vec<String> = Vec::new();
    for (path, (hash, size, rhash, rsize, quick)) in &stored {
        // After an edit, only the attachments can have moved (the notes
        // changed are recorded with their own hash).
        if attachments_only && crate::campaign::note_like(path) {
            continue;
        }
        let now = match crate::readers::reader_of(server, key, path) {
            Ok(r) => r,
            // The folder cannot be asked now: leave the file as it is.
            Err(_) => continue,
        };
        let told = (
            rhash.clone().unwrap_or_else(|| hash.clone()),
            rsize.unwrap_or(*size),
        );
        // A file of a table a reader is told of is explicit in the log
        // (its own hash when it is served as it is): "never told" and
        // "told whole" are then two different things.
        let in_table = crate::campaign::veil_for_key(server, key).is_some_and(|v| v.in_table(path));
        let now = match now {
            None if in_table => Some((hash.clone(), *size)),
            other => other,
        };
        let will = now.clone().unwrap_or_else(|| (hash.clone(), *size));
        if told == will {
            // Told whole before, now said so in the log: no change.
            if rsize.is_none() && in_table && will.1 >= 0 {
                readers.insert(path.clone(), will);
                explicit.push(path.clone());
            }
            continue;
        }
        // Hidden and never told to a reader of this table: silent, not a
        // deletion (its name is not in the reader's log).
        if rsize.is_none() && will.1 < 0 {
            silent.push(path.clone());
            continue;
        }
        if let Some(r) = now {
            readers.insert(path.clone(), r);
        }
        changes.push((
            path.clone(),
            Some((hash.clone(), *size, quick.clone())),
            None,
        ));
    }
    if !silent.is_empty()
        && let Err(e) = server.db.reader_silence(folder, &silent)
    {
        crate::log::warn(&format!("hiding a table's notes from sync: {e}"));
    }
    if changes.is_empty() && explicit.is_empty() {
        return;
    }
    match server
        .db
        .record(folder, (None, None), &changes, &[], (&readers, &explicit))
    {
        Ok((head, same)) => {
            let paths: Vec<&str> = changes.iter().map(|(p, _, _)| p.as_str()).collect();
            let seen: Vec<&str> = changes
                .iter()
                .zip(&same)
                .filter(|(_, same)| !**same)
                .map(|((p, _, _), _)| p.as_str())
                .collect();
            crate::readers::push_sync_changed(server, folder, (head, &paths), &seen);
        }
        Err(e) => crate::log::warn(&format!("recording a table's release for sync: {e}")),
    }
}
