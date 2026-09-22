# ADR 0029 — Guardrails in CI before the first line of product logic

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §14.3, §10.3
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-21 — guardrails split into "workspace" and "feature" ones;
  lines for checking WASM, generated types and `std::fs` added; atomic write
  requirements and advisory policy recorded (Phase 0 review, C3, C9, R1, R10);
  2026-09-22 — where each operating system runs, after the cost incident;
  2026-09-22 — the path confinement row reworded after the symlink decision
  ([0044](0044-verso-fs-semantics.md)); 2026-09-22 — how the feature 2 code
  answers the atomic write requirements, recorded as provisional, from two
  readings of that code; 2026-09-22 — how the feature 3 code meets the FTS5
  guardrail, recorded as provisional.

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
| `unsafe_code = "forbid"` via `[workspace.lints]` | memory corruption |
| clippy with `-D warnings`; `unwrap_used` and `expect_used` denied, allowed only in tests | a panic taking the app down |
| clippy `disallowed_methods` denying `std::fs` outside `verso-fs` (declared exceptions: index file in `verso-index`, config in `verso-core`) | access to the open folder outside `verso-fs` ([0026](0026-core-ui-contract-inviolable-rules.md), rule 5) |
| `cargo-deny`: license allowlist compatible with the chosen license; advisories denied | incompatible or vulnerable dependency |
| Documentation mirror: each canonical `.md` has a twin in `docs/pt-BR/` with the same heading structure, and vice versa | a document changed in one language only ([0008](0008-documentation-language.md)) |

### Feature guardrails — they go in the same PR as the feature they protect, never later

| Guardrail | Prevents | Goes in with |
|---|---|---|
| Fuzzing the parser with `cargo-fuzz` | a malformed file freezing the app | Phase 1, feature 1 |
| Round-trip property test (definition in `docs/spec/dialect.md`, Q18) | opening rewriting the file | Phase 1, feature 1 |
| `cargo check --target wasm32-unknown-unknown -p verso-dialect` | the parser ceasing to compile to WASM and losing the conformance suite with the editor | Phase 1, feature 1 |
| Atomic write (see requirements below) | corruption on power loss | Phase 1, feature 2 |
| Path confinement in the adapter | a plugin or agent reaching outside the folder with an absolute path, a `..` component or a NUL byte; a symlink inside the folder is the user's, is followed, and what it reaches counts as inside the folder ([0044](0044-verso-fs-semantics.md)) | Phase 1, feature 2 |
| Parameterized queries + escaping of the FTS5 syntax | search breaking with quotes and operators | Phase 1, feature 3 |
| Benchmark with a synthetic vault | performance regression | Phase 1, feature 5 |
| Check that the generated TS types are up to date | rule 3 of the contract turning into a convention ([0038](0038-ts-type-generation.md)) | Phase 2, item 2.1 |

CI on macOS and Linux: `cargo fmt --check`, `cargo clippy`, `cargo test`,
`cargo deny check`, plus the commands of the feature guardrails as they come in.

A pull request runs the guardrails on Linux only; macOS runs on `main`, after
each merge. Both operating systems are therefore checked where the code lands.
The reason is cost: a macOS minute is billed at ten times a Linux one, and one
day of pushes to stacked branches spent the private repository's whole monthly
quota, after which GitHub stopped starting jobs. Maintainer's decision of
2026-09-22.

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
- Network file systems where rename is not atomic: detect and degrade with a
  warning, not silently.
- Windows: replacing an existing file requires `MoveFileEx` with
  `REPLACE_EXISTING`; a handle held open by antivirus or OneDrive makes the
  rename fail. Goes in when Windows goes in.

**How the feature 2 code answers the list above, recorded on 2026-09-22 and
provisional: the maintainer decides on waking.** Each item is what the code
does, not a decision; the requirements above are unchanged.

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

- **Every value is a bound parameter.** No query is assembled by formatting a
  value into SQL: paths, targets and limits go in as `?1`, `?2`.
- **The user's words never reach FTS5's query grammar.** Each
  whitespace-separated word of a search becomes an FTS5 string — wrapped in
  double quotes, with an inner double quote doubled — and the words are joined
  by FTS5's implicit AND. So `NOT`, `OR`, `*`, `:`, `(` and `"` are searched
  for as text and cannot change the query.
- **What that costs, stated rather than hidden:** the user cannot type `casa*`
  for a prefix search or `titulo:casa` for a column filter. Those become flags
  of `verso search` if the maintainer wants them (feature 4).
- **Seen failing**, as this ADR requires: with the quoting removed, the grammar
  test fails with `fts5: syntax error near "NOT"`.

## Consequences

- Phase 0 does not close while the **workspace** guardrails have not been seen
  firing on a test branch — existing in the CI file is not enough
  ([0034](0034-roadmap-in-phases.md)). The feature guardrails have the same
  criterion, applied in the feature's PR: each one is seen failing before the
  PR is merged.
- The `cargo-deny` license allowlist follows [0005](0005-license.md)
  (MPL-2.0): MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, MPL-2.0,
  Unicode-3.0 and CC0-1.0 go in; GPL, LGPL and AGPL stay out; any other one
  only with justification in the PR. Closes in the PR of item 0.10.
- A new advisory turns CI red with no PR to blame. Policy: an exception in
  `deny.toml` only with justification, a link to the advisory and an expiry
  date; an expired exception is red CI again. `Cargo.lock` is versioned.
- `unwrap_used` denied outside tests changes how the code is written from the
  first PR on, not as a later refactor.
- The benchmark is a guardrail with no target: the baseline exists, but
  performance targets are `[OPEN]` ([0039](0039-performance-targets.md)).

## Discarded alternatives

- Adding guardrails after having features — discarded in §14.3 ("All of them in
  CI before the first line of product logic"). The split into two groups does
  not reopen that: a feature guardrail goes in **with** the feature, not after.

## Status

Accepted.
