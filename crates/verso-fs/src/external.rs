// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A file the person picked with the system's file picker, outside the open
//! folder (A11Y.10, "Import files…"). The path is the entry edge's (rule 4:
//! it comes from the host's dialog and never crosses into the UI); what is
//! handed on is the bytes, which the window then creates in the folder
//! through `create_file` — confined, atomic, refused on a name taken — as a
//! file dropped on the tree is.
//!
//! The picked file is outside the folder by nature, so nothing is confined
//! here; what is guarded is the read itself: a regular file only (a FIFO or
//! a device would block, a directory has no bytes), a symlink followed to
//! its content as the folder's own symlinks are (ADR 0044), a cloud
//! placeholder refused instead of downloaded (ADR 0043), and a size bound.

use std::io::Read;
use std::path::Path;

/// Why a picked file was not read.
#[derive(Debug)]
pub enum PickedError {
    /// Not a regular file: a directory, a FIFO, a device.
    NotAFile,
    /// An on-demand storage placeholder: reading would download it.
    Placeholder,
    /// More than the bound given.
    TooLarge,
    /// The system refused the read.
    Io(std::io::Error),
}

impl std::fmt::Display for PickedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PickedError::NotAFile => f.write_str("not a regular file"),
            PickedError::Placeholder => {
                f.write_str("a file kept in the cloud, not on this computer")
            }
            PickedError::TooLarge => f.write_str("too large"),
            PickedError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for PickedError {}

/// The bytes of the file the person picked at `path`, at most `max` of them.
///
/// # Errors
/// [`PickedError`] when the path is not a regular file, is a placeholder,
/// holds more than `max` bytes, or cannot be read.
pub fn read_picked(path: &Path, max: u64) -> Result<Vec<u8>, PickedError> {
    if crate::placeholder::stands_in(path).map_err(PickedError::Io)? {
        return Err(PickedError::Placeholder);
    }
    let meta = std::fs::metadata(path).map_err(PickedError::Io)?;
    if !meta.is_file() {
        return Err(PickedError::NotAFile);
    }
    if meta.len() > max {
        return Err(PickedError::TooLarge);
    }
    let file = std::fs::File::open(path).map_err(PickedError::Io)?;
    // The file may have grown since it was measured: the bound holds.
    let mut bytes = Vec::new();
    file.take(max.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(PickedError::Io)?;
    if bytes.len() as u64 > max {
        return Err(PickedError::TooLarge);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_regular_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.txt");
        std::fs::write(&p, b"hello").unwrap();
        assert_eq!(read_picked(&p, 100).unwrap(), b"hello");
    }

    #[test]
    fn refuses_a_directory_and_a_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            read_picked(dir.path(), 100),
            Err(PickedError::NotAFile)
        ));
        assert!(matches!(
            read_picked(&dir.path().join("none"), 100),
            Err(PickedError::Io(_))
        ));
    }

    #[test]
    fn bounds_the_size() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("big.bin");
        std::fs::write(&p, vec![0u8; 11]).unwrap();
        assert!(matches!(read_picked(&p, 10), Err(PickedError::TooLarge)));
        assert_eq!(read_picked(&p, 11).unwrap().len(), 11);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_gives_its_target_content() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("t.txt");
        std::fs::write(&target, b"data").unwrap();
        let link = dir.path().join("l.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        assert_eq!(read_picked(&link, 100).unwrap(), b"data");
        // A link to a directory is not a file.
        let dlink = dir.path().join("d");
        std::os::unix::fs::symlink(dir.path(), &dlink).unwrap();
        assert!(matches!(
            read_picked(&dlink, 100),
            Err(PickedError::NotAFile)
        ));
    }

    #[test]
    fn an_icloud_placeholder_is_refused_not_downloaded() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join(".Foto.png.icloud");
        std::fs::write(&p, b"stub").unwrap();
        assert!(matches!(
            read_picked(&p, 100),
            Err(PickedError::Placeholder)
        ));
    }
}
