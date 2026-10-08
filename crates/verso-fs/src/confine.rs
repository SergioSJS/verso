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
//!
//! On Windows, `Path` already reads `\` as a separator and a drive letter
//! or a UNC share as a prefix, refused as absolute. Refused there too, a
//! name Windows would not keep as written (ADR 0069, item 9): a device
//! name (`CON`, `NUL`, `COM1`…, with or without an extension), which opens
//! the device instead of a file; a trailing dot or space, which Windows
//! strips, so two names reach one file; a colon, which names an alternate
//! data stream of another file; and the characters Windows does not allow
//! in a name. On every other OS the same names are refused for what is
//! made or renamed (ADR 0070: a folder synced to Windows must carry them),
//! never for an entry that already exists ([`unportable_new`]).

use std::path::{Component, Path, PathBuf};

/// Why a relative path was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfinementError {
    Absolute,
    ParentComponent,
    Empty,
    NulByte,
    /// A component starts with `.`: the walk does not list it, and a
    /// handle to it is refused too (provisional, ADR 0044).
    Hidden,
    /// Under a path the caller asked to ignore (provisional, ADR 0044).
    Ignored,
    /// A name not every OS can keep — Windows would not keep it as written:
    /// a device name, a trailing dot or space, a colon, or a character it
    /// does not allow (ADR 0069, ADR 0070).
    UnportableName,
}

impl std::fmt::Display for ConfinementError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let what = match self {
            Self::Absolute => "an absolute path",
            Self::ParentComponent => "a `..` component",
            Self::Empty => "an empty path",
            Self::NulByte => "a NUL byte",
            Self::Hidden => "a hidden entry",
            Self::Ignored => "an ignored path",
            Self::UnportableName => {
                "a name not every system can keep (a device name such as CON or NUL, a trailing dot or space, a colon, or one of < > \" | ? *)"
            }
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
            Component::Normal(part) => {
                #[cfg(windows)]
                if unportable(part) {
                    return Err(ConfinementError::UnportableName);
                }
                out = crate::rel_join(&out, part);
            }
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

/// The first name of the confined `relative` that does not exist yet under
/// `root` and is not one every OS can keep, refused (ADR 0070). What exists
/// already is the user's and is never refused — a note inside an existing
/// folder named `Reunião: pauta` is made, and a file with such a name opens
/// and can be renamed to a portable one.
pub(crate) fn unportable_new(root: &Path, relative: &Path) -> Result<(), ConfinementError> {
    let mut at = PathBuf::new();
    for component in relative.components() {
        let Component::Normal(part) = component else {
            continue;
        };
        at = crate::rel_join(&at, part);
        let exists = crate::on_disk(root, &at).symlink_metadata().is_ok();
        if !exists && unportable(part) {
            return Err(ConfinementError::UnportableName);
        }
    }
    Ok(())
}

/// Whether the name `part` is one not every OS can keep: Windows would not
/// keep it as written. Applied to every request on Windows (`confine`), and
/// on every OS to the names a create or rename makes ([`unportable_new`]).
pub(crate) fn unportable(part: &std::ffi::OsStr) -> bool {
    let name = part.to_string_lossy();
    if name.ends_with('.') || name.ends_with(' ') {
        return true;
    }
    if name
        .chars()
        .any(|c| c < ' ' || matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
    {
        return true;
    }
    // A device name is matched on what comes before the first dot, case
    // aside, as Windows 10 does (Windows 11 relaxed some cases; ADR 0069
    // writes for Windows 10).
    let stem = name
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end()
        .to_ascii_uppercase();
    let numbered = |prefix: &str| {
        stem.strip_prefix(prefix).is_some_and(|n| {
            matches!(
                n,
                "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        })
    };
    matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || numbered("COM")
        || numbered("LPT")
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

    #[test]
    fn windows_names_it_would_not_keep() {
        let refused = |s: &str| unportable(std::ffi::OsStr::new(s));
        for name in [
            "CON",
            "con.md",
            "Nul.txt",
            "aux",
            "PRN.tar.gz",
            "COM1",
            "com9.md",
            "LPT3",
            "COM¹",
            "CONIN$",
            "nota.",
            "nota ",
            "a:b",
            "a.md:stream",
            "a<b",
            "a>b",
            "a\"b",
            "a|b",
            "a?",
            "a*",
            "a\tb",
        ] {
            assert!(refused(name), "{name:?} should be refused");
        }
        for name in [
            "Nota.md",
            "console.md",
            "CONTRATO.md",
            "com.md",
            "COM10.md",
            "lpt.md",
            "nul-1.md",
            "auxiliar",
            ".hidden",
            "a.b.c",
            "Ação é açaí.md",
            "file name.md",
        ] {
            assert!(!refused(name), "{name:?} should be kept");
        }
    }

    /// On Windows `\` separates and a drive or a share is absolute; the
    /// names above are refused by `confine` itself.
    #[cfg(windows)]
    #[test]
    fn windows_forms_are_refused_by_confine() {
        assert_eq!(
            confine(Path::new("a\\b.md")).unwrap(),
            PathBuf::from("a\\b.md")
        );
        for absolute in [
            "C:\\x.md",
            "C:x.md",
            "\\\\server\\share\\x.md",
            "\\\\?\\C:\\x.md",
            "\\x.md",
        ] {
            assert_eq!(
                confine(Path::new(absolute)),
                Err(ConfinementError::Absolute),
                "{absolute}"
            );
        }
        assert_eq!(
            confine(Path::new("a\\..\\..\\x")),
            Err(ConfinementError::ParentComponent)
        );
        assert_eq!(
            confine(Path::new("pasta/CON.md")),
            Err(ConfinementError::UnportableName)
        );
        assert_eq!(
            confine(Path::new("nota.")),
            Err(ConfinementError::UnportableName)
        );
        assert_eq!(
            confine(Path::new("a.md:x")),
            Err(ConfinementError::UnportableName)
        );
    }
}
