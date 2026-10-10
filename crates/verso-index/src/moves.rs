// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the index does when the core moves a note, and what a plan to
//! follow the move asks of it (ADR 0048): the row follows the
//! file with everything it knows, instead of being dropped and re-read —
//! a placeholder's last known version would otherwise be lost on a folder
//! move (ADR 0043, decision 2) — and a link target can be resolved from a
//! given source by the same rule the queries apply (spec Q12), so a plan
//! can ask what each link reached before the move and what it would reach
//! after it.

use rusqlite::{OptionalExtension, params};

use crate::keys::{dir_of, note_keys, relative_key, target_key};
use crate::{Index, IndexError};

impl Index {
    /// Move a note's row from `from` to `to`, keeping its content, stamp,
    /// headings, blocks, links and its unverified mark: the file was
    /// renamed or its folder moved, nothing in it changed. The keys, the
    /// folder and the relative keys of its own links follow the new path,
    /// and so does the title when it came from the file name. A stale row
    /// already at `to` is forgotten first. Returns whether `from` was
    /// known.
    pub fn rekey(&mut self, from: &str, to: &str) -> Result<bool, IndexError> {
        if from == to {
            return Ok(self.stamp_of(from)?.is_some());
        }
        let tx = self.conn.savepoint()?;
        let old: Option<(i64, Option<String>, String)> = tx
            .query_row(
                "SELECT id, title, content FROM notes WHERE path = ?1",
                params![from],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        let Some((id, title, content)) = old else {
            return Ok(false);
        };
        forget_path(&tx, to)?;
        // A title that was the file name (no `# Heading` of level 1)
        // becomes the new file name; one written in the note stays.
        let named_by_file: bool = tx.query_row(
            "SELECT count(*) = 0 FROM headings WHERE note = ?1 AND level = 1",
            params![id],
            |r| r.get(0),
        )?;
        let new_title = if named_by_file {
            let name = to.rsplit('/').next().unwrap_or(to);
            Some(
                name.strip_suffix(".md")
                    .or_else(|| name.strip_suffix(".canvas"))
                    .unwrap_or(name)
                    .to_owned(),
            )
        } else {
            title.clone()
        };
        // External content: FTS5 needs the old values to drop its tokens,
        // and the new row is told to it afterwards.
        tx.execute(
            "INSERT INTO notes_fts (notes_fts, rowid, path, title, content) VALUES ('delete', ?1, ?2, ?3, ?4)",
            params![id, from, title, content],
        )?;
        let (path_key, name_key) = note_keys(to);
        tx.execute(
            "UPDATE notes SET path = ?1, path_key = ?2, name_key = ?3, dir = ?4, title = ?5, name_fold = ?7 WHERE id = ?6",
            params![
                to,
                path_key,
                name_key,
                dir_of(to),
                new_title,
                id,
                crate::search::name_fold(to)
            ],
        )?;
        tx.execute(
            "INSERT INTO notes_fts (rowid, path, title, content) VALUES (?1, ?2, ?3, ?4)",
            params![id, to, new_title, content],
        )?;
        // A target read relative to the note's folder points somewhere
        // else once the note is in another folder.
        let targets: Vec<(i64, String)> = {
            let mut st = tx.prepare("SELECT rowid, target FROM links WHERE note = ?1")?;
            let rows = st.query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?)))?;
            rows.collect::<Result<_, _>>()?
        };
        for (row, target) in targets {
            tx.execute(
                "UPDATE links SET rel_key = ?1 WHERE rowid = ?2",
                params![relative_key(to, &target), row],
            )?;
        }
        tx.commit()?;
        Ok(true)
    }

    /// What `[[target]]`, written in the note at `source`, resolves to now
    /// — by the rule of the queries (spec Q12: a path from the root, then a
    /// path from the source's folder, then a bare name preferring the
    /// source's own folder, then the fewest segments, then byte order).
    /// The source need not be indexed: its folder is all the rule needs.
    /// An empty target is the source itself; a target that is not a name
    /// (`[[nota/]]`, `[[.md]]`) is `None`.
    pub fn resolve_from(&self, source: &str, target: &str) -> Result<Option<String>, IndexError> {
        let Some(key) = target_key(target) else {
            return Ok(None);
        };
        if key.is_empty() {
            return Ok(Some(source.to_owned()));
        }
        let rel = relative_key(source, target);
        let dir = dir_of(source);
        Ok(self
            .conn
            .query_row(
                "SELECT path FROM notes WHERE id = COALESCE(
                    (SELECT id FROM notes WHERE path_key = ?1 ORDER BY path LIMIT 1),
                    (SELECT id FROM notes WHERE path_key = ?2 ORDER BY path LIMIT 1),
                    (SELECT n.id FROM notes n WHERE n.name_key = ?1
                     ORDER BY CASE WHEN ?3 = '' OR substr(n.path, 1, length(?3) + 1) = ?3 || '/'
                                   THEN 0 ELSE 1 END,
                              length(n.path) - length(replace(n.path, '/', '')),
                              n.path
                     LIMIT 1))",
                params![key, rel, dir],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// What a canvas's `file` node names: the note at that path from the
    /// root, never one found by name elsewhere (ADR 0057).
    pub fn resolve_exact(&self, target: &str) -> Result<Option<String>, IndexError> {
        let Some(key) = target_key(target).filter(|k| !k.is_empty()) else {
            return Ok(None);
        };
        Ok(self
            .conn
            .query_row(
                "SELECT path FROM notes WHERE path_key = ?1 ORDER BY path LIMIT 1",
                params![key],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// The notes holding a link whose target, folded as the index keys it
    /// — as written or read from the note's folder — is one of `keys`:
    /// every note that could name a given note or file, by path or by
    /// bare name, whatever each link resolves to. In path order, once
    /// each.
    pub fn links_naming(&self, keys: &[String]) -> Result<Vec<String>, IndexError> {
        if keys.is_empty() {
            return Ok(Vec::new());
        }
        let marks = (1..=keys.len())
            .map(|i| format!("?{i}"))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT DISTINCT n.path FROM links l JOIN notes n ON n.id = l.note
             WHERE l.target_key IN ({marks}) OR l.rel_key IN ({marks})
             ORDER BY n.path"
        );
        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map(rusqlite::params_from_iter(keys.iter()), |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

/// Remove the row at `path`, if any, from `notes_fts` and `notes`.
fn forget_path(tx: &rusqlite::Connection, path: &str) -> Result<(), IndexError> {
    let stale: Option<(i64, Option<String>, String)> = tx
        .query_row(
            "SELECT id, title, content FROM notes WHERE path = ?1",
            params![path],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    if let Some((id, title, content)) = stale {
        tx.execute(
            "INSERT INTO notes_fts (notes_fts, rowid, path, title, content) VALUES ('delete', ?1, ?2, ?3, ?4)",
            params![id, path, title, content],
        )?;
        tx.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
    }
    Ok(())
}
