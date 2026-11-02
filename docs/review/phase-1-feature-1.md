# Critical review — Phase 1, feature 1 (`verso-dialect`)

- Date: 2026-09-21
- Reviewer: Opus 5, in the role of core Rust reviewer ([ADR 0032](../adr/0032-author-and-reviewer-roles.md))
- Author of the code under review: Fable 5.1 ([ADR 0032](../adr/0032-author-and-reviewer-roles.md))
- Input: four readings, each in its own session, of the diff and of the repository, without access to the author's session — PR #7 (merge `e5a0a8d`), then the follow-up commits `ed35552`, `8ce1b01` and `26d744c` on the branch `phase1/dialect-review`.
- Roadmap item: Phase 1, feature 1 — `verso-dialect`, parsing of links, blocks, headings and frontmatter ([`../roadmap.md`](../roadmap.md)).
- State: every BLOCKING finding of the four readings is resolved in code, and
  the fourth reading found none: its verdict is that the branch may merge as the
  resolution of the original review. Six items were raised as **pending the
  maintainer** and are listed in section 6; none of them is decided by this
  review. On 2026-09-21 the maintainer decided five of them — the two numbers of
  Q17 (item 1), the two defects of `pulldown-cmark` 0.13.4 (item 2), the
  contradiction inside spec §4.1 (item 3), the `^id` at the end of a list item
  (item 5) and the gap in what CI announces (item 6) — and each stays in the
  list marked as decided, with the decision recorded in
  [`../spec/dialect.md`](../spec/dialect.md) (§4.1, §5.7, §9) or under
  Consequences of [ADR 0037](../adr/0037-base-parser.md). Item 4 is still
  pending. Q17 is closed only in its frontmatter part: file size, line length
  and the Markdown side stay `[OPEN]`; Q3 only for the end of a paragraph and
  of a list item. Nothing in this document changes that ADR's Status or
  Decision.

## How to read

Each reading is a section, with its findings in the order and with the
classification the reading gave them. The "Resolution" column says where the
finding was fixed, or that it was kept and why, or that it is the maintainer's.
No finding proposes a decision: where a decision is needed, the row says what
needs to be decided.

| Level | Meaning ([ADR 0033](../adr/0033-pr-workflow.md)) |
|---|---|
| BLOCKING | Violates an invariant, guardrail or decision; or loses data. Blocks merge |
| IMPORTANT | Must be resolved, or explicitly deferred with a record |
| MINOR | At the author's discretion |

## Summary

| Reading | Input | BLOCKING | IMPORTANT | MINOR |
|---|---|---|---|---|
| 1 | PR #7, merge `e5a0a8d` | 1 | 5 | 8 |
| 2 | `ed35552` | 3 | 2 | 3 |
| 3 | `8ce1b01` | 1 | 3 | 5 |
| 4 | `26d744c` | 0 | 2 | 5 |

The BLOCKING findings are all one shape: something that was supposed to be
bounded was not, or a guardrail that was supposed to be able to fail could not.
The fourth reading found none, and both of its IMPORTANT findings come from the
fuzz guardrail finally running. Three of the six items that survive into
section 6 are questions the spec already marks `[OPEN]`; the others are a
contradiction inside the spec, two defects of the base parser, and a gap in what
CI announces.

---

## 1. First reading — PR #7 (merge `e5a0a8d`)

The PR turns the empty crate into a read-only extractor: `parse(&str) ->
Document` runs `pulldown-cmark` with `ENABLE_WIKILINKS` and
`ENABLE_YAML_STYLE_METADATA_BLOCKS` ([ADR 0037](../adr/0037-base-parser.md)),
re-checks each event's byte range against the raw source, and reports wikilinks,
embeds, ATX headings, `^id`, callouts and the frontmatter block, each with a
byte span and a position in line and Unicode character column. Around it come
the three feature guardrails of this feature ([ADR 0029](../adr/0029-guardrails-in-ci.md)),
a fixture harness and six AI-draft fixtures.

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKING | A frontmatter of about 4 000 nested block sequences (an 8 KB note) overflows the stack inside the YAML loading driver and aborts the process with `SIGABRT` — not a panic, so nothing upstream can catch it. It breaks Q18 property 1, "`parse` returns for every input", which is `DECIDED` | **Fixed** in `ed35552`, completed in `8ce1b01` and `26d744c`. The nesting is bounded on `saphyr-parser`'s event stream, before any tree exists; over the limit the frontmatter is reported with its span and `values` as an error, and the body is still parsed. Seen failing: with the check disabled the new test aborts. The *numbers* are Q17 and are the maintainer's (section 6, item 1) |
| 2 | IMPORTANT | The fuzz guardrail structurally could not find finding 1: `-max_len=4096`, and the crashing input needs about 8 KB | **Fixed** in `ed35552`. `-max_len=65536 -timeout=20`, versioned seeds in `fuzz/seeds/`, and a regression test in `crates/verso-dialect/tests/regressions.rs` |
| 3 | IMPORTANT | The PR's "what was assumed" table does not match the code for `^id`: an `^id` alone after a blank line **is** reported; one at the end of a tight list item is **not** | **Fixed** in `ed35552`, in the doc of the recognizer and in the PR's table. Q3 stays `[OPEN]` and nothing was implemented either way (section 6, item 5) |
| 4 | IMPORTANT | The fixture harness rejects `syntax: wikilink`, which spec §4.2 says may be omitted | **Fixed** in `ed35552`. `wikilink` and omitting it are the same assertion; `markdown` fails with a message pointing at Q20 |
| 5 | IMPORTANT | The harness silently picks a side in a contradiction inside spec §4.1 | **Recorded, not resolved.** The maintainer's (section 6, item 3). `CLAUDE.md` §1 rule 3 forbids picking a side |
| 6 | IMPORTANT | The `wasm` and `fuzz` jobs run on Linux only; [ADR 0029](../adr/0029-guardrails-in-ci.md) says the feature guardrails run on macOS and Linux | **Fixed** in `ed35552`. Both jobs run the two-OS matrix |
| 7 | MINOR | `LineIndex::pos`'s doc comment does not describe what the code does (the fallback is `col = 1`, not a count) | **Fixed** in `ed35552` (comment) |
| 8 | MINOR | `---\n---\n` and a frontmatter closed by `...` both give `frontmatter: None`, undeclared; a metadata block at offset 0 that is rejected is indistinguishable from "no frontmatter" | **Recorded** in the PR's assumptions table; behaviour unchanged, it is Q24 |
| 9 | MINOR | Q15 is answered in code (tables, footnotes, task lists, strikethrough, math and highlight are all off) without being declared | **Recorded** in the PR's assumptions table |
| 10 | MINOR | Span conventions differ between constructs: a heading's stops before the line break, a callout's included it | **Fixed** in `ed35552`; refined in `8ce1b01` (see reading 2, finding 8) |
| 11 | MINOR | The fuzz target checks neither the frontmatter span nor any position | **Fixed** in `ed35552` |
| 12 | MINOR | `property_4` of the round-trip test cannot fail: it is true by the type system | **Kept** as executable documentation, as the reading suggested; the real check belongs to `verso-fs`, feature 2 |
| 13 | MINOR | The fuzz package sits outside `cargo deny` and `[workspace.lints]` | **Kept.** The reading reads it as acceptable under [ADR 0029](../adr/0029-guardrails-in-ci.md), since it never links into a product crate; adding `cargo deny check` for its manifest is one CI step, not taken |
| 14 | MINOR | `fixtures/callout/simple` asserts `kind` and `title`, which its own `observed:` says were not observed | **The maintainer's** (section 6, item 4). The fixture was approved with PR #7 and was not touched |

## 2. Second reading — `ed35552`

Verdict of the reading: not mergeable as the resolution of the first one.

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKING | The depth bound does not bound the tree. `saphyr` expands an alias by cloning the anchored node, so the bound on the event stream misses it: a chain of 1 000 aliases (about 20 KB, event depth 2, expanded depth 1 001) still aborts, and a 347-byte alias fan-out expands to millions of nodes, 3.0 s and 2.1 GB of peak memory | **Fixed** in `8ce1b01`. The pre-pass keeps an explicit stack of open collections, records the height and the size of every anchored node, and charges each alias what the loader will clone there, against the depth limit and a new node limit. Seen failing with the charge disabled. Aliases still expand as before: nothing of Q24 was decided |
| 2 | BLOCKING | The docs-mirror guardrail is red: three fuzz seeds are tracked `*.md` files outside `docs/pt-BR/` and get asked for twins (the check had been run before `git add`, when they were untracked) | **Fixed** in `8ce1b01`. Seeds are data, not documents: `.txt`; the seeds' README was folded into the fuzz target's doc comment |
| 3 | BLOCKING | The CI fuzz job never started: `fuzz/corpus/parse` is gitignored and `cargo-fuzz` 0.13.2 does not create a corpus directory it is given by name | **Fixed** in `8ce1b01` (`mkdir -p` before the run) |
| 4 | IMPORTANT | `MAX_YAML_DEPTH = 64` answers Q17, which is `[OPEN]`, and is recorded only in a code comment and in a `pub const` | **Partly fixed**: `pub(crate)` from `8ce1b01`, so it is not part of the public API. The record in `docs/` is in the same PR as this document (spec §9, Q17); the number itself is the maintainer's (section 6, item 1) |
| 5 | IMPORTANT | Q18 property 1 is still violated through the base parser: `pulldown-cmark` 0.13.4 panics on a ten-byte input. `#[ignore]` is a record, not a resolution, and `parse`'s doc claimed "never panics" | **Partly fixed**: the doc was corrected in `8ce1b01` and now names the exception. The record in `docs/` is in the same PR as this document ([ADR 0037](../adr/0037-base-parser.md), Consequences); the way out is the maintainer's (section 6, item 2) |
| 6 | MINOR | The rationale for the bound names the wrong recursion: it is `saphyr-parser`'s loading driver, not the loader, which is iterative | **Fixed** in `8ce1b01` |
| 7 | MINOR | The frontmatter is scanned and parsed twice, about twice the YAML work | **Kept.** Irrelevant at frontmatter sizes; it disappears if the value tree is ever built from events directly |
| 8 | MINOR | The callout span trims every trailing line break, while its comment says one | **Fixed** in `8ce1b01`: one `\n` or `\r\n` |

## 3. Third reading — `8ce1b01`

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKING | The fuzz guardrail is inert. libFuzzer runs seeds from the smallest up, and the ten-byte seed on which `pulldown-cmark` itself panics ran first, ending every CI job before a single mutation. The job was permanently red without ever fuzzing | **Fixed** in `26d744c`. The input is no longer a seed; it stays in `crates/verso-dialect/tests/regressions.rs`, `#[ignore]`d, with the condition for removing the `#[ignore]` written in it. The job now fuzzes its 60 seconds from the one seed that remains, `fuzz/seeds/deep-yaml.txt` |
| 2 | IMPORTANT | The node budget was compared against the sum of the subtree sizes, not against the node count, so a flat mapping of 2 500 keys was refused | **Fixed** in `26d744c`. Each node is charged once, when it closes; an alias is charged the size of the node it clones |
| 3 | IMPORTANT | The two numbers that answer Q17 are recorded only in Rust source | **Recorded** in the same PR as this document, under Q17 of [`../spec/dialect.md`](../spec/dialect.md) §9. Nothing is decided by the record: the question stays `[OPEN]` and the numbers are the maintainer's (section 6, item 1) |
| 4 | IMPORTANT | The upstream `pulldown-cmark` panic is recorded only in Rust source | **Recorded** in the same PR as this document, under Consequences of [ADR 0037](../adr/0037-base-parser.md). Nothing is decided by the record: Status and Decision did not change and the way out is the maintainer's (section 6, item 2) |
| 5 | MINOR | A tag outside the core schema adds a level to the tree `saphyr` builds, and the pre-pass did not charge it | **Fixed** in `26d744c`. A differential test measures the tree `saphyr` actually builds for eleven shapes — tags, self-referential aliases, complex keys, the boundaries — and asserts that the pre-pass accepts exactly what fits |
| 6 | MINOR | The anchor lookup is linear, which makes the pre-pass quadratic in the worst case | **Kept.** The worst case is bounded by the node budget of finding 2 |
| 7 | MINOR | Off-by-one in the depth check: the node itself was not counted, so 64 collections plus a scalar passed | **Fixed** in `26d744c`: that shape is depth 65 and is refused |
| 8 | MINOR | The inventory of the fuzz seeds moved into a Rust doc comment, where a reader of the documentation does not find it | **Kept.** This review document names the seeds instead: after finding 1, the only one left is `fuzz/seeds/deep-yaml.txt`, the deep frontmatter |
| 9 | MINOR | A test message sliced the first 40 bytes of the input unconditionally | **Fixed** in `26d744c` |

## 4. Fourth reading — `26d744c`

Verdict of the reading: **no BLOCKING**; the branch may merge as the resolution
of the original review.

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | IMPORTANT (against the branch; pre-existing on `main`, not caused by the diff) | With the fuzz guardrail actually running, a 10-minute run found a 5 068-byte UTF-8 input on which `parse` does not return in practical time: CPU-bound, exponential in the input length, roughly doubling per 100 bytes (3 600 bytes: 1.3 s; 4 000 bytes: 11 s). Measured afterwards by the author, `pulldown-cmark` 0.13.4 **alone** emits 157 million events for the first 3 600 bytes of that input, against 676 events and 313 µs for the whole file on upstream `main`: the defect is in the base parser, and `verso-dialect`'s own pass is linear over the base's events. It contradicts the purpose [ADR 0029](../adr/0029-guardrails-in-ci.md) states for this guardrail ("a malformed file hanging the app"), and Q17 already names it — "quadratic parser … fuzzing catches crashes, not slowness". Consequence: the CI fuzz job can go red on any PR by finding it (no red in 8 runs of 60 s, one red in a run of 600 s) | **Recorded, not fixed.** Q17 is `[OPEN]` and the way out is the same decision as the panic ([ADR 0037](../adr/0037-base-parser.md), Consequences; section 6, item 2). The author keeps the reproducer as an `#[ignore]`d regression test in `crates/verso-dialect/tests/regressions.rs`, reading `crates/verso-dialect/tests/data/pulldown-0.13.4-exponential.txt` with `include_str!` |
| 2 | IMPORTANT | With the seed gone (third reading, finding 1), nothing in CI announces the upstream release: the `#[ignore]`d tests can stay ignored forever, including after a `cargo update` | **Deferred with this record**, the maintainer's (section 6, item 6). Two options are recorded and neither is chosen: a non-blocking CI step that runs the ignored tests; or a `deny.toml` ban on `pulldown-cmark > 0.13.4` whose reason names the test to un-ignore |
| 3 | MINOR | `size_of_children` is redundant: it is always `size - (1 + wrapper)` | **Fixed** in `ff575e2` |
| 4 | MINOR | `open_depth` duplicates state the frame stack already carries | **Kept**, at the author's discretion |
| 5 | MINOR | The differential test pins the model only on its boundary shapes | **Kept**, at the author's discretion. The reading itself verified the exact thresholds on 40 hand-built shapes, 300 random documents and 13 400 random fragments, with no disagreement |
| 6 | MINOR | The pre-pass over-counts duplicate mapping keys (the strict side) | **Noted** in the test's comment in `ff575e2` |
| 7 | MINOR | Two imprecisions in a comment and in a test: which tags add a node, and a byte slice in a test message | **Fixed** in `ff575e2` and `ec5bd1a` |

## 5. Verified and correct

Across the four readings, and repeated on each commit:

- No fixture was changed and no `expected.yaml` was touched; all six new inputs
  of PR #7 are the verbatim examples of spec §5, and all six are marked as AI
  drafts ([ADR 0031](../adr/0031-fixtures-as-contract.md)). Spec §9 was not
  changed by the code PRs.
- No IO, no async, no `unsafe`, no `unwrap` or `expect` outside tests, no new
  `#[allow]`; the workspace lints are on.
- Positions: character columns, 1-based, verified by hand on two fixtures; CRLF
  counted as one line break.
- On the Markdown side, nothing hangs or blows up quadratically: 32 000 nested
  blockquotes, 20 000 nested `[[`, a 4 MB deeply indented list and a 400 KB
  paragraph all return.
- Scope: nothing from features 2 to 7 or from Phase 2 entered
  (`CLAUDE.md` §2.5).
- Green on the branch: `cargo fmt --check`, `cargo clippy`, `cargo test`,
  `cargo deny check`, the `wasm32-unknown-unknown` check,
  `scripts/check-docs-mirror.sh` and `scripts/check-fixtures.sh`.
- `saphyr-parser`, the one new dependency, is the exact version already in the
  tree transitively, MIT OR Apache-2.0, and passes `cargo deny`.
- Fourth reading: the node and depth accounting is exact on every shape the
  reading could construct; all three `SIGABRT` reproducers of the first two
  readings return `Err`; and on a clean export the fuzz job does 407 k to
  733 k executions per 60-second job without hitting the panic by mutation
  (13 runs).

## 6. Pending the maintainer

Nothing in this list is decided here.

1. **The two numbers of Q17 — decided on 2026-09-21.** The code refuses a
   frontmatter nested deeper than 64 levels or expanding to more than 10 000
   nodes, counted before any tree is built, with aliases charged what the loader
   clones and with the level a tag adds counted. Over either limit, the block is
   reported with its span and `values` as an error, and the body is still
   parsed. The maintainer confirmed the two numbers and that behavior: they are
   no longer provisional, and [`../spec/dialect.md`](../spec/dialect.md) §9
   records the frontmatter part of Q17 as `DECIDED`, the rest of the question
   staying `[OPEN]`. The constants stay `pub(crate)` and no fixture asserts them
   ([ADR 0031](../adr/0031-fixtures-as-contract.md); `CLAUDE.md` invariant 17).
   Other numbers considered: none recorded — the two were chosen to keep
   `parse` returning, not as an answer to Q17.
2. **The two defects of `pulldown-cmark` 0.13.4** — **decided on 2026-09-21.**
   The first: the ten-byte input `- [a]:b` followed by a line of two tabs
   panics inside the base parser, which contradicts what
   [ADR 0037](../adr/0037-base-parser.md) expected of it and violates Q18
   property 1 (upstream issue #1129). The second, found by the fuzz guardrail
   on `26d744c`: a 5 068-byte UTF-8 input
   on which the base parser takes exponential time — 157 million events for
   the first 3 600 bytes, roughly doubling per 100 bytes — so `parse` does not
   return in practical time. Both are fixed on upstream `main` (verified as of
   revision `c51a2a4`, read on 2026-09-21; for the panic, the fix landed
   between 0.13.4 and that revision, and the author of upstream PR #1128
   reported on 2026-08-09 that `main` no longer panics on the related input;
   the same file takes 313 µs and 676 events there), with no release since
   0.13.4 of 2026-05-20. The second defect also makes the CI fuzz job
   intermittently red: any run long enough to find that input fails. Both are
   recorded in the ADR with the same three ways out: wait for the release; pin
   the git revision, which also needs a `[sources]` change in `deny.toml`; or
   switch to the `comrak` fallback of item 2 of that ADR's Decision. A scratch
   copy of the crate at `c51a2a4` passed every test and 6 M fuzz runs, and
   `comrak` 0.55 also survives the ten-byte input. Both reproducers stayed in
   `crates/verso-dialect/tests/regressions.rs`, `#[ignore]`d, until the
   decision below.
   **The maintainer decided on 2026-09-21** for the second way out: the
   workspace and the fuzz harness build `pulldown-cmark` from upstream
   revision `c51a2a4` through `[patch.crates-io]`, with `allow-git` in
   `deny.toml` restricted to that one repository and an expiry of 2026-12-31
   ([ADR 0029](../adr/0029-guardrails-in-ci.md)'s exception policy), until the
   release after 0.13.4. `comrak` was not taken, because it would swap the base
   to escape a bug that is already fixed; waiting was not taken, because it
   leaves the fuzz job intermittently red and both tests ignored indefinitely.
   Both tests therefore lose their `#[ignore]` and both inputs become fuzz
   seeds. Recorded under Consequences of
   [ADR 0037](../adr/0037-base-parser.md), whose Decision and Status did not
   change.
3. **The contradiction inside spec §4.1 — decided on 2026-09-21.** The
   maintainer picked the strict reading, the one the fixture harness already
   implemented: a list key asserts the whole list, same length and same order.
   The sentence "the parser may produce more than the fixture asks for, never
   less and never different" is gone from
   [`../spec/dialect.md`](../spec/dialect.md) §4.1, which now also says that
   `frontmatter:`, being a map, asserts only the keys it names.
4. **`fixtures/callout/simple` asserts what was not observed.** Its `kind` and
   `title` rest on Obsidian's public documentation; its own `observed:` records
   that the public API exposes only a section of type `callout`, with no kind
   and no title ([ADR 0009](../adr/0009-external-constraints.md) forbids looking
   further). Q5 is `[OPEN]`. The fixture was approved with PR #7; the reading
   asks the maintainer to weigh it, and the fixture was not edited.
5. **`^id` at the end of a list item — decided on 2026-09-21.** The maintainer
   decided that a `^id` ending a list item defines the block, exactly as one
   ending a paragraph: [`../spec/dialect.md`](../spec/dialect.md) §5.7, Q3 in §9
   closed for those two positions, and the fixture `fixtures/block/list-item`
   (an AI draft awaiting approval) as the answer. What the reading had recorded
   — the base emits no paragraph event inside a tight list item — is now handled
   by the recognizer tracking each item's own text, up to its first block child,
   and looking for the `^id` only there: a code block, an HTML block or a nested
   list that ends the item is never scanned, and an item whose own line ends
   with `^id` keeps it when a nested list follows. The rest of Q3 stays
   `[OPEN]`: a `^id` alone on a line after a blank line, which Obsidian attaches
   to the block before it, and a `^id` on a heading.
6. **Nothing in CI announces the upstream release** — **decided on
   2026-09-21.** Since the ten-byte input stopped being a fuzz seed (third
   reading, finding 1), the two `#[ignore]`d regression tests of item 2 can
   stay ignored indefinitely, including across a
   `cargo update` that brings the fix in. The fourth reading records two
   options and chooses neither: a non-blocking CI step that runs the ignored
   tests, so that a green one is visible; or a `deny.toml` ban on
   `pulldown-cmark > 0.13.4` whose reason names the test to un-ignore, so that
   the update itself fails the build until someone looks. Other options
   considered: none recorded.
   **The maintainer decided on 2026-09-21** for the second option, as the
   tripwire of the patch decided in item 2: `deny.toml` bans
   `pulldown-cmark` `>=0.13.5`, written with the legacy `name` and `version`
   keys, because `version` there is a real semver requirement while the newer
   `crate = "name@>=0.13.5"` form is a package-id spec that drops the
   comparison operator and matches one exact version (cargo-deny 0.20.2); it
   was seen firing with the bound lowered to `>=0.13.1` against the patched
   0.13.1 and staying silent at `>=0.13.2`. Its reason names the action for
   the day it fires: run the two regression tests on the release, check that
   the release has the `std` feature, then drop the patch, the `allow-git`
   entry and the ban together. The ban announces the release; what protects
   the build is the crate requirement asking for `features = ["std"]`, which
   no published 0.13.x has, so a build without the patch fails to resolve
   instead of falling back to 0.13.4 — and that is why dropping the patch
   means checking the release carries `std`. The non-blocking CI step is not
   needed once those tests stop being ignored. Recorded under Consequences of
   [ADR 0037](../adr/0037-base-parser.md).
