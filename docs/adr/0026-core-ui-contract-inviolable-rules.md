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
- **Rule 5** holds for **the files of the open folder** (and of each root of a
  workspace). Only `verso-fs` reads, writes, renames, deletes or watches those
  files. Outside the rule, because they are app files and not user files: the
  index file, opened by `verso-index`; the configuration directory, read and
  written by `verso-core`; the CLI's input and output. None of them touches
  the open folder. `verso-dialect` remains with no IO at all.

## Consequences

- Any PR that violates one of these rules is BLOCKING by definition, with no
  discussion of merit ([0033](0033-pr-workflow.md)).
- Opaque handles are what makes it possible for the same code to serve the
  iOS security-scoped bookmark and the Android Storage Access Framework
  ([0009](0009-external-constraints.md)).
- "Contract first" defines the order of work in Phase 2 and depends on the
  choice of TS type generation ([0038](0038-ts-type-generation.md), `[OPEN]`).
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
  requirement as decided while 0045 keeps it open.)
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

## Discarded alternatives

- UI accessing disk or index through a shortcut — discarded in §10.1.
- TS types written by hand in parallel with the Rust types — discarded by
  rule 3.

## Status

Accepted.
