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
//! where the configuration directory is ([`config_dir`]); that a second
//! `index` run re-reads every note and skips the ones whose stamp the
//! index already has; that a note under a path the walk reported a
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
pub use verso_fs::{Changes, ConfinementError, ReadError, WalkRules, Watch, WriteError};
use verso_index::{Backlink, Block, Heading, Hit, Index, Link, NoteStamp, Unresolved};

pub mod bases;
pub mod clients;
mod sidecar;
pub use sidecar::Sidecar;

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

/// Why the workspace could not be opened or refreshed.
#[derive(Debug)]
pub enum CoreError {
    Folder(std::io::Error),
    Index(verso_index::IndexError),
    /// No configuration directory can be named: neither `VERSO_CONFIG_DIR`
    /// nor `XDG_CONFIG_HOME` nor `HOME` is set. Never a relative fallback.
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
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Folder(e) => write!(f, "folder: {e}"),
            Self::Index(e) => write!(f, "{e}"),
            Self::NoConfigDir => write!(
                f,
                "no configuration directory: HOME, XDG_CONFIG_HOME and VERSO_CONFIG_DIR are all unset"
            ),
            Self::Confined(e) => write!(f, "{e}"),
            Self::Read(e) => write!(f, "read: {e}"),
            Self::NotText => write!(f, "the file is not UTF-8 text"),
            Self::Sidecar(e) => write!(f, "index sidecar: {e}"),
            Self::Write(e) => write!(f, "write: {e}"),
            Self::InvalidKey => write!(f, "the folder key is not one this core issued"),
            Self::UnknownFolder => write!(f, "no folder opened before has this key"),
            Self::Watch(e) => write!(f, "the folder cannot be watched for changes: {e}"),
            Self::Client(m) => write!(f, "MCP client: {m}"),
        }
    }
}

impl std::error::Error for CoreError {}

/// The configuration directory (ADR 0011): `$VERSO_CONFIG_DIR` if set (tests,
/// sensitive setups), else `$XDG_CONFIG_HOME/verso` if set, else
/// `~/Library/Application Support/verso` on macOS and `~/.config/verso`
/// elsewhere. Without any of the three it is an error, never a path
/// relative to the current directory. Provisional.
pub fn config_dir() -> Result<PathBuf, CoreError> {
    let get = |name: &str| std::env::var_os(name).filter(|v| !v.is_empty());
    config_dir_from(
        get("VERSO_CONFIG_DIR").as_deref(),
        get("XDG_CONFIG_HOME").as_deref(),
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
    home: Option<&Path>,
    macos: bool,
) -> Option<PathBuf> {
    if let Some(dir) = verso {
        return Some(PathBuf::from(dir));
    }
    if let Some(xdg) = xdg {
        return Some(PathBuf::from(xdg).join("verso"));
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
}

/// What a deletion left: where the entry went in `.trash/`, and what
/// could not be confirmed once it was there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Trashed {
    pub path: String,
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
    /// The whole text as read, line endings included, for an editor: what
    /// it gives back is written as is. Bytes that are not UTF-8 give no
    /// text at all ([`CoreError::NotText`]).
    pub text: String,
    /// What was read — modified time, length and content hash — as an
    /// opaque token a write hands back, so the write can refuse a file
    /// that changed meanwhile (invariant 11).
    pub revision: String,
}

/// What a link reached before a move — a note, by the index's rule, or
/// a file, by the same rule applied to attachments (spec Q12).
#[derive(Debug, Clone, PartialEq, Eq)]
enum Reached {
    Note(String),
    File(String),
}

impl Reached {
    fn path(&self) -> &str {
        match self {
            Self::Note(p) | Self::File(p) => p,
        }
    }
}

/// One link of a note read for a plan: where it is in the text, what it
/// said, and what it reached before the move.
struct Seen {
    start: usize,
    end: usize,
    target: String,
    reached: Reached,
}

/// A note read for a plan, before the move, with the links that reached
/// something then.
struct Examined {
    path: String,
    text: String,
    revision: String,
    links: Vec<Seen>,
}

/// What reading the notes before a move found: the notes read, the ones
/// that could not be (and why), and the errors worth a warning.
struct Examination {
    examined: Vec<Examined>,
    skipped: Vec<Skipped>,
    warnings: Vec<String>,
}

/// What a rename or a move changes, old path to new, notes and other
/// files apart: the plan maps what each link reached through this.
#[derive(Default)]
struct Move {
    notes: Vec<(String, String)>,
    files: Vec<(String, String)>,
}

impl Move {
    fn note_after(&self, path: &str) -> Option<&str> {
        self.notes
            .iter()
            .find(|(old, _)| old == path)
            .map(|(_, new)| new.as_str())
    }

    /// Where what a link reached is after the move.
    fn after(&self, reached: &Reached) -> Reached {
        match reached {
            Reached::Note(p) => {
                Reached::Note(self.note_after(p).map_or_else(|| p.clone(), str::to_owned))
            }
            Reached::File(p) => Reached::File(
                self.files
                    .iter()
                    .find(|(old, _)| old == p)
                    .map_or_else(|| p.clone(), |(_, new)| new.clone()),
            ),
        }
    }

    /// The folded keys a link naming what moves — before or after, by
    /// path or by bare name, extension or not — can carry in the index.
    fn keys(&self) -> Vec<String> {
        let mut keys = Vec::new();
        for (old, new) in &self.notes {
            for p in [old, new] {
                let (path_key, name_key) = verso_index::note_keys(p);
                keys.push(path_key);
                keys.push(name_key);
            }
        }
        for (old, new) in &self.files {
            for p in [old, new] {
                let name = p.rsplit('/').next().unwrap_or(p);
                let stem = name.rsplit_once('.').map_or(name, |(stem, _)| stem);
                keys.push(verso_index::file_key(p));
                keys.push(verso_index::file_key(name));
                keys.push(verso_index::file_key(stem));
            }
        }
        keys.sort();
        keys.dedup();
        keys
    }
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
        Ok(Self {
            folder,
            root,
            index,
            files: HashMap::new(),
            dirs: HashSet::new(),
            entries: Vec::new(),
            base_facts: HashMap::new(),
        })
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

    /// The walk's rules — the user's setting, from outside the tree.
    /// Takes effect on the next index run; the caller reindexes.
    pub fn set_walk_rules(&mut self, rules: WalkRules) {
        self.root.set_rules(rules);
    }

    pub fn index_with_progress<F>(&mut self, mut on_progress: F) -> Result<IndexReport, CoreError>
    where
        F: FnMut(IndexProgress),
    {
        on_progress(IndexProgress {
            phase: "scanning".to_string(),
            current: 0,
            total: 0,
            file: None,
        });
        let walk = self.root.walk();
        let total_notes = walk
            .entries
            .iter()
            .filter(|e| matches!(e.kind, EntryKind::Note))
            .count();
        on_progress(IndexProgress {
            phase: "indexing".to_string(),
            current: 0,
            total: total_notes,
            file: None,
        });
        let mut report = IndexReport::default();
        let mut present: HashSet<String> = HashSet::new();
        let mut files: HashMap<String, Vec<String>> = HashMap::new();
        let mut dirs: HashSet<String> = HashSet::new();
        let mut entries: Vec<FileEntry> = Vec::with_capacity(walk.entries.len());
        let mut note_idx = 0;
        for entry in &walk.entries {
            let relative = entry.relative.to_string_lossy().into_owned();
            entries.push(FileEntry {
                path: relative.clone(),
                kind: match &entry.kind {
                    EntryKind::Note => FileKind::Note,
                    EntryKind::File => FileKind::File,
                    EntryKind::Directory => FileKind::Folder,
                    EntryKind::Placeholder { .. } => FileKind::Placeholder,
                },
                len: entry.len,
                modified: entry.modified.map_or(0, seconds_since_epoch),
                created: entry.created.map_or(0, seconds_since_epoch),
            });
            match &entry.kind {
                EntryKind::Note => {
                    note_idx += 1;
                    on_progress(IndexProgress {
                        phase: "indexing".to_string(),
                        current: note_idx,
                        total: total_notes,
                        file: Some(relative.clone()),
                    });
                    present.insert(relative.clone());
                    match self.root.read(entry.handle) {
                        Ok((bytes, stamp)) => {
                            let stamp = note_stamp(&stamp);
                            let same = self.index.stamp_of(&relative).map_err(CoreError::Index)?
                                == Some(stamp);
                            // A row left unverified by a placeholder is
                            // re-read even when its stamp matches: reading
                            // the note is what verifies it (ADR 0043).
                            let unverified = self
                                .index
                                .is_unverified(&relative)
                                .map_err(CoreError::Index)?
                                .unwrap_or(false);
                            if same && !unverified {
                                report.unchanged += 1;
                                continue;
                            }
                            // Lossy for search only: nothing here is ever
                            // written back (`read_note` refuses such bytes).
                            let content = String::from_utf8_lossy(&bytes);
                            let parsed = verso_dialect::parse(&content);
                            self.index
                                .upsert(&relative, stamp, &content, &parsed)
                                .map_err(CoreError::Index)?;
                            report.indexed += 1;
                            report.changed.push(relative.clone());
                        }
                        Err(verso_fs::ReadError::Unavailable) => {
                            // Present, content unavailable (ADR 0043): the
                            // last known version stays, marked unverified.
                            self.index
                                .mark_placeholder(&relative)
                                .map_err(CoreError::Index)?;
                            report.placeholders += 1;
                        }
                        Err(e) => report.unreadable.push((relative, e.to_string())),
                    }
                }
                EntryKind::Placeholder { of } => {
                    // Present, content unavailable: the last known version
                    // of the real file stays, marked unverified (ADR 0043);
                    // a file that is not a note is listed under its real
                    // name, so an embed finds it present and a read says
                    // unavailable — never absent.
                    let real = of.to_string_lossy().into_owned();
                    if real.ends_with(".md") {
                        self.index
                            .mark_placeholder(&real)
                            .map_err(CoreError::Index)?;
                    } else {
                        files
                            .entry(verso_index::file_key(name_of(&real)))
                            .or_default()
                            .push(real.clone());
                    }
                    present.insert(real);
                    report.placeholders += 1;
                }
                EntryKind::File => {
                    files
                        .entry(verso_index::file_key(name_of(&relative)))
                        .or_default()
                        .push(relative.clone());
                }
                EntryKind::Directory => {
                    dirs.insert(relative.clone());
                }
            }
        }
        self.files = files;
        self.dirs = dirs;
        report.listing_changed = self.entries.len() != entries.len()
            || self
                .entries
                .iter()
                .zip(&entries)
                .any(|(was, is)| was.path != is.path || was.kind != is.kind);
        self.entries = entries;
        report.problems = walk.problems.iter().map(WalkProblem::from).collect();
        // Not walked because of a problem: nothing under it is gone. The
        // root itself (an empty path) protects every note.
        let protected: Vec<&str> = report.problems.iter().map(WalkProblem::path).collect();
        let under_problem = |note: &str| {
            protected.iter().any(|p| {
                p.is_empty()
                    || note == *p
                    || note
                        .strip_prefix(p)
                        .is_some_and(|rest| rest.starts_with('/'))
            })
        };
        for known in self.index.notes().map_err(CoreError::Index)? {
            if !present.contains(&known)
                && !under_problem(&known)
                && self.index.remove(&known).map_err(CoreError::Index)?
            {
                report.removed += 1;
                report.gone.push(known);
            }
        }
        let now = seconds_since_epoch(std::time::SystemTime::now());
        self.index
            .set_root(&self.folder.to_string_lossy(), now)
            .map_err(CoreError::Index)?;
        // Beside the index, so that the directory can say which folder
        // each index belongs to; written from the first run, since a
        // sidecar that starts later cannot describe what already exists.
        // Losing it costs an entry in a listing, not a note: a warning.
        let sidecar = Sidecar {
            folder: self.folder.clone(),
            indexed_at: now,
            schema: verso_index::SCHEMA_VERSION,
        }
        .write(self.index.path());
        if let Err(e) = sidecar {
            report
                .warnings
                .push(format!("the index sidecar could not be written: {e}"));
        }
        on_progress(IndexProgress {
            phase: "done".to_string(),
            current: total_notes,
            total: total_notes,
            file: None,
        });
        Ok(report)
    }

    /// Watch the folder for changes made outside the app — by another
    /// editor, a sync client, git (provisional:
    /// `docs/reference/watcher-decision.md`). `on_change` is called on a
    /// thread of the watch's own, with each batch, once the folder has
    /// been quiet for [`WATCH_QUIET`]; the caller brings the index up to
    /// date with [`Workspace::index`], which finds by itself what changed —
    /// the batch's paths say that something did, not all of what. The
    /// index's own directory is left out, for when the configuration
    /// directory lies inside the folder: every index run writes there.
    /// Dropping the [`Watch`] stops it.
    pub fn watch(
        &self,
        on_change: impl FnMut(Changes) + Send + 'static,
    ) -> Result<Watch, CoreError> {
        let own: Vec<PathBuf> = self
            .index
            .path()
            .parent()
            .map(Path::to_path_buf)
            .into_iter()
            .collect();
        self.root
            .watch(WATCH_QUIET, &own, on_change)
            .map_err(CoreError::Watch)
    }

    pub fn search(&self, words: &str, limit: usize) -> Result<Vec<Hit>, CoreError> {
        self.index.search(words, limit).map_err(CoreError::Index)
    }

    /// The path of a note as the index keys it and as every answer echoes
    /// it — relative to the folder, normalized, with `.md` — after
    /// confinement: a path that cannot name a file of the folder is
    /// refused here, whether the caller goes on to the disk or only to the
    /// index (ADR 0044; `docs/reference/mcp-decision.md` §4.3). The key is
    /// the confined form, never the string the caller sent: `./Taverna`,
    /// `Taverna/` and `Taverna.md` name one note, and `.`, `` and `x/`
    /// with nothing after are refused as empty, not as a hidden `.md`.
    pub fn note_key(&self, note: &str) -> Result<String, CoreError> {
        let confined = self
            .root
            .confine(Path::new(note))
            .map_err(CoreError::Confined)?;
        let mut key = confined.to_string_lossy().into_owned();
        if !key.ends_with(".md") {
            key.push_str(".md");
        }
        Ok(key)
    }

    /// [`Self::note_key`] and the handle to read the file.
    fn note_path(&mut self, note: &str) -> Result<(String, verso_fs::Handle), CoreError> {
        let key = self.note_key(note)?;
        let handle = self
            .root
            .handle(Path::new(&key))
            .map_err(CoreError::Confined)?;
        Ok((key, handle))
    }

    fn known(&self, path: &str) -> Result<bool, CoreError> {
        Ok(self
            .index
            .stamp_of(path)
            .map_err(CoreError::Index)?
            .is_some())
    }

    /// Backlinks of a note given by its path relative to the folder, with
    /// or without `.md`; `None` when the index does not know the note.
    pub fn backlinks(&mut self, note: &str) -> Result<Option<Vec<Backlink>>, CoreError> {
        let path = self.note_key(note)?;
        if !self.known(&path)? {
            return Ok(None);
        }
        self.index
            .backlinks(&path)
            .map(Some)
            .map_err(CoreError::Index)
    }

    /// The links a note makes, with what each resolves to; `None` when the
    /// index does not know the note.
    pub fn links(&mut self, note: &str) -> Result<Option<Vec<Link>>, CoreError> {
        let path = self.note_key(note)?;
        if !self.known(&path)? {
            return Ok(None);
        }
        self.index
            .links_of(&path)
            .map(Some)
            .map_err(CoreError::Index)
    }

    /// Whether the index holds the note only as an unverified last version
    /// (ADR 0043); `None` when it does not know the note.
    pub fn is_unverified(&mut self, note: &str) -> Result<Option<bool>, CoreError> {
        let path = self.note_key(note)?;
        self.index.is_unverified(&path).map_err(CoreError::Index)
    }

    /// The note as a caller sees it from a text this core has in hand —
    /// just read, or just written — with the positions the index has.
    fn note_text(
        &self,
        path: String,
        text: String,
        revision: String,
        stale: bool,
        unverified: bool,
    ) -> Result<NoteText, CoreError> {
        Ok(NoteText {
            lines: text.lines().map(str::to_owned).collect(),
            html: verso_dialect::to_html(&text),
            properties: properties(&text),
            stale,
            unverified,
            headings: self.index.headings_of(&path).map_err(CoreError::Index)?,
            blocks: self.index.blocks_of(&path).map_err(CoreError::Index)?,
            revision,
            text,
            path,
        })
    }

    /// The note's text as it is on disk now, through `verso-fs` (a
    /// placeholder answers `Read(Unavailable)`, never empty text — ADR
    /// 0043; bytes that are not UTF-8 answer `NotText`), with the
    /// positions the index has for it and whether the index is behind
    /// the file.
    pub fn read_note(&mut self, note: &str) -> Result<NoteText, CoreError> {
        let (path, handle) = self.note_path(note)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let text = String::from_utf8(bytes).map_err(|_| CoreError::NotText)?;
        let known = self.index.stamp_of(&path).map_err(CoreError::Index)?;
        let stale = known != Some(note_stamp(&stamp));
        let unverified = self
            .index
            .is_unverified(&path)
            .map_err(CoreError::Index)?
            .unwrap_or(false);
        self.note_text(path, text, revision::encode(&stamp), stale, unverified)
    }

    /// The stamp of the bytes a write or a create just put in place, for
    /// the revision it hands back (invariant 11). The report carries it
    /// when the durability step could confirm it; otherwise the file is
    /// read again, and its stamp is trusted only while it still holds the
    /// caller's bytes — a revision is never issued for content other than
    /// the caller's, so a save by someone else in the meantime is refused
    /// with the diff, not overwritten.
    fn stamp_of_written(
        &self,
        handle: verso_fs::Handle,
        confirmed: Option<Stamp>,
        content: &[u8],
    ) -> Stamp {
        if let Some(stamp) = confirmed {
            return stamp;
        }
        match self.root.read(handle) {
            Ok((bytes, stamp)) if bytes == content => stamp,
            _ => revision::impossible(),
        }
    }

    /// What a write could not preserve, one line each, for the user. A
    /// symlink's target is named relative to the folder when it is inside
    /// it; outside, only that it is outside — an absolute path never
    /// crosses the contract (ADR 0026 rule 4).
    fn write_warnings(&self, r: &verso_fs::WriteReport) -> Vec<String> {
        let mut out = r.warnings();
        if let Some(target) = &r.wrote_through_symlink_to {
            out.push(match target.strip_prefix(&self.folder) {
                Ok(inside) => format!("written through a symlink to {}", inside.display()),
                Err(_) => "written through a symlink to a file outside the folder".to_owned(),
            });
        }
        out
    }

    fn decode_revision(revision: &str) -> Result<Stamp, CoreError> {
        revision::decode(revision).ok_or_else(|| {
            CoreError::Write(WriteError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "the revision token is not one this core issued",
            )))
        })
    }

    /// Write a note's text over the file that `revision` describes —
    /// atomically, through `verso-fs` (ADR 0029) — and bring the index up
    /// to date for that note. The bytes are the caller's, as given: no
    /// normalization (ADR 0012). If the file on disk is no longer the one
    /// that was read, nothing is written and the answer is
    /// `CoreError::Write(WriteError::Changed)`: the caller reads again and
    /// shows the user both versions (invariant 11). Returns the note as
    /// written — the caller's text with the revision of those bytes,
    /// never a re-read that someone else may have changed already.
    pub fn write_note(
        &mut self,
        note: &str,
        text: &str,
        revision: &str,
    ) -> Result<Written, CoreError> {
        let (path, handle) = self.note_path(note)?;
        let expected = Self::decode_revision(revision)?;
        let report = self
            .root
            .write(handle, text.as_bytes(), &expected)
            .map_err(CoreError::Write)?;
        let stamp = self.stamp_of_written(handle, report.stamp, text.as_bytes());
        self.index
            .upsert(&path, note_stamp(&stamp), text, &verso_dialect::parse(text))
            .map_err(CoreError::Index)?;
        Ok(Written {
            note: self.note_text(
                path,
                text.to_owned(),
                revision::encode(&stamp),
                false,
                false,
            )?,
            warnings: self.write_warnings(&report),
        })
    }

    /// Create a note that does not exist yet (ADR 0048): `name` with or
    /// without `.md`, in a folder that is created if needed; refused when
    /// something already stands there. Indexed at once. What could not be
    /// confirmed once the file was in place (`verso_fs::OpReport`) has no
    /// place in the answer and is not reported here.
    pub fn create_note(&mut self, name: &str, text: &str) -> Result<NoteText, CoreError> {
        let key = self.note_key(name)?;
        let (handle, report) = self
            .root
            .create(Path::new(&key), text.as_bytes())
            .map_err(CoreError::Write)?;
        let stamp = self.stamp_of_written(handle, report.stamp, text.as_bytes());
        self.index
            .upsert(&key, note_stamp(&stamp), text, &verso_dialect::parse(text))
            .map_err(CoreError::Index)?;
        self.note_text(key, text.to_owned(), revision::encode(&stamp), false, false)
    }

    /// Create a file that is not a note — an image pasted into a note,
    /// an attachment — with `bytes`, at a path relative to the folder;
    /// refused when something stands there. Listed at once.
    pub fn create_file(&mut self, relative: &str, bytes: &[u8]) -> Result<String, CoreError> {
        let key = self.entry_key(relative)?;
        let _ = self
            .root
            .create(Path::new(&key), bytes)
            .map_err(CoreError::Write)?;
        self.files
            .entry(verso_index::file_key(name_of(&key)))
            .or_default()
            .push(key.clone());
        Ok(key)
    }

    /// Create a folder inside the open folder. The walk does not list an
    /// empty folder, so the caller shows it until something lands in it.
    pub fn create_folder(&mut self, relative: &str) -> Result<String, CoreError> {
        let key = self.entry_key(relative)?;
        let (made, _) = self
            .root
            .create_dir(Path::new(&key))
            .map_err(CoreError::Write)?;
        let made = made.to_string_lossy().into_owned();
        self.dirs.insert(made.clone());
        Ok(made)
    }

    /// Walk again after an entry moved or went to the bin, so the listing
    /// and the index agree with the disk; what fails is a warning, since
    /// the move itself has happened.
    fn refresh(&mut self, warnings: &mut Vec<String>) {
        match self.index() {
            Ok(r) => warnings.extend(r.warnings),
            Err(e) => warnings.push(format!("the folder could not be listed again: {e}")),
        }
    }

    /// Move a note to `.trash/` at the root (Obsidian's bin; nothing is
    /// unlinked) and forget it in the index. Returns where it went; once
    /// the note is in the bin, what fails is a warning, not a failure.
    pub fn delete_note(&mut self, note: &str) -> Result<Trashed, CoreError> {
        let key = self.note_key(note)?;
        let (gone, report) = self.root.trash(Path::new(&key)).map_err(CoreError::Write)?;
        let mut warnings = report.warnings();
        if let Err(e) = self.index.remove(&key) {
            warnings.push(format!("the index could not forget {key}: {e}"));
        }
        self.refresh(&mut warnings);
        Ok(Trashed {
            path: gone.to_string_lossy().into_owned(),
            warnings,
        })
    }

    /// Read, before a move, every note whose links may name what moves —
    /// by path or by bare name, before or after — and the moved notes
    /// themselves, with what each link reaches now. A note that cannot be
    /// read is skipped and said so; the move does not wait for it.
    fn examine(&mut self, mv: &Move) -> Result<Examination, CoreError> {
        let mut paths = self
            .index
            .links_naming(&mv.keys())
            .map_err(CoreError::Index)?;
        paths.extend(mv.notes.iter().map(|(old, _)| old.clone()));
        paths.sort();
        paths.dedup();
        let mut examined = Vec::new();
        let mut skipped = Vec::new();
        let mut warnings = Vec::new();
        for path in paths {
            let handle = match self.root.handle(Path::new(&path)) {
                Ok(h) => h,
                Err(e) => {
                    warnings.push(format!("{path}: {e}"));
                    skipped.push(Skipped {
                        path,
                        reason: SkipReason::Failed,
                    });
                    continue;
                }
            };
            let (bytes, stamp) = match self.root.read(handle) {
                Ok(read) => read,
                Err(ReadError::Unavailable) => {
                    skipped.push(Skipped {
                        path,
                        reason: SkipReason::Unavailable,
                    });
                    continue;
                }
                Err(e) => {
                    warnings.push(format!("{path}: {e}"));
                    skipped.push(Skipped {
                        path,
                        reason: SkipReason::Failed,
                    });
                    continue;
                }
            };
            let Ok(text) = String::from_utf8(bytes) else {
                skipped.push(Skipped {
                    path,
                    reason: SkipReason::NotText,
                });
                continue;
            };
            let parsed = verso_dialect::parse(&text);
            let mut links = Vec::new();
            let spans = parsed
                .links
                .iter()
                .map(|l| (l.span, l.target.as_str()))
                .chain(parsed.embeds.iter().map(|e| (e.span, e.target.as_str())));
            for (span, target) in spans {
                if let Some(reached) = self.reach(&path, target)? {
                    links.push(Seen {
                        start: span.start,
                        end: span.end,
                        target: target.to_owned(),
                        reached,
                    });
                }
            }
            examined.push(Examined {
                path,
                text,
                revision: revision::encode(&stamp),
                links,
            });
        }
        Ok(Examination {
            examined,
            skipped,
            warnings,
        })
    }

    /// What `[[target]]` written in `source` reaches now: a note by the
    /// index's rule, else a file by the same rule (spec Q12).
    fn reach(&self, source: &str, target: &str) -> Result<Option<Reached>, CoreError> {
        if let Some(note) = self
            .index
            .resolve_from(source, target)
            .map_err(CoreError::Index)?
        {
            return Ok(Some(Reached::Note(note)));
        }
        Ok(self.resolve_file(source, target).map(Reached::File))
    }

    /// Make the index and the listing follow a move that has happened:
    /// each moved note's row is re-keyed with everything it knows — a
    /// placeholder's last known version included (ADR 0043) — then the
    /// folder is walked again. Nothing here fails: the move is done, and
    /// what could not follow it is a warning.
    fn follow(&mut self, mv: &Move, warnings: &mut Vec<String>) {
        for (old, new) in &mv.notes {
            if let Err(e) = self.index.rekey(old, new) {
                warnings.push(format!(
                    "the index could not follow {old} to {new}: {e}; reindex to repair"
                ));
            }
        }
        for (old, new) in &mv.files {
            if let Some(paths) = self.files.get_mut(&verso_index::file_key(name_of(old))) {
                paths.retain(|p| p != old);
            }
            self.files
                .entry(verso_index::file_key(name_of(new)))
                .or_default()
                .push(new.clone());
        }
        self.refresh(warnings);
    }

    /// The target text that makes a link written as `written` in `source`
    /// reach `wanted` after the move: the bare name when the writer used
    /// one and it still resolves there, else the path from the root; with
    /// `.md` only when the writer wrote it. `None` when no form reaches
    /// it, which the caller reports.
    fn retarget(&self, source: &str, written: &str, wanted: &Reached) -> Option<String> {
        // A candidate goes between `[[` and `]]`, so it has to come back
        // from the parser as that very target: a name holding `|` (an
        // alias), `#` (a heading) or `]]` (the end) would be read as
        // another target, and the link would reach something else.
        let holds = |candidate: &str| {
            let doc = verso_dialect::parse(&format!("[[{candidate}]]"));
            matches!(doc.links.as_slice(), [l] if l.target == candidate
                && l.heading.is_none() && l.block.is_none() && l.alias.is_none())
        };
        let reaches = |candidate: &str| {
            holds(candidate)
                && self.reach(source, candidate).ok().flatten().as_ref() == Some(wanted)
        };
        let (bare, path) = match wanted {
            Reached::Note(p) => {
                // The extension as the writer spelled it, or none.
                let trimmed = written.trim();
                let ext = &trimmed[without_md(trimmed).len()..];
                (
                    format!("{}{ext}", without_md(name_of(p))),
                    format!("{}{ext}", without_md(p)),
                )
            }
            Reached::File(p) => {
                let name = name_of(p);
                let wrote_extension = name_of(written.trim()).contains('.');
                let bare = if wrote_extension {
                    name.to_owned()
                } else {
                    name.rsplit_once('.')
                        .map_or(name, |(stem, _)| stem)
                        .to_owned()
                };
                (bare, p.clone())
            }
        };
        if !written.contains('/') && reaches(&bare) {
            return Some(bare);
        }
        if reaches(&path) {
            return Some(path);
        }
        None
    }

    /// The rewrites a move calls for: for each note read before it, the
    /// links that reached what moved and no longer reach it — or that
    /// reached something else and now reach what moved into their way —
    /// get a target that reaches, after the move, what they reached
    /// before. Only what the parser reports as a link is touched: a
    /// `[[…]]` in a code span or a fence is text. One rewrite per note,
    /// with the revision of the text it was made from.
    fn plan(
        &self,
        examined: Vec<Examined>,
        mv: &Move,
        warnings: &mut Vec<String>,
    ) -> Vec<LinkRewrite> {
        let mut rewrites = Vec::new();
        for note in examined {
            let path_now = mv
                .note_after(&note.path)
                .map_or_else(|| note.path.clone(), str::to_owned);
            let mut edits: Vec<(usize, usize, String)> = Vec::new();
            for seen in &note.links {
                let wanted = mv.after(&seen.reached);
                let now = match self.reach(&path_now, &seen.target) {
                    Ok(now) => now,
                    Err(e) => {
                        warnings.push(format!("{path_now}: {e}"));
                        continue;
                    }
                };
                if now.as_ref() == Some(&wanted) {
                    continue;
                }
                match self.retarget(&path_now, &seen.target, &wanted) {
                    Some(target) => edits.push((seen.start, seen.end, target)),
                    None => warnings.push(format!(
                        "{path_now}: the link [[{}]] could not be pointed at {}",
                        seen.target,
                        wanted.path()
                    )),
                }
            }
            if let Some(after) = retargeted(&note.text, &edits) {
                rewrites.push(LinkRewrite {
                    path: path_now,
                    revision: note.revision,
                    before: note.text,
                    after,
                });
            }
        }
        // In the order of the paths shown, which for a moved note is its
        // new one.
        rewrites.sort_by(|a, b| a.path.cmp(&b.path));
        rewrites
    }

    /// Rename or move a note, and say which notes link to it and how
    /// their text would change (ADR 0048, option (b)): the file moves,
    /// the index follows, and the rewrites come back as a plan — before
    /// and after, with each note's revision — for the caller to show and
    /// then apply through `write_note`, one atomic write per note. Only
    /// the links the index resolved to the note are rewritten, in a form
    /// that resolves to its new path (spec Q12): a bare name that would
    /// now reach another note becomes a path. Nothing but the renamed
    /// file is written here; once it has moved, nothing fails — what
    /// could not be planned is in `skipped`, and what could not be
    /// confirmed in `warnings`.
    pub fn rename_note(&mut self, from: &str, to: &str) -> Result<Renamed, CoreError> {
        let old = self.note_key(from)?;
        let new = self.note_key(to)?;
        let mv = Move {
            notes: vec![(old.clone(), new.clone())],
            files: Vec::new(),
        };
        self.perform(mv, &old, &new)
    }

    /// Read what a move may change, move the entry, make the index and
    /// the listing follow, plan the rewrites. `old` and `new` are the
    /// entry the caller named; `mv` is everything that moves with it.
    fn perform(&mut self, mv: Move, old: &str, new: &str) -> Result<Renamed, CoreError> {
        let Examination {
            examined,
            mut skipped,
            mut warnings,
        } = self.examine(&mv)?;
        let (_, report) = self
            .root
            .rename(Path::new(old), Path::new(new))
            .map_err(CoreError::Write)?;
        // The entry has moved: from here on, nothing is an error.
        warnings.extend(report.warnings());
        self.follow(&mv, &mut warnings);
        let rewrites = self.plan(examined, &mv, &mut warnings);
        for s in &mut skipped {
            if let Some(now) = mv.note_after(&s.path) {
                s.path = now.to_owned();
            }
        }
        Ok(Renamed {
            path: new.to_owned(),
            rewrites,
            skipped,
            warnings,
        })
    }

    /// Any file's content as text with its revision, for an editor; bytes
    /// that are not UTF-8 answer `NotText`. A note has
    /// [`Self::read_note`], which knows more.
    pub fn read_text(&mut self, relative: &str) -> Result<TextFile, CoreError> {
        let key = self.entry_key(relative)?;
        let handle = self
            .root
            .handle(Path::new(&key))
            .map_err(CoreError::Confined)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let text = String::from_utf8(bytes).map_err(|_| CoreError::NotText)?;
        Ok(TextFile {
            path: key,
            text,
            revision: revision::encode(&stamp),
            warnings: Vec::new(),
        })
    }

    /// Evaluate a base — a `.base` file, or the text of a `base` block —
    /// over the folder as the index and the last walk know it (ADR 0053).
    /// Reads the base's file, if the query names one, and nothing else of
    /// the folder: what the notes say comes from the index.
    pub fn query_base(&mut self, query: &bases::BaseQuery) -> Result<bases::BaseResult, CoreError> {
        let text = match (&query.text, &query.path) {
            (Some(text), _) => text.clone(),
            (None, Some(path)) => self.read_text(path)?.text,
            (None, None) => String::new(),
        };
        let base = verso_dialect::bases::parse_base(&text);
        self.refresh_base_facts()?;
        let offset = i64::from(query.offset_minutes) * 60_000;
        let local = |secs: i64| (secs > 0).then(|| secs * 1_000 + offset);
        let files: Vec<bases::FileFacts> = self
            .entries
            .iter()
            .filter(|e| e.kind != FileKind::Folder)
            .map(|e| bases::FileFacts {
                path: e.path.clone(),
                size: e.len,
                ctime: local(e.created).or_else(|| local(e.modified)),
                mtime: local(e.modified),
                note: e.path.to_lowercase().ends_with(".md"),
            })
            .collect();
        let notes = self
            .base_facts
            .iter()
            .map(|(path, (_, facts))| (path.clone(), facts))
            .collect();
        let links = self
            .index
            .all_links()
            .map_err(CoreError::Index)?
            .into_iter()
            .map(|l| {
                (
                    l.from,
                    bases::LinkFact {
                        target: l.target,
                        alias: l.alias,
                        embed: l.embed,
                        resolved: l.resolved,
                    },
                )
            })
            .collect();
        let index = &self.index;
        let resolver = |from: &str, target: &str| -> Option<String> {
            index
                .resolve_from(from, target)
                .ok()
                .flatten()
                .or_else(|| self.resolve_file(from, target))
        };
        let facts = bases::Facts::new(files, notes, links, &resolver);
        Ok(bases::run(&base, query, &facts))
    }

    /// Bring [`Self::base_facts`] level with the index: notes gone are
    /// dropped, notes whose hash changed are read again from the index's
    /// copy of their text.
    fn refresh_base_facts(&mut self) -> Result<(), CoreError> {
        let hashes = self.index.note_hashes().map_err(CoreError::Index)?;
        let present: HashSet<&str> = hashes.iter().map(|(p, _)| p.as_str()).collect();
        self.base_facts.retain(|p, _| present.contains(p.as_str()));
        for (path, hash) in &hashes {
            if self.base_facts.get(path).is_some_and(|(h, _)| h == hash) {
                continue;
            }
            let content = self
                .index
                .content_of(path)
                .map_err(CoreError::Index)?
                .unwrap_or_default();
            self.base_facts
                .insert(path.clone(), (*hash, bases::NoteFacts::of(&content)));
        }
        Ok(())
    }

    /// Write any file's text over the file that `revision` describes,
    /// atomically (ADR 0029; invariant 11 refuses a changed file). A note
    /// — a path ending in `.md` — goes through [`Self::write_note`], so
    /// the index follows it. Returns the caller's text with the revision
    /// of the bytes written.
    pub fn write_text(
        &mut self,
        relative: &str,
        text: &str,
        revision: &str,
    ) -> Result<TextFile, CoreError> {
        let key = self.entry_key(relative)?;
        if is_note(&key) {
            let w = self.write_note(&key, text, revision)?;
            return Ok(TextFile {
                path: w.note.path,
                text: w.note.text,
                revision: w.note.revision,
                warnings: w.warnings,
            });
        }
        let handle = self
            .root
            .handle(Path::new(&key))
            .map_err(CoreError::Confined)?;
        let expected = Self::decode_revision(revision)?;
        let report = self
            .root
            .write(handle, text.as_bytes(), &expected)
            .map_err(CoreError::Write)?;
        let stamp = self.stamp_of_written(handle, report.stamp, text.as_bytes());
        Ok(TextFile {
            path: key,
            text: text.to_owned(),
            revision: revision::encode(&stamp),
            warnings: self.write_warnings(&report),
        })
    }

    /// Every entry of the folder as the last walk saw it — notes, other
    /// files, folders and placeholders — with size and date: what a
    /// folder listing shows and sorts by.
    #[must_use]
    pub fn entries(&self) -> &[FileEntry] {
        &self.entries
    }

    /// A path of the folder as confinement names it — relative,
    /// normalized, no extension added — or the refusal. What a caller that
    /// judges a path by its name must look at, instead of the string it
    /// was sent: `Nota.md/` and `./Nota.md` are `Nota.md`.
    pub fn confined(&self, path: &str) -> Result<String, CoreError> {
        self.entry_key(path)
    }

    /// A path of the folder confined, as given: no `.md` added, so it
    /// names a file of any kind or a folder.
    fn entry_key(&self, path: &str) -> Result<String, CoreError> {
        Ok(self
            .root
            .confine(Path::new(path))
            .map_err(CoreError::Confined)?
            .to_string_lossy()
            .into_owned())
    }

    /// Where an entry is on disk, for the host to hand to the system's
    /// file manager. The one absolute path that leaves this crate besides
    /// [`Self::folder`]; it goes to the operating system, never across
    /// the contract (ADR 0026 rule 4).
    pub fn absolute(&self, path: &str) -> Result<PathBuf, CoreError> {
        Ok(self.folder.join(self.entry_key(path)?))
    }

    /// Rename or move anything of the folder — a note, another file or a
    /// folder — and say which notes link to what moved (ADR 0048, option
    /// (b)): the entry moves, the index follows, and the rewrites come
    /// back as a plan for the caller to show and apply through
    /// `write_note`. A note (a path ending in `.md`) goes through
    /// [`Self::rename_note`]. A folder moves with everything under it,
    /// notes and attachments alike, and the notes inside keep what they
    /// knew. An attachment's linkers are the notes whose embeds name it.
    pub fn rename_entry(&mut self, from: &str, to: &str) -> Result<Renamed, CoreError> {
        let old = self.entry_key(from)?;
        let new = self.entry_key(to)?;
        if self.dirs.contains(&old) {
            return self.rename_folder(&old, &new);
        }
        if is_note(&old) {
            return self.rename_note(&old, &new);
        }
        let mv = Move {
            notes: Vec::new(),
            files: vec![(old.clone(), new.clone())],
        };
        self.perform(mv, &old, &new)
    }

    fn rename_folder(&mut self, old: &str, new: &str) -> Result<Renamed, CoreError> {
        let prefix = format!("{old}/");
        let moved = |p: &String| {
            p.strip_prefix(&prefix)
                .map(|rest| (p.clone(), format!("{new}/{rest}")))
        };
        let notes: Vec<(String, String)> = self
            .index
            .notes()
            .map_err(CoreError::Index)?
            .iter()
            .filter_map(moved)
            .collect();
        let files: Vec<(String, String)> =
            self.files.values().flatten().filter_map(moved).collect();
        self.perform(Move { notes, files }, old, new)
    }

    /// Move anything of the folder — a note, another file or a whole
    /// folder — to `.trash/` at the root (Obsidian's bin; nothing is
    /// unlinked) and forget it in the index. Returns where it went; once
    /// it is in the bin, what fails is a warning, not a failure.
    pub fn delete_entry(&mut self, path: &str) -> Result<Trashed, CoreError> {
        let key = self.entry_key(path)?;
        let folder = self.dirs.contains(&key);
        if !folder && is_note(&key) {
            return self.delete_note(&key);
        }
        let (gone, report) = self.root.trash(Path::new(&key)).map_err(CoreError::Write)?;
        let mut warnings = report.warnings();
        if folder {
            let prefix = format!("{key}/");
            match self.index.notes() {
                Ok(notes) => {
                    for note in notes.iter().filter(|n| n.starts_with(&prefix)) {
                        if let Err(e) = self.index.remove(note) {
                            warnings.push(format!("the index could not forget {note}: {e}"));
                        }
                    }
                }
                Err(e) => warnings.push(format!("the index could not forget {key}: {e}")),
            }
        }
        self.refresh(&mut warnings);
        Ok(Trashed {
            path: gone.to_string_lossy().into_owned(),
            warnings,
        })
    }

    /// The notes that are web pages (a `url` property), with the address.
    pub fn web_notes(&self) -> Result<Vec<(String, String)>, CoreError> {
        self.index.web_notes().map_err(CoreError::Index)
    }

    /// Every resolved link of the vault, source then target: the graph.
    pub fn graph(&self) -> Result<Vec<(String, String)>, CoreError> {
        self.index.graph().map_err(CoreError::Index)
    }

    /// Every tag of the vault with its notes (frontmatter and `#tag`).
    pub fn tags(&self) -> Result<Vec<(String, Vec<String>)>, CoreError> {
        self.index.tags().map_err(CoreError::Index)
    }

    /// Every folder, relative path, in byte order.
    #[must_use]
    pub fn folders(&self) -> Vec<String> {
        let mut v: Vec<String> = self.dirs.iter().cloned().collect();
        v.sort();
        v
    }

    /// Every regular file that is not a note, relative path, in byte
    /// order, as the last walk listed it — a placeholder standing for one
    /// included, under its real name: what a file tree shows beside the
    /// notes.
    #[must_use]
    pub fn files(&self) -> Vec<String> {
        let mut v: Vec<String> = self.files.values().flatten().cloned().collect();
        v.sort();
        v
    }

    /// The file an embed or an attachment link written in the note at
    /// `source` names, by the rule of spec Q12 applied to files: the
    /// target is tried as a path from the root, then as a path from the
    /// source's folder (honouring `..`), extension optional, case and
    /// normalization ignored; then as a bare name — a file anywhere under
    /// the source's own folder first, else the one with the fewest path
    /// segments, then the first in byte order. `#…` and `|…` are dropped
    /// first. Notes are not files here: `links` answers for them. A
    /// placeholder is a file that is present (ADR 0043): reading it says
    /// unavailable.
    #[must_use]
    pub fn resolve_file(&self, source: &str, target: &str) -> Option<String> {
        let target = target.split(['#', '|']).next().unwrap_or_default().trim();
        let wanted = verso_index::file_key(target);
        if wanted.is_empty() || target.ends_with('/') {
            return None;
        }
        let matches = |path: &str, key: &str| {
            let folded = verso_index::file_key(path);
            folded == key
                || folded
                    .rsplit_once('.')
                    .is_some_and(|(stem, _)| stem == key && !stem.ends_with('/'))
        };
        let all = || self.files.values().flatten();
        // As a path from the root, then from the source's folder.
        if let Some(found) = all().filter(|p| matches(p, &wanted)).min() {
            return Some(found.clone());
        }
        let dir = source.rsplit_once('/').map_or("", |(dir, _)| dir);
        if let Some(from_dir) = joined(dir, target).map(|p| verso_index::file_key(&p))
            && from_dir != wanted
            && let Some(found) = all().filter(|p| matches(p, &from_dir)).min()
        {
            return Some(found.clone());
        }
        // As a bare name: by file name, extension or not.
        if target.contains('/') {
            return None;
        }
        let mut candidates: Vec<&String> = self
            .files
            .iter()
            .filter(|(name, _)| {
                **name == wanted
                    || name
                        .rsplit_once('.')
                        .is_some_and(|(stem, _)| stem == wanted)
            })
            .flat_map(|(_, paths)| paths)
            .collect();
        // Q12 point 3, amended by the maintainer on 2026-09-23: a candidate
        // anywhere under the note's own folder comes first, as the index
        // ranks notes (a note at the root has every file under it).
        let under_source_dir = |p: &str| dir.is_empty() || p.starts_with(&format!("{dir}/"));
        candidates.sort_by_key(|p| (!under_source_dir(p), p.matches('/').count(), (*p).clone()));
        candidates.first().map(|p| (*p).clone())
    }

    /// The bytes of a file of the folder that is not a note (an image,
    /// an attachment), confined like every path (ADR 0044), read through
    /// `verso-fs`. A placeholder answers `Read(Unavailable)`.
    pub fn read_file(&mut self, relative: &str) -> Result<Vec<u8>, CoreError> {
        let confined = self
            .root
            .confine(Path::new(relative))
            .map_err(CoreError::Confined)?;
        let handle = self.root.handle(&confined).map_err(CoreError::Confined)?;
        let (bytes, _) = self.root.read(handle).map_err(CoreError::Read)?;
        Ok(bytes)
    }

    pub fn unresolved(&self) -> Result<Vec<Unresolved>, CoreError> {
        self.index.unresolved().map_err(CoreError::Index)
    }

    pub fn notes(&self) -> Result<Vec<String>, CoreError> {
        self.index.notes().map_err(CoreError::Index)
    }
}

/// Whether a confined path names a note: by its `.md`, and by nothing
/// else. The listing always carries the extension; a `README` beside a
/// `README.md` is a file of its own, and a file operation on it must not
/// reach the note.
fn is_note(key: &str) -> bool {
    key.ends_with(".md")
}

/// `text` with the target of each link at `(start, end)` — the span of
/// the whole `[[…]]` or `![[…]]` — replaced by the given text, from the
/// end so the offsets stay right. `None` when there is nothing to change
/// or a span is not a link the parser would have reported.
fn retargeted(text: &str, edits: &[(usize, usize, String)]) -> Option<String> {
    if edits.is_empty() {
        return None;
    }
    let mut edits: Vec<&(usize, usize, String)> = edits.iter().collect();
    edits.sort_by_key(|(start, _, _)| std::cmp::Reverse(*start));
    let mut out = text.to_owned();
    for (start, end, target) in edits {
        let raw = text.get(*start..*end)?;
        let open = if raw.starts_with("![[") {
            3
        } else if raw.starts_with("[[") {
            2
        } else {
            return None;
        };
        let inner = raw.get(open..raw.len().checked_sub(2)?)?;
        // The target is the inner text up to the first `|`, then `#`, as
        // the parser split it; what follows is kept as written.
        let before_pipe = inner.split_once('|').map_or(inner, |(t, _)| t);
        let target_len = before_pipe
            .split_once('#')
            .map_or(before_pipe, |(t, _)| t)
            .len();
        out.replace_range(start + open..start + open + target_len, target);
    }
    Some(out)
}
