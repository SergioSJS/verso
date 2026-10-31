# ADR 0041 — Workspace with multiple roots

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.1
- Status in the briefing: `PROPOSED`

## Context

The open folder is the unit of work
([0010](0010-folder-is-the-unit-no-vault.md)). A code editor, however, opens
more than one root at the same time, and whoever keeps campaign, journal and
reference material in separate folders wants to link between them.

## Decision (proposed, not confirmed)

Workspace with multiple roots, with links resolving between them.

## Consequences

- Link resolution stops being local to a folder: `[[nota]]` becomes able to
  point to another root, which makes the resolution rule and the behavior with
  an ambiguous name dialect questions still without an answer
  (`docs/spec/dialect.md`, Q12, `[OPEN]`). *(Q12 closed by the maintainer
  on 2026-09-22, within one folder; a link across roots is this ADR's,
  still Proposed.)*
- Config is indexed by the folder path
  ([0011](0011-config-outside-tree-index-as-cache.md)): a workspace with
  several roots needs a key of its own, and the briefing does not say which.
- A link that crosses roots breaks when the vault is opened on its own or read
  by another app, which strains compatibility with Obsidian vaults
  ([0012](0012-files-are-source-of-truth.md)).
- The index and the graph have to know which root each note belongs to.

## Discarded alternatives

None recorded in the briefing.

## Status

Proposed. `[DECIDED 2026-10-21]` (the maintainer's mark, option A, in the decisions questionnaire of 2026-10-20): the multi-root workspace comes after V1; the resolution of links across roots is open and V1 works with one folder.
