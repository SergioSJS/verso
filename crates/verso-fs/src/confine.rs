// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Path confinement (ADR 0029 feature guardrail, ADR 0044 as decided on
//! 2026-09-22): a request names something inside the folder or is refused.
//! Refused: an absolute path, a root or prefix component, `..`, an empty
//! path, a NUL byte. Accepted and normalized: `.` components are dropped.
//! A symlink inside the folder is the user's and is not a confinement
//! question: it is followed, and what it reaches is inside the folder for
//! every purpose.

use std::path::{Component, Path, PathBuf};

/// Why a relative path was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfinementError {
    Absolute,
    ParentComponent,
    Empty,
    NulByte,
}

impl std::fmt::Display for ConfinementError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let what = match self {
            Self::Absolute => "an absolute path",
            Self::ParentComponent => "a `..` component",
            Self::Empty => "an empty path",
            Self::NulByte => "a NUL byte",
        };
        write!(
            f,
            "path refused: {what} cannot name a file of the open folder"
        )
    }
}

impl std::error::Error for ConfinementError {}

/// The confined, normalized relative path, or the reason it is refused.
pub(crate) fn confine(relative: &Path) -> Result<PathBuf, ConfinementError> {
    if relative.as_os_str().as_encoded_bytes().contains(&0) {
        return Err(ConfinementError::NulByte);
    }
    let mut out = PathBuf::new();
    for component in relative.components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::ParentDir => return Err(ConfinementError::ParentComponent),
            Component::RootDir | Component::Prefix(_) => return Err(ConfinementError::Absolute),
        }
    }
    if out.as_os_str().is_empty() {
        return Err(ConfinementError::Empty);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_what_leaves_the_folder_and_keeps_the_rest() {
        assert_eq!(
            confine(Path::new("a/b.md")).unwrap(),
            PathBuf::from("a/b.md")
        );
        assert_eq!(
            confine(Path::new("./a/./b.md")).unwrap(),
            PathBuf::from("a/b.md")
        );
        assert_eq!(
            confine(Path::new("/etc/passwd")),
            Err(ConfinementError::Absolute)
        );
        assert_eq!(
            confine(Path::new("a/../../x")),
            Err(ConfinementError::ParentComponent)
        );
        assert_eq!(
            confine(Path::new("..")),
            Err(ConfinementError::ParentComponent)
        );
        assert_eq!(confine(Path::new("")), Err(ConfinementError::Empty));
        assert_eq!(confine(Path::new(".")), Err(ConfinementError::Empty));
        let nul = std::ffi::OsStr::new("a\0b");
        assert_eq!(confine(Path::new(nul)), Err(ConfinementError::NulByte));
        // A symlink name is just a name here: following it is the walk's job.
        assert_eq!(
            confine(Path::new("link/x.md")).unwrap(),
            PathBuf::from("link/x.md")
        );
    }
}
