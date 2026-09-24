# ADR 0021 — Sync: Automerge and layered config

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §8, §16.1
- Status in the briefing: `PROPOSED`
- Revisions: 2026-09-21 — the placeholder guard left this ADR and became
  [0043](0043-placeholder-guard.md), Accepted (Phase 0 review, C1).
  2026-09-24 — where schemas live decided by the maintainer elsewhere: in the
  open folder, as a `verso-schema` block in a note
  ([0052](0052-typed-note.md), spec Q11), the maintainer's choice between
  briefing §5.3 and briefing §8, which this ADR's item 2 follows. Item 2 is
  left as written, Proposed; on schemas it now disagrees with that decision,
  and its wording is the maintainer's to correct if this ADR is confirmed.

## Context

Proposals that detail [0020](0020-sync-merge-in-core-transports-as-plugins.md),
answering the recorded pain point of config sync failing between devices.

## Decision (proposed, not confirmed)

1. Candidate for the merge engine: Automerge.
2. Layered config: shared (plugin list, schemas) and per device (hotkeys,
   layout).

## Consequences

- Automerge implies representing the document as a CRDT, with state that has to
  live somewhere — probably outside the tree
  ([0011](0011-config-outside-tree-index-as-cache.md)). Confirm before
  adopting.
- Layered config only works if the boundary between shared and per device is
  explicit in the config format.
- The placeholder guard, previously item 3 of this ADR, is its own decision in
  [0043](0043-placeholder-guard.md) and applies to the whole core from
  Phase 1 on.
- Automerge keeps CRDT state outside the file; edits made by another app
  (Obsidian, a text editor) arrive without that state. How to reconcile the two
  sources is part of the confirmation, not an implementation detail.

## Discarded alternatives

None recorded: the briefing cites Automerge as a candidate, with no comparison
to other CRDT libraries.

## Status

Proposed.
