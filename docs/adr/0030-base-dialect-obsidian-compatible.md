# ADR 0030 — Base dialect compatible with Obsidian; Verso extends, never contradicts

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §11.1, §10.4
- Status in the briefing: `DECIDED`
- Revisions: 2026-09-21 — public source cited and the list's criterion recorded
  (Phase 0 review, I3).

## Context

The file dialect is the second most expensive decision to reverse (§10.4):
once vaults written in the Verso dialect exist, changing it breaks the content
of those who trusted the project.

Public source backing the list below, admissible under
[0009](0009-external-constraints.md): the Obsidian documentation at
`help.obsidian.md`, in particular the pages "Obsidian Flavored Markdown",
"Internal links", "Embed files", "Callouts" and "Properties"; and the JSON
Canvas specification at `jsoncanvas.org`. The public documentation describes
more constructs than the list below (tags, `%%` comments, `==` highlight,
math, tables, footnotes, Markdown links to a file, nested heading paths). The
list below is the **minimum decided in the briefing**, not the ceiling: what is
left out is `[OPEN]` in the spec (Q13, Q15, Q19, Q20), not
"not supported".

## Decision

Verso reads and writes, without breaking:

- wikilinks: `[[nota]]`, `[[nota|alias]]`, `[[nota#seção]]`, `[[nota#^bloco]]`
- embeds: `![[...]]`
- callouts
- block definition: `^id`
- YAML frontmatter, including `tags` and `aliases`
- `.canvas` (JSON Canvas)

Verso extends that dialect; it never contradicts it.

## Consequences

- "Never contradicts" is a review criterion: any extension that changes the
  meaning of an existing construct is BLOCKING
  ([0033](0033-pr-workflow.md)).
- The concrete behavior lives in `docs/spec/dialect.md` and in the fixtures
  ([0031](0031-fixtures-as-contract.md)); the spec is where the gaps are
  marked `[OPEN]`.
- The admissible sources for determining Obsidian's behavior are only the
  public API, the public documentation and behavior observed from the outside
  ([0009](0009-external-constraints.md)).
- Three dialect items remain undecided: typed relation syntax, format and
  location of the schemas, per-block visibility syntax.

## Discarded alternatives

- An own dialect with no compatibility commitment — discarded in §1 and §11.1.

## Status

Accepted.
