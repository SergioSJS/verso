// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The bytes of the WebSocket's requests and answers under way, on the
//! whole server (the review of 2026-10-13). A message may be 48 MB
//! (`crate::rpc::MAX_MESSAGE`), each connection may have 8 requests under
//! way and an account 32 connections: every message was parsed whole into
//! a JSON value — for a reader too, whose upload the role check refused
//! only after — and the answers waited in the queues uncounted. On a host
//! of 1 GB, now:
//!
//! - each command has a size of its own ([`most_for`]): an upload's
//!   48 MB only for `create_file` and `sync_put`, a note's or a board's
//!   text for the commands that carry one, 1 MB for the rest — judged on
//!   the command's name, read without the message being made a value;
//! - an upload from a window that may not write is refused before it is
//!   parsed;
//! - a message or an answer above 1 MB takes its bytes from one budget of
//!   the server's ([`BUDGET`]) until it is answered or written; past it,
//!   it is refused at once — never queued holding its bytes — and said
//!   busy, as a 503 says it.

use std::sync::Arc;

use serde::Deserialize;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use verso_contract::{ContractError, ErrorKind};

use crate::state::Server;

/// The most a command's message may be, for every command but those
/// below: its arguments are names, paths, settings — kilobytes.
pub const SMALL: usize = 1024 * 1024;

/// The most a command that carries a note's or a board's text may be: a
/// text of 16 MB (`verso_service::ops::TEXT_MOST`, `collab_board`'s
/// `CANVAS_MOST`), escaped into JSON, with room; a room's update of 4 MB
/// as base64 fits too.
pub const TEXT: usize = 32 * 1024 * 1024;

/// The server's bytes of messages and answers above [`SMALL`] under way
/// at once: two uploads at the message limit (48 MB) with room, an eighth
/// of the 1 GB host. A request or an answer past it is refused, not held.
pub const BUDGET: usize = 128 * 1024 * 1024;

/// The commands that carry a file's bytes.
const UPLOADS: [&str; 2] = ["create_file", "sync_put"];

/// The commands that carry a text, a board or a room's edit.
const TEXTS: [&str; 10] = [
    "write_note",
    "write_text",
    "write_board",
    "create_note",
    "board_preview",
    "board_text",
    "render_markdown",
    "collab_update",
    "collab_canvas",
    "query_base",
];

/// The most a message of `cmd` may be.
#[must_use]
pub fn most_for(cmd: &str) -> usize {
    if UPLOADS.contains(&cmd) {
        crate::rpc::MAX_MESSAGE
    } else if TEXTS.contains(&cmd) {
        TEXT
    } else {
        SMALL
    }
}

/// A request's id and command, read from its text without its arguments
/// made a value: serde skips the fields it is not asked for.
#[derive(Deserialize)]
struct Head {
    id: Option<u64>,
    cmd: String,
}

/// The bytes of the server's large messages and answers under way.
pub struct Inflight {
    budget: Arc<Semaphore>,
}

impl Default for Inflight {
    fn default() -> Self {
        Self::new(BUDGET)
    }
}

/// A message refused before it was parsed: the request's id when it had
/// one, and why.
pub struct Refusal {
    pub id: Option<u64>,
    pub error: ContractError,
}

fn refused(message: String) -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message,
    }
}

/// Said when the budget is spent: the work is not refused for itself.
pub fn busy() -> ContractError {
    ContractError {
        kind: ErrorKind::Failed,
        message: "the server is busy with other large transfers: try again in a moment".to_owned(),
    }
}

impl Inflight {
    #[must_use]
    pub fn new(bytes: usize) -> Self {
        Self {
            budget: Arc::new(Semaphore::new(bytes)),
        }
    }

    /// `bytes` of the budget, when they are above [`SMALL`]: `Ok(None)` for
    /// a small one, which takes nothing; `Err` when the budget has not
    /// that much free now.
    pub fn take(&self, bytes: usize) -> Result<Option<OwnedSemaphorePermit>, ContractError> {
        if bytes <= SMALL {
            return Ok(None);
        }
        let n = u32::try_from(bytes).map_err(|_| busy())?;
        Arc::clone(&self.budget)
            .try_acquire_many_owned(n)
            .map(Some)
            .map_err(|_| busy())
    }

    /// The budget, for the queues that count their answers in it.
    #[must_use]
    pub fn budget(&self) -> Arc<Semaphore> {
        Arc::clone(&self.budget)
    }
}

/// A text message of `len` bytes from `client`, judged before it is
/// parsed: within its command's size, an upload only from a window that
/// may write, and its bytes taken from the budget when it is large. The
/// bytes' place is held until the request is answered.
pub fn admit_text(
    server: &Server,
    client: &str,
    text: &str,
) -> Result<Option<OwnedSemaphorePermit>, Refusal> {
    if text.len() <= SMALL {
        return Ok(None);
    }
    let Ok(head) = serde_json::from_str::<Head>(text) else {
        return Err(Refusal {
            id: None,
            error: refused("not a request".to_owned()),
        });
    };
    admit(server, client, head.id, &head.cmd, text.len())
}

/// The same for a request already read as `cmd` with id `id`, of `len`
/// bytes in all: a binary message's piece (sync 2).
pub fn admit(
    server: &Server,
    client: &str,
    id: Option<u64>,
    cmd: &str,
    len: usize,
) -> Result<Option<OwnedSemaphorePermit>, Refusal> {
    let refuse = |error: ContractError| Refusal { id, error };
    let most = most_for(cmd);
    if len > most {
        return Err(refuse(refused(format!(
            "{cmd}: a message of {} MB at most",
            most / (1024 * 1024)
        ))));
    }
    if UPLOADS.contains(&cmd) && !may_write(server, client) {
        return Err(refuse(refused("you may only read this folder".to_owned())));
    }
    server.inflight.take(len).map_err(refuse)
}

/// Whether the window `client` shows a folder it may write, by its role
/// and its credential, as `crate::rpc` checks before the core acts; that
/// check stays, this one only spares the parse.
fn may_write(server: &Server, client: &str) -> bool {
    verso_service::lock(&server.clients)
        .get(client)
        .is_some_and(|c| c.token_write && c.folder.as_ref().is_some_and(|(_, r)| r.writes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_command_has_its_size() {
        assert_eq!(most_for("create_file"), crate::rpc::MAX_MESSAGE);
        assert_eq!(most_for("sync_put"), crate::rpc::MAX_MESSAGE);
        assert_eq!(most_for("write_note"), TEXT);
        assert_eq!(most_for("list_notes"), SMALL);
        assert_eq!(most_for("nonsense"), SMALL);
    }

    /// Large messages take from the budget until it is spent, then are
    /// refused at once; a small one never takes from it.
    #[test]
    fn the_budget_is_spent_then_refuses_at_once() {
        let inflight = Inflight::new(3 * SMALL);
        let one = inflight.take(2 * SMALL).unwrap();
        assert!(one.is_some());
        assert!(inflight.take(2 * SMALL).is_err(), "past the budget");
        assert!(inflight.take(SMALL).unwrap().is_none());
        drop(one);
        assert!(inflight.take(2 * SMALL).unwrap().is_some());
    }
}
