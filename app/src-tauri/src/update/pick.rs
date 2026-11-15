//! Which release an update takes, which of its files, and the words the
//! updater says. No IO: `update.rs` asks the release place and installs.
//!
//! What the updater says reaches the window as a code, `update.<code>`,
//! then `: ` and a detail when there is one (an error's own text, a path)
//! — never a sentence in one language. The window words each code in
//! pt-BR or English (app/ui/src/updateWords.ts) and shows any other text
//! as it came. The contract's shapes (`ContractError.message`,
//! `InstallResult.message`, `UpdateProgress.message`) are unchanged.

use std::sync::Mutex;

use verso_contract::{ContractError, ErrorKind};

use super::GhRelease;
use crate::version::ParsedVersion;

/// `update.<code>`, the words of a step without a detail.
pub(crate) fn said(code: &str) -> String {
    format!("update.{code}")
}

/// `update.<code>: <detail>`.
pub(crate) fn said_with(code: &str, detail: impl std::fmt::Display) -> String {
    format!("update.{code}: {detail}")
}

/// A failure said as [`said`].
pub(crate) fn failed(code: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::Failed,
        message: said(code),
    }
}

/// A failure said as [`said_with`].
pub(crate) fn failed_with(code: &str, detail: impl std::fmt::Display) -> ContractError {
    ContractError {
        kind: ErrorKind::Failed,
        message: said_with(code, detail),
    }
}

/// A refusal said as [`said`].
pub(crate) fn refused(code: &str) -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message: said(code),
    }
}

/// A refusal said as [`said_with`].
pub(crate) fn refused_with(code: &str, detail: impl std::fmt::Display) -> ContractError {
    ContractError {
        kind: ErrorKind::Refused,
        message: said_with(code, detail),
    }
}

/// The release an app at `current` updates to: the newest published one
/// of its own channel (a beta's app only betas, a final's only finals,
/// version.rs), newer than `current`. `None`: it is up to date. The check
/// and the install both ask this, so the install never takes a release
/// the check would not have offered.
pub(crate) fn best_release<'a>(
    releases: &'a [GhRelease],
    current: &ParsedVersion,
) -> Option<&'a GhRelease> {
    let mut best: Option<(&GhRelease, ParsedVersion)> = None;
    for rel in releases.iter().filter(|r| !r.draft) {
        let Some(parsed) = ParsedVersion::parse(&rel.tag_name) else {
            continue;
        };
        if !parsed.same_channel(current) || !parsed.is_newer_than(current) {
            continue;
        }
        if best.as_ref().is_none_or(|(_, v)| parsed.is_newer_than(v)) {
            best = Some((rel, parsed));
        }
    }
    best.map(|(rel, _)| rel)
}

/// The release the install takes: the one the last check offered, by its
/// tag, while it is still published and still one [`best_release`] could
/// have offered (its channel, newer than `current`) — the person updates to
/// the version they were shown; else the best there is now.
pub(crate) fn release_to_install<'a>(
    releases: &'a [GhRelease],
    current: &ParsedVersion,
    checked: Option<&str>,
) -> Option<&'a GhRelease> {
    let offered = checked.and_then(|tag| {
        releases.iter().find(|r| {
            !r.draft
                && r.tag_name == tag
                && ParsedVersion::parse(&r.tag_name)
                    .is_some_and(|v| v.same_channel(current) && v.is_newer_than(current))
        })
    });
    offered.or_else(|| best_release(releases, current))
}

/// The tag of the release the last check offered, for the install.
static CHECKED: Mutex<Option<String>> = Mutex::new(None);

/// The check offered `tag` (or nothing: `None`).
pub(crate) fn remember_checked(tag: Option<&str>) {
    if let Ok(mut kept) = CHECKED.lock() {
        *kept = tag.map(str::to_owned);
    }
}

/// The tag the last check offered, if any.
pub(crate) fn checked() -> Option<String> {
    CHECKED.lock().ok().and_then(|kept| kept.clone())
}

/// The download and install, `run`, only once the system allows this app
/// to install (`can_install`): on Android the first update asks the person
/// to allow installs from Verso, which is asked before anything is
/// downloaded — never after the whole package came down. Elsewhere
/// `can_install` answers yes.
pub(crate) fn installs_when_allowed<T>(
    can_install: impl FnOnce() -> Result<bool, String>,
    run: impl FnOnce() -> Result<T, ContractError>,
) -> Result<T, ContractError> {
    match can_install() {
        Ok(true) => run(),
        Ok(false) => Err(refused("android_allow")),
        Err(e) => Err(failed_with("android_failed", e)),
    }
}

/// The words an asset's name says its processor with: Apple silicon and
/// ARM Linux say `arm64` (`.zip`, `.deb`) or `aarch64` (`.rpm`,
/// `.AppImage`); an Intel Mac says `x64`, a PC `x64`, `x86_64` or `amd64`.
fn arch_keywords(arm: bool) -> &'static [&'static str] {
    if arm {
        &["aarch64", "arm64"]
    } else {
        &["x86_64", "x64", "amd64"]
    }
}

/// Picks the release asset for this platform and architecture.
pub(crate) fn pick_asset(rel: &GhRelease) -> Option<&super::GhAsset> {
    // Detect current platform + arch to pick the right release asset.
    // These are resolved at compile time — no runtime overhead.
    let os_keywords: &[&str] = if cfg!(target_os = "macos") {
        &["macos", "darwin", "osx"]
    } else if cfg!(target_os = "android") {
        &["android"]
    } else if cfg!(target_os = "windows") {
        &["windows", "win"]
    } else {
        &["linux"]
    };

    let arch_keywords = arch_keywords(cfg!(target_arch = "aarch64"));

    // Preferred extension per platform
    let preferred_exts: &[&str] = if cfg!(target_os = "windows") {
        &[".msi", ".exe", ".zip"]
    } else if cfg!(target_os = "macos") {
        &[".dmg", ".zip"]
    } else if cfg!(target_os = "android") {
        &[".apk"]
    } else {
        #[cfg(target_os = "linux")]
        {
            linux_formats()
        }
        #[cfg(not(target_os = "linux"))]
        {
            &[".appimage", ".deb", ".rpm"]
        }
    };

    choose_asset(rel, os_keywords, arch_keywords, preferred_exts)
}

/// The best asset of `rel` for a platform's words: first, in the order of
/// `preferred_exts`, the one that names the OS and the processor; else the
/// OS alone.
fn choose_asset<'a>(
    rel: &'a GhRelease,
    os_keywords: &[&str],
    arch_keywords: &[&str],
    preferred_exts: &[&str],
) -> Option<&'a super::GhAsset> {
    // Only this channel's app (`Verso-Beta-…` or `Verso-…`, version.rs).
    let ours = |n: &str| ParsedVersion::parse(&rel.tag_name).is_none_or(|v| v.names_its_app(n));
    // Try to find the best asset: correct OS + arch + preferred extension
    preferred_exts.iter().find_map(|ext| {
        // 1st pass: OS + arch + extension
        rel.assets
            .iter()
            .find(|a| {
                let n = a.name.to_lowercase();
                ours(&n)
                    && n.ends_with(ext)
                    && os_keywords.iter().any(|k| n.contains(k))
                    && arch_keywords.iter().any(|k| n.contains(k))
            })
            // 2nd pass: OS + extension (any arch)
            .or_else(|| {
                rel.assets.iter().find(|a| {
                    let n = a.name.to_lowercase();
                    ours(&n) && n.ends_with(ext) && os_keywords.iter().any(|k| n.contains(k))
                })
            })
    })
}

/// Whether a release asset is an installer run as downloaded (Windows'
/// NSIS `-setup.exe`, or an `.msi`) rather than an archive to extract.
pub(crate) fn is_installer_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    [".exe", ".msi", ".appimage", ".deb", ".rpm", ".apk"]
        .iter()
        .any(|ext| n.ends_with(ext))
}

/// The packages a Linux install takes, best first: the AppImage it runs
/// from, or the package format of its system — a `.deb` where Debian's
/// tools are, else an `.rpm` (ADR 0071, item 7).
#[cfg(target_os = "linux")]
fn linux_formats() -> &'static [&'static str] {
    if std::env::var_os("APPIMAGE").is_some_and(|v| !v.is_empty()) {
        &[".appimage"]
    } else if std::path::Path::new("/etc/debian_version").exists() {
        &[".deb"]
    } else {
        &[".rpm"]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rel(tag: &str) -> GhRelease {
        GhRelease {
            tag_name: tag.to_owned(),
            name: None,
            body: None,
            published_at: None,
            draft: false,
            assets: Vec::new(),
        }
    }

    fn v(s: &str) -> ParsedVersion {
        ParsedVersion::parse(s).unwrap_or_else(|| panic!("{s} parses"))
    }

    fn tag(r: Option<&GhRelease>) -> Option<&str> {
        r.map(|r| r.tag_name.as_str())
    }

    fn with_assets(names: &[&str]) -> GhRelease {
        let mut r = rel("v0.9.0");
        r.assets = names
            .iter()
            .map(|n| super::super::GhAsset {
                name: (*n).to_string(),
                url: String::new(),
                browser_download_url: String::new(),
                size: 1,
                digest: None,
            })
            .collect();
        r
    }

    fn picked(r: &GhRelease, os: &[&str], arm: bool, exts: &[&str]) -> Option<String> {
        choose_asset(r, os, arch_keywords(arm), exts).map(|a| a.name.clone())
    }

    /// Every architecture takes its own file of a release (V.21, V.22): an
    /// Intel Mac the `-macos-x64.zip`, an Apple-silicon Mac the `-arm64`,
    /// ARM Linux the `arm64` `.deb` / `aarch64` `.rpm` and `.AppImage`.
    #[test]
    fn each_architecture_picks_its_own_file_of_the_release() {
        let r = with_assets(&[
            "Verso-0.9.0-macos-arm64.zip",
            "Verso-0.9.0-macos-x64.zip",
            "verso-cli-0.9.0-macos-x64.tar.gz",
            "Verso-0.9.0-linux-amd64.deb",
            "Verso-0.9.0-linux-x86_64.rpm",
            "Verso-0.9.0-linux-x86_64.AppImage",
            "Verso-0.9.0-linux-arm64.deb",
            "Verso-0.9.0-linux-aarch64.rpm",
            "Verso-0.9.0-linux-aarch64.AppImage",
        ]);
        let mac = ["macos", "darwin", "osx"];
        let linux = ["linux"];
        let want = |got: Option<String>, name: &str| assert_eq!(got.as_deref(), Some(name));
        want(
            picked(&r, &mac, false, &[".dmg", ".zip"]),
            "Verso-0.9.0-macos-x64.zip",
        );
        want(
            picked(&r, &mac, true, &[".dmg", ".zip"]),
            "Verso-0.9.0-macos-arm64.zip",
        );
        for (arm, deb, rpm, image) in [
            (
                false,
                "Verso-0.9.0-linux-amd64.deb",
                "Verso-0.9.0-linux-x86_64.rpm",
                "Verso-0.9.0-linux-x86_64.AppImage",
            ),
            (
                true,
                "Verso-0.9.0-linux-arm64.deb",
                "Verso-0.9.0-linux-aarch64.rpm",
                "Verso-0.9.0-linux-aarch64.AppImage",
            ),
        ] {
            want(picked(&r, &linux, arm, &[".deb"]), deb);
            want(picked(&r, &linux, arm, &[".rpm"]), rpm);
            want(picked(&r, &linux, arm, &[".appimage"]), image);
        }
    }

    #[test]
    fn a_beta_app_updates_to_the_newest_beta_never_to_a_final() {
        let releases = [rel("v0.9.0"), rel("v0.9.0-beta.2")];
        let current = v("0.9.0-beta.1");
        assert_eq!(
            tag(best_release(&releases, &current)),
            Some("v0.9.0-beta.2")
        );
        // The install takes what the check takes, with or without a
        // remembered tag — and a remembered final is not taken by a beta.
        assert_eq!(
            tag(release_to_install(&releases, &current, None)),
            Some("v0.9.0-beta.2")
        );
        assert_eq!(
            tag(release_to_install(&releases, &current, Some("v0.9.0"))),
            Some("v0.9.0-beta.2")
        );
    }

    #[test]
    fn a_final_app_never_takes_a_beta() {
        let releases = [rel("v0.9.1-beta.1"), rel("v0.9.0"), rel("v0.8.9")];
        let current = v("0.9.0");
        assert_eq!(tag(best_release(&releases, &current)), None);
        assert_eq!(tag(release_to_install(&releases, &current, None)), None);
        assert_eq!(
            tag(release_to_install(
                &releases,
                &current,
                Some("v0.9.1-beta.1")
            )),
            None
        );
        let later = [rel("v0.9.1-beta.1"), rel("v0.9.1"), rel("v0.9.0")];
        assert_eq!(tag(best_release(&later, &current)), Some("v0.9.1"));
    }

    #[test]
    fn drafts_and_unreadable_tags_are_never_taken() {
        let mut draft = rel("v0.9.0-beta.3");
        draft.draft = true;
        let releases = [draft, rel("nightly"), rel("v0.9.0-beta.2")];
        let current = v("0.9.0-beta.1");
        assert_eq!(
            tag(best_release(&releases, &current)),
            Some("v0.9.0-beta.2")
        );
        assert_eq!(
            tag(release_to_install(
                &releases,
                &current,
                Some("v0.9.0-beta.3")
            )),
            Some("v0.9.0-beta.2")
        );
    }

    #[test]
    fn the_install_takes_the_version_the_check_offered() {
        // A newer beta published between the check and the press: the
        // person gets what they were shown.
        let releases = [rel("v0.9.0-beta.3"), rel("v0.9.0-beta.2")];
        let current = v("0.9.0-beta.1");
        assert_eq!(
            tag(release_to_install(
                &releases,
                &current,
                Some("v0.9.0-beta.2")
            )),
            Some("v0.9.0-beta.2")
        );
        // Withdrawn since: the best there is now.
        assert_eq!(
            tag(release_to_install(
                &releases,
                &current,
                Some("v0.9.0-beta.9")
            )),
            Some("v0.9.0-beta.3")
        );
    }

    #[test]
    fn nothing_is_downloaded_while_the_phone_does_not_allow_installs() {
        let mut downloaded = false;
        let out = installs_when_allowed(
            || Ok(false),
            || {
                downloaded = true;
                Ok(())
            },
        );
        assert!(!downloaded, "asked before the download");
        let e = out.err().map(|e| (e.kind, e.message));
        assert_eq!(
            e,
            Some((ErrorKind::Refused, "update.android_allow".to_owned()))
        );

        let mut downloaded = false;
        let out = installs_when_allowed(
            || Err("no plugin".to_owned()),
            || {
                downloaded = true;
                Ok(())
            },
        );
        assert!(!downloaded);
        assert_eq!(
            out.err().map(|e| e.message).as_deref(),
            Some("update.android_failed: no plugin")
        );

        assert_eq!(installs_when_allowed(|| Ok(true), || Ok(7)).ok(), Some(7));
    }

    #[test]
    fn the_words_are_codes_the_window_says_in_its_language() {
        assert_eq!(said("none"), "update.none");
        assert_eq!(
            said_with("download_failed", "HTTP 500"),
            "update.download_failed: HTTP 500"
        );
    }
}
