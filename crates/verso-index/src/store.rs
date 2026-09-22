// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Putting a parsed note into the index and asking the graph questions:
//! outgoing links, backlinks, unresolved targets.

use rusqlite::{OptionalExtension, params};
use verso_dialect::{Document, Value};

use crate::keys::{note_keys, target_key};
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

/// A target no note answers to, with how many links name it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Unresolved {
    pub target: String,
    pub count: u64,
}

/// The SQL that resolves a target key to a note id: a path from the root
/// first, then a name; several names → the first by path order (observed
/// in Obsidian; provisional). Used inside the queries below.
const RESOLVE: &str = "COALESCE(
    (SELECT id FROM notes WHERE path_key = l.target_key),
    (SELECT id FROM notes WHERE name_key = l.target_key ORDER BY path LIMIT 1)
)";

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
                relative
                    .rsplit('/')
                    .next()
                    .unwrap_or(relative)
                    .trim_end_matches(".md")
                    .to_owned()
            });
        let (tags, aliases, frontmatter_ok) = match report.frontmatter.as_ref().map(|f| &f.values) {
            Some(Ok(Value::Mapping(map))) => {
                (strings_of(map, "tags"), strings_of(map, "aliases"), true)
            }
            Some(Ok(_)) | None => (Vec::new(), Vec::new(), true),
            Some(Err(_)) => (Vec::new(), Vec::new(), false),
        };
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM notes WHERE path = ?1", params![relative])?;
        tx.execute("DELETE FROM notes_fts WHERE path = ?1", params![relative])?;
        tx.execute(
            "INSERT INTO notes (path, path_key, name_key, title, modified, len, hash, tags, aliases, frontmatter_ok, unverified)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)",
            params![
                relative,
                path_key,
                name_key,
                title,
                stamp.modified,
                i64::try_from(stamp.len).unwrap_or(i64::MAX),
                // Stored as the two's-complement of the u64: SQLite integers are i64.
                i64::from_ne_bytes(stamp.hash.to_ne_bytes()),
                json_list(&tags),
                json_list(&aliases),
                frontmatter_ok,
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
                "INSERT INTO links (note, kind, target, target_key, heading, block, alias, line, col, start, end)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
                    offset(l.span.end)
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
                    offset(e.span.end)
                ])?;
            }
        }
        tx.execute(
            "INSERT INTO notes_fts (path, content) VALUES (?1, ?2)",
            params![relative, content],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// A placeholder stands where the note is (ADR 0043): the last known
    /// version stays, marked unverified; a note never seen before gets an
    /// empty, unverified row, so that links to it resolve and its path is
    /// known. Returns whether the note was already known.
    pub fn mark_placeholder(&mut self, relative: &str) -> Result<bool, IndexError> {
        let known = self.conn.execute(
            "UPDATE notes SET unverified = 1 WHERE path = ?1",
            params![relative],
        )?;
        if known > 0 {
            return Ok(true);
        }
        let (path_key, name_key) = note_keys(relative);
        let title = relative
            .rsplit('/')
            .next()
            .unwrap_or(relative)
            .trim_end_matches(".md")
            .to_owned();
        self.conn.execute(
            "INSERT INTO notes (path, path_key, name_key, title, modified, len, hash, unverified)
             VALUES (?1, ?2, ?3, ?4, 0, 0, 0, 1)",
            params![relative, path_key, name_key, title],
        )?;
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
        let n = tx.execute("DELETE FROM notes WHERE path = ?1", params![relative])?;
        tx.execute("DELETE FROM notes_fts WHERE path = ?1", params![relative])?;
        tx.commit()?;
        Ok(n > 0)
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
                        hash: u64::from_ne_bytes(r.get::<_, i64>(2)?.to_ne_bytes()),
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
    /// position of each link. Embeds count (observed, provisional).
    pub fn backlinks(&self, relative: &str) -> Result<Vec<Backlink>, IndexError> {
        let sql = format!(
            "SELECT src.path, l.target, l.kind, l.line, l.col
             FROM links l JOIN notes src ON src.id = l.note
             JOIN notes t ON t.path = ?1
             WHERE {RESOLVE} = t.id
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

    /// Targets no note answers to, with counts, by target text.
    pub fn unresolved(&self) -> Result<Vec<Unresolved>, IndexError> {
        let sql = format!(
            "SELECT l.target, count(*) FROM links l WHERE {RESOLVE} IS NULL
             GROUP BY l.target_key ORDER BY l.target"
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
