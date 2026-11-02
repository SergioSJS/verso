# ADR 0046 — Index: location, lifecycle and tokenizer

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R6, R12
- Status in the briefing: not present; details
  [0011](0011-config-outside-tree-index-as-cache.md)
- Revisions: 2026-09-22 — what the feature 3 code does recorded under
  Consequences, as **provisional**; the Decision stays "None" and both
  questions stay `[OPEN]` (memo `docs/reference/index-decision.md`).
  2026-09-22 — the same record brought up to the code as it stands after the
  Opus 5 reading: two of those items rewritten where the code changed, five
  more added, all still **provisional**.
  2026-09-23 — the sidecar's file mode: `0600`, by the maintainer's answer
  (`docs/review/phase-2.md` §6, item 15).
  2026-10-12 — the provisional records of 2026-09-22 ratified by the
  maintainer as built and tested, answering the ADR audit in session:
  *"Ajuste tudo que precisar. Está aprovado os ADRs"* (adjust whatever
  needs it; the ADRs are approved); a dated note beside each.

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

Taken by the maintainer on 2026-09-22, on the five lines of
`docs/reference/index-decision.md` §9.

### Location and lifecycle — decide before feature 3 of Phase 1

**Decided 2026-09-22.** One SQLite file per open folder, under the user's
configuration directory — never inside the folder — named
`<folder-name>-<hash>.sqlite`, with a `<same>.json` sidecar recording the
folder's absolute path and the time of the last indexing, so that an orphaned
index can be listed and forgotten. Directory `0700`, file `0600` on Unix.
Excluded from system backup on macOS by the extended attribute
`com.apple.metadata:com_apple_backup_excludeItem`, best effort. Cleanup only
on demand: an index whose folder disappeared is not deleted on its own, since
the folder may be on a volume that is merely unmounted. "No persistent index"
is recorded as a later option, not taken.

Observed, for scale: Obsidian 1.13.7 keeps its own cache outside the vault too
— one Chromium IndexedDB store shared by every vault, under
`~/Library/Application Support/obsidian/`, 470 MB on the maintainer's machine
on 2026-09-22 — and marks it with no backup-exclusion attribute. One file per
folder and the exclusion are where this decision goes further than the app
(observed from outside only; [0009](0009-external-constraints.md)).

### Tokenizer — decide before feature 5 of Phase 1 (baseline)

**Decided 2026-09-22.** `unicode61` with `remove_diacritics 2`, default case
folding, no stemming, defaults for `tokenchars` and `separators`. The feature 5
baseline is taken with it.

Why, from SQLite's own documentation: FTS5 ships four tokenizers; `porter` is
"designed for use with English language terms only" and **no stemmer for
Portuguese ships with SQLite**; `trigram` is for substring matching and ignores
terms shorter than three characters; `remove_diacritics 1` misses codepoints
carrying more than one diacritic, and `2` removes all Latin diacritics
correctly. So `unicode61 remove_diacritics 2` is the only built-in setting that
treats `café`, `cafe` and `CAFÉ` as one word in both product languages without
distorting either.

**The consequence, accepted knowingly: there is no stemming in either
language.** `castelo` does not find `castelos`, and `walk` does not find
`walking`. The cheap remedy, if it turns out to matter, is prefix matching
(`castelo*`), which today is impossible because the feature 3 guardrail quotes
every user word to neutralise the FTS5 grammar ([0029](0029-guardrails-in-ci.md));
adding an explicit "prefix" option would put the `*` outside the quotes. Not
decided here. **Decided on 2026-10-21 by the maintainer** (the decisions list's
item 0046, option A): prefix search is built only if it becomes a problem in
real use, as this ADR already says ("if it turns out to matter"); an explicit
prefix option now (B) was not chosen.

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
*(Ratified by the maintainer on 2026-10-12, as built and tested:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

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
  index file. The code does not set their permissions; they come out `0600`
  because SQLite creates them with the mode of the database file and the file
  is chmodded before WAL is switched on. The reading of 2026-09-22 saw that
  mode on both. The order of those two lines is what produces it, and a
  comment in the code pins it: reordering them would widen the companions
  without anything failing.
- **The schema version and the tokenizer live in a `meta` table** (version 3
  today). An index carrying any other version — or the same version built with
  another tokenizer — is dropped and recreated from scratch, because the index
  is a cache ([0011](0011-config-outside-tree-index-as-cache.md)). Recording
  the tokenizer is what makes a tokenizer change take effect: without it, an
  existing FTS5 table would stay tokenized the old way and nothing would say
  so.
- **An in-memory index exists** (`Index::in_memory`), used by the tests and
  available later for a folder the user does not want on disk. Nothing chooses
  it for the user yet.
- **No cleanup of orphans.** Nothing lists or deletes an index whose folder is
  gone; the plan recorded in the memo is `verso index --forget` in feature 4.
- **Tokenizer `unicode61 remove_diacritics 2`**, no stemming, `tokenchars` and
  `separators` left at their defaults: `Café`, `cafe` and `CAFÉ` are one term,
  and `cantar` and `cantando` are two.

**Recorded on 2026-09-22 from the feature 3 code as it stands after the Opus 5
reading — provisional, the maintainer decides.** *(Ratified by the maintainer on 2026-10-12, as built and tested: "Ajuste tudo que precisar. Está aprovado os ADRs".)* The two items above about the
`meta` table and the WAL companions were rewritten in place, because they say
what the code does and the code changed. These five are new, and none of them
is a decision either:

- **The note's text is stored once.** `notes_fts` is an FTS5 external-content
  table over the `notes.content` column (`content = 'notes'`,
  `content_rowid = 'id'`), which is what memo `docs/reference/index-decision.md`
  §5.3 recommends. The first commit of the crate used an ordinary FTS5 table
  and kept a second copy of every note inside it; it no longer does. FTS5 now
  holds only its own tokens, tied to `notes.id` by row id, and a note's tokens
  are dropped through the `'delete'` command with the old text handed back to
  it, instead of by a scan over an unindexed column.
- **A SQLite file at the index path that is not ours is rebuilt, not
  refused.** Opening an index whose `meta` table is missing, or whose version
  or tokenizer differs, runs `DROP TABLE IF EXISTS` over the crate's six
  tables and then creates them; anything else the file happens to contain is
  left alone. The alternative was failing with "table already exists" on a
  file the user had put there; the index is a cache
  ([0011](0011-config-outside-tree-index-as-cache.md)), so the code treats the
  path as its own.
- **Opening the index chmods the parent directory even when the crate did not
  create it.** `create_dir_all` is followed by `0700` unconditionally, so a
  directory that already existed at `0755` comes out `0700`. It is a side
  effect on something that may not be ours, stated rather than hidden; the one
  case left alone is a bare file name, whose parent is the empty path.
- **`xattr` is a macOS-only dependency**, declared under
  `[target.'cfg(target_os = "macos")'.dependencies]`. The Time Machine
  exclusion is the only thing that uses it, and it exists only on macOS
  ([0022](0022-target-platforms-macos-first.md)); on the other platforms the
  crate does not build or audit a dependency it cannot call.
- **The note's hash is stored little-endian.** SQLite integers are signed and
  64 bits, so the stamp's `u64` goes in through `to_le_bytes` and comes back
  through `from_le_bytes` rather than through the machine's native order: an
  index file read on a machine of the other endianness still reports the stamp
  it stored, instead of reporting every note as changed.

## Discarded alternatives

None recorded.

## Status

Accepted on 2026-09-22. Location, lifecycle, permissions, backup, cleanup and
tokenizer are decided above. The `verso-index` code implements them except for
the sidecar, which is feature 4's to write; what the code does today is
recorded under Consequences, and the two items that differ from this Decision
are the sidecar and nothing else.

**2026-09-23.** The sidecar exists since `8fb17a6`: `verso-core` writes
`<key>.json` beside `<key>.sqlite`, with the folder, the time of the last run
and the schema, and since the Opus reading of the Phase 2 branch a sidecar
that cannot be written is a warning, not a failed run; the window reopens a
folder by that key. Its file mode was whatever the umask gave (0644 observed),
inside the 0700 directory. Asked whether "file `0600`" above covers it, the
maintainer answered yes on 2026-09-23 (`docs/review/phase-2.md` §6, item 15):
since `850928a` the sidecar is `0600`, set on its temporary before the
rename.
