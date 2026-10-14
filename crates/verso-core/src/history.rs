// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A file's history (ADR 0091): which files have one (item 2), and the
//! computer's own history of a folder (item 8) — the store of
//! `verso_index::history` under the configuration directory, fed by what
//! the writes through `verso-fs` changed (its journal) and by what the
//! watcher found changed outside. The server keeps its folders' histories
//! itself, from its change log (`verso-server`'s `history.rs`), and never
//! turns this on.
//!
//! Nothing here writes into the folder: the folder is read through
//! `verso-fs`, the history written to its own file outside the tree
//! (ADR 0011; CLAUDE.md invariant 5).

use std::path::Path;
use std::time::UNIX_EPOCH;

pub use verso_index::history::{
    Author, DAY, DEFAULT_DAYS, Kind, Listing, Recorded, Store, Thinned, Version, line_change,
    sha256, thinning,
};

use super::{CoreError, Workspace};

/// The name a computer's store gives its one folder.
pub const LOCAL: &str = "local";

/// The largest file kept: a text file the window edits is far smaller;
/// one past this (a log, an export) is left out rather than copied on
/// every write. Not decided by ADR 0091; the room's own bound on a text
/// is of the same order.
pub const LARGEST: u64 = 16 * 1024 * 1024;

/// The extensions of the text files the window edits (item 2): notes,
/// boards, bases, `.txt`, `.json`, `.csv`. Pictures, PDFs and other
/// attachments are not kept: a replaced attachment goes to the trash.
const TEXT: &[&str] = &["md", "canvas", "base", "txt", "json", "csv"];

/// Whether the file at `path` has a history (item 2): a text file the
/// window edits, outside every hidden folder (`.trash`, the folder's
/// settings).
#[must_use]
pub fn kept(path: &str) -> bool {
    if path.split('/').any(|part| part.starts_with('.')) {
        return false;
    }
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit_once('.').is_some_and(|(stem, ext)| {
        !stem.is_empty() && TEXT.iter().any(|t| ext.eq_ignore_ascii_case(t))
    })
}

/// Now, in milliseconds since the epoch.
#[must_use]
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

fn ms_of(t: std::time::SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

/// The computer's history of the open folder.
pub(crate) struct Local {
    pub(crate) store: Store,
    /// Who this computer's writes name: its name.
    pub(crate) author: Author,
}

impl std::fmt::Debug for Local {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Local").finish_non_exhaustive()
    }
}

impl Workspace {
    /// Keep the computer's history of this folder in the store at `file`
    /// (under the configuration directory), this computer's writes named
    /// `name` (item 8). From now on every write through the core is a
    /// version.
    pub fn keep_history(&mut self, file: &Path, name: &str) -> Result<(), CoreError> {
        let store = Store::open(file).map_err(CoreError::Index)?;
        self.root.keep_journal(true);
        self.history = Some(Local {
            store,
            author: Author::new("computer", name),
        });
        Ok(())
    }

    /// Whether this folder keeps a history here.
    #[must_use]
    pub fn keeps_history(&self) -> bool {
        self.history.is_some()
    }

    /// This computer's name, as its versions say it.
    pub fn set_history_name(&mut self, name: &str) {
        if let Some(h) = &mut self.history {
            h.author = Author::new("computer", name);
        }
    }

    /// The computer's store of this folder's history, when kept.
    pub fn history_store(&mut self) -> Option<&mut Store> {
        self.history.as_mut().map(|h| &mut h.store)
    }

    /// Record what the writes since the last call changed: each file
    /// written a version of this computer (coalesced as the editor saves),
    /// each move followed, each deletion kept reachable (item 9). What
    /// fails is said, one line each, and never fails the write.
    pub fn history_flush(&mut self) -> Vec<String> {
        if self.history.is_none() {
            return Vec::new();
        }
        let touched = self.root.take_journal();
        let mut problems = Vec::new();
        let at = now_ms();
        for t in touched {
            let done = match t {
                verso_fs::Touched::Written(path) => {
                    let author = self.history.as_ref().map(|h| h.author.clone());
                    self.history_record(&path, at, author.as_slice(), Kind::Edit)
                }
                verso_fs::Touched::Moved(from, to) => match self.history_store() {
                    Some(s) => s.moved(LOCAL, &from, &to, at).map_err(|e| e.to_string()),
                    None => Ok(()),
                },
                verso_fs::Touched::Gone(path) => match self.history_store() {
                    Some(s) => s.gone(LOCAL, &path, at).map_err(|e| e.to_string()),
                    None => Ok(()),
                },
            };
            if let Err(e) = done {
                problems.push(format!("the history: {e}"));
            }
        }
        problems
    }

    /// Record the files the watcher found changed or gone, made outside
    /// Verso (item 4).
    pub fn history_outside(&mut self, changed: &[String], gone: &[String]) -> Vec<String> {
        if self.history.is_none() {
            return Vec::new();
        }
        let at = now_ms();
        let mut problems = Vec::new();
        for path in changed {
            if let Err(e) =
                self.history_record(path, at, &[Author::new("outside", "")], Kind::Outside)
            {
                problems.push(format!("the history of {path}: {e}"));
            }
        }
        for path in gone {
            if let Some(s) = self.history_store()
                && let Err(e) = s.gone(LOCAL, path, at)
            {
                problems.push(format!("the history of {path}: {e}"));
            }
        }
        problems
    }

    /// A file read with no history yet: its bytes as they were found, so
    /// that the first write leaves something to go back to.
    pub(crate) fn history_seen(
        &mut self,
        path: &str,
        bytes: &[u8],
        modified: std::time::SystemTime,
    ) {
        if !kept(path) || u64::try_from(bytes.len()).unwrap_or(u64::MAX) > LARGEST {
            return;
        }
        let Some(s) = self.history_store() else {
            return;
        };
        if s.has(LOCAL, path).unwrap_or(true) {
            return;
        }
        let _ = s.record(LOCAL, path, bytes, ms_of(modified), &[], Kind::Found);
    }

    /// Write `bytes`, a version brought back (item 5), at `path`: over
    /// the file `revision` describes — refused with nothing written when
    /// the file changed since (invariant 11) — or as a new file when
    /// `revision` is `None` (a deleted file's version). A new write,
    /// atomic as every write; in the computer's history it is itself a
    /// version, of this computer. Returns the revision written.
    pub fn restore_bytes(
        &mut self,
        path: &str,
        bytes: &[u8],
        revision: Option<&str>,
    ) -> Result<String, CoreError> {
        let written = self.write_bytes(path, bytes, revision)?;
        // The journal's entry for this write is the same bytes, and adds
        // nothing once this is recorded.
        let author = self.history.as_ref().map(|h| h.author.clone());
        let key = self.entry_key(path)?;
        if let Some(s) = self.history_store() {
            let _ = s.record(
                LOCAL,
                &key,
                bytes,
                now_ms(),
                author.as_slice(),
                Kind::Restore,
            );
        }
        Ok(written)
    }

    /// Record the bytes of `path` now, when it is a file with a history.
    fn history_record(
        &mut self,
        path: &str,
        at: i64,
        authors: &[Author],
        kind: Kind,
    ) -> Result<(), String> {
        if !kept(path) || self.is_folder(path) {
            return Ok(());
        }
        if self.file_len(path).is_some_and(|n| n > LARGEST) {
            return Ok(());
        }
        let bytes = match self.read_file(path) {
            Ok(b) => b,
            // Gone again, or a placeholder: nothing to keep.
            Err(_) => return Ok(()),
        };
        match self.history_store() {
            Some(s) => s
                .record(LOCAL, path, &bytes, at, authors, kind)
                .map(|_| ())
                .map_err(|e| e.to_string()),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
#[path = "history_tests.rs"]
mod tests;
