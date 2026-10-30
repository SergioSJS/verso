// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! One file, not a folder (ADR 0114 items 16 and 22): the parent directory
//! opened as a [`Root`] with a *scope*, the one file's name. The scoped
//! file is read and written as any file of a folder; its siblings are not
//! the root's — a handle to one is refused ([`ConfinementError::OutOfScope`])
//! unless it names an attachment kind (an image, a PDF, audio, video), and
//! those are read only and must resolve inside the parent through every
//! symlink on their way. Nothing is listed: the walk of a scoped root is
//! empty, and the sweep of temporaries looks at nothing — a temporary file
//! is not named after its target, so "a leftover of this very file" cannot
//! be told from a sibling's without listing the parent (as built,
//! 2026-10-30). Every other write — a new file, a folder, a rename, the
//! bin — is refused.
//!
//! A path string enters at [`Root::open_file`] and at [`kind_of`], the
//! host's classification of what the system handed it (item 6): both are
//! the entry edge, and this crate is the one that asks the disk (ADR 0026
//! rule 5).

use std::path::{Component, Path, PathBuf};

use crate::{ConfinementError, Handle, ReadError, Root, WriteError, on_disk, placeholder};

/// The extensions a loose file opens under, folded (ADR 0114 item 1).
pub const NOTE_EXTENSIONS: [&str; 2] = ["md", "markdown"];

/// The extensions of the attachment kinds a loose note may read beside
/// itself (item 14): image, PDF, audio, video. Nothing else — a sibling
/// note is reached only by the person's click, as a scope of its own.
const ATTACHMENT_EXTENSIONS: [&str; 20] = [
    "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "pdf", "mp3", "m4a", "wav", "ogg",
    "flac", "opus", "mp4", "webm", "mov", "m4v", "ogv",
];

/// What the system handed the app, as the disk says it (ADR 0114 item 6).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathKind {
    /// A directory: a folder to open as today.
    Directory,
    /// A regular file whose extension, folded, is `md` or `markdown`,
    /// its name and its parent. A dataless cloud file counts: its read
    /// brings it down, as a folder's note is (ADR 0043).
    MarkdownFile,
    /// A regular file of another kind.
    OtherFile,
    /// Nothing is there; or only the older iCloud `.Name.ext.icloud`
    /// marker, which a read cannot bring down (ADR 0043).
    Missing,
    /// A placeholder in the older form: the file is only in the cloud.
    Placeholder,
    /// The disk could not be asked: the error's text, no path.
    Unreadable(String),
}

/// Whether `name`'s extension, folded, is one of `exts`.
fn has_extension(name: &std::ffi::OsStr, exts: &[&str]) -> bool {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| {
            let folded = e.to_lowercase();
            exts.iter().any(|x| *x == folded)
        })
}

/// Whether `relative`'s last name is a note's (`.md`, `.markdown`).
#[must_use]
pub fn is_note_name(relative: &Path) -> bool {
    relative
        .file_name()
        .is_some_and(|n| has_extension(n, &NOTE_EXTENSIONS))
}

/// Whether `relative`'s last name is of an attachment kind.
#[must_use]
pub fn is_attachment_name(relative: &Path) -> bool {
    relative
        .file_name()
        .is_some_and(|n| has_extension(n, &ATTACHMENT_EXTENSIONS))
}

/// Classify `path` as the host hands it over: one look at the disk, here
/// (ADR 0026 rule 5), and an answer in kinds, never a path.
#[must_use]
pub fn kind_of(path: &Path) -> PathKind {
    match std::fs::metadata(path) {
        Ok(meta) if meta.is_dir() => PathKind::Directory,
        Ok(meta) if meta.is_file() => {
            if path
                .file_name()
                .is_some_and(|n| placeholder::icloud_placeholder_of(n).is_some())
            {
                PathKind::Placeholder
            } else if is_note_name(path) {
                PathKind::MarkdownFile
            } else {
                PathKind::OtherFile
            }
        }
        Ok(_) => PathKind::OtherFile,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // `Name.md` absent with `.Name.md.icloud` beside it: in the
            // cloud, in the form that cannot be brought down.
            match placeholder::stands_in(path) {
                Ok(true) => PathKind::Placeholder,
                _ => PathKind::Missing,
            }
        }
        Err(e) => PathKind::Unreadable(e.to_string()),
    }
}

/// `path` as the disk names the place: absolute, `.` and `..` resolved,
/// every symlink followed, on Windows without the `\\?\` prefix. When the
/// path does not exist, its nearest existing ancestor is canonicalized and
/// the rest is appended after a lexical normalization (a `..` cannot
/// climb above what exists). The entry edge asks here, so that
/// `/tmp/x/../y.md` and `/private/tmp/y.md` are one file (ADR 0114 item 7).
#[must_use]
pub fn canonical_path(path: &Path) -> PathBuf {
    let absolute = std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
    if let Ok(real) = std::fs::canonicalize(&absolute) {
        return plain(real);
    }
    // Lexical normalization of the missing tail.
    let mut kept: Vec<std::ffi::OsString> = Vec::new();
    let mut base = PathBuf::new();
    for c in absolute.components() {
        match c {
            Component::Prefix(_) | Component::RootDir => base.push(c.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                kept.pop();
            }
            Component::Normal(n) => kept.push(n.to_owned()),
        }
    }
    let mut out = base.clone();
    let mut tail = Vec::new();
    for n in kept {
        if tail.is_empty() {
            let next = out.join(&n);
            if next.exists() {
                out = next;
                continue;
            }
        }
        tail.push(n);
    }
    let mut out = std::fs::canonicalize(&out).map_or(out, plain);
    out.extend(tail);
    out
}

/// A Windows verbatim path (`\\?\C:\x`) as the plain one (`C:\x`).
fn plain(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    if let Some(rest) = path.to_str().and_then(|s| s.strip_prefix(r"\\?\"))
        && rest.as_bytes().get(1) == Some(&b':')
    {
        return PathBuf::from(rest);
    }
    path
}

/// Whether two names of one path component are the same on this system:
/// case-insensitive where the usual volumes are (macOS, Windows).
fn same_component(a: &std::ffi::OsStr, b: &std::ffi::OsStr) -> bool {
    if a == b {
        return true;
    }
    cfg!(any(target_os = "macos", windows))
        && match (a.to_str(), b.to_str()) {
            (Some(a), Some(b)) => a.to_lowercase() == b.to_lowercase(),
            _ => false,
        }
}

/// `path` relative to `root`, both canonical ([`canonical_path`]); the
/// components compare case-insensitively on macOS and Windows. `None` when
/// `path` is not inside `root`.
#[must_use]
pub fn strip_root(path: &Path, root: &Path) -> Option<PathBuf> {
    let mut rest = path.components();
    for r in root.components() {
        let p = rest.next()?;
        if !same_component(p.as_os_str(), r.as_os_str()) {
            return None;
        }
    }
    Some(rest.as_path().to_path_buf())
}

/// Why a scoped file opens for reading only (ADR 0114 items 12 and 13).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadOnlyWhy {
    /// The file or its folder cannot be written by this user: permissions,
    /// a read-only volume, a locked file. The system's words, no path.
    Permissions(String),
}

impl Root {
    /// Open one file: its parent directory as the root, scoped to the
    /// file's name. `path` is the one place a path string enters (with
    /// [`kind_of`]); it must name a regular file (a dataless cloud file
    /// counts, ADR 0043). Nothing is read yet.
    pub fn open_file(path: impl Into<PathBuf>) -> Result<Self, std::io::Error> {
        let path = std::path::absolute(path.into())?;
        let meta = std::fs::metadata(&path)?;
        if !meta.is_file() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "the file must be a regular file",
            ));
        }
        let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "the file has no parent folder",
            ));
        };
        let mut root = Self::open(parent, Vec::new())?;
        root.scope = Some(PathBuf::from(name));
        root.links_inside = true;
        Ok(root)
    }

    /// The scoped file's name, relative to the root, for a root opened by
    /// [`Root::open_file`]; `None` for a folder.
    #[must_use]
    pub fn scope(&self) -> Option<&Path> {
        self.scope.as_deref()
    }

    /// The handle of the scoped file itself.
    pub fn scoped_file(&mut self) -> Result<Handle, ConfinementError> {
        let name = self.scope.clone().ok_or(ConfinementError::OutOfScope)?;
        Ok(self.intern(name))
    }

    /// What a scoped root admits of `relative`, already confined: the
    /// scoped file (whatever its name); an attachment kind that is not
    /// hidden and lands inside the parent through every symlink; nothing
    /// else.
    pub(crate) fn in_scope(&self, relative: &Path) -> Result<(), ConfinementError> {
        let Some(scope) = &self.scope else {
            return Ok(());
        };
        if relative == scope {
            return Ok(());
        }
        if !is_attachment_name(relative) {
            return Err(ConfinementError::OutOfScope);
        }
        if relative.components().any(|c| match c {
            Component::Normal(name) => name.as_encoded_bytes().starts_with(b"."),
            _ => false,
        }) {
            return Err(ConfinementError::Hidden);
        }
        if !self.resolves_inside(relative) {
            return Err(ConfinementError::LeavesFolder);
        }
        Ok(())
    }

    /// A write of `relative` on a scoped root: only the scoped file's.
    pub(crate) fn scoped_write(&self, relative: &Path) -> Result<(), WriteError> {
        match &self.scope {
            Some(scope) if scope != relative => {
                Err(WriteError::Confined(ConfinementError::OutOfScope))
            }
            _ => Ok(()),
        }
    }

    /// A write through `handle` on a scoped root: only the scoped file's.
    pub(crate) fn scoped_write_handle(&self, handle: Handle) -> Result<(), WriteError> {
        match (&self.scope, self.table.get(handle.index as usize)) {
            (Some(scope), Some(rel)) if handle.root == self.id && scope != rel => {
                Err(WriteError::Confined(ConfinementError::OutOfScope))
            }
            (Some(_), None) => Err(WriteError::UnknownHandle(handle)),
            _ => Ok(()),
        }
    }

    /// Any write on a scoped root that is not the scoped file's: a new
    /// file, a folder, a rename, the bin, the focuses file.
    pub(crate) fn no_scoped(&self) -> Result<(), WriteError> {
        if self.scope.is_some() {
            return Err(WriteError::Confined(ConfinementError::OutOfScope));
        }
        Ok(())
    }

    /// A sibling note `relative` names (`[[Nome]]` → `Nome.md`, a relative
    /// link's target): one `stat`, never a listing (ADR 0114 item 14). The
    /// name as given, `.md` added when it has no note extension; `None`
    /// when nothing of that name is a regular file inside the parent, or
    /// the path is not admissible (`..`, absolute, hidden, a link out).
    #[must_use]
    pub fn sibling_note(&self, relative: &Path) -> Option<PathBuf> {
        self.scope.as_ref()?;
        let relative = crate::confine::confine(relative).ok()?;
        let relative = if is_note_name(&relative) {
            relative
        } else {
            let mut s = relative.into_os_string();
            s.push(".md");
            PathBuf::from(s)
        };
        if relative.components().any(|c| match c {
            Component::Normal(name) => name.as_encoded_bytes().starts_with(b"."),
            _ => false,
        }) {
            return None;
        }
        let on_disk = on_disk(&self.path, &relative);
        let is_file = std::fs::metadata(&on_disk).is_ok_and(|m| m.is_file());
        (is_file && self.resolves_inside(&relative)).then_some(relative)
    }

    /// Open the sibling note [`Root::sibling_note`] admits, as a scope of
    /// its own.
    pub fn open_sibling(&self, relative: &Path) -> Result<Self, std::io::Error> {
        let relative = self.sibling_note(relative).ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "no such note beside this file",
            )
        })?;
        Self::open_file(on_disk(&self.path, &relative))
    }

    /// Why the scoped file cannot be written now, if it cannot (ADR 0114
    /// item 12): the file's own permission bits or its folder's say so, or
    /// the system refuses to open it for writing (a locked file, a
    /// read-only volume). Opening for append changes nothing of the file.
    /// `None` for a folder root, and when the file can be written.
    #[must_use]
    pub fn scoped_read_only(&self) -> Option<ReadOnlyWhy> {
        let scope = self.scope.as_ref()?;
        let path = on_disk(&self.path, scope);
        let target = placeholder::follow(&path).unwrap_or(path);
        // The directory's mode bits say "nobody may write" on Unix only; on
        // Windows the READONLY attribute of a directory is a marker (Explorer
        // sets it on Documents and Pictures) that stops no write, so it is
        // not read. Whether the directory takes a new file is asked for real
        // by [`Root::scoped_dir_writable`], when a save is about to be made.
        #[cfg(unix)]
        if let Ok(meta) = std::fs::metadata(&self.path)
            && meta.permissions().readonly()
        {
            return Some(ReadOnlyWhy::Permissions(
                "the file's folder is read-only".to_owned(),
            ));
        }
        match std::fs::metadata(&target) {
            Ok(meta) if meta.permissions().readonly() => {
                return Some(ReadOnlyWhy::Permissions("the file is read-only".to_owned()));
            }
            // A dataless cloud file is not opened here: opening it would
            // bring it down (ADR 0043); the read decides.
            Ok(meta) if placeholder::is_dataless(&meta) => return None,
            _ => {}
        }
        match std::fs::OpenOptions::new().append(true).open(&target) {
            Ok(_) => None,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => Some(ReadOnlyWhy::Permissions(e.kind().to_string())),
        }
    }

    /// Whether the parent directory takes a new file, asked for real: the
    /// atomic save writes a temporary file there and renames it over the
    /// file, so a file that can be written in a directory that cannot is
    /// not editable. A temporary of a name no sweep takes for a writer's is
    /// created and removed at once, never left. Called when a save is about
    /// to be made, not at every command.
    pub fn scoped_dir_writable(&self) -> Result<(), std::io::Error> {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let name = format!(
            ".verso-tmp-probe-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        );
        let probe = self.path.join(name);
        std::fs::File::create_new(&probe)?;
        std::fs::remove_file(&probe)
    }

    /// The scoped file's length in bytes, following a symlink, without
    /// reading it (ADR 0114 item 13); a placeholder is said as such.
    pub fn scoped_len(&self) -> Result<u64, ReadError> {
        let scope = self.scope.as_ref().ok_or(ReadError::Unavailable)?;
        let path = on_disk(&self.path, scope);
        if placeholder::stands_in(&path).map_err(ReadError::Io)? {
            return Err(ReadError::Unavailable);
        }
        let target = placeholder::follow(&path).map_err(ReadError::Io)?;
        Ok(std::fs::metadata(target).map_err(ReadError::Io)?.len())
    }

    /// Create the scoped file again at its name, with `content`, after it
    /// was deleted or moved outside (ADR 0114 item 11, "Save here again"):
    /// refused with [`WriteError::Exists`] when something reappeared there.
    pub fn create_scoped(
        &mut self,
        content: &[u8],
    ) -> Result<(Handle, crate::OpReport), WriteError> {
        let scope = self
            .scope
            .clone()
            .ok_or(WriteError::Confined(ConfinementError::OutOfScope))?;
        // Only where the file stood: a folder renamed, moved or deleted is
        // not made again (Save a copy… is the way out).
        if !std::fs::metadata(&self.path).is_ok_and(|m| m.is_dir()) {
            return Err(WriteError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "the file's folder is gone",
            )));
        }
        let report = crate::ops::create_atomically(&on_disk(&self.path, &scope), content)?;
        Ok((self.intern(scope), report))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn note_and_attachment_names_are_told_by_their_folded_extension() {
        assert!(is_note_name(Path::new("Nota.md")));
        assert!(is_note_name(Path::new("Nota.MD")));
        assert!(is_note_name(Path::new("sub/Nota.markdown")));
        assert!(!is_note_name(Path::new("Nota.txt")));
        assert!(!is_note_name(Path::new("Nota")));
        assert!(is_attachment_name(Path::new("foto.PNG")));
        assert!(is_attachment_name(Path::new("docs/manual.pdf")));
        assert!(!is_attachment_name(Path::new("outra.md")));
        assert!(!is_attachment_name(Path::new("dados.json")));
    }
}
