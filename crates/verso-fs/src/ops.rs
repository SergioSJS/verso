// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Creating, renaming and trashing a file of the folder (ADR 0048, Phase
//! 2 item 2.3). The same care as the atomic write: a new file is written
//! under a temporary name, synced, and given its final name by `link`,
//! which fails instead of replacing whatever appeared there meanwhile; a
//! regular file is moved the same way, so a rename never replaces a file
//! either; a deletion is a move into `.trash/` at the root, as Obsidian
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
use crate::write::{COUNTER, WriteError, network_fs};
use crate::{Stamp, fnv1a};

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

/// How [`place`] gave a file its new name.
enum Placed {
    /// By `link`, then removing the old name; `removal` is the error that
    /// left the old name behind, if any.
    Linked { removal: Option<std::io::Error> },
    /// By a last-moment check and `rename`: the volume has no hard links.
    Renamed,
}

/// Whether `link` failed because the volume or the pair of paths cannot
/// have hard links at all, rather than because of the destination.
fn no_hard_links(e: &std::io::Error) -> bool {
    use std::io::ErrorKind;
    matches!(
        e.kind(),
        ErrorKind::Unsupported
            | ErrorKind::PermissionDenied
            | ErrorKind::CrossesDevices
            | ErrorKind::TooManyLinks
    )
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
        Ok(()) => Ok(Placed::Linked {
            removal: std::fs::remove_file(from).err(),
        }),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Err(WriteError::Exists),
        Err(e) if no_hard_links(&e) => {
            if occupied(to).map_err(WriteError::Io)? {
                return Err(WriteError::Exists);
            }
            std::fs::rename(from, to).map_err(WriteError::Io)?;
            Ok(Placed::Renamed)
        }
        Err(e) => Err(WriteError::Io(e)),
    }
}

fn sync_dir(dir: &Path) -> Result<(), std::io::Error> {
    File::open(dir)?.sync_all()
}

/// Something already stands at `path` — a file, a directory, or a
/// placeholder for it.
fn occupied(path: &Path) -> Result<bool, std::io::Error> {
    Ok(path.symlink_metadata().is_ok() || placeholder::stands_in(path)?)
}

/// Create `dir` and the parents it lacks, and return the directories that
/// did not exist, shallowest first, so the caller can sync each of them
/// and the one they hang from once the entry is in place.
fn create_dirs(dir: &Path) -> Result<Vec<PathBuf>, std::io::Error> {
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
fn sync_created(dir: &Path, created: &[PathBuf]) -> Result<(), std::io::Error> {
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

fn parent_of(path: &Path) -> Result<&Path, WriteError> {
    path.parent().ok_or_else(|| {
        WriteError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "a file of the folder has a parent",
        ))
    })
}

fn temporary_name(dir: &Path) -> PathBuf {
    dir.join(format!(
        ".verso-tmp-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
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
    // `link` gives the content its final name and fails if anything
    // appeared there since the check above: no window in which a file
    // created by someone else is replaced (a `rename` would replace it).
    let placed = match place(&temp, path, |a, b| std::fs::hard_link(a, b)) {
        Ok(placed) => placed,
        Err(e) => {
            let _ = std::fs::remove_file(&temp);
            return Err(e);
        }
    };
    // The file is in place: from here on, report rather than fail.
    let mut report = OpReport {
        network_fs: network_fs(dir),
        ..OpReport::default()
    };
    match placed {
        Placed::Linked { removal: Some(e) } => {
            report.leftover = Some(format!(
                "a temporary file was left behind ({}): {e}",
                temp.file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default()
            ));
        }
        Placed::Linked { removal: None } => {}
        Placed::Renamed => report.no_hard_links = true,
    }
    let after = (|| {
        sync_created(dir, &created)?;
        let meta = std::fs::metadata(path)?;
        Ok::<Stamp, std::io::Error>(Stamp {
            modified: meta.modified()?,
            len: meta.len(),
            hash: fnv1a(content),
        })
    })();
    match after {
        Ok(stamp) => report.stamp = Some(stamp),
        Err(e) => report.durability_not_confirmed = Some(e.to_string()),
    }
    Ok(report)
}

/// Create the directory `dir` (and its parents), synced into its parent.
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
/// finds the source itself standing at the destination.
#[cfg(unix)]
fn same_entry(a: &std::fs::Metadata, b: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    a.dev() == b.dev() && a.ino() == b.ino()
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
            .is_ok_and(|to_meta| same_entry(&from_meta, &to_meta));
        if !(same_inode && from_dir == to_dir) {
            return Err(WriteError::Exists);
        }
        std::fs::rename(from, to).map_err(WriteError::Io)?;
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
        // A regular file is given its new name by `link`, which fails
        // rather than replacing a file that appeared at `to` after the
        // check above; then the old name is removed. Same inode: mode,
        // owner, attributes and modification time travel with it.
        match place(from, to, |a, b| std::fs::hard_link(a, b))? {
            Placed::Linked { removal: Some(e) } => {
                leftover = Some(format!(
                    "moved, but the old name could not be removed and still points at the same content: {e}"
                ));
            }
            Placed::Linked { removal: None } => {}
            Placed::Renamed => unguarded = true,
        }
    } else {
        // A directory or a symlink cannot be hard-linked: checked once more
        // at the last moment, then renamed. The window between the check
        // and the rename is the best a portable rename offers for these.
        if occupied(to).map_err(WriteError::Io)? {
            return Err(WriteError::Exists);
        }
        std::fs::rename(from, to).map_err(WriteError::Io)?;
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
    let from = root.join(relative);
    if placeholder::stands_in(&from).map_err(WriteError::Io)? {
        return Err(WriteError::Placeholder);
    }
    let bin = Path::new(".trash").join(relative);
    let mut target = bin.clone();
    let mut n = 2;
    while occupied(&root.join(&target)).map_err(WriteError::Io)? {
        let stem = bin
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ext = bin
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        target = bin.with_file_name(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    let report = rename_path(&from, &root.join(&target))?;
    Ok((target, report))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_links(_: &Path, _: &Path) -> std::io::Result<()> {
        Err(std::io::Error::from(std::io::ErrorKind::Unsupported))
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
