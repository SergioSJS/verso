# Decision memo: `verso mcp` for feature 6 (transport, surface, note identifier, protocol version, staleness)

- Date: 2026-09-22
- Status: **not decided.** Nothing in this memo is a decision: it lays out
  options, records facts and carries recommendations that are labelled as
  such. The maintainer decides (`CLAUDE.md` §1). While there is no decision,
  the feature 6 code is written **under the recommendations, marked
  provisional**, and changes if the maintainer decides otherwise — the same
  arrangement used for features 2 and 3. **Written down on 2026-09-22:** commit
  `61046f8` implements sections 2 to 6 provisionally, pending the five answers
  of section 9. It departs from the recommendations in **nothing**; it adds two
  things they do not mention, and both are recorded here rather than left to be
  found: `read_note` also carries **`unverified`**, from decision 2 of
  [ADR 0043](../adr/0043-placeholder-guard.md) (the index holds the note only as
  a last known version, because a placeholder stood where it was), and the
  **`ErrorData` messages** the client receives are English, like the tool
  descriptions and for the same `[OPEN]` reason (section 7).
- Revised: 2026-10-07 — the surface of section 3.3 widened to nine tools (typed relations on links and backlinks, `read_board`, properties and tags on `read_note`, `list_notes` filters, `query_base`): [ADR 0066](../adr/0066-mcp-sees-boards-relations-properties-bases.md); the same day, a typed note's `note_type` on `read_note` and a `type` filter on `list_notes` ([ADR 0052](../adr/0052-typed-note.md)).
- **Decision: taken by the maintainer on 2026-09-22**, in session, recorded
  here and in the closing PR: all five lines of section 9 as recommended, with
  one instruction attached — *"reavalie especialmente as contradições, às vezes
  o memorando estava teórico demais e não refletia a realidade, adapte o que
  precisar e resolva o problema"*. The contradiction was line 3: rule 4 of
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) required a handle
  for everything crossing the contract, and `verso mcp` names notes by path.
  **The rule was amended** rather than the code: a capability of access crosses
  as an opaque handle, a note's identity crosses as its path relative to the
  root, and an absolute path or one with `..` never crosses. The amendment is
  in ADR 0026 and in `CLAUDE.md` §2.1. What made it the right side to move: the
  rule exists so that iOS bookmarks and Android SAF URIs can cross a contract
  that paths could not carry, and a vault-relative name is not that kind of
  path — it is what the index keys by, what a citation needs to be verifiable,
  and what the Phase 2 file tree will have to display anyway.

  **Still owed on this branch, and it is Rust**
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)): findings 2 to 5 of the
  Opus 5 reading of `verso mcp` — the confined path as the index key and as the
  echoed `path`, refusals as tool results rather than JSON-RPC errors, typed
  `problems`, and the window bounds of `read_note`.

  **Revision, 2026-09-23.** Those four are in the code since `764fc77`. The
  Opus reading of the Phase 2 branch (`docs/review/phase-2.md`, reading 3,
  findings 8 and 19, and finding 1's poisoned lock) found three more, fixed:
  `read_note` of an empty note answers an empty window instead of
  `bad_window`; each tool's declared output schema admits the error shape too
  — an `anyOf` of the answer and `{kind, path, message}` — so a client that
  validates `structuredContent` accepts a refusal; and a panic inside a tool
  answers `failed` instead of leaving the call without an answer, with a
  poisoned lock taken over, so one bad note no longer stops the server for the
  rest of the session.
- Author: Opus 5 (documents, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Reviewer: Fable 5.1. The recommendations in sections 2 to 6 are **Fable
  5.1's**, recorded here as the author's input; they are not decisions. No Rust
  in this PR.
- Decides on: [ADR 0045](../adr/0045-server-and-mcp-security.md), the
  `verso mcp` group — **transport**, **surface** and **protocol version**,
  `[OPEN]` "before feature 6 of Phase 1" — and the part of
  [ADR 0044](../adr/0044-verso-fs-semantics.md)'s "opaque handles" group that
  reads *"what the agent receives over MCP as a note identifier"*, with the
  sentence that ADR 0044 itself anticipates: *"if the stable identifier ends up
  being the path relative to the root, rule 4 has to say so"*. The other half
  of that group — what a handle identifies inside the process, and for how
  long — belongs to the contract, item 2.1 of Phase 2, and is not answered
  here. Feature 6 of Phase 1 cannot close without the first group
  ([roadmap](../roadmap.md), Phase 1).
- Sources read: [ADR 0009](../adr/0009-external-constraints.md),
  [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [ADR 0022](../adr/0022-target-platforms-macos-first.md),
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0033](../adr/0033-pr-workflow.md),
  [ADR 0034](../adr/0034-roadmap-in-phases.md),
  [ADR 0035](../adr/0035-cross-cutting-requirements.md),
  [ADR 0039](../adr/0039-performance-targets.md),
  [ADR 0041](../adr/0041-multi-root-workspace.md),
  [ADR 0042](../adr/0042-open-from-command-line.md),
  [ADR 0043](../adr/0043-placeholder-guard.md),
  [ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0045](../adr/0045-server-and-mcp-security.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), the
  [roadmap](../roadmap.md) Phase 1 table and exit criterion 4, spec
  [`docs/spec/dialect.md`](../spec/dialect.md) §4.4 (position) and §9 **Q9**
  (per-block visibility), the three earlier memos
  ([`parser-decision.md`](parser-decision.md),
  [`fs-decision.md`](fs-decision.md),
  [`index-decision.md`](index-decision.md)), and the code that exists on this
  branch: `crates/verso-core/src/lib.rs`,
  `crates/verso-index/src/{store,search,schema}.rs`,
  `crates/verso-fs/src/lib.rs` and `crates/verso-cli/src/main.rs`. Section 8
  lists what was **not** verified.

## 1. What is being decided, and why now

Feature 6 of Phase 1 is a **read-only `verso mcp`: search, read, walk the
graph** ([roadmap](../roadmap.md), Phase 1, scope item 6). Two decision rows of
the same table fall due with it:

1. **MCP transport, exposed surface, protocol version**, `[OPEN]` in
   [ADR 0045](../adr/0045-server-and-mcp-security.md), "before feature 6
   closes".
2. **What an opaque handle identifies and for how long**, `[OPEN]` in
   [ADR 0044](../adr/0044-verso-fs-semantics.md), "before feature 6 closes" —
   of which feature 6 needs one sentence: what a client calls a note.

And exit criterion 4 of the phase is what fixes the shape of the answer:

> **Notes queryable by an agent.** Claude, connected to `verso mcp`, answers
> questions about the vault by searching, reading and walking the graph.
> Verification: a recorded session in which the agent answers and cites the
> source — by `^id` when the block has one, by line and column when it does
> not (`docs/spec/dialect.md` §4.4) — and the citation leads to the exact
> position.

Two things follow from that sentence, and they are the reason this memo is
longer than two decision rows. First, the **citation is part of the contract,
not of the prose**: if a tool result does not carry `line`, `col` and the
`^id`, the model has nothing to cite from and the criterion fails with nobody
at fault. Second, **the criterion is checked by a human in a session**, not by
CI, so the shape of every result has to be written down before the code, or the
maintainer is checking something nobody agreed to.

The decided material that constrains the answers, none of it reopened here:

- **MCP in the core, read-only in Phase 1**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md), Accepted): search, read,
  walk the graph. Query by type waits for the typed note (Phase 2).
- **Verifiable citation has two forms**, `^id` and position
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)), and position is line and
  **Unicode-character** column, both 1-based
  ([spec](../spec/dialect.md) §4.4).
- **Agent writes need a diff before applying**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md), item 4), and that is the
  recorded mitigation for the folder's content being untrusted input
  ([ADR 0045](../adr/0045-server-and-mcp-security.md)). Phase 1 has no write
  tool, so the mitigation is not exercised and no write can arrive "for
  convenience".
- **`verso-cli` hosts `mcp`** ([ADR 0028](../adr/0028-crate-structure.md)).
- **Rule 4 and rule 5 of the contract**
  ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), with the
  delimited scope): what crosses the contract is a handle, never a path string;
  a path as a string exists only at the entry edge and inside `verso-fs`; the
  files of the open folder are `verso-fs`'s.
- **What the walk returns** ([ADR 0044](../adr/0044-verso-fs-semantics.md)):
  symlinks followed, hidden entries not walked at any depth, an ignored note is
  an unresolved target and never a backlink source, a placeholder is
  present-with-no-content and is never opened
  ([ADR 0043](../adr/0043-placeholder-guard.md)).
- **The index is a rebuildable cache outside the tree**
  ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)), and the
  watcher comes after feature 2, with no date set
  ([ADR 0044](../adr/0044-verso-fs-semantics.md)).
- **macOS is the initial platform**
  ([ADR 0022](../adr/0022-target-platforms-macos-first.md)); on mobile there is
  no resident process and MCP is remote or in-process
  ([ADR 0009](../adr/0009-external-constraints.md)) — not Phase 1.
- **pt-BR and EN from the first commit of product code**
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)).

## 2. Decision 1 — the transport (ADR 0045)

### 2.1 What ADR 0045 names, and what each option costs

ADR 0045 states the choice in one line: *"stdio (child process of the client,
no port) or HTTP/SSE on a local port. If a port: binding only to `localhost`,
`Origin` checking, protection against DNS rebinding and a per-session token are
the publicly known minimum for local MCP servers."*

The ADR is describing two different threat surfaces, not two ways of moving
bytes:

- **stdio.** The client spawns `verso mcp <folder>` as a child process and
  talks to it over the child's standard input and output, one JSON-RPC message
  per line. Nothing listens anywhere. The server's lifetime is the client's:
  it exits when the client closes stdin. Who may connect is decided by who may
  spawn a process as the user, which is the operating system's answer, not
  ours.
- **HTTP on a local port.** The server binds a socket. Every process on the
  machine can reach it, and so can a web page the user has open, unless the
  server checks `Origin`, guards against DNS rebinding and demands a token.
  Each of those is a mechanism we would have to write, test and keep right, and
  each is a way to be wrong about who is reading the vault.

### 2.2 Side by side

| | stdio | Streamable HTTP on `localhost` |
|---|---|---|
| Who can reach the vault | whoever can spawn a process as the user | every process on the machine, and any web page, until `Origin`, DNS-rebinding and token checks are all correct |
| Code we own for access control | none | three mechanisms, each a way to be wrong |
| Works with Claude Desktop and Claude Code | yes, that is how a local server is configured there | yes, with a URL |
| Remote client (the phone, another machine) | no | yes |
| Several clients at once | one process per client | one process, several sessions |
| Server lifetime | the client's | its own, resident |
| What `verso serve` questions it drags in ([ADR 0045](../adr/0045-server-and-mcp-security.md)) | none | authentication, TLS, exposure — the group ADR 0045 dates to "before it enters scope" |
| Cost of changing later | a second transport behind a flag; the tools do not change | — |
| Dependency | the SDK's stdio transport (section 5) | the SDK's HTTP server features, which pull an HTTP stack |

### 2.3 What stdio costs, stated plainly

- **No remote client.** The phone cannot reach it; neither can a second
  machine. That is the same place [ADR 0009](../adr/0009-external-constraints.md)
  already leaves mobile in Phase 1.
- **One process per client.** Two clients, two processes, two SQLite
  connections to the same index file. SQLite handles concurrent readers; two
  concurrent `index()` runs are the case to think about, and section 6 says
  what is proposed there.
- **Diagnostics go to stderr, not stdout.** stdout carries the protocol. A
  stray `println!` corrupts the session. That is a rule for the code, recorded
  here so it is not discovered in a debugging session.

### 2.4 Recommendation of Fable 5.1 for decision 1

**stdio.** `verso mcp <folder>` is spawned by the client as a child process; no
port is opened, no socket is bound, and the `Origin`, DNS-rebinding and token
surface that ADR 0045 lists as "the publicly known minimum" **does not exist to
get wrong**. The HTTP transport is a later feature, if and when a remote client
needs one, and it arrives with the `verso serve` questions of ADR 0045
attached, which is the honest order: the transport that needs authentication
comes with the authentication decision, not before it.

Two rules that come with the choice, for the PR rather than for this ADR:
everything the server says to a human goes to **stderr**, and the process
**exits cleanly when stdin closes**, so a client that goes away does not leave
a process holding the index.

**Discarded alternatives considered:** Streamable HTTP on `localhost`, written
out in section 2.2 because ADR 0045 names it — not recommended now for the
reason above. SSE as a separate transport was not evaluated: it is the
superseded form of the same thing and the SDK treats it as legacy.

## 3. Decision 2 — the surface, and what it hands over (ADR 0045, spec Q9)

### 3.1 What the code can already answer, on this branch

Read from the code, not from memory. `verso_core::Workspace` exposes today:
`open`, `folder`, `index`, `search(words, limit)`, `backlinks(note)`,
`unresolved()` and `notes()`. `verso_index` exposes `Hit { path, snippet }`,
`Backlink { from, target, embed, line, col }`,
`Link { embed, target, heading, block, alias, line, col, start, end, resolved }`
and `Unresolved { target, count }`. The index schema also stores, per note,
`headings(level, text, line, col, start, end)` and
`blocks(id, line, col, start, end)`. `verso_fs::Root` gives `handle(relative)`,
`read(handle) -> (bytes, Stamp)` and `walk()`.

Three gaps follow, and the memo names them so the surface is not proposed as if
it were free:

1. **Nothing returns the text of a note.** `read_note` needs `verso-core` to
   grow a method that takes a relative path, gets a handle from `Root` and
   reads it. The pieces exist; the method does not.
2. **Nothing queries headings and blocks.** They are in the index schema and
   `verso-index` has no `pub fn` that reads them back. `read_note` needs one.
3. **Outgoing links are not exposed by `verso-core`.** `Index::links_of`
   exists; `Workspace` does not call it.

None of that is a decision — it is what feature 6 has to write, and it belongs
in the PR's "What".

### 3.2 Tools or resources

MCP offers two ways to give a model access to content. **Resources** are
things the client can list and read, and a client may fetch them on its own
schedule; **tools** are calls the model makes, which a client shows and can ask
the user to approve.

For a folder of notes the difference matters in one way that is not about
ergonomics: a tool call is an **event** — it appears in the client's log, it
can be shown, it can be refused. A resource read is plumbing. Given that ADR
0045's recorded risk is that the folder's content is untrusted input for the
agent, a surface where every access to the vault is a visible, attributable
call is the one that leaves a trace of what was read.

### 3.3 The seven tools, as proposed

Names are lower snake case, which is what the SDK's tool router produces from a
method name. Every tool takes and returns JSON; the shapes below are the
proposal that the exit criterion will be checked against.

| Tool | Arguments | Answers |
|---|---|---|
| `search` | `words: string`, `limit: integer` (default 20, cap 100) | notes matching the words, with a snippet |
| `read_note` | `path: string`, `from_line: integer?`, `to_line: integer?` | the note's text as numbered lines, with its headings and `^id` blocks |
| `links` | `path: string` | the note's outgoing links, with their resolution |
| `backlinks` | `path: string` | the links that point at the note |
| `unresolved` | — | link targets that resolve to no note, with counts |
| `list_notes` | — | every note the walk lists, by path |
| `index` | — | refresh the index; returns what the run did |

`index` is **the one operation that is not a read**, and what it writes is the
index file, outside the tree, a rebuildable cache
([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)). It writes
nothing in the folder. No tool in Phase 1 writes a note, renames one, deletes
one or creates one.

The results, as proposed:

```json
// search
{ "hits": [ { "path": "npcs/Barão Vermelho.md", "snippet": "…o barão governa o…" } ],
  "truncated": false }

// read_note
{ "path": "npcs/Barão Vermelho.md",
  "line_count": 58,
  "lines": [ { "n": 1, "text": "---" }, { "n": 2, "text": "type: npc" } ],
  "headings": [ { "level": 2, "text": "Segredos", "line": 12, "col": 1 } ],
  "blocks":   [ { "id": "a1b2c3", "line": 47, "col": 3 } ],
  "from_line": 1, "to_line": 58, "truncated": false,
  "stale": false }

// links
{ "path": "sessoes/Sessão 12.md",
  "links": [ { "target": "Barão Vermelho", "resolved": "npcs/Barão Vermelho.md",
               "embed": false, "heading": null, "block": null, "alias": null,
               "line": 9, "col": 14 } ] }

// backlinks
{ "path": "npcs/Barão Vermelho.md",
  "backlinks": [ { "from": "sessoes/Sessão 12.md", "target": "Barão Vermelho",
                   "embed": false, "line": 9, "col": 14 } ] }

// unresolved
{ "unresolved": [ { "target": "Taverna do Corvo", "count": 3 } ] }

// list_notes
{ "notes": [ "npcs/Barão Vermelho.md" ], "count": 1, "truncated": false }

// index
{ "indexed": 12, "unchanged": 340, "removed": 1, "placeholders": 2,
  "unreadable": [ { "path": "anexos/x.md", "error": "…" } ],
  "problems": [ "…" ] }
```

Every tool that can return a long answer carries `truncated`, and every cap is
a number in the tool's description, so a model that gets half an answer is told
so rather than concluding the vault is small. `read_note` on a large note is
the case that matters: `from_line`/`to_line` exist so a second call can fetch
the rest.

### 3.4 The shape of a citation

Exit criterion 4 asks that the citation **lead to the exact position**. What
makes that possible, and what does not:

- **A block with an `^id` is cited by the `^id`.** `read_note` returns every
  block id in the note with its position, so the model quotes the id and Verso
  (or the maintainer, or Obsidian's search) finds it. The id is written in the
  file, so it is stable across reindexing — which is exactly why
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md) chose it.
- **Anything else is cited by `line` and `col`**, 1-based, `col` counting
  Unicode scalar values ([spec](../spec/dialect.md) §4.4).
- **`line` is read, never counted.** That is what the `lines` array buys: the
  number is in the payload beside the text. A plain string would make the model
  count lines, and a model that miscounts produces a citation that points at
  the wrong paragraph while looking correct — the failure mode the criterion
  exists to catch.
- **`col` is given by Verso for the constructs Verso indexed** (a heading, a
  block, a link) and is **1 for a citation of a whole line**. This is the
  residual, and it is stated rather than hidden: for a phrase in the middle of
  a line, the column the model reports is counted by the model, and §4.4's
  "Unicode scalar values, not bytes and not UTF-16 units" is precisely the kind
  of counting a model is not reliable at. Two ways out, neither recommended for
  Phase 1: a `cite(path, line, col)` tool that Verso answers with the text it
  finds there, so a citation is verifiable by a call; or a rule that a citation
  with no `^id` is a **line** citation and carries no column at all.
- **The `^id` is not invented.** No tool proposes an id for a block that has
  none. Writing one into the file would be the app rewriting a file on read,
  which invariant 7 and [ADR 0012](../adr/0012-files-are-source-of-truth.md)
  forbid.

### 3.5 What "read-only" hands over: Q9 and the game master's secrets

This is the part of ADR 0045 that is not a technical choice, and it is written
here in the plainest words available.

**`verso mcp` hands the whole folder to any client that connects.** Every note
the walk lists is searchable by `search`, readable by `read_note` and listable
by `list_notes`. The game master's secrets — the ones that spec **Q9**
(per-block visibility) exists to hide from a player — have **no syntax yet**:
Q9 is `[OPEN]` and its moment is "before sharing and export", which is
§17 item 8, not Phase 1. There is nothing to respect, so nothing is respected.

What is excluded, and it is not the secrets: hidden entries are not walked at
any depth ([ADR 0044](../adr/0044-verso-fs-semantics.md)), so `.obsidian/`,
`.git/` and `.trash/` are out; the configurable ignore list is out; a
placeholder is present with no content and is never opened
([ADR 0043](../adr/0043-placeholder-guard.md)).

**Until Q9 exists, the only mitigation is which folder is opened.** That is a
sentence for the tool's own documentation, not a setting: a folder given to
`verso mcp` is a folder whose entire contents the connected model can read.
The maintainer may want a second line of defence in Phase 1 — the ignore list
of [ADR 0044](../adr/0044-verso-fs-semantics.md) already excludes paths from
the walk, so a `segredos/` folder listed there is invisible to MCP as it is to
the index. That is a use of a decided mechanism, not a new one, and it is
recorded as an option rather than recommended, because "ignored" also means
"not indexed, not a backlink source", which may not be what the maintainer
wants for their own notes.

### 3.6 Recommendation of Fable 5.1 for decision 2

**The seven tools of section 3.3, as MCP tools and not as resources**, with the
JSON shapes given there, `truncated` on every capped answer, and citations as
section 3.4 describes: `^id` when the block has one, `line` and `col` from
spec §4.4 when it does not, with `line` read from the payload rather than
counted.

**No write tool in Phase 1.** ADR 0018's diff-before-apply is the recorded
mitigation for untrusted folder content and it has no phase assigned; until it
does, `verso mcp` cannot write, and `index()` — which touches only the
rebuildable index file — is the only non-read operation on the surface.

**The Q9 exposure is recorded in the ADR and in the command's help**, in the
words of section 3.5, as a known and accepted consequence of shipping feature 6
before Q9 closes — not as a footnote.

**Discarded alternatives considered:** MCP **resources** instead of tools
(section 3.2) — not recommended, because a resource read leaves no call for the
client to show. MCP **prompts** were not evaluated: nothing in the roadmap asks
for them. A **per-tool allow list** of folders was not evaluated either; the
ignore list of ADR 0044 already exists and section 3.5 records it as the option
it is.

## 4. Decision 3 — what a note is called over MCP (ADR 0044, ADR 0026 rule 4)

### 4.1 What the code has today

- `verso_fs::Handle` is `{ root: u32, index: u32 }`: opaque, **carries no
  path**, and is *"valid only for the `Root` that handed it out: a handle from
  another root is refused, not resolved"*. It is a process-local token. It has
  no serialization, and two runs of `verso mcp` over the same folder would hand
  out different handles for the same note.
- `verso_index` is keyed by **`path TEXT NOT NULL UNIQUE`**, the path relative
  to the root. `Hit.path`, `Backlink.from`, `Link.resolved` and `notes()` are
  all relative paths as strings.
- `Workspace::backlinks` already accepts a note *"with or without `.md`"*.
- `verso` the CLI already prints relative paths in its JSON output, and the
  maintainer already reads them.

### 4.2 The options, side by side

| | the path relative to the root | an opaque id (index row id, or a hash of the path) |
|---|---|---|
| A citation a human can follow | yes: `npcs/Barão Vermelho.md`, line 47 | no: "note 4711, line 47" leads nowhere without the server |
| Stable across a restart | yes, while the file keeps its name | row id: no — the index is a rebuildable cache and rebuilding renumbers. Hash: yes, and it is a path in disguise |
| Stable across a rename | no — a renamed note is a new identifier | hash: no either, for the same reason; row id: no |
| What the model already knows | the same string Obsidian, the CLI and the user use | a number it has to carry around |
| Round-trip through a tool argument | direct | needs a lookup table kept somewhere |
| Rule 4 of [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) | a string crosses the edge: the rule has to say so | the rule is satisfied in form |
| What confinement has to do | check every path a client sends (section 4.3) | check the id is known; the path never crosses |

The second column's last row is the honest argument for the opaque id, and it
is why ADR 0044 recorded the question instead of assuming: a client that can
only name notes by ids the server handed out cannot name a note the server did
not list. A client that sends paths can send any path, and the refusal list
becomes load-bearing.

### 4.3 What confinement means at this edge

With paths crossing, **every path a client sends is confined before use**, and
`verso-fs` already implements exactly that list. `Root::handle` refuses:

- an **absolute** path, a **`..`** component, a **NUL** byte — the
  request-level confinement of [ADR 0044](../adr/0044-verso-fs-semantics.md)
  (`ConfinementError`);
- a **hidden** component at any depth, and an **ignored** path — provisional in
  ADR 0044, recorded from the feature 2 code.

Three notes on applying it at the MCP edge:

1. **A path that is only an index key must be confined too.** `backlinks` and
   `links` answer from the index and a bad path there escapes nothing — it
   simply matches no row. Confining anyway is what makes the refusal list a
   property of the **surface** rather than of each tool's implementation, and
   it is the difference between "cannot escape today" and "cannot escape".
2. **`read_note` reads the disk**, so it goes through `Root::handle` plus
   `Root::read`, and inherits the placeholder guard: a note whose content has
   not been downloaded answers *unavailable*, never *empty*
   ([ADR 0043](../adr/0043-placeholder-guard.md)).
3. **A symlink inside the folder is followed** and what it reaches counts as
   inside the folder for every purpose, MCP included
   ([ADR 0044](../adr/0044-verso-fs-semantics.md)). That is decided; it is
   repeated here because "confinement" at this edge is a property of the
   request, not of where the user's own folder leads.

Two smaller shapes, so the code does not decide them by silence: the separator
is **`/`** (macOS and Linux when this was written; Windows became a target on
2026-09-23, [ADR 0022](../adr/0022-target-platforms-macos-first.md), and the
port keeps `/` there too: `verso-fs` writes it in every path relative to the
folder and turns it into the OS's form only at the disk — provisional,
[ADR 0069](../adr/0069-windows-port.md), item 9), and the path is
returned **with `.md`**, exactly as `list_notes` and `search` print it, while
the lenient acceptance of a path without `.md` that `Workspace::backlinks`
already has is kept.

### 4.4 Recommendation of Fable 5.1 for decision 3

**The path relative to the root, as a string, is the note identifier at the MCP
edge.** It is the identifier Obsidian uses, the one the CLI prints, the one the
user types, and the only one from which a citation leads anywhere without the
server's help. The opaque `Handle` stays **internal to the process**: it is
what `verso-core` uses to reach `verso-fs`, and it never appears in a tool
argument or a tool result.

**With the consequence ADR 0044 names, spelled out in rule 4 of
[ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md):** the relative
path **is** the stable identifier at the MCP edge, and confinement (absolute,
`..`, NUL, hidden, ignored → refused) applies to **every path a client sends**,
whether the tool touches the disk or only the index. Rule 4's own words — *"a
path as a string exists only at the entry edge"* — then cover MCP by saying so,
rather than by an argument about what counts as an edge.

**What this does not decide:** what a handle identifies inside the process
(open descriptor or table index) and how long it stays valid. That is the other
half of ADR 0044's group, it belongs to the contract, and its moment is item
2.1 of Phase 2.

**Discarded alternatives considered:** the opaque id per note, of section 4.2 —
not recommended: an index row id is not stable across a reindex, and a hash of
the path is a path in disguise that also destroys the citation. Nothing else
was considered.

## 5. Decision 4 — the dependency and the protocol version (ADR 0045)

### 5.1 What was checked in the crate, on 2026-09-22

Read from the crate itself — `cargo info rmcp` against the crates.io index and
the crate archive in the local registry cache — not from memory:

- **`rmcp` 3.4.0**, described as *"Rust SDK for Model Context Protocol"*,
  **Apache-2.0**, `rust-version` 1.88 (the workspace pins 1.98), repository
  `github.com/modelcontextprotocol/rust-sdk` — that is, it is published under
  the protocol's own organization.
- **Default features are `base64`, `macros`, `server`.**
- **`server = [transport-async-rw, schemars, dep:pastey, uuid]`.** So
  `schemars` and `uuid` are **not optional**: turning on the server turns them
  on. A memo that promised "schemars only if we want tool schemas" would be
  wrong.
- **`transport-io = [transport-async-rw, tokio/io-std]`** is the stdio
  transport, and **`transport-async-rw = [tokio/io-util, tokio-util/codec]`**.
  `rmcp::transport::io::stdio()` returns `(tokio::io::Stdin,
  tokio::io::Stdout)`.
- **`macros = [dep:rmcp-macros, dep:pastey]`** brings `#[tool]`,
  `#[tool_router]` and `#[tool_handler]`, which turn an `impl` block into the
  tool list and the dispatch; the SDK's own documentation says
  `#[tool_router(server_handler)]` emits the handler for a tools-only server.
- **Everything HTTP, everything auth and the whole client side are behind
  features that stay off**: `server-side-http`, `transport-streamable-http-*`,
  `auth`, `reqwest`, `client`. Choosing stdio is therefore also a choice about
  what gets compiled.
- **Protocol versions known to this SDK**, from `src/model.rs`:
  `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25` and `2026-07-28`, with
  **`LATEST = 2025-11-25`**. The specification is versioned by date, which is
  what ADR 0045 means by *"the specification has already changed transport and
  authorization model more than once"*.
- **The version is negotiated at `initialize`**: `negotiate_protocol_version`
  in `src/service/server.rs` compares what the client asked for against
  `Service::supported_protocol_versions()` and answers with the agreed version,
  or with an `unsupported protocol version` error. Nothing in our code picks a
  date; our code picks a **ceiling**, and the SDK's default ceiling is
  `LATEST`.

### 5.2 The tree it brings, resolved on this branch

`Cargo.lock` resolved **61 new crates** for `rmcp` with `server`,
`transport-io` and `macros`. The ones worth naming: `tokio` 1.53.1 and
`tokio-util` 0.7.19; `schemars` 1.2.2 with `darling` and
`serde_derive_internals`; `serde` 1.0.229 and `serde_json` 1.0.151; `uuid`
1.26.1; `chrono` 0.4.45 (pulled by both `rmcp` and `schemars`), which is what
drags in `iana-time-zone`, the `windows-*` crates and `wasm-bindgen`/`js-sys`
for targets we do not build; `futures` 0.3.34; `tracing` 0.1.44.

**`cargo deny check licenses` passes on that tree** (run on 2026-09-22 on this
branch: `licenses ok`, exit 0). `rmcp` itself is Apache-2.0, already in the
allowlist of `deny.toml`.

**On `unsafe` and on size, stated rather than discovered in review:** the
workspace forbids `unsafe_code` in **our** crates
([ADR 0029](../adr/0029-guardrails-in-ci.md)); an async runtime contains
`unsafe` by nature and that `unsafe` is the dependency's, not covered by our
lint — the same sentence
[`index-decision.md`](index-decision.md) had to write for `rusqlite`. Sixty-one
crates is the largest single addition Phase 1 has made.

**Where it lands in the crate structure:** `verso-cli` is the **only** crate
that depends on any of it. `verso-core`, `verso-index` and `verso-fs` stay
synchronous; `verso-dialect` keeps its "no IO, no async"
([ADR 0028](../adr/0028-crate-structure.md)), which is what keeps it fuzzable
and compilable to WASM. ADR 0028 says the dialect has no async; it says nothing
against the CLI having one, and the CLI is where a protocol server belongs
([ADR 0028](../adr/0028-crate-structure.md): `verso-cli # index, search,
backlinks, mcp`). The async boundary is therefore one crate deep: the tool
handlers are `async fn` that call synchronous `verso-core` methods.

### 5.3 The alternative: JSON-RPC by hand

MCP is JSON-RPC 2.0 over a stream, and with stdio chosen the transport is
`stdin`/`stdout` line by line. `serde_json` is already a plausible dependency.
What writing it by hand actually costs:

- `initialize` and the **version negotiation**, including what to answer a
  client that asks for a date we do not know;
- the **capabilities** object, and getting its shape right for each protocol
  date;
- `tools/list` with a **JSON Schema per tool** — which is what `schemars`
  generates from the argument types in the SDK path — and `tools/call`;
- `notifications/initialized`, `ping`, and the JSON-RPC **error codes**;
- keeping up, by hand, with a specification that has changed transport and
  authorization model more than once
  ([ADR 0045](../adr/0045-server-and-mcp-security.md)) — five dates exist
  already.

What it saves: 61 crates, an async runtime, and the whole `chrono`/`uuid`
branch. It is a real trade and the maintainer may take it; what it is not is
"a few hundred lines of JSON-RPC".

### 5.4 Recommendation of Fable 5.1 for decision 4

**`rmcp` 3.4, `default-features = false`, `features = ["server",
"transport-io", "macros"]`** — the server side, the stdio transport, the tool
macros, and nothing else. Relative to the crate's defaults that drops `base64`;
what it *keeps out* is the whole HTTP, auth and client half, which is the point
of writing it explicitly (section 5.1). `tokio` with the minimal features the
transport needs, `serde` with `derive`, `serde_json`; `schemars` arrives
through `server` whether or not we ask for it.

**The protocol version is whatever `initialize` negotiates**, with the SDK's
default ceiling (`LATEST`, `2025-11-25` in 3.4.0). The PR **records the
negotiated version it observed** with the client the maintainer used, so that a
later change in the SDK is visible as a change rather than as a mystery. If the
maintainer prefers a pinned ceiling, `supported_protocol_versions` is the one
method to override and `ProtocolVersion::known_up_to` is what it returns —
recorded as the option it is, not recommended, because pinning a ceiling by
hand means remembering to raise it.

**Justified in the PR** ([ADR 0033](../adr/0033-pr-workflow.md)): the
dependency, what it replaces in our own code (a hand-written JSON-RPC 2.0
server with its own schema generation — section 5.3), the 61-crate tree, the
`unsafe` sentence of section 5.2, and a green `cargo deny check`.

**Discarded alternatives considered:** hand-rolled JSON-RPC 2.0 over stdio with
`serde_json` only, section 5.3. No other MCP crate was evaluated: `rmcp` is
published under the protocol's own organization and the others were not looked
at.

## 6. Decision 5 — what the agent gets when the index is stale

### 6.1 The problem, in one paragraph

`verso mcp` answers `search`, `backlinks`, `links` and `unresolved` from the
**index**, and `read_note` from the **file**. There is no watcher: ADR 0044
puts it after feature 2 with no date set. So a note edited in Obsidian while
the server runs is fresh through `read_note` and stale through everything else,
and a model asked "what links here" can get an answer that was true five
minutes ago. Nothing about this is a bug; what would be a bug is not saying it.

### 6.2 The options, side by side

| | index once at start, plus an `index()` tool | reindex on every call | a watcher |
|---|---|---|---|
| First answer after the client connects | after one incremental pass | same | same |
| Cost per call | none | a full walk of the folder per `search` | none |
| Freshness | whatever the last `index()` left | always fresh | near-live |
| Who decides to refresh | the model, or the user through the client | nobody, it is automatic | nobody |
| New machinery | none | none | the watcher, `inotify` limits, debouncing ([ADR 0044](../adr/0044-verso-fs-semantics.md)) |
| Fits the phase | yes | yes, at a cost with no measurement behind it ([ADR 0039](../adr/0039-performance-targets.md)) | no: after feature 2, no date set |

### 6.3 Recommendation of Fable 5.1 for decision 5

**Index once at start — the incremental pass `Workspace::index` already
does — and expose `index()` so the client can refresh on demand.** No watcher
in feature 6.

**Plus one thing the code can do for free, and should:** `read_note` compares
the file's `Stamp` against the stamp the index holds (`Index::stamp_of` and
`Root::read` both exist and return the same three fields — modified time,
length, hash) and returns **`stale: true`** when they differ. The model is then
told, in the one tool that reads the disk, that the graph answers it got may
predate the note it is reading. That is one boolean, no new machinery, and it
turns a silent inconsistency into a fact the model can act on by calling
`index()`.

**Two clients at once** (section 2.3): two processes, one index file. Concurrent
readers are SQLite's ordinary case; two concurrent `index()` runs are not, and
the PR says what it does there — the simplest correct answer being that the
second waits.

**Discarded alternatives considered:** reindexing on every call, and the
watcher, both in section 6.2.

## 7. Not for decision here

Listed so the maintainer sees what feature 6 carries out from decisions already
taken. Nothing in this section is open.

- **Rule 5's scope** ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)):
  `verso mcp` lives in `verso-cli`, which touches neither the folder nor the
  index directly. The folder is `verso-fs`'s, the index file is
  `verso-index`'s, the configuration directory is `verso-core`'s, and
  `verso-dialect` has no IO
  ([ADR 0028](../adr/0028-crate-structure.md)).
- **Why there is no write tool** ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [ADR 0045](../adr/0045-server-and-mcp-security.md)): the folder's content is
  untrusted input for the agent, the recorded mitigation is a diff before
  applying any agent write, and that mitigation has no phase assigned. Phase 1
  is read-only by the roadmap
  ([ADR 0034](../adr/0034-roadmap-in-phases.md)) and stays so.
- **Read-only does not make the input trusted.** A note can carry instructions
  aimed at the model; that risk is recorded in
  [ADR 0045](../adr/0045-server-and-mcp-security.md) and is not re-decided
  here. What Phase 1 offers against it is that nothing the model reads can
  cause a write.
- **Query by type** ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)): waits
  for the typed note and the schema format, Phase 2.
- **Exit criterion 4 is verified by a recorded session**
  ([roadmap](../roadmap.md)), not by CI: the maintainer connects a client, asks
  questions, and checks that a citation leads where it says. No feature
  guardrail of [ADR 0029](../adr/0029-guardrails-in-ci.md) is assigned to
  feature 6.
- **Citation by `^id` or by position**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md), [spec](../spec/dialect.md)
  §4.4): decided; section 3.4 carries it out and invents nothing.
- **The walk's semantics** ([ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0043](../adr/0043-placeholder-guard.md)): hidden entries not walked, an
  ignored note an unresolved target and never a backlink source, a placeholder
  never a deletion and never opened. MCP inherits all of it.
- **Multi-root** ([ADR 0041](../adr/0041-multi-root-workspace.md), `PROPOSED`):
  one root, one index, one `verso mcp` process in Phase 1.
- **`verso serve` and the contract's session identity**
  ([ADR 0045](../adr/0045-server-and-mcp-security.md)): other moments — before
  it enters scope, and before item 2.1 of Phase 2.
- **The index's location, tokenizer and resolution rule**
  ([ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md),
  [`index-decision.md`](index-decision.md)): feature 3's memo. MCP consumes the
  answers.

**What stays open after this memo**, so that deciding five things does not look
like deciding more: **Q9** itself (per-block visibility has no syntax, and
section 3.5 records the exposure rather than closing the question); the other
half of ADR 0044's handles group (what a handle identifies inside the process,
Phase 2); whether the **tool descriptions** the model reads are bilingual, or
English only while the CLI's user-facing strings are both
([ADR 0035](../adr/0035-cross-cutting-requirements.md) says "no loose string
literal" for messages to the user, and a tool description is read by a model,
not by the user — `[DECIDED 2026-10-21]`, English only, the maintainer's
mark on 0045.lang); the disambiguation between
`verso <folder>` and a subcommand, which now gains a fourth subcommand
([ADR 0042](../adr/0042-open-from-command-line.md)); the exit code of a server
that is meant to run until its client closes stdin, against the provisional
0/1/2/3 of feature 4; a `cite` tool that verifies a citation (section 3.4); an
MCP fixture schema, which does not exist any more than the `verso-fs` and
`verso-index` ones do.

## 8. What this memo did not verify

- **The server was run; no client was connected.** Marked on 2026-09-22 —
  originally *"no MCP server was run, and no client was connected"*. Commit
  `61046f8` drives the built binary in JSON-RPC over its stdin in two end-to-end
  tests, so `initialize`, `tools/list` and `tools/call` are observed working,
  with `2025-06-18` and `2025-03-26` each negotiated as asked. What is still not
  observed is a **client**: neither Claude Desktop nor Claude Code has
  connected, and no session has been recorded. **Exit criterion 4 of the phase
  therefore remains entirely for the maintainer.**
- **The exact `rmcp` API was read, not compiled against.** `stdio()`,
  `ServiceExt::serve`, `#[tool_router]`, `#[tool]`, `#[tool_handler]` and
  `negotiate_protocol_version` were read in the crate source in the local
  registry cache for 3.4.0. No code was written against them here and
  `cargo build -p verso-cli` was **not** run in this session.
- **Which protocol date a given client asks for was not observed.** The five
  dates and `LATEST = 2025-11-25` come from the SDK's source. What Claude
  Desktop or Claude Code sends at `initialize` is unknown until a session runs,
  which is why section 5.4 asks the PR to record it.
- **Whether a client needs the tool schemas in a particular form was not
  verified.** The SDK generates JSON Schema from the argument types through
  `schemars`; that this is enough for a given client is an assumption until a
  client connects.
- **Only `cargo deny check licenses` was run**, not `advisories`; the advisory
  database was not fetched in this session.
- **Nothing was measured**: not the token cost of a `read_note` on a real note,
  not the latency of a `search` over the maintainer's vault, not the memory of
  a resident server. Performance targets are `[OPEN]`
  ([ADR 0039](../adr/0039-performance-targets.md)) and the baseline is
  feature 5's.
- **The caps in section 3.3 are proposals, not measurements.** 20 hits by
  default and 100 at most are round numbers; what a client's context actually
  tolerates was not tested.
- **Whether a stdio server's stderr reaches the client's log was not checked**
  on any client, so "diagnostics go to stderr" is a rule for our code rather
  than an observed path to the maintainer's eyes.
- **Q9 was not designed here, and nothing about it was observed in Obsidian.**
  Section 3.5 records an exposure; it does not propose a syntax, which would be
  deciding an `[OPEN]` question the spec dates to a later moment.
- **No fixture schema exists for MCP**, the same gap
  [`fs-decision.md`](fs-decision.md) and [`index-decision.md`](index-decision.md)
  record for their crates. Spec §4 covers dialect fixtures only, and this memo
  does not invent an extension of it.

## 9. How the maintainer decides and verifies, without reading code

**Check that the memo is what the PR says it is:**

```
git fetch origin && git checkout phase1/mcp-decision
git diff --stat origin/main..HEAD          # two files under docs/, no fixtures/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # unchanged fixtures still pass the lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # author and Signed-off-by are yours
```

**Optionally, repeat the check** of section 5.1 in one command — `cargo info
rmcp` prints the version, the licence and the feature list the memo quotes.

**Decide, in five lines on the PR:**

1. **Transport.** Fable 5.1 recommends *stdio: `verso mcp <folder>` spawned by
   the client as a child process, no port, no `Origin`/DNS-rebinding/token
   surface; HTTP as a later feature, with the `verso serve` questions
   attached*.
2. **Surface.** Fable 5.1 recommends *the seven tools of section 3.3 —
   `search`, `read_note`, `links`, `backlinks`, `unresolved`, `list_notes`,
   `index` — as tools rather than resources, with the JSON shapes given there,
   citations by `^id` or by line and column, no write tool, and the Q9 exposure
   of section 3.5 written into the ADR and into the command's help*.
3. **Note identifier.** Fable 5.1 recommends *the path relative to the root, as
   a string, with rule 4 of ADR 0026 saying so, confinement applied to every
   path a client sends, and the opaque `Handle` staying inside the process*.
4. **Dependency and protocol version.** Fable 5.1 recommends *`rmcp` 3.4 with
   `default-features = false` and `features = ["server", "transport-io",
   "macros"]`, `tokio` minimal, `serde`/`serde_json`; the version whatever
   `initialize` negotiates, recorded in the PR*. 61 new crates, `cargo deny
   check licenses` green.
5. **Staleness.** Fable 5.1 recommends *one incremental index at start, an
   `index()` tool for refreshing, no watcher, and `stale: true` on `read_note`
   when the file's stamp differs from the index's*.

**What the closing PR records, if the recommendations are accepted:**

| Where | What it gains |
|---|---|
| [ADR 0045](../adr/0045-server-and-mcp-security.md) | the `verso mcp` group answered — transport, surface, protocol version — and the Q9 exposure of section 3.5 recorded as an accepted consequence; that group's status changes from `[OPEN]` to Accepted, while the contract and `verso serve` groups stay open |
| [ADR 0044](../adr/0044-verso-fs-semantics.md) | the handles group gains its MCP half: the relative path is the identifier at the MCP edge. The in-process half stays `[OPEN]` for Phase 2, item 2.1 |
| [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) | rule 4's scope gains the sentence ADR 0044 anticipated, naming the relative path as the stable identifier at the MCP edge and the confinement that comes with it |
| [ADR 0018](../adr/0018-llm-native-mcp-in-core.md) | the consequence that points at ADR 0045 for transport, surface and version gets its answer |
| [roadmap](../roadmap.md), Phase 1 | the two decision rows struck through, as Q18, ADR 0037, Q26 and the index rows were |
| [`docs/spec/dialect.md`](../spec/dialect.md) §9 | **nothing decided**: Q9 stays open, and section 3.5's exposure is recorded in ADR 0045 rather than in the spec |
| `fixtures/` | nothing: an MCP fixture needs a schema first (section 8) |
