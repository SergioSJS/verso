# Decision memo: what "round-trip" means (Q18) and which base parser (ADR 0037)

- Date: 2026-09-21
- Status: **decided by the maintainer on 2026-09-21**, in session, after
  reading this memo: Q18 = reading **(b)**; base parser = **`pulldown-cmark`**,
  `comrak` as the fallback. Recorded in `docs/spec/dialect.md` §9 Q18 and in
  [ADR 0037](../adr/0037-base-parser.md) (Accepted). Sections 2–4 are the
  comparison as it was when the decision was made; section 5 is kept as the
  record of how it was decided.
- Author: Opus 5 (documents, [ADR 0032](../adr/0032-author-and-reviewer-roles.md)).
  Reviewer: Fable 5.1. No Rust in this PR.
- Decides on: [`docs/spec/dialect.md`](../spec/dialect.md) Q18 and
  [ADR 0037](../adr/0037-base-parser.md), in that order, because the answer to
  Q18 is a criterion of ADR 0037 ([roadmap](../roadmap.md), Phase 1).
- Sources read: [ADR 0012](../adr/0012-files-are-source-of-truth.md),
  [ADR 0018](../adr/0018-llm-native-mcp-in-core.md),
  [ADR 0020](../adr/0020-sync-merge-in-core-transports-as-plugins.md),
  [ADR 0028](../adr/0028-crate-structure.md),
  [ADR 0029](../adr/0029-guardrails-in-ci.md),
  [ADR 0031](../adr/0031-fixtures-as-contract.md), spec §4, §5 and §9, the
  five approved fixtures, and the public documentation and source of
  `pulldown-cmark` 0.13.4 and `comrak` 0.55.0 as published on docs.rs and
  GitHub on 2026-09-21. Section 4 lists what was **not** verified.

## 1. What is being decided, and why now

Feature 1 of Phase 1 is the parser crate, `verso-dialect`. Two things block
its first PR:

1. **Q18** asks what the sentence "the parser has to preserve what it does not
   understand: round-trip becomes a mandatory property test" (ADR 0012,
   ADR 0029) actually requires of the code. The spec records two readings and
   says "today nobody knows which".
2. **ADR 0037** asks which Markdown parser sits under `verso-dialect`:
   `pulldown-cmark`, `comrak`, or one of our own. The ADR says the answer to
   Q18 picks the parser, so Q18 comes first.

Both are reversible, but the cost of reversing grows with every fixture and
every line of `verso-dialect`. Deciding now, before code, is the cheapest
moment.

The invariants that constrain the answer, all already Accepted:

- **Opening a file never rewrites it** (invariant 7, ADR 0012).
- **Writing is only by user action, with a visible diff**, including writes by
  an agent (invariants 8 and 11, ADR 0012, ADR 0018).
- **The parser produces positions** (line, column in Unicode characters) for
  every construct, because a block without a `^id` is cited by position
  (spec §4.4, ADR 0018).
- `verso-dialect` has **no IO, no async**, is **fuzzed**, and **compiles to
  WASM** (ADR 0028, ADR 0029).
- Phase 1 has no UI and no writing to notes at all: it delivers `index`,
  `search`, `backlinks` and a **read-only** `verso mcp` (roadmap). Agent
  writing with a diff has no phase assigned yet.
- The Phase 1 file model **cannot make per-block merge unfeasible later**
  (ADR 0020).

## 2. Decision 1 — Q18: what "round-trip" means

### 2.1 The two readings

**Reading (a) — lossless tree.** `parse` turns the file into a tree that keeps
*everything*: every space, every line ending, every `\` escape, the exact
delimiter used (`*` or `_`), indentation, trailing whitespace, unknown syntax.
`serialize` turns that tree back into bytes. The contract is
`serialize(parse(x)) == x`, byte for byte, for every file. The tree is the
thing you edit; writing is serializing the edited tree.

**Reading (b) — read-only extraction.** `parse` reads the file and produces a
*report*: the links, embeds, headings, block IDs, callouts and frontmatter it
found, each with its position and the exact source text it came from. There is
no `serialize`. "Opening never rewrites" is guaranteed by construction: the
read path has no code that writes. An edit, when one exists, is a textual
patch — "replace bytes 120..145 with this text" — computed against the
original file and shown as a diff before being applied.

The two are not "strict" and "lax". They answer different questions. (a)
answers "can the app reconstruct the file from its understanding of it?" (b)
answers "does the app ever need to?"

### 2.2 The comparison, side by side

| Question | (a) lossless tree | (b) read-only extraction |
|---|---|---|
| What guarantees "opening never rewrites"? | The property `serialize(parse(x)) == x`, tested on generated inputs | No write on the read path, enforced by crate structure (ADR 0028) and the `std::fs` lint (ADR 0029); tested by checking the file's bytes before and after a read |
| What the parser must model | All of CommonMark plus all trivia (whitespace, escapes, entities, delimiters, CRLF, tabs) | Only the constructs in spec §5 and §6, with positions; everything else is "text" |
| What fits under it | A parser of our own, or a base that keeps a concrete syntax tree. Neither `pulldown-cmark` nor `comrak` does (section 3) | Any parser that gives positions. Both candidates do |
| What the five approved fixtures assert | Nothing about a tree. They assert facts and positions | Exactly this: facts and positions (spec §4 has no tree shape) |
| What the editor side (CodeMirror 6 / Lezer) has | A concrete syntax tree, in JS, its own | Positions, the same thing the conformance suite compares |
| How an edit is expressed | Tree operation, then serialize | Text range plus replacement, then diff |
| Cost in Phase 1 | Large: the parser is the biggest deliverable of the phase (section 2.4) | Small: a base parser plus one pass over its output (section 2.4) |
| Reversible later? | Toward (b): yes, trivially — a tree with positions is also a report | Toward (a): yes, as an addition — the report's positions are the anchors a tree would need. Nothing in (b) has to be undone |

### 2.3 What the ADR 0029 property test tests, under each reading

A property test does not check one example; it generates thousands of inputs
and checks that a *property* holds for all of them. The property is what Q18
decides.

Under **(a)**, the property is one sentence: for every generated input `x`,
`serialize(parse(x)) == x`. It is precise and strong. It is also only as good
as the generator: a generator that never produces a tab inside a list item
never tests that case. The fuzz corpus (ADR 0029) helps here, since every fuzz
input is also a round-trip input.

Under **(b)**, "round-trip" cannot mean re-serialization, because there is
none. The test has to name what it protects instead. Four properties, each a
concrete test the maintainer can read the name of in `cargo test`:

1. **No panic.** For every input, `parse` returns. (The fuzz target does this
   too; the property test does it on structured inputs.)
2. **Determinism.** `parse(x) == parse(x)`, and the report does not depend on
   anything but `x`.
3. **Span fidelity.** Every reported construct carries the byte range it came
   from, and slicing `x` with that range gives back the construct's source
   text: for a link, a string that starts with `[[` and ends with `]]`; for a
   heading, a line that starts with `#`; for a block ID, `^` followed by the
   id. The `pos` (line, column) that fixtures assert is derived from that
   range, and the test checks the derivation against counting characters from
   the start of the file. This is the (b) analogue of round-trip: the parser
   cannot lie about where things are, and everything it reports can be found
   again in the untouched file.
4. **The read path does not write.** At the `verso-fs` level (feature 2):
   hash of the file before a read equals the hash after. At the
   `verso-dialect` level it holds by construction — the crate has no IO — and
   the clippy lint makes that mechanical.

Property 3 is the one that makes (b) more than "we promise not to write". It is
also what per-block merge and agent writing stand on (section 2.5).

### 2.4 What each reading costs in Phase 1

**(a)** requires a parser that keeps a concrete syntax tree of CommonMark. No
Rust crate the ADR names does that, so (a) means **writing our own parser**
(section 3 shows why the two candidates do not qualify). CommonMark is
specified by roughly six hundred examples, and the hard parts — nested lists,
lazy continuation lines, link reference definitions, HTML blocks, the
backtick-run rule for code spans — are precisely the parts that decide whether
"a link inside code is not a link" (`fixtures/code/no-link-in-code`) comes out
right. ADR 0037 already says what happens then: "the fuzzing and conformance
effort goes up, and that has to appear in the roadmap". Feature 1 would stop
being "links, blocks, headings and frontmatter" and become "a CommonMark
parser, then links, blocks, headings and frontmatter". Nothing in Phase 1 or
Phase 2 consumes the tree: Phase 1 does not write, and Phase 2 edits through
CodeMirror, which has its own tree.

**(b)** requires a base parser (section 3) plus one pass of our own over its
output that recognizes the dialect (wikilink parts, `^id`, callout header) and
records positions. The property test is the four properties above, written
once. The cost is the cost feature 1 was budgeted for.

### 2.5 What changes for per-block merge (ADR 0020) and agent writing (ADR 0018)

**Per-block merge** (out of scope until after Phase 2; the constraint is only
"do not make it unfeasible"). A merge needs to know where one block ends and
the next begins, on both sides of the change, and to reconcile the text in
between.

- Under (a), the merge would operate on trees. Tree merging is a research
  problem with no off-the-shelf answer, and it still ends in text for inline
  content. The lossless tree does not buy a merge algorithm; it buys the
  ability to serialize the result, which text-based merge has for free.
- Under (b), a block is a byte range delimited by parser positions (what a
  "block" is remains Q21 in both readings). Three-way merge then runs over
  text within block boundaries — the model `git` uses, with better hunk
  boundaries — and a conflict is presented per block. Every input the merge
  needs (block boundaries, `^id` anchors, positions) is in the (b) report.
  Feasibility is preserved.

**Agent writing** (ADR 0018, `DECIDED`, no phase assigned): "a diff with review
before applying, provenance recorded". Agents produce text, not trees.

- Under (a), the agent's text is parsed into a tree, the tree is diffed
  against the original tree, and a *textual* diff is still what the user
  reviews. The tree is an intermediate step that the requirement never asks
  for.
- Under (b), the agent proposes a patch — a block reference or a byte range,
  plus replacement text — the core computes the diff against the file as read,
  shows it, checks that the file on disk is still the one that was read
  (invariant 11), and writes atomically (feature 2). That is the requirement,
  literally.

Invariant 11 (mtime/size or hash before writing) exists in both readings and
is unaffected.

One consequence that (b) makes visible and (a) would hide: a future feature
that edits the **frontmatter through a form** (a typed note's properties,
Phase 2 item 2.6, if it edits rather than only reads) will need a
YAML-preserving textual patch, because spec §5.1 forbids normalizing key
order, comments and quoting. That is a consequence to record in the ADR of
the typed note, not something (a) would solve — a Markdown tree does not
parse YAML either.

### 2.6 Recommendation for Q18

**Reading (b)**, with the round-trip property test defined as the four
properties of section 2.3.

Why, in one paragraph: every Accepted invariant is satisfied by (b), no
deliverable of Phase 1 or Phase 2 consumes a lossless tree, the approved
fixtures and the editor already speak in facts and positions, and (b) can grow
into (a) later without undoing anything, while (a) now puts a CommonMark
parser of our own in front of every other Phase 1 feature. The one thing (a)
guarantees that (b) does not — that a re-serialized file equals the original —
guards a path (re-serializing) that (b) does not have.

What (b) gives up: the ability to say "the app understood the whole file". It
did not need to. Verso's dialect is an *extension* of a file format it does
not own; treating the rest of the file as opaque bytes is the honest model.

## 3. Decision 2 — ADR 0037: the base parser

### 3.1 The three candidates, as read on 2026-09-21

| | `pulldown-cmark` | `comrak` | Our own |
|---|---|---|---|
| Version read | 0.13.4 (2026-07-19) | 0.55.0 (2026-09-06) | — |
| License | MIT | BSD-2-Clause | MPL-2.0 (ours) |
| Output shape | A stream of events (`Start(Heading)`, `Text(...)`, `End(Link)`) with, on request, the **byte range** of each event in the source (`OffsetIter`) | A tree (AST) in an arena, each node with `sourcepos` (1-based line and column, start and end); columns in bytes by default, in **Unicode characters** with `parse.sourcepos_chars` | Whatever we design |
| Used by | `rustdoc`, mdBook | GitLab, docs.rs | — |
| Dependencies with defaults off | 3: `bitflags`, `memchr`, `unicase` | 7: `caseless`, `finl_unicode`, `jetscii`, `phf`, `rustc-hash`, `smallvec`, `typed-arena` (+ `entities`, `phf_codegen` at build) | 0 |
| Dependencies with defaults **on** | + `getopts`, `pulldown-cmark-escape` | + a CLI (`clap`, `xdg`, `shell-words`…) **and `syntect` with C Oniguruma**. Must be imported with `default-features = false` | — |

"Defaults off" matters: ADR 0028 wants a new dependency justified and
`cargo-deny` wants every license in the allowlist. Both crates' licenses are in
the allowlist of ADR 0029; the transitive ones are checked by `cargo deny` in
the feature 1 PR.

### 3.2 Against the criteria of ADR 0037, under reading (b)

| Criterion (ADR 0037) | `pulldown-cmark` | `comrak` | Our own |
|---|---|---|---|
| No IO, no async (ADR 0028) | Yes. Pure functions over `&str` | Yes, with defaults off. The `cli` and `syntect` features bring IO and C code; they stay off | Yes |
| Fuzz target (ADR 0029) | Fuzzed upstream; the crate's own test suite contains "don't crash" regressions from fuzzing | Fuzzed upstream; ships an `arbitrary` feature for structured fuzzing | Everything starts at zero; the fuzz corpus is ours to build |
| Compiles to WASM | Pure Rust, no platform code. Confirmed in the PR by the guardrail `cargo check --target wasm32-unknown-unknown` | Has explicit `wasm32` cases in its `Cargo.toml`. Same confirmation | Ours to keep true |
| Faithful preservation | Under (b) the base never serializes, so this criterion becomes **positions**. Byte range per event, exact (the upstream test for `[[Wikientry\|click here]]` reports range 19..43, the `[[` included) | Under (b), positions: `sourcepos` per node with start and end, and an option to count columns in characters as spec §4.4 asks. Inline positions matured in recent versions; checked against the five fixtures' `pos` in the PR | Ours |
| Faithful preservation under (a) | **Does not meet it.** Events drop trivia, unescape text, resolve references; there is no way back to the bytes | **Does not meet it.** `format_commonmark` re-renders a normalized document, not the original | The only way to meet (a) |
| Dialect extensions fit (ADR 0030) | See 3.3 | See 3.3 | See 3.3 |
| Positions (spec §4.4, ADR 0018) | Byte range → line and character column computed by us from the source (one pass, no ambiguity) | Line and column given; characters with `sourcepos_chars` | Ours |
| Fit with reading (b) | Exact. A read-only extractor *is* a loop over events with ranges; no tree is built and thrown away | Good. The tree gives parent context for free (is this text inside a blockquote?), at the cost of allocating a tree per file | Exact by design, at the cost of section 2.4 |
| Fit with reading (a) | No | No | Required |
| Performance (feature 5 benchmark) | Pull parser, no allocation of a tree; historically the faster of the two | Arena tree per document; fast enough for GitLab | Unknown |
| CommonMark conformance | Full spec, tested against the spec examples | Full spec plus GFM, tested against the spec examples | Whatever we reach; the code-span and fence rules that `no-link-in-code` depends on are ours to get right |

### 3.3 What each base leaves for Verso to write

The dialect (spec §5) is not CommonMark. Whatever the base, `verso-dialect`
writes a pass of its own on top. The question is how much, and whether the
base gets in the way.

| Construct | `pulldown-cmark` | `comrak` | Ours in both cases |
|---|---|---|---|
| Frontmatter (§5.1) | `ENABLE_YAML_STYLE_METADATA_BLOCKS`: the `---` block at the start of the file comes out as one opaque text event with its range | `front_matter_delimiter("---")`: one opaque `FrontMatter(String)` node | Parsing the YAML itself, with the YAML-1.1-versus-1.2 question of Q24. The YAML crate is a separate dependency decision for the feature 1 PR (`serde_yaml` is archived upstream; `cargo deny` will say what is acceptable) |
| Wikilink (§5.2–5.5, 5.10) | `ENABLE_WIKILINKS`, documented as "Obsidian-style": `[[a\|b]]` gives a link with `dest_url = "a"`, a flag `has_pothole` saying a pipe was present, and `b` as the link's text; the range covers `[[…]]` | `wikilinks_title_after_pipe` (Obsidian's order): a `WikiLink { url }` node with the title as child text | Splitting the target into `target`, `heading` (`#`) and `block` (`#^`) as spec §4.2 defines; the escapes and combined forms of Q23 |
| Embed (§5.6) | `![[…]]` with `ENABLE_WIKILINKS` is emitted as an **image** whose link type is `WikiLink` (verified in the parser source) | To confirm in the PR with the embed fixture: whether `![[` is recognized or comes out as `!` followed by a wikilink | Same split as the wikilink; the size-versus-alias rule of Q23 |
| Block definition `^id` (§5.7) | Not a construct. Ours: scan the text at the end of a paragraph or list item | Same | Recognizing `^id` at the end of a block, its charset (Q22) and admissible position (Q3, Q4) |
| Callout (§5.8) | `ENABLE_GFM` recognizes GitHub's blockquote tags — five fixed kinds, no fold marker. Obsidian's callouts have arbitrary kinds and `-`/`+` folding, so the base extension stays **off** and the callout is ours, read from the first line of a plain `BlockQuote` | `alerts` recognizes the same five GitHub kinds (`AlertType` has no arbitrary variant). Same conclusion: stays off, ours on top of `BlockQuote` | Kind, title, fold, nesting (Q5), from the first line of a blockquote |
| Link inside code is not a link (§5.9) | Free: text inside `Code` and `CodeBlock` events is never scanned | Free: `Code` and `CodeBlock` nodes | Nothing, provided our pass only scans `Text` events/nodes |
| Headings (§5.12) | `Heading` events with level and range; text as children | `Heading` nodes with level and `sourcepos` | Raw text without the trailing spaces (spec §4.3); heading matching (Q19) |
| Markdown links to a local file (§5.13, `PROPOSED`) | Native `Link` events with `dest_url` | Native `Link` nodes | Deciding whether they count (Q20); URL-decoding |
| Positions (§4.4) | Byte range → (line, char column) computed once per file | Native, with `sourcepos_chars` | Under `pulldown-cmark`, one helper; under `comrak`, one option |

The pattern: with either crate, the base handles CommonMark and the two
constructs that have upstream Obsidian-compatible support (frontmatter,
wikilink), and Verso handles the rest with positions the base hands it. With
our own parser, Verso also handles CommonMark.

### 3.4 Recommendation for ADR 0037

**`pulldown-cmark`**, under reading (b).

- Its output shape is the shape of the job. A read-only extractor with
  positions is a loop over `(event, byte range)`; `pulldown-cmark` is exactly
  that iterator, with nothing built that is later discarded.
- Smallest dependency surface of the two crates (three small crates, MIT), and
  no feature that has to be switched off to keep the crate pure.
- Wikilinks and embeds in Obsidian's form are upstream, with exact ranges,
  including the `![[` embed as an image.
- What it lacks (line/column in characters) is a ten-line helper over the
  source string, and the same helper is needed anyway to check the
  `pos` fixtures independently of the base.

**`comrak` is the named fallback**, not a discard. If, in the feature 1 PR,
`pulldown-cmark`'s ranges prove insufficient for a construct the fixtures
need, `comrak` with `default-features = false` and `sourcepos_chars` covers the
same ground with a tree. Swapping is a change inside `verso-dialect` only; the
fixtures do not change (ADR 0037, consequences).

**A parser of our own is not recommended for Phase 1.** Under (b) nothing
requires it, and its cost goes to CommonMark conformance, not to Verso's
dialect. It stays the path to take if the maintainer chooses reading (a).

### 3.5 What the recommendation closes, and what it leaves open

If the maintainer accepts both recommendations, this is what the closing PR
records:

**Closes**

- Q18: reading (b), with the four properties of section 2.3 as the definition
  of the round-trip property test in ADR 0029.
- ADR 0037: base parser `pulldown-cmark`, with `default-features = false`,
  options `ENABLE_WIKILINKS` and `ENABLE_YAML_STYLE_METADATA_BLOCKS`; `comrak`
  as the recorded fallback; a parser of our own as the recorded alternative
  tied to reading (a).
- The consequence in ADR 0012 that points at Q18 gets its answer.

**Leaves open** (unchanged by this memo; listed so the maintainer sees that
choosing the parser does not choose them):

- Q3, Q4, Q22 — where a `^id` may sit, its uniqueness scope, its charset.
- Q5 — callout kinds, fold, nesting.
- Q19 — heading matching. Q20 — Markdown links to a local file. Q21 — what a
  "block" is. Q23 — combined forms and escapes of the wikilink.
- Q24, Q25 — frontmatter boundary, YAML version, CRLF, BOM, encoding. The
  **YAML crate** is a new-dependency decision for the feature 1 PR, with its
  own justification.
- Which inputs the property test *generates* (the strategy): an implementation
  detail of the feature 1 PR, reviewed by Opus 5 as core code.
- Frontmatter editing through a form (section 2.5): a consequence for the
  typed-note ADR of Phase 2.

## 4. What this memo did not verify

The maintainer decides reading, so the limits of what was read have to be
visible:

- Neither crate was compiled or run in this repository. Every claim about
  behavior comes from docs.rs pages, the crates' `Cargo.toml`, and — for the
  wikilink and embed handling of `pulldown-cmark` — its parser source and unit
  tests, all read on 2026-09-21. Where the memo says "to confirm in the PR",
  it means it.
- WASM compilation of both crates is reported from their own manifests and
  public use, not from a `cargo check` here. The ADR 0029 guardrail does that
  check in the feature 1 PR and is seen failing first.
- `comrak`'s handling of `![[…]]` and the precision of its inline `sourcepos`
  on the five fixtures were not tested.
- No measurement backs the performance row of 3.2; it is a statement about
  the two designs (pull parser versus tree), to be replaced by the feature 5
  baseline.
- Obsidian's own behavior was not consulted for this memo; nothing here
  changes a fixture or answers a question about Obsidian (ADR 0009).

## 5. How the maintainer decides and verifies, without reading code

**Check that the memo is what the PR says it is:**

```
git fetch origin && git checkout phase1/parser-decision
git diff --stat origin/main..HEAD          # two files, both under docs/, no crates/, no fixtures/
bash scripts/check-docs-mirror.sh          # "docs mirror: ok"
bash scripts/check-fixtures.sh             # unchanged fixtures still pass the lint
git log --format='%an <%ae>%n%b' origin/main..HEAD   # author and Signed-off-by are yours
```

**Decide, in two lines on the PR:**

1. Q18: `(a)` or `(b)`.
2. ADR 0037: `pulldown-cmark`, `comrak` or `own`.

Combinations and their consequence:

| Q18 | Parser | Consequence |
|---|---|---|
| (b) | `pulldown-cmark` | The recommendation. Feature 1 starts as budgeted: base crate, dialect pass, four-property test, fuzz, WASM check. |
| (b) | `comrak` | Same shape, one more dependency layer to justify; `default-features = false` is mandatory or C code enters the build. |
| (b) | own | Allowed but pays the cost of section 2.4 for nothing (b) needs; the roadmap has to grow before feature 1 starts. |
| (a) | own | Consistent. Feature 1 becomes "a CommonMark parser with a lossless tree" first; the roadmap and the exit criteria of Phase 1 have to be revised in the same PR, per ADR 0037's consequences. |
| (a) | `pulldown-cmark` or `comrak` | Contradiction: neither meets (a) (section 3.2). Not a valid pair. |

**After the decision.** The maintainer chose (b) and `pulldown-cmark` in
session on 2026-09-21 ("I liked your suggestions, go ahead with them"). The
closing edits — spec §9 Q18, ADR 0037 "Decision" and "Status", ADR 0012's
consequence, the roadmap's Phase 1 table, briefing §9 and §17 — are in the
commit that follows the memo on the same branch, so that the comparison and
its outcome are one subject.
