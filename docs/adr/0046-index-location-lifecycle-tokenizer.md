# ADR 0046 — Index: location, lifecycle and tokenizer

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R6, R12
- Status in the briefing: not present; details
  [0011](0011-config-outside-tree-index-as-cache.md)

## Context

The index lives outside the tree, in the user's configuration directory
([0011](0011-config-outside-tree-index-as-cache.md)). FTS5 stores the text.
Therefore the content of the whole folder — including the GM's secrets and any
key someone has pasted into a note — comes to exist in the clear in a second
place, with backup and permissions different from the folder's. Deleting or
moving the folder does not delete the copy. A folder on an encrypted or
removable volume gains a shadow on the local disk. The care given to API keys
([0019](0019-generative-opt-in-and-keychain.md)) was not given to the index.

Separately, the product is pt-BR and EN
([0035](0035-cross-cutting-requirements.md)), and the default FTS5 tokenizer
does not handle accents (`Café` ≠ `cafe`).

## Decision

None. Questions recorded, with the moment to decide them.

### Location and lifecycle — decide before feature 3 of Phase 1

- Where the index lives when the folder is sensitive: always in the config
  directory, next to the folder (contradicts "no mandatory directory inside
  it"), or configurable per folder.
- Cleanup: when the folder disappears or is moved, what happens to the orphaned
  index.
- Permissions on the index file (minimum: only the user can read it).
- Whether or not the index goes into system backup (Time Machine, iCloud).

### Tokenizer — decide before feature 5 of Phase 1 (baseline)

- FTS5 tokenizer with diacritic removal and case handling suitable for pt-BR and
  EN, decided **before** taking the first benchmark baseline; changing it later
  is just a reindex (the index is a cache), but it invalidates the baseline.

## Consequences

- "Deleting the index loses no data"
  ([0011](0011-config-outside-tree-index-as-cache.md)) remains true; what this
  ADR adds is "keeping the index leaks no data".
- The location decision has to fit [0044](0044-verso-fs-semantics.md) (the index
  is a file; what opens it is `verso-index`, by the scope delimited in
  [0026](0026-core-ui-contract-inviolable-rules.md)).

## Discarded alternatives

None recorded.

## Status

`[OPEN]`. Location: before feature 3 of Phase 1. Tokenizer: before feature 5 of
Phase 1.
