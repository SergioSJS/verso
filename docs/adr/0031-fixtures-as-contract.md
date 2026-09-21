# ADR 0031 — Fixtures are the behavior contract between maintainer and AI

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §11.4, §14.1
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-21 — rule for a fixture that answers an open question,
  field for the origin of the observation and reference to the `expected.yaml`
  schema (Phase 0 review, C6, C7, I3). 2026-09-21 — item 4 changed by the
  maintainer: any fixture may be drafted by the AI; approval, not authorship,
  is what makes it count. `scripts/check-fixtures.sh` added as structure lint.

## Context

The maintainer reviews behavior, not the Rust implementation
([0032](0032-author-and-reviewer-roles.md)). For that, they need a readable
artifact that says what is right — and that the AI cannot adjust when the code
disagrees.

## Decision

1. Structure: `fixtures/<category>/<case>/input.md` and
   `fixtures/<category>/<case>/expected.yaml`.
2. The fixtures are the behavior contract between the maintainer and the AI.
3. `expected.yaml` only changes with the maintainer's explicit approval.
4. Any fixture may be drafted by the AI. A fixture only counts with the
   maintainer's explicit approval, given in the PR that adds it. For the first
   five, approval includes checking the behaviour in the Obsidian app and
   recording how in `observed:`. Independence comes from the approval, not
   from who typed the file. (Wording until 2026-09-21: "the first 5 fixtures
   are written by hand by the maintainer"; changed by the maintainer.)

Minimum categories: simple wikilink, with alias, with heading, with `#^bloco`;
`![[...]]` embed; block definition `^id`; link inside inline code and inside a
code block (does not count as a link); frontmatter with `tags` and `aliases`;
note names with accents and spaces.

## Consequences

- If a fixture looks wrong, the author stops and asks; they never edits
  `expected.yaml` to make the test pass. That rule is replicated in `CLAUDE.md`
  and in the PR template ([0033](0033-pr-workflow.md)).
- The same corpus serves as a conformance suite for the Rust parser and for the
  editor's parser in JS, mitigating the divergence recorded in §10.3.
- The YAML format of `expected.yaml` has to remain human-readable: it is what
  the maintainer reviews.
- A new fixture accompanies the feature that produces it; a parser PR without a
  fixture is incomplete.
- The `expected.yaml` schema (keys, meaning of an absent key, order, shape of
  `target`, positions) is in `docs/spec/dialect.md` §4. A fixture that does not
  follow the schema is invalid, not "creative".
- **A fixture that answers an `[OPEN]` question of the spec only goes in in the
  same PR that closes the question.** The PR updates section 9 of the spec
  citing the fixture as the answer, and the maintainer's approval in that PR is
  the decision. A fixture approved without that step closes no question at all,
  and the spec still rules. This reconciles "the fixture wins" (spec §1) with
  "nothing becomes a decision outside an ADR or the briefing" (`CLAUDE.md` §1):
  the decision is recorded where the rule says.
- Every fixture that asserts behavior compatible with Obsidian records **how**
  the behavior was observed (`observed:` in `expected.yaml`, see spec §4): app
  version and a reproducible step. Without that the fixture records memory, not
  observation, and there is no way to re-contest it when Obsidian changes.

## Discarded alternatives

- Reviewing behavior by reading the Rust code — discarded in §14.1, given that
  the maintainer is learning Rust in parallel.

## Status

Accepted.
