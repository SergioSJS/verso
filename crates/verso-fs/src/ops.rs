// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Creating, renaming and trashing a file of the folder (ADR 0048, Phase
//! 2 item 2.3). The same care as the atomic write: a new file is written
//! under a temporary name, synced, and given its final name by a step that
//! fails instead of replacing whatever appeared there meanwhile — on macOS
//! an exclusive rename (`renamex_np` with `RENAME_EXCL`), elsewhere `link`
//! then removing the old name; a regular file is moved the same way, so a
//! rename never replaces a file either. macOS does not link because
//! FSEvents never reports the removal of a file named by `link`: deleted
//! later by another program, it would stay in the tree (ADR 0069, revised
//! 2026-10-11). A deletion is a move into `.trash/` at the root, as Obsidian
//! does, so a folder shared with it shows the same bin — nothing is
//! unlinked here. Parent directories are created as needed and every
//! directory touched or created is synced, so the operation survives a
//! power loss (ADR 0029). What fails once the entry is in place is
//! reported in an [`OpReport`], not raised: a retry of a rename that
//! already happened would answer `Exists`, the opposite of the truth.

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use crate::placeholder;
use crate::write::{self, COUNTER, WriteError, WriteReport, network_fs};
use crate::{ReadError, Stamp, fnv1a};

/// What a create, rename or trash noticed once the entry was in place.
/// Nothing here means the operation did not happen; each field is for the
/// user to see. [`OpReport::warnings`] lists them.
#[must_use = "the report says whether durability was confirmed"]
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct OpReport {
    /// The [`Stamp`] of a file that was just created, for its first write;
    /// `None` for a rename or a trash, or when the stamp could not be
    /// read back after the file was in place.
    pub stamp: Option<Stamp>,
    /// The folder's file system is not local (macOS `MNT_LOCAL` absent):
    /// the rename is not atomic between client and server (ADR 0029).
    pub network_fs: Option<String>,
    /// The entry is in place but a step after that failed — a directory
    /// `fsync`, or reading the new stamp — with the error's text. A power
    /// loss before the disk flushes could still lose the change.
    pub durability_not_confirmed: Option<String>,
    /// A name that should have gone away is still there — the temporary
    /// file of a create, or the old name of a move — with the error that
    /// left it. The new name holds the content either way.
    pub leftover: Option<String>,
    /// The volume has no hard links (exFAT, FAT, some network and cloud
    /// file systems): the file got its name by a `rename` after a
    /// last-moment check instead of by `link`, so a file created at the
    /// destination in that instant would have been replaced.
    pub no_hard_links: bool,
}

impl OpReport {
    /// What the caller should tell the user, one line each.
    #[must_use]
    pub fn warnings(&self) -> Vec<String> {
        let mut out = Vec::new();
        if let Some(fs) = &self.network_fs {
            out.push(format!(
                "the folder is on a network file system ({fs}); rename is not atomic there"
            ));
        }
        if let Some(error) = &self.durability_not_confirmed {
            out.push(format!(
                "the entry is in place but its durability was not confirmed: {error}"
            ));
        }
        if let Some(what) = &self.leftover {
            out.push(what.clone());
        }
        if self.no_hard_links {
            out.push(
                "this volume has no hard links: the name was checked just before the move, not claimed by it"
                    .to_owned(),
            );
        }
        out
    }
}

/// How [`claim`] or [`place`] gave a file its new name.
pub(crate) enum Placed {
    /// In a step that refuses an existing name — an exclusive rename on
    /// macOS, `link` then removing the old name elsewhere; `removal` is the
    /// error that left the old name behind after a `link`, if any.
    Claimed { removal: Option<std::io::Error> },
    /// By a last-moment check and `rename`: the volume has no hard links.
    Renamed,
}

/// Whether `link` failed because the volume or the pair of paths cannot
/// have hard links at all, rather than because of the destination.
fn no_hard_links(e: &std::io::Error) -> bool {
    use std::io::ErrorKind;
    not_supported(e)
        || matches!(
            e.kind(),
            ErrorKind::PermissionDenied | ErrorKind::CrossesDevices | ErrorKind::TooManyLinks
        )
}

/// Whether the volume answered "operation not supported". std calls only
/// `ENOSYS` `Unsupported`, and leaves `ENOTSUP` and `EOPNOTSUPP`
/// uncategorized — which is what exFAT on macOS answers to both `link`
/// and `renamex_np` with `RENAME_EXCL` (errno 45, measured on a mounted
/// exFAT image on 2026-10-12): read by number here, so that such a volume
/// falls back as decided (ADR 0048, volumes without hard links) instead
/// of refusing every new file.
fn not_supported(e: &std::io::Error) -> bool {
    if e.kind() == std::io::ErrorKind::Unsupported {
        return true;
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use nix::errno::Errno;
        e.raw_os_error()
            .is_some_and(|n| n == Errno::ENOTSUP as i32 || n == Errno::EOPNOTSUPP as i32)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        false
    }
}

/// Whether the exclusive rename was refused for the volume's sake — it
/// does not offer the flag (`not_supported`), or does not know it
/// (`InvalidInput`) — rather than for the names'.
#[cfg(any(test, target_os = "macos"))]
fn no_exclusive_rename(e: &std::io::Error) -> bool {
    not_supported(e) || e.kind() == std::io::ErrorKind::InvalidInput
}

/// Give the regular file `from` the name `to` without replacing whatever
/// stands there: `link`, which fails on an existing name, then removing
/// `from`. On a volume without hard links — exFAT and FAT on removable
/// drives, some network and cloud file systems — `link` cannot work at
/// all, so the name is checked once more and `from` renamed, and the
/// caller reports that the guard was weaker. `link` is a parameter so
/// that a test can stand in a volume without hard links.
fn place(
    from: &Path,
    to: &Path,
    link: impl Fn(&Path, &Path) -> std::io::Result<()>,
) -> Result<Placed, WriteError> {
    match link(from, to) {
        Ok(()) => Ok(Placed::Claimed {
            removal: std::fs::remove_file(from).err(),
        }),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Err(WriteError::Exists),
        Err(e) if no_hard_links(&e) => {
            if occupied(to).map_err(WriteError::Io)? {
                return Err(WriteError::Exists);
            }
            // A wait for a held file (Windows) looks again before each try:
            // something that appeared at `to` meanwhile is never replaced.
            let still_free = || matches!(occupied(to), Ok(false));
            if !crate::os::rename_unless_changed(from, to, still_free).map_err(WriteError::Io)? {
                return Err(WriteError::Exists);
            }
            Ok(Placed::Renamed)
        }
        Err(e) => Err(WriteError::Io(e)),
    }
}

/// Give the regular file `from` the name `to` without replacing whatever
/// stands there. On macOS, an exclusive rename: one step, nothing left to
/// remove, and FSEvents reports the file's later removal, which it never
/// does for a name given by `link` (ADR 0069, revised 2026-10-11); a
/// volume without that rename falls back to [`place`]. Elsewhere,
/// [`place`]: inotify and `ReadDirectoryChangesW` report the removal of a
/// linked file.
#[cfg(target_os = "macos")]
pub(crate) fn claim(from: &Path, to: &Path) -> Result<Placed, WriteError> {
    claim_by(from, to, crate::os::rename_exclusive)
}

/// [`claim`] off macOS: [`place`].
#[cfg(not(target_os = "macos"))]
pub(crate) fn claim(from: &Path, to: &Path) -> Result<Placed, WriteError> {
    place(from, to, |a, b| std::fs::hard_link(a, b))
}

/// [`claim`] on macOS, with the exclusive rename a parameter so that a
/// test can stand in a volume without it.
#[cfg(any(target_os = "macos", all(test, target_os = "linux")))]
fn claim_by(
    from: &Path,
    to: &Path,
    rename_exclusive: impl Fn(&Path, &Path) -> std::io::Result<()>,
) -> Result<Placed, WriteError> {
    match rename_exclusive(from, to) {
        Ok(()) => Ok(Placed::Claimed { removal: None }),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Err(WriteError::Exists),
        Err(e) if no_exclusive_rename(&e) => place(from, to, |a, b| std::fs::hard_link(a, b)),
        Err(e) => Err(WriteError::Io(e)),
    }
}

/// The name of the folder's file system when a file Verso creates or
/// moves there is named by `link`: the volume does not offer the
/// exclusive rename (`renamex_np` with `RENAME_EXCL`, optional for a
/// volume, `VOL_CAP_INT_RENAME_EXCL`) and does offer hard links — some
/// network volumes. FSEvents may never report the later removal of such a
/// file by another program (ADR 0069, revised 2026-10-11): that change
/// shows late, at a reindex or at sync's scan. Verso's own writes are as
/// safe as anywhere. A volume with neither — exFAT — names a file by a
/// checked rename, which FSEvents does report, and each create or move
/// there says its guard was weaker ([`OpReport`]); FAT32 and APFS have
/// the exclusive rename (measured on mounted images, 2026-10-12). APFS
/// and HFS+ are answered from their name alone; any other volume is asked
/// by trying, once, on an empty file of the probe's own made under a
/// temporary name the walk and the watcher never list, and removed after.
/// `None` when nothing is named by `link` there, when it could not be
/// told (a folder Verso cannot write to), and off macOS, where `link` is
/// the rule and the removal of a linked file is heard.
#[cfg(target_os = "macos")]
pub(crate) fn names_by_link(dir: &Path) -> Option<String> {
    let fs = nix::sys::statfs::statfs(dir)
        .ok()?
        .filesystem_type_name()
        .to_owned();
    if matches!(fs.as_str(), "apfs" | "hfs") {
        return None;
    }
    probe_names_by_link(dir, crate::os::rename_exclusive, |a, b| {
        std::fs::hard_link(a, b)
    })
    .then_some(fs)
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn names_by_link(_dir: &Path) -> Option<String> {
    None
}

/// Whether [`claim_by`] would name a file in `dir` by `link`: the
/// exclusive `rename` refused for the volume's sake, and `link` working
/// there. Tried on an empty file made in `dir` under a temporary name;
/// false when the file cannot be made, or the rename fails for another
/// reason — nothing is said that was not seen. Every name the probe made
/// is removed after. `rename` and `link` are parameters so that a test
/// can stand in a volume without them.
#[cfg(any(test, target_os = "macos"))]
fn probe_names_by_link(
    dir: &Path,
    rename: impl Fn(&Path, &Path) -> std::io::Result<()>,
    link: impl Fn(&Path, &Path) -> std::io::Result<()>,
) -> bool {
    let from = temporary_name(dir);
    let to = temporary_name(dir);
    if File::options()
        .write(true)
        .create_new(true)
        .open(&from)
        .is_err()
    {
        return false;
    }
    let by_link = match rename(&from, &to) {
        Ok(()) => false,
        Err(e) if no_exclusive_rename(&e) => link(&from, &to).is_ok(),
        Err(_) => false,
    };
    for left in [&from, &to] {
        if left.symlink_metadata().is_ok() {
            // A file of the probe's own, empty: a failure to remove it
            // leaves a hidden name the walk never lists, nothing of the
            // person's.
            let _ = std::fs::remove_file(left);
        }
    }
    by_link
}

use crate::os::sync_dir;

/// Something already stands at `path` — a file, a directory, or a
/// placeholder for it.
pub(crate) fn occupied(path: &Path) -> Result<bool, std::io::Error> {
    Ok(path.symlink_metadata().is_ok() || placeholder::stands_in(path)?)
}

/// Create `dir` and the parents it lacks, and return the directories that
/// did not exist, shallowest first, so the caller can sync each of them
/// and the one they hang from once the entry is in place.
pub(crate) fn create_dirs(dir: &Path) -> Result<Vec<PathBuf>, std::io::Error> {
    let mut missing = Vec::new();
    let mut current = Some(dir);
    while let Some(p) = current {
        match p.symlink_metadata() {
            Ok(_) => break,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                missing.push(p.to_path_buf());
                current = p.parent();
            }
            Err(e) => return Err(e),
        }
    }
    missing.reverse();
    std::fs::create_dir_all(dir)?;
    Ok(missing)
}

/// Sync `dir` — where the entry landed — and every directory that was
/// created on the way to it, plus the parent of the shallowest one, whose
/// entry for it is what makes the new branch reachable after a power loss.
pub(crate) fn sync_created(dir: &Path, created: &[PathBuf]) -> Result<(), std::io::Error> {
    sync_dir(dir)?;
    for d in created.iter().rev() {
        if d != dir {
            sync_dir(d)?;
        }
    }
    if let Some(parent) = created.first().and_then(|d| d.parent()) {
        sync_dir(parent)?;
    }
    Ok(())
}

pub(crate) fn parent_of(path: &Path) -> Result<&Path, WriteError> {
    path.parent().ok_or_else(|| {
        WriteError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "a file of the folder has a parent",
        ))
    })
}

pub(crate) fn temporary_name(dir: &Path) -> PathBuf {
    dir.join(crate::sweep::temp_name(
        COUNTER.fetch_add(1, Ordering::Relaxed),
    ))
}

/// Write `content` to a path that does not exist yet.
pub(crate) fn create_atomically(path: &Path, content: &[u8]) -> Result<OpReport, WriteError> {
    if occupied(path).map_err(WriteError::Io)? {
        return Err(WriteError::Exists);
    }
    let dir = parent_of(path)?;
    let created = create_dirs(dir).map_err(WriteError::Io)?;
    let temp = temporary_name(dir);
    // Everything up to and including the final name: a failure here
    // leaves nothing at `path` and removes the temporary file.
    let written = (|| {
        let mut out = File::create_new(&temp)?;
        out.write_all(content)?;
        out.sync_all()
    })();
    if let Err(e) = written {
        let _ = std::fs::remove_file(&temp);
        return Err(WriteError::Io(e));
    }
    claim_new(path, &created, &temp, fnv1a(content))
}

/// Give `temp`, written and synced, the name `path`, which must not exist:
/// in a step that fails if anything appeared there since the caller
/// looked, the folders on the way (`created`, made by the caller) synced
/// once it is in place. A failure removes `temp`.
pub(crate) fn claim_new(
    path: &Path,
    created: &[PathBuf],
    temp: &Path,
    content_hash: u64,
) -> Result<OpReport, WriteError> {
    let dir = parent_of(path)?;
    // The final name is claimed in a step that fails if anything appeared
    // there since the check above: no window in which a file created by
    // someone else is replaced (a plain `rename` would replace it).
    let placed = match claim(temp, path) {
        Ok(placed) => placed,
        Err(e) => {
            let _ = std::fs::remove_file(temp);
            return Err(e);
        }
    };
    // The file is in place: from here on, report rather than fail.
    let mut report = OpReport {
        network_fs: network_fs(dir),
        ..OpReport::default()
    };
    match placed {
        Placed::Claimed { removal: Some(e) } => {
            report.leftover = Some(format!(
                "a temporary file was left behind ({}): {e}",
                temp.file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default()
            ));
        }
        Placed::Claimed { removal: None } => {}
        Placed::Renamed => report.no_hard_links = true,
    }
    let after = (|| {
        sync_created(dir, created)?;
        // The temporary file's folder, when it is another (a file that
        // arrived in pieces waited in the nearest folder that existed):
        // its entry went away with the move.
        if let Some(from) = temp.parent()
            && from != dir
        {
            sync_dir(from)?;
        }
        let meta = std::fs::metadata(path)?;
        Ok::<Stamp, std::io::Error>(Stamp {
            modified: meta.modified()?,
            len: meta.len(),
            hash: content_hash,
        })
    })();
    match after {
        Ok(stamp) => report.stamp = Some(stamp),
        Err(e) => report.durability_not_confirmed = Some(e.to_string()),
    }
    Ok(report)
}

/// Create the directory `dir` (and its parents), synced into its parent.
/// `rmdir`: only an empty directory goes, and a symlink is never followed.
/// `Ok(false)` when it is not an empty directory.
pub(crate) fn remove_empty_directory(dir: &Path) -> Result<bool, WriteError> {
    match std::fs::symlink_metadata(dir) {
        Ok(m) if m.is_dir() => {}
        Ok(_) => return Ok(false),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(WriteError::Io(e)),
    }
    match std::fs::remove_dir(dir) {
        Ok(()) => Ok(true),
        Err(e)
            if matches!(
                e.kind(),
                std::io::ErrorKind::DirectoryNotEmpty | std::io::ErrorKind::NotFound
            ) =>
        {
            Ok(false)
        }
        Err(e) => Err(WriteError::Io(e)),
    }
}

pub(crate) fn create_directory(dir: &Path) -> Result<OpReport, WriteError> {
    let created = create_dirs(dir).map_err(WriteError::Io)?;
    let mut report = OpReport::default();
    if let Err(e) = sync_created(dir, &created) {
        report.durability_not_confirmed = Some(e.to_string());
    }
    Ok(report)
}

/// Whether `a` and `b` are two names of one inode in one directory: a
/// rename that changes only the case or the Unicode normalization of a
/// name on a file system that looks names up without regard to either
/// (APFS, NTFS) finds the source itself standing at the destination.
/// Neither followed: a symlink is compared as itself.
fn same_entry(a: &Path, a_meta: &std::fs::Metadata, b: &Path, b_meta: &std::fs::Metadata) -> bool {
    match (
        crate::os::file_id(a, a_meta, false),
        crate::os::file_id(b, b_meta, false),
    ) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

/// Whether the paths `a` and `b` name one entry, neither followed: a
/// rename's source met under another spelling of its name.
pub(crate) fn same_entry_at(a: &Path, b: &Path) -> bool {
    match (a.symlink_metadata(), b.symlink_metadata()) {
        (Ok(a_meta), Ok(b_meta)) => same_entry(a, &a_meta, b, &b_meta),
        _ => false,
    }
}

/// Whether the directory `dir` lists an entry named exactly `name`, byte
/// for byte — what a case-insensitive lookup cannot tell.
fn lists_exactly(dir: &Path, name: &std::ffi::OsStr) -> Result<bool, std::io::Error> {
    for entry in std::fs::read_dir(dir)? {
        if entry?.file_name() == name {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Move `from` to `to`, refusing an occupied destination.
pub(crate) fn rename_path(from: &Path, to: &Path) -> Result<OpReport, WriteError> {
    if placeholder::stands_in(from).map_err(WriteError::Io)? {
        return Err(WriteError::Placeholder);
    }
    if from == to {
        return Ok(OpReport::default());
    }
    let from_meta = from.symlink_metadata().map_err(WriteError::Io)?;
    let to_dir = parent_of(to)?;
    let from_dir = parent_of(from)?;
    if occupied(to).map_err(WriteError::Io)? {
        // The destination is the source under another spelling of the
        // same name: a case-only rename on APFS. The rename happens in
        // place; the directory listing then says whether it did — two hard
        // links to one file in one directory make `rename` a no-op.
        let same_inode = to
            .symlink_metadata()
            .is_ok_and(|to_meta| same_entry(from, &from_meta, to, &to_meta));
        if !(same_inode && from_dir == to_dir) {
            return Err(WriteError::Exists);
        }
        crate::os::rename(from, to).map_err(WriteError::Io)?;
        let (Some(old_name), Some(new_name)) = (from.file_name(), to.file_name()) else {
            return Err(WriteError::Exists);
        };
        if lists_exactly(to_dir, old_name).map_err(WriteError::Io)?
            || !lists_exactly(to_dir, new_name).map_err(WriteError::Io)?
        {
            return Err(WriteError::Exists);
        }
        return Ok(finish_move(to_dir, from_dir, &[], None));
    }
    let created = create_dirs(to_dir).map_err(WriteError::Io)?;
    let mut leftover = None;
    let mut unguarded = false;
    if from_meta.is_file() {
        // A regular file is given its new name by a step that fails
        // rather than replacing a file that appeared at `to` after the
        // check above ([`claim`]). Same inode: mode, owner, attributes and
        // modification time travel with it.
        match claim(from, to)? {
            Placed::Claimed { removal: Some(e) } => {
                leftover = Some(format!(
                    "moved, but the old name could not be removed and still points at the same content: {e}"
                ));
            }
            Placed::Claimed { removal: None } => {}
            Placed::Renamed => unguarded = true,
        }
    } else {
        // A directory or a symlink cannot be hard-linked: checked once more
        // at the last moment, then renamed. The window between the check
        // and the rename is the best a portable rename offers for these.
        if occupied(to).map_err(WriteError::Io)? {
            return Err(WriteError::Exists);
        }
        crate::os::rename(from, to).map_err(WriteError::Io)?;
    }
    let mut report = finish_move(to_dir, from_dir, &created, leftover);
    report.no_hard_links = unguarded;
    Ok(report)
}

/// The entry is at its new name: sync the directories and report what
/// could not be confirmed.
fn finish_move(
    to_dir: &Path,
    from_dir: &Path,
    created: &[PathBuf],
    leftover: Option<String>,
) -> OpReport {
    let mut report = OpReport {
        network_fs: network_fs(to_dir),
        leftover,
        ..OpReport::default()
    };
    let synced = (|| {
        sync_created(to_dir, created)?;
        if from_dir != to_dir {
            sync_dir(from_dir)?;
        }
        Ok::<(), std::io::Error>(())
    })();
    if let Err(e) = synced {
        report.durability_not_confirmed = Some(e.to_string());
    }
    report
}

/// Move `relative` (under `root`) into `.trash/` at the root, keeping its
/// relative path; a name already in the bin gets ` (2)`, ` (3)`… before
/// its extension. Returns where it went, relative to the root.
pub(crate) fn trash(root: &Path, relative: &Path) -> Result<(PathBuf, OpReport), WriteError> {
    let from = crate::on_disk(root, relative);
    if placeholder::stands_in(&from).map_err(WriteError::Io)? {
        return Err(WriteError::Placeholder);
    }
    let target = crate::trashbin::free_name(root, relative)?;
    let report = rename_path(&from, &crate::on_disk(root, &target))?;
    Ok((target, report))
}

/// The single file under a hidden directory that Verso reads and writes
/// (ADR 0062 D7): make.md's focuses, kept at `.space/waypoints.json`.
pub const WAYPOINTS_PATH: &str = ".space/waypoints.json";

/// Read `.space/waypoints.json` under `root` and its [`Stamp`] (ADR 0062 D7).
/// Returns `NotFound` when there is no such file; returns `Unavailable` when
/// the file is an iCloud placeholder (Invariant 10).
pub(crate) fn read_waypoints(root: &Path) -> Result<(Vec<u8>, Stamp), ReadError> {
    let target = crate::on_disk(root, Path::new(WAYPOINTS_PATH));
    if placeholder::stands_in(&target).map_err(ReadError::Io)? {
        return Err(ReadError::Unavailable);
    }
    if !target.exists() {
        return Err(ReadError::Io(std::io::Error::from(
            std::io::ErrorKind::NotFound,
        )));
    }
    let bytes = std::fs::read(&target).map_err(ReadError::Io)?;
    let meta = std::fs::metadata(&target).map_err(ReadError::Io)?;
    let stamp = Stamp::of(&meta, &bytes).map_err(ReadError::Io)?;
    Ok((bytes, stamp))
}

/// Write `.space/waypoints.json` under `root` atomically (ADR 0029, ADR 0062 D7),
/// checking that the file is the one read (`expected`, Invariant 11).
pub(crate) fn write_waypoints(
    root: &Path,
    content: &[u8],
    expected: &Stamp,
) -> Result<WriteReport, WriteError> {
    let target = crate::on_disk(root, Path::new(WAYPOINTS_PATH));
    if placeholder::stands_in(&target).map_err(WriteError::Io)? {
        return Err(WriteError::Placeholder);
    }
    write::write_atomically(&target, content, expected)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_links(_: &Path, _: &Path) -> std::io::Result<()> {
        Err(std::io::Error::from(std::io::ErrorKind::Unsupported))
    }

    /// "Operation not supported" as the system says it, which std leaves
    /// uncategorized: what exFAT on macOS answers to `link` and to the
    /// exclusive rename.
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    fn enotsup(_: &Path, _: &Path) -> std::io::Result<()> {
        Err(std::io::Error::from_raw_os_error(
            nix::errno::Errno::ENOTSUP as i32,
        ))
    }

    /// exFAT on macOS refused every new file before 2026-10-12: its
    /// "operation not supported" (errno 45) was not taken for a volume
    /// without the exclusive rename, nor without hard links. Now the file
    /// is named by a checked rename, as ADR 0048 decided for such volumes.
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn an_uncategorized_not_supported_falls_back_as_decided() {
        let dir = tempfile::tempdir().unwrap();
        let from = dir.path().join("a");
        let to = dir.path().join("b");
        std::fs::write(&from, b"x").unwrap();
        assert!(matches!(place(&from, &to, enotsup), Ok(Placed::Renamed)));
        assert_eq!(std::fs::read(&to).unwrap(), b"x");
        // No exclusive rename: `link` names it, where the volume has it.
        let other = dir.path().join("c");
        assert!(matches!(
            claim_by(&to, &other, enotsup),
            Ok(Placed::Claimed { removal: None })
        ));
        assert!(!to.exists());
        assert_eq!(std::fs::read(&other).unwrap(), b"x");
        // An existing name is still refused, and any other failure is
        // still an error.
        std::fs::write(&from, b"y").unwrap();
        assert!(matches!(
            claim_by(&from, &other, enotsup),
            Err(WriteError::Exists)
        ));
        let denied = |_: &Path, _: &Path| -> std::io::Result<()> {
            Err(std::io::Error::other("disk on fire"))
        };
        assert!(matches!(
            claim_by(&from, &dir.path().join("d"), denied),
            Err(WriteError::Io(_))
        ));
        assert_eq!(std::fs::read(&other).unwrap(), b"x");
    }

    /// A volume that names files by `link` is told by trying once, on a
    /// file of the probe's own, which is gone afterwards whatever the
    /// answer; a volume with the exclusive rename, one with neither, or a
    /// folder the probe cannot write to, is never said to.
    #[test]
    fn a_volume_that_names_by_link_is_told_and_nothing_is_left() {
        let dir = tempfile::tempdir().unwrap();
        let listed = || std::fs::read_dir(dir.path()).unwrap().count();
        let linked = |a: &Path, b: &Path| std::fs::hard_link(a, b);
        let invalid = |_: &Path, _: &Path| -> std::io::Result<()> {
            Err(std::io::Error::from(std::io::ErrorKind::InvalidInput))
        };
        // No exclusive rename, hard links: some network volumes.
        assert!(probe_names_by_link(dir.path(), no_links, linked));
        assert_eq!(listed(), 0);
        assert!(probe_names_by_link(dir.path(), invalid, linked));
        assert_eq!(listed(), 0);
        // Neither: exFAT — a checked rename, which FSEvents reports.
        assert!(!probe_names_by_link(dir.path(), no_links, no_links));
        assert_eq!(listed(), 0);
        // The exclusive rename works: APFS, FAT32.
        let renamed = |a: &Path, b: &Path| std::fs::rename(a, b);
        assert!(!probe_names_by_link(dir.path(), renamed, linked));
        assert_eq!(listed(), 0);
        // Another failure says nothing of the volume.
        let other = |_: &Path, _: &Path| -> std::io::Result<()> {
            Err(std::io::Error::other("disk on fire"))
        };
        assert!(!probe_names_by_link(dir.path(), other, linked));
        assert_eq!(listed(), 0);
        // A folder that is not there: nothing could be tried.
        let nowhere = dir.path().join("nowhere");
        assert!(!probe_names_by_link(&nowhere, no_links, linked));
        // The folder of a test is on the machine's own disk.
        assert_eq!(names_by_link(dir.path()), None);
        assert_eq!(listed(), 0);
    }

    /// exFAT answers `link` with "operation not supported": a create or a
    /// move must still happen there, by a checked rename, and say so.
    #[test]
    fn without_hard_links_a_name_is_placed_by_a_checked_rename() {
        let dir = tempfile::tempdir().unwrap();
        let from = dir.path().join("a");
        let to = dir.path().join("b");
        std::fs::write(&from, b"x").unwrap();
        assert!(matches!(place(&from, &to, no_links), Ok(Placed::Renamed)));
        assert!(!from.exists());
        assert_eq!(std::fs::read(&to).unwrap(), b"x");
        // An occupied destination is still refused, and left alone.
        std::fs::write(&from, b"y").unwrap();
        assert!(matches!(
            place(&from, &to, no_links),
            Err(WriteError::Exists)
        ));
        assert_eq!(std::fs::read(&to).unwrap(), b"x");
        assert_eq!(std::fs::read(&from).unwrap(), b"y");
        // Any other failure of `link` is still an error.
        let denied = |_: &Path, _: &Path| -> std::io::Result<()> {
            Err(std::io::Error::other("disk on fire"))
        };
        assert!(matches!(
            place(&from, &dir.path().join("c"), denied),
            Err(WriteError::Io(_))
        ));
    }
}
