// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The commands of a folder as an account that may only read it calls
//! them on a UniVerso (ADR 0087 items 2, 4 and 9): every read command is
//! in [`READER_COMMANDS`], which says how it answers a reader — from the
//! notes' projections, or with nothing a note says — and
//! [`dispatch_reader`] answers by it. A read command added to
//! [`ops::FOLDER_COMMANDS`] and not to this list is refused to a reader,
//! and its test fails (`every_read_command_says_how_it_answers_a_reader`):
//! a new read command cannot hand a reader a secret block by being
//! forgotten.

use verso_contract::{BaseQuery, NoteText, TextFile};
use verso_core::Workspace;

use crate::OpError;
use crate::convert::{note_out, text_out};
use crate::ops;

/// How a read command answers a reader.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ForReader {
    /// From the notes' projections: its reader's own answer.
    Projected,
    /// The same answer as anyone's: nothing in it comes from a note's
    /// body — paths, the frontmatter's type and address, the folder's
    /// settings. A board is never here: its secret pins are ADR 0090's, and
    /// every command that carries a board's text answers from its
    /// projection.
    Same,
}

/// Every read command of the folder and how it answers a reader.
pub const READER_COMMANDS: &[(&str, ForReader)] = &[
    ("list_notes", ForReader::Same),
    ("read_note", ForReader::Projected),
    ("notes_of_type", ForReader::Same),
    ("search", ForReader::Projected),
    ("links", ForReader::Projected),
    ("backlinks", ForReader::Projected),
    ("unlinked_mentions", ForReader::Projected),
    ("list_files", ForReader::Same),
    ("list_tags", ForReader::Projected),
    ("list_block_ids", ForReader::Projected),
    ("list_web_notes", ForReader::Same),
    ("graph", ForReader::Projected),
    ("graph_unresolved", ForReader::Projected),
    ("list_folders", ForReader::Same),
    ("read_file_text", ForReader::Projected),
    ("resolve_attachment", ForReader::Same),
    ("list_entries", ForReader::Projected),
    ("read_text", ForReader::Projected),
    ("board_preview", ForReader::Projected),
    // The tiles of a map's picture: bytes of a picture of the folder, as
    // `resolve_attachment` gives them; no note's body.
    ("map_open", ForReader::Same),
    ("map_tile", ForReader::Same),
    ("query_base", ForReader::Projected),
    ("get_focuses", ForReader::Same),
    ("can_sync_focuses", ForReader::Same),
    ("folder_space", ForReader::Projected),
    ("get_folder_settings", ForReader::Same),
    // Obsidian's daily and periodic notes settings (ADR 0093 item 6): the
    // text of two configuration files, no byte of a note.
    ("get_obsidian_periodic", ForReader::Same),
    // The folder's layouts and bundles (ADR 0099 item 2, ADR 0098 item 2):
    // JSON files of its own, no byte of a note.
    ("list_folder_data", ForReader::Same),
    ("read_folder_data", ForReader::Same),
];

/// How command `name` answers a reader; `None` for one a reader may not
/// call — a write, or a command not in [`READER_COMMANDS`].
#[must_use]
pub fn for_reader(name: &str) -> Option<ForReader> {
    if ops::access(name) != Some(ops::Access::Read) {
        return None;
    }
    READER_COMMANDS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, f)| *f)
}

fn arg<T: serde::de::DeserializeOwned>(
    args: &serde_json::Value,
    name: &str,
    key: &str,
) -> Result<T, OpError> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(serde_json::Value::Null)).map_err(|e| {
        OpError::Contract(verso_contract::ContractError {
            kind: verso_contract::ErrorKind::Refused,
            message: format!("{name}: {key}: {e}"),
        })
    })
}

fn json_of(text: String) -> Result<serde_json::Value, OpError> {
    Ok(serde_json::Value::String(text))
}

fn json<T: serde::Serialize>(value: T) -> Result<serde_json::Value, OpError> {
    serde_json::to_value(value).map_err(|e| OpError::Contract(crate::failed(e.to_string())))
}

/// [`ops::dispatch`] for a reader: a projected command by its reader's
/// answer, a command of [`ForReader::Same`] as anyone's; `None` when a
/// reader may not call `name`.
pub fn dispatch_reader(
    ws: &mut Workspace,
    name: &str,
    args: serde_json::Value,
) -> Option<Result<serde_json::Value, OpError>> {
    match for_reader(name)? {
        ForReader::Same => ops::dispatch(ws, name, args),
        ForReader::Projected => Some(projected(ws, name, &args)),
    }
}

fn projected(
    ws: &mut Workspace,
    name: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, OpError> {
    let path = |key: &str| arg::<String>(args, name, key);
    match name {
        "read_note" => json::<NoteText>(note_out(ws.reader_read_note(&path("path")?)?)),
        "read_text" => json::<TextFile>(text_out(ws.reader_read_text(&path("path")?)?)),
        "read_file_text" => {
            json(String::from_utf8_lossy(&ws.reader_read_file(&path("path")?)?).into_owned())
        }
        "search" => {
            let words = path("words")?;
            let limit: u32 = arg(args, name, "limit")?;
            json(ops::hits_out(
                ws.reader_search(&words, ops::search_limit(limit))?,
            ))
        }
        "links" => json(ops::links_out(ws.reader_links(&path("path")?)?)),
        "backlinks" => json(ops::backlinks_out(ws.reader_backlinks(&path("path")?)?)),
        "unlinked_mentions" => json(ops::mentions_out(
            ws.reader_unlinked_mentions(&path("path")?)?,
        )),
        "list_tags" => json(ops::tags_out(ws.reader_tags()?)),
        "list_block_ids" => {
            let kinds: Vec<verso_contract::BlockKind> = arg(args, name, "kinds")?;
            json(ops::block_ids_out(
                ws.reader_block_ids(&ops::kinds_in(&kinds))?,
            ))
        }
        "graph" => json(ops::edges_out(ws.reader_graph()?)),
        "graph_unresolved" => json(ops::missing_out(ws.reader_graph_unresolved()?)),
        "list_entries" => {
            let entries = ws.reader_entries()?;
            json(ops::entries_out(ws, &entries)?)
        }
        "board_preview" => {
            let json = path("json")?;
            json_of(ws.reader_board_preview(&path("path")?, &json)?)
        }
        "folder_space" => {
            let entries = ws.reader_entries()?;
            let mut space = ops::space_of(ws, &entries)?;
            // The index grows with the secret text it holds (ADR 0087
            // item 4): a reader is told no index size.
            space.index = 0.0;
            json(space)
        }
        "query_base" => {
            let query: BaseQuery = arg(args, name, "query")?;
            json(ops::query_base_as(ws, query, Vec::new(), true)?)
        }
        // Listed as projected and answered by nobody here: refused, never
        // answered whole.
        _ => Err(OpError::unknown(name)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ADR 0087 item 9: a read command not on the list fails here.
    #[test]
    fn every_read_command_says_how_it_answers_a_reader() {
        for (name, access) in ops::FOLDER_COMMANDS {
            let listed = READER_COMMANDS.iter().any(|(n, _)| n == name);
            match access {
                ops::Access::Read => assert!(
                    listed,
                    "{name} reads the folder: say in READER_COMMANDS how it answers a reader (ADR 0087)"
                ),
                ops::Access::Write => {
                    assert!(!listed, "{name} writes: a reader never calls it");
                    assert_eq!(for_reader(name), None);
                }
            }
        }
        for (name, _) in READER_COMMANDS {
            assert_eq!(
                ops::access(name),
                Some(ops::Access::Read),
                "{name} is no read command of the folder"
            );
        }
    }
}
