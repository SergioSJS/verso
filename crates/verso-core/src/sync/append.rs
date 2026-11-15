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
/// server's tail (`remote`), then this computer's (`local`), on a line of its
/// own ([`joined`]).
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
            return Some(joined(prefix, there, here));
        }
    }
    None
}

/// The base, the server's tail, then this computer's. This computer's tail
/// starts a line of its own: when the server's ends without a newline and
/// this one does not start with one, a newline is put between them — two
/// people's last lines glued into one ("…sem rede.Linha do Mac…", seen on a
/// phone and a computer on 2026-11-15) are neither one's text.
fn joined(prefix: &[u8], there: &[u8], here: &[u8]) -> Vec<u8> {
    let glue = !there.is_empty()
        && !there.ends_with(b"\n")
        && !here.is_empty()
        && !here.starts_with(b"\n");
    let mut out = Vec::with_capacity(prefix.len() + there.len() + here.len() + 1);
    out.extend_from_slice(prefix);
    out.extend_from_slice(there);
    if glue {
        out.push(b'\n');
    }
    out.extend_from_slice(here);
    out
}

/// The longest prefix [`template_merge`] hashes in search of the
/// template: a template is a page of text, never a megabyte.
const TEMPLATE_MAX: usize = 1 << 20;

/// Two versions of a note that both sides made apart, each from the same
/// filled template (ADR 0093 item 12, revising 0079 item 8): the template
/// is their base, each side's additions after it are appends, and they are
/// joined — the template, the server's additions (`remote`), then this
/// computer's (`local`). `template` is the SHA-256, lowercase hex, of the
/// text this computer made the note with; the join holds only when both
/// versions begin with exactly those bytes. Unlike [`append_merge`], a
/// side may have added nothing: the other side's version is then the
/// result, and nothing is lost either way. `None`: not both from that
/// template, or the join would not fall at a line boundary — a conflict's
/// copy, as before.
#[must_use]
pub fn template_merge(template: &str, local: &[u8], remote: &[u8]) -> Option<Vec<u8>> {
    use sha2::{Digest, Sha256};
    if local == remote {
        return None;
    }
    let common = local.iter().zip(remote).take_while(|(a, b)| a == b).count();
    let mut hasher = Sha256::new();
    let mut hashed = 0;
    for k in 0..=common.min(TEMPLATE_MAX) {
        let (here, there) = (local.get(k..)?, remote.get(k..)?);
        let one_empty = here.is_empty() || there.is_empty();
        let ends_line = k == 0 || local.get(k - 1) == Some(&b'\n');
        let tails_start_line = here.first() == Some(&b'\n') && there.first() == Some(&b'\n');
        if !(one_empty || ends_line || tails_start_line) {
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
        if hex == template {
            return Some(joined(local.get(..k)?, there, here));
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
            merged: Some("a\nx\n\ny\nb\nc\n"),
        },
        Case {
            name: "the server's tail ends mid-line: this side's starts a line of its own",
            base: "# Nota\n\nConflito.\n",
            local: "# Nota\n\nConflito.\nLinha do Mac, ao mesmo tempo.\n",
            remote: "# Nota\n\nConflito.\n\nLinha do POCO, sem rede.",
            merged: Some(
                "# Nota\n\nConflito.\n\nLinha do POCO, sem rede.\nLinha do Mac, ao mesmo tempo.\n",
            ),
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
        /// first: nothing lost, nothing twice, and nothing added but the one
        /// newline that keeps this side's tail off the server's last line.
        #[test]
        fn base_then_both_tails(
            base in lines(),
            there in "[a-z\n]{1,20}",
            here in "[a-z\n]{1,20}",
        ) {
            let local = format!("{base}{here}");
            let remote = format!("{base}{there}");
            let merged = append_merge(&hash(base.as_bytes()), local.as_bytes(), remote.as_bytes());
            let glue = if !there.ends_with('\n') && !here.starts_with('\n') { "\n" } else { "" };
            prop_assert_eq!(merged, Some(format!("{base}{there}{glue}{here}").into_bytes()));
        }

        /// Two devices made the same periodic note offline from one
        /// template (ADR 0093 item 12): joined, the template once, then
        /// the server's lines and this computer's — every line of either
        /// side kept, none twice; a side that added nothing gives the
        /// other's version.
        #[test]
        fn two_notes_made_apart_from_one_template_are_joined(
            template in "[a-z#{}: \n]{0,40}",
            there in proptest::collection::vec("[a-z ]{0,8}", 0..5),
            here in proptest::collection::vec("[a-z ]{0,8}", 0..5),
        ) {
            let tail = |ls: &Vec<String>| ls.iter().map(|l| format!("{l}\n")).collect::<String>();
            // What each side wrote begins a line of its own.
            let lead = if template.is_empty() || template.ends_with('\n') { "" } else { "\n" };
            let (there, here) = (tail(&there), tail(&here));
            let remote = format!("{template}{}{there}", if there.is_empty() { "" } else { lead });
            let local = format!("{template}{}{here}", if here.is_empty() { "" } else { lead });
            let merged = template_merge(&hash(template.as_bytes()), local.as_bytes(), remote.as_bytes());
            if local == remote {
                prop_assert_eq!(merged, None);
                return Ok(());
            }
            let merged = String::from_utf8(merged.expect("joined")).unwrap();
            let rtail = &remote[template.len()..];
            let ltail = &local[template.len()..];
            prop_assert_eq!(&merged, &format!("{template}{rtail}{ltail}"));
            // Every line either side added is there, in its order.
            let added: Vec<&str> = merged[template.len()..].lines().filter(|l| !l.is_empty()).collect();
            let want: Vec<&str> = there.lines().chain(here.lines()).filter(|l| !l.is_empty()).collect();
            prop_assert_eq!(added, want);
            if here.is_empty() {
                prop_assert_eq!(&merged, &remote);
            }
            if there.is_empty() {
                prop_assert_eq!(&merged, &local);
            }
        }

        /// A note not made from that template, on either side, is never
        /// joined: its copy is kept, as before.
        #[test]
        fn another_template_is_not_joined(
            template in "[a-z\n]{1,20}",
            other in "[A-Z\n]{1,20}",
            here in "[a-z\n]{1,20}",
        ) {
            let local = format!("{template}{here}");
            let remote = format!("{other}{here}x");
            prop_assume!(!remote.starts_with(&template));
            prop_assert_eq!(template_merge(&hash(template.as_bytes()), local.as_bytes(), remote.as_bytes()), None);
        }
    }

    #[test]
    fn the_template_cases() {
        let t = "---\ndate: 2026-10-12\n---\n# 2026-W42\n\n";
        let h = hash(t.as_bytes());
        let here = format!("{t}- daqui\n");
        let there = format!("{t}- de lá\n");
        assert_eq!(
            template_merge(&h, here.as_bytes(), there.as_bytes()).as_deref(),
            Some(format!("{t}- de lá\n- daqui\n").as_bytes())
        );
        // One side only filled the template: the other's version.
        assert_eq!(
            template_merge(&h, t.as_bytes(), there.as_bytes()).as_deref(),
            Some(there.as_bytes())
        );
        assert_eq!(
            template_merge(&h, here.as_bytes(), t.as_bytes()).as_deref(),
            Some(here.as_bytes())
        );
        // The other device filled the template at another time (`{{time}}`):
        // not the same bytes, a copy.
        let later = "---\ndate: 2026-10-13\n---\n# 2026-W42\n\n- de lá\n";
        assert_eq!(template_merge(&h, here.as_bytes(), later.as_bytes()), None);
        // One side rewrote the template's text.
        let edited = "---\ndate: 2026-10-12\n---\n# Semana\n\n- daqui\n";
        assert_eq!(
            template_merge(&h, edited.as_bytes(), there.as_bytes()),
            None
        );
        // Equal versions are no conflict.
        assert_eq!(template_merge(&h, here.as_bytes(), here.as_bytes()), None);
        // A template without its last newline: the sides joined only when
        // both begin a line.
        let bare = "# 2026-W42";
        let hb = hash(bare.as_bytes());
        assert_eq!(
            template_merge(&hb, b"# 2026-W42\na", b"# 2026-W42\nb").as_deref(),
            Some(&b"# 2026-W42\nb\na"[..])
        );
        assert_eq!(template_merge(&hb, b"# 2026-W42a", b"# 2026-W42\nb"), None);
    }
}
