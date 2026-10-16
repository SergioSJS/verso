// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A directory the server cannot write (ADR 0075 item 3, amended
//! 2026-10-16). The usual cause is a bind mount Docker made as root, or a
//! folder of another user on a NAS: the container's entrypoint gives
//! root-owned entries to uid 1000 before the server starts, but a directory
//! owned by someone else it cannot, and the person must be told in words
//! — at start, in the admin console, and in the answer to the request that
//! failed — instead of "Permission denied (os error 13)".

use std::path::Path;
use std::sync::OnceLock;

/// The two directories, to tell which one an error is about.
static DIRS: OnceLock<(String, String)> = OnceLock::new();

/// What a directory the server cannot write comes to: where, and whose.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Unwritable {
    pub dir: String,
    pub owner: String,
}

fn owner_name(uid: Option<u32>) -> String {
    match uid {
        Some(0) => "root".to_owned(),
        Some(n) => format!("uid {n}"),
        None => "?".to_owned(),
    }
}

/// The sentence, in both languages (the window knows the language of the
/// signed-in person, a program and the log do not): what is wrong, and the
/// one command that fixes it on the host, for Docker and for the package.
#[must_use]
pub fn sentence(dir: &str, owner: &str) -> String {
    format!(
        "O UniVerso não pode escrever em {dir} (dono {owner}). No servidor: sudo chown -R 1000:1000 <pasta do host> (no pacote .deb: sudo chown -R universo:universo {dir}). \
         / UniVerso cannot write to {dir} (owner {owner}). On the server: sudo chown -R 1000:1000 <the host folder> (with the .deb package: sudo chown -R universo:universo {dir})."
    )
}

/// Checks both directories at start: those the server cannot write, said
/// in the log as errors. It goes on to serve: reading may work, and the
/// console says what is wrong.
pub fn check(data_dir: &Path, folders_dir: &Path) -> Vec<Unwritable> {
    let _ = DIRS.set((
        data_dir.display().to_string(),
        folders_dir.display().to_string(),
    ));
    let mut found = Vec::new();
    for dir in [data_dir, folders_dir] {
        if let Err(e) = verso_fs::server::can_write(dir) {
            let owner = owner_name(verso_fs::server::owner_uid(dir));
            let dir_text = dir.display().to_string();
            crate::log::error(&format!("{} ({e})", sentence(&dir_text, &owner)));
            found.push(Unwritable {
                dir: dir_text,
                owner,
            });
        }
    }
    found
}

/// An error message from a failed write that is a refusal of permission on
/// one of the two directories, as the sentence; `None` for any other.
/// Matched on the operating system's words because the errors reach here as
/// text (`ApiError::from(String)`), after the layers below have worded them.
#[must_use]
pub fn denied(message: &str) -> Option<String> {
    let (data, folders) = DIRS.get()?;
    denied_in(message, data, folders)
}

fn denied_in(message: &str, data: &str, folders: &str) -> Option<String> {
    let lower = message.to_ascii_lowercase();
    if !(lower.contains("permission denied") || lower.contains("read-only file system")) {
        return None;
    }
    // The data directory when the message names it, else the folders'
    // (what a person's request writes to).
    let dir = if message.contains(data) && !message.contains(folders) {
        data
    } else {
        folders
    };
    let owner = owner_name(verso_fs::server::owner_uid(Path::new(dir)));
    Some(sentence(dir, &owner))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sentence_names_the_directory_the_owner_and_the_fix_in_both_languages() {
        let s = sentence("/folders", "root");
        assert!(
            s.contains("O UniVerso não pode escrever em /folders (dono root)"),
            "{s}"
        );
        assert!(
            s.contains("UniVerso cannot write to /folders (owner root)"),
            "{s}"
        );
        assert!(s.contains("sudo chown -R 1000:1000"), "{s}");
        assert!(s.contains("universo:universo"), "{s}");
    }

    #[test]
    fn a_directory_that_cannot_be_written_is_found_at_start() {
        let data = tempfile::tempdir().unwrap();
        let folders = tempfile::tempdir().unwrap();
        assert!(check(data.path(), folders.path()).is_empty());
        verso_fs::server::set_writable_for_tests(folders.path(), false).unwrap();
        let found = check(data.path(), folders.path());
        verso_fs::server::set_writable_for_tests(folders.path(), true).unwrap();
        // As root nothing is denied.
        if let Some(one) = found.first() {
            assert_eq!(one.dir, folders.path().display().to_string());
            assert!(!crate::log::said("cannot write to").is_empty());
        }
    }

    #[test]
    fn only_a_refusal_of_permission_is_turned_into_the_sentence() {
        let said = denied_in(
            "making the folder: Permission denied (os error 13)",
            "/data",
            "/folders",
        )
        .unwrap();
        assert!(said.contains("/folders"), "{said}");
        let data = denied_in(
            "opening /data/server.db: Permission denied (os error 13)",
            "/data",
            "/folders",
        )
        .unwrap();
        assert!(data.contains("escrever em /data"), "{data}");
        assert!(
            denied_in(
                "making the folder: No space left on device (os error 28)",
                "/data",
                "/folders"
            )
            .is_none()
        );
    }
}
