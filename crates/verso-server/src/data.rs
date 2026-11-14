// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The server's own files, never a folder of notes (ADR 0026 rule 5): the
//! data directory made at the first start, and a secret given as a file.
//! The only module of the crate allowed `std::fs` (clippy.toml,
//! scripts/check.sh).

use std::io;
use std::path::Path;

/// A secret given as a file (`NAME_FILE`, ADR 0075 item 6).
pub fn read_secret(path: &Path) -> io::Result<String> {
    std::fs::read_to_string(path)
}

/// Whether the file at `path` can be read: the window's `web.html`, for
/// "this app is a server" to say its files are missing instead of serving
/// a phone a blank page (ADR 0096).
pub fn readable(path: &Path) -> bool {
    std::fs::read_to_string(path).is_ok()
}

/// The window's page, read whole (`crate::http::page_route`).
pub fn read_page(path: &Path) -> io::Result<String> {
    std::fs::read_to_string(path)
}

/// The data directory and what it holds, made when missing.
pub fn ensure_dir(path: &Path) -> io::Result<()> {
    std::fs::create_dir_all(path)
}

/// A file with `text`, for a test's secret.
#[cfg(test)]
pub fn write_for_tests(path: &Path, text: &str) {
    use std::io::Write;
    let dir = path.parent().unwrap_or(Path::new("."));
    let mut file = tempfile::NamedTempFile::new_in(dir).unwrap();
    file.write_all(text.as_bytes()).unwrap();
    file.persist(path).unwrap();
}

/// Takes a file away, for a test.
#[cfg(test)]
pub fn remove_for_tests(path: &Path) {
    tempfile::TempPath::try_from_path(path)
        .unwrap()
        .close()
        .unwrap();
}

/// A runnable script with `text`, for a test's stand-in `cloudflared`
/// (`tests_tunnel.rs`): no test runs the real one.
#[cfg(test)]
#[cfg(unix)]
pub fn write_script_for_tests(path: &Path, text: &str) {
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;
    let dir = path.parent().unwrap_or(Path::new("."));
    let mut file = tempfile::Builder::new()
        .permissions(std::fs::Permissions::from_mode(0o755))
        .tempfile_in(dir)
        .unwrap();
    file.write_all(text.as_bytes()).unwrap();
    let _ = file.persist(path).unwrap();
}
