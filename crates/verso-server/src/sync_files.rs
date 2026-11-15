// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A device's reads and puts of a file's pieces (split from `sync.rs` by
//! ADR 0067).

use super::*;

/// A piece of the file a device reads, from the disk: the answer and the
/// piece's bytes. The first piece says the file's hash, which the device
/// checks once it holds the whole (item 12); a file that changes on the
/// disk while it is read is refused as changed, and the device's next
/// pass reads it again.
pub(super) fn read(
    server: &Server,
    client: &str,
    (folder, key): (&str, &str),
    args: &Value,
    inside: Inside<'_>,
) -> Result<(Value, Vec<u8>), ContractError> {
    let path: String = arg(args, "path")?;
    let offset: u64 = arg(args, "offset")?;
    let place = (client.to_owned(), path.clone());
    let kept = {
        let mut down = lock(&server.transfers.down);
        down.retain(|_, r| r.at.elapsed() < IDLE);
        if offset == 0 {
            down.remove(&place);
        }
        down.get(&place).map(|r| (r.path.clone(), r.file.clone()))
    };
    let (p, file) = match kept {
        Some(kept) => kept,
        None => identify(server, (folder, key), &path, inside)?,
    };
    let at = p.clone();
    let read = server
        .service
        .with_key(key, move |ws| Ok(ws.read_piece(&at, offset, PIECE)?));
    let (bytes, mark) = match read {
        Ok(read) => read,
        Err(e) => {
            lock(&server.transfers.down).remove(&place);
            server.transfers.prune();
            return Err(e);
        }
    };
    if mark != file.mark {
        // Changed on the disk since this reading began: what was sent is
        // of another file, and the device starts again.
        lock(&server.transfers.down).remove(&place);
        server.transfers.prune();
        return Err(changed("changed while it crossed"));
    }
    let size = file.mark.len;
    let done = offset.saturating_add(bytes.len() as u64) >= size;
    let hash = (offset == 0).then(|| file.hash.clone());
    {
        let mut down = lock(&server.transfers.down);
        if done {
            down.remove(&place);
        } else {
            if !down.contains_key(&place) {
                room(&mut down, client, |r| r.at);
            }
            down.insert(
                place,
                Reading {
                    folder: folder.to_owned(),
                    path: p,
                    file,
                    at: Instant::now(),
                },
            );
        }
    }
    if done {
        server.transfers.prune();
    }
    Ok((json!({ "size": size, "done": done, "hash": hash }), bytes))
}

/// The file at `path` a device starts to read, as the server keeps its
/// name, and what it is: its length and time, and its hash — the one
/// another client's reading of it found while the file is unchanged on
/// the disk, else hashed a piece at a time, once the listing's size and
/// the disk's say the file is not larger than sync carries.
pub(super) fn identify(
    server: &Server,
    (folder, key): (&str, &str),
    path: &str,
    inside: Inside<'_>,
) -> Result<(String, Being), ContractError> {
    let (p, _) = as_kept(server, folder, path, inside)?;
    let at = p.clone();
    let mark = server.service.with_key(key, move |ws| {
        let listed = ws
            .entries()
            .iter()
            .chain(ws.settings_entries())
            .find(|e| e.path == at)
            .map(|e| e.len);
        if listed.is_some_and(|len| len > LARGEST) {
            return Err(too_large().into());
        }
        // Its length and time alone: nothing of it is read.
        Ok(ws.read_piece(&at, 0, 0)?.1)
    })?;
    if mark.len > LARGEST {
        return Err(too_large());
    }
    let place = (folder.to_owned(), p.clone());
    if let Some(known) = lock(&server.transfers.files).get(&place)
        && known.mark == mark
    {
        return Ok((p, known.clone()));
    }
    let at = p.clone();
    let read = server
        .service
        .with_key(key, move |ws| Ok(ws.hash_with_revision(&at)?))?;
    if read.len > LARGEST {
        return Err(too_large());
    }
    let being = Being {
        mark: read.mark,
        hash: read.hash,
    };
    lock(&server.transfers.files).insert(place, being.clone());
    Ok((p, being))
}

/// A piece a device sends: its bytes, from a binary message (sync 2) or
/// from the request's base64 (sync 1).
pub(crate) fn piece_of(args: &mut Value, data: Option<Bytes>) -> Result<Bytes, ContractError> {
    if let Some(data) = data {
        return Ok(data);
    }
    // Taken out of the request, not copied.
    let Some(Value::String(text)) = args.get_mut("data").map(Value::take) else {
        return Err(refused("data: a string of base64"));
    };
    base64::engine::general_purpose::STANDARD
        .decode(text.as_bytes())
        .map(Bytes::from)
        .map_err(|_| refused("data: not base64"))
}

/// A piece of a file a device sends, written to the disk as it arrives —
/// to a temporary file beside where the file lands, never the file whole
/// in memory — and, with the last, the file checked against its hash and
/// put in place atomically over the file `base` names, or as a new one
/// (invariants 9 and 11). A piece out of order, or a hash that does not
/// match, drops the transfer and its temporary file: the device sends the
/// file again.
pub(super) fn put(
    server: &Arc<Server>,
    client: &str,
    (folder, key): (&str, &str),
    by: Author<'_>,
    (replacer, said): (&str, &str),
    (mut args, inside): (Value, Inside<'_>),
    data: Option<Bytes>,
) -> Result<Value, ContractError> {
    let path: String = arg(&args, "path")?;
    let offset: u64 = arg(&args, "offset")?;
    let size: u64 = arg(&args, "size")?;
    let hash: String = arg(&args, "hash")?;
    let base: Option<String> = arg(&args, "base")?;
    let piece = piece_of(&mut args, data)?;
    drop(args);
    if size > LARGEST {
        return Err(too_large());
    }
    let place = (client.to_owned(), path.clone());
    let upload = if offset == 0 {
        // A transfer starts: refused now when the folder has no room for
        // it, rather than after its last piece; its temporary file beside
        // where it will land.
        let (p, _) = as_kept(server, folder, &path, inside)?;
        let hold = crate::quota::reserve(server, key, &p, size)?;
        let staged = server.service.with_key(key, move |ws| Ok(ws.stage(&p)?))?;
        let upload = Arc::new(Mutex::new(Upload {
            staged: Some(staged),
            sha: Sha256::new(),
            written: 0,
            size,
            hash: hash.clone(),
            base: base.clone(),
            hold,
        }));
        let mut up = lock(&server.transfers.up);
        up.retain(|_, (_, at)| at.elapsed() < IDLE);
        up.remove(&place);
        room(&mut up, client, |(_, at)| *at);
        up.insert(place.clone(), (Arc::clone(&upload), Instant::now()));
        upload
    } else {
        let mut up = lock(&server.transfers.up);
        up.retain(|_, (_, at)| at.elapsed() < IDLE);
        let (upload, at) = up
            .get_mut(&place)
            .ok_or_else(|| refused("no transfer of this file: start again"))?;
        *at = Instant::now();
        Arc::clone(upload)
    };
    // The transfer's own lock, not the map's: a piece written to the disk
    // holds no other device's transfer.
    let drop_it = || {
        let mut up = lock(&server.transfers.up);
        if up.get(&place).is_some_and(|(u, _)| Arc::ptr_eq(u, &upload)) {
            up.remove(&place);
        }
    };
    let complete = {
        let mut u = lock(&upload);
        if u.written != offset
            || u.hash != hash
            || u.size != size
            || u.base != base
            || offset.saturating_add(piece.len() as u64) > size
        {
            drop(u);
            drop_it();
            return Err(refused("a piece out of order: start again"));
        }
        let Some(staged) = u.staged.as_mut() else {
            drop(u);
            drop_it();
            return Err(refused("no transfer of this file: start again"));
        };
        if let Err(e) = staged.append(&piece) {
            drop(u);
            drop_it();
            return Err(verso_service::failed(format!(
                "a piece could not be written: {e}"
            )));
        }
        u.sha.update(&piece);
        u.written += piece.len() as u64;
        if u.written < size {
            None
        } else {
            let sha = std::mem::take(&mut u.sha);
            let hold = u.hold.take();
            u.staged.take().map(|staged| (staged, sha, hold))
        }
    };
    drop(piece);
    let Some((staged, sha, hold)) = complete else {
        return Ok(json!({ "done": false }));
    };
    drop_it();
    if hex(&sha.finalize()) != hash {
        // `staged` goes, and its temporary file with it.
        return Err(refused("the file arrived damaged: its hash does not match"));
    }
    let one = one_at_a_time(server, folder);
    let only = lock(&one);
    let (path, other) = as_kept(server, folder, &path, inside)?;
    crate::quota::check_holding(server, key, &path, size, hold.as_ref())?;
    let p = path.clone();
    let new_hash = hash.clone();
    let (head, landed) = {
        let (landed, quick, kept) = server.service.with_key(key, move |ws| {
            // New, under the other form of a name a file holds: taken.
            if other && base.is_none() && now(ws, &p)?.is_some() {
                return Err(form_taken());
            }
            let revision = is_now(ws, &p, base.as_deref())?;
            // The version this write replaces goes to the bin first, when
            // its bytes differ (ADR 0080 item 12): an outside program's
            // stale save, carried here by sync, can be undone (F18).
            let kept = match &base {
                Some(old) if *old != new_hash => match ws.keep_replaced(&p) {
                    Ok(kept) => Some(kept),
                    Err(e) => {
                        crate::log::warn(&format!(
                            "sync: the version of {p} a write by {said} replaces was not kept: {e}"
                        ));
                        None
                    }
                },
                _ => None,
            };
            let written = ws.write_staged(&p, staged, revision.as_deref())?;
            // The written file's own time: the next walk skips it.
            let quick = quick_of(&written, size).unwrap_or_else(|| format!("{size}:0"));
            Ok((on_disk(ws, &p), quick, kept))
        })?;
        if let Some(kept) = &kept {
            crate::trash::replaced(server, folder, kept, &path, replacer);
        }
        let head = reconcile_paths(
            server,
            folder,
            key,
            by,
            &[(
                path.clone(),
                Now::Written(hash.clone(), i64::try_from(size).unwrap_or(i64::MAX), quick),
            )],
        )?;
        (head, landed)
    };
    // Landed and counted in the folder's record: its room given back.
    drop((only, hold));
    told(server, key, std::slice::from_ref(&landed), &[], &[]);
    // Where it landed: the spelling the server keeps for the name — in
    // another case too, where the disk folds names ([`as_spelled`]): a
    // device's picture of the server then keeps one entry for the file.
    Ok(json!({ "done": true, "head": head, "path": landed }))
}

/// The spelling the disk keeps for the file just written at `path`: where
/// the file system folds names, a write through another case reached the
/// file kept under its own spelling, which it kept. The disk says how; the
/// listing, as of the last walk, only where the disk cannot.
pub(super) fn on_disk(ws: &Workspace, path: &str) -> String {
    if !verso_core::sync::FOLDS_NAMES {
        return path.to_owned();
    }
    if let Some(kept) = ws.spelled_on_disk(path) {
        return kept;
    }
    let entries = ws.entries();
    if entries.iter().any(|e| e.path == path) {
        return path.to_owned();
    }
    let name = verso_core::sync::folded(path);
    entries
        .iter()
        .find(|e| one_name(path, &name, &e.path))
        .map_or_else(|| path.to_owned(), |e| e.path.clone())
}
