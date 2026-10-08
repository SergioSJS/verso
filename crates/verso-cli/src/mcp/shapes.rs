// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What the MCP tools take and answer: their parameters, their JSON shapes
//! and the conversions from `verso-core`'s types (split from `mcp.rs`, ADR
//! 0067).

use rmcp::schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use verso_core::bases::Cell;
use verso_core::{PropertyValue, WalkProblem};

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct SearchParams {
    /// The folder, by its name or key (`list_folders`): required by the
    /// server for all of Verso, optional for a folder's own server.
    #[serde(default)]
    pub folder: Option<String>,
    /// Words that must all occur in the note (accents and case ignored).
    pub words: String,
    /// At most this many hits; default 20, at most 100.
    pub limit: Option<usize>,
}

/// What a tool that names nothing but its folder takes.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct FolderParams {
    /// The folder, by its name or key (`list_folders`): required by the
    /// server for all of Verso, optional for a folder's own server.
    #[serde(default)]
    pub folder: Option<String>,
}

/// A folder an agent may read.
#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct FolderOut {
    /// The folder's name, as its owner calls it.
    pub name: String,
    /// The folder's key: unique where two folders share a name.
    pub key: String,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct FoldersResult {
    pub folders: Vec<FolderOut>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct Hit {
    pub path: String,
    pub snippet: String,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct SearchResult {
    pub hits: Vec<Hit>,
    /// The cap was hit: there may be more.
    pub truncated: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct NoteParams {
    /// The folder, by its name or key (`list_folders`): required by the
    /// server for all of Verso, optional for a folder's own server.
    #[serde(default)]
    pub folder: Option<String>,
    /// The note's path relative to the folder, with or without `.md`.
    pub path: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ReadParams {
    /// The folder, by its name or key (`list_folders`): required by the
    /// server for all of Verso, optional for a folder's own server.
    #[serde(default)]
    pub folder: Option<String>,
    /// The note's path relative to the folder, with or without `.md`.
    pub path: String,
    /// First line to return (1-based); default 1.
    #[schemars(range(min = 1))]
    pub from_line: Option<usize>,
    /// Last line to return (1-based, inclusive); default the end, at most
    /// 400 lines per call.
    #[schemars(range(min = 1))]
    pub to_line: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct Line {
    /// The line number to cite (1-based).
    pub n: usize,
    pub text: String,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct HeadingOut {
    pub level: u32,
    pub text: String,
    pub line: u32,
    pub col: u32,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct BlockOut {
    /// Cite this instead of a position.
    pub id: String,
    pub line: u32,
    pub col: u32,
    /// The lines of the block the id names (spec Q3, Q21). With the same
    /// id twice in a note, the last names the block (Q4).
    pub first_line: u32,
    pub last_line: u32,
}

/// A frontmatter property, typed as the properties panel reads it: a
/// string, a number, a boolean (a checkbox), a list of strings, null
/// (empty), or a nested value as one line of text. A number JSON cannot
/// write (`.inf`, `+5` as YAML reads it) comes as its text.
#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct PropertyOut {
    pub key: String,
    pub value: Value,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ReadResult {
    pub path: String,
    pub line_count: usize,
    pub lines: Vec<Line>,
    pub from_line: usize,
    pub to_line: usize,
    /// The 400-line cap cut the window short of what was asked (or of the
    /// end of the note): ask again with `from_line` = this `to_line` + 1.
    pub truncated: bool,
    /// The file differs from what the index holds: graph answers may be
    /// behind this text. Call `index`.
    pub stale: bool,
    /// The index holds this note only as a last known version: the file
    /// was a placeholder when it was last indexed.
    pub unverified: bool,
    pub headings: Vec<HeadingOut>,
    pub blocks: Vec<BlockOut>,
    /// The frontmatter's properties, in the order written; empty when there
    /// is none.
    pub properties: Vec<PropertyOut>,
    /// The note's tags, of the frontmatter and the body, without `#`.
    pub tags: Vec<String>,
    /// The note's type, when its `type:` names a schema of the folder
    /// (ADR 0052); null for plain Markdown.
    pub note_type: Option<TypeOut>,
}

/// A note's type: `typed` by one schema (with its declared properties),
/// `conflict` (two or more schemas of one name: none applies) or `invalid`
/// (its schema does not parse).
#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct TypeOut {
    /// The note's `type:`, as written.
    pub written: String,
    /// `typed`, `conflict` or `invalid`.
    pub state: String,
    /// The note holding the schema (`typed`, `invalid`).
    pub schema: Option<String>,
    /// The notes holding a schema of that name (`conflict`).
    pub schemas: Vec<String>,
    /// Why the schema does not parse (`invalid`).
    pub error: Option<String>,
    /// The type's name per language (`typed`).
    pub labels: Vec<LabelOut>,
    /// The declared properties, in the schema's order (`typed`).
    pub properties: Vec<DeclaredOut>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct LabelOut {
    pub lang: String,
    pub text: String,
}

/// A property the schema declares, as the note holds it.
#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct DeclaredOut {
    pub key: String,
    /// `text`, `list`, `number`, `checkbox`, `date` or `datetime`.
    pub kind: String,
    pub labels: Vec<LabelOut>,
    /// The note has the key.
    pub present: bool,
    /// The value fits the kind (a date `YYYY-MM-DD`, a number…).
    pub fits: bool,
}

pub(super) fn labels_out(labels: Vec<(String, String)>) -> Vec<LabelOut> {
    labels
        .into_iter()
        .map(|(lang, text)| LabelOut { lang, text })
        .collect()
}

pub(super) fn type_out(t: verso_core::typed::NoteType) -> TypeOut {
    use verso_core::typed::TypeState;
    let mut out = TypeOut {
        written: t.written,
        state: String::new(),
        schema: None,
        schemas: Vec::new(),
        error: None,
        labels: Vec::new(),
        properties: Vec::new(),
    };
    match t.state {
        TypeState::Typed(s) => {
            out.state = "typed".to_owned();
            out.schema = Some(s.schema);
            out.labels = labels_out(s.labels);
            out.properties = s
                .properties
                .into_iter()
                .map(|p| DeclaredOut {
                    key: p.key,
                    kind: p.kind,
                    labels: labels_out(p.labels),
                    present: p.present,
                    fits: p.fits,
                })
                .collect();
        }
        TypeState::Conflict { schemas } => {
            out.state = "conflict".to_owned();
            out.schemas = schemas;
        }
        TypeState::Invalid { schema, error } => {
            out.state = "invalid".to_owned();
            out.schema = Some(schema);
            out.error = Some(error);
        }
    }
    out
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct LinkOut {
    /// The target as written in the note.
    pub target: String,
    /// The note it resolves to, or null.
    pub resolved: Option<String>,
    pub embed: bool,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub alias: Option<String>,
    pub line: u32,
    pub col: u32,
    /// The key of the frontmatter property that holds the link — a typed
    /// relation — or null for a link of the body.
    pub relation: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct LinksResult {
    pub path: String,
    pub links: Vec<LinkOut>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct BacklinkOut {
    /// The note that links here.
    pub from: String,
    pub target: String,
    pub embed: bool,
    pub line: u32,
    pub col: u32,
    /// The key of the frontmatter property that holds the link — a typed
    /// relation — or null for a link of the body.
    pub relation: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct BacklinksResult {
    pub path: String,
    pub backlinks: Vec<BacklinkOut>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct UnresolvedOut {
    pub target: String,
    /// Links naming it, vault-wide.
    pub count: u64,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct UnresolvedResult {
    pub unresolved: Vec<UnresolvedOut>,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ListParams {
    /// The folder, by its name or key (`list_folders`): required by the
    /// server for all of Verso, optional for a folder's own server.
    #[serde(default)]
    pub folder: Option<String>,
    /// Only the notes with this tag, or one nested under it (`projeto`
    /// holds `projeto/ativo`); case ignored, `#` optional.
    pub tag: Option<String>,
    /// Only the notes with this frontmatter property (case ignored).
    pub property: Option<String>,
    /// With `property`: only the notes where it holds this value (a list
    /// holds each item; case ignored).
    pub value: Option<String>,
    /// Only the notes whose `type:` is this name, case ignored (ADR 0052).
    #[serde(rename = "type")]
    pub note_type: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ListResult {
    /// Paths relative to the folder: notes (`.md`) and, with no filter,
    /// boards (`.canvas`), in path order.
    pub notes: Vec<String>,
    pub count: usize,
    pub truncated: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct BoardParams {
    /// The folder, by its name or key (`list_folders`): required by the
    /// server for all of Verso, optional for a folder's own server.
    #[serde(default)]
    pub folder: Option<String>,
    /// The board's path relative to the folder, with `.canvas`.
    pub path: String,
}

/// A card of a board: a note or a file (`file`), a text (`text`, Markdown),
/// a web page (`url`) or a group (`label`), with its box on the board and
/// the group it sits in.
#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct CardOut {
    pub id: String,
    /// `text`, `file`, `link` or `group`.
    pub kind: String,
    pub text: Option<String>,
    pub file: Option<String>,
    pub url: Option<String>,
    pub label: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// The id of the smallest group that holds the card, if any.
    pub group: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct EdgeOut {
    pub id: String,
    /// The card it leaves, by id.
    pub from: String,
    /// The card it reaches, by id.
    pub to: String,
    pub from_side: Option<String>,
    pub to_side: Option<String>,
    pub label: Option<String>,
    /// The typed relation the edge stands for, if it was promoted to one.
    pub relation: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct BoardResult {
    pub path: String,
    pub cards: Vec<CardOut>,
    pub edges: Vec<EdgeOut>,
    /// The texts written in the board's drawing, freehand notes that are
    /// not cards.
    pub annotations: Vec<String>,
    /// The board had more than 2000 cards or drawn texts: the first ones
    /// were given.
    pub truncated: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct BaseParams {
    /// The folder, by its name or key (`list_folders`): required by the
    /// server for all of Verso, optional for a folder's own server.
    #[serde(default)]
    pub folder: Option<String>,
    /// The base's path relative to the folder, with `.base`.
    pub path: String,
    /// The view to evaluate, by name; the first when absent.
    pub view: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ViewOut {
    pub name: String,
    /// `table`, `cards`, `list`, `calendar`, … as the base names it.
    pub kind: String,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ColumnOut {
    /// The property as the view's `order` names it (`file.name`,
    /// `status`, `formula.x`).
    pub id: String,
    /// The name the base gives it, if any.
    pub name: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct RowOut {
    pub path: String,
    /// One per column.
    pub cells: Vec<Value>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct GroupOut {
    /// The value the rows are grouped by; null when the view is not grouped.
    pub key: Value,
    pub rows: Vec<RowOut>,
}

/// A base evaluated. A cell is null (empty), a string, a number, a
/// boolean, a list or an object; a date is an ISO string in UTC
/// (`2026-10-07` or `2026-10-07T14:30`), a duration a number of
/// milliseconds, a link `{"link", "path"}` (`path` null when it resolves to
/// nothing), a formula's error `{"error"}`.
#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct BaseOut {
    pub path: String,
    pub views: Vec<ViewOut>,
    /// The view evaluated, by name; null when the base has none (a default
    /// table was evaluated).
    pub view: Option<String>,
    pub columns: Vec<ColumnOut>,
    pub groups: Vec<GroupOut>,
    /// The files that passed the filters, before the view's limit.
    pub total: usize,
    /// More than 1000 rows: the first ones, in the view's order, were
    /// given.
    pub truncated: bool,
    /// What is wrong with the base as a whole, as the app shows it above
    /// the view.
    pub problems: Vec<String>,
}

/// A property's value as JSON (see [`PropertyOut`]).
pub(super) fn property_json(v: PropertyValue) -> Value {
    match v {
        PropertyValue::Text(t) | PropertyValue::Nested(t) => Value::String(t),
        PropertyValue::Number(n) => n
            .parse::<serde_json::Number>()
            .map_or(Value::String(n), Value::Number),
        PropertyValue::Checkbox(b) => Value::Bool(b),
        PropertyValue::List(items) => Value::Array(items.into_iter().map(Value::String).collect()),
        PropertyValue::Empty => Value::Null,
    }
}

/// A day of the civil calendar from days since 1970-01-01 (Howard
/// Hinnant's `civil_from_days`).
pub(super) fn civil(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// A kind's Rust name (`UnknownView`) as the snake_case word the output
/// gives (`unknown_view`).
pub(super) fn snake(name: &str) -> String {
    let mut out = String::new();
    for (i, ch) in name.chars().enumerate() {
        if ch.is_uppercase() {
            if i > 0 {
                out.push('_');
            }
            out.extend(ch.to_lowercase());
        } else {
            out.push(ch);
        }
    }
    out
}

/// A base's cell as JSON (see [`BaseOut`]).
pub(super) fn cell_json(c: Cell) -> Value {
    match c {
        Cell::Empty => Value::Null,
        Cell::Text(t) | Cell::File(t) | Cell::Image(t) | Cell::Icon(t) | Cell::Html(t) => {
            Value::String(t)
        }
        Cell::Number(n) | Cell::Duration(n) => {
            serde_json::Number::from_f64(n).map_or(Value::Null, Value::Number)
        }
        Cell::Bool(b) => Value::Bool(b),
        Cell::Date { ms, time } => {
            let (y, m, d) = civil(ms.div_euclid(86_400_000));
            let of_day = ms.rem_euclid(86_400_000) / 60_000;
            Value::String(if time {
                format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}", of_day / 60, of_day % 60)
            } else {
                format!("{y:04}-{m:02}-{d:02}")
            })
        }
        Cell::List(items) => Value::Array(items.into_iter().map(cell_json).collect()),
        Cell::Object(entries) => Value::Object(
            entries
                .into_iter()
                .map(|(k, v)| (k, cell_json(v)))
                .collect(),
        ),
        Cell::Link { target, path, .. } => serde_json::json!({"link": target, "path": path}),
        Cell::Error(e) => {
            serde_json::json!({"error": format!("{} in {}", snake(&format!("{:?}", e.kind)), e.name)})
        }
    }
}

/// Extensions of files that are never notes: asked of `read_note`, the
/// answer names the tool that reads them (ADR 0066 point 5).
pub(super) fn not_a_note(path: &str) -> Option<&'static str> {
    let ext = path.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase())?;
    match ext.as_str() {
        "base" => Some("a base: use `query_base`"),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "avif" | "bmp" | "pdf" | "mp3"
        | "mp4" | "mov" | "webm" | "wav" | "m4a" | "html" | "htm" | "zip" => {
            Some("not a note: this server reads notes, boards and bases")
        }
        _ => None,
    }
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct UnreadableOut {
    pub path: String,
    pub error: String,
}

/// A problem the walk met, as `verso index --json` prints it: `kind` is
/// `loop`, `duplicate`, `too_deep` or `io`; the other fields follow it.
#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ProblemOut {
    pub kind: String,
    pub path: String,
    /// `loop` and `duplicate`: where the path was first seen.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_seen: Option<String>,
    /// `io`: the kind of the I/O error and its message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub io_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct IndexResult {
    pub indexed: usize,
    pub unchanged: usize,
    pub removed: usize,
    pub placeholders: usize,
    pub unreadable: Vec<UnreadableOut>,
    pub problems: Vec<ProblemOut>,
}

pub(super) fn problem_out(p: &WalkProblem) -> ProblemOut {
    let (kind, path, first_seen, io_kind, error) = match p {
        WalkProblem::Loop { path, first_seen } => ("loop", path, Some(first_seen), None, None),
        WalkProblem::Duplicate { path, first_seen } => {
            ("duplicate", path, Some(first_seen), None, None)
        }
        WalkProblem::TooDeep { path } => ("too_deep", path, None, None, None),
        WalkProblem::Io { path, kind, error } => ("io", path, None, Some(kind), Some(error)),
    };
    ProblemOut {
        kind: kind.to_owned(),
        path: path.clone(),
        first_seen: first_seen.cloned(),
        io_kind: io_kind.cloned(),
        error: error.cloned(),
    }
}
