// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A board through a share's sync (ADR 0081 item 11, roadmap V.49): the
//! receiver's device holds the board **cut to the share**, as a window of
//! the share reads it (`share_board::text_out`) — every card of a file in
//! the share by the share's path, a card of a file beside it the locked
//! card that names nothing — never the owner's bytes.
//!
//! The device's engine compares hashes (ADR 0079): the hash and size its
//! manifest, its changes and its reads name for a board are those of the
//! cut text, and the hash it names as the base of a write, a deletion or a
//! rename is one too. So the one picture holds on every path
//! (invariant 11):
//!
//! - **Out** (`sync_state`, `sync_changes`, `sync_read`): the board as the
//!   device would be read it — the file, or a reader's projection — cut,
//!   and its hash. A change the owner makes only to what the share does not
//!   see gives the same cut: the device hears a change of the same hash,
//!   which is none (no ping-pong); a real change is a new hash.
//! - **In** (`sync_put`): the pieces kept in memory (a board is a text of
//!   16 MB at most), then the base judged against the cut of the file now,
//!   the text laid over the file (`share_board::text_in`: the cards' paths
//!   joined to the share's, the cards beside it put back as the file has
//!   them) and written by the ordinary put, over the file's own hash — a
//!   change landing between is refused as changed, never overwritten.
//! - `sync_delete` and `sync_rename` name the cut's hash: it is judged the
//!   same way and the file's own given to the ordinary command. A board is
//!   not renamed through a share into a name that is no board: its bytes
//!   would then cross as they are.
//!
//! The owner's devices, and any session that opened the whole folder, are
//! not here: they hold the file as it is.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use axum::body::Bytes;
use serde_json::{Value, json};
use verso_contract::{ContractError, ErrorKind};
use verso_service::lock;

use crate::auth::Who;
use crate::rpc::arg;
use crate::scope::Scope;
use crate::state::Server;
use crate::sync::{Reply, command_in, sha256};

/// What a path reaches, as `share_sync` says it.
pub(crate) type Reach = Arc<dyn Fn(&str) -> bool + Send + Sync>;

/// The largest board carried through a share: a text, read whole to be cut.
const MOST: u64 = crate::texts::TEXT_MOST;

/// The layouts kept of the boards the share's devices wrote, at most, and
/// the largest kept: past these a board is cut in its own layout.
const SHAPES: usize = 256;
const SHAPE_MOST: usize = 1 << 20;

/// A share's sync command on a board, and what it needs.
pub(crate) struct Cx<'a> {
    pub(crate) server: &'a Arc<Server>,
    pub(crate) who: &'a Who,
    pub(crate) client: &'a str,
    pub(crate) scope: &'a Scope,
    pub(crate) reads: Reach,
    pub(crate) writes: Reach,
    /// The words of a locked card, in the receiver's language.
    pub(crate) words: String,
}

/// A board sent in pieces through a share, held until its last.
pub(crate) struct Up {
    bytes: Vec<u8>,
    size: u64,
    hash: String,
    base: Option<String>,
    at: Instant,
}

/// Whether `path` names a board (`readers::is_board`: case ignored,
/// trailing dots and spaces too — fails closed).
#[must_use]
pub fn is_board(path: &str) -> bool {
    crate::readers::is_board(path)
}

/// The words of a locked card for the window `client` of `who`: the
/// table's language for a player, the account's otherwise, as a window of
/// the share is told (`rpc::board_out`).
#[must_use]
pub fn words(server: &Server, who: &Who, client: &str) -> String {
    let lang = crate::campaign::player(server, who, client)
        .ok()
        .flatten()
        .map_or_else(|| who.account.lang.clone(), |p| p.veil.lang.clone());
    crate::campaign_text::locked_card(&lang)
}

fn changed(message: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::Changed,
        message: message.to_owned(),
    }
}

impl Cx<'_> {
    /// The board at `full` as the device would be read it before the cut —
    /// the file, or a reader's projection of it, by the ordinary read and
    /// its checks — with the hash that read names (the file's own for one
    /// who writes). `None` when it is not there.
    async fn before_cut(&self, full: &str) -> Result<Option<(Vec<u8>, String)>, ContractError> {
        let mut out: Vec<u8> = Vec::new();
        let mut hash = String::new();
        loop {
            let asked = json!({ "path": full, "offset": out.len() });
            let read = command_in(
                self.server,
                self.who,
                self.client,
                "sync_read",
                (asked, None),
                Arc::clone(&self.reads),
            )
            .await;
            let (answer, piece) = match read {
                Ok(read) => read,
                Err(e) if e.kind == ErrorKind::NotFound => return Ok(None),
                Err(e) => return Err(e),
            };
            if out.is_empty()
                && let Some(h) = answer["hash"].as_str()
            {
                h.clone_into(&mut hash);
            }
            let piece = piece.unwrap_or_default();
            if (out.len() + piece.len()) as u64 > MOST {
                return Err(verso_service::refused(
                    "a board past 16 MB is not carried through a share",
                ));
            }
            let empty = piece.is_empty();
            out.extend(piece);
            if answer["done"] == true {
                return Ok(Some((out, hash)));
            }
            if empty {
                return Err(changed("changed while it crossed"));
            }
        }
    }

    /// `bytes`, the board at `full` as the owner's folder holds it, cut to
    /// the share — in the layout of the text a device of the share last
    /// wrote of it, when there is one (`share_board::shaped_like`). Bytes
    /// that are no text are no board: as they are (they name no card).
    fn cut(&self, full: &str, bytes: Vec<u8>) -> Vec<u8> {
        let text = match String::from_utf8(bytes) {
            Ok(text) => text,
            Err(e) => return e.into_bytes(),
        };
        let cut = crate::share_board::text_out(self.scope, &text, &self.words);
        let place = (self.scope.share.clone(), full.to_owned());
        let like = lock(&self.server.transfers.share_shapes)
            .get(&place)
            .map(|(t, _)| t.clone());
        like.and_then(|l| crate::share_board::shaped_like(&l, &cut))
            .unwrap_or(cut)
            .into_bytes()
    }

    /// The text a device of the share wrote of the board at `full`: the
    /// layout its cut is made in from now on.
    fn shaped(&self, full: &str, text: &str) {
        if text.len() > SHAPE_MOST {
            return;
        }
        let mut shapes = lock(&self.server.transfers.share_shapes);
        if shapes.len() >= SHAPES
            && !shapes.contains_key(&(self.scope.share.clone(), full.to_owned()))
        {
            let oldest = shapes
                .iter()
                .min_by_key(|(_, (_, at))| *at)
                .map(|(k, _)| k.clone());
            if let Some(k) = oldest {
                shapes.remove(&k);
            }
        }
        shapes.insert(
            (self.scope.share.clone(), full.to_owned()),
            (text.to_owned(), Instant::now()),
        );
    }

    /// The board at `full` as the device holds it: the cut bytes, and the
    /// hash of the file the cut was made of. `None` when it is not there,
    /// or is not served (too large, hidden from a reader).
    async fn seen(&self, full: &str) -> Result<Option<(Vec<u8>, String)>, ContractError> {
        match self.before_cut(full).await {
            Ok(Some((bytes, hash))) => Ok(Some((self.cut(full, bytes), hash))),
            Ok(None) => Ok(None),
            Err(e) if e.kind == ErrorKind::Changed => Err(e),
            // Refused (past 16 MB, a hidden file): not there for the device.
            Err(e) if e.kind == ErrorKind::Refused => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// The hash and size of the board at `full` as the device holds it.
    async fn state(&self, full: &str) -> Result<Option<(String, usize)>, ContractError> {
        Ok(self
            .seen(full)
            .await?
            .map(|(bytes, _)| (sha256(&bytes), bytes.len())))
    }

    /// The manifest's boards (`sync_state`, paths of the owner's folder):
    /// each named by its cut's hash and size; one the device is not served
    /// is not listed.
    pub(crate) async fn listed(&self, files: &mut Vec<Value>) -> Result<(), ContractError> {
        let mut gone = Vec::new();
        for (i, f) in files.iter_mut().enumerate() {
            let Some(full) = f["path"].as_str().map(str::to_owned) else {
                continue;
            };
            if !is_board(&full) || self.scope.to_rel(&full).is_none() {
                continue;
            }
            match self.state(&full).await? {
                Some((hash, size)) => {
                    f["hash"] = json!(hash);
                    f["size"] = json!(size);
                }
                None => gone.push(i),
            }
        }
        for i in gone.into_iter().rev() {
            files.remove(i);
        }
        Ok(())
    }

    /// The changes' boards (`sync_changes`, the share's paths): each named
    /// by the hash and size of its cut now — what a read would give. A
    /// board no longer there, or not served, is a deletion to the device;
    /// a later change in the log says the same.
    pub(crate) async fn changed(&self, answer: &mut Value) -> Result<(), ContractError> {
        let Some(list) = answer["changes"].as_array_mut() else {
            return Ok(());
        };
        let mut known: HashMap<String, Option<(String, usize)>> = HashMap::new();
        for c in list.iter_mut() {
            let Some(rel) = c["path"].as_str().map(str::to_owned) else {
                continue;
            };
            if !is_board(&rel) || c["deleted"] == true || !c["hash"].is_string() {
                continue;
            }
            let full = self.scope.to_full(&rel)?;
            let now = match known.get(&full) {
                Some(n) => n.clone(),
                None => {
                    let n = self.state(&full).await?;
                    known.insert(full.clone(), n.clone());
                    n
                }
            };
            match now {
                Some((hash, size)) => {
                    c["hash"] = json!(hash);
                    c["size"] = json!(size);
                }
                None => {
                    c["hash"] = Value::Null;
                    c["size"] = json!(0);
                    c["deleted"] = json!(true);
                }
            }
        }
        Ok(())
    }

    /// A piece of the board at `full` as the device reads it: of its cut.
    /// The board is read and cut whole for each piece; one whose cut
    /// changed since the first piece is refused as changed, as a file that
    /// changes while it crosses is.
    pub(crate) async fn read(&self, full: &str, offset: u64) -> Result<Reply, ContractError> {
        let (cut, _) = self.seen(full).await?.ok_or_else(|| ContractError {
            kind: ErrorKind::NotFound,
            message: "not found".to_owned(),
        })?;
        let hash = sha256(&cut);
        // Kept beside a reader's projection readings, apart from them.
        let place = (
            self.client.to_owned(),
            format!("\u{0}share-board\u{0}{full}"),
        );
        {
            let mut began = lock(&self.server.transfers.reader_reads);
            if offset == 0 {
                began.insert(place.clone(), hash.clone());
            } else if began.get(&place) != Some(&hash) {
                began.remove(&place);
                return Err(changed("changed while it crossed"));
            }
        }
        let size = cut.len() as u64;
        let start = usize::try_from(offset.min(size)).unwrap_or(usize::MAX);
        let end = start.saturating_add(crate::sync::PIECE).min(cut.len());
        let piece = cut.get(start..end).unwrap_or_default().to_vec();
        let done = end as u64 >= size;
        if done {
            lock(&self.server.transfers.reader_reads).remove(&place);
        }
        Ok((
            json!({ "size": size, "done": done, "hash": (offset == 0).then_some(hash) }),
            Some(piece),
        ))
    }

    /// The file's own hash for the board at `full` the device names by
    /// `base`, the hash of its cut: refused as changed (with the cut's hash
    /// now, never the file's) unless the cut is still that one.
    async fn own_base(&self, full: &str, base: &str) -> Result<String, ContractError> {
        match self.seen(full).await? {
            Some((cut, own)) if sha256(&cut) == base => Ok(own),
            Some((cut, _)) => Err(changed(&sha256(&cut))),
            None => Err(changed("")),
        }
    }

    /// A deletion or a rename of a board through the share: its base, the
    /// cut's hash, made the file's own. A board renamed into a name that is
    /// no board is refused: its bytes would cross as they are.
    pub(crate) async fn moving(&self, args: &mut Value, field: &str) -> Result<(), ContractError> {
        let Some(full) = args[field].as_str().map(str::to_owned) else {
            return Ok(());
        };
        if !is_board(&full) {
            return Ok(());
        }
        if field == "from" && args["to"].as_str().is_some_and(|to| !is_board(to)) {
            return Err(verso_service::refused(
                "a board shared with you stays a board: keep its .canvas name",
            ));
        }
        let base: String = arg(args, "base")?;
        args["base"] = json!(self.own_base(&full, &base).await?);
        Ok(())
    }

    /// A piece of a board the device sends (`args` with the owner's path).
    /// The pieces are kept until the last; then the board is laid over the
    /// file and written by the ordinary put.
    pub(crate) async fn put(
        &self,
        mut args: Value,
        data: Option<Bytes>,
    ) -> Result<Reply, ContractError> {
        let full: String = arg(&args, "path")?;
        let offset: u64 = arg(&args, "offset")?;
        let size: u64 = arg(&args, "size")?;
        let hash: String = arg(&args, "hash")?;
        let base: Option<String> = arg(&args, "base")?;
        let piece = crate::sync::piece_of(&mut args, data)?;
        if size > MOST {
            return Err(verso_service::refused(
                "a board past 16 MB is not carried through a share",
            ));
        }
        let place = (self.client.to_owned(), full.clone());
        let complete = {
            let mut up = lock(&self.server.transfers.share_boards);
            up.retain(|_, u| u.at.elapsed() < crate::transfers::IDLE);
            if offset == 0 {
                up.remove(&place);
                crate::transfers::room(&mut up, self.client, |u| u.at);
                up.insert(
                    place.clone(),
                    Up {
                        bytes: Vec::new(),
                        size,
                        hash: hash.clone(),
                        base: base.clone(),
                        at: Instant::now(),
                    },
                );
            }
            let Some(u) = up.get_mut(&place) else {
                return Err(verso_service::refused(
                    "no transfer of this file: start again",
                ));
            };
            if u.bytes.len() as u64 != offset
                || u.hash != hash
                || u.size != size
                || u.base != base
                || offset.saturating_add(piece.len() as u64) > size
            {
                up.remove(&place);
                return Err(verso_service::refused("a piece out of order: start again"));
            }
            u.bytes.extend_from_slice(&piece);
            u.at = Instant::now();
            if (u.bytes.len() as u64) < size {
                None
            } else {
                up.remove(&place).map(|u| u.bytes)
            }
        };
        let Some(theirs) = complete else {
            return Ok((json!({ "done": false }), None));
        };
        if sha256(&theirs) != hash {
            return Err(verso_service::refused(
                "the file arrived damaged: its hash does not match",
            ));
        }
        // The board now, as the device was given it: the base names its cut.
        let disk = self.before_cut(&full).await?;
        let own = match (&disk, &base) {
            (None, None) => None,
            (Some((bytes, own)), Some(b)) if sha256(&self.cut(&full, bytes.clone())) == *b => {
                Some(own.clone())
            }
            (Some((bytes, _)), _) => {
                return Err(changed(&sha256(&self.cut(&full, bytes.clone()))));
            }
            (None, Some(_)) => return Err(changed("")),
        };
        let (written, text) = match String::from_utf8(theirs) {
            Ok(text) => {
                let on_disk = disk
                    .as_ref()
                    .and_then(|(b, _)| std::str::from_utf8(b).ok().map(str::to_owned));
                let laid = crate::share_board::text_in(self.scope, on_disk.as_deref(), &text)?;
                (laid.into_bytes(), Some(text))
            }
            Err(e) => (e.into_bytes(), None),
        };
        let args = json!({
            "path": full, "offset": 0, "size": written.len(),
            "hash": sha256(&written), "base": own,
        });
        let done = command_in(
            self.server,
            self.who,
            self.client,
            "sync_put",
            (args, Some(Bytes::from(written))),
            Arc::clone(&self.writes),
        )
        .await
        .map_err(|e| match e.kind {
            // The file's own hash is the owner's, not the device's to hear.
            ErrorKind::Changed => changed(""),
            _ => e,
        })?;
        if let (Some(text), Some(landed)) = (text, done.0["path"].as_str()) {
            self.shaped(landed, &text);
        }
        Ok(done)
    }
}
