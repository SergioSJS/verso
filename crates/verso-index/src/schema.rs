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

pub(crate) const VERSION: i64 = 12;

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
    pinned_items TEXT,
    type      TEXT,                       -- the frontmatter's `type`, when it is one text, as written (ADR 0052)
    type_key  TEXT,                       -- the same, folded as Q12 folds a note's name
    -- When the row was last known to match the disk: the start of the index
    -- run that read the note (seconds), 0 when written outside a run. A note
    -- modified at least 2 s before it is trusted by its modified time and
    -- length alone, without reading it (as git trusts its index).
    indexed_at INTEGER NOT NULL DEFAULT 0
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
    start INTEGER NOT NULL, end INTEGER NOT NULL,
    first_line INTEGER, last_line INTEGER  -- the block the id names (spec Q3, Q21)
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
CREATE TABLE IF NOT EXISTS schemas (     -- the `verso-schema` blocks of a note (ADR 0052)
    note     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    name     TEXT,                       -- the `type` it declares, when it was read
    name_key TEXT,                       -- folded as `notes.type_key`
    nested   INTEGER NOT NULL,           -- 1: inside a list or a quote, not read
    error    TEXT,                       -- why a block at the top level types nothing
    line  INTEGER NOT NULL, col INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS schemas_note ON schemas(note);
CREATE INDEX IF NOT EXISTS schemas_name_key ON schemas(name_key);
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
    // Versions 6 to 10 are carried over in place, not rebuilt: for a note
    // iCloud has evicted, its row is the only local copy of its text and
    // links (ADR 0043), and a rebuild would lose it (decided by the
    // maintainer on 2026-10-01, review `board.md` §6 item 7, for version 6;
    // the same holds for every later one). The columns a version lacks are
    // added — 7 the kind and the relation, 8 and 9 the labels, the order
    // and the pins (ADR 0060), 10 the type and the schemas (ADR 0052), 11
    // the lines of the block a `^id` names (spec Q3, Q21), 12 when a row
    // was last known to match the disk —
    // and every note read from disk is read
    // again on the next walk, for what the new columns hold; a placeholder
    // keeps what it had.
    if has_meta
        && matches!(
            meta("schema").and_then(|v| v.parse::<i64>().ok()),
            Some(6..=11)
        )
        && meta("tokenizer").as_deref() == Some(TOKENIZER)
    {
        conn.execute_batch("BEGIN;")?;
        if let Err(e) = carry_over(conn) {
            // Nothing half done stays: the transaction goes, the error is
            // the caller's.
            let _ = conn.execute_batch("ROLLBACK;");
            return Err(e);
        }
        return conn.execute_batch("COMMIT;");
    }
    // Another version, another tokenizer, or a SQLite file that is not
    // ours: rebuild. `notes_fts` goes first, while `notes` still exists
    // for its external content; `IF EXISTS` covers a foreign file.
    conn.execute_batch(
        "DROP TABLE IF EXISTS notes_fts; DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS schemas;
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

/// The columns a version 6 to 11 index lacks, added in place, and every
/// note read from disk marked to be read again; inside the caller's
/// transaction.
fn carry_over(conn: &Connection) -> Result<(), rusqlite::Error> {
    let has_column = |table: &str, col: &str| -> Result<bool, rusqlite::Error> {
        conn.query_row(
            &format!("SELECT count(*) FROM pragma_table_info('{table}') WHERE name = ?1"),
            [col],
            |r| r.get::<_, i64>(0).map(|n| n > 0),
        )
    };
    for (table, col, decl) in [
        ("notes", "kind", "TEXT NOT NULL DEFAULT 'note'"),
        ("links", "relation", "TEXT"),
        ("notes", "sticker", "TEXT"),
        ("notes", "color", "TEXT"),
        ("notes", "banner", "TEXT"),
        ("notes", "banner_y", "REAL"),
        ("notes", "order_items", "TEXT"),
        ("notes", "pinned_items", "TEXT"),
        ("notes", "type", "TEXT"),
        ("notes", "type_key", "TEXT"),
        ("blocks", "first_line", "INTEGER"),
        ("blocks", "last_line", "INTEGER"),
        ("notes", "indexed_at", "INTEGER NOT NULL DEFAULT 0"),
    ] {
        if !has_column(table, col)? {
            conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {col} {decl};"))?;
        }
    }
    // Version 10's table, created empty: the walk that reads every note
    // again fills it.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schemas (
             note INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
             name TEXT, name_key TEXT, nested INTEGER NOT NULL, error TEXT,
             line INTEGER NOT NULL, col INTEGER NOT NULL);
         CREATE INDEX IF NOT EXISTS schemas_note ON schemas(note);
         CREATE INDEX IF NOT EXISTS schemas_name_key ON schemas(name_key);",
    )?;
    conn.execute_batch(
        "UPDATE notes SET modified = -1, len = -1 WHERE unverified = 0;
         UPDATE meta SET value = '12' WHERE key = 'schema';",
    )
}
