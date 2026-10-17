// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The symbolic links under a folder inside a folder that lead out of it
//! (ADR 0096 item 2, amended 2026-10-16). `links_inside` keeps a link inside
//! the *vault*; a folder served alone is narrower than the vault, so a link
//! in it to a sibling folder is outside what was chosen. The server leaves
//! every path through such a link out of what a phone is told or may touch.

use std::path::{Component, Path, PathBuf};

use crate::lands_inside;

/// Every symlink under `within` (a folder of the vault, `/`-joined, relative
/// to it) whose end is not inside `within` — or is not there at all — as
/// paths relative to the vault. Real directories are entered; a symlink is
/// not (a link that stays inside leads to what is walked at its real place).
pub fn escaping_links(vault: &Path, within: &str) -> std::io::Result<Vec<String>> {
    let top = vault.join(within);
    let canonical = std::fs::canonicalize(&top)?;
    let mut out = Vec::new();
    walk(vault, &top, &canonical, &mut out, 0)?;
    out.sort();
    Ok(out)
}

fn walk(
    vault: &Path,
    at: &Path,
    within: &Path,
    out: &mut Vec<String>,
    depth: usize,
) -> std::io::Result<()> {
    // The same bound the walk keeps. Deeper is not looked at, so it is not
    // trusted: an error, never a folder found clean.
    if depth > 64 {
        return Err(std::io::Error::other("folders nested too deep to look at"));
    }
    for entry in std::fs::read_dir(at)? {
        let entry = entry?;
        let path = entry.path();
        // Gone since it was listed: nothing there to lead out.
        let meta = match std::fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e),
        };
        if meta.file_type().is_symlink() {
            if !lands_inside(within, path.clone(), 0) {
                out.push(relative(vault, &path));
            }
        } else if meta.is_dir() {
            walk(vault, &path, within, out, depth + 1)?;
        }
    }
    Ok(())
}

fn relative(vault: &Path, path: &Path) -> String {
    let rel: PathBuf = path.strip_prefix(vault).unwrap_or(path).to_path_buf();
    rel.components()
        .filter_map(|c| match c {
            Component::Normal(n) => Some(n.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn a_link_to_a_sibling_folder_or_file_escapes_and_one_inside_does_not() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        std::fs::create_dir_all(d.join("Projetos/Sub")).unwrap();
        std::fs::create_dir_all(d.join("Segredo")).unwrap();
        std::fs::write(d.join("Segredo/c.md"), "x").unwrap();
        std::fs::write(d.join("Projetos/a.md"), "x").unwrap();
        std::os::unix::fs::symlink("../Segredo", d.join("Projetos/dir")).unwrap();
        std::os::unix::fs::symlink("../../Segredo/c.md", d.join("Projetos/Sub/file.md")).unwrap();
        std::os::unix::fs::symlink("a.md", d.join("Projetos/same.md")).unwrap();
        std::os::unix::fs::symlink("Sub", d.join("Projetos/alias")).unwrap();
        std::os::unix::fs::symlink("nothing-here", d.join("Projetos/broken")).unwrap();
        assert_eq!(
            escaping_links(d, "Projetos").unwrap(),
            ["Projetos/Sub/file.md", "Projetos/dir"]
        );
        // A dangling link that stays inside is not one; from the vault's root
        // nothing leaves the vault.
        assert!(escaping_links(d, "").unwrap().is_empty());
    }
}
