// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What each operating system answers differently (ADR 0069, item 9): a
//! file's identity, its hard link count and owner, syncing a directory, and
//! putting a temporary file in place of its target. The Unix half reads
//! `Metadata`; the Windows half opens the path for its attributes and asks
//! the file system through `winapi-util`, whose safe API wraps
//! `GetFileInformationByHandle` (the workspace forbids `unsafe`).

use std::fs::Metadata;
use std::path::Path;

/// The identity of a file or directory on disk, to tell a loop from a long
/// path and one entry under two names from two entries: device and inode
/// on Unix, volume serial number and file index on Windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct FileId {
    volume: u64,
    index: u64,
}

/// The identity of `path`, whose `meta` the caller read: through a symlink
/// when `follow` (from `std::fs::metadata`), of the link itself otherwise
/// (from `symlink_metadata`).
#[cfg(unix)]
pub(crate) fn file_id(_path: &Path, meta: &Metadata, _follow: bool) -> std::io::Result<FileId> {
    use std::os::unix::fs::MetadataExt;
    Ok(FileId {
        volume: meta.dev(),
        index: meta.ino(),
    })
}

#[cfg(windows)]
pub(crate) fn file_id(path: &Path, _meta: &Metadata, follow: bool) -> std::io::Result<FileId> {
    let info = winapi_util::file::information(windows::open_for_attributes(path, follow)?)?;
    Ok(FileId {
        volume: info.volume_serial_number(),
        index: info.file_index(),
    })
}

/// How many names the file at `path` has (`meta` read through symlinks).
/// Unknown on Windows when the file cannot be opened for its attributes:
/// counted as one, its only name.
#[cfg(unix)]
pub(crate) fn link_count(_path: &Path, meta: &Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    meta.nlink()
}

#[cfg(windows)]
pub(crate) fn link_count(path: &Path, _meta: &Metadata) -> u64 {
    windows::open_for_attributes(path, true)
        .and_then(winapi_util::file::information)
        .map_or(1, |info| info.number_of_links())
}

/// Whether `new` has the owner of `original`. On Windows an owner is a
/// security identifier, which std does not expose and reading it needs
/// `unsafe` or a new dependency; a note written there is created by the
/// user who runs the app, in a folder of theirs. Not compared there yet:
/// answered as kept (provisional, ADR 0069, item 9).
#[cfg(unix)]
pub(crate) fn same_owner(original: &Metadata, new: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    original.uid() == new.uid() && original.gid() == new.gid()
}

#[cfg(windows)]
pub(crate) fn same_owner(_original: &Metadata, _new: &Metadata) -> bool {
    true
}

/// `fsync` of a directory, so the entries just made in it survive a power
/// loss (invariant 9, ADR 0029). Windows refuses a directory to a plain
/// open; opened with `FILE_FLAG_BACKUP_SEMANTICS` and write access it
/// takes `FlushFileBuffers` (`sync_all`), as measured on Windows 11 on
/// 2026-10-08 — read access alone is refused with "Access is denied".
#[cfg(unix)]
pub(crate) fn sync_dir(dir: &Path) -> std::io::Result<()> {
    std::fs::File::open(dir)?.sync_all()
}

#[cfg(windows)]
pub(crate) fn sync_dir(dir: &Path) -> std::io::Result<()> {
    windows::open_dir_for_flush(dir)?.sync_all()
}

/// `std::fs::rename`: `from` gets the name `to`, replacing a file there.
/// On Windows a handle another program holds — on either file, or on any
/// file inside a directory being moved: an antivirus or the search indexer
/// reading the file just written, a sync client — fails the rename with a
/// sharing or access error for as long as it is held;
/// the rename is tried again, waiting longer each time, for about two and
/// a half seconds before the error is returned (ADR 0069, item 9; ADR 0029).
#[cfg(unix)]
pub(crate) fn rename(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::rename(from, to)
}

#[cfg(windows)]
pub(crate) fn rename(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut wait = std::time::Duration::from_millis(5);
    for _ in 0..RENAME_ATTEMPTS - 1 {
        match std::fs::rename(from, to) {
            Err(e) if windows::is_held(&e) => {
                std::thread::sleep(wait);
                wait *= 2;
            }
            other => return other,
        }
    }
    std::fs::rename(from, to)
}

/// Tries of a held rename on Windows: 5 + 10 + … + 1280 ms of waiting
/// between the first and the last, about 2.5 s at most.
#[cfg(windows)]
const RENAME_ATTEMPTS: u32 = 10;

#[cfg(windows)]
mod windows {
    use std::fs::{File, OpenOptions};
    use std::os::windows::fs::OpenOptionsExt;
    use std::path::Path;

    // From the Windows SDK (winnt.h, winbase.h, winerror.h); std names
    // none of them.
    const FILE_READ_ATTRIBUTES: u32 = 0x0080;
    const FILE_SHARE_READ: u32 = 0x1;
    const FILE_SHARE_WRITE: u32 = 0x2;
    const FILE_SHARE_DELETE: u32 = 0x4;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    const ERROR_ACCESS_DENIED: i32 = 5;
    const ERROR_SHARING_VIOLATION: i32 = 32;
    const ERROR_LOCK_VIOLATION: i32 = 33;

    const SHARE_ALL: u32 = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;

    /// `path` opened only to read its attributes, sharing everything so it
    /// never stands in another program's way; a directory opens too
    /// (backup semantics); a symlink or junction itself when not `follow`.
    pub(super) fn open_for_attributes(path: &Path, follow: bool) -> std::io::Result<File> {
        let reparse = if follow {
            0
        } else {
            FILE_FLAG_OPEN_REPARSE_POINT
        };
        OpenOptions::new()
            .access_mode(FILE_READ_ATTRIBUTES)
            .share_mode(SHARE_ALL)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | reparse)
            .open(path)
    }

    /// A directory opened so that `FlushFileBuffers` takes it.
    pub(super) fn open_dir_for_flush(dir: &Path) -> std::io::Result<File> {
        OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(SHARE_ALL)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
            .open(dir)
    }

    /// Whether `e` is another program holding one of the files.
    pub(super) fn is_held(e: &std::io::Error) -> bool {
        matches!(
            e.raw_os_error(),
            Some(ERROR_ACCESS_DENIED | ERROR_SHARING_VIOLATION | ERROR_LOCK_VIOLATION)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn a_file_has_one_identity_and_two_files_two() {
        let dir = temp_dir();
        let (a, b) = (dir.path().join("a.md"), dir.path().join("b.md"));
        std::fs::write(&a, "a").unwrap();
        std::fs::write(&b, "b").unwrap();
        let id = |p: &Path| file_id(p, &std::fs::metadata(p).unwrap(), true).unwrap();
        assert_eq!(id(&a), id(&a));
        assert_ne!(id(&a), id(&b));
        let link = dir.path().join("a-again.md");
        std::fs::hard_link(&a, &link).unwrap();
        assert_eq!(id(&a), id(&link));
        assert_eq!(link_count(&a, &std::fs::metadata(&a).unwrap()), 2);
        assert_eq!(link_count(&b, &std::fs::metadata(&b).unwrap()), 1);
        let sub = dir.path().join("sub");
        std::fs::create_dir(&sub).unwrap();
        assert_ne!(id(&sub), id(dir.path()));
        assert_eq!(id(&sub), id(&sub.join(".")));
    }

    #[test]
    fn a_directory_syncs() {
        let dir = temp_dir();
        std::fs::write(dir.path().join("x.md"), "x").unwrap();
        sync_dir(dir.path()).unwrap();
    }

    #[test]
    fn rename_puts_the_file_in_place() {
        let dir = temp_dir();
        let (from, to) = (dir.path().join(".tmp"), dir.path().join("n.md"));
        std::fs::write(&from, "new").unwrap();
        std::fs::write(&to, "old").unwrap();
        rename(&from, &to).unwrap();
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "new");
        assert!(!from.exists());
    }

    /// On Windows a name is found whatever its case: one entry.
    #[cfg(windows)]
    #[test]
    fn a_name_in_another_case_is_the_same_entry() {
        let dir = temp_dir();
        let a = dir.path().join("Nota.md");
        std::fs::write(&a, "a").unwrap();
        let upper = dir.path().join("NOTA.MD");
        let id = |p: &Path| file_id(p, &std::fs::symlink_metadata(p).unwrap(), false).unwrap();
        assert_eq!(id(&a), id(&upper));
    }

    /// A handle that keeps others from renaming the target, released soon
    /// (an antivirus scan), only delays the rename.
    #[cfg(windows)]
    #[test]
    fn rename_waits_for_a_handle_released_soon() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = temp_dir();
        let (from, to) = (dir.path().join(".tmp"), dir.path().join("n.md"));
        std::fs::write(&from, "new").unwrap();
        std::fs::write(&to, "old").unwrap();
        // Shares reading only: no rename or delete while it is open.
        let held = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0x1)
            .open(&to)
            .unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            drop(held);
        });
        rename(&from, &to).unwrap();
        release.join().unwrap();
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "new");
    }

    /// Held for longer than the retries, the rename fails and both files
    /// stay as they were.
    #[cfg(windows)]
    #[test]
    fn rename_gives_up_on_a_handle_kept() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = temp_dir();
        let (from, to) = (dir.path().join(".tmp"), dir.path().join("n.md"));
        std::fs::write(&from, "new").unwrap();
        std::fs::write(&to, "old").unwrap();
        let held = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0x1)
            .open(&to)
            .unwrap();
        let started = std::time::Instant::now();
        let e = rename(&from, &to).unwrap_err();
        assert!(windows::is_held(&e), "{e}");
        assert!(started.elapsed() >= std::time::Duration::from_millis(1000));
        drop(held);
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "old");
        assert_eq!(std::fs::read_to_string(&from).unwrap(), "new");
    }
}
