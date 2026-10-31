# ADR 0068 — Templates chosen in a new note, as in Notion

- Date: 2026-10-07
- Source: the maintainer's backlog (2026-09-24), quoting a user's feedback:
  "a capacidade de fazer espécies de templates de modo mais fácil, igual no
  notion — até tem lá, mas é meio estranho". Asked how a template should be
  chosen when a note is made, the maintainer chose "na nota nova, como o
  Notion" on 2026-10-07.
- Related: [0048](0048-file-operations-in-ui.md) (creating notes),
  [0060](0060-makemd-organizing-features.md) (a folder's `items_template`),
  [0035](0035-cross-cutting-requirements.md) (languages, accessibility).
- Status in the briefing: not present

## Context

Templates already exist: the notes of the templates folder (Settings ›
Templates, `Templates` by default), inserted at the caret by `/` › Insert
template, made by Save as template, and given to every note a folder makes
by its folder note's `items_template` (ADR 0060). What was missing is the
moment Notion offers them: when a page is new and empty. In Verso a new
note was always its title alone, and a template a separate step.

## Decision

Written by the author from the maintainer's choice above, and accepted by
it (Status).

1. **A note made in the window** — ⌘N, the tree's and a folder page's New
   note — **opens with "Start with" under its title**: "Blank", then each
   note of the templates folder by its name, in name order. With no
   template in that folder, nothing is shown: the note is as before.
2. **Choosing a template puts its text in the note**, `{{date}}` and
   `{{title}}` filled as Insert template fills them, as one step of the
   editor's undo; the note is saved as any edit is (atomic, over the
   revision it was read at). The template's own note does not change.
3. **"Blank", Esc, or typing in the note put the list away**, and it does
   not come back for that note; putting it away writes nothing.
4. **A folder's `items_template` keeps its choice:** a note it makes is made
   from it, as before, and shows no list.
5. **Accessibility:** the list is a group named "Start with"; its choices
   are buttons, reached with Tab after the title, ↑ and ↓ between them,
   Enter to choose and Esc to put it away; after a choice the caret is in
   the note's text. The words are the interface's language.
6. **Where the list looks for templates** (R.1, option A, `[DECIDED
   2026-10-21]`). The item 1 above speaks of "the templates folder" of
   Settings only. As built (`app/ui/src/templatePicker.ts`), the list also
   looks in folders named `Modelos` or `Templates` **above the new note**
   (up the path of its folder) and in a `Modelos` folder at the root. The
   maintainer kept it and asked that it be recorded here: the templates of a
   project made by the assistant are valid inside that project. Option B,
   only the Settings folder, as the item first said, was not chosen: more
   predictable, but each project's templates would stop showing up by
   themselves.

The file stays Markdown: a note made from a template is an ordinary note
for Obsidian.

## Consequences

- `app/ui/src/templatePicker.ts` draws the list under a new note's title;
  `createNote` (`files.ts`) offers it when no folder template applied.
- The demo vault's note on templates, the walkthrough and the changelog say
  so; end-to-end tests make notes from the tree and from ⌘N.
- Authorship: Opus 5.5 (UI and TypeScript, ADR 0032: the author's part).

## Discarded alternatives

- **A picker when creating** (⌘N opens a list before the note exists) — put
  to the maintainer; not chosen.
- **A separate command** ("New note from template…", ⌘N staying blank) —
  put to the maintainer; not chosen.

## Status

Accepted (2026-10-07): the maintainer, in session, choosing the option
above. Item 6 added on 2026-10-21 by the maintainer's answer R.1 (option A),
recording what was built.
