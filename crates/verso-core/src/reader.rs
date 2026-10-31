// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder as an account that may only read it sees it on a UniVerso
//! (ADR 0087, decided 2026-10-14): every note through its projection —
//! the lines of its `> [!secret]` callouts taken out
//! (`verso_dialect::project`) — and every answer derived from the notes
//! from what the projection holds. A link, tag, heading or `^id` inside a
//! secret block does not exist here, no count counts it, and a line is
//! numbered as the projection numbers it; a note's length and time are
//! its projection's, so a change made only inside a secret block is no
//! change. Those who may write the note read the whole text, through the
//! functions without `reader_`.
//!
//! Reading never writes (invariant 7): these read the file through
//! `verso-fs` and change nothing on the disk or in the index.

use super::*;

/// Whether `path` names a note, a file with secret blocks (ADR 0087). Case
/// ignored, and trailing dots and spaces too, which a file system may drop
/// from a name (Windows): a name that reaches a note is a note's (fails
/// closed).
pub(crate) fn is_note(path: &str) -> bool {
    path.trim_end_matches(['.', ' '])
        .to_lowercase()
        .ends_with(".md")
}

/// Whether `path` names a board, the other file with something hidden from
/// readers: its secret pins (ADR 0090 item 5), judged by the same rules as
/// [`is_note`].
pub(crate) fn is_board(path: &str) -> bool {
    path.trim_end_matches(['.', ' '])
        .to_lowercase()
        .ends_with(".canvas")
}

/// What a file is served as to a reader.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Served {
    /// A note: its secret callouts are taken out.
    Note,
    /// A board: its secret pins are taken out.
    Board,
    /// A file under a name that says nothing — a hard link — which could be
    /// either: both are looked for in its bytes.
    Either,
}

/// `text` as a reader is served the file `served` says it is.
fn shown(served: Served, text: &str) -> std::borrow::Cow<'_, str> {
    use std::borrow::Cow;
    match served {
        Served::Note => {
            let secrets = verso_dialect::Secrets::of(text);
            if secrets.is_empty() {
                Cow::Borrowed(text)
            } else {
                Cow::Owned(secrets.project(text).into_owned())
            }
        }
        Served::Board => crate::canvas_secret::project(text),
        Served::Either => {
            let first = shown(Served::Note, text);
            // A file that only might be a board is judged as one only when
            // it reads as one: a text that mentions a secret stays a text.
            match crate::canvas::Canvas::parse(&first) {
                Ok(canvas) if !canvas.hidden().is_empty() => Cow::Owned(canvas.projected().write()),
                _ => first,
            }
        }
    }
}

/// FNV-1a of what a reader receives, as `verso_fs::Stamp` hashes a file.
pub(crate) fn fnv(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

/// The longest file whose bytes are read to look for a secret block when
/// it has no note's name: a note is served to a reader up to this.
const NOTE_MOST: u64 = 16 * 1024 * 1024;

impl Workspace {
    /// Whether the file at `key`, which has no note's name, is a note
    /// under another: a symlink (or a directory on its way) that ends at a
    /// note, or a hard link, whose other name could be one. What a reader
    /// reads of it is judged by its bytes, never by the name it is asked
    /// under (ADR 0087 item 4).
    fn note_by_another_name(&self, key: &str) -> bool {
        self.served_by_another_name(key).is_some()
    }

    /// What the file at `key` is served as when its own name does not say
    /// (see [`Self::note_by_another_name`]): by the file a link ends at, or
    /// [`Served::Either`] for a hard link.
    fn served_by_another_name(&self, key: &str) -> Option<Served> {
        if let Some(real) = self.root.resolved_name(Path::new(key)) {
            let real = real.to_string_lossy();
            if is_note(&real) {
                return Some(Served::Note);
            }
            if is_board(&real) {
                return Some(Served::Board);
            }
        }
        self.root
            .hard_linked(Path::new(key))
            .then_some(Served::Either)
    }

    /// What a reader is served the file at `relative` as: by its name, or
    /// by the file it really is; `None` for a file with nothing hidden.
    fn served_as(&self, relative: &str, key: &str) -> Option<Served> {
        if is_note(relative) || is_note(key) {
            return Some(Served::Note);
        }
        if is_board(relative) || is_board(key) {
            return Some(Served::Board);
        }
        self.served_by_another_name(key)
    }

    /// The text of the file at `relative` as a reader is served it, if it
    /// is not the file's own: a note's projection, a board without its
    /// secret pins. `None` when a reader is served the file as it is.
    #[must_use]
    pub fn reader_view(&self, relative: &str, text: &str) -> Option<String> {
        let key = self.confined(relative).ok()?;
        let served = self.served_as(relative, &key)?;
        match shown(served, text) {
            std::borrow::Cow::Borrowed(_) => None,
            std::borrow::Cow::Owned(own) => Some(own),
        }
    }

    /// Whether `relative` names a note for what a reader is told of it: by
    /// its name, or by the file it really is (a link to a note, a hard
    /// link). A path confinement refuses is none.
    #[must_use]
    pub fn reader_names_note(&self, relative: &str) -> bool {
        is_note(relative)
            || is_board(relative)
            || self
                .confined(relative)
                .is_ok_and(|key| is_note(&key) || is_board(&key) || self.note_by_another_name(&key))
    }

    /// Whether a file must not be sent to a reader as it is on disk, a
    /// piece at a time: it is a note under another name (see
    /// [`Self::note_by_another_name`]) and holds a secret block — a link to
    /// a note always does, for what its bytes hold is not looked for.
    pub fn reader_may_not_stream(&mut self, relative: &str) -> bool {
        let Ok(key) = self.entry_key(relative) else {
            return false;
        };
        // A board is judged by its bytes too, and always read whole: a
        // piece of it would carry a secret pin's.
        if is_note(&key) || is_board(&key) {
            return true;
        }
        let linked = self
            .root
            .resolved_name(Path::new(&key))
            .is_some_and(|real| {
                is_note(&real.to_string_lossy()) || is_board(&real.to_string_lossy())
            });
        if linked {
            return true;
        }
        if !self.root.hard_linked(Path::new(&key)) {
            return false;
        }
        match self.read_file(&key) {
            Ok(bytes) if (bytes.len() as u64) <= NOTE_MOST => {
                let text = String::from_utf8_lossy(&bytes);
                matches!(shown(Served::Either, &text), std::borrow::Cow::Owned(_))
            }
            _ => false,
        }
    }

    /// The revision a reader is given of a note whose public text is
    /// `shown`: of the projection — its length, its hash, and when the
    /// index last saw it change — so a change only inside a secret block
    /// gives none. A reader writes nothing, so it is never handed back.
    fn reader_revision(&self, path: &str, shown: &str, stamp: &Stamp) -> Result<String, CoreError> {
        let modified = self
            .index
            .reader_modified_of(path)
            .map_err(CoreError::Index)?
            .and_then(|s| u64::try_from(s).ok())
            .map_or(stamp.modified, |s| {
                UNIX_EPOCH + std::time::Duration::from_secs(s)
            });
        Ok(revision::encode(&Stamp {
            modified,
            len: shown.len() as u64,
            hash: fnv(shown.as_bytes()),
        }))
    }

    /// [`Self::read_note`] as a reader receives it: the projection, with
    /// its own headings, ids, HTML and properties.
    pub fn reader_read_note(&mut self, note: &str) -> Result<NoteText, CoreError> {
        let path = self.source_key(note)?;
        if !is_note(&path) && self.served_as(note, &path).is_none() {
            return self.read_note(note);
        }
        let handle = self
            .root
            .handle(Path::new(&path))
            .map_err(CoreError::Confined)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let text = String::from_utf8(bytes).map_err(|_| CoreError::NotText)?;
        // A board (or a file that may be one) read as text: its projection.
        if !is_note(&path)
            && let Some(served) = self.served_as(note, &path)
            && served != Served::Note
            && let std::borrow::Cow::Owned(own) = shown(served, &text)
        {
            let unverified = self
                .index
                .is_unverified(&path)
                .map_err(CoreError::Index)?
                .unwrap_or(false);
            let revision = self.reader_revision(&path, &own, &stamp)?;
            return self.note_text(path, own, revision, false, unverified);
        }
        let known = self.index.stamp_of(&path).map_err(CoreError::Index)?;
        let mut stale = known != Some(note_stamp(&stamp));
        let unverified = self
            .index
            .is_unverified(&path)
            .map_err(CoreError::Index)?
            .unwrap_or(false);
        let secrets = verso_dialect::Secrets::of(&text);
        // A reader is told the note is stale when the projection differs
        // from the public text the index holds, never because the file's
        // stamp moved: an edit made inside a secret block outside the
        // server must not show (ADR 0087 item 4).
        let public = self
            .index
            .reader_content_of(&path)
            .map_err(CoreError::Index)?;
        if !secrets.is_empty() || public.as_deref().is_some_and(|c| c != text) {
            stale = public.as_deref() != Some(secrets.project(&text).as_ref());
        }
        if secrets.is_empty() {
            return self.note_text(path, text, revision::encode(&stamp), stale, unverified);
        }
        let shown = secrets.project(&text).into_owned();
        let revision = self.reader_revision(&path, &shown, &stamp)?;
        // Every position from the projection itself, never the index's: a
        // block made secret since the last index run is not named.
        self.note_over(path, shown, revision, (stale, unverified))
    }

    /// The note `path` as a text `shown` makes it: its HTML, headings,
    /// ids, properties and type all from `shown`, never the index's. A
    /// reader's projection, and what the table's veil leaves of it (ADR
    /// 0110 item 4, [`Self::note_as_veiled`]).
    fn note_over(
        &self,
        path: String,
        shown: String,
        revision: String,
        (stale, unverified): (bool, bool),
    ) -> Result<NoteText, CoreError> {
        let document = verso_dialect::parse(&shown);
        let html = verso_dialect::to_html_with(&shown, &document);
        let schema_blocks = document.schemas.iter().map(typed::notice).collect();
        let headings = document
            .headings
            .iter()
            .map(|h| Heading {
                level: u32::from(h.level),
                text: h.text.clone(),
                line: h.pos.line,
                col: h.pos.col,
            })
            .collect();
        let blocks = document
            .blocks
            .iter()
            .map(|b| Block {
                id: b.id.clone(),
                line: b.pos.line,
                col: b.pos.col,
                first_line: b.lines.0,
                last_line: b.lines.1,
            })
            .collect();
        let note_type = self.note_type_within(&shown, &[])?;
        Ok(NoteText {
            lines: shown.lines().map(str::to_owned).collect(),
            html,
            properties: properties(&shown),
            note_type,
            schema_blocks,
            stale,
            unverified,
            headings,
            blocks,
            revision,
            text: shown,
            path,
        })
    }

    /// `note` as a player of a table is served it: the same note over the
    /// text `shown`, which the table's veil made (links to notes not yet
    /// released drawn as text, ADR 0110 item 7). Everything derived from
    /// the text is derived again from `shown`.
    pub fn note_as_veiled(&self, note: NoteText, shown: String) -> Result<NoteText, CoreError> {
        let flags = (note.stale, note.unverified);
        self.note_over(note.path, shown, note.revision, flags)
    }

    /// The path `target`, written in the note at `source` as a link or an
    /// embed, reaches now: a note by the index's rule, else a file (spec
    /// Q12). `None` when it reaches nothing.
    #[must_use]
    pub fn reached_path(&self, source: &str, target: &str) -> Option<String> {
        self.reach(source, target)
            .ok()
            .flatten()
            .map(|r| r.path().to_owned())
    }

    /// The path a board's `file` node reaches: the one at that path from
    /// the root (ADR 0057).
    #[must_use]
    pub fn reached_exact(&self, target: &str) -> Option<String> {
        self.reach_exact(target)
            .ok()
            .flatten()
            .map(|r| r.path().to_owned())
    }

    /// [`Self::read_text`] as a reader receives it: a note's projection, a
    /// board without its secret pins.
    pub fn reader_read_text(&mut self, relative: &str) -> Result<TextFile, CoreError> {
        let key = self.entry_key(relative)?;
        let Some(served) = self.served_as(relative, &key) else {
            return self.read_text(relative);
        };
        let handle = self
            .root
            .handle(Path::new(&key))
            .map_err(CoreError::Confined)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let text = String::from_utf8(bytes).map_err(|_| CoreError::NotText)?;
        let shown = match shown(served, &text) {
            std::borrow::Cow::Borrowed(_) => {
                return Ok(TextFile {
                    path: key,
                    text,
                    revision: revision::encode(&stamp),
                    warnings: Vec::new(),
                });
            }
            std::borrow::Cow::Owned(own) => own,
        };
        let revision = self.reader_revision(&key, &shown, &stamp)?;
        Ok(TextFile {
            path: key,
            text: shown,
            revision,
            warnings: Vec::new(),
        })
    }

    /// [`Self::read_file`] as a reader receives it: a note's bytes are its
    /// projection's. A note whose bytes are not UTF-8 is projected from
    /// its lossy text, which a reader only views (`read_file_text`).
    pub fn reader_read_file(&mut self, relative: &str) -> Result<Vec<u8>, CoreError> {
        let bytes = self.read_file(relative)?;
        // By the name asked and by the name confinement reads.
        let confined = self.confined(relative)?;
        let Some(served) = self.served_as(relative, &confined) else {
            return Ok(bytes);
        };
        let text = String::from_utf8_lossy(&bytes);
        Ok(match shown(served, &text) {
            std::borrow::Cow::Borrowed(_) => bytes,
            std::borrow::Cow::Owned(own) => own.into_bytes(),
        })
    }

    /// [`Self::search`] as a reader asks it: the secret blocks' words are
    /// not looked for and no excerpt is cut from them.
    pub fn reader_search(&self, words: &str, limit: usize) -> Result<Vec<Hit>, CoreError> {
        self.index
            .reader_search(words, limit)
            .map_err(CoreError::Index)
    }

    /// [`Self::backlinks`] as a reader asks it.
    pub fn reader_backlinks(&mut self, note: &str) -> Result<Option<Vec<Backlink>>, CoreError> {
        let mut path = self.source_key(note)?;
        if !self.known(&path)? {
            match self.index.note_named(note).map_err(CoreError::Index)? {
                Some(found) => path = found,
                None => return Ok(None),
            }
        }
        self.index
            .reader_backlinks(&path)
            .map(Some)
            .map_err(CoreError::Index)
    }

    /// [`Self::links`] as a reader asks it.
    pub fn reader_links(&mut self, note: &str) -> Result<Option<Vec<Link>>, CoreError> {
        let path = self.source_key(note)?;
        if !self.known(&path)? {
            return Ok(None);
        }
        self.index
            .reader_links_of(&path)
            .map(Some)
            .map_err(CoreError::Index)
    }

    /// [`Self::block_ids`] as a reader asks it: no block inside a secret
    /// block (ADR 0087).
    pub fn reader_block_ids(
        &self,
        kinds: &[crate::IndexBlockKind],
    ) -> Result<crate::IndexBlockList, CoreError> {
        self.index
            .reader_folder_blocks(kinds)
            .map_err(CoreError::Index)
    }

    /// [`Self::graph`] as a reader asks it.
    pub fn reader_graph(&self) -> Result<Vec<(String, String)>, CoreError> {
        self.index.reader_graph().map_err(CoreError::Index)
    }

    /// [`Self::graph_unresolved`] as a reader asks it: without a link
    /// inside a secret block.
    pub fn reader_graph_unresolved(&self) -> Result<Vec<(String, String)>, CoreError> {
        let links = self.index.reader_all_links().map_err(CoreError::Index)?;
        Ok(self.missing_of(links))
    }

    /// [`Self::tags`] as a reader asks it.
    pub fn reader_tags(&self) -> Result<Vec<(String, Vec<String>)>, CoreError> {
        self.index.reader_tags().map_err(CoreError::Index)
    }

    /// The entries of the last walk as a reader is told of them: a note's
    /// length its projection's, and its time when that last changed.
    pub fn reader_entries(&self) -> Result<Vec<FileEntry>, CoreError> {
        let stats = self.index.reader_stats().map_err(CoreError::Index)?;
        Ok(self
            .entries
            .iter()
            .map(|e| match stats.get(&e.path) {
                Some(&(len, modified)) if e.kind == FileKind::Note || is_board(&e.path) => {
                    FileEntry {
                        len,
                        modified,
                        ..e.clone()
                    }
                }
                _ => e.clone(),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::fnv;

    #[test]
    fn the_reader_s_hash_is_the_file_s() {
        // Empty input: FNV-1a's offset basis, as `verso_fs::Stamp` has it.
        assert_eq!(fnv(b""), 0xcbf2_9ce4_8422_2325);
        assert_ne!(fnv(b"a"), fnv(b"b"));
    }
}
