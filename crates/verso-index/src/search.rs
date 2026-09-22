// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Full-text search over the notes' content. The feature 3 guardrail
//! (ADR 0029): every value goes in as a bound parameter, and the user's
//! words never reach FTS5's query grammar — each word is quoted as a
//! string, so `"`, `*`, `:`, `NOT`, `(` and the rest are text, not
//! operators.

use rusqlite::params;

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

impl Index {
    /// Notes whose title or content contains every word of `query`, best
    /// matches first, at most `limit`. The title is the first heading or
    /// the file name, so a note is found by its name as in Obsidian.
    /// Accents and case do not matter (tokenizer, ADR 0046, provisional).
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<Hit>, IndexError> {
        let Some(expr) = match_expression(query) else {
            return Ok(Vec::new());
        };
        let mut st = self.conn.prepare(
            "SELECT path, snippet(notes_fts, -1, '[', ']', '…', 12)
             FROM notes_fts WHERE notes_fts MATCH ?1
             ORDER BY rank LIMIT ?2",
        )?;
        let rows = st.query_map(
            params![expr, i64::try_from(limit).unwrap_or(i64::MAX)],
            |r| {
                Ok(Hit {
                    path: r.get(0)?,
                    snippet: r.get(1)?,
                })
            },
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
}
