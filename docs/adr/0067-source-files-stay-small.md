# ADR 0067 — Source files stay small: a module map and a size limit

- Date: 2026-10-07
- Source: the maintainer, in session: "a gente tem arquivos de códigos de
  mais de 13 mil linhas, com certeza vai ficar maior ainda. proponho uma
  reorganização, limpeza desse código" (we have code files of more than
  13 thousand lines, and they will surely grow; I propose a reorganization,
  a cleanup of this code). Asked when, how far and whether to keep a rule,
  they chose: on top of the stack of unmerged branches; every file above
  about 1500 lines; an ADR and a guardrail.
- Related: [0028](0028-crate-structure.md) (the crates, which this does not
  change), [0029](0029-guardrails-in-ci.md) (the guardrails, which gain one),
  [0032](0032-author-and-reviewer-roles.md) and
  [0033](0033-pr-workflow.md) (a pull request the maintainer can explain).
- Status in the briefing: not present

## Context

On 2026-10-07 the window's `app/ui/src/main.ts` held 13,440 lines and about
300 functions and classes, with 37 module-level variables that any of them
could change. It had been 7.1k lines at v0.2.0-beta.2 and 12.8k on
2026-10-03, when the maintainer first asked for it to be split. Five more
files were past 1500 lines: `app/src-tauri/src/lib.rs` (4121),
`app/ui/src/board/view.tsx` (3198), `crates/verso-core/src/lib.rs` (3166),
`app/ui/style.css` (3036) and `crates/verso-core/tests/workspace.rs` (2052).

A file that size is read in fragments, by a person or a model: the focuses'
bugs of 2026-10-03 came from state set far from where it was read. A
reviewer receives a diff in a file nobody can hold whole; two agents
working at once collide in it; and a pull request that touches it is
harder for the maintainer to explain, the condition for merging
([0033](0033-pr-workflow.md)).

## Decision

1. **A limit of 1500 lines per source file.** It counts every line of each
   tracked `.rs`, `.ts`, `.tsx`, `.js`, `.mjs` and `.css` file under
   `crates/`, `app/` and `scripts/`, tests included. Outside it: generated
   files (`app/ui/src/bindings.ts`, `app/ui/src/demoVault.ts`), data
   (`.json`), lockfiles and documents.
2. **A workspace guardrail checks it**, `scripts/check-sizes.mjs`, run by
   `scripts/check.sh` and by the pull request's Linux job. A file past the
   limit fails. A file can only be let past it by a line in
   `scripts/size-exceptions.txt`, with its size and why; the check fails if
   such a file grows beyond the size written there, or falls under the
   limit with its line still there — the list only shrinks. It starts
   empty.
3. **The window's code by area.** `main.ts` keeps the start-up: it wires
   the window and holds no area's logic. The areas go in modules beside the
   ones that already exist (`board/`, `bases/`, `blocks/`, `live.ts`,
   `props.ts`…): the leaves (a note, a picture, a board, a folder, a PDF,
   the graph), the layout (panes, splits, spaces), the side panels, the
   file tree and its order, the focuses, the dialogs (switcher, palette,
   replace, bug report, settings), the menus, the keys and the strings of
   each language.
4. **Rust by area.** A crate's `lib.rs` keeps its types, its errors and its
   module list; the `impl` of a large type is split into child modules by
   area (an `impl` block may live in any module of the crate). The desktop
   host's commands go in modules by area. A test file is split by subject.
5. **The stylesheet by area.** `style.css` becomes a list of `@import`s of
   `app/ui/css/<area>.css`, bundled into one `style.css` at build time, so
   the window still loads one stylesheet.
6. **Moving and cleaning apart.** The reorganization moves code without
   changing what it does, so that a reviewer can check a move as a move
   (`git diff --color-moved`); cleanup — dead code, duplicates, state made
   local to its module — goes in commits of its own. The safety net is the
   existing one: the type check, the unit tests, the end-to-end tests in
   the browser harness and the Rust tests, green at every commit.

## Consequences

- The reorganization is one pull request, on top of the stack of branches
  not yet merged (`feat/focuses` … `feat/mcp-widened`), merged last. While
  it is open, no other work edits the files it moves.
- `CLAUDE.md` (and its mirror) gains the guardrail's row, and
  [0029](0029-guardrails-in-ci.md) a revision line.
- A new area of the window, or one that outgrows its file, gets its own
  module rather than growing another one past the limit.
- Authorship: Opus 5.5. The Rust part is core code, by
  [0032](0032-author-and-reviewer-roles.md) Fable 5.1's; the maintainer asked
  on 2026-10-06 that Fable not be used: a deviation, with a reading before
  the merge for the maintainer to assign.

## Discarded alternatives

- **After the stack is merged, from a clean `main`.** Put to the maintainer;
  safer against conflicts, slower. Not chosen.
- **Only `main.ts`.** Put to the maintainer; not chosen.
- **An ADR without a check, or no rule at all.** Put to the maintainer; not
  chosen.

## Status

Accepted (2026-10-07): the maintainer, in session, choosing the options
above.
