// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A pass's steps carried out (ADR 0079 items 7, 8, 10 and 12): a file
//! sent or fetched in pieces, written here over the file the pass read
//! (invariant 11), deleted, renamed, or set aside as a conflict's copy —
//! and why a step was refused.

use sha2::{Digest, Sha256};
use verso_core::sync::remote::{
    self as rem, Known, Meta, Remote, RemoteError, RemoteErrorKind, Sink, Source, Written,
};

use super::*;

/// Why an action was not carried out.
pub(super) enum Refusal {
    /// The connection failed: the pass ends.
    Connection(ContractError),
    /// This file: listed with its reason, the rest goes on.
    File(String, String, String),
    /// The file changed while the pass ran: the next one sees it.
    Again(String, String),
    /// The file is gone here since the pass listed it: the folder was
    /// walked, and the pass right after carries out its deletion, or
    /// fetches the server's newer version — never listed.
    Gone(String),
}

/// A remote's error as the refusal of a step. The connection's failures end
/// the pass; the rest are this file's.
fn of_remote(path: &str, e: RemoteError) -> Refusal {
    match e.kind {
        RemoteErrorKind::Unreachable
        | RemoteErrorKind::RateLimited(_)
        | RemoteErrorKind::Refused => Refusal::Connection(contract_of(e)),
        RemoteErrorKind::Changed => Refusal::Again(path.to_owned(), e.message),
        // A new name beside an entry that differs from it only in case
        // (spec Q8, decided 2026-10-12) is listed as a name taken too.
        RemoteErrorKind::Exists | RemoteErrorKind::CaseTwin => {
            Refusal::File(path.to_owned(), "name_taken".to_owned(), e.message)
        }
        RemoteErrorKind::Quota => Refusal::File(path.to_owned(), "quota".to_owned(), e.message),
        // A name the service keeps for itself (ADR 0104 item 10): listed
        // with the service's reason, the file stays here as it is.
        RemoteErrorKind::NameInvalid => {
            Refusal::File(path.to_owned(), "name_invalid".to_owned(), e.message)
        }
        // The remote answered: that file is not readable there now.
        _ => Refusal::File(path.to_owned(), "failed".to_owned(), e.message),
    }
}

/// A remote's error as the contract's, for the window to say: the kind the
/// adapter carried through when it carried one.
pub(crate) fn contract_of(e: RemoteError) -> ContractError {
    let kind = e
        .detail
        .as_deref()
        .and_then(|d| serde_json::from_value::<ErrorKind>(json!(d)).ok())
        .unwrap_or(match e.kind {
            RemoteErrorKind::Unreachable => ErrorKind::Unreachable,
            RemoteErrorKind::NotFound => ErrorKind::NotFound,
            RemoteErrorKind::Refused => ErrorKind::Refused,
            RemoteErrorKind::Changed => ErrorKind::Changed,
            RemoteErrorKind::Exists => ErrorKind::Exists,
            RemoteErrorKind::Quota => ErrorKind::Quota,
            RemoteErrorKind::CaseTwin => ErrorKind::CaseTwin,
            RemoteErrorKind::RateLimited(_) | RemoteErrorKind::Unavailable => {
                ErrorKind::Unavailable
            }
            _ => ErrorKind::Failed,
        });
    ContractError {
        kind,
        message: e.message,
    }
}

/// The failure of this computer's side of a transfer, told to the remote
/// as a kind it passes through untouched.
fn local() -> RemoteError {
    RemoteError::new(
        RemoteErrorKind::Local,
        "this computer's side of the transfer failed",
    )
}

/// A path the plan holds apart (`engine::Held`), as the list of what is
/// not synced says it: a name's other Unicode form held by another file
/// (spec Q7) is a name taken; a name on the server that another file there
/// holds in another case (spec Q8) is said as such — the server keeps
/// both, this computer one.
pub(super) fn held_refused(h: &engine::Held) -> SyncRefused {
    let (reason, message) = if h.case {
        (
            "case_twin_there",
            "two names that differ only in case on the server; this computer keeps one",
        )
    } else if h.here {
        (
            "name_taken",
            "another file here has this name, its accents in another Unicode form: one name is one file everywhere",
        )
    } else {
        (
            "name_taken",
            "another file on the server has this name, its accents in another Unicode form",
        )
    };
    SyncRefused {
        path: h.path.clone(),
        reason: reason.to_owned(),
        message: message.to_owned(),
    }
}

/// A step here that failed. One whose file is gone since the listing —
/// moved or deleted on this computer while the pass ran, or long before
/// with no batch of the watcher to say so (C13, C17) — brings the listing
/// up to date now, as that batch would, so the pass asked for at once
/// sees the folder as it is, not the file once more (F22).
/// A file moved here by sync: the windows of the folder hear where it
/// went, as after a rename made in the window, so that a tab of it follows
/// it (`changes.ts`, `moved`) instead of finding its file gone — a rename
/// made on the server arrives as one (ADR 0079, decided 2026-10-31).
fn moved_here(ctx: &Ctx, s: &Syncer, from: &str, to: &str) {
    let windows = ctx.service.clients_of(&s.key);
    let Some(index) = windows
        .first()
        .and_then(|w| ctx.service.current_folder(w))
        .map(|f| f.index)
    else {
        return;
    };
    let changed = verso_contract::FolderChanged {
        key: s.key.clone(),
        changed: vec![to.to_owned()],
        removed: vec![from.to_owned()],
        moved: vec![verso_contract::Moved {
            from: from.to_owned(),
            to: to.to_owned(),
        }],
        listing: true,
        index,
    };
    if let Ok(payload) = serde_json::to_value(&changed) {
        (ctx.told)(&windows, "folder-changed", &payload);
    }
}

fn of_here(ctx: &Ctx, s: &Syncer, path: &str, e: ContractError) -> Refusal {
    match e.kind {
        ErrorKind::NotFound => {
            gone_line(path, "the pass that follows");
            tokio::task::block_in_place(|| ctx.service.walk_quietly(&s.key));
            Refusal::Gone(path.to_owned())
        }
        // Changed since the pass read it: the next pass sees it as it is
        // now.
        ErrorKind::Changed => Refusal::Again(path.to_owned(), e.message),
        // Another file here has this name, as this file system compares
        // names (case, accents): listed, never written over.
        ErrorKind::Exists => Refusal::File(
            path.to_owned(),
            "name_taken".to_owned(),
            "another file here has this name, differing only in case or accents".to_owned(),
        ),
        // A new name beside its case twin here (spec Q8), refused where
        // it is made.
        ErrorKind::CaseTwin => Refusal::File(
            path.to_owned(),
            "name_taken".to_owned(),
            "another file here has a name differing from this one only in case".to_owned(),
        ),
        ErrorKind::Unavailable => Refusal::File(
            path.to_owned(),
            "placeholder".to_owned(),
            "not on this computer: on-demand storage".to_owned(),
        ),
        _ => Refusal::File(path.to_owned(), "failed".to_owned(), e.message),
    }
}

/// A change held apart: the file is no longer shared with the person (it was
/// synced, and the server does not list it now), or the folder is read only.
fn unshared_or_reader(state: &engine::State, known: &Known, path: &str) -> Refusal {
    if state.base.contains_key(path)
        && !known
            .files
            .contains_key(&engine::spelled_there(&known.files, path))
    {
        return Refusal::File(
            path.to_owned(),
            "unshared".to_owned(),
            "this file is no longer shared with you; your copy stays here".to_owned(),
        );
    }
    reader_refusal(path)
}

fn reader_refusal(path: &str) -> Refusal {
    Refusal::File(
        path.to_owned(),
        "reader".to_owned(),
        "you may only read the server's folder: this change stays here".to_owned(),
    )
}

/// A deletion made here by one who edits the server's file but may not
/// delete it: the server refused it and its copy came back here.
fn owner_deletes_refusal(path: &str) -> Refusal {
    Refusal::File(
        path.to_owned(),
        "owner_deletes".to_owned(),
        "only the folder's owner deletes on the server: the file came back here".to_owned(),
    )
}

/// A copy of `path` set aside by an earlier conflict that holds exactly
/// `hash`: `<stem> (conflict, …).<ext>` or `(conflito, …)`, beside it.
fn held_copy(local: &Files, path: &str, hash: &str) -> Option<String> {
    let (dir, file) = path.rsplit_once('/').map_or(("", path), |(d, f)| (d, f));
    let (stem, ext) = match file.rfind('.') {
        Some(at) if at > 0 => (&file[..at], &file[at..]),
        _ => (file, ""),
    };
    let join = |name: String| {
        if dir.is_empty() {
            name
        } else {
            format!("{dir}/{name}")
        }
    };
    ["conflict", "conflito"].iter().find_map(|word| {
        let start = join(format!("{stem} ({word}, "));
        local
            .iter()
            .find(|(p, f)| p.starts_with(&start) && p.ends_with(ext) && f.hash == hash)
            .map(|(p, _)| p.clone())
    })
}

/// What this device's changes may do on the server, path by path (ADR 0113
/// S8): the server's last answer (`access_get`), or, where it has none to
/// give, the role. A change the gate does not allow stays here, said once
/// per pass as a file held apart — never sent to be refused, never a
/// conflict.
pub(super) struct Gate<'a> {
    /// Every change is the server's to judge: the folder's owner, or a
    /// server that gives no per-file answer to an editor.
    pub(super) open: bool,
    /// The files the server said this device may change.
    pub(super) rights: &'a std::collections::BTreeMap<String, verso_core::sync::remote::Rights>,
}

impl Gate<'_> {
    /// The memo is kept under the name as the server compares names (case
    /// and Unicode form folded), so a file is found whatever its spelling.
    fn of(&self, path: &str) -> Option<&verso_core::sync::remote::Rights> {
        self.rights.get(&engine::folded(path))
    }

    pub(super) fn put(&self, path: &str) -> bool {
        self.open || self.of(path).is_some_and(|r| r.put)
    }

    pub(super) fn delete(&self, path: &str) -> bool {
        self.open || self.of(path).is_some_and(|r| r.delete)
    }

    /// A rename: the file may be renamed where it is, and the new name is
    /// one the device may put.
    pub(super) fn rename(&self, from: &str, to: &str) -> bool {
        self.open || self.of(from).is_some_and(|r| r.rename) && self.put(to)
    }
}

/// This computer's file, read from the disk a piece at a time as the
/// remote asks for them — never whole in memory (ADR 0079 item 12, revised
/// 2026-10-12) — and refused as changed when the disk's file is no longer
/// the one that was hashed.
struct DiskSource<'a> {
    ctx: &'a Ctx,
    s: &'a Syncer,
    path: &'a str,
    mark: verso_core::Mark,
    offset: u64,
    done: bool,
    /// What went wrong here, for the step's refusal.
    failure: Option<Refusal>,
}

impl Source for DiskSource<'_> {
    fn next(&mut self) -> rem::Result<Option<Vec<u8>>> {
        if self.done {
            return Ok(None);
        }
        let (p, offset) = (self.path.to_owned(), self.offset);
        match self
            .ctx
            .service
            .with_key(&self.s.key, move |ws| Ok(ws.read_piece(&p, offset, PIECE)?))
        {
            // Changed on the disk since it was hashed: the next pass sends
            // it as it is then.
            Ok((_, mark)) if mark != self.mark => {
                self.failure = Some(Refusal::Again(
                    self.path.to_owned(),
                    "changed while it crossed".to_owned(),
                ));
                Err(local())
            }
            Ok((piece, _)) if piece.is_empty() => {
                self.done = true;
                Ok(None)
            }
            Ok((piece, _)) => {
                self.offset += piece.len() as u64;
                Ok(Some(piece))
            }
            Err(e) => {
                self.failure = Some(of_here(self.ctx, self.s, self.path, e));
                Err(local())
            }
        }
    }

    fn rewind(&mut self) -> rem::Result<()> {
        self.offset = 0;
        self.done = false;
        Ok(())
    }
}

/// Send this computer's file at `path`; the hash sent, its size, and what
/// the remote says it left (the path it landed at — the spelling the
/// remote keeps for the name, which may be this computer's in another
/// Unicode form, spec Q7 — and its version).
fn upload(
    ctx: &Ctx,
    s: &Syncer,
    remote: &dyn Remote,
    known: &Known,
    path: &str,
    base: Option<&str>,
) -> Result<(String, u64, Written), Refusal> {
    let p = path.to_owned();
    // Larger than sync carries — grown since the pass listed it — is
    // refused by its size on the disk, before a read.
    let hashed = tokio::task::block_in_place(|| {
        ctx.service.with_key(&s.key, move |ws| {
            if ws.file_len(&p).is_some_and(|len| len > LARGEST) {
                return Ok(None);
            }
            Ok(Some(ws.hash_with_revision(&p)?))
        })
    })
    .map_err(|e| of_here(ctx, s, path, e))?;
    let too_large = || {
        Refusal::File(
            path.to_owned(),
            "too_large".to_owned(),
            TOO_LARGE.to_owned(),
        )
    };
    let Some(hashed) = hashed else {
        return Err(too_large());
    };
    let size = hashed.len;
    if size > LARGEST {
        return Err(too_large());
    }
    // The write is conditional on the version the plan was made on: a
    // file changed there since is the conflict path, never overwritten.
    let condition = known
        .condition(path, base)
        .map_err(|e| of_remote(path, e))?;
    let mut source = DiskSource {
        ctx,
        s,
        path,
        mark: hashed.mark,
        offset: 0,
        done: false,
        failure: None,
    };
    let meta = Meta {
        size,
        hash: hashed.hash.clone(),
    };
    let sent = tokio::task::block_in_place(|| remote.write(path, &condition, &meta, &mut source));
    match sent {
        Ok(written) => Ok((hashed.hash, size, written)),
        Err(e) if e.kind == RemoteErrorKind::Local => Err(source
            .failure
            .take()
            .unwrap_or_else(|| Refusal::File(path.to_owned(), "failed".to_owned(), e.message))),
        Err(e) => Err(of_remote(path, e)),
    }
}

/// The remote's bytes into a temporary file beside where they land, hashed
/// as they arrive.
struct StagedSink<'a> {
    staged: &'a mut verso_core::Staged,
    sha: &'a mut Sha256,
    failure: Option<String>,
}

impl Sink for StagedSink<'_> {
    fn put(&mut self, piece: &[u8]) -> rem::Result<()> {
        if let Err(e) = self.staged.append(piece) {
            self.failure = Some(e.to_string());
            return Err(local());
        }
        self.sha.update(piece);
        Ok(())
    }
}

/// The remote's file at `path`, in pieces written as they arrive to a
/// temporary file beside where it lands — never whole in memory — and its
/// hash checked once all are there: the file staged, its hash and size,
/// and the version read. A broken transfer leaves nothing half-written
/// (item 12): the staged file goes when dropped.
fn download(
    ctx: &Ctx,
    s: &Syncer,
    remote: &dyn Remote,
    known: &Known,
    path: &str,
) -> Result<(verso_core::Staged, String, u64, String), Refusal> {
    let p = path.to_owned();
    let mut staged =
        tokio::task::block_in_place(|| ctx.service.with_key(&s.key, move |ws| Ok(ws.stage(&p)?)))
            .map_err(|e| of_here(ctx, s, path, e))?;
    let crossed = || Refusal::Again(path.to_owned(), "changed while it crossed".to_owned());
    let mut sha = Sha256::new();
    let mut failure = None;
    let read = {
        let mut sink = StagedSink {
            staged: &mut staged,
            sha: &mut sha,
            failure: None,
        };
        let read = tokio::task::block_in_place(|| remote.read(path, &mut sink));
        failure = failure.or(sink.failure.take());
        read
    };
    let read = match read {
        Ok(read) => read,
        Err(e) if e.kind == RemoteErrorKind::Local => {
            return Err(Refusal::File(
                path.to_owned(),
                "failed".to_owned(),
                failure.unwrap_or(e.message),
            ));
        }
        Err(e) => return Err(of_remote(path, e)),
    };
    let got = rem::hex(&sha.finalize());
    // What the remote says the bytes are, or, of a cloud that does not
    // say, what the listing it was planned on said: a file changed there
    // since is not this one.
    let expected = read.hash.clone().or_else(|| {
        known
            .files
            .get(&engine::spelled_there(&known.files, path))
            .map(|f| f.hash.clone())
    });
    if expected.is_some_and(|e| e != got) {
        return Err(crossed());
    }
    let size = staged.len();
    Ok((staged, got, size, read.version))
}

/// The file at `path` here is the one the pass hashed (`planned`; `None`:
/// no file): the revision to write over, hashed a piece at a time —
/// refused as changed when it is another (invariant 11).
fn planned_revision(
    ws: &mut verso_core::Workspace,
    p: &str,
    planned: Option<&str>,
) -> Result<Option<String>, OpError> {
    match planned {
        Some(hash) => {
            let now = ws.hash_with_revision(p)?;
            if now.hash != hash {
                return Err(OpError::from(ContractError {
                    kind: ErrorKind::Changed,
                    message: "changed since it was read".to_owned(),
                }));
            }
            Ok(Some(now.revision))
        }
        None => Ok(None),
    }
}

/// Write the server's file, staged, here: over the file the pass hashed —
/// refused when it changed since (invariant 11) — or as a new one.
fn write_here(
    ctx: &Ctx,
    s: &Syncer,
    path: &str,
    staged: verso_core::Staged,
    planned: Option<&str>,
) -> Result<(), Refusal> {
    let p = path.to_owned();
    let planned = planned.map(str::to_owned);
    let by = written_by(s, path);
    tokio::task::block_in_place(|| {
        ctx.service.with_key(&s.key, move |ws| {
            let revision = planned_revision(ws, &p, planned.as_deref())?;
            ws.history_written_by(by, verso_core::history::Kind::Write);
            ws.write_staged(&p, staged, revision.as_deref())?;
            Ok(())
        })
    })
    .map_err(|e| of_here(ctx, s, path, e))
}

/// Who the computer's history names for a file sync brings here (ADR 0091
/// item 4): the device the server's log says made it, else the person,
/// else the server.
fn written_by(s: &Syncer, path: &str) -> Vec<verso_core::history::Author> {
    use verso_core::history::Author;
    let (by, device) = lock(&s.authors).get(path).cloned().unwrap_or_default();
    let host = s.url.split_once("://").map_or(s.url.as_str(), |(_, h)| h);
    vec![match (device, by) {
        (Some(d), _) => Author::new("device", &d),
        (None, Some(b)) => Author::new("account", &b),
        (None, None) => Author::new("device", host),
    }]
}

/// [`write_here`] for bytes held in memory: two appends to a note joined.
fn write_bytes_here(
    ctx: &Ctx,
    s: &Syncer,
    path: &str,
    bytes: Vec<u8>,
    planned: Option<&str>,
) -> Result<(), Refusal> {
    let p = path.to_owned();
    let planned = planned.map(str::to_owned);
    let by = written_by(s, path);
    tokio::task::block_in_place(|| {
        ctx.service.with_key(&s.key, move |ws| {
            let revision = planned_revision(ws, &p, planned.as_deref())?;
            ws.history_written_by(by, verso_core::history::Kind::Write);
            ws.write_bytes(&p, &bytes, revision.as_deref())?;
            Ok(())
        })
    })
    .map_err(|e| of_here(ctx, s, path, e))
}

/// What a pass carries its plan out with.
pub(super) struct Side<'a> {
    pub(super) ctx: &'a Ctx,
    pub(super) s: &'a Syncer,
    pub(super) remote: &'a dyn Remote,
    pub(super) gate: Gate<'a>,
}

impl Side<'_> {
    /// A deletion made here that the server refuses (outside a table only
    /// the folder's owner deletes, ADR 0113 section B, amended 2026-10-31):
    /// the server's copy comes back here, as a download does.
    fn bring_back(
        &self,
        known: &mut Known,
        local: &Files,
        state: &mut engine::State,
        path: &str,
    ) -> Result<(), Refusal> {
        let (ctx, s) = (self.ctx, self.s);
        let (staged, hash, size, version) = download(ctx, s, self.remote, known, path)?;
        let here = local.get(path).map(|f| f.hash.clone());
        write_here(ctx, s, path, staged, here.as_deref())?;
        known.put(
            engine::spelled_there(&known.files, path),
            FileState {
                hash: hash.clone(),
                size,
            },
            version,
        );
        state.base.insert(path.to_owned(), hash);
        s.crossed(ctx, "received", path, None);
        Ok(())
    }

    /// A move made here that the server refuses (out of a shared folder, for
    /// that share a deletion, ADR 0113 section B, amended 2026-10-31): the
    /// file goes back from `now` to `was`, where the server still has it.
    fn move_back(&self, local: &mut Files, now: &str, was: &str) -> Result<(), Refusal> {
        let (ctx, s) = (self.ctx, self.s);
        let (n, w) = (now.to_owned(), was.to_owned());
        tokio::task::block_in_place(|| {
            ctx.service.with_key(&s.key, move |ws| {
                ws.rename_entry(&n, &w)?;
                ws.prune_empty_parents(&n);
                Ok(())
            })
        })
        .map_err(|e| of_here(ctx, s, now, e))?;
        if let Some(f) = local.remove(now) {
            local.insert(was.to_owned(), f);
        }
        s.crossed(ctx, "renamed_here", was, Some(now));
        Ok(())
    }

    /// One step carried out. `local` is the files here as the pass hashed
    /// them, kept in step with the pass's own renames: a step after a
    /// respelling finds the file under its new name.
    pub(super) fn carry_out(
        &self,
        known: &mut Known,
        local: &mut Files,
        state: &mut engine::State,
        action: &Action,
    ) -> Result<(), Refusal> {
        let Self {
            ctx,
            s,
            remote,
            ref gate,
        } = *self;
        let hash_here = |local: &Files, p: &str| local.get(p).map(|f| f.hash.clone());
        match action {
            Action::Agree { path, hash } => {
                match hash {
                    Some(h) => state.base.insert(path.clone(), h.clone()),
                    None => state.base.remove(path),
                };
            }
            Action::Upload { path, base } => {
                if !gate.put(path) {
                    return Err(unshared_or_reader(state, known, path));
                }
                let (hash, size, written) = upload(ctx, s, remote, known, path, base.as_deref())?;
                // Under the spelling the server keeps for the name (spec
                // Q7), which may be this computer's in another form.
                known.remove(&engine::spelled_there(&known.files, path));
                known.put(
                    written.path,
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                    written.version,
                );
                state.base.insert(path.clone(), hash);
                s.crossed(ctx, "sent", path, None);
            }
            Action::Download { path, .. } => {
                let (staged, hash, size, version) = download(ctx, s, remote, known, path)?;
                write_here(ctx, s, path, staged, hash_here(local, path).as_deref())?;
                known.put(
                    engine::spelled_there(&known.files, path),
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                    version,
                );
                state.base.insert(path.clone(), hash);
                s.crossed(ctx, "received", path, None);
            }
            Action::DeleteRemote { path, base } => {
                // One who writes the file and may not delete it: outside a
                // table only the folder's owner deletes (ADR 0113 section B,
                // amended 2026-10-31). The server refuses the deletion and
                // the file comes back here, nothing lost (decided that day);
                // said as the owner's rule, not as "you only read".
                if !gate.delete(path) {
                    if !gate.put(path) {
                        return Err(reader_refusal(path));
                    }
                    self.bring_back(known, local, state, path)?;
                    return Err(owner_deletes_refusal(path));
                }
                let condition = known
                    .condition(path, Some(base))
                    .map_err(|e| of_remote(path, e))?;
                // The memo said yes and the server says no (an answer kept
                // from before the rule): the same.
                match tokio::task::block_in_place(|| remote.delete(path, &condition)) {
                    Ok(()) => {}
                    Err(e) if e.message == verso_server::access::NO_DELETE_OWNER => {
                        self.bring_back(known, local, state, path)?;
                        return Err(owner_deletes_refusal(path));
                    }
                    Err(e) => return Err(of_remote(path, e)),
                }
                known.remove(&engine::spelled_there(&known.files, path));
                state.base.remove(path);
                s.crossed(ctx, "deleted_there", path, None);
            }
            Action::DeleteLocal { path } => {
                // A cloud's listing alone is not proof that a file is gone
                // there: a service that lags behind its writes, or a
                // folder that moved, lists too little. Ask for the file
                // itself before it leaves this computer (ADR 0104 item 8).
                if s.cloud.is_some() {
                    let there = tokio::task::block_in_place(|| remote.exists(path))
                        .map_err(|e| of_remote(path, e))?;
                    if there {
                        return Err(Refusal::Again(
                            path.clone(),
                            "the cloud still has it, though its listing did not".to_owned(),
                        ));
                    }
                }
                let p = path.clone();
                let by = format!(
                    "{}{}",
                    verso_core::trash::BY_SYNC,
                    s.url
                        .split_once("://")
                        .map_or(s.url.as_str(), |(_, host)| host)
                );
                let planned = hash_here(local, path);
                tokio::task::block_in_place(|| {
                    ctx.service.with_key(&s.key, move |ws| {
                        // Only the file the pass saw goes to the bin.
                        let now = ws.hash_with_revision(&p)?.hash;
                        if Some(now) != planned {
                            return Err(OpError::from(ContractError {
                                kind: ErrorKind::Changed,
                                message: "changed since it was read".to_owned(),
                            }));
                        }
                        let gone = ws.delete_entry(&p)?;
                        // The bin's record names the server whose sync
                        // carried the deletion out (ADR 0080 item 9).
                        crate::trash::record(ws, &gone, Some(&by));
                        ws.prune_empty_parents(&p);
                        Ok(())
                    })
                })
                .map_err(|e| of_here(ctx, s, path, e))?;
                state.base.remove(path);
                state.seen.remove(path);
                s.crossed(ctx, "deleted_here", path, None);
            }
            Action::RenameRemote { from, to, base } => {
                if !gate.rename(from, to) {
                    return Err(reader_refusal(to));
                }
                let condition = known
                    .condition(from, Some(base))
                    .map_err(|e| of_remote(from, e))?;
                let written =
                    match tokio::task::block_in_place(|| remote.rename(from, to, &condition)) {
                        Ok(w) => w,
                        // A move out of a shared folder is, for that share,
                        // a deletion (ADR 0113 section B, amended
                        // 2026-10-31): refused, the file goes back where it
                        // was here, nothing lost.
                        Err(e) if e.message == verso_server::access::NO_MOVE_OUT_OF_SHARE => {
                            self.move_back(local, to, from)?;
                            return Err(Refusal::File(
                                from.clone(),
                                "owner_moves_out".to_owned(),
                                e.message,
                            ));
                        }
                        Err(e) => return Err(of_remote(from, e)),
                    };
                if let Some((f, _)) = known.remove(&engine::spelled_there(&known.files, from)) {
                    known.put(written.path, f, written.version);
                }
                state.base.remove(from);
                state.base.insert(to.clone(), base.clone());
                s.crossed(ctx, "renamed_there", to, Some(from));
            }
            Action::RenameLocal { from, to } => {
                let (f, t) = (from.clone(), to.clone());
                tokio::task::block_in_place(|| {
                    ctx.service.with_key(&s.key, move |ws| {
                        ws.rename_entry(&f, &t)?;
                        ws.prune_empty_parents(&f);
                        Ok(())
                    })
                })
                .map_err(|e| of_here(ctx, s, from, e))?;
                if let Some(b) = state.base.remove(from) {
                    state.base.insert(to.clone(), b);
                }
                if let Some(f) = local.remove(from) {
                    local.insert(to.clone(), f);
                }
                state.seen.remove(from);
                s.crossed(ctx, "renamed_here", to, Some(from));
                moved_here(ctx, s, from, to);
            }
            Action::Conflict { path, copy, .. } => {
                // The server's version first: it takes the name, or, when
                // both sides appended to a note, its tail joins this
                // computer's (item 8, decided 2026-10-11).
                let (mut staged, hash, size, version) = download(ctx, s, remote, known, path)?;
                // The base both sides last agreed on; for a note both made
                // apart, none — the template this computer filled it from
                // is its base (ADR 0093 item 12, revising item 8).
                let base = match state.base.get(path) {
                    Some(b) => Some(Base::Agreed(b.clone())),
                    None => state.made.get(path).cloned().map(Base::Template),
                };
                if gate.put(path)
                    && engine::merges_by_append(path)
                    && let Some(base) = base
                    && let Some(planned) = hash_here(local, path)
                {
                    // A note: small, joined in memory.
                    let theirs =
                        tokio::task::block_in_place(|| staged.contents()).map_err(|e| {
                            Refusal::File(path.clone(), "failed".to_owned(), e.to_string())
                        })?;
                    if let Some(joined) = appended(ctx, s, path, &base, &planned, &theirs)? {
                        let there = FileState { hash, size };
                        return self.join(known, local, state, path, joined, (there, version));
                    }
                }
                // A file this device may not send: its edit was set aside as
                // a copy before and is here still, the same bytes. The copy is
                // that edit's one place — another is not made of it each time
                // the server changes the file (ADR 0113 S8).
                if !gate.put(path)
                    && let Some(here) = hash_here(local, path)
                    && let Some(twin) = held_copy(local, path, &here)
                {
                    write_here(ctx, s, path, staged, Some(here.as_str()))?;
                    known.put(
                        engine::spelled_there(&known.files, path),
                        FileState {
                            hash: hash.clone(),
                            size,
                        },
                        version,
                    );
                    state.base.insert(path.clone(), hash);
                    state.seen.remove(path);
                    s.crossed(ctx, "conflict", path, Some(&twin));
                    return Ok(());
                }
                // This computer's version steps aside under the copy's name…
                let (f, t) = (path.clone(), copy.clone());
                tokio::task::block_in_place(|| {
                    ctx.service
                        .with_key(&s.key, move |ws| Ok(ws.rename_entry(&f, &t).map(|_| ())?))
                })
                .map_err(|e| of_here(ctx, s, path, e))?;
                state.base.remove(path);
                state.seen.remove(path);
                if let Some(f) = local.remove(path) {
                    local.insert(copy.clone(), f);
                }
                // …the server's takes the name…
                write_here(ctx, s, path, staged, None)?;
                known.put(
                    engine::spelled_there(&known.files, path),
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                    version,
                );
                state.base.insert(path.clone(), hash);
                s.crossed(ctx, "conflict", path, Some(copy));
                // …and the copy goes to the others (a reader keeps it here).
                if !gate.put(copy) {
                    return Err(reader_refusal(copy));
                }
                let (hash, size, written) = upload(ctx, s, remote, known, copy, None)?;
                known.put(
                    written.path,
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                    written.version,
                );
                state.base.insert(copy.clone(), hash);
            }
        }
        Ok(())
    }

    /// Two appends joined (item 8): `joined` written here over the file
    /// the pass hashed (invariant 11), then sent over the server's
    /// version, `there`. Once written here, the server's version is this
    /// file's base — its tail is here, this computer's after it — so a
    /// send refused meanwhile is a change of this side alone on the next
    /// pass, or two appends again, never the server's tail twice.
    fn join(
        &self,
        known: &mut Known,
        local: &mut Files,
        state: &mut engine::State,
        path: &str,
        joined: Vec<u8>,
        (there, version): (FileState, String),
    ) -> Result<(), Refusal> {
        let Self { ctx, s, remote, .. } = *self;
        let here = FileState {
            hash: sha256(&joined),
            size: joined.len() as u64,
        };
        // Only over the file the pass read: never as a new file.
        let Some(planned) = local.get(path).map(|f| f.hash.clone()) else {
            return Err(Refusal::Again(
                path.to_owned(),
                "changed since it was read".to_owned(),
            ));
        };
        write_bytes_here(ctx, s, path, joined, Some(&planned))?;
        let base = there.hash.clone();
        known.put(engine::spelled_there(&known.files, path), there, version);
        state.base.insert(path.to_owned(), base.clone());
        state.made.remove(path);
        state.seen.remove(path);
        local.insert(path.to_owned(), here);
        s.crossed(ctx, "merged", path, None);
        let (hash, size, written) = upload(ctx, s, remote, known, path, Some(&base))?;
        known.remove(&engine::spelled_there(&known.files, path));
        known.put(
            written.path,
            FileState {
                hash: hash.clone(),
                size,
            },
            written.version,
        );
        state.base.insert(path.to_owned(), hash);
        Ok(())
    }
}

/// What two versions of a note are joined over.
enum Base {
    /// The hash both sides last agreed on (item 8).
    Agreed(String),
    /// The hash of the text this computer made the note with from its
    /// template, the server's made apart (ADR 0093 item 12).
    Template(String),
}

/// This computer's note and the server's `theirs` joined, when each only
/// appended to the end of the `base` (item 8; or of the template both
/// were made from, ADR 0093 item 12): read here as the pass hashed it,
/// `planned` — refused when it changed since (invariant 11). `None`: any
/// other change on both sides, a conflict's copy.
fn appended(
    ctx: &Ctx,
    s: &Syncer,
    path: &str,
    base: &Base,
    planned: &str,
    theirs: &[u8],
) -> Result<Option<Vec<u8>>, Refusal> {
    let p = path.to_owned();
    let mine = tokio::task::block_in_place(|| {
        ctx.service
            .with_key(&s.key, move |ws| Ok(ws.read_with_revision(&p)?.0))
    })
    .map_err(|e| of_here(ctx, s, path, e))?;
    if sha256(&mine) != planned {
        return Err(Refusal::Again(
            path.to_owned(),
            "changed since it was read".to_owned(),
        ));
    }
    Ok(match base {
        Base::Agreed(base) => engine::append_merge(base, &mine, theirs),
        Base::Template(made) => engine::template_merge(made, &mine, theirs),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reason(r: &Refusal) -> Option<&str> {
        match r {
            Refusal::File(_, why, _) => Some(why.as_str()),
            _ => None,
        }
    }

    /// The server's refusal of a new name beside its case twin (spec Q8)
    /// is told by its kind and listed as a name taken; a refusal of
    /// another kind is not, whatever its text says.
    #[test]
    fn a_case_twin_on_the_server_is_listed_as_a_name_taken_by_its_kind() {
        let twin =
            super::super::universo::wire(&json!({"kind": "case_twin", "message": "a new name"}));
        assert_eq!(reason(&of_remote("nota.md", twin)), Some("name_taken"));
        let other = super::super::universo::wire(
            &json!({"kind": "refused", "message": "differs only in case"}),
        );
        assert_eq!(reason(&of_remote("nota.md", other)), Some("failed"));
    }

    /// A name the server holds twice, in two cases, is said once as its
    /// own reason; an accent's other form keeps "name taken".
    #[test]
    fn a_name_held_on_the_server_by_its_case_twin_says_so() {
        let held = |here: bool, case: bool| {
            held_refused(&engine::Held {
                path: "nota.md".to_owned(),
                here,
                case,
            })
        };
        let twin = held(false, true);
        assert_eq!(twin.reason, "case_twin_there");
        assert_eq!(
            twin.message,
            "two names that differ only in case on the server; this computer keeps one"
        );
        assert_eq!(held(true, false).reason, "name_taken");
        assert_eq!(held(false, false).reason, "name_taken");
    }

    /// What the server's log says of who made a change (sync 2) reaches
    /// the recent activity for what came from there, never for what this
    /// computer sent.
    #[test]
    fn the_server_says_who_made_what_came_from_there() {
        let who = |c: &Value| {
            let e = super::super::universo::entry(c, "a.md", "h");
            (e.by, e.device)
        };
        let c = json!({"seq": 3, "path": "a.md", "by": "Ana", "device": "MacBook"});
        assert_eq!(
            who(&c),
            (Some("Ana".to_owned()), Some("MacBook".to_owned()))
        );
        let browser = json!({"seq": 4, "path": "b.md", "by": "Ana"});
        assert_eq!(who(&browser), (Some("Ana".to_owned()), None));
        assert_eq!(who(&json!({"seq": 5, "path": "c.md"})), (None, None));
        for what in [
            "received",
            "deleted_here",
            "renamed_here",
            "conflict",
            "merged",
        ] {
            assert!(from_there(what), "{what}");
        }
        for what in ["sent", "deleted_there", "renamed_there"] {
            assert!(!from_there(what), "{what}");
        }
    }
}
