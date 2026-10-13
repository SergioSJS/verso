# ADR 0027 — Capabilities queryable at runtime

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §10.2, §4
- Status in the briefing: `PROPOSED`
- Revisions: 2026-10-12 — accepted by the maintainer, answering the ADR audit in
  session: *"Ajuste tudo que precisar. Está aprovado os ADRs"* (adjust
  whatever needs it; the ADRs are approved). It was Proposed while
  [0073](0073-self-hosted-server-first.md),
  [0076](0076-the-window-on-every-screen.md), `CLAUDE.md` invariant 2
  and `crates/verso-contract` already relied on it. Item 3 revised to the
  rule of 0076 item 11, the behaviour built; its old wording kept beside
  it as history.

## Context

Per-platform limitations are acceptable as long as they are explicit
([0022](0022-target-platforms-macos-first.md)). To be explicit, they have to be
queryable by code, not documented in prose.

## Decision (proposed, not confirmed)

*(Accepted on 2026-10-12, item 3 revised: Status.)*

1. Capabilities queryable by the UI and by plugins (e.g.: `fs:arbitrary`,
   `fs:watch`, `net:fetch`, `proc:spawn`, `bg:sync`, `offline`).
2. The plugin manifest declares what it requires; the catalog filters by
   platform.
3. A feature the side cannot do is not shown — never shown and failing —
   with a way back in Settings: the rule of
   [0076](0076-the-window-on-every-screen.md) item 11, the behaviour
   built; revised on 2026-10-12. *(The wording until 2026-10-12, kept as
   history: "The UI explains the absence of a feature instead of hiding
   it.")*

## Consequences

- There are two capability vocabularies in play — the plugin permission one
  ([0016](0016-plugins-execution-and-capabilities.md): `vault:read`,
  `vault:write`) and the platform availability one (this ADR). Whether they are
  the same namespace or two, the briefing does not say: record it as a question
  before implementing.
- "Explain instead of hide" is a UI requirement verifiable in review, and it
  connects to accessibility ([0035](0035-cross-cutting-requirements.md)).
  *(Revised with item 3 on 2026-10-12: what the side cannot do is absent,
  never shown and failing.)*
- The plugin catalog needs the platform flag in the manifest
  ([0017](0017-plugins-format-shim-loading.md)).

## Discarded alternatives

- Hiding what the platform does not support — discarded in §10.2.
  *(Taken up on 2026-10-12, for what the side cannot do, by item 3's
  revision.)*

## Status

**Accepted on 2026-10-12** by the maintainer
(*"Ajuste tudo que precisar. Está aprovado os ADRs"*), with item 3
revised to the rule of [0076](0076-the-window-on-every-screen.md) item 11
(Revisions).

*(History, the status until 2026-10-12:)* Proposed.
