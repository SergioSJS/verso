# ADR 0064 — Tables edited as tables in Edit mode

- Date: 2026-10-06
- Source: the maintainer, in session, building a table in Edit mode: "cara,
  fui contruir uma tabela, a experiencia ta ruim de mais" (I went to build a
  table; the experience is far too bad). Asked how a table should be edited,
  they chose "Sempre como tabela" (always as a table). It refines the
  "tables with editing help" of [0049](0049-phase-2-scope-widened.md) §1.
- Status in the briefing: not present
- Revisions: 2026-10-07 — column widths, at the maintainer's request
  (backlog: "nas tabelas deveria ser possível redimensionar a largura das
  colunas"); asked where a width should be kept, they chose "guardada pelo
  Verso, fora do arquivo" (point 6).

## Context

Edit mode drew a table rendered while the caret was outside it and turned
it back into its Markdown text as soon as the caret went in: pipes in a
monospaced face, the columns out of line as one typed until the next Tab,
and a new table's header filled with the word "Column". Obsidian and
Notion both edit a table as a table.

## Decision

Written by the author from the maintainer's choice above, and accepted by
it (Status).

1. **In Edit mode a table is always drawn as a table**, the caret in it or
   not, and each cell is typed into where it stands. Its look, while a cell
   is not being typed in, is the reading view's — the core renders it
   ([0026](0026-core-ui-contract-inviolable-rules.md)).
2. **The keys:** Tab and Shift-Tab go from cell to cell (past the last cell,
   a new row); Enter goes to the cell below (under the last row, a new row);
   the arrows go to the neighbouring cell and leave the table at its edges;
   Esc leaves it for the line after; Backspace in an empty cell of an
   empty row removes the row. The arrows bring the caret into a table from
   the line above or below.
3. **`+` under the table adds a row, `+` beside it a column.** A cell's menu
   (right click) inserts a row above or below and a column left or right,
   deletes the row or the column, and aligns the column left, centred or
   right (`:---`, `:---:`, `---:`).
4. **The file stays Markdown:** every change writes the table back aligned,
   as one step of the editor's undo, with the smallest change to the text.
   A `|` typed in a cell is written `\|`. A new table's header is empty.
5. **Only a table that can be written back whole is edited this way:** on
   lines of its own, outside a list or a quote, every row between pipes.
   Any other table keeps the behaviour it had. Source mode shows the text.
6. **A column's width is dragged at the right edge of its header cell**,
   in Edit mode and in Reading, and **kept by Verso, never in the file**
   (2026-10-07): the Markdown stays a table Obsidian reads as before. It is
   kept per folder, note and table — the table named by its place among
   the note's tables and its number of columns, so a table that gains or
   loses a column starts again at its natural widths — and it follows the
   note when the note is renamed or moved.

## Consequences

- `app/ui/src/table.ts` gains the table as a grid (pure, unit-tested);
  `app/ui/src/tableEditor.ts` is the widget; `live.ts` draws it.
- The cell being typed in is never redrawn while it has the focus, so a dead
  key's accent is composed in place.
- e2e tests in `app/ui/e2e/tables.spec.mjs`; changelog and walkthrough in
  both languages.
- Authorship: Opus 5.5, UI author by [ADR 0032](0032-author-and-reviewer-roles.md);
  the reading before the merge is the maintainer's to assign (Fable is not
  used, by their word of 2026-10-06).

## Discarded alternatives

- The Markdown text kept, but aligned as one types, in the text's face and
  with an empty header — offered with this record; the maintainer chose the
  table.

## Status

Accepted (2026-10-06): the maintainer, in session, choosing "Sempre como
tabela" among the two options put to them.
