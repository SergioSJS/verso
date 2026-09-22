# ADR 0035 — Cross-cutting requirements: pt-BR and EN, accessibility, benchmark

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §13
- Status in the briefing: `DECIDED` (i18n, accessibility, benchmark);
  `PROPOSED` (accessible board view); `OPEN` (performance targets)
- Revisions: 2026-09-22 — how the feature 4 code meets "no loose string
  literal" recorded under Consequences, as **provisional**; the Decision is
  unchanged (memo `docs/reference/cli-decision.md`).

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

**How "no loose string literal" is met in the CLI. Recorded on 2026-09-22 from
the feature 4 code — provisional, the maintainer decides on waking**, on line 3
of `docs/reference/cli-decision.md` §10. This is what the code does, not a
decision.

- **A `Msg` enum**, one variant per user-facing message, carrying its data as
  fields, and one function `messages::text(msg, lang)` with an **exhaustive
  `match` per language**. A message that exists in one language and not in the
  other does not compile: that is the whole mechanism, and it costs no
  dependency.
- **A test renders every variant in both languages**, which catches the
  copy-paste that leaves the English string in the pt-BR arm — the failure the
  compiler cannot see.
- **The language** comes from `--lang pt-BR|en`, else from the first of
  `VERSO_LANG`, `LC_ALL`, `LC_MESSAGES` and `LANG` that is set and non-empty: a
  value beginning with `pt` selects pt-BR, anything else selects EN, and an
  environment with none of them is EN. The usage and help text go through the
  same table, so `verso help` answers in two languages as well.
- **"Every print goes through `text`" is held by review, not by a lint.**
  `println!` is a macro and clippy's `disallowed_methods` names methods; there
  is no rule for "this `&str` reaches standard output". The code concentrates
  the printing so that the check is a grep, and this line records that the rest
  of the guarantee is human ([0033](0033-pr-workflow.md)).
- **No i18n crate.** `fluent`, `rust-i18n` and `gettext-rs` were looked at and
  not taken for three commands and a few dozen strings
  (`docs/reference/cli-decision.md` §4.2); the question is reopened for the
  Phase 2 UI, with a UI's requirements rather than a CLI's.

## Discarded alternatives

- Launching in one language only and translating later — discarded in §13.
- Accessibility as a later stage — discarded in §13.

## Status

Accepted.
