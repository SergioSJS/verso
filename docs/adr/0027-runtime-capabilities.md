# ADR 0027 — Capabilities queryable at runtime

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §10.2, §4
- Status in the briefing: `PROPOSED`

## Context

Per-platform limitations are acceptable as long as they are explicit
([0022](0022-target-platforms-macos-first.md)). To be explicit, they have to be
queryable by code, not documented in prose.

## Decision (proposed, not confirmed)

1. Capabilities queryable by the UI and by plugins (e.g.: `fs:arbitrary`,
   `fs:watch`, `net:fetch`, `proc:spawn`, `bg:sync`, `offline`).
2. The plugin manifest declares what it requires; the catalog filters by
   platform.
3. The UI explains the absence of a feature instead of hiding it.

## Consequences

- There are two capability vocabularies in play — the plugin permission one
  ([0016](0016-plugins-execution-and-capabilities.md): `vault:read`,
  `vault:write`) and the platform availability one (this ADR). Whether they are
  the same namespace or two, the briefing does not say: record it as a question
  before implementing.
- "Explain instead of hide" is a UI requirement verifiable in review, and it
  connects to accessibility ([0035](0035-cross-cutting-requirements.md)).
- The plugin catalog needs the platform flag in the manifest
  ([0017](0017-plugins-format-shim-loading.md)).

## Discarded alternatives

- Hiding what the platform does not support — discarded in §10.2.

## Status

Proposed.
