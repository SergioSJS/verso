# ADR 0036 — Special support for tabletop RPG

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §12, §16.2
- Status in the briefing: `DECIDED` (intent); `PROPOSED` (scope)
- Revisions: 2026-10-14 — the maintainer accepted that night
  [0087](0087-secret-blocks-hidden-from-readers.md),
  [0088](0088-dice-and-random-tables.md) and [0090](0090-maps-on-the-board.md)
  (*"Sim, todas"*, every recommendation): dice, random tables, secret
  blocks and maps enter the core as **primitives**
  ([0003](0003-primitives-not-workarounds.md)), of use beyond games,
  which the Consequences below allow. Of the scope's table: the random
  table is a Markdown table or list with an `^id`, rolled by `dice:` —
  no note type (0088 item 3); the player view is a `[!secret]` callout
  served to readers without it, for sharing, and left out by default of
  an export by a writer (0087); named viewports are not decided there.
  The text below is kept as written.

## Context

The target audience includes people who play and run tabletop RPG, and it is
where the maintainer has real use — which makes that audience the test of the
Phase 2 gate ([0034](0034-roadmap-in-phases.md)).

## Decision

Special support for people who play and run games is a declared intent of the
project.

The scope below is a proposal, not a decision:

| Feature | Status |
|---|---|
| Integration with Foundry VTT mapping a typed note ↔ Actor/Item with the system's data model; the existing modules only sync journals | `PROPOSED` |
| Random table as a note type with a roll action | `PROPOSED` |
| Player view: blocks marked as secret disappear in sharing and in export; maps to journal permission in Foundry | `PROPOSED` |
| Named viewport shortcuts on the board | `PROPOSED` |
| Schema packs per game system | `PROPOSED` |

## Consequences

- No RPG feature goes into the core as a special case: they all go through
  primitives ([0014](0014-primitives-catalog.md)), schema packs
  ([0015](0015-schema-packs.md)) or a plugin
  ([0017](0017-plugins-format-shim-loading.md)).
- The player view depends on the per-block visibility syntax, `[OPEN]`
  (`docs/spec/dialect.md`), and has to be decided before sharing and export.
- The Foundry integration is a plugin, and it counts as proof that the API
  allows first-party features with no privileged access.
- That audience's sensitivity to AI-generated content is the reason for
  opt-in generative ([0019](0019-generative-opt-in-and-keychain.md)).
- Recorded reference for a game master board with typed relations, random
  tables and a player view: Alkemion Studio (§16.2).

## Discarded alternatives

None recorded.

## Status

Accepted for the intent. Scope: Proposed.

*2026-10-21* — the decisions questionnaire of 2026-10-20 (answered 2026-10-21), all option A: **0036.a** `[DECIDED 2026-10-21]` the Foundry VTT integration comes after V1, as a plugin; **0036.b** `[DECIDED 2026-10-21]` named framing shortcuts (viewports) on the board come after V1 ([0090](0090-maps-on-the-board.md) did not decide them); **0036.c** `[DECIDED 2026-10-21]` the pack of schemas per game system follows [0015](0015-schema-packs.md), after V1.
