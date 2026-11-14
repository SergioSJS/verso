//! A release's version, as its tag spells it (`v0.5.0`, `v0.5.0-beta.1`),
//! which of two is the newer, and whether two are of the same channel:
//! what the update check compares. No IO.

#[derive(Debug, PartialEq, Eq, Clone)]
pub(crate) struct ParsedVersion {
    pub(crate) major: u64,
    pub(crate) minor: u64,
    pub(crate) patch: u64,
    pub(crate) prerelease: Option<(String, u64)>,
}

impl ParsedVersion {
    pub(crate) fn parse(s: &str) -> Option<Self> {
        let s = s
            .trim()
            .strip_prefix('v')
            .or_else(|| s.trim().strip_prefix('V'))
            .unwrap_or(s.trim());
        let (ver_part, pre_part) = match s.split_once('-') {
            Some((v, p)) => (v, Some(p)),
            None => (s, None),
        };
        let parts: Vec<&str> = ver_part.split('.').collect();
        if parts.is_empty() || parts.len() > 3 {
            return None;
        }
        let major = parts[0].parse().ok()?;
        let minor = if parts.len() > 1 {
            parts[1].parse().ok()?
        } else {
            0
        };
        let patch = if parts.len() > 2 {
            parts[2].parse().ok()?
        } else {
            0
        };
        let prerelease = match pre_part {
            None => None,
            Some(pre) => {
                let (tag, num) = if let Some((t, n)) = pre.split_once('.') {
                    (t.to_string(), n.parse::<u64>().unwrap_or(0))
                } else if let Some((t, n)) = pre.split_once('-') {
                    (t.to_string(), n.parse::<u64>().unwrap_or(0))
                } else {
                    let idx = pre.find(|c: char| c.is_ascii_digit()).unwrap_or(pre.len());
                    let t = &pre[..idx];
                    let n = pre[idx..].parse::<u64>().unwrap_or(0);
                    (t.to_string(), n)
                };
                Some((tag, num))
            }
        };
        Some(Self {
            major,
            minor,
            patch,
            prerelease,
        })
    }

    pub(crate) fn is_newer_than(&self, other: &Self) -> bool {
        if self.major != other.major {
            return self.major > other.major;
        }
        if self.minor != other.minor {
            return self.minor > other.minor;
        }
        if self.patch != other.patch {
            return self.patch > other.patch;
        }
        match (&self.prerelease, &other.prerelease) {
            (None, Some(_)) => true,
            (Some(_), None) => false,
            (None, None) => false,
            (Some((tag1, num1)), Some((tag2, num2))) => {
                if tag1 == tag2 {
                    num1 > num2
                } else {
                    let rank = |t: &str| match t {
                        "alpha" => 1,
                        "beta" => 2,
                        "rc" => 3,
                        _ => 0,
                    };
                    let r1 = rank(tag1);
                    let r2 = rank(tag2);
                    if r1 != r2 { r1 > r2 } else { tag1 > tag2 }
                }
            }
        }
    }
}

impl ParsedVersion {
    /// Whether `other` is of this version's channel (the maintainer,
    /// 2026-11-14): a test version's app, *Verso Beta*, updates only to
    /// test versions, and a final's app, *Verso*, only to finals — each is
    /// its own app, with its own identifier, beside the other.
    pub(crate) fn same_channel(&self, other: &Self) -> bool {
        self.prerelease.is_some() == other.prerelease.is_some()
    }

    /// Whether the release file `name` is this channel's app: a test
    /// release names its files `Verso-Beta-…`, a final `Verso-…`
    /// (`scripts/release-page.mjs`, `releaseFiles`).
    pub(crate) fn names_its_app(&self, name: &str) -> bool {
        let n = name.to_ascii_lowercase();
        if self.prerelease.is_some() {
            n.starts_with("verso-beta-")
        } else {
            // `Verso-` then the version's number: not `verso-cli-`.
            n.strip_prefix("verso-")
                .is_some_and(|rest| rest.starts_with(|c: char| c.is_ascii_digit()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ParsedVersion;

    fn v(s: &str) -> ParsedVersion {
        ParsedVersion::parse(s).unwrap_or_else(|| panic!("{s} parses"))
    }

    #[test]
    fn a_beta_updates_only_to_betas_and_a_final_only_to_finals() {
        assert!(v("0.9.0-beta.1").same_channel(&v("v0.9.1-beta.1")));
        assert!(!v("0.9.0-beta.1").same_channel(&v("v0.9.0")));
        assert!(v("0.9.0").same_channel(&v("v0.9.1")));
        assert!(!v("0.9.0").same_channel(&v("v0.9.1-beta.1")));
    }

    #[test]
    fn each_channel_takes_only_its_own_apps_file() {
        let beta = v("0.9.0-beta.1");
        assert!(beta.names_its_app("Verso-Beta-0.9.0-beta.1-macos-arm64.zip"));
        assert!(!beta.names_its_app("Verso-0.9.0-macos-arm64.zip"));
        let release = v("0.9.0");
        assert!(release.names_its_app("Verso-0.9.0-macos-arm64.zip"));
        assert!(!release.names_its_app("Verso-Beta-0.9.0-beta.1-macos-arm64.zip"));
        assert!(!release.names_its_app("verso-cli-0.9.0-macos-arm64.tar.gz"));
    }
}
