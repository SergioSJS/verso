# ADR 0037 — Base parser for `verso-dialect`

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §9, §17 item 4
- Status in the briefing: `OPEN` until 2026-09-21; `DECIDED` from the
  maintainer's decision
- Revisions: 2026-09-21 — `[OPEN]` closed by the maintainer on the comparison
  in `docs/reference/parser-decision.md`, after Q18 was answered in the same
  session. Decision, Consequences, Discarded alternatives and Status filled in
  place; Context unchanged.

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

Decided by the maintainer on 2026-09-21, on the comparison in
`docs/reference/parser-decision.md`, under reading (b) of Q18 (read-only
parser, edits by textual patch; `docs/spec/dialect.md` §9):

1. **Base parser: `pulldown-cmark`**, imported with `default-features = false`
   (feature `std` only), options `ENABLE_WIKILINKS` and
   `ENABLE_YAML_STYLE_METADATA_BLOCKS`. Its output — a stream of events, each
   with its byte range in the source — is the shape of a read-only extractor;
   wikilinks and `![[…]]` embeds in Obsidian's form are supported upstream with
   exact ranges; three small MIT dependencies.
2. **`comrak` is the recorded fallback.** If the ranges of `pulldown-cmark`
   prove insufficient for a construct the fixtures need, `comrak` with
   `default-features = false` and `parse.sourcepos_chars` covers the same
   ground with a tree. The swap stays inside `verso-dialect`; the fixtures do
   not change.
3. **`verso-dialect` writes the dialect pass itself**, on top of the base:
   splitting a wikilink target into `target`, `heading` and `block`; `^id` at
   the end of a block; callouts from the first line of a blockquote (the base's
   GitHub-alert extension stays off: it knows five fixed kinds and no fold
   marker, Obsidian's callouts are open-ended); positions in line and Unicode
   character column (spec §4.4) computed from the byte ranges; YAML parsing of
   the frontmatter block the base hands over opaque.

## Consequences

- Feature 1 of Phase 1 starts as budgeted: base crate, dialect pass, the
  four-property round-trip test of Q18, the fuzz target and the WASM check
  ([0029](0029-guardrails-in-ci.md)). No roadmap change.
- `pulldown-cmark` and its three dependencies enter `Cargo.toml` and the
  `cargo-deny` allowlist (MIT) in the feature 1 PR, with the justification
  above; the same PR decides the **YAML crate**, a separate new-dependency
  decision (`serde_yaml` is archived upstream; Q24 on YAML 1.1 versus 1.2
  stays open).
- Claims about the two crates in the comparison were read from their public
  documentation, manifests and source on 2026-09-21, not compiled here. The
  guardrails of the feature 1 PR confirm them: `cargo check` for
  `wasm32-unknown-unknown`, the fuzz target, and the five approved fixtures'
  `pos` against the ranges the base reports. A claim that fails there is
  reported in that PR, not silently worked around.
- Choosing wrong is reversible, but the cost grows with the size of the fixture
  corpus; the fixtures themselves are independent of the choice
  ([0031](0031-fixtures-as-contract.md)). Swapping to the fallback is a change
  inside `verso-dialect` only.
- A future feature that edits the frontmatter through a form (typed note,
  Phase 2 item 2.6) needs a YAML-preserving textual patch, since spec §5.1
  forbids normalizing key order, comments and quoting. To record in the ADR of
  the typed note; not a parser concern.

## Discarded alternatives

- **`comrak`** as the base — not discarded, kept as the fallback (Decision,
  item 2). Not chosen first because it builds a tree per file that a read-only
  extractor does not use, its default features pull in a CLI and `syntect`
  with C Oniguruma (must be switched off), and it has seven dependencies to
  `pulldown-cmark`'s three.
- **A parser of our own** — discarded for Phase 1. Under reading (b) nothing
  requires it, and its cost goes to CommonMark conformance (about six hundred
  spec examples; the code-span and fence rules that `no-link-in-code` depends
  on), not to Verso's dialect. It is the path tied to reading (a) of Q18,
  which the maintainer did not choose.
- **`pulldown-cmark` or `comrak` under reading (a)** — an invalid pair: neither
  keeps the trivia needed to re-serialize the original bytes.

## Status

Accepted.
