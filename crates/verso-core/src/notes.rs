//! A note read and written: its text for the window, a write that checks the
//! disk first, new notes, files and folders, and a note binned.

use super::*;

impl Workspace {
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
        let document = verso_dialect::parse(&text);
        // Rendered from the same parse: the reader hides the ids it found.
        let html = verso_dialect::to_html_with(&text, &document);
        let schema_blocks = document.schemas.iter().map(typed::notice).collect();
        let frontmatter = match document.frontmatter.map(|f| f.values) {
            Some(Ok(verso_dialect::Value::Mapping(map))) => map,
            _ => Vec::new(),
        };
        let note_type = if typed::written_type(&frontmatter).is_some() {
            let blocks = self.index.schema_blocks().map_err(CoreError::Index)?;
            typed::note_type(&frontmatter, &blocks, |p| {
                self.index.content_of(p).ok().flatten()
            })
        } else {
            None
        };
        Ok(NoteText {
            lines: text.lines().map(str::to_owned).collect(),
            html,
            properties: properties(&text),
            note_type,
            schema_blocks,
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
        let path = self.source_key(note)?;
        let handle = self
            .root
            .handle(Path::new(&path))
            .map_err(CoreError::Confined)?;
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
    pub(crate) fn stamp_of_written(
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
    pub(crate) fn write_warnings(&self, r: &verso_fs::WriteReport) -> Vec<String> {
        let mut out = r.warnings();
        if let Some(target) = &r.wrote_through_symlink_to {
            out.push(match target.strip_prefix(&self.folder) {
                Ok(inside) => format!("written through a symlink to {}", inside.display()),
                Err(_) => "written through a symlink to a file outside the folder".to_owned(),
            });
        }
        out
    }

    pub(crate) fn decode_revision(revision: &str) -> Result<Stamp, CoreError> {
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
        let (handle, report) = self
            .root
            .create(Path::new(&key), bytes)
            .map_err(CoreError::Write)?;
        self.files
            .entry(verso_index::file_key(name_of(&key)))
            .or_default()
            .push(key.clone());
        if is_canvas(&key) {
            let stamp = self.stamp_of_written(handle, report.stamp, bytes);
            self.index_canvas(&key, bytes, note_stamp(&stamp))?;
        }
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
    pub(crate) fn refresh(&mut self, warnings: &mut Vec<String>) {
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
}
