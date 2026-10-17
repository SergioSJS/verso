// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A file's version history as the contract shows it (ADR 0091): listed,
//! a version read, brought back as a new write, copied beside the file,
//! deleted. Written once for both hosts where it can be: the computer
//! keeps its folders' histories in a store of its own (`verso_core::
//! history`), the server in one of its data directory, from its change
//! log; a host passes what the person may do ([`Policy`]) — who may do
//! what is the host's to check before it calls (item 6).

use verso_contract::{
    AuthorKind, ContractError, ErrorKind, HistoryListing, VersionAuthor, VersionEntry, VersionKind,
    VersionRestored, VersionText,
};
use verso_core::Workspace;
use verso_core::history::{self, Author, Kind, LOCAL, Listing, Version};

use crate::OpError;

/// The history's commands, by name: a window on a server's folder sends
/// them to the server, which checks the role for each.
pub const COMMANDS: &[&str] = &[
    "history_list",
    "history_read",
    "history_restore",
    "history_copy",
    "history_delete",
];

/// What the person may do with a folder's history, and its limits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Policy {
    /// Days versions are kept; 0: no limit.
    pub days: u32,
    pub can_delete: bool,
    /// The folder's quota, in bytes.
    pub quota: Option<u64>,
}

impl Policy {
    /// A folder of the computer: the person's own retention, everything
    /// allowed (on the computer the person is the owner).
    #[must_use]
    pub fn local(days: u32) -> Self {
        Self {
            days,
            can_delete: true,
            quota: None,
        }
    }
}

fn refused(message: &str) -> OpError {
    OpError::Contract(crate::refused(message))
}

fn not_found(message: &str) -> OpError {
    OpError::Contract(ContractError {
        kind: ErrorKind::NotFound,
        message: message.to_owned(),
    })
}

fn failed(e: impl std::fmt::Display) -> OpError {
    OpError::Contract(crate::failed(e.to_string()))
}

/// A version's author as the contract says it.
#[must_use]
pub fn author(a: &Author) -> VersionAuthor {
    let kind = match a.kind.as_str() {
        "account" => AuthorKind::Account,
        "device" => AuthorKind::Device,
        "agent" => AuthorKind::Agent,
        "computer" => AuthorKind::Computer,
        _ => AuthorKind::Outside,
    };
    VersionAuthor {
        kind,
        name: a.name.clone(),
    }
}

/// What made a version, as the contract says it.
#[must_use]
pub fn kind(k: Kind) -> VersionKind {
    match k {
        Kind::Write => VersionKind::Write,
        Kind::Edit => VersionKind::Edit,
        Kind::Room => VersionKind::Room,
        Kind::Restore => VersionKind::Restore,
        Kind::Outside => VersionKind::Outside,
        Kind::Found => VersionKind::Found,
    }
}

/// One version as the contract says it; `prefix` sets its id apart (the
/// computer's own, beside a server's).
#[must_use]
pub fn entry(v: &Version, prefix: &str, here_only: bool) -> VersionEntry {
    VersionEntry {
        id: format!("{prefix}{}", v.id),
        at: v.at as f64,
        authors: v.authors.iter().map(author).collect(),
        kind: kind(v.kind),
        size: v.size as f64,
        hash: v.hash.clone(),
        added: v.added,
        removed: v.removed,
        path: v.path.clone(),
        here_only,
    }
}

/// A file's history as the contract says it.
#[must_use]
pub fn listing(path: &str, l: &Listing, policy: Policy, size: u64, prefix: &str) -> HistoryListing {
    HistoryListing {
        path: path.to_owned(),
        versions: l.versions.iter().map(|v| entry(v, prefix, false)).collect(),
        gone: l.gone.map(|g| g as f64),
        can_delete: policy.can_delete,
        days: policy.days,
        size: size as f64,
        quota: policy.quota.map(|q| q as f64),
        early: policy.quota.is_some_and(|q| size > q),
        partial: None,
    }
}

/// The number in an id the window sent back: refused when it is not one
/// this host gave.
pub fn id_of(id: &str, prefix: &str) -> Result<i64, OpError> {
    id.strip_prefix(prefix)
        .and_then(|n| n.parse().ok())
        .ok_or_else(|| refused("not a version of this history"))
}

/// A version's text: none when its bytes are not UTF-8.
#[must_use]
pub fn text(id: &str, bytes: Vec<u8>) -> VersionText {
    let size = bytes.len() as f64;
    VersionText {
        id: id.to_owned(),
        text: String::from_utf8(bytes).ok(),
        size,
    }
}

/// Whether `stamp` is a time the window may name a copy with:
/// `yyyy-mm-dd hhhmm`, digits where digits go.
fn is_stamp(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 16
        && b.iter().enumerate().all(|(i, c)| match i {
            4 | 7 => *c == b'-',
            10 => *c == b' ',
            13 => *c == b'h',
            _ => c.is_ascii_digit(),
        })
}

/// The name of a version copied beside its file (item 5, "Copy as a new
/// note"): `<name> (versão <stamp>)<ext>` in the person's language, ` 2`,
/// ` 3`… when that is taken — characters every OS keeps (ADR 0070 item 3).
pub fn copy_name(path: &str, stamp: &str, pt: bool, n: usize) -> Result<String, OpError> {
    if !is_stamp(stamp) {
        return Err(refused("a version's time is yyyy-mm-dd hhhmm"));
    }
    let (parent, name) = path.rsplit_once('/').unwrap_or(("", path));
    let (stem, ext) = match name.rfind('.') {
        Some(at) if at > 0 => (&name[..at], &name[at..]),
        _ => (name, ""),
    };
    let word = if pt { "versão" } else { "version" };
    let more = if n > 1 {
        format!(" {n}")
    } else {
        String::new()
    };
    let file = format!("{stem} ({word} {stamp}{more}){ext}");
    Ok(if parent.is_empty() {
        file
    } else {
        format!("{parent}/{file}")
    })
}

/// Write `bytes` beside `path` under [`copy_name`]: the first name free.
pub fn copy_beside(
    ws: &mut Workspace,
    path: &str,
    bytes: &[u8],
    stamp: &str,
    pt: bool,
) -> Result<VersionRestored, OpError> {
    for n in 1..=50 {
        let to = copy_name(path, stamp, pt, n)?;
        match ws.write_bytes(&to, bytes, None) {
            Ok(revision) => return Ok(VersionRestored { path: to, revision }),
            Err(verso_core::CoreError::Write(verso_core::WriteError::Exists)) => {}
            Err(e) => return Err(e.into()),
        }
    }
    Err(refused(
        "fifty copies of this version stand beside the file already",
    ))
}

/// The computer's store of the open folder: refused when it keeps none.
fn store(ws: &mut Workspace) -> Result<&mut history::Store, OpError> {
    ws.history_store()
        .ok_or_else(|| refused("this folder keeps no history on this computer"))
}

/// The computer's own history of `path`, the prefix of its ids
/// (`computer`'s versions beside a server's).
pub fn list_local(
    ws: &mut Workspace,
    path: &str,
    policy: Policy,
    prefix: &str,
) -> Result<HistoryListing, OpError> {
    let path = ws.confined(path)?;
    let s = store(ws)?;
    let l = s.versions(LOCAL, &path).map_err(failed)?;
    let (_, size) = s.size(LOCAL).map_err(failed)?;
    Ok(listing(&path, &l, policy, size, prefix))
}

/// The bytes of the computer's version `id` of `path`: refused when it is
/// not one of that file's.
pub fn bytes_local(ws: &mut Workspace, path: &str, id: i64) -> Result<Vec<u8>, OpError> {
    let path = ws.confined(path)?;
    let s = store(ws)?;
    let l = s.versions(LOCAL, &path).map_err(failed)?;
    if !l.versions.iter().any(|v| v.id == id) {
        return Err(not_found("no such version of this file"));
    }
    let (_, bytes) = s
        .read(LOCAL, id)
        .map_err(failed)?
        .ok_or_else(|| not_found("no such version of this file"))?;
    Ok(bytes)
}

/// Bring a version's `bytes` back at `path` (item 5): a new write over the
/// revision the window read — refused, nothing written, when the file
/// changed since (invariant 11) — or, the file gone, as a new file.
pub fn restore(
    ws: &mut Workspace,
    path: &str,
    bytes: &[u8],
    revision: Option<&str>,
) -> Result<VersionRestored, OpError> {
    let path = ws.confined(path)?;
    let revision = ws.restore_bytes(&path, bytes, revision)?;
    Ok(VersionRestored { path, revision })
}

/// Delete the computer's version `id` of `path`.
pub fn delete_local(
    ws: &mut Workspace,
    path: &str,
    id: i64,
    policy: Policy,
) -> Result<HistoryListing, OpError> {
    let confined = ws.confined(path)?;
    bytes_local(ws, &confined, id)?;
    store(ws)?.delete(LOCAL, id).map_err(failed)?;
    list_local(ws, &confined, policy, "")
}

/// Thin the computer's history of the open folder now (item 3).
pub fn thin_local(ws: &mut Workspace, days: u32) -> Result<history::Thinned, OpError> {
    let now = history::now_ms();
    store(ws)?.thin(LOCAL, now, days, None).map_err(failed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_copy_is_named_beside_its_file_in_the_persons_language() {
        assert_eq!(
            copy_name("a/Nota.md", "2026-10-14 15h04", true, 1).unwrap(),
            "a/Nota (versão 2026-10-14 15h04).md"
        );
        assert_eq!(
            copy_name("Quadro.canvas", "2026-10-14 15h04", false, 2).unwrap(),
            "Quadro (version 2026-10-14 15h04 2).canvas"
        );
        assert!(copy_name("n.md", "../x", true, 1).is_err());
        assert!(copy_name("n.md", "2026-10-14 15:04", true, 1).is_err());
    }
}
