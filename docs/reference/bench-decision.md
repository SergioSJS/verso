# Decision memo: the benchmark and the synthetic vault for feature 5 (shape, measurements, guardrail, harness, first baseline)

- Date: 2026-09-22
- Status: **not decided.** Nothing here is a decision: it lays out options,
  records facts and carries recommendations that are labelled as such. The
  maintainer decides (`CLAUDE.md` §1). Unlike the memos for features 2, 3, 4
  and 6, **no code was written under these recommendations**: feature 5 has not
  been started. The memo comes first on purpose, because what the benchmark
  measures is the part that is expensive to change afterwards — a baseline
  taken against the wrong shape has to be thrown away.
- **Decision: taken by the maintainer on 2026-09-22**, in session, in three
  words — *"pode fazer tudo"*: all five lines of section 9 as recommended. The
  ladder of 1 000 / 10 000 / 50 000 notes with the shape of section 2.5,
  including the 1 % of iCloud placeholders; the seven operations with wall
  time, peak RSS and index file size; one local command and one CI job on
  `main` only, Linux only, with the tolerances of section 4.3; a plain binary
  in `crates/verso-bench` with no benchmark dependency; and the baseline taken
  in the order of section 6.3, with
  [ADR 0039](../adr/0039-performance-targets.md) left `[OPEN]`. The code is
  Rust and therefore a Fable 5.1 session
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)); this memo stays the
  specification it writes against.
- **Revision, 2026-09-23**, after the Opus reading of the Phase 2 branch
  (`docs/review/phase-2.md`, reading 3, findings 11, 12 and 17). The CI job
  could not go red: only the Mac baseline is recorded (`macbook-pro-de-sergio`,
  commit `4712f85`), and a machine with no baseline passed by construction —
  the order of section 6.3, CI baseline first, was not followed.
  `verso-bench --require-baseline` now fails (exit 1) when the machine it names
  has no baseline, and prints the measured entries in the baseline file's own
  shape, ready to be pasted in; the job on `main` passes it, so `main` stays
  red until the `ci-linux` entries are recorded. The index size is now measured
  after the connection closes, with the `-wal` file folded in; the Mac
  baseline's three index sizes were taken the old way, 1 to 2 % low, inside
  the 1.05× tolerance. The test that compared single timing samples, and failed
  about one run in twenty, asserts only the index size.
- **Revision, 2026-09-24.** The `ci-linux` baseline is recorded: the 21
  entries the job printed on its first run on `main`, at the merge of PR #18
  (`05b9604`), pasted into `crates/verso-bench/baselines.json` with the
  maintainer's approval. From 50 000 notes: a fresh index in 50.2 s, an
  incremental pass with 1 % changed in 2.6 s, a common search in 65 ms,
  backlinks of the most-linked note in 0.9 s, peak memory under 37 MB, an
  index of 376 MB. The job on `main` is red from now on only for a regression
  past the tolerances of section 6.
- **Revision, 2026-10-10.** The `ci-linux` baseline is revised, with the
  maintainer's approval: the search by file name (verso-index schema 14)
  made a 1 000-note index 10 % larger (7.6 → 8.4 MB), past the 1.05×
  tolerance, and the watcher's two batch operations (roadmap 3.9) had no
  baseline. The index sizes come from the run on `main` at `e14b824`
  (0.7.0-beta.1); the times of the 21 earlier entries stay those of `05b9604`;
  the six new entries take the slower of two runs (`e14b824`, `49ac130`). A
  first try took every time from `e14b824`, a runner about 1.7× faster than
  the next one, and the next run was red on time for unchanged code: one run
  is no baseline for time on shared runners (section 6).
- Author: Opus 5 (documents, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Reviewer: Fable 5.1. In the earlier memos the recommendations were Fable
  5.1's, recorded by the author, because Fable was writing the feature's code in
  the same session. Here the code does not exist yet, so the recommendations in
  sections 2 to 6 are the **author's own** and Fable 5.1's reading may change
  them before any of it is written.
- Decides on: the benchmark row of
  [ADR 0029](../adr/0029-guardrails-in-ci.md) ("benchmark with a synthetic
  vault", Phase 1, feature 5) — what it runs, where it runs and what makes it
  red; the placement of the benchmark code against
  [ADR 0028](../adr/0028-crate-structure.md); and the
  [roadmap](../roadmap.md) line "bench: synthetic vault generator + baseline".
- **Does not decide** [ADR 0039](../adr/0039-performance-targets.md). That ADR
  says targets come *after* the first baseline; this memo produces the baseline
  that ADR 0039 is waiting for and leaves the targets `[OPEN]`. A memo that
  proposed numbers here would be inventing the decision ADR 0039 deliberately
  postponed.
- Sources read: [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md),
  [ADR 0022](../adr/0022-target-platforms-macos-first.md),
  [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0032](../adr/0032-author-and-reviewer-roles.md),
  [ADR 0034](../adr/0034-roadmap-in-phases.md),
  [ADR 0035](../adr/0035-cross-cutting-requirements.md),
  [ADR 0039](../adr/0039-performance-targets.md),
  [ADR 0043](../adr/0043-placeholder-guard.md),
  [ADR 0044](../adr/0044-verso-fs-semantics.md),
  [ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md), the
  [roadmap](../roadmap.md) Phase 1 table and exit criteria,
  [`docs/spec/dialect.md`](../spec/dialect.md) §4 and §9, and the four earlier
  memos ([`fs-decision.md`](fs-decision.md),
  [`index-decision.md`](index-decision.md),
  [`cli-decision.md`](cli-decision.md), [`mcp-decision.md`](mcp-decision.md)).
  Section 8 lists what was **not** verified.

---

## 1. What is being decided, and why now

Feature 5 is the one deliverable of Phase 1 that has not been started. Its
guardrail — "benchmark with a synthetic vault", against "performance
regression" — is a **feature** guardrail, so
[ADR 0029](../adr/0029-guardrails-in-ci.md) requires it to enter in the same PR
as the feature and to be **seen failing** before that PR merges. For a
benchmark, "seen failing" is not obvious, and that is the first thing this memo
has to pin down.

Three constraints frame every option below.

1. **No targets, by decision.**
   [ADR 0039](../adr/0039-performance-targets.md) says: measure first, promise
   later. Until targets exist, the benchmark detects *relative* regression
   against a recorded baseline, and the baseline is only comparable if the
   generator is **deterministic and versioned** — ADR 0039 says that in as many
   words.
2. **CI minutes are scarce, and that is recent and expensive knowledge.** On
   2026-09-22 a day of pushes to stacked branches spent the repository's whole
   monthly Actions quota; ADR 0029 now runs pull requests on Linux only and
   macOS only on `main`. A benchmark is the most expensive job a repository can
   run per commit. Any design that runs it on every push repeats the incident.
3. **The numbers are not meaningful yet.** The tokenizer
   ([ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md)) and the link
   resolution rule ([spec](../spec/dialect.md) §9, Q12) are **provisional**,
   pending the five answers of
   [`index-decision.md`](index-decision.md) §9. Both change how much work
   indexing does. The roadmap already says the tokenizer is decided "before
   feature 5 takes the baseline"; section 6 below says what follows from that.

There is also a fact from outside the plan: the code that would be measured
today has a known defect on the placeholder path (the Opus 5 reading of PR #15,
2026-09-22). A baseline taken from code with a known BLOCKING is a baseline
that will be retaken. Section 6 treats that as an ordering question, not as a
reason to delay the memo.

---

## 2. Decision 1 — the synthetic vault: shape, sizes, determinism

### 2.1 What the vault has to contain for the numbers to mean anything

The benchmark measures Verso's work, not the filesystem's. What makes the work
vary, in the order the code meets it:

| Property | Why it changes the measurement | Where it is felt |
|---|---|---|
| Number of notes | Dominates the walk and the per-note transaction | `verso-fs`, `verso-index` |
| Bytes per note | Dominates parsing and FTS5 tokenization | `verso-dialect`, FTS5 |
| Links per note | One row per link; resolution is a query per link at read time | `verso-index` |
| Share of unresolved targets | `unresolved()` groups over the whole table | `verso-index` |
| Depth and branching of folders | Directory entries per `read_dir`, depth cap (64, [ADR 0044](../adr/0044-verso-fs-semantics.md)) | `verso-fs` |
| Frontmatter present or absent | A second parser (YAML) per note | `verso-dialect` |
| Accented and non-ASCII text | Tokenizer work; NFC folding of keys | `verso-index` |
| Headings and `^id` blocks per note | Rows in `headings` and `blocks` | `verso-index` |
| Placeholders present | A different code path that never reads the file ([ADR 0043](../adr/0043-placeholder-guard.md)) | `verso-fs`, `verso-core` |

A generator that fixes all of these makes a vault that is *comparable across
runs* but not necessarily *like a real vault*. That is the right trade for a
regression detector: the vault does not have to be realistic, it has to be
**identical between two runs** and to exercise each path at a share that does
not hide a regression in it. Realism has exactly one job here — choosing the
sizes, which is why the maintainer's real vault is an input to decision 1 and
not to the rest.

### 2.2 Sizes, side by side

| Option | What it costs per run | What it catches | What it misses |
|---|---|---|---|
| (a) One size, 10 000 notes | ~3 s indexing on an M3 Max | A regression in the constant factor | Anything that only appears when a structure stops fitting in cache |
| (b) A ladder: 1 000 / 10 000 | ~4 s | The constant factor and a coarse slope | A quadratic term that only shows past 10 000 |
| (c) A ladder with a big step: 1 000 / 10 000 / 50 000 | Estimated tens of seconds and ~200 MB of temporary files, extrapolated, not measured | A change of complexity class, which is the regression that actually hurts | Nothing relevant to Phase 1 |
| (d) The maintainer's real vault | Free to write, impossible to compare | Nothing reproducible | It is not a benchmark; it is exit criterion 1 of the roadmap |

Two measured facts bear on this choice. First, on this machine the cost of
indexing is already non-trivial at 20 000 notes (section 3.4). Second, and more
important, **the run-to-run spread at 20 000 notes was ±45 %** on an idle
machine, same vault, same binary: 6.28 s, 9.83 s and 11.60 s for the same
operation. A ladder whose steps are closer together than the noise measures
nothing.

### 2.3 Determinism and versioning

[ADR 0039](../adr/0039-performance-targets.md) requires both words. Concretely,
a baseline is comparable only if all of these are fixed and recorded with it:

- the **seed** of the pseudo-random generator, and a generator whose sequence
  does not depend on the platform or on a dependency's version;
- a **generator version** number, bumped by hand whenever the shape changes,
  which invalidates every earlier baseline by construction;
- the **note count and shape parameters** (bytes, links, unresolved share,
  folder fan-out, frontmatter share, placeholder share);
- the **commit** of the code being measured, the **machine** and the **OS**.

The invalidation rule is the part that is easy to leave implicit and expensive
to get wrong: a baseline carries the generator version, and a run compares only
against a baseline with the same version. Otherwise a change to the vault's
shape silently shows up as a performance win or loss in the code.

### 2.4 Where the generator writes, and what the `std::fs` lint says about it

The generator writes tens of thousands of files. Invariant 5
([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)) confines access
to the files of the open folder to `verso-fs`, and the clippy
`disallowed_methods` list enforces it crate by crate. Four ways out:

| Option | How it stands against the invariant | Cost |
|---|---|---|
| (a) A bench crate with its own `clippy.toml`, declaring the exception | Same shape as the two exceptions that already exist (`verso-fs`, `verso-index`); the exception is written down and reviewable | One file, one paragraph of justification |
| (b) Generate through `tempfile`, as the CLI tests already do | No lint exception needed — `tempfile` is not `std::fs` | It passes the lint without declaring anything, which is the wrong reason to be legal |
| (c) Generate through `verso-fs`'s public API | Dogfoods the real write path | `Root::write` writes files, but nothing in the public API creates a directory, and file creation semantics are still `[OPEN]` ([ADR 0048](../adr/0048-file-operations-in-ui.md)); the generator would be measuring the atomic-write path it is supposed to be setting up for |
| (d) Generate outside Rust (a script) | No lint question at all | The generator stops being versioned with the code that consumes it, and CI needs a second toolchain |

Note that (a) is not a hole in invariant 5: the rule protects *the user's open
folder*, and the generator writes only into a temporary directory it created
itself. The honest way to have that is to say so in a `clippy.toml` comment, as
the other two crates do.

### 2.5 Recommendation of Opus 5 for decision 1

A **ladder of three sizes — 1 000 / 10 000 / 50 000 notes**, one shape,
generated by a **deterministic, versioned generator in its own crate** that
writes to a temporary directory and declares its `std::fs` exception in its own
`clippy.toml`.

Shape parameters, fixed for version 1 of the generator: ~4 KB per note, 6
paragraphs, YAML frontmatter with `tags` and `aliases` on every note, one `#`
heading and one `^id` block per note, 3 resolved wikilinks and 1 unresolved
target per note, accented pt-BR text throughout, a flat fan-out of 37 folders,
and — this is the one that is easy to forget — **a 1 % share of iCloud
placeholders**, so the path that ADR 0043 exists for is measured rather than
assumed.

The 50 000 step is the one that earns the ladder: it is the only step where a
change of complexity class shows up before a user finds it.

---

## 3. Decision 2 — what is measured and what is recorded

### 3.1 The candidate operations

| Operation | Why it is a candidate | Keep? |
|---|---|---|
| Fresh index of the whole vault | The dominant cost and the one a user waits for | Yes |
| Incremental index with nothing changed | What the second run costs; catches a regression in the stamp skip | Yes |
| Incremental index with 1 % of notes changed | The everyday case; distinguishes "reads everything again" from "reads what changed" | Yes |
| `search` for a common word | FTS5 query plus snippet | Yes |
| `search` for a rare word | Separates matching cost from snippet cost | Yes |
| `backlinks` of the most-linked note | The resolution query at its worst | Yes |
| `unresolved` over the whole vault | A group-by over every link row | Yes |
| Parse alone, without IO | Would isolate `verso-dialect` | No — feature 1's own tests cover the parser, and a second harness doubles the maintenance |
| Walk alone, without parsing | Would isolate `verso-fs` | Only if the fresh index regresses and the cause is unclear; not in version 1 |

### 3.2 The metrics

Wall-clock time is the number the user feels, and it is also the noisiest.
Three others cost almost nothing to record and are far more stable:

- **Peak resident memory** of the process. Stable across runs, and the number
  that decides whether a vault fits on a phone later (briefing §16.1).
- **Index file size** after the run. A pure function of the input and the
  schema; it changes only when the schema or the stored content changes, so a
  jump is a real signal with no noise at all.
- **Notes per second**, derived, so the three ladder steps are comparable to
  each other rather than only to their own history.

### 3.3 What a baseline file looks like, and where it lives

A machine-readable file next to the benchmark, versioned in git, one entry per
(generator version, size, operation), each carrying the value, the commit, the
machine and the OS. A human-readable summary in `docs/reference/` is what the
maintainer reads; the machine-readable file is what the next run compares
against.

The alternative — no committed baseline, comparing only against the previous
run on the same machine — costs nothing to build and catches nothing in CI,
since a fresh runner has no previous run.

### 3.4 A first measurement on today's code

Not a baseline: the generator does not exist yet, this vault was generated by a
throwaway script, and the code under it still has an open BLOCKING. It is here
because it sizes the decisions above. Apple M3 Max, macOS 26.6.2, rustc 1.98.1,
release build, `verso index` on a vault of notes of ~4 KB with frontmatter, 3
links and 1 unresolved target each, over 37 folders:

| Notes | Fresh index | Re-run, nothing changed | `search`, common word | `backlinks` | `unresolved` | Peak RSS | Vault | Index file |
|---|---|---|---|---|---|---|---|---|
| 1 000 | 0.28 s | 0.05 s | < 0.01 s | < 0.01 s | < 0.01 s | 5 MB | 4 MB | 2 MB |
| 5 000 | 1.22 s | 0.57 s | 0.01 s | 0.01 s | 0.03 s | 8 MB | 20 MB | 10 MB |
| 10 000 | 2.50 s | 1.27 s | — | — | — | — | — | — |
| 20 000 | 6.28 / 9.83 / 11.60 s | 2.67 / 2.68 / 3.64 s | 0.01 s | 0.05 s | 0.12 s | 14 MB | 79 MB | 37 MB |

Three readings of the table:

1. **Queries are not where the time is.** Search, backlinks and unresolved stay
   in the tens of milliseconds at 20 000 notes. Version 1 of the benchmark
   should record them, but the fresh index is what a regression will show up in.
2. **The spread at 20 000 notes is the finding.** The same command on the same
   vault took 6.28 s and 11.60 s. That spread is larger than most regressions
   worth catching, and it is what decision 3 has to be designed around — not a
   reason to distrust the numbers, but a measurement of how much control the
   harness has to impose (repetitions, warm-up, cache state) before a
   comparison means anything.
3. **Growth beyond 10 000 notes is not established.** 1 000 → 5 000 → 10 000 is
   close to linear (0.28, 1.22, 2.50 s). 10 000 → 20 000 is somewhere between
   2.5× and 4.6× for 2× the notes, and with that spread the honest statement is
   that the shape past 10 000 is unknown. Establishing it is exactly what
   feature 5 is for, and it is an argument for the 50 000 step.

### 3.5 Recommendation of Opus 5 for decision 2

The seven operations marked "Yes" in section 3.1, each recorded with **wall
time, peak RSS and index file size**, plus derived notes per second; a
versioned JSON baseline next to the benchmark and a human summary table in
`docs/reference/`; and no measurement of the parser or the walk in isolation
until a regression makes one necessary.

---

## 4. Decision 3 — how it runs, and what makes it a guardrail

### 4.1 What "seen failing" means for a benchmark

[ADR 0029](../adr/0029-guardrails-in-ci.md) says every feature guardrail is
seen failing in the PR that introduces it. For fuzzing that means a crash; for
the atomic write, a truncated file. For a benchmark the equivalent is: a
deliberate slowdown is introduced, the comparison marks it red, and the red run
is recorded in the PR. The slowdown has to be of the kind the guardrail exists
to catch — an accidental O(N²), not a `sleep`. The most faithful one available
is already known: reverting the `notes_fts` delete to the full scan it had
before commit `ca7bdd8` made 4 000 notes take 4.94 s instead of 0.71 s. That is
a real regression of the exact shape a user would hit, it is one revert away,
and it belongs in the feature 5 PR as the recorded red run.

### 4.2 Where it runs

| Option | Cost per month | What it catches | Risk |
|---|---|---|---|
| (a) Locally on demand, never in CI | Zero | Whatever the author remembers to run | A regression merges on a day nobody ran it |
| (b) CI on `main` after each merge, Linux only | One job per merge; the minutes are not measured (section 8) | Every regression, one merge late | Bisecting is per merge, not per PR |
| (c) CI on every PR | The incident of 2026-09-22, again | Regressions before merge | Cost, and noise on shared runners |
| (d) CI on `main` **and** a local command with the same output | Same as (b) | Same as (b), plus the author can check before pushing | None beyond (b) |

The shared-runner noise deserves its own line: the ±45 % spread of section 3.4
was measured on a quiet laptop. A GitHub-hosted runner is a shared virtual
machine with no such quiet, so a CI comparison has to use a tolerance wide
enough to survive it or it will cry wolf until someone turns it off — which
[ADR 0029](../adr/0029-guardrails-in-ci.md) forbids as a remedy.

### 4.3 Tolerance and noise

Three things reduce noise before tolerance has to absorb it: several
repetitions with the **median** reported rather than the mean, a warm-up run
that is discarded, and a vault regenerated fresh for each repetition so the
page cache state is the same. What is left is absorbed by a tolerance, and
`index file size` — which has no noise at all — can carry a much tighter one
than time.

Proposed shape: time regresses the build when the median is more than **1.5×**
the baseline; index size, more than **1.05×**; peak RSS, more than **1.3×**. A
number tighter than the measured noise is a number that will be ignored.

### 4.4 Recommendation of Opus 5 for decision 3

Option (d): `cargo bench`-equivalent runnable locally with one command, and one
CI job on `main` only, Linux only, after each merge — never on a pull request.
Tolerances as in 4.3, with the recorded red run of 4.1 in the feature 5 PR.

---

## 5. Decision 4 — the harness and where the code lives

### 5.1 The harness, side by side

Checked on crates.io on 2026-09-22:

| Option | Version | Licence | Normal dependencies | What it gives | What it costs |
|---|---|---|---|---|---|
| (a) No harness: a plain binary with `Instant` | — | — | none | Full control of warm-up, repetitions, the vault's life cycle and the output format | Everything is written by hand, including the statistics |
| (b) `divan` | 0.1.21 | MIT OR Apache-2.0 | 6 (`cfg-if`, `clap`, `condtype`, `divan-macros`, `libc`, `regex-lite`) | Attribute-driven benchmarks, warm-up and repetitions handled | Its model is "measure a function", and what we measure is a whole process over a vault |
| (c) `criterion` | 0.8.2 | Apache-2.0 OR MIT | 21, several optional (`clap`, `ciborium`, `itertools`, `regex`, `serde`, `serde_json`, `tinytemplate`, `walkdir`, `oorandom`, `plotters`(opt), `rayon`(opt), …) | Statistics, its own baseline storage, HTML reports | The heaviest dependency in the tree for a repository that has five small crates; its baselines live outside git by default |

All three licences pass the allowlist in `deny.toml`.

The deciding question is not the statistics: it is that what we measure is
**setup-heavy** (generate a 50 000-note vault, index it, measure, throw it
away), and both harnesses are built around measuring a cheap function many
times. A plain binary that generates once per size, runs each operation N times
and prints a JSON line fits the problem shape with no dependency at all.

### 5.2 Where the code lives

[ADR 0028](../adr/0028-crate-structure.md) fixes five crates, and says a new
dependency needs justification in the PR. It says nothing about a sixth crate,
and a benchmark is not part of the product.

| Option | Against ADR 0028 | Notes |
|---|---|---|
| (a) `crates/verso-bench`, `publish = false` | Adds a crate to a structure the ADR draws with five | It is the only placement where the `clippy.toml` exception of section 2.4 is scoped to the benchmark and touches nothing else |
| (b) `benches/` inside `verso-cli` | No new crate | The exception would widen `verso-cli`'s own lint, which is the crate that must not touch the folder |
| (c) A `xtask`-style binary in the workspace | No new product crate | Same as (a) in practice, with a less obvious name |

### 5.3 Recommendation of Opus 5 for decision 4

(a) plus (a): a **plain binary with no benchmark harness dependency**, in a new
**`crates/verso-bench`** with `publish = false`, carrying its own `clippy.toml`
that declares why it may write files. If the statistics later prove to be worth
a dependency, `divan` is the one to add — six dependencies, and its model fits
better than `criterion`'s at a quarter of the weight.

---

## 6. Decision 5 — when the first baseline is taken, and on what machine

### 6.1 What has to be true before a baseline is worth recording

1. The **tokenizer** is decided ([ADR 0046](../adr/0046-index-location-lifecycle-tokenizer.md),
   and the roadmap says "before feature 5 takes the baseline"): it changes FTS5's
   work per note.
2. The **link resolution rule** is decided (spec Q12): it changes the query per
   link.
3. The **open BLOCKING** of PR #15 is fixed: a baseline taken from code that
   fails on the placeholder path would have to be retaken anyway, and the
   recommended vault of section 2.5 contains placeholders on purpose.

Items 1 and 2 are the five lines the maintainer owes on
[`index-decision.md`](index-decision.md) §9. **The benchmark can be written
before them; only the recorded baseline has to wait.** That ordering is what
lets feature 5 start now.

### 6.2 The machine

A baseline is a property of a machine, not of the code. Two are relevant: the
maintainer's Mac, which is where the numbers mean something to a user, and the
Linux CI runner, which is where the comparison runs automatically. They are not
comparable to each other, so there are two baselines, each named, and neither
is ever compared against the other.

### 6.3 Recommendation of Opus 5 for decision 5

Write the benchmark and the generator now; record the CI baseline in the
feature 5 PR, since it costs one job on `main`; record the Mac baseline in the
first PR after the tokenizer and resolution answers land and the PR #15
BLOCKING is fixed, as a documentation-only commit. Both baselines carry the
generator version, the commit, the machine and the OS, and neither one closes
[ADR 0039](../adr/0039-performance-targets.md).

---

## 7. Not for decision here

- **Performance targets.** [ADR 0039](../adr/0039-performance-targets.md) stays
  `[OPEN]` until a baseline exists. This memo deliberately proposes no number
  as a target; the tolerances of section 4.3 are regression thresholds against
  a baseline, which is a different thing and does not become a promise to
  anyone.
- **The phone.** The pain recorded in the briefing (§16.1) is a large vault on
  an iPhone. Mobile is out of scope until the end of Phase 2
  ([ADR 0034](../adr/0034-roadmap-in-phases.md)), so peak RSS is recorded now
  and nothing is concluded from it yet.
- **Comparing against Obsidian.** Timing the other app from the outside would
  be admissible ([ADR 0009](../adr/0009-external-constraints.md) forbids
  inspecting it, not using it), but a comparison against a different feature set
  is not a regression detector, and it is not what ADR 0039 asked for.
- **The watcher.** Incremental indexing driven by a file-system watcher is not
  in Phase 1; when it arrives it brings its own measurements.
- **Multi-root workspaces** ([ADR 0041](../adr/0041-multi-root-workspace.md)):
  one root per run in version 1 of the generator.

---

## 8. What this memo did not verify

- **The 50 000-note step was not measured.** The largest vault actually run was
  20 000 notes. The cost of the 50 000 step is an estimate from the table in
  section 3.4, and if it turns out to take minutes rather than tens of seconds,
  decision 1 is the one to revisit.
- **No measurement on Linux.** Every number here is from one Apple M3 Max. The
  CI runner's numbers and its noise are unknown, and section 4.3's tolerances
  are therefore derived from laptop noise, not runner noise.
- **The placeholder share was not measured at all.** The vault used in section
  3.4 has no placeholders, because the code path they exercise is the one with
  the open BLOCKING.
- **`divan` and `criterion` were not tried.** Their versions, licences and
  dependency counts come from crates.io metadata read on 2026-09-22, not from a
  build.
- **Nothing was measured about memory beyond peak RSS**, and peak RSS was read
  from `/usr/bin/time -l`, which reports the process maximum and says nothing
  about where it was spent.
- **The generator's shape was not validated against the maintainer's real
  vault**, whose size, note length and link density are unknown to this memo.
  That is the one input a decision on section 2.2 should have and does not.

---

## 9. How the maintainer decides and verifies, without reading code

**Check that the memo is what the PR says it is:**

```
git fetch origin && git checkout phase1/bench-decision
git diff --stat origin/main..HEAD          # two files under docs/, no fixtures/, no crates/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # unchanged fixtures still pass the lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # author and Signed-off-by are yours
```

**Reproduce the measurement of section 3.4**, if you want the numbers to be
yours rather than the memo's: generate a vault of N notes with any script, run
`verso index <folder>` twice with `/usr/bin/time -p`, and compare the two
numbers with the table. The point of the exercise is the spread, not the
absolute value — run the 20 000 case three times and see the third number
differ from the first by nearly half.

**Decide, in five lines on the PR:**

1. **The vault.** Opus 5 recommends *a ladder of 1 000 / 10 000 / 50 000 notes,
   one fixed shape (~4 KB per note, frontmatter, one heading, one `^id`, three
   resolved links, one unresolved target, accented pt-BR text, 37 folders, 1 %
   iCloud placeholders), generated deterministically from a recorded seed by a
   versioned generator*.
2. **What is measured.** Opus 5 recommends *the seven operations of section
   3.1, each with wall time, peak RSS and index file size, plus derived notes
   per second; a versioned JSON baseline in the repository and a human summary
   under `docs/reference/`*.
3. **Where it runs.** Opus 5 recommends *one command locally and one CI job on
   `main` only, Linux only, after each merge — never on a pull request
   (cost, ADR 0029); tolerances 1.5× for time, 1.05× for index size, 1.3× for
   peak RSS, over the median of repeated runs*.
4. **The harness and its home.** Opus 5 recommends *no benchmark dependency: a
   plain binary in a new `crates/verso-bench` (`publish = false`) with its own
   `clippy.toml` declaring the `std::fs` exception; `divan` as the fallback if
   statistics later justify a dependency*.
5. **When the baseline is taken.** Opus 5 recommends *writing the benchmark
   now, recording the Linux baseline in the feature 5 PR, and recording the Mac
   baseline only after the tokenizer and resolution answers and the PR #15
   BLOCKING fix — with [ADR 0039](../adr/0039-performance-targets.md) left
   `[OPEN]`*.

**What the closing PR records, if the recommendations are accepted:** ADR 0029
gains the benchmark row's detail (what runs, where, which tolerances); ADR 0028
gains the sixth, non-product crate with its justification; the roadmap's
feature 5 line gains its verification; and ADR 0039 gains a line saying the
baseline now exists and the targets are still open.
