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

/// What a directory the server cannot write comes to: where, and whose.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Unwritable {
    pub dir: String,
    pub owner: String,
}

#[must_use]
pub fn owner_of(dir: &Path) -> String {
    owner_name(verso_fs::server::owner_uid(dir))
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

/// Whether an operating system error is a refusal to write: permission
/// denied, or a read-only file system. Decided on the error's kind where it
/// is made, never on its words.
#[must_use]
pub fn is_refusal(e: &std::io::Error) -> bool {
    matches!(
        e.kind(),
        std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::ReadOnlyFilesystem
    )
}

/// The answer to a request that failed because the server cannot write to
/// `dir` (`is_refusal`): to an admin the sentence — which directory, whose,
/// the command that mends it, who can run it — and to anyone else a short
/// line that tells them to call the administrator, with no path, uid or
/// command of the host.
#[must_use]
pub fn api_error(dir: &Path, admin: bool) -> crate::http::ApiError {
    let said = if admin {
        let owner = owner_name(verso_fs::server::owner_uid(dir));
        sentence(&dir.display().to_string(), &owner)
    } else {
        "O servidor não pode gravar agora; avise o administrador. / The server cannot write right now; tell the administrator.".to_owned()
    };
    crate::log::error(&format!(
        "a request failed: the server cannot write to {}",
        dir.display()
    ));
    crate::http::ApiError::new(
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        "not_writable",
        said,
    )
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
    fn only_a_refusal_to_write_is_one_and_a_non_admin_is_told_no_paths() {
        use std::io::{Error, ErrorKind};
        assert!(is_refusal(&Error::from(ErrorKind::PermissionDenied)));
        assert!(is_refusal(&Error::from(ErrorKind::ReadOnlyFilesystem)));
        assert!(!is_refusal(&Error::from(ErrorKind::NotFound)));
        // The words of a message decide nothing.
        assert!(!is_refusal(&Error::other(
            "Permission denied (os error 13)"
        )));
        let admin = api_error(Path::new("/folders"), true);
        assert_eq!(admin.code, "not_writable");
        assert!(admin.message.contains("/folders") && admin.message.contains("sudo chown"));
        let other = api_error(Path::new("/folders"), false);
        assert!(
            !other.message.contains("/folders") && !other.message.contains("sudo"),
            "{}",
            other.message
        );
        assert!(other.message.contains("administrador") && other.message.contains("administrator"));
    }
}
