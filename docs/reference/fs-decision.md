# Decision memo: `verso-fs` semantics for feature 2 (symlinks, ignored paths, placeholders)

- Date: 2026-09-21
- Status: **open. This memo decides nothing.** It lays out three questions that
  [ADR 0044](../adr/0044-verso-fs-semantics.md) and
  [ADR 0043](../adr/0043-placeholder-guard.md) leave `[OPEN]` with the note
  "decide before feature 2 of Phase 1", puts the options side by side, and
  records a recommendation for each one. The maintainer decides
  (`CLAUDE.md` §1).
- Author: Opus 5 (documents, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Reviewer: Fable 5.1. The recommendations in sections 2, 3 and 4 are
  **Fable 5.1's**, recorded here as the author's input; they are not decisions.
  No Rust in this PR.
- Decides on: [ADR 0044](../adr/0044-verso-fs-semantics.md) (symlinks and loops;
  ignored paths), [ADR 0043](../adr/0043-placeholder-guard.md) (per-provider
  detection mechanism) and, through ADR 0044,
  [`docs/spec/dialect.md`](../spec/dialect.md) Q26. Feature 2 of Phase 1 cannot
  close without them ([roadmap](../roadmap.md), Phase 1).
- Sources read: [ADR 0009](../adr/0009-external-constraints.md),
  [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0022](../adr/0022-target-platforms-macos-first.md),
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0031](../adr/0031-fixtures-as-contract.md),
  [ADR 0041](../adr/0041-multi-root-workspace.md),
  [ADR 0043](../adr/0043-placeholder-guard.md),
  [ADR 0044](../adr/0044-verso-fs-semantics.md), the
  [roadmap](../roadmap.md) Phase 1 table, spec §9 Q26, and
  [`docs/reference/obsidian-cli.md`](obsidian-cli.md). Section 6 lists what was
  **not** verified.

## 1. What is being decided, and why now

Feature 2 of Phase 1 is `verso-fs`, and the roadmap gives it three deliverables:
**walk the folder, path confinement, atomic write**. The same roadmap lists two
decisions "before feature 2 closes":

1. **Symlinks, loops and ignored paths (Q26)**, `[OPEN]` in ADR 0044.
2. **Placeholder detection mechanism per provider, starting with iCloud Drive**,
   `[OPEN]` in ADR 0043 (whose rule is Accepted; only the mechanism is open).

They come before the code, not after it, for the same reason Q18 did: each one
changes what the walk returns, and what the walk returns is what the index, the
backlinks and Phase 1 exit criterion 2 count. Exit criterion 2 says so
literally — the hand-written backlinks list "follows the decisions on Q26
(ignored paths) and Q20 (Markdown links), so that both sides count the same
thing". A list written under one rule and a program written under another is a
failure of the criterion with nobody at fault.

The decided material that constrains the answers, none of it reopened here:

- **Path confinement is a feature guardrail of this very feature** (ADR 0029):
  "a plugin or agent leaving the folder via `../` or a symlink". It is seen
  failing in feature 2's PR before the PR merges.
- **Only `verso-fs` touches the files of the open folder** (ADR 0026, rule 5;
  ADR 0028), mechanically checked by the `std::fs` lint.
- **The filesystem API of the contract works with opaque handles**, and a path
  string exists only at the entry edge and inside `verso-fs` (ADR 0026, rule 4).
  What a handle *identifies* is `[OPEN]` until feature 6.
- **A placeholder is never a deletion** (ADR 0043, invariant 10). The scan has
  three states: present, absent, placeholder.
- **Opening never rewrites; every write checks the file is the one that was
  read** (ADR 0012, invariants 7 and 11).
- **The index is a rebuildable cache and the config lives outside the tree,
  keyed by the folder path** (ADR 0011).
- **macOS is the initial platform** (ADR 0022); Linux is a target, not the
  first one.
- **Phase 1 has no UI**; its deliverables are `index`, `search`, `backlinks`
  and a read-only `verso mcp` (roadmap).

## 2. Decision 1 — symlinks, loops and related identities

### 2.1 The three options for a symlink, side by side

| Question | (a) never follow | (b) follow if the target stays inside the root | (c) follow all |
|---|---|---|---|
| What the walk emits for a symlink | an entry of kind `symlink`: name, position in the tree, the fact that it is a link. Never traversed, never opened, never read | the target's content, when `canonicalize` lands inside the root; a refusal, recorded, when it does not | the target's content, wherever it is |
| What the confinement guardrail has to prove | that no path leaves the root — and no symlink is ever followed, so the only way out is `../`, which is a lexical check on a normalized path | that `canonicalize` was called on **every** traversed path, that the comparison against the root is correct for a root that is itself a symlink (`/tmp` on macOS is), and that nothing is opened between the check and the use | nothing. The guardrail has no meaning; the folder is not the unit any more ([ADR 0010](../adr/0010-folder-is-the-unit-no-vault.md)) |
| TOCTOU | no window: nothing is traversed | a real window: the target can be replaced between `canonicalize` and `open`. Closing it needs `openat`-style traversal, which is the same machinery ADR 0044 leaves open for handles until feature 6 | not applicable |
| The "attachments folder by symlink" practice | breaks. The answer is a second root ([ADR 0041](../adr/0041-multi-root-workspace.md), `PROPOSED`) | works, as long as the attachments folder is *inside* the root — which is the case where the symlink was not needed in the first place | works |
| Loops | impossible through symlinks; only a depth cap is left, against pathological real trees | possible, and detection by visited inode (device + inode) becomes mandatory | possible, across the whole disk |
| What the index holds | paths under the root only | paths under the root, some of which resolve elsewhere; two paths may be one inode | anything |
| Cost in feature 2 | one branch in the walk plus a lexical confinement check | canonicalization per entry, a visited-inode set, a root-canonicalization rule, and a documented TOCTOU limitation | none, and no guardrail |
| Reversible later | toward (b) or (c): yes, additively. The entry of kind `symlink` already exists in the model; a later decision changes whether it is traversed, not what a walk result looks like | toward (a): a vault that worked stops working | toward anything: a vault that worked stops working |

### 2.2 Loops, maximum depth and the `inotify` limit

ADR 0044 asks for loop detection "by visited inode, by maximum depth, or both".
The answer depends on option (a)/(b)/(c):

- Under **(a)**, a directory tree with no followed symlinks has no cycle: a
  POSIX directory hierarchy without symlinks is a tree. Visited-inode
  bookkeeping buys nothing. A **maximum depth** is still worth having, not
  against cycles but against pathological trees and against a bug in our own
  code; it is a cheap counter.
- Under **(b)** or **(c)**, visited-inode detection is mandatory *and* the depth
  cap stays, because two symlinks can build an arbitrarily deep non-repeating
  path.

Whatever the cap, ADR 0044 asks for "explicit failure or degradation" rather
than silence, which is the same principle as the network-filesystem row of
ADR 0029: **the limit is reported, never silently applied**. A tree cut off at
the cap produces a recorded error naming the path, and the walk continues with
the rest of the folder.

The **`inotify` limit** is a Linux question: the kernel default for
`max_user_watches` is small enough that a large vault exhausts it, and the
failure is per-watch, not global. macOS has no equivalent limit because FSEvents
watches a subtree rather than a directory per descriptor. Since macOS is the
initial platform (ADR 0022) and Linux has no UI in Phase 2 either, the cheapest
honest answer is to **record the behaviour now and implement it when Linux
becomes a target**: on exhaustion, degrade to a periodic scan with a warning
surfaced through runtime capabilities
([ADR 0027](../adr/0027-runtime-capabilities.md)), never fail silently and never
pretend the folder stopped changing.

**A question the roadmap and ADR 0028 do not answer the same way.** ADR 0028
describes `verso-fs` as "opaque handles, **watcher**, atomic write,
confinement"; the roadmap's feature 2 deliverable is "walk the folder, path
confinement, atomic write" — no watcher. Phase 1 has no UI and its CLI commands
are one-shot, so nothing in the phase consumes file-change events. This is
recorded here as a contradiction to resolve, not resolved
(`CLAUDE.md` §1.3). It matters for this memo because the
`inotify` answer is a watcher answer: if the watcher is not in feature 2, the
`inotify` line is a recorded consequence and nothing more.

### 2.3 Hard links and macOS aliases

ADR 0044 asks whether they "count as the same file".

- **Hard links.** Two names for one inode. The index is keyed by path
  (ADR 0011 keys the config by path; links resolve by name), so **two paths are
  two notes**, and editing through one shows up under both because it is one
  inode. The place where this is not cosmetic is the atomic write: `rename`
  replaces the inode, so a write through one name **breaks the link** and the
  other name keeps the old content. ADR 0029 already lists "hard links and
  aliases: the rename swaps the inode. Decide whether it detects and warns" as
  a requirement of feature 2 — that decision is *inside* the atomic write, and
  section 5.1 lists it rather than deciding it here.
- **macOS aliases.** A Finder alias is an ordinary file with alias data inside
  it and a `kIsAlias` Finder flag; the filesystem does not resolve it, only
  Launch Services does. Treating it as a regular file is therefore not a policy
  choice but a description of what it is. It is not a symlink and option
  (a)/(b)/(c) does not apply to it. A `.md` alias would be indexed as a `.md`
  file whose bytes are not Markdown — the same outcome as any binary file with
  a Markdown extension, which is Q17/Q25 territory in the dialect spec, not a
  `verso-fs` question.

### 2.4 Recommendation of Fable 5.1 for decision 1

**Option (a), do not follow any symlink, for Phase 1**, with a **maximum depth
of 64** and a recorded error, never silence, when the cap is hit.

The reasoning, as recorded by Fable 5.1:

- The path-confinement guardrail is the point of `verso-fs`. A symlink that
  leaves the root is exactly the escape it guards against; option (a) makes the
  guardrail a lexical property of the walk rather than a race the code has to
  win every time.
- Following in-root symlinks buys little and doubles the confinement logic
  (canonicalize every path, root-is-itself-a-symlink, a TOCTOU window that only
  `openat`-style traversal closes — and what a handle is stays `[OPEN]` until
  feature 6).
- The common "attachments folder by symlink" practice is the multi-root
  workspace's job (ADR 0041, `PROPOSED`), not a symlink exception. Solving it
  with symlinks would settle by accident a question ADR 0041 leaves open.
- Option (a) is the only one of the three that can be widened later without
  breaking a vault that already worked.
- Hard links and macOS aliases: ordinary files by path; an alias is not
  followed.
- `inotify`: record "degrade to a periodic scan with a warning", implement when
  Linux becomes a target.

**Discarded alternatives considered:** none beyond (b) and (c) above.

## 3. Decision 2 — ignored paths (ADR 0044, spec Q26)

Two independent sub-questions. ADR 0044 asks both, and they can be answered
differently.

### 3.1 Where the list comes from

| | fixed in the code | configurable in the config outside the tree ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)) | read from `.gitignore` |
|---|---|---|---|
| What it covers | whatever we enumerate: `.obsidian/`, `.git/`, `.trash/`, `node_modules/`… | the same, plus whatever this folder needs | whatever the repository already declares |
| What happens to a folder we did not think of | it is walked; the user cannot say otherwise | the user adds one line | covered if it is a repository, not otherwise |
| Where the setting lives | nowhere | the user's configuration directory, keyed by the folder path (ADR 0011). Not inside the open folder, so an Obsidian vault gains no Verso file | inside the folder, a file that belongs to another tool |
| Does it travel with the folder | — | no: ADR 0011 already records that a synced folder does not carry its config | yes, and it means something else |
| Semantics to implement | none | a list of relative paths, compared literally | the full `.gitignore` grammar: precedence, `!` negation, `**`, per-directory files, `.git/info/exclude`, the global file. A project of its own |
| Risk | too little control | none identified | quietly hiding notes because a build tool ignored them; a `*.md` line in a `.gitignore` would empty the vault |

The three are not exclusive: a default rule can coexist with a configurable
list, and `.gitignore` can be added later without undoing either.

**One interaction the list rule must not get wrong.** The visible form of an
iCloud Drive placeholder is a sibling file named `.Name.ext.icloud` — it starts
with a dot. A rule that skips hidden entries would therefore skip exactly the
file that decision 3 exists to recognize, and the note would read as **absent**,
which is what invariant 10 forbids. Whatever the list rule, the `.icloud`
pattern is recognized **before** the hidden rule is applied, and the entry is
reported as a placeholder for `Name.ext`, not as a hidden entry.

### 3.2 Whether an ignored note can be a link target or a backlink source

| | (i) invisible | (ii) target yes, source no | (iii) fully indexed |
|---|---|---|---|
| `[[nota-no-lixo]]` from a visible note | unresolved | resolves to the ignored note | resolves |
| A link *from* the ignored note | does not exist | does not exist | counts as a backlink |
| `verso backlinks` on a note linked only from `.trash/` | empty | empty | lists the trashed note |
| What the walk has to read | nothing under an ignored path | the names under an ignored path, but not the contents | everything |
| Consistency with "ignored" | total | partial: an ignored file is half in the index | none; "ignored" means "not walked", which this contradicts |
| Effect on Phase 1 exit criterion 2 | the hand-written list omits trashed notes | same | the hand-written list must include them, and the maintainer must remember what is in `.trash/` |

Option (ii) is written out because ADR 0044 phrases the question as "whether an
ignored note can be the target of a link (appears as pending)": in (i) the link
*is* pending/unresolved, which is what that phrasing describes; in (ii) it would
resolve. The difference is whether "ignored" means "not walked" or "walked but
not counted".

### 3.3 What Obsidian does with `.trash/`, observed

Verified by Fable 5.1 on the maintainer's Mac, through the Obsidian CLI with
Obsidian 1.13.7, public API only — admissible under
[ADR 0009](../adr/0009-external-constraints.md) and by the method recorded in
[`docs/reference/obsidian-cli.md`](obsidian-cli.md). Set-up, in a throwaway
sandbox vault: `verso-fixtures/fx-alvo.md` as the target;
`verso-fixtures/fx-visivel.md` containing `[[fx-alvo]]`; `.trash/fx-trash.md`
containing `[[fx-alvo]]` and `[[fx-inexistente]]`. Results:

| Command | Result |
|---|---|
| `obsidian backlinks file=fx-alvo` | only `verso-fixtures/fx-visivel.md` |
| `obsidian files` | does not list the `.trash` note at all |
| `obsidian unresolved verbose` | nothing from the `.trash` note; its broken link is not even an unresolved link |
| `obsidian eval code='app.metadataCache.getCache(".trash/fx-trash.md")'` | `null` |

Obsidian neither indexes nor counts a note under `.trash/`: not as a backlink
source, not as an unresolved-link source, not as a file. That is option (i) of
section 3.2, seen from outside. A `verso-fs` fixture recording this decision
would carry the same block in `observed:` (ADR 0031; ADR 0043 already says a
provider becomes a `verso-fs` fixture, not a dialect one).

This observation is evidence about Obsidian, not an argument that Verso must
match it: the dialect rule (ADR 0030) is about *syntax*, and what an index
ignores is not syntax. It is recorded because compatibility with existing
vaults is a decided goal (ADR 0012, decision 1) and because the maintainer can
repeat the commands before deciding.

### 3.4 Recommendation of Fable 5.1 for decision 2

**The list:** hidden entries — a name starting with `.` — are **not walked, at
any depth**, which covers `.obsidian/`, `.git/`, `.trash/` and the placeholder
names of decision 3 (with the exception of section 3.1: the `.icloud` pattern is
recognized first); **plus a configurable list of relative paths in the config
outside the tree, empty by default** (ADR 0011). **`.gitignore` is not read in
Phase 1** — its semantics are a project of their own, and the failure mode is
notes disappearing.

Consequence to note: `node_modules/` is not hidden, so under this rule it is
walked unless the user adds it to the configurable list. That is the price of a
rule with one sentence instead of a curated blocklist.

**Link targets:** an ignored note appears as an **unresolved** target and is
**not** a backlink source — option (i) of section 3.2. Obsidian's public
documentation describes `.trash` and excluded files as not indexed, and the
observation in section 3.3 agrees. Phase 1 exit criterion 2 needs one rule that
both the hand-written list and the program follow, and "not walked means not
counted, either way" is the rule with the fewest edges.

**Before deciding, the maintainer can check Obsidian directly** with the
commands in [`docs/reference/obsidian-cli.md`](obsidian-cli.md) — `backlinks`,
`unresolved`, `files` — and the answer, whatever it is, becomes a `verso-fs`
fixture with its `observed:` block.

**Discarded alternatives considered:** a curated blocklist of specific names
(`.obsidian/`, `.git/`, `.trash/`, `node_modules/`) with no hidden-entry rule —
considered and set aside by Fable 5.1 as a list that is always one name out of
date; it is still available to the maintainer as a variant of "fixed".

## 4. Decision 3 — placeholder detection, iCloud Drive first (ADR 0043)

ADR 0043 is Accepted: a placeholder is never a deletion, and the guard holds
from feature 2 on. Only the **mechanism** is `[OPEN]`, and the ADR says to start
with iCloud Drive because the initial platform is macOS.

### 4.1 What an iCloud placeholder is on macOS, verified

Two forms, and they are not alternatives — a vault can contain both:

1. **The dataless flag.** `<sys/stat.h>` on this machine's macOS SDK defines,
   at line 359:

   ```c
   #define SF_DATALESS     0x40000000     /* file is dataless object */
   ```

   It is a bit of `st_flags` in `struct stat`. APFS sets it on a file whose
   contents have been evicted, which is how an iCloud Drive file that is "not
   downloaded" is marked on macOS 10.15 and later. The name `Name.ext` stays;
   size and dates stay; only the data is gone.

2. **The `.icloud` sibling.** The older and visible form: `Name.ext` disappears
   and `.Name.ext.icloud` appears in its place — dot-prefixed, `.icloud`
   suffix, a small property-list file. ADR 0043 already names this one.

The Rust side, verified on the maintainer's Mac against the pinned stable
toolchain (1.98.1): `std::os::macos::fs::MetadataExt::st_flags()` compiles and
returns the `st_flags` word as a `u32`; the test is
`flags & 0x4000_0000 != 0`. Checked with a scratch crate outside the
repository — `symlink_metadata("/etc/hosts").st_flags()` returns `0x0` and the
test returns `false`, which is the expected answer for a local file.

### 4.2 Why the check comes before the open, not after

**Reading a dataless file triggers a download by the operating system.** The
materialization is transparent by design: the `open`/`read` blocks while the
file provider fetches the bytes, and on a large vault over a slow link an
indexing pass that opens everything would pull down the whole vault — slowly,
on someone's metered connection, as a side effect of "opening a folder".

That makes the order of operations part of the decision, not an implementation
detail: the walk reads `st_flags` from the `stat` it already performs for every
entry, and **does not open** an entry the flag marks as dataless. The same
`stat` is what distinguishes the three states ADR 0043 requires — present,
absent, placeholder.

### 4.3 The other providers, as publicly known

| Provider | Mechanism, as publicly known | State here |
|---|---|---|
| iCloud Drive (macOS) | `SF_DATALESS` in `st_flags`; older visible form `.Name.ext.icloud` | section 4.1, verified |
| OneDrive (Windows) | `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`, as ADR 0043 already records. Windows is a later platform anyway (ADR 0022, ADR 0029) | not verified |
| OneDrive (macOS) | a File Provider extension since the Files On-Demand rework; whether it produces `SF_DATALESS` like iCloud's provider is exactly the thing to test | not verified |
| Dropbox (macOS) | "online-only" files through the same File Provider mechanism on recent macOS; previously a kernel extension | not verified |
| Google Drive (macOS) | File Provider based since the Drive for desktop rework | not verified |

The pattern worth recording: on modern macOS these providers converge on the
same system File Provider, so a check that reads `st_flags` may well cover more
than iCloud Drive. "May well" is not a fact, and none of it was tested.

### 4.4 Recommendation of Fable 5.1 for decision 3

**Detect both iCloud forms, and only those, in feature 2:**

1. `st_flags & SF_DATALESS` on macOS, through
   `std::os::macos::fs::MetadataExt::st_flags()`, read from the walk's own
   `stat`, **before** anything is opened.
2. The `.Name.ext.icloud` name pattern, recognized before the hidden-entry rule
   of section 3.4.

In both cases the entry is reported as **"placeholder for `Name.ext`"**, with
the state **present, content unavailable** — never as absent, per invariant 10
and ADR 0043 decision 2. The index keeps the last known version, marked
unverified (ADR 0043 decision 2, already Accepted).

**Other providers: defer.** Record what is publicly known (section 4.3) and add
a provider when the platform arrives or a user needs it; each one becomes a
`verso-fs` fixture when it is added, with how it was observed.

The scope options the maintainer is choosing between:

| Scope | What it means |
|---|---|
| both iCloud forms (the recommendation) | flag + `.icloud` name, macOS only |
| the `.icloud` name only | portable, pure Rust, no platform module — and blind to every evicted file on macOS 10.15+, which is the common case today |
| the flag only | catches today's case and misses a vault that still carries `.icloud` siblings |
| both, plus a provider from section 4.3 now | needs an observation session on that provider first; nothing here supports it |

**Discarded alternatives considered:** treating an unreadable file as absent —
already discarded in ADR 0043, recorded there as the behaviour that caused the
loss in briefing §16.1.

## 5. Not for decision here: what feature 2 implements from decisions already taken

Listed so the maintainer sees the whole of feature 2 and can tell what this memo
adds to it. Nothing in this section is open.

### 5.1 Atomic write ([ADR 0029](../adr/0029-guardrails-in-ci.md))

The skeleton is temporary file + `fsync` + `rename`. The ADR adds, **with a
test for each item**:

1. `fsync` of the **directory** after the `rename`.
2. Preserve mode, owner and xattrs of the original file where the platform
   allows (Finder tags, quarantine); **record what cannot be preserved**.
3. Hard links and aliases: the rename swaps the inode — **decide whether it
   detects and warns**. This one is phrased as a decision inside ADR 0029 and
   is the atomic-write half of section 2.3; the maintainer may answer it here or
   in feature 2's PR.
4. Sync clients (iCloud Drive, Dropbox, OneDrive, Syncthing) see "deleted and
   created": test with a folder inside at least one of them before closing the
   feature.
5. Network filesystems where `rename` is not atomic: **detect and degrade with a
   warning, not silently**.
6. Windows (`MoveFileEx` with `REPLACE_EXISTING`, handles held open by antivirus
   or OneDrive): goes in when Windows goes in.

An observation, not a decision: **no Phase 1 deliverable writes a note.** The
phase ships `index`, `search`, `backlinks` and a read-only `verso mcp`. Feature
2 therefore builds and tests the atomic write with no product path exercising
it — which ADR 0029 requires anyway, since the guardrail is seen failing in the
PR that introduces it.

### 5.2 Invariant 11 ([ADR 0012](../adr/0012-files-are-source-of-truth.md))

Every write checks that the file on disk is the one that was read — mtime and
size, or hash — and does not write without showing the diff if it changed. It
holds for the UI, the agent and conversion. In feature 2 it is the precondition
of the write path built in 5.1.

### 5.3 Rule 4 of [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md) — handles

The filesystem API **of the contract** works with opaque handles; a path as a
string exists only at the entry edge (CLI argument, config key) and inside
`verso-fs`. What a handle identifies and how long it stays valid is `[OPEN]` in
ADR 0044, to be decided **before feature 6** and item 2.1 of Phase 2 — not here.

Two consequences for feature 2, both already recorded elsewhere: nothing in
Phase 1 crosses the contract (no UI; MCP is feature 6), so feature 2's API is
internal to the core; and **feature 2 may use an internal index into a path
table without prejudging the later decision**, because ADR 0026 already states
that while handle semantics stay open, rule 4 is a constraint on form — do not
expose a string — and not a security guarantee.

## 6. What this memo did not verify

- **No `verso-fs` code exists and none was written.** Nothing here was compiled
  into the repository; the only thing compiled was the scratch crate of section
  4.1, outside the repository.
- **No crate was chosen or evaluated** for the walk, the watcher, the temporary
  file or `openat`-style traversal (`walkdir`, `notify`, `tempfile`, `cap-std`,
  `rustix` and the like). That is a new-dependency decision for feature 2's PR,
  with its own justification and `cargo deny` check (ADR 0028, ADR 0029).
- **The dataless behaviour was not observed on a real evicted file.** Section
  4.1 verifies the constant in the SDK header and the Rust API; that an evicted
  iCloud file carries the flag, and that opening it materializes the file, are
  taken from Apple's public documentation and are not observed here. Both are
  testable by the maintainer with one file in an iCloud folder and `ls -lO`.
- **The `.icloud` property-list contents** were not examined; the recommendation
  uses only the name pattern.
- **OneDrive, Dropbox and Google Drive** were not observed on any platform
  (section 4.3 is publicly-known material, labelled as such).
- **Obsidian:** only the `.trash/` scenario of section 3.3 was observed. Not
  observed: `.obsidian/` itself, other hidden folders, Obsidian's own "excluded
  files" setting, and whether any of it changes with a different app version.
- **`inotify` limits were not measured** and no Linux vault was tested; the
  numbers in section 2.2 are the well-known kernel defaults, not a measurement
  here.
- **No fixture schema exists for `verso-fs`.** ADR 0043 and ADR 0044 both say
  the answers become `verso-fs` fixtures, but `scripts/check-fixtures.sh` and
  spec §4 define the schema for **dialect** fixtures only. What a `verso-fs`
  fixture looks like — a folder layout plus an expected walk result — is not
  written anywhere, and this memo does not invent it.
- **A date discrepancy, recorded rather than resolved:** the two verification
  reports used in sections 3.3 and 4.1 are dated 2026-09-22 by the session that
  produced them, while this session's clock reads 2026-09-21. The memo header
  carries the session date. The checks themselves are unaffected.

## 7. How the maintainer decides and verifies, without reading code

**Check that the memo is what the PR says it is:**

```
git fetch origin && git checkout phase1/fs-decision
git diff --stat origin/main..HEAD          # two files, both under docs/, no crates/, no fixtures/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # unchanged fixtures still pass the lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # author and Signed-off-by are yours
```

**Optionally, repeat the two observations** — section 4.1 with
`ls -lO <file>` on a file in an iCloud folder (the flag appears as `dataless`),
and section 3.3 with the Obsidian CLI commands as written there.

**Decide, in three lines on the PR, plus one answer:**

1. **Symlinks:** `(a)` never follow, `(b)` follow if the target stays inside the
   root, or `(c)` follow all — **and the maximum depth** (Fable 5.1 recommends
   `(a)` with depth `64`, error on the cap, never silence).
2. **Ignored paths:** the rule for the list — Fable 5.1 recommends *hidden
   entries not walked at any depth, plus a configurable list of relative paths
   in the config outside the tree, empty by default, no `.gitignore` in Phase 1*
   — **and the rule for an ignored note as a link target**: Fable 5.1
   recommends *unresolved target, not a backlink source*.
3. **Placeholder detection:** the scope — Fable 5.1 recommends *both iCloud
   forms (`SF_DATALESS` and the `.icloud` name), other providers deferred*.

**And one question to answer, not a choice between options:**

4. **Is the watcher part of feature 2?** ADR 0028 lists it in `verso-fs`'s
   description; the roadmap's feature 2 deliverable does not. Fable 5.1's
   reading is **later** — feature 2 is walk plus confinement plus atomic write.
   Whichever the answer, the document that disagrees is corrected in the PR that
   closes this memo.

**What the closing PR records, if the recommendations are accepted:**

| Where | What it gains |
|---|---|
| [ADR 0044](../adr/0044-verso-fs-semantics.md) | the symlink, loop, depth, hard-link and alias answers; the ignored-paths rule and the link-target rule; status changes from `[OPEN]` to Accepted for those two groups, and stays `[OPEN]` for handles |
| [ADR 0043](../adr/0043-placeholder-guard.md) | the per-provider mechanism for iCloud Drive; the `[OPEN]` on the mechanism closes for that provider and stays open for the others |
| [`docs/spec/dialect.md`](../spec/dialect.md) §9 | Q26 closed, with a line in section 10's history table |
| [roadmap](../roadmap.md), Phase 1 | the two decision rows struck through, as Q18 and ADR 0037 were |
| `fixtures/` | nothing yet: `verso-fs` fixtures need a schema first (section 6) |

**What stays open**, listed so that deciding these three does not look like
deciding more: what a handle identifies and for how long (ADR 0044, before
feature 6); the `verso-fs` fixture schema; whether the atomic write detects and
warns on hard links (ADR 0029, section 5.1 item 3); the multi-root workspace
(ADR 0041, `PROPOSED`), which is where the attachments-folder case goes; and
every dialect question feature 2 does not touch.
