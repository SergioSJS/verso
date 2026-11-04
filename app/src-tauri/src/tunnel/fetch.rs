// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The pinned `cloudflared` (ADR 0117 D3 item 5): one version, its SHA-256
//! written here, downloaded from the project's GitHub releases on first use
//! into the app's data directory, never "latest", never the `PATH`.
//!
//! The sums are Cloudflare's own numbers, read on 2026-11-03 from the
//! release `2026.10.3` (GitHub's asset `digest` and the release notes'
//! list; the version the spike ran, `tunnel-spike/RESULTS.md` S0.1). For
//! the macOS `.tgz` the two differ: the notes' value is the sum of the
//! binary *inside* the archive, GitHub's the archive's (S0.1, checked by
//! hand on the arm64 one). So a `.tgz` has two pins: the download, then the
//! extracted binary. A binary already in place is checked again before
//! every run.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use super::files;

/// The pinned release. It moves with Verso's releases, never by itself.
pub const VERSION: &str = "2026.10.3";

/// The largest download taken: the biggest asset is 55 MB.
const CAP: u64 = 128 * 1024 * 1024;

/// One system's `cloudflared`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pin<'a> {
    /// `std::env::consts::OS`.
    pub os: &'a str,
    /// `std::env::consts::ARCH`.
    pub arch: &'a str,
    /// The release asset's file name.
    pub asset: &'a str,
    /// The asset's SHA-256 (what is downloaded).
    pub sha256: &'a str,
    /// The runnable binary's SHA-256: the asset's own, except inside a
    /// `.tgz`.
    pub binary_sha256: &'a str,
}

impl Pin<'_> {
    /// The asset is a gzip'd tar holding the binary (macOS).
    #[must_use]
    pub fn is_tgz(&self) -> bool {
        self.asset.ends_with(".tgz")
    }

    /// Where the asset is downloaded from.
    #[must_use]
    pub fn url(&self) -> String {
        format!(
            "https://github.com/cloudflare/cloudflared/releases/download/{VERSION}/{}",
            self.asset
        )
    }
}

/// The systems Verso ships for; one row each.
pub const PINNED: &[Pin<'static>] = &[
    Pin {
        os: "macos",
        arch: "aarch64",
        asset: "cloudflared-darwin-arm64.tgz",
        sha256: "1165d14b6f6360a3b8c283d7d1100024d6ec7cd9bc9e32519e96150645f3ec55",
        binary_sha256: "f249139e0541fa589c987397d867cc16c83ab1236d31eb6782f2e4552ee9cf80",
    },
    Pin {
        os: "macos",
        arch: "x86_64",
        asset: "cloudflared-darwin-amd64.tgz",
        sha256: "81b7b85f2376815c4f59b1aa323887b62e16ce8b67555c2e1577dc23f2a82000",
        binary_sha256: "947e2942d6a59922d80190d23b12f3ade8da16e23e3bd937182a48993b7c00db",
    },
    Pin {
        os: "linux",
        arch: "x86_64",
        asset: "cloudflared-linux-amd64",
        sha256: "053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0",
        binary_sha256: "053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0",
    },
    Pin {
        os: "linux",
        arch: "aarch64",
        asset: "cloudflared-linux-arm64",
        sha256: "89297ebfb9e8c99c0dc013a1140601453cf3798d8306c5591651f4a3f5210be8",
        binary_sha256: "89297ebfb9e8c99c0dc013a1140601453cf3798d8306c5591651f4a3f5210be8",
    },
    Pin {
        os: "windows",
        arch: "x86_64",
        asset: "cloudflared-windows-amd64.exe",
        sha256: "76b2805253d0d6ffacb092a7acfbee99e7af6917835c0c5410e23f3ef5052da2",
        binary_sha256: "76b2805253d0d6ffacb092a7acfbee99e7af6917835c0c5410e23f3ef5052da2",
    },
];

/// The row for a system; `None` where Cloudflare publishes none Verso pins.
#[must_use]
pub fn pin_for(os: &str, arch: &str) -> Option<&'static Pin<'static>> {
    PINNED.iter().find(|p| p.os == os && p.arch == arch)
}

/// The row for this system.
#[must_use]
pub fn pin_here() -> Option<&'static Pin<'static>> {
    pin_for(std::env::consts::OS, std::env::consts::ARCH)
}

/// Where the runnable binary is kept: `<dir>/cloudflared-<version>[.exe]`.
#[must_use]
pub fn binary_path(dir: &Path) -> PathBuf {
    let ext = if cfg!(windows) { ".exe" } else { "" };
    dir.join(format!("cloudflared-{VERSION}{ext}"))
}

/// One download at a time in this process: the link turned on while the
/// own address's login fetches the binary, say. The second waits for the
/// first and finds the binary in place, instead of writing the same
/// `.part` beside it.
static FETCHING: Mutex<()> = Mutex::new(());

/// Where a download is read from: the real one is [`download`]; the tests
/// hand bytes.
pub type Source<'s> = dyn FnMut(&str) -> Result<Box<dyn Read + Send>, String> + 's;

/// The pinned binary in `dir`, downloaded and checked when it is not there
/// or is not the pinned one. Says its path, and whether it was fetched now
/// (then the caller runs [`super::run::version_check`] before first use).
/// A download whose sum is not the pinned one is refused, said why, and
/// leaves no file behind.
pub fn ensure(
    dir: &Path,
    pin: &Pin<'_>,
    source: &mut Source<'_>,
) -> Result<(PathBuf, bool), String> {
    let _one = FETCHING
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let binary = binary_path(dir);
    match files::sha256_of(&binary)? {
        Some(sum) if sum == pin.binary_sha256 => return Ok((binary, false)),
        Some(_) => {
            crate::log::write(
                "WARN",
                "host",
                "the internet link: the kept cloudflared is not the pinned one; fetching it again",
            );
            files::remove(&binary);
        }
        None => {}
    }
    files::make_dir(dir)?;
    let part = dir.join(format!(".cloudflared-{VERSION}.part"));
    let inner = dir.join(format!(".cloudflared-{VERSION}.bin"));
    let fetched = fetch_into(pin, source, &part, &inner).and_then(|ready| {
        files::place_runnable(&ready, &binary)?;
        Ok((binary.clone(), true))
    });
    files::remove(&part);
    files::remove(&inner);
    if fetched.is_ok() {
        crate::log::write(
            "INFO",
            "host",
            &format!("the internet link: cloudflared {VERSION} downloaded and checked"),
        );
    }
    fetched
}

/// Download into `part`, check it; for a `.tgz`, extract into `inner` and
/// check that. Says the file that is ready to be placed.
fn fetch_into(
    pin: &Pin<'_>,
    source: &mut Source<'_>,
    part: &Path,
    inner: &Path,
) -> Result<PathBuf, String> {
    let mut from = source(&pin.url())?;
    let got = files::store(&mut from, part, CAP)?;
    refuse_unless(&got, pin.sha256, pin.asset)?;
    if !pin.is_tgz() {
        return Ok(part.to_path_buf());
    }
    let got = files::extract_one(part, "cloudflared", inner, CAP)?;
    refuse_unless(&got, pin.binary_sha256, "the cloudflared inside it")?;
    Ok(inner.to_path_buf())
}

fn refuse_unless(got: &str, want: &str, what: &str) -> Result<(), String> {
    if got == want {
        return Ok(());
    }
    Err(format!(
        "{what} is not the one Verso pins (expected sha256:{want}, got sha256:{got}): \
         refused, nothing was kept"
    ))
}

/// The real download: `https://github.com/…` only (and the redirect GitHub
/// answers with, to its own asset store), as ADR 0050's revision by 0117
/// says.
pub fn download(url: &str) -> Result<Box<dyn Read + Send>, String> {
    if !url.starts_with("https://github.com/cloudflare/cloudflared/releases/download/") {
        return Err("cloudflared is downloaded from its GitHub releases alone".to_owned());
    }
    let client = reqwest::blocking::Client::builder()
        .user_agent("Verso-App")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| format!("the download of cloudflared: {e}"))?;
    let answer = client
        .get(url)
        .send()
        .map_err(|e| format!("the download of cloudflared: {e}"))?;
    if !answer.status().is_success() {
        return Err(format!(
            "the download of cloudflared: GitHub answered {}",
            answer.status()
        ));
    }
    Ok(Box::new(answer))
}
