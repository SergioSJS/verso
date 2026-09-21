# ADR 0004 — Project name: Verso

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §2, §17 item 2
- Status in the briefing: `DECIDED` (name); `PROPOSED` (domain and package
  name); `OPEN` (availability)

## Context

The name has to exist before the repository. The briefing records known
collisions outside the note-taking app category: a platform for interactive
notebooks in .NET called Verso, a Verso browser built on Servo (archived) and
an image metadata editor in Perl.

## Decision

1. The project name is **Verso**.
2. There are no subproject names until there is code.
3. The name "Recto" is discarded.

## Consequences

- Domain `verso.md`: `PROPOSED`, availability not verified.
- Package/org name in case `verso` is taken: `verso-md`, `PROPOSED`.
- Availability on crates.io, npm, the GitHub org and the domain is `[OPEN]` and
  has to be verified before making the repository public
  ([0007](0007-private-repo-until-license.md)).
- The known collisions are outside the category and do not block use of the
  name; they may require disambiguation in searches.

## Discarded alternatives

- "Recto" as a subproject name — discarded in §2.
- Other names: the briefing records no other candidate that was evaluated.

## Status

Accepted for the name. Domain and alternative package name: Proposed.
Availability check: `[OPEN]`.
