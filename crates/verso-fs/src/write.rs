// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Atomic write (ADR 0029): temporary file in the target's directory,
//! `fsync` of the file, `rename` over the target, `fsync` of the directory.
//! Before any of it, the file on disk must be the one that was read
//! (invariant 11, ADR 0012) and must not be a placeholder (ADR 0043). A
//! symlink is followed: the write lands on its target and the link stays
//! (ADR 0044). Mode and extended attributes are carried over; the owner is
//! reported, never changed; what could not be preserved is reported, not
//! hidden.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

use crate::{Handle, Stamp, fnv1a, os, placeholder, read_pieces};

/// Why a write did not happen. Nothing on disk changed in any of these
/// cases, except a temporary file that could not be removed after a failed
/// step, whose error is the one reported.
#[derive(Debug)]
pub enum WriteError {
    UnknownHandle(Handle),
    /// The path cannot name a file of the folder (`create`, `create_dir`,
    /// `rename`, `trash` take a path, not a handle).
    Confined(crate::ConfinementError),
    /// The file on disk is not the one that was read: modified time,
    /// length or content hash differ from `expected`. The caller shows the
    /// diff (invariant 11); nothing was written.
    Changed {
        current: Stamp,
    },
    /// The file is an on-demand storage placeholder (ADR 0043): its content
    /// is in the cloud; writing over it would destroy the marker.
    Placeholder,
    /// Something already stands at the destination (a create or a rename).
    Exists,
    Io(std::io::Error),
}

impl std::fmt::Display for WriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownHandle(h) => write!(f, "unknown handle {h:?}"),
            Self::Confined(e) => write!(f, "{e}"),
            Self::Changed { .. } => write!(f, "the file on disk changed since it was read"),
            Self::Exists => write!(f, "something already stands at the destination"),
            Self::Placeholder => write!(f, "placeholder: content not available, not written"),
            Self::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for WriteError {}

/// What the write managed to keep from the original, and what it noticed.
/// Returned only when the rename happened: the new content is in place.
/// Several fields mean "tell the user something"; [`WriteReport::warnings`]
/// lists them.
#[must_use = "the report says what was not preserved and whether durability was confirmed"]
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
    /// Whether the original had another hard link could not be read (on
    /// Windows the file is opened for its attributes), with the error's
    /// text: `hard_link_shared` is then unknown, not false.
    pub hard_links_not_checked: Option<String>,
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

impl WriteReport {
    /// What the caller should tell the user, one line each; empty when the
    /// write kept everything and is durable.
    #[must_use]
    pub fn warnings(&self) -> Vec<String> {
        let mut out = Vec::new();
        if !self.mode_preserved {
            out.push("the file's permissions could not be preserved".to_owned());
        }
        if !self.owner_preserved {
            out.push("the file's owner is now the writer".to_owned());
        }
        for (name, error) in &self.xattrs_not_preserved {
            out.push(format!("extended attribute {name} not preserved: {error}"));
        }
        if self.hard_link_shared {
            out.push("the file had another hard link, which keeps the old content".to_owned());
        }
        if let Some(error) = &self.hard_links_not_checked {
            out.push(format!(
                "whether the file had another hard link could not be checked: {error}"
            ));
        }
        if let Some(fs) = &self.network_fs {
            out.push(format!(
                "the folder is on a network file system ({fs}); rename is not atomic there"
            ));
        }
        if let Some(error) = &self.durability_not_confirmed {
            out.push(format!(
                "the content is in place but its durability was not confirmed: {error}"
            ));
        }
        out
    }
}

pub(crate) static COUNTER: AtomicU32 = AtomicU32::new(0);

/// The targets this process is writing right now. Two writers of one
/// process (two windows of the app on one folder, two `Root`s) check and
/// rename in turn, never inside each other's check-to-rename window, which
/// the `fsync` between the two makes milliseconds wide: measured on
/// 2026-10-30 (`tests/stress.rs`), 4 racing writers lost 58% of their
/// accepted writes to each other. Another program writing the same file is
/// still only caught by the checks of [`check`] and [`put_over`].
static WRITING: std::sync::Mutex<Vec<PathBuf>> = std::sync::Mutex::new(Vec::new());
static WRITING_FREED: std::sync::Condvar = std::sync::Condvar::new();

/// A target held for writing; let go when dropped.
pub(crate) struct TargetLock(PathBuf);

impl TargetLock {
    fn take(target: &Path) -> Self {
        // Keyed by the real folder: two spellings of one parent (a symlink,
        // a case difference) are one writer. The target itself may not
        // exist yet, so its parent is what is resolved.
        let target = &match (target.parent(), target.file_name()) {
            (Some(parent), Some(name)) => std::fs::canonicalize(parent)
                .map_or_else(|_| target.to_path_buf(), |real| real.join(name)),
            _ => target.to_path_buf(),
        };
        let mut held = WRITING
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        while held.iter().any(|p| p == target) {
            held = WRITING_FREED
                .wait(held)
                .unwrap_or_else(std::sync::PoisonError::into_inner);
        }
        held.push(target.to_path_buf());
        Self(target.to_path_buf())
    }
}

impl Drop for TargetLock {
    fn drop(&mut self) {
        let mut held = WRITING
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        held.retain(|p| *p != self.0);
        WRITING_FREED.notify_all();
    }
}

pub(crate) fn write_atomically(
    path: &Path,
    content: &[u8],
    expected: &Stamp,
) -> Result<WriteReport, WriteError> {
    let checked = check(path, expected)?;
    // No stem from the target's name: a long note name must stay writable
    // (NAME_MAX is 255). Dot-prefixed, so a walk never lists it.
    let temp = checked.dir.join(crate::sweep::temp_name(
        COUNTER.fetch_add(1, Ordering::Relaxed),
    ));
    // Created with the original's mode from the first instant: a 0600
    // note is never visible as 0644 under the temporary name.
    let written = (|| {
        let mut out = open_new_with_mode(&temp, &checked.original)?;
        out.write_all(content)?;
        Ok::<File, std::io::Error>(out)
    })();
    match written {
        Ok(out) => put_over(checked, &temp, out, fnv1a(content)),
        Err(error) => {
            let _ = std::fs::remove_file(&temp);
            Err(WriteError::Io(error))
        }
    }
}

/// A write's target, checked: what [`put_over`] replaces.
pub(crate) struct Checked {
    target: PathBuf,
    pub(crate) dir: PathBuf,
    pub(crate) original: std::fs::Metadata,
    report: WriteReport,
    /// Held until the rename is done.
    _held: TargetLock,
}

/// The checks before a write touches anything: not a placeholder (ADR
/// 0043), on the name and through a symlink on its target (ADR 0044), and
/// the file on disk the one that was read (invariant 11) — its content
/// hashed a piece at a time, never whole in memory.
pub(crate) fn check(path: &Path, expected: &Stamp) -> Result<Checked, WriteError> {
    let mut report = WriteReport::default();

    // A placeholder is never written over (ADR 0043): checked on the name
    // as given, before anything else, and again on a symlink's target.
    if placeholder::stands_in(path).map_err(WriteError::Io)? {
        return Err(WriteError::Placeholder);
    }

    // A symlink is followed: the target is what gets replaced (ADR 0044),
    // and the guard runs on the target too.
    let followed: PathBuf = placeholder::follow(path).map_err(WriteError::Io)?;
    if followed != path && placeholder::stands_in(&followed).map_err(WriteError::Io)? {
        return Err(WriteError::Placeholder);
    }
    // The name as the disk holds it, which the rename over the file keeps.
    let target = os::kept_spelling(followed.clone());
    let held = TargetLock::take(&target);
    if followed != path {
        // What the report names is where the write lands, respelled.
        report.wrote_through_symlink_to = Some(target.clone());
    }

    // Invariant 11: the file on disk must be the one that was read — by
    // modified time, length and content.
    let original = std::fs::metadata(&target).map_err(WriteError::Io)?;
    let current = Stamp {
        modified: original.modified().map_err(WriteError::Io)?,
        len: original.len(),
        hash: read_pieces(&target, |_| {}).map_err(WriteError::Io)?,
    };
    if current != *expected {
        return Err(WriteError::Changed { current });
    }

    let dir = target
        .parent()
        .ok_or_else(|| {
            WriteError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "a file of the folder has a parent",
            ))
        })?
        .to_path_buf();
    Ok(Checked {
        target,
        dir,
        original,
        report,
        _held: held,
    })
}

/// Put `temp`, written through `out` and whose content hashes to
/// `content_hash`, over the target `checked` names: the original's mode
/// and attributes, `fsync` of the file, the rename, `fsync` of the
/// directory (invariant 9, ADR 0029). A failure up to the rename removes
/// `temp` and leaves the original untouched.
pub(crate) fn put_over(
    checked: Checked,
    temp: &Path,
    out: File,
    content_hash: u64,
) -> Result<WriteReport, WriteError> {
    let Checked {
        target,
        dir,
        original,
        mut report,
        _held,
    } = checked;
    // Everything up to and including the rename: a failure here leaves the
    // original untouched and removes the temporary file.
    let before_rename = (|| {
        let out = out;
        report.mode_preserved = out.set_permissions(original.permissions()).is_ok();
        report.owner_preserved = os::same_owner(&original, &out.metadata()?);
        // Attributes go on before the barrier, so they are durable with the content.
        report.xattrs_not_preserved = copy_xattrs(&target, temp);
        out.sync_all()?;
        drop(out);
        match os::link_count(&target, &original) {
            Ok(links) => report.hard_link_shared = links > 1,
            Err(e) => report.hard_links_not_checked = Some(e.to_string()),
        }
        report.network_fs = network_fs(&dir);
        // A rename that has to wait for another program (Windows) asks
        // again, before each try, whether the file is still the one checked.
        let unchanged = || {
            std::fs::metadata(&target).is_ok_and(|now| {
                now.len() == original.len() && now.modified().ok() == original.modified().ok()
            })
        };
        os::rename_unless_changed(temp, &target, unchanged)
    })();
    match before_rename {
        Ok(true) => {}
        Ok(false) => {
            let _ = std::fs::remove_file(temp);
            return Err(changed_now(&target));
        }
        Err(error) => {
            let _ = std::fs::remove_file(temp);
            return Err(WriteError::Io(error));
        }
    }

    // After the rename the content is in place; what fails from here on is
    // reported in the report, not as a failed write (the caller would
    // otherwise retry and be shown a diff against its own edit).
    // Without the directory fsync the rename may not survive a power loss
    // (ADR 0029).
    let after_rename = (|| {
        os::sync_dir(&dir)?;
        let meta = std::fs::metadata(&target)?;
        Ok::<Stamp, std::io::Error>(Stamp {
            modified: meta.modified()?,
            len: meta.len(),
            hash: content_hash,
        })
    })();
    match after_rename {
        Ok(stamp) => report.stamp = Some(stamp),
        Err(error) => report.durability_not_confirmed = Some(error.to_string()),
    }
    Ok(report)
}

/// The file at `target` changed while the write waited for it: the error
/// that carries its stamp now, so the caller shows the diff.
fn changed_now(target: &Path) -> WriteError {
    let stamp = (|| {
        let meta = std::fs::metadata(target)?;
        Ok::<Stamp, std::io::Error>(Stamp {
            modified: meta.modified()?,
            len: meta.len(),
            hash: read_pieces(target, |_| {})?,
        })
    })();
    match stamp {
        Ok(current) => WriteError::Changed { current },
        Err(e) => WriteError::Io(e),
    }
}

/// Copy every extended attribute of `from` onto `to`; return the ones that
/// could not be copied. Finder tags and quarantine live here (ADR 0029).
#[cfg(unix)]
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

/// Windows has no extended attributes in this sense: its counterpart,
/// alternate data streams (`Zone.Identifier` among them), is not carried
/// over yet. Provisional until the port's `verso-fs` pull request decides it
/// (ADR 0069, item 9); until then nothing is attempted and nothing reported.
#[cfg(not(unix))]
fn copy_xattrs(_from: &Path, _to: &Path) -> Vec<(String, String)> {
    Vec::new()
}

#[cfg(unix)]
pub(crate) fn open_new_with_mode(
    temp: &Path,
    original: &std::fs::Metadata,
) -> Result<File, std::io::Error> {
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(original.permissions().mode())
        .open(temp)
}

#[cfg(not(unix))]
pub(crate) fn open_new_with_mode(
    temp: &Path,
    _original: &std::fs::Metadata,
) -> Result<File, std::io::Error> {
    OpenOptions::new().write(true).create_new(true).open(temp)
}

/// The name of the directory's file system if it is not local — macOS
/// says so itself with `MNT_LOCAL` absent from the mount flags, whatever
/// the file system is called. Elsewhere `None`, recorded as not detected.
#[cfg(target_os = "macos")]
pub(crate) fn network_fs(dir: &Path) -> Option<String> {
    let stat = nix::sys::statfs::statfs(dir).ok()?;
    let local = stat.flags().contains(nix::mount::MntFlags::MNT_LOCAL);
    (!local).then(|| stat.filesystem_type_name().to_owned())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn network_fs(_dir: &Path) -> Option<String> {
    None
}
