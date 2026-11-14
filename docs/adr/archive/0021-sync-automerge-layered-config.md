# ADR 0021 — Sync: Automerge and layered config

- Superseded by [0073](../0073-self-hosted-server-first.md) (Yjs in place of Automerge, decided 2026-10-09; archived 2026-11-03). Not edited further.
- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §8, §16.1
- Status in the briefing: `PROPOSED`
- Revisions: 2026-09-21 — the placeholder guard left this ADR and became
  [0043](../0043-placeholder-guard.md), Accepted (Phase 0 review, C1).
  2026-09-24 — where schemas live decided by the maintainer elsewhere: in the
  open folder, as a `verso-schema` block in a note
  ([0052](../0052-typed-note.md), spec Q11), the maintainer's choice between
  briefing §5.3 and briefing §8, which this ADR's item 2 follows. Item 2 is
  left as written, Proposed; on schemas it now disagrees with that decision,
  and its wording is the maintainer's to correct if this ADR is confirmed.
  2026-10-09 — item 1 revised by [0073](../0073-self-hosted-server-first.md)
  item 7, accepted by the maintainer that day; the text below is kept as
  it was written. The CRDT is Yjs, not Automerge — `y-codemirror.next` in
  the window, a Rust implementation such as `yrs` on the server — and a
  CRDT is the mechanism of a live session, never the stored form of a
  note; the file is. The Consequences' questions about CRDT state outside
  the file are answered by that: the shared state lives in the session's
  memory and is written to the file by the atomic write. Item 2 is
  untouched; on a server, the person's layer of settings lives with the
  account (0073 item 5, [0070](../0070-what-travels-with-the-folder.md)).

## Context

Proposals that detail [0020](../0020-sync-merge-in-core-transports-as-plugins.md),
answering the recorded pain point of config sync failing between devices.

## Decision (proposed, not confirmed)

1. Candidate for the merge engine: Automerge.
2. Layered config: shared (plugin list) and per device (hotkeys, layout).
   Schemas live in the folder, not in the shared layer outside it
   (corrected on 2026-10-21 to agree with [0052](../0052-typed-note.md); 0021.2,
   option A).

## Consequences

- Automerge implies representing the document as a CRDT, with state that has to
  live somewhere — probably outside the tree
  ([0011](../0011-config-outside-tree-index-as-cache.md)). Confirm before
  adopting.
- Layered config only works if the boundary between shared and per device is
  explicit in the config format.
- The placeholder guard, previously item 3 of this ADR, is its own decision in
  [0043](../0043-placeholder-guard.md) and applies to the whole core from
  Phase 1 on.
- Automerge keeps CRDT state outside the file; edits made by another app
  (Obsidian, a text editor) arrive without that state. How to reconcile the two
  sources is part of the confirmation, not an implementation detail.

## Discarded alternatives

None recorded: the briefing cites Automerge as a candidate, with no comparison
to other CRDT libraries.

## Status

*2026-10-21* — 0021.2 `[DECIDED 2026-10-21]` (option A, the maintainer's mark in the decisions questionnaire of 2026-10-20): the layers hold, with the schemas in the folder; 0052 is newer and the folder is the source of truth ([0012](../0012-files-are-source-of-truth.md)). Item 2 above is corrected to say so.

Proposed. Item 1 revised on 2026-10-09 by
[0073](../0073-self-hosted-server-first.md) item 7, Accepted: Yjs, as the
mechanism of a live session (Revisions).
