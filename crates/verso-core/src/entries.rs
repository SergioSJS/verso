//! The folder's entries: listing, resolving and labelling them, renaming and
//! binning a file or a folder (its folder note following), and the lists the
//! window shows.

use super::*;

impl Workspace {
    /// Every entry of the folder as the last walk saw it — notes, other
    /// files, folders and placeholders — with size and date: what a
    /// folder listing shows and sorts by.
    #[must_use]
    pub fn entries(&self) -> &[FileEntry] {
        &self.entries
    }

    /// Every label (sticker, color, alias) known to the index (ADR 0060, S1).
    pub fn labels(
        &self,
    ) -> Result<std::collections::HashMap<String, verso_index::EntryLabel>, CoreError> {
        self.index.labels().map_err(CoreError::Index)
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
    pub(crate) fn entry_key(&self, path: &str) -> Result<String, CoreError> {
        Ok(self
            .root
            .confine(Path::new(path))
            .map_err(CoreError::Confined)?
            .to_string_lossy()
            .into_owned())
    }

    /// [`Self::entry_key`] for a path something is to be written, created
    /// or moved at: the folder's data directories, `.verso/layouts/` and
    /// `.verso/bundles/`, are written only through the four folder data
    /// commands, which check the id, the kind's bound and that the text is
    /// one JSON object (ADR 0099 item 2, ADR 0098 item 2). Sync writes them
    /// by `write_bytes`, which does not come through here.
    pub(crate) fn write_key(&self, path: &str) -> Result<String, CoreError> {
        let key = self.entry_key(path)?;
        if crate::folder_data::in_data_dir(&key) {
            return Err(CoreError::FolderData(format!(
                "{key} is written through the folder data commands only"
            )));
        }
        Ok(key)
    }

    /// Where an entry is on disk, for the host to hand to the system's
    /// file manager. The one absolute path that leaves this crate besides
    /// [`Self::folder`]; it goes to the operating system, never across
    /// the contract (ADR 0026 rule 4).
    pub fn absolute(&self, path: &str) -> Result<PathBuf, CoreError> {
        // The key is `/`-joined: pushed part by part, the path takes the
        // OS's separator (`C:\vault\sub\nota.md`, not `…\sub/nota.md`).
        let key = self.entry_key(path)?;
        Ok(key
            .split('/')
            .fold(self.folder.clone(), |at, part| at.join(part)))
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
        let new = self.write_key(to)?;
        // Inside the folder's settings directory a move is the file's
        // alone, never a note's nor the index's; into or out of it, none
        // (ADR 0070).
        let (in_old, in_new) = (
            verso_fs::is_settings_path(&old),
            verso_fs::is_settings_path(&new),
        );
        if in_old || in_new {
            if !(in_old && in_new) {
                return Err(CoreError::Confined(ConfinementError::Hidden));
            }
            let (_, report) = self
                .root
                .rename(Path::new(&old), Path::new(&new))
                .map_err(CoreError::Write)?;
            self.layer_written();
            return Ok(Renamed {
                path: new,
                rewrites: Vec::new(),
                skipped: Vec::new(),
                warnings: report.warnings(),
                also: Vec::new(),
            });
        }
        if !self.dirs.contains(&old) && is_note(&old) {
            return self.rename_note(&old, &new);
        }
        let mv = self.move_of(&old, &new)?;
        self.perform(mv, &old, &new)
    }

    /// Several entries moved into `folder` (`""` the root) at once — a
    /// selection in the tree (ADR 0048, revised 2026-10-07): what they may
    /// change is read before any moves, and the link rewrites come as one
    /// plan over where everything ended. An entry inside a folder also
    /// given goes with that folder; one already in `folder` stays. One the
    /// disk refuses — a name taken there, a folder into itself — stays
    /// where it is, with its reason, and the others move.
    pub fn move_entries(
        &mut self,
        paths: &[String],
        folder: &str,
    ) -> Result<MovedEntries, CoreError> {
        let dest = if folder.is_empty() {
            String::new()
        } else {
            self.write_key(folder)?
        };
        let mut keys = Vec::new();
        for p in paths {
            let key = self.entry_key(p)?;
            if !keys.contains(&key) {
                keys.push(key);
            }
        }
        let folders: Vec<String> = keys
            .iter()
            .filter(|k| self.dirs.contains(*k))
            .cloned()
            .collect();
        let mut parts = Vec::new();
        for key in &keys {
            if folders.iter().any(|f| key.starts_with(&format!("{f}/"))) || parent_of(key) == dest {
                continue;
            }
            let name = key.rsplit('/').next().unwrap_or(key);
            let new = if dest.is_empty() {
                name.to_owned()
            } else {
                format!("{dest}/{name}")
            };
            let mv = self.move_of(key, &new)?;
            parts.push(((key.clone(), new), mv));
        }
        if parts.is_empty() {
            return Ok(MovedEntries::default());
        }
        let done = self.perform_many(parts)?;
        Ok(MovedEntries {
            moved: done.moved,
            refused: done.refused,
            rewrites: done.rewrites,
            skipped: done.skipped,
            warnings: done.warnings,
            also: done.also,
        })
    }

    /// Everything that moves when the entry `old` goes to `new`: a note,
    /// another file, or a folder with all it holds — its folder note taking
    /// the folder's new name.
    fn move_of(&self, old: &str, new: &str) -> Result<Move, CoreError> {
        if self.dirs.contains(old) {
            return self.folder_move(old, new);
        }
        Ok(if is_note(old) {
            Move {
                notes: vec![(old.to_owned(), new.to_owned())],
                ..Move::default()
            }
        } else {
            Move {
                files: vec![(old.to_owned(), new.to_owned())],
                ..Move::default()
            }
        })
    }

    fn folder_move(&self, old: &str, new: &str) -> Result<Move, CoreError> {
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
        let mut folders = vec![(old.to_owned(), new.to_owned())];
        for d in &self.dirs {
            if let Some(rest) = d.strip_prefix(&prefix) {
                folders.push((d.clone(), format!("{new}/{rest}")));
            }
        }
        let mut notes = notes;
        let then = self.folder_note_follows(old, new, &mut notes)?;
        Ok(Move {
            notes,
            files,
            folders,
            then,
        })
    }

    /// The folder's note takes the folder's new name (the maintainer,
    /// 2026-10-02): `old/old.md` becomes `new/new.md`, and `old.md` beside
    /// the folder becomes `new.md`. `notes` is the move's map, made to say
    /// so; the renames this asks for come back, to run after the folder's.
    /// A note named by the setting keeps its name, and a note already at
    /// the new name is left alone.
    fn folder_note_follows(
        &self,
        old: &str,
        new: &str,
        notes: &mut Vec<(String, String)>,
    ) -> Result<Vec<(String, String)>, CoreError> {
        let all = self.index.notes().map_err(CoreError::Index)?;
        let taken = |path: &str, mine: &str| {
            all.iter()
                .any(|n| same_name(n, path) && !same_name(n, mine))
        };
        let (old_name, new_name) = (name_of(old), name_of(new));
        let mut then = Vec::new();
        if old_name != new_name {
            let inside = format!("{old}/{old_name}.md");
            if let Some(entry) = notes.iter_mut().find(|(o, _)| same_name(o, &inside)) {
                let stem = without_md(name_of(&entry.0)).to_owned();
                let wanted = format!("{new}/{new_name}.md");
                if same_name(&stem, old_name) && !taken(&format!("{old}/{new_name}.md"), &entry.0) {
                    then.push((entry.1.clone(), wanted.clone()));
                    entry.1 = wanted;
                }
            }
        }
        let beside = format!("{old}.md");
        if let Some(found) = all.iter().find(|n| same_name(n, &beside)) {
            let wanted = format!("{new}.md");
            if !taken(&wanted, found) {
                then.push((found.clone(), wanted.clone()));
                notes.push((found.clone(), wanted));
            }
        }
        Ok(then)
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
            match self.index.sources() {
                Ok(notes) => {
                    for note in notes.iter().filter(|n| n.starts_with(&prefix)) {
                        if let Err(e) = self.index.remove(note) {
                            warnings.push(format!("the index could not forget {note}: {e}"));
                        }
                    }
                }
                Err(e) => warnings.push(format!("the index could not forget {key}: {e}")),
            }
            self.refresh(&mut warnings);
        } else {
            self.forget_file(&key);
        }
        if verso_fs::is_settings_path(&key) {
            self.layer_written();
        }
        Ok(Trashed {
            path: gone.to_string_lossy().into_owned(),
            original: key,
            warnings,
        })
    }

    /// The notes that are web pages (a `url` property), with the address.
    pub fn web_notes(&self) -> Result<Vec<(String, String)>, CoreError> {
        self.index.web_notes().map_err(CoreError::Index)
    }

    /// Every `^id` block of the folder's notes of the given kinds (all
    /// when none is given), bounded: what the oracle looks for tables in.
    pub fn block_ids(
        &self,
        kinds: &[crate::IndexBlockKind],
    ) -> Result<crate::IndexBlockList, CoreError> {
        self.index.folder_blocks(kinds).map_err(CoreError::Index)
    }

    /// Every resolved link of the vault, source then target: the graph.
    pub fn graph(&self) -> Result<Vec<(String, String)>, CoreError> {
        self.index.graph().map_err(CoreError::Index)
    }

    /// Every link no note and no file answers to, as a pair of the note it
    /// is written in and the name it points at: what the graph can show as
    /// notes that do not exist yet (spec Q14, decision B). Once per note and
    /// name, a name spelled several ways shown under its smallest spelling.
    /// An empty target (`[[#Heading]]`) and one that cannot name a note
    /// (`[[nota/]]`) are no missing note.
    pub fn graph_unresolved(&self) -> Result<Vec<(String, String)>, CoreError> {
        let links = self.index.all_links().map_err(CoreError::Index)?;
        Ok(self.missing_of(links))
    }

    pub(crate) fn missing_of(&self, links: Vec<verso_index::VaultLink>) -> Vec<(String, String)> {
        let mut spelling: std::collections::BTreeMap<String, String> = Default::default();
        let mut pairs: std::collections::BTreeSet<(String, String)> = Default::default();
        for l in links {
            let Some(key) = verso_index::target_key(&l.target).filter(|k| !k.is_empty()) else {
                continue;
            };
            if l.resolved.is_some() || self.resolve_file(&l.from, &l.target).is_some() {
                continue;
            }
            let shown = spelling
                .entry(key.clone())
                .or_insert_with(|| l.target.clone());
            if l.target < *shown {
                *shown = l.target.clone();
            }
            pairs.insert((l.from, key));
        }
        pairs
            .into_iter()
            .map(|(from, key)| {
                let target = spelling.get(&key).cloned().unwrap_or_default();
                (from, target)
            })
            .collect()
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

    /// The file `relative` names, when its content is only in the cloud,
    /// for the window to fetch when the user opens it (ADR 0043, amended
    /// on 2026-09-30); `None` otherwise. Every read here still refuses a
    /// placeholder: fetching is a separate step, taken only for an opening,
    /// never by the index, the watcher or a scan of every note.
    pub fn placeholder(
        &mut self,
        relative: &str,
    ) -> Result<Option<verso_fs::Placeholder>, CoreError> {
        let confined = self
            .root
            .confine(Path::new(relative))
            .map_err(CoreError::Confined)?;
        let handle = self.root.handle(&confined).map_err(CoreError::Confined)?;
        self.root.placeholder(handle).map_err(CoreError::Read)
    }

    /// The make.md focuses file (`.space/waypoints.json`), when its content
    /// is only in the cloud, for the window to fetch on the person's click
    /// (ADR 0043, amended on 2026-10-27). Named without a path: `placeholder`
    /// refuses it, as it refuses every hidden entry.
    pub fn waypoints_placeholder(&self) -> Result<Option<verso_fs::Placeholder>, CoreError> {
        self.root.waypoints_placeholder().map_err(CoreError::Read)
    }

    /// The bytes the disk under the folder can still take: what a download
    /// from the cloud is checked against before it starts (ADR 0043,
    /// decided on 2026-10-27).
    pub fn free_space(&self) -> Result<u64, CoreError> {
        self.root.free_space().map_err(CoreError::Folder)
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

    /// The notes whose `type:` is `name` — case ignored, as a type's name
    /// is compared (ADR 0052 point 1) — in path order, whether a schema
    /// types them or not: what `type:` searches.
    pub fn notes_of_type(&self, name: &str) -> Result<Vec<String>, CoreError> {
        self.index
            .notes_of_type(&verso_index::type_key(name))
            .map_err(CoreError::Index)
    }

    /// Every board (`.canvas`) the index knows, in path order.
    pub fn boards(&self) -> Result<Vec<String>, CoreError> {
        Ok(self
            .index
            .sources()
            .map_err(CoreError::Index)?
            .into_iter()
            .filter(|p| is_canvas(p))
            .collect())
    }
}

/// The folders `note` is the folder note of, by its path alone: inside
/// the folder, named after it or as the setting says, and beside it
/// (ADR 0060 D3, D12). The root has none.
pub(crate) fn folders_of_note(note: &str, configured: &str, root_name: &str) -> Vec<String> {
    if !note.to_ascii_lowercase().ends_with(".md") {
        return Vec::new();
    }
    let (parent, file) = note.rsplit_once('/').unwrap_or(("", note));
    let stem = without_md(file);
    let mut out = Vec::new();
    let own_name = if parent.is_empty() {
        root_name
    } else {
        name_of(parent)
    };
    if same_name(stem, own_name) || (!configured.is_empty() && same_name(stem, configured)) {
        out.push(parent.to_owned());
    }
    out.push(if parent.is_empty() {
        stem.to_owned()
    } else {
        format!("{parent}/{stem}")
    });
    out
}

/// Two names alike but for case, as the window compares them.
pub(crate) fn same_name(a: &str, b: &str) -> bool {
    a.to_lowercase() == b.to_lowercase()
}

/// The parent folder of a relative path; the root is "".
pub(crate) fn parent_of(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(d, _)| d)
}
