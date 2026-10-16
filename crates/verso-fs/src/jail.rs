// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Where a path really is, asked when it is used (ADR 0096 item 2, amended
//! 2026-10-16). A folder served alone is narrower than the vault: a phone
//! may touch only what lies, **on the disk**, inside the chosen folder. A
//! name proves nothing — a link in it, a case or Unicode form the file
//! system folds, a folder moved since the links were looked at — so the
//! path is resolved to its real place at every use and nothing is kept: no
//! list of links, no cache. Cross-platform: the real place is the system's
//! own (`canonicalize`: symlinks on Unix, symlinks and junctions on
//! Windows, the folding of macOS and Windows names), and a path the system
//! cannot resolve is refused.

use std::path::{Path, PathBuf};

/// Whether `rel` is, on the disk, the folder `within` or inside it — both
/// paths of `vault`, `/`-joined, relative to it, `rel` textually under
/// `within`. Every part of the way from `within` down is resolved through
/// the system's own links and folding and must itself be inside: a name
/// reached *through* a folder that leaves is not inside, even when its
/// end comes back. A path to create is judged by the deepest part that
/// exists. A part that is not a plain name, or cannot be resolved (a link
/// whose end is missing, a loop), is refused.
#[must_use]
pub fn resolves_within(vault: &Path, rel: &str, within: &str) -> bool {
    if rel != within && !rel.starts_with(&format!("{within}/")) {
        return false;
    }
    let Ok(vault) = std::fs::canonicalize(vault) else {
        return false;
    };
    let mut real = vault;
    let mut inside: Option<PathBuf> = None;
    let mut gone = false;
    let depth = within.split('/').count();
    for (i, part) in rel.split('/').enumerate() {
        if part.is_empty() || part == "." || part == ".." || part.contains(['\\', ':', '\0']) {
            return false;
        }
        real.push(part);
        if !gone {
            match std::fs::symlink_metadata(&real) {
                Ok(_) => match std::fs::canonicalize(&real) {
                    Ok(r) => real = r,
                    Err(_) => return false,
                },
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => gone = true,
                Err(_) => return false,
            }
        }
        if i + 1 == depth {
            inside = Some(real.clone());
        } else if i + 1 > depth && !inside.as_ref().is_some_and(|root| real.starts_with(root)) {
            return false;
        }
    }
    inside.is_some()
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use super::*;

    #[cfg(unix)]
    fn link(target: &str, at: &Path) {
        std::os::unix::fs::symlink(target, at).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_path_is_judged_by_where_it_really_is() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        for sub in ["Projetos/Sub", "Projetos/A/B", "Segredo"] {
            std::fs::create_dir_all(d.join(sub)).unwrap();
        }
        std::fs::write(d.join("Segredo/c.md"), "x").unwrap();
        std::fs::write(d.join("Projetos/a.md"), "x").unwrap();
        std::fs::write(d.join("Projetos/Raiz.md"), "x").unwrap();
        link("../Segredo", &d.join("Projetos/dir"));
        link("../../Segredo/c.md", &d.join("Projetos/Sub/f.md"));
        link("Sub", &d.join("Projetos/alias"));
        link("../../Raiz.md", &d.join("Projetos/A/B/l.md"));
        let inside = |rel: &str| resolves_within(d, rel, "Projetos");
        assert!(inside("Projetos"));
        assert!(inside("Projetos/a.md"));
        assert!(inside("Projetos/alias/new.md"), "a link that stays inside");
        assert!(
            inside("Projetos/nope/deeper/new.md"),
            "to create, by what exists"
        );
        assert!(inside("Projetos/A/B/l.md"));
        link("../Projetos/a.md", &d.join("Segredo/in.md"));
        assert!(
            !inside("Projetos/dir/in.md"),
            "reached through a folder that leaves"
        );
        assert!(!inside("Projetos/dir/c.md"));
        assert!(
            !inside("Projetos/dir/new.md"),
            "a create through a link out"
        );
        assert!(!inside("Projetos/Sub/f.md"));
        assert!(!inside("Segredo/c.md"));
        assert!(!inside("Projetos/../Segredo"));
        // Moved since: the same link, one level up, now leaves the folder.
        std::fs::rename(d.join("Projetos/A/B"), d.join("Projetos/B")).unwrap();
        assert!(!inside("Projetos/B/l.md"));
        // A link whose end is missing is not trusted.
        link("nowhere", &d.join("Projetos/broken"));
        assert!(!inside("Projetos/broken"));
    }
}
