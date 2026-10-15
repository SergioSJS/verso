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

/// Whether `path` names a note, the only kind of file with secret blocks
/// (a board's secret pins are ADR 0090's, a later wave). Case ignored, and
/// trailing dots and spaces too, which a file system may drop from a name
/// (Windows): a name that reaches a note is a note's (fails closed).
pub(crate) fn is_note(path: &str) -> bool {
    path.trim_end_matches(['.', ' '])
        .to_lowercase()
        .ends_with(".md")
}

/// FNV-1a of what a reader receives, as `verso_fs::Stamp` hashes a file.
fn fnv(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

impl Workspace {
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
        if !is_note(&path) {
            return self.read_note(note);
        }
        let handle = self
            .root
            .handle(Path::new(&path))
            .map_err(CoreError::Confined)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let text = String::from_utf8(bytes).map_err(|_| CoreError::NotText)?;
        let known = self.index.stamp_of(&path).map_err(CoreError::Index)?;
        let stale = known != Some(note_stamp(&stamp));
        let unverified = self
            .index
            .is_unverified(&path)
            .map_err(CoreError::Index)?
            .unwrap_or(false);
        let secrets = verso_dialect::Secrets::of(&text);
        if secrets.is_empty() {
            return self.note_text(path, text, revision::encode(&stamp), stale, unverified);
        }
        let shown = secrets.project(&text).into_owned();
        let revision = self.reader_revision(&path, &shown, &stamp)?;
        // Every position from the projection itself, never the index's: a
        // block made secret since the last index run is not named.
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

    /// [`Self::read_text`] as a reader receives it: a note's projection.
    pub fn reader_read_text(&mut self, relative: &str) -> Result<TextFile, CoreError> {
        let key = self.entry_key(relative)?;
        if !is_note(&key) && !is_note(relative) {
            return self.read_text(relative);
        }
        let handle = self
            .root
            .handle(Path::new(&key))
            .map_err(CoreError::Confined)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let text = String::from_utf8(bytes).map_err(|_| CoreError::NotText)?;
        let secrets = verso_dialect::Secrets::of(&text);
        if secrets.is_empty() {
            return Ok(TextFile {
                path: key,
                text,
                revision: revision::encode(&stamp),
                warnings: Vec::new(),
            });
        }
        let shown = secrets.project(&text).into_owned();
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
        if !is_note(relative) && !is_note(&confined) {
            return Ok(bytes);
        }
        let text = String::from_utf8_lossy(&bytes);
        let secrets = verso_dialect::Secrets::of(&text);
        if secrets.is_empty() {
            return Ok(bytes);
        }
        Ok(secrets.project(&text).into_owned().into_bytes())
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

    /// [`Self::graph`] as a reader asks it.
    pub fn reader_graph(&self) -> Result<Vec<(String, String)>, CoreError> {
        self.index.reader_graph().map_err(CoreError::Index)
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
                Some(&(len, modified)) if e.kind == FileKind::Note => FileEntry {
                    len,
                    modified,
                    ..e.clone()
                },
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
