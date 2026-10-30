// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder windows open when the app quit (ADR 0065): the keys of the
//! folders the windows showed, kept in `<config>/open-windows.json` beside
//! the indexes and never in a folder, so the next start brings every one
//! of them back. A key is what `FolderInfo.key` carries (never a path,
//! ADR 0026 rule 4) or, for a folder of a server, the address the window
//! keeps for it (`server:<url>#<folder>`). The host writes it and reads it
//! at start; nothing of it crosses the contract.

use std::path::{Path, PathBuf};

use crate::{CoreError, Sidecar, config_dir, key_for, sidecar, well_formed_key};

/// The most windows remembered: a bound on what a damaged file can ask.
const MOST: usize = 32;

fn dir(config: Option<&Path>) -> Result<PathBuf, CoreError> {
    match config {
        Some(dir) => Ok(dir.to_path_buf()),
        None => config_dir(),
    }
}

/// Whether `key` has a shape this app issues: a folder's key, or a server's.
fn issued(key: &str) -> bool {
    well_formed_key(key) || key.strip_prefix("server:").is_some_and(|r| r.contains('#'))
}

/// The windows' folders at the last remembering, in the order the windows
/// were: empty when the file is missing or does not read (a first start, or
/// a version before this one). A key of a shape this app never issues is
/// left out.
#[must_use]
pub fn open_windows(config: Option<&Path>) -> Vec<String> {
    let Ok(dir) = dir(config) else {
        return Vec::new();
    };
    sidecar::read_open_windows(&dir)
        .into_iter()
        .filter(|k| issued(k))
        .take(MOST)
        .collect()
}

/// Remember the folders the windows show, replacing what was kept.
pub fn keep_open_windows(config: Option<&Path>, keys: &[String]) -> Result<(), CoreError> {
    let dir = dir(config)?;
    let keys: Vec<String> = keys
        .iter()
        .filter(|k| issued(k))
        .take(MOST)
        .cloned()
        .collect();
    sidecar::write_open_windows(&dir, &keys).map_err(CoreError::Sidecar)
}

/// The folder a key names, when it is one this computer opened before and
/// is still there: for the host to open again, at the edge (the path never
/// crosses, rule 4). `None` for a key that names nothing or whose folder
/// is gone or unreachable.
#[must_use]
pub fn folder_for_key(key: &str, config: Option<&Path>) -> Option<PathBuf> {
    if !well_formed_key(key) {
        return None;
    }
    let index = dir(config)
        .ok()?
        .join("index")
        .join(format!("{key}.sqlite"));
    let sidecar = Sidecar::read(&index).ok()?;
    if key_for(&sidecar.folder) != key {
        return None;
    }
    verso_fs::Root::open(&sidecar.folder, Vec::new()).ok()?;
    Some(sidecar.folder)
}

/// The most files remembered as recent (ADR 0114 Q4: ten).
const MOST_FILES: usize = 10;

/// The files opened without a folder lately, freshest first: paths at the
/// edge, for the host's menu; never for a window (rule 4).
#[must_use]
pub fn recent_files(config: Option<&Path>) -> Vec<PathBuf> {
    let Ok(dir) = dir(config) else {
        return Vec::new();
    };
    sidecar::read_recent_files(&dir)
        .into_iter()
        .filter(|p| p.is_absolute())
        .take(MOST_FILES)
        .collect()
}

/// `path` was just opened: first of the recents, the list kept to
/// [`MOST_FILES`].
pub fn remember_recent_file(config: Option<&Path>, path: &Path) -> Result<(), CoreError> {
    let dir = dir(config)?;
    let mut files: Vec<PathBuf> = recent_files(config)
        .into_iter()
        .filter(|p| p != path)
        .collect();
    files.insert(0, path.to_path_buf());
    files.truncate(MOST_FILES);
    sidecar::write_recent_files(&dir, &files).map_err(CoreError::Sidecar)
}

/// `path` is gone (picked from the menu and not there): dropped from the
/// recents.
pub fn forget_recent_file(config: Option<&Path>, path: &Path) -> Result<(), CoreError> {
    let dir = dir(config)?;
    let files: Vec<PathBuf> = recent_files(config)
        .into_iter()
        .filter(|p| p != path)
        .collect();
    sidecar::write_recent_files(&dir, &files).map_err(CoreError::Sidecar)
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "notas-0123456789abcdef";
    const B: &str = "diario-fedcba9876543210";

    #[test]
    fn the_windows_kept_come_back_in_order() {
        let config = tempfile::tempdir().unwrap();
        let at = Some(config.path());
        assert!(open_windows(at).is_empty());
        let server = "server:https://notas.casa#casa".to_owned();
        keep_open_windows(at, &[A.into(), server.clone(), B.into()]).unwrap();
        assert_eq!(open_windows(at), [A, server.as_str(), B]);
        // Replaced, not added to.
        keep_open_windows(at, &[B.into()]).unwrap();
        assert_eq!(open_windows(at), [B]);
    }

    /// `open-windows.json` written by hand, through tempfile (the file API stays in sidecar.rs, ADR 0029).
    fn hand_written(config: &Path, text: &str) {
        use std::io::Write as _;
        let mut file = tempfile::NamedTempFile::new_in(config).unwrap();
        file.write_all(text.as_bytes()).unwrap();
        file.persist(config.join("open-windows.json")).unwrap();
    }

    #[test]
    fn a_key_this_app_never_issues_is_not_kept_or_read() {
        let config = tempfile::tempdir().unwrap();
        let at = Some(config.path());
        keep_open_windows(at, &["/etc".into(), "../x".into(), A.into()]).unwrap();
        assert_eq!(open_windows(at), [A]);
        // A file written by hand with a path in it is read the same way.
        hand_written(
            config.path(),
            r#"{"windows":["/home/ana/notas","notas-0123456789abcdef"]}"#,
        );
        assert_eq!(open_windows(at), [A]);
    }

    #[test]
    fn a_damaged_file_is_no_windows() {
        let config = tempfile::tempdir().unwrap();
        hand_written(config.path(), "{ not json");
        assert!(open_windows(Some(config.path())).is_empty());
    }

    #[test]
    fn a_key_names_its_folder_only_while_the_folder_is_there() {
        let config = tempfile::tempdir().unwrap();
        let folder = tempfile::tempdir().unwrap();
        let at = Some(config.path());
        let mut workspace = crate::Workspace::open(folder.path(), at).unwrap();
        workspace.index().unwrap();
        let key = workspace.key();
        drop(workspace);
        let named = folder_for_key(&key, at).expect("the folder is there");
        assert_eq!(named.file_name(), folder.path().file_name());
        assert_eq!(folder_for_key("../x", at), None);
        assert_eq!(folder_for_key(A, at), None);
        let gone = folder.path().to_path_buf();
        drop(folder);
        assert_eq!(folder_for_key(&key, at), None, "{gone:?} is gone");
    }
}
