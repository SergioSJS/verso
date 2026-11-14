// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The folder's layer of settings (ADR 0070 items 1–2, built 2026-10-12):
//! what anyone opening the folder should find the same — its bookmarks,
//! the walk's rules (ADR 0044's ignored paths: the build folders and the
//! `.gitignore` files) and its folder note's name — kept inside it, in
//! `.verso/settings.json`, so that it travels with the folder through any
//! sync. The machine's layer (the index, its sidecar, the log, the
//! window's layout) stays in the configuration directory (ADR 0011).
//!
//! The file is written only by a change: opening, walking and reading a
//! folder never create it (invariant 7; ADR 0011 rule 1 — no folder gets a
//! directory it did not ask for). Its first write is a create that fails
//! when something already stands there, so the machine's copy moves into
//! a folder once and never over the copy another machine synced in. Every
//! later write goes over the version that was read (invariant 11),
//! atomically, through `verso-fs` (invariant 9).
//!
//! The format: one JSON object, keys sorted, two spaces of indentation, a
//! final newline — so a sync tool's diff of it is one line per change.
//! Keys this version does not know are kept as they are on every write.
//!
//! ```json
//! {
//!   "bookmarks": [
//!     "Notas/Taverna.md"
//!   ],
//!   "folderNoteName": "README",
//!   "ignoreBuildDirs": true,
//!   "respectGitignore": false
//! }
//! ```
//!
//! The periodic notes' settings live there too, under `periodic` (ADR
//! 0093 item 4; `periodic.rs`), and the oracle's odds and spark words
//! under `oracle` (ADR 0102 item 2; `oracle.rs`), and the theme the folder
//! suggests under `recommendedTheme` (ADR 0100 item 4): one JSON object the
//! window checks, offered to the person and never applied by itself.
//!
//! Which value applies: when the folder has a usable settings file, the
//! file's — a key it does not set takes the default (no bookmarks, the
//! build folders and `.gitignore` honoured, a folder's note named after
//! it); when it has none, or one that cannot be read now (a placeholder of
//! on-demand storage, not JSON), this machine's, as before.

use std::collections::BTreeMap;
use std::path::Path;

use serde_json::Value;
use verso_fs::{SETTINGS_FILE, WalkRules, is_settings_path};

use super::*;

const BOOKMARKS: &str = "bookmarks";
const FOLDER_NOTE_NAME: &str = "folderNoteName";
const IGNORE_BUILD_DIRS: &str = "ignoreBuildDirs";
const RESPECT_GITIGNORE: &str = "respectGitignore";
const RECOMMENDED_THEME: &str = "recommendedTheme";
/// The most a suggested theme's JSON text may be, in bytes (ADR 0100 item 6).
const RECOMMENDED_THEME_MOST: usize = 16 * 1024;

/// The folder's settings a file holds, or a change to them: `None` is
/// "not set here".
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FolderSettings {
    /// Paths relative to the folder, joined by `/`.
    pub bookmarks: Option<Vec<String>>,
    /// A plain file name without `.md`; empty: a folder's note is named
    /// after the folder.
    pub folder_note_name: Option<String>,
    pub ignore_build_dirs: Option<bool>,
    pub respect_gitignore: Option<bool>,
    /// The periodic notes' settings (ADR 0093 item 4).
    pub periodic: Option<super::periodic::Periodic>,
    /// The oracle's odds and spark words (ADR 0102 item 2).
    pub oracle: Option<super::oracle::Oracle>,
    /// The theme the folder suggests (ADR 0100 item 4): the JSON text of one
    /// object, up to 16 KiB. The window validates its tokens; the core only
    /// keeps it well-formed.
    pub recommended_theme: Option<String>,
}

/// Why a settings file that stands in the folder is not used now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LayerProblem {
    /// A placeholder of on-demand storage: present, content in the cloud
    /// (ADR 0043). Never written over, never taken for absent.
    Unavailable,
    /// Not a JSON object: kept as it is, never written over.
    Invalid,
}

/// The folder's layer as read now.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FolderLayer {
    /// A settings file stands in the folder (a placeholder counts).
    pub exists: bool,
    pub problem: Option<LayerProblem>,
    /// What was read, for the next write to hand back (invariant 11).
    pub revision: Option<String>,
    /// What the file sets; empty when it does not exist or is not usable.
    pub settings: FolderSettings,
    /// What the write that answered this could not confirm, one line
    /// each (a directory's `fsync`, a permission not kept); empty after a
    /// read.
    pub warnings: Vec<String>,
}

/// What the workspace keeps of the layer between reads.
#[derive(Debug, Default)]
pub(crate) struct Layer {
    /// The machine's walk rules and folder note name, handed in by the
    /// window (`set_walk_rules`, `set_folder_note_name`): what applies
    /// when the folder has no usable settings file.
    machine_rules: WalkRules,
    machine_note_name: String,
    read: FolderLayer,
    /// The settings directory's entries, for sync (ADR 0079 item 2).
    entries: Vec<FileEntry>,
    /// The settings file's content hash when last read.
    hash: Option<u64>,
    /// Changes found by a narrowed run that turned into a walk, or by a
    /// write of this core: the next report says them.
    pending: (Vec<String>, Vec<String>),
    /// A write of this core changed the walk's rules that apply: the next
    /// batch of the watch walks the folder, whatever its paths.
    rewalk: bool,
}

/// What a refresh of the layer found.
#[derive(Debug, Default)]
pub(crate) struct LayerRefresh {
    /// Entries of `.verso/` new or changed, and gone.
    pub changed: Vec<String>,
    pub gone: Vec<String>,
    /// The walk's rules that apply are not those of the last walk.
    pub rules_changed: bool,
}

/// Whether a bookmark's path may be kept, or why not: relative and
/// `/`-joined as the file keeps it — no empty or `.` part, no `..`, no
/// leading `/`, no drive (`C:`) as its first part, no NUL. A bookmark names
/// an entry that exists, made on any system and synced here, and ADR 0070
/// item 3 never refuses an existing entry — only a name Verso makes — so
/// the names Windows would not let Verso make (`Reunião: pauta.md`, a `\`
/// on macOS, which is part of the name, item 4) are kept, on every system.
/// Checked as text, never through the OS's path rules.
pub(crate) fn bookmark_path(p: &str) -> Result<(), ConfinementError> {
    if p.is_empty() {
        return Err(ConfinementError::Empty);
    }
    if p.contains('\0') {
        return Err(ConfinementError::NulByte);
    }
    if p.starts_with('/') {
        return Err(ConfinementError::Absolute);
    }
    let mut parts = p.split('/').peekable();
    if let Some(first) = parts.peek()
        && first.len() == 2
        && first.ends_with(':')
        && first.starts_with(|c: char| c.is_ascii_alphabetic())
    {
        return Err(ConfinementError::Absolute);
    }
    for part in parts {
        match part {
            ".." => return Err(ConfinementError::ParentComponent),
            "" | "." => return Err(ConfinementError::Empty),
            _ => {}
        }
    }
    Ok(())
}

fn plain_path(p: &str) -> bool {
    bookmark_path(p).is_ok()
}

/// The folder note name as the core applies it: trimmed, without `.md`;
/// a separator, `.` or `..` make it empty.
fn plain_name(name: &str) -> String {
    let name = without_md(name.trim());
    if name.contains(['/', '\\']) || name == "." || name == ".." {
        String::new()
    } else {
        name.to_owned()
    }
}

/// The file's keys as this version reads them; a value of the wrong kind
/// is not set, a bookmark that is not a plain relative path is dropped
/// from what is answered (the file keeps it until the next write of the
/// bookmarks).
fn settings_of(map: &serde_json::Map<String, Value>) -> FolderSettings {
    FolderSettings {
        bookmarks: map.get(BOOKMARKS).and_then(Value::as_array).map(|list| {
            list.iter()
                .filter_map(Value::as_str)
                .filter(|p| plain_path(p))
                .map(str::to_owned)
                .collect()
        }),
        folder_note_name: map
            .get(FOLDER_NOTE_NAME)
            .and_then(Value::as_str)
            .map(plain_name),
        ignore_build_dirs: map.get(IGNORE_BUILD_DIRS).and_then(Value::as_bool),
        respect_gitignore: map.get(RESPECT_GITIGNORE).and_then(Value::as_bool),
        periodic: super::periodic::read(map),
        oracle: super::oracle::read(map),
        recommended_theme: map
            .get(RECOMMENDED_THEME)
            .filter(|v| v.is_object())
            .and_then(|v| serde_json::to_string(v).ok())
            .filter(|text| text.len() <= RECOMMENDED_THEME_MOST),
    }
}

fn parse(bytes: &[u8]) -> Option<serde_json::Map<String, Value>> {
    match serde_json::from_slice::<Value>(bytes) {
        Ok(Value::Object(map)) => Some(map),
        _ => None,
    }
}

/// The file's bytes: keys sorted whatever the JSON map's own order,
/// two-space indentation, a final newline.
fn render(map: &serde_json::Map<String, Value>) -> Vec<u8> {
    let sorted: BTreeMap<&String, &Value> = map.iter().collect();
    let mut out = serde_json::to_vec_pretty(&sorted).unwrap_or_else(|_| b"{}".to_vec());
    out.push(b'\n');
    out
}

/// `change` laid over `map`: what it sets replaces what was there.
fn apply(map: &mut serde_json::Map<String, Value>, change: &FolderSettings) {
    if let Some(list) = &change.bookmarks {
        map.insert(
            BOOKMARKS.to_owned(),
            Value::Array(list.iter().cloned().map(Value::String).collect()),
        );
    }
    if let Some(name) = &change.folder_note_name {
        map.insert(FOLDER_NOTE_NAME.to_owned(), Value::String(plain_name(name)));
    }
    if let Some(on) = change.ignore_build_dirs {
        map.insert(IGNORE_BUILD_DIRS.to_owned(), Value::Bool(on));
    }
    if let Some(on) = change.respect_gitignore {
        map.insert(RESPECT_GITIGNORE.to_owned(), Value::Bool(on));
    }
    if let Some(periodic) = &change.periodic {
        super::periodic::apply(map, periodic);
    }
    if let Some(oracle) = &change.oracle {
        super::oracle::apply(map, oracle);
    }
    if let Some(text) = &change.recommended_theme {
        match serde_json::from_str::<Value>(text) {
            Ok(value @ Value::Object(_)) => {
                map.insert(RECOMMENDED_THEME.to_owned(), value);
            }
            // Checked before; an empty text takes the suggestion away.
            _ => {
                map.remove(RECOMMENDED_THEME);
            }
        }
    }
}

impl Workspace {
    /// The folder's layer as it is on disk now (ADR 0070): whether the
    /// settings file exists, what it sets, and its revision. Reading never
    /// creates or rewrites it.
    pub fn folder_settings(&mut self) -> FolderLayer {
        let _ = self.refresh_layer();
        self.layer.read.clone()
    }

    /// Change the folder's settings: what `change` sets replaces what the
    /// file says, every other key kept. With no `revision` the file must
    /// not exist yet — the first change, or the machine's copy moving in —
    /// and `WriteError::Exists` says another machine's came first; with
    /// one, it is written over that version only (`WriteError::Changed`
    /// otherwise, nothing written). A bookmark that is not a plain path
    /// relative to the folder refuses the whole change. The walk's rules
    /// it changes apply from the next walk: the caller reindexes.
    pub fn set_folder_settings(
        &mut self,
        change: &FolderSettings,
        revision: Option<&str>,
    ) -> Result<FolderLayer, CoreError> {
        for bookmark in change.bookmarks.iter().flatten() {
            bookmark_path(bookmark).map_err(CoreError::Confined)?;
        }
        if let Some(periodic) = &change.periodic {
            super::periodic::check(periodic)?;
        }
        if let Some(oracle) = &change.oracle {
            super::oracle::check(oracle)?;
        }
        if let Some(text) = &change.recommended_theme
            && !text.is_empty()
        {
            let well_formed = text.len() <= RECOMMENDED_THEME_MOST
                && matches!(serde_json::from_str::<Value>(text), Ok(Value::Object(_)));
            if !well_formed {
                return Err(CoreError::FolderSettings(format!(
                    "a suggested theme is one JSON object of at most {RECOMMENDED_THEME_MOST} bytes"
                )));
            }
        }
        let file = Path::new(SETTINGS_FILE);
        let warnings = match revision {
            None => {
                let mut map = serde_json::Map::new();
                apply(&mut map, change);
                let (_, report) = self
                    .root
                    .create(file, &render(&map))
                    .map_err(CoreError::Write)?;
                report.warnings()
            }
            Some(revision) => {
                let expected = Self::decode_revision(revision)?;
                let handle = self.root.handle(file).map_err(CoreError::Confined)?;
                let (bytes, _) = self.root.read(handle).map_err(CoreError::Read)?;
                let mut map = parse(&bytes).ok_or_else(|| {
                    CoreError::FolderSettings(
                        "the folder's settings file is not a JSON object: it is kept as it is"
                            .to_owned(),
                    )
                })?;
                apply(&mut map, change);
                let report = self
                    .root
                    .write(handle, &render(&map), &expected)
                    .map_err(CoreError::Write)?;
                self.write_warnings(&report)
            }
        };
        self.layer_written();
        let mut warnings = warnings;
        warnings.extend(self.layer.read.warnings.iter().cloned());
        Ok(FolderLayer {
            warnings,
            ..self.layer.read.clone()
        })
    }

    /// The entries of `.verso/` as last listed: the files sync carries
    /// beside [`Workspace::entries`], which never lists them (ADR 0079
    /// item 2).
    #[must_use]
    pub fn settings_entries(&self) -> &[FileEntry] {
        &self.layer.entries
    }

    /// The walk's rules of this machine, from outside the tree: what
    /// applies while the folder has no usable settings file of its own.
    /// Takes effect on the next index run; the caller reindexes.
    pub fn set_walk_rules(&mut self, rules: WalkRules) {
        self.layer.machine_rules = rules;
        self.apply_layer();
    }

    /// The folder note name setting of this machine (ADR 0060 D12): what
    /// applies while the folder has no usable settings file. A name that
    /// is not a plain file name — a separator, `.` or `..` — is taken as
    /// empty: a folder's note is then named after it.
    pub fn set_folder_note_name(&mut self, name: &str) {
        self.layer.machine_note_name = plain_name(name);
        self.apply_layer();
    }

    /// The settings that apply, from the folder's file or this machine's.
    fn apply_layer(&mut self) {
        let usable = self.layer.read.exists && self.layer.read.problem.is_none();
        let (rules, name) = if usable {
            let s = &self.layer.read.settings;
            let default = WalkRules::default();
            (
                WalkRules {
                    builtin_ignores: s.ignore_build_dirs.unwrap_or(default.builtin_ignores),
                    gitignore: s.respect_gitignore.unwrap_or(default.gitignore),
                },
                s.folder_note_name.clone().unwrap_or_default(),
            )
        } else {
            (
                self.layer.machine_rules,
                self.layer.machine_note_name.clone(),
            )
        };
        self.root.set_rules(rules);
        self.folder_note_name = name;
    }

    /// `.verso/` listed again and the settings file read again: what
    /// changed in it since the last time, and whether the walk's rules
    /// that apply changed with it. Nothing is created or written.
    pub(crate) fn refresh_layer(&mut self) -> LayerRefresh {
        let rules_before = self.root.rules();
        let listed = match self.root.settings_walk() {
            Ok(listed) => listed,
            // Not readable now: what was known stands, never a deletion.
            Err(_) => return LayerRefresh::default(),
        };
        let entries: Vec<FileEntry> = listed
            .iter()
            .map(|e| FileEntry {
                path: e.relative.to_string_lossy().into_owned(),
                kind: match e.kind {
                    EntryKind::Placeholder { .. } => FileKind::Placeholder,
                    _ => FileKind::File,
                },
                len: e.len,
                modified: e.modified.map_or(0, seconds_since_epoch),
                modified_nanos: e.modified.map_or(0, nanos_since_epoch),
                created: e.created.map_or(0, seconds_since_epoch),
            })
            .collect();
        let mut found = LayerRefresh::default();
        for e in &entries {
            let same = self.layer.entries.iter().any(|o| {
                o.path == e.path && o.len == e.len && o.modified == e.modified && o.kind == e.kind
            });
            if !same && e.path != SETTINGS_FILE {
                found.changed.push(e.path.clone());
            }
        }
        for o in &self.layer.entries {
            if !entries.iter().any(|e| e.path == o.path) {
                found.gone.push(o.path.clone());
            }
        }
        let file = listed
            .iter()
            .find(|e| e.relative == Path::new(SETTINGS_FILE));
        let (read, hash) = match file {
            None => (FolderLayer::default(), None),
            Some(e) => match self.root.read(e.handle) {
                Ok((bytes, stamp)) => {
                    let revision = Some(revision::encode(&stamp));
                    match parse(&bytes) {
                        Some(map) => (
                            FolderLayer {
                                exists: true,
                                problem: None,
                                revision,
                                settings: settings_of(&map),
                                // What the file holds that is not applied.
                                warnings: super::oracle::problems(&map),
                            },
                            Some(stamp.hash),
                        ),
                        None => (
                            FolderLayer {
                                exists: true,
                                problem: Some(LayerProblem::Invalid),
                                revision,
                                settings: FolderSettings::default(),
                                warnings: Vec::new(),
                            },
                            Some(stamp.hash),
                        ),
                    }
                }
                Err(ReadError::Unavailable) => (
                    FolderLayer {
                        exists: true,
                        problem: Some(LayerProblem::Unavailable),
                        ..FolderLayer::default()
                    },
                    None,
                ),
                // Not readable now (a permission, a race with its own
                // replacement): as it was.
                Err(_) => (self.layer.read.clone(), self.layer.hash),
            },
        };
        let had = self.layer.read.exists;
        if read.exists && (hash != self.layer.hash || read.problem != self.layer.read.problem) {
            found.changed.push(SETTINGS_FILE.to_owned());
        } else if had && !read.exists && !found.gone.iter().any(|g| g == SETTINGS_FILE) {
            found.gone.push(SETTINGS_FILE.to_owned());
        }
        self.layer.entries = entries;
        self.layer.read = read;
        self.layer.hash = hash;
        self.apply_layer();
        found.rules_changed = self.root.rules() != rules_before;
        found
    }

    /// The paths of `.verso/` a narrowed run was handed: the layer read
    /// again, what changed reported; `false` when the walk's rules that
    /// apply changed, so the caller walks — what the walk lists depends
    /// on them — and the walk reports the changes.
    pub(crate) fn narrow_layer(&mut self, report: &mut IndexReport) -> bool {
        let found = self.refresh_layer();
        if found.rules_changed || self.layer.rewalk {
            self.layer.pending.0.extend(found.changed);
            self.layer.pending.1.extend(found.gone);
            return false;
        }
        let (changed, gone) = std::mem::take(&mut self.layer.pending);
        report
            .changed
            .extend(changed.into_iter().chain(found.changed));
        report.gone.extend(gone.into_iter().chain(found.gone));
        true
    }

    /// The layer read again at the start of a walk, before it lists
    /// anything — the walk's rules may be the folder's —, and what changed
    /// in it since, with what a narrowed run left pending: changed, gone.
    pub(crate) fn walk_layer(&mut self) -> (Vec<String>, Vec<String>) {
        self.layer.rewalk = false;
        let found = self.refresh_layer();
        let (mut changed, mut gone) = std::mem::take(&mut self.layer.pending);
        changed.extend(found.changed);
        gone.extend(found.gone);
        (changed, gone)
    }

    /// After a write, a deletion or a move inside `.verso/` by this core:
    /// the layer read again, and what changed kept for the next report.
    pub(crate) fn layer_written(&mut self) {
        let found = self.refresh_layer();
        // What the walk lists depends on the rules: the listing and the
        // index follow at the next batch of the watch, which walks.
        self.layer.rewalk |= found.rules_changed;
        self.layer.pending.0.extend(found.changed);
        self.layer.pending.1.extend(found.gone);
    }

    /// Whether `path`, confined, is in the folder's settings directory:
    /// never a note, never in the index (ADR 0070).
    pub(crate) fn refuse_settings(path: &str) -> Result<(), CoreError> {
        if is_settings_path(path) {
            return Err(CoreError::Confined(ConfinementError::Hidden));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_file_is_sorted_indented_and_ends_in_a_newline_and_keeps_unknown_keys() {
        let mut map = parse(br#"{"zeta": {"b": 1, "a": 2}, "bookmarks": ["x.md"]}"#).unwrap();
        apply(
            &mut map,
            &FolderSettings {
                folder_note_name: Some(" README.md ".to_owned()),
                respect_gitignore: Some(false),
                ..FolderSettings::default()
            },
        );
        let text = String::from_utf8(render(&map)).unwrap();
        assert_eq!(
            text,
            "{\n  \"bookmarks\": [\n    \"x.md\"\n  ],\n  \"folderNoteName\": \"README\",\n  \"respectGitignore\": false,\n  \"zeta\": {\n    \"a\": 2,\n    \"b\": 1\n  }\n}\n"
        );
    }

    #[test]
    fn a_bookmark_is_a_plain_relative_path_or_it_is_not_read() {
        // An existing entry is kept whatever system made it (ADR 0070
        // item 3): Windows' new-name rules do not apply to a bookmark.
        for good in [
            "a.md",
            "pasta/b.md",
            "Reunião: pauta.md",
            "a\\b.md",
            "CON.md",
            "nota..md",
        ] {
            assert!(plain_path(good), "{good}");
        }
        for bad in [
            "/etc/passwd",
            "../fora.md",
            "a/../b.md",
            "./a.md",
            "a//b.md",
            "",
            "a/",
            "C:/x.md",
            "a\0b.md",
        ] {
            assert!(!plain_path(bad), "{bad}");
        }
        let map =
            parse(br#"{"bookmarks": ["ok.md", "/abs.md", 3, "../x.md"], "ignoreBuildDirs": "no"}"#)
                .unwrap();
        let s = settings_of(&map);
        assert_eq!(s.bookmarks, Some(vec!["ok.md".to_owned()]));
        assert_eq!(s.ignore_build_dirs, None);
    }
}
