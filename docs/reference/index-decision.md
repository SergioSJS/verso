# Decision memo: `verso-index` for feature 3 (location, tokenizer, link resolution, schema, dependency)

- Date: 2026-09-22
- Status: **not decided.** Nothing in this memo is a decision: it lays out
  options, records facts and carries recommendations that are labelled as
  such. The maintainer decides (`CLAUDE.md` §1). While
  there is no decision, the feature 3 code is written **under the
  recommendations, marked provisional**, and changes if the maintainer decides
  otherwise — the same arrangement used for feature 2. That code is now in the
  tree: commits `85699a6`, `289a675` and `ca7bdd8` implement the
  recommendations of sections 2 to 6 provisionally, pending the five answers of
  section 9. What departs from those sections, or adds to them, one sentence
  each:

  1. the FTS5 table is **external content** over a `notes.content` column, as
     section 5.3 recommends — the first of the three commits held an ordinary
     table with a second copy of every note inside it, and no longer does;
  2. `meta` records the **tokenizer** next to the schema version (3 today), so
     that changing the tokenizer rebuilds the index the way changing the
     version does (section 5.1);
  3. a SQLite file at the index path that is **not ours** is rebuilt — the
     crate's tables dropped if they exist, then created — instead of the open
     failing;
  4. opening the index sets the parent directory to `0700` **even when the
     crate did not create it**, so a directory that was already there at
     `0755` comes out `0700`;
  5. the `-wal` and `-shm` companions come out `0600` because the chmod of the
     index file happens **before** WAL is switched on, and the code says so in
     a comment;
  6. `xattr` is declared as a **macOS-only** dependency, since the Time
     Machine exclusion is all that uses it;
  7. the note's hash is stored **little-endian**, so the file reads the same on
     either endianness;
  8. an **empty target** (`[[#Heading]]`, `[[#^id]]`) resolves to the note
     itself: never unresolved, and never a backlink of the note to itself
     (spec §9, Q14; nothing observed in Obsidian);
  9. a **case collision of two paths** (`x/nota.md` and `x/Nota.md`, possible
     on Linux) resolves like a collision of bare names, first in byte order
     (spec §9, Q12; not observed either);
  10. an **unresolved target is shown under the smallest of its spellings** in
      byte order, not the first one seen, so the listing does not depend on the
      query plan (spec §9, Q12);
  11. the search guardrail also **drops control characters** from the query
      words, because a NUL ends FTS5's C string inside a quote and SQLite
      answers with an error ([ADR 0029](../adr/0029-guardrails-in-ci.md)).

  The Opus 5 reading of the code on 2026-09-22 ([ADR 0032](../adr/0032-author-and-reviewer-roles.md):
  Fable 5.1 writes the Rust, Opus 5 reads it) found one BLOCKING — a target
  ending in a multi-byte character (`[[Bar 🍻]]`) panicked the whole ingestion —
  and nine IMPORTANT. All of them are applied or recorded, the BLOCKING with a
  regression test of its own.
- **Decision: taken by the maintainer on 2026-09-22**, in session, recorded
  here and in the closing PR. The five answers: (1) location and lifecycle as
  recommended in section 2.6, the `<key>.json` sidecar included; (2) tokenizer
  as recommended in section 3.4, with the "no stemming" consequence recorded
  in [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md); (3) the
  resolution rule **changed** — a second observation of Obsidian on the same
  day (section 4.1) showed where Fable 5.1's recommendation and the app
  disagree, and the maintainer decided to follow the app: the rule is in
  section 4.6, and it is not the one the code implements today; (4) what the
  index stores, as recommended in section 5.3; (5) the dependency as
  recommended in section 6.4.
- Author: Opus 5 (documents, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Reviewer: Fable 5.1. The recommendations in sections 2 to 6 are **Fable
  5.1's**, recorded here as the author's input; they are not decisions. No Rust
  in this PR.
- Decides on: [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)
  (location, lifecycle, permissions, backup — "before feature 3"; tokenizer —
  "before feature 5", brought forward for the reason in section 3.3) and
  [`docs/spec/dialect.md`](../spec/dialect.md) §9 **Q12**, with the parts of
  **Q2**, **Q8** and **Q14** that backlinks cannot be written without. It also
  touches **Q7**, **Q13** and **Q16** and says where each one is left.
  Feature 3 of Phase 1 cannot close without the first group
  ([roadmap](../roadmap.md), Phase 1).
- Sources read: [ADR 0009](../adr/0009-external-constraints.md),
  [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [ADR 0022](../adr/0022-target-platforms-macos-first.md),
  [ADR 0023](../adr/0023-stack-core-and-editor.md),
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md),
  [ADR 0031](../adr/0031-fixtures-as-contract.md),
  [ADR 0035](../adr/0035-cross-cutting-requirements.md),
  [ADR 0037](../adr/0037-base-parser.md),
  [ADR 0039](../adr/0039-performance-targets.md),
  [ADR 0041](../adr/0041-multi-root-workspace.md),
  [ADR 0042](../adr/0042-open-from-command-line.md),
  [ADR 0043](../adr/0043-placeholder-guard.md),
  [ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0045](../adr/0045-server-and-mcp-security.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), the
  [roadmap](../roadmap.md) Phase 1 table and exit criteria, spec §4 and §9
  (Q2, Q7, Q8, Q12, Q13, Q14, Q16), the two earlier memos
  ([`parser-decision.md`](parser-decision.md),
  [`fs-decision.md`](fs-decision.md)) and
  [`docs/reference/obsidian-cli.md`](obsidian-cli.md). Section 8 lists what
  was **not** verified.

## 1. What is being decided, and why now

Feature 3 of Phase 1 is `verso-index`, and the roadmap gives it three
deliverables: **SQLite schema, FTS5, backlinks**. The same roadmap lists two
decisions tied to it:

1. **Location, permissions and cleanup of the index**, `[OPEN]` in
   [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), "before
   feature 3 closes".
2. **FTS5 tokenizer for pt-BR and EN**, `[OPEN]` in the same ADR, "before
   feature 5 takes the baseline".

Three more come from the spec, and they are the reason this memo is longer
than those two lines: an index of **backlinks** cannot be written without a
rule that says which file `[[nota]]` points at. That is **Q12**, `[OPEN]`, and
answering it drags in **Q2** (does an embed count as a link?), **Q8** (case)
and **Q14** (a link to a file that does not exist). Phase 1 exit criterion 2
is the reason this cannot be postponed: the maintainer writes a backlinks list
by hand and the program's output has to match it, so both sides must count the
same thing. A list written under one resolution rule and a program written
under another is a failure of the criterion with nobody at fault — exactly the
argument that brought Q26 forward in feature 2.

The tokenizer is in the list although ADR 0046 dates it to feature 5: the FTS5
table is **created** in feature 3 and a table is created with a tokenizer.
Changing it afterwards is a reindex, which is cheap because the index is a
cache — but it is a decision that gets made in feature 3 whether or not anyone
records it (section 3.3).

The decided material that constrains the answers, none of it reopened here:

- **The config lives outside the tree, keyed by the folder path, and the index
  is a rebuildable cache** ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)).
  Deleting the index loses no data; ADR 0046 adds the other half — **keeping
  it must leak no data**.
- **`verso-index` opens the index file, and nothing else**
  ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), rule 5 and
  its delimited scope; [ADR 0028](../adr/0028-crate-structure.md)). The files
  of the open folder are `verso-fs`'s; the configuration directory is
  `verso-core`'s.
- **SQLite with FTS5** ([ADR 0023](../adr/0023-stack-core-and-editor.md)), and
  FTS5 brings a guardrail of its own: **parameterized queries plus escaping of
  the FTS5 syntax** ([ADR 0029](../adr/0029-guardrails-in-ci.md), feature 3),
  seen failing in feature 3's PR before it merges.
- **The parser is read-only** (Q18, reading (b)): it returns a report with
  positions and byte ranges, and the index stores what the report says
  ([`parser-decision.md`](parser-decision.md)).
- **Citation is by `^id` or by position**
  ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)), so the index has to
  carry positions from Phase 1 on.
- **What the walk returns** is settled ([ADR 0044](../adr/0044-verso-fs-semantics.md),
  [`fs-decision.md`](fs-decision.md)): symlinks followed, hidden entries not
  walked, an ignored note is an unresolved target and never a backlink source,
  a placeholder is present-with-no-content and is never opened.
- **macOS is the initial platform** ([ADR 0022](../adr/0022-target-platforms-macos-first.md)).
- **pt-BR and EN from the first commit of product code**
  ([ADR 0035](../adr/0035-cross-cutting-requirements.md)) — which is why the
  tokenizer cannot be an English-only one.
- **Phase 1 has no UI**; it ships `index`, `search`, `backlinks` and a
  read-only `verso mcp`.

## 2. Decision 1 — where the index lives and what happens to it (ADR 0046)

### 2.1 What is already decided, and what ADR 0046 leaves open

ADR 0011 already answers the first half of the question: the index is a
rebuildable cache and it lives outside the tree, in the user's configuration
directory, keyed by the folder path. This memo does not reopen that. What
ADR 0046 asks is the remainder, and each item is a real choice:

| ADR 0046 asks | Section |
|---|---|
| Where the index lives when the folder is sensitive | 2.2 |
| Permissions on the index file (minimum: only the user reads it) | 2.3 |
| Whether the index goes into system backup (Time Machine, iCloud) | 2.3 |
| What happens to the orphaned index when the folder disappears or moves | 2.4 |

### 2.2 Where the file goes, side by side

| | (a) always in the user's config directory | (b) next to the folder, or inside it | (c) configurable per folder |
|---|---|---|---|
| Consistency with [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) and [ADR 0010](../adr/0010-folder-is-the-unit-no-vault.md) | exact: no mandatory directory inside the open folder | contradicts "no mandatory directory inside the folder"; an Obsidian vault gains a Verso file | the default is (a); the exception is the user's, declared by them |
| A folder on an encrypted or removable volume | gains a shadow of its text on the local disk — the concern ADR 0046 raises | no shadow: the index travels and disappears with the volume | the user chooses per folder |
| A folder synced between machines | the index is local, rebuilt on each machine | the index is synced too: two machines writing one SQLite file over a sync client is a corruption case | the user chooses, and can choose badly |
| Opening the same folder from two machines | independent caches, no interaction | one file, two writers | as chosen |
| Backup | follows the config directory's backup, unless excluded (2.3) | follows the folder's backup | as chosen |
| What the user has to know | nothing | that a directory appeared in their vault | that the option exists |
| Cost in feature 3 | one path computation | one path computation plus a write inside the open folder, which `verso-fs` would have to perform (ADR 0026 rule 5) | (a) plus a config key and its validation |

Option (b) is written out because ADR 0046 names it ("next to the folder"),
not because anything supports it: it puts a file of ours inside the open
folder, which ADR 0010 and ADR 0011 discarded, and it makes the index
something a sync client will try to merge.

The third thing the sensitive-folder case can mean is **not to have a
persistent index at all** — index in memory, for this run only. Under Phase 1
that is close to useless: every CLI command is one-shot, so an in-memory index
means reindexing the whole folder on every `verso search`. It becomes useful
when a resident process exists (`verso serve`, Phase 2 and later). Recorded
here as a later option, not as a Phase 1 choice.

### 2.3 Permissions, and whether the index goes into system backup

**Permissions.** ADR 0046's minimum is "only the user can read it". On macOS
and Linux that is directory `0700` and file `0600`, set by us and not left to
the process umask. Two consequences worth recording:

- SQLite creates companion files next to the database — `-journal`, or `-wal`
  and `-shm` in WAL mode — and they hold the same text. Whatever mode the main
  file gets, those have to get it too. SQLite's own documentation says it
  tries to give them the database file's permissions; the code checks rather
  than trusts (not verified here, section 8).
- A restrictive mode is not encryption. Anything running as the user reads the
  index. Encrypting it (SQLCipher, or a key in the keychain as
  [ADR 0019](../adr/0019-generative-opt-in-and-keychain.md) does for API keys)
  is a different decision, not proposed here and not in Phase 1.

**System backup.** The index is a cache of the user's text. Time Machine backs
up `~/Library/Application Support` by default, so by default the folder's whole
content would gain a second backed-up copy with a different lifetime from the
folder's — which is the concern ADR 0046 raises. Three options:

| | leave it backed up | exclude it from backup | put it where backup does not look |
|---|---|---|---|
| ADR 0046's "keeping the index leaks no data" | not met: the text is backed up twice, once outside the user's control of the folder | met for Time Machine | met, if such a place exists |
| Cost of a restore | the index comes back; it would be rebuilt anyway | the index is missing after a restore and is rebuilt on the next `verso index` — which is what "rebuildable cache" means | same |
| How it is done on macOS | nothing | set the extended attribute `com.apple.metadata:com_apple_backup_excludeItem` with the value `com.apple.backupd` on the index file (and on its companions) | a cache directory (`~/Library/Caches`) is the platform's answer, but the system may delete it under disk pressure — which is allowed, since the index is a cache |
| Risk | a copy of the vault in the backup, forever | the exclusion silently not applying (section 8) | the index disappearing at a moment we do not control, making a run slow with no explanation |

### 2.4 Orphans and cleanup

ADR 0011 already records the underlying fact: the key is the path, so **moving
or renaming the folder dissociates its config**, and the ADR says the briefing
does not say how reassociation happens. The index inherits that. The options
for the orphan:

| | delete automatically when the folder is not found | never delete; make orphans listable and deletable on demand | ask at every start |
|---|---|---|---|
| A folder on an unmounted volume, or on a network share that is down | the index is deleted; when the volume returns, a full reindex | nothing happens; the index is used again when the folder returns | the user is asked about something they cannot answer |
| A folder that was really deleted | cleaned up with no action | takes disk until the user runs the command | cleaned up after an interaction |
| Failure mode | deleting a valid cache because a disk was asleep | disk use grows with abandoned folders | notification fatigue |
| What it needs | nothing | a record of which folder each index belongs to, and a command | both |

"Make them listable" needs the reverse mapping, because the file name is a
hash: a sidecar `<key>.json` next to the index, holding the folder's absolute
path, the time of the last indexing and the schema version. It is our own
file, in our own directory, and it says nothing the index does not already
hold.

The command that consumes it belongs to feature 4 (`verso-cli`), not to
feature 3: `verso index --list` and `verso index --forget <folder>` are names,
not a decision — the subcommand set closes in feature 4 together with the
disambiguation question of [ADR 0042](../adr/0042-open-from-command-line.md).

### 2.5 Which crate creates the directory, and what the lint sees

Rule 5 of [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), in its
delimited scope, splits this in two: **the configuration directory is read and
written by `verso-core`**; **the index file is opened by `verso-index`**.
Applied literally to feature 3:

- `verso-core` resolves the user's configuration directory, creates
  `…/verso/index/` with mode `0700` if it is not there, computes the key from
  the folder's absolute path and hands `verso-index` an absolute path to a
  file.
- `verso-index` opens (and creates) that file, sets its mode and its backup
  exclusion, and writes the sidecar of section 2.4 — all of them inside the
  configuration directory, none of them in the open folder.
- Neither of them touches the files of the open folder. Those reach the index
  through `verso-fs`, as `Entry` plus content plus a stamp.

One honest note about the guardrail. The `disallowed_methods` lint denies
`std::fs` outside `verso-fs`, and `crates/verso-fs/clippy.toml` is today the
only declared exception; the workspace file already says that `verso-index`
and `verso-core` "get a narrower exception of their own, declared in the PR
that needs it". But **rusqlite opens the database through SQLite's C code, not
through `std::fs`**, so the lint would not fire on it either way. The
mechanical check does not cover this boundary: "`verso-index` opens the index
file only" is held by review and by the crate's dependency list, not by a
lint. That is a fact about the guardrail, recorded here rather than
discovered later.

### 2.6 Recommendation of Fable 5.1 for decision 1

**Option (a): one SQLite file per opened folder, under the user's
configuration directory.** On macOS,
`~/Library/Application Support/verso/index/<key>.sqlite`, where `<key>` is a
readable prefix (the folder's name, sanitized and truncated) plus a stable
hash of the folder's **absolute path**, so that the name is recognizable by a
human and unique by construction. Which hash, and the exact prefix rule, are
implementation details for the PR.

- **Directory `0700`, file `0600`**, set explicitly, companions included
  (section 2.3).
- **Excluded from Time Machine**, by setting the extended attribute
  `com.apple.metadata:com_apple_backup_excludeItem` with the value
  `com.apple.backupd` on the index file. The index is a cache; losing it in a
  restore costs one reindex, and keeping it in the backup is exactly the leak
  ADR 0046 names.
- **A sidecar `<key>.json`** with the folder's absolute path, the time of the
  last indexing and the schema version, so orphans can be listed.
- **Cleanup on demand, never automatic** — `verso index --forget <folder>` in
  feature 4. A folder on an unmounted volume is not a folder that is gone.
- **Per-folder "no persistent index"** (in memory, for a sensitive folder)
  recorded as a later option, useful when a resident process exists; not
  Phase 1.
- **The Linux location is not decided here.** macOS is the initial platform;
  when Linux arrives, the XDG question (`~/.config/verso` versus
  `~/.local/share/verso` versus `~/.cache/verso`) is answered in the PR that
  brings it, and the "cache" answer interacts with the backup reasoning above.

**Discarded alternatives considered:** option (b), next to the folder, is
written out in section 2.2 because ADR 0046 names it; nothing else was
considered.

## 3. Decision 2 — the FTS5 tokenizer (ADR 0046)

### 3.1 What FTS5 offers, as publicly documented

FTS5 ships four built-in tokenizers: `unicode61` (the default), `ascii`,
`porter` (a wrapper that stems the output of another tokenizer, with the
Porter algorithm — English) and `trigram` (every three characters become a
token, which makes substring and `LIKE` search possible at the cost of index
size). `unicode61` takes options, of which two matter here:

- `remove_diacritics`, with values `0`, `1` and `2`. `0` keeps diacritics;
  `1` is the default and removes them for a subset of codepoints; `2` removes
  them across the range, including characters that carry more than one.
- `tokenchars` and `separators`, which move individual characters between
  "part of a word" and "separator".

`unicode61` also folds case using Unicode's simple case folding, so `CAFÉ`,
`Café` and `café` become one token once diacritics are removed.

There is no Portuguese stemmer in FTS5. Adding one means either a custom
tokenizer registered through FTS5's C API — which rusqlite does not expose and
which would mean FFI of our own, against the workspace's `unsafe_code =
"forbid"` — or stemming in Rust before the text reaches SQLite, which changes
what is stored and is a decision of its own. Neither is proposed for Phase 1.

### 3.2 The options, side by side

| | `unicode61` default | `unicode61` + `remove_diacritics 2` | `porter` over `unicode61` | `trigram` | `ascii` |
|---|---|---|---|---|---|
| `cafe` finds `Café` | partly: the default `1` covers the common Latin letters, not everything | yes | yes (inherits the option) | yes, as a substring | no |
| `CAFÉ` finds `café` | yes | yes | yes | yes | ASCII case only |
| `cantando` finds `cantar` | no | no | no — Porter is English; on Portuguese it cuts wrongly | no | no |
| `running` finds `run` | no | no | yes | no | no |
| Damage to the other language | none | none | pt-BR words stemmed by English rules, silently | none | accents break search |
| Index size | baseline | baseline | slightly smaller | several times larger | baseline |
| Substring search (`aço` inside `braço`) | no | no | no | yes | no |
| Fit with [ADR 0035](../adr/0035-cross-cutting-requirements.md) (pt-BR **and** EN) | partial | yes, for accents and case | no: it privileges one language and damages the other | neutral | no |

`trigram` is not a rival of `unicode61` so much as a second index: a folder
could have both, one for word search and one for substring search. That is a
feature-5 or later question (it has a cost in size and in indexing time), and
nothing in Phase 1 asks for it.

### 3.3 What a later change costs

An FTS5 table is created with its tokenizer; changing it means dropping and
recreating the table and reindexing. Because the index is a cache
(ADR 0011), the cost is time, not data — the same cost as a first open.

What it does break is the **benchmark baseline**: ADR 0046 says so, and
[ADR 0039](../adr/0039-performance-targets.md) hangs the performance targets
off that baseline. So the order matters: decide the tokenizer, then take the
baseline in feature 5. This is also why the schema version of section 2.4 has
to name the tokenizer — when it changes, the index rebuilds itself without the
user being asked.

### 3.4 Recommendation of Fable 5.1 for decision 2

**`unicode61` with `remove_diacritics 2`, default case folding, `tokenchars`
and `separators` left alone, and no stemming.**

- It is the only option in the table that serves pt-BR and EN equally, which
  ADR 0035 requires.
- `remove_diacritics 2` rather than the default `1` because `1` is documented
  as covering a subset: `Café`/`cafe` is the case the ADR names, and `2` is the
  one that handles it across the range.
- No stemming: no built-in stemmer serves both languages, and `porter` would
  damage the pt-BR half silently. `cantar`/`cantando` therefore do not match
  each other; that is the price, and it is recorded rather than hidden.
- Defaults for `tokenchars`/`separators`: `#`, `^` and `/` stay separators, so
  a `#tag` searches as `tag`. Whether a tag is a search term of its own is
  Q13, open; keeping the defaults does not prejudge it, since tags will have a
  column of their own (section 5.1).
- **The feature 5 baseline is taken with this tokenizer**, and the index
  records it so that changing it later forces a rebuild.

**Discarded alternatives considered:** `porter` and `trigram`, above;
`ascii` is listed for completeness and fails the accent requirement outright.

## 4. Decision 3 — the link resolution rule (Q12, with Q2, Q8, Q14)

### 4.1 What was observed in Obsidian on 2026-09-22

Verified by Fable 5.1 on the maintainer's Mac, through the Obsidian CLI with
Obsidian 1.13.7, **public API only** — admissible under
[ADR 0009](../adr/0009-external-constraints.md) and by the method recorded in
[`docs/reference/obsidian-cli.md`](obsidian-cli.md). Set-up, in a throwaway
sandbox folder: `a/dup.md` and `b/dup.md` (same basename, two folders);
`Alvo.md`, with `aliases: [apelido]` in its frontmatter; and `src.md`
containing, in one line:

```
[[dup]] [[a/dup]] [[alvo]] [[ALVO]] [[apelido]] [[Alvo.md]] [[nao-existe]] ![[Alvo]] [[Alvo#Heading]] [[b/dup|alias b]]
```

Results:

| Command | Result |
|---|---|
| `obsidian links file=src` | `verso-fixtures/Alvo.md`, `verso-fixtures/a/dup.md`, `verso-fixtures/b/dup.md`, `apelido (unresolved)`, `nao-existe (unresolved)` |
| `app.metadataCache.resolvedLinks["verso-fixtures/src.md"]` | `{"a/dup.md": 2, "Alvo.md": 5, "b/dup.md": 1}` |
| `app.metadataCache.unresolvedLinks["verso-fixtures/src.md"]` | `{"apelido": 1, "nao-existe": 1}` |
| `getFirstLinkpathDest("dup", "verso-fixtures/src.md")` | `a/dup.md` — the ambiguous basename resolves to the first by path order |
| `getFirstLinkpathDest("alvo", …)` and `("ALVO", …)` | `Alvo.md` — case-insensitive |
| `getFirstLinkpathDest("Alvo.md", …)` | `Alvo.md` — an explicit `.md` extension is accepted |
| `getFirstLinkpathDest("a/dup", …)` | `a/dup.md` — a path relative to the root |
| `getFirstLinkpathDest("apelido", …)` | `null` — **a frontmatter alias does not resolve a link** |
| Backlinks of `Alvo` | `src.md`, listed once |

Two counts in that table carry answers of their own. `Alvo.md: 5` accounts for
`[[alvo]]`, `[[ALVO]]`, `[[Alvo.md]]`, `![[Alvo]]` and `[[Alvo#Heading]]`: the
**embed counts as a link** (Q2) and a **heading link counts toward the note**.
`nao-existe` is kept as an unresolved target with a count (Q14), in a map
separate from the resolved ones.


**Second observation, 2026-09-22, by Opus 5.** Same method
([ADR 0009](../adr/0009-external-constraints.md), Obsidian 1.13.7, public API,
throwaway folder deleted afterwards), set up to separate the hypotheses the
first run could not: `verso-obs/nota.md`, `verso-obs/sub/nota.md`,
`verso-obs/B/dup.md`, `verso-obs/a/dup.md`, `verso-obs/aa/bb/prof.md`,
`verso-obs/zz/prof.md`, and source notes at three depths.

| Probe | Result | What it separates |
|---|---|---|
| `[[nota]]` from `verso-obs/src.md` | `verso-obs/nota.md` | — |
| `[[nota]]` from `verso-obs/sub/src2.md` | `verso-obs/sub/nota.md` | a candidate in the source's own folder wins |
| `[[nota]]` from `verso-obs/sub/deep/src5.md` | `verso-obs/nota.md` | it is the **same** folder, not the nearest ancestor |
| the same three, with `nota.md` added at the vault root | `nota.md` for all three | a path from the root is tried before any bare name |
| `[[prof]]` from `verso-obs/src4.md` | `verso-obs/zz/prof.md` | fewest segments beats byte order (`zz` over `aa/bb`) |
| `[[dup]]`, candidates at the same depth | `verso-obs/B/dup.md` | byte order decides among equals: `B` before `a` |
| `[[sub/nota]]` from `verso-obs/src.md` | `verso-obs/sub/nota.md` | a path is also resolved relative to the source |
| `[[../nota]]` from `verso-obs/sub/src2.md` | `verso-obs/nota.md` | `..` is honoured |
| `[[#Cabecalho]]` | the source note itself, and the note appears in its own backlinks | an empty target resolves, and it is a backlink |
| `[[.md]]`, `[[nota/]]` | unresolved | neither is a name |
| `[[NOTA.MD]]` | `verso-obs/nota.md` | the extension is matched case-insensitively too |

Two of these contradict what section 4.5 recommends, and one contradicts what
the code does. They are what section 4.6 decides.

**Third observation, 2026-09-23, by Opus 5.5.** Same method
([ADR 0009](../adr/0009-external-constraints.md), Obsidian 1.13.7, public API,
throwaway folders deleted afterwards). Commit `4712f85` (2026-09-22) changed
point 3 of the index's rule after probes that were cited in a test comment
(`crates/verso-index/tests/graph.rs`) and in the commit message, and never
written here; these are the same probes, run again so that they are on record.
Names were made unique to the vault; the folder `probe-sub/` sorts before
`verso-probe/` in byte order, as `sub/` did in the original. Every link is in
`verso-probe/a/src.md` unless the row says otherwise; segments are counted in
brackets.

| Probe | Candidates | Result | What it separates |
|---|---|---|---|
| `[[probe-sub/vpx]]` | `probe-sub/vpx.md`; `verso-probe/a/probe-sub/vpx.md` | `probe-sub/vpx.md` | a path from the root comes before the same path relative to the source |
| `[[vpx]]` | `probe-sub/vpx.md` (2); `verso-probe/a/probe-sub/vpx.md` (4) | `verso-probe/a/probe-sub/vpx.md` | a candidate **under** the source's folder beats a shallower one elsewhere |
| `[[vpu]]` | `verso-probe/vpu.md` (2, the parent folder); `verso-probe/a/probe-sub/vpu.md` (4) | `verso-probe/a/probe-sub/vpu.md` | the same, against the source folder's parent |
| `[[vpt]]` | `probe-sub/vpt.md` (2); `verso-probe/a/probe-sub/deep/vpt.md` (5) | `verso-probe/a/probe-sub/deep/vpt.md` | at any depth under the folder |
| `[[vpz]]` | `verso-probe/a/aa/deep/vpz.md` (5); `verso-probe/a/zz/vpz.md` (4) | `verso-probe/a/zz/vpz.md` | among candidates under the folder, fewest segments before byte order |
| `[[vpw]]` | `probe-sub/vpw.md` (2); `verso-probe/vpw.md` (2, the parent folder) | `probe-sub/vpw.md` | an ancestor folder gains nothing: byte order decides |
| `[[vpv]]` | `probe-sub/vpv.md` (2); `verso-probe/a/vpv.md` (3, the source's own folder) | `verso-probe/a/vpv.md` | control: the source's own folder still wins |
| `[[vpr]]` from `verso-probe/a/src2.md` | `vpr.md` (1, the vault root); `verso-probe/a/probe-sub/vpr.md` (4) | `vpr.md` | control: a path from the root still comes before any bare name |

`app.metadataCache.resolvedLinks` agreed with `getFirstLinkpathDest` on every
row.

What it changes: point 3 of section 4.6 says a candidate **in** the source
note's own folder wins. Obsidian prefers a candidate anywhere **under** that
folder, at any depth, before it counts segments — the second observation could
not tell the two apart, because none of its candidates sat below the source's
folder. The index has done "under" since `4712f85`. Asked "sob a pasta, sim
ou não?", the maintainer answered yes on 2026-09-23 ("boa, gosto da sua ideia,
pode seguir"), and point 3 of section 4.6 and of spec Q12 now says "under".

**Fourth observation, 2026-09-23, by Opus 5.5.** Same method, for the "new
link format" setting the maintainer approved with that answer: from
`verso-probe2/a/src.md`, with `verso-probe2/a/sub/rx.md`,
`verso-probe2/a/sub2/rx.md` and a root-level `sub2/rx.md`, `[[./sub/rx]]` and
`[[./sub2/rx]]` reached the notes under the source's folder — the leading `./`
makes a path relative even when the same path exists at the root — while
`[[sub2/rx]]` reached the root-level note, and `[[../a/sub/rx]]` the one under
the source's folder. So a relative link that Verso writes as `./…` or `../…`
means the same to Obsidian.

### 4.2 What the observation settles, and one contradiction it raises

It settles, as a description of Obsidian: extension optional and `.md`
accepted, relative path accepted, basename accepted, case-insensitive,
ambiguity resolved to one candidate, embeds counted, unresolved links tracked
with a count, and backlinks reported per source note rather than per
occurrence.

It does **not** settle what Verso does. [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md)
binds the dialect's *syntax* to Obsidian's; how an index resolves a name is not
syntax. The observation is recorded because compatibility with existing vaults
is a decided goal, and because the maintainer can repeat every line of it
before deciding.

**One contradiction, recorded and not resolved** (`CLAUDE.md`
§1.3): Obsidian's public documentation describes aliases as a way to link to a
note, and the observation above shows `[[apelido]]` counted as *unresolved*,
with `getFirstLinkpathDest` returning `null`. Both are admissible sources
under ADR 0009. This memo does not pick a side; section 4.5 recommends the
behaviour that is cheapest to reverse, and section 8 lists what would settle
it.

### 4.3 The candidate rule, side by side

Given the target text of a wikilink — `dup`, `a/dup`, `Alvo.md`, `apelido` —
which note it names:

| | (a) exact relative path only | (b) path, then basename, case-insensitive (what was observed) | (c) "shortest unique path" |
|---|---|---|---|
| `[[a/dup]]` | resolves | resolves | resolves |
| `[[dup]]` with `a/dup.md` and `b/dup.md` | unresolved | resolves to `a/dup.md` (first by path) | ambiguous: unresolved, or an error |
| `[[alvo]]` for `Alvo.md` | unresolved | resolves | resolves |
| `[[Alvo.md]]` | resolves only if a file is literally named `Alvo.md.md` | resolves | resolves |
| A vault written in Obsidian | most links break | works | mostly works |
| Predictability for the user | total | a silent winner among duplicates | "unique" changes as notes are added |
| Effect on exit criterion 2 | the hand-written list is easy and wrong about real vaults | the hand-written list follows one stated rule | the maintainer has to compute uniqueness by hand |
| Cost | none | one lookup table per folder, two keys | the same table plus a uniqueness pass |

Option (c) is listed because Q12 names it ("unique shortest path"). It has the
property that adding a note can silently change what an old link points at,
which (b) also has, in a smaller form — under (b) only a new file that sorts
before the current winner changes anything.

### 4.4 Unicode normalization (Q7) and case (Q8)

**Normalization.** The same name can be two byte sequences: `José` with a
precomposed `é` (NFC) or with `e` plus a combining accent (NFD). A vault that
has been through HFS+ or through a sync client can hold both forms, in file
names and in link targets. APFS preserves the form it is given and compares
normalization-insensitively, so on the initial platform the *filesystem* does
not distinguish them — but our index compares strings, not filesystem entries,
and a link's text comes from the file's content, not from the filesystem.
Comparing after normalizing both sides to NFC makes the two forms one name;
not normalizing makes them two notes that no link can find. Normalizing costs
a dependency (`unicode-normalization` or equivalent), which is a
new-dependency decision for the feature 3 PR.

**Case.** Q8 records the platform asymmetry: on case-insensitive APFS
`NOTA.md` and `nota.md` cannot coexist, so a case-insensitive rule never has
to choose between them; on Linux they can, and then case-insensitive
resolution makes them two candidates for one name — the same ambiguity as
`dup`, resolved the same way. Rust's `str::to_lowercase` implements full
Unicode lowercase mapping; the well-known edge cases (Turkish dotless `ı`,
Greek final sigma) are not cases pt-BR or EN produces.

**The extension.** `verso-fs` classifies a regular file as a note when its
extension is exactly `md`, and records that as provisional pending Q8 and Q12
(spec §9 Q12). A resolution rule that lowercases the target does not by itself
make `NOTA.MD` a note — that is the walk's classification, and it stays where
it is.

**Non-Markdown targets (Q16).** `![[imagem.png]]` and `[[relatorio.pdf]]` name
files the walk sees as `File`, not `Note`. Q16 asks which of them enter the
index as link targets. This memo does not answer it; section 4.5 says what
happens meanwhile, and it costs a reindex to change.

### 4.5 Recommendation of Fable 5.1 for decision 3

**The rule the index implements, provisional until the maintainer decides:**

1. Take the wikilink's target text **as written** (spec §4.2 keeps it
   unresolved in the fixture), drop a trailing `.md` if present, and normalize
   it to **NFC**.
2. Match it, **case-insensitively**, against (a) each note's path relative to
   the root without the `.md` extension, then (b) each note's basename without
   the extension. Paths are compared with `/` as the separator, also after NFC.
3. Several candidates: **the first in byte order of the relative path**, which
   is what was observed (`a/dup.md` before `b/dup.md`). The rule is stated so
   that the hand-written list of exit criterion 2 can follow it.
4. No candidate: **unresolved**, stored with the target text exactly as
   written, so that a later `verso backlinks` can list pending targets. An
   unresolved link is **not** a backlink (Q14).
5. **Embeds resolve by the same rule and count as links** (Q2), which is what
   Obsidian's counts show. A link that carries a heading or a block
   (`[[Alvo#Heading]]`, `[[Alvo#^id]]`) counts toward the note; matching the
   heading itself is Q19 and is not needed to count a backlink.
6. **Aliases do not resolve** a link — the observed behaviour. Recommended
   because it is the reversible side of the contradiction in section 4.2: if
   the maintainer later decides aliases resolve, the change turns unresolved
   links into resolved ones and costs a reindex; the opposite direction would
   remove backlinks a user had come to rely on.
7. **Only notes are resolution targets in Phase 1** (Q16 open): a target that
   names a `.png` or a `.pdf` stays unresolved, stored with its text. When
   Q16 is answered, a reindex turns those into resolved targets.
8. Backlinks are reported **per source note**, as Obsidian does; how many times
   a note links to another is stored (one row per occurrence, with position)
   and displayed as the CLI's output format decides in feature 4.

**On Unicode normalization: not observed.** Section 4.4's NFC recommendation
rests on the definition of the forms, not on a check of what Obsidian does
with them. It is the cheapest rule to state and the one that makes two byte
sequences of one name behave as one name; the maintainer may prefer to compare
bytes, and section 8 lists what an observation would need.

**Fixtures.** The natural home for this rule is a `verso-index` fixture — a
small folder plus the expected resolution — and **no schema exists for one**.
Spec §4 defines the `expected.yaml` of **dialect** fixtures, whose `links[]`
deliberately stop at the target text "as written"; `verso-fs` fixtures have
the same gap, recorded in [`fs-decision.md`](fs-decision.md) §6. This memo
does not invent the schema. Until it exists, the rule above is tested by
ordinary Rust tests, and exit criterion 2 is the maintainer's check on real
notes.

**Discarded alternatives considered:** options (a) and (c) of section 4.3;
nothing else.

### 4.6 The rule the maintainer decided on 2026-09-22

Decided in session, with the app's behaviour as the measure: *follow Obsidian*.
Section 4.5 stays as it was written, as the recommendation that preceded the
second observation.

**The rule Verso implements**, as observed in Obsidian 1.13.7 (section 4.1):

1. Strip `#…`, `^…` and `|alias` from the target first. An **empty target**
   (`[[#Heading]]`) is the note itself, and the note is then a source of its
   own backlinks.
2. Try the rest **as a path**, extension optional and case-insensitive,
   compared after NFC: relative to the **source note's own folder**, honouring
   `..`, and from the **root of the open folder**.
3. No path matches: match the **bare name**, case-insensitively — first a
   candidate **under the source note's own folder**, at any depth; otherwise
   the candidate with the **fewest path segments**; among equals, the **first
   in byte order** (`B/dup.md` before `a/dup.md`). *(Amended by the maintainer
   on 2026-09-23 after the third observation of section 4.1; it said "in".)*
4. Nothing answers: **unresolved**, stored with the target text as written. An
   unresolved link is never a backlink (Q14).
5. **A frontmatter alias does not resolve a link. An embed resolves by the
   same rule and counts as a link** (Q2). `[[nota/]]` and `[[.md]]` do not
   resolve.

**What has to change in `verso-index`** — five points, all of them Rust, so a
Fable 5.1 session ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)):

| # | The code today | Decided |
|---|---|---|
| a | resolution ignores which note the link is in | a candidate in the source note's own folder wins |
| b | ties by byte order of the whole path | fewest segments first; byte order only among equals |
| c | a path is matched only from the root | also relative to the source's folder, `..` included |
| d | `[[.md]]` folds to the empty key and resolves to the note itself | unresolved |
| e | `[[#Heading]]` is excluded from the note's own backlinks | it is one |

So that the rule stays one SQL expression: `links` already carries the source
note's id, so "the source's own folder" is a prefix comparison against the
source's `notes.path`; "fewest segments" is
`length(path) - length(replace(path, '/', ''))`; byte order is the default
`BINARY` collation. Resolution stays at query time, so adding a note still
resolves the links that were waiting for it.

**A consequence the maintainer asked to record: moving a note.** Once
resolution depends on the source's folder, moving a note can change which note
a link reaches, and a link written as a path (`[[sub/nota]]`) can stop
resolving altogether. Obsidian's answer is to rewrite the links when the app
itself moves the file, and the maintainer wants the same. That belongs to
[ADR 0048](../adr/0048-file-operations-in-ui.md) and to Phase 2 — Phase 1 has
no UI and moves no file — and is recorded there as a requirement, not
implemented here.

## 5. Decision 4 — what the index stores

This is a listing to **confirm**, not a menu. It follows from decisions
already taken — the parser's report (Q18 reading (b)), citation by position
(ADR 0018), the walk's output (ADR 0044) — and the only genuine choice in it
is section 5.2.

### 5.1 The tables, as proposed

| Table | What it holds | Why |
|---|---|---|
| `notes` | relative path; the `Stamp` from `verso-fs` (modified time, length, content hash); title = the first H1, or the file stem when there is none; whether it is a placeholder | the stamp is what makes reindexing incremental and is the same value invariant 11 compares before a write ([ADR 0012](../adr/0012-files-are-source-of-truth.md)) |
| `headings` | note, level, text, position, byte span | `[[nota#seção]]` (Q19, later) and citation |
| `blocks` | note, `^id`, position, byte span | citation by `^id` ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)) |
| `links` | source note, target text as written, resolved target (or null), heading, block, alias, whether it is an embed, position, byte span | backlinks in both directions, plus the pending targets of Q14 |
| `frontmatter` | `tags` and `aliases` as typed columns (one row per value); every other key as JSON text with its key | `tags` and `aliases` are the two the briefing names; the rest is kept without inventing a schema (Q11 is Phase 2) |
| `fts` | the note's text, tokenized (section 5.2) | `verso search` |
| `meta` | schema version, tokenizer and its options, the folder's absolute path, the time of the last indexing | a rebuild when any of them changes; the sidecar of section 2.4 mirrors it |

Positions and byte spans are stored for every construct because the parser
already produces them and because citation needs them — an index that keeps
only line numbers cannot point an agent at a block.

Nothing in the list stores something the files do not: the index stays a
cache, and deleting it loses nothing (ADR 0011, which also says that being
safe to delete "becomes a test, not a promise").

### 5.2 FTS5 and the second copy of the text

The genuine choice. An FTS5 table can hold the text three ways:

| | ordinary FTS5 table | external content (`content=notes`) | contentless (`content=''`) |
|---|---|---|---|
| Copies of the text in the index file | two: the `notes` column and FTS5's own copy | one: the `notes` column; FTS5 keeps only its inverted index | zero |
| Snippets and highlighting (`snippet()`, `highlight()`) | yes | yes | no — the CLI would read the file through `verso-fs` to build a snippet |
| Keeping the two in step | nothing to do | triggers, or explicit writes on every update | nothing |
| Rebuilding the FTS table from the index alone | yes | yes | no: the files have to be read again |
| What ADR 0046's concern sees | the whole text twice | the whole text once | not the text, but the **tokens**: an inverted index of every word of the vault, which is not a rendering of the notes but is not nothing either |

The line to be clear about: **no option removes the vault's words from the
index file.** FTS5 stores the tokens whatever the content mode; `external
content` avoids the second copy, `contentless` avoids the text but keeps the
tokens. The protection ADR 0046 asks for comes from section 2.3 — permissions
and backup — and not from the content mode.

(SQLite's documentation records a `contentless_delete` option for
contentless tables in recent versions; the bundled amalgamation here is
3.53.2. Not verified, section 8.)

### 5.3 Recommendation of Fable 5.1 for decision 4

**The listing of 5.1 as written, with `external content` for the FTS5 table.**
One copy of the text, snippets and highlighting still work, and a rebuild of
the search index does not need the folder. The cost is keeping the content
table and the FTS table in step, which is a known SQLite pattern and is
covered by the tests of feature 3.

**Discarded alternatives considered:** the ordinary table (a second copy for
no gain) and the contentless one (which would trade snippets for a protection
it does not actually provide, as the table above shows).

## 6. Decision 5 — the dependency and the feature 3 guardrail

### 6.1 What was checked in the crates, on 2026-09-22

Read from the crates themselves — `cargo info` against the crates.io index,
and the crate archives in the local registry cache — not from memory:

- **`rusqlite` 0.40.2, MIT.** Default features are `cache` and
  `ffi-sqlite-wasm-rs` (a WASM build of SQLite we do not want in a desktop
  core), so `default-features = false` is not optional.
- **There is no `fts5` feature in `rusqlite` 0.40.2.** The feature list has
  `bundled`, `cache`, `vtab`, `series`, `array`, `window` and some forty
  others; `fts5` is not among them. This memo's task description assumed one,
  and the assumption is wrong.
- **FTS5 comes from the bundled build.** `libsqlite3-sys` 0.38.2 (MIT)
  compiles the amalgamation with `-DSQLITE_ENABLE_FTS5` unconditionally, in
  the same list as `-DSQLITE_ENABLE_JSON1` and `-DSQLITE_ENABLE_RTREE`
  (`build.rs`, `build_bundled`). So `features = ["bundled"]` is what gets FTS5.
- **The bundled SQLite is 3.53.2** (`SQLITE_VERSION` in the vendored
  `sqlite3.h`).
- **`rusqlite`'s non-optional dependencies** are `bitflags`,
  `fallible-iterator`, `fallible-streaming-iterator` and `smallvec`, plus
  `hashlink` when `cache` is on, plus `libsqlite3-sys`. `cargo deny` checks
  their licenses in the PR; the allowlist in `deny.toml` already carries MIT,
  Apache-2.0 and the other permissive ones.
- **`bundled` pulls `cc` at build time**, so a C compiler is needed on every
  machine that builds Verso, CI included. Both runners have one.

### 6.2 Bundled or the system SQLite, side by side

| | `bundled` (compile the amalgamation) | the system SQLite |
|---|---|---|
| FTS5 present | always, by the build flag above | macOS: yes, in the system library. Linux CI: only if a package is installed, and the version varies by distribution |
| Version everywhere | one, 3.53.2, identical on the maintainer's Mac and in CI | whatever each machine has |
| A bug that depends on the SQLite version | reproducible | "works on my machine" |
| Build cost | the amalgamation compiles once per toolchain change, cached afterwards; a C compiler required | none |
| Binary size | larger by the size of SQLite | smaller |
| Security updates to SQLite | ours to bump, in a PR | the operating system's |
| License | SQLite is public domain; the wrappers are MIT | same |

### 6.3 How the feature 3 guardrail is met

[ADR 0029](../adr/0029-guardrails-in-ci.md) states the feature 3 guardrail as
**parameterized queries plus escaping of the FTS5 syntax**, and the thing it
prevents is "search breaking with quotes and operators". They are two separate
mechanisms, because SQL and FTS5's MATCH grammar are two languages:

1. **SQL.** Every value is bound as a parameter (`?1`, `:name`) through
   rusqlite; no query is assembled by formatting a value into a string. This
   covers paths, targets, ids — everything except the MATCH expression, which
   is not SQL.
2. **FTS5.** The MATCH expression has a grammar of its own: bare words are
   terms, `AND`/`OR`/`NOT`/`NEAR` are operators, `*` is a prefix, `column:` is
   a column filter, `^` anchors, `-` and parentheses group, and a double quote
   opens a phrase. A user typing `"` or `NOT` must not change the query's
   meaning, and must not make SQLite return an error either. The rule:
   **every term the user typed is wrapped in double quotes, with each inner
   double quote doubled**, and the terms are joined by the operator the CLI
   chose, not by one the user typed. Inside a quoted phrase, FTS5 treats the
   operators as ordinary text, so `NOT`, `*`, `:` and `^` search for
   themselves.
3. **Consequence to state, not to hide:** with everything quoted, a user
   cannot type `casa*` and get a prefix search, or `titulo:casa` and get a
   column filter. Those become flags of `verso search` in feature 4 if the
   maintainer wants them. The guardrail buys that predictability.
4. **The test that is seen failing first**: a table of hostile inputs —
   `"`, `a OR b`, `NOT`, `NEAR(x y)`, `col:x`, `*`, `-x`, a lone `^`, an
   unbalanced `(` — each of which must find the notes containing that literal
   text and must never produce an error. Removing the escaping makes it fail,
   which is what ADR 0029 asks to see before the PR merges.

### 6.4 Recommendation of Fable 5.1 for decision 5

**`rusqlite` 0.40 with `default-features = false` and `features = ["bundled",
"cache"]`.** `bundled` brings SQLite 3.53.2 with FTS5 compiled in and one
version everywhere; `cache` is rusqlite's prepared-statement cache, which an
indexer that runs the same statements per note wants; `default-features =
false` drops `ffi-sqlite-wasm-rs`. The named alternative, the system SQLite,
is not recommended: it is a different SQLite on every machine and none on
Linux CI without a package.

**On `unsafe`:** the workspace forbids `unsafe_code` in **our** crates. A
wrapper around a C library contains FFI by definition; that `unsafe` is the
dependency's and is not covered by our lint. Recording it here means the
maintainer reads it in a memo rather than discovering it in a PR.

**What the PR still owes** ([ADR 0033](../adr/0033-pr-workflow.md)): the
justification of the dependency in the PR body, what it replaces in our own
code (an SQLite binding of our own, which would be FFI and therefore
`unsafe`), and a green `cargo deny check` covering the transitive licenses.

**Discarded alternatives considered:** the system SQLite, above. `sqlx` and
other async wrappers were not evaluated: Phase 1 has no async runtime and
adding one for an index would be a decision of its own.

## 7. Not for decision here

Listed so the maintainer sees what feature 3 carries out from decisions
already taken. Nothing in this section is open.

- **Rule 5's scope** ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)):
  `verso-index` opens the index file and nothing else. The files of the open
  folder come through `verso-fs`; the configuration directory is
  `verso-core`'s; `verso-dialect` has no IO.
- **The index is a rebuildable cache** ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)):
  deleting it loses no data, and that is a test rather than a promise.
- **Citation by `^id` or by position** ([ADR 0018](../adr/0018-llm-native-mcp-in-core.md)):
  the index stores positions and byte spans from Phase 1 on, which is why they
  are in section 5.1.
- **The walk's semantics** ([ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0043](../adr/0043-placeholder-guard.md)): hidden entries are not
  walked, an ignored note is an unresolved target and never a backlink source,
  a placeholder is never a deletion and is never opened. The index inherits all
  of it and does not re-decide it.
- **CLI messages in pt-BR and EN** ([ADR 0035](../adr/0035-cross-cutting-requirements.md)):
  feature 4 and item 7 of the phase, not feature 3. `verso-index` produces
  errors, not user-facing strings.
- **Exit criterion 2 of Phase 1** ([roadmap](../roadmap.md)): the hand-written
  backlinks list and the program follow the same rule — which is why section 4
  exists.
- **Multi-root resolution** ([ADR 0041](../adr/0041-multi-root-workspace.md),
  `PROPOSED`): Q12 notes that resolution would cross roots. One root, one
  index, in Phase 1.
- **MCP** ([ADR 0045](../adr/0045-server-and-mcp-security.md)): the queries
  feature 6 exposes come from this index; the transport and surface are
  decided before feature 6, not here.

**What stays open after this memo**, so that deciding five things does not look
like deciding more: Q13 (inline tags), Q16 (non-Markdown targets), Q19
(heading matching), Q20 (Markdown links to a local file), Q21 (what a block
is), Q7 if the maintainer prefers to leave normalization unanswered, the
`verso-index` and `verso-fs` fixture schemas, the Linux location of section
2.6, the subcommand set of feature 4 ([ADR 0042](../adr/0042-open-from-command-line.md)),
and the performance targets that wait for the feature 5 baseline
([ADR 0039](../adr/0039-performance-targets.md)).

## 8. What this memo did not verify

- **No SQL was run and no schema was created here.** Section 5.1 is a
  proposal on paper. The feature 3 code is being written in parallel under
  these recommendations, marked provisional, and is not evidence for them.
- **Obsidian and Unicode normalization: not observed.** Section 4.4 rests on
  the definition of NFC and NFD and on what APFS does, not on a test. What
  would settle it: a note whose name carries an accent, written in one form,
  linked in the other, and `getFirstLinkpathDest` asked to resolve it.
- **How Obsidian orders ambiguous candidates** was seen in exactly one case:
  `dup` → `a/dup.md`. Byte order of the relative path is the hypothesis; the
  same observation is equally consistent with alphabetical order, with folder
  order, with creation order and with shortest path. A third and fourth
  duplicate in different folders would separate them.
- **The alias contradiction** of section 4.2 was not investigated further: the
  observation stands, the public documentation says aliases can be linked, and
  nothing here explains the difference. A rerun after a cache refresh, and a
  test through the UI's link autocompletion, are what would settle it.
- **The Time Machine exclusion was not tested.** Setting
  `com.apple.metadata:com_apple_backup_excludeItem` to `com.apple.backupd` is
  the documented mechanism, and whether a backup then really skips the file
  was not checked on this machine. `xattr -p` on the file and a look at the
  backup are what would check it.
- **The permissions of SQLite's companion files** (`-wal`, `-shm`,
  `-journal`) were not observed; section 2.3 states them as a requirement on
  our code, not as a fact about SQLite.
- **`contentless_delete`** (section 5.2) is reported from SQLite's public
  documentation, not tested.
- **The rusqlite feature names were checked**, and the check found the
  assumption wrong: there is no `fts5` feature (section 6.1). What was *not*
  done is a build: the crate was not compiled here, and that FTS5 is really
  available in the built library is confirmed the first time
  `CREATE VIRTUAL TABLE … USING fts5(…)` runs in the feature 3 PR.
- **No measurement of anything**: index size, indexing time, search latency.
  That is feature 5's baseline ([ADR 0039](../adr/0039-performance-targets.md)).
- **No fixture schema exists for `verso-index`**, the same gap
  [`fs-decision.md`](fs-decision.md) records for `verso-fs`. Spec §4 covers
  dialect fixtures only, and this memo does not invent an extension of it.

## 9. How the maintainer decides and verifies, without reading code

**Check that the memo is what the PR says it is:**

```
git fetch origin && git checkout phase1/index-decision
git diff --stat origin/main..HEAD          # two files under docs/, no fixtures/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # unchanged fixtures still pass the lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # author and Signed-off-by are yours
```

**Optionally, repeat the observation** of section 4.1 with the commands in
[`docs/reference/obsidian-cli.md`](obsidian-cli.md): a sandbox folder with two
notes of the same basename in different folders, one note with an alias, and
one note linking to all of them.

**Decide, in five lines on the PR:**

1. **Location and lifecycle.** Fable 5.1 recommends *one SQLite file per
   folder under the user's configuration directory, directory `0700` and file
   `0600`, excluded from Time Machine by extended attribute, a `<key>.json`
   sidecar so orphans are listable, cleanup only on demand, and "no persistent
   index" recorded as a later option*.
2. **Tokenizer.** Fable 5.1 recommends *`unicode61` with
   `remove_diacritics 2`, default case folding, no stemming, defaults for
   `tokenchars`/`separators`; the feature 5 baseline is taken with it*.
3. **Resolution rule.** Fable 5.1 recommends *the eight points of section 4.5*:
   drop `.md`, NFC, case-insensitive, path then basename, first by byte order
   on ambiguity, unresolved stored with its text and never a backlink, embeds
   count as links, aliases do not resolve, only notes are targets in Phase 1.
4. **What the index stores.** Confirm the listing of section 5.1 — or say what
   is missing — and the `external content` FTS5 table of section 5.3.
5. **Dependency.** Fable 5.1 recommends *`rusqlite` 0.40 with
   `default-features = false` and `features = ["bundled", "cache"]`* (FTS5
   comes from the bundled build; there is no `fts5` feature), with the FTS5
   escaping of section 6.3 as the feature 3 guardrail.

**What the closing PR records, if the recommendations are accepted:**

| Where | What it gains |
|---|---|
| [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md) | the location, permissions, backup, cleanup and tokenizer answers; status changes from `[OPEN]` to Accepted |
| [`docs/spec/dialect.md`](../spec/dialect.md) §9 | Q12 closed; the parts of Q2, Q8 and Q14 that section 4.5 answers, each with a line in section 10's history table; Q7 closed or explicitly left open |
| [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md) | the consequence that points at ADR 0046 gets its answer |
| [ADR 0029](../adr/0029-guardrails-in-ci.md) | how the feature 3 guardrail is met (section 6.3), as the atomic-write requirements were recorded for feature 2 |
| [roadmap](../roadmap.md), Phase 1 | the two decision rows struck through, as Q18, ADR 0037 and Q26 were |
| `fixtures/` | nothing yet: a `verso-index` fixture needs a schema first (section 8) |
