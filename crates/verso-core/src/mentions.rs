// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A note's unlinked mentions, as occurrences (ADR 0089 item 1): the index
//! names the candidates — the notes whose text holds the name's words in a
//! row, accents and case folded — and each candidate is read from the disk
//! and scanned for the name as written. A mention is the note's name, or
//! one of its `aliases`, as a phrase on word boundaries, case ignored and
//! accents kept ("Porto" finds "porto", not "pôrto") — an accent written
//! composed (NFC) or decomposed (NFD) is one accent, as it is one file
//! name (ADR 0089, M5) — in the note's prose
//! only (`verso_dialect::prose`): never in the frontmatter, code, a
//! comment, a link, an embed or a tag. This reads; the window writes the
//! link, through the contract, over the revision it read (invariant 11).

use super::*;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::{decompose_canonical, is_combining_mark};

/// Candidates asked of the index for each name: the notes holding it.
const CANDIDATES: usize = 200;
/// Occurrences answered at most; past them, `more`.
const MOST: usize = 500;
/// Characters of the line shown on each side of a mention.
const AROUND: usize = 60;

/// One unlinked mention: where it is and what is written there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mention {
    /// The note that mentions, relative to the folder.
    pub path: String,
    /// 1-based line, and 1-based column in Unicode scalar values (spec
    /// §4.4), of the mention's first character.
    pub line: u32,
    pub col: u32,
    /// The mention as written.
    pub text: String,
    /// Up to 60 characters of its line before it and after it.
    pub before: String,
    pub after: String,
    /// The text is one of the note's aliases, not its name.
    pub alias: bool,
    /// In a table's cell: a link's `|` would end the cell.
    pub table: bool,
    /// Inside a `> [!secret]` callout (ADR 0087): a server drops it from
    /// a reader's answer.
    pub secret: bool,
}

/// A note's unlinked mentions, in path and position order; `more` when
/// there were more than this answers.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Mentions {
    pub mentions: Vec<Mention>,
    pub more: bool,
}

/// A name a mention may be written as: its text, and whether it is an
/// alias.
struct Name {
    text: String,
    alias: bool,
}

/// A mention found in one text: its bytes, and which name it is.
#[derive(Debug, PartialEq, Eq)]
struct Found {
    start: usize,
    end: usize,
    alias: bool,
    table: bool,
}

/// A letter, a digit, `_`, or a mark that belongs to the letter before it.
fn wordy(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || is_combining_mark(c)
}

/// The end of `name` written at `at` in `text`, case ignored and accents
/// kept, if it is there. Both sides are compared decomposed (NFD), each
/// character of the text decomposed as it is read, so `ô` written as one
/// character or as `o` and its mark is the same `ô`; a character of the
/// text is taken whole or not at all. The text's offsets stay its own.
fn written_at(text: &str, at: usize, name: &str) -> Option<usize> {
    let want: Vec<char> = name.nfd().flat_map(char::to_lowercase).collect();
    let mut i = 0;
    let mut rest = text.get(at..)?.char_indices();
    let mut end = at;
    while i < want.len() {
        let (k, t) = rest.next()?;
        let mut parts = Vec::new();
        decompose_canonical(t, |c| parts.push(c));
        for c in parts.iter().flat_map(|c| c.to_lowercase()) {
            if want.get(i) != Some(&c) {
                return None;
            }
            i += 1;
        }
        end = at + k + t.len_utf8();
    }
    Some(end)
}

/// A name as compared for sameness: composed, lower-cased.
fn folded(name: &str) -> String {
    name.nfc().collect::<String>().to_lowercase()
}

/// Every mention of `names` in the prose of `text`, in order; where two
/// names start at one place, the longer one.
fn scan(text: &str, names: &[Name]) -> Vec<Found> {
    let mut out = Vec::new();
    for run in verso_dialect::prose(text) {
        let mut at = run.span.start;
        while at < run.span.end {
            let before = text.get(..at).and_then(|b| b.chars().next_back());
            let hit = names.iter().find_map(|name| {
                let first = name.text.chars().next()?;
                let last = name.text.chars().next_back()?;
                if wordy(first) && before.is_some_and(wordy) {
                    return None;
                }
                let end = written_at(text, at, &name.text)?;
                let after = text.get(end..).and_then(|a| a.chars().next());
                (end <= run.span.end && !(wordy(last) && after.is_some_and(wordy)))
                    .then_some((end, name.alias))
            });
            if let Some((end, alias)) = hit {
                out.push(Found {
                    start: at,
                    end,
                    alias,
                    table: run.table,
                });
                at = end;
            } else {
                at += text
                    .get(at..)
                    .and_then(|r| r.chars().next())
                    .map_or(1, char::len_utf8);
            }
        }
    }
    out
}

/// The byte ranges of the `secret` callouts of `text` (ADR 0087 item 1,
/// the kind compared lower-cased).
fn secret_spans(text: &str) -> Vec<verso_dialect::Span> {
    if !text.contains("[!") {
        return Vec::new();
    }
    verso_dialect::parse(text)
        .callouts
        .into_iter()
        .filter(|c| c.kind.to_lowercase() == "secret")
        .map(|c| c.span)
        .collect()
}

/// The `aliases` of a note's frontmatter: a list, or one value.
fn aliases_of(text: &str) -> Vec<String> {
    let Some(Ok(verso_dialect::Value::Mapping(map))) =
        verso_dialect::parse(text).frontmatter.map(|f| f.values)
    else {
        return Vec::new();
    };
    let scalar = |v: &verso_dialect::Value| match v {
        verso_dialect::Value::String(s) => Some(s.clone()),
        verso_dialect::Value::Integer(i) => Some(i.to_string()),
        verso_dialect::Value::Float(f) => Some(f.to_string()),
        _ => None,
    };
    match map.iter().find(|(k, _)| k == "aliases").map(|(_, v)| v) {
        Some(verso_dialect::Value::Sequence(items)) => items.iter().filter_map(scalar).collect(),
        Some(v) => scalar(v).into_iter().collect(),
        None => Vec::new(),
    }
}

/// The mentions found in one note's text, placed in lines and columns.
fn placed(path: &str, text: &str, found: Vec<Found>) -> Vec<Mention> {
    let secret = secret_spans(text);
    found
        .into_iter()
        .map(|f| {
            let line_start = text
                .get(..f.start)
                .and_then(|b| b.rfind('\n'))
                .map_or(0, |k| k + 1);
            let line_end = text
                .get(f.end..)
                .and_then(|a| a.find('\n'))
                .map_or(text.len(), |k| f.end + k);
            let head = text.get(line_start..f.start).unwrap_or_default();
            let tail = text
                .get(f.end..line_end)
                .unwrap_or_default()
                .trim_end_matches('\r');
            let skip = head.chars().count().saturating_sub(AROUND);
            Mention {
                path: path.to_owned(),
                line: u32::try_from(
                    text.get(..f.start)
                        .unwrap_or_default()
                        .matches('\n')
                        .count()
                        + 1,
                )
                .unwrap_or(u32::MAX),
                col: u32::try_from(head.chars().count() + 1).unwrap_or(u32::MAX),
                text: text.get(f.start..f.end).unwrap_or_default().to_owned(),
                before: head.chars().skip(skip).collect(),
                after: tail.chars().take(AROUND).collect(),
                alias: f.alias,
                table: f.table,
                secret: secret.iter().any(|s| s.start <= f.start && f.end <= s.end),
            }
        })
        .collect()
}

impl Workspace {
    /// The unlinked mentions of the note `note` in the other notes of the
    /// folder (ADR 0089 item 1). Refused as any read is when the path
    /// names no note of the folder; a candidate that cannot be read now
    /// — gone, a placeholder, not UTF-8 — is passed over.
    pub fn unlinked_mentions(&mut self, note: &str) -> Result<Mentions, CoreError> {
        let path = self.note_key(note)?;
        let handle = self
            .root
            .handle(Path::new(&path))
            .map_err(CoreError::Confined)?;
        let (bytes, _) = self.root.read(handle).map_err(CoreError::Read)?;
        let own = String::from_utf8_lossy(&bytes);
        let stem = path.rsplit('/').next().unwrap_or(&path);
        let stem = stem.strip_suffix(".md").unwrap_or(stem);
        let mut names = vec![Name {
            text: stem.to_owned(),
            alias: false,
        }];
        for alias in aliases_of(&own) {
            let alias = alias.trim().to_owned();
            if !alias.is_empty() && !names.iter().any(|n| folded(&n.text) == folded(&alias)) {
                names.push(Name {
                    text: alias,
                    alias: true,
                });
            }
        }
        // The longer name first, where two start at one place.
        names.sort_by_key(|n| std::cmp::Reverse(n.text.chars().count()));
        let mut candidates: Vec<String> = Vec::new();
        for name in &names {
            for p in self
                .index
                .notes_holding(&name.text, CANDIDATES)
                .map_err(CoreError::Index)?
            {
                if p != path && p.ends_with(".md") && !candidates.contains(&p) {
                    candidates.push(p);
                }
            }
        }
        candidates.sort();
        let mut out = Mentions::default();
        for candidate in candidates {
            let Ok(handle) = self.root.handle(Path::new(&candidate)) else {
                continue;
            };
            let Ok((bytes, _)) = self.root.read(handle) else {
                continue;
            };
            let Ok(text) = String::from_utf8(bytes) else {
                continue;
            };
            let found = scan(&text, &names);
            for m in placed(&candidate, &text, found) {
                if out.mentions.len() >= MOST {
                    out.more = true;
                    return Ok(out);
                }
                out.mentions.push(m);
            }
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[(&str, bool)]) -> Vec<Name> {
        list.iter()
            .map(|(t, a)| Name {
                text: (*t).to_owned(),
                alias: *a,
            })
            .collect()
    }

    #[test]
    fn a_name_is_found_on_word_boundaries_only() {
        let n = names(&[("C++", false)]);
        let text = "Uso C++ e C++11 e xC++.\n";
        let found: Vec<&str> = scan(text, &n)
            .iter()
            .filter_map(|f| text.get(f.start..f.end))
            .collect();
        // A name that ends in a sign is bounded by its letters only.
        assert_eq!(found, ["C++", "C++"]);
    }

    #[test]
    fn the_longer_name_wins_where_two_start_together() {
        let n = names(&[("Porto Alegre", true), ("Porto", false)]);
        let text = "De Porto Alegre ao Porto.\n";
        let found: Vec<(&str, bool)> = scan(text, &n)
            .iter()
            .filter_map(|f| text.get(f.start..f.end).map(|t| (t, f.alias)))
            .collect();
        assert_eq!(found, [("Porto Alegre", true), ("Porto", false)]);
    }

    #[test]
    fn case_is_ignored_and_accents_kept() {
        let n = names(&[("Ação", false)]);
        let text = "AÇÃO, ação, acao, Acão.\n";
        let found: Vec<&str> = scan(text, &n)
            .iter()
            .filter_map(|f| text.get(f.start..f.end))
            .collect();
        assert_eq!(found, ["AÇÃO", "ação"]);
    }

    /// The same accent written composed (NFC) or decomposed (NFD) is one
    /// name, as it is one file (the maintainer, 2026-10-10; ADR 0089, M5).
    #[test]
    fn nfc_and_nfd_of_one_accent_are_one_name() {
        let nfc = "P\u{f4}rto";
        let nfd = "Po\u{302}rto";
        for (name, written) in [
            (nfc, nfd),
            (nfd, nfc),
            (nfc, nfc),
            (nfd, nfd),
            (nfc, "PO\u{302}RTO"),
        ] {
            let n = names(&[(name, false)]);
            let text = format!("Fomos a {written} hoje.\n");
            let found: Vec<&str> = scan(&text, &n)
                .iter()
                .filter_map(|f| text.get(f.start..f.end))
                .collect();
            assert_eq!(found, [written], "{name:?} in {written:?}");
        }
        // An accent is still an accent, in either form: "Porto" is not
        // "Pôrto", and a mark after its last letter makes it "Portó".
        let n = names(&[("Porto", false)]);
        let text = "Po\u{302}rto, P\u{f4}rto, Porto\u{301}, Port\u{f3} e Porto.\n";
        let found: Vec<&str> = scan(text, &n)
            .iter()
            .filter_map(|f| text.get(f.start..f.end))
            .collect();
        assert_eq!(found, ["Porto"]);
    }
}
