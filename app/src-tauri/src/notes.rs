//! The notes through the contract: listing, reading, searching, links and
//! backlinks, a note written, and the folder's lists the window shows.

use super::*;

/// Every note the index knows, by path relative to the folder.
#[tauri::command]
#[specta::specta]
pub(crate) fn list_notes<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<String>, ContractError> {
    with(&state, &window, ops::list_notes)
}

/// A note's text as it is on disk, with what the index knows of it;
/// `not_text` when its bytes are not UTF-8.
#[tauri::command]
#[specta::specta]
pub(crate) fn read_note<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<NoteText, ContractError> {
    // A file opened without a folder answers from its own scope (ADR 0114).
    if let Some(answer) = via_loose(
        &state,
        &window,
        "read_note",
        serde_json::json!({ "path": path }),
    ) {
        return answer;
    }
    with(&state, &window, |ws| ops::read_note(ws, path))
}

/// The notes whose `type:` is `name`, case ignored (ADR 0052): what the
/// search's `type:` narrows to.
#[tauri::command]
#[specta::specta]
pub(crate) fn notes_of_type<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    name: String,
) -> Result<Vec<String>, ContractError> {
    with(&state, &window, |ws| ops::notes_of_type(ws, name))
}

/// Full-text search: every word must occur, accents and case ignored.
#[tauri::command]
#[specta::specta]
pub(crate) fn search<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    words: String,
    limit: u32,
) -> Result<Vec<Hit>, ContractError> {
    with(&state, &window, |ws| ops::search(ws, words, limit))
}

/// The links a note makes; empty when the index does not know it.
#[tauri::command]
#[specta::specta]
pub(crate) fn links<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<Vec<Link>, ContractError> {
    if let Some(answer) = via_loose(
        &state,
        &window,
        "links",
        serde_json::json!({ "path": path }),
    ) {
        return answer;
    }
    with(&state, &window, |ws| ops::links(ws, path))
}

/// The notes that link to this one; empty when the index does not know it.
#[tauri::command]
#[specta::specta]
pub(crate) fn backlinks<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<Vec<Backlink>, ContractError> {
    if let Some(answer) = via_loose(
        &state,
        &window,
        "backlinks",
        serde_json::json!({ "path": path }),
    ) {
        return answer;
    }
    with(&state, &window, |ws| ops::backlinks(ws, path))
}

/// The note's unlinked mentions, as occurrences (ADR 0089 item 1).
#[tauri::command]
#[specta::specta]
pub(crate) fn unlinked_mentions<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<Mentions, ContractError> {
    with(&state, &window, |ws| ops::unlinked_mentions(ws, path))
}

/// Write a note's text over the revision that was read — atomically, no
/// normalization — and index it. `changed` when the file moved on
/// meanwhile: nothing written, read again and show the diff (invariant 11).
/// The answer is the text that was sent, with the revision of those bytes.
#[tauri::command]
#[specta::specta]
pub(crate) fn write_note<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
    text: String,
    revision: String,
) -> Result<Written, ContractError> {
    if let Some(answer) = via_loose(
        &state,
        &window,
        "write_note",
        serde_json::json!({ "path": path, "text": text, "revision": revision }),
    ) {
        return answer;
    }
    let (p, t) = (path.clone(), text.clone());
    let written = with(&state, &window, |ws| {
        ops::write_note(ws, path, text, revision)
    })?;
    // A live note of a synced folder, written by its tab while out of its
    // room: the tab's own text (ADR 0082 items 6 and 8).
    wrote(window.app_handle(), window.label(), &p, &t);
    Ok(written)
}

/// Every regular file of the folder that is not a note, for the tree.
#[tauri::command]
#[specta::specta]
pub(crate) fn list_files<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<String>, ContractError> {
    with(&state, &window, ops::list_files)
}

/// Every tag of the vault, by count, with the notes that carry it.
#[tauri::command]
#[specta::specta]
pub(crate) fn list_tags<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<Tag>, ContractError> {
    with(&state, &window, ops::list_tags)
}

/// Every block with an `^id` in the folder's notes, of the kinds asked (all
/// when none): where the oracle finds its tables (ADR 0102 item 3).
#[tauri::command]
#[specta::specta]
pub(crate) fn list_block_ids<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    kinds: Vec<BlockKind>,
) -> Result<FolderBlocks, ContractError> {
    with(&state, &window, |ws| ops::list_block_ids(ws, kinds))
}

/// The notes that are web pages, with their addresses (an icon, a tab).
#[tauri::command]
#[specta::specta]
pub(crate) fn list_web_notes<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<WebNote>, ContractError> {
    with(&state, &window, ops::list_web_notes)
}

/// Every resolved link of the vault: the graph of the whole folder.
#[tauri::command]
#[specta::specta]
pub(crate) fn graph<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<Edge>, ContractError> {
    with(&state, &window, ops::graph)
}

/// Every link no note answers to, for the graph's option of showing the
/// notes that do not exist yet (spec Q14).
#[tauri::command]
#[specta::specta]
pub(crate) fn graph_unresolved<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<MissingLink>, ContractError> {
    with(&state, &window, ops::graph_unresolved)
}

/// Every folder of the open folder, empty ones included, for the tree.
#[tauri::command]
#[specta::specta]
pub(crate) fn list_folders<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<String>, ContractError> {
    with(&state, &window, ops::list_folders)
}

/// The bytes of a text file that is not a note (UTF-8, lossily), for
/// viewing only — never for an editor, which reads through `read_text`;
/// confined like every path.
#[tauri::command]
#[specta::specta]
pub(crate) fn read_file_text<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<String, ContractError> {
    with(&state, &window, |ws| ops::read_file_text(ws, path))
}

/// The file an embed written in the note at `source` names
/// (`![[mapa.png]]`), relative to the folder, or none — by the rule of
/// spec Q12 applied to files: from the note's own folder first. The UI
/// then loads it through the `verso://` protocol below.
#[tauri::command]
#[specta::specta]
pub(crate) fn resolve_attachment<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    source: String,
    target: String,
) -> Result<Option<String>, ContractError> {
    if let Some(answer) = via_loose(
        &state,
        &window,
        "resolve_attachment",
        serde_json::json!({ "source": source, "target": target }),
    ) {
        return answer;
    }
    with(&state, &window, |ws| {
        ops::resolve_attachment(ws, source, target)
    })
}
