# ADR 0040 — Board persistence

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §9, §17 item 9
- Status in the briefing: `OPEN`

## Context

The board uses Excalidraw ([0024](0024-board-excalidraw.md)) and the base
dialect already includes `.canvas` (JSON Canvas)
([0030](0030-base-dialect-obsidian-compatible.md)). The briefing records a JSON
Canvas sidecar as a candidate, with or without extensions, without deciding.

## Decision

None. Decide before the board, which is out of scope until the end of Phase 2.

## Consequences

- The choice has to fit two decisions already made: compatibility with
  Obsidian's `.canvas` and degradation to readable Markdown
  ([0013](0013-degrades-to-markdown.md), `PROPOSED`) — a drawing that exists
  only in binary JSON does not qualify.
- Extending JSON Canvas with fields of our own is allowed if it does not
  contradict the format; replacing it is not
  ([0030](0030-base-dialect-obsidian-compatible.md)).
- The proposed semantic layer (nodes are notes, edges are typed relations)
  depends on typed relation syntax, also `[OPEN]`
  (`docs/spec/dialect.md`).
- Vaults with `.excalidraw.md` from the Obsidian plugin need explicit
  conversion, which makes the target format part of this decision.

## Discarded alternatives

None. The briefing records the JSON Canvas sidecar as a candidate, not as a
choice.

## Status

`[OPEN]`. Decide before the board.
