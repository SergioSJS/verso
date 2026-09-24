# ADR 0033 — PR workflow

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §14.4
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-24 — how a pull request reaches `main`, is merged and
  becomes part of a version: [0051](0051-development-flow-and-releases.md).
  2026-09-24 — decision 1 suspended by the maintainer until the whole flow
  exists — sync, the web, mobile: until then work goes in large pull
  requests, and small, one-subject pull requests come back after it
  (Consequences, with the maintainer's words).

## Context

The PR is the point where the maintainer exercises authority over code they did
not write. For that, the PR has to be small enough to be understood and to
explain why it exists.

## Decision

1. Small PR, one subject. *(Until the whole flow exists — sync, the web,
   mobile — work goes in large pull requests instead, by the maintainer's
   decision of 2026-09-24; small, one-subject pull requests after it:
   Consequences.)*
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

**The size of a pull request, from 2026-09-24.** Put the author's plan to
bring the work of the day in several pull requests, the maintainer answered,
in session: *"Tirando o plano de fazer vários PR, eu gosto das suas
recomendações"* ("apart from the plan of several pull requests, I like your
recommendations"); and, on pull requests: *"Quando a gente tiver todo o fluxo
completo com sync, web, mobile, etc fará sentido pra menores"* ("when we have
the whole flow complete, with sync, web, mobile and so on, smaller ones will
make sense"). So, until the whole flow exists — sync, the web, mobile — work
goes in large pull requests, and no one asks for one to be split into small
ones; once it exists, decision 1 applies again. A branch may carry several
subjects until then ([0051](0051-development-flow-and-releases.md),
Decision 2). Nothing else here changes: the template, the stop on a fixture
that looks wrong, the justification of a new dependency, the three levels of
findings, and the three merge conditions — the maintainer still has to be
able to explain the pull request in their own words.

## Discarded alternatives

- A big PR with several subjects — discarded in §14.4. *(Taken up by the
  maintainer on 2026-09-24 until the whole flow exists: Consequences.)*
- Several smaller pull requests for the work of 2026-09-24 — the author's
  plan, set aside by the maintainer the same day (Consequences).
- Merge with an open BLOCKING or red CI — discarded in §14.4.

## Status

Accepted.
