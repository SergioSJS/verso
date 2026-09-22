// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Creating, renaming and trashing a file of the folder (ADR 0048, Phase
//! 2 item 2.3). The same care as the atomic write: a new file is written
//! under a temporary name, synced, and renamed into place only if nothing
//! stands at the destination; a rename refuses an occupied destination;
//! a deletion is a move into `.trash/` at the root, as Obsidian does, so a
//! folder shared with it shows the same bin — nothing is unlinked here.
//! Parent directories are created as needed and the directories touched
//! are synced, so the operation survives a power loss (ADR 0029).

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use crate::placeholder;
use crate::write::{COUNTER, WriteError};
use crate::{Stamp, fnv1a};

fn sync_dir(dir: &Path) -> Result<(), std::io::Error> {
    File::open(dir)?.sync_all()
}

/// Something already stands at `path` — a file, a directory, or a
/// placeholder for it.
fn occupied(path: &Path) -> Result<bool, std::io::Error> {
    Ok(path.symlink_metadata().is_ok() || placeholder::stands_in(path)?)
}

/// Write `content` to a path that does not exist yet.
pub(crate) fn create_atomically(path: &Path, content: &[u8]) -> Result<Stamp, WriteError> {
    if occupied(path).map_err(WriteError::Io)? {
        return Err(WriteError::Exists);
    }
    let dir = path.parent().ok_or_else(|| {
        WriteError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "a file of the folder has a parent",
        ))
    })?;
    std::fs::create_dir_all(dir).map_err(WriteError::Io)?;
    let temp = dir.join(format!(
        ".verso-tmp-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let written = (|| {
        let mut out = File::create_new(&temp)?;
        out.write_all(content)?;
        out.sync_all()?;
        drop(out);
        // Checked again at the last moment: the window between the check
        // and the rename is the best a portable rename offers.
        if occupied(path)? {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "exists",
            ));
        }
        std::fs::rename(&temp, path)?;
        sync_dir(dir)?;
        let meta = std::fs::metadata(path)?;
        Ok::<Stamp, std::io::Error>(Stamp {
            modified: meta.modified()?,
            len: meta.len(),
            hash: fnv1a(content),
        })
    })();
    match written {
        Ok(stamp) => Ok(stamp),
        Err(e) => {
            let _ = std::fs::remove_file(&temp);
            Err(if e.kind() == std::io::ErrorKind::AlreadyExists {
                WriteError::Exists
            } else {
                WriteError::Io(e)
            })
        }
    }
}

/// Move `from` to `to`, refusing an occupied destination.
pub(crate) fn rename_path(from: &Path, to: &Path) -> Result<(), WriteError> {
    if placeholder::stands_in(from).map_err(WriteError::Io)? {
        return Err(WriteError::Placeholder);
    }
    if from == to {
        return Ok(());
    }
    if occupied(to).map_err(WriteError::Io)? {
        return Err(WriteError::Exists);
    }
    let to_dir = to.parent().ok_or_else(|| {
        WriteError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "a file of the folder has a parent",
        ))
    })?;
    std::fs::create_dir_all(to_dir).map_err(WriteError::Io)?;
    std::fs::rename(from, to).map_err(WriteError::Io)?;
    sync_dir(to_dir).map_err(WriteError::Io)?;
    if let Some(from_dir) = from.parent()
        && from_dir != to_dir
    {
        sync_dir(from_dir).map_err(WriteError::Io)?;
    }
    Ok(())
}

/// Move `relative` (under `root`) into `.trash/` at the root, keeping its
/// relative path; a name already in the bin gets ` (2)`, ` (3)`… before
/// its extension. Returns where it went, relative to the root.
pub(crate) fn trash(root: &Path, relative: &Path) -> Result<PathBuf, WriteError> {
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
    rename_path(&from, &root.join(&target))?;
    Ok(target)
}
