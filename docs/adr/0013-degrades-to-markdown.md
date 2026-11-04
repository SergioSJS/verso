# ADR 0013 — All structured data degrades to readable Markdown

- Date: 2026-09-21
- Source: `docs/BRIEFING.md` §5.2
- Status in the briefing: `PROPOSED` until 2026-09-24; `DECIDED` from the
  maintainer's decision (the briefing's History, v0.9)
- Revisions: 2026-09-24 — promoted to Accepted by the maintainer, in session,
  on the memo `docs/reference/typed-note-decision.md` §4.3 (option A), with
  the typed note ([0052](0052-typed-note.md)): the Decision confirmed as
  written, and two words of the Consequences — "views" and "structured
  data" — delimited as the memo proposed. Decision heading and Status edited
  in place.

## Context

Structure is usually added to a notes app as a database or as a syntax of its
own. In both cases, whoever opens the file in another editor sees something
unreadable, and git, search and agents stop seeing the content (§16.1).

## Decision

All structured data in Verso degrades to Markdown readable in any editor.

Proposed in the briefing, **accepted on 2026-09-24 by the maintainer** as
written, in session, on the memo `docs/reference/typed-note-decision.md` §4.3:
the author's recommendations of the day, this one among them, were put to the
maintainer as one list; the answer: *"Tirando o plano de fazer vários PR, eu
gosto das suas recomendações"* ("apart from the plan of several pull
requests, I like your recommendations"). It binds every structured feature —
typed notes and schemas now, relations and views when they come.

## Consequences

- No structured feature can exist only in the index
  ([0011](0011-config-outside-tree-index-as-cache.md)).
- Views have to be able to materialize their output as real Markdown in the
  file ([0014](0014-primitives-catalog.md)).
- Typed relation syntax, still `[OPEN]`, is constrained by this proposal: it
  has to be readable outside Verso (`docs/spec/dialect.md`). *(Decided on
  2026-09-30: spec Q10, ADR 0057 point 4.)*
- The cost is redundancy: the same data appears in the file and in the index,
  and the two have to agree.
- "Readable Markdown" is read as **text readable in any editor, in the format
  the data already has**. The rule targets data that, without it, would live
  only in the index or in a database. `.canvas` (JSON Canvas) is already in the
  base dialect ([0030](0030-base-dialect-obsidian-compatible.md)) and is text:
  it does not contradict the proposal, and
  [0040](archive/0040-board-persistence.md) builds on that.
- **Two words delimited on acceptance, 2026-09-24** (memo §4.3, and §10,
  item 3):
  - **"Views"**, in the second consequence, means the structured-views
    primitive of [0014](0014-primitives-catalog.md) — a query whose output a
    view could write into the file, such as the kanban, calendar and table
    views [0049](0049-phase-2-scope-widened.md) §3 kept out of Phase 2 — and
    not the window's panels: the graph, the backlinks, the search and the
    folder view show what the files already hold.
  - **"Structured data"** means what users write about their notes —
    properties, types, schemas, relations, a view's output — and not the
    app's settings and layout, which
    [0011](0011-config-outside-tree-index-as-cache.md) puts outside the tree;
    bookmarks sit on that line.
- What Phase 2 builds complies already: notes, templates, the daily note, the
  `url` of a web note, the bin and the rename plans are all files; the typed
  note and its schemas are notes ([0052](0052-typed-note.md)).

## Discarded alternatives

- Keeping structured data only in a database — the briefing cites Logseq's
  transition to a database version as a reference, not as a path (§16.2).
- Accepting it for typed notes and schemas only, leaving it a proposal for
  relations and views — considered by the maintainer on the memo (§4.3,
  option B) and set aside on 2026-09-24: the next primitive would argue the
  principle again.

## Status

Accepted on 2026-09-24 by the maintainer (Decision). Proposed until then.
