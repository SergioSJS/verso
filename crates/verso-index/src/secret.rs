// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Secret blocks in the index (ADR 0087 item 6, decided 2026-10-14): one
//! index serves both those who may write a note and those who may only
//! read it. Each note's secret blocks are found by the one projection of
//! `verso-dialect`; the note's public text and the blocks' text are
//! searched apart (`notes_text`, `notes_fts`'s `content` and `secret`
//! columns); every heading, `^id` and link inside one is flagged; and the
//! reader's questions here ask the public part only, numbering lines as
//! the projection numbers them.
//!
//! The rule of every reader's question: a construct flagged secret does
//! not exist, a count does not count it, and a position is the
//! projection's — a line number that counted hidden lines would say how
//! many there are.

use std::collections::HashMap;

use rusqlite::{Connection, OptionalExtension, params};
use verso_dialect::{Secrets, project_line};

use crate::store::{Backlink, Block, Heading, Link, VaultLink};
use crate::{Index, IndexError};

/// What the index keeps of a note's secret blocks.
pub(crate) struct Split {
    pub secrets: Secrets,
    /// The note as a reader receives it; `None` when it has no secret.
    pub public: Option<String>,
    /// The secret blocks' text, apart.
    pub secret: Option<String>,
    /// Their lines, `first-last,...`.
    pub hidden: Option<String>,
    /// The hash and length of what a reader receives.
    pub public_hash: i64,
    pub public_len: i64,
}

/// FNV-1a: what a reader receives, hashed, to tell whether it changed.
/// Not a guard against anyone: two texts that collide only delay a
/// reader's modification time.
fn fnv(text: &str) -> i64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in text.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    i64::from_le_bytes(h.to_le_bytes())
}

/// The secret blocks of `content` and what a reader receives of it.
pub(crate) fn split(content: &str) -> Split {
    let secrets = Secrets::of(content);
    let public = secrets.project(content);
    let public_hash = fnv(&public);
    let public_len = i64::try_from(public.len()).unwrap_or(i64::MAX);
    if secrets.is_empty() {
        return Split {
            secrets,
            public: None,
            secret: None,
            hidden: None,
            public_hash,
            public_len,
        };
    }
    let hidden = secrets
        .lines()
        .iter()
        .map(|(a, b)| format!("{a}-{b}"))
        .collect::<Vec<_>>()
        .join(",");
    Split {
        secret: Some(secrets.secret_text(content)),
        public: Some(public.into_owned()),
        hidden: Some(hidden),
        secrets,
        public_hash,
        public_len,
    }
}

/// The lines `first-last,...` as kept in `notes.hidden`.
pub(crate) fn hidden_lines(text: Option<&str>) -> Vec<(u32, u32)> {
    text.unwrap_or("")
        .split(',')
        .filter_map(|pair| {
            let (a, b) = pair.split_once('-')?;
            Some((a.trim().parse().ok()?, b.trim().parse().ok()?))
        })
        .collect()
}

/// Tell `notes_fts` to drop note `id`'s tokens: the values it was given,
/// read back from `notes_text` (external content needs them exactly).
pub(crate) fn fts_delete(tx: &Connection, id: i64) -> Result<(), IndexError> {
    tx.execute(
        "INSERT INTO notes_fts (notes_fts, rowid, path, title, content, secret)
         SELECT 'delete', id, path, title, content, secret FROM notes_text WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

/// Tell `notes_fts` of note `id` as `notes_text` reads it now.
pub(crate) fn fts_insert(tx: &Connection, id: i64) -> Result<(), IndexError> {
    tx.execute(
        "INSERT INTO notes_fts (rowid, path, title, content, secret)
         SELECT id, path, title, content, secret FROM notes_text WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

/// Version 15 over an index carried in place: every note row's secret
/// blocks found in the text it holds, its constructs flagged by their
/// byte ranges. Inside the caller's transaction; the caller makes the
/// full-text index again afterwards.
pub(crate) fn carry_over(conn: &Connection) -> Result<(), rusqlite::Error> {
    let rows: Vec<(i64, String, i64)> = {
        let mut st = conn.prepare("SELECT id, content, modified FROM notes WHERE kind = 'note'")?;
        st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<Result<_, _>>()?
    };
    for (id, content, modified) in rows {
        let s = split(&content);
        conn.execute(
            "UPDATE notes SET public = ?2, secret = ?3, hidden = ?4, public_hash = ?5,
                 public_len = ?6, public_modified = ?7 WHERE id = ?1",
            params![
                id,
                s.public,
                s.secret,
                s.hidden,
                s.public_hash,
                s.public_len,
                modified
            ],
        )?;
        if s.secrets.is_empty() {
            continue;
        }
        // The title from the first heading of level 1 no secret block holds,
        // or the file's name, as `upsert` takes it.
        let path: String =
            conn.query_row("SELECT path FROM notes WHERE id = ?1", params![id], |r| {
                r.get(0)
            })?;
        let heading = verso_dialect::parse(&content)
            .headings
            .into_iter()
            .find(|h| h.level == 1 && !s.secrets.touches(h.span.start..h.span.end))
            .map(|h| h.text);
        let title = heading.unwrap_or_else(|| {
            let name = path.rsplit('/').next().unwrap_or(&path);
            name.strip_suffix(".md").unwrap_or(name).to_owned()
        });
        conn.execute(
            "UPDATE notes SET title = ?2 WHERE id = ?1",
            params![id, title],
        )?;
        for table in ["headings", "blocks", "links"] {
            let spans: Vec<(i64, i64, i64)> = {
                let mut st = conn.prepare(&format!(
                    "SELECT rowid, start, end FROM {table} WHERE note = ?1"
                ))?;
                st.query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
                    .collect::<Result<_, _>>()?
            };
            for (row, start, end) in spans {
                let span = usize::try_from(start).unwrap_or(0)..usize::try_from(end).unwrap_or(0);
                if s.secrets.touches(span) {
                    conn.execute(
                        &format!("UPDATE {table} SET secret = 1 WHERE rowid = ?1"),
                        params![row],
                    )?;
                }
            }
        }
    }
    Ok(())
}

/// Line `line` of a note whose hidden lines are kept as `hidden`, as its
/// projection numbers it.
pub(crate) fn line_shown(hidden: Option<&str>, line: u32) -> u32 {
    shown(&hidden_lines(hidden), line)
}

/// A line of a note as its projection numbers it; a construct on a hidden
/// line is flagged secret and never asked for here, so a hidden line
/// answers itself.
fn shown(hidden: &[(u32, u32)], line: u32) -> u32 {
    project_line(hidden, line).unwrap_or(line)
}

impl Index {
    /// The note's text as a reader receives it, if the index has it.
    pub fn reader_content_of(&self, relative: &str) -> Result<Option<String>, IndexError> {
        Ok(self
            .conn
            .query_row(
                "SELECT COALESCE(public, content) FROM notes WHERE path = ?1",
                params![relative],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// When a reader last saw the note change (seconds), if the index has
    /// the note: a change only inside a secret block is none.
    pub fn reader_modified_of(&self, relative: &str) -> Result<Option<i64>, IndexError> {
        let at: Option<Option<i64>> = self
            .conn
            .query_row(
                "SELECT COALESCE(public_modified, modified) FROM notes WHERE path = ?1",
                params![relative],
                |r| r.get(0),
            )
            .optional()?;
        Ok(at.flatten())
    }

    /// The notes that hold a secret block, in path order.
    pub fn notes_with_secrets(&self) -> Result<Vec<String>, IndexError> {
        let mut st = self
            .conn
            .prepare("SELECT path FROM notes WHERE hidden IS NOT NULL ORDER BY path")?;
        let rows = st.query_map([], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// The hidden lines of a note (its secret blocks'), empty when none.
    pub fn hidden_of(&self, relative: &str) -> Result<Vec<(u32, u32)>, IndexError> {
        let text: Option<Option<String>> = self
            .conn
            .query_row(
                "SELECT hidden FROM notes WHERE path = ?1",
                params![relative],
                |r| r.get(0),
            )
            .optional()?;
        Ok(hidden_lines(text.flatten().as_deref()))
    }

    /// The notes whose length or modification time a reader is told
    /// otherwise than the file's: by path, what a reader receives of it —
    /// its public text's length, and when that last changed.
    pub fn reader_stats(&self) -> Result<HashMap<String, (u64, i64)>, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT path, public_len, public_modified FROM notes
             WHERE kind = 'note' AND public_len IS NOT NULL AND public_modified IS NOT NULL
               AND (hidden IS NOT NULL OR public_modified <> modified)",
        )?;
        let rows = st.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                (
                    u64::try_from(r.get::<_, i64>(1)?).unwrap_or(0),
                    r.get::<_, i64>(2)?,
                ),
            ))
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// [`Index::headings_of`] as a reader asks it.
    pub fn reader_headings_of(&self, relative: &str) -> Result<Vec<Heading>, IndexError> {
        self.headings_as(relative, true)
    }

    /// [`Index::blocks_of`] as a reader asks it.
    pub fn reader_blocks_of(&self, relative: &str) -> Result<Vec<Block>, IndexError> {
        self.blocks_as(relative, true)
    }

    /// [`Index::links_of`] as a reader asks it.
    pub fn reader_links_of(&self, relative: &str) -> Result<Vec<Link>, IndexError> {
        self.links_as(relative, true)
    }

    /// [`Index::backlinks`] as a reader asks it.
    pub fn reader_backlinks(&self, relative: &str) -> Result<Vec<Backlink>, IndexError> {
        self.backlinks_as(relative, true)
    }

    /// [`Index::graph`] as a reader asks it.
    pub fn reader_graph(&self) -> Result<Vec<(String, String)>, IndexError> {
        self.graph_as(true)
    }

    /// [`Index::all_links`] as a reader asks it.
    pub fn reader_all_links(&self) -> Result<Vec<VaultLink>, IndexError> {
        self.all_links_as(true)
    }

    /// [`Index::tags`] as a reader asks it.
    pub fn reader_tags(&self) -> Result<Vec<(String, Vec<String>)>, IndexError> {
        self.tags_as(true)
    }

    pub(crate) fn headings_as(
        &self,
        relative: &str,
        reader: bool,
    ) -> Result<Vec<Heading>, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT h.level, h.text, h.line, h.col, n.hidden FROM headings h
             JOIN notes n ON n.id = h.note
             WHERE n.path = ?1 AND (?2 = 0 OR h.secret = 0) ORDER BY h.start",
        )?;
        let rows = st.query_map(params![relative, reader], |r| {
            let hidden = hidden_lines(r.get::<_, Option<String>>(4)?.as_deref());
            let line: u32 = r.get(2)?;
            Ok(Heading {
                level: r.get(0)?,
                text: r.get(1)?,
                line: if reader { shown(&hidden, line) } else { line },
                col: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub(crate) fn blocks_as(&self, relative: &str, reader: bool) -> Result<Vec<Block>, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT b.id, b.line, b.col, b.first_line, b.last_line, n.hidden FROM blocks b
             JOIN notes n ON n.id = b.note
             WHERE n.path = ?1 AND (?2 = 0 OR b.secret = 0) ORDER BY b.start",
        )?;
        let rows = st.query_map(params![relative, reader], |r| {
            let hidden = hidden_lines(r.get::<_, Option<String>>(5)?.as_deref());
            let at = |line: u32| if reader { shown(&hidden, line) } else { line };
            let line: u32 = r.get(1)?;
            // A row carried over from version 10 and not read again yet (a
            // placeholder): the id's own line.
            let first = r.get::<_, Option<u32>>(3)?.unwrap_or(line);
            let last = r.get::<_, Option<u32>>(4)?.unwrap_or(line);
            Ok(Block {
                id: r.get(0)?,
                line: at(line),
                col: r.get(2)?,
                first_line: at(first),
                // A block the id names may hold a secret block: its last
                // line the last shown before it ends.
                last_line: if reader {
                    project_line(&hidden, last).unwrap_or_else(|| {
                        (first..last)
                            .rev()
                            .find_map(|l| project_line(&hidden, l))
                            .unwrap_or(at(first))
                    })
                } else {
                    last
                },
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}
