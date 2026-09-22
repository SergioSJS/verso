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
/// which would otherwise skip exactly the file the guard exists for.
pub(crate) fn icloud_placeholder_of(name: &OsStr) -> Option<String> {
    let name = name.to_str()?;
    let stem = name.strip_prefix('.')?.strip_suffix(".icloud")?;
    (!stem.is_empty()).then(|| stem.to_owned())
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
        assert_eq!(
            icloud_placeholder_of(OsStr::new(".Mapa da Taverna.png.icloud")).as_deref(),
            Some("Mapa da Taverna.png")
        );
        assert_eq!(
            icloud_placeholder_of(OsStr::new(".nota.md.icloud")).as_deref(),
            Some("nota.md")
        );
        assert_eq!(icloud_placeholder_of(OsStr::new("nota.md.icloud")), None);
        assert_eq!(icloud_placeholder_of(OsStr::new(".icloud")), None);
        assert_eq!(icloud_placeholder_of(OsStr::new(".obsidian")), None);
    }
}
