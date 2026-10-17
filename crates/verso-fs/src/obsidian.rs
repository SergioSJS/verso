// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Three of Obsidian's settings files, read once and never written (ADR
//! 0093 item 11): the core Daily notes plugin's `.obsidian/daily-notes.json`
//! and the community Periodic Notes plugin's
//! `.obsidian/plugins/periodic-notes/data.json`, so that Settings can offer
//! their values for Verso's periodic notes; and Obsidian's own
//! `.obsidian/app.json`, for the one key `attachmentFolderPath`, so that
//! "this app is a server" can show a phone the vault's attachments folder
//! read-only (ADR 0096 item 2, amended 2026-10-16 — this widens the
//! exception by one path, recorded there). An exception beside `.verso/`'s
//! ([`crate::settings`]), and narrower: exactly these three paths, named
//! here and nowhere else; read-only — nothing in this crate writes under
//! `.obsidian/`, and these paths are not confined like a file of the
//! folder, so no write, rename or deletion can name them; bounded — a
//! file larger than [`OBSIDIAN_SETTINGS_MAX`] is not read. The walk still
//! never enters `.obsidian/` (ADR 0044), and a configuration folder
//! renamed in Obsidian is not looked for.
//!
//! No symlink is followed on the way, neither `.obsidian` nor a directory
//! under it nor the file: the exception reads a file of the folder's own
//! `.obsidian/`, never one a link points to elsewhere. A placeholder of
//! on-demand storage is never opened (ADR 0043): it is said as such, and
//! the offer waits for the file to be downloaded.

use std::io::Read;
use std::path::{Path, PathBuf};

use crate::{Root, on_disk, placeholder};

/// The files the exception reads, and nothing else.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ObsidianSettings {
    /// The core Daily notes plugin's settings: `folder`, `format`,
    /// `template`.
    DailyNotes,
    /// The Periodic Notes plugin's settings, in either of its two shapes
    /// (0.0.17: one object per period; 1.0: calendar sets).
    PeriodicNotes,
    /// Obsidian's own settings, `.obsidian/app.json`: only the folder it
    /// names for attachments is looked at.
    App,
}

impl ObsidianSettings {
    /// The file's path relative to the folder, joined by `/`.
    #[must_use]
    pub const fn path(self) -> &'static str {
        match self {
            Self::DailyNotes => ".obsidian/daily-notes.json",
            Self::PeriodicNotes => ".obsidian/plugins/periodic-notes/data.json",
            Self::App => ".obsidian/app.json",
        }
    }
}

/// The largest settings file read: a settings file of either plugin is a
/// few hundred bytes; anything this large is not one of them.
pub const OBSIDIAN_SETTINGS_MAX: u64 = 64 * 1024;

/// What reading one of the two files found.
#[derive(Debug, PartialEq, Eq)]
pub enum ObsidianRead {
    /// Nothing there, or something that is not a plain file reached
    /// without a symlink (a directory, a link, a device).
    Absent,
    /// A placeholder of on-demand storage: present, content in the cloud.
    Unavailable,
    /// Larger than [`OBSIDIAN_SETTINGS_MAX`]: not read.
    TooLarge,
    /// The file's bytes.
    Found(Vec<u8>),
}

impl Root {
    /// Read one of Obsidian's settings files the exception names (ADR 0093
    /// item 11 names two; `.obsidian/app.json` is a third, for "this app is a
    /// server" — ADR 0096 item 2, amended 2026-10-16, where the widening
    /// awaits the maintainer's sign-off): never written, never created, never followed
    /// through a symlink, never more than [`OBSIDIAN_SETTINGS_MAX`] bytes.
    pub fn read_obsidian_settings(&self, which: ObsidianSettings) -> std::io::Result<ObsidianRead> {
        read_plain(self.root_path(), Path::new(which.path()))
    }
}

/// `relative` under `root`, each step a real directory and the last a
/// plain file, none a symlink; at most [`OBSIDIAN_SETTINGS_MAX`] bytes.
fn read_plain(root: &Path, relative: &Path) -> std::io::Result<ObsidianRead> {
    let parts: Vec<_> = relative.components().collect();
    let Some((_, dirs)) = parts.split_last() else {
        return Ok(ObsidianRead::Absent);
    };
    let mut at = PathBuf::from(root);
    for part in dirs {
        at.push(part);
        match at.symlink_metadata() {
            Ok(m) if m.is_dir() => {}
            Ok(_) => return Ok(ObsidianRead::Absent),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(ObsidianRead::Absent),
            Err(e) => return Err(e),
        }
    }
    let file = on_disk(root, relative);
    let meta = match file.symlink_metadata() {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // Only its iCloud sibling stands there: a placeholder.
            return Ok(if placeholder::sibling_exists(&file) {
                ObsidianRead::Unavailable
            } else {
                ObsidianRead::Absent
            });
        }
        Err(e) => return Err(e),
    };
    if !meta.is_file() {
        return Ok(ObsidianRead::Absent);
    }
    if placeholder::is_dataless(&meta) {
        return Ok(ObsidianRead::Unavailable);
    }
    if meta.len() > OBSIDIAN_SETTINGS_MAX {
        return Ok(ObsidianRead::TooLarge);
    }
    let mut bytes = Vec::new();
    // Bounded again while reading: a file that grew since its length was
    // taken is not read past the limit.
    std::fs::File::open(&file)?
        .take(OBSIDIAN_SETTINGS_MAX + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > OBSIDIAN_SETTINGS_MAX {
        return Ok(ObsidianRead::TooLarge);
    }
    Ok(ObsidianRead::Found(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder() -> (tempfile::TempDir, Root) {
        let dir = tempfile::tempdir().unwrap();
        let root = Root::open(dir.path(), Vec::new()).unwrap();
        (dir, root)
    }

    fn put(dir: &Path, rel: &str, bytes: &[u8]) {
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn the_two_files_are_read_as_they_are() {
        let (dir, root) = folder();
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::DailyNotes)
                .unwrap(),
            ObsidianRead::Absent
        );
        put(
            dir.path(),
            ".obsidian/daily-notes.json",
            br#"{"folder":"Daily"}"#,
        );
        put(
            dir.path(),
            ".obsidian/plugins/periodic-notes/data.json",
            br#"{"weekly":{"enabled":true}}"#,
        );
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::DailyNotes)
                .unwrap(),
            ObsidianRead::Found(br#"{"folder":"Daily"}"#.to_vec())
        );
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::PeriodicNotes)
                .unwrap(),
            ObsidianRead::Found(br#"{"weekly":{"enabled":true}}"#.to_vec())
        );
    }

    #[test]
    fn nothing_else_under_obsidian_is_reachable_and_nothing_there_is_written() {
        let (dir, mut root) = folder();
        put(dir.path(), ".obsidian/daily-notes.json", b"{}");
        put(dir.path(), ".obsidian/app.json", b"{}");
        put(dir.path(), ".obsidian/workspace.json", b"{}");
        let before = std::fs::read_dir(dir.path().join(".obsidian"))
            .unwrap()
            .count();
        // The exception reads by name, and its names are the two above;
        // every other way into `.obsidian/` stays refused, writes included.
        for path in [
            ".obsidian/app.json",
            ".obsidian/workspace.json",
            ".obsidian/daily-notes.json",
            ".obsidian/plugins/periodic-notes/data.json",
        ] {
            assert!(root.handle(Path::new(path)).is_err(), "{path}");
            assert!(root.create(Path::new(path), b"x").is_err(), "{path}");
        }
        assert!(root.trash(Path::new(".obsidian/daily-notes.json")).is_err());
        assert!(
            root.rename(
                Path::new(".obsidian/daily-notes.json"),
                Path::new("daily-notes.json")
            )
            .is_err()
        );
        let _ = root.read_obsidian_settings(ObsidianSettings::DailyNotes);
        let _ = root.read_obsidian_settings(ObsidianSettings::PeriodicNotes);
        assert_eq!(
            std::fs::read_dir(dir.path().join(".obsidian"))
                .unwrap()
                .count(),
            before
        );
        assert_eq!(
            std::fs::read(dir.path().join(".obsidian/daily-notes.json")).unwrap(),
            b"{}"
        );
        // The walk still does not list it.
        let listed: Vec<_> = root
            .walk()
            .entries
            .into_iter()
            .map(|e| e.relative)
            .collect();
        assert!(
            listed.iter().all(|p| !p.starts_with(".obsidian")),
            "{listed:?}"
        );
    }

    #[test]
    fn a_file_too_large_is_not_read() {
        let (dir, root) = folder();
        let big = vec![b' '; usize::try_from(OBSIDIAN_SETTINGS_MAX).unwrap() + 1];
        put(dir.path(), ".obsidian/daily-notes.json", &big);
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::DailyNotes)
                .unwrap(),
            ObsidianRead::TooLarge
        );
        let fits = vec![b' '; usize::try_from(OBSIDIAN_SETTINGS_MAX).unwrap()];
        put(dir.path(), ".obsidian/daily-notes.json", &fits);
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::DailyNotes)
                .unwrap(),
            ObsidianRead::Found(fits)
        );
    }

    #[test]
    fn a_directory_in_place_of_the_file_is_absent() {
        let (dir, root) = folder();
        std::fs::create_dir_all(dir.path().join(".obsidian/daily-notes.json")).unwrap();
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::DailyNotes)
                .unwrap(),
            ObsidianRead::Absent
        );
    }

    #[test]
    fn an_icloud_placeholder_is_said_and_never_opened() {
        let (dir, root) = folder();
        put(dir.path(), ".obsidian/.daily-notes.json.icloud", b"bplist");
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::DailyNotes)
                .unwrap(),
            ObsidianRead::Unavailable
        );
    }

    #[cfg(unix)]
    #[test]
    fn no_symlink_is_followed_on_the_way() {
        let (dir, root) = folder();
        let outside = tempfile::tempdir().unwrap();
        put(
            outside.path(),
            "daily-notes.json",
            br#"{"folder":"secret"}"#,
        );
        put(
            outside.path(),
            "plugins/periodic-notes/data.json",
            br#"{"secret":true}"#,
        );
        // The configuration folder itself a link out of the folder.
        std::os::unix::fs::symlink(outside.path(), dir.path().join(".obsidian")).unwrap();
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::DailyNotes)
                .unwrap(),
            ObsidianRead::Absent
        );
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::PeriodicNotes)
                .unwrap(),
            ObsidianRead::Absent
        );
        // A real `.obsidian/` whose file, or a directory under it, links out.
        std::fs::remove_file(dir.path().join(".obsidian")).unwrap();
        std::fs::create_dir_all(dir.path().join(".obsidian")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("daily-notes.json"),
            dir.path().join(".obsidian/daily-notes.json"),
        )
        .unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("plugins"),
            dir.path().join(".obsidian/plugins"),
        )
        .unwrap();
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::DailyNotes)
                .unwrap(),
            ObsidianRead::Absent
        );
        assert_eq!(
            root.read_obsidian_settings(ObsidianSettings::PeriodicNotes)
                .unwrap(),
            ObsidianRead::Absent
        );
    }
}
