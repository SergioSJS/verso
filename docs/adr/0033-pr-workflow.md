# ADR 0033 — PR workflow

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §14.4
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-24 — how a pull request reaches `main`, is merged and
  becomes part of a version: [0051](0051-development-flow-and-releases.md).

## Context

The PR is the point where the maintainer exercises authority over code they did
not write. For that, the PR has to be small enough to be understood and to
explain why it exists.

## Decision

1. Small PR, one subject.
2. Template: What / Why / Discarded alternatives / How to verify /
   Rust concept used (explained for a beginner).
3. If a fixture looks wrong, the author stops and asks; they never changes
   `expected.yaml`.
4. A new dependency requires justification in the PR.
5. The independent review classifies findings as BLOCKING, IMPORTANT or MINOR.
6. Merge only with green CI, no open BLOCKING, and if the maintainer can
   explain the PR in their own words.

## Consequences

- The "Rust concept used" section is part of the PR's value, not bureaucracy:
  it is the channel through which the maintainer learns the code they are
  approving ([0032](0032-author-and-reviewer-roles.md)).
- "The maintainer can explain it in their own words" is a subjective and
  deliberate gate: an incomprehensible PR is a PR that is too big, even with
  green CI.
- The template lives in `.github/pull_request_template.md`.
- Justifying a new dependency connects the PR to `cargo-deny`
  ([0029](0029-guardrails-in-ci.md)).
- The prohibition on changing `expected.yaml` is replicated in `CLAUDE.md`
  ([0031](0031-fixtures-as-contract.md)).

**Since 2026-09-24** ([0051](0051-development-flow-and-releases.md)): `main`
is protected and takes pull requests only; a branch holds one subject; the
maintainer merges with a merge commit, which keeps the hashes the documents
cite; a change a user can see adds its changelog line, in both languages.

## Discarded alternatives

- A big PR with several subjects — discarded in §14.4.
- Merge with an open BLOCKING or red CI — discarded in §14.4.

## Status

Accepted.
