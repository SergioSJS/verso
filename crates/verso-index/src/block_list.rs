// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The `^id` blocks of the whole folder, in one query: what the oracle
//! looks for to offer a table of one's own (ADR 0102 item 3, decided
//! 2026-10-21, R.2 = B), so that it need not read every note. Each block
//! comes with its kind and a short label, both worked out from what the
//! index already holds (the note's text and its headings); nothing is added
//! to the schema.

use rusqlite::params;

use crate::{Index, IndexError};

/// The most rows [`Index::folder_blocks`] answers; more is said by
/// `truncated`.
pub const BLOCKS_MOST: usize = 5000;

/// The longest label, in characters.
const LABEL_MOST: usize = 80;

/// What a block with an `^id` is, read from its first line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockKind {
    Paragraph,
    List,
    Table,
    Heading,
    Quote,
    Code,
}

/// One `^id` block of a note of the folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockRef {
    /// The note's path, relative to the folder.
    pub path: String,
    pub id: String,
    pub kind: BlockKind,
    /// The heading above the block, else its first line, short.
    pub label: String,
    /// `label` is the heading above (else it is the block's first line).
    pub under_heading: bool,
    /// A table's body rows, or a list's top-level items (0 for the rest).
    pub rows: u32,
    /// A list with a task item (`- [ ]`, `- [x]`).
    pub tasks: bool,
}

/// The blocks of the folder and whether more were left out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockList {
    pub blocks: Vec<BlockRef>,
    pub truncated: bool,
}

impl Index {
    /// Every `^id` block of the folder's notes of the given kinds (all
    /// kinds when `kinds` is empty), by note path and position, at most
    /// [`BLOCKS_MOST`]. With the id written twice in a note, only the last
    /// is listed: the one a link reaches (spec Q4).
    pub fn folder_blocks(&self, kinds: &[BlockKind]) -> Result<BlockList, IndexError> {
        self.folder_blocks_as(kinds, false)
    }

    /// [`Index::folder_blocks`] as a reader asks it: no block inside a
    /// secret block, and no secret heading as a label (ADR 0087).
    pub fn reader_folder_blocks(&self, kinds: &[BlockKind]) -> Result<BlockList, IndexError> {
        self.folder_blocks_as(kinds, true)
    }

    fn folder_blocks_as(&self, kinds: &[BlockKind], reader: bool) -> Result<BlockList, IndexError> {
        let mut st = self.conn.prepare(
            "SELECT n.id, n.path, b.id, b.line, b.first_line, b.last_line FROM blocks b
             JOIN notes n ON n.id = b.note
             WHERE n.kind = 'note' AND (?1 = 0 OR b.secret = 0)
             ORDER BY n.path, b.start LIMIT ?2",
        )?;
        // One row more than the bound: a folder with a million ids does
        // not load them all, and the extra row says there were more.
        let rows: Vec<BlockRow> = st
            .query_map(params![reader, BLOCKS_MOST as i64 + 1], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            })?
            .collect::<Result<_, _>>()?;
        // Rows left unread may hold blocks of the kinds asked for.
        let unread = rows.len() > BLOCKS_MOST;
        let mut text = self
            .conn
            .prepare("SELECT content FROM notes WHERE id = ?1")?;
        let mut heads = self.conn.prepare(
            "SELECT line, text FROM headings WHERE note = ?1 AND (?2 = 0 OR secret = 0)
             ORDER BY line",
        )?;
        let mut out: Vec<BlockRef> = Vec::new();
        let mut truncated = false;
        // The note whose lines and headings are loaded.
        let mut loaded: Option<Loaded> = None;
        let mut at = 0;
        while at < rows.len() {
            let note = rows[at].0;
            let end = rows[at..]
                .iter()
                .position(|r| r.0 != note)
                .map_or(rows.len(), |n| at + n);
            // The last of a repeated id, first-come order otherwise.
            let group = &rows[at..end];
            at = end;
            let wanted = |k: BlockKind| kinds.is_empty() || kinds.contains(&k);
            if loaded.as_ref().is_none_or(|l| l.0 != note) {
                let content: String = text.query_row(params![note], |r| r.get(0))?;
                let lines = content.lines().map(str::to_owned).collect();
                let headings = heads
                    .query_map(params![note, reader], |r| Ok((r.get(0)?, r.get(1)?)))?
                    .collect::<Result<_, _>>()?;
                loaded = Some((note, lines, headings));
            }
            let Some((_, lines, headings)) = &loaded else {
                continue;
            };
            for (i, (_, path, id, line, first, last)) in group.iter().enumerate() {
                if group[i + 1..].iter().any(|g| g.2 == *id) {
                    continue;
                }
                let first = first.unwrap_or(*line).max(1);
                let first_text = lines.get(first as usize - 1).map_or("", String::as_str);
                let next_text = lines.get(first as usize).map_or("", String::as_str);
                let kind = kind_of(first_text, next_text);
                if !wanted(kind) {
                    continue;
                }
                if out.len() >= BLOCKS_MOST {
                    truncated = true;
                    break;
                }
                let last = last.unwrap_or(*line).max(first);
                let body: &[String] = lines
                    .get(first as usize - 1..(last as usize).min(lines.len()))
                    .unwrap_or(&[]);
                let (rows, tasks) = size_of(kind, body);
                let above = headings.iter().rev().find(|(l, _)| *l < first);
                let (label, under_heading) = match (kind, above) {
                    (BlockKind::Heading, _) | (_, None) => (first_line_label(first_text), false),
                    (_, Some((_, t))) => (short(t), true),
                };
                out.push(BlockRef {
                    path: path.clone(),
                    id: id.clone(),
                    kind,
                    label,
                    under_heading,
                    rows,
                    tasks,
                });
            }
            if truncated {
                break;
            }
        }
        Ok(BlockList {
            blocks: out,
            truncated: truncated || unread,
        })
    }
}

/// A block's row: its note's id and path, its id, the line of its `^id`, and
/// the first and last lines of the block it names.
type BlockRow = (i64, String, String, u32, Option<u32>, Option<u32>);

/// A note's id, its lines and its headings (line and text), as read.
type Loaded = (i64, Vec<String>, Vec<(u32, String)>);

/// The kind of a block from its first line (and the next, for a table
/// written without outer pipes, told by its delimiter row).
fn kind_of(first: &str, next: &str) -> BlockKind {
    let t = first.trim_start();
    if t.starts_with('|') || (t.contains('|') && is_delimiter_row(next)) {
        BlockKind::Table
    } else if t.starts_with("```") || t.starts_with("~~~") {
        BlockKind::Code
    } else if is_heading(t) {
        BlockKind::Heading
    } else if t.starts_with('>') {
        BlockKind::Quote
    } else if list_marker(t).is_some() {
        BlockKind::List
    } else {
        BlockKind::Paragraph
    }
}

/// A block's rows and whether it is a task list: a table's body rows (the
/// lines but its header and delimiter), a list's top-level items.
fn size_of(kind: BlockKind, body: &[String]) -> (u32, bool) {
    match kind {
        BlockKind::Table => {
            // A line that is only the `^id` is no row.
            let filled = body
                .iter()
                .filter(|l| !l.trim().is_empty() && !is_id_only(l))
                .count();
            (
                u32::try_from(filled.saturating_sub(2)).unwrap_or(u32::MAX),
                false,
            )
        }
        BlockKind::List => {
            let mut rows = 0u32;
            let mut tasks = false;
            for line in body {
                // Top level only: a nested item is part of its parent.
                if line.starts_with([' ', '\t']) {
                    continue;
                }
                let Some(n) = list_marker(line) else {
                    continue;
                };
                rows = rows.saturating_add(1);
                let item = line[n..].trim_start().as_bytes();
                if item.len() >= 3
                    && item[0] == b'['
                    && item[2] == b']'
                    && matches!(item[1], b' ' | b'x' | b'X')
                {
                    tasks = true;
                }
            }
            (rows, tasks)
        }
        _ => (0, false),
    }
}

fn is_id_only(line: &str) -> bool {
    let t = line.trim();
    t.strip_prefix('^')
        .is_some_and(|id| !id.is_empty() && !id.contains(char::is_whitespace))
}

fn is_delimiter_row(line: &str) -> bool {
    let t = line.trim();
    t.contains('-') && t.contains('|') && t.chars().all(|c| matches!(c, '|' | '-' | ':' | ' '))
}

fn is_heading(t: &str) -> bool {
    let hashes = t.chars().take_while(|c| *c == '#').count();
    (1..=6).contains(&hashes) && t[hashes..].starts_with([' ', '\t'])
}

/// The length of a list marker and its space at the start of `t`, when it
/// has one (`- `, `* `, `+ `, `1. `, `1) `).
fn list_marker(t: &str) -> Option<usize> {
    let mut chars = t.char_indices();
    let (_, c) = chars.next()?;
    if matches!(c, '-' | '*' | '+') {
        return t[1..].starts_with([' ', '\t']).then_some(2);
    }
    let digits = t.chars().take_while(char::is_ascii_digit).count();
    if (1..=9).contains(&digits)
        && t[digits..].starts_with(['.', ')'])
        && t[digits + 1..].starts_with([' ', '\t'])
    {
        return Some(digits + 2);
    }
    None
}

/// A first line as a label: without its marker, its `^id` and the pipes
/// around a table row.
fn first_line_label(line: &str) -> String {
    let mut t = line.trim();
    if let Some(n) = list_marker(t) {
        t = t[n..].trim_start();
    } else if is_heading(t) {
        t = t.trim_start_matches('#').trim_start();
    } else if let Some(rest) = t.strip_prefix('>') {
        t = rest.trim_start();
    }
    let t = t.trim_matches('|').trim();
    let t = match t.rsplit_once(" ^") {
        Some((head, id)) if !id.contains(char::is_whitespace) => head,
        _ => t,
    };
    short(t.trim())
}

fn short(text: &str) -> String {
    let text = text.trim();
    if text.chars().count() <= LABEL_MOST {
        return text.to_owned();
    }
    let cut: String = text.chars().take(LABEL_MOST - 1).collect();
    format!("{}…", cut.trim_end())
}
