// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Two appends joined (ADR 0079 item 8, decided 2026-10-11): a note
//! changed on both sides since the base, each change a pure append to its
//! end, is one note with both tails — the server's first — instead of a
//! conflict's copy. No IO: the host reads both versions and writes the
//! result.

/// Whether a path is one the append-merge applies to: a note (`.md`,
/// in any case). Every other file changed on both sides is a conflict.
#[must_use]
pub fn merges_by_append(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.len() > 3
        && name
            .get(name.len() - 3..)
            .is_some_and(|ext| ext.eq_ignore_ascii_case(".md"))
}

/// The two appends joined, or `None` when the change on both sides is not
/// two appends. `base` is the SHA-256, in lowercase hex, of the file both
/// sides last agreed on; sync keeps no more of it, so its length `k` is
/// found: the one prefix shared by both versions whose hash is `base`.
///
/// Two appends when, for that `k`: both versions are longer than `k` (each
/// side added something — one alone is a change of one side, not this);
/// and the join is at a line boundary — `k` is 0, or the base ends with a
/// newline, or both tails start with one. The result is the base, the
/// server's tail (`remote`), then this computer's (`local`).
#[must_use]
pub fn append_merge(base: &str, local: &[u8], remote: &[u8]) -> Option<Vec<u8>> {
    use sha2::{Digest, Sha256};
    let shortest = local.len().min(remote.len());
    // One side empty: its tail is empty whatever the base.
    if shortest == 0 {
        return None;
    }
    // The base is a prefix of both: no longer than what they share.
    let common = local.iter().zip(remote).take_while(|(a, b)| a == b).count();
    let mut hasher = Sha256::new();
    let mut hashed = 0;
    // A tail of each side is not empty: `k` stops short of the shorter.
    for k in 0..=common.min(shortest - 1) {
        let ends_line = k == 0 || local.get(k - 1) == Some(&b'\n');
        let tails_start_line = local.get(k) == Some(&b'\n') && remote.get(k) == Some(&b'\n');
        if !(ends_line || tails_start_line) {
            continue;
        }
        hasher.update(local.get(hashed..k)?);
        hashed = k;
        let hex: String = hasher
            .clone()
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if hex == base {
            let (prefix, here) = local.split_at(k);
            let there = remote.get(k..)?;
            return Some([prefix, there, here].concat());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn hash(bytes: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        Sha256::digest(bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    /// One case: the base, this computer's version, the server's, and the
    /// result expected (`None`: a conflict's copy).
    struct Case {
        name: &'static str,
        base: &'static str,
        local: &'static str,
        remote: &'static str,
        merged: Option<&'static str>,
    }

    const CASES: &[Case] = &[
        Case {
            name: "both appended a line: the server's first",
            base: "# Note\nfirst\n",
            local: "# Note\nfirst\nfrom here\n",
            remote: "# Note\nfirst\nfrom there\n",
            merged: Some("# Note\nfirst\nfrom there\nfrom here\n"),
        },
        Case {
            name: "both appended several lines",
            base: "a\n",
            local: "a\nb\nc\n",
            remote: "a\nx\n\ny",
            merged: Some("a\nx\n\nyb\nc\n"),
        },
        Case {
            name: "an empty note, written on both sides",
            base: "",
            local: "here\n",
            remote: "there\n",
            merged: Some("there\nhere\n"),
        },
        Case {
            name: "the base without its last newline, both tails a new line",
            base: "a\nb",
            local: "a\nb\nhere",
            remote: "a\nb\nthere",
            merged: Some("a\nb\nthere\nhere"),
        },
        Case {
            name: "the base without its last newline, one side went on the line",
            base: "a\nb",
            local: "a\nb and more",
            remote: "a\nb\nthere",
            merged: None,
        },
        Case {
            name: "both went on the base's last line",
            base: "a\nb",
            local: "a\nbc",
            remote: "a\nbd",
            merged: None,
        },
        Case {
            name: "one side rewrote the middle",
            base: "a\nb\nc\n",
            local: "a\nB\nc\nhere\n",
            remote: "a\nb\nc\nthere\n",
            merged: None,
        },
        Case {
            name: "the other side rewrote the middle",
            base: "a\nb\nc\n",
            local: "a\nb\nc\nhere\n",
            remote: "a\nX\nc\nthere\n",
            merged: None,
        },
        Case {
            name: "one side cut the end",
            base: "a\nb\n",
            local: "a\n",
            remote: "a\nb\nthere\n",
            merged: None,
        },
        Case {
            name: "only one side appended: not two changes",
            base: "a\n",
            local: "a\n",
            remote: "a\nthere\n",
            merged: None,
        },
        Case {
            name: "an empty note, written on one side only",
            base: "",
            local: "",
            remote: "there\n",
            merged: None,
        },
        Case {
            name: "only this side appended: not two changes",
            base: "a\n",
            local: "a\nhere\n",
            remote: "a\n",
            merged: None,
        },
    ];

    #[test]
    fn the_cases() {
        for c in CASES {
            let got = append_merge(
                &hash(c.base.as_bytes()),
                c.local.as_bytes(),
                c.remote.as_bytes(),
            );
            assert_eq!(got.as_deref(), c.merged.map(str::as_bytes), "{}", c.name);
        }
    }

    #[test]
    fn no_base_no_merge() {
        // A base not known (the first sync), or one that is neither
        // version's prefix: a conflict's copy.
        assert_eq!(append_merge("", b"a\nhere\n", b"a\nthere\n"), None);
        assert_eq!(
            append_merge(&hash(b"z\n"), b"a\nhere\n", b"a\nthere\n"),
            None
        );
    }

    #[test]
    fn only_notes() {
        assert!(merges_by_append("Note.md"));
        assert!(merges_by_append("folder/Daily.MD"));
        assert!(merges_by_append("a/b.Md"));
        assert!(!merges_by_append("board.canvas"));
        assert!(!merges_by_append("list.txt"));
        assert!(!merges_by_append("md"));
        assert!(!merges_by_append("notes.md.bak"));
    }

    fn lines() -> impl Strategy<Value = String> {
        proptest::collection::vec("[a-z ]{0,8}", 0..6)
            .prop_map(|ls| ls.iter().map(|l| format!("{l}\n")).collect::<String>())
    }

    proptest! {
        /// The result holds exactly the base and both tails, the server's
        /// first: nothing lost, nothing added, nothing twice.
        #[test]
        fn base_then_both_tails(
            base in lines(),
            there in "[a-z\n]{1,20}",
            here in "[a-z\n]{1,20}",
        ) {
            let local = format!("{base}{here}");
            let remote = format!("{base}{there}");
            let merged = append_merge(&hash(base.as_bytes()), local.as_bytes(), remote.as_bytes());
            prop_assert_eq!(merged, Some(format!("{base}{there}{here}").into_bytes()));
        }
    }
}
