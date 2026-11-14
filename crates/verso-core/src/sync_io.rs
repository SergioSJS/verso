// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What sync needs of a folder's files (ADR 0079 item 7), whatever their
//! kind: their bytes with the revision they were read at, and a write of
//! bytes — a new file, or over the one a revision describes, refused when
//! it changed (invariant 11) — through `verso-fs`, atomically (invariant
//! 9), the index following a note or a board. A file of any size crosses
//! in pieces (item 12, revised 2026-10-12): read a range at a time, hashed
//! as it is read, and written to a temporary file as its pieces arrive,
//! never whole in memory.

use std::path::Path;

use sha2::{Digest, Sha256};
use verso_fs::{Mark, Staged};

use super::{CoreError, Workspace, is_canvas, is_note, note_stamp, revision};

/// A file hashed a piece at a time: its SHA-256 (hex), its length, the
/// revision it was read at, and its length and time as a read in pieces
/// compares them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hashed {
    pub hash: String,
    pub len: u64,
    pub revision: String,
    pub mark: Mark,
}

/// SHA-256 as sync writes it: lowercase hex.
fn hex(digest: &[u8]) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(digest.len() * 2);
    for b in digest {
        let _ = write!(out, "{b:02x}");
    }
    out
}

impl Workspace {
    /// A file's bytes and the revision they were read at; any kind of
    /// file. A placeholder answers `Read(Unavailable)` (ADR 0043).
    pub fn read_with_revision(&mut self, relative: &str) -> Result<(Vec<u8>, String), CoreError> {
        let key = self.entry_key(relative)?;
        let handle = self
            .root
            .handle(Path::new(&key))
            .map_err(CoreError::Confined)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        Ok((bytes, revision::encode(&stamp)))
    }

    /// Up to `max` bytes of the file `relative` names from `offset`, and
    /// the file's length and time taken before the read: a piece of a file
    /// sent to a device, the file never whole in memory. Any kind of
    /// file; a placeholder answers `Read(Unavailable)` (ADR 0043).
    pub fn read_piece(
        &mut self,
        relative: &str,
        offset: u64,
        max: usize,
    ) -> Result<(Vec<u8>, Mark), CoreError> {
        let key = self.entry_key(relative)?;
        let handle = self
            .root
            .handle(Path::new(&key))
            .map_err(CoreError::Confined)?;
        self.root
            .read_range(handle, offset, max)
            .map_err(CoreError::Read)
    }

    /// `relative`, a file or folder that is there, spelled as the disk keeps
    /// its names ([`verso_fs::Root::spelled`]): where names fold, a write
    /// through another case reaches the file kept under its own. Asked of
    /// the disk, not the listing, which is as of the last walk.
    #[must_use]
    pub fn spelled_on_disk(&self, relative: &str) -> Option<String> {
        let key = self.entry_key(relative).ok()?;
        self.root
            .spelled(Path::new(&key))
            .map(|p| p.to_string_lossy().into_owned())
    }

    /// The SHA-256 of the file `relative` names, read a piece at a time,
    /// with the revision it was read at: what sync compares and sends,
    /// for a file of any size, never whole in memory.
    pub fn hash_with_revision(&mut self, relative: &str) -> Result<Hashed, CoreError> {
        let key = self.entry_key(relative)?;
        let handle = self
            .root
            .handle(Path::new(&key))
            .map_err(CoreError::Confined)?;
        let mut sha = Sha256::new();
        let stamp = self
            .root
            .read_through(handle, |piece| sha.update(piece))
            .map_err(CoreError::Read)?;
        Ok(Hashed {
            hash: hex(&sha.finalize()),
            len: stamp.len,
            revision: revision::encode(&stamp),
            mark: Mark {
                len: stamp.len,
                modified: stamp.modified,
            },
        })
    }

    /// Start a file that arrives in pieces at `relative`: written to a
    /// temporary file beside where it lands, as each piece comes
    /// ([`Staged::append`]), and given its name by
    /// [`Workspace::write_staged`]. Dropped unfinished, nothing of it stays.
    pub fn stage(&mut self, relative: &str) -> Result<Staged, CoreError> {
        let key = self.entry_key(relative)?;
        self.root.stage(Path::new(&key)).map_err(CoreError::Write)
    }

    /// Whether `relative` names a folder on the disk now, a symlink
    /// followed as a read follows it. Sync's unit is a file (ADR 0079
    /// item 2): a folder among the paths a change touched is never read
    /// as one. `false` for a file, for nothing there, and for a path the
    /// folder refuses — the read that follows says why.
    pub fn is_folder(&mut self, relative: &str) -> bool {
        let Ok(key) = self.entry_key(relative) else {
            return false;
        };
        self.root
            .handle(Path::new(&key))
            .is_ok_and(|handle| self.root.is_dir(handle))
    }

    /// The length of the file `relative` names, from the disk without
    /// reading it: sync leaves a file larger than it carries unread (ADR
    /// 0079 item 12). `None` for nothing there, a folder, and a path the
    /// folder refuses — the read that follows says why.
    pub fn file_len(&mut self, relative: &str) -> Option<u64> {
        let key = self.entry_key(relative).ok()?;
        let handle = self.root.handle(Path::new(&key)).ok()?;
        self.root.length_and_time(handle).ok().map(|(len, _)| len)
    }

    /// The folders above `relative` that hold nothing any more, removed,
    /// from the nearest up: a move or a deletion that came from another
    /// device leaves no empty folder behind (ADR 0079). A folder that holds
    /// anything stays, and so does every one above it.
    pub fn prune_empty_parents(&mut self, relative: &str) {
        let mut dir = super::entries::parent_of(relative).to_owned();
        while !dir.is_empty() {
            match self.root.remove_empty_dir(Path::new(&dir)) {
                Ok(true) => {
                    self.dirs.remove(&dir);
                    dir = super::entries::parent_of(&dir).to_owned();
                }
                _ => break,
            }
        }
    }

    /// Write `bytes` at `relative`: a new file when `revision` is `None`
    /// (refused when something stands there), else over the file the
    /// revision describes (refused, with nothing written, when it is no
    /// longer that file). Returns the revision of the bytes written.
    pub fn write_bytes(
        &mut self,
        relative: &str,
        bytes: &[u8],
        revision: Option<&str>,
    ) -> Result<String, CoreError> {
        let key = self.entry_key(relative)?;
        let settings = verso_fs::is_settings_path(&key);
        let stamp = match revision {
            None => {
                let (handle, report) = self
                    .root
                    .create(Path::new(&key), bytes)
                    .map_err(CoreError::Write)?;
                if !is_note(&key) && !settings {
                    self.files
                        .entry(verso_index::file_key(super::name_of(&key)))
                        .or_default()
                        .push(key.clone());
                }
                self.stamp_of_written(handle, report.stamp, bytes)
            }
            Some(revision) => {
                let handle = self
                    .root
                    .handle(Path::new(&key))
                    .map_err(CoreError::Confined)?;
                let expected = Self::decode_revision(revision)?;
                let report = self
                    .root
                    .write(handle, bytes, &expected)
                    .map_err(CoreError::Write)?;
                self.stamp_of_written(handle, report.stamp, bytes)
            }
        };
        // The folder's settings are read again, never indexed (ADR 0070);
        // the index follows what it knows: a note's text, a board's links.
        if settings {
            self.layer_written();
        } else if is_note(&key) {
            let text = String::from_utf8_lossy(bytes);
            self.index
                .upsert(
                    &key,
                    note_stamp(&stamp),
                    &text,
                    &verso_dialect::parse(&text),
                )
                .map_err(CoreError::Index)?;
        } else if is_canvas(&key) {
            self.index_canvas(&key, bytes, note_stamp(&stamp))?;
        }
        Ok(revision::encode(&stamp))
    }
    /// [`Workspace::write_bytes`] for a file that arrived in pieces
    /// ([`Workspace::stage`]): a new file when `revision` is `None`
    /// (refused when something stands there), else over the file the
    /// revision describes (refused, with nothing written, when it is no
    /// longer that file — invariant 11). Atomic, as every write (invariant
    /// 9). Returns the revision of the file written.
    pub fn write_staged(
        &mut self,
        relative: &str,
        staged: Staged,
        revision: Option<&str>,
    ) -> Result<String, CoreError> {
        let key = self.entry_key(relative)?;
        // The size written, known without the stamp: a write that could not
        // confirm its stamp must not read a note past the cap either.
        let staged_len = staged.len();
        let (handle, stamp) = match revision {
            None => {
                let (handle, report) = self
                    .root
                    .create_staged(Path::new(&key), staged)
                    .map_err(CoreError::Write)?;
                if !is_note(&key) {
                    self.files
                        .entry(verso_index::file_key(super::name_of(&key)))
                        .or_default()
                        .push(key.clone());
                }
                (handle, report.stamp)
            }
            Some(revision) => {
                let handle = self
                    .root
                    .handle(Path::new(&key))
                    .map_err(CoreError::Confined)?;
                let expected = Self::decode_revision(revision)?;
                let report = self
                    .root
                    .write_staged(handle, staged, &expected)
                    .map_err(CoreError::Write)?;
                (handle, report.stamp)
            }
        };
        // The index follows what it knows, a note's text and a board's
        // links, read back once in place: notes and boards are text.
        if is_note(&key)
            && stamp.as_ref().map_or(staged_len, |s| s.len) > crate::indexing::INDEX_MOST
        {
            // Past the cap (`INDEX_MOST`): synced as a file, never read
            // back and parsed here; a row of a smaller version goes.
            self.index.remove(&key).map_err(CoreError::Index)?;
        } else if is_note(&key) || is_canvas(&key) {
            let (bytes, read) = self.root.read(handle).map_err(CoreError::Read)?;
            if is_note(&key) {
                let text = String::from_utf8_lossy(&bytes);
                self.index
                    .upsert(&key, note_stamp(&read), &text, &verso_dialect::parse(&text))
                    .map_err(CoreError::Index)?;
            } else {
                self.index_canvas(&key, &bytes, note_stamp(&read))?;
            }
            // The revision of the bytes written; read back when the write
            // could not confirm its stamp, as `write_bytes` does.
            return Ok(revision::encode(&stamp.unwrap_or(read)));
        }
        // A stamp the write could not confirm: one no later write matches,
        // so the next one reads the file again rather than trust it.
        Ok(revision::encode(
            &stamp.unwrap_or_else(revision::impossible),
        ))
    }
}
