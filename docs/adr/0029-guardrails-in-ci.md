# ADR 0029 — Guardrails in CI before the first line of product logic

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §14.3, §10.3
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-21 — guardrails split into "workspace" and "feature" ones;
  lines for checking WASM, generated types and `std::fs` added; atomic write
  requirements and advisory policy recorded (Phase 0 review, C3, C9, R1, R10);
  2026-09-22 — where each operating system runs, after the cost incident;
  2026-09-22 — the path confinement row reworded after the symlink decision
  ([0044](0044-verso-fs-semantics.md)).

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
