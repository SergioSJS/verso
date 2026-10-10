// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What sync needs of a folder's files (ADR 0079 item 7), whatever their
//! kind: their bytes with the revision they were read at, and a write of
//! bytes — a new file, or over the one a revision describes, refused when
//! it changed (invariant 11) — through `verso-fs`, atomically (invariant
//! 9), the index following a note or a board.

use std::path::Path;

use super::{CoreError, Workspace, is_canvas, is_note, note_stamp, revision};

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
        let stamp = match revision {
            None => {
                let (handle, report) = self
                    .root
                    .create(Path::new(&key), bytes)
                    .map_err(CoreError::Write)?;
                if !is_note(&key) {
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
        // The index follows what it knows: a note's text, a board's links.
        if is_note(&key) {
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
}
