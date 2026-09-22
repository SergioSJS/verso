// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! How a link target and a note name are compared (provisional, spec Q12,
//! Q8, Q7 — `docs/reference/index-decision.md`), as observed in Obsidian:
//! case does not matter, a `.md` extension may be written or not, and a
//! target is a path from the root or a bare name. Both sides go through
//! NFC and lower-casing; the walk hands paths as the file system stores
//! them, and a folder that went through HFS+ or sync mixes NFC and NFD.

use unicode_normalization::UnicodeNormalization;

/// The two keys of a note at `relative` (path from the root, with
/// extension): its path key (`pasta/nota`) and its name key (`nota`).
#[must_use]
pub fn note_keys(relative: &str) -> (String, String) {
    let without_ext = strip_md(relative);
    let path_key = fold(without_ext);
    let name = without_ext.rsplit('/').next().unwrap_or(without_ext);
    (path_key, fold(name))
}

/// The key of a link target as written: `[[Pasta/Nota.md]]` → `pasta/nota`.
#[must_use]
pub fn target_key(target: &str) -> String {
    fold(strip_md(target.trim()))
}

fn strip_md(s: &str) -> &str {
    let lower_ends_with_md = s.len() >= 3 && s[s.len() - 3..].eq_ignore_ascii_case(".md");
    if lower_ends_with_md {
        &s[..s.len() - 3]
    } else {
        s
    }
}

fn fold(s: &str) -> String {
    s.nfc().collect::<String>().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_fold_case_extension_and_normalization() {
        assert_eq!(note_keys("a/Dup.md"), ("a/dup".into(), "dup".into()));
        assert_eq!(note_keys("Alvo.MD"), ("alvo".into(), "alvo".into()));
        assert_eq!(target_key("Alvo.md"), "alvo");
        assert_eq!(target_key(" ALVO "), "alvo");
        assert_eq!(target_key("a/dup"), "a/dup");
        // NFD "Cafe\u{301}" and NFC "Café" are the same key.
        assert_eq!(target_key("Cafe\u{301}"), target_key("Caf\u{e9}"));
        assert_eq!(
            note_keys("Sess\u{e3}o 3.md").1,
            target_key("sessa\u{303}o 3")
        );
    }
}
