# ADR 0020 — Sync: merge engine in the core, transports as plugins, out of scope until Phase 2

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §8, §15
- Status in the briefing: `DECIDED`
- Revisions: 2026-10-09 — revised by [0073](0073-self-hosted-server-first.md),
  accepted by the maintainer that day; the text below is kept as it was
  decided on 2026-09-21. **The order**: the self-hosted server is built
  first, and sync between devices comes after it and through it (0073
  items 1 and 10). **Item 1**: native sync stays essential and goes through
  Verso's own server; the Google Drive and OneDrive integrations by API
  are not essential — the folder route is supported and documented
  (conflict copies detected, placeholders handled), WebDAV is the first
  external transport, Drive and OneDrive by API come if asked, iCloud
  never by API, rclone is not bundled. **Item 3**: transports live in the
  core, not as plugins, until plugins exist and for as long as they hold
  credentials (0073 item 4). **Item 4**: sync leaves "out of scope until
  the end of Phase 2" for Phase 3, after the first release of the server
  ([0034](0034-roadmap-in-phases.md), revised the same day). Item 2
  stands; merge by block comes after conflicts have been seen in use (0073
  item 10).
  2026-10-21 — [0104](0104-external-cloud-storage-transports-and-quotas.md):
  the first cloud transports are built into the desktop app, not plugins.

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

Accepted. Revised on 2026-10-09 by [0073](0073-self-hosted-server-first.md)
(Revisions).
