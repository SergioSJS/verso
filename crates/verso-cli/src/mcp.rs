// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `verso mcp <folder>` (Phase 1, feature 6; ADR 0066) and `verso mcp
//! --all` (ADR 0054, revised 2026-10-08): a read-only MCP server over
//! stdio, spawned by the client as a child process, for one folder or for
//! every folder marked visible to agents. Ten tools — search, read_note,
//! links, backlinks, unresolved, list_notes, index, since ADR 0066
//! read_board and query_base, and list_folders — answer from
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

use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::tool::schema_for_type;
use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::model::{CallToolResult, Implementation, JsonObject, ServerCapabilities, ServerConfig};
use rmcp::schemars::JsonSchema;
use rmcp::{ServerHandler, tool, tool_handler, tool_router};
use serde::Serialize;
use serde_json::Value;
use verso_core::bases::BaseQuery;
use verso_core::{CoreError, ReadError, Workspace};

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

mod shapes;
pub use shapes::*;

/// The instructions a client shows the model at `initialize`.
const INSTRUCTIONS: &str = "Verso: read-only access to folders of Markdown notes, boards (`.canvas`) and bases (`.base`). \
`list_folders` names the folders this server answers for: one, for a folder's own server, or every folder its owner marked visible \
to agents, for the server for all of Verso — there, pass `folder` (the key, or a name only one folder bears) to every tool. \
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

/// The server: one open workspace behind a mutex, so two calls never
/// interleave on the index (a second `index` waits for the first).
#[derive(Clone)]
pub struct Server {
    scope: Arc<Scope>,
    /// The configuration directory (`None`: `verso_core::config_dir`):
    /// where the marks and the log of the agents' calls live.
    config: Option<PathBuf>,
    tool_router: ToolRouter<Self>,
}

/// What a server serves (ADR 0054, revised 2026-10-08): one folder — the
/// `--key` or path it was started with — or every folder Verso has opened
/// that the person marked visible to agents, each opened the first time a
/// call names it.
enum Scope {
    One {
        workspace: Arc<Mutex<Workspace>>,
        key: String,
        name: String,
    },
    All {
        open: Mutex<HashMap<String, Arc<Mutex<Workspace>>>>,
    },
}

type Shared = Arc<Mutex<Workspace>>;

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
        CoreError::UnknownFolder | CoreError::InvalidKey => "unknown_folder",
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
    /// A server of one folder: the `--key` or path it was started with.
    /// `config` is where the agents' log goes (`None`: the configuration
    /// directory).
    #[must_use]
    pub fn new(workspace: Workspace, config: Option<PathBuf>) -> Self {
        let key = workspace.key();
        let name = workspace.name();
        Self {
            scope: Arc::new(Scope::One {
                workspace: Arc::new(Mutex::new(workspace)),
                key,
                name,
            }),
            config,
            tool_router: Self::tool_router(),
        }
    }

    /// A server of every folder Verso has opened that is marked visible to
    /// agents (`verso mcp --all`).
    #[must_use]
    pub fn all(config: Option<PathBuf>) -> Self {
        Self {
            scope: Arc::new(Scope::All {
                open: Mutex::new(HashMap::new()),
            }),
            config,
            tool_router: Self::tool_router(),
        }
    }

    /// The folders this server answers for, by name and key.
    fn folders(&self) -> Result<Vec<FolderOut>, CallToolResult> {
        match self.scope.as_ref() {
            Scope::One { key, name, .. } => Ok(vec![FolderOut {
                name: name.clone(),
                key: key.clone(),
            }]),
            Scope::All { .. } => Ok(verso_core::agents::known(self.config.as_deref())
                .map_err(|e| fail(&e, None))?
                .into_iter()
                .filter(|f| f.visible)
                .map(|f| FolderOut {
                    name: f.name,
                    key: f.key,
                })
                .collect()),
        }
    }

    /// The workspace a call names, and the folder's key for the log. On a
    /// folder's own server `folder` may be left out, or name that folder;
    /// on the server for all of Verso it is required: the key, or a name
    /// only one visible folder bears. A folder is opened — and indexed —
    /// the first time a call names it, and one that fails to open fails
    /// that call only.
    fn resolve(&self, folder: Option<&str>) -> Result<(Shared, String), CallToolResult> {
        match self.scope.as_ref() {
            Scope::One {
                workspace,
                key,
                name,
            } => match folder {
                Some(f) if f != key && f != name => Err(refuse(
                    "unknown_folder",
                    None,
                    &format!("this server serves one folder, {name}; it has no folder {f}"),
                )),
                _ => Ok((Arc::clone(workspace), key.clone())),
            },
            Scope::All { open } => {
                let Some(asked) = folder else {
                    return Err(refuse(
                        "no_folder",
                        None,
                        "name the folder: call list_folders for the folders you may read",
                    ));
                };
                let visible = self.folders()?;
                let key = match visible.iter().find(|f| f.key == asked) {
                    Some(f) => f.key.clone(),
                    None => {
                        let named: Vec<&FolderOut> =
                            visible.iter().filter(|f| f.name == asked).collect();
                        match named.as_slice() {
                            [one] => one.key.clone(),
                            [] => {
                                return Err(refuse(
                                    "unknown_folder",
                                    None,
                                    &format!(
                                        "no folder visible to agents is named {asked}: call list_folders"
                                    ),
                                ));
                            }
                            many => {
                                let keys: Vec<&str> = many.iter().map(|f| f.key.as_str()).collect();
                                return Err(refuse(
                                    "ambiguous_folder",
                                    None,
                                    &format!(
                                        "{} folders are named {asked}; name one by its key: {}",
                                        many.len(),
                                        keys.join(", ")
                                    ),
                                ));
                            }
                        }
                    }
                };
                let mut open = open.lock().unwrap_or_else(PoisonError::into_inner);
                if let Some(ws) = open.get(&key) {
                    return Ok((Arc::clone(ws), key));
                }
                let mut ws =
                    Workspace::reopen(&key, self.config.as_deref()).map_err(|e| fail(&e, None))?;
                ws.index().map_err(|e| fail(&e, None))?;
                let ws = Arc::new(Mutex::new(ws));
                open.insert(key.clone(), Arc::clone(&ws));
                Ok((ws, key))
            }
        }
    }

    /// Run a tool's body on the workspace the call names, under its lock,
    /// and log the call (`agents.log`, ADR 0054). A poisoned lock — a call
    /// panicked while holding it — is taken all the same: the workspace is
    /// as the panic left it (SQLite rolled its transaction back; `index`
    /// re-reads what changed). A panic inside the body — the parser on an
    /// input nobody foresaw — becomes a `failed` error result the model
    /// reads, instead of a call that never answers; the guard outlives the
    /// unwinding, so the lock is not even poisoned.
    fn guarded<T>(
        &self,
        call: (&str, Option<&str>, &str),
        body: impl FnOnce(&mut Workspace) -> Result<T, CallToolResult>,
    ) -> Result<T, CallToolResult> {
        let (tool, folder, what) = call;
        // A refused folder is logged too, as it was asked: the trace of an
        // agent looking for folders it was not given (ADR 0054 point 6).
        let (shared, key) = self.resolve(folder).inspect_err(|_| {
            let asked = format!("{} (refused)", folder.unwrap_or("no folder"));
            verso_core::agents::log_call(self.config.as_deref(), tool, &asked, what);
        })?;
        verso_core::agents::log_call(self.config.as_deref(), tool, &key, what);
        let mut ws = shared.lock().unwrap_or_else(PoisonError::into_inner);
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
        description = "The folders this server answers for, by name and key: pass one as `folder` to the other tools (required by the server for all of Verso). A folder is listed only when its owner marked it visible to agents.",
        output_schema = answer_schema::<FoldersResult>()
    )]
    fn list_folders(&self) -> Result<Json<FoldersResult>, CallToolResult> {
        let folders = self.folders()?;
        verso_core::agents::log_call(
            self.config.as_deref(),
            "list_folders",
            "-",
            &folders.len().to_string(),
        );
        Ok(Json(FoldersResult { folders }))
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
        self.guarded(("search", p.folder.as_deref(), p.words.as_str()), |ws| {
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
        self.guarded(("read_note", p.folder.as_deref(), p.path.as_str()), |ws| {
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
                        first_line: b.first_line,
                        last_line: b.last_line,
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
        self.guarded(("links", p.folder.as_deref(), p.path.as_str()), |ws| {
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
        self.guarded(("backlinks", p.folder.as_deref(), p.path.as_str()), |ws| {
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
    fn unresolved(
        &self,
        Parameters(p): Parameters<FolderParams>,
    ) -> Result<Json<UnresolvedResult>, CallToolResult> {
        self.guarded(("unresolved", p.folder.as_deref(), ""), |ws| {
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
        let filters = [
            ("tag", &p.tag),
            ("property", &p.property),
            ("value", &p.value),
            ("type", &p.note_type),
        ]
        .iter()
        .filter_map(|(k, v)| v.as_ref().map(|v| format!("{k}={v}")))
        .collect::<Vec<_>>()
        .join(" ");
        self.guarded(("list_notes", p.folder.as_deref(), &filters), |ws| {
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
        self.guarded(("read_board", p.folder.as_deref(), p.path.as_str()), |ws| {
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
        self.guarded(("query_base", p.folder.as_deref(), p.path.as_str()), |ws| {
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
                    within: Vec::new(),
                    // The MCP of `verso mcp` reads a folder of this
                    // computer: its person is its owner (ADR 0087 item 2).
                    reader: false,
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
    fn index(
        &self,
        Parameters(p): Parameters<FolderParams>,
    ) -> Result<Json<IndexResult>, CallToolResult> {
        self.guarded(("index", p.folder.as_deref(), ""), |ws| {
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
pub async fn serve(server: Server) -> Result<(), Box<dyn std::error::Error>> {
    use rmcp::ServiceExt;
    let service = server.serve(rmcp::transport::stdio()).await?;
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
        (
            Server::new(ws, Some(config.path().to_path_buf())),
            vault,
            config,
        )
    }

    fn workspace_of(server: &Server) -> Shared {
        let Scope::One { workspace, .. } = server.scope.as_ref() else {
            panic!("a folder's own server");
        };
        Arc::clone(workspace)
    }

    #[test]
    fn a_poisoned_lock_is_taken_and_the_next_call_answers() {
        let (server, _vault, _config) = server();
        let Scope::One { workspace, .. } = server.scope.as_ref() else {
            panic!("a folder's own server");
        };
        let workspace = Arc::clone(workspace);
        // A thread panics with the lock held: the mutex is poisoned, as it
        // is when a tool call panics inside the runtime.
        let _ = std::thread::spawn(move || {
            let _held = workspace.lock().unwrap();
            panic!("a call panicked with the workspace locked");
        })
        .join();
        assert!(workspace_of(&server).is_poisoned());
        let Ok(Json(listed)) = server.list_notes(Parameters(ListParams::default())) else {
            panic!("the call after the poisoning did not answer");
        };
        assert_eq!(listed.count, 0);
    }

    #[test]
    fn a_panic_inside_a_call_is_a_failed_result_and_the_lock_survives() {
        let (server, _vault, _config) = server();
        let result: Result<(), CallToolResult> =
            server.guarded(("test", None, ""), |_| panic!("the parser choked"));
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
        assert!(!workspace_of(&server).is_poisoned());
        assert!(server.list_notes(Parameters(ListParams::default())).is_ok());
    }
}
