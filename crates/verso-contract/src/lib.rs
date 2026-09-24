// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The contract between the core and the UI (ADR 0026): what crosses the
//! wire, as Rust types, from which the TypeScript side is generated and
//! never written by hand (rule 3; ADR 0038, decided 2026-09-22: specta,
//! with tauri-specta for the commands). Phase 2, item 2.1.
//!
//! Nothing here touches disk, the index or a window: this crate names
//! things. A note is named by its path relative to the open folder (rule
//! 4); the folder itself by its name and an opaque key — its path is a
//! string only at the entry edge, the command line and the native folder
//! picker, both on the host's side. No absolute path, and none with `..`,
//! crosses in either direction. Counts and positions are `u32` because the
//! TypeScript side has no 64-bit integer without `bigint`, and no note
//! has four billion lines.

use serde::{Deserialize, Serialize};
use specta::Type;

/// The folder that is open, and what indexing it did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderInfo {
    /// The folder's own name (its last path component), for display.
    pub name: String,
    /// An opaque, stable name for the folder that carries no path — the
    /// stem of its index file's name under the configuration directory:
    /// letters, digits and `-`. What a UI keeps its per-folder state
    /// under, and what `reopen_folder` takes to open the folder again.
    pub key: String,
    pub index: IndexSummary,
}

/// What changed in the open folder outside the app — another editor, a
/// sync client, git — as the watcher saw it and the index then found it:
/// the payload of the `folder-changed` event the host sends the app's
/// windows (provisional: `docs/reference/watcher-decision.md`). Notes are
/// named by their path relative to the folder (rule 4).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderChanged {
    /// The folder's key: a window showing another folder has nothing to do.
    pub key: String,
    /// Notes new or changed on disk: an open one is read again, or, with
    /// text not yet saved, marked as changed outside.
    pub changed: Vec<String>,
    /// Notes gone from disk: an open one is marked as gone.
    pub removed: Vec<String>,
    /// The index run's counts and problems, as `reindex` answers them.
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
    /// Problems the walk met and what the run could not do besides
    /// indexing, one readable line each with paths relative to the
    /// folder, for the UI to show.
    pub problems: Vec<String>,
}

/// Any file of the folder as text, with the revision `write_text` takes
/// back (invariant 11): the editor of files that are not notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TextFile {
    pub path: String,
    pub text: String,
    pub revision: String,
    /// What the write could not preserve, one line each; empty after a read.
    pub warnings: Vec<String>,
}

/// What one entry of the open folder is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Note,
    File,
    Folder,
    /// Present, content in the cloud (ADR 0043).
    Placeholder,
}

/// One entry of the open folder as the last walk saw it: what a folder
/// listing shows and sorts by. `size` and `modified` are `f64` because
/// the TypeScript side has no 64-bit integer without `bigint`: bytes are
/// exact up to 2^53, seconds since the epoch far beyond any date.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct FileEntry {
    pub path: String,
    pub kind: FileKind,
    /// Bytes; 0 for a folder or an unread placeholder.
    pub size: f64,
    /// Seconds since the Unix epoch; 0 when the file system gave none.
    pub modified: f64,
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
    /// gives back is written as is, no normalization (ADR 0012). A file
    /// whose bytes are not UTF-8 gives no text at all (`not_text`).
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

/// What a write left behind: the note as written — the text that was
/// sent, with the revision of those very bytes, never a re-read — and
/// what the atomic write could not guarantee, one line each (permissions,
/// owner, extended attributes, hard links, network file system,
/// durability). None means the content was lost; all are for the user
/// to see.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Written {
    pub note: NoteText,
    pub warnings: Vec<String>,
}

/// A note that links to what moved: its text before and after the links
/// are pointed at the new place, with the revision `write_note` takes
/// back. Shown, then applied, one note at a time (ADR 0048).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LinkRewrite {
    pub path: String,
    pub revision: String,
    pub before: String,
    pub after: String,
}

/// Why a note that links to what moved got no rewrite.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
    /// A placeholder: present, content not downloaded (ADR 0043).
    Unavailable,
    /// Not UTF-8: no text can be rewritten without loss.
    NotText,
    /// Could not be read; the error is among the warnings.
    Failed,
}

/// A note the plan could not cover: it links to what moved, and its links
/// may now point elsewhere or nowhere, but no rewrite could be made. The
/// UI lists them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Skipped {
    pub path: String,
    pub reason: SkipReason,
}

/// What a rename or a move left: the new path, the rewrites it calls for,
/// the notes it could not plan, and what could not be confirmed once the
/// entry had moved (a durability step, the index following, the
/// sidecar), one line each. The move happened whenever this is answered.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Renamed {
    pub path: String,
    pub rewrites: Vec<LinkRewrite>,
    pub skipped: Vec<Skipped>,
    pub warnings: Vec<String>,
}

/// What a deletion left: where the entry went in `.trash/`, and what
/// could not be confirmed once it was there, one line each.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Trashed {
    pub path: String,
    pub warnings: Vec<String>,
}

/// What the running app is: its version (the workspace's, ADR 0051) and the
/// commit it was built from — shown in the settings and the About panel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AppInfo {
    pub version: String,
    pub commit: String,
}

/// A note that is a web page: its path and the address in its `url`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct WebNote {
    pub path: String,
    pub url: String,
}

/// One resolved link of the vault, for the graph.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Edge {
    pub from: String,
    pub to: String,
}

/// A tag and the notes that carry it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Tag {
    pub name: String,
    pub notes: Vec<String>,
}

/// A frontmatter value, typed as the YAML gave it, for a properties
/// panel that shows a list as pills and a boolean as a checkbox. A number
/// crosses as its text, so the panel shows what was written.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum PropertyValue {
    Text(String),
    Number(String),
    Checkbox(bool),
    /// A list of plain strings; any other list is `Nested`.
    List(Vec<String>),
    /// A mapping, or a list with an item that is not a plain string,
    /// flattened to one line: shown, never edited by the panel — written
    /// back as text it would change type.
    Nested(String),
    /// `key:` with nothing after it (YAML null).
    Empty,
}

/// One frontmatter key and its value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Property {
    pub key: String,
    pub value: PropertyValue,
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
    /// ignored, empty); a folder key that is not one; a folder switch
    /// from a window that may not, or while a note window is open.
    Refused,
    /// No such file; no folder opened before has this key.
    NotFound,
    /// A placeholder: present, content not downloaded (ADR 0043).
    Unavailable,
    /// The file's bytes are not UTF-8: no text to edit (spec Q25 is
    /// `[OPEN]`; this is the least that keeps the file safe).
    NotText,
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
