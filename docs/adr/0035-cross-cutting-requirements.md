# ADR 0035 — Cross-cutting requirements: pt-BR and EN, accessibility, benchmark

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §13
- Status in the briefing: `DECIDED` (i18n, accessibility, benchmark);
  `PROPOSED` (accessible board view); `OPEN` (performance targets)

## Context

i18n and accessibility are cheap at the start and expensive later: adding a
language or accessible semantics to a finished UI usually requires rewriting
the UI.

## Decision

1. pt-BR and EN from the first commit.
2. Accessibility from the start.
3. Benchmark with a synthetic vault recording a baseline.

## Consequences

- "From the first commit" means **from the first commit of product code**:
  Phase 0 is documentation and empty crates. It holds for the Phase 2 UI and
  for the Phase 1 CLI messages: no loose string literal. Phase 1 gets a scope
  item and an exit criterion for that (`docs/roadmap.md`), and whatever i18n
  dependency `verso-cli` needs is justified in the PR like any other
  ([0033](0033-pr-workflow.md)).
- The product language (pt-BR and EN, decided) is independent of the language
  of the repository documentation, decided separately: English as the source,
  pt-BR as the mirror ([0008](0008-documentation-language.md)).
- The board needs an equivalent accessible view — a list or table of the same
  notes and relations (`PROPOSED`, [0024](0024-board-excalidraw.md)).
- The benchmark goes in as a guardrail in Phase 1
  ([0029](0029-guardrails-in-ci.md)), but with no target: performance targets
  are `[OPEN]` ([0039](0039-performance-targets.md)).
- Schema i18n with a language-neutral key is a separate proposal
  (`docs/spec/dialect.md`).

## Discarded alternatives

- Launching in one language only and translating later — discarded in §13.
- Accessibility as a later stage — discarded in §13.

## Status

Accepted.
