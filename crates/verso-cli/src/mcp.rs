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

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::model::{CallToolResult, Implementation, ServerCapabilities, ServerConfig};
use rmcp::schemars::JsonSchema;
use rmcp::{ServerHandler, tool, tool_handler, tool_router};
use serde::{Deserialize, Serialize};
use verso_core::{CoreError, ReadError, WalkProblem, Workspace};

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

/// What the model should see and act on travels in the result with
/// `isError`, never as a JSON-RPC error: MCP keeps protocol errors for
/// requests the server cannot parse (the SDK emits those), and puts a
/// tool's failure to answer in the result, where the model reads it and
/// corrects the call. Typed, so a client can branch on `kind` without
/// parsing prose: `refused` (the path cannot name a note of the folder —
/// absolute, `..`, hidden, ignored, empty), `unknown_note` (the index does
/// not know it), `not_found` (no such file), `unavailable` (a placeholder,
/// ADR 0043), `bad_window` (`read_note` lines), `failed` (the server
/// could not answer). `path` is the one the client sent when it is what
/// was wrong, the confined one otherwise.
fn refuse(kind: &str, path: Option<&str>, message: &str) -> CallToolResult {
    CallToolResult::structured_error(serde_json::json!({
        "kind": kind,
        "path": path,
        "message": message,
    }))
}

/// A core error, by what the model can do about it.
fn fail(e: &CoreError, path: Option<&str>) -> CallToolResult {
    let kind = match e {
        CoreError::Confined(_) => "refused",
        CoreError::Read(ReadError::Unavailable) => "unavailable",
        CoreError::Read(ReadError::Io(io)) if io.kind() == std::io::ErrorKind::NotFound => {
            "not_found"
        }
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
        description = "Full-text search over the notes: every word must occur (accents and case ignored). Returns note paths with a snippet; `limit` defaults to 20 and is capped at 100. Answers from the index."
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
        description = "Read a note's text as numbered lines (cite `line` as given, 1-based), with its headings and `^id` blocks and their positions. At most 400 lines per call: use `from_line`/`to_line` for the rest. `stale: true` means the index is behind this file. A placeholder (content not downloaded) is an error, not an empty note."
    )]
    fn read_note(
        &self,
        Parameters(p): Parameters<ReadParams>,
    ) -> Result<Json<ReadResult>, CallToolResult> {
        self.guarded(|ws| {
            let key = ws.note_key(&p.path).map_err(|e| fail(&e, Some(&p.path)))?;
            let text = ws.read_note(&key).map_err(|e| fail(&e, Some(&key)))?;
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
            }))
        })
    }

    #[tool(
        description = "The links a note makes, in document order, each with the note it resolves to (or null when no note answers to it) and its position. Answers from the index."
    )]
    fn links(
        &self,
        Parameters(p): Parameters<NoteParams>,
    ) -> Result<Json<LinksResult>, CallToolResult> {
        self.guarded(|ws| {
            let key = ws.note_key(&p.path).map_err(|e| fail(&e, Some(&p.path)))?;
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
                    })
                    .collect(),
            }))
        })
    }

    #[tool(
        description = "The notes that link to this note (embeds count), each with the position of the link. Answers from the index."
    )]
    fn backlinks(
        &self,
        Parameters(p): Parameters<NoteParams>,
    ) -> Result<Json<BacklinksResult>, CallToolResult> {
        self.guarded(|ws| {
            let key = ws.note_key(&p.path).map_err(|e| fail(&e, Some(&p.path)))?;
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
                    })
                    .collect(),
            }))
        })
    }

    #[tool(
        description = "Link targets that resolve to no note, with how many links name each, vault-wide. Answers from the index."
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
        description = "Every note the index knows, by path relative to the folder, in path order; at most 5000 per call."
    )]
    fn list_notes(&self) -> Result<Json<ListResult>, CallToolResult> {
        self.guarded(|ws| {
            let mut notes = ws.notes().map_err(|e| fail(&e, None))?;
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
        description = "Refresh the index from the folder (only what changed is re-read) and report what the run did. The only operation that writes, and it writes the index file outside the folder, never a note."
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
        let Ok(Json(listed)) = server.list_notes() else {
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
        assert!(server.list_notes().is_ok());
    }
}
