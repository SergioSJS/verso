// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A pass's steps carried out (ADR 0079 items 7, 8, 10 and 12): a file
//! sent or fetched in pieces, written here over the file the pass read
//! (invariant 11), deleted, renamed, or set aside as a conflict's copy —
//! and why a step was refused.

use sha2::{Digest, Sha256};

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

fn of_server(path: &str, e: &Value) -> Refusal {
    let transport = e["transport"] == true;
    let e = said(e);
    match e.kind {
        ErrorKind::Unavailable if transport => Refusal::Connection(e),
        // The server answered: that file is not readable there now.
        ErrorKind::Unavailable => Refusal::File(path.to_owned(), "failed".to_owned(), e.message),
        ErrorKind::Changed => Refusal::Again(path.to_owned(), e.message),
        ErrorKind::Exists => Refusal::File(path.to_owned(), "name_taken".to_owned(), e.message),
        ErrorKind::Quota => Refusal::File(path.to_owned(), "quota".to_owned(), e.message),
        ErrorKind::Refused if case_twin(&e.message) => {
            Refusal::File(path.to_owned(), "name_taken".to_owned(), e.message)
        }
        _ => Refusal::File(path.to_owned(), "failed".to_owned(), e.message),
    }
}

/// A new name refused beside an entry that differs from it only in case
/// (spec Q8, decided 2026-10-12; `verso_fs::ConfinementError::CaseTwin`):
/// listed as a name taken, here or on the server.
fn case_twin(message: &str) -> bool {
    message.contains("differs only in case")
}

/// A step here that failed. One whose file is gone since the listing —
/// moved or deleted on this computer while the pass ran, or long before
/// with no batch of the watcher to say so (C13, C17) — brings the listing
/// up to date now, as that batch would, so the pass asked for at once
/// sees the folder as it is, not the file once more (F22).
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
        ErrorKind::Refused if case_twin(&e.message) => Refusal::File(
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

fn reader_refusal(path: &str) -> Refusal {
    Refusal::File(
        path.to_owned(),
        "reader".to_owned(),
        "you may only read the server's folder: this change stays here".to_owned(),
    )
}

/// Send this computer's file at `path`, in pieces read from the disk as
/// they go — never the file whole in memory (ADR 0079 item 12, revised
/// 2026-10-12); the hash sent, its size, and the path it landed at — the
/// spelling the server keeps for the name, which may be this computer's
/// in another Unicode form (spec Q7).
async fn upload(
    ctx: &Ctx,
    s: &Syncer,
    remote: &remote::Remote,
    path: &str,
    base: Option<&str>,
) -> Result<(String, u64, String), Refusal> {
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
    let crossed = || Refusal::Again(path.to_owned(), "changed while it crossed".to_owned());
    let mut offset = 0_u64;
    loop {
        let p = path.to_owned();
        let (piece, mark) = tokio::task::block_in_place(|| {
            ctx.service
                .with_key(&s.key, move |ws| Ok(ws.read_piece(&p, offset, PIECE)?))
        })
        .map_err(|e| of_here(ctx, s, path, e))?;
        // Changed on the disk since it was hashed: the next pass sends it
        // as it is then.
        if mark != hashed.mark {
            return Err(crossed());
        }
        let end = offset + piece.len() as u64;
        let (answer, _) = remote
            .call_with(
                "sync_put",
                json!({
                    "path": path,
                    "offset": offset,
                    "size": size,
                    "hash": hashed.hash,
                    "base": base,
                }),
                Some(piece),
            )
            .await
            .map_err(|e| of_server(path, &e))?;
        if answer["done"] == true {
            let landed = answer["path"].as_str().unwrap_or(path).to_owned();
            return Ok((hashed.hash, size, landed));
        }
        if end >= size {
            return Err(crossed());
        }
        offset = end;
    }
}

/// The server's file at `path`, in pieces written as they arrive to a
/// temporary file beside where it lands — never whole in memory — and its
/// hash checked once all are there: the file staged, its hash and size. A
/// broken transfer leaves nothing half-written (item 12): the staged file
/// goes when dropped.
async fn download(
    ctx: &Ctx,
    s: &Syncer,
    remote: &remote::Remote,
    path: &str,
) -> Result<(verso_core::Staged, String, u64), Refusal> {
    let p = path.to_owned();
    let mut staged =
        tokio::task::block_in_place(|| ctx.service.with_key(&s.key, move |ws| Ok(ws.stage(&p)?)))
            .map_err(|e| of_here(ctx, s, path, e))?;
    let crossed = || Refusal::Again(path.to_owned(), "changed while it crossed".to_owned());
    let mut sha = Sha256::new();
    let mut hash = String::new();
    loop {
        let (a, piece) = remote
            .call_with(
                "sync_read",
                json!({ "path": path, "offset": staged.len() }),
                None,
            )
            .await
            .map_err(|e| of_server(path, &e))?;
        if let Some(h) = a["hash"].as_str() {
            h.clone_into(&mut hash);
        }
        let piece = piece.ok_or_else(crossed)?;
        tokio::task::block_in_place(|| staged.append(&piece))
            .map_err(|e| Refusal::File(path.to_owned(), "failed".to_owned(), e.to_string()))?;
        sha.update(&piece);
        if a["done"] == true {
            break;
        }
        if piece.is_empty() {
            return Err(crossed());
        }
    }
    let got: String = sha.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if got != hash {
        return Err(crossed());
    }
    let size = staged.len();
    Ok((staged, hash, size))
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
    tokio::task::block_in_place(|| {
        ctx.service.with_key(&s.key, move |ws| {
            let revision = planned_revision(ws, &p, planned.as_deref())?;
            ws.write_staged(&p, staged, revision.as_deref())?;
            Ok(())
        })
    })
    .map_err(|e| of_here(ctx, s, path, e))
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
    tokio::task::block_in_place(|| {
        ctx.service.with_key(&s.key, move |ws| {
            let revision = planned_revision(ws, &p, planned.as_deref())?;
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
    pub(super) remote: &'a remote::Remote,
    pub(super) reader: bool,
}

impl Side<'_> {
    /// One step carried out. `local` is the files here as the pass hashed
    /// them, kept in step with the pass's own renames: a step after a
    /// respelling finds the file under its new name.
    pub(super) async fn carry_out(
        &self,
        remote_files: &mut Files,
        local: &mut Files,
        state: &mut engine::State,
        action: &Action,
    ) -> Result<(), Refusal> {
        let Self {
            ctx,
            s,
            remote,
            reader,
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
                if reader {
                    return Err(reader_refusal(path));
                }
                let (hash, size, landed) = upload(ctx, s, remote, path, base.as_deref()).await?;
                // Under the spelling the server keeps for the name (spec
                // Q7), which may be this computer's in another form.
                remote_files.remove(&engine::spelled_there(remote_files, path));
                remote_files.insert(
                    landed,
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                );
                state.base.insert(path.clone(), hash);
                s.crossed(ctx, "sent", path, None);
            }
            Action::Download { path, .. } => {
                let (staged, hash, size) = download(ctx, s, remote, path).await?;
                write_here(ctx, s, path, staged, hash_here(local, path).as_deref())?;
                remote_files.insert(
                    engine::spelled_there(remote_files, path),
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                );
                state.base.insert(path.clone(), hash);
                s.crossed(ctx, "received", path, None);
            }
            Action::DeleteRemote { path, base } => {
                if reader {
                    return Err(reader_refusal(path));
                }
                remote
                    .call("sync_delete", json!({ "path": path, "base": base }))
                    .await
                    .map_err(|e| of_server(path, &e))?;
                remote_files.remove(&engine::spelled_there(remote_files, path));
                state.base.remove(path);
                s.crossed(ctx, "deleted_there", path, None);
            }
            Action::DeleteLocal { path } => {
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
                if reader {
                    return Err(reader_refusal(to));
                }
                let answer = remote
                    .call(
                        "sync_rename",
                        json!({ "from": from, "to": to, "base": base }),
                    )
                    .await
                    .map_err(|e| of_server(from, &e))?;
                if let Some(f) = remote_files.remove(&engine::spelled_there(remote_files, from)) {
                    let landed = answer["path"].as_str().unwrap_or(to).to_owned();
                    remote_files.insert(landed, f);
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
            }
            Action::Conflict { path, copy, .. } => {
                // The server's version first: it takes the name, or, when
                // both sides appended to a note, its tail joins this
                // computer's (item 8, decided 2026-10-11).
                let (mut staged, hash, size) = download(ctx, s, remote, path).await?;
                if !reader
                    && engine::merges_by_append(path)
                    && let Some(base) = state.base.get(path).cloned()
                    && let Some(planned) = hash_here(local, path)
                {
                    // A note: small, joined in memory.
                    let theirs =
                        tokio::task::block_in_place(|| staged.contents()).map_err(|e| {
                            Refusal::File(path.clone(), "failed".to_owned(), e.to_string())
                        })?;
                    if let Some(joined) = appended(ctx, s, path, &base, &planned, &theirs)? {
                        let there = FileState { hash, size };
                        return self
                            .join(remote_files, local, state, path, joined, there)
                            .await;
                    }
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
                remote_files.insert(
                    engine::spelled_there(remote_files, path),
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
                );
                state.base.insert(path.clone(), hash);
                s.crossed(ctx, "conflict", path, Some(copy));
                // …and the copy goes to the others (a reader keeps it here).
                if reader {
                    return Err(reader_refusal(copy));
                }
                let (hash, size, landed) = upload(ctx, s, remote, copy, None).await?;
                remote_files.insert(
                    landed,
                    FileState {
                        hash: hash.clone(),
                        size,
                    },
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
    async fn join(
        &self,
        remote_files: &mut Files,
        local: &mut Files,
        state: &mut engine::State,
        path: &str,
        joined: Vec<u8>,
        there: FileState,
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
        remote_files.insert(engine::spelled_there(remote_files, path), there);
        state.base.insert(path.to_owned(), base.clone());
        state.seen.remove(path);
        local.insert(path.to_owned(), here);
        s.crossed(ctx, "merged", path, None);
        let (hash, size, landed) = upload(ctx, s, remote, path, Some(&base)).await?;
        remote_files.remove(&engine::spelled_there(remote_files, path));
        remote_files.insert(
            landed,
            FileState {
                hash: hash.clone(),
                size,
            },
        );
        state.base.insert(path.to_owned(), hash);
        Ok(())
    }
}

/// This computer's note and the server's `theirs` joined, when each only
/// appended to the end of the `base` (item 8): read here as the pass
/// hashed it, `planned` — refused when it changed since (invariant 11).
/// `None`: any other change on both sides, a conflict's copy.
fn appended(
    ctx: &Ctx,
    s: &Syncer,
    path: &str,
    base: &str,
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
    Ok(engine::append_merge(base, &mine, theirs))
}
