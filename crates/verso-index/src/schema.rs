// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The tables. A version in `meta`; a different version means "rebuild":
//! the index is a cache (ADR 0011). Positions are stored next to every
//! construct because a block without a `^id` is cited by line and column
//! (ADR 0018).

use rusqlite::Connection;

pub(crate) const VERSION: i64 = 2;

/// FTS5 tokenizer (provisional, ADR 0046): `unicode61` with diacritics
/// removed on both the indexed text and the query, so `Café`, `cafe` and
/// `CAFÉ` match; no stemming, since pt-BR and EN would need two.
pub(crate) const TOKENIZER: &str = "unicode61 remove_diacritics 2";

const CREATE: &str = "
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE notes (
    id        INTEGER PRIMARY KEY,
    path      TEXT NOT NULL UNIQUE,
    path_key  TEXT NOT NULL,
    name_key  TEXT NOT NULL,
    title     TEXT,
    modified  INTEGER NOT NULL,
    len       INTEGER NOT NULL,
    hash      INTEGER NOT NULL,
    tags      TEXT NOT NULL DEFAULT '[]',
    aliases   TEXT NOT NULL DEFAULT '[]',
    frontmatter_ok INTEGER NOT NULL DEFAULT 1,
    -- ADR 0043: a placeholder keeps the last known version, marked as
    -- unverified (1); a note read from disk is verified (0).
    unverified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX notes_path_key ON notes(path_key);
CREATE INDEX notes_name_key ON notes(name_key);
CREATE TABLE headings (
    note  INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    text  TEXT NOT NULL,
    line  INTEGER NOT NULL, col INTEGER NOT NULL,
    start INTEGER NOT NULL, end INTEGER NOT NULL
);
CREATE INDEX headings_note ON headings(note);
CREATE TABLE blocks (
    note  INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    id    TEXT NOT NULL,
    line  INTEGER NOT NULL, col INTEGER NOT NULL,
    start INTEGER NOT NULL, end INTEGER NOT NULL
);
CREATE INDEX blocks_note ON blocks(note);
CREATE TABLE links (
    note       INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,            -- 'link' | 'embed'
    target     TEXT NOT NULL,            -- as written
    target_key TEXT NOT NULL,            -- folded (keys.rs)
    heading    TEXT, block TEXT, alias TEXT,
    line  INTEGER NOT NULL, col INTEGER NOT NULL,
    start INTEGER NOT NULL, end INTEGER NOT NULL
);
CREATE INDEX links_note ON links(note);
CREATE INDEX links_target_key ON links(target_key);
";

pub(crate) fn ensure(conn: &Connection) -> Result<(), rusqlite::Error> {
    let has_meta: bool = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
        [],
        |r| r.get::<_, i64>(0).map(|n| n > 0),
    )?;
    if has_meta {
        let version: Option<i64> = conn
            .query_row("SELECT value FROM meta WHERE key = 'schema'", [], |r| {
                r.get::<_, String>(0)
            })
            .ok()
            .and_then(|v| v.parse().ok());
        if version == Some(VERSION) {
            return Ok(());
        }
        conn.execute_batch(
            "DROP TABLE IF EXISTS notes_fts; DROP TABLE IF EXISTS links;
             DROP TABLE IF EXISTS blocks; DROP TABLE IF EXISTS headings;
             DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS meta;",
        )?;
    }
    conn.execute_batch(CREATE)?;
    conn.execute_batch(&format!(
        "CREATE VIRTUAL TABLE notes_fts USING fts5(path UNINDEXED, content, tokenize = '{TOKENIZER}');"
    ))?;
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('schema', ?1)",
        [VERSION.to_string()],
    )?;
    Ok(())
}
