# ADR 0009 — External constraints assumed as given

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §4
- Status in the briefing: `CONSTRAINT` (not a choice)
- Revisions: 2026-10-14 — the admissible sources delimited, by the
  maintainer that night (*"Sim, todas"*, answering the questions of
  [0094](0094-the-rest-of-bases.md), this one among them): the public
  source of an open-source plugin that Obsidian publishes under its own
  licence — `obsidianmd/obsidian-maps`, MIT, for instance — is an
  admissible source, as `obsidian.d.ts` is. Inspecting, decompiling or
  unminifying the app itself stays forbidden.
  2026-10-21 — the OAuth and quota rows answered for sync by
  [0104](0104-external-cloud-storage-transports-and-quotas.md) (`drive.file`
  non-sensitive, PKCE and public clients, per-provider limits).

## Context

Part of Verso's design is not a choice: it comes from third-party terms of use,
from operating system sandboxes or from library licenses. This ADR exists so
that these constraints are cited with their origin and are not reopened as if
they were preferences.

## Decision

Record the constraints below as given, with their origin, and design within
them.

| Constraint | Origin | Consequence |
|---|---|---|
| Do not inspect, decompile or unminify the Obsidian app | Obsidian's terms of use forbid reverse engineering to develop a competing product | Allowed sources: public API (`obsidian.d.ts`, MIT), public documentation, behavior observed from outside; and *(since 2026-10-14)* the public source of an open-source plugin Obsidian publishes under its own licence (`obsidianmd/obsidian-maps`, MIT) |
| No access to an arbitrary folder on iOS | iOS sandbox | Document picker + security-scoped bookmarks |
| No watcher for external changes equivalent to the desktop one on iOS | iOS | Refresh on user action or on returning to the app |
| Restricted background sync | iOS and Android | Mobile sync depends on the windows the OS allows |
| Slow bulk operations through the Storage Access Framework | Android | Large indexing on Android requires its own strategy |
| No Node on mobile | iOS and Android | A plugin that depends on Node is desktop-only |
| No resident process on mobile | iOS and Android | MCP on mobile is remote or in-process |
| A client secret cannot be kept in an open source app | OAuth | Google Drive and OneDrive require PKCE or the user's own client ID |
| App verification, per-application quota, weak rename semantics and conflicts | Google Drive and OneDrive | They serve better as a backup destination than as continuous sync |
| tldraw cannot be used | Source-available license: license key in production, mandatory watermark, prohibition on relicensing | The board uses Excalidraw (MIT) |

## Consequences

- The constraint about reverse engineering defines the admissible sources for
  the dialect work: only the public API, public documentation and behavior
  observed from outside ([0030](0030-base-dialect-obsidian-compatible.md)),
  and, since 2026-10-14 (Revisions), the public source of an open-source
  plugin Obsidian publishes under its own licence. The app itself is never
  a source, however it is read.
  No document, fixture or PR may cite the Obsidian binary as a source.
- The mobile constraints feed the runtime capabilities
  ([0027](0027-runtime-capabilities.md)) and the companion server proposal
  ([0025](0025-own-server-and-mobile-pwa.md)).
- The tldraw license constraint is the origin of the choice of Excalidraw
  ([0024](0024-board-excalidraw.md)).
- A constraint only leaves this list if its origin changes — and the change has
  to be cited.

## Discarded alternatives

Not applicable: constraints are not choices. The discarded alternatives appear
in the ADRs that respond to each constraint.

## Status

Accepted as a record of constraints.
