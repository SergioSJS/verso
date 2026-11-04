# ADR 0040 — Board persistence

- Superseded by [0057](../0057-board-json-canvas.md) (the board as a JSON Canvas file, decided 2026-09-30; archived 2026-11-03). Not edited further.
- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §9, §17 item 9
- Status in the briefing: `OPEN`
- Revisions: 2026-09-30 — decided in [0057](../0057-board-json-canvas.md).

## Context

The board uses Excalidraw ([0024](../0024-board-excalidraw.md)) and the base
dialect already includes `.canvas` (JSON Canvas)
([0030](../0030-base-dialect-obsidian-compatible.md)). The briefing records a JSON
Canvas sidecar as a candidate, with or without extensions, without deciding.

## Decision

**Decided on 2026-09-30 by the maintainer**, in [0057](../0057-board-json-canvas.md): the board is a
`.canvas`, with the free drawing in the same file under a top-level key of
Verso's own (`"verso"`). Until that day: none.

## Consequences

- The choice has to fit two decisions already made: compatibility with
  Obsidian's `.canvas` and degradation to readable Markdown
  ([0013](../0013-degrades-to-markdown.md), `PROPOSED`) — a drawing that exists
  only in binary JSON does not qualify.
- Extending JSON Canvas with fields of our own is allowed if it does not
  contradict the format; replacing it is not
  ([0030](../0030-base-dialect-obsidian-compatible.md)).
- The proposed semantic layer (nodes are notes, edges are typed relations)
  depends on typed relation syntax, also `[OPEN]`
  (`docs/spec/dialect.md`). *(Decided on 2026-09-30: spec Q10, ADR 0057
  point 4.)*
- Vaults with `.excalidraw.md` from the Obsidian plugin need explicit
  conversion, which makes the target format part of this decision.

## Discarded alternatives

None. The briefing records the JSON Canvas sidecar as a candidate, not as a
choice.

## Status

Accepted (2026-09-30), by [0057](../0057-board-json-canvas.md).
