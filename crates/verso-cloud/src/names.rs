// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Names on a cloud (ADR 0104 item 10): uploaded in NFC (ADR 0079 item 2);
//! a name a service forbids is not sent and the person is told why. Names
//! every system refuses (a trailing dot, `CON`) are the engine's, already
//! listed before a remote is asked.

/// The folder of the capability probe, and of the temporary keys a large
/// file crosses under: ours, hidden from every listing, never a file of
/// the person's folder.
pub const PROBE_DIR: &str = ".verso-probe";
pub const TEMP_DIR: &str = ".verso-tmp";

/// Whether a remote path is one of ours.
#[must_use]
pub fn internal(path: &str) -> bool {
    let first = path.split('/').next().unwrap_or("");
    first == PROBE_DIR || first == TEMP_DIR
}

/// A path in the composed Unicode form every device compares names by.
#[must_use]
pub fn nfc(path: &str) -> String {
    verso_core::sync::folded_form(path)
}

/// Why `service` would not keep a file called `path`, in English for the
/// window's list; `None` when it would. `s3` limits a key to 1024 bytes;
/// WebDAV servers refuse the names their own sync clients use for partial
/// uploads (Nextcloud's `.part`, `.filepart`) and a segment over 255 bytes.
#[must_use]
pub fn refused(s3: bool, path: &str) -> Option<String> {
    if internal(path) {
        return Some(format!(
            "{PROBE_DIR} and {TEMP_DIR} are kept for Verso's own checks on a cloud"
        ));
    }
    if s3 {
        return (path.len() > 900)
            .then(|| "a name of more than 900 bytes is not kept by S3 (its limit is 1024 for the whole key)".to_owned());
    }
    for part in path.split('/') {
        if part.len() > 255 {
            return Some("a name of more than 255 bytes is not kept by a WebDAV server".to_owned());
        }
        let lower = part.to_lowercase();
        if lower.ends_with(".part") || lower.ends_with(".filepart") || lower == ".htaccess" {
            return Some(
                "a WebDAV server such as Nextcloud keeps this name for its own use".to_owned(),
            );
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_go_up_composed() {
        assert_eq!(nfc("Cafe\u{301}.md"), "Caf\u{e9}.md");
    }

    #[test]
    fn our_own_folders_and_a_servers_reserved_names_are_refused() {
        assert!(refused(true, ".verso-probe/x").is_some());
        assert!(refused(false, "a/.verso-tmp/x").is_none());
        assert!(refused(false, ".verso-tmp/x").is_some());
        assert!(refused(false, "a/b.part").is_some());
        assert!(refused(false, "a/.htaccess").is_some());
        assert!(refused(false, "a/b.md").is_none());
        assert!(refused(true, "a/b.part").is_none());
        assert!(refused(true, &"x".repeat(901)).is_some());
    }
}
