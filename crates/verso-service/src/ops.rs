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
    Backlink, BaseColumn, BaseGroup, BaseProblem, BaseProblemKind, BaseQuery, BaseResult, BaseRow,
    BaseView, ContractError, Edge, EntryLabel, ErrorKind, FileEntry, FileKind, Focus,
    FocusesSummary, Hit, Link, MovedEntries, NoteText, RefusedEntry, Renamed, Tag, TextFile,
    Trashed, WebNote, Written,
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
        Ok(ws
            .search(&words, usize::try_from(limit.clamp(1, 200)).unwrap_or(20))?
            .into_iter()
            .map(|h| Hit {
                path: h.path,
                snippet: h.snippet,
            })
            .collect())
    }

    /// The links a note makes; empty when the index does not know it.
    Read fn links(ws, path: String) -> Vec<Link> {
        Ok(ws
            .links(&path)?
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
            })
            .collect())
    }

    /// The notes that link to this one; empty when the index does not know
    /// it.
    Read fn backlinks(ws, path: String) -> Vec<Backlink> {
        Ok(ws
            .backlinks(&path)?
            .unwrap_or_default()
            .into_iter()
            .map(|b| Backlink {
                from: b.from,
                target: b.target,
                embed: b.embed,
                line: b.line,
                col: b.col,
            })
            .collect())
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
        Ok(ws
            .tags()?
            .into_iter()
            .map(|(name, notes)| Tag { name, notes })
            .collect())
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
        Ok(ws
            .graph()?
            .into_iter()
            .map(|(from, to)| Edge { from, to })
            .collect())
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
        let labels = ws.labels()?;
        // A folder's labels are its folder note's: the first of the core's
        // candidates that is a note, compared without case.
        let notes: std::collections::HashMap<String, &str> = ws
            .entries()
            .iter()
            .filter(|e| matches!(e.kind, verso_core::FileKind::Note))
            .map(|e| (e.path.to_lowercase(), e.path.as_str()))
            .collect();
        Ok(ws
            .entries()
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
                }
            })
            .collect())
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

    /// A base evaluated over the folder (ADR 0053).
    Read fn query_base(ws, query: BaseQuery) -> BaseResult {
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
        };
        let r = ws.query_base(&core)?;
        Ok(base_result(r))
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

    /// Set whether focuses sync to `.space/waypoints.json` (ADR 0062 D5, D9).
    Write fn set_sync_focuses(ws, enabled: bool) -> () {
        ws.set_sync_focuses(enabled);
        Ok(())
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
