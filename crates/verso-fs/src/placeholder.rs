// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! On-demand storage placeholders (ADR 0043): iCloud Drive first, as
//! decided on 2026-09-22. Two forms on macOS: an evicted file keeps its name
//! and carries `SF_DATALESS` in `st_flags` (APFS, since macOS 10.15); the
//! older form is a sibling `.Name.ext.icloud` in place of `Name.ext`. Either
//! is "present, content unavailable" — never absent — and is checked
//! **before** any open, because opening a dataless file makes the OS
//! download it.

use std::ffi::OsStr;
use std::fs::Metadata;
use std::path::Path;

/// `SF_DATALESS` from macOS's `<sys/stat.h>`: "file is dataless object".
pub(crate) const SF_DATALESS: u32 = 0x4000_0000;

/// Whether `st_flags` say the file's data is not on disk.
pub(crate) fn flags_are_dataless(st_flags: u32) -> bool {
    st_flags & SF_DATALESS != 0
}

/// Whether this file is an evicted iCloud Drive file, from metadata alone.
#[cfg(target_os = "macos")]
pub(crate) fn is_dataless(meta: &Metadata) -> bool {
    use std::os::macos::fs::MetadataExt;
    flags_are_dataless(meta.st_flags())
}

/// Other platforms have no such flag; a placeholder there is a name form
/// only (ADR 0043 keeps the other providers `[OPEN]`).
#[cfg(not(target_os = "macos"))]
pub(crate) fn is_dataless(_meta: &Metadata) -> bool {
    false
}

/// If `name` is the older iCloud placeholder form `.Name.ext.icloud`, the
/// name it stands for: `Name.ext`. Recognized before the hidden-entry rule,
/// which would otherwise skip exactly the file the guard exists for. Works
/// on the raw bytes, so a name that is not UTF-8 is still recognized.
pub(crate) fn icloud_placeholder_of(name: &OsStr) -> Option<std::ffi::OsString> {
    let bytes = name.as_encoded_bytes();
    let stem = bytes.strip_prefix(b".")?.strip_suffix(b".icloud")?;
    if stem.is_empty() {
        return None;
    }
    os_string_of(stem, name)
}

/// The `OsString` for the byte slice `stem` of `name`, without `unsafe`:
/// through `str` when the name is UTF-8, through the Unix byte form
/// otherwise (both ends of the cut are ASCII, so the slice is a valid
/// name either way).
fn os_string_of(stem: &[u8], name: &OsStr) -> Option<std::ffi::OsString> {
    if let Some(s) = name.to_str() {
        let start = 1;
        let end = s.len() - ".icloud".len();
        return Some(std::ffi::OsString::from(&s[start..end]));
    }
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        Some(std::ffi::OsString::from_vec(stem.to_vec()))
    }
    #[cfg(not(unix))]
    {
        let _ = stem;
        None
    }
}

/// Whether the file at `path` is a placeholder in either form: the file
/// itself is dataless, the file *is* a `.Name.ext.icloud` entry, or its
/// `.Name.ext.icloud` sibling exists and stands in for it. `Ok(false)` also
/// when the file does not exist at all: absence is reported by the read
/// that follows, not here.
pub(crate) fn stands_in(path: &Path) -> Result<bool, std::io::Error> {
    let Some(name) = path.file_name() else {
        return Ok(false);
    };
    if icloud_placeholder_of(name).is_some() {
        return Ok(true);
    }
    if let Some(parent) = path.parent() {
        let mut sibling = std::ffi::OsString::from(".");
        sibling.push(name);
        sibling.push(".icloud");
        if parent.join(sibling).exists() {
            return Ok(true);
        }
    }
    match std::fs::metadata(path) {
        Ok(meta) => Ok(is_dataless(&meta)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dataless_flag() {
        assert!(flags_are_dataless(SF_DATALESS));
        assert!(flags_are_dataless(SF_DATALESS | 0x1));
        assert!(!flags_are_dataless(0));
        assert!(!flags_are_dataless(0x0000_0020)); // UF_APPEND, unrelated
    }

    #[test]
    fn icloud_name_form() {
        let of = |n: &str| {
            icloud_placeholder_of(OsStr::new(n)).map(|s| s.to_string_lossy().into_owned())
        };
        assert_eq!(
            of(".Mapa da Taverna.png.icloud").as_deref(),
            Some("Mapa da Taverna.png")
        );
        assert_eq!(of(".nota.md.icloud").as_deref(), Some("nota.md"));
        assert_eq!(of("nota.md.icloud"), None);
        assert_eq!(of(".icloud"), None);
        assert_eq!(of(".obsidian"), None);
    }

    #[cfg(unix)]
    #[test]
    fn icloud_name_form_survives_non_utf8() {
        use std::os::unix::ffi::OsStrExt;
        let name = OsStr::from_bytes(b".caf\xe9.md.icloud");
        assert_eq!(
            icloud_placeholder_of(name).map(|s| s.as_encoded_bytes().to_vec()),
            Some(b"caf\xe9.md".to_vec())
        );
    }
}
