// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A file that arrives in pieces (ADR 0079 item 12, revised 2026-10-12): a
//! sync's transfer written to a temporary file as each piece comes, so the
//! file is never whole in memory, then given its name by the same steps as
//! an atomic create or write (invariant 9, ADR 0029) — `fsync` of the file,
//! the name claimed or the rename over the target, `fsync` of the
//! directory. Until then nothing of it is in the folder: the temporary
//! name is hidden, as every write's is, and a transfer dropped unfinished
//! takes its temporary file with it.

use std::fs::{File, Metadata};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::ops::{self, OpReport};
use crate::write::{self, WriteError, WriteReport};
use crate::{Fnv, Stamp};

/// A file being written in pieces, not yet in the folder. Made by
/// [`crate::Root::stage`], filled by [`Staged::append`], and given its name
/// by [`crate::Root::create_staged`] or [`crate::Root::write_staged`].
/// Dropped before that, its temporary file is removed.
#[derive(Debug)]
pub struct Staged {
    temp: PathBuf,
    file: Option<File>,
    len: u64,
    hash: Fnv,
    /// The temporary file was handed to the step that names it, which
    /// removes it itself if it fails.
    handed: bool,
}

impl Staged {
    /// A new temporary file in `dir`, with `original`'s mode from the first
    /// instant when it will replace a file, as an atomic write's is.
    pub(crate) fn beside(dir: &Path, original: Option<&Metadata>) -> Result<Self, WriteError> {
        let temp = ops::temporary_name(dir);
        let file = match original {
            Some(meta) => write::open_new_with_mode(&temp, meta),
            None => File::create_new(&temp),
        }
        .map_err(WriteError::Io)?;
        Ok(Self {
            temp,
            file: Some(file),
            len: 0,
            hash: Fnv::new(),
            handed: false,
        })
    }

    /// The next piece, written to the temporary file.
    pub fn append(&mut self, bytes: &[u8]) -> std::io::Result<()> {
        let file = self
            .file
            .as_mut()
            .ok_or_else(|| std::io::Error::other("a staged file already handed over"))?;
        file.write_all(bytes)?;
        self.hash.update(bytes);
        self.len = self.len.saturating_add(bytes.len() as u64);
        Ok(())
    }

    /// The bytes written so far.
    #[must_use]
    pub fn len(&self) -> u64 {
        self.len
    }

    /// Whether nothing was written yet.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// What was written so far, read back whole: for a caller that must
    /// hold a small file in memory anyway — a note whose two appends are
    /// joined (ADR 0079 item 8).
    pub fn contents(&mut self) -> std::io::Result<Vec<u8>> {
        if let Some(file) = self.file.as_mut() {
            file.flush()?;
        }
        std::fs::read(&self.temp)
    }

    /// Give the file the name `path`, which must not exist: the folders on
    /// the way made, the file synced and its name claimed (see
    /// `ops::claim_new`).
    pub(crate) fn create_at(mut self, path: &Path) -> Result<OpReport, WriteError> {
        if ops::occupied(path).map_err(WriteError::Io)? {
            return Err(WriteError::Exists);
        }
        let dir = ops::parent_of(path)?;
        let created = ops::create_dirs(dir).map_err(WriteError::Io)?;
        if let Some(file) = self.file.take() {
            file.sync_all().map_err(WriteError::Io)?;
        }
        self.handed = true;
        ops::claim_new(path, &created, &self.temp, self.hash.finish())
    }

    /// Put the file over the one at `path`, which must still be the one
    /// `expected` describes (invariant 11): an atomic write's last steps.
    pub(crate) fn write_over(
        mut self,
        path: &Path,
        expected: &Stamp,
    ) -> Result<WriteReport, WriteError> {
        let checked = write::check(path, expected)?;
        let file = self
            .file
            .take()
            .ok_or_else(|| WriteError::Io(std::io::Error::other("a staged file handed twice")))?;
        self.handed = true;
        write::put_over(checked, &self.temp, file, self.hash.finish())
    }
}

impl Drop for Staged {
    fn drop(&mut self) {
        if !self.handed {
            drop(self.file.take());
            let _ = std::fs::remove_file(&self.temp);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use crate::{Root, WriteError};

    fn temporaries(dir: &Path) -> Vec<String> {
        let mut out = Vec::new();
        let mut stack = vec![dir.to_path_buf()];
        while let Some(d) = stack.pop() {
            for e in std::fs::read_dir(&d).unwrap() {
                let e = e.unwrap();
                if e.file_type().unwrap().is_dir() {
                    stack.push(e.path());
                } else if e.file_name().to_string_lossy().starts_with(".verso-tmp-") {
                    out.push(e.path().display().to_string());
                }
            }
        }
        out
    }

    #[test]
    fn a_file_in_pieces_lands_whole_in_a_folder_made_when_it_lands() {
        let dir = tempfile::tempdir().unwrap();
        let mut root = Root::open(dir.path(), vec![]).unwrap();
        let mut staged = root.stage(Path::new("novo/fundo/arquivo.bin")).unwrap();
        // Nothing of it in the folder yet, not even its folders.
        assert!(!dir.path().join("novo").exists());
        for piece in [&b"um "[..], b"dois ", b"tres"] {
            staged.append(piece).unwrap();
        }
        assert_eq!(staged.len(), 12);
        let (handle, report) = root
            .create_staged(Path::new("novo/fundo/arquivo.bin"), staged)
            .unwrap();
        let (bytes, stamp) = root.read(handle).unwrap();
        assert_eq!(bytes, b"um dois tres");
        // The stamp of the pieces is the stamp of the whole.
        assert_eq!(report.stamp, Some(stamp));
        assert!(temporaries(dir.path()).is_empty());
    }

    #[test]
    fn a_file_in_pieces_replaces_only_the_file_that_was_read() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("nota.md"), "antes").unwrap();
        let mut root = Root::open(dir.path(), vec![]).unwrap();
        let h = root.handle(Path::new("nota.md")).unwrap();
        let (_, read) = root.read(h).unwrap();
        let mut staged = root.stage(Path::new("nota.md")).unwrap();
        staged.append(b"depois").unwrap();
        // Changed on disk meanwhile: refused, nothing written, no leftover.
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(dir.path().join("nota.md"), "outro").unwrap();
        let refused = root.write_staged(h, staged, &read);
        assert!(matches!(refused, Err(WriteError::Changed { .. })));
        assert_eq!(std::fs::read(dir.path().join("nota.md")).unwrap(), b"outro");
        assert!(temporaries(dir.path()).is_empty());
        // Over the file as it is now: written.
        let (_, now) = root.read(h).unwrap();
        let mut staged = root.stage(Path::new("nota.md")).unwrap();
        staged.append(b"depois").unwrap();
        let report = root.write_staged(h, staged, &now).unwrap();
        let (bytes, stamp) = root.read(h).unwrap();
        assert_eq!(bytes, b"depois");
        assert_eq!(report.stamp, Some(stamp));
        assert!(temporaries(dir.path()).is_empty());
    }

    #[test]
    fn a_file_in_pieces_dropped_unfinished_leaves_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let root = Root::open(dir.path(), vec![]).unwrap();
        let mut staged = root.stage(Path::new("meio.bin")).unwrap();
        staged.append(&[7; 4096]).unwrap();
        assert_eq!(temporaries(dir.path()).len(), 1);
        drop(staged);
        assert!(temporaries(dir.path()).is_empty());
        assert!(!dir.path().join("meio.bin").exists());
    }

    #[test]
    fn a_new_file_in_pieces_never_replaces_one_that_appeared() {
        let dir = tempfile::tempdir().unwrap();
        let mut root = Root::open(dir.path(), vec![]).unwrap();
        let mut staged = root.stage(Path::new("disputado.md")).unwrap();
        staged.append(b"meu").unwrap();
        std::fs::write(dir.path().join("disputado.md"), "do outro").unwrap();
        let refused = root.create_staged(Path::new("disputado.md"), staged);
        assert!(matches!(refused, Err(WriteError::Exists)));
        assert_eq!(
            std::fs::read(dir.path().join("disputado.md")).unwrap(),
            b"do outro"
        );
        assert!(temporaries(dir.path()).is_empty());
    }

    #[test]
    fn a_range_and_a_read_through_never_take_the_whole_file() {
        let dir = tempfile::tempdir().unwrap();
        let bytes: Vec<u8> = (0..3 * crate::READ_PIECE + 5)
            .map(|i| (i % 251) as u8)
            .collect();
        std::fs::write(dir.path().join("grande.bin"), &bytes).unwrap();
        let mut root = Root::open(dir.path(), vec![]).unwrap();
        let h = root.handle(Path::new("grande.bin")).unwrap();
        let (piece, mark) = root.read_range(h, 10, 100).unwrap();
        assert_eq!(piece, bytes[10..110]);
        assert_eq!(mark.len, bytes.len() as u64);
        let (tail, _) = root.read_range(h, bytes.len() as u64 - 3, 100).unwrap();
        assert_eq!(tail, bytes[bytes.len() - 3..]);
        let (past, _) = root.read_range(h, bytes.len() as u64 + 9, 100).unwrap();
        assert!(past.is_empty());
        let mut joined = Vec::new();
        let mut pieces = 0;
        let stamp = root
            .read_through(h, |p| {
                pieces += 1;
                joined.extend_from_slice(p);
            })
            .unwrap();
        assert!(pieces >= 4, "{pieces}");
        assert_eq!(joined, bytes);
        assert_eq!(Some(stamp), root.read(h).ok().map(|(_, s)| s));
    }
}
