# ADR 0008 — Language of the repository documentation

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §3, §13, §17 item 3
- Status in the briefing: `OPEN` until 2026-09-21; `DECIDED` from the
  maintainer's decision
- Revisions: 2026-09-21 — `[OPEN]` closed by the maintainer ("it can be born in
  English, but with native pt-BR" / "pode nascer em inglês, mas com pt-BR
  nativo"; confirmed as English source, pt-BR mirror). Decision and Status
  filled in place.

## Context

The briefing distinguishes two languages that are often confused:

- **Of the product**: pt-BR and EN from the first commit, `DECIDED`
  ([0035](0035-cross-cutting-requirements.md)).
- **Of the repository documentation** (ADRs, spec, roadmap, PRs, issues): pt-BR,
  EN or both, `OPEN`.

The choice affects who is able to contribute and how much it costs to maintain
duplicated documentation.

## Decision

Decided by the maintainer on 2026-09-21: **English is the source; pt-BR is a
first-class mirror.**

1. Every repository document (ADR, spec, roadmap, `CLAUDE.md`, reviews, PR
   template, `README`, `CONTRIBUTING`) **is born in English**, at the canonical
   path (`docs/adr/`, `docs/spec/`, `CLAUDE.md`, ...).
2. Every document has an **equivalent pt-BR version** in `docs/pt-BR/`, with the
   same folder structure and the same file name. "Native" means written by
   someone who writes pt-BR, not machine translation, and complete: a PR that
   changes a document changes both sides, or it does not merge.
3. File names are in English on both sides; the ADR number is the identity. The
   current files are renamed to an English slug.
4. Single exception: `docs/BRIEFING.md` is a historical document, written in
   pt-BR before the repository. The original stays in `docs/pt-BR/BRIEFING.md`
   and is the version that rules in case of divergence; `docs/BRIEFING.md` is
   the translation. Every other document has English as the source.
5. Commit messages, PR descriptions and issues: English.
6. The product remains pt-BR and EN
   ([0035](0035-cross-cutting-requirements.md)); that is another decision and
   does not change.

## Consequences

- Maintaining two languages doubles the cost of every ADR and of every change to
  the spec. The maintainer accepted the cost in exchange for contribution reach
  ([0001](0001-open-tool-no-company.md)) without losing the language in which they
  thinks about the project.
- **Migration:** the existing documents are translated into English and moved to
  the canonical paths; the current pt-BR becomes the mirror in `docs/pt-BR/`.
  Item 0.12 of the roadmap, inside Phase 0. Translation author: Opus 5;
  reviewer: Fable 5.1 ([0032](0032-author-and-reviewer-roles.md)).
- **Mechanical verification:** a script in CI checks that each canonical `.md`
  has its twin in `docs/pt-BR/` and vice versa, and that the two have the same
  heading structure. It comes in as a workspace guardrail in item 0.11
  ([0029](0029-guardrails-in-ci.md)). Equivalent content is human review;
  presence and structure are CI.
- Relative links work on both sides without adjustment, because the structure
  and the names are the same: `../adr/0005-license.md` resolves both from
  `docs/spec/` and from `docs/pt-BR/spec/`.
- The repository can open when the migration is finished and the availability of
  the name has been verified ([0007](0007-private-repo-until-license.md),
  [0004](0004-project-name-verso.md)).

## Discarded alternatives

- pt-BR only — discarded: it restricts who contributes.
- English only, with no mirror — discarded by the maintainer: pt-BR is the
  language in which the project was thought out and in which they read it.
- pt-BR as the source with English as the mirror — discarded: the document the
  community reads first should be the one that is born first.
- English only for what is public (README, CONTRIBUTING), the rest in pt-BR —
  discarded: ADRs and spec are what a contributor needs to read in order to
  propose a change.

## Status

Accepted. English source, pt-BR mirror. Decided by the maintainer on
2026-09-21.
