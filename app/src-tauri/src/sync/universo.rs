// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The UniVerso as a remote of sync (ADR 0104 item 3): the device's
//! connection to a server, speaking the sync commands of ADR 0079
//! (`sync_state`, `sync_changes`, `sync_read`, `sync_put`, `sync_delete`,
//! `sync_rename`) behind the same trait a cloud's adapter implements, so
//! that a pass does not know which it syncs with. Its versions are the
//! files' hashes: the server takes a write against the hash it replaces.

use std::future::Future;
use std::sync::Arc;

use serde_json::{Value, json};
use verso_contract::ErrorKind;
use verso_core::sync::remote::{
    Change, Condition, Entry, Listing, Meta, Read, Remote, RemoteError, RemoteErrorKind, Result,
    Rights, Sink, Source, Written,
};

use crate::remote::Remote as Socket;

/// The device's connection to a server's folder, as a remote.
pub(crate) struct Universo {
    socket: Arc<Socket>,
}

impl Universo {
    pub(crate) fn new(socket: Arc<Socket>) -> Self {
        Self { socket }
    }

    /// A question to the server, waited for where blocking is allowed: the
    /// connection's task runs on the app's runtime, this thread waits.
    fn ask(
        &self,
        cmd: &str,
        args: Value,
        piece: Option<Vec<u8>>,
    ) -> Result<(Value, Option<Vec<u8>>)> {
        let (socket, cmd) = (Arc::clone(&self.socket), cmd.to_owned());
        wait(async move { socket.call_with(&cmd, args, piece).await })
            .ok_or_else(|| RemoteError::new(RemoteErrorKind::Unreachable, "the app is closing"))?
            .map_err(|e| wire(&e))
    }
}

/// Run `future` on the app's runtime and wait for its output on this
/// thread, which the pass has made free to block (`block_in_place`).
fn wait<T: Send + 'static>(future: impl Future<Output = T> + Send + 'static) -> Option<T> {
    let (tx, rx) = std::sync::mpsc::channel();
    tauri::async_runtime::spawn(async move {
        let _ = tx.send(future.await);
    });
    // The task ends by sending, or by being dropped with the runtime.
    rx.recv().ok()
}

/// A server's error answer as a remote's: the kind it can act on, with the
/// contract's own kind kept in `detail` so the host can say it again.
pub(crate) fn wire(e: &Value) -> RemoteError {
    let transport = e["transport"] == true;
    let kind_name = e["kind"].as_str().unwrap_or("failed").to_owned();
    let message = e["message"]
        .as_str()
        .unwrap_or("the server refused")
        .to_owned();
    let kind = match serde_json::from_value::<ErrorKind>(json!(kind_name)) {
        Ok(ErrorKind::Unavailable) if transport => RemoteErrorKind::Unreachable,
        Ok(ErrorKind::Unavailable) => RemoteErrorKind::Unavailable,
        Ok(ErrorKind::Changed) => RemoteErrorKind::Changed,
        Ok(ErrorKind::Exists) => RemoteErrorKind::Exists,
        Ok(ErrorKind::Quota) => RemoteErrorKind::Quota,
        Ok(ErrorKind::CaseTwin) => RemoteErrorKind::CaseTwin,
        Ok(ErrorKind::NotFound) => RemoteErrorKind::NotFound,
        _ => RemoteErrorKind::Failed,
    };
    RemoteError::new(kind, message).detailed(kind_name)
}

pub(super) fn entry(c: &Value, path: &str, hash: &str) -> Entry {
    let said = |f: &str| c[f].as_str().map(str::to_owned);
    Entry {
        path: path.to_owned(),
        version: hash.to_owned(),
        hash: Some(hash.to_owned()),
        size: c["size"].as_u64().unwrap_or(0),
        by: said("by"),
        device: said("device"),
    }
}

impl Remote for Universo {
    /// All the files on the connection's first pass, then the changes
    /// after the last head. The log answers a page at a time: with more to
    /// come, the next question asks from the last change received, and
    /// only the last page's answer moves the cursor to the server's head —
    /// a head taken from an earlier page would skip the pages between.
    fn list(&self, after: Option<&str>) -> Result<Listing> {
        let Some(after) = after else {
            let (answer, _) = self.ask("sync_state", json!({}), None)?;
            let changes = answer["files"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|f| {
                    let (path, hash) = (f["path"].as_str()?, f["hash"].as_str()?);
                    Some(Change::Present(entry(f, path, hash)))
                })
                .collect();
            return Ok(Listing {
                full: true,
                changes,
                cursor: Some(answer["head"].as_i64().unwrap_or(0).to_string()),
            });
        };
        let mut head: i64 = after.parse().unwrap_or(0);
        let mut changes = Vec::new();
        loop {
            let asked = head;
            let (answer, _) = self.ask("sync_changes", json!({ "since": asked }), None)?;
            for c in answer["changes"].as_array().into_iter().flatten() {
                let Some(path) = c["path"].as_str() else {
                    continue;
                };
                match c["hash"].as_str() {
                    Some(hash) if c["deleted"] != true => {
                        let present = entry(c, path, hash);
                        changes.push(match c["renamedFrom"].as_str() {
                            Some(from) => Change::Renamed {
                                from: from.to_owned(),
                                entry: present,
                            },
                            None => Change::Present(present),
                        });
                    }
                    _ => {
                        let gone = |p: &str| Change::Gone {
                            path: p.to_owned(),
                            by: c["by"].as_str().map(str::to_owned),
                            device: c["device"].as_str().map(str::to_owned),
                        };
                        if let Some(from) = c["renamedFrom"].as_str() {
                            changes.push(gone(from));
                        }
                        changes.push(gone(path));
                    }
                }
                head = head.max(c["seq"].as_i64().unwrap_or(0));
            }
            if answer["more"] != true {
                head = head.max(answer["head"].as_i64().unwrap_or(0));
                break;
            }
            // A page that says there is more but moved nothing on would
            // ask the same question for ever: the rest waits for the next
            // pass.
            if head == asked {
                break;
            }
        }
        Ok(Listing {
            full: false,
            changes,
            cursor: Some(head.to_string()),
        })
    }

    fn read(&self, path: &str, sink: &mut dyn Sink) -> Result<Read> {
        let changed = || RemoteError::new(RemoteErrorKind::Changed, "changed while it crossed");
        let mut offset = 0_u64;
        let mut hash = None;
        loop {
            let (a, piece) =
                self.ask("sync_read", json!({ "path": path, "offset": offset }), None)?;
            if let Some(h) = a["hash"].as_str() {
                hash = Some(h.to_owned());
            }
            let piece = piece.ok_or_else(changed)?;
            sink.put(&piece)?;
            offset += piece.len() as u64;
            if a["done"] == true {
                break;
            }
            if piece.is_empty() {
                return Err(changed());
            }
        }
        Ok(Read {
            version: hash.clone().unwrap_or_default(),
            hash,
            size: offset,
        })
    }

    fn write(
        &self,
        path: &str,
        condition: &Condition,
        meta: &Meta,
        source: &mut dyn Source,
    ) -> Result<Written> {
        let changed = || RemoteError::new(RemoteErrorKind::Changed, "changed while it crossed");
        let base = match condition {
            Condition::Absent => None,
            Condition::Version(v) => Some(v.as_str()),
        };
        let mut offset = 0_u64;
        let mut first = true;
        loop {
            // A file with no bytes still crosses once, empty.
            let piece = match source.next()? {
                Some(p) => p,
                None if first => Vec::new(),
                None => return Err(changed()),
            };
            first = false;
            let end = offset + piece.len() as u64;
            let (answer, _) = self.ask(
                "sync_put",
                json!({
                    "path": path,
                    "offset": offset,
                    "size": meta.size,
                    "hash": meta.hash,
                    "base": base,
                }),
                Some(piece),
            )?;
            if answer["done"] == true {
                return Ok(Written {
                    path: answer["path"].as_str().unwrap_or(path).to_owned(),
                    version: meta.hash.clone(),
                });
            }
            if end >= meta.size {
                return Err(changed());
            }
            offset = end;
        }
    }

    fn delete(&self, path: &str, condition: &Condition) -> Result<()> {
        let Condition::Version(base) = condition else {
            return Err(RemoteError::new(
                RemoteErrorKind::Failed,
                "a deletion names the version it deletes",
            ));
        };
        self.ask("sync_delete", json!({ "path": path, "base": base }), None)
            .map(|_| ())
    }

    fn rename(&self, from: &str, to: &str, condition: &Condition) -> Result<Written> {
        let Condition::Version(base) = condition else {
            return Err(RemoteError::new(
                RemoteErrorKind::Failed,
                "a rename names the version it moves",
            ));
        };
        let (answer, _) = self.ask(
            "sync_rename",
            json!({ "from": from, "to": to, "base": base }),
            None,
        )?;
        Ok(Written {
            path: answer["path"].as_str().unwrap_or(to).to_owned(),
            version: base.clone(),
        })
    }

    /// `access_get` with `brief`: what the server's one judgement says this
    /// device may do with each path, 500 at a time. A server that does not
    /// know `brief` answers whole `AccessInfo`s (or refuses a folder with
    /// no table): then it has no answer, and the role decides.
    fn rights(&self, paths: &[String]) -> Result<Option<Vec<(String, Rights)>>> {
        let mut out = Vec::with_capacity(paths.len());
        for chunk in paths.chunks(MOST) {
            let (answer, _) =
                match self.ask("access_get", json!({ "paths": chunk, "brief": true }), None) {
                    Ok(a) => a,
                    // An old server's folder with no table refuses it: the role
                    // decides. Anything else (a connection lost, a server busy)
                    // is the pass's error, and the last memo stands.
                    Err(e) if e.message.contains("not inside a table") => return Ok(None),
                    // A computer at home asks a paired phone nothing of the
                    // access (ADR 0117: no access dialog on a phone): its
                    // role decides, and the computer judges each change.
                    Err(e) if e.detail.as_deref() == Some("not_on_phone") => return Ok(None),
                    Err(e) => return Err(e),
                };
            let Some(list) = answer.as_array() else {
                return Ok(None);
            };
            for r in list {
                let (Some(path), true) = (r["path"].as_str(), r.get("put").is_some()) else {
                    return Ok(None);
                };
                let yes = |k: &str| r[k] == true;
                out.push((
                    path.to_owned(),
                    Rights {
                        see: yes("see"),
                        put: yes("put"),
                        delete: yes("delete"),
                        rename: yes("rename"),
                    },
                ));
            }
        }
        Ok(Some(out))
    }
}

/// How many paths `access_get` is asked about at once (the server's limit).
pub(crate) const MOST: usize = 500;
