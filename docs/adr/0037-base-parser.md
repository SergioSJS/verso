# ADR 0037 — Base parser for `verso-dialect`

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §9, §17 item 4
- Status in the briefing: `OPEN`

## Context

`verso-dialect` needs a Markdown parsing base. The briefing lists three paths,
without choosing: `pulldown-cmark`, `comrak` or a parser of our own.

The choice is constrained by decisions already made:

- pure parser, no IO and no async ([0028](0028-crate-structure.md));
- target of `cargo-fuzz` and of the round-trip property test
  ([0029](0029-guardrails-in-ci.md));
- compilable to WASM, to serve as a conformance suite against CodeMirror 6's
  Lezer (§10.3);
- faithful preservation of the file, since opening never rewrites
  ([0012](0012-files-are-source-of-truth.md));
- dialect extensions (wikilink, embed, `^id`, callout) have to fit in the base
  ([0030](0030-base-dialect-obsidian-compatible.md));
- **positions** (line and column) for each construct, required by verifiable
  citation ([0018](0018-llm-native-mcp-in-core.md)) and by the `expected.yaml`
  schema (`docs/spec/dialect.md` §4);
- **the definition of round-trip** (`docs/spec/dialect.md`, Q18). There are two
  readings — a lossless tree with `serialize(parse(x)) == x`, or a read-only
  parser with edits by textual patch — and they pick different parsers:
  `pulldown-cmark` does not meet the first without a large amount of work. Q18
  is decided in the same PR as this ADR, before the comparison, because it is a
  criterion for it.

## Decision

None. Decide in the PR for feature 1 of Phase 1, with a justified comparison
between the three options against the criteria above, after Q18 is answered.

## Consequences

- Phase 1 does not start with the parser without that comparison in the PR
  ([0033](0033-pr-workflow.md)).
- Choosing wrong is reversible, but the cost grows with the size of the fixture
  corpus; the fixtures themselves are independent of the choice
  ([0031](0031-fixtures-as-contract.md)).
- If the choice is a parser of our own, the fuzzing and conformance effort goes
  up, and that has to appear in the roadmap.

## Discarded alternatives

None. All three options are still alive.

## Status

`[OPEN]`. Decide in the PR for feature 1 (Phase 1).
