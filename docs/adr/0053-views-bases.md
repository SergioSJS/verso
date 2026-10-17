# ADR 0053 — Views over the folder: bases, in Obsidian's format

- Date: 2026-09-24
- Source: the maintainer, in session, on 2026-09-24 — the priority
  ("Visões e janelas: kanban, calendário e tabela sobre as notas; uma segunda
  janela na mesma pasta. deve ser a prioridade agora. são funções básicas e
  importantes") and four answers, recorded in the memo
  [`docs/reference/views-decision.md`](../reference/views-decision.md);
  [0014](0014-primitives-catalog.md) (the structured-views row),
  [0013](0013-degrades-to-markdown.md) (views materialize as Markdown),
  [0030](0030-base-dialect-obsidian-compatible.md) (Verso extends Obsidian's
  dialect, never contradicts it), [0049](0049-phase-2-scope-widened.md) §3
  (asked for and not built, until this ADR)
- Status in the briefing: `PROPOSED` for the structured-views row of §5.3
  until 2026-09-24; `DECIDED` from the maintainer's answers of that day
- Revisions: 2026-10-14 — the Consequences' "Not built" list answered by
  [0094](0094-the-rest-of-bases.md), accepted by the maintainer that night
  (*"Sim, todas"*): regular expressions, the map layout, `html()` drawn
  through the sanitizer and a base embedded from another file edited in
  place, all in V1; pictures as maps not in V1.

## Context

The maintainer asked for kanban, calendar and table views over the notes on
2026-09-22 and 2026-09-23 (the window's first days); [0049](0049-phase-2-scope-widened.md)
§3 kept them out of Phase 2 with the board. On 2026-09-24 the maintainer made
them the priority, as basic functions.

Obsidian has them as a core plugin, Bases, documented in public pages read on
2026-09-24 from `obsidian.md/help` and its source, the public repository
`obsidianmd/obsidian-help`: a base is YAML — `filters`, `formulas`,
`properties`, `summaries`, `views` — saved as a `.base` file or embedded in a
note as a fenced block whose language is `base`; its views are laid out as a
table, cards or a list (app 1.9 and 1.10), on a map through a plugin, and as a
kanban from app 1.14, in early access when this was written. There is no
calendar among them; community plugins add one. Invariant 12 says Verso
extends that dialect and never contradicts it: a table Verso shows has to be
the base Obsidian shows, from the same file.

## Decision

**Decided on 2026-09-24 by the maintainer**, in session, choosing among
options the author put with its recommendation (the memo, section 2):

1. **Tables are Obsidian's bases** — the recommendation: `.base` files and
   `base` blocks, in the syntax "Bases syntax" documents, with the table, the
   cards and the list as their layouts.
2. **The kanban is the bases' own** — the maintainer's choice against the
   recommendation, which was the format of the Task List Kanban plugin the
   maintainer's Sandbox vault has: notes as cards in one column per value of
   the view's `groupBy` property, the notes without a value in "None"; a card
   moved to another column writes that value into its note — a Markdown note,
   never a formula or a file field; "+" on a column makes a note holding its
   value. As Obsidian 1.14's "Kanban view" page describes it.
3. **The calendar is both** — the recommendation: a `calendar` layout of bases,
   a Verso extension, over a date property of the notes; and the
   month of the daily notes in the side panel, where a click opens the day's
   note or makes it ([0014](0014-primitives-catalog.md), the daily note).
4. **A `verso-schema` block counts only at the top level of a note** — the
   recommendation, on the question [0052](0052-typed-note.md) left open (point
   3): a block inside a list or a callout is not read as a schema, and the
   note says so. Item 2.6 builds it; nothing here reads schemas yet.

What follows is how the author built points 1 to 3, labelled as the author's
where the answers did not say it (the memo, section 3):

- **The calendar's moves.** A note dragged to another day has its date
  written; "+" on a day makes a note on it.
- **The core evaluates, the window draws.** `verso-dialect` reads a base and
  the expression language of its filters and formulas, with bounds on length
  and depth, fuzzed with the parser; `verso-core` evaluates it over the files
  the last walk listed and what the index keeps of each note, with a budget of
  steps per query; the contract carries the rows and the window lays them out
  ([0026](0026-core-ui-contract-inviolable-rules.md) rule 1).
- **What is not evaluated is said, never guessed**: regular expressions, a
  function or method the language does not have, a formula that needs itself
  — an error in the cell and a line above the view.
- **A view writes one property of one note**, the key's lines only, through
  the window's ordinary write over the revision it read (invariant 11), after
  saving the note's open tabs; a value it cannot write back (a list, a link)
  is edited in the note's properties panel.
- **The base's own file** changes only from the view's menus, keeping its
  comments and every key they do not touch; opening never rewrites it
  (invariant 7). What Verso keeps for a layout that Obsidian names no public
  key for — the kanban's column order — goes under the view's own `verso:`
  mapping, out of Obsidian's and its plugins' way.
- **The calendar's keys** are the ones community calendar views write in
  public bases: `startDate`, `endDate`, `weekStartDay`.
- **A view's output materializes as Markdown**
  ([0013](0013-degrades-to-markdown.md)): its rows copy as a Markdown table or
  as CSV, and save into a new note as a table.

## Consequences

- A `.base` file opens in a tab with two modes, the view and its YAML; a
  `base` block and an embed `![[File.base]]` or `![[File.base#View]]` show the
  view in the reading view and in Live Preview.
- Every base on screen asks again when the folder changes: a note written by
  a view, by another window or outside the app.
- New code: `verso_dialect::bases` (under the fuzz target), `verso_core::bases`,
  the contract's `BaseQuery` and `BaseResult`, the host's `query_base`, and
  the window's `app/ui/src/bases`. One new dependency, the `yaml` npm package
  (ISC, no dependencies of its own), to change the base's YAML without
  rewriting what the menus do not touch.
- Obsidian 1.14's own keys for the kanban's column order, colours and widths
  are not public: until they can be observed, Verso keeps its own under
  `verso:` and reads no other.
- Not built: regular expressions, the map layout, `html()` rendered as HTML
  (it shows its text), per-view editing of a base embedded from another file
  (it switches views only).
- The index is unchanged: what a base asks of a note is read from the text
  the index keeps, and kept in memory per note hash.

## Discarded alternatives

- **The Task List Kanban plugin's format** for the kanban — a board file whose
  tasks come from the notes, one column per tag — recommended by the author
  from the maintainer's own Sandbox, and set aside by the maintainer for the
  bases' kanban.
- **A format of Verso's own** for tables — put to the maintainer and set
  aside: it would repeat what Obsidian already writes, against invariant 12.
- **A calendar of the daily notes only**, and **a calendar layout only** — put
  to the maintainer, who chose both.

## Status

Accepted on 2026-09-24 by the maintainer, in session: points 1 to 4 of the
Decision. The rest of the Decision is the author's, built under it and
labelled as such in the memo, for the maintainer to question.
