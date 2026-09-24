// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Putting a parsed note into the index and asking the graph questions:
//! outgoing links, backlinks, unresolved targets.

use rusqlite::{OptionalExtension, params};
use verso_dialect::{Document, Value};

use crate::keys::{dir_of, note_keys, relative_key, target_key};
use crate::{Index, IndexError};

/// What was on disk when the note was read, as `verso-fs` reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NoteStamp {
    /// Seconds since the Unix epoch.
    pub modified: i64,
    pub len: u64,
    pub hash: u64,
}

/// A link of a note, as stored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Link {
    pub embed: bool,
    pub target: String,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub alias: Option<String>,
    pub line: u32,
    pub col: u32,
    /// The note the target resolves to, or `None` if unresolved.
    pub resolved: Option<String>,
}

/// A note that links to the one asked about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Backlink {
    pub from: String,
    pub target: String,
    pub embed: bool,
    pub line: u32,
    pub col: u32,
}

/// A heading of a note, with its position (ADR 0018: cited by line and
/// column when the block has no `^id`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Heading {
    pub level: u32,
    pub text: String,
    pub line: u32,
    pub col: u32,
}

/// A `^id` block of a note, with the position of the id.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Block {
    pub id: String,
    pub line: u32,
    pub col: u32,
}

/// A target no note answers to, with how many links name it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Unresolved {
    pub target: String,
    pub count: u64,
}

/// The SQL that resolves a target key to a note id: a path from the root
/// first, then a name; several of either → the first by path order in
/// byte order (observed in Obsidian for names; provisional). An empty
/// target (`[[#Heading]]`, `[[^id]]`) names the note itself (provisional:
/// not a missing file, spec Q14). Used inside the queries below, where
/// `l` is the `links` row.
const RESOLVE: &str = "CASE
    WHEN l.target_key IS NULL THEN NULL
    WHEN l.target_key = '' THEN l.note
    ELSE COALESCE(
        (SELECT id FROM notes WHERE path_key = l.target_key ORDER BY path LIMIT 1),
        (SELECT id FROM notes WHERE path_key = l.rel_key ORDER BY path LIMIT 1),
        (SELECT n.id FROM notes n JOIN notes s ON s.id = l.note
         WHERE n.name_key = l.target_key
         ORDER BY CASE WHEN s.dir = '' OR substr(n.path, 1, length(s.dir) + 1) = s.dir || '/'
                       THEN 0 ELSE 1 END,
                  length(n.path) - length(replace(n.path, '/', '')),
                  n.path
         LIMIT 1)
    ) END";

/// Remove a note's row from `notes_fts` (external content: FTS5 needs the
/// old values to drop its tokens) and from `notes`. Returns whether there
/// was one.
fn forget(tx: &rusqlite::Transaction<'_>, relative: &str) -> Result<bool, IndexError> {
    let old: Option<(i64, Option<String>, String)> = tx
        .query_row(
            "SELECT id, title, content FROM notes WHERE path = ?1",
            params![relative],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    let Some((id, title, content)) = old else {
        return Ok(false);
    };
    tx.execute(
        "INSERT INTO notes_fts (notes_fts, rowid, path, title, content) VALUES ('delete', ?1, ?2, ?3, ?4)",
        params![id, relative, title, content],
    )?;
    tx.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
    Ok(true)
}

impl Index {
    /// Store a note's report, replacing what the index had for that path.
    pub fn upsert(
        &mut self,
        relative: &str,
        stamp: NoteStamp,
        content: &str,
        report: &Document,
    ) -> Result<(), IndexError> {
        let (path_key, name_key) = note_keys(relative);
        let title = report
            .headings
            .iter()
            .find(|h| h.level == 1)
            .map(|h| h.text.clone())
            .unwrap_or_else(|| {
                let name = relative.rsplit('/').next().unwrap_or(relative);
                name.strip_suffix(".md").unwrap_or(name).to_owned()
            });
        let (tags, aliases, frontmatter_ok, url) =
            match report.frontmatter.as_ref().map(|f| &f.values) {
                Some(Ok(Value::Mapping(map))) => (
                    strings_of(map, "tags"),
                    strings_of(map, "aliases"),
                    true,
                    strings_of(map, "url")
                        .into_iter()
                        .find(|u| u.starts_with("http://") || u.starts_with("https://")),
                ),
                Some(Ok(_)) | None => (Vec::new(), Vec::new(), true, None),
                Some(Err(_)) => (Vec::new(), Vec::new(), false, None),
            };
        let tx = self.conn.transaction()?;
        forget(&tx, relative)?;
        tx.execute(
            "INSERT INTO notes (path, path_key, name_key, dir, title, modified, len, hash, tags, aliases, frontmatter_ok, unverified, content, url)
             VALUES (?1, ?2, ?3, ?12, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?13)",
            params![
                relative,
                path_key,
                name_key,
                title,
                stamp.modified,
                i64::try_from(stamp.len).unwrap_or(i64::MAX),
                // Stored as the two's-complement of the u64: SQLite integers
                // are i64. Little-endian, so the file stays portable.
                i64::from_le_bytes(stamp.hash.to_le_bytes()),
                json_list(&tags),
                json_list(&aliases),
                frontmatter_ok,
                content,
                dir_of(relative),
                url,
            ],
        )?;
        let note = tx.last_insert_rowid();
        {
            let mut ins = tx.prepare(
                "INSERT INTO headings (note, level, text, line, col, start, end) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )?;
            for h in &report.headings {
                ins.execute(params![
                    note,
                    h.level,
                    h.text,
                    h.pos.line,
                    h.pos.col,
                    offset(h.span.start),
                    offset(h.span.end)
                ])?;
            }
        }
        {
            let mut ins = tx.prepare(
                "INSERT INTO blocks (note, id, line, col, start, end) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )?;
            for b in &report.blocks {
                ins.execute(params![
                    note,
                    b.id,
                    b.pos.line,
                    b.pos.col,
                    offset(b.span.start),
                    offset(b.span.end)
                ])?;
            }
        }
        {
            let mut ins = tx.prepare(
                "INSERT INTO links (note, kind, target, target_key, rel_key, heading, block, alias, line, col, start, end)
                 VALUES (?1, ?2, ?3, ?4, ?12, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            )?;
            for l in &report.links {
                ins.execute(params![
                    note,
                    "link",
                    l.target,
                    target_key(&l.target),
                    l.heading,
                    l.block,
                    l.alias,
                    l.pos.line,
                    l.pos.col,
                    offset(l.span.start),
                    offset(l.span.end),
                    relative_key(relative, &l.target)
                ])?;
            }
            for e in &report.embeds {
                ins.execute(params![
                    note,
                    "embed",
                    e.target,
                    target_key(&e.target),
                    e.heading,
                    e.block,
                    e.alias,
                    e.pos.line,
                    e.pos.col,
                    offset(e.span.start),
                    offset(e.span.end),
                    relative_key(relative, &e.target)
                ])?;
            }
        }
        // External content: the row id ties the tokens to `notes.id`.
        tx.execute(
            "INSERT INTO notes_fts (rowid, path, title, content) VALUES (?1, ?2, ?3, ?4)",
            params![note, relative, title, content],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// A placeholder stands where the note is (ADR 0043): the last known
    /// version stays, marked unverified; a note never seen before gets an
    /// empty, unverified row — in `notes` and, as an empty document, in
    /// `notes_fts` — so that links to it resolve and its path is known.
    /// Returns whether the note was already known.
    pub fn mark_placeholder(&mut self, relative: &str) -> Result<bool, IndexError> {
        let tx = self.conn.transaction()?;
        let known = tx.execute(
            "UPDATE notes SET unverified = 1 WHERE path = ?1",
            params![relative],
        )?;
        if known > 0 {
            tx.commit()?;
            return Ok(true);
        }
        let (path_key, name_key) = note_keys(relative);
        let title = relative
            .rsplit('/')
            .next()
            .unwrap_or(relative)
            .trim_end_matches(".md")
            .to_owned();
        tx.execute(
            "INSERT INTO notes (path, path_key, name_key, dir, title, modified, len, hash, unverified)
             VALUES (?1, ?2, ?3, ?5, ?4, 0, 0, 0, 1)",
            params![relative, path_key, name_key, title, dir_of(relative)],
        )?;
        // External content: `notes_fts` only knows the rows it was told
        // about, and the next `forget` will tell it to delete this one.
        // An empty document keeps the two tables in step; the transaction
        // keeps them in step even if this second insert fails.
        let id = tx.last_insert_rowid();
        tx.execute(
            "INSERT INTO notes_fts (rowid, path, title, content) VALUES (?1, ?2, ?3, '')",
            params![id, relative, title],
        )?;
        tx.commit()?;
        Ok(false)
    }

    /// Whether the index holds a note only as an unverified last version
    /// (a placeholder stood where it was), `None` if unknown.
    pub fn is_unverified(&self, relative: &str) -> Result<Option<bool>, IndexError> {
        Ok(self
            .conn
            .query_row(
                "SELECT unverified FROM notes WHERE path = ?1",
                params![relative],
                |r| r.get::<_, i64>(0).map(|v| v != 0),
            )
            .optional()?)
    }

    /// Record which folder this index is for and when it was last brought
    /// up to date (seconds since the epoch), in the file itself: no
    /// sidecar, one file per folder.
    pub fn set_root(&mut self, root: &str, indexed_at: i64) -> Result<(), IndexError> {
        self.conn.execute(
            "INSERT INTO meta (key, value) VALUES ('root', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![root],
        )?;
        self.conn.execute(
            "INSERT INTO meta (key, value) VALUES ('indexed_at', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![indexed_at.to_string()],
        )?;
        Ok(())
    }

    /// The folder this index is for, if recorded.
    pub fn root(&self) -> Result<Option<String>, IndexError> {
        Ok(self
            .conn
            .query_row("SELECT value FROM meta WHERE key = 'root'", [], |r| {
                r.get(0)
            })
            .optional()?)
    }

    /// Forget a note (deleted or moved away). Its links go with it; links
    /// to it from other notes become unresolved.
    pub fn remove(&mut self, relative: &str) -> Result<bool, IndexError> {
        let tx = self.conn.transaction()?;
        let known = forget(&tx, relative)?;
        tx.commit()?;
        Ok(known)
    }

    /// The notes that are web pages — a `url` property — with the address.
    pub fn web_notes(&self) -> Result<Vec<(String, String)>, IndexError> {
        let mut st = self
            .conn
            .prepare("SELECT path, url FROM notes WHERE url IS NOT NULL ORDER BY path")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Every resolved link of the vault as a pair of paths, source then
    /// target, once each: the whole graph.
    pub fn graph(&self) -> Result<Vec<(String, String)>, IndexError> {
        let sql = format!(
            "SELECT DISTINCT n.path, t.path
             FROM links l JOIN notes n ON n.id = l.note
             JOIN notes t ON t.id = {RESOLVE}
             WHERE l.target_key IS NOT NULL
             ORDER BY n.path, t.path"
        );
        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Every tag of the vault with the notes that carry it: frontmatter
    /// `tags` (as the index stored them) and `#tag` in the body, by the
    /// one rule the reader marks them with (`verso_dialect::body_tags`:
    /// prose only — not code, not a link, not the frontmatter's own text,
    /// not a comment). Tags are folded to lower case; the list is by count,
    /// then name. What a tag is (spec Q13) and its charset and case (Q22)
    /// are this rule, which both sides apply.
    pub fn tags(&self) -> Result<Vec<(String, Vec<String>)>, IndexError> {
        let mut st = self
            .conn
            .prepare("SELECT path, tags, content FROM notes ORDER BY path")?;
        let rows = st.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?;
        let mut by_tag: std::collections::BTreeMap<String, Vec<String>> =
            std::collections::BTreeMap::new();
        for row in rows {
            let (path, tags_json, content) = row?;
            let mut found: Vec<String> = json_strings(&tags_json)
                .into_iter()
                .map(|t| t.trim_start_matches('#').to_lowercase())
                .collect();
            found.extend(
                verso_dialect::body_tags(&content)
                    .into_iter()
                    .map(|t| t.name.to_lowercase()),
            );
            found.sort();
            found.dedup();
            for t in found {
                if !t.is_empty() {
                    by_tag.entry(t).or_default().push(path.clone());
                }
            }
        }
        let mut out: Vec<(String, Vec<String>)> = by_tag.into_iter().collect();
        out.sort_by(|a, b| b.1.len().cmp(&a.1.len()).then_with(|| a.0.cmp(&b.0)));
        Ok(out)
    }

    /// Is the index whole? Two checks on `notes_fts`, whose content lives
    /// in `notes` (external content). FTS5's own `integrity-check` proves
    /// the full-text index agrees with what it was given; it cannot see a
    /// note it was never given, so the second check counts documents:
    /// FTS5 keeps one row per document in its `_docsize` shadow table, and
    /// that count has to equal the notes. A note without its FTS document
    /// is the corruption a placeholder once caused (ADR 0043): harmless
    /// until the next `forget`, fatal then (`SQLITE_CORRUPT_VTAB`).
    pub fn check(&self) -> Result<(), IndexError> {
        self.conn.execute(
            "INSERT INTO notes_fts (notes_fts) VALUES ('integrity-check')",
            [],
        )?;
        let (notes, documents): (i64, i64) = self.conn.query_row(
            "SELECT (SELECT count(*) FROM notes), (SELECT count(*) FROM notes_fts_docsize)",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        if notes != documents {
            return Err(IndexError::Corrupt(format!(
                "{notes} notes but {documents} full-text documents"
            )));
        }
        Ok(())
    }

    /// The stamp the index has for a note, to skip an unchanged file.
    pub fn stamp_of(&self, relative: &str) -> Result<Option<NoteStamp>, IndexError> {
        Ok(self
            .conn
            .query_row(
                "SELECT modified, len, hash FROM notes WHERE path = ?1",
                params![relative],
                |r| {
                    Ok(NoteStamp {
                        modified: r.get(0)?,
                        len: u64::try_from(r.get::<_, i64>(1)?).unwrap_or(0),
                        hash: u64::from_le_bytes(r.get::<_, i64>(2)?.to_le_bytes()),
                    })
                },
            )
            .optional()?)
    }

    /// Every note path, in path order.
    pub fn notes(&self) -> Result<Vec<String>, IndexError> {
        let mut st = self.conn.prepare("SELECT path FROM notes ORDER BY path")?;
        let rows = st.query_map([], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// The headings of a note, in document order.
    pub fn headings_of(&self, relative: &str) -> Result<Vec<Heading>, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT h.level, h.text, h.line, h.col FROM headings h
             JOIN notes n ON n.id = h.note WHERE n.path = ?1 ORDER BY h.start",
        )?;
        let rows = st.query_map(params![relative], |r| {
            Ok(Heading {
                level: r.get(0)?,
                text: r.get(1)?,
                line: r.get(2)?,
                col: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// The `^id` blocks of a note, in document order.
    pub fn blocks_of(&self, relative: &str) -> Result<Vec<Block>, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT b.id, b.line, b.col FROM blocks b
             JOIN notes n ON n.id = b.note WHERE n.path = ?1 ORDER BY b.start",
        )?;
        let rows = st.query_map(params![relative], |r| {
            Ok(Block {
                id: r.get(0)?,
                line: r.get(1)?,
                col: r.get(2)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// The links a note makes, in document order, each with what it
    /// resolves to.
    pub fn links_of(&self, relative: &str) -> Result<Vec<Link>, IndexError> {
        let sql = format!(
            "SELECT l.kind, l.target, l.heading, l.block, l.alias, l.line, l.col,
                    (SELECT path FROM notes WHERE id = {RESOLVE})
             FROM links l JOIN notes n ON n.id = l.note
             WHERE n.path = ?1 ORDER BY l.start"
        );
        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map(params![relative], |r| {
            Ok(Link {
                embed: r.get::<_, String>(0)? == "embed",
                target: r.get(1)?,
                heading: r.get(2)?,
                block: r.get(3)?,
                alias: r.get(4)?,
                line: r.get(5)?,
                col: r.get(6)?,
                resolved: r.get(7)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// The notes that link to `relative` — by its path or, when it is the
    /// first of its name in path order, by its bare name — with the
    /// position of each link. Embeds count (observed, provisional). A
    /// note's links to its own headings and blocks (`[[#x]]`) resolve to
    /// the note itself and are backlinks of it (Q12, as observed on
    /// 2026-09-22; `tests/graph.rs`).
    pub fn backlinks(&self, relative: &str) -> Result<Vec<Backlink>, IndexError> {
        let sql = format!(
            "SELECT src.path, l.target, l.kind, l.line, l.col
             FROM links l JOIN notes src ON src.id = l.note
             JOIN notes t ON t.path = ?1
             WHERE l.target_key IS NOT NULL AND {RESOLVE} = t.id
             ORDER BY src.path, l.start"
        );
        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map(params![relative], |r| {
            Ok(Backlink {
                from: r.get(0)?,
                target: r.get(1)?,
                embed: r.get::<_, String>(2)? == "embed",
                line: r.get(3)?,
                col: r.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Targets no note answers to, with counts of links vault-wide, one
    /// row per folded key; the text shown is the smallest spelling in byte
    /// order (`min`), so the answer does not depend on the query plan.
    /// An empty target (`[[#x]]`) is the note itself, never missing.
    pub fn unresolved(&self) -> Result<Vec<Unresolved>, IndexError> {
        let sql = format!(
            "SELECT min(l.target), count(*) FROM links l
             WHERE l.target_key IS NULL OR (l.target_key <> '' AND {RESOLVE} IS NULL)
             GROUP BY COALESCE(l.target_key, l.target) ORDER BY 1"
        );
        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map([], |r| {
            Ok(Unresolved {
                target: r.get(0)?,
                count: u64::try_from(r.get::<_, i64>(1)?).unwrap_or(0),
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

/// A byte offset as SQLite stores it.
fn offset(n: usize) -> i64 {
    i64::try_from(n).unwrap_or(i64::MAX)
}

/// `tags` or `aliases` from the frontmatter as strings: a list of scalars,
/// or one scalar (spec §5.1 leaves the accepted forms open; both are read).
fn strings_of(map: &[(String, Value)], key: &str) -> Vec<String> {
    match map.iter().find(|(k, _)| k == key).map(|(_, v)| v) {
        Some(Value::Sequence(items)) => items.iter().filter_map(scalar_text).collect(),
        Some(v) => scalar_text(v).into_iter().collect(),
        None => Vec::new(),
    }
}

fn scalar_text(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Integer(i) => Some(i.to_string()),
        Value::Float(f) => Some(f.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Null | Value::Sequence(_) | Value::Mapping(_) => None,
    }
}

/// A JSON array of strings, quoted by hand: no JSON dependency for a list
/// of tags.
fn json_list(items: &[String]) -> String {
    let mut out = String::from("[");
    for (i, item) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push('"');
        for c in item.chars() {
            match c {
                '"' => out.push_str("\\\""),
                '\\' => out.push_str("\\\\"),
                '\n' => out.push_str("\\n"),
                c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
                c => out.push(c),
            }
        }
        out.push('"');
    }
    out.push(']');
    out
}

/// The strings of a JSON array as `json_list` writes it; anything else
/// is an empty list.
fn json_strings(json: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = json.trim().chars().peekable();
    if chars.next() != Some('[') {
        return out;
    }
    let mut current: Option<String> = None;
    let mut escaped = false;
    for c in chars {
        match (&mut current, c) {
            (Some(s), _) if escaped => {
                s.push(match c {
                    'n' => '\n',
                    't' => '\t',
                    other => other,
                });
                escaped = false;
            }
            (Some(_), '\\') => escaped = true,
            (Some(_), '"') => {
                if let Some(s) = current.take() {
                    out.push(s);
                }
            }
            (Some(s), _) => s.push(c),
            (None, '"') => current = Some(String::new()),
            (None, _) => {}
        }
    }
    out
}
