// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What each operating system answers differently (ADR 0069, item 9): a
//! file's identity, its hard link count and owner, syncing a directory, and
//! putting a temporary file in place of its target. The Unix half reads
//! `Metadata`; the Windows half opens the path for its attributes and asks
//! the file system through `winapi-util`, whose safe API wraps
//! `GetFileInformationByHandle` (the workspace forbids `unsafe`). On macOS
//! a new or moved file takes its name by an exclusive rename (`rustix`),
//! which FSEvents follows to its removal; elsewhere by `link`.

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
/// On Windows the file is opened for its attributes, which can fail: the
/// caller says the count was not checked rather than guessing one.
#[cfg(unix)]
pub(crate) fn link_count(_path: &Path, meta: &Metadata) -> std::io::Result<u64> {
    use std::os::unix::fs::MetadataExt;
    Ok(meta.nlink())
}

#[cfg(windows)]
pub(crate) fn link_count(path: &Path, _meta: &Metadata) -> std::io::Result<u64> {
    Ok(
        winapi_util::file::information(windows::open_for_attributes(path, true)?)?
            .number_of_links(),
    )
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

/// `path`, an existing file's, spelled as its directory holds the name. On
/// NTFS a rename over a file gives it the case of the name it is renamed
/// to, so a write that names `Receita.md` for the file the disk holds as
/// `receita.md` would respell it: the temporary file goes over the name as
/// the disk keeps it, and a write over a file keeps its name (found by the
/// server's sync test on a loaded Windows machine, 2026-10-21). Only the
/// case of the last component can differ: any other answer (a short name,
/// a file that is not there, a path that cannot be resolved) leaves `path`
/// as it was. Other systems keep the name of the file replaced.
#[cfg(windows)]
pub(crate) fn kept_spelling(path: std::path::PathBuf) -> std::path::PathBuf {
    let (Some(name), Some(dir)) = (path.file_name(), path.parent()) else {
        return path;
    };
    let Ok(real) = std::fs::canonicalize(&path) else {
        return path;
    };
    match real.file_name() {
        Some(held)
            if held != name
                && held.to_string_lossy().to_lowercase()
                    == name.to_string_lossy().to_lowercase() =>
        {
            dir.join(held)
        }
        _ => path,
    }
}

#[cfg(not(windows))]
pub(crate) fn kept_spelling(path: std::path::PathBuf) -> std::path::PathBuf {
    path
}

/// `std::fs::rename`: `from` gets the name `to`, replacing a file there.
/// On Windows a handle another program holds — on either file, or on any
/// file inside a directory being moved: an antivirus or the search indexer
/// reading the file just written, a sync client — fails the rename with a
/// sharing or access error for as long as it is held; the rename is tried
/// again, waiting longer each time, for about two and a half seconds before
/// the error is returned (ADR 0069, item 9; ADR 0029).
pub(crate) fn rename(from: &Path, to: &Path) -> std::io::Result<()> {
    rename_unless_changed(from, to, || true).map(|_| ())
}

/// [`rename`], asking `unchanged` before each new try whether `to` is still
/// the file the caller checked (invariant 11): a program that held it may
/// have written it before letting go. `Ok(false)` when it was not: nothing
/// was renamed. On Unix the rename is tried once, asked just before it:
/// the check at the start of a write is followed by the temporary file's
/// write and `fsync` (milliseconds), in which another writer's rename
/// would otherwise be replaced unseen (night round of 2026-10-29: 58% of
/// the writes of four racing writers, measured in `tests/stress.rs`). What
/// remains is the instant between this question and the rename; closing
/// it takes a lock, which a file of the user's cannot be made to carry.
#[cfg(unix)]
pub(crate) fn rename_unless_changed(
    from: &Path,
    to: &Path,
    unchanged: impl Fn() -> bool,
) -> std::io::Result<bool> {
    if !unchanged() {
        return Ok(false);
    }
    std::fs::rename(from, to).map(|()| true)
}

#[cfg(windows)]
pub(crate) fn rename_unless_changed(
    from: &Path,
    to: &Path,
    unchanged: impl Fn() -> bool,
) -> std::io::Result<bool> {
    // Asked before the first try too, as on Unix: the write and `fsync` of
    // the temporary file since the check are the window of an outside writer.
    if !unchanged() {
        return Ok(false);
    }
    // A read-only target is refused for good, not held: no waiting.
    if std::fs::symlink_metadata(to).is_ok_and(|m| m.is_file() && m.permissions().readonly()) {
        return std::fs::rename(from, to).map(|()| true);
    }
    let mut wait = std::time::Duration::from_millis(5);
    for _ in 1..RENAME_ATTEMPTS {
        match std::fs::rename(from, to) {
            Err(e) if windows::is_held(&e) => {
                std::thread::sleep(wait);
                wait *= 2;
                if !unchanged() {
                    return Ok(false);
                }
            }
            other => return other.map(|()| true),
        }
    }
    std::fs::rename(from, to).map(|()| true)
}

/// Tries of a held rename on Windows: 5 + 10 + … + 1280 ms of waiting
/// between the first and the last, about 2.5 s at most.
#[cfg(windows)]
const RENAME_ATTEMPTS: u32 = 10;

/// Give `from` the name `to` in one step that fails with `AlreadyExists`
/// rather than replace whatever stands at `to`: `renamex_np` with
/// `RENAME_EXCL`, reached through `rustix`, whose safe call takes the
/// place of the `unsafe` FFI the workspace forbids. macOS places a new or
/// moved file this way and not by `link` and `unlink`, because FSEvents
/// never reports the removal of a file whose name was given by `link`
/// (ADR 0069, revised 2026-10-11). A volume that does not offer it — the
/// flag is optional for a file system (`VOL_CAP_INT_RENAME_EXCL`) —
/// answers `Unsupported` or `InvalidInput`, and the caller links instead.
/// Paths are resolved as `rename` resolves them: from the working
/// directory when relative, which a path of the folder never is.
#[cfg(target_os = "macos")]
pub(crate) fn rename_exclusive(from: &Path, to: &Path) -> std::io::Result<()> {
    use rustix::fs::{CWD, RenameFlags, renameat_with};
    renameat_with(CWD, from, CWD, to, RenameFlags::NOREPLACE).map_err(std::io::Error::from)
}

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

    /// Whether `e` is another program holding one of the files. A target
    /// held without delete sharing answers "Access is denied", not a
    /// sharing violation (measured on Windows 11, 2026-10-08), so that
    /// error waits too; a read-only target, which answers the same for
    /// good, is told apart before the first try.
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

    /// The question is asked before the first try, on every system: a target
    /// that changed since the check is not renamed over (invariant 11). On
    /// Windows it was asked only after a held try.
    #[test]
    fn a_changed_target_is_not_renamed_over_at_the_first_try() {
        let dir = temp_dir();
        let (from, to) = (dir.path().join("tmp"), dir.path().join("n.md"));
        std::fs::write(&from, "ours").unwrap();
        std::fs::write(&to, "theirs").unwrap();
        assert!(!rename_unless_changed(&from, &to, || false).unwrap());
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "theirs");
        assert!(
            from.exists(),
            "the temporary file is the caller's to remove"
        );
        assert!(rename_unless_changed(&from, &to, || true).unwrap());
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "ours");
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
        assert_eq!(link_count(&a, &std::fs::metadata(&a).unwrap()).unwrap(), 2);
        assert_eq!(link_count(&b, &std::fs::metadata(&b).unwrap()).unwrap(), 1);
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

    /// The exclusive rename moves a file to a free name, and refuses an
    /// occupied one with `AlreadyExists`, leaving both files as they were.
    #[cfg(target_os = "macos")]
    #[test]
    fn an_exclusive_rename_never_replaces() {
        let dir = temp_dir();
        let (from, to) = (dir.path().join(".tmp"), dir.path().join("n.md"));
        std::fs::write(&from, "new").unwrap();
        rename_exclusive(&from, &to).unwrap();
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "new");
        assert!(!from.exists());

        std::fs::write(&from, "newer").unwrap();
        let refused = rename_exclusive(&from, &to).unwrap_err();
        assert_eq!(refused.kind(), std::io::ErrorKind::AlreadyExists);
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "new");
        assert_eq!(std::fs::read_to_string(&from).unwrap(), "newer");
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

    /// The holder wrote the file before letting go (invariant 11): the
    /// rename stops, and both files stay as they are.
    #[cfg(windows)]
    #[test]
    fn rename_stops_when_the_holder_changed_the_target() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = temp_dir();
        let (from, to) = (dir.path().join(".tmp"), dir.path().join("n.md"));
        std::fs::write(&from, "new").unwrap();
        std::fs::write(&to, "old").unwrap();
        let len = std::fs::metadata(&to).unwrap().len();
        let held = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0x1)
            .open(&to)
            .unwrap();
        let release = std::thread::spawn(move || {
            use std::io::Write;
            let mut held = held;
            std::thread::sleep(std::time::Duration::from_millis(100));
            held.write_all(b"theirs, longer").unwrap();
            // Still held a moment after the write, as a program saving
            // and then closing is: the question asked while it holds the
            // file sees the change (dropping at once raced the question
            // on a busy machine, 2026-10-30).
            std::thread::sleep(std::time::Duration::from_millis(100));
            drop(held);
        });
        let still = || std::fs::metadata(&to).is_ok_and(|m| m.len() == len);
        let renamed = rename_unless_changed(&from, &to, still).unwrap();
        release.join().unwrap();
        assert!(!renamed);
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "theirs, longer");
        assert_eq!(std::fs::read_to_string(&from).unwrap(), "new");
    }

    /// A read-only target fails at once: nothing holds it, nothing to wait for.
    #[cfg(windows)]
    #[test]
    fn rename_over_a_read_only_file_fails_without_waiting() {
        let dir = temp_dir();
        let (from, to) = (dir.path().join(".tmp"), dir.path().join("n.md"));
        std::fs::write(&from, "new").unwrap();
        std::fs::write(&to, "old").unwrap();
        let writable = std::fs::metadata(&to).unwrap().permissions();
        let mut read_only = writable.clone();
        read_only.set_readonly(true);
        std::fs::set_permissions(&to, read_only).unwrap();
        let started = std::time::Instant::now();
        assert!(rename(&from, &to).is_err());
        assert!(started.elapsed() < std::time::Duration::from_millis(500));
        std::fs::set_permissions(&to, writable).unwrap();
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "old");
    }
}
