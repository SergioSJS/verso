// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The remote of a sync (ADR 0104 item 3): the other side of a folder's
//! sync, whatever it is — a UniVerso (ADR 0079) or a cloud the person
//! already has (WebDAV, S3). A trait, and nothing else: no network, no
//! disk, no async runtime. The engine ([`super::plan`]) plans against the
//! picture of the remote this module builds; the desktop host carries the
//! plan out through an implementation of [`Remote`] and `verso-fs`.
//!
//! A remote tells each of its files by an opaque **version**: the token a
//! write is made conditional on (a WebDAV or S3 ETag; for a UniVerso, the
//! file's hash). A write names the version it replaces ([`Condition`]) and
//! is refused with [`RemoteErrorKind::Changed`] when the file is another
//! now — so that no remote ever overwrites a version nobody has seen (the
//! ADR's item 7, invariant 11). Where a service cannot say so, it is not a
//! remote at all: the adapter refuses to connect.
//!
//! The engine compares files by the SHA-256 of their bytes. A cloud knows
//! its versions, not those hashes: [`refresh`] asks the remote for a hash
//! ([`Remote::fingerprint`]) only for a file whose version it has not seen
//! before, and the state keeps what it learned ([`Token`]). A file that is
//! only there and was never seen — nothing here by its name, no base — is
//! not read for its hash at all when reading it is a download
//! ([`refresh_planning`]): the plan fetches it, and the download hashes it
//! as it is written, so a first sync reads each such file once.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{FileState, Files};

/// Why a remote could not do what was asked, by what the host can do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoteErrorKind {
    /// The file there is not the version the write was conditional on
    /// (HTTP 412, or a UniVerso's `changed`): read again, plan again.
    Changed,
    /// No such file there.
    NotFound,
    /// The service asked to slow down (HTTP 429, 503): after this many
    /// seconds when it said how long, otherwise the host's backoff.
    RateLimited(Option<u64>),
    /// The service cannot keep the promise that no version is lost: it
    /// does not honour the precondition, or gives no strong version. Not
    /// connected, and why.
    Refused,
    /// No answer: the network, the host, a certificate. The pass ends and
    /// the host tries again with a growing wait.
    Unreachable,
    /// A new name is taken there.
    Exists,
    /// A new name differs there only in case from another (spec Q8).
    CaseTwin,
    /// The service would not keep a file by this name; the message says
    /// why.
    NameInvalid,
    /// The remote's storage is full, or the folder's quota passed.
    Quota,
    /// This file is not readable there now.
    Unavailable,
    /// The cursor the remote gave before is no longer good (a feed that
    /// forgot it): a full comparison from the bases follows.
    CursorLost,
    /// The host's own side of a transfer failed (reading a piece from the
    /// disk, writing one): the host knows why.
    Local,
    /// Anything else the remote refused.
    Failed,
}

/// A remote's error: its kind, what to say, and, for an adapter that
/// carries another error's kind through (the UniVerso's contract errors),
/// that kind's name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteError {
    pub kind: RemoteErrorKind,
    pub message: String,
    /// The adapter's own name for the error, when the host needs to turn
    /// it back into what it was (the UniVerso's `ErrorKind`).
    pub detail: Option<String>,
}

impl RemoteError {
    #[must_use]
    pub fn new(kind: RemoteErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            detail: None,
        }
    }

    #[must_use]
    pub fn detailed(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

impl std::fmt::Display for RemoteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for RemoteError {}

pub type Result<T> = std::result::Result<T, RemoteError>;

/// A file as the remote lists it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub path: String,
    /// The version token a write to this file is conditional on.
    pub version: String,
    /// The SHA-256 of its bytes, when the listing says (a UniVerso's
    /// does); a cloud's does not, and [`refresh`] finds it.
    pub hash: Option<String>,
    pub size: u64,
    /// Who made it, when the remote says (a UniVerso's log): the person's
    /// name and the device's.
    pub by: Option<String>,
    pub device: Option<String>,
}

/// One change to the remote's files since a cursor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Change {
    /// A file is there, new or changed.
    Present(Entry),
    /// A file is gone; who deleted it, when the remote says.
    Gone {
        path: String,
        by: Option<String>,
        device: Option<String>,
    },
    /// A file moved: `from` is gone, the entry is there.
    Renamed { from: String, entry: Entry },
}

/// Who made a change there, as the remote's log says (a UniVerso's).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Who {
    pub path: String,
    pub by: Option<String>,
    pub device: Option<String>,
}

/// What a remote answers to "what is there": every file (`full`), or the
/// changes after the cursor asked from.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Listing {
    /// The changes are the whole picture: what is not among them is not
    /// there. A remote with no change feed (WebDAV, S3) always answers so.
    pub full: bool,
    pub changes: Vec<Change>,
    /// Where the remote's feed is now; ask from here next time. None: no
    /// feed.
    pub cursor: Option<String>,
}

/// What a write is conditional on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Condition {
    /// The path must not exist there (`If-None-Match: *`).
    Absent,
    /// The file there must still be this version (`If-Match`).
    Version(String),
}

/// What a write sends besides the bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Meta {
    pub size: u64,
    /// The SHA-256 of the bytes, which the remote may keep with the file
    /// (S3's metadata) so that another device need not read it to know it.
    pub hash: String,
}

/// Where a write's bytes come from: the file on this computer, a piece at
/// a time, never whole in memory (ADR 0079 item 12). The host implements
/// it over `verso-fs`; the remote never touches a disk.
pub trait Source: Send {
    /// The next piece; `None` after the last.
    ///
    /// # Errors
    /// [`RemoteErrorKind::Local`] when the file cannot be read, or is not
    /// the one that was hashed.
    fn next(&mut self) -> Result<Option<Vec<u8>>>;
    /// Start again from the first byte (a retry after a 429 or 503).
    ///
    /// # Errors
    /// As [`Source::next`].
    fn rewind(&mut self) -> Result<()>;
}

/// Where a read's bytes go: a staged file beside where it lands. A remote
/// hands bytes over only once it has an answer to keep, so that a retry
/// (a 429 before the body) never has to take back what was put.
pub trait Sink {
    /// One more piece, in order.
    ///
    /// # Errors
    /// [`RemoteErrorKind::Local`] when it cannot be kept.
    fn put(&mut self, piece: &[u8]) -> Result<()>;
}

/// What a write left there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Written {
    /// The path it landed at — the spelling the remote keeps for the name
    /// (spec Q7).
    pub path: String,
    /// The version the file has now.
    pub version: String,
}

/// What a read found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Read {
    /// The version read.
    pub version: String,
    /// The hash the remote says the bytes have, when it says.
    pub hash: Option<String>,
    pub size: u64,
}

/// The other side of a folder's sync. Methods block: the host calls them
/// where blocking is allowed. One value per connection.
pub trait Remote: Send + Sync {
    /// Every file, or the changes after `after` (the cursor a listing
    /// gave).
    ///
    /// # Errors
    /// [`RemoteErrorKind::CursorLost`] when `after` is no longer good.
    fn list(&self, after: Option<&str>) -> Result<Listing>;

    /// The SHA-256 of the file's bytes, with its version. The default
    /// reads it and hashes what arrives.
    ///
    /// # Errors
    /// [`RemoteErrorKind::NotFound`] when it is gone.
    fn fingerprint(&self, path: &str) -> Result<(String, String)> {
        let mut sink = HashingSink::default();
        let read = self.read(path, &mut sink)?;
        Ok((read.version, sink.finish()))
    }

    /// Whether [`Remote::fingerprint`] reads the whole file to hash it, as
    /// the default does (WebDAV). Then a file that is only there and never
    /// seen is not fingerprinted before a first sync fetches it: the
    /// download reads it once and hashes it as it is written
    /// ([`refresh_planning`]). A remote whose fingerprint is its metadata
    /// (S3's `HEAD` with the hash kept on upload) says no and is asked as
    /// before.
    fn fingerprint_reads_the_file(&self) -> bool {
        true
    }

    /// Whether the file is there. Asked before a deletion here that a
    /// listing alone asks for: a listing that lags behind a write (a
    /// service that is not strongly consistent) must not delete a file the
    /// remote has. The default reads and hashes it; a cloud's adapter
    /// asks for its metadata only.
    ///
    /// # Errors
    /// Whatever the remote failed with, other than the file being gone.
    fn exists(&self, path: &str) -> Result<bool> {
        match self.fingerprint(path) {
            Ok(_) => Ok(true),
            Err(e) if e.kind == RemoteErrorKind::NotFound => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// The file's bytes into `sink`, in order. The remote verifies what it
    /// can (size, its own checksum) before it says it is read.
    ///
    /// # Errors
    /// [`RemoteErrorKind::NotFound`] when it is gone.
    fn read(&self, path: &str, sink: &mut dyn Sink) -> Result<Read>;

    /// Write the file at `path` from `source`, only if `condition` holds.
    ///
    /// # Errors
    /// [`RemoteErrorKind::Changed`] when it does not.
    fn write(
        &self,
        path: &str,
        condition: &Condition,
        meta: &Meta,
        source: &mut dyn Source,
    ) -> Result<Written>;

    /// Delete the file, only if it is still the version in `condition`.
    ///
    /// # Errors
    /// [`RemoteErrorKind::Changed`] when it is another now.
    fn delete(&self, path: &str, condition: &Condition) -> Result<()>;

    /// Move the file `from` to `to`, only if `from` is still the version
    /// in `condition` and `to` is free.
    ///
    /// # Errors
    /// [`RemoteErrorKind::Changed`], or [`RemoteErrorKind::Exists`].
    fn rename(&self, from: &str, to: &str, condition: &Condition) -> Result<Written>;

    /// What this device may do with each of `paths` on the remote, as the
    /// remote judges its own changes (ADR 0113 S8); `None` when the remote
    /// has no judgement of its own (a cloud: the person is the owner of
    /// what they synced, an old server: the role decides). A path it does
    /// not see is answered as a free name is, never as an error.
    ///
    /// # Errors
    /// The connection failed.
    fn rights(&self, paths: &[String]) -> Result<Option<Vec<(String, Rights)>>> {
        let _ = paths;
        Ok(None)
    }
}

/// What a device may do with a path on its remote: the one answer the
/// remote's rules give (`access_get` with `brief` on a UniVerso). Kept in
/// the state, so that the last answer holds while the device is offline.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rights {
    /// The device is told of the file.
    #[serde(default)]
    pub see: bool,
    /// A put of it, whole, is accepted: the person edits it and the device
    /// holds it whole.
    #[serde(default)]
    pub put: bool,
    /// A deletion of it is accepted.
    #[serde(default)]
    pub delete: bool,
    /// A rename of it inside its folder is accepted.
    #[serde(default)]
    pub rename: bool,
}

impl Rights {
    /// Whether the device may change the file at all.
    #[must_use]
    pub fn writes(&self) -> bool {
        self.put || self.delete || self.rename
    }
}

/// A sink that hashes what it is given and keeps nothing.
#[derive(Default)]
pub struct HashingSink(Sha256);

impl HashingSink {
    #[must_use]
    pub fn finish(self) -> String {
        hex(&self.0.finalize())
    }
}

impl Sink for HashingSink {
    fn put(&mut self, piece: &[u8]) -> Result<()> {
        self.0.update(piece);
        Ok(())
    }
}

/// Lower-case hexadecimal.
#[must_use]
pub fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes.iter().fold(String::new(), |mut out, b| {
        let _ = write!(out, "{b:02x}");
        out
    })
}

/// What the state keeps of a remote file between runs (outside the
/// folder, ADR 0011): the version it had when its hash was found, so that
/// a listing that shows the same version needs no read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Token {
    pub version: String,
    pub hash: String,
    pub size: u64,
}

/// The hash a picture holds for a file it has not read ([`Known::unread`]):
/// never the SHA-256 of any bytes (64 hexadecimal digits), so it equals no
/// base and no file here, and the plan can only fetch that file.
pub const UNREAD: &str = "unread";

/// The remote's files as a pass compares them, with the version each has
/// and the feed's cursor.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Known {
    pub files: Files,
    /// Path → version, in step with `files`.
    pub versions: BTreeMap<String, String>,
    /// Files listed but not read for their hash: only there, never seen
    /// (no base, nothing here by the name). Their hash in `files` is
    /// [`UNREAD`]; the download that fetches one hashes it as it is written
    /// and puts the real hash in its place ([`Known::put`]). Never kept in
    /// the state ([`Known::tokens`]), never taken for a hash learned.
    pub unread: BTreeSet<String>,
    pub cursor: Option<String>,
    /// What the feed said was renamed since this picture began: the name
    /// there now → the name it had before the first of its renames (a
    /// chain followed back). A plan follows these as renames, whatever the
    /// bytes did since ([`super::plan_moved`]; ADR 0079, decided
    /// 2026-10-31); a full listing knows none. [`Known::settle`] lets go of
    /// those the base no longer needs.
    pub moved: BTreeMap<String, String>,
}

impl Known {
    /// The condition a write replacing the file `path` holds, whose hash
    /// the plan says is `base` (none: a new file).
    ///
    /// # Errors
    /// [`RemoteErrorKind::Changed`] when the picture no longer has the
    /// base the plan was made on.
    pub fn condition(&self, path: &str, base: Option<&str>) -> Result<Condition> {
        let Some(base) = base else {
            return Ok(Condition::Absent);
        };
        let there = super::spelled_there(&self.files, path);
        match (self.files.get(&there), self.versions.get(&there)) {
            (Some(f), Some(v)) if f.hash == base => Ok(Condition::Version(v.clone())),
            _ => Err(RemoteError::new(
                RemoteErrorKind::Changed,
                "the file there is not the one the plan was made on",
            )),
        }
    }

    /// The picture's files as the state keeps them for the next run.
    #[must_use]
    pub fn tokens(&self) -> BTreeMap<String, Token> {
        self.files
            .iter()
            .filter(|(p, _)| !self.unread.contains(*p))
            .filter_map(|(p, f)| {
                self.versions.get(p).map(|v| {
                    (
                        p.clone(),
                        Token {
                            version: v.clone(),
                            hash: f.hash.clone(),
                            size: f.size,
                        },
                    )
                })
            })
            .collect()
    }

    /// A file written, renamed or fetched by this pass: the picture now
    /// holds it so that the next step on the same path has its version.
    pub fn put(&mut self, path: String, state: FileState, version: String) {
        self.unread.remove(&path);
        self.versions.insert(path.clone(), version);
        self.files.insert(path, state);
    }

    /// A file listed but not read: its version, and [`UNREAD`] for a hash.
    fn put_unread(&mut self, path: String, size: u64, version: String) {
        self.versions.insert(path.clone(), version);
        self.files.insert(
            path.clone(),
            FileState {
                hash: UNREAD.to_owned(),
                size,
            },
        );
        self.unread.insert(path);
    }

    /// The version the picture holds for `path` when its hash was not read
    /// ([`Known::unread`]): what a download of it must find, or the file
    /// changed since it was listed.
    #[must_use]
    pub fn unread_version(&self, path: &str) -> Option<&str> {
        self.unread
            .contains(path)
            .then(|| self.versions.get(path).map(String::as_str))
            .flatten()
    }

    /// A file gone from the picture (a delete or the source of a rename).
    pub fn remove(&mut self, path: &str) -> Option<(FileState, Option<String>)> {
        self.unread.remove(path);
        let version = self.versions.remove(path);
        self.files.remove(path).map(|f| (f, version))
    }

    /// The renames a pass has carried out, or no longer can, let go: kept
    /// only while the base still knows the old name (under either Unicode
    /// form, spec Q7) and not the new one.
    pub fn settle(&mut self, base: &BTreeMap<String, String>) {
        let knows = |p: &str| {
            base.contains_key(p) || {
                let name = super::folded_form(p);
                base.keys().any(|k| super::folded_form(k) == name)
            }
        };
        self.moved.retain(|to, from| knows(from) && !knows(to));
    }

    /// A rename the feed told: `to` holds what was `from`, and what `from`
    /// had been renamed from before, if anything — in `moved`, or set
    /// aside by the deletion the log writes just before a rename's new name
    /// (`gone`).
    fn renamed(&mut self, from: &str, to: &str, gone: &mut BTreeMap<String, String>) {
        let origin = self
            .moved
            .remove(from)
            .or_else(|| gone.remove(from))
            .unwrap_or_else(|| from.to_owned());
        if origin == to {
            // Renamed back: no rename left.
            self.moved.remove(to);
        } else {
            self.moved.insert(to.to_owned(), origin);
        }
    }
}

/// Bring the picture up to date: the remote's listing, from the cursor the
/// picture is at, or in full when it has none or the remote lost it. A file
/// whose hash the listing lacks is looked up in `remembered` by its version
/// and asked of the remote only when the version is new. The entries the
/// listing named are returned with who made each, for the activity list.
///
/// The picture is left as it was when this fails.
///
/// # Errors
/// What the remote's listing or a fingerprint failed with, other than a
/// lost cursor (then the listing is asked in full) and a file gone since it
/// was listed (then it is not in the picture).
pub fn refresh(
    remote: &dyn Remote,
    known: &mut Option<Known>,
    remembered: &BTreeMap<String, Token>,
) -> Result<Vec<Who>> {
    refresh_learning(remote, known, &mut remembered.clone())
}

/// [`refresh`], keeping in `remembered` each hash it reads of the remote
/// as soon as it has it — also when a later read fails and the picture is
/// left as it was. A cloud's first listing reads every file to find its
/// hash; on a link that drops, a host that saves `remembered` (the state's
/// `tokens`) after a failed refresh does not read those files again on
/// the next try, so a large folder gets through a piece at a time instead
/// of starting over (I4 of the sync review, 2026-11-15). What it keeps is
/// only what the remote said a version holds: never a base, never a
/// change to plan from.
///
/// # Errors
/// As [`refresh`].
pub fn refresh_learning(
    remote: &dyn Remote,
    known: &mut Option<Known>,
    remembered: &mut BTreeMap<String, Token>,
) -> Result<Vec<Who>> {
    refresh_planning(remote, known, remembered, &|_| false)
}

/// [`refresh_learning`], leaving unread the files `unseen` names — only
/// there, never seen: no base under the name, in either form of it — when
/// reading one for its hash is reading the whole file
/// ([`Remote::fingerprint_reads_the_file`]). Such a file is in the picture
/// with its version and [`UNREAD`] for a hash ([`Known::unread`]), so the
/// plan fetches it, and the download hashes it as it is written: a first
/// sync with a WebDAV folder reads each file once, not once for the hash
/// and once more for the bytes (I4 of the sync review, part 2,
/// 2026-11-15). A file of the same name found here after all is read for
/// its hash before the plan compares them ([`read_unread`]).
///
/// # Errors
/// As [`refresh`].
pub fn refresh_planning(
    remote: &dyn Remote,
    known: &mut Option<Known>,
    remembered: &mut BTreeMap<String, Token>,
    unseen: &dyn Fn(&str) -> bool,
) -> Result<Vec<Who>> {
    let skips = remote.fingerprint_reads_the_file();
    let after = known.as_ref().and_then(|k| k.cursor.clone());
    let (listing, kept) = match remote.list(after.as_deref()) {
        Err(e) if e.kind == RemoteErrorKind::CursorLost => (remote.list(None)?, None),
        other => (other?, known.as_ref()),
    };
    let mut next = match (listing.full, kept) {
        (false, Some(k)) => k.clone(),
        _ => Known::default(),
    };
    let mut named = Vec::new();
    let mut learn = |entry: &Entry, next: &mut Known| -> Result<Who> {
        let hash = match &entry.hash {
            Some(h) => Some(h.clone()),
            None => {
                let same = |t: &Token| t.version == entry.version;
                let before = known
                    .as_ref()
                    .filter(|k| !k.unread.contains(&entry.path))
                    .and_then(|k| k.versions.get(&entry.path).zip(k.files.get(&entry.path)))
                    .filter(|(v, _)| **v == entry.version)
                    .map(|(_, f)| f.hash.clone());
                match before.or_else(|| {
                    remembered
                        .get(&entry.path)
                        .filter(|t| same(t))
                        .map(|t| t.hash.clone())
                }) {
                    Some(h) => Some(h),
                    // Never seen, and only there: the download hashes it.
                    None if skips && unseen(&entry.path) => {
                        next.put_unread(entry.path.clone(), entry.size, entry.version.clone());
                        return Ok(Who {
                            path: entry.path.clone(),
                            by: entry.by.clone(),
                            device: entry.device.clone(),
                        });
                    }
                    None => match remote.fingerprint(&entry.path) {
                        Ok((version, hash)) if version == entry.version => {
                            remembered.insert(
                                entry.path.clone(),
                                Token {
                                    version,
                                    hash: hash.clone(),
                                    size: entry.size,
                                },
                            );
                            Some(hash)
                        }
                        // It changed between the listing and the read: the
                        // next pass lists it again.
                        Ok(_) => None,
                        Err(e) if e.kind == RemoteErrorKind::NotFound => None,
                        Err(e) => return Err(e),
                    },
                }
            }
        };
        match hash {
            Some(hash) => next.put(
                entry.path.clone(),
                FileState {
                    hash,
                    size: entry.size,
                },
                entry.version.clone(),
            ),
            None => {
                next.remove(&entry.path);
            }
        }
        Ok(Who {
            path: entry.path.clone(),
            by: entry.by.clone(),
            device: entry.device.clone(),
        })
    };
    // Renamed names gone in this listing, until a rename takes them on.
    let mut gone: BTreeMap<String, String> = BTreeMap::new();
    for change in &listing.changes {
        match change {
            Change::Present(entry) => named.push(learn(entry, &mut next)?),
            Change::Gone { path, by, device } => {
                next.remove(path);
                // What a rename brought here is gone again — unless it is
                // renamed on (the log writes a rename as the old name's
                // deletion, then the new name's file): set aside until the
                // listing's end.
                if let Some(origin) = next.moved.remove(path) {
                    gone.insert(path.clone(), origin);
                }
                named.push(Who {
                    path: path.clone(),
                    by: by.clone(),
                    device: device.clone(),
                });
            }
            Change::Renamed { from, entry } => {
                next.remove(from);
                next.renamed(from, &entry.path, &mut gone);
                named.push(learn(entry, &mut next)?);
            }
        }
    }
    next.cursor = listing.cursor.or_else(|| {
        // A remote with no feed has no cursor; one that gave none this
        // time keeps the last.
        kept.and_then(|k| k.cursor.clone())
    });
    *known = Some(next);
    Ok(named)
}

/// The files the picture holds unread ([`Known::unread`]) that `wanted`
/// names — a file of the same name found here, which the plan must compare
/// by hash — read for their hash now, as [`refresh_learning`] reads a new
/// version: kept in `remembered` as soon as each is known; one changed
/// since it was listed, or gone, leaves the picture (the next pass lists it
/// again).
///
/// # Errors
/// What a fingerprint failed with, other than the file being gone; what
/// was read before it stays read.
pub fn read_unread(
    remote: &dyn Remote,
    known: &mut Known,
    remembered: &mut BTreeMap<String, Token>,
    wanted: &dyn Fn(&str) -> bool,
) -> Result<()> {
    let paths: Vec<String> = known.unread.iter().filter(|p| wanted(p)).cloned().collect();
    for path in paths {
        let Some(listed) = known.versions.get(&path).cloned() else {
            known.remove(&path);
            continue;
        };
        let size = known.files.get(&path).map_or(0, |f| f.size);
        match remote.fingerprint(&path) {
            Ok((version, hash)) if version == listed => {
                remembered.insert(
                    path.clone(),
                    Token {
                        version: version.clone(),
                        hash: hash.clone(),
                        size,
                    },
                );
                known.put(path, FileState { hash, size }, version);
            }
            Ok(_) => {
                known.remove(&path);
            }
            Err(e) if e.kind == RemoteErrorKind::NotFound => {
                known.remove(&path);
            }
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
