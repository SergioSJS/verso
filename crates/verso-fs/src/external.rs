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

/// Why a picked file was not created in the folder ([`crate::Root::create_from_picked`]).
#[derive(Debug)]
pub enum ImportError {
    /// The picked file itself was refused or could not be read.
    Picked(PickedError),
    /// The folder's side refused or failed: a name taken, a path that
    /// cannot be named, the disk.
    Write(crate::WriteError),
}

impl From<PickedError> for ImportError {
    fn from(e: PickedError) -> Self {
        Self::Picked(e)
    }
}

impl From<crate::WriteError> for ImportError {
    fn from(e: crate::WriteError) -> Self {
        Self::Write(e)
    }
}

impl std::fmt::Display for ImportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Picked(e) => write!(f, "{e}"),
            Self::Write(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ImportError {}

/// `O_NONBLOCK`, which std does not name: the same value on every Linux
/// the project ships on (x86-64, arm64) and on macOS and the BSDs. A
/// `libc` dependency for one constant is not worth its place in the tree.
#[cfg(all(unix, any(target_os = "linux", target_os = "android")))]
const O_NONBLOCK: i32 = 0o4000;
#[cfg(all(unix, not(any(target_os = "linux", target_os = "android"))))]
const O_NONBLOCK: i32 = 0x4;

/// `path` opened, and the length of what was opened, only if it is a
/// regular file. On Unix the file is opened first and judged by its own
/// handle (`fstat`), and opened without blocking: a FIFO swapped in for
/// the file between a check by name and the open would otherwise wait
/// for a writer and hold the host's thread for good. Where there are no
/// FIFOs to speak of (Windows), the name is checked first, as a directory
/// cannot be opened there.
#[cfg(unix)]
fn open_regular(path: &Path) -> Result<(std::fs::File, u64), PickedError> {
    use std::os::unix::fs::OpenOptionsExt;
    let file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(O_NONBLOCK)
        .open(path)
        .map_err(PickedError::Io)?;
    let meta = file.metadata().map_err(PickedError::Io)?;
    if !meta.is_file() {
        return Err(PickedError::NotAFile);
    }
    Ok((file, meta.len()))
}

#[cfg(not(unix))]
fn open_regular(path: &Path) -> Result<(std::fs::File, u64), PickedError> {
    let meta = std::fs::metadata(path).map_err(PickedError::Io)?;
    if !meta.is_file() {
        return Err(PickedError::NotAFile);
    }
    let file = std::fs::File::open(path).map_err(PickedError::Io)?;
    Ok((file, meta.len()))
}

/// The size of the file the person picked at `path`, read from its
/// metadata and no byte of it: the same refusals as [`read_picked`] (not a
/// regular file, a placeholder, more than `max`). The window's "Import
/// files…" asks it first, so that a large file is named before anything is
/// copied.
///
/// # Errors
/// [`PickedError`], as [`read_picked`].
pub fn check_picked(path: &Path, max: u64) -> Result<u64, PickedError> {
    if crate::placeholder::stands_in(path).map_err(PickedError::Io)? {
        return Err(PickedError::Placeholder);
    }
    let (_file, len) = open_regular(path)?;
    if len > max {
        return Err(PickedError::TooLarge);
    }
    Ok(len)
}

/// The bytes of the file the person picked at `path`, at most `max` of them.
///
/// # Errors
/// [`PickedError`] when the path is not a regular file, is a placeholder,
/// holds more than `max` bytes, or cannot be read.
pub fn read_picked(path: &Path, max: u64) -> Result<Vec<u8>, PickedError> {
    if crate::placeholder::stands_in(path).map_err(PickedError::Io)? {
        return Err(PickedError::Placeholder);
    }
    let (file, len) = open_regular(path)?;
    if len > max {
        return Err(PickedError::TooLarge);
    }
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

/// How much of a picked file one read takes when it is copied into the
/// folder: the most that is ever in memory at once, whatever the file's size.
pub const PICK_CHUNK: usize = 1 << 20;

/// `reader` read in pieces of at most `chunk` bytes, each handed to `sink`,
/// and the number of bytes read. More than `max` bytes — the file may have
/// grown since it was measured — stops the copy at once.
fn copy_bounded<R: Read>(
    mut reader: R,
    max: u64,
    chunk: usize,
    mut sink: impl FnMut(&[u8]) -> std::io::Result<()>,
) -> Result<u64, PickedError> {
    let mut buffer = vec![0_u8; chunk.max(1)];
    let mut total = 0_u64;
    loop {
        let n = match reader.read(&mut buffer) {
            Ok(0) => return Ok(total),
            Ok(n) => n,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(PickedError::Io(e)),
        };
        total = total.saturating_add(n as u64);
        if total > max {
            return Err(PickedError::TooLarge);
        }
        sink(buffer.get(..n).unwrap_or_default()).map_err(PickedError::Io)?;
    }
}

/// The file the person picked at `path`, copied in pieces of [`PICK_CHUNK`]
/// to `sink` — the same refusals as [`read_picked`] (not a regular file, a
/// placeholder, more than `max`), but never the whole file in memory. The
/// number of bytes copied.
///
/// # Errors
/// [`PickedError`]; `sink`'s own failure comes back as [`PickedError::Io`].
pub fn copy_picked(
    path: &Path,
    max: u64,
    sink: impl FnMut(&[u8]) -> std::io::Result<()>,
) -> Result<u64, PickedError> {
    if crate::placeholder::stands_in(path).map_err(PickedError::Io)? {
        return Err(PickedError::Placeholder);
    }
    let (file, len) = open_regular(path)?;
    if len > max {
        return Err(PickedError::TooLarge);
    }
    copy_bounded(file, max, PICK_CHUNK, sink)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checking_a_pick_measures_it_and_reads_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.bin");
        std::fs::write(&p, vec![0u8; 11]).unwrap();
        assert_eq!(check_picked(&p, 11).unwrap(), 11);
        assert!(matches!(check_picked(&p, 10), Err(PickedError::TooLarge)));
        assert!(matches!(
            check_picked(dir.path(), 100),
            Err(PickedError::NotAFile)
        ));
        assert!(matches!(
            check_picked(&dir.path().join("none"), 100),
            Err(PickedError::Io(_))
        ));
    }

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

    /// A FIFO is no regular file and opening it does not wait for a writer
    /// (review M6): the answer comes at once, whoever swapped it in.
    #[cfg(unix)]
    #[test]
    fn a_fifo_is_refused_without_waiting_for_a_writer() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("pipe");
        let made = std::process::Command::new("mkfifo")
            .arg(&p)
            .status()
            .unwrap();
        assert!(made.success());
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(matches!(read_picked(&p, 100), Err(PickedError::NotAFile)));
        });
        let refused = rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("read_picked waited on the FIFO");
        assert!(refused);
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

    /// A reader that fails the test if it is asked for more than one chunk.
    struct Strict {
        left: usize,
        chunk: usize,
    }
    impl Read for Strict {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            assert!(buf.len() <= self.chunk, "asked for {} bytes", buf.len());
            let n = buf.len().min(self.left);
            buf[..n].fill(7);
            self.left -= n;
            Ok(n)
        }
    }

    #[test]
    fn copying_never_asks_for_more_than_a_chunk() {
        let chunk = 4096;
        let mut seen = 0_u64;
        let n = copy_bounded(
            Strict {
                left: 50 * chunk + 3,
                chunk,
            },
            u64::MAX,
            chunk,
            |piece| {
                assert!(piece.len() <= chunk);
                seen += piece.len() as u64;
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(n, 50 * chunk as u64 + 3);
        assert_eq!(seen, n);
    }

    #[test]
    fn copying_stops_at_the_bound_and_on_a_sink_failure() {
        let r = Strict {
            left: 100,
            chunk: 16,
        };
        assert!(matches!(
            copy_bounded(r, 99, 16, |_| Ok(())),
            Err(PickedError::TooLarge)
        ));
        let r = Strict {
            left: 100,
            chunk: 16,
        };
        assert!(matches!(
            copy_bounded(r, 100, 16, |_| Err(std::io::Error::other("full"))),
            Err(PickedError::Io(_))
        ));
    }

    #[test]
    fn copy_picked_refuses_like_read_picked() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.bin");
        std::fs::write(&p, vec![1u8; 11]).unwrap();
        assert!(matches!(
            copy_picked(&p, 10, |_| Ok(())),
            Err(PickedError::TooLarge)
        ));
        assert!(matches!(
            copy_picked(dir.path(), 10, |_| Ok(())),
            Err(PickedError::NotAFile)
        ));
        let stub = dir.path().join(".Foto.png.icloud");
        std::fs::write(&stub, b"stub").unwrap();
        assert!(matches!(
            copy_picked(&stub, 100, |_| Ok(())),
            Err(PickedError::Placeholder)
        ));
        assert_eq!(copy_picked(&p, 11, |_| Ok(())).unwrap(), 11);
    }
}
