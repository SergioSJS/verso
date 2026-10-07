// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `verso mcp <folder>` (Phase 1, feature 6; ADR 0066): a read-only MCP
//! server over stdio, spawned by the client as a child process. Nine tools
//! — search, read_note, links, backlinks, unresolved, list_notes, index,
//! and since ADR 0066 read_board and query_base — answer from
//! `verso-core`; nothing here touches the folder or the index file (ADR
//! 0026 rule 5). stdout carries the protocol: everything said to a human
//! goes to stderr.
//!
//! Provisional (`docs/reference/mcp-decision.md`, the maintainer decides):
//! the transport (stdio), the surface and its JSON shapes, the relative
//! path as the note identifier, the dependency (`rmcp`), the protocol
//! version (negotiated, the SDK's ceiling) and staleness (one index at
//! start, an `index` tool, `stale` on `read_note`). The tool descriptions
//! are English only: whether they are bilingual is `[OPEN]` (memo §7).
//!
//! What the server hands over: every note the walk lists (ADR 0044).
//! Spec Q9 (per-block visibility) has no syntax yet, so nothing in a note
//! is hidden from the client — the only mitigation is which folder is
//! opened (memo §3.5).

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::tool::schema_for_type;
use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::model::{CallToolResult, Implementation, JsonObject, ServerCapabilities, ServerConfig};
use rmcp::schemars::JsonSchema;
use rmcp::{ServerHandler, tool, tool_handler, tool_router};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use verso_core::bases::{BaseQuery, Cell};
use verso_core::{CoreError, PropertyValue, ReadError, WalkProblem, Workspace};

/// `search` without a `limit`.
pub const SEARCH_DEFAULT: usize = 20;
/// The most hits `search` returns in one call.
pub const SEARCH_MAX: usize = 100;
/// The most lines `read_note` returns in one call.
pub const READ_MAX_LINES: usize = 400;
/// The most paths `list_notes` returns in one call.
pub const LIST_MAX: usize = 5000;
/// The most rows `query_base` returns in one call, over all groups.
pub const BASE_ROWS_MAX: usize = 1000;
/// The most cards, and the most drawn texts, `read_board` returns.
pub const BOARD_MAX: usize = 2000;

/// The instructions a client shows the model at `initialize`.
const INSTRUCTIONS: &str = "Verso: read-only access to one folder of Markdown notes, boards (`.canvas`) and bases (`.base`). \
A note is named by its path relative to the folder, with `.md` (as `list_notes` and `search` print it). \
`read_note` gives a note's properties and tags; `list_notes` filters by `tag` or `property`. A link held by a frontmatter \
property is a typed relation: `links` and `backlinks` give its `relation` (the property's key). `read_board` reads a \
board's cards, edges (with their relation) and drawn texts; `query_base` evaluates a base as the app shows it. \
`list_notes` filters and `query_base` answer from the index, as `search` does. A typed note (its `type:` naming a \
`verso-schema` block of the folder) comes with `note_type`: its schema, declared properties and whether each fits. \
Cite a block by its `^id` when `read_note` lists one at that line; otherwise cite `path`, `line` and `col` \
(1-based; `col` counts Unicode characters) as `read_note` numbers them. `search`, `links`, `backlinks` and \
`unresolved` answer from an index built when the server started; `read_note` reads the file now and says \
`stale: true` when the index is behind it — call `index` to refresh. Nothing here writes to the folder. \
A path that cannot name a note, a note the index does not know, a placeholder or a bad line window comes back \
as a tool error (`isError`) whose structured content has `kind`, `path` and `message`: correct the call and try again.";

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct SearchParams {
    /// Words that must all occur in the note (accents and case ignored).
    pub words: String,
    /// At most this many hits; default 20, at most 100.
    pub limit: Option<usize>,
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
    /// The note's path relative to the folder, with or without `.md`.
    pub path: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ReadParams {
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

fn labels_out(labels: Vec<(String, String)>) -> Vec<LabelOut> {
    labels
        .into_iter()
        .map(|(lang, text)| LabelOut { lang, text })
        .collect()
}

fn type_out(t: verso_core::typed::NoteType) -> TypeOut {
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
fn property_json(v: PropertyValue) -> Value {
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
fn civil(days: i64) -> (i64, i64, i64) {
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
fn snake(name: &str) -> String {
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
fn cell_json(c: Cell) -> Value {
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
fn not_a_note(path: &str) -> Option<&'static str> {
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

fn problem_out(p: &WalkProblem) -> ProblemOut {
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

/// The server: one open workspace behind a mutex, so two calls never
/// interleave on the index (a second `index` waits for the first).
#[derive(Clone)]
pub struct Server {
    workspace: Arc<Mutex<Workspace>>,
    tool_router: ToolRouter<Self>,
}

/// The structured content of an error result. Typed, so a client can
/// branch on `kind` without parsing prose: `refused` (the path cannot
/// name a note of the folder — absolute, `..`, hidden, ignored, empty),
/// `unknown_note` (the index does not know it), `not_found` (no such
/// file), `unavailable` (a placeholder, ADR 0043), `not_text` (the
/// file's bytes are not UTF-8; spec Q25), `bad_window` (`read_note`
/// lines), `not_a_note` (a base or a picture asked of `read_note`; ADR
/// 0066), `not_a_board` (`read_board` on a file that is not a JSON Canvas
/// board), `failed` (the server could not answer). `path` is
/// the one the client sent when it is what was wrong, the confined one
/// otherwise, null when none was involved.
#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ToolError {
    pub kind: String,
    pub path: Option<String>,
    pub message: String,
}

/// The output schema a tool declares: its result or a [`ToolError`], so
/// that an `isError` result's structured content conforms to the declared
/// schema as a success does — a client that validates structured content
/// would otherwise reject the error. MCP wants `type: object` at the root,
/// so the two shapes are an `anyOf` under it; their `$defs` move up to the
/// root, where the `$ref`s point.
fn answer_schema<T: JsonSchema + 'static>() -> Arc<JsonObject> {
    let mut root = JsonObject::new();
    let mut defs = JsonObject::new();
    let mut branches = Vec::new();
    for schema in [schema_for_type::<T>(), schema_for_type::<ToolError>()] {
        let mut branch = schema.as_ref().clone();
        if let Some(dialect) = branch.remove("$schema") {
            root.entry("$schema").or_insert(dialect);
        }
        // The type's name is noise to a model; rmcp drops it too.
        branch.remove("title");
        if let Some(Value::Object(d)) = branch.remove("$defs") {
            defs.extend(d);
        }
        branches.push(Value::Object(branch));
    }
    root.insert("type".to_owned(), Value::String("object".to_owned()));
    root.insert("anyOf".to_owned(), Value::Array(branches));
    if !defs.is_empty() {
        root.insert("$defs".to_owned(), Value::Object(defs));
    }
    Arc::new(root)
}

/// What the model should see and act on travels in the result with
/// `isError`, never as a JSON-RPC error: MCP keeps protocol errors for
/// requests the server cannot parse (the SDK emits those), and puts a
/// tool's failure to answer in the result, where the model reads it and
/// corrects the call. The shape is [`ToolError`].
fn refuse(kind: &str, path: Option<&str>, message: &str) -> CallToolResult {
    let error = ToolError {
        kind: kind.to_owned(),
        path: path.map(str::to_owned),
        message: message.to_owned(),
    };
    // Three strings serialize without fail; the branch is for the type.
    CallToolResult::structured_error(serde_json::to_value(&error).unwrap_or_else(
        |e| serde_json::json!({"kind": "failed", "path": null, "message": e.to_string()}),
    ))
}

/// A core error, by what the model can do about it.
fn fail(e: &CoreError, path: Option<&str>) -> CallToolResult {
    let kind = match e {
        CoreError::Confined(_) => "refused",
        CoreError::Read(ReadError::Unavailable) => "unavailable",
        CoreError::Read(ReadError::Io(io)) if io.kind() == std::io::ErrorKind::NotFound => {
            "not_found"
        }
        CoreError::NotText => "not_text",
        CoreError::NotCanvas => "not_a_board",
        _ => "failed",
    };
    refuse(kind, path, &e.to_string())
}

fn unknown_note(path: &str) -> CallToolResult {
    refuse(
        "unknown_note",
        Some(path),
        &format!("unknown note: {path} (not in the index; call index?)"),
    )
}

#[tool_router(router = tool_router)]
impl Server {
    #[must_use]
    pub fn new(workspace: Workspace) -> Self {
        Self {
            workspace: Arc::new(Mutex::new(workspace)),
            tool_router: Self::tool_router(),
        }
    }

    /// The workspace, under the lock. A poisoned lock — a call panicked
    /// while holding it — is taken all the same: the workspace is as the
    /// panic left it (SQLite rolled its transaction back; `index` re-reads
    /// what changed), and a server that answers "poisoned lock" to every
    /// call from then on is worse than one that carries on.
    fn lock(&self) -> MutexGuard<'_, Workspace> {
        self.workspace
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    /// Run a tool's body on the workspace, under the lock. A panic inside
    /// it — the parser on an input nobody foresaw — becomes a `failed`
    /// error result the model reads, instead of a call that never answers
    /// (the runtime swallows the panicking task) and a lock poisoned for
    /// every call after it. `AssertUnwindSafe`: the body may leave the
    /// workspace mid-operation, which `lock` accepts for the same reason;
    /// the guard outlives the unwinding, so the lock is not even poisoned.
    fn guarded<T>(
        &self,
        body: impl FnOnce(&mut Workspace) -> Result<T, CallToolResult>,
    ) -> Result<T, CallToolResult> {
        let mut ws = self.lock();
        catch_unwind(AssertUnwindSafe(|| body(&mut ws))).unwrap_or_else(|payload| {
            let message = payload
                .downcast_ref::<&str>()
                .map(|s| (*s).to_owned())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "no message".to_owned());
            Err(refuse(
                "failed",
                None,
                &format!("the server panicked: {message}"),
            ))
        })
    }

    #[tool(
        description = "Full-text search over the notes: every word must occur (accents and case ignored). Returns note paths with a snippet; `limit` defaults to 20 and is capped at 100. Answers from the index.",
        output_schema = answer_schema::<SearchResult>()
    )]
    fn search(
        &self,
        Parameters(p): Parameters<SearchParams>,
    ) -> Result<Json<SearchResult>, CallToolResult> {
        let limit = p.limit.unwrap_or(SEARCH_DEFAULT).clamp(1, SEARCH_MAX);
        self.guarded(|ws| {
            // One more than asked, to know whether the cap was hit.
            let mut hits = ws.search(&p.words, limit + 1).map_err(|e| fail(&e, None))?;
            let truncated = hits.len() > limit;
            hits.truncate(limit);
            Ok(Json(SearchResult {
                hits: hits
                    .into_iter()
                    .map(|h| Hit {
                        path: h.path,
                        snippet: h.snippet,
                    })
                    .collect(),
                truncated,
            }))
        })
    }

    #[tool(
        description = "Read a note's text as numbered lines (cite `line` as given, 1-based), with its headings and `^id` blocks and their positions, its frontmatter properties (typed), its tags, and its type when a schema types it (`note_type`: the declared properties, each present or not, fitting its kind or not). At most 400 lines per call: use `from_line`/`to_line` for the rest. `stale: true` means the index is behind this file. A placeholder (content not downloaded) is an error, not an empty note. A board's lines can be read too; `read_board` gives its structure.",
        output_schema = answer_schema::<ReadResult>()
    )]
    fn read_note(
        &self,
        Parameters(p): Parameters<ReadParams>,
    ) -> Result<Json<ReadResult>, CallToolResult> {
        self.guarded(|ws| {
            let key = ws
                .source_key(&p.path)
                .map_err(|e| fail(&e, Some(&p.path)))?;
            let text = match ws.read_note(&key) {
                Ok(text) => text,
                // A base or a picture asked as a note: say what it is,
                // rather than "not found" for a `.md` nobody asked for.
                Err(CoreError::Read(ReadError::Io(io)))
                    if io.kind() == std::io::ErrorKind::NotFound
                        && not_a_note(&p.path).is_some() =>
                {
                    let what = not_a_note(&p.path).unwrap_or_default();
                    return Err(refuse(
                        "not_a_note",
                        Some(&p.path),
                        &format!("{}: {what}", p.path),
                    ));
                }
                Err(e) => return Err(fail(&e, Some(&key))),
            };
            // From the text just read, as the properties are: the index's
            // copy may be behind it.
            let tags = verso_core::tags_of(&text.text);
            let line_count = text.lines.len();
            // The window as asked is checked before it is clamped, so an
            // empty answer is never given for a window that made no sense:
            // a line 0, a start past the end, an end before the start. A
            // note with no lines has no last line to default `to_line` to:
            // it answers the empty window, `from_line` 1 and `to_line` 0.
            let from = p.from_line.unwrap_or(1);
            let to_asked = p.to_line.unwrap_or(line_count.max(1));
            if from == 0 || p.to_line == Some(0) {
                return Err(refuse(
                    "bad_window",
                    Some(&key),
                    "lines are 1-based: from_line and to_line start at 1",
                ));
            }
            if from > line_count.max(1) {
                return Err(refuse(
                    "bad_window",
                    Some(&key),
                    &format!("from_line {from} is past the end: the note has {line_count} lines"),
                ));
            }
            if to_asked < from {
                return Err(refuse(
                    "bad_window",
                    Some(&key),
                    &format!("to_line {to_asked} is before from_line {from}"),
                ));
            }
            // What was asked, cut at the end of the note; then the cap.
            let wanted = to_asked.min(line_count);
            let to = wanted.min(from.saturating_add(READ_MAX_LINES).saturating_sub(1));
            let lines: Vec<Line> = text.lines[from - 1..to]
                .iter()
                .enumerate()
                .map(|(i, t)| Line {
                    n: from + i,
                    text: t.clone(),
                })
                .collect();
            Ok(Json(ReadResult {
                path: text.path,
                line_count,
                lines,
                from_line: from,
                to_line: to,
                truncated: to < wanted,
                stale: text.stale,
                unverified: text.unverified,
                headings: text
                    .headings
                    .into_iter()
                    .map(|h| HeadingOut {
                        level: h.level,
                        text: h.text,
                        line: h.line,
                        col: h.col,
                    })
                    .collect(),
                blocks: text
                    .blocks
                    .into_iter()
                    .map(|b| BlockOut {
                        id: b.id,
                        line: b.line,
                        col: b.col,
                    })
                    .collect(),
                properties: text
                    .properties
                    .into_iter()
                    .map(|(key, value)| PropertyOut {
                        key,
                        value: property_json(value),
                    })
                    .collect(),
                tags,
                note_type: text.note_type.map(type_out),
            }))
        })
    }

    #[tool(
        description = "The links a note or a board makes, in document order, each with the note it resolves to (or null when no note answers to it), its position, and `relation`: the frontmatter property that holds it (a typed relation), or null for a link of the body. Answers from the index.",
        output_schema = answer_schema::<LinksResult>()
    )]
    fn links(
        &self,
        Parameters(p): Parameters<NoteParams>,
    ) -> Result<Json<LinksResult>, CallToolResult> {
        self.guarded(|ws| {
            let key = ws
                .source_key(&p.path)
                .map_err(|e| fail(&e, Some(&p.path)))?;
            let links = ws
                .links(&key)
                .map_err(|e| fail(&e, Some(&key)))?
                .ok_or_else(|| unknown_note(&key))?;
            Ok(Json(LinksResult {
                path: key,
                links: links
                    .into_iter()
                    .map(|l| LinkOut {
                        target: l.target,
                        resolved: l.resolved,
                        embed: l.embed,
                        heading: l.heading,
                        block: l.block,
                        alias: l.alias,
                        line: l.line,
                        col: l.col,
                        relation: l.relation,
                    })
                    .collect(),
            }))
        })
    }

    #[tool(
        description = "The notes and boards that link to this note (embeds count), each with the position of the link and `relation`: the frontmatter property that holds it (a typed relation), or null for a link of the body. Answers from the index.",
        output_schema = answer_schema::<BacklinksResult>()
    )]
    fn backlinks(
        &self,
        Parameters(p): Parameters<NoteParams>,
    ) -> Result<Json<BacklinksResult>, CallToolResult> {
        self.guarded(|ws| {
            let key = ws
                .source_key(&p.path)
                .map_err(|e| fail(&e, Some(&p.path)))?;
            let back = ws
                .backlinks(&key)
                .map_err(|e| fail(&e, Some(&key)))?
                .ok_or_else(|| unknown_note(&key))?;
            Ok(Json(BacklinksResult {
                path: key,
                backlinks: back
                    .into_iter()
                    .map(|b| BacklinkOut {
                        from: b.from,
                        target: b.target,
                        embed: b.embed,
                        line: b.line,
                        col: b.col,
                        relation: b.relation,
                    })
                    .collect(),
            }))
        })
    }

    #[tool(
        description = "Link targets that resolve to no note, with how many links name each, vault-wide. Answers from the index.",
        output_schema = answer_schema::<UnresolvedResult>()
    )]
    fn unresolved(&self) -> Result<Json<UnresolvedResult>, CallToolResult> {
        self.guarded(|ws| {
            let un = ws.unresolved().map_err(|e| fail(&e, None))?;
            Ok(Json(UnresolvedResult {
                unresolved: un
                    .into_iter()
                    .map(|u| UnresolvedOut {
                        target: u.target,
                        count: u.count,
                    })
                    .collect(),
            }))
        })
    }

    #[tool(
        description = "Every note and board the index knows, by path relative to the folder, in path order; at most 5000 per call. With `tag`, `property` (and `value`), only the notes that match: a tag holds its nested tags, a list property holds each item, case ignored. With `type`, only the notes whose `type:` is that name. Answers from the index: call `index` after the folder changed.",
        output_schema = answer_schema::<ListResult>()
    )]
    fn list_notes(
        &self,
        Parameters(p): Parameters<ListParams>,
    ) -> Result<Json<ListResult>, CallToolResult> {
        self.guarded(|ws| {
            let given = |f: &Option<String>| f.as_deref().is_some_and(|s| !s.trim().is_empty());
            let filtered = given(&p.tag) || given(&p.property) || given(&p.note_type);
            if p.value.is_some() && !given(&p.property) {
                return Err(refuse(
                    "bad_filter",
                    None,
                    "`value` needs `property`: which property should hold it?",
                ));
            }
            let mut notes = if filtered {
                let mut found = ws
                    .notes_where(p.tag.as_deref(), p.property.as_deref(), p.value.as_deref())
                    .map_err(|e| fail(&e, None))?;
                if let Some(name) = p.note_type.as_deref().filter(|n| !n.trim().is_empty()) {
                    let of: std::collections::HashSet<String> = ws
                        .notes_of_type(name)
                        .map_err(|e| fail(&e, None))?
                        .into_iter()
                        .collect();
                    found.retain(|n| of.contains(n));
                }
                found
            } else {
                let mut all = ws.notes().map_err(|e| fail(&e, None))?;
                all.extend(ws.boards().map_err(|e| fail(&e, None))?);
                all.sort();
                all
            };
            let count = notes.len();
            let truncated = count > LIST_MAX;
            notes.truncate(LIST_MAX);
            Ok(Json(ListResult {
                notes,
                count,
                truncated,
            }))
        })
    }

    #[tool(
        description = "Read a board (`.canvas`) from its file now: its cards (notes, files, texts, web pages, groups — with their box and group), its edges (from and to by card id, sides, label, and the typed relation an edge stands for) and the texts written in its drawing.",
        output_schema = answer_schema::<BoardResult>()
    )]
    fn read_board(
        &self,
        Parameters(p): Parameters<BoardParams>,
    ) -> Result<Json<BoardResult>, CallToolResult> {
        self.guarded(|ws| {
            let (path, mut board) = ws
                .read_board(&p.path)
                .map_err(|e| fail(&e, Some(&p.path)))?;
            let truncated = board.cards.len() > BOARD_MAX || board.annotations.len() > BOARD_MAX;
            board.cards.truncate(BOARD_MAX);
            board.annotations.truncate(BOARD_MAX);
            Ok(Json(BoardResult {
                path,
                truncated,
                cards: board
                    .cards
                    .into_iter()
                    .map(|c| CardOut {
                        id: c.id,
                        kind: c.kind,
                        text: c.text,
                        file: c.file,
                        url: c.url,
                        label: c.label,
                        x: c.x,
                        y: c.y,
                        width: c.width,
                        height: c.height,
                        group: c.group,
                    })
                    .collect(),
                edges: board
                    .edges
                    .into_iter()
                    .map(|e| EdgeOut {
                        id: e.id,
                        from: e.from,
                        to: e.to,
                        from_side: e.from_side,
                        to_side: e.to_side,
                        label: e.label,
                        relation: e.relation,
                    })
                    .collect(),
                annotations: board.annotations,
            }))
        })
    }

    #[tool(
        description = "Evaluate a base (`.base`) as the app shows it: its views, the view evaluated (the first, or `view` by name), the columns, and the rows — each file's path and one value per column — in their groups, with the total before the view's limit. Dates are ISO strings in UTC, durations milliseconds, a link `{link, path}`; at most 1000 rows (`truncated`). Answers from the index, as the app does: call `index` after the folder changed.",
        output_schema = answer_schema::<BaseOut>()
    )]
    fn query_base(
        &self,
        Parameters(p): Parameters<BaseParams>,
    ) -> Result<Json<BaseOut>, CallToolResult> {
        self.guarded(|ws| {
            let path = ws.confined(&p.path).map_err(|e| fail(&e, Some(&p.path)))?;
            if !path.to_ascii_lowercase().ends_with(".base") {
                return Err(refuse(
                    "not_a_base",
                    Some(&p.path),
                    &format!("{}: not a `.base` file", p.path),
                ));
            }
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX));
            let result = ws
                .query_base(&BaseQuery {
                    path: Some(path.clone()),
                    text: None,
                    this: Some(path.clone()),
                    view: p.view.clone(),
                    extra: Vec::new(),
                    now_ms,
                    offset_minutes: 0,
                    lang: "en".to_owned(),
                })
                .map_err(|e| fail(&e, Some(&path)))?;
            let view = result
                .view
                .and_then(|i| result.views.get(i))
                .map(|v| v.name.clone());
            // The rows over all groups, cut at the cap in the view's order.
            let mut room = BASE_ROWS_MAX;
            let mut truncated = false;
            let groups: Vec<GroupOut> = result
                .groups
                .into_iter()
                .filter_map(|g| {
                    if room == 0 {
                        truncated |= !g.rows.is_empty();
                        return None;
                    }
                    truncated |= g.rows.len() > room;
                    let rows: Vec<RowOut> = g
                        .rows
                        .into_iter()
                        .take(room)
                        .map(|r| RowOut {
                            path: r.path,
                            cells: r.cells.into_iter().map(cell_json).collect(),
                        })
                        .collect();
                    room -= rows.len();
                    Some(GroupOut {
                        key: g.key.map_or(Value::Null, cell_json),
                        rows,
                    })
                })
                .collect();
            Ok(Json(BaseOut {
                path,
                views: result
                    .views
                    .into_iter()
                    .map(|v| ViewOut {
                        name: v.name,
                        kind: v.kind,
                    })
                    .collect(),
                view,
                columns: result
                    .columns
                    .into_iter()
                    .map(|c| ColumnOut {
                        id: c.id,
                        name: c.name,
                    })
                    .collect(),
                groups,
                total: result.total,
                truncated,
                problems: result
                    .problems
                    .into_iter()
                    .map(|pr| format!("{}: {}", snake(&format!("{:?}", pr.kind)), pr.detail))
                    .collect(),
            }))
        })
    }

    #[tool(
        description = "Refresh the index from the folder (only what changed is re-read) and report what the run did. The only operation that writes, and it writes the index file outside the folder, never a note.",
        output_schema = answer_schema::<IndexResult>()
    )]
    fn index(&self) -> Result<Json<IndexResult>, CallToolResult> {
        self.guarded(|ws| {
            let r = ws.index().map_err(|e| fail(&e, None))?;
            Ok(Json(IndexResult {
                indexed: r.indexed,
                unchanged: r.unchanged,
                removed: r.removed,
                placeholders: r.placeholders,
                unreadable: r
                    .unreadable
                    .into_iter()
                    .map(|(path, error)| UnreadableOut { path, error })
                    .collect(),
                problems: r.problems.iter().map(problem_out).collect(),
            }))
        })
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for Server {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("verso", env!("CARGO_PKG_VERSION")))
            .with_instructions(INSTRUCTIONS)
    }
}

/// Serve over stdin/stdout until the client closes stdin.
pub async fn serve(workspace: Workspace) -> Result<(), Box<dyn std::error::Error>> {
    use rmcp::ServiceExt;
    let service = Server::new(workspace)
        .serve(rmcp::transport::stdio())
        .await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A server over an empty temporary folder; the directories live as
    /// long as the test holds them.
    fn server() -> (Server, tempfile::TempDir, tempfile::TempDir) {
        let vault = tempfile::tempdir().unwrap();
        let config = tempfile::tempdir().unwrap();
        let ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
        (Server::new(ws), vault, config)
    }

    #[test]
    fn a_poisoned_lock_is_taken_and_the_next_call_answers() {
        let (server, _vault, _config) = server();
        let workspace = Arc::clone(&server.workspace);
        // A thread panics with the lock held: the mutex is poisoned, as it
        // is when a tool call panics inside the runtime.
        let _ = std::thread::spawn(move || {
            let _held = workspace.lock().unwrap();
            panic!("a call panicked with the workspace locked");
        })
        .join();
        assert!(server.workspace.is_poisoned());
        let Ok(Json(listed)) = server.list_notes(Parameters(ListParams::default())) else {
            panic!("the call after the poisoning did not answer");
        };
        assert_eq!(listed.count, 0);
    }

    #[test]
    fn a_panic_inside_a_call_is_a_failed_result_and_the_lock_survives() {
        let (server, _vault, _config) = server();
        let result: Result<(), CallToolResult> = server.guarded(|_| panic!("the parser choked"));
        let Err(error) = result else {
            panic!("a panic answered Ok");
        };
        assert_eq!(error.is_error, Some(true));
        let content = error.structured_content.unwrap();
        assert_eq!(content["kind"], "failed");
        assert!(
            content["message"]
                .as_str()
                .unwrap()
                .contains("the parser choked"),
            "{content}"
        );
        // Not poisoned: the guard outlived the panic, and the next call answers.
        assert!(!server.workspace.is_poisoned());
        assert!(server.list_notes(Parameters(ListParams::default())).is_ok());
    }
}
