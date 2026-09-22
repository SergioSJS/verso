# ADR 0046 — Index: location, lifecycle and tokenizer

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R6, R12
- Status in the briefing: not present; details
  [0011](0011-config-outside-tree-index-as-cache.md)
- Revisions: 2026-09-22 — what the feature 3 code does recorded under
  Consequences, as **provisional**; the Decision stays "None" and both
  questions stay `[OPEN]` (memo `docs/reference/index-decision.md`).

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

**How the feature 3 code answers the questions above, recorded on 2026-09-22
and provisional: the maintainer decides on waking**, on the five lines of
`docs/reference/index-decision.md` §9. Each item is what `verso-index` does
today, not a decision; the questions above are unchanged.

- **One SQLite file per folder**, named `<folder-name>-<hash>.sqlite`: the
  folder's own name with every non-alphanumeric character replaced and
  truncated to 32 characters, plus FNV-1a, 64 bits, of the folder's absolute
  path (`Index::file_name_for`). **Where** that file goes is the caller's:
  `verso-index` opens the path it is handed, and the configuration directory
  belongs to `verso-core`
  ([0011](0011-config-outside-tree-index-as-cache.md)). Nothing wires the two
  together yet — that is feature 4.
- **Directory `0700`, file `0600`**, set explicitly when the index is opened,
  on Unix. On a platform that is not Unix, nothing is set.
- **Excluded from Time Machine** by the extended attribute
  `com.apple.metadata:com_apple_backup_excludeItem` with the value
  `com.apple.backupd`; macOS only and **best effort** — a filesystem with no
  extended attributes gets no exclusion and no error. That Time Machine really
  skips the file was not verified.
- **WAL journal mode**, so the `-wal` and `-shm` companions exist next to the
  index file. Their permissions are SQLite's own: the code does not set them,
  and what SQLite gives them was not verified.
- **The schema version lives in a `meta` table** (version 1 today). An index
  carrying any other version is dropped and recreated from scratch, because
  the index is a cache ([0011](0011-config-outside-tree-index-as-cache.md));
  that is also the mechanism a tokenizer change would use.
- **An in-memory index exists** (`Index::in_memory`), used by the tests and
  available later for a folder the user does not want on disk. Nothing chooses
  it for the user yet.
- **No cleanup of orphans.** Nothing lists or deletes an index whose folder is
  gone; the plan recorded in the memo is `verso index --forget` in feature 4.
- **Tokenizer `unicode61 remove_diacritics 2`**, no stemming, `tokenchars` and
  `separators` left at their defaults: `Café`, `cafe` and `CAFÉ` are one term,
  and `cantar` and `cantando` are two.

## Discarded alternatives

None recorded.

## Status

`[OPEN]`. Location: before feature 3 of Phase 1. Tokenizer: before feature 5 of
Phase 1. The feature 3 code runs on the provisional choices recorded under
Consequences; recording them closes nothing.
