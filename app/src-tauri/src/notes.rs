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
    with(&state, &window, |ws| ws.notes())
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
    with(&state, &window, |ws| ws.read_note(&path)).map(note_out)
}

pub(crate) fn note_out(t: verso_core::NoteText) -> NoteText {
    NoteText {
        path: t.path,
        lines: t.lines,
        html: t.html,
        properties: t
            .properties
            .into_iter()
            .map(|(key, value)| Property {
                key,
                value: match value {
                    verso_core::PropertyValue::Text(s) => PropertyValue::Text(s),
                    verso_core::PropertyValue::Number(s) => PropertyValue::Number(s),
                    verso_core::PropertyValue::Checkbox(b) => PropertyValue::Checkbox(b),
                    verso_core::PropertyValue::List(v) => PropertyValue::List(v),
                    verso_core::PropertyValue::Nested(s) => PropertyValue::Nested(s),
                    verso_core::PropertyValue::Empty => PropertyValue::Empty,
                },
            })
            .collect(),
        text: t.text,
        revision: t.revision,
        headings: t
            .headings
            .into_iter()
            .map(|h| Heading {
                level: h.level,
                text: h.text,
                line: h.line,
                col: h.col,
            })
            .collect(),
        blocks: t
            .blocks
            .into_iter()
            .map(|b| Block {
                id: b.id,
                line: b.line,
                col: b.col,
                first_line: b.first_line,
                last_line: b.last_line,
            })
            .collect(),
        stale: t.stale,
        unverified: t.unverified,
        note_type: t.note_type.map(note_type_out),
        schema_blocks: t
            .schema_blocks
            .into_iter()
            .map(|b| SchemaNotice {
                line: b.line,
                name: b.name,
                nested: b.nested,
                error: b.error,
            })
            .collect(),
    }
}

fn labels_out(labels: Vec<(String, String)>) -> Vec<Label> {
    labels
        .into_iter()
        .map(|(lang, text)| Label { lang, text })
        .collect()
}

fn note_type_out(t: verso_core::typed::NoteType) -> NoteType {
    use verso_core::typed::TypeState as Core;
    NoteType {
        written: t.written,
        state: match t.state {
            Core::Typed(s) => TypeState::Typed {
                schema: s.schema,
                name: s.name,
                labels: labels_out(s.labels),
                properties: s
                    .properties
                    .into_iter()
                    .map(|p| TypedProperty {
                        key: p.key,
                        kind: p.kind,
                        labels: labels_out(p.labels),
                        present: p.present,
                        fits: p.fits,
                    })
                    .collect(),
            },
            Core::Conflict { schemas } => TypeState::Conflict { schemas },
            Core::Invalid { schema, error } => TypeState::Invalid { schema, error },
        },
    }
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
    with(&state, &window, |ws| ws.notes_of_type(&name))
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
    with(&state, &window, |ws| {
        Ok(ws
            .search(&words, usize::try_from(limit.clamp(1, 200)).unwrap_or(20))?
            .into_iter()
            .map(|h| Hit {
                path: h.path,
                snippet: h.snippet,
            })
            .collect())
    })
}

/// The links a note makes; empty when the index does not know it.
#[tauri::command]
#[specta::specta]
pub(crate) fn links<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<Vec<Link>, ContractError> {
    with(&state, &window, |ws| {
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
    })
}

/// The notes that link to this one; empty when the index does not know it.
#[tauri::command]
#[specta::specta]
pub(crate) fn backlinks<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    path: String,
) -> Result<Vec<Backlink>, ContractError> {
    with(&state, &window, |ws| {
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
    })
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
    with(&state, &window, |ws| ws.write_note(&path, &text, &revision)).map(|w| Written {
        note: note_out(w.note),
        warnings: w.warnings,
    })
}

/// Every regular file of the folder that is not a note, for the tree.
#[tauri::command]
#[specta::specta]
pub(crate) fn list_files<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<String>, ContractError> {
    with(&state, &window, |ws| Ok(ws.files()))
}

/// Every tag of the vault, by count, with the notes that carry it.
#[tauri::command]
#[specta::specta]
pub(crate) fn list_tags<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<Tag>, ContractError> {
    with(&state, &window, |ws| {
        Ok(ws
            .tags()?
            .into_iter()
            .map(|(name, notes)| Tag { name, notes })
            .collect())
    })
}

/// The notes that are web pages, with their addresses (an icon, a tab).
#[tauri::command]
#[specta::specta]
pub(crate) fn list_web_notes<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<WebNote>, ContractError> {
    with(&state, &window, |ws| {
        Ok(ws
            .web_notes()?
            .into_iter()
            .map(|(path, url)| WebNote { path, url })
            .collect())
    })
}

/// Every resolved link of the vault: the graph of the whole folder.
#[tauri::command]
#[specta::specta]
pub(crate) fn graph<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<Edge>, ContractError> {
    with(&state, &window, |ws| {
        Ok(ws
            .graph()?
            .into_iter()
            .map(|(from, to)| Edge { from, to })
            .collect())
    })
}

/// Every folder of the open folder, empty ones included, for the tree.
#[tauri::command]
#[specta::specta]
pub(crate) fn list_folders<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<Vec<String>, ContractError> {
    with(&state, &window, |ws| Ok(ws.folders()))
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
    with(&state, &window, |ws| {
        ws.read_file(&path)
            .map(|b| String::from_utf8_lossy(&b).into_owned())
    })
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
    with(&state, &window, |ws| Ok(ws.resolve_file(&source, &target)))
}
