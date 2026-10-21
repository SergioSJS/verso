# ADR 0014 — Catalog of Verso primitives

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.3
- Status in the briefing: `PROPOSED`
- Revisions: 2026-09-23 — two primitives accepted by the maintainer as the
  Phase 2 window builds them, the daily note and templates
  (`docs/review/phase-2.md` §6, item 11); the rest of the catalog stays
  Proposed. 2026-09-24 — the typed note accepted by the maintainer in an ADR
  of its own, [0052](0052-typed-note.md), as the first Consequence asks; its
  row here points there. 2026-09-24 — the structured views accepted by the
  maintainer in an ADR of their own, [0053](0053-views-bases.md): bases, in
  Obsidian's format; and the month of the daily notes in the side panel, part
  of the daily note's row. 2026-10-01 — the typed relation, decided on
  2026-09-30 in [0057](0057-board-json-canvas.md) (point 4, spec Q10), is
  pointed at here, by the maintainer's decision on the critical review
  [`docs/review/board.md`](../review/board.md), §6 item 16.
  2026-10-14 — the periodic notes of the time row accepted by the
  maintainer in an ADR of their own, [0093](0093-periodic-notes.md)
  (*"Sim, todas"*): the time row is accepted in full.

## Context

An application of the principle in
[0003](0003-primitives-not-workarounds.md): every common workaround in Obsidian
is a symptom of a missing primitive. The briefing proposes a catalog, still
unconfirmed.

## Decision (proposed, not confirmed; two primitives accepted on 2026-09-23, the typed note on 2026-09-24)

Verso implements primitives; specific features come as first-party plugins.

| Primitive | Replaces |
|---|---|
| Typed note: `type:` in the frontmatter + schema in a text file in the folder; with no schema, it is plain Markdown | Dataview, Templater, statblocks |
| Stable block ID, with backlinks and presence in the graph | open request on the Obsidian forum since 2020 |
| Typed relation: edge with type and direction; several relations between the same two nodes | links with no semantics |
| Time as a first-class citizen: daily and periodic notes | Periodic Notes, Calendar |
| Structured views that can materialize their output as real Markdown in the file | query results invisible to git, search and agents |
| Write provenance in the frontmatter: author, model, when | no equivalent |

**Two primitives accepted on 2026-09-23 by the maintainer**
(`docs/review/phase-2.md` §6, item 11; the answer: *"a e b ok"*), as the Phase 2
window builds them ([0049](0049-phase-2-scope-widened.md),
`docs/reference/app-decision.md`):

- **The daily note** — the daily part of the time row: one note per day,
  named by the date, in the folder the settings name, opened if it exists and
  otherwise created, from a template named like that folder — or, failing
  that, `Diário` or `Daily` — when there is one.
- **Templates** — any note in the folder the settings name is one; it is
  inserted into a note with `{{date}}` and `{{title}}` filled in, and a note
  can be saved into that folder as one.

Whether each still needs an ADR of its own, as the first Consequence asks of
every primitive, the answer did not say; that stays the maintainer's.
Periodic notes and every other row stay Proposed.

**The structured views, accepted on 2026-09-24 by the maintainer** in an ADR
of their own, [0053](0053-views-bases.md): a view is a base — a `.base` file
or a `base` block — in the format Obsidian documents, laid out as a table,
cards, a list, a kanban or a calendar; its rows materialize as a Markdown
table, as [0013](0013-degrades-to-markdown.md) asks. The row above keeps the
briefing's words; 0053 is the decision.

**The typed note, accepted on 2026-09-24 by the maintainer** in an ADR of its
own, [0052](0052-typed-note.md), on the memo
`docs/reference/typed-note-decision.md`: `type:` in the frontmatter names a
schema, which is a `verso-schema` block in a note of the folder; with no
schema, the note is plain Markdown. The row above keeps the briefing's words;
0052 is the decision.

## Consequences

- Each primitive needs its own ADR before being implemented; this ADR only
  records the catalog.
- Three items depend on syntax that is still `[OPEN]`: typed relation, format
  and location of schemas, and per-block visibility (`docs/spec/dialect.md`).
  *(The format and location of schemas decided on 2026-09-24: spec Q11. The
  typed relation decided on 2026-09-30: [0057](0057-board-json-canvas.md),
  point 4, spec Q10.)*
- "With no schema, it is plain Markdown" is what keeps compatibility with
  Obsidian vaults ([0012](0012-files-are-source-of-truth.md)).
- A block ID with backlinks and presence in the graph is a prerequisite for
  agent-verifiable citation ([0018](0018-llm-native-mcp-in-core.md)). "Stable"
  is only true for a `^id` written in the file: an ID that lived only in the
  index would be lost on a rebuild
  ([0011](0011-config-outside-tree-index-as-cache.md)),
  and an ID written by the app on open would violate
  [0012](0012-files-are-source-of-truth.md).
  A block with no `^id` is cited by position.
- Write provenance records personal data (the author) in a file that goes
  through sync, export and sharing with players. That primitive's own ADR has
  to say what is recorded and whether it is opt-in.
- Typed note (item 2.6 of Phase 2) requires promoting this catalog row to its
  own ADR, Accepted, before it is implemented — the roadmap lists that among
  the Phase 2 decisions. *(Done on 2026-09-24: [0052](0052-typed-note.md).)*
- Nothing in this catalog is in Phase 1, except what the parser and the index
  need to expose ([0034](0034-roadmap-in-phases.md)).


## Discarded alternatives

- Reproducing Dataview, Templater, Periodic Notes and statblocks as
  third-party plugins — that is the situation that motivates the catalog
  (§5.3, §16.1).

## Status

Proposed. The daily note and templates: accepted on 2026-09-23 (Decision).
The typed note: accepted on 2026-09-24, in [0052](0052-typed-note.md). The
typed relation: decided on 2026-09-30, in [0057](0057-board-json-canvas.md).

*2026-10-21* — the maintainer marked options in the decisions questionnaire of 2026-10-20 (answered 2026-10-21): **0014.a** `[DECIDED 2026-10-21]` (option A) provenance (author, model, when) in the frontmatter waits for after V1 and needs an ADR of its own (opt-in, personal data); **0014.b** `[DECIDED 2026-10-21]` (option A) the catalog's line "stable block ID" is accepted (`^id` works and is decided in spec Q3, Q4, Q21); **0014.c** `[DECIDED 2026-10-21]` (option A) the daily note and templates need no ADR of their own here: periodic notes are covered by [0093](0093-periodic-notes.md) and the templates already built.
