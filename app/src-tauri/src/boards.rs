//! Boards and bases: a board written and previewed, Markdown rendered for a
//! card, a base's view evaluated.

use super::*;

/// Save a board (ADR 0057 point 2): `json` is the canvas as the window
/// holds it — the window sends back every field it read, the ones it does
/// not know included; the core lays it over the file as read, keeping every
/// unchanged value's token and every object's key order, and writes it in
/// Obsidian's layout over the revision that was read (invariant 11).
/// `not_canvas` when the file on disk is not JSON.
#[tauri::command]
#[specta::specta]
pub(crate) fn write_board<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
    json: String,
    revision: String,
) -> Result<TextFile, ContractError> {
    let p = path.clone();
    let written = with(&state, &window, |ws| {
        ops::write_board(ws, path, json, revision)
    })?;
    // A live board of a synced folder, written by its tab while out of its
    // room: the tab's own (ADR 0082 items 6 and 8, item 12).
    wrote(window.app_handle(), window.label(), &p, &written.text);
    Ok(written)
}

/// What `write_board` would write for `json` over the canvas at `path` as
/// it is on disk now, writing nothing: the board's side of a conflict, and
/// the diff the first save of a canvas in another layout shows (review
/// `board.md` §6 item 4).
#[tauri::command]
#[specta::specta]
pub(crate) fn board_preview<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
    json: String,
) -> Result<String, ContractError> {
    with(&state, &window, |ws| ops::board_preview(ws, path, json))
}

/// A canvas's text in Obsidian's layout (ADR 0057 point 2), from the JSON
/// the window built: a new board, or the preview of a conversion, reads
/// exactly as the file will be written. Touches no file.
#[tauri::command]
#[specta::specta]
pub(crate) fn board_text(json: String) -> Result<String, ContractError> {
    ops::board_text(&json)
}

/// Markdown rendered as the reading view renders a note, for a text card
/// of a board (spec §5.11: a text node's text is Markdown). The window
/// sanitizes it like any note's HTML.
#[tauri::command]
#[specta::specta]
pub(crate) fn render_markdown(text: String) -> String {
    verso_core::render_markdown(&text)
}

/// `text` as an account that may only read the note is served on a
/// UniVerso: its secret callouts' lines taken out (ADR 0087 item 3). The
/// "view as a reader" toggle of a writer draws it (item 5), from the one
/// projection the server serves readers. Pure: it reads nothing.
#[tauri::command]
#[specta::specta]
pub(crate) fn project_secrets(text: String) -> String {
    verso_core::secret::project(&text).into_owned()
}

/// `text`, a board, as an account that may only read it is served on a
/// UniVerso: without its secret pins and what belongs to them (ADR 0090
/// item 5). The "view as a reader" toggle of a writer draws it, from the one
/// projection the server serves readers. Pure: it reads nothing.
#[tauri::command]
#[specta::specta]
pub(crate) fn project_board(text: String) -> String {
    verso_core::canvas_secret::project(&text).into_owned()
}

/// How the tiles of a map's picture stand (ADR 0090 item 4), starting to
/// cut a large PNG that is not yet; the cutting runs on a thread of its
/// own and the answer does not wait for it.
#[tauri::command]
#[specta::specta]
pub(crate) fn map_open<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<MapInfo, ContractError> {
    with(&state, &window, |ws| ops::map_open(ws, path))
}

/// One tile of a map's picture, a PNG as base64; none when it is not there.
#[tauri::command]
#[specta::specta]
pub(crate) fn map_tile<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
    level: u32,
    x: u32,
    y: u32,
) -> Result<Option<String>, ContractError> {
    with(&state, &window, |ws| ops::map_tile(ws, path, level, x, y))
}

/// A base evaluated over the folder (ADR 0053): the rows of the view the
/// window draws, as a table, cards, a list, a kanban or a calendar.
#[tauri::command]
#[specta::specta]
pub(crate) fn query_base<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    query: BaseQuery,
) -> Result<BaseResult, ContractError> {
    with(&state, &window, |ws| ops::query_base(ws, query))
}
