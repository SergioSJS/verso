# ADR 0013 — All structured data degrades to readable Markdown

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.2
- Status in the briefing: `PROPOSED`

## Context

Structure is usually added to a notes app as a database or as a syntax of its
own. In both cases, whoever opens the file in another editor sees something
unreadable, and git, search and agents stop seeing the content (§16.1).

## Decision (proposed, not confirmed)

All structured data in Verso degrades to Markdown readable in any editor.

## Consequences

- No structured feature can exist only in the index
  ([0011](0011-config-outside-tree-index-as-cache.md)).
- Views have to be able to materialize their output as real Markdown in the
  file ([0014](0014-primitives-catalog.md)).
- Typed relation syntax, still `[OPEN]`, is constrained by this proposal: it
  has to be readable outside Verso (`docs/spec/dialect.md`).
- The cost is redundancy: the same data appears in the file and in the index,
  and the two have to agree.
- "Readable Markdown" is read as **text readable in any editor, in the format
  the data already has**. The rule targets data that, without it, would live
  only in the index or in a database. `.canvas` (JSON Canvas) is already in the
  base dialect ([0030](0030-base-dialect-obsidian-compatible.md)) and is text:
  it does not contradict the proposal, and
  [0040](0040-board-persistence.md) builds on that.

## Discarded alternatives

- Keeping structured data only in a database — the briefing cites Logseq's
  transition to a database version as a reference, not as a path (§16.2).

## Status

Proposed.
