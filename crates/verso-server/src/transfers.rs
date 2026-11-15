// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Files on their way between a device and the server, in pieces (ADR
//! 0079 item 12, revised 2026-10-12): what the server keeps of each
//! transfer between two pieces — never the file. A file read keeps where
//! it is and what it was when its reading began; a file sent keeps the
//! temporary file its pieces are written to. `crate::sync` carries the
//! pieces.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use sha2::Sha256;
use verso_service::lock;

/// A transfer nobody continued for this long is dropped.
pub(crate) const IDLE: Duration = Duration::from_secs(120);
/// Transfers a client holds at once, each way: a device sends and fetches
/// one file at a time, so a third drops its oldest — what one session can
/// keep is bounded (two temporary files on the disk, a piece in memory).
const PER_CLIENT: usize = 2;

/// Make room for one more transfer of `client`: its oldest go.
pub(crate) fn room<T>(
    map: &mut HashMap<(String, String), T>,
    client: &str,
    at: impl Fn(&T) -> Instant,
) {
    loop {
        let mine: Vec<(&(String, String), Instant)> = map
            .iter()
            .filter(|((c, _), _)| c == client)
            .map(|(k, v)| (k, at(v)))
            .collect();
        if mine.len() < PER_CLIENT {
            return;
        }
        let Some(oldest) = mine
            .iter()
            .min_by_key(|(_, t)| *t)
            .map(|(k, _)| (*k).clone())
        else {
            return;
        };
        map.remove(&oldest);
    }
}

/// Files on their way, in pieces: those sent by a device and those read
/// by one, per client and path.
#[derive(Default)]
pub struct Transfers {
    /// A file a device sends, written to a temporary file of the folder
    /// as its pieces arrive, and when its last piece came.
    pub(crate) up: Mutex<HashMap<(String, String), Sending>>,
    pub(crate) down: Mutex<HashMap<(String, String), Reading>>,
    /// Per folder and path, what the file being read is — its length and
    /// time, and its SHA-256 — shared by the clients reading it: hashed
    /// once however many devices fetch it, each piece read from the disk
    /// when a device asks for it. Kept while a reading of it is.
    pub(crate) files: Mutex<HashMap<(String, String), Being>>,
    /// One reconciliation at a time per folder: two from the same state
    /// would log the same change twice.
    pub(crate) folders: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    /// Per folder, the files a window's move moved, new path → old, from
    /// the move until its own reconciliation (`crate::sync::moving`).
    pub(crate) moving: Mutex<HashMap<String, Vec<(String, String)>>>,
    /// When each folder was last walked for a device.
    pub(crate) walked: Mutex<HashMap<String, Instant>>,
    /// Per folder, the files of one name in two forms its last walk found,
    /// and when they were last said (`crate::twins`).
    pub(crate) twins: Mutex<HashMap<String, (Vec<crate::twins::Twin>, Instant)>>,
    /// Per folder, the files too large for sync (`crate::large`).
    pub(crate) large: crate::large::Large,
    /// A note a reader's device reads in pieces, by client and path: the
    /// hash of its projection at the first piece (`crate::readers::read`).
    pub(crate) reader_reads: Mutex<HashMap<(String, String), String>>,
    /// A board a device sends through a share, by client and path: its
    /// pieces kept until the last, to be laid over the file
    /// (`crate::share_sync_board`).
    pub(crate) share_boards: Mutex<HashMap<(String, String), crate::share_sync_board::Up>>,
    /// By share and path, the text of a board a device of the share last
    /// wrote: the layout the board is cut in for the share's devices
    /// (`crate::share_sync_board`), so that a device's own write is not
    /// heard back as another file. Kept in memory: lost, a device fetches
    /// the board once more.
    pub(crate) share_shapes: Mutex<HashMap<(String, String), (String, Instant)>>,
}

impl Transfers {
    /// The transfers of `client`, gone: its connection ended, or it opened
    /// another folder. A file it was sending takes its temporary file with
    /// it; nothing of what it was reading stays.
    pub fn forget(&self, client: &str) {
        lock(&self.up).retain(|(c, _), _| c != client);
        lock(&self.down).retain(|(c, _), _| c != client);
        lock(&self.reader_reads).retain(|(c, _), _| c != client);
        lock(&self.share_boards).retain(|(c, _), _| c != client);
        self.prune();
    }

    /// The files no reading holds any more, forgotten.
    pub(crate) fn prune(&self) {
        let down = lock(&self.down);
        lock(&self.files).retain(|(f, p), _| {
            down.values()
                .any(|r| r.folder.as_str() == f && r.path.as_str() == p)
        });
    }

    /// How many transfers are kept, each way.
    #[cfg(test)]
    pub(crate) fn kept(&self) -> (usize, usize) {
        (lock(&self.up).len(), lock(&self.down).len())
    }

    /// How many files being read are known, however many read them.
    #[cfg(test)]
    pub(crate) fn copies(&self) -> usize {
        lock(&self.files).len()
    }
}

/// A file being read, as it was when its reading began: its length and
/// time, and its SHA-256.
#[derive(Clone)]
pub(crate) struct Being {
    pub(crate) mark: verso_core::Mark,
    pub(crate) hash: String,
}

/// A file being read in pieces by one client, kept between them: where it
/// is and what it was when the reading began.
pub(crate) struct Reading {
    pub(crate) folder: String,
    pub(crate) path: String,
    pub(crate) file: Being,
    pub(crate) at: Instant,
}

/// A file a device sends, held by its own lock — a piece written to the
/// disk holds no other transfer — and when its last piece came.
pub(crate) type Sending = (Arc<Mutex<Upload>>, Instant);

/// A file a device sends, as its pieces arrive.
pub(crate) struct Upload {
    /// The temporary file the pieces go to; taken when the last arrives.
    pub(crate) staged: Option<verso_core::Staged>,
    pub(crate) sha: Sha256,
    pub(crate) written: u64,
    pub(crate) size: u64,
    pub(crate) hash: String,
    pub(crate) base: Option<String>,
    /// The room the file holds in its folder's quota until it lands or
    /// goes (`crate::quota::reserve`).
    pub(crate) hold: Option<crate::quota::Hold>,
}
