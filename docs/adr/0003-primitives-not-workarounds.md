# ADR 0003 — What today requires a plugin should be an app primitive

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §1, §5.3 (heading)
- Status in the briefing: `DECIDED` (principle); the primitives catalog is
  `PROPOSED`

## Context

In Obsidian, much of the advanced usage is assembled from chained plugins
(Dataview, Templater, Periodic Notes, statblocks). The result is fragile: it
breaks on update, does not survive an author walking away, and produces content
that is invisible to git, to search and to an agent.

## Decision

The experience has to be complete without workarounds: what today requires a
third-party plugin to be usable should be an app primitive.

## Consequences

- Every common workaround becomes a candidate primitive, and every primitive
  needs its own ADR before being implemented.
- The concrete primitives catalog is still a proposal, not a decision
  ([0014](0014-primitives-catalog.md)).
- The principle does not authorize a large core: specific features remain
  candidates for a first-party plugin
  ([0017](0017-plugins-format-shim-loading.md)).

## Discarded alternatives

- Depending on third-party plugins for the basic experience — that is exactly
  the problem motivating the decision (§1, §5.3, §16.1).

## Status

Accepted.
