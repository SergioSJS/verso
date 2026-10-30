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
        Ok(Self { root, path })
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
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let text = String::from_utf8(bytes).map_err(|_| CoreError::NotText)?;
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
        if !verso_fs::is_attachment_name(relative) {
            return None;
        }
        let handle = self.root.handle(relative).ok()?;
        self.root.length_and_time(handle).ok()?;
        Some(
            self.root
                .confine(relative)
                .ok()?
                .to_string_lossy()
                .replace('\\', "/"),
        )
    }

    /// The bytes of an attachment [`Loose::resolve_attachment`] admitted.
    pub fn read_attachment(&mut self, relative: &str) -> Result<Vec<u8>, CoreError> {
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
        let root = self
            .root
            .open_sibling(Path::new(target))
            .map_err(CoreError::Folder)?;
        let path = self
            .parent()
            .join(root.scope().map(Path::to_path_buf).unwrap_or_default());
        let path = std::path::absolute(path).map_err(CoreError::Folder)?;
        Ok(Self { root, path })
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
