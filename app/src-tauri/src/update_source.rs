// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Where the updater looks for releases (ADR 0118 item 10.3, decided
//! 2026-11-12: the installers in a public place while the code stays
//! private; which place is `[OPEN]`). Fixed when the app is built, never
//! chosen by the window:
//!
//! - by default, the releases of the GitHub repository `SergioSJS/verso`
//!   (private today: only a computer with `gh` signed in reaches them);
//! - `VERSO_UPDATE_REPO=<owner>/<name>` at build time: another GitHub
//!   repository's releases — a public one that holds only releases;
//! - `VERSO_UPDATE_BASE=https://…/` at build time: any HTTPS place (a
//!   Cloudflare R2 bucket behind its own domain, say) that serves
//!   `releases.json` — a list of releases in the shape of GitHub's API
//!   (`tag_name`, `name`, `body`, `published_at`, `draft`, `assets` with
//!   `name`, `url`, `browser_download_url`, `size`, `digest`) — beside
//!   the release files, every one under that base.
//!
//! Whatever the place, a file installs only when it is in the release's
//! checksums list signed with Verso's release key (ADR 0055): the place
//! is trusted for availability, not for integrity.

/// The release files' place, as built.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Source {
    /// A GitHub repository's releases, `<owner>/<name>`.
    GitHub(&'static str),
    /// An HTTPS base address serving `releases.json` and the files.
    Base(&'static str),
}

/// The repository releases come from unless the build names another.
const DEFAULT_REPO: &str = "SergioSJS/verso";

/// This build's place.
pub(crate) const SOURCE: Source = match option_env!("VERSO_UPDATE_BASE") {
    Some(base) => Source::Base(base),
    None => match option_env!("VERSO_UPDATE_REPO") {
        Some(repo) => Source::GitHub(repo),
        None => Source::GitHub(DEFAULT_REPO),
    },
};

impl Source {
    /// Where the list of releases is read.
    pub(crate) fn releases_url(self) -> String {
        match self {
            Source::GitHub(repo) => format!("https://api.github.com/repos/{repo}/releases"),
            Source::Base(base) => format!("{}/releases.json", base.trim_end_matches('/')),
        }
    }

    /// Whether a file's address is one of this place's own release files
    /// (where a download starts; a redirect the client follows is not
    /// checked here). HTTPS only.
    pub(crate) fn trusts(self, url: &str) -> bool {
        let Ok(parsed) = reqwest::Url::parse(url) else {
            return false;
        };
        if parsed.scheme() != "https" {
            return false;
        }
        let s = parsed.as_str();
        match self {
            Source::GitHub(repo) => {
                s.starts_with(&format!("https://github.com/{repo}/releases/download/"))
                    || s.starts_with(&format!(
                        "https://api.github.com/repos/{repo}/releases/assets/"
                    ))
            }
            Source::Base(base) => {
                let Ok(root) = reqwest::Url::parse(&format!("{}/", base.trim_end_matches('/')))
                else {
                    return false;
                };
                root.scheme() == "https"
                    && parsed.host_str() == root.host_str()
                    && parsed.port_or_known_default() == root.port_or_known_default()
                    && parsed.path().starts_with(root.path())
                    && !parsed.path().contains("/../")
            }
        }
    }

    /// Whether a GitHub token may be sent: only to GitHub.
    pub(crate) fn is_github(self) -> bool {
        matches!(self, Source::GitHub(_))
    }
}

#[cfg(test)]
mod tests {
    use super::Source;

    #[test]
    fn a_github_source_trusts_its_own_repository_only() {
        let s = Source::GitHub("SergioSJS/verso-releases");
        assert_eq!(
            s.releases_url(),
            "https://api.github.com/repos/SergioSJS/verso-releases/releases"
        );
        assert!(
            s.trusts("https://github.com/SergioSJS/verso-releases/releases/download/v1.0.0/a.apk")
        );
        assert!(
            s.trusts("https://api.github.com/repos/SergioSJS/verso-releases/releases/assets/7")
        );
        assert!(!s.trusts("https://github.com/SergioSJS/verso/releases/download/v1.0.0/a.apk"));
        assert!(!s.trusts("http://github.com/SergioSJS/verso-releases/releases/download/v1/a"));
        assert!(s.is_github());
    }

    #[test]
    fn a_base_source_trusts_what_is_under_it_on_its_host() {
        let s = Source::Base("https://dl.versomd.com/verso/");
        assert_eq!(
            s.releases_url(),
            "https://dl.versomd.com/verso/releases.json"
        );
        assert!(s.trusts("https://dl.versomd.com/verso/v1.0.0/Verso-1.0.0-android-arm64.apk"));
        assert!(!s.trusts("https://dl.versomd.com/other/v1.0.0/x.apk"));
        assert!(!s.trusts("https://dl.versomd.com.evil.example/verso/x.apk"));
        assert!(!s.trusts("https://dl.versomd.com:8443/verso/x.apk"));
        assert!(!s.trusts("http://dl.versomd.com/verso/x.apk"));
        assert!(!s.is_github());
        let bare = Source::Base("https://dl.versomd.com");
        assert_eq!(bare.releases_url(), "https://dl.versomd.com/releases.json");
        assert!(bare.trusts("https://dl.versomd.com/v1/x.apk"));
    }
}
