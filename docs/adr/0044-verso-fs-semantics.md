# ADR 0044 — `verso-fs` semantics: symlinks, opaque handles and ignored paths

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R3, I6, L5, R11
- Status in the briefing: not present

## Context

The path confinement guardrail ([0029](0029-guardrails-in-ci.md)) and the
opaque handles rule ([0026](0026-core-ui-contract-inviolable-rules.md)) exist as
a principle, but no document says what happens in the cases that decide whether
they work. The Phase 0 review raised three groups of questions that need an
answer before `verso-fs` exists.

## Decision

None. The questions below are recorded with the moment to decide them.

### Symlinks and loops — decide before feature 2 of Phase 1

- Symlink **inside** the folder pointing **outside**: followed (the index, the
  MCP and plugins start seeing data from outside the folder) or ignored (breaks
  the common practice of an attachments folder by symbolic link)? If followed,
  with what limit?
- Symlink to a directory with a loop: detect by visited inode, by maximum
  depth, or both.
- Hard links and macOS aliases: whether they count as the same file.
- Maximum directory depth and the `inotify` limit on Linux (large vaults blow
  past the kernel default): explicit failure or degradation to periodic
  scanning.

### Opaque handles — decide before feature 6 of Phase 1 (`verso mcp`) and the contract (Phase 2, item 2.1)

- What a handle identifies: an open descriptor (`openat`, immune to a path swap
  between checking and using) or an index into a table of paths (checking is
  still by string, and the TOCTOU window stays open).
- Stability: does the handle survive an app restart? A file rename? A change of
  workspace root ([0041](0041-multi-root-workspace.md))?
- What the agent receives over MCP as a note identifier, and whether that
  identifier is the same handle as in the contract.
- If the stable identifier ends up being the path relative to the root, rule 4
  has to say so, instead of pretending it is not.

### Ignored paths — decide before feature 2 of Phase 1

- What the scan does not index: `.obsidian/`, `.git/`, `.trash/` (Obsidian's
  trash, full of notes with links), hidden files and directories,
  `node_modules/`, the attachments folder.
- Whether an ignored note can be the target of a link (appears as pending) and
  whether it counts as a backlink. That changes the outcome of Phase 1 exit
  criterion 2.
- Whether the list is fixed, configurable, or reads `.gitignore`.

## Consequences

- None of these answers can come "in the code": each one becomes a line in this
  ADR (or an ADR of its own, if it grows) and a `verso-fs` fixture.
- While handle semantics stay open, rule 4 of
  [0026](0026-core-ui-contract-inviolable-rules.md) is a constraint on form (do
  not expose a string), not a security guarantee.
- The resource limits (depth, file size, line length) complement Q17 of the
  dialect spec: fuzzing catches crashes, not slowness.

## Discarded alternatives

None recorded.

## Status

`[OPEN]`. Symlinks and ignored paths: before feature 2 of Phase 1.
Handles: before feature 6 of Phase 1 and item 2.1 of Phase 2.
