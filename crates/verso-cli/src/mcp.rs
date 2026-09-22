// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! `verso mcp <folder>` (Phase 1, feature 6): a read-only MCP server over
//! stdio, spawned by the client as a child process. Seven tools — search,
//! read_note, links, backlinks, unresolved, list_notes, index — answer
//! from `verso-core`; nothing here touches the folder or the index file
//! (ADR 0026 rule 5). stdout carries the protocol: everything said to a
//! human goes to stderr.
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

use std::sync::{Arc, Mutex};

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::model::{Implementation, ServerCapabilities, ServerConfig};
use rmcp::schemars::JsonSchema;
use rmcp::{ErrorData, ServerHandler, tool, tool_handler, tool_router};
use serde::{Deserialize, Serialize};
use verso_core::{CoreError, Workspace};

/// `search` without a `limit`.
pub const SEARCH_DEFAULT: usize = 20;
/// The most hits `search` returns in one call.
pub const SEARCH_MAX: usize = 100;
/// The most lines `read_note` returns in one call.
pub const READ_MAX_LINES: usize = 400;
/// The most paths `list_notes` returns in one call.
pub const LIST_MAX: usize = 5000;

/// The instructions a client shows the model at `initialize`.
const INSTRUCTIONS: &str = "Verso: read-only access to one folder of Markdown notes. \
A note is named by its path relative to the folder, with `.md` (as `list_notes` and `search` print it). \
Cite a block by its `^id` when `read_note` lists one at that line; otherwise cite `path`, `line` and `col` \
(1-based; `col` counts Unicode characters) as `read_note` numbers them. `search`, `links`, `backlinks` and \
`unresolved` answer from an index built when the server started; `read_note` reads the file now and says \
`stale: true` when the index is behind it — call `index` to refresh. Nothing here writes to the folder.";

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
    pub from_line: Option<usize>,
    /// Last line to return (1-based, inclusive); default the end, at most
    /// 400 lines per call.
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

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ReadResult {
    pub path: String,
    pub line_count: usize,
    pub lines: Vec<Line>,
    pub from_line: usize,
    pub to_line: usize,
    /// Not the whole note: ask again with `from_line`.
    pub truncated: bool,
    /// The file differs from what the index holds: graph answers may be
    /// behind this text. Call `index`.
    pub stale: bool,
    /// The index holds this note only as a last known version: the file
    /// was a placeholder when it was last indexed.
    pub unverified: bool,
    pub headings: Vec<HeadingOut>,
    pub blocks: Vec<BlockOut>,
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

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct ListResult {
    pub notes: Vec<String>,
    pub count: usize,
    pub truncated: bool,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct UnreadableOut {
    pub path: String,
    pub error: String,
}

#[derive(Debug, Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub struct IndexResult {
    pub indexed: usize,
    pub unchanged: usize,
    pub removed: usize,
    pub placeholders: usize,
    pub unreadable: Vec<UnreadableOut>,
    /// Walk problems, one line each.
    pub problems: Vec<String>,
}

/// The server: one open workspace behind a mutex, so two calls never
/// interleave on the index (a second `index` waits for the first).
#[derive(Clone)]
pub struct Server {
    workspace: Arc<Mutex<Workspace>>,
    tool_router: ToolRouter<Self>,
}

/// A core error as the client sees it: what the caller sent was wrong
/// (invalid params) or the server could not answer (internal).
fn fail(e: CoreError) -> ErrorData {
    match e {
        CoreError::Confined(_) | CoreError::Read(_) => {
            ErrorData::invalid_params(e.to_string(), None)
        }
        other => ErrorData::internal_error(other.to_string(), None),
    }
}

fn unknown_note(path: &str) -> ErrorData {
    ErrorData::invalid_params(
        format!("unknown note: {path} (not in the index; call index?)"),
        None,
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

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Workspace>, ErrorData> {
        self.workspace
            .lock()
            .map_err(|e| ErrorData::internal_error(e.to_string(), None))
    }

    #[tool(
        description = "Full-text search over the notes: every word must occur (accents and case ignored). Returns note paths with a snippet; `limit` defaults to 20 and is capped at 100. Answers from the index."
    )]
    fn search(
        &self,
        Parameters(p): Parameters<SearchParams>,
    ) -> Result<Json<SearchResult>, ErrorData> {
        let limit = p.limit.unwrap_or(SEARCH_DEFAULT).clamp(1, SEARCH_MAX);
        let ws = self.lock()?;
        // One more than asked, to know whether the cap was hit.
        let mut hits = ws.search(&p.words, limit + 1).map_err(fail)?;
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
    }

    #[tool(
        description = "Read a note's text as numbered lines (cite `line` as given, 1-based), with its headings and `^id` blocks and their positions. At most 400 lines per call: use `from_line`/`to_line` for the rest. `stale: true` means the index is behind this file. A placeholder (content not downloaded) is an error, not an empty note."
    )]
    fn read_note(
        &self,
        Parameters(p): Parameters<ReadParams>,
    ) -> Result<Json<ReadResult>, ErrorData> {
        let mut ws = self.lock()?;
        let text = ws.read_note(&p.path).map_err(fail)?;
        let line_count = text.lines.len();
        let from = p.from_line.unwrap_or(1).max(1);
        let to = p
            .to_line
            .unwrap_or(line_count)
            .min(line_count)
            .min(from.saturating_add(READ_MAX_LINES).saturating_sub(1));
        let lines: Vec<Line> = if from > to {
            Vec::new()
        } else {
            text.lines[from - 1..to]
                .iter()
                .enumerate()
                .map(|(i, t)| Line {
                    n: from + i,
                    text: t.clone(),
                })
                .collect()
        };
        Ok(Json(ReadResult {
            path: text.path,
            line_count,
            lines,
            from_line: from,
            to_line: to,
            truncated: to < line_count.min(p.to_line.unwrap_or(line_count)),
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
        }))
    }

    #[tool(
        description = "The links a note makes, in document order, each with the note it resolves to (or null when no note answers to it) and its position. Answers from the index."
    )]
    fn links(&self, Parameters(p): Parameters<NoteParams>) -> Result<Json<LinksResult>, ErrorData> {
        let mut ws = self.lock()?;
        let links = ws
            .links(&p.path)
            .map_err(fail)?
            .ok_or_else(|| unknown_note(&p.path))?;
        Ok(Json(LinksResult {
            path: note_path(&p.path),
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
                })
                .collect(),
        }))
    }

    #[tool(
        description = "The notes that link to this note (embeds count), each with the position of the link. Answers from the index."
    )]
    fn backlinks(
        &self,
        Parameters(p): Parameters<NoteParams>,
    ) -> Result<Json<BacklinksResult>, ErrorData> {
        let mut ws = self.lock()?;
        let back = ws
            .backlinks(&p.path)
            .map_err(fail)?
            .ok_or_else(|| unknown_note(&p.path))?;
        Ok(Json(BacklinksResult {
            path: note_path(&p.path),
            backlinks: back
                .into_iter()
                .map(|b| BacklinkOut {
                    from: b.from,
                    target: b.target,
                    embed: b.embed,
                    line: b.line,
                    col: b.col,
                })
                .collect(),
        }))
    }

    #[tool(
        description = "Link targets that resolve to no note, with how many links name each, vault-wide. Answers from the index."
    )]
    fn unresolved(&self) -> Result<Json<UnresolvedResult>, ErrorData> {
        let ws = self.lock()?;
        let un = ws.unresolved().map_err(fail)?;
        Ok(Json(UnresolvedResult {
            unresolved: un
                .into_iter()
                .map(|u| UnresolvedOut {
                    target: u.target,
                    count: u.count,
                })
                .collect(),
        }))
    }

    #[tool(
        description = "Every note the index knows, by path relative to the folder, in path order; at most 5000 per call."
    )]
    fn list_notes(&self) -> Result<Json<ListResult>, ErrorData> {
        let ws = self.lock()?;
        let mut notes = ws.notes().map_err(fail)?;
        let count = notes.len();
        let truncated = count > LIST_MAX;
        notes.truncate(LIST_MAX);
        Ok(Json(ListResult {
            notes,
            count,
            truncated,
        }))
    }

    #[tool(
        description = "Refresh the index from the folder (only what changed is re-read) and report what the run did. The only operation that writes, and it writes the index file outside the folder, never a note."
    )]
    fn index(&self) -> Result<Json<IndexResult>, ErrorData> {
        let mut ws = self.lock()?;
        let r = ws.index().map_err(fail)?;
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
            problems: r.problems.iter().map(|p| format!("{p:?}")).collect(),
        }))
    }
}

/// The identifier as the tools print it: relative, with `.md`.
fn note_path(note: &str) -> String {
    if note.ends_with(".md") {
        note.to_owned()
    } else {
        format!("{note}.md")
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
