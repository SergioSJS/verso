# ADR 0038 — TypeScript type generation from Rust

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §9, §17 item 5
- Status in the briefing: `OPEN`

## Context

Rule 3 of the contract requires TS types to be generated from Rust, not written
by hand ([0026](0026-core-ui-contract-inviolable-rules.md)). The briefing lists
two candidates, without choosing: `ts-rs` or `specta`.

## Decision

None. Decide at the start of Phase 2.

## Consequences

- Until the decision, there is no typed contract on the JS side; Phase 1 does
  not need one, being CLI only ([0034](0034-roadmap-in-phases.md)).
- The choice affects how the contract types are annotated in Rust, so it touches
  core code even though it is a TS-side tool.
- CI has to verify that the generated types are up to date; otherwise rule 3
  becomes a convention ([0029](0029-guardrails-in-ci.md)).

## Discarded alternatives

- TS types written by hand — discarded by rule 3 of the contract (§10.1).

## Status

`[OPEN]`. Decide at the start of Phase 2.
