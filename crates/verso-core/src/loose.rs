// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! One Markdown file opened without a folder (ADR 0114 item 17): a
//! [`Root`] scoped to the file, no [`Index`], no configuration directory,
//! nothing written beside the file. What `read_note` builds from the
//! dialect — lines, headings, blocks, HTML, properties, the text, the
//! revision — is built here from the parse alone, with `stale` and
//! `unverified` false (there is no index to be behind); the write checks
//! the stamp the read returned (invariant 11) through `verso-fs` as a
//! folder's does.

use std::path::{Path, PathBuf};

use verso_fs::{ReadOnlyWhy, Root};
use verso_index::{Block, Heading};

use crate::{CoreError, NoteText, Written, properties, revision, typed};

/// The bound above which a loose file is shown read only, in Source (ADR
/// 0114 item 13, Q9: no folder bound exists, so the build names the
/// number): 8 MiB.
pub const LOOSE_MAX_BYTES: u64 = 8 * 1024 * 1024;

/// The bound above which a loose file is not even read: a file this large
/// is no note, and reading it whole would exhaust the host's memory.
pub const LOOSE_READ_CAP: u64 = 64 * 1024 * 1024;

/// Why a loose file opens for reading only.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LooseReadOnly {
    /// The file or its folder cannot be written: the system's reason.
    Permissions(String),
    /// Above [`LOOSE_MAX_BYTES`].
    TooLarge,
}

/// One file, open: the one place its path is held, on the host's side.
pub struct Loose {
    root: Root,
    /// The file, absolute: for the host, which opens its parent as a
    /// folder on request (item 9); it never crosses the contract.
    path: PathBuf,
    /// The text last read or written: what "cited" is judged against.
    text: String,
    /// The attachments the note's current text cites that were admitted:
    /// the target as written -> the name relative to the parent. Only
    /// these are served (ADR 0114 Q5); a new read or write forgets those
    /// the new text no longer cites.
    cited: std::collections::HashMap<String, String>,
}

/// Whether `text` cites `target`: as written, with spaces as `%20`, or
/// percent-encoded the way the renderer writes an address.
fn cites(text: &str, target: &str) -> bool {
    if text.contains(target) || text.contains(&target.replace(' ', "%20")) {
        return true;
    }
    let mut encoded = String::new();
    for b in target.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~' | b'/') {
            encoded.push(char::from(b));
        } else {
            encoded.push_str(&format!("%{b:02X}"));
        }
    }
    text.contains(&encoded)
}

impl std::fmt::Debug for Loose {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Loose").field("path", &self.path).finish()
    }
}

impl Loose {
    /// Open the file at `path` (the entry edge): its parent as a scoped
    /// root. Nothing is read yet.
    pub fn open(path: &Path) -> Result<Self, CoreError> {
        let root = Root::open_file(path).map_err(CoreError::Folder)?;
        let path = std::path::absolute(path).map_err(CoreError::Folder)?;
        Ok(Self::new(root, path))
    }

    fn new(root: Root, path: PathBuf) -> Self {
        Self {
            root,
            path,
            text: String::new(),
            cited: std::collections::HashMap::new(),
        }
    }

    /// Remember `text` as the note's current text: an admitted attachment
    /// it no longer cites is forgotten.
    fn remember(&mut self, text: &str) {
        text.clone_into(&mut self.text);
        let text = &self.text;
        self.cited.retain(|target, _| cites(text, target));
    }

    /// The file, absolute: the host's, never the window's (rule 4).
    #[must_use]
    pub fn file_path(&self) -> &Path {
        &self.path
    }

    /// The parent directory, absolute: what "Open the whole folder in
    /// Verso" opens (item 9). The host's.
    #[must_use]
    pub fn parent(&self) -> &Path {
        self.path.parent().unwrap_or(&self.path)
    }

    /// The file's name with its extension.
    #[must_use]
    pub fn name(&self) -> String {
        self.path
            .file_name()
            .map_or_else(String::new, |n| n.to_string_lossy().into_owned())
    }

    /// The parent folder's own name, the label beside the title.
    #[must_use]
    pub fn place(&self) -> String {
        self.parent()
            .file_name()
            .map_or_else(|| "/".to_owned(), |n| n.to_string_lossy().into_owned())
    }

    /// An opaque, stable key for the file, of the shape a folder's key has
    /// (letters, digits and `-`; a name part and a hash of the absolute
    /// path): never a path.
    #[must_use]
    pub fn key(&self) -> String {
        crate::folder_key(&self.path)
    }

    /// Why the file is read only now, if it is (items 12 and 13).
    #[must_use]
    pub fn read_only(&self) -> Option<LooseReadOnly> {
        if let Some(ReadOnlyWhy::Permissions(why)) = self.root.scoped_read_only() {
            return Some(LooseReadOnly::Permissions(why));
        }
        match self.root.scoped_len() {
            Ok(len) if len > LOOSE_MAX_BYTES => Some(LooseReadOnly::TooLarge),
            _ => None,
        }
    }

    /// Refuse a write the window should not have offered: the file is read
    /// only (permissions, too large) or the new text is above the bound.
    fn check_writable(&self, new_len: usize) -> Result<(), CoreError> {
        if new_len as u64 > LOOSE_MAX_BYTES {
            return Err(CoreError::Loose(
                "the text is too large to be saved".to_owned(),
            ));
        }
        match self.read_only() {
            Some(LooseReadOnly::TooLarge) => Err(CoreError::Loose(
                "the file is too large to be edited here".to_owned(),
            )),
            Some(LooseReadOnly::Permissions(why)) => {
                Err(CoreError::Loose(format!("the file is read only: {why}")))
            }
            None => self.root.scoped_dir_writable().map_err(|e| {
                CoreError::Loose(format!("the file's folder cannot be written: {}", e.kind()))
            }),
        }
    }

    /// The file's length in bytes; 0 when it cannot be told.
    #[must_use]
    pub fn size(&self) -> u64 {
        self.root.scoped_len().unwrap_or(0)
    }

    /// The note from `text` just read or written, named `path` (the name
    /// the window knows it by), with the headings and blocks of the parse.
    fn note_text(path: &str, text: String, revision: String) -> NoteText {
        let document = verso_dialect::parse(&text);
        let html = verso_dialect::to_html_with(&text, &document);
        NoteText {
            lines: text.lines().map(str::to_owned).collect(),
            html,
            properties: properties(&text),
            note_type: None,
            schema_blocks: document.schemas.iter().map(typed::notice).collect(),
            stale: false,
            unverified: false,
            headings: document
                .headings
                .iter()
                .map(|h| Heading {
                    level: u32::from(h.level),
                    text: h.text.clone(),
                    line: h.pos.line,
                    col: h.pos.col,
                })
                .collect(),
            blocks: document
                .blocks
                .iter()
                .map(|b| Block {
                    id: b.id.clone(),
                    line: b.pos.line,
                    col: b.pos.col,
                    first_line: b.lines.0,
                    last_line: b.lines.1,
                })
                .collect(),
            revision,
            text,
            path: path.to_owned(),
        }
    }

    /// The file's text as it is on disk now, named `as_path` for the
    /// window: a placeholder is `Read(Unavailable)`, never empty text (ADR
    /// 0043); bytes that are not UTF-8 are `NotText`.
    pub fn read(&mut self, as_path: &str) -> Result<NoteText, CoreError> {
        let handle = self.root.scoped_file().map_err(CoreError::Confined)?;
        if self.root.scoped_len().is_ok_and(|len| len > LOOSE_READ_CAP) {
            return Err(CoreError::Loose(
                "the file is too large to be opened as a note".to_owned(),
            ));
        }
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let text = String::from_utf8(bytes).map_err(|_| CoreError::NotText)?;
        self.remember(&text);
        Ok(Self::note_text(as_path, text, revision::encode(&stamp)))
    }

    /// Write `text` over the file `revision` describes, atomically (item
    /// 10): refused with `Write(Changed)` when the file is no longer the
    /// one that was read (invariant 11). The bytes are the caller's, as
    /// given (invariants 7–8).
    pub fn write(
        &mut self,
        as_path: &str,
        text: &str,
        revision: &str,
    ) -> Result<Written, CoreError> {
        self.check_writable(text.len())?;
        let handle = self.root.scoped_file().map_err(CoreError::Confined)?;
        let expected = crate::Workspace::decode_revision(revision)?;
        let report = self
            .root
            .write(handle, text.as_bytes(), &expected)
            .map_err(CoreError::Write)?;
        let stamp = match report.stamp {
            Some(stamp) => stamp,
            None => match self.root.read(handle) {
                Ok((bytes, stamp)) if bytes == text.as_bytes() => stamp,
                _ => revision::impossible(),
            },
        };
        self.remember(text);
        let mut warnings = report.warnings();
        if report.wrote_through_symlink_to.is_some() {
            warnings.push("written through a symlink".to_owned());
        }
        Ok(Written {
            note: Self::note_text(as_path, text.to_owned(), revision::encode(&stamp)),
            warnings,
        })
    }

    /// The file made again at its name after it was deleted or moved
    /// outside (item 11, "Save here again"): `Write(Exists)` when
    /// something reappeared there.
    pub fn save_again(&mut self, as_path: &str, text: &str) -> Result<Written, CoreError> {
        if text.len() as u64 > LOOSE_MAX_BYTES {
            return Err(CoreError::Loose(
                "the text is too large to be saved".to_owned(),
            ));
        }
        let (handle, report) = self
            .root
            .create_scoped(text.as_bytes())
            .map_err(CoreError::Write)?;
        let stamp = match report.stamp {
            Some(stamp) => stamp,
            None => match self.root.read(handle) {
                Ok((bytes, stamp)) if bytes == text.as_bytes() => stamp,
                _ => revision::impossible(),
            },
        };
        self.remember(text);
        Ok(Written {
            note: Self::note_text(as_path, text.to_owned(), revision::encode(&stamp)),
            warnings: report.warnings(),
        })
    }

    /// The attachment an embed names, relative to the parent, when it is
    /// of an attachment kind, admissible and there (item 14): the name as
    /// written, `#` and `|` parts dropped; `None` otherwise. One `stat`,
    /// no listing.
    pub fn resolve_attachment(&mut self, target: &str) -> Option<String> {
        let target = target.split(['#', '|']).next().unwrap_or_default().trim();
        if target.is_empty() || target.ends_with('/') {
            return None;
        }
        let relative = Path::new(target);
        if !verso_fs::is_attachment_name(relative) || !cites(&self.text, target) {
            return None;
        }
        let handle = self.root.handle(relative).ok()?;
        self.root.length_and_time(handle).ok()?;
        let found = self
            .root
            .confine(relative)
            .ok()?
            .to_string_lossy()
            .replace('\\', "/");
        self.cited.insert(target.to_owned(), found.clone());
        Some(found)
    }

    /// The bytes of an attachment [`Loose::resolve_attachment`] admitted and
    /// the note's current text still cites; any other is refused.
    pub fn read_attachment(&mut self, relative: &str) -> Result<Vec<u8>, CoreError> {
        if !self.cited.values().any(|c| c == relative) {
            return Err(CoreError::Confined(verso_fs::ConfinementError::OutOfScope));
        }
        let relative = Path::new(relative);
        if !verso_fs::is_attachment_name(relative) {
            return Err(CoreError::Confined(verso_fs::ConfinementError::OutOfScope));
        }
        let handle = self.root.handle(relative).map_err(CoreError::Confined)?;
        let (bytes, _) = self.root.read(handle).map_err(CoreError::Read)?;
        Ok(bytes)
    }

    /// A sibling note a link names (`[[Nome]]`, `[t](outra.md)`), as the
    /// name it has beside this file, when it exists: one `stat` (item 14).
    #[must_use]
    pub fn sibling_note(&self, target: &str) -> Option<String> {
        let target = target.split(['#', '|']).next().unwrap_or_default().trim();
        if target.is_empty() {
            return None;
        }
        self.root
            .sibling_note(Path::new(target))
            .map(|p| p.to_string_lossy().replace('\\', "/"))
    }

    /// Open the sibling note `target` names as a scope of its own.
    pub fn open_sibling(&self, target: &str) -> Result<Self, CoreError> {
        let target = target.split(['#', '|']).next().unwrap_or_default().trim();
        let relative = self
            .root
            .sibling_note(Path::new(target))
            .ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "no such note beside this file",
                )
            })
            .map_err(CoreError::Folder)?;
        let root = self
            .root
            .open_sibling(Path::new(target))
            .map_err(CoreError::Folder)?;
        // The path keeps the sub folders (`sub/outra.md`), not only the
        // scoped name: two files of one name in two folders stay two files.
        let path = std::path::absolute(self.parent().join(relative)).map_err(CoreError::Folder)?;
        Ok(Self::new(root, path))
    }

    /// The links of the note, each resolved to a sibling note by one
    /// `stat` when one of that name is there (item 14), unresolved
    /// otherwise; a note embed resolves as a link does and is drawn as one,
    /// never inlined. An attachment's embed is `resolve_attachment`'s.
    pub fn links(&mut self, as_path: &str) -> Result<Vec<verso_index::Link>, CoreError> {
        let note = self.read(as_path)?;
        let document = verso_dialect::parse(&note.text);
        let mut out = Vec::new();
        for l in &document.links {
            out.push(verso_index::Link {
                embed: false,
                target: l.target.clone(),
                heading: l.heading.clone(),
                block: l.block.clone(),
                alias: l.alias.clone(),
                line: l.pos.line,
                col: l.pos.col,
                resolved: self.sibling_note(&l.target),
                relation: None,
            });
        }
        for e in &document.embeds {
            out.push(verso_index::Link {
                embed: true,
                target: e.target.clone(),
                heading: e.heading.clone(),
                block: e.block.clone(),
                alias: e.alias.clone(),
                line: e.pos.line,
                col: e.pos.col,
                resolved: self.sibling_note(&e.target),
                relation: None,
            });
        }
        Ok(out)
    }

    /// Whether the file is still there (a watch's batch asks): `false`
    /// once it was deleted or moved outside.
    #[must_use]
    pub fn exists(&self) -> bool {
        !matches!(
            self.root.scoped_len(),
            Err(verso_fs::ReadError::Io(ref e)) if e.kind() == std::io::ErrorKind::NotFound
        )
    }

    /// Save `text` as a new file at `path` — the system's save dialog's
    /// answer, on the host's side (item 11, "Save a copy…") — through
    /// `verso-fs`, atomically, never replacing what stands there.
    pub fn save_copy_at(path: &Path, text: &str) -> Result<(), CoreError> {
        let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
            return Err(CoreError::Folder(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "the chosen place has no folder",
            )));
        };
        let mut root = Root::open(parent, Vec::new()).map_err(CoreError::Folder)?;
        root.create(Path::new(name), text.as_bytes())
            .map(|_| ())
            .map_err(CoreError::Write)
    }

    /// Watch the file for changes made outside (item 11): the parent
    /// directory, not recursive, events filtered to this name.
    pub fn watch(
        &self,
        on_change: impl FnMut(verso_fs::Changes) + Send + 'static,
    ) -> Result<verso_fs::Watch, CoreError> {
        self.root
            .watch(std::time::Duration::from_millis(400), &[], on_change)
            .map_err(CoreError::Watch)
    }

    /// Whether the file is a placeholder whose content is only in the
    /// cloud, so the host can bring it down before a read (ADR 0043).
    pub fn placeholder(&mut self) -> Result<Option<verso_fs::Placeholder>, CoreError> {
        let handle = self.root.scoped_file().map_err(CoreError::Confined)?;
        self.root.placeholder(handle).map_err(CoreError::Read)
    }
}
