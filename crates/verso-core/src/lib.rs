// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The orchestrator (ADR 0028): opens a folder through `verso-fs`, parses
//! notes with `verso-dialect`, keeps `verso-index` current, and answers
//! the questions the CLI and, later, the contract ask. Phase 1, feature 4.
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

use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use verso_fs::{EntryKind, Problem, Root};
// The two error types `CoreError` carries, so a caller can match on them.
pub use verso_fs::{ConfinementError, ReadError, WriteError};
use verso_index::{Backlink, Block, Heading, Hit, Index, Link, NoteStamp, Unresolved};

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
}

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
    /// The index was refreshed but its sidecar could not be written.
    Sidecar(std::io::Error),
    /// The note could not be written; `WriteError::Changed` is invariant
    /// 11 — the file on disk is not the one that was read, nothing was
    /// written, the caller shows the diff.
    Write(WriteError),
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
            Self::Sidecar(e) => write!(f, "index sidecar: {e}"),
            Self::Write(e) => write!(f, "write: {e}"),
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
}

/// A note that links to a renamed note, and its text with the links
/// pointing at the new name — for the user to see, then to apply.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkRewrite {
    pub path: String,
    pub revision: String,
    pub before: String,
    pub after: String,
}

/// What a rename left: the note's new path and the rewrites it calls for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Renamed {
    pub path: String,
    pub rewrites: Vec<LinkRewrite>,
}

/// Every `[[target…]]` and `![[target…]]` in `text` whose target names the
/// note at `old` (by bare name or by path, `.md` optional, case-
/// insensitively) rewritten to name `new` — in the form the writer used:
/// a bare name stays a bare name, a path becomes the new path. Fragments
/// and aliases are kept. Code is not parsed here: a link inside a code
/// span is a string to the parser and to this rewrite alike, which is the
/// one place they disagree; it is the caller's diff that shows it.
fn rewrite_links(text: &str, old: &str, new: &str) -> String {
    let stem = |p: &str| p.strip_suffix(".md").unwrap_or(p).to_owned();
    let old_path = stem(old);
    let old_name = old_path.rsplit('/').next().unwrap_or(&old_path).to_owned();
    let new_path = stem(new);
    let new_name = new_path.rsplit('/').next().unwrap_or(&new_path).to_owned();
    let fold = |s: &str| s.trim().to_lowercase();
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(i) = rest.find("[[") {
        let Some(j) = rest[i..].find("]]") else { break };
        let inner = &rest[i + 2..i + j];
        let (target, tail) = match inner.find(['#', '|']) {
            Some(k) => (&inner[..k], &inner[k..]),
            None => (inner, ""),
        };
        let t = fold(target);
        let t = t.strip_suffix(".md").unwrap_or(&t).to_owned();
        let replacement = if t == fold(&old_path) {
            Some(new_path.clone())
        } else if !t.contains('/') && t == fold(&old_name) {
            Some(new_name.clone())
        } else {
            None
        };
        out.push_str(&rest[..i + 2]);
        match replacement {
            Some(r) => {
                out.push_str(&r);
                out.push_str(tail);
            }
            None => out.push_str(inner),
        }
        out.push_str("]]");
        rest = &rest[i + j + 2..];
    }
    out.push_str(rest);
    out
}

/// What a write left behind: the note as it now is, and what the atomic
/// write could not guarantee (`verso_fs::WriteReport`), one line each,
/// for the user to see — none of them means the content was lost.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Written {
    pub note: NoteText,
    pub warnings: Vec<String>,
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

fn properties(content: &str) -> Vec<(String, String)> {
    match verso_dialect::parse(content)
        .frontmatter
        .as_ref()
        .map(|f| &f.values)
    {
        Some(Ok(verso_dialect::Value::Mapping(pairs))) => pairs
            .iter()
            .map(|(k, v)| (k.clone(), property_text(v)))
            .collect(),
        _ => Vec::new(),
    }
}

fn write_warnings(r: &verso_fs::WriteReport) -> Vec<String> {
    let mut out = Vec::new();
    if !r.mode_preserved {
        out.push("the file's permission bits were not preserved".to_owned());
    }
    if !r.owner_preserved {
        out.push("the file's owner was not preserved".to_owned());
    }
    for (name, error) in &r.xattrs_not_preserved {
        out.push(format!(
            "extended attribute {name} was not preserved: {error}"
        ));
    }
    if r.hard_link_shared {
        out.push("the file had other hard links; they still point at the old content".to_owned());
    }
    if let Some(fs) = &r.network_fs {
        out.push(format!(
            "{fs} is a network file system: the replace was not atomic"
        ));
    }
    if let Some(e) = &r.durability_not_confirmed {
        out.push(format!("written, but durability was not confirmed: {e}"));
    }
    if let Some(target) = &r.wrote_through_symlink_to {
        out.push(format!("written through a symlink to {}", target.display()));
    }
    out
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
    /// The frontmatter's keys and values, each value as one line of text,
    /// in the order written; empty when there is none or it is not YAML.
    pub properties: Vec<(String, String)>,
    /// The whole text as read (UTF-8, lossily), line endings included,
    /// for an editor: what it gives back is written as is.
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
    /// Every regular file that is not a note, by lower-cased file name,
    /// as the last walk listed it: what an embed such as `![[mapa.png]]`
    /// resolves against (spec Q2, the same folder-blind name match as a
    /// link, until the resolution rule of Q12 covers attachments).
    files: HashMap<String, Vec<String>>,
    /// Every folder the last walk listed, plus the ones created since:
    /// an empty folder has no file to be seen by, and a tree shows it.
    dirs: HashSet<String>,
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

fn seconds_since_epoch(t: std::time::SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

fn note_stamp(stamp: &verso_fs::Stamp) -> NoteStamp {
    NoteStamp {
        modified: seconds_since_epoch(stamp.modified),
        len: stamp.len,
        hash: stamp.hash,
    }
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
        })
    }

    /// The folder, absolute and normalized.
    #[must_use]
    pub fn folder(&self) -> &Path {
        &self.folder
    }

    /// Where the index file is.
    #[must_use]
    pub fn index_path(&self) -> &Path {
        self.index.path()
    }

    /// Walk the folder and bring the index up to date. A note the walk no
    /// longer lists is removed, unless it lies under a path the walk
    /// reported a problem for: an unreadable directory does not empty the
    /// graph beneath it.
    pub fn index(&mut self) -> Result<IndexReport, CoreError> {
        let walk = self.root.walk();
        let mut report = IndexReport::default();
        let mut present: HashSet<String> = HashSet::new();
        let mut files: HashMap<String, Vec<String>> = HashMap::new();
        let mut dirs: HashSet<String> = HashSet::new();
        for entry in &walk.entries {
            let relative = entry.relative.to_string_lossy().into_owned();
            match &entry.kind {
                EntryKind::Note => {
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
                            let content = String::from_utf8_lossy(&bytes);
                            let parsed = verso_dialect::parse(&content);
                            self.index
                                .upsert(&relative, stamp, &content, &parsed)
                                .map_err(CoreError::Index)?;
                            report.indexed += 1;
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
                    // of the real file stays, marked unverified (ADR 0043).
                    let real = of.to_string_lossy().into_owned();
                    if real.ends_with(".md") {
                        self.index
                            .mark_placeholder(&real)
                            .map_err(CoreError::Index)?;
                    }
                    present.insert(real);
                    report.placeholders += 1;
                }
                EntryKind::File => {
                    let name = relative
                        .rsplit('/')
                        .next()
                        .unwrap_or(&relative)
                        .to_lowercase();
                    files.entry(name).or_default().push(relative.clone());
                }
                EntryKind::Directory => {
                    dirs.insert(relative.clone());
                }
            }
        }
        self.files = files;
        self.dirs = dirs;
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
            }
        }
        let now = seconds_since_epoch(std::time::SystemTime::now());
        self.index
            .set_root(&self.folder.to_string_lossy(), now)
            .map_err(CoreError::Index)?;
        // Beside the index, so that the directory can say which folder
        // each index belongs to; written from the first run, since a
        // sidecar that starts later cannot describe what already exists.
        Sidecar {
            folder: self.folder.clone(),
            indexed_at: now,
            schema: verso_index::SCHEMA_VERSION,
        }
        .write(self.index.path())
        .map_err(CoreError::Sidecar)?;
        Ok(report)
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

    /// The note's text as it is on disk now, through `verso-fs` (a
    /// placeholder answers `Read(Unavailable)`, never empty text — ADR
    /// 0043), with the positions the index has for it and whether the
    /// index is behind the file.
    pub fn read_note(&mut self, note: &str) -> Result<NoteText, CoreError> {
        let (path, handle) = self.note_path(note)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let known = self.index.stamp_of(&path).map_err(CoreError::Index)?;
        let stale = known != Some(note_stamp(&stamp));
        let unverified = self
            .index
            .is_unverified(&path)
            .map_err(CoreError::Index)?
            .unwrap_or(false);
        let content = String::from_utf8_lossy(&bytes);
        Ok(NoteText {
            lines: content.lines().map(str::to_owned).collect(),
            html: verso_dialect::to_html(&content),
            properties: properties(&content),
            stale,
            unverified,
            headings: self.index.headings_of(&path).map_err(CoreError::Index)?,
            blocks: self.index.blocks_of(&path).map_err(CoreError::Index)?,
            revision: revision::encode(&stamp),
            text: content.into_owned(),
            path,
        })
    }

    /// Write a note's text over the file that `revision` describes —
    /// atomically, through `verso-fs` (ADR 0029) — and bring the index up
    /// to date for that note. The bytes are the caller's, as given: no
    /// normalization (ADR 0012). If the file on disk is no longer the one
    /// that was read, nothing is written and the answer is
    /// `CoreError::Write(WriteError::Changed)`: the caller reads again and
    /// shows the user both versions (invariant 11). Returns the note as it
    /// now is.
    pub fn write_note(
        &mut self,
        note: &str,
        text: &str,
        revision: &str,
    ) -> Result<Written, CoreError> {
        let (path, handle) = self.note_path(note)?;
        let expected = revision::decode(revision).ok_or_else(|| {
            CoreError::Write(WriteError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "the revision token is not one this core issued",
            )))
        })?;
        let report = self
            .root
            .write(handle, text.as_bytes(), &expected)
            .map_err(CoreError::Write)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let content = String::from_utf8_lossy(&bytes);
        let parsed = verso_dialect::parse(&content);
        self.index
            .upsert(&path, note_stamp(&stamp), &content, &parsed)
            .map_err(CoreError::Index)?;
        Ok(Written {
            note: self.read_note(&path)?,
            warnings: write_warnings(&report),
        })
    }

    /// Create a note that does not exist yet (ADR 0048): `name` with or
    /// without `.md`, in a folder that is created if needed; refused when
    /// something already stands there. Indexed at once.
    pub fn create_note(&mut self, name: &str, text: &str) -> Result<NoteText, CoreError> {
        let key = self.note_key(name)?;
        let (handle, _) = self
            .root
            .create(Path::new(&key), text.as_bytes())
            .map_err(CoreError::Write)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let content = String::from_utf8_lossy(&bytes);
        self.index
            .upsert(
                &key,
                note_stamp(&stamp),
                &content,
                &verso_dialect::parse(&content),
            )
            .map_err(CoreError::Index)?;
        self.read_note(&key)
    }

    /// Create a file that is not a note — an image pasted into a note,
    /// an attachment — with `bytes`, at a path relative to the folder;
    /// refused when something stands there. Listed at once.
    pub fn create_file(&mut self, relative: &str, bytes: &[u8]) -> Result<String, CoreError> {
        let confined = self
            .root
            .confine(Path::new(relative))
            .map_err(CoreError::Confined)?;
        let key = confined.to_string_lossy().into_owned();
        self.root
            .create(Path::new(&key), bytes)
            .map_err(CoreError::Write)?;
        let name = key.rsplit('/').next().unwrap_or(&key).to_lowercase();
        self.files.entry(name).or_default().push(key.clone());
        Ok(key)
    }

    /// Create a folder inside the open folder. The walk does not list an
    /// empty folder, so the caller shows it until something lands in it.
    pub fn create_folder(&mut self, relative: &str) -> Result<String, CoreError> {
        let made = self
            .root
            .create_dir(Path::new(relative))
            .map_err(CoreError::Write)?;
        let made = made.to_string_lossy().into_owned();
        self.dirs.insert(made.clone());
        Ok(made)
    }

    /// Move a note to `.trash/` at the root (Obsidian's bin; nothing is
    /// unlinked) and forget it in the index. Returns where it went.
    pub fn delete_note(&mut self, note: &str) -> Result<String, CoreError> {
        let key = self.note_key(note)?;
        let gone = self.root.trash(Path::new(&key)).map_err(CoreError::Write)?;
        self.index.remove(&key).map_err(CoreError::Index)?;
        Ok(gone.to_string_lossy().into_owned())
    }

    /// Rename or move a note, and say which notes link to it and how
    /// their text would change (ADR 0048, option (b)): the file moves,
    /// the index follows, and the rewrites come back as a plan — before
    /// and after, with each note's revision — for the caller to show and
    /// then apply through `write_note`, one atomic write per note.
    /// Nothing but the renamed file is written here.
    pub fn rename_note(&mut self, from: &str, to: &str) -> Result<Renamed, CoreError> {
        let old = self.note_key(from)?;
        let new = self.note_key(to)?;
        let linkers: Vec<String> = {
            let mut v: Vec<String> = self
                .index
                .backlinks(&old)
                .map_err(CoreError::Index)?
                .into_iter()
                .map(|b| b.from)
                .filter(|p| *p != old)
                .collect();
            v.sort();
            v.dedup();
            v
        };
        let handle = self
            .root
            .rename(Path::new(&old), Path::new(&new))
            .map_err(CoreError::Write)?;
        self.index.remove(&old).map_err(CoreError::Index)?;
        let (bytes, stamp) = self.root.read(handle).map_err(CoreError::Read)?;
        let content = String::from_utf8_lossy(&bytes);
        self.index
            .upsert(
                &new,
                note_stamp(&stamp),
                &content,
                &verso_dialect::parse(&content),
            )
            .map_err(CoreError::Index)?;
        let mut rewrites = Vec::new();
        for path in linkers {
            let note = self.read_note(&path)?;
            let after = rewrite_links(&note.text, &old, &new);
            if after != note.text {
                rewrites.push(LinkRewrite {
                    path,
                    revision: note.revision,
                    before: note.text,
                    after,
                });
            }
        }
        Ok(Renamed {
            path: new,
            rewrites,
        })
    }

    /// Every folder, relative path, in byte order.
    #[must_use]
    pub fn folders(&self) -> Vec<String> {
        let mut v: Vec<String> = self.dirs.iter().cloned().collect();
        v.sort();
        v
    }

    /// Every regular file that is not a note, relative path, in byte
    /// order, as the last walk listed it: what a file tree shows beside
    /// the notes.
    #[must_use]
    pub fn files(&self) -> Vec<String> {
        let mut v: Vec<String> = self.files.values().flatten().cloned().collect();
        v.sort();
        v
    }

    /// The file an embed or an attachment link names: by path from the
    /// root when the target has a `/`, otherwise by file name — with or
    /// without its extension — case-insensitively; several, the one with
    /// the fewest path segments, then the first in byte order. Notes are
    /// not files here: `links` answers for them.
    #[must_use]
    pub fn resolve_file(&self, target: &str) -> Option<String> {
        let wanted = target.trim().to_lowercase();
        if wanted.is_empty() {
            return None;
        }
        let mut candidates: Vec<&String> = if wanted.contains('/') {
            self.files
                .values()
                .flatten()
                .filter(|p| p.to_lowercase() == wanted)
                .collect()
        } else {
            self.files
                .iter()
                .filter(|(name, _)| {
                    **name == wanted
                        || name
                            .rsplit_once('.')
                            .is_some_and(|(stem, _)| stem == wanted)
                })
                .flat_map(|(_, paths)| paths)
                .collect()
        };
        candidates.sort_by_key(|p| (p.matches('/').count(), (*p).clone()));
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
