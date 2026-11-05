# ADR 0011 — Config outside the tree and the index as a rebuildable cache

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.1
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-22 — what the feature 4 code does recorded under
  Consequences, as **provisional**; the Decision is unchanged and the questions
  [0046](0046-index-location-lifecycle-tokenizer.md) holds stay `[OPEN]`
  (memo `docs/reference/cli-decision.md`).
  2026-10-12 — the provisional records of 2026-09-22 ratified by the
  maintainer as built and tested, answering the ADR audit in session:
  *"Ajuste tudo que precisar. Está aprovado os ADRs"* (adjust whatever
  needs it; the ADRs are approved); a dated note beside each.
  2026-10-12 — with [0070](0070-what-travels-with-the-folder.md) items 1
  and 2 built: the folder's bookmarks, walk rules and folder note name
  live inside the folder, in `.verso/settings.json`, written only when one
  of them is first changed. Rule 1 holds as 0070 reads it — no directory
  is *mandatory* inside the folder, and none appears by opening it — but
  the Consequence "a folder synced between machines does not carry its
  configuration along" no longer holds for those three, and the
  discarded `.obsidian/`-like directory is, for them, what was built. The
  machine's layer — the index, its sidecar, the log, the window's layout
  — stays here, as decided.

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
  feature 3 of Phase 1. *(Decided: 0046 accepted on 2026-09-22.)*

**Where the configuration directory is, and what keys a folder. Recorded on
2026-09-22 from the feature 4 code — provisional, the maintainer decides on
waking**, on line 2 of `docs/reference/cli-decision.md` §10. This is what the
code does, not a decision.
*(Ratified by the maintainer on 2026-10-12, as built and tested:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

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

**After the Opus 5 reading of 2026-09-22 the code also does:**

- **The folder path is normalized before the index is keyed.**
  `Workspace::open` makes the path absolute and then drops `.` and the trailing
  separator (through `Path::components`), so `vault`, `vault/` and `vault/.`
  name one index file instead of three. A shell that completes a directory name
  appends the separator, so this was the first run's problem, not an exotic
  one.
- **`..` is kept, not resolved**, because resolving it means following
  symlinks, which is `verso-fs`'s business
  ([0044](0044-verso-fs-semantics.md)). So `vault/../vault` still keys an index
  of its own: a known gap, recorded rather than decided.
- **No `HOME`, no `XDG_CONFIG_HOME` and no `VERSO_CONFIG_DIR` is an error the
  user sees** (`CoreError::NoConfigDir`, exit code 3), never a directory
  relative to the current one. Under `launchd` or in a bare container the
  fallback used to put the index wherever the process happened to be running,
  possibly inside the open folder itself.

**Decided on 2026-09-22 by the maintainer** (`docs/reference/cli-decision.md`
§10, line 2). The configuration directory is `$VERSO_CONFIG_DIR` when set and
non-empty; otherwise `$XDG_CONFIG_HOME/verso` when that is set; otherwise
`~/Library/Application Support/verso` on macOS and `~/.config/verso`
elsewhere. With none of the three — no `HOME` either — the command **fails
with a message**; it never falls back to a directory relative to the current
one, which in a `launchd` job or a container could land inside the open folder.
No `dirs`/`directories` dependency: the rule is nine lines of our own.

The index of a folder is `<config>/index/<name>-<hash>.sqlite`, keyed on the
folder's absolute path after normalisation, with a `<same>.json` sidecar
recording that path and the time of the last indexing, so an orphaned index can
be listed and forgotten ([0046](0046-index-location-lifecycle-tokenizer.md)).
The sidecar is **not written yet**: it is feature 4's remaining work.

Why this order rather than the platform default alone: the Rust ecosystem's
own libraries return `Application Support` on macOS, and the recurring
complaint against them is that an explicitly set `XDG_CONFIG_HOME` is ignored.
Honouring it when it is set, and falling back to the platform default when it
is not, is the compromise both sides ask for, and it is what a user who keeps
dotfiles expects.

## Discarded alternatives

- A configuration directory inside the folder, on the `.obsidian/` model —
  discarded in §5.1.

## Status

Accepted. Amended by the maintainer on 2026-10-08:

- On Windows the configuration directory is `%LOCALAPPDATA%\verso`, after
  `$VERSO_CONFIG_DIR` and `$XDG_CONFIG_HOME` and ahead of `HOME`: what it
  holds is the machine's, and the roaming `%APPDATA%` is copied between
  machines ([ADR 0069](0069-windows-port.md), item 9; the choice left to
  the port).
- An index run trusts a note by its modified time and length, without
  reading it, when the note was modified at least 2 s before the run that
  last read it began (`indexed_at`, schema 12); otherwise it reads and
  hashes it as before. A change in the same second as a read could keep
  both, so such a note is read again, as git does with its "racy" entries.
  Reading and hashing every note made each opening of 5,000 notes cost
  seconds ("pode ser").
  *Revised on 2026-10-09 (schema 13), the mechanism only:* the date a note
  must be older than is one for the whole index — the start of the last
  complete run, which read or trusted every note (`meta.verified_from`,
  not written by a run that could not list a folder or read a file) —
  instead of one per row. Vouching for each row rewrote every row, its
  text included, on each opening: on the CI runner a reopen of 10,000
  notes went from 379 ms (the recorded baseline) to 949–980 ms. Accepted,
  as in git: a file replaced by one of the same length with the same
  modified second (a copy that keeps times, a restore) is trusted until
  either changes.
  *Noted on 2026-11-04 (no new decision; the same rule, applied where it
  was missing):* a UniVerso's folder log skips a file at a walk by a quick
  key of its length and modified time ([ADR 0079](0079-sync-a-local-folder-with-a-server.md)),
  as the index skips a note. That key now keeps the time to the
  nanosecond the disk gives, and follows this racy rule: it is recorded
  only for a file modified at least 2 s before the reconciliation began to
  read (`SETTLED` in `crates/verso-server/src/sync.rs`); a file written
  later is read again by the next walk, which records its key then. The
  app's sync already remembered a file it read by the same rule. Found by
  the server's night stress test, where a key of whole seconds kept a
  stale hash for good after two writes of one length in one second.
