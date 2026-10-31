//! The index of the open folder: a walk, the watcher, search and the graph's
//! answers.

use super::*;

/// The largest note the index reads and parses: a note past it is a file to
/// sync and find by name, not text to index. Reading and parsing a note costs
/// about a dozen times its size in memory (measured 2026-10-30: 30 MB took
/// 390 MB), which a small server cannot spend on one file.
pub const INDEX_MOST: u64 = 16 * 1024 * 1024;

impl Workspace {
    /// One index run, in transactions of a few hundred notes each: a
    /// commit per note syncs the disk once per note where SQLite's sync is
    /// real (Windows). What was done before a failure — or a panic, which
    /// the app catches and survives — is committed, each note's change
    /// whole on its own, and the run's transaction never stays open.
    pub fn index_with_progress<F>(&mut self, on_progress: F) -> Result<IndexReport, CoreError>
    where
        F: FnMut(IndexProgress),
    {
        self.index.begin().map_err(CoreError::Index)?;
        let report =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| self.index_run(on_progress)));
        let committed = self.index.commit().map_err(CoreError::Index);
        let report = match report {
            Ok(report) => report?,
            Err(panic) => std::panic::resume_unwind(panic),
        };
        committed?;
        Ok(report)
    }

    fn index_run<F>(&mut self, mut on_progress: F) -> Result<IndexReport, CoreError>
    where
        F: FnMut(IndexProgress),
    {
        on_progress(IndexProgress {
            phase: "scanning".to_string(),
            current: 0,
            total: 0,
            file: None,
        });
        // The folder's settings first: the walk's rules may be its own
        // (ADR 0070). What changed in `.verso/` is reported, never indexed.
        let (layer_changed, layer_gone) = self.walk_layer();
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
        let mut report = IndexReport {
            changed: layer_changed,
            gone: layer_gone,
            ..IndexReport::default()
        };
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
                    // A note past the cap is a file to sync, not text to
                    // index: never read here, and the row of a smaller
                    // version it had goes (`INDEX_MOST`). The file is still
                    // there: present, so that it is not reported gone (the
                    // history would record a deletion of a file on disk).
                    present.insert(relative.clone());
                    if entry.len > INDEX_MOST {
                        if self.index.remove(&relative).map_err(CoreError::Index)? {
                            report.removed += 1;
                        }
                        continue;
                    }
                    // Modified time and length the index holds, from long
                    // enough before the last complete run began
                    // (`Index::complete`): unchanged, and not read again
                    // (decided 2026-10-08; reading and hashing every note
                    // made each opening of 5,000 notes cost seconds of CPU).
                    let modified = entry.modified.map(seconds_since_epoch);
                    if let Some(modified) = modified
                        && self
                            .index
                            .unchanged_by_stat(&relative, modified, entry.len)
                            .map_err(CoreError::Index)?
                    {
                        report.unchanged += 1;
                        report.trusted += 1;
                        continue;
                    }
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
                            self.index.step().map_err(CoreError::Index)?;
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
                    if is_canvas(&relative) {
                        present.insert(relative.clone());
                        match self.root.read(entry.handle) {
                            Ok((bytes, stamp)) => {
                                let stamp = note_stamp(&stamp);
                                if self.index.stamp_of(&relative).map_err(CoreError::Index)?
                                    == Some(stamp)
                                {
                                    continue;
                                }
                                self.index_canvas(&relative, &bytes, stamp)?;
                                report.changed.push(relative.clone());
                            }
                            // Unavailable: what the index had stays (ADR
                            // 0043); a canvas is a file, never a note to
                            // mark.
                            Err(verso_fs::ReadError::Unavailable) => {}
                            Err(e) => report.unreadable.push((relative, e.to_string())),
                        }
                    }
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
        for known in self.index.sources().map_err(CoreError::Index)? {
            if !present.contains(&known)
                && !under_problem(&known)
                && self.index.remove(&known).map_err(CoreError::Index)?
            {
                report.removed += 1;
                report.gone.push(known);
            }
        }
        // Every note read or trusted: from the next run on, one modified
        // well before this run began is trusted by its stat. Not when a
        // folder could not be listed or a file read: those notes were
        // neither.
        if report.problems.is_empty() && report.unreadable.is_empty() {
            self.index.complete().map_err(CoreError::Index)?;
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

    /// The index brought up to date with the paths of one batch of the
    /// watch only, not a walk of the whole folder (ADR 0073 item 12): a
    /// note or a board whose content changed is read again, a file created
    /// enters the listing and a file removed leaves it (`narrow.rs`), and
    /// nothing else is touched. Anything else — a directory, a
    /// placeholder, a `.gitignore`, a batch the system said to scan whole,
    /// a batch too large — runs [`Workspace::index_with_progress`] as
    /// before, so the listing and what is gone stay exactly what a walk
    /// finds.
    pub fn index_changes<F>(
        &mut self,
        changes: &Changes,
        on_progress: F,
    ) -> Result<IndexReport, CoreError>
    where
        F: FnMut(IndexProgress),
    {
        // Reading a path costs about a millisecond, a walk of the folder
        // about one per hundred notes: a batch of up to a twentieth of the
        // folder (64 at least) is cheaper by its paths (measured with the
        // benchmark's watch_batch, 2026-10-09).
        let narrow_most = 64.max(self.entries.len() / 20);
        let paths: Vec<String> = changes
            .paths
            .iter()
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .collect();
        let narrowable = !changes.rescan
            && !paths.is_empty()
            && paths.len() <= narrow_most
            && paths.iter().all(|p| {
                self.entries
                    .iter()
                    .find(|e| e.path == *p)
                    .is_none_or(|e| matches!(e.kind, FileKind::Note | FileKind::File))
            });
        if !narrowable {
            return self.index_with_progress(on_progress);
        }
        self.index.begin().map_err(CoreError::Index)?;
        let report =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| self.narrow_run(&paths)));
        let committed = self.index.commit().map_err(CoreError::Index);
        let report = match report {
            Ok(report) => report?,
            Err(panic) => std::panic::resume_unwind(panic),
        };
        committed?;
        match report {
            Some(report) => Ok(report),
            // A path only a walk answers for.
            None => self.index_with_progress(on_progress),
        }
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
        // The folder's settings directory holds no note (ADR 0070).
        Self::refuse_settings(&key)?;
        if !key.ends_with(".md") {
            key.push_str(".md");
        }
        Ok(key)
    }

    /// What a reader names — a note, by [`Self::note_key`], or a board: a
    /// `.canvas` path stays as given. A canvas is a link source and target
    /// of the index like a note, so `backlinks`, `links` and `read_note`
    /// answer for one (review `board.md`, reading 1, finding 9). Writing a
    /// note never goes through here: a note named `Plano.canvas` is
    /// `Plano.canvas.md`.
    pub fn source_key(&self, note: &str) -> Result<String, CoreError> {
        let confined = self
            .root
            .confine(Path::new(note))
            .map_err(CoreError::Confined)?
            .to_string_lossy()
            .into_owned();
        if !is_canvas(&confined) {
            return self.note_key(note);
        }
        Self::refuse_settings(&confined)?;
        // A note named `Plano.canvas.md` asked for without its `.md`: the
        // note, when no board of that path is known and the note is
        // (review `board.md`, second reading, finding 8).
        let as_note = self.note_key(note)?;
        if !self.known(&confined)? && self.known(&as_note)? {
            return Ok(as_note);
        }
        Ok(confined)
    }

    /// [`Self::note_key`] and the handle to read the file.
    pub(crate) fn note_path(
        &mut self,
        note: &str,
    ) -> Result<(String, verso_fs::Handle), CoreError> {
        let key = self.note_key(note)?;
        let handle = self
            .root
            .handle(Path::new(&key))
            .map_err(CoreError::Confined)?;
        Ok((key, handle))
    }

    pub(crate) fn known(&self, path: &str) -> Result<bool, CoreError> {
        Ok(self
            .index
            .stamp_of(path)
            .map_err(CoreError::Index)?
            .is_some())
    }

    /// Backlinks of a note given by its path relative to the folder, with
    /// or without `.md`, or by its name as a link names it; `None` when
    /// the index does not know the note.
    pub fn backlinks(&mut self, note: &str) -> Result<Option<Vec<Backlink>>, CoreError> {
        let mut path = self.source_key(note)?;
        if !self.known(&path)? {
            // Named as a link names it: `Barão` for `npcs/Barão.md`.
            match self.index.note_named(note).map_err(CoreError::Index)? {
                Some(found) => path = found,
                None => return Ok(None),
            }
        }
        self.index
            .backlinks(&path)
            .map(Some)
            .map_err(CoreError::Index)
    }

    /// The links a note makes, with what each resolves to; `None` when the
    /// index does not know the note.
    pub fn links(&mut self, note: &str) -> Result<Option<Vec<Link>>, CoreError> {
        let path = self.source_key(note)?;
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
        let path = self.source_key(note)?;
        self.index.is_unverified(&path).map_err(CoreError::Index)
    }
}
