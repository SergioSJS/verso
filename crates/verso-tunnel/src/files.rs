// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Every file the internet link touches, and the one module of this crate
//! allowed `std::fs` (ADR 0029, a declared exception, ratified by the
//! maintainer on 2026-11-04 — ADR 0117 D14 — for this file when it was
//! `app/src-tauri/src/tunnel/files.rs`, and moved here with it in R5:
//! `scripts/check.sh` and `.github/workflows/ci.yml` hold the crate's
//! `std::fs` to this file).
//!
//! What it touches is the host's own data directory, `<dir>/tunnel/` — the
//! app's configuration directory
//! ([0011](../../../docs/adr/0011-config-outside-tree-index-as-cache.md)),
//! a UniVerso's `VERSO_DATA_DIR` ([0075](../../../docs/adr/0075-server-packaging-and-storage.md)):
//! the pinned `cloudflared` (downloaded, checked, extracted, made
//! runnable) and an own address's tunnel credentials (ADR 0117 D10 item 3,
//! `0600`). Never a file of an open folder (ADR 0026 rule 5), and never
//! `~/.cloudflared/cert.pem`, which `cloudflared` itself reads (D10 item 2)
//! — of that file only whether it is there is asked ([`is_there`]), for
//! Settings to say whether the login was done.

use std::io::Read;
#[cfg(not(target_os = "android"))]
use std::io::Write;
use std::path::Path;

use sha2::Digest;

/// The words of a download ended by a stop: the window's `linkWhy` reads
/// them as the link turned off before it was up.
pub const STOPPED: &str = "the link was stopped";

/// The directory, made if it is not there; `0700` on Unix (it will hold a
/// tunnel's credentials).
pub(crate) fn make_dir(dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("the link's folder: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| format!("the link's folder: {e}"))?;
    }
    Ok(())
}

/// The file's SHA-256 in lower-case hex; `None` when there is no file.
pub fn sha256_of(path: &Path) -> Result<Option<String>, String> {
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("reading {}: {e}", name_of(path))),
    };
    let mut hasher = sha2::Sha256::new();
    let mut buffer = vec![0u8; 128 * 1024];
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| format!("reading {}: {e}", name_of(path)))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(Some(format!("{:x}", hasher.finalize())))
}

/// Copy `from` into a new file at `to` (`0600`, replaced if there),
/// hashing what passes; more than `cap` bytes is refused. Synced before it
/// returns. Says the SHA-256 of what was written.
#[cfg(not(target_os = "android"))]
pub(crate) fn store(from: &mut dyn Read, to: &Path, cap: u64) -> Result<String, String> {
    store_watched(from, to, cap, &mut |_| true)
}

/// [`store`], `going` told the bytes written so far after each piece: when
/// it answers false the copy ends there, refused with [`STOPPED`] (the
/// caller removes the file).
#[cfg(not(target_os = "android"))]
pub(crate) fn store_watched(
    from: &mut dyn Read,
    to: &Path,
    cap: u64,
    going: &mut dyn FnMut(u64) -> bool,
) -> Result<String, String> {
    let mut file = create(to)?;
    let mut hasher = sha2::Sha256::new();
    let mut buffer = vec![0u8; 128 * 1024];
    let mut total: u64 = 0;
    loop {
        let n = from
            .read(&mut buffer)
            .map_err(|e| format!("the download stopped: {e}"))?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > cap {
            return Err(format!(
                "the download is larger than {} MB: refused",
                cap / (1024 * 1024)
            ));
        }
        hasher.update(&buffer[..n]);
        file.write_all(&buffer[..n])
            .map_err(|e| format!("writing {}: {e}", name_of(to)))?;
        if !going(total) {
            return Err(STOPPED.to_owned());
        }
    }
    file.sync_all()
        .map_err(|e| format!("writing {}: {e}", name_of(to)))?;
    Ok(format!("{:x}", hasher.finalize()))
}

/// Read the gzip'd tar at `tgz` and copy its one regular file named `name`
/// (at its top, `./` allowed) into `to`, as [`store`] does. Nothing else of
/// the archive is written, and nothing of its metadata is applied: the
/// archive cannot name where its file lands.
#[cfg(not(target_os = "android"))]
pub(crate) fn extract_one(tgz: &Path, name: &str, to: &Path, cap: u64) -> Result<String, String> {
    let file = std::fs::File::open(tgz).map_err(|e| format!("reading the archive: {e}"))?;
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(file));
    let entries = archive
        .entries()
        .map_err(|e| format!("reading the archive: {e}"))?;
    for entry in entries {
        let mut entry = entry.map_err(|e| format!("reading the archive: {e}"))?;
        if entry.header().entry_type() != tar::EntryType::Regular {
            continue;
        }
        let path = entry
            .path()
            .map_err(|e| format!("reading the archive: {e}"))?
            .to_string_lossy()
            .into_owned();
        if path.strip_prefix("./").unwrap_or(&path) == name {
            return store(&mut entry, to, cap);
        }
    }
    Err(format!("the archive holds no file named {name}"))
}

/// Make `from` runnable (`0755` on Unix) and move it to `to` in one step
/// (replacing what was there), then sync the directory on Unix.
#[cfg(not(target_os = "android"))]
pub(crate) fn place_runnable(from: &Path, to: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(from, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("making {} runnable: {e}", name_of(to)))?;
    }
    rename(from, to)
}

/// An own address's credentials, written by `cloudflared` at `from`, kept
/// at `to` (`<uuid>.json`), `0600` (ADR 0117 D10 item 3).
pub(crate) fn settle_credentials(from: &Path, to: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(from, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("the tunnel's credentials: {e}"))?;
    }
    rename(from, to)
}

/// Whether a file is at `path` (its metadata alone: nothing is read).
pub fn is_there(path: &Path) -> bool {
    std::fs::metadata(path).is_ok_and(|m| m.is_file())
}

/// Remove a file; one that is not there is no failure.
pub fn remove(path: &Path) {
    let _ = std::fs::remove_file(path);
}

#[cfg(not(target_os = "android"))]
fn create(path: &Path) -> Result<std::fs::File, String> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(path)
        .map_err(|e| format!("writing {}: {e}", name_of(path)))
}

fn rename(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::rename(from, to).map_err(|e| format!("keeping {}: {e}", name_of(to)))?;
    #[cfg(unix)]
    if let Some(dir) = to.parent() {
        // The rename lasts once the directory says so.
        let _ = std::fs::File::open(dir).and_then(|d| d.sync_all());
    }
    Ok(())
}

/// A file's name alone, for the words of a failure (no path in them).
fn name_of(path: &Path) -> String {
    path.file_name()
        .map_or_else(String::new, |n| n.to_string_lossy().into_owned())
}

/// The files in `dir`, by name (the tests' look at what was left behind).
#[cfg(test)]
pub(crate) fn names_in(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .map(|it| {
            it.filter_map(Result::ok)
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

/// A runnable script at `dir/name` (the tests' fake `cloudflared`).
#[cfg(test)]
#[cfg(unix)]
pub(crate) fn write_script(dir: &Path, name: &str, text: &str) -> std::path::PathBuf {
    let path = dir.join(name);
    let tmp = dir.join(format!(".{name}.tmp"));
    std::fs::write(&tmp, text).unwrap();
    place_runnable(&tmp, &path).unwrap();
    path
}

/// A file's bytes (the tests' read-back).
#[cfg(test)]
pub(crate) fn read(path: &Path) -> Vec<u8> {
    std::fs::read(path).unwrap()
}

/// Write `bytes` at `path` (the tests' setup).
#[cfg(test)]
pub(crate) fn write(path: &Path, bytes: &[u8]) {
    std::fs::write(path, bytes).unwrap();
}

/// The Unix mode bits of a file (the tests' check of `0755`/`0600`).
#[cfg(test)]
#[cfg(unix)]
pub(crate) fn mode_of(path: &Path) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path).unwrap().permissions().mode() & 0o777
}
