# ADR 0001 — Open tool, no company and no paid product

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §1, §3
- Status in the briefing: `DECIDED`

## Context

Verso is born as an open alternative to a note-taking app maintained by a
company. The maintainer builds the project because they like building tools, not
out of an expectation of revenue. The consequences for license, governance and
scope derive from that starting point.

## Decision

1. Verso is an open tool that the community can evolve without depending on a
   company.
2. There is no paid service and no sustainability plan beyond donations.
3. Sustainability is through Ko-fi only. A donation does not buy a feature.

## Consequences

- There is no budget to buy time: scope is limited by the maintainer's time,
  which reinforces the small core and features as plugins
  (see [0014](0014-primitives-catalog.md), [0017](0017-plugins-format-shim-loading.md)).
- The license choice has to preserve the absence of a company in the middle
  (see [0005](0005-license.md)).
- Without a CLA, relicensing later requires the consent of contributors
  (see [0006](0006-contribution-dco-no-cla.md)).
- Funded requests do not jump the queue for having been funded; the queue is the
  maintainer's.
- The declared burnout risk (§10.3) is handled by scope, not by hiring.

## Discarded alternatives

- A paid service or any sustainability plan beyond donations — discarded in §1
  ("What it is not").

## Status

Accepted.
