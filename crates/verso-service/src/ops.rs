// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The contract's commands over an open folder, each written once: the
//! desktop host calls them as functions from its Tauri commands, the
//! server by name with JSON arguments ([`dispatch`]). Each says whether it
//! only reads the folder or writes it, which the server checks against
//! the member's role before the core acts (ADR 0074 item 11).
//!
//! The arguments arrive as the window sends them: an object whose keys
//! are the parameters' names in camelCase, as Tauri's own commands take
//! them.

use verso_contract::{
    Backlink, BaseColumn, BaseError, BaseGroup, BaseProblem, BaseProblemKind, BaseQuery,
    BaseResult, BaseRow, BaseView, BlockKind, ContractError, Edge, EntryLabel, ErrorKind,
    FileEntry, FileKind, Focus, FocusesSummary, FolderBlock, FolderBlocks, FolderDataEntry,
    FolderDataFile, FolderDataKind, FolderDataList, FolderDataWritten, FolderLayer, FolderSettings,
    FolderSpace, Hit, Link, MapInfo, MapState, Mention, Mentions, MissingLink, MovedEntries,
    NoteText, ObsidianPeriodic, OracleSettings, OracleSparks, PeriodSettings, PeriodicSettings,
    RefusedEntry, Renamed, Tag, TextFile, Trashed, WebNote, Written,
};
use verso_core::{CoreError, Workspace};

use crate::convert::{
    base_cell, count, note_out, renamed_out, text_out, to_contract_focuses_summary, to_core_focus,
    trashed_out,
};

/// Whether a command only reads the folder or changes it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Read,
    Write,
}

/// A command's failure: the core's, or one the command says in the
/// contract's own words.
#[derive(Debug)]
pub enum OpError {
    Core(CoreError),
    Contract(ContractError),
}

impl From<CoreError> for OpError {
    fn from(e: CoreError) -> Self {
        Self::Core(e)
    }
}

impl From<ContractError> for OpError {
    fn from(e: ContractError) -> Self {
        Self::Contract(e)
    }
}

impl OpError {
    #[must_use]
    pub fn into_contract(self) -> ContractError {
        match self {
            Self::Core(e) => crate::convert(e),
            Self::Contract(e) => e,
        }
    }

    pub(crate) fn unknown(name: &str) -> Self {
        Self::Contract(ContractError {
            kind: ErrorKind::Refused,
            message: format!("no such command: {name}"),
        })
    }
}

fn bad_arguments(name: &str, e: &serde_json::Error) -> OpError {
    OpError::Contract(ContractError {
        kind: ErrorKind::Refused,
        message: format!("{name}: {e}"),
    })
}

fn to_json<T: serde::Serialize>(value: T) -> Result<serde_json::Value, OpError> {
    serde_json::to_value(value).map_err(|e| OpError::Contract(crate::failed(e.to_string())))
}

/// Each command once: a function `name(ws, args…)`, its line in
/// [`FOLDER_COMMANDS`], and its arm in [`dispatch`].
macro_rules! ops {
    ($(
        $(#[$doc:meta])*
        $access:ident fn $name:ident($ws:ident $(, $arg:ident : $ty:ty)* $(,)?) -> $out:ty $body:block
    )*) => {
        $(
            $(#[$doc])*
            pub fn $name($ws: &mut Workspace $(, $arg: $ty)*) -> Result<$out, OpError> $body
        )*

        /// Every command of an open folder, with what it does to it.
        pub const FOLDER_COMMANDS: &[(&str, Access)] = &[$((stringify!($name), Access::$access)),*];

        /// Run the command `name` with its JSON arguments; `None` when it is
        /// not a command of the folder.
        pub fn dispatch(
            ws: &mut Workspace,
            name: &str,
            args: serde_json::Value,
        ) -> Option<Result<serde_json::Value, OpError>> {
            // A command without arguments may be sent `null`.
            let args = if args.is_null() { serde_json::Value::Object(Default::default()) } else { args };
            match name {
                $(stringify!($name) => Some((|| {
                    #[derive(serde::Deserialize)]
                    #[serde(rename_all = "camelCase")]
                    struct Args { $($arg: $ty),* }
                    let Args { $($arg),* } = serde_json::from_value(args)
                        .map_err(|e| bad_arguments(name, &e))?;
                    to_json($name(ws $(, $arg)*)?)
                })()),)*
                _ => None,
            }
        }
    };
}

/// What command `name` does to the folder; `None` when it is not one.
#[must_use]
pub fn access(name: &str) -> Option<Access> {
    FOLDER_COMMANDS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, a)| *a)
}

ops! {
    /// Every note the index knows, by path relative to the folder.
    Read fn list_notes(ws) -> Vec<String> {
        Ok(ws.notes()?)
    }

    /// A note's text as it is on disk, with what the index knows of it;
    /// `not_text` when its bytes are not UTF-8.
    Read fn read_note(ws, path: String) -> NoteText {
        Ok(note_out(ws.read_note(&path)?))
    }

    /// The notes whose `type:` is `name`, case ignored (ADR 0052).
    Read fn notes_of_type(ws, name: String) -> Vec<String> {
        Ok(ws.notes_of_type(&name)?)
    }

    /// Full-text search: every word must occur, accents and case ignored.
    Read fn search(ws, words: String, limit: u32) -> Vec<Hit> {
        Ok(hits_out(ws.search(&words, search_limit(limit))?))
    }

    /// The links a note makes; empty when the index does not know it.
    Read fn links(ws, path: String) -> Vec<Link> {
        Ok(links_out(ws.links(&path)?))
    }

    /// The notes that link to this one; empty when the index does not know
    /// it.
    Read fn backlinks(ws, path: String) -> Vec<Backlink> {
        Ok(backlinks_out(ws.backlinks(&path)?))
    }

    /// The note's unlinked mentions, as occurrences (ADR 0089 item 1). It
    /// reads: the link is written by the window, as any edit, over the
    /// revision it read (invariant 11).
    Read fn unlinked_mentions(ws, path: String) -> Mentions {
        Ok(mentions_out(ws.unlinked_mentions(&path)?))
    }

    /// Write a note's text over the revision that was read — atomically, no
    /// normalization — and index it; `changed` when the file moved on
    /// meanwhile (invariant 11).
    Write fn write_note(ws, path: String, text: String, revision: String) -> Written {
        let w = ws.write_note(&path, &text, &revision)?;
        Ok(Written {
            note: note_out(w.note),
            warnings: w.warnings,
        })
    }

    /// Every regular file of the folder that is not a note.
    Read fn list_files(ws) -> Vec<String> {
        Ok(ws.files())
    }

    /// Every tag of the folder, by count, with the notes that carry it.
    Read fn list_tags(ws) -> Vec<Tag> {
        Ok(tags_out(ws.tags()?))
    }

    /// Every block with an `^id` in the folder's notes, of the kinds asked
    /// (all when none): the oracle finds its tables here (ADR 0102 item 3).
    Read fn list_block_ids(ws, kinds: Vec<BlockKind>) -> FolderBlocks {
        Ok(block_ids_out(ws.block_ids(&kinds_in(&kinds))?))
    }

    /// The notes that are web pages, with their addresses.
    Read fn list_web_notes(ws) -> Vec<WebNote> {
        Ok(ws
            .web_notes()?
            .into_iter()
            .map(|(path, url)| WebNote { path, url })
            .collect())
    }

    /// Every resolved link of the folder: its graph.
    Read fn graph(ws) -> Vec<Edge> {
        Ok(edges_out(ws.graph()?))
    }

    /// Every link no note answers to, once per note and name: the graph's
    /// optional nodes for notes that do not exist yet (spec Q14).
    Read fn graph_unresolved(ws) -> Vec<MissingLink> {
        Ok(missing_out(ws.graph_unresolved()?))
    }

    /// Every folder of the open folder, empty ones included.
    Read fn list_folders(ws) -> Vec<String> {
        Ok(ws.folders())
    }

    /// The bytes of a text file that is not a note (UTF-8, lossily), for
    /// viewing only.
    Read fn read_file_text(ws, path: String) -> String {
        Ok(String::from_utf8_lossy(&ws.read_file(&path)?).into_owned())
    }

    /// The file an embed written in the note at `source` names, relative to
    /// the folder, or none (spec Q12 applied to files).
    Read fn resolve_attachment(ws, source: String, target: String) -> Option<String> {
        Ok(ws.resolve_file(&source, &target))
    }

    /// Create a note (`name`, with or without `.md`, folders created) with
    /// `text`; `exists` when something stands there (ADR 0048).
    Write fn create_note(ws, name: String, text: String) -> NoteText {
        Ok(note_out(ws.create_note(&name, &text)?))
    }

    /// Create a file that is not a note from base64 bytes; returns the
    /// confined path.
    Write fn create_file(ws, path: String, base64: String) -> String {
        let bytes = decode_base64(&base64)
            .ok_or_else(|| OpError::Contract(crate::failed("the bytes are not base64")))?;
        Ok(ws.create_file(&path, &bytes)?)
    }

    /// Create a folder inside the open folder; returns its confined path.
    Write fn create_folder(ws, path: String) -> String {
        Ok(ws.create_folder(&path)?)
    }

    /// Move a note to `.trash/` at the root, Obsidian's bin.
    Write fn delete_note(ws, path: String) -> Trashed {
        Ok(trashed_out(ws.delete_note(&path)?))
    }

    /// Rename or move a note; the links that reached it come back as
    /// rewrites for the window to show and apply (ADR 0048, option (b)).
    Write fn rename_note(ws, from: String, to: String) -> Renamed {
        Ok(renamed_out(ws.rename_note(&from, &to)?))
    }

    /// Every entry of the folder as the last walk saw it, with kind, size
    /// and date.
    Read fn list_entries(ws) -> Vec<FileEntry> {
        entries_out(ws, ws.entries())
    }

    /// Rename or move anything of the folder; links to what moved come back
    /// as rewrites.
    Write fn rename_entry(ws, from: String, to: String) -> Renamed {
        Ok(renamed_out(ws.rename_entry(&from, &to)?))
    }

    /// Move several entries into `folder` (`""` the root) at once, with one
    /// plan of link rewrites (ADR 0048, revised 2026-10-07).
    Write fn move_entries(ws, paths: Vec<String>, folder: String) -> MovedEntries {
        let m = ws.move_entries(&paths, &folder)?;
        let renamed = renamed_out(verso_core::Renamed {
            path: String::new(),
            rewrites: m.rewrites,
            skipped: m.skipped,
            warnings: m.warnings,
            also: m.also,
        });
        Ok(MovedEntries {
            moved: m
                .moved
                .into_iter()
                .map(|(from, to)| verso_contract::Moved { from, to })
                .collect(),
            refused: m
                .refused
                .into_iter()
                .map(|(path, e)| RefusedEntry {
                    path,
                    error: crate::convert(e),
                })
                .collect(),
            rewrites: renamed.rewrites,
            skipped: renamed.skipped,
            warnings: renamed.warnings,
            also: renamed.also,
        })
    }

    /// Move anything of the folder to `.trash/` at the root.
    Write fn delete_entry(ws, path: String) -> Trashed {
        Ok(trashed_out(ws.delete_entry(&path)?))
    }

    /// Any file as text with its revision; `not_text` when its bytes are not
    /// UTF-8.
    Read fn read_text(ws, path: String) -> TextFile {
        Ok(text_out(ws.read_text(&path)?))
    }

    /// Write any file's text over the revision that was read (invariant 11).
    Write fn write_text(ws, path: String, text: String, revision: String) -> TextFile {
        Ok(text_out(ws.write_text(&path, &text, &revision)?))
    }

    /// Save a board over the revision that was read (ADR 0057 point 2).
    Write fn write_board(ws, path: String, json: String, revision: String) -> TextFile {
        Ok(text_out(ws.write_board(&path, &json, &revision)?))
    }

    /// What `write_board` would write for `json` over the canvas at `path`
    /// as it is on disk now, writing nothing.
    Read fn board_preview(ws, path: String, json: String) -> String {
        Ok(ws.board_preview(&path, &json)?)
    }

    /// How the tiles of a map's picture stand (ADR 0090 item 4), starting
    /// to cut a large PNG that is not yet. Never waits for the cutting.
    Read fn map_open(ws, path: String) -> MapInfo {
        Ok(map_info_out(ws.map_open(&path)?))
    }

    /// One tile of a map's picture, a PNG as base64; none when it is not
    /// there (not cut yet, or outside the pyramid).
    Read fn map_tile(ws, path: String, level: u32, x: u32, y: u32) -> Option<String> {
        Ok(ws.map_tile(&path, level, x, y)?.map(|png| encode_base64(&png)))
    }

    /// A base evaluated over the folder (ADR 0053).
    Read fn query_base(ws, query: BaseQuery) -> BaseResult {
        query_base_within(ws, query, Vec::new())
    }

    /// Read focuses from `.space/waypoints.json` in the open folder
    /// (ADR 0062).
    Read fn get_focuses(ws) -> FocusesSummary {
        Ok(to_contract_focuses_summary(ws.get_focuses()?))
    }

    /// Write focuses to `.space/waypoints.json` in the open folder
    /// (ADR 0062).
    Write fn set_focuses(
        ws,
        focuses: Vec<Focus>,
        stamp: Option<String>,
        base_focuses: Option<Vec<Focus>>,
    ) -> FocusesSummary {
        let focuses = focuses.into_iter().map(to_core_focus).collect();
        let base = base_focuses.map(|bf| bf.into_iter().map(to_core_focus).collect());
        Ok(to_contract_focuses_summary(ws.set_focuses(focuses, stamp.as_deref(), base)?))
    }

    /// Whether focuses can be synced to `.space/waypoints.json` (ADR 0062).
    Read fn can_sync_focuses(ws) -> bool {
        Ok(ws.can_sync_focuses()?)
    }

    /// The space the folder takes (ADR 0075 item 4), from the last walk.
    Read fn folder_space(ws) -> FolderSpace {
        space_of(ws, ws.entries())
    }

    /// The folder's layer of settings, `.verso/settings.json` (ADR 0070
    /// items 1–2): whether it exists, what it sets, its revision. Reading
    /// never creates it.
    Read fn get_folder_settings(ws) -> FolderLayer {
        Ok(layer_out(ws.folder_settings()))
    }

    /// Change the folder's settings: what `change` sets replaces what the
    /// file says. With no `revision` the file must not exist yet (`exists`
    /// when another machine's came first); with one, it is written over
    /// that version only (`changed` otherwise). A change of the walk's
    /// rules applies from the next walk: the window reindexes.
    Write fn set_folder_settings(
        ws,
        change: FolderSettings,
        revision: Option<String>,
    ) -> FolderLayer {
        let change = verso_core::FolderSettings {
            bookmarks: change.bookmarks,
            folder_note_name: change.folder_note_name,
            ignore_build_dirs: change.ignore_build_dirs,
            respect_gitignore: change.respect_gitignore,
            periodic: change.periodic.map(periodic_in),
            oracle: change.oracle.map(oracle_in),
            recommended_theme: change.recommended_theme,
        };
        Ok(layer_out(ws.set_folder_settings(&change, revision.as_deref())?))
    }

    /// Obsidian's settings for daily and periodic notes (ADR 0093 item
    /// 11): `.obsidian/daily-notes.json` and
    /// `.obsidian/plugins/periodic-notes/data.json`, each file's text when
    /// it is there — read once, for Settings to offer, never written.
    Read fn get_obsidian_periodic(ws) -> ObsidianPeriodic {
        let o = ws.obsidian_periodic();
        Ok(ObsidianPeriodic {
            daily_notes: o.daily_notes,
            periodic_notes: o.periodic_notes,
            unavailable: o.unavailable,
        })
    }

    /// The folder's data files of a kind (`.verso/layouts/`,
    /// `.verso/bundles/`; ADR 0099 item 2, ADR 0098 item 2), by id.
    Read fn list_folder_data(ws, kind: FolderDataKind) -> FolderDataList {
        let listed = ws.list_folder_data(data_kind(kind))?;
        Ok(FolderDataList {
            entries: listed
                .entries
                .into_iter()
                .map(|e| FolderDataEntry { id: e.id, revision: e.revision })
                .collect(),
            strays: listed.strays,
        })
    }

    /// One data file's text as it is on disk, with its revision.
    Read fn read_folder_data(ws, kind: FolderDataKind, id: String) -> FolderDataFile {
        let file = ws.read_folder_data(data_kind(kind), &id)?;
        Ok(FolderDataFile { text: file.text, revision: file.revision })
    }

    /// Write a data file (one JSON object: a layout of at most 256 KiB, a bundle of at most 4 MiB): with no
    /// `revision` a new file (`exists` when one stands there), else over
    /// the version that revision describes (`changed` otherwise).
    Write fn write_folder_data(
        ws,
        kind: FolderDataKind,
        id: String,
        text: String,
        revision: Option<String>,
    ) -> FolderDataWritten {
        let revision = ws.write_folder_data(data_kind(kind), &id, &text, revision.as_deref())?;
        Ok(FolderDataWritten { revision })
    }

    /// Remove a data file through the bin, when it is still the version
    /// `revision` describes; answers where it went, like every removal.
    Write fn remove_folder_data(ws, kind: FolderDataKind, id: String, revision: String) -> Trashed {
        Ok(trashed_out(ws.remove_folder_data(data_kind(kind), &id, &revision)?))
    }

    /// Set whether focuses sync to `.space/waypoints.json` (ADR 0062 D5, D9).
    Write fn set_sync_focuses(ws, enabled: bool) -> () {
        ws.set_sync_focuses(enabled);
        Ok(())
    }
}

/// A base evaluated over the folders `within` only (none: the whole
/// folder): a window on a share sees its shared folder, and no row,
/// property, formula or summary counts a file outside it (ADR 0081 item
/// 11). Not a command of its own: the server calls it for a share.
pub fn query_base_within(
    ws: &mut Workspace,
    query: BaseQuery,
    within: Vec<String>,
) -> Result<BaseResult, OpError> {
    query_base_as(ws, query, within, false)
}

/// The bound of a search's answers.
pub(crate) fn search_limit(limit: u32) -> usize {
    usize::try_from(limit.clamp(1, 200)).unwrap_or(20)
}

pub(crate) fn hits_out(hits: Vec<verso_core::IndexHit>) -> Vec<Hit> {
    hits.into_iter()
        .map(|h| Hit {
            path: h.path,
            snippet: h.snippet,
        })
        .collect()
}

pub(crate) fn links_out(links: Option<Vec<verso_core::IndexLink>>) -> Vec<Link> {
    links
        .unwrap_or_default()
        .into_iter()
        .map(|l| Link {
            target: l.target,
            resolved: l.resolved,
            embed: l.embed,
            heading: l.heading,
            block: l.block,
            alias: l.alias,
            line: l.line,
            col: l.col,
            outside: false,
        })
        .collect()
}

pub(crate) fn backlinks_out(links: Option<Vec<verso_core::IndexBacklink>>) -> Vec<Backlink> {
    links
        .unwrap_or_default()
        .into_iter()
        .map(|b| Backlink {
            from: b.from,
            target: b.target,
            embed: b.embed,
            line: b.line,
            col: b.col,
        })
        .collect()
}

pub(crate) fn mentions_out(found: verso_core::Mentions) -> Mentions {
    Mentions {
        mentions: found
            .mentions
            .into_iter()
            .map(|m| Mention {
                path: m.path,
                line: m.line,
                col: m.col,
                text: m.text,
                before: m.before,
                after: m.after,
                alias: m.alias,
                table: m.table,
                secret: m.secret,
            })
            .collect(),
        more: found.more,
    }
}

pub(crate) fn kinds_in(kinds: &[BlockKind]) -> Vec<verso_core::IndexBlockKind> {
    use verso_core::IndexBlockKind as K;
    kinds
        .iter()
        .map(|k| match k {
            BlockKind::Paragraph => K::Paragraph,
            BlockKind::List => K::List,
            BlockKind::Table => K::Table,
            BlockKind::Heading => K::Heading,
            BlockKind::Quote => K::Quote,
            BlockKind::Code => K::Code,
        })
        .collect()
}

pub(crate) fn block_ids_out(list: verso_core::IndexBlockList) -> FolderBlocks {
    use verso_core::IndexBlockKind as K;
    FolderBlocks {
        truncated: list.truncated,
        blocks: list
            .blocks
            .into_iter()
            .map(|b| FolderBlock {
                path: b.path,
                id: b.id,
                kind: match b.kind {
                    K::Paragraph => BlockKind::Paragraph,
                    K::List => BlockKind::List,
                    K::Table => BlockKind::Table,
                    K::Heading => BlockKind::Heading,
                    K::Quote => BlockKind::Quote,
                    K::Code => BlockKind::Code,
                },
                label: b.label,
                under_heading: b.under_heading,
                rows: b.rows,
                tasks: b.tasks,
            })
            .collect(),
    }
}

pub(crate) fn tags_out(tags: Vec<(String, Vec<String>)>) -> Vec<Tag> {
    tags.into_iter()
        .map(|(name, notes)| Tag { name, notes })
        .collect()
}

pub(crate) fn edges_out(edges: Vec<(String, String)>) -> Vec<Edge> {
    edges
        .into_iter()
        .map(|(from, to)| Edge { from, to })
        .collect()
}

pub(crate) fn missing_out(links: Vec<(String, String)>) -> Vec<MissingLink> {
    links
        .into_iter()
        .map(|(from, target)| MissingLink { from, target })
        .collect()
}

/// `entries` — the last walk's, or a reader's — with their labels.
pub(crate) fn entries_out(
    ws: &Workspace,
    entries: &[verso_core::FileEntry],
) -> Result<Vec<FileEntry>, OpError> {
    let labels = ws.labels()?;
    // A folder's labels are its folder note's: the first of the core's
    // candidates that is a note, compared without case.
    let notes: std::collections::HashMap<String, &str> = entries
        .iter()
        .filter(|e| matches!(e.kind, verso_core::FileKind::Note))
        .map(|e| (e.path.to_lowercase(), e.path.as_str()))
        .collect();
    Ok(entries
        .iter()
        .map(|e| {
            let label = match e.kind {
                verso_core::FileKind::Folder => {
                    verso_core::folder_note_candidates(&e.path, ws.folder_note_name())
                        .iter()
                        .find_map(|c| notes.get(&c.to_lowercase()))
                        .and_then(|found| labels.get(*found))
                }
                _ => labels.get(&e.path),
            }
            .map(|l| EntryLabel {
                sticker: l.sticker.clone(),
                color: l.color.clone(),
                alias: l.alias.clone(),
                aliases: l.aliases.clone(),
                order: l.order.clone(),
                pinned: l.pinned.clone(),
            });
            FileEntry {
                path: e.path.clone(),
                kind: match e.kind {
                    verso_core::FileKind::Note => FileKind::Note,
                    verso_core::FileKind::File => FileKind::File,
                    verso_core::FileKind::Folder => FileKind::Folder,
                    verso_core::FileKind::Placeholder => FileKind::Placeholder,
                },
                size: e.len as f64,
                modified: e.modified as f64,
                label,
                access: None,
            }
        })
        .collect())
}

/// The space `entries` take, with the index's.
pub(crate) fn space_of(
    ws: &Workspace,
    entries: &[verso_core::FileEntry],
) -> Result<FolderSpace, OpError> {
    let mut space = FolderSpace {
        total: 0.0,
        notes: 0.0,
        attachments: 0.0,
        files: 0,
        index: ws.index_bytes()? as f64,
    };
    for e in entries {
        let len = e.len as f64;
        match e.kind {
            verso_core::FileKind::Note => space.notes += len,
            verso_core::FileKind::File | verso_core::FileKind::Placeholder => {
                space.attachments += len;
            }
            verso_core::FileKind::Folder => continue,
        }
        space.total += len;
        space.files = space.files.saturating_add(1);
    }
    Ok(space)
}

/// [`query_base_within`]; `reader`: as an account that may only read the
/// folder asks it (ADR 0087 item 4).
pub fn query_base_as(
    ws: &mut Workspace,
    query: BaseQuery,
    within: Vec<String>,
    reader: bool,
) -> Result<BaseResult, OpError> {
    let core = verso_core::bases::BaseQuery {
        path: query.path,
        text: query.text,
        this: query.this,
        view: query.view,
        extra: query.extra,
        // The window's clock: whole milliseconds are all a base reads.
        now_ms: query.now as i64,
        offset_minutes: query.offset,
        lang: query.lang,
        within,
        reader,
    };
    let r = ws.query_base(&core)?;
    Ok(base_result(r))
}

fn layer_out(l: verso_core::FolderLayer) -> FolderLayer {
    FolderLayer {
        exists: l.exists,
        problem: l.problem.map(|p| {
            match p {
                verso_core::LayerProblem::Unavailable => "unavailable",
                verso_core::LayerProblem::Invalid => "invalid",
            }
            .to_owned()
        }),
        revision: l.revision,
        settings: FolderSettings {
            bookmarks: l.settings.bookmarks,
            folder_note_name: l.settings.folder_note_name,
            ignore_build_dirs: l.settings.ignore_build_dirs,
            respect_gitignore: l.settings.respect_gitignore,
            periodic: l.settings.periodic.map(periodic_out),
            oracle: l.settings.oracle.map(oracle_out),
            recommended_theme: l.settings.recommended_theme,
        },
        warnings: l.warnings,
    }
}

fn period_in(p: PeriodSettings) -> verso_core::Period {
    verso_core::Period {
        on: p.on,
        format: p.format,
        folder: p.folder,
        template: p.template,
    }
}

fn period_out(p: verso_core::Period) -> PeriodSettings {
    PeriodSettings {
        on: p.on,
        format: p.format,
        folder: p.folder,
        template: p.template,
    }
}

fn periodic_in(p: PeriodicSettings) -> verso_core::Periodic {
    verso_core::Periodic {
        day: p.day.map(period_in),
        week: p.week.map(period_in),
        month: p.month.map(period_in),
        quarter: p.quarter.map(period_in),
        year: p.year.map(period_in),
        week_start: p.week_start,
        language: p.language,
    }
}

fn periodic_out(p: verso_core::Periodic) -> PeriodicSettings {
    PeriodicSettings {
        day: p.day.map(period_out),
        week: p.week.map(period_out),
        month: p.month.map(period_out),
        quarter: p.quarter.map(period_out),
        year: p.year.map(period_out),
        week_start: p.week_start,
        language: p.language,
    }
}

fn oracle_in(o: OracleSettings) -> verso_core::Oracle {
    verso_core::Oracle {
        odds: o.odds,
        sparks: o.sparks.map(|s| verso_core::OracleSparks {
            action: s.action,
            theme: s.theme,
            descriptor: s.descriptor,
            focus: s.focus,
        }),
        clear_odds: o.clear_odds.unwrap_or(false),
        clear_sparks: o.clear_sparks.unwrap_or(false),
    }
}

fn oracle_out(o: verso_core::Oracle) -> OracleSettings {
    OracleSettings {
        odds: o.odds,
        sparks: o.sparks.map(|s| OracleSparks {
            action: s.action,
            theme: s.theme,
            descriptor: s.descriptor,
            focus: s.focus,
        }),
        clear_odds: None,
        clear_sparks: None,
    }
}

/// The core's kind for the contract's.
pub fn data_kind(k: FolderDataKind) -> verso_core::FolderDataKind {
    match k {
        FolderDataKind::Layouts => verso_core::FolderDataKind::Layouts,
        FolderDataKind::Bundles => verso_core::FolderDataKind::Bundles,
    }
}

fn base_result(r: verso_core::bases::BaseResult) -> BaseResult {
    BaseResult {
        views: r
            .views
            .into_iter()
            .map(|v| BaseView {
                name: v.name,
                kind: v.kind,
            })
            .collect(),
        view: r.view.map(count),
        columns: r
            .columns
            .into_iter()
            .map(|c| BaseColumn {
                id: c.id,
                name: c.name,
            })
            .collect(),
        groups: r
            .groups
            .into_iter()
            .map(|g| BaseGroup {
                key: g.key.map(base_cell),
                rows: g
                    .rows
                    .into_iter()
                    .map(|row| BaseRow {
                        path: row.path,
                        note: row.note,
                        cells: row.cells.into_iter().map(base_cell).collect(),
                    })
                    .collect(),
                summaries: g.summaries.into_iter().map(|s| s.map(base_cell)).collect(),
            })
            .collect(),
        total: count(r.total),
        properties: r.properties,
        problems: r
            .problems
            .into_iter()
            .map(|p| {
                use verso_core::bases::ProblemKind as K;
                BaseProblem {
                    kind: match p.kind {
                        K::NotABase => BaseProblemKind::NotABase,
                        K::TooLong => BaseProblemKind::TooLong,
                        K::Shape => BaseProblemKind::Shape,
                        K::Expression => BaseProblemKind::Expression,
                        K::Evaluation => BaseProblemKind::Evaluation,
                        K::UnknownView => BaseProblemKind::UnknownView,
                        K::Budget => BaseProblemKind::Budget,
                    },
                    detail: p.detail,
                    error: p.error.map(|e| BaseError {
                        kind: crate::convert::base_error_kind(e.kind),
                        name: e.name,
                    }),
                }
            })
            .collect(),
    }
}

/// A canvas's text in Obsidian's layout (ADR 0057 point 2), from the JSON
/// the window built. Touches no file.
pub fn board_text(json: &str) -> Result<String, ContractError> {
    verso_core::canvas::Canvas::parse(json)
        .map(|c| c.write())
        .map_err(|e| ContractError {
            kind: ErrorKind::NotCanvas,
            message: e.to_string(),
        })
}

fn map_info_out(m: verso_core::maptiles::MapInfo) -> MapInfo {
    use verso_core::maptiles::MapState as Core;
    MapInfo {
        state: match m.state {
            Core::Whole => MapState::Whole,
            Core::Cutting => MapState::Cutting,
            Core::Ready => MapState::Ready,
            Core::Unsupported => MapState::Unsupported,
            Core::Failed => MapState::Failed,
        },
        width: m.width,
        height: m.height,
        tile: m.tile,
        levels: m.levels,
        done: m.done as f64,
        total: m.total as f64,
        message: m.message,
    }
}

/// Bytes to standard base64, padded.
#[must_use]
pub fn encode_base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (u32::from(chunk[0]) << 16)
            | (u32::from(chunk.get(1).copied().unwrap_or(0)) << 8)
            | u32::from(chunk.get(2).copied().unwrap_or(0));
        for (i, shift) in [18, 12, 6, 0].into_iter().enumerate() {
            if i <= chunk.len() {
                out.push(char::from(ALPHABET[((n >> shift) & 63) as usize]));
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// Standard base64 (with or without padding) to bytes; `None` on a
/// character outside the alphabet. Small enough to own, so no crate.
#[must_use]
pub fn decode_base64(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut bits = 0;
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' | b'\n' | b'\r' => continue,
            _ => return None,
        };
        acc = (acc << 6) | u32::from(v);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(u8::try_from((acc >> bits) & 0xff).unwrap_or(0));
        }
    }
    Some(out)
}

#[cfg(test)]
mod base64_tests {
    use super::{decode_base64, encode_base64};

    #[test]
    fn bytes_go_to_base64_and_back() {
        assert_eq!(encode_base64(b""), "");
        assert_eq!(encode_base64(b"f"), "Zg==");
        assert_eq!(encode_base64(b"fo"), "Zm8=");
        assert_eq!(encode_base64(b"foo"), "Zm9v");
        for n in 0..40u8 {
            let bytes: Vec<u8> = (0..n).map(|i| i.wrapping_mul(37)).collect();
            assert_eq!(decode_base64(&encode_base64(&bytes)), Some(bytes));
        }
    }
}
