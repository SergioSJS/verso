# ADR 0015 — Schema packs distributable as content

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.4, §16.1
- Status in the briefing: `PROPOSED`

## Context

One of the recorded pain points is the paralysis of starting with an empty app:
the user has to invent their own structure before writing the first note.

## Decision (proposed, not confirmed)

Schemas are distributable as content — journal, worldbuilding, RPG systems —
and not as plugin code.

## Consequences

- Installing a pack does not execute code, which separates it from the plugin
  system and its consent model ([0016](0016-plugins-execution-and-capabilities.md)).
  That only holds if a schema has no templates, expressions or queries; where
  the line between content and code falls is a question recorded in
  [0047](0047-plugin-api-open-questions.md), and so is the integrity of the
  downloaded pack (hash, origin).
- Depends on the format and the location of schemas, still `[OPEN]`
  (`docs/spec/dialect.md`). *(Decided on 2026-09-24: spec Q11, ADR 0052.)*
- One pack per game system is the expected path for RPG support
  ([0036](0036-tabletop-rpg-support.md)).
- Packs have to survive the user editing the schema after installing it: a pack
  update cannot overwrite a local edit without a diff
  ([0012](0012-files-are-source-of-truth.md)).

## Discarded alternatives

- Distributing a schema as a plugin — the briefing treats packs as content, not
  as code (§5.4).

## Status

Proposed.

*2026-10-21* — the decisions questionnaire of 2026-10-20 (answered 2026-10-21): **0015** `[DECIDED 2026-10-21]` (option A) stays for after V1, linked to [0047](0047-plugin-api-open-questions.md) and [0098](0098-world-and-campaign-wizard-template-bundles.md). Reconciled with 0098 item 11, decided the same day (0098.R, option A): the **bundle of 0098 is the format of packs of structure distributed as content**, one concept and one screen, and this ADR now points there; everything this ADR imagines beyond what a bundle does (note types and schemas, a pack per game system, the integrity of a downloaded pack) stays after V1. The Status stays Proposed.
