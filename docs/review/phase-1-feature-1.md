# Critical review — Phase 1, feature 1 (`verso-dialect`)

- Date: 2026-09-21
- Reviewer: Opus 5, in the role of core Rust reviewer ([ADR 0032](../adr/0032-author-and-reviewer-roles.md))
- Author of the code under review: Fable 5.1 ([ADR 0032](../adr/0032-author-and-reviewer-roles.md))
- Input: three readings, each in its own session, of the diff and of the repository, without access to the author's session — PR #7 (merge `2448a3d`), then the follow-up commits `14daba5` and `e5ff1a9` on the branch `phase1/dialect-review`.
- Roadmap item: Phase 1, feature 1 — `verso-dialect`, parsing of links, blocks, headings and frontmatter ([`../roadmap.md`](../roadmap.md)).
- State: every BLOCKING finding of the three readings is resolved in code. Five
  items are **pending the maintainer** and are listed in section 5; none of them
  is decided here. Two of them gained a record in `docs/` in the same PR as this
  document: the provisional frontmatter limits under Q17 of
  [`../spec/dialect.md`](../spec/dialect.md) §9, and the upstream
  `pulldown-cmark` panic under Consequences of
  [ADR 0037](../adr/0037-base-parser.md). Recording is not closing: Q17 stays
  `[OPEN]` and the Status and Decision of ADR 0037 did not change.

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
| 1 | PR #7, merge `2448a3d` | 1 | 5 | 8 |
| 2 | `14daba5` | 3 | 2 | 3 |
| 3 | `e5ff1a9` | 1 | 3 | 5 |

The BLOCKING findings are all one shape: something that was supposed to be
bounded was not, or a guardrail that was supposed to be able to fail could not.
Three of the five findings that survive into section 5 are questions the spec
already marks `[OPEN]`; the other two are a contradiction inside the spec and an
upstream bug.

---

## 1. First reading — PR #7 (merge `2448a3d`)

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
| 1 | BLOCKING | A frontmatter of about 4 000 nested block sequences (an 8 KB note) overflows the stack inside the YAML loading driver and aborts the process with `SIGABRT` — not a panic, so nothing upstream can catch it. It breaks Q18 property 1, "`parse` returns for every input", which is `DECIDED` | **Fixed** in `14daba5`, completed in `e5ff1a9` and `71a4bcd`. The nesting is bounded on `saphyr-parser`'s event stream, before any tree exists; over the limit the frontmatter is reported with its span and `values` as an error, and the body is still parsed. Seen failing: with the check disabled the new test aborts. The *numbers* are Q17 and are the maintainer's (section 5, item 1) |
| 2 | IMPORTANT | The fuzz guardrail structurally could not find finding 1: `-max_len=4096`, and the crashing input needs about 8 KB | **Fixed** in `14daba5`. `-max_len=65536 -timeout=20`, versioned seeds in `fuzz/seeds/`, and a regression test in `crates/verso-dialect/tests/regressions.rs` |
| 3 | IMPORTANT | The PR's "what was assumed" table does not match the code for `^id`: an `^id` alone after a blank line **is** reported; one at the end of a tight list item is **not** | **Fixed** in `14daba5`, in the doc of the recognizer and in the PR's table. Q3 stays `[OPEN]` and nothing was implemented either way (section 5, item 5) |
| 4 | IMPORTANT | The fixture harness rejects `syntax: wikilink`, which spec §4.2 says may be omitted | **Fixed** in `14daba5`. `wikilink` and omitting it are the same assertion; `markdown` fails with a message pointing at Q20 |
| 5 | IMPORTANT | The harness silently picks a side in a contradiction inside spec §4.1 | **Recorded, not resolved.** The maintainer's (section 5, item 3). `CLAUDE.md` §1 rule 3 forbids picking a side |
| 6 | IMPORTANT | The `wasm` and `fuzz` jobs run on Linux only; [ADR 0029](../adr/0029-guardrails-in-ci.md) says the feature guardrails run on macOS and Linux | **Fixed** in `14daba5`. Both jobs run the two-OS matrix |
| 7 | MINOR | `LineIndex::pos`'s doc comment does not describe what the code does (the fallback is `col = 1`, not a count) | **Fixed** in `14daba5` (comment) |
| 8 | MINOR | `---\n---\n` and a frontmatter closed by `...` both give `frontmatter: None`, undeclared; a metadata block at offset 0 that is rejected is indistinguishable from "no frontmatter" | **Recorded** in the PR's assumptions table; behaviour unchanged, it is Q24 |
| 9 | MINOR | Q15 is answered in code (tables, footnotes, task lists, strikethrough, math and highlight are all off) without being declared | **Recorded** in the PR's assumptions table |
| 10 | MINOR | Span conventions differ between constructs: a heading's stops before the line break, a callout's included it | **Fixed** in `14daba5`; refined in `e5ff1a9` (see reading 2, finding 8) |
| 11 | MINOR | The fuzz target checks neither the frontmatter span nor any position | **Fixed** in `14daba5` |
| 12 | MINOR | `property_4` of the round-trip test cannot fail: it is true by the type system | **Kept** as executable documentation, as the reading suggested; the real check belongs to `verso-fs`, feature 2 |
| 13 | MINOR | The fuzz package sits outside `cargo deny` and `[workspace.lints]` | **Kept.** The reading reads it as acceptable under [ADR 0029](../adr/0029-guardrails-in-ci.md), since it never links into a product crate; adding `cargo deny check` for its manifest is one CI step, not taken |
| 14 | MINOR | `fixtures/callout/simple` asserts `kind` and `title`, which its own `observed:` says were not observed | **The maintainer's** (section 5, item 4). The fixture was approved with PR #7 and was not touched |

## 2. Second reading — `14daba5`

Verdict of the reading: not mergeable as the resolution of the first one.

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKING | The depth bound does not bound the tree. `saphyr` expands an alias by cloning the anchored node, so the bound on the event stream misses it: a chain of 1 000 aliases (about 20 KB, event depth 2, expanded depth 1 001) still aborts, and a 347-byte alias fan-out expands to millions of nodes, 3.0 s and 2.1 GB of peak memory | **Fixed** in `e5ff1a9`. The pre-pass keeps an explicit stack of open collections, records the height and the size of every anchored node, and charges each alias what the loader will clone there, against the depth limit and a new node limit. Seen failing with the charge disabled. Aliases still expand as before: nothing of Q24 was decided |
| 2 | BLOCKING | The docs-mirror guardrail is red: three fuzz seeds are tracked `*.md` files outside `docs/pt-BR/` and get asked for twins (the check had been run before `git add`, when they were untracked) | **Fixed** in `e5ff1a9`. Seeds are data, not documents: `.txt`; the seeds' README was folded into the fuzz target's doc comment |
| 3 | BLOCKING | The CI fuzz job never started: `fuzz/corpus/parse` is gitignored and `cargo-fuzz` 0.13.2 does not create a corpus directory it is given by name | **Fixed** in `e5ff1a9` (`mkdir -p` before the run) |
| 4 | IMPORTANT | `MAX_YAML_DEPTH = 64` answers Q17, which is `[OPEN]`, and is recorded only in a code comment and in a `pub const` | **Partly fixed**: `pub(crate)` from `e5ff1a9`, so it is not part of the public API. The record in `docs/` is in the same PR as this document (spec §9, Q17); the number itself is the maintainer's (section 5, item 1) |
| 5 | IMPORTANT | Q18 property 1 is still violated through the base parser: `pulldown-cmark` 0.13.4 panics on a ten-byte input. `#[ignore]` is a record, not a resolution, and `parse`'s doc claimed "never panics" | **Partly fixed**: the doc was corrected in `e5ff1a9` and now names the exception. The record in `docs/` is in the same PR as this document ([ADR 0037](../adr/0037-base-parser.md), Consequences); the way out is the maintainer's (section 5, item 2) |
| 6 | MINOR | The rationale for the bound names the wrong recursion: it is `saphyr-parser`'s loading driver, not the loader, which is iterative | **Fixed** in `e5ff1a9` |
| 7 | MINOR | The frontmatter is scanned and parsed twice, about twice the YAML work | **Kept.** Irrelevant at frontmatter sizes; it disappears if the value tree is ever built from events directly |
| 8 | MINOR | The callout span trims every trailing line break, while its comment says one | **Fixed** in `e5ff1a9`: one `\n` or `\r\n` |

## 3. Third reading — `e5ff1a9`

| # | Level | Finding | Resolution |
|---|---|---|---|
| 1 | BLOCKING | The fuzz guardrail is inert. libFuzzer runs seeds from the smallest up, and the ten-byte seed on which `pulldown-cmark` itself panics ran first, ending every CI job before a single mutation. The job was permanently red without ever fuzzing | **Fixed** in `71a4bcd`. The input is no longer a seed; it stays in `crates/verso-dialect/tests/regressions.rs`, `#[ignore]`d, with the condition for removing the `#[ignore]` written in it. The job now fuzzes its 60 seconds from the one seed that remains, `fuzz/seeds/deep-yaml.txt` |
| 2 | IMPORTANT | The node budget was compared against the sum of the subtree sizes, not against the node count, so a flat mapping of 2 500 keys was refused | **Fixed** in `71a4bcd`. Each node is charged once, when it closes; an alias is charged the size of the node it clones |
| 3 | IMPORTANT | The two numbers that answer Q17 are recorded only in Rust source | **Recorded** in the same PR as this document, under Q17 of [`../spec/dialect.md`](../spec/dialect.md) §9. Nothing is decided by the record: the question stays `[OPEN]` and the numbers are the maintainer's (section 5, item 1) |
| 4 | IMPORTANT | The upstream `pulldown-cmark` panic is recorded only in Rust source | **Recorded** in the same PR as this document, under Consequences of [ADR 0037](../adr/0037-base-parser.md). Nothing is decided by the record: Status and Decision did not change and the way out is the maintainer's (section 5, item 2) |
| 5 | MINOR | A tag outside the core schema adds a level to the tree `saphyr` builds, and the pre-pass did not charge it | **Fixed** in `71a4bcd`. A differential test measures the tree `saphyr` actually builds for eleven shapes — tags, self-referential aliases, complex keys, the boundaries — and asserts that the pre-pass accepts exactly what fits |
| 6 | MINOR | The anchor lookup is linear, which makes the pre-pass quadratic in the worst case | **Kept.** The worst case is bounded by the node budget of finding 2 |
| 7 | MINOR | Off-by-one in the depth check: the node itself was not counted, so 64 collections plus a scalar passed | **Fixed** in `71a4bcd`: that shape is depth 65 and is refused |
| 8 | MINOR | The inventory of the fuzz seeds moved into a Rust doc comment, where a reader of the documentation does not find it | **Kept.** This review document names the seeds instead: after finding 1, the only one left is `fuzz/seeds/deep-yaml.txt`, the deep frontmatter |
| 9 | MINOR | A test message sliced the first 40 bytes of the input unconditionally | **Fixed** in `71a4bcd` |

## 4. Verified and correct

Across the three readings, and repeated on each commit:

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

## 5. Pending the maintainer

Nothing in this list is decided here.

1. **The two numbers of Q17.** The code refuses a frontmatter nested deeper than
   64 levels or expanding to more than 10 000 nodes, counted before any tree is
   built, with aliases charged what the loader clones and with the level a tag
   adds counted. Over either limit, the block is reported with its span and
   `values` as an error, and the body is still parsed. Both constants are
   `pub(crate)`, both are provisional, and the record under Q17 in
   [`../spec/dialect.md`](../spec/dialect.md) §9 says so; the question stays
   `[OPEN]`. No fixture asserts them ([ADR 0031](../adr/0031-fixtures-as-contract.md);
   `CLAUDE.md` invariant 17). Other numbers considered: none recorded — the
   two were chosen to keep `parse` returning, not as an answer to Q17.
2. **The upstream `pulldown-cmark` panic.** The ten-byte input `- [a]:b`
   followed by a line of two tabs panics inside the base parser, which
   contradicts what [ADR 0037](../adr/0037-base-parser.md) expected of it and
   violates Q18 property 1. Upstream issue #1129, fixed on their `main`
   (verified as of revision `c51a2a4`, read on 2026-09-21; the fix landed
   between 0.13.4 and that revision, and the author of upstream PR #1128
   reported on 2026-08-09 that `main` no longer panics on the related input),
   with no release since 0.13.4 of 2026-05-20. Three ways
   out are recorded in the ADR: wait for the release; pin the git revision,
   which also needs a `[sources]` change in `deny.toml`; or switch to the
   `comrak` fallback of item 2 of that ADR's Decision. A scratch copy of the
   crate at `c51a2a4` passed every test and 6 M fuzz runs, and `comrak` 0.55
   also survives the input.
3. **The contradiction inside spec §4.1.** The same paragraph says
   "`links: []` asserts that there is no link" and "the parser may produce more
   than the fixture asks for, never less and never different". The fixture
   harness resolved it on the strict side: it asserts the whole list, same
   length and same order. Either wording has to change, and the harness follows
   whichever the maintainer picks. The text was not touched, per `CLAUDE.md` §1
   rule 3.
4. **`fixtures/callout/simple` asserts what was not observed.** Its `kind` and
   `title` rest on Obsidian's public documentation; its own `observed:` records
   that the public API exposes only a section of type `callout`, with no kind
   and no title ([ADR 0009](../adr/0009-external-constraints.md) forbids looking
   further). Q5 is `[OPEN]`. The fixture was approved with PR #7; the reading
   asks the maintainer to weigh it, and the fixture was not edited.
5. **`^id` at the end of a tight list item.** An `^id` alone on a line after a
   blank line is its own paragraph and is reported; one ending a tight list item
   is not, because the base emits no paragraph event there. This is an effect of
   the base parser, not a choice: nothing was implemented either way, and Q3
   ("admissible position of the `^id`") is `[OPEN]`.
