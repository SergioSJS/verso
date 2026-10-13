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
/// there. On Unix it is made `0750` (ADR 0083 item 11, finding F20): the
/// server's user whole, its group to read — a backup run as that group —
/// and nothing for other users of the host, whatever the folders root
/// gives them; the process's umask may narrow it further, never widen it.
/// On Windows the folder inherits the root's permissions.
pub fn make_folder(root: &Path, name: &str) -> io::Result<PathBuf> {
    let path = folder_path(root, name)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "not a folder name"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        std::fs::DirBuilder::new().mode(0o750).create(&path)?;
    }
    #[cfg(not(unix))]
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

/// A file of the server's own kept to its owner (threat-model.md, gap
/// 13): its database of accounts and password hashes, which SQLite makes
/// with the process's umask (0644 under the usual 022), readable by any
/// other user of the host. SQLite gives its journal files the database's
/// mode as it makes them; those already there are set here too. A file
/// that is not there is left so. Nothing on Windows, where the profile's
/// or the service's own permissions decide.
pub fn owner_only(path: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = match std::fs::metadata(path) {
            Ok(m) => m.permissions().mode(),
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(e),
        };
        if mode & 0o077 != 0 {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        }
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn a_servers_own_file_is_kept_to_its_owner() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("server.sqlite");
        std::fs::write(&file, "x").unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();
        owner_only(&file).unwrap();
        let mode = std::fs::metadata(&file).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        owner_only(&dir.path().join("server.sqlite-wal")).unwrap();
    }

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

    /// A folder is made 0750 (ADR 0083 item 11, finding F20): the owner
    /// whole, the group may read, other users of the host nothing — not
    /// the process's umask, 0755 under the usual 022.
    #[cfg(unix)]
    #[test]
    fn a_folder_is_made_for_its_owner_and_group_only() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let made = make_folder(root.path(), "Campanha").unwrap();
        let mode = std::fs::metadata(&made).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode & 0o700, 0o700, "{mode:o}");
        assert_eq!(mode & 0o027, 0, "{mode:o}: group write or others");
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

    /// A link is judged by where it leads whether or not its end is there:
    /// one to a missing place outside, one through `..` out of the folder
    /// and a loop are refused; one to a missing place inside is a new file
    /// inside.
    #[test]
    fn a_link_whose_end_is_missing_is_judged_by_where_it_points() {
        let outside = tempfile::tempdir().unwrap();
        let folder = tempfile::tempdir().unwrap();
        let link = |target: &Path, name: &str| {
            std::os::unix::fs::symlink(target, folder.path().join(name)).unwrap();
        };
        link(&outside.path().join("sumiu.md"), "fora.md");
        link(&outside.path().join("sumiu/longe.md"), "fora-fundo.md");
        link(Path::new("../../../../../../../../tmp/x.md"), "subindo.md");
        link(Path::new("ausente/../../x.md"), "voltando.md");
        link(Path::new("laco-b.md"), "laco-a.md");
        link(Path::new("laco-a.md"), "laco-b.md");
        link(Path::new("ainda-nao.md"), "dentro.md");
        link(&folder.path().join("pasta/nova.md"), "dentro-absoluto.md");
        let mut root = Root::open(folder.path(), Vec::new()).unwrap();
        root.set_links_inside(true);
        for leaving in [
            "fora.md",
            "fora-fundo.md",
            "subindo.md",
            "voltando.md",
            "laco-a.md",
        ] {
            assert_eq!(
                root.handle(Path::new(leaving)).unwrap_err(),
                ConfinementError::LeavesFolder,
                "{leaving}"
            );
        }
        for inside in ["dentro.md", "dentro-absoluto.md"] {
            assert!(root.handle(Path::new(inside)).is_ok(), "{inside}");
        }
    }
}

#[cfg(test)]
#[cfg(unix)]
mod links_while_written {
    use std::path::Path;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    use crate::{ConfinementError, Root};

    /// A folder with a note, a note in a directory, and a link inside to
    /// that one; `write` replaces their content in another thread while
    /// this one asks whether each stays in the folder. Returns how many
    /// answers said "a link that leads out", and how many were asked.
    fn refusals_while(write: impl FnOnce(&Path) + Send + 'static) -> (u32, u32) {
        let folder = tempfile::tempdir().unwrap();
        std::fs::create_dir(folder.path().join("dentro")).unwrap();
        std::fs::write(folder.path().join("nota.md"), "0").unwrap();
        std::fs::write(folder.path().join("dentro/alvo.md"), "0").unwrap();
        std::os::unix::fs::symlink("dentro/alvo.md", folder.path().join("ligada.md")).unwrap();
        let done = Arc::new(AtomicBool::new(false));
        let writer = {
            let done = Arc::clone(&done);
            let path = folder.path().to_path_buf();
            std::thread::spawn(move || {
                write(&path);
                done.store(true, Ordering::Relaxed);
            })
        };
        let mut root = Root::open(folder.path(), Vec::new()).unwrap();
        root.set_links_inside(true);
        let (mut refused, mut asked) = (0, 0);
        while !done.load(Ordering::Relaxed) {
            for name in ["nota.md", "dentro/alvo.md", "ligada.md"] {
                asked += 1;
                if root.confine(Path::new(name)) == Err(ConfinementError::LeavesFolder) {
                    refused += 1;
                }
            }
        }
        writer.join().unwrap();
        (refused, asked)
    }

    /// Verso's own atomic write: the rename leaves the name to the old
    /// file or the new one, and the check never reads it as a way out.
    #[test]
    fn a_file_replaced_by_an_atomic_write_is_not_a_link_that_leaves() {
        let (refused, asked) = refusals_while(|path| {
            let mut root = Root::open(path, Vec::new()).unwrap();
            let plain = root.handle(Path::new("nota.md")).unwrap();
            let linked = root.handle(Path::new("ligada.md")).unwrap();
            for i in 0..100 {
                for handle in [plain, linked] {
                    let (_, stamp) = root.read(handle).unwrap();
                    let _ = root
                        .write(handle, format!("{i}").as_bytes(), &stamp)
                        .unwrap();
                }
            }
        });
        assert_eq!(
            refused, 0,
            "{refused} of {asked} checks said the file leaves"
        );
    }

    /// A replacement that leaves the name empty for an instant — another
    /// app's save, a rename a network file system does not make atomic:
    /// a file missing at the moment of the check is not a link leading
    /// out either.
    #[test]
    fn a_file_missing_for_an_instant_is_not_a_link_that_leaves() {
        let (refused, asked) = refusals_while(|path| {
            for i in 0..5000 {
                for name in ["nota.md", "dentro/alvo.md"] {
                    let file = path.join(name);
                    let temp = path.join(format!(".tmp-{i}"));
                    std::fs::write(&temp, format!("{i}")).unwrap();
                    std::fs::remove_file(&file).unwrap();
                    std::fs::rename(&temp, &file).unwrap();
                }
            }
        });
        assert_eq!(
            refused, 0,
            "{refused} of {asked} checks said the file leaves"
        );
    }
}
