# ADR 0032 — Roles: the AI writes, the maintainer reviews behavior, author and reviewer in separate sessions

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §14.1
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-21 — UI/TS reviewer defined and "who wrote it" made precise
  as the model, not the session (Phase 0 review, C4).

## Context

The maintainer learns Rust in parallel, outside the project. If the same model
writes and reviews in the same session, the review inherits the author's
premises and stops being a review.

## Decision

1. The AI writes the code; the maintainer reviews behavior through the fixtures
   and questions decisions.
2. Opus 5: author of documents, author of UI/TS, reviewer of the core code.
3. Fable 5.1: author of the core code, reviewer of documents and of the UI/TS
   code.
4. Author and reviewer always in separate sessions; the reviewer does not see
   the author's reasoning.
5. "Whoever wrote it does not review it" holds for the **model**, not only for
   the session: the model that wrote an artifact does not review it, neither in
   the same session nor in another. That is why each type of artifact has an
   author and a reviewer of different models.

| Artifact | Author | Reviewer |
|---|---|---|
| Documents (ADR, spec, roadmap, `CLAUDE.md`) | Opus 5 | Fable 5.1 |
| Core code (Rust) | Fable 5.1 | Opus 5 |
| UI and TypeScript | Opus 5 | Fable 5.1 |
| Behavior (fixtures) and decisions | — | the maintainer |

## Consequences

- The reviewer receives the diff and the repository context, never the
  transcript of the author's session.
- Whoever writes the core does not review the core; whoever writes a document
  does not review their own document; whoever writes UI does not review UI.
- When the maintainer tells the reviewer to apply their own findings (as in the
  Phase 0 review), the reviewer becomes the author of that diff, and the diff
  needs a reading by the other model before the merge. The maintainer's
  authority does not waive that; it only decides whether the cost is worth it.
- The independent review classifies findings as BLOCKING, IMPORTANT or MINOR
  ([0033](0033-pr-workflow.md)).
- The maintainer is the final authority: without understanding the PR in their
  own words, there is no merge.
- This ADR was written by Opus 5 in the role of author of documents; the review
  is up to Fable 5.1 and to the maintainer.

## Discarded alternatives

- Author and reviewer in the same session — discarded in §14.1.

## Status

Accepted.
