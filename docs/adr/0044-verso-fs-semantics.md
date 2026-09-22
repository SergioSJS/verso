# ADR 0044 — `verso-fs` semantics: symlinks, opaque handles and ignored paths

- Date: 2026-09-21
- Source: `docs/review/phase-0.md` R3, I6, L5, R11
- Status in the briefing: not present
- Revisions: 2026-09-22 — symlinks, loops and ignored paths decided by the
  maintainer on the memo
  [`docs/reference/fs-decision.md`](../reference/fs-decision.md); the watcher
  placed after feature 2; the opaque handles group untouched and still `[OPEN]`.
  2026-09-22 — facts from the feature 2 code recorded inside the two decided
  groups: the write path of a symlink (decided, it follows from the choice) and
  three items marked **provisional**, for the maintainer to confirm or change.

## Context

The path confinement guardrail ([0029](0029-guardrails-in-ci.md)) and the
opaque handles rule ([0026](0026-core-ui-contract-inviolable-rules.md)) exist as
a principle, but no document says what happens in the cases that decide whether
they work. The Phase 0 review raised three groups of questions that need an
answer before `verso-fs` exists.

## Decision

Two of the three groups are decided. The third is still recorded with the
moment to decide it.

### Symlinks and loops — decided on 2026-09-22

Decided by the maintainer on 2026-09-22, on the memo
[`docs/reference/fs-decision.md`](../reference/fs-decision.md), section 2:

- **Every symlink is followed** — option (c) of the memo. A symlink inside the
  folder that points outside is traversed, and what it reaches is read like any
  other entry: no test of whether the target stays inside the root, no refusal.
  A symlink inside the folder is the user's, and following it is the point.
- **Maximum depth 64.** Reaching the cap is a **recorded error naming the
  path**, never silence; the walk carries on with the rest of the folder. The
  same principle as the network-filesystem row of
  [0029](0029-guardrails-in-ci.md): a limit is reported, not silently applied.
- **Loops are detected by the (device, inode) pair of every directory already
  entered**, together with the depth cap. This follows from the choice rather
  than being a separate one: following all symlinks makes cycles possible, so
  the visited-directory set is mandatory, and the cap is still needed because
  two symlinks can build an arbitrarily deep path that never repeats a
  directory.
- **Hard links: two paths are two notes.** The index is keyed by path, so one
  inode under two names appears twice, and an edit through one name shows up
  under both because the inode is one. Whether the atomic write detects and
  warns that `rename` breaks the link stays where [0029](0029-guardrails-in-ci.md)
  put it, inside the atomic write's requirements; it is not answered here.
- **macOS aliases are ordinary files, by path.** A Finder alias is a file with
  alias data inside it and a `kIsAlias` flag; the filesystem does not resolve
  it. It is not a symlink, and it is not followed.
- **The `inotify` limit on Linux travels with the watcher**, not with feature 2.
  Recorded behaviour, to be implemented when Linux becomes a target: on
  exhaustion, degrade to a periodic scan with a warning surfaced through the
  runtime capabilities ([0027](0027-runtime-capabilities.md)) — never fail
  silently, never pretend the folder stopped changing.
- **A write through a symlink lands on the symlink's target, and the link
  stays.** Following a symlink has a write-path half, and it is not optional:
  the atomic write resolves the link and replaces the file it points at. A
  `rename` over the link itself would replace the link with a regular file and
  leave the user's real file untouched and stale — the note would look saved and
  would not be. Recorded here because it follows from "every symlink is
  followed"; it was reproduced while reading the feature 2 code and fixed there.

**Provisional, recorded on 2026-09-22 from the feature 2 code, not decided.**
The maintainer decides these on waking; they are here because the code had to
choose something and an unrecorded choice is worse than a recorded one:

- **A directory reached a second time under another name is listed once and
  walked once.** Two symlinks to the same attachments folder produce two
  entries; the content is walked under the first name only, and the second is
  reported as a `Duplicate` problem. It is provisional because this same ADR
  says two hard-linked paths are two notes, and the maintainer may prefer the
  second subtree to be walked as well. The price of walking it: two symlinks to
  one large folder double that folder in the index, and a chain of them grows
  exponentially, bounded only by the depth cap of 64.

### Ignored paths — decided on 2026-09-22

Decided by the maintainer on 2026-09-22, on the same memo, section 3. This is
also the answer to Q26 of [`docs/spec/dialect.md`](../spec/dialect.md):

- **Hidden entries are not walked, at any depth.** A name that starts with `.`
  is skipped, which covers `.obsidian/`, `.git/` and `.trash/` without a curated
  list of names to keep up to date.
- **The placeholder pattern is recognized before the hidden rule.** A sibling
  named `.Name.ext.icloud` starts with a dot; it is reported as a placeholder
  for `Name.ext` ([0043](0043-placeholder-guard.md)) and never skipped as
  hidden, because a skipped placeholder reads as an absent file, which
  invariant 10 forbids.
- **Plus a configurable list of relative paths**, in the configuration directory
  outside the tree ([0011](0011-config-outside-tree-index-as-cache.md)),
  **empty by default**. `node_modules/` is not hidden, so it is walked unless
  the user lists it: the price of a rule with one sentence instead of a
  blocklist.
- **`.gitignore` is not read in Phase 1.** Its grammar is a project of its own,
  and its failure mode is notes quietly disappearing.
- **An ignored note is an unresolved link target and is never a backlink
  source.** A `[[link]]` from a visible note to an ignored one stays unresolved;
  a link written inside an ignored note counts for nothing — not as a backlink,
  not as an unresolved link. Not walked means not counted, both ways, which is
  the single rule the hand-written list and the program both follow in exit
  criterion 2 of Phase 1.
- **The ignore list is confined like a request, when the root opens.** An entry
  carrying an absolute path or a `..` component is an error at that moment, and
  `./anexos` is normalized to `anexos`. A misspelled entry that silently ignores
  nothing is the worse failure: the user believes a folder is out of the index
  and it is not.

**Provisional, recorded on 2026-09-22 from the feature 2 code, not decided.**

- **A handle is refused for a hidden entry or an ignored path.** `Root::handle`
  answers `ConfinementError::Hidden` or `ConfinementError::Ignored`. The
  reasoning the code follows: the walk does not list those entries, and the
  handle API is the only door plugins and agents have
  ([0026](0026-core-ui-contract-inviolable-rules.md), rule 6), so reading
  `.obsidian/app.json` or writing `.git/config` through it is refused rather
  than allowed by a path nobody listed. It is provisional because "not indexed"
  and "not readable at all" are two different rules, and reading `.obsidian/`
  may well be wanted later — a theme or a plugin setting is exactly the kind of
  thing an agent could be asked about.

### The watcher — after feature 2

Decided by the maintainer on 2026-09-22, answering the contradiction the memo
recorded in section 2.2: feature 2 is **walk, path confinement and atomic
write**, as the roadmap's row says. The description of `verso-fs` in
[0028](0028-crate-structure.md) — "opaque handles, watcher, atomic write,
confinement" — stays as it is, read as the crate's eventual shape: the watcher
arrives after feature 2, and no date is set for it here.

### Opaque handles — decide before feature 6 of Phase 1 (`verso mcp`) and the contract (Phase 2, item 2.1)

- What a handle identifies: an open descriptor (`openat`, immune to a path swap
  between checking and using) or an index into a table of paths (checking is
  still by string, and the TOCTOU window stays open).
- Stability: does the handle survive an app restart? A file rename? A change of
  workspace root ([0041](0041-multi-root-workspace.md))?
- What the agent receives over MCP as a note identifier, and whether that
  identifier is the same handle as in the contract.
- If the stable identifier ends up being the path relative to the root, rule 4
  has to say so, instead of pretending it is not.

## Consequences

- None of these answers can come "in the code": each one becomes a line in this
  ADR (or an ADR of its own, if it grows) and a `verso-fs` fixture. **No
  `verso-fs` fixture schema exists yet** — `scripts/check-fixtures.sh` and
  section 4 of the dialect spec define the schema for dialect fixtures only
  (memo, section 6). The two decisions above are therefore lines in this ADR
  now, and fixtures once that schema exists; writing it is part of feature 2,
  not of this decision.
- **The path confinement guardrail changes meaning, not strength.** With every
  symlink followed, confinement is a property of the **request**, not of where
  the folder's own contents lead: a request carrying an absolute path, a `..`
  component or a NUL byte is refused. A symlink placed inside the folder is the
  user's, is followed, and what it reaches counts as inside the folder for every
  purpose — index, MCP and plugins. The wording of the guardrail's row in
  [0029](0029-guardrails-in-ci.md) is corrected accordingly, in the same PR as
  this revision.
- While handle semantics stay open, rule 4 of
  [0026](0026-core-ui-contract-inviolable-rules.md) is a constraint on form (do
  not expose a string), not a security guarantee.
- The resource limits (depth, file size, line length) complement Q17 of the
  dialect spec: fuzzing catches crashes, not slowness.

## Discarded alternatives

Considered by the maintainer, on the memo, and set aside:

- **Symlinks: (a) follow none** — the path confinement guardrail would have been
  a lexical check instead of a traversal rule, and it is the only option that
  could be widened later without breaking a vault that already worked. The
  attachments folder by symbolic link is the practice that loses under it.
- **Symlinks: (b) follow only while the target stays inside the root** — it
  needs canonicalization of every entry, a rule for a root that is itself a
  symlink, and it leaves a TOCTOU window that only `openat`-style traversal
  closes.
- **Ignored paths: a curated blocklist of names** (`.obsidian/`, `.git/`,
  `.trash/`, `node_modules/`) — a list that is always one name out of date.
- **Ignored paths: reading `.gitignore`** — the full grammar is a project of its
  own, and a `*.md` line in a repository's `.gitignore` would empty the vault.
- **An ignored note fully indexed, or a target that resolves** — "ignored" would
  then mean "walked but not counted", and exit criterion 2 would depend on the
  maintainer remembering what is in `.trash/`.

## Status

Symlinks, loops and ignored paths: decided on 2026-09-22 by the maintainer,
Accepted. Opaque handles: `[OPEN]`, before feature 6 of Phase 1 and item 2.1 of
Phase 2. The watcher: after feature 2, with no date set. The items marked
**provisional** inside the two decided groups are not decided: they are what the
feature 2 code does, recorded so that nothing is settled by silence, and they
wait for the maintainer.
