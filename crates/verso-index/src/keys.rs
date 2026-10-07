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
pub fn target_key(target: &str) -> Option<String> {
    let t = target.trim();
    if t.is_empty() {
        return Some(String::new());
    }
    if t.ends_with('/') {
        return None;
    }
    let stripped = strip_md(t);
    if stripped.is_empty() {
        return None;
    }
    Some(fold(stripped))
}

/// The folder of a note, from its path relative to the root: `` at the
/// root, `a/b` for `a/b/nota.md`.
#[must_use]
pub fn dir_of(relative: &str) -> &str {
    relative.rsplit_once('/').map_or("", |(dir, _)| dir)
}

/// A target read relative to the source note's folder, as a path key:
/// `[[sub/nota]]` from `a/src.md` is `a/sub/nota`, `[[../nota]]` is
/// `nota`, `.` is dropped. `None` when it would leave the root, or when
/// it is the same key as from the root (the source is at the root), or
/// when the target is empty or is not a name (spec Q12, decided
/// 2026-09-22: a path is tried from the root first, then from the
/// source's folder).
#[must_use]
pub fn relative_key(source: &str, target: &str) -> Option<String> {
    let t = target.trim();
    if t.is_empty() || t.ends_with('/') {
        return None;
    }
    let stripped = strip_md(t);
    if stripped.is_empty() {
        return None;
    }
    let mut parts: Vec<&str> = dir_of(source)
        .split('/')
        .filter(|p| !p.is_empty())
        .collect();
    for part in stripped.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            p => parts.push(p),
        }
    }
    let key = fold(&parts.join("/"));
    if key.is_empty() || key == fold(stripped) {
        return None;
    }
    Some(key)
}

/// The key of a type's name — a note's `type:`, a schema's `type` — folded
/// as a note's name is (ADR 0052 point 1): `NPC` and `npc` are one type.
#[must_use]
pub fn type_key(name: &str) -> String {
    fold(name.trim())
}

/// The key of a file's name or path, for a file that is not a note (an
/// attachment an embed names): NFC and lower case, the extension kept —
/// `img/Mapa.PNG` and `img/mapa.png` are one file to a link (spec Q12
/// applies the same rule to embeds).
#[must_use]
pub fn file_key(s: &str) -> String {
    fold(s)
}

/// `s` without a final `.md`, in any case. The cut is at a byte offset,
/// so it is only taken when that offset is a character boundary: a name
/// that ends in a multi-byte character (`Bar 🍻`) is not `.md` and must
/// not be sliced inside the character.
fn strip_md(s: &str) -> &str {
    let cut = s.len().wrapping_sub(3);
    if s.len() >= 3 && s.is_char_boundary(cut) && s[cut..].eq_ignore_ascii_case(".md") {
        &s[..cut]
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
        assert_eq!(target_key("Alvo.md").as_deref(), Some("alvo"));
        assert_eq!(target_key(" ALVO ").as_deref(), Some("alvo"));
        assert_eq!(target_key("a/dup").as_deref(), Some("a/dup"));
        // NFD "Cafe\u{301}" and NFC "Café" are the same key.
        assert_eq!(
            target_key("Cafe\u{301}").as_deref(),
            target_key("Caf\u{e9}").as_deref()
        );
        assert_eq!(
            Some(note_keys("Sess\u{e3}o 3.md").1.as_str()),
            target_key("sessa\u{303}o 3").as_deref()
        );
    }

    #[test]
    fn a_name_ending_in_a_multibyte_character_is_not_sliced() {
        assert_eq!(
            target_key("Bar \u{1f37b}").as_deref(),
            Some("bar \u{1f37b}")
        );
        assert_eq!(
            note_keys("\u{1f37b}.md"),
            ("\u{1f37b}".into(), "\u{1f37b}".into())
        );
        assert_eq!(target_key("\u{e9}").as_deref(), Some("\u{e9}"));
        assert_eq!(target_key("md").as_deref(), Some("md"));
        assert_eq!(target_key(".md").as_deref(), None);
    }

    #[test]
    fn a_target_read_from_the_source_folder_and_what_is_not_a_name() {
        assert_eq!(dir_of("a/b/nota.md"), "a/b");
        assert_eq!(dir_of("nota.md"), "");
        assert_eq!(
            relative_key("a/src.md", "sub/Nota").as_deref(),
            Some("a/sub/nota")
        );
        assert_eq!(
            relative_key("a/b/src.md", "../nota.md").as_deref(),
            Some("a/nota")
        );
        assert_eq!(
            relative_key("a/src.md", "./nota").as_deref(),
            Some("a/nota")
        );
        // Would leave the root; is the same as from the root; is empty.
        assert_eq!(relative_key("src.md", "../nota"), None);
        assert_eq!(relative_key("src.md", "nota"), None);
        assert_eq!(relative_key("a/src.md", ""), None);
        // Not a name: never resolves.
        assert_eq!(target_key("nota/"), None);
        assert_eq!(target_key(".md"), None);
        assert_eq!(target_key("").as_deref(), Some(""));
        assert_eq!(target_key("#Heading").as_deref(), Some("#heading"));
    }
}
