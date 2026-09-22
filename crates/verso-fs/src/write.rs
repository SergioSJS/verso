// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Atomic write (ADR 0029): temporary file in the same directory, `fsync`
//! of the file, `rename` over the original, `fsync` of the directory. Before
//! any of it, the file on disk must be the one that was read (invariant 11,
//! ADR 0012). Mode and extended attributes are carried over; what could not
//! be is reported, not hidden.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};

use crate::{Handle, Stamp};

/// Why a write did not happen. Nothing was changed on disk in any case,
/// except a temporary file that could not be removed after a failed step,
/// named in [`WriteError::Io`].
#[derive(Debug)]
pub enum WriteError {
    UnknownHandle(Handle),
    /// The file on disk is not the one that was read: modified time or
    /// length differ from `expected`. The caller shows the diff (invariant
    /// 11); nothing was written.
    Changed {
        current: Stamp,
    },
    Io(std::io::Error),
}

impl std::fmt::Display for WriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownHandle(h) => write!(f, "unknown handle {h:?}"),
            Self::Changed { .. } => write!(f, "the file on disk changed since it was read"),
            Self::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for WriteError {}

/// What the write managed to keep from the original, and what it noticed.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WriteReport {
    /// The original's permission bits were applied to the new file.
    pub mode_preserved: bool,
    /// Extended attributes that could not be copied (name and the error's
    /// text); empty when all were.
    pub xattrs_not_preserved: Vec<(String, String)>,
    /// The original had more than one hard link: the rename replaced this
    /// path's inode, the other links still point at the old content
    /// (ADR 0029: "decide whether it detects and warns" — it warns).
    pub hard_link_shared: bool,
    /// The folder's file system, when it is a network one where rename is
    /// not atomic (ADR 0029): the write still happened; the caller warns.
    pub network_fs: Option<String>,
    /// The new [`Stamp`] of the file, for the next write.
    pub stamp: Option<Stamp>,
}

static COUNTER: AtomicU32 = AtomicU32::new(0);

pub(crate) fn write_atomically(
    path: &Path,
    content: &[u8],
    expected: &Stamp,
) -> Result<WriteReport, WriteError> {
    // Invariant 11: the file on disk must be the one that was read.
    let original = std::fs::metadata(path).map_err(WriteError::Io)?;
    let current = Stamp {
        modified: original.modified().map_err(WriteError::Io)?,
        len: original.len(),
    };
    if current != *expected {
        return Err(WriteError::Changed { current });
    }

    let dir = path.parent().ok_or_else(|| {
        WriteError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "a file of the folder has a parent",
        ))
    })?;
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let temp = dir.join(format!(
        ".{file_name}.verso-tmp-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));

    let mut report = WriteReport::default();
    let result = (|| {
        let mut out = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        out.write_all(content)?;
        // Mode: applied before the rename, so the new file never appears
        // with the wrong permissions.
        match out.set_permissions(original.permissions()) {
            Ok(()) => report.mode_preserved = true,
            Err(_) => report.mode_preserved = false,
        }
        out.sync_all()?;
        drop(out);
        report.xattrs_not_preserved = copy_xattrs(path, &temp);
        report.hard_link_shared = hard_link_count(&original) > 1;
        report.network_fs = network_fs(dir);
        std::fs::rename(&temp, path)?;
        // Without this the rename may not survive a power loss (ADR 0029).
        File::open(dir)?.sync_all()?;
        let meta = std::fs::metadata(path)?;
        report.stamp = Some(Stamp {
            modified: meta.modified()?,
            len: meta.len(),
        });
        Ok(())
    })();
    match result {
        Ok(()) => Ok(report),
        Err(error) => {
            // Leave nothing behind; if even that fails, the error names it.
            let _ = std::fs::remove_file(&temp);
            Err(WriteError::Io(error))
        }
    }
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

#[cfg(not(unix))]
fn hard_link_count(_meta: &std::fs::Metadata) -> u64 {
    1
}

/// The name of the directory's file system if it is a network one. macOS
/// only for now (ADR 0022); elsewhere `None`, recorded as not detected.
#[cfg(target_os = "macos")]
fn network_fs(dir: &Path) -> Option<String> {
    let stat = nix::sys::statfs::statfs(dir).ok()?;
    let name = stat.filesystem_type_name().to_owned();
    is_network_fs_name(&name).then_some(name)
}

#[cfg(not(target_os = "macos"))]
fn network_fs(_dir: &Path) -> Option<String> {
    None
}

/// File systems on which `rename` is not atomic across a client and a
/// server, by the names macOS reports.
pub(crate) fn is_network_fs_name(name: &str) -> bool {
    matches!(
        name,
        "nfs" | "smbfs" | "afpfs" | "webdav" | "cifs" | "fuse" | "osxfuse"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_names() {
        assert!(is_network_fs_name("smbfs"));
        assert!(is_network_fs_name("nfs"));
        assert!(!is_network_fs_name("apfs"));
        assert!(!is_network_fs_name("hfs"));
    }
}
