# ADR 0011 — Config outside the tree and the index as a rebuildable cache

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.1
- Status in the briefing: `DECIDED`

## Context

A direct consequence of there being no vault
([0010](0010-folder-is-the-unit-no-vault.md)): if no directory is mandatory
inside the folder, the configuration and the index have to live somewhere else
and be rebuildable.

## Decision

1. Config outside the tree, in the user's configuration directory, keyed by the
   folder path. No mandatory directory inside the open folder.
2. The index is a rebuildable cache: deleting it loses no data.

## Consequences

- A folder synced between machines does not carry its configuration along, which
  pushes shared config toward layered sync
  ([0021](0021-sync-automerge-layered-config.md)).
- Moving or renaming the folder dissociates the config, since the key is the
  path. How reassociation happens, the briefing does not say.
- Because the index is a cache, it can never be the only copy of a piece of data
  — this reinforces degrading to Markdown
  ([0013](0013-degrades-to-markdown.md)).
- Deleting the index is a safe operation and has to stay safe: it becomes a
  test, not a promise.
- Opening a folder for the first time implies indexing from scratch, which makes
  the cost of indexing visible to the user
  ([0039](0039-performance-targets.md)).
- `.obsidian/` in an existing vault is ignored, not deleted: conversion is
  explicit and with a diff (`docs/spec/dialect.md`, D2).
- The index keeps the text of the whole folder outside it. Where it lives when
  the folder is sensitive, with what permissions, and what happens to the
  orphaned index when the folder disappears, is `[OPEN]` in
  [0046](0046-index-location-lifecycle-tokenizer.md), to be decided before
  feature 3 of Phase 1.

## Discarded alternatives

- A configuration directory inside the folder, on the `.obsidian/` model —
  discarded in §5.1.

## Status

Accepted.
