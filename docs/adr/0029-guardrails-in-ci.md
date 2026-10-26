# ADR 0029 — Guardrails in CI before the first line of product logic

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §14.3, §10.3
- Status in the briefing: `DECIDED`
- Revisions:
  - 2026-09-21: Guardrails split into workspace (Phase 0) and feature groups; checks for WASM, generated bindings and `std::fs` added.
  - 2026-09-22: Path confinement and atomic write requirements finalized; Linux PR job layout decided for CI cost efficiency.
  - 2026-09-23: npm license check and generated types check added.
  - 2026-09-29: `std::fs` exceptions declared (`src/log.rs`, `sidecar.rs`, `src/update.rs`).
  - 2026-10-01: Canvas fuzz target and demo vault check added as guardrails.
  - 2026-10-07: Source file size limit of 1500 lines added as workspace guardrail ([0067](0067-source-files-stay-small.md)).
  - 2026-10-08: Windows port CI and SSH test script added ([0069](0069-windows-port.md)).
  - 2026-10-13: Security feature guardrails added ([0083](0083-security-hardening-of-universo.md): npm audit, server fuzz targets, sanitization suite); benchmark noise tolerance set to 1.5×.
  - 2026-10-15: Single exception to `unsafe_code = "forbid"` added for native webview clipping in `web_clip/` ([0056](0056-embedded-web-pages.md), `scripts/check-unsafe.mjs`).
  - 2026-10-24: Docs mirror check scoped to public documents (`README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`) ([0008](0008-documentation-language.md)).

## Context

The maintainer is a Rust beginner and the AI writes the code. Line-by-line
human review is not the realistic defense in that arrangement; what scales is
mechanical verification. That is why the guardrails come in before product
logic exists, and not after.

"Before" has two senses, and the Phase 0 review showed that mixing them makes
Phase 0 impossible to close: some guardrails are workspace configuration and
exist with empty crates; others are tests of a feature and can only exist with
it. The two groups are separated below.

## Decision

### Workspace guardrails — in CI in Phase 0, with empty crates

| Guardrail | Prevents |
|---|---|
| `cargo fmt --check` | a formatting diff hiding a logic diff |
| `unsafe_code = "forbid"` via `[workspace.lints]`; one exception, held to two files by `scripts/check-unsafe.mjs` (revision of 2026-10-15, below) | memory corruption |
| clippy with `-D warnings`; `unwrap_used` and `expect_used` denied, allowed only in tests | a panic taking the app down |
| clippy `disallowed_methods` denying `std::fs` outside `verso-fs` (declared exceptions: index file in `verso-index`, config in `verso-core`) | access to the open folder outside `verso-fs` ([0026](0026-core-ui-contract-inviolable-rules.md), rule 5) |
| `cargo-deny`: license allowlist compatible with the chosen license; advisories denied | incompatible or vulnerable dependency |
| Documentation mirror & link check (`scripts/check-docs-mirror.sh`): public community docs (`README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`) have a twin in `docs/pt-BR/` with identical heading structure, no orphaned internal docs remain in `docs/pt-BR/`, and all markdown links resolve | a public document changed in one language only or broken links ([0008](0008-documentation-language.md)) |
| Source files under 1500 lines, but by a recorded exception that only shrinks (`scripts/check-sizes.mjs`) | a file too big to read whole, review or explain ([0067](0067-source-files-stay-small.md)) |

### Feature guardrails — they go in the same PR as the feature they protect, never later

| Guardrail | Prevents | Goes in with |
|---|---|---|
| Fuzzing the parser with `cargo-fuzz`, and the canvas reader of `verso-core` beside it (target `canvas`) | a malformed file freezing the app | Phase 1, feature 1; the canvas reader with the board, 2026-10-01 |
| Round-trip property test (definition in `docs/spec/dialect.md`, Q18) | opening rewriting the file | Phase 1, feature 1 |
| `cargo check --target wasm32-unknown-unknown -p verso-dialect` | the parser ceasing to compile to WASM and losing the conformance suite with the editor | Phase 1, feature 1 |
| Atomic write (see requirements below) | corruption on power loss | Phase 1, feature 2 |
| Path confinement in the adapter | a plugin or agent reaching outside the folder with an absolute path, a `..` component or a NUL byte; a symlink inside the folder is the user's, is followed, and what it reaches counts as inside the folder ([0044](0044-verso-fs-semantics.md)) | Phase 1, feature 2 |
| Parameterized queries + escaping of the FTS5 syntax | search breaking with quotes and operators | Phase 1, feature 3 |
| Benchmark with a synthetic vault | performance regression | Phase 1, feature 5 |
| Check that the generated TS types are up to date | rule 3 of the contract turning into a convention ([0038](0038-ts-type-generation.md)) | Phase 2, item 2.1 |
| npm license allowlist over the window's lockfile (`scripts/check-npm-licenses.mjs`): `deny.toml`'s list plus OFL-1.1 (the fonts), Unlicense and EPL-2.0 (Mermaid's tree, 2026-09-29) and 0BSD (Excalidraw's tree, 2026-10-01); a package with no license field taken by hand only where the script names it and why | a package the window bundles under a license the project cannot ship | Phase 2, at the maintainer's request of 2026-09-23 |
| The window's unit tests (`npm test` in `app/ui`): the board's model, the PDF spec, Mermaid | the board's model changing what it writes, or a helper of the window breaking, unnoticed | the board, 2026-10-01 |
| The demo vault built from its sources and holding together (`node scripts/demo-vault.mjs check`, [0058](0058-demo-vault-as-tutorial.md)) | a stale embedded copy, a board edited by hand, a tutorial whose links or steps no longer hold | the tutorial, 2026-10-01 |

CI on macOS and Linux: `cargo fmt --check`, `cargo clippy`, `cargo test`,
`cargo deny check`, plus the commands of the feature guardrails as they come in.

A pull request runs the guardrails on Linux only; macOS runs on `main`, after
each merge. Both operating systems are therefore checked where the code lands.
The reason is cost: a macOS minute is billed at ten times a Linux one, and one
day of pushes to stacked branches spent the private repository's whole monthly
quota, after which GitHub stopped starting jobs. Maintainer's decision of
2026-09-22.

**Where each runs, since the maintainer's decision of 2026-09-23** (asked
"faço o enxugamento?", the answer: *"claro!! atualize ADR que fizer
sentido"*). The same reason, carried further: every job is a runner that
starts, installs a toolchain and bills its minutes rounded up, and on 21 and
22 September macOS legs of every job — `cargo deny` and the WASM check
included, which answer the same on any OS — were most of the 132 macOS minutes
the billing page showed for the cycle, in a quota that counts each as ten.

- **A pull request** runs every guardrail but the fuzzing in **one Linux
  job**, cheapest first, over one cache: the documents' mirror, the fixtures,
  the npm licenses, the demo vault's check, the `std::fs` grep, the `unsafe`
  guard, `cargo fmt
  --check`, `cargo deny check`, clippy, the tests, the generated types, the
  UI's type check, bundle and unit tests, the WASM check. The window's
  end-to-end tests run on the author's machine only
  ([0058](0058-demo-vault-as-tutorial.md), point 13).
- **`main`**, after each merge, runs that job again, and three more: **clippy
  and the tests on macOS** — the checks whose answer can depend on the
  platform (the file system, extended attributes, WebKit); fmt, `cargo deny`
  (whose graph covers every target), the WASM check and the documents' checks
  answer the same on any OS —, the **60-second fuzzing**, on Linux, and the
  benchmark.
- **The apps are built and packaged only for a version** — the merge that
  brings a new one into `main` (ADR 0051, revised 2026-10-02), or a version
  tag pushed by hand — in a workflow of its own; branches test, they never
  package. That workflow,
  `.github/workflows/release.yml`, came with the development flow of
  [0051](0051-development-flow-and-releases.md) on 2026-09-24, macOS first;
  its bundle was built and checked on the Mac before it was written. Windows, then Linux, join the platform checks
  on `main` as each port lands ([0022](0022-target-platforms-macos-first.md)).
- The Linux runners are pinned to `ubuntu-24.04`: the `ubuntu-latest` label
  moves to Ubuntu 26 from 2026-10-19, which would change the WebKitGTK the
  shell links against, and the machine of the bench's `ci-linux` baseline,
  with no commit to blame.

**Locally, before a push — the maintainer's request of 2026-09-24.** The
first CI run after the quota came back failed on Linux-only dead code that no
check on the Mac could see (`db2cce1`), and the maintainer asked why it had
not been tested locally, with Docker installed, and for the way to be in the
README. Two scripts run the guardrails before a push; CI confirms, it is not
where a failure is first seen:

- `scripts/check.sh` — every guardrail of the Linux job, natively and in the
  same order; on a Mac, the macOS check.
- `scripts/check-linux.sh` — fmt, clippy, the tests and the generated
  bindings in a Linux container, as an ordinary user, over a copy of the
  sources and named volumes. Its first real run found the UI bundle missing
  before the shell compiled, which CI would have hit next (`22d1aa1`).
- `scripts/check-windows.sh` — clippy and the tests on a Windows machine
  reached over SSH as `verso-win`, over a byte-for-byte copy of the working
  tree ([0069](0069-windows-port.md), revision of 2026-10-08). Its first run
  found the workspace not compiling on Windows: `xattr` was a dependency of
  `verso-fs` on every OS, and `verso-fs` stops the build on purpose where
  only the Unix half of its directory identity exists.
- `scripts/check-linux-vm.sh` — clippy and the tests on Linux x86_64, on a
  machine reached over SSH as `verso-ubuntu`, over a byte-for-byte copy of
  the working tree; with `--bundle` the `.deb`, `.rpm` and AppImage, with
  `--install` the `.deb` installed and the app opened in the machine's
  desktop ([0071](0071-linux-port.md), item 5, since 2026-10-09). Required
  only when it makes sense or for a package (the maintainer, 2026-10-09).

macOS cannot run in a container and Windows cannot run in Docker on a Mac or
on Linux: the Mac itself is the macOS check, and Windows is checked on a real
Windows machine before a push and, from the port's atomic write on, in CI. The scripts follow the
workflow by hand; a change to one is a change to the others.

### Atomic write requirements

"Temporary file + `fsync` + `rename`" is the skeleton. So as not to lose data
precisely in the guardrail against data loss, feature 2 of Phase 1 has to
handle, with a test for each item:

- `fsync` of the **directory** after the `rename`; without it the rename may
  not survive a power loss.
- Preserve mode, owner and xattrs of the original file when the platform
  allows it (Finder tags, quarantine); record what cannot be preserved.
- Hard links and aliases: the rename swaps the inode. Decide whether it detects
  and warns.
- Sync clients (iCloud Drive, Dropbox, OneDrive, Syncthing) see
  "deleted and created". Test with a folder inside at least one of them before
  closing the feature.
  *(Since 2026-10-12 a manual check of the maintainer, gating nothing:
  below.)*
- Network file systems where rename is not atomic: detect and degrade with a
  warning, not silently.
- Windows: replacing an existing file requires `MoveFileEx` with
  `REPLACE_EXISTING`; a handle held open by antivirus or OneDrive makes the
  rename fail. Goes in when Windows goes in.

**How the feature 2 code answers the list above, recorded on 2026-09-22 and
provisional: the maintainer decides on waking.** Each item is what the code
does, not a decision; the requirements above are unchanged.
*(Ratified by the maintainer on 2026-10-12, as built and tested:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

- **Hard links: it detects and warns.** The write reports
  `WriteReport::hard_link_shared` when the file it replaced carried more than
  one name, so the user learns that the other name kept the old content. The
  requirement above still says "decide whether it detects and warns", and that
  decision stays the maintainer's — the code chose the louder of the two.
- **The owner is not changed.** The temporary file belongs to whoever is
  writing, and `chown` needs privileges Verso does not ask for; the report says
  whether the owner ended up the same as the original's. Mode and extended
  attributes are preserved as the requirement asks.
- **The extended attributes are copied before the file's `fsync`**, so they
  become durable together with the content rather than after it.
- **The temporary file is created with the original's mode from the first
  instant**, rather than created at the default and adjusted afterwards. The
  window in between is short and real: a replacement for a note the user had
  set to `0600` would be world-readable for the length of a write, and a window
  is enough for whoever is looking.
- **`WriteReport` is `#[must_use]` and lists its warnings.** A report that
  carries `hard_link_shared` or `durability_not_confirmed` and is dropped
  without being read warns nobody; the type makes ignoring it a compiler
  warning instead of a habit.
- **The two `fsync` calls are not observable from a test.** Neither the file's
  nor the directory's: no portable assertion distinguishes "synced" from "not
  synced" without pulling the power. The requirement is met by reading the code.
  Recorded plainly, because it is the one requirement above with no test behind
  it: **the directory `fsync` has no test, deferred**, and what stands in for
  one is a human reading the code.
- **A failure after the `rename` is reported, not raised as a failed write.**
  The directory `fsync` and the read-back of the new stamp happen when the
  content is already in place; the report carries `durability_not_confirmed`
  instead of an error, because a retry of a write that already landed would
  show the user a diff against their own edit.
- **A network file system is detected on macOS by `MNT_LOCAL` being absent from
  the mount flags**, not by a list of filesystem names. On the other platforms
  it is not detected at all yet.
- **The sync-client test is pending the maintainer, and it gates closing the
  feature.** "Test with a folder inside at least one of them before closing the
  feature" was not done: it needs a real iCloud Drive, Dropbox, OneDrive or
  Syncthing folder on the maintainer's machine. The requirement stands, unmet,
  and feature 2 does not close while it is unmet.
  *(2026-10-12, the maintainer, accepting the ADR audit: the test stays
  open as a manual check of theirs and no longer gates anything —
  `docs/reference/manual-checks.md`.)*
- **The macOS-only code is compiled by a pull request only on a Mac.** The
  `st_flags` check of the placeholder guard and the `statfs` check for a network
  filesystem are behind `#[cfg(target_os = "macos")]`, and a pull request runs on
  Linux, with macOS running on `main` after the merge — so the CI that gates the
  PR neither compiles nor exercises them. The reading of 2026-09-22 built and
  ran all 35 tests on macOS 15 with the pinned 1.98.1 toolchain, all green; that
  manual run is stated as a step in the PR, and it is what the Linux run cannot
  give.

### FTS5 and parameterized queries — how the feature 3 code meets the guardrail

**Recorded on 2026-09-22 and provisional: the maintainer decides on waking**,
on line 5 of `docs/reference/index-decision.md` §9. The guardrail above is
unchanged; this is what `verso-index` does.
*(Ratified by the maintainer on 2026-10-12, as built and tested:
"Ajuste tudo que precisar. Está aprovado os ADRs".)*

- **Every value is a bound parameter.** No query is assembled by formatting a
  value into SQL: paths, targets and limits go in as `?1`, `?2`.
- **The user's words never reach FTS5's query grammar.** Each
  whitespace-separated word of a search becomes an FTS5 string — wrapped in
  double quotes, with an inner double quote doubled — and the words are joined
  by FTS5's implicit AND. So `NOT`, `OR`, `*`, `:`, `(` and `"` are searched
  for as text and cannot change the query.
- **Control characters are dropped from each word before it is quoted.**
  Quoting alone was not enough: FTS5 reads the whole expression as a C string,
  so a NUL byte inside a quoted word ends the string there and SQLite answers
  `unterminated string`. Not an injection — the quotes stay balanced — but
  memo §6.3.2 asks that a query must not make SQLite return an error either.
  So `ca<NUL>fe` is searched for as `cafe`, and a query made only of control
  characters searches for nothing at all.
- **What that costs, stated rather than hidden:** the user cannot type `casa*`
  for a prefix search or `titulo:casa` for a column filter. Those become flags
  of `verso search` if the maintainer wants them (feature 4).
- **The test covers every operator of the table in memo §6.3.4** — `"`, `OR`,
  `NOT`, `NEAR(x y)`, `col:x`, `*`, `-x`, a lone `^`, an unbalanced `(` — and
  asserts **which notes each query matches**, not merely that it does not
  fail: an operator searched for as text matches the note that contains that
  text and no other, and matches nothing when no note contains it. That is
  what tells the two apart: `-texto` returns the notes that contain `texto`,
  which is what a word does, instead of every note except them, which is what
  the operator would do.
- **Seen failing**, as this ADR requires: with the quoting removed, the grammar
  test fails with `fts5: syntax error near "NOT"`.

### Working around a guardrail — revision of 2026-09-29

**Why it is the failure that matters.** Written for the maintainer, who is
learning Rust. This ADR's premise is in its Context: line-by-line human review
is not the realistic defence, so the guardrails are the reviewer that reads
every line. A guardrail that is worked around is not a weaker reviewer; it is
a stretch of code that no reviewer reads any more, and nothing says so — CI
stays green.

The `std::fs` rule is the clearest case. `verso-fs` is where the protections
of the user's files live: the atomic write (temporary file, `fsync`,
`rename`), the check that the file on disk is still the one that was read
(invariant 11), the placeholder guard ([0043](0043-placeholder-guard.md),
invariant 10) and path confinement. Code that reaches the disk around
`verso-fs` compiles clean, passes its tests and reads right in a diff — and
does none of the four. It fails months later, as a note half-written after a
power loss, an edit made in another app silently overwritten, a file of
iCloud read as deleted, or a path outside the folder reached. No test and no
demonstration shows it before then.

Two mechanisms make that possible without a single `#[allow]`:

- **A subprocess.** Clippy's `disallowed-methods` names Rust functions —
  `std::fs::read_link`, for instance — and flags a call to them.
  `std::process::Command::new("readlink")` is not a call to that function: it
  starts another program, the system's `readlink`, which does the same thing
  on the same disk. To the compiler it is starting a process, and nothing
  turns red.
- **A `clippy.toml` of the crate's own.** Clippy reads the `clippy.toml`
  closest to the crate, and a crate that has one does not inherit the
  workspace's list. A new file with `disallowed-methods = []` switches the
  whole list off for that crate, in a line that looks like configuration.

And a workaround tolerated once becomes the pattern. The AI that writes the
next feature reads the code around it and does what it finds there; a
subprocess that went through review is, to the next session, evidence that
this is how this repository does it.

**The two cases on this branch**, recorded as facts, not blame — both compiled
clean and passed every check, and both were found by reading, which is what
this ADR says does not scale:

- `crates/verso-cli` (commit `e5754b0`): to resolve the command line's
  installed symlink back to the directory of the real binary and the app
  beside it, the code called the `readlink` program through
  `std::process::Command`, where clippy denied `std::fs::read_link`.
- `app/src-tauri` (commit `2db4c73`, the updater, shipped in 0.3.0-beta.1): a
  `clippy.toml` with an empty `disallowed-methods` list was added inside a
  feature pull request, which switched the workspace's `std::fs` list off for
  the whole shell, with no exception declared.

**The rule.** A subprocess that does work a list denies — filesystem work, or
any other work a list denies — is the same violation as calling the denied
API: `Command::new("readlink")`, `cp`, `rm`, `ln` or `cat` in a crate where
the matching `std::fs` call is denied fails the guardrail, and a reviewer
classifies it BLOCKING. A `clippy.toml` that drops entries of the workspace's
list is an exception and follows the rule for exceptions: declared in the file
itself, with its reason, and ratified by the maintainer in the pull request
that adds it. This delimits what "worked around" means in `CLAUDE.md` §3; it
adds no check. No mechanical check finds a subprocess yet: the reading does.

**Two exceptions, declared in this pull request for the maintainer's
ratification:**

- `crates/verso-cli/clippy.toml` repeats the workspace's list and allows
  exactly one call more, `std::fs::canonicalize`, for `launch_app` to resolve
  the installed symlink (Homebrew's, or the link the settings make) to the
  directory of the real binary. The path resolved is the binary's own, never
  the folder's; the command line's input and output are outside rule 5 of
  [0026](0026-core-ui-contract-inviolable-rules.md). It replaces the `readlink`
  subprocess above.
- `app/src-tauri/clippy.toml` keeps an empty list, because clippy's list is
  per crate, not per module, and the updater
  ([0055](0055-in-app-updater.md)) works with files that are not the
  folder's: the download, the extraction, the bundle. `std::fs` in the shell
  is confined instead to `src/update.rs` by a grep in `scripts/check.sh`, the
  same pattern that confines `verso-core`'s to `src/sidecar.rs`. By the rule
  above that the scripts and the workflow change together, the same step
  belongs in `.github/workflows/ci.yml`.

**Ratified on 2026-09-29 by the maintainer**, in session, answering the list
of what was pending ("Ratifique o que precisar" — ratify what needs it): both
exceptions above stand as declared. The grep that confines the shell's
`std::fs` to `src/update.rs` runs in `scripts/check.sh` and in
`.github/workflows/ci.yml` alike.

**A third exception, declared and ratified the same day.**
`crates/verso-core/clippy.toml` now also allows `std::fs::read_dir`, confined
as before to `src/sidecar.rs` by the grep, so that the index's sidecars can
be listed for the menu's recent folders (`verso_core::recent_folders`). What
it lists is the configuration directory
([0011](0011-config-outside-tree-index-as-cache.md)), never the open folder
(rule 5 of [0026](0026-core-ui-contract-inviolable-rules.md)); and the paths
it reads stay on the host's side — the menu shows them, the window never
receives them (rule 4). Everything that inspects or removes a path stays
denied there. Ratified by the maintainer on 2026-09-29, in the same answer.

**A fourth exception, and the decision under it — 2026-09-29.** Verso wrote
nothing down. A command that failed said so in the status bar and was gone; a
panic, a rejected promise and a script error left no trace at all, so a bug a
user met could only be found by running the binary from a terminal and watching
its `stderr`. The maintainer, on being told there was no log: *"se der algum
erro, a gente reza pra tentar achar?"*. The guardrails are part of why it
happened — writing to disk needs a declared, confined exception here — and no
ADR had ever covered diagnostics.

**Decided by the maintainer on 2026-09-29**, in session: the app keeps a log.
How the author built it:

- One file, `<config>/logs/verso.log`, in the configuration directory
  ([0011](0011-config-outside-tree-index-as-cache.md)) — **never the open
  folder** (rule 5 of [0026](0026-core-ui-contract-inviolable-rules.md)). It is
  `0600`, as the index and its sidecar are ([0046](0046-index-location-lifecycle-tokenizer.md)),
  one rotation at 512 KiB, and it is never sent anywhere: it is the user's
  file, on the user's machine.
- What goes in: the version and commit the app started with, every failure that
  crosses to the window (`failed`), every panic (a hook, where they vanished
  before), and every error the window would have swallowed — the contract
  errors it shows, a script that threw, a promise nobody caught, a
  `console.error`, and the exceptions the PDF viewer and the diagrams catch
  and answer for themselves.
- The destination is fixed once, at start-up (`log::open`). A test run
  exercises these very errors; before this it wrote them into the user's own
  log, which is how the fault was found.
- `app/src-tauri/src/log.rs` is `verso-app`'s second module allowed `std::fs`,
  beside `src/update.rs`. The grep in `scripts/check.sh` and in
  `.github/workflows/ci.yml` now holds disk access to those two alone, and the
  crate's `clippy.toml` says why.
- The window's side is `app/ui/src/report.ts`, so the parts that catch their
  own exceptions reach the log without reaching into the window's own file.
  The status bar's bug button fills a report with the build, the state, the
  session's errors and the end of the log, shows it whole and editable, and
  copies it. Nothing leaves the machine.

**Ratified by the maintainer on 2026-10-01** (review
[`docs/review/board.md`](../review/board.md), §6 item 10, "Aceito todas
(Recomendado)"): `src/log.rs` as the fourth exception, and the log itself a
decision. With it, what the log hands to a report: the home directory shown as
`~` wherever it appears in the log's lines, the log named by its file alone
when no home is known (rule 4 of
[0026](0026-core-ui-contract-inviolable-rules.md)), one message capped at
4 KiB; an error a note's own content causes — a diagram half typed — is a
warning, not an error.

Verified in the app with real failures — a note that is not UTF-8 and a Mermaid
diagram that does not parse both reached the file. The uncaught script error,
the rejected promise and the panic take the same path and were not exercised.

**A fifth exception, granted by the maintainer on 2026-10-09** ("Liberado",
[0054](0054-terminal-and-agents-from-the-app.md)). `crates/verso-core/clippy.toml`
now also allows `std::fs::OpenOptions::open`, confined as before to
`src/sidecar.rs` by the grep, so that each call an agent makes is appended
to `agents.log` in one write instead of the file being rewritten — the
rewrite lost a line when two servers logged at once. It opens a file of the
configuration directory, never one of the open folder (rule 5 of
[0026](0026-core-ui-contract-inviolable-rules.md)).

**A contradiction, recorded and not resolved.** The shell links the command
line from the settings ([0054](0054-terminal-and-agents-from-the-app.md)) with
the system's tools — `test`, `readlink`, `ln`, `rm`, `xattr`, `osascript`, in
`cli_state_now`, `install_cli` and `uninstall_cli` of `app/src-tauri/src/lib.rs`
— outside `src/update.rs`. Read literally, the rule above makes those calls a
violation. [0054](0054-terminal-and-agents-from-the-app.md) declared them
openly and left `[OPEN]` whether they should become `std::fs` with a declared
exception; that question is the maintainer's, and this revision does not
answer it.

**Resolved on 2026-09-29**, by the maintainer's request in session ("arrume
essa parte do cli, tem que ficar 100%" — fix that part of the command line,
it has to be 100%). `install_cli`, `uninstall_cli` and `cli_state_now` no
longer start `test`, `readlink`, `ln`, `rm` or `xattr`. Their filesystem work
moved into `src/update.rs`, inside the grep's scope and under the exception
ratified above: `executable_file`, `link_target`, `something_at`,
`replace_symlink` and `remove_file_at` use `std::fs`, and `clear_quarantine`
takes the download's quarantine off through the `xattr` crate, justified in
`app/src-tauri/Cargo.toml`. The one subprocess left is `osascript`, for the
administrator prompt. It is privilege, not a way around the list: `std::fs`
cannot ask for an administrator's password. When the plain `std::fs` call
fails because `/usr/local/bin` is not the person's, the command macOS runs
with the administrator's rights is `mkdir -p /usr/local/bin && ln -sfn <the
bundled command line> /usr/local/bin/verso`, or `rm /usr/local/bin/verso` to
remove it — fixed commands on that one path, the bundled binary's path
quoted as one shell word, after macOS asks for the password. Declared here
and accepted as the one subprocess of the command line's link. The
`[OPEN]` of [0054](0054-terminal-and-agents-from-the-app.md) on the same
question is closed by this.

### One exception to `unsafe_code = "forbid"` — revision of 2026-10-15

**Why.** An embedded page whose site refuses to be framed
(`X-Frame-Options`, `frame-ancestors`) is shown in a native child web view
([0056](0056-embedded-web-pages.md)). The maintainer's own sites all
refuse framing, measured on 2026-10-15: olddragon.com.br (`SAMEORIGIN`;
`frame-ancestors 'self' *.owlbear.rodeo`), rolai.app (`DENY`), a
Calibre-Web on the local network (`SAMEORIGIN`). A native view floats over
the window's page, where CSS cannot clip it; unclipped, it could only be
shrunk to the visible part of its box, which showed the page's top in a
shorter view. The maintainer, trying it in the app: *"era para funcionar
como iframe normal"* (it should work as a normal iframe). Clipping a
native view needs the platform's own views — an `NSView` on macOS, a
child window on Windows — and every call to them is `unsafe` in Rust. The
workspace forbade it, and a `forbid` cannot be allowed in one file.

**Decided by the maintainer on 2026-10-15**, in session, after being told
the exception would be confined to one module, one small file per
operating system, each block with a `SAFETY` comment, tested, in a pull
request of its own: *"A e B juntos"* — A, a real `<iframe>` where a site
allows framing; B, the native clipping, with this exception.

**The exception, as built:**

- The workspace keeps `unsafe_code = "forbid"` in
  `[workspace.lints.rust]`, and every member but `verso-app` inherits it
  unchanged.
- `app/src-tauri/Cargo.toml` writes the workspace's lints out instead of
  inheriting them — Cargo cannot inherit all of them but one — with
  `unsafe_code = "deny"`, the workspace's clippy lints at the workspace's
  levels, and two more, both `forbid`: `undocumented_unsafe_blocks` (every
  `unsafe` block says in a `// SAFETY:` comment why it is sound) and
  `multiple_unsafe_ops_per_block` (every block does one unsafe thing).
- `#![allow(unsafe_code)]` is written in two files only:
  `app/src-tauri/src/web_clip/macos.rs` and
  `app/src-tauri/src/web_clip/windows.rs`. The module's `mod.rs`, its
  geometry and Linux's `linux.rs` (GTK's safe API) have no `unsafe`.
- What is `unsafe` there: on macOS, taking the `WKWebView` from the raw
  pointer wry hands out, and asking a view for its superview; on Windows,
  the Win32 and WebView2 calls. All run on the main thread inside Tauri's
  `with_webview`, and no raw pointer or handle outlives the call: each
  call finds the container again from the page's view.
- **The guard, `scripts/check-unsafe.mjs`**, a new workspace guardrail.
  It fails when a Rust file of the repository outside those two files
  writes `unsafe` as code — a block, a function, an impl, a trait, an
  extern block, an attribute — or names the `unsafe_code` lint (comments
  and strings are not code); when the workspace's `unsafe_code` is not
  `forbid`; when `verso-app`'s table is not the workspace's, with `deny`
  and the two lints above; when another member does not inherit the
  workspace's lints; and when a Cargo configuration turns the lint off.
  Its tests are `scripts/check-unsafe.test.mjs`. It runs in the pull
  request's Linux job, in `scripts/check.sh` and, on the host, in
  `scripts/check-linux.sh` — Node and git only. **Seen failing** on
  2026-10-15: an `unsafe` block planted in `web_clip/mod.rs` and in
  `verso-fs`, an `allow(unsafe_code)` beside it, and `verso-app`'s
  `unsafe_code` set to `allow` each turned it red; put back, green.

**Supports macOS 11 and up (2026-10-15, accepted as recommended).** The
first build of the macOS container clipped with `NSView.clipsToBounds`,
public only from macOS 14. It now clips with the layer's `masksToBounds`
(`setWantsLayer(true)`, then the view's `layer()`), available since macOS
10.5, so the clipping works on every macOS the app supports (11 and up).
`objc2-quartz-core` (0.3.2, already in the lockfile) became a direct
dependency of `verso-app` for that call, and `unsafe` stays only in
`web_clip/macos.rs` and `windows.rs`, each block with its `SAFETY` comment
(`check-unsafe` unchanged). A unit test keeps the macOS 14 call from coming
back.

What it costs, stated plainly: `unsafe` is the code the compiler cannot
check, in a project whose review is mechanical (Context). The two files
are small, they are read by the model that did not write them, and the
clipping is checked on each system in the real app
(`docs/reference/manual-checks.md`), since no test without a window
reaches a native view. A second exception is a decision of its own, with
a revision here; never an `#[allow]` in the middle of a diff
(`CLAUDE.md` §3).

## Consequences

- Phase 0 does not close while the **workspace** guardrails have not been seen
  firing on a test branch — existing in the CI file is not enough
  ([0034](0034-roadmap-in-phases.md)). The feature guardrails have the same
  criterion, applied in the feature's PR: each one is seen failing before the
  PR is merged.
- The `cargo-deny` license allowlist follows [0005](0005-license.md)
  (MPL-2.0): MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, MPL-2.0,
  Unicode-3.0 and CC0-1.0 go in; GPL, LGPL and AGPL stay out; any other one
  only with justification in the PR. Closes in the PR of item 0.10. The
  Tauri tree added `Apache-2.0 WITH LLVM-exception`, ratified by the
  maintainer on 2026-09-23. Since that day the window's npm packages are held
  to the same list plus OFL-1.1, read from the lockfile; the gate was seen
  failing on a lockfile edited to carry GPL-3.0, no license, a file reference
  and an `AND` inside an `OR`.
- A new advisory turns CI red with no PR to blame. Policy: an exception in
  `deny.toml` only with justification, a link to the advisory and an expiry
  date; an expired exception is red CI again. `Cargo.lock` is versioned. The
  seven "unmaintained" notices of the Tauri tree, each with its link and an
  expiry of 2026-12-31, were ratified by the maintainer on 2026-09-23.
- `unwrap_used` denied outside tests changes how the code is written from the
  first PR on, not as a later refactor.
- The benchmark is a guardrail with no target: the baseline exists, but
  performance targets are `[OPEN]` ([0039](0039-performance-targets.md)).

**The benchmark guardrail, decided on 2026-09-22 by the maintainer**
(`docs/reference/bench-decision.md` §9). A deterministic, versioned generator
builds a synthetic vault of 1 000, 10 000 and 50 000 notes of one fixed shape,
including a 1 % share of iCloud placeholders; seven operations are measured —
fresh index, incremental with nothing changed, incremental with 1 % changed,
search for a common and for a rare word, backlinks of the most-linked note, and
unresolved over the whole vault — each with wall time, peak resident memory and
index file size, the median of repeated runs after a discarded warm-up. It runs
**on `main` only, on Linux only, after each merge, never on a pull request**,
for the cost reason recorded above, and from one local command with the same
output. Red when the median time exceeds 1.5× the recorded baseline, the index
file 1.05×, or peak memory 1.3× — no tolerance tighter than the measured noise,
which was ±45 % between runs at 20 000 notes on an idle laptop. Seen failing,
as every feature guardrail must be: by reverting the `notes_fts` delete to the
full scan it had before commit `4e99082`, which took 4 000 notes from 0.71 s to
4.94 s. The baseline itself is not a target: targets stay `[OPEN]`
([0039](0039-performance-targets.md)).

## Discarded alternatives

- Adding guardrails after having features — discarded in §14.3 ("All of them in
  CI before the first line of product logic"). The split into two groups does
  not reopen that: a feature guardrail goes in **with** the feature, not after.

## Status

Accepted. On 2026-10-12 the maintainer ratified the provisional records
of 2026-09-22 (the atomic write, FTS5) as built and tested, and left the
sync-client test open as a manual check that gates nothing (Revisions).
On 2026-10-15 the maintainer decided the one exception to
`unsafe_code = "forbid"`, the native clipping of an embedded page, and its
guard (Decision).
