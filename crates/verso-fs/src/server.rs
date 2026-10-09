// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The root under which a server keeps its folders of notes
//! (`VERSO_FOLDERS_DIR`, ADR 0075 item 3): which folders stand there, a
//! new one made, and whether the root is on a network file system, where
//! the watcher hears nothing and the server scans instead.

use std::io;
use std::path::{Path, PathBuf};

/// The directories directly under `root`, by name, sorted: the folders
/// the admin may open or adopt. Hidden ones (`.name`) are not folders of
/// notes; a symlink is listed when it points to a directory.
pub fn folders_under(root: &Path) -> io::Result<Vec<String>> {
    let mut names = Vec::new();
    for entry in std::fs::read_dir(root)? {
        let entry = entry?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        if std::fs::metadata(entry.path()).is_ok_and(|m| m.is_dir()) {
            names.push(name);
        }
    }
    names.sort();
    Ok(names)
}

/// Whether `name` may name a folder directly under the root: one
/// component, not hidden, no separator of any system, nothing a system
/// refuses (ADR 0070 item 3).
#[must_use]
pub fn is_folder_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 255
        && !name.starts_with('.')
        && name.trim() == name
        && !name.ends_with('.')
        && !name.chars().any(|c| {
            matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control()
        })
}

/// The directory of folder `name` under `root`; `None` when `name` is not
/// one ([`is_folder_name`]). The path is formed here and never crosses.
#[must_use]
pub fn folder_path(root: &Path, name: &str) -> Option<PathBuf> {
    is_folder_name(name).then(|| root.join(name))
}

/// Make folder `name` under `root`; `AlreadyExists` when something stands
/// there.
pub fn make_folder(root: &Path, name: &str) -> io::Result<PathBuf> {
    let path = folder_path(root, name)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "not a folder name"))?;
    std::fs::create_dir(&path)?;
    crate::os::sync_dir(root)?;
    Ok(path)
}

/// The name of the file system `path` is on when it is a network one
/// (NFS, SMB, AFP, WebDAV, sshfs): the watcher hears nothing there and
/// SQLite's locks are not to be trusted (ADR 0075 item 3). `None` when it
/// is local or the system could not say.
#[must_use]
pub fn network_file_system(path: &Path) -> Option<String> {
    detect(path)
}

#[cfg(target_os = "macos")]
fn detect(path: &Path) -> Option<String> {
    crate::write::network_fs(path)
}

#[cfg(target_os = "linux")]
fn detect(path: &Path) -> Option<String> {
    let stat = nix::sys::statfs::statfs(path).ok()?;
    // The magic numbers of statfs(2): NFS, SMB, CIFS, SMB2, FUSE (sshfs
    // and the like, which may be anything — counted as network: a scan
    // costs less than a change never heard), Ceph, AFS, 9p.
    let name = match stat.filesystem_type().0 as u64 {
        0x6969 => "nfs",
        0x517B => "smb",
        0xFF534D42 => "cifs",
        0xFE534D42 => "smb2",
        0x65735546 => "fuse",
        0x00C36400 => "ceph",
        0x5346414F => "afs",
        0x01021997 => "9p",
        _ => return None,
    };
    Some(name.to_owned())
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn detect(_path: &Path) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folders_are_the_visible_directories_under_the_root() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("Campanha")).unwrap();
        std::fs::create_dir(root.path().join(".lixo")).unwrap();
        std::fs::write(root.path().join("solto.md"), "x").unwrap();
        assert_eq!(folders_under(root.path()).unwrap(), vec!["Campanha"]);
        make_folder(root.path(), "Notas").unwrap();
        assert_eq!(
            folders_under(root.path()).unwrap(),
            vec!["Campanha", "Notas"]
        );
        assert_eq!(
            make_folder(root.path(), "Notas").unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        for bad in ["", ".oculta", "a/b", "a\\b", "..", " x", "x.", "c:d"] {
            assert!(!is_folder_name(bad), "{bad:?}");
            assert!(make_folder(root.path(), bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn a_local_disk_is_not_a_network_file_system() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(network_file_system(root.path()), None);
    }
}

#[cfg(all(test, unix))]
mod links {
    use std::path::Path;

    use crate::{ConfinementError, EntryKind, Root};

    #[test]
    fn on_a_server_a_link_that_leaves_is_refused_and_one_inside_is_followed() {
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("segredo.md"), "fora").unwrap();
        let folder = tempfile::tempdir().unwrap();
        std::fs::create_dir(folder.path().join("dentro")).unwrap();
        std::fs::write(folder.path().join("dentro/nota.md"), "dentro").unwrap();
        std::os::unix::fs::symlink(outside.path(), folder.path().join("fora")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("segredo.md"),
            folder.path().join("solto.md"),
        )
        .unwrap();
        std::os::unix::fs::symlink(folder.path().join("dentro"), folder.path().join("atalho"))
            .unwrap();
        let mut root = Root::open(folder.path(), Vec::new()).unwrap();
        // One person's folder: followed wherever they point (ADR 0044).
        assert!(root.handle(Path::new("fora/segredo.md")).is_ok());
        root.set_links_inside(true);
        for leaving in ["fora/segredo.md", "solto.md", "fora", "fora/novo.md"] {
            assert_eq!(
                root.handle(Path::new(leaving)).unwrap_err(),
                ConfinementError::LeavesFolder,
                "{leaving}"
            );
        }
        assert!(root.handle(Path::new("atalho/nota.md")).is_ok());
        assert!(root.handle(Path::new("dentro/novo.md")).is_ok());
        let walk = root.walk();
        let names: Vec<String> = walk
            .entries
            .iter()
            .map(|e| e.relative.to_string_lossy().into_owned())
            .collect();
        assert!(
            names
                .iter()
                .all(|n| !n.starts_with("fora") && n != "solto.md"),
            "{names:?}"
        );
        // The link inside is followed; its directory is walked once, under
        // the first name met (ADR 0044's duplicate rule).
        assert!(names.contains(&"atalho/nota.md".to_owned()), "{names:?}");
        assert!(
            walk.entries
                .iter()
                .any(|e| e.relative == Path::new("atalho") && e.kind == EntryKind::Directory)
        );
        let refused = walk
            .problems
            .iter()
            .filter(|p| matches!(p, crate::Problem::Io { .. }))
            .count();
        assert_eq!(refused, 2, "{:?}", walk.problems);
    }
}
