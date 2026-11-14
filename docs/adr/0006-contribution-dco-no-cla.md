# ADR 0006 — Contribution through DCO, without CLA

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §3
- Status in the briefing: `PROPOSED` until 2026-09-21; `DECIDED` from the
  maintainer's confirmation, together with the license
- Revisions: 2026-09-21 — Proposed confirmed by the maintainer; item 2
  (AI-written code) added as their decision, answering analysis 2 of
  [0005](0005-license.md).

## Context

A CLA concentrates the right to relicense the project in whoever receives it.
That is exactly the arrangement Verso wants to avoid, since the absence of a
company in the middle is the reason the project exists
([0001](0001-open-tool-no-company.md)).

In this project the AI writes the code
([0032](0032-author-and-reviewer-roles.md)). The DCO certifies origin and the
right to submit; it has to say what that means when the one who typed was a
model.

## Decision

1. Adopt the DCO (Developer Certificate of Origin) through commit sign-off,
   without a CLA.
2. **AI-written code comes in through the same DCO, under the same
   `Signed-off-by` line, and is accepted as long as the person who signs has
   command of the code and takes responsibility for it.** Signing is a
   declaration: "I understand what this does, I decided it goes in, and I answer
   for it as if I had written it." There is no signature by the AI and no
   separate category of commit.

## Consequences

- Relicensing later requires the consent of each contributor, which amplifies
  the weight of the license decision ([0005](0005-license.md)). With Package A
  decided, the possible path remains combining with AGPL into a larger work,
  never the reverse.
- Contributing costs one `Signed-off-by` line, with no external signing process.
- Item 2 is what gives human grounding to copyleft over model-generated code:
  the authorship the license protects is that of whoever directed, reviewed and
  signed. The gate "the maintainer can explain the PR in their own words"
  ([0033](0033-pr-workflow.md)) stops being only a quality criterion and becomes
  the condition for signing. A PR the signer cannot explain cannot receive a
  `Signed-off-by`.
- The same holds for an external contributor who uses AI: whoever answers for it
  signs, not the tool. A `CONTRIBUTING.md` saying so in one sentence comes in
  before the repository opens ([0007](archive/0007-private-repo-until-license.md)).
- The recommendation to consult someone in intellectual property before opening
  the repository ([0005](0005-license.md)) still holds; this ADR sets the
  project's policy, not the interpretation of each jurisdiction.

- Phase 0 commits carry no `Signed-off-by`: accepted as they are by the
  maintainer on 2026-09-21 (review §7). From the first Phase 1 commit on,
  every commit carries the sign-off, and CI may check it once the DCO check
  is added to the workflow.

## Discarded alternatives

- CLA — discarded in §3: it would allow relicensing, which contradicts the goal
  of having no company in the middle.
- Marking AI-generated commits as their own category, with a trailer or a
  separate author — discarded by item 2: responsibility belongs to whoever
  signs, and a separate category would suggest the opposite.

## Status

Accepted. Confirmed by the maintainer on 2026-09-21, together with the license.
