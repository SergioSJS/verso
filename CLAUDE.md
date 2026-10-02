# CLAUDE.md — Verso

Instructions for any AI session working in this repository.

Source of everything here: `docs/BRIEFING.md` and `docs/adr/`. This page creates
no new rule; it concentrates what has already been decided, in the form in which
it has to be obeyed. If anything here has no Accepted ADR behind it, that is a
review finding.

**The maintainer is the final authority.** The AI writes; the maintainer decides.

---

## 1. Rule zero: do not invent decisions

1. Nothing that is not in the briefing or in an ADR becomes a decision. When in
   doubt, record it as `[OPEN]` and ask.
2. Do not promote `PROPOSED` to `DECIDED`, and do not close an `[OPEN]`. Only
   the maintainer does that.
3. On finding a contradiction between documents, record the contradiction in the
   PR; do not pick a side.
4. A "discarded" alternative is only recorded if someone actually considered it.
   Without that: "None recorded".

---

## 2. Invariants

Violating an invariant is BLOCKING by definition, with no discussion of merit.

### 2.1 Architecture — [ADR 0026](docs/adr/0026-core-ui-contract-inviolable-rules.md)

1. The UI only talks to the core through the contract. No shortcuts.
2. The UI does not assume which side of the wire the core is on; latency and
   availability come from the capabilities.
3. The contract is defined first; TS types are generated from Rust, never
   written by hand.
4. The filesystem API **of the contract** (UI, plugins, MCP) separates access
   from identity ([ADR 0026](docs/adr/0026-core-ui-contract-inviolable-rules.md),
   amended 2026-09-22): a capability to read or write a file crosses only as an
   opaque handle; a note is named by its path relative to the open folder. An
   absolute path, or one containing `..`, never crosses. A path as a string
   also exists at the entry edge (CLI argument, config key) and inside
   `verso-fs`.
5. Access to the **files of the open folder** only inside the `verso-fs` crate.
   The index file (`verso-index`), the configuration directory (`verso-core`)
   and the CLI's input and output are outside the rule; none of them touches the
   open folder. `verso-dialect` has no IO at all.
6. Plugins never access disk directly.

### 2.2 Data — [ADR 0012](docs/adr/0012-files-are-source-of-truth.md), [ADR 0043](docs/adr/0043-placeholder-guard.md)

7. Opening a file never rewrites it. No silent normalization of frontmatter,
   line endings or spacing on the read path.
8. Conversion only by user action, with a visible diff. This also applies to
   writing by an agent.
9. Writing to disk is atomic: temporary file, `fsync` of the file and of the
   directory, `rename` — with the requirements of
   [ADR 0029](docs/adr/0029-guardrails-in-ci.md).
10. A placeholder file from on-demand storage is never interpreted as a
    deletion ([ADR 0043](docs/adr/0043-placeholder-guard.md)).
11. Every write checks that the file on disk is the one that was read (mtime and
    size, or hash). If it changed, it does not write without showing the diff.
    This applies to the UI, to the agent and to conversion.

### 2.3 Dialect — [ADR 0030](docs/adr/0030-base-dialect-obsidian-compatible.md)

12. Verso extends the Obsidian dialect; it never contradicts it. No extension
    changes the meaning of an existing construct.
13. Admissible sources on Obsidian's behavior: the public API
    (`obsidian.d.ts`, MIT), public documentation and behavior observed from the
    outside. Inspecting, decompiling or unminifying the app is **forbidden**
    ([ADR 0009](docs/adr/0009-external-constraints.md)).

### 2.4 Fixtures — [ADR 0031](docs/adr/0031-fixtures-as-contract.md)

14. **Never change `fixtures/**/expected.yaml` without the maintainer's explicit
    approval.** If the code disagrees with the fixture, the code is wrong until
    the maintainer says otherwise. If the fixture looks wrong: **stop, do not
    edit, ask** — in a PR comment or in the session, pointing out the case and
    why the expectation looks incorrect.
15. Any fixture may be drafted by the AI; none is valid before the maintainer
    approves it in the PR that adds it. A draft says so on the first line of
    its `expected.yaml`.
16. `input.md` does not change on its own either: changing the input changes the
    contract.
17. A fixture follows the schema in `docs/spec/dialect.md` §4. A fixture that
    answers an `[OPEN]` question of the spec only enters in the PR that closes
    the question, with section 9 of the spec updated in the same PR. A fixture
    of behavior compatible with Obsidian records in `observed:` how it was
    verified.

### 2.5 Scope — [ADR 0034](docs/adr/0034-roadmap-in-phases.md)

18. Out of scope until the end of Phase 2: sync, mobile, plugins and the
    compatibility shim. Do not implement "since it is cheap". The board
    entered Phase 2 on 2026-09-30
    ([ADR 0057](docs/adr/0057-board-json-canvas.md)).
19. Phase 1 has no UI. Phase 0 has no feature at all.

---

## 3. Guardrails

Two groups ([ADR 0029](docs/adr/0029-guardrails-in-ci.md)). The **workspace**
ones enter CI in Phase 0, with empty crates, before the first line of product
logic. The **feature** ones enter in the same PR as the feature they protect,
never later, and each one is seen failing before the PR is merged. None of them
may be turned off, worked around with a local `#[allow]` or "solved" by changing
the test.

| Guardrail | Prevents | Group |
|---|---|---|
| `cargo fmt --check` | a formatting diff hiding a logic diff | workspace |
| `unsafe_code = "forbid"` via `[workspace.lints]` | memory corruption | workspace |
| clippy with `-D warnings`; `unwrap_used` and `expect_used` denied, allowed only in tests | a panic taking the app down | workspace |
| clippy `disallowed_methods` denying `std::fs` outside `verso-fs` (exceptions: index, config) | access to the open folder outside `verso-fs` | workspace |
| `cargo-deny`: license allowlist, advisories denied | incompatible or vulnerable dependency | workspace |
| Documentation mirror: every canonical `.md` has a twin in `docs/pt-BR/` with the same headings | a document changed in one language only | workspace |
| Parser fuzzing with `cargo-fuzz`, the canvas reader beside it | a malformed file hanging the app | feature 1; the canvas reader with the board |
| Round-trip property test (reading decided in Q18) | opening rewriting a file | feature 1 |
| `cargo check --target wasm32-unknown-unknown -p verso-dialect` | the parser ceasing to compile to WASM | feature 1 |
| Atomic write (temporary + `fsync` of the file and of the directory + `rename`, plus the ADR's requirements) | corruption on power loss | feature 2 |
| Path confinement in the adapter | a plugin or agent leaving the folder via `../` or a symlink | feature 2 |
| Parameterized queries + escaping of the FTS5 syntax | search breaking with quotes and operators | feature 3 |
| Benchmark with a synthetic vault | performance regression | feature 5 |
| Generated TS types checked in CI | rule 3 of the contract becoming a convention | Phase 2, 2.1 |
| npm license allowlist over the window's lockfile | an npm package under a license the project cannot ship | Phase 2 |
| The window's unit tests (`npm test` in `app/ui`) | the board's model changing what it writes unnoticed | the board |
| The demo vault built from its sources and holding together | a stale embed, a board edited by hand, a tutorial that no longer holds | the tutorial |

CI ([ADR 0029](docs/adr/0029-guardrails-in-ci.md), 2026-09-23): a pull
request runs every guardrail but the fuzzing in one Linux job; `main` adds
clippy and the tests on macOS, the fuzzing and the benchmark; the window's
end-to-end tests run only locally, in `scripts/check.sh`
([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)); the apps are
built and packaged only for a new version reaching `main`, never on a branch. Before any push,
`scripts/check.sh` and `scripts/check-linux.sh` pass locally (README.md): CI
confirms, it is never the first test.

If a guardrail blocks legitimate work, that is the subject of its own PR, with
justification — not of an `#[allow]` in the middle of the diff. A subprocess
that does work a list denies (`Command::new("readlink")` where
`std::fs::read_link` is denied) is the same violation as calling the denied
API, and a crate's own `clippy.toml` that drops entries of the list is an
exception to declare, not configuration
([ADR 0029](docs/adr/0029-guardrails-in-ci.md), 2026-09-29). A new advisory
only gets an exception in `deny.toml` with justification, link and expiration
date.

### Crate structure — [ADR 0028](docs/adr/0028-crate-structure.md)

```
crates/
├── verso-dialect   # pure parser: no IO, no async
├── verso-index     # SQLite/FTS5, graph
├── verso-fs        # opaque handles, watcher, atomic write, confinement
├── verso-core      # orchestrates and exposes the contract
└── verso-cli       # index, search, backlinks, mcp
```

`verso-dialect` gains no IO or async dependency. `verso-fs` is the only crate
that touches the files of the open folder; `verso-index` opens only the index
file and `verso-core` only the config. A new dependency requires justification
in the PR.

Besides the five, the workspace holds `crates/verso-contract` (the contract's
types, no IO), `crates/verso-bench` (the benchmark, never shipped) and
`app/src-tauri` (the Phase 2 desktop host, which reaches the notes only
through `verso-core`) — ADR 0028, Consequences.

---

## 4. PR workflow — [ADR 0033](docs/adr/0033-pr-workflow.md)

### Before writing code

1. Read the relevant ADR. It does not exist: write the ADR first, or ask.
2. Check whether the needed decision is `[OPEN]`. It is: ask, do not choose.
3. Confirm that the work fits the current phase of `docs/roadmap.md`.

### The PR

- **Large until the whole flow exists; small after.** Until sync, the web and
  mobile exist, work goes in large pull requests — do not ask for one to be
  split into small ones. After that: small, one subject; if the summary needs
  an "and", it is probably two PRs ([ADR 0033](docs/adr/0033-pr-workflow.md)
  and [ADR 0051](docs/adr/0051-development-flow-and-releases.md), revised on
  2026-09-24).
- Uses `.github/pull_request_template.md`, with the five sections filled in:
  What / Why / Discarded alternatives / How to verify / Rust concept used.
- "Rust concept used" is explained for someone who is learning Rust. It is not a
  formality: it is the channel through which the maintainer understands what they
  is approving.
- New dependency: justify it, say what it replaces in our own code and confirm
  that the license passes `cargo-deny`.
- A parser feature comes with a fixture. A new fixture comes marked as an AI
  draft, for approval.
- A branch from `main`, named `feat/…`, `fix/…`, `docs/…` or `chore/…`; until
  the whole flow exists it may carry several subjects, then one short branch
  per subject. `main` is protected and takes pull requests only — never push
  to it ([ADR 0051](docs/adr/0051-development-flow-and-releases.md)).
- A change a user can see adds its line under "Unreleased" in `CHANGELOG.md`
  and in `docs/pt-BR/CHANGELOG.md`.
- A change a user can see also updates the tutorial, the demo vault
  ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)): a note that teaches
  it, a card or a line on "Tour do Verso", and, for the board, a lesson or a
  step of "Treino do Board". The tutorial's two boards are built from `scripts/demo-vault/`
  with `node scripts/demo-vault.mjs build`, never edited in the app; a key
  the tutorial teaches is checked against Excalidraw's key tests and the
  window's bindings; and the tutorial is followed before the PR — the steps
  of
  [`docs/reference/demo-vault-walkthrough.md`](docs/reference/demo-vault-walkthrough.md),
  to which the feature adds its own. A step runs by machine in the browser
  harness when it can (`npm run e2e` in `app/ui`; `scripts/check.sh` runs it
  too), with its test in `app/ui/e2e/`; a new command of the contract gets
  its answer in the harness (`app/ui/src/harness/`); what the harness cannot
  reach is followed in the app, with the app's log open.

### Review

Findings classified in three levels:

| Level | Meaning |
|---|---|
| BLOCKING | Violates an invariant, guardrail or decision; or loses data. Blocks merge |
| IMPORTANT | Must be resolved, or explicitly deferred with a record |
| MINOR | Left to the author's discretion |

### Merge

Only with all three:

1. Green CI.
2. No open BLOCKING.
3. The maintainer can explain the PR in their own words.

Item 3 is subjective on purpose. A PR the maintainer cannot explain is a PR that
is too big or too poorly described, even with green CI. It is also the condition
for signing: code written by AI comes in through the ordinary DCO, and whoever
signs the `Signed-off-by` declares that they have command of the code and answer
for it ([ADR 0006](docs/adr/0006-contribution-dco-no-cla.md)). There is no
signature by the AI.

The maintainer merges, with a merge commit — never squash or rebase: the
documents cite commits by hash ([ADR 0051](docs/adr/0051-development-flow-and-releases.md)).

### Versions

A version is cut **only when the maintainer asks**, and then an agent may cut
it: `node scripts/release.mjs prepare X.Y.Z[-beta.N]`, on the branch of the
pull request that releases, sets the version and moves the changelog in one
commit of that pull request; its merge into `main` builds, publishes and tags
the release ([ADR 0051](docs/adr/0051-development-flow-and-releases.md),
revised 2026-10-02). `-beta.N` is a test release. A version tag is pushed by
hand (`release.mjs tag`) only when that path could not tag; version tags are
permanent — no one can move or delete one.

---

## 5. Author / reviewer split — [ADR 0032](docs/adr/0032-author-and-reviewer-roles.md)

| Artifact | Author | Reviewer |
|---|---|---|
| Documents (ADR, spec, roadmap, `CLAUDE.md`) | Opus 5 | Fable 5.1 |
| Core code (Rust) | Fable 5.1 | Opus 5 |
| UI and TypeScript | Opus 5 | Fable 5.1 |
| Behavior (fixtures) and decisions; final authority | — | the maintainer |

Rules:

- **Author and reviewer always in separate sessions.** The reviewer does not see
  the author's reasoning: it receives the diff and the repository, never the
  session transcript.
- Whoever wrote does not review what they wrote. "Whoever" is the **model**, not
  the session: the model that wrote an artifact does not review it, neither in
  the same session nor in another one.
- If the maintainer tells the reviewer to apply its own findings, the reviewer
  becomes the author of that diff, and the diff needs a reading by the other
  model before the merge.
- The maintainer reviews **behavior**, through the fixtures, and questions
  decisions. They are learning Rust outside the project; no PR may depend on them
  reading Rust to be approved.

### If you are the author

Declare in the PR what you assumed. Finish by writing how to verify without
reading the code.

### If you are the reviewer

Do not ask for access to the author's session. Do not widen the PR's scope.
Classify every finding as BLOCKING, IMPORTANT or MINOR.

---

## 6. When to stop and ask

Stopping is the correct behavior, not a failure:

- A fixture looks wrong.
- The needed decision is `PROPOSED` or `[OPEN]`.
- Two documents contradict each other.
- The work requires violating an invariant or turning off a guardrail.
- The work is outside the current phase of the roadmap.
- The solution would require knowing how Obsidian works on the inside
  ([ADR 0009](docs/adr/0009-external-constraints.md)).

---

## 7. Repository map

| Path | What it is |
|---|---|
| `docs/BRIEFING.md` | Single source of the decisions that predate the repository |
| `docs/adr/` | One record per decision. [Index](docs/adr/README.md) |
| `docs/spec/dialect.md` | Dialect behavior, with the gaps marked `[OPEN]` |
| `docs/roadmap.md` | Phases 0, 1 and 2, with a verifiable exit criterion |
| `docs/review/` | Critical reviews per phase, with classified findings and the resolution of each one |
| `docs/reference/` | Reference notes on external tools and behaviour observed from outside, such as the Obsidian CLI ([ADR 0009](docs/adr/0009-external-constraints.md)) |
| `docs/pt-BR/` | pt-BR mirror of all the documentation, same structure and names ([ADR 0008](docs/adr/0008-documentation-language.md)) |
| `fixtures/` | Behavior contract. `expected.yaml` is untouchable without approval; schema in `docs/spec/dialect.md` §4 |
| `crates/` | The five crates of the core, plus the contract's types and the benchmark |
| `app/` | The Phase 2 window: the Tauri host (`app/src-tauri`) and the UI (`app/ui`) |
| `demo-vault/` | The demo vault, the product's tutorial ([ADR 0058](docs/adr/0058-demo-vault-as-tutorial.md)); its boards are built by `scripts/demo-vault.mjs` |
| `.github/pull_request_template.md` | The five mandatory sections of the PR |

## 8. Language

Decided ([ADR 0008](docs/adr/0008-documentation-language.md)): **English is the
source, pt-BR is the mirror.** Every document is born in English at the
canonical path and has a twin in `docs/pt-BR/`, same structure, same file name.
A PR that changes one side changes the other, or it does not merge. Exception:
`docs/BRIEFING.md`, whose pt-BR original in `docs/pt-BR/BRIEFING.md` prevails.
Commits, PRs and issues in English.

The product is pt-BR and EN from the first commit of code — that is decided
([ADR 0035](docs/adr/0035-cross-cutting-requirements.md)) and is a different
matter.
