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
    with(&state, &window, |ws| {
        ws.write_board(&path, &json, &revision)
    })
    .map(text_out)
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
    with(&state, &window, |ws| ws.board_preview(&path, &json))
}

/// A canvas's text in Obsidian's layout (ADR 0057 point 2), from the JSON
/// the window built: a new board, or the preview of a conversion, reads
/// exactly as the file will be written. Touches no file.
#[tauri::command]
#[specta::specta]
pub(crate) fn board_text(json: String) -> Result<String, ContractError> {
    verso_core::canvas::Canvas::parse(&json)
        .map(|c| c.write())
        .map_err(|e| ContractError {
            kind: ErrorKind::NotCanvas,
            message: e.to_string(),
        })
}

/// Markdown rendered as the reading view renders a note, for a text card
/// of a board (spec §5.11: a text node's text is Markdown). The window
/// sanitizes it like any note's HTML.
#[tauri::command]
#[specta::specta]
pub(crate) fn render_markdown(text: String) -> String {
    verso_core::render_markdown(&text)
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
    let r = with(&state, &window, |ws| ws.query_base(&core))?;
    Ok(BaseResult {
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
    })
}

fn base_cell(c: verso_core::bases::Cell) -> BaseCell {
    use verso_core::bases::{Cell as C, EvalErrorKind as E};
    match c {
        C::Empty => BaseCell::Empty,
        C::Text(s) => BaseCell::Text(s),
        C::Number(n) => BaseCell::Number(n),
        C::Bool(b) => BaseCell::Bool(b),
        C::Date { ms, time } => BaseCell::Date {
            ms: ms as f64,
            time,
        },
        C::Duration(ms) => BaseCell::Duration(ms),
        C::List(items) => BaseCell::List(items.into_iter().map(base_cell).collect()),
        C::Object(entries) => BaseCell::Object(
            entries
                .into_iter()
                .map(|(k, v)| (k, base_cell(v)))
                .collect(),
        ),
        C::Link {
            target,
            display,
            path,
        } => BaseCell::Link {
            target,
            display,
            path,
        },
        C::File(p) => BaseCell::File(p),
        C::Image(s) => BaseCell::Image(s),
        C::Icon(s) => BaseCell::Icon(s),
        C::Html(s) => BaseCell::Html(s),
        C::Error(e) => BaseCell::Error {
            kind: match e.kind {
                E::Syntax => BaseErrorKind::Syntax,
                E::UnknownFunction => BaseErrorKind::UnknownFunction,
                E::UnknownMethod => BaseErrorKind::UnknownMethod,
                E::Arguments => BaseErrorKind::Arguments,
                E::Type => BaseErrorKind::Type,
                E::Regex => BaseErrorKind::Regex,
                E::Cycle => BaseErrorKind::Cycle,
                E::Budget => BaseErrorKind::Budget,
                E::TooLarge => BaseErrorKind::TooLarge,
            },
            name: e.name,
        },
    }
}
