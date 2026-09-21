# ADR 0024 — Board: Excalidraw as a free annotation layer

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §4, §9
- Status in the briefing: `DECIDED` (Excalidraw); `PROPOSED` (semantic layer);
  `OPEN` (persistence)

## Context

The board is one of the features that motivate the project, especially for the
RPG table. The best-known alternative, tldraw, has a source-available license
that requires a license key in production and a mandatory watermark, and
forbids relicensing — incompatible with
[0001](0001-open-tool-no-company.md).

## Decision

The board uses Excalidraw (MIT) as a free annotation layer.

## Consequences

- The semantic layer is proposed, not decided: nodes are notes, edges are typed
  relations, and a free arrow can be promoted to a typed relation.
- Board persistence is `[OPEN]` ([0040](0040-board-persistence.md)).
- The board needs an equivalent accessible view — a list or table of the same
  notes and relations ([0035](0035-cross-cutting-requirements.md), `PROPOSED`).
- Vaults with `.excalidraw.md` from the Obsidian plugin require explicit
  conversion (`docs/spec/dialect.md`, `PROPOSED`).
- The board is out of scope until the end of Phase 2
  ([0034](0034-roadmap-in-phases.md)).

## Discarded alternatives

- tldraw — discarded because of a license constraint, not out of preference
  ([0009](0009-external-constraints.md)).

## Status

Accepted for Excalidraw. Semantic layer: Proposed. Persistence: `[OPEN]`.
