// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! How much room the disk under a folder has left, for the one thing that
//! asks it: bringing files down from the cloud on the user's click, which
//! refuses to start when the disk cannot hold them (ADR 0043, decided on
//! 2026-10-27). `fs4`'s safe function wraps `statvfs` and
//! `GetDiskFreeSpaceExW` (the workspace forbids `unsafe`).

use std::path::Path;

/// The bytes a user of this account can still write on the file system
/// `dir` is on.
pub(crate) fn free_bytes(dir: &Path) -> std::io::Result<u64> {
    fs4::available_space(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_real_folder_has_room_counted() {
        let dir = tempfile::tempdir().unwrap();
        assert!(free_bytes(dir.path()).unwrap() > 0);
        assert!(free_bytes(&dir.path().join("absent")).is_err());
    }
}
