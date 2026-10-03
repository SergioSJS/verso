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

/// What changed in the open folder, as the watcher saw it and the index
/// then found it: the payload of the `folder-changed` event the host sends
/// the app's windows after every batch of changes (provisional:
/// `docs/reference/watcher-decision.md`). Notes are named by their path
/// relative to the folder (rule 4). The lists are what this batch's index
/// run found; another run may have found a change first, so a window
/// checks every note it shows against the disk whatever they say — read
/// again when nothing was typed in it, saved at once otherwise, which meets
/// the difference (invariant 11), marked when it is gone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderChanged {
    /// The folder's key: a window showing another folder has nothing to do.
    pub key: String,
    /// Notes this run found new or different on disk.
    pub changed: Vec<String>,
    /// Notes this run found gone from disk.
    pub removed: Vec<String>,
    /// Whether which entries there are, or of which kind, changed: a tree
    /// or a folder view is drawn again only then.
    pub listing: bool,
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
    /// The folder is not watched for changes made outside the app: the
    /// operating system's reason, as it gives it (no path). The UI says
    /// what that means, in the user's language (ADR 0035).
    pub unwatched: Option<String>,
    /// The folder changed and this index run could not bring the index up
    /// to date: the core's reason. The UI says it in the user's language.
    pub unindexed: Option<String>,
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

/// A named root of the file tree (ADR 0062).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Focus {
    pub name: String,
    pub paths: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sticker: Option<String>,
}

/// Machine-readable code for the reason `.space/waypoints.json` is read-only (ADR 0062).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ReadOnlyReasonCode {
    CloudPlaceholder,
    InvalidJson,
    UnknownFormat,
}

/// The result of reading focuses from the open folder (ADR 0062).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FocusesSummary {
    /// Focuses found in `.space/waypoints.json`, or empty if no file.
    pub focuses: Vec<Focus>,
    /// Whether `.space/waypoints.json` is present in the open folder.
    pub has_file: bool,
    /// Whether `.space/waypoints.json` is in the known format (ADR 0062 D6).
    pub format_known: bool,
    /// Why the file is read-only, if not known format or unreadable.
    pub read_only_reason: Option<String>,
    /// Machine-readable code for read-only reason.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_only_code: Option<ReadOnlyReasonCode>,
    /// The revision stamp for optimistic concurrency (Invariants 9 & 11).
    pub stamp: Option<String>,
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

/// Sticker and color of an entry (note or folder), plus its first alias
/// when one exists, and manual order and pinned lists (ADR 0060, S1, S3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct EntryLabel {
    pub sticker: Option<String>,
    pub color: Option<String>,
    pub alias: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinned: Option<Vec<String>>,
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
    pub label: Option<EntryLabel>,
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
    /// What else moved with the entry, by a rule of its own: a folder's
    /// note taking the folder's new name (ADR 0060). Old path to new.
    pub also: Vec<Moved>,
}

/// A file that moved, from one relative path to another.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Moved {
    pub from: String,
    pub to: String,
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

/// Information about an application update.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct UpdateInfo {
    /// The currently running version (e.g. "0.2.0-beta.2").
    pub current_version: String,
    /// The latest version available on GitHub (e.g. "0.2.0-beta.3").
    pub latest_version: String,
    /// Whether an update is available (latest_version > current_version).
    pub has_update: bool,
    /// Release title (e.g. "Verso Beta 0.2.0-beta.3").
    pub release_name: String,
    /// Changelog / release notes in Markdown.
    pub release_notes: String,
    /// Direct asset download URL (or browser download url).
    pub download_url: Option<String>,
    /// GitHub API asset URL (used for authenticated downloads if repo is private).
    pub asset_url: Option<String>,
    /// Name of the download file (e.g. "Verso-Beta-0.2.0-beta.3-macos-arm64.zip").
    pub asset_name: Option<String>,
    /// Size of the asset in bytes.
    pub asset_size: Option<f64>,
    /// ISO 8601 publication timestamp.
    pub published_at: Option<String>,
}

/// Download progress payload emitted during update downloads.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct UpdateProgress {
    pub downloaded_bytes: f64,
    pub total_bytes: Option<f64>,
    pub percent: Option<f64>,
    /// "downloading" | "extracting" | "installing" | "done" | "error"
    pub status: String,
    pub message: Option<String>,
}

/// Progress payload emitted during vault indexing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct IndexProgress {
    /// "scanning" | "indexing" | "done"
    pub phase: String,
    pub current: u32,
    pub total: u32,
    pub file: Option<String>,
}

/// Result of an in-app update installation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct InstallResult {
    pub success: bool,
    pub message: String,
    pub app_path: Option<String>,
    pub requires_restart: bool,
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
    /// The file is not a board: not a `.canvas`, or not JSON (ADR 0057);
    /// the text view is where it gets fixed.
    NotCanvas,
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

/// A base to evaluate (ADR 0053): a `.base` file, or the text of a `base`
/// block of a note; the view to show; the window's clock and language.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BaseQuery {
    /// The `.base` file, relative to the folder, when the base is one.
    pub path: Option<String>,
    /// The base's text, when it is a block of a note: read instead of
    /// `path`.
    pub text: Option<String>,
    /// The file `this` stands for: the note a base is embedded in, or the
    /// `.base` file itself.
    pub this: Option<String>,
    /// The view, by name; the first when absent.
    pub view: Option<String>,
    /// Properties to evaluate besides the view's `order`: what the layout
    /// draws (a card's image, a calendar's date).
    pub extra: Vec<String>,
    /// The window's clock: milliseconds since the Unix epoch.
    pub now: f64,
    /// The window's zone: minutes east of UTC.
    pub offset: i32,
    /// The interface language (`pt-BR`, `en`).
    pub lang: String,
}

/// A base evaluated.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BaseResult {
    /// Every view of the base, in order.
    pub views: Vec<BaseView>,
    /// The view evaluated, as an index into `views`; `None` when the base
    /// has none and a table of every file was evaluated.
    pub view: Option<u32>,
    pub columns: Vec<BaseColumn>,
    /// The rows; one group when the view is not grouped.
    pub groups: Vec<BaseGroup>,
    /// Files that passed the filters, before the view's `limit`.
    pub total: u32,
    pub problems: Vec<BaseProblem>,
    /// Every note property of the folder, once each: what the view's
    /// menus offer.
    pub properties: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BaseView {
    pub name: String,
    /// `table`, `cards`, `list`, `kanban`, `calendar`, or one Verso does
    /// not draw.
    pub kind: String,
}

/// A column: the property id as the view writes it (`file.name`,
/// `status`, `formula.x`), and the name the base gives it, if any.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BaseColumn {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BaseGroup {
    /// The grouping property's value; `None` when the view is not grouped.
    pub key: Option<BaseCell>,
    pub rows: Vec<BaseRow>,
    /// One per column: the summary the view asks for, if any.
    pub summaries: Vec<Option<BaseCell>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BaseRow {
    pub path: String,
    /// A Markdown note: its properties may be changed from the view.
    pub note: bool,
    /// One per column.
    pub cells: Vec<BaseCell>,
}

/// A value as a view shows it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum BaseCell {
    Empty,
    Text(String),
    Number(f64),
    Bool(bool),
    /// A wall-clock time in the window's zone, in milliseconds since
    /// 1970-01-01T00:00 of that clock (read it with UTC getters), and
    /// whether it has a time of day.
    Date {
        ms: f64,
        time: bool,
    },
    /// Milliseconds.
    Duration(f64),
    List(Vec<BaseCell>),
    Object(Vec<(String, BaseCell)>),
    /// A link as written, the text to show, and the file it resolves to.
    Link {
        target: String,
        display: Option<String>,
        path: Option<String>,
    },
    File(String),
    /// A path relative to the folder, or a URL.
    Image(String),
    Icon(String),
    Html(String),
    Error {
        kind: BaseErrorKind,
        name: String,
    },
}

/// Why a value could not be computed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BaseErrorKind {
    Syntax,
    UnknownFunction,
    UnknownMethod,
    Arguments,
    Type,
    /// Regular expressions are not evaluated yet.
    Regex,
    Cycle,
    Budget,
    TooLarge,
}

/// Something about the base as a whole, shown once above the view;
/// `detail` is what it concerns, as written in the base.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BaseProblem {
    pub kind: BaseProblemKind,
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BaseProblemKind {
    NotABase,
    TooLong,
    Shape,
    Expression,
    Evaluation,
    UnknownView,
    Budget,
}

/// What stands where the app installs its command line (ADR 0054):
/// `/usr/local/bin/verso`, on the PATH every shell has.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CliState {
    /// A link to this app's own command line.
    Ours,
    /// Nothing.
    Missing,
    /// Something else: another link, a copy put there by hand.
    Elsewhere,
    /// This build carries no command line to link (a development build
    /// without it).
    Unbundled,
}

/// How an MCP client's configuration stands with this folder's entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum McpClientState {
    /// The client is not installed.
    NoClient,
    /// No entry for this folder.
    Absent,
    /// The entry is there, as the app would write it.
    Same,
    /// An entry by that name starts something else.
    Different,
}

/// The open folder's MCP server as clients name it, and whether Claude
/// Desktop knows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct McpStatus {
    /// The name of the server in a client's configuration: `verso-<folder>`.
    pub server: String,
    pub claude: McpClientState,
}

/// What adding the folder's server to Claude Desktop did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct McpAdded {
    pub server: String,
    /// An entry by that name was there and was replaced.
    pub replaced: bool,
    /// The name of the copy of the configuration as it was, beside it.
    pub backup: Option<String>,
    pub warnings: Vec<String>,
}
