# ADR 0020 — Sync: merge engine in the core, transports as plugins, out of scope until Phase 2

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §8, §15
- Status in the briefing: `DECIDED`

## Context

Sync is pointed out as essential, and it is also where data is lost the most.
The briefing separates two things that usually come together: understanding the
content (merge) and moving bytes (transport).

## Decision

1. Native sync is essential, with our own server and with services such as
   Google Drive and OneDrive.
2. The merge engine lives in the core, because it understands blocks,
   frontmatter and the file model.
3. Transports are plugins: our own server, WebDAV, S3, Google Drive,
   OneDrive.
4. Sync is out of scope until the end of Phase 2.

## Consequences

- A new transport cannot change merge semantics; it only delivers and fetches
  bytes.
- With transports being plugins, the plugin API has to be sufficient to write
  sync — the hardest test of [0017](0017-plugins-format-shim-loading.md).
- Google Drive and OneDrive serve better as a backup destination than as
  continuous sync, because of platform constraints
  ([0009](0009-external-constraints.md)).
- Being out of scope until the end of Phase 2 protects the one-month real-use
  gate ([0034](0034-roadmap-in-phases.md)); even so, the Phase 1 file model
  cannot make per-block merge unfeasible later.

## Discarded alternatives

- Merge inside each transport — discarded in §8, which places the engine in the core.
- Relying on Google Drive or OneDrive as the main continuous sync — discarded
  by the constraints in §4.

## Status

Accepted.
