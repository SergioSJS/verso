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
    /// The key of the frontmatter property that holds the link — a typed
    /// relation (spec Q10, ADR 0057 point 4) — or `None` for a link of the
    /// body.
    pub relation: Option<String>,
}

/// A `verso-schema` block as the index holds it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchemaRow {
    /// The note it is in.
    pub path: String,
    /// The `type` it declares, when it was read — also by a block that
    /// then failed (ADR 0052 point 5).
    pub name: Option<String>,
    pub name_key: Option<String>,
    /// Inside a list or a quote: not read (ADR 0052 point 3).
    pub nested: bool,
    /// Why a block at the top level types nothing (spec §4.8's kinds).
    pub error: Option<String>,
    pub line: u32,
    pub col: u32,
}

/// A note that links to the one asked about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Backlink {
    pub from: String,
    pub target: String,
    pub embed: bool,
    pub line: u32,
    pub col: u32,
    /// The key of the frontmatter property that holds the link, or `None`
    /// for a link of the body (see [`Link::relation`]).
    pub relation: Option<String>,
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
    /// The first and last line of the block the id names (spec Q3, Q21).
    pub first_line: u32,
    pub last_line: u32,
}

/// A link of a source that is not parsed as Markdown — a canvas's file
/// node, or a link inside one of its text nodes — with where it is written
/// in the file (ADR 0057 point 6).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceLink {
    pub embed: bool,
    /// A canvas's `file` node: the path from the root, as JSON Canvas
    /// writes it, never a name looked up in other folders (ADR 0057,
    /// decided on 2026-10-01).
    pub exact: bool,
    pub target: String,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub alias: Option<String>,
    pub line: u32,
    pub col: u32,
    pub start: usize,
    pub end: usize,
    /// The link is written in a secret node of the board (ADR 0090 item
    /// 5): a reader's backlinks and counts do not have it.
    pub secret: bool,
}

/// What the index keeps of a board with secret nodes, as it keeps a
/// note's secret blocks (ADR 0087 item 6): the board's searchable text as
/// a reader is served it, the text of what was taken out, and what a
/// reader receives of the file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoardSplit {
    pub public: String,
    pub secret: String,
    /// The length and FNV-1a hash of the projection a reader is served.
    pub len: usize,
    pub hash: u64,
    /// The lines the secret nodes take, `first-last,...`: a reader's line
    /// numbers are the projection's (the same list a note's secret blocks
    /// keep).
    pub hidden: String,
}

/// A target no note answers to, with how many links name it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Unresolved {
    pub target: String,
    pub count: u64,
}

/// Sticker, color and first alias of an entry (note or folder), plus order and pinned lists (ADR 0060, S1, S3).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntryLabel {
    pub sticker: Option<String>,
    pub color: Option<String>,
    pub alias: Option<String>,
    /// Every alias, the first included: what the suggestion while typing
    /// matches (ADR 0089 item 5).
    pub aliases: Vec<String>,
    pub order: Option<Vec<String>>,
    pub pinned: Option<Vec<String>>,
}

/// A link or an embed of some note, with what it resolves to among the
/// notes ([`Index::all_links`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultLink {
    pub from: String,
    pub embed: bool,
    /// As written.
    pub target: String,
    pub alias: Option<String>,
    pub resolved: Option<String>,
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
    WHEN l.kind = 'file' THEN (SELECT id FROM notes WHERE path_key = l.target_key ORDER BY path LIMIT 1)
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

/// Whether a link row of `kind` shows its target in place: an embed, or a
/// canvas's file node.
fn embeds(kind: &str) -> bool {
    matches!(kind, "embed" | "file")
}

/// Remove a note's row from `notes_fts` (external content: FTS5 needs the
/// old values to drop its tokens) and from `notes`. Returns whether there
/// was one.
fn forget(tx: &rusqlite::Connection, relative: &str) -> Result<bool, IndexError> {
    let old: Option<i64> = tx
        .query_row(
            "SELECT id FROM notes WHERE path = ?1",
            params![relative],
            |r| r.get(0),
        )
        .optional()?;
    let Some(id) = old else {
        return Ok(false);
    };
    crate::secret::fts_delete(tx, id)?;
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
        // Its secret blocks (ADR 0087 item 6): what a reader receives, and
        // the constructs inside them flagged below.
        let split = crate::secret::split(content);
        let hides = |span: &verso_dialect::Span| split.secrets.touches(span.start..span.end);
        // The title is what anyone may read: a heading inside a secret
        // block names nothing.
        let title = report
            .headings
            .iter()
            .find(|h| h.level == 1 && !hides(&h.span))
            .map(|h| h.text.clone())
            .unwrap_or_else(|| {
                let name = relative.rsplit('/').next().unwrap_or(relative);
                name.strip_suffix(".md").unwrap_or(name).to_owned()
            });
        let (
            tags,
            aliases,
            frontmatter_ok,
            url,
            sticker,
            color,
            banner,
            banner_y,
            order_items,
            pinned_items,
        ) = match report.frontmatter.as_ref().map(|f| &f.values) {
            Some(Ok(Value::Mapping(map))) => (
                frontmatter_tags(map),
                strings_of(map, "aliases"),
                true,
                strings_of(map, "url")
                    .into_iter()
                    .find(|u| u.starts_with("http://") || u.starts_with("https://")),
                string_of(map, "sticker"),
                string_of(map, "color"),
                string_of(map, "banner"),
                f64_of(map, "banner_y"),
                {
                    let o = strings_of(map, "order");
                    if o.is_empty() {
                        None
                    } else {
                        Some(json_list(&o))
                    }
                },
                {
                    let p = strings_of(map, "pinned");
                    if p.is_empty() {
                        None
                    } else {
                        Some(json_list(&p))
                    }
                },
            ),
            Some(Ok(_)) | None => (
                Vec::new(),
                Vec::new(),
                true,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ),
            Some(Err(_)) => (
                Vec::new(),
                Vec::new(),
                false,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ),
        };
        // A `type` holding one text (ADR 0052 point 1); anything else is an
        // ordinary property, and no type.
        let note_type = match report.frontmatter.as_ref().map(|f| &f.values) {
            Some(Ok(Value::Mapping(map))) => {
                map.iter()
                    .rev()
                    .find(|(k, _)| k == "type")
                    .and_then(|(_, v)| match v {
                        Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
                        _ => None,
                    })
            }
            _ => None,
        };
        let note_type_key = note_type.as_deref().map(crate::keys::type_key);
        let tx = self.conn.savepoint()?;
        // When a reader last saw the note change: kept while its public
        // text stays the same.
        let before: Option<(Option<i64>, Option<i64>)> = tx
            .query_row(
                "SELECT public_hash, public_modified FROM notes WHERE path = ?1",
                params![relative],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let public_modified = match before {
            Some((Some(hash), Some(at))) if hash == split.public_hash => at,
            _ => stamp.modified,
        };
        forget(&tx, relative)?;
        tx.execute(
            "INSERT INTO notes (path, path_key, name_key, dir, title, modified, len, hash, tags, aliases, frontmatter_ok, unverified, content, url, sticker, color, banner, banner_y, order_items, pinned_items, type, type_key, indexed_at, name_fold, public, secret, hidden, public_hash, public_len, public_modified)
             VALUES (?1, ?2, ?3, ?12, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29)",
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
                sticker,
                color,
                banner,
                banner_y,
                order_items,
                pinned_items,
                note_type,
                note_type_key,
                self.run_started.unwrap_or(0),
                crate::search::name_fold(relative),
                split.public,
                split.secret,
                split.hidden,
                split.public_hash,
                split.public_len,
                public_modified,
            ],
        )?;
        let note = tx.last_insert_rowid();
        {
            let mut ins = tx.prepare(
                "INSERT INTO schemas (note, name, name_key, nested, error, line, col) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )?;
            for block in &report.schemas {
                let (name, error) = match &block.definition {
                    Some(Ok(schema)) => (Some(schema.name.clone()), None),
                    Some(Err(e)) => (e.name.clone(), Some(e.kind.as_str())),
                    None => (None, None),
                };
                ins.execute(params![
                    note,
                    name,
                    name.as_deref().map(crate::keys::type_key),
                    block.nested,
                    error,
                    block.pos.line,
                    block.pos.col
                ])?;
            }
        }
        {
            let mut ins = tx.prepare(
                "INSERT INTO headings (note, level, text, line, col, start, end, secret) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;
            for h in &report.headings {
                ins.execute(params![
                    note,
                    h.level,
                    h.text,
                    h.pos.line,
                    h.pos.col,
                    offset(h.span.start),
                    offset(h.span.end),
                    hides(&h.span)
                ])?;
            }
        }
        {
            let mut ins = tx.prepare(
                "INSERT INTO blocks (note, id, line, col, start, end, first_line, last_line, secret) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;
            for b in &report.blocks {
                ins.execute(params![
                    note,
                    b.id,
                    b.pos.line,
                    b.pos.col,
                    offset(b.span.start),
                    offset(b.span.end),
                    b.lines.0,
                    b.lines.1,
                    hides(&b.span)
                ])?;
            }
        }
        {
            let mut ins = tx.prepare(
                "INSERT INTO links (note, kind, target, target_key, rel_key, heading, block, alias, line, col, start, end, secret)
                 VALUES (?1, ?2, ?3, ?4, ?12, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?13)",
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
                    relative_key(relative, &l.target),
                    hides(&l.span)
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
                    relative_key(relative, &e.target),
                    hides(&e.span)
                ])?;
            }
            // Typed relations (spec Q10): a link a frontmatter property
            // holds, with the property's key.
            let mut rel = tx.prepare(
                "INSERT INTO links (note, kind, target, target_key, rel_key, heading, block, alias, line, col, start, end, relation)
                 VALUES (?1, 'link', ?2, ?3, ?11, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?12)",
            )?;
            for p in &report.property_links {
                rel.execute(params![
                    note,
                    p.target,
                    target_key(&p.target),
                    p.heading,
                    p.block,
                    p.alias,
                    p.pos.line,
                    p.pos.col,
                    offset(p.span.start),
                    offset(p.span.end),
                    relative_key(relative, &p.target),
                    p.key
                ])?;
            }
        }
        // External content: the row id ties the tokens to `notes.id`.
        crate::secret::fts_insert(&tx, note)?;
        tx.commit()?;
        Ok(())
    }

    /// Store a canvas (ADR 0057 point 6): a row that is a link source and
    /// a link target by its full name — `[[Quadro.canvas]]`, never
    /// `[[Quadro]]`, since only `.md` is dropped from a key — searchable by
    /// `content`, and never a note (`notes`, `tags`).
    pub fn upsert_canvas(
        &mut self,
        relative: &str,
        stamp: NoteStamp,
        content: &str,
        links: &[SourceLink],
    ) -> Result<(), IndexError> {
        self.upsert_board(relative, stamp, content, links, None)
    }

    /// [`Index::upsert_canvas`] for a board that may hold secret nodes
    /// (ADR 0090 item 5): with `split`, a reader's search and counts are
    /// answered from the public text and the links not flagged secret, and
    /// its length and time are the projection's, as a note's are.
    pub fn upsert_board(
        &mut self,
        relative: &str,
        stamp: NoteStamp,
        content: &str,
        links: &[SourceLink],
        split: Option<&BoardSplit>,
    ) -> Result<(), IndexError> {
        let (path_key, name_key) = note_keys(relative);
        let name = relative.rsplit('/').next().unwrap_or(relative);
        let title = name.strip_suffix(".canvas").unwrap_or(name);
        let tx = self.conn.savepoint()?;
        let before: Option<(Option<i64>, Option<i64>)> = tx
            .query_row(
                "SELECT public_hash, public_modified FROM notes WHERE path = ?1",
                params![relative],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let hash = split.map(|b| i64::from_le_bytes(b.hash.to_le_bytes()));
        // When a reader last saw the board change: kept while what it is
        // served stays the same.
        let public_modified = match (before, hash) {
            (Some((Some(was), Some(at))), Some(now)) if was == now => Some(at),
            (_, Some(_)) => Some(stamp.modified),
            _ => None,
        };
        forget(&tx, relative)?;
        tx.execute(
            "INSERT INTO notes (path, kind, path_key, name_key, dir, title, modified, len, hash, unverified, content, name_fold, public, secret, hidden, public_hash, public_len, public_modified)
             VALUES (?1, 'canvas', ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                relative,
                path_key,
                name_key,
                dir_of(relative),
                title,
                stamp.modified,
                i64::try_from(stamp.len).unwrap_or(i64::MAX),
                i64::from_le_bytes(stamp.hash.to_le_bytes()),
                content,
                crate::search::name_fold(relative),
                split.map(|b| b.public.as_str()),
                split.map(|b| b.secret.as_str()),
                // The lines of the secret nodes; even an empty list marks
                // the row as one that hides something.
                split.map(|b| b.hidden.as_str()),
                hash,
                split.map(|b| i64::try_from(b.len).unwrap_or(i64::MAX)),
                public_modified,
            ],
        )?;
        let source = tx.last_insert_rowid();
        {
            let mut ins = tx.prepare(
                "INSERT INTO links (note, kind, target, target_key, rel_key, heading, block, alias, line, col, start, end, secret)
                 VALUES (?1, ?2, ?3, ?4, ?12, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?13)",
            )?;
            for l in links {
                ins.execute(params![
                    source,
                    if l.exact {
                        "file"
                    } else if l.embed {
                        "embed"
                    } else {
                        "link"
                    },
                    l.target,
                    target_key(&l.target),
                    l.heading,
                    l.block,
                    l.alias,
                    l.line,
                    l.col,
                    offset(l.start),
                    offset(l.end),
                    relative_key(relative, &l.target),
                    l.secret
                ])?;
            }
        }
        crate::secret::fts_insert(&tx, source)?;
        tx.commit()?;
        Ok(())
    }

    /// A placeholder stands where the note is (ADR 0043): the last known
    /// version stays, marked unverified; a note never seen before gets an
    /// empty, unverified row — in `notes` and, as an empty document, in
    /// `notes_fts` — so that links to it resolve and its path is known.
    /// Returns whether the note was already known.
    pub fn mark_placeholder(&mut self, relative: &str) -> Result<bool, IndexError> {
        let tx = self.conn.savepoint()?;
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
            "INSERT INTO notes (path, path_key, name_key, dir, title, modified, len, hash, unverified, name_fold)
             VALUES (?1, ?2, ?3, ?5, ?4, 0, 0, 0, 1, ?6)",
            params![
                relative,
                path_key,
                name_key,
                title,
                dir_of(relative),
                crate::search::name_fold(relative)
            ],
        )?;
        // External content: `notes_fts` only knows the rows it was told
        // about, and the next `forget` will tell it to delete this one.
        // An empty document keeps the two tables in step; the transaction
        // keeps them in step even if this second insert fails.
        let id = tx.last_insert_rowid();
        crate::secret::fts_insert(&tx, id)?;
        tx.commit()?;
        Ok(false)
    }

    /// Whether the index holds a note only as an unverified last version
    /// (a placeholder stood where it was), `None` if unknown.
    pub fn is_unverified(&self, relative: &str) -> Result<Option<bool>, IndexError> {
        Ok(self
            .conn
            .query_row(UNVERIFIED_SQL, params![relative], |r| {
                r.get::<_, i64>(0).map(|v| v != 0)
            })
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
        let tx = self.conn.savepoint()?;
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
        self.graph_as(false)
    }

    /// [`Index::graph`]; `reader`: without a link inside a secret block.
    pub(crate) fn graph_as(&self, reader: bool) -> Result<Vec<(String, String)>, IndexError> {
        let sql = format!(
            "SELECT DISTINCT n.path, t.path
             FROM links l JOIN notes n ON n.id = l.note
             JOIN notes t ON t.id = {RESOLVE}
             WHERE l.target_key IS NOT NULL AND (?1 = 0 OR l.secret = 0)
             ORDER BY n.path, t.path"
        );
        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map(params![reader], |r| Ok((r.get(0)?, r.get(1)?)))?;
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
        self.tags_as(false)
    }

    /// [`Index::tags`]; `reader`: from the notes' public text, so a tag
    /// only a secret block holds is no tag (ADR 0087 item 4).
    pub(crate) fn tags_as(&self, reader: bool) -> Result<Vec<(String, Vec<String>)>, IndexError> {
        let column = if reader {
            "COALESCE(public, content)"
        } else {
            "content"
        };
        let mut st = self.conn.prepare(&format!(
            "SELECT path, tags, {column} FROM notes WHERE kind = 'note' ORDER BY path"
        ))?;
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
            // A nested tag counts for each tag above it, as Obsidian's tag
            // pane counts it (spec Q22 b): `a/b` is also a note of `a`.
            let ancestors: Vec<String> = found
                .iter()
                .flat_map(|t| {
                    t.match_indices('/')
                        .filter(|(at, _)| *at > 0)
                        .map(|(at, _)| t[..at].to_owned())
                        .collect::<Vec<_>>()
                })
                .collect();
            found.extend(ancestors);
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
        self.conn.execute_batch(
            "INSERT INTO notes_fts (notes_fts) VALUES ('integrity-check');
             INSERT INTO names_fts (names_fts) VALUES ('integrity-check');",
        )?;
        let (notes, documents, names): (i64, i64, i64) = self.conn.query_row(
            "SELECT (SELECT count(*) FROM notes), (SELECT count(*) FROM notes_fts_docsize),
                    (SELECT count(*) FROM names_fts)",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        if notes != documents {
            return Err(IndexError::Corrupt(format!(
                "{notes} notes but {documents} full-text documents"
            )));
        }
        if notes != names {
            return Err(IndexError::Corrupt(format!(
                "{notes} notes but {names} searched names"
            )));
        }
        Ok(())
    }

    /// The note `target` names as a link written at the folder's root names
    /// it: a path from the root first, then a name — of several notes of
    /// that name the shallowest, then by path, as [`RESOLVE`] orders them
    /// for a note at the root. `None` when no note answers. For a command
    /// line that names a note as a link would (`verso backlinks <folder>
    /// Barão` for `npcs/Barão.md`).
    pub fn note_named(&self, target: &str) -> Result<Option<String>, IndexError> {
        let Some(key) = target_key(target).filter(|k| !k.is_empty()) else {
            return Ok(None);
        };
        let by_path: Option<String> = self
            .conn
            .query_row(
                "SELECT path FROM notes WHERE path_key = ?1 ORDER BY path LIMIT 1",
                params![key],
                |r| r.get(0),
            )
            .optional()?;
        if by_path.is_some() {
            return Ok(by_path);
        }
        Ok(self
            .conn
            .query_row(
                "SELECT path FROM notes WHERE name_key = ?1
                 ORDER BY length(path) - length(replace(path, '/', '')), path
                 LIMIT 1",
                params![key],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// Whether the note at `relative` is, by its modified time (seconds) and
    /// length, the one the index holds — trusted without reading it only in
    /// a run, when it was modified at least 2 s before the last complete
    /// run began ([`Index::complete`]), and is not a placeholder's last
    /// known version (ADR 0043). A change within the same second as a read
    /// could keep both, so such a note is read again (git's "racy"
    /// entries).
    pub fn unchanged_by_stat(
        &self,
        relative: &str,
        modified: i64,
        len: u64,
    ) -> Result<bool, IndexError> {
        if !self.trusted_before.is_some_and(|before| modified < before) {
            return Ok(false);
        }
        Ok(self
            .conn
            .query_row(
                UNCHANGED_SQL,
                params![relative, modified, i64::try_from(len).unwrap_or(i64::MAX)],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
    }

    pub fn stamp_of(&self, relative: &str) -> Result<Option<NoteStamp>, IndexError> {
        Ok(self
            .conn
            .query_row(STAMP_SQL, params![relative], |r| {
                Ok(NoteStamp {
                    modified: r.get(0)?,
                    len: u64::try_from(r.get::<_, i64>(1)?).unwrap_or(0),
                    hash: u64::from_le_bytes(r.get::<_, i64>(2)?.to_le_bytes()),
                })
            })
            .optional()?)
    }

    /// Every note path, in path order. A canvas is not a note.
    pub fn notes(&self) -> Result<Vec<String>, IndexError> {
        let mut st = self
            .conn
            .prepare("SELECT path FROM notes WHERE kind = 'note' ORDER BY path")?;
        let rows = st.query_map([], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// A `verso-schema` block of the folder, as the index holds it
    /// (ADR 0052): where it is, the name it declares when it was read, and
    /// whether it is nested or why it types nothing.
    pub fn schema_blocks(&self) -> Result<Vec<SchemaRow>, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT n.path, s.name, s.name_key, s.nested, s.error, s.line, s.col
             FROM schemas s JOIN notes n ON n.id = s.note
             ORDER BY n.path, s.line, s.col",
        )?;
        let rows = st.query_map([], |r| {
            Ok(SchemaRow {
                path: r.get(0)?,
                name: r.get(1)?,
                name_key: r.get(2)?,
                nested: r.get(3)?,
                error: r.get(4)?,
                line: r.get(5)?,
                col: r.get(6)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// A note's `type`, as written and folded, when it holds one text.
    pub fn note_type(&self, relative: &str) -> Result<Option<(String, String)>, IndexError> {
        Ok(self
            .conn
            .query_row(
                "SELECT type, type_key FROM notes WHERE path = ?1 AND type IS NOT NULL",
                params![relative],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?)
    }

    /// The notes whose `type` folds to `type_key`, in path order.
    pub fn notes_of_type(&self, type_key: &str) -> Result<Vec<String>, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT path FROM notes WHERE kind = 'note' AND type_key = ?1 ORDER BY path",
        )?;
        let rows = st.query_map(params![type_key], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Every path the index holds — notes and canvases — in path order:
    /// what a walk compares against to know what is gone.
    pub fn sources(&self) -> Result<Vec<String>, IndexError> {
        let mut st = self.conn.prepare("SELECT path FROM notes ORDER BY path")?;
        let rows = st.query_map([], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Every note with the hash of its content as indexed: what a cache
    /// kept outside the index compares against to know what changed.
    pub fn note_hashes(&self) -> Result<Vec<(String, u64)>, IndexError> {
        let mut st = self
            .conn
            .prepare("SELECT path, hash FROM notes WHERE kind = 'note' ORDER BY path")?;
        let rows = st.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                u64::from_le_bytes(r.get::<_, i64>(1)?.to_le_bytes()),
            ))
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// The text of a note as indexed, if the index has the note.
    pub fn content_of(&self, relative: &str) -> Result<Option<String>, IndexError> {
        Ok(self
            .conn
            .query_row(
                "SELECT content FROM notes WHERE path = ?1",
                params![relative],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// Every link and embed of the vault, by source note then document
    /// order, each with the note it resolves to, if any: one query where
    /// [`Index::links_of`] would take one per note.
    pub fn all_links(&self) -> Result<Vec<VaultLink>, IndexError> {
        self.all_links_as(false)
    }

    /// [`Index::all_links`]; `reader`: without those inside secret blocks.
    pub(crate) fn all_links_as(&self, reader: bool) -> Result<Vec<VaultLink>, IndexError> {
        let sql = format!(
            "SELECT n.path, l.kind, l.target, l.alias,
                    (SELECT path FROM notes WHERE id = {RESOLVE})
             FROM links l JOIN notes n ON n.id = l.note
             WHERE ?1 = 0 OR l.secret = 0
             ORDER BY n.path, l.start"
        );
        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map(params![reader], |r| {
            Ok(VaultLink {
                from: r.get(0)?,
                embed: embeds(&r.get::<_, String>(1)?),
                target: r.get(2)?,
                alias: r.get(3)?,
                resolved: r.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// The headings of a note, in document order.
    pub fn headings_of(&self, relative: &str) -> Result<Vec<Heading>, IndexError> {
        self.headings_as(relative, false)
    }

    /// The `^id` blocks of a note, in document order.
    pub fn blocks_of(&self, relative: &str) -> Result<Vec<Block>, IndexError> {
        self.blocks_as(relative, false)
    }

    /// The links a note makes, in document order, each with what it
    /// resolves to.
    pub fn links_of(&self, relative: &str) -> Result<Vec<Link>, IndexError> {
        self.links_as(relative, false)
    }

    /// [`Index::links_of`]; `reader`: without the links inside secret
    /// blocks, and lines numbered as the note's projection numbers them.
    pub(crate) fn links_as(&self, relative: &str, reader: bool) -> Result<Vec<Link>, IndexError> {
        let sql = format!(
            "SELECT l.kind, l.target, l.heading, l.block, l.alias, l.line, l.col,
                    (SELECT path FROM notes WHERE id = {RESOLVE}), l.relation, n.hidden
             FROM links l JOIN notes n ON n.id = l.note
             WHERE n.path = ?1 AND (?2 = 0 OR l.secret = 0) ORDER BY l.start"
        );
        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map(params![relative, reader], |r| {
            let line: u32 = r.get(5)?;
            Ok(Link {
                embed: embeds(&r.get::<_, String>(0)?),
                target: r.get(1)?,
                heading: r.get(2)?,
                block: r.get(3)?,
                alias: r.get(4)?,
                line: if reader {
                    crate::secret::line_shown(r.get::<_, Option<String>>(9)?.as_deref(), line)
                } else {
                    line
                },
                col: r.get(6)?,
                resolved: r.get(7)?,
                relation: r.get(8)?,
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
        self.backlinks_as(relative, false)
    }

    /// [`Index::backlinks`]; `reader`: without the links inside secret
    /// blocks, lines numbered as each source's projection numbers them.
    pub(crate) fn backlinks_as(
        &self,
        relative: &str,
        reader: bool,
    ) -> Result<Vec<Backlink>, IndexError> {
        let sql = format!(
            "SELECT src.path, l.target, l.kind, l.line, l.col, l.relation, src.hidden
             FROM links l JOIN notes src ON src.id = l.note
             JOIN notes t ON t.path = ?1
             WHERE l.target_key IS NOT NULL AND {RESOLVE} = t.id AND (?2 = 0 OR l.secret = 0)
             ORDER BY src.path, l.start"
        );
        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map(params![relative, reader], |r| {
            let line: u32 = r.get(3)?;
            Ok(Backlink {
                from: r.get(0)?,
                target: r.get(1)?,
                embed: embeds(&r.get::<_, String>(2)?),
                line: if reader {
                    crate::secret::line_shown(r.get::<_, Option<String>>(6)?.as_deref(), line)
                } else {
                    line
                },
                col: r.get(4)?,
                relation: r.get(5)?,
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

    /// Every label (sticker, color, first alias, order, pinned) known to the index.
    pub fn labels(&self) -> Result<std::collections::HashMap<String, EntryLabel>, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT path, sticker, color, aliases, order_items, pinned_items FROM notes
             WHERE sticker IS NOT NULL OR color IS NOT NULL OR aliases != '[]' OR order_items IS NOT NULL OR pinned_items IS NOT NULL",
        )?;
        let rows = st.query_map([], |r| {
            let path: String = r.get(0)?;
            let sticker: Option<String> = r.get(1)?;
            let color: Option<String> = r.get(2)?;
            let aliases_json: String = r.get(3)?;
            let aliases = json_strings(&aliases_json);
            let alias = aliases.first().cloned();
            let order_json: Option<String> = r.get(4)?;
            let order = order_json
                .map(|j| json_strings(&j))
                .filter(|v| !v.is_empty());
            let pinned_json: Option<String> = r.get(5)?;
            let pinned = pinned_json
                .map(|j| json_strings(&j))
                .filter(|v| !v.is_empty());
            Ok((
                path,
                EntryLabel {
                    sticker,
                    color,
                    alias,
                    aliases,
                    order,
                    pinned,
                },
            ))
        })?;
        let mut map = std::collections::HashMap::new();
        for item in rows {
            let (path, label) = item?;
            if label.sticker.is_some()
                || label.color.is_some()
                || label.alias.is_some()
                || label.order.is_some()
                || label.pinned.is_some()
            {
                map.insert(path, label);
            }
        }
        Ok(map)
    }

    /// The label of one note, or none.
    pub fn label_of(&self, path: &str) -> Result<Option<EntryLabel>, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT sticker, color, aliases, order_items, pinned_items FROM notes WHERE path = ?1",
        )?;
        let mut rows = st.query_map(params![path], |r| {
            let sticker: Option<String> = r.get(0)?;
            let color: Option<String> = r.get(1)?;
            let aliases_json: String = r.get(2)?;
            let aliases = json_strings(&aliases_json);
            let alias = aliases.first().cloned();
            let order_json: Option<String> = r.get(3)?;
            let order = order_json
                .map(|j| json_strings(&j))
                .filter(|v| !v.is_empty());
            let pinned_json: Option<String> = r.get(4)?;
            let pinned = pinned_json
                .map(|j| json_strings(&j))
                .filter(|v| !v.is_empty());
            Ok(EntryLabel {
                sticker,
                color,
                alias,
                aliases,
                order,
                pinned,
            })
        })?;
        if let Some(res) = rows.next() {
            let label = res?;
            if label.sticker.is_some()
                || label.color.is_some()
                || label.alias.is_some()
                || label.order.is_some()
                || label.pinned.is_some()
            {
                return Ok(Some(label));
            }
        }
        Ok(None)
    }

    /// The cover (banner path/URL and banner_y) of a note, or none.
    pub fn banner_of(&self, path: &str) -> Result<Option<(String, Option<f64>)>, IndexError> {
        let mut st = self
            .conn
            .prepare("SELECT banner, banner_y FROM notes WHERE path = ?1")?;
        let mut rows = st.query_map(params![path], |r| {
            let banner: Option<String> = r.get(0)?;
            let banner_y: Option<f64> = r.get(1)?;
            Ok((banner, banner_y))
        })?;
        if let Some(res) = rows.next() {
            let (banner, banner_y) = res?;
            if let Some(b) = banner {
                return Ok(Some((b, banner_y)));
            }
        }
        Ok(None)
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

/// The frontmatter's `tags` as tag names (spec Q22 c, Q24 b): a list of
/// strings and integers, or one of them (DL.2 = B, 2026-10-21: an integer
/// or a string of digits is the tag of its text); a boolean or a float is
/// no tag, and a leading `#` is not part of the name.
fn frontmatter_tags(map: &[(String, Value)]) -> Vec<String> {
    match map.iter().find(|(k, _)| k == "tags").map(|(_, v)| v) {
        Some(Value::Sequence(items)) => items
            .iter()
            .filter_map(verso_dialect::frontmatter_tag)
            .collect(),
        Some(v) => verso_dialect::frontmatter_tag(v).into_iter().collect(),
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

fn string_of(map: &[(String, Value)], key: &str) -> Option<String> {
    map.iter()
        .find(|(k, _)| k == key)
        .and_then(|(_, v)| scalar_text(v))
}

fn f64_of(map: &[(String, Value)], key: &str) -> Option<f64> {
    map.iter()
        .find(|(k, _)| k == key)
        .and_then(|(_, v)| match v {
            Value::Float(f) => Some(*f),
            Value::Integer(i) => Some(*i as f64),
            Value::String(s) => s.parse().ok(),
            _ => None,
        })
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

// What each note's check reads, from the index `notes_stat` (schema 13),
// never from the row: those columns sit after `content`, and SQLite reads a
// column after it by walking the note's whole text. Named: the planner
// would take the unique index on `path` and then read the row. Named, a
// missing index would fail the statement rather than fall back; `ensure`
// creates it on both paths (a new file, the carry-over from 12).
pub(crate) const UNCHANGED_SQL: &str = "SELECT 1 FROM notes INDEXED BY notes_stat
    WHERE path = ?1 AND modified = ?2 AND len = ?3 AND unverified = 0";
pub(crate) const STAMP_SQL: &str =
    "SELECT modified, len, hash FROM notes INDEXED BY notes_stat WHERE path = ?1";
pub(crate) const UNVERIFIED_SQL: &str =
    "SELECT unverified FROM notes INDEXED BY notes_stat WHERE path = ?1";

#[cfg(test)]
mod stat_tests {
    use super::*;

    /// Each note's check is answered by the index alone (the benchmark's
    /// `index_unchanged` took 1.7 to 4 times as long reading the rows,
    /// 2026-10-08).
    #[test]
    fn a_note_s_check_reads_an_index_not_its_text() {
        let index = crate::Index::in_memory().unwrap();
        let plan = |sql: &str| -> String {
            let mut stmt = index
                .conn
                .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
                .unwrap();
            let n = stmt.parameter_count();
            let args: Vec<i64> = vec![0; n];
            stmt.query_map(rusqlite::params_from_iter(args), |r| r.get::<_, String>(3))
                .unwrap()
                .map(Result::unwrap)
                .collect::<Vec<_>>()
                .join(" / ")
        };
        for sql in [UNCHANGED_SQL, STAMP_SQL, UNVERIFIED_SQL] {
            let p = plan(sql);
            assert!(p.contains("COVERING INDEX notes_stat"), "{sql}: {p}");
        }
    }
}
