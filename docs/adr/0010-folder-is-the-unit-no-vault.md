# ADR 0010 — The open folder is the unit of work; there is no vault

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.1
- Status in the briefing: `DECIDED`

## Context

The vault concept forces the user to convert a folder into something special
before using it, and to live with a configuration directory inside the notes
tree. A code editor opens any folder without ceremony.

## Decision

Verso opens any folder the way a code editor does. The root is the open folder.
There is no vault concept.

## Consequences

- There is no "create vault" step and no special state to migrate.
- Opening a folder that already is an Obsidian vault has to work without
  conversion ([0012](0012-files-are-source-of-truth.md)).
- Where the configuration lives becomes an explicit question
  ([0011](0011-config-outside-tree-index-as-cache.md)).
- Opening is also a terminal gesture: `verso <folder>`, on the model of `code .`
  ([0042](0042-open-from-command-line.md)).
- Link resolution depends on the open root, which has to be specified in the
  dialect (`docs/spec/dialect.md`).

## Discarded alternatives

- Obsidian's vault model, with a configuration directory inside the tree —
  discarded in §5.1.

## Status

Accepted.
