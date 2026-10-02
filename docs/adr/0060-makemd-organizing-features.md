# ADR 0060 — make.md's organizing features as Verso primitives

- Date: 2026-10-02
- Source: the maintainer, 2026-10-02: "pensei de já fazermos as
  funcionalidades do plugin make.md do obsidian, dito isso, investigue,
  extraia as funcionalidades e planeja exatamente como fazer, considerando
  configurações e tal" (I thought we would do the features of Obsidian's
  make.md plugin now: research them, extract them and plan exactly how,
  settings included). The memo that answered it,
  [`docs/reference/makemd-decision.md`](../reference/makemd-decision.md),
  decisions D1–D13; the maintainer's answer the same day: "Aceito todas
  (Recomendado)" (every recommendation accepted), and, on observing make.md
  in Obsidian, "Pode, no Sandbox (Recomendado)".
- Status in the briefing: not present

## Context

make.md is an Obsidian plugin (MIT, 1.3.5) that makes folders and tags feel
like places: labels, a page per folder, manual order, pins, a database per
folder, and editing an embedded note where it is. Half of it Verso already
has under other names — the views over the folder
([0053](0053-views-bases.md)), the `/` menu, templates, the folder page.
[ADR 0003](0003-primitives-not-workarounds.md) asks that what needs a
plugin become a primitive; [ADR 0013](0013-degrades-to-markdown.md) forbids
the part of make.md that keeps its data in SQLite inside the folder from
becoming Verso's truth. The memo maps every feature (its tables L, N, F, T,
C, E, X) and every setting (its appendix A).

## Decision

1. **Scope (D1).** Phase 2 is widened, as it was for the views and the
   board, for four slices: **S1** labels, **S2** folder pages, **S3** order,
   pins and hide, **S4** editing an embedded note in place. **S5** (tag
   pages, renaming a tag) and **S6** (importing make.md's `.space/` files)
   are decided after S4 is in use. The Phase 2 exit gate does not change.
2. **Compatibility (D2).** The frontmatter is shared with make.md: the keys
   `sticker`, `color`, `banner`, `banner_y` and `aliases`, with make.md's
   values (`emoji//1f3b2`, `lucide//home`, `ui//home`). Nothing under a
   `.space/` folder is ever written; S6, when decided, reads `def.json`,
   `waypoints.json` and `context.mdb` on the user's command, through
   `verso-fs`, the SQLite opened in memory.
3. **A folder's labels (D3)** live in its folder note's frontmatter, with
   the same keys as a note's. A folder with no folder note gets one when it
   is first labelled, after the window asks.
4. **Manual order (D4)** is `order:` in the folder note's frontmatter: a
   list of names relative to the folder; items not listed come after, in
   the tree's sort. The rename and move plans rewrite `order:` — new core
   work of S3. Ordering a folder with no folder note asks before creating
   one.
5. **Pins (D5)** are `pinned:` in the folder note's frontmatter, a list of
   quoted wikilinks; by [ADR 0057](0057-board-json-canvas.md) they form a
   typed relation `pinned`, which is intended. Focuses wait for
   [ADR 0041](0041-multi-root-workspace.md). Bookmarks stay as they are.
6. **Words (D6).** "Folder page" / *página da pasta* and "tag page" /
   *página da tag*. "Space" stays the workspace (*área*).
7. **A folder page's table (D7).** Every folder page shows a table of its
   items: an unsaved base over the folder, its columns the properties the
   items use, written as a `.base` the first time the user changes it.
8. **Editing an embed in place (D8).** A `![[Note]]` embed is edited where
   it is, in Edit and in Reading, with the editor the board puts in a card:
   the same save, the same conflict check (invariant 11). No new syntax;
   make.md's `![![Note]]` is not read until observation O9 and a question
   of the spec.
9. **The block compositor (D9)** — make.md's buttons, columns, ratings,
   kept in SQLite — waits for the month of use.
10. **Tags (D10).** Tag pages, and renaming or deleting a tag across the
    notes as a plan of diffs ([0048](0048-file-operations-in-ui.md)'s rule) —
    in S5.
11. **Stickers (D11)**: emoji and Lucide (`lucide-static`, ISC); `ui//`
    names shown as their Lucide twin where one exists, else as the item's
    default icon. Stickers from SVG files of the folder, later.
12. **Settings (D12)**: a section "Organizing" (*Organização*) with the ten
    settings of the memo's D12 table and its defaults, and no others. The
    frontmatter keys are not settings.
13. **Observation (D13)**: the memo's O1–O12 are run in Obsidian before S3,
    with make.md 1.3.5 installed in the Sandbox vault only, in a throwaway
    folder, and removed afterwards; the results go to
    [`docs/reference/obsidian-observations.md`](../reference/obsidian-observations.md)
    ([ADR 0009](0009-external-constraints.md): make.md is a third party's
    plugin; nothing of the Obsidian app is inspected).

The frontmatter keys Verso adds — `order:`, `pinned:`, `items_sticker:`,
`items_color:`, `items_template:` — are Verso's extensions to Obsidian's
files (invariant 12: new keys, no changed meaning), each recorded in the
spec in the slice that brings it.

## Consequences

- Each slice is a pull request of its own, with this ADR revised if
  anything in it changes, its changelog lines in both languages, its
  demo-vault lesson and walkthrough steps
  ([0058](0058-demo-vault-as-tutorial.md)), e2e tests seen failing before
  the change, and `scripts/check.sh` and `scripts/check-linux.sh` green.
- "Hide from the tree" (S3) is a list in Verso's configuration that the tree
  alone filters; it is **not** [ADR 0044](0044-verso-fs-semantics.md)'s
  ignored paths, which make a note unreachable.
- [ADR 0049](0049-phase-2-scope-widened.md) §3: its line "make.md's
  Contexts" no longer holds — the views were [0053](0053-views-bases.md),
  this ADR the rest.
- **Authorship.** The maintainer delegated the implementation to
  Antigravity on 2026-10-02 ("vou delegar para o antigravity implementar o
  make md"): a deviation from [ADR 0032](0032-author-and-reviewer-roles.md)'s
  roles, recorded here. Each pull request is read by a Claude model (Fable
  5.1, or Opus where Fable is unavailable) in a session of its own before
  the merge.

## Discarded alternatives

From the memo, each weighed by the maintainer:

- Reading and writing all of make.md's files, `.space/` and its SQLite
  included (D2) — breaks ADR 0013 and makes make.md's internals a contract.
- Ignoring make.md (D2) — a vault labelled in Obsidian would lose its labels.
- A folder's labels in a file of Verso's inside the folder, or in Verso's
  configuration (D3).
- A `rank:` in every note (D4) — one drag writes every sibling, and a PDF or
  a subfolder cannot hold a key; the order in Verso's configuration (D4) —
  lost on another machine.
- Pins in Verso's configuration (D5).
- Renaming workspaces to take "space" (D6).
- Only a ` ```base ` block the user adds, with no default table (D7).
- make.md's `![![Note]]` syntax (D8) — a new construct of the dialect.
- A subset of the block compositor as Markdown now (D9).
- Emoji only (D11).

## Status

Accepted (2026-10-02).
