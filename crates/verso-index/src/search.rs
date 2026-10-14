// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Full-text search over the notes' content. The feature 3 guardrail
//! (ADR 0029): every value goes in as a bound parameter, and the user's
//! words never reach FTS5's query grammar — each word is quoted as a
//! string, so `"`, `*`, `:`, `NOT`, `(` and the rest are text, not
//! operators.

use std::collections::HashMap;

use rusqlite::params;
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

use crate::{Index, IndexError};

/// One note that matched, with an excerpt around the first match.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hit {
    pub path: String,
    pub snippet: String,
}

/// The FTS5 MATCH expression for the user's words: each whitespace-separated
/// word becomes a quoted string with inner quotes doubled, and the words are
/// joined by AND (FTS5's implicit operator). Control characters are dropped
/// first: FTS5 reads the expression as a C string, so a NUL would end it
/// inside a quote and SQLite would answer with an error. Empty input gives
/// `None`.
#[must_use]
pub fn match_expression(query: &str) -> Option<String> {
    let words: Vec<String> = query
        .split_whitespace()
        .map(|w| w.chars().filter(|c| !c.is_control()).collect::<String>())
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{}\"", w.replace('"', "\"\"")))
        .collect();
    if words.is_empty() {
        None
    } else {
        Some(words.join(" "))
    }
}

/// A text as search compares it: accents dropped and case folded, as the
/// tokenizer does for the content (ADR 0046), control characters dropped
/// as [`match_expression`] does.
fn fold(s: &str) -> String {
    s.nfd()
        .filter(|c| !is_combining_mark(*c) && !c.is_control())
        .collect::<String>()
        .to_lowercase()
}

/// A file's name as the search compares it (the index's `name_fold`).
pub(crate) fn name_fold(path: &str) -> String {
    fold(stem(path))
}

/// A file's name without its folder and its extension: `RPG/Capitão
/// Ruy.md` → `Capitão Ruy`.
fn stem(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit_once('.').map_or(name, |(stem, _)| stem)
}

/// How well a folded name matches the folded words (`whole` is the words
/// joined by one space), lower first: the whole name, the name's start,
/// every word at the start of a word of the name, anywhere. `None` when a
/// word is missing from the name.
fn name_rank(name: &str, words: &[String], whole: &str) -> Option<u8> {
    if !words.iter().all(|w| name.contains(w.as_str())) {
        return None;
    }
    let starts = |w: &String| {
        name.split(|c: char| !c.is_alphanumeric())
            .any(|part| part.starts_with(w.as_str()))
    };
    Some(if name == whole {
        0
    } else if name.starts_with(whole) {
        1
    } else if words.iter().all(starts) {
        2
    } else {
        3
    })
}

/// Past this many names holding the words, the trigrams give way to the
/// scan of the folded names (measured with `verso-bench`, 2026-10-09).
const SELECTIVE: usize = 512;

/// The best `limit` names: a row `(path, name_fold)` joins the heap when it
/// ranks better than its worst, and only then is its path copied.
fn keep(
    best: &mut std::collections::BinaryHeap<(u8, usize, String)>,
    limit: usize,
    row: &rusqlite::Row<'_>,
    words: &[String],
    whole: &str,
) -> Result<(), rusqlite::Error> {
    let name = row.get_ref(1)?.as_str()?;
    let Some(rank) = name_rank(name, words, whole) else {
        return Ok(());
    };
    let len = name.chars().count();
    let path = row.get_ref(0)?.as_str()?;
    if best.len() >= limit
        && best
            .peek()
            .is_some_and(|w| (rank, len, path) >= (w.0, w.1, w.2.as_str()))
    {
        return Ok(());
    }
    best.push((rank, len, path.to_owned()));
    if best.len() > limit {
        best.pop();
    }
    Ok(())
}

impl Index {
    /// Notes found by `query`, at most `limit`: first those whose file
    /// name holds every word — the whole name, then its start, then the
    /// start of its words, then anywhere; shorter names first — then
    /// those whose title or content holds every word, best matches first.
    /// A note is found by its file name even when its first heading names
    /// it otherwise (the maintainer, 2026-10-09: "primeiramente pelo nome
    /// do arquivo e segundo pelo conteúdo"). Accents and case do not
    /// matter (tokenizer, ADR 0046, provisional). A note found by its name
    /// keeps the excerpt of its content when the content matched too.
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<Hit>, IndexError> {
        self.search_as(query, limit, false)
    }

    /// [`Index::search`] as a reader asks it (ADR 0087 item 6): the words
    /// looked for in the title and the public text only — never in the
    /// secret blocks' text, which the index holds apart — and each excerpt
    /// cut from the public text.
    pub fn reader_search(&self, query: &str, limit: usize) -> Result<Vec<Hit>, IndexError> {
        self.search_as(query, limit, true)
    }

    fn search_as(&self, query: &str, limit: usize, reader: bool) -> Result<Vec<Hit>, IndexError> {
        let Some(expr) = match_expression(query) else {
            return Ok(Vec::new());
        };
        // The columns: a reader's words never reach `secret`. The user's
        // words are still only quoted strings (feature 3 guardrail); the
        // column filter is ours.
        let expr = if reader {
            format!("{{title content}} : ({expr})")
        } else {
            expr
        };
        let words: Vec<String> = query
            .split_whitespace()
            .map(fold)
            .filter(|w| !w.is_empty())
            .collect();
        // The best `limit` names, kept in a heap whose top is the worst of
        // them: a folder where every name matches (a campaign's "Sessão
        // 001" to "Sessão 400") costs a comparison per row, not a copy.
        let mut best: std::collections::BinaryHeap<(u8, usize, String)> =
            std::collections::BinaryHeap::new();
        // The words of three letters or more find the names through their
        // trigrams — a word few names hold is answered from the index. A
        // word most names hold (every "Sessão 001" of a campaign), or only
        // short words (the first keys typed), go through the index of the
        // folded names, row by row, which costs less than the trigrams for
        // them. The rank needs every word.
        let long: Vec<String> = words
            .iter()
            .filter(|w| w.chars().count() >= 3)
            .map(|w| format!("\"{}\"", w.replace('"', "\"\"")))
            .collect();
        if let Some(longest) = words.iter().max_by_key(|w| w.len()) {
            let whole = words.join(" ");
            let mut scan = long.is_empty();
            if !scan {
                let mut st = self
                    .conn
                    .prepare("SELECT path, name_fold FROM names_fts WHERE names_fts MATCH ?1")?;
                let mut rows = st.query([long.join(" ")])?;
                let mut seen = 0usize;
                while let Some(row) = rows.next()? {
                    seen += 1;
                    if seen > SELECTIVE {
                        best.clear();
                        scan = true;
                        break;
                    }
                    keep(&mut best, limit, row, &words, &whole)?;
                }
            }
            if scan {
                let mut st = self.conn.prepare(
                    "SELECT path, name_fold FROM notes INDEXED BY notes_name_fold
                     WHERE instr(name_fold, ?1) > 0",
                )?;
                let mut rows = st.query([longest])?;
                while let Some(row) = rows.next()? {
                    keep(&mut best, limit, row, &words, &whole)?;
                }
            }
        }
        let named = best.into_sorted_vec();
        // A reader's excerpt from the public text (column 2), whatever
        // matched; anyone else's from the column that matched best.
        let column = if reader { 2 } else { -1 };
        let mut st = self.conn.prepare(&format!(
            "SELECT path, snippet(notes_fts, {column}, '[', ']', '…', 12)
             FROM notes_fts WHERE notes_fts MATCH ?1
             ORDER BY rank LIMIT ?2"
        ))?;
        // `limit` rows are enough: at most as many as were named are named
        // again, and those places are taken already.
        let rows = st.query_map(
            params![expr, i64::try_from(limit).unwrap_or(i64::MAX)],
            |r| {
                Ok(Hit {
                    path: r.get(0)?,
                    snippet: r.get(1)?,
                })
            },
        )?;
        let by_content: Vec<Hit> = rows.collect::<Result<_, _>>()?;
        let mut snippets: HashMap<&str, &str> = by_content
            .iter()
            .map(|h| (h.path.as_str(), h.snippet.as_str()))
            .collect();
        let mut hits: Vec<Hit> = named
            .iter()
            .map(|(_, _, path)| Hit {
                path: path.clone(),
                snippet: snippets
                    .remove(path.as_str())
                    .unwrap_or_default()
                    .to_owned(),
            })
            .collect();
        let shown: std::collections::HashSet<&str> =
            named.iter().map(|(_, _, p)| p.as_str()).collect();
        hits.extend(
            by_content
                .iter()
                .filter(|h| !shown.contains(h.path.as_str()))
                .cloned(),
        );
        hits.truncate(limit);
        Ok(hits)
    }
}

impl Index {
    /// The notes whose text holds `phrase` — its words in a row, accents
    /// and case folded as the search folds them — at most `limit`: the
    /// candidates of a note's unlinked mentions (ADR 0089 item 1), which
    /// the core then reads and scans for the name as written. The phrase
    /// goes in as one FTS5 string, bound, its quotes doubled: never the
    /// grammar (feature 3 guardrail). A phrase with no letter or digit
    /// holds no word the index knows: none.
    pub fn notes_holding(&self, phrase: &str, limit: usize) -> Result<Vec<String>, IndexError> {
        let clean: String = phrase.chars().filter(|c| !c.is_control()).collect();
        if !clean.chars().any(char::is_alphanumeric) {
            return Ok(Vec::new());
        }
        let expr = format!("\"{}\"", clean.replace('"', "\"\""));
        let mut st = self
            .conn
            .prepare("SELECT path FROM notes_fts WHERE notes_fts MATCH ?1 LIMIT ?2")?;
        let rows = st.query_map(
            params![expr, i64::try_from(limit).unwrap_or(i64::MAX)],
            |r| r.get(0),
        )?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_are_strings_not_operators() {
        assert_eq!(
            match_expression("barão vermelho").as_deref(),
            Some("\"barão\" \"vermelho\"")
        );
        assert_eq!(match_expression("a\"b").as_deref(), Some("\"a\"\"b\""));
        assert_eq!(
            match_expression("NOT OR AND").as_deref(),
            Some("\"NOT\" \"OR\" \"AND\"")
        );
        assert_eq!(
            match_expression("x* col:y (z)").as_deref(),
            Some("\"x*\" \"col:y\" \"(z)\"")
        );
        assert_eq!(match_expression("   "), None);
        assert_eq!(
            match_expression("ca\u{0}fe \u{1}").as_deref(),
            Some("\"cafe\"")
        );
        assert_eq!(match_expression("\u{0}"), None);
    }

    #[test]
    fn a_name_is_ranked_by_how_much_of_it_the_words_cover() {
        let w = |q: &str| q.split_whitespace().map(fold).collect::<Vec<_>>();
        let rank = |name: &str, q: &str| name_rank(name, &w(q), &w(q).join(" "));
        assert_eq!(stem("RPG/Capitão Ruy.md"), "Capitão Ruy");
        assert_eq!(stem("Tour do Verso.canvas"), "Tour do Verso");
        assert_eq!(stem("sem extensão"), "sem extensão");
        let name = fold("Capitão Ruy");
        assert_eq!(rank(&name, "capitao ruy"), Some(0));
        assert_eq!(rank(&name, "CAPITÃO"), Some(1));
        assert_eq!(rank(&name, "ruy cap"), Some(2));
        assert_eq!(rank(&name, "pitão"), Some(3));
        assert_eq!(rank(&name, "ruy navio"), None);
    }
}
