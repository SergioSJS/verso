# Verso roadmap

- Version: 2026-10-12, revision 7 (Phase 2 declared closed on 2026-10-09 by the maintainer, answering the ADR audit, *"Ajuste tudo que precisar. Está aprovado os ADRs"* — the `[OPEN]` at the head of Phase 3 answered, and what Phase 2's exit criterion and scope still lacked carried into Phase 3 as its pendencies; dated notes beside "a phase does not start before the previous one closes" and Phase 2's gate; rows 3.23 and 3.24 added the same day from the maintainer's *"Todos aprovados"*). Revision 6, 2026-10-11 (Phase 3's table gains what was built since revision 5 — [0077](adr/0077-the-server-administration-console-and-folder-quotas.md), [0078](adr/0078-universo-the-name-of-verso-as-a-server.md), [0079](adr/0079-sync-a-local-folder-with-a-server.md) — and the accepted [0080](adr/0080-the-trash-with-expiry-and-restore.md), [0081](adr/0081-sharing-between-people-on-one-universo.md) and [0082](adr/0082-live-co-editing-of-a-synced-folder.md) in the order the maintainer set on 2026-10-11, *"Sim para todos"*; finer permissions struck through as accepted with 0081; "After Phase 2" brought up to date on sync; the rows 3.10–3.16, which bear on the exit criterion, were written from the memo's recommendation, not from one of the maintainer's eight answers, and awaited the maintainer's acceptance — rule zero; on 2026-10-12, within this revision, rows 3.13, 3.14 and 3.16 marked built and 3.15 done, rows 3.10–3.16 **accepted by the maintainer** that night, "Ok", and rows 3.17–3.21 added from the maintainer's answers of the same night; rows 3.10, 3.14, 3.20 and 3.21 brought up to what was built by the audit of 2026-10-12). Revision 5, 2026-10-09 (Phase 3 written, from [ADR 0073](adr/0073-self-hosted-server-first.md) accepted by the maintainer with 0074, 0075 and 0076; the contract's session identity and the handles for `verso serve` struck through as decided). Revision 4, 2026-09-24 (the maintainer's decisions of 2026-09-24 struck through: the handles in both phases, and the typed note's two rows, with item 2.6 no longer waiting for them). Revision 3, 2026-09-23: Phase 2 as built; the Phase 1 decisions taken on 2026-09-22 struck through
- Source: `docs/BRIEFING.md` §15
- ADR: [0034](adr/0034-roadmap-in-phases.md)

Three phases, and since 2026-10-09 a fourth, Phase 3
([ADR 0073](adr/0073-self-hosted-server-first.md)). Each one has a verifiable exit criterion: someone who did not take
part in the work can run the verification and conclude "passed" or "did not
pass" without judging merit.

A phase does not start before the previous one closes. *(Phase 3 started
on 2026-10-09 with Phase 2's exit criterion not met; on 2026-10-12 the
maintainer declared Phase 2 closed that day, its pendencies carried into
Phase 3 — below.)* A scope item that is not
listed here does not enter the phase without becoming a recorded decision.

**Out of scope until the end of Phase 2:** sync, mobile, plugins and the
compatibility shim (§15). That holds even if the implementation looks cheap at
the time. The board was on this list until 2026-09-30, when the maintainer
pulled it into Phase 2 ([ADR 0057](adr/0057-board-json-canvas.md)).
Sync and mobile left it on 2026-10-09 for Phase 3, in the shape
[ADR 0073](adr/0073-self-hosted-server-first.md) gives them — mobile
through the browser, served by the server; sync after the server and
through it. Plugins and the compatibility shim stay on it.

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
| ~~Disambiguation rule between `verso <folder>` and a subcommand~~ | decided 2026-09-22: a subcommand is required in Phase 1; the Phase 2 rule recorded and still open (`docs/reference/cli-decision.md`) — decided by the maintainer on 2026-09-23 (0042 Status) | [0042](adr/0042-open-from-command-line.md) |
| ~~FTS5 tokenizer for pt-BR and EN~~ | decided 2026-09-22: `unicode61` with `remove_diacritics 2`, no stemming | [0046](adr/0046-index-location-lifecycle-tokenizer.md) |
| Performance targets | after feature 5 produces the baseline; the Mac baseline exists since commit `6b53c64` (`crates/verso-bench/baselines.json`), the targets are still open | [0039](adr/0039-performance-targets.md) |
| ~~MCP transport, exposed surface, protocol version~~ | decided 2026-09-22: stdio, seven read-only tools, the version `initialize` negotiates (`docs/reference/mcp-decision.md`); widened on 2026-10-07 to nine — typed relations, boards, properties and tags, bases | [0045](adr/0045-server-and-mcp-security.md), [0066](adr/0066-mcp-sees-boards-relations-properties-bases.md) |
| ~~What an opaque handle identifies and for how long~~ | decided 2026-09-24, as built: notes named by their relative path — the MCP, the CLI and the window — and the handle an index into a table of paths inside the process; re-opened before anything outside the app's own views gets access to files (`docs/reference/handles-decision.md`) | [0044](adr/0044-verso-fs-semantics.md) |

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

The first version that gets used. macOS only
([ADR 0022](adr/0022-target-platforms-macos-first.md)) as planned; since
2026-10-07 the **Windows app** is in this phase's scope too, ahead of the
rest of its work, and ships before the phase closes
([ADR 0069](adr/0069-windows-port.md), the maintainer: "Vou passar windows
na frente").

**Closed on 2026-10-09**, declared by the maintainer on 2026-10-12; what
it still lacked is carried into Phase 3 ("Carried from Phase 2", below).

### Scope

| # | Deliverable | State on 2026-09-24 |
|---|---|---|
| 2.1 | Core↔UI contract defined first, with TS types generated from the Rust | built: `crates/verso-contract`, bindings generated by `specta`, checked in CI |
| 2.2 | Tauri v2 shell opening an arbitrary folder | built: by the dialog, by `verso <folder>`, or the last folder at start |
| 2.3 | File tree | built, with create, rename, move, bin and copy; file operations decided on 2026-09-23 as built ([0048](adr/0048-file-operations-in-ui.md)) |
| 2.4 | CodeMirror 6 editor with Live Preview | built: reading, Live Preview and source |
| 2.5 | Backlinks and search coming from the core, through the contract | built, with links, tags, unlinked mentions and the graph |
| 2.6 | One note type end to end | built on 2026-10-07, rows 1 to 6 of the memo's section 8 (`docs/reference/typed-note-decision.md`): the parser's `schemas`, the index's types and schema blocks (version 10, carried over in place), the core's typing at query time, the panel, `type:` in the search, the MCP; decided on 2026-09-24 ([0052](adr/0052-typed-note.md), spec Q11); the two schema fixtures approved the same day. Waiting for the maintainer's reading |
| 2.7 | pt-BR and EN in the UI; accessibility ([ADR 0035](adr/0035-cross-cutting-requirements.md)) | languages built, chosen in the settings; accessibility audited statically against WCAG 2.2 AA on 2026-09-24, on a local branch — what was fixed and what waits for the maintainer is in the [review](review/accessibility.md); not yet gone through with a screen reader |

Beyond the seven items, the maintainer asked during the phase for what a
person leaving Obsidian would miss; the list is
[ADR 0049](adr/0049-phase-2-scope-widened.md), and what the window does with
each file is in `docs/reference/app-decision.md`. On 2026-09-24 the maintainer
made three more the priority, built the same day: views over the folder —
tables, cards, lists, kanbans and calendars, as Obsidian's bases
([ADR 0053](adr/0053-views-bases.md)) — a second window on the same folder,
and the terminal and agents set up from the settings
([ADR 0054](adr/0054-terminal-and-agents-from-the-app.md)); the memo is
`docs/reference/views-decision.md`. On 2026-09-30 the maintainer pulled the
board in as well — a `.canvas` drawn with Excalidraw, typed relations in the
frontmatter, the conversion of the Excalidraw plugin's drawings
([ADR 0057](adr/0057-board-json-canvas.md)); the memo is `docs/reference/board-decision.md`.
On 2026-10-02 the maintainer pulled in make.md's organizing features —
labels, folder pages, manual order and pins, editing an embedded note in
place ([ADR 0060](adr/0060-makemd-organizing-features.md)); the memo is
`docs/reference/makemd-decision.md`. On 2026-10-06 the maintainer pulled in
Notion's blocks in Edit mode — a handle to drag a paragraph, a list item or
any other block, a `+`, a menu per block and Notion's keys
([ADR 0061](adr/0061-blocks-in-edit-mode.md)).

### Decisions that have to come out during the phase

| Decision | When | ADR |
|---|---|---|
| ~~TS type generation: `ts-rs` or `specta`~~ | decided 2026-09-22: `specta` with `tauri-specta`, types and command signatures generated | [0038](adr/0038-ts-type-generation.md) |
| ~~Session identity and per-operation authorization in the contract~~ | decided 2026-10-09 with ADR 0073: every command carries the session the transport authenticated, resolved to an account and a role before `verso-fs` acts; the desktop app with a local folder keeps the implicit owner ([0074](adr/0074-accounts-and-access-on-the-server.md) item 11). Before: before item 2.1; the contract, built with the host trusting its own windows and nothing else (`docs/reference/app-decision.md` §7), accepted as built for Phase 2 on 2026-09-23; still open until a server enters scope | [0045](adr/0045-server-and-mcp-security.md) |
| ~~Semantics of the opaque handles in the contract~~ | decided 2026-09-24, as built for Phase 2: the contract names notes by relative path, no capability crosses it, and the revision is the only token; re-opened before a plugin, a mobile client or `verso serve` gets access to files (`docs/reference/handles-decision.md`); for `verso serve` answered 2026-10-09: the session and its role in the folder are the access capability, no per-file capability crosses (0044, "On a server") | [0044](adr/0044-verso-fs-semantics.md) |
| ~~Rename, create, delete, move; link updating; concurrent external modification~~ | decided 2026-09-23: option (b), as the code does it — plans shown as diffs, no logical transaction, the bin | [0048](adr/0048-file-operations-in-ui.md), [0012](adr/0012-files-are-source-of-truth.md) |
| ~~Promotion of the typed note ([0014](adr/0014-primitives-catalog.md)) and of degradation to Markdown ([0013](adr/0013-degrades-to-markdown.md)) to an ADR of their own, Accepted~~ | decided 2026-09-24: the typed note in a new ADR, Accepted; degradation to Markdown accepted in place, with "views" and "structured data" delimited (`docs/reference/typed-note-decision.md`) | [0052](adr/0052-typed-note.md), [0013](adr/0013-degrades-to-markdown.md) |
| ~~Format and location of the schemas~~ | decided 2026-09-24: a fenced `verso-schema` block in a note, anywhere in the folder but hidden and ignored paths; two schemas with one name type nothing | `docs/spec/dialect.md` Q11, [0052](adr/0052-typed-note.md) |

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

*(2026-10-12: the maintainer declared Phase 2 closed on 2026-10-09, the
day Phase 3 started, with items 1 to 3 above not recorded as met; they are
carried into Phase 3, below. The text above is kept as decided.)*

---

## Phase 3 — The Linux app, then the self-hosted server

Decided on 2026-10-09 by the maintainer, accepting
[ADR 0073](adr/0073-self-hosted-server-first.md) together with
[0074](adr/0074-accounts-and-access-on-the-server.md),
[0075](adr/0075-server-packaging-and-storage.md) and
[0076](adr/0076-the-window-on-every-screen.md): the Linux app first, then a
self-hosted server — the core without a window, reached by a browser, a
phone, a tablet and the desktop app, with several people in one folder.
Phase 2's exit criterion is not recorded as met, and the maintainer's
answer starts this work now (*"L deve vir agora"*); how that sits with "a
phase does not start before the previous one closes", above, is
`[OPEN]`, the maintainer's to say. *(Answered by the maintainer on
2026-10-12, accepting the ADR audit's recommendation — "Ajuste tudo que precisar. Está aprovado os ADRs": Phase 2 is closed on 2026-10-09, the day
Phase 3 started, and what it still lacked is carried as Phase 3's
pendencies — "Carried from Phase 2", below.)*

### Scope

| # | Deliverable | ADR |
|---|---|---|
| 3.1 | The Linux app — shipped in 0.6.0-beta.1 on 2026-10-09 | [0071](adr/0071-linux-port.md) |
| 3.2 | `verso serve`, a subcommand of `verso`: the session table and the dispatch in `crates/verso-service`, HTTP, WebSocket, the accounts and the server's database in `crates/verso-server`; the contract over the wire, its version a hash of the generated bindings | [0073](adr/0073-self-hosted-server-first.md) item 2, [0028](adr/0028-crate-structure.md), [0075](adr/0075-server-packaging-and-storage.md) item 1 |
| 3.3 | Accounts and access: the first admin from the environment, password and then passkeys, invitations, roles per folder, sessions, personal access tokens, the audit log | [0074](adr/0074-accounts-and-access-on-the-server.md) |
| 3.4 | Security before the first user who is not the maintainer: TLS behind a reverse proxy or `tailscale serve`, or the server's own certificate; the handles and the symlinks on a server; the threat model before the server is announced | [0073](adr/0073-self-hosted-server-first.md) item 6, [0044](adr/0044-verso-fs-semantics.md) |
| 3.5 | Packaging and storage: the Docker image (amd64, arm64), the CasaOS/ZimaOS compose file, `.deb`/`.rpm` with systemd; the data directory and the folders root; a folder's id; the space each folder takes; the update check | [0075](adr/0075-server-packaging-and-storage.md) |
| 3.6 | The desktop app connecting to a server, signing in through the browser | [0074](adr/0074-accounts-and-access-on-the-server.md) item 8 |
| 3.7 | The window on every screen, and the window served with `--web` | [0076](adr/0076-the-window-on-every-screen.md), [0073](adr/0073-self-hosted-server-first.md) item 9 |
| 3.8 | Simultaneous editing of notes | [0073](adr/0073-self-hosted-server-first.md) item 7 |
| 3.9 | The watcher's per-batch re-index narrowed to the batch's paths, measured with the benchmark | [0073](adr/0073-self-hosted-server-first.md) item 12 |
| 3.10 | The server's administration console at `/admin`, and quotas per folder — built 2026-10-10; an admin ending another account's sessions and revoking its tokens, with an audit line, decided 2026-10-11, built 2026-10-11 (ae23725) | [0077](adr/0077-the-server-administration-console-and-folder-quotas.md) |
| 3.11 | UniVerso, the name of Verso as a server — built 2026-10-10 | [0078](adr/0078-universo-the-name-of-verso-as-a-server.md) |
| 3.12 | Sync of a desktop's local folder with a folder on a server — built 2026-10-10 and campaigned 2026-10-10 and 2026-10-11; the append-merge, the device's name set by the person, the sync protocol version and the 1 GiB limit decided 2026-10-11 | [0079](adr/0079-sync-a-local-folder-with-a-server.md), [0074](adr/0074-accounts-and-access-on-the-server.md) item 8 |
| 3.13 | Live co-editing of a synced folder — accepted 2026-10-11; first in the order after this round; built on the night of 2026-10-11 to 12 (merged 817886e, 2026-10-12) | [0082](adr/0082-live-co-editing-of-a-synced-folder.md) |
| 3.14 | The trash with expiry and restore, with its item 12: the version a device's write replaced, kept and restorable (the campaign's finding F18) — accepted 2026-10-11; second; built, item 12 with it, on the night of 2026-10-11 to 12 (f3edc42; 5b5fb9c, of the same night, fixes a Windows test's timing, not the trash) | [0080](adr/0080-the-trash-with-expiry-and-restore.md), [0079](adr/0079-sync-a-local-folder-with-a-server.md) Consequences |
| 3.15 | The threat model refreshed (`docs/reference/threat-model.md`), its own `[OPEN]` items with it — third, before sharing; done 2026-10-11 (4c09fc9), the gaps it found closed by the hardening merged in 60c717c except those it lists as still open, and its own `[OPEN]` items kept open | [0073](adr/0073-self-hosted-server-first.md) item 6 |
| 3.16 | Sharing between people on one UniVerso: a grant on a path, read or write — accepted 2026-10-11; fourth; built on the night of 2026-10-11 to 12 (merged 2f25923, 2026-10-12) | [0081](adr/0081-sharing-between-people-on-one-universo.md) |
| 3.17 | A receiver's rename rewrites the owner's links outside the share — decided 2026-10-12; built 2026-10-12 on `feat/share-next`: the server writes the rewrites of the notes outside the share, the receiver hears only of the ones inside | [0081](adr/0081-sharing-between-people-on-one-universo.md) item 11 |
| 3.18 | The aggregates a receiver sees — the index's counts, a base's formulas — zeroed — decided 2026-10-12; built 2026-10-12 on `feat/share-next`: each counts only what is inside the share, and what cannot be scoped is zero | [0081](adr/0081-sharing-between-people-on-one-universo.md) item 11 |
| 3.19 | The writes the properties panel and a PDF's quote make to a live note go through the room — decided 2026-10-12, built 2026-10-12 | [0082](adr/0082-live-co-editing-of-a-synced-folder.md) Status |
| 3.20 | Presence stamped by the server with the sender's account (the threat model's gap 11) — decided 2026-10-12, built (3bc56ae), merged by d2a72b0; 241c233 records the gap closed | [0073](adr/0073-self-hosted-server-first.md) item 6, `docs/reference/threat-model.md` |
| 3.21 | The device approval page against device-code phishing (the threat model's gap 12) — decided 2026-10-12, built (5838c10), merged by d2a72b0; 241c233 records the gap closed | [0073](adr/0073-self-hosted-server-first.md) item 6, [0074](adr/0074-accounts-and-access-on-the-server.md) item 8, `docs/reference/threat-model.md` |
| 3.22 | The folder's settings layer (ADR 0070 items 1–2): the bookmarks, the walk's rules and the folder note's name in `.verso/settings.json`, carried by sync — built 2026-10-12 | [0070](adr/0070-what-travels-with-the-folder.md) items 1–2, [0079](adr/0079-sync-a-local-folder-with-a-server.md) item 2 |
| 3.23 | A new name differing only in case from an entry of its folder refused — `nota.md` beside `Nota.md` —, on every OS and on the server, with the reason; an existing entry never refused (spec Q8's creation side) — decided 2026-10-12, built 2026-10-12 | [0070](adr/0070-what-travels-with-the-folder.md) item 3, `docs/spec/dialect.md` Q8 |
| 3.24 | A reader's bookmarks fall back to this machine: an account that cannot write the folder's layer stars and unstars on this machine instead of being refused, and Settings says "Of this machine" — decided 2026-10-12, built 2026-10-12 | [0070](adr/0070-what-travels-with-the-folder.md) items 1–2 |

Items 3.2 to 3.9 ship together, in the first release of the server
(ADR 0073 item 12, revised on 2026-10-09). The window on every screen is
built before the server's window ships; passkeys come after password
sign-in, once the packaging pipeline works. What comes after the first
release of the server is in "After Phase 2", below.

Items 3.10 to 3.12 were built in the round that followed the first release
of the server (0.7.0-beta.1, 2026-10-10), opened by the maintainer the
same day (*"quero sincronização funcionando também"*, [0079](adr/0079-sync-a-local-folder-with-a-server.md) Source and
Status), and are not released yet. The order after this round, set by the
maintainer on 2026-10-11 answering a memo of recommendations with *"Sim
para todos"*: 3.13 → 3.14 → 3.15 → 3.16 — live co-editing, the trash
with the replaced version, the threat model refreshed, sharing. The threat
model before sharing is the memo's reason for the order:
[0073](adr/0073-self-hosted-server-first.md) item 6 asks for security in
full before the first user who is not the maintainer. Items 3.13,
3.14 and 3.16 were built, and 3.15 done, on the night of 2026-10-11 to
12, and none is released yet; the open questions their building raised
were sent to the maintainer the same night, each listed in its ADR's
Status. The maintainer answered them at 01:15 BRT on 2026-10-12, each
answer recorded in its ADR, and accepted rows 3.10 to 3.16 ("Ok"). Rows
3.17 to 3.21 come from those answers: 3.20 and 3.21, decided *"seguros
desde o dia 0"* (safe from day zero), were being built that night on
`feat/universo-small`, with [0081](adr/0081-sharing-between-people-on-one-universo.md)
item 8's revoked sync turned off with a notice; 3.17 to 3.19 come in the
next round. *(Built: 3.20 in 3bc56ae, 3.21 in 5838c10, the revoked sync in
6c7800e, merged into `feat/universo` by d2a72b0 on 2026-10-12; 241c233
records the threat model's gaps 11 and 12 closed. 3.17 to 3.19, and
3.22, were built on 2026-10-12 — *"Ajuste todas essas pendências agora"*
— and merged into `feat/universo` by 5b07712, 35d30ae and 05033f2, with
the campaign's F31: a file crosses in pieces read from the disk.)*

Rows 3.23 and 3.24 come from the maintainer's *"Todos aprovados"* of
2026-10-12, about 16:00 BRT, which approved the round's seven open
decisions as recommended — the others close `[OPEN]` items of
[0070](adr/0070-what-travels-with-the-folder.md),
[0079](adr/0079-sync-a-local-folder-with-a-server.md) item 12 and
`docs/reference/server-install.md` §14 without new work. Both were built
the same day on `feat/decisions-2026-10-12`, not merged yet.

**Carried from Phase 2** (the maintainer, 2026-10-12, closing Phase 2 on
2026-10-09). Phase 3 ends when no task of it is pending, and these are
among its tasks:

- Phase 2's exit criterion 1, **one month of real use**: the maintainer
  prepares their table sessions in Verso for a full month, without going
  back to Obsidian for a task Verso is supposed to cover, and records what
  made them go back — not recorded as met.
- Phase 2's exit criterion 2, **no data loss in that month**: the git
  history of the maintainer's vault with no diff they did not make —
  measured over the same month.
- Phase 2's exit criterion 3, **guardrails green and fixtures intact**,
  the UI code and the generated TS types included — not recorded as
  checked at a close.
- Phase 2's scope row 2.6, the typed note: the maintainer's reading,
  which the row says it waits for.
- Phase 2's scope row 2.7, accessibility: the pass with a screen reader,
  which the row says has not been made.

### Decisions that have to come out during the phase

| Decision | ADR |
|---|---|
| Whether the phone in the browser, online only, meets the mobile need, or offline on the phone moves earlier | [0073](adr/0073-self-hosted-server-first.md) |
| ~~Permissions finer than the folder~~ (accepted 2026-10-11: a grant on a path inside a folder, [0081](adr/0081-sharing-between-people-on-one-universo.md)); history, attribution and recovery of another member's change — still open, for an ADR of its own (0081 Status) | [0073](adr/0073-self-hosted-server-first.md), spec Q9, [0081](adr/0081-sharing-between-people-on-one-universo.md) |
| End-to-end encryption, later, as an opt-in for a server of one person | [0073](adr/0073-self-hosted-server-first.md) |
| The board's co-editing | [0073](adr/0073-self-hosted-server-first.md) item 7, [0082](adr/0082-live-co-editing-of-a-synced-folder.md) item 12 |
| The MCP's transport and authorization over the network | [0073](adr/0073-self-hosted-server-first.md) item 11, [0045](adr/0045-server-and-mcp-security.md) |
| The pre-signed URL of a bucket | [0073](adr/0073-self-hosted-server-first.md) item 4 |
| The criteria that would send the iPad from the browser to a native app | [0073](adr/0073-self-hosted-server-first.md) |
| How a cost would be passed on if storage of ours ever exists | [0073](adr/0073-self-hosted-server-first.md) item 4 |
| "This app is a server" updating while phones are connected | [0073](adr/0073-self-hosted-server-first.md) |
| The contents of the keyboard's toolbar, after use | [0076](adr/0076-the-window-on-every-screen.md) item 7 |

### Exit criterion

Decided by the maintainer on 2026-10-10: the phase ends when no task of
it is pending and the maintainer declares it ended. ADR 0073's conditions
on the work stand meanwhile: security in full before the first user who is
not the maintainer, and the threat model before the server is announced
(item 6).

---

## After Phase 2

No order and no deadline defined in the briefing. They enter the conversation
when Phase 2 closes: sync ([0020](adr/0020-sync-merge-in-core-transports-as-plugins.md)),
mobile ([0025](adr/0025-own-server-and-mobile-pwa.md)), plugins
([0016](adr/0016-plugins-execution-and-capabilities.md), with the questions in
[0047](adr/0047-plugin-api-open-questions.md) answered before the API is
designed), compatibility shim
([0017](adr/0017-plugins-format-shim-loading.md)), the primitives that are still
proposed ([0014](adr/0014-primitives-catalog.md)) and **agent writing with a
diff** ([0018](adr/0018-llm-native-mcp-in-core.md), `DECIDED`, with no phase
assigned: Phase 1 delivers read-only MCP and Phase 2 does not include it).
Also the **Windows and Linux apps** ([0022](adr/0022-target-platforms-macos-first.md)):
the maintainer decided on 2026-09-23 that both ship, Windows first, and on
2026-10-07 that Windows starts now, in Phase 2's scope and ahead of the rest
of its work ([0069](adr/0069-windows-port.md), the Phase 2 header above).
Linux stays here; how it would be built and tested is proposed in
[0071](adr/0071-linux-port.md), written on 2026-10-08 and waiting.
*(Shipped in 0.6.0-beta.1 on 2026-10-09, and the first item of Phase 3,
above.)*

Order among them: `[OPEN]`, but for Windows before Linux, and Linux before
the server. On 2026-10-09 the maintainer set Phase 3, to be written here when
Phase 2 closes, as the Linux app and then a self-hosted server, with sharing
and simultaneous editing as the focus if viable; how, and sync after the
server and through it, are proposed in
[0073](adr/0073-self-hosted-server-first.md). *(Phase 3 written on
2026-10-09, above, with 0073 accepted.)*

What stays after, since 2026-10-09: after the first release of the server,
in the order of 0073 item 12 — ~~sync for the desktop's local folders~~
*(built in the round right after that release, at the maintainer's word
of 2026-10-10, [0079](adr/0079-sync-a-local-folder-with-a-server.md) Source and Status; Phase 3 item 3.12, above)*, the
PWA offline, the user's bucket ([0073](adr/0073-self-hosted-server-first.md)
item 4) and a native mobile app if the browser's limits bite; and, with no
order, plugins, the compatibility shim, the primitives still proposed and
agent writing with a diff.
