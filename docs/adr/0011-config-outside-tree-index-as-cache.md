# ADR 0011 — Config outside the tree and the index as a rebuildable cache

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.1
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-22 — what the feature 4 code does recorded under
  Consequences, as **provisional**; the Decision is unchanged and the questions
  [0046](0046-index-location-lifecycle-tokenizer.md) holds stay `[OPEN]`
  (memo `docs/reference/cli-decision.md`).

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

**Where the configuration directory is, and what keys a folder. Recorded on
2026-09-22 from the feature 4 code — provisional, the maintainer decides on
waking**, on line 2 of `docs/reference/cli-decision.md` §10. This is what the
code does, not a decision.

- **The directory** is `$VERSO_CONFIG_DIR` when it is set and non-empty; else
  `$XDG_CONFIG_HOME/verso` when that one is set and non-empty; else
  `~/Library/Application Support/verso` on macOS and `~/.config/verso`
  elsewhere. `verso_core::config_dir` reads the environment and delegates the
  whole rule to `config_dir_from(verso, xdg, home, macos)`, a **pure function**,
  so the precedence is exercised by a test instead of being asserted here.
- **The index of a folder** is `<config>/index/<folder-name>-<hash>.sqlite` —
  the name `verso-index` already computes from the folder's **absolute** path
  (`Index::file_name_for`). `Workspace::open` makes the path absolute before
  the key is computed, so `verso index .` and `verso index ~/vault` from
  somewhere else name one index. `verso-core` computes the path and hands it
  down; the file is opened by `verso-index`
  ([0026](0026-core-ui-contract-inviolable-rules.md), rule 5, delimited scope).
- **No sidecar file.** The memo recommended a `<key>.json` beside the index
  holding the folder's absolute path and the time of the last run; the code
  puts both in the index file's own `meta` table instead (`Index::set_root`,
  written at the end of every run). One file per folder rather than two, and
  the two cannot fall out of step. The reverse mapping an orphan listing needs
  is there, inside the index file it describes.
- **Nothing lists or forgets an orphan yet.** `verso index --list` and
  `verso index --forget <folder>` are **not written**; the rows above are what
  they would read. An index whose folder is gone stays on disk, untouched —
  which is the "cleanup on demand, never automatic" of the index memo, with the
  demand side still missing.
- **The Linux half of the location stays open**, as
  `docs/reference/index-decision.md` §2.6 left it: `~/.config/verso` is what
  the code does today, and whether Linux should use the configuration, the data
  or the cache directory is answered in the PR that brings Linux.

## Discarded alternatives

- A configuration directory inside the folder, on the `.obsidian/` model —
  discarded in §5.1.

## Status

Accepted.
