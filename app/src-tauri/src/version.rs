//! A release's version, as its tag spells it (`v0.5.0`, `v0.5.0-beta.1`),
//! and which of two is the newer: what the update check compares. No IO.

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
