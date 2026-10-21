# ADR 0019 — Generative features opt-in and keys in the keychain

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §7
- Status in the briefing: `PROPOSED`

## Context

The tabletop RPG community is sensitive to AI-generated content, and Verso
declares special support for that audience
([0036](0036-tabletop-rpg-support.md)).
Separately, API keys inside the folder would be synced and versioned along
with the notes.

## Decision (proposed, not confirmed)

1. Generative features are explicit and opt-in.
2. API keys live in the operating system keychain, never inside the folder.

## Consequences

- Nothing generative can be on by default, including passive suggestion while
  writing.
- The keychain varies by platform and does not exist in an equivalent form on
  every target: it has to enter the runtime capabilities
  ([0027](0027-runtime-capabilities.md)).
- A key outside the folder is consistent with config outside the tree
  ([0011](0011-config-outside-tree-index-as-cache.md)) and avoids leaking
  through sync or through a commit.
- Write provenance in the frontmatter is what makes the opt-in auditable
  afterwards ([0014](0014-primitives-catalog.md)).

## Discarded alternatives

None recorded in the briefing.

## Status

Accepted (2026-10-21). The maintainer marked option A in the decisions questionnaire of 2026-10-20 (answered 2026-10-21): generative AI always opt-in, keys in the system's keychain, outside the folder. [0098](0098-world-and-campaign-wizard-template-bundles.md) item 8 relies on it.
