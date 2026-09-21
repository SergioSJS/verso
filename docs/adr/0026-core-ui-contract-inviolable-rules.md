# ADR 0026 — Core↔UI contract and inviolable architecture rules

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §10, §10.1
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-21 — scope of rules 4 and 5 delimited (Phase 0 review,
  C2). The decision did not change; what changed is the boundary where it
  holds.

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
4. The filesystem API works with opaque handles, never with a POSIX path as a
   string.
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
  MCP receive and return handles, never path strings. A path as a string exists
  only at the entry edge (CLI argument, config key) and inside `verso-fs`.
  What a handle identifies and how long it is valid is `[OPEN]` in
  [0044](0044-verso-fs-semantics.md).
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
- The contract has to be born with session identity and per-operation
  authorization, even if over local IPC everything is granted; the same
  contract travels over remote WebSocket
  ([0045](0045-server-and-mcp-security.md), `[OPEN]`, to be decided before
  item 2.1 of Phase 2).
- The Obsidian public API has synchronous reads and the contract is
  asynchronous; the recorded mitigation is a read-only projection of the index
  on the JS side, fed by events (§10.3).

## Discarded alternatives

- UI accessing disk or index through a shortcut — discarded in §10.1.
- TS types written by hand in parallel with the Rust types — discarded by
  rule 3.

## Status

Accepted.
