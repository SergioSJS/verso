# ADR 0106 — Structured data as a diagram: JSON and YAML drawn as boxes to move, fold and follow back to the text

- Date: 2026-10-20
- Source: the maintainer, 2026-10-20, on [JSON Crack](https://github.com/AykutSarac/jsoncrack.com)
  (Apache-2.0): *"eu vi um app que exibe json de um jeito fantástico … a
  gente pode absorver isso? podemos aproveitar o código? a licença é
  compatível?"* (I saw an app that shows JSON in a fantastic way … can we
  absorb it? can we reuse the code? is the licence compatible?). Offered
  three roads — port its idea with our own drawing, take its React
  component whole, or the idea alone — he answered: *"gosto do A, mas não
  sei se svg seria a melhor opção, pq seria legal ser possível mover as
  caixas pra reorganizar, minimizar ou expandir ramos e tal, parece que é
  compatível com yaml tb, explore melhor aí e faça um adr bacana"* (I like
  A, but I'm not sure SVG is the best option, because it would be nice to
  move the boxes to rearrange them, fold or unfold branches and so on; it
  seems YAML fits too; explore it and write a good ADR). Written by Opus 5.5;
  to be read by the other model before it is accepted
  ([0032](0032-author-and-reviewer-roles.md)).
- Related: [0012](0012-files-are-source-of-truth.md),
  [0029](0029-guardrails-in-ci.md) (licence allowlist),
  [0035](0035-cross-cutting-requirements.md),
  [0049](0049-phase-2-scope-widened.md) (files that are not notes),
  [0057](0057-board-json-canvas.md) (the board, a JSON Canvas file),
  [0072](0072-window-controls-in-the-app.md) (zoom gestures),
  [0082](0082-live-co-editing-of-a-synced-folder.md),
  [0103](0103-feature-presets-and-capability-flags.md) (feature switches).
- Status in the briefing: not present.
- Revisions: 2026-10-21 — the maintainer marked the options of the decisions
  questionnaire of 2026-10-20 (answered 2026-10-21), 0106.1 to 0106.10, all
  as recommended except 0106.5, where he chose "all now": every
  `[PROPOSED]` becomes `[DECIDED 2026-10-21]`, item 12 is closed, the
  formats of item 3 widen to seven, and the ADR is Accepted. It enters V1
  as roadmap row V.30, after wave D. 2026-10-21, later — the maintainer
  answered D.1 to D.4 of the decisions list of 2026-10-21, all option A
  (items 8, 9 and 12, Status).
  2026-10-22 — T.5, "Outra" (the maintainer answered the decisions list of the
  afternoon of 2026-10-21 (`verso-decisoes-pendentes-2026-10-21-tarde.md`) on
  2026-10-22), on the board's file card: *"A mas não seria possível ter opção
  de mostrar textou ou modo diagrama?"* (A, but couldn't there be an option to
  show text or diagram mode?). A is the card showing the text of **every text
  file** (`.txt`, `.css`, `.js`, `.py`…, cut at 64 KB); his addition is a
  **Text | Diagram switch on the card, for files this ADR can read as a
  diagram**. Both are **being built**. Option B (only the diagram's formats)
  was not chosen.

## Context

A `.json` or `.yaml` file opens in Verso today as text, in the source
editor, editable and saved like a note. Reading a large or deep one as text
is hard: where a branch ends, how many items an array holds, what sits
three levels down. JSON Crack draws the same data as boxes joined by lines:
one box per object or array, a row per plain value, a line to a child box
for every value that is itself an object or an array, labelled by its key.

What its code is, read on 2026-10-20 (`packages/jsoncrack-react`,
Apache-2.0, no NOTICE file):

- **The parser** (`src/parser.ts`, 227 lines) walks `jsonc-parser`'s tree
  into nodes and edges, the model above. Small, portable.
- **The drawing** is `reaflow`, a React library whose layout engine is
  `elkjs` — licensed **EPL-2.0 OR GPL-3.0-or-later**, neither on the
  allowlist of [0029](0029-guardrails-in-ci.md); `reaflow` also pulls a UI
  kit (`reablocks`) and an animation library. Boxes are SVG holding HTML
  (`foreignObject`), edges SVG, no virtualization.
- **What it does not do**: boxes cannot be moved (dragging is switched
  off); every fold lays the whole graph out again; past 1,500 boxes (1,200
  on the site) it stops and offers the paid product, ToDiagram; search
  matches only the boxes on screen, so a folded branch is never found;
  nothing works from the keyboard; its open issues include a stack
  overflow at about 2,500 lines and a crash on deep nesting.
- **Formats** on its site: JSON, YAML, XML and CSV, each converted to a
  JavaScript object first — which loses the position of each value in the
  text and rounds large numbers.

Verso already holds what a viewer of its own needs, with no new
dependency: the `yaml` library (ISC), which keeps where each value sits in
the text, its anchors, aliases and documents; CodeMirror's JSON and YAML
grammars (`@lezer/json`, `@lezer/yaml`, MIT), which tolerate a file being
typed; a graph view drawn in SVG whose nodes are already dragged, zoomed
and panned (`app/ui/src/leaves/graph.ts`); and a
board whose file format is JSON Canvas.

## Decision

Accepted (2026-10-21). Items marked `[DECIDED 2026-10-20]` are the
maintainer's words above; `[DECIDED 2026-10-21]` marks what he decided by
marking an option in the questionnaire of 2026-10-20 (0106.1 to 0106.10),
which was the recommendation of this text unless the item says otherwise.
Nothing is left `[PROPOSED]` or `[OPEN]`.

1. **A viewer of our own, from JSON Crack's idea.** `[DECIDED 2026-10-20]`
   (road A). The box-and-line model above, our drawing, our layout, in the
   window's own TypeScript — no React, no `reaflow`, no `elkjs`. Where a
   piece of JSON Crack's code is carried over, its file keeps the
   Apache-2.0 notice and says what changed; the credits page names JSON
   Crack either way.

2. **Moving boxes and folding branches.** `[DECIDED 2026-10-20]`. A box is
   dragged by pointer or finger; a branch folds and unfolds from its box.
   `[DECIDED 2026-10-21]` (0106.8, option A): dragging a box carries what
   hangs under it (as in a mind map); with Alt it moves alone. A folded box says how much it hides
   ("12 keys", "340 items"). Fold all, unfold all, unfold to a depth, and
   "Arrange again", which drops the moves (and the folds kept for the
   file, item 12).

3. **JSON and YAML.** `[DECIDED 2026-10-20]`. `[DECIDED 2026-10-21]`
   (0106.10, option A) for YAML: each
   document of a multi-document file is a root of its own; an alias is a
   line to the box of its anchor, never a copy (so a file built to expand
   into millions of values — the "billion laughs" — draws as a few boxes);
   a tag shows as a small label; comments are not drawn.
   **More formats** `[DECIDED 2026-10-21]` (0106.5, **option C — "all
   now"**, not the recommended A): besides JSON and YAML, JSON with
   comments (`.jsonc`), JSON lines (`.jsonl`, logs), **TOML, XML and CSV**
   are drawn from the start. TOML and XML need a parser each: a dependency
   for each is justified in the PR that builds it, with its licence on the
   allowlist ([0029](0029-guardrails-in-ci.md)). A CSV, which already opens
   as a table, is drawn here as a list of records (one box per row, a row of
   the box per column), not as a tree of its own.

4. **The drawing: HTML boxes over SVG lines.** `[DECIDED 2026-10-21]`
   (0106.7, option A) — the
   maintainer's doubt about SVG answered. Moving and folding do not depend
   on the technology; the graph already drags SVG nodes. What decides is
   the box: as HTML, a box is text that wraps, can be selected and copied,
   takes the theme's tokens, holds the focus and is read by a screen
   reader; the lines under it are SVG; the whole is one layer zoomed and
   panned as the graph is. All-SVG boxes need `foreignObject` for wrapped
   text, which WebKit rasterises at layout size when zoomed (the blur found
   on the board's pictures, 2026-10-20). A canvas draws the most boxes but
   blurs on zoom unless redrawn, selects no text, and needs a second,
   hidden structure for keyboards and screen readers. Only the boxes in
   view are in the page (item 9).

5. **Layout: a tidy tree, ours.** `[DECIDED 2026-10-21]` (0106.10, option
   A). JSON and YAML are trees
   (an alias is an extra line, not a branch), so a tree layout of a few
   hundred lines replaces a general graph engine; laying out again after a
   fold is linear and fast. Left to right by default, top to bottom as an
   option. A moved box keeps where it was put while the rest is laid out
   around the tree.

6. **The diagram and the text, side by side.** `[DECIDED 2026-10-21]`
   (0106.10, option A). Selecting a
   box selects its range in the text, and the caret in the text marks its
   box — the parsers keep each value's place, which JSON Crack loses.
   Copy a box's path (`$.npcs[3].name`) or its value. A number is shown as
   written (`12345678901234567890`, not rounded).

7. **Search over everything.** `[DECIDED 2026-10-21]` (0106.10, option
   A). Keys and values, in the data,
   not on screen: a match inside a folded branch unfolds the way to it.
   Next and previous, the count, Esc.

8. **Read-only.** `[DECIDED 2026-10-21]` (0106.10, option A). The diagram never writes the file
   ([0012](0012-files-are-source-of-truth.md)); the text is edited in the
   text view. Editing a value from its box would go through the editor,
   with the stale check (invariants 8 and 11); it is not in this ADR. One command does write, and writes a **new** file:
   **"Save as board"** `[DECIDED 2026-10-21]` (0106.4, option A) turns the
   diagram as arranged into a board (`.canvas`, JSON Canvas: text cards and
   links, which Obsidian opens too), shown before it is written, never
   replacing a file ([0057](0057-board-json-canvas.md)); from then on it is
   an ordinary board. `[DECIDED 2026-10-21]` (D.3, option A): "Save as board"
   **refuses a diagram of more than 2000 cards** and asks to fold branches
   first (a number chosen by the review, kept by the maintainer).

9. **Limits and hostile files.** `[DECIDED 2026-10-21]` (0106.10, option
   A). Walking the data never
   recurses on the call stack (deep nesting cannot overflow it). A file
   opens with its first levels unfolded up to about 300 boxes, the rest
   folded; only the boxes in view are drawn, so the limit is the data's
   size, not the box count (a diagram is offered up to 20 MB of text,
   past that the text view only). Every key and value is set as
   text, never as HTML; a long string is cut with its full value on
   request. `[DECIDED 2026-10-21]` (D.1, option A): **above 200,000 boxes the
   file opens as text**, with a notice saying why. The review classified the
   lack of a cap as IMPORTANT (a hostile file brought the window down); the
   maintainer kept the cap. Option C, no box cap and only the 20 MB, was not
   chosen.

10. **Live.** `[DECIDED 2026-10-21]` (0106.10, option A). When the text changes — typed, from a room
    ([0082](0082-live-co-editing-of-a-synced-folder.md)) or on disk — the
    diagram follows after a pause, keeping folds and moves by each box's
    path. Text that does not parse keeps the last diagram that did, with a
    line naming the error and a link to its place.

11. **Accessibility and languages** ([0035](0035-cross-cutting-requirements.md)).
    `[DECIDED 2026-10-21]` (0106.10, option A). The diagram is a tree to assistive technology, in the
    data's order, not the screen's: arrows go to parent, child and
    sibling, Enter or Space folds, and the text view is one key away. Every
    drag has a keyboard twin (Alt with the arrows moves the focused box),
    for WCAG 2.5.7. Reduced motion: no animation. Words in pt-BR and EN.

12. **When, where it appears, what is kept, the switch.** `[DECIDED
    2026-10-21]`, all option A:
    - **In V1** (0106.1), as roadmap row V.30, after wave D.
    - **Where it appears** (0106.2): in a `.json`, `.yaml` (or any format of
      item 3) file, a "Text | Diagram" switch at the top of the tab, as HTML
      pages already have; in a ```` ```json ```` or ```` ```yaml ```` block of
      a note, a "View as diagram" button that opens it in a tab beside. The
      note itself does not change and the diagram has room.
    - **Moves and folds are kept on this device, per file** (0106.3); "Arrange
      again" erases them. They are not written to the folder, and another
      person sees the automatic arrangement; to share one, "Save as board"
      (item 8).
    - **A switch**, "Data diagram", in Settings › App › Features, on by
      default like the other switches of
      [0103](0103-feature-presets-and-capability-flags.md) (0106.6); off, no
      button of the diagram appears. `[DECIDED 2026-10-21]` (D.2, option A):
      switching it off also **closes the diagram tabs already open**, including
      one opened from a ```` ```json ```` block of a note; "off is off".
    - **Which view opens first** (0106.9): the text the first time; after
      that, the last one used for that kind of file.

## Consequences

- `app/ui/src/datagraph/`: the model (parsed text to boxes and lines, with
  each value's range), the layout, the view (layer, boxes, lines, culling,
  drag, fold, search), and their tests over CodeMirror-free inputs; a
  mode switch on the text tab beside the source editor.
- No new dependency for JSON and YAML: `yaml` and the `@lezer` grammars are
  in the tree already. TOML and XML need a parser each (item 3): a
  dependency for each, justified in the PR that builds it, with its licence
  on the allowlist; JSON with comments, JSON lines and CSV are expected to
  need none, to be confirmed when built.
- The switch of item 12 is added to [0103](0103-feature-presets-and-capability-flags.md).
- The credits page gains JSON Crack.
- An end-to-end test drags a box, folds a branch, finds a value inside a
  folded one, and walks the tree by keyboard, in WebKit and Chromium.

## Discarded alternatives

- **JSON Crack's React component whole** (`jsoncrack-react`): considered
  with the maintainer on 2026-10-20. It needs `elkjs` (EPL-2.0 or GPL-3.0,
  off the allowlist), React and `reaflow`'s tree in the window, and brings
  the missing drag, the cap and the keyboard gap with it.
- **The idea alone, no code of theirs**: considered with the maintainer on
  2026-10-20; he chose A, which may carry their parser's model over with
  its notice.

Besides, refused by the maintainer's marks in the questionnaire of
2026-10-20: after V1 (0106.1, B); only files, or the diagram drawn inside
the note (0106.2, B and C); moves kept in the folder, or not kept (0106.3, B
and C); no "Save as board" for now (0106.4, B); only JSON and YAML, or TOML,
XML and CSV later (0106.5, B and A); no switch (0106.6, B); all-SVG or a
canvas (0106.7, B and C); moving only the box (0106.8, B); always the
diagram or always the text (0106.9, B and C).

## Status

Accepted (2026-10-21). Items 1 to 3 in the maintainer's words of
2026-10-20, the rest by his marks of 2026-10-21.

As built 2026-10-21, on `feat/rpg-tools` (not pushed, not released):
`2db25eb7` (the model, the parsers, the tidy-tree layout, the state and
the search), `96ed0e2d` (the switch in Settings > Features), `71e77390`
and `be77ad76` (the view, the tab, the Text | Diagram switch, "View as
diagram" on a code block), `2be226ea` (end-to-end tests), `558b6659` (the
tutorial note, samples, credits, changelog), `34aaba1b` (a review pass
against this ADR), `f60c59b0` and `d71b5dc8` (lazy chunk, live switch);
merged by `59a2e894` and `2ebbbfc4`.

As-built note, **not a decision of the maintainer's**: the code also parses
**TSV** (a CSV with tabs) as CSV with tabs, an eighth format beside the
seven of item 3 (`app/ui/src/datagraph/parse.ts`; commit `2db25eb7` says
"eight formats"). No one decided it; it is recorded here so that it is
either confirmed or dropped. **Confirmed on 2026-10-21** by the maintainer
(D.4, option A): the diagram keeps reading `.tsv`, the same reader as CSV.
