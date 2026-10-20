//! Text files, boards and bases: a text read and written, a board read, written
//! and indexed, a base evaluated over the folder's facts.

use super::*;
use crate::canvas_secret;

impl Workspace {
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
        self.history_seen(&key, &bytes, stamp.modified);
        let text = String::from_utf8(bytes).map_err(|_| CoreError::NotText)?;
        Ok(TextFile {
            path: key,
            text,
            revision: revision::encode(&stamp),
            warnings: Vec::new(),
        })
    }

    /// A board read for an agent (ADR 0066 point 2), from its file now: its
    /// cards, edges and drawn texts, with the board's path as the index
    /// knows it. Not a `.canvas`, or not JSON: [`CoreError::NotCanvas`].
    pub fn read_board(&mut self, relative: &str) -> Result<(String, board::BoardRead), CoreError> {
        let key = self.entry_key(relative)?;
        if !is_canvas(&key) {
            return Err(CoreError::NotCanvas);
        }
        let file = self.read_text(&key)?;
        let read = board::read_board(&file.text).map_err(|_| CoreError::NotCanvas)?;
        Ok((file.path, read))
    }

    /// A note's tags — of its frontmatter and its body, without `#`, once
    /// each — as a base counts them (`file.tags`), from the index's copy of
    /// the note; `None` for a note the index does not know. For a text just
    /// read, [`tags_of`].
    pub fn note_tags(&mut self, note: &str) -> Result<Option<Vec<String>>, CoreError> {
        self.refresh_base_facts()?;
        Ok(self.base_facts.get(note).map(|(_, f)| f.tags.clone()))
    }

    /// The notes, in path order, that have the tag `tag` — or one nested
    /// under it (`projeto` has `projeto/ativo`), case ignored, as
    /// `file.hasTag` — and the property `property`, holding `value` when
    /// one is given (a list holds each of its items; case ignored). With
    /// neither, every note (ADR 0066 point 3).
    pub fn notes_where(
        &mut self,
        tag: Option<&str>,
        property: Option<&str>,
        value: Option<&str>,
    ) -> Result<Vec<String>, CoreError> {
        self.refresh_base_facts()?;
        // An empty filter is no filter.
        let tag = tag
            .map(|t| t.trim().trim_start_matches('#').to_lowercase())
            .filter(|t| !t.is_empty());
        let property = property
            .map(|p| p.trim().to_lowercase())
            .filter(|p| !p.is_empty());
        let value = value.map(|v| v.trim().to_lowercase());
        let mut out: Vec<String> = self
            .base_facts
            .iter()
            .filter(|(path, _)| path.ends_with(".md"))
            .filter(|(_, (_, facts))| {
                let tagged = tag.as_deref().is_none_or(|w| {
                    facts.tags.iter().any(|t| {
                        let t = t.to_lowercase();
                        t == w || t.starts_with(&format!("{w}/"))
                    })
                });
                let held = property.as_deref().is_none_or(|p| {
                    facts
                        .props
                        .iter()
                        .filter(|(k, _)| k.to_lowercase() == p)
                        .any(|(_, v)| value.as_deref().is_none_or(|w| holds(v, w)))
                });
                tagged && held
            })
            .map(|(path, _)| path.clone())
            .collect();
        out.sort();
        Ok(out)
    }

    /// Evaluate a base — a `.base` file, or the text of a `base` block —
    /// over the folder as the index and the last walk know it (ADR 0053).
    /// Reads the base's file, if the query names one, and nothing else of
    /// the folder: what the notes say comes from the index.
    pub fn query_base(&mut self, query: &bases::BaseQuery) -> Result<bases::BaseResult, CoreError> {
        let text = match (&query.text, &query.path) {
            (Some(text), _) => text.clone(),
            (None, Some(path)) if query.reader => self.reader_read_text(path)?.text,
            (None, Some(path)) => self.read_text(path)?.text,
            (None, None) => String::new(),
        };
        let base = verso_dialect::bases::parse_base(&text);
        self.refresh_base_facts()?;
        let offset = i64::from(query.offset_minutes) * 60_000;
        let local = |secs: i64| (secs > 0).then(|| secs * 1_000 + offset);
        // A reader's notes (ADR 0087 item 4): sizes and times of the
        // projections, the facts of each note with a secret block read
        // from its projection, the links inside secret blocks left out.
        let entries: std::borrow::Cow<'_, [FileEntry]> = if query.reader {
            std::borrow::Cow::Owned(self.reader_entries()?)
        } else {
            std::borrow::Cow::Borrowed(&self.entries)
        };
        let mut projected: HashMap<String, bases::NoteFacts> = HashMap::new();
        if query.reader {
            for path in self.index.notes_with_secrets().map_err(CoreError::Index)? {
                let shown = self
                    .index
                    .reader_content_of(&path)
                    .map_err(CoreError::Index)?
                    .unwrap_or_default();
                projected.insert(path, bases::NoteFacts::of(&shown));
            }
        }
        let files: Vec<bases::FileFacts> = entries
            .iter()
            .filter(|e| e.kind != FileKind::Folder && query.sees(&e.path))
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
            .filter(|(path, _)| query.sees(path))
            .map(|(path, (_, facts))| (path.clone(), projected.get(path).unwrap_or(facts)))
            .collect();
        let links = if query.reader {
            self.index.reader_all_links()
        } else {
            self.index.all_links()
        }
        .map_err(CoreError::Index)?
        .into_iter()
        .filter(|l| query.sees(&l.from))
        .map(|l| {
            (
                l.from,
                bases::LinkFact {
                    target: l.target,
                    alias: l.alias,
                    embed: l.embed,
                    // A note the query does not see is not reached.
                    resolved: l.resolved.filter(|p| query.sees(p)),
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
                .filter(|p| query.sees(p))
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
        let key = self.write_key(relative)?;
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
        let mut warnings = self.write_warnings(&report);
        if is_canvas(&key)
            && let Err(e) = self.index_canvas(&key, text.as_bytes(), note_stamp(&stamp))
        {
            warnings.push(format!("the index could not follow {key}: {e}"));
        }
        Ok(TextFile {
            path: key,
            text: text.to_owned(),
            revision: revision::encode(&stamp),
            warnings,
        })
    }

    /// Put a canvas into the index as a link source (ADR 0057 point 6):
    /// its file nodes and the links of its text nodes, found where they
    /// are written. A file that is not JSON is still a canvas the index
    /// knows — a link target — with no links and nothing to search.
    pub(crate) fn index_canvas(
        &mut self,
        relative: &str,
        bytes: &[u8],
        stamp: NoteStamp,
    ) -> Result<(), CoreError> {
        let text = String::from_utf8_lossy(bytes);
        // The secret nodes of the board (ADR 0090 item 5): what a reader's
        // search and counts are answered from leaves them out.
        let split = canvas_secret::index_split(&text);
        let (content, links) = match canvas::Canvas::parse(&text) {
            Ok(board) => {
                let lines = LineStarts::of(&text);
                // A link written inside a `> [!secret]` callout of a text
                // card is as secret as the callout (decided 2026-10-15).
                let callouts: Vec<verso_dialect::Secrets> = board
                    .nodes()
                    .iter()
                    .map(canvas_secret::text_secrets)
                    .collect();
                let links = board
                    .links()
                    .into_iter()
                    .map(|l| {
                        let (line, col) = lines.line_col(&text, l.at);
                        verso_index::SourceLink {
                            embed: l.embed,
                            exact: l.place == canvas::Place::FileNode,
                            secret: split.as_ref().is_some_and(|s| s.nodes.contains(&l.node))
                                || matches!(l.place, canvas::Place::Text { start, end }
                                    if callouts.get(l.node).is_some_and(|c| c.touches(start..end))),
                            target: l.target,
                            heading: l.heading,
                            block: l.block,
                            alias: l.alias,
                            line,
                            col,
                            start: l.at,
                            end: l.at,
                        }
                    })
                    .collect::<Vec<_>>();
                (board.searchable_text(), links)
            }
            Err(_) => (String::new(), Vec::new()),
        };
        let split = split.map(|s| verso_index::BoardSplit {
            public: s.public,
            secret: s.secret,
            len: s.served.0,
            hash: s.served.1,
            hidden: s
                .lines
                .iter()
                .map(|(a, b)| format!("{a}-{b}"))
                .collect::<Vec<_>>()
                .join(","),
        });
        self.index
            .upsert_board(relative, stamp, &content, &links, split.as_ref())
            .map_err(CoreError::Index)
    }

    /// Save a board (ADR 0057 point 2): `json` is the canvas as the window
    /// holds it, laid over the file as read — every value unchanged keeps
    /// its token, every object its key order — and written in Obsidian's
    /// layout, atomically, over
    /// the file `revision` describes (invariant 11 refuses a changed one).
    /// A file on disk that is not JSON is refused: the text view is where
    /// it gets fixed.
    pub fn write_board(
        &mut self,
        relative: &str,
        json: &str,
        revision: &str,
    ) -> Result<TextFile, CoreError> {
        let (key, now, text) = self.board_over_disk(relative, json, false)?;
        if text == now.text && now.revision == revision {
            return Ok(now);
        }
        self.write_text(&key, &text, revision)
    }

    /// The text [`Workspace::write_board`] would write for `json` over the
    /// file as it is on disk now, writing nothing: the board's side of a
    /// conflict, and what the first save of a canvas in another layout
    /// shows before it rewrites the file (review `board.md` §6 item 4).
    pub fn board_preview(&mut self, relative: &str, json: &str) -> Result<String, CoreError> {
        self.board_over_disk(relative, json, false)
            .map(|(_, _, text)| text)
    }

    /// [`Self::board_preview`] as a reader asks it: laid over the board as
    /// the reader is served it, without its secret pins (ADR 0090 item 5).
    pub fn reader_board_preview(
        &mut self,
        relative: &str,
        json: &str,
    ) -> Result<String, CoreError> {
        self.board_over_disk(relative, json, true)
            .map(|(_, _, text)| text)
    }

    /// The board's path, the file as read now, and `json` laid over it in
    /// Obsidian's layout.
    fn board_over_disk(
        &mut self,
        relative: &str,
        json: &str,
        reader: bool,
    ) -> Result<(String, TextFile, String), CoreError> {
        let key = self.entry_key(relative)?;
        if !is_canvas(&key) {
            return Err(CoreError::NotCanvas);
        }
        let now = if reader {
            self.reader_read_text(&key)?
        } else {
            self.read_text(&key)?
        };
        let old = canvas::Canvas::parse(&now.text).map_err(|_| CoreError::NotCanvas)?;
        let new = canvas::Canvas::parse(json).map_err(|_| CoreError::NotCanvas)?;
        let text = old.merged(new.root).write();
        Ok((key, now, text))
    }
}

/// Does a property's value hold `wanted` (folded)? A scalar by its text, a
/// list by any of its items; a mapping never.
fn holds(v: &verso_dialect::Value, wanted: &str) -> bool {
    use verso_dialect::Value;
    match v {
        Value::Sequence(items) => items.iter().any(|i| holds(i, wanted)),
        Value::Mapping(_) => false,
        scalar => property_text(scalar).trim().to_lowercase() == wanted,
    }
}
