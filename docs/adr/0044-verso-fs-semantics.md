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
  three items marked **provisional**, for the maintainer to confirm or change;
  two more provisional items from the second reading of that code — an absolute
  root, and a handle for a placeholder name. 2026-09-24 — the watcher built,
  provisionally, on the memo
  [`docs/reference/watcher-decision.md`](../reference/watcher-decision.md),
  which lists what the maintainer decides; this ADR's groups are untouched.
  2026-09-24 — **decided by the maintainer**, in session: the watcher, on its
  memo, every recommendation accepted; and the opaque handles group, on the
  memo [`docs/reference/handles-decision.md`](../reference/handles-decision.md),
  decided as built for Phase 2 and re-opened before anything outside the
  app's own views gets access to files. Both recorded in the Decision; the
  lines that called the group open are kept, each with a note.
  2026-09-29 — an `[OPEN]` contradiction recorded in the ignored-paths group:
  commit `b145309` implemented a built-in list of ignored directories and the
  reading of `.gitignore`, both of which this ADR discarded. Nothing decided;
  the status is unchanged. 2026-09-29 — **that contradiction decided by the
  maintainer** the same day, in session: both behaviours accepted, done
  properly and behind settings — git's own `.gitignore` semantics through the
  `ignore` crate, the built-in list and the `.gitignore` each behind a switch,
  on by default. Recorded as a section of its own after the ignored-paths
  group; the lines of 2026-09-22 it revises are kept, each with a note.
  2026-10-09 — **the handles group answered for `verso serve`, and the
  symlinks on a server, decided by the maintainer** with the acceptance of
  [0073](0073-self-hosted-server-first.md) that day: a note stays named by
  its relative path and the access capability is the session and its role
  in the folder; a symlink that leaves the folder is refused on a server.
  Recorded as a section of its own, "On a server", after the handles
  group; the desktop's local folder is unchanged, and the lines this
  revises are kept, each with a note.
  2026-10-12 — one behaviour of "On a server" changed by commit f3b3e7d,
  the fix of a race, and recorded in that section — **confirmed by the
  maintainer** the same night, "Ok": a dangling symlink whose target is
  inside the folder is treated as a new file inside, no longer refused as
  a link that leaves. Decided by that confirmation (Status).
  2026-10-12 — the provisional records of 2026-09-22 ratified by the
  maintainer as built and tested, answering the ADR audit in session:
  *"Ajuste tudo que precisar. Está aprovado os ADRs"* (adjust whatever
  needs it; the ADRs are approved); a dated note beside each.
  2026-10-22 — T.12, option B (the maintainer answered the decisions list of
  the afternoon of 2026-10-21 (`verso-decisoes-pendentes-2026-10-21-tarde.md`)
  on 2026-10-22): importing a large file (a 200 MB PDF) is to be read and
  written **in chunks now**, not held whole in memory before the atomic write;
  the maintainer chose "Fazer aos pedaços já" (do it in chunks now) over
  accepting it for the time being. It changes `verso-fs`'s atomic write;
  **being built**. The write stays atomic under invariant 9 and [ADR
  0029](0029-guardrails-in-ci.md). See `docs/review/accessibility.md`
  (A11Y.10).

## Context

The path confinement guardrail ([0029](0029-guardrails-in-ci.md)) and the
opaque handles rule ([0026](0026-core-ui-contract-inviolable-rules.md)) exist as
a principle, but no document says what happens in the cases that decide whether
they work. The Phase 0 review raised three groups of questions that need an
answer before `verso-fs` exists.

## Decision

The three groups are decided: symlinks and ignored paths on 2026-09-22, the
opaque handles on 2026-09-24, as built for Phase 2 and with the moment to
re-open them; ignored paths were revised on 2026-09-29. The watcher, which came after feature 2, was decided on
2026-09-24 as well. The handles and the symlinks were decided for a server
on 2026-10-09 ("On a server", below).

### Symlinks and loops — decided on 2026-09-22

Decided by the maintainer on 2026-09-22, on the memo
[`docs/reference/fs-decision.md`](../reference/fs-decision.md), section 2:

- **Every symlink is followed** — option (c) of the memo. A symlink inside the
  folder that points outside is traversed, and what it reaches is read like any
  other entry: no test of whether the target stays inside the root, no refusal.
  A symlink inside the folder is the user's, and following it is the point.
  *(On a server with members, since 2026-10-09: a symlink is followed only
  when its target stays inside the folder — "On a server", below. The
  desktop's local folder keeps this rule.)*
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
*(Ratified by the maintainer on 2026-10-12, as built and tested:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*
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
- **The root is made absolute when the folder is opened, and not
  canonicalized.** A relative root plus a later change of the process's working
  directory would otherwise retarget every handle derived from it: the same
  folder name, a different folder, with no error anywhere. Making it absolute at
  open closes that. Not canonicalizing it is the other half: a root that is
  itself a symlink keeps the name the user typed, which is the name they see in
  every message. Provisional because canonicalizing once at open is a
  defensible alternative — it would also fix what `wrote_through_symlink_to`
  reports, which today names the path as it was given rather than the one the
  bytes landed on.

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
  blocklist. *(Revised on 2026-09-29: the list stays, empty by default, and a
  built-in list of build directories — `node_modules/` among them — is
  skipped beside it unless a setting turns it off; see "Ignored paths,
  revised" below.)*
- **`.gitignore` is not read in Phase 1.** Its grammar is a project of its own,
  and its failure mode is notes quietly disappearing. *(Revised on
  2026-09-29: each directory's `.gitignore` is honored, with git's semantics,
  unless a setting turns it off; see "Ignored paths, revised" below.)*
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
*(Ratified by the maintainer on 2026-10-12, as built and tested:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

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
- **A handle is accepted when the final component has the placeholder form.**
  `.Nota.md.icloud` passes, with the same precedence the walk applies — the
  placeholder pattern is recognized before the hidden rule
  ([0043](0043-placeholder-guard.md)) — so an entry the walk listed can be named
  again after a restart. A handle refused for something the walk had just shown
  is the surprise this avoids. Every other dot-leading component stays refused,
  as above.

**The code contradicted this group (recorded on 2026-09-29, then `[OPEN]`; decided the same day, below).**
Commit `b145309` ("ignore build dirs") implemented, in
`crates/verso-fs/src/walk.rs`, both things this ADR's Discarded alternatives
set aside:

- **A built-in list of ignored directory names**, `is_default_ignored_dir`:
  `node_modules`, `target`, `vendor`, `dist`, `build`, `out`, `env`, `venv`,
  `.venv`, `coverage`, `test-results`, `__pycache__` and eleven more, most of
  them already hidden by their leading dot. A
  directory with one of those names is skipped at any depth, with no setting
  to turn it off — against "a configurable list of relative paths, empty by
  default".
- **The reading of `.gitignore`**, `GitIgnorePattern`: every `.gitignore` in
  the folder is read, and its lines are matched by a small grammar of its
  own. A line starting with `!` is skipped, so a re-inclusion (`!README.md`
  after `*.md`) does not re-include: what it names stays hidden. There is
  no opt-out either — against "`.gitignore` is not read in Phase 1".

The watcher (`crates/verso-fs/src/watch.rs`) drops events under the built-in
names but does not read the `.gitignore` patterns, so the two paths into the
index no longer agree on what is ignored.

The risk is the one this ADR foresaw when it discarded both: notes vanish
quietly. A vault folder named `build/`, `out/` or `env/`, or a broad line in
a `.gitignore` — a `*.md`, which this group's discarded alternative names —
takes its notes out of the index, the search, the backlinks and the rewrite
of links on a rename, with nothing on screen to say why. Under the single
rule of this group, an ignored note is also an unresolved target and never a
backlink source.

What is open, for the maintainer: **either** revise this ADR to accept the
behaviour — then the `!` gap and the watcher's asymmetry become fixes to make,
and an opt-out is worth deciding with them — **or** have the code reverted to
the design decided above, a confined ignore list in the configuration
directory, empty by default. Until then the code and this ADR disagree, and
this ADR is what was decided. *(Decided on 2026-09-29, the first way: the
next section.)*

### Ignored paths, revised — decided on 2026-09-29

**Decided on 2026-09-29 by the maintainer**, in session, answering the
`[OPEN]` above: *"refaça a logica desse gitignore pra ficar mais aderente e
escalável"* (redo the logic of this gitignore so it is more faithful and
scales) and *"coloque em settings essa opção"* (put this option in the
settings). Ignoring build directories and honoring `.gitignore` are
accepted, done properly and behind settings. This revises two lines of the
group of 2026-09-22 — the configurable list alone, and no `.gitignore` —
and nothing else in it: hidden entries are still not walked, the placeholder
pattern still outranks the hidden rule, the configurable list stays confined
and empty by default, and an ignored note is still an unresolved target and
never a backlink source, whichever rule left it out.

How the author built it under that decision (`crates/verso-fs`), replacing
the partial matcher of commit `b145309`:

- **Git's own semantics, through ripgrep's engine.** The walk reads each
  directory's `.gitignore` with the `ignore` crate's gitignore module — the
  engine of ripgrep; only that module, not the crate's own walker, which
  stays `verso-fs`'s. It follows git: `!` re-includes (`!keep.md` after
  `*.md`), `**` reaches any depth, a leading `/` anchors a pattern to its
  file's directory (`/dist`), a trailing `/` matches directories only
  (`logs/`), and a deeper `.gitignore` overrides the outer one — the
  innermost file with an opinion on an entry decides. **A directory ignored
  is pruned whole**, so a `!` inside one never applies: git's own
  limitation, kept on purpose rather than improved on, so that the folder
  looks the same to Verso and to git.
- **The built-in list** (`is_default_ignored_dir`, in
  `crates/verso-fs/src/walk.rs`): 23 directory names — `node_modules`,
  `target`, `vendor`, `dist`, `build`, `out`, `env`, `venv`, `coverage`,
  `__pycache__` and the like — skipped at any depth. It matches directories
  only; a file with one of those names is walked.
- **Both behind a switch.** `WalkRules { builtin_ignores, gitignore }`
  (`crates/verso-fs/src/lib.rs`), both on by default. The window's settings
  — "Ignore build folders" and "Respect .gitignore" — set them through the
  `set_walk_rules` command; turning either off and reindexing brings the
  entries it had left out back into the index.
- **Tests**, in `crates/verso-fs/tests/walk.rs`:
  `gitignore_semantics_are_gits_own` (negation, anchoring, dir-only, `**`,
  a deeper file overriding the outer one) and
  `walk_rules_turn_both_ignore_kinds_off`.
- **A new dependency, `ignore`**, justified in `crates/verso-fs/Cargo.toml`.
  Its license is dual, Unlicense or MIT; it passes `cargo-deny`'s allowlist
  through MIT ([0029](0029-guardrails-in-ci.md)).

**A known limit, accepted.** The watcher (`crates/verso-fs/src/watch.rs`)
drops events under the built-in names when that switch is on, but it does
not apply the `.gitignore` patterns: an event carries a path without the
chain of `.gitignore` files above it that the matchers need. An event under
a gitignored path therefore passes, and the walk that answers it still
leaves the path out — the index comes out right, at the cost of a reindex
that changes nothing.

What the risk recorded in the `[OPEN]` above becomes: a note left out by a
`.gitignore` line or a built-in name is out of the index, the search, the
backlinks and the rewrite of links on a rename, as before; the settings are
now the way to bring it back, and git's own `!` works as a git user
expects.

### The watcher — after feature 2; decided on 2026-09-24

Decided by the maintainer on 2026-09-22, answering the contradiction the memo
recorded in section 2.2: feature 2 is **walk, path confinement and atomic
write**, as the roadmap's row says. The description of `verso-fs` in
[0028](0028-crate-structure.md) — "opaque handles, watcher, atomic write,
confinement" — stays as it is, read as the crate's eventual shape: the watcher
arrives after feature 2, and no date is set for it here.

**The watcher, decided on 2026-09-24 by the maintainer**, in session, on the
memo [`docs/reference/watcher-decision.md`](../reference/watcher-decision.md),
section 6: every recommendation accepted, the code that was built under them
no longer provisional. The author's recommendations of the day were put as
one list, and the answer was *"Tirando o plano de fazer vários PR, eu gosto
das suas recomendações"* ("apart from the plan of several pull requests, I
like your recommendations"):

- **`notify`** watches the root (FSEvents on macOS, inotify on Linux), and
  only what the walk lists is reported.
- **Each batch indexes the whole folder, for now** — the one path that knows
  placeholders, walk problems and removals. Refreshing only the batch's paths
  is the step for folders beyond a few thousand notes, measured with the
  benchmark when one is in use.
- **A batch goes out after 300 ms of quiet, or 2 s after its first change**
  when changes do not stop.
- **An open note changed outside, with nothing typed in it, takes the disk's
  text in as one edit**, so the cursor and the undo history stay; **with text
  not saved yet, it is saved at once**, which meets the difference and shows
  the conflict banner — the check of [0012](0012-files-are-source-of-truth.md)
  — so nothing is written over the other app's change; **a note deleted or
  moved outside keeps its tab, marked**, and nothing recreates it.
- **Files that are not notes, open in a tab, are not read again**, for now.

What the memo records beside these stands with them: a folder the system will
not watch opens anyway, with the reason on the status line, and the periodic
scan recorded above for the `inotify` limit is built when Linux becomes a
target (the memo's section 3.8).

### Opaque handles — decided on 2026-09-24, as built for Phase 2

**Decided on 2026-09-24 by the maintainer**, in session, on the memo
[`docs/reference/handles-decision.md`](../reference/handles-decision.md),
option (a), in the same answer as the watcher's:

- **A note is named by its path relative to the open folder** — in the
  contract, over MCP and in the command line — as rule 4 of
  [0026](0026-core-ui-contract-inviolable-rules.md), amended on 2026-09-22,
  says. Over MCP this is the decision [0045](0045-server-and-mcp-security.md)
  took on 2026-09-22, which is the text that stands.
- **No capability crosses the contract.** What lets the window read and write
  is being one of the app's own views, which the host's capabilities check;
  the `revision` a write carries is the stamp of what was read, not a
  capability.
- **Inside `verso-fs`, a `Handle` is an index into the root's table of
  relative paths**, valid for that `Root` and in this process only: it does
  not survive a restart, and after a rename it still names the old path. The
  window between checking a path and using it stays open; with every symlink
  followed, `openat`-style traversal would confine nothing more for the
  user's own folder.
- **Re-opened before anything outside the app's own views gets access to
  files** — a plugin ([0016](0016-plugins-execution-and-capabilities.md)), a
  mobile client ([0025](0025-own-server-and-mobile-pwa.md)), `verso serve`.
  That is when a capability has to cross: an iOS security-scoped bookmark, an
  Android SAF URI.
  *(For `verso serve`, answered on 2026-10-09 — "On a server", below. A
  plugin and a native mobile client still re-open the group.)*

The questions as they were first recorded, before feature 6 of Phase 1 and
item 2.1 of Phase 2:

- What a handle identifies: an open descriptor (`openat`, immune to a path swap
  between checking and using) or an index into a table of paths (checking is
  still by string, and the TOCTOU window stays open).
- Stability: does the handle survive an app restart? A file rename? A change of
  workspace root ([0041](0041-multi-root-workspace.md))?
- What the agent receives over MCP as a note identifier, and whether that
  identifier is the same handle as in the contract.
- If the stable identifier ends up being the path relative to the root, rule 4
  has to say so, instead of pretending it is not.

### On a server — decided on 2026-10-09

**Decided on 2026-10-09 by the maintainer**, with the acceptance of
[0073](0073-self-hosted-server-first.md) (its items 3 and 6), in the answer
to the plan of that night: *"… vc segue o recomendado"*. The handles group
was re-opened for the day `verso serve` reaches files; this is its answer
for the server, option (a) of that plan:

- **A note stays named by its path relative to the folder.** On a server
  the access capability is **the session and its role in the folder**
  ([0074](0074-accounts-and-access-on-the-server.md) item 6), checked on
  every command and every file request before `verso-fs` acts.
  Attachments are served at `/f/<folder-id>/<relative path>` behind that
  check ([0075](0075-server-packaging-and-storage.md) item 3, the
  folder's id). **No per-file capability crosses.** Rule 4 of
  [0026](0026-core-ui-contract-inviolable-rules.md) is unchanged, with a
  dated clarification there.
- **The pre-signed URL** of a bucket ([0073](0073-self-hosted-server-first.md)
  item 4), with the bucket mode: **after V1** (the maintainer, 2026-11-14,
  *"fica pra depois mesmo, tem que tá no roadmap"*; roadmap After V1 item
  10), not built. Decided into V1 on 2026-11-01 (below) before that.
  *(2026-10-31: whether it
  waits for after V1 is to be discussed with the maintainer on 2026-11-02.
  Decided 2026-11-01, item 16 = b: **into V1**, after the terminal and the
  music are polished; not built. *"12. A 13. B 14. B - Mas vamos fazer depois, quero terminal e música redondinho primeiro 15. B - (idem) 16. B - (idem)"* (12 a; 13 b; 14 b, but later, he wants the terminal and the music polished first; 15 b, likewise; 16 b, likewise).)*
- **Symlinks on a server**: a symlink is followed only when its target
  stays inside the folder; one that leaves the folder is refused. This is
  option (b) of the symlinks memo, discarded for one person's folder
  (Discarded alternatives) and taken for a server with members, with the
  costs named there. The desktop's local folder is unchanged: every
  symlink is followed, as decided on 2026-09-22.

*Changed on 2026-10-12 by commit f3b3e7d; **confirmed by the
maintainer** the same night, answering "Ok" at 01:15 BRT.* It came from a race.
The server's check canonicalized a path and, when that failed while an
entry stood at the name, refused the entry as a link that leaves; a file
being replaced at that instant — missing for a moment, or not resolvable
while a rename lands (another program's save, a network file system, a
file pending deletion on Windows) — was refused so, logged as "a link
that leads out of the folder", and the server kept its old state of the
file until its next walk. The fix makes the check component by
component, reading each entry itself: only a symlink can move a path out
of the folder; a plain entry, or a final file that is not there, is
judged by its folder; a link whose end is missing is judged by where its
text points, the hops bounded as the kernel bounds a loop; a `..` that
cannot be resolved is refused. A link that leaves is refused as before,
whether or not its end exists. The one behaviour that changed with it:
**a dangling symlink whose target is inside the folder is no longer
refused as a link that leaves; it is treated as a new file inside.** The
desktop's local folder is untouched: every symlink is followed there.

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
  not expose a string), not a security guarantee. *(Decided on 2026-09-24, as
  built for Phase 2: the Decision above. Rule 4 had been amended on
  2026-09-22 — access crosses as a handle, identity as the relative path — and
  no capability crosses today, so confinement of every path a client sends is
  what carries its weight.)*
- The resource limits (depth, file size, line length) complement Q17 of the
  dialect spec: fuzzing catches crashes, not slowness.

**The MCP half of the handles group as the feature 6 code implements it.
Recorded on 2026-09-22 from the feature 6 code — provisional, the maintainer
decides**, under §4 of `docs/reference/mcp-decision.md`. The group stays
`[OPEN]`; this is what the code does, not a decision. *(Decided on 2026-09-24
as written here, with the group: the Decision above.)*

- **What the agent receives as a note identifier is the path relative to the
  root, as a string, with `.md`** — the same string `list_notes`, `search` and
  the CLI print, and the only one from which a citation leads anywhere without
  the server. A path without `.md` is still accepted, as `backlinks` already
  accepted it.
- **The opaque `Handle` never leaves the process.** It is what `verso-core` uses
  to reach `verso-fs`; it appears in no tool argument and in no tool result, and
  nothing serializes it.
- **Confinement is applied by `verso-core` to every path a client sends**,
  before the index or the disk is touched: `Root::handle` refuses an absolute
  path, a `..` component, an empty path, a NUL byte, a hidden component at any
  depth and an ignored path. It is applied **including on the calls that only
  read the index** (`links`, `backlinks`), where a bad path would escape
  nothing — which is what makes the refusal list a property of the surface
  rather than of each tool's implementation.
- **The other half of the group is untouched**: what a handle identifies inside
  the process (open descriptor or table index) and how long it stays valid is
  still `[OPEN]`, for item 2.1 of Phase 2. *(Decided on 2026-09-24: a table
  index, valid in this process only — the Decision above.)*

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
  *(Taken up on 2026-09-29 for build directories, behind a setting: "Ignored
  paths, revised".)*
- **Ignored paths: reading `.gitignore`** — the full grammar is a project of its
  own, and a `*.md` line in a repository's `.gitignore` would empty the vault.
  *(Taken up on 2026-09-29, through an existing engine of the full grammar and
  behind a setting: "Ignored paths, revised".)*
- **An ignored note fully indexed, or a target that resolves** — "ignored" would
  then mean "walked but not counted", and exit criterion 2 would depend on the
  maintainer remembering what is in `.trash/`.

Considered by the maintainer on 2026-09-24, on the watcher's memo, and set
aside:

- **A walk on a timer** instead of the operating system's events — one walk
  per period whether anything changed or not; it stays the fallback for a
  folder the system will not watch.
- **Each operating system's API directly** — one more backend per platform,
  for the latency `notify` already has.
- **An open note marked and read on demand**, **a tab with unsaved text left
  for the autosave**, **a gone note's tab closed** or **a move followed** —
  a stale view, a conflict found later, text taken off the screen, or a guess
  pairing a removal with a creation.

And on the handles memo:

- **Capability handles designed now** — a handle type in the contract, a
  lifetime rule, a table in the host — a design with no consumer to test it
  against, before a plugin, a mobile client or a server exists.

Considered by the maintainer on 2026-09-29, on the `[OPEN]` of the
ignored-paths group, and set aside:

- **Reverting the code to the design of 2026-09-22** — one of the two ways
  the `[OPEN]` put; the maintainer took the other.
- **Keeping the matcher of commit `b145309` and fixing its `!`** — set aside
  by *"refaça a logica"*: a grammar of our own was the project this ADR had
  warned about, and an existing engine of git's semantics replaced it.

## Status

Symlinks, loops and ignored paths: decided on 2026-09-22 by the maintainer,
Accepted; ignored paths revised on 2026-09-29 by the maintainer — the
built-in list and `.gitignore`, behind settings — Accepted. Opaque handles:
decided on 2026-09-24 by the maintainer, as built for Phase 2, Accepted;
re-opened before anything outside the app's own views gets access to files;
answered for `verso serve` on 2026-10-09 ("On a server"), Accepted. Symlinks
on a server: decided on 2026-10-09 by the maintainer, Accepted. The watcher: built after feature 2 and decided on
2026-09-24 by the maintainer, Accepted. The items marked **provisional** inside
the two groups decided on 2026-09-22 are not decided: they are what the
feature 2 code does, recorded so that nothing is settled by silence, and they
wait for the maintainer. *(Ratified by the maintainer on 2026-10-12, as
built and tested; Accepted.)* A dangling symlink whose target is inside the
folder, on a server, treated as a new file inside since f3b3e7d
(2026-10-12, "On a server"): confirmed by the maintainer on 2026-10-12,
Accepted.
