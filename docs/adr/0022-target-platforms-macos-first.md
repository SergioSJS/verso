# ADR 0022 — Target platforms and macOS first

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §9
- Status in the briefing: `DECIDED`

## Context

The project has one maintainer. Supporting five platforms from the start is the
fastest route to the burnout recorded in §10.3.

## Decision

1. Target platforms: macOS, Windows, Linux, iOS and Android.
2. Initial platform: macOS.
3. Per-platform limitations are acceptable, as long as they are explicit.

## Consequences

- "Explicit" has an address: runtime capabilities, and the rule that the UI
  explains the absence of a feature instead of hiding it
  ([0027](0027-runtime-capabilities.md)).
- Phase 2 is a walking skeleton on macOS only
  ([0034](0034-roadmap-in-phases.md)); mobile is out of scope until then.
- CI runs on macOS and Linux from Phase 0 on, even with no UI on Linux
  ([0029](0029-guardrails-in-ci.md)), so as not to accumulate platform
  divergence in the core.
- The iOS and Android constraints are already recorded and should not be
  rediscovered when mobile lands ([0009](0009-external-constraints.md)).

## Discarded alternatives

None recorded: the briefing does not discuss another initial platform.

## Status

Accepted.
