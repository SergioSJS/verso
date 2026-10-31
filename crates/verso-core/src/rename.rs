//! A note renamed or moved, and every link to it rewritten: what the folder
//! links to it, the plan of edits, and the plan carried out.

use super::*;

impl Workspace {
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
        // The folder notes of the folders things leave and enter: their
        // `order:` may name what moved (ADR 0060, D4).
        let notes = self.index.notes().map_err(CoreError::Index)?;
        let by_name: HashMap<String, &String> =
            notes.iter().map(|n| (n.to_lowercase(), n)).collect();
        for (old, new) in mv
            .notes
            .iter()
            .chain(mv.files.iter())
            .chain(mv.folders.iter())
        {
            for dir in [parent_of(old), parent_of(new)] {
                for candidate in self.note_candidates(dir) {
                    if let Some(found) = by_name.get(&candidate.to_lowercase()) {
                        paths.push((*found).clone());
                    }
                }
            }
        }
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
            if is_canvas(&path) {
                let Ok(board) = canvas::Canvas::parse(&text) else {
                    warnings.push(format!("{path}: not JSON, its links were not followed"));
                    skipped.push(Skipped {
                        path,
                        reason: SkipReason::Failed,
                    });
                    continue;
                };
                let mut links = Vec::new();
                for l in board.links() {
                    let reached = match l.place {
                        canvas::Place::FileNode => self.reach_exact(&l.target)?,
                        canvas::Place::Text { .. } => self.reach(&path, &l.target)?,
                    };
                    if let Some(reached) = reached {
                        let (start, end, place) = match l.place {
                            canvas::Place::FileNode => (0, 0, SeenPlace::FileNode(l.node)),
                            canvas::Place::Text { start, end } => {
                                (start, end, SeenPlace::TextNode(l.node))
                            }
                        };
                        links.push(Seen {
                            start,
                            end,
                            target: l.target,
                            reached,
                            place,
                        });
                    }
                }
                examined.push(Examined {
                    path,
                    text,
                    revision: revision::encode(&stamp),
                    links,
                });
                continue;
            }
            let parsed = verso_dialect::parse(&text);
            let mut links = Vec::new();
            let spans = parsed
                .links
                .iter()
                .map(|l| (l.span, l.target.as_str()))
                .chain(parsed.embeds.iter().map(|e| (e.span, e.target.as_str())))
                .chain(
                    parsed
                        .property_links
                        .iter()
                        .map(|p| (p.span, p.target.as_str())),
                );
            for (span, target) in spans {
                if let Some(reached) = self.reach(&path, target)? {
                    links.push(Seen {
                        start: span.start,
                        end: span.end,
                        target: target.to_owned(),
                        reached,
                        place: SeenPlace::Note,
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
    pub(crate) fn reach(&self, source: &str, target: &str) -> Result<Option<Reached>, CoreError> {
        if let Some(note) = self
            .index
            .resolve_from(source, target)
            .map_err(CoreError::Index)?
        {
            return Ok(Some(Reached::Note(note)));
        }
        Ok(self.resolve_file(source, target).map(Reached::File))
    }

    /// What a canvas's `file` node reaches: the note or the file at that
    /// path from the root, as JSON Canvas writes it and the window reads
    /// it — never one found by name in another folder (ADR 0057, decided
    /// on 2026-10-01). A card left pointing at a path that is gone reaches
    /// nothing, so a move plans its rewrite.
    pub(crate) fn reach_exact(&self, target: &str) -> Result<Option<Reached>, CoreError> {
        if let Some(note) = self.index.resolve_exact(target).map_err(CoreError::Index)? {
            return Ok(Some(Reached::Note(note)));
        }
        let wanted = verso_index::file_key(target);
        Ok(self
            .files
            .values()
            .flatten()
            .find(|p| verso_index::file_key(p) == wanted)
            .cloned()
            .map(Reached::File))
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
            // A canvas is a row of the index too, with its links: it follows
            // the move as a note's row does, a placeholder's included.
            if is_canvas(old)
                && let Err(e) = self.index.rekey(old, new)
            {
                warnings.push(format!(
                    "the index could not follow {old} to {new}: {e}; reindex to repair"
                ));
            }
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
            if is_canvas(&note.path) {
                rewrites.extend(self.plan_canvas(note, mv, warnings));
                continue;
            }
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
            let mut after = retargeted(&note.text, &edits);
            let text_to_check = after.as_deref().unwrap_or(&note.text);
            if let Some(order_after) = rewrite_order(
                text_to_check,
                &note.path,
                mv,
                &self.dirs,
                &self.folder_note_name,
                &self.root_name(),
            ) {
                after = Some(order_after);
            }
            if let Some(after) = after
                && after != note.text
            {
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

    /// The rewrite of one canvas a move calls for: a file node that
    /// pointed at what moved points at its new path, as Obsidian writes it
    /// (the whole path from the root); a link inside a text node is
    /// pointed as a note's link would be. The rest of the file keeps its
    /// bytes (`canvas::Canvas::write`).
    fn plan_canvas(
        &self,
        note: Examined,
        mv: &Move,
        warnings: &mut Vec<String>,
    ) -> Option<LinkRewrite> {
        // A canvas moves as a file: its own path after the move.
        let path_now = match mv.after(&Reached::File(note.path.clone())) {
            Reached::File(p) | Reached::Note(p) => p,
        };
        let mut board = canvas::Canvas::parse(&note.text).ok()?;
        let mut files: Vec<(usize, String)> = Vec::new();
        let mut texts: HashMap<usize, Vec<(usize, usize, String)>> = HashMap::new();
        for seen in &note.links {
            let wanted = mv.after(&seen.reached);
            let now = match seen.place {
                SeenPlace::FileNode(_) => self.reach_exact(&seen.target),
                SeenPlace::TextNode(_) | SeenPlace::Note => self.reach(&path_now, &seen.target),
            };
            let now = match now {
                Ok(now) => now,
                Err(e) => {
                    warnings.push(format!("{path_now}: {e}"));
                    continue;
                }
            };
            if now.as_ref() == Some(&wanted) {
                continue;
            }
            match seen.place {
                SeenPlace::FileNode(node) => files.push((node, wanted.path().to_owned())),
                SeenPlace::TextNode(node) => {
                    match self.retarget(&path_now, &seen.target, &wanted) {
                        Some(target) => texts
                            .entry(node)
                            .or_default()
                            .push((seen.start, seen.end, target)),
                        None => warnings.push(format!(
                            "{path_now}: the link [[{}]] could not be pointed at {}",
                            seen.target,
                            wanted.path()
                        )),
                    }
                }
                SeenPlace::Note => {}
            }
        }
        for (node, path) in files {
            board.set_node_string(node, "file", path);
        }
        for (node, edits) in texts {
            let Some(text) = board
                .nodes()
                .get(node)
                .and_then(|n| n.get("text"))
                .and_then(canvas::Json::as_str)
                .map(str::to_owned)
            else {
                continue;
            };
            if let Some(after) = retargeted(&text, &edits) {
                board.set_node_string(node, "text", after);
            }
        }
        let after = board.write();
        (after != note.text).then_some(LinkRewrite {
            path: path_now,
            revision: note.revision,
            before: note.text,
            after,
        })
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
            folders: Vec::new(),
            then: Vec::new(),
        };
        self.perform(mv, &old, &new)
    }

    /// Read what a move may change, move the entry, make the index and
    /// the listing follow, plan the rewrites. `old` and `new` are the
    /// entry the caller named; `mv` is everything that moves with it.
    pub(crate) fn perform(&mut self, mv: Move, old: &str, new: &str) -> Result<Renamed, CoreError> {
        let mut done = self.perform_many(vec![((old.to_owned(), new.to_owned()), mv)])?;
        // One entry: its refusal is the call's.
        if let Some((_, e)) = done.refused.pop() {
            return Err(e);
        }
        Ok(Renamed {
            path: new.to_owned(),
            rewrites: done.rewrites,
            skipped: done.skipped,
            warnings: done.warnings,
            also: done.also,
        })
    }

    /// Several moves at once (ADR 0048, revised 2026-10-07): what they may
    /// change is read once, before any of them; each entry is then moved
    /// on disk in turn, and one that cannot be is left where it is, with
    /// its reason, while the others go on; the index and the listing follow
    /// what moved, and the rewrites are planned once, over where
    /// everything ended — a note linking to two of them gets one rewrite.
    /// Each part is an entry, old path to new, with everything that moves
    /// with it.
    pub(crate) fn perform_many(
        &mut self,
        parts: Vec<((String, String), Move)>,
    ) -> Result<Performed, CoreError> {
        let mut all = Move::default();
        for (_, part) in &parts {
            all.extend_from(part);
        }
        let Examination {
            examined,
            mut skipped,
            mut warnings,
        } = self.examine(&all)?;
        let mut mv = Move::default();
        let mut moved = Vec::new();
        let mut refused = Vec::new();
        for ((old, new), part) in parts {
            match self.root.rename(Path::new(&old), Path::new(&new)) {
                Ok((_, report)) => {
                    warnings.extend(report.warnings());
                    mv.extend_from(&part);
                    moved.push((old, new));
                }
                Err(e) => refused.push((old, CoreError::Write(e))),
            }
        }
        if moved.is_empty() {
            return Ok(Performed {
                moved,
                refused,
                rewrites: Vec::new(),
                skipped: Vec::new(),
                warnings,
                also: Vec::new(),
            });
        }
        // What moved has moved: from here on, nothing is an error.
        let mut also = Vec::new();
        for (from, to) in std::mem::take(&mut mv.then) {
            match self.root.rename(Path::new(&from), Path::new(&to)) {
                Ok((_, report)) => {
                    warnings.extend(report.warnings());
                    let before = mv
                        .notes
                        .iter()
                        .find(|(_, n)| n == &to)
                        .map_or_else(|| from.clone(), |(o, _)| o.clone());
                    also.push((before, to));
                }
                Err(e) => {
                    // Not renamed: the map says where the note is.
                    warnings.push(format!("{from}: {e}"));
                    for entry in &mut mv.notes {
                        if entry.1 == to {
                            entry.1.clone_from(&from);
                        }
                    }
                    mv.notes.retain(|(o, n)| o != n);
                }
            }
        }
        self.follow(&mv, &mut warnings);
        let rewrites = self.plan(examined, &mv, &mut warnings);
        for s in &mut skipped {
            if let Some(now) = mv.note_after(&s.path) {
                s.path = now.to_owned();
            }
        }
        Ok(Performed {
            moved,
            refused,
            rewrites,
            skipped,
            warnings,
            also,
        })
    }
}

/// What `perform_many` did: the entries that moved, old path to new; the
/// ones that could not, with why; the rewrites, the notes it could not
/// plan, what it could not confirm, and what moved by a rule of its own.
pub(crate) struct Performed {
    pub(crate) moved: Vec<(String, String)>,
    pub(crate) refused: Vec<(String, CoreError)>,
    pub(crate) rewrites: Vec<LinkRewrite>,
    pub(crate) skipped: Vec<Skipped>,
    pub(crate) warnings: Vec<String>,
    pub(crate) also: Vec<(String, String)>,
}

/// What a link reached before a move — a note, by the index's rule, or
/// a file, by the same rule applied to attachments (spec Q12).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Reached {
    Note(String),
    File(String),
}

impl Reached {
    pub(crate) fn path(&self) -> &str {
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
    place: SeenPlace,
}

/// Where a link read for a plan is written: in a note's text (at
/// `start..end`), or in a canvas — a file node's `file` field, or inside a
/// text node's `text` (at `start..end` of that field's text).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SeenPlace {
    Note,
    FileNode(usize),
    TextNode(usize),
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
pub(crate) struct Move {
    pub(crate) notes: Vec<(String, String)>,
    pub(crate) files: Vec<(String, String)>,
    pub(crate) folders: Vec<(String, String)>,
    /// Renames done after the entry's own, each from where that left the
    /// file to where it goes: a folder's note taking the folder's new name
    /// (ADR 0060 D3, the maintainer on 2026-10-02).
    pub(crate) then: Vec<(String, String)>,
}

impl Move {
    /// Add what another move changes to this one's.
    fn extend_from(&mut self, other: &Move) {
        self.notes.extend(other.notes.iter().cloned());
        self.files.extend(other.files.iter().cloned());
        self.folders.extend(other.folders.iter().cloned());
        self.then.extend(other.then.iter().cloned());
    }

    fn note_after(&self, path: &str) -> Option<&str> {
        self.notes
            .iter()
            .find(|(old, _)| old == path)
            .map(|(_, new)| new.as_str())
    }

    /// Where what a link reached is after the move.
    fn after(&self, reached: &Reached) -> Reached {
        match reached {
            // A canvas reaches as a note (the index holds it) and moves as
            // a file.
            Reached::Note(p) => Reached::Note(
                self.note_after(p)
                    .or_else(|| {
                        self.files
                            .iter()
                            .find(|(old, _)| old == p)
                            .map(|(_, new)| new.as_str())
                    })
                    .map_or_else(|| p.clone(), str::to_owned),
            ),
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

/// The key a line opens at the top level of a frontmatter mapping.
fn top_level_key(line: &str) -> Option<String> {
    let first = line.chars().next()?;
    if first.is_whitespace() || first == '-' || first == '#' {
        return None;
    }
    if first == '"' || first == '\'' {
        let rest = line.get(1..)?;
        let end = rest.find(first)?;
        let after = rest.get(end + 1..)?.trim_start_matches([' ', '\t']);
        return after
            .starts_with(':')
            .then(|| rest.get(..end).map(str::to_owned))
            .flatten();
    }
    let (key, _) = line.split_once(':')?;
    let key = key.trim_end();
    let key = key
        .strip_prefix('"')
        .and_then(|k| k.strip_suffix('"'))
        .or_else(|| key.strip_prefix('\'').and_then(|k| k.strip_suffix('\'')))
        .unwrap_or(key);
    Some(key.to_owned())
}

/// Whether `s`, written bare as a YAML scalar, would read back as other
/// text: a different type (`2024`, `01`, `1e3`, `yes`, `null`), an
/// indicator (`[x].md`, `- a`, `&a`), or a key or comment inside.
fn needs_yaml_quote(s: &str) -> bool {
    let Some(first) = s.chars().next() else {
        return true;
    };
    if "-?:,[]{}#&*!|>'\"%@`~".contains(first) || first.is_whitespace() {
        return true;
    }
    if s.ends_with(char::is_whitespace)
        || s.contains(": ")
        || s.ends_with(':')
        || s.contains(" #")
        || s.contains(['\t', '\n', '\r', '"', '\\'])
    {
        return true;
    }
    let lower = s.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "true" | "false" | "yes" | "no" | "on" | "off" | "y" | "n" | "null"
    ) || s.parse::<f64>().is_ok()
        || s.starts_with("0x")
        || s.starts_with("0o")
}

/// `s` as a YAML scalar that reads back as the same text.
fn yaml_scalar(s: &str) -> String {
    if needs_yaml_quote(s) {
        let escaped = s
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\t', "\\t")
            .replace('\n', "\\n")
            .replace('\r', "\\r");
        format!("\"{escaped}\"")
    } else {
        s.to_owned()
    }
}

/// A plain or quoted YAML scalar as its text; `None` for anything else
/// (a nested list or mapping), which an item is never compared with.
fn yaml_scalar_text(raw: &str) -> Option<String> {
    if let Some(inner) = raw.strip_prefix('"').and_then(|r| r.strip_suffix('"')) {
        let mut out = String::new();
        let mut chars = inner.chars();
        while let Some(c) = chars.next() {
            if c != '\\' {
                out.push(c);
                continue;
            }
            match chars.next()? {
                'n' => out.push('\n'),
                't' => out.push('\t'),
                'r' => out.push('\r'),
                other => out.push(other),
            }
        }
        return Some(out);
    }
    if let Some(inner) = raw.strip_prefix('\'').and_then(|r| r.strip_suffix('\'')) {
        return Some(inner.replace("''", "'"));
    }
    if raw.is_empty() || raw.starts_with(['[', '{', '-', '&', '*', '!', '|', '>']) {
        return None;
    }
    Some(raw.to_owned())
}

/// One item of an `order:` block, as written in the file: where its value
/// sits (byte offsets in the whole text), where its line starts and ends
/// (end of line included), and the value as text.
struct OrderItem {
    line_start: usize,
    line_end: usize,
    value_start: usize,
    value_end: usize,
    text: Option<String>,
}

/// The items of the `order:` block sequence of a frontmatter, as written;
/// `None` when the note has no such block (a flow list `[a, b]` included:
/// it is left as it is).
fn order_items(text: &str, fm_start: usize, fm_end: usize) -> Option<Vec<OrderItem>> {
    let fm_text = text.get(fm_start..fm_end)?;
    let mut items = Vec::new();
    let mut in_order = false;
    let mut found = false;
    let mut offset = fm_start;
    for line in fm_text.split_inclusive('\n') {
        let start = offset;
        offset += line.len();
        let body = line.trim_end_matches(['\n', '\r']);
        if body.starts_with("---") || body.starts_with("...") {
            if in_order {
                break;
            }
            continue;
        }
        if let Some(key) = top_level_key(body) {
            if in_order {
                break;
            }
            if key == "order" {
                let after = body.split_once(':').map_or("", |(_, v)| v).trim();
                if !after.is_empty() && !after.starts_with('#') {
                    return None;
                }
                in_order = true;
                found = true;
            }
            continue;
        }
        if !in_order {
            continue;
        }
        let trimmed = body.trim_start();
        let Some(rest) = trimmed.strip_prefix('-') else {
            continue;
        };
        if !(rest.is_empty() || rest.starts_with([' ', '\t'])) {
            continue;
        }
        let lead = body.len() - rest.len();
        let raw_with_space = &body[lead..];
        let raw_trimmed_start = raw_with_space.trim_start();
        let value_start = start + lead + (raw_with_space.len() - raw_trimmed_start.len());
        let raw = if raw_trimmed_start.starts_with(['"', '\'']) {
            raw_trimmed_start.trim_end()
        } else {
            raw_trimmed_start
                .split_once(" #")
                .map_or(raw_trimmed_start, |(v, _)| v)
                .trim_end()
        };
        items.push(OrderItem {
            line_start: start,
            line_end: offset,
            value_start,
            value_end: value_start + raw.len(),
            text: yaml_scalar_text(raw),
        });
    }
    found.then_some(items)
}

/// Where `path` is after the move: itself, a note or file that moved, or
/// inside a folder that moved.
fn moved_path(mv: &Move, path: &str) -> String {
    if let Some(new) = mv.note_after(path) {
        return new.to_owned();
    }
    if let Some((_, new)) = mv.files.iter().find(|(old, _)| old == path) {
        return new.clone();
    }
    let mut best: Option<(&str, &str)> = None;
    for (old, new) in &mv.folders {
        let inside = path == old || path.starts_with(&format!("{old}/"));
        if inside && best.is_none_or(|(b, _)| old.len() > b.len()) {
            best = Some((old, new));
        }
    }
    match best {
        Some((old, new)) => format!("{new}{}", &path[old.len()..]),
        None => path.to_owned(),
    }
}

/// The `order:` of a folder note after a move (ADR 0060, D4): an item
/// that moved within its folder takes its new name; one that left the
/// folder is taken out. Only the lines of those items change — every
/// other line, comment and spelling stays as written. `None` when nothing
/// changes. `dirs` are the folders before the move; `configured` is the
/// folder note name setting.
fn rewrite_order(
    text: &str,
    note_path: &str,
    mv: &Move,
    dirs: &HashSet<String>,
    configured: &str,
    root_name: &str,
) -> Option<String> {
    let parsed = verso_dialect::parse(text);
    let fm = parsed.frontmatter.as_ref()?;
    let items = order_items(text, fm.span.start, fm.span.end)?;
    let folder = folders_of_note(note_path, configured, root_name)
        .into_iter()
        .find_map(|f| {
            if f.is_empty() {
                Some(String::new())
            } else {
                dirs.iter().find(|d| same_name(d, &f)).cloned()
            }
        })?;
    let new_folder = moved_path(mv, &folder);

    let moved: Vec<(&str, &str, bool)> = mv
        .notes
        .iter()
        .map(|(o, n)| (o.as_str(), n.as_str(), true))
        .chain(
            mv.files
                .iter()
                .map(|(o, n)| (o.as_str(), n.as_str(), false)),
        )
        .chain(
            mv.folders
                .iter()
                .map(|(o, n)| (o.as_str(), n.as_str(), false)),
        )
        .collect();

    // (item index, Some(new text) or None to take the line out)
    let mut edits: Vec<(usize, Option<String>)> = Vec::new();
    for (old, new, is_note) in moved {
        if parent_of(old) != folder {
            continue;
        }
        let old_rel = name_of(old);
        let new_rel = (parent_of(new) == new_folder).then(|| name_of(new));
        if new_rel == Some(old_rel) {
            continue;
        }
        let taken = |i: usize| edits.iter().any(|(j, _)| *j == i);
        let exact = items
            .iter()
            .enumerate()
            .find(|(i, it)| !taken(*i) && it.text.as_deref() == Some(old_rel));
        let (index, bare) = match exact {
            Some((i, _)) => (i, false),
            None if is_note => match items
                .iter()
                .enumerate()
                .find(|(i, it)| !taken(*i) && it.text.as_deref() == Some(without_md(old_rel)))
            {
                Some((i, _)) => (i, true),
                None => continue,
            },
            None => continue,
        };
        let replacement = new_rel.map(|n| {
            if bare {
                without_md(n).to_owned()
            } else {
                n.to_owned()
            }
        });
        edits.push((index, replacement));
    }
    if edits.is_empty() {
        return None;
    }
    edits.sort_by_key(|(i, _)| std::cmp::Reverse(*i));
    let mut out = text.to_owned();
    for (i, replacement) in edits {
        let item = &items[i];
        match replacement {
            Some(n) => out.replace_range(item.value_start..item.value_end, &yaml_scalar(&n)),
            None => out.replace_range(item.line_start..item.line_end, ""),
        }
    }
    Some(out)
}
