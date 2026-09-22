// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Atomic write (ADR 0029): temporary file in the target's directory,
//! `fsync` of the file, `rename` over the target, `fsync` of the directory.
//! Before any of it, the file on disk must be the one that was read
//! (invariant 11, ADR 0012) and must not be a placeholder (ADR 0043). A
//! symlink is followed: the write lands on its target and the link stays
//! (ADR 0044). Mode and extended attributes are carried over; owner is not;
//! what could not be preserved is reported, not hidden.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

use crate::{Handle, Stamp, fnv1a, placeholder};

/// Why a write did not happen. Nothing on disk changed in any of these
/// cases, except a temporary file that could not be removed after a failed
/// step, whose error is the one reported.
#[derive(Debug)]
pub enum WriteError {
    UnknownHandle(Handle),
    /// The file on disk is not the one that was read: modified time,
    /// length or content hash differ from `expected`. The caller shows the
    /// diff (invariant 11); nothing was written.
    Changed {
        current: Stamp,
    },
    /// The file is an on-demand storage placeholder (ADR 0043): its content
    /// is in the cloud; writing over it would destroy the marker.
    Placeholder,
    Io(std::io::Error),
}

impl std::fmt::Display for WriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownHandle(h) => write!(f, "unknown handle {h:?}"),
            Self::Changed { .. } => write!(f, "the file on disk changed since it was read"),
            Self::Placeholder => write!(f, "placeholder: content not available, not written"),
            Self::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for WriteError {}

/// What the write managed to keep from the original, and what it noticed.
/// Returned only when the rename happened: the new content is in place.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WriteReport {
    /// The original's permission bits were applied to the new file.
    pub mode_preserved: bool,
    /// The new file has the original's owner. It does when the writer is
    /// the owner; changing the owner otherwise needs privileges this crate
    /// does not ask for (ADR 0029: recorded, not attempted).
    pub owner_preserved: bool,
    /// Extended attributes that could not be copied (name and the error's
    /// text); empty when all were.
    pub xattrs_not_preserved: Vec<(String, String)>,
    /// The original had more than one hard link: the rename replaced this
    /// path's inode, the other links still point at the old content.
    /// Provisional (ADR 0029 left "detect and warn" open): it warns.
    pub hard_link_shared: bool,
    /// The folder's file system is not local (macOS `MNT_LOCAL` absent),
    /// where rename is not atomic between client and server (ADR 0029):
    /// the write still happened; the caller warns. `None` also where the
    /// check is not implemented (not macOS).
    pub network_fs: Option<String>,
    /// The content is in place but its durability step failed after the
    /// rename — the directory `fsync`, or reading the new stamp — with the
    /// error's text. The write is not lost; a power loss before the disk
    /// flushes could still lose the rename.
    pub durability_not_confirmed: Option<String>,
    /// The new [`Stamp`] of the file, for the next write; `None` only when
    /// `durability_not_confirmed` says the stamp could not be read.
    pub stamp: Option<Stamp>,
    /// When the handle named a symlink: the path the write landed on.
    pub wrote_through_symlink_to: Option<PathBuf>,
}

static COUNTER: AtomicU32 = AtomicU32::new(0);

pub(crate) fn write_atomically(
    path: &Path,
    content: &[u8],
    expected: &Stamp,
) -> Result<WriteReport, WriteError> {
    let mut report = WriteReport::default();

    // A placeholder is never written over (ADR 0043): checked on the name
    // as given, before anything else, and again on a symlink's target.
    if placeholder::stands_in(path).map_err(WriteError::Io)? {
        return Err(WriteError::Placeholder);
    }

    // A symlink is followed: the target is what gets replaced (ADR 0044).
    let link_meta = std::fs::symlink_metadata(path).map_err(WriteError::Io)?;
    let target: PathBuf = if link_meta.is_symlink() {
        let resolved = std::fs::canonicalize(path).map_err(WriteError::Io)?;
        report.wrote_through_symlink_to = Some(resolved.clone());
        resolved
    } else {
        path.to_path_buf()
    };

    if report.wrote_through_symlink_to.is_some()
        && placeholder::stands_in(&target).map_err(WriteError::Io)?
    {
        return Err(WriteError::Placeholder);
    }

    // Invariant 11: the file on disk must be the one that was read — by
    // modified time, length and content.
    let original = std::fs::metadata(&target).map_err(WriteError::Io)?;
    let current_bytes = std::fs::read(&target).map_err(WriteError::Io)?;
    let current = Stamp {
        modified: original.modified().map_err(WriteError::Io)?,
        len: original.len(),
        hash: fnv1a(&current_bytes),
    };
    if current != *expected {
        return Err(WriteError::Changed { current });
    }

    let dir = target.parent().ok_or_else(|| {
        WriteError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "a file of the folder has a parent",
        ))
    })?;
    // No stem from the target's name: a long note name must stay writable
    // (NAME_MAX is 255). Dot-prefixed, so a walk never lists it.
    let temp = dir.join(format!(
        ".verso-tmp-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));

    // Everything up to and including the rename: a failure here leaves the
    // original untouched and removes the temporary file.
    let before_rename = (|| {
        let mut out = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        out.write_all(content)?;
        report.mode_preserved = out.set_permissions(original.permissions()).is_ok();
        report.owner_preserved = same_owner(&original, &out.metadata()?);
        // Attributes go on before the barrier, so they are durable with the content.
        report.xattrs_not_preserved = copy_xattrs(&target, &temp);
        out.sync_all()?;
        drop(out);
        report.hard_link_shared = hard_link_count(&original) > 1;
        report.network_fs = network_fs(dir);
        std::fs::rename(&temp, &target)
    })();
    if let Err(error) = before_rename {
        let _ = std::fs::remove_file(&temp);
        return Err(WriteError::Io(error));
    }

    // After the rename the content is in place; what fails from here on is
    // reported in the report, not as a failed write (the caller would
    // otherwise retry and be shown a diff against its own edit).
    // Without the directory fsync the rename may not survive a power loss
    // (ADR 0029).
    let after_rename = (|| {
        File::open(dir)?.sync_all()?;
        let meta = std::fs::metadata(&target)?;
        Ok::<Stamp, std::io::Error>(Stamp {
            modified: meta.modified()?,
            len: meta.len(),
            hash: fnv1a(content),
        })
    })();
    match after_rename {
        Ok(stamp) => report.stamp = Some(stamp),
        Err(error) => report.durability_not_confirmed = Some(error.to_string()),
    }
    Ok(report)
}

/// Copy every extended attribute of `from` onto `to`; return the ones that
/// could not be copied. Finder tags and quarantine live here (ADR 0029).
fn copy_xattrs(from: &Path, to: &Path) -> Vec<(String, String)> {
    let mut failed = Vec::new();
    let names = match xattr::list(from) {
        Ok(names) => names,
        Err(e) => return vec![("*".to_owned(), e.to_string())],
    };
    for name in names {
        let label = name.to_string_lossy().into_owned();
        match xattr::get(from, &name) {
            Ok(Some(value)) => {
                if let Err(e) = xattr::set(to, &name, &value) {
                    failed.push((label, e.to_string()));
                }
            }
            Ok(None) => {}
            Err(e) => failed.push((label, e.to_string())),
        }
    }
    failed
}

#[cfg(unix)]
fn hard_link_count(meta: &std::fs::Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    meta.nlink()
}

#[cfg(unix)]
fn same_owner(original: &std::fs::Metadata, new: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    original.uid() == new.uid() && original.gid() == new.gid()
}

/// The name of the directory's file system if it is not local — macOS
/// says so itself with `MNT_LOCAL` absent from the mount flags, whatever
/// the file system is called. Elsewhere `None`, recorded as not detected.
#[cfg(target_os = "macos")]
fn network_fs(dir: &Path) -> Option<String> {
    let stat = nix::sys::statfs::statfs(dir).ok()?;
    let local = stat.flags().contains(nix::mount::MntFlags::MNT_LOCAL);
    (!local).then(|| stat.filesystem_type_name().to_owned())
}

#[cfg(not(target_os = "macos"))]
fn network_fs(_dir: &Path) -> Option<String> {
    None
}
