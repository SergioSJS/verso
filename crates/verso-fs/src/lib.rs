// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The one crate that touches the files of the open folder (ADR 0026 rule 5,
//! ADR 0028): walking it, confining every path to it, reading, writing
//! atomically (Phase 1, feature 2), and watching it for changes made
//! elsewhere ([`Root::watch`]; ADR 0044 placed the watcher after feature 2,
//! and it is provisional until the maintainer decides on
//! `docs/reference/watcher-decision.md`).
//!
//! A path as a string exists at the entry edge — [`Root::open`] takes one —
//! and inside this crate. Everything that crosses out is a [`Handle`]
//! (ADR 0026 rule 4); what a handle identifies beyond this process is
//! decided before feature 6 (ADR 0044), so a handle is valid for the
//! [`Root`] that produced it and nothing else is promised. [`Entry::relative`]
//! is handed to the index next to the handle because the index is keyed by
//! path; it is not an identifier for anything across the contract.
//!
//! Decisions carried out here, recorded in ADR 0044 and ADR 0043 on
//! 2026-09-22 (`docs/reference/fs-decision.md`), and the choices the code
//! had to make on top of them, recorded there as provisional:
//! - symlinks are the user's and are **followed**, files and directories
//!   alike, wherever they point — reading and writing go to the target; a
//!   loop is detected by the identity of the directories already entered,
//!   and the walk stops at depth [`MAX_DEPTH`] with an error, never
//!   silently;
//! - hidden entries (name starting with `.`) are not walked at any depth,
//!   nor are the relative paths the caller lists as ignored; an iCloud
//!   Drive placeholder `.Name.ext.icloud` is recognized before the hidden
//!   rule and reported as a placeholder for `Name.ext`;
//! - a placeholder — that sibling name, or a file whose `st_flags` carry
//!   `SF_DATALESS` on macOS — is "present, content unavailable", never
//!   absent, and is never opened or written: opening it makes the OS
//!   download it.

mod confine;
mod ops;
mod os;
mod placeholder;
pub mod server;
mod walk;
mod watch;
mod write;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::SystemTime;

pub use confine::ConfinementError;

/// Whether every name of `relative` is one every OS can keep (ADR 0070
/// item 3): no trailing dot or space, none of `< > : " | ? * \`, no
/// device name such as `CON`. A create or a rename refuses the others; sync
/// says so before it sends one (ADR 0079).
#[must_use]
pub fn is_portable(relative: &std::path::Path) -> bool {
    relative.components().all(|c| match c {
        std::path::Component::Normal(part) => !confine::unportable(part),
        _ => true,
    })
}
pub use ops::OpReport;
pub use placeholder::Placeholder;
pub use walk::{Entry, EntryKind, Problem, Walk};
pub use watch::{Changes, MAX_WAIT, Watch};
pub use write::{WriteError, WriteReport};

/// Deepest directory nesting the walk enters. The root's children are at
/// depth 0; a directory at depth [`MAX_DEPTH`] is listed but not entered,
/// with [`Problem::DepthExceeded`]. Symlinks are followed (ADR 0044), so a
/// tree can be deeper than it looks; the cap is what turns a pathological
/// one into an error.
pub const MAX_DEPTH: usize = 64;

/// An opaque reference to an entry of the open folder, valid only for the
/// [`Root`] that handed it out: a handle from another root is refused, not
/// resolved. It carries no path (ADR 0026 rule 4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Handle {
    root: u32,
    index: u32,
}

/// What was on disk when a file was read: what a later write compares
/// before touching it (invariant 11, ADR 0012). Modified time and length
/// alone miss a rewrite that keeps both — `cp -p`, `rsync`, a restore, a
/// sync client — so the content's hash is part of it too, and the write
/// re-reads the file to compare it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Stamp {
    pub modified: SystemTime,
    pub len: u64,
    /// FNV-1a of the content, 64 bits. Not cryptographic and not
    /// collision-resistant against an adversary: it tells "same bytes as
    /// read" from "rewritten" by accident, which is what invariant 11 asks
    /// of an honest file system. The write re-reads the file to compare
    /// it: one extra read per write, two copies of the content in memory
    /// for a moment (about 33 ms to read and 97 ms to write an 8 MiB file
    /// here; the cost goes to ADR 0039 when targets exist).
    pub hash: u64,
}

impl Stamp {
    fn of(meta: &std::fs::Metadata, content: &[u8]) -> Result<Self, std::io::Error> {
        Ok(Self {
            modified: meta.modified()?,
            len: meta.len(),
            hash: fnv1a(content),
        })
    }
}

/// FNV-1a, 64-bit: a few lines, no dependency, good enough to tell two
/// contents apart for invariant 11.
pub(crate) fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// Why a read did not return content.
#[derive(Debug)]
pub enum ReadError {
    /// The handle does not belong to this root.
    UnknownHandle(Handle),
    /// The file is an on-demand storage placeholder: present, content not
    /// downloaded (ADR 0043). Never a deletion.
    Unavailable,
    Io(std::io::Error),
}

impl std::fmt::Display for ReadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownHandle(h) => write!(f, "unknown handle {h:?}"),
            Self::Unavailable => write!(f, "placeholder: content not available"),
            Self::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ReadError {}

static ROOTS: AtomicU32 = AtomicU32::new(1);

/// What the walk leaves out beyond the hidden rule and the caller's own
/// ignored paths (ADR 0044, revised 2026-09-29 — the maintainer accepted
/// both, behind these switches).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WalkRules {
    /// Skip the well-known build and dependency directories
    /// (`node_modules`, `target`, `dist`, …) wherever they appear.
    pub builtin_ignores: bool,
    /// Honor each directory's `.gitignore`, with git's own semantics —
    /// negation, `**`, anchoring, dir-only patterns.
    pub gitignore: bool,
}

impl Default for WalkRules {
    fn default() -> Self {
        Self {
            builtin_ignores: true,
            gitignore: true,
        }
    }
}

/// An open folder: the entry edge where a path string is accepted, and the
/// owner of every [`Handle`].
#[derive(Debug)]
pub struct Root {
    id: u32,
    path: PathBuf,
    /// Relative paths the caller asked to ignore, confined and normalized,
    /// on top of the hidden rule (ADR 0044; the list itself lives in the
    /// config outside the tree, ADR 0011, and is handed in here).
    ignored: Vec<PathBuf>,
    /// What else the walk leaves out; the user's setting, handed in from
    /// outside the tree like `ignored`.
    rules: WalkRules,
    /// Whether a symlink is followed only when what it reaches stays inside
    /// the folder: off for one person's folder, where symlinks are the
    /// user's and followed wherever they point (ADR 0044); on for a server
    /// with members other than the owner (the maintainer's answer H of
    /// 2026-10-09).
    links_inside: bool,
    /// Handle index → path relative to the root, and the reverse.
    table: Vec<PathBuf>,
    by_path: HashMap<PathBuf, u32>,
}

impl Root {
    /// Open a folder. `path` is the one place a path string enters; it must
    /// be a directory. Every ignored path is confined like a request: an
    /// absolute path or a `..` in the list is an error here, not a silent
    /// no-op. Nothing is read yet.
    pub fn open(path: impl Into<PathBuf>, ignored: Vec<PathBuf>) -> Result<Self, std::io::Error> {
        // Absolute, so that a later change of the working directory cannot
        // retarget every handle; not canonicalized — a root that is itself
        // a symlink stays the name the user typed (provisional, ADR 0044).
        let path = std::path::absolute(path.into())?;
        let meta = std::fs::metadata(&path)?;
        if !meta.is_dir() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotADirectory,
                "the root must be a directory",
            ));
        }
        let ignored = ignored
            .iter()
            .map(|p| {
                confine::confine(p).map_err(|e| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        format!("ignored path {}: {e}", p.display()),
                    )
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            id: ROOTS.fetch_add(1, Ordering::Relaxed),
            path,
            ignored,
            rules: WalkRules::default(),
            links_inside: false,
            table: Vec::new(),
            by_path: HashMap::new(),
        })
    }

    /// The walk's rules — the user's setting. Takes effect on the next
    /// walk; the caller reindexes after changing them.
    pub fn set_rules(&mut self, rules: WalkRules) {
        self.rules = rules;
    }

    /// Follow a symlink only when it leads to a place inside the folder: a
    /// path through one that leaves is refused, and the walk lists it as a
    /// problem instead of following it. Checked on the path as it is when
    /// asked; a link changed between the check and the use is the host's
    /// (the server's folder is written by its members through Verso only).
    pub fn set_links_inside(&mut self, on: bool) {
        self.links_inside = on;
    }

    #[must_use]
    pub fn links_inside(&self) -> bool {
        self.links_inside
    }

    /// Whether `relative`, resolved through every symlink on its way, stays
    /// in the folder. What does not exist yet is judged by the deepest
    /// part that does: a new file inside a linked directory that leaves is
    /// outside too.
    pub(crate) fn resolves_inside(&self, relative: &Path) -> bool {
        let Ok(root) = std::fs::canonicalize(&self.path) else {
            return false;
        };
        let mut probe = self.path.join(relative);
        loop {
            match std::fs::canonicalize(&probe) {
                Ok(real) => return real.starts_with(&root),
                Err(_) => {
                    // A broken link is a link: refused, not looked past.
                    if std::fs::symlink_metadata(&probe).is_ok() {
                        return false;
                    }
                    if !probe.pop() {
                        return false;
                    }
                }
            }
        }
    }

    /// The rules the walk runs under.
    #[must_use]
    pub fn rules(&self) -> WalkRules {
        self.rules
    }

    /// The handle for a path relative to the root, confined first: an
    /// absolute path, a `..` component or a NUL byte is refused; so is a
    /// path the walk would not list — a hidden entry or an ignored path —
    /// because the only door plugins and agents have is this one
    /// (provisional: ADR 0044). Nothing on disk is checked here; a handle
    /// to a file that does not exist is legal and its read fails later with
    /// `NotFound`.
    pub fn handle(&mut self, relative: &Path) -> Result<Handle, ConfinementError> {
        let relative = self.confine(relative)?;
        Ok(self.intern(relative))
    }

    /// What [`Root::handle`] checks, without keeping a handle: the confined
    /// form of a path relative to the root — `.` dropped, `//` collapsed —
    /// or why it is refused. Nothing is remembered and nothing on disk is
    /// checked — but on Windows a name of the 8.3 shape, looked up in its
    /// folder so that a short name cannot stand for a hidden or ignored
    /// entry ([`ConfinementError::ShortName`]) —, so a caller that only needs to key the index by a path
    /// asks here, and keys by the answer, never by the string it was
    /// given: `./Taverna.md`, `Taverna//x/../Taverna.md` and `Taverna.md`
    /// are refused or become one name.
    pub fn confine(&self, relative: &Path) -> Result<PathBuf, ConfinementError> {
        let relative = confine::confine(relative)?;
        // The placeholder name form outranks the hidden rule here as in the
        // walk (ADR 0043), so a walked placeholder can be named again.
        let hidden = relative.components().enumerate().any(|(i, c)| {
            let name = c.as_os_str();
            let last = i + 1 == relative.components().count();
            name.as_encoded_bytes().starts_with(b".")
                && !(last && placeholder::icloud_placeholder_of(name).is_some())
        });
        if hidden {
            return Err(ConfinementError::Hidden);
        }
        if self.is_ignored(&relative) {
            return Err(ConfinementError::Ignored);
        }
        if self.links_inside && !self.resolves_inside(&relative) {
            return Err(ConfinementError::LeavesFolder);
        }
        #[cfg(windows)]
        confine::short_name(&self.path, &relative)?;
        Ok(relative)
    }

    /// Walk the folder: every entry that is not ignored, in a deterministic
    /// order (sorted by name at each level), with the problems met on the
    /// way. Symlinks are followed (ADR 0044).
    pub fn walk(&mut self) -> Walk {
        walk::walk(self)
    }

    /// The length and modified time of the file `handle` names, following
    /// a symlink, without reading it: what a narrowed index run updates for
    /// a file that is not a note (ADR 0073 item 12).
    pub fn length_and_time(&self, handle: Handle) -> std::io::Result<(u64, Option<SystemTime>)> {
        let path = self.path_of(handle).ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "a handle of another root")
        })?;
        let meta = std::fs::metadata(path)?;
        if !meta.is_file() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "not a file",
            ));
        }
        Ok((meta.len(), meta.modified().ok()))
    }

    /// Read a file's content and its [`Stamp`]. A placeholder — a dataless
    /// file, a `.Name.ext.icloud` entry, or `Name.ext` whose `.icloud`
    /// sibling stands in for it — is [`ReadError::Unavailable`] and is never
    /// opened (ADR 0043).
    pub fn read(&self, handle: Handle) -> Result<(Vec<u8>, Stamp), ReadError> {
        let path = self
            .path_of(handle)
            .ok_or(ReadError::UnknownHandle(handle))?;
        // The guard runs on the name as given and, through a symlink, on
        // the target: both doors ask the same question as `write`.
        if placeholder::stands_in(&path).map_err(ReadError::Io)? {
            return Err(ReadError::Unavailable);
        }
        let target = placeholder::follow(&path).map_err(ReadError::Io)?;
        if target != path && placeholder::stands_in(&target).map_err(ReadError::Io)? {
            return Err(ReadError::Unavailable);
        }
        // The stamp's time and length are taken before the bytes, as the
        // write takes them: a write that lands between the two leaves an
        // older time with the newer content, which the next index reads
        // again, never a newer time vouching for older content.
        let meta = std::fs::metadata(&target).map_err(ReadError::Io)?;
        let bytes = std::fs::read(&target).map_err(ReadError::Io)?;
        let stamp = Stamp::of(&meta, &bytes).map_err(ReadError::Io)?;
        Ok((bytes, stamp))
    }

    /// The file `handle` names, when its content is only in the cloud in
    /// the dataless form, so the user's opening of it can fetch it (ADR
    /// 0043, amended on 2026-09-30); `None` for a file on disk, an absent
    /// one, and the older `.Name.ext.icloud` form, which reading cannot
    /// bring down. A symlink is followed, as `read` follows it.
    pub fn placeholder(&self, handle: Handle) -> Result<Option<Placeholder>, ReadError> {
        let path = self
            .path_of(handle)
            .ok_or(ReadError::UnknownHandle(handle))?;
        let target = placeholder::follow(&path).map_err(ReadError::Io)?;
        match std::fs::metadata(&target) {
            Ok(meta) if !meta.is_dir() && placeholder::is_dataless(&meta) => {
                Ok(Some(Placeholder::new(target)))
            }
            Ok(_) => Ok(None),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(ReadError::Io(e)),
        }
    }

    /// Replace a file's content atomically (ADR 0029): temporary file in the
    /// same directory as the target, `fsync` of the file, `rename`, `fsync`
    /// of the directory. A symlink is followed: the write lands on what it
    /// points to and the link stays (ADR 0044). Refuses to write if the file
    /// on disk is not the one that was read (`expected`, invariant 11) or
    /// is a placeholder (ADR 0043). Returns what could and could not be
    /// preserved.
    pub fn write(
        &self,
        handle: Handle,
        content: &[u8],
        expected: &Stamp,
    ) -> Result<WriteReport, WriteError> {
        let path = self
            .path_of(handle)
            .ok_or(WriteError::UnknownHandle(handle))?;
        write::write_atomically(&path, content, expected)
    }

    /// Create a file that does not exist yet, confined like every path,
    /// with `content`, atomically (ADR 0048): written under a temporary
    /// name, synced, then linked to its name, which fails rather than
    /// replacing what appeared there meanwhile. `WriteError::Exists` when
    /// something already stands there. The report carries the new file's
    /// stamp and what could not be confirmed once the file was in place.
    pub fn create(
        &mut self,
        relative: &Path,
        content: &[u8],
    ) -> Result<(Handle, OpReport), WriteError> {
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        confine::unportable_new(&self.path, &relative).map_err(WriteError::Confined)?;
        let report = ops::create_atomically(&on_disk(&self.path, &relative), content)?;
        Ok((self.intern(relative), report))
    }

    /// Create a folder (and its parents) inside the root, confined, each
    /// new directory synced into the one it hangs from.
    pub fn create_dir(&self, relative: &Path) -> Result<(PathBuf, OpReport), WriteError> {
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        confine::unportable_new(&self.path, &relative).map_err(WriteError::Confined)?;
        let report = ops::create_directory(&on_disk(&self.path, &relative))?;
        Ok((relative, report))
    }

    /// Remove the folder at `relative` when it is empty, confined: `false`
    /// when it holds anything — nothing in it is ever removed — or is the
    /// root itself. Sync leaves no empty folder behind a move or a deletion
    /// that came from another device (ADR 0079).
    pub fn remove_empty_dir(&self, relative: &Path) -> Result<bool, WriteError> {
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        if relative.as_os_str().is_empty() {
            return Ok(false);
        }
        ops::remove_empty_directory(&on_disk(&self.path, &relative))
    }

    /// Move an entry to another path of the folder, both confined; refuses
    /// an occupied destination, unless it is the entry itself under another
    /// spelling of its name (a case-only rename on APFS); creates the
    /// destination's folders. A regular file is moved by `link` and
    /// `unlink`, so nothing that appears at the destination meanwhile is
    /// replaced; a directory or a symlink is renamed.
    pub fn rename(&mut self, from: &Path, to: &Path) -> Result<(Handle, OpReport), WriteError> {
        let from = self.confine(from).map_err(WriteError::Confined)?;
        let to = self.confine(to).map_err(WriteError::Confined)?;
        confine::unportable_new(&self.path, &to).map_err(WriteError::Confined)?;
        let report = ops::rename_path(&on_disk(&self.path, &from), &on_disk(&self.path, &to))?;
        Ok((self.intern(to), report))
    }

    /// Watch the folder for changes, whoever makes them: `on_change` gets
    /// each batch of paths relative to the root — only what the walk lists,
    /// no hidden entry and no ignored path — on a thread of the watch's own,
    /// once the folder has been quiet for `quiet` (or after [`MAX_WAIT`] of
    /// changes that do not stop). Reading a file is not a change. Events
    /// under the absolute directories in `excluded` are dropped: the
    /// caller's own files, when they lie inside the folder. Dropping the
    /// [`Watch`] stops it. Fails, with the error's kind and no path, when
    /// the operating system will not watch the folder (on Linux: the
    /// inotify limit, or a directory it cannot read).
    pub fn watch(
        &self,
        quiet: std::time::Duration,
        excluded: &[PathBuf],
        on_change: impl FnMut(Changes) + Send + 'static,
    ) -> Result<Watch, std::io::Error> {
        watch::start(
            &self.path,
            self.ignored.clone(),
            self.rules,
            excluded,
            quiet,
            on_change,
        )
    }

    /// Move an entry into `.trash/` at the root (Obsidian's bin), keeping
    /// its relative path. Returns where it went, relative to the root.
    pub fn trash(&mut self, relative: &Path) -> Result<(PathBuf, OpReport), WriteError> {
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        ops::trash(&self.path, &relative)
    }

    /// Read `.space/waypoints.json` at the root and its [`Stamp`] (ADR 0062 D7).
    /// As with `.trash/`, read by name; other hidden files remain refused.
    pub fn read_waypoints(&self) -> Result<(Vec<u8>, Stamp), ReadError> {
        ops::read_waypoints(&self.path)
    }

    /// Replace `.space/waypoints.json` atomically, checking that the file on
    /// disk is the one that was read (`expected`, Invariant 11; ADR 0062 D7).
    pub fn write_waypoints(
        &self,
        content: &[u8],
        expected: &Stamp,
    ) -> Result<WriteReport, WriteError> {
        ops::write_waypoints(&self.path, content, expected)
    }

    fn intern(&mut self, relative: PathBuf) -> Handle {
        if let Some(&index) = self.by_path.get(&relative) {
            return Handle {
                root: self.id,
                index,
            };
        }
        let index = u32::try_from(self.table.len()).unwrap_or(u32::MAX);
        self.table.push(relative.clone());
        self.by_path.insert(relative, index);
        Handle {
            root: self.id,
            index,
        }
    }

    fn path_of(&self, handle: Handle) -> Option<PathBuf> {
        if handle.root != self.id {
            return None;
        }
        self.table
            .get(handle.index as usize)
            .map(|rel| on_disk(&self.path, rel))
    }

    pub(crate) fn root_path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn is_ignored(&self, rel: &Path) -> bool {
        self.ignored.iter().any(|i| rel == i || rel.starts_with(i))
    }
}

/// `name` under the relative path `base`, in the one form a path relative to
/// the open folder takes here, in the index and in the contract: components
/// joined by `/` on every OS. On Windows `\` would otherwise come out of
/// `Path::join`, and a link or a board would be written with it (ADR 0069,
/// item 9, `[OPEN]`: the recorded recommendation, provisional). On Unix this
/// is `base.join(name)`, byte for byte.
pub(crate) fn rel_join(base: &Path, name: impl AsRef<std::ffi::OsStr>) -> PathBuf {
    if base.as_os_str().is_empty() {
        return PathBuf::from(name.as_ref());
    }
    let mut joined = base.as_os_str().to_owned();
    joined.push("/");
    joined.push(name);
    PathBuf::from(joined)
}

/// Where the relative path `rel` is on disk under `root`, in the OS's form:
/// each component pushed, so Windows gets `\` throughout — a `\\?\`
/// root takes no `/`. On Unix this is `root.join(rel)`.
pub(crate) fn on_disk(root: &Path, rel: &Path) -> PathBuf {
    let mut out = root.to_path_buf();
    for part in rel.components() {
        out.push(part);
    }
    out
}

#[cfg(test)]
mod path_form {
    use super::*;

    #[test]
    fn a_relative_path_is_joined_by_slashes_and_put_on_disk_in_the_os_form() {
        assert_eq!(rel_join(Path::new(""), "a.md"), PathBuf::from("a.md"));
        let rel = rel_join(&rel_join(Path::new("pasta"), "sub"), "n.md");
        assert_eq!(rel.as_os_str(), "pasta/sub/n.md");
        let root = Path::new("raiz");
        assert_eq!(
            on_disk(root, &rel),
            root.join("pasta").join("sub").join("n.md")
        );
    }
}
