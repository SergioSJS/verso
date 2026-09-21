# ADR 0007 — Repository private until the license is decided

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §3
- Status in the briefing: `DECIDED`

## Context

Code published without a license is not open source: without a license, nobody
has permission to use it. Publishing before deciding also opens the door to
contributions that would later have to consent to a relicensing.

## Decision

The repository stays private until the license is decided.

## Consequences

- No external contribution before the license decision
  ([0005](0005-license.md), [0006](0006-contribution-dco-no-cla.md)).
- The check for the availability of the name on crates.io, npm, the GitHub org
  and the domain has to happen before making the repository public
  ([0004](0004-project-name-verso.md)).
- Publication and first release are distinct events: the repository can open
  before a release exists.

## Discarded alternatives

None recorded. (Publishing early and licensing later was not evaluated; §3
already conditions visibility on the license decision.)

## Status

Accepted.
