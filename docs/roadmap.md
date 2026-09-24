# Verso roadmap

- Version: 2026-09-23, revision 3 (Phase 2 as built; the Phase 1 decisions taken on 2026-09-22 struck through)
- Source: `docs/BRIEFING.md` §15
- ADR: [0034](adr/0034-roadmap-in-phases.md)

Three phases. Each one has a verifiable exit criterion: someone who did not take
part in the work can run the verification and conclude "passed" or "did not
pass" without judging merit.

A phase does not start before the previous one closes. A scope item that is not
listed here does not enter the phase without becoming a recorded decision.

**Out of scope until the end of Phase 2:** sync, mobile, plugins, board and the
compatibility shim (§15). That holds even if the implementation looks cheap at
the time.

---

## Phase 0 — Foundation

Documents, decisions and guardrails. **No feature at all.**

### Scope

| # | Deliverable | State |
|---|---|---|
| 0.1 | ADRs, one per briefing decision | done in this branch |
| 0.2 | `docs/spec/dialect.md` v0 | done in this branch |
| 0.3 | `docs/roadmap.md` | done in this branch |
| 0.4 | `CLAUDE.md` | done in this branch |
| 0.5 | `.github/pull_request_template.md` | done in this branch |
| 0.6 | Critical review of the documents by an independent session | done — `docs/review/phase-0.md`; findings accepted and applied by the maintainer; the diff of the application is waiting to be read by Opus 5 ([ADR 0032](adr/0032-author-and-reviewer-roles.md)) |
| 0.7 | License decision and `LICENSE` file | done — Package A, MPL-2.0 + MIT in the SDK ([ADR 0005](adr/0005-license.md), Accepted). The `cargo-deny` allowlist closes in item 0.10 |
| 0.8 | Documentation language decision | done — English source, pt-BR mirror ([ADR 0008](adr/0008-documentation-language.md), Accepted) |
| 0.9 | Initial fixture corpus: 5 cases drafted by the AI, following the schema in `docs/spec/dialect.md` §4, each approved by the maintainer after checking it in the Obsidian app (ADR 0031, rule changed 2026-09-21) | done — five fixtures approved by the maintainer on 2026-09-21 after observation through the Obsidian CLI (`docs/reference/obsidian-cli.md`); schema §4 confirmed, Q1 closed |
| 0.10 | Cargo workspace with the five crates, empty | done — `fmt`, `clippy`, `test` and `deny` green; workspace guardrails seen failing locally (PR #2) |
| 0.11 | CI on macOS and Linux with the **workspace** guardrails ([ADR 0029](adr/0029-guardrails-in-ci.md)), including the documentation mirror check | done — baseline green on both OSes; each guardrail seen failing on a `test/guardrail-*` branch (links in the CI PR) |
| 0.12 | Documentation migration: translation into English at the canonical paths, pt-BR moved to `docs/pt-BR/`, English file names ([ADR 0008](adr/0008-documentation-language.md)) | done — authored by Opus 5 sessions, reviewed by Fable 5.1; `scripts/check-docs-mirror.sh` green |

### Exit criterion

All verifiable. The phase closes when the five pass.

1. **No open BLOCKING finding.** No finding classified as BLOCKING in the
   critical review is left unresolved. Verification: the list of findings from
   the review, each BLOCKING with the commit that resolves it or the
   maintainer's decision to downgrade it. State: the three BLOCKING findings in
   `docs/review/phase-0.md` (C1, C2, C3) were resolved in revision 2 of this
   roadmap; the "Resolution" section of the review points to what changed.
2. **`LICENSE` present at the root.** Verification: `test -f LICENSE`, and the
   file matches the package chosen in [ADR 0005](adr/0005-license.md). State:
   satisfied on 2026-09-21 — `LICENSE` contains the MPL-2.0 and ADR 0005 is
   Accepted (Package A).
3. **CI green on macOS and Linux.** Verification: one green run of
   `cargo fmt --check`, `cargo clippy`, `cargo test` and `cargo deny check` on
   both operating systems.
4. **Workspace guardrails demonstrably firing.** Each **workspace** guardrail
   from [ADR 0029](adr/0029-guardrails-in-ci.md) is seen failing on a test
   branch that deliberately introduces the violation it is supposed to catch,
   and the branch is not merged. Verification: one recorded red run per
   guardrail — divergent `cargo fmt`, `unsafe`, `unwrap` outside a test,
   `std::fs` outside `verso-fs`, a license outside the allowlist (provisional,
   marked as such), a known advisory. A guardrail that only exists in the CI
   file and has never been seen failing does not count. The **feature**
   guardrails (fuzz, round-trip, WASM, atomic write, confinement, FTS5,
   benchmark, generated types) cannot exist with empty crates; each one is seen
   failing in the PR of the feature that introduces it, and that is an exit
   criterion of Phase 1 (item 3) and of Phase 2 (item 3).
5. **Five fixtures approved.** There are five
   `fixtures/<category>/<case>/{input.md,expected.yaml}` pairs, covering
   distinct minimal categories from §11.4 and following the schema in
   `docs/spec/dialect.md` §4, each approved by the maintainer after checking
   the behaviour in the Obsidian app (ADR 0031). Verification:
   `scripts/check-fixtures.sh` reports five fixtures, none marked as a draft;
   each `observed:` names the app version and how it was checked; the PR that
   added them carries the maintainer's approval. State: satisfied on
   2026-09-21 (five approved, none a draft; observed with Obsidian 1.13.7).

### Does not block the exit

`[OPEN]` dialect questions (`docs/spec/dialect.md`, section 9, except the
schema in section 4, which item 0.9 confirms) and the ADRs
[0037](adr/0037-base-parser.md), [0038](adr/0038-ts-type-generation.md),
[0039](adr/0039-performance-targets.md), [0040](adr/0040-board-persistence.md)
and [0044](adr/0044-verso-fs-semantics.md) to
[0048](adr/0048-file-operations-in-ui.md). Each one has its own moment of
decision, all of them after Phase 0.

---

## Phase 1 — Core via CLI, no UI

A core usable from the terminal and by an agent. **No window.**

### Scope

Execution order from briefing §15:

| # | Crate | Deliverable |
|---|---|---|
| 1 | `verso-dialect` | parsing of links, blocks, headings and frontmatter; round-trip; fuzz target |
| 2 | `verso-fs` | walk the folder, path confinement, atomic write |
| 3 | `verso-index` | SQLite schema, FTS5, backlinks |
| 4 | `verso-cli` | `verso index`, `verso search`, `verso backlinks` |
| 5 | bench | synthetic vault generator + baseline |
| 6 | `verso-cli` | read-only `verso mcp`: search, read, walk the graph |
| 7 | `verso-cli` | messages in pt-BR and EN, no loose string literal ([ADR 0035](adr/0035-cross-cutting-requirements.md)); ships with feature 4 |

### Decisions that have to come out during the phase

| Decision | When | ADR |
|---|---|---|
| ~~Definition of round-trip (Q18)~~ | decided 2026-09-21: reading (b), read-only parser (`docs/reference/parser-decision.md`) | `docs/spec/dialect.md` Q18, [0037](adr/0037-base-parser.md) |
| ~~Base parser: `pulldown-cmark`, `comrak` or our own~~ | decided 2026-09-21: `pulldown-cmark`, `comrak` as the fallback (`docs/reference/parser-decision.md`) | [0037](adr/0037-base-parser.md) |
| Parsing questions Q2–Q8, Q12–Q17 and Q19–Q25 of the spec | before feature 1 closes; Q12 closed on 2026-09-22 with the parts of Q2, Q8 and Q14 it needed, Q3 and Q17 in part, the others still open | `docs/spec/dialect.md` §9 |
| ~~Symlinks, loops and ignored paths (Q26)~~ | decided 2026-09-22: every symlink is followed, maximum depth 64 with an error at the cap; hidden entries are not walked; an ignored note is an unresolved target and never a backlink source (`docs/reference/fs-decision.md`) | [0044](adr/0044-verso-fs-semantics.md) |
| ~~Placeholder detection mechanism per provider, starting with iCloud Drive~~ | decided 2026-09-22: both iCloud forms (`SF_DATALESS` and `.Name.ext.icloud`), checked before the file is opened; the other providers deferred (`docs/reference/fs-decision.md`) | [0043](adr/0043-placeholder-guard.md) |
| ~~Location, permissions and cleanup of the index~~ | decided 2026-09-22: one file per folder under the configuration directory, a sidecar naming the folder, `0700`/`0600`, excluded from backup, cleanup on demand (`docs/reference/index-decision.md`) | [0046](adr/0046-index-location-lifecycle-tokenizer.md) |
| ~~Disambiguation rule between `verso <folder>` and a subcommand~~ | decided 2026-09-22: a subcommand is required in Phase 1; the Phase 2 rule recorded and still open (`docs/reference/cli-decision.md`) | [0042](adr/0042-open-from-command-line.md) |
| ~~FTS5 tokenizer for pt-BR and EN~~ | decided 2026-09-22: `unicode61` with `remove_diacritics 2`, no stemming | [0046](adr/0046-index-location-lifecycle-tokenizer.md) |
| Performance targets | after feature 5 produces the baseline; the Mac baseline exists since commit `6b53c64` (`crates/verso-bench/baselines.json`), the targets are still open | [0039](adr/0039-performance-targets.md) |
| ~~MCP transport, exposed surface, protocol version~~ | decided 2026-09-22: stdio, seven read-only tools, the version `initialize` negotiates (`docs/reference/mcp-decision.md`) | [0045](adr/0045-server-and-mcp-security.md) |
| What an opaque handle identifies and for how long | before feature 6 closes; still open — the MCP and the window name notes by relative path, and the handle stays inside the process | [0044](adr/0044-verso-fs-semantics.md) |

### Exit criterion

1. **A real vault indexes without error.** `verso index` runs over the
   maintainer's real campaign vault and finishes with **exit code 0, or 1 when
   the walk reported a problem in the folder**, with no error and no panic.
   The `1` was decided by the maintainer on 2026-09-22 together with the exit
   codes (`docs/reference/cli-decision.md` §6.2): an unreadable directory is
   news about the folder, not a failure of the command, and it must not be
   reported as success either. Verification: run the command and check the exit
   code and the standard output.
2. **Backlinks match what was expected.** For a set of notes chosen by the
   maintainer, the output of `verso backlinks` matches the list they wrote by hand
   before running the command. Verification: compare the two lists; a divergence
   is a failure, even if the command is "right". The hand-written list follows
   the decisions on Q26 (ignored paths) and Q20 (Markdown links), so that both
   sides count the same thing.
3. **Guardrails green and demonstrably firing.** All the guardrails from
   [ADR 0029](adr/0029-guardrails-in-ci.md), workspace and feature, pass over
   the code of the phase, including parser fuzzing with no new crash, a
   round-trip property test (under the reading decided in Q18) and `cargo check`
   for `wasm32-unknown-unknown` of `verso-dialect`. Each feature guardrail was
   seen failing in the PR that introduced it. Verification: a green CI run, the
   recorded fuzz session, and one recorded red run per feature guardrail.
4. **Notes queryable by an agent.** Claude, connected to `verso mcp`, answers
   questions about the vault by searching, reading and walking the graph.
   Verification: a recorded session in which the agent answers and cites the
   source — by `^id` when the block has one, by line and column when it does not
   (`docs/spec/dialect.md` §4.4) — and the citation leads to the exact position.
   Querying by type waits until the typed note exists (Phase 2, item 2.6).
5. **Fixture corpus green.** All the fixtures pass, and no `expected.yaml` was
   changed without the maintainer's explicit approval.
   Verification: `cargo test` green, plus a `git log` of
   `fixtures/**/expected.yaml` with no unapproved commit.
6. **CLI in two languages — no longer required, and satisfied anyway.** The
   maintainer narrowed the requirement on 2026-09-22
   ([ADR 0035](adr/0035-cross-cutting-requirements.md)): pt-BR and EN bind the
   application's interface, not the CLI. Feature 7 built it bilingual before
   that, and it stays. Verification, if anyone wants it: run each command with
   both locales and check that no message stays in the other language; a
   divergence is no longer a reason to hold the phase.

---

## Phase 2 — Walking skeleton on macOS

The first version that gets used. macOS only ([ADR 0022](adr/0022-target-platforms-macos-first.md)).

### Scope

| # | Deliverable | State on 2026-09-23 |
|---|---|---|
| 2.1 | Core↔UI contract defined first, with TS types generated from the Rust | built: `crates/verso-contract`, bindings generated by `specta`, checked in CI |
| 2.2 | Tauri v2 shell opening an arbitrary folder | built: by the dialog, by `verso <folder>`, or the last folder at start |
| 2.3 | File tree | built, with create, rename, move, bin and copy; file operations decided on 2026-09-23 as built ([0048](adr/0048-file-operations-in-ui.md)) |
| 2.4 | CodeMirror 6 editor with Live Preview | built: reading, Live Preview and source |
| 2.5 | Backlinks and search coming from the core, through the contract | built, with links, tags, unlinked mentions and the graph |
| 2.6 | One note type end to end | not started: waits for the decisions below |
| 2.7 | pt-BR and EN in the UI; accessibility ([ADR 0035](adr/0035-cross-cutting-requirements.md)) | languages built, chosen in the settings; accessibility audited statically against WCAG 2.2 AA on 2026-09-24, on a local branch — what was fixed and what waits for the maintainer is in the [review](review/accessibility.md); not yet gone through with a screen reader |

Beyond the seven items, the maintainer asked during the phase for what a
person leaving Obsidian would miss; the list is
[ADR 0049](adr/0049-phase-2-scope-widened.md), and what the window does with
each file is in `docs/reference/app-decision.md`.

### Decisions that have to come out during the phase

| Decision | When | ADR |
|---|---|---|
| ~~TS type generation: `ts-rs` or `specta`~~ | decided 2026-09-22: `specta` with `tauri-specta`, types and command signatures generated | [0038](adr/0038-ts-type-generation.md) |
| Session identity and per-operation authorization in the contract | before item 2.1; the contract, built with the host trusting its own windows and nothing else (`docs/reference/app-decision.md` §7), accepted as built for Phase 2 on 2026-09-23; still open until a server enters scope | [0045](adr/0045-server-and-mcp-security.md) |
| Semantics of the opaque handles in the contract | before item 2.1; still open — the contract names notes by relative path and the revision is the only token | [0044](adr/0044-verso-fs-semantics.md) |
| ~~Rename, create, delete, move; link updating; concurrent external modification~~ | decided 2026-09-23: option (b), as the code does it — plans shown as diffs, no logical transaction, the bin | [0048](adr/0048-file-operations-in-ui.md), [0012](adr/0012-files-are-source-of-truth.md) |
| Promotion of the typed note ([0014](adr/0014-primitives-catalog.md)) and of degradation to Markdown ([0013](adr/0013-degrades-to-markdown.md)) to an ADR of their own, Accepted | before the typed note (2.6) | new ADR |
| Format and location of the schemas | before the typed note (2.6) | `docs/spec/dialect.md` Q11 |

### Exit criterion

1. **One month of real use.** The maintainer uses Verso to prepare their table
   sessions for a full month, without going back to Obsidian for a task Verso
   is supposed to cover. Verification: the campaign notes for the period were
   written in Verso, and the maintainer records what made them go back, when they
   went back.
2. **No data loss in the period.** No file corrupted, truncated or rewritten
   without user action during the month
   ([ADR 0012](adr/0012-files-are-source-of-truth.md)). Verification: the git
   history of the maintainer's vault with no diff they did not make themselves.
   That includes: no edit made in Obsidian overwritten by Verso (concurrent
   external modification) and no rename that rewrote another file without a
   diff ([0048](adr/0048-file-operations-in-ui.md)).
3. **Guardrails green and fixtures intact.** Same criterion as Phase 1, items 3
   and 5, now including the UI code and the check that the generated TS types
   are up to date ([ADR 0029](adr/0029-guardrails-in-ci.md)).

The gate is use, not a checklist: with the seven scope items done and the month
of use not happening, the phase has not closed.

---

## After Phase 2

No order and no deadline defined in the briefing. They enter the conversation
when Phase 2 closes: sync ([0020](adr/0020-sync-merge-in-core-transports-as-plugins.md)),
mobile ([0025](adr/0025-own-server-and-mobile-pwa.md)), plugins
([0016](adr/0016-plugins-execution-and-capabilities.md), with the questions in
[0047](adr/0047-plugin-api-open-questions.md) answered before the API is
designed), board ([0024](adr/0024-board-excalidraw.md)), compatibility shim
([0017](adr/0017-plugins-format-shim-loading.md)), the primitives that are still
proposed ([0014](adr/0014-primitives-catalog.md)) and **agent writing with a
diff** ([0018](adr/0018-llm-native-mcp-in-core.md), `DECIDED`, with no phase
assigned: Phase 1 delivers read-only MCP and Phase 2 does not include it).
Also the **Windows and Linux apps** ([0022](adr/0022-target-platforms-macos-first.md)):
the maintainer decided on 2026-09-23 that both ship, Windows first.

Order among them: `[OPEN]`, but for Windows before Linux.
