// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's data files: one JSON object each, named by an id, in
//! `.verso/layouts/` (ADR 0099 item 2: a card's or statblock's layout) and
//! `.verso/bundles/` (ADR 0098 item 2: a world's or campaign's template
//! bundle). They travel with the folder as `.verso/settings.json` does
//! (ADR 0070, ADR 0079): the same sync path, the same folder.
//!
//! The door is narrow on purpose. The path is built here from a kind and an
//! id — `.verso/<kind>/<id>.json`, nothing else under `.verso/` is
//! reachable through these four calls — and an id that is not
//! `^[a-z0-9][a-z0-9-]{0,63}$`, or is a name Windows keeps for a device,
//! is refused before any IO. The directory is made by the first write, and
//! only then (ADR 0070 item 1). Reading never rewrites (invariant 7); a
//! write is atomic and checks the revision that was read (invariants 9 and
//! 11); a removal goes through the bin (ADR 0080); a placeholder of
//! on-demand storage is reported, never taken for absent (ADR 0043).

use std::path::Path;

use super::*;

/// The most a layout's text may be (ADR 0099 items 2 and 7: 256 KiB).
pub const FOLDER_LAYOUT_MOST: usize = 256 * 1024;

/// The most a bundle's text may be (ADR 0098 item 5: "4 MB in all").
pub const FOLDER_BUNDLE_MOST: usize = 4 * 1024 * 1024;

/// The longest an id may be.
const ID_MOST: usize = 64;

/// Which data directory of `.verso/` a file is in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FolderDataKind {
    Layouts,
    Bundles,
}

impl FolderDataKind {
    /// The most a file of this kind may be, in bytes.
    #[must_use]
    pub fn most(self) -> usize {
        match self {
            Self::Layouts => FOLDER_LAYOUT_MOST,
            Self::Bundles => FOLDER_BUNDLE_MOST,
        }
    }

    /// The directory's name under `.verso/`.
    #[must_use]
    pub fn dir(self) -> &'static str {
        match self {
            Self::Layouts => "layouts",
            Self::Bundles => "bundles",
        }
    }
}

/// One data file listed: its id and the revision to hand back to change or
/// remove it; empty when the file cannot be read now (a placeholder, or
/// past its kind's bound) — a read says why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataEntry {
    pub id: String,
    pub revision: String,
}

/// The data files of a kind: the entries a person can use, and the names in
/// the directory that are not an id (a sync conflict copy such as
/// `mesa (conflict, Mac, …).json`, a hand-made `Mesa.json`), which no
/// command can reach and so are named for the person to rename or remove.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DataList {
    pub entries: Vec<DataEntry>,
    pub strays: Vec<String>,
}

/// The most strays one listing names.
const STRAYS_MOST: usize = 50;

/// A data file read: its text as it is on disk and its revision.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataFile {
    pub text: String,
    pub revision: String,
}

fn refuse(what: impl Into<String>) -> CoreError {
    CoreError::FolderData(what.into())
}

/// Whether `id` is a name Windows keeps for a device (`con`, `nul`,
/// `com1`…): the ids are lower case, so the comparison is too.
fn device_name(id: &str) -> bool {
    let numbered = |prefix: &str| {
        id.strip_prefix(prefix)
            .is_some_and(|n| matches!(n.as_bytes(), [b'0'..=b'9']))
    };
    matches!(id, "con" | "prn" | "aux" | "nul") || numbered("com") || numbered("lpt")
}

/// An id as the folder may keep it: `^[a-z0-9][a-z0-9-]{0,63}$`, and not a
/// device name. Checked as text, before any IO.
pub(crate) fn check_id(id: &str) -> Result<(), CoreError> {
    let bytes = id.as_bytes();
    let plain = |b: u8| b.is_ascii_lowercase() || b.is_ascii_digit();
    let ok = !bytes.is_empty()
        && bytes.len() <= ID_MOST
        && plain(bytes[0])
        && bytes.iter().all(|&b| plain(b) || b == b'-');
    if !ok {
        return Err(refuse(format!(
            "not a valid id (1 to {ID_MOST} of a-z, 0-9 and -, starting with a letter or digit): {id:?}"
        )));
    }
    if device_name(id) {
        return Err(refuse(format!("a name Windows keeps for a device: {id}")));
    }
    Ok(())
}

/// Whether `key`, a confined path, is one of the data directories or under
/// one: `.verso/layouts` or `.verso/bundles` (ADR 0099 item 2, ADR 0098
/// item 2).
pub(crate) fn in_data_dir(key: &str) -> bool {
    [FolderDataKind::Layouts, FolderDataKind::Bundles]
        .iter()
        .any(|k| {
            let dir = format!("{}/{}", verso_fs::SETTINGS_DIR, k.dir());
            key == dir || key.strip_prefix(&dir).is_some_and(|r| r.starts_with('/'))
        })
}

/// The path of a data file, `/`-joined, relative to the folder.
fn path_of(kind: FolderDataKind, id: &str) -> Result<String, CoreError> {
    check_id(id)?;
    Ok(format!(
        "{}/{}/{id}.json",
        verso_fs::SETTINGS_DIR,
        kind.dir()
    ))
}

/// A text a data file of `kind` may hold: at most `kind.most()` bytes and
/// one JSON object.
fn check_text(kind: FolderDataKind, text: &str) -> Result<(), CoreError> {
    let most = kind.most();
    if text.len() > most {
        return Err(refuse(format!(
            "too large: {} bytes, the most is {most}",
            text.len()
        )));
    }
    match serde_json::from_str::<serde_json::Value>(text) {
        Ok(serde_json::Value::Object(_)) => Ok(()),
        Ok(_) => Err(refuse("not a JSON object")),
        Err(e) => Err(refuse(format!("not JSON: {e}"))),
    }
}

impl Workspace {
    /// The data files of `kind` the folder holds, by id, in id order, and
    /// the names beside them that are not an id. Nothing is created; a
    /// folder without the directory lists none.
    pub fn list_folder_data(&mut self, kind: FolderDataKind) -> Result<DataList, CoreError> {
        let prefix = format!("{}/{}/", verso_fs::SETTINGS_DIR, kind.dir());
        let listed = self.root.settings_walk().map_err(CoreError::Folder)?;
        let mut out = Vec::new();
        let mut strays = Vec::new();
        for entry in listed {
            let relative = entry.relative.to_string_lossy().into_owned();
            let Some(name) = relative.strip_prefix(&prefix) else {
                continue;
            };
            let Some(id) = name.strip_suffix(".json").filter(|id| check_id(id).is_ok()) else {
                // Not reachable by any command: named, never dropped.
                strays.push(name.to_owned());
                continue;
            };
            let revision = match entry.kind {
                EntryKind::Placeholder { .. } => String::new(),
                _ if entry.len > kind.most() as u64 => String::new(),
                _ => match self.root.read(entry.handle) {
                    Ok((_, stamp)) => revision::encode(&stamp),
                    Err(ReadError::Unavailable) => String::new(),
                    // Not readable now: not listed, never a deletion.
                    Err(_) => continue,
                },
            };
            out.push(DataEntry {
                id: id.to_owned(),
                revision,
            });
        }
        out.sort_by(|a, b| a.id.cmp(&b.id));
        strays.sort();
        strays.truncate(STRAYS_MOST);
        Ok(DataList {
            entries: out,
            strays,
        })
    }

    /// A data file's text, as it is on disk, with its revision. A
    /// placeholder is [`ReadError::Unavailable`]; a file past
    /// its kind's bound is refused unread; bytes that are not UTF-8 are
    /// [`CoreError::NotText`].
    pub fn read_folder_data(
        &mut self,
        kind: FolderDataKind,
        id: &str,
    ) -> Result<DataFile, CoreError> {
        let path = path_of(kind, id)?;
        let handle = self
            .root
            .handle(Path::new(&path))
            .map_err(CoreError::Confined)?;
        // A placeholder is reported before anything asks its length.
        if self
            .root
            .placeholder(handle)
            .map_err(CoreError::Read)?
            .is_some()
        {
            return Err(CoreError::Read(ReadError::Unavailable));
        }
        // A length that cannot be had (the file is absent, or only its
        // `.icloud` stand-in is there) is left to the read to say why.
        if let Ok((len, _)) = self.root.length_and_time(handle)
            && len > kind.most() as u64
        {
            return Err(refuse(format!(
                "too large: {len} bytes, the most is {}",
                kind.most()
            )));
        }
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let text = String::from_utf8(bytes).map_err(|_| CoreError::NotText)?;
        Ok(DataFile {
            text,
            revision: revision::encode(&stamp),
        })
    }

    /// Write a data file: with no `revision` a new file — `Exists` when
    /// something stands there —, else over the version that revision
    /// describes (`Changed` otherwise, nothing written). The text is one
    /// JSON object of at most `kind.most()` bytes, kept as given.
    /// Returns the revision of the bytes written.
    pub fn write_folder_data(
        &mut self,
        kind: FolderDataKind,
        id: &str,
        text: &str,
        revision: Option<&str>,
    ) -> Result<String, CoreError> {
        let path = path_of(kind, id)?;
        check_text(kind, text)?;
        let stamp = match revision {
            None => {
                let (handle, report) = self
                    .root
                    .create(Path::new(&path), text.as_bytes())
                    .map_err(CoreError::Write)?;
                self.stamp_of_written(handle, report.stamp, text.as_bytes())
            }
            Some(revision) => {
                let expected = Self::decode_revision(revision)?;
                let handle = self
                    .root
                    .handle(Path::new(&path))
                    .map_err(CoreError::Confined)?;
                let report = self
                    .root
                    .write(handle, text.as_bytes(), &expected)
                    .map_err(CoreError::Write)?;
                self.stamp_of_written(handle, report.stamp, text.as_bytes())
            }
        };
        self.layer_written();
        Ok(revision::encode(&stamp))
    }

    /// Remove a data file through the bin, when it is still the version
    /// `revision` describes (`Changed` otherwise, nothing moved). A file
    /// past its kind's bound has no revision to describe (the list gave an
    /// empty one) and is removed on an empty `revision`, unread.
    pub fn remove_folder_data(
        &mut self,
        kind: FolderDataKind,
        id: &str,
        revision: &str,
    ) -> Result<Trashed, CoreError> {
        let path = path_of(kind, id)?;
        let handle = self
            .root
            .handle(Path::new(&path))
            .map_err(CoreError::Confined)?;
        // A file past its kind's bound is listed with no revision and never
        // read: it goes to the bin on that empty revision, so the window can
        // clear it away and a forged revision cannot make the host read it.
        let too_big = self
            .root
            .length_and_time(handle)
            .is_ok_and(|(len, _)| len > kind.most() as u64);
        if too_big {
            if !revision.is_empty() {
                return Err(refuse(
                    "the file grew past the bound since it was listed: list again",
                ));
            }
        } else {
            let expected = Self::decode_revision(revision)?;
            let (_, current) = self.root.read(handle).map_err(CoreError::Read)?;
            if current != expected {
                return Err(CoreError::Write(WriteError::Changed { current }));
            }
        }
        // A write that lands between the check and the move goes to the bin
        // with the file, so nothing is lost; the bin keeps both.
        let (gone, report) = self
            .root
            .trash(Path::new(&path))
            .map_err(CoreError::Write)?;
        self.layer_written();
        Ok(Trashed {
            path: gone.to_string_lossy().into_owned(),
            original: path,
            warnings: report.warnings(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_id_is_lower_case_short_and_not_a_device() {
        for ok in ["a", "mesa-1", "0", "a-", &"a".repeat(64)] {
            assert!(check_id(ok).is_ok(), "{ok}");
        }
        for bad in [
            "",
            "-a",
            "A",
            "aB",
            "a..b",
            "a/b",
            "a\\b",
            "..",
            "a.json",
            "a b",
            "é",
            "a\0",
            &"a".repeat(65),
            "con",
            "nul",
            "prn",
            "aux",
            "com1",
            "lpt9",
            "com0",
        ] {
            assert!(check_id(bad).is_err(), "{bad:?}");
        }
        assert!(check_id("com10").is_ok());
        assert!(check_id("console").is_ok());
    }

    #[test]
    fn a_text_is_one_json_object_within_the_bound() {
        let k = FolderDataKind::Layouts;
        assert!(check_text(k, "{}").is_ok());
        assert!(check_text(k, "[1]").is_err());
        assert!(check_text(k, "\"x\"").is_err());
        assert!(check_text(k, "not json").is_err());
        let big = format!("{{\"a\":\"{}\"}}", "x".repeat(FOLDER_LAYOUT_MOST));
        assert!(check_text(k, &big).is_err());
        // A bundle may be larger, to 4 MiB.
        assert!(check_text(FolderDataKind::Bundles, &big).is_ok());
        let huge = format!("{{\"a\":\"{}\"}}", "x".repeat(FOLDER_BUNDLE_MOST));
        assert!(check_text(FolderDataKind::Bundles, &huge).is_err());
    }
}
