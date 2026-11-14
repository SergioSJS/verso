// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's bin, `.trash/` at the root (ADR 0048, ADR 0080): the one
//! hidden directory a walk enters, by name. What is in it is listed
//! without following a symlink; an entry goes back into the folder by a
//! confined move that never replaces a file (invariant 11); an entry is
//! removed for good only under `.trash/` — a symlink there is removed,
//! never followed, and a `.trash` that is itself a link, or a link on the
//! way down, refuses the removal (ADR 0080 item 3, the feature's
//! guardrail). A version a device's write replaced is copied in beside the
//! deleted ones (item 12).

use std::fs::File;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

use crate::ops::{self, OpReport, Placed};
use crate::{ConfinementError, WriteError, placeholder};

/// The bin's name at the root of the folder, as Obsidian names it.
pub const BIN: &str = ".trash";

/// One entry under `.trash/`: its path relative to the folder (`.trash/…`,
/// joined by `/`), whether it is a directory (a symlink is not, whatever
/// it points to), and its length (a directory's own is 0).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Binned {
    pub path: String,
    pub dir: bool,
    pub len: u64,
}

/// Whether `relative` names something inside the bin: `.trash` then at
/// least one plain name, no `..`, nothing absolute, no NUL.
fn inside(relative: &Path) -> bool {
    if relative.as_os_str().as_encoded_bytes().contains(&0) {
        return false;
    }
    let mut parts = relative.components();
    if parts.next() != Some(Component::Normal(BIN.as_ref())) {
        return false;
    }
    let mut any = false;
    for part in parts {
        match part {
            Component::Normal(_) => any = true,
            _ => return false,
        }
    }
    any
}

/// `relative` inside the bin, its directories on the way real ones — not
/// a symlink, `.trash` itself included — or refused.
fn checked(root: &Path, relative: &Path) -> Result<PathBuf, WriteError> {
    if !inside(relative) {
        return Err(WriteError::Confined(ConfinementError::Hidden));
    }
    let parts: Vec<_> = relative.components().collect();
    let mut at = root.to_path_buf();
    for part in &parts[..parts.len() - 1] {
        at.push(part);
        match at.symlink_metadata() {
            Ok(m) if m.is_dir() => {}
            Ok(_) => return Err(WriteError::Confined(ConfinementError::LeavesFolder)),
            Err(e) => return Err(WriteError::Io(e)),
        }
    }
    Ok(crate::on_disk(root, relative))
}

/// Every entry under `.trash/` at `root`, sorted by path; empty when there
/// is no bin, or when `.trash` is not a directory of its own (a symlink is
/// never entered). Directories are listed and entered; a symlink is listed
/// as itself. Stops entering at [`crate::MAX_DEPTH`].
pub fn walk(root: &Path) -> std::io::Result<Vec<Binned>> {
    let bin = root.join(BIN);
    match bin.symlink_metadata() {
        Ok(m) if m.is_dir() => {}
        Ok(_) => return Ok(Vec::new()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    }
    let mut out = Vec::new();
    let mut stack = vec![(bin, BIN.to_owned(), 0usize)];
    while let Some((dir, rel, depth)) = stack.pop() {
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let path = format!("{rel}/{name}");
            // Not followed: the entry's own kind and length.
            let meta = std::fs::symlink_metadata(entry.path())?;
            let is_dir = meta.is_dir();
            out.push(Binned {
                path: path.clone(),
                dir: is_dir,
                len: if is_dir { 0 } else { meta.len() },
            });
            if is_dir && depth < crate::MAX_DEPTH {
                stack.push((entry.path(), path, depth + 1));
            }
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// The first free name for `relative` in the bin: `.trash/<relative>`,
/// else ` (2)`, ` (3)`… before its extension (ADR 0048).
pub(crate) fn free_name(root: &Path, relative: &Path) -> Result<PathBuf, WriteError> {
    let bin = crate::rel_join(Path::new(BIN), relative);
    let mut target = bin.clone();
    let mut n = 2;
    while ops::occupied(&crate::on_disk(root, &target)).map_err(WriteError::Io)? {
        let stem = bin
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ext = bin
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let parent = bin.parent().unwrap_or(Path::new(""));
        target = crate::rel_join(parent, format!("{stem} ({n}){ext}"));
        n += 1;
    }
    Ok(target)
}

/// The directories left empty above `relative` inside the bin, removed,
/// deepest first, up to `.trash` itself (kept). Only an empty directory
/// goes (`rmdir`); the first that holds anything stops it.
fn prune(root: &Path, relative: &Path) {
    let mut at = relative.parent();
    while let Some(dir) = at {
        if !inside(dir) {
            break;
        }
        match ops::remove_empty_directory(&crate::on_disk(root, dir)) {
            Ok(true) => at = dir.parent(),
            _ => break,
        }
    }
}

/// Remove `relative` (a path under `.trash/`) for good, and the
/// directories it leaves empty in the bin. A directory goes with what it
/// holds — `remove_dir_all`, which does not follow a symlink inside it — a
/// symlink is removed as itself. Nothing there is not an error.
pub fn purge(root: &Path, relative: &Path) -> Result<(), WriteError> {
    let target = checked(root, relative)?;
    let removed = match target.symlink_metadata() {
        Ok(m) if m.is_dir() => std::fs::remove_dir_all(&target),
        Ok(_) => std::fs::remove_file(&target),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    };
    match removed {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(WriteError::Io(e)),
    }
    prune(root, relative);
    if let Some(parent) = target.parent()
        && parent.exists()
    {
        let _ = crate::os::sync_dir(parent);
    }
    Ok(())
}

/// The folder of the bin at `relative` removed if it is empty now (`rmdir`),
/// and the folders it leaves empty above it — never anything it holds. A
/// sweep finds a folder empty by its walk; a deletion, or a version a
/// write replaced, may have put a file in it since, and [`purge`] would
/// remove that file with the folder (the server's sweep runs beside the
/// window's writes: the night stress, 2026-11-04). A folder that is not
/// empty, or no longer there, is left as it is.
pub fn remove_empty(root: &Path, relative: &Path) -> Result<(), WriteError> {
    let target = checked(root, relative)?;
    if !ops::remove_empty_directory(&target)? {
        return Ok(());
    }
    prune(root, relative);
    if let Some(parent) = target.parent()
        && parent.exists()
    {
        let _ = crate::os::sync_dir(parent);
    }
    Ok(())
}

/// Move `from` (under `.trash/`) to `to` (already confined by the root),
/// creating `to`'s folders; refuses a `to` where something stands
/// (`WriteError::Exists`): a restore never replaces a file (ADR 0080 item
/// 5, invariant 11). The directories `from` leaves empty in the bin go.
pub(crate) fn restore(root: &Path, from: &Path, to: &Path) -> Result<OpReport, WriteError> {
    let source = checked(root, from)?;
    let report = ops::rename_path(&source, &crate::on_disk(root, to))?;
    prune(root, from);
    Ok(report)
}

/// Copy the file at `relative` (a symlink followed, as a write follows it)
/// into the bin under a free name, atomically: written under a temporary
/// name beside where it goes, synced, then given its name by a step that
/// never replaces a file. Returns where it went (ADR 0080 item 12).
pub(crate) fn keep_copy(root: &Path, relative: &Path) -> Result<PathBuf, WriteError> {
    let source = crate::on_disk(root, relative);
    if placeholder::stands_in(&source).map_err(WriteError::Io)? {
        return Err(WriteError::Placeholder);
    }
    // The bin must be a directory of its own before anything is put in it.
    if let Ok(m) = root.join(BIN).symlink_metadata()
        && !m.is_dir()
    {
        return Err(WriteError::Confined(ConfinementError::LeavesFolder));
    }
    let target = free_name(root, relative)?;
    let path = crate::on_disk(root, &target);
    let dir = path.parent().ok_or_else(|| {
        WriteError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "a file of the bin has a parent",
        ))
    })?;
    let created = ops::create_dirs(dir).map_err(WriteError::Io)?;
    checked(root, &target)?;
    let temp = ops::temporary_name(dir);
    let copied = (|| {
        let mut input = File::open(&source)?;
        let mut out = File::create_new(&temp)?;
        std::io::copy(&mut input, &mut out)?;
        out.flush()?;
        out.sync_all()
    })();
    if let Err(e) = copied {
        let _ = std::fs::remove_file(&temp);
        return Err(WriteError::Io(e));
    }
    match ops::claim(&temp, &path) {
        Ok(Placed::Claimed { removal: Some(_) }) => {
            let _ = std::fs::remove_file(&temp);
        }
        Ok(_) => {}
        Err(e) => {
            let _ = std::fs::remove_file(&temp);
            return Err(e);
        }
    }
    let _ = ops::sync_created(dir, &created);
    Ok(target)
}

#[cfg(test)]
mod tests;
