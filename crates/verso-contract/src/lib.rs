// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The contract between the core and the UI (ADR 0026): what crosses the
//! wire, as Rust types, from which the TypeScript side is generated and
//! never written by hand (rule 3; ADR 0038, decided 2026-09-22: specta,
//! with tauri-specta for the commands). Phase 2, item 2.1, first cut:
//! read-only, enough for a window that opens a folder, lists its notes,
//! shows one, searches and lists backlinks.
//!
//! Nothing here touches disk, the index or a window: this crate names
//! things. A note is named by its path relative to the open folder (rule
//! 4); the folder's own path is a string only at the entry edge, the
//! `open_folder` command. Counts and positions are `u32` because the
//! TypeScript side has no 64-bit integer without `bigint`, and no note
//! has four billion lines.

use serde::{Deserialize, Serialize};
use specta::Type;

/// The folder that is open, and what indexing it did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderInfo {
    /// Absolute, normalized: the one path string that crosses (rule 4).
    pub folder: String,
    pub index: IndexSummary,
}

/// What one `index` run did (ADR 0043: placeholders are present, never
/// removed).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct IndexSummary {
    pub indexed: u32,
    pub unchanged: u32,
    pub removed: u32,
    pub placeholders: u32,
    /// Problems the walk met, one line each, for the UI to show.
    pub problems: Vec<String>,
}

/// A heading of a note, for citing and for the outline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Heading {
    pub level: u32,
    pub text: String,
    pub line: u32,
    pub col: u32,
}

/// A `^id` block of a note (ADR 0018: cite this instead of a position).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Block {
    pub id: String,
    pub line: u32,
    pub col: u32,
}

/// A note's text as it is on disk now, with what the index knows of it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct NoteText {
    pub path: String,
    /// Without line endings; line `n` (1-based) is `lines[n - 1]`.
    pub lines: Vec<String>,
    /// The note rendered as HTML by the core's own parser, for a preview:
    /// wikilinks are `<a class="wikilink" data-target>`, embeds
    /// `<span class="embed" data-target>`; the UI resolves targets
    /// through `links`.
    pub html: String,
    /// The frontmatter as a properties panel shows it: key and one line
    /// of text per value, in the order written.
    pub properties: Vec<Property>,
    /// The whole text as read, line endings included: what the editor
    /// gives back is written as is, no normalization (ADR 0012).
    pub text: String,
    /// Opaque: what was read. `write_note` takes it back and refuses a
    /// file that changed meanwhile (invariant 11, `changed`).
    pub revision: String,
    pub headings: Vec<Heading>,
    pub blocks: Vec<Block>,
    /// The file differs from what the index holds: graph answers may be
    /// behind this text.
    pub stale: bool,
    /// The index holds the note only as a last known version: a
    /// placeholder stood where it was (ADR 0043).
    pub unverified: bool,
}

/// What a write left behind: the note as it now is, and what the atomic
/// write could not guarantee, one line each (permissions, owner, extended
/// attributes, hard links, network file system, durability). None means
/// the content was lost; all are for the user to see.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Written {
    pub note: NoteText,
    pub warnings: Vec<String>,
}

/// A note that links to a renamed note: its text before and after the
/// links are pointed at the new name, with the revision `write_note`
/// takes back. Shown, then applied, one note at a time (ADR 0048).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LinkRewrite {
    pub path: String,
    pub revision: String,
    pub before: String,
    pub after: String,
}

/// What a rename left: the new path, and the rewrites it calls for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Renamed {
    pub path: String,
    pub rewrites: Vec<LinkRewrite>,
}

/// A tag and the notes that carry it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Tag {
    pub name: String,
    pub notes: Vec<String>,
}

/// One frontmatter key and its value as text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Property {
    pub key: String,
    pub value: String,
}

/// One search hit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Hit {
    pub path: String,
    pub snippet: String,
}

/// A link a note makes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Link {
    /// As written in the note.
    pub target: String,
    /// The note it resolves to, or none.
    pub resolved: Option<String>,
    pub embed: bool,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub alias: Option<String>,
    pub line: u32,
    pub col: u32,
}

/// A link into a note, from another.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Backlink {
    pub from: String,
    pub target: String,
    pub embed: bool,
    pub line: u32,
    pub col: u32,
}

/// Why a command could not answer, by what the UI can do about it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// No folder is open yet.
    NoFolder,
    /// The path cannot name a note of the folder (absolute, `..`, hidden,
    /// ignored, empty).
    Refused,
    /// No such file.
    NotFound,
    /// A placeholder: present, content not downloaded (ADR 0043).
    Unavailable,
    /// The file on disk is not the one that was read: nothing was
    /// written; read again and show both versions (invariant 11).
    Changed,
    /// Something already stands where a note would be created or moved.
    Exists,
    /// The core could not answer.
    Failed,
}

/// An error as the UI receives it. `message` is the core's text, in
/// English: which language it should speak is the UI's `[OPEN]` under
/// ADR 0035, recorded here rather than decided.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ContractError {
    pub kind: ErrorKind,
    pub message: String,
}

impl std::fmt::Display for ContractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ContractError {}
