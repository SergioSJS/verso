# ADR 0026 — Core↔UI contract and inviolable architecture rules

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §10, §10.1
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-21 — scope of rules 4 and 5 delimited (Phase 0 review,
  C2). The decision did not change; what changed is the boundary where it
  holds. 2026-09-22 — rule 4 amended by the maintainer
  (`docs/reference/mcp-decision.md`, the decision of 2026-09-22): access
  crosses as an opaque handle, a note's identity as its path relative to the
  open folder, and an absolute path or one with `..` never crosses; the old
  wording is kept beside the new one in the Decision. 2026-09-24 — two
  sentences that still called the handles `[OPEN]`, or said rule 4 was not
  rewritten, brought in line with a note each: the amendment happened, and
  the handles group of [0044](0044-verso-fs-semantics.md) was decided on
  2026-09-24, as built for Phase 2 (`docs/reference/handles-decision.md`).
  2026-10-09 — rule 4 clarified for a server, the rule unchanged, with the
  maintainer's acceptance of [0073](0073-self-hosted-server-first.md) that
  day and the handles group of [0044](0044-verso-fs-semantics.md) decided
  for `verso serve`: on a server the access capability is the
  authenticated session and its role in the folder, checked by the core on
  every command and every file request before `verso-fs` acts; a note
  stays named by its path relative to the folder; nothing else crosses —
  no per-file capability. The pre-signed URL of a bucket stays `[OPEN]`
  (0073 item 4). Rule 5's scope gains the server's own database, beside
  the index file ([0028](0028-crate-structure.md), revised the same day).
  The Consequence that left session identity to
  [0045](0045-server-and-mcp-security.md) is answered by
  [0074](0074-accounts-and-access-on-the-server.md) item 11. Each is a
  note beside the text it concerns.
  2026-10-12 — the provisional records of 2026-09-22 ratified by the
  maintainer as built and tested, answering the ADR audit in session:
  *"Ajuste tudo que precisar. Está aprovado os ADRs"* (adjust whatever
  needs it; the ADRs are approved); a dated note beside each.
  2026-10-21 (review of the afternoon batch, **awaiting the maintainer**,
  question T.9 of the decisions list of the afternoon; nothing decided here)
  — the folder switcher shows each recent folder with a `place` label, the
  last two components of its parent folder (`~/…/Documents/obsidian`,
  `…/Volumes/Disco`; `RecentFolder::place` in `crates/verso-contract`). Rule
  4's letter holds (never absolute, never `..`) and it is a label, not a
  capability; but [0081](0081-sharing-between-people-on-one-universo.md)
  item 5 says "names and keys, no path" and carries no revision line for it.
  Whether the label is accepted as a reading of rule 4 is his to say.
  2026-10-22 — T.9, option A, answering the line of 2026-10-21 above: the
  maintainer accepted the folder switcher's `place` as a **display label** and
  asked for it to be recorded here. Rule 4's letter is unchanged and this is
  the reading: a shortened label such as `~/Documents` or
  `~/…/Dropbox/antigo`, shown beside a recent folder only to tell folders of
  the same name apart, is not a path that crosses the contract. It is never an
  absolute path, never contains `..`, is no capability, and is not accepted
  back as input. Option B (only the parent folder's name, without `~`) was not
  chosen.

## Context

The architecture separates a Rust core (fs, watcher, parser, index, graph,
merge, MCP, sync) from a web UI (CodeMirror 6, Excalidraw, board, views,
plugins in a Web Worker), connected by a contract of commands and events that
can travel over local IPC or over remote WebSocket.

## Decision

The six rules below are inviolable:

1. The UI only talks to the core through the contract. No shortcuts.
2. The UI does not assume which side of the wire the core is on; latency and
   availability come from the capabilities.
3. The contract is defined first; TS types are generated from the Rust.
4. The filesystem API separates **access** from **identity**: a capability to
   read or write a file crosses the contract only as an opaque handle, and a
   note is named by its path relative to the open folder. An absolute path, or
   a path containing `..`, never crosses the contract in either direction.
   (Amended 2026-09-22; the original wording was "works with opaque handles,
   never with a POSIX path as a string".)
5. Disk access only inside the `verso-fs` crate.
6. Plugins never access disk directly.

### Scope of rules 4 and 5

Read literally, rules 4 and 5 are contradicted by decisions already taken:
`verso-index` opens a SQLite file ([0028](0028-crate-structure.md)),
`verso <folder>` receives a path ([0042](0042-open-from-command-line.md))
and the config is indexed by the folder path
([0011](0011-config-outside-tree-index-as-cache.md)). The boundary where they
hold is this:

- **Rule 4** holds for everything that crosses the contract: UI, plugins and
  MCP. Until 2026-09-22 it required a handle for *everything*, path strings
  included. Feature 6 showed what that costs, and the maintainer amended it:

  - A **capability of access** — open, read, write this file — crosses only as
    an **opaque handle**. That is what the rule was for: on iOS the capability
    is a security-scoped bookmark and on Android a SAF URI, neither of which is
    a path, and a contract built on paths could not carry them.
  - The **identity of a note inside the open folder** crosses as its **path
    relative to the root**, in NFC, with `/` and the `.md` extension. That
    string is not a POSIX path: it is not absolute, it names nothing outside
    the folder, and it grants no access. It is what the index keys by, what a
    citation has to contain to be verifiable by a human, and what the user sees
    in the app.
  - An **absolute path, or one containing `..`**, never crosses. Every path a
    client sends is confined by `verso-fs` before anything is opened.

  The amendment is not an exception carved out for MCP: the Phase 2 file tree
  displays paths, so the original wording would have been broken there too. A
  path as a string also exists at the entry edge (CLI argument, config key) and
  inside `verso-fs`. What a handle identifies and how long it is valid is still
  `[OPEN]` in [0044](0044-verso-fs-semantics.md). *(Decided there on
  2026-09-24, as built for Phase 2: an index into a table of paths, valid in
  this process only, with no capability crossing the contract; re-opened
  before anything outside the app's own views gets access to files.)*
  *(On a server, decided on 2026-10-09: the access capability is the
  authenticated session and its role in the folder, and nothing else
  crosses — Revisions.)*
- **Rule 5** holds for **the files of the open folder** (and of each root of a
  workspace). Only `verso-fs` reads, writes, renames, deletes or watches those
  files. Outside the rule, because they are app files and not user files: the
  index file, opened by `verso-index`; the configuration directory, read and
  written by `verso-core`; the CLI's input and output. None of them touches
  the open folder. `verso-dialect` remains with no IO at all. *(Since
  2026-10-09 also outside the rule: the server's own database in
  `VERSO_DATA_DIR`, opened by `verso-server`, which reaches a folder's
  files only through `verso-service`, `verso-core` and `verso-fs`;
  [0028](0028-crate-structure.md).)*

## Consequences

- Any PR that violates one of these rules is BLOCKING by definition, with no
  discussion of merit ([0033](0033-pr-workflow.md)).
- Opaque handles are what makes it possible for the same code to serve the
  iOS security-scoped bookmark and the Android Storage Access Framework
  ([0009](0009-external-constraints.md)).
- "Contract first" defines the order of work in Phase 2 and depends on the
  choice of TS type generation ([0038](0038-ts-type-generation.md), `[OPEN]`).
  *(Decided: 0038 accepted on 2026-09-22.)*
- Rule 5 is mechanically verifiable in two layers: file IO dependencies
  (`walkdir`, `notify`, `tempfile` and the like) only in `verso-fs`, and calls
  to `std::fs` denied by lint outside `verso-fs`, with a declared exception for
  the index file and for the config ([0028](0028-crate-structure.md),
  [0029](0029-guardrails-in-ci.md)).
- The same contract travels over remote WebSocket. Whether it carries session
  identity and per-operation authorization from its first design is `[OPEN]`
  in [0045](0045-server-and-mcp-security.md), to be decided before item 2.1
  of Phase 2; until then, the only requirement here is that the contract's
  shape must not preclude adding them. (Wording softened on 2026-09-21 after
  the independent reading of the Phase 0 review: the earlier text stated the
  requirement as decided while 0045 keeps it open.) *(Answered on
  2026-10-09 by [0074](0074-accounts-and-access-on-the-server.md) item 11,
  accepted with [0073](0073-self-hosted-server-first.md): every command
  carries the session the transport authenticated.)*
- The Obsidian public API has synchronous reads and the contract is
  asynchronous; the recorded mitigation is a read-only projection of the index
  on the JS side, fed by events (§10.3).

**Rule 4 at the MCP edge, as the feature 6 code implements it. Recorded on
2026-09-22 from the feature 6 code — provisional, the maintainer decides**
(§4 of `docs/reference/mcp-decision.md`). What a client of `verso mcp` sends and
receives as a note identifier is the **path relative to the root, as a
string**, not a handle: the sentence [0044](0044-verso-fs-semantics.md)
anticipated for the case where the stable identifier turns out to be the
relative path. The opaque handle stays inside the process, and what carries the
rule's weight at that edge is **confinement of every path a client sends**,
checked before the index or the disk is touched, including on the calls that
only read the index. Rule 4 itself is **not** rewritten here: rewriting it
belongs to the maintainer, in the PR that closes the
[0044](0044-verso-fs-semantics.md) handles group. *(Brought in line on
2026-09-24: the maintainer amended rule 4 on 2026-09-22, the same day, before
the handles group closed — the Decision carries the new wording — and the
relative path at the MCP edge is the decision
[0045](0045-server-and-mcp-security.md) took then, confirmed as the text that
stands when the group was decided on 2026-09-24.)*
*(Ratified by the maintainer on 2026-10-12, as built and tested:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

## Discarded alternatives

- UI accessing disk or index through a shortcut — discarded in §10.1.
- TS types written by hand in parallel with the Rust types — discarded by
  rule 3.

## Status

Accepted.
