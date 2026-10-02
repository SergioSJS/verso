// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The tables. A version and the tokenizer in `meta`; a different version
//! or tokenizer means "rebuild": the index is a cache (ADR 0011) — but for
//! version 6, which is carried over in place (`ensure`).
//! Positions are stored next to every construct because a block without
//! a `^id` is cited by line and column (ADR 0018). The full text lives
//! once, in `notes.content`; `notes_fts` is an external-content FTS5
//! table over it (memo §5.3), so a note's text is not stored twice.

use rusqlite::Connection;

pub(crate) const VERSION: i64 = 9;

/// FTS5 tokenizer (provisional, ADR 0046): `unicode61` with diacritics
/// removed on both the indexed text and the query, so `Café`, `cafe` and
/// `CAFÉ` match; no stemming, since pt-BR and EN would need two.
pub(crate) const TOKENIZER: &str = "unicode61 remove_diacritics 2";

const CREATE: &str = "
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE notes (
    id        INTEGER PRIMARY KEY,
    path      TEXT NOT NULL UNIQUE,
    kind      TEXT NOT NULL DEFAULT 'note', -- 'note' | 'canvas' (ADR 0057): a canvas is a link source
    path_key  TEXT NOT NULL,
    name_key  TEXT NOT NULL,
    dir       TEXT NOT NULL DEFAULT '',  -- folder of the note, '' at the root (keys.rs)
    title     TEXT,
    modified  INTEGER NOT NULL,
    len       INTEGER NOT NULL,
    hash      INTEGER NOT NULL,
    tags      TEXT NOT NULL DEFAULT '[]',
    aliases   TEXT NOT NULL DEFAULT '[]',
    frontmatter_ok INTEGER NOT NULL DEFAULT 1,
    url       TEXT,                       -- the `url` property, when the note is a web page
    content   TEXT NOT NULL DEFAULT '',
    -- ADR 0043: a placeholder keeps the last known version, marked as
    -- unverified (1); a note read from disk is verified (0).
    unverified INTEGER NOT NULL DEFAULT 0,
    sticker   TEXT,
    color     TEXT,
    banner    TEXT,
    banner_y  REAL,
    order_items TEXT,
    pinned_items TEXT
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
    kind       TEXT NOT NULL,            -- 'link' | 'embed' | 'file' (a canvas's file node: a path from the root, ADR 0057)
    target     TEXT NOT NULL,            -- as written
    target_key TEXT,                     -- folded (keys.rs); NULL: not a name, never resolves
    rel_key    TEXT,                     -- the target read from the source's folder, or NULL
    heading    TEXT, block TEXT, alias TEXT,
    relation   TEXT,                     -- the property's key, for a link a frontmatter property holds (spec Q10)
    line  INTEGER NOT NULL, col INTEGER NOT NULL,
    start INTEGER NOT NULL, end INTEGER NOT NULL
);
CREATE INDEX links_note ON links(note);
CREATE INDEX links_target_key ON links(target_key);
";

pub(crate) fn ensure(conn: &Connection) -> Result<(), rusqlite::Error> {
    let meta = |key: &str| -> Option<String> {
        conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| {
            r.get::<_, String>(0)
        })
        .ok()
    };
    let has_meta: bool = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
        [],
        |r| r.get::<_, i64>(0).map(|n| n > 0),
    )?;
    if has_meta
        && meta("schema").and_then(|v| v.parse().ok()) == Some(VERSION)
        && meta("tokenizer").as_deref() == Some(TOKENIZER)
    {
        return Ok(());
    }
    let has_column = |table: &str, col: &str| -> bool {
        conn.query_row(
            &format!("SELECT count(*) FROM pragma_table_info('{table}') WHERE name = ?1"),
            [col],
            |r| r.get::<_, i64>(0).map(|n| n > 0),
        )
        .unwrap_or(false)
    };
    // Version 6, 7 and 8 are carried over in place:
    // Version 6 had no kind on notes and no relation on links.
    // Version 7 added kind and relation, but had no label columns (sticker, color, banner, banner_y).
    // Version 8 added sticker, color, banner, banner_y.
    // Version 9 added order_items and pinned_items.
    if has_meta
        && matches!(
            meta("schema").and_then(|v| v.parse::<i64>().ok()),
            Some(6..=8)
        )
        && meta("tokenizer").as_deref() == Some(TOKENIZER)
    {
        let is_v6 = meta("schema").and_then(|v| v.parse::<i64>().ok()) == Some(6);
        conn.execute_batch("BEGIN;")?;
        if !has_column("notes", "kind") {
            conn.execute_batch("ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';")?;
        }
        if !has_column("links", "relation") {
            conn.execute_batch("ALTER TABLE links ADD COLUMN relation TEXT;")?;
        }
        if !has_column("notes", "sticker") {
            conn.execute_batch("ALTER TABLE notes ADD COLUMN sticker TEXT;")?;
        }
        if !has_column("notes", "color") {
            conn.execute_batch("ALTER TABLE notes ADD COLUMN color TEXT;")?;
        }
        if !has_column("notes", "banner") {
            conn.execute_batch("ALTER TABLE notes ADD COLUMN banner TEXT;")?;
        }
        if !has_column("notes", "banner_y") {
            conn.execute_batch("ALTER TABLE notes ADD COLUMN banner_y REAL;")?;
        }
        if !has_column("notes", "order_items") {
            conn.execute_batch("ALTER TABLE notes ADD COLUMN order_items TEXT;")?;
        }
        if !has_column("notes", "pinned_items") {
            conn.execute_batch("ALTER TABLE notes ADD COLUMN pinned_items TEXT;")?;
        }
        if is_v6 {
            conn.execute_batch("UPDATE notes SET modified = -1, len = -1 WHERE unverified = 0;")?;
        }
        conn.execute_batch("UPDATE meta SET value = '9' WHERE key = 'schema'; COMMIT;")?;
        return Ok(());
    }
    // Another version, another tokenizer, or a SQLite file that is not
    // ours: rebuild. `notes_fts` goes first, while `notes` still exists
    // for its external content; `IF EXISTS` covers a foreign file.
    conn.execute_batch(
        "DROP TABLE IF EXISTS notes_fts; DROP TABLE IF EXISTS links;
         DROP TABLE IF EXISTS blocks; DROP TABLE IF EXISTS headings;
         DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS meta;",
    )?;
    conn.execute_batch(CREATE)?;
    conn.execute_batch(&format!(
        "CREATE VIRTUAL TABLE notes_fts USING fts5(path UNINDEXED, title, content,
             content = 'notes', content_rowid = 'id', tokenize = '{TOKENIZER}');"
    ))?;
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('schema', ?1), ('tokenizer', ?2)",
        [VERSION.to_string(), TOKENIZER.to_owned()],
    )?;
    Ok(())
}
