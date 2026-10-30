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
//!   nor are the relative paths the caller lists as ignored — the folder's
//!   settings directory, `.verso/`, is not walked either, but its plain
//!   entries are confined like files and listed apart for sync
//!   ([`Root::settings_walk`], ADR 0070 items 1–2); an iCloud
//!   Drive placeholder `.Name.ext.icloud` is recognized before the hidden
//!   rule and reported as a placeholder for `Name.ext`;
//! - a placeholder — that sibling name, or a file whose `st_flags` carry
//!   `SF_DATALESS` on macOS — is "present, content unavailable", never
//!   absent, and is never opened or written: opening it makes the OS
//!   download it.

mod confine;
mod escaping;
mod external;
mod jail;
mod journal;
mod obsidian;
mod ops;
mod os;
mod placeholder;
mod scope;
pub mod server;
mod settings;
mod single;
mod space;
mod staged;
mod subfolders;
mod sweep;
pub mod trashbin;
mod walk;
mod watch;
mod write;

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::SystemTime;

pub use confine::ConfinementError;
pub use journal::Touched;

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
pub use escaping::escaping_links;
pub use external::{ImportError, PICK_CHUNK, PickedError, check_picked, copy_picked, read_picked};
pub use jail::resolves_within;
pub use obsidian::{OBSIDIAN_SETTINGS_MAX, ObsidianRead, ObsidianSettings};
pub use ops::OpReport;
pub use placeholder::Placeholder;
pub use scope::{
    NOTE_EXTENSIONS, PathKind, ReadOnlyWhy, is_attachment_name, is_note_name, kind_of,
};
pub use settings::{DATA_DIRS, SETTINGS_DIR, SETTINGS_FILE, in_settings_dir, is_settings_path};
pub use single::Single;
pub use staged::Staged;
pub use subfolders::{is_folder, subfolders};
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

/// A file's length and modified time, as a read in pieces takes them
/// before each piece: the file changed between two pieces when they
/// differ.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Mark {
    pub len: u64,
    pub modified: SystemTime,
}

/// FNV-1a, 64-bit: a few lines, no dependency, good enough to tell two
/// contents apart for invariant 11.
pub(crate) fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash = Fnv::new();
    hash.update(bytes);
    hash.finish()
}

/// FNV-1a fed a piece at a time: over pieces that join into `bytes`, the
/// same value as [`fnv1a`] of `bytes` — a file read or written in pieces
/// is never whole in memory for its stamp.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Fnv(u64);

impl Fnv {
    pub(crate) const fn new() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }

    pub(crate) fn update(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 ^= u64::from(b);
            self.0 = self.0.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }

    pub(crate) const fn finish(self) -> u64 {
        self.0
    }
}

/// How much of a file one read takes when the file is read in pieces: a
/// stamp's hash, a sync's hash, a piece sent.
pub(crate) const READ_PIECE: usize = 1 << 20;

/// Read the file at `path` a piece at a time, each piece handed to
/// `each`; the FNV-1a of the whole. One buffer of [`READ_PIECE`], reused.
pub(crate) fn read_pieces(path: &Path, mut each: impl FnMut(&[u8])) -> std::io::Result<u64> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut buffer = vec![0_u8; READ_PIECE];
    let mut hash = Fnv::new();
    loop {
        let n = match file.read(&mut buffer) {
            Ok(0) => return Ok(hash.finish()),
            Ok(n) => n,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        };
        let piece = buffer.get(..n).unwrap_or_default();
        hash.update(piece);
        each(piece);
    }
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
    /// The one file this root is for, when it was opened by
    /// [`Root::open_file`] (ADR 0114): its name relative to the root, the
    /// parent directory. Everything else is out of scope (`scope.rs`).
    scope: Option<PathBuf>,
    /// Handle index → path relative to the root, and the reverse.
    table: Vec<PathBuf>,
    by_path: HashMap<PathBuf, u32>,
    /// What the writes changed, while a caller keeps a history (ADR 0091).
    journal: journal::Journal,
}

/// How many links one check follows by their text before it gives up, as
/// the kernel gives up on a loop (`ELOOP`).
const LINK_HOPS: u32 = 40;

/// Whether `probe`, an absolute path, lands in `root` (canonical) once
/// every symlink on its way is followed. Only a symlink moves a place: a
/// plain file or directory is where its parent is, and what is not there
/// is judged by the deepest part that is. So the check reads each entry
/// itself (`symlink_metadata`), never only the final file's existence: a
/// file that another writer is replacing at this very instant — missing
/// for a moment, or not resolvable while the rename lands — is judged by
/// its folder, never taken for a link that leads out. A link whose end is
/// not there now is judged by where its text points, which is a place
/// like any other; a link that leaves is refused whether or not its end
/// exists.
fn lands_inside(root: &Path, mut probe: PathBuf, hops: u32) -> bool {
    loop {
        match std::fs::symlink_metadata(&probe) {
            Ok(meta) if meta.file_type().is_symlink() => {
                if let Ok(real) = std::fs::canonicalize(&probe) {
                    return real.starts_with(root);
                }
                // Nothing at its end now (or a loop): follow the text.
                if hops >= LINK_HOPS {
                    return false;
                }
                let (Ok(target), Some(parent)) = (std::fs::read_link(&probe), probe.parent())
                else {
                    return false;
                };
                return lands_inside(root, parent.join(target), hops + 1);
            }
            Ok(_) => {
                if let Ok(real) = std::fs::canonicalize(&probe) {
                    return real.starts_with(root);
                }
            }
            Err(_) => {}
        }
        // Not there, or not resolvable this instant: its place is its
        // folder's. Only a plain name is stepped back from; a `..` in a
        // link's text that cannot be resolved is refused, never guessed.
        if !matches!(probe.components().next_back(), Some(Component::Normal(_))) || !probe.pop() {
            return false;
        }
    }
}

/// A symbolic link at `at` to `target`, for the tests of the crates above,
/// which may not touch the disk themselves (ADR 0026 rule 5): a folder
/// with a link in it is how a note is reached under another name.
#[doc(hidden)]
pub fn link_for_tests(target: &Path, at: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, at)
    }
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_file(target, at)
    }
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
            scope: None,
            table: Vec::new(),
            by_path: HashMap::new(),
            journal: journal::Journal::default(),
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

    /// The name of the folder's file system when a file Verso creates or
    /// moves there is named by `link` (macOS: a volume without the
    /// exclusive rename and with hard links, some network volumes):
    /// changes made there by other programs may show late; Verso's own
    /// writes are as safe as anywhere (ADR 0048, revised 2026-10-12).
    /// Asked of the volume each time it is called — a host asks once, when
    /// it opens the folder; `None` when nothing is named by `link` there,
    /// when it could not be told, and off macOS.
    #[must_use]
    pub fn names_by_link(&self) -> Option<String> {
        ops::names_by_link(&self.path)
    }

    /// The path `relative` really is at, relative to the folder, when it is
    /// reached through a symlink (the file itself, or a directory on its
    /// way) and the link ends inside the folder; `None` for a path that is
    /// its own, one that does not exist and one that leaves the folder. The
    /// name a file has is not always the name it is kept under: a link
    /// called `espelho.txt` to `Nota.md` is the note.
    #[must_use]
    pub fn resolved_name(&self, relative: &Path) -> Option<PathBuf> {
        let relative = confine::confine(relative).ok()?;
        let root = std::fs::canonicalize(&self.path).ok()?;
        let real = std::fs::canonicalize(self.path.join(&relative)).ok()?;
        let inside = real.strip_prefix(&root).ok()?.to_path_buf();
        (inside != relative).then_some(inside)
    }

    /// Whether the file `relative` names has more than one name on disk (a
    /// hard link: another name, under any extension, for the same bytes).
    /// Where the file system does not say, `false`.
    #[must_use]
    pub fn hard_linked(&self, relative: &Path) -> bool {
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            confine::confine(relative)
                .ok()
                .and_then(|r| std::fs::metadata(self.path.join(r)).ok())
                .is_some_and(|m| m.is_file() && m.nlink() > 1)
        }
        #[cfg(not(unix))]
        {
            let _ = relative;
            false
        }
    }

    /// Whether `relative`, resolved through every symlink on its way, stays
    /// in the folder. What does not exist yet is judged by the deepest
    /// part that does: a new file inside a linked directory that leaves is
    /// outside too.
    pub(crate) fn resolves_inside(&self, relative: &Path) -> bool {
        let Ok(root) = std::fs::canonicalize(&self.path) else {
            return false;
        };
        lands_inside(&root, self.path.join(relative), 0)
    }

    /// The rules the walk runs under.
    #[must_use]
    pub fn rules(&self) -> WalkRules {
        self.rules
    }

    /// The handle for a path relative to the root, confined first: an
    /// absolute path, a `..` component or a NUL byte is refused; so is a
    /// path the walk would not list — a hidden entry (but the folder's
    /// settings directory and its plain entries, ADR 0070) or an ignored
    /// path —
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
        // The one file a scoped root is for, whatever its name (ADR 0114).
        if self.scope.as_deref() == Some(relative.as_path()) {
            return Ok(relative);
        }
        self.in_scope(&relative)?;
        // The placeholder name form outranks the hidden rule here as in the
        // walk (ADR 0043), so a walked placeholder can be named again. The
        // folder's settings directory, `.verso/`, and its plain entries are
        // the one exception (ADR 0070 items 1–2): the folder's layer lives
        // there and sync carries it like any file.
        let hidden = !settings::in_settings_dir(&relative)
            && relative.components().enumerate().any(|(i, c)| {
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
        // A root for one file lists nothing (ADR 0114 item 16).
        if self.scope.is_some() {
            return Walk::default();
        }
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

    /// Whether `handle` names a directory, a symlink followed as
    /// [`Root::read`] follows it: a caller whose unit is a file asks before
    /// reading a path it was only told changed. `false` for a file, for
    /// nothing there, and for what cannot be asked about.
    #[must_use]
    pub fn is_dir(&self, handle: Handle) -> bool {
        self.path_of(handle)
            .is_some_and(|path| std::fs::metadata(path).is_ok_and(|m| m.is_dir()))
    }

    /// Read a file's content and its [`Stamp`]. A placeholder — a dataless
    /// file, a `.Name.ext.icloud` entry, or `Name.ext` whose `.icloud`
    /// sibling stands in for it — is [`ReadError::Unavailable`] and is never
    /// opened (ADR 0043).
    pub fn read(&self, handle: Handle) -> Result<(Vec<u8>, Stamp), ReadError> {
        // The guard runs on the name as given and, through a symlink, on
        // the target: both doors ask the same question as `write`.
        let target = self.readable(handle)?;
        // The stamp's time and length are taken before the bytes, as the
        // write takes them: a write that lands between the two leaves an
        // older time with the newer content, which the next index reads
        // again, never a newer time vouching for older content.
        let meta = std::fs::metadata(&target).map_err(ReadError::Io)?;
        let bytes = std::fs::read(&target).map_err(ReadError::Io)?;
        let stamp = Stamp::of(&meta, &bytes).map_err(ReadError::Io)?;
        Ok((bytes, stamp))
    }

    /// The file `handle` names, a placeholder refused as [`Root::read`]
    /// refuses it, and its target through a symlink.
    fn readable(&self, handle: Handle) -> Result<PathBuf, ReadError> {
        let path = self
            .path_of(handle)
            .ok_or(ReadError::UnknownHandle(handle))?;
        if placeholder::stands_in(&path).map_err(ReadError::Io)? {
            return Err(ReadError::Unavailable);
        }
        let target = placeholder::follow(&path).map_err(ReadError::Io)?;
        if target != path && placeholder::stands_in(&target).map_err(ReadError::Io)? {
            return Err(ReadError::Unavailable);
        }
        Ok(target)
    }

    /// Up to `max` bytes of the file `handle` names from `offset`, and the
    /// file's length and modified time taken before the read, as
    /// [`Root::read`] takes them: a file sent in pieces is never whole in
    /// memory, and a caller that compares the length and time between
    /// pieces sees the file change under it (ADR 0079 item 12, revised
    /// 2026-10-12). Past the end, nothing.
    pub fn read_range(
        &self,
        handle: Handle,
        offset: u64,
        max: usize,
    ) -> Result<(Vec<u8>, Mark), ReadError> {
        use std::io::{Read, Seek, SeekFrom};
        let target = self.readable(handle)?;
        let meta = std::fs::metadata(&target).map_err(ReadError::Io)?;
        let mark = Mark {
            len: meta.len(),
            modified: meta.modified().map_err(ReadError::Io)?,
        };
        let left = mark.len.saturating_sub(offset);
        let want = usize::try_from(left).unwrap_or(usize::MAX).min(max);
        let mut bytes = Vec::with_capacity(want);
        if want > 0 {
            let mut file = std::fs::File::open(&target).map_err(ReadError::Io)?;
            file.seek(SeekFrom::Start(offset)).map_err(ReadError::Io)?;
            file.take(want as u64)
                .read_to_end(&mut bytes)
                .map_err(ReadError::Io)?;
        }
        Ok((bytes, mark))
    }

    /// Read the whole file `handle` names a piece at a time, each piece
    /// handed to `each`, and return its [`Stamp`] — the same stamp
    /// [`Root::read`] gives — without the file ever whole in memory: the
    /// hash a sync compares, of a file of any size.
    pub fn read_through(
        &self,
        handle: Handle,
        each: impl FnMut(&[u8]),
    ) -> Result<Stamp, ReadError> {
        let target = self.readable(handle)?;
        let meta = std::fs::metadata(&target).map_err(ReadError::Io)?;
        let hash = read_pieces(&target, each).map_err(ReadError::Io)?;
        Ok(Stamp {
            modified: meta.modified().map_err(ReadError::Io)?,
            len: meta.len(),
            hash,
        })
    }

    /// The temporary files of writes not finished, relative to the root:
    /// a transfer in pieces under way, or what a process that stopped in
    /// the middle of a write left behind. The walk never lists them (their
    /// names are hidden); this says they are there.
    pub fn temporaries(&self) -> std::io::Result<Vec<PathBuf>> {
        let mut out = Vec::new();
        if self.scope.is_some() {
            return Ok(out);
        }
        let mut stack = vec![PathBuf::new()];
        while let Some(rel) = stack.pop() {
            for entry in std::fs::read_dir(on_disk(&self.path, &rel))? {
                let entry = entry?;
                let name = entry.file_name();
                let kind = entry.file_type()?;
                if kind.is_dir() {
                    stack.push(rel_join(&rel, &name));
                } else if name.as_encoded_bytes().starts_with(b".verso-tmp-") {
                    out.push(rel_join(&rel, &name));
                }
            }
        }
        out.sort();
        Ok(out)
    }

    /// Start a file that arrives in pieces at `relative`: a temporary file
    /// beside where it will land, filled by [`Staged::append`], and given
    /// its name by [`Root::create_staged`] or [`Root::write_staged`] —
    /// the same atomic write as [`Root::create`] and [`Root::write`]
    /// (invariant 9), never the file whole in memory. Dropped unfinished,
    /// the temporary file goes. Confined like every path; a placeholder
    /// is refused now rather than after the last piece (ADR 0043).
    pub fn stage(&self, relative: &Path) -> Result<Staged, WriteError> {
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        self.scoped_write(&relative)?;
        let path = on_disk(&self.path, &relative);
        if placeholder::stands_in(&path).map_err(WriteError::Io)? {
            return Err(WriteError::Placeholder);
        }
        match std::fs::metadata(&path) {
            Ok(meta) if meta.is_file() => {
                // Over a file: beside its target, through a symlink, with
                // its mode from the first instant, as `write` does.
                let target = placeholder::follow(&path).map_err(WriteError::Io)?;
                let original = std::fs::metadata(&target).map_err(WriteError::Io)?;
                let dir = target.parent().unwrap_or(&self.path);
                staged::Staged::beside(dir, Some(&original))
            }
            Ok(_) => Err(WriteError::Exists),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                self.new_names(&relative, None)?;
                // A new file: in the nearest folder that exists on its way,
                // so an abandoned transfer leaves no empty folder behind;
                // the missing ones are made when it lands.
                let mut dir = path.parent().unwrap_or(&self.path);
                while !dir.is_dir() && dir != self.path {
                    dir = dir.parent().unwrap_or(&self.path);
                }
                staged::Staged::beside(dir, None)
            }
            Err(e) => Err(WriteError::Io(e)),
        }
    }

    /// Give a file that arrived in pieces ([`Root::stage`]) the name
    /// `relative`, which must not exist yet: [`Root::create`]'s step, the
    /// file synced first.
    pub fn create_staged(
        &mut self,
        relative: &Path,
        staged: Staged,
    ) -> Result<(Handle, OpReport), WriteError> {
        self.no_scoped()?;
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        self.new_names(&relative, None)?;
        let report = staged.create_at(&on_disk(&self.path, &relative))?;
        self.journal
            .push(Touched::Written(journal::slashed(&relative)));
        Ok((self.intern(relative), report))
    }

    /// Create the file `relative` from a file the person picked outside the
    /// folder (`source`, the host's path at the entry edge), copied in
    /// pieces of [`PICK_CHUNK`] into a temporary file and given its name by
    /// [`Root::create_staged`] — the same atomic create as [`Root::create`]
    /// (invariant 9), never the file whole in memory. Never overwrites:
    /// [`WriteError::Exists`] is answered before a byte is copied, and again
    /// if a file appears meanwhile. A failure mid-copy leaves neither a file
    /// nor a temporary one. The picked file's own refusals (not a regular
    /// file, a placeholder, more than `max` bytes) are [`ImportError::Picked`].
    pub fn create_from_picked(
        &mut self,
        relative: &Path,
        source: &Path,
        max: u64,
    ) -> Result<(Handle, OpReport), ImportError> {
        self.no_scoped()?;
        let confined = self.confine(relative).map_err(WriteError::Confined)?;
        self.new_names(&confined, None)?;
        if ops::occupied(&on_disk(&self.path, &confined)).map_err(WriteError::Io)? {
            return Err(WriteError::Exists.into());
        }
        let mut staged = self.stage(&confined)?;
        copy_picked(source, max, |piece| staged.append(piece))?;
        Ok(self.create_staged(&confined, staged)?)
    }

    /// Put a file that arrived in pieces ([`Root::stage`]) over the file
    /// `handle` names: [`Root::write`]'s step — refused when the file on
    /// disk is not the one `expected` describes (invariant 11) or is a
    /// placeholder (ADR 0043).
    pub fn write_staged(
        &self,
        handle: Handle,
        staged: Staged,
        expected: &Stamp,
    ) -> Result<WriteReport, WriteError> {
        self.scoped_write_handle(handle)?;
        let path = self
            .path_of(handle)
            .ok_or(WriteError::UnknownHandle(handle))?;
        let report = staged.write_over(&path, expected)?;
        self.touched(handle);
        Ok(report)
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

    /// The bytes the disk under the folder can still take (ADR 0043,
    /// decided on 2026-10-27: a download from the cloud refuses to start
    /// when the files do not fit).
    pub fn free_space(&self) -> Result<u64, std::io::Error> {
        space::free_bytes(&self.path)
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
        self.scoped_write_handle(handle)?;
        let path = self
            .path_of(handle)
            .ok_or(WriteError::UnknownHandle(handle))?;
        let report = write::write_atomically(&path, content, expected)?;
        self.touched(handle);
        Ok(report)
    }

    /// Create a file that does not exist yet, confined like every path,
    /// with `content`, atomically (ADR 0048): written under a temporary
    /// name, synced, then given its name by a step that fails rather than
    /// replacing what appeared there meanwhile — an exclusive rename on
    /// macOS, `link` elsewhere (ADR 0069, revised 2026-10-11). `WriteError::Exists` when
    /// something already stands there. The report carries the new file's
    /// stamp and what could not be confirmed once the file was in place.
    pub fn create(
        &mut self,
        relative: &Path,
        content: &[u8],
    ) -> Result<(Handle, OpReport), WriteError> {
        self.no_scoped()?;
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        self.new_names(&relative, None)?;
        let report = ops::create_atomically(&on_disk(&self.path, &relative), content)?;
        self.journal
            .push(Touched::Written(journal::slashed(&relative)));
        Ok((self.intern(relative), report))
    }

    /// Create a folder (and its parents) inside the root, confined, each
    /// new directory synced into the one it hangs from.
    pub fn create_dir(&self, relative: &Path) -> Result<(PathBuf, OpReport), WriteError> {
        self.no_scoped()?;
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        self.new_names(&relative, None)?;
        let report = ops::create_directory(&on_disk(&self.path, &relative))?;
        Ok((relative, report))
    }

    /// Remove the folder at `relative` when it is empty, confined: `false`
    /// when it holds anything — nothing in it is ever removed — or is the
    /// root itself. Sync leaves no empty folder behind a move or a deletion
    /// that came from another device (ADR 0079).
    pub fn remove_empty_dir(&self, relative: &Path) -> Result<bool, WriteError> {
        self.no_scoped()?;
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        if relative.as_os_str().is_empty() {
            return Ok(false);
        }
        ops::remove_empty_directory(&on_disk(&self.path, &relative))
    }

    /// The names a create or a rename makes along the confined `relative`,
    /// checked as ADR 0070 item 3 says: one not every OS can keep, or one
    /// that differs only in case from an entry its folder lists (spec Q8,
    /// decided 2026-10-12) — case and the accents' Unicode form folded
    /// together (spec Q7) — is refused; an entry that exists never is.
    /// `from`: the entry a rename moves.
    fn new_names(&self, relative: &Path, from: Option<&Path>) -> Result<(), WriteError> {
        confine::unportable_new(&self.path, relative).map_err(WriteError::Confined)?;
        confine::case_twin_new(&self.path, relative, from).map_err(WriteError::Confined)
    }

    /// Move an entry to another path of the folder, both confined; refuses
    /// an occupied destination, unless it is the entry itself under another
    /// spelling of its name (a case-only rename on APFS), and a new name
    /// that differs only in case from another entry there (spec Q8); creates the
    /// destination's folders. A regular file is moved by an exclusive
    /// rename on macOS and by `link` and `unlink` elsewhere, so nothing
    /// that appears at the destination meanwhile is replaced; a directory
    /// or a symlink is renamed.
    pub fn rename(&mut self, from: &Path, to: &Path) -> Result<(Handle, OpReport), WriteError> {
        self.no_scoped()?;
        let from = self.confine(from).map_err(WriteError::Confined)?;
        let to = self.confine(to).map_err(WriteError::Confined)?;
        self.new_names(&to, Some(&from))?;
        let report = ops::rename_path(&on_disk(&self.path, &from), &on_disk(&self.path, &to))?;
        self.journal.push(Touched::Moved(
            journal::slashed(&from),
            journal::slashed(&to),
        ));
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
            self.scope.clone(),
            on_change,
        )
    }

    /// Move an entry into `.trash/` at the root (Obsidian's bin), keeping
    /// its relative path. Returns where it went, relative to the root.
    pub fn trash(&mut self, relative: &Path) -> Result<(PathBuf, OpReport), WriteError> {
        self.no_scoped()?;
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        let done = ops::trash(&self.path, &relative)?;
        self.journal
            .push(Touched::Gone(journal::slashed(&relative)));
        Ok(done)
    }

    /// Everything in `.trash/` at the root, not following a symlink (ADR
    /// 0080 item 2): the one walk that enters a hidden directory, by name.
    pub fn trash_walk(&self) -> std::io::Result<Vec<trashbin::Binned>> {
        trashbin::walk(&self.path)
    }

    /// Remove an entry of `.trash/` for good (ADR 0080 items 3 and 7):
    /// only a path under the bin, a symlink removed as itself.
    pub fn purge_trash(&self, relative: &Path) -> Result<(), WriteError> {
        self.no_scoped()?;
        trashbin::purge(&self.path, relative)
    }

    /// Move an entry of `.trash/` back to `to`, confined as every path is;
    /// `WriteError::Exists` when something stands there (ADR 0080 item 5).
    /// A restore is a move inside the folder: the names it makes are
    /// checked as a rename's are (ADR 0070 item 3) — one not every OS can
    /// keep is refused, and so is one that differs only in case from an
    /// entry of its folder (spec Q8), which the caller takes for a name
    /// taken and restores beside.
    pub fn restore_from_trash(&mut self, from: &Path, to: &Path) -> Result<OpReport, WriteError> {
        self.no_scoped()?;
        let to = self.confine(to).map_err(WriteError::Confined)?;
        self.new_names(&to, None)?;
        let report = trashbin::restore(&self.path, from, &to)?;
        self.journal.push(Touched::Written(journal::slashed(&to)));
        Ok(report)
    }

    /// Whether an entry can be put into the folder `relative`: it is a
    /// folder there — reached as the file system reaches it, so on a Mac
    /// `Pasta` is the `pasta` that stands — or the folders it would make
    /// pass ADR 0070 item 3's checks, refused with the reason a create
    /// would give; nothing is made. A restore asks it of the folder it
    /// puts an entry back into: one that only a case twin stands for on
    /// Linux cannot be helped by a name beside.
    pub fn check_new_folder(&self, relative: &Path) -> Result<(), WriteError> {
        self.no_scoped()?;
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        if std::fs::metadata(on_disk(&self.path, &relative)).is_ok_and(|m| m.is_dir()) {
            return Ok(());
        }
        self.new_names(&relative, None)
    }

    /// Copy the file at `relative` into `.trash/` before a write replaces
    /// it (ADR 0080 item 12); returns where the copy went.
    pub fn keep_in_trash(&mut self, relative: &Path) -> Result<PathBuf, WriteError> {
        self.no_scoped()?;
        let relative = self.confine(relative).map_err(WriteError::Confined)?;
        trashbin::keep_copy(&self.path, &relative)
    }

    /// Read `.space/waypoints.json` at the root and its [`Stamp`] (ADR 0062 D7).
    /// As with `.trash/`, read by name; other hidden files remain refused.
    pub fn read_waypoints(&self) -> Result<(Vec<u8>, Stamp), ReadError> {
        ops::read_waypoints(&self.path)
    }

    /// `.space/waypoints.json`, when its content is only in the cloud in the
    /// dataless form, so the person's click can fetch it (ADR 0043, amended
    /// on 2026-10-27). It is named here and not by a path: a hidden entry
    /// never crosses the contract as one. `None` for a file on disk, an
    /// absent one and the older `.Name.ext.icloud` form.
    pub fn waypoints_placeholder(&self) -> Result<Option<Placeholder>, ReadError> {
        let path = crate::on_disk(&self.path, Path::new(ops::WAYPOINTS_PATH));
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

    /// Replace `.space/waypoints.json` atomically, checking that the file on
    /// disk is the one that was read (`expected`, Invariant 11; ADR 0062 D7).
    pub fn write_waypoints(
        &self,
        content: &[u8],
        expected: &Stamp,
    ) -> Result<WriteReport, WriteError> {
        self.no_scoped()?;
        ops::write_waypoints(&self.path, content, expected)
    }

    /// Keep what the writes change from now on, or stop (ADR 0091 item 8):
    /// what the computer's history of the folder records.
    pub fn keep_journal(&self, on: bool) {
        self.journal.keep(on);
    }

    /// What the writes changed since the last call, while kept.
    pub fn take_journal(&self) -> Vec<Touched> {
        self.journal.take()
    }

    /// The file `handle` names was written.
    fn touched(&self, handle: Handle) {
        if handle.root == self.id
            && let Some(rel) = self.table.get(handle.index as usize)
        {
            self.journal.push(Touched::Written(journal::slashed(rel)));
        }
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
