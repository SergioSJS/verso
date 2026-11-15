# ADR 0008 — Language of the repository documentation

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §3, §13, §17 item 3
- Status in the briefing: `OPEN` until 2026-09-21; `DECIDED` from the
  maintainer's decision
- Revisions: 2026-09-21 — `[OPEN]` closed by the maintainer ("it can be born in
  English, but with native pt-BR" / "pode nascer em inglês, mas com pt-BR
  nativo"; confirmed as English source, pt-BR mirror). Decision and Status
  filled in place.
  2026-10-29 — revised by the maintainer in session (*"pode ser"*, to the
  proposal to stop paying twice for every changelog line): the entries under
  `## Unreleased` are written in English only; the pt-BR twin gets them,
  translated, when a version is cut (item 2a).
  2026-10-24 — revised by the maintainer in session: internal engineering
  documentation (`CLAUDE.md`, `docs/adr/`, `docs/spec/`, `docs/reference/`,
  `docs/review/`, `docs/roadmap.md`, `docs/BRIEFING.md`,
  `.github/pull_request_template.md`) is kept in English only; the mandatory
  pt-BR mirror in `docs/pt-BR/` is scoped to public and community-facing
  documents (`README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`).

## Context

The briefing distinguishes two languages that are often confused:

- **Of the product**: pt-BR and EN from the first commit, `DECIDED`
  ([0035](0035-cross-cutting-requirements.md)).
- **Of the repository documentation** (ADRs, spec, roadmap, PRs, issues): pt-BR,
  EN or both, `OPEN`.

The choice affects who is able to contribute and how much it costs to maintain
duplicated documentation.

## Decision

Decided by the maintainer on 2026-09-21, and revised on 2026-10-24 to scope the
pt-BR mirror to public/community documents:

1. **English is the canonical language** for all repository documentation.
2. **Public and community-facing documents** (`README.md`, `CONTRIBUTING.md`,
   `CHANGELOG.md`, `SECURITY.md`) have a mandatory **equivalent pt-BR version**
   in `docs/pt-BR/` with the same file name and heading structure. A PR that
   changes one of these documents must update its twin in `docs/pt-BR/`.
   2a. **Except the changelog's unreleased section** (2026-10-29): entries
   under `## Unreleased` in `CHANGELOG.md` are English only; `## Não lançado`
   in `docs/pt-BR/CHANGELOG.md` keeps its heading and is filled, translated,
   in the PR that cuts the version (`scripts/release.mjs prepare`). The
   heading structure of both files stays the same.
   *Withdrawn 2026-11-15* (the maintainer: *"já lançamos!"* — Verso has
   public releases now): every change adds its entry to both changelogs in
   the same change, English under `## Unreleased` and Portuguese under
   `## Não lançado`, as the mirror check already asks.
3. **Internal engineering documentation** (`CLAUDE.md`, `docs/adr/`,
   `docs/spec/`, `docs/reference/`, `docs/review/`, `docs/roadmap.md`,
   `docs/BRIEFING.md`, `.github/pull_request_template.md`) is maintained in
   **English only**, avoiding token and maintenance duplication across 100+
   engineering files.
4. Commit messages, PR descriptions and issues: English.
5. The product remains pt-BR and EN
   ([0035](0035-cross-cutting-requirements.md)); that is a product requirement
   and does not change.

## Consequences

- Maintaining two languages for internal ADRs, specs and reference notes doubled
  the context and output cost for AI coding sessions across 80,000+ lines of
  Markdown. Scoping `docs/pt-BR/` to the four public-facing documents keeps the
  project accessible in Portuguese while freeing engineering sessions from
  translating internal specs and checklists.
- **Mechanical verification (`scripts/check-docs-mirror.sh`):** CI checks that
  each of the four mirrored public documents (`README.md`, `CONTRIBUTING.md`,
  `CHANGELOG.md`, `SECURITY.md`) has its twin in `docs/pt-BR/` with the same
  heading structure and equivalent links, that `docs/pt-BR/` holds no orphan
  files, and that every relative link in all tracked Markdown files resolves
  ([0029](0029-guardrails-in-ci.md)).

## Discarded alternatives

- pt-BR only — discarded: it restricts who contributes.
- Full mirror of all internal engineering documents in `docs/pt-BR/` — used from
  2026-09-21 to 2026-10-24; retired by the maintainer on 2026-10-24 because it
  doubled documentation volume and degraded AI coding sessions.

## Status

Accepted (2026-09-21); revised 2026-10-24 (English only for internal engineering
docs; pt-BR mirror for `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md` and
`SECURITY.md`); revised 2026-10-29 (unreleased changelog entries English
only, translated when a version is cut).
