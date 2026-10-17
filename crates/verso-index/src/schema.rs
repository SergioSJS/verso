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

pub(crate) const VERSION: i64 = 15;

/// FTS5 tokenizer (provisional, ADR 0046): `unicode61` with diacritics
/// removed on both the indexed text and the query, so `Café`, `cafe` and
/// `CAFÉ` match; no stemming, since pt-BR and EN would need two.
pub(crate) const TOKENIZER: &str = "unicode61 remove_diacritics 2";

/// The file names, searched by any part of them: an FTS5 index of their
/// trigrams (version 14), holding the path and the folded name itself —
/// read from `notes`, the name sits after the note's text in the row, and
/// each hit would walk through that text. Kept in step with `notes` by
/// triggers, so that no write of a row can forget it.
const NAMES: &str = "
CREATE VIRTUAL TABLE IF NOT EXISTS names_fts USING fts5(path UNINDEXED, name_fold,
    tokenize = 'trigram');
CREATE TRIGGER IF NOT EXISTS notes_names_insert AFTER INSERT ON notes BEGIN
    INSERT INTO names_fts (rowid, path, name_fold) VALUES (new.id, new.path, new.name_fold);
END;
CREATE TRIGGER IF NOT EXISTS notes_names_delete AFTER DELETE ON notes BEGIN
    DELETE FROM names_fts WHERE rowid = old.id;
END;
CREATE TRIGGER IF NOT EXISTS notes_names_update AFTER UPDATE OF path, name_fold ON notes BEGIN
    DELETE FROM names_fts WHERE rowid = old.id;
    INSERT INTO names_fts (rowid, path, name_fold) VALUES (new.id, new.path, new.name_fold);
END;
";
/// What the full-text index reads of a note (version 15, ADR 0087 item
/// 6): its public text — the note itself when it has no secret block —
/// and its secret blocks' text, apart, so that a reader's query asks the
/// first column only and its excerpts are cut from the public text.
const TEXTS: &str = "
CREATE VIEW IF NOT EXISTS notes_text AS
    SELECT id, path, title, COALESCE(public, content) AS content, COALESCE(secret, '') AS secret
    FROM notes;
";

/// The full-text index over [`TEXTS`]: external content, so a note's text
/// is not stored twice (memo §5.3).
fn fts() -> String {
    format!(
        "CREATE VIRTUAL TABLE notes_fts USING fts5(path UNINDEXED, title, content, secret,
             content = 'notes_text', content_rowid = 'id', tokenize = '{TOKENIZER}');"
    )
}

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
    -- The start of the index run that last read the note (seconds), 0 when
    -- written outside a run. Trust by stat goes by `meta.verified_from`,
    -- one date for the whole index (version 13), not by this column.
    indexed_at INTEGER NOT NULL DEFAULT 0,
    -- The file name as the search compares it, without folder, extension,
    -- accents or case (version 14, `search::name_fold`).
    name_fold TEXT NOT NULL DEFAULT '',
    -- A note's secret blocks (ADR 0087 item 6, version 15): NULL when it
    -- has none. `public` is the note as a reader receives it, `secret`
    -- the blocks' own text, searched apart; `hidden` their lines,
    -- `first-last,...`, by which a reader's positions are numbered.
    public    TEXT,
    secret    TEXT,
    hidden    TEXT,
    -- What a reader knows of the note: the hash and length of its public
    -- text, and when that last changed as the index saw it (a change only
    -- inside a secret block is none). NULL: as the note's own.
    public_hash INTEGER,
    public_len  INTEGER,
    public_modified INTEGER
);
CREATE INDEX notes_path_key ON notes(path_key);
CREATE INDEX notes_name_key ON notes(name_key);
CREATE INDEX notes_stat ON notes(path, modified, len, hash, unverified);
CREATE INDEX notes_name_fold ON notes(name_fold, path);
CREATE TABLE headings (
    note  INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    text  TEXT NOT NULL,
    line  INTEGER NOT NULL, col INTEGER NOT NULL,
    start INTEGER NOT NULL, end INTEGER NOT NULL,
    secret INTEGER NOT NULL DEFAULT 0      -- inside a secret block (ADR 0087 item 6)
);
CREATE INDEX headings_note ON headings(note);
CREATE TABLE blocks (
    note  INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    id    TEXT NOT NULL,
    line  INTEGER NOT NULL, col INTEGER NOT NULL,
    start INTEGER NOT NULL, end INTEGER NOT NULL,
    first_line INTEGER, last_line INTEGER, -- the block the id names (spec Q3, Q21)
    secret INTEGER NOT NULL DEFAULT 0      -- inside a secret block (ADR 0087 item 6)
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
    start INTEGER NOT NULL, end INTEGER NOT NULL,
    secret INTEGER NOT NULL DEFAULT 0      -- inside a secret block (ADR 0087 item 6)
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
    // keeps what it had. 13 adds an index and reads nothing again; 14 the
    // file name as the search compares it, computed from the path, and
    // reads nothing again either.
    if has_meta
        && matches!(
            meta("schema").and_then(|v| v.parse::<i64>().ok()),
            Some(6..=14)
        )
        && meta("tokenizer").as_deref() == Some(TOKENIZER)
    {
        conn.execute_batch("BEGIN;")?;
        let from = meta("schema")
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        if let Err(e) = carry_over(conn, from) {
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
        "DROP TABLE IF EXISTS notes_fts; DROP TABLE IF EXISTS names_fts; DROP VIEW IF EXISTS notes_text;
         DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS schemas;
         DROP TABLE IF EXISTS blocks; DROP TABLE IF EXISTS headings;
         DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS meta;",
    )?;
    conn.execute_batch(CREATE)?;
    conn.execute_batch(TEXTS)?;
    conn.execute_batch(&fts())?;
    conn.execute_batch(NAMES)?;
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('schema', ?1), ('tokenizer', ?2)",
        [VERSION.to_string(), TOKENIZER.to_owned()],
    )?;
    Ok(())
}

/// The columns a version 6 to 12 index lacks, added in place, and — below
/// version 12 — every note read from disk marked to be read again; inside
/// the caller's transaction. Version 13 adds only indexes: nothing is read
/// again for it.
fn carry_over(conn: &Connection, from: i64) -> Result<(), rusqlite::Error> {
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
        ("notes", "name_fold", "TEXT NOT NULL DEFAULT ''"),
        ("notes", "public", "TEXT"),
        ("notes", "secret", "TEXT"),
        ("notes", "hidden", "TEXT"),
        ("notes", "public_hash", "INTEGER"),
        ("notes", "public_len", "INTEGER"),
        ("notes", "public_modified", "INTEGER"),
        ("headings", "secret", "INTEGER NOT NULL DEFAULT 0"),
        ("blocks", "secret", "INTEGER NOT NULL DEFAULT 0"),
        ("links", "secret", "INTEGER NOT NULL DEFAULT 0"),
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
    // Version 13: what each note's stat check reads, in an index of its
    // own — `unverified` sits after `content` in a row, so read from the
    // table it costs a walk through the whole text of the note — and the
    // date a note must be older than to be trusted, one for the whole
    // index (`meta.verified_from`, written by a complete run).
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS notes_stat ON notes(path, modified, len, hash, unverified);",
    )?;
    // Version 14: the searched name, from each row's path — the index
    // holds the name and the path, so a search reads neither the table nor
    // the text of a note.
    if from < 14 {
        let rows: Vec<(i64, String)> = {
            let mut st = conn.prepare("SELECT id, path FROM notes")?;
            st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<Result<_, _>>()?
        };
        let mut set = conn.prepare("UPDATE notes SET name_fold = ?1 WHERE id = ?2")?;
        for (id, path) in rows {
            set.execute(rusqlite::params![crate::search::name_fold(&path), id])?;
        }
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS notes_name_fold ON notes(name_fold, path);",
        )?;
        conn.execute_batch(NAMES)?;
        conn.execute_batch(
            "DELETE FROM names_fts;
             INSERT INTO names_fts (rowid, path, name_fold) SELECT id, path, name_fold FROM notes;",
        )?;
    }
    // Version 15: each row's secret blocks found in the text it holds —
    // a placeholder's is the only copy (ADR 0043), so it is not left to a
    // walk — its links, headings and ids inside them flagged, and the
    // full-text index made again over the public and the secret text.
    if from < 15 {
        crate::secret::carry_over(conn)?;
        conn.execute_batch("DROP TABLE IF EXISTS notes_fts;")?;
        conn.execute_batch(TEXTS)?;
        conn.execute_batch(&fts())?;
        conn.execute_batch("INSERT INTO notes_fts (notes_fts) VALUES ('rebuild');")?;
    }
    if from < 12 {
        conn.execute_batch("UPDATE notes SET modified = -1, len = -1 WHERE unverified = 0;")?;
    }
    conn.execute(
        "UPDATE meta SET value = ?1 WHERE key = 'schema'",
        [VERSION.to_string()],
    )?;
    Ok(())
}
