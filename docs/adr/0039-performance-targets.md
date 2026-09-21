# ADR 0039 — Performance targets

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §13, §17 item 10
- Status in the briefing: `OPEN`

## Context

The briefing decides to measure — a benchmark with a synthetic vault recording a
baseline ([0035](0035-cross-cutting-requirements.md)) — and decides not to set
targets for now. Measuring before promising avoids made-up numbers.

## Decision

No performance target for now. Decide after the first baseline, which comes out
in Phase 1.

## Consequences

- Until then, the benchmark serves to detect relative regression, not to pass or
  fail against an absolute number.
- The synthetic vault generator has to be deterministic and versioned, otherwise
  the baseline is not comparable across runs.
- Once targets exist, they become a CI guardrail
  ([0029](0029-guardrails-in-ci.md)); before that, they do not.
- The recorded pain of large vaults freezing on the iPhone (§16.1) is the
  scenario that most likely defines the first target.

## Discarded alternatives

None. The briefing does not propose numbers.

## Status

`[OPEN]`. Decide after the first baseline.
