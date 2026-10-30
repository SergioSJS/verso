// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The orchestrator (ADR 0028): opens a folder through `verso-fs`, parses
//! notes with `verso-dialect`, keeps `verso-index` current, and answers
//! the questions the CLI and the contract ask. Phase 1, feature 4; the
//! file operations of Phase 2, item 2.3, as ADR 0048 decides them.
//!
//! This crate never touches the folder itself: the folder is `verso-fs`'s,
//! the index file is `verso-index`'s, and the configuration directory
//! (ADR 0011) is only computed here — its creation belongs to the index
//! that lives in it. Its one `std::fs` exception is the index's sidecar
//! ([`Sidecar`], `sidecar.rs`, `clippy.toml`), a file of that directory.
//!
//! Provisional (`docs/reference/cli-decision.md`, the maintainer decides):
//! where the configuration directory is ([`config_dir`], decided for
//! Windows on 2026-10-08); that a second `index` run skips a note whose
//! modified time and length the index holds from well before its last
//! read, and re-reads the rest, skipping the ones whose stamp the index
//! already has (decided on 2026-10-08, ADR 0011); that a note under a path the walk reported a
//! problem for, or a placeholder (ADR 0043), is never removed from the
//! index.
//!
//! A note whose bytes are not UTF-8 has no editable text here: `read_note`
//! and `read_text` answer [`CoreError::NotText`], so no editor ever holds
//! a lossy copy that a save would write back over the original (invariant
//! 8). The index still decodes lossily, for search, which writes nothing.
//! Spec Q25 (encoding) decides it so: the file is kept safe, not decoded
//! for an editor.

use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use verso_fs::{EntryKind, Problem, Root, Stamp};
// The two error types `CoreError` carries, so a caller can match on them.
pub use sync_io::Hashed;
pub use verso_fs::{
    Changes, ConfinementError, Mark, PathKind, PickedError, Placeholder, ReadError, Staged,
    WalkRules, Watch, WriteError, canonical_path, check_picked, kind_of, read_picked, strip_root,
};
use verso_index::{Backlink, Block, Heading, Hit, Index, Link, NoteStamp, Unresolved};

pub mod agents;
pub mod bases;
pub mod board;
pub mod canvas;
pub mod canvas_secret;
pub mod clients;
pub mod focuses;
pub mod history;
pub mod servers;
pub mod session;
pub mod sync;
pub mod trash;
pub mod typed;
pub use focuses::{Focus, FocusesSummary, ReadOnlyReasonCode};
pub use folder_data::{
    DataEntry, DataFile, DataList, FOLDER_BUNDLE_MOST, FOLDER_LAYOUT_MOST, FolderDataKind,
};
pub use folder_settings::{FolderLayer, FolderSettings, LayerProblem};
pub use oracle::{Oracle, OracleSparks};
pub use periodic::{ObsidianPeriodic, Period, Periodic};
mod entries;
mod folder_data;
mod folder_settings;
mod indexing;
pub mod maptiles;
mod mentions;
mod narrow;
mod notes;
mod oracle;
mod periodic;
mod reader;
mod rename;
mod sidecar;
mod sync_io;
mod views;
use entries::*;
pub use mentions::{Mention, Mentions};
mod loose;
pub use loose::{LOOSE_MAX_BYTES, LOOSE_READ_CAP, Loose, LooseReadOnly};
/// The one projection a UniVerso serves a reader of a note (ADR 0087),
/// for every exit of the server that serves one.
pub mod secret {
    pub use verso_dialect::{Secrets, is_secret_kind, project};
}
use rename::*;
pub use sidecar::Sidecar;
pub use verso_index::{Backlink as IndexBacklink, Hit as IndexHit, Link as IndexLink};
/// The index's answers, as the core hands them out (its reader's too).
pub use verso_index::{
    BlockKind as IndexBlockKind, BlockList as IndexBlockList, BlockRef as IndexBlockRef,
};

/// The opaque revision token of a note: its `verso_fs::Stamp`, encoded so
/// the UI can hand it back without knowing what is in it.
mod revision {
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use verso_fs::Stamp;

    pub fn encode(stamp: &Stamp) -> String {
        let nanos = stamp
            .modified
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("{nanos}:{}:{:016x}", stamp.len, stamp.hash)
    }

    pub fn decode(token: &str) -> Option<Stamp> {
        let mut parts = token.split(':');
        let nanos: u128 = parts.next()?.parse().ok()?;
        let len: u64 = parts.next()?.parse().ok()?;
        let hash = u64::from_str_radix(parts.next()?, 16).ok()?;
        if parts.next().is_some() {
            return None;
        }
        let secs = u64::try_from(nanos / 1_000_000_000).ok()?;
        let sub = u32::try_from(nanos % 1_000_000_000).ok()?;
        Some(Stamp {
            modified: SystemTime::UNIX_EPOCH + Duration::new(secs, sub),
            len,
            hash,
        })
    }

    /// A stamp no file on disk can carry (no file is 2^64 bytes long):
    /// handed back when a write's own stamp could not be confirmed and
    /// the file no longer holds the caller's bytes, so the next save is
    /// refused and shows the diff instead of passing on a guess
    /// (invariant 11).
    pub fn impossible() -> Stamp {
        Stamp {
            modified: UNIX_EPOCH,
            len: u64::MAX,
            hash: 0,
        }
    }
}

/// How long the folder must be quiet before a watch hands a batch over
/// ([`Workspace::watch`]): long enough that a save made of several writes,
/// or a checkout, is one batch; short enough that a change made in another
/// editor shows up while the user is still looking. Provisional
/// (`docs/reference/watcher-decision.md`).
pub const WATCH_QUIET: std::time::Duration = std::time::Duration::from_millis(300);

/// Why a picked file was not created in the folder
/// ([`Workspace::create_file_from_picked`]).
#[derive(Debug)]
pub enum PickedCreateError {
    /// The picked file was refused or could not be read.
    Picked(PickedError),
    /// The folder's side: a name taken, a path refused, the disk.
    Core(CoreError),
}

impl From<PickedError> for PickedCreateError {
    fn from(e: PickedError) -> Self {
        Self::Picked(e)
    }
}

impl std::fmt::Display for PickedCreateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Picked(e) => write!(f, "{e}"),
            Self::Core(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for PickedCreateError {}

/// Why the workspace could not be opened or refreshed.
#[derive(Debug)]
pub enum CoreError {
    Folder(std::io::Error),
    Index(verso_index::IndexError),
    /// No configuration directory can be named: neither `VERSO_CONFIG_DIR`
    /// nor `XDG_CONFIG_HOME` nor `HOME` (`LOCALAPPDATA` on Windows) is set.
    /// Never a relative fallback.
    NoConfigDir,
    /// A path a caller sent cannot name a note of the folder (ADR 0044:
    /// absolute, `..`, NUL, hidden, ignored). Checked on every path that
    /// crosses the edge, whether the call reads the disk or the index.
    Confined(ConfinementError),
    /// The note could not be read from the folder.
    Read(ReadError),
    /// The file's bytes are not UTF-8: there is no text to edit without
    /// losing what was written (spec Q25).
    NotText,
    /// The file is not a board: not a `.canvas`, or not JSON (ADR 0057).
    NotCanvas,
    /// The index was refreshed but its sidecar could not be written.
    Sidecar(std::io::Error),
    /// The note could not be written; `WriteError::Changed` is invariant
    /// 11 — the file on disk is not the one that was read, nothing was
    /// written, the caller shows the diff.
    Write(WriteError),
    /// A folder key ([`Workspace::key`]) that this core never issued: it
    /// names nothing, and it is refused before anything is looked up.
    InvalidKey,
    /// The key names no folder opened before, or the folder is gone.
    UnknownFolder,
    /// The operating system will not watch the folder (on Linux, the
    /// inotify limit): changes made outside show up on the next index run,
    /// not by themselves.
    Watch(std::io::Error),
    /// An MCP client's configuration could not be read or changed
    /// (`clients`): what, in the message.
    Client(String),
    /// The folder's settings file (ADR 0070) cannot be changed as it is:
    /// what, in the message.
    FolderSettings(String),
    /// A folder data file (`.verso/layouts/`, `.verso/bundles/`) cannot be
    /// read or written as asked: a bad id, too large, not a JSON object.
    FolderData(String),
    /// A file opened without its folder is refused what the folder would
    /// allow (ADR 0114 items 12 and 13): too large, or read only; the
    /// reason, in the message.
    Loose(String),
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Folder(e) => write!(f, "folder: {e}"),
            Self::Index(e) => write!(f, "{e}"),
            Self::NoConfigDir => write!(
                f,
                "no configuration directory: HOME (LOCALAPPDATA on Windows), XDG_CONFIG_HOME and VERSO_CONFIG_DIR are all unset"
            ),
            Self::Confined(e) => write!(f, "{e}"),
            Self::Read(e) => write!(f, "read: {e}"),
            Self::NotText => write!(f, "the file is not UTF-8 text"),
            Self::NotCanvas => write!(f, "the file is not a JSON Canvas board"),
            Self::Sidecar(e) => write!(f, "index sidecar: {e}"),
            Self::Write(e) => write!(f, "write: {e}"),
            Self::InvalidKey => write!(f, "the folder key is not one this core issued"),
            Self::UnknownFolder => write!(f, "no folder opened before has this key"),
            Self::Watch(e) => write!(f, "the folder cannot be watched for changes: {e}"),
            Self::Client(m) => write!(f, "MCP client: {m}"),
            Self::FolderSettings(m) => write!(f, "folder settings: {m}"),
            Self::FolderData(m) => write!(f, "folder data: {m}"),
            Self::Loose(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for CoreError {}

/// The configuration directory (ADR 0011): `$VERSO_CONFIG_DIR` if set (tests,
/// sensitive setups), else `$XDG_CONFIG_HOME/verso` if set, else
/// `%LOCALAPPDATA%\verso` on Windows, `~/Library/Application Support/verso`
/// on macOS and `~/.config/verso` elsewhere. Without any of them it is an
/// error, never a path relative to the current directory. On Windows
/// (decided 2026-10-08, ADR 0069 item 9): what lives here — the index, its
/// sidecar, the log — is this machine's (ADR 0070), so it goes in the
/// local profile, not in `%APPDATA%`, the roaming one a company network
/// copies between machines; `HOME` is usually unset there.
pub fn config_dir() -> Result<PathBuf, CoreError> {
    let get = |name: &str| std::env::var_os(name).filter(|v| !v.is_empty());
    config_dir_from(
        get("VERSO_CONFIG_DIR").as_deref(),
        get("XDG_CONFIG_HOME").as_deref(),
        if cfg!(windows) {
            get("LOCALAPPDATA")
        } else {
            None
        }
        .as_deref(),
        get("HOME").map(PathBuf::from).as_deref(),
        cfg!(target_os = "macos"),
    )
    .ok_or(CoreError::NoConfigDir)
}

/// [`config_dir`] as a pure function of its inputs, for tests. `None`
/// when nothing names a directory.
#[must_use]
pub fn config_dir_from(
    verso: Option<&std::ffi::OsStr>,
    xdg: Option<&std::ffi::OsStr>,
    windows_local_appdata: Option<&std::ffi::OsStr>,
    home: Option<&Path>,
    macos: bool,
) -> Option<PathBuf> {
    if let Some(dir) = verso {
        return Some(PathBuf::from(dir));
    }
    if let Some(xdg) = xdg {
        return Some(PathBuf::from(xdg).join("verso"));
    }
    if let Some(local) = windows_local_appdata {
        return Some(PathBuf::from(local).join("verso"));
    }
    let home = home?;
    Some(if macos {
        home.join("Library")
            .join("Application Support")
            .join("verso")
    } else {
        home.join(".config").join("verso")
    })
}

/// A problem the walk reported, in the shape the CLI and the contract
/// print: the path is relative to the folder; the `Io` text is the
/// operating system's and is not translated.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WalkProblem {
    /// A symlink loop: `path` leads back to `first_seen`, higher up.
    Loop { path: String, first_seen: String },
    /// A directory already walked as `first_seen`; walked once.
    Duplicate { path: String, first_seen: String },
    /// Nesting deeper than `verso-fs` descends.
    TooDeep { path: String },
    /// The entry could not be examined.
    Io {
        path: String,
        kind: String,
        error: String,
    },
}

impl WalkProblem {
    /// The path the problem is about; everything under it is protected
    /// from removal on that run.
    #[must_use]
    pub fn path(&self) -> &str {
        match self {
            Self::Loop { path, .. }
            | Self::Duplicate { path, .. }
            | Self::TooDeep { path }
            | Self::Io { path, .. } => path,
        }
    }
}

/// One line per problem, in English, with paths relative to the folder:
/// what the contract shows the user. The root itself is an empty path
/// and is named as such.
impl std::fmt::Display for WalkProblem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let shown = |p: &str| {
            if p.is_empty() {
                "the folder itself".to_owned()
            } else {
                p.to_owned()
            }
        };
        match self {
            Self::Loop { path, first_seen } => write!(
                f,
                "{}: a symlink loop back to {}",
                shown(path),
                shown(first_seen)
            ),
            Self::Duplicate { path, first_seen } => write!(
                f,
                "{}: the same folder as {}, walked once",
                shown(path),
                shown(first_seen)
            ),
            Self::TooDeep { path } => {
                write!(f, "{}: nested deeper than the walk descends", shown(path))
            }
            Self::Io { path, error, .. } => write!(f, "{}: {error}", shown(path)),
        }
    }
}

impl From<&Problem> for WalkProblem {
    fn from(problem: &Problem) -> Self {
        let text = |p: &Path| p.to_string_lossy().into_owned();
        match problem {
            Problem::Loop {
                relative,
                first_seen,
            } => Self::Loop {
                path: text(relative),
                first_seen: text(first_seen),
            },
            Problem::Duplicate {
                relative,
                first_seen,
            } => Self::Duplicate {
                path: text(relative),
                first_seen: text(first_seen),
            },
            Problem::DepthExceeded { relative } => Self::TooDeep {
                path: text(relative),
            },
            Problem::Io { relative, error } => Self::Io {
                path: text(relative),
                kind: error.kind().to_string(),
                error: error.to_string(),
            },
        }
    }
}

/// What an `index` run did.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct IndexReport {
    /// Notes read and stored (new or changed).
    pub indexed: usize,
    /// Notes whose stamp the index already had.
    pub unchanged: usize,
    /// Of those, the notes trusted by their modified time and length
    /// alone, without reading them (schema 13, the last complete run).
    pub trusted: usize,
    /// Notes the index had and the walk no longer lists.
    pub removed: usize,
    /// Placeholders met: present, content unavailable, never removed.
    pub placeholders: usize,
    /// Notes the walk listed but that could not be read, with the error.
    pub unreadable: Vec<(String, String)>,
    /// Problems the walk reported.
    pub problems: Vec<WalkProblem>,
    /// What the run could not do besides indexing, one line each: today,
    /// a sidecar that could not be written. The index itself is current.
    pub warnings: Vec<String>,
    /// The notes counted in `indexed` and `removed`, by path: what a
    /// window showing one of them reloads or marks when the folder changed
    /// outside it (`docs/reference/watcher-decision.md`).
    pub changed: Vec<String>,
    pub gone: Vec<String>,
    /// The listing's shape — which entries, of which kinds — is not what it
    /// was before the run: a tree or a folder view draws it again. Lengths
    /// and times alone do not count: every save changes them, and a note
    /// whose content changed is in `changed` already.
    pub listing_changed: bool,
    /// Only the batch's paths were read again, not the whole folder walked
    /// (`Workspace::index_changes`): the problems the last walk met still
    /// stand.
    pub narrowed: bool,
}

/// Progress reported while indexing a folder.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IndexProgress {
    pub phase: String,
    pub current: usize,
    pub total: usize,
    pub file: Option<String>,
}

/// A note that links to what moved, and its text with the links pointing
/// at the new place — for the user to see, then to apply.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkRewrite {
    pub path: String,
    pub revision: String,
    pub before: String,
    pub after: String,
}

/// Why a note that links to what moved got no rewrite.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkipReason {
    /// A placeholder: present, content not downloaded (ADR 0043).
    Unavailable,
    /// Not UTF-8: no text can be rewritten without loss.
    NotText,
    /// Could not be read; the error is in the warnings.
    Failed,
}

/// A note the plan could not cover: it links to what moved, and its links
/// now point elsewhere or nowhere, but no rewrite could be made.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skipped {
    pub path: String,
    pub reason: SkipReason,
}

/// What a rename or a move left: the entry's new path, the rewrites it
/// calls for, the notes it could not plan, and what could not be
/// confirmed once the entry had moved — a durability step, the index
/// following it, the sidecar. The move happened whenever this is
/// answered; the warnings are for the user to see.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Renamed {
    pub path: String,
    pub rewrites: Vec<LinkRewrite>,
    pub skipped: Vec<Skipped>,
    pub warnings: Vec<String>,
    /// What else moved with the entry by a rule of its own — a folder's
    /// note taking the folder's new name — old path to new.
    pub also: Vec<(String, String)>,
}

/// What moving several entries at once left ([`Workspace::move_entries`]):
/// those that moved, old path to new; those the disk refused, with why;
/// one plan of rewrites over where everything ended, the notes it could
/// not plan, what could not be confirmed, and what moved by a rule of its
/// own (a folder's note). Empty when nothing had to move.
#[derive(Debug, Default)]
pub struct MovedEntries {
    pub moved: Vec<(String, String)>,
    pub refused: Vec<(String, CoreError)>,
    pub rewrites: Vec<LinkRewrite>,
    pub skipped: Vec<Skipped>,
    pub warnings: Vec<String>,
    pub also: Vec<(String, String)>,
}

/// What a deletion left: where the entry went in `.trash/`, and what
/// could not be confirmed once it was there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Trashed {
    pub path: String,
    /// Where it was, relative to the folder: what the bin's record keeps
    /// (ADR 0080 item 2).
    pub original: String,
    pub warnings: Vec<String>,
}

/// Any file of the folder as text, with the revision a later
/// [`Workspace::write_text`] hands back (invariant 11), for an editor of
/// files that are not notes: a `.txt`, a `.json`, a `.canvas`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextFile {
    pub path: String,
    pub text: String,
    pub revision: String,
    /// What the write could not preserve; empty after a read.
    pub warnings: Vec<String>,
}

/// What one entry of the open folder is, as the last walk saw it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    Note,
    File,
    Folder,
    /// Present, content in the cloud (ADR 0043).
    Placeholder,
}

/// One entry of the open folder with what a listing shows of it: kind,
/// length and modification time as the walk read them. Never what a
/// write trusts: that is the `Stamp` read with the content.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileEntry {
    pub path: String,
    pub kind: FileKind,
    pub len: u64,
    /// Seconds since the Unix epoch; 0 when the file system gave none.
    pub modified: i64,
    /// Creation, in seconds since the Unix epoch; 0 when the file system
    /// gave none.
    pub created: i64,
}

/// What a write left behind: the note as it now is, and what the atomic
/// write could not guarantee (`verso_fs::WriteReport`), one line each,
/// for the user to see — none of them means the content was lost.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Written {
    pub note: NoteText,
    pub warnings: Vec<String>,
}

/// A frontmatter value as a properties panel shows it: a list of plain
/// strings as pills, a boolean as a checkbox, a number as the text that
/// was written; a mapping, or a list holding anything but plain strings,
/// as one line the panel shows and never edits — an edit would write it
/// back as text and change its type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PropertyValue {
    Text(String),
    Number(String),
    Checkbox(bool),
    List(Vec<String>),
    Nested(String),
    Empty,
}

fn property_value(v: &verso_dialect::Value) -> PropertyValue {
    use verso_dialect::Value;
    match v {
        Value::Null => PropertyValue::Empty,
        Value::Bool(b) => PropertyValue::Checkbox(*b),
        Value::Integer(n) => PropertyValue::Number(n.to_string()),
        Value::Float(x) => PropertyValue::Number(x.to_string()),
        Value::String(s) => PropertyValue::Text(s.clone()),
        Value::Sequence(items) if items.iter().all(|i| matches!(i, Value::String(_))) => {
            PropertyValue::List(items.iter().map(property_text).collect())
        }
        Value::Sequence(_) | Value::Mapping(_) => PropertyValue::Nested(property_text(v)),
    }
}

/// One line per frontmatter value, for a properties panel.
fn property_text(v: &verso_dialect::Value) -> String {
    use verso_dialect::Value;
    match v {
        Value::Null => String::new(),
        Value::Bool(b) => b.to_string(),
        Value::Integer(n) => n.to_string(),
        Value::Float(x) => x.to_string(),
        Value::String(s) => s.clone(),
        Value::Sequence(items) => items
            .iter()
            .map(property_text)
            .collect::<Vec<_>>()
            .join(", "),
        Value::Mapping(pairs) => pairs
            .iter()
            .map(|(k, v)| format!("{k}: {}", property_text(v)))
            .collect::<Vec<_>>()
            .join("; "),
    }
}

fn properties(content: &str) -> Vec<(String, PropertyValue)> {
    match verso_dialect::parse(content)
        .frontmatter
        .as_ref()
        .map(|f| &f.values)
    {
        Some(Ok(verso_dialect::Value::Mapping(pairs))) => pairs
            .iter()
            .map(|(k, v)| (k.clone(), property_value(v)))
            .collect(),
        _ => Vec::new(),
    }
}

/// A note's text as read from the folder now, with what the index knows
/// about its positions (feature 6: `read_note`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteText {
    /// The path relative to the folder, with `.md`.
    pub path: String,
    /// The lines of the file, without their line endings; line `n` of the
    /// citation is `lines[n - 1]` (spec §4.4).
    pub lines: Vec<String>,
    /// The file differs from the version the index holds (or the index
    /// does not hold it): graph answers may predate this text.
    pub stale: bool,
    /// The index holds this note only as an unverified last version
    /// (ADR 0043): a placeholder stood where it was.
    pub unverified: bool,
    pub headings: Vec<Heading>,
    pub blocks: Vec<Block>,
    /// The note rendered for a preview (`verso_dialect::to_html`).
    pub html: String,
    /// The frontmatter's keys and values, typed for a properties panel,
    /// in the order written; empty when there is none or it is not YAML.
    pub properties: Vec<(String, PropertyValue)>,
    /// The note's type, when its `type:` names a schema of the folder
    /// (ADR 0052); `None` for plain Markdown.
    pub note_type: Option<typed::NoteType>,
    /// The `verso-schema` blocks this note holds, as the parser read them
    /// now: a schema that types nothing says so in its own note (ADR 0052
    /// point 5), and a nested one that it is not read (point 3).
    pub schema_blocks: Vec<typed::SchemaNotice>,
    /// The whole text as read, line endings included, for an editor: what
    /// it gives back is written as is. Bytes that are not UTF-8 give no
    /// text at all ([`CoreError::NotText`]).
    pub text: String,
    /// What was read — modified time, length and content hash — as an
    /// opaque token a write hands back, so the write can refuse a file
    /// that changed meanwhile (invariant 11).
    pub revision: String,
}

/// An open folder with its index.
pub struct Workspace {
    folder: PathBuf,
    root: Root,
    index: Index,
    /// Every regular file that is not a note, and every placeholder that
    /// stands for one, by the folded key of its file name
    /// (`verso_index::file_key`), as the last walk listed it: what an
    /// embed such as `![[mapa.png]]` resolves against (spec Q12, applied
    /// to attachments by [`Workspace::resolve_file`]).
    files: HashMap<String, Vec<String>>,
    /// Every folder the last walk listed, plus the ones created since:
    /// an empty folder has no file to be seen by, and a tree shows it.
    dirs: HashSet<String>,
    /// Every entry of the last walk, in walk order, with size and date.
    entries: Vec<FileEntry>,
    /// What each note says to a base (`bases::NoteFacts`), with the hash
    /// of the content it was read from: read again only when the index
    /// has another hash for the note.
    base_facts: HashMap<String, (u64, bases::NoteFacts)>,
    /// The folder note name that applies (ADR 0060 D12): empty, a
    /// folder's note is named after it. The folder's own, or this
    /// machine's while the folder has none (ADR 0070, `folder_settings`).
    folder_note_name: String,
    /// The folder's layer of settings and this machine's fallback (ADR
    /// 0070 items 1–2).
    layer: folder_settings::Layer,
    /// Cache of stamped focuses reads, for concurrent reapply (ADR 0062 D7).
    stamped_focuses: HashMap<String, Vec<Focus>>,
    /// The last read focuses from .space/waypoints.json, for concurrent reapply (ADR 0062 D7).
    last_focuses: Option<Vec<Focus>>,
    /// Whether focuses are synced to .space/waypoints.json for this workspace (ADR 0062 D5, D9).
    sync_focuses: bool,
    /// The computer's history of the folder's files, when kept (ADR 0091
    /// item 8; `history.rs`).
    history: Option<history::Local>,
}

impl std::fmt::Debug for Workspace {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Workspace")
            .field("folder", &self.folder)
            .finish()
    }
}

/// `folder` absolute and normalized: `.` and a trailing separator
/// dropped, so `vault`, `vault/` and `vault/.` key one index. `..` is
/// kept: resolving it would mean following symlinks, which is `verso-fs`'s
/// business (ADR 0044).
fn normalized(folder: &Path) -> Result<PathBuf, std::io::Error> {
    let absolute = std::path::absolute(folder)?;
    Ok(absolute
        .components()
        .filter(|c| !matches!(c, Component::CurDir))
        .collect())
}

/// The key of a folder: the stem of its index file's name
/// (`Index::file_name_for`) — the folder's name made of letters, digits
/// and `-`, then a hash of its absolute path. Letters, digits and `-`
/// only, so a key is one file name and can never be a path.
fn key_for(folder: &Path) -> String {
    let file = Index::file_name_for(folder);
    file.strip_suffix(".sqlite").unwrap_or(&file).to_owned()
}

/// The key a folder at `folder` is opened under ([`Workspace::key`]),
/// without opening it: how the server finds which of a member's folders a
/// key the window kept names (ADR 0073 item 2).
#[must_use]
pub fn folder_key(folder: &Path) -> String {
    key_for(folder)
}

/// Whether `key` has the shape [`key_for`] produces: a name part of up to
/// 32 letters, digits or `-`, a `-`, and 16 lower-case hex digits.
/// Anything else — a path, an empty string — is refused before it is
/// looked up.
fn well_formed_key(key: &str) -> bool {
    let Some((name, hash)) = key.rsplit_once('-') else {
        return false;
    };
    !name.is_empty()
        && name.chars().count() <= 32
        && name.chars().all(|c| c.is_alphanumeric() || c == '-')
        && hash.len() == 16
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn seconds_since_epoch(t: std::time::SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

fn note_stamp(stamp: &Stamp) -> NoteStamp {
    NoteStamp {
        modified: seconds_since_epoch(stamp.modified),
        len: stamp.len,
        hash: stamp.hash,
    }
}

/// The file name of a relative path.
fn name_of(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// `s` without a final `.md`, in any case, when the cut is a character
/// boundary.
fn without_md(s: &str) -> &str {
    let cut = s.len().wrapping_sub(3);
    if s.len() >= 3 && s.is_char_boundary(cut) && s[cut..].eq_ignore_ascii_case(".md") {
        &s[..cut]
    } else {
        s
    }
}

/// The path `target` names from the folder `dir`, honouring `..` and
/// dropping `.`; `None` when it would leave the root.
fn joined(dir: &str, target: &str) -> Option<String> {
    let mut parts: Vec<&str> = dir.split('/').filter(|p| !p.is_empty()).collect();
    for part in target.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            p => parts.push(p),
        }
    }
    Some(parts.join("/"))
}

/// The folders opened before, most recently indexed first, read from the
/// index sidecars under [`config_dir`] (or the given directory) — for the
/// window's recent-folders menu. Paths at the edge, on this side: none of
/// them crosses the contract (ADR 0026 rule 4).
#[must_use]
pub fn recent_folders(config: Option<&Path>) -> Vec<PathBuf> {
    let dir = match config {
        Some(dir) => dir.to_path_buf(),
        None => match config_dir() {
            Ok(dir) => dir,
            Err(_) => return Vec::new(),
        },
    };
    sidecar::known_folders(&dir.join("index"))
}

/// The folders inside `folder`, relative and `/`-joined, without opening
/// it: what Settings offers to serve to a phone when only some of a
/// folder's folders are chosen (ADR 0096, amended 2026-10-16).
pub fn subfolders_of(folder: &Path) -> Result<Vec<String>, CoreError> {
    verso_fs::subfolders(folder).map_err(CoreError::Folder)
}

/// The attachments folder Obsidian's own settings name for the vault at
/// `folder` (`attachmentFolderPath` in `.obsidian/app.json`, read by name
/// through `verso-fs`, never written): a folder of the vault, relative and
/// `/`-joined. `None` when the setting is absent, is the vault's root, "the
/// same folder as the note" or a sub-folder of the note's folder (`./…`) —
/// those lie inside whatever is served with the note — or does not name a
/// plain folder (a `..`, a hidden part, a backslash).
#[must_use]
pub fn attachments_folder(folder: &Path) -> Option<String> {
    use verso_fs::{ObsidianRead, ObsidianSettings};
    let root = Root::open(folder, Vec::new()).ok()?;
    let ObsidianRead::Found(bytes) = root.read_obsidian_settings(ObsidianSettings::App).ok()?
    else {
        return None;
    };
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    let named = value.get("attachmentFolderPath")?.as_str()?.trim();
    if named.starts_with('.') {
        return None;
    }
    let named = named.trim_matches('/');
    let plain = !named.is_empty()
        && named
            .split('/')
            .all(|p| !p.is_empty() && !p.starts_with('.') && !p.contains(['\\', ':', '\0']));
    plain.then(|| named.to_owned())
}

/// The vault's attachments folder as it goes with folders served in part:
/// [`attachments_folder`], unless it is one of the chosen folders, inside
/// one or holds one, or is not on the disk — then there is none, so that
/// nothing is shown twice or widened (ADR 0096 item 2, amended 2026-10-16).
#[must_use]
pub fn served_attachments(folder: &Path, parts: &[String]) -> Option<String> {
    let a = attachments_folder(folder).filter(|a| verso_fs::is_folder(folder, a))?;
    let covers = |root: &str, path: &str| path == root || path.starts_with(&format!("{root}/"));
    parts
        .iter()
        .all(|p| !covers(&a, p) && !covers(p, &a))
        .then_some(a)
}

impl Workspace {
    /// Open `folder` with its index under [`config_dir`] (or the given
    /// directory). Nothing is read yet.
    pub fn open(folder: &Path, config: Option<&Path>) -> Result<Self, CoreError> {
        let root = Root::open(folder, Vec::new()).map_err(CoreError::Folder)?;
        let folder = normalized(folder).map_err(CoreError::Folder)?;
        let config = match config {
            Some(dir) => dir.to_path_buf(),
            None => config_dir()?,
        };
        let file = config.join("index").join(Index::file_name_for(&folder));
        let index = Index::open(file).map_err(CoreError::Index)?;
        let mut workspace = Self {
            folder,
            root,
            index,
            files: HashMap::new(),
            dirs: HashSet::new(),
            entries: Vec::new(),
            base_facts: HashMap::new(),
            folder_note_name: String::new(),
            layer: folder_settings::Layer::default(),
            stamped_focuses: HashMap::new(),
            last_focuses: None,
            sync_focuses: false,
            history: None,
        };
        // The folder's own settings, read before anything is walked: the
        // walk's rules may be the folder's (ADR 0070). Read only.
        let _ = workspace.refresh_layer();
        Ok(workspace)
    }

    /// Open again a folder opened (and indexed) before, by its
    /// [`Workspace::key`]: the key names an index under the configuration
    /// directory, whose sidecar records which folder it was for. The path
    /// stays on this side of the contract (ADR 0026 rule 4): what crosses
    /// is the key, which is refused unless it has the shape this core
    /// issues ([`CoreError::InvalidKey`]), and which names nothing when no
    /// sidecar carries it or its folder is gone ([`CoreError::UnknownFolder`]).
    pub fn reopen(key: &str, config: Option<&Path>) -> Result<Self, CoreError> {
        if !well_formed_key(key) {
            return Err(CoreError::InvalidKey);
        }
        let config = match config {
            Some(dir) => dir.to_path_buf(),
            None => config_dir()?,
        };
        let index = config.join("index").join(format!("{key}.sqlite"));
        let sidecar = Sidecar::read(&index).map_err(|_| CoreError::UnknownFolder)?;
        // The sidecar is the index's own bookkeeping: a folder whose key
        // is not this one is not what the key names, whatever the file says.
        if key_for(&sidecar.folder) != key {
            return Err(CoreError::UnknownFolder);
        }
        match Self::open(&sidecar.folder, Some(&config)) {
            Err(CoreError::Folder(e)) if e.kind() == std::io::ErrorKind::NotFound => {
                Err(CoreError::UnknownFolder)
            }
            other => other,
        }
    }

    /// The folder, absolute and normalized: for the CLI, which prints it
    /// at the entry edge. It never crosses the contract (rule 4).
    #[must_use]
    pub fn folder(&self) -> &Path {
        &self.folder
    }

    /// The folder's own name — its last path component — for display.
    #[must_use]
    pub fn name(&self) -> String {
        self.folder
            .file_name()
            .map_or_else(|| "root".to_owned(), |n| n.to_string_lossy().into_owned())
    }

    /// The folder's key: an opaque, stable name for it that carries no
    /// path — the stem of its index file's name — for a UI to keep its
    /// per-folder state under and to hand back to [`Workspace::reopen`].
    #[must_use]
    pub fn key(&self) -> String {
        key_for(&self.folder)
    }

    /// The name of the folder's file system when a file Verso creates or
    /// moves there is named by `link` (macOS: some network volumes; ADR
    /// 0048, revised 2026-10-12): changes made there by other programs may
    /// show late. Asked of the volume through `verso-fs`, the only crate
    /// that touches the folder.
    #[must_use]
    pub fn names_by_link(&self) -> Option<String> {
        self.root.names_by_link()
    }

    /// Remove the temporary files that writes and transfers of a stopped
    /// process left in the folder — a crash between a write's temporary
    /// file and its rename — and say how many went. For a host that opens
    /// the folder as its writer (the desktop app, the server: verso-service
    /// does it at every opening), never for a reader beside one, as the
    /// command line and the MCP are: their process is not the folder's
    /// writer. Through `verso-fs`, the only crate that touches the folder.
    pub fn sweep_temporaries(&self) -> Result<usize, CoreError> {
        self.root.sweep_temporaries().map_err(CoreError::Folder)
    }

    /// The index's size in bytes (ADR 0075 item 4).
    pub fn index_bytes(&self) -> Result<u64, CoreError> {
        self.index.bytes().map_err(CoreError::Index)
    }

    /// Where the index file is.
    #[must_use]
    pub fn index_path(&self) -> &Path {
        self.index.path()
    }

    /// Walk the folder and bring the index up to date. A note the walk no
    /// longer lists is removed, unless it lies under a path the walk
    /// reported a problem for: an unreadable directory does not empty the
    /// graph beneath it. A sidecar that cannot be written is a warning in
    /// the report, not a failure: the index is current either way.
    pub fn index(&mut self) -> Result<IndexReport, CoreError> {
        self.index_with_progress(|_| {})
    }

    /// Follow symlinks only inside the folder: a server's folder, shared by
    /// several people (ADR 0044, revised 2026-10-09).
    pub fn set_links_inside(&mut self, on: bool) {
        self.root.set_links_inside(on);
    }

    /// The note that carries `folder`'s labels, order and pins, if it has
    /// one (ADR 0060 D3): the first of [`folder_note_candidates`] — for the
    /// root, [`root_note_candidates`] — the index holds, compared without
    /// case.
    pub fn folder_note_of(&self, folder: &str) -> Result<Option<String>, CoreError> {
        let notes = self.index.notes().map_err(CoreError::Index)?;
        Ok(self
            .note_candidates(folder)
            .into_iter()
            .find_map(|c| notes.iter().find(|n| same_name(n, &c)).cloned()))
    }

    /// The paths `folder`'s note may have, the root's included.
    fn note_candidates(&self, folder: &str) -> Vec<String> {
        if folder.is_empty() {
            root_note_candidates(&self.folder_note_name, &self.root_name())
        } else {
            folder_note_candidates(folder, &self.folder_note_name)
        }
    }

    /// The open folder's own name: what the root's note is named after.
    fn root_name(&self) -> String {
        self.folder
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    }

    /// The folder note name setting, as applied.
    #[must_use]
    pub fn folder_note_name(&self) -> &str {
        &self.folder_note_name
    }

    /// Read focuses from `.space/waypoints.json` in the open folder (ADR 0062).
    pub fn get_focuses(&mut self) -> Result<FocusesSummary, CoreError> {
        let summary = focuses::read_focuses(&self.root)?;
        if summary.format_known {
            if let Some(stamp) = &summary.stamp {
                if self.stamped_focuses.len() >= 16 {
                    self.stamped_focuses.clear();
                }
                self.stamped_focuses
                    .insert(stamp.clone(), summary.focuses.clone());
            }
            self.last_focuses = Some(summary.focuses.clone());
        }
        Ok(summary)
    }

    /// Whether focuses can be synced to `.space/waypoints.json`: the file
    /// is present and in the known format (ADR 0062 D5, D6).
    pub fn can_sync_focuses(&mut self) -> Result<bool, CoreError> {
        let summary = self.get_focuses()?;
        Ok(summary.has_file && summary.format_known)
    }

    /// Whether focuses sync to `.space/waypoints.json` is enabled for this workspace (ADR 0062 D5, D9).
    pub fn sync_focuses(&self) -> bool {
        self.sync_focuses
    }

    /// Set whether focuses sync to `.space/waypoints.json` is enabled for this workspace (ADR 0062 D5, D9).
    pub fn set_sync_focuses(&mut self, enabled: bool) {
        self.sync_focuses = enabled;
    }

    /// Write focuses back to `.space/waypoints.json` atomically, checking
    /// that the file on disk is the one that was read (ADR 0062 D5, D6, D7).
    pub fn set_focuses(
        &mut self,
        focuses: Vec<Focus>,
        expected_stamp: Option<&str>,
        base_focuses: Option<Vec<Focus>>,
    ) -> Result<FocusesSummary, CoreError> {
        if !self.sync_focuses {
            return Err(CoreError::Client(
                "sync focuses is disabled for this workspace".to_string(),
            ));
        }

        // Determine base focuses for concurrent reapply (ADR 0062 D7):
        let base_to_use = match (base_focuses.as_deref(), expected_stamp) {
            (Some(b), _) => Some(b),
            (None, Some(stamp)) => self.stamped_focuses.get(stamp).map(|v| v.as_slice()),
            (None, None) => None,
        };

        let summary = focuses::write_focuses(&self.root, base_to_use, focuses, expected_stamp)?;
        if summary.format_known {
            if let Some(stamp) = &summary.stamp {
                if self.stamped_focuses.len() >= 16 {
                    self.stamped_focuses.clear();
                }
                self.stamped_focuses
                    .insert(stamp.clone(), summary.focuses.clone());
            }
            self.last_focuses = Some(summary.focuses.clone());
        }
        Ok(summary)
    }
}

/// Markdown as the reading view renders a note (`verso_dialect::to_html`),
/// for a text that is not a note's: a board's text card (spec §5.11).
#[must_use]
pub fn render_markdown(text: &str) -> String {
    verso_dialect::to_html(text)
}

/// Whether a confined path names a note: by its `.md`, and by nothing
/// else. The listing always carries the extension; a `README` beside a
/// `README.md` is a file of its own, and a file operation on it must not
/// reach the note.
fn is_note(key: &str) -> bool {
    key.ends_with(".md")
}

/// Whether a confined path names a board (ADR 0057): by its `.canvas`.
fn is_canvas(key: &str) -> bool {
    key.ends_with(".canvas")
}

/// A text's tags — of its frontmatter and its body, without `#`, once each,
/// in the order met — as a base counts them (`file.tags`).
#[must_use]
pub fn tags_of(text: &str) -> Vec<String> {
    bases::NoteFacts::of(text).tags
}

/// Line and column (both from 1, the column in characters) of a byte
/// offset, for a link the index keeps from a file that is not Markdown.
/// Where each line of a text starts, found once: a canvas of thousands of
/// cards asks for the line and column of each link.
struct LineStarts(Vec<usize>);

impl LineStarts {
    fn of(text: &str) -> Self {
        let mut starts = vec![0];
        starts.extend(text.match_indices('\n').map(|(i, _)| i + 1));
        Self(starts)
    }

    /// The line and column (both from 1, the column in characters) of the
    /// byte `offset`.
    fn line_col(&self, text: &str, offset: usize) -> (u32, u32) {
        let offset = offset.min(text.len());
        let line = self.0.partition_point(|&s| s <= offset);
        let start = self.0.get(line.saturating_sub(1)).copied().unwrap_or(0);
        let col = text.get(start..offset).map_or(0, |s| s.chars().count()) + 1;
        (
            u32::try_from(line).unwrap_or(u32::MAX),
            u32::try_from(col).unwrap_or(u32::MAX),
        )
    }
}

/// The paths a folder's note may have, in the order they are looked for:
/// inside the folder, named as the setting says, then after the folder;
/// then beside it (ADR 0060 D3, D12). Compared without case. The root has
/// no folder note.
#[must_use]
pub fn folder_note_candidates(folder: &str, configured: &str) -> Vec<String> {
    if folder.is_empty() {
        return Vec::new();
    }
    let name = name_of(folder);
    let mut out = Vec::new();
    if !configured.is_empty() && !same_name(configured, name) {
        out.push(format!("{folder}/{configured}.md"));
    }
    out.push(format!("{folder}/{name}.md"));
    out.push(format!("{folder}.md"));
    out
}

/// The paths the root's note may have: at the root, named as the setting
/// says, then after the open folder (the maintainer, 2026-10-02: the
/// root's items can be ordered too). Compared without case.
#[must_use]
pub fn root_note_candidates(configured: &str, root_name: &str) -> Vec<String> {
    let mut out = Vec::new();
    if !configured.is_empty() && !same_name(configured, root_name) {
        out.push(format!("{configured}.md"));
    }
    if !root_name.is_empty() {
        out.push(format!("{root_name}.md"));
    }
    out
}
