// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! On-demand storage placeholders (ADR 0043): iCloud Drive first, as
//! decided on 2026-09-22; OneDrive and every Windows cloud provider the
//! same way, decided on 2026-10-08 ("deveria funcionar igual"): a file
//! whose attributes say its data is not on disk. Two forms on macOS: an evicted file keeps its name
//! and carries `SF_DATALESS` in `st_flags` (APFS, since macOS 10.15); the
//! older form is a sibling `.Name.ext.icloud` in place of `Name.ext`. Either
//! is "present, content unavailable" — never absent — and is checked
//! **before** any open, because opening a dataless file makes the OS
//! download it.

use std::ffi::OsStr;
use std::fs::Metadata;
use std::path::Path;

/// `SF_DATALESS` from macOS's `<sys/stat.h>`: "file is dataless object".
/// Only macOS has the flag; the tests check the mask on every platform.
#[cfg(any(target_os = "macos", test))]
pub(crate) const SF_DATALESS: u32 = 0x4000_0000;

/// Whether `st_flags` say the file's data is not on disk.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn flags_are_dataless(st_flags: u32) -> bool {
    st_flags & SF_DATALESS != 0
}

/// Whether this file is an evicted iCloud Drive file, from metadata alone.
#[cfg(target_os = "macos")]
pub(crate) fn is_dataless(meta: &Metadata) -> bool {
    use std::os::macos::fs::MetadataExt;
    flags_are_dataless(meta.st_flags())
}

/// From the Windows SDK (winnt.h): the attributes a cloud provider
/// (OneDrive's Files On-Demand, any Cloud Files provider) or an offline
/// store puts on a file whose data is not on disk. Reading such a file
/// downloads it, as on macOS.
#[cfg(any(windows, test))]
const FILE_ATTRIBUTE_OFFLINE: u32 = 0x0000_1000;
#[cfg(any(windows, test))]
const FILE_ATTRIBUTE_RECALL_ON_OPEN: u32 = 0x0004_0000;
#[cfg(any(windows, test))]
const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;

/// Whether Windows file attributes say the file's data is not on disk.
#[cfg(any(windows, test))]
pub(crate) fn attributes_are_dataless(attributes: u32) -> bool {
    attributes
        & (FILE_ATTRIBUTE_OFFLINE
            | FILE_ATTRIBUTE_RECALL_ON_OPEN
            | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS)
        != 0
}

/// Whether this file is a cloud placeholder on Windows, from metadata alone.
#[cfg(windows)]
pub(crate) fn is_dataless(meta: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    attributes_are_dataless(meta.file_attributes())
}

/// Linux has no such flag; a placeholder there is a name form only (ADR
/// 0043 keeps the providers there `[OPEN]`).
#[cfg(not(any(target_os = "macos", windows)))]
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
/// *is* a `.Name.ext.icloud` entry (a regular file, not a directory), the
/// file is dataless, or the file does not exist and its `.Name.ext.icloud`
/// sibling stands in for it. A real, readable `Name.ext` wins over a stale
/// sibling (provisional, ADR 0043), so the walk's `EntryKind` and this
/// answer agree. `Ok(false)` when neither the file nor a sibling exists:
/// absence is reported by the read that follows, not here.
pub(crate) fn stands_in(path: &Path) -> Result<bool, std::io::Error> {
    let Some(name) = path.file_name() else {
        return Ok(false);
    };
    match std::fs::metadata(path) {
        Ok(meta) if meta.is_dir() => Ok(false),
        Ok(meta) => Ok(is_dataless(&meta) || icloud_placeholder_of(name).is_some()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(sibling_exists(path)),
        Err(e) => Err(e),
    }
}

/// Whether `.Name.ext.icloud` exists next to `path`.
pub(crate) fn sibling_exists(path: &Path) -> bool {
    let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
        return false;
    };
    let mut sibling = std::ffi::OsString::from(".");
    sibling.push(name);
    sibling.push(".icloud");
    parent.join(sibling).is_file()
}

/// The path a symlink chain ends at, resolved one link at a time (so a
/// link to a name that no longer exists still yields that name, for the
/// sibling check); a non-symlink is returned as is.
pub(crate) fn follow(path: &Path) -> Result<std::path::PathBuf, std::io::Error> {
    let mut current = path.to_path_buf();
    for _ in 0..40 {
        match std::fs::symlink_metadata(&current) {
            Ok(meta) if meta.is_symlink() => {
                let target = std::fs::read_link(&current)?;
                current = if target.is_absolute() {
                    target
                } else {
                    current.parent().map(|p| p.join(&target)).unwrap_or(target)
                };
            }
            Ok(_) => return Ok(current),
            // The end of the chain names something that is not there: hand
            // back that name, so the caller can ask whether a placeholder
            // stands in for it.
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(current),
            Err(e) => return Err(e),
        }
    }
    Err(std::io::Error::other("too many levels of symbolic links"))
}

/// A file of the folder whose content is only in the cloud, named so the
/// user's own opening of it can bring it down (ADR 0043, amended on
/// 2026-09-30): what the window opens is fetched; the walk, the index and
/// the watcher never do. It holds the confined path alone, so it can be
/// fetched away from the lock the folder is read under.
#[derive(Debug, Clone)]
pub struct Placeholder {
    path: std::path::PathBuf,
}

impl Placeholder {
    pub(crate) fn new(path: std::path::PathBuf) -> Self {
        Self { path }
    }

    /// Bring the content down: reading a dataless file is what makes the
    /// operating system download it, so the file is read to its end and the
    /// bytes dropped. Blocks until the download is over or fails (offline);
    /// the caller runs it off any thread the user is waiting on.
    pub fn fetch(&self) -> Result<(), std::io::Error> {
        let mut file = std::fs::File::open(&self.path)?;
        std::io::copy(&mut file, &mut std::io::sink())?;
        // Read to its end and still in the cloud: the provider gave nothing
        // (an item it cannot serve reads as zero bytes) — an error, never
        // an empty file.
        if is_dataless(&std::fs::metadata(&self.path)?) {
            return Err(std::io::Error::other(
                "the cloud did not give the file's content",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fetching_a_file_on_disk_reads_it_and_changes_nothing() {
        let dir = std::env::temp_dir().join(format!("verso-fetch-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("nota.md");
        std::fs::write(&path, b"texto").unwrap();
        Placeholder::new(path.clone()).fetch().unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"texto");
        assert!(Placeholder::new(dir.join("absent.md")).fetch().is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn dataless_flag() {
        assert!(flags_are_dataless(SF_DATALESS));
        assert!(flags_are_dataless(SF_DATALESS | 0x1));
        assert!(!flags_are_dataless(0));
        assert!(!flags_are_dataless(0x0000_0020)); // UF_APPEND, unrelated
    }

    #[test]
    fn dataless_attributes() {
        assert!(attributes_are_dataless(
            FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS
        ));
        assert!(attributes_are_dataless(
            FILE_ATTRIBUTE_RECALL_ON_OPEN | 0x20
        ));
        assert!(attributes_are_dataless(FILE_ATTRIBUTE_OFFLINE));
        assert!(!attributes_are_dataless(0x20)); // ARCHIVE, a file on disk
        assert!(!attributes_are_dataless(0x0008_0000)); // PINNED, kept on disk
        assert!(!attributes_are_dataless(0x0010_0000)); // UNPINNED, still on disk
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
