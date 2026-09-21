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
  (`docs/spec/dialect.md`).
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
